// save.js — localStorage save/load

const SAVE_KEY = 'df_save';

function _serializeMap(m) {
  // RLE encode: store runs of [value, count]
  const runs = [];
  let cur = null, count = 0;
  for (let z = 0; z < LEVELS; z++)
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const v = m[z][r][c];
        if (v === cur) { count++; }
        else { if (cur !== null) runs.push([cur, count]); cur = v; count = 1; }
      }
  if (cur !== null) runs.push([cur, count]);
  return runs;
}

function _deserializeMap(runs) {
  const m = Array.from({length:LEVELS}, () => Array.from({length:ROWS}, () => new Array(COLS)));
  let z = 0, r = 0, c = 0;
  for (const [v, count] of runs) {
    for (let i = 0; i < count; i++) {
      m[z][r][c] = v;
      if (++c >= COLS) { c = 0; if (++r >= ROWS) { r = 0; z++; } }
    }
  }
  return m;
}

function saveGame() {
  const cachedChunks = [];
  for (const [key, entry] of chunkCache) {
    const [wx, wy] = key.split(',').map(Number);
    cachedChunks.push({ wx, wy, camZ: entry.camZ,
      map: _serializeMap(entry.map),
      surfaceZ: entry.surfaceZ,
      trees: [...(entry.trees?.values() ?? [])].map(({z,r,c})=>({z,r,c})) });
  }

  const owVisited = overworld.map(row => row.map(t => t.visited));

  const state = {
    gameTick, camZ, camX, camY, owCurX, owCurY,
    noisePerm, owEseed: OW_ESEED, owMseed: OW_MSEED,
    map: _serializeMap(map), surfaceZ,
    cachedChunks, owVisited,
    dwarves:    dwarves.map(d => ({ name:d.name, job:d.job, health:d.health, c:d.c, r:d.r, z:d.z, wx:d.wx, wy:d.wy, dead:d.dead, sleeping:d.sleeping })),
    food:       [...food.values()].map(({z,r,c})=>({z,r,c})),
    resources:  [...resources.values()].map(({z,r,c,type})=>({z,r,c,type})),
    stockpiles: [...stockpiles.values()].map(({z,r,c,item})=>({z,r,c,item})),
    digJobs:    [...digJobs.values()].map(({z,r,c})=>({z,r,c})),
    digStairJobs: [...digStairJobs.values()].map(({z,r,c,stairType})=>({z,r,c,stairType})),
    chopJobs:   [...chopJobs.values()].map(({z,r,c})=>({z,r,c})),
    destroyJobs: [...destroyJobs.values()].map(({z,r,c,entity,buildType})=>({z,r,c,entity,buildType})),
    trees:      [...trees.values()].map(({z,r,c})=>({z,r,c})),
    buildJobs:  [...buildJobs.values()].map(({z,r,c,type})=>({z,r,c,type})),
    workshops:  [...workshops.values()].map(({z,r,c})=>({z,r,c})),
    stairs:     [...stairs.values()].map(({z,r,c,type})=>({z,r,c,type})),
    beds:       [...beds.values()].map(({z,r,c})=>({z,r,c})),
    doors:      [...doors.values()].map(({z,r,c})=>({z,r,c})),
    furniture:  [...furniture.values()].map(({z,r,c,type})=>({z,r,c,type})),
    farmPlots:  [...farmPlots.values()].map(({z,r,c,stage})=>({z,r,c,stage})),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    const el = document.getElementById('ui-save-status');
    el.textContent = 'Saved Y' + (1+Math.floor(gameTick/40)) + ' ' + SEASONS[Math.floor((gameTick%40)/10)];
    setTimeout(() => { el.textContent = ''; }, 3000);
  } catch(e) { document.getElementById('ui-save-status').textContent = 'Save failed!'; }
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { document.getElementById('ui-save-status').textContent = 'No save found.'; return; }
  const s = JSON.parse(raw);

  gameTick = s.gameTick; camZ = s.camZ; camX = s.camX; camY = s.camY;
  if (s.owCurX != null) { owCurX = s.owCurX; owCurY = s.owCurY; }

  // Restore noise and overworld seeds before any chunk generation
  if (s.noisePerm) initNoise(s.noisePerm);
  if (s.owEseed != null) { OW_ESEED = s.owEseed; OW_MSEED = s.owMseed; regenerateOverworld(); }

  // Restore overworld visited flags
  if (s.owVisited) s.owVisited.forEach((row, r) => row.forEach((v, c) => { overworld[r][c].visited = v; }));

  // Restore cached chunks
  chunkCache.clear();
  if (s.cachedChunks) {
    for (const entry of s.cachedChunks) {
      const m = _deserializeMap(entry.map);
      const t = new Map();
      (entry.trees||[]).forEach(o => t.set(`${o.z},${o.r},${o.c}`, {...o}));
      chunkCache.set(`${entry.wx},${entry.wy}`, { map: m, surfaceZ: entry.surfaceZ, camZ: entry.camZ, trees: t });
    }
  }

  // Restore current chunk map and surfaceZ directly
  const restoredMap = _deserializeMap(s.map);
  for (let z = 0; z < LEVELS; z++)
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        map[z][r][c] = restoredMap[z][r][c];
  if (s.surfaceZ) surfaceZ = s.surfaceZ;

  dwarves.forEach((d, i) => {
    const sd = s.dwarves[i];
    d.name=sd.name; d.job=sd.job; d.health=sd.health;
    d.c=sd.c; d.r=sd.r; d.z=sd.z; d.wx=sd.wx ?? owCurX; d.wy=sd.wy ?? owCurY; d.dead=sd.dead;
    d.path=null; d.digTarget=null; d.chopTarget=null; d.destroyTarget=null; d.haulResource=null; d.haulTarget=null;
    d.carrying=null; d.eating=null; d.buildJob=null; d.buildStone=null;
    d.buildWorkshop=null; d.buildPhase=null; d.farmPlot=null;
    d.sleeping=sd.sleeping??false; d.sleepTarget=null;
  });

  food.clear();       s.food.forEach(o       => food.set(`${o.z},${o.r},${o.c}`, {...o, claimedBy:null}));
  resources.clear();  s.resources.forEach(o  => resources.set(`${o.z},${o.r},${o.c}`, {...o, claimedBy:null}));
  stockpiles.clear(); s.stockpiles.forEach(o => stockpiles.set(`${o.z},${o.r},${o.c}`, {...o}));
  digJobs.clear();    s.digJobs.forEach(o    => digJobs.set(`${o.z},${o.r},${o.c}`, {...o, claimedBy:null}));
  digStairJobs.clear(); (s.digStairJobs||[]).forEach(o => digStairJobs.set(`${o.z},${o.r},${o.c}`, {...o, claimedBy:null}));
  chopJobs.clear();    (s.chopJobs||[]).forEach(o    => chopJobs.set(`${o.z},${o.r},${o.c}`, {...o, claimedBy:null}));
  destroyJobs.clear(); (s.destroyJobs||[]).forEach(o => destroyJobs.set(`${o.z},${o.r},${o.c}`, {...o, claimedBy:null}));
  trees.clear();      (s.trees||[]).forEach(o    => trees.set(`${o.z},${o.r},${o.c}`, {...o}));
  buildJobs.clear();  s.buildJobs.forEach(o  => buildJobs.set(`${o.z},${o.r},${o.c}`, {...o, claimedBy:null}));
  workshops.clear();  s.workshops.forEach(o  => workshops.set(`${o.z},${o.r},${o.c}`, {...o, claimedBy:null}));
  stairs.clear();     s.stairs.forEach(o     => stairs.set(`${o.z},${o.r},${o.c}`, {...o}));
  beds.clear();       (s.beds||[]).forEach(o  => beds.set(`${o.z},${o.r},${o.c}`, {...o, claimedBy:null}));
  doors.clear();      (s.doors||[]).forEach(o => doors.set(`${o.z},${o.r},${o.c}`, {...o}));
  furniture.clear();  (s.furniture||[]).forEach(o => furniture.set(`${o.z},${o.r},${o.c}`, {...o}));
  farmPlots.clear();  s.farmPlots.forEach(o  => farmPlots.set(`${o.z},${o.r},${o.c}`, {...o, claimedBy:null}));

  selected.clear(); clampCam();
  const el = document.getElementById('ui-save-status');
  el.textContent = 'Loaded!';
  setTimeout(() => { el.textContent = ''; }, 3000);
  updateSidebar();
}

let lastAutoSave = 0;
function maybeAutoSave() {
  if (gameTick - lastAutoSave >= 30) { lastAutoSave = gameTick; saveGame(); }
}
