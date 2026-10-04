// Kabut: a layered, ray-integrated height fog with clearings (lantern bubble, lit campfires,
// finale), drifting density noise, warm lantern in-scattering and cool distance haze.
// Owner: landscape. Public API is fixed by DESIGN.md §Fog — keep it stable.
//
// Built-in materials get the fog by patchMaterial(material) (idempotent, chains onBeforeCompile).
// Custom ShaderMaterials include FOG_GLSL.parsVertex / parsFragment / vertex / apply and merge
// fogUniforms into their uniforms. GLSL entry points (stable):
//   vec2 lenteraFog(vec3 worldPos)                  -> (fog factor 0..1, lantern glow)
//   vec3 lenteraFogColor(vec3 worldPos, vec2 fg)    -> colour to mix toward with fg.x
//   vec3 lenteraApplyFog(vec3 color, vec3 worldPos) -> fully fogged colour (preferred)
//   vec4 lenteraSkyFog(vec3 dir)                    -> (kabut, 0, glow, tint) for infinite rays (sky)
//
// Model
// - Density profile (per metre): uFogDensity * mul / (1 + exp(k * (y - base))) — a logistic layer:
//   saturated below `base`, exponential tail above (k = uFogFalloff, softened inside pockets).
//   base = uFogBase + raise(x,z) where raise/mul come from the pocket map (land-maps.js,
//   LANDMARKS.fogPockets). The integral along a ray is analytic (softplus); raise/mul are
//   interpolated from camera to target, the target's raise fading with distance so far pockets
//   do not thicken the whole line of sight.
// - Clearings are vertical columns; the fog inside them is subtracted exactly (overlaps handled
//   against the largest one).
// - fogAmount(x,y,z) on the CPU uses the same profile and map, so spirits spawn where it shows.

import * as THREE from 'three';
import { clamp, smoothstep, damp } from '../core/math.js';
import { getFogMap, getNoiseTexture, sampleFogMap, FOG_MAP_GLSL_SCALE } from './land-maps.js';
import { createMist } from './fog-mist.js';

export const MAX_CLEARINGS = 8;

// Shared uniform objects: every patched material references these same objects.
const uniforms = {
  uFogColor: { value: new THREE.Color(0x9a8db5) }, // kabut body colour (sky.js drives it)
  uFogSunColor: { value: new THREE.Color(0xffa070) }, // sun/moon in-scatter colour (sky.js)
  uFogSunDir: { value: new THREE.Vector3(-0.92, 0.07, -0.38).normalize() }, // towards sun/moon (sky.js)
  uFogHorizon: { value: new THREE.Color(0xd9a08f) }, // distance haze = sky horizon colour (sky.js)
  uFogLanternColor: { value: new THREE.Color(0xffa040) },
  uFogLanternPos: { value: new THREE.Vector3() },
  uFogLanternGlow: { value: 1 }, // in-scatter strength of the lantern (intro/finale may animate)
  uFogLanternRadius: { value: 16 },
  uFogAmount: { value: 1 }, // 0 = kabut gone (finale), 1 = full
  uFogDensity: { value: 0.046 }, // kabut extinction per metre deep inside the layer
  uFogBase: { value: 8.5 }, // height of the layer's half-density level (before pockets)
  uFogFalloff: { value: 0.24 }, // 1/m sharpness of the layer top
  uFogHaze: { value: 0.0011 }, // always-on atmospheric distance haze
  uFogTime: { value: 0 },
  uFogClear: { value: Array.from({ length: MAX_CLEARINGS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uFogCamMatrix: { value: new THREE.Matrix4() },
  uFogCam: { value: new THREE.Vector2(0, 1) }, // pocket map at the camera: (raise, mul)
  uFogWind: { value: new THREE.Vector2(0.55, -0.32) }, // drift of the density noise (m/s)
  uFogNoiseAmt: { value: 0.5 }, // 0..1 strength of the drifting density variation
  uFogMap: { value: getFogMap() },
  uFogNoise: { value: getNoiseTexture() },
};

const PARS_VERTEX = /* glsl */ `
uniform mat4 uFogCamMatrix;
varying vec3 vLenteraWorld;
`;

// Requires: vLenteraWorld (world position) and cameraPosition.
const PARS_FRAGMENT = /* glsl */ `
#define LENTERA_MAX_CLEAR ${MAX_CLEARINGS}
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec3 uFogSunDir;
uniform vec3 uFogHorizon;
uniform vec3 uFogLanternColor;
uniform vec3 uFogLanternPos;
uniform float uFogLanternGlow;
uniform float uFogLanternRadius;
uniform float uFogAmount;
uniform float uFogDensity;
uniform float uFogBase;
uniform float uFogFalloff;
uniform float uFogHaze;
uniform float uFogTime;
uniform vec4 uFogClear[LENTERA_MAX_CLEAR];
uniform vec2 uFogCam;
uniform vec2 uFogWind;
uniform float uFogNoiseAmt;
uniform sampler2D uFogMap;
uniform sampler2D uFogNoise;
varying vec3 vLenteraWorld;

float lenteraSoftplus(float x) { return max(x, 0.0) + log(1.0 + exp(-abs(x))); }

// Mean of the logistic profile 1/(1+e^u) while u runs linearly from ua to ub.
float lenteraMeanDens(float ua, float ub) {
  float du = ub - ua;
  if (abs(du) < 0.02) return 1.0 / (1.0 + exp(0.5 * (ua + ub)));
  return (lenteraSoftplus(-ua) - lenteraSoftplus(-ub)) / du;
}

// o/d/L: ray; C/T: (raise, mul) of the pocket map at camera/target (linear along the ray).
struct LenteraRay { vec3 o; vec3 d; float L; vec2 C; vec2 T; };

// Optical depth (without uFogDensity) of the ray segment [ta, tb]. The layer top softens where
// pockets raise it (k / (1 + raise * 0.045)), evaluated per end point.
float lenteraSegOD(LenteraRay r, float ta, float tb) {
  if (tb <= ta) return 0.0;
  float il = 1.0 / max(r.L, 1e-3);
  vec2 A = mix(r.C, r.T, ta * il);
  vec2 B = mix(r.C, r.T, tb * il);
  float ua = uFogFalloff * (r.o.y + r.d.y * ta - uFogBase - A.x) / (1.0 + A.x * 0.045);
  float ub = uFogFalloff * (r.o.y + r.d.y * tb - uFogBase - B.x) / (1.0 + B.x * 0.045);
  return (tb - ta) * 0.5 * (A.y + B.y) * lenteraMeanDens(ua, ub);
}

// Ray interval inside the vertical clearing column (c.xy centre, c.z radius).
vec2 lenteraColumn(LenteraRay r, vec4 c) {
  vec2 f = r.o.xz - c.xy;
  vec2 d = r.d.xz;
  float a = dot(d, d);
  float cc = dot(f, f) - c.z * c.z;
  if (a < 1e-6) return cc < 0.0 ? vec2(0.0, r.L) : vec2(0.0);
  float b = dot(f, d);
  float disc = b * b - a * cc;
  if (disc <= 0.0) return vec2(0.0);
  float s = sqrt(disc);
  return clamp(vec2(-b - s, -b + s) / a, 0.0, r.L);
}

// Returns vec4(kabut 0..1, lantern glow, start of the fogged part, height tint 0..1).
vec4 lenteraKabut(LenteraRay r, bool infinite) {
  // Clearings (vertical columns). Those containing the camera are nested at t = 0: only the
  // longest matters (the fog is integrated from where it ends). Clearings further along the
  // ray are subtracted on their own.
  float E0 = 0.0, w0 = 0.0, ahead = 0.0;
  for (int i = 0; i < LENTERA_MAX_CLEAR; i++) {
    vec4 c = uFogClear[i];
    if (c.z <= 0.0 || c.w <= 0.0) continue;
    vec2 v = lenteraColumn(r, c);
    if (v.y <= v.x) continue;
    if (v.x <= 0.01) {
      if (v.y * c.w > E0 * w0) { E0 = v.y; w0 = c.w; }
    } else {
      ahead += c.w * lenteraSegOD(r, max(v.x, E0), v.y);
    }
  }
  float od;
  if (infinite) {
    float kc = uFogFalloff / (1.0 + r.C.x * 0.045);
    float u0 = kc * (r.o.y + r.d.y * E0 - uFogBase - r.C.x);
    od = r.d.y > 0.0015 ? r.C.y * lenteraSoftplus(-u0) / (kc * r.d.y) : 1e4;
  } else {
    od = lenteraSegOD(r, E0, r.L);
  }
  if (w0 < 0.999) od += (1.0 - w0) * lenteraSegOD(r, 0.0, E0);
  od = max(od - ahead, 0.0);
  float tS = E0 * step(0.5, w0);
  // Drifting density variation sampled at two depths beyond the clear zone (parallaxes like a volume).
  vec3 pA = r.o + r.d * min(r.L, tS + 7.0);
  vec3 pB = r.o + r.d * min(r.L, tS + 26.0);
  vec2 w = uFogWind * uFogTime;
  float nA, nB;
  if (infinite) {
    // Sky: project the view direction onto a dome so upward rays do not smear into streaks.
    vec2 q = r.d.xz / (abs(r.d.y) + 0.3);
    nA = texture2D(uFogNoise, q * 0.42 + r.o.xz * 0.019 - w * 0.019).g;
    nB = texture2D(uFogNoise, q * 0.17 + r.o.xz * 0.0072 - w * 0.004).r;
  } else {
    nA = texture2D(uFogNoise, (pA.xz + vec2(pA.y, -pA.y) * 0.3 - w) * 0.019).g;
    nB = texture2D(uFogNoise, (pB.xz + vec2(-pB.y, pB.y) * 0.25 - w * 0.55) * 0.0072).r;
  }
  float nm = mix(nA, nB, 0.45);
  od *= max(1.0 + uFogNoiseAmt * (nm * 2.0 - 1.0) * 1.3, 0.15);
  float k = (1.0 - exp(-uFogDensity * od)) * uFogAmount;
  // Warm single scattering from the lantern: closed-form integral of R^4 / (R^2 + d^2)^2 along
  // the fogged part of the ray (a halo of ~R around the lantern that dies off quickly).
  float glow = 0.0;
  vec3 lp = uFogLanternPos - r.o;
  float tc = dot(lp, r.d);
  float h2 = max(dot(lp, lp) - tc * tc, 0.0);
  float R = 0.42 * uFogLanternRadius + 2.0;
  if (h2 < 36.0 * R * R && uFogLanternGlow > 0.0) {
    float H2 = R * R + h2;
    float H = sqrt(H2);
    float ta = tS - tc, tb = r.L - tc;
    float Fa = ta / (2.0 * H2 * (H2 + ta * ta)) + atan(ta / H) / (2.0 * H2 * H);
    float Fb = tb / (2.0 * H2 * (H2 + tb * tb)) + atan(tb / H) / (2.0 * H2 * H);
    float S = R * R * R * R * max(Fb - Fa, 0.0);
    float dl = 1.0 / (1.0 + exp(uFogFalloff * (uFogLanternPos.y - uFogBase - uFogCam.x)));
    glow = 0.68 * uFogLanternGlow * uFogAmount * (1.0 - exp(-uFogDensity * dl * S * 2.6)) * (0.6 + 0.8 * nA);
  }
  float hl = smoothstep(-10.0, 9.0, pB.y - uFogBase - uFogCam.x) * (0.75 + 0.5 * nB);
  return vec4(k, glow, tS, clamp(hl, 0.0, 1.0));
}

float lenteraHaze(float L) { float x = L * uFogHaze; return 1.0 - exp(-x * sqrt(x)); }

// vec4(kabut, haze, lantern glow, height tint)
vec4 lenteraFogData(vec3 wp) {
  LenteraRay r;
  vec3 dv = wp - cameraPosition;
  r.o = cameraPosition;
  r.L = length(dv);
  r.d = dv / max(r.L, 1e-4);
  r.C = uFogCam;
  r.T = texture2D(uFogMap, wp.xz * ${FOG_MAP_GLSL_SCALE} + 0.5).rg;
  // A far pocket should not thicken the whole line of sight: fade its raise with distance.
  r.T.x *= 1.0 - 0.65 * smoothstep(60.0, 220.0, r.L);
  vec4 k = uFogAmount > 0.0 ? lenteraKabut(r, false) : vec4(0.0, 0.0, 0.0, 0.5);
  return vec4(k.x, lenteraHaze(r.L), k.y, k.w);
}

vec3 lenteraHazeColor(vec3 v) {
  float s = max(dot(v, uFogSunDir), 0.0);
  float s2 = s * s, s4 = s2 * s2;
  return uFogHorizon + uFogSunColor * (s4 * s4 * s2 * 0.5 + s2 * 0.08);
}

vec3 lenteraKabutColor(vec3 v, float hl) {
  float s = max(dot(v, uFogSunDir), 0.0);
  float s2 = s * s;
  return uFogColor * mix(0.62, 1.15, hl) + uFogSunColor * (s2 * s2 * s2 * 0.42 + s * 0.05);
}

// 1 while the camera is inside the kabut layer (the kabut is in front of the far haze),
// 0 when it is above it (the kabut lies far below, behind the haze).
float lenteraCamInLayer() {
  return 1.0 - smoothstep(-2.0, 9.0, cameraPosition.y - uFogBase - uFogCam.x);
}

vec3 lenteraCompose(vec3 color, vec3 v, vec4 fd) {
  vec3 kab = lenteraKabutColor(v, fd.w);
  vec3 hz = lenteraHazeColor(v);
  vec3 glow = uFogLanternColor * fd.z;
  vec3 inside = mix(mix(color, hz, fd.y), kab, fd.x) + glow;
  vec3 above = mix(mix(color, kab, fd.x) + glow, hz, fd.y);
  return mix(above, inside, lenteraCamInLayer());
}

// Haze on an infinite ray at elevation e (sky dome): full at the horizon, gone overhead.
float lenteraSkyHaze(float e) { return 1.0 - smoothstep(-0.004, 0.11, e); }

vec2 lenteraFog(vec3 wp) {
  vec4 fd = lenteraFogData(wp);
  return vec2(1.0 - (1.0 - fd.x) * (1.0 - fd.y), fd.z);
}

vec3 lenteraFogColor(vec3 wp, vec2 fg) {
  vec3 v = normalize(wp - cameraPosition);
  float fh = lenteraHaze(length(wp - cameraPosition));
  float fk = clamp(1.0 - (1.0 - fg.x) / max(1.0 - fh, 1e-3), 0.0, 1.0);
  float share = fh / max(fk + fh, 1e-3);
  vec3 col = mix(lenteraKabutColor(v, 0.5), lenteraHazeColor(v), share);
  return col + uFogLanternColor * fg.y / max(fg.x, 0.3);
}

vec3 lenteraApplyFog(vec3 color, vec3 wp) {
  return lenteraCompose(color, normalize(wp - cameraPosition), lenteraFogData(wp));
}

// Infinite ray from the camera (sky dome / far reflections). vec4(kabut, 0, glow, tint).
vec4 lenteraSkyFog(vec3 dir) {
  LenteraRay r;
  r.o = cameraPosition;
  r.d = dir;
  r.L = 4000.0;
  r.C = uFogCam;
  r.T = uFogCam;
  vec4 k = uFogAmount > 0.0 ? lenteraKabut(r, true) : vec4(0.0, 0.0, 0.0, 1.0);
  return vec4(k.x, 0.0, k.y, k.w);
}
`;

// For custom ShaderMaterials: vertex snippet expects 'vec4 mvPosition' (view space) in scope,
// OR set vLenteraWorld yourself from your own world position.
const VERTEX_SNIPPET = /* glsl */ `
vLenteraWorld = (uFogCamMatrix * vec4(mvPosition.xyz, 1.0)).xyz;
`;
const APPLY_SNIPPET = /* glsl */ `
gl_FragColor.rgb = lenteraApplyFog(gl_FragColor.rgb, vLenteraWorld);
`;
// Additive glows fade out in fog instead of turning fog-coloured.
const APPLY_ADDITIVE = /* glsl */ `
gl_FragColor.rgb *= 1.0 - lenteraFog(vLenteraWorld).x;
`;

export const FOG_GLSL = {
  parsVertex: PARS_VERTEX,
  parsFragment: PARS_FRAGMENT,
  vertex: VERTEX_SNIPPET,
  apply: APPLY_SNIPPET,
  applyAdditive: APPLY_ADDITIVE,
};

export const fogUniforms = uniforms;

// Patch a built-in material (MeshStandard/Lambert/Basic/Phong/Physical/Toon/Points/Sprite/Line).
// Additive-blended materials fade toward black in fog instead of toward the fog colour.
export function patchMaterial(material) {
  if (!material || material.userData.lenteraFog) return material;
  if (material.isShaderMaterial || material.isRawShaderMaterial) return material; // include FOG_GLSL manually
  material.userData.lenteraFog = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\n' + PARS_VERTEX)
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n' + VERTEX_SNIPPET);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', PARS_FRAGMENT)
      .replace('#include <fog_fragment>', material.blending === THREE.AdditiveBlending ? APPLY_ADDITIVE : APPLY_SNIPPET);
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () =>
    (prevKey ? prevKey() : '') + '|lenteraFog' + (material.blending === THREE.AdditiveBlending ? 'A' : '');
  material.needsUpdate = true;
  return material;
}

export function patchObject(root) {
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of [].concat(o.material)) patchMaterial(m);
  });
}

const fmTmp = { raise: 0, mul: 1 };

export function createFog(ctx) {
  const { scene } = ctx;
  scene.fog = null; // patched materials carry their own fog code; three's fog stays off

  const slots = new Map(); // id -> slot index
  const targets = new Array(MAX_CLEARINGS).fill(null); // smooth radius targets
  let amountTarget = 1, amountRate = 0;
  let mist = null;

  const fog = {
    uniforms,
    patchMaterial,
    patchObject,
    MAX_CLEARINGS,
    get mist() { return mist; },

    // Clearings: circles in xz where kabut is removed. Slot 0 is reserved for the lantern.
    setClearing(id, x, z, radius, strength = 1, instant = false) {
      let slot = slots.get(id);
      if (slot === undefined) {
        slot = id === 'lantern' ? 0 : -1;
        if (slot < 0) {
          const used = new Set(slots.values());
          for (let i = 1; i < MAX_CLEARINGS; i++) if (!targets[i] && !used.has(i)) { slot = i; break; }
        }
        if (slot < 0) return false;
        slots.set(id, slot);
      }
      const v = uniforms.uFogClear.value[slot];
      v.x = x; v.y = z; v.w = strength;
      targets[slot] = { radius, strength };
      if (instant) v.z = radius;
      return true;
    },
    removeClearing(id) {
      const slot = slots.get(id);
      if (slot === undefined) return;
      targets[slot] = { radius: 0, strength: 0, remove: id };
    },
    // Global kabut amount (0..1), eased over `seconds`.
    setAmount(value, seconds = 0) {
      amountTarget = clamp(value, 0, 1);
      amountRate = seconds > 0 ? Math.abs(amountTarget - uniforms.uFogAmount.value) / seconds : Infinity;
      if (!isFinite(amountRate)) uniforms.uFogAmount.value = amountTarget;
    },
    get amount() { return uniforms.uFogAmount.value; },

    // Gameplay query: local kabut thickness at a world point (0 clear .. 1 thick).
    // Same logistic layer + pocket map as the shader.
    fogAmount(x, y, z) {
      const u = uniforms;
      sampleFogMap(x, z, fmTmp);
      const k = u.uFogFalloff.value / (1 + fmTmp.raise * 0.045);
      const e = Math.min(60, k * (y - u.uFogBase.value - fmTmp.raise));
      const dens = fmTmp.mul / (1 + Math.exp(e));
      let cover = 0;
      for (const c of u.uFogClear.value) {
        if (c.z <= 0) continue;
        const d = Math.hypot(x - c.x, z - c.y);
        cover = Math.max(cover, c.w * (1 - smoothstep(c.z * 0.6, c.z, d)));
      }
      return clamp(u.uFogAmount.value * dens * (1 - cover), 0, 1);
    },

    update(dt, t) {
      uniforms.uFogTime.value = t;
      const cam = ctx.camera;
      cam.updateMatrixWorld();
      uniforms.uFogCamMatrix.value.copy(cam.matrixWorld);
      sampleFogMap(cam.position.x, cam.position.z, fmTmp);
      uniforms.uFogCam.value.set(fmTmp.raise, fmTmp.mul);
      // Lantern bubble follows the player.
      const p = ctx.player;
      if (p && p.position) {
        const lantern = p.lanternWorld && p.lanternWorld.lengthSq() > 0 ? p.lanternWorld : null;
        if (lantern) uniforms.uFogLanternPos.value.copy(lantern);
        else uniforms.uFogLanternPos.value.set(p.position.x, p.position.y + 1.2, p.position.z);
        const r = p.lanternRadius ?? 16;
        uniforms.uFogLanternRadius.value = Math.max(0, r);
        fog.setClearing('lantern', p.position.x, p.position.z, r, 1);
      }
      // Ease clearing radii.
      const arr = uniforms.uFogClear.value;
      for (let i = 0; i < MAX_CLEARINGS; i++) {
        const tg = targets[i];
        if (!tg) continue;
        arr[i].z = i === 0 ? tg.radius : damp(arr[i].z, tg.radius, 1.6, dt);
        if (tg.remove && arr[i].z < 0.05) {
          arr[i].set(0, 0, 0, 0);
          targets[i] = null;
          slots.delete(tg.remove);
        }
      }
      if (uniforms.uFogAmount.value !== amountTarget) {
        const v = uniforms.uFogAmount.value;
        const step = amountRate * dt;
        uniforms.uFogAmount.value = Math.abs(amountTarget - v) <= step ? amountTarget : v + Math.sign(amountTarget - v) * step;
      }
      if (mist) mist.update(dt, t);
    },
  };

  try {
    mist = createMist(ctx, uniforms);
  } catch (err) {
    console.warn('[lentera] kabut mist disabled', err);
  }
  return fog;
}
