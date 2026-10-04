// Low drifting kabut mist: large noise-shaded billboards that wrap around the player in a
// toroidal domain and drift with the wind (owner: landscape). One draw call, all placement on
// the GPU. Each puff fades with the local kabut density (same layer + pocket map as fog.js),
// inside clearings, near the camera, toward the domain edge, and softly where it meets the
// ground (heightmap lookup), so there are no hard intersection lines.

import * as THREE from 'three';
import { FOG_GLSL } from './fog.js';
import { LAND_GLSL, getHeightTexture, FOG_MAP_GLSL_SCALE } from './land-maps.js';
import { mulberry32 } from '../core/noise.js';

// Built lazily: fog.js and this module import each other.
const vert = () => /* glsl */ `
${FOG_GLSL.parsVertex}
${LAND_GLSL.height}
uniform vec3 uMistOrigin;
uniform float uMistDomain;
uniform float uMistAlpha;
uniform vec4 uFogClear[${8}];
uniform float uFogAmount;
uniform float uFogBase;
uniform float uFogFalloff;
uniform float uFogTime;
uniform vec2 uFogWind;
uniform sampler2D uFogMap;
attribute vec2 corner;
attribute vec4 seed;
varying vec2 vCorner;
varying float vAlpha;
varying vec4 vSeed;

void main() {
  float S = uMistDomain;
  vec2 drift = uFogWind * uFogTime * (0.75 + 0.6 * seed.w);
  vec2 rel = mod(seed.xy * S + drift - uMistOrigin.xz + 0.5 * S, S) - 0.5 * S;
  vec2 c = uMistOrigin.xz + rel;
  float edge = 1.0 - smoothstep(0.41 * S, 0.49 * S, max(abs(rel.x), abs(rel.y)));
  float ground = max(landHeight(c), 0.0);
  float w = mix(10.0, 22.0, seed.z);
  float h = w * mix(0.28, 0.42, fract(seed.w * 7.31));
  float cy = ground + h * 0.2 + mix(-0.4, 1.6, seed.w);
  vec4 fm = texture2D(uFogMap, c * ${FOG_MAP_GLSL_SCALE} + 0.5);
  float dens = fm.g / (1.0 + exp(uFogFalloff / (1.0 + fm.r * 0.045) * (cy + h * 0.25 - uFogBase - fm.r)));
  float cover = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 cl = uFogClear[i];
    if (cl.z <= 0.0) continue;
    float d = length(c - cl.xy);
    cover = max(cover, cl.w * (1.0 - smoothstep(cl.z * 0.72, cl.z * 1.08, d)));
  }
  vec3 toCam = cameraPosition - vec3(c.x, cy, c.y);
  float camD = length(toCam.xz);
  float near = smoothstep(7.0, 15.0, camD) * (1.0 - smoothstep(40.0, 56.0, camD));
  float a = uMistAlpha * uFogAmount * edge * clamp(dens, 0.0, 1.0) * (1.0 - cover) * near;
  vAlpha = a;
  vCorner = corner;
  vSeed = seed;
  if (a < 0.003) {
    vLenteraWorld = vec3(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume: no fragments
    return;
  }
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), camUp, 0.45));
  vec3 wp = vec3(c.x, cy, c.y) + camRight * corner.x * w * 0.5 + up * corner.y * h * 0.5;
  vLenteraWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const frag = () => /* glsl */ `
${FOG_GLSL.parsFragment}
${LAND_GLSL.height}
varying vec2 vCorner;
varying float vAlpha;
varying vec4 vSeed;

void main() {
  vec2 q = vCorner;
  float r = length(vec2(q.x, q.y > 0.0 ? q.y * 1.05 : q.y * 1.7));
  float m = 1.0 - smoothstep(0.3, 1.0, r);
  vec2 uv = q * vec2(1.0, 0.42) + vSeed.xy * 13.0;
  float t = uFogTime;
  float n1 = texture2D(uFogNoise, uv * 0.42 + vec2(t * 0.011, t * 0.004)).g;
  float n2 = texture2D(uFogNoise, uv * 1.2 + vec2(-t * 0.017, t * 0.009)).b;
  float n = n1 * 0.62 + n2 * 0.38;
  float wisp = smoothstep(0.22, 0.86, n * (0.55 + 0.6 * m) + m * 0.24);
  float ground = max(landHeight(vLenteraWorld.xz), 0.0);
  float soft = smoothstep(0.0, 2.6, vLenteraWorld.y - ground);
  float a = vAlpha * m * wisp * soft;
  if (a < 0.002) discard;
  vec3 v = normalize(vLenteraWorld - cameraPosition);
  vec3 col = lenteraKabutColor(v, 0.55 + 0.45 * n) * 1.14;
  float ld = length(vLenteraWorld - uFogLanternPos);
  col += uFogLanternColor * uFogLanternGlow * uFogLanternLive * 0.5 * exp(-ld / (0.55 * uFogLanternRadius + 2.0));
  float fh = lenteraHaze(length(vLenteraWorld - cameraPosition));
  col = mix(col, lenteraHazeColor(v), fh);
  gl_FragColor = vec4(col, a);
}
`;

export function createMist(ctx, fogUniforms) {
  const preset = ctx.engine?.preset || { particles: 0.7 };
  // low 10, medium 17, high 24 (overdraw is the cost, not vertices)
  const count = Math.round(Math.min(24, Math.max(10, 23.3 * (preset.particles ?? 0.7) + 0.7)));
  const rand = mulberry32(90210);
  const corners = new Float32Array(count * 8);
  const seeds = new Float32Array(count * 16);
  const index = [];
  const C = [-1, -1, 1, -1, 1, 1, -1, 1];
  for (let i = 0; i < count; i++) {
    const s = [rand(), rand(), rand(), rand()];
    for (let v = 0; v < 4; v++) {
      corners[(i * 4 + v) * 2] = C[v * 2];
      corners[(i * 4 + v) * 2 + 1] = C[v * 2 + 1];
      seeds.set(s, (i * 4 + v) * 4);
    }
    const b = i * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geo = new THREE.BufferGeometry();
  // `position` is required by three; the vertex shader places everything itself.
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 12), 3));
  geo.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  geo.setIndex(index);

  const uniforms = {
    ...fogUniforms,
    uLandHeight: { value: getHeightTexture() },
    uMistOrigin: { value: new THREE.Vector3() },
    uMistDomain: { value: 80 },
    uMistAlpha: { value: 0.6 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert(),
    fragmentShader: frag(),
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  material.userData.lenteraFog = true; // fog handled in-shader

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'kabut-mist';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.castShadow = mesh.receiveShadow = false;
  ctx.scene.add(mesh);

  return {
    mesh,
    uniforms,
    count,
    update() {
      const p = ctx.player?.position || ctx.camera.position;
      uniforms.uMistOrigin.value.set(p.x, p.y, p.z);
    },
  };
}
