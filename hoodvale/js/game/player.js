// The local player: tile movement on ticks (walk 1 tile, run 2), interpolated rendering,
// walking to interactions, teleports. Owner: game builder (baseline by integration).
// API (DESIGN.md §7): entity, actor, x, z, pos, yaw, running, walkTo(tx, tz), walkToEntity(e, goal,
// onArrive), stop(), teleport(tx, tz), face(entityOrTile), setAnim(name|null), hp/maxHp.

import * as THREE from 'three';

export function createPlayer(ctx) {
  const { map, state, events, entities } = ctx;
  const pos = new THREE.Vector3();
  let path = [];
  let onArrive = null;
  let arriveGoal = null;
  let moving = null; // { from: [x,z], to: [x,z], via?: [x,z], t0 }
  let anim = null; // forced action animation (chop, mine, ...)

  const entity = {
    uid: 'player', kind: 'player', name: state.save.name, x: 0, z: 0, w: 1, d: 1, yaw: 0, pos,
    options: () => [], examine: () => 'That\'s you.', pick: { r: 0.4, h: 1.8 }, state: {}, alive: true,
  };

  const player = {
    entity,
    actor: null,
    get x() { return entity.x; },
    get z() { return entity.z; },
    pos,
    get yaw() { return entity.yaw; },
    get running() { return state.save.run.on && state.save.run.energy > 0; },
    get moving() { return !!path.length || !!moving; },
    get hp() { return state.save.hp; },
    get maxHp() { return ctx.skills ? ctx.skills.level('hitpoints') : 10; },

    // Player-issued walk (click on the ground): cancels any action.
    walkTo(tx, tz) {
      ctx.actions?.cancel();
      return setPath({ x: tx, z: tz }, null);
    },
    // Used by actions: walk until the goal is satisfied, then call cb.
    walkToEntity(e, goal, cb) {
      const g = { x: e.x, z: e.z, w: e.w || 1, d: e.d || 1, ...(goal || { adjacent: true }) };
      if (g.onTile) { g.adjacent = false; }
      return setPath(g, cb);
    },
    stop() { path = []; onArrive = null; arriveGoal = null; },
    teleport(tx, tz) {
      player.stop();
      moving = null;
      entities.moveTo(entity, tx, tz);
      const cx = tx + 0.5, cz = tz + 0.5;
      pos.set(cx, map.heightAt(cx, cz), cz);
      state.save.pos = { x: tx + 0.5, z: tz + 0.5 };
      state.markDirty();
      events.emit('player:teleport', { x: tx, z: tz, region: map.regionAt(cx, cz).id });
    },
    face(target) {
      const tx = (target.x ?? 0) + (target.w || 1) / 2 - 0.5, tz = (target.z ?? 0) + (target.d || 1) / 2 - 0.5;
      if (tx === entity.x && tz === entity.z) return;
      entity.yaw = Math.atan2(-(tx - entity.x), -(tz - entity.z));
    },
    setAnim(name) { anim = name; },
    toggleRun(on = !state.save.run.on) { state.save.run.on = on; state.markDirty(); events.emit('run:change', { on }); },
    update(dt) {
      // Interpolate between tick positions.
      if (moving) {
        const a = ctx.ticks.count > moving.t0 ? 1 : ctx.ticks.alpha;
        let x, z;
        if (moving.via) {
          const [ax, az] = a < 0.5 ? moving.from : moving.via;
          const [bx, bz] = a < 0.5 ? moving.via : moving.to;
          const k = a < 0.5 ? a * 2 : (a - 0.5) * 2;
          x = ax + (bx - ax) * k; z = az + (bz - az) * k;
        } else {
          x = moving.from[0] + (moving.to[0] - moving.from[0]) * a;
          z = moving.from[1] + (moving.to[1] - moving.from[1]) * a;
        }
        pos.set(x + 0.5, map.heightAt(x + 0.5, z + 0.5), z + 0.5);
        if (a >= 1 && !path.length) moving = null;
      }
      const v = player.actor;
      if (v) {
        v.setPosition?.(pos.x, pos.y, pos.z);
        v.setYaw?.(entity.yaw);
        v.play?.(anim || (moving ? (moving.via ? 'run' : 'walk') : 'idle'));
      }
    },
  };

  function setPath(goal, cb) {
    const p = map.findPath(entity.x, entity.z, goal);
    arriveGoal = goal;
    onArrive = cb;
    if (!p) { events.emit('chat:game', { text: "I can't reach that.", kind: 'warn' }); onArrive = null; return false; }
    path = p;
    anim = null;
    if (!path.length) { const f = onArrive; onArrive = null; f?.(); }
    events.emit('player:path', { steps: path.length, goal });
    return true;
  }

  // Movement on ticks (priority 10).
  ctx.ticks.on(() => {
    if (!path.length) return;
    const run = player.running && path.length > 1;
    const from = [entity.x, entity.z];
    let via = null;
    let next = path.shift();
    if (!map.isWalkable(next.x, next.z)) { // something moved into the way: re-path
      const p = map.findPath(entity.x, entity.z, arriveGoal);
      path = p || [];
      return;
    }
    if (run && path.length) { via = [next.x, next.z]; next = path.shift(); }
    entity.yaw = Math.atan2(-(next.x - entity.x), -(next.z - entity.z));
    entities.moveTo(entity, next.x, next.z);
    moving = { from, via, to: [next.x, next.z], t0: ctx.ticks.count };
    state.save.pos = { x: next.x + 0.5, z: next.z + 0.5 };
    state.save.stats.steps += via ? 2 : 1;
    if (via) state.save.run.energy = Math.max(0, state.save.run.energy - 0.6);
    state.markDirty();
    events.emit('player:move', { x: next.x, z: next.z });
    if (!path.length) {
      const f = onArrive;
      onArrive = null;
      f?.();
      events.emit('player:arrive', { x: next.x, z: next.z });
    }
  }, 10);
  // Run energy regenerates while not running.
  ctx.ticks.on(() => {
    if (!moving || !moving.via) state.save.run.energy = Math.min(100, state.save.run.energy + 0.45);
  }, 90);

  // Spawn into the world when play starts (or the save is replaced).
  const spawn = () => {
    entity.name = state.save.name;
    const p = state.save.pos;
    let tx = Math.floor(p.x), tz = Math.floor(p.z);
    if (!map.isWalkable(tx, tz)) { const w = map.nearestWalkable(tx, tz, 8); if (w) { tx = w.x; tz = w.z; } }
    if (!player.actor) {
      try { player.actor = ctx.actors?.create?.({ kind: 'humanoid', look: state.save.look, player: true }) || null; } catch (err) { console.error(err); }
    } else player.actor.setLook?.(state.save.look);
    entity.view = player.actor;
    player.actor?.setEquipment?.(state.save.equipment);
    player.teleport(tx, tz);
  };
  entities.add(entity);
  events.on('save:loaded', spawn);
  events.on('game:start', spawn);
  events.on('equipment:change', () => player.actor?.setEquipment?.(state.save.equipment));
  return player;
}
