// Instanced shader effects shared by the prop modules: flames, glow halos (always / night-only),
// water ripples for fishing spots, chimney smoke. Each effect is ONE InstancedMesh (one draw
// call) no matter how many emitters exist. Owner: props builder.

import * as THREE from 'three';
import { Pool } from './kit.js';

const NOISE = `
float hvHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hvNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hvHash(i), hvHash(i + vec2(1.0, 0.0)), f.x), mix(hvHash(i + vec2(0.0, 1.0)), hvHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

const FOG_V = `
varying float vFogDepth;`;
const FOG_F = `
varying float vFogDepth;
#ifdef USE_FOG
uniform vec3 fogColor;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear;
uniform float fogFar;
#endif
#endif
float hvFog() {
#ifdef USE_FOG
#ifdef FOG_EXP2
  return 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
#else
  return smoothstep(fogNear, fogFar, vFogDepth);
#endif
#else
  return 0.0;
#endif
}`;

// Billboard helpers (instance translation + uniform scale from instanceMatrix).
const BILLBOARD = `
vec3 hvCenter() { return (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; }
float hvScale() { return length(instanceMatrix[0].xyz); }
vec3 hvCamRight() { return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
vec3 hvCamUp() { return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }`;

function fxMaterial({ vertex, fragment, uniforms = {}, blending = THREE.AdditiveBlending, name }) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]),
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending,
    fog: true,
  });
  m.name = name;
  return m;
}

export function createFx(ctx, kit) {
  const group = new THREE.Group();
  group.name = 'props-fx';
  ctx.scene.add(group);
  const U = kit.U;

  // ---------------------------------------------------------------- flames (cylindrical billboard)
  const flameGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
  flameGeo.translate(0, 0.5, 0);
  const flameMat = fxMaterial({
    name: 'fx-flame',
    uniforms: { uTime: { value: 0 } },
    vertex: `${BILLBOARD}${FOG_V}
uniform float uTime;
varying vec2 vUv;
varying float vPhase;
varying float vHeat;
void main() {
  vec3 c = hvCenter();
  float s = hvScale();
  float sy = length(instanceMatrix[1].xyz);
  vec3 r = normalize(vec3(hvCamRight().x, 0.0, hvCamRight().z));
  vec3 w = c + r * position.x * s + vec3(0.0, position.y * sy, 0.0);
  vUv = uv;
  vPhase = fract(sin(dot(c.xz, vec2(12.9898, 78.233))) * 43758.5453) * 10.0;
  #ifdef USE_INSTANCING_COLOR
  vHeat = instanceColor.r;
  #else
  vHeat = 1.0;
  #endif
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
    fragment: `${NOISE}${FOG_F}
uniform float uTime;
varying vec2 vUv;
varying float vPhase;
varying float vHeat;
void main() {
  vec2 uv = vUv;
  float t = uTime + vPhase;
  float n = hvNoise(vec2(uv.x * 4.0, uv.y * 3.0 - t * 3.2)) * 0.65 + hvNoise(vec2(uv.x * 9.0 + 3.0, uv.y * 7.0 - t * 5.5)) * 0.35;
  float w = (1.0 - uv.y) * 0.42 + 0.04;
  float dx = abs(uv.x - 0.5 + (n - 0.5) * 0.3 * uv.y);
  float body = smoothstep(w, w * 0.25, dx) * smoothstep(0.95, 0.2, uv.y + (n - 0.5) * 0.45) * smoothstep(0.0, 0.1, uv.y);
  // a few sparks above the flame
  vec2 sp = vec2(uv.x * 6.0, uv.y * 5.0 - t * 1.6);
  float spark = step(0.985, hvHash(floor(sp))) * smoothstep(0.35, 0.15, length(fract(sp) - 0.5)) * smoothstep(0.3, 0.7, uv.y) * (1.0 - uv.y);
  vec3 col = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.72, 0.25), smoothstep(0.15, 0.75, body));
  col = mix(col, vec3(1.0, 0.97, 0.75), smoothstep(0.8, 1.0, body) * (1.0 - uv.y));
  float a = clamp(body + spark * 0.8, 0.0, 1.0) * vHeat * (1.0 - hvFog());
  gl_FragColor = vec4(col * 2.2, a);
}`,
  });
  flameMat.uniforms.uTime = U.uTime;
  const flames = new Pool(group, flameGeo, flameMat, { capacity: 32, castShadow: false, receiveShadow: false, name: 'fx-flames' });
  flames.mesh.frustumCulled = false;
  kit.pools.add(flames);

  // ---------------------------------------------------------------- glow halos (spherical billboard)
  const quad = new THREE.PlaneGeometry(1, 1);
  function glowMaterial(nightOnly) {
    const m = fxMaterial({
      name: nightOnly ? 'fx-glow-night' : 'fx-glow',
      uniforms: { uNight: { value: 0 }, uTime: { value: 0 } },
      vertex: `${BILLBOARD}${FOG_V}
varying vec2 vUv;
varying vec3 vCol;
uniform float uTime;
void main() {
  vec3 c = hvCenter();
  float s = hvScale();
  float fl = 1.0 + 0.06 * sin(uTime * 7.0 + c.x * 3.1) * sin(uTime * 3.3 + c.z);
  vec3 w = c + (hvCamRight() * position.x + hvCamUp() * position.y) * s * fl;
  vUv = uv;
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #else
  vCol = vec3(1.0);
  #endif
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
      fragment: `${FOG_F}
uniform float uNight;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.2);
  float k = ${nightOnly ? 'uNight' : '1.0'};
  gl_FragColor = vec4(vCol * a * k * (1.0 - hvFog()), 1.0);
}`,
    });
    m.uniforms.uNight = U.uNight;
    m.uniforms.uTime = U.uTime;
    return m;
  }
  const glow = new Pool(group, quad, glowMaterial(false), { capacity: 64, castShadow: false, receiveShadow: false, name: 'fx-glow' });
  const glowNight = new Pool(group, quad, glowMaterial(true), { capacity: 128, castShadow: false, receiveShadow: false, name: 'fx-glow-night' });
  kit.pools.add(glow); kit.pools.add(glowNight);
  glow.mesh.renderOrder = 5; glowNight.mesh.renderOrder = 5;

  // ---------------------------------------------------------------- ripples (flat on water, y = 0)
  const rippleGeo = new THREE.PlaneGeometry(1, 1);
  rippleGeo.rotateX(-Math.PI / 2);
  const rippleMat = fxMaterial({
    name: 'fx-ripple',
    blending: THREE.NormalBlending,
    uniforms: { uTime: { value: 0 } },
    vertex: `${FOG_V}
varying vec2 vUv;
varying float vKind;
varying float vPhase;
void main() {
  vUv = uv;
  #ifdef USE_INSTANCING_COLOR
  vKind = instanceColor.r;
  #else
  vKind = 0.0;
  #endif
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vPhase = fract(sin(dot(wp.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.0;
  vec4 mv = viewMatrix * wp;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
    fragment: `${NOISE}${FOG_F}
uniform float uTime;
varying vec2 vUv;
varying float vKind;
varying float vPhase;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float t = uTime + vPhase;
  float a = 0.0;
  float sea = step(0.75, vKind), river = step(0.25, vKind) * (1.0 - sea);
  float speed = mix(0.45, 0.75, river) * mix(1.0, 0.7, sea);
  for (int i = 0; i < 3; i++) {
    float k = fract(t * speed + float(i) / 3.0);
    vec2 q = p;
    q.y *= mix(1.0, 1.6, river);
    float r = length(q + vec2(sin(t + float(i) * 2.1), cos(t * 0.7 + float(i))) * 0.12);
    float rr = k * 0.88;
    a += smoothstep(0.07, 0.0, abs(r - rr)) * (1.0 - k) * 0.9;
  }
  // glints / bubbles
  vec2 g = vUv * mix(7.0, 11.0, sea);
  float b = step(mix(0.93, 0.86, sea), hvHash(floor(g + vec2(0.0, floor(t * 2.0)))));
  a += b * smoothstep(0.45, 0.1, length(fract(g) - 0.5)) * 0.8 * (1.0 - smoothstep(0.6, 1.0, length(p)));
  // foam streaks for river spots
  a += river * smoothstep(0.55, 0.9, hvNoise(vec2(p.x * 3.0, p.y * 1.2 - t * 2.0))) * 0.5 * (1.0 - length(p));
  a *= 1.0 - smoothstep(0.75, 1.0, length(p));
  vec3 col = mix(vec3(0.92, 0.98, 1.0), vec3(0.8, 0.95, 1.0), sea);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * 0.75 * (1.0 - hvFog()));
}`,
  });
  rippleMat.uniforms.uTime = U.uTime;
  rippleMat.polygonOffset = true; rippleMat.polygonOffsetFactor = -2; rippleMat.polygonOffsetUnits = -2;
  const ripples = new Pool(group, rippleGeo, rippleMat, { capacity: 32, castShadow: false, receiveShadow: false, name: 'fx-ripples' });
  ripples.mesh.renderOrder = 2;
  kit.pools.add(ripples);

  // ---------------------------------------------------------------- smoke puffs (chimneys)
  const smokeMat = fxMaterial({
    name: 'fx-smoke',
    blending: THREE.NormalBlending,
    uniforms: { uTime: { value: 0 } },
    vertex: `${BILLBOARD}${FOG_V}
uniform float uTime;
varying vec2 vUv;
varying float vA;
void main() {
  vec3 c = hvCenter();
  float seed = instanceMatrix[3].w;
  #ifdef USE_INSTANCING_COLOR
  float ph = instanceColor.r;
  #else
  float ph = 0.0;
  #endif
  float life = fract(uTime * 0.11 + ph);
  float s = hvScale() * (0.45 + life * 1.8);
  c += vec3(life * 2.2 + sin(uTime * 0.7 + ph * 9.0) * 0.25, life * 5.5, life * 0.9);
  vec3 w = c + (hvCamRight() * position.x + hvCamUp() * position.y) * s;
  vUv = uv;
  vA = sin(life * 3.14159) * (1.0 - life) * 0.55;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
    fragment: `${NOISE}${FOG_F}
varying vec2 vUv;
varying float vA;
void main() {
  vec2 p = vUv - 0.5;
  float d = length(p) * 2.0;
  float n = hvNoise(vUv * 5.0 + vA * 3.0);
  float a = smoothstep(1.0, 0.3, d + (n - 0.5) * 0.4) * vA;
  gl_FragColor = vec4(vec3(0.78, 0.76, 0.74), a * (1.0 - hvFog()));
}`,
  });
  smokeMat.uniforms.uTime = U.uTime;
  const smoke = new Pool(group, quad, smokeMat, { capacity: 64, castShadow: false, receiveShadow: false, name: 'fx-smoke' });
  smoke.mesh.frustumCulled = false;
  kit.pools.add(smoke);

  const tmp = new THREE.Matrix4();
  const particles = ctx.engine?.preset?.particles ?? 1;
  const fx = {
    group,
    pools: { flames, glow, glowNight, ripples, smoke },
    // Flame at (x, y, z) of width w and height h. heat 0..1 (instance colour r).
    flame(x, y, z, w = 0.8, h = 1.2, heat = 1) {
      tmp.makeScale(w, h, w).setPosition(x, y, z);
      return { pool: flames, slot: flames.add(tmp, [heat, 1, 1]) };
    },
    halo(x, y, z, size, color, nightOnly = false) {
      const p = nightOnly ? glowNight : glow;
      tmp.makeScale(size, size, size).setPosition(x, y, z);
      return { pool: p, slot: p.add(tmp, color) };
    },
    ripple(x, z, size, kind = 0) {
      tmp.makeScale(size, 1, size).setPosition(x, 0.04, z);
      return { pool: ripples, slot: ripples.add(tmp, [kind, 1, 1]) };
    },
    // A column of n smoke puffs (phases spread) rising from (x, y, z).
    smoke(x, y, z, n = 5, size = 0.9) {
      if (particles < 0.5) return [];
      const out = [];
      for (let i = 0; i < n; i++) {
        tmp.makeScale(size, size, size).setPosition(x, y, z);
        out.push({ pool: smoke, slot: smoke.add(tmp, [i / n + Math.random() * 0.05, 1, 1]) });
      }
      return out;
    },
    set(h, x, y, z, sx, sy = sx) {
      tmp.makeScale(sx, sy, sx).setPosition(x, y, z);
      h.pool.setMatrix(h.slot, tmp);
    },
    show(h, v) { h.pool.setVisible(h.slot, v); },
    remove(h) { h.pool.remove(h.slot); },
    color(h, c) { h.pool.setColor(h.slot, c); },
  };
  return fx;
}

let FX = null;
export function getFx(ctx, kit) {
  if (!FX) FX = createFx(ctx, kit);
  return FX;
}
