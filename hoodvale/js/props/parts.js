// Reusable small props appended into a Builder: barrels, crates, sacks, furniture, lanterns,
// coins, tools... Every part takes (b, m, o): b = Builder, m = parent Matrix4 (origin at the
// part's ground centre, facing local -z), o = options. Owner: props builder.

import * as THREE from 'three';
import { M, TILE } from './kit.js';

export const C = {
  wood: '#8a6440', woodDark: '#5e4129', woodLight: '#b08a5c', woodGrey: '#8f8778',
  iron: '#4a4d52', ironLight: '#7d838a', brass: '#c9a24a', gold: '#e8bf4a',
  stone: '#a49c90', stoneDark: '#7a746c', plaster: '#efe6d2', straw: '#d8b65a',
  cloth: '#c9b48a', red: '#a3302a', crimson: '#8e1f22', hood: '#3f7f3a', teal: '#3ad6a0',
  violet: '#8e7cff', cyan: '#8fe3ff', flour: '#f4efe2', water: '#2d5a78', soot: '#2a2420',
};

const _m = new THREE.Matrix4();
// child transform
export function at(m, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const l = M(x, y, z, ry, rx, rz, sx, sy, sz);
  return m ? _m.copy(m).multiply(l).clone() : l;
}

const cylCache = new Map();
function cyl(rt, rb, h, seg = 8, open = false) {
  const k = `${rt}|${rb}|${h}|${seg}|${open}`;
  let g = cylCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); g.translate(0, h / 2, 0); cylCache.set(k, g); }
  return g;
}
export function cylinder(b, m, rt, rb, h, o = {}, seg = 8, open = false) {
  b.geo(cyl(rt, rb, h, seg, open), m, o);
}
export function sphere(b, m, r, o = {}, w = 8, hh = 6) {
  const k = `s${r}|${w}|${hh}`;
  let g = cylCache.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, w, hh); cylCache.set(k, g); }
  b.geo(g, m, o);
}
export function torus(b, m, r, t, o = {}, rs = 6, ts = 14, arc = Math.PI * 2) {
  const k = `t${r}|${t}|${rs}|${ts}|${arc}`;
  let g = cylCache.get(k);
  if (!g) { g = new THREE.TorusGeometry(r, t, rs, ts, arc); cylCache.set(k, g); }
  b.geo(g, m, o);
}

// ---- containers --------------------------------------------------------------------------------
export function barrel(b, m, o = {}) {
  const h = o.h ?? 0.95, r = o.r ?? 0.34;
  const g = new THREE.CylinderGeometry(r * 0.86, r * 0.86, h, 10, 4, false);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const t = P.getY(i) / h; // -0.5..0.5
    const k = 1 + 0.17 * (1 - 4 * t * t);
    P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * k);
  }
  g.computeVertexNormals();
  g.translate(0, h / 2, 0);
  b.geo(g, m, { tile: TILE.PLANKS, uvRot: true, color: o.color ?? C.wood, uvScale: 1.2, ao: o.ao });
  for (const y of [0.14, 0.5, 0.86]) {
    const rr = r * 0.86 * (1 + 0.17 * (1 - 4 * (y - 0.5) * (y - 0.5))) + 0.012;
    cylinder(b, at(m, 0, y * h - 0.035, 0), rr, rr, 0.07, { tile: TILE.METAL, color: C.iron }, 10, true);
  }
  if (o.open) cylinder(b, at(m, 0, h - 0.06, 0), r * 0.8, r * 0.8, 0.02, { color: o.fill ?? C.water }, 10);
}
export function crate(b, m, o = {}) {
  const s = o.s ?? 0.7;
  b.box(s, s, s, at(m, 0, s / 2, 0), { tile: TILE.PLANKS, color: o.color ?? C.woodLight, uvScale: 1.4 });
  const t = 0.06;
  const fr = { tile: TILE.PLANKS, color: C.woodDark, uvScale: 1.4 };
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(t, s + 0.01, t, at(m, x * (s / 2 - t / 2 + 0.01), s / 2, z * (s / 2 - t / 2 + 0.01)), fr);
  b.box(s * 1.2, t, t * 0.8, at(m, 0, s / 2, -s / 2 - 0.01, 0, 0, 0.85), fr);
  b.box(s * 1.2, t, t * 0.8, at(m, 0, s / 2, s / 2 + 0.01, 0, 0, -0.85), fr);
}
export function sack(b, m, o = {}) {
  const g = new THREE.SphereGeometry(0.28, 8, 6);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i);
    const k = y > 0.1 ? 0.75 - (y - 0.1) * 1.2 : 1;
    P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * k * 0.85);
    P.setY(i, y < -0.15 ? -0.15 + (y + 0.15) * 0.3 : y * 1.25);
  }
  g.computeVertexNormals();
  b.geo(g, at(m, 0, 0.2, 0), { tile: TILE.SACK, color: o.color ?? '#cdb48a', uvScale: 0.8 });
  cylinder(b, at(m, 0, 0.47, 0), 0.06, 0.09, 0.12, { color: '#a08860' }, 6);
}
export function bucket(b, m, o = {}) {
  cylinder(b, m, 0.17, 0.14, 0.28, { tile: TILE.PLANKS, uvRot: true, color: o.color ?? C.wood, uvScale: 0.8 }, 9, true);
  cylinder(b, at(m, 0, 0.22, 0), 0.15, 0.15, 0.01, { color: o.fill ?? C.water }, 9);
  torus(b, at(m, 0, 0.3, 0, 0, 0, Math.PI / 2), 0.16, 0.012, { color: C.iron }, 4, 10, Math.PI);
}
export function logPile(b, m, o = {}) {
  const n = o.n ?? 3, len = o.len ?? 1.3;
  let k = 0;
  for (let row = 0; row < n; row++) {
    for (let i = 0; i < n - row; i++) {
      const r = 0.14 + ((k++ * 37) % 7) * 0.006;
      const x = (i - (n - row - 1) / 2) * 0.3, y = r + row * 0.25;
      const mm = at(m, x, y, 0, 0, Math.PI / 2, 0);
      cylinder(b, at(mm, 0, -len / 2, 0), r, r, len, { tile: TILE.BARK, color: '#7a5a3c', uvScale: 1 }, 7, true);
      const cap = new THREE.CircleGeometry(r, 7);
      cap.rotateX(-Math.PI / 2);
      b.geo(cap, at(mm, 0, len / 2, 0), { tile: TILE.LOGEND, uv: 'own', color: '#e6cc9c' });
      const cap2 = cap.clone(); cap2.rotateX(Math.PI);
      b.geo(cap2, at(mm, 0, -len / 2, 0), { tile: TILE.LOGEND, uv: 'own', color: '#e6cc9c' });
    }
  }
}
export function hayBale(b, m, o = {}) {
  b.box(1.1, 0.55, 0.6, at(m, 0, 0.275, 0), { tile: TILE.HAY, color: o.color ?? '#e2c26a' });
  for (const x of [-0.3, 0.3]) b.box(0.03, 0.57, 0.62, at(m, x, 0.275, 0), { color: '#8a6a3a' });
}

// ---- furniture ---------------------------------------------------------------------------------
export function table(b, m, o = {}) {
  const w = o.w ?? 1.4, d = o.d ?? 0.8, h = o.h ?? 0.78;
  const top = { tile: TILE.PLANKS, color: o.color ?? C.woodLight, uvScale: 1.6 };
  b.box(w, 0.07, d, at(m, 0, h - 0.035, 0), top);
  const leg = { tile: TILE.PLANKS, color: C.woodDark, uvRot: true };
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(0.08, h - 0.07, 0.08, at(m, x * (w / 2 - 0.1), (h - 0.07) / 2, z * (d / 2 - 0.1)), leg);
  b.box(w - 0.2, 0.05, 0.05, at(m, 0, 0.18, 0), leg);
  if (o.items) {
    // a tankard, a plate, a candle
    cylinder(b, at(m, -w * 0.25, h, 0.05), 0.05, 0.055, 0.13, { tile: TILE.PLANKS, color: '#9a7a50' }, 7);
    cylinder(b, at(m, w * 0.15, h, -0.1), 0.13, 0.11, 0.02, { color: '#d8d0c0' }, 10);
    cylinder(b, at(m, w * 0.15, h + 0.02, -0.1), 0.06, 0.07, 0.04, { color: '#b5743a' }, 7);
    cylinder(b, at(m, 0.05, h, 0.15), 0.025, 0.025, 0.12, { color: '#f2ead8', glow: '#ffb060', glowK: 0.5 }, 6);
  }
}
export function bench(b, m, o = {}) {
  const w = o.w ?? 1.4;
  b.box(w, 0.06, 0.32, at(m, 0, 0.44, 0), { tile: TILE.PLANKS, color: o.color ?? C.wood });
  for (const x of [-1, 1]) b.box(0.06, 0.42, 0.28, at(m, x * (w / 2 - 0.12), 0.21, 0), { tile: TILE.PLANKS, color: C.woodDark });
}
export function stool(b, m) {
  cylinder(b, at(m, 0, 0.42, 0), 0.18, 0.18, 0.05, { tile: TILE.PLANKS, color: C.woodLight }, 8);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box(0.04, 0.44, 0.04, at(m, Math.cos(a) * 0.11, 0.21, Math.sin(a) * 0.11, 0, Math.sin(a) * 0.12, -Math.cos(a) * 0.12), { color: C.woodDark });
  }
}
export function chair(b, m, o = {}) {
  b.box(0.45, 0.05, 0.45, at(m, 0, 0.45, 0), { tile: TILE.PLANKS, color: o.color ?? C.wood });
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(0.05, 0.45, 0.05, at(m, x * 0.19, 0.225, z * 0.19), { color: C.woodDark });
  b.box(0.45, 0.55, 0.05, at(m, 0, 0.75, 0.2), { tile: TILE.PLANKS, color: o.color ?? C.wood, uvRot: true });
}
export function shelf(b, m, o = {}) {
  const w = o.w ?? 1.6, h = o.h ?? 1.9, d = 0.36;
  const wood = { tile: TILE.PLANKS, color: o.color ?? C.woodDark };
  b.box(w, h, 0.04, at(m, 0, h / 2, d / 2 - 0.02), wood);
  for (const x of [-1, 1]) b.box(0.05, h, d, at(m, x * (w / 2 - 0.025), h / 2, 0), wood);
  const rows = 3;
  for (let i = 0; i <= rows; i++) b.box(w, 0.04, d, at(m, 0, 0.12 + (i * (h - 0.2)) / rows, 0), wood);
  // goods decal on the back panel front (books / bottles)
  const tile = o.goods === 'bottles' ? TILE.BOTTLES : TILE.BOOKS;
  b.box(w - 0.1, h - 0.24, 0.02, at(m, 0, (h - 0.24) / 2 + 0.14, d / 2 - 0.06), { tile, color: '#ffffff', uvScale: (h - 0.2) / 0.98 * 1.0, jit: 0 });
}
export function bed(b, m, o = {}) {
  const w = 0.95, l = 1.9;
  b.box(w, 0.35, l, at(m, 0, 0.2, 0), { tile: TILE.PLANKS, color: C.woodDark });
  b.box(w - 0.06, 0.14, l - 0.06, at(m, 0, 0.43, 0), { tile: TILE.CANVAS, color: '#efe6d2' });
  b.box(w - 0.04, 0.08, l * 0.62, at(m, 0, 0.5, l * 0.17), { tile: TILE.CANVAS, color: o.blanket ?? '#7a3a34' });
  b.box(w * 0.7, 0.1, 0.3, at(m, 0, 0.53, -l / 2 + 0.25), { tile: TILE.CANVAS, color: '#f4efe4' });
  b.box(w, 0.75, 0.07, at(m, 0, 0.38, -l / 2), { tile: TILE.PLANKS, color: C.woodDark });
}
export function rug(b, m, o = {}) {
  b.box(o.w ?? 2, 0.015, o.d ?? 1.2, at(m, 0, 0.01, 0), { tile: o.tile ?? TILE.CARPET, color: o.color ?? '#ffffff', uvScale: o.d ?? 1.2, uvRot: o.rot ?? false, vnoise: 0.02 });
}
// Stone hearth / fireplace against a wall; returns local flame position.
export function hearth(b, m, o = {}) {
  const w = o.w ?? 1.6, h = o.h ?? 1.5;
  const st = { tile: TILE.STONE, color: o.color ?? C.stone, uvScale: 1.2 };
  b.box(w, h, 0.5, at(m, 0, h / 2, 0.15), st);
  b.box(w * 0.55, h * 0.5, 0.52, at(m, 0, h * 0.25, 0.1), { color: '#1c1612' }); // firebox
  b.box(w + 0.2, 0.12, 0.65, at(m, 0, h * 0.58, 0.05), { tile: TILE.STONE, color: C.stoneDark });
  b.box(w * 0.7, (o.chimney ?? 1.4), 0.4, at(m, 0, h + (o.chimney ?? 1.4) / 2, 0.2), st);
  logPile(b, at(m, 0, 0.0, -0.08, 0, 0, 0, 0.5), { n: 2, len: 0.7 });
  return [0, 0.08, -0.05];
}
export function cauldron(b, m, o = {}) {
  const g = new THREE.SphereGeometry(0.4, 10, 7, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65);
  b.geo(g, at(m, 0, 0.45, 0), { tile: TILE.METAL, color: C.iron });
  cylinder(b, at(m, 0, 0.62, 0), 0.32, 0.32, 0.02, { color: o.brew ?? '#5a8a3a', glow: o.glow ?? null, glowMode: 'always', glowK: 0.5 }, 10);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box(0.06, 0.3, 0.06, at(m, Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3), { color: C.iron });
  }
}

// ---- lights ------------------------------------------------------------------------------------
// Hanging/standing lantern. Returns local glow centre.
export function lantern(b, m, o = {}) {
  const fr = { tile: TILE.METAL, color: o.frame ?? '#2e2a26' };
  b.box(0.22, 0.03, 0.22, at(m, 0, 0, 0), fr);
  b.box(0.26, 0.04, 0.26, at(m, 0, 0.32, 0), fr);
  cylinder(b, at(m, 0, 0.34, 0), 0.02, 0.15, 0.1, fr, 4);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(0.025, 0.3, 0.025, at(m, x * 0.1, 0.16, z * 0.1), fr);
  b.box(0.17, 0.27, 0.17, at(m, 0, 0.16, 0), { color: o.glass ?? '#ffd88a', glow: o.light ?? '#ffb050', glowMode: o.always ? 'always' : 'night', glowK: 1, jit: 0 });
  torus(b, at(m, 0, 0.43, 0, 0, 0, 0), 0.04, 0.01, fr, 4, 8);
  return [0, 0.16, 0];
}
// Lamp post (iron or wooden). Returns local glow centre.
export function lampPost(b, m, o = {}) {
  const h = o.h ?? 2.8;
  const wood = o.wood;
  const pc = wood ? { tile: TILE.PLANKS, color: C.woodDark, uvRot: true } : { tile: TILE.METAL, color: '#34322f' };
  if (!wood) cylinder(b, m, 0.13, 0.17, 0.25, { tile: TILE.STONE, color: C.stone }, 8);
  if (wood) b.box(0.14, h, 0.14, at(m, 0, h / 2, 0), pc); else cylinder(b, at(m, 0, 0.2, 0), 0.045, 0.06, h - 0.2, pc, 6);
  b.box(0.05, 0.05, 0.55, at(m, 0, h - 0.05, -0.22), pc);
  b.beam(0, h - 0.45, 0, 0, h - 0.05, -0.3, 0.035, { ...pc });
  lantern(b, at(m, 0, h - 0.5, -0.42), { always: false });
  return [0, h - 0.34, -0.42];
}
export function torch(b, m, o = {}) {
  b.box(0.06, 0.5, 0.06, at(m, 0, 0.25, 0, 0, -0.35, 0), { color: C.woodDark });
  cylinder(b, at(m, 0, 0.45, -0.15), 0.07, 0.05, 0.12, { color: C.iron }, 6);
  return [0, 0.6, -0.18];
}
export function brazier(b, m) {
  cylinder(b, at(m, 0, 0.75, 0), 0.32, 0.22, 0.25, { tile: TILE.METAL, color: '#3a3532' }, 8, false);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box(0.05, 0.85, 0.05, at(m, Math.cos(a) * 0.22, 0.42, Math.sin(a) * 0.22, 0, Math.sin(a) * 0.2, -Math.cos(a) * 0.2), { color: '#3a3532' });
  }
  cylinder(b, at(m, 0, 0.95, 0), 0.26, 0.26, 0.04, { color: '#3a1a10', glow: '#ff6a20', glowMode: 'always', glowK: 0.8 }, 8);
  return [0, 0.98, 0];
}

// ---- treasure ------------------------------------------------------------------------------------
export function coins(b, m, o = {}) {
  const n = o.n ?? 12, r = o.r ?? 0.25;
  const rnd = o.rnd ?? Math.random;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r;
    const y = (1 - rr / r) * (o.h ?? 0.12) + rnd() * 0.02;
    cylinder(b, at(m, Math.cos(a) * rr, y, Math.sin(a) * rr, 0, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5), 0.05, 0.05, 0.015, { tile: TILE.METAL, color: o.color ?? C.gold, glow: o.glint ? '#ffcc55' : null, glowMode: 'always', glowK: 0.25 }, 8);
  }
  if (o.mound) sphere(b, at(m, 0, -r * 0.35, 0, 0, 0, 0, 1, 0.55, 1), r * 0.95, { tile: TILE.METAL, color: o.color ?? C.gold, glow: o.glint ? '#ffbb44' : null, glowMode: 'always', glowK: 0.12 }, 10, 6);
}
export function chestBox(b, m, o = {}) {
  const w = o.w ?? 0.9, d = o.d ?? 0.55, h = o.h ?? 0.45;
  b.box(w, h, d, at(m, 0, h / 2, 0), { tile: TILE.PLANKS, color: o.color ?? '#7a4a2a' });
  const lid = new THREE.CylinderGeometry(d / 2, d / 2, w, 10, 1, false, 0, Math.PI);
  b.geo(lid, at(m, 0, h, 0, Math.PI / 2, 0, Math.PI / 2), { tile: TILE.PLANKS, color: o.color ?? '#7a4a2a', uvRot: true });
  const band = { tile: TILE.METAL, color: o.band ?? '#3a3a3e' };
  for (const x of [-w * 0.35, 0, w * 0.35]) {
    b.box(0.06, h + 0.01, d + 0.02, at(m, x, h / 2, 0), band);
    const arc = new THREE.CylinderGeometry(d / 2 + 0.012, d / 2 + 0.012, 0.06, 10, 1, true, 0, Math.PI);
    b.geo(arc, at(m, x, h, 0, Math.PI / 2, 0, Math.PI / 2), band);
  }
  b.box(0.14, 0.16, 0.03, at(m, 0, h - 0.02, -d / 2 - 0.02), { tile: TILE.METAL, color: o.lock ?? C.brass });
}

// ---- tools / misc --------------------------------------------------------------------------------
export function pickaxe(b, m, o = {}) {
  b.box(0.05, 0.9, 0.05, at(m, 0, 0.45, 0), { color: C.wood });
  const g = new THREE.TorusGeometry(0.28, 0.035, 4, 10, Math.PI * 0.8);
  b.geo(g, at(m, 0, 0.67, 0, 0, 0, Math.PI * 0.1), { tile: TILE.METAL, color: o.head ?? C.ironLight });
}
export function shovel(b, m) {
  b.box(0.04, 1.0, 0.04, at(m, 0, 0.5, 0), { color: C.wood });
  b.box(0.22, 0.28, 0.03, at(m, 0, 0.0 + 0.14, 0), { tile: TILE.METAL, color: C.ironLight });
}
export function weaponRack(b, m, o = {}) {
  const w = o.w ?? 1.4;
  const wood = { tile: TILE.PLANKS, color: C.woodDark };
  for (const x of [-1, 1]) b.box(0.08, 1.4, 0.08, at(m, x * w / 2, 0.7, 0), wood);
  b.box(w + 0.1, 0.08, 0.1, at(m, 0, 1.25, 0), wood);
  b.box(w + 0.1, 0.06, 0.25, at(m, 0, 0.15, 0.05), wood);
  const n = Math.floor(w / 0.28);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.2 + i * 0.28;
    const kind = i % 3;
    if (kind === 0) { // spear
      b.box(0.035, 1.6, 0.035, at(m, x, 0.8, 0.0, 0, 0.08, 0), { color: C.wood });
      b.box(0.06, 0.2, 0.02, at(m, x, 1.68, -0.06), { tile: TILE.METAL, color: C.ironLight });
    } else if (kind === 1) { // sword
      b.box(0.07, 0.9, 0.015, at(m, x, 0.68, 0.0, 0, 0.06, 0), { tile: TILE.METAL, color: '#c3ccd6' });
      b.box(0.22, 0.04, 0.04, at(m, x, 1.14, -0.03), { color: C.brass });
    } else { // axe
      b.box(0.04, 1.1, 0.04, at(m, x, 0.6, 0.0, 0, 0.06, 0), { color: C.wood });
      b.box(0.18, 0.16, 0.025, at(m, x + 0.07, 1.06, -0.04), { tile: TILE.METAL, color: C.ironLight });
    }
  }
}
export function dummy(b, m, o = {}) {
  b.box(0.1, 1.5, 0.1, at(m, 0, 0.75, 0), { color: C.wood });
  b.box(0.9, 0.08, 0.08, at(m, 0, 1.25, 0), { color: C.wood });
  sack(b, at(m, 0, 0.75, 0, 0, 0, 0, 1.15, 1.2, 1.1), { color: '#c8ab78' });
  sphere(b, at(m, 0, 1.55, 0), 0.17, { tile: TILE.SACK, color: '#cdb48a' }, 8, 6);
  if (o.shield) b.box(0.45, 0.55, 0.05, at(m, 0, 1.0, -0.3), { color: C.crimson });
}
export function cart(b, m, o = {}) {
  const wood = { tile: TILE.PLANKS, color: o.color ?? C.wood };
  b.box(1.2, 0.08, 1.9, at(m, 0, 0.6, 0), wood);
  for (const x of [-1, 1]) b.box(0.06, 0.4, 1.9, at(m, x * 0.6, 0.82, 0), wood);
  b.box(1.2, 0.4, 0.06, at(m, 0, 0.82, 0.95), wood);
  for (const x of [-1, 1]) {
    torus(b, at(m, x * 0.7, 0.45, 0.2, Math.PI / 2), 0.42, 0.05, { color: C.woodDark }, 5, 14);
    for (let i = 0; i < 4; i++) b.box(0.04, 0.8, 0.04, at(m, x * 0.7, 0.45, 0.2, 0, (i / 4) * Math.PI, 0), { color: C.woodDark });
  }
  b.box(0.06, 0.06, 1.5, at(m, -0.3, 0.55, -1.6, 0, 0.12), wood);
  b.box(0.06, 0.06, 1.5, at(m, 0.3, 0.55, -1.6, 0, 0.12), wood);
  if (o.load === 'hay') b.box(1.05, 0.5, 1.6, at(m, 0, 0.95, 0), { tile: TILE.HAY, color: '#e2c26a' });
  else if (o.load === 'ore') for (let i = 0; i < 9; i++) sphere(b, at(m, ((i % 3) - 1) * 0.32, 0.75, (Math.floor(i / 3) - 1) * 0.45), 0.2, { tile: TILE.ROCK, color: o.ore ?? '#8a6a4a', flat: true }, 5, 4);
  else if (o.load === 'barrels') { barrel(b, at(m, -0.25, 0.64, -0.4, 0, 0, 0, 0.8)); barrel(b, at(m, 0.25, 0.64, 0.4, 0, 0, 0, 0.8)); }
}
export function mineCart(b, m, o = {}) {
  const met = { tile: TILE.METAL, color: '#5a4e44' };
  const g = new THREE.CylinderGeometry(0.62, 0.48, 0.55, 4, 1, true);
  g.rotateY(Math.PI / 4);
  b.geo(g, at(m, 0, 0.62, 0, 0, 0, 0, 1, 1, 1.35), { ...met, flat: true });
  b.box(0.7, 0.04, 0.95, at(m, 0, 0.36, 0), met);
  for (const x of [-1, 1]) for (const z of [-1, 1]) cylinder(b, at(m, x * 0.36, 0.17, z * 0.32, 0, 0, Math.PI / 2), 0.15, 0.15, 0.06, { color: '#2e2a26' }, 8);
  for (let i = 0; i < 6; i++) sphere(b, at(m, ((i % 3) - 1) * 0.22, 0.85, (i < 3 ? -0.18 : 0.18)), 0.16, { tile: TILE.ROCK, color: o.ore ?? '#b5703b', flat: true }, 5, 4);
}
export function rails(b, m, len) {
  for (const x of [-0.36, 0.36]) b.box(0.06, 0.06, len, at(m, x, 0.06, 0), { tile: TILE.METAL, color: '#5a5048' });
  for (let z = -len / 2 + 0.3; z < len / 2; z += 0.6) b.box(1.0, 0.06, 0.18, at(m, 0, 0.03, z), { tile: TILE.PLANKS, color: '#5e4a36' });
}
export function noticeBoard(b, m) {
  for (const x of [-0.75, 0.75]) b.box(0.1, 2.0, 0.1, at(m, x, 1.0, 0), { color: C.woodDark });
  b.box(1.5, 1.0, 0.06, at(m, 0, 1.35, 0), { tile: TILE.NOTICES, uv: 'own', color: '#ffffff' });
  const roof = { tile: TILE.SHINGLES, color: '#7a5038' };
  b.box(1.8, 0.05, 0.5, at(m, 0, 2.02, -0.12, 0, 0.5), roof);
  b.box(1.8, 0.05, 0.5, at(m, 0, 2.02, 0.12, 0, -0.5), roof);
}
export function flowerBox(b, m, o = {}) {
  const w = o.w ?? 0.9;
  b.box(w, 0.18, 0.22, at(m, 0, 0.09, 0), { tile: TILE.PLANKS, color: C.woodDark });
  const cols = o.colors ?? ['#e85a6a', '#f2c94c', '#f4f0e8', '#b56ad8'];
  for (let i = 0; i < 7; i++) {
    const x = -w / 2 + 0.08 + (i / 6) * (w - 0.16);
    sphere(b, at(m, x, 0.2, (i % 2) * 0.05 - 0.02), 0.07, { color: '#4f8a34', sway: 0.01 }, 5, 4);
    sphere(b, at(m, x + 0.02, 0.27, (i % 2) * 0.05 - 0.03), 0.05, { color: cols[i % cols.length], sway: 0.015 }, 5, 3);
  }
}
export function bush(b, m, o = {}) {
  const g = new THREE.IcosahedronGeometry(o.r ?? 0.5, 0);
  b.geo(g, at(m, 0, (o.r ?? 0.5) * 0.6, 0, 0, 0, 0, 1, 0.75, 1), { tile: TILE.LEAVES, color: o.color ?? '#4f8a34', uvScale: 1, sway: 0.03, grad: [-0.5, 0.5, 0.7, 1.1] });
}
export function banner(b, m, o = {}) {
  // Hanging banner on a crossbar: w × h, tile = banner decal. Sways at the bottom.
  const w = o.w ?? 0.9, h = o.h ?? 1.8;
  b.box(w + 0.2, 0.06, 0.06, at(m, 0, 0, 0), { color: o.bar ?? C.woodDark });
  const g = new THREE.PlaneGeometry(w, h, 1, 4);
  g.translate(0, -h / 2 - 0.03, 0);
  // swallowtail
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) if (P.getY(i) < -h + 0.01 && Math.abs(P.getX(i)) < 0.01) P.setY(i, P.getY(i) + h * 0.12);
  const mtx = at(m, 0, 0, -0.04);
  const swayTop = m.elements[13];
  const opts = { tile: o.tile ?? TILE.BANNER_SHERIFF, uv: 'own', color: '#ffffff', jit: 0, vnoise: 0.02, sway: (x, y) => Math.max(0, swayTop - y) * (o.sway ?? 0.06) };
  b.geo(g, mtx, opts);
  const g2 = g.clone(); g2.rotateY(Math.PI);
  b.geo(g2, at(m, 0, 0, -0.02), { ...opts, color: '#d8d0c8' });
}
