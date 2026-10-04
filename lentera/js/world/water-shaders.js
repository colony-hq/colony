// Water GLSL + wave definition shared by the ocean shader and its CPU twin (owner: landscape).
// WAVES drives both oceanWave() in GLSL and waveHeight() in JS, so swimming/boat bobbing match
// the rendered surface exactly. Sum of amplitudes <= 0.25 m (DESIGN.md §Ocean).

import { FOG_GLSL } from './fog.js';
import { LAND_GLSL } from './land-maps.js';

const G = 9.81;
const SPEED = 0.82; // slows the deep-water dispersion a little: calm evening sea

// dir (unnormalised, normalised below), wavelength (m), amplitude (m), phase (rad)
export const WAVES = [
  { dx: 0.2, dz: -1.0, len: 23, amp: 0.085, phase: 0.0 },
  { dx: -0.62, dz: -0.78, len: 13.5, amp: 0.065, phase: 1.7 },
  { dx: 0.92, dz: -0.4, len: 8.3, amp: 0.05, phase: 4.1 },
  { dx: -0.35, dz: 0.94, len: 4.7, amp: 0.035, phase: 2.6 },
].map((w) => {
  const l = Math.hypot(w.dx, w.dz);
  const k = (Math.PI * 2) / w.len;
  return { ...w, dx: w.dx / l, dz: w.dz / l, k, w: Math.sqrt(G * k) * SPEED };
});

export const WAVE_AMPLITUDE = WAVES.reduce((s, w) => s + w.amp, 0);

// CPU twin of oceanWave(). t = ctx.time.t (the same value the ocean passes as uTime).
export function waveHeightAt(x, z, t) {
  let h = 0;
  for (const w of WAVES) h += w.amp * Math.sin((w.dx * x + w.dz * z) * w.k - w.w * t + w.phase);
  return h;
}

const f = (v) => v.toFixed(6);

export const WAVE_GLSL = /* glsl */ `
float oceanWave(vec2 p, float t) {
  float h = 0.0;
${WAVES.map((w) => `  h += ${f(w.amp)} * sin(dot(vec2(${f(w.dx)}, ${f(w.dz)}), p) * ${f(w.k)} - ${f(w.w)} * t + ${f(w.phase)});`).join('\n')}
  return h;
}
// Gradient of oceanWave; short waves fade out with distance (no sparkle aliasing far away).
vec2 oceanWaveGrad(vec2 p, float t, float dist) {
  vec2 g = vec2(0.0);
  float c;
${WAVES.map((w) => `  c = ${f(w.amp * w.k)} * cos(dot(vec2(${f(w.dx)}, ${f(w.dz)}), p) * ${f(w.k)} - ${f(w.w)} * t + ${f(w.phase)}) * (1.0 - smoothstep(${f(w.len * 7)}, ${f(w.len * 28)}, dist));
  g += vec2(${f(w.dx)}, ${f(w.dz)}) * c;`).join('\n')}
  return g;
}
`;

// Uniform names shared by ocean + river shaders (values come from fogUniforms, skyUniforms and
// the ocean module).
const WATER_COMMON = /* glsl */ `
#define W_PI 3.141592653589793
uniform float uTime;
uniform sampler2D uRipple;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLanternI;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSkyGlow;
uniform float uSkyGlowAmt;
uniform vec3 uSunPos;
uniform vec3 uSunDisc;
uniform vec3 uMoonPos;
uniform vec3 uMoonDisc;
uniform vec3 uFoam;

// Sky seen in a reflection: same gradient as the dome, kabut approximated (cheap).
vec3 waterSky(vec3 r) {
  float e = max(r.y, 0.0);
  vec3 c = mix(uFogHorizon, uSkyMid, smoothstep(0.0, 0.3, e));
  c = mix(c, uSkyZenith, smoothstep(0.22, 0.98, e));
  float s = max(dot(r, uSunPos), 0.0);
  c += uFogSunColor * (pow(s, 10.0) * 0.5 + s * s * 0.08);
  c += uSkyGlow * uSkyGlowAmt * pow(s, 3.0) * 0.22 * (1.0 - smoothstep(0.0, 0.45, e));
  float k = uFogAmount * (1.0 - 0.65 * smoothstep(0.04, 0.6, r.y));
  return mix(c, lenteraKabutColor(r, 0.85), k);
}

// Shade a water surface: body colour (already depth-tinted), reflection, sun/moon glitter,
// lantern glints. Returns colour; fresnel in F.
vec3 waterShade(vec3 P, vec3 N, vec3 V, vec3 body, float glitter, out float F, out vec3 amb, out float ndl) {
  ndl = max(dot(N, uKeyDir), 0.0);
  amb = mix(uAmbGround, uAmbSky, 0.5 + 0.5 * N.y);
  vec3 lit = body * (amb * 0.9 + uKeyColor * (0.25 + 0.6 * max(uKeyDir.y, 0.0))) / W_PI;
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  F = clamp(0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 4.0), 0.0, 0.9);
  vec3 col = mix(lit, waterSky(R), F);
  // Glitter paths toward the real sun and moon (dimmed by the kabut in front of them).
  float through = 1.0 - 0.75 * uFogAmount;
  float hs = max(dot(N, normalize(uSunPos + V)), 0.0);
  float hm = max(dot(N, normalize(uMoonPos + V)), 0.0);
  col += uSunDisc * (pow(hs, 420.0) * 10.0 + pow(hs, 60.0) * 0.25) * glitter * through;
  col += uMoonDisc * (pow(hm, 1200.0) * 0.6 + pow(hm, 160.0) * 0.015) * glitter * mix(0.5, 1.0, through);
  // Lantern: warm glints and a soft pool of light on the surface.
  vec3 Lv = uLanternPos - P;
  float ld = length(Lv);
  vec3 Ll = Lv / max(ld, 1e-3);
  float att = uLanternI / (1.0 + ld * ld * 0.045);
  float hl = max(dot(N, normalize(Ll + V)), 0.0);
  col += uLanternColor * att * (pow(hl, 150.0) * 5.0 + pow(hl, 16.0) * 0.1 + max(dot(N, Ll), 0.0) * 0.06 * (1.0 - F));
  return col;
}
`;

export const OCEAN_VERT = () => /* glsl */ `
${FOG_GLSL.parsVertex}
${WAVE_GLSL}
uniform float uTime;
uniform vec4 uOceanGrid; // xy: grid centre, z/w: wave fade start/end (chebyshev distance)
varying vec3 vWorld;
varying float vWave;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float e = max(abs(wp.x - uOceanGrid.x), abs(wp.z - uOceanGrid.y));
  float amp = 1.0 - smoothstep(uOceanGrid.z, uOceanGrid.w, e);
  float h = oceanWave(wp.xz, uTime) * amp;
  wp.y += h;
  vWave = h;
  vWorld = wp.xyz;
  vLenteraWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const OCEAN_FRAG = () => /* glsl */ `
${FOG_GLSL.parsFragment}
${LAND_GLSL.height}
${WAVE_GLSL}
${WATER_COMMON}
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
varying vec3 vWorld;
varying float vWave;
void main() {
  vec3 P = vWorld;
  vec3 toCam = cameraPosition - P;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 1e-3);
  vec2 g = oceanWaveGrad(P.xz, uTime, dist);
  vec2 r1 = texture2D(uRipple, P.xz * 0.043 + uTime * vec2(0.011, -0.019)).rg - 0.5;
  vec2 r2 = texture2D(uRipple, P.xz * 0.117 + uTime * vec2(-0.023, 0.009)).rg - 0.5;
  vec2 r3 = texture2D(uRipple, P.xz * 0.0071 + uTime * vec2(0.002, 0.0031)).rg - 0.5;
  g += (r1 * 0.15 + r2 * 0.085) * (1.0 - 0.6 * smoothstep(50.0, 450.0, dist)) + r3 * 0.11;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(180.0, 1500.0, dist) * 0.6));

  float ground = landHeight(P.xz);
  float depth = max(P.y - ground, 0.0);
  float nF = texture2D(uFogNoise, P.xz * 0.061 + uTime * vec2(0.010, 0.017)).b;
  float nF2 = texture2D(uFogNoise, P.xz * 0.19 - uTime * vec2(0.021, 0.008)).a;

  vec3 body = mix(uShallow, uMid, smoothstep(0.15, 3.2, depth));
  body = mix(body, uDeep, smoothstep(2.5, 15.0, depth));
  // A little subsurface glow in crests facing the key light.
  body += uShallow * smoothstep(0.05, 0.2, vWave) * 0.25 * max(dot(V, -uKeyDir) * 0.5 + 0.5, 0.0);

  float F; vec3 amb; float ndl;
  vec3 col = waterShade(P, N, V, body, 1.0, F, amb, ndl);

  // Shoreline foam: a lapping band plus moving lines that run up the beach.
  float shore = 1.0 - smoothstep(0.0, 0.7 + nF * 0.9, depth);
  float bands = smoothstep(0.6, 0.95, sin(depth * 5.2 - uTime * 1.3 + nF * 6.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.2, 2.4, depth));
  float crest = smoothstep(0.17, 0.24, vWave + (nF - 0.5) * 0.06) * smoothstep(0.62, 0.85, nF2);
  float foam = clamp(max(shore * 0.95, bands * 0.7) * smoothstep(0.28, 0.6, nF * 0.7 + nF2 * 0.3 + shore * 0.35) + crest * 0.22, 0.0, 1.0);
  vec3 foamCol = uFoam * (amb + uKeyColor * (0.35 + 0.65 * ndl)) / W_PI;
  col = mix(col, foamCol, foam);

  float a = mix(0.3, 1.0, smoothstep(0.0, 4.6, depth));
  a = max(a, foam * 0.95);
  a *= smoothstep(0.0, 0.09, depth);
  if (a < 0.003) discard;
  gl_FragColor = vec4(lenteraApplyFog(col, vLenteraWorld), a);
}
`;

// River ribbon: aRiver = (across -1..1, travel time coordinate, speed, foam amount).
export const RIVER_VERT = () => /* glsl */ `
${FOG_GLSL.parsVertex}
attribute vec4 aRiver;
varying vec3 vWorld;
varying vec4 vRiver;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vLenteraWorld = wp.xyz;
  vRiver = aRiver;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const RIVER_FRAG = () => /* glsl */ `
${FOG_GLSL.parsFragment}
${LAND_GLSL.height}
${WATER_COMMON}
uniform vec3 uRiverShallow;
uniform vec3 uRiverDeep;
varying vec3 vWorld;
varying vec4 vRiver;
void main() {
  vec3 P = vWorld;
  vec3 toCam = cameraPosition - P;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 1e-3);
  float depth = P.y - landHeight(P.xz);
  // Flow-aligned coordinates: x across, y = travel time minus time (moves at the local speed).
  vec2 fuv = vec2(vRiver.x * 2.4, (vRiver.y - uTime) * 1.6);
  vec2 g1 = texture2D(uRipple, fuv * vec2(0.42, 0.21)).rg - 0.5;
  vec2 g2 = texture2D(uRipple, fuv * vec2(0.9, 0.5) + 0.31).rg - 0.5;
  vec2 g = g1 * 0.5 + g2 * 0.3;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float n1 = texture2D(uFogNoise, fuv * vec2(0.5, 0.22)).g;
  float n2 = texture2D(uFogNoise, fuv * vec2(1.3, 0.55) + 0.37).b;
  float streak = smoothstep(0.58, 0.86, n1 * 0.6 + n2 * 0.4);
  vec3 body = mix(uRiverShallow, uRiverDeep, smoothstep(0.1, 1.3, depth));
  float F; vec3 amb; float ndl;
  vec3 col = waterShade(P, N, V, body, 0.7, F, amb, ndl);
  float edge = 1.0 - smoothstep(0.0, 0.22, depth);
  float foam = clamp(vRiver.w * (0.45 + 0.8 * n2) + streak * (0.18 + 0.5 * vRiver.w) + edge * 0.55 * smoothstep(0.35, 0.7, n1), 0.0, 1.0);
  vec3 foamCol = uFoam * (amb + uKeyColor * (0.35 + 0.65 * ndl)) / W_PI;
  col = mix(col, foamCol, foam);
  float a = mix(0.42, 0.9, smoothstep(0.1, 0.9, depth));
  a = max(a, foam * 0.9);
  a *= smoothstep(0.0, 0.16, depth) * (1.0 - smoothstep(0.8, 1.0, abs(vRiver.x)));
  if (a < 0.003) discard;
  gl_FragColor = vec4(lenteraApplyFog(col, vLenteraWorld), a);
}
`;
