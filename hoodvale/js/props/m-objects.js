// Models for every non-tree world object kind (data/objects.js model.kind). Each maker returns
// { base: Builder, active?: Builder (hidden when depleted), depleted?: Builder (shown when
// depleted), float?: Builder (bobbing part), fx: [...] } in local space (origin = footprint
// centre at ground level, front = local -z). Owner: props builder.

import * as THREE from 'three';
import { Builder, M, TILE, mulberry32 } from './kit.js';
import {
  C, at, cylinder, sphere, torus, barrel, crate, sack, bucket, logPile, coins, chestBox, lantern,
  cart, mineCart, rails, pickaxe, shovel, bush,
} from './parts.js';

const wood = (c = C.wood, extra = {}) => ({ tile: TILE.PLANKS, color: c, ...extra });
const stone = (c = C.stone, extra = {}) => ({ tile: TILE.STONE, color: c, ...extra });
const metal = (c = C.iron, extra = {}) => ({ tile: TILE.METAL, color: c, ...extra });

function rockBlob(b, m, r, color = '#8f8880', seed = 1, sy = 0.8) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const P = g.attributes.position;
  const rnd = mulberry32(seed);
  const a = rnd() * 6, c = rnd() * 6;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const k = 1 + 0.18 * Math.sin(x * 4 + a) * Math.sin(z * 3.7 + c) + 0.08 * Math.sin(y * 6 + a);
    P.setXYZ(i, x * k, y * k * sy, z * k);
  }
  b.geo(g, m, { tile: TILE.ROCK, color, flat: true, uvScale: 1.8, grad: [-r, r, 0.7, 1.1] });
}

// ---------------------------------------------------------------------------------------------
const MAKERS = {};

MAKERS['bank-booth'] = () => {
  const b = new Builder(11);
  const dark = '#5e3f28';
  b.box(1.0, 0.95, 0.62, M(0, 0.475, 0.06), wood(dark));
  b.box(0.84, 0.66, 0.03, M(0, 0.5, -0.26), wood('#7a5636'));
  b.box(0.7, 0.5, 0.03, M(0, 0.5, -0.28), wood('#6a4a2e'));
  cylinder(b, M(0, 0.56, -0.3, 0, Math.PI / 2), 0.11, 0.11, 0.02, metal(C.gold), 12);
  b.box(1.12, 0.07, 0.78, M(0, 0.985, 0.02), wood('#3e2a1a'));
  for (const x of [-0.5, 0.5]) b.box(0.09, 1.5, 0.09, M(x, 1.75, 0.3), wood(dark));
  for (const y of [1.3, 2.05]) b.box(1.0, 0.05, 0.05, M(0, y, 0.3), metal(C.brass));
  for (let i = 0; i < 7; i++) b.box(0.022, 0.75, 0.022, M(-0.36 + i * 0.12, 1.68, 0.3), metal(C.brass));
  b.box(1.16, 0.32, 0.1, M(0, 2.42, 0.3), wood(dark));
  cylinder(b, M(0, 2.42, 0.24, 0, Math.PI / 2), 0.13, 0.13, 0.03, metal(C.gold), 14);
  torus(b, M(-0.03, 2.42, 0.22), 0.05, 0.014, { color: C.teal, glow: C.teal, glowMode: 'always', glowK: 0.8 }, 4, 10);
  torus(b, M(0.05, 2.42, 0.22), 0.05, 0.014, { color: C.teal, glow: C.teal, glowMode: 'always', glowK: 0.8 }, 4, 10);
  b.box(1.3, 0.05, 0.75, M(0, 2.66, 0.12, 0, 0.18), { tile: TILE.SHINGLES, color: '#5a3a2a' });
  // ledger, quill, coins on the counter
  b.box(0.42, 0.04, 0.3, M(-0.2, 1.04, -0.08, 0.1), { color: '#3a1f18' });
  b.box(0.19, 0.02, 0.27, M(-0.3, 1.07, -0.08, 0.1, 0, 0.05), { color: '#efe2c4' });
  b.box(0.19, 0.02, 0.27, M(-0.1, 1.07, -0.06, 0.1, 0, -0.05), { color: '#efe2c4' });
  b.box(0.012, 0.012, 0.3, M(-0.02, 1.12, -0.1, 0.5, 0.6), { color: '#f4f0e8' });
  for (let i = 0; i < 4; i++) cylinder(b, M(0.28, 1.02 + i * 0.022, -0.05), 0.06, 0.06, 0.02, metal(C.gold), 10);
  for (let i = 0; i < 2; i++) cylinder(b, M(0.4, 1.02 + i * 0.022, 0.08), 0.06, 0.06, 0.02, metal(C.gold), 10);
  return { base: b, fx: [{ t: 'halo', p: [0, 2.42, 0.18], size: 0.5, color: [0.1, 0.5, 0.35] }] };
};

MAKERS['exchange-desk'] = () => {
  const b = new Builder(12);
  b.box(1.0, 0.9, 0.6, M(0, 0.45, 0.04), wood('#4a3020'));
  for (const x of [-0.25, 0.25]) b.box(0.4, 0.6, 0.02, M(x, 0.45, -0.27), wood('#5e3f28'));
  b.box(1.12, 0.06, 0.74, M(0, 0.93, 0.02), { tile: TILE.MARBLE, color: '#ece6dc', uvScale: 1.2 });
  // the chain ledger board behind
  for (const x of [-0.52, 0.52]) b.box(0.07, 1.25, 0.07, M(x, 1.55, 0.36), wood('#3a2616'));
  b.box(1.1, 0.07, 0.1, M(0, 2.2, 0.36), wood('#3a2616'));
  b.box(0.98, 0.95, 0.04, M(0, 1.6, 0.37), { tile: TILE.LEDGER, uv: 'own', color: '#ffffff', glow: '#9affd8', glowMode: 'always', glowK: 0.45, jit: 0 });
  torus(b, M(-0.07, 2.28, 0.36), 0.07, 0.018, { color: C.teal, glow: C.teal, glowMode: 'always', glowK: 0.7 }, 4, 10);
  torus(b, M(0.07, 2.28, 0.36, 0, Math.PI / 2), 0.07, 0.018, { color: C.teal, glow: C.teal, glowMode: 'always', glowK: 0.7 }, 4, 10);
  // balance scales
  cylinder(b, M(0.3, 0.96, -0.05), 0.06, 0.08, 0.03, metal(C.brass), 8);
  b.box(0.02, 0.32, 0.02, M(0.3, 1.13, -0.05), metal(C.brass));
  b.box(0.36, 0.015, 0.015, M(0.3, 1.29, -0.05, 0, 0, 0.08), metal(C.brass));
  for (const s of [-1, 1]) {
    b.box(0.006, 0.16, 0.006, M(0.3 + s * 0.17, 1.2 + s * -0.012, -0.05), metal(C.brass));
    cylinder(b, M(0.3 + s * 0.17, 1.11 - s * 0.012, -0.05), 0.07, 0.05, 0.02, metal(C.brass), 10);
  }
  // inkwell, papers
  cylinder(b, M(-0.32, 0.96, 0.02), 0.04, 0.05, 0.06, { color: '#1a1a22' }, 7);
  b.box(0.01, 0.01, 0.22, M(-0.31, 1.05, 0.0, 0.3, 0.9), { color: '#f4f0e8' });
  b.box(0.28, 0.012, 0.2, M(-0.08, 0.965, -0.12, -0.2), { color: '#efe2c4' });
  b.box(0.28, 0.012, 0.2, M(-0.05, 0.977, -0.1, 0.1), { color: '#f4ead2' });
  return { base: b, fx: [{ t: 'halo', p: [0, 1.6, 0.25], size: 1.4, color: [0.04, 0.22, 0.17] }] };
};

MAKERS.furnace = () => {
  const b = new Builder(13);
  b.box(1.95, 0.25, 1.9, M(0, 0.125, 0), stone('#8a8278'));
  b.box(1.6, 1.45, 1.5, M(0, 0.95, 0.1), { tile: TILE.BRICK, color: '#a8806a' });
  for (const [x, z] of [[-0.8, -0.65], [0.8, -0.65], [-0.8, 0.85], [0.8, 0.85]]) b.box(0.22, 1.5, 0.22, M(x, 0.95, z), stone('#9a9288'));
  b.box(0.9, 0.75, 0.1, M(0, 0.62, -0.62), { color: '#1a100a' });
  b.box(0.7, 0.5, 0.05, M(0, 0.56, -0.58), { color: '#ff8a3a', glow: '#ff6a1a', glowMode: 'always', glowK: 1 });
  torus(b, M(0, 0.98, -0.66), 0.48, 0.1, stone('#7a7268'), 4, 10, Math.PI);
  b.box(1.2, 0.1, 0.3, M(0, 0.24, -0.7), stone('#6a645c'));
  const stack = new THREE.CylinderGeometry(0.42, 0.72, 1.6, 4, 1, true);
  stack.rotateY(Math.PI / 4); stack.translate(0, 0.8, 0);
  b.geo(stack, M(0, 1.65, 0.15), { tile: TILE.BRICK, color: '#9e7a66', flat: true });
  b.box(0.75, 0.16, 0.75, M(0, 3.3, 0.15), stone('#7a7268'));
  b.box(0.55, 0.05, 0.55, M(0, 3.39, 0.15), { color: '#120c08' });
  // open iron door
  b.box(0.42, 0.62, 0.05, M(-0.68, 0.6, -0.86, 0.9), metal('#2e2b28'));
  // bellows
  b.box(0.5, 0.12, 0.7, M(1.0, 0.75, 0.1, 0, 0, 0.25), wood('#6a4a2e'));
  b.box(0.48, 0.18, 0.66, M(1.0, 0.86, 0.1, 0, 0, 0.25), { tile: TILE.SACK, color: '#6a4030' });
  b.box(0.06, 0.06, 0.5, M(1.1, 0.95, -0.45), wood(C.woodDark));
  // coal heap and ore basket
  for (let i = 0; i < 10; i++) sphere(b, M(-0.65 + (i % 4) * 0.13, 0.15 + Math.floor(i / 4) * 0.08, -1.05 + (i % 3) * 0.08), 0.1, { color: '#26221f', flat: true }, 5, 3);
  cylinder(b, M(0.6, 0, -1.0), 0.22, 0.17, 0.3, { tile: TILE.HAY, color: '#a8834a' }, 8, true);
  for (let i = 0; i < 4; i++) sphere(b, M(0.55 + (i % 2) * 0.1, 0.3, -1.05 + Math.floor(i / 2) * 0.1), 0.08, { tile: TILE.ROCK, color: '#b5703b', flat: true }, 5, 3);
  return {
    base: b,
    fx: [
      { t: 'flame', p: [0, 0.3, -0.56], w: 0.75, h: 0.55, heat: 0.9 },
      { t: 'halo', p: [0, 0.6, -0.8], size: 2.2, color: [0.9, 0.35, 0.08] },
      { t: 'smoke', p: [0, 3.45, 0.15], n: 6, size: 0.9 },
    ],
  };
};

MAKERS.anvil = () => {
  const b = new Builder(14);
  cylinder(b, M(0, 0, 0), 0.3, 0.34, 0.5, { tile: TILE.BARK, color: '#6f523a' }, 9);
  const cap = new THREE.CircleGeometry(0.3, 9); cap.rotateX(-Math.PI / 2);
  b.geo(cap, M(0, 0.5, 0), { tile: TILE.LOGEND, uv: 'own', color: '#d8bf98' });
  const ir = metal('#3a3d42');
  b.box(0.42, 0.07, 0.3, M(0, 0.535, 0), ir);
  b.box(0.2, 0.16, 0.18, M(0, 0.65, 0), ir);
  b.box(0.56, 0.12, 0.24, M(0.02, 0.79, 0), metal('#4a4e54'));
  const horn = new THREE.ConeGeometry(0.11, 0.34, 8); horn.rotateZ(Math.PI / 2);
  b.geo(horn, M(-0.42, 0.8, 0, 0, 0, 0, 1, 0.9, 1), ir);
  b.box(0.1, 0.1, 0.2, M(0.33, 0.8, 0), ir);
  // hammer lying on the face + tongs
  b.box(0.04, 0.04, 0.34, M(0.05, 0.87, -0.05, 0.4), wood(C.wood));
  b.box(0.12, 0.07, 0.07, M(0.13, 0.88, -0.2, 0.4), metal('#5a5e64'));
  b.box(0.02, 0.02, 0.45, M(-0.1, 0.86, 0.08, -0.3), metal('#2e2e30'));
  // quench barrel
  barrel(b, M(0.55, 0, 0.35), { h: 0.55, r: 0.22, open: true, fill: '#26404e' });
  return { base: b, fx: [] };
};

MAKERS.range = () => {
  const b = new Builder(15);
  b.box(0.98, 0.82, 0.8, M(0, 0.41, 0.05), { tile: TILE.BRICK, color: '#a07a64' });
  b.box(1.04, 0.07, 0.86, M(0, 0.85, 0.05), metal('#2e2c2a'));
  b.box(0.42, 0.32, 0.06, M(0, 0.32, -0.36), { color: '#160d08' });
  b.box(0.34, 0.2, 0.04, M(0, 0.28, -0.34), { color: '#ff8a3a', glow: '#ff6a1a', glowMode: 'always', glowK: 0.9 });
  for (const x of [-0.25, 0.25]) torus(b, M(x, 0.89, 0.05, 0, Math.PI / 2), 0.14, 0.02, metal('#1e1c1a'), 4, 12);
  // pot + pan
  cylinder(b, M(-0.25, 0.89, 0.05), 0.15, 0.13, 0.22, metal('#3a3632'), 10);
  cylinder(b, M(-0.25, 1.08, 0.05), 0.13, 0.13, 0.01, { color: '#8a5a2a' }, 10);
  cylinder(b, M(0.25, 0.89, 0.05), 0.16, 0.14, 0.05, metal('#2a2826'), 10);
  b.box(0.035, 0.02, 0.3, M(0.25, 0.92, -0.22), metal('#2a2826'));
  // hood + flue
  const hood = new THREE.CylinderGeometry(0.16, 0.6, 0.5, 4, 1, true); hood.rotateY(Math.PI / 4); hood.translate(0, 0.25, 0);
  b.geo(hood, M(0, 1.55, 0.12), { tile: TILE.BRICK, color: '#8e6e5a', flat: true });
  b.box(0.3, 1.2, 0.3, M(0, 2.6, 0.15), { tile: TILE.BRICK, color: '#8e6e5a' });
  // hanging ladle & utensils
  b.box(0.7, 0.03, 0.03, M(0, 1.45, -0.32), metal('#2a2826'));
  for (const x of [-0.2, 0, 0.2]) b.box(0.025, 0.28, 0.02, M(x, 1.3, -0.32), metal('#4a4642'));
  return { base: b, fx: [{ t: 'flame', p: [0, 0.18, -0.33], w: 0.4, h: 0.28, heat: 0.8 }, { t: 'halo', p: [0, 0.35, -0.45], size: 1.1, color: [0.6, 0.25, 0.06] }] };
};

MAKERS.fire = (e) => {
  const b = new Builder(16);
  const big = !!e?.spawn?.permanent;
  const R = big ? 0.55 : 0.42;
  const n = big ? 10 : 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    rockBlob(b, M(Math.cos(a) * R, 0.06, Math.sin(a) * R, a), big ? 0.16 : 0.13, '#8a847c', 30 + i, 0.75);
  }
  cylinder(b, M(0, 0, 0), R * 0.85, R * 0.9, 0.03, { color: '#2a2420' }, 10);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const L = big ? 0.9 : 0.7;
    const mm = M(Math.cos(a) * 0.12, 0.1, Math.sin(a) * 0.12, -a, 0, 0);
    const mm2 = mm.clone().multiply(M(0, 0, 0, 0, 0, Math.PI / 2 - 0.35));
    cylinder(b, mm2.clone().multiply(M(0, -L / 2, 0)), 0.06, 0.07, L, { tile: TILE.BARK, color: '#4a3424', ao: [0, 0.4, 0.4] }, 6);
  }
  for (let i = 0; i < 5; i++) sphere(b, M((i - 2) * 0.08, 0.04, ((i * 7) % 3 - 1) * 0.08), 0.05, { color: '#ff7a2a', glow: '#ff5a10', glowMode: 'always', glowK: 1 }, 5, 3);
  if (big) {
    // spit with a pot
    for (const s of [-1, 1]) { b.box(0.05, 1.2, 0.05, M(s * 0.75, 0.55, -0.12, 0, 0.18, 0), wood(C.woodDark)); b.box(0.05, 1.2, 0.05, M(s * 0.75, 0.55, 0.12, 0, -0.18, 0), wood(C.woodDark)); }
    b.box(1.7, 0.04, 0.04, M(0, 1.1, 0), metal('#2e2a26'));
    b.box(0.01, 0.35, 0.01, M(0, 0.92, 0), metal('#2e2a26'));
    const pot = new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7);
    b.geo(pot, M(0, 0.72, 0), metal('#2a2826'));
    cylinder(b, M(0, 0.85, 0), 0.18, 0.18, 0.01, { color: '#7a5a2a' }, 10);
  }
  return {
    base: b,
    fx: [
      { t: 'flame', p: [0, 0.05, 0], w: big ? 1.0 : 0.8, h: big ? 1.35 : 1.05, heat: 1 },
      { t: 'flame', p: [0.12, 0.05, 0.08], w: 0.55, h: 0.8, heat: 0.7 },
      { t: 'halo', p: [0, 0.6, 0], size: big ? 3.2 : 2.4, color: [0.85, 0.38, 0.1] },
    ],
  };
};

MAKERS['spinning-wheel'] = () => {
  const b = new Builder(17);
  const w = wood('#8a6440');
  b.box(0.95, 0.08, 0.32, M(0, 0.48, 0, 0, 0, 0.12), w);
  for (const [x, z] of [[-0.38, -0.12], [-0.38, 0.12], [0.38, 0]]) b.box(0.05, 0.5, 0.05, M(x, 0.24 + (x > 0 ? 0.05 : -0.04), z), wood(C.woodDark));
  for (const z of [-0.08, 0.08]) b.box(0.05, 0.6, 0.05, M(0.18, 0.82, z), wood(C.woodDark));
  const wheel = M(0.18, 0.95, 0, Math.PI / 2);
  torus(b, wheel, 0.36, 0.028, wood('#7a5636'), 5, 18);
  for (let i = 0; i < 6; i++) b.box(0.02, 0.7, 0.02, wheel.clone().multiply(M(0, 0, 0, 0, 0, (i / 6) * Math.PI)), wood('#6a4a2e'));
  cylinder(b, wheel.clone().multiply(M(0, 0, -0.06, 0, Math.PI / 2)), 0.05, 0.05, 0.12, wood(C.woodDark), 8);
  // distaff with flax
  b.box(0.03, 0.75, 0.03, M(-0.36, 0.85, 0, 0, 0, 0.2), wood(C.woodDark));
  const flax = new THREE.ConeGeometry(0.1, 0.32, 7); flax.translate(0, 0.16, 0);
  b.geo(flax, M(-0.44, 1.05, 0, 0, 0, 0.2), { tile: TILE.HAY, color: '#bfc8b8', sway: 0.01 });
  b.box(0.3, 0.03, 0.22, M(0.1, 0.08, -0.15, 0, 0.15), w); // treadle
  return { base: b, fx: [] };
};

MAKERS['tanning-rack'] = () => {
  const b = new Builder(18);
  const w = wood('#7a5636');
  for (const x of [-0.6, 0.6]) {
    b.box(0.07, 1.75, 0.07, M(x, 0.85, -0.18, 0, 0.18), w);
    b.box(0.07, 1.75, 0.07, M(x, 0.85, 0.18, 0, -0.18), w);
  }
  b.box(1.4, 0.07, 0.07, M(0, 1.66, 0), w);
  b.box(1.3, 0.06, 0.06, M(0, 0.3, -0.12), w);
  b.box(1.0, 1.15, 0.02, M(0, 0.98, -0.14, 0, 0.1), { tile: TILE.SACK, color: '#9a6a46' });
  for (let i = 0; i < 6; i++) for (const x of [-0.53, 0.53]) b.box(0.08, 0.015, 0.015, M(x, 0.48 + i * 0.18, -0.15, 0, 0, x > 0 ? -0.5 : 0.5), { color: '#3a2a1a' });
  b.box(0.9, 0.04, 0.5, M(0, 1.66, 0.05, 0, 0, 0.0), { tile: TILE.SACK, color: '#7a5a46' });
  b.box(0.85, 0.5, 0.02, M(0, 1.42, 0.3, 0, -0.05), { tile: TILE.SACK, color: '#6f4a36', sway: 0.01 });
  barrel(b, M(0.85, 0, 0.3), { h: 0.6, r: 0.24, open: true, fill: '#5a3a1a' });
  return { base: b, fx: [] };
};

MAKERS.well = () => {
  const b = new Builder(19);
  const prof = [new THREE.Vector2(0.46, 0), new THREE.Vector2(0.64, 0), new THREE.Vector2(0.64, 0.72), new THREE.Vector2(0.6, 0.78), new THREE.Vector2(0.48, 0.78), new THREE.Vector2(0.46, 0.72), new THREE.Vector2(0.46, 0.2)];
  const lathe = new THREE.LatheGeometry(prof, 12);
  b.geo(lathe, null, { tile: TILE.RUBBLE, color: '#b0a698', uvScale: 1.4, flat: true });
  cylinder(b, M(0, 0.32, 0), 0.47, 0.47, 0.01, { color: '#1e3a4e', glow: '#0a1a24', glowMode: 'always' }, 12);
  for (const x of [-0.58, 0.58]) b.box(0.1, 1.85, 0.1, M(x, 0.95, 0), wood(C.woodDark));
  cylinder(b, M(-0.62, 1.4, 0, 0, 0, Math.PI / 2), 0.07, 0.07, 1.24, { tile: TILE.BARK, color: '#6a4a2e' }, 8);
  b.box(0.04, 0.25, 0.04, M(0.7, 1.32, 0), wood(C.woodDark));
  b.box(0.18, 0.04, 0.04, M(0.76, 1.22, 0), wood(C.woodDark));
  b.box(0.015, 0.45, 0.015, M(0, 1.15, 0), { color: '#b8a070' });
  bucket(b, M(0, 0.78, 0.0, 0.3, 0, 0, 0.9));
  const roof = { tile: TILE.SHINGLES, color: '#6a4a36', uvScale: 1.2 };
  b.box(1.5, 0.05, 0.75, M(0, 2.02, -0.3, 0, 0.62), roof);
  b.box(1.5, 0.05, 0.75, M(0, 2.02, 0.3, 0, -0.62), roof);
  b.box(1.55, 0.08, 0.08, M(0, 2.25, 0), wood(C.woodDark));
  bucket(b, M(0.75, 0, -0.4, 0.5, 0, 0, 0.9), { fill: '#3a6a88' });
  return { base: b, fx: [] };
};

// Crops: instanced (base = standing crop, depleted = stubble) ---------------------------------
export function wheatGeometry(kind) {
  const b = new Builder(kind === 'flax' ? 21 : 20);
  const rnd = mulberry32(kind === 'flax' ? 5 : 3);
  const n = kind === 'flax' ? 11 : 13;
  const stalk = new THREE.CylinderGeometry(0.014, 0.02, 1, 3, 1, true);
  stalk.translate(0, 0.5, 0);
  const sw = (wx, wy) => Math.max(0, wy) * 0.07;
  for (let i = 0; i < n; i++) {
    const x = (rnd() - 0.5) * 0.82, z = (rnd() - 0.5) * 0.82;
    const h = (kind === 'flax' ? 0.75 : 0.95) + rnd() * 0.25;
    const m = M(x, 0, z, rnd() * 6, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.2);
    b.geo(stalk, m.clone().multiply(M(0, 0, 0, 0, 0, 0, 1, h, 1)), { color: kind === 'flax' ? '#6f9150' : '#c9a646', sway: sw });
    if (kind === 'flax') {
      b.geo(new THREE.OctahedronGeometry(0.06, 0), m.clone().multiply(M(0, h, 0, 0, 0, 0, 1, 0.55, 1)), { color: rnd() < 0.8 ? '#6f8fe0' : '#9aa8f0', flat: true, sway: sw });
    } else {
      b.geo(new THREE.OctahedronGeometry(0.05, 0), m.clone().multiply(M(0, h + 0.08, 0, 0, 0, 0, 1, 3.0, 1)), { color: '#e2c25a', flat: true, sway: sw });
    }
  }
  return b.build();
}
export function stubbleGeometry() {
  const b = new Builder(22);
  const rnd = mulberry32(9);
  for (let i = 0; i < 16; i++) {
    const x = (rnd() - 0.5) * 0.8, z = (rnd() - 0.5) * 0.8;
    b.box(0.03, 0.12 + rnd() * 0.06, 0.03, M(x, 0.07, z, rnd() * 3, (rnd() - 0.5) * 0.3), { color: '#b49a50' });
  }
  for (let i = 0; i < 5; i++) b.box(0.3, 0.01, 0.02, M((rnd() - 0.5) * 0.6, 0.01, (rnd() - 0.5) * 0.6, rnd() * 3), { color: '#c8b060' });
  return b.build();
}

MAKERS.hopper = () => {
  const b = new Builder(23);
  const w = wood('#7a5636');
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(0.08, 1.35, 0.08, M(x * 0.33, 0.675, z * 0.33), w);
  for (const y of [0.35, 1.1]) { b.box(0.74, 0.05, 0.05, M(0, y, -0.33), w); b.box(0.74, 0.05, 0.05, M(0, y, 0.33), w); }
  const hop = new THREE.CylinderGeometry(0.6, 0.12, 0.65, 4, 1, true); hop.rotateY(Math.PI / 4); hop.translate(0, 0.325, 0);
  b.geo(hop, M(0, 1.2, 0), { tile: TILE.PLANKS, color: '#8a6440', flat: true, uvRot: true });
  const hop2 = new THREE.CylinderGeometry(0.56, 0.1, 0.6, 4, 1, true); hop2.rotateY(Math.PI / 4); hop2.scale(-1, 1, 1); hop2.translate(0, 0.32, 0);
  b.geo(hop2, M(0, 1.22, 0), { tile: TILE.PLANKS, color: '#5e4129', flat: true });
  const grain = new THREE.CylinderGeometry(0.4, 0.4, 0.04, 4); grain.rotateY(Math.PI / 4);
  b.geo(grain, M(0, 1.72, 0), { tile: TILE.HAY, color: '#e2c060' });
  b.box(0.16, 0.5, 0.16, M(0, 0.95, 0), wood('#5e4129'));
  b.box(0.12, 0.08, 0.5, M(0, 0.68, -0.2, 0, -0.5), wood('#5e4129'));
  sack(b, M(0.5, 0, -0.35), { color: '#d0b884' });
  return { base: b, fx: [] };
};

MAKERS['flour-bin'] = () => {
  const b = new Builder(24);
  b.box(0.95, 0.7, 0.7, M(0, 0.35, 0), wood('#8a6440'));
  b.box(1.0, 0.06, 0.75, M(0, 0.03, 0), wood('#5e4129'));
  for (const x of [-0.42, 0.42]) b.box(0.08, 0.72, 0.74, M(x, 0.36, 0), wood('#5e4129'));
  const heap = new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  b.geo(heap, M(0, 0.6, 0, 0, 0, 0, 1, 0.45, 0.75), { color: C.flour, vnoise: 0.02 });
  b.box(0.3, 0.06, 0.18, M(0.15, 0.82, -0.05, 0.4, 0.2), wood('#b08a5c'));
  b.box(0.95, 0.05, 0.4, M(0, 0.74, 0.32, 0, -1.1), wood('#7a5636'));
  sack(b, M(-0.62, 0, -0.25), { color: '#e8dcc4' });
  sack(b, M(-0.62, 0, 0.25, 1), { color: '#e2d6bc' });
  return { base: b, fx: [] };
};

MAKERS.nest = () => {
  const b = new Builder(25);
  torus(b, M(0, 0.08, 0, 0, Math.PI / 2), 0.22, 0.09, { tile: TILE.HAY, color: '#b89a58', uvScale: 0.5 }, 6, 12);
  cylinder(b, M(0, 0.02, 0), 0.22, 0.22, 0.05, { tile: TILE.HAY, color: '#a88a48' }, 10);
  for (let i = 0; i < 7; i++) b.box(0.25, 0.015, 0.02, M(Math.cos(i) * 0.3, 0.05, Math.sin(i) * 0.3, i * 1.3), { color: '#c8aa60' });
  const eggs = new Builder(26);
  for (const [x, z, r] of [[-0.05, 0.03, 0.4], [0.07, -0.04, -0.3], [0.0, 0.08, 1.2]]) sphere(eggs, M(x, 0.12, z, r, 0.3, 0, 1, 1.3, 1), 0.065, { color: '#f2e6cf', jit: 0.03 }, 8, 6);
  return { base: b, active: eggs, fx: [] };
};

MAKERS.target = () => {
  const b = new Builder(27);
  const w = wood('#6a4a2e');
  b.box(0.07, 1.8, 0.07, M(-0.45, 0.85, 0.1, 0, -0.12, -0.25), w);
  b.box(0.07, 1.8, 0.07, M(0.45, 0.85, 0.1, 0, -0.12, 0.25), w);
  b.box(0.07, 1.7, 0.07, M(0, 0.8, 0.55, 0, 0.45, 0), w);
  const boss = new THREE.CylinderGeometry(0.55, 0.55, 0.2, 18, 1, true); boss.rotateX(Math.PI / 2);
  b.geo(boss, M(0, 1.25, 0, 0, -0.12), { tile: TILE.HAY, color: '#d8b870', uvScale: 0.8 });
  const face = new THREE.CircleGeometry(0.55, 20);
  face.rotateY(Math.PI); // face -z
  b.geo(face, M(0, 1.25, -0.1, 0, -0.12), { tile: TILE.TARGET, uv: 'own', color: '#ffffff', jit: 0 });
  const back = new THREE.CircleGeometry(0.55, 20);
  b.geo(back, M(0, 1.25, 0.1, 0, -0.12), { tile: TILE.HAY, color: '#c8a860' });
  for (const [x, y, a] of [[0.08, 1.3, 0.1], [-0.2, 1.12, -0.2], [0.15, 1.05, 0.25]]) {
    b.box(0.015, 0.015, 0.6, M(x, y, -0.35, a, 0.1), wood('#c8a87a'));
    b.box(0.06, 0.04, 0.008, M(x, y + 0.02, -0.62, a, 0.1), { color: '#e8e2d0' });
  }
  return { base: b, fx: [] };
};

MAKERS['altar-crystal'] = () => {
  const b = new Builder(28);
  const hex = new THREE.CylinderGeometry(0.85, 1.0, 0.65, 6, 1);
  hex.translate(0, 0.325, 0);
  b.geo(hex, M(0, 0, 0, Math.PI / 6), { tile: TILE.STONE, color: '#cfc8d8', flat: true, uvScale: 1.4 });
  const top = new THREE.CylinderGeometry(0.78, 0.84, 0.12, 6, 1);
  top.translate(0, 0.06, 0);
  b.geo(top, M(0, 0.65, 0, Math.PI / 6), { tile: TILE.MARBLE, color: '#e6e0ee', flat: true });
  const disc = new THREE.CircleGeometry(0.7, 24); disc.rotateX(-Math.PI / 2);
  b.geo(disc, M(0, 0.775, 0), { tile: TILE.RUNES, uv: 'own', color: '#ffffff', glow: '#ffffff', glowMode: 'always', glowK: 0.55, jit: 0 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const g = new THREE.CylinderGeometry(0.06, 0.12, 0.9, 6); g.translate(0, 0.45, 0);
    const tip = new THREE.ConeGeometry(0.06, 0.25, 6); tip.translate(0, 1.02, 0);
    const m = M(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95, a, 0, 0.12);
    const o = { tile: TILE.CRYSTAL, color: i % 2 ? '#8fe3ff' : '#b39cff', glow: '#9ad8ff', glowMode: 'tinted', glowK: 0.45, flat: true };
    b.geo(g, m, o); b.geo(tip, m, o);
  }
  const fl = new Builder(29);
  const oct = new THREE.OctahedronGeometry(0.28, 0);
  fl.geo(oct, M(0, 0, 0, 0, 0, 0, 1, 1.7, 1), { tile: TILE.CRYSTAL, color: '#a8e8ff', glow: '#bfe8ff', glowMode: 'tinted', glowK: 0.7, flat: true });
  return { base: b, float: fl, floatY: 1.6, fx: [{ t: 'halo', p: [0, 1.6, 0], size: 2.6, color: [0.35, 0.3, 0.75] }] };
};

MAKERS['oracle-crystal'] = () => {
  const b = new Builder(30);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    rockBlob(b, M(Math.cos(a) * 0.8, 0.1, Math.sin(a) * 0.8, a), 0.3, '#6e6880', 50 + i);
  }
  const fl = new Builder(31);
  fl.geo(new THREE.OctahedronGeometry(0.5, 0), M(0, 0, 0, 0, 0, 0, 1, 1.9, 1), { tile: TILE.CRYSTAL, color: '#8fe3ff', glow: '#c0f0ff', glowMode: 'tinted', glowK: 0.8, flat: true });
  torus(fl, M(0, 0, 0, 0, Math.PI / 2 - 0.3), 0.85, 0.025, { color: '#b39cff', glow: '#b39cff', glowMode: 'always', glowK: 0.6 }, 4, 24);
  return { base: b, float: fl, floatY: 1.9, fx: [{ t: 'halo', p: [0, 1.9, 0], size: 3.4, color: [0.3, 0.45, 0.8] }] };
};

MAKERS.chest = () => {
  const b = new Builder(32);
  chestBox(b, M(0, 0, 0), { color: '#4a2e1e', band: '#2a2a30', lock: C.gold });
  coins(b, M(0.55, 0, 0.1), { n: 10, r: 0.2, rnd: mulberry32(3) });
  coins(b, M(-0.5, 0, -0.2), { n: 6, r: 0.14, rnd: mulberry32(4) });
  return { base: b, fx: [{ t: 'halo', p: [0, 0.6, 0], size: 1.4, color: [0.5, 0.38, 0.1] }] };
};

MAKERS['chest-hoard'] = () => {
  const b = new Builder(33);
  coins(b, M(0, 0.05, 0), { n: 40, r: 0.75, h: 0.4, mound: true, glint: true, rnd: mulberry32(7) });
  chestBox(b, M(0.2, 0.18, 0.25, -0.4, 0.1), { color: '#3a2a22', band: '#4a3a2a', lock: C.gold });
  const rnd = mulberry32(8);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 6.28, r = 0.3 + rnd() * 0.6;
    const col = ['#2f6fe0', '#2ecc71', '#e0314f', '#c9b8ff'][i % 4];
    b.geo(new THREE.OctahedronGeometry(0.07, 0), M(Math.cos(a) * r, 0.2 + (0.75 - r) * 0.4, Math.sin(a) * r, a), { color: col, glow: col, glowMode: 'tinted', glowK: 0.25, flat: true });
  }
  // a crown and a goblet
  torus(b, M(-0.35, 0.42, 0.1, 0, Math.PI / 2 - 0.3), 0.12, 0.025, metal(C.gold), 4, 10);
  cylinder(b, M(0.45, 0.25, -0.35, 0, 0.3), 0.08, 0.03, 0.18, metal(C.gold), 8);
  for (let i = 0; i < 3; i++) b.box(0.4, 0.04, 0.04, M(-0.8 + i * 0.2, 0.03, 0.55 - i * 0.15, i * 0.9), { color: '#d8d0c0' });
  sphere(b, M(-0.75, 0.1, 0.4), 0.11, { color: '#d8d0c0' }, 7, 5);
  return { base: b, fx: [{ t: 'halo', p: [0, 0.5, 0], size: 2.6, color: [0.6, 0.42, 0.1] }] };
};

MAKERS.signpost = (e, kit) => {
  const b = new Builder(34);
  b.box(0.13, 2.4, 0.13, M(0, 1.2, 0), wood('#6a4a2e'));
  const cap = new THREE.ConeGeometry(0.13, 0.18, 4); cap.rotateY(Math.PI / 4);
  b.geo(cap, M(0, 2.49, 0), wood('#5e4129'));
  rockBlob(b, M(0, 0.05, 0), 0.22, '#8a847c', 3, 0.5);
  const dirs = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  const lines = e?.spawn?.text || [];
  let k = 0;
  for (const line of lines) {
    const mt = /^([NSEW]):\s*(.+)$/.exec(line);
    const y = 2.1 - k * 0.3;
    k++;
    if (!mt) {
      const rect = kit.sign(line, { board: '#7a5636', ink: '#f2e2b8', font: "Georgia, 'Times New Roman', serif" }, true);
      b.box(0.9, 0.26, 0.04, M(0, y, -0.09), { rect, color: '#ffffff', jit: 0 });
      continue;
    }
    const [dx, dz] = dirs[mt[1]];
    const yaw = Math.atan2(-dz, dx); // board long axis along +x rotated to (dx, dz)
    const len = 1.05;
    const rect = kit.sign(mt[2], { board: '#7a5636', ink: '#f2e2b8', font: "Georgia, 'Times New Roman', serif" }, true);
    const m = M(dx * (len / 2 + 0.02), y, dz * (len / 2 + 0.02), yaw);
    b.box(len, 0.24, 0.045, m, { rect, color: '#ffffff', jit: 0 });
    // pointed tip
    const tip = new THREE.CylinderGeometry(0.0, 0.17, 0.16, 3, 1); tip.rotateZ(-Math.PI / 2); tip.scale(1, 1, 0.26);
    b.geo(tip, m.clone().multiply(M(len / 2 + 0.08, 0, 0)), wood('#7a5636'));
  }
  return { base: b, fx: [] };
};

MAKERS['cave-mouth'] = () => {
  const b = new Builder(35);
  // dark tunnel recess
  b.box(2.3, 2.5, 1.6, M(0, 1.2, 0.7), { color: '#0c0907', vnoise: 0, jit: 0 });
  const rocks = [[-1.6, 0.8, 0.2, 1.0], [1.6, 0.9, 0.3, 1.05], [-1.4, 2.2, 0.4, 0.9], [1.3, 2.3, 0.4, 0.95], [0, 3.0, 0.5, 1.15], [-2.3, 0.6, 0.9, 1.1], [2.3, 0.7, 1.0, 1.1], [0, 2.7, 1.4, 1.3], [-0.9, 3.1, 1.2, 0.9], [1.0, 3.2, 1.0, 0.95]];
  rocks.forEach(([x, y, z, r], i) => rockBlob(b, M(x, y, z, i), r, i % 2 ? '#b8a68a' : '#a8987e', 60 + i, 0.85));
  // timber frame
  const t = wood('#5e4129');
  for (const x of [-0.95, 0.95]) b.box(0.2, 2.3, 0.2, M(x, 1.15, -0.05), t);
  b.box(2.3, 0.24, 0.26, M(0, 2.35, -0.05), t);
  b.box(0.12, 1.0, 0.12, M(-0.75, 1.9, -0.05, 0, 0, 0.8), t);
  b.box(0.12, 1.0, 0.12, M(0.75, 1.9, -0.05, 0, 0, -0.8), t);
  rails(b, M(0, 0, -0.6), 2.6);
  mineCart(b, M(0.0, 0.08, -1.6, 0.1), { ore: '#a8703e' });
  lantern(b, M(-1.25, 1.9, -0.25), { always: true });
  b.box(0.04, 0.3, 0.04, M(-1.25, 2.3, -0.2));
  pickaxe(b, M(1.25, 0, -0.45, 0.3, 0, -0.25));
  shovel(b, M(1.45, 0.05, -0.2, -0.2, 0, -0.3));
  crate(b, M(-1.6, 0, -0.9, 0.4), { s: 0.6 });
  return { base: b, fx: [{ t: 'halo', p: [-1.25, 2.06, -0.25], size: 1.4, color: [0.9, 0.55, 0.2] }] };
};

MAKERS['cave-exit'] = () => {
  const b = new Builder(36);
  b.box(2.2, 2.4, 0.6, M(0, 1.2, 0.9), { color: '#fff4d8', glow: '#fff0c8', glowMode: 'always', glowK: 0.9, jit: 0, vnoise: 0 });
  const rocks = [[-1.5, 0.8, 0.4, 1.0], [1.5, 0.9, 0.5, 1.0], [-1.2, 2.2, 0.6, 0.9], [1.2, 2.3, 0.6, 0.9], [0, 2.9, 0.7, 1.1], [-2.2, 1.4, 1.0, 1.1], [2.2, 1.5, 1.1, 1.1]];
  rocks.forEach(([x, y, z, r], i) => rockBlob(b, M(x, y, z, i), r, '#5e5650', 80 + i, 0.85));
  return { base: b, fx: [{ t: 'halo', p: [0, 1.3, 0.4], size: 4.5, color: [0.7, 0.62, 0.45] }] };
};

MAKERS['stairs-down'] = () => {
  const b = new Builder(37);
  const st = stone('#8e8678');
  b.box(1.0, 0.02, 1.0, M(0, 0.03, 0), { color: '#0a0806', jit: 0, vnoise: 0 });
  for (let i = 0; i < 4; i++) b.box(0.86, 0.06, 0.24, M(0, 0.22 - i * 0.05, 0.38 - i * 0.24), { tile: TILE.STONE, color: new THREE.Color('#8e8678').multiplyScalar(1 - i * 0.24), vnoise: 0 });
  b.box(1.3, 0.3, 0.16, M(0, 0.15, -0.58), st);
  b.box(0.16, 0.3, 1.3, M(-0.58, 0.15, 0), st);
  b.box(0.16, 0.3, 1.3, M(0.58, 0.15, 0), st);
  b.box(1.3, 0.12, 0.16, M(0, 0.06, 0.58), st);
  for (const x of [-0.58, 0.58]) {
    for (const z of [-0.5, 0.45]) b.box(0.05, 0.85, 0.05, M(x, 0.7, z), metal('#2e2b28'));
    b.box(0.05, 0.05, 1.0, M(x, 1.1, -0.02), metal('#2e2b28'));
  }
  return { base: b, fx: [] };
};

MAKERS['stairs-up'] = () => {
  const b = new Builder(38);
  const st = stone('#7e776c');
  for (let i = 0; i < 6; i++) b.box(1.0, 0.25 * (i + 1), 0.3, M(0, 0.125 * (i + 1), 0.45 - i * 0.3), st);
  for (const x of [-0.62, 0.62]) b.box(0.24, 2.0, 1.9, M(x, 1.0, -0.3), { tile: TILE.RUBBLE, color: '#6e675e' });
  b.box(1.0, 0.8, 0.3, M(0, 2.3, -1.15), { color: '#fff0d0', glow: '#ffe8b8', glowMode: 'always', glowK: 0.8 });
  b.box(1.5, 0.3, 0.4, M(0, 2.85, -1.15), { tile: TILE.RUBBLE, color: '#6e675e' });
  return { base: b, fx: [{ t: 'halo', p: [0, 2.3, -1.0], size: 2.4, color: [0.6, 0.55, 0.4] }] };
};

MAKERS['lair-gate'] = () => {
  const b = new Builder(39);
  // basalt frame of fused stone
  const rocks = [[-1.7, 1.0, 0.3, 1.0], [1.7, 1.0, 0.3, 1.0], [-1.5, 2.5, 0.35, 0.9], [1.5, 2.5, 0.35, 0.9], [0, 3.4, 0.4, 1.2], [-0.9, 3.3, 0.45, 0.8], [0.9, 3.3, 0.45, 0.8]];
  rocks.forEach(([x, y, z, r], i) => rockBlob(b, M(x, y, z, i), r, i % 2 ? '#6a625c' : '#5a5450', 90 + i, 0.9));
  const door = { tile: TILE.ROCK, color: '#4a4442', uvScale: 1.5 };
  b.box(1.25, 3.0, 0.35, M(-0.63, 1.5, 0.1), door);
  b.box(1.25, 3.0, 0.35, M(0.63, 1.5, 0.1), door);
  const glowC = { color: '#ff8a3a', glow: '#ff5a10', glowMode: 'always', glowK: 1 };
  // seam and fissures
  b.box(0.05, 2.9, 0.37, M(0, 1.5, 0.1), glowC);
  const cracks = [[-0.6, 2.2, 0.5, 0.6], [-0.4, 1.0, 0.7, -0.5], [0.5, 1.6, 0.6, 0.9], [0.7, 0.6, 0.4, -0.3], [-0.85, 0.5, 0.45, 0.2], [0.35, 2.5, 0.5, -0.7]];
  for (const [x, y, l, r] of cracks) b.box(l, 0.04, 0.02, M(x, y, -0.08, 0, 0, r), glowC);
  // keyhole sigil
  torus(b, M(0, 1.55, -0.09), 0.22, 0.03, glowC, 4, 16);
  b.box(0.08, 0.2, 0.02, M(0, 1.5, -0.09), glowC);
  cylinder(b, M(0, 1.58, -0.09, 0, Math.PI / 2), 0.05, 0.05, 0.02, glowC, 8);
  return { base: b, fx: [{ t: 'halo', p: [0, 1.6, -0.4], size: 3.0, color: [0.9, 0.3, 0.06] }, { t: 'flame', p: [-1.6, 0.0, -0.6], w: 0.5, h: 0.6, heat: 0.6 }, { t: 'flame', p: [1.5, 0.0, -0.7], w: 0.45, h: 0.5, heat: 0.5 }] };
};

// Market stall (2x2): frame + awning in base, goods in active.
MAKERS.stall = (e) => {
  const b = new Builder(40);
  const type = (e?.defId || 'stall_bakery').replace('stall_', '');
  const tint = e?.def?.model?.tint || '#c8893f';
  const w = wood('#7a5636');
  for (const [x, z, h] of [[-0.88, -0.78, 2.15], [0.88, -0.78, 2.15], [-0.88, 0.78, 2.45], [0.88, 0.78, 2.45]]) b.box(0.1, h, 0.1, M(x, h / 2, z), w);
  b.box(1.9, 0.85, 0.62, M(0, 0.425, -0.42), wood('#8a6440'));
  b.box(1.94, 0.07, 0.72, M(0, 0.88, -0.42), wood('#5e4129'));
  b.box(1.86, 0.22, 0.02, M(0, 0.62, -0.735), { tile: TILE.STRIPES, color: tint, uvScale: 0.5 });
  b.box(1.8, 0.06, 0.5, M(0, 1.2, 0.55), wood('#6a4a2e'));
  b.box(1.8, 0.06, 0.5, M(0, 0.6, 0.55), wood('#6a4a2e'));
  // awning: striped canvas sloping to the front + scalloped valance
  const awn = { tile: TILE.STRIPES, color: tint, uvScale: 0.6, sway: 0.004 };
  b.box(2.15, 0.04, 1.9, M(0, 2.32, 0, 0, -0.17), awn);
  for (let i = 0; i < 8; i++) {
    const x = -0.94 + i * 0.27;
    const tri = new THREE.CylinderGeometry(0.0, 0.14, 0.22, 3, 1); tri.rotateX(Math.PI); tri.scale(1, 1, 0.12); tri.translate(0, -0.11, 0);
    b.geo(tri, M(x, 2.17, -0.98), { tile: TILE.STRIPES, color: tint, uv: 'own', uvScale: [0.5, 1], sway: (wx, wy) => 0.03 });
  }
  const goods = new Builder(41);
  const rnd = mulberry32(type.length * 7);
  if (type === 'bakery') {
    for (let i = 0; i < 6; i++) sphere(goods, M(-0.7 + i * 0.28, 0.98, -0.42 + (i % 2) * 0.12, rnd(), 0, 0, 1.6, 0.7, 0.9), 0.1, { color: i % 3 ? '#c8893f' : '#b0703a' }, 8, 5);
    for (let i = 0; i < 3; i++) sphere(goods, M(-0.5 + i * 0.45, 0.97, -0.6, 0, 0, 0, 1, 0.6, 1), 0.11, { color: '#d8a050' }, 8, 5);
    cylinder(goods, M(0.65, 0.92, -0.25), 0.15, 0.15, 0.12, { color: '#f2c94c' }, 12);
    cylinder(goods, M(0.65, 1.04, -0.25), 0.15, 0.15, 0.03, { color: '#f7efe0' }, 12);
    for (let i = 0; i < 4; i++) sphere(goods, M(-0.6 + i * 0.4, 1.3, 0.5, 0, 0, 0, 1.6, 0.7, 0.9), 0.11, { color: '#b8803a' }, 8, 5);
    cylinder(goods, M(-0.4, 0.62, 0.55), 0.25, 0.2, 0.25, { tile: TILE.HAY, color: '#b08a50' }, 10, true);
  } else if (type === 'silk') {
    const cols = ['#f4efe2', '#e8d8f0', '#d0e4f0', '#f0d8d0', '#e8e2c8', '#c8a8e0'];
    for (let i = 0; i < 6; i++) cylinder(goods, M(-0.72 + i * 0.29, 1.03, -0.42, 0, Math.PI / 2, 0), 0.11, 0.11, 0.55, { tile: TILE.CANVAS, color: cols[i] }, 10);
    for (let i = 0; i < 4; i++) goods.box(0.35, 0.9, 0.02, M(-0.6 + i * 0.4, 1.7, 0.7), { tile: TILE.CANVAS, color: cols[(i + 2) % 6], sway: (x, y) => Math.max(0, 2.15 - y) * 0.02 });
    goods.box(1.8, 0.03, 0.03, M(0, 2.16, 0.7), wood('#5e4129'));
  } else if (type === 'fur') {
    const cols = ['#8a8a8a', '#6a5a4a', '#a09080', '#5a5050'];
    for (let i = 0; i < 4; i++) goods.box(0.55, 0.05, 0.9, M(-0.65 + i * 0.43, 0.94 + i * 0.01, -0.42, rnd() * 0.4 - 0.2, 0, 0), { tile: TILE.SACK, color: cols[i] });
    for (let i = 0; i < 3; i++) goods.box(0.5, 0.95, 0.03, M(-0.55 + i * 0.55, 1.65, 0.72), { tile: TILE.SACK, color: cols[(i + 1) % 4], sway: (x, y) => Math.max(0, 2.15 - y) * 0.015 });
    goods.box(1.8, 0.03, 0.03, M(0, 2.15, 0.72), wood('#5e4129'));
  } else { // gems
    for (let t = 0; t < 3; t++) {
      goods.box(0.45, 0.05, 0.32, M(-0.6 + t * 0.6, 0.94, -0.45), wood('#3a2616'));
      goods.box(0.4, 0.02, 0.27, M(-0.6 + t * 0.6, 0.97, -0.45), { color: '#4a1a2a' });
      for (let i = 0; i < 6; i++) {
        const col = ['#2f6fe0', '#2ecc71', '#e0314f'][(i + t) % 3];
        goods.geo(new THREE.OctahedronGeometry(0.045, 0), M(-0.75 + t * 0.6 + (i % 3) * 0.13, 1.01, -0.52 + Math.floor(i / 3) * 0.13, rnd() * 3), { color: col, glow: col, glowMode: 'tinted', glowK: 0.3, flat: true });
      }
    }
    chestBox(goods, M(0.2, 1.23, 0.55, 0, 0, 0, 0.5), { color: '#3a2616' });
  }
  return { base: b, active: goods, fx: [] };
};

export function makeObjectModel(kind, e, kit) {
  const fn = MAKERS[kind];
  if (!fn) return null;
  return fn(e, kit);
}
export const OBJECT_KINDS = Object.keys(MAKERS);
