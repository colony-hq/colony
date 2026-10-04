// Humanoid bodies: one skinned mesh per actor (body + clothing + armour + held weapon merged),
// shared between actors with identical looks. Variants on the same skeleton: human, goblin,
// troll, imp, skeleton, golem. Owner: actors builder.
//
// normaliseLook(look, opts) -> spec;  buildHumanoid(spec) -> { geo, layout } (cached by key)
// Skeleton conventions (model faces -z, +x is the character's right): see a-anim.js.

import * as THREE from 'three';
import {
  Builder, C, shade, mix, hexOf, smooth01, clamp, taper, lathe, sphere, box, cyl, cone, torus, extrude, tube,
  deform, rock, makeBones, boneIndex, TAU, rng, hashStr,
} from './a-core.js';
import { weaponParts, shieldParts, quiverParts, bowParts, tint, addParts } from './a-gear.js';

// ---------------------------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------------------------
export const HB = {
  root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5, eyes: 6, hair: 7,
  shL: 8, elL: 9, haL: 10, shR: 11, elR: 12, haR: 13,
  thL: 14, knL: 15, ftL: 16, thR: 17, knR: 18, ftR: 19,
  cape: 20, cape2: 21, wpn: 22, wpnL: 23, shd: 24, nock: 25, arrow: 26, wingL: 27, wingR: 28,
};
export const HB_COUNT = 29;
const PARENT = [-1, 0, 1, 2, 3, 4, 5, 5, 3, 8, 9, 3, 11, 12, 1, 14, 15, 1, 17, 18, 3, 20, 13, 10, 9, 23, 25, 3, 3];
// Upper body mask (attacks while walking only drive these).
export const HB_UPPER = new Uint8Array(HB_COUNT);
for (const b of [HB.spine, HB.chest, HB.neck, HB.head, HB.shL, HB.elL, HB.haL, HB.shR, HB.elR, HB.haR, HB.wingL, HB.wingR]) HB_UPPER[b] = 1;

const BUILDS = {
  normal: { width: 1, limb: 1, leg: 1, head: 1, belly: 0, hunch: 0, torso: 1, arm: 1, shoulder: 1, scale: 1 },
  slim: { width: 0.88, limb: 0.85, leg: 1.03, head: 0.98, belly: 0, hunch: 0, torso: 1.02, arm: 1.02, shoulder: 0.95, scale: 1.01 },
  stout: { width: 1.22, limb: 1.25, leg: 0.94, head: 1.03, belly: 0.065, hunch: 0, torso: 0.98, arm: 0.98, shoulder: 1.1, scale: 0.98 },
  old: { width: 0.95, limb: 0.88, leg: 0.95, head: 1.03, belly: 0.025, hunch: 1, torso: 0.96, arm: 0.98, shoulder: 0.95, scale: 0.95 },
};
const VARIANTS = {
  human: {},
  goblin: { width: 0.86, limb: 0.82, leg: 0.6, head: 1.5, torso: 0.78, arm: 0.95, shoulder: 0.9, hunch: 0.5 },
  troll: { width: 1.5, limb: 1.65, leg: 0.72, head: 0.82, torso: 1.05, arm: 1.32, shoulder: 1.45, hunch: 1.3, belly: 0.06 },
  imp: { width: 0.72, limb: 0.66, leg: 0.72, head: 1.3, torso: 0.78, arm: 0.95, shoulder: 0.85 },
  skeleton: { width: 0.9, limb: 0.55, leg: 1, head: 1.02, torso: 1, arm: 1, shoulder: 1 },
  golem: { width: 1.65, limb: 1.9, leg: 0.68, head: 0.72, torso: 1.12, arm: 1.2, shoulder: 1.55, hunch: 0.55 },
};
export const HEAD_R = 0.198;

// Bind layout (offsets relative to parents) for a body spec.
export function layoutFor(spec) {
  const b = spec.b;
  const thigh = 0.4 * b.leg, shin = 0.37 * b.leg, ankle = 0.075;
  const hipY = ankle + shin + thigh + 0.03;
  const hr = HEAD_R * b.head;
  const t = b.torso;
  const sh = b.shoulder * (spec.female ? 0.9 : 1);
  const hipW = spec.female ? 1.08 : 1;
  const arm = b.arm;
  const nock = spec.bow ? spec.bow.nockY : 0.1;
  const off = [
    [0, 0, 0], // root
    [0, hipY, 0], // hips
    [0, 0.1, 0], // spine
    [0, 0.19 * t, 0], // chest
    [0, 0.2 * t, 0], // neck
    [0, 0.06, 0], // head
    [0, 0.15 * b.head, -hr * 0.84], // eyes
    [0, 0.2 * b.head, 0.08], // hair
    [-0.2 * sh * b.width ** 0.5, 0.15 * t, 0], [0, -0.26 * arm, 0], [0, -0.24 * arm, 0], // left arm
    [0.2 * sh * b.width ** 0.5, 0.15 * t, 0], [0, -0.26 * arm, 0], [0, -0.24 * arm, 0], // right arm
    [-0.1 * hipW * b.width ** 0.7, -0.03, 0], [0, -thigh, 0], [0, -shin, 0], // left leg
    [0.1 * hipW * b.width ** 0.7, -0.03, 0], [0, -thigh, 0], [0, -shin, 0], // right leg
    spec.variant === 'imp' ? [0, -0.28 * t, 0.1] : [0, 0.17 * t, 0.13 * b.width], // cape (imp: tail root)
    spec.variant === 'imp' ? [0, -0.05, 0.25] : [0, -0.45, 0.03], // cape2
    [0, -0.075, 0], // wpn (right palm)
    [0, -0.075, 0], // wpnL (left palm)
    [-0.075 * b.limb, -0.13 * arm, 0], // shd (outside of the left forearm)
    [0, nock, 0], // nock
    [0, 0, 0], // arrow
    [-0.06, 0.12 * t, 0.12 * b.width], [0.06, 0.12 * t, 0.12 * b.width], // wings
  ];
  const defs = off.map((o, i) => [Object.keys(HB)[i], PARENT[i], o[0], o[1], o[2]]);
  return { defs, hipY, thigh, shin, hr, height: hipY + 0.1 + 0.39 * t + 0.06 + 0.15 * b.head + hr * 1.05 };
}
export function createHumanoidBones(layout) { return makeBones(layout.defs); }

// ---------------------------------------------------------------------------------------------
// Look normalisation
// ---------------------------------------------------------------------------------------------
const HAIRS = ['short', 'long', 'braid', 'bun', 'bald', 'tonsure', 'slick', 'mohawk', 'ponytail'];
const HATS = ['cap', 'wide', 'straw', 'beanie', 'tricorn', 'feathered-hat', 'helmet-lamp', 'witch', 'bell', 'crown'];

// outfit: { head, body, legs, hands, feet, cape, neck, weapon, shield, ammo } each { kind, tint, id?, face? }
export function normaliseLook(look = {}, outfit = {}, variant = 'human') {
  const v = VARIANTS[variant] ? variant : 'human';
  const female = look.body === 'female';
  const buildName = BUILDS[look.build] ? look.build : 'normal';
  const b = { ...BUILDS[buildName], ...VARIANTS[v] };
  if (female && v === 'human') { b.limb *= 0.9; b.head *= 0.97; }
  const old = buildName === 'old';
  const hair = HAIRS.includes(look.hair) ? look.hair : (female ? 'long' : 'short');
  const spec = {
    variant: v, female, buildName, b, old,
    skin: hexOf(look.skin || '#e0b48a'),
    hair, hairColor: hexOf(look.hairColor || (old ? '#d8d8d8' : '#4a3020')),
    beard: ['short', 'full', 'long', 'stubble', 'moustache'].includes(look.beard) ? look.beard : null,
    top: hexOf(look.top || '#7a5a3a'), bottom: hexOf(look.bottom || '#4a3a2a'), boots: hexOf(look.boots || '#3a2a1a'),
    hat: HATS.includes(look.hat) ? look.hat : null,
    hood: look.hood ? hexOf(look.hood === true ? '#3f7f3a' : look.hood) : null,
    cape: look.cape ? hexOf(look.cape === true ? '#8a1a1a' : look.cape) : null,
    apron: look.apron ? hexOf(look.apron === true ? '#d8cbb0' : look.apron) : null,
    robe: !!look.robe,
    sleeves: look.sleeves || (look.apron && buildName === 'stout' && !female ? 'short' : 'long'),
    eyes: look.eyes ? hexOf(look.eyes) : null,
    glow: look.glow ? hexOf(look.glow) : null,
    metal: look.metal ? hexOf(look.metal) : null,
    tabard: look.tabard ? hexOf(look.tabard) : null,
    scarf: look.scarf ? hexOf(look.scarf) : null,
    outfit: { ...outfit },
    bow: null,
  };
  // NPC conveniences: look.staff (walking staff), look.weapon (kind).
  if (look.staff && !spec.outfit.weapon) spec.outfit.weapon = { kind: 'walking-staff', tint: null };
  if (look.weapon && !spec.outfit.weapon) {
    spec.outfit.weapon = { kind: look.weapon, tint: look.weaponTint || (look.weapon.includes('bow') ? 'yew' : 'iron') };
    if (look.weapon.includes('bow') && !spec.outfit.ammo) spec.outfit.ammo = { kind: 'quiver', tint: 'iron' };
  }
  if (look.shield && !spec.outfit.shield) spec.outfit.shield = { kind: look.shield === true ? 'kiteshield' : look.shield, tint: look.shieldTint || 'iron' };
  const w = spec.outfit.weapon;
  if (w && (w.kind === 'shortbow' || w.kind === 'longbow')) {
    const bp = bowParts(w.kind, w.tint);
    spec.bow = { kind: w.kind, tint: w.tint, nockY: bp.nock[2] };
  }
  spec.key = JSON.stringify([v, female, buildName, spec.skin, hair, spec.hairColor, spec.beard, spec.top, spec.bottom, spec.boots,
    spec.hat, spec.hood, spec.cape, spec.apron, spec.robe, spec.sleeves, spec.eyes, spec.glow, spec.metal, spec.tabard, spec.scarf, spec.outfit]);
  return spec;
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------
function headGeometry(r, k = {}) {
  const g = new THREE.SphereGeometry(r, 14, 11);
  const jaw = k.jaw ?? 1, chin = k.chin ?? 0.24;
  return deform(g, (x, y, z) => {
    const ny = y / r;
    if (ny < 0) {
      const t = Math.pow(-ny, 1.35);
      x *= 1 - chin * t * (2 - jaw);
      z *= 1 - 0.08 * t;
      if (z < 0) z -= 0.014 * t * (1 - Math.abs(x) / r);
    } else x *= 1 - 0.04 * ny;
    if (z < 0) z *= 0.93; else z *= 1.06;
    return [x * 0.95, y * 1.04, z];
  });
}
// Front surface z of the head at local (x, y) relative to the head centre.
function faceZ(r, x, y) {
  const xs = x / 0.95, ys = y / 1.04;
  return -Math.sqrt(Math.max(0, r * r - xs * xs - ys * ys)) * 0.93;
}
function flipFaces(g) {
  const idx = g.index;
  if (idx) {
    const a = idx.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    idx.needsUpdate = true;
  }
  return g;
}

export function buildHumanoid(spec) {
  const layout = layoutFor(spec);
  const bones = createHumanoidBones(layout);
  const B = new Builder(bones, { aoTop: layout.height * 0.85, aoBottom: 0.02, aoMin: 0.78 });
  const ctx = makeCtx(spec, layout, bones, B);
  switch (spec.variant) {
    case 'goblin': buildGoblin(ctx); break;
    case 'troll': buildTroll(ctx); break;
    case 'imp': buildImp(ctx); break;
    case 'skeleton': buildSkeleton(ctx); break;
    case 'golem': buildGolem(ctx); break;
    default: buildHuman(ctx);
  }
  buildHeld(ctx);
  const geo = B.build();
  return { geo, layout };
}

function makeCtx(spec, L, bones, B) {
  const b = spec.b;
  const W = b.width, Lk = b.limb, hr = L.hr;
  const yHips = L.hipY, ySpine = yHips + 0.1, yChest = ySpine + 0.19 * b.torso, yNeck = yChest + 0.2 * b.torso;
  const headC = [0, 0.15 * b.head, -0.004];
  const o = spec.outfit;
  return {
    spec, L, bones, B, b, W, Lk, hr, yHips, ySpine, yChest, yNeck, headC, o,
    // Torso weights: hips -> spine -> chest.
    torsoW: (x, y) => {
      const wHip = 1 - smooth01(yHips + 0.0, yHips + 0.1, y);
      const wChest = smooth01(ySpine + 0.06, ySpine + 0.24 * b.torso, y);
      return [[HB.hips, wHip], [HB.spine, Math.max(0, 1 - wHip - wChest)], [HB.chest, wChest]];
    },
    // Skirt weights: top follows the hips, lower part dragged by the nearest thigh.
    skirtW: (topY, H, rHem, k = 0.75) => (x, y) => {
      const f = Math.pow(clamp((topY - y) / H, 0, 1), 1.2) * k;
      const wl = clamp(0.5 - x / (rHem * 1.1), 0, 1);
      return [[HB.hips, 1 - f], [HB.thL, f * wl], [HB.thR, f * (1 - wl)]];
    },
  };
}

// ---- shared human-ish parts -----------------------------------------------------------------
function torsoProfile(ctx, extra = 0) {
  const { spec, W } = ctx;
  const bel = spec.b.belly;
  const H = ctx.yNeck - ctx.yHips + 0.03;
  const f = spec.female;
  const r = f
    ? [[0.152, 0], [0.133, 0.17], [0.128 + bel, 0.3], [0.15, 0.5], [0.166, 0.64], [0.178, 0.77], [0.17, 0.85], [0.12, 0.925], [0.062, 0.972], [0.025, 1]]
    : [[0.145, 0], [0.146, 0.15], [0.152 + bel, 0.32], [0.178 + bel * 0.4, 0.52], [0.198, 0.69], [0.206, 0.79], [0.192, 0.87], [0.13, 0.93], [0.064, 0.972], [0.025, 1]];
  return { prof: r.map(([rr, u]) => [rr * W + extra, u * H - 0.02]), H };
}

function addTorso(ctx, color, o = {}) {
  const { B } = ctx;
  const { prof, H } = torsoProfile(ctx, o.extra || 0);
  const g = lathe(prof, 14);
  if (ctx.spec.female && ctx.spec.variant === 'human') {
    // Soft bust: push the front of the chest forward (one smooth ridge, not two balls).
    const W = ctx.W;
    deform(g, (x, y, z) => {
      const u = y / H;
      const k = smooth01(0.48, 0.62, u) * (1 - smooth01(0.7, 0.84, u));
      if (z < 0) z -= 0.05 * W * k * Math.max(0, 1 - (x / (0.17 * W)) ** 2) * (-z / (0.17 * W));
      return [x, y, z];
    });
  }
  B.add(g, HB.hips, color, { scale: [1, 1, o.zs || 0.74], weights: ctx.torsoW, colorFn: o.colorFn, shine: o.shine, glowFn: o.glowFn, flat: o.flat });
}

function addHead(ctx, o = {}) {
  const { B, spec, hr, headC } = ctx;
  const skin = o.skin || spec.skin;
  B.add(new THREE.CylinderGeometry(0.05 * (o.neck || 1), 0.058 * (o.neck || 1), 0.13, 8), HB.neck, skin, { at: [0, 0.045, 0.005] });
  B.add(headGeometry(hr, { jaw: o.jaw ?? (spec.female ? 0.9 : 1.08) }), HB.head, skin, { at: headC });
  // Ears.
  if (!o.noEars) {
    for (const sx of [-1, 1]) B.add(sphere(0.034, 6, 4), HB.head, skin, { at: [sx * hr * 0.93, headC[1] - 0.008, headC[2] + 0.014], scale: [0.55, 1.25, 0.85] });
  }
  // Nose (a touch large for readability).
  const nose = o.nose ?? 1;
  B.add(sphere(0.024 * nose, 6, 5), HB.head, shade(skin, 0.95), { at: [0, headC[1] - 0.03, headC[2] + faceZ(hr, 0, -0.03) - 0.006 * nose], scale: [0.9, 0.9, 1.25] });
  // Mouth.
  const lip = mix(skin, spec.female ? '#b0444a' : '#7a3a30', spec.female ? 0.5 : 0.35);
  B.add(sphere(0.022, 6, 3), HB.head, lip, { at: [0, headC[1] - 0.085, headC[2] + faceZ(hr, 0, -0.085) + 0.004], scale: [1.25, 0.32, 0.45] });
  // Brows (hair colour, slightly angled).
  const browY = 0.045;
  const browC = spec.hair === 'bald' && !spec.beard ? shade(skin, 0.6) : shade(spec.hairColor, 0.85);
  for (const sx of [-1, 1]) {
    const bx = sx * 0.064;
    B.add(box(0.06, spec.female ? 0.011 : 0.016, 0.016), HB.head, browC, {
      at: [bx, headC[1] + browY + (spec.old ? -0.004 : 0), headC[2] + faceZ(hr, bx, browY) + 0.003],
      rot: [0.15, sx * 0.28, sx * (spec.old ? -0.18 : 0.12)],
    });
  }
  addEyes(ctx, o.eyes || {});
  if (spec.female && spec.variant === 'human') {
    // Cheek blush.
    for (const sx of [-1, 1]) B.add(sphere(0.022, 6, 4), HB.head, mix(skin, '#e07a7a', 0.25), { at: [sx * 0.085, headC[1] - 0.04, headC[2] + faceZ(hr, sx * 0.085, -0.04) + 0.006], scale: [1, 0.6, 0.3] });
  }
}

function addEyes(ctx, o = {}) {
  const { B, hr, headC, spec } = ctx;
  const ez0 = (ex) => headC[2] + faceZ(hr, ex, -0.005) + hr * 0.84; // relative to the eyes bone (z = -hr*0.84)
  const sep = o.sep ?? 0.066, size = o.size ?? 1;
  for (const sx of [-1, 1]) {
    const ex = sx * sep;
    const ez = ez0(ex);
    if (o.glow) {
      B.add(sphere(0.022 * size, 8, 6), HB.eyes, o.glow, { at: [ex, 0, ez + 0.002], scale: [1.2, 0.8, 0.5], glow: 1, ao: false });
      continue;
    }
    const sclera = o.sclera || '#f2ede4';
    B.add(sphere(0.026 * size, 8, 6), HB.eyes, sclera, { at: [ex, 0, ez + 0.004], scale: [1.1, 1.25, 0.5], ao: false, shade: 1.02 });
    const iris = o.iris || spec.eyes || '#2a1c14';
    B.add(sphere(0.0165 * size, 6, 5), HB.eyes, iris, { at: [ex + sx * 0.002, -0.002, ez - 0.004], scale: [1, 1.2, 0.55], ao: false });
    B.add(sphere(0.0055, 4, 3), HB.eyes, '#ffffff', { at: [ex + 0.006, 0.008, ez - 0.01], ao: false, shine: 1 });
    if (spec.female && spec.variant === 'human') {
      B.add(box(0.05, 0.008, 0.012), HB.eyes, '#1a1210', { at: [ex + sx * 0.004, 0.024 * size, ez - 0.004], rot: [0.2, 0, sx * -0.18] });
    }
  }
}

function addArms(ctx, o = {}) {
  const { B, spec, Lk } = ctx;
  const sleeveC = o.sleeve || spec.top;
  const long = (o.sleeves || spec.sleeves) !== 'short';
  const skin = o.skin || spec.skin;
  const handC = o.hand || skin;
  const arm = spec.b.arm;
  for (const side of [-1, 1]) {
    const sh = side < 0 ? HB.shL : HB.shR, el = side < 0 ? HB.elL : HB.elR, ha = side < 0 ? HB.haL : HB.haR;
    // Deltoid + upper arm.
    B.add(sphere(0.062 * Lk, 8, 6), sh, long ? sleeveC : skin, { at: [-side * 0.01, -0.02, 0], scale: [1, 1.0, 0.92] });
    B.add(taper(0.062 * Lk, 0.052 * Lk, 0.26 * arm, 8, 2), sh, long ? sleeveC : skin);
    if (!long) B.add(lathe([[0.068 * Lk, -0.11 * arm], [0.071 * Lk, -0.09], [0.07 * Lk, 0.0], [0.05 * Lk, 0.05], [0.02, 0.07]], 8), sh, sleeveC, { at: [-side * 0.01, 0, 0] });
    // Forearm.
    B.add(taper(0.054 * Lk, 0.042 * Lk, 0.24 * arm, 8, 2), el, long ? sleeveC : skin);
    if (long) {
      if (o.bell) B.add(lathe([[0.1 * Lk, -0.24 * arm], [0.085 * Lk, -0.16 * arm], [0.058 * Lk, -0.04]], 9), el, sleeveC, { flat: false });
      else B.add(new THREE.TorusGeometry(0.045 * Lk, 0.014, 4, 9), el, shade(sleeveC, 0.7), { at: [0, -0.215 * arm, 0], rot: [Math.PI / 2, 0, 0] });
    }
    // Hand: chunky mitten + thumb.
    const hs = o.handScale || 1;
    B.add(sphere(0.055 * hs, 8, 6), ha, handC, { at: [0, -0.058 * hs, -0.004], scale: [0.85 * Math.min(1.3, Lk), 1.2, 0.72 * Math.min(1.3, Lk)] });
    B.add(sphere(0.024 * hs, 5, 4), ha, handC, { at: [-side * 0.006, -0.032 * hs, -0.04 * hs], scale: [0.85, 1.5, 0.85], rot: [0.5, 0, 0] });
    if (o.gloves) B.add(new THREE.TorusGeometry(0.05 * Lk, 0.018, 4, 9), el, o.gloves, { at: [0, -0.2 * arm, 0], rot: [Math.PI / 2, 0, 0] });
  }
}

function addLegs(ctx, o = {}) {
  const { B, spec, Lk, L } = ctx;
  const pants = o.pants || spec.bottom;
  const boots = o.boots || spec.boots;
  const shinPants = o.shinColor || pants;
  for (const side of [-1, 1]) {
    const th = side < 0 ? HB.thL : HB.thR, kn = side < 0 ? HB.knL : HB.knR, ft = side < 0 ? HB.ftL : HB.ftR;
    B.add(taper(0.102 * Lk, 0.076 * Lk, L.thigh, 9, 2), th, pants);
    B.add(taper(0.076 * Lk, 0.058 * Lk, L.shin, 8, 2), kn, shinPants);
    if (!o.barefoot) {
      // Boot shaft from mid-shin, folded cuff, foot and sole.
      const top = L.shin * (o.bootTop ?? 0.52);
      B.add(lathe([[0.062 * Lk, -L.shin - 0.01], [0.066 * Lk, -L.shin * 0.7], [0.07 * Lk, -top + 0.02], [0.074 * Lk, -top + 0.03]], 9), kn, boots);
      B.add(new THREE.TorusGeometry(0.072 * Lk, 0.016, 4, 10), kn, shade(boots, 1.18), { at: [0, -top + 0.035, 0], rot: [Math.PI / 2, 0, 0] });
      B.add(sphere(0.072, 8, 5), ft, boots, { at: [0, -0.03, -0.055], scale: [0.98 * Math.min(1.3, Lk), 0.64, 1.95] });
      B.add(box(0.12 * Math.min(1.3, Lk), 0.022, 0.27), ft, shade(boots, 0.45), { at: [0, -0.072, -0.06], flat: true });
    } else {
      const skin = o.skin || spec.skin;
      B.add(sphere(0.072, 8, 6), ft, skin, { at: [0, -0.035, -0.06], scale: [1.05 * Math.min(1.3, Lk), 0.55, 2.1] });
      for (let i = -1; i <= 1; i++) B.add(cone(0.016, 0.05, 4), ft, o.claw || '#e8e0c8', { at: [i * 0.035, -0.05, -0.2], rot: [-Math.PI / 2, 0, 0] });
    }
  }
}

function addPelvis(ctx, color) {
  const { B, W } = ctx;
  B.add(lathe([[0.03, -0.18], [0.1, -0.165], [0.14 * W, -0.1], [0.148 * W, -0.02], [0.144 * W, 0.05]], 12), HB.hips, color, { scale: [1, 1, 0.8] });
}

function addSkirt(ctx, color, hemY, o = {}) {
  const { B, W, yHips } = ctx;
  const topY = yHips + (o.top ?? 0.06);
  const long = hemY < 0.4;
  const bel = ctx.spec.b.belly;
  const rTop = 0.148 * W + bel * 0.5 + (o.extra || 0), rHem = (long ? 0.21 : 0.2) * W + 0.025 + (o.flare || 0);
  const H = topY - hemY;
  const prof = [[rHem - 0.014, -H]];
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    prof.push([rHem + (rTop - rHem) * Math.pow(t, 1.3) + 0.012 * Math.sin(t * Math.PI), -H + t * H]);
  }
  prof.push([rTop - 0.03, 0.006]);
  const g = lathe(prof, 13);
  if (o.jag) {
    deform(g, (x, y, z) => {
      if (y < -H + 0.03) { const a = Math.atan2(z, x); return [x, y - (Math.sin(a * 7) > 0 ? 0.05 : 0), z]; }
      return [x, y, z];
    });
  }
  B.add(g, HB.hips, color, { at: [0, topY - yHips, 0], scale: [1, 1, 0.84], weights: ctx.skirtW(topY, H, rHem, long ? 0.82 : 0.72), flat: !!o.jag, colorFn: o.colorFn, shine: o.shine });
  if (o.inner !== false) {
    // Inner lining so the skirt reads from below.
    const gi = flipFaces(lathe(prof.map(([r, y]) => [r - 0.008, y]), 13));
    B.add(gi, HB.hips, shade(color, 0.55), { at: [0, topY - yHips, 0], scale: [1, 1, 0.84], weights: ctx.skirtW(topY, H, rHem, long ? 0.82 : 0.72) });
  }
}

function addBelt(ctx, color = '#3a2616', buckle = '#c9a24a', y = 0.07) {
  const { B, W, spec } = ctx;
  const r = 0.146 * W + spec.b.belly * 0.5 + 0.006;
  B.add(new THREE.TorusGeometry(r, 0.022, 4, 16), HB.hips, color, { at: [0, y, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.78, 1] });
  B.add(box(0.055, 0.045, 0.02), HB.hips, buckle, { at: [0, y, -r * 0.78 - 0.008], shine: 0.9 });
}

function addCollar(ctx, color) {
  ctx.B.add(new THREE.TorusGeometry(0.07, 0.018, 4, 12), HB.chest, color, { at: [0, 0.2 * ctx.b.torso, 0.0], rot: [Math.PI / 2 + 0.25, 0, 0], scale: [1.1, 1, 0.9] });
}

// ---- hair, beards, hats -----------------------------------------------------------------------
function addHair(ctx, covered) {
  const { B, spec, hr, headC } = ctx;
  const H = spec.hairColor;
  const [cx, cy, cz] = headC;
  const style = spec.hair;
  const cap = (k = 1.07, tilt = 0.32, cover = 0.56, o = {}) => B.add(new THREE.SphereGeometry(hr * k, 14, 8, 0, TAU, 0, Math.PI * cover), HB.head, H, {
    at: [cx, cy + 0.008, cz + 0.008], rot: [tilt, 0, 0], scale: [0.98, 1.05, 1.03], ...o,
  });
  if (style === 'bald') return;
  if (style === 'tonsure') {
    B.add(new THREE.TorusGeometry(hr * 0.9, 0.04, 6, 16), HB.head, H, { at: [cx, cy + 0.02, cz + 0.02], rot: [Math.PI / 2 + 0.25, 0, 0], scale: [1.02, 1.12, 1] });
    return;
  }
  if (style === 'slick') {
    cap(1.06, 0.4, 0.55, { shine: 0.55 });
    B.add(sphere(hr * 0.75, 10, 8), HB.head, H, { at: [cx, cy + 0.02, cz + hr * 0.45], scale: [1.1, 0.95, 0.9], shine: 0.55 });
    return;
  }
  cap(1.08, style === 'long' || style === 'braid' ? 0.26 : 0.34, style === 'long' ? 0.6 : 0.54);
  const hairR = hr * 1.07;
  const lock = (theta, phi, len, rad, sweep, lift) => {
    const sx = Math.sin(theta) * Math.sin(phi), sy = Math.cos(theta), sz = -Math.sin(theta) * Math.cos(phi);
    const dir = new THREE.Vector3(sx, sy + lift, sz + sweep).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const g = new THREE.ConeGeometry(rad, len, 6);
    g.scale(1.35, 1, 0.6);
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), phi);
    B.add(g, HB.head, H, {
      at: [cx + sx * hairR * 0.93 + dir.x * len * 0.32, cy + 0.008 + sy * hairR * 0.98 + dir.y * len * 0.32, cz + sz * hairR * 0.93 + dir.z * len * 0.32],
      quat: q.multiply(yaw),
    });
  };
  const spiky = style === 'short' || style === 'mohawk';
  if (!covered && spiky) {
    const tufts = [
      [0.5, -0.75, 0.12, 0.05, 1.25, -0.1], [0.42, -0.2, 0.135, 0.055, 1.25, -0.1], [0.44, 0.35, 0.13, 0.055, 1.25, -0.1],
      [0.52, 0.9, 0.115, 0.05, 1.25, -0.1], [0.2, 0.1, 0.12, 0.06, 1.2, -0.05], [0.8, -1.35, 0.1, 0.048, 1.0, -0.5],
      [0.8, 1.35, 0.1, 0.048, 1.0, -0.5], [0.85, 2.5, 0.1, 0.05, 0.6, -1.1], [0.85, -2.5, 0.1, 0.05, 0.6, -1.1], [0.7, 3.14, 0.11, 0.055, 0.7, -1.0],
    ];
    for (const t of tufts) lock(...t);
    // Fringe.
    for (let i = 0; i < 4; i++) {
      const t = i / 3 - 0.5;
      const ph = t * 1.2, th = 0.95 + Math.abs(t) * 0.2;
      const sx = Math.sin(th) * Math.sin(ph), sy = Math.cos(th), sz = -Math.sin(th) * Math.cos(ph);
      const dir = new THREE.Vector3(sx * 0.6 + 0.35, -0.85, -0.35).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      B.add(new THREE.ConeGeometry(0.036, 0.1, 5), HB.head, H, { at: [cx + sx * hairR * 1.02 + dir.x * 0.035, cy + sy * hairR * 1.05 + 0.03, cz + sz * hairR * 1.02 - 0.012], quat: q });
    }
  } else if (!covered) {
    // Smooth styles: swept bangs over the forehead and a parting line.
    B.add(new THREE.SphereGeometry(hr * 1.1, 14, 5, Math.PI * 1.1, Math.PI * 0.8, Math.PI * 0.16, Math.PI * 0.22), HB.head, H, { at: [cx, cy + 0.006, cz + 0.006], rot: [0.06, 0.18, 0], scale: [0.99, 1.05, 1.04] });
    B.add(box(0.012, 0.012, hr * 1.3), HB.head, shade(H, 0.6), { at: [hr * 0.18, cy + hr * 1.09, cz + hr * 0.1], rot: [0.3, 0, 0.17] });
  }
  // Side locks (longer curtains for long styles).
  const longish = style === 'long' || style === 'braid' || style === 'ponytail';
  for (const sx of [-1, 1]) {
    if (longish) B.add(new THREE.ConeGeometry(0.045, 0.24, 6), HB.head, H, { at: [sx * hr * 0.88, cy - 0.06, cz - 0.0], rot: [Math.PI - 0.08, 0, sx * 0.1], scale: [0.8, 1, 1.1] });
    else B.add(new THREE.ConeGeometry(0.034, 0.1, 5), HB.head, H, { at: [sx * hr * 0.9, cy + 0.0, cz + 0.03], rot: [Math.PI - 0.15, 0, sx * 0.12] });
  }
  if (style === 'bun' && !covered) {
    B.add(sphere(0.08, 10, 8), HB.head, H, { at: [0, cy + hr * 0.62, cz + hr * 0.92], scale: [1, 0.9, 0.9] });
    B.add(new THREE.TorusGeometry(0.055, 0.012, 4, 10), HB.head, shade(H, 0.7), { at: [0, cy + hr * 0.55, cz + hr * 0.8], rot: [0.9, 0, 0] });
  }
  if (style === 'long') {
    B.add(lathe([[0.02, -0.48], [0.1, -0.44], [0.14, -0.3], [0.158, -0.1], [0.16, 0.0], [0.12, 0.08]], 11), HB.hair, H, { at: [0, -0.02, 0.035], scale: [1.08, 1, 0.45] });
  }
  if (style === 'ponytail') {
    B.add(tube([[0, 0.02, 0.0], [0, -0.06, 0.06], [0, -0.22, 0.08], [0, -0.36, 0.06]], (t) => 0.045 * (1 - t * 0.6), 8, 6), HB.hair, H, {});
  }
  if (style === 'braid') {
    // Braid over the right shoulder (beads of hair + a tie).
    const pts = [[0.04, 0.0, 0.02], [0.1, -0.08, 0.0], [0.14, -0.18, -0.06], [0.15, -0.3, -0.1], [0.15, -0.42, -0.11]];
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const p = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))).getPointAt(t);
      B.add(sphere(0.042 * (1 - t * 0.35), 7, 5), HB.hair, H, { at: [p.x, p.y, p.z], scale: [1, 1.25, 1] });
    }
    B.add(new THREE.TorusGeometry(0.026, 0.01, 4, 8), HB.hair, '#c0392b', { at: [0.15, -0.44, -0.11], rot: [Math.PI / 2, 0, 0] });
    B.add(lathe([[0.02, -0.18], [0.1, -0.14], [0.14, -0.04], [0.12, 0.06]], 9), HB.hair, H, { at: [0, -0.02, 0.04], scale: [1.08, 1, 0.42] });
  }
}

function addBeard(ctx) {
  const { B, spec, hr, headC } = ctx;
  const H = spec.hairColor;
  const [cx, cy, cz] = headC;
  const st = spec.beard;
  if (!st) return;
  // Moustache.
  for (const sx of [-1, 1]) B.add(new THREE.ConeGeometry(0.02, 0.07, 5), HB.head, H, { at: [sx * 0.03, cy - 0.06, cz + faceZ(hr, sx * 0.03, -0.06) - 0.006], rot: [0, 0, sx * (Math.PI / 2 + 0.5)] });
  if (st === 'moustache') return;
  if (st === 'stubble') {
    B.add(new THREE.SphereGeometry(hr * 1.004, 12, 6, Math.PI * 1.15, Math.PI * 0.7, Math.PI * 0.62, Math.PI * 0.3), HB.head, mix(H, spec.skin, 0.45), { at: [cx, cy, cz], scale: [0.95, 1.04, 0.93] });
    return;
  }
  const len = st === 'long' ? 0.3 : st === 'full' ? 0.15 : 0.08;
  const wide = st === 'short' ? 0.8 : 1;
  // Chin and jaw mass.
  B.add(new THREE.SphereGeometry(hr * 1.02, 12, 8, Math.PI * 1.1, Math.PI * 0.8, Math.PI * 0.55, Math.PI * 0.4), HB.head, H, { at: [cx, cy, cz], scale: [0.98 * wide, 1.04, 0.95] });
  // Hanging part.
  B.add(lathe([[0.012, -len], [0.05 * wide, -len * 0.8], [0.085 * wide, -len * 0.35], [0.09 * wide, 0], [0.07 * wide, 0.04]], 9), HB.head, H, {
    at: [0, cy - hr * 0.62, cz - hr * 0.55], rot: [-0.18, 0, 0], scale: [1, 1, 0.6], flat: st === 'long',
  });
}

function addHat(ctx, hat) {
  const { B, spec, hr, headC } = ctx;
  const [cx, cy, cz] = headC;
  const top = cy + hr * 0.42;
  const at = (dy = 0, dz = 0.01) => [cx, top + dy, cz + dz];
  const strawC = '#d8b867';
  switch (hat) {
    case 'cap': {
      const c = shade(spec.top, 0.75);
      B.add(new THREE.SphereGeometry(hr * 1.13, 14, 7, 0, TAU, 0, Math.PI * 0.46), HB.head, c, { at: at(-0.05, 0.0), scale: [1.02, 0.78, 1.08], rot: [-0.18, 0, 0] });
      B.add(new THREE.TorusGeometry(hr * 1.08, 0.016, 4, 16), HB.head, shade(c, 0.75), { at: at(-0.045), rot: [Math.PI / 2 - 0.18, 0, 0], scale: [1, 1.04, 1] });
      B.add(new THREE.CylinderGeometry(hr * 0.78, hr * 0.78, 0.02, 12, 1, false, Math.PI / 2, Math.PI), HB.head, shade(c, 0.6), { at: at(-0.05, -hr * 0.62), rot: [-0.22, 0, 0], scale: [1, 1, 0.8] });
      break;
    }
    case 'wide': {
      const c = '#6a5a3a';
      B.add(lathe([[hr * 0.95, 0], [hr * 0.9, 0.12], [hr * 0.6, 0.17], [0.01, 0.175]], 12), HB.head, c, { at: at(-0.04), rot: [-0.08, 0, 0] });
      B.add(lathe([[hr * 2.05, -0.05], [hr * 1.7, -0.01], [hr * 0.95, 0.01]], 14), HB.head, shade(c, 0.9), { at: at(-0.035), rot: [-0.08, 0, 0] });
      B.add(flipFaces(lathe([[hr * 2.04, -0.056], [hr * 1.69, -0.016], [hr * 0.94, 0.004]], 14)), HB.head, shade(c, 0.6), { at: at(-0.035), rot: [-0.08, 0, 0] });
      B.add(new THREE.TorusGeometry(hr * 0.94, 0.014, 4, 14), HB.head, '#3a2a1a', { at: at(-0.015), rot: [Math.PI / 2 - 0.08, 0, 0] });
      break;
    }
    case 'straw': {
      B.add(lathe([[hr * 0.95, 0], [hr * 0.92, 0.1], [hr * 0.7, 0.15], [0.01, 0.16]], 12), HB.head, strawC, { at: at(-0.04), rot: [-0.06, 0, 0] });
      B.add(lathe([[hr * 2.2, -0.035], [hr * 1.6, -0.005], [hr * 0.95, 0.01]], 16), HB.head, shade(strawC, 0.95), { at: at(-0.035), rot: [-0.06, 0, 0] });
      B.add(flipFaces(lathe([[hr * 2.19, -0.04], [hr * 1.59, -0.01], [hr * 0.94, 0.004]], 16)), HB.head, shade(strawC, 0.7), { at: at(-0.035), rot: [-0.06, 0, 0] });
      B.add(new THREE.TorusGeometry(hr * 0.95, 0.018, 4, 14), HB.head, '#b8322a', { at: at(-0.01), rot: [Math.PI / 2 - 0.06, 0, 0] });
      break;
    }
    case 'beanie': {
      const c = '#8a3a2a';
      B.add(new THREE.SphereGeometry(hr * 1.12, 14, 8, 0, TAU, 0, Math.PI * 0.5), HB.head, c, { at: at(-0.06), scale: [1, 1.05, 1.03], rot: [-0.1, 0, 0] });
      B.add(new THREE.TorusGeometry(hr * 1.09, 0.03, 5, 16), HB.head, shade(c, 0.8), { at: at(-0.055), rot: [Math.PI / 2 - 0.1, 0, 0] });
      break;
    }
    case 'tricorn': {
      const c = '#1e1e24';
      B.add(lathe([[hr * 0.95, 0], [hr * 0.9, 0.1], [hr * 0.55, 0.14], [0.01, 0.145]], 12), HB.head, c, { at: at(-0.03) });
      const brim = lathe([[hr * 1.75, 0.09], [hr * 1.55, 0.02], [hr * 0.95, -0.005]], 3, Math.PI / 6);
      B.add(brim, HB.head, c, { at: at(-0.03) });
      B.add(flipFaces(lathe([[hr * 1.74, 0.084], [hr * 1.54, 0.014], [hr * 0.94, -0.011]], 3, Math.PI / 6)), HB.head, '#2a2a30', { at: at(-0.03) });
      B.add(new THREE.TorusGeometry(hr * 1.62, 0.01, 3, 3, TAU), HB.head, '#c9a24a', { at: at(0.035), rot: [Math.PI / 2, 0, Math.PI / 6 + Math.PI / 2], shine: 0.8 });
      break;
    }
    case 'feathered-hat': {
      const c = shade(spec.top, 0.55);
      B.add(lathe([[hr * 0.95, 0], [hr * 0.92, 0.12], [hr * 0.7, 0.17], [0.01, 0.175]], 12), HB.head, c, { at: at(-0.04), rot: [-0.1, 0, 0.08] });
      B.add(lathe([[hr * 1.9, 0.02], [hr * 1.6, -0.01], [hr * 0.95, 0.01]], 14), HB.head, c, { at: at(-0.035), rot: [-0.1, 0, 0.08] });
      B.add(flipFaces(lathe([[hr * 1.89, 0.014], [hr * 1.59, -0.016], [hr * 0.94, 0.004]], 14)), HB.head, shade(c, 0.6), { at: at(-0.035), rot: [-0.1, 0, 0.08] });
      B.add(new THREE.TorusGeometry(hr * 0.95, 0.016, 4, 14), HB.head, '#c9a24a', { at: at(-0.015), rot: [Math.PI / 2 - 0.1, 0, 0.08], shine: 0.9 });
      // Plume sweeping back over the brim.
      B.add(tube([[-hr * 0.7, 0.08, -0.02], [-hr * 0.95, 0.2, 0.05], [-hr * 0.9, 0.24, 0.2], [-hr * 0.6, 0.16, 0.34]], (t) => 0.03 * Math.sin(Math.PI * (0.15 + 0.85 * t)) + 0.004, 10, 5), HB.head, '#f2efe6', { at: at(-0.01) });
      B.add(tube([[-hr * 0.75, 0.07, 0.0], [-hr * 1.05, 0.15, 0.08], [-hr * 1.0, 0.16, 0.22]], (t) => 0.02 * Math.sin(Math.PI * (0.15 + 0.85 * t)) + 0.003, 8, 5), HB.head, '#c0392b', { at: at(-0.01) });
      break;
    }
    case 'helmet-lamp': {
      const c = '#c8a23a';
      B.add(new THREE.SphereGeometry(hr * 1.15, 14, 8, 0, TAU, 0, Math.PI * 0.5), HB.head, c, { at: at(-0.06), scale: [1, 0.95, 1.05], shine: 0.5 });
      B.add(lathe([[hr * 1.45, -0.01], [hr * 1.14, 0.005]], 14), HB.head, shade(c, 0.85), { at: at(-0.06), shine: 0.4 });
      B.add(cyl(0.035, 0.04, 0.05, 10), HB.head, '#4a4a4a', { at: at(0.04, -hr * 1.0), rot: [Math.PI / 2 - 0.3, 0, 0], shine: 0.6 });
      B.add(sphere(0.03, 8, 6), HB.head, '#fff2b0', { at: at(0.035, -hr * 1.08), scale: [1, 1, 0.5], glow: 1, ao: false });
      break;
    }
    case 'witch': {
      const c = '#2a2236';
      B.add(lathe([[hr * 2.0, -0.02], [hr * 1.5, 0.0], [hr * 0.95, 0.01]], 14), HB.head, c, { at: at(-0.04), rot: [-0.12, 0, 0] });
      B.add(flipFaces(lathe([[hr * 1.99, -0.026], [hr * 1.49, -0.006], [hr * 0.94, 0.004]], 14)), HB.head, shade(c, 0.6), { at: at(-0.04), rot: [-0.12, 0, 0] });
      // Bent cone: tube with a tapering radius.
      B.add(tube([[0, 0.0, 0], [0, 0.18, 0.02], [0.02, 0.34, 0.08], [0.1, 0.42, 0.2]], (t) => hr * 0.95 * (1 - t) + 0.008, 12, 10), HB.head, c, { at: at(-0.04), rot: [-0.12, 0, 0] });
      B.add(new THREE.TorusGeometry(hr * 0.93, 0.02, 4, 14), HB.head, '#6a4a8a', { at: at(-0.01), rot: [Math.PI / 2 - 0.12, 0, 0] });
      B.add(box(0.05, 0.04, 0.01), HB.head, '#c9a24a', { at: at(-0.01, -hr * 0.95), shine: 0.9 });
      break;
    }
    case 'bell': {
      const c = '#c99a3a';
      const k = 0.82;
      B.add(lathe([[hr * 1.18 * k, 0], [hr * 1.1 * k, 0.03], [hr * 0.86 * k, 0.1], [hr * 0.78 * k, 0.22], [hr * 0.74 * k, 0.3], [hr * 0.5 * k, 0.35], [0.02, 0.36]], 14), HB.head, c, { at: at(-0.02), rot: [-0.1, 0, -0.22], shine: 1 });
      B.add(new THREE.TorusGeometry(hr * 1.14 * k, 0.014, 4, 16), HB.head, shade(c, 0.75), { at: at(-0.015), rot: [Math.PI / 2 - 0.1, 0.22, 0], shine: 1 });
      B.add(new THREE.TorusGeometry(0.032, 0.011, 4, 8), HB.head, shade(c, 0.7), { at: [cx - 0.075, top + 0.34, cz + 0.03], rot: [0, 0, -0.22], shine: 1 });
      break;
    }
    case 'crown': {
      const c = '#e0b040';
      B.add(cyl(hr * 0.95, hr * 0.92, 0.08, 10, true), HB.head, c, { at: at(0.0), shine: 1 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; B.add(cone(0.025, 0.07, 4), HB.head, c, { at: [cx + Math.cos(a) * hr * 0.93, top + 0.07, cz + Math.sin(a) * hr * 0.93], shine: 1 }); }
      break;
    }
    default: break;
  }
}

function addHood(ctx, color, tip = true) {
  const { B, hr, headC, b } = ctx;
  const [cx, cy, cz] = headC;
  const open = 0.85;
  const shell = (r, c, flip) => {
    const g = new THREE.SphereGeometry(r, 14, 10, Math.PI * 1.5 + open, TAU - open * 2, 0, Math.PI * 0.78);
    if (flip) flipFaces(g);
    B.add(g, HB.head, c, { at: [cx, cy + 0.01, cz + 0.012], scale: [1.0, 1.08, 1.08] });
  };
  shell(hr * 1.2, color, false);
  shell(hr * 1.17, shade(color, 0.42), true);
  // Rim around the face opening.
  B.add(new THREE.TorusGeometry(hr * 0.92, 0.022, 5, 14, Math.PI * 1.25), HB.head, shade(color, 0.85), { at: [cx, cy + 0.01, cz - hr * 0.6], rot: [0.1, 0, -Math.PI * 0.125 - Math.PI / 2 + Math.PI], scale: [1, 1.18, 1] });
  if (tip) B.add(cone(0.06, 0.26, 7), HB.head, color, { at: [cx, cy + hr * 0.55, cz + hr * 1.12], rot: [Math.PI / 2 + 0.55, 0, 0], scale: [1, 1, 0.6] });
  // Shoulder drape (follows chest, top blended to the neck).
  B.add(lathe([[0.26 * b.width, -0.12], [0.25 * b.width, -0.08], [0.19 * b.width, 0.0], [0.11, 0.07], [0.085, 0.12]], 14), HB.chest, color, {
    at: [0, 0.2 * b.torso, 0.01], scale: [1, 1, 0.8],
    weights: (x, y) => { const k = smooth01(ctx.yNeck - 0.02, ctx.yNeck + 0.08, y); return [[HB.chest, 1 - k * 0.6], [HB.neck, k * 0.6]]; },
  });
}

function addCape(ctx, color, o = {}) {
  const { B, b, L, yChest } = ctx;
  const capeTopY = yChest + 0.17 * b.torso;
  const bottomY = o.length ?? (L.hipY - L.thigh * 0.85);
  const h = capeTopY - bottomY;
  const mk = (r0, r1, c, flip) => {
    const g = new THREE.CylinderGeometry(r0, r1, h, 12, 4, true, -1.25, 2.5);
    g.translate(0, -h / 2, 0);
    if (flip) flipFaces(g);
    B.add(g, HB.chest, c, {
      at: [0, 0.17 * b.torso, 0.0], scale: [1.18 * b.width, 1, 1.05 + (b.belly || 0) * 2],
      weights: (x, y) => { const f = smooth01(capeTopY - 0.15, bottomY, y); return [[HB.cape, 1 - f], [HB.cape2, f]]; },
    });
  };
  mk(0.17 * b.width + 0.02, 0.3 * b.width, color, false);
  mk(0.17 * b.width + 0.012, 0.3 * b.width - 0.008, shade(color, 0.5), true);
  // Collar over the shoulders + clasp.
  B.add(new THREE.TorusGeometry(0.16 * b.width, 0.03, 5, 14, Math.PI * 1.3), HB.chest, color, { at: [0, 0.19 * b.torso, 0.02], rot: [Math.PI / 2 + 0.2, 0, Math.PI * 1.35 - Math.PI / 2 + Math.PI], scale: [1.05, 0.85, 1] });
  B.add(sphere(0.028, 8, 6), HB.chest, o.clasp || '#d8b04a', { at: [0, 0.16 * b.torso, -0.14 * b.width], shine: 1 });
}

function addApron(ctx, color) {
  const { B, b, W, yHips, yChest } = ctx;
  const bel = b.belly;
  const top = yChest + 0.08, bottom = ctx.L.hipY - ctx.L.thigh * 0.85;
  const h = top - bottom;
  const g = new THREE.CylinderGeometry(0.2 * W + bel * 0.7, 0.24 * W + bel * 0.5, h, 8, 5, true, Math.PI - 0.62, 1.24);
  g.translate(0, -h / 2, 0);
  B.add(g, HB.hips, color, {
    at: [0, top - yHips, 0.0], scale: [1, 1, 0.82],
    weights: (x, y) => {
      if (y > yHips + 0.1) return ctx.torsoW(x, y);
      const f = smooth01(yHips, bottom, y) * 0.75;
      const wl = clamp(0.5 - x / 0.3, 0, 1);
      return [[HB.hips, 1 - f], [HB.thL, f * wl], [HB.thR, f * (1 - wl)]];
    },
  });
  // Strap around the neck and waist tie.
  B.add(new THREE.TorusGeometry(0.09, 0.012, 3, 10, Math.PI), HB.chest, shade(color, 0.85), { at: [0, 0.12, -0.08], rot: [0.5, 0, 0] });
  B.add(new THREE.TorusGeometry(0.155 * W + bel * 0.5, 0.014, 3, 14), HB.hips, shade(color, 0.85), { at: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.8, 1] });
}

// ---- armour ---------------------------------------------------------------------------------
function addHelm(ctx, T) {
  const { B, hr, headC } = ctx;
  const [cx, cy, cz] = headC;
  const c = T.color, c2 = mix(T.color, '#000000', 0.25);
  B.add(new THREE.SphereGeometry(hr * 1.16, 14, 9, 0, TAU, 0, Math.PI * 0.56), HB.head, c, { at: [cx, cy + 0.01, cz + 0.01], scale: [1, 1.08, 1.06], shine: 1 });
  B.add(new THREE.TorusGeometry(hr * 1.13, 0.018, 4, 16), HB.head, c2, { at: [cx, cy - 0.005, cz + 0.01], rot: [Math.PI / 2, 0, 0], scale: [1, 1.06, 1], shine: 1 });
  // Crest ridge.
  B.add(new THREE.TorusGeometry(hr * 1.17, 0.018, 4, 12, Math.PI), HB.head, c2, { at: [cx, cy + 0.0, cz + 0.01], rot: [0, Math.PI / 2, 0], scale: [1, 1.1, 1.06], shine: 1 });
  // Nasal guard and cheek plates.
  B.add(box(0.026, 0.11, 0.02), HB.head, c, { at: [0, cy - 0.03, cz - hr * 1.1], shine: 1 });
  for (const sx of [-1, 1]) {
    B.add(new THREE.SphereGeometry(hr * 1.14, 6, 6, sx > 0 ? Math.PI * 0.7 : Math.PI * 1.05, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.28), HB.head, c, { at: [cx, cy, cz + 0.01], scale: [1, 1.08, 1.06], shine: 1 });
  }
  // Back neck guard.
  B.add(new THREE.SphereGeometry(hr * 1.15, 10, 4, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.5, Math.PI * 0.3), HB.head, c, { at: [cx, cy, cz + 0.02], scale: [1, 1.08, 1.06], shine: 1 });
}

function addChestplate(ctx, T) {
  const { B, b, W } = ctx;
  const c = T.color, c2 = T.color2, hi = mix(T.color, '#ffffff', 0.15);
  addTorso(ctx, c, { extra: 0.022, zs: 0.8, shine: 1, colorFn: ridgeColor(c, hi) });
  // Pauldrons.
  for (const side of [-1, 1]) {
    const sh = side < 0 ? HB.shL : HB.shR;
    B.add(new THREE.SphereGeometry(0.105 * Math.max(1, b.limb * 0.9), 10, 6, 0, TAU, 0, Math.PI * 0.55), sh, c, { at: [side * 0.01, 0.02, 0], rot: [0, 0, side * -0.35], scale: [1.1, 0.9, 1.05], shine: 1 });
    B.add(new THREE.TorusGeometry(0.1 * Math.max(1, b.limb * 0.9), 0.012, 4, 12), sh, c2, { at: [side * 0.01, 0.0, 0], rot: [Math.PI / 2, side * 0.35, 0], shine: 1 });
  }
  // Gorget.
  B.add(new THREE.TorusGeometry(0.085, 0.025, 5, 12), HB.chest, c2, { at: [0, 0.2 * b.torso - 0.01, 0.0], rot: [Math.PI / 2 + 0.2, 0, 0], shine: 1 });
  // Faulds (short plate skirt).
  addSkirt(ctx, c, ctx.yHips - 0.17, { extra: 0.02, shine: 1, inner: false, colorFn: bandColor(c, c2, ctx.yHips) });
  addBelt(ctx, '#3a2616', c2, 0.06);
}
function ridgeColor(c, hi) {
  const a = C(c), b = C(hi), t = new THREE.Color();
  return (x) => (Math.abs(x) < 0.025 ? t.copy(b) : t.copy(a));
}
function bandColor(c, c2, y0) {
  const a = C(c), b = C(c2), t = new THREE.Color();
  return (x, y) => (Math.sin((y0 - y) * 55) > 0.7 ? t.copy(b) : t.copy(a));
}

function addPlatelegs(ctx, T) {
  const { B, b, L } = ctx;
  const c = T.color, c2 = T.color2;
  for (const side of [-1, 1]) {
    const th = side < 0 ? HB.thL : HB.thR, kn = side < 0 ? HB.knL : HB.knR;
    B.add(taper(0.106 * b.limb, 0.08 * b.limb, L.thigh * 0.92, 9, 2), th, c, { shine: 1, at: [0, -0.02, 0] });
    B.add(sphere(0.07 * b.limb, 8, 6), kn, mix(c, '#ffffff', 0.12), { at: [0, 0.0, -0.035], scale: [1, 0.9, 0.8], shine: 1 });
    B.add(taper(0.078 * b.limb, 0.062 * b.limb, L.shin * 0.62, 8, 2), kn, c, { at: [0, -0.04, 0], shine: 1 });
    B.add(new THREE.TorusGeometry(0.08 * b.limb, 0.012, 4, 10), kn, c2, { at: [0, -0.04, 0], rot: [Math.PI / 2, 0, 0], shine: 1 });
  }
}

function addLeatherBody(ctx, hard) {
  const { B, b } = ctx;
  const c = hard ? '#7a5034' : '#9a6a44', seam = '#4a2e1a';
  addTorso(ctx, c, { extra: 0.014, zs: 0.78, colorFn: seamColor(c, seam) });
  for (const side of [-1, 1]) {
    const sh = side < 0 ? HB.shL : HB.shR;
    B.add(new THREE.SphereGeometry(0.09 * Math.max(1, b.limb * 0.9), 9, 5, 0, TAU, 0, Math.PI * 0.5), sh, shade(c, 0.9), { at: [side * 0.01, 0.01, 0], rot: [0, 0, side * -0.35], scale: [1.1, 0.8, 1.05] });
  }
  if (hard) {
    for (let i = 0; i < 10; i++) {
      const a = -1.2 + (i % 5) * 0.6, y = ctx.yHips + 0.22 + Math.floor(i / 5) * 0.14;
      const r = 0.19 * b.width;
      B.add(sphere(0.012, 4, 3), HB.hips, '#c9b07a', { at: [Math.sin(a) * r, y - ctx.yHips, -Math.cos(a) * r * 0.8], shine: 1, weights: ctx.torsoW });
    }
  }
  addSkirt(ctx, shade(c, 0.92), ctx.yHips - 0.16, { extra: 0.014, jag: false, inner: false });
  addBelt(ctx, seam, '#b89a5a', 0.07);
}
function seamColor(c, seam) {
  const a = C(c), s = C(seam), t = new THREE.Color();
  return (x, y) => (Math.abs(x) < 0.008 || Math.abs(Math.sin(y * 30)) < 0.06 ? t.copy(s) : t.copy(a));
}

function addGoblinMail(ctx) {
  const { B } = ctx;
  const c = '#6b7f3a', rust = '#7a5a2a', t = new THREE.Color();
  const R = rng(7);
  addTorso(ctx, c, { extra: 0.016, zs: 0.78, shine: 0.4, flat: true, colorFn: (x, y, z) => t.copy(Math.sin(x * 40 + y * 33) * Math.sin(z * 37 - y * 21) > 0.35 ? C(rust) : C(c)).multiplyScalar(0.85 + R() * 0.3) });
  addSkirt(ctx, shade(c, 0.85), ctx.yHips - 0.14, { extra: 0.016, jag: true, inner: false, shine: 0.3 });
  addBelt(ctx, '#3a2616', '#8a8f95', 0.07);
}

function addWyrmscale(ctx) {
  const c = '#5d5a6a', ember = '#e8763a', t = new THREE.Color(), base = C(c), dark = shade(c, 0.7), hot = C(ember);
  const scaleCol = (x, y, z) => {
    const a = Math.atan2(x, -z) * 4.5, row = Math.floor(y * 26);
    const v = Math.sin(a + (row % 2) * Math.PI / 2 * 1.0) * Math.cos(y * 26 * Math.PI);
    return t.copy(v > 0.55 ? hot : v > 0 ? base : dark);
  };
  const glowFn = (x, y, z) => { const a = Math.atan2(x, -z) * 4.5, row = Math.floor(y * 26); return Math.sin(a + (row % 2) * Math.PI / 2) * Math.cos(y * 26 * Math.PI) > 0.55 ? 0.35 : 0; };
  addTorso(ctx, c, { extra: 0.02, zs: 0.8, shine: 0.35, colorFn: scaleCol, glowFn, flat: true });
  for (const side of [-1, 1]) {
    const sh = side < 0 ? HB.shL : HB.shR;
    for (let i = 0; i < 3; i++) ctx.B.add(cone(0.05 - i * 0.008, 0.12, 5), sh, i ? c : shade(c, 0.8), { at: [side * (0.03 + i * 0.012), 0.06 - i * 0.05, 0.02], rot: [0.3, 0, side * (-0.9 + i * 0.15)], shine: 0.4, flat: true });
  }
  addSkirt(ctx, shade(c, 0.85), ctx.yHips - 0.16, { extra: 0.02, jag: true, inner: false, shine: 0.3 });
  addBelt(ctx, '#2a2420', ember, 0.07);
}

function addCoat(ctx, color, trim) {
  const { B, b } = ctx;
  addTorso(ctx, color, { extra: 0.016, zs: 0.78, colorFn: (x, y, z) => (Math.abs(x) < 0.018 && z < 0 ? C(trim) : C(color)) });
  for (let i = 0; i < 4; i++) B.add(sphere(0.012, 5, 4), HB.hips, trim, { at: [0.03, 0.14 + i * 0.09 * b.torso, -0.155 * b.width], shine: 1, weights: ctx.torsoW });
  addSkirt(ctx, color, ctx.L.hipY - ctx.L.thigh * 1.05, { extra: 0.02, flare: 0.04 });
  addBelt(ctx, '#1a1214', trim, 0.07);
  // Cuffs.
  for (const el of [HB.elL, HB.elR]) B.add(new THREE.TorusGeometry(0.055 * b.limb, 0.02, 4, 9), el, trim, { at: [0, -0.2 * b.arm, 0], rot: [Math.PI / 2, 0, 0], shine: 0.8 });
}

function addTabard(ctx, color, metal) {
  const { B, b, W, yHips, yChest } = ctx;
  const top = yChest + 0.14, bottom = ctx.L.hipY - ctx.L.thigh * 0.7;
  const h = top - bottom;
  for (const back of [0, 1]) {
    const g = new THREE.CylinderGeometry(0.205 * W, 0.215 * W, h, 6, 4, true, back ? -0.5 : Math.PI - 0.5, 1.0);
    g.translate(0, -h / 2, 0);
    B.add(g, HB.hips, color, {
      at: [0, top - yHips, 0.0], scale: [1, 1, 0.86],
      weights: (x, y) => {
        if (y > yHips + 0.1) return ctx.torsoW(x, y);
        const f = smooth01(yHips, bottom, y) * 0.6;
        return [[HB.hips, 1 - f], [HB.thL, f * 0.5], [HB.thR, f * 0.5]];
      },
    });
  }
  // Emblem: a gold coin on the front (the Sheriff's mark).
  B.add(cyl(0.05, 0.05, 0.01, 10), HB.chest, '#d8b04a', { at: [0, 0.02, -0.17 * W], rot: [Math.PI / 2, 0, 0], shine: 1 });
}

function addAmulet(ctx, T) {
  const { B, b } = ctx;
  B.add(new THREE.TorusGeometry(0.11, 0.006, 3, 16, Math.PI), HB.chest, '#d8b04a', { at: [0, 0.17 * b.torso, -0.05], rot: [0.95, 0, Math.PI], shine: 1 });
  B.add(sphere(0.028, 8, 6), HB.chest, '#d8b04a', { at: [0, 0.07 * b.torso, -0.165 * b.width], scale: [1, 1.2, 0.6], shine: 1 });
  B.add(new THREE.OctahedronGeometry(0.024, 0), HB.chest, T.color, { at: [0, 0.07 * b.torso, -0.178 * b.width], scale: [1, 1.3, 0.6], glow: 0.35, shine: 1, flat: true });
}

function addMask(ctx) {
  const { B, hr, headC } = ctx;
  const [cx, cy, cz] = headC;
  B.add(new THREE.TorusGeometry(hr * 0.98, 0.034, 4, 18), HB.head, '#1c1c20', { at: [cx, cy + 0.0, cz], rot: [Math.PI / 2 - 0.05, 0, 0], scale: [0.97, 1.0, 1.0] });
  for (const sx of [-1, 1]) B.add(tube([[0, 0, 0], [sx * 0.04, -0.06, 0.04], [sx * 0.06, -0.16, 0.06]], 0.016, 5, 4), HB.head, '#1c1c20', { at: [cx, cy, cz + hr * 0.97] });
}

function addScarf(ctx, color) {
  const { B, b } = ctx;
  B.add(new THREE.TorusGeometry(0.085, 0.03, 5, 14), HB.chest, color, { at: [0, 0.19 * b.torso, 0.0], rot: [Math.PI / 2 + 0.25, 0, 0], scale: [1.15, 1.05, 1] });
  B.add(cone(0.08, 0.16, 3), HB.chest, color, { at: [0, 0.1 * b.torso, -0.15 * b.width], rot: [Math.PI, 0, 0], scale: [1.2, 1, 0.3] });
}

function addCowl(ctx) {
  const { B, hr, headC } = ctx;
  const [cx, cy, cz] = headC;
  const c = '#9a6a44';
  const open = 0.95;
  B.add(new THREE.SphereGeometry(hr * 1.12, 14, 8, Math.PI * 1.5 + open, TAU - open * 2, 0, Math.PI * 0.7), HB.head, c, { at: [cx, cy + 0.01, cz + 0.01], scale: [1, 1.06, 1.06] });
  B.add(new THREE.TorusGeometry(hr * 1.1, 0.018, 4, 16, Math.PI), HB.head, '#5a3a24', { at: [cx, cy + 0.02, cz], rot: [0, Math.PI / 2, 0], scale: [1, 1.06, 1.06] });
}

// ---------------------------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------------------------
function buildHuman(ctx) {
  const { spec, o, B, b } = ctx;
  const bodyK = o.body?.kind, legsK = o.legs?.kind, headK = o.head?.kind;
  const metalBody = bodyK === 'chestplate', metalLegs = legsK === 'platelegs';
  const leatherLegs = legsK === 'leather_chaps';
  const pants = leatherLegs ? '#8a5a3a' : spec.bottom;
  const boots = o.feet?.kind === 'leather_boots' ? '#7a4a2a' : spec.boots;
  addPelvis(ctx, pants);
  // Torso / tunic.
  if (bodyK === 'chestplate') addChestplate(ctx, tint(o.body.tint));
  else if (bodyK === 'leather_body' || bodyK === 'hard_leather_body') addLeatherBody(ctx, bodyK === 'hard_leather_body');
  else if (bodyK === 'goblin_mail') addGoblinMail(ctx);
  else if (bodyK === 'wyrmscale_body') addWyrmscale(ctx);
  else if (bodyK === 'coat') addCoat(ctx, o.body.tint?.[0] === '#' ? o.body.tint : spec.top, spec.metal || '#d8b04a');
  else {
    addTorso(ctx, spec.top);
    if (spec.robe) addSkirt(ctx, spec.top, 0.12, { flare: 0.03 });
    else if (!metalLegs) addSkirt(ctx, spec.top, ctx.yHips - 0.2, {});
    addBelt(ctx, spec.robe ? '#d8c8a0' : '#3a2616', spec.robe ? '#d8c8a0' : '#c9a24a', 0.07);
    addCollar(ctx, shade(spec.top, 0.65));
  }
  if (spec.tabard && (metalBody || bodyK === 'coat')) addTabard(ctx, spec.tabard, spec.metal);
  if (b.belly > 0.04 && !bodyK) B.add(sphere(0.13 * b.width, 10, 8), HB.spine, spec.top, { at: [0, 0.03, -0.035 - b.belly * 0.55], scale: [1.05, 0.95, 0.78] });
  // Arms (sleeves match the body piece).
  const sleeve = metalBody ? tint(o.body.tint).color2 : bodyK === 'leather_body' || bodyK === 'hard_leather_body' ? '#7a5034' : bodyK === 'goblin_mail' ? '#5a6a30' : bodyK === 'wyrmscale_body' ? '#4a4856' : bodyK === 'coat' ? (o.body.tint?.[0] === '#' ? o.body.tint : spec.top) : spec.top;
  addArms(ctx, { sleeve, sleeves: bodyK ? 'long' : spec.sleeves, gloves: o.hands ? '#7a4a2a' : null, hand: o.hands ? '#8a5a3a' : (metalBody && o.hands ? tint(o.body.tint).color : null), bell: spec.robe });
  // Legs.
  addLegs(ctx, { pants, boots, shinColor: pants });
  if (metalLegs) addPlatelegs(ctx, tint(o.legs.tint));
  if (leatherLegs) addBelt(ctx, '#4a2e1a', '#b89a5a', 0.02);
  if (spec.apron) addApron(ctx, spec.apron);
  // Head.
  addHead(ctx);
  const helm = headK === 'helm';
  const hood = headK === 'hood' ? tint(o.head.tint).color : spec.hood;
  const covered = helm || !!hood || headK === 'leather_cowl' || !!spec.hat || headK === 'feathered-hat' || headK === 'bell';
  if (!helm) addHair(ctx, covered);
  addBeard(ctx);
  if (helm) addHelm(ctx, tint(o.head.tint));
  else if (headK === 'leather_cowl') addCowl(ctx);
  else if (hood) addHood(ctx, hood);
  else if (headK === 'feathered-hat' || headK === 'bell' || headK === 'crown') addHat(ctx, headK);
  else if (spec.hat) addHat(ctx, spec.hat);
  if (headK === 'mask') addMask(ctx);
  if (spec.scarf) addScarf(ctx, spec.scarf);
  if (o.neck?.kind === 'amulet') addAmulet(ctx, tint(o.neck.tint));
  const capeC = o.cape ? (o.cape.tint === 'hood' ? '#3f7f3a' : o.cape.tint === 'red' ? '#8a1a1a' : (o.cape.tint?.[0] === '#' ? o.cape.tint : tint(o.cape.tint).color)) : spec.cape;
  if (capeC) addCape(ctx, capeC, { clasp: o.cape?.tint === 'hood' ? '#c9a24a' : '#d8b04a' });
}

function buildGoblin(ctx) {
  const { spec, B, b, hr, headC, o } = ctx;
  const skin = spec.skin, cloth = spec.top;
  const [cx, cy, cz] = headC;
  addPelvis(ctx, shade(cloth, 0.8));
  if (o.body?.kind === 'goblin_mail') addGoblinMail(ctx);
  else {
    addTorso(ctx, cloth, { colorFn: patchy(cloth) });
    addSkirt(ctx, shade(cloth, 0.9), ctx.yHips - 0.12, { jag: true, inner: false });
    addBelt(ctx, '#3a2616', '#8a8f95', 0.07);
  }
  B.add(sphere(0.13 * b.width, 10, 8), HB.spine, skin, { at: [0, 0.0, -0.06], scale: [1, 0.85, 0.8] }); // pot belly peeking out
  addArms(ctx, { sleeves: 'short', sleeve: cloth, handScale: 1.2 });
  addLegs(ctx, { pants: shade(cloth, 0.8), shinColor: skin, barefoot: true });
  addHead(ctx, { noEars: true, nose: 0, jaw: 1.2, eyes: { sclera: '#e8d860', iris: '#1a1208', size: 1.15, sep: 0.07 } });
  // Long ears.
  for (const sx of [-1, 1]) {
    B.add(cone(0.05, 0.26, 6), HB.head, skin, { at: [cx + sx * hr * 1.05, cy + 0.03, cz + 0.02], rot: [0.1, 0, sx * -1.25], scale: [1, 1, 0.45] });
    B.add(cone(0.032, 0.18, 5), HB.head, mix(skin, '#c06060', 0.35), { at: [cx + sx * hr * 1.06, cy + 0.03, cz + 0.0], rot: [0.1, 0, sx * -1.25], scale: [1, 1, 0.3] });
  }
  // Hooked nose, toothy grin.
  B.add(cone(0.035, 0.14, 6), HB.head, shade(skin, 0.92), { at: [0, cy - 0.04, cz - hr * 1.0], rot: [-Math.PI / 2 - 0.5, 0, 0] });
  B.add(box(0.13, 0.025, 0.03), HB.head, '#2a1010', { at: [0, cy - 0.1, cz - hr * 0.84] });
  for (const sx of [-1, 1]) B.add(cone(0.012, 0.035, 4), HB.head, '#f0ead8', { at: [sx * 0.04, cy - 0.092, cz - hr * 0.86], rot: [Math.PI, 0, 0] });
  // Heavy brow.
  B.add(box(0.2, 0.03, 0.04), HB.head, shade(skin, 0.75), { at: [0, cy + 0.04, cz - hr * 0.86], rot: [0.3, 0, 0] });
  // Scraggly hair tuft.
  B.add(cone(0.05, 0.12, 5), HB.head, '#2a2a1a', { at: [0, cy + hr * 0.95, cz + 0.02], rot: [0.4, 0, 0] });
  const headK = o.head?.kind;
  if (headK === 'bell' || headK === 'crown' || headK === 'feathered-hat') addHat(ctx, headK);
  else if (headK === 'helm') addHelm(ctx, tint(o.head.tint));
}

function patchy(c) {
  const a = C(c), t = new THREE.Color();
  return (x, y, z) => t.copy(a).multiplyScalar(0.85 + 0.25 * (Math.sin(x * 31 + y * 17) * Math.sin(z * 23 - y * 13) > 0.3 ? 1 : 0));
}

function buildTroll(ctx) {
  const { spec, B, b, hr, headC } = ctx;
  const skin = spec.skin, cloth = spec.top;
  const [cx, cy, cz] = headC;
  const rough = (c) => { const a = C(c), t = new THREE.Color(); return (x, y, z) => t.copy(a).multiplyScalar(0.88 + 0.2 * Math.sin(x * 23 + z * 19) * Math.sin(y * 29)); };
  addPelvis(ctx, skin);
  addTorso(ctx, skin, { colorFn: rough(skin), extra: 0.02 });
  // Hunched shoulder mass and belly.
  B.add(sphere(0.2 * b.width * 0.8, 10, 8), HB.chest, skin, { at: [0, 0.12, 0.06], scale: [1.35, 0.8, 1], colorFn: rough(skin) });
  B.add(sphere(0.15 * b.width * 0.85, 10, 8), HB.spine, shade(skin, 1.05), { at: [0, 0.0, -0.08], scale: [1, 0.9, 0.85] });
  // Loincloth.
  addSkirt(ctx, cloth, ctx.yHips - 0.24, { jag: true, extra: 0.02 });
  addBelt(ctx, '#3a2a1a', '#8a8f80', 0.06);
  addArms(ctx, { sleeves: 'short', sleeve: skin, skin, handScale: 1.4 });
  addLegs(ctx, { pants: skin, shinColor: skin, barefoot: true, claw: '#d8d0b8' });
  addHead(ctx, { noEars: false, nose: 2.2, jaw: 1.35, eyes: { sclera: '#e8d8a0', iris: '#3a1a10', size: 0.75, sep: 0.06 } });
  // Underbite tusks, heavy brow, tuft.
  for (const sx of [-1, 1]) B.add(cone(0.024, 0.11, 5), HB.head, '#efe8d8', { at: [sx * 0.06, cy - 0.08, cz - hr * 0.8], rot: [-0.25, 0, sx * -0.2] });
  B.add(box(0.24, 0.045, 0.06), HB.head, shade(skin, 0.8), { at: [0, cy + 0.045, cz - hr * 0.84], rot: [0.35, 0, 0] });
  B.add(cone(0.06, 0.12, 5), HB.head, '#3a3a30', { at: [0, cy + hr * 0.95, cz], rot: [0.2, 0, 0] });
  // Shoulder warts / stones.
  for (const sx of [-1, 1]) B.add(rock(0.05, 3 + sx), sx < 0 ? HB.shL : HB.shR, shade(skin, 0.85), { at: [sx * 0.03, 0.06, 0.03], flat: true });
}

function buildImp(ctx) {
  const { spec, B, b, hr, headC } = ctx;
  const skin = spec.skin, glow = spec.glow || '#ff8a3a';
  const [cx, cy, cz] = headC;
  addPelvis(ctx, shade(skin, 0.7));
  addTorso(ctx, skin);
  B.add(sphere(0.1, 8, 6), HB.chest, mix(skin, glow, 0.45), { at: [0, 0.02, -0.1], scale: [1, 0.8, 0.4], glow: 0.35 });
  addArms(ctx, { sleeves: 'short', sleeve: skin, skin, handScale: 1.1 });
  // Ember hands.
  for (const ha of [HB.haL, HB.haR]) B.add(sphere(0.045, 8, 6), ha, glow, { at: [0, -0.07, -0.02], glow: 1, ao: false });
  addLegs(ctx, { pants: skin, shinColor: skin, barefoot: true, claw: '#2a1010' });
  addHead(ctx, { noEars: true, nose: 0.8, jaw: 1.25, eyes: { glow, size: 1.3, sep: 0.07 } });
  for (const sx of [-1, 1]) {
    B.add(cone(0.05, 0.22, 6), HB.head, skin, { at: [cx + sx * hr * 1.0, cy + 0.04, cz + 0.02], rot: [0.2, 0, sx * -1.1], scale: [1, 1, 0.4] });
    B.add(tube([[0, 0, 0], [sx * 0.04, 0.08, 0.02], [sx * 0.05, 0.16, 0.08], [sx * 0.02, 0.2, 0.16]], (t) => 0.034 * (1 - t) + 0.004, 8, 5), HB.head, '#2a1a14', { at: [cx + sx * hr * 0.45, cy + hr * 0.7, cz - 0.02] });
  }
  B.add(box(0.12, 0.02, 0.02), HB.head, '#1a0808', { at: [0, cy - 0.09, cz - hr * 0.86], rot: [0, 0, 0] });
  for (let i = -2; i <= 2; i++) B.add(cone(0.009, 0.025, 3), HB.head, '#f0e8d8', { at: [i * 0.022, cy - 0.085, cz - hr * 0.87], rot: [Math.PI, 0, 0] });
  // Bat wings on the wing bones (membrane + bone struts).
  for (const [bone, sx] of [[HB.wingL, -1], [HB.wingR, 1]]) {
    const pts = [[0, 0], [0.18, 0.2], [0.42, 0.24], [0.5, 0.05], [0.4, -0.02], [0.33, -0.16], [0.22, -0.06], [0.12, -0.16]].map(([x, y]) => [x * 1.7, y * 1.7]);
    const g = extrude(pts.map(([x, y]) => [x * sx, y]), 0.012);
    B.add(g, bone, mix(skin, glow, 0.25), { rot: [0, sx * 0.35, 0], flat: true, glow: 0.12 });
    B.add(tube([[0, 0, 0], [sx * 0.3, 0.34, 0.0], [sx * 0.72, 0.41, 0.0]], 0.016, 6, 4), bone, '#2a1a14', { rot: [0, sx * 0.35, 0] });
  }
  // Tail on the cape bones.
  const tailEnd = ctx.bones[HB.cape2].getWorldPosition(new THREE.Vector3());
  B.add(tube([[0, 0, 0], [0, -0.02, 0.12], [0, -0.06, 0.24], [0, -0.06, 0.34]], (t) => 0.03 * (1 - t * 0.7), 8, 5), HB.cape, skin, {
    weights: (x, y, z) => { const f = smooth01(tailEnd.z - 0.2, tailEnd.z, z); return [[HB.cape, 1 - f], [HB.cape2, f]]; },
  });
  B.add(cone(0.05, 0.1, 4), HB.cape2, '#2a1010', { at: [0, -0.05, 0.12], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.3], flat: true });
}

function buildSkeleton(ctx) {
  const { spec, B, b, L, hr, headC } = ctx;
  const bone = spec.skin || '#e8e2d0', dark = '#1a1410', cloth = spec.top;
  const [cx, cy, cz] = headC;
  const stick = (b0, len, r = 0.022) => B.add(cyl(r, r * 0.85, len, 6), b0, bone, { at: [0, -len / 2, 0] });
  const knob = (b0, y = 0, r = 0.035) => B.add(sphere(r, 6, 5), b0, bone, { at: [0, y, 0] });
  // Spine column & pelvis.
  for (let i = 0; i < 7; i++) {
    const y = ctx.yHips + 0.02 + i * 0.07;
    B.add(box(0.05, 0.035, 0.05), HB.hips, shade(bone, 0.9), { at: [0, y - ctx.yHips, 0.03], weights: ctx.torsoW });
  }
  B.add(new THREE.TorusGeometry(0.1, 0.03, 5, 10), HB.hips, bone, { at: [0, -0.02, 0], rot: [Math.PI / 2 + 0.3, 0, 0], scale: [1.2, 0.9, 1] });
  // Ribcage: four arched ribs + sternum.
  for (let i = 0; i < 4; i++) {
    B.add(new THREE.TorusGeometry(0.15 - i * 0.012, 0.013, 4, 14, Math.PI * 1.6), HB.chest, bone, { at: [0, 0.12 - i * 0.065, 0.0], rot: [Math.PI / 2 + 0.15, 0, Math.PI * 0.7 + Math.PI], scale: [1.05, 0.75, 1] });
  }
  B.add(box(0.03, 0.22, 0.02), HB.chest, bone, { at: [0, 0.03, -0.11] });
  // Clavicles.
  B.add(cyl(0.015, 0.015, 0.36, 5), HB.chest, bone, { at: [0, 0.17, -0.02], rot: [0, 0, Math.PI / 2] });
  // Limbs.
  for (const side of [-1, 1]) {
    const sh = side < 0 ? HB.shL : HB.shR, el = side < 0 ? HB.elL : HB.elR, ha = side < 0 ? HB.haL : HB.haR;
    knob(sh, 0, 0.04); stick(sh, 0.26 * b.arm); knob(el, 0, 0.028); stick(el, 0.24 * b.arm, 0.018);
    B.add(box(0.05, 0.07, 0.03), ha, bone, { at: [0, -0.045, 0] });
    for (let f = -1; f <= 1; f++) B.add(cyl(0.007, 0.006, 0.06, 4), ha, bone, { at: [f * 0.016, -0.1, -0.005] });
    const th = side < 0 ? HB.thL : HB.thR, kn = side < 0 ? HB.knL : HB.knR, ft = side < 0 ? HB.ftL : HB.ftR;
    knob(th, 0, 0.04); stick(th, L.thigh, 0.026); knob(kn, 0, 0.036); stick(kn, L.shin, 0.022);
    B.add(box(0.07, 0.035, 0.18), ft, bone, { at: [0, -0.05, -0.05] });
  }
  // Skull.
  B.add(cyl(0.025, 0.025, 0.12, 6), HB.neck, bone, { at: [0, 0.05, 0.02] });
  B.add(headGeometry(hr * 0.95, { jaw: 0.75, chin: 0.35 }), HB.head, bone, { at: [cx, cy + 0.02, cz] });
  for (const sx of [-1, 1]) {
    B.add(sphere(0.035, 8, 6), HB.head, dark, { at: [sx * 0.06, cy + 0.0, cz - hr * 0.78], scale: [1, 1.1, 0.6] });
    B.add(sphere(0.011, 5, 4), HB.eyes, '#ff5a3a', { at: [sx * 0.06, -0.003, 0.03], glow: 1, ao: false });
  }
  B.add(cone(0.022, 0.04, 3), HB.head, dark, { at: [0, cy - 0.05, cz - hr * 0.85], rot: [Math.PI, 0, 0] });
  B.add(box(0.13, 0.05, 0.08), HB.head, bone, { at: [0, cy - 0.13, cz - hr * 0.5] });
  B.add(box(0.11, 0.012, 0.01), HB.head, dark, { at: [0, cy - 0.11, cz - hr * 0.88] });
  // Tattered sash and loincloth.
  addSkirt(ctx, cloth, ctx.yHips - 0.25, { jag: true, extra: -0.01 });
  B.add(new THREE.TorusGeometry(0.14, 0.02, 3, 12), HB.chest, cloth, { at: [0, 0.0, 0], rot: [Math.PI / 2 + 0.6, 0.3, 0], scale: [1, 1, 1] });
}

function buildGolem(ctx) {
  const { spec, B, b, L, hr, headC } = ctx;
  const stone = spec.skin || '#7f7a70', core = spec.glow || '#8fe3ff';
  const [cx, cy, cz] = headC;
  const R = rng(hashStr(stone));
  const moss = C('#5a7a3a');
  const rc = (c) => { const a = C(c), t = new THREE.Color(); return (x, y, z) => t.copy(a).multiplyScalar(0.85 + R() * 0.25).lerp(moss, y > 0 && R() < 0.12 ? 0.6 : 0); };
  const slab = (bone, r, at, sc, seed) => B.add(rock(r, seed, 0, 0.18), bone, stone, { at, scale: sc, flat: true, colorFn: rc(stone) });
  slab(HB.hips, 0.2, [0, 0.0, 0], [1.2, 0.8, 0.9], 11);
  slab(HB.spine, 0.2, [0, 0.08, 0], [1.25, 0.9, 0.95], 12);
  slab(HB.chest, 0.3, [0, 0.14, 0.02], [1.35, 1.0, 0.95], 13);
  slab(HB.chest, 0.17, [0, 0.36, 0.14], [1.4, 0.7, 0.9], 14);
  // Glowing core in a cracked chest.
  B.add(new THREE.IcosahedronGeometry(0.1, 1), HB.chest, core, { at: [0, 0.12, -0.25], glow: 1, ao: false, flat: true });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    B.add(box(0.016, 0.16, 0.012), HB.chest, core, { at: [Math.cos(a) * 0.12, 0.12 + Math.sin(a) * 0.12, -0.262], rot: [0, 0, a + Math.PI / 2], glow: 0.9, ao: false });
  }
  for (const side of [-1, 1]) {
    const sh = side < 0 ? HB.shL : HB.shR, el = side < 0 ? HB.elL : HB.elR, ha = side < 0 ? HB.haL : HB.haR;
    slab(sh, 0.2, [side * 0.04, 0.04, 0], [1.1, 0.95, 1], 20 + side);
    slab(sh, 0.13, [0, -0.15 * b.arm, 0], [0.9, 1.3, 0.9], 22 + side);
    slab(el, 0.13, [0, -0.12 * b.arm, 0], [0.95, 1.3, 0.95], 24 + side);
    slab(ha, 0.17, [0, -0.08, 0], [1.1, 1, 1.05], 26 + side);
    const th = side < 0 ? HB.thL : HB.thR, kn = side < 0 ? HB.knL : HB.knR, ft = side < 0 ? HB.ftL : HB.ftR;
    slab(th, 0.15, [0, -L.thigh * 0.5, 0], [1, 1.4, 1], 30 + side);
    slab(kn, 0.13, [0, -L.shin * 0.5, 0], [1, 1.4, 1], 32 + side);
    slab(ft, 0.13, [0, -0.03, -0.06], [1.1, 0.6, 1.5], 34 + side);
  }
  // Head: a small stone with glowing slit eyes.
  slab(HB.head, hr * 1.1, [cx, cy, cz], [1.1, 0.95, 1.05], 40);
  for (const sx of [-1, 1]) B.add(box(0.06, 0.02, 0.02), HB.eyes, core, { at: [sx * 0.055, 0, 0.015], rot: [0, 0, sx * 0.2], glow: 1, ao: false });
}

// ---------------------------------------------------------------------------------------------
// Held items (merged): weapon (right palm / left palm for bows), shield (forearm), quiver (back).
// ---------------------------------------------------------------------------------------------
function buildHeld(ctx) {
  const { B, o, spec, bones } = ctx;
  const w = o.weapon;
  if (w) {
    if (spec.bow) {
      const bp = bowParts(spec.bow.kind, spec.bow.tint);
      // Bow frame -> left palm frame: rotation x -90deg (limbs along -z of the hand, string toward +y).
      const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
      addParts(B, HB.wpnL, bp.parts, m);
      // String: two segments, nock ends ride the nock bone.
      const toHand = (p) => new THREE.Vector3(...p).applyMatrix4(m);
      const tTop = toHand(bp.top), tBot = toHand(bp.bottom), nock = toHand(bp.nock);
      const nockW = B.P(HB.nock, 0, 0, 0);
      for (const tip of [tTop, tBot]) {
        const len = tip.distanceTo(nock);
        const g = cyl(0.0045, 0.0045, len, 4, true);
        g.translate(0, len / 2, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(nock).normalize());
        B.add(g, HB.wpnL, '#e8e2d0', {
          quat: q, at: [nock.x, nock.y, nock.z], ao: false,
          weights: (x, y, z) => (Math.hypot(x - nockW.x, y - nockW.y, z - nockW.z) < 0.03 ? [[HB.nock, 1]] : [[HB.wpnL, 1]]),
        });
      }
      // Arrow on the arrow bone (hidden unless drawing): shaft along the bow's forward (-y of the hand).
      const at = (x, y, z) => ({ at: [x, y, z] });
      B.add(cyl(0.006, 0.006, 0.72, 4), HB.arrow, '#c9a46a', { ...at(0, -0.36, 0), ao: false });
      B.add(cone(0.016, 0.06, 4), HB.arrow, '#9aa0a8', { ...at(0, -0.74, 0), rot: [Math.PI, 0, 0], shine: 1, ao: false });
      for (const r of [0, Math.PI / 2]) B.add(box(0.003, 0.07, 0.03), HB.arrow, '#f2efe6', { ...at(0, -0.04, 0), rot: [0, r, 0], ao: false });
    } else {
      addParts(B, HB.wpn, weaponParts(w.kind, w.tint || 'iron'));
    }
  }
  const s = o.shield;
  if (s) {
    const face = s.tint === 'fireward' ? 'fireward' : s.face || null;
    // Shield frame -> forearm: shield plane holds the forearm axis, faces outward (-x).
    addParts(B, HB.shd, shieldParts(s.kind || 'kiteshield', s.tint === 'fireward' ? 'gold' : s.tint || 'iron', face), new THREE.Matrix4().makeTranslation(-0.012, -0.02, 0));
  }
  const a = o.ammo;
  if (a && a.kind === 'quiver') {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(0.07, 0.04, 0.17 * spec.b.width), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0, -0.5)), new THREE.Vector3(1, 1, 1));
    addParts(B, HB.chest, quiverParts(a.tint || 'bronze'), m);
  }
}
