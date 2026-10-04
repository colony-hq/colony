// Water: sea, Brightwater Lake, Fen Mere, the river and Mistfen bog pools, all at y = 0.
// Owner: world builder.
//
// A mesh is built only where the terrain dips below the surface (2 m cells, chunked for culling)
// plus a coarse outer sea to the horizon. The shader reads two baked 321^2 textures (corner grid):
//   wData: R = bed depth, G = distance to land (shore / pier posts), B = murk (swamp), A = flow speed
//   wFlow: RG = river flow direction (downstream along RIVER.points), B = open-sea factor
// and draws depth-tinted water, sky fresnel, sun glints + sparkle, shoreline foam, foam bands
// rolling in on the sea, flowing ripples / streaks on the river, scummy green swamp water and
// gentle vertex waves. waterDetail 0 (low) uses a cheaper path.
//
// API: mesh (Group), material, textures {data, flow}, update(dt).

import * as THREE from 'three';
import { getRegionGrid } from './mapgen.js';
import { getOverworldFields, W_SEA, W_LAKE, W_SWAMP, W_RIVER } from './w-fields.js';
import { U, GLSL_COMMON } from './w-common.js';

const CELL = 2;
const CHUNK = 64;

const VERT = /* glsl */`
uniform float uTime;
uniform float uWaveAmp;
uniform sampler2D uWData;
varying vec3 vWPos;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vec2 uv = (p.xz + 0.5) / 321.0;
  vec4 d = texture2D(uWData, uv);
  float depth = d.r * 8.0 - 1.0;
  float amp = uWaveAmp * smoothstep(0.3, 2.5, depth) * (1.0 - d.b * 0.85);
  p.y += amp * (sin(p.x * 0.31 + uTime * 1.25) * 0.6 + sin(p.z * 0.27 - uTime * 1.05 + p.x * 0.12) * 0.4);
  vWPos = p;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform float uTime;
uniform sampler2D uWData;
uniform sampler2D uWFlow;
uniform sampler2D uNoise;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uHorizon;
uniform vec3 uAmbient;
uniform float uNight;
varying vec3 vWPos;
#include <common>
#include <fog_pars_fragment>
${GLSL_COMMON}
void main() {
  vec2 p = vWPos.xz;
  vec2 uv = (p + 0.5) / 321.0;
  vec4 d = texture2D(uWData, uv);
  vec4 fl = texture2D(uWFlow, uv);
  float bedH = -(d.r * 8.0 - 1.0);
  float depth = max(vWPos.y - bedH, 0.0);
  float landD = d.g * 12.0;
  float murk = d.b;
  float speed = d.a;
  vec2 fdir = fl.rg * 2.0 - 1.0;
  float sea = fl.b;

  vec2 rip;
#if WATER_DETAIL > 0
  if (speed > 0.02) {
    float ph0 = fract(uTime * 0.2), ph1 = fract(uTime * 0.2 + 0.5);
    float w0 = 1.0 - abs(ph0 * 2.0 - 1.0);
    vec2 v = fdir * speed * 4.0;
    vec2 a = texture2D(uNoise, (p - v * ph0) * 0.15).rg;
    vec2 b = texture2D(uNoise, (p - v * ph1) * 0.15 + 0.5).rg;
    rip = mix(b, a, w0);
  } else {
    vec2 a = texture2D(uNoise, p * 0.1 + uTime * vec2(0.011, 0.007)).rg;
    vec2 b = texture2D(uNoise, p * 0.16 - uTime * vec2(0.008, -0.012)).gr;
    rip = (a + b) * 0.5;
  }
#else
  rip = texture2D(uNoise, p * 0.12 + uTime * vec2(0.01, 0.006) - fdir * speed * uTime * 0.06).rg;
#endif
  float viewD = length(cameraPosition - vWPos);
  float nearK = 1.0 - smoothstep(25.0, 110.0, viewD);
  vec3 n = normalize(vec3((rip.x - 0.5) * (0.12 + 0.38 * nearK), 1.0, (rip.y - 0.5) * (0.12 + 0.38 * nearK)));

  float dk = 1.0 - exp(-depth * 0.55);
  vec3 col = mix(vec3(0.30, 0.74, 0.70), vec3(0.12, 0.47, 0.60), smoothstep(0.0, 0.55, dk));
  col = mix(col, vec3(0.05, 0.22, 0.38), smoothstep(0.55, 1.0, dk));
  vec3 murkC = mix(vec3(0.22, 0.30, 0.20), vec3(0.10, 0.16, 0.12), dk);
  float scum = smoothstep(0.6, 0.75, texture2D(uNoise, p * 0.07 + uTime * vec2(0.0015, 0.001)).r);
  murkC = mix(murkC, vec3(0.36, 0.44, 0.18), scum * 0.45);
  col = mix(col, murkC, murk);
  col = hvLin(col);
  float ndl = max(dot(n, uSunDir), 0.0);
  col *= (uAmbient + uSunColor * ndl * 0.8) * (1.0 / PI) * 1.15;

  vec3 V = normalize(cameraPosition - vWPos);
  float fres = pow(1.0 - max(dot(V, n), 0.0), 4.0);
  vec3 skyRef = mix(uHorizon, uSkyColor, 0.4);
  col = mix(col, skyRef, clamp(fres * 0.8 + 0.05, 0.0, 0.85) * (1.0 - murk * 0.35));

  vec3 Hh = normalize(uSunDir + V);
  float nh = max(dot(n, Hh), 0.0);
  float spec = (pow(nh, 160.0) * 2.2 * (0.25 + 0.75 * nearK) + pow(nh, 22.0) * 0.06);
#if WATER_DETAIL > 0
  spec += step(0.88, texture2D(uNoise, p * 0.75 + uTime * vec2(0.05, 0.03)).a) * pow(nh, 16.0) * 1.4 * (1.0 - smoothstep(15.0, 45.0, viewD));
#endif
  col += uSunColor * spec * (1.0 - murk * 0.75) * 0.45;

  float fn = texture2D(uNoise, p * 0.33 + uTime * vec2(0.02, -0.015)).g;
  float edge = (1.0 - smoothstep(0.0, 0.16 + 0.22 * fn, depth)) * (1.0 - murk * 0.85);
  float postD = fl.a * 4.0;
  float post = (1.0 - smoothstep(0.1, 0.45 + 0.35 * fn, postD)) * step(0.5, depth);
  float lake = step(0.03, murk) * (1.0 - step(0.5, murk));
  float bandK = (1.0 - smoothstep(0.6, 4.5 + 2.0 * sea, landD)) * max(sea, lake * 0.6) * (1.0 - step(0.5, murk));
  float bands = smoothstep(0.8, 0.97, sin(landD * 2.3 - uTime * (1.3 + sea * 0.6) + fn * 3.0)) * bandK * (0.45 + 0.55 * fn) * (1.0 - smoothstep(60.0, 140.0, viewD));
  float streak = 0.0;
#if WATER_DETAIL > 0
  if (speed > 0.05) {
    vec2 fd = normalize(fdir + 1e-4);
    vec2 q = vec2(dot(p, fd), dot(p, vec2(-fd.y, fd.x)));
    streak = smoothstep(0.7, 0.9, texture2D(uNoise, vec2((q.x - uTime * speed * 2.2) * 0.05, q.y * 0.45)).g) * speed * 0.45;
  }
#endif
  float foam = clamp(max(max(edge, post * 0.85), bands) + streak, 0.0, 1.0) * (1.0 - murk * 0.55);
  vec3 foamCol = vec3(0.92, 0.96, 1.0) * (uAmbient + uSunColor * 0.75) * (1.0 / PI) * 1.2;
  col = mix(col, foamCol, foam * 0.88);

  float alpha = mix(0.38, 0.92, smoothstep(0.0, 2.6, depth));
  alpha = mix(alpha, 0.86, murk * 0.85);
  alpha = max(alpha, foam * 0.95);
  alpha *= smoothstep(-0.02, 0.04, depth);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function bakeTextures() {
  const F = getOverworldFields();
  const N = F.N;
  const data = new Uint8Array(N * N * 4), flow = new Uint8Array(N * N * 4);
  for (let v = 0; v < N * N; v++) {
    const h = F.heights[v];
    const depth = Math.max(-1, Math.min(7, -h));
    data[v * 4] = Math.round(((depth + 1) / 8) * 255);
    data[v * 4 + 1] = Math.round(Math.min(1, (h < 0 ? F.landDist[v] : 0) / 12) * 255);
    const t = F.wtype[v];
    data[v * 4 + 2] = t === W_SWAMP ? 255 : t === W_LAKE ? 20 : 0;
    data[v * 4 + 3] = Math.round(Math.min(1, F.flowSpeed[v]) * 255);
    flow[v * 4] = Math.round((0.5 + 0.5 * F.flowX[v]) * 255);
    flow[v * 4 + 1] = Math.round((0.5 + 0.5 * F.flowZ[v]) * 255);
    flow[v * 4 + 2] = t === W_SEA ? 255 : 0;
    flow[v * 4 + 3] = Math.round(Math.min(1, F.postDist[v] / 4) * 255);
  }
  const mk = (arr) => {
    const tex = new THREE.DataTexture(arr, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  return { data: mk(data), flow: mk(flow) };
}

function buildInner(material) {
  const G = getRegionGrid('overworld');
  const N = G.N, H = G.heights;
  const meshes = [];
  const B = G.W / CELL;
  for (let c0z = 0; c0z < B; c0z += CHUNK / CELL) for (let c0x = 0; c0x < B; c0x += CHUNK / CELL) {
    const vmap = new Map();
    const pos = [];
    const idx = [];
    const vert = (gx, gz) => {
      const key = gx * 1000 + gz;
      let i = vmap.get(key);
      if (i === undefined) { i = pos.length / 3; vmap.set(key, i); pos.push(gx * CELL, 0, gz * CELL); }
      return i;
    };
    for (let bz = c0z; bz < Math.min(B, c0z + CHUNK / CELL); bz++) for (let bx = c0x; bx < Math.min(B, c0x + CHUNK / CELL); bx++) {
      let mn = Infinity;
      for (let dz = 0; dz <= CELL; dz++) for (let dx = 0; dx <= CELL; dx++) {
        const x = bx * CELL + dx, z = bz * CELL + dz;
        mn = Math.min(mn, H[Math.min(N - 1, z) * N + Math.min(N - 1, x)]);
      }
      if (mn > 0.35) continue;
      const a = vert(bx, bz), b = vert(bx + 1, bz), c = vert(bx, bz + 1), d = vert(bx + 1, bz + 1);
      idx.push(a, c, b, c, d, b);
    }
    if (!idx.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += 1;
    const m = new THREE.Mesh(geo, material);
    m.name = 'water:chunk';
    m.renderOrder = 2;
    meshes.push(m);
  }
  return meshes;
}

function buildOuter(material) {
  // Coarse sea from the coast to the horizon (south, south-west, south-east).
  const pos = [], idx = [];
  const xs = [-900, -600, -400, -260, -160, -80, -40, -16, 0, 40, 80, 120, 160, 200, 240, 280, 320, 336, 360, 400, 480, 580, 720, 900, 1220];
  const zs = [262, 290, 320, 336, 360, 400, 480, 600, 800, 1100, 1500];
  for (const z of zs) for (const x of xs) pos.push(x, 0, z);
  const nx = xs.length;
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j];
    if (x0 >= 0 && x1 <= 320 && z0 < 320) continue; // inside the overworld: the inner mesh covers it
    if (z0 < 290 && x0 >= -40 && x1 <= 360) continue;
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, c, d, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, material);
  m.name = 'water:outer';
  m.renderOrder = 1;
  return m;
}

export function createWater(ctx) {
  const { engine } = ctx;
  const textures = bakeTextures();
  const detail = () => (engine.preset.waterDetail ?? 1);
  const uniforms = {
    uTime: U.uTime, uNoise: U.uNoise, uSunDir: U.uSunDir, uSunColor: U.uSunColor, uSkyColor: U.uSkyColor,
    uHorizon: U.uHorizon, uAmbient: U.uAmbient, uNight: U.uNight,
    uWData: { value: textures.data }, uWFlow: { value: textures.flow }, uWaveAmp: { value: 0.06 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: true,
    fog: true,
    defines: { WATER_DETAIL: detail() },
  });
  Object.assign(material.uniforms, uniforms); // share the live uniform objects
  let curDetail = detail();

  const group = new THREE.Group();
  group.name = 'water';
  for (const m of buildInner(material)) group.add(m);
  group.add(buildOuter(material));
  ctx.scene.add(group);

  return {
    mesh: group, material, textures,
    update() {
      const dl = detail();
      if (dl !== curDetail) { curDetail = dl; material.defines.WATER_DETAIL = dl; material.needsUpdate = true; }
      uniforms.uWaveAmp.value = dl > 0 ? 0.07 : 0.0;
      group.visible = !ctx.sky?.inDungeon;
    },
  };
}
