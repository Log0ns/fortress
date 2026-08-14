// state.js — all shared mutable game state

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
let gameTick = 0;
let lastTick  = 0;
const TICK_MS = 2000;

let camZ = 0; // set after chunk generation
let camX = 0, camY = 0;
let overworldView = false;
const selected = new Set();

// --- Mode flags ---
let digMode      = false;
let digStairMode = false;
let stockpileMode = false;
let buildMode    = null;
let farmMode     = false;
let chopMode     = false;
let destroyMode  = false;
let selectMode   = false;
let cancelMode   = false;
let paused       = false;
let hoverTile    = { r: 0, c: 0 };
const BUILD_TYPES = ['workshop', 'stone', 'dirt', 'stone-floor', 'dirt-floor', 'stair', 'door', 'bed', 'chair', 'table', 'chest', 'barrel'];
const WORKSHOP_TYPES = new Set(['stone-floor','door','bed','chair','table','chest','barrel']);

// --- Entity maps ---
const food       = new Map();
const resources  = new Map();
const stockpiles = new Map();
const digJobs      = new Map();
const digStairJobs = new Map();
const buildJobs       = new Map();
const chopJobs   = new Map();
const destroyJobs = new Map();
const trees      = new Map();
const workshops  = new Map();
const beds       = new Map();
const doors      = new Map();
const furniture  = new Map();
const stairs     = new Map();
const farmPlots  = new Map();

function spawnResource(z, r, c, type) {
  // BFS outward to find a free passable tile
  const q = [{z,r,c}], seen = new Set([tileKey(z,r,c)]);
  while (q.length) {
    const t = q.shift();
    if (passable(t.z,t.r,t.c) && !resources.has(tileKey(t.z,t.r,t.c))) {
      resources.set(tileKey(t.z,t.r,t.c), { z:t.z, r:t.r, c:t.c, type, claimedBy:null }); return;
    }
    for (const [dr,dc] of DIRS) {
      const nr=t.r+dr, nc=t.c+dc, nk=tileKey(t.z,nr,nc);
      if (!seen.has(nk) && nr>=0 && nr<ROWS && nc>=0 && nc<COLS) { seen.add(nk); q.push({z:t.z,r:nr,c:nc}); }
    }
    if (seen.size > 64) break; // give up after reasonable search
  }
}

// Farm display constants
const DAY_LENGTH = 440;
function timeOfDay() { return (gameTick % DAY_LENGTH) / DAY_LENGTH; }
function isNight()   { return timeOfDay() > 0.909; }

// --- Chunk cache ---
const chunkCache = new Map();

// --- Overworld ---
const OW_COLS = 40, OW_ROWS = 25;
const BIOMES = {
  ocean:    { char: '~', fg: '#26f', bg: '#001133' },
  coast:    { char: '.', fg: '#da8', bg: '#112200' },
  plains:   { char: '.', fg: '#8c6', bg: '#0a1a00' },
  forest:   { char: 'T', fg: '#2a5', bg: '#051005' },
  mountain: { char: '^', fg: '#aaa', bg: '#1a1a1a' },
  desert:   { char: '.', fg: '#db8', bg: '#1a1200' },
  tundra:   { char: '.', fg: '#acd', bg: '#0a0f14' },
};

let OW_ESEED = Math.random() * 999;
let OW_MSEED = Math.random() * 999;

function regenerateOverworld() {
  for (let r = 0; r < OW_ROWS; r++)
    for (let c = 0; c < OW_COLS; c++) {
      const elev  = (noise(c * 0.15 + OW_ESEED, r * 0.15 + OW_ESEED) + 1) / 2;
      const moist = (noise(c * 0.12 + OW_MSEED, r * 0.12 + OW_MSEED) + 1) / 2;
      let biome;
      if      (elev < 0.30)                  biome = 'ocean';
      else if (elev < 0.38)                  biome = 'coast';
      else if (elev > 0.75)                  biome = 'mountain';
      else if (moist > 0.65)                 biome = 'forest';
      else if (moist < 0.30 && elev < 0.65)  biome = 'desert';
      else if (moist < 0.35 && elev > 0.60)  biome = 'tundra';
      else                                   biome = 'plains';
      overworld[r][c].biome = biome;
    }
}

const overworld = Array.from({ length: OW_ROWS }, () =>
  Array.from({ length: OW_COLS }, () => ({ biome: 'plains', visited: false }))
);
regenerateOverworld();

// Find starting chunk — first non-ocean tile near centre
let owCurX = OW_COLS >> 1, owCurY = OW_ROWS >> 1;
let owCursorX = owCurX, owCursorY = owCurY;
for (let dc = 0; dc < OW_COLS; dc++) {
  const cx = (owCurX + dc) % OW_COLS;
  if (overworld[owCurY][cx].biome !== 'ocean') { owCurX = cx; break; }
}
overworld[owCurY][owCurX].visited = true;

// Generate the starting chunk — surfaceZ and map are declared in engine.js as lets
{
  const chunk = generateChunk(owCurX, owCurY, overworld[owCurY][owCurX].biome);
  surfaceZ = chunk.surfaceZ;
  map      = chunk.map;
  for (const [k,v] of chunk.trees) trees.set(k,v);
}
camZ = surfaceZ[COLS >> 1][ROWS >> 1];

// --- Dwarves & starting food (after chunk gen so surfaceZ is ready) ---
const NAMES = ['Urist','Bomrek','Fikod','Meng','Doren','Sibrek','Kol'];

const dwarves = NAMES.map((name, i) => {
  const c = 75 + i * 2;
  const r = 45 + (i % 3);
  const z = surfaceZ[c][r];
  return { name, job: 'Idle', c, r, z, wx: owCurX, wy: owCurY, dead: false };
});
