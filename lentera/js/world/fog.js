// Kabut: height-based, ray-integrated fog with clearings (lantern bubble, lit campfires, finale).
// Owner: landscape. Public API is fixed by DESIGN.md §Fog — keep it stable.
//
// Built-in materials get the fog by patchMaterial(material) (idempotent, chains onBeforeCompile).
// Custom ShaderMaterials include FOG_GLSL.pars / FOG_GLSL.vertex / FOG_GLSL.apply and merge
// fog.uniforms into their uniforms.

import * as THREE from 'three';
import { clamp, smoothstep, damp } from '../core/math.js';

export const MAX_CLEARINGS = 8;

// Shared uniform objects: every patched material references these same objects.
const uniforms = {
  uFogColor: { value: new THREE.Color(0x8d93ad) }, // linear-ish lavender dusk
  uFogSunColor: { value: new THREE.Color(0xffb27a) },
  uFogSunDir: { value: new THREE.Vector3(0.4, 0.15, 0.9).normalize() },
  uFogLanternColor: { value: new THREE.Color(0xffa040) },
  uFogLanternPos: { value: new THREE.Vector3() },
  uFogLanternGlow: { value: 1 },
  uFogAmount: { value: 1 }, // 0 = kabut gone (finale), 1 = full
  uFogDensity: { value: 0.045 }, // kabut density at the base height
  uFogBase: { value: 6 }, // height where kabut starts thinning
  uFogFalloff: { value: 0.085 }, // per metre above uFogBase
  uFogHaze: { value: 0.0018 }, // always-on atmospheric distance haze
  uFogTime: { value: 0 },
  uFogClear: { value: Array.from({ length: MAX_CLEARINGS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uFogCamMatrix: { value: new THREE.Matrix4() },
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
uniform vec3 uFogLanternColor;
uniform vec3 uFogLanternPos;
uniform float uFogLanternGlow;
uniform float uFogAmount;
uniform float uFogDensity;
uniform float uFogBase;
uniform float uFogFalloff;
uniform float uFogHaze;
uniform float uFogTime;
uniform vec4 uFogClear[LENTERA_MAX_CLEAR];
varying vec3 vLenteraWorld;

// Length of the 2D segment a->b that lies inside circle (c, r).
float lenteraSegInCircle(vec2 a, vec2 b, vec2 c, float r) {
  vec2 d = b - a;
  float L = length(d);
  if (L < 1e-4 || r <= 0.0) return 0.0;
  vec2 u = d / L;
  vec2 f = a - c;
  float bb = dot(f, u);
  float cc = dot(f, f) - r * r;
  float disc = bb * bb - cc;
  if (disc <= 0.0) return 0.0;
  float s = sqrt(disc);
  float t0 = clamp(-bb - s, 0.0, L);
  float t1 = clamp(-bb + s, 0.0, L);
  return max(t1 - t0, 0.0);
}

// Returns vec2(fogFactor 0..1, lantern glow 0..1).
vec2 lenteraFog(vec3 wp) {
  vec3 cam = cameraPosition;
  vec3 dv = wp - cam;
  float dist = length(dv);
  // Remove the part of the ray that passes through clearings.
  float cleared = 0.0;
  for (int i = 0; i < LENTERA_MAX_CLEAR; i++) {
    vec4 c = uFogClear[i];
    if (c.z <= 0.0) continue;
    cleared = max(cleared, c.w * lenteraSegInCircle(cam.xz, wp.xz, c.xy, c.z));
  }
  float effDist = max(dist - cleared, 0.0);
  // Exponential height fog, integrated analytically along the ray.
  float k = uFogFalloff;
  float h0 = cam.y - uFogBase;
  float dy = dv.y;
  float t = k * dy;
  float shape = abs(t) > 1e-3 ? (1.0 - exp(-t)) / t : 1.0;
  float wob = 0.85 + 0.15 * sin(wp.x * 0.045 + uFogTime * 0.13) * sin(wp.z * 0.038 - uFogTime * 0.11);
  float dens = uFogDensity * exp(-k * clamp(h0, -30.0, 80.0)) * wob;
  float kabut = 1.0 - exp(-dens * shape * effDist);
  kabut *= uFogAmount;
  float haze = 1.0 - exp(-pow(dist * uFogHaze, 1.6));
  float f = 1.0 - (1.0 - kabut) * (1.0 - haze);
  // Warm scattering from the lantern: strongest for fog close to it.
  float ld = length(wp - uFogLanternPos);
  float glow = uFogLanternGlow * exp(-ld * 0.09) * smoothstep(2.0, 14.0, dist) * uFogAmount;
  return vec2(clamp(f, 0.0, 1.0), glow);
}

vec3 lenteraFogColor(vec3 wp, vec2 fg) {
  vec3 viewDir = normalize(wp - cameraPosition);
  float sun = pow(max(dot(viewDir, uFogSunDir), 0.0), 6.0);
  vec3 col = uFogColor + uFogSunColor * sun * 0.55;
  return col + uFogLanternColor * fg.y * 0.5;
}

vec3 lenteraApplyFog(vec3 color, vec3 wp) {
  vec2 fg = lenteraFog(wp);
  return mix(color, lenteraFogColor(wp, fg), fg.x);
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

export function createFog(ctx) {
  const { scene } = ctx;
  scene.fog = null; // patched materials carry their own fog code; three's fog stays off

  const slots = new Map(); // id -> slot index
  const targets = new Array(MAX_CLEARINGS).fill(null); // smooth radius targets
  let amountTarget = 1, amountRate = 0;

  const fog = {
    uniforms,
    patchMaterial,
    patchObject,
    MAX_CLEARINGS,

    // Clearings: circles in xz where kabut is removed. Slot 0 is reserved for the lantern.
    setClearing(id, x, z, radius, strength = 1, instant = false) {
      let slot = slots.get(id);
      if (slot === undefined) {
        slot = id === 'lantern' ? 0 : -1;
        if (slot < 0) for (let i = 1; i < MAX_CLEARINGS; i++) if (!targets[i] && ![...slots.values()].includes(i)) { slot = i; break; }
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
    fogAmount(x, y, z) {
      const u = uniforms;
      const height = Math.exp(-u.uFogFalloff.value * Math.max(y - u.uFogBase.value, 0));
      let cover = 0;
      for (const c of u.uFogClear.value) {
        if (c.z <= 0) continue;
        const d = Math.hypot(x - c.x, z - c.y);
        cover = Math.max(cover, c.w * (1 - smoothstep(c.z * 0.6, c.z, d)));
      }
      return clamp(u.uFogAmount.value * height * (1 - cover), 0, 1);
    },

    update(dt, t) {
      uniforms.uFogTime.value = t;
      const cam = ctx.camera;
      cam.updateMatrixWorld();
      uniforms.uFogCamMatrix.value.copy(cam.matrixWorld);
      // Lantern bubble follows the player.
      const p = ctx.player;
      if (p && p.position) {
        const lantern = p.lanternWorld || p.position;
        uniforms.uFogLanternPos.value.set(lantern.x, lantern.y ?? p.position.y + 1.2, lantern.z);
        const r = p.lanternRadius ?? 16;
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
    },
  };
  return fog;
}
