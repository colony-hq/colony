// World art fields. Pure module (no three.js): bakes per-vertex colours and material masks on the
// exact mapgen corner grid, shared by terrain.js (vertex attributes), water.js (depth / shore /
// flow textures), decor.js (placement + tints) and mapimage.js (painted map). Owner: world builder.
//
// Everything is deterministic and cached. Colours are sRGB in 0..1 (shaders linearise).

import {
  bakeWorld, bakeDungeon, DUNGEONS, ZONE_IDS, distToRiver,
  T_BLOCK, T_WATER, T_ROAD, T_BRIDGE, T_INDOOR, T_WALL,
} from './mapgen.js';
import { ZONES, RIVER, LAKES, ROADS, BRIDGES, FENCES } from '../data/zones.js';
import { BUILDINGS } from '../data/buildings.js';
import { buildSpawns } from '../data/spawns.js';
import { OBJECTS } from '../data/objects.js';
import { NPCS } from '../data/npcs.js';
import { createNoise2D, fbm, ridged } from '../core/noise.js';
import { heightAt as mapHeightAt } from './mapgen.js';

export const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Zone keys by tile zone value (0 = wilds).
export const ZONE_KEYS = ['wilds', ...ZONE_IDS];
export const ZK = ZONE_KEYS.length;
export const ZI = Object.fromEntries(ZONE_KEYS.map((k, i) => [k, i]));

// Per-zone ground palette (sRGB hex). grass = base, dry = sun-bleached patches, lush = near water,
// soil = bare patches (forest floor, ochre earth, mud), rock = slopes/cliffs.
const PAL_HEX = {
  wilds: { grass: 0x6c9b41, dry: 0x9aa84e, lush: 0x4f8b3a, soil: 0x7a6142, rock: 0x857c70, dryAmt: 0.7, soilAmt: 0.12 },
  brightwater: { grass: 0x79ae45, dry: 0xaabf57, lush: 0x5d9e3e, soil: 0x8d7150, rock: 0x8b8375, dryAmt: 0.55, soilAmt: 0.06 },
  farms: { grass: 0x8fae4a, dry: 0xc7b65e, lush: 0x76a343, soil: 0x8b6842, rock: 0x8c8070, dryAmt: 0.95, soilAmt: 0.1 },
  docks: { grass: 0x8aa65a, dry: 0xb7b07c, lush: 0x709b4f, soil: 0x9a8a6a, rock: 0x86888b, dryAmt: 0.85, soilAmt: 0.2 },
  hoodwood: { grass: 0x4b7a38, dry: 0x6a8a3e, lush: 0x3b6c32, soil: 0x6b5638, rock: 0x6c705e, dryAmt: 0.45, soilAmt: 0.45 },
  copperhollow: { grass: 0x9a9a55, dry: 0xc2a45e, lush: 0x82924a, soil: 0xb48450, rock: 0xa88a66, dryAmt: 0.95, soilAmt: 0.38 },
  mistfen: { grass: 0x638a6c, dry: 0x7d8e72, lush: 0x557f66, soil: 0x5f5b47, rock: 0x66726b, dryAmt: 0.55, soilAmt: 0.3 },
  gildmoor: { grass: 0x70a047, dry: 0x95ae57, lush: 0x5c8f40, soil: 0x876f53, rock: 0x908879, dryAmt: 0.6, soilAmt: 0.08 },
  oracle: { grass: 0x67907a, dry: 0x8a8ea6, lush: 0x56826f, soil: 0x6a6080, rock: 0x8c84b0, dryAmt: 0.7, soilAmt: 0.15 },
  highlands: { grass: 0x7a845f, dry: 0x968f69, lush: 0x627750, soil: 0x6b6357, rock: 0x7f7b77, dryAmt: 0.85, soilAmt: 0.38 },
};
export const PALETTE = {};
const desat = (c, k = 0.2) => { const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15; return c.map((v) => v + (l - v) * k); };
for (const k of ZONE_KEYS) {
  const p = PAL_HEX[k];
  PALETTE[k] = { grass: desat(hex(p.grass)), dry: desat(hex(p.dry)), lush: desat(hex(p.lush)), soil: hex(p.soil), rock: hex(p.rock), dryAmt: p.dryAmt, soilAmt: p.soilAmt };
}
const PAL_ARR = ZONE_KEYS.map((k) => PALETTE[k]);

// Water body types.
export const W_NONE = 0, W_SEA = 1, W_RIVER = 2, W_LAKE = 3, W_SWAMP = 4;

// Farm fields (tile rects, inclusive). type: 1 wheat, 2 flax, 3 cabbage, 4 fallow, 5 pumpkin, 6 barley.
// orient: 0 = rows run east-west, 1 = north-south. decor: decor crops fill it (interactive fields don't).
export const FARM_FIELDS = [
  { id: 'wheat', x0: 221, x1: 233, z0: 213, z1: 223, type: 1, orient: 0, decor: false },
  { id: 'flax', x0: 251, x1: 261, z0: 219, z1: 227, type: 2, orient: 1, decor: false },
  { id: 'barley', x0: 263, x1: 276, z0: 214, z1: 229, type: 6, orient: 1, decor: true },
  { id: 'cabbage', x0: 210, x1: 219, z0: 225, z1: 235, type: 3, orient: 0, decor: true },
  { id: 'pumpkin', x0: 263, x1: 276, z0: 234, z1: 245, type: 5, orient: 0, decor: true },
  { id: 'fallow', x0: 226, x1: 240, z0: 253, z1: 262, type: 4, orient: 0, decor: false },
];

// Interior floor kind by building style: 1 planks, 2 flagstones, 3 packed earth, 4 crystal marble.
export function floorKindOf(style = '') {
  if (/crystal/.test(style)) return 4;
  if (/forge|stables/.test(style)) return 3;
  if (/stone|castle|keep/.test(style)) return 2;
  return 1;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function boxBlur(src, W, H, r, tmp) {
  // horizontal
  for (let z = 0; z < H; z++) {
    let acc = 0;
    const row = z * W;
    for (let x = -r; x <= r; x++) acc += src[row + clamp(x, 0, W - 1)];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = acc / (2 * r + 1);
      acc += src[row + clamp(x + r + 1, 0, W - 1)] - src[row + clamp(x - r, 0, W - 1)];
    }
  }
  // vertical
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let z = -r; z <= r; z++) acc += tmp[clamp(z, 0, H - 1) * W + x];
    for (let z = 0; z < H; z++) {
      src[z * W + x] = acc / (2 * r + 1);
      acc += tmp[clamp(z + r + 1, 0, H - 1) * W + x] - tmp[clamp(z - r, 0, H - 1) * W + x];
    }
  }
}

// Two-pass chamfer distance transform on an N x M grid with source labels.
export function distanceTransform(N, M, isSource, labelOf) {
  const D = new Float32Array(N * M).fill(1e9);
  const L = new Uint8Array(N * M);
  for (let i = 0; i < N * M; i++) if (isSource(i)) { D[i] = 0; L[i] = labelOf ? labelOf(i) : 1; }
  const A = 1, B = Math.SQRT2;
  const relax = (i, j, c) => { const d = D[j] + c; if (d < D[i]) { D[i] = d; L[i] = L[j]; } };
  for (let z = 0; z < M; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x;
    if (x > 0) relax(i, i - 1, A);
    if (z > 0) {
      relax(i, i - N, A);
      if (x > 0) relax(i, i - N - 1, B);
      if (x < N - 1) relax(i, i - N + 1, B);
    }
  }
  for (let z = M - 1; z >= 0; z--) for (let x = N - 1; x >= 0; x--) {
    const i = z * N + x;
    if (x < N - 1) relax(i, i + 1, A);
    if (z < M - 1) {
      relax(i, i + N, A);
      if (x < N - 1) relax(i, i + N + 1, B);
      if (x > 0) relax(i, i + N - 1, B);
    }
  }
  return { D, L };
}

function distToRect(px, pz, x0, z0, x1, z1) {
  const dx = Math.max(x0 - px, 0, px - x1), dz = Math.max(z0 - pz, 0, pz - z1);
  return Math.hypot(dx, dz);
}
function distToSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const L2 = vx * vx + vz * vz;
  const t = L2 > 0 ? clamp(((px - ax) * vx + (pz - az) * vz) / L2, 0, 1) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

// Bilinear sample of a per-vertex scalar field (stride 1) at world (x, z) relative to x0/z0.
export function sampleField(arr, N, x, z, x0 = 0, z0 = 0) {
  let fx = x - x0, fz = z - z0;
  if (fx < 0) fx = 0; if (fz < 0) fz = 0;
  if (fx > N - 1.001) fx = N - 1.001; if (fz > N - 1.001) fz = N - 1.001;
  const i = fx | 0, j = fz | 0;
  const tx = fx - i, tz = fz - j;
  const k = j * N + i;
  return (arr[k] * (1 - tx) + arr[k + 1] * tx) * (1 - tz) + (arr[k + N] * (1 - tx) + arr[k + N + 1] * tx) * tz;
}
// Bilinear sample of an RGB per-vertex field into out[0..2].
export function sampleRGB(arr, N, x, z, out, x0 = 0, z0 = 0) {
  let fx = x - x0, fz = z - z0;
  if (fx < 0) fx = 0; if (fz < 0) fz = 0;
  if (fx > N - 1.001) fx = N - 1.001; if (fz > N - 1.001) fz = N - 1.001;
  const i = fx | 0, j = fz | 0;
  const tx = fx - i, tz = fz - j;
  const k = (j * N + i) * 3;
  const k2 = k + N * 3;
  for (let c = 0; c < 3; c++) {
    out[c] = (arr[k + c] * (1 - tx) + arr[k + 3 + c] * tx) * (1 - tz) + (arr[k2 + c] * (1 - tx) + arr[k2 + 3 + c] * tx) * tz;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Overworld
// ---------------------------------------------------------------------------------------------
let OWF = null;

export function getOverworldFields() {
  if (OWF) return OWF;
  const G = bakeWorld();
  const { W, H, N, heights, flags, zones } = G;
  const NN = N * N;
  const n1 = createNoise2D(4401), n2 = createNoise2D(5502), n3 = createNoise2D(6603);
  const spawns = buildSpawns();

  // ---- zone weights (blurred per tile, averaged to vertices) ----
  const zoneW = new Float32Array(NN * ZK);
  {
    const f = new Float32Array(W * H), tmp = new Float32Array(W * H);
    for (let k = 0; k < ZK; k++) {
      let any = false;
      for (let i = 0; i < W * H; i++) { const v = zones[i] === k ? 1 : 0; f[i] = v; if (v) any = true; }
      if (!any) continue;
      boxBlur(f, W, H, 3, tmp);
      boxBlur(f, W, H, 3, tmp);
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        const x0 = clamp(x - 1, 0, W - 1), x1 = clamp(x, 0, W - 1), z0 = clamp(z - 1, 0, H - 1), z1 = clamp(z, 0, H - 1);
        zoneW[(z * N + x) * ZK + k] = 0.25 * (f[z0 * W + x0] + f[z0 * W + x1] + f[z1 * W + x0] + f[z1 * W + x1]);
      }
    }
    for (let v = 0; v < NN; v++) {
      let s = 0;
      for (let k = 0; k < ZK; k++) s += zoneW[v * ZK + k];
      if (s < 1e-4) { zoneW[v * ZK] = 1; continue; }
      for (let k = 0; k < ZK; k++) zoneW[v * ZK + k] /= s;
    }
  }
  const zw = (v, key) => zoneW[v * ZK + ZI[key]];

  // ---- water classification + distance fields ----
  const isWaterV = (v) => heights[v] < 0;
  const waterTypeAt = (x, z, v) => {
    if (zw(v, 'mistfen') > 0.45) return W_SWAMP;
    for (const L of LAKES) if (Math.hypot(x - L.x, z - L.z) < L.r * 1.35 + 2) return W_LAKE;
    const dr = distToRiver(x, z);
    if (z > 300 || (z > 284 && dr > RIVER.width * 0.5 + 3)) return W_SEA;
    if (dr < RIVER.width + 4) return W_RIVER;
    return z > 270 ? W_SEA : W_LAKE;
  };
  const wtypeOwn = new Uint8Array(NN);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const v = z * N + x;
    if (isWaterV(v)) wtypeOwn[v] = waterTypeAt(x, z, v);
  }
  const toWater = distanceTransform(N, N, isWaterV, (i) => wtypeOwn[i]);
  // Land sources for the shore distance include pier / bridge edges (foam around posts).
  const postV = new Uint8Array(NN);
  for (const b of BRIDGES) {
    // pier / bridge outline (continuous) so foam laps along the deck edges
    for (let z = b.z0; z <= b.z1 + 1; z++) for (let x = b.x0; x <= b.x1 + 1; x++) {
      const edge = x === b.x0 || x === b.x1 + 1 || z === b.z0 || z === b.z1 + 1;
      if (edge && x < N && z < N) postV[z * N + x] = 1;
    }
  }
  const toLand = distanceTransform(N, N, (i) => !isWaterV(i), null);
  const toPost = distanceTransform(N, N, (i) => postV[i] === 1, null);
  const waterDist = toWater.D, landDist = toLand.D, postDist = toPost.D;
  const wtype = new Uint8Array(NN);
  for (let v = 0; v < NN; v++) wtype[v] = isWaterV(v) ? wtypeOwn[v] : (waterDist[v] < 12 ? toWater.L[v] : W_NONE);

  // ---- river flow ----
  const flowX = new Float32Array(NN), flowZ = new Float32Array(NN), flowSpeed = new Float32Array(NN);
  {
    const P = RIVER.points, rw = RIVER.width / 2;
    const best = new Float32Array(NN).fill(1e9), bestI = new Int16Array(NN).fill(-1);
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - rw - 4)), x1 = Math.min(N - 1, Math.ceil(Math.max(a.x, b.x) + rw + 4));
      const z0 = Math.max(0, Math.floor(Math.min(a.z, b.z) - rw - 4)), z1 = Math.min(N - 1, Math.ceil(Math.max(a.z, b.z) + rw + 4));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const v = z * N + x;
        const d = distToSeg(x, z, a.x, a.z, b.x, b.z);
        if (d < best[v]) { best[v] = d; bestI[v] = i; }
      }
    }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const v = z * N + x;
      const bi = bestI[v];
      if (bi < 0 || best[v] > rw + 3 || heights[v] > 0.6) continue;
      let dx = P[bi + 1].x - P[bi].x, dz = P[bi + 1].z - P[bi].z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      let sp = 1 - 0.65 * smoothstep(0, rw + 2.5, best[v]);
      for (const L of LAKES) {
        const dl = Math.hypot(x - L.x, z - L.z);
        sp *= lerp(0.18, 1, smoothstep(L.r * 0.6, L.r * 1.25, dl));
      }
      if (z > 296) sp *= 1 - smoothstep(296, 312, z);
      flowX[v] = dx; flowZ[v] = dz; flowSpeed[v] = sp;
    }
  }

  // ---- masks ----
  const road = new Float32Array(NN), sand = new Float32Array(NN), pebble = new Float32Array(NN), mud = new Float32Array(NN);
  const floor = new Float32Array(NN), floorType = new Float32Array(NN), farm = new Float32Array(NN), farmInfo = new Float32Array(NN);
  const cobble = new Float32Array(NN), ash = new Float32Array(NN), crystal = new Float32Array(NN), ao = new Float32Array(NN).fill(1);
  const snow = new Float32Array(NN);
  const GM = ZONES.gildmoor, OR = ZONES.oracle, PK = ZONES.highlands.peak, CAMP = ZONES.hoodwood.camp;

  // door paths (capsules from door tile outward)
  const doorCaps = [];
  for (const b of BUILDINGS) {
    for (const d of b.doors || []) {
      let ox = 0, oz = 0;
      if (d.z === b.z) oz = -1; else if (d.z === b.z + b.d - 1) oz = 1; else if (d.x === b.x) ox = -1; else ox = 1;
      const cx = d.x + 0.5, cz = d.z + 0.5;
      doorCaps.push([cx + ox * 0.6, cz + oz * 0.6, cx + ox * 3.2, cz + oz * 3.2]);
    }
  }
  const plazas = [
    { x: 185.5, z: 246.5, r: 4.2, k: 0.9 }, // Brightwater well green
    { x: CAMP.x + 1, z: CAMP.z + 0.5, r: 5.5, k: 0.7 }, // Hood camp trampled ground
    { x: 95, z: 259, r: 5.5, k: 0.75 }, // Copperhollow yard
    { x: 100, z: 257, r: 3.5, k: 0.8 },
    { x: 196, z: 287, r: 4.5, k: 0.6 }, // dock head
  ];

  // Roads: windowed per segment (min distance), then doors, plazas, Gildmoor cobbles.
  {
    const dmin = new Float32Array(NN).fill(1e9);
    for (const R of ROADS) {
      const hw = (R.width || 3) / 2;
      for (let i = 0; i < R.points.length - 1; i++) {
        const a = R.points[i], b = R.points[i + 1];
        const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - hw - 3)), x1 = Math.min(N - 1, Math.ceil(Math.max(a.x, b.x) + hw + 3));
        const z0 = Math.max(0, Math.floor(Math.min(a.z, b.z) - hw - 3)), z1 = Math.min(N - 1, Math.ceil(Math.max(a.z, b.z) + hw + 3));
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
          const d = distToSeg(x, z, a.x, a.z, b.x, b.z) - hw;
          const v = z * N + x;
          if (d < dmin[v]) dmin[v] = d;
        }
      }
    }
    for (let v = 0; v < NN; v++) if (dmin[v] < 2 && heights[v] > -0.3) road[v] = 1 - smoothstep(-0.7, 0.85, dmin[v]);
    const win = (cx, cz, r, fn) => {
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(N - 1, Math.ceil(cx + r));
      const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(N - 1, Math.ceil(cz + r));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) fn(x, z, z * N + x);
    };
    for (const c of doorCaps) {
      win((c[0] + c[2]) / 2, (c[1] + c[3]) / 2, 4, (x, z, v) => {
        const dd = distToSeg(x, z, c[0], c[1], c[2], c[3]);
        road[v] = Math.max(road[v], 1 - smoothstep(0.55, 1.35, dd));
      });
    }
    for (const p of plazas) {
      win(p.x, p.z, p.r + 2, (x, z, v) => {
        const dd = Math.hypot(x - p.x, z - p.z);
        road[v] = Math.max(road[v], p.k * (1 - smoothstep(p.r - 1.5, p.r + 0.8, dd + 1.2 * n3(x * 0.3, z * 0.3))));
      });
    }
    win(GM.x, GM.z, GM.wallR, (x, z, v) => {
      const dg = Math.hypot(x - GM.x, z - GM.z);
      if (dg >= GM.wallR - 1) return;
      cobble[v] = 1 - smoothstep(GM.wallR - 3, GM.wallR - 1, dg);
      if (dg < 9.5) road[v] = Math.max(road[v], 1 - smoothstep(7.5, 9.5, dg + n3(x * 0.25, z * 0.25)));
    });
    win(OR.x, OR.z, 9, (x, z, v) => {
      const dor = Math.hypot(x - OR.x, z - OR.z);
      const k = 1 - smoothstep(6.5, 8.5, dor);
      road[v] = Math.max(road[v], k);
      cobble[v] = Math.max(cobble[v], k);
    });
  }

  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const v = z * N + x;
    const h = heights[v];

    // shores
    const wd = waterDist[v], t = wtype[v];
    if (h < 0) {
      if (t === W_SEA || t === W_LAKE) sand[v] = 1;
      else if (t === W_RIVER) pebble[v] = 1;
      else if (t === W_SWAMP) mud[v] = 1;
    } else if (t !== W_NONE) {
      if (t === W_SEA) sand[v] = (1 - smoothstep(3.5, 7.5, wd + 2 * n2(x * 0.08, z * 0.08))) * (1 - smoothstep(1.6, 2.8, h));
      else if (t === W_LAKE) sand[v] = (1 - smoothstep(1.2, 3.4, wd + 1.4 * n2(x * 0.1, z * 0.1))) * (1 - smoothstep(1.0, 2.1, h));
      else if (t === W_RIVER) pebble[v] = (1 - smoothstep(0.6, 2.3, wd + 0.8 * n2(x * 0.15, z * 0.15))) * (1 - smoothstep(0.9, 1.9, h));
      else if (t === W_SWAMP) mud[v] = 1 - smoothstep(0.8, 3.2, wd + n2(x * 0.12, z * 0.12));
    }
    const wM = zw(v, 'mistfen');
    if (wM > 0.05) mud[v] = Math.max(mud[v], wM * smoothstep(0.05, 0.45, n1(x * 0.06 + 3, z * 0.06)));
    const wC = zw(v, 'copperhollow'), wHl = zw(v, 'highlands');
    if (wC + wHl > 0.05) pebble[v] = Math.max(pebble[v], (wC * 0.9 + wHl * 0.7) * smoothstep(0.25, 0.65, n2(x * 0.07 - 9, z * 0.07 + 4)));

    // ash around the peak
    const dp = Math.hypot(x - PK.x, z - PK.z);
    if (dp < PK.r + 34) ash[v] = (1 - smoothstep(PK.r + 3, PK.r + 30, dp + 6 * n1(x * 0.05, z * 0.05))) * smoothstep(8, 18, h);
    // crystal plateau
    const dor = Math.hypot(x - OR.x, z - OR.z);
    if (dor < OR.r) crystal[v] = 1 - smoothstep(OR.r * 0.5, OR.r * 0.66, dor + 2 * n3(x * 0.1, z * 0.1));
    // snow on high peaks
    if (h > 24) snow[v] = smoothstep(29, 34, h + 4 * n1(x * 0.07, z * 0.07)) * (1 - smoothstep(0.05, 0.3, ash[v])) * 0.85;
  }

  // farm fields
  for (const F of FARM_FIELDS) {
    for (let z = F.z0 - 2; z <= F.z1 + 3; z++) for (let x = F.x0 - 2; x <= F.x1 + 3; x++) {
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      const v = z * N + x;
      const d = distToRect(x, z, F.x0 + 0.5, F.z0 + 0.5, F.x1 + 0.5, F.z1 + 0.5);
      const m = (1 - smoothstep(0.2, 1.4, d)) * (1 - road[v]);
      if (m > farm[v]) { farm[v] = m; farmInfo[v] = (F.type + (F.orient ? 8 : 0)) / 15; }
    }
  }

  // indoor floors (count of adjacent indoor tiles / 4)
  for (const b of BUILDINGS) {
    if (b.solid) continue;
    const kind = floorKindOf(b.style);
    for (let z = b.z; z <= b.z + b.d; z++) for (let x = b.x; x <= b.x + b.w; x++) {
      const v = z * N + x;
      let c = 0;
      for (const [tx, tz] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) {
        if (tx >= b.x && tx < b.x + b.w && tz >= b.z && tz < b.z + b.d) c++;
      }
      if (c / 4 >= floor[v]) { floor[v] = c / 4; floorType[v] = kind / 7; }
      if (c === 4) road[v] = 0;
    }
  }

  // ambient occlusion: building contact, trees, rocks
  const aoBlob = (cx, cz, r, k) => {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(N - 1, Math.ceil(cx + r));
    const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(N - 1, Math.ceil(cz + r));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d < r) ao[z * N + x] *= 1 - k * (1 - smoothstep(r * 0.15, r, d));
    }
  };
  for (const b of BUILDINGS) {
    const pad = 2;
    for (let z = Math.max(0, b.z - pad); z <= Math.min(N - 1, b.z + b.d + pad); z++) {
      for (let x = Math.max(0, b.x - pad); x <= Math.min(N - 1, b.x + b.w + pad); x++) {
        const d = distToRect(x, z, b.x, b.z, b.x + b.w, b.z + b.d);
        const v = z * N + x;
        if (d > 0) ao[v] *= 0.62 + 0.38 * smoothstep(0, 1.8, d);
        else if (!b.solid && !b.open) {
          const di = Math.min(x - b.x, b.x + b.w - x, z - b.z, b.z + b.d - z);
          ao[v] *= 0.72 + 0.28 * smoothstep(0.9, 2.2, di);
        }
      }
    }
  }
  for (const o of spawns.objects) {
    const def = OBJECTS[o.def];
    const kind = def?.model?.kind || '';
    const cx = o.x + (o.w || 1) / 2, cz = o.z + (o.d || 1) / 2;
    if (kind.startsWith('tree')) aoBlob(cx, cz, 1.8 + (o.w || 1) * 0.9, 0.5);
    else if (kind === 'rock-ore' || kind === 'crystal') aoBlob(cx, cz, 1.4, 0.35);
    else if (!def?.walkable) aoBlob(cx, cz, 1.2 + (o.w || 1) * 0.3, 0.25);
  }

  // ---- base + rock colours ----
  const base = new Float32Array(NN * 3), rock = new Float32Array(NN * 3);
  const SEABED = hex(0xc9b88c), SEADEEP = hex(0x5d6f66), RIVERBED = hex(0x8a8170), SWAMPBED = hex(0x3d4232);
  const ALPINE = hex(0x8d8e74), SNOW = hex(0xeef2f5), ASH = hex(0x5e5a55), CRYS = hex(0x7a8ec0), FOREST_DARK = hex(0x34582c);
  const tmp = [0, 0, 0], rk = [0, 0, 0];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const v = z * N + x;
    const h = heights[v];
    const dryN = smoothstep(-0.35, 0.55, fbm(n1, x * 0.018, z * 0.018, 3));
    const midN = n2(x * 0.06, z * 0.06);
    const soilN = smoothstep(0.15, 0.7, fbm(n3, x * 0.045 + 17, z * 0.045 - 5, 2));
    const lushN = (1 - smoothstep(1.5, 7, waterDist[v])) * 0.75;
    tmp[0] = tmp[1] = tmp[2] = 0; rk[0] = rk[1] = rk[2] = 0;
    for (let k = 0; k < ZK; k++) {
      const w = zoneW[v * ZK + k];
      if (w < 0.002) continue;
      const P = PAL_ARR[k];
      const dA = dryN * P.dryAmt, sA = soilN * P.soilAmt;
      for (let c = 0; c < 3; c++) {
        let g = lerp(P.grass[c], P.dry[c], dA);
        g = lerp(g, P.lush[c], lushN);
        g = lerp(g, P.soil[c], sA);
        tmp[c] += g * w;
        rk[c] += P.rock[c] * w;
      }
    }
    // Hoodwood: deep shade under the old canopy
    const wF = zw(v, 'hoodwood');
    if (wF > 0) for (let c = 0; c < 3; c++) tmp[c] = lerp(tmp[c], FOREST_DARK[c], wF * 0.18 * smoothstep(-0.2, 0.6, midN));
    // altitude: alpine grass, then snow
    const alt = smoothstep(13, 30, h);
    for (let c = 0; c < 3; c++) {
      tmp[c] = lerp(tmp[c], ALPINE[c], alt * 0.55);
      tmp[c] = lerp(tmp[c], ASH[c], ash[v] * 0.85);
      tmp[c] = lerp(tmp[c], CRYS[c], crystal[v] * 0.18);
      tmp[c] = lerp(tmp[c], SNOW[c], snow[v]);
      rk[c] = lerp(rk[c], ASH[c] * 0.85, ash[v] * 0.7);
      rk[c] = lerp(rk[c], 0.62, alt * 0.25);
    }
    // under water: sea/lake sand, river pebbles, swamp mud
    if (h < 0.15) {
      const t = wtype[v];
      const deep = smoothstep(0.2, 4, -h);
      const bed = t === W_RIVER ? RIVERBED : t === W_SWAMP ? SWAMPBED : SEABED;
      const k = smoothstep(0.15, -0.25, h);
      for (let c = 0; c < 3; c++) tmp[c] = lerp(tmp[c], lerp(bed[c], SEADEEP[c], deep * (t === W_SWAMP ? 0.3 : 0.75)), k);
    }
    base[v * 3] = tmp[0]; base[v * 3 + 1] = tmp[1]; base[v * 3 + 2] = tmp[2];
    rock[v * 3] = rk[0]; rock[v * 3 + 1] = rk[1]; rock[v * 3 + 2] = rk[2];
  }

  // ---- tile occupancy for decor: objects, NPCs, building pads, fences, bridges ----
  const occ = new Uint8Array(W * H);
  const mark = (x0, z0, w, d, val = 1) => {
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && z >= 0 && x < W && z < H) occ[z * W + x] |= val;
  };
  for (const o of spawns.objects) mark(o.x, o.z, o.w || 1, o.d || 1, 1);
  for (const n of Object.values(NPCS)) mark(n.x, n.z, 1, 1, 1);
  for (const b of BUILDINGS) mark(b.x - 1, b.z - 1, b.w + 2, b.d + 2, 2);
  for (const f of FENCES) {
    for (let z = f.z0; z <= f.z1; z++) for (let x = f.x0; x <= f.x1; x++) {
      if (x === f.x0 || x === f.x1 || z === f.z0 || z === f.z1) mark(x, z, 1, 1, 4);
    }
  }
  for (const b of BRIDGES) mark(b.x0 - 1, b.z0 - 1, b.x1 - b.x0 + 3, b.z1 - b.z0 + 3, 8);

  OWF = {
    N, W, H, heights, flags, zones, zoneW,
    base, rock, road, sand, pebble, mud, floor, floorType, farm, farmInfo, cobble, ash, crystal, ao, snow,
    waterDist, landDist, postDist, wtype, flowX, flowZ, flowSpeed, occ,
  };
  return OWF;
}

// Zone weight (0..1) at a vertex index for a zone key.
export function zoneWeightAtV(F, v, key) { return F.zoneW[v * ZK + ZI[key]]; }
export function zoneWeightAt(F, x, z, key) {
  const xi = clamp(Math.round(x), 0, F.N - 1), zi = clamp(Math.round(z), 0, F.N - 1);
  return F.zoneW[(zi * F.N + xi) * ZK + ZI[key]];
}

// Decor-friendly tile test (open ground, not road/water/indoor/occupied).
export function isOpenTile(F, tx, tz) {
  if (tx < 0 || tz < 0 || tx >= F.W || tz >= F.H) return false;
  const k = tz * F.W + tx;
  if (F.flags[k] & (T_BLOCK | T_WATER | T_ROAD | T_INDOOR | T_BRIDGE | T_WALL)) return false;
  return F.occ[k] === 0;
}

// ---------------------------------------------------------------------------------------------
// Dungeons
// ---------------------------------------------------------------------------------------------
const DGF = {};
export const DUNGEON_KIND = { warrens: 1, vault: 2, lair: 3 };

export function getDungeonFields(id) {
  if (DGF[id]) return DGF[id];
  const G = bakeDungeon(id);
  const D = DUNGEONS[id];
  const { W, H, N, solid } = G;
  const NN = N * N;
  const kind = DUNGEON_KIND[id];
  const n1 = createNoise2D(7100 + kind), n2 = createNoise2D(7200 + kind);
  // distance from each vertex to the nearest solid tile corner
  const solidV = new Uint8Array(NN);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (!solid[z * W + x]) continue;
    solidV[z * N + x] = solidV[z * N + x + 1] = solidV[(z + 1) * N + x] = solidV[(z + 1) * N + x + 1] = 1;
  }
  // a vertex is "floor-adjacent" if any of its 4 tiles is floor
  const floorV = new Uint8Array(NN);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (solid[z * W + x]) continue;
    floorV[z * N + x] = floorV[z * N + x + 1] = floorV[(z + 1) * N + x] = floorV[(z + 1) * N + x + 1] = 1;
  }
  const dt = distanceTransform(N, N, (i) => solidV[i] === 1 && !floorV[i], null);
  const wallDist = dt.D;
  // distance from solid vertices to floor (depth inside the rock)
  const dtIn = distanceTransform(N, N, (i) => floorV[i] === 1, null);
  const rockDepth = dtIn.D;

  const base = new Float32Array(NN * 3), rock = new Float32Array(NN * 3);
  const road = new Float32Array(NN), sand = new Float32Array(NN), pebble = new Float32Array(NN), mud = new Float32Array(NN);
  const floor = new Float32Array(NN), floorType = new Float32Array(NN), farm = new Float32Array(NN), farmInfo = new Float32Array(NN);
  const cobble = new Float32Array(NN), ash = new Float32Array(NN), crystal = new Float32Array(NN), ao = new Float32Array(NN);
  const PAL = {
    1: { a: hex(0x7c6444), b: hex(0x957856), rock: hex(0x7a6448) },
    2: { a: hex(0x7c7a76), b: hex(0x8f8b84), rock: hex(0x77736c) },
    3: { a: hex(0x4a4440), b: hex(0x655c55), rock: hex(0x3a3434) },
  }[kind];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const v = z * N + x;
    const wx = D.x0 + x, wz = D.z0 + z;
    const m = smoothstep(-0.4, 0.6, fbm(n1, wx * 0.08, wz * 0.08, 3));
    for (let c = 0; c < 3; c++) { base[v * 3 + c] = lerp(PAL.a[c], PAL.b[c], m); rock[v * 3 + c] = PAL.rock[c]; }
    ao[v] = 0.5 + 0.5 * smoothstep(0.2, 3.0, wallDist[v]);
    const p = n2(wx * 0.11, wz * 0.11);
    if (kind === 1) { pebble[v] = smoothstep(0.2, 0.6, p); mud[v] = smoothstep(0.35, 0.75, -p) * 0.8; }
    if (kind === 2) { floor[v] = 1; floorType[v] = 2 / 7; }
    if (kind === 3) { ash[v] = smoothstep(0.0, 0.5, p); }
  }
  if (kind === 2) {
    // crimson carpet runner: entry hall -> corridor -> guard hall -> vault
    const runs = [[23, 24.99, 20, 46], [22, 25.99, 12, 21], [21, 26.99, 4, 12]];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      let r = 0;
      for (const [x0, x1, z0, z1] of runs) {
        const d = distToRect(x, z, x0, z0, x1, z1);
        r = Math.max(r, 1 - smoothstep(0.0, 0.6, d));
      }
      road[z * N + x] = r;
    }
  }
  DGF[id] = {
    N, W, H, x0: D.x0, z0: D.z0, kind, solid, solidV, floorV, wallDist, rockDepth, heights: G.heights,
    base, rock, road, sand, pebble, mud, floor, floorType, farm, farmInfo, cobble, ash, crystal, ao,
  };
  return DGF[id];
}

// Things on the map worth an icon (minimap / world map). Pure data from spawns + npcs + buildings.
let ICONS = null;
export function mapIcons(regionId = 'overworld') {
  if (!ICONS) {
    const spawns = buildSpawns();
    const out = [];
    const seen = new Set();
    const add = (kind, x, z, label, region) => {
      const k = kind + ':' + Math.round(x / 3) + ':' + Math.round(z / 3);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ kind, x, z, label, region });
    };
    const regionOf = (x) => (x >= 1200 ? 'lair' : x >= 1100 ? 'vault' : x >= 1000 ? 'warrens' : 'overworld');
    const OBJ_ICON = {
      bank_booth: ['bank', 'Bank'], exchange_desk: ['exchange', 'The Exchange'], furnace: ['furnace', 'Furnace'], anvil: ['anvil', 'Anvil'],
      range: ['range', 'Cooking range'], crystal_altar: ['altar', 'Sigil altar'], spinning_wheel: ['spinning', 'Spinning wheel'],
      tanning_rack: ['tanner', 'Tanning rack'], well: ['well', 'Well'], hopper: ['mill', 'Windmill'], cave_entrance: ['dungeon', 'Goblin Warrens'],
      vault_stairs: ['dungeon', "Sheriff's Vault"], lair_entrance: ['dungeon', 'Ashen Lair'], cave_exit: ['exit', 'Exit'], vault_stairs_up: ['exit', 'Exit'],
      archery_target: ['archery', 'Archery range'], fire: ['fire', 'Campfire'], stall_bakery: ['stall', 'Market stall'], stall_silk: ['stall', 'Market stall'],
      stall_fur: ['stall', 'Market stall'], stall_gem: ['stall', 'Market stall'], chest_vault: ['chest', 'Strongbox'], chest_lair: ['chest', 'Hoard'],
    };
    for (const o of spawns.objects) {
      const cx = o.x + (o.w || 1) / 2, cz = o.z + (o.d || 1) / 2;
      const ic = OBJ_ICON[o.def];
      if (ic) add(ic[0], cx, cz, o.label || ic[1], regionOf(cx));
      else if (o.def.startsWith('fish_')) add('fishing', cx, cz, 'Fishing spot', regionOf(cx));
      else if (o.def.startsWith('rock_')) add('mining', cx, cz, 'Mining site', regionOf(cx));
    }
    for (const n of Object.values(NPCS)) {
      const cx = n.x + 0.5, cz = n.z + 0.5;
      if (n.isOracle) add('oracle', cx, cz, n.name, regionOf(cx));
      else if (n.quest) add('quest', cx, cz, n.name, regionOf(cx));
      if (n.shop) add('shop', cx, cz, n.role || 'Shop', regionOf(cx));
    }
    ICONS = out;
  }
  return ICONS.filter((i) => i.region === regionId);
}

// Height of the decorative skirt beyond the 320 x 320 overworld: mountains west / north / east,
// seabed to the south. Continuous with the world at the edge (inside it returns the real height).
const SK_R = createNoise2D(31337), SK_M = createNoise2D(4242);
export function skirtHeight(x, z) {
  const W = 320;
  if (x >= 0 && x <= W && z >= 0 && z <= W) return mapHeightAt(Math.min(W - 0.01, x), Math.min(W - 0.01, z));
  const cx = Math.max(0.5, Math.min(W - 0.5, x)), cz = Math.max(0.5, Math.min(W - 0.5, z));
  const he = mapHeightAt(cx, cz);
  const d = Math.hypot(x - cx, z - cz);
  const rid = ridged(SK_R, x * 0.012, z * 0.012, 4);
  const rise = 50 * (1 - Math.exp(-d / 70)) + rid * 30 * Math.min(1, d / 60) + fbm(SK_M, x * 0.03, z * 0.03, 3) * 5;
  const hm = he + rise;
  const hs = Math.min(he, -2) - Math.min(d, 400) * 0.03 - 2;
  const mF = 1 - smoothstep(282, 336, z);
  return hs + (hm - hs) * mF;
}
export const skirtNoise = SK_M;
