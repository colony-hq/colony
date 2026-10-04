// Decor geometry (stylised low-poly, vertex-coloured, instance-tinted) and the overworld placement
// rules that fill the Scatters. Owner: world builder.

import * as THREE from 'three';
import { GeoBuilder, lin, hexRGB } from './w-scatter.js';
import {
  getOverworldFields, ZK, ZI, ZONE_KEYS, sampleRGB, FARM_FIELDS, skirtHeight,
  W_SEA, W_LAKE, W_RIVER, W_SWAMP,
} from './w-fields.js';
import { heightAt, T_BLOCK, T_WATER, T_ROAD, T_INDOOR, T_BRIDGE, T_WALL, T_CLIFF, T_EDGE } from './mapgen.js';
import { mulberry32 } from '../core/noise.js';
import { ZONES } from '../data/zones.js';

const TAU = Math.PI * 2;
const M4 = () => new THREE.Matrix4();
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const g3 = (v) => [v, v, v];

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------
export function geoGrassTuft() {
  const r = mulberry32(11);
  const B = new GeoBuilder();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + r() * 0.6;
    const r0 = 0.03 + r() * 0.09;
    const bx = Math.cos(a) * r0, bz = Math.sin(a) * r0;
    const tx = -Math.sin(a), tz = Math.cos(a);
    const h = 0.26 + r() * 0.26, w = 0.045 + r() * 0.03;
    const lean = 0.06 + r() * 0.1;
    B.tri([bx - tx * w, 0, bz - tz * w], [bx + tx * w, 0, bz + tz * w], [bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean],
      [g3(0.62), g3(0.62), [1.22, 1.24, 1.05]], 0, [0, 1, 0]);
  }
  return B.build({ upNormals: true });
}

export function geoFlowers() {
  const r = mulberry32(23);
  const B = new GeoBuilder();
  const stemC = [0.36, 0.55, 0.22];
  for (let f = 0; f < 3; f++) {
    const ox = (r() - 0.5) * 0.35, oz = (r() - 0.5) * 0.35;
    const h = 0.2 + r() * 0.18;
    const tilt = (r() - 0.5) * 0.4;
    B.tri([ox - 0.015, 0, oz], [ox + 0.015, 0, oz], [ox + tilt * 0.2, h, oz], stemC, 1, [0, 1, 0]);
    const cx = ox + tilt * 0.2, cy = h, cz = oz;
    const R = 0.06 + r() * 0.03;
    const a0 = r() * TAU;
    for (let p = 0; p < 5; p++) {
      const a1 = a0 + (p / 5) * TAU, a2 = a0 + ((p + 0.5) / 5) * TAU, a3 = a0 + ((p + 1) / 5) * TAU;
      B.tri([cx, cy + 0.01, cz], [cx + Math.cos(a1) * R * 0.45, cy, cz + Math.sin(a1) * R * 0.45], [cx + Math.cos(a2) * R, cy + 0.015, cz + Math.sin(a2) * R], [g3(0.85), g3(1), g3(1.08)], 0, [0, 1, 0]);
      B.tri([cx, cy + 0.01, cz], [cx + Math.cos(a2) * R, cy + 0.015, cz + Math.sin(a2) * R], [cx + Math.cos(a3) * R * 0.45, cy, cz + Math.sin(a3) * R * 0.45], [g3(0.85), g3(1.08), g3(1)], 0, [0, 1, 0]);
    }
    B.tri([cx - 0.02, cy + 0.02, cz - 0.015], [cx + 0.02, cy + 0.02, cz - 0.015], [cx, cy + 0.02, cz + 0.022], [0.98, 0.82, 0.25], 1, [0, 1, 0]);
  }
  return B.build({ upNormals: true });
}

function blob(B, cx, cy, cz, rad, seed, colTop = 1.15, colBot = 0.62, keep = 0, sy = 0.78) {
  const r = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(rad, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.82 + r() * 0.3;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * sy, p.getZ(i) * k);
  }
  const m = M4().makeTranslation(cx, cy, cz);
  const gg = g.index ? g.toNonIndexed() : g;
  gg.applyMatrix4(m);
  const pp = gg.attributes.position;
  // spherical normals: soft painted volume
  const nrm = [];
  for (let i = 0; i < pp.count; i++) {
    const v = new THREE.Vector3(pp.getX(i) - cx, (pp.getY(i) - cy) / sy + rad * 0.35, pp.getZ(i) - cz).normalize();
    nrm.push(v.x, v.y, v.z);
  }
  for (let i = 0; i < pp.count; i += 3) {
    const shade = 0.9 + r() * 0.2;
    const tri = [];
    for (let j = 0; j < 3; j++) {
      const y = pp.getY(i + j);
      const t = Math.max(0, Math.min(1, (y - (cy - rad * sy)) / (2 * rad * sy)));
      tri.push(g3((colBot + (colTop - colBot) * t) * shade));
    }
    const a = [pp.getX(i), pp.getY(i), pp.getZ(i)], b = [pp.getX(i + 1), pp.getY(i + 1), pp.getZ(i + 1)], c = [pp.getX(i + 2), pp.getY(i + 2), pp.getZ(i + 2)];
    B.p.push(...a, ...b, ...c);
    for (const cc of tri) B.c.push(...cc);
    B.k.push(keep, keep, keep);
    B.n.push(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2], nrm[i * 3 + 3], nrm[i * 3 + 4], nrm[i * 3 + 5], nrm[i * 3 + 6], nrm[i * 3 + 7], nrm[i * 3 + 8]);
  }
}

export function geoBush(berries = false) {
  const B = new GeoBuilder();
  blob(B, 0, 0.42, 0, 0.55, 3);
  blob(B, 0.42, 0.32, 0.12, 0.4, 5);
  blob(B, -0.3, 0.3, -0.25, 0.42, 7);
  if (berries) {
    const r = mulberry32(99);
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU, y = 0.3 + r() * 0.45;
      const rr = 0.5 + r() * 0.12;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      B.geo(new THREE.OctahedronGeometry(0.05, 0), [0.78, 0.12, 0.16], 1, M4().makeTranslation(x, y, z));
    }
  }
  return B.build();
}

export function geoFern() {
  const r = mulberry32(31);
  const B = new GeoBuilder();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + r() * 0.4;
    const L = 0.55 + r() * 0.35;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    const p0 = [0, 0.04, 0], p1 = [dx * L * 0.45, 0.32 + r() * 0.12, dz * L * 0.45], p2 = [dx * L, 0.12, dz * L];
    const w1 = 0.11;
    const l0 = [p0[0] - px * 0.02, p0[1], p0[2] - pz * 0.02], r0 = [p0[0] + px * 0.02, p0[1], p0[2] + pz * 0.02];
    const l1 = [p1[0] - px * w1, p1[1], p1[2] - pz * w1], r1 = [p1[0] + px * w1, p1[1], p1[2] + pz * w1];
    B.quad(l0, r0, r1, l1, [g3(0.6), g3(0.6), g3(1.05), g3(1.05)], 0, [0, 1, 0]);
    B.tri(l1, r1, p2, [g3(1.05), g3(1.05), g3(1.2)], 0, [0, 1, 0]);
    B.tri(p1, [p1[0], p1[1] + 0.01, p1[2]], p2, g3(0.7), 0, [0, 1, 0]);
  }
  return B.build({ upNormals: true });
}

export function geoMushrooms() {
  const r = mulberry32(41);
  const B = new GeoBuilder();
  for (let i = 0; i < 3; i++) {
    const x = (r() - 0.5) * 0.4, z = (r() - 0.5) * 0.4;
    const h = 0.08 + r() * 0.12, cr = 0.06 + r() * 0.07;
    B.geo(new THREE.CylinderGeometry(cr * 0.35, cr * 0.45, h, 5, 1, true), [0.92, 0.88, 0.78], 1, M4().makeTranslation(x, h / 2, z));
    B.geo(new THREE.ConeGeometry(cr, cr * 0.75, 7, 1, true), (px, py) => g3(py > h + cr * 0.2 ? 1.1 : 0.85), 0, M4().makeTranslation(x, h + cr * 0.3, z));
    B.geo(new THREE.CircleGeometry(cr * 0.98, 7), [0.95, 0.9, 0.82], 1, M4().makeTranslation(x, h - 0.005, z).multiply(M4().makeRotationX(Math.PI / 2)));
  }
  return B.build();
}

export function geoReeds() {
  const r = mulberry32(51);
  const B = new GeoBuilder();
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU, rr = r() * 0.25;
    const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
    const h = 0.8 + r() * 0.7, w = 0.03;
    const lx = (r() - 0.5) * 0.25, lz = (r() - 0.5) * 0.25;
    const ta = r() * TAU, tx = Math.cos(ta), tz = Math.sin(ta);
    B.tri([bx - tx * w, 0, bz - tz * w], [bx + tx * w, 0, bz + tz * w], [bx + lx, h, bz + lz], [g3(0.55), g3(0.55), [1.15, 1.18, 0.9]], 0, [0, 1, 0]);
  }
  for (let i = 0; i < 3; i++) {
    const x = (r() - 0.5) * 0.3, z = (r() - 0.5) * 0.3, h = 1.0 + r() * 0.35;
    B.tri([x - 0.01, 0, z], [x + 0.01, 0, z], [x, h, z], [0.42, 0.52, 0.25], 1, [0, 1, 0]);
    const head = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 5);
    B.geo(head, [0.42, 0.27, 0.14], 1, M4().makeTranslation(x, h - 0.12, z));
  }
  return B.build();
}

export function geoLilyPad() {
  const B = new GeoBuilder();
  const S = 10, notch = 0.45;
  for (let i = 0; i < S; i++) {
    const a1 = notch + (i / S) * (TAU - notch), a2 = notch + ((i + 1) / S) * (TAU - notch);
    B.tri([0, 0, 0], [Math.cos(a2) * 0.34, 0, Math.sin(a2) * 0.34], [Math.cos(a1) * 0.34, 0, Math.sin(a1) * 0.34], [g3(0.82), g3(1.12), g3(1.12)], 0, [0, 1, 0]);
  }
  return B.build({ upNormals: true });
}
export function geoLilyFlower() {
  const B = new GeoBuilder();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    const tip = [Math.cos(a) * 0.13, 0.07, Math.sin(a) * 0.13];
    const l = [Math.cos(a - 0.35) * 0.05, 0.02, Math.sin(a - 0.35) * 0.05], rr = [Math.cos(a + 0.35) * 0.05, 0.02, Math.sin(a + 0.35) * 0.05];
    B.tri(l, rr, tip, [g3(0.8), g3(0.8), g3(1.1)], 0, [0, 1, 0]);
  }
  B.geo(new THREE.CylinderGeometry(0.03, 0.04, 0.05, 6), [1, 0.85, 0.3], 1, M4().makeTranslation(0, 0.04, 0));
  return B.build();
}

export function geoDeadTree() {
  const r = mulberry32(61);
  const B = new GeoBuilder();
  const bark = (x, y) => g3(0.78 + 0.25 * Math.min(1, y / 4));
  const trunk = new THREE.CylinderGeometry(0.1, 0.3, 3.8, 6, 4, true);
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 1.9;
    p.setX(i, p.getX(i) + y * y * 0.025);
    p.setY(i, y);
  }
  B.geo(trunk, bark, 0);
  const tips = [];
  for (let i = 0; i < 5; i++) {
    const y = 1.6 + i * 0.45 + r() * 0.3;
    const a = r() * TAU;
    const L = 0.9 + r() * 0.9;
    const up = 0.5 + r() * 0.6;
    const br = new THREE.CylinderGeometry(0.025, 0.07, L, 4, 1, true);
    br.translate(0, L / 2, 0);
    const m = M4().makeTranslation(y * y * 0.025, y, 0)
      .multiply(M4().makeRotationY(a))
      .multiply(M4().makeRotationZ(-(Math.PI / 2 - up)));
    B.geo(br, bark, 0, m);
    const tip = new THREE.Vector3(0, L, 0).applyMatrix4(m);
    const mid = new THREE.Vector3(0, L * 0.55, 0).applyMatrix4(m);
    tips.push(tip, mid);
  }
  // hanging moss
  const moss = [0.5, 0.58, 0.42];
  for (const t of tips) {
    const len = 0.5 + r() * 0.8, w = 0.07 + r() * 0.05;
    const ax = r() * TAU, dx = Math.cos(ax) * w, dz = Math.sin(ax) * w;
    B.quad([t.x - dx, t.y, t.z - dz], [t.x + dx, t.y, t.z + dz], [t.x + dx * 0.4, t.y - len, t.z + dz * 0.4], [t.x - dx * 0.4, t.y - len * 0.9, t.z - dz * 0.4], [moss, moss, mix3(moss, [0.35, 0.42, 0.3], 0.6), mix3(moss, [0.35, 0.42, 0.3], 0.6)], 1, [dz, 0.3, -dx]);
  }
  return B.build();
}

export function geoCrystals() {
  const r = mulberry32(71);
  const B = new GeoBuilder();
  const n = 5;
  for (let i = 0; i < n; i++) {
    const h = 0.35 + r() * 0.7, rad = 0.06 + r() * 0.07;
    const prism = new THREE.CylinderGeometry(rad, rad * 1.1, h, 6, 1, true);
    prism.translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(rad, rad * 2.4, 6, 1, true);
    tip.translate(0, h + rad * 1.2, 0);
    const m = M4().makeTranslation((r() - 0.5) * 0.35, 0, (r() - 0.5) * 0.35)
      .multiply(M4().makeRotationZ((r() - 0.5) * 0.9))
      .multiply(M4().makeRotationX((r() - 0.5) * 0.9));
    B.geo(prism, (x, y) => g3(0.55 + 0.6 * (y / h)), 0, m);
    B.geo(tip, g3(1.25), 0, m);
  }
  return B.build();
}

export function geoBoulder(seed = 81) {
  const r = mulberry32(seed);
  const B = new GeoBuilder();
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
    let k = cache.get(key);
    if (k === undefined) { k = 0.78 + r() * 0.38; cache.set(key, k); }
    const y = p.getY(i);
    p.setXYZ(i, p.getX(i) * k, (y > 0 ? y * 0.75 : y * 0.35) * k + 0.25, p.getZ(i) * k);
  }
  B.geo(g, (x, y) => g3(0.7 + 0.42 * Math.max(0, Math.min(1, (y + 0.1) / 1.0))), 0);
  return B.build();
}

export function geoPebbles() {
  const r = mulberry32(91);
  const B = new GeoBuilder();
  for (let i = 0; i < 4; i++) {
    const s = 0.06 + r() * 0.09;
    const m = M4().makeTranslation((r() - 0.5) * 0.6, s * 0.3, (r() - 0.5) * 0.6).multiply(M4().makeScale(s, s * 0.6, s * (0.8 + r() * 0.5))).multiply(M4().makeRotationY(r() * TAU));
    B.geo(new THREE.OctahedronGeometry(1, 0), (x, y) => g3(0.8 + 0.3 * (y > 0 ? 1 : 0)), 0, m);
  }
  return B.build();
}

export function geoWheat() {
  const r = mulberry32(101);
  const B = new GeoBuilder();
  for (let i = 0; i < 10; i++) {
    const x = (r() - 0.5) * 0.7, z = (r() - 0.5) * 0.35;
    const h = 0.65 + r() * 0.3, lx = (r() - 0.5) * 0.12;
    B.tri([x - 0.012, 0, z], [x + 0.012, 0, z], [x + lx, h, z], [g3(0.55), g3(0.55), g3(0.9)], 0, [0, 1, 0]);
    const hx = x + lx, hy = h;
    B.quad([hx - 0.025, hy - 0.02, z], [hx, hy - 0.06, z + 0.01], [hx + 0.025, hy + 0.06, z], [hx, hy + 0.14, z - 0.01], [g3(0.95), g3(1.05), g3(1.15), g3(1.2)], 0, [0, 1, 0]);
  }
  return B.build({ upNormals: true });
}

export function geoCabbage() {
  const B = new GeoBuilder();
  blob(B, 0, 0.16, 0, 0.2, 13, 1.2, 0.75, 0, 0.8);
  const r = mulberry32(111);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + r() * 0.5;
    const dx = Math.cos(a), dz = Math.sin(a);
    B.tri([-dz * 0.12, 0.05, dx * 0.12], [dz * 0.12, 0.05, -dx * 0.12], [dx * 0.38, 0.18, dz * 0.38], [g3(0.75), g3(0.75), g3(1.05)], 0, [0, 1, 0]);
  }
  return B.build();
}

export function geoPumpkin() {
  const B = new GeoBuilder();
  const s = new THREE.SphereGeometry(0.26, 8, 5);
  s.scale(1.15, 0.72, 1.15);
  const p = s.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const k = 1 - 0.08 * Math.abs(Math.cos(a * 4));
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  B.geo(s, (x, y) => mix3([0.78, 0.36, 0.08], [0.98, 0.58, 0.16], Math.max(0, Math.min(1, y / 0.18 + 0.5))), 1, M4().makeTranslation(0, 0.18, 0));
  B.geo(new THREE.CylinderGeometry(0.025, 0.035, 0.1, 5), [0.35, 0.3, 0.12], 1, M4().makeTranslation(0, 0.38, 0));
  const r = mulberry32(121);
  for (let i = 0; i < 4; i++) {
    const a = r() * TAU, dx = Math.cos(a), dz = Math.sin(a);
    B.tri([-dz * 0.15 + dx * 0.2, 0.04, dx * 0.15 + dz * 0.2], [dz * 0.15 + dx * 0.2, 0.04, -dx * 0.15 + dz * 0.2], [dx * 0.6, 0.12, dz * 0.6], [g3(0.75), g3(0.75), g3(1.1)], 0, [0, 1, 0]);
  }
  return B.build();
}

export function geoPine() {
  const B = new GeoBuilder();
  B.geo(new THREE.CylinderGeometry(0.1, 0.16, 1.4, 5, 1, true), [0.36, 0.26, 0.18], 1, M4().makeTranslation(0, 0.7, 0));
  const tiers = [[1.35, 2.0, 1.0], [1.05, 1.8, 2.0], [0.72, 1.6, 2.95], [0.4, 1.1, 3.75]];
  tiers.forEach(([rad, h, y], i) => {
    const c = new THREE.ConeGeometry(rad, h, 7, 1, true);
    const p = c.attributes.position;
    for (let k = 0; k < p.count; k++) if (p.getY(k) < 0) p.setY(k, p.getY(k) - 0.12 * Math.sin(k * 2.1));
    B.geo(c, (x, yy) => g3(yy < 0 ? 0.62 + i * 0.08 : 1.1 + i * 0.05), 0, M4().makeTranslation(0, y + h / 2, 0));
  });
  return B.build();
}

export function geoStones() {
  // small standing stones / rubble for highlands + ruins
  const r = mulberry32(131);
  const B = new GeoBuilder();
  for (let i = 0; i < 3; i++) {
    const s = 0.18 + r() * 0.2;
    const m = M4().makeTranslation((r() - 0.5) * 0.8, s * 0.5, (r() - 0.5) * 0.8).multiply(M4().makeRotationY(r() * TAU)).multiply(M4().makeScale(s * 1.3, s, s));
    B.geo(new THREE.DodecahedronGeometry(1, 0), (x, y) => g3(0.75 + 0.35 * (y > 0.2 ? 1 : 0)), 0, m);
  }
  return B.build();
}

// ---------------------------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------------------------
const FLOWER_PAL = {
  wilds: [0xffd84a, 0xf4f0e8, 0xb07ad8, 0xe0503a],
  brightwater: [0xffd84a, 0xfaf6ee, 0xe2533c, 0xf28cb4, 0xffa040],
  farms: [0xd83a2a, 0x5a7ae0, 0xf2d040, 0xfaf6ee],
  docks: [0xf0a0c0, 0xfaf6ee, 0xf2d040],
  hoodwood: [0x6a6ae8, 0xf2f2fa, 0xe8e070, 0x8a8af0],
  copperhollow: [0xf0a040, 0xf2d040, 0xe8e0c8],
  mistfen: [0xb8a0e0, 0xe8e8f0, 0x9ad0c0],
  gildmoor: [0xd83a2a, 0xfaf6ee, 0xf2d040, 0x9a5ad8],
  oracle: [0x8af0ff, 0xb890ff, 0xd8c8ff],
  highlands: [0xa070b0, 0xe8e0f0, 0xc888c8],
};
const FLOWER_LIN = {};
for (const k in FLOWER_PAL) FLOWER_LIN[k] = FLOWER_PAL[k].map((h) => hexRGB(h).map(lin));

const BUSH_TINT = {
  wilds: 0x4e7f34, brightwater: 0x5a8a38, farms: 0x6a8a3a, docks: 0x6a8a48, hoodwood: 0x2f5a28, copperhollow: 0x6f7a34,
  mistfen: 0x48664a, gildmoor: 0x4f8034, oracle: 0x4a7a78, highlands: 0x5a6a44,
};

export function populateOverworld(S, opts = {}) {
  const F = getOverworldFields();
  const { W, H, N, flags, heights, zoneW, occ } = F;
  const rand = mulberry32(777);
  const col = [0, 0, 0];
  const linC = (c, k = 1) => [lin(Math.min(1, c[0] * k)), lin(Math.min(1, c[1] * k)), lin(Math.min(1, c[2] * k))];
  const avg = (arr, v) => (arr[v] + arr[v + 1] + arr[v + N] + arr[v + N + 1]) * 0.25;
  const topZone = (v) => {
    let b = 0, bw = -1;
    for (let k = 0; k < ZK; k++) { const w = zoneW[v * ZK + k]; if (w > bw) { bw = w; b = k; } }
    return ZONE_KEYS[b];
  };
  const zw = (v, key) => zoneW[v * ZK + ZI[key]];
  const meadow = (x, z) => Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.sin(z * 0.09 + Math.sin(x * 0.05) * 2.5);
  const GM = ZONES.gildmoor, BW = ZONES.brightwater;

  for (let tz = 0; tz < H; tz++) for (let tx = 0; tx < W; tx++) {
    const k = tz * W + tx, f = flags[k], v = tz * N + tx;
    const h00 = heights[v], h10 = heights[v + 1], h01 = heights[v + N], h11 = heights[v + N + 1];
    const hAvg = (h00 + h10 + h01 + h11) * 0.25;
    const slope = Math.max(h00, h10, h01, h11) - Math.min(h00, h10, h01, h11);
    const zone = topZone(v);
    const o = occ[k];
    const blockedish = f & (T_BLOCK | T_WATER | T_ROAD | T_INDOOR | T_BRIDGE | T_WALL);
    const open = !blockedish && (o & ~2) === 0;
    const road = avg(F.road, v), sand = avg(F.sand, v), farm = avg(F.farm, v), mud = avg(F.mud, v), peb = avg(F.pebble, v);
    const ash = avg(F.ash, v), crys = avg(F.crystal, v), snow = avg(F.snow, v);
    const wd = F.waterDist[v], wt = F.wtype[v];
    const inTownCore = Math.hypot(tx - GM.x, tz - GM.z) < GM.wallR - 1;
    const rx = () => tx + 0.1 + rand() * 0.8, rz = () => tz + 0.1 + rand() * 0.8;

    // --- ground cover on open land ---
    if (open && hAvg > 0.15) {
      const grassy = road < 0.22 && sand < 0.35 && farm < 0.25 && mud < 0.55 && peb < 0.5 && ash < 0.45 && snow < 0.3 && slope < 0.9;
      if (grassy) {
        let dens = 1.7;
        if (zone === 'hoodwood') dens = 2.1; else if (zone === 'highlands') dens = 1.0; else if (zone === 'oracle') dens = 0.8; else if (zone === 'gildmoor' && inTownCore) dens = 0.5;
        dens *= 1 - Math.min(1, road * 3);
        let n = Math.floor(dens) + (rand() < dens % 1 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const x = rx(), z = rz();
          sampleRGB(F.base, N, x, z, col);
          S.grass.add(x, heightAt(x, z), z, rand() * TAU, 0.8 + rand() * 0.5, 0.75 + rand() * 0.6, ...linC(col, 1.04), rand());
        }
        // flowers in meadow patches
        const fl = FLOWER_LIN[zone] || FLOWER_LIN.wilds;
        const mk = meadow(tx, tz);
        let fd = (zone === 'hoodwood' ? 0.06 : zone === 'farms' ? 0.11 : zone === 'brightwater' ? 0.13 : zone === 'highlands' ? 0.1 : 0.07) * (0.25 + Math.max(0, mk) * 2.2);
        if (inTownCore) fd *= 0.4;
        if (rand() < fd) {
          const x = rx(), z = rz();
          const c = fl[Math.floor(rand() * fl.length)];
          S.flowers.add(x, heightAt(x, z), z, rand() * TAU, 0.85 + rand() * 0.5, 0.85 + rand() * 0.5, c[0], c[1], c[2], rand());
        }
        // ferns
        const fern = zw(v, 'hoodwood') * 0.16 + zw(v, 'mistfen') * 0.07;
        if (fern > 0 && rand() < fern) {
          const x = rx(), z = rz();
          sampleRGB(F.base, N, x, z, col);
          const c = linC([col[0] * 0.75, col[1] * 0.95, col[2] * 0.7]);
          S.ferns.add(x, heightAt(x, z), z, rand() * TAU, 0.8 + rand() * 0.7, 0.8 + rand() * 0.6, ...c, rand());
        }
        // mushrooms
        const mush = zw(v, 'hoodwood') * 0.022 + zw(v, 'mistfen') * 0.02;
        if (mush > 0 && rand() < mush) {
          const x = rx(), z = rz();
          const swamp = zw(v, 'mistfen') > 0.5;
          const target = swamp ? S.glowshrooms : S.mushrooms;
          const c = swamp ? hexRGB(rand() < 0.5 ? 0x7ae8d0 : 0xb0a0ff).map(lin) : hexRGB(rand() < 0.6 ? 0xc8322a : 0xd8a050).map(lin);
          target.add(x, heightAt(x, z), z, rand() * TAU, 0.9 + rand() * 0.7, 0.9 + rand() * 0.7, ...c, rand());
        }
      }
      // pebbles / scree
      if ((peb > 0.35 && rand() < 0.35) || ((zw(v, 'copperhollow') > 0.5 || zw(v, 'highlands') > 0.5) && rand() < 0.06)) {
        const x = rx(), z = rz();
        sampleRGB(F.rock, N, x, z, col);
        S.pebbles.add(x, heightAt(x, z), z, rand() * TAU, 0.8 + rand() * 0.8, 0.8 + rand() * 0.6, ...linC(col, 1.05), rand());
      }
      // bushes away from roads and town cores
      if (road < 0.05 && farm < 0.05 && !inTownCore && slope < 1.2) {
        const bz = { hoodwood: 0.075, mistfen: 0.04, wilds: 0.022, brightwater: 0.012, farms: 0.01, docks: 0.008, gildmoor: 0.015, copperhollow: 0.014, highlands: 0.012, oracle: 0 }[zone] ?? 0.02;
        if (rand() < bz && Math.hypot(tx - BW.x, tz - BW.z) > 12) {
          const x = rx(), z = rz();
          const c = hexRGB(BUSH_TINT[zone] || 0x4e7f34).map((cc) => lin(cc * (0.85 + rand() * 0.3)));
          const target = zone !== 'highlands' && zone !== 'mistfen' && rand() < 0.22 ? S.berryBushes : S.bushes;
          const s = 0.75 + rand() * 0.65;
          target.add(x, heightAt(x, z) - 0.05, z, rand() * TAU, s, s * (0.85 + rand() * 0.3), ...c, rand());
        }
      }
      // highland stones and copperhollow boulders on open ground
      const bd = zw(v, 'copperhollow') * 0.014 + zw(v, 'highlands') * 0.02 + (zone === 'wilds' ? 0.002 : 0);
      if (road < 0.05 && rand() < bd) {
        const x = rx(), z = rz();
        sampleRGB(F.rock, N, x, z, col);
        const s = 0.4 + rand() * 0.55;
        S.boulders.add(x, heightAt(x, z) - 0.1 * s, z, rand() * TAU, s, s * (0.7 + rand() * 0.5), ...linC(col, 1.0), rand());
      }
      // crystal shards on the Orbio plateau
      if (crys > 0.3 && road < 0.1 && rand() < 0.07 * crys) {
        const x = rx(), z = rz();
        const c = hexRGB(rand() < 0.55 ? 0x6fe8ff : 0xb48cff).map(lin);
        S.crystals.add(x, heightAt(x, z), z, rand() * TAU, 0.6 + rand() * 0.6, 0.6 + rand() * 0.8, ...c, rand());
      }
    }

    // --- shore reeds (land side + shallow water) ---
    if ((wt === W_LAKE || wt === W_RIVER || wt === W_SWAMP) && !(f & (T_ROAD | T_BRIDGE | T_INDOOR)) && (o & 9) === 0) {
      const landSide = hAvg > 0.05 && hAvg < 0.9 && wd < 2.6 && !(f & T_BLOCK);
      const waterSide = hAvg < 0 && hAvg > -0.7;
      if ((landSide && rand() < 0.42) || (waterSide && rand() < 0.3)) {
        const x = rx(), z = rz();
        const y = Math.max(-0.4, heightAt(x, z));
        const c = linC(wt === W_SWAMP ? [0.45, 0.55, 0.35] : [0.48, 0.62, 0.3]);
        S.reeds.add(x, y, z, rand() * TAU, 0.8 + rand() * 0.5, 0.7 + rand() * 0.6, ...c, rand());
      }
    }
    // --- lily pads ---
    if ((wt === W_LAKE || wt === W_SWAMP || (wt === W_RIVER && F.flowSpeed[v] < 0.3)) && hAvg < -0.25 && hAvg > -1.8 && F.landDist[v] < 7 && (o & 9) === 0) {
      const patch = meadow(tx * 1.7, tz * 1.7);
      if (rand() < 0.12 + Math.max(0, patch) * 0.5) {
        const x = rx(), z = rz();
        const c = linC(wt === W_SWAMP ? [0.38, 0.5, 0.28] : [0.36, 0.58, 0.26]);
        const s = 0.7 + rand() * 0.7;
        S.lilies.add(x, 0.025, z, rand() * TAU, s, 1, ...c, rand());
        if (rand() < 0.22) {
          const fc = hexRGB(rand() < 0.5 ? 0xf6c0d8 : 0xfaf6f0).map(lin);
          S.lilyFlowers.add(x + 0.05, 0.03, z + 0.05, rand() * TAU, 0.9 + rand() * 0.4, 0.9 + rand() * 0.4, ...fc, rand());
        }
      }
    }
    // --- Mistfen dead trees: in bog water and on blocked ground ---
    if (zw(v, 'mistfen') > 0.55 && (o & 9) === 0 && !(f & (T_ROAD | T_INDOOR | T_BRIDGE))) {
      const inWater = hAvg < 0 && hAvg > -1.2;
      const p = inWater ? 0.03 : (f & T_BLOCK ? 0.02 : (open ? 0.004 : 0));
      if (rand() < p) {
        const x = rx(), z = rz();
        const c = hexRGB(0x6a625a).map((cc) => lin(cc * (0.85 + rand() * 0.3)));
        const s = 0.75 + rand() * 0.5;
        S.deadTrees.add(x, Math.max(-0.9, heightAt(x, z)) - 0.15, z, rand() * TAU, s, s * (0.85 + rand() * 0.35), ...c, rand());
      }
    }
    // --- farm crops (decor fields only) ---
    if (farm > 0.6 && open) {
      for (const Fd of FARM_FIELDS) {
        if (!Fd.decor || tx < Fd.x0 || tx > Fd.x1 || tz < Fd.z0 || tz > Fd.z1) continue;
        const across = Fd.orient ? tx : tz;
        const along = Fd.orient ? tz : tx;
        if (Fd.type === 6) {
          for (let i = 0; i < 2; i++) {
            const a = along + 0.25 + i * 0.5 + (rand() - 0.5) * 0.15;
            const x = Fd.orient ? across + 0.55 : a, z = Fd.orient ? a : across + 0.55;
            const c = hexRGB(rand() < 0.5 ? 0xd8bf6a : 0xc9b25a).map(lin);
            S.wheat.add(x, heightAt(x, z), z, (Fd.orient ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.4, 0.9 + rand() * 0.25, 0.85 + rand() * 0.3, ...c, rand() * 0.6);
          }
        } else if (Fd.type === 3) {
          const x = Fd.orient ? across + 0.55 : along + 0.5, z = Fd.orient ? along + 0.5 : across + 0.55;
          const c = hexRGB(rand() < 0.6 ? 0x7ab05a : 0x5f9a4a).map(lin);
          const s = 0.8 + rand() * 0.45;
          S.cabbages.add(x, heightAt(x, z), z, rand() * TAU, s, s, ...c, rand() * 0.6);
        } else if (Fd.type === 5) {
          if (rand() < 0.55) {
            const x = Fd.orient ? across + 0.55 : along + 0.5 + (rand() - 0.5) * 0.3, z = Fd.orient ? along + 0.5 : across + 0.55;
            const c = hexRGB(0x4f8a38).map(lin);
            const s = 0.75 + rand() * 0.6;
            S.pumpkins.add(x, heightAt(x, z), z, rand() * TAU, s, s, ...c, rand() * 0.6);
          }
        }
      }
    }
    // --- blocked terrain: boulders on cliffs, pines on mountain edges, crystals on the plateau cliff ---
    if ((f & T_BLOCK) && !(f & (T_WATER | T_WALL | T_INDOOR)) && (o & 2) === 0) {
      const cliff = f & T_CLIFF, edge = f & T_EDGE;
      if (cliff && rand() < 0.1) {
        const x = rx(), z = rz();
        sampleRGB(F.rock, N, x, z, col);
        const s = 0.6 + rand() * 1.0;
        S.boulders.add(x, heightAt(x, z) - 0.25 * s, z, rand() * TAU, s, s * (0.7 + rand() * 0.5), ...linC(col, 1.0), rand());
      }
      if ((edge || (cliff && hAvg > 9)) && hAvg > 1.5 && hAvg < 30 && slope < 2.6 && crys < 0.2 && rand() < (edge ? 0.07 : 0.035)) {
        const x = rx(), z = rz();
        const hgt = heightAt(x, z);
        const t = Math.min(1, Math.max(0, (hgt - 12) / 20));
        const c = [lin(0.2 + 0.12 * t), lin(0.36 + 0.06 * t), lin(0.24 + 0.12 * t)];
        const s = 0.8 + rand() * 0.7;
        S.pines.add(x, hgt - 0.2, z, rand() * TAU, s, s * (0.9 + rand() * 0.4), ...c, rand());
      }
      if (crys > 0.05 && cliff && rand() < 0.22) {
        const x = rx(), z = rz();
        const c = hexRGB(rand() < 0.5 ? 0x6fe8ff : 0xb48cff).map(lin);
        S.crystals.add(x, heightAt(x, z), z, rand() * TAU, 1.0 + rand() * 1.2, 1.0 + rand() * 1.4, ...c, rand());
      }
    }
  }

  // --- pines + boulders on the skirt mountains beyond the world edge ---
  for (let i = 0; i < 9000; i++) {
    const x = -150 + rand() * 620, z = -150 + rand() * 470;
    if (x > 1 && x < 319 && z > 1) continue;
    if (z > 296) continue;
    const h = skirtHeight(x, z);
    if (h < 2 || h > 56) continue;
    const sl = Math.abs(skirtHeight(x + 2, z) - h) + Math.abs(skirtHeight(x, z + 2) - h);
    if (sl > 3.2) continue;
    const dEdge = Math.max(-x, x - 320, -z, 0);
    if (rand() > 1.15 - dEdge / 130) continue;
    const t = Math.min(1, Math.max(0, (h - 20) / 34));
    const c = [lin(0.19 + 0.13 * t), lin(0.35 + 0.08 * t), lin(0.24 + 0.14 * t)];
    const s = 1.0 + rand() * 0.9;
    S.pines.add(x, h - 0.3, z, rand() * TAU, s, s * (0.9 + rand() * 0.5), ...c, rand());
  }
  return S;
}
