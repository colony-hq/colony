// Camera / cinematic helpers shared by intro, flames (candi door), finale (owner: gameplay).
// All camera work goes through cameraRig.playPath (DESIGN §7) — keys use ABSOLUTE times
// (seconds since the path started, first key t = 0).

import * as THREE from 'three';

const _f = new THREE.Vector3();

// Current camera pose as a key (look point 12 m ahead).
export function currentCameraKey(ctx, t = 0) {
  const cam = ctx.camera;
  cam.getWorldDirection(_f);
  return {
    pos: [cam.position.x, cam.position.y, cam.position.z],
    look: [cam.position.x + _f.x * 12, cam.position.y + _f.y * 12, cam.position.z + _f.z * 12],
    t,
  };
}

export function playCamera(ctx, keys, opts = {}) {
  const rig = ctx.cameraRig;
  if (!rig) return Promise.resolve();
  try {
    rig.setMode?.('cinematic');
    const r = rig.playPath?.(keys, opts);
    return r && typeof r.then === 'function' ? r : Promise.resolve();
  } catch (err) {
    console.warn('[director] playPath failed', err);
    return Promise.resolve();
  }
}

export function releaseCamera(ctx, snap = true) {
  const rig = ctx.cameraRig;
  if (!rig) return;
  try {
    rig.stopPath?.();
    rig.setMode?.('follow');
    if (snap) rig.snapBehindPlayer?.();
  } catch (err) {
    console.warn('[director] release failed', err);
  }
}

// Run a short gameplay cinematic: mode 'cinematic', control off, camera path, then restore play.
// Returns a promise that resolves after `seconds` of sim time (fx clock), regardless of the path.
export function miniCinematic(ctx, fx, keys, seconds, { snap = true } = {}) {
  const { state, player } = ctx;
  const prevMode = state.mode;
  if (prevMode !== 'play') return Promise.resolve(false);
  state.setMode('cinematic');
  player?.setControl?.(false);
  playCamera(ctx, keys);
  return fx.wait(seconds).then(() => {
    releaseCamera(ctx, snap);
    if (state.mode === 'cinematic') state.setMode('play');
    player?.setControl?.(true);
    return true;
  });
}

export function emitSubtitle(ctx, speaker, text, seconds = 4.5) {
  ctx.events.emit('subtitle', { speaker, text, seconds });
}
