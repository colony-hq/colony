// Ground item models: a small 3D model per item icon shape (data/items.js icon.shape/color/color2).
// Geometry is cached per shape+colours. Local origin = ground centre, models lie on the ground.
// Owner: props builder.

import * as THREE from 'three';
import { Builder, M, TILE, mulberry32 } from './kit.js';
import { at, cylinder, sphere, torus, bucket } from './parts.js';

const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

function blade(b, m, len, w, col, o = {}) {
  // flat blade with a tapered tip, lying along +x
  b.box(len, 0.025, w, at(m, len / 2, 0, 0), { tile: TILE.METAL, color: col, uvScale: 0.5 });
  const tip = new THREE.CylinderGeometry(0, w / 2, w * 1.3, 4, 1); tip.rotateZ(-Math.PI / 2); tip.scale(1, 0.12, 1);
  b.geo(tip, at(m, len + w * 0.6, 0, 0), { tile: TILE.METAL, color: col, flat: true });
  if (o.fuller) b.box(len * 0.8, 0.03, w * 0.18, at(m, len * 0.45, 0.002, 0), { color: shade(col, 0.7) });
}
function hilt(b, m, guardW, grip, col2) {
  b.box(0.05, 0.05, guardW, at(m, -0.02, 0, 0), { tile: TILE.METAL, color: col2 || '#c9a24a' });
  cylinder(b, at(m, -0.04 - grip, 0, 0, 0, 0, Math.PI / 2), 0.022, 0.022, grip, { color: '#4a2e1e' }, 6);
  sphere(b, at(m, -0.06 - grip, 0, 0), 0.035, { tile: TILE.METAL, color: col2 || '#c9a24a' }, 6, 4);
}

const SHAPES = {
  logs(b, c) {
    const pos = [[0, 0.07, -0.08], [0, 0.07, 0.08], [0, 0.2, 0]];
    for (const [x, y, z] of pos) {
      const m = M(x, y, z, 0, 0, Math.PI / 2);
      cylinder(b, at(m, 0, -0.22, 0), 0.075, 0.075, 0.44, { tile: TILE.BARK, color: c, uvScale: 0.6 }, 7);
      for (const s of [-1, 1]) {
        const cap = new THREE.CircleGeometry(0.075, 7); cap.rotateX(s * -Math.PI / 2);
        b.geo(cap, at(m, 0, s * 0.22, 0), { tile: TILE.LOGEND, uv: 'own', color: '#e6cc9c' });
      }
    }
  },
  ore(b, c) {
    const dark = c === '#2b2b2b';
    const g = new THREE.DodecahedronGeometry(0.15, 0);
    b.geo(g, M(0, 0.1, 0, 0.5, 0.3, 0, 1, 0.75, 0.9), { tile: TILE.ROCK, color: dark ? '#2b2a28' : '#8a8276', flat: true });
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7;
      b.geo(new THREE.OctahedronGeometry(0.05, 0), M(Math.cos(a) * 0.1, 0.16 + (i % 2) * 0.03, Math.sin(a) * 0.09, a), { color: c, flat: true, glow: c === '#b8a8ff' || c === '#3f6fd8' ? c : null, glowMode: 'tinted', glowK: 0.3 });
    }
  },
  shard(b, c, c2) {
    for (const [x, z, h, r] of [[0, 0, 0.32, 0.4], [0.07, 0.05, 0.22, -0.5], [-0.07, 0.04, 0.2, 0.7]]) {
      const g = new THREE.CylinderGeometry(0.035, 0.05, h, 6); g.translate(0, h / 2, 0);
      const tip = new THREE.ConeGeometry(0.035, 0.08, 6); tip.translate(0, h + 0.04, 0);
      const m = M(x, 0.02, z, r, 0, r * 0.5);
      const o = { tile: TILE.CRYSTAL, color: c, glow: c2 || c, glowMode: 'tinted', glowK: 0.45, flat: true };
      b.geo(g, m, o); b.geo(tip, m, o);
    }
  },
  bar(b, c) {
    for (const [y, r] of [[0, 0.2], [0.1, -0.15]]) {
      const g = new THREE.CylinderGeometry(0.11, 0.15, 0.09, 4, 1); g.rotateY(Math.PI / 4); g.scale(1.7, 1, 0.7);
      b.geo(g, M(0, 0.045 + y, 0, r), { tile: TILE.METAL, color: c, flat: true });
    }
  },
  gem(b, c) { b.geo(new THREE.OctahedronGeometry(0.1, 0), M(0, 0.1, 0, 0.4, 0, 0, 1, 1.1, 1), { color: c, glow: c, glowMode: 'tinted', glowK: 0.35, flat: true }); },
  'gem-rough'(b, c) { b.geo(new THREE.DodecahedronGeometry(0.1, 0), M(0, 0.08, 0, 0.4, 0.3), { tile: TILE.ROCK, color: c, flat: true, glow: c, glowMode: 'tinted', glowK: 0.12 }); },
  fish(b, c, c2) {
    sphere(b, M(0, 0.06, 0, 0, 0, 0, 2.6, 0.75, 0.9), 0.085, { color: c, grad: [-0.08, 0.08, 0.8, 1.15] }, 10, 6);
    const tail = new THREE.ConeGeometry(0.07, 0.12, 4); tail.rotateZ(Math.PI / 2); tail.scale(1, 1, 0.25);
    b.geo(tail, M(0.27, 0.06, 0), { color: shade(c, 0.85), flat: true });
    const fin = new THREE.ConeGeometry(0.04, 0.08, 3); fin.scale(1.5, 1, 0.2);
    b.geo(fin, M(0.0, 0.14, 0), { color: shade(c, 0.8), flat: true });
    sphere(b, M(-0.17, 0.08, 0.045), 0.014, { color: '#101010' }, 5, 4);
  },
  lobster(b, c) {
    for (let i = 0; i < 4; i++) sphere(b, M(0.05 + i * 0.07, 0.05, 0, 0, 0, 0, 1, 0.7, 1.2), 0.06 - i * 0.007, { color: c }, 7, 5);
    sphere(b, M(-0.07, 0.06, 0, 0, 0, 0, 1.5, 0.8, 1), 0.08, { color: c }, 8, 5);
    for (const s of [-1, 1]) {
      b.box(0.12, 0.025, 0.025, M(-0.17, 0.05, s * 0.07, s * 0.6), { color: c });
      sphere(b, M(-0.26, 0.05, s * 0.13, 0, 0, 0, 1.6, 0.6, 1), 0.05, { color: shade(c, 1.1) }, 7, 5);
      for (let k = 0; k < 3; k++) b.box(0.09, 0.012, 0.012, M(0.0 + k * 0.05, 0.03, s * 0.08, s * (0.9 + k * 0.2)), { color: c });
    }
  },
  meat(b, c) {
    sphere(b, M(0, 0.05, 0, 0, 0, 0, 1.3, 0.45, 1), 0.13, { color: c, grad: [-0.1, 0.1, 0.8, 1.1] }, 9, 6);
    cylinder(b, M(0.13, 0.05, 0, 0, 0, Math.PI / 2), 0.025, 0.025, 0.12, { color: '#efe8d8' }, 6);
  },
  drumstick(b, c) {
    sphere(b, M(-0.04, 0.07, 0, 0, 0, 0, 1.4, 0.9, 1), 0.08, { color: c }, 9, 6);
    cylinder(b, M(0.04, 0.05, 0, 0, 0, Math.PI / 2 + 0.2), 0.018, 0.018, 0.14, { color: '#efe8d8' }, 6);
    sphere(b, M(0.18, 0.08, 0), 0.025, { color: '#efe8d8' }, 6, 4);
  },
  bread(b, c) {
    sphere(b, M(0, 0.06, 0, 0, 0, 0, 1.6, 0.85, 1), 0.1, { color: c, grad: [-0.1, 0.1, 0.75, 1.15] }, 10, 6);
    for (let i = 0; i < 3; i++) b.box(0.015, 0.01, 0.12, M(-0.07 + i * 0.07, 0.143, 0, 0.4), { color: shade(c, 1.3) });
  },
  cake(b, c, c2) {
    cylinder(b, M(0, 0, 0), 0.14, 0.14, 0.1, { color: c }, 12);
    cylinder(b, M(0, 0.1, 0), 0.145, 0.145, 0.025, { color: c2 || '#f7efe0' }, 12);
    sphere(b, M(0, 0.14, 0), 0.025, { color: '#d0453a' }, 6, 4);
  },
  dough(b, c) { sphere(b, M(0, 0.04, 0, 0, 0, 0, 1.2, 0.5, 1), 0.11, { color: c }, 9, 6); },
  egg(b, c) { sphere(b, M(0, 0.06, 0, 0, 0.2, 1.3, 1, 1.3, 1), 0.05, { color: c }, 8, 6); },
  bones(b, c) {
    for (const [r, y] of [[0.4, 0.03], [-0.5, 0.06]]) {
      const m = M(0, y, 0, r, 0, Math.PI / 2);
      cylinder(b, at(m, 0, -0.16, 0), 0.025, 0.025, 0.32, { color: c }, 6);
      for (const s of [-1, 1]) for (const z of [-0.025, 0.025]) sphere(b, at(m, z, s * 0.17, 0), 0.035, { color: c }, 6, 4);
    }
  },
  axe(b, c) {
    b.box(0.5, 0.035, 0.035, M(0, 0.02, 0), { color: '#7a5636' });
    b.box(0.08, 0.04, 0.16, M(0.22, 0.025, -0.07), { tile: TILE.METAL, color: c });
    const e = new THREE.CylinderGeometry(0.1, 0.1, 0.04, 8, 1, false, 0, Math.PI); e.rotateY(Math.PI / 2);
    b.geo(e, M(0.22, 0.025, -0.14), { tile: TILE.METAL, color: c });
  },
  pickaxe(b, c) {
    b.box(0.5, 0.035, 0.035, M(0, 0.02, 0), { color: '#7a5636' });
    const g = new THREE.TorusGeometry(0.17, 0.02, 4, 8, Math.PI * 0.8); g.rotateX(Math.PI / 2);
    b.geo(g, M(0.24 - 0.17, 0.03, 0, Math.PI / 2 + Math.PI * 0.1), { tile: TILE.METAL, color: c });
  },
  hammer(b, c) { b.box(0.32, 0.03, 0.03, M(0, 0.02, 0), { color: '#7a5636' }); b.box(0.06, 0.06, 0.13, M(0.15, 0.035, 0), { tile: TILE.METAL, color: c }); },
  knife(b, c) { blade(b, M(0, 0.02, 0), 0.14, 0.035, c); b.box(0.1, 0.03, 0.03, M(-0.05, 0.02, 0), { color: '#5a3a24' }); },
  chisel(b, c) { b.box(0.18, 0.025, 0.025, M(0, 0.02, 0), { tile: TILE.METAL, color: c }); b.box(0.08, 0.035, 0.035, M(-0.12, 0.02, 0), { color: '#7a5636' }); },
  needle(b, c) { b.box(0.14, 0.012, 0.012, M(0, 0.01, 0), { color: c }); torus(b, M(0.0, 0.05, 0.0, 0, 0, Math.PI / 2), 0.04, 0.006, { color: '#e8e2d0' }, 3, 8); },
  tinderbox(b, c) { b.box(0.16, 0.06, 0.1, M(0, 0.03, 0), { tile: TILE.PLANKS, color: c }); b.box(0.06, 0.02, 0.04, M(0.03, 0.07, 0), { color: '#5a5e64' }); },
  net(b, c) { cylinder(b, M(0, 0.07, 0, 0, Math.PI / 2), 0.08, 0.08, 0.36, { tile: TILE.SACK, color: c, uvScale: 0.3 }, 8); cylinder(b, M(0.2, 0.02, 0, 0, 0, Math.PI / 2), 0.015, 0.015, 0.3, { color: '#7a5636' }, 5); },
  rod(b, c) { cylinder(b, M(-0.3, 0.02, 0, 0, 0, -Math.PI / 2), 0.008, 0.016, 0.7, { color: c }, 5); cylinder(b, M(-0.18, 0.04, 0.02, 0, Math.PI / 2), 0.03, 0.03, 0.03, { tile: TILE.METAL, color: '#8a8f95' }, 8); },
  harpoon(b, c) { cylinder(b, M(-0.3, 0.025, 0, 0, 0, -Math.PI / 2), 0.015, 0.015, 0.6, { color: '#7a5636' }, 5); blade(b, M(0.3, 0.025, 0), 0.08, 0.05, c); },
  'pot-cage'(b, c) { cylinder(b, M(0, 0.0, 0), 0.14, 0.17, 0.22, { tile: TILE.HAY, color: c, uvScale: 0.4 }, 9, true); cylinder(b, M(0, 0.22, 0), 0.06, 0.14, 0.05, { tile: TILE.HAY, color: c }, 9, true); },
  bucket(b, c, c2) { bucket(b, M(0, 0, 0, 0, 0, 0, 0.8), { color: c, fill: c2 || '#2a2420' }); },
  pot(b, c, c2) {
    const prof = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.08, 0), new THREE.Vector2(0.11, 0.07), new THREE.Vector2(0.09, 0.15), new THREE.Vector2(0.06, 0.17), new THREE.Vector2(0.07, 0.19)];
    b.geo(new THREE.LatheGeometry(prof, 10), M(0, 0, 0), { color: c });
    if (c2) cylinder(b, M(0, 0.165, 0), 0.055, 0.055, 0.01, { color: c2 }, 8);
  },
  grain(b, c) { for (let i = 0; i < 6; i++) { b.box(0.3, 0.012, 0.012, M(0, 0.02, -0.04 + i * 0.016, (i - 3) * 0.06), { color: '#c9a646' }); b.geo(new THREE.OctahedronGeometry(0.03, 0), M(0.17, 0.03, -0.04 + i * 0.016, 0, 0, Math.PI / 2, 1, 2.6, 1), { color: c, flat: true }); } },
  flax(b, c) { for (let i = 0; i < 5; i++) { b.box(0.28, 0.012, 0.012, M(0, 0.02, -0.03 + i * 0.015, (i - 2) * 0.08), { color: '#6f9150' }); b.geo(new THREE.OctahedronGeometry(0.03, 0), M(0.15, 0.03, -0.03 + i * 0.015), { color: c, flat: true }); } },
  string(b, c) { torus(b, M(0, 0.02, 0, 0, Math.PI / 2), 0.08, 0.012, { color: c }, 4, 14); torus(b, M(0.01, 0.035, 0, 0, Math.PI / 2), 0.07, 0.012, { color: c }, 4, 14); },
  thread(b, c) { cylinder(b, M(0, 0, 0), 0.05, 0.05, 0.1, { color: c }, 10); cylinder(b, M(0, 0.1, 0), 0.06, 0.06, 0.015, { color: '#7a5636' }, 10); cylinder(b, M(0, -0.0, 0), 0.06, 0.06, 0.015, { color: '#7a5636' }, 10); },
  hide(b, c) {
    const g = new THREE.CircleGeometry(0.22, 9); g.rotateX(-Math.PI / 2);
    const P = g.attributes.position;
    for (let i = 1; i < P.count; i++) { const k = 1 + 0.25 * Math.sin(i * 2.3); P.setX(i, P.getX(i) * k * 1.2); P.setZ(i, P.getZ(i) * k); }
    b.geo(g, M(0, 0.015, 0), { tile: TILE.SACK, color: c, uvScale: 0.5 });
    b.geo(g, M(0, 0.012, 0, 0, Math.PI), { color: c });
  },
  feather(b, c) { const g = new THREE.CircleGeometry(0.1, 8); g.rotateX(-Math.PI / 2); g.scale(1.8, 1, 0.45); b.geo(g, M(0, 0.015, 0, 0.4), { color: c }); b.box(0.36, 0.008, 0.008, M(0, 0.02, 0, 0.4), { color: '#d8d0c0' }); },
  bait(b, c) { for (let i = 0; i < 3; i++) torus(b, M(i * 0.05 - 0.05, 0.015, (i % 2) * 0.04, i, Math.PI / 2), 0.04, 0.012, { color: c }, 4, 10, Math.PI * 1.4); },
  pouch(b, c, c2) {
    sphere(b, M(0, 0.08, 0, 0, 0, 0, 1, 0.9, 1), 0.1, { tile: TILE.SACK, color: c }, 9, 6);
    cylinder(b, M(0, 0.16, 0), 0.03, 0.05, 0.05, { tile: TILE.SACK, color: c }, 7);
    if (c2) for (let i = 0; i < 3; i++) cylinder(b, M(0.13 + i * 0.03, 0.005 + i * 0.012, 0.05, 0, 0.2), 0.035, 0.035, 0.01, { tile: TILE.METAL, color: c2 }, 8);
  },
  dagger(b, c, c2) { const m = M(-0.05, 0.03, 0); blade(b, m, 0.18, 0.045, c, { fuller: true }); hilt(b, m, 0.12, 0.08, c2); },
  sword(b, c, c2) { const m = M(-0.12, 0.03, 0); blade(b, m, 0.42, 0.055, c, { fuller: true }); hilt(b, m, 0.18, 0.1, c2); },
  greatsword(b, c, c2) { const m = M(-0.18, 0.03, 0); blade(b, m, 0.62, 0.075, c, { fuller: true }); hilt(b, m, 0.26, 0.17, c2); },
  helm(b, c, c2) {
    const g = new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    b.geo(g, M(0, 0.0, 0), { tile: TILE.METAL, color: c });
    torus(b, M(0, 0.02, 0, 0, Math.PI / 2), 0.14, 0.012, { tile: TILE.METAL, color: c2 || shade(c, 0.7) }, 4, 14);
    b.box(0.025, 0.12, 0.03, M(0, 0.02, -0.14), { tile: TILE.METAL, color: c2 || shade(c, 0.7) });
  },
  kiteshield(b, c, c2) {
    const s = new THREE.Shape();
    s.moveTo(-0.15, 0.17); s.lineTo(0.15, 0.17); s.quadraticCurveTo(0.17, -0.05, 0, -0.25); s.quadraticCurveTo(-0.17, -0.05, -0.15, 0.17);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
    b.geo(g, M(0, 0.0, 0), { tile: TILE.METAL, color: c, flat: true });
    b.box(0.04, 0.035, 0.36, M(0, 0.03, 0.03), { color: c2 || shade(c, 0.7) });
    b.box(0.25, 0.035, 0.04, M(0, 0.03, -0.05), { color: c2 || shade(c, 0.7) });
  },
  platelegs(b, c, c2) {
    b.box(0.26, 0.06, 0.08, M(0, 0.03, -0.15), { tile: TILE.METAL, color: c2 || shade(c, 0.7) });
    for (const x of [-0.07, 0.07]) b.box(0.11, 0.06, 0.34, M(x, 0.03, 0.06, x * 0.8), { tile: TILE.METAL, color: c });
  },
  chestplate(b, c, c2) {
    b.box(0.3, 0.07, 0.34, M(0, 0.035, 0), { tile: TILE.METAL, color: c });
    for (const x of [-0.2, 0.2]) sphere(b, M(x, 0.05, -0.12, 0, 0, 0, 1, 0.6, 1), 0.07, { tile: TILE.METAL, color: c2 || shade(c, 0.8) }, 8, 5);
    b.box(0.03, 0.075, 0.3, M(0, 0.04, 0), { color: shade(c, 0.75) });
  },
  'body-leather'(b, c, c2) {
    b.box(0.28, 0.05, 0.3, M(0, 0.025, 0), { tile: TILE.SACK, color: c });
    for (const x of [-0.19, 0.19]) b.box(0.12, 0.045, 0.16, M(x, 0.024, -0.1, x > 0 ? -0.5 : 0.5), { tile: TILE.SACK, color: c });
    b.box(0.29, 0.055, 0.04, M(0, 0.03, 0.08), { color: c2 || shade(c, 0.6) });
  },
  legs(b, c) { for (const x of [-0.06, 0.06]) b.box(0.1, 0.045, 0.32, M(x, 0.025, 0, x), { tile: TILE.SACK, color: c }); b.box(0.24, 0.05, 0.06, M(0, 0.03, -0.15), { tile: TILE.SACK, color: c }); },
  hands(b, c) { for (const x of [-0.07, 0.07]) { sphere(b, M(x, 0.04, 0, 0, 0, 0, 0.9, 0.5, 1.3), 0.06, { tile: TILE.SACK, color: c }, 7, 5); } },
  feet(b, c) { for (const x of [-0.07, 0.07]) { b.box(0.08, 0.12, 0.09, M(x, 0.06, 0.04), { tile: TILE.SACK, color: c }); b.box(0.08, 0.05, 0.16, M(x, 0.025, -0.02), { tile: TILE.SACK, color: c }); } },
  head(b, c, c2) {
    const g = new THREE.ConeGeometry(0.14, 0.22, 9, 1, true); g.translate(0, 0.11, 0);
    b.geo(g, M(0, 0.0, 0, 0, -0.3), { tile: TILE.CANVAS, color: c });
    b.box(0.3, 0.03, 0.18, M(0, 0.015, 0.1), { tile: TILE.CANVAS, color: c2 || shade(c, 0.8) });
  },
  cape(b, c, c2) {
    b.box(0.34, 0.03, 0.4, M(0, 0.015, 0), { tile: TILE.CANVAS, color: c });
    b.box(0.3, 0.035, 0.08, M(0, 0.02, -0.17), { tile: TILE.CANVAS, color: c2 || shade(c, 0.7) });
  },
  scale(b, c, c2) { const g = new THREE.CylinderGeometry(0.12, 0.12, 0.03, 6); b.geo(g, M(0, 0.02, 0, 0.3), { tile: TILE.METAL, color: c, flat: true }); b.geo(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 6), M(0, 0.03, 0), { color: c2 || c, glow: c2 || null, glowMode: 'tinted', glowK: 0.2 }); },
  amulet(b, c) { torus(b, M(0, 0.01, 0, 0, Math.PI / 2), 0.11, 0.008, { tile: TILE.METAL, color: '#c9a24a' }, 3, 16); b.geo(new THREE.OctahedronGeometry(0.04, 0), M(0, 0.03, -0.12), { color: c, glow: c, glowMode: 'tinted', glowK: 0.4, flat: true }); },
  ring(b, c) { torus(b, M(0, 0.02, 0, 0, Math.PI / 2), 0.05, 0.014, { tile: TILE.METAL, color: c }, 5, 12); },
  staff(b, c, c2) {
    cylinder(b, M(-0.4, 0.03, 0, 0, 0, -Math.PI / 2), 0.02, 0.025, 0.85, { tile: TILE.BARK, color: c }, 6);
    if (c2) b.geo(new THREE.OctahedronGeometry(0.05, 0), M(0.48, 0.05, 0, 0, 0, Math.PI / 2, 1, 1.6, 1), { color: c2, glow: c2, glowMode: 'tinted', glowK: 0.5, flat: true });
  },
  sigil(b, c) {
    cylinder(b, M(0, 0, 0), 0.09, 0.09, 0.025, { color: c, glow: c, glowMode: 'tinted', glowK: 0.35 }, 6);
    b.geo(new THREE.OctahedronGeometry(0.04, 0), M(0, 0.04, 0, 0, 0, 0, 1, 0.6, 1), { color: '#ffffff', glow: c, glowMode: 'tinted', glowK: 0.4, flat: true });
  },
  tusk(b, c) { const g = new THREE.TorusGeometry(0.15, 0.03, 5, 8, Math.PI * 0.55); b.geo(g, M(0, 0.03, 0.08, 0, -Math.PI / 2), { color: c }); },
  shortbow(b, c, c2) { torus(b, M(0.05, 0.02, 0, 0, Math.PI / 2), 0.26, 0.016, { tile: TILE.BARK, color: c }, 4, 12, Math.PI * 0.7); b.box(0.01, 0.01, 0.42, M(0.05 + 0.26 * Math.cos(Math.PI * 0.35), 0.02, 0, 0), { color: c2 || '#e8e2d0' }); },
  longbow(b, c, c2) { torus(b, M(0.18, 0.02, 0, 0, Math.PI / 2), 0.42, 0.018, { tile: TILE.BARK, color: c }, 4, 14, Math.PI * 0.6); b.box(0.01, 0.01, 0.68, M(0.18 + 0.42 * Math.cos(Math.PI * 0.3), 0.02, 0, 0), { color: c2 || '#e8e2d0' }); },
  arrow(b, c, c2) {
    for (let i = 0; i < 3; i++) {
      const m = M(0, 0.015 + i * 0.012, (i - 1) * 0.04, (i - 1) * 0.08);
      b.box(0.42, 0.012, 0.012, m, { color: '#a67c45' });
      const tip = new THREE.ConeGeometry(0.022, 0.06, 4); tip.rotateZ(-Math.PI / 2);
      b.geo(tip, at(m, 0.24, 0, 0), { tile: TILE.METAL, color: c, flat: true });
      b.box(0.07, 0.03, 0.004, at(m, -0.18, 0.01, 0), { color: c2 || '#f2efe6' });
    }
  },
  arrowheads(b, c) { for (let i = 0; i < 5; i++) { const tip = new THREE.ConeGeometry(0.03, 0.07, 4); tip.rotateZ(-Math.PI / 2); b.geo(tip, M((i % 3) * 0.05 - 0.05, 0.02, Math.floor(i / 3) * 0.06 - 0.03, i * 1.3), { tile: TILE.METAL, color: c, flat: true }); } },
  shaft(b, c, c2) { for (let i = 0; i < 4; i++) { const m = M(0, 0.015 + (i % 2) * 0.012, (i - 1.5) * 0.03, (i - 1.5) * 0.06); b.box(0.42, 0.012, 0.012, m, { color: c }); if (c2) b.box(0.07, 0.03, 0.004, at(m, -0.18, 0.01, 0), { color: c2 }); } },
  bell(b, c) {
    const prof = [new THREE.Vector2(0.001, 0.22), new THREE.Vector2(0.05, 0.21), new THREE.Vector2(0.07, 0.15), new THREE.Vector2(0.09, 0.05), new THREE.Vector2(0.13, 0.0), new THREE.Vector2(0.12, -0.005)];
    b.geo(new THREE.LatheGeometry(prof, 12), M(0, 0.02, 0, 0, 0, 0.4), { tile: TILE.METAL, color: c });
    torus(b, M(0, 0.25, 0, 0, 0, 0.4), 0.03, 0.01, { color: '#7a5a2a' }, 3, 8);
  },
  token(b, c) { cylinder(b, M(0, 0, 0), 0.08, 0.08, 0.025, { tile: TILE.PLANKS, color: c }, 12); b.box(0.08, 0.01, 0.015, M(0, 0.028, 0, 0.6), { color: shade(c, 0.6) }); },
  book(b, c) { b.box(0.2, 0.06, 0.26, M(0, 0.03, 0, 0.3), { color: c }); b.box(0.185, 0.045, 0.01, M(0.006, 0.03, -0.127, 0.3), { color: '#efe2c4' }); b.box(0.02, 0.062, 0.2, M(-0.085, 0.031, 0.03, 0.3), { color: '#c9a24a' }); },
  key(b, c) { torus(b, M(-0.1, 0.012, 0, 0, Math.PI / 2), 0.045, 0.012, { tile: TILE.METAL, color: c }, 4, 10); b.box(0.2, 0.02, 0.02, M(0.04, 0.012, 0), { tile: TILE.METAL, color: c }); b.box(0.02, 0.02, 0.05, M(0.12, 0.012, 0.03), { tile: TILE.METAL, color: c }); b.box(0.02, 0.02, 0.035, M(0.08, 0.012, 0.025), { tile: TILE.METAL, color: c }); },
  scroll(b, c) { cylinder(b, M(-0.14, 0.04, 0, 0, 0, -Math.PI / 2), 0.035, 0.035, 0.28, { color: c }, 9); b.box(0.02, 0.075, 0.075, M(0, 0.04, 0), { color: '#a02020' }); },
};

const cache = new Map();
export function itemGeometry(icon) {
  const shape = icon?.shape || 'token';
  const key = `${shape}|${icon?.color}|${icon?.color2}`;
  let g = cache.get(key);
  if (g) return g;
  const b = new Builder(shape.length * 13);
  const fn = SHAPES[shape] || SHAPES.pouch;
  fn(b, icon?.color || '#c9a24a', icon?.color2 || null);
  g = b.build();
  cache.set(key, g);
  return g;
}

// Soft round shadow blob under ground items.
let shadowTex = null;
export function itemShadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}
export const ITEM_SHAPES = Object.keys(SHAPES);
export { mulberry32 };
