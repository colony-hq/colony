// The local player: tile movement on ticks (walk 1 tile, run 2), interpolated rendering with
// smooth turning, walking to interactions, teleports, run energy, stuns. Owner: game builder.
// API (DESIGN.md §7): entity, actor, x, z, pos, yaw, running, moving, hp/maxHp, walkTo(tx, tz,
// opts), walkToEntity(e, goal, onArrive), stop(), teleport(tx, tz), face(entityOrTile),
// setAnim(name|null), playOnce(name, seconds), toggleRun(on?), stun(ticks), stunned, region.
// WASD walks tile by tile relative to the camera (8 directions, slides along walls, runs when
// run is on); it cancels actions like a ground click does.
// Events: player:move {x, z}, player:arrive {x, z}, player:teleport {x, z, region},
//         player:path {steps, goal}, player:click {x, z, kind: 'walk'|'action'} (UI draws yellow /
//         red crosses), player:stun {ticks}, run:change {on}, region:enter {region}.

import * as THREE from 'three';

const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU + Math.PI) % TAU - Math.PI;

export function createPlayer(ctx) {
  const { map, state, events, entities } = ctx;
  const pos = new THREE.Vector3();
  let path = [];
  let onArrive = null;
  let arriveGoal = null;
  let moving = null; // { from: [x,z], to: [x,z], via?: [x,z], t0 }
  let anim = null; // forced action animation (chop, mine, ...)
  let animOpts = null; // e.g. { tool: 'iron_axe' } for the actor's tool prop
  let onceAnim = null, onceUntil = 0; // short one-shot animation (attack, eat, ...)
  let renderYaw = 0;
  let stunnedUntil = 0;
  let lastRegion = null;
  let keyWalking = false; // the current path came from WASD

  const entity = {
    uid: 'player', kind: 'player', name: state.save.name, x: 0, z: 0, w: 1, d: 1, yaw: 0, pos,
    options: () => [], examine: () => 'That\'s you.', pick: { r: 0.4, h: 1.8 }, state: {}, alive: true,
    get hp() { return state.save.hp; },
    get maxHp() { return ctx.skills ? ctx.skills.level('hitpoints') : 10; },
    get level() { return ctx.skills?.combatLevel?.() || 3; },
  };

  const player = {
    entity,
    actor: null,
    get x() { return entity.x; },
    get z() { return entity.z; },
    pos,
    get yaw() { return entity.yaw; },
    get renderYaw() { return renderYaw; },
    get running() { return state.save.run.on && state.save.run.energy >= 1; },
    get moving() { return !!path.length || !!moving; },
    get hp() { return state.save.hp; },
    get maxHp() { return ctx.skills ? ctx.skills.level('hitpoints') : 10; },
    get stunned() { return ctx.ticks.count < stunnedUntil; },
    get region() { return map.regionAt(entity.x + 0.5, entity.z + 0.5).id; },
    get path() { return path; },

    // Player-issued walk (click on the ground): cancels any action unless opts.cancel === false.
    walkTo(tx, tz, { cancel = true, marker = true } = {}) {
      if (state.mode === 'dead') return false;
      keyWalking = false;
      if (player.stunned) { events.emit('chat:game', { text: "You're stunned!", kind: 'warn' }); return false; }
      if (cancel) ctx.actions?.cancel();
      if (marker) events.emit('player:click', { x: tx + 0.5, z: tz + 0.5, kind: 'walk' });
      return setPath({ x: tx, z: tz }, null);
    },
    // Used by actions: walk until the goal is satisfied, then call cb.
    walkToEntity(e, goal, cb) {
      if (state.mode === 'dead' || player.stunned) return false;
      keyWalking = false;
      const g = { x: e.x, z: e.z, w: e.w || 1, d: e.d || 1, ...(goal || { adjacent: true }) };
      if (g.onTile) {
        g.adjacent = false;
        g.w = 1; g.d = 1;
        if (!map.isWalkable(e.x, e.z)) { g.onTile = false; g.adjacent = true; }
      }
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
      const region = map.regionAt(cx, cz).id;
      events.emit('player:teleport', { x: tx, z: tz, region });
      checkRegion();
    },
    face(target) {
      if (!target) return;
      const tx = (target.x ?? 0) + (target.w || 1) / 2 - 0.5, tz = (target.z ?? 0) + (target.d || 1) / 2 - 0.5;
      if (tx === entity.x && tz === entity.z) return;
      entity.yaw = Math.atan2(-(tx - entity.x), -(tz - entity.z));
    },
    setAnim(name, opts = null) { anim = name; animOpts = opts; },
    get anim() { return anim; },
    // One-shot animation for `seconds` (attack swings, eating, being hit).
    playOnce(name, seconds = 0.6, opts = {}) {
      onceAnim = name;
      onceUntil = ctx.time.t + seconds;
      try { player.actor?.play?.(name, { once: true, ...opts }); } catch (err) { console.error('[player] anim', name, err); }
    },
    toggleRun(on = !state.save.run.on) {
      state.save.run.on = !!on;
      state.markDirty();
      events.emit('run:change', { on: !!on });
    },
    stun(ticks) {
      stunnedUntil = Math.max(stunnedUntil, ctx.ticks.count + ticks);
      player.stop();
      ctx.actions?.cancel();
      player.playOnce('stunned', ticks * 0.6);
      events.emit('player:stun', { ticks });
    },
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
      // WASD held while standing: turn right away (the step itself waits for the next tick).
      if (!moving && !keyWalking) {
        const d = keyDir();
        if (d && !player.stunned) entity.yaw = Math.atan2(-d[0], -d[1]);
      }
      // Smooth turning toward the logical yaw (shortest arc).
      const diff = wrap(entity.yaw - renderYaw);
      renderYaw = Math.abs(diff) < 0.002 ? entity.yaw : renderYaw + diff * (1 - Math.exp(-14 * dt));
      const v = player.actor;
      if (v) {
        v.setPosition?.(pos.x, pos.y, pos.z);
        v.setYaw?.(renderYaw);
        let a;
        if (state.mode === 'dead') a = 'die';
        else if (moving) a = moving.via ? 'run' : 'walk';
        else if (onceAnim && ctx.time.t < onceUntil) a = onceAnim;
        else a = anim || 'idle';
        if (a !== 'die') v.play?.(a, a === anim && animOpts ? animOpts : undefined);
      }
    },
  };

  function setPath(goal, cb) {
    const p = map.findPath(entity.x, entity.z, goal);
    arriveGoal = goal;
    onArrive = cb;
    if (!p) { events.emit('chat:game', { text: "I can't reach that.", kind: 'warn' }); onArrive = null; return false; }
    path = p;
    if (path.length) anim = null;
    events.emit('player:path', { steps: path.length, goal });
    if (!path.length) { const f = onArrive; onArrive = null; f?.(); }
    return true;
  }

  // ---- WASD ----
  // Held direction relative to the camera, snapped to 8 directions: [dx, dz] or null.
  const KEYS = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] };
  function keyDir() {
    const input = ctx.input;
    if (!input || input.typing || state.mode !== 'play') return null;
    let f = 0, r = 0;
    for (const code in KEYS) if (input.down(code)) { r += KEYS[code][0]; f += KEYS[code][1]; }
    if (!f && !r) return null;
    const yaw = ctx.cameraRig?.yaw ?? 0;
    // Camera sits at +(sin yaw, cos yaw) from the player, so forward is the opposite way.
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const mx = fx * f - fz * r, mz = fz * f + fx * r;
    const oct = Math.round(Math.atan2(mz, mx) / (Math.PI / 4));
    const a = oct * (Math.PI / 4);
    return [Math.round(Math.cos(a)), Math.round(Math.sin(a))];
  }
  // One step from (x, z) toward d, or the nearest of the two neighbouring directions (slide).
  function stepToward(x, z, d) {
    const [dx, dz] = d;
    const tries = [[dx, dz]];
    if (dx && dz) tries.push([dx, 0], [0, dz]);
    else if (dx) tries.push([dx, 1], [dx, -1]);
    else tries.push([1, dz], [-1, dz]);
    for (const [sx, sz] of tries) if (map.canStep(x, z, x + sx, z + sz)) return { x: x + sx, z: z + sz };
    return null;
  }
  // Intent (priority 5, before the movement tick): refresh a short WASD path every tick.
  ctx.ticks.on(() => {
    const d = state.mode === 'play' && !player.stunned ? keyDir() : null;
    if (!d) {
      if (keyWalking) { path = []; keyWalking = false; }
      return;
    }
    const s1 = stepToward(entity.x, entity.z, d);
    if (!s1) { if (keyWalking) path = []; return; }
    if (!keyWalking) {
      ctx.actions?.cancel();
      anim = null;
      keyWalking = true;
      events.emit('player:path', { steps: 1, goal: null }); // walking away closes dialogue
    }
    const s2 = player.running ? stepToward(s1.x, s1.z, d) : null;
    path = s2 ? [s1, s2] : [s1];
    onArrive = null;
    arriveGoal = null;
  }, 5);

  function checkRegion() {
    const r = player.region;
    if (r !== lastRegion) {
      const prev = lastRegion;
      lastRegion = r;
      if (prev !== null) events.emit('region:enter', { region: r, prev });
    }
  }

  // Movement on ticks (priority 10).
  ctx.ticks.on(() => {
    if (!path.length || state.mode === 'dead' || player.stunned) return;
    const run = player.running && path.length > 1;
    const from = [entity.x, entity.z];
    let via = null;
    let next = path.shift();
    if (!map.canStep(entity.x, entity.z, next.x, next.z)) { // something moved into the way: re-path
      const p = arriveGoal ? map.findPath(entity.x, entity.z, arriveGoal) : null;
      path = p || [];
      if (!p) { onArrive = null; }
      return;
    }
    if (run && path.length && map.canStep(next.x, next.z, path[0].x, path[0].z)) { via = [next.x, next.z]; next = path.shift(); }
    entity.yaw = Math.atan2(-(next.x - entity.x), -(next.z - entity.z));
    entities.moveTo(entity, next.x, next.z);
    moving = { from, via, to: [next.x, next.z], t0: ctx.ticks.count };
    state.save.pos = { x: next.x + 0.5, z: next.z + 0.5 };
    state.save.stats.steps += via ? 2 : 1;
    if (via) {
      state.save.run.energy = Math.max(0, state.save.run.energy - 0.67);
      if (state.save.run.energy < 1) {
        state.save.run.on = false;
        events.emit('run:change', { on: false, exhausted: true });
        events.emit('chat:game', { text: "You're out of breath. Rest a moment to recover your run energy.", kind: 'warn' });
      }
    }
    state.markDirty();
    events.emit('player:move', { x: next.x, z: next.z, running: !!via });
    if (!path.length && !keyWalking) {
      const f = onArrive;
      onArrive = null;
      f?.();
      events.emit('player:arrive', { x: next.x, z: next.z });
    }
  }, 10);
  // Run energy regenerates while not running (faster when standing still).
  ctx.ticks.on(() => {
    const r = state.save.run;
    if (moving && moving.via) return;
    if (r.energy < 100) r.energy = Math.min(100, r.energy + (moving ? 0.4 : 0.7));
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
    if (state.save.hp == null || state.save.hp <= 0) state.save.hp = player.maxHp;
    player.teleport(tx, tz);
    renderYaw = entity.yaw;
  };
  entities.add(entity);
  events.on('save:loaded', spawn);
  events.on('game:start', spawn);
  events.on('equipment:change', () => player.actor?.setEquipment?.(state.save.equipment));
  return player;
}
