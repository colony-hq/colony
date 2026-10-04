// Held equipment and tools: weapons, shields, bows, staves, quivers and skilling tools, built as
// lists of coloured parts in a "grip" frame. Humanoids merge weapon parts into their skinned
// geometry (rigid on a hand socket bone); tools are small static meshes parented to a hand.
// Grip frame: origin = centre of the fist, main axis toward -z (blade / head direction when the
// arm hangs), cutting edge toward -y, thickness along x. Owner: actors builder.

import * as THREE from 'three';
import { METALS, WOODS } from '../data/items.js';
import { Builder, C, shade, mix, lathe, cyl, cone, sphere, box, torus, extrude, tube, TAU } from './a-core.js';

const LEATHER = '#6a4528', LEATHER_D = '#4a2e1a', WOOD = '#7a5634', WOOD_D = '#5a3c22';

// ---------------------------------------------------------------------------------------------
// Tints
// ---------------------------------------------------------------------------------------------
const SPECIAL = {
  gold: { color: '#e8b84a', color2: '#9a6a1a', shine: 1 },
  fireward: { color: '#b8322a', color2: '#f2c94c', shine: 0.5 },
  hood: { color: '#3f7f3a', color2: '#24461f', shine: 0 },
  leather: { color: '#9a6a44', color2: '#5a3a24', shine: 0.05 },
  goblin: { color: '#6b7f3a', color2: '#3f4a20', shine: 0.4 },
  bandit: { color: '#232326', color2: '#111113', shine: 0 },
  wyrm: { color: '#5d5a6a', color2: '#e8763a', shine: 0.35 },
  sapphire: { color: '#2f6fe0', color2: '#e8b84a', shine: 1 },
  emerald: { color: '#2ecc71', color2: '#e8b84a', shine: 1 },
  ruby: { color: '#e0314f', color2: '#e8b84a', shine: 1 },
  normal: { color: '#8d6e3f', color2: '#5a4428', shine: 0 },
};
const STAFF_TIPS = {
  staff: null,
  spark_staff: '#f4f1a8',
  tide_staff: '#4aa3df',
  ember_staff: '#ff8a3a',
  orbium_staff: '#b18cff',
};

// Resolve a tint (metal id, wood id, special id or a hex colour) to { color, color2, shine, metal }.
export function tint(t) {
  if (t && typeof t === 'object') return { color: t.color || '#8a8f95', color2: t.color2 || shade(t.color || '#8a8f95', 0.6), shine: t.shine ?? 1, metal: true };
  const m = METALS.find((x) => x.id === t);
  if (m) return { color: m.color, color2: m.color2, shine: 1, metal: true, tier: m.tier };
  const w = WOODS.find((x) => x.id && x.id === t);
  if (w) return { color: w.color, color2: shade(w.color, 0.62), shine: 0.08, wood: true, tier: w.tier };
  if (SPECIAL[t]) return { ...SPECIAL[t] };
  if (typeof t === 'string' && t[0] === '#') return { color: t, color2: '#' + shade(t, 0.6).getHexString(), shine: 1, metal: true };
  return { color: '#8a8f95', color2: '#4f5257', shine: 1, metal: true };
}
export const staffTip = (id) => STAFF_TIPS[id] ?? (id && id.includes('orbium') ? '#b18cff' : null);

// Part = [geometry, color, opts] in the grip frame (Builder opts: shine, glow, flat, colorFn...).
const P = (geo, color, o = {}) => [geo, color, o];
const ALONG_Z = [Math.PI / 2, 0, 0]; // lathe/cylinder +y -> -z ... (rotation x +90 maps +y to +z)

// Blade (lying in the y-z plane, length toward -z) from a half-width profile [[t, w], ...].
function blade(len, prof, thick, start) {
  const pts = [];
  for (const [t, w] of prof) pts.push([t * len, -w]);
  for (let i = prof.length - 1; i >= 0; i--) { const [t, w] = prof[i]; if (w > 0) pts.push([t * len, w]); }
  const g = extrude(pts, thick, thick * 0.35);
  g.rotateY(Math.PI / 2); // shape x -> -z, extrude -> x
  g.translate(0, 0, -start);
  return g;
}

function gripParts(len, r, color = LEATHER, z0 = 0.06) {
  const g = cyl(r, r * 1.05, len, 7);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, z0 - len / 2 + 0.0);
  return P(g, color, {});
}

// ---------------------------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------------------------
function dagger(T) {
  const len = 0.3;
  const out = [
    P(blade(len, [[0, 0.024], [0.75, 0.02], [1, 0]], 0.012, 0.075), T.color, { shine: 1, flat: true, colorFn: edgeShine(T.color, 0.016) }),
    P(box(0.03, 0.12, 0.026), T.color2, { at: [0, 0, -0.062], shine: 0.9 }),
    gripParts(0.11, 0.017),
    P(sphere(0.024, 8, 6), T.color2, { at: [0, 0, 0.075], shine: 0.9 }),
  ];
  return out;
}

function sword(T) {
  const len = 0.78;
  return [
    P(blade(len, [[0, 0.036], [0.85, 0.03], [1, 0]], 0.014, 0.08), T.color, { shine: 1, flat: true, colorFn: edgeShine(T.color, 0.024) }),
    P(box(0.005, 0.016, len * 0.7), shade(T.color, 0.62), { at: [0.009, 0, -0.08 - len * 0.38], shine: 0.8 }),
    P(box(0.005, 0.016, len * 0.7), shade(T.color, 0.62), { at: [-0.009, 0, -0.08 - len * 0.38], shine: 0.8 }),
    P(box(0.036, 0.24, 0.034), T.color2, { at: [0, 0, -0.064], shine: 0.9 }),
    P(sphere(0.022, 6, 5), T.color2, { at: [0, 0.12, -0.064], shine: 0.9 }),
    P(sphere(0.022, 6, 5), T.color2, { at: [0, -0.12, -0.064], shine: 0.9 }),
    gripParts(0.13, 0.019),
    P(sphere(0.03, 8, 6), T.color2, { at: [0, 0, 0.09], shine: 0.9, scale: [1, 1, 0.8] }),
  ];
}

function greatsword(T) {
  const len = 1.18;
  return [
    P(blade(len, [[0, 0.052], [0.12, 0.05], [0.16, 0.058], [0.88, 0.046], [1, 0]], 0.02, 0.1), T.color, { shine: 1, flat: true, colorFn: edgeShine(T.color, 0.038) }),
    P(box(0.006, 0.022, len * 0.72), shade(T.color, 0.6), { at: [0.012, 0, -0.1 - len * 0.45], shine: 0.8 }),
    P(box(0.006, 0.022, len * 0.72), shade(T.color, 0.6), { at: [-0.012, 0, -0.1 - len * 0.45], shine: 0.8 }),
    P(box(0.044, 0.38, 0.044), T.color2, { at: [0, 0, -0.08], shine: 0.9 }),
    P(cone(0.03, 0.08, 6), T.color2, { at: [0, 0.21, -0.1], rot: [0.6, 0, 0], shine: 0.9 }),
    P(cone(0.03, 0.08, 6), T.color2, { at: [0, -0.21, -0.1], rot: [Math.PI - 0.6, 0, 0], shine: 0.9 }),
    gripParts(0.34, 0.022, LEATHER, 0.28),
    P(sphere(0.038, 8, 6), T.color2, { at: [0, 0, 0.3], shine: 0.9 }),
  ];
}

function edgeShine(color, w) {
  const base = C(color), hi = mix(color, '#ffffff', 0.35), tmp = new THREE.Color();
  return (x, y, z) => (Math.abs(y) > w ? tmp.copy(hi) : tmp.copy(base));
}

function handle(len, z0 = 0.12, r = 0.02, color = WOOD) {
  const g = cyl(r * 0.9, r * 1.1, len, 7);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, z0 - len / 2);
  return P(g, color, {});
}

function axe(T) {
  const head = extrude([
    [0.58, 0.05], [0.67, 0.05], [0.66, -0.035], [0.74, -0.11], [0.765, -0.175], [0.7, -0.19], [0.6, -0.193],
    [0.52, -0.178], [0.525, -0.12], [0.585, -0.035],
  ], 0.028, 0.007);
  head.rotateY(Math.PI / 2);
  const hi = mix(T.color, '#ffffff', 0.3), base = C(T.color), tmp = new THREE.Color();
  return [
    handle(0.84, 0.13, 0.021),
    P(head, T.color, { shine: 1, flat: true, colorFn: (x, y) => (y < -0.16 ? tmp.copy(hi) : tmp.copy(base)) }),
    P(cyl(0.03, 0.03, 0.07, 7), T.color2, { at: [0, 0.01, -0.625], shine: 0.8 }),
    P(sphere(0.026, 6, 5), WOOD_D, { at: [0, 0, -0.715] }),
  ];
}

function pickaxe(T) {
  return [
    handle(0.84, 0.13, 0.021),
    P(tube([[0, 0.31, -0.555], [0, 0.15, -0.64], [0, 0, -0.668], [0, -0.15, -0.64], [0, -0.31, -0.555]], (t) => 0.014 + 0.022 * Math.sin(Math.PI * t), 12, 6), T.color, { shine: 1 }),
    P(cone(0.026, 0.07, 6), mix(T.color, '#ffffff', 0.25), { at: [0, 0.33, -0.53], rot: [-0.55, 0, 0], shine: 1 }),
    P(cone(0.026, 0.07, 6), mix(T.color, '#ffffff', 0.25), { at: [0, -0.33, -0.53], rot: [Math.PI + 0.55, 0, 0], shine: 1 }),
    P(box(0.05, 0.07, 0.07), T.color2, { at: [0, 0, -0.66], shine: 0.8 }),
  ];
}

function club(T, big = false) {
  const k = big ? 1.45 : 1;
  const g = lathe([[0.018, 0], [0.022, 0.14], [0.034 * k, 0.32 * k], [0.06 * k, 0.5 * k], [0.068 * k, 0.6 * k], [0.05 * k, 0.66 * k], [0.01, 0.68 * k]], 8);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, 0.12);
  const out = [P(g, big ? '#6a4a2e' : '#7a5a3a', { flat: true })];
  const studs = big ? 9 : 5;
  for (let i = 0; i < studs; i++) {
    const a = (i / studs) * TAU + 0.4, zz = -0.36 * k - (i % 2) * 0.1 * k;
    const r = 0.058 * k;
    out.push(P(cone(0.012 * k, 0.05 * k, 4), big ? '#8a8f95' : '#9a9a8a', { at: [Math.cos(a) * r, Math.sin(a) * r, zz], rot: [0, 0, a - Math.PI / 2], shine: 0.7 }));
  }
  if (big) {
    out.push(P(torus(0.062 * k, 0.008, 4, 10), '#5a5a5a', { at: [0, 0, -0.28 * k], shine: 0.8 }));
    out.push(P(torus(0.07 * k, 0.008, 4, 10), '#5a5a5a', { at: [0, 0, -0.5 * k], shine: 0.8 }));
  }
  return out;
}

// Staff: shaft along the grip axis, bottom toward +z, ornament at -z.
function staff(id, walking = false) {
  const tipC = staffTip(id);
  const len = 1.72, top = -0.98;
  const out = [P(tube([[0, 0, len + top], [0.012, 0.01, 0.3], [-0.01, 0, -0.3], [0.008, -0.01, top + 0.1], [0, 0, top]], (t) => 0.017 + 0.007 * t, 10, 6), walking ? '#6a4a2a' : WOOD, {})];
  out.push(P(torus(0.024, 0.008, 4, 8), LEATHER_D, { at: [0, 0, 0.06] }));
  out.push(P(torus(0.024, 0.008, 4, 8), LEATHER_D, { at: [0, 0, -0.06] }));
  if (walking) {
    // Crook / knob at the top.
    out.push(P(tube([[0, 0, top + 0.02], [0, 0.04, top - 0.08], [0, 0.12, top - 0.1], [0, 0.15, top - 0.02]], 0.022, 8, 6), '#6a4a2a', {}));
    return out;
  }
  if (!tipC) {
    out.push(P(sphere(0.045, 8, 6), WOOD_D, { at: [0, 0, top - 0.02], scale: [1, 1, 1.2] }));
    return out;
  }
  // Prongs holding a glowing orb (orbium: a crystal cluster).
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    out.push(P(tube([[0, 0, top + 0.02], [Math.cos(a) * 0.05, Math.sin(a) * 0.05, top - 0.06], [Math.cos(a) * 0.035, Math.sin(a) * 0.035, top - 0.15]], 0.011, 6, 4), id === 'orbium_staff' ? '#3a2f55' : '#8a6a3a', { shine: id === 'orbium_staff' ? 0.5 : 0.2 }));
  }
  if (id === 'orbium_staff') {
    out.push(P(new THREE.OctahedronGeometry(0.075, 0), '#b18cff', { at: [0, 0, top - 0.1], scale: [0.7, 0.7, 1.5], flat: true, glow: 0.85, shine: 1, ao: false }));
    out.push(P(new THREE.OctahedronGeometry(0.04, 0), '#8fe3ff', { at: [0.05, 0.02, top - 0.06], rot: [0.5, 0, 0.6], scale: [0.6, 0.6, 1.4], flat: true, glow: 0.9, ao: false }));
    out.push(P(new THREE.OctahedronGeometry(0.035, 0), '#8fe3ff', { at: [-0.045, -0.03, top - 0.05], rot: [-0.4, 0, -0.5], scale: [0.6, 0.6, 1.4], flat: true, glow: 0.9, ao: false }));
  } else {
    out.push(P(sphere(0.052, 10, 8), tipC, { at: [0, 0, top - 0.11], glow: 1, ao: false }));
  }
  return out;
}

// Bow in its own frame: limbs along y, string side toward +z (the archer), back toward -z.
// Returned with the string endpoints so the caller can rig the string to a nock bone.
export function bowParts(kind, woodTint) {
  const W = tint(woodTint === 'normal' || !woodTint ? 'normal' : woodTint);
  const long = kind === 'longbow';
  const L = long ? 1.5 : 1.08;
  const d = long ? 0.13 : 0.12;
  const h = L / 2;
  const pts = long
    ? [[0, -h, d], [0, -h * 0.66, d * 0.42], [0, -h * 0.3, 0.06 * d], [0, 0, 0], [0, h * 0.3, 0.06 * d], [0, h * 0.66, d * 0.42], [0, h, d]]
    : [[0, -h, d * 0.7], [0, -h * 0.82, d * 0.95], [0, -h * 0.45, d * 0.35], [0, 0, 0], [0, h * 0.45, d * 0.35], [0, h * 0.82, d * 0.95], [0, h, d * 0.7]];
  const r0 = long ? 0.02 : 0.019;
  const parts = [
    P(tube(pts, (t) => r0 * (0.5 + 0.5 * Math.sin(Math.PI * t)), 18, 6), W.color, { shine: 0.12 }),
    P(cyl(0.026, 0.026, 0.13, 7), LEATHER, { at: [0, 0, 0.004] }),
    P(sphere(0.016, 6, 4), shade(W.color, 0.7), { at: pts[0] }),
    P(sphere(0.016, 6, 4), shade(W.color, 0.7), { at: pts[pts.length - 1] }),
  ];
  return { parts, top: pts[pts.length - 1], bottom: pts[0], nock: [0, 0, long ? d : d * 0.7] };
}

function shield(kind, T, face = null) {
  if (kind === 'buckler') {
    return [
      P(cyl(0.2, 0.2, 0.03, 14), T.color2 || '#5a4a3a', { rot: [0, 0, Math.PI / 2], flat: false }),
      P(torus(0.2, 0.016, 5, 16), T.color, { rot: [0, Math.PI / 2, 0], shine: 0.9 }),
      P(sphere(0.06, 8, 6), T.color, { at: [-0.02, 0, 0], scale: [0.6, 1, 1], shine: 1 }),
    ];
  }
  // Kite shape in the shield plane (x = width, y = length; +y toward the elbow).
  const s = (k) => [
    [-0.2 * k, 0.24 * k], [-0.1 * k, 0.285 * k], [0, 0.295 * k], [0.1 * k, 0.285 * k], [0.2 * k, 0.24 * k], [0.215 * k, 0.1 * k],
    [0.18 * k, -0.08 * k], [0.1 * k, -0.27 * k], [0, -0.42 * k], [-0.1 * k, -0.27 * k], [-0.18 * k, -0.08 * k], [-0.215 * k, 0.1 * k],
  ];
  const ROT = [0, -Math.PI / 2, 0]; // shape x -> +z, extrude -> -x
  const fw = face === 'fireward';
  const faceC = fw ? '#b8322a' : face || shade(T.color, 0.92);
  const rimC = fw ? '#f2c94c' : face ? T.color : mix(T.color, '#ffffff', 0.18);
  const out = [
    P(extrude(s(1), 0.03, 0.01), rimC, { rot: ROT, flat: true, shine: fw ? 0.8 : 1 }),
    P(extrude(s(0.86), 0.03, 0.006), faceC, { rot: ROT, at: [-0.012, 0, 0], flat: true, shine: fw || face ? 0.15 : 1 }),
  ];
  if (fw) {
    // Painted ward: a golden flame inside a ring.
    const flame = [[0, 0.17], [0.05, 0.06], [0.1, 0.01], [0.08, -0.1], [0.02, -0.16], [0, -0.12], [-0.02, -0.16], [-0.08, -0.1], [-0.1, 0.01], [-0.05, 0.06]];
    out.push(P(extrude(flame, 0.01), '#f2c94c', { rot: ROT, at: [-0.035, 0.0, 0], flat: true, shine: 0.6 }));
    out.push(P(extrude([[0, 0.06], [0.04, -0.02], [0, -0.09], [-0.04, -0.02]], 0.01), '#ff8a3a', { rot: ROT, at: [-0.04, -0.03, 0], flat: true, glow: 0.25 }));
    out.push(P(torus(0.165, 0.01, 4, 20), '#f2c94c', { rot: [0, Math.PI / 2, 0], at: [-0.034, -0.01, 0], shine: 0.6 }));
  } else if (face) {
    // Heraldic stripe for guards.
    out.push(P(box(0.01, 0.6, 0.07), T.color, { at: [-0.034, -0.05, 0], shine: 1 }));
  } else {
    out.push(P(sphere(0.055, 8, 6), mix(T.color, '#ffffff', 0.15), { at: [-0.03, 0.04, 0], scale: [0.5, 1, 1], shine: 1 }));
  }
  return out;
}

// Quiver for the back (chest frame: +z is behind the character).
function quiver(T) {
  const out = [
    P(cyl(0.07, 0.06, 0.56, 9), '#7a4e2c', {}),
    P(torus(0.071, 0.012, 4, 10), T.color, { at: [0, 0.27, 0], rot: [Math.PI / 2, 0, 0], shine: 1 }),
    P(torus(0.064, 0.01, 4, 10), LEATHER_D, { at: [0, -0.18, 0], rot: [Math.PI / 2, 0, 0] }),
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU, r = 0.035;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    out.push(P(cyl(0.006, 0.006, 0.14, 4), '#c9a46a', { at: [x, 0.33, z] }));
    out.push(P(box(0.004, 0.08, 0.035), i % 2 ? '#f2efe6' : '#c0392b', { at: [x, 0.37, z], rot: [0, a, 0] }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Tools (static meshes in the grip frame of a hand)
// ---------------------------------------------------------------------------------------------
function tool(kind, t) {
  switch (kind) {
    case 'axe': return axe(tint(t || 'bronze'));
    case 'pickaxe': return pickaxe(tint(t || 'bronze'));
    case 'hammer': return [
      handle(0.36, 0.08, 0.016),
      P(box(0.065, 0.16, 0.065), '#5a5f66', { at: [0, 0.02, -0.25], shine: 1 }),
    ];
    case 'knife': return [
      P(blade(0.14, [[0, 0.016], [0.7, 0.014], [1, 0]], 0.006, 0.05), '#c8ccd2', { shine: 1, flat: true }),
      gripParts(0.09, 0.014, '#5a3c22'),
    ];
    case 'needle': return [P(cyl(0.003, 0.003, 0.09, 4), '#d0d4d8', { at: [0, 0, -0.04], rot: ALONG_Z, shine: 1 })];
    case 'chisel': return [
      P(box(0.012, 0.02, 0.12), '#b0b6bc', { at: [0, 0, -0.08], shine: 1 }),
      gripParts(0.08, 0.016, '#7a5634'),
    ];
    case 'net': {
      const out = [handle(0.95, 0.15, 0.014, '#8a6a42')];
      out.push(P(torus(0.17, 0.012, 4, 14), '#6a5030', { at: [0, 0, -0.95], rot: [0, 0, 0] }));
      const bag = lathe([[0.02, -0.28], [0.08, -0.24], [0.14, -0.12], [0.17, 0]], 10);
      bag.rotateX(-Math.PI / 2);
      out.push(P(bag, '#d8c8a0', { at: [0, 0, -0.95], rot: [0, 0, 0], flat: true, shade: 0.9 }));
      return out;
    }
    case 'rod': return [
      P(cyl(0.006, 0.016, 2.1, 6), '#8a6038', { at: [0, 0, -0.95], rot: [-Math.PI / 2, 0, 0] }),
      P(cyl(0.02, 0.02, 0.26, 6), '#3a281a', { at: [0, 0, 0.0], rot: [-Math.PI / 2, 0, 0] }),
      P(cyl(0.034, 0.034, 0.03, 10), '#4a4a4a', { at: [0, -0.04, -0.02], rot: [0, 0, Math.PI / 2], shine: 0.8 }),
    ];
    case 'harpoon': return [
      handle(1.45, 0.4, 0.016, '#7a5634'),
      P(cone(0.03, 0.2, 6), '#9aa0a8', { at: [0, 0, -1.15], rot: [-Math.PI / 2, 0, 0], shine: 1 }),
      P(cone(0.015, 0.08, 4), '#9aa0a8', { at: [0, 0.035, -1.05], rot: [-Math.PI / 2 + 0.6, 0, 0], shine: 1 }),
      P(cone(0.015, 0.08, 4), '#9aa0a8', { at: [0, -0.035, -1.05], rot: [-Math.PI / 2 - 0.6, 0, 0], shine: 1 }),
    ];
    case 'pan': return [
      handle(0.32, 0.06, 0.014, '#3a2a1a'),
      P(cyl(0.15, 0.12, 0.045, 14, false), '#3a3a3e', { at: [0, 0.0, -0.4], shine: 0.6 }),
      P(sphere(0.07, 8, 5), '#c9a07a', { at: [0, 0.02, -0.4], scale: [1.5, 0.35, 0.7] }),
    ];
    case 'tinderbox': return [P(box(0.09, 0.05, 0.06), '#8d6e3f', { at: [0, 0, -0.02] }), P(box(0.07, 0.012, 0.05), '#b0b6bc', { at: [0, 0.03, -0.02], shine: 1 })];
    case 'log': return [P(cyl(0.05, 0.05, 0.3, 8), '#8d6e3f', { at: [0, 0, -0.05], rot: [0, 0, Math.PI / 2] }), P(cyl(0.042, 0.042, 0.302, 8), '#d8b880', { at: [0, 0, -0.05], rot: [0, 0, Math.PI / 2], shade: 1 })];
    case 'leather': return [P(box(0.18, 0.012, 0.14), '#a0714f', { at: [0, 0, -0.06], rot: [0.2, 0, 0] })];
    case 'ore': return [P(new THREE.DodecahedronGeometry(0.06, 0), '#7a5545', { at: [0, 0, -0.04], flat: true })];
    case 'bar': return [P(box(0.06, 0.04, 0.16), '#b87333', { at: [0, 0, -0.06], shine: 1 })];
    case 'food': return [
      P(sphere(0.06, 8, 6), '#b0703a', { at: [0, 0, -0.07], scale: [1, 0.85, 1.3] }),
      P(cyl(0.012, 0.012, 0.08, 5), '#efe8d8', { at: [0, 0, 0.0], rot: ALONG_Z }),
    ];
    case 'bread': return [P(sphere(0.07, 8, 6), '#c8893f', { at: [0, 0, -0.05], scale: [1, 0.7, 1.4] })];
    case 'potion': return [P(sphere(0.045, 8, 6), '#c0392b', { at: [0, 0, -0.04], glow: 0.15 }), P(cyl(0.015, 0.015, 0.05, 6), '#e8e2d0', { at: [0, 0.05, -0.04] })];
    case 'wand': return [P(cyl(0.006, 0.01, 0.3, 5), '#5a3c22', { at: [0, 0, -0.1], rot: ALONG_Z })];
    default: return [];
  }
}

// ---------------------------------------------------------------------------------------------
// Public builders
// ---------------------------------------------------------------------------------------------
// Parts for a weapon kind in the grip frame (right hand). Bows are separate (bowParts).
export function weaponParts(kind, t) {
  switch (kind) {
    case 'dagger': return dagger(tint(t));
    case 'sword': return sword(tint(t));
    case 'greatsword': return greatsword(tint(t));
    case 'axe': return axe(tint(t));
    case 'pickaxe': return pickaxe(tint(t));
    case 'club': return club(tint(t), false);
    case 'greatclub': return club(tint(t), true);
    case 'staff': return staff(t, false);
    case 'walking-staff': return staff(null, true);
    case 'harpoon': return tool('harpoon');
    default: return [];
  }
}
export function shieldParts(kind, t, face) { return shield(kind, tint(t), face); }
export function quiverParts(t) { return quiver(tint(t)); }
export function toolParts(kind, t) { return tool(kind, t); }

// Add parts to a Builder on a bone, with an optional extra transform (matrix in the bone frame).
export function addParts(B, bone, parts, matrix = null) {
  for (const [geo, color, o] of parts) {
    const g = geo.clone();
    geo.dispose();
    B.add(g, bone, color, { ...o, matrix });
  }
}

// Static geometry for a tool / item (cached by key).
const TOOL_CACHE = new Map();
export function toolGeometry(kind, t) {
  const key = kind + '|' + (t || '');
  if (TOOL_CACHE.has(key)) return TOOL_CACHE.get(key);
  const B = new Builder(null, { aoMin: 1 });
  const parts = kind === 'bow' || kind === 'shortbow' || kind === 'longbow' ? bowParts(kind === 'bow' ? 'shortbow' : kind, t).parts : (weaponParts(kind, t).length ? weaponParts(kind, t) : tool(kind, t));
  for (const [geo, color, o] of parts) B.add(geo, null, color, { ...o, ao: false });
  const g = B.build();
  TOOL_CACHE.set(key, g);
  return g;
}
