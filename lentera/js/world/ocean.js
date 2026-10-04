// STUB — owner: landscape. API: DESIGN.md §Ocean.
import * as THREE from 'three';
import { patchMaterial } from './fog.js';

export function createOcean(ctx) {
  const geo = new THREE.PlaneGeometry(4000, 4000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x1d4a66, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.88 }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ocean';
  ctx.scene.add(mesh);
  return {
    mesh,
    waveHeight(x, z, t) { return 0; },
    update(dt, t) {},
  };
}
