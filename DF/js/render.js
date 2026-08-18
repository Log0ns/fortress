// render.js — canvas drawing

const canvas = document.getElementById('map');
const ctx    = canvas.getContext('2d');

function resize() {
  canvas.width  = canvas.parentElement.offsetWidth;
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
      const x = c * TILE - camX, y = r * TILE - camY;
      if (!isRevealed(camZ, r, c)) {
        ctx.fillStyle = '#000'; ctx.fillRect(x, y, TILE, TILE);
        continue;
      }
      const raw = map[camZ][r][c];
      const isSurface = (raw === 'DIRT' || raw === 'SAND') && camZ === surfaceZ[c][r];
      const tile = isSurface ? (BIOME_SURFACE[currentBiome] || TYPES['DIRT']) : (TYPES[raw] || TYPES['DIRT']);
      ctx.fillStyle = tile.bg; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = tile.fg; ctx.fillText(tile.char, x, y);
    }
  }

  // Stockpiles
  for (const s of stockpiles.values()) {
    if (s.z !== camZ || !isRevealed(camZ, s.r, s.c)) continue;
    const x = s.c * TILE - camX, y = s.r * TILE - camY;
    ctx.fillStyle = s.item ? 'rgba(0,180,255,0.3)' : 'rgba(0,100,180,0.2)';
    ctx.fillRect(x, y, TILE, TILE);
    if (s.item) { ctx.fillStyle = '#0af'; ctx.font = `${TILE}px monospace`; ctx.fillText('*', x, y); }
  }

  // Loose resources
  ctx.font = `${TILE}px monospace`;
  for (const res of resources.values()) {
    if (res.z !== camZ || !isRevealed(camZ, res.r, res.c)) continue;
    const x = res.c * TILE - camX, y = res.r * TILE - camY;
    ctx.fillStyle = res.type === 'stone' ? '#aaa'
                  : res.type === 'wood'  ? '#a63'
                  : res.type === 'iron'  ? '#a88'
                  : res.type === 'coal'  ? '#556'
                  : res.type === 'gold'  ? '#fd0'
                  : res.type === 'gem'   ? '#0ff'
                  : res.type === 'meat'  ? '#f88'
                  : '#a87'; // dirt/sand
    ctx.fillText('*', x, y);
  }

  for (const p of farmPlots.values()) {
    if (p.z !== camZ || !isRevealed(camZ, p.r, p.c)) continue;
    const x = p.c * TILE - camX, y = p.r * TILE - camY;
    ctx.fillStyle = 'rgba(68,170,68,0.25)'; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#4a2'; ctx.fillText(',', x, y);
  }

  // Food
  for (const f of food.values()) {
    if (f.z !== camZ || !isRevealed(camZ, f.r, f.c)) continue;
    const x = f.c * TILE - camX, y = f.r * TILE - camY;
    ctx.fillStyle = '#4f4'; ctx.fillText('%', x, y);
  }

  // Wildlife
  for (const a of wildlife.values()) {
    if (a.z !== camZ || !isRevealed(camZ, a.r, a.c)) continue;
    const x = a.c * TILE - camX, y = a.r * TILE - camY;
    ctx.fillStyle = a.color;
    ctx.fillText(a.char, x, y);
    // HP bar when damaged
    if (a.hp < a.maxHp) {
      const pct = a.hp / a.maxHp;
      ctx.fillStyle = '#300'; ctx.fillRect(x, y + TILE - 3, TILE, 3);
      ctx.fillStyle = pct > 0.5 ? '#4f4' : pct > 0.25 ? '#fa0' : '#f44';
      ctx.fillRect(x, y + TILE - 3, Math.round(TILE * pct), 3);
    }
  }

  // Trees
  ctx.font = `${TILE}px monospace`;
  for (const t of trees.values()) {
    if (t.z !== camZ || !isRevealed(camZ, t.r, t.c)) continue;
    const x = t.c * TILE - camX, y = t.r * TILE - camY;
    const chop = chopJobs.get(`${t.z},${t.r},${t.c}`);
    ctx.fillStyle = chop ? (chop.claimedBy ? '#6a2' : '#8f4') : '#2a5';
    ctx.fillText('T', x, y);
  }

  // Destroy designations — red X overlay
  for (const job of destroyJobs.values()) {
    if (job.z !== camZ || !isRevealed(camZ, job.r, job.c)) continue;
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
    if (job.z !== camZ || !isRevealed(camZ, job.r, job.c)) continue;
    const x = job.c * TILE - camX, y = job.r * TILE - camY;
    ctx.fillStyle = job.claimedBy ? '#a0a' : '#f0f';
    const ch = job.type==='wall' ? '#'
             : job.type==='floor' ? '_'
             : job.type==='stair' ? '/'
             : job.type==='door' ? 'D' : job.type==='workshop' ? 'W'
             : job.type==='bed' ? '=' : job.type==='chair' ? 'h'
             : job.type==='table' ? 'T' : job.type==='chest' ? 'c'
             : job.type==='barrel' ? 'n' : 'O';
    ctx.fillText(ch, x, y);
  }

  // Workshops
  for (const w of workshops.values()) {
    if (w.z !== camZ || !isRevealed(camZ, w.r, w.c)) continue;
    const x = w.c * TILE - camX, y = w.r * TILE - camY;
    ctx.fillStyle = w.claimedBy ? '#a60' : '#f80'; ctx.font = `${TILE}px monospace`;
    ctx.fillText('W', x, y);
  }

  // Doors
  for (const d of doors.values()) {
    if (d.z !== camZ || !isRevealed(camZ, d.r, d.c)) continue;
    const x = d.c * TILE - camX, y = d.r * TILE - camY;
    ctx.fillStyle = '#a64'; ctx.font = `${TILE}px monospace`;
    ctx.fillText('+', x, y);
  }

  // Furniture
  for (const f of furniture.values()) {
    if (f.z !== camZ || !isRevealed(camZ, f.r, f.c)) continue;
    const x = f.c * TILE - camX, y = f.r * TILE - camY;
    ctx.fillStyle = '#ca8'; ctx.font = `${TILE}px monospace`;
    ctx.fillText(FURNITURE_GLYPHS[f.type] || '?', x, y);
  }

  // Stairs
  for (const s of stairs.values()) {
    if (s.z !== camZ || !isRevealed(camZ, s.r, s.c)) continue;
    const x = s.c * TILE - camX, y = s.r * TILE - camY;
    ctx.fillStyle = '#ff8'; ctx.font = `${TILE}px monospace`;
    ctx.fillText('/', x, y);
  }

  // Beds
  for (const b of beds.values()) {
    if (b.z !== camZ || !isRevealed(camZ, b.r, b.c)) continue;
    const x = b.c * TILE - camX, y = b.r * TILE - camY;
    ctx.fillStyle = b.claimedBy ? '#88f' : '#44a'; ctx.font = `${TILE}px monospace`;
    ctx.fillText('=', x, y);
  }

  // Mode indicator
  const activeMode = digMode ? 'DIG' : digStairMode ? 'DIG STAIR' : chopMode ? 'CHOP' : destroyMode ? 'DESTROY' : attackMode ? 'ATTACK' : stockpileMode ? 'STOCKPILE' : farmMode ? 'FARM' : cancelMode ? 'CANCEL JOBS' : selectMode ? 'SELECT' : buildMode ? `BUILD: ${buildMode.toUpperCase()}` : null;
  if (activeMode) {
    ctx.font = 'bold 13px monospace'; ctx.textBaseline = 'top';
    const label = `-- ${activeMode} MODE --`;
    const tw = ctx.measureText(label).width;
    const tx = (canvas.width - tw) / 2, ty = 10;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(tx - 8, ty - 4, tw + 16, 22);
    ctx.fillStyle = '#f80'; ctx.fillText(label, tx, ty);
  }

  // Hover tooltip
  const { r: hr, c: hc } = hoverTile;
  if (!overworldView && hr >= 0 && hr < ROWS && hc >= 0 && hc < COLS && isRevealed(camZ, hr, hc)) {
    const lines = [];
    const t = map[camZ][hr][hc];
    lines.push(t.toLowerCase());
    const k = tileKey(camZ, hr, hc);
    const dw = dwarves.find(d => !d.dead && d.r === hr && d.c === hc && d.z === camZ && d.wx === owCurX && d.wy === owCurY);
    if (dw) lines.push(`@ ${dw.name} — ${dw.job}${dw.carrying ? ' ['+dw.carrying+']' : ''} hp:${dw.hp??10}/${dw.maxHp??10}`);
    const aw = [...wildlife.values()].find(a => a.r === hr && a.c === hc && a.z === camZ);
    if (aw) lines.push(`${aw.type} (hp:${aw.hp}/${aw.maxHp})${aw.hostile ? ' !' : ''}`);
    if (digJobs.has(k))      lines.push('job: dig');
    if (digStairJobs.has(k)) lines.push('job: dig stair');
    if (buildJobs.has(k))    lines.push(`job: build ${buildJobs.get(k).type}`);
    if (chopJobs.has(k))     lines.push('job: chop');
    if (destroyJobs.has(k))  lines.push('job: destroy');
    if (stockpiles.has(k))   { const s = stockpiles.get(k); lines.push(`stockpile${s.item ? ': '+s.item : ' (empty)'}`); }
    if (resources.has(k))    lines.push(`resource: ${resources.get(k).type}`);
    if (stairs.has(k))       lines.push('stair');
    if (doors.has(k))        lines.push('door');
    if (workshops.has(k))    lines.push('workshop');
    if (beds.has(k))         lines.push('bed');
    if (furniture.has(k))    lines.push(`furniture: ${furniture.get(k).type}`);
    if (trees.has(k))        lines.push('tree');
    if (lines.length > 1 || lines[0] !== 'air') {
      const pad = 6, lh = 14, fw = 7;
      const tw = Math.max(...lines.map(l => l.length)) * fw + pad * 2;
      const th = lines.length * lh + pad * 2;
      let tx = hc * TILE - camX + TILE + 4;
      let ty = hr * TILE - camY;
      if (tx + tw > canvas.width)  tx = hc * TILE - camX - tw - 4;
      if (ty + th > canvas.height) ty = canvas.height - th - 4;
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.fillRect(tx, ty, tw, th);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
      ctx.strokeRect(tx, ty, tw, th);
      ctx.font = '12px monospace'; ctx.textBaseline = 'top';
      lines.forEach((l, i) => {
        ctx.fillStyle = i === 0 ? '#888' : l.startsWith('@') ? '#0f0' : '#ccc';
        ctx.fillText(l, tx + pad, ty + pad + i * lh);
      });
    }
  }
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
    const hoverRevealed = isRevealed(camZ, hoverTile.r, hoverTile.c);
    if (!hoverRevealed && !digMode && !digStairMode) return; // only dig modes show on dark tiles
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

  // Dwarves — always visible regardless of fog
  for (const d of dwarves) {
    if (d.wx !== owCurX || d.wy !== owCurY) continue;
    if (d.z !== camZ) continue;
    const x = d.c * TILE - camX, y = d.r * TILE - camY;
    if (x < -TILE || y < -TILE || x > canvas.width || y > canvas.height) continue;
    ctx.font = `${TILE}px monospace`; ctx.textBaseline = 'top';
    ctx.fillStyle = d.dead ? '#555' : selected.has(d) ? '#ff0' : (d.stuckTicks >= 10) ? '#f44' : '#0f0';
    ctx.fillText(d.dead ? 'X' : '@', x, y);
    if (d.carrying) { ctx.fillStyle = '#0af'; ctx.font = '10px monospace'; ctx.fillText(d.carrying[0], x + TILE - 6, y); }
    // HP bar
    if (!d.dead && (d.hp ?? 10) < (d.maxHp ?? 10)) {
      const pct = (d.hp ?? 10) / (d.maxHp ?? 10);
      ctx.fillStyle = '#300'; ctx.fillRect(x, y + TILE - 3, TILE, 3);
      ctx.fillStyle = pct > 0.5 ? '#4f4' : pct > 0.25 ? '#fa0' : '#f44';
      ctx.fillRect(x, y + TILE - 3, Math.round(TILE * pct), 3);
    }
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

  for (let wy = 0; wy < OW_ROWS; wy++) {
    for (let wx = 0; wx < OW_COLS; wx++) {
      const tile = overworld[wy][wx], b = BIOMES[tile.biome];
      const x = offX + wx * t, y = offY + wy * t;
      // Tint unvisited tiles very dark but still show biome color faintly
      ctx.fillStyle = tile.visited ? b.bg : '#050505'; ctx.fillRect(x, y, t, t);
      ctx.fillStyle = tile.visited ? b.fg : '#222';    ctx.fillText(b.char, x, y);
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
