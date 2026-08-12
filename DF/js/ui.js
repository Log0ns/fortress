// ui.js — sidebar and mode management

let _msgTimer = null;
function showMessage(text) {
  const el = document.getElementById('ui-message');
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(_msgTimer);
  _msgTimer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function setMode(mode) {
  if (mode === 'build') {
    const sub = document.getElementById('build-submenu');
    const open = sub.style.display === 'flex';
    sub.style.display = open ? 'none' : 'flex';
    if (open) buildMode = null;
    digMode = false; chopMode = false; destroyMode = false; stockpileMode = false; farmMode = false; selectMode = false; digStairDownMode = false; digStairUpMode = false;
    updateSidebar(); return;
  }
  digMode          = mode === 'dig'          ? !digMode          : false;
  digStairDownMode  = mode === 'dig-stair-dn' ? !digStairDownMode  : false;
  digStairUpMode    = mode === 'dig-stair-up' ? !digStairUpMode    : false;
  chopMode          = mode === 'chop'         ? !chopMode          : false;
  destroyMode       = mode === 'destroy'      ? !destroyMode       : false;
  stockpileMode     = mode === 'stock'        ? !stockpileMode     : false;
  farmMode          = mode === 'farm'         ? !farmMode          : false;
  selectMode        = mode === 'select'       ? !selectMode        : false;
  buildMode     = BUILD_TYPES.includes(mode) ? (buildMode === mode ? null : mode) : null;
  if (!buildMode) document.getElementById('build-submenu').style.display = 'none';
  updateSidebar();
}

function updateSidebar() {
  const year   = 1 + Math.floor(gameTick / 40);
  const season = SEASONS[Math.floor((gameTick % 40) / 10)];
  document.getElementById('ui-time').textContent    = `Y${year} ${season} ${isNight() ? '☽' : '☀'}`;
  document.getElementById('ui-zlevel').textContent  = `${camZ} (\u2191\u2193)`;
  document.getElementById('ui-biome').textContent   = overworld[owCurY][owCurX].biome;
  document.getElementById('ui-dwarves').textContent = `${dwarves.filter(d=>!d.dead).length}/7`;
  const { r: hr, c: hc } = hoverTile;
  let hoverText = '-';
  if (!overworldView && hr >= 0 && hr < ROWS && hc >= 0 && hc < COLS) {
    hoverText = map[camZ][hr][hc].toLowerCase();
    const sp = stockpiles.get(`${camZ},${hr},${hc}`);
    if (sp) hoverText += sp.item ? ` [${sp.item}]` : ' [empty]';
  }
  document.getElementById('ui-hover').textContent = hoverText;
  document.getElementById('ui-wood').textContent    = [...stockpiles.values()].filter(s=>s.item==='wood').length;
  document.getElementById('ui-stone').textContent   = [...stockpiles.values()].filter(s=>s.item==='stone').length;
  document.getElementById('ui-dirt').textContent    = [...stockpiles.values()].filter(s=>s.item==='dirt').length;
  document.getElementById('ui-food').textContent    = food.size;
  document.getElementById('ui-farms').textContent   = farmPlots.size;

  document.getElementById('btn-select').classList.toggle('active', selectMode);
  document.getElementById('btn-dig').classList.toggle('active', digMode);
  document.getElementById('btn-dig-stair-dn').classList.toggle('active', digStairDownMode);
  document.getElementById('btn-dig-stair-up').classList.toggle('active', digStairUpMode);
  document.getElementById('btn-chop').classList.toggle('active', chopMode);
  document.getElementById('btn-destroy').classList.toggle('active', destroyMode);
  document.getElementById('btn-stock').classList.toggle('active', stockpileMode);
  document.getElementById('btn-farm').classList.toggle('active', farmMode);
  const buildOpen = document.getElementById('build-submenu').style.display === 'flex';
  document.getElementById('btn-build').classList.toggle('active', buildOpen || !!buildMode);
  document.getElementById('btn-stone-wall').classList.toggle('active',  buildMode==='stone-wall');
  document.getElementById('btn-dirt-wall').classList.toggle('active',   buildMode==='dirt-wall');
  document.getElementById('btn-stone-floor').classList.toggle('active', buildMode==='stone-floor');
  document.getElementById('btn-dirt-floor').classList.toggle('active',  buildMode==='dirt-floor');
  document.getElementById('btn-stair-up').classList.toggle('active',    buildMode==='stair-up');
  document.getElementById('btn-stair-dn').classList.toggle('active',    buildMode==='stair-down');
  document.getElementById('btn-workshop').classList.toggle('active',    buildMode==='workshop');
  document.getElementById('btn-door').classList.toggle('active',        buildMode==='door');
  document.getElementById('btn-bed').classList.toggle('active',         buildMode==='bed');
  document.getElementById('btn-chair').classList.toggle('active',       buildMode==='chair');
  document.getElementById('btn-table').classList.toggle('active',       buildMode==='table');
  document.getElementById('btn-chest').classList.toggle('active',       buildMode==='chest');
  document.getElementById('btn-barrel').classList.toggle('active',      buildMode==='barrel');

  const list = document.getElementById('dwarf-list');
  // Rebuild only if row count changed, otherwise just update classes/text in place
  if (list.children.length !== dwarves.length) {
    list.innerHTML = '';
    for (const d of dwarves) {
      const row = document.createElement('div');
      row.className = 'dwarf-row';
      row.innerHTML = `<span class="dname"></span>`;
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
        updateSidebar();
      };
      list.appendChild(row);
    }
  }
  dwarves.forEach((d, i) => {
    const row = list.children[i];
    row.className = 'dwarf-row' + (d.dead ? ' dead' : '') + (selected.has(d) ? ' selected' : '');
    row.querySelector('.dname').textContent = `${d.dead ? 'X' : '@'} ${d.name}`;
  });

  const detail = document.getElementById('dwarf-detail');
  const detailDwarf = selected.size === 1 ? [...selected][0] : null;
  if (detailDwarf) {
    detail.style.display = '';
    document.getElementById('detail-name').textContent = detailDwarf.name;
    document.getElementById('detail-job').textContent  = detailDwarf.job;
    document.getElementById('detail-health-bar').style.width = detailDwarf.health + '%';
  } else {
    detail.style.display = 'none';
  }
}
