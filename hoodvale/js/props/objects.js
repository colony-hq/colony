// Visuals for world objects (data/objects.js model.kind) and ground items. Owner: props builder.
// API: createObjectViews(ctx) -> { create(entity), createItem(entity), update(dt) }
//   view = { object3d, setState('active'|'depleted'), update(dt), dispose(), state }
// Repeated things (trees, stumps, rocks, ore, crystals, crops) are drawn instanced per 64-tile
// chunk; unique utilities are single merged meshes; flames/halos/ripples/smoke are shared FX.
// Views also follow `entity.state.depleted` changes, so either API keeps the art in sync.

import * as THREE from 'three';
import { getKit, M, hashStr, mulberry32, Builder, TILE } from './kit.js';
import { getFx } from './fx.js';
import { treeGeometry, stumpGeometry, rockGeometry, nuggetGeometry, crystalGeometry, TREE_INFO } from './m-trees.js';
import { makeObjectModel, wheatGeometry, stubbleGeometry } from './m-objects.js';
import { itemGeometry, itemShadowTexture } from './m-items.js';
import { T_WALL, T_BLOCK, T_ROAD, T_WATER } from '../world/mapgen.js';
import { BUILDINGS } from '../data/buildings.js';

const CHUNK = 80;
const ROCK_TONE = { copperhollow: '#c2a684', highlands: '#9a958e', mistfen: '#8f9488', oracle: '#9a90a8' };

export function createObjectViews(ctx) {
  const kit = getKit(ctx);
  const fx = getFx(ctx, kit);
  const { map } = ctx;
  const root = new THREE.Group();
  root.name = 'objects';
  ctx.scene.add(root);
  const lod = ctx.engine?.preset?.name === 'low' ? 0 : 1;
  const shadows = !!ctx.engine?.preset?.shadows;

  // ---------------------------------------------------------------- geometry + pools
  const geos = new Map();
  const geo = (key, make) => {
    let g = geos.get(key);
    if (!g) { g = make(); geos.set(key, g); }
    return g;
  };
  const pools = new Map();
  function pool(key, x, z, make, opts = {}) {
    const ck = `${key}@${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    let p = pools.get(ck);
    if (!p) {
      p = kit.makePool(root, geo(key, make), opts.material || kit.mat, { capacity: opts.capacity || 24, castShadow: opts.castShadow ?? shadows, receiveShadow: true, name: 'obj:' + ck });
      pools.set(ck, p);
    }
    return p;
  }

  const animated = new Set();
  const tmpM = new THREE.Matrix4();

  // ---------------------------------------------------------------- placement helpers
  function footprintMinY(e) {
    const x0 = e.x, z0 = e.z, x1 = e.x + (e.w || 1), z1 = e.z + (e.d || 1);
    let y = Infinity;
    for (const [x, z] of [[x0 + 0.2, z0 + 0.2], [x1 - 0.2, z0 + 0.2], [x0 + 0.2, z1 - 0.2], [x1 - 0.2, z1 - 0.2], [(x0 + x1) / 2, (z0 + z1) / 2]]) y = Math.min(y, map.heightAt(x, z));
    return y;
  }
  const yawToward = (dx, dz) => Math.atan2(-dx, -dz); // model front (-z) faces (dx, dz)
  const npcs = ctx.spawns?.npcs || [];
  function awayFromNpc(e) {
    for (const n of npcs) {
      const dx = n.x - e.x, dz = n.z - e.z;
      if (Math.max(Math.abs(dx), Math.abs(dz)) === 1 && (dx === 0 || dz === 0)) return yawToward(-dx, -dz);
    }
    return null;
  }
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function awayFromWall(e) {
    const w = e.w || 1, d = e.d || 1;
    for (let r = 1; r <= 2; r++) {
      for (const [dx, dz] of DIRS) {
        let hit = 0;
        for (let k = 0; k < Math.max(w, d); k++) {
          const tx = dx > 0 ? e.x + w - 1 + r : dx < 0 ? e.x - r : e.x + Math.min(k, w - 1);
          const tz = dz > 0 ? e.z + d - 1 + r : dz < 0 ? e.z - r : e.z + Math.min(k, d - 1);
          if (map.tileFlags(tx, tz) & T_WALL) hit++;
        }
        if (hit) return yawToward(-dx, -dz);
      }
    }
    return null;
  }
  function towardBuildingCentre(e) {
    for (const b of BUILDINGS) {
      if (e.x >= b.x && e.x < b.x + b.w && e.z >= b.z && e.z < b.z + b.d) {
        const dx = b.x + b.w / 2 - (e.x + (e.w || 1) / 2), dz = b.z + b.d / 2 - (e.z + (e.d || 1) / 2);
        if (Math.abs(dx) > Math.abs(dz)) return yawToward(Math.sign(dx), 0);
        return yawToward(0, Math.sign(dz) || 1);
      }
    }
    return null;
  }
  function towardRoad(e) {
    let best = null, bd = 1e9;
    const cx = e.x + (e.w || 1) / 2, cz = e.z + (e.d || 1) / 2;
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
      const tx = Math.floor(cx) + dx, tz = Math.floor(cz) + dz;
      if (!(map.tileFlags(tx, tz) & T_ROAD)) continue;
      const d = Math.hypot(tx + 0.5 - cx, tz + 0.5 - cz);
      if (d < bd) { bd = d; best = [tx + 0.5 - cx, tz + 0.5 - cz]; }
    }
    if (!best) return null;
    if (Math.abs(best[0]) > Math.abs(best[1])) return yawToward(Math.sign(best[0]), 0);
    return yawToward(0, Math.sign(best[1]));
  }
  function towardOpen(e) {
    let best = null, bc = -1;
    const w = e.w || 1, d = e.d || 1;
    for (const [dx, dz] of DIRS) {
      let c = 0;
      for (let r = 1; r <= 3; r++) for (let k = -1; k <= Math.max(w, d); k++) {
        const tx = dx > 0 ? e.x + w - 1 + r : dx < 0 ? e.x - r : e.x + k;
        const tz = dz > 0 ? e.z + d - 1 + r : dz < 0 ? e.z - r : e.z + k;
        if (!(map.tileFlags(tx, tz) & (T_BLOCK | T_WATER))) c++;
      }
      if (c > bc) { bc = c; best = [dx, dz]; }
    }
    return best ? yawToward(best[0], best[1]) : null;
  }
  function chooseYaw(kind, e) {
    let y = null;
    switch (kind) {
      case 'bank-booth': case 'exchange-desk': y = awayFromNpc(e) ?? awayFromWall(e); break;
      case 'furnace': case 'range': case 'spinning-wheel': case 'hopper': case 'flour-bin': case 'tanning-rack': case 'anvil':
        y = awayFromWall(e) ?? towardBuildingCentre(e) ?? towardRoad(e); break;
      case 'stall': y = towardRoad(e); break;
      case 'cave-mouth': case 'lair-gate': case 'cave-exit': case 'stairs-down': case 'stairs-up': case 'chest': case 'chest-hoard': y = towardOpen(e); break;
      case 'signpost': y = 0; break;
      case 'target': y = e.yaw ?? 0; break;
      default: y = null;
    }
    return y ?? e.yaw ?? 0;
  }

  function addFx(list, m, out) {
    const v = new THREE.Vector3();
    for (const f of list || []) {
      v.set(f.p[0], f.p[1], f.p[2]).applyMatrix4(m);
      if (f.t === 'flame') out.push(fx.flame(v.x, v.y, v.z, f.w, f.h, f.heat ?? 1));
      else if (f.t === 'halo') out.push(fx.halo(v.x, v.y, v.z, f.size, f.color, !!f.night));
      else if (f.t === 'smoke') out.push(...fx.smoke(v.x, v.y, v.z, f.n, f.size));
    }
  }

  function edge(view, e) {
    // Follow entity.state.depleted transitions (game modules may set either).
    const d = !!e.state?.depleted;
    if (d !== view._lastDepleted) { view._lastDepleted = d; view.setState(d ? 'depleted' : 'active'); }
  }

  // ---------------------------------------------------------------- view kinds
  function treeView(e, kind) {
    const rnd = mulberry32(hashStr(e.uid));
    const big = (e.w || 1) > 1;
    const s = (big ? 0.92 : 0.88) + rnd() * 0.24;
    const sy = s * (0.9 + rnd() * 0.22);
    const yaw = rnd() * Math.PI * 2;
    const cx = e.x + (e.w || 1) / 2, cz = e.z + (e.d || 1) / 2;
    const y = footprintMinY(e) - 0.08;
    const m = M(cx + (rnd() - 0.5) * 0.2, y, cz + (rnd() - 0.5) * 0.2, yaw, 0, 0, s, sy, s);
    const tp = pool('tree:' + kind + ':' + lod, cx, cz, () => treeGeometry(kind, lod), { capacity: 48 });
    const tint = 0.9 + rnd() * 0.16;
    const slot = tp.add(m, [tint, tint * (0.97 + rnd() * 0.06), tint]);
    const sp = pool('stump', cx, cz, () => stumpGeometry(), { capacity: 16 });
    const ss = big ? 1.4 : 1;
    const sm = M(cx, y + 0.05, cz, yaw, 0, 0, ss, ss * 0.9, ss);
    const bark = new THREE.Color(TREE_INFO[kind]?.bark || '#7a5a3c');
    const base = new THREE.Color('#7a5a3c');
    const sslot = sp.add(sm, [bark.r / base.r, bark.g / base.g, bark.b / base.b]);
    sp.setVisible(sslot, false);
    let halo = null;
    if (kind === 'tree-elder') halo = fx.halo(cx, y + 4.2 * sy, cz, 6, [0.16, 0.08, 0.26]);
    const view = {
      object3d: tp.mesh, state: 'active', entity: e,
      setState(st) {
        view.state = st;
        const dep = st === 'depleted';
        tp.setVisible(slot, !dep);
        sp.setVisible(sslot, dep);
        if (halo) fx.show(halo, !dep);
      },
      update() { edge(view, e); },
      dispose() { tp.remove(slot); sp.remove(sslot); if (halo) fx.remove(halo); },
    };
    view._lastDepleted = false;
    return view;
  }

  function rockView(e) {
    const rnd = mulberry32(hashStr(e.uid));
    const cx = e.x + 0.5, cz = e.z + 0.5;
    const y = footprintMinY(e) - 0.05;
    const s = 0.88 + rnd() * 0.22;
    const m = M(cx, y, cz, rnd() * Math.PI * 2, 0, 0, s, s * (0.85 + rnd() * 0.25), s);
    const zone = map.zoneAt(cx, cz);
    const tone = new THREE.Color(ROCK_TONE[zone] || '#a8a096');
    const rp = pool('rock:' + lod, cx, cz, () => rockGeometry(lod), { capacity: 32 });
    const slot = rp.add(m, tone);
    const tint = e.def.model?.tint || '#c4703b';
    const shiny = tint === '#3f6fd8' || tint === '#c9b8ff';
    const np = pool(shiny ? 'nugget-glow' : 'nugget', cx, cz, () => {
      const g = nuggetGeometry();
      if (shiny) { // mark nuggets as tinted-glow
        const a = g.attributes.aGlow;
        for (let i = 0; i < a.count; i++) a.setXYZW(i, 0.45, 0.45, 0.45, 1);
      }
      return g;
    }, { capacity: 16, castShadow: false });
    const nslot = np.add(m, tint);
    const dim = tone.clone().multiplyScalar(0.72);
    const view = {
      object3d: rp.mesh, state: 'active', entity: e,
      setState(st) {
        view.state = st;
        const dep = st === 'depleted';
        np.setVisible(nslot, !dep);
        rp.setColor(slot, dep ? dim : tone);
      },
      update() { edge(view, e); },
      dispose() { rp.remove(slot); np.remove(nslot); },
    };
    view._lastDepleted = false;
    return view;
  }

  function crystalView(e) {
    const rnd = mulberry32(hashStr(e.uid));
    const cx = e.x + 0.5, cz = e.z + 0.5;
    const y = footprintMinY(e) - 0.05;
    const s = 0.9 + rnd() * 0.3;
    const m = M(cx, y, cz, rnd() * Math.PI * 2, 0, 0, s);
    const cp = pool('crystal', cx, cz, () => crystalGeometry(lod), { capacity: 16 });
    const slot = cp.add(m, [1, 1, 1]);
    const halo = fx.halo(cx, y + 1.0 * s, cz, 2.4 * s, [0.12, 0.3, 0.45]);
    const view = {
      object3d: cp.mesh, state: 'active', entity: e,
      setState(st) {
        view.state = st;
        const dep = st === 'depleted';
        cp.setColor(slot, dep ? [0.3, 0.3, 0.38] : [1, 1, 1]);
        fx.color(halo, dep ? [0.02, 0.05, 0.08] : [0.12, 0.3, 0.45]);
      },
      update() { edge(view, e); },
      dispose() { cp.remove(slot); fx.remove(halo); },
    };
    view._lastDepleted = false;
    return view;
  }

  function cropView(e, kind) {
    const rnd = mulberry32(hashStr(e.uid));
    const cx = e.x + 0.5, cz = e.z + 0.5;
    const y = map.heightAt(cx, cz) - 0.03;
    const m = M(cx, y, cz, rnd() * Math.PI * 2, 0, 0, 0.95 + rnd() * 0.2, 0.9 + rnd() * 0.25, 0.95 + rnd() * 0.2);
    const cp = pool('crop:' + kind, cx, cz, () => wheatGeometry(kind), { capacity: 64, castShadow: false });
    const slot = cp.add(m, [0.94 + rnd() * 0.1, 0.94 + rnd() * 0.1, 0.94 + rnd() * 0.08]);
    const sp = pool('stubble', cx, cz, () => stubbleGeometry(), { capacity: 64, castShadow: false });
    const sslot = sp.add(m, kind === 'flax' ? [0.75, 0.95, 0.7] : [1, 1, 1]);
    sp.setVisible(sslot, false);
    const view = {
      object3d: cp.mesh, state: 'active', entity: e,
      setState(st) {
        view.state = st;
        const dep = st === 'depleted';
        cp.setVisible(slot, !dep);
        sp.setVisible(sslot, dep);
      },
      update() { edge(view, e); },
      dispose() { cp.remove(slot); sp.remove(sslot); },
    };
    view._lastDepleted = false;
    return view;
  }

  // Fishing spot: ripples (shared FX) + a fish that jumps now and then.
  const fishGeo = (() => {
    const b = new Builder(5);
    const body = new THREE.SphereGeometry(0.1, 8, 5);
    b.geo(body, M(0, 0, 0, 0, 0, 0, 0.8, 0.9, 2.6), { color: '#9fb4c7', grad: [-0.1, 0.1, 0.6, 1.2] });
    const tail = new THREE.ConeGeometry(0.09, 0.14, 4); tail.rotateX(-Math.PI / 2); tail.scale(0.25, 1, 1);
    b.geo(tail, M(0, 0, 0.3), { color: '#7f94a7', flat: true });
    return b.build();
  })();
  function fishingView(e, kind) {
    const variant = kind === 'fishing-spot-sea' ? 1 : kind === 'fishing-spot-river' ? 0.5 : 0;
    const size = variant === 1 ? 2.8 : variant === 0.5 ? 2.0 : 2.2;
    let cx = e.pos.x, cz = e.pos.z;
    const rip = fx.ripple(cx, cz, size, variant);
    const rnd = mulberry32(hashStr(e.uid));
    const fish = new THREE.Mesh(fishGeo, kit.mat);
    fish.visible = false;
    fish.scale.setScalar(variant === 1 ? 1.6 : 1);
    root.add(fish);
    let t = rnd() * 4, next = 2 + rnd() * 4, jumping = false, jx = 0, jz = 0, jyaw = 0;
    const view = {
      object3d: fish, state: 'active', entity: e,
      setState(st) { view.state = st; },
      update(dt) {
        if (e.pos.x !== cx || e.pos.z !== cz) { cx = e.pos.x; cz = e.pos.z; fx.set(rip, cx, 0.04, cz, size, 1); }
        t += dt;
        if (!jumping && t > next) {
          jumping = true; t = 0;
          const a = rnd() * Math.PI * 2;
          jx = cx + Math.cos(a) * 0.4; jz = cz + Math.sin(a) * 0.4; jyaw = a + Math.PI / 2;
          fish.visible = true;
        }
        if (jumping) {
          const k = t / 0.75;
          if (k >= 1) { jumping = false; fish.visible = false; t = 0; next = (variant === 1 ? 4 : 2.5) + rnd() * 5; return; }
          const dx = Math.cos(jyaw - Math.PI / 2) * (k - 0.5) * 0.9, dz = Math.sin(jyaw - Math.PI / 2) * (k - 0.5) * 0.9;
          fish.position.set(jx + dx, 4 * k * (1 - k) * (variant === 1 ? 0.9 : 0.6) - 0.05, jz + dz);
          fish.rotation.set(0, -jyaw, 0);
          fish.rotateX((k - 0.5) * 2.2);
        }
      },
      dispose() { fx.remove(rip); root.remove(fish); },
    };
    return view;
  }

  // Unique mesh objects (utilities, portals, stalls, nests...).
  const cachedKinds = new Set(['bank-booth', 'exchange-desk', 'furnace', 'anvil', 'range', 'spinning-wheel', 'tanning-rack', 'well', 'hopper', 'flour-bin', 'nest', 'target', 'altar-crystal', 'oracle-crystal', 'chest', 'chest-hoard', 'cave-mouth', 'cave-exit', 'stairs-down', 'stairs-up', 'lair-gate']);
  const modelCache = new Map();
  function uniqueView(e, kind) {
    let key = kind;
    if (kind === 'stall') key = 'stall:' + e.defId;
    else if (kind === 'fire') key = 'fire:' + (e.spawn?.permanent ? 'big' : 'small');
    else if (!cachedKinds.has(kind)) key = kind + ':' + e.uid;
    let model = modelCache.get(key);
    if (!model) {
      const mk = makeObjectModel(kind, e, kit);
      if (!mk) return null;
      model = {
        base: mk.base.build(),
        active: mk.active && !mk.active.isEmpty() ? mk.active.build() : null,
        depleted: mk.depleted && !mk.depleted.isEmpty() ? mk.depleted.build() : null,
        float: mk.float ? mk.float.build() : null,
        floatY: mk.floatY || 1.5,
        fx: mk.fx || [],
      };
      modelCache.set(key, model);
    }
    const cx = e.x + (e.w || 1) / 2, cz = e.z + (e.d || 1) / 2;
    const y = (kind === 'nest' || kind === 'fire') ? map.heightAt(cx, cz) : footprintMinY(e) - 0.02;
    const yaw = chooseYaw(kind, e);
    const g = new THREE.Group();
    g.position.set(cx, y, cz);
    g.rotation.y = yaw;
    const mk = (geom) => {
      const mesh = new THREE.Mesh(geom, kit.mat);
      mesh.castShadow = shadows; mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    g.updateMatrixWorld(true);
    // During world creation static bases are merged per chunk (one draw call per chunk);
    // objects created later (player fires) get their own mesh.
    let batchId = null;
    if (!started) batchId = batchAdd(cx, cz, model.base, g.matrixWorld.clone());
    else mk(model.base);
    const act = model.active ? mk(model.active) : null;
    const dep = model.depleted ? mk(model.depleted) : null;
    if (dep) dep.visible = false;
    let fl = null;
    if (model.float) { fl = mk(model.float); fl.castShadow = false; fl.position.y = model.floatY; }
    root.add(g);
    g.updateMatrixWorld(true);
    const fxh = [];
    addFx(model.fx, g.matrixWorld, fxh);
    const ph = (hashStr(e.uid) % 1000) / 160;
    const view = {
      object3d: g, state: 'active', entity: e,
      setState(st) {
        view.state = st;
        const d = st === 'depleted';
        if (act) act.visible = !d;
        if (dep) dep.visible = d;
      },
      update: fl ? (dt) => {
        edge(view, e);
        const t = ctx.time.t + ph;
        fl.position.y = model.floatY + Math.sin(t * 1.3) * 0.12;
        fl.rotation.y = t * 0.6;
      } : () => edge(view, e),
      dispose() {
        root.remove(g);
        for (const h of fxh) fx.remove(h);
        if (batchId) batchRemove(batchId);
      },
    };
    view._lastDepleted = false;
    return view;
  }

  // ---------------------------------------------------------------- chunk batches (static uniques)
  let started = false;
  let batchSeq = 0;
  const batches = new Map(); // chunk key -> { items: Map(id -> {geo, m}), mesh, dirty }
  function batchAdd(x, z, geom, m) {
    const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    let bt = batches.get(key);
    if (!bt) batches.set(key, (bt = { key, items: new Map(), mesh: null, dirty: true }));
    const id = key + '#' + batchSeq++;
    bt.items.set(id, { geom, m });
    bt.dirty = true;
    return id;
  }
  function batchRemove(id) {
    const key = id.split('#')[0];
    const bt = batches.get(key);
    if (bt && bt.items.delete(id)) bt.dirty = true;
  }
  function batchRebuild() {
    for (const bt of batches.values()) {
      if (!bt.dirty) continue;
      bt.dirty = false;
      const b = new Builder(1);
      for (const { geom, m } of bt.items.values()) b.addBuilt(geom, m);
      if (bt.mesh) { root.remove(bt.mesh); bt.mesh.geometry.dispose(); bt.mesh = null; }
      if (b.isEmpty()) continue;
      bt.mesh = new THREE.Mesh(b.build(), kit.mat);
      bt.mesh.name = 'objects:' + bt.key;
      bt.mesh.castShadow = shadows; bt.mesh.receiveShadow = true;
      root.add(bt.mesh);
    }
  }

  function create(e) {
    const kind = e.def?.model?.kind || 'box';
    let v = null;
    if (kind.startsWith('tree-')) v = treeView(e, kind);
    else if (kind === 'rock-ore') v = rockView(e);
    else if (kind === 'crystal') v = crystalView(e);
    else if (kind === 'wheat' || kind === 'flax') v = cropView(e, kind);
    else if (kind.startsWith('fishing-spot')) v = fishingView(e, kind);
    else v = uniqueView(e, kind);
    if (!v) {
      // unknown kind: a crate so nothing is invisible
      const b = new Builder(1);
      b.box(0.8, 0.8, 0.8, M(0, 0.4, 0), { tile: TILE.PLANKS, color: '#a07a50' });
      const mesh = new THREE.Mesh(b.build(), kit.mat);
      mesh.position.copy(e.pos);
      root.add(mesh);
      v = { object3d: mesh, state: 'active', entity: e, setState() {}, update() {}, dispose() { root.remove(mesh); } };
    }
    return v;
  }

  // ---------------------------------------------------------------- ground items
  const shadowGeo = new THREE.PlaneGeometry(0.7, 0.7);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: itemShadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  function createItem(e) {
    const icon = e.def?.icon || { shape: 'pouch', color: '#a0714f' };
    const g = new THREE.Group();
    const rnd = mulberry32(hashStr(String(e.uid)));
    const ox = (rnd() - 0.5) * 0.36, oz = (rnd() - 0.5) * 0.36;
    const x = e.pos.x + ox, z = e.pos.z + oz;
    const y = map.heightAt(x, z);
    g.position.set(x, y, z);
    const holder = new THREE.Group();
    g.add(holder);
    const geom = itemGeometry(icon);
    const copies = !e.def?.stack && (e.qty || 1) > 1 ? Math.min(3, e.qty) : 1;
    for (let i = 0; i < copies; i++) {
      const mesh = new THREE.Mesh(geom, kit.mat);
      mesh.castShadow = false;
      mesh.position.set(i * 0.12 - (copies - 1) * 0.06, i * 0.05, (i % 2) * 0.1);
      mesh.rotation.y = i * 0.7;
      holder.add(mesh);
    }
    holder.scale.setScalar(1.35);
    holder.rotation.y = e.yaw || rnd() * Math.PI * 2;
    const sh = new THREE.Mesh(shadowGeo, shadowMat);
    sh.position.y = 0.02;
    sh.renderOrder = 1;
    g.add(sh);
    root.add(g);
    const ph = rnd() * 6;
    const spin = 0.25 + rnd() * 0.15;
    return {
      object3d: g, state: 'active', entity: e,
      setState() {},
      update(dt) {
        const t = ctx.time.t + ph;
        holder.position.y = 0.05 + Math.sin(t * 2.0) * 0.025;
        holder.rotation.y += dt * spin;
      },
      dispose() { root.remove(g); },
    };
  }

  return {
    root,
    create,
    createItem,
    update(dt) {
      started = true;
      batchRebuild();
      kit.tick(ctx);
    },
  };
}
