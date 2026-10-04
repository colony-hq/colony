// STUB — owner: setdressing. Minimal pier so the player can spawn. API: DESIGN.md §Structures.
import * as THREE from 'three';
import { LANDMARKS } from './heightfield.js';
import { patchMaterial } from './fog.js';

export function createStructures(ctx) {
  const P = LANDMARKS.pier;
  const len = P.zEnd - P.zStart;
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(P.width, 0.3, len),
    patchMaterial(new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 0.9 })),
  );
  deck.position.set(P.x, P.deckY - 0.15, (P.zStart + P.zEnd) / 2);
  deck.castShadow = deck.receiveShadow = true;
  ctx.scene.add(deck);
  ctx.collision.addBox({ x: P.x, y: P.deckY - 2.5, z: (P.zStart + P.zEnd) / 2, w: P.width, h: 2.5, d: len, surface: 'wood', solid: false, tag: 'pier' });
  const anchors = {};
  return {
    anchors,
    boat: null,
    pelita: {},
    sockets: {},
    campfires: {},
    lighthouse: { top: new THREE.Vector3(LANDMARKS.mercusuar.x, LANDMARKS.mercusuar.floor + 30, LANDMARKS.mercusuar.z), setLampGlow() {} },
    setCandiDoor(open) {},
    update(dt, t) {},
  };
}
