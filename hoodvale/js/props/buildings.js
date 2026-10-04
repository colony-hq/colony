// Every building in data/buildings.js: walls on the footprint perimeter with door openings at the
// door tiles, interiors and furniture, roofs and upper walls that fade out while the player stands
// inside the footprint (RuneScape roof hiding), windows that glow warm at night, signboards,
// chimney smoke, the windmill's turning sails and the Orbio Spire's floating rings.
// Owner: props builder. API: createBuildings(ctx) -> { group, entries, update(dt) }.
//
// Static geometry of all buildings in a 32-tile cell is merged into one mesh (one draw call);
// each building's roof/upper part is its own mesh with a fading (alpha-hashed) material.

import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings.js';
import { getKit, Builder } from './kit.js';
import { getFx } from './fx.js';
import { BKit } from './b-core.js';
import { buildStyle } from './b-styles.js';

const CELL = 32;

export function createBuildings(ctx) {
  const t0 = performance.now();
  const kit = getKit(ctx);
  const fx = getFx(ctx, kit);
  const group = new THREE.Group();
  group.name = 'buildings';
  ctx.scene.add(group);
  const shadows = !!ctx.engine?.preset?.shadows;
  const FAR = Math.max(180, (ctx.engine?.preset?.drawDistance || 480) * 0.7);

  const cells = new Map();
  const entries = [];
  const anims = [];

  for (const b of BUILDINGS) {
    let K;
    try {
      K = new BKit(b, kit, ctx);
      buildStyle(K);
    } catch (err) {
      console.error('[buildings] failed to build', b.id, err);
      continue;
    }
    const key = `${Math.floor(K.cx / CELL)},${Math.floor(K.cz / CELL)}`;
    let cell = cells.get(key);
    if (!cell) cells.set(key, (cell = new Builder(1)));
    cell.merge(K.S);

    const entry = { b, mesh: null, mat: null, op: 1, fxFade: [], anims: [] };
    if (!K.R.isEmpty()) {
      entry.mat = kit.fadeMaterial('roof:' + b.id);
      entry.mesh = new THREE.Mesh(K.R.build(), entry.mat);
      entry.mesh.name = 'roof:' + b.id;
      entry.mesh.castShadow = shadows;
      entry.mesh.receiveShadow = true;
      group.add(entry.mesh);
      entry.near = true;
    }
    if (!K.I.isEmpty()) {
      const im = new THREE.Mesh(K.I.build(), kit.mat);
      im.name = 'interior:' + b.id;
      im.castShadow = shadows;
      im.receiveShadow = true;
      group.add(im);
      kit.cull(im, 38, { shadowDist: 30, cast: shadows });
    }
    // effects
    for (const f of K.fx) {
      let h = null;
      if (f.t === 'flame') h = fx.flame(f.p[0], f.p[1], f.p[2], f.w, f.h, f.heat ?? 1);
      else if (f.t === 'halo') h = fx.halo(f.p[0], f.p[1], f.p[2], f.size, f.color, !!f.night);
      else if (f.t === 'smoke') { const hs = fx.smoke(f.p[0], f.p[1], f.p[2], f.n, f.size); if (hs.length) entry.fxFade.push(...hs); continue; }
      if (h && (f.fade || f.p[1] > K.fy + K.cut + 0.2)) entry.fxFade.push(h);
    }
    // animated parts (windmill sails, spire rings)
    for (const a of K.anims || []) {
      const holder = new THREE.Group();
      holder.position.copy(a.pos);
      holder.rotation.y = a.yaw || 0;
      const mesh = new THREE.Mesh(a.builder.build(), a.fade && entry.mat ? entry.mat : kit.mat);
      mesh.castShadow = shadows;
      holder.add(mesh);
      group.add(holder);
      const an = { holder, mesh, spin: a.spin || 0, axis: a.axis || 'z', bob: a.bob || 0, y0: a.pos.y, fade: !!a.fade };
      anims.push(an);
      entry.anims.push(an);
    }
    // furniture tiles block movement
    entry.blocked = [...K.blocked].concat((K.extBlocks || []).map(([x, z]) => x + ',' + z));
    for (const k of K.blocked) {
      const [x, z] = k.split(',').map(Number);
      ctx.map.block(x, z);
    }
    entries.push(entry);
  }

  for (const [key, cell] of cells) {
    if (cell.isEmpty()) continue;
    const mesh = new THREE.Mesh(cell.build(), kit.mat);
    mesh.name = 'buildings:' + key;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    group.add(mesh);
    kit.cull(mesh, FAR, { shadowDist: 60, cast: shadows });
  }

  const camPos = new THREE.Vector3();
  function insideOf(b) {
    const p = ctx.player;
    if (!p) return false;
    const x = p.pos?.x ?? p.x + 0.5, z = p.pos?.z ?? p.z + 0.5;
    if (Math.abs(x - (b.x + b.w / 2)) > b.w / 2 + 0.05 || Math.abs(z - (b.z + b.d / 2)) > b.d / 2 + 0.05) return false;
    const reg = ctx.map.regionAt(x, z);
    return reg.id === 'overworld';
  }

  kit.timings = { ...(kit.timings || {}), buildings: Math.round(performance.now() - t0) };
  return {
    group,
    entries,
    // building the player is inside (or null)
    get inside() { return entries.find((e) => e.op < 0.5)?.b || null; },
    update(dt) {
      kit.tick(ctx);
      const t = ctx.time.t;
      const checkDist = ctx.time.frame % 3 === 0 && ctx.camera;
      if (checkDist) ctx.camera.getWorldPosition(camPos);
      const lim = Math.min(FAR, (ctx.scene.fog?.far ?? Infinity) + 8);
      for (const e of entries) {
        if (checkDist && e.mesh) {
          const bs = e.mesh.geometry.boundingSphere;
          const near = bs.center.distanceTo(camPos) - bs.radius <= lim;
          if (near !== e.near) { e.near = near; e.mesh.visible = near && e.op > 0.02; }
        }
        const target = insideOf(e.b) ? 0 : 1;
        if (e.op === target) continue;
        e.op = target > e.op ? Math.min(1, e.op + dt * 3.5) : Math.max(0, e.op - dt * 3.5);
        const vis = e.op > 0.02;
        if (e.mat) {
          e.mat.opacity = e.op;
          e.mesh.visible = vis && e.near;
        }
        for (const h of e.fxFade) fx.show(h, vis);
        for (const a of e.anims) if (a.fade) a.holder.visible = vis;
      }
      for (const a of anims) {
        if (!a.holder.visible) continue;
        if (a.axis === 'z') a.mesh.rotation.z = t * a.spin;
        else a.mesh.rotation.y = t * a.spin;
        if (a.bob) a.holder.position.y = a.y0 + Math.sin(t * 0.8) * a.bob;
      }
    },
  };
}
