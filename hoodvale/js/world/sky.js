// BASELINE — owner: world builder. Sky, sun/moon lights, day/night, fog colour.
// API: sun (DirectionalLight), hemi, hour (0..24), setHour(h), dayLength (s), update(dt).
import * as THREE from 'three';

export function createSky(ctx) {
  const { scene, engine } = ctx;
  scene.background = new THREE.Color(0x8fb6d8);
  scene.fog = new THREE.Fog(0x9fbcd6, 60, 180);
  const hemi = new THREE.HemisphereLight(0xd8e8ff, 0x5a4a30, 1.1);
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
  sun.castShadow = engine.preset.shadows;
  sun.shadow.mapSize.set(engine.preset.shadowMapSize || 1024, engine.preset.shadowMapSize || 1024);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 300 });
  scene.add(hemi, sun, sun.target);
  return {
    sun, hemi, hour: 10, dayLength: 1200,
    setHour(h) { this.hour = h; },
    update(dt) {
      const p = ctx.player?.pos;
      if (p) { sun.target.position.copy(p); sun.position.set(p.x + 60, p.y + 90, p.z + 40); }
    },
  };
}
