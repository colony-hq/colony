// Sky dome, sun/moon key light, hemisphere light and time of day. Owner: landscape.
// API (DESIGN.md §Sky): createSky(ctx) -> { sun, hemi, timeOfDay, setTimeOfDay(v, seconds),
//   autoAdvance, update }. Extra read-only fields: dome, night (0..1), sunDir, moonDir, exposure,
//   keyDir; writable exposureBias (multiplier on the keyed exposure).
//
// timeOfDay: 0 dusk (sun low in the WNW) · 0.35 blue hour · 0.6 night (moon, stars) ·
// 1.0 dawn (sun rising in the east behind the mercusuar). Starts at 0.05 and auto-advances to 0.6
// over ~12 minutes of `play`. The sky drives the kabut colours (fogUniforms) and the shared sky
// uniforms (sky-shared.js) so fog, water and sky always agree.

import * as THREE from 'three';
import { fogUniforms, FOG_GLSL } from './fog.js';
import { skyUniforms } from './sky-shared.js';
import { clamp, smoothstep, easeInOut } from '../core/math.js';

const AUTO_START = 0.05;
const AUTO_END = 0.6;
const AUTO_SECONDS = 12 * 60;
const DEG = Math.PI / 180;

// Palette keyframes (sRGB hex). Interpolated in linear space.
const KEYS = [
  { t: 0.0, zenith: 0x31407a, mid: 0x7d74b0, horizon: 0xeea48e, glow: 0xffa460, glowAmt: 1.0, fog: 0x9b8cb6,
    hemiSky: 0xa0a4dc, hemiGround: 0x6e5248, hemiI: 1.55, exposure: 1.0, cloudLit: 0xffb698, cloudDark: 0x6c6094, cover: 0.5, stars: 0 },
  { t: 0.18, zenith: 0x27356c, mid: 0x6b64a4, horizon: 0xdf8f80, glow: 0xff8a52, glowAmt: 1.0, fog: 0x877eac,
    hemiSky: 0x8c92ce, hemiGround: 0x5a4642, hemiI: 1.5, exposure: 1.05, cloudLit: 0xff9a84, cloudDark: 0x564e82, cover: 0.5, stars: 0.05 },
  { t: 0.35, zenith: 0x121c48, mid: 0x303d7e, horizon: 0x6a68a8, glow: 0xcc6e62, glowAmt: 0.45, fog: 0x5c62a0,
    hemiSky: 0x6070b8, hemiGround: 0x3a3448, hemiI: 1.45, exposure: 1.15, cloudLit: 0x9a7a9c, cloudDark: 0x2e3462, cover: 0.48, stars: 0.45 },
  { t: 0.6, zenith: 0x04071a, mid: 0x0f1838, horizon: 0x26315e, glow: 0x40406c, glowAmt: 0.0, fog: 0x3a4782,
    hemiSky: 0x4a5ea8, hemiGround: 0x26283e, hemiI: 1.45, exposure: 1.32, cloudLit: 0x5e6e9e, cloudDark: 0x151b36, cover: 0.42, stars: 1 },
  { t: 0.8, zenith: 0x0d1536, mid: 0x242d60, horizon: 0x5c4c7a, glow: 0xc06a72, glowAmt: 0.4, fog: 0x525488,
    hemiSky: 0x5a68aa, hemiGround: 0x2e2a3c, hemiI: 1.4, exposure: 1.22, cloudLit: 0x9c7088, cloudDark: 0x272b52, cover: 0.45, stars: 0.6 },
  { t: 0.92, zenith: 0x36528f, mid: 0x8c88ba, horizon: 0xf2b2a0, glow: 0xffa472, glowAmt: 0.9, fog: 0xb3a0b6,
    hemiSky: 0x9aa6da, hemiGround: 0x5c4c4a, hemiI: 1.5, exposure: 1.05, cloudLit: 0xffb292, cloudDark: 0x6c6292, cover: 0.42, stars: 0.08 },
  { t: 1.0, zenith: 0x4a70b4, mid: 0xa6b2da, horizon: 0xffd0aa, glow: 0xffc070, glowAmt: 1.0, fog: 0xd2bab8,
    hemiSky: 0xb2c2ea, hemiGround: 0x705e50, hemiI: 1.6, exposure: 1.0, cloudLit: 0xffd2a4, cloudDark: 0x8c86aa, cover: 0.38, stars: 0 },
];
const COLOR_FIELDS = ['zenith', 'mid', 'horizon', 'glow', 'fog', 'hemiSky', 'hemiGround', 'cloudLit', 'cloudDark'];
const NUM_FIELDS = ['glowAmt', 'hemiI', 'exposure', 'cover', 'stars'];
for (const k of KEYS) for (const f of COLOR_FIELDS) k[f] = new THREE.Color(k[f]);

// Sun / moon paths: [timeOfDay, azimuth deg (0 N, 90 E, unwrapped), elevation deg].
const SUN_PATH = [
  [0.0, 292.5, 6], [0.1, 294, 2.5], [0.2, 297, -3], [0.35, 305, -10], [0.5, 340, -22],
  [0.6, 380, -30], [0.75, 445, -16], [0.88, 458, -5], [0.95, 460, 0.5], [1.0, 461.3, 4.5],
];
const MOON_PATH = [
  [0.0, 110, -12], [0.2, 100, -2], [0.3, 92, 8], [0.45, 68, 24], [0.6, 32, 33],
  [0.75, 0, 30], [0.9, -40, 16], [1.0, -60, 6],
];

function pathDir(path, t, out) {
  let i = 0;
  while (i < path.length - 2 && t > path[i + 1][0]) i++;
  const a = path[i], b = path[i + 1];
  const k = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
  const az = (a[1] + (b[1] - a[1]) * k) * DEG;
  const el = (a[2] + (b[2] - a[2]) * k) * DEG;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

// Same direction with the elevation clamped (for lighting: avoids grazing, pitch-black faces).
function lightDir(d, minEl, out) {
  const h = Math.hypot(d.x, d.z) || 1;
  const el = Math.max(Math.asin(clamp(d.y, -1, 1)), minEl);
  return out.set((d.x / h) * Math.cos(el), Math.sin(el), (d.z / h) * Math.cos(el));
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position * 1000.0, 1.0);
  p.z = p.w * 0.99999;
  gl_Position = p;
}
`;

const skyFrag = () => /* glsl */ `
${FOG_GLSL.parsFragment}
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSkyGlow;
uniform float uSkyGlowAmt;
uniform vec3 uSunPos;
uniform vec3 uSunDisc;
uniform vec3 uMoonPos;
uniform vec3 uMoonDisc;
uniform float uStars;
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
uniform float uCloudCover;
uniform float uSkyTime;
varying vec3 vDir;

vec3 skyHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float starLayer(vec3 d, float scale, float density, float seed) {
  vec3 p = d * scale + seed;
  vec3 c = floor(p);
  vec3 h = skyHash3(c);
  vec3 sp = c + 0.22 + 0.56 * h;
  float dd = length(p - sp);
  float on = step(1.0 - density, skyHash3(c + 17.3).x);
  float size = mix(0.07, 0.16, h.z * h.z);
  float tw = 0.62 + 0.38 * sin(uSkyTime * (1.3 + 3.2 * h.y) + h.x * 61.0);
  return on * (1.0 - smoothstep(0.0, size, dd)) * mix(0.3, 2.4, pow(h.y, 3.0)) * tw;
}

void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  float eu = max(e, 0.0);
  float hor = 1.0 - smoothstep(0.0, 0.45, eu);

  // Gradient: horizon (= fog haze colour, so far geometry dissolves into it) -> mid -> zenith.
  vec3 sky = mix(uFogHorizon, uSkyMid, smoothstep(0.0, 0.3, eu));
  sky = mix(sky, uSkyZenith, smoothstep(0.22, 0.98, eu));
  float s = max(dot(d, uSunPos), 0.0);
  sky += uFogSunColor * (pow(s, 10.0) * 0.5 + s * s * 0.08) * mix(0.4, 1.0, hor);
  sky += uSkyGlow * uSkyGlowAmt * pow(s, 3.0) * 0.22 * hor * hor;

  // Sun disc + halo (HDR: blooms).
  float cs = dot(d, uSunPos);
  vec3 sun = vec3(0.0);
  if (cs > 0.96) {
    sun = uSunDisc * (smoothstep(0.99975, 0.99988, cs) * 4.0 + pow(cs, 1400.0) * 1.2 + pow(cs, 160.0) * 0.22);
  }

  // Moon with maria and a soft halo.
  float cm = dot(d, uMoonPos);
  vec3 moon = vec3(0.0);
  if (cm > 0.86 && uMoonDisc.b > 0.002) {
    vec3 mu = normalize(cross(uMoonPos, vec3(0.0, 1.0, 0.0)));
    vec3 mv = cross(mu, uMoonPos);
    vec2 mq = vec2(dot(d, mu), dot(d, mv)) / 0.031;
    float md = length(mq);
    float mdisc = 1.0 - smoothstep(0.9, 1.0, md);
    float maria = texture2D(uFogNoise, mq * 0.32 + 0.37).r;
    moon = uMoonDisc * mdisc * (2.6 - 1.0 * smoothstep(0.42, 0.68, maria)) * (0.8 + 0.2 * sqrt(max(1.0 - md * md, 0.0)));
    moon += uMoonDisc * (pow(cm, 500.0) * 0.45 + pow(cm, 24.0) * 0.07);
  }

  // Stars + a faint milky way band.
  vec3 stars = vec3(0.0);
  if (uStars > 0.01 && e > -0.03) {
    vec3 bandN = normalize(vec3(0.42, 0.3, 0.86));
    float band = exp(-pow(dot(d, bandN) / 0.2, 2.0));
    float mwN = texture2D(uFogNoise, d.xz / (abs(d.y) + 0.7) * 0.8 + 0.1).b;
    float st = starLayer(d, 95.0, 0.05, 0.0) + starLayer(d, 170.0, 0.03 + 0.12 * band * mwN, 41.0) * 0.55;
    vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.78), skyHash3(floor(d * 95.0)).x);
    stars = tint * st + vec3(0.16, 0.14, 0.26) * band * smoothstep(0.35, 0.8, mwN) * 0.35;
    stars *= uStars * smoothstep(-0.02, 0.2, e);
  }

  // Soft cloud bands (planar projection, stretched), lit by the sun/moon side.
  vec2 cuv = d.xz / (eu + 0.085);
  cuv = mat2(0.87, 0.49, -0.49, 0.87) * cuv * vec2(0.13, 0.36);
  float cn = texture2D(uFogNoise, cuv * 0.5 + uSkyTime * vec2(0.0016, 0.0005)).r * 0.66
           + texture2D(uFogNoise, cuv * 1.35 - uSkyTime * vec2(0.0009, 0.0022)).g * 0.34;
  float cd = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.3, cn)
           * smoothstep(0.012, 0.14, e) * (1.0 - 0.55 * smoothstep(0.45, 1.0, e));
  float sm = max(dot(d, uMoonPos), 0.0);
  float lit = clamp(pow(s, 2.2) * 0.85 * uSkyGlowAmt + 0.25 + 0.3 * uSkyGlowAmt * hor + pow(sm, 6.0) * 0.4 * uStars, 0.0, 1.0);
  vec3 ccol = mix(uCloudDark, uCloudLit, lit);
  ccol += (uSkyGlow * uSkyGlowAmt * pow(s, 14.0) + uMoonDisc * pow(sm, 40.0) * 0.5) * (1.0 - cd) * 1.4;
  sky = mix(sky, ccol, cd * 0.88);
  vec3 celestial = (sun + moon + stars) * (1.0 - cd * 0.92);

  // Below the horizon: haze (the far ocean covers most of it).
  if (e < 0.0) {
    sky = lenteraHazeColor(d);
    celestial = vec3(0.0);
  }

  // The kabut on an infinite ray from the camera (clear overhead inside clearings), composed
  // exactly like geometry so the far sea melts into the horizon.
  vec4 kf = lenteraSkyFog(d);
  vec3 col = lenteraCompose(sky + celestial * (1.0 - lenteraSkyHaze(e)), d, vec4(kf.x, lenteraSkyHaze(e), kf.z, kf.w));
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += dither * 0.006 * (col + 0.015);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createSky(ctx) {
  const { scene, engine, renderer } = ctx;
  const preset0 = engine.preset;

  // --- Lights -----------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0x9aa0d8, 0x5a4a48, 1.5);
  hemi.name = 'sky-hemi';
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb27a, 3);
  sun.name = 'sky-key';
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  let shadowHalf = 30;
  function applyShadowPreset(p) {
    sun.castShadow = !!p.shadows;
    const size = p.shadowMapSize || 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    shadowHalf = size >= 2048 ? 34 : 30;
    const sc = sun.shadow.camera;
    sc.left = -shadowHalf; sc.right = shadowHalf; sc.top = shadowHalf; sc.bottom = -shadowHalf;
    sc.near = 1; sc.far = 300;
    sc.updateProjectionMatrix();
  }
  applyShadowPreset(preset0);
  let lastPreset = preset0;

  // --- Dome -------------------------------------------------------------------------------
  const domeUniforms = { ...fogUniforms, ...skyUniforms };
  const domeMat = new THREE.ShaderMaterial({
    uniforms: domeUniforms,
    vertexShader: SKY_VERT,
    fragmentShader: skyFrag(),
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  domeMat.userData.lenteraFog = true;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), domeMat);
  dome.name = 'sky-dome';
  dome.frustumCulled = false;
  dome.renderOrder = 1e6; // after the opaque world: only uncovered pixels pay for the sky shader
  dome.castShadow = dome.receiveShadow = false;
  scene.add(dome);
  scene.background = new THREE.Color(0x2a2d48);

  // --- State ------------------------------------------------------------------------------
  let tod = AUTO_START;
  let tween = null; // { from, to, time, dur }
  const pal = {};
  for (const f of COLOR_FIELDS) pal[f] = new THREE.Color();
  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const sunL = new THREE.Vector3();
  const moonL = new THREE.Vector3();
  const keyDir = new THREE.Vector3();
  const tmpC = new THREE.Color();
  const sunCol = new THREE.Color();
  const MOON_LIGHT = new THREE.Color(0x9cb0ff);
  const MOON_DISC = new THREE.Color(0xe8eeff);
  const SUN_LOW = new THREE.Color(0xffa06a);
  const SUN_HIGH = new THREE.Color(0xffd2a2);
  const SUN_DAWN = new THREE.Color(0xffc88a);
  const SUN_DISC_LOW = new THREE.Color(0xff9a48);
  const SUN_DISC_HIGH = new THREE.Color(0xfff2d8);
  const basis = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
  const UP = new THREE.Vector3(0, 1, 0);
  const focus = new THREE.Vector3();
  let night = 0;
  let exposure = 1;

  function samplePalette(t) {
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const k = easeInOut(clamp((t - a.t) / (b.t - a.t), 0, 1));
    for (const f of COLOR_FIELDS) pal[f].copy(a[f]).lerp(b[f], k);
    for (const f of NUM_FIELDS) pal[f] = a[f] + (b[f] - a[f]) * k;
  }

  function apply(t) {
    samplePalette(t);
    pathDir(SUN_PATH, t, sunDir);
    pathDir(MOON_PATH, t, moonDir);
    night = smoothstep(0.22, 0.5, t) * (1 - smoothstep(0.84, 0.97, t));

    // Key light: sun while it is up, moon at night; direction blends while both are dim.
    const sunI = 2.8 * smoothstep(-0.05, 0.07, sunDir.y);
    const moonI = 1.25 * smoothstep(-0.03, 0.2, moonDir.y) * night;
    sunCol.copy(SUN_LOW).lerp(SUN_HIGH, smoothstep(0.02, 0.25, sunDir.y));
    if (t > 0.7) sunCol.lerp(SUN_DAWN, 0.5);
    lightDir(sunDir, 16 * DEG, sunL);
    lightDir(moonDir, 22 * DEG, moonL);
    const total = sunI + moonI + 1e-4;
    keyDir.copy(sunL).multiplyScalar(sunI).addScaledVector(moonL, moonI);
    keyDir.y += 0.05 * total;
    keyDir.normalize();
    sun.intensity = Math.max(sunI + moonI, 0.12);
    sun.color.copy(sunCol).multiplyScalar(sunI / total).add(tmpC.copy(MOON_LIGHT).multiplyScalar(moonI / total));

    hemi.color.copy(pal.hemiSky);
    hemi.groundColor.copy(pal.hemiGround);
    hemi.intensity = pal.hemiI;

    // Fog colours.
    fogUniforms.uFogColor.value.copy(pal.fog);
    fogUniforms.uFogHorizon.value.copy(pal.horizon);
    const moonVis = smoothstep(-0.02, 0.12, moonDir.y) * night;
    fogUniforms.uFogSunColor.value.copy(pal.glow).multiplyScalar(0.95 * pal.glowAmt)
      .add(tmpC.copy(MOON_LIGHT).multiplyScalar(0.22 * moonVis));
    const ws = pal.glowAmt + 1e-3, wm = moonVis * 0.6;
    fogUniforms.uFogSunDir.value.copy(sunDir).multiplyScalar(ws).addScaledVector(moonDir, wm).normalize();

    // Shared sky uniforms (dome, water, terrain).
    const U = skyUniforms;
    U.uSkyZenith.value.copy(pal.zenith);
    U.uSkyMid.value.copy(pal.mid);
    U.uSkyGlow.value.copy(pal.glow);
    U.uSkyGlowAmt.value = pal.glowAmt;
    U.uSunPos.value.copy(sunDir);
    U.uSunDisc.value.copy(SUN_DISC_LOW).lerp(SUN_DISC_HIGH, smoothstep(0.0, 0.3, sunDir.y))
      .multiplyScalar(smoothstep(-0.035, 0.01, sunDir.y));
    U.uMoonPos.value.copy(moonDir);
    U.uMoonDisc.value.copy(MOON_DISC).multiplyScalar(smoothstep(-0.03, 0.03, moonDir.y) * smoothstep(0.18, 0.4, t) * (1 - smoothstep(0.96, 1.0, t) * 0.6));
    U.uStars.value = pal.stars;
    U.uCloudLit.value.copy(pal.cloudLit);
    U.uCloudDark.value.copy(pal.cloudDark);
    U.uCloudCover.value = pal.cover;
    U.uKeyDir.value.copy(keyDir);
    U.uKeyColor.value.copy(sun.color).multiplyScalar(sun.intensity);
    U.uAmbSky.value.copy(pal.hemiSky).multiplyScalar(pal.hemiI);
    U.uAmbGround.value.copy(pal.hemiGround).multiplyScalar(pal.hemiI);
    U.uNight.value = night;

    exposure = pal.exposure * sky.exposureBias;
    renderer.toneMappingExposure = exposure;
    if (scene.background && scene.background.isColor) scene.background.copy(pal.horizon);
  }

  // Keep the shadow camera on the player, snapped to shadow-map texels (no shimmer).
  function placeKeyLight() {
    const p = ctx.player?.position || ctx.camera.position;
    focus.set(p.x, p.y, p.z);
    basis.z.copy(keyDir);
    basis.x.crossVectors(UP, basis.z);
    if (basis.x.lengthSq() < 1e-6) basis.x.set(1, 0, 0);
    basis.x.normalize();
    basis.y.crossVectors(basis.z, basis.x);
    const texel = (shadowHalf * 2) / (sun.shadow.mapSize.x || 1024);
    const fx = focus.dot(basis.x), fy = focus.dot(basis.y);
    focus.addScaledVector(basis.x, Math.round(fx / texel) * texel - fx);
    focus.addScaledVector(basis.y, Math.round(fy / texel) * texel - fy);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(keyDir, 140);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  }

  const sky = {
    sun,
    hemi,
    dome,
    autoAdvance: true,
    exposureBias: 1,
    get timeOfDay() { return tod; },
    set timeOfDay(v) { tween = null; tod = clamp(Number(v) || 0, 0, 1); apply(tod); },
    get night() { return night; },
    get sunDir() { return sunDir; },
    get moonDir() { return moonDir; },
    get keyDir() { return keyDir; },
    get exposure() { return exposure; },

    // Ease to `v` over `seconds` (0 = immediately).
    setTimeOfDay(v, seconds = 0) {
      const to = clamp(Number(v) || 0, 0, 1);
      if (!(seconds > 0)) { tween = null; tod = to; apply(tod); return; }
      tween = { from: tod, to, time: 0, dur: seconds };
    },

    update(dt, t) {
      skyUniforms.uSkyTime.value = t;
      if (engine.preset !== lastPreset) { lastPreset = engine.preset; applyShadowPreset(lastPreset); }
      if (tween) {
        tween.time += dt;
        const k = clamp(tween.time / tween.dur, 0, 1);
        tod = tween.from + (tween.to - tween.from) * easeInOut(k);
        if (k >= 1) tween = null;
      } else if (sky.autoAdvance && ctx.state?.mode === 'play' && tod < AUTO_END && dt > 0) {
        tod = Math.min(AUTO_END, tod + dt * (AUTO_END - AUTO_START) / AUTO_SECONDS);
      }
      apply(tod);
      placeKeyLight();
    },
  };

  // Resume the evening where a saved game left it.
  ctx.events?.on?.('game:start', ({ newGame } = {}) => {
    const prog = ctx.state?.progress;
    if (newGame || !prog) { sky.setTimeOfDay(AUTO_START, 0); return; }
    if (prog.finished || prog.quest === 'done') { sky.setTimeOfDay(1, 0); return; }
    const played = prog.playTime || 0;
    sky.setTimeOfDay(Math.min(AUTO_END, AUTO_START + (AUTO_END - AUTO_START) * (played / AUTO_SECONDS)), 0);
  });

  apply(tod);
  placeKeyLight();
  return sky;
}
