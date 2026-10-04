// STUB — owner: player. Simple orbit follow. API: DESIGN.md §Camera.
import * as THREE from 'three';

export function createCameraRig(ctx) {
  const cam = ctx.camera;
  const rig = {
    yaw: 0, pitch: 0.25, distance: 6,
    mode: 'follow',
    setMode(m) { rig.mode = m; },
    shake(strength = 0.3, duration = 0.3) {},
    playPath(points, opts = {}) { return Promise.resolve(); },
    stopPath() {},
    focusOn(target, opts = {}) {},
    snapBehindPlayer() { rig.yaw = ctx.player?.yaw ?? 0; },
    update(dt) {
      if (rig.mode === 'debug') return;
      const { input, state } = ctx;
      if (state.mode === 'play') {
        rig.yaw -= input.look.x;
        rig.pitch = Math.max(-0.5, Math.min(1.2, rig.pitch + input.look.y * (state.settings.invertY ? -1 : 1)));
      }
      const p = ctx.player?.position;
      if (!p) return;
      const tx = p.x, ty = p.y + 1.6, tz = p.z;
      const cx = tx + Math.sin(rig.yaw) * Math.cos(rig.pitch) * rig.distance;
      const cz = tz + Math.cos(rig.yaw) * Math.cos(rig.pitch) * rig.distance;
      const cy = ty + Math.sin(rig.pitch) * rig.distance;
      cam.position.set(cx, cy, cz);
      cam.lookAt(tx, ty, tz);
    },
  };
  return rig;
}
