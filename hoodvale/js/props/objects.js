// BASELINE — owner: props builder. Visuals for world objects (data/objects.js model.kind) and
// ground items. API: create(entity) -> view { object3d, setState(name), update(dt), dispose() },
// createItem(entity) -> view. States: 'active' | 'depleted' (stump, empty rock, empty stall...).
import * as THREE from 'three';

const geoCache = new Map();
const geo = (k, make) => geoCache.get(k) || geoCache.set(k, make()).get(k);
const mats = new Map();
const mat = (c) => mats.get(c) || mats.set(c, new THREE.MeshLambertMaterial({ color: c })).get(c);

export function createObjectViews(ctx) {
  const root = new THREE.Group();
  root.name = 'objects';
  ctx.scene.add(root);
  function make(e) {
    const kind = e.def.model?.kind || 'box';
    const g = new THREE.Group();
    if (kind.startsWith('tree')) {
      const trunk = new THREE.Mesh(geo('trunk', () => new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6)), mat(0x6a4a2a));
      trunk.position.y = 1.2;
      const top = new THREE.Mesh(geo('crown', () => new THREE.IcosahedronGeometry(1.5, 0)), mat(kind === 'tree-willow' ? 0x7a9a3a : kind === 'tree-maple' ? 0xb0502a : kind === 'tree-yew' ? 0x2a4a2a : kind === 'tree-elder' ? 0x6a4a8a : 0x3f7a2a));
      top.position.y = 3.2;
      g.add(trunk, top);
      g.userData.crown = top;
    } else if (kind === 'rock-ore' || kind === 'crystal') {
      const r = new THREE.Mesh(geo('rock', () => new THREE.DodecahedronGeometry(0.6, 0)), mat(kind === 'crystal' ? 0x8fe3ff : 0x7a7068));
      r.position.y = 0.4;
      const ore = new THREE.Mesh(geo('ore', () => new THREE.SphereGeometry(0.2, 6, 4)), mat(parseInt((e.def.model.tint || '#ffffff').slice(1), 16)));
      ore.position.set(0.3, 0.7, 0.2);
      g.add(r, ore);
      g.userData.ore = ore;
    } else if (kind.startsWith('fishing-spot')) {
      const ring = new THREE.Mesh(geo('ring', () => new THREE.RingGeometry(0.2, 0.45, 16)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05 - e.pos.y; // sit on the water surface
      g.add(ring);
      g.userData.spin = ring;
    } else {
      const s = e.def.size || [1, 1];
      const b = new THREE.Mesh(geo('box' + s, () => new THREE.BoxGeometry(s[0] * 0.8, 1, s[1] * 0.8)), mat(0x9a7a5a));
      b.position.y = 0.5;
      g.add(b);
    }
    return g;
  }
  return {
    create(e) {
      const obj = make(e);
      obj.position.copy(e.pos);
      obj.rotation.y = e.yaw || 0;
      root.add(obj);
      return {
        object3d: obj,
        setState(s) {
          if (obj.userData.crown) obj.userData.crown.visible = s !== 'depleted';
          if (obj.userData.ore) obj.userData.ore.visible = s !== 'depleted';
        },
        update(dt) { if (obj.userData.spin) obj.userData.spin.rotation.z += dt; },
        dispose() { root.remove(obj); },
      };
    },
    createItem(e) {
      const m = new THREE.Mesh(geo('item', () => new THREE.BoxGeometry(0.3, 0.15, 0.3)), mat(0xd8b040));
      m.position.copy(e.pos).add(new THREE.Vector3(0, 0.08, 0));
      root.add(m);
      return { object3d: m, dispose() { root.remove(m); } };
    },
    update() {},
  };
}
