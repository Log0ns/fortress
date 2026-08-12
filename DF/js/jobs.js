// jobs.js — dig, haul, build, farm, workshop, eat job logic

function tickFarms() {
  for (const p of farmPlots.values()) {
    if (p.claimedBy || p.stage === 3) continue;
    if (gameTick % 10 === 0) p.stage++;
  }
}

function assignEatJobs() {
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.eating || d.health >= 100) continue;
    if (d.digTarget)    { d.digTarget.claimedBy = null; d.digTarget = null; }
    if (d.haulResource) { d.haulResource.claimedBy = null; d.haulResource = null; }
    d.haulTarget = null; d.carrying = null;
    let best = null, bestDist = Infinity;
    for (const f of food.values()) {
      if (f.claimedBy) continue;
      const dist = Math.abs(f.z-d.z)*10 + Math.abs(f.r-d.r) + Math.abs(f.c-d.c);
      if (dist < bestDist) { best = f; bestDist = dist; }
    }
    if (!best) continue;
    const path = astar(d.z, d.r, d.c, best.z, best.r, best.c);
    if (!path) continue;
    best.claimedBy = d; d.eating = best; d.path = path; d.job = 'Eating';
  }
}

function _findDigStandTile(best) {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  // Adjacent same-level tile with solid floor
  const adj = dirs.map(([dr,dc]) => ({ r: best.r+dr, c: best.c+dc, z: best.z }))
                  .find(t => passable(t.z, t.r, t.c) && !passable(t.z - 1, t.r, t.c));
  if (adj) return adj;
  // Directly above (digging down into target)
  if (passable(best.z + 1, best.r, best.c)) return { r: best.r, c: best.c, z: best.z + 1 };
  return null;
}

function assignDigStairJobs() {
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.digTarget || d.job !== 'Idle') continue;
    let best = null, bestDist = Infinity;
    for (const job of digStairJobs.values()) {
      if (job.claimedBy) continue;
      const dist = Math.abs(job.z-d.z)*10 + Math.abs(job.r-d.r) + Math.abs(job.c-d.c);
      if (dist < bestDist) { best = job; bestDist = dist; }
    }
    if (!best) continue;
    const standTile = _findDigStandTile(best);
    if (!standTile) continue;
    const path = astar(d.z, d.r, d.c, standTile.z, standTile.r, standTile.c);
    if (!path) continue;
    best.claimedBy = d; d.digTarget = best; d.path = path; d.job = 'Digging';
  }
}

function finishDigStair(d) {
  const job = d.digTarget;
  if (!job) return;
  const { z, r, c, stairType } = job;
  const k = `${z},${r},${c}`;
  // Carve the tile open
  map[z][r][c] = 'AIR';
  // Place stair
  stairs.set(k, { z, r, c, type: stairType });
  // For stair-down, also carve the tile below and place stair-up there
  if (stairType === 'stair-down' && z > 0) {
    map[z-1][r][c] = 'AIR';
    stairs.set(`${z-1},${r},${c}`, { z: z-1, r, c, type: 'stair-up' });
  }
  // For stair-up, also carve the tile above and place stair-down there
  if (stairType === 'stair-up' && z < LEVELS - 1) {
    map[z+1][r][c] = 'AIR';
    stairs.set(`${z+1},${r},${c}`, { z: z+1, r, c, type: 'stair-down' });
  }
  digStairJobs.delete(k);
  d.digTarget = null; d.job = 'Idle';
}

function assignDigJobs() {
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.digTarget || d.job !== 'Idle') continue;
    let best = null, bestDist = Infinity;
    for (const job of digJobs.values()) {
      if (job.claimedBy) continue;
      const dist = Math.abs(job.z-d.z)*10 + Math.abs(job.r-d.r) + Math.abs(job.c-d.c);
      if (dist < bestDist) { best = job; bestDist = dist; }
    }
    if (!best) continue;
    const standTile = _findDigStandTile(best);
    if (!standTile) continue;
    const path = astar(d.z, d.r, d.c, standTile.z, standTile.r, standTile.c);
    if (!path) continue;
    best.claimedBy = d; d.digTarget = best; d.path = path; d.job = 'Digging';
  }
}

function finishDig(d) {
  const job = d.digTarget;
  if (!job) return;
  const type = map[job.z][job.r][job.c] === 'STONE' ? 'stone' : 'dirt';
  map[job.z][job.r][job.c] = 'AIR';
  spawnResource(job.z, job.r, job.c, type);
  digJobs.delete(`${job.z},${job.r},${job.c}`);
  d.digTarget = null; d.job = 'Idle';
}

function assignHaulJobs() {
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.haulResource || d.carrying || d.job !== 'Idle') continue;
    let res = null, resDist = Infinity;
    for (const r of resources.values()) {
      if (r.claimedBy) continue;
      const dist = Math.abs(r.z-d.z)*10 + Math.abs(r.r-d.r) + Math.abs(r.c-d.c);
      if (dist < resDist) { res = r; resDist = dist; }
    }
    if (!res) continue;
    let sp = null, spDist = Infinity;
    for (const s of stockpiles.values()) {
      if (s.item) continue;
      const dist = Math.abs(s.z-d.z)*10 + Math.abs(s.r-d.r) + Math.abs(s.c-d.c);
      if (dist < spDist) { sp = s; spDist = dist; }
    }
    if (!sp) continue;
    const path = astar(d.z, d.r, d.c, res.z, res.r, res.c);
    if (!path) continue;
    res.claimedBy = d; d.haulResource = res; d.haulTarget = sp; d.path = path; d.job = 'Hauling';
  }
}

function stepHaul(d) {
  if (d.haulResource && !d.carrying) {
    if (d.r === d.haulResource.r && d.c === d.haulResource.c && d.z === d.haulResource.z) {
      resources.delete(`${d.z},${d.r},${d.c}`);
      d.carrying = d.haulResource.type; d.haulResource = null;
      const sp = d.haulTarget;
      d.path = astar(d.z, d.r, d.c, sp.z, sp.r, sp.c) || null;
      if (!d.path) { d.carrying = null; d.haulTarget = null; d.job = 'Idle'; }
    }
  } else if (d.carrying && d.haulTarget) {
    if (d.r === d.haulTarget.r && d.c === d.haulTarget.c && d.z === d.haulTarget.z) {
      d.haulTarget.item = d.carrying; d.carrying = null; d.haulTarget = null; d.job = 'Idle';
    }
  }
}

function assignBuildJobs() {
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.buildJob || d.job !== 'Idle') continue;
    let best = null, bestDist = Infinity;
    for (const job of buildJobs.values()) {
      if (job.claimedBy) continue;
      const dist = Math.abs(job.z-d.z)*10 + Math.abs(job.r-d.r) + Math.abs(job.c-d.c);
      if (dist < bestDist) { best = job; bestDist = dist; }
    }
    if (!best) continue;
    const woodTypes = new Set(['chair','table','chest','barrel']);
    const needsWood  = woodTypes.has(best.type);
    const needsDirt  = best.type === 'dirt-wall' || best.type === 'dirt-floor';
    const matType    = needsWood ? 'wood' : needsDirt ? 'dirt' : 'stone';
    const matPile = [...stockpiles.values()].find(s => s.item === matType)
                 || [...resources.values()].find(s => s.type === matType && !s.claimedBy);
    if (!matPile) continue;
    // Non-workshop builds require a workshop
    let ws = null;
    if (best.type !== 'workshop' && best.type !== 'dirt-wall' && best.type !== 'dirt-floor' && best.type !== 'stair-up' && best.type !== 'stair-down') {
      ws = [...workshops.values()].find(w => !w.claimedBy);
      if (!ws) continue;
    }
    const isLoose = matPile.type !== undefined;
    const path = astar(d.z, d.r, d.c, matPile.z, matPile.r, matPile.c);
    if (!path) continue;
    best.claimedBy = d; d.buildJob = best; d.buildStone = matPile;
    d.buildWorkshop = ws || null; d.buildPhase = 'material';
    if (ws) ws.claimedBy = d;
    if (!isLoose) matPile.item = null; else matPile.claimedBy = d;
    d.path = path; d.job = 'Building';
  }
}

function _cancelBuild(d) {
  if (d.buildJob)      d.buildJob.claimedBy = null;
  if (d.buildWorkshop) d.buildWorkshop.claimedBy = null;
  d.buildJob = null; d.buildStone = null; d.buildWorkshop = null;
  d.buildPhase = null; d.carrying = null; d.job = 'Idle';
}

function _placeBuild(d, job) {
  if (job.type === 'stone-wall' || job.type === 'dirt-wall')   map[job.z][job.r][job.c] = 'STONE';
  if (job.type === 'stone-floor' || job.type === 'dirt-floor') map[job.z][job.r][job.c] = 'DIRT';
  if (job.type === 'stair-up' || job.type === 'stair-down')
    stairs.set(`${job.z},${job.r},${job.c}`, { z:job.z, r:job.r, c:job.c, type:job.type });
  if (job.type === 'workshop')
    workshops.set(`${job.z},${job.r},${job.c}`, { z:job.z, r:job.r, c:job.c, claimedBy:null });
  if (job.type === 'bed')
    beds.set(`${job.z},${job.r},${job.c}`, { z:job.z, r:job.r, c:job.c, claimedBy:null });
  if (job.type === 'door')
    doors.set(`${job.z},${job.r},${job.c}`, { z:job.z, r:job.r, c:job.c });
  if (job.type === 'chair' || job.type === 'table' || job.type === 'chest' || job.type === 'barrel')
    furniture.set(`${job.z},${job.r},${job.c}`, { z:job.z, r:job.r, c:job.c, type:job.type });
  buildJobs.delete(`${job.z},${job.r},${job.c}`);
  if (d.buildWorkshop) d.buildWorkshop.claimedBy = null;
  d.buildJob = null; d.buildStone = null; d.buildWorkshop = null;
  d.buildPhase = null; d.carrying = null; d.job = 'Idle';
}

function stepBuild(d) {
  if (!d.buildJob) return;
  const job = d.buildJob;
  if (d.buildPhase === 'material') {
    if (d.buildStone && d.r === d.buildStone.r && d.c === d.buildStone.c && d.z === d.buildStone.z) {
      if (d.buildStone.item !== undefined) d.buildStone.item = null;
      else resources.delete(`${d.buildStone.z},${d.buildStone.r},${d.buildStone.c}`);
      const woodTypes = new Set(['chair','table','chest','barrel']);
      const needsWood = woodTypes.has(job.type);
      const needsDirt = job.type === 'dirt-wall' || job.type === 'dirt-floor';
      d.carrying = needsWood ? 'wood' : needsDirt ? 'dirt' : 'stone';
      const noWorkshopTypes = new Set(['workshop','dirt-wall','dirt-floor','stair-up','stair-down']);
      if (noWorkshopTypes.has(job.type)) {
        d.buildPhase = 'site';
        d.path = astar(d.z, d.r, d.c, job.z, job.r, job.c) || null;
      } else {
        d.buildPhase = 'workshop';
        d.path = astar(d.z, d.r, d.c, d.buildWorkshop.z, d.buildWorkshop.r, d.buildWorkshop.c) || null;
      }
      if (!d.path) _cancelBuild(d);
    }
  } else if (d.buildPhase === 'workshop') {
    const ws = d.buildWorkshop;
    if (d.r === ws.r && d.c === ws.c && d.z === ws.z) {
      d.buildPhase = 'site';
      d.path = astar(d.z, d.r, d.c, job.z, job.r, job.c) || null;
      if (!d.path) _cancelBuild(d);
    }
  } else if (d.buildPhase === 'site') {
    if (d.r === job.r && d.c === job.c && d.z === job.z) _placeBuild(d, job);
  }
}

function assignDestroyJobs() {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.destroyTarget || d.job !== 'Idle') continue;
    let best = null, bestDist = Infinity;
    for (const job of destroyJobs.values()) {
      if (job.claimedBy) continue;
      const dist = Math.abs(job.z-d.z)*10 + Math.abs(job.r-d.r) + Math.abs(job.c-d.c);
      if (dist < bestDist) { best = job; bestDist = dist; }
    }
    if (!best) continue;
    // Walls/floors are solid so dwarf must stand adjacent; others are passable so dwarf can stand on tile
    const isSolid = best.entity === 'wall' || best.entity === 'floor';
    let path;
    if (isSolid) {
      const standTile = dirs.map(([dr,dc]) => ({ r: best.r+dr, c: best.c+dc }))
                            .find(t => passable(best.z, t.r, t.c) && !passable(best.z-1, t.r, t.c));
      if (!standTile) continue;
      path = astar(d.z, d.r, d.c, best.z, standTile.r, standTile.c);
    } else {
      path = astar(d.z, d.r, d.c, best.z, best.r, best.c);
    }
    if (!path) continue;
    best.claimedBy = d; d.destroyTarget = best; d.path = path; d.job = 'Destroying';
  }
}

// Resource dropped per entity type
const DESTROY_DROP = {
  wall: t => t === 'stone-wall' ? 'stone' : 'dirt',
  floor: t => t === 'stone-floor' ? 'stone' : 'dirt',
  stair: () => 'stone',
  workshop: () => 'stone',
  door: () => 'stone',
  bed: () => 'wood',
  furniture: () => 'wood',
};

function finishDestroy(d) {
  const job = d.destroyTarget;
  if (!job) return;
  const { z, r, c, entity, buildType } = job;
  const k = `${z},${r},${c}`;
  let drop = null;
  if (entity === 'wall')      { map[z][r][c] = 'AIR'; drop = DESTROY_DROP.wall(buildType); }
  else if (entity === 'floor'){ map[z][r][c] = 'AIR'; drop = DESTROY_DROP.floor(buildType); }
  else if (entity === 'stair'){ stairs.delete(k);     drop = 'stone'; }
  else if (entity === 'workshop') { workshops.delete(k); drop = 'stone'; }
  else if (entity === 'door') { doors.delete(k);      drop = 'stone'; }
  else if (entity === 'bed')  { beds.delete(k);       drop = 'wood'; }
  else if (entity === 'furniture') { furniture.delete(k); drop = 'wood'; }
  if (drop) spawnResource(z, r, c, drop);
  destroyJobs.delete(k);
  d.destroyTarget = null; d.job = 'Idle';
}

function assignChopJobs() {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.chopTarget || d.job !== 'Idle') continue;
    let best = null, bestDist = Infinity;
    for (const job of chopJobs.values()) {
      if (job.claimedBy) continue;
      const dist = Math.abs(job.z-d.z)*10 + Math.abs(job.r-d.r) + Math.abs(job.c-d.c);
      if (dist < bestDist) { best = job; bestDist = dist; }
    }
    if (!best) continue;
    const standTile = dirs.map(([dr,dc]) => ({ r: best.r+dr, c: best.c+dc }))
                          .find(t => passable(best.z, t.r, t.c) && !passable(best.z - 1, t.r, t.c));
    if (!standTile) continue;
    const path = astar(d.z, d.r, d.c, best.z, standTile.r, standTile.c);
    if (!path) continue;
    best.claimedBy = d; d.chopTarget = best; d.path = path; d.job = 'Chopping';
  }
}

function finishChop(d) {
  const job = d.chopTarget;
  if (!job) return;
  trees.delete(`${job.z},${job.r},${job.c}`);
  chopJobs.delete(`${job.z},${job.r},${job.c}`);
  spawnResource(job.z, job.r, job.c, 'wood');
  d.chopTarget = null; d.job = 'Idle';
}

function assignFarmJobs() {
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.farmPlot || d.job !== 'Idle') continue;
    let best = null, bestDist = Infinity;
    for (const p of farmPlots.values()) {
      if (p.stage !== 3 || p.claimedBy) continue;
      const dist = Math.abs(p.z-d.z)*10 + Math.abs(p.r-d.r) + Math.abs(p.c-d.c);
      if (dist < bestDist) { best = p; bestDist = dist; }
    }
    if (!best) continue;
    const path = astar(d.z, d.r, d.c, best.z, best.r, best.c);
    if (!path) continue;
    best.claimedBy = d; d.farmPlot = best; d.path = path; d.job = 'Farming';
  }
}

function assignSleepJobs() {
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.sleeping || d.job !== 'Idle') continue;
    // Find nearest unclaimed bed first
    let best = null, bestDist = Infinity;
    for (const b of beds.values()) {
      if (b.claimedBy) continue;
      const dist = Math.abs(b.z-d.z)*10 + Math.abs(b.r-d.r) + Math.abs(b.c-d.c);
      if (dist < bestDist) { best = b; bestDist = dist; }
    }
    if (best) {
      const path = astar(d.z, d.r, d.c, best.z, best.r, best.c);
      if (path) { best.claimedBy = d; d.sleepTarget = best; d.path = path; d.job = 'Sleeping'; continue; }
    }
    // No bed — sleep on ground
    d.sleepTarget = null; d.job = 'Sleeping';
  }
}
