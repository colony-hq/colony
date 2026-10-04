// Human bodies: one continuous, sculpted surface instead of stacked capsules. Torso, limbs,
// hands and boots are lofts with anatomical cross-sections (chest, waist, glutes, deltoids,
// biceps, calves) skinned across the joints; the head is a shaped sphere whose front carries a
// painted face (a-face.js); hair and beards are sculpted shells with lock ridges. Clothing is
// painted on the body by region plus a few real pieces (tunic hem, belt, pouch, collar, cuffs,
// boots). Used by a-humanoid.js for the 'human' variant. Owner: actors builder.

import * as THREE from 'three';
import { C, shade, mix, smooth01, clamp, lerp, TAU, loft, hashStr } from './a-core.js';
import { HB } from './a-humanoid.js';
import { faceCell, faceUV } from './a-face.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _c = new THREE.Color();
const SHEEN = new THREE.Color('#6c6a78');
// Very dark hair renders as a flat black hole: lift it toward a cool charcoal so locks read.
function hairBase(hex) {
  const c = C(hex);
  const l = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
  if (l < 0.12) c.lerp(C('#3c3642'), 0.5 * (1 - l / 0.12));
  return c;
}
const IRIS = ['#5a3a22', '#3d2616', '#3f6488', '#4f7a44', '#6b6250', '#2f4f6f', '#7a5a2a'];

// ---------------------------------------------------------------------------------------------
// Torso
// ---------------------------------------------------------------------------------------------
// Rows bottom to top: [y, rx, rf, rb, weights, region] (region: low = trousers, top, neck).
export function torsoRows(ctx, extra = 0) {
  const { spec, b, yHips, ySpine, yChest, yNeck } = ctx;
  const H = HB, f = spec.female;
  const bel = b.belly || 0, t = b.torso;
  const yS = yChest + 0.15 * t;
  const rows = f ? [
    [yHips - 0.095, 0.094, 0.076, 0.094, [[H.hips, 1]], 'low'],
    [yHips - 0.035, 0.172, 0.1, 0.134, [[H.hips, 1]], 'low'],
    [yHips + 0.045, 0.158, 0.093, 0.116, [[H.hips, 1]], 'low'],
    [ySpine + 0.04, 0.126, 0.082 + bel * 0.6, 0.086, [[H.hips, 0.4], [H.spine, 0.6]], 'top'],
    [ySpine + 0.11, 0.133 + bel * 0.5, 0.088 + bel * 1.3, 0.086, [[H.spine, 1]], 'top'],
    [yChest + 0.03, 0.15 + bel * 0.3, 0.106 + bel * 0.6, 0.09, [[H.spine, 0.35], [H.chest, 0.65]], 'top'],
    [yChest + 0.09, 0.162, 0.128, 0.094, [[H.chest, 1]], 'top'],
    [yS, 0.158, 0.1, 0.095, [[H.chest, 1]], 'top'],
    [yNeck - 0.012, 0.104, 0.062, 0.075, [[H.chest, 0.85], [H.neck, 0.15]], 'top'],
    [yNeck + 0.028, 0.056, 0.052, 0.058, [[H.chest, 0.25], [H.neck, 0.75]], 'neck'],
    [yNeck + 0.16, 0.051, 0.048, 0.054, [[H.neck, 1]], 'neck'],
  ] : [
    [yHips - 0.095, 0.094, 0.074, 0.09, [[H.hips, 1]], 'low'],
    [yHips - 0.035, 0.158, 0.1, 0.124, [[H.hips, 1]], 'low'],
    [yHips + 0.045, 0.154, 0.097, 0.112, [[H.hips, 1]], 'low'],
    [ySpine + 0.04, 0.145, 0.095 + bel * 0.6, 0.095, [[H.hips, 0.4], [H.spine, 0.6]], 'top'],
    [ySpine + 0.12, 0.157 + bel * 0.5, 0.104 + bel * 1.35, 0.097, [[H.spine, 1]], 'top'],
    [yChest + 0.02, 0.18 + bel * 0.3, 0.117 + bel * 0.6, 0.106, [[H.spine, 0.35], [H.chest, 0.65]], 'top'],
    [yChest + 0.1, 0.198, 0.124, 0.113, [[H.chest, 1]], 'top'],
    [yS, 0.19, 0.104, 0.11, [[H.chest, 1]], 'top'],
    [yNeck - 0.012, 0.12, 0.066, 0.086, [[H.chest, 0.85], [H.neck, 0.15]], 'top'],
    [yNeck + 0.028, 0.068, 0.062, 0.07, [[H.chest, 0.25], [H.neck, 0.75]], 'neck'],
    [yNeck + 0.16, 0.06, 0.056, 0.064, [[H.neck, 1]], 'neck'],
  ];
  const W = ctx.W, dk = 1 + (W - 1) * 0.7;
  return rows.map(([y, rx, rf, rb, w, region]) => [y, rx * W + extra, rf * dk + extra, rb * dk + extra, w, region]);
}
// Interpolated torso radii at height y: { rx, rf, rb }.
export function torsoAt(ctx, y, extra = 0) {
  const rows = torsoRows(ctx, extra);
  if (y <= rows[0][0]) return { rx: rows[0][1], rf: rows[0][2], rb: rows[0][3] };
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    if (y <= b[0]) {
      const t = smooth01(a[0], b[0], y);
      return { rx: lerp(a[1], b[1], t), rf: lerp(a[2], b[2], t), rb: lerp(a[3], b[3], t) };
    }
  }
  const l = rows[rows.length - 1];
  return { rx: l[1], rf: l[2], rb: l[3] };
}
function bustMod(ctx, rows) {
  if (!ctx.spec.female) return null;
  const { yChest } = ctx;
  return (u, a, i) => {
    const y = rows[i][0];
    const k = smooth01(yChest - 0.02, yChest + 0.06, y) * (1 - smooth01(yChest + 0.1, yChest + 0.16, y));
    const s = Math.sin(a);
    if (s <= 0 || k <= 0) return 1;
    const c = Math.cos(a);
    // Two soft mounds that merge into one form (no balls glued on).
    const m = Math.exp(-(((Math.abs(c) - 0.42) / 0.36) ** 2));
    return 1 + 0.16 * k * s * s * (0.55 + 0.45 * m);
  };
}

// color(row, a, out) -> Color; or o.colorFn (model space) for armour patterns.
export function addTorsoH(ctx, color, o = {}) {
  let rows = torsoRows(ctx, o.extra || 0);
  if (o.noNeck) rows = rows.filter((r) => r[5] !== 'neck');
  const ring = rows.map(([y, rx, rf, rb, w]) => ({ p: V(0, y, 0), rx, rf, rb, w }));
  const keep = !o.colorFn;
  const base = C(color);
  const g = loft(ring, {
    radial: 20, sq: 0.9, mod: o.mod ?? bustMod(ctx, rows), caps: [true, !!o.noNeck],
    color: keep ? (u, a, i, out) => out.copy(o.colorAt ? o.colorAt(rows[i], a) : base) : null,
  });
  ctx.B.add(g, null, color, { keepColor: keep, keepSkin: true, colorFn: o.colorFn, shine: o.shine, glowFn: o.glowFn, flat: o.flat, jitter: 0.02 });
}

// Skirt / tunic hem / robe: from the waist down to hemY, flaring over the thighs.
export function addHemH(ctx, color, hemY, o = {}) {
  const { B, W, yHips, spec } = ctx;
  const topY = yHips + (o.top ?? 0.07);
  const H = topY - hemY;
  const long = hemY < ctx.L.hipY * 0.5;
  const t0 = torsoAt(ctx, topY, 0.012 + (o.extra || 0));
  const flare = (o.flare || 0) + (long ? 0.03 : 0);
  const rHem = { rx: (spec.female ? 0.225 : 0.215) * W + flare + (o.extra || 0), rf: (0.15 + spec.b.belly * 0.6) * (1 + (W - 1) * 0.6) + flare * 0.7 + (o.extra || 0), rb: 0.16 * (1 + (W - 1) * 0.6) + flare * 0.7 + (o.extra || 0) };
  const steps = long ? 7 : 4;
  const rings = [];
  const wFn = ctx.skirtW(topY, H, rHem.rx, long ? 0.82 : 0.72);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = topY - t * H;
    const e = Math.pow(t, 0.65);
    // Weight per ring: hips at the top, thighs drag the hem (average of both sides here; the
    // per-vertex split happens below through the colour pass... keep it simple: hips + both).
    const ww = wFn(0, y);
    rings.push({ p: V(0, y, 0), rx: lerp(t0.rx, rHem.rx, e), rf: lerp(t0.rf, rHem.rf, e), rb: lerp(t0.rb, rHem.rb, e), w: ww });
  }
  const base = C(color), trim = C(o.trim || shade(color, 0.72));
  const g = loft(rings, {
    radial: 18, sq: 0.95, caps: [false, false],
    mod: o.jag ? (u, a) => (u > 0.8 ? 1 + 0.06 * Math.sin(a * 7) : 1) : null,
    color: (u, a, i, out) => out.copy(u > 0.88 ? trim : base),
  });
  // Per-vertex thigh weights (left half follows the left thigh).
  const p = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  for (let v = 0; v < p.count; v++) {
    const w = wFn(p.getX(v), p.getY(v));
    for (let k = 0; k < 4; k++) { si.setComponent(v, k, k < w.length ? w[k][0] : 0); sw.setComponent(v, k, k < w.length ? w[k][1] : 0); }
  }
  // Lining so the hem reads from below (cloned before the Builder consumes the attributes).
  const gi = g.clone();
  B.add(g, null, color, { keepColor: !o.colorFn, keepSkin: true, shine: o.shine, colorFn: o.colorFn, jitter: 0.03 });
  const pa = gi.attributes.position, ca = gi.attributes.color;
  for (let v = 0; v < pa.count; v++) {
    const x = pa.getX(v), z = pa.getZ(v), y = pa.getY(v);
    const r = Math.hypot(x, z) || 1;
    pa.setXYZ(v, x - (x / r) * 0.007, y, z - (z / r) * 0.007);
    ca.setXYZ(v, ca.getX(v) * 0.5, ca.getY(v) * 0.5, ca.getZ(v) * 0.5);
  }
  const ia = gi.index.array;
  for (let i = 0; i < ia.length; i += 3) { const tmp = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = tmp; }
  B.add(gi, null, color, { keepColor: true, keepSkin: true, ao: true, jitter: 0 });
}

// Band around the torso at height y (belts, sashes, collars).
export function addBandH(ctx, color, y, h = 0.045, o = {}) {
  const { B } = ctx;
  const r0 = torsoAt(ctx, y, (o.extra ?? 0.012));
  const w = ctx.torsoW(0, y);
  const rings = [-1, -0.6, 0.6, 1].map((k) => ({ p: V(0, y + (k * h) / 2, 0), rx: r0.rx + (Math.abs(k) < 1 ? 0.006 : 0), rf: r0.rf + (Math.abs(k) < 1 ? 0.006 : 0), rb: r0.rb + (Math.abs(k) < 1 ? 0.006 : 0), w }));
  B.add(loft(rings, { radial: 24, sq: 0.9, color: (u, a, i, out) => out.copy(C(color)), caps: [false, false] }), null, color, { keepColor: true, keepSkin: true, shine: o.shine, jitter: 0.02 });
  return r0;
}

export function addBeltH(ctx, color = '#3a2616', buckle = '#c9a24a', y = null, o = {}) {
  const { B, yHips } = ctx;
  const yy = y ?? yHips + 0.075;
  const r = addBandH(ctx, color, yy, 0.042, { extra: 0.014 + (o.extra || 0) });
  const zf = -(r.rf + 0.03);
  B.add(new THREE.BoxGeometry(0.06, 0.05, 0.016), HB.hips, buckle, { at: [0, yy - yHips, zf + 0.006], shine: 0.9 });
  B.add(new THREE.BoxGeometry(0.036, 0.028, 0.02), HB.hips, shade(color, 0.6), { at: [0, yy - yHips, zf + 0.002] });
  if (o.pouch !== false) {
    // Pouch on the left hip with a flap.
    const px = -(r.rx + 0.012) * 0.86, pz = -r.rf * 0.45;
    B.add(new THREE.SphereGeometry(0.05, 10, 8), HB.hips, o.pouchColor || '#7a5232', { at: [px, yy - yHips - 0.06, pz], scale: [0.55, 1.05, 0.95], weights: ctx.torsoW });
    B.add(new THREE.SphereGeometry(0.052, 10, 5, 0, TAU, 0, Math.PI * 0.42), HB.hips, shade(o.pouchColor || '#7a5232', 0.75), { at: [px, yy - yHips - 0.04, pz], scale: [0.6, 0.9, 1.0] });
  }
}

// ---------------------------------------------------------------------------------------------
// Arms and hands
// ---------------------------------------------------------------------------------------------
export function addArmsH(ctx, o = {}) {
  const { B, spec, bones } = ctx;
  const Lk = spec.b.limb, A = spec.b.arm, f = spec.female;
  const skin = C(o.skin || spec.skin);
  const sleeve = C(o.sleeve || spec.top);
  const long = (o.sleeves || spec.sleeves) !== 'short';
  const bare = o.sleeves === 'none';
  const cuffC = C(o.cuff || shade(o.sleeve || spec.top, 0.72));
  const k = f ? 0.88 : 1;
  for (const s of [-1, 1]) {
    const sh = s < 0 ? HB.shL : HB.shR, el = s < 0 ? HB.elL : HB.elR, ha = s < 0 ? HB.haL : HB.haR;
    const P0 = bones[sh].getWorldPosition(new THREE.Vector3());
    const lenU = 0.26 * A, lenF = 0.24 * A;
    // [d below the shoulder, rx, rf, rb]
    const prof = [
      [-0.058, 0.026, 0.03, 0.03],
      [-0.035, 0.052, 0.054, 0.052],
      [0.0, f ? 0.06 : 0.066, f ? 0.058 : 0.064, f ? 0.058 : 0.063],
      [0.06, f ? 0.056 : 0.062, f ? 0.056 : 0.061, f ? 0.054 : 0.059],
      [0.125, 0.054, 0.058, 0.053],
      [0.19 * A, 0.051, 0.054, 0.05],
      [lenU - 0.02, 0.045, 0.046, 0.047],
      [lenU, 0.043, 0.043, 0.046],
      [lenU + 0.045, 0.048, 0.049, 0.049],
      [lenU + 0.1, 0.046, 0.045, 0.045],
      [lenU + lenF - 0.05, 0.036, 0.037, 0.035],
      [lenU + lenF + 0.005, 0.031, 0.032, 0.031],
    ];
    const wAt = (d) => {
      if (d < lenU - 0.05) return [[sh, 1]];
      if (d < lenU + 0.05) { const t = smooth01(lenU - 0.05, lenU + 0.05, d); return [[sh, 1 - t], [el, t]]; }
      if (d < lenU + lenF - 0.03) return [[el, 1]];
      const t = smooth01(lenU + lenF - 0.03, lenU + lenF + 0.02, d) * 0.5;
      return [[el, 1 - t], [ha, t]];
    };
    const cuffD = long ? lenU + lenF - 0.035 : 0.13;
    const rings = prof.map(([d, rx, rf, rb]) => ({ p: V(P0.x, P0.y - d, P0.z), rx: rx * Lk * k, rf: rf * Lk * k, rb: rb * Lk * k, w: wAt(d), d }));
    const g = loft(rings, {
      radial: 12, caps: [true, true],
      // Deltoid and forearm bulge outward a little.
      mod: (u, a, i) => { const d = rings[i].d; const out = Math.max(0, Math.cos(a) * s); return 1 + out * ((f ? 0.04 : 0.08) * Math.exp(-(((d - 0.0) / 0.06) ** 2)) + 0.06 * Math.exp(-(((d - lenU - 0.06) / 0.05) ** 2))); },
      color: (u, a, i, out) => {
        const d = rings[i].d;
        if (bare) return out.copy(skin);
        if (d < cuffD - 0.022) return out.copy(sleeve);
        if (d < cuffD + 0.008) return out.copy(cuffC);
        return out.copy(skin);
      },
    });
    B.add(g, null, '#fff', { keepColor: true, keepSkin: true, jitter: 0.02 });
    // Cuff ridge.
    if (!bare) {
      const cy = P0.y - cuffD;
      const cr = rings.find((r) => r.d >= cuffD) || rings[rings.length - 1];
      const band = [[-0.014, 0.004], [-0.006, 0.01], [0.006, 0.01], [0.014, 0.002]].map(([dy, e]) => ({ p: V(P0.x, cy + dy, P0.z), rx: cr.rx + e, rf: cr.rf + e, rb: cr.rb + e, w: wAt(cuffD) }));
      B.add(loft(band, { radial: 14, caps: [false, false], color: (u, a, i, out) => out.copy(cuffC) }), null, '#fff', { keepColor: true, keepSkin: true });
    }
    addHandH(ctx, s, o);
  }
}

export function addHandH(ctx, s, o = {}) {
  const { B, spec } = ctx;
  const ha = s < 0 ? HB.haL : HB.haR;
  const Lk = Math.min(1.3, spec.b.limb) * (o.handScale || 1) * (spec.female ? 0.9 : 1);
  const c = C(o.hand || o.skin || spec.skin);
  const line = shade(c, 0.78);
  const M = ctx.bones[ha].matrixWorld;
  const P = (x, y, z) => V(x, y, z).applyMatrix4(M);
  const w = [[ha, 1]];
  // Palm toward the body (-s x), fingers curl toward the palm.
  const prof = [
    [0.012, 0.024, 0.033, 0.033, 0],
    [-0.025, 0.029, 0.045, 0.043, 0],
    [-0.065, 0.028, 0.048, 0.046, 0.003],
    [-0.095, 0.024, 0.045, 0.043, 0.008],
    [-0.122, 0.02, 0.039, 0.037, 0.014],
    [-0.142, 0.013, 0.027, 0.025, 0.02],
  ];
  const rings = prof.map(([y, rx, rf, rb, curl]) => ({ p: P(-s * curl * Lk, y * Lk, 0), rx: rx * Lk, rf: rf * Lk, rb: rb * Lk, w, y }));
  const g = loft(rings, {
    radial: 10, sq: 0.8, caps: [true, true],
    color: (u, a, i, out) => {
      const y = rings[i].y;
      if (y < -0.085 && !o.mitten) { const z = Math.sin(a); if (Math.abs(Math.abs(z) - 0.5) < 0.07 || Math.abs(z) < 0.05) return out.copy(line); }
      return out.copy(c);
    },
  });
  B.add(g, null, '#fff', { keepColor: true, keepSkin: true, jitter: 0.015 });
  // Thumb: from the base of the palm toward the front.
  const tr = [
    { p: P(-s * 0.01 * Lk, -0.02 * Lk, -0.025 * Lk), rx: 0.017 * Lk, rf: 0.017 * Lk, rb: 0.017 * Lk, w },
    { p: P(-s * 0.022 * Lk, -0.05 * Lk, -0.048 * Lk), rx: 0.015 * Lk, rf: 0.015 * Lk, rb: 0.015 * Lk, w },
    { p: P(-s * 0.03 * Lk, -0.078 * Lk, -0.056 * Lk), rx: 0.011 * Lk, rf: 0.011 * Lk, rb: 0.011 * Lk, w },
  ];
  B.add(loft(tr, { radial: 8, ref: V(1, 0, 0), color: (u, a, i, out) => out.copy(c) }), null, '#fff', { keepColor: true, keepSkin: true, jitter: 0.015 });
  if (o.glove) {
    const gc = C(o.glove);
    const top = 0.018 * Lk, cuffR = [0.034, 0.05, 0.048].map((r) => r * Lk);
    const band = [[0.03, 0.002], [0.012, 0.01], [-0.012, 0.01]].map(([y, e], i) => ({ p: P(0, y * Lk + top * 0, 0), rx: 0.03 * Lk + e, rf: cuffR[i] + e * 0.5, rb: cuffR[i] + e * 0.5, w }));
    B.add(loft(band, { radial: 12, sq: 0.8, caps: [false, false], color: (u, a, i, out) => out.copy(shade(gc, 0.85)) }), null, '#fff', { keepColor: true, keepSkin: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Legs and boots
// ---------------------------------------------------------------------------------------------
function legProfile(ctx) {
  const { spec, L } = ctx;
  const f = spec.female, T = L.thigh, S = L.shin;
  return [
    [-0.065, 0.094, 0.09, 0.098],
    [0.0, f ? 0.108 : 0.104, 0.1, f ? 0.114 : 0.11],
    [0.08, f ? 0.104 : 0.1, 0.097, f ? 0.104 : 0.1],
    [0.2, f ? 0.092 : 0.09, 0.088, 0.088],
    [T - 0.09, f ? 0.074 : 0.077, 0.075, 0.072],
    [T - 0.025, 0.065, 0.07, 0.062],
    [T + 0.015, 0.062, 0.066, 0.064],
    [T + 0.07, f ? 0.062 : 0.066, 0.06, f ? 0.072 : 0.078],
    [T + 0.15, f ? 0.056 : 0.06, 0.054, f ? 0.06 : 0.064],
    [T + S - 0.1, 0.045, 0.044, 0.046],
    [T + S - 0.02, 0.04, 0.041, 0.043],
    [T + S + 0.03, 0.036, 0.037, 0.04],
  ];
}
function legWeights(ctx, s) {
  const { L } = ctx;
  const th = s < 0 ? HB.thL : HB.thR, kn = s < 0 ? HB.knL : HB.knR, ft = s < 0 ? HB.ftL : HB.ftR;
  const T = L.thigh, S = L.shin;
  return (d) => {
    if (d < 0.0) { const t = smooth01(-0.07, 0.0, d); return [[HB.hips, 0.6 - 0.35 * t], [th, 0.4 + 0.35 * t]]; }
    if (d < 0.06) { const t = smooth01(0.0, 0.06, d); return [[HB.hips, 0.25 * (1 - t)], [th, 0.75 + 0.25 * t]]; }
    if (d < T - 0.05) return [[th, 1]];
    if (d < T + 0.05) { const t = smooth01(T - 0.05, T + 0.05, d); return [[th, 1 - t], [kn, t]]; }
    if (d < T + S - 0.04) return [[kn, 1]];
    const t = smooth01(T + S - 0.04, T + S + 0.02, d) * 0.6;
    return [[kn, 1 - t], [ft, t]];
  };
}
export function addLegsH(ctx, o = {}) {
  const { B, spec, bones, L } = ctx;
  const Lk = spec.b.limb;
  const pants = C(o.pants || spec.bottom);
  const skin = C(o.skin || spec.skin);
  for (const s of [-1, 1]) {
    const th = s < 0 ? HB.thL : HB.thR;
    const P0 = bones[th].getWorldPosition(new THREE.Vector3());
    const wAt = legWeights(ctx, s);
    const rings = legProfile(ctx).filter(([d]) => d <= (o.maxD ?? 9)).map(([d, rx, rf, rb]) => ({ p: V(P0.x, P0.y - d, P0.z), rx: rx * Lk + (o.extra || 0), rf: rf * Lk + (o.extra || 0), rb: rb * Lk + (o.extra || 0), w: wAt(d), d }));
    const bareFrom = o.shorts ? L.thigh * 0.6 : 99;
    const g = loft(rings, {
      radial: 12, caps: [true, true],
      mod: (u, a, i) => { const out = Math.max(0, Math.cos(a) * s); return 1 + 0.05 * out * Math.exp(-(((rings[i].d - 0.12) / 0.1) ** 2)); },
      color: (u, a, i, out) => out.copy(rings[i].d > bareFrom ? skin : (o.colorAt ? o.colorAt(rings[i].d, a) : pants)),
    });
    B.add(g, null, '#fff', { keepColor: true, keepSkin: true, shine: o.shine, jitter: 0.025 });
  }
}

export function addBootsH(ctx, color, o = {}) {
  const { B, spec, bones, L } = ctx;
  const Lk = Math.min(1.3, spec.b.limb);
  const c = C(color), cuff = C(o.cuff || shade(color, 1.22)), sole = C(o.sole || '#241a12');
  const T = L.thigh, S = L.shin;
  for (const s of [-1, 1]) {
    const th = s < 0 ? HB.thL : HB.thR, ft = s < 0 ? HB.ftL : HB.ftR;
    const P0 = bones[th].getWorldPosition(new THREE.Vector3());
    const wAt = legWeights(ctx, s);
    const prof = legProfile(ctx);
    const top = T + S * (o.top ?? 0.5);
    // Shaft: follows the shin a little proud of it, flaring at the cuff.
    const shaft = [];
    const at = (d) => {
      for (let i = 0; i < prof.length - 1; i++) {
        if (d <= prof[i + 1][0]) { const t = (d - prof[i][0]) / (prof[i + 1][0] - prof[i][0]); return [lerp(prof[i][1], prof[i + 1][1], t), lerp(prof[i][2], prof[i + 1][2], t), lerp(prof[i][3], prof[i + 1][3], t)]; }
      }
      return prof[prof.length - 1].slice(1);
    };
    for (const [d, e] of [[top - 0.01, 0.02], [top + 0.012, 0.024], [top + 0.03, 0.014], [T + S - 0.12, 0.011], [T + S - 0.04, 0.012], [T + S + 0.02, 0.014]]) {
      const [rx, rf, rb] = at(Math.min(d, T + S + 0.03));
      shaft.push({ p: V(P0.x, P0.y - d, P0.z), rx: rx * Lk + e, rf: rf * Lk + e, rb: rb * Lk + e, w: wAt(d), d });
    }
    B.add(loft(shaft, { radial: 12, caps: [false, false], color: (u, a, i, out) => out.copy(shaft[i].d < top + 0.03 ? cuff : c) }), null, '#fff', { keepColor: true, keepSkin: true, shine: o.shine, jitter: 0.03 });
    // Foot: along -z from the heel to a rounded toe; flat sole.
    const M = bones[ft].matrixWorld;
    const P = (x, y, z) => V(x, y, z).applyMatrix4(M);
    const yc = -0.038;
    const fp = [
      [0.078, 0.032, 0.03, 0.036],
      [0.06, 0.05, 0.055, 0.04],
      [0.02, 0.056, 0.058, 0.04],
      [-0.04, 0.058, 0.044, 0.04],
      [-0.1, 0.061, 0.035, 0.04],
      [-0.16, 0.058, 0.03, 0.04],
      [-0.2, 0.047, 0.026, 0.038],
      [-0.228, 0.03, 0.018, 0.03],
    ];
    const fr = fp.map(([z, rx, up, dn]) => ({ p: P(0, yc, z * Lk), rx: rx * Lk * (spec.female ? 0.9 : 1), rf: up, rb: dn, w: [[ft, 1]], sq: 0.75 }));
    B.add(loft(fr, {
      radial: 12, ref: V(0, 1, 0), caps: [true, true],
      color: (u, a, i, out) => out.copy(Math.sin(a) < -0.8 ? sole : (u > 0.82 && Math.sin(a) > 0.2 ? shade(c, 1.08) : c)),
    }), null, '#fff', { keepColor: true, keepSkin: true, shine: o.shine, jitter: 0.03 });
  }
}

// ---------------------------------------------------------------------------------------------
// Head
// ---------------------------------------------------------------------------------------------
// Head surface in head-radius units, from polar angle th (0 = crown) and azimuth ph (0 = face,
// +PI/2 = the character's right). k: { jaw, chin, female }.
export function headPoint(th, ph, k) {
  const st = Math.sin(th);
  let x = st * Math.sin(ph), y = Math.cos(th), z = -st * Math.cos(ph);
  x *= 0.9; y *= 1.04; z *= z < 0 ? 0.96 : 1.07;
  if (y < 0) {
    const t = Math.pow(Math.min(1, -y / 1.04), 1.35);
    x *= 1 - k.jaw * t;
    if (z > 0) z *= 1 - 0.42 * t;
    else z -= k.chin * t * Math.max(0, 1 - Math.abs(x) * 1.7);
    y -= 0.05 * t;
  }
  if (z < 0) {
    const fr = Math.min(1, -z * 2.5);
    x *= 1 + 0.04 * Math.exp(-(((y + 0.14) / 0.2) ** 2)) * fr;
    z -= 0.035 * Math.exp(-(((y - 0.19) / 0.09) ** 2)) * Math.max(0, 1 - Math.abs(x) * 1.4) * fr;
    for (const s of [-1, 1]) z += 0.03 * Math.exp(-(((x - s * 0.32) / 0.12) ** 2 + ((y + 0.005) / 0.085) ** 2)) * fr;
  }
  return [x, y, z];
}
// Surface z (head units) on the face at (x, y): search along the front.
function faceZ(k, x, y) {
  const ph = Math.asin(clamp(x / 0.92, -0.95, 0.95));
  const th = Math.acos(clamp(y / 1.04, -0.98, 0.98));
  return headPoint(th, ph, k)[2];
}

export function faceRecipe(spec) {
  const look = spec.lookRaw || {};
  if (spec.variant === 'goblin' || spec.variant === 'troll') {
    return { style: spec.variant, skin: spec.skin, brow: '#' + C(spec.skin).multiplyScalar(0.4).getHexString(), old: false, female: false };
  }
  const h = hashStr(spec.key);
  const hair = spec.hairColor;
  const lumH = (() => { const c = C(hair); return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; })();
  let brow = hair;
  if (lumH > 0.55) brow = '#' + C(hair).lerp(C('#6a4a30'), spec.old ? 0.25 : 0.45).getHexString();
  const npc = !!spec.npc;
  const exprs = ['neutral', 'smile', 'neutral', 'kind', 'smile'];
  return {
    female: !!spec.female, old: !!spec.old, skin: spec.skin,
    iris: spec.eyes || IRIS[h % IRIS.length], brow, lip: look.lip || null,
    expr: look.expr || (npc ? (spec.old ? (h % 3 ? 'kind' : 'stern') : exprs[h % exprs.length]) : 'neutral'),
    blush: !!spec.female && !spec.old, stubble: spec.beard === 'stubble' || (!spec.female && !spec.beard && !spec.old && npc && h % 4 === 0),
    freckles: !!look.freckles || (npc && !spec.old && h % 7 === 3), scar: !!look.scar,
    tired: !!look.tired,
  };
}

export function addHeadH(ctx, o = {}) {
  const { B, spec, hr, headC } = ctx;
  const skin = C(o.skin || spec.skin);
  const k = { jaw: spec.female ? 0.34 : 0.27, chin: spec.female ? 0.05 : 0.075 };
  ctx.headK = k;
  const R = hr;
  const rows = 20, cols = 32;
  const per = cols + 1;
  const pos = new Float32Array((rows + 1) * per * 3), ang = [];
  for (let i = 0; i <= rows; i++) {
    const th = (i / rows) * Math.PI;
    for (let j = 0; j <= cols; j++) {
      const ph = -Math.PI + (j / cols) * TAU;
      const p = headPoint(th, ph, k);
      const v = i * per + j;
      pos[v * 3] = p[0] * R; pos[v * 3 + 1] = p[1] * R; pos[v * 3 + 2] = p[2] * R;
      ang.push(ph);
    }
  }
  // Full grid for seamless normals.
  const idxAll = [], front = [], back = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * per + j, b2 = a + 1, d = a + per, e = d + 1;
    const tri = [a, b2, d, b2, e, d]; // outward (theta runs down, phi runs to the right)
    idxAll.push(...tri);
    const phc = -Math.PI + ((j + 0.5) / cols) * TAU;
    (Math.abs(phc) < 1.45 ? front : back).push(...tri);
  }
  const full = new THREE.BufferGeometry();
  full.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  full.setIndex(idxAll);
  full.computeVertexNormals();
  // Seam at ph = +-PI: average the duplicated column's normals.
  const nrm = full.attributes.normal;
  for (let i = 0; i <= rows; i++) {
    const a = i * per, b2 = i * per + cols;
    const nx = nrm.getX(a) + nrm.getX(b2), ny = nrm.getY(a) + nrm.getY(b2), nz = nrm.getZ(a) + nrm.getZ(b2);
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(a, nx / l, ny / l, nz / l); nrm.setXYZ(b2, nx / l, ny / l, nz / l);
  }
  const patch = (index) => {
    const used = new Map(), P = [], N = [];
    const out = [];
    for (const v of index) {
      if (!used.has(v)) { used.set(v, P.length / 3); P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); N.push(nrm.getX(v), nrm.getY(v), nrm.getZ(v)); }
      out.push(used.get(v));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setIndex(out);
    return g;
  };
  // Skin shading painted per vertex: warm cheeks, cooler temples, a touch darker under the jaw.
  const hc = ctx.B.P(HB.head, headC[0], headC[1], headC[2]);
  const skinFn = (x, y, z, base) => {
    const lx = (x - hc.x) / R, ly = (y - hc.y) / R, lz = (z - hc.z) / R;
    _c.copy(skin);
    const front = Math.max(0, -lz);
    const cheek = Math.exp(-(((Math.abs(lx) - 0.45) / 0.22) ** 2 + ((ly + 0.3) / 0.2) ** 2)) * front;
    _c.lerp(C('#d86a5a'), 0.1 * cheek);
    if (ly < -0.55) _c.multiplyScalar(1 - 0.12 * smooth01(-0.55, -1.0, ly));
    if (spec.hair === 'mohawk' && ly > 0.2 && Math.abs(lx) > 0.16) _c.lerp(C(spec.hairColor), 0.32 * smooth01(0.2, 0.5, ly));
    return _c;
  };
  const cell = faceCell(faceRecipe(spec));
  ctx.faceCell = cell;
  const at = headC;
  B.add(patch(front), HB.head, skin, { at, keepNormals: true, uvFn: (x, y) => faceUV(cell, x / R, y / R), colorFn: skinFn, jitter: 0 });
  B.add(patch(back), HB.head, skin, { at, keepNormals: true, colorFn: skinFn, jitter: 0 });
  // Nose: a short bridge and a small rounded tip with wings, mostly sunk into the face.
  const nk = (o.nose ?? 1) * (spec.female ? 0.85 : 1);
  if (nk > 0) B.add(new THREE.SphereGeometry(1, 12, 10), HB.head, skin, { at: [headC[0], headC[1] - 0.17 * R, headC[2] + faceZ(k, 0, -0.17) * R + 0.045 * R], scale: [0.055 * R * nk, 0.13 * R * nk, 0.05 * R * nk], rot: [-0.35, 0, 0], jitter: 0 });
  if (nk > 0) B.add(new THREE.SphereGeometry(1, 12, 10), HB.head, mix(skin, '#d07a6a', 0.05), { at: [headC[0], headC[1] - 0.265 * R, headC[2] + faceZ(k, 0, -0.265) * R + 0.012 * R], scale: [0.068 * R * nk, 0.055 * R * nk, 0.05 * R * nk], jitter: 0 });
  // Ears.
  if (!o.noEars) {
    for (const s of [-1, 1]) {
      const g = new THREE.SphereGeometry(1, 10, 8);
      B.add(g, HB.head, skin, {
        at: [headC[0] + s * 0.86 * R, headC[1] - 0.05 * R, headC[2] + 0.06 * R], scale: [0.09 * R, 0.27 * R, 0.17 * R], rot: [0.22, 0, s * 0.18],
        colorFn: (x, y, z) => { const lx = (x - headC[0]) * s; return _c.copy(skin).multiplyScalar(lx > 0.9 * R && z < headC[2] + 0.06 * R ? 0.8 : 1); }, jitter: 0,
      });
    }
  }
  // Eyelids (blink): skin patches over the painted eyes on the eyes bone; the driver scales the
  // bone from ~0 (open) to 1 (closed).
  const ez = headC[2];
  const eyesZ = -hr * 0.84;
  for (const s of [-1, 1]) {
    const lid = new THREE.BufferGeometry();
    const P = [], Cc = [], I = [];
    const brute = spec.variant === 'goblin';
    const xs = brute ? [0.16, 0.24, 0.32, 0.4, 0.48, 0.52] : [0.17, 0.23, 0.29, 0.35, 0.41, 0.47];
    const ys = brute ? [0.16, 0.1, 0.05, 0.0, -0.04, -0.08, -0.12] : [0.115, 0.07, 0.03, -0.005, -0.03, -0.055, -0.085];
    const lash = shade(skin, 0.42), lidC = shade(skin, 0.93);
    for (let i = 0; i < ys.length; i++) for (let j = 0; j < xs.length; j++) {
      const x = s * xs[j], y = ys[i];
      const z = faceZ(k, x, y) - 0.02;
      P.push(x * R, y * R, (z * R + ez) - eyesZ);
      const cc = Math.abs(y - (brute ? -0.04 : -0.03)) < 0.012 ? lash : lidC;
      Cc.push(cc.r, cc.g, cc.b);
    }
    for (let i = 0; i < ys.length - 1; i++) for (let j = 0; j < xs.length - 1; j++) {
      const a = i * xs.length + j, b2 = a + 1, d = a + xs.length, e = d + 1;
      if (s > 0) I.push(a, b2, d, b2, e, d); else I.push(a, d, b2, b2, d, e);
    }
    lid.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    lid.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    lid.setIndex(I);
    B.add(lid, HB.eyes, '#fff', { keepColor: true, ao: false, jitter: 0 });
  }
  spec.lids = true;
}

// ---------------------------------------------------------------------------------------------
// Hair: a shell over the head shape. Rows run from the crown (or the hat line when covered) to
// the hairline, which follows each style's outline exactly; lock ridges and darker grooves give
// sculpted clumps; a sheen band sits across the crown.
// ---------------------------------------------------------------------------------------------
const HAIRLINES = {
  short: [[0, 1.06], [0.55, 1.1], [0.95, 1.3], [1.3, 1.66], [1.58, 1.44], [1.95, 1.78], [2.6, 2.06], [Math.PI, 2.1]],
  long: [[0, 0.98], [0.6, 1.1], [1.05, 1.62], [1.35, 2.2], [1.7, 2.38], [2.4, 2.52], [Math.PI, 2.56]],
  pulled: [[0, 1.08], [0.25, 1.0], [0.75, 1.1], [1.2, 1.46], [1.58, 1.4], [2.0, 1.84], [2.6, 2.12], [Math.PI, 2.18]],
  tonsure: [[0, 1.1], [0.9, 1.3], [1.3, 1.62], [1.58, 1.44], [2.0, 1.8], [Math.PI, 2.05]],
};
function lineAt(tab, ph) {
  const a = Math.abs(ph);
  for (let i = 0; i < tab.length - 1; i++) {
    if (a <= tab[i + 1][0]) { const t = smooth01(tab[i][0], tab[i + 1][0], a); return lerp(tab[i][1], tab[i + 1][1], t); }
  }
  return tab[tab.length - 1][1];
}

export function addHairH(ctx, covered) {
  const { B, spec, hr, headC } = ctx;
  const style = spec.hair;
  if (style === 'bald') return;
  const k = ctx.headK;
  const base = hairBase(spec.hairColor);
  const R = hr;
  const lightHair = 0.3 * base.r + 0.59 * base.g + 0.11 * base.b > 0.45;
  let tab = HAIRLINES.short, thick = 0.075, vol = 0.08, nL = 12, lockAmp = 0.075, teeth = 0.2, top = 0.0, shine = 0.15, fringeK = 1;
  if (style === 'long') { tab = HAIRLINES.long; thick = 0.08; vol = 0.04; nL = 15; lockAmp = 0.045; teeth = 0.1; }
  if (style === 'ponytail' || style === 'bun' || style === 'braid' || style === 'slick') { tab = HAIRLINES.pulled; thick = 0.045; vol = 0.01; nL = 20; lockAmp = 0.02; teeth = 0.04; shine = style === 'slick' ? 0.5 : 0.25; }
  if (style === 'tonsure') { tab = HAIRLINES.tonsure; top = 0.62; thick = 0.05; vol = 0; teeth = 0.05; }
  if (style === 'mohawk') { addMohawk(ctx); return; }
  if (covered) { top = Math.max(top, 1.28); vol = 0; }
  const cols = 40, rows = 10;
  const per = cols + 1;
  const ridge = (ph) => { const r = 0.5 + 0.5 * Math.cos(nL * ph + 0.7 * Math.sin(3 * ph) + 0.4); return r * r; };
  const part = style === 'long' || style === 'slick' ? 0.3 : null;
  const P = [], Cc = [];
  const tuck = 2;
  for (let j = 0; j <= cols; j++) {
    const ph = -Math.PI + (j / cols) * TAU;
    const rg = ridge(ph);
    const front = Math.max(0, Math.cos(ph));
    const thH = lineAt(tab, ph) + teeth * fringeK * rg * (0.4 + 0.6 * front) * (front > 0.2 || style !== 'short' ? 1 : 0.6);
    for (let i = 0; i <= rows + tuck; i++) {
      let th, rr, edge = 0;
      if (i <= rows) {
        th = top + (thH - top) * (i / rows);
        const crownK = smooth01(0.1, 0.9, (th - top) / Math.max(0.01, thH - top));
        rr = 1 + thick + vol * Math.max(0, Math.cos(th)) ** 2 + lockAmp * rg * crownK * (style === 'short' ? 1 + 0.4 * front : 1);
        if (part !== null) rr -= 0.03 * Math.exp(-(((ph - part) / 0.07) ** 2)) * (1 - smooth01(0.4, 1.0, th));
        // Messy tips for short hair.
        if (style === 'short') rr += 0.012 * Math.sin(ph * 7 + th * 9);
        // Thin toward the hairline so the edge is a clean lip.
        rr = 1 + (rr - 1) * (1 - 0.45 * smooth01(0.75, 1.0, i / rows));
      } else {
        th = thH + 0.02 * (i - rows);
        rr = i === rows + 1 ? 1 + thick * 0.35 : 0.97;
        edge = 1;
      }
      const p = headPoint(Math.min(th, Math.PI - 0.02), ph, k);
      P.push(p[0] * rr * R, p[1] * rr * R, p[2] * rr * R);
      // Colour: grooves darker, sheen band across the crown, dark underside at the edge.
      const crown = Math.exp(-(((th - 0.72) / 0.26) ** 2)) * (0.5 + 0.5 * front);
      let kc = 0.66 + 0.46 * rg;
      if (edge) kc *= 0.55;
      _c.copy(base).multiplyScalar(kc);
      // Sheen band: brightens light hair, lifts dark hair toward a cool highlight.
      _c.lerp(lightHair ? _c.clone().multiplyScalar(1.35) : SHEEN.clone().lerp(base, 0.35), crown * (lightHair ? 0.6 : 0.42) * (0.6 + 0.4 * rg));
      Cc.push(_c.r, _c.g, _c.b);
    }
  }
  const nr = rows + tuck + 1;
  const I = [];
  for (let j = 0; j < cols; j++) for (let i = 0; i < nr - 1; i++) {
    const a = j * nr + i, b2 = a + 1, d = a + nr, e = d + 1;
    I.push(a, b2, d, b2, e, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  g.setIndex(I);
  orientOutward(g);
  B.add(g, HB.head, base, { at: headC, keepColor: true, shine, jitter: 0.02 });
  if (covered) return;
  if (style === 'short') addTufts(ctx, base, thick + vol);
  if (style === 'long') addCurtain(ctx, base, nL);
  if (style === 'ponytail') addPonytail(ctx, base);
  if (style === 'bun') addBun(ctx, base);
  if (style === 'braid') addBraid(ctx, base);
}

// A few tapered locks lifting off the crown and nape so short hair isn't a smooth cap.
function addTufts(ctx, base, lift) {
  const { B, hr: R } = ctx;
  const k = ctx.headK;
  const tufts = [[0.3, Math.PI, 0.24], [0.5, 2.6, 0.2], [0.5, -2.6, 0.2]];
  for (const [th, ph, len] of tufts) {
    const p = headPoint(th, ph, k);
    const n = V(p[0], p[1], p[2]).normalize();
    // Sweep back and down from the crown, forward over the brow for front tufts.
    const front = Math.cos(ph) > 0.3;
    const sweep = front ? V(Math.sin(ph) * 0.4, -0.5, -0.8) : V(Math.sin(ph) * 0.3, -0.35, 0.9);
    const pts = [0, 0.5, 1].map((t) => {
      const r = 1 + lift * 0.7 + t * len * 0.55;
      return V(p[0] * r, p[1] * r, p[2] * r).addScaledVector(sweep.clone().normalize(), t * len * 0.75).addScaledVector(n, -0.02);
    });
    const rings = pts.map((q, i) => ({ p: headLocalToModel(ctx, q.x * R, q.y * R, q.z * R), rx: [0.1, 0.07, 0.012][i] * R, rf: [0.06, 0.04, 0.01][i] * R, rb: [0.06, 0.04, 0.01][i] * R, w: [[HB.head, 1]], ref: n }));
    B.add(loft(rings, { radial: 6, caps: [false, true], color: (u, a, i, out) => out.copy(base).multiplyScalar(0.8 + 0.3 * u) }), null, base, { keepColor: true, keepSkin: true, jitter: 0.03 });
  }
}

function headLocalToModel(ctx, x, y, z) {
  return ctx.B.P(HB.head, ctx.headC[0] + x, ctx.headC[1] + y, ctx.headC[2] + z);
}
function hairW(ctx, t) { return [[HB.head, 1 - t], [HB.hair, t]]; }

function addCurtain(ctx, base, nL) {
  const { B, hr: R } = ctx;
  const k = ctx.headK;
  // Chunky locks fanned around the back of the head, each a tapered flattened loft that starts
  // inside the hair shell and ends in a soft point; outer locks are shorter and swing forward.
  const locks = [-1.0, -0.66, -0.33, 0, 0.33, 0.66, 1.0];
  locks.forEach((t, li) => {
    const ph = Math.PI + t * 1.15; // around the back
    const len = 2.15 - Math.abs(t) * 0.45 + ((li * 37) % 5) * 0.05;
    const p0 = headPoint(1.7, ph, k);
    const out = V(p0[0], 0, p0[2]).normalize();
    const pts = [];
    for (let i = 0; i <= 5; i++) {
      const u = i / 5;
      const y = -0.25 - u * len;
      // Hang straight down, resting on the back/shoulders (pushed outward a bit as it falls).
      const r = 0.98 + 0.12 * Math.sin(Math.min(1, u * 1.6) * Math.PI / 2);
      const lay = (li % 2) * 0.035; // alternate locks sit a little proud so overlaps don't flicker
      pts.push([p0[0] * r + out.x * (0.05 * u + lay), y, p0[2] * r + out.z * (0.12 + 0.1 * u + lay) + 0.05 * u]);
    }
    const rings = pts.map((p, i) => {
      const u = i / 5;
      const w = (0.34 - 0.05 * Math.abs(t)) * (1 - 0.7 * u * u) + 0.01;
      return { p: headLocalToModel(ctx, p[0] * R, p[1] * R, p[2] * R), rx: w * R, rf: 0.07 * R * (1 - 0.5 * u), rb: 0.07 * R * (1 - 0.5 * u), w: hairW(ctx, smooth01(0, 1, u) * 0.8), ref: V(out.x, 0, out.z) };
    });
    B.add(loft(rings, {
      radial: 8, sq: 0.85, caps: [true, true],
      color: (u, a, i, o2) => o2.copy(base).multiplyScalar((0.62 + 0.4 * Math.abs(Math.cos(a))) * (1 - 0.18 * u)),
    }), null, base, { keepColor: true, keepSkin: true, shine: 0.15, jitter: 0.02 });
  });
}
function addPonytail(ctx, base) {
  const { B, hr: R } = ctx;
  const tie = headLocalToModel(ctx, 0, 0.05 * R, 0.98 * R);
  B.add(new THREE.TorusGeometry(0.11 * R, 0.045 * R, 6, 12), null, '#7a2a22', { at: [tie.x, tie.y, tie.z], rot: [0.3, 0, 0], weights: () => [[HB.head, 1]] });
  const pts = [[0, 0.06, 1.0], [0, -0.1, 1.22], [0, -0.55, 1.3], [0, -1.05, 1.18], [0, -1.5, 1.05]];
  const rad = [0.2, 0.22, 0.17, 0.12, 0.05];
  const rings = pts.map((p, i) => ({ p: headLocalToModel(ctx, p[0], p[1] * R, p[2] * R), rx: rad[i] * R, rf: rad[i] * R * 0.85, rb: rad[i] * R * 0.85, w: hairW(ctx, i / (pts.length - 1)) }));
  B.add(loft(rings, { radial: 12, ref: V(1, 0, 0), mod: (u, a) => 1 + 0.08 * Math.cos(a * 5), color: (u, a, i, out) => out.copy(base).multiplyScalar(0.75 + 0.3 * (0.5 + 0.5 * Math.cos(a * 5))) }), null, base, { keepColor: true, keepSkin: true, shine: 0.2 });
}
function addBun(ctx, base) {
  const { B, hr: R, headC } = ctx;
  const at = [headC[0], headC[1] + 0.55 * R, headC[2] + 0.78 * R];
  B.add(new THREE.SphereGeometry(0.34 * R, 14, 10), HB.head, base, {
    at, scale: [1, 0.9, 0.95],
    colorFn: (x, y, z) => { const a = Math.atan2(z - at[2], x - at[0]) + (y - at[1]) * 40; return _c.copy(base).multiplyScalar(0.75 + 0.3 * (0.5 + 0.5 * Math.sin(a * 3))); },
    shine: 0.25,
  });
  B.add(new THREE.TorusGeometry(0.25 * R, 0.04 * R, 5, 12), HB.head, '#7a2a22', { at: [at[0], at[1] - 0.12 * R, at[2] - 0.05 * R], rot: [1.0, 0, 0] });
}
function addBraid(ctx, base) {
  const { B, hr: R } = ctx;
  const pts = [[0.5, -0.2, 0.8], [0.75, -0.65, 0.55], [0.95, -1.15, 0.05], [1.0, -1.65, -0.35], [1.0, -2.15, -0.5]];
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => headLocalToModel(ctx, p[0] * R, p[1] * R, p[2] * R)));
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const p = curve.getPointAt(t);
    B.add(new THREE.SphereGeometry(0.2 * R * (1 - t * 0.35), 9, 7), null, base, { at: [p.x, p.y, p.z], scale: [1, 1.35, 1], rot: [0, 0, (i % 2 ? 0.35 : -0.35)], weights: () => hairW(ctx, t * 0.8), shine: 0.2 });
  }
  const end = curve.getPointAt(1);
  B.add(new THREE.TorusGeometry(0.1 * R, 0.035 * R, 5, 10), null, '#b8322a', { at: [end.x, end.y + 0.02, end.z], rot: [Math.PI / 2, 0, 0], weights: () => hairW(ctx, 0.8) });
}
function addMohawk(ctx) {
  const { B, spec, hr: R } = ctx;
  const k = ctx.headK;
  const base = hairBase(spec.hairColor);
  const path = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const th = t < 0.4 ? lerp(0.95, 0.0, t / 0.4) : lerp(0.0, 2.0, (t - 0.4) / 0.6);
    const ph = t < 0.4 ? 0 : Math.PI;
    const p = headPoint(Math.max(0.001, th), ph, k);
    path.push(headLocalToModel(ctx, p[0] * R, p[1] * R, p[2] * R));
  }
  const rings = path.map((p, i) => ({ p, rx: (0.28 + 0.12 * Math.sin((i / 10) * Math.PI)) * R, rf: 0.09 * R, rb: 0.09 * R, w: [[HB.head, 1]] }));
  B.add(loft(rings, {
    radial: 12, ref: V(1, 0, 0), sq: 0.7,
    mod: (u, a) => 1 + 0.25 * Math.abs(Math.cos(a)) * Math.abs(Math.sin(u * Math.PI * 6)),
    color: (u, a, i, out) => out.copy(base).multiplyScalar(0.8 + 0.3 * Math.max(0, Math.cos(a))),
  }), null, base, { keepColor: true, keepSkin: true, shine: 0.2 });
}

// ---------------------------------------------------------------------------------------------
// Beards
// ---------------------------------------------------------------------------------------------
export function addBeardH(ctx) {
  const { B, spec, hr: R, headC } = ctx;
  const st = spec.beard;
  if (!st || st === 'stubble') return;
  const k = ctx.headK;
  const base = hairBase(spec.hairColor);
  const tab = [[0, 2.2], [0.32, 2.16], [0.6, 1.98], [1.0, 1.84], [1.35, 1.66], [1.55, 1.5]];
  const ext = st === 'long' ? 1.0 : st === 'full' ? 0.32 : 0.0;
  const thick = st === 'short' ? 0.045 : 0.07;
  if (st !== 'moustache') {
    const cols = 26, rows = 9, phMax = 1.55;
    const P = [], Cc = [];
    for (let j = 0; j <= cols; j++) {
      const ph = -phMax + (j / cols) * 2 * phMax;
      const th0 = lineAt(tab, ph);
      const rg = 0.5 + 0.5 * Math.cos(ph * 14);
      for (let i = 0; i <= rows + 1; i++) {
        let th, rr, edge = 0;
        if (i <= rows) { th = th0 + (Math.PI - 0.32 - th0) * (i / rows); rr = 1 + thick + 0.02 * rg; }
        else { th = th0 - 0.03; rr = 0.97; edge = 1; }
        // Side edges tuck in too.
        const sideK = smooth01(phMax - 0.05, phMax - 0.25, Math.abs(ph));
        rr = 1 + (rr - 1) * sideK - (1 - sideK) * 0.03;
        let [x, y, z] = headPoint(th, ph, k);
        x *= rr; y *= rr; z *= rr;
        // Chin extension (full / long beards hang down and forward).
        const w = Math.exp(-((ph / 0.62) ** 2)) * smooth01(2.15, 2.75, th);
        y -= ext * w; z -= ext * 0.25 * w; x *= 1 - 0.25 * w * (ext > 0.5 ? 1 : 0.3);
        P.push(x * R, y * R, z * R);
        let kc = (0.72 + 0.35 * rg) * (edge ? 0.6 : 1) * (1 - 0.15 * w);
        _c.copy(base).multiplyScalar(kc);
        Cc.push(_c.r, _c.g, _c.b);
      }
    }
    const nr = rows + 2, I = [];
    for (let j = 0; j < cols; j++) for (let i = 0; i < nr - 1; i++) {
      const a = j * nr + i, b2 = a + 1, d = a + nr, e = d + 1;
      I.push(a, d, b2, b2, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    g.setIndex(I);
    orientOutward(g);
    B.add(g, HB.head, base, { at: headC, keepColor: true, jitter: 0.03, flat: st === 'long' });
  }
  // Moustache: two tapered locks from under the nose to the mouth corners.
  for (const s of [-1, 1]) {
    const pts = [[0.02, -0.37], [0.13, -0.42], [0.24, -0.5], [0.28, st === 'moustache' || st === 'short' ? -0.56 : -0.64]];
    const rad = [0.055, 0.065, 0.05, 0.022];
    const rings = pts.map(([x, y], i) => {
      const z = faceZ(k, s * x, y) - 0.035;
      return { p: headLocalToModel(ctx, s * x * R, y * R, z * R), rx: rad[i] * R, rf: rad[i] * R * 0.75, rb: rad[i] * R * 0.75, w: [[HB.head, 1]] };
    });
    B.add(loft(rings, { radial: 8, ref: V(0, 0, -1), color: (u, a, i, out) => out.copy(base).multiplyScalar(0.8 + 0.2 * Math.cos(a)) }), null, base, { keepColor: true, keepSkin: true, jitter: 0.02 });
  }
}

// ---------------------------------------------------------------------------------------------
// Front panels that follow the body (aprons, tabards): angle range around the front.
// ---------------------------------------------------------------------------------------------
export function addPanelH(ctx, color, yTop, yBottom, half, o = {}) {
  const { B, yHips, W, spec } = ctx;
  const hemR = { rx: 0.22 * W, rf: (0.15 + spec.b.belly * 0.6) * (1 + (W - 1) * 0.6), rb: 0.16 };
  const steps = 8, cols = 10;
  const P = [], Cc = [], SI = [], SW = [];
  const c = C(color), trim = C(o.trim || shade(color, 0.8));
  const back = !!o.back;
  for (let i = 0; i <= steps; i++) {
    const y = yTop - (i / steps) * (yTop - yBottom);
    let r;
    const off = o.offset ?? 0.018;
    if (y > yHips - 0.03) r = torsoAt(ctx, y, off);
    else { const t = smooth01(yHips - 0.03, yHips - 0.2, y); const r0 = torsoAt(ctx, yHips - 0.03, off); r = { rx: lerp(r0.rx, hemR.rx + off, t), rf: lerp(r0.rf, hemR.rf + off, t), rb: lerp(r0.rb, hemR.rb + off, t) }; }
    const hw = typeof half === 'function' ? half(y) : half;
    const a0 = o.center ?? (back ? -Math.PI / 2 : Math.PI / 2);
    for (let j = 0; j <= cols; j++) {
      const a = a0 + (j / cols - 0.5) * 2 * hw;
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = ca * r.rx, z = -(sa > 0 ? r.rf : r.rb) * sa;
      P.push(x, y, z);
      const cc = (i === steps && o.trimHem !== false) || ((j === 0 || j === cols) && o.trimSides !== false) || (i === 0 && o.trimTop) ? trim : (o.colorAt ? o.colorAt(i / steps, j / cols) : c);
      Cc.push(cc.r, cc.g, cc.b);
      const w = y > yHips + 0.1 ? ctx.torsoW(x, y) : (() => { const f = smooth01(yHips, yBottom, y) * 0.7; const wl = clamp(0.5 - x / 0.3, 0, 1); return [[HB.hips, 1 - f], [HB.thL, f * wl], [HB.thR, f * (1 - wl)]]; })();
      const sum = w.reduce((s2, q) => s2 + q[1], 0) || 1;
      for (let q = 0; q < 4; q++) { SI.push(q < w.length ? w[q][0] : 0); SW.push(q < w.length ? w[q][1] / sum : 0); }
    }
  }
  const I = [];
  const per = cols + 1;
  for (let i = 0; i < steps; i++) for (let j = 0; j < cols; j++) {
    const a = i * per + j, b2 = a + 1, d = a + per, e = d + 1;
    I.push(a, d, b2, b2, d, e);
  }
  const mk = (flip, k) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(Cc.map((v) => v * k), 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    g.setIndex(flip ? I.map((v, i) => (i % 3 === 1 ? I[i + 1] : i % 3 === 2 ? I[i - 1] : v)) : I.slice());
    return g;
  };
  B.add(mk(false, 1), null, color, { keepColor: true, keepSkin: true, jitter: 0.03 });
  B.add(mk(true, 0.55), null, color, { keepColor: true, keepSkin: true, jitter: 0 });
}

// Flip the winding if most normals point toward the local origin (shells around the head).
function orientOutward(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  let sum = 0;
  for (let i = 0; i < p.count; i++) sum += p.getX(i) * n.getX(i) + p.getY(i) * n.getY(i) + p.getZ(i) * n.getZ(i);
  if (sum < 0) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
  g.deleteAttribute('normal');
}

// ---------------------------------------------------------------------------------------------
// Accessories and garments (look fields): vest, bodice, dress, shawl, satchel, sash, necklace,
// glasses, eyepatch, earrings, bandana, flower, pipe.
// ---------------------------------------------------------------------------------------------
const ACC_KEYS = ['vest', 'bodice', 'dress', 'shawl', 'satchel', 'sash', 'necklace', 'glasses', 'eyepatch', 'earrings', 'bandana', 'flower', 'pipe', 'gloves', 'belt'];
export function accessoryKey(look) { const o = {}; for (const k of ACC_KEYS) if (look[k]) o[k] = look[k]; return o; }
const colorOf = (v, def) => (typeof v === 'string' && v[0] === '#' ? v : def);

// A point on the torso surface (model space) at angle a (0 = right side, PI/2 = front).
function torsoPoint(ctx, a, y, off) {
  const r = torsoAt(ctx, y, off);
  const s = Math.sin(a);
  return V(Math.cos(a) * r.rx, y, -(s > 0 ? r.rf : r.rb) * s);
}
// Strap / sash looping diagonally around the torso: highest at angle aTop (yTop), lowest
// opposite (yLow). width / thick in metres.
function addStrap(ctx, color, aTop, yTop, yLow, width, thick, off = 0.02) {
  const { B } = ctx;
  const n = 40, rings = [];
  for (let i = 0; i <= n; i++) {
    const a = aTop + (i / n) * TAU;
    const y = yTop - (yTop - yLow) * (0.5 - 0.5 * Math.cos(a - aTop));
    const p = torsoPoint(ctx, a, y, off + thick / 2);
    const rad = V(p.x, 0, p.z).normalize();
    rings.push({ p, rx: width / 2, rf: thick / 2, rb: thick / 2, w: ctx.torsoW(p.x, y), ref: rad });
  }
  const c = C(color);
  B.add(loft(rings, { radial: 6, sq: 0.6, caps: [false, false], color: (u, a, i, out) => out.copy(c) }), null, color, { keepColor: true, keepSkin: true, jitter: 0.03 });
}

export function addAccessoriesH(ctx) {
  const { B, spec, hr: R, headC, yHips, yChest, yNeck, b } = ctx;
  const look = spec.lookRaw || {};
  const k = ctx.headK;
  const yS = yChest + 0.15 * b.torso;
  const gold = '#d8b04a';
  // Dress (long skirt) and laced bodice.
  if (look.dress) {
    const dc = colorOf(look.dress, spec.bottom);
    addHemH(ctx, dc, 0.1, { flare: 0.05, top: 0.05, trim: shade(dc, 0.7), extra: 0.006 });
  }
  if (look.bodice || look.vest) {
    const vc = colorOf(look.bodice || look.vest, '#4a3424');
    const top = look.bodice ? yChest + 0.1 : yS + 0.01;
    const bot = look.bodice ? yHips + 0.03 : yHips - 0.04;
    const gap = look.bodice ? 0.12 : 0.2;
    const trim = shade(vc, look.bodice ? 1.3 : 0.7);
    for (const side of [-1, 1]) {
      const half = (Math.PI / 2 - gap) / 2 + 0.25;
      addPanelH(ctx, vc, top, bot, half, { center: Math.PI / 2 + side * (gap + half - 0.0), trim, offset: 0.014, trimSides: true });
    }
    addPanelH(ctx, vc, top + 0.01, bot, 1.05, { center: -Math.PI / 2, trim, offset: 0.014 });
    if (look.bodice) {
      // Lacing across the front opening.
      for (let i = 0; i < 4; i++) {
        const y = top - 0.03 - i * ((top - bot - 0.04) / 3.2);
        const p = torsoPoint(ctx, Math.PI / 2, y, 0.022);
        B.add(new THREE.BoxGeometry(0.075, 0.006, 0.006), null, '#e8dcc0', { matrix: new THREE.Matrix4().makeTranslation(p.x, p.y, p.z), rot: [0, 0, i % 2 ? 0.5 : -0.5], weights: ctx.torsoW });
      }
    } else {
      // Two buttons on the right panel.
      for (let i = 0; i < 2; i++) { const p = torsoPoint(ctx, Math.PI / 2 - gap - 0.05, yChest + 0.05 - i * 0.09, 0.022); B.add(new THREE.SphereGeometry(0.011, 6, 5), null, gold, { at: [p.x, p.y, p.z], weights: ctx.torsoW, shine: 0.9 }); }
    }
  }
  if (look.shawl) {
    const sc = colorOf(look.shawl, '#8a5a6a');
    const rows = [[yNeck - 0.004, 0.0], [yS + 0.015, 0.05], [yS - 0.03, 0.075], [yChest + 0.03, 0.06]];
    const rings = rows.map(([y, e]) => { const r = torsoAt(ctx, y, 0.022 + e * 0.3); return { p: V(0, y, 0), rx: r.rx + e, rf: r.rf + e * 0.4, rb: r.rb + e * 0.5, w: [[HB.chest, 1]] }; });
    B.add(loft(rings, { radial: 24, sq: 0.9, caps: [false, false], mod: (u, a) => 1 + (u > 0.6 ? 0.05 * Math.max(0, Math.sin(a)) : 0), color: (u, a, i, out) => out.copy(u > 0.85 ? shade(sc, 0.75) : C(sc)) }), null, sc, { keepColor: true, keepSkin: true, jitter: 0.03 });
    const p = torsoPoint(ctx, Math.PI / 2, yChest + 0.06, 0.07);
    B.add(new THREE.SphereGeometry(0.018, 8, 6), null, gold, { matrix: new THREE.Matrix4().makeTranslation(p.x, p.y, p.z), shine: 1, weights: () => [[HB.chest, 1]] });
  }
  if (look.sash) addStrap(ctx, colorOf(look.sash, '#a8322a'), 0.35, yNeck - 0.02, yHips + 0.0, 0.07, 0.012, 0.016);
  if (look.satchel) {
    const sc = colorOf(look.satchel, '#6a4a2a');
    addStrap(ctx, shade(sc, 0.8), 0.3, yNeck - 0.015, yHips - 0.02, 0.028, 0.008, 0.018);
    const p = torsoPoint(ctx, Math.PI + 0.25, yHips - 0.06, 0.07);
    B.add(new THREE.SphereGeometry(1, 10, 8), null, sc, { at: [p.x, p.y, p.z], scale: [0.04, 0.085, 0.11], weights: () => [[HB.hips, 1]], jitter: 0.05 });
    B.add(new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI * 0.45), null, shade(sc, 0.75), { at: [p.x, p.y + 0.02, p.z], scale: [0.045, 0.085, 0.115], weights: () => [[HB.hips, 1]] });
  }
  if (look.necklace) {
    const nc = colorOf(look.necklace, gold);
    const rings = [-1, 0, 1].map((t) => { const y = yS + 0.01 + t * 0.004; const r = torsoAt(ctx, y, 0.012); return { p: V(0, y - 0.035, -0.012), rx: r.rx * 0.62, rf: r.rf * 0.95 + 0.02, rb: r.rb * 0.7, w: [[HB.chest, 1]] }; });
    B.add(loft(rings, { radial: 20, caps: [false, false], color: (u, a, i, out) => out.copy(C(nc)) }), null, nc, { keepColor: true, keepSkin: true, shine: 1 });
    const p = torsoPoint(ctx, Math.PI / 2, yS - 0.06, 0.02);
    B.add(new THREE.OctahedronGeometry(0.022, 0), null, look.necklace === true ? '#3fa0c8' : '#c83a4a', { at: [p.x, p.y, p.z - 0.004], scale: [0.8, 1.2, 0.5], weights: () => [[HB.chest, 1]], shine: 1, glow: 0.15, flat: true });
  }
  // Head pieces (head-local around the head centre).
  const H = (x, y, z) => [headC[0] + x * R, headC[1] + y * R, headC[2] + z * R];
  if (look.glasses) {
    const gc = colorOf(look.glasses, '#6a4a2a');
    for (const sx of [-1, 1]) {
      const z = faceZ(k, sx * 0.32, 0) - 0.06;
      B.add(new THREE.TorusGeometry(0.135 * R, 0.016 * R, 5, 16), HB.head, gc, { at: H(sx * 0.32, -0.01, z), shine: 0.8 });
      B.add(new THREE.CircleGeometry(0.13 * R, 14), HB.head, '#cfe3ea', { at: H(sx * 0.32, -0.01, z - 0.003), rot: [Math.PI, 0, 0], shine: 1, ao: false, jitter: 0, glow: 0.04 });
      const hx = sx * 0.47, hz = faceZ(k, hx, 0);
      B.add(new THREE.BoxGeometry(0.012 * R, 0.018 * R, 0.62 * R), HB.head, gc, { at: H(sx * 0.88, 0.01, (hz + 0.1) / 2 - 0.02), rot: [0, -sx * 0.1, 0] });
    }
    B.add(new THREE.BoxGeometry(0.16 * R, 0.018 * R, 0.018 * R), HB.head, gc, { at: H(0, 0.02, faceZ(k, 0, 0.02) - 0.065) });
  }
  if (look.eyepatch) {
    const z = faceZ(k, -0.32, 0) - 0.03;
    B.add(new THREE.SphereGeometry(1, 12, 8, 0, TAU, 0, Math.PI * 0.5), HB.head, '#151210', { at: H(-0.32, 0.0, z), rot: [-Math.PI / 2, 0, 0], scale: [0.17 * R, 0.08 * R, 0.14 * R] });
    B.add(new THREE.TorusGeometry(1.0 * R, 0.022 * R, 4, 24), HB.head, '#151210', { at: H(0, 0.12, 0.02), rot: [Math.PI / 2 - 0.45, 0, 0.5], scale: [0.96, 1.08, 1] });
  }
  if (look.earrings) for (const sx of [-1, 1]) B.add(new THREE.TorusGeometry(0.045 * R, 0.012 * R, 4, 10), HB.head, colorOf(look.earrings, gold), { at: H(sx * 0.88, -0.27, 0.05), rot: [0, Math.PI / 2, 0], shine: 1 });
  if (look.bandana) {
    const bc = colorOf(look.bandana, '#a8322a');
    const rows = [0.36, 0.44, 0.52];
    const rings = rows.map((yy) => {
      const th = Math.acos(clamp(yy / 1.04, -1, 1));
      const rx = Math.abs(headPoint(th, Math.PI / 2, k)[0]) * 1.1, rf = -headPoint(th, 0, k)[2] * 1.1, rb = headPoint(th, Math.PI, k)[2] * 1.1;
      const p = ctx.B.P(HB.head, headC[0], headC[1] + yy * R, headC[2]);
      return { p, rx: rx * R, rf: rf * R, rb: rb * R, w: [[HB.head, 1]] };
    });
    B.add(loft(rings, { radial: 26, caps: [false, false], color: (u, a, i, out) => out.copy(C(bc)).multiplyScalar(i === 1 ? 1.05 : 0.85) }), null, bc, { keepColor: true, keepSkin: true });
    B.add(new THREE.SphereGeometry(0.1 * R, 8, 6), HB.head, bc, { at: H(0, 0.4, 1.08), scale: [1.2, 0.9, 0.8] });
    for (const sx of [-1, 1]) B.add(new THREE.ConeGeometry(0.08 * R, 0.5 * R, 5), HB.head, shade(bc, 0.9), { at: H(sx * 0.12, 0.15, 1.12), rot: [Math.PI - 0.35, 0, sx * 0.3], scale: [1, 1, 0.35] });
  }
  if (look.flower) {
    const fc = colorOf(look.flower, '#e85a7a');
    const c0 = H(-0.82, 0.42, -0.12);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; B.add(new THREE.SphereGeometry(0.06 * R, 6, 5), HB.head, fc, { at: [c0[0] - 0.012, c0[1] + Math.sin(a) * 0.07 * R, c0[2] + Math.cos(a) * 0.07 * R], scale: [0.5, 1, 1] }); }
    B.add(new THREE.SphereGeometry(0.045 * R, 6, 5), HB.head, '#f2d04a', { at: [c0[0] - 0.02, c0[1], c0[2]] });
  }
  if (look.pipe) {
    const z = faceZ(k, 0.12, -0.55) - 0.02;
    B.add(new THREE.CylinderGeometry(0.018 * R, 0.022 * R, 0.55 * R, 6), HB.head, '#3a2416', { at: H(0.2, -0.62, z - 0.2), rot: [Math.PI / 2 + 0.35, 0, 0.25] });
    B.add(new THREE.CylinderGeometry(0.075 * R, 0.06 * R, 0.16 * R, 8), HB.head, '#5a3a22', { at: H(0.28, -0.6, z - 0.45) });
  }
}
