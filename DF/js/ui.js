// ui.js — sidebar and mode management

let _msgTimer = null;
function showMessage(text) {
  const el = document.getElementById('ui-message');
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(_msgTimer);
  _msgTimer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

const MAT_LABELS = { stone:'Stone', dirt:'Dirt', sand:'Sand', hardstone:'Hardstone', obsidian:'Obsidian', iron:'Iron', coal:'Coal', gold:'Gold', gem:'Gem', wood:'Wood' };
const MAT_ORDER  = ['stone','dirt','sand','hardstone','obsidian','iron','coal','gold','gem','wood'];
const WOOD_MODES = new Set(['bed','chair','table','chest','barrel','workshop']);

function setActiveMaterial(type) {
  activeMaterial = type;
}

function setBuildMode(mode) {
  buildMode = buildMode === mode ? null : mode;
}

function setMode(mode) {
  if (mode === 'build') {
    const sub = document.getElementById('build-submenu');
    const open = sub.style.display === 'flex';
    sub.style.display = open ? 'none' : 'flex';
    if (open) buildMode = null;
    digMode = false; chopMode = false; destroyMode = false; stockpileMode = false;
    farmMode = false; selectMode = false; digStairMode = false; cancelMode = false;
    return;
  }
  digMode       = mode === 'dig'       ? !digMode       : false;
  digStairMode  = mode === 'dig-stair' ? !digStairMode  : false;
  chopMode      = mode === 'chop'      ? !chopMode      : false;
  destroyMode   = mode === 'destroy'   ? !destroyMode   : false;
  stockpileMode = mode === 'stock'     ? !stockpileMode : false;
  farmMode      = mode === 'farm'      ? !farmMode      : false;
  selectMode    = mode === 'select'    ? !selectMode    : false;
  cancelMode    = mode === 'cancel'    ? !cancelMode    : false;
  attackMode    = mode === 'attack'    ? !attackMode    : false;
  buildMode     = null;
  document.getElementById('build-submenu').style.display = 'none';
  document.getElementById('select-submenu').style.display = selectMode ? 'flex' : 'none';
}

function updateSidebar() {
  const year   = 1 + Math.floor(gameTick / 40);
  const season = SEASONS[Math.floor((gameTick % 40) / 10)];
  document.getElementById('ui-time').textContent    = `Y${year} ${season} ${isNight() ? '☽' : '☀'}${paused ? ' ⏸' : ''}`;
  document.getElementById('ui-zlevel').textContent  = `${camZ} (↑↓)`;
  document.getElementById('zlevel-display').textContent = camZ;
  document.getElementById('ui-biome').textContent   = overworld[owCurY][owCurX].biome;
  document.getElementById('ui-dwarves').textContent = `${dwarves.filter(d=>!d.dead).length}/7`;

  const counts = {};
  for (const r of resources.values())  counts[r.type]  = (counts[r.type]  || 0) + 1;
  for (const s of stockpiles.values()) if (s.item) counts[s.item] = (counts[s.item] || 0) + 1;

  const buildOpen = document.getElementById('build-submenu').style.display === 'flex';

  // Material buttons
  for (const mat of MAT_ORDER) {
    const btn = document.getElementById('mat-' + mat);
    if (!btn) continue;
    const n = counts[mat] || 0;
    btn.textContent = `${MAT_LABELS[mat]}(${n})`;
    btn.classList.toggle('active', activeMaterial === mat);
    btn.style.color = n > 0 ? '' : '#555';
  }

  // Build type buttons + cost subtext
  const BUILD_COSTS = {
    wall:     () => `1 ${MAT_LABELS[activeMaterial]} (${counts[activeMaterial]||0})`,
    floor:    () => `1 ${MAT_LABELS[activeMaterial]} (${counts[activeMaterial]||0})`,
    stair:    () => `1 ${MAT_LABELS[activeMaterial]} (${counts[activeMaterial]||0})`,
    door:     () => `1 ${MAT_LABELS[activeMaterial]} (${counts[activeMaterial]||0})`,
    workshop: () => `1 Wood (${counts.wood||0})`,
    bed:      () => `1 Wood (${counts.wood||0})`,
    chair:    () => `1 Wood (${counts.wood||0})`,
    table:    () => `1 Wood (${counts.wood||0})`,
    chest:    () => `1 Wood (${counts.wood||0})`,
    barrel:   () => `1 Wood (${counts.wood||0})`,
  };
  for (const [mode, costFn] of Object.entries(BUILD_COSTS)) {
    const btn  = document.getElementById('btn-'  + mode);
    const cost = document.getElementById('cost-' + mode);
    if (!btn || !cost) continue;
    btn.classList.toggle('active', buildMode === mode);
    const matNeeded = WOOD_MODES.has(mode) ? 'wood' : activeMaterial;
    const affordable = (counts[matNeeded] || 0) > 0;
    cost.textContent = costFn();
    cost.style.color = affordable ? '#888' : '#a44';
  }

  document.getElementById('btn-pause').classList.toggle('active', paused);
  document.getElementById('btn-select').classList.toggle('active', selectMode);
  document.getElementById('btn-cancel').classList.toggle('active', cancelMode);
  document.getElementById('btn-attack').classList.toggle('active', attackMode);
  document.getElementById('btn-dig').classList.toggle('active', digMode);
  document.getElementById('btn-dig-stair').classList.toggle('active', digStairMode);
  document.getElementById('btn-chop').classList.toggle('active', chopMode);
  document.getElementById('btn-destroy').classList.toggle('active', destroyMode);
  document.getElementById('btn-stock').classList.toggle('active', stockpileMode);
  document.getElementById('btn-farm').classList.toggle('active', farmMode);
  document.getElementById('btn-build').classList.toggle('active', buildOpen || !!buildMode);

  const list = document.getElementById('dwarf-list');
  if (list.children.length !== dwarves.length) {
    list.innerHTML = '';
    for (const d of dwarves) {
      const row = document.createElement('div');
      row.className = 'dwarf-row';
      row.innerHTML = `<span class="dname"></span><span class="djob"></span>`;
      row.onclick = () => {
        if (selected.has(d)) selected.delete(d); else { selected.clear(); selected.add(d); }
        if (selected.has(d)) {
          if (d.wx !== owCurX || d.wy !== owCurY) zoomInTo(d.wx, d.wy);
          overworldView = false;
          camZ = d.z;
          camX = d.c * TILE - canvas.width / 2;
          camY = d.r * TILE - canvas.height / 2;
          clampCam();
        }
      };
      list.appendChild(row);
    }
  }
  dwarves.forEach((d, i) => {
    const row = list.children[i];
    row.className = 'dwarf-row' + (d.dead ? ' dead' : '') + (selected.has(d) ? ' selected' : '');
    row.querySelector('.dname').textContent = `${d.dead ? 'X' : '@'} ${d.name}`;
    row.querySelector('.djob').textContent  = d.dead ? '' : d.job;
  });

  const detail = document.getElementById('dwarf-detail');
  const sel1 = selected.size === 1 ? [...selected][0] : null;
  if (sel1) {
    detail.style.display = '';
    document.getElementById('detail-name').textContent = sel1.name;
    document.getElementById('detail-job').textContent  = sel1.job;
    const hpPct = Math.round(((sel1.hp ?? 10) / (sel1.maxHp ?? 10)) * 100);
    const hpEl = document.getElementById('detail-hp');
    if (hpEl) { hpEl.textContent = `${sel1.hp ?? 10}/${sel1.maxHp ?? 10}`; hpEl.style.color = hpPct <= 30 ? '#f44' : hpPct <= 60 ? '#fa0' : '#4f4'; }
    const hungerPct = Math.min(100, Math.round(((sel1.hunger||0) / HUNGER_TICKS) * 100));
    const hungerEl = document.getElementById('detail-hunger');
    if (hungerEl) { hungerEl.textContent = `${hungerPct}%`; hungerEl.style.color = hungerPct >= 100 ? '#f44' : hungerPct > 60 ? '#fa0' : '#4f4'; }
    document.getElementById('btn-cancel-job').style.display =
      (sel1.job !== 'Idle' && sel1.job !== 'Walking') ? '' : 'none';
  } else {
    detail.style.display = 'none';
  }
}
