// LENTERA heightfield + landmark layout. Pure module (no three.js): runs in node for tooling.
//
// Coordinates: +x = east, +z = south, +y = up. Sea level is y = 0. One unit = one metre.
// Yaw convention (everywhere): yaw = Object3D.rotation.y; facing direction = (-sin yaw, 0, -cos yaw),
// so yaw 0 faces north (-z) and models are built facing their local -z.
// The island is roughly 470 m across. Everything in LANDMARKS is load-bearing for other
// modules (structures, gameplay, npc placement): DO NOT change these numbers without
// updating DESIGN.md and every consumer.

import { createNoise2D, fbm, ridged } from '../core/noise.js';

export const SEA_LEVEL = 0;
export const WORLD_HALF = 400; // terrain covers [-400, 400] on x and z
export const GRID_STEP = 2.5; // metres between baked samples (and terrain mesh vertices)
export const GRID_N = Math.round((WORLD_HALF * 2) / GRID_STEP) + 1; // 321

const n1 = createNoise2D(20240817);
const n2 = createNoise2D(777);
const n3 = createNoise2D(4242);

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const gauss = (d2, s) => Math.exp(-d2 / (2 * s * s));
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

// ---------------------------------------------------------------------------
// LANDMARKS: authoritative positions. y values marked "floor" are walkable heights
// that the heightfield guarantees (flattened). Structure-relative heights (decks,
// terraces) are owned by structures.js but must match the numbers given here.
// ---------------------------------------------------------------------------
export const LANDMARKS = {
  spawn: { x: 0, z: 242, y: 1.6, yaw: 0 }, // standing on the pier end, facing north (-z)
  boatStart: { x: 0, z: 320, yaw: 0 }, // intro boat starts here and sails to the pier
  boatMoor: { x: 3.4, z: 244, yaw: 0 },

  pier: { x: 0, zStart: 196, zEnd: 248, width: 3.2, deckY: 1.6 },

  kampung: {
    x: 0, z: 158, floor: 3.0, radius: 36,
    // Rumah panggung (stilt houses). Deck height above floor = 1.8 (deck top y = 4.8).
    // Front (door + veranda + ladder) faces the plaza: front direction = (-sin yaw, -cos yaw).
    houses: [
      { id: 'rumah-sarni', x: -14, z: 140, yaw: -2.481, w: 7, d: 6 },
      { id: 'rumah-darto', x: 16, z: 136, yaw: 2.513, w: 6.5, d: 6 },
      { id: 'rumah-3', x: -26, z: 162, yaw: -1.418, w: 6, d: 5.5 },
      { id: 'rumah-4', x: 27, z: 160, yaw: 1.497, w: 6, d: 5.5 },
      { id: 'rumah-5', x: -6, z: 124, yaw: -2.967, w: 8, d: 6.5 }, // west of the candi path
    ],
    warung: { x: 14, z: 176, yaw: 0.661 }, // Bu Ratih's food stall (ground level, open front faces plaza)
    campfire: { x: 0, z: 158 }, // = checkpoint 'kampung'
  },

  mercusuar: {
    x: 200, z: 40, floor: 19, // platform top of the headland
    towerRadius: 3.2, towerHeight: 30,
    door: { x: 196.6, z: 41.2 }, // west-facing door at the base
    // Three stone braziers ("tungku") around the tower base for the three flames.
    sockets: [
      { id: 'tirta', x: 193.0, z: 46.5 },
      { id: 'bumi', x: 192.0, z: 35.0 },
      { id: 'samudra', x: 201.5, z: 49.0 },
    ],
  },

  candi: {
    x: 30, z: -138, floor: 34, // courtyard (flattened plateau, radius ~30)
    // Stepped temple: 3 terraces then the shrine body. Terrace i has half-size and top height
    // (absolute y). Stairs on the south face (+z).
    terraces: [
      { half: 14, top: 36.0 },
      { half: 10.5, top: 38.0 },
      { half: 7.5, top: 40.0 },
    ],
    shrine: { half: 5, top: 47 }, // shrine body (hollow; inner chamber floor at 40.0)
    chamber: { x: 30, z: -138, floorY: 40.0, half: 3.2 }, // inner chamber: Api Bumi lives here
    door: { x: 30, z: -133 }, // shrine doorway on the south side, sealed until the pelita puzzle
    // Four pelita (oil lamps) on the corners of terrace 1. Correct lighting order is
    // fixed in gameplay: ['utara', 'timur', 'selatan', 'barat'] -> see DESIGN.md.
    pelita: [
      { id: 'utara', x: 30, z: -150.5 },
      { id: 'timur', x: 42.5, z: -138 },
      { id: 'selatan', x: 30, z: -125.5 },
      { id: 'barat', x: 17.5, z: -138 },
    ],
    relief: { x: 22.5, z: -124.6 }, // carved relief panel that hints the order (cryptic)
    campfire: { x: 36, z: -100 }, // = checkpoint 'candi' (courtyard approach)
  },

  airTerjun: {
    // Waterfall drops from the mesa edge into the cove pool.
    top: { x: -156, z: -33, y: 29.2 }, // lip of the falls (front edge of the cave roof)
    bottomY: 0,
    cove: { x: -178, z: -30, radius: 24 },
    mesa: { x: -108, z: -36, radius: 42, y: 30 }, // western edge (the cliff) at x ~ -150
    // Cave: a slot cut into the cliff behind the falling water. The heightfield carves the
    // slot (floor 1.4, sloping down into the pool at the mouth); structures.js caps it with a
    // rock roof block spanning x [-156, -133], z [-40, -26], ceiling y ~7.5, top y ~28.8.
    // The falls pour off the roof's west edge (x = -156) in front of the cave mouth.
    cave: { x: -141, z: -33, mouthX: -154, halfWidth: 5.5, floorY: 1.4, entrance: { x: -152, z: -33 } },
    flame: { x: -140.5, z: -33 }, // Api Tirta pedestal inside the cave
    campfire: { x: -172, z: 2 }, // = checkpoint 'tirta' (south shore of the cove)
  },

  // River on the mesa, from the mountain flank to the waterfall lip.
  river: [
    { x: -62, z: -52 }, { x: -82, z: -46 }, { x: -104, z: -40 }, { x: -126, z: -36 }, { x: -150, z: -33 },
  ],

  kapalKaram: {
    // Hull centre. Bow direction = (-sin yaw, -cos yaw): it ran aground bow-first toward the
    // beach (east-north-east); the stern with the captain's cabin sits out in deeper water.
    x: -214, z: 150, yaw: -1.107,
    length: 26, beam: 7, tilt: 0.16, // roll in radians
    deckY: 1.7, // walkable stern deck above water
    cabin: { x: -222.5, z: 156 }, // stern cabin (Api Samudra)
    flame: { x: -222.5, z: 156, y: 2.3 },
    beach: { x: -182, z: 134 },
  },

  gunung: { x: -40, z: -62 }, // mountain peak (glide launch point)

  // Where each NPC stands (y comes from collision.groundAt). yaw = facing (see convention above).
  npcs: {
    sarni: { x: -3.4, z: 155.2, yaw: -2.26 }, // elder, sits by the kampung campfire
    darto: { x: 1.1, z: 224, yaw: -1.57 }, // fisherman, sits on the pier edge (deck y 1.6)
    ratih: { x: 14, z: 176, yaw: 0.661 }, // warung owner, behind her counter
    laras: { x: 39, z: -97.5, yaw: 0.22 }, // student sketching the candi, by the candi campfire
    lamun: { x: 194.6, z: 42.6, yaw: 1.6 }, // the old lighthouse keeper's spirit, by the door
  },

  // Points the dense fog "pools" around (gameplay & spirits weigh these).
  fogPockets: [
    { x: -214, z: 150, r: 45 }, // shipwreck
    { x: -150, z: -33, r: 40 }, // waterfall cave
    { x: 30, z: -138, r: 55 }, // temple
    { x: -90, z: 60, r: 60 }, // western forest
    { x: 110, z: -40, r: 55 }, // eastern ridge
  ],
};

// Checkpoints (api unggun). Their positions duplicate the campfire fields above.
export const CHECKPOINTS = [
  { id: 'kampung', x: LANDMARKS.kampung.campfire.x, z: LANDMARKS.kampung.campfire.z, name: 'Api Unggun Kampung' },
  { id: 'tirta', x: LANDMARKS.airTerjun.campfire.x, z: LANDMARKS.airTerjun.campfire.z, name: 'Api Unggun Telaga' },
  { id: 'candi', x: LANDMARKS.candi.campfire.x, z: LANDMARKS.candi.campfire.z, name: 'Api Unggun Candi' },
];

// Footpaths (polylines). Terrain is smoothed along them and the terrain shader tints them.
export const PATHS = [
  // kampung -> mercusuar
  [{ x: 0, z: 158 }, { x: 40, z: 150 }, { x: 90, z: 128 }, { x: 135, z: 98 }, { x: 168, z: 66 }, { x: 186, z: 48 }, { x: 194, z: 42 }],
  // kampung -> candi (east of the mountain)
  [{ x: 0, z: 158 }, { x: 8, z: 110 }, { x: 28, z: 60 }, { x: 48, z: 5 }, { x: 52, z: -45 }, { x: 42, z: -90 }, { x: 34, z: -110 }],
  // kampung -> kapal karam (west beach)
  [{ x: 0, z: 158 }, { x: -40, z: 170 }, { x: -95, z: 160 }, { x: -145, z: 144 }, { x: -178, z: 134 }],
  // fork -> telaga (cove)
  [{ x: -95, z: 160 }, { x: -118, z: 110 }, { x: -146, z: 60 }, { x: -164, z: 22 }, { x: -172, z: 4 }],
  // kampung -> pier
  [{ x: 0, z: 158 }, { x: 0, z: 198 }],
];

// Areas vegetation must leave clear (structures, plazas). r in metres.
export const EXCLUSIONS = [
  { x: 0, z: 158, r: 40 }, // kampung
  { x: 0, z: 200, r: 10 }, // pier head
  { x: 200, z: 40, r: 16 }, // lighthouse platform
  { x: 30, z: -138, r: 30 }, // temple courtyard
  { x: 36, z: -100, r: 8 },
  { x: -172, z: 2, r: 8 },
  { x: -144, z: -33, r: 14 }, // cave
  { x: -214, z: 150, r: 22 }, // wreck
];

// ---------------------------------------------------------------------------
// Analytic height
// ---------------------------------------------------------------------------
const HEADLAND_ANG = Math.atan2(40, 200);
const WEST_ANG = Math.atan2(150, -225);

function coastRadius(ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  let R = 214;
  R += 12 * Math.sin(2 * ang + 0.7) + 8 * Math.sin(5 * ang + 1.9) + 4 * Math.sin(9 * ang + 0.3);
  R += 16 * fbm(n1, c * 1.4 + 7, s * 1.4 + 3, 3);
  R += 34 * Math.exp(-(angDiff(ang, HEADLAND_ANG) ** 2) / (2 * 0.13 * 0.13));
  R += 14 * Math.exp(-(angDiff(ang, WEST_ANG) ** 2) / (2 * 0.22 * 0.22));
  // Pull the south coast in so the kampung beach sits around z ~ 195.
  R -= 10 * Math.exp(-(angDiff(ang, Math.PI / 2) ** 2) / (2 * 0.25 * 0.25));
  return R;
}

// Profile across the coastline. t = metres inland from the nominal coast (negative = sea).
function coastProfile(t) {
  if (t < -70) return -18;
  if (t < -14) return lerp(-18, -2.2, smoothstep(-70, -14, t));
  if (t < 0) return lerp(-2.2, -0.05, smoothstep(-14, 0, t));
  if (t < 26) return lerp(-0.05, 1.7, smoothstep(0, 26, t));
  return 1.7;
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const wx = px - ax, wz = pz - az;
  const L2 = vx * vx + vz * vz;
  let t = L2 > 0 ? (wx * vx + wz * vz) / L2 : 0;
  t = clamp(t, 0, 1);
  const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
  return Math.sqrt(dx * dx + dz * dz);
}

function distToPolyline(px, pz, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(px, pz, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z);
    if (d < best) best = d;
  }
  return best;
}

export function distToPath(x, z) {
  let best = Infinity;
  for (const p of PATHS) {
    const d = distToPolyline(x, z, p);
    if (d < best) best = d;
  }
  return best;
}

export function distToRiver(x, z) {
  return distToPolyline(x, z, LANDMARKS.river);
}

// Flatten h toward target within radius (inner) blending out to outer.
function flatten(h, x, z, cx, cz, target, inner, outer) {
  const d = Math.hypot(x - cx, z - cz);
  if (d >= outer) return h;
  const w = 1 - smoothstep(inner, outer, d);
  return lerp(h, target, w);
}

// Temple approach campfire sits on the hill slope; flattened to this height.
const heightAtCandiApproach = 33.5;

export function heightAtExact(x, z) {
  const r = Math.hypot(x, z);
  const ang = Math.atan2(z, x);
  const R = coastRadius(ang);
  const t = R - r; // metres inland
  let h = coastProfile(t);
  const inland = smoothstep(18, 70, t);

  // Rolling lowlands.
  const roll = fbm(n2, x * 0.0065, z * 0.0065, 4) * 0.5 + 0.5;
  const detail = fbm(n3, x * 0.03, z * 0.03, 3);
  h += inland * (1.5 + 7.5 * roll) + inland * detail * 0.9;

  // Mountain.
  const M = LANDMARKS.gunung;
  const dm2 = (x - M.x) ** 2 + (z - M.z) ** 2;
  h += 62 * gauss(dm2, 46) * inland;
  h += 14 * ridged(n1, x * 0.011 + 3, z * 0.011 - 2, 4) * gauss(dm2, 58) * inland;

  // Eastern ridge for variety.
  h += 10 * gauss((x - 110) ** 2 + (z + 40) ** 2, 40) * inland;

  // Temple hill.
  const C = LANDMARKS.candi;
  h += 18 * gauss((x - C.x) ** 2 + (z - C.z) ** 2, 40) * inland;

  // Lighthouse headland.
  const L = LANDMARKS.mercusuar;
  const dl2 = (x - L.x) ** 2 + (z - L.z) ** 2;
  h += 17 * gauss(dl2, 20);

  // Paths: damp the small-scale noise so walking routes feel worn in.
  const dp = distToPath(x, z);
  if (dp < 6) h -= detail * 0.8 * (1 - smoothstep(1.5, 6, dp)) * inland;

  // ---- Flattened plateaus (order matters: later wins) ----
  h = flatten(h, x, z, L.x, L.z, L.floor, 12, 22);
  h = flatten(h, x, z, C.x, C.z, C.floor, 30, 44);
  h = flatten(h, x, z, C.campfire.x, C.campfire.z, heightAtCandiApproach, 4, 9);
  const K = LANDMARKS.kampung;
  h = flatten(h, x, z, K.x, K.z, K.floor + detail * 0.15, K.radius, K.radius + 22);

  // Cove: carve a pool connected to the sea.
  const A = LANDMARKS.airTerjun;
  const dc = Math.hypot(x - A.cove.x, z - A.cove.z);
  if (dc < A.cove.radius + 20) {
    const w = 1 - smoothstep(A.cove.radius, A.cove.radius + 20, dc);
    h = lerp(h, -5.5, w);
  }
  // Cove south shore beach for the 'tirta' campfire.
  h = flatten(h, x, z, A.campfire.x, A.campfire.z, 1.6, 6, 14);

  // Mesa above the waterfall, applied after the cove so its western edge stays a sheer cliff.
  const dMesa = Math.hypot(x - A.mesa.x, z - A.mesa.z) - A.mesa.radius;
  const mesaW = 1 - smoothstep(-4, 0.5, dMesa);
  if (mesaW > 0) h = Math.max(h, lerp(h, A.mesa.y + detail * 1.2, mesaW));

  // River channel on the mesa.
  const dr = distToRiver(x, z);
  if (dr < 6) h -= 1.6 * (1 - smoothstep(2.0, 6, dr)) * Math.max(mesaW, inland * 0.8);

  // Cave slot behind the falls: floor 1.4, sloping into the pool at the mouth.
  const cv = A.cave;
  const ds = distToSegment(x, z, cv.mouthX - 3, cv.z, cv.x - 1, cv.z);
  if (ds < cv.halfWidth + 1.5) {
    const w = 1 - smoothstep(cv.halfWidth, cv.halfWidth + 1.5, ds);
    const floor = lerp(-1.2, cv.floorY, smoothstep(cv.mouthX - 3, cv.mouthX + 6, x));
    h = lerp(h, floor, w);
  }

  // Shipwreck shallows: make sure the hull sits in ~2.5 m of water.
  const W = LANDMARKS.kapalKaram;
  h = flatten(h, x, z, W.x, W.z, -2.6, 14, 30);

  // Pier: keep the sea floor under the pier gentle.
  return h;
}

// ---------------------------------------------------------------------------
// Baked grid (runtime queries are bilinear lookups: cheap and consistent with the mesh)
// ---------------------------------------------------------------------------
let GRID = null;

export function bakeHeightfield() {
  if (GRID) return GRID;
  GRID = new Float32Array(GRID_N * GRID_N);
  for (let j = 0; j < GRID_N; j++) {
    const z = -WORLD_HALF + j * GRID_STEP;
    for (let i = 0; i < GRID_N; i++) {
      const x = -WORLD_HALF + i * GRID_STEP;
      GRID[j * GRID_N + i] = heightAtExact(x, z);
    }
  }
  return GRID;
}

export function getGrid() {
  return GRID || bakeHeightfield();
}

// Height of the terrain surface at (x, z). Matches the rendered mesh (bilinear over the grid).
export function heightAt(x, z) {
  const g = GRID || bakeHeightfield();
  let fx = (x + WORLD_HALF) / GRID_STEP;
  let fz = (z + WORLD_HALF) / GRID_STEP;
  if (fx < 0 || fz < 0 || fx >= GRID_N - 1 || fz >= GRID_N - 1) return -18;
  const i = fx | 0, j = fz | 0;
  fx -= i; fz -= j;
  const k = j * GRID_N + i;
  const a = g[k], b = g[k + 1], c = g[k + GRID_N], d = g[k + GRID_N + 1];
  // Match the triangle split used by PlaneGeometry (a-c-b / c-d-b).
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

// Unit normal (array [nx, ny, nz]) by central differences.
export function normalAt(x, z, out = [0, 1, 0]) {
  const e = GRID_STEP;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  let nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
  return out;
}

// Slope angle in radians (0 = flat).
export function slopeAt(x, z) {
  const n = normalAt(x, z);
  return Math.acos(clamp(n[1], -1, 1));
}

export function isWater(x, z) {
  return heightAt(x, z) < SEA_LEVEL;
}

export function waterDepth(x, z) {
  return Math.max(0, SEA_LEVEL - heightAt(x, z));
}

// Convenience: put a landmark point on the ground.
export function groundY(p) {
  return heightAt(p.x, p.z);
}
