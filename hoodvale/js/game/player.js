// The local player: smooth per-frame movement (no waiting for ticks) at walk / run speed, with
// tile collision; game logic still sees the tile the player stands on (x, z). Walking to
// interactions follows A* paths tile by tile, teleports, run energy, stuns. Owner: game builder.
// API (DESIGN.md §7): entity, actor, x, z, pos, yaw, running, moving, hp/maxHp, walkTo(tx, tz,
// opts), walkToEntity(e, goal, onArrive), stop(), teleport(tx, tz), face(entityOrTile),
// setAnim(name|null), playOnce(name, seconds), toggleRun(on?), stun(ticks), stunned, region.
// WASD moves freely relative to the camera (any direction, slides along walls, runs when run is
// on) and responds on the same frame; it cancels actions like a ground click does.
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
  // Continuous movement state.
  const WALK = 3.6, RUN = 6.0; // metres (tiles) per second
  const RADIUS = 0.26; // collision radius against blocked tiles
  const vel = new THREE.Vector2();
  let speedNow = 0;
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
    get moving() { return !!path.length || keyWalking || speedNow > 0.15; },
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
      vel.set(0, 0); speedNow = 0;
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
      dt = Math.min(dt, 0.1);
      move(dt);
      // Smooth turning toward the logical yaw (shortest arc).
      const diff = wrap(entity.yaw - renderYaw);
      renderYaw = Math.abs(diff) < 0.002 ? entity.yaw : renderYaw + diff * (1 - Math.exp(-14 * dt));
      const v = player.actor;
      if (v) {
        v.setPosition?.(pos.x, pos.y, pos.z);
        v.setYaw?.(renderYaw);
        let a;
        if (state.mode === 'dead') a = 'die';
        else if (speedNow > 0.4) a = speedNow > (WALK + RUN) / 2 ? 'run' : 'walk';
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

  // ---- Movement ----
  // Held WASD as a world-space unit direction relative to the camera, or null.
  const KEYS = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] };
  const _d = new THREE.Vector2();
  function keyDir() {
    const input = ctx.input;
    if (!input || input.typing || state.mode !== 'play') return null;
    let f = 0, r = 0;
    for (const code in KEYS) if (input.down(code)) { r += KEYS[code][0]; f += KEYS[code][1]; }
    if (!f && !r) return null;
    const yaw = ctx.cameraRig?.yaw ?? 0;
    // Camera sits at +(sin yaw, cos yaw) from the player, so forward is the opposite way.
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    _d.set(fx * f - fz * r, fz * f + fx * r);
    return _d.lengthSq() > 1e-6 ? _d.normalize() : null;
  }
  // A circle of RADIUS at (x, z) stands on walkable tiles only.
  function fits(x, z) {
    const r = RADIUS;
    return map.isWalkable(Math.floor(x - r), Math.floor(z - r)) && map.isWalkable(Math.floor(x + r), Math.floor(z - r))
      && map.isWalkable(Math.floor(x - r), Math.floor(z + r)) && map.isWalkable(Math.floor(x + r), Math.floor(z + r));
  }
  function move(dt) {
    if (state.mode === 'dead' || player.stunned) { vel.set(0, 0); speedNow = 0; path = []; keyWalking = false; return; }
    if (state.mode !== 'play' && state.mode !== 'cutscene') { vel.set(0, 0); speedNow = 0; return; }
    const speed = player.running ? RUN : WALK;
    const kd = keyDir();
    let stepped = false;
    if (kd) {
      if (!keyWalking) {
        ctx.actions?.cancel();
        anim = null;
        keyWalking = true;
        path = []; onArrive = null; arriveGoal = null;
        events.emit('player:path', { steps: 1, goal: null }); // walking away closes dialogue
      }
      // Snappy acceleration; collide per axis so walls are slid along.
      const k = 1 - Math.exp(-22 * dt);
      vel.x += (kd.x * speed - vel.x) * k;
      vel.y += (kd.y * speed - vel.y) * k;
      const nx = pos.x + vel.x * dt, nz = pos.z + vel.y * dt;
      if (fits(nx, pos.z)) pos.x = nx; else vel.x = 0;
      if (fits(pos.x, nz)) pos.z = nz; else vel.y = 0;
      speedNow = vel.length();
      if (speedNow > 0.2) entity.yaw = Math.atan2(-vel.x, -vel.y);
      stepped = true;
    } else {
      keyWalking = false;
      if (path.length) {
        // Follow the path through tile centres at full speed (no tick quantisation).
        let budget = speed * dt;
        let lastDx = 0, lastDz = 0;
        while (budget > 1e-6 && path.length) {
          const wp = path[0];
          if (!wp.checked) {
            if (!map.isWalkable(wp.x, wp.z)) { // something moved into the way: re-path
              const p = arriveGoal ? map.findPath(entity.x, entity.z, arriveGoal) : null;
              path = p || [];
              if (!p) onArrive = null;
              break;
            }
            wp.checked = true;
          }
          const tx = wp.x + 0.5, tz = wp.z + 0.5;
          const dx = tx - pos.x, dz = tz - pos.z;
          const d = Math.hypot(dx, dz);
          if (d > 1e-4) { lastDx = dx; lastDz = dz; }
          if (d <= budget) { pos.x = tx; pos.z = tz; budget -= d; path.shift(); updateTile(); }
          else { pos.x += (dx / d) * budget; pos.z += (dz / d) * budget; budget = 0; }
        }
        if (lastDx || lastDz) entity.yaw = Math.atan2(-lastDx, -lastDz);
        speedNow = speed;
        vel.set(0, 0);
        stepped = true;
        if (!path.length) {
          speedNow = 0;
          const f = onArrive;
          onArrive = null;
          f?.();
          events.emit('player:arrive', { x: entity.x, z: entity.z });
        }
      } else if (vel.lengthSq() > 0.0004) {
        // Ease out of a WASD run.
        const k = 1 - Math.exp(-18 * dt);
        vel.x -= vel.x * k; vel.y -= vel.y * k;
        const nx = pos.x + vel.x * dt, nz = pos.z + vel.y * dt;
        if (fits(nx, pos.z)) pos.x = nx;
        if (fits(pos.x, nz)) pos.z = nz;
        speedNow = vel.length();
        stepped = true;
      } else { vel.set(0, 0); speedNow = 0; }
    }
    if (stepped) {
      pos.y = map.heightAt(pos.x, pos.z);
      updateTile();
    }
  }
  // Tile bookkeeping when the player crosses into a new tile.
  function updateTile() {
    const tx = Math.floor(pos.x), tz = Math.floor(pos.z);
    state.save.pos = { x: pos.x, z: pos.z };
    if (tx === entity.x && tz === entity.z) return;
    entities.moveTo(entity, tx, tz);
    state.save.stats.steps += 1;
    const running = player.running && speedNow > (WALK + RUN) / 2;
    if (running) {
      state.save.run.energy = Math.max(0, state.save.run.energy - 0.3);
      if (state.save.run.energy < 1) {
        state.save.run.on = false;
        events.emit('run:change', { on: false, exhausted: true });
        events.emit('chat:game', { text: "You're out of breath. Rest a moment to recover your run energy.", kind: 'warn' });
      }
    }
    state.markDirty();
    events.emit('player:move', { x: tx, z: tz, running });
    checkRegion();
  }

  function checkRegion() {
    const r = player.region;
    if (r !== lastRegion) {
      const prev = lastRegion;
      lastRegion = r;
      if (prev !== null) events.emit('region:enter', { region: r, prev });
    }
  }

  // Run energy regenerates while not running (faster when standing still).
  ctx.ticks.on(() => {
    const r = state.save.run;
    if (speedNow > (WALK + RUN) / 2) return;
    if (r.energy < 100) r.energy = Math.min(100, r.energy + (speedNow > 0.2 ? 0.4 : 0.7));
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
