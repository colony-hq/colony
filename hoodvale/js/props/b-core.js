// Building toolkit: walls on the footprint perimeter with door/window openings, timber framing,
// windows (glow at night), doors (open leaves), floors, roofs (gable / hip / gambrel / cone),
// chimneys, signboards, and furniture placement that never cuts a path to an NPC or object.
// Geometry below the cut height goes to `S` (static, merged per cluster); everything above goes
// to `R` (per building, fades out while the player is inside). Owner: props builder.

import * as THREE from 'three';
import { Builder, M, TILE, mulberry32, hashStr } from './kit.js';
import { OBJECTS } from '../data/objects.js';

export const YAW_OUT = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };
const TAN = { N: [1, 0], S: [1, 0], W: [0, 1], E: [0, 1] };
const INW = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] };

export const MAT = {
  plaster: (c = '#efe4cc') => ({ tile: TILE.PLASTER, color: c, world: true }),
  stone: (c = '#b4ab9c') => ({ tile: TILE.STONE, color: c, world: true }),
  rubble: (c = '#a49a8a') => ({ tile: TILE.RUBBLE, color: c, world: true }),
  planks: (c = '#8a6440') => ({ tile: TILE.PLANKS, color: c, world: true, uvRot: true }),
  hplanks: (c = '#8a6440') => ({ tile: TILE.PLANKS, color: c, world: true }),
  timber: (c = '#4e3524') => ({ tile: TILE.PLANKS, color: c, uvRot: true, uvScale: 1.6 }),
  brick: (c = '#a8705a') => ({ tile: TILE.BRICK, color: c, world: true }),
  marble: (c = '#ece6dc') => ({ tile: TILE.MARBLE, color: c, world: true }),
};

export class BKit {
  constructor(b, kit, ctx, opts = {}) {
    this.b = b; this.kit = kit; this.ctx = ctx;
    this.x0 = b.x; this.z0 = b.z; this.x1 = b.x + b.w; this.z1 = b.z + b.d;
    this.fy = b.floorY ?? ctx.map.heightAt(b.x + b.w / 2, b.z + b.d / 2);
    this.cx = b.x + b.w / 2; this.cz = b.z + b.d / 2;
    const seed = hashStr(b.id);
    this.rnd = mulberry32(seed);
    this.S = new Builder(seed);
    this.R = new Builder(seed + 7);
    this.I = new Builder(seed + 11); // interior furniture: own mesh, drawn only near the camera
    this.cut = opts.cut ?? 2.0;
    this.H = opts.H ?? 3.0;
    this.wi = 0.3; this.wt = 0.4;
    this.fx = [];
    this.blocked = new Set();
    this.doors = (b.doors || []).map((d) => ({ ...d, side: this.sideOfTile(d.x, d.z) }));
    for (const d of this.doors) d.u = d.side === 'N' || d.side === 'S' ? d.x + 0.5 : d.z + 0.5;
    this.windows = { N: [], E: [], S: [], W: [] };
    this.reserved = { N: [], E: [], S: [], W: [] };
    // occupancy from spawns (NPC tiles, object footprints)
    this.npcTiles = new Set([...(ctx.spawns?.npcs || []), ...(ctx.spawns?.monsters || [])].map((n) => n.x + ',' + n.z));
    this.objTiles = new Set();
    for (const o of ctx.spawns?.objects || []) {
      const def = OBJECTS[o.def];
      if (!def || def.walkable) continue;
      for (let z = o.z; z < o.z + (o.d || 1); z++) for (let x = o.x; x < o.x + (o.w || 1); x++) this.objTiles.add(x + ',' + z);
    }
  }

  // Open buildings that overlap a town-wall tile shrink their visual footprint away from it.
  shrinkFromWalls() {
    const wallAt = (x, z) => !!(this.ctx.map.tileFlags(x, z) & 32);
    const rowHas = (z) => { for (let x = this.x0; x < this.x1; x++) if (wallAt(x, z)) return true; return false; };
    const colHas = (x) => { for (let z = this.z0; z < this.z1; z++) if (wallAt(x, z)) return true; return false; };
    for (let i = 0; i < 4; i++) {
      if (this.z1 - this.z0 > 3 && rowHas(this.z1 - 1)) this.z1--;
      if (this.z1 - this.z0 > 3 && rowHas(this.z0)) this.z0++;
      if (this.x1 - this.x0 > 3 && colHas(this.x1 - 1)) this.x1--;
      if (this.x1 - this.x0 > 3 && colHas(this.x0)) this.x0++;
    }
    this.cx = (this.x0 + this.x1) / 2; this.cz = (this.z0 + this.z1) / 2;
  }

  sideOfTile(x, z) {
    if (z === this.z0) return 'N';
    if (z === this.z1 - 1) return 'S';
    if (x === this.x0) return 'W';
    return 'E';
  }
  side(s) {
    const { x0, z0, x1, z1, wi, wt } = this;
    if (s === 'N') return { s, axis: 'x', c: z0 + wi, out: -1, u0: x0 + wi - wt / 2, u1: x1 - wi + wt / 2, i0: x0 + wi + wt / 2, i1: x1 - wi - wt / 2 };
    if (s === 'S') return { s, axis: 'x', c: z1 - wi, out: 1, u0: x0 + wi - wt / 2, u1: x1 - wi + wt / 2, i0: x0 + wi + wt / 2, i1: x1 - wi - wt / 2 };
    if (s === 'W') return { s, axis: 'z', c: x0 + wi, out: -1, u0: z0 + wi + wt / 2, u1: z1 - wi - wt / 2, i0: z0 + wi + wt / 2, i1: z1 - wi - wt / 2 };
    return { s, axis: 'z', c: x1 - wi, out: 1, u0: z0 + wi + wt / 2, u1: z1 - wi - wt / 2, i0: z0 + wi + wt / 2, i1: z1 - wi - wt / 2 };
  }
  // world point on a side: along u, height y (above floor), n outward from the wall centreline
  pt(sd, u, y, n = 0) {
    const off = sd.c + sd.out * n;
    return sd.axis === 'x' ? new THREE.Vector3(u, this.fy + y, off) : new THREE.Vector3(off, this.fy + y, u);
  }
  // matrix at a side point; front (-z) faces outward (or inward)
  frame(sd, u, y, n = 0, inward = false, extraYaw = 0) {
    const p = this.pt(sd, u, y, n);
    return M(p.x, p.y, p.z, YAW_OUT[sd.s] + (inward ? Math.PI : 0) + extraYaw);
  }
  // Route [ya, yb] to S below the cut and R above it.
  put(ya, yb, fn, force = null) {
    if (force) { fn(force, ya, yb); return; }
    const c = this.cut;
    if (yb <= c + 1e-4) fn(this.S, ya, yb);
    else if (ya >= c - 1e-4) fn(this.R, ya, yb);
    else { fn(this.S, ya, c); fn(this.R, c, yb); }
  }
  // Box along a side: u in [ua, ub], y in [ya, yb] (floor-relative), thickness t, n outward offset.
  sideBox(sd, ua, ub, ya, yb, o, t = this.wt, n = 0, force = null) {
    if (ub - ua < 1e-3 || yb - ya < 1e-3) return;
    this.put(ya, yb, (B, a, c) => {
      const Y0 = this.fy + a, Y1 = this.fy + c;
      const off = sd.c + sd.out * n;
      if (sd.axis === 'x') B.boxAt(ua, Y0, off - t / 2, ub, Y1, off + t / 2, o);
      else B.boxAt(off - t / 2, Y0, ua, off + t / 2, Y1, ub, o);
    }, force);
  }

  // ------------------------------------------------------------------------------- planning
  planWindows(spacing = 2.0, { sides = ['N', 'E', 'S', 'W'], w = 0.8, y0 = 0.95, y1 = 1.8, skip = null } = {}) {
    for (const s of sides) {
      const sd = this.side(s);
      const a = sd.i0 + 0.75, c = sd.i1 - 0.75;
      const len = c - a;
      if (len < w) continue;
      const n = Math.max(1, Math.round(len / spacing));
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? (a + c) / 2 : a + (len * (i + 0.5)) / n;
        if (this.doors.some((d) => d.side === s && Math.abs(d.u - u) < 1.05)) continue;
        if (skip && skip(s, u)) continue;
        this.windows[s].push({ u, w, y0, y1 });
      }
    }
  }
  openings(s) {
    const ops = [];
    for (const d of this.doors) if (d.side === s) ops.push({ u0: d.u - 0.48, u1: d.u + 0.48, y0: 0, y1: d.h ?? 2.0, door: d });
    for (const wnd of this.windows[s]) ops.push({ u0: wnd.u - wnd.w / 2, u1: wnd.u + wnd.w / 2, y0: wnd.y0, y1: wnd.y1, win: wnd });
    return ops.sort((a, b) => a.u0 - b.u0);
  }

  // ------------------------------------------------------------------------------- walls
  // mat(ya, yb) -> builder options for a wall slab between heights; plinth handled by caller.
  walls({ H = this.H, mat, plinth = 0, plinthMat = MAT.stone('#9a9286'), sides = ['N', 'E', 'S', 'W'], t = this.wt } = {}) {
    for (const s of sides) {
      const sd = this.side(s);
      const ops = this.openings(s);
      const slab = (ua, ub, ya, yb) => {
        if (plinth > 0 && ya < plinth) {
          this.sideBox(sd, ua, ub, ya, Math.min(plinth, yb), plinthMat, t + 0.06);
          if (yb > plinth) this.sideBox(sd, ua, ub, plinth, yb, mat, t);
        } else this.sideBox(sd, ua, ub, ya, yb, mat, t);
      };
      let u = sd.u0;
      for (const op of ops) {
        slab(u, op.u0, 0, H);
        if (op.y0 > 0) slab(op.u0, op.u1, 0, op.y0);
        slab(op.u0, op.u1, op.y1, H);
        u = op.u1;
      }
      slab(u, sd.u1, 0, H);
    }
  }

  // Exposed timber frame on the outer face of timber walls.
  timberFrame({ H = this.H, plinth = 0.45, color = '#4e3524', braces = true, sides = ['N', 'E', 'S', 'W'], rails = [] } = {}) {
    const tm = MAT.timber(color);
    const n = this.wt / 2 + 0.03;
    for (const s of sides) {
      const sd = this.side(s);
      const ops = this.openings(s);
      const posts = new Set([sd.u0 + 0.1, sd.u1 - 0.1]);
      for (const op of ops) { posts.add(op.u0 - 0.07); posts.add(op.u1 + 0.07); }
      // fill gaps
      const sorted = [...posts].sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1] - sorted[i];
        if (gap > 1.7) { const k = Math.ceil(gap / 1.5); for (let j = 1; j < k; j++) posts.add(sorted[i] + (gap * j) / k); }
      }
      const P = [...posts].sort((a, b) => a - b);
      for (const u of P) this.sideBox(sd, u - 0.08, u + 0.08, plinth, H, tm, 0.06, n);
      for (const y of [plinth, ...rails]) this.sideBox(sd, sd.u0, sd.u1, y, y + 0.14, tm, 0.06, n + 0.005);
      this.sideBox(sd, sd.u0, sd.u1, H - 0.16, H, tm, 0.06, n + 0.005);
      for (const op of ops) {
        if (op.win) { this.sideBox(sd, op.u0 - 0.08, op.u1 + 0.08, op.y1, op.y1 + 0.12, tm, 0.07, n + 0.01); }
        if (op.door) this.sideBox(sd, op.u0 - 0.12, op.u1 + 0.12, op.y1, op.y1 + 0.16, tm, 0.08, n + 0.01);
      }
      if (!braces) continue;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i] + 0.08, c = P[i + 1] - 0.08;
        if (c - a < 0.5) continue;
        if (ops.some((op) => op.u1 > a - 0.05 && op.u0 < c + 0.05)) continue;
        if (this.rnd() < 0.35) continue;
        const flip = this.rnd() < 0.5;
        const ya = plinth + 0.1, yb = Math.min(this.cut - 0.05, H - 0.2);
        const pa = this.pt(sd, flip ? a : c, ya, n), pb = this.pt(sd, flip ? c : a, yb, n);
        this.S.beam(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, 0.11, tm, 0.06);
        if (H - 0.2 > this.cut + 0.6) {
          const pc = this.pt(sd, flip ? a : c, this.cut + 0.05, n), pd = this.pt(sd, flip ? c : a, H - 0.2, n);
          this.R.beam(pc.x, pc.y, pc.z, pd.x, pd.y, pd.z, 0.11, tm, 0.06);
        }
      }
    }
  }

  // Stone quoins at the four corners.
  quoins({ H = this.H, color = '#d4ccbe', size = 0.34 } = {}) {
    const o = MAT.stone(color);
    for (const [x, z] of [[this.x0 + 0.1, this.z0 + 0.1], [this.x1 - 0.1, this.z0 + 0.1], [this.x0 + 0.1, this.z1 - 0.1], [this.x1 - 0.1, this.z1 - 0.1]]) {
      for (let y = 0, i = 0; y < H - 0.1; y += size, i++) {
        const w = i % 2 ? 0.55 : 0.32, d = i % 2 ? 0.32 : 0.55;
        const sx = x < this.cx ? 1 : -1, sz = z < this.cz ? 1 : -1;
        const B = y + size / 2 >= this.cut ? this.R : this.S;
        B.boxAt(x - 0.04 * sx, this.fy + y + 0.01, z - 0.04 * sz, x + w * sx, this.fy + y + size - 0.02, z + d * sz, o);
      }
    }
  }

  // ------------------------------------------------------------------------------- windows & doors
  windowsDress({ frame = '#4e3524', glass = '#4c5a66', shutters = null, boxes = false, sill = '#8e8678', arch = false, bars = false, glassOpts = null } = {}) {
    const fr = MAT.timber(frame);
    for (const s of ['N', 'E', 'S', 'W']) {
      const sd = this.side(s);
      for (const wd of this.windows[s]) {
        const { u, w, y0, y1 } = wd;
        // glass pane with leaded decal: glows warm at night
        const p = this.pt(sd, u, (y0 + y1) / 2, 0);
        const m = M(p.x, p.y, p.z, YAW_OUT[s]);
        this.S.box(w, y1 - y0, 0.05, m, glassOpts || { tile: TILE.WINDOW, uv: 'own', color: glass, glow: '#ffb45a', glowMode: 'night', glowK: 1, jit: 0 });
        // frame + sill (outer face) and inner frame
        for (const nn of this.wt > 0.5 ? [this.wt / 2 + 0.02] : [this.wt / 2 + 0.02, -this.wt / 2 - 0.02]) {
          this.sideBox(sd, u - w / 2 - 0.07, u - w / 2, y0, y1, fr, 0.08, nn);
          this.sideBox(sd, u + w / 2, u + w / 2 + 0.07, y0, y1, fr, 0.08, nn);
          this.sideBox(sd, u - w / 2 - 0.07, u + w / 2 + 0.07, y1, y1 + 0.07, fr, 0.08, nn);
        }
        this.sideBox(sd, u - w / 2 - 0.12, u + w / 2 + 0.12, y0 - 0.07, y0, MAT.stone(sill), 0.18, this.wt / 2 + 0.05);
        if (arch) {
          const ap = this.pt(sd, u, y1, this.wt / 2 + 0.03);
          const g = new THREE.TorusGeometry(w / 2 + 0.04, 0.07, 4, 10, Math.PI);
          this.put(y1, y1 + w / 2 + 0.1, (B) => B.geo(g, M(ap.x, ap.y, ap.z, YAW_OUT[s]), MAT.stone(sill)), y1 + 0.2 > this.cut ? this.R : this.S);
          this.sideBox(sd, u - w / 2, u + w / 2, y1, y1 + w / 2, { tile: TILE.FLAT, color: '#2a2622' }, 0.05, 0);
        }
        if (bars) for (let k = 1; k < 4; k++) this.sideBox(sd, u - w / 2 + (w * k) / 4 - 0.015, u - w / 2 + (w * k) / 4 + 0.015, y0, y1, { tile: TILE.METAL, color: '#2e2b28' }, 0.03, this.wt / 2 + 0.03);
        if (shutters) {
          const sc = { tile: TILE.PLANKS, color: shutters, uvRot: true, uvScale: 0.8 };
          this.sideBox(sd, u - w / 2 - 0.07 - w / 2, u - w / 2 - 0.08, y0, y1, sc, 0.04, this.wt / 2 + 0.05);
          this.sideBox(sd, u + w / 2 + 0.08, u + w / 2 + 0.07 + w / 2, y0, y1, sc, 0.04, this.wt / 2 + 0.05);
        }
        if (boxes) {
          const fb = this.frame(sd, u, y0 - 0.25, this.wt / 2 + 0.16);
          flowerBoxInto(this.S, fb, w + 0.1, this.rnd);
        }
      }
    }
  }

  // Door frames, open leaves, thresholds; style: 'plank' | 'arch'
  doorsDress({ frame = '#4e3524', leaf = '#7a5232', arch = false, stoneFrame = null, step = '#8e8678', double = false } = {}) {
    for (const d of this.doors) {
      const sd = this.side(d.side);
      const u = d.u;
      const fr = stoneFrame ? MAT.stone(stoneFrame) : MAT.timber(frame);
      const T = this.wt + 0.1;
      this.sideBox(sd, u - 0.62, u - 0.48, 0, 2.1, fr, T);
      this.sideBox(sd, u + 0.48, u + 0.62, 0, 2.1, fr, T);
      if (arch) {
        const p = this.pt(sd, u, 2.0, 0);
        const g = new THREE.TorusGeometry(0.55, 0.09, 5, 12, Math.PI);
        const m = M(p.x, p.y, p.z, YAW_OUT[d.side], 0, 0, 1, 0.75, T / 0.18);
        this.R.geo(g, m, fr);
        this.sideBox(sd, u - 0.62, u + 0.62, 2.0, 2.5, fr, this.wt - 0.02, 0, this.R);
      } else {
        this.sideBox(sd, u - 0.66, u + 0.66, 2.0, 2.18, fr, T);
      }
      // threshold step outside
      this.sideBox(sd, u - 0.6, u + 0.6, -0.25, 0.06, MAT.stone(step), 0.5, this.wt / 2 + 0.25, this.S);
      // open door leaf (swung inward ~100deg), or two leaves
      const [tx, tz] = TAN[d.side], [ix, iz] = INW[d.side];
      const leaves = double ? [[-1, 0.45], [1, 0.45]] : [[-1, 0.9]];
      for (const [side, wdt] of leaves) {
        const hingeU = u + side * 0.47;
        const hp = this.pt(sd, hingeU, 0, -this.wt / 2 - 0.03);
        const ang = (100 * Math.PI) / 180;
        const dx = -side * tx * Math.cos(ang) + ix * Math.sin(ang), dz = -side * tz * Math.cos(ang) + iz * Math.sin(ang);
        const yaw = Math.atan2(-dz, dx);
        const m = M(hp.x + dx * wdt / 2, hp.y + 0.98, hp.z + dz * wdt / 2, yaw);
        this.S.box(wdt, 1.92, 0.06, m, { tile: TILE.DOOR, uv: 'own', color: leaf, jit: 0.03 });
      }
    }
  }

  // Interior floor + foundation plinth.
  floor({ tile = TILE.PLANKS, color = '#a07a52', found = '#8e8678', foundH = 0.9, uvRot = false } = {}) {
    const { x0, z0, x1, z1, fy } = this;
    this.S.boxAt(x0 + 0.04, fy - foundH, z0 + 0.04, x1 - 0.04, fy + 0.04, z1 - 0.04, { ...MAT.stone(found), world: true });
    this.S.boxAt(x0 + 0.45, fy + 0.04, z0 + 0.45, x1 - 0.45, fy + 0.07, z1 - 0.45, { tile, color, world: true, uvRot, vnoise: 0.03 });
  }

  // ------------------------------------------------------------------------------- roofs
  roofFrame(axis) { return M(this.cx, this.fy, this.cz, axis === 'x' ? 0 : Math.PI / 2); }
  dims(axis) {
    const ow = (this.x1 - 0.1) - (this.x0 + 0.1), od = (this.z1 - 0.1) - (this.z0 + 0.1);
    return axis === 'x' ? { L: ow, hs: od / 2 } : { L: od, hs: ow / 2 };
  }
  // Gable roof; returns { Hr, F, hs, L, theta }
  gableRoof({ axis = (this.x1 - this.x0) >= (this.z1 - this.z0) ? 'x' : 'z', H = this.H, pitch = 42, over = 0.42, overG = 0.32, t = 0.12, mat, ridge = '#4a3a30', gable = null, gableTimber = null, barge = '#4e3524', thatch = false, hsOverride = null, lenOverride = null, B = this.R, ends = true } = {}) {
    const F = this.roofFrame(axis);
    let { L, hs } = this.dims(axis);
    if (hsOverride) hs = hsOverride;
    if (lenOverride) L = lenOverride;
    const th = (pitch * Math.PI) / 180;
    const tanT = Math.tan(th), cosT = Math.cos(th), sinT = Math.sin(th);
    const Hr = H + hs * tanT;
    const Ltot = L + 2 * overG;
    const sl = (hs + over) / cosT;
    const ye = H - over * tanT;
    const tt = thatch ? 0.34 : t;
    for (const sgn of [-1, 1]) {
      const midZ = sgn * (hs + over) / 2, midY = (Hr + ye) / 2;
      const nz = sgn * sinT, ny = cosT;
      const m = F.clone().multiply(M(0, midY - ny * tt / 2, midZ - nz * tt / 2, 0, sgn * th, 0));
      B.box(Ltot, tt, sl, m, { ...mat, flipV: sgn < 0 });
      if (thatch) {
        // rounded thatch eave
        const e = F.clone().multiply(M(0, ye - 0.06, sgn * (hs + over - 0.05), 0, 0, Math.PI / 2));
        B.geo(new THREE.CylinderGeometry(0.17, 0.17, Ltot, 8, 1, true), e, { ...mat });
      }
    }
    // ridge
    if (thatch) {
      B.geo(new THREE.CylinderGeometry(0.26, 0.26, Ltot + 0.05, 8), F.clone().multiply(M(0, Hr + 0.08, 0, 0, 0, Math.PI / 2)), { ...mat, color: new THREE.Color(mat.color).multiplyScalar(0.85) });
    } else {
      B.box(Ltot + 0.04, 0.14, 0.32, F.clone().multiply(M(0, Hr + 0.03, 0)), { tile: TILE.SLATE, color: ridge });
    }
    // gable ends
    if (ends) {
      for (const sx of [-1, 1]) {
        const shape = new THREE.Shape();
        shape.moveTo(-hs, H); shape.lineTo(hs, H); shape.lineTo(0, Hr - 0.05); shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, { depth: this.wt, bevelEnabled: false });
        g.rotateY(Math.PI / 2);
        g.translate(sx * (L / 2 - this.wt / 2 - 0.0) - this.wt / 2, 0, 0);
        B.geo(g, F, gable || MAT.plaster());
        if (gableTimber) {
          const tm = MAT.timber(gableTimber);
          const xo = sx * (L / 2 + 0.02);
          const P = (y, z) => new THREE.Vector3(xo, y, z).applyMatrix4(F);
          const a = P(H, 0), b2 = P(Hr - 0.25, 0);
          B.beam(a.x, a.y, a.z, b2.x, b2.y, b2.z, 0.13, tm, 0.06);
          const cy = H + (Hr - H) * 0.42, cz = hs * (1 - 0.42) - 0.05;
          const c1 = P(cy, -cz), c2 = P(cy, cz);
          B.beam(c1.x, c1.y, c1.z, c2.x, c2.y, c2.z, 0.12, tm, 0.06);
          for (const s2 of [-1, 1]) {
            const d1 = P(H, s2 * hs * 0.75), d2 = P(cy, s2 * 0.1);
            B.beam(d1.x, d1.y, d1.z, d2.x, d2.y, d2.z, 0.1, tm, 0.06);
          }
        }
        // barge boards
        if (!thatch) {
          for (const sz of [-1, 1]) {
            const P = (y, z) => new THREE.Vector3(sx * (Ltot / 2 - 0.03), y, z).applyMatrix4(F);
            const a = P(ye + 0.05, sz * (hs + over)), b2 = P(Hr + 0.08, 0);
            B.beam(a.x, a.y, a.z, b2.x, b2.y, b2.z, 0.22, MAT.timber(barge), 0.07);
          }
        }
      }
    }
    // fascia along eaves
    if (!thatch) for (const sz of [-1, 1]) B.box(Ltot, 0.16, 0.05, F.clone().multiply(M(0, ye - 0.06, sz * (hs + over + 0.01))), MAT.timber(barge));
    return { Hr, F, hs, L, th, ye, Ltot };
  }

  // Hipped roof (or pyramid when square). Faces with own plane UVs.
  hipRoof({ H = this.H, pitch = 35, over = 0.45, mat, under = '#5a4636', fascia = '#4e3524', B = this.R, axis = (this.x1 - this.x0) >= (this.z1 - this.z0) ? 'x' : 'z', lift = 0.16 } = {}) {
    const F = this.roofFrame(axis);
    const { L, hs } = this.dims(axis);
    const th = (pitch * Math.PI) / 180;
    const hx = L / 2 + over, hz = hs + over;
    const ye = H - over * Math.tan(th) + lift;
    const Hr = ye + hz * Math.tan(th);
    const rx = Math.max(0, hx - hz);
    const V = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(F);
    const A = V(-hx, ye, hz), Bp = V(hx, ye, hz), Cp = V(hx, ye, -hz), D = V(-hx, ye, -hz);
    const R1 = V(-rx, Hr, 0), R2 = V(rx, Hr, 0);
    const ux = new THREE.Vector3(1, 0, 0).transformDirection(F), uz = new THREE.Vector3(0, 0, 1).transformDirection(F);
    const quad = (pts, u) => { B.face(pts, { ...mat }, u); B.face([...pts].reverse(), { tile: TILE.PLANKS, color: under }, u); };
    if (rx > 0.01) {
      quad([A, Bp, R2, R1], ux);
      quad([Cp, D, R1, R2], ux.clone().negate());
    } else {
      quad([A, Bp, R2], ux);
      quad([Cp, D, R1], ux.clone().negate());
    }
    quad([Bp, Cp, R2], uz.clone().negate());
    quad([D, A, R1], uz);
    // fascia
    for (const [p, q] of [[A, Bp], [Bp, Cp], [Cp, D], [D, A]]) {
      const mid = p.clone().add(q).multiplyScalar(0.5);
      const len = p.distanceTo(q);
      const yaw = Math.atan2(-(q.z - p.z), q.x - p.x);
      B.box(len + 0.06, 0.16, 0.05, M(mid.x, mid.y - 0.07, mid.z, yaw), MAT.timber(fascia));
    }
    if (rx > 0.01) {
      const mid = R1.clone().add(R2).multiplyScalar(0.5);
      B.box(rx * 2 + 0.1, 0.12, 0.26, F.clone().multiply(M(0, Hr + 0.03, 0)), { tile: TILE.SLATE, color: '#4a4040' });
      void mid;
    }
    return { Hr, ye, F };
  }

  // ------------------------------------------------------------------------------- extras
  // Exterior chimney stack against side s at u. Returns top position.
  chimney(s, u, top, { mat = MAT.stone('#9a9286'), w = 0.75, smoke = true } = {}) {
    const sd = this.side(s);
    const n = this.wt / 2 + 0.38;
    this.sideBox(sd, u - w / 2, u + w / 2, -0.4, top, mat, 0.75, n);
    this.sideBox(sd, u - w / 2 - 0.06, u + w / 2 + 0.06, top - 0.12, top + 0.04, MAT.stone('#7a746c'), 0.87, n, this.R);
    this.sideBox(sd, u - w / 2 + 0.12, u + w / 2 - 0.12, top + 0.04, top + 0.28, { tile: TILE.BRICK, color: '#8a5a4a' }, 0.5, n, this.R);
    const p = this.pt(sd, u, top + 0.3, n);
    if (smoke) this.fx.push({ t: 'smoke', p: [p.x, p.y, p.z], n: 5, size: 0.8 });
    return p;
  }
  // Ridge chimney (through the roof) at world x,z from y0 (floor rel) to top.
  roofChimney(x, z, y0, top, { mat = MAT.brick('#9a6a56'), w = 0.6, smoke = true } = {}) {
    this.R.boxAt(x - w / 2, this.fy + y0, z - w / 2, x + w / 2, this.fy + top, z + w / 2, mat);
    this.R.boxAt(x - w / 2 - 0.06, this.fy + top - 0.1, z - w / 2 - 0.06, x + w / 2 + 0.06, this.fy + top + 0.05, z + w / 2 + 0.06, MAT.stone('#7a746c'));
    if (smoke) this.fx.push({ t: 'smoke', p: [x, this.fy + top + 0.2, z], n: 5, size: 0.8 });
  }
  // Flat signboard above a door (or at side s, u). text painted into the atlas.
  sign(text, { icon = null, s = null, u = null, y = 2.3, w = 2.0, h = 0.5, board = '#6b4a2b', ink = '#f2d27a', B = this.R, n = null } = {}) {
    const d = this.doors[0];
    const side = s || d?.side || 'S';
    const uu = u ?? d?.u ?? (side === 'N' || side === 'S' ? this.cx : this.cz);
    const sd = this.side(side);
    const rect = this.kit.sign(text, { icon, board, ink });
    const m = this.frame(sd, uu, y, n ?? this.wt / 2 + 0.05);
    B.box(w, h, 0.06, m, { rect, color: '#ffffff', jit: 0, vnoise: 0 });
    B.box(w + 0.1, h + 0.1, 0.04, this.frame(sd, uu, y, (n ?? this.wt / 2 + 0.05) - 0.03), MAT.timber('#3a2616'));
  }
  // Blade sign hanging from a bracket, perpendicular to side s at u.
  bladeSign(text, { icon = null, s = null, u = null, y = 2.5, w = 1.1, h = 0.55, board = '#6b4a2b', ink = '#f2d27a', B = this.R } = {}) {
    const d = this.doors[0];
    const side = s || d?.side || 'S';
    const sd = this.side(side);
    const uu = u ?? (d ? d.u + 1.2 : (sd.i0 + sd.i1) / 2);
    const rect = this.kit.sign(text, { icon, board, ink });
    const out = this.wt / 2 + 0.75;
    const bp = this.pt(sd, uu, y + 0.45, this.wt / 2);
    const ep = this.pt(sd, uu, y + 0.45, out + w / 2 + 0.1);
    B.beam(bp.x, bp.y, bp.z, ep.x, ep.y, ep.z, 0.06, { tile: TILE.METAL, color: '#2e2b28' });
    const c = this.pt(sd, uu, y, out + 0.05);
    const yaw = YAW_OUT[side] + Math.PI / 2;
    B.box(w, h, 0.05, M(c.x, c.y, c.z, yaw), { rect, color: '#ffffff', jit: 0, vnoise: 0, sway: 0.01 });
    for (const k of [-1, 1]) {
      const cp = this.pt(sd, uu, y + h / 2 + 0.1, out + 0.05 + (k * w) / 2.6);
      B.box(0.02, 0.2, 0.02, M(cp.x, cp.y, cp.z), { tile: TILE.METAL, color: '#2e2b28' });
    }
  }
  // Wall lantern beside a door / at side position.
  wallLantern(s, u, y = 2.0, { B = this.S } = {}) {
    const sd = this.side(s);
    const bp = this.pt(sd, u, y + 0.35, this.wt / 2), ep = this.pt(sd, u, y + 0.35, this.wt / 2 + 0.4);
    B.beam(bp.x, bp.y, bp.z, ep.x, ep.y, ep.z, 0.04, { tile: TILE.METAL, color: '#2e2b28' });
    const lp = this.pt(sd, u, y - 0.08, this.wt / 2 + 0.4);
    lanternInto(B, M(lp.x, lp.y, lp.z, YAW_OUT[s]));
    this.fx.push({ t: 'halo', p: [lp.x, lp.y + 0.16, lp.z], size: 1.6, color: [0.9, 0.55, 0.22], night: true });
  }

  // ------------------------------------------------------------------------------- furniture
  // Place an item against the inside of a wall. fn(builder, matrix) gets a frame at floor level,
  // front facing the room. Returns true if placed.
  wallItem(width, fn, { sides = null, tall = true, depth = 0.45, gap = 0.12, prefer = null } = {}) {
    const order = sides || ['N', 'E', 'S', 'W'].sort(() => this.rnd() - 0.5);
    for (const s of order) {
      const sd = this.side(s);
      const lo = sd.i0 + 0.05, hi = sd.i1 - 0.05;
      const bad = [];
      for (const d of this.doors) if (d.side === s) bad.push([d.u - 0.95, d.u + 0.95]);
      // doors on the perpendicular sides near the corners
      for (const d of this.doors) {
        if (d.side === s) continue;
        const near = d.side === 'N' || d.side === 'S' ? d.u : d.u;
        const sdo = this.side(d.side);
        if ((sd.axis === 'x') !== (sdo.axis === 'x')) {
          // perpendicular side: its centreline coordinate maps to our u
          const cu = sdo.c;
          if (Math.abs(near - (sd.axis === 'x' ? sd.c : sd.c)) < 1.6) bad.push([cu - 1.2, cu + 1.2]);
        }
      }
      if (tall) for (const w of this.windows[s]) bad.push([w.u - w.w / 2 - 0.12, w.u + w.w / 2 + 0.12]);
      for (const r of this.reserved[s]) bad.push(r);
      const cands = [];
      for (let u = lo + width / 2; u <= hi - width / 2 + 1e-6; u += 0.1) {
        const a = u - width / 2 - gap, c = u + width / 2 + gap;
        if (bad.some(([p, q]) => q > a && p < c)) continue;
        cands.push(u);
      }
      if (!cands.length) continue;
      let u;
      if (prefer === 'centre') u = cands.reduce((best, x) => (Math.abs(x - (lo + hi) / 2) < Math.abs(best - (lo + hi) / 2) ? x : best), cands[0]);
      else if (prefer === 'end') u = this.rnd() < 0.5 ? cands[0] : cands[cands.length - 1];
      else u = cands[Math.floor(this.rnd() * cands.length)];
      this.reserved[s].push([u - width / 2, u + width / 2]);
      const m = this.frame(sd, u, 0.06, -(this.wt / 2 + depth / 2 + 0.01), true);
      fn(this.I, m, s, u);
      return true;
    }
    return false;
  }

  // Interior walkable tiles (inside the perimeter).
  interiorTiles() {
    const out = [];
    for (let z = this.z0 + 1; z < this.z1 - 1; z++) for (let x = this.x0 + 1; x < this.x1 - 1; x++) out.push([x, z]);
    return out;
  }
  isTaken(x, z) { const k = x + ',' + z; return this.npcTiles.has(k) || this.objTiles.has(k) || this.blocked.has(k); }
  nearOccupant(x, z) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const k = (x + dx) + ',' + (z + dz);
      if (this.npcTiles.has(k) || this.objTiles.has(k)) return true;
    }
    return false;
  }
  connected(extra) {
    const inside = new Set(this.interiorTiles().map(([x, z]) => x + ',' + z));
    for (const d of this.doors) inside.add(d.x + ',' + d.z);
    const free = new Set([...inside].filter((k) => !this.objTiles.has(k) && !this.blocked.has(k) && !extra.has(k)));
    const start = this.doors.map((d) => d.x + ',' + d.z).filter((k) => free.has(k));
    if (!start.length) return true;
    const seen = new Set(start), q = [...start];
    while (q.length) {
      const [x, z] = q.pop().split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (x + dx) + ',' + (z + dz);
        if (free.has(k) && !seen.has(k)) { seen.add(k); q.push(k); }
      }
    }
    return seen.size === free.size;
  }
  // Place a centre item covering tw x td tiles; blocks those tiles on the map.
  centerItem(tw, td, fn, { margin = 1, tries = 60, allowNearOcc = false } = {}) {
    const tiles = this.interiorTiles();
    const doorIn = this.doors.map((d) => [d.x, d.z]);
    const cands = [];
    for (const [x, z] of tiles) {
      let ok = true;
      for (let dz = 0; dz < td && ok; dz++) for (let dx = 0; dx < tw && ok; dx++) {
        const X = x + dx, Z = z + dz;
        if (X >= this.x1 - 1 || Z >= this.z1 - 1) ok = false;
        else if (this.isTaken(X, Z) || (!allowNearOcc && this.nearOccupant(X, Z))) ok = false;
        else if (doorIn.some(([a, c]) => Math.max(Math.abs(a - X), Math.abs(c - Z)) <= margin + 0)) ok = false;
      }
      if (ok) cands.push([x, z]);
    }
    for (let i = 0; i < Math.min(tries, cands.length); i++) {
      const j = Math.floor(this.rnd() * cands.length);
      const [x, z] = cands.splice(j, 1)[0];
      const extra = new Set();
      for (let dz = 0; dz < td; dz++) for (let dx = 0; dx < tw; dx++) extra.add((x + dx) + ',' + (z + dz));
      if (!this.connected(extra)) continue;
      for (const k of extra) this.blocked.add(k);
      const m = M(x + tw / 2, this.fy + 0.06, z + td / 2, 0);
      fn(this.I, m, x, z);
      return true;
    }
    return false;
  }
}

// ---- small shared decorations -------------------------------------------------------------------
function flowerBoxInto(B, m, w, rnd) {
  B.box(w, 0.2, 0.24, m.clone().multiply(M(0, 0.1, 0)), { tile: TILE.PLANKS, color: '#5e4129' });
  const cols = ['#e85a6a', '#f2c94c', '#f4f0e8', '#b56ad8', '#ff8a4a'];
  const n = Math.max(3, Math.round(w / 0.13));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.06 + (i / (n - 1)) * (w - 0.12);
    B.geo(new THREE.IcosahedronGeometry(0.08, 0), m.clone().multiply(M(x, 0.24, (i % 2) * 0.06 - 0.03)), { color: '#4f8a34', sway: 0.01 });
    B.geo(new THREE.IcosahedronGeometry(0.055, 0), m.clone().multiply(M(x + 0.02, 0.31, (i % 2) * 0.06 - 0.04)), { color: cols[Math.floor(rnd() * cols.length)], sway: 0.015 });
  }
}
function lanternInto(B, m) {
  const fr = { tile: TILE.METAL, color: '#2e2a26' };
  B.box(0.22, 0.03, 0.22, m.clone().multiply(M(0, 0, 0)), fr);
  B.box(0.26, 0.04, 0.26, m.clone().multiply(M(0, 0.32, 0)), fr);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.box(0.025, 0.3, 0.025, m.clone().multiply(M(x * 0.1, 0.16, z * 0.1)), fr);
  B.box(0.17, 0.27, 0.17, m.clone().multiply(M(0, 0.16, 0)), { color: '#ffd88a', glow: '#ffb050', glowMode: 'night', glowK: 1, jit: 0 });
}
export { flowerBoxInto, lanternInto };
