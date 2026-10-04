// Entity registry: every pickable thing in the world (objects, NPCs, monsters, ground items,
// the player, remote players). Owner: game builder. DESIGN.md §7.
//
// Entity shape:
//   { uid, kind: 'object'|'npc'|'monster'|'item'|'player'|'remote', def, defId, name,
//     x, z (tile; NW corner of the footprint), w, d (footprint), pos: Vector3 (render position,
//     ground level, footprint centre), yaw, level?, options(): string[], examine(): string,
//     pick: { r, h }, view (props view or actor), state: {}, alive: true, hidden?: bool,
//     moving?: { fromX, fromZ, toX, toZ, t0 }, path?: [{x, z}] }
//   Monsters add: hp, maxHp, home {x, z}, ai (combat module), temporary (summons), size = w = d.
//   Objects add: spawn (data/spawns.js record: to, label, requires, text, permanent...), blocks,
//                state.depleted. Items add: qty, owner, publicAt, expires.
//
// API: get, all, byKind, at(tx, tz), near(x, z, r), add, remove, moveTo, groundY, setPosFromTile,
//      spawnItem(id, qty, tx, tz, opts), addObject(defId, tx, tz, extra), spawnMonster(defId, tx,
//      tz, opts), relocate(e, tx, tz), setDepleted(e, on), playOnce(e, anim, seconds), update(dt).
// Events: entity:add/remove {entity}, entity:death {entity} (emitted by combat),
//         object:deplete {entity}, object:respawn {entity}.

import * as THREE from 'three';
import { OBJECTS } from '../data/objects.js';
import { NPCS } from '../data/npcs.js';
import { MONSTERS } from '../data/monsters.js';
import { ITEMS } from '../data/items.js';

const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU + Math.PI) % TAU - Math.PI;
const DEPLETED_NAMES = { stump: 'Tree stump', 'rock-empty': 'Rocks', 'crystal-dim': 'Dim crystal', 'stall-empty': 'Empty stall', stubble: 'Stubble', 'nest-empty': 'Empty nest' };

export function createEntities(ctx) {
  const { map, events } = ctx;
  const all = new Map();
  const byTile = new Map(); // "x,z" -> Set(entity) for footprint tiles
  const key = (x, z) => x + ',' + z;
  let uidSeq = 0;

  function indexAdd(e) {
    const w = e.w || 1, d = e.d || 1;
    for (let z = e.z; z < e.z + d; z++) for (let x = e.x; x < e.x + w; x++) {
      let s = byTile.get(key(x, z));
      if (!s) byTile.set(key(x, z), (s = new Set()));
      s.add(e);
    }
  }
  function indexRemove(e) {
    const w = e.w || 1, d = e.d || 1;
    for (let z = e.z; z < e.z + d; z++) for (let x = e.x; x < e.x + w; x++) byTile.get(key(x, z))?.delete(e);
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
      try { e.view?.dispose?.(); } catch (err) { console.error('[entities] dispose', err); }
      events.emit('entity:remove', { entity: e });
    },
    // Move an entity to a new tile (keeps the tile index fresh).
    moveTo(e, tx, tz) {
      indexRemove(e);
      e.x = tx; e.z = tz;
      indexAdd(e);
    },
    groundY(tx, tz) { return map.tileY(tx, tz); },
    setPosFromTile(e) {
      const cx = e.x + (e.w || 1) / 2, cz = e.z + (e.d || 1) / 2;
      e.pos = e.pos || new THREE.Vector3();
      e.pos.set(cx, map.heightAt(cx, cz), cz);
    },
    // Teleport an entity to a tile and rebuild its view (fishing spots moving along the shore).
    relocate(e, tx, tz) {
      if (e.blocks) map.unblock(e.x, e.z, e.w, e.d);
      entities.moveTo(e, tx, tz);
      if (e.blocks) map.block(e.x, e.z, e.w, e.d);
      entities.setPosFromTile(e);
      e.moving = null; e.path = null;
      if (e.kind === 'object') {
        try { e.view?.dispose?.(); } catch { /* ignore */ }
        try { e.view = ctx.objectViews?.create?.(e) || null; } catch (err) { console.error('[entities] relocate view', err); e.view = null; }
        if (e.state.depleted) e.view?.setState?.('depleted');
      }
      events.emit('entity:move', { entity: e, x: tx, z: tz });
    },
    // Resource objects: depleted (stump, empty rock...) or active again.
    setDepleted(e, on) {
      e.state.depleted = !!on;
      e.name = on ? DEPLETED_NAMES[e.def.depleted] || e.def.name : e.def.name;
      try { e.view?.setState?.(on ? 'depleted' : 'active'); } catch (err) { console.error('[entities] setState', err); }
      events.emit(on ? 'object:deplete' : 'object:respawn', { entity: e });
    },
    playOnce(e, anim, seconds = 0.6) {
      e.animUntil = ctx.time.t + seconds;
      e.onceAnim = anim;
      try { e.view?.play?.(anim, { once: true }); } catch { /* ignore */ }
    },
    update(dt) {
      for (const e of all.values()) e.view?.update?.(dt);
    },
  };

  // ---- Objects ----
  function makeObject(s) {
    const def = OBJECTS[s.def];
    const e = {
      uid: s.uid, kind: 'object', def, defId: s.def, name: def.name, x: s.x, z: s.z, w: s.w || def.size[0], d: s.d || def.size[1], yaw: s.yaw || 0,
      spawn: s, blocks: !def.walkable, state: {},
      options: () => (e.state.depleted ? ['Examine'] : def.options),
      examine: () => (e.state.depleted ? depletedExamine(def) : def.examine),
      pick: { r: Math.max(0.6, def.size[0] * 0.5), h: s.def.startsWith('tree') ? 4.5 : def.model?.kind?.startsWith('fishing') ? 0.6 : 1.6 },
    };
    entities.setPosFromTile(e);
    if (e.blocks) map.block(e.x, e.z, e.w, e.d);
    try { e.view = ctx.objectViews?.create?.(e) || null; } catch (err) { console.error('[entities] object view', s.def, err); }
    return e;
  }
  for (const s of ctx.spawns.objects) entities.add(makeObject(s));

  // Add a world object at runtime (fires). extra lands on the spawn record (permanent, ...).
  entities.addObject = (defId, tx, tz, extra = {}) => {
    const def = OBJECTS[defId];
    if (!def) throw new Error('unknown object ' + defId);
    const s = { uid: `o:${defId}:${++uidSeq}`, def: defId, x: tx, z: tz, w: def.size[0], d: def.size[1], yaw: extra.yaw ?? 0, ...extra };
    return entities.add(makeObject(s));
  };

  // ---- NPCs ----
  for (const s of ctx.spawns.npcs) {
    const def = NPCS[s.def];
    const e = {
      uid: s.uid, kind: 'npc', def, defId: s.def, name: def.name, x: s.x, z: s.z, w: 1, d: 1, yaw: def.yaw || 0, renderYaw: def.yaw || 0,
      home: { x: s.x, z: s.z }, homeIndoor: map.isIndoor(s.x, s.z), state: {},
      options: () => def.options,
      examine: () => def.examine,
      pick: { r: 0.45, h: 1.9 * (def.look?.scale || 1) },
    };
    entities.setPosFromTile(e);
    try { e.view = ctx.actors?.create?.(def.look?.body === 'oracle' ? { kind: 'oracle', npc: def.id } : { kind: 'humanoid', look: def.look, npc: true }) || null; } catch (err) { console.error('[entities] npc actor', s.def, err); }
    entities.add(e);
  }

  // ---- Monsters ----
  function makeMonster(defId, x, z, { uid = null, temporary = false, home = null } = {}) {
    const def = MONSTERS[defId];
    const size = def.size || 1;
    const opts = defId === 'cow' ? ['Attack', 'Milk', 'Examine'] : ['Attack', 'Examine'];
    const e = {
      uid: uid || `m:${defId}:${++uidSeq}`, kind: 'monster', def, defId, name: def.name, level: def.level, x, z, w: size, d: size, size, yaw: Math.random() * TAU,
      home: home || { x, z }, homeIndoor: map.isIndoor(x, z), temporary, state: {},
      hp: def.hp, maxHp: def.hp, boss: !!def.boss,
      options: () => opts,
      examine: () => def.examine,
      pick: { r: Math.max(0.45, 0.5 * (def.model?.scale || 1) * Math.sqrt(size)), h: 1.6 * (def.model?.scale || 1) },
    };
    e.renderYaw = e.yaw;
    entities.setPosFromTile(e);
    try { e.view = ctx.actors?.create?.({ kind: 'creature', model: def.model, monster: def.id }) || null; } catch (err) { console.error('[entities] monster actor', defId, err); }
    return e;
  }
  for (const s of ctx.spawns.monsters) entities.add(makeMonster(s.def, s.x, s.z, { uid: s.uid }));
  entities.spawnMonster = (defId, tx, tz, opts = {}) => entities.add(makeMonster(defId, tx, tz, opts));

  // ---- Ground items (the loot module owns the rules; this keeps the shape consistent) ----
  entities.spawnItem = (id, qty, tx, tz, { owner = null, ticks = 300, privateTicks = 60 } = {}) => {
    const def = ITEMS[id];
    if (!def) throw new Error('unknown item ' + id);
    const e = {
      uid: 'g' + (++uidSeq) + Math.random().toString(36).slice(2, 6), kind: 'item', def, defId: id, name: def.name, qty, x: tx, z: tz, w: 1, d: 1, yaw: Math.random() * TAU,
      owner, publicAt: ctx.ticks.count + (owner ? privateTicks : 0), expires: ctx.ticks.count + ticks, state: {},
      options: () => ['Take', 'Examine'],
      examine: () => def.examine,
      pick: { r: 0.35, h: 0.4 },
    };
    entities.setPosFromTile(e);
    try { e.view = ctx.objectViews?.createItem?.(e) || null; } catch (err) { console.error('[entities] item view', id, err); }
    return entities.add(e);
  };

  // ---- Idle wandering for NPCs and idle monsters (respects buildings: indoor stays indoor) ----
  const occupiedByActor = (x, z, self) => {
    for (const o of entities.at(x, z)) if (o !== self && (o.kind === 'npc' || o.kind === 'monster') && o.alive) return true;
    return false;
  };
  ctx.ticks.on((n) => {
    for (const e of all.values()) {
      if ((e.kind !== 'npc' && e.kind !== 'monster') || !e.alive || e.hidden) continue;
      if (e.kind === 'monster' && e.ai && e.ai.mode !== 'idle') continue; // combat AI owns it
      if (e.state.busy || (e.state.holdUntil && e.state.holdUntil > n)) { if (e.kind === 'npc') e.path = null; continue; }
      const radius = e.def?.wander || 0;
      if (!radius || !e.home || e.path?.length || Math.random() > 0.1) continue;
      const tx = e.home.x + Math.round((Math.random() * 2 - 1) * radius);
      const tz = e.home.z + Math.round((Math.random() * 2 - 1) * radius);
      if (!map.isWalkable(tx, tz) || map.isIndoor(tx, tz) !== e.homeIndoor) continue;
      if (map.regionAt(tx + 0.5, tz + 0.5) !== map.regionAt(e.x + 0.5, e.z + 0.5)) continue;
      if (occupiedByActor(tx, tz, e)) continue;
      const path = map.findPath(e.x, e.z, { x: tx, z: tz, closest: false }, { maxNodes: 400 });
      if (!path || !path.length || path.length > radius * 3) continue;
      if (path.some((p) => map.isIndoor(p.x, p.z) !== e.homeIndoor)) continue;
      e.path = path.slice(0, 8);
    }
    for (const e of all.values()) stepEntity(e, n);
  }, 20);

  // One path step per tick for NPCs/monsters (the combat AI fills e.path for chasing monsters).
  function stepEntity(e, n) {
    if (!e.path?.length || !e.alive || e.hidden) return;
    if (e.state.holdUntil && e.state.holdUntil > n && e.kind === 'npc') { e.path = null; return; }
    const step = e.path.shift();
    if (!map.canStep(e.x, e.z, step.x, step.z)) { e.path = null; return; }
    e.moving = { fromX: e.x, fromZ: e.z, toX: step.x, toZ: step.z, t0: n };
    e.yaw = Math.atan2(-(step.x - e.x), -(step.z - e.z));
    entities.moveTo(e, step.x, step.z);
  }

  // Interpolate actor positions between ticks; smooth turning; idle/walk animations.
  const baseUpdate = entities.update;
  entities.update = (dt) => {
    const a = ctx.ticks.alpha;
    const t = ctx.time.t;
    const turnK = 1 - Math.exp(-10 * dt);
    for (const e of all.values()) {
      if (e.kind !== 'npc' && e.kind !== 'monster') continue;
      const half = (e.w || 1) / 2;
      if (e.moving) {
        const done = ctx.ticks.count > e.moving.t0;
        const k = done ? 1 : a;
        const x = e.moving.fromX + (e.moving.toX - e.moving.fromX) * k + half;
        const z = e.moving.fromZ + (e.moving.toZ - e.moving.fromZ) * k + half;
        e.pos.set(x, map.heightAt(x, z), z);
        if (done && !e.path?.length) e.moving = null;
      }
      const diff = wrap(e.yaw - (e.renderYaw ?? e.yaw));
      e.renderYaw = Math.abs(diff) < 0.002 ? e.yaw : (e.renderYaw ?? e.yaw) + diff * turnK;
      const v = e.view;
      if (v) {
        v.setPosition?.(e.pos.x, e.pos.y, e.pos.z);
        v.setYaw?.(e.renderYaw);
        if (e.dying || e.hidden) continue;
        if (e.state.anim) v.play?.(e.state.anim);
        else if (e.moving) v.play?.('walk');
        else if (e.animUntil && t < e.animUntil) { /* one-shot playing */ }
        else v.play?.('idle');
      }
    }
    baseUpdate(dt);
  };

  // NPCs stand still and face you while you talk to them.
  const talking = new Set();
  events.on('dialogue:open', ({ npcId, uid, entity } = {}) => {
    const p = ctx.player;
    let best = entity?.kind === 'npc' && all.has(entity.uid) ? entity : null, bd = best ? 0 : Infinity;
    for (const e of best ? [] : all.values()) {
      if (e.kind !== 'npc' || (uid ? e.uid !== uid : e.defId !== npcId)) continue;
      const d = p ? Math.max(Math.abs(e.x - p.x), Math.abs(e.z - p.z)) : 0;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    if (!talking.has(best)) best.state.busyBeforeTalk = !!best.state.busy;
    best.state.busy = true;
    best.path = null;
    talking.add(best);
    if (p) { const dx = p.x - best.x, dz = p.z - best.z; if (dx || dz) best.yaw = Math.atan2(-dx, -dz); }
  });
  events.on('dialogue:close', () => {
    for (const e of talking) { e.state.busy = !!e.state.busyBeforeTalk; e.state.holdUntil = ctx.ticks.count + 4; }
    talking.clear();
  });

  return entities;
}

function depletedExamine(def) {
  switch (def.depleted) {
    case 'stump': return 'Somebody chopped this one down. It will grow back.';
    case 'rock-empty': return 'There is no ore left in this rock right now.';
    case 'crystal-dim': return 'The crystal is dim. It is thinking about something else.';
    case 'stall-empty': return 'Nothing left to take. For now.';
    case 'stubble': return 'Already picked. It will grow back.';
    case 'nest-empty': return 'An empty nest.';
    default: return def.examine;
  }
}
