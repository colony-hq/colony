// STUB — owner: player. Procedural character used by the player AND NPCs. API: DESIGN.md §Character.
import * as THREE from 'three';
import { patchMaterial } from '../world/fog.js';

export function createCharacter(opts = {}) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.9, 4, 8),
    patchMaterial(new THREE.MeshStandardMaterial({ color: opts.colors?.top ?? 0x8a3b2a, roughness: 0.8 })),
  );
  body.position.y = 0.8;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 10),
    patchMaterial(new THREE.MeshStandardMaterial({ color: opts.colors?.skin ?? 0xb07850, roughness: 0.7 })),
  );
  head.position.y = 1.55;
  head.castShadow = true;
  root.add(body, head);
  const lanternSocket = new THREE.Object3D();
  lanternSocket.position.set(0.35, 1.0, -0.2);
  root.add(lanternSocket);
  return {
    root,
    lanternSocket,
    headBone: head,
    height: 1.75,
    setLantern(visible) {},
    update(dt, anim = {}) {},
  };
}
