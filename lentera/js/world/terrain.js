// Terrain mesh built from the baked heightfield. Owner: landscape.
// The heightfield itself (heightfield.js) and LANDMARKS are fixed; this file only renders them.
//
// - Vertices sit exactly on the baked grid (same triangle split as heightAt), so collision and
//   the rendered surface agree. Quads entirely deeper than -8 m are skipped: the ocean is opaque
//   there, so the world edge never shows and the triangle count stays low. One draw call.
// - Look: MeshStandardMaterial + onBeforeCompile (chained before patchMaterial): world-space
//   multi-scale noise, sand / wet sand / seabed, two grass tones with macro variation, soil,
//   slope rock with strata, path + trodden plaza tint (baked masks), river bed, cavity darkening,
//   detail normals and animated caustics in the shallows.

import * as THREE from 'three';
import {
  bakeHeightfield, heightAt, normalAt, slopeAt, distToPath, distToRiver,
  GRID_N, GRID_STEP, WORLD_HALF, LANDMARKS, SEA_LEVEL,
} from './heightfield.js';
import { patchMaterial } from './fog.js';
import { getNoiseTexture } from './land-maps.js';
import { skyUniforms } from './sky-shared.js';
import { smoothstep } from '../core/math.js';

export { heightAt, normalAt, slopeAt, LANDMARKS, SEA_LEVEL };

const SKIP_BELOW = -8; // quads whose highest corner is below this are not drawn

// Trodden ground (dirt) around places people use. r = full radius, f = feather.
const PLAZAS = [
  { x: LANDMARKS.kampung.x, z: LANDMARKS.kampung.z, r: 17, f: 12 },
  { x: LANDMARKS.candi.campfire.x, z: LANDMARKS.candi.campfire.z, r: 5, f: 4 },
  { x: LANDMARKS.airTerjun.campfire.x, z: LANDMARKS.airTerjun.campfire.z, r: 4.5, f: 4 },
  { x: LANDMARKS.mercusuar.x, z: LANDMARKS.mercusuar.z, r: 10, f: 6 },
  { x: LANDMARKS.candi.x, z: LANDMARKS.candi.z, r: 22, f: 8 },
];

const TERRAIN_PARS_VERTEX = /* glsl */ `
attribute vec4 aLand;
attribute float aCoast;
varying vec4 vLand;
varying float vCoast;
varying vec3 vLandPos;
varying vec3 vLandNrm;
`;
const TERRAIN_VERTEX = /* glsl */ `
vLand = aLand;
vCoast = aCoast * 64.0;
vLandPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vLandNrm = normalize(mat3(modelMatrix) * objectNormal);
`;

const TERRAIN_PARS_FRAGMENT = /* glsl */ `
uniform sampler2D uLandNoise;
uniform float uLandTime;
uniform vec3 uKeyColor;
uniform vec3 uSandA;
uniform vec3 uSandB;
uniform vec3 uWetSand;
uniform vec3 uSeabedA;
uniform vec3 uSeabedB;
uniform vec3 uGrassLush;
uniform vec3 uGrassDry;
uniform vec3 uGrassDark;
uniform vec3 uSoil;
uniform vec3 uRockA;
uniform vec3 uRockB;
uniform vec3 uPath;
uniform vec3 uRiverBed;
uniform float uDetailNormals;
uniform float uNight;
varying vec4 vLand;
varying float vCoast;
varying vec3 vLandPos;
varying vec3 vLandNrm;
`;

const TERRAIN_ALBEDO = /* glsl */ `
vec3 lP = vLandPos;
vec3 lN0 = normalize(vLandNrm);
float lSlope = 1.0 - lN0.y; // 0 flat, .13 = 30deg, .23 = 40deg, .36 = 50deg
vec4 nMac = texture2D(uLandNoise, lP.xz * 0.0045);
vec4 nMid = texture2D(uLandNoise, lP.xz * 0.021);
vec4 nDet = texture2D(uLandNoise, lP.xz * 0.11);
vec4 nFin = texture2D(uLandNoise, lP.xz * 0.53);
float lH = lP.y + (nMid.g - 0.5) * 0.9 + (nDet.b - 0.5) * 0.35;

// Sand with soft wind ripples.
float rip = sin(dot(lP.xz, vec2(0.83, 0.55)) * 3.1 + nDet.g * 8.0 + nMid.r * 6.0) * 0.5 + 0.5;
vec3 sand = mix(uSandA, uSandB, smoothstep(0.25, 0.75, nMid.b)) * (0.96 + 0.06 * nFin.a) * (0.97 + 0.045 * rip);
vec3 wet = uWetSand * (0.9 + 0.16 * nFin.g);
vec3 seabed = mix(uSeabedA, uSeabedB, smoothstep(-1.2, -9.0, lP.y + (nMid.r - 0.5) * 3.0));
seabed *= 0.85 + 0.25 * nDet.a;

// Grass: lush / dry by macro noise, hue drift, darker under the forest pockets, drier up high.
float lush = smoothstep(0.22, 0.78, nMac.g + (nMid.b - 0.5) * 0.35);
vec3 grass = mix(uGrassDry, uGrassLush, lush);
grass = mix(grass, uGrassDark, smoothstep(0.52, 0.8, nMac.r) * 0.65);
grass *= vec3(1.0 + (nMid.a - 0.5) * 0.18, 1.0, 1.0 - (nMid.a - 0.5) * 0.2);
grass = mix(grass, uGrassDry, smoothstep(34.0, 70.0, lP.y) * 0.5);
grass *= 0.88 + 0.16 * nDet.g + 0.05 * (nFin.r - 0.5);
float soilM = smoothstep(0.62, 0.8, nDet.r * 0.45 + nMid.b * 0.25 + lSlope * 2.2);
vec3 lCol = mix(grass, uSoil * (0.9 + 0.2 * nFin.b), soilM * 0.6);

// Beach follows the shoreline (baked distance to water), with a wavy vegetation line and a
// few metres of sandy grass behind it. Only low ground becomes beach (cliffs stay rock/grass).
float coastD = vCoast + (nMid.g - 0.5) * 9.0 + (nDet.r - 0.5) * 3.0;
float lowGround = 1.0 - smoothstep(3.2, 5.5, lP.y);
float beach = (1.0 - smoothstep(13.0, 16.5, coastD)) * lowGround;
beach = max(beach, 1.0 - smoothstep(1.0, 1.6, lH)); // anything at the waterline is sand
float sandy = (1.0 - smoothstep(15.0, 26.0, coastD)) * lowGround * smoothstep(0.42, 0.7, nDet.b * 0.7 + nFin.g * 0.3);
lCol = mix(lCol, mix(lCol, sand * 0.9, 0.65), sandy * (1.0 - beach));
lCol = mix(lCol, sand, beach);
float wetM = 1.0 - smoothstep(0.1, 0.85, lH);
lCol = mix(lCol, wet, wetM);
lCol = mix(lCol, seabed, 1.0 - smoothstep(-1.2, -0.25, lH));

// Rock on steep slopes: triplanar noise (no vertical smearing) and horizontal strata.
float rockM = smoothstep(0.15, 0.27, lSlope + (nDet.a - 0.5) * 0.14);
if (rockM > 0.0) {
  vec3 aw = abs(lN0);
  aw = pow(aw, vec3(4.0));
  aw /= aw.x + aw.y + aw.z;
  vec4 rx = texture2D(uLandNoise, lP.zy * vec2(0.09, 0.16));
  vec4 rz = texture2D(uLandNoise, lP.xy * vec2(0.09, 0.16));
  vec4 rf = texture2D(uLandNoise, lP.zy * 0.45) * aw.x + texture2D(uLandNoise, lP.xy * 0.45) * aw.z + nFin * aw.y;
  vec4 rn = rx * aw.x + rz * aw.z + nDet * aw.y;
  vec3 rock = mix(uRockA, uRockB, smoothstep(0.3, 0.7, rn.r));
  float strata = sin(lP.y * 1.7 + rn.g * 4.0 + nMid.g * 3.0) * 0.5 + 0.5;
  rock *= 0.74 + 0.2 * strata + 0.22 * (rf.a - 0.5) + 0.12 * (rn.b - 0.5);
  // Mossy tops of ledges on the less steep parts.
  rock = mix(rock, uGrassDark * 0.9, smoothstep(0.24, 0.16, lSlope) * smoothstep(0.45, 0.7, rn.a) * (1.0 - beach) * 0.6);
  lCol = mix(lCol, rock, rockM);
}

// Paths and trodden plazas (baked masks), broken up by noise.
float pathM = smoothstep(0.34, 0.62, vLand.x + (nFin.r - 0.5) * 0.4 + (nDet.g - 0.5) * 0.25);
float plazaM = smoothstep(0.3, 0.72, vLand.z + (nDet.r - 0.5) * 0.5 + (nFin.g - 0.5) * 0.25);
vec3 dirt = uPath * (0.88 + 0.22 * nFin.g) * (0.95 + 0.1 * nDet.b);
lCol = mix(lCol, dirt, max(pathM, plazaM * 0.8) * (1.0 - rockM * 0.7) * smoothstep(0.3, 1.0, lH));

// River bed: dark wet pebbles.
float riverM = smoothstep(0.3, 0.75, vLand.y);
vec3 bed = uRiverBed * mix(0.75, 1.5, smoothstep(0.55, 0.7, nFin.a)) * (0.9 + 0.2 * nDet.b);
lCol = mix(lCol, bed, riverM);

// Cavity darkening (baked) for depth in valleys, channels and coves.
lCol *= mix(0.7, 1.08, vLand.w);
// Moonlit nights read desaturated (the lantern's warm pool still pops).
lCol = mix(lCol, vec3(dot(lCol, vec3(0.3, 0.55, 0.15))), uNight * 0.45);
diffuseColor.rgb = lCol;
float landRough = mix(0.96, 0.55, max(wetM * (1.0 - smoothstep(-0.4, -1.5, lP.y)), riverM * 0.8));
`;

const TERRAIN_NORMAL = /* glsl */ `
{
  vec3 nW = lN0;
  if (uDetailNormals > 0.5) {
    float e = 0.55;
    float b0 = nFin.a;
    float bx = texture2D(uLandNoise, (lP.xz + vec2(e, 0.0)) * 0.53).a;
    float bz = texture2D(uLandNoise, (lP.xz + vec2(0.0, e)) * 0.53).a;
    vec2 g = vec2(bx - b0, bz - b0) / e;
    float d0 = nDet.b;
    float dx = texture2D(uLandNoise, (lP.xz + vec2(1.4, 0.0)) * 0.11).b;
    float dz = texture2D(uLandNoise, (lP.xz + vec2(0.0, 1.4)) * 0.11).b;
    vec2 g2 = vec2(dx - d0, dz - d0) / 1.4;
    float amt = mix(0.16, 0.7, rockM) * (1.0 - riverM * 0.4) * (1.0 - max(beach, wetM) * 0.85);
    nW = normalize(lN0 - vec3(g.x, 0.0, g.y) * amt - vec3(g2.x, 0.0, g2.y) * (0.5 + 1.7 * rockM) * (1.0 - beach * 0.7));
  }
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}
`;

// Caustics in the shallows (light pattern added as emissive, scaled by the key light).
const TERRAIN_EMISSIVE = /* glsl */ `
{
  float under = smoothstep(0.05, -0.5, lP.y) * (1.0 - smoothstep(-1.5, -5.5, lP.y));
  if (under > 0.0) {
    vec2 cp = lP.xz * 0.22;
    float c1 = texture2D(uLandNoise, cp + vec2(uLandTime * 0.035, uLandTime * 0.021)).a;
    float c2 = texture2D(uLandNoise, cp * 1.37 - vec2(uLandTime * 0.027, -uLandTime * 0.031)).a;
    float c = pow(clamp(min(c1, c2) * 1.25, 0.0, 1.0), 4.0);
    totalEmissiveRadiance += uKeyColor * c * under * 0.08;
  }
}
`;

function buildMasks(grid) {
  const N = GRID_N;
  const masks = new Uint8Array(N * N * 4);
  const at = (i, j) => grid[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
  for (let j = 0; j < N; j++) {
    const z = -WORLD_HALF + j * GRID_STEP;
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const h = grid[k];
      const o = k * 4;
      if (h < SKIP_BELOW - 2) { masks[o + 3] = 128; continue; }
      const x = -WORLD_HALF + i * GRID_STEP;
      let path = 0;
      if (h > 0.2) path = 1 - smoothstep(0.9, 3.0, distToPath(x, z));
      let river = 0;
      if (h > 18) river = 1 - smoothstep(1.4, 4.4, distToRiver(x, z));
      let plaza = 0;
      for (const p of PLAZAS) {
        const d = Math.hypot(x - p.x, z - p.z);
        plaza = Math.max(plaza, 1 - smoothstep(p.r, p.r + p.f, d));
      }
      // Cavity: neighbourhood mean (two rings) minus own height. Positive = hollow (darker).
      let s = 0, n = 0;
      for (const r of [2, 4]) {
        s += at(i - r, j) + at(i + r, j) + at(i, j - r) + at(i, j + r);
        s += at(i - r, j - r) + at(i + r, j + r) + at(i - r, j + r) + at(i + r, j - r);
        n += 8;
      }
      const cav = s / n - h;
      const ao = Math.min(1, Math.max(0, 0.62 - cav * 0.16));
      masks[o] = Math.round(path * 255);
      masks[o + 1] = Math.round(river * 255);
      masks[o + 2] = Math.round(plaza * 255);
      masks[o + 3] = Math.round(ao * 255);
    }
  }
  return masks;
}

// Distance (m) from each grid vertex to the nearest water (h < 0), two-pass chamfer transform.
function coastDistance(grid) {
  const N = GRID_N;
  const d = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) d[k] = grid[k] < 0 ? 0 : 1e9;
  const D = Math.SQRT2;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + 1);
      if (j > 0) {
        v = Math.min(v, d[k - N] + 1);
        if (i > 0) v = Math.min(v, d[k - N - 1] + D);
        if (i < N - 1) v = Math.min(v, d[k - N + 1] + D);
      }
      d[k] = v;
    }
  }
  for (let j = N - 1; j >= 0; j--) {
    for (let i = N - 1; i >= 0; i--) {
      const k = j * N + i;
      let v = d[k];
      if (i < N - 1) v = Math.min(v, d[k + 1] + 1);
      if (j < N - 1) {
        v = Math.min(v, d[k + N] + 1);
        if (i < N - 1) v = Math.min(v, d[k + N + 1] + D);
        if (i > 0) v = Math.min(v, d[k + N - 1] + D);
      }
      d[k] = v;
    }
  }
  const out = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) out[k] = Math.min(255, Math.round((d[k] * GRID_STEP / 64) * 255));
  return out;
}

export function createTerrain(ctx) {
  const grid = bakeHeightfield();
  const N = GRID_N;
  const positions = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++) {
    const z = -WORLD_HALF + j * GRID_STEP;
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      positions[k * 3] = -WORLD_HALF + i * GRID_STEP;
      positions[k * 3 + 1] = grid[k];
      positions[k * 3 + 2] = z;
    }
  }

  const index = [];
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      if (Math.max(grid[a], grid[b], grid[c], grid[d]) < SKIP_BELOW) continue;
      // Same split as heightAt(): (a, c, b) and (c, d, b).
      index.push(a, c, b, c, d, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aLand', new THREE.BufferAttribute(buildMasks(grid), 4, true));
  geo.setAttribute('aCoast', new THREE.BufferAttribute(coastDistance(grid), 1, true));
  geo.setIndex(index);
  // Smooth normals straight from the heightfield (central differences).
  const normals = new Float32Array(N * N * 3);
  const nTmp = [0, 1, 0];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (grid[k] < SKIP_BELOW - 3) { normals[k * 3 + 1] = 1; continue; }
      normalAt(positions[k * 3], positions[k * 3 + 2], nTmp);
      normals[k * 3] = nTmp[0]; normals[k * 3 + 1] = nTmp[1]; normals[k * 3 + 2] = nTmp[2];
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  const preset = ctx.engine.preset;
  const C = (hex) => ({ value: new THREE.Color(hex) });
  const landUniforms = {
    uLandNoise: { value: getNoiseTexture() },
    uLandTime: { value: 0 },
    uKeyColor: skyUniforms.uKeyColor,
    uNight: skyUniforms.uNight,
    uSandA: C(0xe4d2aa),
    uSandB: C(0xd2b98e),
    uWetSand: C(0x8a7354),
    uSeabedA: C(0xb59f76),
    uSeabedB: C(0x4f675f),
    uGrassLush: C(0x4a8a3a),
    uGrassDry: C(0x7d9046),
    uGrassDark: C(0x2f5a30),
    uSoil: C(0x7a6446),
    uRockA: C(0x6e6a66),
    uRockB: C(0x8e7c68),
    uPath: C(0xa48358),
    uRiverBed: C(0x4c4b40),
    uDetailNormals: { value: preset.name === 'low' ? 0 : 1 },
  };

  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, landUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_PARS_VERTEX)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + TERRAIN_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_PARS_FRAGMENT)
      .replace('#include <color_fragment>', TERRAIN_ALBEDO)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = landRough;')
      .replace('#include <normal_fragment_maps>', TERRAIN_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + TERRAIN_EMISSIVE);
  };
  material.customProgramCacheKey = () => 'lenteraTerrain';
  patchMaterial(material);

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  ctx.scene.add(mesh);

  return {
    mesh,
    uniforms: landUniforms,
    heightAt,
    normalAt,
    slopeAt,
    update(dt, t) {
      landUniforms.uLandTime.value = t;
      const detail = ctx.engine.preset.name === 'low' ? 0 : 1;
      if (landUniforms.uDetailNormals.value !== detail) landUniforms.uDetailNormals.value = detail;
    },
  };
}
