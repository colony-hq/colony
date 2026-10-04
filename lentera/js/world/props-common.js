// Shared small props used by several set-dressing regions (owner: setdressing).
// All functions draw into a Builder in its current local frame.

import * as THREE from 'three';
import { latheGeo, atlasQuad, prismGeo, boxGeo } from './props-kit.js';

export const WARM = [2.9, 1.65, 0.62]; // HDR window / lamp glow (linear)
export const WARM_HOT = [4.2, 2.5, 1.0];
export const EMBER = [3.2, 1.1, 0.25];

export const COL = {
  bark: 0x5a4330,
  barkDark: 0x3d2c20,
  woodWarm: 0x9a7048,
  woodDark: 0x5b3d26,
  woodGrey: 0x8c7d6c,
  soga: 0x7a4a2a,
  bamboo: 0xd8c48a,
  stoneGrey: 0x9a9890,
  ash: 0x2b2826,
  char: 0x1c1714,
  terracotta: 0xb4643c,
  rope: 0x8a7350,
  iron: 0x3a3632,
};

// Campfire pit at local origin (fire base centre on the ground). Stones + logs + ash.
export function campfirePit(b, { big = true } = {}) {
  const R = big ? 0.95 : 0.75;
  b.cyl('rock', { x: 0, y0: -0.06, z: 0, r: R * 0.82, rt: R * 0.78, h: 0.1, seg: 14, color: COL.ash, jitter: 0.05 });
  const n = big ? 11 : 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + b.r(-0.1, 0.1);
    const r = b.r(0.17, 0.25);
    b.rock('rock', { x: Math.cos(a) * R, y: r * 0.25, z: Math.sin(a) * R, r, squash: 0.62, color: 0x8a867e, jitter: 0.15,
      vc: (x, y, z, nx, ny, nz, c) => { if (ny < 0.2) c.multiplyScalar(0.55); } });
  }
  // Teepee of logs leaning to the centre, charred toward their tips.
  const logs = big ? 5 : 4;
  for (let i = 0; i < logs; i++) {
    const a = (i / logs) * Math.PI * 2 + 0.4;
    const base = [Math.cos(a) * 0.55, 0.02, Math.sin(a) * 0.55];
    const tip = [Math.cos(a) * 0.08, 0.55, Math.sin(a) * 0.08];
    b.rod('wood', base, tip, b.r(0.055, 0.075), { seg: 6, color: COL.bark, jitter: 0.1,
      vc: (x, y, z, nx, ny, nz, c) => { const k = Math.min(1, Math.max(0, (y - b.frame.m.elements[13] - 0.2) / 0.3)); c.lerp(new THREE.Color(0.06, 0.05, 0.045), k * 0.85); } });
  }
  // Two half-burnt logs lying across.
  b.rod('wood', [-0.5, 0.06, -0.2], [0.45, 0.06, 0.25], 0.07, { seg: 6, color: COL.char, jitter: 0.1 });
  b.rod('wood', [-0.3, 0.06, 0.45], [0.35, 0.08, -0.4], 0.06, { seg: 6, color: COL.barkDark, jitter: 0.1 });
}

// Horizontal sitting log centred at local (x, z), axis along local x rotated by yaw.
export function sittingLog(b, x, z, yaw, len = 1.8, r = 0.21) {
  b.within({ x, y: r * 0.85, z, yaw }, () => {
    b.add('wood', new THREE.CylinderGeometry(r, r * 1.05, len, 9, 1), { roll: Math.PI / 2 }, {
      color: COL.bark, jitter: 0.12,
      vc: (px, py, pz, nx, ny, nz, c) => { if (Math.abs(nx) > 0.9 || Math.abs(nz) > 0.9 && false) c.setRGB(0.62, 0.5, 0.36); },
    });
    // Cut ends (lighter rings).
    for (const s of [-1, 1]) b.add('wood', new THREE.CircleGeometry(r * 0.92, 9), { x: s * (len / 2 + 0.005), yaw: s * Math.PI / 2 }, { color: 0xb59468, jitter: 0.05 });
    // Small stub feet to keep it from rolling.
    b.box('wood', { x: -len * 0.32, y: -r * 0.6, z: 0, w: 0.12, h: 0.2, d: 0.5, color: COL.barkDark });
    b.box('wood', { x: len * 0.32, y: -r * 0.6, z: 0, w: 0.12, h: 0.2, d: 0.5, color: COL.barkDark });
  });
}

// Hanging lantern (cage + glowing core) with its top hook at local origin.
export function hangingLantern(b, { glow = WARM_HOT, scale = 1 } = {}) {
  const s = scale;
  b.rod('metal', [0, 0, 0], [0, -0.12 * s, 0], 0.008, { color: COL.iron });
  b.cyl('metal', { x: 0, y0: -0.2 * s, z: 0, r: 0.13 * s, rt: 0.04 * s, h: 0.08 * s, seg: 8, color: COL.iron });
  b.cyl('glow', { x: 0, y0: -0.42 * s, z: 0, r: 0.085 * s, rt: 0.095 * s, h: 0.22 * s, seg: 8, color: glow });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 0.11 * s, z = Math.sin(a) * 0.11 * s;
    b.rod('metal', [x, -0.44 * s, z], [x, -0.2 * s, z], 0.009 * s, { color: COL.iron, seg: 4 });
  }
  b.cyl('metal', { x: 0, y0: -0.48 * s, z: 0, r: 0.1 * s, rt: 0.12 * s, h: 0.06 * s, seg: 8, color: COL.iron });
}

// Lamp post: wooden post with an arm and a hanging lantern. Local origin = post foot.
export function lampPost(b, { h = 2.7, armYaw = 0, bamboo = false, coll = true } = {}) {
  const mat = bamboo ? 'bamboo' : 'wood';
  b.cyl(mat, { x: 0, y0: 0, z: 0, r: 0.07, rt: 0.06, h, seg: 7, color: bamboo ? COL.bamboo : COL.woodDark, ao: [0, 0.6, 0.6] });
  b.within({ yaw: armYaw }, () => {
    b.bar('wood', [0, h - 0.18, 0], [0.62, h - 0.18, 0], 0.06, 0.07, { color: COL.woodDark });
    b.bar('wood', [0, h - 0.6, 0], [0.42, h - 0.2, 0], 0.04, 0.04, { color: COL.woodDark });
    b.within({ x: 0.55, y: h - 0.22, z: 0 }, () => hangingLantern(b));
  });
  if (coll) b.collCyl({ x: 0, y: 0, z: 0, r: 0.12, h: h, surface: 'wood', walkable: false });
}

// Stone footing (umpak) under a stilt. Local origin = ground point.
export function umpak(b, x, z, gy, s = 0.36) {
  b.add('stone', new THREE.CylinderGeometry(s * 0.42, s * 0.62, 0.28, 4, 1), { x, y: gy + 0.1, z, yaw: Math.PI / 4 }, { color: 0xa09c92, jitter: 0.1 });
}

// Clay water jar (gentong / kendi). Local origin = ground.
export function gentong(b, x, y, z, s = 1, color = COL.terracotta) {
  const prof = [[0.0, 0], [0.16, 0.0], [0.26, 0.12], [0.3, 0.3], [0.26, 0.48], [0.15, 0.58], [0.14, 0.64], [0.17, 0.67], [0.13, 0.67]].map(([r, h]) => [r * s, h * s]);
  b.add('paint', latheGeo(prof, 12), { x, y, z }, { color, jitter: 0.12, ao: [y, y + 0.4 * s, 0.6] });
}

// Woven basket (bakul). Local origin = ground.
export function bakul(b, x, y, z, s = 1) {
  b.add('gedek', latheGeo([[0.0, 0], [0.16, 0], [0.2, 0.05], [0.26, 0.26], [0.27, 0.28], [0.25, 0.28]].map(([r, h]) => [r * s, h * s]), 10), { x, y, z }, { color: 0xc7a46a, jitter: 0.1 });
}

export function crate(b, x, y, z, s = 0.6, yaw = 0, color = 0x8a6a48) {
  b.within({ x, y, z, yaw }, () => {
    b.box('wood', { x: 0, y0: 0, z: 0, w: s, h: s * 0.8, d: s * 0.8, color, jitter: 0.12 });
    for (const sx of [-1, 1]) b.box('wood', { x: sx * s * 0.5, y0: 0, z: 0, w: 0.04, h: s * 0.8, d: s * 0.82, color: 0x5a4430 });
  });
}

export function barrel(b, x, y, z, s = 1, tilt = 0, yaw = 0, color = 0x7a5838) {
  const prof = [[0.24, 0], [0.29, 0.2], [0.3, 0.4], [0.29, 0.6], [0.24, 0.8]].map(([r, h]) => [r * s, h * s]);
  const g = latheGeo(prof, 12);
  b.add('wood', g, { x, y, z, yaw, roll: tilt }, { color, jitter: 0.12 });
  for (const hy of [0.12, 0.68]) b.add('metal', new THREE.TorusGeometry(0.285 * s, 0.015, 4, 14), { x, y: y + hy * s * Math.cos(tilt), z, yaw, roll: tilt, pitch: 0 }, { color: COL.iron });
}

// Firewood stack: short split logs piled between two stakes. Local origin = ground at centre.
export function firewood(b, { len = 1.6, rows = 4 } = {}) {
  for (let r = 0; r < rows; r++) {
    const n = 6 - (r % 2);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.24 / 1 * (len / 1.6);
      b.add('wood', new THREE.CylinderGeometry(0.1, 0.1, 0.55, 6, 1), { x: x * 0.95, y: 0.1 + r * 0.19, z: 0, pitch: Math.PI / 2, roll: b.r(-0.05, 0.05) }, { color: COL.bark, jitter: 0.18 });
    }
  }
  for (const sx of [-1, 1]) b.cyl('wood', { x: sx * (len / 2 + 0.05), y0: 0, z: 0, r: 0.04, h: rows * 0.2 + 0.2, color: COL.woodDark });
}

// Bell-shaped stupa finial (ratna). Local origin = base.
export function ratna(b, s = 1, mat = 'stone', color = 0xa8a69c) {
  const prof = (s < 0.7
    ? [[0.42, 0], [0.42, 0.12], [0.34, 0.2], [0.4, 0.4], [0.3, 0.66], [0.16, 0.8], [0.08, 1.1], [0.0, 1.45]]
    : [[0.42, 0], [0.42, 0.1], [0.3, 0.14], [0.36, 0.22], [0.4, 0.38], [0.36, 0.58], [0.24, 0.72], [0.16, 0.78], [0.18, 0.84], [0.12, 0.88], [0.08, 1.1], [0.04, 1.35], [0.0, 1.45]])
    .map(([r, h]) => [r * s, h * s]);
  b.add(mat, latheGeo(prof, s < 0.7 ? 7 : 10), {}, { color, jitter: 0.08 });
}

// Coil of rope lying on a deck.
export function ropeCoil(b, x, y, z, r = 0.3) {
  for (let i = 0; i < 3; i++) b.add('rope', new THREE.TorusGeometry(r - i * 0.06, 0.03, 4, 14), { x, y: y + 0.03 + i * 0.05, z, pitch: Math.PI / 2 }, { color: COL.rope, jitter: 0.1 });
}

// Fishing net heap (lumpy mound) + floats.
export function netPile(b, x, y, z, s = 1) {
  b.rock('rope', { x, y: y + 0.05 * s, z, r: 0.55 * s, squash: 0.35, rough: 0.4, color: 0x4a5a4e, jitter: 0.1 });
  for (let i = 0; i < 4; i++) {
    const a = b.r(0, 6.28);
    b.add('paint', new THREE.SphereGeometry(0.06 * s, 6, 4), { x: x + Math.cos(a) * 0.4 * s, y: y + 0.12 * s, z: z + Math.sin(a) * 0.4 * s }, { color: i % 2 ? 0xd9a23a : 0xc0452e });
  }
}

// Low bench (bangku). Local origin = ground at centre, length along local x.
export function bench(b, len = 1.8, h = 0.45, color = COL.woodWarm) {
  b.box('wood', { x: 0, y0: h - 0.05, z: 0, w: len, h: 0.05, d: 0.32, grain: 'x', color, jitter: 0.08 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('wood', { x: sx * (len / 2 - 0.12), y0: 0, z: sz * 0.11, w: 0.06, h: h - 0.05, d: 0.06, color: COL.woodDark });
  b.box('wood', { x: 0, y0: 0.15, z: 0, w: len - 0.2, h: 0.05, d: 0.05, grain: 'x', color: COL.woodDark });
}

// Signboard arm pointing toward local +x with a painted label on both faces.
export function signArm(b, region, len = 1.05, hgt = 0.22) {
  const t = 0.045;
  b.box('wood', { x: len / 2 - 0.05, y: 0, z: 0, w: len - 0.1, h: hgt, d: t, grain: 'x', color: 0xa0764c, jitter: 0.08 });
  // Arrow tip.
  const tip = prismGeo([[0, -hgt / 2], [0.2, 0], [0, hgt / 2]], t);
  b.add('wood', tip, { x: len - 0.1, y: 0, z: 0 }, { color: 0xa0764c });
  // Labels (front reads left->right; the back is flipped so it reads correctly from behind).
  const lw = len - 0.18, lh = hgt * 0.84;
  b.add('decal', atlasQuad(lw, lh, region), { x: len / 2 - 0.06, y: 0, z: t / 2 + 0.004 }, { color: 0xffffff, jitter: 0 });
  b.add('decal', atlasQuad(lw, lh, region, {}), { x: len / 2 - 0.06, y: 0, z: -t / 2 - 0.004, yaw: Math.PI }, { color: 0xffffff, jitter: 0 });
}

// Signpost with arms pointing at world targets. (x, z) world, gy ground height.
export function signpost(b, x, gy, z, arms, regions) {
  b.within({ x, y: gy, z }, () => {
    b.cyl('wood', { x: 0, y0: -0.3, z: 0, r: 0.075, rt: 0.065, h: 2.6, seg: 7, color: COL.woodDark, ao: [gy, gy + 0.5, 0.6] });
    b.add('wood', new THREE.ConeGeometry(0.1, 0.18, 4), { x: 0, y: 2.38, z: 0, yaw: Math.PI / 4 }, { color: COL.woodDark });
    // Small stone cairn at the foot.
    for (let i = 0; i < 4; i++) b.rock('rock', { x: Math.cos(i * 1.7) * 0.28, y: 0.05, z: Math.sin(i * 1.7) * 0.28, r: b.r(0.12, 0.18), detail: 0, color: 0x8a867e });
    arms.forEach((arm, i) => {
      const dx = arm.to[0] - x, dz = arm.to[1] - z;
      const yaw = Math.atan2(-dz, dx);
      b.within({ x: 0, y: 2.05 - i * 0.32, z: 0, yaw }, () => signArm(b, regions['sign:' + arm.word], arm.len || 1.05));
    });
    b.collCyl({ x: 0, y: -0.3, z: 0, r: 0.12, h: 2.6, surface: 'wood', walkable: false });
  });
}

// Bamboo fence run from (x0,z0) to (x1,z1) in the current frame, ground heights via gy(x,z).
export function bambooFence(b, x0, z0, x1, z1, gy, { h = 1.0, coll = true } = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 1.6));
  const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * (i / n), z = z0 + (z1 - z0) * (i / n);
    const y = gy(x, z);
    b.cyl('bamboo', { x, y0: y - 0.2, z, r: 0.045, h: h + 0.3, seg: 6, color: COL.bamboo });
  }
  for (const ry of [0.35, 0.8]) {
    const ya = gy(x0, z0) + ry * h, yb = gy(x1, z1) + ry * h;
    b.rod('bamboo', [x0, ya, z0], [x1, yb, z1], 0.03, { seg: 5, color: 0xcbb57a });
  }
  // Split-bamboo slats leaning crosswise (pagar).
  const m = Math.round(len / 0.32);
  for (let i = 0; i < m; i++) {
    const t = (i + 0.5) / m;
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const y = gy(x, z);
    const lean = (i % 2 ? 1 : -1) * 0.18;
    b.rod('bamboo', [x - ux * lean, y + 0.05, z - uz * lean], [x + ux * lean, y + h * 0.95, z + uz * lean], 0.018, { seg: 4, color: 0xd9c690, jitter: 0.12 });
  }
  if (coll) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.collBox({ x: cx, y: gy(cx, cz) - 0.3, z: cz, w: len, h: h + 0.3, d: 0.16, yaw: Math.atan2(-(z1 - z0), x1 - x0), surface: 'wood', walkable: false });
  }
}

// Tiny offering tray (canang sari): palm-leaf square with flowers.
export function canang(b, x, y, z) {
  b.box('gedek', { x, y0: y, z, w: 0.16, h: 0.03, d: 0.16, color: 0x9ab460 });
  const cols = [0xf2f0e8, 0xe94a3a, 0xf2c23a, 0x8a5ac8];
  for (let i = 0; i < 4; i++) b.add('paint', new THREE.SphereGeometry(0.025, 5, 3), { x: x + (i % 2 ? 0.04 : -0.04), y: y + 0.04, z: z + (i < 2 ? 0.04 : -0.04) }, { color: cols[i] });
}

// Simple box helper for planks laid along local x (deck boards etc).
export function plankRow(b, { x0, x1, z0, z1, y, t = 0.06, w = 0.22, gap = 0.02, color = COL.woodWarm, along = 'x', jitter = 0.12 }) {
  if (along === 'x') {
    const n = Math.max(1, Math.floor((z1 - z0) / (w + gap)));
    const pw = (z1 - z0) / n;
    for (let i = 0; i < n; i++) b.box('wood', { x: (x0 + x1) / 2, y0: y - t, z: z0 + pw * (i + 0.5), w: x1 - x0, h: t, d: pw - gap, grain: 'x', color, jitter });
  } else {
    const n = Math.max(1, Math.floor((x1 - x0) / (w + gap)));
    const pw = (x1 - x0) / n;
    for (let i = 0; i < n; i++) b.box('wood', { x: x0 + pw * (i + 0.5), y0: y - t, z: (z0 + z1) / 2, w: pw - gap, h: t, d: z1 - z0, grain: 'z', color, jitter });
  }
}

export { boxGeo };
