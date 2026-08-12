// entities.js — game tick, dwarf movement

function gameTock(now) {
  if (now - lastTick < TICK_MS) return;
  lastTick = now;
  gameTick++;
  tickFarms();
  // Wake sleeping dwarves at dawn
  if (timeOfDay() < (1 / DAY_LENGTH)) {
    for (const d of dwarves) {
      if (!d.sleeping) continue;
      d.sleeping = false;
      if (d.sleepTarget) { d.sleepTarget.claimedBy = null; d.sleepTarget = null; }
      d.job = 'Idle';
    }
  }
}

const MOVE_INTERVAL = 150;
let lastMove = 0;
let pendingChunkTransition = null;

// Path dwarf toward the correct map edge to reach owTarget's chunk
function _stepOwTravel(d, curWx, curWy) {
  const tx = d.owTarget.wx, ty = d.owTarget.wy;
  // Pick the axis with the largest delta first
  const dx = tx - curWx, dy = ty - curWy;
  let edgeR = d.r, edgeC = d.c;
  if (Math.abs(dx) >= Math.abs(dy)) {
    edgeC = dx > 0 ? COLS : -1;
  } else {
    edgeR = dy > 0 ? ROWS : -1;
  }
  // Clamp to a passable row/col on the edge
  const fixedC = Math.max(0, Math.min(COLS - 1, edgeC === -1 ? 0 : edgeC === COLS ? COLS - 1 : edgeC));
  const fixedR = Math.max(0, Math.min(ROWS - 1, edgeR === -1 ? 0 : edgeR === ROWS ? ROWS - 1 : edgeR));
  // For background chunks use cached/generated surfaceZ
  let sz;
  if (curWx === owCurX && curWy === owCurY) {
    sz = surfaceZ;
  } else {
    const cached = chunkCache.get(`${curWx},${curWy}`);
    sz = cached ? cached.surfaceZ : generateChunk(curWx, curWy, overworld[curWy][curWx].biome).surfaceZ;
  }
  const targetZ = sz[fixedC][fixedR];
  // Walk straight to the edge tile (no A* needed for overworld travel — just set path as single step sequence)
  // Build a simple straight-line path on the surface
  const path = [];
  let r = d.r, c = d.c;
  const stepR = fixedR > r ? 1 : fixedR < r ? -1 : 0;
  const stepC = fixedC > c ? 1 : fixedC < c ? -1 : 0;
  for (let i = 0; i < COLS + ROWS; i++) {
    if (r === fixedR && c === fixedC) break;
    if (r !== fixedR) r += stepR;
    else c += stepC;
    path.push({ z: sz[c] ? sz[c][r] ?? d.z : d.z, r, c });
  }
  d.path = path.length ? path : null;
  d.job = d.path ? 'Walking' : 'Idle';
}

function stepDwarves(now) {
  if (now - lastMove < MOVE_INTERVAL) return;
  lastMove = now;
  assignEatJobs();
  if (isNight()) assignSleepJobs();
  assignDigJobs();
  assignDigStairJobs();
  assignChopJobs();
  assignDestroyJobs();
  assignHaulJobs();
  assignBuildJobs();
  assignFarmJobs();
  for (const d of dwarves) {
    if (d.dead) continue;
    if (d.wx !== owCurX || d.wy !== owCurY) {
      // Still process cross-chunk travel for off-screen dwarves
      if (!d.owTarget) continue;
      if (!d.path || d.path.length === 0) {
        if (d.wx === d.owTarget.wx && d.wy === d.owTarget.wy) {
          d.owTarget = null; d.job = 'Idle';
        } else {
          _stepOwTravel(d, d.wx, d.wy);
        }
        continue;
      }
      const next = d.path.shift();
      d.r = next.r; d.c = next.c; d.z = next.z;
      let nwx = d.wx, nwy = d.wy;
      if      (d.c < 0)    { nwx--; d.c = COLS - 1; }
      else if (d.c >= COLS){ nwx++; d.c = 0; }
      else if (d.r < 0)    { nwy--; d.r = ROWS - 1; }
      else if (d.r >= ROWS){ nwy++; d.r = 0; }
      if (nwx !== d.wx || nwy !== d.wy) {
        if (nwx >= 0 && nwx < OW_COLS && nwy >= 0 && nwy < OW_ROWS) {
          d.wx = nwx; d.wy = nwy;
          const cached = chunkCache.get(`${nwx},${nwy}`);
          const sz = cached ? cached.surfaceZ : generateChunk(nwx, nwy, overworld[nwy][nwx].biome).surfaceZ;
          d.z = sz[d.c][d.r];
          d.path = null;
          if (nwx === d.owTarget.wx && nwy === d.owTarget.wy) {
            // Arrived — but can't A* outside current chunk, so just mark arrived and let pendingChunkTransition handle final path when viewed
            d.owTarget = null; d.job = 'Idle';
          } else {
            _stepOwTravel(d, nwx, nwy);
          }
        }
      }
      continue;
    }
    // Gravity
    if (d.z > 0 && passable(d.z - 1, d.r, d.c) && map[d.z - 1][d.r][d.c] === 'AIR') { d.z--; continue; }
    // Sleeping dwarves — regen health if in bed, otherwise just wait
    if (d.sleeping) {
      if (!d.path || d.path.length === 0) {
        if (d.sleepTarget && d.r === d.sleepTarget.r && d.c === d.sleepTarget.c && d.z === d.sleepTarget.z)
          d.health = Math.min(100, d.health + 1);
        // else on ground, no regen
      } else {
        const next = d.path.shift();
        if (passable(next.z, next.r, next.c)) { d.z = next.z; d.r = next.r; d.c = next.c; }
        else { d.path = null; d.sleeping = false; d.job = 'Idle'; if (d.sleepTarget) { d.sleepTarget.claimedBy = null; d.sleepTarget = null; } }
      }
      continue;
    }
    if (!d.path || d.path.length === 0) {
      // Cross-chunk travel
      if (d.owTarget && (d.wx !== d.owTarget.wx || d.wy !== d.owTarget.wy)) {
        _stepOwTravel(d, d.wx, d.wy);
        continue;
      }
      if (d.eating && d.r === d.eating.r && d.c === d.eating.c && d.z === d.eating.z) {
        food.delete(`${d.z},${d.r},${d.c}`);
        d.health = Math.min(100, d.health + 30); d.eating = null; d.job = 'Idle';
      } else if (d.job === 'Sleeping') {
        d.sleeping = true;
      } else if (d.farmPlot && d.r === d.farmPlot.r && d.c === d.farmPlot.c && d.z === d.farmPlot.z) {
        spawnFood(d.z, d.r, d.c);
        d.farmPlot.stage = 0; d.farmPlot.claimedBy = null; d.farmPlot = null; d.job = 'Idle';
      } else if (d.digTarget) {
        if (digStairJobs.has(`${d.digTarget.z},${d.digTarget.r},${d.digTarget.c}`))
          finishDigStair(d);
        else
          finishDig(d);
      } else if (d.chopTarget) {
        finishChop(d);
      } else if (d.destroyTarget) {
        finishDestroy(d);
      } else if (d.buildJob) {
        stepBuild(d);
      } else if (d.job === 'Idle' && Math.random() < 0.05) {
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        const candidates = dirs.map(([dr,dc]) => ({ r:d.r+dr, c:d.c+dc }))
          .filter(t => passable(d.z, t.r, t.c) && !dwarves.some(o => o !== d && !o.dead && o.r===t.r && o.c===t.c && o.z===d.z));
        if (candidates.length) {
          const t = candidates[Math.floor(Math.random() * candidates.length)];
          d.r = t.r; d.c = t.c;
        }
      } else {
        stepHaul(d);
      }
      continue;
    }
    const next = d.path.shift();
    if (passable(next.z, next.r, next.c)) {
      d.z = next.z; d.r = next.r; d.c = next.c;
      // Edge travel — defer transition until after loop
      let nwx = owCurX, nwy = owCurY;
      if      (d.c < 0)    { nwx--; d.c = COLS - 1; }
      else if (d.c >= COLS){ nwx++; d.c = 0; }
      else if (d.r < 0)    { nwy--; d.r = ROWS - 1; }
      else if (d.r >= ROWS){ nwy++; d.r = 0; }
      if ((nwx !== owCurX || nwy !== owCurY) && nwx >= 0 && nwx < OW_COLS && nwy >= 0 && nwy < OW_ROWS) {
        pendingChunkTransition = { wx: nwx, wy: nwy, dwarf: d };
      }
    }
    else {
      d.path = null;
      if (d.digTarget)    { d.digTarget.claimedBy = null; d.digTarget = null; d.job = 'Idle'; }
      if (d.chopTarget)    { d.chopTarget.claimedBy = null; d.chopTarget = null; d.job = 'Idle'; }
      if (d.destroyTarget) { d.destroyTarget.claimedBy = null; d.destroyTarget = null; d.job = 'Idle'; }
      if (d.haulResource) { d.haulResource.claimedBy = null; d.haulResource = null; d.haulTarget = null; d.carrying = null; d.job = 'Idle'; }
      if (d.eating)       { d.eating.claimedBy = null; d.eating = null; d.job = 'Idle'; }
      if (d.buildJob)     { _cancelBuild(d); }
      if (d.farmPlot)     { d.farmPlot.claimedBy = null; d.farmPlot = null; d.job = 'Idle'; }
      if (d.sleepTarget)  { d.sleepTarget.claimedBy = null; d.sleepTarget = null; d.sleeping = false; d.job = 'Idle'; }
    }
  }
  // Repulsion: idle dwarves sharing a tile nudge to a free adjacent tile
  const occupancy = new Map();
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    const k = `${d.z},${d.r},${d.c}`;
    occupancy.set(k, (occupancy.get(k) || 0) + 1);
  }
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.job !== 'Idle' || d.path) continue;
    if ((occupancy.get(`${d.z},${d.r},${d.c}`) || 0) <= 1) continue;
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    const free = dirs.map(([dr,dc]) => ({ r:d.r+dr, c:d.c+dc }))
      .find(t => passable(d.z, t.r, t.c) && !occupancy.has(`${d.z},${t.r},${t.c}`));
    if (free) { d.r = free.r; d.c = free.c; occupancy.set(`${d.z},${free.r},${free.c}`, 1); }
  }
  // Apply deferred chunk transition after all dwarves have moved
  if (pendingChunkTransition) {
    const { wx, wy, dwarf } = pendingChunkTransition;
    pendingChunkTransition = null;
    dwarf.wx = wx; dwarf.wy = wy;
    if (wx === owCurX && wy === owCurY) {
      // Dwarf arriving in the viewed chunk — use live map
      dwarf.z = surfaceZ[dwarf.c][dwarf.r];
      dwarf.path = null; dwarf.job = 'Idle';
      if (dwarf.owTarget && wx === dwarf.owTarget.wx && wy === dwarf.owTarget.wy) {
        // Reached destination chunk — path to final tile
        const path = astar(dwarf.z, dwarf.r, dwarf.c, dwarf.owTarget.z, dwarf.owTarget.r, dwarf.owTarget.c);
        dwarf.path = path || null;
        dwarf.job = path ? 'Walking' : 'Idle';
        dwarf.owTarget = null;
      }
    } else {
      // Dwarf crossing a background chunk — peek at its surfaceZ without changing view
      const cached = chunkCache.get(`${wx},${wy}`);
      const sz = cached ? cached.surfaceZ : generateChunk(wx, wy, overworld[wy][wx].biome).surfaceZ;
      dwarf.z = sz[dwarf.c][dwarf.r];
      // Continue toward owTarget if set
      if (dwarf.owTarget) {
        _stepOwTravel(dwarf, wx, wy);
      } else {
        dwarf.path = null; dwarf.job = 'Idle';
      }
    }
  }
}
