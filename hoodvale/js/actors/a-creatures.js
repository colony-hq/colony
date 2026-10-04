// Creature rigs: quadruped (rodent, cow, boar, wolf, bear), bird, spider, slime, wyrm (drake and
// the Ashen Wyrm), plus rigid glowing beings (shard wisp, the Orbio Oracle). Each skinned rig
// exports { defs, build(spec) -> geometry, loops, shots, die, hurt, post } used by actors.js.
// Poses: per bone (x, y, z) Euler + offset of bone 1 + scale delta of bone 1 (see a-core.js).
// Owner: actors builder.

import * as THREE from 'three';
import {
  Builder, C, shade, mix, smooth01, pos, lerp, TAU, taper, lathe, sphere, box, cyl, cone, torus, extrude,
  tube, deform, materials, glowTexture, env, spineTube, membrane,
} from './a-core.js';

const S = (P, b, x, y, z) => { const k = b * 3; P[k] = x; P[k + 1] = y; P[k + 2] = z; };
const A = (P, b, x, y, z) => { const k = b * 3; P[k] += x; P[k + 1] += y; P[k + 2] += z; };
const offset = (P, n, x, y, z) => { const o = n * 3; P[o] = x; P[o + 1] = y; P[o + 2] = z; };
const scl = (P, n, x, y, z) => { const o = n * 3 + 3; P[o] = x; P[o + 1] = y; P[o + 2] = z; };
const col = (c, f) => C(c || f);

// =============================================================================================
// Quadruped
// =============================================================================================
const QV = {
  rodent: { len: 0.6, body: [0.17, 0.15, 0.36], upper: 0.1, lower: 0.1, legR: 0.045, hipH: 0.26, neck: [0.06, -0.12], headR: 0.13, tail: [0.24, 0.022], ear: 'round', foot: 'paw', w: 0.12 },
  cow: { len: 1.15, body: [0.36, 0.34, 0.72], upper: 0.3, lower: 0.3, legR: 0.075, hipH: 0.78, neck: [0.14, -0.22], headR: 0.17, tail: [0.22, 0.028], ear: 'flop', foot: 'hoof', w: 0.22 },
  boar: { len: 0.88, body: [0.3, 0.3, 0.55], upper: 0.19, lower: 0.2, legR: 0.062, hipH: 0.5, neck: [0.08, -0.18], headR: 0.17, tail: [0.12, 0.02], ear: 'small', foot: 'hoof', w: 0.17 },
  wolf: { len: 0.92, body: [0.2, 0.23, 0.52], upper: 0.27, lower: 0.28, legR: 0.05, hipH: 0.7, neck: [0.16, -0.18], headR: 0.14, tail: [0.2, 0.06], ear: 'point', foot: 'paw', w: 0.12 },
  bear: { len: 1.0, body: [0.38, 0.38, 0.62], upper: 0.25, lower: 0.22, legR: 0.085, hipH: 0.62, neck: [0.12, -0.2], headR: 0.2, tail: [0.06, 0.05], ear: 'round', foot: 'bigpaw', w: 0.22 },
};
export const QB = {
  root: 0, body: 1, rear: 2, chest: 3, neck: 4, head: 5, jaw: 6, tail1: 7, tail2: 8, tail3: 9,
  flU: 10, flL: 11, flF: 12, frU: 13, frL: 14, frF: 15, blU: 16, blL: 17, blF: 18, brU: 19, brL: 20, brF: 21, earL: 22, earR: 23,
};
function quadDefs(v) {
  const q = QV[v];
  const L = q.len, H = q.hipH;
  const tl = q.tail[0];
  return [
    ['root', -1, 0, 0, 0], ['body', 0, 0, H + q.body[1] * 0.35, 0], ['rear', 1, 0, 0, L * 0.42], ['chest', 1, 0, 0.02, -L * 0.42],
    ['neck', 3, 0, q.body[1] * 0.32, -q.body[2] * 0.45], ['head', 4, 0, q.neck[0], q.neck[1]], ['jaw', 5, 0, -q.headR * 0.45, -q.headR * 0.3],
    ['tail1', 2, 0, q.body[1] * 0.45, q.body[2] * 0.35], ['tail2', 7, 0, -tl * 0.25, tl], ['tail3', 8, 0, -tl * 0.25, tl],
    ['flU', 3, -q.w, -q.body[1] * 0.35, -0.02], ['flL', 10, 0, -q.upper, 0], ['flF', 11, 0, -q.lower, 0],
    ['frU', 3, q.w, -q.body[1] * 0.35, -0.02], ['frL', 13, 0, -q.upper, 0], ['frF', 14, 0, -q.lower, 0],
    ['blU', 2, -q.w, -q.body[1] * 0.35, 0.02], ['blL', 16, 0, -q.upper, 0], ['blF', 17, 0, -q.lower, 0],
    ['brU', 2, q.w, -q.body[1] * 0.35, 0.02], ['brL', 19, 0, -q.upper, 0], ['brF', 20, 0, -q.lower, 0],
    ['earL', 5, -q.headR * 0.6, q.headR * 0.7, q.headR * 0.2], ['earR', 5, q.headR * 0.6, q.headR * 0.7, q.headR * 0.2],
  ];
}

function buildQuad(spec, bones) {
  const v = spec.variant, q = QV[v], c = spec.colors;
  const B = new Builder(bones, { aoTop: q.hipH + q.body[1] * 2, aoBottom: 0, aoMin: 0.72 });
  const bodyC = col(c.body, '#8a6a4a'), bellyC = col(c.belly || shade(bodyC, 1.25), '#aa8a6a');
  const bodyY = bones[QB.body].getWorldPosition(new THREE.Vector3()).y;
  const zR = bones[QB.rear].getWorldPosition(new THREE.Vector3()).z, zC = bones[QB.chest].getWorldPosition(new THREE.Vector3()).z;
  const spot = (x, y, z) => Math.sin(x * 9 + z * 5.3) * Math.sin(z * 7.1 - y * 4.3) + Math.sin(x * 3.1 - z * 8.7) * 0.6;
  const spotsC = c.spots ? C(c.spots) : null;
  const tmp = new THREE.Color();
  const bodyColor = (x, y, z) => {
    if (spotsC && spot(x, y, z) > 0.55) return tmp.copy(spotsC);
    const belly = smooth01(bodyY - q.body[1] * 0.2, bodyY - q.body[1] * 0.75, y);
    return tmp.copy(bodyC).lerp(bellyC, belly);
  };
  const bodyW = (x, y, z) => { const f = smooth01(zC * 0.6, zR * 0.6, z); return [[QB.chest, 1 - f], [QB.rear, f]]; };
  // Torso + neck: one smooth tube from the tail root through the chest into the head.
  const P = (b) => bones[b].getWorldPosition(new THREE.Vector3());
  const [bx, by, bz] = q.body;
  const pr = P(QB.rear), pb = P(QB.body), pc = P(QB.chest), pn = P(QB.neck), ph = P(QB.head);
  const shapes = {
    rodent: { tail: [0.5, 0.5], rear: [1.0, 0.98], mid: [0.98, 0.95], chest: [0.8, 0.85], front: [0.62, 0.7], sq: 1 },
    cow: { tail: [0.55, 0.6], rear: [0.95, 0.95], mid: [1.0, 1.0], chest: [0.98, 1.02], front: [0.75, 0.86], sq: 0.62 },
    boar: { tail: [0.45, 0.5], rear: [0.82, 0.85], mid: [0.97, 0.98], chest: [1.0, 1.08], front: [0.82, 0.95], sq: 0.85 },
    wolf: { tail: [0.4, 0.42], rear: [0.78, 0.74], mid: [0.85, 0.85], chest: [1.0, 1.08], front: [0.82, 0.95], sq: 1 },
    bear: { tail: [0.5, 0.52], rear: [0.9, 0.92], mid: [1.0, 1.0], chest: [1.0, 1.08], front: [0.82, 0.92], sq: 0.9 },
  }[v];
  const ctrl = [
    { p: pr.clone().add(new THREE.Vector3(0, by * 0.12, bz * 0.6)), rx: bx * shapes.tail[0], ry: by * shapes.tail[1], bone: QB.rear },
    { p: pr.clone().add(new THREE.Vector3(0, 0, bz * 0.22)), rx: bx * shapes.rear[0], ry: by * shapes.rear[1], bone: QB.rear },
    { p: pb.clone(), rx: bx * shapes.mid[0], ry: by * shapes.mid[1], bone: QB.body, dy: v === 'wolf' ? -0.02 : 0 },
    { p: pc.clone(), rx: bx * shapes.chest[0], ry: by * shapes.chest[1], bone: QB.chest, dy: v === 'bear' ? 0.06 : v === 'wolf' ? -0.04 : 0 },
    { p: pc.clone().lerp(pn, 0.5).add(new THREE.Vector3(0, -by * 0.08, -0.02)), rx: lerp(bx * shapes.front[0], q.headR, 0.35), ry: lerp(by * shapes.front[1], q.headR, 0.35), bone: QB.chest },
    { p: pn.clone().add(new THREE.Vector3(0, 0, -0.03)), rx: q.headR * 0.95, ry: q.headR * 1.05, bone: QB.neck },
    { p: ph.clone(), rx: q.headR * 0.72, ry: q.headR * 0.78, bone: QB.head },
  ];
  const tcol = new THREE.Color();
  const tube0 = spineTube(ctrl, {
    seg: 4, radial: 14, square: shapes.sq,
    colorAt: (u, ang, out) => {
      const s = Math.sin(ang);
      const belly = smooth01(-0.15, -0.65, s);
      out.copy(bodyC).lerp(bellyC, belly);
      if (spotsC && s > -0.45) {
        const a = Math.cos(ang);
        const blob = Math.sin(u * 17 + a * 2.3) + Math.sin(u * 9.3 - s * 3.1 + 1.2) + Math.sin(a * 4.7 + s * 2.9 + u * 5.1);
        if (blob > 1.35) out.copy(spotsC);
      }
      if (v === 'boar' || v === 'bear' || v === 'wolf') out.multiplyScalar(0.92 + 0.12 * Math.sin(u * 90 + ang * 7) * Math.sin(ang * 13));
      return out;
    },
  });
  B.add(tube0, null, bodyC, { keepColor: true, keepSkin: true });
  // Legs: thick tops buried in the body.
  const legC = v === 'cow' ? bodyC : shade(bodyC, 0.92);
  const footC = q.foot === 'hoof' ? col(c.hoof, '#2a2420') : shade(bodyC, 0.7);
  for (const [U, Lw, F, front] of [[QB.flU, QB.flL, QB.flF, 1], [QB.frU, QB.frL, QB.frF, 1], [QB.blU, QB.blL, QB.blF, 0], [QB.brU, QB.brL, QB.brF, 0]]) {
    const r = q.legR * (front ? 1 : 1.12);
    const top = q.upper + by * 0.35;
    B.add(taper(r * 1.9, r * 1.1, top, 8, 2), U, front && v !== 'cow' ? legC : bodyC, { at: [0, by * 0.35, 0], colorFn: spotsC ? (x, y, z) => tcol.copy(bodyC) : null });
    B.add(taper(r * 1.1, r * 0.85, q.lower, 8, 2), Lw, legC);
    if (q.foot === 'hoof') {
      B.add(cyl(r * 0.95, r * 1.15, 0.07, 8), F, footC, { at: [0, -0.01, 0], shine: 0.3 });
      B.add(new THREE.TorusGeometry(r * 0.95, 0.012, 3, 8), Lw, shade(legC, 0.8), { at: [0, -q.lower + 0.05, 0], rot: [Math.PI / 2, 0, 0] });
    } else {
      const ps = q.foot === 'bigpaw' ? 1.35 : 1;
      B.add(sphere(r * 1.25 * ps, 8, 6), F, shade(bodyC, 0.85), { at: [0, -0.005, -r * 0.6 * ps], scale: [1, 0.6, 1.4] });
      if (q.foot === 'bigpaw') for (let i = -1; i <= 1; i++) B.add(cone(0.016, 0.06, 4), F, '#efe8d8', { at: [i * 0.045, -0.02, -r * 1.75], rot: [-Math.PI / 2, 0, 0] });
    }
  }
  // Tail.
  const tailC = col(c.tail, bodyC);
  if (v === 'rodent') {
    B.add(tube([[0, 0, 0], [0, -0.05, 0.25], [0, -0.1, 0.5], [0, -0.1, 0.75]], (t) => q.tail[1] * (1 - t * 0.8), 12, 5), QB.tail1, tailC, {
      weights: tailWeights(bones),
    });
  } else if (v === 'wolf') {
    B.add(tube([[0, 0, 0], [0, -0.08, 0.15], [0, -0.2, 0.32], [0, -0.32, 0.42]], (t) => 0.035 + 0.06 * Math.sin(Math.PI * (0.2 + 0.8 * t)), 12, 7), QB.tail1, tailC, { weights: tailWeights(bones), colorFn: (x, y, z) => tmp.copy(bodyC).lerp(C('#e8e8e8'), smooth01(0.3, 0.4, z - bones[QB.tail1].getWorldPosition(new THREE.Vector3()).z)) });
  } else if (v === 'cow') {
    B.add(tube([[0, 0, 0], [0, -0.15, 0.08], [0, -0.4, 0.1], [0, -0.55, 0.1]], 0.02, 10, 4), QB.tail1, tailC, { weights: tailWeights(bones) });
    B.add(sphere(0.05, 6, 5), QB.tail3, shade(c.spots || '#3a2e2a', 1), { at: [0, -0.2, -0.05], scale: [1, 1.6, 1] });
  } else if (v === 'boar') {
    B.add(tube([[0, 0, 0], [0, -0.04, 0.08], [0.02, -0.1, 0.12], [0, -0.16, 0.1]], 0.015, 8, 4), QB.tail1, tailC, {});
  } else {
    B.add(sphere(0.07, 6, 5), QB.tail1, bodyC, { at: [0, 0, 0.02] });
  }
  // Head.
  const hr = q.headR;
  const eyeC = c.eyes || (v === 'wolf' ? '#e8b030' : '#140c08');
  const eyes = (x, y, z, r = 0.022, glow = 0) => {
    for (const sx of [-1, 1]) {
      B.add(sphere(r, 7, 5), QB.head, eyeC, { at: [sx * x, y, z], glow, ao: false, shine: 0.6 });
      B.add(sphere(r * 0.35, 4, 3), QB.head, '#ffffff', { at: [sx * x + 0.004, y + r * 0.4, z - r * 0.7], ao: false });
    }
  };
  if (v === 'rodent') {
    B.add(sphere(hr, 10, 8), QB.head, bodyC, { at: [0, 0.02, 0.0], scale: [1, 0.9, 1.1] });
    B.add(cone(hr * 0.7, hr * 2.0, 8), QB.head, bodyC, { at: [0, -0.01, -hr * 1.3], rot: [-Math.PI / 2, 0, 0], scale: [1, 1, 0.8] });
    B.add(sphere(0.022, 6, 5), QB.head, '#e89a9a', { at: [0, -0.01, -hr * 2.3] });
    for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) B.add(cyl(0.002, 0.002, 0.16, 3), QB.head, '#d8d0c8', { at: [sx * 0.06, -0.01 + i * 0.012, -hr * 2.0], rot: [0, 0, sx * (Math.PI / 2 - 0.2 + i * 0.25)], ao: false });
    eyes(hr * 0.5, hr * 0.35, -hr * 0.8, 0.018);
  } else if (v === 'cow') {
    B.add(sphere(hr, 10, 8), QB.head, bodyC, { at: [0, 0.02, -0.02], scale: [1.05, 1.15, 1.4], colorFn: bodyColor });
    B.add(sphere(hr * 0.78, 10, 8), QB.head, col(c.muzzle, '#e8b8a8'), { at: [0, -0.06, -hr * 1.35], scale: [1.1, 0.85, 0.9] });
    for (const sx of [-1, 1]) {
      B.add(sphere(0.02, 5, 4), QB.head, '#4a2a2a', { at: [sx * 0.045, -0.04, -hr * 2.0] });
      B.add(tube([[0, 0, 0], [sx * 0.08, 0.04, 0], [sx * 0.13, 0.12, -0.02]], (t) => 0.03 * (1 - t * 0.75), 6, 5), QB.head, col(c.horn, '#e8dcc0'), { at: [sx * hr * 0.7, hr * 0.9, 0.04], shine: 0.4 });
    }
    eyes(hr * 0.78, hr * 0.35, -hr * 0.85, 0.024);
    B.add(sphere(0.12, 8, 6), QB.body, col(c.udder, '#e8b0a8'), { at: [0, -q.body[1] * 0.85, q.body[2] * 0.35], scale: [1, 0.7, 1.1] });
  } else if (v === 'boar') {
    B.add(sphere(hr, 10, 8), QB.head, bodyC, { at: [0, 0.0, -0.02], scale: [1, 1.0, 1.25] });
    B.add(cyl(hr * 0.5, hr * 0.75, hr * 1.4, 9), QB.head, bodyC, { at: [0, -0.04, -hr * 1.2], rot: [Math.PI / 2, 0, 0] });
    B.add(cyl(hr * 0.5, hr * 0.5, 0.03, 10), QB.head, '#c89a8a', { at: [0, -0.04, -hr * 1.92], rot: [Math.PI / 2, 0, 0] });
    for (const sx of [-1, 1]) {
      B.add(sphere(0.012, 4, 3), QB.head, '#3a2020', { at: [sx * 0.03, -0.04, -hr * 1.95] });
      B.add(tube([[0, 0, 0], [sx * 0.03, 0.05, -0.03], [sx * 0.02, 0.12, -0.02]], (t) => 0.022 * (1 - t * 0.8), 6, 5), QB.head, col(c.tusk, '#efe8d8'), { at: [sx * hr * 0.45, -0.08, -hr * 1.55], shine: 0.5 });
    }
    eyes(hr * 0.62, hr * 0.3, -hr * 0.85, 0.018);
    // Bristly mane along the back.
    for (let i = 0; i < 9; i++) {
      const z = -q.body[2] * 0.8 + i * q.body[2] * 0.2;
      B.add(cone(0.035, 0.14, 4), QB.body, shade(bodyC, 0.65), { at: [0, q.body[1] * 0.95 - Math.abs(z) * 0.15, z], rot: [0.5, 0, 0], weights: bodyW, flat: true });
    }
  } else if (v === 'wolf') {
    B.add(sphere(hr, 10, 8), QB.head, bodyC, { at: [0, 0.02, 0.0], scale: [1.05, 0.95, 1.1] });
    B.add(cone(hr * 0.62, hr * 2.0, 8), QB.head, bodyC, { at: [0, -0.03, -hr * 1.35], rot: [-Math.PI / 2, 0, 0], scale: [1, 1, 0.75] });
    B.add(sphere(hr * 0.5, 8, 6), QB.jaw, bellyC, { at: [0, 0.0, -hr * 0.9], scale: [0.8, 0.45, 1.5] });
    B.add(sphere(0.025, 6, 5), QB.head, '#141010', { at: [0, -0.02, -hr * 2.32], shine: 0.6 });
    for (let i = -1; i <= 1; i += 2) B.add(cone(0.008, 0.03, 3), QB.head, '#f0ead8', { at: [i * 0.03, -0.065, -hr * 2.0], rot: [Math.PI, 0, 0] });
    eyes(hr * 0.52, hr * 0.3, -hr * 0.82, 0.02, 0.25);
    // Ruff.
    B.add(sphere(q.body[1] * 1.05, 10, 8), QB.chest, shade(bodyC, 1.08), { at: [0, 0.04, -0.05], scale: [1.0, 1.05, 0.8], flat: true });
  } else if (v === 'bear') {
    B.add(sphere(hr, 10, 8), QB.head, bodyC, { at: [0, 0.02, 0.0], scale: [1.1, 1.0, 1.05] });
    B.add(sphere(hr * 0.6, 8, 6), QB.head, col(c.belly, '#9a7a5a'), { at: [0, -0.04, -hr * 1.05], scale: [0.95, 0.75, 1.1] });
    B.add(sphere(0.032, 6, 5), QB.head, '#141010', { at: [0, -0.01, -hr * 1.65], shine: 0.6 });
    eyes(hr * 0.5, hr * 0.3, -hr * 0.85, 0.018);
  }
  // Ears.
  for (const [eb, sx] of [[QB.earL, -1], [QB.earR, 1]]) {
    if (q.ear === 'round') {
      B.add(sphere(hr * 0.35, 7, 5), eb, bodyC, { scale: [1, 1, 0.45] });
      B.add(sphere(hr * 0.24, 6, 4), eb, '#d89a9a', { at: [0, 0, -0.012], scale: [1, 1, 0.3], ao: false });
    } else if (q.ear === 'point') {
      B.add(cone(hr * 0.3, hr * 0.8, 5), eb, bodyC, { at: [0, hr * 0.3, 0], rot: [-0.1, 0, sx * -0.2], scale: [1, 1, 0.45] });
    } else if (q.ear === 'flop') {
      B.add(cone(hr * 0.28, hr * 0.9, 6), eb, bodyC, { at: [sx * hr * 0.35, -0.02, 0], rot: [0, 0, sx * -1.9], scale: [1, 1, 0.4] });
    } else {
      B.add(cone(hr * 0.24, hr * 0.5, 5), eb, bodyC, { at: [0, hr * 0.15, 0], rot: [0.3, 0, sx * -0.4], scale: [1, 1, 0.45] });
    }
  }
  return B.build();
}
function tailWeights(bones) {
  const p1 = bones[QB.tail1].getWorldPosition(new THREE.Vector3()), p2 = bones[QB.tail2].getWorldPosition(new THREE.Vector3()), p3 = bones[QB.tail3].getWorldPosition(new THREE.Vector3());
  return (x, y, z) => {
    const d = z;
    const a = smooth01(p1.z, p2.z, d), b = smooth01(p2.z, p3.z, d);
    return [[QB.tail1, 1 - a], [QB.tail2, a * (1 - b)], [QB.tail3, a * b]];
  };
}

const LEGS = [[QB.flU, QB.flL, QB.flF], [QB.frU, QB.frL, QB.frF], [QB.blU, QB.blL, QB.blF], [QB.brU, QB.brL, QB.brF]];
function quadGait(P, c, phases, amp, lift, bob) {
  for (let i = 0; i < 4; i++) {
    const [U, L, F] = LEGS[i];
    const w = (c.ph + phases[i]) * TAU;
    const s = Math.sin(w), up = pos(Math.cos(w));
    P[U * 3] = amp * s;
    P[L * 3] = -lift * Math.pow(up, 1.5) * (i < 2 ? 1 : 0.8);
    P[F * 3] = -(P[U * 3] + P[L * 3]) * 0.8 + 0.3 * lift * up;
  }
  offset(P, QUAD_N, 0, bob * Math.cos(c.ph * TAU * 2), 0);
}
const QUAD_N = 24;
const quadRig = {
  n: QUAD_N,
  loops: {
    idle(P, c) {
      P.fill(0);
      const br = Math.sin(c.t * 1.6);
      scl(P, QUAD_N, 0.015 * br, 0.025 * br, 0);
      const look = Math.sin(c.t * 0.37 + c.seed) * Math.sin(c.t * 0.13 + c.seed * 2);
      const graze = c.variant === 'cow' || c.variant === 'boar' ? smooth01(0.6, 0.9, Math.sin(c.t * 0.21 + c.seed)) : 0;
      S(P, QB.neck, -0.05 - graze * 0.8, look * 0.35, 0);
      S(P, QB.head, 0.05 + graze * 0.2 + Math.sin(c.t * 0.9) * 0.04, look * 0.25, 0);
      S(P, QB.jaw, graze * 0.15 * pos(Math.sin(c.t * 6)), 0, 0);
      const sw = Math.sin(c.t * (c.variant === 'cow' ? 1.3 : 2.1) + c.seed);
      S(P, QB.tail1, c.variant === 'wolf' ? 0.25 : 0.1, sw * 0.3, 0);
      S(P, QB.tail2, 0, sw * 0.35, 0); S(P, QB.tail3, 0, sw * 0.4, 0);
      const flick = pos(Math.sin(c.t * 0.9 + c.seed * 3)) > 0.97 ? 0.4 : 0;
      S(P, QB.earL, 0, 0, -flick); S(P, QB.earR, 0, 0, flick * 0.5);
    },
    walk(P, c) {
      P.fill(0);
      quadGait(P, c, [0.25, 0.75, 0.0, 0.5], 0.38, 0.75, 0.02);
      const s = Math.sin(c.ph * TAU * 2);
      S(P, QB.neck, -0.05 + 0.05 * s, 0, 0);
      S(P, QB.head, 0.03 - 0.04 * s, 0, 0);
      S(P, QB.body, 0, 0.04 * Math.sin(c.ph * TAU), 0.03 * Math.sin(c.ph * TAU));
      const sw = Math.sin(c.ph * TAU);
      S(P, QB.tail1, c.variant === 'wolf' ? 0.2 : 0.05, sw * 0.2, 0); S(P, QB.tail2, 0, sw * 0.25, 0);
    },
    run(P, c) {
      P.fill(0);
      const gallop = c.variant === 'wolf' || c.variant === 'rodent';
      quadGait(P, c, gallop ? [0.0, 0.1, 0.5, 0.6] : [0.0, 0.5, 0.5, 0.0], gallop ? 0.75 : 0.55, 1.1, 0.05);
      const w = c.ph * TAU;
      S(P, QB.body, gallop ? 0.12 * Math.sin(w) : 0, 0, 0);
      S(P, QB.neck, -0.15 + (gallop ? -0.12 * Math.sin(w) : 0), 0, 0);
      S(P, QB.head, 0.1, 0, 0);
      S(P, QB.tail1, c.variant === 'wolf' ? 0.0 : 0.3, 0, 0); S(P, QB.tail2, 0.15 * Math.sin(w), 0, 0);
      S(P, QB.earL, -0.4, 0, 0); S(P, QB.earR, -0.4, 0, 0);
    },
  },
  shots: {
    attack: {
      dur: 0.8, impact: 0.38, fn(P, t, c) {
        if (c.variant === 'bear') {
          // Rear up and swipe with the right paw.
          const up = smooth01(0, 0.3, t) * (1 - smooth01(0.6, 0.8, t));
          const sw = smooth01(0.3, 0.42, t) * (1 - smooth01(0.55, 0.8, t));
          S(P, QB.body, 0.55 * up, 0, 0);
          offset(P, QUAD_N, 0, 0.18 * up, 0.1 * up);
          A(P, QB.blU, -0.5 * up, 0, 0); A(P, QB.brU, -0.5 * up, 0, 0);
          A(P, QB.frU, 1.4 * up - 1.2 * sw, 0, 0.3 * sw); A(P, QB.frL, -0.5 * up, 0, 0);
          A(P, QB.flU, 0.8 * up, 0, -0.1); A(P, QB.flL, -0.8 * up, 0, 0);
          A(P, QB.neck, -0.3 * up, 0, 0); A(P, QB.jaw, 0.5 * up, 0, 0); A(P, QB.head, 0.2 * up, 0, 0);
          return;
        }
        const wind = smooth01(0, 0.28, t) * (1 - smooth01(0.28, 0.38, t));
        const lunge = smooth01(0.28, 0.38, t) * (1 - smooth01(0.5, 0.8, t));
        const butt = c.variant === 'cow' || c.variant === 'boar';
        offset(P, QUAD_N, 0, -0.04 * wind, 0.1 * wind - 0.22 * lunge);
        S(P, QB.body, -0.1 * wind + (butt ? 0.15 : 0.05) * lunge, 0, 0);
        A(P, QB.neck, (butt ? -0.5 : -0.25) * lunge + 0.2 * wind, 0, 0);
        A(P, QB.head, (butt ? -0.3 : 0.15) * lunge, 0, 0);
        A(P, QB.jaw, (butt ? 0 : 0.7) * lunge + (butt ? 0 : 0.3) * wind, 0, 0);
        A(P, QB.flU, 0.4 * lunge, 0, 0); A(P, QB.frU, 0.3 * lunge, 0, 0);
        A(P, QB.blU, -0.35 * lunge + 0.2 * wind, 0, 0); A(P, QB.brU, -0.3 * lunge + 0.2 * wind, 0, 0);
        A(P, QB.earL, -0.5 * (wind + lunge), 0, 0); A(P, QB.earR, -0.5 * (wind + lunge), 0, 0);
      },
    },
  },
  die: {
    dur: 1.0, fn(P, t, c) {
      const f = smooth01(0.1, 0.75, t);
      const buck = smooth01(0, 0.25, t) * (1 - f);
      S(P, QB.body, 0, 0, 1.45 * f);
      offset(P, QUAD_N, 0.0, -QV[c.variant].hipH * 0.62 * f - 0.08 * buck, 0);
      for (const [U, L] of LEGS) { P[U * 3] = 0.15 * f; P[L * 3] = -0.3 * buck; }
      S(P, QB.neck, -0.2 * buck + 0.2 * f, 0, -0.3 * f);
      S(P, QB.head, 0.2 * f, 0, 0);
      S(P, QB.jaw, 0.35 * f, 0, 0);
    },
  },
  hurt(P, k) {
    A(P, QB.body, 0.1 * k, 0, 0.06 * k);
    A(P, QB.neck, 0.35 * k, 0.2 * k, 0);
    A(P, QB.head, 0.2 * k, 0, 0);
    offset(P, QUAD_N, P[QUAD_N * 3], P[QUAD_N * 3 + 1] - 0.02 * k, P[QUAD_N * 3 + 2] + 0.06 * k);
  },
};

// =============================================================================================
// Bird (chicken)
// =============================================================================================
export const BB = { root: 0, body: 1, neck: 2, head: 3, wingL: 4, wingR: 5, thL: 6, shL: 7, ftL: 8, thR: 9, shR: 10, ftR: 11, tail: 12 };
const BIRD_DEFS = [
  ['root', -1, 0, 0, 0], ['body', 0, 0, 0.5, 0], ['neck', 1, 0, 0.12, -0.2], ['head', 2, 0, 0.2, -0.04],
  ['wingL', 1, -0.17, 0.06, 0.0], ['wingR', 1, 0.17, 0.06, 0.0],
  ['thL', 1, -0.08, -0.1, 0.04], ['shL', 6, 0, -0.17, 0.02], ['ftL', 7, 0, -0.2, 0],
  ['thR', 1, 0.08, -0.1, 0.04], ['shR', 9, 0, -0.17, 0.02], ['ftR', 10, 0, -0.2, 0],
  ['tail', 1, 0, 0.08, 0.24],
];
function buildBird(spec, bones) {
  const c = spec.colors;
  const B = new Builder(bones, { aoTop: 1.0, aoBottom: 0.0, aoMin: 0.75 });
  const bodyC = col(c.body, '#f4efe6'), comb = col(c.comb, '#d63a3a'), beak = col(c.beak, '#e8a33a');
  B.add(sphere(0.25, 14, 10), BB.body, bodyC, { scale: [0.82, 0.8, 1.0], at: [0, 0, 0] });
  B.add(sphere(0.2, 10, 8), BB.body, shade(bodyC, 0.97), { at: [0, -0.06, -0.12], scale: [0.85, 0.85, 0.9] });
  B.add(cyl(0.075, 0.11, 0.24, 9), BB.neck, bodyC, { at: [0, 0.08, 0.0], rot: [-0.25, 0, 0] });
  B.add(sphere(0.105, 10, 8), BB.head, bodyC, { at: [0, 0.03, 0.0] });
  B.add(cone(0.035, 0.1, 6), BB.head, beak, { at: [0, 0.01, -0.13], rot: [-Math.PI / 2, 0, 0], scale: [1.1, 1, 0.8], shine: 0.3 });
  for (let i = 0; i < 3; i++) B.add(sphere(0.032 - i * 0.004, 6, 5), BB.head, comb, { at: [0, 0.12 + (i === 1 ? 0.012 : 0), -0.04 + i * 0.045], scale: [0.5, 1, 1] });
  B.add(sphere(0.026, 6, 5), BB.head, comb, { at: [0, -0.06, -0.09], scale: [0.6, 1.4, 0.6] });
  for (const sx of [-1, 1]) {
    B.add(sphere(0.017, 6, 5), BB.head, '#141010', { at: [sx * 0.075, 0.04, -0.05], ao: false, shine: 0.7 });
    B.add(sphere(0.006, 4, 3), BB.head, '#ffffff', { at: [sx * 0.085, 0.048, -0.06], ao: false });
  }
  for (const [w, sx] of [[BB.wingL, -1], [BB.wingR, 1]]) B.add(sphere(0.16, 9, 7), w, shade(bodyC, 0.93), { at: [sx * 0.02, -0.02, 0.03], scale: [0.25, 0.75, 1.15] });
  // Tail feathers fanned upward.
  for (let i = -2; i <= 2; i++) B.add(cone(0.05, 0.22, 4), BB.tail, shade(bodyC, 0.95), { at: [i * 0.03, 0.08, 0.02], rot: [-0.55, 0, i * 0.18], scale: [1, 1, 0.35] });
  for (const [th, sh, ft] of [[BB.thL, BB.shL, BB.ftL], [BB.thR, BB.shR, BB.ftR]]) {
    B.add(sphere(0.07, 7, 5), th, bodyC, { at: [0, -0.04, 0], scale: [1, 1.3, 1] });
    B.add(cyl(0.018, 0.015, 0.2, 5), sh, beak, { at: [0, -0.1, 0] });
    for (let i = -1; i <= 1; i++) B.add(cyl(0.012, 0.008, 0.11, 4), ft, beak, { at: [i * 0.04, -0.01, -0.05], rot: [-Math.PI / 2, i * 0.4, 0] });
  }
  return B.build();
}
const BIRD_N = 13;
const birdRig = {
  n: BIRD_N,
  loops: {
    idle(P, c) {
      P.fill(0);
      const peck = smooth01(0.75, 0.92, Math.sin(c.t * 0.8 + c.seed));
      const jab = peck * pos(Math.sin(c.t * 14));
      S(P, BB.neck, -0.9 * peck - 0.25 * jab, Math.sin(c.t * 0.6 + c.seed) * 0.5 * (1 - peck), 0);
      S(P, BB.head, 0.4 * peck, Math.sin(c.t * 1.3 + c.seed) * 0.4 * (1 - peck), 0);
      S(P, BB.body, -0.15 * peck, 0, 0);
      S(P, BB.tail, Math.sin(c.t * 2.3) * 0.05, 0, 0);
      for (const [th, sh, ft] of [[BB.thL, BB.shL, BB.ftL], [BB.thR, BB.shR, BB.ftR]]) { S(P, th, 0.15 * peck, 0, 0); S(P, sh, -0.2, 0, 0); S(P, ft, 0.05 - 0.15 * peck, 0, 0); }
    },
    walk(P, c) {
      P.fill(0);
      const w = c.ph * TAU, s = Math.sin(w);
      S(P, BB.thL, 0.55 * s, 0, 0); S(P, BB.thR, -0.55 * s, 0, 0);
      S(P, BB.shL, -0.5 * pos(Math.cos(w)), 0, 0); S(P, BB.shR, -0.5 * pos(-Math.cos(w)), 0, 0);
      S(P, BB.ftL, -0.55 * s * 0.6, 0, 0); S(P, BB.ftR, 0.55 * s * 0.6, 0, 0);
      // Head bob: hold then snap forward each step.
      const saw = ((c.ph * 2) % 1);
      S(P, BB.neck, -0.35 + 0.4 * (saw < 0.75 ? saw / 0.75 : 1 - (saw - 0.75) / 0.25), 0, 0);
      S(P, BB.body, 0, 0.08 * s, 0.06 * s);
      offset(P, BIRD_N, 0, 0.02 * Math.abs(Math.cos(w)), 0);
    },
    run(P, c) {
      birdRig.loops.walk(P, c);
      const f = Math.sin(c.t * 22);
      S(P, BB.wingL, 0, 0, -0.6 - 0.5 * f); S(P, BB.wingR, 0, 0, 0.6 + 0.5 * f);
      S(P, BB.body, -0.25, P[BB.body * 3 + 1], 0);
    },
  },
  shots: {
    attack: {
      dur: 0.7, impact: 0.36, fn(P, t, c) {
        const up = smooth01(0, 0.25, t) * (1 - smooth01(0.4, 0.6, t));
        const peck = smooth01(0.25, 0.36, t) * (1 - smooth01(0.42, 0.65, t));
        const f = Math.sin(t * 40) * up;
        offset(P, BIRD_N, 0, 0.18 * up, -0.12 * peck);
        S(P, BB.wingL, 0, 0, -1.1 * up - 0.4 * f); S(P, BB.wingR, 0, 0, 1.1 * up + 0.4 * f);
        A(P, BB.neck, 0.5 * up - 1.0 * peck, 0, 0); A(P, BB.head, 0.4 * peck, 0, 0);
        A(P, BB.thL, 0.6 * up, 0, 0); A(P, BB.thR, 0.6 * up, 0, 0);
      },
    },
  },
  die: {
    dur: 0.9, fn(P, t) {
      const f = smooth01(0.1, 0.6, t);
      S(P, BB.body, 0, 0, 1.5 * f);
      offset(P, BIRD_N, 0, -0.32 * f, 0);
      S(P, BB.neck, 0.6 * f, 0, 0.4 * f); S(P, BB.head, 0.3 * f, 0, 0);
      S(P, BB.thL, -0.5 * f, 0, 0); S(P, BB.thR, -0.3 * f, 0, 0);
      S(P, BB.wingL, 0, 0, -0.6 * f); S(P, BB.wingR, 0, 0, 0.3 * f);
    },
  },
  hurt(P, k) { A(P, BB.body, 0.2 * k, 0, 0); A(P, BB.neck, 0.4 * k, 0, 0); A(P, BB.wingL, 0, 0, -0.8 * k); A(P, BB.wingR, 0, 0, 0.8 * k); },
};

// =============================================================================================
// Spider
// =============================================================================================
const SPIDER_N = 28;
const SP_LEG_A = [-0.85, -0.3, 0.25, 0.8]; // yaw of each leg pair (front to back)
function spiderDefs() {
  const d = [['root', -1, 0, 0, 0], ['body', 0, 0, 0.42, 0], ['abdomen', 1, 0, 0.06, 0.2], ['head', 1, 0, -0.02, -0.2]];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const a = SP_LEG_A[i];
      const base = d.length;
      const out = [side * Math.cos(a), 0, Math.sin(a)];
      d.push([`leg${side}${i}a`, 1, side * 0.1, -0.02, -0.12 + i * 0.075]);
      d.push([`leg${side}${i}b`, base, out[0] * 0.34, 0.3, out[2] * 0.34]);
      d.push([`leg${side}${i}c`, base + 1, out[0] * 0.32, -0.45, out[2] * 0.32]);
    }
  }
  return d;
}
function legBones(side, i) { const s = side < 0 ? 0 : 12; return [4 + s + i * 3, 5 + s + i * 3, 6 + s + i * 3]; }
function buildSpider(spec, bones) {
  const c = spec.colors;
  const B = new Builder(bones, { aoTop: 0.9, aoBottom: 0, aoMin: 0.7 });
  const bodyC = col(c.body, '#2b2622'), marks = col(c.marks, '#c0392b');
  const tmp = new THREE.Color();
  B.add(sphere(0.2, 12, 9), 1, bodyC, { scale: [1, 0.7, 1.05], shine: 0.35 });
  const abd = sphere(0.33, 14, 10);
  B.add(abd, 2, bodyC, {
    at: [0, 0.08, 0.26], scale: [0.95, 0.85, 1.2], shine: 0.45,
    colorFn: (x, y, z) => { const p = bones[2].position; return Math.abs(x) < 0.045 && y > 0.48 ? tmp.copy(marks) : (Math.abs(Math.sin(z * 14)) < 0.18 && y > 0.5 && Math.abs(x) < 0.16 ? tmp.copy(marks) : tmp.copy(bodyC)); },
  });
  B.add(sphere(0.12, 10, 8), 3, shade(bodyC, 1.1), { at: [0, 0.02, -0.04], scale: [1, 0.8, 1] });
  // Eyes: a cluster of glints.
  for (const [x, y, r] of [[-0.045, 0.06, 0.022], [0.045, 0.06, 0.022], [-0.085, 0.04, 0.014], [0.085, 0.04, 0.014], [-0.025, 0.1, 0.012], [0.025, 0.1, 0.012]]) {
    B.add(sphere(r, 6, 5), 3, col(c.eyes, '#ff4a3a'), { at: [x, y, -0.13], glow: 0.6, ao: false, shine: 1 });
  }
  // Fangs.
  for (const sx of [-1, 1]) B.add(cone(0.022, 0.1, 5), 3, '#1a1614', { at: [sx * 0.04, -0.05, -0.14], rot: [Math.PI + 0.3, 0, 0], shine: 0.6 });
  // Legs: femur (a -> b), tibia (b -> c), tarsus.
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const [a, b2, c2] = legBones(side, i);
    const pa = bones[a].getWorldPosition(new THREE.Vector3()), pb = bones[b2].getWorldPosition(new THREE.Vector3()), pc = bones[c2].getWorldPosition(new THREE.Vector3());
    const seg = (p0, p1, bone, r0, r1) => {
      const len = p0.distanceTo(p1);
      const g = cyl(r1, r0, len, 6);
      g.translate(0, len / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
      const m = new THREE.Matrix4().compose(p0, q, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m);
      B.add(g, null, bodyC, { weights: () => [[bone, 1]], shine: 0.3, colorFn: (x, y, z) => (Math.abs(Math.sin((x + z) * 30)) < 0.2 ? tmp.copy(marks).multiplyScalar(0.7) : tmp.copy(bodyC)) });
      B.add(sphere(r0 * 1.15, 5, 4), null, bodyC, { at: [p0.x, p0.y, p0.z], weights: () => [[bone, 1]] });
    };
    seg(pa, pb, a, 0.032, 0.026);
    seg(pb, pc, b2, 0.026, 0.012);
  }
  return B.build();
}
const spiderRig = {
  n: SPIDER_N,
  loops: {
    idle(P, c) {
      P.fill(0);
      const br = Math.sin(c.t * 2.2);
      S(P, 2, 0.04 * br, Math.sin(c.t * 0.7) * 0.06, 0);
      S(P, 3, 0, Math.sin(c.t * 0.5 + c.seed) * 0.12, 0);
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
        const [a] = legBones(side, i);
        const tw = Math.sin(c.t * 1.7 + i * 1.3 + side) * 0.04;
        S(P, a, 0, tw, 0);
      }
      offset(P, SPIDER_N, 0, 0.01 * br, 0);
    },
    walk(P, c) {
      P.fill(0);
      const w = c.ph * TAU;
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
        const [a, b] = legBones(side, i);
        const grp = (i + (side < 0 ? 0 : 1)) % 2;
        const ph = w + grp * Math.PI;
        const lift = pos(Math.sin(ph));
        S(P, a, 0, -0.35 * Math.cos(ph) * side * -1, -side * 0.45 * lift);
        S(P, b, 0, 0, side * 0.2 * lift);
      }
      S(P, 1, 0, 0.05 * Math.sin(w), 0);
      S(P, 2, 0.05 * Math.sin(w * 2), 0.08 * Math.sin(w), 0);
      offset(P, SPIDER_N, 0, 0.02 * Math.abs(Math.sin(w)), 0);
    },
  },
  shots: {
    attack: {
      dur: 0.85, impact: 0.45, fn(P, t, c) {
        const rear = smooth01(0, 0.32, t) * (1 - smooth01(0.42, 0.8, t));
        const strike = smooth01(0.32, 0.45, t) * (1 - smooth01(0.5, 0.8, t));
        S(P, 1, 0.45 * rear - 0.25 * strike, 0, 0);
        offset(P, SPIDER_N, 0, 0.12 * rear, 0.08 * rear - 0.25 * strike);
        for (const side of [-1, 1]) {
          const [a0, b0] = legBones(side, 0), [a1] = legBones(side, 1);
          A(P, a0, 0, 0, -side * 1.0 * rear); A(P, b0, 0, 0, side * 0.6 * rear);
          A(P, a1, 0, 0, -side * 0.4 * rear);
        }
        A(P, 3, -0.4 * strike, 0, 0);
      },
    },
  },
  die: {
    dur: 1.1, fn(P, t) {
      const f = smooth01(0.0, 0.8, t);
      offset(P, SPIDER_N, 0, -0.3 * f, 0);
      S(P, 1, 0, 0, 0.15 * f);
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
        const [a, b] = legBones(side, i);
        S(P, a, 0, 0, side * 0.6 * f);
        S(P, b, 0, 0, side * 1.6 * f);
      }
    },
  },
  hurt(P, k) { A(P, 1, 0.25 * k, 0, 0); offset(P, SPIDER_N, 0, P[SPIDER_N * 3 + 1] + 0.04 * k, P[SPIDER_N * 3 + 2] + 0.06 * k); },
};

// =============================================================================================
// Slime (bog lurker)
// =============================================================================================
const SLIME_N = 6;
const SLIME_DEFS = [['root', -1, 0, 0, 0], ['body', 0, 0, 0.02, 0], ['top', 1, 0, 0.45, 0], ['maw', 1, 0, 0.26, -0.6], ['eyeL', 2, -0.16, 0.3, -0.22], ['eyeR', 2, 0.16, 0.3, -0.22]];
function buildSlime(spec, bones) {
  const c = spec.colors;
  const B = new Builder(bones, { aoTop: 1.2, aoBottom: 0, aoMin: 0.65 });
  const bodyC = col(c.body, '#4a5a3a'), eyesC = col(c.eyes, '#e8f0a0');
  const tmp = new THREE.Color(), algae = C('#7a8a3a'), mud = shade(bodyC, 0.7);
  const g = new THREE.SphereGeometry(0.55, 18, 14);
  deform(g, (x, y, z) => {
    const ny = y / 0.55;
    let k = 1 + 0.25 * smooth01(0.2, -0.9, ny);
    const wob = 1 + 0.06 * Math.sin(x * 11 + z * 7) * Math.sin(y * 9);
    if (ny < -0.6) y = -0.33 - (ny + 0.6) * 0.05 * 0.55;
    return [x * k * wob, y + 0.33, z * k * wob * 1.05];
  });
  B.add(g, null, bodyC, {
    shine: 0.6,
    weights: (x, y) => { const f = smooth01(0.25, 0.8, y); return [[1, 1 - f], [2, f]]; },
    colorFn: (x, y, z) => { const n = Math.sin(x * 13 + y * 5) * Math.sin(z * 11 - y * 7); return tmp.copy(n > 0.45 ? algae : n < -0.5 ? mud : bodyC); },
  });
  // Maw: dark mouth with jagged teeth.
  B.add(sphere(0.22, 12, 6), 3, '#1a1410', { at: [0, 0.02, 0.04], scale: [1.5, 0.4, 0.5] });
  for (let i = -3; i <= 3; i++) {
    B.add(cone(0.03, 0.1, 4), 1, '#e8e0c8', { at: [i * 0.06, 0.33, -0.62 + Math.abs(i) * 0.035], rot: [Math.PI, 0, 0] });
    B.add(cone(0.022, 0.07, 4), 3, '#e8e0c8', { at: [i * 0.055 + 0.025, -0.03, 0.03 + Math.abs(i) * 0.03] });
  }
  B.add(sphere(0.2, 10, 6), 3, shade(bodyC, 0.9), { at: [0, -0.07, 0.07], scale: [1.45, 0.4, 0.75], shine: 0.6 });
  // Eye stalks.
  for (const e of [4, 5]) {
    B.add(cyl(0.035, 0.05, 0.16, 6), e, bodyC, { at: [0, -0.06, 0], shine: 0.5 });
    B.add(sphere(0.07, 9, 7), e, eyesC, { at: [0, 0.04, -0.01], glow: 0.55, ao: false });
    B.add(sphere(0.03, 6, 5), e, '#141010', { at: [0, 0.045, -0.065], ao: false });
  }
  // Drips and reeds stuck in the mud.
  for (let i = 0; i < 6; i++) { const a = i * 1.1; B.add(sphere(0.06, 6, 5), 1, shade(bodyC, 0.85), { at: [Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.62], scale: [1, 0.6, 1], shine: 0.6 }); }
  for (let i = 0; i < 3; i++) B.add(cyl(0.008, 0.01, 0.35, 4), 2, '#8a8a4a', { at: [0.15 - i * 0.12, 0.25, 0.18 + i * 0.05], rot: [0.2 - i * 0.15, 0, 0.3 - i * 0.3] });
  return B.build();
}
const slimeRig = {
  n: SLIME_N,
  loops: {
    idle(P, c) {
      P.fill(0);
      const b = Math.sin(c.t * 1.8 + c.seed);
      scl(P, SLIME_N, 0.04 * b, -0.05 * b, 0.04 * b);
      S(P, 2, Math.sin(c.t * 0.9) * 0.06, Math.sin(c.t * 0.6) * 0.1, Math.sin(c.t * 0.7) * 0.05);
      S(P, 3, 0.1 + 0.08 * pos(Math.sin(c.t * 0.8)), 0, 0);
      S(P, 4, Math.sin(c.t * 1.3) * 0.2, Math.sin(c.t * 0.9 + 1) * 0.3, -0.2); S(P, 5, Math.sin(c.t * 1.1 + 2) * 0.2, Math.sin(c.t * 0.8) * 0.3, 0.2);
    },
    walk(P, c) {
      P.fill(0);
      const w = c.ph * TAU, s = Math.sin(w);
      scl(P, SLIME_N, -0.08 * s, 0.12 * s, -0.08 * s);
      S(P, 2, -0.15 - 0.1 * s, 0, 0);
      offset(P, SLIME_N, 0, 0.04 * pos(s), 0);
      S(P, 4, 0.2 * s, 0, -0.25); S(P, 5, 0.2 * s, 0, 0.25);
    },
  },
  shots: {
    attack: {
      dur: 0.9, impact: 0.45, fn(P, t) {
        const wind = smooth01(0, 0.32, t) * (1 - smooth01(0.32, 0.45, t));
        const lunge = smooth01(0.32, 0.45, t) * (1 - smooth01(0.55, 0.9, t));
        scl(P, SLIME_N, 0.1 * wind - 0.1 * lunge, -0.15 * wind + 0.25 * lunge, 0.1 * wind + 0.15 * lunge);
        offset(P, SLIME_N, 0, 0, -0.35 * lunge);
        S(P, 2, 0.15 * wind - 0.45 * lunge, 0, 0);
        S(P, 3, 0.6 * lunge + 0.2 * wind, 0, 0);
      },
    },
  },
  die: {
    dur: 1.2, fn(P, t) {
      const f = smooth01(0, 1.0, t);
      scl(P, SLIME_N, 0.5 * f, -0.75 * f, 0.5 * f);
      S(P, 2, 0.3 * f, 0, 0); S(P, 3, 0.4 * f, 0, 0);
    },
  },
  hurt(P, k) { const o = SLIME_N * 3 + 3; P[o] += 0.12 * k; P[o + 1] -= 0.18 * k; P[o + 2] += 0.12 * k; },
};

// =============================================================================================
// Wyrm (ashen drake / Ashen Wyrm)
// =============================================================================================
export const WB = {
  root: 0, hips: 1, spine: 2, chest: 3, neck1: 4, neck2: 5, neck3: 6, head: 7, jaw: 8,
  tail1: 9, tail2: 10, tail3: 11, tail4: 12, tail5: 13,
  flU: 14, flL: 15, flF: 16, frU: 17, frL: 18, frF: 19, blU: 20, blL: 21, blF: 22, brU: 23, brL: 24, brF: 25,
  wingL: 26, wingL2: 27, wingR: 28, wingR2: 29,
};
const WYRM_N = 30;
const WYRM_DEFS = [
  ['root', -1, 0, 0, 0], ['hips', 0, 0, 0.82, 0.35], ['spine', 1, 0, 0.04, -0.42], ['chest', 2, 0, 0.04, -0.38],
  ['neck1', 3, 0, 0.16, -0.26], ['neck2', 4, 0, 0.2, -0.22], ['neck3', 5, 0, 0.18, -0.2], ['head', 6, 0, 0.08, -0.18], ['jaw', 7, 0, -0.07, -0.06],
  ['tail1', 1, 0, 0.0, 0.36], ['tail2', 9, 0, -0.06, 0.38], ['tail3', 10, 0, -0.08, 0.38], ['tail4', 11, 0, -0.08, 0.36], ['tail5', 12, 0, -0.06, 0.32],
  ['flU', 3, -0.27, -0.12, 0.0], ['flL', 14, 0, -0.3, 0.05], ['flF', 15, 0, -0.3, -0.04],
  ['frU', 3, 0.27, -0.12, 0.0], ['frL', 17, 0, -0.3, 0.05], ['frF', 18, 0, -0.3, -0.04],
  ['blU', 1, -0.3, -0.1, 0.05], ['blL', 20, 0, -0.32, -0.06], ['blF', 21, 0, -0.3, 0.06],
  ['brU', 1, 0.3, -0.1, 0.05], ['brL', 23, 0, -0.32, -0.06], ['brF', 24, 0, -0.3, 0.06],
  ['wingL', 3, -0.2, 0.22, 0.12], ['wingL2', 26, -0.55, 0.22, 0.12], ['wingR', 3, 0.2, 0.22, 0.12], ['wingR2', 28, 0.55, 0.22, 0.12],
];
function buildWyrm(spec, bones) {
  const c = spec.colors, boss = spec.boss;
  const B = new Builder(bones, { aoTop: 1.8, aoBottom: 0, aoMin: 0.72 });
  const bodyC = col(c.body, '#5d5a6a'), bellyC = col(c.belly, '#c9a07a'), fireC = col(c.fire, '#ff8a3a'), eyeC = col(c.eyes, '#ffd27a');
  const W = (n) => bones[n].getWorldPosition(new THREE.Vector3());
  const tmp = new THREE.Color();
  const darkC = shade(bodyC, 0.62);
  // Body: one sinuous tube from the tail tip to the skull.
  const R = [
    [WB.tail5, 0.012, 0.012, new THREE.Vector3(0, -0.03, 0.34)], [WB.tail5, 0.05, 0.045], [WB.tail4, 0.08, 0.072], [WB.tail3, 0.12, 0.11],
    [WB.tail2, 0.17, 0.155], [WB.tail1, 0.24, 0.22], [WB.hips, 0.34, 0.31], [WB.spine, 0.37, 0.345], [WB.chest, 0.35, 0.37],
    [WB.neck1, 0.215, 0.24], [WB.neck2, 0.165, 0.185], [WB.neck3, 0.14, 0.155], [WB.head, 0.13, 0.13],
  ];
  const ctrl = R.map(([b, rx, ry, d]) => ({ p: d ? W(b).add(d) : W(b), rx, ry, bone: b, dy: b === WB.chest ? -0.03 : 0 }));
  B.add(spineTube(ctrl, {
    seg: 4, radial: 14,
    colorAt: (u, ang, out) => {
      const s = Math.sin(ang);
      if (s < -0.32) { const plate = Math.sin(u * 150) > 0.55; return out.copy(bellyC).multiplyScalar(plate ? 0.78 : 1); }
      const n = Math.sin(u * 211 + ang * 9.1) * Math.sin(u * 97 - ang * 13.7);
      out.copy(bodyC).multiplyScalar(n > 0.45 ? 1.16 : n < -0.45 ? 0.84 : 1);
      if (s > 0.86) out.copy(darkC);
      if (s < -0.15) out.lerp(bellyC, 0.35);
      return out;
    },
  }), null, bodyC, { keepColor: true, keepSkin: true, shine: 0.25 });
  // Dorsal spikes along the ridge.
  const ridge = [WB.neck3, WB.neck2, WB.neck1, WB.chest, WB.spine, WB.hips, WB.tail1, WB.tail2, WB.tail3, WB.tail4];
  const ridgeR = [0.15, 0.18, 0.24, 0.37, 0.345, 0.31, 0.22, 0.155, 0.11, 0.072];
  for (let i = 0; i < ridge.length; i++) {
    const h = (boss ? 0.26 : 0.18) * (0.45 + 0.55 * Math.sin(Math.PI * (i + 1) / (ridge.length + 1)));
    B.add(cone(h * 0.38, h, 4), ridge[i], darkC, { at: [0, ridgeR[i] * 0.92, 0.04], rot: [0.55, 0, 0], scale: [0.55, 1, 1], flat: true, shine: 0.3 });
  }
  // Tail spade.
  B.add(extrude([[0, 0.14], [0.11, 0.0], [0.04, -0.03], [0, -0.17], [-0.04, -0.03], [-0.11, 0.0]], 0.025), WB.tail5, darkC, { at: [0, -0.02, 0.36], rot: [Math.PI / 2, 0, 0], flat: true });
  // Head: skull, wedge snout, brows, jaw, teeth, horns, frills.
  const hk = boss ? 1.08 : 1;
  B.add(sphere(0.15 * hk, 12, 9), WB.head, bodyC, { at: [0, 0.03, 0.0], scale: [1.08, 0.88, 1.15], flat: true, shine: 0.25 });
  const snout = new THREE.CylinderGeometry(0.06 * hk, 0.105 * hk, 0.36 * hk, 4, 1);
  snout.rotateY(Math.PI / 4);
  B.add(snout, WB.head, bodyC, { at: [0, 0.0, -0.25 * hk], rot: [-Math.PI / 2, 0, 0], scale: [1.2, 1, 0.75], flat: true, shine: 0.25 });
  B.add(box(0.15 * hk, 0.03, 0.3 * hk), WB.head, '#3a1010', { at: [0, -0.05, -0.24 * hk] });
  const jaw = new THREE.CylinderGeometry(0.05 * hk, 0.085 * hk, 0.34 * hk, 4, 1);
  jaw.rotateY(Math.PI / 4);
  B.add(jaw, WB.jaw, shade(bodyC, 0.9), { at: [0, -0.02, -0.18 * hk], rot: [-Math.PI / 2, 0, 0], scale: [1.15, 1, 0.5], flat: true });
  B.add(box(0.12 * hk, 0.02, 0.26 * hk), WB.jaw, '#4a1410', { at: [0, 0.012, -0.18 * hk], glow: 0.15 });
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) {
    B.add(cone(0.014, 0.055, 3), WB.head, '#f0e6d0', { at: [sx * (0.075 - i * 0.008) * hk, -0.065, (-0.12 - i * 0.065) * hk], rot: [Math.PI, 0, 0] });
    B.add(cone(0.012, 0.045, 3), WB.jaw, '#f0e6d0', { at: [sx * (0.07 - i * 0.008) * hk, 0.035, (-0.07 - i * 0.065) * hk] });
  }
  for (const sx of [-1, 1]) {
    B.add(box(0.1, 0.04, 0.12), WB.head, darkC, { at: [sx * 0.085 * hk, 0.105 * hk, -0.1 * hk], rot: [0.25, sx * 0.25, sx * -0.35], flat: true });
    B.add(sphere(0.034, 7, 5), WB.head, eyeC, { at: [sx * 0.105 * hk, 0.06 * hk, -0.11 * hk], scale: [1.1, 0.55, 1.2], glow: 1, ao: false });
    B.add(sphere(0.018, 5, 4), WB.head, fireC, { at: [sx * 0.045 * hk, 0.035, -0.42 * hk], glow: 0.9, ao: false });
    B.add(tube([[0, 0, 0], [sx * 0.05, 0.07, 0.12], [sx * 0.1, 0.09, 0.27], [sx * 0.08, 0.14, 0.42]].map(([x, y, z]) => [x * hk, y * hk, z * hk]), (t) => 0.048 * hk * (1 - t) + 0.006, 10, 6), WB.head, '#d8ccb0', { at: [sx * 0.09 * hk, 0.1 * hk, 0.02], shine: 0.2 });
    if (boss) B.add(tube([[0, 0, 0], [sx * 0.1, -0.02, 0.09], [sx * 0.2, 0.03, 0.2]], (t) => 0.032 * (1 - t) + 0.005, 8, 5), WB.head, '#d8ccb0', { at: [sx * 0.13, 0.0, 0.02] });
    for (let i = 0; i < 3; i++) B.add(cone(0.028, 0.13 - i * 0.02, 4), WB.jaw, darkC, { at: [sx * 0.085, -0.02 - i * 0.025, 0.0 + i * 0.03], rot: [-2.0 + i * 0.25, 0, sx * 0.55], flat: true });
  }
  // Legs: heavy haunches merging into the body, claws.
  for (const [U, L, F, front] of [[WB.flU, WB.flL, WB.flF, 1], [WB.frU, WB.frL, WB.frF, 1], [WB.blU, WB.blL, WB.blF, 0], [WB.brU, WB.brL, WB.brF, 0]]) {
    B.add(taper(front ? 0.17 : 0.22, 0.11, 0.44, 8, 2), U, bodyC, { at: [0, 0.12, 0], flat: true, shine: 0.2 });
    B.add(taper(0.11, 0.075, 0.32, 8, 2), L, shade(bodyC, 0.95), { flat: true, shine: 0.2 });
    B.add(sphere(0.095, 8, 6), F, shade(bodyC, 0.85), { at: [0, -0.01, -0.06], scale: [1.15, 0.55, 1.5], flat: true });
    for (let i = -1; i <= 1; i++) B.add(cone(0.022, 0.1, 4), F, '#efe6d0', { at: [i * 0.055, -0.03, -0.2], rot: [-Math.PI / 2 - 0.3, 0, 0], shine: 0.3 });
  }
  // Wings: arm + three fingers carrying a scalloped membrane (folds with the finger bone).
  const span = boss ? 1.3 : 0.8;
  const memC = mix(shade(bodyC, 0.75), fireC, 0.14);
  for (const [w1, w2, sx] of [[WB.wingL, WB.wingL2, -1], [WB.wingR, WB.wingR2, 1]]) {
    const sh = W(w1), wr = W(w2);
    const d = wr.clone().sub(sh);
    B.add(tube([[0, 0, 0], [d.x * 0.5, d.y * 0.5 + 0.06, d.z * 0.5], [d.x, d.y, d.z]], (t) => 0.045 - 0.015 * t, 6, 5), w1, darkC, {});
    const tips = [[sx * span, 0.06, 0.12], [sx * span * 0.8, -0.04, 0.62], [sx * span * 0.42, -0.08, 0.95]].map(([x, y, z]) => wr.clone().add(new THREE.Vector3(x, y, z)));
    for (const tp of tips) {
      const e = tp.clone().sub(wr);
      B.add(tube([[0, 0, 0], [e.x * 0.5, e.y * 0.5 + 0.04, e.z * 0.5], [e.x, e.y, e.z]], (t) => 0.026 * (1 - t) + 0.007, 8, 4), w2, darkC, {});
    }
    B.add(cone(0.03, 0.12, 4), w2, '#efe6d0', { at: [sx * 0.02, 0.06, -0.02], rot: [-0.4, 0, sx * -0.6] });
    const bodyBack = new THREE.Vector3(sx * 0.26, W(WB.hips).y + 0.12, W(WB.hips).z - 0.05);
    const root = new THREE.Vector3(sx * 0.2, sh.y - 0.04, sh.z - 0.02);
    const sag = (a, b, k = 0.24) => a.clone().add(b).multiplyScalar(0.5).lerp(wr, k);
    const Wp = { p: wr, bone: w2 }, T = tips.map((p) => ({ p, bone: w2 }));
    const m12 = { p: sag(tips[0], tips[1]), bone: w2 }, m23 = { p: sag(tips[1], tips[2]), bone: w2 };
    const m3b = { p: sag(tips[2], bodyBack, 0.2), bone: w2, bone2: WB.hips, w: 0.6 };
    const BB = { p: bodyBack, bone: WB.hips }, SR = { p: root, bone: WB.chest };
    const g = membrane([[Wp, T[0], m12], [Wp, m12, T[1]], [Wp, T[1], m23], [Wp, m23, T[2]], [Wp, T[2], m3b], [Wp, m3b, BB], [Wp, BB, SR], [Wp, SR, { p: sh, bone: w1 }]], memC);
    B.add(g, null, memC, { keepColor: true, keepSkin: true, flat: true, ao: false, glow: 0.04 });
  }
  // Ember cracks on the chest (boss).
  if (boss) {
    for (let i = 0; i < 6; i++) B.add(box(0.02, 0.2, 0.02), WB.chest, fireC, { at: [-0.15 + i * 0.06, -0.14, -0.27 + (i % 2) * 0.05], rot: [0.3, 0, (i - 2.5) * 0.25], glow: 0.9, ao: false });
  }
  return B.build();
}
const NECK = [WB.neck1, WB.neck2, WB.neck3];
const TAIL = [WB.tail1, WB.tail2, WB.tail3, WB.tail4, WB.tail5];
const WLEGS = [[WB.flU, WB.flL, WB.flF], [WB.frU, WB.frL, WB.frF], [WB.blU, WB.blL, WB.blF], [WB.brU, WB.brL, WB.brF]];
function wyrmBase(P, c, k = 1) {
  const br = Math.sin(c.t * 1.2);
  scl(P, WYRM_N, 0.02 * br, 0.025 * br, 0);
  const sway = Math.sin(c.t * 0.5 + c.seed);
  for (let i = 0; i < 3; i++) S(P, NECK[i], [-0.35, 0.15, 0.35][i] + 0.04 * br, sway * 0.12 * k, 0);
  S(P, WB.head, 0.1 + 0.05 * Math.sin(c.t * 0.8), sway * 0.15 * k, 0);
  for (let i = 0; i < 5; i++) S(P, TAIL[i], 0.04, Math.sin(c.t * 0.9 - i * 0.6 + c.seed) * 0.16 * k, 0);
  // Folded wings.
  S(P, WB.wingL, 0.3, -0.5, -0.3 + 0.05 * br); S(P, WB.wingL2, 0, 1.6, 0.4);
  S(P, WB.wingR, 0.3, 0.5, 0.3 - 0.05 * br); S(P, WB.wingR2, 0, -1.6, -0.4);
}
const wyrmRig = {
  n: WYRM_N,
  loops: {
    idle(P, c) { P.fill(0); wyrmBase(P, c); },
    walk(P, c) {
      P.fill(0);
      wyrmBase(P, c, 0.5);
      const w = c.ph * TAU;
      const ph = [0.25, 0.75, 0.0, 0.5];
      for (let i = 0; i < 4; i++) {
        const [U, L, F] = WLEGS[i];
        const s = Math.sin(w + ph[i] * TAU), up = pos(Math.cos(w + ph[i] * TAU));
        P[U * 3] = 0.42 * s; P[L * 3] = -0.6 * Math.pow(up, 1.4); P[F * 3] = -(P[U * 3] + P[L * 3]) * 0.8;
      }
      S(P, WB.hips, 0, 0.06 * Math.sin(w), 0.04 * Math.sin(w));
      S(P, WB.spine, 0, -0.05 * Math.sin(w), 0);
      offset(P, WYRM_N, 0, 0.025 * Math.cos(2 * w), 0);
      for (let i = 0; i < 5; i++) A(P, TAIL[i], 0, Math.sin(w - i * 0.7) * 0.1, 0);
    },
  },
  shots: {
    attack: {
      dur: 1.0, impact: 0.5, fn(P, t) {
        const rear = smooth01(0, 0.38, t) * (1 - smooth01(0.38, 0.5, t));
        const bite = smooth01(0.38, 0.5, t) * (1 - smooth01(0.6, 1.0, t));
        for (let i = 0; i < 3; i++) A(P, NECK[i], 0.25 * rear - [0.2, 0.35, 0.3][i] * bite, 0, 0);
        A(P, WB.head, 0.2 * rear - 0.1 * bite, 0, 0);
        A(P, WB.jaw, 0.6 * rear * 0.6 + 0.75 * bite, 0, 0);
        A(P, WB.chest, 0.08 * rear - 0.1 * bite, 0, 0);
        offset(P, WYRM_N, 0, 0.04 * rear, 0.1 * rear - 0.2 * bite);
        A(P, WB.flU, 0.4 * bite, 0, 0); A(P, WB.frU, 0.25 * bite, 0, 0);
      },
    },
    claw: {
      dur: 0.9, impact: 0.45, fn(P, t) {
        const up = smooth01(0, 0.35, t) * (1 - smooth01(0.45, 0.9, t));
        const sw = smooth01(0.35, 0.47, t) * (1 - smooth01(0.55, 0.9, t));
        A(P, WB.chest, 0.25 * up, 0, 0); offset(P, WYRM_N, 0, 0.12 * up, 0);
        A(P, WB.frU, 1.4 * up - 1.3 * sw, 0, 0.2 * sw); A(P, WB.frL, -0.8 * up + 0.6 * sw, 0, 0);
        A(P, WB.jaw, 0.3 * up, 0, 0);
      },
    },
    breath: {
      dur: 2.4, release: 0.7, fn(P, t) {
        const rear = smooth01(0, 0.6, t) * (1 - smooth01(0.6, 0.85, t));
        const blow = smooth01(0.6, 0.85, t) * (1 - smooth01(1.9, 2.4, t));
        for (let i = 0; i < 3; i++) A(P, NECK[i], 0.35 * rear - [0.25, 0.25, 0.1][i] * blow, (i - 1) * 0.05 * Math.sin(t * 9) * blow, 0);
        A(P, WB.head, 0.35 * rear - 0.1 * blow, 0, 0);
        A(P, WB.jaw, 0.25 * rear + 0.85 * blow, 0, 0);
        A(P, WB.chest, 0.15 * rear, 0, 0);
        scl(P, WYRM_N, 0.04 * rear, 0.06 * rear, 0);
        S(P, WB.wingL, 0.3 - 0.4 * (rear + blow), -0.5 + 0.6 * (rear + blow), -0.3 - 0.6 * (rear + blow)); S(P, WB.wingL2, 0, 1.6 - 1.4 * (rear + blow), 0.4);
        S(P, WB.wingR, 0.3 - 0.4 * (rear + blow), 0.5 - 0.6 * (rear + blow), 0.3 + 0.6 * (rear + blow)); S(P, WB.wingR2, 0, -1.6 + 1.4 * (rear + blow), -0.4);
      },
    },
    roar: {
      dur: 2.0, fn(P, t) {
        const r = smooth01(0, 0.4, t) * (1 - smooth01(1.5, 2.0, t));
        for (let i = 0; i < 3; i++) A(P, NECK[i], 0.3 * r, 0, 0);
        A(P, WB.head, 0.5 * r, Math.sin(t * 7) * 0.08 * r, 0);
        A(P, WB.jaw, 0.9 * r, 0, 0);
        offset(P, WYRM_N, 0, 0.1 * r, 0.05 * r);
        A(P, WB.chest, 0.25 * r, 0, 0);
        S(P, WB.wingL, -0.2 * r + 0.3, -0.5 + 1.1 * r, -0.3 - 0.9 * r); S(P, WB.wingL2, 0, 1.6 - 1.7 * r, 0.4 - 0.3 * r);
        S(P, WB.wingR, -0.2 * r + 0.3, 0.5 - 1.1 * r, 0.3 + 0.9 * r); S(P, WB.wingR2, 0, -1.6 + 1.7 * r, -0.4 + 0.3 * r);
      },
    },
  },
  die: {
    dur: 1.6, fn(P, t) {
      const f = smooth01(0.2, 1.2, t);
      const rear = smooth01(0, 0.3, t) * (1 - f);
      S(P, WB.hips, 0, 0, 0.9 * f);
      offset(P, WYRM_N, 0, -0.55 * f + 0.1 * rear, 0);
      for (let i = 0; i < 3; i++) S(P, NECK[i], 0.3 * rear - 0.15 * f, 0, -0.35 * f);
      S(P, WB.head, 0.4 * rear, 0, -0.3 * f); S(P, WB.jaw, 0.6 * rear + 0.3 * f, 0, 0);
      for (const [U, L] of WLEGS) { P[U * 3] = 0.2 * f; P[L * 3] = -0.2 * f; }
      for (let i = 0; i < 5; i++) S(P, TAIL[i], 0, 0.1 * f, 0);
      S(P, WB.wingL, 0.3, -0.5 + 0.8 * rear, -0.3 - 0.4 * f); S(P, WB.wingL2, 0, 1.6 - 1.2 * rear, 0.4);
      S(P, WB.wingR, 0.3, 0.5 - 0.8 * rear, 0.3 + 0.4 * f); S(P, WB.wingR2, 0, -1.6 + 1.2 * rear, -0.4);
    },
  },
  hurt(P, k) { A(P, WB.chest, 0.12 * k, 0, 0); A(P, WB.neck2, 0.3 * k, 0.15 * k, 0); A(P, WB.jaw, 0.4 * k, 0, 0); },
};

// =============================================================================================
// Registry of skinned creature rigs
// =============================================================================================
export const CREATURE_RIGS = {
  quadruped: { rig: quadRig, defs: (spec) => quadDefs(spec.variant), build: buildQuad, index: QB },
  bird: { rig: birdRig, defs: () => BIRD_DEFS, build: buildBird, index: BB },
  spider: { rig: spiderRig, defs: spiderDefs, build: buildSpider, index: { body: 1, head: 3, abdomen: 2 } },
  slime: { rig: slimeRig, defs: () => SLIME_DEFS, build: buildSlime, index: { body: 1, top: 2, maw: 3 } },
  wyrm: { rig: wyrmRig, defs: () => WYRM_DEFS, build: buildWyrm, index: WB },
};
export function creatureSpec(model = {}, monster = '') {
  const rig = CREATURE_RIGS[model.rig] ? model.rig : 'quadruped';
  let variant = model.body || '';
  if (rig === 'quadruped' && !QV[variant]) variant = /rat|rodent|mouse/.test(monster) ? 'rodent' : /cow|bull/.test(monster) ? 'cow' : /boar|pig/.test(monster) ? 'boar' : /bear/.test(monster) ? 'bear' : 'wolf';
  const colors = { ...(model.colors || {}) };
  const boss = rig === 'wyrm' && ((model.scale || 1) > 2 || /ashen_wyrm/.test(monster));
  const spec = { rig, variant, colors, boss, monster };
  spec.key = JSON.stringify(['creature', rig, variant, colors, boss]);
  return spec;
}

// =============================================================================================
// Rigid glowing beings: shard wisp, the Orbio Oracle. Built from a few shared meshes + sprites.
// Each returns { root, parts, animate(actor, dt), headHeight, socket }.
// =============================================================================================
let WISP_GEO = null;
export function buildWisp(colors = {}) {
  const coreC = col(colors.core, '#8fe3ff'), glowC = col(colors.glow, '#b18cff');
  const root = new THREE.Group();
  if (!WISP_GEO) {
    const B = new Builder(null, { aoMin: 1 });
    B.add(new THREE.IcosahedronGeometry(0.16, 1), null, '#ffffff', { glow: 1, flat: true, ao: false });
    const core = B.build();
    const B2 = new Builder(null, { aoMin: 1 });
    B2.add(new THREE.OctahedronGeometry(0.07, 0), null, '#ffffff', { scale: [0.6, 1.6, 0.6], glow: 0.8, flat: true, ao: false, shine: 1 });
    const shard = B2.build();
    const B3 = new Builder(null, { aoMin: 1 });
    B3.add(new THREE.IcosahedronGeometry(0.3, 1), null, '#ffffff', { flat: true, glow: 0.35, ao: false, shine: 1 });
    WISP_GEO = { core, shard, shell: B3.build() };
  }
  // Per-wisp colour via vertex colours is shared white; tint the materials per colour key.
  const mats = wispMaterials(coreC, glowC);
  const core = new THREE.Mesh(WISP_GEO.core, mats.core);
  const shell = new THREE.Mesh(WISP_GEO.shell, mats.shell);
  const body = new THREE.Group();
  body.position.y = 1.0;
  body.add(core, shell);
  const shards = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(WISP_GEO.shard, mats.shard);
    body.add(s);
    shards.push(s);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: glowC, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75 }));
  halo.scale.setScalar(1.6);
  body.add(halo);
  root.add(body);
  core.castShadow = false;
  let t = Math.random() * 10;
  return {
    root, body, core, halo, headHeight: 1.4, castShadow: [], colors: { core: '#' + coreC.getHexString(), glow: '#' + glowC.getHexString() },
    socket: body,
    animate(actor, dt) {
      t += dt;
      const st = actor.state;
      const atk = st.shot ? env(st.shotT, st.shotDur, 0.15, 0.3) : 0;
      const dead = st.dead ? smooth01(0, 0.8, st.deadT) : 0;
      const hit = st.hurtK;
      body.position.y = 1.0 + Math.sin(t * 2.1) * 0.12 - dead * 0.6;
      body.rotation.y = t * 0.8;
      const s = (1 + atk * 0.35 + Math.sin(t * 9) * 0.04 + hit * 0.3) * (1 - dead * 0.9);
      core.scale.setScalar(s);
      shell.scale.setScalar(s * (1 + 0.05 * Math.sin(t * 3)));
      shell.rotation.set(t * 0.4, t * 0.7, 0);
      for (let i = 0; i < shards.length; i++) {
        const a = t * (1.6 + atk * 6) + (i / shards.length) * TAU;
        const r = (0.42 + 0.06 * Math.sin(t * 2 + i)) * (1 - dead) + dead * (1.2 + i * 0.2);
        shards[i].position.set(Math.cos(a) * r, Math.sin(t * 2.3 + i * 1.7) * 0.18 + dead * i * 0.2, Math.sin(a) * r);
        shards[i].rotation.set(t + i, t * 1.3, 0.4);
      }
      halo.material.opacity = (0.6 + 0.25 * Math.sin(t * 5) + atk * 0.4) * (1 - dead);
      halo.scale.setScalar(1.5 + atk * 0.8);
      // Lean into motion.
      body.rotation.x = actor.state.moveK * 0.25;
    },
  };
}
const WISP_MATS = new Map();
function wispMaterials(coreC, glowC) {
  const key = coreC.getHexString() + glowC.getHexString();
  if (WISP_MATS.has(key)) return WISP_MATS.get(key);
  const mk = (c, transparent, opacity, ei) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: ei, roughness: 0.3, transparent, opacity, depthWrite: !transparent, flatShading: true });
  const mats = { core: mk(mix(coreC, '#ffffff', 0.35), false, 1, 2.2), shell: mk(glowC, true, 0.35, 1.6), shard: mk(coreC, false, 1, 1.6) };
  WISP_MATS.set(key, mats);
  return mats;
}

// The Orbio Oracle: a hooded figure of violet-cyan crystal light, floating above a glyph circle.
// Faceted robe with glowing seams, crystal pauldrons and a mandorla of shards behind the head, a
// deep hood around a faceless visage with one great eye, two floating crystal hands cradling a
// "thought orb", orbit rings and drifting shards. Built from shared static meshes.
let ORACLE = null;
function oracleGeometry() {
  if (ORACLE) return ORACLE;
  const violet = C('#7a4cf0'), cyan = C('#5fe1ff'), deep = C('#1e1240'), pale = C('#c9b8ff'), tmp = new THREE.Color();
  // Robe: faceted lathe with folds; deep hem rising to violet, cyan seams in the folds.
  const B = new Builder(null, { aoMin: 1 });
  const prof = [[0.05, 0.0], [0.52, 0.05], [0.55, 0.2], [0.47, 0.55], [0.37, 0.95], [0.33, 1.2], [0.37, 1.42], [0.45, 1.58], [0.43, 1.68], [0.28, 1.78], [0.12, 1.84], [0.02, 1.86]];
  const robe = lathe(prof, 20);
  deform(robe, (x, y, z) => {
    const a = Math.atan2(z, x);
    const fold = 1 + 0.06 * Math.sin(a * 7) * smooth01(1.3, 0.2, y);
    return [x * fold, y, z * fold * 0.85];
  });
  B.add(robe, null, violet, {
    flat: true, ao: false, shine: 0.6,
    colorFn: (x, y, z) => {
      const a = Math.atan2(z, x);
      const seam = Math.abs(Math.sin(a * 7)) > 0.985 && y < 1.25 && y > 0.1;
      if (seam) return tmp.copy(cyan);
      return tmp.copy(deep).lerp(violet, smooth01(0.0, 0.9, y)).lerp(pale, smooth01(1.35, 1.8, y) * 0.5);
    },
    glowFn: (x, y, z) => { const a = Math.atan2(z, x); return Math.abs(Math.sin(a * 7)) > 0.985 && y < 1.25 && y > 0.1 ? 0.45 : 0.1 + 0.25 * smooth01(1.0, 1.75, y); },
  });
  // Bell sleeves hanging from the shoulders (the hands float just beyond their openings).
  for (const sx of [-1, 1]) {
    const pts = [[sx * 0.4, 1.64, 0.0], [sx * 0.5, 1.45, -0.08], [sx * 0.52, 1.28, -0.22], [sx * 0.48, 1.18, -0.33]];
    B.add(tube(pts, (t) => 0.08 + 0.09 * t * t, 10, 9), null, violet, { flat: true, ao: false, shine: 0.6, colorFn: (x, y) => tmp.copy(violet).lerp(pale, smooth01(1.2, 1.7, y) * 0.4), glowFn: () => 0.18 });
    B.add(torus(0.165, 0.016, 3, 14), null, cyan, { at: [sx * 0.48, 1.18, -0.33], rot: [0.9, 0, 0], glow: 1, ao: false });
    B.add(sphere(0.15, 8, 6), null, deep, { at: [sx * 0.48, 1.2, -0.31], scale: [1, 1, 0.3], rot: [0.9, 0, 0], ao: false, shade: 0.6 });
  }
  // Hem: crystal points hanging below the robe.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    B.add(new THREE.OctahedronGeometry(0.07, 0), null, i % 2 ? violet : cyan, { at: [Math.cos(a) * 0.48, 0.0, Math.sin(a) * 0.42], scale: [0.6, 1.8, 0.6], flat: true, glow: i % 2 ? 0.4 : 0.9, ao: false });
  }
  // Glowing hem band and sash.
  B.add(torus(0.53, 0.018, 3, 20), null, cyan, { at: [0, 0.12, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.88, 1], glow: 1, ao: false });
  B.add(torus(0.355, 0.03, 3, 16), null, pale, { at: [0, 1.22, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.86, 1], glow: 0.5, ao: false, flat: true });
  // Pauldrons: clusters of crystals on each shoulder.
  for (const sx of [-1, 1]) {
    B.add(new THREE.OctahedronGeometry(0.17, 0), null, cyan, { at: [sx * 0.42, 1.66, 0.0], scale: [0.75, 1.3, 0.75], rot: [0, 0, sx * -0.65], flat: true, glow: 0.75, ao: false, shine: 1 });
    B.add(new THREE.OctahedronGeometry(0.11, 0), null, violet, { at: [sx * 0.55, 1.52, 0.08], scale: [0.6, 1.5, 0.6], rot: [0.3, 0, sx * -1.0], flat: true, glow: 0.5, ao: false });
    B.add(new THREE.OctahedronGeometry(0.09, 0), null, pale, { at: [sx * 0.33, 1.78, 0.1], scale: [0.5, 1.6, 0.5], rot: [-0.2, 0, sx * -0.3], flat: true, glow: 0.7, ao: false });
  }
  // Mandorla: a fan of tall shards rising behind the head.
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.32;
    const h = 0.55 - Math.abs(i) * 0.06;
    B.add(new THREE.OctahedronGeometry(0.08, 0), null, Math.abs(i) % 2 ? violet : cyan, { at: [Math.sin(a) * 0.5, 2.05 + Math.cos(a) * 0.38, 0.32], scale: [0.45, h / 0.08 * 0.5, 0.3], rot: [0.15, 0, -a], flat: true, glow: 0.85, ao: false, shine: 1 });
  }
  // Deep hood around the visage.
  const hoodG = new THREE.SphereGeometry(0.34, 10, 8, Math.PI * 1.5 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.74);
  B.add(hoodG, null, violet, { at: [0, 2.02, 0.03], scale: [1, 1.22, 1.08], flat: true, ao: false, shine: 0.6, colorFn: (x, y) => tmp.copy(violet).lerp(pale, smooth01(2.0, 2.4, y) * 0.6), glowFn: (x, y) => 0.15 + 0.3 * smooth01(2.0, 2.4, y) });
  const hoodIn = new THREE.SphereGeometry(0.325, 10, 8, Math.PI * 1.5 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.74);
  { const ia = hoodIn.index.array; for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } }
  B.add(hoodIn, null, deep, { at: [0, 2.02, 0.03], scale: [1, 1.22, 1.08], ao: false, shade: 0.5 });
  B.add(cone(0.11, 0.38, 5), null, violet, { at: [0, 2.44, 0.2], rot: [0.6, 0, 0], flat: true, glow: 0.35, ao: false });
  const body = B.build();
  // Visage: a pale glowing orb with one great eye.
  const V = new Builder(null, { aoMin: 1 });
  V.add(new THREE.IcosahedronGeometry(0.19, 2), null, '#e8fbff', { glow: 1, ao: false });
  V.add(torus(0.095, 0.02, 5, 20), null, '#8a5cff', { at: [0, 0, -0.17], glow: 0.9, ao: false });
  V.add(sphere(0.07, 10, 8), null, '#b18cff', { at: [0, 0, -0.165], scale: [1, 1, 0.4], glow: 1, ao: false });
  V.add(sphere(0.035, 8, 6), null, '#120a28', { at: [0, 0, -0.19], scale: [1, 1, 0.5], ao: false });
  V.add(sphere(0.012, 5, 4), null, '#ffffff', { at: [0.02, 0.022, -0.2], glow: 1, ao: false });
  const visage = V.build();
  // Hand: crystal palm with three finger shards.
  const H = new Builder(null, { aoMin: 1 });
  H.add(new THREE.OctahedronGeometry(0.1, 0), null, cyan, { scale: [0.9, 1.2, 0.5], flat: true, glow: 0.8, ao: false, shine: 1 });
  for (let i = -1; i <= 1; i++) H.add(new THREE.OctahedronGeometry(0.05, 0), null, pale, { at: [i * 0.05, 0.14, 0], scale: [0.5, 1.8, 0.5], rot: [0, 0, -i * 0.2], flat: true, glow: 0.8, ao: false });
  H.add(new THREE.OctahedronGeometry(0.04, 0), null, pale, { at: [0.09, 0.03, 0], scale: [0.5, 1.4, 0.5], rot: [0, 0, -0.9], flat: true, glow: 0.8, ao: false });
  const hand = H.build();
  // Orbit ring with tick marks.
  const R = new Builder(null, { aoMin: 1 });
  R.add(torus(0.62, 0.014, 4, 56), null, '#9ff0ff', { glow: 1, ao: false });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; R.add(box(0.03, 0.07, 0.03), null, '#c9b8ff', { at: [Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62], glow: 1, ao: false }); }
  const ring = R.build();
  const SH = new Builder(null, { aoMin: 1 });
  SH.add(new THREE.OctahedronGeometry(0.06, 0), null, '#b18cff', { scale: [0.6, 1.7, 0.6], flat: true, glow: 0.9, ao: false, shine: 1 });
  const shard = SH.build();
  // Thought orb.
  const O = new Builder(null, { aoMin: 1 });
  O.add(new THREE.IcosahedronGeometry(0.1, 1), null, '#ffffff', { glow: 1, ao: false, flat: true });
  O.add(torus(0.15, 0.008, 3, 24), null, '#5fe1ff', { glow: 1, ao: false });
  O.add(torus(0.15, 0.008, 3, 24), null, '#b18cff', { rot: [Math.PI / 2, 0, 0], glow: 1, ao: false });
  const orb = O.build();
  // Glyph circle on the ground.
  const G = new Builder(null, { aoMin: 1 });
  G.add(torus(1.05, 0.018, 3, 64), null, '#5fe1ff', { rot: [Math.PI / 2, 0, 0], glow: 0.9, ao: false });
  G.add(torus(0.8, 0.012, 3, 56), null, '#b18cff', { rot: [Math.PI / 2, 0, 0], glow: 0.9, ao: false });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    G.add(box(0.12, 0.01, i % 2 ? 0.035 : 0.06), null, i % 2 ? '#b18cff' : '#5fe1ff', { at: [Math.cos(a) * 0.925, 0, Math.sin(a) * 0.925], rot: [0, -a, 0], glow: 0.9, ao: false });
  }
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; G.add(box(0.5, 0.01, 0.012), null, '#5fe1ff', { at: [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], rot: [0, -a + Math.PI / 2, 0], glow: 0.7, ao: false }); }
  const glyph = G.build();
  ORACLE = { body, visage, hand, ring, shard, orb, glyph };
  return ORACLE;
}
export function buildOracle() {
  const G = oracleGeometry();
  const M = materials();
  const root = new THREE.Group();
  const float = new THREE.Group();
  root.add(float);
  const body = new THREE.Mesh(G.body, M.body);
  float.add(body);
  const visage = new THREE.Mesh(G.visage, M.body);
  visage.position.set(0, 2.0, -0.06);
  float.add(visage);
  const hands = [new THREE.Mesh(G.hand, M.body), new THREE.Mesh(G.hand, M.body)];
  for (const h of hands) float.add(h);
  const orb = new THREE.Mesh(G.orb, M.body);
  float.add(orb);
  const rings = [new THREE.Mesh(G.ring, M.body), new THREE.Mesh(G.ring, M.body)];
  rings[1].scale.setScalar(0.74);
  for (const r of rings) float.add(r);
  const shards = [];
  for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(G.shard, M.body); float.add(s); shards.push(s); }
  const sprite = (color, size, opacity) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity }));
    s.scale.setScalar(size);
    return s;
  };
  const halo = sprite('#7a5cff', 3.4, 0.45); halo.position.set(0, 1.9, 0.25); float.add(halo);
  const aura = sprite('#9ff0ff', 1.15, 0.6); aura.position.set(0, 2.0, -0.08); float.add(aura);
  const orbGlow = sprite('#ffffff', 0.7, 0.7); float.add(orbGlow);
  const glyph = new THREE.Mesh(G.glyph, M.body);
  glyph.position.y = 0.04;
  root.add(glyph);
  const pool = sprite('#5fe1ff', 2.6, 0.3); pool.position.y = 0.15; pool.scale.set(2.8, 0.9, 1); root.add(pool);
  let t = Math.random() * 10;
  let pulse = 0;
  return {
    root, headHeight: 2.95, socket: orb, castShadow: [body],
    animate(actor, dt) {
      t += dt;
      const st = actor.state;
      const talk = st.talkK || 0;
      const shot = st.shot ? env(st.shotT, st.shotDur, 0.25, 0.6) : 0;
      pulse = Math.max(0, pulse - dt * 1.5);
      if (st.hurtK > 0.5) pulse = 1;
      const energy = 0.4 + 0.6 * talk + 1.2 * shot;
      float.position.y = 0.38 + Math.sin(t * 1.3) * 0.08 - st.moveK * 0.05;
      float.rotation.y = Math.sin(t * 0.3) * 0.06;
      float.rotation.x = st.moveK * 0.12;
      visage.rotation.y = Math.sin(t * 0.7) * 0.22 * (1 - talk);
      visage.rotation.x = Math.sin(t * 0.5) * 0.08;
      visage.scale.setScalar(1 + 0.04 * Math.sin(t * (3 + 6 * talk)) + shot * 0.12);
      // Hands cradle the thought orb; they rise and open when consulted.
      const orbY = 1.32 + 0.12 * talk + 0.45 * shot + 0.03 * Math.sin(t * 2);
      for (let i = 0; i < 2; i++) {
        const sx = i ? 1 : -1;
        const open = 0.18 + 0.12 * talk + 0.25 * shot;
        hands[i].position.set(sx * (0.2 + open), orbY - 0.08 + 0.04 * Math.sin(t * 1.7 + i * 2), -0.42 - 0.06 * talk);
        hands[i].rotation.set(-0.3 - 0.2 * shot, 0, sx * (0.9 - 0.4 * shot) + 0.05 * Math.sin(t * 1.3 + i));
      }
      orb.position.set(0, orbY, -0.45);
      orb.rotation.set(t * 1.4, t * 2.1, 0);
      orb.scale.setScalar(0.9 + 0.15 * Math.sin(t * 4) + 0.6 * shot + 0.2 * talk);
      orbGlow.position.copy(orb.position);
      orbGlow.material.opacity = 0.45 + 0.3 * energy;
      orbGlow.scale.setScalar(0.6 + 0.5 * shot + 0.2 * talk);
      rings[0].position.set(0, 2.0, 0); rings[1].position.set(0, 2.0, 0);
      rings[0].rotation.set(1.25 + Math.sin(t * 0.4) * 0.15, t * (0.5 + energy), 0.25);
      rings[1].rotation.set(-0.95 + Math.cos(t * 0.5) * 0.2, -t * (0.8 + energy * 1.4), -0.35);
      for (let i = 0; i < shards.length; i++) {
        const a = t * (0.5 + energy) + (i / shards.length) * TAU;
        const r = 1.05 + 0.12 * Math.sin(t * 1.7 + i * 2.1);
        shards[i].position.set(Math.cos(a) * r, 0.9 + 1.2 * ((i % 4) / 3) + 0.1 * Math.sin(t * 2 + i), Math.sin(a) * r);
        shards[i].rotation.set(t * 1.1 + i, t * 0.8, 0.5);
      }
      halo.material.opacity = 0.3 + 0.1 * Math.sin(t * 2) + 0.15 * energy + pulse * 0.3;
      halo.scale.setScalar(3.1 + energy * 0.5);
      aura.material.opacity = 0.5 + 0.25 * talk + 0.3 * shot;
      glyph.rotation.y = t * 0.12;
      glyph.scale.setScalar(1 + 0.03 * Math.sin(t * 1.5) + 0.1 * shot);
      pool.material.opacity = 0.18 + 0.08 * Math.sin(t * 1.5) + 0.12 * energy;
      const dead = st.dead ? smooth01(0, 1, st.deadT) : 0;
      float.scale.setScalar(1 - dead * 0.95);
    },
  };
}
