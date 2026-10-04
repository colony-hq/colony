// STUB — owner: landscape. Sky dome, sun/moon lights, time of day. API: DESIGN.md §Sky.
import * as THREE from 'three';

export function createSky(ctx) {
  const { scene } = ctx;
  scene.background = new THREE.Color(0x2a2d48);
  const hemi = new THREE.HemisphereLight(0x8fa0d8, 0x3a3020, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc89a, 1.6);
  sun.position.set(120, 80, 160);
  sun.castShadow = ctx.engine.preset.shadows;
  sun.shadow.mapSize.set(ctx.engine.preset.shadowMapSize || 1024, ctx.engine.preset.shadowMapSize || 1024);
  const sc = sun.shadow.camera;
  sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
  scene.add(sun, sun.target);
  return {
    sun, hemi, timeOfDay: 0,
    setTimeOfDay(v, seconds = 0) { this.timeOfDay = v; },
    update(dt, t) {
      const p = ctx.player?.position;
      if (p) {
        sun.target.position.set(p.x, p.y, p.z);
        sun.position.set(p.x + 120, p.y + 80, p.z + 160);
      }
    },
  };
}
