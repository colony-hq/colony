// Kampung: rumah panggung, warung Bu Ratih, campfire plaza, jemuran, sumur, lamps, fences.
// Owner: setdressing. Houses are built in a local frame facing -z (front = plaza).

import * as THREE from 'three';
import { LANDMARKS, heightAt } from './heightfield.js';
import { surfaceGeo, prismGeo, atlasQuad, orient, latheGeo } from './props-kit.js';
import {
  WARM, WARM_HOT, COL, campfirePit, sittingLog, lampPost, umpak, gentong, bakul, crate, barrel, firewood,
  bench, bambooFence, signpost, netPile, hangingLantern,
} from './props-common.js';

const DECK = 4.8;
const WT = 7.2; // wall top
const V = 1.7; // veranda depth

const STYLES = {
  'rumah-sarni': { thatch: 0xd2a868, gedek: 0xf4e4c4, wood: 0x6b4a32, shutter: 0x3f7a5a, plank: 0x8f6a48, glow: 1.0 },
  'rumah-darto': { thatch: 0x51473c, gedek: 0xd9c49e, wood: 0x5a3e2a, shutter: 0x2f5f8a, plank: 0x7d5d40, glow: 0.85, nets: true },
  'rumah-3': { thatch: 0xc89c5c, gedek: 0xeedcb8, wood: 0x73502f, shutter: 0x9a3a2a, plank: 0x94704c, glow: 1.1 },
  'rumah-4': { thatch: 0x4a4038, gedek: 0xe6d4b0, wood: 0x664530, shutter: 0x5f6f3a, plank: 0x88684a, glow: 0.9, dark: 1 },
  'rumah-5': { thatch: 0xd8b070, gedek: 0xf6e8cc, wood: 0x5e4029, shutter: 0x3a5a7a, plank: 0x8c6646, glow: 1.15, carved: true },
};

export function buildKampung(kit, api, scene) {
  const K = LANDMARKS.kampung;
  const b = kit.builder('kampung');
  const winMat = kit.addMat('glowWin', new THREE.MeshBasicMaterial({ vertexColors: true }));
  api.windowMaterial = winMat;
  const regions = kit.textures.decal.regions;
  api.houses = [];
  api.footprints = api.footprints || [];

  for (const H of K.houses) {
    const st = STYLES[H.id] || STYLES['rumah-3'];
    buildHouse(b, H, st);
    const fw = new THREE.Vector3();
    b.push({ x: H.x, y: 0, z: H.z, yaw: H.yaw });
    const deck = b.world(0, DECK, -H.d / 2 - V / 2);
    const stair = b.world(0, heightAt(H.x, H.z), -H.d / 2 - V - 1.9);
    const ridge = b.world(0, ridgeHeight(H.d) + 0.3, 0);
    b.pop();
    void fw;
    api.houses.push({ id: H.id, deck, stairFoot: stair, ridge });
    api.anchors['house:' + H.id] = deck;
    api.anchors['roof:' + H.id] = ridge;
    api.footprints.push({ x: H.x, z: H.z, r: Math.hypot(H.w, H.d + V) / 2 + 2.2 });
  }

  buildWarung(b, K.warung, regions, api);
  api.footprints.push({ x: K.warung.x, z: K.warung.z, r: 5.5 });

  // --- Campfire plaza.
  const C = K.campfire;
  const gyC = heightAt(C.x, C.z);
  b.within({ x: C.x, y: gyC, z: C.z }, () => campfirePit(b, { big: true }));
  const fireObj = new THREE.Group();
  fireObj.name = 'campfire:kampung';
  fireObj.position.set(C.x, gyC + 0.05, C.z);
  scene.add(fireObj);
  api.campfires.kampung = { object: fireObj, position: fireObj.position.clone() };
  api.anchors['campfire:kampung'] = fireObj.position.clone();
  // Sarni's log sits just behind her spot, tangent to the fire ring.
  const S = LANDMARKS.npcs.sarni;
  {
    const dx = S.x - C.x, dz = S.z - C.z, L = Math.hypot(dx, dz);
    const ux = dx / L, uz = dz / L;
    const lx = S.x + ux * 0.32, lz = S.z + uz * 0.32;
    b.within({ x: 0, y: heightAt(lx, lz), z: 0 }, () => sittingLog(b, lx, lz, yawTangent(ux, uz), 1.9));
    api.anchors['seat:sarni'] = new THREE.Vector3(lx, heightAt(lx, lz) + 0.42, lz);
  }
  for (const [ang, len] of [[0.25, 1.7], [1.75, 2.0], [-1.2, 1.6]]) {
    const r = 4.3;
    const lx = C.x + Math.cos(ang) * r, lz = C.z + Math.sin(ang) * r;
    b.within({ x: 0, y: heightAt(lx, lz), z: 0 }, () => sittingLog(b, lx, lz, yawTangent(Math.cos(ang), Math.sin(ang)), len));
  }
  // Firewood pile by the fire.
  b.within({ x: C.x + 2.6, y: gyC, z: C.z - 3.6, yaw: 0.6 }, () => firewood(b, { len: 1.2, rows: 3 }));
  gentong(b, C.x - 2.2, gyC, C.z - 4.6, 1.1);

  // --- Lamp posts around the plaza and along the pier path.
  const lamps = [[6.5, 151, 2.4], [-6.5, 165.5, -0.7], [8, 165, 0.6], [-7.5, 150, -2.4], [2.4, 172, 0], [-2.4, 186, Math.PI], [2.4, 194, 0], [-10, 160.5, -1.6], [11, 156, 1.2]];
  for (const [x, z, yaw] of lamps) b.within({ x, y: heightAt(x, z), z }, () => lampPost(b, { h: 2.7, armYaw: yaw, bamboo: true }));

  // --- Jemuran (clotheslines) with batik.
  jemuran(b, -12.5, 175.5, -16.8, 178.6);
  jemuran(b, 20.5, 146.5, 24.5, 149.5);

  // --- Sumur (well) with a pulley frame.
  sumur(b, -19, 176);
  api.footprints.push({ x: -19, z: 176, r: 2 });

  // --- Fish drying racks near the pier path.
  dryingRack(b, 7.5, 189.5, 0.2);
  dryingRack(b, -7.5, 191, -0.15);

  // --- Fences behind the houses (back yards) + banana/garden spots kept free by footprints.
  for (const H of K.houses) {
    b.push({ x: H.x, y: 0, z: H.z, yaw: H.yaw });
    const gy = (lx, lz) => { const p = b.world(lx, 0, lz); return heightAt(p.x, p.z); };
    const zb = H.d / 2 + 3.2;
    bambooFence(b, -H.w / 2 - 1.2, zb, H.w / 2 + 1.2, zb, gy, { h: 0.9 });
    bambooFence(b, -H.w / 2 - 1.2, zb, -H.w / 2 - 1.2, H.d / 2 - 0.5, gy, { h: 0.9 });
    b.pop();
  }

  // --- Lumbung (rice barn) on the west edge: tall horseshoe thatch roof on four posts.
  lumbung(b, -27, 178, 0.9);
  api.footprints.push({ x: -27, z: 178, r: 3 });

  // --- Bale-bale (bamboo daybed) on the plaza edge.
  baleBale(b, 9.5, 168.5, 0.5);
  baleBale(b, -9.5, 147, 2.3);

  // --- Signpost at the plaza (paths leave north, east, west, south).
  signpost(b, -4.2, heightAt(-4.2, 171.5), 171.5, [
    { word: 'Mercusuar', to: [40, 150] },
    { word: 'Candi', to: [8, 110] },
    { word: 'Pantai Barat', to: [-40, 170] },
    { word: 'Telaga', to: [-60, 168], len: 0.95 },
  ], regions);

  // Scatter of everyday props.
  const props = [[-9.5, 136.5], [21, 131.5], [-30, 157], [31.5, 165], [6, 119]];
  for (const [x, z] of props) {
    const y = heightAt(x, z);
    gentong(b, x, y, z, 0.9 + b.rand() * 0.3);
    bakul(b, x + 0.7, y, z + 0.3, 0.9);
  }

  const group = b.build(scene);
  return group;
}

// Yaw for a log whose axis is tangent to the circle at radial direction (ux, uz).
function yawTangent(ux, uz) {
  // Log axis = local +x -> world (cos yaw, -sin yaw). Tangent = (-uz, ux).
  return Math.atan2(-ux, -uz);
}

function ridgeHeight(d) { return 7.5 + (d / 2) * 1.2; }

// ---------------------------------------------------------------------------------------------
// Rumah panggung
// ---------------------------------------------------------------------------------------------
function buildHouse(b, H, st) {
  const { w, d } = H;
  b.push({ x: H.x, y: 0, z: H.z, yaw: H.yaw });
  const gyL = (lx, lz) => { const p = b.world(lx, 0, lz); return heightAt(p.x, p.z); };
  const zF = -d / 2, zB = d / 2, zV = -d / 2 - V;
  const px0 = -w / 2 - 0.12, px1 = w / 2 + 0.12, pz0 = zV, pz1 = zB + 0.12;
  const wood = st.wood;

  // Stilts on umpak footings.
  const cols = w >= 7 ? 4 : 3;
  const xs = [];
  for (let i = 0; i < cols; i++) xs.push(-w / 2 + 0.15 + (i * (w - 0.3)) / (cols - 1));
  const zs = [zV + 0.15, zF, (zF + zB) / 2, zB - 0.05];
  for (const z of zs) for (const x of xs) {
    const gy = gyL(x, z);
    umpak(b, x, z, gy);
    b.cyl('wood', { x, y0: gy + 0.2, z, r: 0.11, rt: 0.1, h: DECK - 0.44 - gy - 0.2, seg: 8, color: wood, jitter: 0.1, ao: [gy, gy + 0.8, 0.55] });
  }
  // Diagonal bracing along the outer rows.
  for (const z of [zs[0], zs[3]]) for (let i = 0; i < cols - 1; i += 2) {
    const gy = gyL(xs[i], z);
    b.bar('wood', [xs[i], gy + 0.5, z], [xs[i + 1], DECK - 0.5, z], 0.07, 0.1, { color: wood });
  }
  // Beams (along x) and joists (along z).
  for (const z of zs) b.box('wood', { x: 0, y0: DECK - 0.44, z, w: px1 - px0, h: 0.2, d: 0.16, grain: 'x', color: wood });
  for (const x of xs) b.box('wood', { x, y0: DECK - 0.24, z: (pz0 + pz1) / 2, w: 0.14, h: 0.18, d: pz1 - pz0, grain: 'z', color: wood });
  // Deck planks.
  const n = Math.round((pz1 - pz0) / 0.21);
  for (let i = 0; i < n; i++) {
    const z = pz0 + ((i + 0.5) * (pz1 - pz0)) / n;
    b.box('wood', { x: b.r(-0.03, 0.03), y0: DECK - 0.06, z, w: px1 - px0 + b.r(0, 0.12), h: 0.06, d: (pz1 - pz0) / n - 0.018, grain: 'x', color: st.plank, jitter: 0.13 });
  }
  // Colliders: deck slab, body.
  b.collBox({ x: 0, y: DECK - 0.45, z: (pz0 + pz1) / 2, w: px1 - px0, h: 0.45, d: pz1 - pz0, surface: 'wood', tag: 'house' });
  b.collBox({ x: 0, y: DECK, z: 0, w: w + 0.1, h: WT - DECK + 0.4, d: d + 0.1, surface: 'wood', walkable: false, tag: 'house' });

  // Wall frame: corner and door posts, sill and top plate.
  for (const [x, z] of [[-w / 2, zF], [w / 2, zF], [-w / 2, zB], [w / 2, zB], [-w / 2, 0], [w / 2, 0], [-0.62, zF], [0.62, zF]]) {
    b.box('wood', { x, y0: DECK, z, w: 0.14, h: WT - DECK + 0.12, d: 0.14, color: wood });
  }
  for (const z of [zF, zB]) {
    b.box('wood', { x: 0, y0: DECK, z, w: w + 0.14, h: 0.12, d: 0.16, grain: 'x', color: wood });
    b.box('wood', { x: 0, y0: WT, z, w: w + 0.5, h: 0.16, d: 0.18, grain: 'x', color: wood });
  }
  for (const x of [-w / 2, w / 2]) {
    b.box('wood', { x, y0: DECK, z: 0, w: 0.16, h: 0.12, d: d + 0.14, grain: 'z', color: wood });
    b.box('wood', { x, y0: WT, z: 0, w: 0.18, h: 0.16, d: d + 0.5, grain: 'z', color: wood });
  }
  const glowK = st.glow;
  const win = (c, wid = 0.82) => ({ c, w: wid, y0: DECK + 0.95, y1: DECK + 1.75, type: 'window' });
  const door = { c: 0, w: 0.98, y0: DECK + 0.12, y1: DECK + 2.02, type: 'door' };
  // Front wall (local frame: outward = +z).
  b.within({ x: 0, y: 0, z: zF, yaw: Math.PI }, () => wall(b, w, [win(-(w / 2 - 1.2)), door, win(w / 2 - 1.2)], st, glowK, H.id));
  b.within({ x: 0, y: 0, z: zB, yaw: 0 }, () => wall(b, w, [win(-w / 4, 0.7)], st, glowK * (st.dark ? 0 : 0.8), H.id + 'b'));
  b.within({ x: w / 2, y: 0, z: 0, yaw: Math.PI / 2 }, () => wall(b, d, [win(0.2)], st, glowK, H.id + 'r'));
  b.within({ x: -w / 2, y: 0, z: 0, yaw: -Math.PI / 2 }, () => wall(b, d, [win(-0.2)], st, glowK * 0.9, H.id + 'l'));

  // Veranda posts (support the front roof) and railings.
  const railY = DECK + 0.9;
  const vx = w / 2 - 0.08, vz = zV + 0.08;
  for (const sx of [-1, 1]) {
    b.box('wood', { x: sx * vx, y0: DECK, z: vz, w: 0.13, h: 2.0, d: 0.13, color: wood });
    b.box('wood', { x: sx * 0.62, y0: DECK, z: vz, w: 0.1, h: railY - DECK + 0.08, d: 0.1, color: wood });
  }
  b.box('wood', { x: 0, y0: DECK + 1.95, z: vz, w: w + 0.3, h: 0.14, d: 0.15, grain: 'x', color: wood });
  const railSeg = (x0, z0, x1, z1) => {
    b.bar('wood', [x0, railY, z0], [x1, railY, z1], 0.07, 0.08, { color: wood });
    b.bar('wood', [x0, DECK + 0.14, z0], [x1, DECK + 0.14, z1], 0.05, 0.06, { color: wood });
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = Math.max(2, Math.round(len / 0.14));
    for (let i = 1; i < m; i++) {
      const t = i / m;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      b.cyl('bamboo', { x, y0: DECK + 0.14, z, r: 0.018, h: railY - DECK - 0.14, seg: 4, open: true, color: 0xd6c08a, jitter: 0.12 });
    }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.collBox({ x: cx, y: DECK, z: cz, w: len, h: 1.0, d: 0.12, yaw: Math.atan2(-(z1 - z0), x1 - x0), surface: 'wood', walkable: false, tag: 'rail' });
  };
  railSeg(-vx, vz, -0.62, vz);
  railSeg(0.62, vz, vx, vz);
  railSeg(-vx, vz, -vx, zF);
  railSeg(vx, vz, vx, zF);

  // Front stairs: 5 risers from the ground up to the veranda (each <= 0.45 m).
  {
    const gy = gyL(0, zV - 0.8);
    const rise = DECK - gy;
    const nSteps = Math.ceil(rise / 0.4 - 1e-6);
    const run = 0.32 * nSteps;
    const z0 = zV - run;
    const r = rise / nSteps;
    for (let i = 0; i < nSteps - 1; i++) {
      const zc = z0 + 0.32 * (i + 0.5);
      b.box('wood', { x: 0, y0: gy + r * (i + 1) - 0.05, z: zc, w: 1.08, h: 0.05, d: 0.3, grain: 'x', color: st.plank, jitter: 0.1 });
    }
    for (const sx of [-1, 1]) {
      b.bar('wood', [sx * 0.58, gy, z0 - 0.08], [sx * 0.58, DECK - 0.05, zV + 0.02], 0.06, 0.2, { color: wood });
      b.cyl('wood', { x: sx * 0.62, y0: gy, z: z0 - 0.05, r: 0.05, h: 1.0, seg: 6, color: wood });
      b.bar('wood', [sx * 0.62, gy + 0.95, z0 - 0.05], [sx * 0.62, railY, zV + 0.08], 0.05, 0.06, { color: wood });
    }
    b.collStairs({ x: 0, z0, y0: gy, y1: DECK, run, w: 1.1, dir: 1, surface: 'wood', base: gy - 0.3 });
  }

  // Roof.
  roof(b, w, d, st);

  // Life under the house.
  const r = b.rand();
  b.within({ x: -w / 2 + 1.0, y: gyL(-w / 2 + 1, zB - 1), z: zB - 1.0, yaw: 0.1 }, () => firewood(b, { len: 1.4, rows: 3 }));
  gentong(b, w / 2 - 0.8, gyL(w / 2 - 0.8, zB - 0.6), zB - 0.6, 1.0);
  if (r > 0.4) crate(b, w / 2 - 1.4, gyL(w / 2 - 1.4, 0.5), 0.5, 0.55, 0.4);
  // Chicken coop (kurungan) dome.
  b.add('gedek', latheGeo([[0.0, 0.55], [0.25, 0.52], [0.42, 0.38], [0.48, 0.15], [0.48, 0.0]].reverse().map(([rr, y]) => [rr, y]), 10),
    { x: 0.6, y: gyL(0.6, zB - 1.2), z: zB - 1.2 }, { color: 0xb69a64 });
  // Hanging lantern on the veranda.
  b.within({ x: w / 2 - 0.5, y: DECK + 1.95, z: vz + 0.25 }, () => hangingLantern(b, { scale: 1 }));
  if (st.nets) {
    // Fishing nets draped over the railing + floats.
    for (const sx of [-1, 1]) b.add('rope', surfaceGeo(6, 4, (u, v) => [sx * (0.9 + u * (vx - 1.0)), railY + 0.04 - v * 0.75 - Math.sin(u * Math.PI) * 0.1, vz - 0.07 - v * 0.08]), {}, { color: 0x4d5f50, jitter: 0.1 });
  }
  b.pop();
}

// Wall in local frame: along x in [-len/2, len/2] at z = 0, outward +z, deck to wall top.
function wall(b, len, openings, st, glowK, seed) {
  const ya = DECK + 0.12, yb = WT;
  const T = 0.05;
  const panel = (x0, x1, y0, y1) => {
    if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
    b.box('gedek', { x: (x0 + x1) / 2, y0, z: 0, w: x1 - x0, h: y1 - y0, d: T, color: st.gedek, jitter: 0.06 });
  };
  const ops = openings.slice().sort((p, q) => p.c - q.c);
  let x = -len / 2 + 0.07;
  for (const op of ops) {
    const l = op.c - op.w / 2, r = op.c + op.w / 2;
    panel(x, l, ya, yb);
    panel(l, r, ya, op.y0);
    panel(l, r, op.y1, yb);
    x = r;
  }
  panel(x, len / 2 - 0.07, ya, yb);
  // Horizontal bamboo battens holding the gedek.
  for (const yy of [DECK + 0.9, DECK + 1.85]) b.cyl('bamboo', { x: 0, y: yy, z: T / 2 + 0.03, r: 0.03, h: len - 0.2, seg: 5, roll: Math.PI / 2, color: 0xc9b07a });
  for (const op of ops) (op.type === 'door' ? door : windowOpening)(b, op, st, glowK);
}

function glowColor(k, v = 1) { return [WARM[0] * k * v, WARM[1] * k * v, WARM[2] * k * v]; }

function windowOpening(b, op, st, glowK) {
  const { c, w } = op;
  const h = op.y1 - op.y0, yc = (op.y0 + op.y1) / 2;
  if (glowK > 0) {
    b.add('glowWin', new THREE.PlaneGeometry(w, h), { x: c, y: yc, z: -0.14 }, {
      color: glowColor(glowK), jitter: 0.15,
      vc: (x, y, z, nx, ny, nz, col) => col.multiplyScalar(0.75 + 0.25 * ((y - op.y0) / h)),
    });
  } else {
    b.add('wood', new THREE.PlaneGeometry(w, h), { x: c, y: yc, z: -0.14 }, { color: 0x14100c });
  }
  // Frame + sill + drip board.
  b.box('wood', { x: c, y: op.y1 + 0.04, z: 0.03, w: w + 0.16, h: 0.08, d: 0.1, grain: 'x', color: st.wood });
  b.box('wood', { x: c, y: op.y0 - 0.04, z: 0.06, w: w + 0.24, h: 0.08, d: 0.16, grain: 'x', color: st.wood });
  for (const s of [-1, 1]) b.box('wood', { x: c + s * (w / 2 + 0.04), y: yc, z: 0.03, w: 0.08, h: h, d: 0.1, color: st.wood });
  b.box('wood', { x: c, y: op.y1 + 0.17, z: 0.14, w: w + 0.4, h: 0.04, d: 0.32, pitch: -0.35, grain: 'x', color: st.wood });
  // Vertical bars (jeruji).
  for (let i = 1; i <= 3; i++) b.cyl('wood', { x: c - w / 2 + (i * w) / 4, y: yc, z: 0, r: 0.018, h: h, seg: 5, color: st.wood });
  // Shutters swung open flat-ish against the wall.
  for (const s of [-1, 1]) {
    const hx = c + s * (w / 2 + 0.07);
    const dx = s * 0.94, dz = 0.34; // opened ~160 degrees, resting near the wall
    const lw = w / 2;
    const cx = hx + dx * (lw / 2), cz = 0.06 + dz * (lw / 2);
    const yaw = Math.atan2(-dz, dx);
    b.box('wood', { x: cx, y: yc, z: cz, w: lw, h: h + 0.04, d: 0.035, yaw, color: st.shutter, jitter: 0.08 });
    b.box('wood', { x: cx, y: yc, z: cz + 0.02, w: lw * 0.75, h: 0.05, d: 0.04, yaw, color: st.wood });
  }
}

function door(b, op, st, glowK) {
  const { c, w } = op;
  const h = op.y1 - op.y0;
  // Alcove: glowing interior set back, dark reveals.
  b.add('glowWin', new THREE.PlaneGeometry(w + 0.1, h + 0.05), { x: c, y: op.y0 + h / 2, z: -0.6 }, {
    color: glowColor(glowK, 0.8), jitter: 0.1,
    vc: (x, y, z, nx, ny, nz, col) => col.multiplyScalar(0.55 + 0.45 * ((y - op.y0) / h)),
  });
  for (const s of [-1, 1]) b.box('wood', { x: c + s * (w / 2 + 0.03), y0: op.y0, z: -0.3, w: 0.04, h, d: 0.6, color: 0x2a1d14 });
  b.box('wood', { x: c, y0: op.y1, z: -0.3, w: w + 0.1, h: 0.04, d: 0.6, color: 0x2a1d14 });
  // Frame.
  b.box('wood', { x: c, y0: op.y1, z: 0.04, w: w + 0.3, h: 0.14, d: 0.12, grain: 'x', color: st.wood });
  for (const s of [-1, 1]) b.box('wood', { x: c + s * (w / 2 + 0.06), y0: op.y0 - 0.12, z: 0.04, w: 0.12, h: h + 0.12, d: 0.12, color: st.wood });
  b.box('wood', { x: c, y0: op.y0 - 0.12, z: 0.06, w: w + 0.3, h: 0.1, d: 0.2, grain: 'x', color: st.wood }); // threshold
  // Leaf ajar inward (hinge left).
  const hx = c - w / 2, lw = w - 0.04;
  const dx = Math.cos(0.45), dz = -Math.sin(0.45); // ajar, swung inward
  b.box('wood', { x: hx + dx * lw / 2, y0: op.y0, z: -0.02 + dz * lw / 2, w: lw, h: h - 0.02, d: 0.045, yaw: Math.atan2(-dz, dx), color: st.shutter, jitter: 0.06 });
  // Vent lattice above the door with light behind it.
  const vy = op.y1 + 0.32;
  b.add('glowWin', new THREE.PlaneGeometry(1.3, 0.34), { x: c, y: vy, z: -0.1 }, { color: glowColor(glowK, 0.7) });
  for (let i = -3; i <= 3; i++) {
    b.bar('wood', [c + i * 0.18 - 0.17, vy - 0.17, 0.0], [c + i * 0.18 + 0.17, vy + 0.17, 0.0], 0.025, 0.025, { color: st.wood });
    b.bar('wood', [c + i * 0.18 + 0.17, vy - 0.17, 0.0], [c + i * 0.18 - 0.17, vy + 0.17, 0.0], 0.025, 0.025, { color: st.wood });
  }
  b.box('wood', { x: c, y: vy - 0.2, z: 0.02, w: 1.4, h: 0.05, d: 0.08, color: st.wood });
  b.box('wood', { x: c, y: vy + 0.2, z: 0.02, w: 1.4, h: 0.05, d: 0.08, color: st.wood });
}

// Steep bell-cast thatch roof with an upswept ridge (saddle) and crossed horn finials.
function roof(b, w, d, st) {
  const Yw = 7.5, T1 = 1.2, T2 = 0.36, sweep = 1.05, thick = 0.24;
  const prof = (q) => (q < d / 2 ? Yw + (d / 2 - q) * T1 : Yw - (q - d / 2) * T2);
  const Lr = w / 2 + 0.85;
  const yR = prof(0);
  const surf = (s, qE, u, t, off) => {
    const q = qE * (1 - t);
    const ext = Lr + 0.4 * t;
    const a = u * 2 - 1;
    const y = prof(q) + sweep * Math.pow(Math.abs(a), 2.4) * (0.4 + 0.6 * t) - off;
    return [a * ext, y, s * q];
  };
  const under = new THREE.Color(st.thatch).multiplyScalar(0.55);
  for (const s of [-1, 1]) {
    const qE = s < 0 ? d / 2 + V + 0.45 : d / 2 + 0.75;
    const top = orient(surfaceGeo(18, 12, (u, v) => surf(s, qE, u, v, 0)), [0, 1, s * 0.3]);
    b.add('thatch', top, {}, { color: st.thatch, jitter: 0.04 });
    const bot = orient(surfaceGeo(10, 8, (u, v) => surf(s, qE, u, v, thick)), [0, -1, 0]);
    b.add('thatch', bot, {}, { color: under.getHex(), jitter: 0.04 });
    const eave = orient(surfaceGeo(18, 1, (u, v) => { const p = surf(s, qE, u, 0, 0), q = surf(s, qE, u, 0, thick); return [p[0], p[1] + (q[1] - p[1]) * v, p[2]]; }), [0, 0, s]);
    b.add('thatch', eave, {}, { color: under.getHex(), jitter: 0.04 });
    for (const e of [0, 1]) {
      const verge = orient(surfaceGeo(1, 12, (u, v) => { const p = surf(s, qE, e, v, 0), q = surf(s, qE, e, v, thick); return [p[0], p[1] + (q[1] - p[1]) * u, p[2]]; }), [e ? 1 : -1, 0, 0]);
      b.add('thatch', verge, {}, { color: under.getHex(), jitter: 0.04 });
      // Barge board along the verge.
      const pts = [];
      for (let i = 0; i <= 8; i++) { const p = surf(s, qE, e, i / 8, thick * 0.5); pts.push(p); }
      for (let i = 0; i < 8; i++) b.bar('wood', [pts[i][0] + (e ? 0.03 : -0.03), pts[i][1], pts[i][2]], [pts[i + 1][0] + (e ? 0.03 : -0.03), pts[i + 1][1], pts[i + 1][2]], 0.05, 0.22, { color: st.wood, up: [0, 1, 0] });
    }
    // Rafters visible under the veranda part.
    if (s < 0) {
      for (let x = -w / 2 + 0.3; x <= w / 2 - 0.3; x += 0.8) {
        const a = surf(s, qE, (x / (Lr + 0.4 * 0.4)) * 0.5 + 0.5, 1 - (d / 2) / qE, thick + 0.04);
        const e2 = surf(s, qE, (x / Lr) * 0.5 + 0.5, 0.02, thick + 0.04);
        b.bar('wood', [x, a[1], a[2]], [x, e2[1], e2[2]], 0.06, 0.08, { color: st.wood });
      }
    }
  }
  // Gable walls (vertical boards) up to the roof underside.
  for (const sx of [-1, 1]) {
    const pts = [[-d / 2, WT + 0.1]];
    for (let i = 0; i <= 12; i++) {
      const z = -d / 2 + (i / 12) * d;
      const s = z < 0 ? -1 : 1;
      const qE = s < 0 ? d / 2 + V + 0.45 : d / 2 + 0.75;
      const q = Math.abs(z);
      const t = 1 - q / qE;
      const ext = Lr + 0.4 * t;
      const yy = prof(q) + sweep * Math.pow((w / 2) / ext, 2.4) * (0.4 + 0.6 * t) - thick - 0.02;
      pts.push([z, yy]);
    }
    pts.push([d / 2, WT + 0.1]);
    const g = prismGeo(pts, 0.05);
    b.add('wood', g, { x: sx * (w / 2 + 0.02), yaw: -Math.PI / 2 }, { color: new THREE.Color(st.wood).multiplyScalar(1.15).getHex(), jitter: 0.06 });
    // Sunburst slats on the gable.
    for (let k = -3; k <= 3; k++) {
      const a = (k / 3) * 0.9;
      b.bar('wood', [sx * (w / 2 + 0.06), WT + 0.35, 0], [sx * (w / 2 + 0.06), WT + 0.35 + Math.cos(a) * 1.9, Math.sin(a) * 1.9], 0.04, 0.05, { color: 0x3a281a });
    }
  }
  // Ridge roll + crossed horns at both ends.
  const ridge = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * 2 - 1;
    ridge.push(new THREE.Vector3(a * (Lr + 0.4), yR + sweep * Math.pow(Math.abs(a), 2.4) + 0.06, 0));
  }
  b.add('thatch', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridge), 24, 0.17, 6, false), {}, { color: new THREE.Color(st.thatch).multiplyScalar(0.6).getHex() });
  for (const sx of [-1, 1]) {
    const xe = sx * (Lr + 0.38), ye = yR + sweep + 0.02;
    for (const sz of [-1, 1]) {
      const pts = [new THREE.Vector3(xe - sx * 0.1, ye - 0.35, sz * 0.4), new THREE.Vector3(xe, ye + 0.15, 0), new THREE.Vector3(xe + sx * 0.25, ye + 0.65, -sz * 0.32), new THREE.Vector3(xe + sx * 0.5, ye + 1.0, -sz * 0.5)];
      b.add('wood', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.055, 5, false), {}, { color: 0x3a2818 });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Warung Bu Ratih (Ratih stands at the local origin, behind the counter; open front = -z).
// ---------------------------------------------------------------------------------------------
function buildWarung(b, Wp, regions, api) {
  const gy0 = heightAt(Wp.x, Wp.z);
  b.push({ x: Wp.x, y: gy0, z: Wp.z, yaw: Wp.yaw });
  const W = 5.4, back = 1.8, front = -1.25;
  const hF = 2.55, hB = 3.25; // eave heights (lean-to roof sloping to the front)
  // Floor slab (packed earth + cement) flush with the ground.
  b.box('plaster', { x: 0, y0: -0.25, z: (back + front) / 2 - 0.2, w: W + 0.2, h: 0.28, d: back - front + 0.8, color: 0x9a9184, jitter: 0.05 });
  // Posts.
  const posts = [[-W / 2, front - 0.9], [W / 2, front - 0.9], [-W / 2, back], [W / 2, back], [0, back]];
  for (const [x, z] of posts) {
    const h = z > 0 ? hB : hF;
    b.box('wood', { x, y0: -0.05, z, w: 0.14, h: h + 0.05, d: 0.14, color: 0x5a3e2a });
    b.collCyl({ x, y: 0, z, r: 0.12, h, surface: 'wood', walkable: false });
  }
  // Back wall (gedek) with shelves, side half-walls.
  b.box('gedek', { x: 0, y0: 0, z: back + 0.08, w: W, h: hB, d: 0.05, color: 0xead6b0 });
  for (const sx of [-1, 1]) {
    b.box('gedek', { x: sx * W / 2, y0: 0, z: (back + front) / 2, w: 0.05, h: 1.15, d: back - front, color: 0xe2cca4 });
    b.box('wood', { x: sx * W / 2, y0: 1.15, z: (back + front) / 2, w: 0.1, h: 0.06, d: back - front + 0.1, grain: 'z', color: 0x5a3e2a });
  }
  b.collBox({ x: 0, y: 0, z: back + 0.08, w: W, h: hB, d: 0.2, surface: 'wood', walkable: false });
  for (const sx of [-1, 1]) b.collBox({ x: sx * W / 2, y: 0, z: (back + front) / 2, w: 0.15, h: 1.2, d: back - front, surface: 'wood', walkable: false });
  // Shelves with jars and bottles.
  for (const [y, n] of [[1.05, 7], [1.6, 8], [2.15, 6]]) {
    b.box('wood', { x: 0, y0: y, z: back - 0.12, w: W - 0.6, h: 0.04, d: 0.3, grain: 'x', color: 0x7a5636 });
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.6 + (i + 0.5) * ((W - 1.2) / n);
      const kind = b.rand();
      if (kind < 0.45) b.cyl('paint', { x, y0: y + 0.04, z: back - 0.12, r: 0.045, rt: 0.02, h: 0.28, seg: 6, color: [0x3a6a3a, 0x8a3a1a, 0xd8c040, 0x2a3a6a][i % 4], jitter: 0.2 });
      else b.cyl('paint', { x, y0: y + 0.04, z: back - 0.12, r: 0.09, h: 0.2, seg: 8, color: [0xe8e0c8, 0xd06a3a, 0xc8b860][i % 3], jitter: 0.1 });
    }
  }
  // Poster + menu board on the back wall.
  b.add('decal', atlasQuad(0.6, 0.6, regions.poster), { x: -1.6, y: 2.75, z: back + 0.02, yaw: Math.PI }, { color: 0xffffff, jitter: 0 });
  b.add('decal', atlasQuad(1.1, 0.68, regions.menu), { x: 1.4, y: 2.72, z: back + 0.02, yaw: Math.PI }, { color: 0xffffff, jitter: 0 });
  // Counter in front of Ratih.
  const cz = -0.95;
  b.box('wood', { x: 0, y0: 0, z: cz, w: 3.8, h: 0.95, d: 0.5, grain: 'x', color: 0x6a4a30 });
  for (let i = 0; i < 9; i++) b.box('wood', { x: -1.8 + i * 0.45, y0: 0.05, z: cz - 0.26, w: 0.4, h: 0.85, d: 0.03, color: [0x2f6f5a, 0xe2cfa6][i % 2], jitter: 0.08 });
  b.box('wood', { x: 0, y0: 0.95, z: cz, w: 4.1, h: 0.06, d: 0.66, grain: 'x', color: 0x8a6444 });
  b.collBox({ x: 0, y: 0, z: cz, w: 4.1, h: 1.0, d: 0.66, surface: 'wood' });
  // Goods on the counter: toples jars with red lids, kettle, thermos, plates of gorengan.
  for (let i = 0; i < 4; i++) {
    const x = -1.6 + i * 0.42;
    b.cyl('paint', { x, y0: 1.01, z: cz - 0.05, r: 0.13, h: 0.32, seg: 10, color: 0xd8e2e0, jitter: 0.05 });
    b.cyl('paint', { x, y0: 1.33, z: cz - 0.05, r: 0.135, h: 0.06, seg: 10, color: 0xb0302a });
    b.cyl('paint', { x, y0: 1.05, z: cz - 0.05, r: 0.11, h: 0.22, seg: 8, color: [0xe8c060, 0xd89a50, 0xf0e0b0, 0xc87040][i], jitter: 0.1 });
  }
  b.add('metal', latheGeo([[0.0, 0], [0.13, 0], [0.16, 0.08], [0.15, 0.18], [0.09, 0.24], [0.04, 0.27], [0.0, 0.29]], 10), { x: 0.55, y: 1.01, z: cz }, { color: 0x6a6e70 });
  b.rod('metal', [0.68, 1.12, cz], [0.82, 1.24, cz], 0.02, { color: 0x6a6e70 });
  b.cyl('paint', { x: 0.95, y0: 1.01, z: cz + 0.05, r: 0.08, h: 0.36, seg: 8, color: 0xc0342a });
  b.cyl('paint', { x: 1.45, y0: 1.01, z: cz - 0.03, r: 0.2, h: 0.03, seg: 12, color: 0xece6d8 });
  for (let i = 0; i < 6; i++) b.add('paint', new THREE.SphereGeometry(0.05, 5, 4), { x: 1.45 + Math.cos(i) * 0.1, y: 1.07, z: cz - 0.03 + Math.sin(i) * 0.1, sy: 0.6 }, { color: 0xb87a2a, jitter: 0.15 });
  // Kerupuk tins on the floor beside the counter.
  for (const [x, z] of [[-2.25, -0.4], [-2.25, 0.1]]) {
    b.box('paint', { x, y0: 0, z, w: 0.36, h: 0.5, d: 0.36, color: 0xdcc030 });
    b.add('decal', atlasQuad(0.34, 0.44, regions.kerupuk), { x, y: 0.26, z: z - 0.185, yaw: Math.PI }, { color: 0xffffff, jitter: 0 });
  }
  // Roof: lean-to genteng roof on a front beam; sign board on the front edge.
  b.box('wood', { x: 0, y0: hF - 0.15, z: front - 0.9, w: W + 0.4, h: 0.16, d: 0.16, grain: 'x', color: 0x5a3e2a });
  b.box('wood', { x: 0, y0: hB - 0.15, z: back, w: W + 0.4, h: 0.16, d: 0.16, grain: 'x', color: 0x5a3e2a });
  const zr0 = front - 1.6, zr1 = back + 0.55;
  const yAt = (z) => hF + ((z - (front - 0.9)) / (back - (front - 0.9))) * (hB - hF) + 0.02;
  const roofG = orient(surfaceGeo(6, 6, (u, v) => [(u - 0.5) * (W + 1.0), yAt(zr0 + (zr1 - zr0) * v) + 0.05, zr0 + (zr1 - zr0) * v]), [0, 1, 0]);
  b.add('rooftile', roofG, {}, { color: 0xffffff, jitter: 0.05 });
  const roofU = orient(surfaceGeo(2, 2, (u, v) => [(u - 0.5) * (W + 1.0), yAt(zr0 + (zr1 - zr0) * v) - 0.02, zr0 + (zr1 - zr0) * v]), [0, -1, 0]);
  b.add('wood', roofU, {}, { color: 0x6a4a30 });
  for (let x = -W / 2; x <= W / 2 + 0.01; x += W / 6) b.bar('wood', [x, yAt(zr0) - 0.06, zr0], [x, yAt(zr1) - 0.06, zr1], 0.05, 0.07, { color: 0x5a3e2a });
  // Sign board.
  b.box('wood', { x: 0, y: hF + 0.42, z: front - 1.55, w: 3.4, h: 0.72, d: 0.06, pitch: -0.08, grain: 'x', color: 0x2a4a3c });
  b.add('decal', atlasQuad(3.3, 0.64, regions.warung), { x: 0, y: hF + 0.42, z: front - 1.59, yaw: Math.PI, pitch: 0.08 }, { color: 0xffffff, jitter: 0 });
  for (const sx of [-1, 1]) b.rod('wood', [sx * 1.4, hF + 0.05, front - 1.5], [sx * 1.4, hF + 0.1, front - 0.95], 0.03, { color: 0x3a2818 });
  // Hanging goods from the front beam: sachet strips, bananas, a petromaks lamp.
  for (let i = 0; i < 5; i++) {
    const x = -2.1 + i * 0.45;
    b.add('decal', atlasQuad(0.2, 0.9, { u0: regions.sachet.u0 + (i % 4) * (regions.sachet.u1 - regions.sachet.u0) / 8, u1: regions.sachet.u0 + ((i % 4) + 1) * (regions.sachet.u1 - regions.sachet.u0) / 8, v0: regions.sachet.v0, v1: regions.sachet.v1 }),
      { x, y: hF - 0.62, z: front - 0.98, yaw: Math.PI + b.r(-0.2, 0.2) }, { color: 0xffffff, jitter: 0 });
  }
  // Banana bunch.
  b.rod('rope', [1.2, hF - 0.15, front - 0.9], [1.2, hF - 0.55, front - 0.9], 0.012, { color: COL.rope });
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 * 2.2, y = hF - 0.6 - (k / 14) * 0.45;
    b.add('paint', new THREE.CapsuleGeometry(0.035, 0.16, 2, 5), { x: 1.2 + Math.cos(a) * 0.12, y, z: front - 0.9 + Math.sin(a) * 0.12, roll: Math.cos(a) * 0.8, pitch: Math.sin(a) * 0.8 }, { color: k % 3 ? 0xd8c040 : 0x9ab040, jitter: 0.1 });
  }
  b.within({ x: -0.3, y: hF - 0.15, z: front - 0.9 }, () => hangingLantern(b, { scale: 1.35, glow: WARM_HOT }));
  // Benches for customers + a low table.
  b.within({ x: 0, y: 0, z: -2.05 }, () => bench(b, 3.0));
  b.collBox({ x: 0, y: 0, z: -2.05, w: 3.0, h: 0.45, d: 0.34, surface: 'wood' });
  b.within({ x: -3.3, y: 0, z: -2.3, yaw: Math.PI / 2 }, () => bench(b, 1.8));
  b.collBox({ x: -3.3, y: 0, z: -2.3, w: 0.34, h: 0.45, d: 1.8, surface: 'wood' });
  b.cyl('paint', { x: -3.3, y0: 0.45, z: -1.75, r: 0.04, h: 0.1, seg: 6, color: 0xd88a3a }); // glass of tea on the bench
  // Crates + barrel stacked at the east side.
  crate(b, 3.35, 0, 0.6, 0.8, 0.1);
  crate(b, 3.35, 0.64, 0.6, 0.7, -0.15, 0x9a7a52);
  barrel(b, 3.4, 0, 1.6, 1.0);
  b.collBox({ x: 3.35, y: 0, z: 0.6, w: 0.8, h: 0.64, d: 0.66, surface: 'wood' });
  b.collBox({ x: 3.35, y: 0.64, z: 0.6, w: 0.7, h: 0.56, d: 0.58, surface: 'wood' });
  b.collCyl({ x: 3.4, y: 0, z: 1.6, r: 0.3, h: 0.8, surface: 'wood' });
  // Gerobak (hand cart) parked beside the warung.
  b.within({ x: -3.6, y: 0, z: 0.9, yaw: 0.3 }, () => {
    b.box('wood', { x: 0, y0: 0.5, z: 0, w: 1.0, h: 0.4, d: 1.5, color: 0x3a6a8a });
    b.box('wood', { x: 0, y0: 0.9, z: 0, w: 1.04, h: 0.05, d: 1.54, color: 0xe8e0c8 });
    for (const sx of [-1, 1]) b.add('wood', new THREE.TorusGeometry(0.32, 0.04, 5, 14), { x: sx * 0.55, y: 0.34, z: 0.2, yaw: Math.PI / 2 }, { color: 0x2a2018 });
    for (const sx of [-1, 1]) b.rod('wood', [sx * 0.35, 0.6, -0.75], [sx * 0.35, 0.75, -1.6], 0.03, { color: 0x5a3e2a });
    b.rod('metal', [-0.45, 0.34, 0.2], [0.45, 0.34, 0.2], 0.025, { color: COL.iron });
  });
  b.collBox({ x: -3.6, y: 0, z: 0.9, w: 1.2, h: 0.95, d: 1.6, yaw: 0.3, surface: 'wood' });
  api.anchors['warung:counter'] = b.world(0, 1.0, cz);
  b.pop();
}

// Clothesline between two bamboo poles with hanging batik.
function jemuran(b, x0, z0, x1, z1) {
  const y0 = heightAt(x0, z0), y1 = heightAt(x1, z1);
  const H = 2.15;
  b.cyl('bamboo', { x: x0, y0: y0 - 0.2, z: z0, r: 0.05, h: H + 0.3, seg: 6, color: COL.bamboo });
  b.cyl('bamboo', { x: x1, y0: y1 - 0.2, z: z1, r: 0.05, h: H + 0.3, seg: 6, color: COL.bamboo });
  b.collCyl({ x: x0, y: y0 - 0.2, z: z0, r: 0.08, h: H + 0.3, surface: 'wood', walkable: false });
  b.collCyl({ x: x1, y: y1 - 0.2, z: z1, r: 0.08, h: H + 0.3, surface: 'wood', walkable: false });
  const a = [x0, y0 + H, z0], c = [x1, y1 + H, z1];
  b.rope('rope', a, c, 0.18, 0.012, { color: 0xd8d0c0 });
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  const cells = [[0, 1], [1, 1], [2, 1], [0, 0]];
  const n = Math.floor(len / 1.0);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.6) / (n + 0.2);
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const y = y0 + (y1 - y0) * t + H - 0.18 * 4 * t * (1 - t) - 0.02;
    const [cu, cv] = cells[(i + Math.floor(x0)) & 3];
    const reg = { u0: cu / 3 + 0.01, u1: (cu + 1) / 3 - 0.01, v0: cv / 2 + 0.01, v1: (cv + 1) / 2 - 0.01 };
    const wv = 0.78, hv = 1.05 + b.rand() * 0.25;
    const g = surfaceGeo(4, 6, (u, v) => [(u - 0.5) * wv, -v * hv, Math.sin(u * Math.PI) * 0.05 + v * v * 0.04]);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) { const iu = (k % 5) / 4, iv = Math.floor(k / 5) / 6; uv.setXY(k, reg.u0 + (reg.u1 - reg.u0) * iu, reg.v1 - (reg.v1 - reg.v0) * iv); }
    b.add('cloth', g, { x, y, z, yaw }, { color: 0xffffff, jitter: 0.05, sway: (px, py) => Math.min(1, -py / hv) * 0.9 });
  }
}

function sumur(b, x, z) {
  const y = heightAt(x, z);
  b.within({ x, y, z }, () => {
    b.add('stone', latheGeo([[0.78, -0.1], [0.8, 0.75], [0.72, 0.8], [0.62, 0.75], [0.6, -0.1]], 16), {}, { color: 0xb0aca0, jitter: 0.05 });
    b.cyl('rock', { x: 0, y0: 0.15, z: 0, r: 0.6, h: 0.02, seg: 14, color: 0x101a1c });
    for (const sx of [-1, 1]) b.box('wood', { x: sx * 0.9, y0: -0.1, z: 0, w: 0.12, h: 2.2, d: 0.12, color: COL.woodDark });
    b.bar('wood', [-1.0, 2.05, 0], [1.0, 2.05, 0], 0.12, 0.12, { color: COL.woodDark });
    b.add('wood', new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), { x: 0, y: 1.85, z: 0, roll: Math.PI / 2 }, { color: 0x5a4330 });
    b.rod('rope', [0, 1.7, 0.16], [0, 0.95, 0.16], 0.012, { color: COL.rope });
    b.add('wood', latheGeo([[0.0, 0], [0.11, 0], [0.14, 0.22], [0.13, 0.24]], 8), { x: 0.0, y: 0.72, z: 0.16 }, { color: 0x6a5038 });
    b.collCyl({ x: 0, y: -0.1, z: 0, r: 0.82, h: 0.9, surface: 'stone' });
  });
}

function dryingRack(b, x, z, yaw) {
  const y = heightAt(x, z);
  b.within({ x, y, z, yaw }, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('bamboo', { x: sx * 0.9, y0: -0.2, z: sz * 0.55, r: 0.035, h: 1.15, seg: 5, color: COL.bamboo });
    b.box('gedek', { x: 0, y0: 0.9, z: 0, w: 1.95, h: 0.03, d: 1.2, color: 0xc7a46a });
    for (let i = 0; i < 18; i++) {
      b.add('paint', new THREE.SphereGeometry(0.06, 5, 3), { x: -0.8 + (i % 6) * 0.32, y: 0.94, z: -0.4 + Math.floor(i / 6) * 0.4, sx: 1.8, sy: 0.25, yaw: b.r(-0.4, 0.4) }, { color: 0xb4b2a4, jitter: 0.15 });
    }
    b.collBox({ x: 0, y: 0, z: 0, w: 2.0, h: 0.95, d: 1.25, surface: 'wood' });
  });
}

function lumbung(b, x, z, yaw) {
  const y = heightAt(x, z);
  b.within({ x, y, z, yaw }, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.cyl('wood', { x: sx * 0.9, y0: -0.1, z: sz * 0.9, r: 0.1, h: 2.0, seg: 7, color: COL.woodDark });
      b.add('wood', new THREE.CylinderGeometry(0.32, 0.32, 0.06, 12), { x: sx * 0.9, y: 1.75, z: sz * 0.9 }, { color: 0x6a5038 }); // rat guard discs
    }
    b.box('wood', { x: 0, y0: 1.95, z: 0, w: 2.3, h: 0.15, d: 2.3, color: COL.woodDark });
    // Horseshoe roof: lathe-like vertical section swept along x.
    const prof = (t) => { const a = (t - 0.5) * Math.PI * 1.08; return [Math.sin(a) * 1.45, 2.1 + Math.cos(a) * 3.0 - Math.pow(Math.abs(Math.sin(a)), 3) * 0.5]; };
    const top = orient(surfaceGeo(14, 4, (u, v) => { const [zz, yy] = prof(u); return [(v - 0.5) * 2.6, yy, zz]; }), [0, 1, 0]);
    b.add('thatch', top, {}, { color: 0xc9a266, jitter: 0.05 });
    for (const sx of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 14; i++) pts.push(prof(i / 14));
      b.add('gedek', prismGeo(pts.map(([zz, yy]) => [zz * 0.95, yy - 0.05]), 0.05), { x: sx * 1.1, yaw: Math.PI / 2 }, { color: 0xd8c49e });
    }
    b.collBox({ x: 0, y: -0.1, z: 0, w: 2.4, h: 5.0, d: 2.4, surface: 'wood', walkable: false });
  });
}

function baleBale(b, x, z, yaw) {
  const y = heightAt(x, z);
  b.within({ x, y, z, yaw }, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('bamboo', { x: sx * 0.95, y0: 0, z: sz * 0.6, r: 0.05, h: 0.5, seg: 6, color: COL.bamboo });
    for (let i = 0; i < 12; i++) b.cyl('bamboo', { x: 0, y: 0.52, z: -0.6 + i * 0.11, r: 0.045, h: 2.05, seg: 6, roll: Math.PI / 2, color: 0xd6c288, jitter: 0.08 });
    b.collBox({ x: 0, y: 0, z: 0, w: 2.05, h: 0.56, d: 1.3, surface: 'wood' });
  });
}

export { netPile };
