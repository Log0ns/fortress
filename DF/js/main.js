// main.js — tick loop, input handlers, init

function tick(now) {
  if (!paused) {
    gameTock(now);
    stepDwarves(now);
    maybeAutoSave();
  }
  overworldView ? drawOverworld() : draw();
  updateSidebar();
  requestAnimationFrame(tick);
}

const CAM_PAN = 4;
const _keys = new Set();

function _clearModes() {
  digMode = false; digStairMode = false; chopMode = false; destroyMode = false;
  stockpileMode = false; farmMode = false; selectMode = false; cancelMode = false;
  attackMode = false; buildMode = null;
  document.getElementById('build-submenu').style.display = 'none';
  document.getElementById('select-submenu').style.display = 'none';
}

document.addEventListener('keydown', e => {
  _keys.add(e.key);
  if (e.key === 'Tab') {
    e.preventDefault();
    if (!overworldView) { owCursorX = owCurX; owCursorY = owCurY; }
    else zoomInTo(owCursorX, owCursorY);
    overworldView = !overworldView; updateSidebar(); return;
  }
  if (overworldView) {
    if (e.key === 'ArrowLeft'  || e.key === 'a') { owCursorX = Math.max(0, owCursorX - 1); return; }
    if (e.key === 'ArrowRight' || e.key === 'd') { owCursorX = Math.min(OW_COLS - 1, owCursorX + 1); return; }
    if (e.key === 'ArrowUp'    || e.key === 'w') { owCursorY = Math.max(0, owCursorY - 1); return; }
    if (e.key === 'ArrowDown'  || e.key === 's') { owCursorY = Math.min(OW_ROWS - 1, owCursorY + 1); return; }
    if (e.key === 'Enter') { zoomInTo(owCursorX, owCursorY); overworldView = false; updateSidebar(); return; }
  }
  if (!overworldView) {
    if (e.key === 'w') { camY = Math.max(0, camY - CAM_PAN * TILE); clampCam(); return; }
    if (e.key === 's') { camY += CAM_PAN * TILE; clampCam(); return; }
    if (e.key === 'a') { camX = Math.max(0, camX - CAM_PAN * TILE); clampCam(); return; }
    if (e.key === 'd') { camX += CAM_PAN * TILE; clampCam(); return; }
    if (e.key === 'e') { camZ = Math.min(LEVELS - 1, camZ + 1); updateSidebar(); return; }
    if (e.key === 'q') { camZ = Math.max(0, camZ - 1); updateSidebar(); return; }
  }
  if (!overworldView && e.key === 'ArrowUp')   { camZ = Math.min(LEVELS - 1, camZ + 1); updateSidebar(); return; }
  if (!overworldView && e.key === 'ArrowDown') { camZ = Math.max(0, camZ - 1); updateSidebar(); return; }
  if (e.key === ' ') { e.preventDefault(); paused = !paused; updateSidebar(); return; }
  if (e.key === 'Escape') { _clearModes(); updateSidebar(); return; }
  if (!e.shiftKey) return;
  if (e.key === 'D') { digMode = !digMode; digStairMode = false; chopMode = false; destroyMode = false; stockpileMode = false; farmMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === '<' || e.key === '>') { digStairMode = !digStairMode; digMode = false; chopMode = false; destroyMode = false; stockpileMode = false; farmMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === 'C') { chopMode = !chopMode; digMode = false; destroyMode = false; stockpileMode = false; farmMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === 'X') { destroyMode = !destroyMode; digMode = false; chopMode = false; stockpileMode = false; farmMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === 'S') { stockpileMode = !stockpileMode; digMode = false; chopMode = false; destroyMode = false; farmMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === 'F') { farmMode = !farmMode; digMode = false; chopMode = false; destroyMode = false; stockpileMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === 'V') { selectMode = !selectMode; digMode = false; chopMode = false; destroyMode = false; stockpileMode = false; farmMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === 'A') { attackMode = !attackMode; digMode = false; digStairMode = false; chopMode = false; destroyMode = false; stockpileMode = false; farmMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === 'B') {
    const idx = BUILD_TYPES.indexOf(buildMode);
    buildMode = idx < BUILD_TYPES.length - 1 ? BUILD_TYPES[idx + 1] : null;
    digMode = false; stockpileMode = false; updateSidebar();
  }
});
document.addEventListener('keyup', e => { _keys.delete(e.key); });

let dragging = false, dragStart = null, dragStartClient = null, dragStartTile = null, selectDragStart = null;

function inDesignateMode() { return digMode || digStairMode || chopMode || destroyMode || stockpileMode || farmMode || buildMode || cancelMode; }

function _cancelJobAt(z, r, c) {
  const k = tileKey(z,r,c);
  if (digJobs.has(k))      { const j = digJobs.get(k);      if (j.claimedBy) { j.claimedBy.digTarget = null; j.claimedBy.path = null; j.claimedBy.job = 'Idle'; } digJobs.delete(k); }
  if (digStairJobs.has(k)) { const j = digStairJobs.get(k); if (j.claimedBy) { j.claimedBy.digTarget = null; j.claimedBy.path = null; j.claimedBy.job = 'Idle'; } digStairJobs.delete(k); }
  if (chopJobs.has(k))     { const j = chopJobs.get(k);     if (j.claimedBy) { j.claimedBy.chopTarget = null; j.claimedBy.path = null; j.claimedBy.job = 'Idle'; } chopJobs.delete(k); }
  if (destroyJobs.has(k))  { const j = destroyJobs.get(k);  if (j.claimedBy) { j.claimedBy.destroyTarget = null; j.claimedBy.path = null; j.claimedBy.job = 'Idle'; } destroyJobs.delete(k); }
  if (buildJobs.has(k))    { const j = buildJobs.get(k);    if (j.claimedBy) _cancelBuild(j.claimedBy); else buildJobs.delete(k); }
}

function _retriggerJobAt(z, r, c) {
  const k = tileKey(z,r,c);
  if (digJobs.has(k))      { const j = digJobs.get(k);      if (j.claimedBy) { j.claimedBy.digTarget = null; j.claimedBy.path = null; j.claimedBy.job = 'Idle'; j.claimedBy = null; } }
  if (digStairJobs.has(k)) { const j = digStairJobs.get(k); if (j.claimedBy) { j.claimedBy.digTarget = null; j.claimedBy.path = null; j.claimedBy.job = 'Idle'; j.claimedBy = null; } }
  if (chopJobs.has(k))     { const j = chopJobs.get(k);     if (j.claimedBy) { j.claimedBy.chopTarget = null; j.claimedBy.path = null; j.claimedBy.job = 'Idle'; j.claimedBy = null; } }
  if (destroyJobs.has(k))  { const j = destroyJobs.get(k);  if (j.claimedBy) { j.claimedBy.destroyTarget = null; j.claimedBy.path = null; j.claimedBy.job = 'Idle'; j.claimedBy = null; } }
  if (buildJobs.has(k))    { const j = buildJobs.get(k);    if (j.claimedBy) { _cancelBuild(j.claimedBy); j.claimedBy = null; } }
}

function _destroyJobForTile(z, r, c) {
  const k = tileKey(z,r,c);
  if (destroyJobs.has(k)) return;
  const t = map[z][r][c];
  if (stairs.has(k))    { destroyJobs.set(k, { z,r,c, entity:'stair',     buildType:null, claimedBy:null }); return; }
  if (workshops.has(k)) { destroyJobs.set(k, { z,r,c, entity:'workshop',  buildType:null, claimedBy:null }); return; }
  if (doors.has(k))     { destroyJobs.set(k, { z,r,c, entity:'door',      buildType:null, claimedBy:null }); return; }
  if (beds.has(k))      { destroyJobs.set(k, { z,r,c, entity:'bed',       buildType:null, claimedBy:null }); return; }
  if (furniture.has(k)) { destroyJobs.set(k, { z,r,c, entity:'furniture', buildType:null, claimedBy:null }); return; }
  if (t === 'stone-floor' || t === 'dirt-floor') { destroyJobs.set(k, { z,r,c, entity:'floor', buildType:'floor', claimedBy:null }); return; }
  if (t === 'STONE' || t === 'DIRT' || t === 'SAND' || t === 'HARDSTONE' || t === 'OBSIDIAN' || t === 'IRON' || t === 'COAL' || t === 'GOLD' || t === 'GEM') {
    destroyJobs.set(k, { z,r,c, entity:'wall', buildType: t.toLowerCase(), claimedBy:null });
  }
}

function _canBuild(type, z, r, c) {
  const t = map[z][r][c];
  const floorTypes = new Set(['stone-floor','dirt-floor']);
  if (type === 'wall') {
    if (t !== 'AIR') return 'Can only place walls in empty space';
  } else if (new Set(['bed','chair','table','chest','barrel']).has(type)) {
    if (t !== 'DIRT' && t !== 'SAND' && !floorTypes.has(t)) return 'Furniture needs a floor tile';
  } else {
    if (t !== 'AIR' && t !== 'DIRT' && t !== 'SAND' && !floorTypes.has(t)) return 'Tile must be open to build here';
  }
  return true;
}

function applyDesignation(r1, c1, r2, c2) {
  const rMin = Math.min(r1,r2), rMax = Math.max(r1,r2);
  const cMin = Math.min(c1,c2), cMax = Math.max(c1,c2);
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const k = tileKey(camZ,r,c), t = map[camZ][r][c];
      if (digMode)           { if (DIGGABLE.has(t) && !digJobs.has(k))      digJobs.set(k,      {z:camZ,r,c,claimedBy:null}); }
      else if (digStairMode) { if (DIGGABLE.has(t) && !digStairJobs.has(k)) digStairJobs.set(k, {z:camZ,r,c,claimedBy:null}); }
      else if (cancelMode)   { _cancelJobAt(camZ, r, c); }
      else if (destroyMode)  { _destroyJobForTile(camZ, r, c); }
      else if (chopMode)     { if (trees.has(k) && !chopJobs.has(k)) chopJobs.set(k, {z:camZ,r,c,claimedBy:null}); }
      else if (stockpileMode) {
        if (stockpiles.has(k)) stockpiles.delete(k);
        else if (passable(camZ,r,c)) stockpiles.set(k, {z:camZ,r,c,item:null});
      }
      else if (farmMode) { if ((t==='DIRT'||t==='SAND') && !farmPlots.has(k)) farmPlots.set(k, {z:camZ,r,c,stage:0,claimedBy:null}); }
      else if (buildMode) {
        if (!buildJobs.has(k)) {
          const ok = _canBuild(buildMode, camZ, r, c);
          if (ok === true) buildJobs.set(k, {z:camZ,r,c,type:buildMode,claimedBy:null});
          else showMessage(ok);
        }
      }
    }
  }
}

canvas.addEventListener('mousedown', e => {
  dragging = true;
  dragStart = { x: e.clientX + camX, y: e.clientY + camY };
  dragStartClient = { x: e.clientX, y: e.clientY };
  selectDragStart = null;
  if (inDesignateMode()) {
    dragStartTile = { r: Math.floor((e.clientY + camY) / TILE), c: Math.floor((e.clientX + camX) / TILE) };
  } else if (selectMode && !overworldView) {
    selectDragStart = { r: Math.floor((e.clientY + camY) / TILE), c: Math.floor((e.clientX + camX) / TILE) };
  }
});
canvas.addEventListener('mousemove', e => {
  hoverTile = { r: Math.floor((e.clientY + camY) / TILE), c: Math.floor((e.clientX + camX) / TILE) };
  if (!dragging) return;
  if (!inDesignateMode() && !selectDragStart) {
    camX = dragStart.x - e.clientX;
    camY = dragStart.y - e.clientY;
    clampCam();
  }
});
canvas.addEventListener('mouseup', e => {
  if (inDesignateMode() && dragStartTile) {
    const endR = Math.floor((e.clientY + camY) / TILE);
    const endC = Math.floor((e.clientX + camX) / TILE);
    applyDesignation(dragStartTile.r, dragStartTile.c, endR, endC);
    dragStartTile = null; dragging = false; return;
  }
  const dx = Math.abs(e.clientX - dragStartClient.x);
  const dy = Math.abs(e.clientY - dragStartClient.y);
  if (selectMode && selectDragStart && (dx >= 4 || dy >= 4)) {
    const endR = Math.floor((e.clientY + camY) / TILE);
    const endC = Math.floor((e.clientX + camX) / TILE);
    const rMin = Math.min(selectDragStart.r, endR), rMax = Math.max(selectDragStart.r, endR);
    const cMin = Math.min(selectDragStart.c, endC), cMax = Math.max(selectDragStart.c, endC);
    if (!e.shiftKey) selected.clear();
    for (const d of dwarves)
      if (!d.dead && d.wx === owCurX && d.wy === owCurY && d.z === camZ &&
          d.r >= rMin && d.r <= rMax && d.c >= cMin && d.c <= cMax)
        selected.add(d);
    selectDragStart = null; dragging = false; return;
  }
  selectDragStart = null;
  if (dx < 4 && dy < 4) {
    if (overworldView) {
      const tw = Math.floor(canvas.width  / OW_COLS);
      const th = Math.floor(canvas.height / OW_ROWS);
      const t  = Math.min(tw, th);
      const offX = Math.floor((canvas.width  - t * OW_COLS) / 2);
      const offY = Math.floor((canvas.height - t * OW_ROWS) / 2);
      const wx = Math.floor((e.clientX - offX) / t);
      const wy = Math.floor((e.clientY - offY) / t);
      if (wx >= 0 && wx < OW_COLS && wy >= 0 && wy < OW_ROWS) {
        owCursorX = wx; owCursorY = wy;
        zoomInTo(wx, wy);
        overworldView = false; updateSidebar();
      }
      dragging = false; return;
    }
    const c = Math.floor((e.clientX + camX) / TILE);
    const r = Math.floor((e.clientY + camY) / TILE);
    if (digMode) {
      const t = map[camZ][r][c], k = tileKey(camZ,r,c);
      if (DIGGABLE.has(t) && !digJobs.has(k)) digJobs.set(k, { z: camZ, r, c, claimedBy: null });
      else if (!DIGGABLE.has(t)) showMessage('Cannot dig this tile');
    } else if (digStairMode) {
      const t = map[camZ][r][c], k = tileKey(camZ,r,c);
      if (DIGGABLE.has(t) && !digStairJobs.has(k)) digStairJobs.set(k, { z: camZ, r, c, claimedBy: null });
      else if (!DIGGABLE.has(t)) showMessage('Can only dig stair into solid tiles');
    } else if (cancelMode) {
      _cancelJobAt(camZ, r, c);
    } else if (destroyMode) {
      _destroyJobForTile(camZ, r, c);
    } else if (chopMode) {
      const k = tileKey(camZ,r,c);
      if (trees.has(k) && !chopJobs.has(k)) chopJobs.set(k, { z: camZ, r, c, claimedBy: null });
      else if (!trees.has(k)) showMessage('No tree here to chop');
    } else if (stockpileMode) {
      const k = tileKey(camZ,r,c);
      if (stockpiles.has(k)) stockpiles.delete(k);
      else if (passable(camZ,r,c)) stockpiles.set(k, { z: camZ, r, c, item: null });
      else showMessage('Cannot place stockpile here');
    } else if (farmMode) {
      const k = tileKey(camZ,r,c), t = map[camZ][r][c];
      if ((t === 'DIRT' || t === 'SAND') && !farmPlots.has(k)) farmPlots.set(k, { z: camZ, r, c, stage: 0, claimedBy: null });
      else showMessage('Farms need dirt or sand tiles');
    } else if (buildMode) {
      const k = tileKey(camZ,r,c);
      if (!buildJobs.has(k)) {
        const ok = _canBuild(buildMode, camZ, r, c);
        if (ok === true) buildJobs.set(k, { z: camZ, r, c, type: buildMode, claimedBy: null });
        else showMessage(ok);
      }
    } else if (attackMode) {
      const target = [...wildlife.values()].find(a => a.r === r && a.c === c && a.z === camZ);
      if (target) {
        target.provoked = true;
        const attackers = selected.size > 0 ? [...selected] : dwarves.filter(d => !d.dead && d.wx === owCurX && d.wy === owCurY);
        for (const d of attackers) {
          const standTile = DIRS.map(([dr,dc]) => ({r: r+dr, c: c+dc})).find(t => passable(camZ, t.r, t.c));
          if (!standTile) continue;
          const path = astar(d.z, d.r, d.c, camZ, standTile.r, standTile.c);
          if (path) { d.path = path; d.job = 'Walking'; d.owTarget = null; }
        }
      } else { showMessage('No target here'); }
    } else {
      const hit = dwarves.find(d => d.c === c && d.r === r && d.z === camZ && d.wx === owCurX && d.wy === owCurY);
      const k = tileKey(camZ,r,c);
      const hasJob = digJobs.has(k) || digStairJobs.has(k) || chopJobs.has(k) || destroyJobs.has(k) || buildJobs.has(k);
      if (hasJob && !hit) {
        _retriggerJobAt(camZ, r, c);
      } else if (hit && hit.job !== 'Idle' && hit.job !== 'Walking') {
        _resetDwarf(hit);
      } else if (hit && (selectMode || e.shiftKey)) {
        if (selected.has(hit)) selected.delete(hit); else selected.add(hit);
      } else if (hit && !selectMode) {
        const onlyHit = selected.size === 1 && selected.has(hit);
        selected.clear();
        if (!onlyHit) selected.add(hit);
      } else if (!selectMode && selected.size > 0) {
        const claimed = new Set();
        function nearestFreeTile(tr, tc, tz) {
          const q = [[tr, tc]], seen = new Set([`${tr},${tc}`]);
          while (q.length) {
            const [r, c] = q.shift();
            const k = `${r},${c}`;
            if (!claimed.has(k) && passable(tz, r, c)) { claimed.add(k); return { r, c }; }
            for (const [dr, dc] of DIRS) {
              const nr = r+dr, nc = c+dc, nk = `${nr},${nc}`;
              if (!seen.has(nk) && nr>=0 && nr<ROWS && nc>=0 && nc<COLS) { seen.add(nk); q.push([nr, nc]); }
            }
          }
          return { r: tr, c: tc };
        }
        for (const d of selected) {
          if (d.dead) continue;
          if (d.wx === owCurX && d.wy === owCurY) {
            const dest = nearestFreeTile(r, c, camZ);
            const path = astar(d.z, d.r, d.c, camZ, dest.r, dest.c);
            d.path = path || null; d.owTarget = null;
            if (path) d.job = 'Walking';
          } else {
            d.owTarget = { wx: owCurX, wy: owCurY, z: camZ, r, c };
            d.path = null; d.job = 'Walking';
            _stepOwTravel(d, d.wx, d.wy);
          }
        }
      } else {
        selected.clear();
      }
    }
  }
  dragging = false;
});
canvas.addEventListener('mouseleave', () => dragging = false);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const oldTile = TILE;
  TILE = Math.max(8, Math.min(24, TILE + (e.deltaY < 0 ? 1 : -1)));
  if (TILE === oldTile) return;
  const mouseCol = (e.clientX + camX) / oldTile;
  const mouseRow = (e.clientY + camY) / oldTile;
  camX = mouseCol * TILE - e.clientX;
  camY = mouseRow * TILE - e.clientY;
  clampCam();
  ctx.font = `${TILE}px monospace`;
}, { passive: false });
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  _clearModes();
  updateSidebar();
});

// expose for HTML onclick
window.saveGame          = saveGame;
window.loadGame          = loadGame;
window.setMode           = setMode;
window.setBuildMode      = setBuildMode;
window.setActiveMaterial = setActiveMaterial;
window.togglePause       = () => { paused = !paused; };

resize();
const _spawnC = 75, _spawnR = 45;
camX = Math.max(0, _spawnC * TILE - canvas.width / 2);
camY = Math.max(0, _spawnR * TILE - canvas.height / 2);
requestAnimationFrame(tick);
