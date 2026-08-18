// engine.js — constants, noise, world gen, pathfinding

let TILE = 16;
const COLS = 160;
const ROWS = 100;
const LEVELS = 20;

const TYPES = {
  STONE:     { char: '#', fg: '#888', bg: '#222' },
  HARDSTONE: { char: '#', fg: '#667', bg: '#1a1a22' },
  OBSIDIAN:  { char: '#', fg: '#a6c', bg: '#110011' },
  DIRT:      { char: '.', fg: '#a87', bg: '#1a1008' },
  SAND:      { char: '.', fg: '#db8', bg: '#1a1200' },
  WATER:     { char: '~', fg: '#48f', bg: '#001133' },
  AIR:       { char: ' ', fg: '#000', bg: '#111' },
  CAVE_MOSS: { char: '.', fg: '#484', bg: '#0a120a' },
  IRON:      { char: '%', fg: '#a88', bg: '#222' },
  COAL:      { char: '%', fg: '#445', bg: '#222' },
  GOLD:      { char: '%', fg: '#fd0', bg: '#222' },
  GEM:       { char: '%', fg: '#0ff', bg: '#222' },
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

// Biome surface tile appearance (replaces generic DIRT on the surface layer)
const BIOME_SURFACE = {
  ocean:    { char: '~', fg: '#48f', bg: '#001133' },
  coast:    { char: '.', fg: '#da8', bg: '#221800' },
  plains:   { char: '.', fg: '#4a2', bg: '#0a1a00' },
  forest:   { char: '.', fg: '#2a5', bg: '#051005' },
  mountain: { char: '^', fg: '#aaa', bg: '#1a1a1a' },
  desert:   { char: '.', fg: '#db8', bg: '#1a1200' },
  tundra:   { char: '.', fg: '#cde', bg: '#0d1218' },
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
  const surfTile = (biome === 'desert' || biome === 'coast') ? 'SAND' : 'DIRT';

  const newSurfaceZ = Array.from({ length: COLS }, (_, c) =>
    Array.from({ length: ROWS }, (_, r) => {
      const n = (noise(c * scale + seed, r * scale + seed) + 1) / 2;
      return Math.round(surfMin + n * (surfMax - surfMin));
    })
  );

  // Ore vein seeds
  const oreSeed = seed + 333;
  const wSeed = seed + 99;

  const newMap = Array.from({ length: LEVELS }, (_, z) =>
    Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => {
        const surf = newSurfaceZ[c][r];
        if (z > surf)  return 'AIR';
        if (z === surf) return surfTile;
        if (z >= waterZ[0] && z <= waterZ[1] &&
            noise(c * 0.08 + wSeed, r * 0.08 + wSeed) > waterThresh) return 'WATER';
        // Depth below surface
        const depth = surf - z;
        // Stone type by depth
        const stoneType = depth >= 12 ? 'OBSIDIAN' : depth >= 6 ? 'HARDSTONE' : 'STONE';
        // Cave systems — carved first so ore veins don't fill cave space
        if (depth >= 4 && depth <= 16) {
          const cn  = (noise(c * 0.07 + seed + 500, r * 0.07 + seed + 500 + z * 3.1)  + 70) / 140;
          const cn2 = (noise(c * 0.11 + seed + 800, r * 0.11 + seed + 800 + z * 2.3)  + 70) / 140;
          if (cn > 0.65 && cn2 > 0.55) return 'AIR';
          if (cn > 0.58 && cn2 > 0.55) return 'CAVE_MOSS';
        }
        // Ore veins — only in stone layers, checked by depth thresholds
        if (depth >= 2) {
          const n = noise(c * 0.15 + oreSeed, r * 0.15 + oreSeed + z * 7.3);
          if (depth >= 2  && depth <= 8  && n > 0.72) return 'COAL';
          if (depth >= 4  && depth <= 10 && noise(c * 0.18 + oreSeed + 11, r * 0.18 + oreSeed + z * 5.1) > 0.78) return 'IRON';
          if (depth >= 8  && depth <= 14 && noise(c * 0.20 + oreSeed + 23, r * 0.20 + oreSeed + z * 6.7) > 0.84) return 'GOLD';
          if (depth >= 11             && noise(c * 0.22 + oreSeed + 37, r * 0.22 + oreSeed + z * 8.9) > 0.88) return 'GEM';
        }
        return stoneType;
      })
    )
  );

  // Generate trees on surface tiles
  const density = TREE_DENSITY[biome] || 0;
  const treeSeed = seed + 777;
  const newTrees = new Map();
  if (density > 0) {
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const sz = newSurfaceZ[c][r];
        if ((newMap[sz][r][c] === 'DIRT') &&
            (noise(c * 0.2 + treeSeed, r * 0.2 + treeSeed) + 1) / 2 < density) {
          newTrees.set(`${sz},${r},${c}`, { z: sz, r, c });
        }
      }
    }
  }

  return { map: newMap, surfaceZ: newSurfaceZ, trees: newTrees };
}

// Wildlife defs: density = spawns per 1000 passable tiles, depthMin/Max = z-levels below surface (0=surface)
const WILDLIFE_DEFS = {
  surface: {
    plains:   [ { type:'deer',   char:'d', color:'#ca8', hostile:false, hp:3, density:1.5 },
                { type:'wolf',   char:'w', color:'#a88', hostile:true,  hp:5, density:0.4 } ],
    forest:   [ { type:'bear',   char:'B', color:'#a63', hostile:true,  hp:8, density:0.3 },
                { type:'deer',   char:'d', color:'#ca8', hostile:false, hp:3, density:1.2 },
                { type:'fox',    char:'f', color:'#d74', hostile:false, hp:2, density:0.8 } ],
    mountain: [ { type:'goat',   char:'g', color:'#ccc', hostile:false, hp:3, density:1.0 },
                { type:'eagle',  char:'e', color:'#aa6', hostile:true,  hp:4, density:0.3 } ],
    desert:   [ { type:'snake',  char:'s', color:'#8a4', hostile:true,  hp:2, density:0.8 },
                { type:'lizard', char:'l', color:'#6a3', hostile:false, hp:1, density:1.2 } ],
    tundra:   [ { type:'wolf',   char:'w', color:'#a88', hostile:true,  hp:5, density:0.6 },
                { type:'elk',    char:'E', color:'#ca8', hostile:false, hp:4, density:1.0 } ],
    ocean:    [ { type:'crab',   char:'c', color:'#d84', hostile:true,  hp:2, density:0.8 } ],
    coast:    [ { type:'crab',   char:'c', color:'#d84', hostile:true,  hp:2, density:0.5 },
                { type:'gull',   char:'u', color:'#eee', hostile:false, hp:1, density:0.8 } ],
  },
  // Underground: depthMin/Max = depth below surface
  underground: [
    { type:'bat',       char:'v', color:'#888', hostile:false, hp:1,  density:0.6, depthMin:1,  depthMax:6  },
    { type:'rat',       char:'r', color:'#a87', hostile:true,  hp:2,  density:0.8, depthMin:1,  depthMax:8  },
    { type:'spider',    char:'x', color:'#a4a', hostile:true,  hp:3,  density:0.4, depthMin:3,  depthMax:12 },
    { type:'cave fish', char:'f', color:'#48a', hostile:false, hp:1,  density:0.3, depthMin:4,  depthMax:14 },
    { type:'fungus beast', char:'F', color:'#6a4', hostile:true, hp:6, density:0.15, depthMin:5, depthMax:16 },
    { type:'troll',     char:'T', color:'#686', hostile:true,  hp:10, density:0.1, depthMin:6,  depthMax:19 },
    { type:'cave wyrm', char:'W', color:'#a44', hostile:true,  hp:15, density:0.05, depthMin:12, depthMax:19 },
  ],
};

function spawnWildlife(biome, sz) {
  // Surface animals — spawn at each tile's own surface z
  const surfDefs = WILDLIFE_DEFS.surface[biome] || WILDLIFE_DEFS.surface.plains;
  for (const def of surfDefs) {
    const count = Math.round((COLS * ROWS / 1000) * def.density);
    for (let i = 0; i < count; i++) {
      let r, c, attempts = 0;
      do { r = Math.floor(Math.random() * ROWS); c = Math.floor(Math.random() * COLS); attempts++; }
      while (attempts < 20 && !passable(sz[c][r], r, c));
      if (!passable(sz[c][r], r, c)) continue;
      const id = _wildlifeId++;
      wildlife.set(id, { id, type:def.type, char:def.char, color:def.color,
        hostile:def.hostile, hp:def.hp, maxHp:def.hp, surface:true,
        z:sz[c][r], r, c, moveTimer:Math.floor(Math.random()*6) });
    }
  }
  // Underground animals — spawn at revealed air tiles at appropriate depths
  for (const def of WILDLIFE_DEFS.underground) {
    const count = Math.round((COLS * ROWS / 1000) * def.density);
    for (let i = 0; i < count; i++) {
      let r, c, z, attempts = 0;
      do {
        r = Math.floor(Math.random() * ROWS);
        c = Math.floor(Math.random() * COLS);
        const depth = def.depthMin + Math.floor(Math.random() * (def.depthMax - def.depthMin + 1));
        z = Math.max(0, sz[c][r] - depth);
        attempts++;
      } while (attempts < 20 && !passable(z, r, c));
      if (!passable(z, r, c)) continue;
      const id = _wildlifeId++;
      wildlife.set(id, { id, type:def.type, char:def.char, color:def.color,
        hostile:def.hostile, hp:def.hp, maxHp:def.hp, surface:false,
        z, r, c, moveTimer:Math.floor(Math.random()*6) });
    }
  }
}
let surfaceZ, map;
let currentBiome = 'plains';

function zoomInTo(wx, wy) {
  chunkCache.set(`${owCurX},${owCurY}`, { map: map.map(z => z.map(r => [...r])), surfaceZ: surfaceZ.map(col => [...col]), camZ,
    trees: new Map([...trees.entries()]), biome: currentBiome });
  owCurX = wx; owCurY = wy;
  const key = `${wx},${wy}`;
  const cached = chunkCache.get(key);
  if (cached) { map = cached.map; surfaceZ = cached.surfaceZ; camZ = cached.camZ; currentBiome = cached.biome || 'plains';
    trees.clear(); for (const [k,v] of cached.trees) trees.set(k,v); }
  else {
    const chunk = generateChunk(wx, wy, overworld[wy][wx].biome);
    map = chunk.map; surfaceZ = chunk.surfaceZ; currentBiome = overworld[wy][wx].biome;
    camZ = surfaceZ[COLS >> 1][ROWS >> 1];
    trees.clear(); for (const [k,v] of chunk.trees) trees.set(k,v);
    revealed.clear();
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        revealed.add(tileKey(surfaceZ[c][r], r, c));
    wildlife.clear();
    spawnWildlife(currentBiome, surfaceZ);
  }
  overworld[wy][wx].visited = true;
}

// --- A* Pathfinding (3D) ---
const ROWS_COLS = ROWS * COLS;
const tileKey = (z, r, c) => z * ROWS_COLS + r * COLS + c;
const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
const encN = tileKey;
const decN = n => ({ z: Math.floor(n / ROWS_COLS), r: Math.floor((n % ROWS_COLS) / COLS), c: n % COLS });

function passable(z, r, c) {
  if (z < 0 || z >= LEVELS || r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  const t = map[z][r][c];
  return (t === 'DIRT' || t === 'SAND' || t === 'AIR' || t === 'WATER' || t === 'CAVE_MOSS' || t === 'stone-floor' || t === 'dirt-floor' || doors.has(tileKey(z,r,c)))
    && !trees.has(tileKey(z,r,c));
}

function astar(sz, sr, sc, ez, er, ec, endPassable) {
  if (!passable(ez, er, ec) && !(endPassable && endPassable(ez, er, ec))) return null;
  const g = new Map(), from = new Map(), closed = new Set();
  const heap = [];
  const heapPush = (f, n) => {
    heap.push([f, n]); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const heapPop = () => {
    const top = heap[0]; const last = heap.pop();
    if (heap.length) { heap[0] = last; let i = 0;
      while (true) { let s = i, l = 2*i+1, r = 2*i+2;
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
        if (s === i) break; [heap[i], heap[s]] = [heap[s], heap[i]]; i = s; }
    }
    return top;
  };
  const start = encN(sz, sr, sc), end = encN(ez, er, ec);
  const heur = (z, r, c) => Math.abs(ez-z) + Math.abs(er-r) + Math.abs(ec-c);
  g.set(start, 0); heapPush(heur(sz, sr, sc), start);
  while (heap.length) {
    const [, cur] = heapPop();
    if (cur === end) {
      const path = []; let k = cur;
      while (from.has(k)) { path.unshift(decN(k)); k = from.get(k); }
      return path;
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    const { z: cz, r: cr, c: cc } = decN(cur);
    const cg = g.get(cur) ?? Infinity;
    for (const [dr, dc] of DIRS) {
      const nr = cr+dr, nc = cc+dc;
      const sameLevel = passable(cz, nr, nc);
      const sameLevelOrEnd = sameLevel || (endPassable && endPassable(cz, nr, nc));
      if (sameLevelOrEnd) {
        const nk = encN(cz, nr, nc), ng = cg + 1;
        if (ng < (g.get(nk)??Infinity)) { from.set(nk,cur); g.set(nk,ng); heapPush(ng+heur(cz,nr,nc),nk); }
      }
      // Step down: neighbour at this level is not passable, but one level down is
      if (!sameLevel && passable(cz-1, nr, nc)) {
        const nk = encN(cz-1, nr, nc), ng = cg + 2;
        if (ng < (g.get(nk)??Infinity)) { from.set(nk,cur); g.set(nk,ng); heapPush(ng+heur(cz-1,nr,nc),nk); }
      }
      // Step up: neighbour is solid, one level up is passable, dwarf has headroom
      if (!sameLevel && passable(cz+1, nr, nc) && passable(cz+1, cr, cc)) {
        const nk = encN(cz+1, nr, nc), ng = cg + 2;
        if (ng < (g.get(nk)??Infinity)) { from.set(nk,cur); g.set(nk,ng); heapPush(ng+heur(cz+1,nr,nc),nk); }
      }
    }
    const here = stairs.get(tileKey(cz,cr,cc));
    if (here || map[cz][cr][cc] === 'WATER') {
      for (const nz of [cz - 1, cz + 1]) {
        if (passable(nz, cr, cc)) {
          const nk = encN(nz, cr, cc), ng = cg + (map[cz][cr][cc] === 'WATER' ? 3 : 1);
          if (ng < (g.get(nk)??Infinity)) { from.set(nk,cur); g.set(nk,ng); heapPush(ng+heur(nz,cr,cc),nk); }
        }
      }
    }
  }
  return null;
}
