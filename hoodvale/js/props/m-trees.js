// Tree, stump, rock, ore and crystal geometries (built once, drawn instanced).
// Owner: props builder. All geometry is in local space: origin at ground centre, +y up.

import * as THREE from 'three';
import { Builder, M, TILE, mulberry32 } from './kit.js';

// Noise-displaced icosahedron blob.
function blobGeo(r, detail, seed, rough = 0.18, flatBottom = 0.35) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const P = g.attributes.position;
  const rnd = mulberry32(seed);
  const a1 = rnd() * 6, a2 = rnd() * 6, a3 = rnd() * 6;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    const nx = x / l, ny = y / l, nz = z / l;
    const n = Math.sin(nx * 3.1 + a1) * Math.sin(ny * 2.7 + a2) * Math.sin(nz * 3.3 + a3);
    const k = 1 + rough * n + rough * 0.5 * Math.sin(nx * 7 + ny * 5 + a3);
    x = nx * r * k; y = ny * r * k; z = nz * r * k;
    if (y < -r * flatBottom) y = -r * flatBottom + (y + r * flatBottom) * 0.35;
    P.setXYZ(i, x, y, z);
  }
  return g;
}

// Trunk: tapered, gently bent cylinder from (0,0,0) up h, with root flare.
function trunk(b, { h, r0, r1, bend = 0.2, seg = 7, color, seed = 1, lean = 0, flare = 1.35 }) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 4, true);
  g.translate(0, h / 2, 0);
  const P = g.attributes.position;
  const rnd = mulberry32(seed);
  const ph = rnd() * 6;
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i), t = y / h;
    const fl = 1 + (flare - 1) * Math.pow(1 - t, 6);
    P.setX(i, P.getX(i) * fl + Math.sin(t * 2.2 + ph) * bend * t + lean * t * t);
    P.setZ(i, P.getZ(i) * fl + Math.cos(t * 1.7 + ph) * bend * 0.6 * t);
  }
  g.computeVertexNormals();
  b.geo(g, null, { tile: TILE.BARK, color, uvScale: 1.1, ao: [0, 1.2, 0.55], vnoise: 0.06 });
  return (t) => [Math.sin(t * 2.2 + ph) * bend * t + lean * t * t, t * h, Math.cos(t * 1.7 + ph) * bend * 0.6 * t];
}

// A limb: tapered cylinder between two points.
function limb(b, a, c, r0, r1, color) {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...a), q, new THREE.Vector3(1, 1, 1));
  b.geo(g, m, { tile: TILE.BARK, color, uvScale: 1.1 });
}

function crown(b, { x, y, z, r, sx = 1, sy = 1, sz = 1, color, seed, detail, glow = null, sway = 0.05, ry = 0, rough = 0.18, yTop = 6 }) {
  const g = blobGeo(r, detail, seed, rough);
  b.geo(g, M(x, y, z, ry, 0, 0, sx, sy, sz), {
    tile: TILE.LEAVES, color, uvScale: 1.3, grad: [-r, r, 0.62, 1.14], vnoise: 0.07,
    sway: (wx, wy) => sway * Math.max(0, wy - 1.2) / yTop,
    glow, glowMode: glow ? 'always' : undefined,
  });
}

// ---------------------------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------------------------
export const TREE_INFO = {
  'tree-broadleaf': { bark: '#7a5a3c', leaf: '#5f9b3c', height: 5 },
  'tree-oak': { bark: '#6b4e33', leaf: '#41782f', height: 6 },
  'tree-willow': { bark: '#76664a', leaf: '#8fae4a', height: 6 },
  'tree-maple': { bark: '#6e4a36', leaf: '#c8532c', height: 7 },
  'tree-yew': { bark: '#6a3d2c', leaf: '#2c4d2f', height: 7.5 },
  'tree-elder': { bark: '#b9b1c9', leaf: '#7b52b8', height: 6.5 },
};

export function treeGeometry(kind, lod = 1) {
  const b = new Builder(kind.length * 97 + 13);
  const D = lod >= 1 ? 1 : 0;
  const info = TREE_INFO[kind] || TREE_INFO['tree-broadleaf'];
  const rnd = mulberry32(kind.length * 31 + 7);
  const leafVar = (k) => new THREE.Color(info.leaf).offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.08 * k);

  if (kind === 'tree-oak') {
    const at = trunk(b, { h: 2.6, r0: 0.5, r1: 0.34, bend: 0.15, color: info.bark, seed: 3, flare: 1.5 });
    const top = at(1);
    limb(b, [top[0], 2.2, top[2]], [-1.3, 3.4, 0.4], 0.24, 0.14, info.bark);
    limb(b, [top[0], 2.4, top[2]], [1.2, 3.6, -0.5], 0.22, 0.13, info.bark);
    limb(b, [top[0], 2.5, top[2]], [0.2, 3.9, 1.1], 0.2, 0.12, info.bark);
    const blobs = [[0, 4.3, 0, 1.7], [-1.5, 3.8, 0.5, 1.35], [1.4, 4.0, -0.6, 1.4], [0.3, 3.9, 1.4, 1.3], [-0.4, 4.0, -1.4, 1.3], [0.6, 5.1, 0.2, 1.15]];
    if (D) blobs.push([-1.0, 4.9, -0.4, 1.0], [1.5, 3.4, 0.9, 1.0]);
    blobs.forEach(([x, y, z, r], i) => crown(b, { x, y, z, r, sy: 0.78, color: leafVar(1), seed: 40 + i, detail: D, yTop: 6 }));
  } else if (kind === 'tree-willow') {
    const at = trunk(b, { h: 3.0, r0: 0.42, r1: 0.28, bend: 0.35, color: info.bark, seed: 5, lean: 0.25, flare: 1.45 });
    const top = at(1);
    limb(b, [top[0], 2.6, top[2]], [-1.2, 3.8, 0.3], 0.2, 0.12, info.bark);
    limb(b, [top[0], 2.7, top[2]], [1.1, 3.9, -0.2], 0.2, 0.12, info.bark);
    const dome = [[top[0], 4.3, top[2], 1.55], [-1.1, 4.0, 0.4, 1.2], [1.1, 4.1, -0.3, 1.2]];
    dome.forEach(([x, y, z, r], i) => crown(b, { x, y, z, r, sy: 0.7, color: leafVar(1), seed: 60 + i, detail: D, sway: 0.07 }));
    // hanging curtains of fronds
    const n = D ? 18 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
      const rr = 1.75 + rnd() * 0.5;
      const len = 2.0 + rnd() * 1.1;
      const g = blobGeo(0.5, 0, 200 + i, 0.12, 1);
      const x = Math.cos(a) * rr + top[0] * 0.5, z = Math.sin(a) * rr;
      b.geo(g, M(x, 4.0 - len * 0.55, z, -a, 0, 0, 0.75, len, 0.45), {
        tile: TILE.LEAVES, color: new THREE.Color(info.leaf).offsetHSL(0.01, 0.05, 0.04 + (rnd() - 0.5) * 0.06), uvScale: 0.9, uvRot: true,
        grad: [-0.5, 0.5, 0.7, 1.08],
        sway: (wx, wy) => 0.16 * Math.max(0, 4.2 - wy) / 3,
      });
    }
  } else if (kind === 'tree-maple') {
    const at = trunk(b, { h: 3.0, r0: 0.36, r1: 0.24, bend: 0.12, color: info.bark, seed: 7, flare: 1.4 });
    const top = at(1);
    limb(b, [top[0], 2.6, top[2]], [-1.0, 3.6, 0.5], 0.16, 0.1, info.bark);
    limb(b, [top[0], 2.8, top[2]], [1.0, 3.8, -0.4], 0.16, 0.1, info.bark);
    const blobs = [[0, 3.9, 0, 1.75], [0.1, 5.1, 0.1, 1.35], [0, 6.1, 0, 0.85], [-1.1, 4.0, 0.6, 1.1], [1.1, 4.2, -0.5, 1.1]];
    if (D) blobs.push([0.5, 4.6, 1.0, 1.0], [-0.6, 4.8, -0.9, 1.0]);
    const reds = ['#c8532c', '#d86a2e', '#b2402a', '#e07f36', '#c24a2a'];
    blobs.forEach(([x, y, z, r], i) => crown(b, { x, y, z, r, sy: 0.85, color: new THREE.Color(reds[i % reds.length]).offsetHSL(0, 0, (rnd() - 0.5) * 0.05), seed: 80 + i, detail: D, yTop: 7 }));
  } else if (kind === 'tree-yew') {
    trunk(b, { h: 2.2, r0: 0.48, r1: 0.36, bend: 0.1, color: info.bark, seed: 9, flare: 1.5 });
    const tiers = [[0, 2.6, 0, 2.0, 0.8], [0.1, 3.9, 0.05, 1.8, 0.85], [-0.05, 5.1, 0, 1.45, 0.9], [0, 6.2, 0.05, 1.0, 1.0], [0, 7.0, 0, 0.6, 1.1]];
    tiers.forEach(([x, y, z, r, sy], i) => crown(b, { x, y, z, r, sy, color: leafVar(1.2), seed: 100 + i, detail: D, rough: 0.24, sway: 0.035, yTop: 7.5 }));
    if (D) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        crown(b, { x: Math.cos(a) * 1.3, y: 3.2 + (i % 3) * 0.9, z: Math.sin(a) * 1.3, r: 0.75, color: leafVar(1.4), seed: 120 + i, detail: 0, rough: 0.2, sway: 0.03 });
      }
      // red arils
      for (let i = 0; i < 14; i++) {
        const a = rnd() * Math.PI * 2, y = 2.6 + rnd() * 3.8, rr = (2.0 - (y - 2.6) * 0.32) * 0.98;
        b.geo(new THREE.OctahedronGeometry(0.09, 0), M(Math.cos(a) * rr, y, Math.sin(a) * rr), { color: '#c8322a', flat: true });
      }
    }
  } else if (kind === 'tree-elder') {
    const at = trunk(b, { h: 2.8, r0: 0.42, r1: 0.26, bend: 0.4, color: info.bark, seed: 11, lean: -0.2, flare: 1.6 });
    const top = at(1);
    limb(b, [top[0], 2.4, top[2]], [-1.3, 3.5, -0.4], 0.18, 0.1, info.bark);
    limb(b, [top[0], 2.6, top[2]], [1.2, 3.7, 0.6], 0.18, 0.1, info.bark);
    const blobs = [[top[0], 4.2, top[2], 1.6], [-1.3, 3.9, -0.4, 1.15], [1.3, 4.1, 0.6, 1.15], [0, 5.2, 0, 1.0]];
    if (D) blobs.push([0.4, 4.2, -1.2, 1.0], [-0.5, 4.3, 1.2, 1.0]);
    const vio = ['#7b52b8', '#8a5ec8', '#6a46a6', '#9468cf'];
    blobs.forEach(([x, y, z, r], i) => crown(b, { x, y, z, r, sy: 0.82, color: vio[i % vio.length], seed: 140 + i, detail: D, glow: '#2a1240', yTop: 6 }));
    // glimmering motes
    for (let i = 0; i < (D ? 22 : 10); i++) {
      const bl = blobs[i % blobs.length];
      const a = rnd() * Math.PI * 2, e = (rnd() - 0.2) * 1.2;
      const rr = bl[3] * 0.98;
      b.geo(new THREE.OctahedronGeometry(0.08 + rnd() * 0.06, 0), M(bl[0] + Math.cos(a) * Math.cos(e) * rr, bl[1] + Math.sin(e) * rr * 0.82, bl[2] + Math.sin(a) * Math.cos(e) * rr), {
        color: '#e8d4ff', glow: '#c9a0ff', glowMode: 'always', glowK: 1, flat: true, sway: 0.05,
      });
    }
    // faint violet veins in the bark
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.box(0.05, 1.6, 0.03, M(Math.cos(a) * 0.36, 1.0, Math.sin(a) * 0.36, -a + Math.PI / 2, 0, 0.15), { color: '#d7b8ff', glow: '#b38cff', glowMode: 'always', glowK: 0.6 });
    }
  } else {
    // broadleaf (1x1)
    const at = trunk(b, { h: 2.3, r0: 0.25, r1: 0.16, bend: 0.18, color: info.bark, seed: 1 });
    const top = at(1);
    limb(b, [top[0], 2.0, top[2]], [-0.7, 2.9, 0.2], 0.1, 0.06, info.bark);
    limb(b, [top[0], 2.1, top[2]], [0.6, 3.0, -0.3], 0.1, 0.06, info.bark);
    const blobs = [[top[0], 3.35, top[2], 1.3], [-0.75, 3.0, 0.3, 0.95], [0.75, 3.1, -0.3, 0.95], [0.1, 3.0, 0.8, 0.9], [0, 4.15, 0, 0.85]];
    if (D) blobs.push([-0.3, 3.3, -0.8, 0.85]);
    blobs.forEach(([x, y, z, r], i) => crown(b, { x, y, z, r, sy: 0.88, color: leafVar(1), seed: 20 + i, detail: D, yTop: 5 }));
  }
  return b.build();
}

export function stumpGeometry() {
  const b = new Builder(77);
  const side = new THREE.CylinderGeometry(0.34, 0.42, 0.5, 9, 1, true);
  side.translate(0, 0.25, 0);
  b.geo(side, null, { tile: TILE.BARK, color: '#7a5a3c', uvScale: 1 });
  const cap = new THREE.CircleGeometry(0.34, 9);
  cap.rotateX(-Math.PI / 2);
  // slanted axe cut
  b.geo(cap, M(0, 0.5, 0, 0, 0.12, 0), { tile: TILE.LOGEND, uv: 'own', color: '#e2c9a0' });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    b.box(0.16, 0.18, 0.55, M(Math.cos(a) * 0.4, 0.06, Math.sin(a) * 0.4, -a + Math.PI / 2, -0.25, 0), { tile: TILE.BARK, color: '#6f523a' });
  }
  // a few chips around
  for (let i = 0; i < 5; i++) {
    const a = i * 1.7;
    b.box(0.12, 0.03, 0.07, M(Math.cos(a) * 0.65, 0.02, Math.sin(a) * 0.7, a), { color: '#d8b98a' });
  }
  return b.build();
}

// ---------------------------------------------------------------------------------------------
// Rocks
// ---------------------------------------------------------------------------------------------
export function rockGeometry(lod = 1) {
  const b = new Builder(501);
  const D = lod >= 1 ? 1 : 0;
  b.geo(blobGeo(0.72, D, 3, 0.2, 0.25), M(0, 0.32, 0, 0, 0, 0, 1.15, 0.8, 1.0), { tile: TILE.ROCK, color: '#ffffff', flat: true, uvScale: 1.6, grad: [-0.7, 0.7, 0.62, 1.12] });
  // mossy cap and lichen on the big boulder
  b.geo(blobGeo(0.36, 0, 13, 0.25, 0.5), M(-0.18, 0.74, -0.1, 0.4, 0, 0, 1.2, 0.22, 1.0), { tile: TILE.TURF, color: '#9ab868', flat: true, uvScale: 0.8, jit: 0.1 });
  for (let i = 0; i < 4; i++) b.geo(new THREE.CircleGeometry(0.09 + i * 0.02, 6), M(0.5 - i * 0.3, 0.3 + (i % 2) * 0.2, 0.55 - (i % 3) * 0.2, i, -0.5), { color: '#c8c890', jit: 0.15 });
  b.geo(blobGeo(0.42, 0, 5, 0.22, 0.2), M(0.72, 0.18, 0.35, 0.6, 0, 0, 1, 0.8, 1), { tile: TILE.ROCK, color: '#f2f2f2', flat: true, uvScale: 1.6 });
  b.geo(blobGeo(0.34, 0, 7, 0.22, 0.2), M(-0.6, 0.14, -0.45, 1.2, 0, 0, 1, 0.8, 1), { tile: TILE.ROCK, color: '#ececec', flat: true, uvScale: 1.6 });
  b.geo(blobGeo(0.2, 0, 9, 0.22, 0.2), M(-0.2, 0.07, 0.75, 0.3), { tile: TILE.ROCK, color: '#e0e0e0', flat: true });
  return b.build();
}
// Ore nuggets poking out of the rock (tinted by instance colour).
export function nuggetGeometry() {
  const b = new Builder(601);
  const pts = [[0.35, 0.72, 0.3], [-0.38, 0.66, 0.28], [0.1, 0.84, -0.25], [0.62, 0.42, -0.35], [-0.65, 0.42, -0.1], [0.05, 0.5, 0.66], [0.85, 0.3, 0.38], [-0.3, 0.38, -0.6]];
  pts.forEach(([x, y, z], i) => {
    const g = new THREE.OctahedronGeometry(0.13 + (i % 3) * 0.035, 0);
    b.geo(g, M(x, y, z, i * 1.3, i * 0.7, i * 0.4, 1, 0.8, 1.1), { color: '#ffffff', flat: true, jit: 0.1 });
  });
  return b.build();
}

// Orbium crystal cluster: base stones + glowing prisms (glow scales with instance colour).
export function crystalGeometry(lod = 1) {
  const b = new Builder(701);
  b.geo(blobGeo(0.55, 0, 11, 0.2, 0.2), M(0, 0.15, 0, 0, 0, 0, 1.2, 0.6, 1), { tile: TILE.ROCK, color: '#5e5870', flat: true });
  const spikes = [[0, 0, 0, 0.26, 1.7, 0, 0], [0.32, 0, 0.12, 0.18, 1.15, 0.35, -0.3], [-0.3, 0, 0.1, 0.17, 1.0, -0.4, 0.2], [0.05, 0, -0.32, 0.16, 0.95, 0.1, 0.45], [-0.12, 0, 0.36, 0.13, 0.75, -0.2, -0.55], [0.4, 0, -0.3, 0.12, 0.6, 0.5, 0.4]];
  spikes.forEach(([x, y, z, r, h, rz, rx], i) => {
    const g = new THREE.CylinderGeometry(r * 0.9, r, h * 0.78, 6, 1);
    g.translate(0, h * 0.39, 0);
    const tip = new THREE.ConeGeometry(r * 0.9, h * 0.22, 6);
    tip.translate(0, h * 0.78 + h * 0.11, 0);
    const m = M(x, y + 0.1, z, i * 0.5, rx, rz);
    const o = { tile: TILE.CRYSTAL, color: i % 2 ? '#8fe3ff' : '#b39cff', glow: '#9ad8ff', glowMode: 'tinted', glowK: 0.38, flat: true, uvScale: 0.8 };
    b.geo(g, m, o);
    b.geo(tip, m, o);
  });
  return b.build();
}
