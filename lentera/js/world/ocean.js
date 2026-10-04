// Ocean + mesa river. Owner: landscape. API (DESIGN.md §Ocean):
//   createOcean(ctx) -> { mesh, waveHeight(x, z, t), update(dt, t) }
// Extra fields: river (Mesh), uniforms, waveAmplitude.
//
// - One mesh: a camera-following grid (snapped to its spacing, so waves never swim) with vertex
//   waves that fade out toward its edge, plus a flat square ring out to the horizon. Normals are
//   per-pixel (analytic wave gradient + scrolling ripples), so near and far shade the same.
// - Depth from the baked heightfield texture: turquoise shallows -> teal -> deep indigo, soft
//   transparent waterline, foam bands that lap up the beach, fresnel sky reflection, sun/moon
//   glitter, lantern glints. Kabut via FOG_GLSL.
// - waveHeight() is the exact CPU twin of the vertex waves (see water-shaders.js).
// - River: a flowing ribbon along LANDMARKS.river ending at the waterfall lip (-156,-33) y 29.2.

import * as THREE from 'three';
import { fogUniforms } from './fog.js';
import { skyUniforms } from './sky-shared.js';
import { getHeightTexture, getRippleTexture } from './land-maps.js';
import { heightAt, LANDMARKS } from './heightfield.js';
import {
  WAVE_AMPLITUDE, waveHeightAt, OCEAN_VERT, OCEAN_FRAG, RIVER_VERT, RIVER_FRAG,
} from './water-shaders.js';
import { clamp, smoothstep } from '../core/math.js';

// waterDetail 0/1/2 -> grid half-extent and spacing (metres).
const DETAIL = [
  { half: 64, step: 2.0 },
  { half: 88, step: 1.375 },
  { half: 110, step: 1.0 },
];
const FAR = 2300;
const LIP = { x: LANDMARKS.airTerjun.top.x, z: LANDMARKS.airTerjun.top.z, y: LANDMARKS.airTerjun.top.y };

function buildOceanGeometry(half, step) {
  const n = Math.round((half * 2) / step);
  const pos = [];
  const idx = [];
  // Inner grid.
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) pos.push(-half + i * step, 0, -half + j * step);
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Square rings: the inner one shares the grid's boundary vertex spacing (no T-junction gaps).
  const perim = (h) => {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([-h + (2 * h * i) / n, -h]); // north edge, west -> east
    for (let i = 0; i < n; i++) pts.push([h, -h + (2 * h * i) / n]); // east edge, north -> south
    for (let i = 0; i < n; i++) pts.push([h - (2 * h * i) / n, h]); // south edge, east -> west
    for (let i = 0; i < n; i++) pts.push([-h, h - (2 * h * i) / n]); // west edge, south -> north
    return pts;
  };
  const rings = [half, half * 4, FAR];
  const base = [];
  for (const h of rings) {
    base.push(pos.length / 3);
    for (const [x, z] of perim(h)) pos.push(x, 0, z);
  }
  const P = 4 * n;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < P; i++) {
      const a = base[r] + i, b = base[r] + ((i + 1) % P);
      const c = base[r + 1] + i, d = base[r + 1] + ((i + 1) % P);
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), FAR * 1.5);
  return geo;
}

// River ribbon along LANDMARKS.river -> the waterfall lip.
function buildRiverGeometry() {
  const pts = LANDMARKS.river.map((p) => ({ x: p.x, z: p.z }));
  pts.push({ x: LIP.x, z: LIP.z });
  const cr = (a, b, c, d, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  };
  const S = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / 1.2));
    for (let s = 0; s < n; s++) {
      const t = s / n;
      S.push({ x: cr(p0.x, p1.x, p2.x, p3.x, t), z: cr(p0.z, p1.z, p2.z, p3.z, t) });
    }
  }
  S.push({ x: LIP.x, z: LIP.z });
  // Arc length, tangents, normals.
  let total = 0;
  for (let i = 0; i < S.length; i++) {
    if (i > 0) total += Math.hypot(S[i].x - S[i - 1].x, S[i].z - S[i - 1].z);
    S[i].s = total;
    const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    S[i].nx = -(b.z - a.z) / l;
    S[i].nz = (b.x - a.x) / l;
  }
  // Surface height: channel bed + depth, never below a gentle grade that ends at the lip, and
  // never rising downstream.
  // The mesa stretch is a calm, full channel at the lip's level (filling the bed's dips like a
  // real river would); the mountain stretch is a shallow fast stream on its bed. Over the cave
  // roof (structures, x < -133) the heightfield is the cave slot, so only the level counts there.
  // It ends a hair under the lip so setdressing's waterfall top flow sits on top of it.
  const ROOF_X = -133;
  const END_Y = LIP.y - 0.34; // 28.86: above the roof notch, under setdressing's top flow (29.1)
  for (const p of S) {
    const h = (o) => heightAt(p.x + p.nx * o, p.z + p.nz * o);
    const bed = Math.min(h(0), h(1.2), h(-1.2));
    const level = END_Y + (total - p.s) * 0.0015;
    p.y = p.x < ROOF_X ? level : Math.max(bed + 0.32, level);
  }
  for (let i = 1; i < S.length; i++) S[i].y = Math.min(S[i].y, S[i - 1].y);
  S[S.length - 1].y = END_Y;
  // Flow speed from the slope, travel-time coordinate, foam on steep runs and at the lip.
  let travel = 0;
  for (let i = 0; i < S.length; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
    const ds = Math.max(0.5, b.s - a.s);
    const slope = Math.max(0, (a.y - b.y) / ds);
    S[i].speed = clamp(1.1 + 9 * slope, 1.1, 5.5);
    S[i].foam = clamp(smoothstep(0.08, 0.4, slope) + (1 - smoothstep(0, 7, total - S[i].s)) * 0.55, 0, 1);
    if (i > 0) travel += (S[i].s - S[i - 1].s) / ((S[i].speed + S[i - 1].speed) * 0.5);
    S[i].travel = travel;
  }
  const pos = [], attr = [], idx = [];
  for (let i = 0; i < S.length; i++) {
    const p = S[i];
    const halfW = (2.6 + 1.6 * smoothstep(42, 33, p.y)) * smoothstep(0, 5, p.s) + 0.3;
    for (const side of [-1, 1]) {
      pos.push(p.x + p.nx * halfW * side, p.y, p.z + p.nz * halfW * side);
      attr.push(side, p.travel, p.speed, p.foam);
    }
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      idx.push(a, b, c, b, d, c); // counter-clockwise seen from above
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aRiver', new THREE.Float32BufferAttribute(attr, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

export function createOcean(ctx) {
  const C = (hex) => ({ value: new THREE.Color(hex) });
  const shared = {
    ...fogUniforms,
    uLandHeight: { value: getHeightTexture() },
    uRipple: { value: getRippleTexture() },
    uTime: { value: 0 },
    uLanternPos: { value: new THREE.Vector3(0, -100, 0) },
    uLanternColor: C(0xffa64a),
    uLanternI: { value: 1 },
    uFoam: C(0xf2f0ea),
    uKeyDir: skyUniforms.uKeyDir,
    uKeyColor: skyUniforms.uKeyColor,
    uAmbSky: skyUniforms.uAmbSky,
    uAmbGround: skyUniforms.uAmbGround,
    uSkyZenith: skyUniforms.uSkyZenith,
    uSkyMid: skyUniforms.uSkyMid,
    uSkyGlow: skyUniforms.uSkyGlow,
    uSkyGlowAmt: skyUniforms.uSkyGlowAmt,
    uSunPos: skyUniforms.uSunPos,
    uSunDisc: skyUniforms.uSunDisc,
    uMoonPos: skyUniforms.uMoonPos,
    uMoonDisc: skyUniforms.uMoonDisc,
  };
  const oceanUniforms = {
    ...shared,
    uOceanGrid: { value: new THREE.Vector4(0, 0, 40, 60) },
    uShallow: C(0x48c9bc),
    uMid: C(0x167a86),
    uDeep: C(0x0c2c4c),
  };
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    vertexShader: OCEAN_VERT(),
    fragmentShader: OCEAN_FRAG(),
    transparent: true,
    depthWrite: true,
  });
  oceanMat.userData.lenteraFog = true;

  let detail = clamp(ctx.engine.preset.waterDetail ?? 1, 0, 2);
  let spec = DETAIL[detail];
  const mesh = new THREE.Mesh(buildOceanGeometry(spec.half, spec.step), oceanMat);
  mesh.name = 'ocean';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10; // first among transparents: mist, spirits, fx blend over the water
  mesh.castShadow = mesh.receiveShadow = false;
  ctx.scene.add(mesh);

  const riverUniforms = {
    ...shared,
    uRiverShallow: C(0x5fb8a4),
    uRiverDeep: C(0x1d5f6a),
  };
  const riverMat = new THREE.ShaderMaterial({
    uniforms: riverUniforms,
    vertexShader: RIVER_VERT(),
    fragmentShader: RIVER_FRAG(),
    transparent: true,
    depthWrite: false,
  });
  riverMat.userData.lenteraFog = true;
  const river = new THREE.Mesh(buildRiverGeometry(), riverMat);
  river.name = 'river';
  river.renderOrder = -9;
  river.castShadow = river.receiveShadow = false;
  ctx.scene.add(river);

  function setDetail(d) {
    detail = d;
    spec = DETAIL[d];
    const old = mesh.geometry;
    mesh.geometry = buildOceanGeometry(spec.half, spec.step);
    old.dispose();
  }

  return {
    mesh,
    river,
    uniforms: oceanUniforms,
    waveAmplitude: WAVE_AMPLITUDE,
    // Height of the sea surface above y = 0 at (x, z), time t (defaults to the sim time).
    waveHeight(x, z, t) {
      return waveHeightAt(x, z, t ?? ctx.time?.t ?? 0);
    },
    update(dt, t) {
      shared.uTime.value = t;
      const want = clamp(ctx.engine.preset.waterDetail ?? 1, 0, 2);
      if (want !== detail) setDetail(want);
      const cam = ctx.camera.position;
      const sx = Math.round(cam.x / spec.step) * spec.step;
      const sz = Math.round(cam.z / spec.step) * spec.step;
      mesh.position.set(sx, 0, sz);
      oceanUniforms.uOceanGrid.value.set(sx, sz, spec.half * 0.7, spec.half * 0.96);
      const p = ctx.player;
      if (p) {
        const lw = p.lanternWorld;
        if (lw && lw.lengthSq() > 0) shared.uLanternPos.value.copy(lw);
        else if (p.position) shared.uLanternPos.value.set(p.position.x, p.position.y + 1.2, p.position.z);
        const L = p.lanternLight;
        const on = L ? clamp(L.intensity / 6, 0, 2.5) * (L.visible === false ? 0 : 1) : 1;
        shared.uLanternI.value = on * clamp((p.lanternRadius ?? 16) / 14, 0.4, 1.4);
        if (L && L.color) shared.uLanternColor.value.copy(L.color);
      }
    },
  };
}
