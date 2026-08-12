// main.js — tick loop, input handlers, init

function tick(now) {
  gameTock(now);
  stepDwarves(now);
  maybeAutoSave();
  overworldView ? drawOverworld() : draw();
  updateSidebar();
  requestAnimationFrame(tick);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    if (!overworldView) {
      owCursorX = owCurX; owCursorY = owCurY;
    } else {
      zoomInTo(owCursorX, owCursorY);
    }
    overworldView = !overworldView; updateSidebar(); return;
  }
  if (overworldView) {
    if (e.key === 'ArrowLeft')  { owCursorX = Math.max(0, owCursorX - 1); return; }
    if (e.key === 'ArrowRight') { owCursorX = Math.min(OW_COLS - 1, owCursorX + 1); return; }
    if (e.key === 'ArrowUp')    { owCursorY = Math.max(0, owCursorY - 1); return; }
    if (e.key === 'ArrowDown')  { owCursorY = Math.min(OW_ROWS - 1, owCursorY + 1); return; }
    if (e.key === 'Enter') { zoomInTo(owCursorX, owCursorY); overworldView = false; updateSidebar(); return; }
  }
  if (!overworldView && e.key === 'ArrowUp')   { camZ = Math.min(LEVELS - 1, camZ + 1); updateSidebar(); return; }
  if (!overworldView && e.key === 'ArrowDown') { camZ = Math.max(0, camZ - 1); updateSidebar(); return; }
  if (e.key === 'd' || e.key === 'D') { digMode = !digMode; digStairDownMode = false; digStairUpMode = false; chopMode = false; destroyMode = false; stockpileMode = false; farmMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === '<')                  { digStairDownMode = !digStairDownMode; digMode = false; digStairUpMode = false; chopMode = false; destroyMode = false; stockpileMode = false; farmMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === '>')                  { digStairUpMode = !digStairUpMode; digMode = false; digStairDownMode = false; chopMode = false; destroyMode = false; stockpileMode = false; farmMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === 'c' || e.key === 'C') { chopMode = !chopMode; digMode = false; destroyMode = false; stockpileMode = false; farmMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === 'x' || e.key === 'X') { destroyMode = !destroyMode; digMode = false; chopMode = false; stockpileMode = false; farmMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === 's' || e.key === 'S') { stockpileMode = !stockpileMode; digMode = false; chopMode = false; destroyMode = false; farmMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === 'f' || e.key === 'F') { farmMode = !farmMode; digMode = false; chopMode = false; destroyMode = false; stockpileMode = false; selectMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === 'v' || e.key === 'V') { selectMode = !selectMode; digMode = false; chopMode = false; destroyMode = false; stockpileMode = false; farmMode = false; buildMode = null; updateSidebar(); return; }
  if (e.key === 'b' || e.key === 'B') {
    const idx = BUILD_TYPES.indexOf(buildMode);
    buildMode = idx < BUILD_TYPES.length - 1 ? BUILD_TYPES[idx + 1] : null;
    digMode = false; stockpileMode = false; updateSidebar();
  }
});

let dragging = false, dragStart = null, dragStartTile = null, selectDragStart = null;

function inDesignateMode() { return digMode || digStairDownMode || digStairUpMode || chopMode || destroyMode || stockpileMode || farmMode || buildMode; }

function _destroyJobForTile(z, r, c) {
  const k = `${z},${r},${c}`;
  if (destroyJobs.has(k)) return; // already designated
  const t = map[z][r][c];
  if (t === 'STONE' && !stairs.has(k) && !workshops.has(k)) return; // natural stone, not built
  if (stairs.has(k))    { destroyJobs.set(k, { z,r,c, entity:'stair',     buildType:null, claimedBy:null }); return; }
  if (workshops.has(k)) { destroyJobs.set(k, { z,r,c, entity:'workshop',  buildType:null, claimedBy:null }); return; }
  if (doors.has(k))     { destroyJobs.set(k, { z,r,c, entity:'door',      buildType:null, claimedBy:null }); return; }
  if (beds.has(k))      { destroyJobs.set(k, { z,r,c, entity:'bed',       buildType:null, claimedBy:null }); return; }
  if (furniture.has(k)) { destroyJobs.set(k, { z,r,c, entity:'furniture', buildType:null, claimedBy:null }); return; }
  // Walls and floors — detect by tile type being STONE/DIRT on a tile that was AIR in ref
  if (t === 'stone-floor' || t === 'dirt-floor') { destroyJobs.set(k, { z,r,c, entity:'floor', buildType:t, claimedBy:null }); return; }
  // STONE tile that isn't natural — was built as a wall
  if (t === 'STONE' || t === 'DIRT') {
    // Only designate if it's a built wall (passable above means it was placed, not natural)
    destroyJobs.set(k, { z,r,c, entity:'wall', buildType: t==='STONE' ? 'stone-wall' : 'dirt-wall', claimedBy:null });
  }
}

function _canBuild(type, z, r, c) {
  const t = map[z][r][c];
  const furnitureTypes = new Set(['bed','chair','table','chest','barrel']);
  const floorTypes = new Set(['stone-floor','dirt-floor']);
  const passableTile = t === 'AIR' || t === 'DIRT' || floorTypes.has(t);
  if (furnitureTypes.has(type)) {
    if (t === 'DIRT' || floorTypes.has(t)) return true;
    return 'Furniture needs a floor tile';
  }
  if (!passableTile) return 'Tile must be open to build here';
  return true;
}

function _checkBuildMessage(type) {
  const woodTypes = new Set(['chair','table','chest','barrel']);
  const needsWood = woodTypes.has(type);
  const needsDirt = type === 'dirt-wall' || type === 'dirt-floor';
  const matType   = needsWood ? 'wood' : needsDirt ? 'dirt' : 'stone';
  const hasMat    = [...stockpiles.values()].some(s => s.item === matType)
                 || [...resources.values()].some(s => s.type === matType && !s.claimedBy);
  const noWorkshopNeeded = new Set(['workshop', 'dirt-wall', 'dirt-floor', 'stair-up', 'stair-down']);
  if (!hasMat) { showMessage(`Need ${matType} to build ${type}`); return; }
  if (!noWorkshopNeeded.has(type) && workshops.size === 0) { showMessage('Need a workshop first'); return; }
  if (!noWorkshopNeeded.has(type) && ![...workshops.values()].some(w => !w.claimedBy)) { showMessage('Workshop is busy'); }
}

function applyDesignation(r1, c1, r2, c2) {
  const rMin = Math.min(r1,r2), rMax = Math.max(r1,r2);
  const cMin = Math.min(c1,c2), cMax = Math.max(c1,c2);
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const k = `${camZ},${r},${c}`, t = map[camZ][r][c];
      if (digMode)            { if ((t==='STONE'||t==='DIRT') && !digJobs.has(k))   digJobs.set(k,   {z:camZ,r,c,claimedBy:null}); }
      else if (digStairDownMode) { if ((t==='STONE'||t==='DIRT') && !digStairJobs.has(k)) digStairJobs.set(k, {z:camZ,r,c,stairType:'stair-down',claimedBy:null}); }
      else if (digStairUpMode)   { if ((t==='STONE'||t==='DIRT') && !digStairJobs.has(k)) digStairJobs.set(k, {z:camZ,r,c,stairType:'stair-up',claimedBy:null}); }
      else if (destroyMode)   { _destroyJobForTile(camZ, r, c); }
      else if (chopMode)      { if (trees.has(k) && !chopJobs.has(k))               chopJobs.set(k,  {z:camZ,r,c,claimedBy:null}); }
      else if (stockpileMode) {
        if (stockpiles.has(k)) stockpiles.delete(k);
        else if (t==='AIR'||t==='DIRT'||t==='stone-floor'||t==='dirt-floor') stockpiles.set(k, {z:camZ,r,c,item:null});
      }
      else if (farmMode) { if (t==='DIRT' && !farmPlots.has(k))                farmPlots.set(k, {z:camZ,r,c,stage:0,claimedBy:null}); }
      else if (buildMode) {
        if (!buildJobs.has(k)) {
          const ok = _canBuild(buildMode, camZ, r, c);
          if (ok === true) { buildJobs.set(k, {z:camZ,r,c,type:buildMode,claimedBy:null}); _checkBuildMessage(buildMode); }
          else showMessage(ok);
        }
      }
    }
  }
}

canvas.addEventListener('mousedown', e => {
  dragging = true;
  dragStart = { x: e.clientX + camX, y: e.clientY + camY };
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
  const dx = Math.abs((dragStart.x - camX) - e.clientX);
  const dy = Math.abs((dragStart.y - camY) - e.clientY);
  // Drag-select rectangle
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
      const t = map[camZ][r][c], k = `${camZ},${r},${c}`;
      if ((t === 'STONE' || t === 'DIRT') && !digJobs.has(k))
        digJobs.set(k, { z: camZ, r, c, claimedBy: null });
      else if (t !== 'STONE' && t !== 'DIRT') showMessage('Can only dig stone or dirt');
    } else if (digStairDownMode) {
      const t = map[camZ][r][c], k = `${camZ},${r},${c}`;
      if ((t === 'STONE' || t === 'DIRT') && !digStairJobs.has(k))
        digStairJobs.set(k, { z: camZ, r, c, stairType: 'stair-down', claimedBy: null });
      else if (t !== 'STONE' && t !== 'DIRT') showMessage('Can only dig stair into stone or dirt');
    } else if (digStairUpMode) {
      const t = map[camZ][r][c], k = `${camZ},${r},${c}`;
      if ((t === 'STONE' || t === 'DIRT') && !digStairJobs.has(k))
        digStairJobs.set(k, { z: camZ, r, c, stairType: 'stair-up', claimedBy: null });
      else if (t !== 'STONE' && t !== 'DIRT') showMessage('Can only dig stair into stone or dirt');
    } else if (destroyMode) {
      _destroyJobForTile(camZ, r, c);
    } else if (chopMode) {
      const k = `${camZ},${r},${c}`;
      if (trees.has(k) && !chopJobs.has(k))
        chopJobs.set(k, { z: camZ, r, c, claimedBy: null });
      else if (!trees.has(k)) showMessage('No tree here to chop');
    } else if (stockpileMode) {
      const k = `${camZ},${r},${c}`, t = map[camZ][r][c];
      if (stockpiles.has(k)) stockpiles.delete(k);
      else if (t === 'AIR' || t === 'DIRT' || t === 'stone-floor' || t === 'dirt-floor') stockpiles.set(k, { z: camZ, r, c, item: null });
      else showMessage('Cannot place stockpile here');
    } else if (farmMode) {
      const k = `${camZ},${r},${c}`;
      if (map[camZ][r][c] === 'DIRT' && !farmPlots.has(k))
        farmPlots.set(k, { z: camZ, r, c, stage: 0, claimedBy: null });
      else if (map[camZ][r][c] !== 'DIRT') showMessage('Farms need dirt tiles');
    } else if (buildMode) {
      const k = `${camZ},${r},${c}`;
      if (!buildJobs.has(k)) {
        const ok = _canBuild(buildMode, camZ, r, c);
        if (ok === true) { buildJobs.set(k, { z: camZ, r, c, type: buildMode, claimedBy: null }); _checkBuildMessage(buildMode); }
        else showMessage(ok);
      }
    } else {
      const hit = dwarves.find(d => d.c === c && d.r === r && d.z === camZ && d.wx === owCurX && d.wy === owCurY);
      if (hit && (selectMode || e.shiftKey)) {
        if (selected.has(hit)) selected.delete(hit); else selected.add(hit);
      } else if (hit && !selectMode) {
        const onlyHit = selected.size === 1 && selected.has(hit);
        selected.clear();
        if (!onlyHit) selected.add(hit);
      } else if (!selectMode && selected.size > 0) {
        // Spread multiple dwarves to unique tiles around the target using BFS
        const claimed = new Set();
        function nearestFreeTile(tr, tc, tz) {
          const q = [[tr, tc]], seen = new Set([`${tr},${tc}`]);
          while (q.length) {
            const [r, c] = q.shift();
            const k = `${r},${c}`;
            if (!claimed.has(k) && passable(tz, r, c)) { claimed.add(k); return { r, c }; }
            for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
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

// expose for HTML onclick
window.saveGame = saveGame;
window.loadGame = loadGame;
window.setMode  = setMode;

resize();
requestAnimationFrame(tick);
