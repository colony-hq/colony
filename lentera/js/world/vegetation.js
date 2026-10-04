// Vegetation: instanced coconut palms, broadleaf/ketapang trees, the great beringin by the candi,
// bamboo clumps, banana plants, ferns, shrubs, grass tufts, kamboja, reeds, beach & cliff rocks.
// Owner: setdressing. API: createVegetation(ctx) -> { update(dt, t), counts, sets, setWind(v) }.
//
// Placement is deterministic (seeded jittered grids + noise masks over the heightfield).
// Instances are CPU-culled (distance + widened frustum) every few frames into InstancedMeshes,
// so the draw-call cost is one per species part and only nearby instances are drawn.
// Wind sway lives in the vertex shader (veg-instancing.js), chained before the kabut patch.

import * as THREE from 'three';
import {
  heightAt, slopeAt, distToPath, distToRiver, LANDMARKS, EXCLUSIONS,
} from './heightfield.js';
import { mulberry32, createNoise2D, fbm } from '../core/noise.js';
import { createVegTextures } from './veg-textures.js';
import { windMaterial, InstSet, vegUniforms } from './veg-instancing.js';
import {
  coconutPalm, broadleafTree, bananaPlant, fern, shrub, tuft, bambooClump, kambojaTree, beringin, rockShape,
} from './veg-geo.js';

const smoothstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createVegetation(ctx) {
  try {
    return buildVegetation(ctx);
  } catch (err) {
    console.error('[vegetation] build failed; continuing without plants', err);
    return { sets: {}, counts: {}, visible: {}, setWind() {}, update() {} };
  }
}

function buildVegetation(ctx) {
  const t0 = performance.now();
  const preset = ctx.engine?.preset || { vegetationDensity: 0.65, grass: true, drawDistance: 480, name: 'medium' };
  const density = preset.vegetationDensity ?? 0.65;
  const scene = ctx.scene;
  const tex = createVegTextures(ctx);
  const hi = preset.name === 'high';

  // ---- Materials --------------------------------------------------------------------------------
  const leafMat = windMaterial(new THREE.MeshStandardMaterial({
    map: tex.atlas, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.82, metalness: 0,
  }), 'leaf', { flutter: 1, keepNormals: true });
  leafMat.name = 'lentera-veg-leaf';
  const grassMat = windMaterial(new THREE.MeshStandardMaterial({
    map: tex.atlas, alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: true, roughness: 0.95,
  }), 'grass', { flutter: 0.3, keepNormals: true });
  const barkMat = windMaterial(new THREE.MeshStandardMaterial({ map: tex.bark.map, normalMap: tex.bark.normal, vertexColors: true, roughness: 0.95 }), 'bark');
  tex.bark.map.repeat.set(1 / 1.6, 1 / 2.2); tex.bark.normal.repeat.set(1 / 1.6, 1 / 2.2);
  const palmMat = windMaterial(new THREE.MeshStandardMaterial({ map: tex.palm.map, normalMap: tex.palm.normal, vertexColors: true, roughness: 0.9 }), 'palm');
  tex.palm.map.repeat.set(1 / 1.2, 1 / 1.5); tex.palm.normal.repeat.set(1 / 1.2, 1 / 1.5);
  const kitTex = ctx.structures?.kit?.textures;
  const bambooTex = kitTex?.bamboo?.map?.clone();
  if (bambooTex) { bambooTex.repeat.set(2.5, 1); bambooTex.needsUpdate = true; }
  const bambooMat = windMaterial(new THREE.MeshStandardMaterial({ map: bambooTex || null, color: bambooTex ? 0xd8d0a0 : 0x9aa060, vertexColors: true, roughness: 0.6 }), 'bamboo');
  const rockMat = ctx.structures?.kit?.mats?.rock?.material
    || windMaterial(new THREE.MeshStandardMaterial({ color: 0x8a867e, vertexColors: true, roughness: 0.95 }), 'rock');

  // ---- Geometry variants -----------------------------------------------------------------------
  const G = {
    palmA: coconutPalm(11, 10.5, 2.9),
    palmB: coconutPalm(23, 7.6, 2.1),
    treeA: broadleafTree(5, 8.5, false),
    treeB: broadleafTree(9, 9.5, true),
    banana: bananaPlant(3),
    fern: fern(4),
    shrub: shrub(6),
    grass: tuft('grass', 0.7, 0.55, 3, 1),
    grass2: tuft('grass2', 0.7, 0.5, 3, 2),
    reed: tuft('reed', 0.9, 1.7, 3, 3),
    bamboo: bambooClump(7),
    kamboja: kambojaTree(8),
    rockA: rockShape(101, 0.65, 0.3, false),
    rockB: rockShape(202, 0.85, 0.42, true),
  };
  const D = preset.drawDistance || 480;
  const SD = preset.shadows ? 70 : 0; // shadow casters only near the camera
  const sets = {
    palmA: new InstSet('palmA', [{ geometry: G.palmA.trunk, material: palmMat, cast: true }, { geometry: G.palmA.leaves, material: leafMat, cast: true }], { maxDist: D * 0.6, shadowDist: SD }),
    palmB: new InstSet('palmB', [{ geometry: G.palmB.trunk, material: palmMat, cast: true }, { geometry: G.palmB.leaves, material: leafMat, cast: true }], { maxDist: D * 0.6, shadowDist: SD }),
    treeA: new InstSet('treeA', [{ geometry: G.treeA.trunk, material: barkMat, cast: true }, { geometry: G.treeA.leaves, material: leafMat, cast: true }], { maxDist: D * 0.6, shadowDist: SD }),
    treeB: new InstSet('treeB', [{ geometry: G.treeB.trunk, material: barkMat, cast: true }, { geometry: G.treeB.leaves, material: leafMat, cast: true }], { maxDist: D * 0.6, shadowDist: SD }),
    bamboo: new InstSet('bamboo', [{ geometry: G.bamboo.trunk, material: bambooMat, cast: true }, { geometry: G.bamboo.leaves, material: leafMat, cast: true }], { maxDist: D * 0.5, shadowDist: SD }),
    kamboja: new InstSet('kamboja', [{ geometry: G.kamboja.trunk, material: barkMat, cast: true }, { geometry: G.kamboja.leaves, material: leafMat, cast: true }], { maxDist: 220, shadowDist: SD }),
    banana: new InstSet('banana', [{ geometry: G.banana.leaves, material: leafMat, cast: true }], { maxDist: 170, shadowDist: SD }),
    fern: new InstSet('fern', [{ geometry: G.fern.leaves, material: leafMat, cast: false }], { maxDist: hi ? 95 : 70, margin: 2 }),
    shrub: new InstSet('shrub', [{ geometry: G.shrub.leaves, material: leafMat, cast: hi }], { maxDist: hi ? 140 : 100, margin: 3, shadowDist: SD * 0.6 }),
    reed: new InstSet('reed', [{ geometry: G.reed.leaves, material: grassMat, cast: false }], { maxDist: 120, margin: 2 }),
    rockA: new InstSet('rockA', [{ geometry: G.rockA, material: rockMat, cast: true }], { maxDist: D * 0.45, shadowDist: SD }),
    rockB: new InstSet('rockB', [{ geometry: G.rockB, material: rockMat, cast: true }], { maxDist: D * 0.45, shadowDist: SD }),
  };
  if (preset.grass) {
    sets.grass = new InstSet('grass', [{ geometry: G.grass.leaves, material: grassMat, cast: false }], { maxDist: hi ? 60 : 45, margin: 1 });
    sets.grass2 = new InstSet('grass2', [{ geometry: G.grass2.leaves, material: grassMat, cast: false }], { maxDist: hi ? 55 : 40, margin: 1 });
  }

  // ---- Placement helpers -----------------------------------------------------------------------
  const noiseA = createNoise2D(9001), noiseB = createNoise2D(4711);
  const footprints = ctx.structures?.footprints || [];
  const coll = ctx.collision;
  const K = LANDMARKS.kampung;
  const inCircleList = (x, z, list, pad) => list.some((e) => (x - e.x) ** 2 + (z - e.z) ** 2 < (e.r + pad) ** 2);
  const onStructure = (x, z) => { const g = coll.groundAt(x, z, 9999, 0, 0.6); return !!g.collider; };
  const blocked = (x, z, pad = 1, { ignoreKampung = false } = {}) => {
    for (const e of EXCLUSIONS) {
      if (ignoreKampung && e.x === K.x && e.z === K.z) continue;
      if ((x - e.x) ** 2 + (z - e.z) ** 2 < (e.r + pad) ** 2) return true;
    }
    if (inCircleList(x, z, footprints, pad)) return true;
    return onStructure(x, z);
  };
  const forest = (x, z) => fbm(noiseA, x * 0.011, z * 0.011, 3);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const C = new THREE.Color();
  const treesForColliders = [];
  const place = (set, x, y, z, yaw, s, { tilt = 0, color = null, h = 6, r = 3, lean = null, coll: cr = 0, collH = 4 } = {}) => {
    E.set(tilt * Math.cos(yaw * 1.7), yaw, tilt * Math.sin(yaw * 1.3), 'YXZ');
    Q.setFromEuler(E);
    P.set(x, y, z);
    S.set(s, s, s);
    M.compose(P, Q, S);
    if (color) C.copy(color); else C.setRGB(1, 1, 1);
    let cx = x, cz = z;
    if (lean) { cx += -Math.sin(yaw) * lean * s * 0.5; cz += -Math.cos(yaw) * lean * s * 0.5; }
    set.add(M, C, cx, y + h * s * 0.5, cz, Math.max(h * 0.55, r) * s);
    if (cr > 0) treesForColliders.push([x, y, z, cr * Math.max(0.8, s), collH]);
  };
  const tint = (rng, base = 1, spread = 0.12, warm = 0.05) => {
    const k = base + (rng() - 0.5) * spread;
    const w = (rng() - 0.5) * warm;
    return C.setRGB(k * (1 + w), k, k * (1 - w)).clone();
  };
  // Direction (yaw) toward the lowest nearby ground: palms lean to the sea.
  const seaYaw = (x, z) => {
    let best = Infinity, bx = 0, bz = 1;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      const h = heightAt(x + dx * 14, z + dz * 14);
      if (h < best) { best = h; bx = dx; bz = dz; }
    }
    return Math.atan2(-bx, -bz);
  };
  const jgrid = (seed, cell, fn, half = 265) => {
    const rng = mulberry32(seed);
    for (let gz = -half; gz < half; gz += cell) {
      for (let gx = -half; gx < half; gx += cell) {
        const x = gx + rng() * cell, z = gz + rng() * cell;
        fn(x, z, rng);
      }
    }
  };

  // ---- Coconut palms: beaches (leaning seaward) + kampung groves. -----------------------------
  jgrid(101, 7.5, (x, z, rng) => {
    const h = heightAt(x, z);
    if (h < 0.25 || h > 3.6) return;
    if (rng() > (0.55 + 0.25 * fbm(noiseB, x * 0.02, z * 0.02, 2)) * density) return;
    if (slopeAt(x, z) > 0.35 || distToPath(x, z) < 2.6) return;
    if (blocked(x, z, 2)) return;
    const tall = rng() < 0.6;
    const s = 0.82 + rng() * 0.38;
    const yaw = seaYaw(x, z) + (rng() - 0.5) * 0.9;
    place(tall ? sets.palmA : sets.palmB, x, h - 0.1, z, yaw, s, { color: tint(rng, 1, 0.16), h: tall ? 11 : 8, r: 5, lean: tall ? 2.9 : 2.1, coll: 0.3 });
  });
  // Kampung palms on a ring between the houses.
  {
    const rng = mulberry32(55);
    let n = 0;
    for (let k = 0; k < 140 && n < Math.round(16 * Math.max(0.6, density)); k++) {
      const a = rng() * Math.PI * 2, rr = 14 + rng() * 26;
      const x = K.x + Math.cos(a) * rr, z = K.z + Math.sin(a) * rr;
      const h = heightAt(x, z);
      if (h < 1.0) continue;
      if (distToPath(x, z) < 3.2 || inCircleList(x, z, footprints, 4) || onStructure(x, z)) continue;
      if (Math.hypot(x - K.campfire.x, z - K.campfire.z) < 9) continue;
      const tall = rng() < 0.7;
      place(tall ? sets.palmA : sets.palmB, x, h - 0.1, z, rng() * Math.PI * 2, 0.85 + rng() * 0.3, { color: tint(rng, 1.02, 0.12), h: 11, r: 5, lean: 2.5, coll: 0.3 });
      n++;
    }
  }

  // ---- Broadleaf + ketapang trees: noise-masked forests and scattered singles. ------------------
  const pockets = LANDMARKS.fogPockets;
  jgrid(202, 8.5, (x, z, rng) => {
    const h = heightAt(x, z);
    if (h < 2.6 || h > 50) return;
    const f = forest(x, z);
    let p = smoothstep(-0.12, 0.32, f) * 0.85 + 0.05;
    for (const fp of pockets) { const d = Math.hypot(x - fp.x, z - fp.z); if (d < fp.r && fp.r >= 55) p += 0.25 * (1 - d / fp.r); }
    if (h > 38) p *= 0.4;
    if (rng() > p * density) return;
    if (slopeAt(x, z) > 0.62 || distToPath(x, z) < 4.2 || distToRiver(x, z) < 4) return;
    if (blocked(x, z, 4)) return;
    const coastal = h < 7 && rng() < 0.55;
    const s = 0.8 + rng() * 0.5;
    place(coastal ? sets.treeB : sets.treeA, x, h - 0.15, z, rng() * Math.PI * 2, s, { color: tint(rng, 1, 0.22, 0.12), h: 10, r: 4.5, coll: 0.38 });
    // Understory around the trunk.
    const nf = Math.floor(rng() * 3 * density + 0.5);
    for (let i = 0; i < nf; i++) {
      const a = rng() * Math.PI * 2, d = 1.6 + rng() * 2.8;
      const fx = x + Math.cos(a) * d, fz = z + Math.sin(a) * d;
      const fh = heightAt(fx, fz);
      if (fh < 1.8 || slopeAt(fx, fz) > 0.7 || distToPath(fx, fz) < 2 || blocked(fx, fz, 0.5)) continue;
      if (rng() < 0.6) place(sets.fern, fx, fh - 0.05, fz, rng() * 6.28, 0.8 + rng() * 0.6, { color: tint(rng, 1, 0.2), h: 1, r: 1 });
      else place(sets.shrub, fx, fh - 0.1, fz, rng() * 6.28, 0.8 + rng() * 0.6, { color: tint(rng, 1, 0.2, 0.1), h: 1.3, r: 1.2 });
    }
  });

  // ---- Bamboo clumps by the river, the mesa and the kampung outskirts. --------------------------
  jgrid(303, 15, (x, z, rng) => {
    const h = heightAt(x, z);
    if (h < 2.5 || h > 36) return;
    const dr = distToRiver(x, z);
    const dk = Math.hypot(x - K.x, z - K.z);
    let p = dr < 16 ? 0.7 : 0.08;
    if (dk > 42 && dk < 62) p += 0.35;
    if (rng() > p * density) return;
    if (slopeAt(x, z) > 0.5 || distToPath(x, z) < 5 || dr < 3.5) return;
    if (blocked(x, z, 5)) return;
    place(sets.bamboo, x, h - 0.2, z, rng() * 6.28, 0.85 + rng() * 0.3, { color: tint(rng, 1, 0.14), h: 11, r: 3.5, coll: 0.9 });
  });

  // ---- Banana plants around the kampung (outside houses, off the paths). -----------------------
  {
    const rng = mulberry32(404);
    for (let k = 0; k < 900; k++) {
      const a = rng() * Math.PI * 2, rr = 16 + rng() * 44;
      const x = K.x + Math.cos(a) * rr, z = K.z + Math.sin(a) * rr;
      const h = heightAt(x, z);
      if (h < 2.2 || h > 9 || slopeAt(x, z) > 0.4) continue;
      if (rng() > 0.18 * density) continue;
      if (distToPath(x, z) < 2.8 || inCircleList(x, z, footprints, 0.6) || onStructure(x, z)) continue;
      if (Math.hypot(x - K.campfire.x, z - K.campfire.z) < 10) continue;
      // Clusters of 2-3.
      const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const bx = x + (rng() - 0.5) * 2.2, bz = z + (rng() - 0.5) * 2.2;
        if (inCircleList(bx, bz, footprints, 0.4) || onStructure(bx, bz)) continue;
        place(sets.banana, bx, heightAt(bx, bz) - 0.05, bz, rng() * 6.28, 0.85 + rng() * 0.35, { color: tint(rng, 1, 0.18, 0.1), h: 3.2, r: 2 });
      }
    }
  }

  // ---- The great beringin by the candi courtyard + kamboja ring. -------------------------------
  const CA = LANDMARKS.candi;
  const banyanPos = { x: 6.5, z: -119.5 };
  {
    const bg = beringin(17);
    const y = heightAt(banyanPos.x, banyanPos.z) - 0.2;
    const trunk = new THREE.Mesh(bg.trunk, barkMat);
    const leaves = new THREE.Mesh(bg.leaves, leafMat);
    for (const m of [trunk, leaves]) {
      m.position.set(banyanPos.x, y, banyanPos.z);
      m.rotation.y = 0.7;
      m.castShadow = true; m.receiveShadow = true;
      m.name = 'veg:beringin';
      scene.add(m);
    }
    coll.addCylinder({ x: banyanPos.x, y: y - 0.5, z: banyanPos.z, r: 2.6, h: 9, surface: 'wood', walkable: false, tag: 'beringin' });
    // Ferns and offerings around the roots.
    const rng = mulberry32(606);
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, d = 3.5 + rng() * 6;
      const fx = banyanPos.x + Math.cos(a) * d, fz = banyanPos.z + Math.sin(a) * d;
      place(sets.fern, fx, heightAt(fx, fz) - 0.05, fz, rng() * 6.28, 0.9 + rng() * 0.5, { color: tint(rng, 0.95, 0.2), h: 1, r: 1 });
    }
  }
  {
    const rng = mulberry32(707);
    const gate = ctx.structures?.anchors?.['candi:gate'] || { x: 33.4, z: -110.2 };
    let n = 0;
    for (let k = 0; k < 400 && n < 16; k++) {
      const a = rng() * Math.PI * 2, rr = 22 + rng() * 9;
      const x = CA.x + Math.cos(a) * rr, z = CA.z + Math.sin(a) * rr;
      const h = heightAt(x, z);
      if (Math.abs(h - CA.floor) > 1.2) continue;
      if (Math.abs(x - CA.x) < 18 && Math.abs(z - CA.z) < 18) continue;
      if (distToPath(x, z) < 3.5 || Math.hypot(x - gate.x, z - gate.z) < 12) continue;
      if (x > 26 && x < 38 && z > -124 && z < -106) continue; // processional way
      if (Math.hypot(x - banyanPos.x, z - banyanPos.z) < 9 || onStructure(x, z)) continue;
      place(sets.kamboja, x, h - 0.1, z, rng() * 6.28, 0.9 + rng() * 0.35, { color: tint(rng, 1, 0.12), h: 3.6, r: 2, coll: 0.18, collH: 2 });
      n++;
    }
  }

  // ---- Reeds in the cove shallows; ferns by the cave mouth. ------------------------------------
  {
    const A = LANDMARKS.airTerjun;
    jgrid(808, 2.6, (x, z, rng) => {
      if (Math.hypot(x - A.cove.x, z - A.cove.z) > 40) return;
      const h = heightAt(x, z);
      if (h < -0.9 || h > 0.5) return;
      if (rng() > 0.45 * Math.max(0.5, density)) return;
      if (Math.hypot(x - A.top.x + 3, z - A.top.z) < 7) return; // plunge point
      if (blocked(x, z, 0.5)) return;
      place(sets.reed, x, h - 0.05, z, rng() * 6.28, 0.8 + rng() * 0.5, { color: tint(rng, 1, 0.2, 0.1), h: 1.7, r: 0.6 });
    });
    const rng = mulberry32(809);
    for (let i = 0; i < 26; i++) {
      const x = -166 + rng() * 12, z = -45 + rng() * 26;
      const h = heightAt(x, z);
      if (h < 0.4 || slopeAt(x, z) > 0.9 || Math.abs(z + 33) < 6.5) continue;
      place(sets.fern, x, h - 0.05, z, rng() * 6.28, 0.9 + rng() * 0.6, { color: tint(rng, 0.9, 0.2), h: 1, r: 1 });
    }
  }

  // ---- Scattered shrubs + ferns on forest floor, grass tufts. ----------------------------------
  jgrid(909, 6, (x, z, rng) => {
    const h = heightAt(x, z);
    if (h < 2.2 || h > 46) return;
    const f = forest(x, z);
    if (rng() > (0.12 + smoothstep(0, 0.4, f) * 0.35) * density) return;
    if (slopeAt(x, z) > 0.7 || distToPath(x, z) < 2.2 || blocked(x, z, 0.8)) return;
    if (rng() < 0.55) place(sets.shrub, x, h - 0.1, z, rng() * 6.28, 0.7 + rng() * 0.7, { color: tint(rng, 1, 0.25, 0.12), h: 1.3, r: 1.2 });
    else place(sets.fern, x, h - 0.05, z, rng() * 6.28, 0.8 + rng() * 0.6, { color: tint(rng, 1, 0.2), h: 1, r: 1 });
  });
  if (sets.grass) {
    const target = density;
    jgrid(1001, 1.9, (x, z, rng) => {
      const n = fbm(noiseB, x * 0.03, z * 0.03, 2);
      if (rng() > (0.35 + n * 0.6) * target) return;
      const h = heightAt(x, z);
      if (h < 1.9 || h > 42) return;
      if (slopeAt(x, z) > 0.6 || distToPath(x, z) < 1.5) return;
      if (blocked(x, z, -1.5, { ignoreKampung: true })) return;
      const set = rng() < 0.18 ? sets.grass2 : sets.grass;
      place(set, x, h - 0.04, z, rng() * 6.28, 0.7 + rng() * 0.7, { color: tint(rng, 1, 0.25, 0.15), h: 0.6, r: 0.4 });
    });
  }

  // ---- Rocks: beaches and steep cliffs. --------------------------------------------------------
  const rockColl = [];
  jgrid(1101, 6.5, (x, z, rng) => {
    const h = heightAt(x, z);
    const sl = slopeAt(x, z);
    if (h > -1.4 && h < 1.4 && sl < 0.5) {
      if (rng() > 0.13 * Math.max(0.6, density)) return;
      if (distToPath(x, z) < 2.5 || blocked(x, z, 1)) return;
      const s = 0.35 + rng() * rng() * 1.6;
      place(sets.rockA, x, h - s * 0.25, z, rng() * 6.28, s, { tilt: 0.2, color: tint(rng, 0.95, 0.2, 0.1), h: s, r: 1 });
      if (s > 1.0) rockColl.push([x, h, z, s]);
    } else if (sl > 0.7 && h > 1.5) {
      if (rng() > 0.4 * Math.max(0.6, density)) return;
      if (distToPath(x, z) < 3 || blocked(x, z, 1)) return;
      const s = 0.8 + rng() * 2.2;
      place(sets.rockB, x, h - s * 0.3, z, rng() * 6.28, s, { tilt: 0.4, color: tint(rng, 0.92, 0.18, 0.12), h: s, r: 1 });
    }
  });

  // ---- Finalize: instanced meshes + trunk colliders. -------------------------------------------
  for (const s of Object.values(sets)) s.finalize(scene);
  for (const [x, y, z, r, h] of treesForColliders) coll.addCylinder({ x, y: y - 0.3, z, r, h, surface: 'wood', walkable: false, tag: 'tree' });
  for (const [x, h, z, s] of rockColl) coll.addCylinder({ x, y: h - 0.5, z, r: 0.75 * s, h: 0.5 + s * 0.55, surface: 'rock', tag: 'rock' });

  // ---- Culling + wind update. ------------------------------------------------------------------
  const frustum = new THREE.Frustum();
  const pv = new THREE.Matrix4();
  const lastPos = new THREE.Vector3(1e9, 0, 0);
  const lastQuat = new THREE.Quaternion();
  let acc = 1;
  const counts = {};
  for (const [k, s] of Object.entries(sets)) counts[k] = s.count;
  const visible = {};
  function cullAll(force) {
    const cam = ctx.camera;
    cam.updateMatrixWorld();
    const moved = cam.position.distanceToSquared(lastPos) > 4 || 1 - Math.abs(cam.quaternion.dot(lastQuat)) > 0.0008;
    if (!force && !moved && acc < 0.5) return;
    acc = 0;
    lastPos.copy(cam.position);
    lastQuat.copy(cam.quaternion);
    pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    const fogged = ctx.fog ? ctx.fog.amount : 1;
    const scale = 0.75 + 0.25 * (1 - fogged); // the kabut hides distance; restore range when it lifts
    for (const [k, s] of Object.entries(sets)) visible[k] = s.cull(cam.position, frustum, scale);
  }
  cullAll(true);

  const api = {
    sets,
    counts,
    visible,
    banyan: banyanPos,
    buildMs: Math.round(performance.now() - t0),
    texTimes: tex.times,
    setWind(v) { vegUniforms.uVegWind.value = v; },
    update(dt, t) {
      vegUniforms.uVegTime.value = t;
      acc += dt;
      if (acc > 0.12) cullAll(false);
    },
  };
  return api;
}
