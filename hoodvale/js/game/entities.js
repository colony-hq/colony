// Entity registry: every pickable thing in the world (objects, NPCs, monsters, ground items,
// the player, remote players). Owner: game builder (baseline by integration). DESIGN.md §7.
//
// Entity shape:
//   { uid, kind: 'object'|'npc'|'monster'|'item'|'player'|'remote', def, defId, name,
//     x, z (tile), w, d (footprint), pos: Vector3 (render position, ground level), yaw,
//     level?, options(): string[], examine(): string, pick: { r, h }, view (props view or actor),
//     state: {}, alive: true, moving?: { fromX, fromZ, toX, toZ } }

import * as THREE from 'three';
import { OBJECTS } from '../data/objects.js';
import { NPCS } from '../data/npcs.js';
import { MONSTERS } from '../data/monsters.js';
import { ITEMS } from '../data/items.js';

export function createEntities(ctx) {
  const { map, events } = ctx;
  const all = new Map();
  const byTile = new Map(); // "x,z" -> Set(entity) for footprint tiles (objects) / current tile (actors)
  const key = (x, z) => x + ',' + z;

  function indexAdd(e) {
    for (let z = e.z; z < e.z + (e.w ? e.d : 1); z++) for (let x = e.x; x < e.x + (e.w || 1); x++) {
      let s = byTile.get(key(x, z));
      if (!s) byTile.set(key(x, z), (s = new Set()));
      s.add(e);
    }
  }
  function indexRemove(e) {
    for (let z = e.z; z < e.z + (e.w ? e.d : 1); z++) for (let x = e.x; x < e.x + (e.w || 1); x++) byTile.get(key(x, z))?.delete(e);
  }

  const entities = {
    get(uid) { return all.get(uid); },
    all() { return all.values(); },
    byKind(kind) { return [...all.values()].filter((e) => e.kind === kind); },
    at(tx, tz) { return [...(byTile.get(key(tx, tz)) || [])]; },
    near(x, z, r) {
      const out = [];
      for (const e of all.values()) if (Math.max(Math.abs(e.x - x), Math.abs(e.z - z)) <= r) out.push(e);
      return out;
    },
    add(e) {
      e.alive = e.alive ?? true;
      e.state = e.state || {};
      e.pos = e.pos || new THREE.Vector3();
      all.set(e.uid, e);
      indexAdd(e);
      events.emit('entity:add', { entity: e });
      return e;
    },
    remove(e) {
      if (!all.has(e.uid)) return;
      all.delete(e.uid);
      indexRemove(e);
      if (e.blocks) map.unblock(e.x, e.z, e.w, e.d);
      e.view?.dispose?.();
      events.emit('entity:remove', { entity: e });
    },
    // Move an actor entity to a new tile (keeps the tile index fresh).
    moveTo(e, tx, tz) {
      indexRemove(e);
      e.x = tx; e.z = tz;
      indexAdd(e);
    },
    // Ground y at a tile centre (actors stand here).
    groundY(tx, tz) { return map.tileY(tx, tz); },
    setPosFromTile(e) {
      const cx = e.x + (e.w || 1) / 2, cz = e.z + (e.d || 1) / 2;
      e.pos = e.pos || new THREE.Vector3();
      e.pos.set(cx, map.heightAt(cx, cz), cz);
    },
    update(dt) {
      for (const e of all.values()) e.view?.update?.(dt);
    },
  };

  // ---- Objects from spawns ----
  for (const s of ctx.spawns.objects) {
    const def = OBJECTS[s.def];
    const e = {
      uid: s.uid, kind: 'object', def, defId: s.def, name: def.name, x: s.x, z: s.z, w: s.w || def.size[0], d: s.d || def.size[1], yaw: s.yaw || 0,
      spawn: s, blocks: !def.walkable,
      options: () => (e.state.depleted ? ['Examine'] : def.options),
      examine: () => def.examine,
      pick: { r: Math.max(0.6, (def.size[0] * 0.5)), h: s.def.startsWith('tree') ? 4.5 : 1.6 },
    };
    entities.setPosFromTile(e);
    if (e.blocks) map.block(e.x, e.z, e.w, e.d);
    try { e.view = ctx.objectViews?.create?.(e) || null; } catch (err) { console.error('[entities] object view', s.def, err); }
    entities.add(e);
  }

  // ---- NPCs ----
  for (const s of ctx.spawns.npcs) {
    const def = NPCS[s.def];
    const e = {
      uid: s.uid, kind: 'npc', def, defId: s.def, name: def.name, x: s.x, z: s.z, w: 1, d: 1, yaw: def.yaw || 0,
      home: { x: s.x, z: s.z },
      options: () => def.options,
      examine: () => def.examine,
      pick: { r: 0.45, h: 1.9 },
    };
    entities.setPosFromTile(e);
    try { e.view = ctx.actors?.create?.(def.look?.body === 'oracle' ? { kind: 'oracle' } : { kind: 'humanoid', look: def.look, npc: true }) || null; } catch (err) { console.error('[entities] npc actor', s.def, err); }
    entities.add(e);
  }

  // ---- Monsters ----
  for (const s of ctx.spawns.monsters) {
    const def = MONSTERS[s.def];
    const e = {
      uid: s.uid, kind: 'monster', def, defId: s.def, name: def.name, level: def.level, x: s.x, z: s.z, w: 1, d: 1, yaw: 0,
      home: { x: s.x, z: s.z },
      hp: def.hp, maxHp: def.hp,
      options: () => ['Attack', 'Examine'],
      examine: () => def.examine,
      pick: { r: 0.5 * (def.model?.scale || 1) * (def.size || 1), h: 1.6 * (def.model?.scale || 1) },
    };
    entities.setPosFromTile(e);
    try { e.view = ctx.actors?.create?.({ kind: 'creature', model: def.model, monster: def.id }) || null; } catch (err) { console.error('[entities] monster actor', s.def, err); }
    entities.add(e);
  }

  // Ground items helper (loot module owns the logic; this keeps the shape consistent).
  entities.spawnItem = (id, qty, tx, tz, { owner = null, ticks = 200 } = {}) => {
    const def = ITEMS[id];
    const e = {
      uid: 'g' + Math.random().toString(36).slice(2, 9), kind: 'item', def, defId: id, name: def.name, qty, x: tx, z: tz, w: 1, d: 1, yaw: Math.random() * 6.28,
      owner, expires: ctx.ticks.count + ticks,
      options: () => ['Take', 'Examine'],
      examine: () => def.examine,
      pick: { r: 0.35, h: 0.4 },
    };
    entities.setPosFromTile(e);
    try { e.view = ctx.objectViews?.createItem?.(e) || null; } catch (err) { console.error('[entities] item view', id, err); }
    return entities.add(e);
  };

  // Baseline idle wandering for NPCs and monsters (combat/AI modules may take over a monster by
  // setting e.state.busy = true).
  ctx.ticks.on((n) => {
    for (const e of all.values()) {
      if ((e.kind !== 'npc' && e.kind !== 'monster') || !e.alive || e.state.busy) continue;
      const radius = e.kind === 'npc' ? e.def.wander || 0 : e.def.wander || 0;
      if (!radius || Math.random() > 0.12) continue;
      const tx = e.home.x + Math.round((Math.random() * 2 - 1) * radius);
      const tz = e.home.z + Math.round((Math.random() * 2 - 1) * radius);
      if (!map.isWalkable(tx, tz)) continue;
      const path = map.findPath(e.x, e.z, { x: tx, z: tz, closest: false }, { maxNodes: 300 });
      if (path && path.length) e.path = path.slice(0, 6);
    }
    for (const e of all.values()) {
      if (!e.path?.length || !e.alive) continue;
      const step = e.path.shift();
      if (!map.isWalkable(step.x, step.z)) { e.path = null; continue; }
      e.moving = { fromX: e.x, fromZ: e.z, toX: step.x, toZ: step.z, t0: ctx.ticks.count };
      e.yaw = Math.atan2(-(step.x - e.x), -(step.z - e.z));
      entities.moveTo(e, step.x, step.z);
    }
  }, 20);

  // Interpolate actor positions between ticks.
  const baseUpdate = entities.update;
  entities.update = (dt) => {
    const a = ctx.ticks.alpha;
    for (const e of all.values()) {
      if (e.kind !== 'npc' && e.kind !== 'monster') continue;
      if (e.moving) {
        const done = ctx.ticks.count > e.moving.t0;
        const k = done ? 1 : a;
        const x = e.moving.fromX + (e.moving.toX - e.moving.fromX) * k + 0.5;
        const z = e.moving.fromZ + (e.moving.toZ - e.moving.fromZ) * k + 0.5;
        e.pos.set(x, map.heightAt(x, z), z);
        if (done && !e.path?.length) e.moving = null;
      }
      const v = e.view;
      if (v) {
        v.setPosition?.(e.pos.x, e.pos.y, e.pos.z);
        v.setYaw?.(e.yaw);
        if (!e.state.anim) v.play?.(e.moving ? 'walk' : 'idle');
      }
    }
    baseUpdate(dt);
  };

  return entities;
}
