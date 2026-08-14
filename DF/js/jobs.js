// jobs.js — dig, haul, build, farm, workshop, eat job logic

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

// Per-tick set: job keys with no standable neighbor (geometry only, no A*)
const _buildUnreachable = new Set();

// Returns the destination tile for a build job:
// walls/dirt need a truly passable adjacent stand tile; everything else the job tile itself
function _buildDest(job) {
  if (job.type === 'stone' || job.type === 'dirt') {
    return DIRS.map(([dr,dc]) => ({ z: job.z, r: job.r+dr, c: job.c+dc }))
               .find(t => passable(t.z, t.r, t.c)) || null;
  }
  return job;
}

function assignBuildJobs() {
  for (const d of dwarves) {
    if (d.dead || d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.buildJob || d.job !== 'Idle') continue;
    let best = null, bestDist = Infinity;
    for (const job of buildJobs.values()) {
      if (job.claimedBy) continue;
      const k = tileKey(job.z, job.r, job.c);
      if (_buildUnreachable.has(k)) continue;
      const dist = Math.abs(job.z-d.z)*10 + Math.abs(job.r-d.r) + Math.abs(job.c-d.c);
      if (dist < bestDist) { best = job; bestDist = dist; }
    }
    if (!best) continue;
    const dest = _buildDest(best);
    if (!dest) { _buildUnreachable.add(tileKey(best.z, best.r, best.c)); continue; }
    const needsWood = WOOD_TYPES.has(best.type);
    const needsDirt = best.type === 'dirt' || best.type === 'dirt-floor';
    const matType   = needsWood ? 'wood' : needsDirt ? 'dirt' : 'stone';
    const mat = (() => {
      for (const s of stockpiles.values()) if (s.item === matType && !s._reservedBy) return s;
      for (const s of resources.values())  if (s.type === matType && !s.claimedBy) return s;
      return null;
    })();
    if (!mat) continue;
    // Single concatenated path: dwarf → mat → dest
    const toMat = astar(d.z, d.r, d.c, mat.z, mat.r, mat.c);
    if (!toMat) continue;
    const isWall = best.type === 'stone' || best.type === 'dirt';
    const toDest = astar(mat.z, mat.r, mat.c, dest.z, dest.r, dest.c, isWall ? null : (z,r,c) => buildJobs.has(tileKey(z,r,c)));
    if (!toDest) continue;
    best.claimedBy = d; d.buildJob = best; d.buildMat = mat; d.buildDest = dest;
    if (mat.type !== undefined) mat.claimedBy = d; else mat._reservedBy = d;
    d._buildToDest = toDest; d.path = toMat; d.job = 'Building';
  }
}

function _cancelBuild(d) {
  if (d.buildJob) d.buildJob.claimedBy = null;
  if (d.buildMat) {
    if (d.buildMat._reservedBy === d) d.buildMat._reservedBy = null;
    else if (d.buildMat.claimedBy === d) d.buildMat.claimedBy = null;
  }
  if (d.carrying) spawnResource(d.z, d.r, d.c, d.carrying);
  d.buildJob = null; d.buildMat = null; d.buildDest = null; d._buildToDest = null;
  d.carrying = null; d.path = null; d.job = 'Idle';
}

function _placeBuild(d, job) {
  const k = tileKey(job.z, job.r, job.c);
  if      (job.type === 'stone')      { map[job.z][job.r][job.c] = 'STONE'; }
  else if (job.type === 'dirt')       { map[job.z][job.r][job.c] = 'DIRT'; }
  else if (job.type === 'stone-floor'){ map[job.z][job.r][job.c] = 'stone-floor'; }
  else if (job.type === 'dirt-floor') { map[job.z][job.r][job.c] = 'dirt-floor'; }
  else if (job.type === 'stair')      { stairs.set(k,     { z:job.z, r:job.r, c:job.c, type:'stair' }); }
  else if (job.type === 'workshop')   { workshops.set(k,  { z:job.z, r:job.r, c:job.c, claimedBy:null }); }
  else if (job.type === 'bed')        { beds.set(k,       { z:job.z, r:job.r, c:job.c, claimedBy:null }); }
  else if (job.type === 'door')       { doors.set(k,      { z:job.z, r:job.r, c:job.c }); }
  else { furniture.set(k, { z:job.z, r:job.r, c:job.c, type:job.type }); }
  // Eject dwarf if they're standing inside a solid tile they just placed
  if ((job.type === 'stone' || job.type === 'dirt') && d.r === job.r && d.c === job.c && d.z === job.z) {
    const escape = DIRS.map(([dr,dc]) => ({ r:job.r+dr, c:job.c+dc, z:job.z })).find(t => passable(t.z,t.r,t.c));
    if (escape) { d.r = escape.r; d.c = escape.c; }
  }
  buildJobs.delete(k);
  d.buildJob = null; d.buildMat = null; d.buildDest = null; d._buildToDest = null; d.carrying = null; d.job = 'Idle';
}

function stepBuild(d) {
  if (!d.buildJob) return;
  const job = d.buildJob;
  if (!d.carrying) {
    // Not yet at mat — shouldn't happen (path should have taken us there), cancel for retry
    if (!d.buildMat || d.r !== d.buildMat.r || d.c !== d.buildMat.c || d.z !== d.buildMat.z) { _cancelBuild(d); return; }
    // Arrived at mat — consume it and switch to dest path
    if ('item' in d.buildMat) {
      if (!d.buildMat.item) { _cancelBuild(d); return; }
      d.buildMat._reservedBy = null; d.buildMat.item = null;
    } else {
      if (!resources.has(tileKey(d.buildMat.z, d.buildMat.r, d.buildMat.c))) { _cancelBuild(d); return; }
      resources.delete(tileKey(d.buildMat.z, d.buildMat.r, d.buildMat.c));
    }
    d.buildMat = null;
    d.carrying = WOOD_TYPES.has(job.type) ? 'wood' : (job.type === 'dirt' || job.type === 'dirt-floor') ? 'dirt' : 'stone';
    d.path = d._buildToDest; d._buildToDest = null;
  } else {
    // Arrived at dest — place
    const dest = d.buildDest;
    if (d.r === dest.r && d.c === dest.c && d.z === dest.z) { _placeBuild(d, job); }
    else { _cancelBuild(d); }
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


