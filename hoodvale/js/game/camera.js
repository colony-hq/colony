// RuneScape-style camera: orbits the player; arrow keys / middle-drag / one-finger drag rotate,
// wheel / pinch zoom. Modes: 'follow' (play), 'login' (slow scenic orbit), 'debug' (hands off),
// 'focus' (look at a point, used by cutscenes and dialogue if desired).
// Owner: game builder (baseline by integration).

export function createCamera(ctx) {
  const { camera, input, state, map } = ctx;
  const rig = {
    yaw: Math.PI * 0.15, // around the player; 0 = camera south of the player looking north
    pitch: 0.72, // radians above the horizon
    distance: 14,
    minDistance: 5, maxDistance: 32,
    mode: 'login',
    focus: null,
    setMode(m) { rig.mode = m; },
    focusOn(point) { rig.focus = point; rig.mode = 'focus'; },
    snap: true,
    update(dt) {
      if (rig.mode === 'debug') return;
      const typing = input.typing;
      const sp = (state.settings.cameraSpeed || 1) * dt;
      if (!typing) {
        if (input.down('ArrowLeft') || input.down('KeyA')) rig.yaw += 1.9 * sp;
        if (input.down('ArrowRight') || input.down('KeyD')) rig.yaw -= 1.9 * sp;
        if (input.down('ArrowUp') || input.down('KeyW')) rig.pitch += 1.1 * sp;
        if (input.down('ArrowDown') || input.down('KeyS')) rig.pitch -= 1.1 * sp;
      }
      rig.yaw += input.orbit.yaw;
      rig.pitch += input.orbit.pitch;
      rig.pitch = Math.max(0.28, Math.min(1.42, rig.pitch));
      const z = input.zoom * (state.settings.invertZoom ? -1 : 1);
      if (z) rig.distance = Math.max(rig.minDistance, Math.min(rig.maxDistance, rig.distance * (1 + z * 0.1)));

      let tx, ty, tz;
      if (rig.mode === 'login') {
        rig.yaw += dt * 0.05;
        tx = 186; tz = 248; ty = map.heightAt(tx, tz) + 2;
        place(tx, ty, tz, 60, 0.5, dt, true);
        return;
      }
      if (rig.mode === 'focus' && rig.focus) { tx = rig.focus.x; ty = rig.focus.y; tz = rig.focus.z; }
      else {
        const p = ctx.player?.pos;
        if (!p) return;
        tx = p.x; ty = p.y + 1.2; tz = p.z;
      }
      place(tx, ty, tz, rig.distance, rig.pitch, dt, rig.snap);
      rig.snap = false;
    },
  };
  let cx = 0, cy = 0, cz = 0;
  function place(tx, ty, tz, dist, pitch, dt, snap) {
    const k = snap ? 1 : 1 - Math.exp(-12 * dt);
    cx += (tx - cx) * k; cy += (ty - cy) * k; cz += (tz - cz) * k;
    const horiz = Math.cos(pitch) * dist;
    let px = cx + Math.sin(rig.yaw) * horiz;
    let pz = cz + Math.cos(rig.yaw) * horiz;
    let py = cy + Math.sin(pitch) * dist;
    // Keep above the ground.
    const g = map.heightAt(px, pz) + 1.2;
    if (py < g) py = g;
    camera.position.set(px, py, pz);
    camera.lookAt(cx, cy, cz);
  }
  ctx.events.on('mode:change', ({ mode }) => {
    if (mode === 'play') { rig.mode = 'follow'; rig.snap = true; }
    if (mode === 'login') rig.mode = 'login';
  });
  ctx.events.on('player:teleport', () => { rig.snap = true; });
  return rig;
}
