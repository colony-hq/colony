// BASELINE — owner: world builder. Sea, lakes, river and swamp water surfaces (y = 0).
import * as THREE from 'three';

export function createWater(ctx) {
  const geo = new THREE.PlaneGeometry(1400, 1400);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x2f6f9f, transparent: true, opacity: 0.85 }));
  mesh.position.set(160, -0.05, 160);
  mesh.name = 'water';
  ctx.scene.add(mesh);
  return { mesh, update() {} };
}
