// Bridges and piers (walkable decks at deckY), moored rowboats and a fishing cog at the docks,
// fences with open gates, the Gildmoor town wall ring (gatehouses, towers, banners), lamp posts
// along town streets (glow at night), the keep yard, and set dressing for every zone (camp
// benches, mine carts, hay, nets, bell frame...). Owner: props builder.
// API: createStructures(ctx) -> { group, update(dt) }.
//
// Everything static is merged per 40-tile cell; boats bob on one instanced pool. Props placed on
// walkable land block their tile (map.block) only when all 8 neighbours stay walkable.

import * as THREE from 'three';
import { BRIDGES, FENCES, ZONES, ROADS } from '../data/zones.js';
import { BUILDINGS } from '../data/buildings.js';
import { OBJECTS } from '../data/objects.js';
import { T_BLOCK, T_WATER, T_ROAD, T_BRIDGE, T_INDOOR, T_WALL } from '../world/mapgen.js';
import { getKit, Builder, M, TILE, mulberry32 } from './kit.js';
import { getFx } from './fx.js';
import * as P from './parts.js';
import { MAT } from './b-core.js';

const CELL = 40;
const at2 = (m, x, y, z, ry = 0, rx = 0, rz = 0) => m.clone().multiply(M(x, y, z, ry, rx, rz));
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export function createStructures(ctx) {
  const kit = getKit(ctx);
  const fx = getFx(ctx, kit);
  const { map } = ctx;
  const group = new THREE.Group();
  group.name = 'structures';
  ctx.scene.add(group);
  const shadows = !!ctx.engine?.preset?.shadows;
  const rnd = mulberry32(8080);

  const cells = new Map();
  const B = (x, z) => {
    const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    let b = cells.get(k);
    if (!b) cells.set(k, (b = new Builder(cells.size + 3)));
    return b;
  };
  const H = (x, z) => map.heightAt(x, z);

  // occupancy for safe placement
  const occ = new Set();
  for (const o of ctx.spawns?.objects || []) {
    const d = OBJECTS[o.def];
    for (let z = o.z; z < o.z + (o.d || 1); z++) for (let x = o.x; x < o.x + (o.w || 1); x++) occ.add(x + ',' + z);
    void d;
  }
  for (const n of ctx.spawns?.npcs || []) occ.add(n.x + ',' + n.z);
  for (const b of BUILDINGS) for (const d of b.doors || []) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) occ.add((d.x + dx) + ',' + (d.z + dz));
  const blockedHere = new Set();
  function freeTile(x, z, { road = false } = {}) {
    const f = map.tileFlags(x, z);
    if (f & (T_BLOCK | T_WATER | T_BRIDGE | T_INDOOR)) return false;
    if (!road && f & T_ROAD) return false;
    return !occ.has(x + ',' + z) && !blockedHere.has(x + ',' + z);
  }
  // A tile we may block: free, and all 8 neighbours walkable (so no path is ever cut).
  function blockable(x, z) {
    if (!freeTile(x, z)) return false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const k = (x + dx) + ',' + (z + dz);
      if (map.tileFlags(x + dx, z + dz) & T_BLOCK || blockedHere.has(k) || occ.has(k)) return false;
    }
    return true;
  }
  function blockTile(x, z) { map.block(x, z); blockedHere.add(x + ',' + z); }
  // Place a prop on a tile near (x, z) (spiral search); fn(builder, matrix at ground).
  function placeNear(x, z, fn, { r = 3, yaw = null, block = true, any = false } = {}) {
    for (let k = 0; k <= r; k++) for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== k) continue;
      const tx = Math.floor(x) + dx, tz = Math.floor(z) + dz;
      if (any ? !freeTile(tx, tz) : !blockable(tx, tz)) continue;
      const cx = tx + 0.5, cz = tz + 0.5;
      fn(B(cx, cz), M(cx, H(cx, cz) - 0.02, cz, yaw ?? rnd() * Math.PI * 2), tx, tz);
      if (block) blockTile(tx, tz);
      return [tx, tz];
    }
    return null;
  }

  const animated = [];

  // ================================================================== bridges & piers
  const boatGeo = boatGeometry();
  const boats = kit.makePool(group, boatGeo, kit.mat, { capacity: 8, castShadow: shadows, name: 'boats' });
  const boatList = [];
  function addBoat(x, z, yaw, s = 1) {
    const slot = boats.add(M(x, 0, z, yaw, 0, 0, s));
    boatList.push({ slot, x, z, yaw, s, ph: rnd() * 6 });
  }

  for (const br of BRIDGES) {
    const bx0 = br.x0, bx1 = br.x1 + 1, bz0 = br.z0, bz1 = br.z1 + 1;
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    const b = B(cx, cz);
    const y = br.deckY;
    const alongX = br.axis === 'x';
    const len = alongX ? bx1 - bx0 : bz1 - bz0;
    const wid = alongX ? bz1 - bz0 : bx1 - bx0;
    const F = M(cx, 0, cz, alongX ? 0 : Math.PI / 2); // local x = along the walk
    const L = (u, yy, v) => new THREE.Vector3(u, yy, v).applyMatrix4(F);
    const pier = br.kind === 'pier';
    const rope = br.id === 'hood-ford';
    const wood = pier ? '#8f7a62' : '#8a6644';
    // deck planks across
    for (let u = -len / 2 + 0.15; u < len / 2; u += 0.3) {
      const jit = (rnd() - 0.5) * 0.04;
      b.box(0.27, 0.1, wid - (pier ? 0.1 : 0.3), at2(F, u, y - 0.05 + jit * 0.2, (rnd() - 0.5) * 0.06), { tile: TILE.PLANKS, color: new THREE.Color(wood).offsetHSL(0, 0, (rnd() - 0.5) * 0.06), uvScale: 1.6, vnoise: 0.03 });
    }
    // stringers + side beams
    for (const v of [-wid / 2 + 0.25, -wid / 6, wid / 6, wid / 2 - 0.25]) b.box(len, 0.22, 0.2, at2(F, 0, y - 0.21, v), MAT.timber('#5a4432'));
    // piles / piers down to the bed
    const step = pier ? 2.0 : len / 3;
    for (let u = -len / 2 + (pier ? 0.4 : step); u <= len / 2 - (pier ? 0.2 : step * 0.9); u += step) {
      for (const v of pier ? [-wid / 2 + 0.15, wid / 2 - 0.15] : [0]) {
        const p = L(u, 0, v);
        const bed = H(p.x, p.z);
        if (pier) {
          P.cylinder(b, M(p.x, bed - 0.3, p.z), 0.16, 0.18, y + 0.75 - bed, { tile: TILE.BARK, color: '#5e5446', ao: [-0.2, 0.4, 0.45] }, 7);
        } else if (!rope) {
          const pm = at2(F, u, 0, 0);
          b.box(1.2, y - 0.3 - bed + 0.5, wid - 0.3, M(p.x, (bed - 0.5 + y - 0.3) / 2, p.z, alongX ? 0 : Math.PI / 2), MAT.stone('#9a9286'));
          b.box(1.5, 0.3, wid + 0.1, M(p.x, y - 0.42, p.z, alongX ? 0 : Math.PI / 2), MAT.stone('#b0a898'));
          void pm;
        } else {
          for (const vv of [-wid / 2 + 0.3, wid / 2 - 0.3]) { const pp = L(u, 0, vv); P.cylinder(b, M(pp.x, H(pp.x, pp.z) - 0.3, pp.z), 0.14, 0.16, y + 0.3 - H(pp.x, pp.z), { tile: TILE.BARK, color: '#5e4a36' }, 6); }
        }
      }
    }
    if (!pier) {
      // railings
      for (const v of [-wid / 2 + 0.12, wid / 2 - 0.12]) {
        const n = Math.round(len / 1.2);
        for (let i = 0; i <= n; i++) {
          const u = -len / 2 + 0.15 + (i * (len - 0.3)) / n;
          b.box(0.13, 1.05, 0.13, at2(F, u, y + 0.5, v), rope ? { tile: TILE.BARK, color: '#6a5038' } : MAT.timber('#5a4432'));
        }
        if (rope) {
          for (const hh of [0.95, 0.55]) {
            for (let i = 0; i < n; i++) {
              const u0 = -len / 2 + 0.15 + (i * (len - 0.3)) / n, u1 = -len / 2 + 0.15 + ((i + 1) * (len - 0.3)) / n;
              const a = L(u0, y + hh, v), c = L((u0 + u1) / 2, y + hh - 0.12, v), d = L(u1, y + hh, v);
              b.beam(a.x, a.y, a.z, c.x, c.y, c.z, 0.03, { color: '#c8b890' });
              b.beam(c.x, c.y, c.z, d.x, d.y, d.z, 0.03, { color: '#c8b890' });
            }
          }
        } else {
          b.box(len - 0.1, 0.1, 0.12, at2(F, 0, y + 1.0, v), MAT.timber('#6a5038'));
          b.box(len - 0.1, 0.07, 0.08, at2(F, 0, y + 0.55, v), MAT.timber('#6a5038'));
          // X braces between posts
          for (let i = 0; i < n; i++) {
            const u0 = -len / 2 + 0.15 + (i * (len - 0.3)) / n, u1 = -len / 2 + 0.15 + ((i + 1) * (len - 0.3)) / n;
            const a = L(u0, y + 0.1, v), c = L(u1, y + 0.5, v);
            b.beam(a.x, a.y, a.z, c.x, c.y, c.z, 0.06, MAT.timber('#5a4432'));
          }
        }
      }
      // ramps at both ends
      for (const sg of [-1, 1]) {
        const e = L(sg * (len / 2 + 0.6), 0, 0);
        const g = H(e.x, e.z);
        if (y - g > 0.08) {
          const rl = 1.4;
          const th = Math.atan2(y - g, rl);
          b.box(rl / Math.cos(th) + 0.1, 0.12, wid - 0.4, at2(F, sg * (len / 2 + rl / 2 - 0.05), (y + g) / 2 - 0.06, 0, 0, 0, -sg * th), { tile: TILE.PLANKS, color: wood, uvRot: true });
        }
        // corner lanterns on the end posts
        if (!rope) for (const v of [-wid / 2 + 0.12, wid / 2 - 0.12]) {
          const p = L(sg * (len / 2 - 0.15), y + 1.05, v);
          P.lantern(b, M(p.x, p.y, p.z));
          fx.halo(p.x, p.y + 0.16, p.z, 1.4, [0.9, 0.55, 0.22], true);
        }
      }
    } else {
      // pier furniture: bollards, crates, barrels, pots, lanterns, a ladder
      const n = Math.floor(len / 3);
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + 1.5 + i * 3;
        for (const v of [-wid / 2 + 0.2, wid / 2 - 0.2]) {
          const p = L(u, y, v);
          P.cylinder(b, M(p.x, p.y, p.z), 0.12, 0.14, 0.35, { tile: TILE.BARK, color: '#4a4034' }, 7);
          P.cylinder(b, M(p.x, p.y + 0.35, p.z), 0.16, 0.12, 0.06, { tile: TILE.BARK, color: '#4a4034' }, 7);
        }
      }
      const sea = H(...xz(L(len / 2, 0, 0))) < H(...xz(L(-len / 2, 0, 0))) ? 1 : -1; // which end is out at sea
      const endU = sea * (len / 2 - 0.5);
      for (const v of [-wid / 2 + 0.15, wid / 2 - 0.15]) {
        const p = L(endU, y, v);
        P.lampPost(b, M(p.x, p.y, p.z, rnd() * 6), { h: 2.4, wood: true });
        fx.halo(p.x, p.y + 2.06, p.z, 1.8, [0.9, 0.55, 0.22], true);
      }
      const cr = L(-sea * (len / 2 - 2.2), y, -wid / 2 + 0.45);
      P.crate(b, M(cr.x, y, cr.z, 0.3), { s: 0.55 });
      P.barrel(b, M(cr.x + (alongX ? 0.7 : 0.1), y, cr.z + (alongX ? 0.1 : 0.7)), { r: 0.28, h: 0.8 });
      const pots = L(sea * (len / 2 - 2.6), y, wid / 2 - 0.45);
      for (let i = 0; i < 3; i++) P.cylinder(b, M(pots.x + i * 0.12, y + i * 0.35, pots.z + (i % 2) * 0.1), 0.2, 0.26, 0.35, { tile: TILE.HAY, color: '#a67c45' }, 9, true);
      const net = L(sea * (len / 2 - 4.0), y, wid / 2 - 0.4);
      P.sphere(b, M(net.x, y + 0.08, net.z, 0, 0, 0, 1.4, 0.35, 1), 0.4, { tile: TILE.NET, color: '#d8c8a0' }, 8, 5);
      // ladder down to the water
      const ld = L(sea * (len / 2 - 1.2), 0, -wid / 2 - 0.05);
      for (const k of [-0.25, 0.25]) b.box(0.06, y + 0.4, 0.06, M(ld.x + (alongX ? k : 0), (y - 0.4) / 2 + 0.2, ld.z + (alongX ? 0 : k)), MAT.timber('#4a4034'));
      for (let yy = -0.3; yy < y; yy += 0.3) b.box(alongX ? 0.5 : 0.05, 0.04, alongX ? 0.05 : 0.5, M(ld.x, yy, ld.z), MAT.timber('#4a4034'));
      // moored rowboats
      const side = br.id === 'pier-west' ? -1 : 1;
      addBoat(...xz(L(sea * (len / 2 - 3.5), 0, side * (wid / 2 + 1.0))), (alongX ? 0 : Math.PI / 2) + 0.08, 1);
      addBoat(...xz(L(sea * (len / 2 - 7.0), 0, -side * (wid / 2 + 1.0))), (alongX ? 0 : Math.PI / 2) - 0.1, 0.95);
      if (br.id === 'pier-east') cogBoat(L(sea * (len / 2 - 3.0), 0, wid / 2 + 2.6), alongX ? Math.PI / 2 : 0.05);
    }
  }
  function xz(v) { return [v.x, v.z]; }

  function cogBoat(pos, yaw) {
    const b = new Builder(404);
    const hull = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    b.geo(hull, M(0, 0.7, 0, 0, 0, 0, 1.9, 1.3, 5.2), { tile: TILE.PLANKS, color: '#6a4e36', uvScale: 1.2 });
    b.geo(new THREE.TorusGeometry(1, 0.08, 4, 24), M(0, 0.72, 0, 0, Math.PI / 2, 0, 1.9, 5.2, 1), MAT.timber('#4a3424'));
    b.box(3.4, 0.08, 9.4, M(0, 0.55, 0), { tile: TILE.PLANKS, color: '#9a7a54' });
    b.box(2.6, 0.9, 1.6, M(0, 1.0, 3.2), { tile: TILE.PLANKS, color: '#7a5a3e' });
    b.box(2.8, 0.1, 1.8, M(0, 1.5, 3.2), MAT.timber('#4a3424'));
    P.cylinder(b, M(0, 0.5, -0.6), 0.12, 0.16, 7.5, { tile: TILE.BARK, color: '#7a5a3e' }, 8);
    b.box(3.2, 0.12, 0.12, M(0, 5.6, -0.6), MAT.timber('#5a4432'));
    P.cylinder(b, M(-1.5, 5.45, -0.6, 0, 0, -Math.PI / 2), 0.26, 0.26, 3.0, { tile: TILE.CANVAS, color: '#e2d6bc' }, 8);
    for (const s of [-1, 1]) {
      b.beam(0, 7.8, -0.6, s * 1.6, 0.8, -0.6, 0.025, { color: '#c8b890' });
      b.beam(0, 7.8, -0.6, 0, 0.9, s * 4.6, 0.025, { color: '#c8b890' });
    }
    P.barrel(b, M(0.9, 0.6, -2.4), { r: 0.3, h: 0.8 });
    P.crate(b, M(-0.8, 0.6, -2.2, 0.4), { s: 0.6 });
    const m = new THREE.Mesh(b.build(), kit.mat);
    m.castShadow = shadows; m.receiveShadow = true;
    const g = new THREE.Group();
    g.position.set(pos.x, -0.35, pos.z);
    g.rotation.y = yaw;
    g.add(m);
    group.add(g);
    animated.push({ obj: g, ph: rnd() * 6, amp: 0.035, y0: -0.35 });
  }

  // ================================================================== fences
  for (const f of FENCES) {
    const low = !!f.low;
    const isGate = (x, z) => f.gates.some((g) => g.x === x && g.z === z);
    // outline in order
    const loop = [];
    for (let x = f.x0; x <= f.x1; x++) loop.push([x, f.z0]);
    for (let z = f.z0 + 1; z <= f.z1; z++) loop.push([f.x1, z]);
    for (let x = f.x1 - 1; x >= f.x0; x--) loop.push([x, f.z1]);
    for (let z = f.z1 - 1; z > f.z0; z--) loop.push([f.x0, z]);
    const pt = ([x, z]) => new THREE.Vector3(x + 0.5, H(x + 0.5, z + 0.5), z + 0.5);
    const postH = low ? 0.75 : 1.15;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], c = loop[(i + 1) % loop.length];
      const pa = pt(a), pc = pt(c);
      const b = B(pa.x, pa.z);
      const ga = isGate(...a), gc = isGate(...c);
      if (!ga) {
        if (low) P.cylinder(b, M(pa.x, pa.y - 0.15, pa.z), 0.06, 0.07, postH + 0.15, { tile: TILE.BARK, color: '#6a5038' }, 6);
        else b.box(0.14, postH + 0.2, 0.14, M(pa.x, pa.y + postH / 2 - 0.1, pa.z, rnd() * 0.2, (rnd() - 0.5) * 0.06), MAT.timber('#7a5c3e'));
      }
      if (ga || gc) continue;
      if (low) {
        b.beam(pa.x, pa.y + postH - 0.08, pa.z, pc.x, pc.y + postH - 0.08, pc.z, 0.03, { color: '#c8b890' });
      } else {
        for (const hh of [0.42, 0.88]) b.beam(pa.x, pa.y + hh, pa.z, pc.x, pc.y + hh + (rnd() - 0.5) * 0.04, pc.z, 0.08, MAT.timber('#8a6a46'), 0.06);
      }
    }
    // gates: thick posts beside the opening and an open gate leaf
    const gates = [...f.gates].sort((g1, g2) => g1.x - g2.x || g1.z - g2.z);
    const onWest = (g) => g.x === f.x0, onEast = (g) => g.x === f.x1;
    const vertical = gates.every((g) => onWest(g) || onEast(g));
    const g0 = gates[0], g1 = gates[gates.length - 1];
    const ends = vertical ? [[g0.x, g0.z - 1, 0, -1], [g1.x, g1.z + 1, 0, 1]] : [[g0.x - 1, g0.z, -1, 0], [g1.x + 1, g1.z, 1, 0]];
    for (const [x, z] of ends) {
      const p = pt([x, z]);
      B(p.x, p.z).box(0.22, postH + 0.5, 0.22, M(p.x, p.y + postH / 2 + 0.1, p.z), MAT.timber('#6a4c32'));
      B(p.x, p.z).box(0.3, 0.08, 0.3, M(p.x, p.y + postH + 0.38, p.z), MAT.timber('#5a3c26'));
    }
    if (!low) {
      const [x, z, dx, dz] = ends[0];
      const p = pt([x, z]);
      const glen = gates.length * 1.0 - 0.1;
      const outward = vertical ? (onWest(g0) ? -1 : 1) : (g0.z === f.z0 ? -1 : 1);
      // swing the leaf outward by ~110 degrees from the closed direction (towards -dx/-dz)
      const ang = (110 * Math.PI) / 180;
      const cdx = -dx, cdz = -dz;
      const ox = vertical ? outward : 0, oz = vertical ? 0 : outward;
      const dirx = cdx * Math.cos(ang) + ox * Math.sin(ang), dirz = cdz * Math.cos(ang) + oz * Math.sin(ang);
      const yaw = Math.atan2(-dirz, dirx);
      const gm = M(p.x + dirx * (glen / 2 + 0.1), p.y, p.z + dirz * (glen / 2 + 0.1), yaw);
      const b = B(p.x, p.z);
      for (const hh of [0.3, 0.65, 1.0]) b.box(glen, 0.09, 0.06, gm.clone().multiply(M(0, hh, 0)), MAT.timber('#8a6a46'));
      for (const k of [-1, 0, 1]) b.box(0.08, 0.85, 0.07, gm.clone().multiply(M(k * (glen / 2 - 0.05), 0.65, 0)), MAT.timber('#7a5c3e'));
      b.beam(...V3(gm, -glen / 2, 0.3, 0), ...V3(gm, glen / 2, 1.0, 0), 0.07, MAT.timber('#7a5c3e'), 0.05);
    }
  }
  function V3(m, x, y, z) { const v = new THREE.Vector3(x, y, z).applyMatrix4(m); return [v.x, v.y, v.z]; }

  // ================================================================== Gildmoor town wall
  const G = ZONES.gildmoor;
  const keep = BUILDINGS.find((b) => b.style === 'castle-keep');
  const inKeep = (x, z) => keep && x > keep.x - 0.3 && x < keep.x + keep.w + 0.3 && z > keep.z - 0.3 && z < keep.z + keep.d + 0.3;
  const isGateAng = (a) => G.gates.some((g) => Math.abs(angDiff(a, g.ang)) * G.wallR < 2.25);
  const WALL_STONE = '#a49c8e';
  // smoothed top height along the ring
  const NS = 720;
  const ground = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    const a = (i / NS) * Math.PI * 2 - Math.PI;
    let mx = -Infinity;
    for (const dr of [-0.8, 0, 0.8]) mx = Math.max(mx, H(G.x + Math.cos(a) * (G.wallR + dr), G.z + Math.sin(a) * (G.wallR + dr)));
    ground[i] = mx;
  }
  const topAt = new Float32Array(NS);
  for (let i = 0; i < NS; i++) { let s = 0; for (let k = -6; k <= 6; k++) s += ground[(i + k + NS) % NS]; topAt[i] = s / 13 + 5.0; }
  const topOf = (a) => topAt[Math.floor(((a + Math.PI) / (Math.PI * 2)) * NS) % NS];
  const segA = 1.6 / G.wallR;
  for (let a = -Math.PI; a < Math.PI - 1e-6; a += segA) {
    const am = a + segA / 2;
    const x = G.x + Math.cos(am) * G.wallR, z = G.z + Math.sin(am) * G.wallR;
    if (isGateAng(am) || inKeep(x, z)) continue;
    let gmin = Infinity;
    for (const dr of [-0.9, 0.9]) for (const da of [-segA / 2, segA / 2]) gmin = Math.min(gmin, H(G.x + Math.cos(am + da) * (G.wallR + dr), G.z + Math.sin(am + da) * (G.wallR + dr)));
    const top = topOf(am);
    const base = gmin - 0.8;
    const yaw = -am + Math.PI / 2; // local x along the tangent... (rotation so local z is radial)
    const len = segA * G.wallR + 0.05;
    const b = B(x, z);
    const m = M(x, (base + top) / 2, z, yaw);
    b.box(len, top - base, 1.5, m, { tile: TILE.STONE, color: WALL_STONE, uvScale: 2.2, ao: [base + 0.6, base + 2.0, 0.65] });
    // plinth batter + string course + walkway + crenellations (outer edge)
    b.box(len, 1.2, 1.8, M(x, gmin - 0.2, z, yaw), { tile: TILE.RUBBLE, color: '#8e877a' });
    b.box(len + 0.02, 0.2, 1.7, M(x, top - 0.1, z, yaw), MAT.stone('#c2baac'));
    const ox = Math.cos(am), oz = Math.sin(am);
    for (const k of [-0.25, 0.25]) {
      b.box(0.62, 0.75, 0.35, M(x + ox * 0.62 + Math.cos(am + Math.PI / 2) * k * len, top + 0.37, z + oz * 0.62 + Math.sin(am + Math.PI / 2) * k * len, yaw), MAT.stone(WALL_STONE));
    }
    b.box(len, 0.45, 0.22, M(x - ox * 0.65, top + 0.22, z - oz * 0.65, yaw), MAT.stone(WALL_STONE));
  }
  // towers around the ring + gatehouses
  const towerAt = (a, r = 2.1, h = 7.6, outward = 1.1) => {
    const x = G.x + Math.cos(a) * (G.wallR + outward), z = G.z + Math.sin(a) * (G.wallR + outward);
    if (inKeep(x, z)) return;
    const g = Math.min(H(x, z), H(x + 1.5, z), H(x - 1.5, z), H(x, z + 1.5), H(x, z - 1.5));
    const top = topOf(a) + (h - 5.0);
    const b = B(x, z);
    b.geo(new THREE.CylinderGeometry(r, r + 0.35, 1.6, 14).translate(0, 0.8, 0), M(x, g - 0.8, z), { tile: TILE.RUBBLE, color: '#8e877a' });
    b.geo(new THREE.CylinderGeometry(r, r, top - g, 14, 1, true).translate(0, (top - g) / 2, 0), M(x, g, z), { tile: TILE.STONE, color: WALL_STONE, uvScale: 2.2 });
    b.geo(new THREE.CylinderGeometry(r + 0.25, r + 0.08, 0.4, 14).translate(0, 0.2, 0), M(x, top - 0.2, z), MAT.stone('#c2baac'));
    for (let i = 0; i < 12; i++) { const aa = (i / 12) * Math.PI * 2; b.box(0.5, 0.7, 0.35, M(x + Math.cos(aa) * (r + 0.08), top + 0.35, z + Math.sin(aa) * (r + 0.08), -aa + Math.PI / 2), MAT.stone(WALL_STONE)); }
    b.geo(new THREE.ConeGeometry(r + 0.2, r * 1.5, 14, 1, true).translate(0, r * 0.75, 0), M(x, top + 0.2, z), { tile: TILE.SLATE, uv: 'own', uvScale: [6, 2], color: '#3e4652' });
    const fp = top + 0.2 + r * 1.5;
    b.box(0.06, 1.5, 0.06, M(x, fp + 0.65, z), { tile: TILE.METAL, color: '#2e2b28' });
    const flag = new THREE.BufferGeometry();
    flag.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.2, -0.2, 0, 0, -0.45, 0, 0, 0, 0, 0, -0.45, 0, 1.2, -0.2, 0], 3));
    flag.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
    flag.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0.5, 0, 1, 0, 0, 0, 1, 1, 0.5], 2));
    b.geo(flag, M(x, fp + 1.35, z, 0.5 + a), { color: '#a32428', jit: 0, sway: (wx, wy, wz) => Math.hypot(wx - x, wz - z) * 0.1 });
    for (let i = 0; i < 4; i++) { const aa = (i / 4) * Math.PI * 2 + a; b.box(0.12, 0.7, 0.1, M(x + Math.cos(aa) * (r + 0.01), g + 3.2, z + Math.sin(aa) * (r + 0.01), -aa + Math.PI / 2), { color: '#141210' }); }
    // block the walkable tiles the tower stands on (outside the ring)
    for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (Math.hypot(tx + 0.5 - x, tz + 0.5 - z) > r - 0.2) continue;
      if (Math.hypot(tx + 0.5 - G.x, tz + 0.5 - G.z) < G.wallR - 0.5) continue; // never block inside the town
      const f = map.tileFlags(tx, tz);
      if (f & (T_BLOCK | T_ROAD) || occ.has(tx + ',' + tz) || blockedHere.has(tx + ',' + tz)) continue;
      blockTile(tx, tz);
    }
  };
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI + (i + 0.5) * (Math.PI * 2 / 12);
    if (G.gates.some((g) => Math.abs(angDiff(a, g.ang)) < 0.3)) continue;
    towerAt(a);
  }
  for (const gt of G.gates) {
    const gx = G.x + Math.cos(gt.ang) * G.wallR, gz = G.z + Math.sin(gt.ang) * G.wallR;
    const tg = [-Math.sin(gt.ang), Math.cos(gt.ang)]; // tangent
    for (const k of [-1, 1]) towerAt(gt.ang + (k * 3.6) / G.wallR, 1.9, 8.4, 0.2);
    const yaw = -gt.ang + Math.PI / 2;
    const g = H(gx, gz);
    const top = topOf(gt.ang);
    const b = B(gx, gz);
    // arch over the opening
    b.box(5.2, top - (g + 3.9), 1.6, M(gx, (g + 3.9 + top) / 2, gz, yaw), { tile: TILE.STONE, color: WALL_STONE });
    b.geo(new THREE.TorusGeometry(2.2, 0.32, 5, 14, Math.PI), M(gx, g + 3.6, gz, yaw, 0, 0, 1, 0.7, 4.8), MAT.stone('#c2baac'));
    b.box(5.4, 0.2, 1.8, M(gx, top - 0.1, gz, yaw), MAT.stone('#c2baac'));
    const ox = Math.cos(gt.ang), oz = Math.sin(gt.ang);
    for (const k of [-2, -1, 0, 1, 2]) b.box(0.6, 0.75, 0.35, M(gx + ox * 0.62 + tg[0] * k * 1.05, top + 0.37, gz + oz * 0.62 + tg[1] * k * 1.05, yaw), MAT.stone(WALL_STONE));
    // raised portcullis (teeth peeking below the arch)
    for (let i = 0; i < 9; i++) b.box(0.07, 0.9, 0.07, M(gx + tg[0] * (-2.0 + i * 0.5), g + 3.95, gz + tg[1] * (-2.0 + i * 0.5), yaw), { tile: TILE.METAL, color: '#2a2826' });
    b.box(4.4, 0.08, 0.08, M(gx, g + 4.3, gz, yaw), { tile: TILE.METAL, color: '#2a2826' });
    // banners on the outer face + torches
    for (const k of [-1, 1]) {
      const bx = gx + tg[0] * k * 1.6 + ox * 0.82, bz = gz + tg[1] * k * 1.6 + oz * 0.82;
      P.banner(b, M(bx, top - 0.3, bz, yaw + Math.PI), { tile: TILE.BANNER_SHERIFF, w: 0.95, h: 2.4, bar: '#c9a24a', sway: 0.04 });
      const tx = gx + tg[0] * k * 2.55 + ox * 0.85, tz = gz + tg[1] * k * 2.55 + oz * 0.85;
      P.torch(b, M(tx, g + 2.2, tz, yaw + Math.PI));
      fx.flame(tx + ox * 0.18, g + 2.75, tz + oz * 0.18, 0.35, 0.45, 0.9);
      fx.halo(tx + ox * 0.2, g + 2.95, tz + oz * 0.2, 1.8, [0.8, 0.4, 0.1], true);
    }
    // gate name plaque
    const rect = kit.sign(`${gt.id[0].toUpperCase()}${gt.id.slice(1)} Gate`, { icon: 'crown', board: '#5a1416', ink: '#e8bf4a' });
    b.box(2.4, 0.5, 0.06, M(gx + ox * 0.84, g + 4.65, gz + oz * 0.84, yaw + Math.PI), { rect, color: '#ffffff', jit: 0, vnoise: 0 });
    b.box(2.4, 0.5, 0.06, M(gx - ox * 0.84, g + 4.65, gz - oz * 0.84, yaw), { rect, color: '#ffffff', jit: 0, vnoise: 0 });
  }
  // banners along the inner wall face between towers
  for (let i = 0; i < 24; i++) {
    const a = -Math.PI + (i + 0.25) * (Math.PI * 2 / 24);
    if (isGateAng(a) || G.gates.some((g) => Math.abs(angDiff(a, g.ang)) < 0.22)) continue;
    const x = G.x + Math.cos(a) * (G.wallR - 0.8), z = G.z + Math.sin(a) * (G.wallR - 0.8);
    if (inKeep(x, z)) continue;
    P.banner(B(x, z), M(x, topOf(a) - 0.25, z, -a - Math.PI / 2), { tile: i % 3 === 0 ? TILE.BANNER_CHAIN : TILE.BANNER_SHERIFF, w: 0.8, h: 2.0, bar: '#c9a24a', sway: 0.04 });
  }

  // ================================================================== lamp posts along streets
  function lampsAlong(zone, radius, spacing, { wood = false, crystal = false } = {}) {
    const Z = ZONES[zone];
    for (const r of ROADS) {
      const w = (r.width || 3) / 2;
      let acc = spacing * 0.5, side = 1;
      for (let i = 0; i < r.points.length - 1; i++) {
        const a = r.points[i], c = r.points[i + 1];
        const seg = Math.hypot(c.x - a.x, c.z - a.z);
        const dx = (c.x - a.x) / seg, dz = (c.z - a.z) / seg;
        for (let t = 0; t < seg; t += 0.5) {
          acc += 0.5;
          if (acc < spacing) continue;
          const x = a.x + dx * t, z = a.z + dz * t;
          if (Math.hypot(x - Z.x, z - Z.z) > radius) continue;
          const px = x - dz * side * (w + 0.9), pz = z + dx * side * (w + 0.9);
          const tx = Math.floor(px), tz = Math.floor(pz);
          if (!blockable(tx, tz) || map.tileFlags(tx, tz) & T_WALL) continue;
          acc = 0;
          side = -side;
          const cx = tx + 0.5, cz = tz + 0.5;
          const yaw = Math.atan2(-(x - cx), -(z - cz)); // arm towards the road
          const m = M(cx, H(cx, cz) - 0.05, cz, yaw);
          if (crystal) {
            const b = B(cx, cz);
            b.box(0.12, 2.2, 0.12, at2(m, 0, 1.1, 0), MAT.stone('#d6d0e2'));
            b.geo(new THREE.OctahedronGeometry(0.22, 0).scale(1, 1.8, 1), at2(m, 0, 2.6, 0), { tile: TILE.CRYSTAL, color: '#8fe3ff', glow: '#9ad8ff', glowMode: 'tinted', glowK: 0.6, flat: true });
            const p = new THREE.Vector3(0, 2.6, 0).applyMatrix4(m);
            fx.halo(p.x, p.y, p.z, 2.0, [0.18, 0.32, 0.6]);
          } else {
            const f = P.lampPost(B(cx, cz), m, { h: 2.8, wood });
            const p = new THREE.Vector3(...f).applyMatrix4(m);
            fx.halo(p.x, p.y, p.z, 2.2, [0.95, 0.6, 0.25], true);
          }
          blockTile(tx, tz);
        }
      }
    }
  }
  lampsAlong('gildmoor', G.wallR - 2, 9);
  lampsAlong('brightwater', 22, 11, { wood: true });
  lampsAlong('docks', 12, 9, { wood: true });
  lampsAlong('oracle', 26, 8, { crystal: true });

  // ================================================================== keep yard
  if (keep) {
    const d = keep.doors[0];
    const yx0 = keep.x + 1, yx1 = keep.x + keep.w - 1, yz0 = keep.z + keep.d, yz1 = yz0 + 4;
    for (let tz = yz0; tz < yz1; tz++) for (let tx = yx0; tx < yx1; tx++) {
      if (map.tileFlags(tx, tz) & (T_WATER | T_INDOOR)) continue;
      const b = B(tx, tz);
      const c = [[tx, tz], [tx + 1, tz], [tx + 1, tz + 1], [tx, tz + 1]].map(([x, z]) => new THREE.Vector3(x, H(x, z) + 0.035, z));
      b.face([c[3], c[2], c[1], c[0]], { tile: TILE.PAVING, color: '#bdb5a6', uvScale: 2.4 });
    }
    const spots = [[yx0 + 0.5, yz0 + 1.5], [yx1 - 0.5, yz0 + 1.5], [yx0 + 1.5, yz1 - 0.5], [yx1 - 1.5, yz1 - 0.5]];
    spots.forEach(([x, z], i) => {
      if (Math.abs(x - (d.x + 0.5)) < 2.5) return;
      if (i < 2) placeNear(x, z, (b, m) => P.dummy(b, m, { shield: true }), { r: 1 });
      else placeNear(x, z, (b, m) => { const f = P.brazier(b, m); const p = new THREE.Vector3(...f).applyMatrix4(m); fx.flame(p.x, p.y - 0.05, p.z, 0.55, 0.7, 1); fx.halo(p.x, p.y + 0.4, p.z, 2.4, [0.8, 0.4, 0.1]); }, { r: 1 });
    });
    placeNear(yx0 + 0.5, yz0 + 3, (b, m) => P.weaponRack(b, at2(m, 0, 0, 0)), { r: 1, yaw: Math.PI / 2 });
    placeNear(yx1 - 0.5, yz0 + 3, (b, m) => P.weaponRack(b, at2(m, 0, 0, 0)), { r: 1, yaw: -Math.PI / 2 });
  }

  // ================================================================== zone set dressing
  // Hood camp: log benches around the fire, banners, lantern string, crates.
  const camp = ZONES.hoodwood.camp;
  const fire = (ctx.spawns?.objects || []).find((o) => o.def === 'fire' && o.permanent);
  if (fire) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      placeNear(fire.x + 0.5 + Math.cos(a) * 2.6, fire.z + 0.5 + Math.sin(a) * 2.6, (b, m) => {
        const mm = at2(m, 0, 0, 0, 0);
        P.cylinder(b, at2(mm, -0.7, 0.24, 0, 0, 0, Math.PI / 2), 0.2, 0.2, 1.4, { tile: TILE.BARK, color: '#6a5038' }, 8);
      }, { r: 0, yaw: -a + Math.PI / 2 });
    }
  }
  for (const [x, z, f] of [[camp.x + 4, camp.z - 4, 'banner'], [camp.x - 6, camp.z + 5, 'crates'], [camp.x + 6, camp.z + 2, 'rack'], [camp.x - 4, camp.z - 6, 'banner'], [camp.x + 2, camp.z + 6, 'barrels']]) {
    placeNear(x, z, (b, m) => {
      if (f === 'banner') { b.box(0.09, 3.6, 0.09, at2(m, 0, 1.8, 0), { color: '#5e4129' }); P.banner(b, at2(m, 0, 3.4, 0), { tile: TILE.BANNER_HOOD, w: 0.8, h: 1.7, bar: '#5e4129' }); }
      else if (f === 'crates') { P.crate(b, at2(m, 0, 0, 0)); P.crate(b, at2(m, 0.05, 0.7, 0.05, 0.4), { s: 0.5 }); }
      else if (f === 'rack') P.weaponRack(b, m, { w: 0.9 });
      else { P.barrel(b, at2(m, -0.2, 0, 0), { r: 0.26 }); P.barrel(b, at2(m, 0.3, 0, 0.1), { r: 0.24, h: 0.8 }); }
    }, { r: 3 });
  }

  // Brightwater: an empty bell frame near the elder (the goblins took the bell), benches, crates.
  const rowan = (ctx.spawns?.npcs || []).find((n) => n.def === 'elder_rowan');
  if (rowan) placeNear(rowan.x - 1, rowan.z - 2, (b, m) => {
    for (const k of [-0.6, 0.6]) b.box(0.18, 2.8, 0.18, at2(m, k, 1.4, 0), MAT.timber('#5a4030'));
    b.box(1.6, 0.2, 0.24, at2(m, 0, 2.8, 0), MAT.timber('#5a4030'));
    const roof = { tile: TILE.SHINGLES, color: '#7a5038' };
    b.box(1.9, 0.05, 0.7, at2(m, 0, 3.05, -0.2, 0, 0.6), roof);
    b.box(1.9, 0.05, 0.7, at2(m, 0, 3.05, 0.2, 0, -0.6), roof);
    b.box(0.03, 0.5, 0.03, at2(m, 0, 2.5, 0), { color: '#c8b890' });
    b.box(0.03, 0.22, 0.03, at2(m, 0.04, 2.12, 0, 0, 0, 0.6), { color: '#c8b890' });
  }, { r: 2 });
  for (const [x, z] of [[176, 251], [192, 250]]) placeNear(x, z, (b, m) => P.bench(b, m, { w: 1.4 }), { r: 2 });
  // Brightwater lake jetty (visual, over water) with a rowboat
  {
    const jx = 163, jz = 247;
    const b = B(jx, jz);
    for (let i = 0; i < 6; i++) b.box(0.28, 0.08, 1.4, M(jx - i * 0.3, 0.55, jz + 0.5, 0, 0, (rnd() - 0.5) * 0.04), { tile: TILE.PLANKS, color: '#8a6a48', uvRot: true });
    for (const k of [-0.6, 0.6]) for (const u of [0, -1.5]) P.cylinder(b, M(jx + u, -1.0, jz + 0.5 + k), 0.08, 0.1, 1.7, { tile: TILE.BARK, color: '#5e4a36' }, 6);
    addBoat(jx - 1.0, jz + 2.0, 0.3, 0.85);
  }

  // Docks: crates, barrels, nets, a crane, lobster pots by the fishmonger.
  for (const [x, z, f] of [[198, 288, 'crates'], [193, 290, 'barrels'], [209, 287, 'net'], [199, 286, 'pots'], [212, 289, 'boat']]) {
    placeNear(x, z, (b, m) => {
      if (f === 'crates') { P.crate(b, at2(m, 0, 0, 0)); P.crate(b, at2(m, 0.1, 0.7, 0, 0.3), { s: 0.55 }); }
      else if (f === 'barrels') { P.barrel(b, at2(m, -0.2, 0, 0)); P.barrel(b, at2(m, 0.35, 0, 0.1), { r: 0.28 }); }
      else if (f === 'net') {
        for (const k of [-0.55, 0.55]) b.box(0.08, 1.8, 0.08, at2(m, k, 0.9, 0), MAT.timber('#5a544c'));
        b.box(1.3, 0.06, 0.06, at2(m, 0, 1.75, 0), MAT.timber('#5a544c'));
        b.geo(new THREE.PlaneGeometry(1.1, 1.5), at2(m, 0, 0.98, 0), { tile: TILE.NET, color: '#d8c8a0', sway: 0.01 });
        b.geo(new THREE.PlaneGeometry(1.1, 1.5).rotateY(Math.PI), at2(m, 0, 0.98, 0), { tile: TILE.NET, color: '#c8b890' });
      } else if (f === 'pots') { for (let i = 0; i < 3; i++) P.cylinder(b, at2(m, (i - 1) * 0.3, 0, 0), 0.18, 0.24, 0.35, { tile: TILE.HAY, color: '#a67c45' }, 9, true); }
      else { // upturned boat on trestles
        b.box(0.1, 0.5, 0.1, at2(m, 0, 0.25, -0.6), MAT.timber('#5a544c')); b.box(0.1, 0.5, 0.1, at2(m, 0, 0.25, 0.6), MAT.timber('#5a544c'));
        b.geo(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).rotateX(Math.PI), at2(m, 0, 0.5, 0, 0, 0, 0).multiply(M(0, 0, 0, 0, 0, 0, 0.55, 0.35, 1.3)), { tile: TILE.PLANKS, color: '#6e5a44' });
      }
    }, { r: 3 });
  }
  // Millbrook: hay bales, a scarecrow in the wheat, troughs, a chicken coop, a hay cart.
  for (const [x, z, f] of [[234, 225, 'scarecrow'], [236, 240, 'hay'], [247, 238, 'trough'], [228, 226, 'coop'], [226, 236, 'cart'], [239, 236, 'hay']]) {
    placeNear(x, z, (b, m) => {
      if (f === 'scarecrow') {
        b.box(0.08, 2.0, 0.08, at2(m, 0, 1.0, 0), MAT.timber('#6a5038'));
        b.box(1.2, 0.07, 0.07, at2(m, 0, 1.5, 0), MAT.timber('#6a5038'));
        b.box(0.5, 0.6, 0.26, at2(m, 0, 1.35, 0), { tile: TILE.SACK, color: '#7a5a8a' });
        P.sphere(b, at2(m, 0, 1.85, 0), 0.17, { tile: TILE.SACK, color: '#d8c090' }, 8, 6);
        b.geo(new THREE.ConeGeometry(0.3, 0.35, 10).translate(0, 0.17, 0), at2(m, 0, 1.95, 0), { tile: TILE.HAY, color: '#c8a050' });
        for (const k of [-1, 1]) b.box(0.15, 0.12, 0.08, at2(m, k * 0.62, 1.45, 0), { tile: TILE.HAY, color: '#d8b860' });
      } else if (f === 'hay') { P.hayBale(b, m); P.hayBale(b, at2(m, 0, 0.55, 0, 0.3)); }
      else if (f === 'trough') { b.box(1.3, 0.45, 0.55, at2(m, 0, 0.22, 0), MAT.hplanks('#5e4129')); b.box(1.2, 0.02, 0.45, at2(m, 0, 0.4, 0), { color: '#2d5a78' }); }
      else if (f === 'coop') {
        for (const [kx, kz] of [[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.35], [0.4, 0.35]]) b.box(0.07, 0.5, 0.07, at2(m, kx, 0.25, kz), MAT.timber('#5e4129'));
        b.box(0.95, 0.65, 0.85, at2(m, 0, 0.82, 0), MAT.planks('#9a5a3a'));
        b.box(1.15, 0.05, 0.6, at2(m, 0, 1.3, -0.25, 0, 0.5), { tile: TILE.SHINGLES, color: '#6a5042' });
        b.box(1.15, 0.05, 0.6, at2(m, 0, 1.3, 0.25, 0, -0.5), { tile: TILE.SHINGLES, color: '#6a5042' });
        b.box(0.25, 0.3, 0.02, at2(m, 0.2, 0.75, -0.44), { color: '#1a1410' });
        b.box(0.25, 0.04, 0.6, at2(m, 0.2, 0.3, -0.7, 0, 0.6), MAT.hplanks('#7a5636'));
      } else P.cart(b, m, { load: 'hay' });
    }, { r: 3 });
  }
  // Copperhollow: ore heaps and lantern posts around the mine entrance and the miners' hut.
  const cave = (ctx.spawns?.objects || []).find((o) => o.def === 'cave_entrance');
  for (const [x, z, f] of [[96, 260, 'cart'], [90, 259, 'lamp'], [100, 252, 'ore'], [cave ? cave.x + 3 : 70, cave ? cave.z + 2 : 276, 'lamp'], [cave ? cave.x - 3 : 63, cave ? cave.z + 2 : 278, 'ore'], [104, 262, 'lamp']]) {
    placeNear(x, z, (b, m) => {
      if (f === 'cart') P.cart(b, m, { load: 'ore', ore: '#9a6a4a' });
      else if (f === 'ore') for (let i = 0; i < 9; i++) P.sphere(b, at2(m, ((i * 37) % 7) / 7 - 0.5, 0.12 + Math.floor(i / 4) * 0.12, ((i * 53) % 7) / 7 - 0.5), 0.2, { tile: TILE.ROCK, color: i % 3 ? '#9a7a5a' : '#c4703b', flat: true }, 5, 4);
      else { const f2 = P.lampPost(b, m, { h: 2.4, wood: true }); const p = new THREE.Vector3(...f2).applyMatrix4(m); fx.halo(p.x, p.y, p.z, 1.9, [0.95, 0.6, 0.25], true); }
    }, { r: 3 });
  }
  // Mistfen: lantern posts with marsh-green light and skull poles near the hut.
  for (const [x, z] of [[58, 165], [46, 158], [62, 172], [72, 168]]) {
    placeNear(x, z, (b, m) => {
      b.box(0.1, 2.2, 0.1, at2(m, 0, 1.1, 0, 0, 0.06, 0.04), { tile: TILE.BARK, color: '#4a4434' });
      b.box(0.5, 0.06, 0.06, at2(m, 0.2, 2.15, 0), { tile: TILE.BARK, color: '#4a4434' });
      P.lantern(b, at2(m, 0.4, 1.7, 0), { light: '#7aff6a', glass: '#b8f0a0', always: true });
      const p = new THREE.Vector3(0.4, 1.86, 0).applyMatrix4(m);
      fx.halo(p.x, p.y, p.z, 1.8, [0.25, 0.6, 0.2]);
    }, { r: 3 });
  }
  // Highlands: cairns and rune stones on the way to the peak.
  for (const [x, z, f] of [[100, 76, 'cairn'], [88, 62, 'rune'], [78, 54, 'cairn'], [112, 96, 'rune']]) {
    placeNear(x, z, (b, m) => {
      if (f === 'cairn') for (let i = 0; i < 6; i++) b.geo(new THREE.DodecahedronGeometry(0.32 - i * 0.04, 0), at2(m, (i % 2) * 0.05, 0.2 + i * 0.27, 0, i), { tile: TILE.ROCK, color: '#8e8880', flat: true });
      else {
        b.box(0.6, 2.0, 0.35, at2(m, 0, 0.9, 0, 0, 0.05, 0.04), { tile: TILE.ROCK, color: '#7a7672' });
        b.box(0.3, 0.5, 0.02, at2(m, 0, 1.2, -0.18), { color: '#e8763a', glow: '#ff6a20', glowMode: 'always', glowK: 0.5 });
        const p = new THREE.Vector3(0, 1.2, -0.25).applyMatrix4(m);
        fx.halo(p.x, p.y, p.z, 1.2, [0.6, 0.2, 0.05]);
      }
    }, { r: 3 });
  }

  // ================================================================== build cell meshes
  for (const [k, b] of cells) {
    if (b.isEmpty()) continue;
    const mesh = new THREE.Mesh(b.build(), kit.mat);
    mesh.name = 'structures:' + k;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    group.add(mesh);
    kit.cull(mesh, Math.max(160, (ctx.engine?.preset?.drawDistance || 480) * 0.6));
  }
  kit.cull(boats, 120);

  const tmp = new THREE.Matrix4();
  return {
    group,
    blocked: blockedHere,
    update(dt) {
      kit.tick(ctx);
      const t = ctx.time.t;
      for (const bt of boatList) {
        tmp.copy(M(bt.x, Math.sin(t * 1.1 + bt.ph) * 0.05 - 0.02, bt.z, bt.yaw, Math.sin(t * 0.9 + bt.ph) * 0.035, Math.sin(t * 1.3 + bt.ph * 2) * 0.05, bt.s));
        boats.setMatrix(bt.slot, tmp);
      }
      for (const a of animated) {
        a.obj.position.y = a.y0 + Math.sin(t * 0.8 + a.ph) * a.amp * 2;
        a.obj.rotation.z = Math.sin(t * 0.7 + a.ph) * a.amp;
        a.obj.rotation.x = Math.sin(t * 0.55 + a.ph * 1.7) * a.amp * 0.6;
      }
    },
  };
}

// Rowboat (local: length along z, floats at y = 0).
function boatGeometry() {
  const b = new Builder(303);
  const hull = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  b.geo(hull, M(0, 0.22, 0, 0, 0, 0, 0.62, 0.42, 1.55), { tile: TILE.PLANKS, color: '#7a5a3e', uvScale: 0.9 });
  b.geo(new THREE.TorusGeometry(1, 0.05, 4, 20), M(0, 0.23, 0, 0, Math.PI / 2, 0, 0.62, 1.55, 1), MAT.timber('#4a3424'));
  b.geo(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), M(0, 0.05, 0, 0, 0, 0, 0.5, 1, 1.3), { tile: TILE.PLANKS, color: '#5a4430' });
  for (const z of [-0.5, 0.35]) b.box(1.1, 0.05, 0.22, M(0, 0.2, z), { tile: TILE.PLANKS, color: '#8a6a48' });
  for (const s of [-1, 1]) b.box(0.05, 0.04, 1.6, M(s * 0.45, 0.28, 0.1, 0.12 * s, 0, s * 0.3), MAT.timber('#9a7a54'));
  b.box(0.012, 0.012, 0.7, M(0, 0.25, -1.75, 0, -0.5), { color: '#c8b890' });
  return b.build();
}
