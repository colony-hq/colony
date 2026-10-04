// Terrain: the overworld (chunked for culling) and the three dungeon floors, all built on the exact
// mapgen corner grid (vertex (x, z) = corner height, diagonal split identical to heightAt), plus a
// coarse mountain / seabed skirt beyond the world edge. Stylised hand-painted look from a
// MeshLambertMaterial + onBeforeCompile shader fed by baked per-vertex colours and material masks
// (w-fields.js): zone palettes, macro/micro grass variation, slope rock with strata, beaches,
// river pebbles, swamp mud, worn roads with trampled rims, Gildmoor cobbles, farm furrows, indoor
// planks / flagstones, ash + embers near the peak, glowing crystal veins on the Orbio plateau,
// caustics under shallow water, drifting cloud shadows. Owner: world builder.
//
// API: meshes (all terrain meshes), regions { overworld: Group, warrens, vault, lair: Mesh },
//      skirt (Mesh), material (overworld material), chunks, update(dt).
// The overworld is 5 x 5 chunks of 64 tiles with 3 LODs (1, 2, 4 m) picked by camera distance;
// LOD0 sits exactly on the corner grid (heightAt), coarser LODs only ever appear far away.

import * as THREE from 'three';
import { getRegionGrid, heightAt, OVERWORLD, DUNGEONS } from './mapgen.js';
import { getOverworldFields, getDungeonFields, DUNGEON_KIND, skirtHeight, skirtNoise } from './w-fields.js';
import { U, GLSL_COMMON } from './w-common.js';

const CHUNK = 64;

// ---------------------------------------------------------------------------------------------
// Shader
// ---------------------------------------------------------------------------------------------
const VERT_HEAD = /* glsl */`
attribute vec3 aBase;
attribute vec3 aRock;
attribute vec4 aMaskA;
attribute vec4 aMaskB;
attribute vec4 aMaskC;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vBase;
varying vec3 vRock;
varying vec4 vMA;
varying vec4 vMB;
varying vec4 vMC;
`;
const VERT_BODY = /* glsl */`
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNrm = normalize(mat3(modelMatrix) * objectNormal);
vBase = aBase; vRock = aRock; vMA = aMaskA; vMB = aMaskB; vMC = aMaskC;
`;

const FRAG_HEAD = /* glsl */`
uniform sampler2D uNoise;
uniform float uTime;
uniform float uNight;
uniform float uDay;
uniform float uCloudShadow;
uniform float uGlow;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vBase;
varying vec3 vRock;
varying vec4 vMA;
varying vec4 vMB;
varying vec4 vMC;
${GLSL_COMMON}
`;

// Computes `col` (sRGB-ish albedo) and `hvEmis` (linear emissive).
const FRAG_BODY = /* glsl */`
vec3 hvEmis = vec3(0.0);
vec2 wp = vWPos.xz;
vec4 nM = texture2D(uNoise, wp * 0.0105);
vec4 nD = texture2D(uNoise, wp * 0.043);
vec4 nF = texture2D(uNoise, wp * 0.21);
float slope = 1.0 - clamp(vWNrm.y, 0.0, 1.0);
vec3 col = vBase;
#if TERRAIN_KIND == 0
  // ---- grass: soft painterly macro hue shifts, gentle detail ----
  col *= 0.9 + 0.2 * nM.r;
  col = mix(col, col * vec3(1.08, 1.05, 0.78), smoothstep(0.5, 0.85, nM.g) * 0.5);
  col = mix(col, col * vec3(0.9, 1.0, 1.08), smoothstep(0.55, 0.9, 1.0 - nM.g) * 0.35);
  col *= 0.95 + 0.1 * nD.g;
  col *= 0.95 + 0.08 * nF.g;
  float streak = texture2D(uNoise, vec2(wp.x * 0.05 + wp.y * 0.02, wp.y * 0.28)).g;
  col *= 0.96 + 0.07 * streak;
  // ---- swamp mud ----
  float mudW = smoothstep(0.35, 0.6, vMA.w + (nD.g - 0.5) * 0.35);
  vec3 mudC = mix(vec3(0.34, 0.33, 0.25), vec3(0.44, 0.43, 0.33), nF.r);
  mudC = mix(mudC, mudC * vec3(0.8, 0.95, 0.9), smoothstep(0.6, 0.8, nD.r));
  col = mix(col, mudC, mudW);
  // ---- pebbles (river banks, scree) ----
  vec4 nP = texture2D(uNoise, wp * 0.42);
  float stone = smoothstep(0.12, 0.3, nP.b) * smoothstep(0.72, 0.82, nP.a);
  vec3 gravel = mix(vec3(0.50, 0.47, 0.41), vec3(0.62, 0.59, 0.52), nF.g) * (0.9 + 0.15 * nF.r);
  vec3 pebC = mix(gravel, mix(vec3(0.55, 0.53, 0.49), vec3(0.74, 0.71, 0.65), nP.a), stone);
  float pebW = smoothstep(0.35, 0.62, vMA.z + (nD.g - 0.5) * 0.3);
  col = mix(col, mix(col, pebC, 0.85), pebW);
  // ---- sand ----
  float sandW = smoothstep(0.38, 0.62, vMA.y + (nD.r - 0.5) * 0.3);
  vec3 sandC = mix(vec3(0.83, 0.74, 0.54), vec3(0.94, 0.87, 0.69), nF.r) * (0.94 + 0.08 * nD.g);
  sandC *= 0.95 + 0.06 * sin(wp.x * 2.1 + wp.y * 0.8 + nD.r * 7.0);
  col = mix(col, sandC, sandW);
  // ---- farm fields: furrows + crop colour ----
  float farmW = smoothstep(0.35, 0.6, vMB.z + (nD.r - 0.5) * 0.2);
  if (farmW > 0.001) {
    float info = floor(vMB.w * 15.0 + 0.5);
    float orient = step(7.5, info);
    float ftype = info - orient * 8.0;
    float u = mix(wp.y, wp.x, orient);
    float row = fract(u * 0.92);
    float ridge = smoothstep(0.0, 0.32, row) * smoothstep(1.0, 0.68, row);
    vec3 soil = mix(vec3(0.44, 0.32, 0.2), vec3(0.55, 0.41, 0.27), nF.r);
    vec3 crop = vec3(0.80, 0.72, 0.38);
    float cover = 0.85;
    if (ftype < 1.5) crop = vec3(0.86, 0.70, 0.30);
    else if (ftype < 2.5) crop = vec3(0.40, 0.58, 0.50);
    else if (ftype < 3.5) crop = vec3(0.38, 0.58, 0.27);
    else if (ftype < 4.5) { crop = soil * 1.25; cover = 0.6; }
    else if (ftype < 5.5) crop = vec3(0.34, 0.50, 0.21);
    crop *= 0.85 + 0.3 * nF.g;
    vec3 fc = mix(soil * 0.78, crop, ridge * cover);
    col = mix(col, fc, farmW);
  }
  // ---- roads: dirt with gravel, trampled rim, town cobbles ----
  float rN = vMA.x + (nD.g - 0.5) * 0.32 + (nF.r - 0.5) * 0.14;
  float roadW = smoothstep(0.45, 0.56, rN);
  float rimW = smoothstep(0.28, 0.45, rN) * (1.0 - roadW);
  col *= 1.0 - 0.2 * rimW;
  col = mix(col, col * vec3(1.06, 1.0, 0.82), rimW * 0.5);
  vec3 dirt = mix(vec3(0.58, 0.48, 0.35), vec3(0.70, 0.60, 0.45), nD.r);
  dirt = mix(dirt, dirt * 1.1, smoothstep(0.55, 0.95, vMA.x));
  vec4 nG = texture2D(uNoise, wp * 0.33);
  dirt *= 0.9 + 0.16 * smoothstep(0.1, 0.3, nG.b) * nG.a;
  dirt = mix(dirt, dirt * 0.8, smoothstep(0.6, 0.85, nF.g) * 0.5);
  if (vMC.x > 0.01) {
    vec4 nC = texture2D(uNoise, wp * 0.16);
    float st = smoothstep(0.05, 0.2, nC.b);
    vec3 cob = mix(vec3(0.50, 0.48, 0.45), vec3(0.68, 0.65, 0.60), nC.a);
    cob = mix(cob, vec3(0.74, 0.72, 0.86) * (0.85 + 0.25 * nC.a), smoothstep(0.3, 0.7, vMC.z));
    cob = mix(vec3(0.28, 0.27, 0.25), cob, st);
    dirt = mix(dirt, cob, smoothstep(0.3, 0.7, vMC.x));
  }
  col = mix(col, dirt, roadW);
  // ---- slope rock: side-projected pattern (no streaks), soft strata, cracks only on bare rock ----
  float rockN = slope + (nD.b - 0.5) * 0.16 + (nF.r - 0.5) * 0.08;
  float rockW = smoothstep(0.24, 0.34, rockN) * (1.0 - step(0.48, vMB.x));
  if (rockW > 0.001) {
    vec2 rp = abs(vWNrm.x) > abs(vWNrm.z) ? vec2(wp.y, vWPos.y) : vec2(wp.x, vWPos.y);
    rp = mix(wp, rp, smoothstep(0.3, 0.55, slope));
    vec4 r1 = texture2D(uNoise, rp * 0.045);
    vec4 r2 = texture2D(uNoise, rp * 0.16);
    vec3 rc = vRock * (0.8 + 0.32 * r1.r) * (0.92 + 0.12 * r2.g);
    rc *= 0.93 + 0.07 * sin(vWPos.y * 1.3 + r1.g * 6.0);
    float crk = (1.0 - smoothstep(0.02, 0.09, r2.b)) * smoothstep(0.45, 0.7, r1.b);
    rc *= 1.0 - 0.32 * crk * smoothstep(0.6, 0.95, rockW);
    rc *= 0.82 + 0.32 * clamp(vWNrm.y * 1.4, 0.0, 1.0);
    // a little moss / dust on gentler rock
    rc = mix(rc, col * 0.9, (1.0 - smoothstep(0.32, 0.5, slope)) * 0.35);
    col = mix(col, rc, rockW);
  }
  // ---- interior floors ----
  if (vMB.x > 0.45) {
    float ft = floor(vMB.y * 7.0 + 0.5);
    vec3 fc;
    if (ft < 1.5) {
      float pw = 0.34;
      float rowId = floor(wp.y / pw);
      float off = hvHash12(vec2(rowId, 3.7)) * 2.4;
      float pl = (wp.x + off) / 2.4;
      float hh = hvHash12(vec2(rowId, floor(pl)));
      fc = mix(vec3(0.50, 0.33, 0.19), vec3(0.66, 0.46, 0.28), hh);
      fc *= 0.86 + 0.24 * texture2D(uNoise, vec2(wp.x * 0.05, wp.y * 1.3)).g;
      float fy = fract(wp.y / pw), fx = fract(pl);
      float seam = smoothstep(0.0, 0.07, fy) * smoothstep(1.0, 0.93, fy) * smoothstep(0.0, 0.012, fx) * smoothstep(1.0, 0.988, fx);
      fc *= mix(0.5, 1.0, seam);
    } else if (ft < 2.5) {
      vec4 nS = texture2D(uNoise, wp * 0.0625);
      float st = smoothstep(0.03, 0.09, nS.b);
      fc = mix(vec3(0.52, 0.50, 0.46), vec3(0.67, 0.64, 0.58), nS.a) * (0.9 + 0.15 * nF.r);
      fc = mix(vec3(0.30, 0.29, 0.26), fc, st);
    } else if (ft < 3.5) {
      fc = mix(vec3(0.44, 0.36, 0.27), vec3(0.56, 0.46, 0.33), nF.r);
      float straw = smoothstep(0.8, 0.9, texture2D(uNoise, vec2(wp.x * 0.7 + wp.y * 0.2, wp.y * 0.25)).g);
      fc = mix(fc, vec3(0.80, 0.69, 0.40), straw * 0.6);
    } else {
      vec4 nS = texture2D(uNoise, wp * 0.07);
      fc = mix(vec3(0.70, 0.68, 0.83), vec3(0.87, 0.86, 0.96), nS.a);
      float seam = 1.0 - smoothstep(0.02, 0.06, nS.b);
      fc = mix(fc, vec3(0.45, 0.85, 1.0), seam * 0.6);
      hvEmis += vec3(0.2, 0.6, 1.0) * seam * 0.3 * uGlow;
    }
    col = mix(col, fc, step(0.48, vMB.x));
  }
  // ---- ash + embers near the Ashen Peak ----
  float ashW = smoothstep(0.3, 0.6, vMC.y + (nD.r - 0.5) * 0.3);
  if (ashW > 0.001) {
    vec3 ashC = mix(vec3(0.27, 0.26, 0.25), vec3(0.46, 0.44, 0.42), nF.g);
    col = mix(col, ashC, ashW * 0.85);
    vec4 nE = texture2D(uNoise, wp * 0.4);
    float ember = smoothstep(0.94, 0.985, nE.a) * smoothstep(0.08, 0.2, nE.b) * smoothstep(0.55, 0.95, vMC.y) * smoothstep(0.6, 0.85, vWNrm.y);
    hvEmis += vec3(1.0, 0.32, 0.06) * ember * (0.55 + 0.45 * sin(uTime * 2.3 + nE.a * 40.0)) * 1.3 * uGlow;
  }
  // ---- Orbio plateau: crystal-tinted ground with glowing veins ----
  if (vMC.z > 0.01) {
    col = mix(col, col * vec3(0.95, 0.97, 1.1), vMC.z * 0.4);
    float vein = (1.0 - smoothstep(0.0, 0.012, abs(nD.r - 0.5))) * smoothstep(0.35, 0.6, nM.g);
    float pulse = 0.6 + 0.4 * sin(uTime * 1.3 + wp.x * 0.15 + wp.y * 0.1);
    vec3 vc = mix(vec3(0.35, 0.95, 1.0), vec3(0.78, 0.52, 1.0), nM.r);
    float vk = vein * vMC.z * (1.0 - step(0.48, vMB.x)) * (1.0 - roadW);
    col = mix(col, vc, vk * 0.5);
    hvEmis += vc * vk * pulse * (0.12 + 0.9 * uNight) * uGlow;
  }
  // ---- wet line + caustics under shallow water ----
  float wet = 1.0 - smoothstep(0.02, 0.45, vWPos.y);
  col *= 1.0 - 0.22 * wet;
  if (vWPos.y < 0.05) {
    float c1 = texture2D(uNoise, wp * 0.11 + vec2(uTime * 0.021, uTime * 0.013)).b;
    float c2 = texture2D(uNoise, wp * 0.13 - vec2(uTime * 0.017, -uTime * 0.019)).b;
    float caus = 1.0 - smoothstep(0.0, 0.1, abs(c1 - c2));
    float shallow = 1.0 - smoothstep(0.0, 2.2, -vWPos.y);
    col += vec3(0.9, 1.0, 0.95) * caus * shallow * 0.16 * uDay;
  }
  // ---- contact AO + drifting cloud shadows ----
  col *= mix(0.32, 1.0, vMC.w);
  float cl = texture2D(uNoise, wp * 0.0022 + uTime * vec2(0.0011, 0.0006)).r;
  col *= 1.0 - smoothstep(0.42, 0.85, cl) * uCloudShadow * uDay;
#elif TERRAIN_KIND == 1
  // ---- Goblin Warrens: earthy cave floor ----
  col *= 0.82 + 0.32 * nD.r;
  col *= 0.9 + 0.2 * nF.g;
  vec4 nP = texture2D(uNoise, wp * 0.3);
  float stone = smoothstep(0.12, 0.3, nP.b) * smoothstep(0.72, 0.8, nP.a);
  vec3 pebC = mix(vec3(0.45, 0.40, 0.33), vec3(0.62, 0.56, 0.47), nP.a);
  col = mix(col, pebC, stone * smoothstep(0.3, 0.6, vMA.z));
  col = mix(col, vec3(0.21, 0.18, 0.13), smoothstep(0.4, 0.65, vMA.w) * 0.75);
  float root = (1.0 - smoothstep(0.0, 0.012, abs(texture2D(uNoise, wp * 0.05).g - 0.5))) * smoothstep(0.5, 0.7, nM.r);
  col *= 1.0 - 0.3 * root;
  col *= mix(0.3, 1.0, vMC.w);
#elif TERRAIN_KIND == 2
  // ---- Sheriff's Vault: worn flagstones + crimson carpet ----
  vec2 q = wp / vec2(1.5, 1.0);
  float rowId = floor(q.y);
  q.x += mod(rowId, 2.0) * 0.5;
  vec2 cell = floor(q), f = fract(q);
  float hh = hvHash12(cell + 13.0);
  vec3 fs = mix(vec3(0.44, 0.43, 0.41), vec3(0.60, 0.58, 0.54), hh) * (0.86 + 0.24 * nF.r);
  fs *= 0.92 + 0.12 * nD.g;
  float gap = smoothstep(0.0, 0.035, f.x) * smoothstep(1.0, 0.965, f.x) * smoothstep(0.0, 0.05, f.y) * smoothstep(1.0, 0.95, f.y);
  vec3 moss = vec3(0.24, 0.30, 0.18);
  fs = mix(mix(vec3(0.20, 0.19, 0.17), moss, smoothstep(0.6, 0.8, nD.r)), fs, gap);
  col = fs;
  float carp = vMA.x;
  if (carp > 0.45) {
    vec3 cc = vec3(0.52, 0.08, 0.10) * (0.85 + 0.25 * nF.g);
    float trim = 1.0 - smoothstep(0.62, 0.7, carp);
    cc = mix(cc, vec3(0.80, 0.62, 0.22), trim);
    col = cc;
  }
  col *= mix(0.3, 1.0, vMC.w);
#elif TERRAIN_KIND == 3
  // ---- Ashen Lair: cracked basalt with glowing ash ----
  vec4 nS = texture2D(uNoise, wp * 0.028);
  float fis = smoothstep(0.35, 0.65, texture2D(uNoise, wp * 0.012 + 0.7).r);
  float crack = (1.0 - smoothstep(0.01, 0.03 + 0.04 * fis, nS.b)) * smoothstep(0.15, 0.5, fis + nD.g * 0.4);
  vec4 nS2 = texture2D(uNoise, wp * 0.09 + 0.3);
  float crack2 = 1.0 - smoothstep(0.008, 0.03, nS2.b);
  col = vBase * (0.75 + 0.5 * nS.a) * (0.85 + 0.25 * nF.r);
  vec3 ashC = mix(vec3(0.30, 0.29, 0.28), vec3(0.42, 0.40, 0.38), nF.g);
  col = mix(col, ashC, smoothstep(0.4, 0.7, vMC.y + (nD.r - 0.5) * 0.3) * 0.8);
  col *= 0.85 + 0.15 * nS.a;
  col = mix(col, col * 0.55, (1.0 - smoothstep(0.02, 0.12, nS.b)));
  float ck = max(crack, crack2 * 0.25 * smoothstep(0.6, 0.8, nD.r));
  col = mix(col, vec3(0.10, 0.06, 0.05), ck);
  float pulse = 0.6 + 0.4 * sin(uTime * 1.6 + nS.a * 6.28);
  hvEmis += vec3(1.0, 0.30, 0.05) * ck * pulse * 1.8 * uGlow;
  hvEmis += vec3(1.0, 0.35, 0.08) * smoothstep(0.75, 0.95, fis) * (1.0 - smoothstep(0.0, 0.2, nS.b)) * 0.25 * pulse * uGlow;
  col *= mix(0.4, 1.0, vMC.w);
#endif
`;

function makeMaterial(kind, skirt = false) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.defines = { TERRAIN_KIND: kind };
  if (skirt) mat.defines.HV_SKIRT = 1;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uNoise: U.uNoise, uTime: U.uTime, uNight: U.uNight, uDay: U.uDay, uCloudShadow: U.uCloudShadow, uGlow: U.uGlow,
    });
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    let fs = FRAG_HEAD + shader.fragmentShader;
    fs = fs.replace('#include <color_fragment>', FRAG_BODY + '\ndiffuseColor.rgb = hvLin(clamp(col, 0.0, 1.5));\n');
    fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += hvEmis;\n');
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'hv-terrain-' + kind + (skirt ? '-skirt' : '');
  return mat;
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------
const u8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

// Build one mesh for the corner sub-grid [cx0..cx1] x [cz0..cz1] of a region grid.
function buildPatch(region, G, F, cx0, cz0, cx1, cz1, material, step = 1) {
  const N = G.N;
  const nx = Math.floor((cx1 - cx0) / step) + 1, nz = Math.floor((cz1 - cz0) / step) + 1;
  const skirtN = step > 1 ? 2 * (nx + nz) : 0;
  const count = nx * nz + skirtN;
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3);
  const base = new Uint8Array(count * 3), rock = new Uint8Array(count * 3);
  const mA = new Uint8Array(count * 4), mB = new Uint8Array(count * 4), mC = new Uint8Array(count * 4);
  const H = G.heights;
  const hAt = (x, z) => H[Math.max(0, Math.min(N - 1, z)) * N + Math.max(0, Math.min(N - 1, x))];
  let i = 0;
  const put = (x, z, drop) => {
    const v = z * N + x;
    pos[i * 3] = region.x0 + x; pos[i * 3 + 1] = H[v] - drop; pos[i * 3 + 2] = region.z0 + z;
    let ex = hAt(x - step, z) - hAt(x + step, z), ez = hAt(x, z - step) - hAt(x, z + step);
    const l = Math.hypot(ex, 2 * step, ez);
    nrm[i * 3] = ex / l; nrm[i * 3 + 1] = (2 * step) / l; nrm[i * 3 + 2] = ez / l;
    for (let c = 0; c < 3; c++) { base[i * 3 + c] = u8(F.base[v * 3 + c]); rock[i * 3 + c] = u8(F.rock[v * 3 + c]); }
    mA[i * 4] = u8(F.road[v]); mA[i * 4 + 1] = u8(F.sand[v]); mA[i * 4 + 2] = u8(F.pebble[v]); mA[i * 4 + 3] = u8(F.mud[v]);
    mB[i * 4] = u8(F.floor[v]); mB[i * 4 + 1] = u8(F.floorType[v]); mB[i * 4 + 2] = u8(F.farm[v]); mB[i * 4 + 3] = u8(F.farmInfo[v]);
    mC[i * 4] = u8(F.cobble[v]); mC[i * 4 + 1] = u8(F.ash[v]); mC[i * 4 + 2] = u8(F.crystal[v]); mC[i * 4 + 3] = u8(F.ao[v]);
    i++;
  };
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) put(cx0 + x * step, cz0 + z * step, 0);
  const idxArr = [];
  for (let z = 0; z < nz - 1; z++) for (let x = 0; x < nx - 1; x++) {
    const a = z * nx + x, b = a + 1, c = a + nx, d = c + 1;
    // Same split as mapgen.heightAt: triangles (a, c, b) and (c, d, b) share the b-c diagonal.
    idxArr.push(a, c, b, c, d, b);
  }
  if (skirtN) {
    // Low-detail chunks hang a 2 m curtain along their borders to hide seams with finer neighbours.
    const ring = [];
    for (let x = 0; x < nx; x++) ring.push([x, 0]);
    for (let z = 1; z < nz; z++) ring.push([nx - 1, z]);
    for (let x = nx - 2; x >= 0; x--) ring.push([x, nz - 1]);
    for (let z = nz - 2; z >= 1; z--) ring.push([0, z]);
    const base = i;
    for (const [x, z] of ring) put(cx0 + x * step, cz0 + z * step, 2.0);
    for (let r = 0; r < ring.length; r++) {
      const r2 = (r + 1) % ring.length;
      const top1 = ring[r][1] * nx + ring[r][0], top2 = ring[r2][1] * nx + ring[r2][0];
      const bot1 = base + r, bot2 = base + r2;
      idxArr.push(top1, bot1, top2, top2, bot1, bot2, top1, top2, bot1, top2, bot2, bot1);
    }
  }
  const idx = new (count > 65535 ? Uint32Array : Uint16Array)(idxArr);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3, true));
  geo.setAttribute('aRock', new THREE.BufferAttribute(rock, 3, true));
  geo.setAttribute('aMaskA', new THREE.BufferAttribute(mA, 4, true));
  geo.setAttribute('aMaskB', new THREE.BufferAttribute(mB, 4, true));
  geo.setAttribute('aMaskC', new THREE.BufferAttribute(mC, 4, true));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

// Skirt beyond the 320 x 320 overworld: mountains west / north / east, seabed south.
function buildSkirt(material) {
  const W = OVERWORLD.w;
  const nr = skirtNoise, nm = skirtNoise;
  const outer = [2, 6, 12, 20, 30, 44, 62, 86, 118, 160, 215, 290, 390, 520];
  const coords = [];
  for (let i = outer.length - 1; i >= 0; i--) coords.push(-outer[i]);
  for (let v = 2; v <= W - 2; v += 4) coords.push(v);
  for (const o of outer) coords.push(W + o);
  const n = coords.length;
  const inside = (x, z) => x >= 0 && x <= W && z >= 0 && z <= W;
  const heightOf = (x, z) => (inside(x, z) ? heightAt(Math.min(W - 0.01, x), Math.min(W - 0.01, z)) - 1.6 : skirtHeight(x, z));
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = coords[i], z = coords[j];
    const k = (j * n + i) * 3;
    pos[k] = x; pos[k + 1] = heightOf(x, z); pos[k + 2] = z;
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const x0 = coords[i], x1 = coords[i + 1], z0 = coords[j], z1 = coords[j + 1];
    if (x0 >= 2 && x1 <= W - 2 && z0 >= 2 && z1 <= W - 2) continue;
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, c, d, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // colours: alpine grass -> rock -> snow, seabed under the sea
  const count = n * n;
  const base = new Uint8Array(count * 3), rock = new Uint8Array(count * 3);
  const mA = new Uint8Array(count * 4), mB = new Uint8Array(count * 4), mC = new Uint8Array(count * 4);
  const nrm = geo.attributes.normal.array;
  for (let v = 0; v < count; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const ny = nrm[v * 3 + 1];
    const t = nm(x * 0.02, z * 0.02) * 0.5 + 0.5;
    let r = 0.46 + 0.08 * t, g = 0.55 + 0.06 * t, b = 0.36;
    const alt = smoothstepJS(20, 60, y);
    r += (0.55 - r) * alt; g += (0.56 - g) * alt; b += (0.50 - b) * alt;
    const sn = smoothstepJS(78, 92, y + 10 * nr(x * 0.03, z * 0.03)) * smoothstepJS(0.5, 0.8, ny) * 0.9;
    r += (0.93 - r) * sn; g += (0.95 - g) * sn; b += (0.97 - b) * sn;
    if (y < 0.2) { const k = smoothstepJS(0.2, -2, y); r += (0.55 - r) * k; g += (0.55 - g) * k; b += (0.46 - b) * k; }
    base[v * 3] = u8(r); base[v * 3 + 1] = u8(g); base[v * 3 + 2] = u8(b);
    const rk = 0.47 + 0.06 * t;
    rock[v * 3] = u8(rk); rock[v * 3 + 1] = u8(rk * 0.97); rock[v * 3 + 2] = u8(rk * 0.94);
    if (y < 0.5) mA[v * 4 + 1] = 255;
    mC[v * 4 + 3] = 255;
  }
  geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3, true));
  geo.setAttribute('aRock', new THREE.BufferAttribute(rock, 3, true));
  geo.setAttribute('aMaskA', new THREE.BufferAttribute(mA, 4, true));
  geo.setAttribute('aMaskB', new THREE.BufferAttribute(mB, 4, true));
  geo.setAttribute('aMaskC', new THREE.BufferAttribute(mC, 4, true));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'terrain:skirt';
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
function smoothstepJS(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------------------------
export function createTerrain(ctx) {
  const meshes = [];
  const regions = {};
  const chunks = [];

  // Overworld (chunked).
  const owMat = makeMaterial(0);
  const G = getRegionGrid('overworld');
  const F = getOverworldFields();
  const ow = new THREE.Group();
  ow.name = 'terrain:overworld';
  for (let cz = 0; cz < G.H; cz += CHUNK) for (let cx = 0; cx < G.W; cx += CHUNK) {
    const x1 = Math.min(G.W, cx + CHUNK), z1 = Math.min(G.H, cz + CHUNK);
    const lods = [1, 2, 4].map((st) => {
      const m = buildPatch(OVERWORLD, G, F, cx, cz, x1, z1, owMat, st);
      m.name = `terrain:overworld:${cx / CHUNK},${cz / CHUNK}:lod${st}`;
      m.visible = st === 1;
      ow.add(m);
      meshes.push(m);
      return m;
    });
    chunks.push({ mesh: lods[0], lods, x0: cx, z0: cz, x1, z1, lod: 0 });
  }
  ctx.scene.add(ow);
  regions.overworld = ow;

  // Dungeons (one mesh each).
  for (const id in DUNGEONS) {
    const D = DUNGEONS[id];
    const DG = getRegionGrid(id);
    const DF = getDungeonFields(id);
    const m = buildPatch(D, DG, DF, 0, 0, DG.W, DG.H, makeMaterial(DUNGEON_KIND[id]));
    m.name = 'terrain:' + id;
    ctx.scene.add(m);
    meshes.push(m);
    regions[id] = m;
    const bb = m.geometry.boundingBox;
    chunks.push({ mesh: m, lods: [m], x0: bb.min.x, z0: bb.min.z, x1: bb.max.x, z1: bb.max.z, lod: 0 });
  }

  // Skirt.
  let skirt = null;
  try {
    skirt = buildSkirt(makeMaterial(0, true));
    ctx.scene.add(skirt);
    meshes.push(skirt);
  } catch (err) { console.warn('[world] terrain skirt skipped', err); }

  const cam = ctx.camera;
  return {
    meshes, regions, skirt, material: owMat, chunkSize: CHUNK, chunks,
    update() {
      // Distance culling past the fog (frustum culling does the rest).
      const far = (ctx.scene.fog?.far || 400) + 24;
      const px = cam.position.x, pz = cam.position.z;
      const lodK = ctx.engine.preset.name === 'high' ? 1.4 : ctx.engine.preset.name === 'low' ? 0.7 : 1;
      for (const c of chunks) {
        const dx = Math.max(c.x0 - px, 0, px - c.x1), dz = Math.max(c.z0 - pz, 0, pz - c.z1);
        const d = Math.hypot(dx, dz, Math.max(0, cam.position.y - 30) * 0.5);
        let lod = d < 70 * lodK ? 0 : d < 170 * lodK ? 1 : 2;
        if (lod >= c.lods.length) lod = c.lods.length - 1;
        const show = d < far;
        for (let k = 0; k < c.lods.length; k++) c.lods[k].visible = show && k === lod;
        c.lod = lod;
      }
      if (skirt) skirt.visible = px > -100 && px < 420;
    },
  };
}
