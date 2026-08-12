// engine.js — constants, noise, world gen, pathfinding

const TILE = 16;
const COLS = 160;
const ROWS = 100;
const LEVELS = 20;

const TYPES = {
  STONE: { char: '#', fg: '#888', bg: '#222' },
  DIRT:  { char: '.', fg: '#a87', bg: '#1a1008' },
  WATER: { char: '~', fg: '#48f', bg: '#001133' },
  AIR:   { char: ' ', fg: '#000', bg: '#111' },
};

// --- Simplex noise ---
let noise;
let noisePerm; // saved/restored for world persistence

function initNoise(savedPerm) {
  const p = new Uint8Array(512);
  const perm = savedPerm ? new Uint8Array(savedPerm) : new Uint8Array(256).map((_, i) => i);
  if (!savedPerm) {
    for (let i = 255; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  noisePerm = Array.from(perm);
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  const grad2 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  function dot(g, x, y) { return g[0]*x + g[1]*y; }
  noise = function(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2*G2, y2 = y0 - 1 + 2*G2;
    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0*x0 - y0*y0; if (t0 >= 0) { t0 *= t0; n0 = t0*t0*dot(grad2[p[ii+p[jj]]%8], x0, y0); }
    let t1 = 0.5 - x1*x1 - y1*y1; if (t1 >= 0) { t1 *= t1; n1 = t1*t1*dot(grad2[p[ii+i1+p[jj+j1]]%8], x1, y1); }
    let t2 = 0.5 - x2*x2 - y2*y2; if (t2 >= 0) { t2 *= t2; n2 = t2*t2*dot(grad2[p[ii+1+p[jj+1]]%8], x2, y2); }
    return 70 * (n0 + n1 + n2);
  };
}
initNoise();

// --- Biome chunk generation ---
// Each biome has: surfMin, surfMax, waterZMin, waterZMax, waterThreshold
const BIOME_PARAMS = {
  ocean:    { surfMin:  8, surfMax: 10, waterZ: [6, 10], waterThresh: 0.10 },
  coast:    { surfMin: 11, surfMax: 13, waterZ: [9, 12], waterThresh: 0.35 },
  plains:   { surfMin: 13, surfMax: 16, waterZ: [4,  9], waterThresh: 0.60 },
  forest:   { surfMin: 13, surfMax: 16, waterZ: [4,  9], waterThresh: 0.50 },
  mountain: { surfMin: 15, surfMax: 19, waterZ: [2,  5], waterThresh: 0.80 },
  desert:   { surfMin: 13, surfMax: 15, waterZ: [2,  4], waterThresh: 0.90 },
  tundra:   { surfMin: 14, surfMax: 16, waterZ: [3,  6], waterThresh: 0.75 },
};

// Biome tree density (0 = none, 1 = dense)
const TREE_DENSITY = {
  ocean: 0, coast: 0.05, plains: 0.08, forest: 0.35,
  mountain: 0.04, desert: 0, tundra: 0.02,
};

// Deterministic per-chunk seed offset from world coords
function chunkSeed(wx, wy) { return wx * 397 + wy * 1009; }

function generateChunk(wx, wy, biome) {
  const params = BIOME_PARAMS[biome] || BIOME_PARAMS.plains;
  const { surfMin, surfMax, waterZ, waterThresh } = params;
  const seed = chunkSeed(wx, wy);
  const scale = biome === 'mountain' ? 0.05 : 0.03;

  const newSurfaceZ = Array.from({ length: COLS }, (_, c) =>
    Array.from({ length: ROWS }, (_, r) => {
      const n = (noise(c * scale + seed, r * scale + seed) + 1) / 2;
      return Math.round(surfMin + n * (surfMax - surfMin));
    })
  );

  const waterSeed = seed + 99;
  const newMap = Array.from({ length: LEVELS }, (_, z) =>
    Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => {
        const surf = newSurfaceZ[c][r];
        if (z > surf)   return 'AIR';
        if (z === surf) return 'DIRT';
        if (z >= waterZ[0] && z <= waterZ[1] &&
            noise(c * 0.08 + waterSeed, r * 0.08 + waterSeed) > waterThresh) return 'WATER';
        return 'STONE';
      })
    )
  );

  // Generate trees on surface DIRT tiles
  const density = TREE_DENSITY[biome] || 0;
  const treeSeed = seed + 777;
  const newTrees = new Map();
  if (density > 0) {
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const sz = newSurfaceZ[c][r];
        if (newMap[sz][r][c] === 'DIRT' &&
            (noise(c * 0.2 + treeSeed, r * 0.2 + treeSeed) + 1) / 2 < density) {
          newTrees.set(`${sz},${r},${c}`, { z: sz, r, c });
        }
      }
    }
  }

  return { map: newMap, surfaceZ: newSurfaceZ, trees: newTrees };
}

function buildRefMap() {
  const biome = overworld[owCurY][owCurX].biome;
  return generateChunk(owCurX, owCurY, biome).map;
}

// surfaceZ and map are populated by state.js after overworld init
let surfaceZ, map;

function zoomInTo(wx, wy) {
  chunkCache.set(`${owCurX},${owCurY}`, { map: map.map(z => z.map(r => [...r])), surfaceZ: surfaceZ.map(col => [...col]), camZ,
    trees: new Map([...trees.entries()]) });
  owCurX = wx; owCurY = wy;
  const key = `${wx},${wy}`;
  const cached = chunkCache.get(key);
  if (cached) { map = cached.map; surfaceZ = cached.surfaceZ; camZ = cached.camZ;
    trees.clear(); for (const [k,v] of cached.trees) trees.set(k,v); }
  else {
    const chunk = generateChunk(wx, wy, overworld[wy][wx].biome);
    map = chunk.map; surfaceZ = chunk.surfaceZ;
    camZ = surfaceZ[COLS >> 1][ROWS >> 1];
    trees.clear(); for (const [k,v] of chunk.trees) trees.set(k,v);
  }
  overworld[wy][wx].visited = true;
}

// --- A* Pathfinding (3D) ---
function passable(z, r, c) {
  if (z < 0 || z >= LEVELS || r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  const t = map[z][r][c];
  return (t === 'DIRT' || t === 'AIR' || t === 'stone-floor' || t === 'dirt-floor' || doors.has(`${z},${r},${c}`))
    && !trees.has(`${z},${r},${c}`);
}

const encN = (z, r, c) => z * ROWS * COLS + r * COLS + c;
const decN = n => ({ z: Math.floor(n / (ROWS * COLS)), r: Math.floor((n % (ROWS * COLS)) / COLS), c: n % COLS });

function astar(sz, sr, sc, ez, er, ec) {
  if (!passable(ez, er, ec)) return null;
  const g = new Map(), f = new Map(), from = new Map();
  const open = new Set();
  const start = encN(sz, sr, sc), end = encN(ez, er, ec);
  const heur = (z, r, c) => Math.abs(ez-z) + Math.abs(er-r) + Math.abs(ec-c);
  g.set(start, 0); f.set(start, heur(sz, sr, sc)); open.add(start);
  const dirs2d = [[-1,0],[1,0],[0,-1],[0,1]];
  while (open.size) {
    let cur = [...open].reduce((a, b) => (f.get(a)??Infinity) < (f.get(b)??Infinity) ? a : b);
    if (cur === end) {
      const path = []; let k = cur;
      while (from.has(k)) { path.unshift(decN(k)); k = from.get(k); }
      return path;
    }
    open.delete(cur);
    const { z: cz, r: cr, c: cc } = decN(cur);
    const cg = g.get(cur) ?? Infinity;
    for (const [dr, dc] of dirs2d) {
      const nr = cr+dr, nc = cc+dc;
      const sameLevel = passable(cz, nr, nc);
      const hasFloor  = !passable(cz-1, cr, cc) || cz === 0; // current tile has solid below
      const nbrFloor  = !passable(cz-1, nr, nc) || cz === 0; // neighbour has solid below
      // Flat move — only if neighbour has a floor (no walking into open air)
      if (sameLevel && nbrFloor) {
        const nk = encN(cz, nr, nc), ng = cg + 1;
        if (ng < (g.get(nk)??Infinity)) { from.set(nk,cur); g.set(nk,ng); f.set(nk,ng+heur(cz,nr,nc)); open.add(nk); }
      }
      // Step down: neighbour at same level is AIR, but one level below is passable
      if (sameLevel && !nbrFloor && passable(cz-1, nr, nc)) {
        const nk = encN(cz-1, nr, nc), ng = cg + 2;
        if (ng < (g.get(nk)??Infinity)) { from.set(nk,cur); g.set(nk,ng); f.set(nk,ng+heur(cz-1,nr,nc)); open.add(nk); }
      }
      // Step up: neighbour at same level is solid, but one level up is passable and we have headroom
      if (!sameLevel && passable(cz+1, nr, nc) && passable(cz+1, cr, cc)) {
        const nk = encN(cz+1, nr, nc), ng = cg + 2;
        if (ng < (g.get(nk)??Infinity)) { from.set(nk,cur); g.set(nk,ng); f.set(nk,ng+heur(cz+1,nr,nc)); open.add(nk); }
      }
    }
    const here = stairs.get(`${cz},${cr},${cc}`);
    if (here) {
      const [nz, ntype] = here.type === 'stair-up' ? [cz+1,'stair-down'] : [cz-1,'stair-up'];
      const partner = stairs.get(`${nz},${cr},${cc}`);
      if (partner && partner.type === ntype && passable(nz, cr, cc)) {
        const nk = encN(nz, cr, cc), ng = cg + 1;
        if (ng < (g.get(nk)??Infinity)) { from.set(nk,cur); g.set(nk,ng); f.set(nk,ng+heur(nz,cr,cc)); open.add(nk); }
      }
    }
  }
  return null;
}
