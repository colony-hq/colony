// Set dressing: every hand-built structure on the island. Owner: setdressing.
// API (DESIGN.md §7): createStructures(ctx) -> { anchors, boat, pelita, sockets, campfires,
//   lighthouse, setCandiDoor(open), update } plus extras documented below.
//
// Regions are built by struct-*.js modules with the props-kit Builder: geometry is merged into
// one mesh per material per region (few draw calls, per-region frustum culling) and colliders
// are registered alongside so visuals and collision agree.
//
// Extras: regions {name: Group}, houses [{id, deck, stairFoot, ridge}], footprints [{x,z,r}]
//   (vegetation keep-out), setWindowGlow(0..1), candiDoorOpen, boat.setSail(open),
//   boat.seatLocal, lighthouse.setBeams(on), lighthouse.glow.

import * as THREE from 'three';
import { LANDMARKS } from './heightfield.js';
import { createKit } from './props-kit.js';
import { buildPier } from './struct-pier.js';
import { createBoat } from './struct-boat.js';
import { buildKampung } from './struct-kampung.js';
import { buildSigns } from './struct-signs.js';
import { buildWaterfall } from './struct-waterfall.js';
import { buildCandi } from './struct-candi.js';
import { buildWreck } from './struct-wreck.js';
import { buildLighthouse } from './struct-lighthouse.js';

export function createStructures(ctx) {
  const t0 = performance.now();
  const kit = createKit(ctx);
  const buildTimes = { kit: Math.round(performance.now() - t0) };
  const updaters = [];
  const api = {
    anchors: {},
    boat: null,
    pelita: {},
    sockets: {},
    campfires: {},
    lighthouse: null,
    regions: {},
    houses: [],
    footprints: [],
    candiDoorOpen: false,
    kit,
    buildTimes,
    _updaters: updaters,
    setCandiDoor(open, instant = false) { api._setCandiDoor?.(open, instant); },
    setWindowGlow(v) {
      const m = api.windowMaterial;
      if (m) m.color.setScalar(Math.max(0, v));
    },
    update(dt, t) {
      kit.update(dt, t);
      for (const fn of updaters) fn(dt, t);
    },
  };

  const step = (name, fn) => {
    const ts = performance.now();
    try {
      const g = fn();
      if (g) api.regions[name] = g;
    } catch (err) {
      console.error('[structures] failed to build ' + name, err);
    }
    buildTimes[name] = Math.round(performance.now() - ts);
  };

  const scene = ctx.scene;
  step('pier', () => buildPier(kit, api, scene));
  step('boat', () => { api.boat = createBoat(kit, api); updaters.push((dt, t) => api.boat.update(dt, t)); return api.boat.object; });
  step('kampung', () => buildKampung(kit, api, scene));
  step('signs', () => buildSigns(kit, api, scene));
  step('waterfall', () => buildWaterfall(kit, api, scene, updaters));
  step('candi', () => buildCandi(kit, api, scene, updaters));
  step('wreck', () => buildWreck(kit, api, scene, updaters));
  step('lighthouse', () => buildLighthouse(kit, api, scene, updaters));

  // Guarantee the contract even if a region failed to build.
  const L = LANDMARKS;
  if (!api.lighthouse) {
    api.lighthouse = { object: new THREE.Group(), top: new THREE.Vector3(L.mercusuar.x, L.mercusuar.floor + 27, L.mercusuar.z), setLampGlow() {} };
  }
  const need = {
    'flame:tirta': [L.airTerjun.flame.x, 2.9, L.airTerjun.flame.z],
    'flame:bumi': [L.candi.chamber.x, L.candi.chamber.floorY + 1.5, L.candi.chamber.z],
    'flame:samudra': [L.kapalKaram.flame.x, L.kapalKaram.flame.y, L.kapalKaram.flame.z],
    relief: [L.candi.relief.x, 37, L.candi.relief.z],
    'candi:door': [L.candi.door.x, L.candi.chamber.floorY + 1.3, L.candi.door.z],
    'lighthouse:lamp': [api.lighthouse.top.x, api.lighthouse.top.y, api.lighthouse.top.z],
  };
  for (const [k, v] of Object.entries(need)) if (!api.anchors[k]) api.anchors[k] = new THREE.Vector3(...v);
  for (const c of [{ id: 'kampung', ...L.kampung.campfire }, { id: 'tirta', ...L.airTerjun.campfire }, { id: 'candi', ...L.candi.campfire }]) {
    if (!api.campfires[c.id]) {
      const o = new THREE.Group();
      o.position.set(c.x, 0, c.z);
      api.campfires[c.id] = { object: o, position: o.position.clone() };
    }
    if (!api.anchors['campfire:' + c.id]) api.anchors['campfire:' + c.id] = api.campfires[c.id].position.clone();
  }
  if (!api.boat) {
    const o = new THREE.Group();
    api.boat = { object: o, manual: false, setPose(x, z, yaw) { o.position.set(x, 0, z); o.rotation.y = yaw; }, setSail() {}, update() {} };
    api.anchors['boat:seat'] = api.anchors['boat:seat'] || new THREE.Vector3(L.boatMoor.x, 0.3, L.boatMoor.z);
  }
  return api;
}
