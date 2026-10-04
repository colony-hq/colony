// RuneScape-style camera: orbits the player; arrow keys / middle-drag / one-finger drag
// rotate, wheel / pinch zoom. Smoothed yaw / pitch / zoom, terrain collision along the whole
// sight line, automatic zoom-in indoors and in dungeons, screen shake.
// Modes: 'follow' (play), 'login' (slow scenic orbit), 'debug' (hands off), 'focus' (look at a
// point; cutscenes/dialogue). Owner: game builder.
// API: yaw, pitch, distance (user targets), minDistance, maxDistance, mode, setMode(m),
//      focusOn(point {x, y, z}), release() (back to follow), shake(strength), snap (bool).
// Listens: camera:shake {strength}, player:teleport, mode:change.

export function createCamera(ctx) {
  const { camera, input, state, map } = ctx;
  let cur = { yaw: Math.PI * 0.15, pitch: 0.72, dist: 14 }; // smoothed values actually used
  let shakeAmp = 0;
  let limit = 32; // current environment distance cap (indoors / dungeons)

  const rig = {
    yaw: Math.PI * 0.15, // around the player; 0 = camera south of the player looking north
    pitch: 0.72, // radians above the horizon
    distance: 14,
    minDistance: 4, maxDistance: 32,
    mode: 'login',
    focus: null,
    snap: true,
    setMode(m) { rig.mode = m; if (m === 'follow') rig.focus = null; },
    focusOn(point) { rig.focus = point; rig.mode = 'focus'; },
    release() { rig.focus = null; rig.mode = 'follow'; },
    shake(strength = 0.3) { shakeAmp = Math.min(1, Math.max(shakeAmp, strength)); },
    get effectiveDistance() { return cur.dist; },
    update(dt) {
      if (rig.mode === 'debug') return;
      const typing = input.typing;
      const sp = (state.settings.cameraSpeed || 1) * dt;
      if (!typing) {
        // WASD walks (game/player.js); arrows turn the camera.
        if (input.down('ArrowLeft')) rig.yaw += 1.9 * sp;
        if (input.down('ArrowRight')) rig.yaw -= 1.9 * sp;
        if (input.down('ArrowUp')) rig.pitch += 1.1 * sp;
        if (input.down('ArrowDown')) rig.pitch -= 1.1 * sp;
      }
      rig.yaw += input.orbit.yaw;
      rig.pitch += input.orbit.pitch;
      rig.pitch = Math.max(0.24, Math.min(1.45, rig.pitch));
      const z = input.zoom * (state.settings.invertZoom ? -1 : 1);
      if (z) rig.distance = Math.max(rig.minDistance, Math.min(rig.maxDistance, rig.distance * (1 + z * 0.1)));

      let tx, ty, tz;
      if (rig.mode === 'login') {
        rig.yaw += dt * 0.05;
        tx = 186; tz = 248; ty = map.heightAt(tx, tz) + 2;
        cur = { yaw: rig.yaw, pitch: 0.5, dist: 60 };
        place(tx, ty, tz, dt, true);
        return;
      }
      if (rig.mode === 'focus' && rig.focus) { tx = rig.focus.x; ty = rig.focus.y; tz = rig.focus.z; }
      else {
        const p = ctx.player?.pos;
        if (!p) return;
        tx = p.x; ty = p.y + 1.2; tz = p.z;
      }
      // Environment caps: indoors the roof is lifted by the art, but keep the camera close.
      const px = ctx.player?.x ?? 0, pz = ctx.player?.z ?? 0;
      const region = map.regionAt(px + 0.5, pz + 0.5).id;
      const want = map.isIndoor(px, pz) ? 9 : region !== 'overworld' ? 15 : rig.maxDistance;
      limit += (want - limit) * (1 - Math.exp(-4 * dt));
      const dist = Math.min(rig.distance, limit);
      // Smooth toward the user's targets (shortest yaw arc).
      const k = rig.snap ? 1 : 1 - Math.exp(-10 * dt);
      let dy = rig.yaw - cur.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      cur.yaw += dy * k;
      cur.pitch += (rig.pitch - cur.pitch) * k;
      cur.dist += (dist - cur.dist) * (rig.snap ? 1 : 1 - Math.exp(-7 * dt));
      place(tx, ty, tz, dt, rig.snap);
      rig.snap = false;
    },
  };

  let cx = 0, cy = 0, cz = 0, curLift = 0;
  function place(tx, ty, tz, dt, snap) {
    const k = snap ? 1 : 1 - Math.exp(-12 * dt);
    cx += (tx - cx) * k; cy += (ty - cy) * k; cz += (tz - cz) * k;
    const horiz = Math.cos(cur.pitch) * cur.dist;
    const px = cx + Math.sin(cur.yaw) * horiz;
    const pz = cz + Math.cos(cur.yaw) * horiz;
    const baseY = cy + Math.sin(cur.pitch) * cur.dist;
    // Collision along the sight line: raise the camera until every sample clears the ground
    // (hills) and the roofs of buildings between the camera and the player. The lift is smoothed
    // (fast up, slow down) so walking past a house doesn't make the camera jump.
    let need = baseY;
    const pIndoor = map.isIndoor(Math.floor(cx), Math.floor(cz));
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const sx = cx + (px - cx) * t, sz = cz + (pz - cz) * t;
      let g = map.heightAt(sx, sz) + (i === steps ? 1.0 : 0.6);
      if (!pIndoor && t > 0.12 && t < 0.95) {
        const f = map.tileFlags(Math.floor(sx), Math.floor(sz));
        if (f & (map.T.INDOOR | 32)) g += 6.2; // walls / roofs (T_WALL = 32)
      }
      const req = cy + (g - cy) / t;
      if (req > need) need = req;
    }
    const lift = need - baseY;
    const kl = snap ? 1 : 1 - Math.exp((lift > curLift ? -8 : -2) * dt);
    curLift += (lift - curLift) * kl;
    // Hard floor: never below the terrain at the camera itself.
    const py = Math.max(baseY + curLift, map.heightAt(px, pz) + 1.0);
    let ox = 0, oy = 0, oz = 0;
    if (shakeAmp > 0.001) {
      const t = performance.now() * 0.05;
      ox = Math.sin(t * 1.7) * shakeAmp * 0.35; oy = Math.sin(t * 2.3) * shakeAmp * 0.3; oz = Math.cos(t * 1.9) * shakeAmp * 0.35;
      shakeAmp *= Math.exp(-5 * dt);
    }
    camera.position.set(px + ox, py + oy, pz + oz);
    camera.lookAt(cx + ox * 0.5, cy + oy * 0.5, cz + oz * 0.5);
  }

  ctx.events.on('mode:change', ({ mode }) => {
    if (mode === 'play' && (rig.mode === 'login' || rig.mode === 'focus')) { rig.mode = 'follow'; rig.snap = true; }
    if (mode === 'login') rig.mode = 'login';
  });
  ctx.events.on('player:teleport', () => { rig.snap = true; });
  ctx.events.on('camera:shake', ({ strength } = {}) => rig.shake(strength ?? 0.3));
  return rig;
}
