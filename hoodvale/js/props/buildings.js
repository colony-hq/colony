// BASELINE — owner: props builder. Every building in data/buildings.js (walls, roofs that hide
// when the player is inside, interiors, doors).
import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings.js';

export function createBuildings(ctx) {
  const group = new THREE.Group();
  group.name = 'buildings';
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xd8cbb0 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x7a3a2a });
  const roofs = [];
  for (const b of BUILDINGS) {
    const y = b.floorY ?? ctx.map.heightAt(b.x + b.w / 2, b.z + b.d / 2);
    const h = b.solid ? 4 : 3;
    const box = new THREE.Mesh(new THREE.BoxGeometry(b.w, h, b.d), wallMat);
    box.position.set(b.x + b.w / 2, y + h / 2, b.z + b.d / 2);
    if (!b.solid) box.material = new THREE.MeshLambertMaterial({ color: 0xd8cbb0, transparent: true, opacity: 0.35 });
    group.add(box);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(b.w, b.d) * 0.75, 2.5, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(b.x + b.w / 2, y + h + 1.25, b.z + b.d / 2);
    roof.userData.b = b;
    roofs.push(roof);
    group.add(roof);
  }
  ctx.scene.add(group);
  return {
    group,
    update() {
      const p = ctx.player;
      for (const r of roofs) {
        const b = r.userData.b;
        r.visible = !(p && p.x >= b.x && p.x < b.x + b.w && p.z >= b.z && p.z < b.z + b.d);
      }
    },
  };
}
