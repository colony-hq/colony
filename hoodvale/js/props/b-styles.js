// Building style recipes (data/buildings.js `style`). Each recipe receives a BKit and fills its
// static (S) and fading (R) builders, effects and blocked furniture tiles. Specials (windmill,
// keep, spire, tents, ruin) live in b-special.js. Owner: props builder.

import * as THREE from 'three';
import { M, TILE } from './kit.js';
import { MAT, YAW_OUT, lanternInto } from './b-core.js';
import * as P from './parts.js';
import { SPECIAL } from './b-special.js';

const pick = (K, arr) => arr[Math.floor(K.rnd() * arr.length)];
const V = (m, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m);

// ---- furniture sets ------------------------------------------------------------------------------
function hearthItem(K, sides = null) {
  return K.wallItem(1.6, (B, m) => {
    const f = P.hearth(B, m, { chimney: K.H - 1.5 });
    const p = V(m, f[0], f[1], f[2]);
    K.fx.push({ t: 'flame', p: [p.x, p.y, p.z], w: 0.6, h: 0.55, heat: 0.85 });
    K.fx.push({ t: 'halo', p: [p.x, p.y + 0.35, p.z], size: 1.8, color: [0.7, 0.32, 0.08] });
  }, { sides, prefer: 'centre' });
}
function shelves(K, n, goods = 'books') {
  for (let i = 0; i < n; i++) K.wallItem(1.5, (B, m) => P.shelf(B, m, { w: 1.4, h: 1.85, goods: i % 2 && goods === 'mixed' ? 'bottles' : goods === 'mixed' ? 'books' : goods }));
}
function lowStuff(K, n) {
  const fns = [
    (B, m) => { P.barrel(B, at2(m, -0.2, 0, 0), { r: 0.24, h: 0.8 }); P.barrel(B, at2(m, 0.32, 0, 0.02), { r: 0.22, h: 0.7 }); },
    (B, m) => { P.crate(B, at2(m, -0.2, 0, 0), { s: 0.45 }); P.crate(B, at2(m, 0.3, 0, 0, 0.3), { s: 0.4 }); P.crate(B, at2(m, -0.15, 0.45, 0, 0.2), { s: 0.36 }); },
    (B, m) => { P.chestBox(B, m, { w: 0.8, d: 0.42, h: 0.4 }); },
    (B, m) => { P.sack(B, at2(m, -0.25, 0, 0)); P.sack(B, at2(m, 0.15, 0, 0.02, 1)); P.sack(B, at2(m, 0.0, 0.35, 0, 2, 0.4)); },
    (B, m) => { P.bench(B, m, { w: 1.1 }); },
  ];
  for (let i = 0; i < n; i++) K.wallItem(1.0, fns[Math.floor(K.rnd() * fns.length)], { tall: false });
}
const at2 = (m, x, y, z, ry = 0, rx = 0) => m.clone().multiply(M(x, y, z, ry, rx));

function tableSet(K, { tiles = [2, 1], items = true } = {}) {
  return K.centerItem(tiles[0], tiles[1], (B, m) => {
    const long = tiles[0] > 1 || tiles[1] > 1;
    const rot = tiles[1] > tiles[0] ? Math.PI / 2 : 0;
    const mm = m.clone().multiply(M(0, 0, 0, rot));
    P.table(B, mm, { w: long ? 1.7 : 0.8, d: 0.75, items });
    if (long) { P.bench(B, at2(mm, 0, 0, -0.62), { w: 1.5 }); P.bench(B, at2(mm, 0, 0, 0.62), { w: 1.5 }); }
    else { P.stool(B, at2(mm, -0.48, 0, 0)); P.stool(B, at2(mm, 0.48, 0, 0)); }
  });
}
function bedItem(K, blanket) {
  return K.centerItem(1, 2, (B, m) => P.bed(B, m, { blanket }), { margin: 1 }) || K.centerItem(2, 1, (B, m) => P.bed(B, m.clone().multiply(M(0, 0, 0, Math.PI / 2)), { blanket }));
}
function rugItem(K, w, d, tile = TILE.CARPET) {
  const ix0 = K.x0 + 1, ix1 = K.x1 - 1, iz0 = K.z0 + 1, iz1 = K.z1 - 1;
  const W = Math.min(w, ix1 - ix0 - 0.4), D = Math.min(d, iz1 - iz0 - 0.4);
  P.rug(K.S, M((ix0 + ix1) / 2, K.fy + 0.065, (iz0 + iz1) / 2, (iz1 - iz0) > (ix1 - ix0) ? Math.PI / 2 : 0), { w: Math.max(W, D), d: Math.min(W, D), tile });
}
function wallBanner(K, tile, n = 2) {
  for (let i = 0; i < n; i++) K.wallItem(0.9, (B, m) => P.banner(B, at2(m, 0, Math.min(K.H - 0.3, 2.6), 0.18, Math.PI), { tile, w: 0.75, h: 1.5, sway: 0.0 }), { depth: 0.1 });
}
function interiorLantern(K, n = 1) {
  for (let i = 0; i < n; i++) {
    const x = K.x0 + 1.5 + K.rnd() * (K.b.w - 3), z = K.z0 + 1.5 + K.rnd() * (K.b.d - 3);
    const y = K.fy + Math.min(K.H, K.cut + 0.5) - 0.4;
    K.R.box(0.02, 0.5, 0.02, M(x, y + 0.6, z), { color: '#2e2a26' });
    lanternInto(K.R, M(x, y, z));
    K.fx.push({ t: 'halo', p: [x, y + 0.16, z], size: 1.2, color: [0.8, 0.5, 0.2], night: true });
  }
}

// ---- generic recipes -----------------------------------------------------------------------------
function timberBuilding(K, o) {
  const plaster = o.plaster || '#efe4cc';
  const timber = o.timber || '#4a3222';
  K.planWindows(o.winSpacing ?? 2.1, { skip: o.winSkip });
  K.walls({ mat: MAT.plaster(plaster), plinth: 0.45, plinthMat: MAT.stone(o.plinth || '#9a9286') });
  K.timberFrame({ color: timber, plinth: 0.45 });
  K.windowsDress({ frame: timber, shutters: o.shutters, boxes: o.boxes });
  K.doorsDress({ frame: timber, leaf: o.leaf || '#7a5232' });
  K.floor({ tile: TILE.PLANKS, color: o.floor || '#a07a52' });
}

function upperStorey(K, { y0, y1, jetty = 0.25, plaster, timber, spacing = 1.9 }) {
  const B = K.R;
  const pm = MAT.plaster(plaster), tm = MAT.timber(timber);
  // jetty floor beams
  for (const s of ['N', 'E', 'S', 'W']) {
    const sd = K.side(s);
    const ext = s === 'N' || s === 'S' ? jetty : -jetty + 0.0;
    const ua = sd.u0 - (s === 'N' || s === 'S' ? jetty : 0), ub = sd.u1 + (s === 'N' || s === 'S' ? jetty : 0);
    void ext;
    K.sideBox(sd, ua, ub, y0 - 0.18, y0, tm, K.wt + 0.12, jetty, B);
    // windows
    const a = sd.i0 + 0.7, c = sd.i1 - 0.7, len = c - a;
    const n = Math.max(1, Math.round(len / spacing));
    const wins = [];
    for (let i = 0; i < n; i++) wins.push(n === 1 ? (a + c) / 2 : a + (len * (i + 0.5)) / n);
    let u = ua;
    const wy0 = y0 + 0.75, wy1 = y0 + 1.6;
    for (const wu of wins) {
      K.sideBox(sd, u, wu - 0.4, y0, y1, pm, K.wt, jetty, B);
      K.sideBox(sd, wu - 0.4, wu + 0.4, y0, wy0, pm, K.wt, jetty, B);
      K.sideBox(sd, wu - 0.4, wu + 0.4, wy1, y1, pm, K.wt, jetty, B);
      const p = K.pt(sd, wu, (wy0 + wy1) / 2, jetty);
      B.box(0.8, wy1 - wy0, 0.05, M(p.x, p.y, p.z, YAW_OUT[s]), { tile: TILE.WINDOW, uv: 'own', color: '#4c5a66', glow: '#ffb45a', glowMode: 'night', glowK: 1, jit: 0 });
      for (const k of [-1, 1]) K.sideBox(sd, wu + k * 0.44 - 0.04, wu + k * 0.44 + 0.04, wy0, wy1, tm, 0.08, jetty + K.wt / 2 + 0.02, B);
      K.sideBox(sd, wu - 0.48, wu + 0.48, wy1, wy1 + 0.08, tm, 0.08, jetty + K.wt / 2 + 0.02, B);
      K.sideBox(sd, wu - 0.5, wu + 0.5, wy0 - 0.08, wy0, tm, 0.14, jetty + K.wt / 2 + 0.04, B);
      u = wu + 0.4;
    }
    K.sideBox(sd, u, ub, y0, y1, pm, K.wt, jetty, B);
    // framing on the upper storey
    const nn = jetty + K.wt / 2 + 0.03;
    for (let uu = ua + 0.08; uu <= ub; uu += 0.9) {
      if (wins.some((w) => Math.abs(w - uu) < 0.52)) continue;
      K.sideBox(sd, uu - 0.07, uu + 0.07, y0, y1, tm, 0.06, nn, B);
    }
    K.sideBox(sd, ua, ub, y1 - 0.14, y1, tm, 0.06, nn, B);
    K.sideBox(sd, ua, ub, y0, y0 + 0.12, tm, 0.06, nn, B);
  }
}

function stoneBuilding(K, o) {
  K.planWindows(o.winSpacing ?? 2.2, { y0: o.wy0 ?? 0.95, y1: o.wy1 ?? 1.85, w: o.ww ?? 0.75 });
  K.walls({ mat: o.rubble ? MAT.rubble(o.stone) : MAT.stone(o.stone || '#bdb3a2'), plinth: 0.35, plinthMat: MAT.stone(o.plinth || '#8e8678') });
  if (!o.rubble) K.quoins({ color: o.quoin || '#d8d0c2' });
  // string course at the cut
  for (const s of ['N', 'E', 'S', 'W']) { const sd = K.side(s); K.sideBox(sd, sd.u0 - 0.05, sd.u1 + 0.05, K.H - 0.18, K.H, MAT.stone(o.quoin || '#d8d0c2'), K.wt + 0.1); }
  K.windowsDress({ frame: o.frame || '#4e3524', sill: o.quoin || '#d8d0c2', arch: !!o.arch, bars: !!o.bars, shutters: o.shutters });
  K.doorsDress({ frame: '#4e3524', leaf: o.leaf || '#5e3a22', arch: !!o.doorArch, stoneFrame: o.quoin || '#d8d0c2', double: !!o.double });
  K.floor({ tile: o.floorTile ?? TILE.FLAGSTONE, color: o.floor || '#b0a898' });
}

// ---- styles --------------------------------------------------------------------------------------
export const STYLES = {
  'timber-hall'(K) {
    K.H = 3.4;
    timberBuilding(K, { plaster: '#efe2c4', timber: '#47301f', shutters: '#3f6a3a', boxes: true, winSpacing: 2.0 });
    const r = K.gableRoof({ pitch: 46, mat: { tile: TILE.SHINGLES, color: '#9a6440' }, gable: MAT.plaster('#efe2c4'), gableTimber: '#47301f', barge: '#47301f' });
    // ridge bell-cote
    const top = V(r.F, 0, r.Hr, 0);
    K.R.boxAt(top.x - 0.45, top.y - 0.2, top.z - 0.45, top.x + 0.45, top.y + 0.9, top.z + 0.45, MAT.plaster('#efe2c4'));
    K.R.geo(new THREE.ConeGeometry(0.75, 1.0, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), M(top.x, top.y + 0.9, top.z), { tile: TILE.SHINGLES, color: '#8a5434', flat: true });
    K.R.box(0.05, 0.6, 0.05, M(top.x, top.y + 2.1, top.z), { tile: TILE.METAL, color: '#c9a24a' });
    K.R.box(0.4, 0.04, 0.04, M(top.x, top.y + 2.25, top.z), { tile: TILE.METAL, color: '#c9a24a' });
    K.sign("Guide's Hall", { icon: 'hall' });
    const d = K.doors[0];
    K.wallLantern(d.side, d.u - 1.0); K.wallLantern(d.side, d.u + 1.0);
    hearthItem(K, ['N']);
    shelves(K, 2, 'books');
    K.wallItem(1.4, (B, m) => P.weaponRack(B, m, { w: 1.3 }));
    wallBanner(K, TILE.BANNER_HOOD, 1);
    lowStuff(K, 2);
    tableSet(K, { tiles: [2, 1] });
    rugItem(K, 3, 1.4);
    interiorLantern(K, 2);
    // notice board outside
    const sd = K.side(d.side);
    P.noticeBoard(K.S, K.frame(sd, d.u + 2.3, 0, K.wt / 2 + 0.55));
  },

  'timber-shop'(K) {
    K.H = 3.1;
    timberBuilding(K, { plaster: '#ecd6a8', timber: '#4e3524', shutters: '#3a5f8a', boxes: true });
    K.gableRoof({ pitch: 48, mat: { tile: TILE.THATCH, color: '#c8a45c' }, thatch: true, gable: MAT.plaster('#ecd6a8'), gableTimber: '#4e3524' });
    const d = K.doors[0];
    const sd = K.side(d.side);
    // striped awning across the shop front
    const len = sd.i1 - sd.i0 - 0.4;
    const mA = K.frame(sd, (sd.i0 + sd.i1) / 2, 2.25, K.wt / 2 + 0.55);
    K.R.box(len, 0.04, 1.1, mA.clone().multiply(M(0, 0, 0, 0, 0.32)), { tile: TILE.STRIPES, color: '#c0453a', uvScale: 0.7 });
    for (let i = 0; i < Math.floor(len / 0.3); i++) {
      const tri = new THREE.CylinderGeometry(0, 0.15, 0.22, 3); tri.rotateX(Math.PI); tri.scale(1, 1, 0.12);
      K.R.geo(tri, mA.clone().multiply(M(-len / 2 + 0.15 + i * 0.3, -0.27, -0.52)), { tile: TILE.STRIPES, color: '#c0453a', uv: 'own', sway: 0.01 });
    }
    K.sign('General Store', { icon: 'sack', y: 2.75, w: 2.2, h: 0.48 });
    // goods outside
    P.barrel(K.S, K.frame(sd, d.u - 1.4, 0, K.wt / 2 + 0.6), { r: 0.3, h: 0.85 });
    P.crate(K.S, K.frame(sd, d.u + 1.3, 0, K.wt / 2 + 0.55, false, 0.3), { s: 0.55 });
    P.sack(K.S, K.frame(sd, d.u + 1.9, 0, K.wt / 2 + 0.5));
    K.wallLantern(d.side, d.u - 0.85);
    K.wallItem(2.2, (B, m) => { P.table(B, m, { w: 2.1, d: 0.42, h: 0.95 }); P.sack(B, at2(m, -0.6, 0.95, 0)); P.crate(B, at2(m, 0.5, 0.95, 0), { s: 0.3 }); }, { sides: ['N'], tall: false });
    shelves(K, 3, 'mixed');
    lowStuff(K, 3);
    interiorLantern(K, 1);
  },

  'stone-bank'(K) {
    K.H = 3.5;
    const big = K.b.w * K.b.d > 40;
    stoneBuilding(K, { stone: '#cbc2b0', quoin: '#e2dacb', arch: true, bars: true, doorArch: true, floor: '#d0c8b8', floorTile: TILE.MARBLE });
    K.hipRoof({ pitch: 32, mat: { tile: TILE.SLATE, color: '#5d6672' }, under: '#4a3a2e' });
    const d = K.doors[0];
    const sd = K.side(d.side);
    // pilasters + chain emblem over the door
    for (const k of [-1, 1]) {
      K.sideBox(sd, d.u + k * 0.95 - 0.16, d.u + k * 0.95 + 0.16, 0, K.H - 0.2, MAT.stone('#e2dacb'), 0.18, K.wt / 2 + 0.08);
      const cap = K.pt(sd, d.u + k * 0.95, K.H - 0.25, K.wt / 2 + 0.1);
      K.R.box(0.45, 0.14, 0.3, M(cap.x, cap.y, cap.z, YAW_OUT[d.side]), MAT.stone('#e2dacb'));
    }
    const em = K.pt(sd, d.u, 2.95, K.wt / 2 + 0.12);
    const mm = M(em.x, em.y, em.z, YAW_OUT[d.side]);
    K.R.geo(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 18).rotateX(Math.PI / 2), mm, { tile: TILE.METAL, color: '#e8bf4a' });
    for (const k of [-1, 1]) K.R.geo(new THREE.TorusGeometry(0.1, 0.03, 5, 12), mm.clone().multiply(M(k * 0.07, 0, -0.05, 0, 0, k * 0.0)), { color: '#3ad6a0', glow: '#3ad6a0', glowMode: 'always', glowK: 0.8 });
    K.fx.push({ t: 'halo', p: [em.x, em.y, em.z], size: 1.0, color: [0.05, 0.35, 0.25] });
    K.sign(K.b.name.replace('Brightwater ', '').replace('Gildmoor ', ''), { icon: 'coin', y: 2.42, w: 2.0, h: 0.42, board: '#2a3a36', ink: '#f2d27a' });
    K.wallLantern(d.side, d.u - 1.45, 2.0); K.wallLantern(d.side, d.u + 1.45, 2.0);
    shelves(K, big ? 3 : 2, 'books');
    for (let i = 0; i < (big ? 3 : 2); i++) K.wallItem(1.0, (B, m) => { P.chestBox(B, m, { w: 0.85, d: 0.42, h: 0.42, color: '#4a2e1e', lock: '#e8bf4a' }); P.coins(B, at2(m, 0.25, 0.62, 0), { n: 6, r: 0.12, rnd: K.rnd }); }, { tall: false });
    wallBanner(K, TILE.BANNER_CHAIN, big ? 2 : 1);
    rugItem(K, 3, 1.3);
    interiorLantern(K, big ? 2 : 1);
  },

  'open-forge'(K) {
    K.H = 3.2;
    const { x0, z0, x1, z1, fy } = K;
    // dirt/flagstone floor + low stone plinth around
    K.S.boxAt(x0 + 0.05, fy - 0.6, z0 + 0.05, x1 - 0.05, fy + 0.03, z1 - 0.05, { tile: TILE.FLAGSTONE, color: '#8a8070', world: true });
    const posts = [];
    for (const x of [x0 + 0.25, (x0 + x1) / 2, x1 - 0.25]) for (const z of [z0 + 0.25, z1 - 0.25]) posts.push([x, z]);
    for (const [x, z] of posts) {
      K.S.boxAt(x - 0.18, fy, z - 0.18, x + 0.18, fy + 0.35, z + 0.18, MAT.stone('#8e8678'));
      K.put(0.35, K.H, (B, a, c) => B.boxAt(x - 0.12, fy + a, z - 0.12, x + 0.12, fy + c, z + 0.12, MAT.timber('#4a3222')));
    }
    for (const z of [z0 + 0.25, z1 - 0.25]) K.R.boxAt(x0 + 0.1, fy + K.H - 0.2, z - 0.14, x1 - 0.1, fy + K.H, z + 0.14, MAT.timber('#4a3222'));
    for (const x of [x0 + 0.25, x1 - 0.25]) K.R.boxAt(x - 0.14, fy + K.H - 0.2, z0 + 0.1, x + 0.14, fy + K.H, z1 - 0.1, MAT.timber('#4a3222'));
    const r = K.gableRoof({ pitch: 38, over: 0.5, mat: { tile: TILE.SHINGLES, color: '#7a5a44' }, ends: false, H: K.H });
    // gable triangles open: add timber trusses instead
    for (const t of [-0.5, 0, 0.5]) {
      const a = V(r.F, t * (r.L - 0.4), K.H, -r.hs), b = V(r.F, t * (r.L - 0.4), r.Hr - 0.1, 0), c = V(r.F, t * (r.L - 0.4), K.H, r.hs);
      K.R.beam(a.x, a.y, a.z, b.x, b.y, b.z, 0.12, MAT.timber('#4a3222'));
      K.R.beam(c.x, c.y, c.z, b.x, b.y, b.z, 0.12, MAT.timber('#4a3222'));
      K.R.beam(a.x, a.y, a.z, c.x, c.y, c.z, 0.12, MAT.timber('#4a3222'));
    }
    // flue over the furnace (if one stands here)
    const furn = (K.ctx.spawns?.objects || []).find((o) => o.def === 'furnace' && o.x >= x0 && o.x < x1 && o.z >= z0 && o.z < z1);
    if (furn) K.roofChimney(furn.x + 1, furn.z + 1.15, K.H - 0.4, r.Hr + 1.0, { mat: MAT.brick('#9a6a56'), w: 0.8 });
    K.sign(K.b.name, { icon: 'anvil', s: 'S', u: (x0 + x1) / 2, y: K.H - 0.45, n: K.side('S').c - (z1 - 0.25) + 0.2, w: 2.2, h: 0.46 });
    // forge clutter on blocked tiles (never on the path)
    const B = K.S;
    const spots = [
      (b, m) => P.weaponRack(b, m, { w: 1.1 }),
      (b, m) => { P.barrel(b, at2(m, 0, 0, 0), { open: true, fill: '#26404e', r: 0.3, h: 0.7 }); P.bucket(b, at2(m, 0.45, 0, 0.1)); },
      (b, m) => { P.cylinder(b, at2(m, 0, 0.55, 0, 0, 0, 0), 0.32, 0.32, 0.12, { tile: TILE.ROCK, color: '#b0a898' }, 14); b.box(0.12, 0.6, 0.5, at2(m, 0, 0.3, 0), MAT.timber('#5e4129')); },
      (b, m) => { for (let i = 0; i < 8; i++) P.sphere(b, at2(m, (i % 3) * 0.2 - 0.2, 0.1 + Math.floor(i / 3) * 0.1, (i % 2) * 0.15), 0.12, { color: '#26221f', flat: true }, 5, 3); b.box(0.9, 0.3, 0.6, at2(m, 0, 0.15, 0), MAT.hplanks('#5e4129')); },
      (b, m) => P.crate(b, m, { s: 0.6 }),
    ];
    let placed = 0;
    for (let i = 0; i < 12 && placed < 4; i++) {
      if (openSpot(K, (b, m) => spots[placed % spots.length](b, m))) placed++;
    }
    // hanging tools on the tie beam
    for (let i = 0; i < 4; i++) {
      const x = x0 + 1.2 + i * 0.35, z = z1 - 0.25;
      B.box(0.03, 0.4, 0.03, M(x, fy + K.H - 0.45, z), { tile: TILE.METAL, color: '#3a3a3e' });
    }
  },

  'timber-inn'(K) {
    K.H = 2.9;
    const gm = K.b.zone === 'gildmoor';
    const plaster = gm ? '#e9dcc0' : '#f0e2c8';
    const timber = '#42291a';
    timberBuilding(K, { plaster, timber, shutters: gm ? '#7a2a24' : '#3f6a3a', boxes: true, winSpacing: 1.9, floor: '#9a6e46' });
    upperStorey(K, { y0: 2.9, y1: 5.2, jetty: 0.28, plaster, timber });
    const r = K.gableRoof({ H: 5.2, pitch: 46, mat: gm ? { tile: TILE.CLAY, color: '#b0563a' } : { tile: TILE.THATCH, color: '#c4a258' }, thatch: !gm, gable: MAT.plaster(plaster), gableTimber: timber, hsOverride: K.dims(K.b.w >= K.b.d ? 'x' : 'z').hs + 0.28, lenOverride: K.dims(K.b.w >= K.b.d ? 'x' : 'z').L + 0.56 });
    // chimneys
    const axisX = K.b.w >= K.b.d;
    const c1 = V(r.F, -r.L * 0.28, 0, 0);
    K.roofChimney(c1.x, c1.z, 4.0, r.Hr + 0.9, { mat: MAT.stone('#9a9286'), w: 0.75 });
    void axisX;
    const d = K.doors[0];
    K.bladeSign(K.b.name, { icon: 'mug', y: 2.45, w: 1.35, h: 0.6 });
    K.sign(K.b.name, { icon: 'mug', y: 2.42, w: 2.3, h: 0.5 });
    K.wallLantern(d.side, d.u - 0.95); K.wallLantern(d.side, d.u + 0.95);
    const sd = K.side(d.side);
    P.bench(K.S, K.frame(sd, d.u + 2.0, 0, K.wt / 2 + 0.45), { w: 1.3 });
    P.barrel(K.S, K.frame(sd, d.u - 2.0, 0, K.wt / 2 + 0.5), { r: 0.3 });
    P.barrel(K.S, K.frame(sd, d.u - 2.6, 0, K.wt / 2 + 0.5), { r: 0.28, h: 0.85 });
    // interior: bar counter, tables, barrels, bottles
    K.wallItem(2.4, (B, m) => {
      P.table(B, m, { w: 2.3, d: 0.45, h: 1.0, color: '#6a4a2e' });
      for (let i = 0; i < 4; i++) P.cylinder(B, at2(m, -0.9 + i * 0.5, 1.0, 0), 0.05, 0.055, 0.14, { tile: TILE.PLANKS, color: '#a07a50' }, 7);
    }, { tall: false, prefer: 'centre' });
    shelves(K, 2, 'bottles');
    K.wallItem(1.2, (B, m) => { P.barrel(B, at2(m, -0.3, 0, 0), { r: 0.26, h: 0.8 }); P.barrel(B, at2(m, 0.3, 0, 0), { r: 0.26, h: 0.8 }); P.barrel(B, at2(m, 0, 0.8, 0, 0, Math.PI / 2), { r: 0.24, h: 0.7 }); }, { tall: true });
    hearthItem(K);
    tableSet(K, { tiles: [1, 1] });
    tableSet(K, { tiles: [1, 1] });
    tableSet(K, { tiles: [2, 1] });
    lowStuff(K, 2);
    interiorLantern(K, 2);
  },

  cottage(K) {
    K.H = 2.8;
    const plaster = pick(K, ['#efe4cc', '#ead2a6', '#f2dcd0', '#e8e4d6', '#e6d8b8']);
    const shutters = pick(K, ['#3f6a3a', '#3a5f8a', '#8a3a2e', '#6a4a7a', '#2f6a6a']);
    timberBuilding(K, { plaster, timber: '#4a3222', shutters, boxes: true, winSpacing: 2.0 });
    const farm = K.b.zone === 'farms';
    const r = K.gableRoof({ pitch: 47, mat: { tile: TILE.THATCH, color: farm ? '#c8a65e' : pick(K, ['#c4a258', '#b8964e', '#cfae64']) }, thatch: true, gable: MAT.plaster(plaster), gableTimber: '#4a3222' });
    // exterior chimney on a gable end
    const axisX = K.b.w >= K.b.d;
    const gs = axisX ? (K.rnd() < 0.5 ? 'W' : 'E') : (K.rnd() < 0.5 ? 'N' : 'S');
    const gsd = K.side(gs);
    if (!K.doors.some((d) => d.side === gs)) K.chimney(gs, (gsd.i0 + gsd.i1) / 2, r.Hr + 0.7);
    const d = K.doors[0];
    K.wallLantern(d.side, d.u + 0.85);
    bedItem(K, pick(K, ['#7a3a34', '#3a5a7a', '#5a7a3a', '#7a6a3a']));
    tableSet(K, { tiles: [1, 1] });
    K.wallItem(1.6, (B, m) => { const f = P.hearth(B, m, { w: 1.3, chimney: K.H - 1.5 }); const p = V(m, f[0], f[1], f[2]); K.fx.push({ t: 'flame', p: [p.x, p.y, p.z], w: 0.5, h: 0.45, heat: 0.8 }); K.fx.push({ t: 'halo', p: [p.x, p.y + 0.3, p.z], size: 1.5, color: [0.6, 0.28, 0.07] }); }, { sides: [gs], prefer: 'centre' });
    shelves(K, 1, pick(K, ['books', 'bottles']));
    lowStuff(K, 2);
    rugItem(K, 2, 1.2, TILE.CARPET);
    // garden bits outside
    const sd = K.side(d.side);
    P.flowerBox(K.S, K.frame(sd, d.u - 1.3, 0, K.wt / 2 + 0.35), { w: 0.8 });
    P.bush(K.S, K.frame(sd, d.u + 1.6, 0, K.wt / 2 + 0.6), { r: 0.45 });
  },

  barn(K) {
    K.H = 3.4;
    const red = '#8e3b2e';
    K.planWindows(3.0, { sides: ['E', 'W', 'S'], w: 0.7, y0: 1.2, y1: 1.8 });
    K.walls({ mat: MAT.planks(red), plinth: 0.3, plinthMat: MAT.stone('#8e8678') });
    // white trim corners + big sliding door panels around the opening
    for (const [x, z] of [[K.x0 + 0.1, K.z0 + 0.1], [K.x1 - 0.1, K.z0 + 0.1], [K.x0 + 0.1, K.z1 - 0.1], [K.x1 - 0.1, K.z1 - 0.1]]) K.put(0, K.H, (B, a, c) => B.boxAt(x - 0.12, K.fy + a, z - 0.12, x + 0.12, K.fy + c, z + 0.12, MAT.timber('#e8e0d0')));
    K.windowsDress({ frame: '#e8e0d0', glass: '#3a3a36', sill: '#e8e0d0' });
    K.doorsDress({ frame: '#e8e0d0', leaf: '#7a3428' });
    const d = K.doors[0];
    const sd = K.side(d.side);
    for (const k of [-1, 1]) {
      const u = d.u + k * 1.25;
      K.sideBox(sd, u - 0.7, u + 0.7, 0.05, 2.6, MAT.planks('#7a3428'), 0.06, K.wt / 2 + 0.06);
      for (const y of [0.15, 1.3, 2.45]) K.sideBox(sd, u - 0.7, u + 0.7, y, y + 0.12, MAT.timber('#e8e0d0'), 0.07, K.wt / 2 + 0.1);
      const a = K.pt(sd, u - 0.65, 0.25, K.wt / 2 + 0.1), b = K.pt(sd, u + 0.65, 2.4, K.wt / 2 + 0.1);
      K.S.beam(a.x, a.y, a.z, b.x, b.y, b.z, 0.1, MAT.timber('#e8e0d0'), 0.05);
    }
    K.sideBox(sd, d.u - 2.1, d.u + 2.1, 2.62, 2.74, { tile: TILE.METAL, color: '#2e2b28' }, 0.06, K.wt / 2 + 0.06);
    K.floor({ tile: TILE.HAY, color: '#c8a860' });
    // gambrel roof
    const axis = K.b.w >= K.b.d ? 'x' : 'z';
    const F = K.roofFrame(axis);
    const { L, hs } = K.dims(axis);
    const over = 0.35, t1 = (62 * Math.PI) / 180, t2 = (24 * Math.PI) / 180;
    const bz = hs * 0.55, by = K.H + (hs - bz) * Math.tan(t1);
    const ry = by + bz * Math.tan(t2);
    const mat = { tile: TILE.SHINGLES, color: '#5e4e46' };
    for (const sg of [-1, 1]) {
      // lower steep
      const z0 = sg * (hs + over * 0.4), y0 = K.H - over * 0.4 * Math.tan(t1), z1 = sg * bz;
      const lenA = Math.hypot(z1 - z0, by - y0);
      const mA = F.clone().multiply(M(0, (y0 + by) / 2 - Math.cos(t1) * 0.06, (z0 + z1) / 2 - sg * Math.sin(t1) * 0.06, 0, sg * t1, 0));
      K.R.box(L + 0.6, 0.12, lenA, mA, { ...mat, flipV: sg < 0 });
      const lenB = Math.hypot(bz, ry - by);
      const mB = F.clone().multiply(M(0, (by + ry) / 2 - Math.cos(t2) * 0.06, sg * bz / 2 - sg * Math.sin(t2) * 0.06, 0, sg * t2, 0));
      K.R.box(L + 0.6, 0.12, lenB + 0.08, mB, { ...mat, flipV: sg < 0 });
    }
    K.R.box(L + 0.62, 0.14, 0.3, F.clone().multiply(M(0, ry + 0.02, 0)), { tile: TILE.SLATE, color: '#3e3430' });
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(-hs, K.H); sh.lineTo(hs, K.H); sh.lineTo(bz, by); sh.lineTo(0, ry); sh.lineTo(-bz, by); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: K.wt, bevelEnabled: false });
      g.rotateY(Math.PI / 2); g.translate(sx * (L / 2 - K.wt / 2) - K.wt / 2, 0, 0);
      K.R.geo(g, F, MAT.planks(red));
      // hay loft door
      const lp = V(F, sx * (L / 2 + 0.03), K.H + 0.9, 0);
      K.R.box(0.06, 1.1, 0.9, M(lp.x, lp.y, lp.z, axis === 'x' ? 0 : Math.PI / 2), { tile: TILE.PLANKS, color: '#6a2e24', uvRot: true });
      K.R.box(0.08, 1.2, 0.08, M(lp.x, lp.y, lp.z, axis === 'x' ? 0 : Math.PI / 2), MAT.timber('#e8e0d0'));
    }
    // weathervane
    const wv = V(F, 0, ry + 0.1, 0);
    K.R.box(0.04, 1.0, 0.04, M(wv.x, wv.y + 0.5, wv.z), { tile: TILE.METAL, color: '#2e2b28' });
    K.R.box(0.6, 0.18, 0.02, M(wv.x, wv.y + 0.95, wv.z, 0.6), { tile: TILE.METAL, color: '#2e2b28' });
    // inside: hay bales, cart, stalls
    for (let i = 0; i < 3; i++) K.wallItem(1.2, (B, m) => { P.hayBale(B, at2(m, 0, 0, 0)); if (i % 2 === 0) P.hayBale(B, at2(m, 0.05, 0.55, 0, 0.1)); }, { tall: false });
    K.centerItem(2, 2, (B, m) => P.cart(B, m.clone().multiply(M(0, 0, 0, 0.3, 0, 0, 0.85)), { load: 'hay' }));
    K.centerItem(1, 1, (B, m) => P.hayBale(B, m));
    K.wallItem(1.0, (B, m) => { P.shovel(B, at2(m, -0.2, 0, 0.1, 0, 0.15)); P.pickaxe(B, at2(m, 0.25, 0, 0.1, 0, 0.12)); }, { tall: false, depth: 0.2 });
    interiorLantern(K, 1);
  },

  shack(K) {
    K.H = 2.6;
    const grey = '#8f8a80';
    K.planWindows(2.2, { w: 0.6, y0: 1.0, y1: 1.6 });
    K.walls({ mat: MAT.planks(grey), plinth: 0.2, plinthMat: MAT.stone('#7a746c') });
    K.windowsDress({ frame: '#5a544c', glass: '#3a4650', shutters: '#5a7a8a' });
    K.doorsDress({ frame: '#5a544c', leaf: '#6a645a' });
    K.floor({ tile: TILE.PLANKS, color: '#8a7a64' });
    for (const [x, z] of [[K.x0 + 0.1, K.z0 + 0.1], [K.x1 - 0.1, K.z0 + 0.1], [K.x0 + 0.1, K.z1 - 0.1], [K.x1 - 0.1, K.z1 - 0.1]]) K.put(0, K.H + 0.6, (B, a, c) => B.boxAt(x - 0.12, K.fy + a, z - 0.12, x + 0.12, K.fy + c, z + 0.12, MAT.timber('#5a544c')));
    // lean-to roof sloping away from the door
    const d = K.doors[0];
    const axis = d.side === 'N' || d.side === 'S' ? 'x' : 'z';
    const F = K.roofFrame(axis);
    const { L, hs } = K.dims(axis);
    const hiSide = d.side === 'N' || d.side === 'W' ? -1 : 1;
    const yHi = K.H + 1.0, yLo = K.H;
    const th = Math.atan2(yHi - yLo, 2 * hs);
    const len = (2 * hs + 0.9) / Math.cos(th);
    K.R.box(L + 0.6, 0.1, len, F.clone().multiply(M(0, (yHi + yLo) / 2 + 0.05, 0, 0, -hiSide * th, 0)), { tile: TILE.SHINGLES, color: '#6e6862', flipV: hiSide > 0 });
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(-hs, K.H); sh.lineTo(hs, K.H); sh.lineTo(hiSide * hs, yHi - 0.05); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: K.wt, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(sx * (L / 2 - K.wt / 2) - K.wt / 2, 0, 0);
      K.R.geo(g, F, MAT.planks(grey));
    }
    // nets, fish sign, crates of fish
    const sd = K.side(d.side);
    const nm = K.frame(sd, d.u - 1.4, 1.3, K.wt / 2 + 0.06);
    const netG = new THREE.PlaneGeometry(1.3, 1.6);
    K.S.geo(netG, nm.clone().multiply(M(0, 0, 0, Math.PI)), { tile: TILE.NET, color: '#d8c8a0', uvScale: 0.8, sway: 0.01 });
    K.sign('Fishmonger', { icon: 'fish', y: K.H - 0.25, w: 1.8, h: 0.42, board: '#3a4a56', ink: '#e8f0f0' });
    for (const k of [1.3, 1.9]) {
      const m = K.frame(sd, d.u + k, 0, K.wt / 2 + 0.5, false, 0.2);
      P.crate(K.S, m, { s: 0.5, color: '#a08a6a' });
      for (let i = 0; i < 4; i++) P.sphere(K.S, at2(m, -0.12 + (i % 2) * 0.22, 0.52, -0.1 + Math.floor(i / 2) * 0.2, 0, 0, 0), 0.08, { color: '#9fb4c7' }, 6, 4);
    }
    // buoys
    for (let i = 0; i < 3; i++) { const p = K.pt(sd, d.u - 2.3 + i * 0.25, 1.9 - i * 0.2, K.wt / 2 + 0.12); P.sphere(K.S, M(p.x, p.y, p.z), 0.12, { color: i % 2 ? '#c0453a' : '#efe6d2' }, 8, 6); }
    K.wallItem(2.0, (B, m) => { P.table(B, m, { w: 1.9, d: 0.45, h: 0.95, color: '#8a7a64' }); for (let i = 0; i < 5; i++) P.sphere(B, at2(m, -0.7 + i * 0.35, 0.98, 0, 0, 0, 0), 0.07, { color: ['#9fb4c7', '#f08a6c', '#c9a07a'][i % 3] }, 6, 4); }, { tall: false, prefer: 'centre' });
    lowStuff(K, 2);
  },

  'log-lodge'(K) {
    K.H = 3.0;
    const log = '#6e5038';
    K.planWindows(2.2, { w: 0.7, y0: 1.05, y1: 1.75 });
    // walls of stacked logs between openings
    K.floor({ tile: TILE.PLANKS, color: '#8a6a48' });
    for (const s of ['N', 'E', 'S', 'W']) {
      const sd = K.side(s);
      const ops = K.openings(s);
      for (let y = 0.17, i = 0; y < K.H; y += 0.3, i++) {
        const ext = s === 'N' || s === 'S' ? 0.35 : 0.0;
        const segs = [];
        let u = sd.u0 - ext;
        for (const op of ops) { if (y > op.y0 - 0.05 && y < op.y1 + 0.1) { segs.push([u, op.u0]); u = op.u1; } }
        segs.push([u, sd.u1 + ext]);
        const yo = s === 'N' || s === 'S' ? 0 : 0.15;
        for (const [a, c] of segs) {
          if (c - a < 0.05) continue;
          const p = K.pt(sd, (a + c) / 2, y + yo, 0);
          const g = new THREE.CylinderGeometry(0.17, 0.17, c - a, 7, 1, true);
          g.rotateZ(Math.PI / 2);
          const m = M(p.x, p.y, p.z, sd.axis === 'x' ? 0 : Math.PI / 2);
          const B = y + yo > K.cut ? K.R : K.S;
          B.geo(g, m, { tile: TILE.BARK, color: i % 2 ? log : '#7a5a40', uvScale: 1.2 });
        }
      }
      // fill behind logs (chinking)
      K.walls({ mat: MAT.plaster('#8a7a5a'), sides: [s], t: 0.16 });
    }
    K.windowsDress({ frame: '#4a3222', shutters: '#3a5a2a' });
    K.doorsDress({ frame: '#4a3222', leaf: '#5e4129' });
    const r = K.gableRoof({ pitch: 40, mat: { tile: TILE.SHINGLES, color: '#6a6440' }, gable: MAT.planks('#6e5038'), barge: '#3a2a1a' });
    // moss patches on the roof
    for (let i = 0; i < 8; i++) {
      const x = (K.rnd() - 0.5) * r.L, z = (K.rnd() - 0.5) * r.hs * 1.6;
      const y = r.Hr - Math.abs(z) * Math.tan(r.th) + 0.08;
      K.R.geo(new THREE.IcosahedronGeometry(0.3, 0).scale(1.4, 0.3, 1), r.F.clone().multiply(M(x, y, z)), { tile: TILE.TURF, color: '#5a7a34' });
    }
    // porch over the door
    const d = K.doors[0];
    const sd = K.side(d.side);
    for (const k of [-1.3, 1.3]) { const p = K.pt(sd, d.u + k, 0, K.wt / 2 + 1.35); K.put(0, 2.5, (B, a, c) => B.boxAt(p.x - 0.1, K.fy + a, p.z - 0.1, p.x + 0.1, K.fy + c, p.z + 0.1, { tile: TILE.BARK, color: log })); }
    const pm = K.frame(sd, d.u, 2.6, K.wt / 2 + 0.75);
    K.R.box(3.2, 0.08, 1.7, pm.clone().multiply(M(0, 0, 0, 0, 0.22)), { tile: TILE.SHINGLES, color: '#6a6440' });
    // antlers + Hood banners
    const ap = K.pt(sd, d.u, 2.45, K.wt / 2 + 0.1);
    for (const k of [-1, 1]) {
      const g = new THREE.TorusGeometry(0.28, 0.035, 4, 8, Math.PI * 0.7);
      K.R.geo(g, M(ap.x, ap.y + 0.1, ap.z, YAW_OUT[d.side], 0, k > 0 ? -0.3 : Math.PI + 0.3), { color: '#e8dcc0' });
    }
    K.sign('The Hood Lodge', { icon: 'bow', y: 2.08, w: 1.9, h: 0.42, board: '#2f4a2a', ink: '#efe2c4', B: K.S });
    for (const k of [-2.0, 2.0]) {
      const p = K.pt(sd, d.u + k, 0, K.wt / 2 + 1.0);
      K.S.box(0.08, 3.2, 0.08, M(p.x, K.fy + 1.6, p.z), { color: '#5e4129' });
      P.banner(K.S, M(p.x, K.fy + 3.0, p.z, YAW_OUT[d.side] + Math.PI / 2), { tile: TILE.BANNER_HOOD, w: 0.7, h: 1.5, bar: '#5e4129' });
    }
    K.wallItem(1.4, (B, m) => P.weaponRack(B, m, { w: 1.3 }));
    K.wallItem(1.4, (B, m) => { B.box(1.3, 0.06, 0.12, at2(m, 0, 1.6, 0.1), MAT.timber('#4a3222')); for (let i = 0; i < 3; i++) P.torus(B, at2(m, -0.4 + i * 0.4, 1.2, 0.12, 0, 0, Math.PI / 2), 0.45, 0.02, { tile: TILE.BARK, color: '#8d6e3f' }, 4, 10, Math.PI * 0.6); });
    wallBanner(K, TILE.BANNER_HOOD, 1);
    tableSet(K, { tiles: [1, 1] });
    lowStuff(K, 3);
    hearthItem(K);
    interiorLantern(K, 1);
  },

  'stone-hut'(K) {
    K.H = 2.7;
    stoneBuilding(K, { stone: '#9a8e7c', rubble: true, quoin: '#b0a490', floor: '#8a8070', shutters: '#5a4a3a' });
    const r = K.gableRoof({ pitch: 38, mat: { tile: TILE.SLATE, color: '#55555c' }, gable: MAT.rubble('#9a8e7c'), barge: '#3a2a1a' });
    const axisX = K.b.w >= K.b.d;
    const gs = axisX ? 'W' : 'N';
    const gsd = K.side(gs);
    K.chimney(gs, (gsd.i0 + gsd.i1) / 2, r.Hr + 0.6, { mat: MAT.rubble('#8a7e6c') });
    const d = K.doors[0];
    const sd = K.side(d.side);
    K.sign("Miners' Hut", { icon: 'pick', y: 2.32, w: 1.8, h: 0.42, board: '#4a3a2a' });
    K.wallLantern(d.side, d.u - 0.9, 1.9);
    P.mineCart(K.S, K.frame(sd, d.u + 1.8, 0, K.wt / 2 + 0.75, false, 0.4), { ore: '#b5703b' });
    P.crate(K.S, K.frame(sd, d.u - 1.9, 0, K.wt / 2 + 0.5), { s: 0.55 });
    P.pickaxe(K.S, K.frame(sd, d.u - 1.3, 0, K.wt / 2 + 0.15, false, 0.2));
    K.wallItem(1.4, (B, m) => P.weaponRack(B, m, { w: 1.2 }));
    shelves(K, 1, 'bottles');
    K.wallItem(1.0, (B, m) => P.mineCart(B, m.clone().multiply(M(0, 0, 0.05, Math.PI / 2, 0, 0, 0.7)), { ore: '#7a5545' }), { tall: false });
    lowStuff(K, 2);
    tableSet(K, { tiles: [1, 1] });
    hearthItem(K);
  },

  'stilt-hut'(K) {
    K.H = 2.6;
    const wood = '#5e5a44';
    // stilts poking out around the base and a raised deck edge
    for (let x = K.x0 - 0.2; x <= K.x1 + 0.2; x += 1.25) for (const z of [K.z0 - 0.2, K.z1 + 0.2]) K.S.box(0.16, 1.4, 0.16, M(x, K.fy - 0.4, z, 0, 0.05, 0.08), { tile: TILE.BARK, color: '#4a4434' });
    for (let z = K.z0 + 1; z <= K.z1 - 1; z += 1.25) for (const x of [K.x0 - 0.2, K.x1 + 0.2]) K.S.box(0.16, 1.4, 0.16, M(x, K.fy - 0.4, z, 0, -0.06, 0.05), { tile: TILE.BARK, color: '#4a4434' });
    K.S.boxAt(K.x0 - 0.3, K.fy - 0.12, K.z0 - 0.3, K.x1 + 0.3, K.fy + 0.04, K.z1 + 0.3, MAT.hplanks('#6a6250'));
    K.planWindows(2.0, { w: 0.6, y0: 1.0, y1: 1.6 });
    K.walls({ mat: MAT.planks(wood) });
    for (const [x, z] of [[K.x0 + 0.1, K.z0 + 0.1], [K.x1 - 0.1, K.z0 + 0.1], [K.x0 + 0.1, K.z1 - 0.1], [K.x1 - 0.1, K.z1 - 0.1]]) K.put(0, K.H, (B, a, c) => B.boxAt(x - 0.12, K.fy + a, z - 0.12, x + 0.12, K.fy + c, z + 0.12, { tile: TILE.BARK, color: '#4a4434' }));
    K.windowsDress({ frame: '#3a3628', glass: '#3a4a3a', shutters: '#4a5a3a' });
    K.doorsDress({ frame: '#3a3628', leaf: '#4a4636' });
    K.S.boxAt(K.x0 + 0.45, K.fy + 0.04, K.z0 + 0.45, K.x1 - 0.45, K.fy + 0.07, K.z1 - 0.45, MAT.hplanks('#6a5e4a'));
    const r = K.gableRoof({ pitch: 50, mat: { tile: TILE.THATCH, color: '#8a8456' }, thatch: true, gable: MAT.planks(wood) });
    // crooked roof chimney pipe
    const cp = V(r.F, r.L * 0.25, 0, r.hs * 0.4);
    K.roofChimney(cp.x, cp.z, K.H, r.Hr + 0.4, { mat: { tile: TILE.METAL, color: '#3a3632' }, w: 0.35 });
    const d = K.doors[0];
    const sd = K.side(d.side);
    // porch steps + skull posts + hanging herbs
    for (let i = 0; i < 2; i++) K.sideBox(sd, d.u - 0.6, d.u + 0.6, -0.3 - i * 0.18, -0.12 - i * 0.18, MAT.hplanks('#6a6250'), 0.4, K.wt / 2 + 0.75 + i * 0.4, K.S);
    for (const k of [-1.1, 1.1]) {
      const p = K.pt(sd, d.u + k, 0, K.wt / 2 + 0.9);
      K.S.box(0.1, 1.9, 0.1, M(p.x, K.fy + 0.8, p.z, 0, 0.05), { tile: TILE.BARK, color: '#4a4434' });
      P.sphere(K.S, M(p.x, K.fy + 1.85, p.z), 0.13, { color: '#e8e0cc' }, 7, 5);
      P.sphere(K.S, M(p.x + 0.04, K.fy + 1.83, p.z - 0.11), 0.03, { color: '#1a1a1a' }, 4, 3);
      P.sphere(K.S, M(p.x - 0.05, K.fy + 1.83, p.z - 0.11), 0.03, { color: '#1a1a1a' }, 4, 3);
    }
    for (let i = 0; i < 5; i++) { const p = K.pt(sd, d.u - 1.4 + i * 0.22, 1.95, K.wt / 2 + 0.12); K.S.box(0.06, 0.35, 0.06, M(p.x, p.y, p.z, i), { color: ['#6a7a3a', '#8a7a4a', '#5a6a3a'][i % 3], sway: 0.02 }); }
    const lp = K.pt(sd, d.u + 0.9, 1.9, K.wt / 2 + 0.4);
    lanternInto(K.S, M(lp.x, lp.y, lp.z));
    K.fx.push({ t: 'halo', p: [lp.x, lp.y + 0.16, lp.z], size: 1.6, color: [0.35, 0.7, 0.3], night: false });
    K.sign("Old Wren's", { icon: 'cauldron', y: 2.2, w: 1.5, h: 0.4, board: '#3a3a2a', ink: '#c8e0a0' });
    // inside: cauldron, jars, herbs, straw bed
    K.centerItem(1, 1, (B, m) => { P.cauldron(B, m, { brew: '#6aa83a', glow: '#4a9a2a' }); const p = V(m, 0, 0.7, 0); K.fx.push({ t: 'halo', p: [p.x, p.y, p.z], size: 1.4, color: [0.15, 0.4, 0.1] }); K.fx.push({ t: 'flame', p: [p.x, p.y - 0.65, p.z], w: 0.4, h: 0.35, heat: 0.7 }); }, { allowNearOcc: true });
    shelves(K, 2, 'bottles');
    K.wallItem(1.6, (B, m) => { B.box(1.5, 0.25, 0.42, at2(m, 0, 0.12, 0), { tile: TILE.HAY, color: '#a89a60' }); }, { tall: false });
    lowStuff(K, 1);
  },

  'stone-hall-grand'(K) {
    K.H = 4.6; K.cut = 2.4;
    const st = '#d6cebe', q = '#ebe4d6';
    K.planWindows(2.3, { y0: 0.95, y1: 2.25, w: 0.8 });
    K.walls({ mat: MAT.stone(st), plinth: 0.5, plinthMat: MAT.stone('#9a9286') });
    K.quoins({ color: q, size: 0.4 });
    for (const s of ['N', 'E', 'S', 'W']) {
      const sd = K.side(s);
      K.sideBox(sd, sd.u0 - 0.06, sd.u1 + 0.06, 2.4, 2.58, MAT.stone(q), K.wt + 0.12);
      K.sideBox(sd, sd.u0 - 0.1, sd.u1 + 0.1, K.H - 0.3, K.H, MAT.stone(q), K.wt + 0.2);
      // pilasters between windows
      const ops = K.openings(s);
      for (let i = 0; i < ops.length - 1; i++) {
        const u = (ops[i].u1 + ops[i + 1].u0) / 2;
        if (ops[i + 1].u0 - ops[i].u1 < 0.7) continue;
        K.sideBox(sd, u - 0.2, u + 0.2, 0.5, K.H - 0.3, MAT.stone(q), 0.14, K.wt / 2 + 0.07);
      }
    }
    K.windowsDress({ frame: '#3a2a1e', sill: q, arch: true, glass: '#465866' });
    K.doorsDress({ leaf: '#4a2e1e', arch: true, stoneFrame: q, double: true });
    K.floor({ tile: TILE.MARBLE, color: '#e6e0d4', found: '#9a9286' });
    // checker inlay
    for (let x = K.x0 + 1; x < K.x1 - 1; x++) for (let z = K.z0 + 1; z < K.z1 - 1; z++) if ((x + z) % 2 === 0) K.S.boxAt(x + 0.05, K.fy + 0.07, z + 0.05, x + 0.95, K.fy + 0.075, z + 0.95, { tile: TILE.MARBLE, color: '#8a8478', world: true });
    const roof = K.hipRoof({ pitch: 30, mat: { tile: TILE.SLATE, color: '#4f5a66' } });
    // cupola with the glowing ledger band, dome and chain finial
    const cx = K.cx, cz = K.cz, cy = roof.Hr - 0.4;
    const drum = new THREE.CylinderGeometry(1.25, 1.25, 1.4, 8, 1, true);
    K.R.geo(drum.clone().translate(0, 0.7, 0), M(cx, cy, cz, Math.PI / 8), { tile: TILE.LEDGER, uv: 'own', uvScale: [4, 1], color: '#ffffff', glow: '#7fffd0', glowMode: 'always', glowK: 0.5, jit: 0 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; K.R.box(0.16, 1.5, 0.16, M(cx + Math.cos(a) * 1.28, cy + 0.72, cz + Math.sin(a) * 1.28), MAT.stone(q)); }
    K.R.geo(new THREE.CylinderGeometry(1.45, 1.45, 0.16, 8).translate(0, 0.08, 0), M(cx, cy + 1.4, cz, Math.PI / 8), MAT.stone(q));
    K.R.geo(new THREE.SphereGeometry(1.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(cx, cy + 1.55, cz), { tile: TILE.METAL, color: '#4f8a7a' });
    K.R.box(0.08, 1.0, 0.08, M(cx, cy + 3.3, cz), { tile: TILE.METAL, color: '#e8bf4a' });
    for (const k of [-1, 1]) K.R.geo(new THREE.TorusGeometry(0.18, 0.05, 5, 12), M(cx, cy + 3.75 + k * 0.17, cz, k > 0 ? 0 : Math.PI / 2), { color: '#3ad6a0', glow: '#3ad6a0', glowMode: 'always', glowK: 1 });
    K.fx.push({ t: 'halo', p: [cx, cy + 3.75, cz], size: 1.8, color: [0.08, 0.45, 0.32] });
    K.fx.push({ t: 'halo', p: [cx, cy + 0.7, cz], size: 4.5, color: [0.03, 0.16, 0.12] });
    // portico at the main (north) door with columns + pediment; chain banners on the facade
    const main = K.doors.find((d) => d.side === 'N') || K.doors[0];
    const sd = K.side(main.side);
    const colN = K.wt / 2 + 1.0;
    for (const k of [-1.55, 1.55]) {
      const p = K.pt(sd, main.u + k, 0, colN);
      K.S.boxAt(p.x - 0.32, K.fy - 0.3, p.z - 0.32, p.x + 0.32, K.fy + 0.25, p.z + 0.32, MAT.stone(q));
      K.put(0.25, 3.6, (B, a, c) => B.geo(new THREE.CylinderGeometry(0.2, 0.24, c - a, 10).translate(0, (c - a) / 2, 0), M(p.x, K.fy + a, p.z), { tile: TILE.MARBLE, color: '#f0eae0' }));
      K.R.boxAt(p.x - 0.3, K.fy + 3.6, p.z - 0.3, p.x + 0.3, K.fy + 3.8, p.z + 0.3, MAT.stone(q));
      const tx = Math.floor(p.x), tz = Math.floor(p.z);
      if (!(K.ctx.map.tileFlags(tx, tz) & 1)) { K.ctx.map.block(tx, tz); K.extBlocks = (K.extBlocks || []).concat([[tx, tz]]); }
    }
    const pf = K.frame(sd, main.u, 3.8, K.wt / 2 + 0.55);
    K.R.box(4.0, 0.25, 1.3, pf.clone().multiply(M(0, 0.12, -0.05)), MAT.stone(q));
    const ped = new THREE.Shape(); ped.moveTo(-2.0, 0); ped.lineTo(2.0, 0); ped.lineTo(0, 0.85); ped.closePath();
    K.R.geo(new THREE.ExtrudeGeometry(ped, { depth: 1.2, bevelEnabled: false }).translate(0, 0.25, -0.65), pf, MAT.stone(q));
    K.R.geo(new THREE.CircleGeometry(0.28, 14).rotateY(Math.PI), pf.clone().multiply(M(0, 0.6, -0.66)), { tile: TILE.METAL, color: '#e8bf4a' });
    K.sign('The Gildmoor Exchange', { icon: 'chain', s: main.side, u: main.u, y: 3.05, w: 3.0, h: 0.62, board: '#20302c', ink: '#f2d27a', n: K.wt / 2 + 0.06 });
    const east = K.doors.find((d) => d !== main);
    if (east) K.sign('Exchange', { icon: 'chain', s: east.side, u: east.u, y: 2.9, w: 1.8, h: 0.46, board: '#20302c', ink: '#f2d27a' });
    for (const s of ['N', 'E', 'S', 'W']) {
      const sdd = K.side(s);
      const ops = K.openings(s);
      for (let i = 0; i < ops.length - 1; i++) {
        if (ops[i + 1].u0 - ops[i].u1 < 0.7 || (i % 2)) continue;
        const u = (ops[i].u1 + ops[i + 1].u0) / 2;
        const p = K.pt(sdd, u, 4.15, K.wt / 2 + 0.2);
        P.banner(K.R, M(p.x, p.y, p.z, YAW_OUT[s] + Math.PI), { tile: TILE.BANNER_CHAIN, w: 0.62, h: 1.75, bar: '#c9a24a', sway: 0.04 });
      }
    }
    // inside: glowing ledger boards, benches, chandelier, central chain obelisk
    for (let i = 0; i < 3; i++) K.wallItem(1.3, (B, m) => {
      B.box(1.2, 1.1, 0.05, at2(m, 0, 1.75, 0.15), { tile: TILE.LEDGER, uv: 'own', color: '#ffffff', glow: '#9affd8', glowMode: 'always', glowK: 0.45, jit: 0 });
      B.box(1.3, 1.2, 0.04, at2(m, 0, 1.75, 0.18), MAT.timber('#3a2616'));
    });
    for (let i = 0; i < 2; i++) K.wallItem(1.5, (B, m) => P.bench(B, m, { w: 1.4, color: '#5e3f28' }), { tall: false });
    K.centerItem(1, 1, (B, m) => {
      B.box(0.6, 0.3, 0.6, at2(m, 0, 0.15, 0), MAT.marble('#d8d0c4'));
      B.geo(new THREE.CylinderGeometry(0.12, 0.26, 1.7, 4).rotateY(Math.PI / 4).translate(0, 0.85, 0), at2(m, 0, 0.3, 0), { tile: TILE.LEDGER, uv: 'own', color: '#ffffff', glow: '#9affd8', glowMode: 'always', glowK: 0.5, jit: 0 });
      for (const k of [-1, 1]) B.geo(new THREE.TorusGeometry(0.13, 0.035, 5, 12), at2(m, 0, 2.15 + k * 0.12, 0, k > 0 ? 0 : Math.PI / 2), { color: '#3ad6a0', glow: '#3ad6a0', glowMode: 'always', glowK: 1 });
      const p = V(m, 0, 2.15, 0);
      K.fx.push({ t: 'halo', p: [p.x, p.y, p.z], size: 1.3, color: [0.06, 0.4, 0.28] });
    }, { margin: 1 });
    const ch = M(K.cx, K.fy + K.H - 0.9, K.cz);
    P.torus(K.R, ch.clone().multiply(M(0, 0, 0, 0, Math.PI / 2)), 0.9, 0.04, { tile: TILE.METAL, color: '#c9a24a' }, 4, 20);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P.cylinder(K.R, ch.clone().multiply(M(Math.cos(a) * 0.9, 0.04, Math.sin(a) * 0.9)), 0.03, 0.03, 0.14, { color: '#f4ecd8', glow: '#ffb860', glowMode: 'always', glowK: 0.7 }, 5); }
    K.R.box(0.02, 0.9, 0.02, ch.clone().multiply(M(0, 0.45, 0)), { color: '#2e2a26' });
    K.fx.push({ t: 'halo', p: [K.cx, K.fy + K.H - 0.8, K.cz], size: 2.6, color: [0.45, 0.3, 0.12], night: true });
  },

  'stone-shop'(K) {
    K.H = 3.3;
    const arcana = (K.b.role || '').includes('arcana');
    stoneBuilding(K, { stone: arcana ? '#b8b0c4' : '#bcb2a0', quoin: arcana ? '#d8d0e4' : '#d8d0c2', arch: arcana, shutters: arcana ? '#4a3a6a' : '#7a2a24', floor: '#a8a090' });
    const r = K.gableRoof({ pitch: 42, mat: arcana ? { tile: TILE.SLATE, color: '#4a4660' } : { tile: TILE.CLAY, color: '#b0563a' }, gable: MAT.stone(arcana ? '#b8b0c4' : '#bcb2a0'), barge: '#3a2a1e' });
    const d = K.doors[0];
    const sd = K.side(d.side);
    // awning over the door + display
    const mA = K.frame(sd, d.u, 2.35, K.wt / 2 + 0.5);
    K.R.box(2.2, 0.04, 1.0, mA.clone().multiply(M(0, 0, 0, 0, 0.3)), { tile: TILE.STRIPES, color: arcana ? '#5a3f8a' : '#8e1f22', uvScale: 0.6 });
    K.sign(arcana ? 'Lumen & Sigil' : 'Brackwell Armoury', { icon: arcana ? 'sigil' : 'shield', y: 2.85, w: 2.2, h: 0.48, board: arcana ? '#2a2240' : '#3a2016', ink: arcana ? '#c8e8ff' : '#f2d27a' });
    K.wallLantern(d.side, d.u + 1.0, 2.0);
    if (arcana) {
      const top = V(r.F, r.L * 0.3, r.Hr, 0);
      K.R.geo(new THREE.OctahedronGeometry(0.3, 0).scale(1, 1.8, 1), M(top.x, top.y + 0.7, top.z), { tile: TILE.CRYSTAL, color: '#8fe3ff', glow: '#9ad8ff', glowMode: 'tinted', glowK: 0.6, flat: true });
      K.fx.push({ t: 'halo', p: [top.x, top.y + 0.7, top.z], size: 2.2, color: [0.2, 0.3, 0.6] });
      shelves(K, 2, 'bottles');
      for (let i = 0; i < 2; i++) K.wallItem(0.9, (B, m) => {
        B.box(0.8, 0.9, 0.42, at2(m, 0, 0.45, 0), MAT.timber('#3a2a40'));
        for (let k = 0; k < 4; k++) B.geo(new THREE.OctahedronGeometry(0.07 + (k % 2) * 0.03, 0).scale(1, 1.7, 1), at2(m, -0.25 + k * 0.17, 1.0, 0, k), { tile: TILE.CRYSTAL, color: k % 2 ? '#b39cff' : '#8fe3ff', glow: '#9ad8ff', glowMode: 'tinted', glowK: 0.5, flat: true });
        const p = V(m, 0, 1.05, 0);
        K.fx.push({ t: 'halo', p: [p.x, p.y, p.z], size: 1.0, color: [0.15, 0.2, 0.45] });
      }, { tall: false });
      const ix0 = K.x0 + 1, ix1 = K.x1 - 1, iz0 = K.z0 + 1, iz1 = K.z1 - 1;
      K.S.geo(new THREE.CircleGeometry(Math.min(ix1 - ix0, iz1 - iz0) / 2 - 0.2, 24).rotateX(-Math.PI / 2), M((ix0 + ix1) / 2, K.fy + 0.075, (iz0 + iz1) / 2), { tile: TILE.RUNES, uv: 'own', color: '#ffffff', glow: '#ffffff', glowMode: 'always', glowK: 0.25, jit: 0 });
      interiorLantern(K, 1);
    } else {
      for (let i = 0; i < 2; i++) K.centerItem(1, 1, (B, m) => P.dummy(B, m.clone().multiply(M(0, 0, 0, K.rnd() * 6)), { shield: true }), { margin: 1 });
      K.wallItem(1.4, (B, m) => P.weaponRack(B, m, { w: 1.3 }));
      K.wallItem(1.4, (B, m) => P.weaponRack(B, m, { w: 1.3 }));
      for (let i = 0; i < 2; i++) K.wallItem(1.0, (B, m) => { for (let k = 0; k < 2; k++) B.geo(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12).rotateX(Math.PI / 2), at2(m, -0.25 + k * 0.5, 1.5 - k * 0.1, 0.18), { tile: TILE.METAL, color: k ? '#8e1f22' : '#8a8f95' }); }, { depth: 0.1 });
      lowStuff(K, 1);
      interiorLantern(K, 1);
    }
    rugItem(K, 2, 1.2, TILE.CARPET);
  },

  townhouse(K) {
    K.H = 2.9;
    const plaster = pick(K, ['#efe4cc', '#e8d8b8', '#e6dccc', '#f0dcd0', '#dcd8c8']);
    const timber = '#3e2a1c';
    timberBuilding(K, { plaster, timber, shutters: pick(K, ['#7a2a24', '#2a4a6a', '#3f5a2a']), boxes: true, winSpacing: 1.9 });
    upperStorey(K, { y0: 2.9, y1: 5.1, jetty: 0.25, plaster, timber });
    const axis = K.b.w >= K.b.d ? 'x' : 'z';
    const r = K.gableRoof({ H: 5.1, pitch: 52, mat: { tile: TILE.SLATE, color: pick(K, ['#5d6672', '#5a5560', '#6a5a50']) }, gable: MAT.plaster(plaster), gableTimber: timber, hsOverride: K.dims(axis).hs + 0.25, lenOverride: K.dims(axis).L + 0.5 });
    const c = V(r.F, r.L * 0.3, 0, r.hs * 0.2);
    K.roofChimney(c.x, c.z, 4.6, r.Hr + 0.8);
    const d = K.doors[0];
    K.wallLantern(d.side, d.u + 0.85);
    bedItem(K, pick(K, ['#7a3a34', '#3a5a7a', '#5a7a3a']));
    tableSet(K, { tiles: [1, 1] });
    hearthItem(K);
    shelves(K, 1, 'books');
    lowStuff(K, 2);
    rugItem(K, 2, 1.2);
  },

  stables(K) {
    K.H = 3.0;
    const { x0, z0, x1, z1, fy } = K;
    K.S.boxAt(x0 + 0.05, fy - 0.5, z0 + 0.05, x1 - 0.05, fy + 0.03, z1 - 0.05, { tile: TILE.HAY, color: '#a89060', world: true });
    const posts = [];
    for (let x = x0 + 0.25; x <= x1 - 0.2; x += (x1 - x0 - 0.5) / 4) for (const z of [z0 + 0.25, z1 - 0.25]) posts.push([x, z]);
    for (const [x, z] of posts) K.put(0, K.H, (B, a, c) => B.boxAt(x - 0.11, fy + a, z - 0.11, x + 0.11, fy + c, z + 0.11, MAT.timber('#5e4129')));
    K.R.boxAt(x0 + 0.1, fy + K.H - 0.18, z0 + 0.12, x1 - 0.1, fy + K.H, z0 + 0.38, MAT.timber('#5e4129'));
    K.R.boxAt(x0 + 0.1, fy + K.H - 0.18, z1 - 0.38, x1 - 0.1, fy + K.H, z1 - 0.12, MAT.timber('#5e4129'));
    K.gableRoof({ pitch: 34, over: 0.5, mat: { tile: TILE.SHINGLES, color: '#7a5038' }, ends: false });
    // back wall (north) of planks with stall partitions (blocked tiles keep the path clear)
    K.S.boxAt(x0 + 0.15, fy, z0 + 0.15, x1 - 0.15, fy + 1.6, z0 + 0.35, MAT.planks('#7a5636'));
    for (let tx = x0; tx < x1; tx++) K.ctx.map.block(tx, z0);
    K.extBlocks = (K.extBlocks || []).concat(Array.from({ length: x1 - x0 }, (_, i) => [x0 + i, z0]));
    for (let x = x0 + 2; x < x1 - 1; x += 2) K.S.boxAt(x - 0.05, fy, z0 + 0.3, x + 0.05, fy + 1.3, z0 + 1.0, MAT.planks('#7a5636'));
    for (let x = x0 + 1; x < x1 - 1; x += 2) {
      P.hayBale(K.S, M(x + 0.5, fy, z0 + 0.62, 0, 0, 0, 0.7));
      K.S.box(0.9, 0.3, 0.35, M(x + 0.5, fy + 0.6, z0 + 0.48), MAT.hplanks('#6a4a2e'));
    }
    K.sign('Stables', { icon: 'wheel', s: 'S', u: (x0 + x1) / 2, y: K.H - 0.4, n: K.side('S').c - (z1 - 0.25) + 0.2, w: 1.6, h: 0.42 });
    // trough and saddles on the open side corners
    const t = M(x1 - 0.9, fy, z1 - 0.55, Math.PI / 2);
    K.S.box(1.2, 0.45, 0.5, t.clone().multiply(M(0, 0.22, 0)), MAT.hplanks('#5e4129'));
    K.S.box(1.1, 0.02, 0.4, t.clone().multiply(M(0, 0.4, 0)), { color: '#2d5a78' });
    K.ctx.map.block(x1 - 1, z1 - 1);
    K.extBlocks.push([x1 - 1, z1 - 1]);
  },
};

// Open buildings: place an item on a footprint tile that keeps every footprint tile reachable.
function openSpot(K, fn) {
  const tiles = [];
  for (let z = K.z0; z < K.z1; z++) for (let x = K.x0; x < K.x1; x++) {
    const edge = x === K.x0 || z === K.z0 || x === K.x1 - 1 || z === K.z1 - 1;
    if (edge && !K.isTaken(x, z) && !K.nearOccupant(x, z)) tiles.push([x, z]);
  }
  for (let i = 0; i < 20 && tiles.length; i++) {
    const [x, z] = tiles.splice(Math.floor(K.rnd() * tiles.length), 1)[0];
    // keep connectivity: every free footprint tile must stay reachable from outside
    const k = x + ',' + z;
    const free = new Set();
    for (let zz = K.z0 - 1; zz <= K.z1; zz++) for (let xx = K.x0 - 1; xx <= K.x1; xx++) {
      const kk = xx + ',' + zz;
      if (kk === k || K.blocked.has(kk) || K.objTiles.has(kk)) continue;
      if (K.ctx.map.tileFlags(xx, zz) & 1) continue;
      free.add(kk);
    }
    const start = [...free].filter((s) => { const [a, c] = s.split(',').map(Number); return a < K.x0 || c < K.z0 || a >= K.x1 || c >= K.z1; });
    const seen = new Set(start), q = [...start];
    while (q.length) {
      const [a, c] = q.pop().split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (a + dx) + ',' + (c + dz); if (free.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } }
    }
    if (seen.size !== free.size) continue;
    K.blocked.add(k);
    const yaw = x === K.x0 ? -Math.PI / 2 : x === K.x1 - 1 ? Math.PI / 2 : z === K.z0 ? Math.PI : 0;
    fn(K.S, M(x + 0.5, K.fy + 0.03, z + 0.5, yaw + Math.PI));
    return true;
  }
  return false;
}

export function buildStyle(K) {
  const st = K.b.style;
  if (SPECIAL[st]) return SPECIAL[st](K);
  if (st.startsWith('tent')) return SPECIAL.tent(K);
  const fn = STYLES[st] || STYLES.cottage;
  return fn(K);
}
