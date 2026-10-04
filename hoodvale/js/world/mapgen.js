// Hoodvale world generator. Pure module (no three.js): runs in node for tooling and in the page.
//
// Coordinates: +x east, +z south, +y up. 1 tile = 1 metre. Tile (tx, tz) covers
// [tx, tx+1) x [tz, tz+1); its centre is (tx + 0.5, tz + 0.5). Water level is y = 0.
// Yaw convention: Object3D.rotation.y; facing = (-sin yaw, 0, -cos yaw) (yaw 0 faces north/-z).
//
// The overworld is 320 x 320 tiles. Dungeons are separate regions placed far east in the same
// coordinate space (they never overlap the overworld) and are reached through entrances.
// Everything here is deterministic: every module (terrain, spawns, pathfinding, minimap) agrees.

import { createNoise2D, fbm, ridged, mulberry32 } from '../core/noise.js';
import { ZONES, ROADS, RIVER, LAKES, BRIDGES, FENCES } from '../data/zones.js';
import { BUILDINGS } from '../data/buildings.js';

export const WATER_LEVEL = 0;
export const OVERWORLD = { id: 'overworld', x0: 0, z0: 0, w: 320, h: 320 };

// Tile flags.
export const T_BLOCK = 1; // cannot stand here
export const T_WATER = 2; // water surface (fishing spots sit next to these)
export const T_ROAD = 4;
export const T_BRIDGE = 8;
export const T_INDOOR = 16; // under a roof
export const T_WALL = 32; // building wall
export const T_CLIFF = 64; // too steep
export const T_EDGE = 128; // world edge

const nA = createNoise2D(9101);
const nB = createNoise2D(1234);
const nC = createNoise2D(777);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const L2 = vx * vx + vz * vz;
  let t = L2 > 0 ? ((px - ax) * vx + (pz - az) * vz) / L2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}
export function distToPolyline(px, pz, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(px, pz, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z);
    if (d < best) best = d;
  }
  return best;
}
export function distToRoad(x, z) {
  let best = Infinity;
  for (const r of ROADS) best = Math.min(best, distToPolyline(x, z, r.points) - (r.width || 3) / 2);
  return best;
}
export function distToRiver(x, z) {
  return distToPolyline(x, z, RIVER.points);
}

// Zone weight: 1 inside 0.6*r, fading to 0 at r (+ a little noise on the rim).
function zoneWeight(zone, x, z) {
  const d = Math.hypot(x - zone.x, z - zone.z);
  const rim = zone.r * (1 + 0.12 * nB(x * 0.03, z * 0.03));
  return 1 - smoothstep(rim * 0.6, rim, d);
}

// ---------------------------------------------------------------------------
// Height (continuous, before building pads)
// ---------------------------------------------------------------------------
export function rawHeight(x, z) {
  const W = OVERWORLD.w, H = OVERWORLD.h;
  let h = 3 + 2.2 * fbm(nA, x * 0.018, z * 0.018, 4);
  const detail = fbm(nC, x * 0.08, z * 0.08, 2);
  h += detail * 0.35;

  const Z = ZONES;
  // Mountains along the west, north and east edges.
  const edge = Math.min(x, z, W - x);
  const rid = ridged(nB, x * 0.035, z * 0.035, 4);
  h += smoothstep(18, 1, edge) * (16 + 14 * rid);

  // Highlands (north-west): rugged mountains, the wyrm peak plateau.
  const wH = zoneWeight(Z.highlands, x, z);
  h += wH * (7 + 12 * ridged(nA, x * 0.02 + 7, z * 0.02 - 3, 3));
  // Copperhollow hills.
  const wC = zoneWeight(Z.copperhollow, x, z);
  h += wC * (3 + 6 * ridged(nC, x * 0.05, z * 0.05, 3));
  // Hoodwood: bumpy forest floor.
  const wF = zoneWeight(Z.hoodwood, x, z);
  h += wF * 1.6 * fbm(nB, x * 0.05, z * 0.05, 3);
  // Mistfen: low and wet.
  const wM = zoneWeight(Z.mistfen, x, z);
  if (wM > 0) {
    const pool = fbm(nC, x * 0.07 + 11, z * 0.07 - 5, 3);
    const swamp = 0.7 + 0.5 * fbm(nA, x * 0.04, z * 0.04, 2) - (pool > 0.2 ? (pool - 0.2) * 4.5 : 0);
    h = lerp(h, swamp, wM);
  }
  // Flattened settlements.
  for (const id of ['brightwater', 'gildmoor', 'farms', 'docks']) {
    const zn = Z[id];
    const w = 1 - smoothstep(zn.r * 0.75, zn.r * 1.05, Math.hypot(x - zn.x, z - zn.z));
    if (w > 0) h = lerp(h, zn.floor + detail * 0.12, w);
  }
  // Gildmoor castle hill.
  const ch = Z.gildmoor.castle;
  h += 4.5 * (1 - smoothstep(ch.r, ch.r + 6, Math.hypot(x - ch.x, z - ch.z)));
  // Oracle plateau: sharp cliff, ramp along its road.
  const O = Z.oracle;
  const dO = Math.hypot(x - O.x, z - O.z);
  const plateau = 1 - smoothstep(O.r * 0.55, O.r * 0.62, dO);
  if (plateau > 0) h = Math.max(h, lerp(h, O.floor, plateau));
  // Wyrm peak.
  const P = Z.highlands.peak;
  const dP = Math.hypot(x - P.x, z - P.z);
  h = lerp(h, P.floor, 1 - smoothstep(P.r, P.r + 3, dP));

  // Sea along the south.
  const coast = 292 + 5 * nA(x * 0.02, 3.3);
  h = lerp(h, -6, smoothstep(coast - 4, coast + 10, z));

  // Lakes.
  for (const L of LAKES) {
    const d = Math.hypot(x - L.x, z - L.z) - L.r * (1 + 0.15 * nB(x * 0.05, z * 0.05));
    if (d < 6) h = lerp(h, L.depth, 1 - smoothstep(-1.5, 6, d));
  }
  // River.
  const dr = distToRiver(x, z);
  const rw = RIVER.width / 2;
  if (dr < rw + 5) {
    const bank = Math.min(h, 1.2);
    h = lerp(h, bank, 1 - smoothstep(rw + 1, rw + 5, dr));
    if (dr < rw + 1.2) h = lerp(h, RIVER.depth, 1 - smoothstep(rw - 0.6, rw + 1.2, dr));
  }
  // Roads: smooth out detail; never under water.
  const droad = distToRoad(x, z);
  if (droad < 2) h -= detail * 0.3 * (1 - smoothstep(0, 2, droad));
  return h;
}

// ---------------------------------------------------------------------------
// Baked overworld: corner heights (W+1)^2, tile flags W*H, tile zone ids W*H
// ---------------------------------------------------------------------------
let BAKED = null;

export const ZONE_IDS = Object.keys(ZONES); // index+1 stored per tile, 0 = wilderness

export function bakeWorld() {
  if (BAKED) return BAKED;
  const { w: W, h: H } = OVERWORLD;
  const N = W + 1;
  const heights = new Float32Array(N * N);
  for (let z = 0; z <= H; z++) for (let x = 0; x <= W; x++) heights[z * N + x] = rawHeight(x, z);

  // Building pads: flatten every footprint (+1 tile apron) to its centre height.
  for (const b of BUILDINGS) {
    const cx = b.x + b.w / 2, cz = b.z + b.d / 2;
    const target = b.floorY ?? heights[Math.round(cz) * N + Math.round(cx)];
    b.floorY = target;
    for (let z = b.z - 1; z <= b.z + b.d + 1; z++) {
      for (let x = b.x - 1; x <= b.x + b.w + 1; x++) {
        if (x < 0 || z < 0 || x > W || z > H) continue;
        const inside = x >= b.x && x <= b.x + b.w && z >= b.z && z <= b.z + b.d;
        const k = z * N + x;
        heights[k] = inside ? target : lerp(heights[k], target, 0.6);
      }
    }
  }

  const flags = new Uint8Array(W * H);
  const zones = new Uint8Array(W * H);
  for (let tz = 0; tz < H; tz++) {
    for (let tx = 0; tx < W; tx++) {
      const k = tz * W + tx;
      const a = heights[tz * N + tx], b = heights[tz * N + tx + 1];
      const c = heights[(tz + 1) * N + tx], d = heights[(tz + 1) * N + tx + 1];
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
      const cx = tx + 0.5, cz = tz + 0.5;
      let f = 0;
      if ((a + b + c + d) / 4 < WATER_LEVEL - 0.05) f |= T_WATER | T_BLOCK;
      if (hi - lo > 1.7) f |= T_CLIFF | T_BLOCK;
      if (tx < 3 || tz < 3 || tx >= W - 3 || tz >= H - 3) f |= T_EDGE | T_BLOCK;
      if (distToRoad(cx, cz) < 0.6) {
        f |= T_ROAD;
        f &= ~T_CLIFF; // roads are always walkable (switchbacks on mountain trails)
        if (!(f & (T_WATER | T_EDGE))) f &= ~T_BLOCK;
      }
      zones[k] = zoneIndexAt(cx, cz);
      flags[k] = f;
    }
  }
  // Bridges: walkable over water.
  for (const br of BRIDGES) {
    for (let tz = Math.floor(br.z0); tz <= Math.floor(br.z1); tz++) {
      for (let tx = Math.floor(br.x0); tx <= Math.floor(br.x1); tx++) {
        const k = tz * W + tx;
        flags[k] = (flags[k] & ~(T_BLOCK | T_CLIFF)) | T_BRIDGE | T_ROAD;
      }
    }
  }
  // Fences: outline tiles block, gates stay open.
  for (const f of FENCES) {
    for (let tz = f.z0; tz <= f.z1; tz++) {
      for (let tx = f.x0; tx <= f.x1; tx++) {
        const edge = tx === f.x0 || tx === f.x1 || tz === f.z0 || tz === f.z1;
        if (!edge || f.gates.some((g) => g.x === tx && g.z === tz)) continue;
        flags[tz * W + tx] |= T_BLOCK | T_WALL;
      }
    }
  }
  // Buildings: walls block, interiors are indoor, doors open.
  for (const b of BUILDINGS) {
    if (b.solid) { // non-enterable (tents, windmill, tower base, ruins)
      for (let tz = b.z; tz < b.z + b.d; tz++) for (let tx = b.x; tx < b.x + b.w; tx++) flags[tz * W + tx] |= T_BLOCK | T_WALL;
      continue;
    }
    for (let tz = b.z; tz < b.z + b.d; tz++) {
      for (let tx = b.x; tx < b.x + b.w; tx++) {
        const k = tz * W + tx;
        const perim = !b.open && (tx === b.x || tz === b.z || tx === b.x + b.w - 1 || tz === b.z + b.d - 1);
        flags[k] &= ~(T_CLIFF | T_BLOCK);
        flags[k] |= T_INDOOR;
        if (perim) flags[k] |= T_WALL | T_BLOCK;
      }
    }
    for (const door of b.doors || []) {
      const k = door.z * W + door.x;
      flags[k] &= ~(T_WALL | T_BLOCK);
    }
  }
  // Town walls (Gildmoor): ring of wall tiles with gate gaps.
  const G = ZONES.gildmoor;
  for (let tz = 0; tz < H; tz++) {
    for (let tx = 0; tx < W; tx++) {
      const d = Math.hypot(tx + 0.5 - G.x, tz + 0.5 - G.z);
      if (Math.abs(d - G.wallR) > 0.75) continue;
      const ang = Math.atan2(tz + 0.5 - G.z, tx + 0.5 - G.x);
      const isGate = G.gates.some((g) => Math.abs(angDiff(ang, g.ang)) * G.wallR < 2.2);
      if (!isGate) flags[tz * W + tx] |= T_WALL | T_BLOCK;
    }
  }
  BAKED = { heights, flags, zones, N, W, H };
  return BAKED;
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function zoneIndexAt(x, z) {
  let best = 0, bestW = 0.15;
  for (let i = 0; i < ZONE_IDS.length; i++) {
    const zn = ZONES[ZONE_IDS[i]];
    const d = Math.hypot(x - zn.x, z - zn.z);
    const w = 1 - d / zn.r;
    if (w > bestW) { bestW = w; best = i + 1; }
  }
  return best;
}
export function zoneAt(x, z) {
  const reg = regionAt(x, z);
  if (reg.id !== 'overworld') return reg.zone;
  const W = BAKED || bakeWorld();
  const tx = Math.floor(x), tz = Math.floor(z);
  if (tx < 0 || tz < 0 || tx >= W.W || tz >= W.H) return null;
  const i = W.zones[tz * W.W + tx];
  return i ? ZONE_IDS[i - 1] : 'wilds';
}

// ---------------------------------------------------------------------------
// Dungeons: separate small regions (cellular-automata caves / built rooms)
// ---------------------------------------------------------------------------
export const DUNGEONS = {
  warrens: { id: 'warrens', zone: 'warrens', x0: 1000, z0: 0, w: 64, h: 64, floor: 0, seed: 77, kind: 'cave' },
  vault: { id: 'vault', zone: 'vault', x0: 1100, z0: 0, w: 48, h: 48, floor: 0, seed: 5, kind: 'rooms' },
  lair: { id: 'lair', zone: 'lair', x0: 1200, z0: 0, w: 56, h: 56, floor: 0, seed: 404, kind: 'cave' },
};

const DUNGEON_BAKED = {};
export function bakeDungeon(id) {
  if (DUNGEON_BAKED[id]) return DUNGEON_BAKED[id];
  const D = DUNGEONS[id];
  const rand = mulberry32(D.seed);
  const { w: W, h: H } = D;
  let solid = new Uint8Array(W * H);
  if (D.kind === 'cave') {
    for (let i = 0; i < W * H; i++) solid[i] = rand() < 0.45 ? 1 : 0;
    for (let it = 0; it < 5; it++) {
      const next = new Uint8Array(W * H);
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        let n = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, zz = z + dz;
          if (xx < 0 || zz < 0 || xx >= W || zz >= H) n++;
          else n += solid[zz * W + xx];
        }
        next[z * W + x] = n >= 5 ? 1 : 0;
      }
      solid = next;
    }
    // Carve a guaranteed spine from the entrance (south) to the far end (north).
    let x = W / 2, z = H - 4;
    while (z > 3) {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -2; dx <= 2; dx++) {
        const xx = Math.round(x) + dx, zz = z + dz;
        if (xx > 1 && zz > 1 && xx < W - 2 && zz < H - 2) solid[zz * W + xx] = 0;
      }
      x = clamp(x + (rand() - 0.5) * 3, 6, W - 7);
      z -= 1;
    }
    // Big chamber at the far end (boss / chest room).
    for (let zz = 4; zz < 16; zz++) for (let xx = W / 2 - 8; xx < W / 2 + 8; xx++) {
      if (Math.hypot(xx - W / 2, zz - 10) < 7.5) solid[zz * W + xx] = 0;
    }
  } else {
    solid.fill(1);
    const room = (x0, z0, w, h) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) solid[z * W + x] = 0; };
    room(20, 38, 8, 8); // entry hall
    room(22, 20, 4, 18); // corridor north
    room(12, 12, 24, 10); // guard hall
    room(16, 3, 16, 9); // the vault
    room(4, 26, 18, 4); room(4, 18, 6, 10); // west cells
    room(26, 28, 18, 4); room(38, 18, 6, 12); // east armoury
  }
  // Border.
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (x < 1 || z < 1 || x >= W - 1 || z >= H - 1) solid[z * W + x] = 1;
  const flags = new Uint8Array(W * H);
  const heights = new Float32Array((W + 1) * (H + 1));
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (solid[z * W + x]) flags[z * W + x] = T_BLOCK | T_WALL;
  // Corner heights: floor 0 with a little noise; walls are rendered by the art (not terrain).
  for (let z = 0; z <= H; z++) for (let x = 0; x <= W; x++) heights[z * (W + 1) + x] = D.floor + 0.15 * nC((x + D.x0) * 0.2, z * 0.2);
  DUNGEON_BAKED[id] = { ...D, flags, heights, N: W + 1, W, H, solid };
  return DUNGEON_BAKED[id];
}

// Region lookup for any world position.
export function regionAt(x, z) {
  for (const id in DUNGEONS) {
    const D = DUNGEONS[id];
    if (x >= D.x0 && x < D.x0 + D.w && z >= D.z0 && z < D.z0 + D.h) return D;
  }
  return OVERWORLD;
}

function gridOf(region) {
  return region.id === 'overworld' ? bakeWorld() : bakeDungeon(region.id);
}

// Terrain height at any world point (bilinear over corners, same split as the mesh).
export function heightAt(x, z) {
  const R = regionAt(x, z);
  const G = gridOf(R);
  let fx = x - R.x0, fz = z - R.z0;
  if (fx < 0 || fz < 0 || fx >= G.W || fz >= G.H) return -6;
  const i = fx | 0, j = fz | 0;
  fx -= i; fz -= j;
  const k = j * G.N + i;
  const a = G.heights[k], b = G.heights[k + 1], c = G.heights[k + G.N], d = G.heights[k + G.N + 1];
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

// Tile flags at world tile (integer coords). Outside any region = blocked.
export function tileFlags(tx, tz) {
  const R = regionAt(tx + 0.5, tz + 0.5);
  const G = gridOf(R);
  const lx = tx - R.x0, lz = tz - R.z0;
  if (lx < 0 || lz < 0 || lx >= G.W || lz >= G.H) return T_BLOCK | T_EDGE;
  return G.flags[lz * G.W + lx];
}

export function getRegionGrid(id) {
  return id === 'overworld' ? bakeWorld() : bakeDungeon(id);
}
