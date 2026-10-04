// Special building recipes: windmill (turning sails), tents, the Sheriff's keep, the Orbio Spire,
// the ruined watchtower. Owner: props builder.

import * as THREE from 'three';
import { Builder, M, TILE, mulberry32 } from './kit.js';
import { MAT, YAW_OUT } from './b-core.js';
import * as P from './parts.js';
import { ZONES } from '../data/zones.js';

const V = (m, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m);
const at2 = (m, x, y, z, ry = 0, rx = 0, rz = 0) => m.clone().multiply(M(x, y, z, ry, rx, rz));

// Crenellated parapet along a straight segment (world coords) at height y.
function merlons(B, ax, az, bx, bz, y, { w = 0.55, h = 0.7, t = 0.4, gap = 0.55, color = '#a8a090' } = {}) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.floor(len / (w + gap)));
  const yaw = Math.atan2(-(bz - az), bx - ax);
  for (let i = 0; i < n; i++) {
    const t0 = (i + 0.5) / n;
    B.box(w, h, t, M(ax + (bx - ax) * t0, y + h / 2, az + (bz - az) * t0, yaw), MAT.stone(color));
  }
}
function ringMerlons(B, cx, cz, r, y, n, color = '#a8a090') {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    B.box(0.5, 0.65, 0.35, M(cx + Math.cos(a) * r, y + 0.32, cz + Math.sin(a) * r, -a + Math.PI / 2), MAT.stone(color));
  }
}
function pennant(B, x, y, z, color = '#8e1f22', h = 1.6, yaw = 0) {
  B.box(0.06, h, 0.06, M(x, y + h / 2, z), { tile: TILE.METAL, color: '#2e2b28' });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.1, -0.18, 0, 0, -0.42, 0, 0, 0, 0, 0, -0.42, 0, 1.1, -0.18, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0.5, 0, 1, 0, 0, 0, 1, 1, 0.5], 2));
  const top = y + h;
  B.geo(g, M(x, top - 0.05, z, yaw), { color, jit: 0, sway: (wx, wy, wz) => Math.hypot(wx - x, wz - z) * 0.12 });
}

// Tower: battered cylinder + crenellations + cone roof. Static below cut, R above (if given).
function roundTower(K, cx, cz, r, h, { roof = '#3e4450', stone = '#aaa294', flag = '#8e1f22', slits = true, B0 = null } = {}) {
  const fy = K.fy;
  const put = (ya, yb, fn) => (B0 ? fn(B0, ya, yb) : K.put(ya, yb, fn));
  put(-1.0, 1.4, (B, a, c) => B.geo(new THREE.CylinderGeometry(r, r + 0.35, c - a, 14, 1).translate(0, (c - a) / 2, 0), M(cx, fy + a, cz), { tile: TILE.STONE, color: stone }));
  put(1.4, h, (B, a, c) => B.geo(new THREE.CylinderGeometry(r, r, c - a, 14, 1, true).translate(0, (c - a) / 2, 0), M(cx, fy + a, cz), { tile: TILE.STONE, color: stone }));
  const T = B0 || K.R;
  T.geo(new THREE.CylinderGeometry(r + 0.25, r + 0.1, 0.4, 14).translate(0, 0.2, 0), M(cx, fy + h - 0.2, cz), MAT.stone('#c2baac'));
  ringMerlons(T, cx, cz, r + 0.08, fy + h + 0.2, 12, stone);
  if (roof) {
    T.geo(new THREE.ConeGeometry(r + 0.15, r * 1.6, 14, 1, true).translate(0, r * 0.8, 0), M(cx, fy + h + 0.2, cz), { tile: TILE.SLATE, uv: 'own', uvScale: [6, 2], color: roof });
    pennant(T, cx, fy + h + 0.2 + r * 1.6 - 0.1, cz, flag, 1.5, 0.6);
  }
  if (slits) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      for (const y of [2.6, 5.0]) {
        if (y > h - 1) continue;
        const B = y > K.cut ? T : K.S;
        B.box(0.12, 0.7, 0.1, M(cx + Math.cos(a) * (r + 0.01), fy + y, cz + Math.sin(a) * (r + 0.01), -a + Math.PI / 2), { color: '#141210' });
      }
    }
  }
}

export const SPECIAL = {
  // ------------------------------------------------------------------------------------ windmill
  windmill(K) {
    const { cx, cz, fy } = K;
    const S = K.S;
    S.geo(new THREE.CylinderGeometry(2.45, 2.6, 1.6, 8).translate(0, 0.8, 0), M(cx, fy - 0.3, cz, Math.PI / 8), { tile: TILE.RUBBLE, color: '#a89c8a', flat: true });
    S.geo(new THREE.CylinderGeometry(1.65, 2.35, 6.4, 8, 1, true).translate(0, 3.2, 0), M(cx, fy + 1.3, cz, Math.PI / 8), { tile: TILE.PLANKS, color: '#ece2cc', flat: true, uvScale: 1.6 });
    // corner posts of the smock
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const a0 = [cx + Math.cos(a) * 2.42, fy + 1.3, cz + Math.sin(a) * 2.42], a1 = [cx + Math.cos(a) * 1.72, fy + 7.7, cz + Math.sin(a) * 1.72];
      S.beam(...a0, ...a1, 0.14, MAT.timber('#5a4030'));
    }
    // gallery
    S.geo(new THREE.CylinderGeometry(2.9, 2.9, 0.14, 16).translate(0, 0, 0), M(cx, fy + 3.3, cz), { tile: TILE.PLANKS, color: '#7a5636' });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      S.box(0.06, 0.8, 0.06, M(cx + Math.cos(a) * 2.82, fy + 3.75, cz + Math.sin(a) * 2.82), MAT.timber('#5a4030'));
    }
    S.geo(new THREE.TorusGeometry(2.82, 0.04, 4, 32).rotateX(Math.PI / 2), M(cx, fy + 4.15, cz), MAT.timber('#5a4030'));
    // cap
    S.geo(new THREE.CylinderGeometry(1.9, 1.9, 0.3, 12).translate(0, 0.15, 0), M(cx, fy + 7.6, cz), MAT.timber('#5a4030'));
    S.geo(new THREE.SphereGeometry(1.95, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.05, 1.25), M(cx, fy + 7.85, cz), { tile: TILE.SHINGLES, color: '#6a5042' });
    S.box(0.08, 0.9, 0.08, M(cx, fy + 10.2, cz), { tile: TILE.METAL, color: '#2e2b28' });
    S.geo(new THREE.SphereGeometry(0.14, 8, 6), M(cx, fy + 10.7, cz), { tile: TILE.METAL, color: '#c9a24a' });
    // door (towards the hopper) + windows
    const doorDir = Math.PI; // west
    const dp = [cx + Math.cos(doorDir) * 2.5, cz + Math.sin(doorDir) * 2.5];
    S.box(0.1, 2.0, 1.0, M(dp[0], fy + 1.0, dp[1]), { tile: TILE.DOOR, uv: 'own', color: '#7a5232' });
    S.box(0.2, 0.2, 1.3, M(dp[0], fy + 2.05, dp[1]), MAT.timber('#4a3222'));
    for (const [a, y] of [[0.4, 2.4], [2.6, 5.4], [-1.9, 4.6], [1.6, 6.3]]) {
      const r = 2.35 - (y - 1.3) / 6.4 * 0.7 + 0.03;
      S.box(0.55, 0.75, 0.08, M(cx + Math.cos(a) * r, fy + y, cz + Math.sin(a) * r, -a - Math.PI / 2), { tile: TILE.WINDOW, uv: 'own', color: '#4c5a66', glow: '#ffb45a', glowMode: 'night', glowK: 1, jit: 0 });
    }
    // sacks and a cart at the base
    for (let i = 0; i < 4; i++) P.sack(S, M(cx + 2.6 * Math.cos(0.3 + i * 0.25), fy, cz + 2.6 * Math.sin(0.3 + i * 0.25), i), { color: '#e8dcc4' });
    // sails (separate rotating part): face south-southwest
    const dir = new THREE.Vector3(-0.35, 0, 1).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    const hub = new THREE.Vector3(cx + dir.x * 2.1, fy + 8.1, cz + dir.z * 2.1);
    S.beam(cx, fy + 8.1, cz, hub.x, hub.y, hub.z, 0.3, { tile: TILE.BARK, color: '#5a4030' });
    const sails = new Builder(99);
    P.cylinder(sails, M(0, 0, -0.1, 0, Math.PI / 2), 0.32, 0.32, 0.5, MAT.timber('#4a3222'), 10);
    for (let i = 0; i < 4; i++) {
      const arm = M(0, 0, 0, 0, 0, (i / 4) * Math.PI * 2);
      sails.box(0.16, 6.2, 0.16, arm.clone().multiply(M(0, 3.1, 0)), MAT.timber('#5a4030'));
      // lattice frame on one side
      for (let k = 0; k <= 9; k++) sails.box(1.25, 0.06, 0.06, arm.clone().multiply(M(0.68, 1.2 + k * 0.54, 0.05)), MAT.timber('#6a4a30'));
      sails.box(0.06, 5.0, 0.06, arm.clone().multiply(M(1.3, 3.65, 0.05)), MAT.timber('#6a4a30'));
      sails.box(1.15, 4.6, 0.02, arm.clone().multiply(M(0.68, 3.75, 0.09)), { tile: TILE.CANVAS, color: '#efe6d2', uvScale: 1.2 });
    }
    K.anims = (K.anims || []).concat([{ builder: sails, pos: hub, yaw, spin: 0.55, axis: 'z' }]);
    K.sign('Millbrook Mill', { icon: 'wheel', s: 'W', u: cz, y: 2.75, w: 1.9, h: 0.45, B: S, n: 0.12 });
  },

  // ------------------------------------------------------------------------------------ tents
  tent(K) {
    const green = K.b.style === 'tent-green';
    const col = green ? '#4f7a3a' : '#8a6a48';
    const { x0, z0, x1, z1, fy, cx, cz } = K;
    const S = K.S;
    const axis = K.b.w >= K.b.d ? 'x' : 'z';
    const F = M(cx, fy, cz, axis === 'x' ? 0 : Math.PI / 2);
    const L = (axis === 'x' ? x1 - x0 : z1 - z0) - 0.5;
    const hs = (axis === 'x' ? z1 - z0 : x1 - x0) / 2 - 0.15;
    const h = 2.5;
    const th = Math.atan2(h, hs);
    const sl = Math.hypot(h, hs) + 0.1;
    for (const sg of [-1, 1]) {
      const m = F.clone().multiply(M(0, h / 2, sg * hs / 2, 0, sg * th, 0));
      S.box(L, 0.05, sl, m, { tile: TILE.CANVAS, color: col, flipV: sg < 0, uvScale: 1.6 });
    }
    // end walls: back closed, front with open flaps and a dark interior
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape(); sh.moveTo(-hs, 0); sh.lineTo(hs, 0); sh.lineTo(0, h); sh.closePath();
      const g = new THREE.ShapeGeometry(sh); g.rotateY(Math.PI / 2);
      const gx = sx * (L / 2 - 0.02);
      if (sx > 0) {
        S.geo(g, F.clone().multiply(M(gx, 0, 0, 0, 0, 0)), { tile: TILE.CANVAS, color: col });
        S.geo(g.clone().rotateY(Math.PI), F.clone().multiply(M(gx - 0.02, 0, 0)), { tile: TILE.CANVAS, color: col });
      } else {
        S.geo(g.clone().rotateY(Math.PI), F.clone().multiply(M(gx + 0.25, 0, 0, 0, 0, 0, 1, 0.98, 0.9)), { color: '#1a140e', vnoise: 0, jit: 0 });
        // flaps folded back
        for (const sz of [-1, 1]) {
          const fl = new THREE.Shape(); fl.moveTo(0, 0); fl.lineTo(sz * hs * 0.55, 0); fl.lineTo(0, h * 0.85); fl.closePath();
          const fg = new THREE.ShapeGeometry(fl); fg.rotateY(Math.PI / 2);
          S.geo(fg, F.clone().multiply(M(gx - 0.05, 0, sz * hs * 0.55, sz * 0.9)), { tile: TILE.CANVAS, color: new THREE.Color(col).multiplyScalar(0.85), sway: 0.01 });
          S.geo(fg.clone().rotateY(Math.PI), F.clone().multiply(M(gx - 0.06, 0, sz * hs * 0.55, sz * 0.9)), { tile: TILE.CANVAS, color: new THREE.Color(col).multiplyScalar(0.7) });
        }
      }
    }
    // ridge pole, end poles, guy ropes, stakes
    S.box(L + 0.6, 0.08, 0.08, F.clone().multiply(M(0, h + 0.02, 0)), { tile: TILE.BARK, color: '#6a4a30' });
    for (const sx of [-1, 1]) {
      S.box(0.08, h + 0.3, 0.08, F.clone().multiply(M(sx * (L / 2 + 0.25), (h + 0.3) / 2, 0)), { tile: TILE.BARK, color: '#6a4a30' });
      const top = V(F, sx * (L / 2 + 0.25), h + 0.1, 0), st = V(F, sx * (L / 2 + 1.1), 0.05, 0);
      S.beam(top.x, top.y, top.z, st.x, st.y, st.z, 0.02, { color: '#c8b890' });
      S.box(0.06, 0.3, 0.06, M(st.x, fy + 0.1, st.z, 0, 0.3), { color: '#6a4a30' });
    }
    for (const sg of [-1, 1]) for (const t of [-0.3, 0.3]) {
      const a = V(F, t * L, h * 0.55, sg * hs * 0.45), b = V(F, t * L, 0.05, sg * (hs + 0.8));
      S.beam(a.x, a.y, a.z, b.x, b.y, b.z, 0.018, { color: '#c8b890' });
    }
    if (green) {
      const p = V(F, -L / 2 - 0.6, 0, hs + 0.2);
      S.box(0.08, 3.4, 0.08, M(p.x, fy + 1.7, p.z), { color: '#5e4129' });
      P.banner(S, M(p.x, fy + 3.2, p.z, 0.6), { tile: TILE.BANNER_HOOD, w: 0.7, h: 1.4, bar: '#5e4129' });
    }
    // bedroll + crate by the opening
    const fr = V(F, -L / 2 - 0.5, 0, -hs * 0.4);
    S.geo(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 8).rotateZ(Math.PI / 2), M(fr.x, fy + 0.16, fr.z, axis === 'x' ? Math.PI / 2 : 0), { tile: TILE.CANVAS, color: green ? '#8a5a3a' : '#4a6a3a' });
    P.crate(S, M(fr.x + (axis === 'x' ? 0 : 0.6), fy, fr.z + (axis === 'x' ? -0.7 : 0), 0.4), { s: 0.5 });
  },

  // ------------------------------------------------------------------------------------ castle keep
  'castle-keep'(K) {
    K.H = 6.2; K.cut = 2.4; K.wi = 0.5; K.wt = 0.9;
    const { x0, z0, x1, z1, fy } = K;
    const stone = '#aaa294', light = '#c8c0b2';
    K.planWindows(3.2, { sides: ['S', 'W'], w: 0.5, y0: 1.1, y1: 2.2 });
    K.walls({ mat: MAT.stone(stone), plinth: 0.8, plinthMat: MAT.stone('#8a8274') });
    K.windowsDress({ frame: '#2e2620', sill: light, bars: true });
    K.doorsDress({ leaf: '#4a2e1e', arch: true, stoneFrame: light, double: true });
    K.floor({ tile: TILE.FLAGSTONE, color: '#9a9284', foundH: 2.5 });
    // wall-walk + crenellations on top of the curtain walls
    const yTop = fy + K.H;
    for (const s of ['N', 'E', 'S', 'W']) {
      const sd = K.side(s);
      K.sideBox(sd, sd.u0 - 0.1, sd.u1 + 0.1, K.H - 0.25, K.H, MAT.stone(light), K.wt + 0.2, 0, K.R);
      const a = K.pt(sd, sd.u0, 0, K.wt / 2 - 0.15), b = K.pt(sd, sd.u1, 0, K.wt / 2 - 0.15);
      merlons(K.R, a.x, a.z, b.x, b.z, yTop, { color: stone });
    }
    // corner towers
    for (const [x, z] of [[x0 + 0.9, z0 + 0.9], [x1 - 0.9, z0 + 0.9], [x0 + 0.9, z1 - 0.9], [x1 - 0.9, z1 - 0.9]]) {
      roundTower(K, x, z, 1.9, 9.6, { stone, roof: '#3a4250', flag: '#8e1f22' });
    }
    // gatehouse: buttress towers, arch, raised portcullis, banners
    const d = K.doors[0];
    const sd = K.side(d.side);
    for (const k of [-1, 1]) {
      const u0 = d.u + k * 0.75, u1 = d.u + k * 2.05;
      K.sideBox(sd, Math.min(u0, u1), Math.max(u0, u1), 0, 7.4, MAT.stone(stone), 1.5, 0.35);
      const a = K.pt(sd, Math.min(u0, u1), 0, 1.0), b = K.pt(sd, Math.max(u0, u1), 0, 1.0);
      merlons(K.R, a.x, a.z, b.x, b.z, fy + 7.4, { color: stone, w: 0.45, gap: 0.35 });
      const bp = K.pt(sd, d.u + k * 1.4, 6.6, 1.15);
      P.banner(K.R, M(bp.x, bp.y, bp.z, YAW_OUT[d.side] + Math.PI), { tile: TILE.BANNER_SHERIFF, w: 1.0, h: 2.6, bar: '#c9a24a', sway: 0.035 });
      const tp = K.pt(sd, d.u + k * 1.4, 2.2, 1.12);
      P.torch(K.S, M(tp.x, tp.y, tp.z, YAW_OUT[d.side] + Math.PI));
      K.fx.push({ t: 'flame', p: [tp.x, tp.y + 0.55, tp.z], w: 0.35, h: 0.45, heat: 0.9 });
      K.fx.push({ t: 'halo', p: [tp.x, tp.y + 0.75, tp.z], size: 1.6, color: [0.8, 0.4, 0.1], night: true });
    }
    K.sideBox(sd, d.u - 0.75, d.u + 0.75, 2.5, 7.4, MAT.stone(stone), 1.5, 0.35, K.R);
    for (let i = 0; i < 6; i++) K.sideBox(sd, d.u - 0.55 + i * 0.22, d.u - 0.5 + i * 0.22, 2.0, 2.8, { tile: TILE.METAL, color: '#2a2826' }, 0.05, 1.12, K.R);
    for (let i = 0; i < 3; i++) K.sideBox(sd, d.u - 0.58, d.u + 0.58, 2.1 + i * 0.3, 2.15 + i * 0.3, { tile: TILE.METAL, color: '#2a2826' }, 0.05, 1.12, K.R);
    K.sign("The Sheriff's Keep", { icon: 'crown', y: 3.2, w: 2.6, h: 0.55, board: '#5a1416', ink: '#e8bf4a', n: 1.12 });
    // great hall roof inside the curtain walls
    K.hipRoof({ H: 5.6, pitch: 30, over: -0.75, mat: { tile: TILE.SLATE, color: '#3e4652' } });
    // the town wall runs through the keep: inner curtain along the ring (skips the vault stairs)
    const G = ZONES.gildmoor;
    const stairs = (K.ctx.spawns?.objects || []).find((o) => o.def === 'vault_stairs');
    let prev = null;
    for (let a = -Math.PI; a <= Math.PI; a += 0.012) {
      const x = G.x + Math.cos(a) * G.wallR, z = G.z + Math.sin(a) * G.wallR;
      const inside = x > x0 + 0.95 && x < x1 - 0.95 && z > z0 + 0.95 && z < z1 - 0.95;
      const nearStairs = stairs && Math.hypot(x - (stairs.x + 0.5), z - (stairs.z + 0.5)) < 1.05;
      if (!inside || nearStairs) { prev = null; continue; }
      if (prev) {
        const mx = (prev[0] + x) / 2, mz = (prev[1] + z) / 2, len = Math.hypot(x - prev[0], z - prev[1]) + 0.02;
        const yaw = Math.atan2(-(z - prev[1]), x - prev[0]);
        K.put(0, 4.6, (B, ya, yb) => B.box(len, yb - ya, 0.9, M(mx, fy + (ya + yb) / 2, mz, yaw), MAT.stone(stone)));
      }
      prev = [x, z];
    }
    // interior: carpet to a throne, banners, braziers, tax chests, long table
    const carpetZ0 = z0 + 1.2, carpetZ1 = z1 - 0.95;
    K.S.box(1.3, 0.02, carpetZ1 - carpetZ0, M(d.u, fy + 0.075, (carpetZ0 + carpetZ1) / 2), { tile: TILE.CARPET, color: '#ffffff', uvScale: 1.3, vnoise: 0.02 });
    const throneT = [d.x - 1, z0 + 2];
    if (!K.isTaken(...throneT)) {
      K.blocked.add(throneT.join(','));
      const tm = M(throneT[0] + 0.5, fy + 0.07, throneT[1] + 0.5, Math.PI);
      K.I.box(1.4, 0.25, 1.3, tm.clone().multiply(M(0, 0.12, 0)), MAT.stone(light));
      K.I.box(0.8, 0.5, 0.7, tm.clone().multiply(M(0, 0.5, 0)), { tile: TILE.PLANKS, color: '#5a2a1a' });
      K.I.box(0.8, 0.12, 0.7, tm.clone().multiply(M(0, 0.78, 0)), { tile: TILE.CANVAS, color: '#8e1f22' });
      K.I.box(0.9, 1.5, 0.12, tm.clone().multiply(M(0, 1.3, 0.32)), { tile: TILE.PLANKS, color: '#5a2a1a' });
      K.I.box(0.7, 1.1, 0.04, tm.clone().multiply(M(0, 1.35, 0.25)), { tile: TILE.CANVAS, color: '#8e1f22' });
      for (const k of [-1, 1]) { K.I.box(0.12, 0.35, 0.65, tm.clone().multiply(M(k * 0.42, 0.95, 0)), { tile: TILE.PLANKS, color: '#5a2a1a' }); P.sphere(K.I, tm.clone().multiply(M(k * 0.42, 2.1, 0.32)), 0.09, { tile: TILE.METAL, color: '#e8bf4a' }, 8, 6); }
    }
    for (let i = 0; i < 3; i++) K.wallItem(1.1, (B, m) => P.banner(B, at2(m, 0, 3.6, 0.0, Math.PI), { tile: TILE.BANNER_SHERIFF, w: 0.9, h: 2.2, sway: 0 }), { depth: 0.05, sides: ['N', 'W', 'E'] });
    for (let i = 0; i < 2; i++) K.wallItem(1.0, (B, m) => { P.chestBox(B, m, { w: 0.85, d: 0.42, h: 0.42, color: '#3a2216', lock: '#e8bf4a' }); P.coins(B, at2(m, 0, 0.62, 0), { n: 10, r: 0.2, rnd: K.rnd, glint: true }); }, { tall: false });
    K.wallItem(1.4, (B, m) => P.weaponRack(B, m, { w: 1.3 }));
    for (let i = 0; i < 2; i++) K.centerItem(1, 1, (B, m) => { const f = P.brazier(B, m); const p = V(m, f[0], f[1], f[2]); K.fx.push({ t: 'flame', p: [p.x, p.y - 0.05, p.z], w: 0.55, h: 0.7, heat: 1 }); K.fx.push({ t: 'halo', p: [p.x, p.y + 0.4, p.z], size: 2.4, color: [0.8, 0.4, 0.1] }); }, { margin: 2 });
    K.centerItem(1, 2, (B, m) => { P.table(B, m.clone().multiply(M(0, 0, 0, Math.PI / 2)), { w: 1.8, d: 0.8, items: true }); }, { margin: 2 });
  },

  // ------------------------------------------------------------------------------------ Orbio Spire
  'crystal-spire'(K) {
    K.H = 5.2; K.cut = 2.2;
    const { x0, z0, x1, z1, fy, cx, cz } = K;
    const stone = '#d6d0e2', light = '#ece8f4';
    const crystalGlass = { tile: TILE.CRYSTAL, color: '#b8a8ff', glow: '#a0c8ff', glowMode: 'tinted', glowK: 0.42, jit: 0.05 };
    K.planWindows(2.0, { w: 0.7, y0: 0.7, y1: 2.1 });
    K.walls({ mat: MAT.stone(stone), plinth: 0.4, plinthMat: MAT.stone('#a8a2b8') });
    K.quoins({ color: light });
    K.windowsDress({ frame: '#5a5070', sill: light, arch: true, glassOpts: crystalGlass });
    K.doorsDress({ leaf: '#4a3a6a', arch: true, stoneFrame: light, double: true });
    // glowing rune band + clerestory crystal windows on the upper walls (fade with the roof)
    for (const s2 of ['N', 'E', 'S', 'W']) {
      const sd = K.side(s2);
      K.sideBox(sd, sd.u0 - 0.06, sd.u1 + 0.06, 3.05, 3.25, { tile: TILE.CRYSTAL, color: '#9ad8ff', glow: '#7fc8ff', glowMode: 'tinted', glowK: 0.5, jit: 0 }, K.wt + 0.1, 0, K.R);
      K.sideBox(sd, sd.u0 - 0.1, sd.u1 + 0.1, K.H - 0.25, K.H, MAT.stone(light), K.wt + 0.2, 0, K.R);
      for (const w of K.windows[s2]) {
        const p = K.pt(sd, w.u, 4.15, K.wt / 2 + 0.01);
        K.R.box(0.5, 0.75, 0.04, M(p.x, p.y, p.z, YAW_OUT[s2]), crystalGlass);
        K.R.geo(new THREE.TorusGeometry(0.27, 0.06, 4, 10, Math.PI), M(p.x, p.y + 0.37, p.z, YAW_OUT[s2]), MAT.stone(light));
      }
    }
    K.floor({ tile: TILE.MARBLE, color: '#e8e4f0', found: '#a8a2b8', foundH: 1.2 });
    // platform steps around the temple
    K.S.boxAt(x0 - 0.6, fy - 1.2, z0 - 0.6, x1 + 0.6, fy - 0.12, z1 + 0.6, MAT.stone('#b8b2c8'));
    // rune circle floor
    K.S.geo(new THREE.CircleGeometry(3.3, 32).rotateX(-Math.PI / 2), M(cx, fy + 0.08, cz), { tile: TILE.RUNES, uv: 'own', color: '#ffffff', glow: '#ffffff', glowMode: 'always', glowK: 0.3, jit: 0 });
    // corner crystal columns
    const crystal = (B, m, r, h, col = '#8fe3ff', k = 0.45) => {
      const o = { tile: TILE.CRYSTAL, color: col, glow: '#9ad8ff', glowMode: 'tinted', glowK: k, flat: true, uvScale: 1.2 };
      B.geo(new THREE.CylinderGeometry(r * 0.85, r, h * 0.8, 6).translate(0, h * 0.4, 0), m, o);
      B.geo(new THREE.ConeGeometry(r * 0.85, h * 0.2, 6).translate(0, h * 0.9, 0), m, o);
    };
    for (const [x, z, i] of [[x0 + 0.3, z0 + 0.3, 0], [x1 - 0.3, z0 + 0.3, 1], [x0 + 0.3, z1 - 0.3, 2], [x1 - 0.3, z1 - 0.3, 3]]) {
      K.S.geo(new THREE.CylinderGeometry(0.75, 0.85, 0.8, 6).translate(0, 0.4, 0), M(x, fy - 0.1, z), MAT.stone(light));
      crystal(K.S, M(x, fy + 0.6, z, i, 0.06, -0.05), 0.42, 5.2, i % 2 ? '#b39cff' : '#8fe3ff');
      crystal(K.S, M(x + 0.4, fy + 0.6, z - 0.2, i + 1, 0.4, 0.3), 0.2, 1.8, '#8fe3ff');
      crystal(K.S, M(x - 0.3, fy + 0.6, z + 0.35, i + 2, -0.3, -0.4), 0.18, 1.4, '#b39cff');
      K.fx.push({ t: 'halo', p: [x, fy + 3.5, z], size: 3.2, color: [0.18, 0.28, 0.55] });
    }
    // stepped roof + the great spire crystal (landmark)
    const r = K.hipRoof({ pitch: 26, over: 0.5, mat: { tile: TILE.SLATE, color: '#4c4268' }, under: '#3a3250' });
    const top = r.Hr;
    const R = K.R;
    R.geo(new THREE.CylinderGeometry(1.9, 2.4, 1.4, 8).translate(0, 0.7, 0), M(cx, fy + top - 0.8, cz, Math.PI / 8), MAT.stone(light));
    R.geo(new THREE.CylinderGeometry(2.0, 2.0, 0.25, 8).translate(0, 0.12, 0), M(cx, fy + top + 0.6, cz, Math.PI / 8), MAT.stone('#c8c0dc'));
    const sy = fy + top + 0.8;
    crystal(R, M(cx, sy, cz, 0.2), 1.25, 19, '#a6e8ff', 0.6);
    crystal(R, M(cx + 0.9, sy, cz + 0.5, 0.7, 0.18, -0.2), 0.55, 8.5, '#b39cff', 0.55);
    crystal(R, M(cx - 0.8, sy, cz - 0.6, 1.4, -0.2, 0.22), 0.5, 7.5, '#b39cff', 0.55);
    crystal(R, M(cx - 0.6, sy, cz + 0.85, 2.1, 0.25, 0.15), 0.45, 6.0, '#8fe3ff', 0.55);
    crystal(R, M(cx + 0.7, sy, cz - 0.85, 3.0, -0.22, -0.18), 0.42, 5.2, '#8fe3ff', 0.55);
    // floating rings around the spire (animated)
    const rings = new Builder(77);
    P.torus(rings, M(0, 0, 0, 0, Math.PI / 2), 2.6, 0.07, { color: '#b39cff', glow: '#b39cff', glowMode: 'always', glowK: 0.8 }, 4, 40);
    P.torus(rings, M(0, 1.4, 0, 0, Math.PI / 2 + 0.25), 2.0, 0.05, { color: '#8fe3ff', glow: '#8fe3ff', glowMode: 'always', glowK: 0.8 }, 4, 36);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      rings.geo(new THREE.OctahedronGeometry(0.22, 0).scale(1, 1.8, 1), M(Math.cos(a) * 2.6, 0.2, Math.sin(a) * 2.6), { tile: TILE.CRYSTAL, color: i % 2 ? '#b39cff' : '#8fe3ff', glow: '#a0d8ff', glowMode: 'tinted', glowK: 0.6, flat: true });
    }
    K.anims = (K.anims || []).concat([{ builder: rings, pos: new THREE.Vector3(cx, sy + 9, cz), yaw: 0, spin: 0.25, axis: 'y', fade: true, bob: 0.4 }]);
    for (const [h, s, c] of [[3, 7, [0.22, 0.3, 0.6]], [9, 9, [0.18, 0.35, 0.6]], [16, 8, [0.25, 0.2, 0.55]], [20.5, 5, [0.5, 0.6, 0.9]]]) K.fx.push({ t: 'halo', p: [cx, sy + h, cz], size: s, color: c, fade: true });
    K.sign('The Orbio Spire', { icon: 'eye', y: 2.65, w: 2.6, h: 0.6, board: '#2a2240', ink: '#c8e8ff' });
    // interior: archivist shelves, lecterns, floating shards
    for (let i = 0; i < 2; i++) K.wallItem(1.5, (B, m) => P.shelf(B, m, { w: 1.4, goods: 'books', color: '#3a2a40' }), { sides: ['W', 'N'] });
    K.wallItem(0.9, (B, m) => { B.box(0.5, 1.0, 0.4, at2(m, 0, 0.5, 0), MAT.timber('#3a2a40')); B.box(0.6, 0.05, 0.45, at2(m, 0, 1.08, 0, 0, 0.35), { color: '#efe2c4' }); P.cylinder(B, at2(m, 0.25, 1.05, 0.1), 0.03, 0.03, 0.15, { color: '#f4ecd8', glow: '#ffb860', glowMode: 'always', glowK: 0.6 }, 5); }, { tall: false });
    for (let i = 0; i < 2; i++) K.wallItem(0.8, (B, m) => { crystal(B, at2(m, 0, 0, 0), 0.25, 1.6, '#8fe3ff'); crystal(B, at2(m, 0.25, 0, 0.05, 1, 0.3), 0.14, 0.9, '#b39cff'); const p = V(m, 0, 1.0, 0); K.fx.push({ t: 'halo', p: [p.x, p.y, p.z], size: 1.6, color: [0.15, 0.25, 0.5] }); }, { tall: false });
  },

  // ------------------------------------------------------------------------------------ ruined tower
  'ruin-tower'(K) {
    const { cx, cz, fy } = K;
    const S = K.S;
    const rnd = mulberry32(55);
    const R0 = 1.95, n = 16;
    S.geo(new THREE.CylinderGeometry(R0 + 0.2, R0 + 0.45, 1.0, n).translate(0, 0.5, 0), M(cx, fy - 0.4, cz), { tile: TILE.RUBBLE, color: '#8e887e' });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const broken = i >= 5 && i <= 7;
      const h = broken ? 0.6 + rnd() * 0.8 : 3.2 + Math.sin(a * 1.3 + 0.5) * 2.4 + rnd() * 1.4;
      const segW = (2 * Math.PI * R0) / n + 0.05;
      S.box(segW, h, 0.7, M(cx + Math.cos(a) * R0, fy + h / 2, cz + Math.sin(a) * R0, -a + Math.PI / 2), { tile: TILE.RUBBLE, color: i % 3 ? '#9a948a' : '#8a847a', uvScale: 2 });
      // jagged top stones
      for (let k = 0; k < 2; k++) S.box(0.35 + rnd() * 0.3, 0.25 + rnd() * 0.3, 0.5, M(cx + Math.cos(a + (k - 0.5) * 0.15) * R0, fy + h + 0.1, cz + Math.sin(a + (k - 0.5) * 0.15) * R0, -a + Math.PI / 2 + rnd() * 0.4, rnd() * 0.3), MAT.rubble('#a8a296'));
      if (!broken && h > 3 && i % 3 === 0) S.box(0.14, 0.7, 0.72, M(cx + Math.cos(a) * R0, fy + 2.2, cz + Math.sin(a) * R0, -a + Math.PI / 2 + Math.PI / 2), { color: '#141210' });
      // moss
      if (h > 1) S.box(segW * 0.9, 0.08, 0.72, M(cx + Math.cos(a) * R0, fy + h + 0.02, cz + Math.sin(a) * R0, -a + Math.PI / 2), { tile: TILE.TURF, color: '#6a8a44' });
    }
    // broken floor beams and rubble spill
    S.box(0.18, 0.18, 3.2, M(cx, fy + 2.8, cz, 0.6, 0.25, 0.1), MAT.timber('#4a3a2a'));
    S.box(0.18, 0.18, 2.6, M(cx + 0.4, fy + 2.4, cz - 0.3, -0.4, -0.3, 0.05), MAT.timber('#4a3a2a'));
    for (let i = 0; i < 18; i++) {
      const a = 1.6 + (rnd() - 0.5) * 1.4, rr = R0 + 0.6 + rnd() * 1.8;
      const g = new THREE.DodecahedronGeometry(0.2 + rnd() * 0.35, 0);
      S.geo(g, M(cx + Math.cos(a) * rr, fy + 0.05, cz + Math.sin(a) * rr, rnd() * 6, rnd(), rnd()), { tile: TILE.RUBBLE, color: '#9a948a', flat: true });
    }
    for (let i = 0; i < 6; i++) P.bush(S, M(cx + Math.cos(i * 1.1) * (R0 + 0.7), fy, cz + Math.sin(i * 1.1) * (R0 + 0.7)), { r: 0.35, color: '#5a7a3a' });
  },
};
