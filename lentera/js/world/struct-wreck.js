// Kapal karam: a pinisi-style wooden schooner aground, rolled by `tilt`, bow toward the beach.
// Walkable stepped deck colliders, plank ramp out of the water, stern cabin with Api Samudra's
// table. Owner: setdressing. Hull built in a local frame facing -z (bow).

import * as THREE from 'three';
import { LANDMARKS, heightAt } from './heightfield.js';
import { surfaceGeo, orient, tubeGeo, makeMatrix } from './props-kit.js';
import { COL, ropeCoil, barrel, crate } from './props-common.js';

const LEN = 26, HB = 3.5;
const PITCH = 0.035; // bow up
const ZB = -LEN / 2, ZS = LEN / 2;

// Hull shape along s in [0, 1] (bow -> stern).
const halfBeam = (s) => {
  const bow = Math.pow(Math.sin((Math.PI / 2) * Math.min(1, s / 0.42)), 0.75);
  const stern = s > 0.72 ? 1 - 0.38 * Math.pow((s - 0.72) / 0.28, 1.6) : 1;
  return Math.max(0.04, HB * bow * stern);
};
const sheer = (s) => 1.25 * Math.pow(1 - s, 3) + 0.55 * Math.pow(s, 4); // deck line above the reference
const keel = (s) => -4.9 + 3.2 * Math.pow(1 - s, 5) + 1.8 * Math.pow(s, 6);
const zAt = (s) => ZB + LEN * s;
const secExp = (s) => 1.5 + 2.2 * Math.pow(1 - s, 4); // V-shaped sections toward the bow
const sAt = (z) => (z - ZB) / LEN;

export function buildWreck(kit, api, scene) {
  const W = LANDMARKS.kapalKaram;
  const roll = -W.tilt; // starboard (+x) side lower
  const b = kit.builder('kapal-karam');
  // Choose the reference height so the cabin floor (deck under the cabin table) sits at deckY.
  const cab = toLocal(W, W.cabin.x, W.cabin.z);
  const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(PITCH, 0, roll, 'YXZ'));
  const tmp = new THREE.Vector3(cab.x, sheer(sAt(cab.z)), cab.z).applyMatrix4(R);
  const HY = W.deckY - tmp.y;
  const deckWorldY = (lx, lz) => new THREE.Vector3(lx, sheer(sAt(lz)), lz).applyMatrix4(R).y + HY;

  b.push({ x: W.x, y: HY, z: W.z, yaw: W.yaw });
  b.push({ pitch: PITCH, roll });

  const weather = (x, y, z, nx, ny, nz, c) => {
    // World-ish height: algae below the waterline, salt crust just above it.
    const wy = y; // frames carry world coords after transform
    if (wy < 0.25) c.lerp(new THREE.Color(0.14, 0.2, 0.13), Math.min(1, (0.25 - wy) / 0.8) * 0.85);
    else if (wy < 0.7) c.lerp(new THREE.Color(0.72, 0.72, 0.66), 0.25 * (1 - (wy - 0.25) / 0.45));
  };

  // ---- Hull (outer planking) with a few missing strakes + inner face. ----------------------
  const hull = surfaceGeo(16, 40, (u, v) => {
    const s = v, phi = (u - 0.5) * Math.PI;
    const hb = halfBeam(s), ys = sheer(s), yk = keel(s);
    return [hb * Math.sin(phi), ys - (ys - yk) * Math.pow(Math.cos(phi), secExp(s)), zAt(s)];
  });
  orient(hull, [0, -1, 0]);
  // Stem post rising from the forefoot to the bowsprit.
  b.add('wood', tubeGeo([new THREE.Vector3(0, keel(0.02) + 0.4, zAt(0.02)), new THREE.Vector3(0, sheer(0) - 0.4, zAt(0) - 0.25), new THREE.Vector3(0, sheer(0) + 0.5, zAt(0) + 0.15), new THREE.Vector3(0, sheer(0) + 0.95, zAt(0) + 0.6)], 0.16, 6, 12), {}, { color: 0x4a3a2c, vc: weather });
  b.add('wood', hull, {}, {
    color: 0x6e5a46, jitter: 0.03,
    vc: weather,
  });
  // Transom closing the stern.
  {
    const ys = sheer(1), yk = keel(1), hb = halfBeam(1);
    const tr = surfaceGeo(14, 1, (u, v) => {
      const phi = (u - 0.5) * Math.PI;
      const px = hb * Math.sin(phi), py = ys - (ys - yk) * Math.pow(Math.cos(phi), secExp(1));
      return [px * (1 - v), py + (ys - py) * v, ZS];
    });
    orient(tr, [0, 0, 1]);
    b.add('wood', tr, {}, { color: 0x5a4a3a, jitter: 0.03, vc: weather });
  }
  // Faded paint strips along the sheer (white + blue).
  for (const side of [-1, 1]) {
    for (const [off, col] of [[0.18, 0xb8b4a6], [0.34, 0x46607a]]) {
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const s = 0.04 + (i / 20) * 0.92;
        const hb = halfBeam(s);
        pts.push(new THREE.Vector3(side * (hb + 0.02), sheer(s) - off, zAt(s)));
      }
      b.add('paint', tubeGeo(pts, 0.06, 4, 40), {}, { color: col, jitter: 0.1 });
    }
  }
  // Deck planking (follows the sheer), with an open hatch frame.
  const deck = surfaceGeo(10, 40, (u, v) => {
    const s = 0.015 + v * 0.985;
    const hb = halfBeam(s) * 0.96;
    return [(u - 0.5) * 2 * hb, sheer(s) - 0.02, zAt(s)];
  });
  orient(deck, [0, 1, 0]);
  {
    // Plank banding across the deck.
    const P = deck.attributes.position;
    const col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const k = 0.85 + 0.15 * Math.sin(P.getX(i) * 13.0);
      col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k;
    }
    deck.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  b.add('wood', deck, {}, { color: 0x8a7a66, jitter: 0.02 });
  // Bulwarks (low side walls) with gaps where it broke and at the ramp.
  const gaps = [[-3.2, -0.6, 1], [3.0, 5.2, -1]]; // [z0, z1, side]
  for (const side of [-1, 1]) {
    for (let i = 0; i < 24; i++) {
      const s0 = 0.06 + (i / 24) * 0.9, s1 = 0.06 + ((i + 1) / 24) * 0.9;
      const z0 = zAt(s0), z1 = zAt(s1);
      if (gaps.some(([g0, g1, sd]) => sd === side && z1 > g0 && z0 < g1)) continue;
      const x0 = side * (halfBeam(s0) - 0.05), x1 = side * (halfBeam(s1) - 0.05);
      const y0 = sheer(s0), y1 = sheer(s1);
      const h = 0.75 + (i % 7 === 3 ? -0.35 : 0);
      b.bar('wood', [x0, y0 + h / 2, z0], [x1, y1 + h / 2, z1], 0.1, h, { color: 0x5c4a3a, vc: weather });
      b.bar('wood', [x0, y0 + h + 0.03, z0], [x1, y1 + h + 0.03, z1], 0.16, 0.07, { color: 0x6a5644 });
    }
  }
  // Sprung hull planks hanging loose on the port bow.
  for (let i = 0; i < 5; i++) {
    const s0 = 0.16 + i * 0.035, z0 = zAt(s0);
    const hb = halfBeam(s0);
    const y0 = sheer(s0) - 0.6 - i * 0.28;
    b.bar('wood', [-hb - 0.02, y0, z0], [-hb - 0.5 - i * 0.12, y0 - 0.9 - i * 0.2, z0 + 2.4], 0.07, 0.24, { color: 0x4a3a2c, vc: weather, up: [-1, 0, 0] });
  }
  // Hatch with a grate over it (walkable).
  {
    const z = 0.5, s = sAt(z), y = sheer(s);
    b.box('wood', { x: 0, y0: y - 0.02, z, w: 2.4, h: 0.3, d: 3.0, color: 0x4a3c30 });
    for (let i = 0; i < 7; i++) b.box('wood', { x: -1.05 + i * 0.35, y0: y + 0.28, z, w: 0.1, h: 0.06, d: 2.8, grain: 'z', color: 0x6a5644 });
    for (let i = 0; i < 8; i++) b.box('wood', { x: 0, y0: y + 0.27, z: z - 1.3 + i * 0.37, w: 2.3, h: 0.05, d: 0.08, grain: 'x', color: 0x5a4838 });
  }
  // Bowsprit, broken masts, fallen boom, rigging and torn sail.
  const bowS = 0.02;
  b.rod('wood', [0, sheer(bowS) + 0.2, zAt(bowS) + 1.2], [0, sheer(bowS) + 2.6, zAt(bowS) - 5.2], 0.16, { rt: 0.08, color: 0x4a3a2c });
  const mastA = { z: -6.5, h: 11.5 }, mastB = { z: 2.8, h: 6.2 };
  {
    const y = sheer(sAt(mastA.z));
    // Foremast leaning to port, intact to 11.5 m with a cross yard and a torn sail.
    b.within({ x: 0, y, z: mastA.z, roll: 0.22, pitch: -0.06 }, () => {
      b.cyl('wood', { x: 0, y0: -0.4, z: 0, r: 0.24, rt: 0.15, h: mastA.h, seg: 9, color: 0x4f4032 });
      b.rod('wood', [-3.6, mastA.h - 1.6, 0.1], [3.2, mastA.h - 2.3, 0.1], 0.09, { color: 0x4a3a2c });
      b.cyl('wood', { x: 0, y0: mastA.h - 0.2, z: 0, r: 0.15, rt: 0.02, h: 0.6, seg: 6, color: 0x3a2e24 }); // splintered top
      // Torn sail: still lashed to the port half of the yard, the rest fallen and drooping.
      const reg = { u0: 2 / 3, u1: 1, v0: 0, v1: 0.5 };
      const g = surfaceGeo(6, 7, (u, v) => {
        const x = -3.3 + u * 3.9;
        const top = mastA.h - 1.62 - (x + 3.3) * 0.1;
        const len = 2.2 + u * 2.6;
        return [x + Math.sin(v * 2.4 + u * 3) * 0.25 + v * u * 0.8, top - v * len, 0.22 + Math.sin(u * Math.PI) * 0.45 * v + v * v * 0.3];
      });
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) { const iu = (k % 7) / 6, iv = Math.floor(k / 7) / 7; uv.setXY(k, reg.u0 + (reg.u1 - reg.u0) * iu, reg.v1 - (reg.v1 - reg.v0) * iv); }
      b.add('cloth', g, {}, { color: 0xb8ae9a, jitter: 0, sway: (px, py) => Math.min(1, Math.max(0, (mastA.h - 1.7 - py) / 4.0)) * 0.8 });
      // A rag still caught on the starboard yard arm.
      const g2 = surfaceGeo(3, 4, (u, v) => [1.4 + u * 1.5, mastA.h - 2.05 - u * 0.15 - v * (0.9 + u * 0.6), 0.2 + v * 0.2]);
      const uv2 = g2.attributes.uv;
      for (let k = 0; k < uv2.count; k++) { const iu = (k % 4) / 3, iv = Math.floor(k / 4) / 4; uv2.setXY(k, reg.u0 + (reg.u1 - reg.u0) * (0.5 + iu * 0.5), reg.v1 - (reg.v1 - reg.v0) * (0.4 + iv * 0.6)); }
      b.add('cloth', g2, {}, { color: 0xb8ae9a, jitter: 0, sway: (px, py) => Math.min(1, Math.max(0, (mastA.h - 2.05 - py) / 1.2)) });
    });
    const y2 = sheer(sAt(mastB.z));
    // Mainmast snapped at 6 m; the top section lies across the deck and over the side.
    b.cyl('wood', { x: 0, y0: y2 - 0.4, z: mastB.z, r: 0.28, rt: 0.22, h: mastB.h, seg: 9, color: 0x4f4032 });
    for (let k = 0; k < 5; k++) b.add('wood', new THREE.ConeGeometry(0.07, 0.5 + k * 0.1, 4), { x: Math.cos(k * 1.3) * 0.14, y: y2 + mastB.h - 0.2 + 0.2, z: mastB.z + Math.sin(k * 1.3) * 0.14, roll: Math.cos(k) * 0.2 }, { color: 0x3a2e24 });
    b.rod('wood', [0.2, y2 + 0.5, mastB.z + 1.2], [4.8, y2 - 0.7, mastB.z + 7.5], 0.22, { rt: 0.16, color: 0x4f4032 });
    b.rod('wood', [-2.6, y2 + 0.35, mastB.z - 2.5], [2.5, y2 + 0.45, mastB.z + 1.6], 0.1, { color: 0x4a3a2c }); // boom
  }
  // Rigging: shrouds from mast tops to the bulwarks, some slack and broken.
  {
    const ya = sheer(sAt(mastA.z));
    const top = new THREE.Vector3(0, mastA.h - 0.6, 0).applyMatrix4(makeMatrix({ roll: 0.22, pitch: -0.06 })).add(new THREE.Vector3(0, ya, mastA.z));
    for (const [side, dz] of [[-1, -1.5], [-1, 1.2], [1, -1.2], [1, 1.6]]) {
      const s = sAt(mastA.z + dz);
      b.rope('rope', top.toArray(), [side * (halfBeam(s) - 0.05), sheer(s) + 0.8, mastA.z + dz], 0.3, 0.025, { color: 0x5a4a38 });
    }
    b.rope('rope', top.toArray(), [0, sheer(bowS) + 2.5, zAt(bowS) - 4.8], 0.6, 0.025, { color: 0x5a4a38 });
    b.rope('rope', [0.1, sheer(sAt(mastB.z)) + mastB.h - 0.6, mastB.z], [1.8, -0.2, mastB.z + 2.0], 1.4, 0.025, { color: 0x5a4a38 });
    b.rope('rope', [0, sheer(sAt(mastB.z)) + mastB.h - 0.8, mastB.z], [-2.8, sheer(sAt(mastB.z + 1.5)) + 0.2, mastB.z + 1.5], 0.9, 0.025, { color: 0x5a4a38 });
  }
  // Deck clutter: capstan, barrels, crates, coiled rope.
  {
    const zc = -9.5, y = sheer(sAt(zc));
    b.cyl('wood', { x: 0, y0: y, z: zc, r: 0.35, rt: 0.3, h: 0.8, seg: 10, color: 0x4a3a2c });
    for (let k = 0; k < 4; k++) b.rod('wood', [0, y + 0.65, zc], [Math.cos(k * 1.57) * 0.9, y + 0.7, zc + Math.sin(k * 1.57) * 0.9], 0.04, { color: 0x3a2e24 });
  }
  barrel(b, -1.8, sheer(sAt(-2.0)), -2.0, 1.0, 1.4, 0.3, 0x5a4636);
  barrel(b, 1.2, sheer(sAt(6.2)) , 6.2, 0.9, 0, 0, 0x5a4636);
  crate(b, -2.0, sheer(sAt(4.5)), 4.5, 0.7, 0.4, 0x6a5644);
  ropeCoil(b, 1.6, sheer(sAt(-4.5)), -4.5, 0.4);

  // ---- Stern cabin (Api Samudra). Floor = deck; table at the landmark. -----------------------
  const cz0 = 6.6, cz1 = 11.6, cw = 2.3;
  {
    const yb = (z) => sheer(sAt(z));
    const yc = yb((cz0 + cz1) / 2);
    const H = 2.25;
    const wall = (x, z, w, d, h = H, color = 0x5c4a3a) => b.box('wood', { x, y0: yc - 0.1, z, w, h: h + 0.1, d, color, jitter: 0.06 });
    wall(-cw, (cz0 + cz1) / 2, 0.12, cz1 - cz0);
    wall(cw, (cz0 + cz1) / 2, 0.12, cz1 - cz0);
    wall(0, cz1, cw * 2, 0.12);
    wall(-cw / 2 - 0.55, cz0, cw - 1.1, 0.12);
    wall(cw / 2 + 0.55, cz0, cw - 1.1, 0.12);
    wall(0, cz0, 1.1, 0.12, 0.45);
    b.box('wood', { x: 0, y0: yc + 1.9, z: cz0, w: 1.1, h: 0.35, d: 0.12, color: 0x5c4a3a });
    // Windows (dark) on the sides and the stern.
    for (const sx of [-1, 1]) for (const z of [8.0, 10.2]) b.box('wood', { x: sx * (cw + 0.02), y: yc + 1.25, z, w: 0.04, h: 0.5, d: 0.7, color: 0x0c0a08 });
    for (const x of [-1.2, 1.2]) b.box('wood', { x, y: yc + 1.25, z: cz1 + 0.07, w: 0.7, h: 0.5, d: 0.04, color: 0x0c0a08 });
    // Roof with overhang, carved stern board.
    b.box('wood', { x: 0, y0: yc + H, z: (cz0 + cz1) / 2 + 0.1, w: cw * 2 + 0.6, h: 0.14, d: cz1 - cz0 + 1.0, roll: 0.0, color: 0x4a3c30 });
    b.box('wood', { x: 0, y0: yc + H + 0.14, z: cz1 + 0.5, w: cw * 2 + 0.2, h: 0.55, d: 0.12, color: 0x3e5a6e });
    // Low table + stools + spilled things inside.
    const tl = toLocal(W, W.cabin.x, W.cabin.z);
    const ty = yb(tl.z);
    b.box('wood', { x: tl.x, y0: ty + 0.32, z: tl.z, w: 1.0, h: 0.06, d: 0.7, color: 0x6a5240 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('wood', { x: tl.x + sx * 0.42, y0: ty, z: tl.z + sz * 0.27, w: 0.07, h: 0.32, d: 0.07, color: 0x4a3a2c });
    b.cyl('wood', { x: tl.x - 0.9, y0: ty, z: tl.z + 0.6, r: 0.18, h: 0.38, seg: 8, color: 0x5a4838 });
    b.add('metal', new THREE.CylinderGeometry(0.06, 0.08, 0.16, 8), { x: tl.x + 0.3, y: ty + 0.46, z: tl.z - 0.15 }, { color: 0x6a6050 });
    b.add('paint', new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8), { x: tl.x - 0.25, y: ty + 0.45, z: tl.z + 0.18, roll: Math.PI / 2 - 0.1 }, { color: 0x2a5a4a });
    // Rolled chart.
    b.add('paint', new THREE.CylinderGeometry(0.045, 0.045, 0.6, 8), { x: tl.x, y: ty + 0.41, z: tl.z + 0.12, roll: Math.PI / 2, yaw: 0.4 }, { color: 0xd8c8a0 });
    api.anchors['wreck:table'] = b.world(tl.x, ty + 0.38, tl.z);
  }

  b.pop();
  // ---- Colliders (yaw frame): stepped deck cells, bulwarks, cabin walls, masts. -------------
  const cells = [];
  for (let z = ZB + 1.5; z < ZS - 0.4; z += 1.6) {
    const s = sAt(z + 0.8);
    const hb = halfBeam(s) - 0.15;
    const n = Math.max(1, Math.round((hb * 2) / 1.3));
    for (let i = 0; i < n; i++) {
      const x = -hb + ((i + 0.5) * hb * 2) / n;
      const top = deckWorldY(x, z + 0.8) - HY;
      cells.push([x, z + 0.8, (hb * 2) / n, top]);
    }
  }
  for (const [x, z, w, top] of cells) b.collBox({ x, y: top - 1.2, z, w: w + 0.04, h: 1.2, d: 1.62, surface: 'wood', tag: 'wreck-deck' });
  for (const side of [-1, 1]) {
    for (let z = ZB + 2; z < ZS - 1; z += 2) {
      if (gaps.some(([g0, g1, sd]) => sd === side && z + 2 > g0 && z < g1)) continue;
      const s = sAt(z + 1);
      const x = side * (halfBeam(s) - 0.05);
      const top = deckWorldY(x, z + 1) - HY;
      b.collBox({ x, y: top - 0.2, z: z + 1, w: 0.25, h: 1.0, d: 2.05, surface: 'wood', walkable: false, tag: 'wreck-rail' });
    }
  }
  // Hull sides below the deck (so swimmers bump the hull instead of passing through).
  for (let z = ZB + 1; z < ZS; z += 2) {
    const s = sAt(z + 1);
    const hb = halfBeam(s);
    const bottom = -2.8 - HY, top = deckWorldY(0, z + 1) - HY - 1.25;
    b.collBox({ x: 0, y: bottom, z: z + 1, w: hb * 2, h: top - bottom, d: 2.05, surface: 'wood', walkable: false, tag: 'wreck-hull' });
  }
  {
    const yc = deckWorldY(0, (cz0 + cz1) / 2) - HY;
    for (const [x, z, w, d] of [[-cw, (cz0 + cz1) / 2, 0.2, cz1 - cz0], [cw, (cz0 + cz1) / 2, 0.2, cz1 - cz0], [0, cz1, cw * 2, 0.2], [-cw / 2 - 0.55, cz0, cw - 1.1, 0.2], [cw / 2 + 0.55, cz0, cw - 1.1, 0.2]]) {
      b.collBox({ x, y: yc - 0.3, z, w, h: 2.6, d, surface: 'wood', walkable: false, tag: 'wreck-cabin' });
    }
    b.collBox({ x: 0, y: yc + 2.25, z: (cz0 + cz1) / 2 + 0.1, w: cw * 2 + 0.6, h: 0.2, d: cz1 - cz0 + 1.0, surface: 'wood', tag: 'wreck-cabin-roof' });
    const tl = toLocal(W, W.cabin.x, W.cabin.z);
    b.collBox({ x: tl.x, y: deckWorldY(tl.x, tl.z) - HY, z: tl.z, w: 1.0, h: 0.38, d: 0.7, surface: 'wood', tag: 'wreck-table' });
  }
  b.collCyl({ x: 0, y: -1, z: mastB.z, r: 0.32, h: 8, surface: 'wood', walkable: false });
  b.collCyl({ x: -0.6, y: -1, z: mastA.z, r: 0.3, h: 6, surface: 'wood', walkable: false });

  // ---- Ramp: planks from the broken starboard bulwark down into the water (low end ~ -0.5). ---
  {
    const zr = -1.9;
    const xTop = halfBeam(sAt(zr)) - 0.1;
    const yTop = deckWorldY(xTop, zr) - HY;
    const yLow = -0.55 - HY;
    const run = 4.6;
    const n = Math.ceil((yTop - yLow) / 0.38);
    // Visual: two long planks with cleats, resting on a fallen crate.
    for (const dz of [-0.35, 0.35]) b.bar('wood', [xTop + 0.1, yTop - 0.04, zr + dz], [xTop + run + 0.2, yLow - 0.06, zr + dz], 0.6, 0.08, { color: 0x7a6650, up: [0, 1, 0] });
    for (let i = 1; i < n; i++) {
      const t = i / n;
      b.bar('wood', [xTop + run * t + 0.1, yTop + (yLow - yTop) * t + 0.01, zr - 0.7], [xTop + run * t + 0.1, yTop + (yLow - yTop) * t + 0.01, zr + 0.7], 0.08, 0.06, { color: 0x5a4838 });
    }
    b.box('wood', { x: xTop + run * 0.55, y: yTop + (yLow - yTop) * 0.55 - 0.6, z: zr, w: 0.8, h: 0.8, d: 0.9, yaw: 0.3, roll: 0.2, color: 0x5a4838, vc: weather });
    // Colliders: steps climbing toward the hull (local -x), each rise <= 0.38. They continue
    // under water past the visible planks so a swimmer (feet ~ -1.1) can step onto the foot.
    const yFoot = -1.25 - HY;
    const runC = run * (yTop - yFoot) / (yTop - yLow);
    b.within({ x: xTop + runC, y: 0, z: zr, yaw: Math.PI / 2 }, () => {
      b.collStairs({ x: 0, z0: 0, y0: yFoot, y1: yTop, run: runC, w: 1.4, maxRise: 0.38, base: -3.4 - HY, surface: 'wood', tag: 'wreck-ramp' });
    });
    api.anchors['wreck:ramp'] = b.world(xTop + run, yLow + HY, zr);
  }
  b.pop();

  // Debris floating / beached around the wreck.
  const deb = [[-196, 141, 0.4], [-192, 137.5, 1.1], [-188, 134, 2.2], [-205, 165, 0.8], [-230, 142, 2.6]];
  for (const [x, z, yaw] of deb) b.box('wood', { x, y: Math.max(heightAt(x, z), -0.05) + 0.05, z, w: 2.2, h: 0.08, d: 0.3, yaw, color: 0x6a5644, vc: weather });
  barrel(b, -185.5, heightAt(-185.5, 136.4) - 0.1, 136.4, 1.0, 1.45, 0.8, 0x5a4636);
  crate(b, -183.4, heightAt(-183.4, 133.2) - 0.1, 133.2, 0.7, 0.5, 0x5a4838);

  const group = b.build(scene);
  api.anchors['flame:samudra'] = new THREE.Vector3(W.flame.x, W.flame.y, W.flame.z);
  api.anchors['wreck:mast'] = new THREE.Vector3(W.x, HY + 10, W.z);
  return group;
}

// World (x, z) -> hull-local (x along beam, z along length; bow = -z).
function toLocal(W, x, z) {
  const dx = x - W.x, dz = z - W.z;
  const c = Math.cos(W.yaw), s = Math.sin(W.yaw);
  // Inverse of local->world rotation by yaw: world = (c*lx + s*lz, -s*lx + c*lz).
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}
