// Player controller: camera-relative movement with console-style feel (accel/decel, coyote time,
// jump buffer, variable jump, glide, stamina, swimming with ledge climb-out, slope sliding,
// step-up, hard-landing stagger, knockback), the lantern light and carried flames.
// Owner: player. Contract: DESIGN.md §7 Player (controller).

import * as THREE from 'three';
import { createCharacter } from './character.js';
import { createPlayerFX } from './fx.js';
import { glowTexture } from './charparts.js';
import { LANDMARKS, heightAt, normalAt, SEA_LEVEL } from '../world/heightfield.js';
import { patchMaterial } from '../world/fog.js';
import { clamp, damp, dampAngle, lerp, smoothstep, wrapAngle, easeOutCubic } from '../core/math.js';

// Feel parameters (DESIGN.md §7). Exposed as player.tune for live tweaking.
export const TUNE = {
  walk: 3.2, run: 5.6, sprint: 8.6,
  accel: 40, decel: 30, airControl: 0.3,
  turnRate: 16, // rad/s the velocity direction can swing on the ground
  jumpV: 7.2, gUp: 22, gDown: 34, gCut: 60, maxFall: 34,
  coyote: 0.12, buffer: 0.12,
  glideFall: 2.2, glideSpeed: 8.5, glideTurn: 2.3, glideAccel: 11, glideMinHeight: 1.4,
  staminaSprint: 0.2, staminaGlide: 1 / 16, staminaSwim: 0.14, staminaRegen: 0.4, regenDelay: 0.7,
  swimDepth: 1.15, swimFloat: 1.24, swimSpeed: 3.0, swimFast: 4.6, climbMax: 1.6,
  maxSlope: (48 * Math.PI) / 180, stepUp: 0.45,
  radius: 0.34, height: 1.72,
  hardLand: 19, midLand: 11.5, stagger: 0.5,
  flareCost: 12, flareCooldown: 1.5,
};

const FLAME_COLORS = { tirta: '#bff6ff', bumi: '#ffb04a', samudra: '#8fa2ff' };
const FLAME_IDS = ['tirta', 'bumi', 'samudra'];
const SUB = 1 / 60;

export function createPlayer(ctx) {
  const { scene, events, input, state, collision } = ctx;
  const T = TUNE;

  const character = createCharacter({
    skin: '#c48659', top: '#e0d3b8', bottom: '#2c3a63', pants: '#22202a', pantsLength: 0.62,
    hair: 'short', build: 'normal', accessory: 'lantern', udeng: '#7a4524',
    kain: { base: '#a8622f', ink: '#262c5c', accent: '#f3e2b6', motif: 'parang' },
  });
  scene.add(character.root);
  const fx = createPlayerFX(ctx);

  // Lantern light: warm, flickering, sized by nyala.
  const light = new THREE.PointLight(0xffa850, 4, 20, 1.25);
  light.castShadow = false;
  scene.add(light);

  const S = LANDMARKS.spawn;
  const pos = new THREE.Vector3(S.x, S.y, S.z);
  const vel = new THREE.Vector3();

  // Internal state.
  let coyoteT = 0, bufferT = 0, jumpHeldSinceTakeoff = false, airTime = 0, jumpedAt = -1;
  let staminaDelay = 0, exhausted = false;
  let staggerT = 0, stunT = 0;
  let flareT = 0, flareCD = 0, flareBurst = 0, fizzleT = 0;
  let stepOffset = 0; // visual smoothing of step-ups
  let visYaw = S.yaw;
  let climb = null;
  let surf = SEA_LEVEL, waterDepth = 0;
  let wakeT = 0, dustT = 0;
  let litK = 1, litTarget = 1, litRate = 2, igniteFlash = 0;
  let lastLook = null;
  let hurtFlash = 0;
  let slideDustT = 0;
  let pinnedAt = -1, pinT = 0;
  const extVel = new THREE.Vector3();
  const kinPrev = new THREE.Vector3(S.x, S.y, S.z);
  const wish = { x: 0, z: 0, mag: 0 };
  const lookTmp = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const nrm = [0, 1, 0];

  const anim = { state: 'idle', speed: 0, lookAt: null, talk: 0, flare: 0, waterY: -1e9, seat: undefined, sitStyle: undefined };
  let poseOpts = {};

  const player = {
    position: pos,
    velocity: vel,
    yaw: S.yaw,
    object: character.root,
    character,
    fx,
    lanternLight: light,
    lanternWorld: new THREE.Vector3(S.x, S.y + 1, S.z),
    lanternRadius: 18,
    grounded: true,
    swimming: false,
    gliding: false,
    sprinting: false,
    sliding: false,
    climbing: false,
    stamina: 1,
    surface: 'wood',
    controlEnabled: true,
    // Cinematic helpers (additions): kinematic = skip physics (position/yaw driven externally),
    // pose = forced anim state (e.g. 'sit' on the boat), see setPose / setLanternLit.
    kinematic: false,
    pose: null,
    animOverride: null,
    lanternBoost: undefined,
    lanternBoostHandled: true, // the controller applies lanternBoost to light + radius itself
    speed: 0,
    tune: T,

    // Repeated small teleports (cutscenes placing the player every frame) pin the physics and
    // animate from the implied motion; a big jump resets cloth and snaps the camera.
    teleport(x, y, z, yaw) {
      const gy = collision.groundAt(x, z, (y ?? 999) + 0.1, T.stepUp, 0.2).y;
      const ny = y ?? Math.max(gy, heightAt(x, z));
      const now = ctx.time?.t ?? 0;
      const jump = Math.hypot(x - pos.x, ny - pos.y, z - pos.z);
      const since = now - pinnedAt;
      if (jump < 3 && since > 1e-4 && since < 0.25) {
        extVel.set((x - pos.x) / since, (ny - pos.y) / since, (z - pos.z) / since);
        if (extVel.length() > 30) extVel.set(0, 0, 0);
      } else extVel.set(0, 0, 0);
      pos.set(x, ny, z);
      vel.set(0, 0, 0);
      pinnedAt = now;
      pinT = 0.12;
      if (yaw !== undefined && yaw !== null) {
        player.yaw = yaw;
        if (jump >= 3 || since > 0.25) visYaw = yaw;
      }
      player.grounded = pos.y - gy < 0.08;
      coyoteT = 0;
      bufferT = 0;
      jumpHeldSinceTakeoff = false;
      if (player.gliding) setGlide(false);
      climb = null;
      player.climbing = false;
      stepOffset = 0;
      airTime = 0;
      if (player.swimming) { player.swimming = false; events.emit('player:swim', { on: false }); }
      character.root.position.copy(pos);
      if (jump >= 3) {
        character.root.rotation.y = visYaw;
        character.kain?.reset();
        events.emit('player:teleport', { x: pos.x, y: pos.y, z: pos.z });
      }
    },
    setControl(on) {
      player.controlEnabled = !!on;
      if (!on) { player.sprinting = false; }
    },
    faceToward(x, z) {
      const dx = x - pos.x, dz = z - pos.z;
      if (dx * dx + dz * dz < 1e-6) return;
      player.yaw = Math.atan2(-dx, -dz);
    },
    knockback(dx, dz, strength = 6) {
      const l = Math.hypot(dx, dz) || 1;
      vel.x = (dx / l) * strength;
      vel.z = (dz / l) * strength;
      if (!player.swimming) {
        vel.y = Math.max(vel.y, 4.2);
        player.grounded = false;
        coyoteT = 0;
      }
      if (player.gliding) setGlide(false);
      stunT = 0.35;
      climb = null;
    },
    // Cinematic pose override: null | 'sit' | 'wave' | 'idle' | 'talk' ... (opts.seat for sit height).
    // opts: { sitStyle: 'chair'|'edge'|'floor', seat: height above the root }.
    setPose(p, opts = {}) {
      player.pose = p || null;
      poseOpts = opts || {};
    },
    // Lantern on/off with a ramp; turning on gives a bloom flash (intro "lantern ignites").
    setLanternLit(on, seconds = 0.6) {
      litTarget = on ? 1 : 0;
      litRate = seconds > 0 ? 1 / seconds : 1000;
      if (on && litK < 0.5) igniteFlash = 1;
    },
    get lanternLit() { return litTarget > 0; },
    flare() { return tryFlare(true); },

    update(dt, t) {
      if (dt <= 0) return;
      const playing = state.mode === 'play' && player.controlEnabled;
      readInput(playing, dt);

      pinT = Math.max(0, pinT - dt);
      if (player.kinematic || pinT > 0) {
        // Externally driven (cutscenes / per-frame teleports): keep animation + lantern alive.
        if (player.kinematic) {
          if (kinPrev.distanceTo(pos) < 3) extVel.copy(pos).sub(kinPrev).divideScalar(dt);
          else extVel.set(0, 0, 0);
          player.grounded = true;
        }
        vel.set(0, 0, 0);
        player.gliding = false;
      } else {
        const n = Math.min(4, Math.max(1, Math.ceil(dt / SUB - 0.01)));
        const h = dt / n;
        for (let i = 0; i < n; i++) step(h, playing, i === 0);
        safety();
      }
      timers(dt, playing);
      visuals(dt, t, playing);
      kinPrev.copy(pos);
    },
  };

  // -------------------------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------------------------
  let jumpHeld = false, sprintHeld = false;
  function readInput(playing, dt) {
    if (!playing) {
      wish.x = wish.z = wish.mag = 0;
      jumpHeld = sprintHeld = false;
      return;
    }
    const camYaw = ctx.cameraRig?.yaw ?? player.yaw;
    const mx = input.move.x, my = input.move.y;
    const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
    wish.x = -sy * my + cy * mx;
    wish.z = -cy * my - sy * mx;
    wish.mag = Math.min(1, Math.hypot(wish.x, wish.z));
    if (wish.mag > 1e-4) { wish.x /= wish.mag; wish.z /= wish.mag; } else { wish.x = wish.z = 0; }
    jumpHeld = input.down('jump');
    sprintHeld = input.down('sprint');
    if (input.pressed('jump')) {
      bufferT = T.buffer;
      // Re-press in the air starts a glide right away (when there is room below).
      if (!player.grounded && !player.swimming && !climb && coyoteT <= 0 && canGlide()) {
        setGlide(true);
        bufferT = 0;
      }
    }
    if (input.pressed('flare')) tryFlare(false);
  }

  function tryFlare(force) {
    const nyala = state.progress.nyala;
    if (flareCD > 0) return false;
    if (nyala < T.flareCost && !force) {
      fizzleT = 0.45;
      flareCD = 0.4;
      events.emit('player:flareFail', { nyala });
      return false;
    }
    flareT = 0.85;
    flareCD = T.flareCooldown;
    flareBurst = 1;
    const lw = player.lanternWorld;
    events.emit('player:flare', { x: lw.x, y: lw.y, z: lw.z });
    events.emit('camera:shake', { strength: 0.16, duration: 0.3 });
    fx.flare(lw.x, lw.y, lw.z);
    return true;
  }

  function canGlide() {
    if (player.stamina <= 0.02 || exhausted || stunT > 0) return false;
    const g = collision.groundAt(pos.x, pos.z, pos.y, 0, 0.2);
    return pos.y - g.y > T.glideMinHeight && pos.y > surf + 0.6;
  }

  function setGlide(on) {
    if (player.gliding === on) return;
    player.gliding = on;
    events.emit('player:glide', { on });
    if (on && vel.y < -T.glideFall * 2.5) events.emit('camera:shake', { strength: 0.05, duration: 0.2 });
  }

  // -------------------------------------------------------------------------------------------
  // Simulation step
  // -------------------------------------------------------------------------------------------
  function step(h, playing, firstSub) {
    if (climb) { stepClimb(h); return; }

    // Water at the current spot.
    const wave = ctx.ocean?.waveHeight ? ctx.ocean.waveHeight(pos.x, pos.z, ctx.time?.t ?? 0) : 0;
    surf = SEA_LEVEL + (Number.isFinite(wave) ? wave : 0);
    const under = collision.groundAt(pos.x, pos.z, player.swimming ? pos.y + 0.2 : pos.y, T.stepUp, 0.2);
    waterDepth = surf - under.y;

    if (player.swimming) { stepSwim(h, playing, under); return; }

    // ---------------- Horizontal ----------------
    const hs = Math.hypot(vel.x, vel.z);
    let target = 0;
    if (wish.mag > 0.05) {
      target = wish.mag < 0.6 ? T.walk * (wish.mag / 0.6) : lerp(T.walk, T.run, (wish.mag - 0.6) / 0.4);
    }
    const wantSprint = sprintHeld && wish.mag > 0.3 && !exhausted && player.stamina > 0 && player.grounded && !player.sliding;
    player.sprinting = wantSprint && hs > T.walk * 0.8;
    if (wantSprint) target = T.sprint * Math.max(0.75, wish.mag);
    if (player.grounded && waterDepth > 0.3) target *= lerp(1, 0.55, clamp((waterDepth - 0.3) / 0.85, 0, 1)); // wading
    if (staggerT > 0) target *= 0.25;
    const control = stunT > 0 ? 0 : 1;

    if (player.gliding) {
      // Glide: always moving forward, steer the facing, slow sink.
      if (wish.mag > 0.1 && control) {
        const ty = Math.atan2(-wish.x, -wish.z);
        const d = wrapAngle(ty - player.yaw);
        player.yaw += clamp(d, -T.glideTurn * h, T.glideTurn * h) * Math.min(1, wish.mag * 1.5);
      }
      const gs = T.glideSpeed * (wish.mag > 0.1 ? 1 : 0.8);
      const fx_ = -Math.sin(player.yaw) * gs, fz_ = -Math.cos(player.yaw) * gs;
      const dvx = fx_ - vel.x, dvz = fz_ - vel.z;
      const dl = Math.hypot(dvx, dvz);
      const maxDv = T.glideAccel * h;
      if (dl > maxDv) { vel.x += (dvx / dl) * maxDv; vel.z += (dvz / dl) * maxDv; } else { vel.x = fx_; vel.z = fz_; }
    } else if (player.grounded && !player.sliding) {
      let dirx = hs > 1e-3 ? vel.x / hs : wish.x, dirz = hs > 1e-3 ? vel.z / hs : wish.z;
      let speed = hs;
      if (wish.mag > 0.05 && control) {
        const cur = Math.atan2(dirx, dirz), want = Math.atan2(wish.x, wish.z);
        const d = wrapAngle(want - cur);
        if (speed < 0.6) { dirx = wish.x; dirz = wish.z; }
        else if (Math.abs(d) < 2.4) {
          const rot = clamp(d, -T.turnRate * h, T.turnRate * h);
          const a = cur + rot;
          dirx = Math.sin(a); dirz = Math.cos(a);
        } else {
          // Sharp reversal: skid to a stop first.
          speed = Math.max(0, speed - T.decel * 1.6 * h);
          target = speed;
          if (speed < 0.6) { dirx = wish.x; dirz = wish.z; }
        }
        if (speed < target) speed = Math.min(target, speed + T.accel * h);
        else speed = Math.max(target, speed - T.decel * h);
      } else {
        speed = Math.max(0, speed - T.decel * h);
      }
      vel.x = dirx * speed;
      vel.z = dirz * speed;
    } else if (player.sliding) {
      normalAt(pos.x, pos.z, nrm);
      const hl = Math.hypot(nrm[0], nrm[2]) || 1;
      const dx = nrm[0] / hl, dz = nrm[2] / hl; // downhill
      const slope = Math.acos(clamp(nrm[1], -1, 1));
      const a = 22 * Math.sin(slope) * 0.85;
      vel.x += dx * a * h + wish.x * 5 * h * control;
      vel.z += dz * a * h + wish.z * 5 * h * control;
      // Remove uphill velocity.
      const up = -(vel.x * dx + vel.z * dz);
      if (up > 0) { vel.x += dx * up; vel.z += dz * up; }
      const sp = Math.hypot(vel.x, vel.z);
      if (sp > 14) { vel.x *= 14 / sp; vel.z *= 14 / sp; }
    } else {
      // Air control (30%): steer toward the wish without killing momentum.
      if (wish.mag > 0.05 && control) {
        const cap = Math.max(hs, target);
        const tx = wish.x * cap, tz = wish.z * cap;
        const dvx = tx - vel.x, dvz = tz - vel.z;
        const dl = Math.hypot(dvx, dvz);
        const maxDv = T.accel * T.airControl * h;
        if (dl > maxDv) { vel.x += (dvx / dl) * maxDv; vel.z += (dvz / dl) * maxDv; } else { vel.x = tx; vel.z = tz; }
      }
    }

    // Facing.
    if (!player.gliding && control) {
      if (wish.mag > 0.05 && !player.sliding) {
        const ty = Math.atan2(-wish.x, -wish.z);
        player.yaw = dampAngle(player.yaw, ty, player.grounded ? 18 : 9, h);
      } else if (player.sliding && hs > 1) {
        player.yaw = dampAngle(player.yaw, Math.atan2(-vel.x, -vel.z), 6, h);
      }
    }

    // ---------------- Vertical ----------------
    if (player.grounded) {
      if (bufferT > 0 && staggerT <= 0.2 && !player.sliding && control) doJump();
    } else {
      if (bufferT > 0 && coyoteT > 0 && control) doJump();
    }
    if (!player.grounded) {
      airTime += h;
      // Glide start by holding jump through the apex.
      if (!player.gliding && jumpHeld && jumpHeldSinceTakeoff && vel.y < -1.2 && canGlide()) setGlide(true);
      if (player.gliding && (!jumpHeld || player.stamina <= 0 || stunT > 0)) setGlide(false);
      if (player.gliding) {
        if (vel.y < -T.glideFall) vel.y = damp(vel.y, -T.glideFall, 7, h);
        else vel.y = Math.max(vel.y - 12 * h, -T.glideFall);
      } else {
        const g = vel.y > 0 ? (jumpHeld && jumpHeldSinceTakeoff ? T.gUp : T.gCut) : T.gDown;
        vel.y = Math.max(vel.y - g * h, -T.maxFall);
      }
      if (!jumpHeld) jumpHeldSinceTakeoff = false;
    }

    // ---------------- Integrate + collide ----------------
    const ox = pos.x, oz = pos.z;
    let nx = pos.x + vel.x * h, nz = pos.z + vel.z * h;
    // Steep terrain acts as a wall when climbing it.
    if (!player.sliding) {
      const blocked = (x, z) => {
        const th = heightAt(x, z);
        if (th <= pos.y + 0.05) return false;
        normalAt(x, z, nrm);
        return Math.acos(clamp(nrm[1], -1, 1)) > T.maxSlope || th > pos.y + T.stepUp + 0.3;
      };
      if (blocked(nx, nz)) {
        if (!blocked(nx, oz)) { nz = oz; vel.z = 0; }
        else if (!blocked(ox, nz)) { nx = ox; vel.x = 0; }
        else { nx = ox; nz = oz; vel.x = vel.z = 0; }
      }
    }
    pos.x = nx; pos.z = nz;
    pos.y += vel.y * h;
    const res = collision.resolve(pos, T.radius, T.height, T.stepUp);
    if (res.hit) {
      const d = vel.x * res.nx + vel.z * res.nz;
      if (d < 0) { vel.x -= d * res.nx; vel.z -= d * res.nz; }
    }
    // Ceiling.
    if (vel.y > 0) {
      const ceil = collision.ceilingAt(pos.x, pos.z, pos.y + 0.3);
      if (pos.y + T.height > ceil) { pos.y = ceil - T.height; vel.y = 0; }
    }

    // ---------------- Ground ----------------
    const g = collision.groundAt(pos.x, pos.z, Math.max(pos.y, pos.y - vel.y * h), T.stepUp, 0.2);
    const gy = g.y;
    if (player.grounded) {
      const snap = 0.38 + Math.hypot(vel.x, vel.z) * h * 1.5;
      if (vel.y <= 0 && pos.y - gy <= snap && pos.y - gy > -T.stepUp - 0.05) {
        if (g.collider && gy > pos.y + 0.08) stepOffset -= gy - pos.y; // stair/deck step-up: smooth the visual
        pos.y = gy;
        vel.y = 0;
      } else {
        player.grounded = false;
        coyoteT = vel.y > 0 ? 0 : T.coyote;
        if (vel.y <= 0) jumpHeldSinceTakeoff = false;
      }
    } else if (vel.y <= 0 && pos.y <= gy + 0.001) {
      land(gy, g);
    }
    player.surface = g.surface || 'grass';

    // Steep slopes (terrain only) slide.
    if (player.grounded) {
      if (!g.collider) {
        normalAt(pos.x, pos.z, nrm);
        const slope = Math.acos(clamp(nrm[1], -1, 1));
        if (!player.sliding && slope > T.maxSlope) player.sliding = true;
        else if (player.sliding && slope < T.maxSlope - 0.06) player.sliding = false;
      } else player.sliding = false;
    } else if (player.sliding && airTime > 0.2) player.sliding = false;

    // Enter water.
    if (!player.swimming && waterDepth > T.swimDepth && pos.y < surf - (T.swimFloat - 0.25)) {
      enterSwim();
    }
  }

  function doJump() {
    vel.y = T.jumpV + (player.sprinting ? 0.35 : 0);
    player.grounded = false;
    player.sliding = false;
    coyoteT = 0;
    bufferT = 0;
    airTime = 0;
    jumpHeldSinceTakeoff = true;
    jumpedAt = ctx.time?.t ?? 0;
    events.emit('player:jump', {});
    if (waterDepth > 0.2) fx.splash(pos.x, surf, pos.z, 0.35);
    else fx.dust(pos.x, pos.y, pos.z, 0.35);
  }

  function land(gy, g) {
    const speed = -vel.y;
    pos.y = gy;
    vel.y = 0;
    player.grounded = true;
    airTime = 0;
    jumpHeldSinceTakeoff = false;
    if (player.gliding) setGlide(false);
    events.emit('player:land', { speed });
    const wet = waterDepth > 0.15;
    if (speed > T.hardLand) {
      staggerT = T.stagger;
      character.impact(1);
      vel.x *= 0.3; vel.z *= 0.3;
      events.emit('camera:shake', { strength: 0.42, duration: 0.45 });
      wet ? fx.splash(pos.x, surf, pos.z, 1) : fx.dust(pos.x, gy, pos.z, 1.4);
    } else if (speed > T.midLand) {
      character.impact(0.65);
      events.emit('camera:shake', { strength: 0.14, duration: 0.25 });
      wet ? fx.splash(pos.x, surf, pos.z, 0.6) : fx.dust(pos.x, gy, pos.z, 0.8);
    } else if (speed > 3) {
      character.impact(clamp(speed / 16, 0.15, 0.45));
      wet ? fx.splash(pos.x, surf, pos.z, 0.3) : fx.dust(pos.x, gy, pos.z, 0.35);
    }
  }

  // ---------------- Swimming ----------------
  function enterSwim() {
    player.swimming = true;
    player.grounded = false;
    player.sliding = false;
    if (player.gliding) setGlide(false);
    const strength = clamp(-vel.y / 10, 0.25, 1.3);
    if (vel.y < -2) {
      events.emit('player:splash', { x: pos.x, y: surf, z: pos.z, strength });
      fx.splash(pos.x, surf, pos.z, strength);
      if (strength > 0.8) events.emit('camera:shake', { strength: 0.1, duration: 0.2 });
    } else {
      fx.ripple(pos.x, surf, pos.z, 1.4);
    }
    vel.y *= 0.3;
    events.emit('player:swim', { on: true });
  }

  function exitSwim() {
    player.swimming = false;
    events.emit('player:swim', { on: false });
  }

  function stepSwim(h, playing, under) {
    const fast = sprintHeld && wish.mag > 0.3 && player.stamina > 0 && !exhausted;
    player.sprinting = fast;
    const sp = (fast ? T.swimFast : T.swimSpeed) * wish.mag;
    const tx = wish.x * sp, tz = wish.z * sp;
    const dvx = tx - vel.x, dvz = tz - vel.z;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = (wish.mag > 0.05 ? 7 : 3.5) * h;
    if (dl > maxDv) { vel.x += (dvx / dl) * maxDv; vel.z += (dvz / dl) * maxDv; } else { vel.x = tx; vel.z = tz; }
    if (wish.mag > 0.05 && stunT <= 0) player.yaw = dampAngle(player.yaw, Math.atan2(-wish.x, -wish.z), 7, h);
    // Buoyancy spring toward the floating height (bobs with the waves).
    const floatY = surf - T.swimFloat;
    vel.y += ((floatY - pos.y) * 30 - vel.y * 7.5) * h;
    vel.y = clamp(vel.y, -8, 6);

    // Ledge climb-out: probe ahead in the move direction (or facing when jumping).
    const wantsOut = wish.mag > 0.3 || bufferT > 0;
    if (wantsOut && stunT <= 0) {
      const dx = wish.mag > 0.3 ? wish.x : -Math.sin(player.yaw);
      const dz = wish.mag > 0.3 ? wish.z : -Math.cos(player.yaw);
      for (const reach of [0.55, 0.85]) {
        const ax = pos.x + dx * reach, az = pos.z + dz * reach;
        const ga = collision.groundAt(ax, az, surf + T.climbMax + 0.05, 0, 0.15);
        const ledge = ga.y - surf;
        if (ledge > -0.35 && ledge <= T.climbMax && ga.y > pos.y + T.stepUp + 0.2 && surf - ga.y < 0.6) {
          // Room above the ledge?
          const ceil = collision.ceilingAt(ax, az, ga.y + 0.05);
          if (ceil - ga.y > T.height * 0.9) {
            startClimb(ax + dx * 0.25, ga.y, az + dz * 0.25);
            bufferT = 0;
            return;
          }
        }
      }
    }
    if (bufferT > 0 && Math.abs(pos.y - floatY) < 0.3) {
      // Little hop in the water for feedback.
      vel.y = 2.6;
      bufferT = 0;
      fx.splash(pos.x, surf, pos.z, 0.25);
    }

    const ox = pos.x, oz = pos.z;
    pos.x += vel.x * h; pos.z += vel.z * h; pos.y += vel.y * h;
    // Underwater terrain walls.
    const th = heightAt(pos.x, pos.z);
    if (th > pos.y + T.stepUp + 0.4) { pos.x = ox; pos.z = oz; vel.x *= 0.2; vel.z *= 0.2; }
    const res = collision.resolve(pos, T.radius, T.height, 0.2);
    if (res.hit) {
      const d = vel.x * res.nx + vel.z * res.nz;
      if (d < 0) { vel.x -= d * res.nx; vel.z -= d * res.nz; }
    }
    const g = collision.groundAt(pos.x, pos.z, pos.y + 0.2, T.stepUp, 0.2);
    if (pos.y < g.y) { pos.y = g.y; if (vel.y < 0) vel.y = 0; }
    waterDepth = surf - g.y;
    player.surface = 'water';
    // Shallow enough to stand: walk out.
    if (waterDepth < T.swimDepth - 0.08) {
      exitSwim();
      if (pos.y - g.y < 0.6) {
        pos.y = Math.max(pos.y, g.y);
        player.grounded = pos.y - g.y < 0.05;
        if (!player.grounded) vel.y = Math.min(vel.y, 0);
      }
    }
  }

  function startClimb(x, y, z) {
    climb = { t: 0, dur: 0.55, fx: pos.x, fy: pos.y, fz: pos.z, tx: x, ty: y, tz: z };
    player.climbing = true;
    vel.set(0, 0, 0);
    fx.splash(pos.x, surf, pos.z, 0.5);
    events.emit('player:splash', { x: pos.x, y: surf, z: pos.z, strength: 0.4 });
    events.emit('player:climb', {});
  }

  function stepClimb(h) {
    climb.t += h;
    const k = Math.min(1, climb.t / climb.dur);
    const up = easeOutCubic(Math.min(1, k / 0.65));
    const fwd = smoothstep(0.35, 1, k);
    pos.x = lerp(climb.fx, climb.tx, fwd);
    pos.z = lerp(climb.fz, climb.tz, fwd);
    pos.y = lerp(climb.fy, climb.ty + 0.08, up);
    if (k >= 1) {
      pos.y = climb.ty;
      climb = null;
      player.climbing = false;
      if (player.swimming) exitSwim();
      player.grounded = true;
      vel.set(0, 0, 0);
      character.impact(0.3);
    }
  }

  // ---------------- Safety & timers ----------------
  function safety() {
    const th = heightAt(pos.x, pos.z);
    if (pos.y < th - 2 || !Number.isFinite(pos.y)) {
      pos.y = Math.max(th, collision.groundAt(pos.x, pos.z, 999).y) + 0.05;
      vel.y = 0;
    }
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) { pos.set(S.x, S.y, S.z); vel.set(0, 0, 0); }
    // Soft island boundary (current pushes back far out at sea).
    const r = Math.hypot(pos.x, pos.z);
    if (r > 370) {
      const k = (r - 370) / r;
      pos.x -= pos.x * k; pos.z -= pos.z * k;
    }
  }

  function timers(dt, playing) {
    coyoteT = Math.max(0, coyoteT - dt);
    bufferT = Math.max(0, bufferT - dt);
    staggerT = Math.max(0, staggerT - dt);
    stunT = Math.max(0, stunT - dt);
    flareT = Math.max(0, flareT - dt);
    flareCD = Math.max(0, flareCD - dt);
    fizzleT = Math.max(0, fizzleT - dt);
    flareBurst *= Math.exp(-4.2 * dt);
    igniteFlash *= Math.exp(-2.4 * dt);
    hurtFlash *= Math.exp(-5 * dt);
    // Stamina.
    const hs = Math.hypot(vel.x, vel.z);
    let drain = 0;
    if (player.gliding) drain = T.staminaGlide;
    else if (player.sprinting && hs > 1) drain = player.swimming ? T.staminaSwim : T.staminaSprint;
    if (drain > 0) {
      player.stamina = Math.max(0, player.stamina - drain * dt);
      staminaDelay = T.regenDelay;
      if (player.stamina <= 0) { exhausted = true; player.sprinting = false; }
    } else {
      staminaDelay -= dt;
      if (staminaDelay <= 0 && (player.grounded || player.swimming || player.kinematic)) {
        player.stamina = Math.min(1, player.stamina + T.staminaRegen * (player.swimming ? 0.5 : 1) * dt);
      }
    }
    if (exhausted && player.stamina > 0.3) exhausted = false;
    player.exhausted = exhausted;
  }

  // -------------------------------------------------------------------------------------------
  // Visuals: character, lantern light, carried flames, footstep FX
  // -------------------------------------------------------------------------------------------
  character.onStep = (side) => {
    const run = player.speed > 4.4;
    const surface = waterDepth > 0.25 && !player.swimming ? 'water' : player.surface;
    events.emit('player:step', { surface, run });
    if (surface === 'water') {
      fx.ripple(pos.x, surf, pos.z, 0.7);
      if (run) fx.splash(pos.x, surf, pos.z, 0.15);
    } else if (player.sprinting || (run && (surface === 'sand' || surface === 'path'))) {
      dustT = 0;
      const sx = side === 'R' ? 1 : -1;
      const yaw = player.yaw;
      fx.dust(pos.x + Math.cos(yaw) * 0.12 * sx, pos.y, pos.z - Math.sin(yaw) * 0.12 * sx, player.sprinting ? 0.32 : 0.18,
        surface === 'sand' ? SAND_DUST : undefined);
    }
  };
  events.on('player:hurt', () => {
    character.hurt(1);
    hurtFlash = 1;
  });

  // Carried flame orbs.
  const orbs = FLAME_IDS.map((id, i) => {
    const color = new THREE.Color(FLAME_COLORS[id]);
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 8),
      patchMaterial(new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3.2) })),
    );
    const halo = new THREE.Sprite(patchMaterial(new THREE.SpriteMaterial({
      map: glowTexture(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.85,
    })));
    halo.scale.setScalar(0.6);
    const trail = new THREE.Sprite(patchMaterial(new THREE.SpriteMaterial({
      map: glowTexture(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.35,
    })));
    trail.scale.setScalar(0.28);
    g.add(core, halo);
    g.visible = false;
    scene.add(g, trail);
    return { id, g, core, halo, trail, k: i, shown: false, pos: new THREE.Vector3() };
  });

  function updateOrbs(dt, t) {
    const lw = player.lanternWorld;
    let n = 0;
    for (const o of orbs) if (state.progress.flames?.[o.id] === 'carried') n++;
    let slot = 0;
    for (const o of orbs) {
      const carried = state.progress.flames?.[o.id] === 'carried';
      if (carried && !o.shown) { o.pos.copy(lw); o.shown = true; }
      o.shown = carried;
      o.g.visible = carried;
      o.trail.visible = carried;
      if (!carried) continue;
      const a = t * 1.9 + (slot / Math.max(1, n)) * Math.PI * 2;
      slot++;
      const r = 0.5 + 0.06 * Math.sin(t * 1.3 + o.k);
      tmp.set(lw.x + Math.cos(a) * r, lw.y + 0.16 + Math.sin(t * 2.3 + o.k * 2) * 0.08, lw.z + Math.sin(a) * r);
      o.trail.position.copy(o.pos);
      o.pos.lerp(tmp, 1 - Math.exp(-12 * dt));
      o.g.position.copy(o.pos);
      const pulse = 1 + 0.15 * Math.sin(t * 6 + o.k * 2.1);
      o.halo.scale.setScalar(0.6 * pulse * (1 + flareBurst * 0.8));
      o.core.scale.setScalar(pulse);
    }
  }

  function visuals(dt, t, playing) {
    const pinned = pinT > 0 || player.kinematic;
    if (!pinned) extVel.multiplyScalar(Math.exp(-12 * dt));
    const hs = pinned ? Math.hypot(extVel.x, extVel.z) : Math.hypot(vel.x, vel.z);
    player.speed = hs;

    // Character transform (visual yaw smoothing + step-up smoothing).
    stepOffset = damp(stepOffset, 0, 16, dt);
    if (Math.abs(stepOffset) > 0.6) stepOffset = 0;
    visYaw = dampAngle(visYaw, player.yaw, 16, dt);
    character.root.position.set(pos.x, pos.y + stepOffset, pos.z);
    character.root.rotation.y = visYaw;

    // Anim state.
    let st;
    const forced = player.pose || player.animOverride || null; // animOverride: alias used by the intro
    if (forced) st = forced;
    else if (climb) st = 'climb';
    else if (player.swimming) st = 'swim';
    else if (player.gliding) st = 'glide';
    else if (player.sliding) st = 'slide';
    else if (pinned && Math.abs(extVel.y) > 0.8) st = extVel.y > 0 ? 'jump' : 'fall';
    else if (!player.grounded && airTime > 0.06) st = vel.y > 0.5 ? 'jump' : 'fall';
    else st = hs > 0.25 ? (hs > 4.4 ? 'run' : 'walk') : 'idle';
    anim.state = st;
    anim.speed = hs;
    // The intro seats the player on the boat floorboards via animOverride = 'sit'.
    anim.sitStyle = player.pose ? poseOpts.sitStyle : (player.animOverride === 'sit' ? 'floor' : undefined);
    anim.seat = player.pose ? poseOpts.seat : undefined;
    anim.flare = flareT > 0 ? (flareT > 0.2 ? 1 : flareT / 0.2) : 0;
    anim.waterY = waterDepth > 0.1 || player.swimming ? surf : -1e9;
    // Look at the focused interactable (people, flames, campfires).
    const focus = ctx.interact?.focus;
    if (focus && (state.mode === 'play' || state.mode === 'dialogue')) {
      const p = ctx.interact.position(focus);
      lookTmp.set(p.x, (p.y ?? pos.y + 1.5), p.z);
      lastLook = lookTmp;
    } else if (state.mode !== 'dialogue') lastLook = null;
    anim.lookAt = lastLook;
    character.setKainOpen(player.gliding ? 1 : 0);
    character.update(dt, anim);

    // Lantern socket in world space.
    character.lanternSocket.getWorldPosition(player.lanternWorld);

    // Light.
    litK = litK < litTarget ? Math.min(litTarget, litK + litRate * dt) : Math.max(litTarget, litK - litRate * dt);
    const nyala = clamp(state.progress.nyala ?? 100, 0, 100) / 100;
    const fizz = fizzleT > 0 ? 0.55 + 0.45 * Math.abs(Math.sin(fizzleT * 30)) : 1;
    const flick = 1 + 0.055 * Math.sin(t * 11.3) + 0.035 * Math.sin(t * 23.1 + 0.7) + 0.03 * Math.sin(t * 5.3 + 2.1) * Math.sin(t * 1.7);
    // lanternBoost (intro): external multiplier on radius + light, handled here.
    const boost = Number.isFinite(player.lanternBoost) ? Math.max(0, player.lanternBoost) : 1;
    const radius = Math.max(boost < 1 ? 0.6 : 0, (7 + 11 * nyala) * (0.12 + 0.88 * litK) * boost);
    player.lanternRadius = radius + flareBurst * 2.5;
    const lw = player.lanternWorld;
    // Offset the light a little up and away from the body so the hand/leg is not blown out.
    const yaw = visYaw;
    light.position.set(lw.x + Math.cos(yaw) * 0.18, lw.y + 0.35, lw.z - Math.sin(yaw) * 0.18);
    const lb = clamp(boost, 0, 1.6);
    light.intensity = ((1.6 + 3.4 * nyala) * flick * fizz * litK) * lb + flareBurst * 11 + igniteFlash * 9;
    light.distance = Math.max(4, radius + 5 + flareBurst * 8);
    character.setFlame((litK * (0.45 + 0.55 * nyala) * flick * fizz) * Math.min(1.4, 0.15 + lb) + flareBurst * 1.4 + igniteFlash * 1.2);

    updateOrbs(dt, t);

    // Swim wake + slide dust.
    if (player.swimming && hs > 0.8) {
      wakeT -= dt;
      if (wakeT <= 0) { wakeT = 0.42; fx.ripple(pos.x, surf, pos.z, 1.1); }
    }
    if (player.sliding && hs > 2) {
      slideDustT -= dt;
      if (slideDustT <= 0) { slideDustT = 0.12; fx.dust(pos.x, pos.y, pos.z, 0.3); }
    }
    fx.update(dt);
  }

  // Initial placement.
  player.teleport(S.x, S.y, S.z, S.yaw);
  return player;
}

const SAND_DUST = { r: 0.62, g: 0.55, b: 0.44 };
