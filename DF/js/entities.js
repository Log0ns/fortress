// entities.js — game tick, dwarf movement

const HUNGER_TICKS = 80;
const FARM_GROW_TICKS = 20;

function gameTock(now) {
  if (now - lastTick < TICK_MS) return;
  lastTick = now;
  gameTick++;
  // Hunger
  for (const d of dwarves) {
    if (d.dead) continue;
    d.hunger = (d.hunger || 0) + 1;
  }
  // Farm growth
  if (gameTick % FARM_GROW_TICKS === 0) {
    for (const plot of farmPlots.values()) {
      if (!resources.has(tileKey(plot.z, plot.r, plot.c)))
        spawnResource(plot.z, plot.r, plot.c, 'food');
    }
  }
  // Wildlife AI
  for (const a of wildlife.values()) {
    a.moveTimer--;
    if (a.moveTimer > 0) continue;
    a.moveTimer = a.hostile ? 2 : 4;
    let nearest = null, nearDist = Infinity;
    for (const d of dwarves) {
      if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
      const dist = Math.abs(d.r - a.r) + Math.abs(d.c - a.c) + Math.abs(d.z - a.z) * 4;
      if (dist < nearDist) { nearest = d; nearDist = dist; }
    }
    if ((a.hostile || a.provoked) && nearest && nearDist <= 8) {
      const dr = Math.sign(nearest.r - a.r), dc = Math.sign(nearest.c - a.c);
      const candidates = [];
      if (dr !== 0 && passable(a.z, a.r + dr, a.c)) candidates.push([a.z, a.r + dr, a.c]);
      if (dc !== 0 && passable(a.z, a.r, a.c + dc)) candidates.push([a.z, a.r, a.c + dc]);
      if (candidates.length) [a.z, a.r, a.c] = candidates[0];
      if (nearest.z === a.z && Math.abs(nearest.r - a.r) <= 1 && Math.abs(nearest.c - a.c) <= 1) {
        nearest.hp = (nearest.hp ?? 10) - 1;
        if (nearest.hp <= 0) nearest.dead = true;
      }
    } else if (!a.hostile && !a.provoked && nearest && nearDist <= 5) {
      const dr = Math.sign(a.r - nearest.r) || (Math.random()<0.5?1:-1);
      const dc = Math.sign(a.c - nearest.c) || (Math.random()<0.5?1:-1);
      const nz = a.surface ? surfaceZ[a.c + dc] ? surfaceZ[a.c + dc][a.r + dr] ?? a.z : a.z : a.z;
      if (passable(nz, a.r + dr, a.c + dc)) { a.z = nz; a.r += dr; a.c += dc; }
    } else {
      const [dr, dc] = DIRS[Math.floor(Math.random() * DIRS.length)];
      const nr = a.r + dr, nc = a.c + dc;
      const nz = a.surface && surfaceZ[nc] ? (surfaceZ[nc][nr] ?? a.z) : a.z;
      if (passable(nz, nr, nc)) { a.z = nz; a.r = nr; a.c = nc; }
    }
  }
}

const MOVE_INTERVAL = 150;
let lastMove = 0;
let pendingChunkTransitions = [];

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

function _resetDwarf(d) {
  if (d.digTarget)    { d.digTarget.claimedBy = null;    d.digTarget = null; }
  if (d.chopTarget)   { d.chopTarget.claimedBy = null;   d.chopTarget = null; }
  if (d.destroyTarget){ d.destroyTarget.claimedBy = null; d.destroyTarget = null; }
  if (d.haulResource) { d.haulResource.claimedBy = null; d.haulResource = null; }
  if (d.haulTarget && d.haulTarget._reservedBy === d) d.haulTarget._reservedBy = null;
  if (d.farmPlot)     { d.farmPlot.claimedBy = null;     d.farmPlot = null; }
  if (d.buildJob)     { _cancelBuild(d); }
  d.haulTarget = null; d.carrying = null; d.path = null; d.owTarget = null; d.job = 'Idle';
}

function stepDwarves(now) {
  if (now - lastMove < MOVE_INTERVAL) return;
  lastMove = now;
  for (const d of dwarves) {
    // Hungry dwarves move at half speed
    if ((d.hunger || 0) >= HUNGER_TICKS) { if (!d._hungerSkip) { d._hungerSkip = true; continue; } d._hungerSkip = false; }
    // Auto-attack adjacent wildlife — hostile always, passive only if provoked;
    // hitting a passive animal provokes it
    for (const a of wildlife.values()) {
      if (a.z !== d.z) continue;
      if (Math.abs(a.r - d.r) + Math.abs(a.c - d.c) > 1) continue;
      if (!a.hostile && !a.provoked) continue; // don't auto-attack calm passive animals
      a.hp--;
      if (a.hp <= 0) { wildlife.delete(a.id); spawnResource(a.z, a.r, a.c, 'meat'); }
    }
    // Auto-eat adjacent food
    if ((d.hunger || 0) > HUNGER_TICKS / 2) {
      const eatKey = [[0,0],...DIRS].map(([dr,dc]) => tileKey(d.z,d.r+dr,d.c+dc)).find(k => food.has(k));
      if (eatKey !== undefined) { food.delete(eatKey); d.hunger = 0; d.hp = Math.min(d.maxHp ?? 10, (d.hp ?? 10) + 3); }
      // Also eat adjacent meat resources
      if (d.hunger > HUNGER_TICKS / 2) {
        const meatKey = [[0,0],...DIRS].map(([dr,dc]) => tileKey(d.z,d.r+dr,d.c+dc))
          .find(k => resources.has(k) && resources.get(k).type === 'meat');
        if (meatKey !== undefined) { resources.delete(meatKey); d.hunger = 0; d.hp = Math.min(d.maxHp ?? 10, (d.hp ?? 10) + 3); }
      }
    }
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
    // Gravity — skip if in water or actively building
    const inWater = map[d.z][d.r][d.c] === 'WATER';
    if (!inWater && d.z > 0 && !_hasFloor(d.z, d.r, d.c)
        && !stairs.has(tileKey(d.z,d.r,d.c)) && !stairs.has(tileKey(d.z-1,d.r,d.c))
        && !d.buildJob) { d.z--; d.stuckTicks = 0; continue; }
    // Slow movement in water — skip every other step
    if (inWater) { if (!d._waterSkip) { d._waterSkip = true; continue; } d._waterSkip = false; }
    else d._waterSkip = false;
    // Sleeping removed — skip sleeping block
    if (!d.path || d.path.length === 0) {
      const hasJob = d.job !== 'Idle' && d.job !== 'Walking';
      if (hasJob) { d.stuckTicks = (d.stuckTicks || 0) + 1; if (d.stuckTicks >= 20) { _resetDwarf(d); continue; } }
      else d.stuckTicks = 0;
      if (d.owTarget && (d.wx !== d.owTarget.wx || d.wy !== d.owTarget.wy)) {
        _stepOwTravel(d, d.wx, d.wy); continue;
      }
      if (d.farmPlot) { d.farmPlot.claimedBy = null; d.farmPlot = null; }
      if (d.digTarget) {
        const dt = d.digTarget;
        const adjacent = DIRS.some(([dr,dc]) => d.r===dt.r+dr && d.c===dt.c+dc && d.z===dt.z)
                      || (d.r===dt.r && d.c===dt.c && Math.abs(d.z-dt.z)===1);
        if (!adjacent) { d.path = astar(d.z,d.r,d.c,dt.z,dt.r,dt.c) || null; }
        else if (digStairJobs.has(tileKey(dt.z,dt.r,dt.c))) finishDigStair(d);
        else finishDig(d);
      } else if (d.chopTarget) {
        finishChop(d);
      } else if (d.destroyTarget) {
        finishDestroy(d);
      } else if (d.buildJob) {
        stepBuild(d);
      } else if (d.job === 'Walking') {
        d.job = 'Idle';
      } else if (d.job === 'Idle' && Math.random() < 0.05) {
        const candidates = DIRS.map(([dr,dc]) => ({ r:d.r+dr, c:d.c+dc }))
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
    if (passable(next.z, next.r, next.c) || buildJobs.has(tileKey(next.z, next.r, next.c))) {
      d.z = next.z; d.r = next.r; d.c = next.c; d.stuckTicks = 0;
      if (!_isAboveSurface(d.z, d.r, d.c)) _revealAround(d.z, d.r, d.c);
      // Edge travel — defer transition until after loop
      let nwx = owCurX, nwy = owCurY;
      if      (d.c < 0)    { nwx--; d.c = COLS - 1; }
      else if (d.c >= COLS){ nwx++; d.c = 0; }
      else if (d.r < 0)    { nwy--; d.r = ROWS - 1; }
      else if (d.r >= ROWS){ nwy++; d.r = 0; }
      if ((nwx !== owCurX || nwy !== owCurY) && nwx >= 0 && nwx < OW_COLS && nwy >= 0 && nwy < OW_ROWS) {
        pendingChunkTransitions.push({ wx: nwx, wy: nwy, dwarf: d });
      }
    } else {
      // Path blocked — cancel the job cleanly so it can be retried
      if (d.buildJob) { _cancelBuild(d); }
      else if (d.digTarget) { d.digTarget.claimedBy = null; d.digTarget = null; d.path = null; d.job = 'Idle'; }
      else if (d.chopTarget) { d.chopTarget.claimedBy = null; d.chopTarget = null; d.path = null; d.job = 'Idle'; }
      else if (d.destroyTarget) { d.destroyTarget.claimedBy = null; d.destroyTarget = null; d.path = null; d.job = 'Idle'; }
      else if (d.haulResource || d.haulTarget) {
        if (d.haulResource) { d.haulResource.claimedBy = null; d.haulResource = null; }
        if (d.haulTarget && d.haulTarget._reservedBy === d) d.haulTarget._reservedBy = null;
        if (d.carrying) spawnResource(d.z, d.r, d.c, d.carrying);
        d.haulTarget = null; d.carrying = null; d.path = null; d.job = 'Idle';
      }
      else { _resetDwarf(d); }
    }
  }
  // Repulsion: idle dwarves sharing a tile nudge to a free adjacent tile
  const occupancy = new Map();
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    const k = tileKey(d.z,d.r,d.c);
    occupancy.set(k, (occupancy.get(k) || 0) + 1);
  }
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.job !== 'Idle' || d.path) continue;
    if ((occupancy.get(tileKey(d.z,d.r,d.c)) || 0) <= 1) continue;
    const free = DIRS.map(([dr,dc]) => ({ r:d.r+dr, c:d.c+dc }))
      .find(t => passable(d.z, t.r, t.c) && !occupancy.has(tileKey(d.z,t.r,t.c)));
    if (free) { d.r = free.r; d.c = free.c; occupancy.set(tileKey(d.z,free.r,free.c), 1); }
  }
  // Respawn if all dwarves dead
  if (dwarves.every(d => d.dead)) {
    const c = 75, r = 45, z = surfaceZ[c][r];
    dwarves.push({ name: NAMES[Math.floor(Math.random() * NAMES.length)], job: 'Idle', c, r, z, wx: owCurX, wy: owCurY, dead: false, hunger: 0, hp: 10, maxHp: 10 });
    _revealAround(z, r, c);
  }
  // Re-assign once at end — dwarves idle mid-tick get work next tick (150ms, imperceptible)
  _assignAll();
  // Apply deferred chunk transitions after all dwarves have moved
  for (const { wx, wy, dwarf } of pendingChunkTransitions) {
    dwarf.wx = wx; dwarf.wy = wy;
    if (wx === owCurX && wy === owCurY) {
      dwarf.z = surfaceZ[dwarf.c][dwarf.r];
      dwarf.path = null; dwarf.job = 'Idle';
      if (dwarf.owTarget && wx === dwarf.owTarget.wx && wy === dwarf.owTarget.wy) {
        const path = astar(dwarf.z, dwarf.r, dwarf.c, dwarf.owTarget.z, dwarf.owTarget.r, dwarf.owTarget.c);
        dwarf.path = path || null;
        dwarf.job = path ? 'Walking' : 'Idle';
        dwarf.owTarget = null;
      }
    } else {
      const cached = chunkCache.get(`${wx},${wy}`);
      const sz = cached ? cached.surfaceZ : generateChunk(wx, wy, overworld[wy][wx].biome).surfaceZ;
      dwarf.z = sz[dwarf.c][dwarf.r];
      if (dwarf.owTarget) _stepOwTravel(dwarf, wx, wy);
      else { dwarf.path = null; dwarf.job = 'Idle'; }
    }
  }
  pendingChunkTransitions = [];
}
