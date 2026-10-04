// Candi (Javanese Hindu-Buddhist temple): three terraces, recessed stairs on the south axis,
// shrine with stepped roof and ratna finials, sealed sliding door, relief panel, four pelita,
// candi bentar (split gate), fallen stones and the approach campfire. Owner: setdressing.

import * as THREE from 'three';
import { LANDMARKS, heightAt } from './heightfield.js';
import { atlasQuad, latheGeo, prismGeo } from './props-kit.js';
import { EMBER, ratna, campfirePit, canang } from './props-common.js';
import { easeInOut } from '../core/math.js';

const STONE = 0xc6c8bc;
const STONE_DARK = 0xa4a69a;
const BRICK = 0xc0805e;

export function buildCandi(kit, api, scene, updaters) {
  const L = LANDMARKS.candi;
  const cx = L.x, cz = L.z, Y0 = L.floor;
  const b = kit.builder('candi');
  const RR = kit.textures.relief.regions;
  const [T1, T2, T3] = L.terraces;
  const SH = L.shrine;
  const stairW = 3.0;
  const moss = (yBase) => (x, y, z, nx, ny, nz, c) => {
    // Damp moss near the base of every wall and on upward faces.
    const k = Math.max(0, 1 - (y - yBase) / 0.9) * 0.55 + (ny > 0.6 ? 0.18 : 0);
    if (k > 0) c.lerp(new THREE.Color(0.5, 0.58, 0.4), Math.min(0.45, k));
  };

  // ---- Box with an optional south notch (recessed stairs): emits up to 3 boxes. --------------
  // footprint [x0,x1]x[z0,z1], y range, notch {x0, x1, z} cut from z..z1 (south edge).
  const notchedBox = (mat, x0, x1, z0, z1, ya, yb, notch, o = {}) => {
    if (!notch) return b.box(mat, { x: (x0 + x1) / 2, y0: ya, z: (z0 + z1) / 2, w: x1 - x0, h: yb - ya, d: z1 - z0, ...o });
    b.box(mat, { x: (x0 + x1) / 2, y0: ya, z: (z0 + notch.z) / 2, w: x1 - x0, h: yb - ya, d: notch.z - z0, ...o });
    b.box(mat, { x: (x0 + notch.x0) / 2, y0: ya, z: (notch.z + z1) / 2, w: notch.x0 - x0, h: yb - ya, d: z1 - notch.z, ...o });
    b.box(mat, { x: (notch.x1 + x1) / 2, y0: ya, z: (notch.z + z1) / 2, w: x1 - notch.x1, h: yb - ya, d: z1 - notch.z, ...o });
  };
  const notchedColl = (x0, x1, z0, z1, ya, yb, notch) => {
    const add = (ax, bx, az, bz) => b.collBox({ x: (ax + bx) / 2, y: ya, z: (az + bz) / 2, w: bx - ax, h: yb - ya, d: bz - az, surface: 'stone', tag: 'candi' });
    if (!notch) return add(x0, x1, z0, z1);
    add(x0, x1, z0, notch.z);
    add(x0, notch.x0, notch.z, z1);
    add(notch.x1, x1, notch.z, z1);
  };

  // ---- Terraces ---------------------------------------------------------------------------------
  const levels = [
    { half: T1.half, ya: Y0, yb: T1.top, notch: null },
    { half: T2.half, ya: T1.top, yb: T2.top, notch: { x0: cx - stairW / 2, x1: cx + stairW / 2, z: cz + T2.half - 2.25 } },
    { half: T3.half, ya: T2.top, yb: T3.top, notch: { x0: cx - stairW / 2, x1: cx + stairW / 2, z: cz + T3.half - 2.25 } },
  ];
  for (const lv of levels) {
    const { half, ya, yb, notch } = lv;
    const x0 = cx - half, x1 = cx + half, z0 = cz - half, z1 = cz + half;
    notchedBox('stone', x0, x1, z0, z1, ya, yb, notch, { color: STONE, jitter: 0.05, vc: moss(ya) });
    // Mouldings: plinth, middle band and cornice protrude on the outer faces only.
    const band = (yA, yB, g, col) => {
      const n2 = notch ? { x0: notch.x0, x1: notch.x1, z: notch.z } : null;
      // North part grows on N/E/W; south strips grow on S/E/W but not into the notch.
      if (!n2) return b.box('stone', { x: cx, y0: yA, z: cz, w: half * 2 + g * 2, h: yB - yA, d: half * 2 + g * 2, color: col, jitter: 0.04 });
      b.box('stone', { x: cx, y0: yA, z: (z0 - g + n2.z) / 2, w: half * 2 + g * 2, h: yB - yA, d: n2.z - z0 + g, color: col, jitter: 0.04 });
      b.box('stone', { x: (x0 - g + n2.x0) / 2, y0: yA, z: (n2.z + z1 + g) / 2, w: n2.x0 - x0 + g, h: yB - yA, d: z1 + g - n2.z, color: col, jitter: 0.04 });
      b.box('stone', { x: (n2.x1 + x1 + g) / 2, y0: yA, z: (n2.z + z1 + g) / 2, w: x1 + g - n2.x1, h: yB - yA, d: z1 + g - n2.z, color: col, jitter: 0.04 });
    };
    band(ya, ya + 0.32, 0.2, STONE_DARK);
    band(ya + 0.32, ya + 0.42, 0.1, STONE);
    band((ya + yb) / 2 - 0.06, (ya + yb) / 2 + 0.06, 0.06, STONE);
    band(yb - 0.26, yb - 0.1, 0.12, STONE);
    band(yb - 0.1, yb + 0.0, 0.24, 0xc2c2b6);
    notchedColl(x0 - 0.2, x1 + 0.2, z0 - 0.2, z1 + 0.2, ya, yb, notch ? { ...notch } : null);
    // Recessed stairs inside the notch.
    if (notch) {
      const n = 5, rise = (yb - ya) / n, tread = 2.25 / n;
      for (let i = 0; i < n - 1; i++) {
        const zA = z1 - tread * (i + 1), zB = z1 - tread * i;
        b.box('stone', { x: cx, y0: ya, z: (zA + zB) / 2, w: stairW, h: rise * (i + 1), d: zB - zA, color: 0xbab9ad, jitter: 0.06, vc: moss(ya) });
      }
      b.collStairs({ x: cx, z0: z1 + 0.2, y0: ya, y1: yb, run: 2.25 + 0.2, w: stairW, maxRise: 0.4, surface: 'stone', base: ya - 0.2, tag: 'candi-stairs' });
    }
  }

  // ---- Courtyard stairs (protruding south of terrace 1) ----------------------------------------
  {
    const zTop = cz + T1.half; // -124
    const n = 5, rise = (T1.top - Y0) / n, tread = 0.45;
    const zFoot = zTop + n * tread; // -121.75
    for (let i = 0; i < n; i++) {
      const zA = zFoot - tread * (i + 1), zB = zFoot - tread * i;
      b.box('stone', { x: cx, y0: Y0 - 0.2, z: (zA + zB) / 2, w: stairW + 0.4, h: rise * (i + 1) + 0.2, d: zB - zA + (i === n - 1 ? 0.3 : 0), color: 0xbab9ad, jitter: 0.06, vc: moss(Y0) });
    }
    b.collStairs({ x: cx, z0: zFoot, y0: Y0, y1: T1.top, run: zFoot - zTop, w: stairW + 0.4, maxRise: 0.4, surface: 'stone', tag: 'candi-stairs' });
    // Stair balustrades (pipi tangga) ending in makara scrolls.
    for (const sx of [-1, 1]) {
      const x = cx + sx * (stairW / 2 + 0.55);
      const pts = [[zTop - 0.6, Y0], [zTop - 0.6, T1.top + 1.25], [zTop + 0.2, T1.top + 1.2], [zFoot - 0.3, Y0 + 1.15], [zFoot + 0.25, Y0 + 1.05], [zFoot + 0.55, Y0 + 0.7], [zFoot + 0.55, Y0]];
      b.add('stone', prismGeo(pts.map(([z, y]) => [z, y]), 0.7), { x, yaw: -Math.PI / 2 }, { color: STONE, jitter: 0.05, vc: moss(Y0) });
      b.add('stone', new THREE.TorusGeometry(0.32, 0.12, 6, 12, Math.PI * 1.5), { x: x + sx * 0.36, y: Y0 + 0.7, z: zFoot + 0.25, yaw: sx * Math.PI / 2 }, { color: STONE });
      b.collBox({ x, y: Y0, z: (zTop - 0.6 + zFoot + 0.55) / 2, w: 0.7, h: 1.2, d: zFoot + 0.55 - zTop + 0.6, surface: 'stone', walkable: false });
    }
  }

  // ---- Terrace 1 balustrade with reliefs, finials, the special relief stele ---------------------
  const bal = { t: 0.6, h: 1.2 };
  const inner = T1.half - bal.t; // 13.4
  const yB = T1.top;
  const relief = L.relief; // (22.5, -124.6)
  const balSeg = (side, a0, a1) => {
    // side: 'N','S','E','W'; a0..a1 along the edge (world x for N/S, world z for E/W).
    if (a1 - a0 < 0.05) return;
    const len = a1 - a0, mid = (a0 + a1) / 2;
    const ns = side === 'N' || side === 'S';
    const off = (side === 'N' || side === 'W' ? -1 : 1) * (T1.half - bal.t / 2);
    const x = ns ? mid : cx + off, z = ns ? cz + off : mid;
    b.box('stone', { x, y0: yB, z, w: ns ? len : bal.t, h: bal.h, d: ns ? bal.t : len, color: STONE, jitter: 0.05, vc: moss(yB) });
    b.box('stone', { x, y0: yB + bal.h, z, w: ns ? len + 0.02 : bal.t + 0.16, h: 0.12, d: ns ? bal.t + 0.16 : len + 0.02, color: 0xc4c4b8 });
    b.collBox({ x, y: yB, z, w: ns ? len : bal.t, h: bal.h + 0.12, d: ns ? bal.t : len, surface: 'stone', walkable: false, tag: 'balustrade' });
    // Sulur relief panels on the inner face every ~2.6 m.
    const nPan = Math.floor(len / 2.6);
    for (let i = 0; i < nPan; i++) {
      const p = a0 + (len / nPan) * (i + 0.5);
      const innerOff = (side === 'N' || side === 'W' ? -1 : 1) * (inner - 0.012);
      const yaw = side === 'N' ? 0 : side === 'S' ? Math.PI : side === 'W' ? Math.PI / 2 : -Math.PI / 2;
      b.add('relief', atlasQuad(1.8, 0.62, RR.sulur), { x: ns ? p : cx + innerOff, y: yB + 0.62, z: ns ? cz + innerOff : p, yaw }, { color: 0xffffff, jitter: 0.06 });
    }
  };
  const e0 = cx - T1.half, e1 = cx + T1.half;
  balSeg('N', e0, e1);
  balSeg('E', cz - T1.half + bal.t, cz + T1.half - bal.t);
  balSeg('W', cz - T1.half + bal.t, cz + T1.half - bal.t);
  // South: opening for the stairs, raised stele for the relief.
  const steleX0 = relief.x - 2.0, steleX1 = relief.x + 2.0;
  balSeg('S', e0, steleX0);
  balSeg('S', steleX1, cx - stairW / 2 - 0.2);
  balSeg('S', cx + stairW / 2 + 0.2, e1);
  {
    const zc = cz + T1.half - bal.t / 2;
    b.box('stone', { x: relief.x, y0: yB, z: zc, w: steleX1 - steleX0, h: 2.1, d: bal.t + 0.1, color: STONE, jitter: 0.04, vc: moss(yB) });
    b.box('stone', { x: relief.x, y0: yB + 2.1, z: zc, w: steleX1 - steleX0 + 0.25, h: 0.18, d: bal.t + 0.3, color: 0xc4c4b8 });
    b.within({ x: relief.x, y: yB + 2.28, z: zc }, () => ratna(b, 0.75));
    b.collBox({ x: relief.x, y: yB, z: zc, w: steleX1 - steleX0, h: 2.3, d: bal.t + 0.1, surface: 'stone', walkable: false, tag: 'relief' });
    // The cryptic relief (lamps + reversed sun path) on the inner face, in a carved frame.
    const fz = zc - (bal.t + 0.1) / 2 - 0.012;
    b.add('relief', atlasQuad(3.4, 1.7, RR.panel), { x: relief.x, y: yB + 1.08, z: fz, yaw: Math.PI }, { color: 0xffffff, jitter: 0 });
    b.box('stone', { x: relief.x, y: yB + 1.98, z: fz - 0.05, w: 3.7, h: 0.14, d: 0.12, color: 0xd0d0c4 });
    b.box('stone', { x: relief.x, y: yB + 0.18, z: fz - 0.05, w: 3.7, h: 0.14, d: 0.12, color: 0xd0d0c4 });
    for (const sx of [-1, 1]) b.box('stone', { x: relief.x + sx * 1.8, y: yB + 1.08, z: fz - 0.05, w: 0.14, h: 1.94, d: 0.12, color: 0xd0d0c4 });
    api.anchors.relief = new THREE.Vector3(relief.x, yB + 1.08, zc - (bal.t + 0.1) / 2 - 0.1);
  }
  // Finials along the balustrade (corners bigger).
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.within({ x: cx + sx * (T1.half - 0.3), y: yB + bal.h + 0.12, z: cz + sz * (T1.half - 0.3) }, () => ratna(b, 0.75));
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const p = i * 5.2;
    b.within({ x: cx + p, y: yB + bal.h + 0.12, z: cz - T1.half + 0.3 }, () => ratna(b, 0.5));
    b.within({ x: cx - T1.half + 0.3, y: yB + bal.h + 0.12, z: cz + p }, () => ratna(b, 0.5));
    b.within({ x: cx + T1.half - 0.3, y: yB + bal.h + 0.12, z: cz + p }, () => ratna(b, 0.5));
  }
  // Gate over the top of the courtyard stairs: two pillars and a lintel with a kala head.
  {
    const zg = cz + T1.half - 0.3;
    for (const sx of [-1, 1]) {
      const x = cx + sx * (stairW / 2 + 0.45);
      b.box('stone', { x, y0: yB, z: zg, w: 0.7, h: 3.1, d: 0.7, color: STONE, vc: moss(yB) });
      b.box('stone', { x, y0: yB + 3.1, z: zg, w: 0.85, h: 0.2, d: 0.85, color: 0xc4c4b8 });
      b.collBox({ x, y: yB, z: zg, w: 0.7, h: 3.3, d: 0.7, surface: 'stone', walkable: false });
    }
    b.box('stone', { x: cx, y0: yB + 3.3, z: zg, w: stairW + 1.9, h: 0.75, d: 0.8, color: STONE });
    b.box('stone', { x: cx, y0: yB + 4.05, z: zg, w: stairW + 2.2, h: 0.2, d: 0.95, color: 0xc4c4b8 });
    b.add('relief', atlasQuad(1.1, 1.1, RR.kala), { x: cx, y: yB + 3.68, z: zg + 0.41 }, { color: 0xffffff, jitter: 0 });
    b.add('relief', atlasQuad(1.1, 1.1, RR.kala), { x: cx, y: yB + 3.68, z: zg - 0.41, yaw: Math.PI }, { color: 0xffffff, jitter: 0 });
    b.within({ x: cx, y: yB + 4.25, z: zg }, () => ratna(b, 0.9));
    for (const sx of [-1, 1]) b.within({ x: cx + sx * 2.2, y: yB + 4.25, z: zg }, () => ratna(b, 0.5));
    b.collBox({ x: cx, y: yB + 3.3, z: zg, w: stairW + 1.9, h: 0.95, d: 0.8, surface: 'stone' });
  }
  // Relief friezes on the outer faces of terrace 1 (seen from the courtyard).
  for (const side of ['N', 'S', 'E', 'W']) {
    for (let i = -2; i <= 2; i++) {
      const p = i * 5.0 + (side === 'S' && i === 0 ? 99 : 0);
      if (Math.abs(p) > 20) continue;
      const o = T1.half + 0.012;
      const pos = side === 'N' ? [cx + p, cz - o, Math.PI] : side === 'S' ? [cx + p, cz + o, 0] : side === 'E' ? [cx + o, cz + p, Math.PI / 2] : [cx - o, cz + p, -Math.PI / 2];
      b.add('relief', atlasQuad(2.6, 0.9, RR.sulur), { x: pos[0], y: Y0 + 1.15, z: pos[1], yaw: pos[2] }, { color: 0xffffff, jitter: 0.08 });
    }
  }
  // Antefixes along the cornices of terraces 2 and 3.
  for (const lv of [levels[1], levels[2]]) {
    const h = lv.half + 0.12;
    const step = 1.3;
    const fix = (x, z, yaw) => b.add('stone', prismGeo([[-0.17, 0], [0.17, 0], [0.1, 0.18], [0, 0.42], [-0.1, 0.18]], 0.12), { x, y: lv.yb, z, yaw }, { color: 0xc2c2b6, jitter: 0.06 });
    for (let a = -h + 0.4; a <= h - 0.4; a += step) {
      fix(cx + a, cz - h, 0);
      if (Math.abs(a) > stairW / 2 + 0.4) fix(cx + a, cz + h, 0);
      fix(cx - h, cz + a, Math.PI / 2);
      fix(cx + h, cz + a, Math.PI / 2);
    }
  }

  // ---- Pelita (4 stone lamps on terrace 1) ------------------------------------------------------
  const pelitaMats = [];
  for (const p of L.pelita) {
    const y = T1.top;
    b.within({ x: p.x, y, z: p.z }, () => {
      b.box('stone', { x: 0, y0: 0, z: 0, w: 0.72, h: 0.24, d: 0.72, color: STONE_DARK, vc: moss(y) });
      b.box('stone', { x: 0, y0: 0.24, z: 0, w: 0.52, h: 0.14, d: 0.52, color: STONE });
      b.cyl('stone', { x: 0, y0: 0.38, z: 0, r: 0.15, rt: 0.12, h: 0.58, seg: 8, color: STONE });
      b.box('stone', { x: 0, y0: 0.96, z: 0, w: 0.42, h: 0.09, d: 0.42, color: 0xc4c4b8 });
      b.add('stone', latheGeo([[0.06, 0], [0.2, 0.02], [0.33, 0.1], [0.37, 0.2], [0.34, 0.22], [0.28, 0.14], [0.0, 0.12]], 12), { x: 0, y: 1.05, z: 0 }, { color: 0x9a9a8e });
    });
    b.collCyl({ x: p.x, y, z: p.z, r: 0.42, h: 1.27, surface: 'stone' });
    // Ember disc: own material so setLit can toggle it.
    const mat = new THREE.MeshBasicMaterial({ color: 0x0a0806 });
    kit.addMat('pelita-' + p.id, mat);
    pelitaMats.push(mat);
    const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.22, 0.04, 12), kit.mats['pelita-' + p.id].material);
    ember.position.set(0, 1.2, 0);
    const obj = new THREE.Group();
    obj.name = 'pelita:' + p.id;
    obj.position.set(p.x, y, p.z);
    obj.add(ember);
    scene.add(obj);
    const position = new THREE.Vector3(p.x, y + 1.25, p.z);
    let lit = false;
    api.pelita[p.id] = {
      object: obj,
      position,
      get lit() { return lit; },
      setLit(on) {
        lit = !!on;
        if (lit) mat.color.setRGB(EMBER[0], EMBER[1], EMBER[2]); else mat.color.setRGB(0.035, 0.028, 0.022);
      },
    };
    api.pelita[p.id].setLit(false);
    api.anchors['pelita:' + p.id] = position;
  }

  // ---- Shrine body ----------------------------------------------------------------------------
  const yS = T3.top; // 40
  const yTop = SH.top; // 47
  const ho = SH.half, hi = L.chamber.half; // 5, 3.2
  const doorW = 1.6, doorH = 2.6;
  const zS = cz + ho; // south outer face (-133)
  const wallC = { color: STONE, jitter: 0.05, vc: moss(yS) };
  b.box('stone', { x: cx, y0: yS, z: cz - (ho + hi) / 2, w: ho * 2, h: yTop - yS, d: ho - hi, ...wallC });
  b.box('stone', { x: cx - (ho + hi) / 2, y0: yS, z: cz, w: ho - hi, h: yTop - yS, d: hi * 2, ...wallC });
  b.box('stone', { x: cx + (ho + hi) / 2, y0: yS, z: cz, w: ho - hi, h: yTop - yS, d: hi * 2, ...wallC });
  const sw = (ho - doorW / 2);
  b.box('stone', { x: cx - doorW / 2 - sw / 2, y0: yS, z: cz + (ho + hi) / 2, w: sw, h: yTop - yS, d: ho - hi, ...wallC });
  b.box('stone', { x: cx + doorW / 2 + sw / 2, y0: yS, z: cz + (ho + hi) / 2, w: sw, h: yTop - yS, d: ho - hi, ...wallC });
  b.box('stone', { x: cx, y0: yS + doorH, z: cz + (ho + hi) / 2, w: doorW, h: yTop - yS - doorH, d: ho - hi, ...wallC });
  for (const c of [
    { x: cx, z: cz - (ho + hi) / 2, w: ho * 2, d: ho - hi },
    { x: cx - (ho + hi) / 2, z: cz, w: ho - hi, d: hi * 2 },
    { x: cx + (ho + hi) / 2, z: cz, w: ho - hi, d: hi * 2 },
    { x: cx - doorW / 2 - sw / 2, z: cz + (ho + hi) / 2, w: sw, d: ho - hi },
    { x: cx + doorW / 2 + sw / 2, z: cz + (ho + hi) / 2, w: sw, d: ho - hi },
  ]) b.collBox({ ...c, y: yS, h: yTop - yS + 6, surface: 'stone', walkable: false, tag: 'shrine' });
  b.collBox({ x: cx, y: yS + doorH, z: cz + (ho + hi) / 2, w: doorW, h: yTop - yS - doorH + 6, d: ho - hi, surface: 'stone', walkable: false, tag: 'shrine' });
  // Shrine mouldings + corner pilasters.
  const shBand = (yA, yBb, g, col) => {
    // Four strips (leave the doorway open on the south).
    b.box('stone', { x: cx, y0: yA, z: cz - ho + 0.3 - g / 2, w: ho * 2 + g * 2, h: yBb - yA, d: 0.6 + g, color: col });
    b.box('stone', { x: cx - ho + 0.3 - g / 2, y0: yA, z: cz, w: 0.6 + g, h: yBb - yA, d: ho * 2, color: col });
    b.box('stone', { x: cx + ho - 0.3 + g / 2, y0: yA, z: cz, w: 0.6 + g, h: yBb - yA, d: ho * 2, color: col });
    for (const sx of [-1, 1]) {
      const w = ho - doorW / 2 - 0.25;
      b.box('stone', { x: cx + sx * (doorW / 2 + 0.25 + w / 2 + g / 2), y0: yA, z: cz + ho - 0.3 + g / 2, w: w + g, h: yBb - yA, d: 0.6 + g, color: col });
    }
  };
  shBand(yS, yS + 0.4, 0.22, STONE_DARK);
  shBand(yS + 0.4, yS + 0.5, 0.1, STONE);
  shBand(yTop - 0.5, yTop - 0.25, 0.14, STONE);
  b.box('stone', { x: cx, y0: yTop - 0.25, z: cz, w: ho * 2 + 0.6, h: 0.25, d: ho * 2 + 0.6, color: 0xc4c4b8 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box('stone', { x: cx + sx * (ho - 0.2), y0: yS + 0.5, z: cz + sz * (ho - 0.2), w: 0.6, h: yTop - yS - 1.0, d: 0.6, color: STONE });
  // Niches with seated figures on E, W, N faces; kala heads above.
  for (const [nx, nz, yaw] of [[cx + ho, cz, -Math.PI / 2], [cx - ho, cz, Math.PI / 2], [cx, cz - ho, 0]]) {
    const ox = Math.sign(nx - cx) * 0.18, oz = Math.sign(nz - cz) * 0.18;
    b.within({ x: nx + ox, y: yS, z: nz + oz, yaw: yaw + Math.PI }, () => {
      // Frame (local +z = outward).
      b.box('stone', { x: 0, y0: 0.9, z: 0.05, w: 2.2, h: 0.25, d: 0.5, color: 0xc4c4b8 });
      b.box('stone', { x: 0, y0: 3.55, z: 0.05, w: 2.2, h: 0.25, d: 0.5, color: 0xc4c4b8 });
      for (const sx of [-1, 1]) b.box('stone', { x: sx * 0.98, y0: 1.15, z: 0.05, w: 0.25, h: 2.4, d: 0.5, color: 0xc4c4b8 });
      b.box('stone', { x: 0, y0: 1.15, z: -0.12, w: 1.7, h: 2.4, d: 0.1, color: 0x55574e });
      b.add('relief', atlasQuad(1.3, 1.3, RR.kala), { x: 0, y: 4.5, z: 0.08 }, { color: 0xffffff, jitter: 0 });
      seatedFigure(b, 0, 1.15, 0.05);
    });
  }
  // South doorway: stepped jambs, kala head above.
  for (const sx of [-1, 1]) {
    b.box('stone', { x: cx + sx * (doorW / 2 + 0.22), y0: yS, z: zS + 0.15, w: 0.44, h: doorH + 0.3, d: 0.3, color: 0xc4c4b8 });
    b.box('stone', { x: cx + sx * (doorW / 2 + 0.55), y0: yS, z: zS + 0.08, w: 0.3, h: doorH + 0.6, d: 0.2, color: STONE });
  }
  b.box('stone', { x: cx, y0: yS + doorH, z: zS + 0.15, w: doorW + 0.88, h: 0.32, d: 0.3, color: 0xc4c4b8 });
  b.add('relief', atlasQuad(1.9, 1.9, RR.kala), { x: cx, y: yS + doorH + 1.45, z: zS + 0.04 }, { color: 0xffffff, jitter: 0 });
  b.box('stone', { x: cx, y0: yS - 0.02, z: zS + 0.25, w: doorW + 0.4, h: 0.14, d: 0.5, color: 0xc4c4b8 }); // threshold
  // Chamber: corbelled ceiling, altar (yoni), offerings, inner reliefs.
  for (let i = 0; i < 4; i++) {
    const y = yTop - 2.2 + i * 0.5, hh = hi - 0.35 * (i + 1), t = 0.4;
    b.box('stone', { x: cx, y0: y, z: cz - hh - t / 2 + 0.01, w: hh * 2 + t * 2, h: 0.5, d: t, color: STONE_DARK });
    b.box('stone', { x: cx, y0: y, z: cz + hh + t / 2 - 0.01, w: hh * 2 + t * 2, h: 0.5, d: t, color: STONE_DARK });
    b.box('stone', { x: cx - hh - t / 2 + 0.01, y0: y, z: cz, w: t, h: 0.5, d: hh * 2, color: STONE_DARK });
    b.box('stone', { x: cx + hh + t / 2 - 0.01, y0: y, z: cz, w: t, h: 0.5, d: hh * 2, color: STONE_DARK });
  }
  b.box('stone', { x: cx, y0: yTop - 0.2, z: cz, w: 2.2, h: 0.2, d: 2.2, color: STONE_DARK });
  {
    const y = yS;
    b.box('stone', { x: cx, y0: y, z: cz, w: 1.45, h: 0.32, d: 1.45, color: STONE });
    b.box('stone', { x: cx, y0: y + 0.32, z: cz, w: 1.05, h: 0.42, d: 1.05, color: STONE_DARK });
    b.box('stone', { x: cx, y0: y + 0.74, z: cz, w: 1.4, h: 0.2, d: 1.4, color: STONE });
    b.box('stone', { x: cx, y0: y + 0.78, z: cz - 0.85, w: 0.3, h: 0.12, d: 0.5, color: STONE }); // spout
    b.add('stone', latheGeo([[0.0, 0], [0.32, 0], [0.34, 0.06], [0.2, 0.1], [0.0, 0.1]], 12), { x: cx, y: y + 0.94, z: cz }, { color: 0xa8a89c });
    b.collBox({ x: cx, y, z: cz, w: 1.45, h: 0.94, d: 1.45, surface: 'stone' });
    for (const [ox, oz] of [[-0.55, 0.5], [0.5, 0.55], [-0.5, -0.5]]) canang(b, cx + ox, y + 0.94, cz + oz);
    for (const sx of [-1, 1]) {
      b.add('relief', atlasQuad(2.6, 0.9, RR.sulur), { x: cx + sx * (hi - 0.012), y: y + 1.8, z: cz, yaw: -sx * Math.PI / 2 }, { color: 0xffffff, jitter: 0.04 });
    }
    b.add('relief', atlasQuad(2.6, 0.9, RR.padma), { x: cx, y: y + 1.8, z: cz - hi + 0.012 }, { color: 0xffffff, jitter: 0.04 });
  }
  api.anchors['flame:bumi'] = new THREE.Vector3(cx, yS + 1.55, cz);

  // ---- Stepped roof with ratna finials --------------------------------------------------------
  const tiers = [[yTop, 48.6, 4.3, 0.75], [48.6, 50.0, 3.4, 0.6], [50.0, 51.2, 2.5, 0.48]];
  for (const [ya, ybb, h, rs] of tiers) {
    b.box('stone', { x: cx, y0: ya, z: cz, w: h * 2, h: ybb - ya - 0.2, d: h * 2, color: STONE, jitter: 0.04 });
    b.box('stone', { x: cx, y0: ybb - 0.2, z: cz, w: h * 2 + 0.36, h: 0.2, d: h * 2 + 0.36, color: 0xc4c4b8 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.within({ x: cx + sx * (h - 0.25), y: ybb, z: cz + sz * (h - 0.25) }, () => ratna(b, rs));
    for (const [sx, sz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) b.within({ x: cx + sx * (h - 0.25), y: ybb, z: cz + sz * (h - 0.25) }, () => ratna(b, rs * 0.75));
  }
  b.add('stone', latheGeo([[1.7, 0], [1.75, 0.15], [1.5, 0.35], [1.2, 0.5]], 16), { x: cx, y: 51.2, z: cz }, { color: 0xc4c4b8 });
  b.within({ x: cx, y: 51.7, z: cz }, () => ratna(b, 1.95));
  b.collBox({ x: cx, y: yTop, z: cz, w: 8.6, h: 4.2, d: 8.6, surface: 'stone' });
  api.anchors['candi:top'] = new THREE.Vector3(cx, 54.5, cz);

  // ---- Courtyard: processional paving + ring around terrace 1 ----------------------------------
  const flag = (x, z, s = 0.95) => {
    const y = heightAt(x, z);
    if (Math.abs(y - Y0) > 0.6) return;
    if (b.rand() < 0.1) return; // missing flagstone
    b.box('stone', { x: x + b.r(-0.05, 0.05), y0: y - 0.12, z: z + b.r(-0.05, 0.05), w: s * b.r(0.85, 1), h: 0.15, d: s * b.r(0.85, 1), yaw: b.r(-0.05, 0.05), color: 0xa6a69a, jitter: 0.12, vc: moss(y + 0.5) });
  };
  {
    // Processional path from the stair foot to the split gate.
    const ax = cx, az = cz + T1.half + 2.75, bx = 33.4, bz = -111.4;
    const L2 = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L2, uz = (bz - az) / L2;
    for (let t = 0.5; t < L2; t += 1.0) for (const o of [-1, 0, 1]) flag(ax + ux * t - uz * o, az + uz * t + ux * o);
  }
  for (let a = -T1.half - 1.5; a <= T1.half + 1.5; a += 1.0) {
    for (const r of [T1.half + 0.75, T1.half + 1.75]) {
      flag(cx + a, cz - r);
      flag(cx - r, cz + a);
      flag(cx + r, cz + a);
      if (Math.abs(a) > stairW / 2 + 1.2) flag(cx + a, cz + r);
    }
  }

  // ---- Candi bentar (split gate) on the approach ---------------------------------------------
  const G = { x: 33.4, z: -110.2, yaw: 0.25 };
  b.within({ x: G.x, y: heightAt(G.x, G.z), z: G.z, yaw: G.yaw }, () => {
    for (const sx of [-1, 1]) {
      const xi = sx * 1.6; // inner (cut) face
      const tierBox = (ya, ybb, w, d, col) => b.box('stone', { x: xi + sx * w / 2, y0: ya, z: 0, w, h: ybb - ya, d, color: col, jitter: 0.05, vc: moss(heightAt(G.x, G.z)) });
      tierBox(-0.3, 0.5, 2.9, 2.7, 0xa8705a);
      tierBox(0.5, 2.9, 2.5, 2.25, BRICK);
      tierBox(2.9, 3.15, 2.8, 2.55, 0xd09a7a);
      tierBox(3.15, 4.2, 2.05, 1.85, BRICK);
      tierBox(4.2, 4.35, 2.25, 2.05, 0xd09a7a);
      tierBox(4.35, 5.15, 1.5, 1.4, BRICK);
      tierBox(5.15, 5.3, 1.7, 1.6, 0xd09a7a);
      tierBox(5.3, 5.95, 0.95, 0.95, BRICK);
      b.within({ x: xi + sx * 0.48, y: 5.95, z: 0 }, () => ratna(b, 0.5, 'stone', 0xc89a7a));
      for (const sz of [-1, 1]) b.within({ x: xi + sx * 2.2, y: 3.15, z: sz * 0.85 }, () => ratna(b, 0.35, 'stone', 0xc89a7a));
      for (const sz of [-1, 1]) b.add('relief', atlasQuad(1.6, 1.0, RR.sulur), { x: xi + sx * 1.25, y: 1.7, z: sz * 1.13, yaw: sz < 0 ? Math.PI : 0 }, { color: 0xffd8c0, jitter: 0 });
      b.collBox({ x: xi + sx * 1.45, y: -0.3, z: 0, w: 2.9, h: 6.3, d: 2.7, surface: 'stone', walkable: false, tag: 'gate' });
      // Ruined enclosure wall running outward from the gate.
      for (let k = 0; k < 4; k++) {
        const x = xi + sx * (3.2 + k * 1.6);
        const hh = 1.35 - k * 0.22 + b.r(-0.1, 0.1);
        b.box('stone', { x, y0: -0.3, z: 0, w: 1.62, h: hh + 0.3, d: 0.65, color: BRICK, jitter: 0.08, vc: moss(heightAt(G.x, G.z)) });
        b.collBox({ x, y: -0.3, z: 0, w: 1.62, h: hh + 0.3, d: 0.65, surface: 'stone' });
      }
    }
  });
  api.anchors['candi:gate'] = new THREE.Vector3(G.x, heightAt(G.x, G.z), G.z);

  // ---- Fallen stones, toppled finials --------------------------------------------------------
  const fallen = [[12, -122, 1.0], [14.5, -127, 0.7], [47, -128, 1.1], [45.5, -131.5, 0.6], [48, -150, 0.9], [11.5, -152, 0.8], [20, -110.5, 0.7], [41.5, -116, 0.9], [8.5, -138, 0.6], [51.5, -141, 0.7], [24, -156, 0.8], [38, -157, 0.6]];
  for (const [x, z, s] of fallen) {
    const y = heightAt(x, z);
    const w = s * b.r(1.0, 1.6), h = s * b.r(0.5, 0.75), d = s * b.r(0.7, 1.1);
    const yaw = b.r(0, Math.PI), roll = b.r(-0.25, 0.25), pitch = b.r(-0.2, 0.2);
    b.box('stone', { x, y: y + h * 0.3, z, w, h, d, yaw, roll, pitch, color: STONE, jitter: 0.1, vc: moss(y + h * 0.4) });
    if (s >= 0.7) b.collBox({ x, y: y - 0.2, z, w: w * 0.9, h: h * 0.75 + 0.2, d: d * 0.9, yaw, surface: 'stone' });
    if (b.rand() < 0.5) b.box('stone', { x: x + b.r(-1, 1), y: y + 0.12, z: z + b.r(-1, 1), w: s * 0.5, h: s * 0.3, d: s * 0.45, yaw: b.r(0, 3), roll: b.r(-0.4, 0.4), color: STONE, jitter: 0.12, vc: moss(y) });
  }
  for (const [x, z, yaw] of [[17, -116, 0.6], [46, -146, 2.2]]) {
    const y = heightAt(x, z);
    b.within({ x, y: y + 0.42, z, yaw, roll: Math.PI / 2 - 0.1 }, () => ratna(b, 0.6, 'stone', 0x9c9c90));
  }

  // ---- Approach campfire + seats (Laras sits on a block just behind her spot) -----------------
  const CF = L.campfire;
  const yC = heightAt(CF.x, CF.z);
  b.within({ x: CF.x, y: yC, z: CF.z }, () => campfirePit(b, { big: false }));
  const fireObj = new THREE.Group();
  fireObj.name = 'campfire:candi';
  fireObj.position.set(CF.x, yC + 0.05, CF.z);
  scene.add(fireObj);
  api.campfires.candi = { object: fireObj, position: fireObj.position.clone() };
  api.anchors['campfire:candi'] = fireObj.position.clone();
  {
    const ox = CF.x - 3.2, oz = CF.z - 1.2;
    b.box('stone', { x: ox, y0: heightAt(ox, oz) - 0.1, z: oz, w: 1.1, h: 0.5, d: 0.5, yaw: 1.2, color: STONE, jitter: 0.1, vc: moss(heightAt(ox, oz)) });
  }

  // ---- Sealed door slab (own meshes; sinks into the floor when opened) -------------------------
  const door = new THREE.Group();
  door.name = 'candi:door';
  const slabGeo = new THREE.BoxGeometry(doorW - 0.04, doorH - 0.02, 0.4);
  const slab = new THREE.Mesh(slabGeo, kit.mats.stone.material);
  slab.position.set(0, doorH / 2, 0);
  slab.castShadow = slab.receiveShadow = true;
  const col = new Float32Array(slabGeo.attributes.position.count * 3).fill(0.82);
  slabGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const face = new THREE.Mesh(atlasQuad(doorW - 0.2, doorH - 0.25, RR.sulur), kit.mats.relief.material);
  face.position.set(0, doorH / 2, 0.205);
  face.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(face.geometry.attributes.position.count * 3).fill(1), 3));
  door.add(slab, face);
  door.position.set(cx, yS, zS - 0.3);
  scene.add(door);
  const doorColl = kit.collision.addBox({ x: cx, y: yS, z: zS - (ho - hi) / 2, w: doorW, h: doorH + 0.5, d: ho - hi, surface: 'stone', walkable: false, tag: 'candi-door' });
  api.anchors['candi:door'] = new THREE.Vector3(cx, yS + 1.3, zS + 0.1);
  let doorT = 0, doorTarget = 0;
  api._setCandiDoor = (open, instant = false) => {
    doorTarget = open ? 1 : 0;
    api.candiDoorOpen = !!open;
    if (!open) kit.collision.setEnabled(doorColl, true);
    if (instant) doorT = doorTarget;
  };
  updaters.push((dt, t) => {
    if (doorT !== doorTarget) {
      const sp = dt / 2.4;
      doorT = doorTarget > doorT ? Math.min(doorTarget, doorT + sp) : Math.max(doorTarget, doorT - sp);
    }
    const e = easeInOut(doorT);
    const moving = doorT > 0 && doorT < 1;
    door.position.y = yS - e * (doorH + 0.1);
    door.position.x = cx + (moving ? Math.sin(t * 61) * 0.015 : 0);
    door.visible = doorT < 0.999;
    if (doorTarget === 1 && doorT > 0.6) kit.collision.setEnabled(doorColl, false);
  });

  return b.build(scene);
}

// Seated stone figure (simplified Ganesha/Durga silhouette) facing local +z.
function seatedFigure(b, x, y, z) {
  const c = 0x9a9a8e;
  b.box('stone', { x, y0: y, z, w: 1.1, h: 0.25, d: 0.55, color: c });
  b.add('stone', new THREE.SphereGeometry(0.42, 10, 6), { x, y: y + 0.42, z: z + 0.05, sx: 1.15, sy: 0.45, sz: 0.8 }, { color: c });
  b.add('stone', latheGeo([[0.0, 0], [0.3, 0], [0.33, 0.3], [0.26, 0.65], [0.15, 0.78], [0.0, 0.8]], 10), { x, y: y + 0.45, z }, { color: c });
  b.add('stone', new THREE.SphereGeometry(0.17, 10, 8), { x, y: y + 1.35, z: z + 0.03 }, { color: c });
  b.add('stone', new THREE.ConeGeometry(0.15, 0.4, 8), { x, y: y + 1.65, z }, { color: c });
  for (const sx of [-1, 1]) b.rod('stone', [x + sx * 0.28, y + 1.05, z], [x + sx * 0.3, y + 0.62, z + 0.25], 0.07, { color: c });
  b.add('stone', new THREE.TorusGeometry(0.42, 0.05, 6, 16, Math.PI), { x, y: y + 1.32, z: z - 0.05 }, { color: c }); // halo
}
