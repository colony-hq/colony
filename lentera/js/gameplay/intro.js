// Intro cinematic (owner: gameplay), ~20 s, skippable (hold cancel/confirm 0.8 s, or emit
// 'intro:skip'). Fade from black on the sea at dusk → perahu glides through the kabut to the
// pier → title card → bump → hop onto the pier → the lantern ignites with a bloom flash and the
// kabut rolls back → Mbah Sarni calls from the kampung → play.

import * as THREE from 'three';
import { LANDMARKS } from '../world/heightfield.js';
import { patchMaterial } from '../world/fog.js';
import { playCamera, releaseCamera, emitSubtitle } from './director.js';
import { clamp, easeOutCubic } from '../core/math.js';

const DURATION = 20.2;
const BOAT_T = 13.4; // arrival at the pier
const HOP_T = 14.1;
const HOP_DUR = 0.65;
const IGNITE_T = 15.2;
const SKIP_HOLD = 0.8;

// Simple jukung, only used when structures has no boat (stub).
function fallbackBoat(ctx) {
  const g = new THREE.Group();
  const wood = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.85 }));
  const paint = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.7 }));
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 6.4, 10, 1, false, 0, Math.PI), paint);
  hull.rotation.x = Math.PI / 2;
  hull.rotation.z = Math.PI;
  hull.position.y = 0.55;
  hull.scale.set(1, 1, 0.8);
  g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 5.6), wood);
  deck.position.y = 0.52;
  g.add(deck);
  for (const z of [-1.4, 1.2]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.1, 0.14), wood);
    beam.position.set(0, 0.85, z);
    g.add(beam);
  }
  for (const x of [-2.2, 2.2]) {
    const out = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 4.8, 6), wood);
    out.rotation.x = Math.PI / 2;
    out.position.set(x, 0.18, -0.1);
    g.add(out);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  ctx.scene.add(g);
  return {
    object: g,
    manual: true,
    fallback: true,
    setPose(x, z, yaw) { g.position.x = x; g.position.z = z; g.rotation.y = yaw; },
  };
}

export function createIntro(ctx, fx, { onDone } = {}) {
  const { events, state, input } = ctx;
  const S = LANDMARKS.spawn;
  const B0 = LANDMARKS.boatStart, B2 = LANDMARKS.boatMoor;
  const B1 = { x: B2.x + 7.5, z: (B0.z + B2.z) / 2 - 8 }; // approach curving in from the east

  let boat = null;
  let seatLocal = null;
  let active = false;
  let t = 0;
  let fired = new Set();
  let skipHold = 0;
  let skipping = false;
  let hopFrom = null;
  const seat = new THREE.Vector3();

  function getBoat() {
    if (boat) return boat;
    boat = ctx.structures?.boat || null;
    if (!boat || !boat.object) boat = fallbackBoat(ctx);
    // Seat offset in boat space (the real jukung exposes seatLocal; else convert the anchor).
    const a = ctx.structures?.anchors?.['boat:seat'];
    if (boat.seatLocal && Number.isFinite(boat.seatLocal.x)) {
      seatLocal = new THREE.Vector3().copy(boat.seatLocal);
    } else if (a && !boat.fallback) {
      boat.object.updateMatrixWorld(true);
      seatLocal = boat.object.worldToLocal(new THREE.Vector3(a.x, a.y, a.z));
      if (seatLocal.length() > 8) seatLocal = null; // anchor not in the boat's frame: ignore
    }
    if (!seatLocal) seatLocal = new THREE.Vector3(0, 0.56, 1.3);
    return boat;
  }

  // Boat trajectory (quadratic Bézier, Hermite-eased: ~6 m/s → drifting in).
  function boatAt(time, out = {}) {
    const s = clamp(time / BOAT_T, 0, 1);
    const m0 = 1.05, m1 = 0.06;
    const s2 = s * s, s3 = s2 * s;
    const u = (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) + (s3 - s2) * m1;
    const a = 1 - u;
    out.x = a * a * B0.x + 2 * a * u * B1.x + u * u * B2.x;
    out.z = a * a * B0.z + 2 * a * u * B1.z + u * u * B2.z;
    const dx = 2 * a * (B1.x - B0.x) + 2 * u * (B2.x - B1.x);
    const dz = 2 * a * (B1.z - B0.z) + 2 * u * (B2.z - B1.z);
    out.yaw = Math.atan2(-dx, -dz);
    if (s >= 1) out.yaw = B2.yaw ?? 0;
    return out;
  }

  const bp = {};
  function poseBoat(time) {
    const b = getBoat();
    boatAt(time, bp);
    let { x, z, yaw } = bp;
    // Pier bump: recoil + settle.
    const sinceBump = time - BOAT_T;
    let roll = 0;
    if (sinceBump > 0) {
      const k = Math.exp(-sinceBump * 3.2);
      x += Math.sin(sinceBump * 9) * 0.12 * k;
      roll = Math.sin(sinceBump * 7) * 0.05 * k;
    }
    b.setPose?.(x, z, yaw);
    b.setSail?.(time < BOAT_T - 1.5);
    const o = b.object;
    const tt = ctx.time.t;
    const wh = ctx.ocean?.waveHeight;
    let y = 0.05 + Math.sin(tt * 1.6) * 0.05, pitch = Math.sin(tt * 1.15) * 0.018;
    if (wh) {
      const fx_ = -Math.sin(yaw), fz_ = -Math.cos(yaw);
      const h0 = wh(x, z, tt), hf = wh(x + fx_ * 2, z + fz_ * 2, tt), hb = wh(x - fx_ * 2, z - fz_ * 2, tt);
      y = h0 + 0.02;
      pitch += (hf - hb) * 0.18;
    }
    o.position.y = y;
    o.rotation.x = pitch;
    o.rotation.z = roll + Math.sin(tt * 0.9) * 0.03;
    o.updateMatrixWorld(true);
    return o;
  }

  function seatWorld() {
    const o = getBoat().object;
    return seat.copy(seatLocal).applyMatrix4(o.matrixWorld);
  }

  function placePlayer(x, y, z, yaw) {
    const p = ctx.player;
    if (!p) return;
    p.teleport?.(x, y, z, yaw);
    if (p.object) {
      p.object.position.set(x, y, z);
      if (yaw !== undefined) p.object.rotation.y = yaw;
    }
  }

  function fullRadius() { return 7 + 11 * clamp(state.progress.nyala, 0, 100) / 100; }

  function setLantern(boost) {
    const p = ctx.player;
    if (!p) return;
    p.lanternBoost = boost;
    if (p.lanternBoostHandled) return; // the controller applies it to radius + light itself
    p.lanternRadius = Math.max(0.6, fullRadius() * boost);
    if (p.lanternLight) {
      if (p._introBaseLight == null) p._introBaseLight = p.lanternLight.intensity;
      p.lanternLight.intensity = p._introBaseLight * clamp(boost, 0, 1.6);
    }
  }

  function buildCameraKeys() {
    const k = (time, off, lookOff) => {
      const b = boatAt(time, {});
      return { pos: [b.x + off[0], 0.2 + off[1], b.z + off[2]], look: [b.x + lookOff[0], lookOff[1], b.z + lookOff[2]], t: time };
    };
    return [
      k(0, [13, 2.0, 9], [0, 1.0, -4]),
      k(4, [9.5, 1.7, 4], [0, 1.2, -6]),
      k(8.2, [-2.6, 2.3, 9.5], [0, 2.0, -26]),
      k(11.8, [-6.2, 3.0, 6.5], [-1.5, 1.4, -3]),
      { pos: [-5.0, 3.6, 249.5], look: [1.6, 1.5, 243.4], t: 14.0 },
      { pos: [S.x + 0.6, S.y + 1.25, S.z - 3.1], look: [S.x, S.y + 1.2, S.z], t: 15.3 },
      { pos: [S.x + 1.4, S.y + 1.5, S.z - 3.6], look: [S.x, S.y + 1.3, S.z], t: 16.6 },
      { pos: [S.x + 4.8, S.y + 2.2, S.z + 1.2], look: [S.x, S.y + 1.4, S.z - 2], t: 18.4 },
      { pos: [S.x, S.y + 2.9, S.z + 5.4], look: [S.x, S.y + 1.6, S.z - 6], t: DURATION },
    ];
  }

  function at(time) {
    if (t >= time && !fired.has(time)) { fired.add(time); return true; }
    return false;
  }

  function start() {
    active = true;
    skipping = false;
    t = 0;
    fired = new Set();
    skipHold = 0;
    hopFrom = null;
    state.setMode('intro');
    const p = ctx.player;
    p?.setControl?.(false);
    p?.setLanternLit?.(false, 0);
    if (p) p.animOverride = 'sit';
    const b = getBoat();
    b.manual = true;
    poseBoat(0);
    const s = seatWorld();
    placePlayer(s.x, s.y, s.z, bp.yaw);
    setLantern(0.06);
    fx.fade(true, 0);
    playCamera(ctx, buildCameraKeys(), { ease: false });
    events.emit('intro:start', {});
  }

  function finish(skipped) {
    if (!active) return;
    active = false;
    skipping = false;
    const b = getBoat();
    boatAt(BOAT_T, bp);
    b.setPose?.(B2.x, B2.z, B2.yaw ?? 0);
    b.setSail?.(false);
    b.manual = !!b.fallback;
    const p = ctx.player;
    if (p) {
      p.animOverride = null;
      p.lanternBoost = undefined;
      p.setLanternLit?.(true, skipped ? 0.4 : 0);
      if (!p.lanternBoostHandled) {
        if (p._introBaseLight != null && p.lanternLight) p.lanternLight.intensity = p._introBaseLight;
        p.lanternRadius = fullRadius();
      }
      p._introBaseLight = null;
    }
    placePlayer(S.x, S.y, S.z, S.yaw ?? 0);
    ctx.fog?.removeClearing?.('intro');
    releaseCamera(ctx, true);
    if (skipped) events.emit('subtitle:clear', {});
    state.setMode('play');
    p?.setControl?.(true);
    events.emit('intro:skipProgress', { value: 0 });
    events.emit('intro:end', { skipped: !!skipped });
    onDone?.(skipped);
  }

  // Stop without handing over to play (quit to title mid-intro).
  function abort() {
    if (!active) return;
    active = false;
    skipping = false;
    const b = getBoat();
    b.setPose?.(B2.x, B2.z, B2.yaw ?? 0);
    b.setSail?.(false);
    b.manual = !!b.fallback;
    const p = ctx.player;
    if (p) {
      p.animOverride = null;
      p.lanternBoost = undefined;
      p.setLanternLit?.(true, 0);
      p._introBaseLight = null;
    }
    ctx.fog?.removeClearing?.('intro');
    events.emit('subtitle:clear', {});
    events.emit('intro:skipProgress', { value: 0 });
    events.emit('intro:end', { aborted: true });
    fx.fade(false, 0);
  }

  function skip(instant = false) {
    if (!active || skipping) return;
    if (instant) { finish(true); fx.fade(false, 0); return; }
    skipping = true;
    fx.fade(true, 0.3).then(() => {
      finish(true);
      fx.fade(false, 0.9);
    });
  }
  events.on('intro:skip', () => skip(false));

  function update(dt) {
    if (!active) return;
    if (state.mode === 'play') state.setMode('intro'); // menus may set play right after game:start
    if (state.mode !== 'intro') return; // paused
    t += dt;
    // Hold-to-skip.
    if (!skipping && t > 0.6) {
      const holding = input.down('cancel') || input.down('confirm');
      const before = skipHold;
      skipHold = holding ? skipHold + dt : Math.max(0, skipHold - dt * 2);
      if (Math.abs(before - skipHold) > 1e-4) events.emit('intro:skipProgress', { value: clamp(skipHold / SKIP_HOLD, 0, 1) });
      if (skipHold >= SKIP_HOLD) { skip(false); }
    }
    const p = ctx.player;
    // Boat + player.
    poseBoat(Math.min(t, BOAT_T + 3));
    if (t < HOP_T) {
      const s = seatWorld();
      placePlayer(s.x, s.y, s.z, bp.yaw);
    } else if (t < HOP_T + HOP_DUR) {
      if (!hopFrom) {
        hopFrom = seatWorld().clone();
        if (p) p.animOverride = null;
        events.emit('intro:beat', { name: 'hop' });
      }
      const k = (t - HOP_T) / HOP_DUR;
      const x = THREE.MathUtils.lerp(hopFrom.x, S.x, k);
      const z = THREE.MathUtils.lerp(hopFrom.z, S.z, k);
      const y = THREE.MathUtils.lerp(hopFrom.y, S.y, k) + Math.sin(k * Math.PI) * 0.95;
      const yaw = Math.atan2(-(S.x - hopFrom.x), -(S.z - hopFrom.z));
      placePlayer(x, y, z, k < 0.8 ? yaw : S.yaw ?? 0);
    } else {
      placePlayer(S.x, S.y, S.z, S.yaw ?? 0);
    }
    // Beats.
    if (at(0.25)) fx.fade(false, 3.2);
    if (at(2.6)) events.emit('intro:title', { title: 'LENTERA', subtitle: 'Kabut Nusantara' });
    if (at(BOAT_T)) {
      fx.shake(0.22, 0.35);
      events.emit('intro:beat', { name: 'bump' });
    }
    if (at(HOP_T + HOP_DUR)) fx.shake(0.12, 0.2);
    // Lantern: dim ember during the crossing, ignites on the pier.
    if (t < IGNITE_T) {
      setLantern(0.06 + 0.03 * Math.sin(t * 7) * Math.sin(t * 3.1));
    } else {
      const k = (t - IGNITE_T) / 2.2;
      const boost = k >= 1 ? 1 : k < 0.45 ? easeOutCubic(k / 0.45) * 1.18 : 1.18 - 0.18 * easeOutCubic((k - 0.45) / 0.55);
      setLantern(Math.max(0.06, boost));
    }
    if (at(IGNITE_T)) {
      p?.setLanternLit?.(true, 0.45);
      const lw = p?.lanternWorld && p.lanternWorld.lengthSq() > 0 ? p.lanternWorld : new THREE.Vector3(S.x + 0.35, S.y + 1.0, S.z - 0.2);
      fx.bloomPulse(2.2, 2.4, 0.15);
      fx.flash(lw, 0xffb050, 120, 1.6, 22);
      fx.burst({ x: lw.x, y: lw.y, z: lw.z, count: 60, color: 0xffb860, speed: 5, sphere: true, life: 1.2, size: 0.14, drag: 2.6 });
      fx.shell({ x: lw.x, y: lw.y, z: lw.z, radius: 16, duration: 1.6, color: 0xffc070, intensity: 1.5, power: 2.2, squash: 0.6 });
      fx.ring({ x: S.x, y: S.y, z: S.z, radius: 3.5, duration: 0.8, color: 0xffd090, width: 0.5, fill: 0.25, intensity: 1.4 });
      fx.shake(0.18, 0.4);
      events.emit('intro:beat', { name: 'ignite' });
      // The kabut rolls back further than the bubble, then settles.
      fx.tween(2.0, (k) => ctx.fog?.setClearing?.('intro', S.x, S.z, Math.max(0.5, 30 * easeOutCubic(k)), 1, true),
        () => fx.after(1.6, () => ctx.fog?.removeClearing?.('intro')));
    }
    if (at(IGNITE_T + 0.6)) events.emit('hint', { text: 'Lenteramu menyala. Cahayanya mendorong kabut menjauh.', seconds: 4 });
    if (at(IGNITE_T + 1.6)) emitSubtitle(ctx, 'Mbah Sarni', 'Nak… ke sini, dekat api. Kabut ini ndak suka cahaya.', 5);
    if (t >= DURATION) finish(false);
  }

  // Debug: fast-forward the intro (screenshots in slow headless runs).
  function seek(time) {
    if (!active) return;
    while (active && t < time - 1e-6) update(Math.min(0.05, time - t));
  }

  return {
    get active() { return active; },
    get time() { return t; },
    seek,
    abort,
    start,
    finish,
    skip,
    update,
    boatAt,
  };
}
