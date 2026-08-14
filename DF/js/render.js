// render.js — canvas drawing

const canvas = document.getElementById('map');
const ctx    = canvas.getContext('2d');

function resize() {
  canvas.width  = window.innerWidth - 200;
  canvas.height = window.innerHeight;
  clampCam();
}
window.addEventListener('resize', resize);

function clampCam() {
  camX = Math.max(0, Math.min(camX, Math.max(0, COLS * TILE - canvas.width)));
  camY = Math.max(0, Math.min(camY, Math.max(0, ROWS * TILE - canvas.height)));
}

const FURNITURE_GLYPHS = { chair:'h', table:'T', chest:'c', barrel:'n' };

function draw() {
  ctx.font = `${TILE}px monospace`;
  ctx.textBaseline = 'top';
  const startCol   = Math.floor(camX / TILE);
  const startRow   = Math.floor(camY / TILE);
  const visibleCols = Math.ceil(canvas.width  / TILE) + 1;
  const visibleRows = Math.ceil(canvas.height / TILE) + 1;

  for (let r = startRow; r < Math.min(startRow + visibleRows, ROWS); r++) {
    for (let c = startCol; c < Math.min(startCol + visibleCols, COLS); c++) {
      const raw = map[camZ][r][c];
      const tile = TYPES[raw] || TYPES['DIRT']; // floor types fall back to DIRT visuals
      const x = c * TILE - camX, y = r * TILE - camY;
      ctx.fillStyle = tile.bg; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = tile.fg; ctx.fillText(tile.char, x, y);
    }
  }

  // Stockpiles
  for (const s of stockpiles.values()) {
    if (s.z !== camZ) continue;
    const x = s.c * TILE - camX, y = s.r * TILE - camY;
    ctx.fillStyle = s.item ? 'rgba(0,180,255,0.3)' : 'rgba(0,100,180,0.2)';
    ctx.fillRect(x, y, TILE, TILE);
    if (s.item) { ctx.fillStyle = '#0af'; ctx.font = `${TILE}px monospace`; ctx.fillText('*', x, y); }
  }

  // Loose resources
  ctx.font = `${TILE}px monospace`;
  for (const res of resources.values()) {
    if (res.z !== camZ) continue;
    const x = res.c * TILE - camX, y = res.r * TILE - camY;
    ctx.fillStyle = res.type === 'stone' ? '#aaa' : res.type === 'wood' ? '#a63' : '#a87';
    ctx.fillText('*', x, y);
  }

  // Trees
  ctx.font = `${TILE}px monospace`;
  for (const t of trees.values()) {
    if (t.z !== camZ) continue;
    const x = t.c * TILE - camX, y = t.r * TILE - camY;
    const chop = chopJobs.get(`${t.z},${t.r},${t.c}`);
    ctx.fillStyle = chop ? (chop.claimedBy ? '#6a2' : '#8f4') : '#2a5';
    ctx.fillText('T', x, y);
  }

  // Destroy designations — red X overlay
  for (const job of destroyJobs.values()) {
    if (job.z !== camZ) continue;
    const x = job.c * TILE - camX, y = job.r * TILE - camY;
    ctx.fillStyle = job.claimedBy ? '#800' : '#f00';
    ctx.font = `${TILE}px monospace`;
    ctx.fillText('X', x, y);
  }

  // Dig designations
  for (const job of digJobs.values()) {
    if (job.z !== camZ) continue;
    const x = job.c * TILE - camX, y = job.r * TILE - camY;
    ctx.fillStyle = job.claimedBy ? '#a50' : '#f80'; ctx.fillText('x', x, y);
  }

  // Dig stair designations
  for (const job of digStairJobs.values()) {
    if (job.z !== camZ) continue;
    const x = job.c * TILE - camX, y = job.r * TILE - camY;
    ctx.fillStyle = job.claimedBy ? '#a50' : '#f80';
    ctx.fillText('/', x, y);
  }

  // Build designations
  for (const job of buildJobs.values()) {
    if (job.z !== camZ) continue;
    const x = job.c * TILE - camX, y = job.r * TILE - camY;
    ctx.fillStyle = job.claimedBy ? '#a0a' : '#f0f';
    const ch = job.type==='stone' ? '#'
             : job.type==='dirt' ? '.'
             : job.type==='stone-floor'||job.type==='dirt-floor' ? '_'
             : job.type==='stair' ? '/'
             : job.type==='door' ? 'D' : job.type==='workshop' ? 'W'
             : job.type==='bed' ? '=' : job.type==='chair' ? 'h'
             : job.type==='table' ? 'T' : job.type==='chest' ? 'c'
             : job.type==='barrel' ? 'n' : 'O';
    ctx.fillText(ch, x, y);
  }

  // Workshops
  for (const w of workshops.values()) {
    if (w.z !== camZ) continue;
    const x = w.c * TILE - camX, y = w.r * TILE - camY;
    ctx.fillStyle = w.claimedBy ? '#a60' : '#f80'; ctx.font = `${TILE}px monospace`;
    ctx.fillText('W', x, y);
  }

  // Doors
  for (const d of doors.values()) {
    if (d.z !== camZ) continue;
    const x = d.c * TILE - camX, y = d.r * TILE - camY;
    ctx.fillStyle = '#a64'; ctx.font = `${TILE}px monospace`;
    ctx.fillText('+', x, y);
  }

  // Furniture
  for (const f of furniture.values()) {
    if (f.z !== camZ) continue;
    const x = f.c * TILE - camX, y = f.r * TILE - camY;
    ctx.fillStyle = '#ca8'; ctx.font = `${TILE}px monospace`;
    ctx.fillText(FURNITURE_GLYPHS[f.type] || '?', x, y);
  }

  // Stairs
  for (const s of stairs.values()) {
    if (s.z !== camZ) continue;
    const x = s.c * TILE - camX, y = s.r * TILE - camY;
    ctx.fillStyle = '#ff8'; ctx.font = `${TILE}px monospace`;
    ctx.fillText('/', x, y);
  }

  // Beds
  for (const b of beds.values()) {
    if (b.z !== camZ) continue;
    const x = b.c * TILE - camX, y = b.r * TILE - camY;
    ctx.fillStyle = b.claimedBy ? '#88f' : '#44a'; ctx.font = `${TILE}px monospace`;
    ctx.fillText('=', x, y);
  }

  // Night overlay
  const tod = timeOfDay();
  if (tod > 0.868) {
    // Ramp up from 0.868 (dusk) to 0.954 (midnight) then back down to 1.0 (dawn)
    let alpha;
    if (tod < 0.954) alpha = ((tod - 0.868) / 0.086) * 0.7;
    else             alpha = ((1.0 - tod)   / 0.046) * 0.7;
    ctx.fillStyle = `rgba(0,0,20,${alpha.toFixed(2)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Drag-select rectangle (selectMode only)
  if (selectMode && selectDragStart) {
    const r1 = Math.min(selectDragStart.r, hoverTile.r), r2 = Math.max(selectDragStart.r, hoverTile.r);
    const c1 = Math.min(selectDragStart.c, hoverTile.c), c2 = Math.max(selectDragStart.c, hoverTile.c);
    const x = c1 * TILE - camX, y = r1 * TILE - camY;
    const w = (c2 - c1 + 1) * TILE, h = (r2 - r1 + 1) * TILE;
    ctx.strokeStyle = '#ff0'; ctx.fillStyle = 'rgba(255,255,0,0.1)'; ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  }

  // Hover highlight / drag preview
  if (digMode || digStairMode || chopMode || destroyMode || stockpileMode || farmMode || buildMode || cancelMode) {
    ctx.strokeStyle = digMode ? '#f80' : digStairMode ? '#f80' : cancelMode ? '#f44' : chopMode ? '#8f4' : destroyMode ? '#f00' : stockpileMode ? '#0af' : farmMode ? '#4a4' : '#f0f';
    ctx.fillStyle   = digMode ? 'rgba(255,136,0,0.15)' : digStairMode ? 'rgba(255,136,0,0.15)' : cancelMode ? 'rgba(255,68,68,0.15)' : chopMode ? 'rgba(136,255,68,0.15)' : destroyMode ? 'rgba(255,0,0,0.15)' : stockpileMode ? 'rgba(0,170,255,0.15)' : farmMode ? 'rgba(68,170,68,0.15)' : 'rgba(255,0,255,0.15)';
    ctx.lineWidth = 1;
    if (dragStartTile) {
      const r1 = Math.min(dragStartTile.r, hoverTile.r), r2 = Math.max(dragStartTile.r, hoverTile.r);
      const c1 = Math.min(dragStartTile.c, hoverTile.c), c2 = Math.max(dragStartTile.c, hoverTile.c);
      const x = c1 * TILE - camX, y = r1 * TILE - camY;
      const w = (c2 - c1 + 1) * TILE, h = (r2 - r1 + 1) * TILE;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    } else {
      ctx.strokeRect(hoverTile.c * TILE - camX, hoverTile.r * TILE - camY, TILE, TILE);
    }
  }

  // Selected dwarf paths
  ctx.fillStyle = 'rgba(255,255,0,0.25)';
  for (const d of selected) {
    if (!d.path) continue;
    for (const step of d.path)
      if (step.z === camZ)
        ctx.fillRect(step.c * TILE - camX, step.r * TILE - camY, TILE, TILE);
  }

  // Dwarves
  for (const d of dwarves) {
    if (d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.z !== camZ) continue;
    const x = d.c * TILE - camX, y = d.r * TILE - camY;
    if (x < -TILE || y < -TILE || x > canvas.width || y > canvas.height) continue;
    ctx.font = `${TILE}px monospace`;
    ctx.fillStyle = d.dead ? '#555' : (selected.has(d) ? '#ff0' : '#0f0');
    ctx.fillText(d.dead ? 'X' : '@', x, y);
    if (d.carrying) { ctx.fillStyle = '#0af'; ctx.font = '10px monospace'; ctx.fillText(d.carrying[0], x + TILE - 6, y); }
  }
}

function drawOverworld() {
  const tw = Math.floor(canvas.width  / OW_COLS);
  const th = Math.floor(canvas.height / OW_ROWS);
  const t  = Math.min(tw, th);
  const offX = Math.floor((canvas.width  - t * OW_COLS) / 2);
  const offY = Math.floor((canvas.height - t * OW_ROWS) / 2);

  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${t}px monospace`; ctx.textBaseline = 'top';

  for (let r = 0; r < OW_ROWS; r++) {
    for (let c = 0; c < OW_COLS; c++) {
      const tile = overworld[r][c], b = BIOMES[tile.biome];
      const x = offX + c * t, y = offY + r * t;
      ctx.fillStyle = tile.visited ? b.bg : '#050505'; ctx.fillRect(x, y, t, t);
      ctx.fillStyle = tile.visited ? b.fg : '#333';    ctx.fillText(b.char, x, y);
    }
  }

  // Loaded chunk marker (white)
  const lx = offX + owCurX * t, ly = offY + owCurY * t;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.strokeRect(lx + 1, ly + 1, t - 2, t - 2);

  // Cursor (yellow)
  const cx = offX + owCursorX * t, cy = offY + owCursorY * t;
  ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2;
  ctx.strokeRect(cx + 1, cy + 1, t - 2, t - 2);

  // Dwarf dots — group by chunk
  const dwarvesPerChunk = new Map();
  for (const d of dwarves) {
    if (d.dead) continue;
    const key = `${d.wx},${d.wy}`;
    dwarvesPerChunk.set(key, (dwarvesPerChunk.get(key) || 0) + 1);
  }
  ctx.font = `bold ${Math.max(8, t - 2)}px monospace`; ctx.textBaseline = 'middle';
  for (const [key, count] of dwarvesPerChunk) {
    const [wx, wy] = key.split(',').map(Number);
    const dx = offX + wx * t + t * 0.5, dy = offY + wy * t + t * 0.5;
    ctx.fillStyle = '#0f0';
    ctx.fillText(count > 9 ? '+' : String(count), dx - t * 0.25, dy);
  }

  ctx.font = '12px monospace'; ctx.textBaseline = 'top';
  Object.entries(BIOMES).forEach(([name, b], i) => {
    ctx.fillStyle = '#333'; ctx.fillRect(8, 8 + i * 16, 120, 15);
    ctx.fillStyle = b.fg;   ctx.fillText(`${b.char} ${name}`, 12, 9 + i * 16);
  });

  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(8, canvas.height - 24, 200, 18);
  ctx.fillStyle = '#aaa'; ctx.fillText('[Tab] return to local view', 12, canvas.height - 22);
}
