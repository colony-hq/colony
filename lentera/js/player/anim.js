// Procedural poses for the character rig. A pose is a Float32Array: per bone (x, y, z) Euler
// rotations, followed by the hips position offset (x, y, z). Conventions (model faces -z,
// +x is the character's right): thigh/shoulder +x swings forward, knee -x bends, elbow +x bends,
// spine -x leans forward, head +x looks up, +y turns left, right arm +z / left arm -z raise
// sideways. Owner: player.

import { BONE as B, BONE_COUNT } from './charparts.js';

export const OFF = BONE_COUNT * 3;
export const POSE_LEN = OFF + 3;
export const newPose = () => new Float32Array(POSE_LEN);

const TAU = Math.PI * 2;
const pos = (v) => (v > 0 ? v : 0);

function S(P, b, x, y, z) { const k = b * 3; P[k] = x; P[k + 1] = y; P[k + 2] = z; }
function A(P, b, x, y, z) { const k = b * 3; P[k] += x; P[k + 1] += y; P[k + 2] += z; }
function off(P, x, y, z) { P[OFF] = x; P[OFF + 1] = y; P[OFF + 2] = z; }

// Feet stay parallel to the ground for the given leg angles.
function flatFeet(P, k = 1) {
  P[B.ftL * 3] = -(P[B.thL * 3] + P[B.knL * 3]) * k;
  P[B.ftR * 3] = -(P[B.thR * 3] + P[B.knR * 3]) * k;
}

// Old builds hunch, bend the knees a little and keep the head up.
function hunch(P, h) {
  if (h <= 0) return;
  A(P, B.spine, -0.2 * h, 0, 0);
  A(P, B.chest, -0.14 * h, 0, 0);
  A(P, B.neck, 0.16 * h, 0, 0);
  A(P, B.head, 0.14 * h, 0, 0);
  A(P, B.thL, 0.09 * h, 0, 0); A(P, B.thR, 0.09 * h, 0, 0);
  A(P, B.knL, -0.14 * h, 0, 0); A(P, B.knR, -0.14 * h, 0, 0);
  A(P, B.shL, 0.12 * h, 0, 0); A(P, B.shR, 0.12 * h, 0, 0);
  A(P, B.elL, 0.25 * h, 0, 0); A(P, B.elR, 0.25 * h, 0, 0);
  P[OFF + 1] -= 0.035 * h;
}

// c: { t, ph (cycle phase 0..1), spd, run (0..1), sprint (0..1), lantern (bool), old (0..1),
//      seat, swim (0..1 moving), stroke (phase), breath }
export function poseIdle(P, c) {
  P.fill(0);
  const br = Math.sin(c.t * (c.old ? 1.25 : 1.65));
  const sway = Math.sin(c.t * 0.45);
  off(P, sway * 0.012, -0.004 + br * 0.003, 0);
  S(P, B.hips, 0, 0, sway * 0.022);
  S(P, B.spine, 0.012 * br - 0.02, 0, -sway * 0.015);
  S(P, B.chest, -0.022 * br, 0, 0);
  S(P, B.shL, 0.03, 0, -0.1 - 0.012 * br);
  S(P, B.elL, 0.16, 0, 0);
  S(P, B.haL, 0.06, 0, 0);
  S(P, B.shR, 0.03, 0, 0.1 + 0.012 * br);
  S(P, B.elR, 0.16, 0, 0);
  S(P, B.haR, 0.06, 0, 0);
  S(P, B.thL, 0.0, 0, -0.035 - sway * 0.02);
  S(P, B.thR, 0.0, 0, 0.035 - sway * 0.02);
  S(P, B.knL, -0.05 - pos(sway) * 0.06, 0, 0);
  S(P, B.knR, -0.05 - pos(-sway) * 0.06, 0, 0);
  flatFeet(P);
  P[B.ftL * 3 + 2] = 0.035; P[B.ftR * 3 + 2] = -0.035;
  if (c.lantern) {
    S(P, B.shR, 0.24, 0, 0.2 + 0.01 * br);
    S(P, B.elR, 0.6, 0, 0);
    S(P, B.haR, -0.25, 0, 0);
  }
  hunch(P, c.old);
}

export function poseWalk(P, c) {
  P.fill(0);
  const w = c.ph * TAU;
  const s = Math.sin(w), co = Math.cos(w);
  const amp = 0.42 * (c.old ? 0.65 : 1);
  P[B.thR * 3] = amp * s + 0.04;
  P[B.thL * 3] = -amp * s + 0.04;
  P[B.knR * 3] = -(0.1 + 0.85 * Math.pow(pos(Math.cos(w + 0.7)), 1.6));
  P[B.knL * 3] = -(0.1 + 0.85 * Math.pow(pos(Math.cos(w + Math.PI + 0.7)), 1.6));
  flatFeet(P, 0.85);
  P[B.ftR * 3] += 0.22 * Math.pow(pos(s), 3) - 0.35 * Math.pow(pos(-s), 3);
  P[B.ftL * 3] += 0.22 * Math.pow(pos(-s), 3) - 0.35 * Math.pow(pos(s), 3);
  off(P, 0, 0.03 * Math.cos(2 * w) - 0.015, 0);
  S(P, B.hips, 0, 0.1 * s, -0.03 * co);
  S(P, B.spine, -0.05, 0, 0.02 * co);
  S(P, B.chest, 0, -0.13 * s, 0);
  S(P, B.head, 0.02 * Math.cos(2 * w), 0.05 * s, 0);
  S(P, B.shL, 0.38 * s, 0, -0.1);
  S(P, B.shR, -0.38 * s, 0, 0.1);
  S(P, B.elL, 0.3 + 0.25 * pos(s), 0, 0);
  S(P, B.elR, 0.3 + 0.25 * pos(-s), 0, 0);
  S(P, B.haL, 0.1, 0, 0); S(P, B.haR, 0.1, 0, 0);
  if (c.lantern) {
    S(P, B.shR, 0.2 - 0.12 * s, 0, 0.21);
    S(P, B.elR, 0.62, 0, 0);
    S(P, B.haR, -0.25, 0, 0);
  }
  hunch(P, c.old);
}

export function poseRun(P, c) {
  P.fill(0);
  const w = c.ph * TAU;
  const s = Math.sin(w);
  const sp = c.sprint;
  const amp = 0.78 + 0.14 * sp;
  P[B.thR * 3] = amp * s + 0.2;
  P[B.thL * 3] = -amp * s + 0.2;
  P[B.knR * 3] = -(0.28 + 1.55 * Math.pow(pos(Math.cos(w + 0.55)), 1.4));
  P[B.knL * 3] = -(0.28 + 1.55 * Math.pow(pos(Math.cos(w + Math.PI + 0.55)), 1.4));
  flatFeet(P, 0.7);
  P[B.ftR * 3] += 0.15 * pos(s) - 0.5 * Math.pow(pos(-s), 2);
  P[B.ftL * 3] += 0.15 * pos(-s) - 0.5 * Math.pow(pos(s), 2);
  off(P, 0, 0.055 * Math.cos(2 * w - 0.8) - 0.045, 0);
  S(P, B.hips, 0, 0.16 * s, 0);
  S(P, B.spine, -0.2 - 0.12 * sp, 0, 0);
  S(P, B.chest, -0.04, -0.24 * s, 0);
  S(P, B.neck, 0.1, 0, 0);
  S(P, B.head, 0.12 + 0.08 * sp, 0.06 * s, 0);
  S(P, B.shL, 0.85 * s + 0.12, 0, -0.14);
  S(P, B.shR, -0.85 * s + 0.12, 0, 0.14);
  S(P, B.elL, 1.35 + 0.25 * s, 0, 0);
  S(P, B.elR, 1.35 - 0.25 * s, 0, 0);
  S(P, B.haL, 0.2, 0, 0); S(P, B.haR, 0.2, 0, 0);
  if (c.lantern) {
    S(P, B.shR, 0.32 - 0.38 * s, 0, 0.3);
    S(P, B.elR, 1.0, 0, 0);
    S(P, B.haR, -0.4, 0, 0);
  }
  hunch(P, c.old * 0.6);
}

export function poseJump(P, c) {
  P.fill(0);
  // Leading knee driven up, trailing leg extended, free arm reaching: a heroic take-off.
  off(P, 0, 0.05, 0);
  S(P, B.thR, 1.3, 0, 0.06); S(P, B.knR, -1.65, 0, 0); S(P, B.ftR, 0.2, 0, 0);
  S(P, B.thL, -0.3, 0, -0.04); S(P, B.knL, -0.55, 0, 0); S(P, B.ftL, -0.55, 0, 0);
  S(P, B.spine, -0.16, 0, 0);
  S(P, B.chest, 0.06, 0, 0);
  S(P, B.head, 0.16, 0, 0);
  S(P, B.shL, 1.75, 0, -0.35); S(P, B.elL, 0.35, 0, 0); S(P, B.haL, 0.2, 0, 0);
  S(P, B.shR, -0.35, 0, 0.55); S(P, B.elR, 0.55, 0, 0);
  if (c.lantern) { S(P, B.shR, 0.15, 0, 0.62); S(P, B.elR, 0.7, 0, 0); S(P, B.haR, -0.3, 0, 0); }
}

export function poseFall(P, c) {
  P.fill(0);
  const fl = Math.sin(c.t * 8.5), fl2 = Math.sin(c.t * 7.3 + 1.2);
  S(P, B.thR, 0.45, 0, 0.06); S(P, B.knR, -0.78, 0, 0); S(P, B.ftR, -0.25, 0, 0);
  S(P, B.thL, -0.08, 0, -0.06); S(P, B.knL, -0.35, 0, 0); S(P, B.ftL, -0.3, 0, 0);
  S(P, B.spine, 0.06, 0, 0);
  S(P, B.head, -0.14, 0, 0);
  S(P, B.shL, 0.25, 0, -1.12 + 0.12 * fl); S(P, B.elL, 0.38, 0, 0);
  S(P, B.shR, 0.2, 0, 1.0 + 0.12 * fl2); S(P, B.elR, 0.42, 0, 0);
  if (c.lantern) { S(P, B.shR, 0.25, 0, 0.85 + 0.08 * fl2); S(P, B.elR, 0.5, 0, 0); }
}

export function poseGlide(P, c) {
  P.fill(0);
  const b = Math.sin(c.t * 1.8), f = Math.sin(c.t * 2.3);
  off(P, 0, 0.08 + b * 0.015, 0);
  S(P, B.hips, -0.6, 0, 0);
  S(P, B.spine, -0.1, 0, 0);
  S(P, B.chest, 0.06, 0, 0);
  S(P, B.neck, 0.32, 0, 0);
  S(P, B.head, 0.3, 0, 0);
  S(P, B.shL, 0.12, 0.22, -1.42 + f * 0.04); S(P, B.elL, 0.12, 0, 0); S(P, B.haL, 0, 0, -0.2);
  S(P, B.shR, 0.12, -0.22, 1.42 - f * 0.04); S(P, B.elR, 0.12, 0, 0); S(P, B.haR, 0, 0, 0.2);
  S(P, B.thL, -0.2, 0, -0.06); S(P, B.knL, -0.45, 0, 0); S(P, B.ftL, -0.6, 0, 0);
  S(P, B.thR, -0.06, 0, 0.06); S(P, B.knR, -0.22, 0, 0); S(P, B.ftR, -0.6, 0, 0);
}

export function poseSwim(P, c) {
  P.fill(0);
  const m = c.swim; // 0 treading .. 1 swimming forward
  const w = c.stroke * TAU;
  const s = Math.sin(w), co = Math.cos(w);
  const tread = 1 - m;
  // Body angle: upright when treading, leaning forward when swimming.
  S(P, B.hips, -0.15 * tread - 0.85 * m, 0, 0.06 * s * m);
  off(P, 0, 0.0, 0.05 * m);
  S(P, B.spine, -0.06 * m, 0, 0);
  S(P, B.neck, 0.1 * tread + 0.45 * m, 0, 0);
  S(P, B.head, 0.02 * tread + 0.38 * m, 0, 0);
  // Left arm: breaststroke reach & sweep (moving) / sculling (treading).
  const lx = (0.55 + 0.25 * s) * tread + (2.0 + 0.95 * s) * m;
  const lz = -0.75 * tread + (-0.25 - 0.6 * pos(-co)) * m;
  const ly = 0.45 * s * tread;
  S(P, B.shL, lx, ly, lz);
  S(P, B.elL, 0.5 * tread + (0.3 + 0.75 * pos(co)) * m, 0, 0);
  S(P, B.haL, 0.2, 0, -0.2 * s);
  if (c.lantern) {
    // Keep the lantern high and dry.
    S(P, B.shR, 2.65 * tread + 2.9 * m, 0, 0.3);
    S(P, B.elR, 0.35, 0, 0);
    S(P, B.haR, 0.1, 0, 0);
  } else {
    S(P, B.shR, (0.55 + 0.25 * Math.sin(w + Math.PI)) * tread + (2.0 + 0.95 * s) * m, -ly, -lz);
    S(P, B.elR, 0.5 * tread + (0.3 + 0.75 * pos(co)) * m, 0, 0);
  }
  // Legs: cycling (treading) / frog-flutter kick (moving).
  const k = Math.sin(w * 2);
  S(P, B.thL, (0.35 + 0.35 * s) * tread + (-0.3 + 0.38 * k) * m, 0, -0.08);
  S(P, B.thR, (0.35 - 0.35 * s) * tread + (-0.3 - 0.38 * k) * m, 0, 0.08);
  S(P, B.knL, (-0.8 + 0.35 * co) * tread + (-0.35 - 0.3 * pos(k)) * m, 0, 0);
  S(P, B.knR, (-0.8 - 0.35 * co) * tread + (-0.35 - 0.3 * pos(-k)) * m, 0, 0);
  S(P, B.ftL, -0.3 * tread - 0.55 * m, 0, 0);
  S(P, B.ftR, -0.3 * tread - 0.55 * m, 0, 0);
}

export function poseSit(P, c) {
  P.fill(0);
  const seat = c.seat;
  const hipY = c.hipY;
  const br = Math.sin(c.t * 1.5);
  const style = c.sitStyle; // 'chair' (log / bench), 'edge' (legs dangling), 'floor' (knees up)
  if (style === 'floor') {
    off(P, 0, seat + 0.11 - hipY + br * 0.002, 0.1);
    S(P, B.thL, 2.15, 0, -0.16); S(P, B.thR, 2.15, 0, 0.16);
    S(P, B.knL, -2.45, 0, 0); S(P, B.knR, -2.45, 0, 0);
    S(P, B.ftL, 0.3, 0, 0); S(P, B.ftR, 0.3, 0, 0);
    S(P, B.spine, -0.2 + 0.012 * br, 0, 0);
    S(P, B.chest, -0.08 - 0.015 * br, 0, 0);
    S(P, B.head, 0.22, 0, 0);
    S(P, B.shL, 0.95, 0, 0.05); S(P, B.elL, 0.75, 0, 0); S(P, B.haL, 0.2, 0, 0);
    S(P, B.shR, 0.95, 0, -0.05); S(P, B.elR, 0.75, 0, 0); S(P, B.haR, 0.2, 0, 0);
    if (c.lantern) { S(P, B.shR, 0.6, 0, 0.35); S(P, B.elR, 0.7, 0, 0); }
  } else {
    const edge = style === 'edge';
    off(P, 0, seat + 0.075 - hipY + br * 0.002, 0.07);
    S(P, B.thL, 1.5, 0, -0.1);
    S(P, B.thR, 1.5, 0, 0.1);
    if (edge) {
      const kick = Math.sin(c.t * 1.3), kick2 = Math.sin(c.t * 1.3 + 2.1);
      S(P, B.knL, -1.25 + 0.15 * kick, 0, 0);
      S(P, B.knR, -1.32 + 0.15 * kick2, 0, 0);
      S(P, B.ftL, -0.3, 0, 0); S(P, B.ftR, -0.3, 0, 0);
    } else {
      S(P, B.knL, -1.5, 0, 0); S(P, B.knR, -1.5, 0, 0);
      flatFeet(P);
    }
    S(P, B.spine, -0.1 + 0.012 * br, 0, 0);
    S(P, B.chest, -0.06 - 0.015 * br, 0, 0);
    S(P, B.head, 0.08, 0, 0);
    S(P, B.shL, 0.52, 0, -0.06); S(P, B.elL, 0.62, 0, 0); S(P, B.haL, 0.1, 0, 0);
    S(P, B.shR, 0.52, 0, 0.06); S(P, B.elR, 0.62, 0, 0); S(P, B.haR, 0.1, 0, 0);
    if (c.lantern) { S(P, B.shR, 0.4, 0, 0.32); S(P, B.elR, 0.5, 0, 0); }
  }
  if (c.old) {
    A(P, B.spine, -0.14 * c.old, 0, 0); A(P, B.chest, -0.12 * c.old, 0, 0);
    A(P, B.neck, 0.12 * c.old, 0, 0); A(P, B.head, 0.1 * c.old, 0, 0);
  }
}

export function poseSlide(P, c) {
  P.fill(0);
  const j = Math.sin(c.t * 11) * 0.04;
  off(P, 0, -0.14, 0);
  S(P, B.hips, 0.08, 0.35, 0);
  S(P, B.spine, 0.18, -0.2, 0);
  S(P, B.thR, 0.8, 0, 0.12); S(P, B.knR, -0.35, 0, 0); S(P, B.ftR, 0.25, 0, 0);
  S(P, B.thL, 0.25, 0, -0.15); S(P, B.knL, -1.15, 0, 0); S(P, B.ftL, 0.3, 0, 0);
  S(P, B.shL, 0.4, 0, -0.95 + j); S(P, B.elL, 0.3, 0, 0);
  S(P, B.shR, 0.3, 0, 0.85 - j); S(P, B.elR, 0.35, 0, 0);
  S(P, B.head, -0.15, -0.2, 0);
}

export function poseClimb(P, c) {
  P.fill(0);
  off(P, 0, -0.05, 0);
  S(P, B.spine, -0.45, 0, 0);
  S(P, B.head, 0.35, 0, 0);
  S(P, B.shL, 1.15, 0, -0.15); S(P, B.elL, 0.25, 0, 0);
  S(P, B.shR, 1.15, 0, 0.15); S(P, B.elR, 0.25, 0, 0);
  S(P, B.thL, 1.15, 0, 0); S(P, B.knL, -1.65, 0, 0); S(P, B.ftL, 0.3, 0, 0);
  S(P, B.thR, 0.3, 0, 0); S(P, B.knR, -0.6, 0, 0); S(P, B.ftR, -0.2, 0, 0);
}

// ---------------------------------------------------------------------------------------------
// Override layers (write only the channels they own into O; return the owned bone list).
// ---------------------------------------------------------------------------------------------
export const ARM_R = [B.shR, B.elR, B.haR];
export const ARM_L = [B.shL, B.elL, B.haL];

export function layerFlare(O, c) {
  S(O, B.shR, 2.78, 0, 0.22); S(O, B.elR, 0.12, 0, 0); S(O, B.haR, 0.25, 0, 0);
  S(O, B.shL, -0.25, 0, -0.65); S(O, B.elL, 0.25, 0, 0); S(O, B.haL, 0, 0, 0);
}

export function layerWave(O, c, rightHand) {
  const s = Math.sin(c.t * 10);
  if (rightHand) {
    S(O, B.shR, 0.25, 0, 2.45); S(O, B.elR, 0.35, 0, 0.5 * s); S(O, B.haR, 0, 0, 0.25 * Math.sin(c.t * 10 + 0.6));
  } else {
    S(O, B.shL, 0.25, 0, -2.45); S(O, B.elL, 0.35, 0, -0.5 * s); S(O, B.haL, 0, 0, -0.25 * Math.sin(c.t * 10 + 0.6));
  }
}

export function layerSketch(O, c) {
  const d = Math.sin(c.t * 7.1) * Math.sin(c.t * 1.3);
  S(O, B.shL, 0.85, 0, 0.12); S(O, B.elL, 1.4, 0, 0); S(O, B.haL, -0.25, 0, 0.35);
  S(O, B.shR, 0.68 + 0.04 * d, 0, -0.06); S(O, B.elR, 1.55 + 0.08 * d, 0, 0); S(O, B.haR, 0.25 + 0.15 * d, 0.1 * Math.sin(c.t * 5.3), 0);
}

export function layerRod(O, c) {
  const tw = Math.sin(c.t * 0.9) * 0.03 + Math.sin(c.t * 4.7) * 0.01;
  S(O, B.shR, 0.85 + tw, 0, 0.1); S(O, B.elR, 0.55, 0, 0); S(O, B.haR, -0.1, 0, 0);
  S(O, B.shL, 0.75 + tw, 0, 0.3); S(O, B.elL, 0.95, 0, 0); S(O, B.haL, 0, 0, 0.2);
}

// Additive talk gestures (scaled by amount).
export function addTalk(P, c, a, freeRight, freeLeft) {
  if (a <= 0.001) return;
  const t = c.t;
  const g1 = Math.sin(t * 2.3) * Math.sin(t * 0.7 + 1);
  const g2 = Math.sin(t * 1.9 + 2) * Math.sin(t * 0.53);
  const g3 = Math.sin(t * 2.7 + 4) * Math.sin(t * 0.61 + 2);
  if (freeLeft) {
    A(P, B.shL, a * (0.3 + 0.28 * g1), 0, a * 0.1 * g2);
    A(P, B.elL, a * (0.75 + 0.45 * g2), 0, 0);
    A(P, B.haL, a * 0.25 * g3, a * 0.3, 0);
  }
  if (freeRight) {
    A(P, B.shR, a * (0.25 + 0.25 * g3), 0, -a * 0.1 * g1);
    A(P, B.elR, a * (0.65 + 0.4 * g1), 0, 0);
    A(P, B.haR, a * 0.25 * g2, -a * 0.3, 0);
  }
  A(P, B.head, a * 0.07 * Math.sin(t * 5.1) * Math.abs(Math.sin(t * 0.9)), a * 0.1 * Math.sin(t * 0.6), a * 0.04 * g3);
  A(P, B.chest, 0, a * 0.06 * Math.sin(t * 0.8), 0);
}

// Landing squash (k 0..1).
export function addImpact(P, k) {
  if (k <= 0.001) return;
  P[OFF + 1] -= 0.17 * k;
  A(P, B.thL, 0.5 * k, 0, 0); A(P, B.thR, 0.5 * k, 0, 0);
  A(P, B.knL, -1.0 * k, 0, 0); A(P, B.knR, -1.0 * k, 0, 0);
  A(P, B.ftL, 0.5 * k, 0, 0); A(P, B.ftR, 0.5 * k, 0, 0);
  A(P, B.spine, -0.32 * k, 0, 0);
  A(P, B.head, 0.2 * k, 0, 0);
  A(P, B.shL, 0.25 * k, 0, -0.3 * k); A(P, B.shR, 0.25 * k, 0, 0.3 * k);
}

// Hurt flinch (k 0..1).
export function addHurt(P, k) {
  if (k <= 0.001) return;
  A(P, B.spine, 0.28 * k, 0.15 * k, 0);
  A(P, B.chest, 0.1 * k, 0.1 * k, 0);
  A(P, B.head, -0.25 * k, -0.2 * k, 0.1 * k);
  A(P, B.shL, 0.7 * k, 0, -0.2 * k); A(P, B.elL, 1.0 * k, 0, 0);
  P[OFF + 2] += 0.06 * k;
}
