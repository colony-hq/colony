// BASELINE — owner: actors builder. Characters and creatures.
// API: create(spec) -> Actor. spec: { kind: 'humanoid', look, player?, npc? } |
//      { kind: 'creature', model, monster } | { kind: 'oracle' } | { kind: 'remote', look }.
// Actor: { root, setPosition(x,y,z), setYaw(yaw), play(anim, opts), setLook(look),
//          setEquipment(eqMap), setVisible(v), hit(), die(), revive(), headHeight, update(dt), dispose() }
import * as THREE from 'three';

export function createActors(ctx) {
  const root = new THREE.Group();
  root.name = 'actors';
  ctx.scene.add(root);
  function create(spec) {
    const g = new THREE.Group();
    const s = spec.kind === 'creature' ? (spec.model?.scale || 1) : 1;
    const color = spec.kind === 'creature' ? parseInt((Object.values(spec.model?.colors || { a: '#aa4444' })[0]).slice(1), 16) : parseInt((spec.look?.top || '#7a5a3a').slice(1), 16);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3 * s, 0.9 * s, 3, 8), new THREE.MeshLambertMaterial({ color }));
    body.position.y = 0.75 * s;
    body.castShadow = true;
    g.add(body);
    root.add(g);
    return {
      root: g, headHeight: 1.8 * s,
      setPosition(x, y, z) { g.position.set(x, y, z); },
      setYaw(y) { g.rotation.y = y; },
      play() {}, setLook() {}, setEquipment() {}, setVisible(v) { g.visible = v; },
      hit() {}, die() { g.visible = false; }, revive() { g.visible = true; },
      update() {},
      dispose() { root.remove(g); },
    };
  }
  return { create, update() {} };
}
