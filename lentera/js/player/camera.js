// Camera rig: third-person follow that never fights the player, dialogue framing, title orbit,
// cinematic Catmull-Rom paths, trauma shake, and smooth blends between all of them.
// Owner: player. Contract: DESIGN.md §7 Player (camera).

import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp, easeInOut, wrapAngle, smoothstep } from '../core/math.js';
import { heightAt, SEA_LEVEL } from '../world/heightfield.js';

export const CAM_TUNE = {
  distance: 5.2, minZoom: 3, maxZoom: 9,
  pitch: 0.24, pitchMin: -0.42, pitchMax: 1.2,
  pivotHeight: 1.45,
  recenterDelay: 2.5, recenterRate: 0.9,
  sprintFov: 6, glideFov: 9, glidePull: 1.8, sprintPull: 0.45,
};

const BLEND = { follow: 0.7, dialogue: 0.9, title: 1.4, cinematic: 0, debug: 0 };

export function createCameraRig(ctx) {
  const { events, state, input, collision } = ctx;
  const cam = ctx.camera;
  const C = CAM_TUNE;
  const baseFov = cam.fov || 58;

  // Follow state.
  const pivot = new THREE.Vector3();
  let pivotInit = false;
  let zoomTarget = C.distance, zoomCur = C.distance, dist = C.distance;
  let lookIdle = 10, sprintK = 0, glideK = 0, swimK = 0;
  let recenter = null;
  let snapNext = true;
  let fov = baseFov;

  // Blending between modes.
  const fromPos = new THREE.Vector3(), fromQuat = new THREE.Quaternion();
  let fromFov = baseFov, blendT = 1, blendDur = 0;

  // Desired pose this frame.
  const want = new THREE.Vector3(), wantLook = new THREE.Vector3(), wantQuat = new THREE.Quaternion();
  let wantFov = baseFov;
  const dummy = new THREE.PerspectiveCamera(); // camera-type so lookAt aims -z at the target
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  // Shake.
  let trauma = 0, traumaDecay = 2, shakeTime = 0;

  // Dialogue.
  let focus = null;
  // Title.
  let titleAngle = 0.35;
  // Cinematic path.
  let path = null;

  const rig = {
    yaw: ctx.player?.yaw ?? 0,
    pitch: C.pitch,
    distance: C.distance,
    mode: state.mode === 'loading' || state.mode === 'title' ? 'title' : 'follow',
    tune: C,
    get playing() { return !!(path && !path.done); },

    setMode(m, opts = {}) {
      if (!BLEND.hasOwnProperty(m)) return;
      const prev = rig.mode;
      if (m === prev && !opts.force) return;
      fromPos.copy(cam.position);
      fromQuat.copy(cam.quaternion);
      fromFov = cam.fov;
      blendDur = opts.blend ?? BLEND[m];
      blendT = blendDur > 0 ? 0 : 1;
      if (m !== 'dialogue') focus = null;
      if (m === 'follow') {
        const p = ctx.player?.position;
        if (p) {
          // Start the orbit where the camera already is, so the return is a short move.
          const far = cam.position.distanceTo(p) > 60 || prev === 'title';
          if (far) { snapBehind(); blendT = 1; }
          else {
            tmp.copy(cam.position).sub(p);
            tmp.y -= C.pivotHeight;
            const d = tmp.length();
            if (d > 0.5) {
              rig.yaw = Math.atan2(tmp.x, tmp.z);
              rig.pitch = clamp(Math.asin(clamp(tmp.y / d, -1, 1)), C.pitchMin, C.pitchMax);
              dist = clamp(d, 1, C.maxZoom + 2);
            }
            pivot.set(p.x, p.y + C.pivotHeight, p.z);
            pivotInit = true;
          }
          lookIdle = 0;
        }
      }
      if (m !== 'cinematic' && path && !opts.keepPath) rig.stopPath();
      rig.mode = m;
    },

    shake(strength = 0.3, duration = 0.3) {
      if (state.settings?.cameraShake === false) return;
      trauma = Math.min(1, trauma + Math.max(0, strength));
      traumaDecay = Math.max(traumaDecay * 0.5, 1 / Math.max(0.08, duration));
    },

    // keys: [{pos:[x,y,z]|Vector3, look:[x,y,z]|Vector3, t: seconds from start, fov?}]
    // opts: { ease = true, fov, blend (seconds to blend from the current camera into the path) }
    playPath(keys, opts = {}) {
      if (path) rig.stopPath();
      const list = (keys || []).filter((k) => k && k.pos && k.look);
      if (!list.length) return Promise.resolve();
      const v = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
      const P = list.map((k) => v(k.pos));
      const L = list.map((k) => v(k.look));
      // Times: absolute when non-decreasing, otherwise treat them as segment durations.
      let times = list.map((k) => (typeof k.t === 'number' ? k.t : NaN));
      if (times.some((x) => !Number.isFinite(x))) {
        const dur = opts.duration ?? 2 * Math.max(1, list.length - 1);
        times = list.map((_, i) => (list.length > 1 ? (i / (list.length - 1)) * dur : dur));
      } else if (times.some((x, i) => i > 0 && x < times[i - 1])) {
        let acc = 0;
        times = times.map((x, i) => (i === 0 ? (acc = 0) : (acc += Math.max(0, x))));
      }
      if (P.length === 1) { P.push(P[0].clone()); L.push(L[0].clone()); times.push(times[0]); }
      const curve = (pts) => new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
      return new Promise((resolve) => {
        path = {
          P, L, times, fovs: list.map((k) => k.fov), posCurve: curve(P), lookCurve: curve(L),
          T: times[times.length - 1], t0: times[0], time: 0, ease: opts.ease !== false,
          fov: opts.fov, resolve, done: false,
        };
        rig.setMode('cinematic', { blend: opts.blend ?? 0, keepPath: true, force: true });
        if (!(opts.blend > 0)) evalPath(0);
      });
    },
    stopPath() {
      if (!path) return;
      const r = path.resolve;
      path.done = true;
      path = null;
      r?.();
    },

    // Over-the-shoulder framing between the player and target ({x,y,z}, an Object3D, or an
    // NPC record with .position / .character.headBone). opts: { side: 1|-1, height, blend }
    focusOn(target, opts = {}) {
      focus = { target, opts, side: opts.side ?? 0 };
      if (rig.mode !== 'dialogue') rig.setMode('dialogue', { blend: opts.blend ?? BLEND.dialogue });
    },

    snapBehindPlayer() { snapBehind(); },

    update(dt, t) {
      if (rig.mode === 'debug') return;
      if (dt <= 0) return;
      shakeTime += dt;
      let handled = true;
      switch (rig.mode) {
        case 'follow': follow(dt); break;
        case 'dialogue': dialogue(dt); break;
        case 'title': title(dt); break;
        case 'cinematic': handled = path ? evalPath(dt) : false; break;
        default: handled = false;
      }
      if (!handled) { applyShake(dt); return; }

      // Blend from the previous camera into the desired pose.
      dummy.position.copy(want);
      dummy.lookAt(wantLook);
      wantQuat.copy(dummy.quaternion);
      if (blendT < 1) {
        blendT = Math.min(1, blendT + dt / Math.max(1e-3, blendDur));
        const k = easeInOut(blendT);
        cam.position.lerpVectors(fromPos, want, k);
        cam.quaternion.slerpQuaternions(fromQuat, wantQuat, k);
        setFov(lerp(fromFov, wantFov, k));
      } else {
        cam.position.copy(want);
        cam.quaternion.copy(wantQuat);
        setFov(wantFov);
      }
      applyShake(dt);
      rig.distance = dist;
    },
  };

  function setFov(f) {
    if (Math.abs(cam.fov - f) > 0.01) {
      cam.fov = f;
      cam.updateProjectionMatrix();
    }
  }

  function snapBehind() {
    const pl = ctx.player;
    if (!pl) return;
    rig.yaw = pl.yaw;
    rig.pitch = C.pitch;
    pivot.set(pl.position.x, pl.position.y + C.pivotHeight, pl.position.z);
    pivotInit = true;
    dist = zoomCur = zoomTarget;
    recenter = null;
    snapNext = false;
    lookIdle = 0;
  }

  // ------------------------------------------------------------------------------------------
  // Follow
  // ------------------------------------------------------------------------------------------
  function follow(dt) {
    const pl = ctx.player;
    if (!pl) return;
    const p = pl.position;
    const controlling = state.mode === 'play';
    if (controlling) {
      const inv = state.settings?.invertY ? -1 : 1;
      const lx = input.look.x, ly = input.look.y * inv;
      rig.yaw -= lx;
      rig.pitch += ly;
      if (Math.abs(lx) + Math.abs(ly) > 1e-5) { lookIdle = 0; recenter = null; } else lookIdle += dt;
      if (input.wheel) zoomTarget += input.wheel * 0.6;
      if (input.down('zoomIn')) zoomTarget -= 4 * dt;
      if (input.down('zoomOut')) zoomTarget += 4 * dt;
      zoomTarget = clamp(zoomTarget, C.minZoom, C.maxZoom);
      if (input.pressed('recenter')) {
        recenter = { t: 0, dur: 0.28, y0: rig.yaw, y1: rig.yaw + wrapAngle(pl.yaw - rig.yaw), p0: rig.pitch, p1: C.pitch };
        lookIdle = 0;
      }
    } else lookIdle += dt;

    if (recenter) {
      recenter.t += dt;
      const k = easeInOut(Math.min(1, recenter.t / recenter.dur));
      rig.yaw = lerp(recenter.y0, recenter.y1, k);
      rig.pitch = lerp(recenter.p0, recenter.p1, k);
      if (k >= 1) recenter = null;
    }

    const speed = pl.speed ?? Math.hypot(pl.velocity.x, pl.velocity.z);
    // Gentle auto-recenter behind the player while moving.
    if (!recenter && lookIdle > C.recenterDelay && speed > 1.5 && controlling) {
      const diff = wrapAngle(pl.yaw - rig.yaw);
      if (Math.abs(diff) < 2.3) {
        const rate = C.recenterRate * (pl.gliding ? 1.8 : 1) * smoothstep(1.5, 6, speed) * smoothstep(0, 0.6, lookIdle - C.recenterDelay);
        rig.yaw = dampAngle(rig.yaw, pl.yaw, rate, dt);
        rig.pitch = damp(rig.pitch, pl.gliding ? 0.34 : C.pitch, 0.6 * rate, dt);
      }
    }
    rig.pitch = clamp(rig.pitch, C.pitchMin, C.pitchMax);

    // Pivot: tight horizontally, softer vertically (jumps don't bob the view).
    const swimming = pl.swimming;
    const ty = p.y + (swimming ? 1.65 : C.pivotHeight);
    if (!pivotInit || snapNext || pivot.distanceTo(tmp.set(p.x, ty, p.z)) > 14) {
      pivot.set(p.x, ty, p.z);
      pivotInit = true;
      if (snapNext) { dist = zoomTarget; snapNext = false; }
    }
    pivot.x = damp(pivot.x, p.x, 20, dt);
    pivot.z = damp(pivot.z, p.z, 20, dt);
    let vy;
    if (pl.grounded || swimming || pl.sliding || pl.climbing) vy = ty > pivot.y ? 10 : 12;
    else if (pl.gliding) vy = 4;
    else vy = ty < pivot.y - 0.3 ? 9 : ty > pivot.y + 1.6 ? 5 : 1.6; // rising: lazy, falling below: catch up
    pivot.y = damp(pivot.y, ty, vy, dt);

    // Distance & lens.
    sprintK = damp(sprintK, pl.sprinting && speed > 6 && !swimming ? 1 : 0, 2.5, dt);
    glideK = damp(glideK, pl.gliding ? 1 : 0, 2.2, dt);
    swimK = damp(swimK, swimming ? 1 : 0, 3, dt);
    zoomCur = damp(zoomCur, zoomTarget, 7, dt);
    // Portrait screens: pull back and widen so the player does not fill the frame.
    const portrait = clamp((1.25 - (cam.aspect || 1.7)) / 0.75, 0, 1);
    const desired = zoomCur + sprintK * C.sprintPull + glideK * C.glidePull + swimK * 0.4 + portrait * 1.3;
    const cp = Math.cos(rig.pitch), sp = Math.sin(rig.pitch);
    const dx = Math.sin(rig.yaw) * cp, dy = sp, dz = Math.cos(rig.yaw) * cp;
    // Over-the-shoulder offset when zoomed in close.
    const shoulder = (1 - smoothstep(3, 4.6, zoomCur)) * 0.38;
    const ox = Math.cos(rig.yaw) * shoulder, oz = -Math.sin(rig.yaw) * shoulder;
    const px = pivot.x + ox, pz = pivot.z + oz;
    const hit = collision.raycast(px, pivot.y, pz, dx, dy, dz, desired + 0.35);
    const allowed = Math.max(0.75, hit - 0.35);
    if (allowed < dist) dist = allowed;
    else dist = damp(dist, allowed, 2.6, dt);
    want.set(px + dx * dist, pivot.y + dy * dist, pz + dz * dist);
    keepAboveGround(want);
    wantLook.set(px, pivot.y + 0.18 + Math.max(0, -rig.pitch) * 0.6, pz);
    wantFov = baseFov + sprintK * C.sprintFov + glideK * C.glideFov + portrait * 8;
  }

  function keepAboveGround(v) {
    const g = heightAt(v.x, v.z);
    if (v.y < g + 0.4) v.y = g + 0.4;
    if (g < SEA_LEVEL + 0.3) {
      const w = ctx.ocean?.waveHeight ? ctx.ocean.waveHeight(v.x, v.z, ctx.time?.t ?? 0) || 0 : 0;
      if (v.y < SEA_LEVEL + w + 0.38) v.y = SEA_LEVEL + w + 0.38;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Dialogue
  // ------------------------------------------------------------------------------------------
  function targetPoint(target, out) {
    const ch = target?.character;
    if (ch?.headBone) { ch.headBone.getWorldPosition(out); out.y += 0.08; return true; }
    if (target?.headBone) { target.headBone.getWorldPosition(out); out.y += 0.08; return true; }
    if (target?.isObject3D) { target.getWorldPosition(out); return false; } // feet
    if (target?.position && typeof target.position.x === 'number') {
      out.set(target.position.x, target.position.y ?? 0, target.position.z); // NPC record: feet
      return false;
    }
    // Plain {x, y, z}: the point to look at (dialogue passes the NPC head position).
    out.set(target?.x ?? 0, target?.y ?? 0, target?.z ?? 0);
    return !focus?.opts?.feet;
  }

  function dialogue(dt) {
    const pl = ctx.player;
    if (!pl || !focus) { follow(dt); return; }
    const p = pl.position;
    const isHead = targetPoint(focus.target, tmp2);
    if (!isHead) tmp2.y += focus.opts.height ?? 1.5;
    let dx = tmp2.x - p.x, dz = tmp2.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const rx = -dz, rz = dx; // right of the player->target line
    const head = p.y + (pl.character?.height ?? 1.8) * 0.88;
    if (!focus.side) {
      // Pick the side with more room.
      const a = collision.raycast(p.x, head, p.z, -dx + rx * 0.55, 0.15, -dz + rz * 0.55, 3);
      const b = collision.raycast(p.x, head, p.z, -dx - rx * 0.55, 0.15, -dz - rz * 0.55, 3);
      focus.side = a >= b - 0.2 ? 1 : -1;
    }
    const s = focus.side;
    // The dialogue panel covers the bottom ~45% (desktop) / ~55% (portrait phones), so frame the
    // NPC's face in the upper part of the screen with the player off to one side.
    const portrait = (ctx.engine?.size?.h ?? 1) > (ctx.engine?.size?.w ?? 1);
    const back = 2.0 + Math.min(1.4, d * 0.2) + (portrait ? 0.9 : 0);
    const sideOff = portrait ? 0.9 : 1.25;
    tmp.set(p.x - dx * back + rx * s * sideOff, head + 0.4, p.z - dz * back + rz * s * sideOff);
    // Pull in if blocked.
    const vx = tmp.x - p.x, vy = tmp.y - head, vz = tmp.z - p.z;
    const len = Math.hypot(vx, vy, vz);
    const hit = collision.raycast(p.x, head, p.z, vx, vy, vz, len + 0.3);
    const k = Math.max(0.3, Math.min(1, (hit - 0.3) / len));
    want.set(p.x + vx * k, head + vy * k, p.z + vz * k);
    keepAboveGround(want);
    // Aim below the NPC's head so the head lands ~30% from the top of the frame.
    const lx = lerp(p.x, tmp2.x, 0.85), lz = lerp(p.z, tmp2.z, 0.85);
    const camToNpc = Math.hypot(tmp2.x - want.x, tmp2.y - want.y, tmp2.z - want.z);
    const drop = camToNpc * Math.tan(((portrait ? 15 : 10.5) * Math.PI) / 180);
    wantLook.set(lx, tmp2.y - drop, lz);
    wantFov = baseFov - (portrait ? 2 : 8);
  }

  // ------------------------------------------------------------------------------------------
  // Title flyover
  // ------------------------------------------------------------------------------------------
  function title(dt) {
    titleAngle += dt * 0.018;
    want.set(Math.sin(titleAngle) * 300, 60, Math.cos(titleAngle) * 300);
    wantLook.set(0, 18, 0);
    wantFov = baseFov;
  }

  // ------------------------------------------------------------------------------------------
  // Cinematic path
  // ------------------------------------------------------------------------------------------
  function evalPath(dt) {
    if (!path) return false;
    path.time += dt;
    const { times, T, t0 } = path;
    let tt = path.time;
    if (path.ease && T > t0) tt = t0 + easeInOut(clamp((path.time - t0) / (T - t0), 0, 1)) * (T - t0);
    tt = clamp(tt, times[0], T);
    const n = times.length;
    let i = 0;
    while (i < n - 2 && times[i + 1] <= tt) i++;
    const seg = Math.max(1e-6, times[i + 1] - times[i]);
    const local = clamp((tt - times[i]) / seg, 0, 1);
    const u = n > 1 ? (i + local) / (n - 1) : 0;
    path.posCurve.getPoint(u, want);
    path.lookCurve.getPoint(u, wantLook);
    const f0 = path.fovs[i] ?? path.fov ?? baseFov, f1 = path.fovs[i + 1] ?? path.fov ?? baseFov;
    wantFov = lerp(f0, f1, local);
    if (path.time >= T && !path.done) {
      const r = path.resolve;
      path.done = true;
      // Hold the final frame until someone changes the mode.
      const last = { pos: want.clone(), look: wantLook.clone(), fov: wantFov };
      path = { ...path, P: [last.pos, last.pos], L: [last.look, last.look], times: [0, 0], T: 0, t0: 0, time: 0,
        posCurve: new THREE.CatmullRomCurve3([last.pos, last.pos.clone()]), lookCurve: new THREE.CatmullRomCurve3([last.look, last.look.clone()]),
        fovs: [last.fov, last.fov], resolve: null, done: true };
      r?.();
    }
    return true;
  }

  // ------------------------------------------------------------------------------------------
  // Shake (trauma^2, layered sines; respects settings.cameraShake)
  // ------------------------------------------------------------------------------------------
  function applyShake(dt) {
    if (trauma <= 0) return;
    if (state.settings?.cameraShake === false) { trauma = 0; return; }
    const s = trauma * trauma;
    const t = shakeTime;
    const n1 = Math.sin(t * 47.3) * 0.6 + Math.sin(t * 23.9 + 1.7) * 0.4;
    const n2 = Math.sin(t * 41.1 + 0.6) * 0.6 + Math.sin(t * 19.7 + 2.9) * 0.4;
    const n3 = Math.sin(t * 31.7 + 4.1) * 0.7 + Math.sin(t * 13.3) * 0.3;
    tmp.set(n1 * 0.28 * s, n2 * 0.22 * s, 0).applyQuaternion(cam.quaternion);
    cam.position.add(tmp);
    cam.rotateZ(n3 * 0.05 * s);
    cam.rotateX(n2 * 0.015 * s);
    trauma = Math.max(0, trauma - traumaDecay * dt);
  }

  // ------------------------------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------------------------------
  events.on('camera:shake', (e) => rig.shake(e?.strength ?? 0.3, e?.duration ?? 0.3));
  events.on('player:teleport', () => { snapNext = true; });
  events.on('mode:change', ({ mode }) => {
    if (rig.mode === 'debug') return;
    if (mode === 'title') rig.setMode('title');
    else if (mode === 'play') {
      if (rig.mode === 'title' || rig.mode === 'dialogue' || (rig.mode === 'cinematic' && !rig.playing)) rig.setMode('follow');
    }
  });
  // Clicking the canvas during play grabs the mouse (optional; drag-to-look always works).
  const canvas = ctx.renderer?.domElement;
  canvas?.addEventListener('click', () => {
    if (state.mode === 'play' && rig.mode === 'follow') input.requestPointerLock();
  });

  // Start somewhere sensible.
  if (rig.mode === 'title') title(0);
  else snapBehind();
  return rig;
}
