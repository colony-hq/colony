// BASELINE — owner: props builder. Bridges, piers, fences, Gildmoor town walls + gates.
import * as THREE from 'three';
import { BRIDGES, FENCES, ZONES } from '../data/zones.js';

export function createStructures(ctx) {
  const group = new THREE.Group();
  group.name = 'structures';
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5636 });
  for (const b of BRIDGES) {
    const w = b.x1 - b.x0 + 1, d = b.z1 - b.z0 + 1;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), wood);
    m.position.set(b.x0 + w / 2, b.deckY - 0.15, b.z0 + d / 2);
    group.add(m);
  }
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  for (const f of FENCES) {
    for (let z = f.z0; z <= f.z1; z++) for (let x = f.x0; x <= f.x1; x++) {
      const edge = x === f.x0 || x === f.x1 || z === f.z0 || z === f.z1;
      if (!edge || f.gates.some((g) => g.x === x && g.z === z)) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.2), fenceMat);
      m.position.set(x + 0.5, ctx.map.heightAt(x + 0.5, z + 0.5) + 0.5, z + 0.5);
      group.add(m);
    }
  }
  const G = ZONES.gildmoor;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(G.wallR + 0.5, G.wallR + 0.5, 4, 96, 1, true), new THREE.MeshLambertMaterial({ color: 0x8a8070, side: THREE.DoubleSide }));
  wall.position.set(G.x, G.floor + 2, G.z);
  group.add(wall);
  ctx.scene.add(group);
  return { group, update() {} };
}
