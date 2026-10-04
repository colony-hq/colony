// Perahu jukung (outrigger canoe): reusable static builder + the animated intro/moored boat.
// Owner: setdressing. Built facing local -z (bow), origin at the waterline centre.

import * as THREE from 'three';
import { surfaceGeo, tubeGeo, atlasQuad } from './props-kit.js';
import { COL, netPile } from './props-common.js';
import { LANDMARKS } from './heightfield.js';

const L = 6.6; // hull length
const HB = 0.42; // max half beam
export const JUKUNG_SEAT = new THREE.Vector3(0, -0.12, 1.15); // floorboards behind the mast
export const OUTRIGGER = 1.6;

const halfBeam = (s) => HB * Math.pow(Math.max(0, Math.sin(Math.PI * s)), 0.55);
const gunwale = (s) => 0.4 + 0.58 * Math.pow(1 - s, 9) + 0.32 * Math.pow(s, 8);
const keel = (s) => 0.22 + (-0.32 - 0.22) * Math.pow(Math.max(0, Math.sin(Math.PI * s)), 0.45);
const zAt = (s) => -L / 2 + L * s;

// Paint bands by local height (outer hull).
function hullPaint(x, y, z, nx, ny, nz, c) {
  if (y < -0.06) c.setRGB(0.05, 0.07, 0.12);
  else if (y < 0.03) c.setRGB(0.55, 0.08, 0.06);
  else if (y < 0.25) c.setRGB(0.86, 0.84, 0.78);
  else if (y < 0.29) c.setRGB(0.1, 0.38, 0.22);
  else if (y < 0.35) c.setRGB(0.88, 0.86, 0.8);
  else if (y < 0.42) c.setRGB(0.85, 0.55, 0.08);
  else c.setRGB(0.12, 0.28, 0.55);
}

export function buildJukung(b, { sail = true, wreck = false } = {}) {
  // Outer hull: phi across (-pi/2 port gunwale .. 0 keel .. +pi/2 starboard gunwale), s along.
  const outer = surfaceGeo(14, 30, (u, v) => {
    const s = v, phi = (u - 0.5) * Math.PI;
    const hb = halfBeam(s), yg = gunwale(s), yk = keel(s);
    return [hb * Math.sin(phi), yg - (yg - yk) * Math.pow(Math.cos(phi), 1.3), zAt(s)];
  });
  b.add('wood', outer, {}, { vc: wreck ? null : hullPaint, color: wreck ? 0x6a5a48 : 0xffffff, jitter: 0.04 });
  // Inner hull (unpainted, slightly inset), facing inward.
  const inner = surfaceGeo(10, 26, (u, v) => {
    const s = 0.02 + v * 0.96, phi = (u - 0.5) * Math.PI;
    const hb = halfBeam(s) * 0.9, yg = gunwale(s) - 0.01, yk = keel(s) + 0.05;
    return [hb * Math.sin(phi), yg - (yg - yk) * Math.pow(Math.cos(phi), 1.3), zAt(s)];
  }, { flip: true });
  b.add('wood', inner, {}, { color: 0x8a6a4a, jitter: 0.05, ao: [-0.3, 0.35, 0.45] });
  // Gunwale rails.
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const s = 0.015 + (i / 16) * 0.97; pts.push(new THREE.Vector3(side * halfBeam(s), gunwale(s) + 0.01, zAt(s))); }
    b.add('wood', tubeGeo(pts, 0.025, 4, 32), {}, { color: 0x1d3a6a });
  }
  // Bow beak (swordfish nose) and stern post.
  b.rod('wood', [0, gunwale(0.01) - 0.05, zAt(0.01)], [0, 1.02, -L / 2 - 0.55], 0.035, { rt: 0.008, color: 0x1d3a6a });
  b.rod('wood', [0, gunwale(0.99) - 0.03, zAt(0.99)], [0, 0.85, L / 2 + 0.25], 0.03, { rt: 0.01, color: 0x1d3a6a });
  // Floorboards + thwarts.
  b.box('wood', { x: 0, y0: -0.16, z: 0.6, w: 0.42, h: 0.03, d: 3.6, grain: 'z', color: 0x9a7650 });
  for (const z of [-0.6, 0.55, 1.9]) {
    const s = (z + L / 2) / L;
    b.box('wood', { x: 0, y0: gunwale(s) - 0.1, z, w: halfBeam(s) * 2 + 0.02, h: 0.04, d: 0.2, grain: 'x', color: 0x7a5636 });
  }
  // Eyes on both sides of the bow.
  const eyeReg = b.kit.textures.decal.regions.eye;
  if (!wreck) {
    const s = 0.11, z = zAt(s);
    const hb = halfBeam(s);
    const ds = 0.01;
    const slope = (halfBeam(s + ds) - halfBeam(s - ds)) / (2 * ds * L);
    const ang = Math.atan(slope);
    for (const side of [-1, 1]) {
      b.add('decal', atlasQuad(0.3, 0.3, eyeReg), { x: side * (hb + 0.012), y: 0.3, z, yaw: side * (Math.PI / 2 - ang) }, { color: 0xffffff, jitter: 0 });
    }
  }
  // Outrigger booms + floats.
  for (const zb of [-1.1, 1.05]) {
    const pts = [[-OUTRIGGER, 0.14], [-1.35, 0.4], [-0.9, 0.58], [0, 0.64], [0.9, 0.58], [1.35, 0.4], [OUTRIGGER, 0.14]].map(([x, y]) => new THREE.Vector3(x, y, zb));
    b.add('bamboo', tubeGeo(pts, 0.04, 6, 24), {}, { color: 0xc8b07a });
    for (const side of [-1, 1]) {
      b.rod('rope', [side * halfBeam(0.5) * 0.95, 0.42, zb - 0.06], [side * halfBeam(0.5) * 0.95, 0.42, zb + 0.06], 0.05, { color: COL.rope, seg: 5 });
      b.rod('bamboo', [side * OUTRIGGER, 0.05, zb], [side * OUTRIGGER, 0.18, zb], 0.025, { color: 0x6a5030 });
    }
  }
  for (const side of [-1, 1]) {
    const pts = [[-2.25, 0.22], [-1.9, 0.07], [-1.2, 0.03], [0, 0.03], [1.2, 0.03], [1.9, 0.07], [2.2, 0.18]].map(([z, y]) => new THREE.Vector3(side * OUTRIGGER, y, z));
    b.add('bamboo', tubeGeo(pts, 0.07, 7, 24), {}, { color: wreck ? 0x8a7a5a : 0xd2bb80 });
  }
  if (wreck || !sail) return;
  // Mast, spars and furled-sail ready lashing points.
  b.cyl('bamboo', { x: 0, y0: -0.15, z: -0.6, r: 0.05, rt: 0.035, h: 3.8, seg: 6, color: 0xc8b07a });
  b.rope('rope', [0, 3.6, -0.6], [0, 0.95, -L / 2 - 0.4], 0.12, 0.008, { color: COL.rope });
  b.rope('rope', [0, 3.6, -0.6], [0, 0.6, L / 2], 0.15, 0.008, { color: COL.rope });
  // Steering oar on the starboard quarter.
  b.rod('wood', [0.35, 0.75, 2.6], [0.45, -0.35, 3.3], 0.03, { color: COL.woodDark });
  b.box('wood', { x: 0.47, y: -0.32, z: 3.34, w: 0.04, h: 0.45, d: 0.18, pitch: -0.9, color: COL.woodDark });
  netPile(b, 0, -0.14, 2.3, 0.45);
}

// Lateen sail (crab-claw): triangle between two spars, slight billow, into its own builder.
function buildSail(b, open = true) {
  const A = new THREE.Vector3(0, 0.62, -2.15);
  const B = new THREE.Vector3(0.0, 4.3, 0.35);
  const C = new THREE.Vector3(0, 0.88, 1.65);
  b.rod('bamboo', A.toArray(), B.clone().add(new THREE.Vector3(0, 0.15, 0.1)).toArray(), 0.035, { color: 0xc8b07a, rt: 0.025 });
  b.rod('bamboo', A.toArray(), C.clone().add(new THREE.Vector3(0, 0, 0.15)).toArray(), 0.035, { color: 0xc8b07a, rt: 0.025 });
  if (!open) {
    b.rod('cloth', A.toArray(), C.toArray(), 0.09, { color: 0xffffff });
    return;
  }
  const reg = { u0: 1 / 3, u1: 2 / 3, v0: 0, v1: 0.5 };
  const g = surfaceGeo(8, 10, (u, v) => {
    // v from the lower spar (A-C) toward the upper spar (A-B); u from the tack (A) outward.
    const p1 = A.clone().lerp(C, u), p2 = A.clone().lerp(B, u);
    const p = p1.lerp(p2, v);
    p.x += 0.32 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    return [p.x, p.y, p.z];
  });
  const uv = g.attributes.uv, P = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const iu = (i % 9) / 8, iv = Math.floor(i / 9) / 10;
    uv.setXY(i, reg.u0 + (reg.u1 - reg.u0) * iu, reg.v0 + (reg.v1 - reg.v0) * iv);
  }
  b.add('cloth', g, {}, {
    color: 0xffffff, jitter: 0,
    sway: (x, y, z) => {
      const p = new THREE.Vector3(x, y, z);
      const dA = p.distanceTo(A) / 4.4;
      return 0.25 * Math.min(1, dA) * Math.min(1, Math.abs(x) * 6 + 0.2);
    },
  });
  void P;
}

// The animated boat: { object, setPose(x, z, yaw), manual, setSail(open), seat, update }.
export function createBoat(kit, api) {
  const ctx = kit.ctx;
  const root = new THREE.Group();
  root.name = 'perahu-jukung';
  const bob = new THREE.Group();
  root.add(bob);
  const hb = kit.builder('boat');
  buildJukung(hb);
  hb.build(bob);
  const sb = kit.builder('boat-sail');
  buildSail(sb, true);
  const sailOpen = sb.build(bob);
  const fb = kit.builder('boat-sail-furled');
  buildSail(fb, false);
  const sailFurled = fb.build(bob);
  sailFurled.visible = false;
  ctx.scene.add(root);

  const seat = new THREE.Vector3();
  api.anchors['boat:seat'] = seat;
  let collider = null;
  let colPose = null;
  const pose = { x: 0, z: 0, yaw: 0 };
  const w = { y: 0, pitch: 0, roll: 0 };

  function placeCollider() {
    if (colPose && Math.hypot(colPose.x - pose.x, colPose.z - pose.z) < 0.4 && Math.abs(colPose.yaw - pose.yaw) < 0.05) return;
    if (collider) ctx.collision.remove(collider);
    collider = ctx.collision.addBox({ x: pose.x, y: -2.0, z: pose.z, w: 0.7, h: 1.85, d: 4.6, yaw: pose.yaw, surface: 'wood', solid: false, tag: 'boat' });
    colPose = { ...pose };
  }

  const boat = {
    object: root,
    manual: false,
    seatLocal: JUKUNG_SEAT.clone(),
    seat,
    setPose(x, z, yaw = pose.yaw) {
      pose.x = x; pose.z = z; pose.yaw = yaw;
      root.position.set(x, 0, z);
      root.rotation.set(0, yaw, 0);
      placeCollider();
      boat.updateSeat();
    },
    setSail(open) { sailOpen.visible = !!open; sailFurled.visible = !open; },
    updateSeat() {
      root.updateMatrixWorld(true);
      seat.copy(boat.seatLocal);
      bob.localToWorld(seat);
    },
    update(dt, t) {
      if (!boat.manual) {
        const wave = ctx.ocean?.waveHeight;
        const sy = Math.sin(pose.yaw), cy = Math.cos(pose.yaw);
        let h = 0, pitch = 0, roll = 0;
        if (typeof wave === 'function') {
          const fx = -sy * 2.6, fz = -cy * 2.6; // bow offset
          const rx = cy * 1.4, rz = -sy * 1.4; // starboard offset
          const hc = wave(pose.x, pose.z, t) || 0;
          const hf = wave(pose.x + fx, pose.z + fz, t) || 0;
          const hs = wave(pose.x - fx, pose.z - fz, t) || 0;
          const hr = wave(pose.x + rx, pose.z + rz, t) || 0;
          const hl = wave(pose.x - rx, pose.z - rz, t) || 0;
          h = (hc * 2 + hf + hs) / 4;
          pitch = Math.atan2(hf - hs, 5.2);
          roll = -Math.atan2(hr - hl, 2.8);
        }
        // Idle life even on a flat sea.
        h += Math.sin(t * 1.3) * 0.03 + Math.sin(t * 0.7 + 1) * 0.02;
        pitch += Math.sin(t * 0.9) * 0.012;
        roll += Math.sin(t * 1.1 + 0.5) * 0.025;
        const k = 1 - Math.exp(-dt * 6);
        w.y += (h - w.y) * k; w.pitch += (pitch - w.pitch) * k; w.roll += (roll - w.roll) * k;
        bob.position.y = w.y;
        bob.rotation.set(w.pitch, 0, w.roll);
      }
      boat.updateSeat();
    },
  };
  const M = LANDMARKS.boatMoor;
  boat.setPose(M.x, M.z, M.yaw);
  return boat;
}
