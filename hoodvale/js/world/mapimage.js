// Painted map of the overworld or a dungeon, for the minimap and the world map. Owner: world builder.
//
// API:
//   paintRegion(regionId = 'overworld', pxPerTile = 2, { trees = true, grain = true, shared = false })
//     -> HTMLCanvasElement (W*s x H*s; pixel (0,0) = the region's north-west corner). The painting
//     is cached per (region, scale); each call returns a cheap private copy you may draw on
//     (pass { shared: true } to get the cached canvas itself, read-only).
//   mapIcons(regionId) -> [{ kind, x, z, label }] world positions of banks, shops, furnaces, anvils,
//     ranges, altars, the Exchange, wells, mills, fishing / mining sites, quest-givers, the Oracle,
//     dungeon entrances / exits, chests. kinds: bank exchange furnace anvil range altar spinning
//     tanner well mill dungeon exit archery fire stall chest fishing mining quest shop oracle.
//   mapLabels(regionId) -> [{ text, x, z, kind: 'zone'|'road'|'dungeon' }] for the world map.
//   worldToMap(x, z, regionId, pxPerTile) -> { x, y } pixel position on the painted canvas.
//   regionBounds(regionId) -> { x0, z0, w, h }.
//
// The look: per-vertex painted colours from the same fields as the terrain (zone palettes,
// beaches, mud, ash, crystal ground), soft hillshading from the north-west, depth-tinted water
// with a crisp foam coastline and wave hatching, roads with dark edges, Gildmoor cobbles, farm
// furrows, buildings as roofs with drop shadows, the town wall, bridges and piers, trees as
// shaded canopies (tinted per species), ore rocks, and a light paper grain.

import { getRegionGrid, OVERWORLD, DUNGEONS } from './mapgen.js';
import { getOverworldFields, getDungeonFields, mapIcons as fieldIcons, W_SWAMP, W_LAKE, W_SEA } from './w-fields.js';
import { BUILDINGS } from '../data/buildings.js';
import { ZONES, ROADS, BRIDGES, FENCES } from '../data/zones.js';
import { buildSpawns } from '../data/spawns.js';
import { OBJECTS } from '../data/objects.js';

const CACHE = new Map();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export function regionBounds(regionId = 'overworld') {
  const R = regionId === 'overworld' ? OVERWORLD : DUNGEONS[regionId];
  return { x0: R.x0, z0: R.z0, w: R.w, h: R.h };
}
export function worldToMap(x, z, regionId = 'overworld', s = 2) {
  const b = regionBounds(regionId);
  return { x: (x - b.x0) * s, y: (z - b.z0) * s };
}
export function mapIcons(regionId = 'overworld') { return fieldIcons(regionId); }
export function mapLabels(regionId = 'overworld') {
  if (regionId !== 'overworld') {
    const names = { warrens: 'Goblin Warrens', vault: "The Sheriff's Vault", lair: 'The Ashen Lair' };
    const D = DUNGEONS[regionId];
    return [{ text: names[regionId] || regionId, x: D.x0 + D.w / 2, z: D.z0 + 4, kind: 'dungeon' }];
  }
  const out = Object.values(ZONES).map((z) => ({ text: z.name, x: z.x, z: z.z - (z.r > 30 ? 8 : 4), kind: 'zone' }));
  for (const r of ROADS) {
    const i = Math.floor((r.points.length - 1) / 2);
    const a = r.points[i], b = r.points[i + 1];
    out.push({ text: r.name, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, kind: 'road', angle: Math.atan2(b.z - a.z, b.x - a.x) });
  }
  return out;
}

const ROOF = {
  'timber-hall': '#9b5a3c', 'timber-shop': '#a4603e', 'timber-inn': '#8e4c34', cottage: '#b9924c', 'stone-bank': '#56606e',
  'open-forge': '#6e5440', barn: '#8c3c2c', windmill: '#cdbb9c', shack: '#7a6a58', 'log-lodge': '#6c4c2c', 'tent-green': '#456f34',
  'tent-brown': '#7d5c3c', 'stone-hut': '#6c6a66', 'stilt-hut': '#6a5a40', 'stone-hall-grand': '#5c6676', 'stone-shop': '#6a6670',
  'castle-keep': '#5a5a64', townhouse: '#8c4c3a', stables: '#7c5c3c', 'crystal-spire': '#8f7ce0', 'ruin-tower': '#7a7670',
};
const TREE_COL = {
  'tree-broadleaf': [62, 112, 50], 'tree-oak': [48, 92, 40], 'tree-willow': [104, 132, 62], 'tree-maple': [170, 82, 46],
  'tree-yew': [34, 66, 44], 'tree-elder': [112, 84, 150],
};

function hexToRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

// Per-vertex painted land + water colours and shading (0..255 floats).
function overworldVertexColours() {
  const F = getOverworldFields();
  const { N, heights } = F;
  const NN = N * N;
  const land = new Float32Array(NN * 3), water = new Float32Array(NN * 3), shade = new Float32Array(NN);
  const hAt = (x, z) => heights[Math.max(0, Math.min(N - 1, z)) * N + Math.max(0, Math.min(N - 1, x))];
  const SAND = [222, 204, 152], PEB = [150, 142, 124], MUD = [98, 96, 74], ASH = [96, 92, 88], COB = [150, 144, 134];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const v = z * N + x;
    const h = heights[v];
    // hillshade (light from the north-west, slightly exaggerated)
    const dx = (hAt(x + 1, z) - hAt(x - 1, z)) * 0.5, dz = (hAt(x, z + 1) - hAt(x, z - 1)) * 0.5;
    const nx = -dx * 1.8, nz = -dz * 1.8, ny = 1;
    const l = Math.hypot(nx, ny, nz);
    const lx = -0.55, ly = 0.7, lz = -0.45;
    const d = (nx * lx + ny * ly + nz * lz) / l;
    shade[v] = 0.72 + 0.5 * (d - 0.55) / 0.45;
    const slope = Math.hypot(dx, dz);
    let r = F.base[v * 3] * 255, g = F.base[v * 3 + 1] * 255, b = F.base[v * 3 + 2] * 255;
    const rk = sstep(0.55, 1.0, slope) * (1 - F.floor[v]);
    r += (F.rock[v * 3] * 255 - r) * rk; g += (F.rock[v * 3 + 1] * 255 - g) * rk; b += (F.rock[v * 3 + 2] * 255 - b) * rk;
    const mixc = (c, k) => { r += (c[0] - r) * k; g += (c[1] - g) * k; b += (c[2] - b) * k; };
    mixc(MUD, sstep(0.3, 0.7, F.mud[v]) * 0.9);
    mixc(PEB, sstep(0.35, 0.7, F.pebble[v]) * 0.8);
    mixc(SAND, sstep(0.3, 0.7, F.sand[v]));
    mixc(ASH, sstep(0.3, 0.7, F.ash[v]) * 0.8);
    if (F.crystal[v] > 0.05) mixc([120, 140, 200], F.crystal[v] * 0.35);
    if (F.cobble[v] > 0.3 && F.road[v] > 0.4) mixc(COB, 0.6);
    // contact shading (trees / buildings)
    const ao = 0.6 + 0.4 * F.ao[v];
    land[v * 3] = r * ao; land[v * 3 + 1] = g * ao; land[v * 3 + 2] = b * ao;
    // water
    const t = F.wtype[v];
    const depth = Math.max(0, -h);
    const k = 1 - Math.exp(-depth * 0.5);
    let wr = 96 + (28 - 96) * k, wg = 178 + (82 - 178) * k, wb = 196 + (138 - 196) * k;
    if (t === W_SWAMP) { wr = 80 - 20 * k; wg = 104 - 24 * k; wb = 76 - 16 * k; }
    else if (t === W_LAKE) { wr -= 6; wg += 2; }
    water[v * 3] = wr; water[v * 3 + 1] = wg; water[v * 3 + 2] = wb;
  }
  return { F, land, water, shade };
}

function paintOverworld(s, opts) {
  const { F, land, water, shade } = overworldVertexColours();
  const { N, W, H, heights } = F;
  const cw = W * s, ch = H * s;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d');
  const img = g.createImageData(cw, ch);
  const D = img.data;
  const ROAD = [184, 156, 108], ROAD_EDGE = [112, 92, 62];
  for (let py = 0; py < ch; py++) {
    const z = (py + 0.5) / s;
    const j = Math.min(N - 2, z | 0), tz = z - j;
    for (let px = 0; px < cw; px++) {
      const x = (px + 0.5) / s;
      const i = Math.min(N - 2, x | 0), tx = x - i;
      const v = j * N + i;
      const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
      const bl = (arr) => arr[v] * w00 + arr[v + 1] * w10 + arr[v + N] * w01 + arr[v + N + 1] * w11;
      const bl3 = (arr, c) => arr[v * 3 + c] * w00 + arr[(v + 1) * 3 + c] * w10 + arr[(v + N) * 3 + c] * w01 + arr[(v + N + 1) * 3 + c] * w11;
      const h = bl(heights);
      let r, gg, b;
      if (h < -0.02) {
        r = bl3(water, 0); gg = bl3(water, 1); b = bl3(water, 2);
        const t = F.wtype[v];
        if (t === W_SEA || t === W_LAKE) {
          const wave = Math.sin(x * 0.9 + Math.sin(z * 0.35) * 2.2 + z * 0.15);
          if (wave > 0.93 && -h > 0.6) { r += 26; gg += 26; b += 22; }
        }
        const foam = 1 - sstep(0.0, 0.35, -h);
        r += (236 - r) * foam * 0.85; gg += (244 - gg) * foam * 0.85; b += (240 - b) * foam * 0.85;
      } else {
        const sh = bl(shade);
        r = bl3(land, 0) * sh; gg = bl3(land, 1) * sh; b = bl3(land, 2) * sh;
        // farm furrows
        const fm = bl(F.farm);
        if (fm > 0.45) {
          const info = Math.round(F.farmInfo[v] * 15), orient = info >= 8, type = info - (orient ? 8 : 0);
          const u = orient ? x : z;
          const ridge = Math.sin(u * Math.PI * 1.84) > 0;
          const crop = type === 1 ? [214, 178, 80] : type === 2 ? [110, 150, 128] : type === 3 ? [104, 150, 72] : type === 4 ? [138, 104, 70] : type === 5 ? [96, 132, 60] : [204, 186, 100];
          const c = ridge ? crop : [112, 82, 54];
          r = c[0] * sh; gg = c[1] * sh; b = c[2] * sh;
        }
        // roads with dark edges
        const rd = bl(F.road) * (1 - bl(F.floor));
        if (rd > 0.36) {
          const e = rd < 0.5;
          const c = e ? ROAD_EDGE : ROAD;
          const k = e ? 0.55 : 1;
          const cob = bl(F.cobble) > 0.4;
          const cc = cob && !e ? [160, 154, 144] : c;
          r += (cc[0] * sh - r) * k; gg += (cc[1] * sh - gg) * k; b += (cc[2] * sh - b) * k;
        }
        // snow caps a touch brighter
        const sn = bl(F.snow);
        if (sn > 0.3) { r += (246 - r) * sn; gg += (248 - gg) * sn; b += (252 - b) * sn; }
      }
      const o = (py * cw + px) * 4;
      D[o] = r > 255 ? 255 : r < 0 ? 0 : r; D[o + 1] = gg > 255 ? 255 : gg < 0 ? 0 : gg; D[o + 2] = b > 255 ? 255 : b < 0 ? 0 : b; D[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  drawOverlays(g, s, opts);
  if (opts.grain !== false) grain(g, cw, ch, s);
  return cv;
}

function drawOverlays(g, s, opts) {
  g.save();
  g.lineJoin = 'round';
  // bridges + piers
  for (const b of BRIDGES) {
    const x = b.x0 * s, y = b.z0 * s, w = (b.x1 - b.x0 + 1) * s, h = (b.z1 - b.z0 + 1) * s;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + s * 0.4, y + s * 0.4, w, h);
    g.fillStyle = '#9a7048';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#5a3e26';
    g.lineWidth = Math.max(1, s * 0.3);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.strokeStyle = 'rgba(60,40,24,0.45)';
    g.lineWidth = Math.max(0.5, s * 0.12);
    const n = b.axis === 'x' ? b.x1 - b.x0 + 1 : b.z1 - b.z0 + 1;
    for (let k = 1; k < n; k++) {
      g.beginPath();
      if (b.axis === 'x') { g.moveTo(x + k * s, y); g.lineTo(x + k * s, y + h); } else { g.moveTo(x, y + k * s); g.lineTo(x + w, y + k * s); }
      g.stroke();
    }
  }
  // fences
  g.strokeStyle = '#6e4e2e';
  g.lineWidth = Math.max(1, s * 0.25);
  for (const f of FENCES) {
    g.setLineDash([s * 0.9, s * 0.35]);
    g.strokeRect(f.x0 * s + s / 2, f.z0 * s + s / 2, (f.x1 - f.x0) * s, (f.z1 - f.z0) * s);
  }
  g.setLineDash([]);
  // Gildmoor town wall
  const G = ZONES.gildmoor;
  g.lineWidth = Math.max(2, s * 1.1);
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.arc(G.x * s + s * 0.5, G.z * s + s * 0.6, G.wallR * s, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#8e8676';
  for (let a = 0; a < Math.PI * 2; a += 0.02) {
    const gate = G.gates.some((gt) => Math.abs(Math.atan2(Math.sin(a - gt.ang), Math.cos(a - gt.ang))) * G.wallR < 2.2);
    if (gate) continue;
    g.beginPath(); g.arc(G.x * s, G.z * s, G.wallR * s, a, a + 0.021); g.stroke();
  }
  // trees + rocks from spawns
  if (opts.trees !== false) {
    const sp = buildSpawns();
    const trees = [], rocks = [];
    for (const o of sp.objects) {
      if (o.x >= 1000) continue;
      const kind = OBJECTS[o.def]?.model?.kind || '';
      if (kind.startsWith('tree')) trees.push([o, kind]);
      else if (kind === 'rock-ore' || kind === 'crystal') rocks.push([o, OBJECTS[o.def].model.tint || '#888']);
    }
    for (const [o, kind] of trees) {
      const cx = (o.x + o.w / 2) * s, cy = (o.z + o.d / 2) * s, r = (0.7 + 0.45 * o.w) * s;
      g.fillStyle = 'rgba(10,20,8,0.35)';
      g.beginPath(); g.arc(cx + r * 0.35, cy + r * 0.4, r, 0, Math.PI * 2); g.fill();
    }
    for (const [o, kind] of trees) {
      const c = TREE_COL[kind] || TREE_COL['tree-broadleaf'];
      const cx = (o.x + o.w / 2) * s, cy = (o.z + o.d / 2) * s, r = (0.7 + 0.45 * o.w) * s;
      const grd = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
      grd.addColorStop(0, `rgb(${Math.min(255, c[0] * 1.45)},${Math.min(255, c[1] * 1.35)},${Math.min(255, c[2] * 1.3)})`);
      grd.addColorStop(1, `rgb(${c[0] * 0.75},${c[1] * 0.75},${c[2] * 0.75})`);
      g.fillStyle = grd;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
    for (const [o, tint] of rocks) {
      const cx = (o.x + 0.5) * s, cy = (o.z + 0.5) * s, r = Math.max(1.2, 0.45 * s);
      g.fillStyle = '#5e5852';
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = tint;
      g.beginPath(); g.arc(cx - r * 0.2, cy - r * 0.2, r * 0.5, 0, Math.PI * 2); g.fill();
    }
  }
  // buildings: drop shadow, roof, ridge line, outline
  for (const b of BUILDINGS) {
    const x = b.x * s, y = b.z * s, w = b.w * s, h = b.d * s;
    const col = ROOF[b.style] || '#8a5a3a';
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.fillRect(x + s * 0.6, y + s * 0.7, w, h);
    if (b.style === 'windmill') {
      g.fillStyle = col;
      g.beginPath(); g.arc(x + w / 2, y + h / 2, w * 0.42, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#4a3a2a'; g.lineWidth = Math.max(1, s * 0.5);
      g.beginPath(); g.moveTo(x - s, y - s); g.lineTo(x + w + s, y + h + s); g.moveTo(x + w + s, y - s); g.lineTo(x - s, y + h + s); g.stroke();
      continue;
    }
    if (b.style === 'crystal-spire') {
      const grd = g.createRadialGradient(x + w / 2, y + h / 2, 1, x + w / 2, y + h / 2, w * 0.75);
      grd.addColorStop(0, '#e0f8ff'); grd.addColorStop(0.5, '#8fd8ff'); grd.addColorStop(1, 'rgba(140,120,230,0.0)');
      g.fillStyle = grd; g.fillRect(x - w * 0.3, y - h * 0.3, w * 1.6, h * 1.6);
    }
    const [r0, g0, b0] = hexToRGB(col);
    const ridgeX = b.w >= b.d;
    const grd = ridgeX ? g.createLinearGradient(0, y, 0, y + h) : g.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, `rgb(${Math.min(255, r0 * 1.25)},${Math.min(255, g0 * 1.25)},${Math.min(255, b0 * 1.25)})`);
    grd.addColorStop(0.5, col);
    grd.addColorStop(0.501, `rgb(${r0 * 0.78},${g0 * 0.78},${b0 * 0.78})`);
    grd.addColorStop(1, `rgb(${r0 * 0.68},${g0 * 0.68},${b0 * 0.68})`);
    g.fillStyle = grd;
    if (b.open) g.globalAlpha = 0.75;
    g.fillRect(x, y, w, h);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(30,20,12,0.85)';
    g.lineWidth = Math.max(1, s * 0.3);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.strokeStyle = 'rgba(30,20,12,0.35)';
    g.beginPath();
    if (ridgeX) { g.moveTo(x + s * 0.5, y + h / 2); g.lineTo(x + w - s * 0.5, y + h / 2); } else { g.moveTo(x + w / 2, y + s * 0.5); g.lineTo(x + w / 2, y + h - s * 0.5); }
    g.stroke();
    if (b.style === 'castle-keep') {
      g.fillStyle = '#4a4a54';
      for (let k = 0; k < b.w; k += 2) { g.fillRect(x + k * s, y, s, s * 0.6); g.fillRect(x + k * s, y + h - s * 0.6, s, s * 0.6); }
      for (let k = 0; k < b.d; k += 2) { g.fillRect(x, y + k * s, s * 0.6, s); g.fillRect(x + w - s * 0.6, y + k * s, s * 0.6, s); }
    }
  }
  g.restore();
}

function grain(g, w, h, s) {
  // light paper grain + soft vignette
  const img = g.getImageData(0, 0, w, h);
  const D = img.data;
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const n = (rnd() - 0.5) * 10;
    const ex = Math.min(x, w - 1 - x) / (w * 0.08), ey = Math.min(y, h - 1 - y) / (h * 0.08);
    const vig = 0.82 + 0.18 * Math.min(1, ex, ey);
    D[o] = (D[o] + n) * vig; D[o + 1] = (D[o + 1] + n) * vig; D[o + 2] = (D[o + 2] + n * 0.8) * vig;
  }
  g.putImageData(img, 0, 0);
}

function paintDungeon(id, s, opts) {
  const DF = getDungeonFields(id);
  const { W, H, N, solid, base, wallDist, kind } = DF;
  const cw = W * s, ch = H * s;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d');
  const img = g.createImageData(cw, ch);
  const D = img.data;
  const rockC = kind === 3 ? [26, 20, 20] : kind === 2 ? [34, 34, 38] : [36, 28, 22];
  const rimC = kind === 3 ? [120, 50, 24] : kind === 2 ? [120, 116, 108] : [110, 88, 62];
  for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
    const x = (px + 0.5) / s, z = (py + 0.5) / s;
    const tx = Math.min(W - 1, x | 0), tz = Math.min(H - 1, z | 0);
    const isS = solid[tz * W + tx];
    let r, gg, b;
    if (isS) {
      // rim where the rock meets the floor
      let near = false;
      for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) {
        const xx = tx + dx, zz = tz + dz;
        if (xx >= 0 && zz >= 0 && xx < W && zz < H && !solid[zz * W + xx]) { near = true; break; }
      }
      const n = ((tx * 73856093) ^ (tz * 19349663)) & 15;
      r = rockC[0] + n; gg = rockC[1] + n; b = rockC[2] + n;
      if (near) { r = rimC[0] * 0.7; gg = rimC[1] * 0.7; b = rimC[2] * 0.7; }
    } else {
      const v = Math.min(N - 1, Math.round(z)) * N + Math.min(N - 1, Math.round(x));
      const ao = 0.55 + 0.45 * Math.min(1, wallDist[v] / 3);
      r = base[v * 3] * 255 * 1.35 * ao; gg = base[v * 3 + 1] * 255 * 1.35 * ao; b = base[v * 3 + 2] * 255 * 1.35 * ao;
      if (kind === 2) {
        const fx = (x / 1.5 + ((z | 0) % 2) * 0.5) % 1, fz = z % 1;
        if (fx < 0.06 || fz < 0.06) { r *= 0.75; gg *= 0.75; b *= 0.75; }
        if (DF.road[v] > 0.5) { r = 140; gg = 26; b = 30; }
      }
      if (kind === 3 && (((tx * 31 + tz * 17) ^ (tx * tz)) % 23) === 0) { r = 230; gg = 110; b = 40; }
    }
    const o = (py * cw + px) * 4;
    D[o] = Math.min(255, r); D[o + 1] = Math.min(255, gg); D[o + 2] = Math.min(255, b); D[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (opts.grain !== false) grain(g, cw, ch, s);
  return cv;
}

export function paintRegion(regionId = 'overworld', s = 2, opts = {}) {
  if (regionId !== 'overworld' && !DUNGEONS[regionId]) regionId = 'overworld';
  const key = regionId + ':' + s + ':' + (opts.trees === false ? 0 : 1) + ':' + (opts.grain === false ? 0 : 1);
  let src = CACHE.get(key);
  if (!src) {
    src = regionId === 'overworld' ? paintOverworld(s, opts) : paintDungeon(regionId, s, opts);
    CACHE.set(key, src);
  }
  if (opts.shared) return src;
  // A cheap private copy: callers may draw markers on it.
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  cv.getContext('2d').drawImage(src, 0, 0);
  return cv;
}
