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
    if (d.haulTarget && d.haulTarget._reservedBy === d) { d.haulTarget._reservedBy = null; }
    if (d.buildJob)     { _cancelBuild(d); }
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

function _hasFloor(z, r, c) {
  const t = (z >= 0 && z < LEVELS && r >= 0 && r < ROWS && c >= 0 && c < COLS) ? map[z][r][c] : null;
  if (t === 'DIRT' || t === 'stone-floor' || t === 'dirt-floor' || doors.has(tileKey(z,r,c))) return true;
  if (stairs.has(tileKey(z,r,c))) return true;
  return !passable(z - 1, r, c) || z === 0;
}

function _findDigStandTile(best) {
  const adj = DIRS.map(([dr,dc]) => ({ r: best.r+dr, c: best.c+dc, z: best.z }))
                  .find(t => passable(t.z, t.r, t.c) && _hasFloor(t.z, t.r, t.c));
  if (adj) return adj;
  if (passable(best.z - 1, best.r, best.c) && _hasFloor(best.z - 1, best.r, best.c)) return { r: best.r, c: best.c, z: best.z - 1 };
  if (passable(best.z + 1, best.r, best.c) && _hasFloor(best.z + 1, best.r, best.c)) return { r: best.r, c: best.c, z: best.z + 1 };
  return null;
}

function _assignAll() {
  _buildUnreachable.clear();
  assignEatJobs();
  if (isNight()) assignSleepJobs();
  assignBuildJobs();
  assignDigJobs();
  assignDigStairJobs();
  assignChopJobs();
  assignDestroyJobs();
  assignFarmJobs();
  assignHaulJobs();
}

function _buildStandable(z, r, c) {
  return passable(z, r, c) || buildJobs.has(tileKey(z, r, c));
}
const WOOD_TYPES = new Set(['chair','table','chest','barrel']);
const NO_WORKSHOP_TYPES = new Set(['workshop','stone','dirt','stone-floor','dirt-floor','stair']);

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
  const { z, r, c } = job;
  const k = tileKey(z,r,c);
  map[z][r][c] = 'AIR';
  stairs.set(k, { z, r, c, type: 'stair' });
  digStairJobs.delete(k);
  d.z = z; d.r = r; d.c = c;
  d.digTarget = null; d.path = null; d.job = 'Idle';
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
  // Spawn resource on nearest passable tile so it doesn't float
  const dropTile = [job].concat(DIRS.map(([dr,dc]) => ({ z:job.z, r:job.r+dr, c:job.c+dc })))
    .find(t => passable(t.z, t.r, t.c));
  if (dropTile) spawnResource(dropTile.z, dropTile.r, dropTile.c, type);
  digJobs.delete(tileKey(job.z,job.r,job.c));
  d.digTarget = null; d.path = null; d.job = 'Idle';
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
      if (s.item || s._reservedBy) continue;
      const dist = Math.abs(s.z-d.z)*10 + Math.abs(s.r-d.r) + Math.abs(s.c-d.c);
      if (dist < spDist) { sp = s; spDist = dist; }
    }
    if (!sp) continue;
    const path = astar(d.z, d.r, d.c, res.z, res.r, res.c);
    if (!path) continue;
    res.claimedBy = d; sp._reservedBy = d;
    d.haulResource = res; d.haulTarget = sp; d.path = path; d.job = 'Hauling';
  }
}

function stepHaul(d) {
  if (d.haulResource && !d.carrying) {
    if (d.r === d.haulResource.r && d.c === d.haulResource.c && d.z === d.haulResource.z) {
      resources.delete(tileKey(d.z,d.r,d.c));
      d.carrying = d.haulResource.type; d.haulResource = null;
      const sp = d.haulTarget;
      d.path = astar(d.z, d.r, d.c, sp.z, sp.r, sp.c) || null;
      if (!d.path) { if (sp._reservedBy === d) sp._reservedBy = null; d.carrying = null; d.haulTarget = null; d.job = 'Idle'; }
    }
  } else if (d.carrying && d.haulTarget) {
    if (d.r === d.haulTarget.r && d.c === d.haulTarget.c && d.z === d.haulTarget.z) {
      d.haulTarget.item = d.carrying;
      if (d.haulTarget._reservedBy === d) d.haulTarget._reservedBy = null;
      d.carrying = null; d.haulTarget = null; d.job = 'Idle';
    }
  } else {
    // Carrying with no target, or no resource and no carrying — reset
    d.carrying = null; d.haulTarget = null; d.job = 'Idle';
  }
}

// Per-tick cache: job keys with no standable neighbor at all
const _buildUnreachable = new Set();

function _buildReachable(job) {
  const k = tileKey(job.z, job.r, job.c);
  if (_buildUnreachable.has(k)) return false;
  const adj = job.type === 'stone' || job.type === 'dirt';
  if (!adj) return true;
  const candidates = DIRS.map(([dr,dc]) => ({ z: job.z, r: job.r+dr, c: job.c+dc }))
                         .filter(t => _buildStandable(t.z, t.r, t.c));
  if (!candidates.length) { _buildUnreachable.add(k); return false; }
  return true;
}

function assignBuildJobs() {
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.buildJob || d.job !== 'Idle') continue;
    let best = null, bestDist = Infinity;
    for (const job of buildJobs.values()) {
      if (job.claimedBy) continue;
      if (!_buildReachable(job)) continue;
      const dist = Math.abs(job.z-d.z)*10 + Math.abs(job.r-d.r) + Math.abs(job.c-d.c);
      if (dist < bestDist) { best = job; bestDist = dist; }
    }
    if (!best) continue;
    const needsWood = WOOD_TYPES.has(best.type);
    const needsDirt = best.type === 'dirt' || best.type === 'dirt-floor';
    const matType   = needsWood ? 'wood' : needsDirt ? 'dirt' : 'stone';
    const matPile = [...stockpiles.values()].find(s => s.item === matType && !s._reservedBy)
                 || [...resources.values()].find(s => s.type === matType && !s.claimedBy && !s._reservedBy);
    if (!matPile) continue;
    // For adj types find a stand tile and build a waypoint path: dwarf -> mat -> standTile
    const adj = best.type === 'stone' || best.type === 'dirt';
    let standTile = null, fullPath = null;
    if (adj) {
      const candidates = DIRS.map(([dr,dc]) => ({ z: best.z, r: best.r+dr, c: best.c+dc }))
                             .filter(t => _buildStandable(t.z, t.r, t.c));
      for (const t of candidates) {
        const toMat = astar(d.z, d.r, d.c, matPile.z, matPile.r, matPile.c);
        if (!toMat) continue;
        const toSite = astar(matPile.z, matPile.r, matPile.c, t.z, t.r, t.c, (z,r,c) => buildJobs.has(tileKey(z,r,c)));
        if (!toSite) continue;
        standTile = t; fullPath = toMat; d._buildToSite = toSite; break;
      }
      // Already adjacent — zero-length site path
      if (!standTile) {
        const alreadyAdj = DIRS.some(([dr,dc]) => d.r === best.r+dr && d.c === best.c+dc && d.z === best.z);
        if (alreadyAdj) {
          const toMat = astar(d.z, d.r, d.c, matPile.z, matPile.r, matPile.c);
          if (toMat) { standTile = { z: d.z, r: d.r, c: d.c }; fullPath = toMat; d._buildToSite = []; }
        }
      }
      if (!standTile) continue;
    } else {
      fullPath = astar(d.z, d.r, d.c, matPile.z, matPile.r, matPile.c);
      if (!fullPath) continue;
      const toSite = astar(matPile.z, matPile.r, matPile.c, best.z, best.r, best.c);
      if (!toSite) continue;
      standTile = best; d._buildToSite = toSite;
    }
    const isLoose = matPile.type !== undefined;
    best.claimedBy = d; d.buildJob = best; d.buildStone = matPile; d.buildStandTile = standTile;
    d.buildWorkshop = null; d.buildPhase = 'material';
    if (isLoose) matPile.claimedBy = d; else matPile._reservedBy = d;
    d.path = fullPath; d.job = 'Building';
  }
}

function _cancelBuild(d) {
  if (d.buildJob) d.buildJob.claimedBy = null;
  if (d.buildStone) {
    if (d.buildStone._reservedBy === d) d.buildStone._reservedBy = null;
    else if (d.buildStone.claimedBy === d) d.buildStone.claimedBy = null;
  }
  if (d.carrying) spawnResource(d.z, d.r, d.c, d.carrying);
  d.buildJob = null; d.buildStone = null; d.buildStandTile = null; d._buildToSite = null;
  d.buildWorkshop = null; d.buildPhase = null; d.carrying = null; d.job = 'Idle';
}

function _placeBuild(d, job) {
  if (job.type === 'stone' || job.type === 'dirt') {
    map[job.z][job.r][job.c] = job.type === 'stone' ? 'STONE' : 'DIRT';
    if (d.r === job.r && d.c === job.c && d.z === job.z) {
      const escape = DIRS.map(([dr,dc]) => ({ r: job.r+dr, c: job.c+dc, z: job.z }))
                         .find(t => passable(t.z, t.r, t.c));
      if (escape) { d.r = escape.r; d.c = escape.c; d.z = escape.z; }
    }
  } else if (job.type === 'stone-floor') { map[job.z][job.r][job.c] = 'stone-floor'; }
  else if (job.type === 'dirt-floor')  { map[job.z][job.r][job.c] = 'dirt-floor'; }
  if (job.type === 'stair')    stairs.set(tileKey(job.z,job.r,job.c), { z:job.z, r:job.r, c:job.c, type:'stair' });
  if (job.type === 'workshop') workshops.set(tileKey(job.z,job.r,job.c), { z:job.z, r:job.r, c:job.c, claimedBy:null });
  if (job.type === 'bed')      beds.set(tileKey(job.z,job.r,job.c), { z:job.z, r:job.r, c:job.c, claimedBy:null });
  if (job.type === 'door')     doors.set(tileKey(job.z,job.r,job.c), { z:job.z, r:job.r, c:job.c });
  if (job.type === 'chair' || job.type === 'table' || job.type === 'chest' || job.type === 'barrel')
    furniture.set(tileKey(job.z,job.r,job.c), { z:job.z, r:job.r, c:job.c, type:job.type });
  buildJobs.delete(tileKey(job.z,job.r,job.c));
  d.buildJob = null; d.buildStone = null; d.buildStandTile = null; d._buildToSite = null;
  d.buildWorkshop = null; d.buildPhase = null; d.carrying = null; d.job = 'Idle';
}

function stepBuild(d) {
  if (!d.buildJob) return;
  const job = d.buildJob;
  if (d.buildPhase === 'material') {
    // Arrived at material
    if (d.buildStone && d.r === d.buildStone.r && d.c === d.buildStone.c && d.z === d.buildStone.z) {
      if ('item' in d.buildStone) {
        if (!d.buildStone.item) { _cancelBuild(d); return; }
        d.buildStone._reservedBy = null; d.buildStone.item = null;
      } else {
        if (!resources.has(tileKey(d.buildStone.z, d.buildStone.r, d.buildStone.c))) { _cancelBuild(d); return; }
        resources.delete(tileKey(d.buildStone.z, d.buildStone.r, d.buildStone.c));
      }
      d.buildStone = null;
      d.carrying = WOOD_TYPES.has(job.type) ? 'wood' : (job.type === 'dirt' || job.type === 'dirt-floor') ? 'dirt' : 'stone';
      d.buildPhase = 'site';
      d.path = d._buildToSite || [];
      d._buildToSite = null;
    }
  } else if (d.buildPhase === 'site') {
    const adj = job.type === 'stone' || job.type === 'dirt';
    const atSite = adj
      ? DIRS.some(([dr,dc]) => d.r === job.r+dr && d.c === job.c+dc && d.z === job.z)
      : d.r === job.r && d.c === job.c && d.z === job.z;
    if (atSite) {
      _placeBuild(d, job);
    } else if (!d.path || d.path.length === 0) {
      // Path ran out before reaching site — cancel, job stays for retry
      _cancelBuild(d);
    }
  }
}

function assignDestroyJobs() {
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
      const standTile = DIRS.map(([dr,dc]) => ({ r: best.r+dr, c: best.c+dc }))
                            .find(t => passable(best.z, t.r, t.c) && _hasFloor(best.z, t.r, t.c));
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
  wall: t => t === 'stone' ? 'stone' : 'dirt',
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
  const k = tileKey(z,r,c);
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
    const standTile = DIRS.map(([dr,dc]) => ({ r: best.r+dr, c: best.c+dc }))
                          .find(t => passable(best.z, t.r, t.c) && _hasFloor(best.z, t.r, t.c));
    if (!standTile) continue;
    const path = astar(d.z, d.r, d.c, best.z, standTile.r, standTile.c);
    if (!path) continue;
    best.claimedBy = d; d.chopTarget = best; d.path = path; d.job = 'Chopping';
  }
}

function finishChop(d) {
  const job = d.chopTarget;
  if (!job) return;
  trees.delete(tileKey(job.z,job.r,job.c));
  chopJobs.delete(tileKey(job.z,job.r,job.c));  spawnResource(job.z, job.r, job.c, 'wood');
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
