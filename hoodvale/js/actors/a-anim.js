// Procedural humanoid animation: locomotion (idle / walk / run / ready), weapon holds, every
// attack, skilling loop, emote and the death fall. A pose is a Float32Array: per bone (x, y, z)
// Euler rotations, then the hips offset (x, y, z), then hips scale delta (x, y, z).
// Conventions (model faces -z, +x is the character's right): thigh/shoulder +x swings forward,
// knee -x bends, elbow +x bends, spine -x leans forward, head +x looks up / +y turns left, right
// arm +z raises sideways (left arm -z), right arm -z swings across the body.
// Owner: actors builder.

import { HB, HB_COUNT } from './a-humanoid.js';
import { TAU, pos, clamp, smooth01, lerp, env } from './a-core.js';

const B = HB;
export const OFF = HB_COUNT * 3;
export const POSE_LEN = OFF + 6;

function S(P, b, x, y, z) { const k = b * 3; P[k] = x; P[k + 1] = y; P[k + 2] = z; }
function A(P, b, x, y, z) { const k = b * 3; P[k] += x; P[k + 1] += y; P[k + 2] += z; }
function off(P, x, y, z) { P[OFF] = x; P[OFF + 1] = y; P[OFF + 2] = z; }
export function flatFeet(P, k = 1) {
  P[B.ftL * 3] = -(P[B.hips * 3] + P[B.thL * 3] + P[B.knL * 3]) * k;
  P[B.ftR * 3] = -(P[B.hips * 3] + P[B.thR * 3] + P[B.knR * 3]) * k;
}
function hunch(P, h) {
  if (h <= 0) return;
  A(P, B.spine, -0.2 * h, 0, 0); A(P, B.chest, -0.14 * h, 0, 0);
  A(P, B.neck, 0.16 * h, 0, 0); A(P, B.head, 0.14 * h, 0, 0);
  A(P, B.thL, 0.09 * h, 0, 0); A(P, B.thR, 0.09 * h, 0, 0);
  A(P, B.knL, -0.14 * h, 0, 0); A(P, B.knR, -0.14 * h, 0, 0);
  A(P, B.shL, 0.12 * h, 0, 0); A(P, B.shR, 0.12 * h, 0, 0);
  A(P, B.elL, 0.25 * h, 0, 0); A(P, B.elR, 0.25 * h, 0, 0);
  P[OFF + 1] -= 0.035 * h;
}

// ---------------------------------------------------------------------------------------------
// Locomotion
// ---------------------------------------------------------------------------------------------
export function poseIdle(P, c) {
  P.fill(0);
  const br = Math.sin(c.t * (c.old ? 1.25 : 1.65));
  const sway = Math.sin(c.t * 0.45 + c.seed);
  off(P, sway * 0.012, -0.004 + br * 0.003, 0);
  S(P, B.hips, 0, 0, sway * 0.022);
  S(P, B.spine, 0.012 * br - 0.02, 0, -sway * 0.015);
  S(P, B.chest, -0.022 * br, 0, 0);
  S(P, B.shL, 0.03, 0, -0.1 - 0.015 * br - 0.04 * c.wide);
  S(P, B.elL, 0.18, 0, 0);
  S(P, B.haL, 0.06, 0, 0);
  S(P, B.shR, 0.03, 0, 0.1 + 0.015 * br + 0.04 * c.wide);
  S(P, B.elR, 0.18, 0, 0);
  S(P, B.haR, 0.06, 0, 0);
  S(P, B.thL, 0.0, 0, -0.04 - sway * 0.02);
  S(P, B.thR, 0.0, 0, 0.04 - sway * 0.02);
  S(P, B.knL, -0.05 - pos(sway) * 0.06, 0, 0);
  S(P, B.knR, -0.05 - pos(-sway) * 0.06, 0, 0);
  flatFeet(P);
  P[B.ftL * 3 + 2] = 0.04; P[B.ftR * 3 + 2] = -0.04;
  hunch(P, c.hunch);
}

export function poseWalk(P, c) {
  P.fill(0);
  const w = c.ph * TAU;
  const s = Math.sin(w), co = Math.cos(w);
  const amp = 0.44 * (c.old ? 0.7 : 1) * c.stride;
  P[B.thR * 3] = amp * s + 0.04;
  P[B.thL * 3] = -amp * s + 0.04;
  P[B.thL * 3 + 2] = -0.03; P[B.thR * 3 + 2] = 0.03;
  P[B.knR * 3] = -(0.1 + 0.9 * Math.pow(pos(Math.cos(w + 0.7)), 1.6));
  P[B.knL * 3] = -(0.1 + 0.9 * Math.pow(pos(Math.cos(w + Math.PI + 0.7)), 1.6));
  flatFeet(P, 0.85);
  P[B.ftR * 3] += 0.22 * Math.pow(pos(s), 3) - 0.35 * Math.pow(pos(-s), 3);
  P[B.ftL * 3] += 0.22 * Math.pow(pos(-s), 3) - 0.35 * Math.pow(pos(s), 3);
  off(P, 0, 0.032 * Math.cos(2 * w) - 0.016, 0);
  S(P, B.hips, 0, 0.11 * s, -0.035 * co);
  S(P, B.spine, -0.05, 0, 0.02 * co);
  S(P, B.chest, 0, -0.14 * s, 0);
  S(P, B.head, 0.02 * Math.cos(2 * w), 0.06 * s, 0);
  const arm = 0.42 * c.armSwing;
  S(P, B.shL, arm * s, 0, -0.1 - 0.04 * c.wide);
  S(P, B.shR, -arm * s, 0, 0.1 + 0.04 * c.wide);
  S(P, B.elL, 0.3 + 0.25 * pos(s), 0, 0);
  S(P, B.elR, 0.3 + 0.25 * pos(-s), 0, 0);
  S(P, B.haL, 0.1, 0, 0); S(P, B.haR, 0.1, 0, 0);
  hunch(P, c.hunch);
}

export function poseRun(P, c) {
  P.fill(0);
  const w = c.ph * TAU;
  const s = Math.sin(w);
  const amp = 0.8 * c.stride;
  P[B.thR * 3] = amp * s + 0.2;
  P[B.thL * 3] = -amp * s + 0.2;
  P[B.knR * 3] = -(0.3 + 1.5 * Math.pow(pos(Math.cos(w + 0.55)), 1.4));
  P[B.knL * 3] = -(0.3 + 1.5 * Math.pow(pos(Math.cos(w + Math.PI + 0.55)), 1.4));
  flatFeet(P, 0.7);
  P[B.ftR * 3] += 0.15 * pos(s) - 0.5 * Math.pow(pos(-s), 2);
  P[B.ftL * 3] += 0.15 * pos(-s) - 0.5 * Math.pow(pos(s), 2);
  off(P, 0, 0.055 * Math.cos(2 * w - 0.8) - 0.05, 0);
  S(P, B.hips, 0, 0.16 * s, 0);
  S(P, B.spine, -0.22, 0, 0);
  S(P, B.chest, -0.04, -0.24 * s, 0);
  S(P, B.neck, 0.1, 0, 0);
  S(P, B.head, 0.12, 0.06 * s, 0);
  const arm = 0.85 * c.armSwing;
  S(P, B.shL, arm * s + 0.12, 0, -0.14 - 0.05 * c.wide);
  S(P, B.shR, -arm * s + 0.12, 0, 0.14 + 0.05 * c.wide);
  S(P, B.elL, 1.35 + 0.25 * s, 0, 0);
  S(P, B.elR, 1.35 - 0.25 * s, 0, 0);
  S(P, B.haL, 0.2, 0, 0); S(P, B.haR, 0.2, 0, 0);
  hunch(P, c.hunch * 0.6);
}

// Combat-ready stance (after an attack, or play('ready')).
export function poseReady(P, c) {
  poseIdle(P, c);
  const br = Math.sin(c.t * 2.2);
  off(P, 0, -0.05 + br * 0.004, 0);
  S(P, B.thL, 0.25, 0, -0.1); S(P, B.knL, -0.35, 0, 0);
  S(P, B.thR, -0.12, 0, 0.12); S(P, B.knR, -0.25, 0, 0);
  flatFeet(P);
  S(P, B.spine, -0.08, 0.15, 0);
  S(P, B.chest, -0.04, 0.1, 0);
  S(P, B.head, 0.05, -0.22, 0);
  S(P, B.shL, 0.5, 0, -0.2); S(P, B.elL, 1.3, 0, 0);
  S(P, B.shR, 0.45, 0, 0.25); S(P, B.elR, 1.25, 0, 0);
  hunch(P, c.hunch * 0.5);
}

// Weapon holds: adjust the arms of a base pose for what is in the hands (k = 1 standing,
// smaller when the arms are swinging in a walk/run).
export function applyHold(P, c, k = 1, moving = 0) {
  const h = c.hold;
  const sw = (b, x, y, z, w) => { const i = b * 3; P[i] += (x - P[i]) * w; P[i + 1] += (y - P[i + 1]) * w; P[i + 2] += (z - P[i + 2]) * w; };
  const w = k;
  const mv = moving;
  if (h === '1h') {
    // Blade forward and a little down.
    sw(B.elR, 0.55 + mv * 0.3, 0, 0, w * 0.8);
    sw(B.haR, -0.95, 0, 0, w);
  } else if (h === '2h') {
    // Greatsword resting on the right shoulder.
    sw(B.shR, 0.5, 0, 0.18, w);
    sw(B.elR, 1.95, 0, 0, w);
    sw(B.haR, 0.25, 0, 0, w);
  } else if (h === 'staff' || h === 'walkstaff') {
    // Upright staff in the right hand (planted when walking slowly).
    sw(B.shR, 0.18 + (h === 'walkstaff' ? 0.12 : 0), 0, 0.2, w);
    sw(B.elR, 1.4 - (h === 'walkstaff' ? 0.1 : 0), 0, 0, w);
    sw(B.haR, 0.08, 0, 0.0, w);
  } else if (h === 'bow') {
    // Bow upright in the left hand, forearm forward.
    sw(B.shL, 0.12, 0, -0.18, w);
    sw(B.elL, 1.45, 0, 0, w);
    sw(B.haL, 0.05, 0, 0, w);
  } else if (h === 'tool') {
    sw(B.elR, 0.45, 0, 0, w * 0.7);
    sw(B.haR, -0.35, 0, 0, w);
  }
  if (c.shield) {
    sw(B.shL, 0.22, 0, -0.22, w);
    sw(B.elL, 0.95, 0, 0, w);
    sw(B.haL, 0.1, 0, 0, w);
  }
}

// ---------------------------------------------------------------------------------------------
// Keyframed animations. A key: { t, e: 'io'|'i'|'o'|'l', <bone>: [x, y, z], off: [x, y, z] }.
// Channels listed in any key override the base pose (missing channels in a key carry over).
// ---------------------------------------------------------------------------------------------
const NAMES = Object.keys(HB);
function compile(keys) {
  const chans = [];
  const seen = new Set();
  for (const k of keys) for (const n of Object.keys(k)) {
    if (n === 't' || n === 'e' || seen.has(n)) continue;
    seen.add(n);
    chans.push(n);
  }
  const idx = chans.map((n) => (n === 'off' ? OFF : HB[n] * 3));
  const vals = keys.map(() => new Float32Array(chans.length * 3));
  for (let j = 0; j < chans.length; j++) {
    const n = chans[j];
    let first = keys.find((k) => k[n]);
    let prev = first[n];
    for (let i = 0; i < keys.length; i++) {
      const v = keys[i][n] || prev;
      prev = v;
      vals[i][j * 3] = v[0] || 0; vals[i][j * 3 + 1] = v[1] || 0; vals[i][j * 3 + 2] = v[2] || 0;
    }
  }
  return { chans, idx, vals, times: keys.map((k) => k.t), eases: keys.map((k) => k.e || 'io'), feet: !chans.includes('ftL') };
}
const EASE = {
  io: (u) => u * u * (3 - 2 * u),
  i: (u) => u * u * u,
  o: (u) => 1 - (1 - u) ** 3,
  l: (u) => u,
};
// Evaluate into O (only the channels of K); returns K.
const _tmp = new Float32Array(256);
function evalKeys(K, t, dur, loop, O) {
  const T = K.times, n = T.length;
  let i = 0;
  if (loop) t = ((t % dur) + dur) % dur;
  else t = clamp(t, 0, T[n - 1]);
  while (i < n - 1 && t >= T[i + 1]) i++;
  let a = K.vals[i], b, u;
  if (i === n - 1) {
    if (loop) { b = K.vals[0]; const span = dur - T[i]; u = span > 1e-4 ? (t - T[i]) / span : 1; }
    else { b = a; u = 0; }
  } else { b = K.vals[i + 1]; u = (t - T[i]) / Math.max(1e-4, T[i + 1] - T[i]); }
  const e = EASE[K.eases[(i + 1) % n]] || EASE.io;
  u = e(clamp(u, 0, 1));
  const L = K.chans.length * 3;
  for (let j = 0; j < L; j++) _tmp[j] = a[j] + (b[j] - a[j]) * u;
  for (let j = 0; j < K.chans.length; j++) {
    const k = K.idx[j];
    O[k] = _tmp[j * 3]; O[k + 1] = _tmp[j * 3 + 1]; O[k + 2] = _tmp[j * 3 + 2];
  }
  return K;
}

// Blend the channels of K from O into P with weight w (mask: optional per-bone 0/1).
export function blendKeyed(P, O, K, w, mask = null) {
  if (w <= 0.0001) return;
  for (let j = 0; j < K.chans.length; j++) {
    const k = K.idx[j];
    if (mask && k < OFF && !mask[k / 3]) continue;
    if (mask && k === OFF) continue;
    P[k] += (O[k] - P[k]) * w; P[k + 1] += (O[k + 1] - P[k + 1]) * w; P[k + 2] += (O[k + 2] - P[k + 2]) * w;
  }
}

const k = (t, o, e) => ({ t, ...o, ...(e ? { e } : {}) });
// Shorthands for common leg stances.
const LUNGE_L = { thL: [0.42, 0, -0.08], knL: [-0.5, 0, 0], thR: [-0.28, 0, 0.1], knR: [-0.18, 0, 0] };
const STANCE = { thL: [0.12, 0, -0.08], knL: [-0.18, 0, 0], thR: [-0.08, 0, 0.1], knR: [-0.12, 0, 0] };
const CROUCH = { thL: [0.95, 0, -0.18], knL: [-1.7, 0, 0], thR: [0.6, 0, 0.18], knR: [-1.5, 0, 0], off: [0, -0.34, 0.06] };
const KNEEL = { thL: [1.35, 0, -0.1], knL: [-1.45, 0, 0], thR: [-0.15, 0, 0.12], knR: [-1.9, 0, 0], ftR: [0.55, 0, 0], ftL: [0.1, 0, 0], off: [0, -0.42, 0.12] };

// name -> { keys, dur, loop, upper (only upper body while moving), cancelOnMove, tools: {R, L},
//            hideWeapon, release (s), draw (bow), impact (s) }
const DEF = {};
function def(name, d) { DEF[name] = { loop: false, upper: false, cancelOnMove: false, ...d, K: compile(d.keys) }; }

// ---- Melee ----
def('slash', {
  dur: 0.78, upper: true, impact: 0.36, keys: [
    k(0, { chest: [0, 0, 0], spine: [0, 0, 0], shR: [0.3, 0, 0.15], elR: [0.6, 0, 0], haR: [-0.5, 0, 0], shL: [0.2, 0, -0.15], elL: [0.4, 0, 0], head: [0, 0, 0], ...STANCE, off: [0, -0.02, 0] }),
    k(0.24, { chest: [0.1, -0.4, 0], spine: [0.05, -0.2, 0], shR: [2.7, 0, 0.5], elR: [1.1, 0, 0], haR: [0.35, 0, 0], shL: [0.75, 0, -0.35], elL: [0.7, 0, 0], head: [0, 0.45, 0], thL: [0.25, 0, -0.08], knL: [-0.3, 0, 0], thR: [-0.12, 0, 0.1], knR: [-0.2, 0, 0], off: [0, -0.03, 0.02] }, 'o'),
    k(0.38, { chest: [-0.14, 0.42, 0], spine: [-0.12, 0.16, 0], shR: [0.95, 0, -0.55], elR: [0.2, 0, 0], haR: [-0.5, 0, 0], shL: [0.2, 0, -0.45], elL: [0.9, 0, 0], head: [-0.05, -0.4, 0], ...LUNGE_L, off: [0, -0.07, -0.05] }, 'i'),
    k(0.52, { chest: [-0.12, 0.5, 0], spine: [-0.1, 0.2, 0], shR: [0.5, 0, -0.7], elR: [0.35, 0, 0], haR: [-0.6, 0, 0], head: [-0.05, -0.45, 0] }, 'o'),
    k(0.78, { chest: [0, 0, 0], spine: [0, 0, 0], shR: [0.3, 0, 0.15], elR: [0.6, 0, 0], haR: [-0.5, 0, 0], shL: [0.2, 0, -0.15], elL: [0.4, 0, 0], head: [0, 0, 0], ...STANCE, off: [0, -0.02, 0] }),
  ],
});
def('slash2', {
  dur: 0.72, upper: true, impact: 0.34, keys: [
    k(0, { chest: [0, 0, 0], shR: [0.3, 0, 0.15], elR: [0.6, 0, 0], haR: [-0.5, 0, 0], head: [0, 0, 0], ...STANCE }),
    k(0.22, { chest: [0, 0.5, 0], spine: [0, 0.2, 0], shR: [1.2, 0, -0.9], elR: [1.4, 0, 0], haR: [0.2, 0, 0], head: [0, -0.4, 0], thL: [0.2, 0, -0.08], knL: [-0.3, 0, 0] }, 'o'),
    k(0.36, { chest: [-0.1, -0.45, 0], spine: [-0.1, -0.2, 0], shR: [1.3, 0, 0.8], elR: [0.15, 0, 0], haR: [-0.9, 0, 0], head: [0, 0.35, 0], ...LUNGE_L, off: [0, -0.06, -0.04] }, 'i'),
    k(0.5, { chest: [-0.08, -0.55, 0], shR: [0.9, 0, 1.0], elR: [0.3, 0, 0], head: [0, 0.4, 0] }, 'o'),
    k(0.72, { chest: [0, 0, 0], spine: [0, 0, 0], shR: [0.3, 0, 0.15], elR: [0.6, 0, 0], haR: [-0.5, 0, 0], head: [0, 0, 0], ...STANCE, off: [0, 0, 0] }),
  ],
});
def('stab', {
  dur: 0.62, upper: true, impact: 0.3, keys: [
    k(0, { chest: [0, 0, 0], spine: [0, 0, 0], shR: [0.3, 0, 0.15], elR: [0.6, 0, 0], haR: [-0.5, 0, 0], shL: [0.2, 0, -0.15], elL: [0.5, 0, 0], ...STANCE, off: [0, -0.02, 0] }),
    k(0.2, { chest: [0.05, -0.35, 0], spine: [0, -0.15, 0], shR: [-0.35, 0, 0.3], elR: [1.75, 0, 0], haR: [-1.2, 0, 0], shL: [0.8, 0, -0.2], elL: [0.8, 0, 0], thL: [0.3, 0, -0.08], knL: [-0.35, 0, 0], off: [0, -0.04, 0.03] }, 'o'),
    k(0.32, { chest: [-0.15, 0.3, 0], spine: [-0.12, 0.15, 0], shR: [1.45, 0, 0.0], elR: [0.05, 0, 0], haR: [-1.35, 0, 0], shL: [0.1, 0, -0.35], elL: [0.4, 0, 0], ...LUNGE_L, off: [0, -0.08, -0.08] }, 'i'),
    k(0.42, { chest: [-0.12, 0.28, 0], shR: [1.35, 0, 0.0], elR: [0.15, 0, 0] }),
    k(0.62, { chest: [0, 0, 0], spine: [0, 0, 0], shR: [0.3, 0, 0.15], elR: [0.6, 0, 0], haR: [-0.5, 0, 0], shL: [0.2, 0, -0.15], elL: [0.5, 0, 0], ...STANCE, off: [0, -0.02, 0] }),
  ],
});
def('crush', {
  dur: 0.85, upper: true, impact: 0.44, keys: [
    k(0, { chest: [0, 0, 0], spine: [0, 0, 0], shR: [0.3, 0, 0.15], elR: [0.6, 0, 0], haR: [-0.4, 0, 0], shL: [0.2, 0, -0.15], elL: [0.4, 0, 0], head: [0, 0, 0], ...STANCE, off: [0, -0.02, 0] }),
    k(0.3, { chest: [0.2, -0.15, 0], spine: [0.12, 0, 0], shR: [2.95, 0, 0.15], elR: [1.25, 0, 0], haR: [0.45, 0, 0], shL: [0.9, 0, -0.3], elL: [0.4, 0, 0], head: [0.1, 0.1, 0], thL: [0.2, 0, -0.08], knL: [-0.2, 0, 0], off: [0, 0.0, 0.03] }, 'o'),
    k(0.45, { chest: [-0.35, 0.1, 0], spine: [-0.25, 0, 0], shR: [0.75, 0, -0.1], elR: [0.15, 0, 0], haR: [-0.7, 0, 0], shL: [0.2, 0, -0.4], elL: [0.6, 0, 0], head: [-0.1, 0, 0], ...LUNGE_L, off: [0, -0.12, -0.06] }, 'i'),
    k(0.58, { chest: [-0.3, 0.1, 0], spine: [-0.22, 0, 0], shR: [0.6, 0, -0.1], elR: [0.2, 0, 0] }),
    k(0.85, { chest: [0, 0, 0], spine: [0, 0, 0], shR: [0.3, 0, 0.15], elR: [0.6, 0, 0], haR: [-0.4, 0, 0], shL: [0.2, 0, -0.15], elL: [0.4, 0, 0], head: [0, 0, 0], ...STANCE, off: [0, -0.02, 0] }),
  ],
});
def('swing2h', {
  dur: 1.05, upper: true, impact: 0.55, keys: [
    k(0, { chest: [0, 0, 0], spine: [0, 0, 0], shR: [0.5, 0, 0.18], elR: [1.95, 0, 0], haR: [0.25, 0, 0], shL: [0.4, 0, 0.2], elL: [1.2, 0, 0], head: [0, 0, 0], ...STANCE, off: [0, -0.03, 0] }),
    k(0.36, { chest: [0.18, -0.55, 0], spine: [0.1, -0.3, 0], shR: [2.75, 0, 0.35], elR: [1.3, 0, 0], haR: [0.5, 0, 0], shL: [2.5, 0, 0.55], elL: [1.3, 0, 0], head: [0.05, 0.55, 0], thL: [0.25, 0, -0.1], knL: [-0.25, 0, 0], thR: [-0.1, 0, 0.12], knR: [-0.25, 0, 0], off: [0, -0.02, 0.04] }, 'o'),
    k(0.56, { chest: [-0.35, 0.5, 0], spine: [-0.25, 0.25, 0], shR: [0.9, 0, -0.45], elR: [0.2, 0, 0], haR: [-0.7, 0, 0], shL: [0.95, 0, 0.15], elL: [0.5, 0, 0], head: [-0.1, -0.5, 0], thL: [0.55, 0, -0.12], knL: [-0.75, 0, 0], thR: [-0.35, 0, 0.12], knR: [-0.2, 0, 0], off: [0, -0.14, -0.1] }, 'i'),
    k(0.72, { chest: [-0.3, 0.6, 0], spine: [-0.22, 0.3, 0], shR: [0.5, 0, -0.6], elR: [0.4, 0, 0], shL: [0.5, 0, 0.0], elL: [0.7, 0, 0] }, 'o'),
    k(1.05, { chest: [0, 0, 0], spine: [0, 0, 0], shR: [0.5, 0, 0.18], elR: [1.95, 0, 0], haR: [0.25, 0, 0], shL: [0.4, 0, 0.2], elL: [1.2, 0, 0], head: [0, 0, 0], ...STANCE, off: [0, -0.03, 0] }),
  ],
});
def('punch', {
  dur: 0.55, upper: true, impact: 0.26, keys: [
    k(0, { chest: [0, 0, 0], shR: [0.45, 0, 0.25], elR: [1.6, 0, 0], shL: [0.5, 0, -0.2], elL: [1.5, 0, 0], head: [0, 0, 0], ...STANCE, off: [0, -0.04, 0] }),
    k(0.14, { chest: [0, -0.35, 0], spine: [0, -0.1, 0], shR: [0.2, 0, 0.35], elR: [2.1, 0, 0], shL: [0.6, 0, -0.1], elL: [1.7, 0, 0], head: [0, 0.3, 0] }, 'o'),
    k(0.26, { chest: [-0.1, 0.4, 0], spine: [-0.08, 0.15, 0], shR: [1.5, 0, -0.12], elR: [0.08, 0, 0], shL: [0.45, 0, -0.25], elL: [1.8, 0, 0], head: [0, -0.35, 0], ...LUNGE_L, off: [0, -0.06, -0.06] }, 'i'),
    k(0.55, { chest: [0, 0, 0], spine: [0, 0, 0], shR: [0.45, 0, 0.25], elR: [1.6, 0, 0], shL: [0.5, 0, -0.2], elL: [1.5, 0, 0], head: [0, 0, 0], ...STANCE, off: [0, -0.04, 0] }),
  ],
});
def('punch2', {
  dur: 0.55, upper: true, impact: 0.26, keys: [
    k(0, { chest: [0, 0, 0], shR: [0.45, 0, 0.25], elR: [1.6, 0, 0], shL: [0.5, 0, -0.2], elL: [1.5, 0, 0], head: [0, 0, 0], ...STANCE }),
    k(0.14, { chest: [0, 0.35, 0], shL: [0.2, 0, -0.35], elL: [2.1, 0, 0], head: [0, -0.3, 0] }, 'o'),
    k(0.26, { chest: [-0.1, -0.4, 0], spine: [-0.08, -0.15, 0], shL: [1.5, 0, 0.12], elL: [0.08, 0, 0], head: [0, 0.35, 0], ...LUNGE_L, off: [0, -0.06, -0.06] }, 'i'),
    k(0.55, { chest: [0, 0, 0], spine: [0, 0, 0], shR: [0.45, 0, 0.25], elR: [1.6, 0, 0], shL: [0.5, 0, -0.2], elL: [1.5, 0, 0], head: [0, 0, 0], ...STANCE, off: [0, 0, 0] }),
  ],
});
def('kick', {
  dur: 0.7, impact: 0.32, keys: [
    k(0, { chest: [0, 0, 0], thR: [0, 0, 0.05], knR: [-0.1, 0, 0], ftR: [0, 0, 0], shL: [0.3, 0, -0.3], elL: [1.2, 0, 0], shR: [0.3, 0, 0.3], elR: [1.2, 0, 0], off: [0, -0.02, 0] }),
    k(0.18, { chest: [0.1, 0, 0], thR: [1.2, 0, 0.05], knR: [-1.7, 0, 0], ftR: [0.3, 0, 0], thL: [0, 0, -0.05], knL: [-0.25, 0, 0], off: [0, -0.04, 0.02] }, 'o'),
    k(0.32, { chest: [0.25, 0, 0], spine: [0.15, 0, 0], thR: [1.45, 0, 0.05], knR: [-0.1, 0, 0], ftR: [-0.4, 0, 0], off: [0, -0.03, 0.06] }, 'i'),
    k(0.46, { thR: [1.1, 0, 0.05], knR: [-1.4, 0, 0] }),
    k(0.7, { chest: [0, 0, 0], spine: [0, 0, 0], thR: [0, 0, 0.05], knR: [-0.1, 0, 0], ftR: [0, 0, 0], thL: [0, 0, -0.05], knL: [-0.1, 0, 0], off: [0, -0.02, 0] }),
  ],
});
def('block', {
  dur: 0.6, upper: true, keys: [
    k(0, { shL: [0.22, 0, -0.22], elL: [0.95, 0, 0], haL: [0.1, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], off: [0, 0, 0] }),
    k(0.12, { shL: [1.25, 0.3, 0.35], elL: [1.25, 0, 0], haL: [0, 0, 0], chest: [-0.1, -0.2, 0], head: [-0.15, 0.1, 0], off: [0, -0.08, 0.05], ...STANCE }, 'o'),
    k(0.4, { shL: [1.2, 0.3, 0.35], elL: [1.3, 0, 0] }),
    k(0.6, { shL: [0.22, 0, -0.22], elL: [0.95, 0, 0], haL: [0.1, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], off: [0, 0, 0] }),
  ],
});
def('guard', {
  dur: 1.2, loop: true, keys: [
    k(0, { shL: [1.2, 0.3, 0.35], elL: [1.3, 0, 0], chest: [-0.1, -0.2, 0], head: [-0.1, 0.1, 0], off: [0, -0.08, 0.04], ...STANCE }),
    k(0.6, { shL: [1.25, 0.3, 0.33], elL: [1.25, 0, 0], off: [0, -0.09, 0.04] }),
  ],
});

// ---- Ranged & magic ----
def('shoot', {
  dur: 1.15, upper: true, release: 0.62, draw: true, keys: [
    k(0, { chest: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0], shL: [0.12, 0, -0.18], elL: [1.45, 0, 0], haL: [0.05, 0, 0], shR: [0.03, 0, 0.1], elR: [0.2, 0, 0], haR: [0, 0, 0], ...STANCE, off: [0, -0.02, 0] }),
    k(0.22, { chest: [0, -0.35, 0], spine: [0, -0.2, 0], head: [0, 0.5, 0], shL: [1.5, 0, 0.32], elL: [0.06, 0, 0], haL: [0.0, 0, 0], shR: [1.45, 0, -0.18], elR: [0.6, 0, 0], haR: [0, 0, 0], thL: [0.2, 0, -0.14], knL: [-0.15, 0, 0], thR: [-0.1, 0, 0.16], knR: [-0.1, 0, 0] }, 'o'),
    k(0.58, { chest: [0, -0.42, 0], spine: [0, -0.2, 0], head: [0.02, 0.58, 0], shL: [1.52, 0, 0.36], elL: [0.04, 0, 0], shR: [1.25, 0, 0.55], elR: [2.25, 0, 0], haR: [0.2, 0, 0] }, 'io'),
    k(0.66, { shR: [1.05, 0, 0.85], elR: [1.6, 0, 0], haR: [0.4, 0, 0] }, 'o'),
    k(0.85, { chest: [0, -0.3, 0], shL: [1.3, 0, 0.25], elL: [0.2, 0, 0], shR: [0.6, 0, 0.4], elR: [0.6, 0, 0] }),
    k(1.15, { chest: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0], shL: [0.12, 0, -0.18], elL: [1.45, 0, 0], haL: [0.05, 0, 0], shR: [0.03, 0, 0.1], elR: [0.2, 0, 0], haR: [0, 0, 0], ...STANCE, off: [0, -0.02, 0] }),
  ],
});
def('cast', {
  dur: 1.0, upper: true, release: 0.48, keys: [
    k(0, { chest: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0], shR: [0.18, 0, 0.2], elR: [1.4, 0, 0], haR: [0.08, 0, 0], shL: [0.03, 0, -0.1], elL: [0.2, 0, 0], haL: [0, 0, 0], ...STANCE, off: [0, -0.02, 0] }),
    k(0.3, { chest: [0.18, 0.2, 0], spine: [0.1, 0.1, 0], head: [0.15, 0, 0], shR: [2.2, 0, 0.35], elR: [0.9, 0, 0], haR: [0.2, 0, 0], shL: [0.9, 0, -0.55], elL: [1.2, 0, 0], haL: [-0.4, 0, 0], off: [0, 0.02, 0.03] }, 'o'),
    k(0.48, { chest: [-0.18, -0.1, 0], spine: [-0.12, 0, 0], head: [-0.05, 0, 0], shR: [1.45, 0, 0.1], elR: [0.25, 0, 0], haR: [-0.2, 0, 0], shL: [1.5, 0, -0.1], elL: [0.15, 0, 0], haL: [-1.2, 0, 0], ...LUNGE_L, off: [0, -0.07, -0.06] }, 'i'),
    k(0.66, { shL: [1.35, 0, -0.1], elL: [0.25, 0, 0] }),
    k(1.0, { chest: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0], shR: [0.18, 0, 0.2], elR: [1.4, 0, 0], haR: [0.08, 0, 0], shL: [0.03, 0, -0.1], elL: [0.2, 0, 0], haL: [0, 0, 0], ...STANCE, off: [0, -0.02, 0] }),
  ],
});
def('teleport', {
  dur: 2.0, cancelOnMove: true, keys: [
    k(0, { shL: [0.03, 0, -0.1], shR: [0.03, 0, 0.1], elL: [0.2, 0, 0], elR: [0.2, 0, 0], head: [0, 0, 0], chest: [0, 0, 0], off: [0, 0, 0] }),
    k(0.5, { shL: [0.4, 0, -2.6], shR: [0.4, 0, 2.6], elL: [0.3, 0, 0], elR: [0.3, 0, 0], head: [0.5, 0, 0], chest: [0.15, 0, 0], off: [0, 0.05, 0] }, 'o'),
    k(1.4, { shL: [0.3, 0, -2.8], shR: [0.3, 0, 2.8], head: [0.6, 0, 0], off: [0, 0.12, 0] }),
    k(2.0, { shL: [0.03, 0, -0.1], shR: [0.03, 0, 0.1], elL: [0.2, 0, 0], elR: [0.2, 0, 0], head: [0, 0, 0], chest: [0, 0, 0], off: [0, 0, 0] }),
  ],
});

// ---- Everyday one-shots ----
def('eat', {
  dur: 1.3, upper: true, tools: { R: 'food' }, hideWeapon: true, keys: [
    k(0, { shR: [0.1, 0, 0.1], elR: [0.4, 0, 0], haR: [0, 0, 0], head: [0, 0, 0] }),
    k(0.35, { shR: [0.55, 0, -0.35], elR: [2.35, 0, 0], haR: [0.4, 0, 0], head: [-0.15, 0, 0] }, 'o'),
    k(0.55, { shR: [0.6, 0, -0.35], elR: [2.4, 0, 0], head: [-0.05, 0, 0] }),
    k(0.75, { shR: [0.55, 0, -0.35], elR: [2.3, 0, 0], head: [-0.18, 0, 0] }),
    k(0.95, { shR: [0.6, 0, -0.35], elR: [2.4, 0, 0], head: [-0.05, 0, 0] }),
    k(1.3, { shR: [0.1, 0, 0.1], elR: [0.4, 0, 0], haR: [0, 0, 0], head: [0, 0, 0] }),
  ],
});
def('drink', {
  dur: 1.4, upper: true, tools: { R: 'potion' }, hideWeapon: true, keys: [
    k(0, { shR: [0.1, 0, 0.1], elR: [0.4, 0, 0], haR: [0, 0, 0], head: [0, 0, 0] }),
    k(0.4, { shR: [0.75, 0, -0.3], elR: [2.3, 0, 0], haR: [0.9, 0, 0], head: [0.45, 0, 0] }, 'o'),
    k(1.0, { shR: [0.8, 0, -0.3], elR: [2.25, 0, 0], haR: [1.1, 0, 0], head: [0.5, 0, 0] }),
    k(1.4, { shR: [0.1, 0, 0.1], elR: [0.4, 0, 0], haR: [0, 0, 0], head: [0, 0, 0] }),
  ],
});
def('pickpocket', {
  dur: 1.1, keys: [
    k(0, { spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], shR: [0.03, 0, 0.1], elR: [0.2, 0, 0], thL: [0, 0, -0.04], knL: [-0.05, 0, 0], thR: [0, 0, 0.04], knR: [-0.05, 0, 0], off: [0, 0, 0] }),
    k(0.3, { spine: [-0.35, 0, 0], chest: [-0.15, 0.25, 0], head: [0.3, -0.4, 0], shR: [0.7, 0, -0.3], elR: [0.5, 0, 0], shL: [0.2, 0, -0.3], elL: [0.8, 0, 0], thL: [0.45, 0, -0.08], knL: [-0.7, 0, 0], thR: [0.1, 0, 0.1], knR: [-0.6, 0, 0], off: [0, -0.12, -0.02] }, 'o'),
    k(0.6, { shR: [0.95, 0, -0.35], elR: [0.25, 0, 0], head: [0.3, 0.5, 0] }),
    k(0.8, { shR: [0.5, 0, -0.1], elR: [1.3, 0, 0], head: [0.2, 0, 0] }, 'o'),
    k(1.1, { spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], shR: [0.03, 0, 0.1], elR: [0.2, 0, 0], shL: [0.03, 0, -0.1], elL: [0.2, 0, 0], thL: [0, 0, -0.04], knL: [-0.05, 0, 0], thR: [0, 0, 0.04], knR: [-0.05, 0, 0], off: [0, 0, 0] }),
  ],
});
def('stun', {
  dur: 2.4, cancelOnMove: true, keys: [
    k(0, { head: [0, 0, 0], spine: [0, 0, 0], shL: [0.03, 0, -0.1], shR: [0.03, 0, 0.1], off: [0, 0, 0] }),
    k(0.2, { head: [-0.3, 0.2, 0.25], spine: [0.15, 0, 0.1], shL: [0, 0, -0.25], shR: [0, 0, 0.25], off: [0, -0.05, 0.03] }, 'o'),
    k(0.8, { head: [-0.25, -0.25, -0.2], spine: [0.1, 0, -0.1] }),
    k(1.4, { head: [-0.3, 0.25, 0.22], spine: [0.12, 0, 0.1] }),
    k(2.0, { head: [-0.2, -0.15, -0.1], spine: [0.05, 0, -0.05] }),
    k(2.4, { head: [0, 0, 0], spine: [0, 0, 0], shL: [0.03, 0, -0.1], shR: [0.03, 0, 0.1], off: [0, 0, 0] }),
  ],
});

// ---- Emotes ----
const REST = { shL: [0.03, 0, -0.1], elL: [0.2, 0, 0], haL: [0, 0, 0], shR: [0.03, 0, 0.1], elR: [0.2, 0, 0], haR: [0, 0, 0], head: [0, 0, 0], neck: [0, 0, 0], chest: [0, 0, 0], spine: [0, 0, 0], off: [0, 0, 0] };
function wave(n, t0, period, base, a, b) { const out = []; for (let i = 0; i < n; i++) out.push(k(t0 + i * period, i % 2 ? b : a)); return out; }
def('wave', {
  dur: 2.2, cancelOnMove: true, upper: true, keys: [
    k(0, REST),
    k(0.3, { shR: [0.2, 0, 2.5], elR: [0.4, 0, 0.0], haR: [0, 0, 0.3], head: [0, 0, 0.08] }, 'o'),
    ...wave(6, 0.55, 0.22, { elR: [0.4, 0, 0.5] }, { elR: [0.4, 0, -0.4] }),
    k(1.95, { shR: [0.2, 0, 2.4], elR: [0.4, 0, 0] }),
    k(2.2, REST),
  ],
});
def('cheer', {
  dur: 2.2, cancelOnMove: true, keys: [
    k(0, { ...REST, thL: [0, 0, -0.04], knL: [-0.05, 0, 0], thR: [0, 0, 0.04], knR: [-0.05, 0, 0] }),
    k(0.25, { shL: [0.3, 0, -2.8], shR: [0.3, 0, 2.8], elL: [0.3, 0, 0], elR: [0.3, 0, 0], head: [0.35, 0, 0], off: [0, -0.1, 0], thL: [0.4, 0, -0.04], knL: [-0.7, 0, 0], thR: [0.4, 0, 0.04], knR: [-0.7, 0, 0] }, 'o'),
    k(0.5, { shL: [0.2, 0, -3.0], shR: [0.2, 0, 3.0], off: [0, 0.12, 0], thL: [0, 0, -0.04], knL: [-0.1, 0, 0], thR: [0, 0, 0.04], knR: [-0.1, 0, 0] }, 'o'),
    k(0.75, { off: [0, -0.08, 0], thL: [0.35, 0, -0.04], knL: [-0.6, 0, 0], thR: [0.35, 0, 0.04], knR: [-0.6, 0, 0] }, 'i'),
    k(1.0, { shL: [0.3, 0, -2.7], shR: [0.3, 0, 2.7], off: [0, 0.1, 0], thL: [0, 0, -0.04], knL: [-0.1, 0, 0], thR: [0, 0, 0.04], knR: [-0.1, 0, 0] }, 'o'),
    k(1.25, { off: [0, -0.06, 0], thL: [0.3, 0, -0.04], knL: [-0.5, 0, 0], thR: [0.3, 0, 0.04], knR: [-0.5, 0, 0] }, 'i'),
    k(1.6, { shL: [0.3, 0, -2.6], shR: [0.3, 0, 2.6], off: [0, 0, 0], thL: [0, 0, -0.04], knL: [-0.05, 0, 0], thR: [0, 0, 0.04], knR: [-0.05, 0, 0] }),
    k(2.2, { ...REST, thL: [0, 0, -0.04], knL: [-0.05, 0, 0], thR: [0, 0, 0.04], knR: [-0.05, 0, 0] }),
  ],
});
def('bow', {
  dur: 2.2, cancelOnMove: true, keys: [
    k(0, { ...REST, thL: [0, 0, -0.04], thR: [0, 0, 0.04] }),
    k(0.5, { spine: [-0.55, 0, 0], chest: [-0.35, 0, 0], head: [-0.2, 0, 0], shR: [0.9, 0, -0.75], elR: [1.7, 0, 0], shL: [-0.5, 0, -0.1], elL: [0.9, 0, 0], thL: [0.25, 0, -0.04], thR: [0.25, 0, 0.04], off: [0, 0, 0.06] }, 'io'),
    k(1.4, { spine: [-0.58, 0, 0], chest: [-0.38, 0, 0] }),
    k(2.2, { ...REST, thL: [0, 0, -0.04], thR: [0, 0, 0.04] }),
  ],
});
def('dance', {
  dur: 4.0, cancelOnMove: true, keys: (() => {
    const out = [];
    for (let i = 0; i <= 8; i++) {
      const s = i % 2 ? 1 : -1, t = i * 0.5;
      if (i === 0 || i === 8) { out.push(k(t, { ...REST, hips: [0, 0, 0], thL: [0, 0, -0.04], knL: [-0.05, 0, 0], thR: [0, 0, 0.04], knR: [-0.05, 0, 0] })); continue; }
      out.push(k(t, {
        hips: [0, 0.25 * s, 0.12 * s], spine: [0, -0.15 * s, -0.1 * s], chest: [0, -0.1 * s, -0.08 * s], head: [0.1, 0.2 * s, 0.15 * s],
        shL: [0.3, 0, s > 0 ? -2.7 : -0.6], elL: [s > 0 ? 0.3 : 1.4, 0, 0], shR: [0.3, 0, s > 0 ? 0.6 : 2.7], elR: [s > 0 ? 1.4 : 0.3, 0, 0],
        thL: [s > 0 ? 0.45 : 0, 0, -0.1], knL: [s > 0 ? -0.8 : -0.1, 0, 0], thR: [s > 0 ? 0 : 0.45, 0, 0.1], knR: [s > 0 ? -0.1 : -0.8, 0, 0],
        off: [0.04 * s, i % 2 ? 0.02 : -0.05, 0],
      }, 'io'));
    }
    return out;
  })(),
});
def('laugh', {
  dur: 2.0, cancelOnMove: true, upper: true, keys: [
    k(0, REST),
    k(0.3, { spine: [0.12, 0, 0], chest: [0.15, 0, 0], head: [0.45, 0, 0], shL: [0.4, 0, -0.35], elL: [1.6, 0, 0], shR: [0.4, 0, 0.35], elR: [1.6, 0, 0], off: [0, 0.0, 0.02] }, 'o'),
    ...wave(6, 0.45, 0.2, { chest: [0.2, 0, 0], head: [0.5, 0, 0] }, { chest: [0.1, 0, 0], head: [0.35, 0, 0] }),
    k(1.7, { spine: [0.05, 0, 0], chest: [0.1, 0, 0], head: [0.2, 0, 0] }),
    k(2.0, REST),
  ],
});
def('cry', {
  dur: 2.6, cancelOnMove: true, upper: true, keys: [
    k(0, REST),
    k(0.4, { spine: [-0.2, 0, 0], chest: [-0.15, 0, 0], head: [-0.45, 0, 0], shL: [0.9, 0, 0.35], elL: [2.3, 0, 0], haL: [0.3, 0, 0], shR: [0.9, 0, -0.35], elR: [2.3, 0, 0], haR: [0.3, 0, 0] }, 'o'),
    ...wave(8, 0.6, 0.22, { chest: [-0.18, 0, 0.04], head: [-0.48, 0, 0.05] }, { chest: [-0.12, 0, -0.04], head: [-0.42, 0, -0.05] }),
    k(2.6, REST),
  ],
});
def('think', {
  dur: 2.8, cancelOnMove: true, upper: true, keys: [
    k(0, REST),
    k(0.4, { shR: [0.5, 0, -0.35], elR: [2.25, 0, 0], haR: [0.2, 0, 0], shL: [0.4, 0, 0.45], elL: [1.5, 0, 0], head: [0.2, 0.15, 0.18], chest: [0, 0, 0.04] }, 'o'),
    k(1.4, { head: [0.25, -0.1, 0.2] }),
    k(2.3, { head: [0.2, 0.15, 0.15] }),
    k(2.8, REST),
  ],
});
def('clap', {
  dur: 2.0, cancelOnMove: true, upper: true, keys: [
    k(0, REST),
    k(0.25, { shL: [1.0, 0, 0.3], elL: [1.2, 0, 0], shR: [1.0, 0, -0.3], elR: [1.2, 0, 0], head: [0.1, 0, 0] }, 'o'),
    ...wave(8, 0.4, 0.17, { shL: [1.0, 0, 0.42], shR: [1.0, 0, -0.42] }, { shL: [1.0, 0, 0.15], shR: [1.0, 0, -0.15] }),
    k(2.0, REST),
  ],
});
def('shrug', {
  dur: 1.4, cancelOnMove: true, upper: true, keys: [
    k(0, REST),
    k(0.35, { shL: [0.2, 0, -0.5], elL: [1.4, 0, 0], haL: [-0.6, 0, 0], shR: [0.2, 0, 0.5], elR: [1.4, 0, 0], haR: [-0.6, 0, 0], head: [0, 0, 0.25], neck: [0, 0, 0], chest: [0.05, 0, 0], off: [0, 0.02, 0] }, 'o'),
    k(0.9, { head: [0, 0, 0.22] }),
    k(1.4, REST),
  ],
});
def('yes', { dur: 1.2, upper: true, keys: [k(0, { head: [0, 0, 0] }), ...wave(4, 0.15, 0.22, { head: [-0.35, 0, 0] }, { head: [0.1, 0, 0] }), k(1.2, { head: [0, 0, 0] })] });
def('no', { dur: 1.2, upper: true, keys: [k(0, { head: [0, 0, 0] }), ...wave(4, 0.15, 0.22, { head: [0, 0.45, 0] }, { head: [0, -0.45, 0] }), k(1.2, { head: [0, 0, 0] })] });
def('angry', {
  dur: 2.0, cancelOnMove: true, upper: true, keys: [
    k(0, REST),
    k(0.3, { shL: [0.5, 0, -0.5], elL: [1.9, 0, 0], shR: [0.5, 0, 0.5], elR: [1.9, 0, 0], chest: [-0.15, 0, 0], head: [-0.15, 0, 0], off: [0, -0.04, 0] }, 'o'),
    ...wave(8, 0.45, 0.16, { shL: [0.9, 0, -0.4], shR: [0.4, 0, 0.5] }, { shL: [0.4, 0, -0.5], shR: [0.9, 0, 0.4] }),
    k(2.0, REST),
  ],
});
def('beckon', {
  dur: 1.8, cancelOnMove: true, upper: true, keys: [
    k(0, REST),
    k(0.3, { shR: [1.3, 0, 0.1], elR: [0.6, 0, 0], haR: [0, 0, 0] }, 'o'),
    ...wave(4, 0.45, 0.25, { elR: [1.8, 0, 0] }, { elR: [0.6, 0, 0] }),
    k(1.8, REST),
  ],
});
def('salute', {
  dur: 1.8, cancelOnMove: true, upper: true, keys: [
    k(0, REST),
    k(0.35, { shR: [0.3, 0, 1.2], elR: [2.4, 0, 0], haR: [0, 0, 0.3], chest: [0.06, 0, 0], head: [0.05, 0, 0] }, 'o'),
    k(1.4, { shR: [0.3, 0, 1.2], elR: [2.4, 0, 0] }),
    k(1.8, REST),
  ],
});
def('jump', {
  dur: 0.9, keys: [
    k(0, { thL: [0, 0, -0.04], knL: [-0.05, 0, 0], thR: [0, 0, 0.04], knR: [-0.05, 0, 0], shL: [0.03, 0, -0.1], shR: [0.03, 0, 0.1], off: [0, 0, 0] }),
    k(0.2, { thL: [0.6, 0, -0.04], knL: [-1.1, 0, 0], thR: [0.6, 0, 0.04], knR: [-1.1, 0, 0], shL: [-0.4, 0, -0.2], shR: [-0.4, 0, 0.2], off: [0, -0.2, 0] }, 'o'),
    k(0.45, { thL: [0.3, 0, -0.04], knL: [-0.5, 0, 0], thR: [0.3, 0, 0.04], knR: [-0.5, 0, 0], shL: [2.4, 0, -0.3], shR: [2.4, 0, 0.3], off: [0, 0.45, 0] }, 'o'),
    k(0.7, { thL: [0.5, 0, -0.04], knL: [-0.9, 0, 0], thR: [0.5, 0, 0.04], knR: [-0.9, 0, 0], shL: [0.4, 0, -0.4], shR: [0.4, 0, 0.4], off: [0, -0.15, 0] }, 'i'),
    k(0.9, { thL: [0, 0, -0.04], knL: [-0.05, 0, 0], thR: [0, 0, 0.04], knR: [-0.05, 0, 0], shL: [0.03, 0, -0.1], shR: [0.03, 0, 0.1], off: [0, 0, 0] }),
  ],
});
def('celebrate', {
  dur: 2.4, cancelOnMove: true, keys: [
    k(0, REST),
    k(0.3, { shR: [0.5, 0, 2.9], elR: [0.2, 0, 0], shL: [0.4, 0, -0.5], elL: [1.6, 0, 0], head: [0.4, 0, 0], chest: [0.15, 0, 0], off: [0, 0.06, 0] }, 'o'),
    k(0.55, { shR: [0.3, 0, 3.0], off: [0, -0.04, 0] }),
    k(0.8, { shR: [0.5, 0, 2.85], off: [0, 0.08, 0] }),
    k(1.8, { shR: [0.45, 0, 2.8], head: [0.3, 0, 0], off: [0, 0, 0] }),
    k(2.4, REST),
  ],
});
def('talkgesture', {
  dur: 2.4, upper: true, keys: [
    k(0, { shR: [0.03, 0, 0.1], elR: [0.2, 0, 0], haR: [0, 0, 0] }),
    k(0.4, { shR: [0.45, 0, 0.2], elR: [1.3, 0, 0], haR: [-0.3, -0.3, 0] }, 'o'),
    k(1.1, { shR: [0.55, 0, 0.3], elR: [1.1, 0, 0], haR: [-0.4, 0.3, 0] }),
    k(1.8, { shR: [0.4, 0, 0.15], elR: [1.4, 0, 0] }),
    k(2.4, { shR: [0.03, 0, 0.1], elR: [0.2, 0, 0], haR: [0, 0, 0] }),
  ],
});

// ---- Skilling loops ----
def('chop', {
  dur: 1.25, loop: true, tools: { R: 'axe' }, hideWeapon: true, impact: 0.62, keys: [
    k(0, { chest: [0.05, -0.55, 0], spine: [0.05, -0.25, 0], head: [0, 0.45, 0], shR: [2.0, 0, 0.75], elR: [1.25, 0, 0], haR: [0.4, 0, 0], shL: [1.75, 0, 0.6], elL: [1.3, 0, 0], haL: [0, 0, 0], thL: [0.15, 0, -0.14], knL: [-0.25, 0, 0], thR: [-0.12, 0, 0.16], knR: [-0.2, 0, 0], off: [0, -0.05, 0] }),
    k(0.42, { chest: [0.08, -0.62, 0], spine: [0.06, -0.28, 0], shR: [2.15, 0, 0.85], elR: [1.3, 0, 0], shL: [1.9, 0, 0.7] }, 'o'),
    k(0.62, { chest: [-0.15, 0.3, 0], spine: [-0.1, 0.18, 0], head: [-0.05, -0.2, 0], shR: [1.25, 0, -0.35], elR: [0.25, 0, 0], haR: [-0.8, 0, 0], shL: [1.15, 0, -0.05], elL: [0.4, 0, 0], off: [0, -0.09, -0.02] }, 'i'),
    k(0.76, { chest: [-0.12, 0.25, 0], shR: [1.3, 0, -0.3], elR: [0.35, 0, 0] }),
  ],
});
def('mine', {
  dur: 1.3, loop: true, tools: { R: 'pickaxe' }, hideWeapon: true, impact: 0.66, keys: [
    k(0, { chest: [0.0, -0.1, 0], spine: [0.0, 0, 0], head: [-0.1, 0, 0], shR: [1.2, 0, 0.1], elR: [0.6, 0, 0], haR: [-0.4, 0, 0], shL: [1.0, 0, 0.3], elL: [0.7, 0, 0], ...STANCE, off: [0, -0.06, 0] }),
    k(0.45, { chest: [0.25, -0.15, 0], spine: [0.15, 0, 0], head: [0.1, 0, 0], shR: [3.0, 0, 0.3], elR: [1.3, 0, 0], haR: [0.5, 0, 0], shL: [2.8, 0, 0.45], elL: [1.2, 0, 0], off: [0, 0.0, 0.03] }, 'o'),
    k(0.66, { chest: [-0.4, 0.05, 0], spine: [-0.3, 0, 0], head: [-0.2, 0, 0], shR: [0.85, 0, 0.0], elR: [0.15, 0, 0], haR: [-0.6, 0, 0], shL: [0.85, 0, 0.3], elL: [0.25, 0, 0], ...LUNGE_L, off: [0, -0.14, -0.06] }, 'i'),
    k(0.85, { chest: [-0.35, 0.05, 0], shR: [0.9, 0, 0.0], elR: [0.25, 0, 0] }),
  ],
});
def('fish_net', {
  dur: 2.6, loop: true, tools: { R: 'net' }, hideWeapon: true, keys: [
    k(0, { spine: [-0.35, 0, 0], chest: [-0.15, 0, 0], head: [0.2, 0, 0], shR: [0.9, 0, -0.05], elR: [0.4, 0, 0], haR: [0.25, 0, 0], shL: [0.85, 0, 0.35], elL: [0.6, 0, 0], ...CROUCH }),
    k(0.9, { spine: [-0.45, 0, 0], chest: [-0.2, 0, 0], shR: [0.6, 0, -0.05], elR: [0.25, 0, 0], haR: [0.15, 0, 0], shL: [0.6, 0, 0.35] }),
    k(1.6, { spine: [-0.42, 0.15, 0], chest: [-0.18, 0.1, 0], shR: [0.65, 0, -0.25], shL: [0.65, 0, 0.2] }),
    k(2.1, { spine: [-0.3, 0, 0], chest: [-0.1, 0, 0], shR: [1.15, 0, -0.05], elR: [0.6, 0, 0], haR: [0.35, 0, 0], shL: [1.05, 0, 0.35], elL: [0.8, 0, 0] }, 'o'),
  ],
});
def('fish_rod', {
  dur: 3.2, loop: true, tools: { R: 'rod' }, hideWeapon: true, line: true, keys: [
    k(0, { spine: [-0.05, 0, 0], head: [-0.15, 0, 0], shR: [0.65, 0, 0.0], elR: [0.85, 0, 0], haR: [-1.05, 0, 0], shL: [0.65, 0, 0.35], elL: [1.05, 0, 0], ...STANCE }),
    k(1.4, { shR: [0.68, 0, 0.02], elR: [0.82, 0, 0], shL: [0.68, 0, 0.36] }),
    k(1.7, { shR: [0.85, 0, 0.02], elR: [1.05, 0, 0], haR: [-0.85, 0, 0], head: [-0.1, 0, 0] }, 'o'),
    k(2.2, { shR: [0.65, 0, 0.0], elR: [0.85, 0, 0], haR: [-1.05, 0, 0], head: [-0.15, 0, 0] }),
  ],
});
def('harpoon', {
  dur: 1.7, loop: true, tools: { R: 'harpoon' }, hideWeapon: true, impact: 0.95, keys: [
    k(0, { spine: [-0.15, 0, 0], head: [-0.25, 0, 0], shR: [1.5, 0, 0.25], elR: [1.6, 0, 0], haR: [-0.9, 0, 0], shL: [0.9, 0, -0.2], elL: [0.6, 0, 0], ...STANCE, off: [0, -0.04, 0] }),
    k(0.7, { spine: [0.0, 0, 0], head: [-0.15, 0, 0], shR: [2.3, 0, 0.3], elR: [1.7, 0, 0], haR: [-1.1, 0, 0], off: [0, 0.0, 0.02] }, 'o'),
    k(0.95, { spine: [-0.4, 0, 0], chest: [-0.15, 0, 0], head: [-0.35, 0, 0], shR: [1.1, 0, 0.1], elR: [0.4, 0, 0], haR: [-1.2, 0, 0], ...LUNGE_L, off: [0, -0.12, -0.08] }, 'i'),
    k(1.25, { spine: [-0.3, 0, 0], shR: [1.2, 0, 0.15], elR: [0.8, 0, 0] }),
  ],
});
def('cook', {
  dur: 2.2, loop: true, tools: { R: 'pan' }, hideWeapon: true, keys: [
    k(0, { spine: [-0.25, 0, 0], chest: [-0.1, 0, 0], head: [0.15, 0, 0], shR: [1.0, 0, 0.0], elR: [0.6, 0, 0], haR: [-0.55, 0, 0], shL: [0.4, 0, -0.2], elL: [0.9, 0, 0], ...KNEEL }),
    k(0.6, { shR: [1.05, 0, -0.05], elR: [0.5, 0, 0], haR: [-0.75, 0, 0] }),
    k(0.85, { shR: [1.2, 0, 0.0], elR: [0.65, 0, 0], haR: [-0.3, 0, 0] }, 'o'),
    k(1.1, { shR: [1.0, 0, 0.0], elR: [0.6, 0, 0], haR: [-0.55, 0, 0] }, 'i'),
    k(1.6, { shR: [1.02, 0, 0.05], haR: [-0.6, 0, 0] }),
  ],
});
def('smith', {
  dur: 1.05, loop: true, tools: { R: 'hammer', L: 'bar' }, hideWeapon: true, impact: 0.55, keys: [
    k(0, { spine: [-0.2, 0, 0], chest: [-0.1, 0.1, 0], head: [-0.2, 0, 0], shR: [0.9, 0, 0.15], elR: [0.9, 0, 0], haR: [-0.3, 0, 0], shL: [0.7, 0, 0.15], elL: [0.9, 0, 0], haL: [-0.2, 0, 0], ...STANCE, off: [0, -0.05, 0] }),
    k(0.38, { chest: [0.0, 0.05, 0], shR: [1.9, 0, 0.35], elR: [1.9, 0, 0], haR: [0.4, 0, 0], head: [-0.15, 0, 0] }, 'o'),
    k(0.55, { chest: [-0.2, 0.1, 0], shR: [0.75, 0, 0.1], elR: [0.75, 0, 0], haR: [-0.45, 0, 0], head: [-0.25, 0, 0], off: [0, -0.07, 0] }, 'i'),
    k(0.7, { shR: [0.85, 0, 0.12], elR: [0.85, 0, 0], off: [0, -0.05, 0] }),
  ],
});
def('smelt', {
  dur: 2.4, loop: true, tools: { L: 'ore' }, hideWeapon: true, keys: [
    k(0, { spine: [-0.1, 0, 0], head: [0, 0, 0], shL: [0.5, 0, -0.1], elL: [1.2, 0, 0], shR: [0.4, 0, 0.1], elR: [1.1, 0, 0], ...STANCE }),
    k(0.8, { spine: [-0.35, 0, 0], chest: [-0.1, 0, 0], head: [-0.1, 0, 0], shL: [1.3, 0, 0.05], elL: [0.3, 0, 0], shR: [1.25, 0, -0.05], elR: [0.3, 0, 0], ...LUNGE_L, off: [0, -0.08, -0.06] }, 'io'),
    k(1.2, { shL: [1.35, 0, 0.1], shR: [1.3, 0, -0.1] }),
    k(1.9, { spine: [-0.05, 0, 0], chest: [0, 0, 0], head: [0.05, 0, 0], shL: [0.4, 0, -0.1], elL: [1.0, 0, 0], shR: [0.4, 0, 0.1], elR: [1.0, 0, 0], ...STANCE, off: [0, 0, 0] }),
  ],
});
def('fletch', {
  dur: 0.7, loop: true, tools: { R: 'knife', L: 'log' }, hideWeapon: true, keys: [
    k(0, { spine: [-0.15, 0, 0], head: [-0.4, 0, 0], shL: [0.55, 0, 0.3], elL: [1.45, 0, 0], haL: [0.2, 0, 0.3], shR: [0.65, 0, -0.25], elR: [1.5, 0, 0], haR: [-0.5, 0, 0] }),
    k(0.35, { shR: [0.45, 0, -0.05], elR: [1.75, 0, 0], haR: [-0.3, 0, 0] }, 'io'),
  ],
});
def('craft', {
  dur: 0.9, loop: true, tools: { R: 'needle', L: 'leather' }, hideWeapon: true, keys: [
    k(0, { spine: [-0.15, 0, 0], head: [-0.42, 0, 0], shL: [0.6, 0, 0.3], elL: [1.4, 0, 0], shR: [0.65, 0, -0.25], elR: [1.5, 0, 0], haR: [0, 0, 0] }),
    k(0.3, { shR: [0.8, 0, -0.35], elR: [1.25, 0, 0], haR: [0.4, 0, 0] }, 'o'),
    k(0.6, { shR: [0.5, 0, -0.05], elR: [1.75, 0, 0], haR: [-0.3, 0, 0] }),
  ],
});
def('pick', {
  dur: 1.5, loop: true, hideWeapon: true, keys: [
    k(0, { spine: [-0.5, 0, 0], chest: [-0.2, 0, 0], head: [0.2, 0, 0], shR: [1.0, 0, -0.1], elR: [0.3, 0, 0], shL: [0.5, 0, -0.2], elL: [0.8, 0, 0], ...CROUCH }),
    k(0.5, { spine: [-0.6, 0, 0], shR: [0.75, 0, -0.15], elR: [0.15, 0, 0] }),
    k(0.9, { spine: [-0.4, 0, 0], shR: [0.9, 0, -0.1], elR: [1.5, 0, 0] }, 'o'),
    k(1.2, { spine: [-0.45, 0, 0], shR: [0.7, 0, 0.1], elR: [1.2, 0, 0] }),
  ],
});
def('firemake', {
  dur: 1.1, loop: true, tools: { L: 'tinderbox' }, hideWeapon: true, keys: [
    k(0, { spine: [-0.35, 0, 0], head: [0.0, 0, 0], shL: [0.8, 0, 0.15], elL: [0.9, 0, 0], shR: [0.9, 0, -0.2], elR: [1.3, 0, 0], ...KNEEL }),
    k(0.3, { shR: [1.0, 0, -0.35], elR: [0.8, 0, 0] }, 'o'),
    k(0.45, { shR: [0.8, 0, -0.1], elR: [1.4, 0, 0] }, 'i'),
  ],
});
def('craftsit', {
  dur: 1.6, loop: true, keys: [
    k(0, { spine: [-0.2, 0, 0], head: [-0.3, 0, 0], shL: [0.6, 0, 0.3], elL: [1.3, 0, 0], shR: [0.6, 0, -0.3], elR: [1.3, 0, 0], ...KNEEL }),
    k(0.8, { shL: [0.7, 0, 0.25], shR: [0.5, 0, -0.35] }),
  ],
});
def('sit', {
  dur: 4, loop: true, keys: [
    k(0, { thL: [1.5, 0, -0.12], thR: [1.5, 0, 0.12], knL: [-1.5, 0, 0], knR: [-1.5, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], spine: [-0.08, 0, 0], shL: [0.55, 0, -0.08], elL: [0.6, 0, 0], shR: [0.55, 0, 0.08], elR: [0.6, 0, 0], off: [0, -0.45, 0.06] }),
    k(2, { spine: [-0.06, 0, 0], off: [0, -0.448, 0.06] }),
  ],
});
def('meditate', {
  dur: 4, loop: true, keys: [
    k(0, { thL: [2.0, 0, -0.5], thR: [2.0, 0, 0.5], knL: [-2.5, 0, 0], knR: [-2.5, 0, 0], spine: [0.0, 0, 0], shL: [0.4, 0, -0.1], elL: [0.9, 0, 0], shR: [0.4, 0, 0.1], elR: [0.9, 0, 0], head: [-0.1, 0, 0], off: [0, -0.72, 0.1] }),
    k(2, { spine: [0.03, 0, 0], head: [-0.06, 0, 0], off: [0, -0.715, 0.1] }),
  ],
});

// Death: knees buckle, body tips backward and lands; held at the end.
def('die', {
  dur: 1.1, keys: [
    k(0, { hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], shL: [0.03, 0, -0.1], elL: [0.2, 0, 0], shR: [0.03, 0, 0.1], elR: [0.2, 0, 0], thL: [0, 0, -0.04], knL: [-0.05, 0, 0], thR: [0, 0, 0.04], knR: [-0.05, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], off: [0, 0, 0] }),
    k(0.3, { hips: [0.15, 0, 0.1], spine: [0.15, 0, 0.1], head: [-0.3, 0.2, 0.2], shL: [0.5, 0, -0.5], elL: [0.6, 0, 0], shR: [0.6, 0, 0.6], elR: [0.5, 0, 0], thL: [0.6, 0, -0.1], knL: [-1.1, 0, 0], thR: [0.5, 0, 0.1], knR: [-1.0, 0, 0], ftL: [0.5, 0, 0], ftR: [0.5, 0, 0], off: [0, -0.28, 0.05] }, 'o'),
    k(0.75, { hips: [1.45, 0, 0.15], spine: [0.1, 0, 0.05], chest: [0.05, 0, 0], head: [0.25, 0.5, 0.1], shL: [0.4, 0, -1.3], elL: [0.4, 0, 0], shR: [0.2, 0, 1.1], elR: [0.7, 0, 0], thL: [-0.3, 0, -0.15], knL: [-0.5, 0, 0], thR: [-0.1, 0, 0.12], knR: [-0.2, 0, 0], ftL: [0.6, 0, 0], ftR: [0.5, 0, 0], off: [0, -0.7, 0.25] }, 'i'),
    k(0.9, { hips: [1.5, 0, 0.15], off: [0, -0.68, 0.27], head: [0.2, 0.55, 0.1] }, 'o'),
    k(1.1, { hips: [1.52, 0, 0.15], off: [0, -0.72, 0.28], head: [0.25, 0.6, 0.1] }),
  ],
});

// Aliases (game-facing names -> canonical). Unknown names fall back to idle.
const ALIAS = {
  idle: 'idle', stand: 'idle', walk: 'walk', run: 'run', ready: 'ready', combat: 'ready', combat_idle: 'ready',
  attack: 'attack', melee: 'attack', hit: 'hit', flinch: 'hit', hurt: 'hit',
  slash: 'slash', slash2: 'slash2', stab: 'stab', thrust: 'stab', lunge: 'stab', crush: 'crush', smash: 'crush', bash: 'crush', pound: 'crush',
  swing2h: 'swing2h', '2h': 'swing2h', greatsword: 'swing2h', heavy: 'swing2h', punch: 'punch', punch2: 'punch2', kick: 'kick', unarmed: 'punch',
  shoot: 'shoot', fire: 'shoot', bow: 'bow', archery: 'shoot', ranged: 'shoot', cast: 'cast', spell: 'cast', magic: 'cast', arcana: 'cast',
  block: 'block', defend: 'block', parry: 'block', guard: 'guard', defending: 'guard',
  teleport: 'teleport', eat: 'eat', drink: 'drink', pickpocket: 'pickpocket', thieve: 'pickpocket', thieving: 'pickpocket', steal: 'pickpocket',
  stun: 'stun', stunned: 'stun', dazed: 'stun',
  wave: 'wave', cheer: 'cheer', dance: 'dance', laugh: 'laugh', cry: 'cry', think: 'think', clap: 'clap', shrug: 'shrug',
  yes: 'yes', nod: 'yes', no: 'no', angry: 'angry', beckon: 'beckon', salute: 'salute', jump: 'jump', celebrate: 'celebrate', levelup: 'celebrate',
  talk: 'talk', gesture: 'talkgesture',
  chop: 'chop', woodcut: 'chop', woodcutting: 'chop', mine: 'mine', mining: 'mine',
  fish: 'fish_net', fishing: 'fish_net', fish_net: 'fish_net', net: 'fish_net', fish_rod: 'fish_rod', rod: 'fish_rod', fish_fly: 'fish_rod', flyfish: 'fish_rod', bait: 'fish_rod',
  harpoon: 'harpoon', fish_harpoon: 'harpoon', cage: 'fish_net', pot: 'fish_net',
  cook: 'cook', cooking: 'cook', smith: 'smith', smithing: 'smith', anvil: 'smith', smelt: 'smelt', smelting: 'smelt', furnace: 'smelt',
  fletch: 'fletch', fletching: 'fletch', whittle: 'fletch', craft: 'craft', crafting: 'craft', spin: 'craft', tan: 'craft', cut_gem: 'craft',
  pick: 'pick', gather: 'pick', farm: 'pick', crouch: 'pick', firemake: 'firemake', firemaking: 'firemake', light: 'firemake',
  sit: 'sit', rest: 'sit', meditate: 'meditate', die: 'die', death: 'die', dead: 'die',
};
export function resolveAnim(name) { return ALIAS[name] || (DEF[name] ? name : null); }
export function animDef(name) { return DEF[name] || null; }
export const LOOP_BASES = new Set(['idle', 'walk', 'run', 'ready', 'talk', ...Object.keys(DEF).filter((n) => DEF[n].loop)]);
export const ONE_SHOTS = new Set(Object.keys(DEF).filter((n) => !DEF[n].loop && n !== 'die'));
export { evalKeys };

// Attack choice by weapon kind ('attack' / 'melee').
export function attackFor(kind, n) {
  switch (kind) {
    case 'dagger': return n % 3 === 2 ? 'slash' : 'stab';
    case 'sword': return n % 2 ? 'stab' : (n % 4 === 2 ? 'slash2' : 'slash');
    case 'greatsword': return 'swing2h';
    case 'axe': return n % 2 ? 'slash' : 'crush';
    case 'pickaxe': case 'club': case 'greatclub': case 'harpoon': return 'crush';
    case 'walking-staff': return 'crush';
    case 'staff': return 'cast';
    case 'shortbow': case 'longbow': return 'shoot';
    default: return n % 3 === 2 ? 'kick' : (n % 2 ? 'punch2' : 'punch');
  }
}

// Additive layers.
export function addHurt(P, k) {
  if (k <= 0.001) return;
  A(P, B.spine, 0.28 * k, 0.15 * k, 0);
  A(P, B.chest, 0.12 * k, 0.1 * k, 0);
  A(P, B.head, -0.28 * k, -0.2 * k, 0.1 * k);
  A(P, B.shL, 0.5 * k, 0, -0.25 * k); A(P, B.elL, 0.7 * k, 0, 0);
  A(P, B.shR, 0.2 * k, 0, 0.25 * k);
  P[OFF + 2] += 0.07 * k;
  P[OFF + 1] -= 0.03 * k;
}
export function addTalk(P, t, a) {
  if (a <= 0.001) return;
  const g1 = Math.sin(t * 2.3) * Math.sin(t * 0.7 + 1);
  const g2 = Math.sin(t * 1.9 + 2) * Math.sin(t * 0.53);
  const g3 = Math.sin(t * 2.7 + 4) * Math.sin(t * 0.61 + 2);
  A(P, B.shL, a * (0.25 + 0.25 * g1), 0, a * 0.1 * g2);
  A(P, B.elL, a * (0.7 + 0.45 * g2), 0, 0);
  A(P, B.haL, a * 0.25 * g3, a * 0.3, 0);
  A(P, B.head, a * 0.07 * Math.sin(t * 5.1) * Math.abs(Math.sin(t * 0.9)), a * 0.1 * Math.sin(t * 0.6), a * 0.04 * g3);
  A(P, B.chest, 0, a * 0.06 * Math.sin(t * 0.8), 0);
}
export { S, A };
