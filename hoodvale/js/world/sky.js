// Sky, day/night cycle and the whole lighting rig. Owner: world builder.
//
// API (DESIGN §5 + additions):
//   sun (DirectionalLight: the key light, moonlight at night), hemi (HemisphereLight),
//   torch (PointLight that follows the player: lantern at night, torch in dungeons),
//   hour (0..24), setHour(h), dayLength (real seconds per game day, default 1200), timeScale,
//   paused, night (0 day .. 1 deep night), phase ('dawn'|'day'|'dusk'|'night'), region (id),
//   inDungeon, uniforms (shared world uniforms), dome (Mesh),
//   addLight({x, y, z, color, intensity, distance, flicker, night, region}) -> source,
//   removeLight(source), update(dt).
// Events: 'sky:phase' {phase, hour} when the phase changes.
//
// Light count is constant (hemi + sun + torch + a small pool of PointLights) so materials never
// recompile at runtime; the pool is re-assigned to the nearest registered light sources
// (village lanterns at night, campfires, dungeon torches).

import * as THREE from 'three';
import { U } from './w-common.js';

// Keyframes: hour, zenith, horizon (= fog), sun glow, key colour, key intensity, hemi sky,
// hemi ground, hemi intensity, exposure, star visibility.
const KEYS = [
  [0.0, 0x0d1a3c, 0x2a3c62, 0x2a3050, 0xb8c8ff, 0.95, 0x8494cc, 0x2c2c3a, 1.25, 1.18, 1],
  [4.6, 0x0f1c40, 0x2e3c60, 0x3a3050, 0xb8c8ff, 0.85, 0x8494cc, 0x2c2c3a, 1.2, 1.16, 1],
  [5.6, 0x2a3c74, 0xc98a72, 0xff9a6a, 0xffa070, 0.55, 0x8e94bc, 0x3a3030, 0.85, 1.04, 0.4],
  [6.6, 0x5480c4, 0xf2b98e, 0xffb27a, 0xffbe88, 1.7, 0xb9c3dc, 0x5a4a38, 0.95, 1.0, 0],
  [8.0, 0x5a94da, 0xc9deec, 0xffe6c0, 0xfff0d8, 2.55, 0xd2e3ff, 0x6a5a3e, 1.08, 1.0, 0],
  [12.0, 0x4a8ae2, 0xcfe5f3, 0xfff2dc, 0xfff7ea, 2.9, 0xdae9ff, 0x6e5e40, 1.12, 1.0, 0],
  [16.0, 0x5390da, 0xd2e1ea, 0xffe8c8, 0xfff0d6, 2.65, 0xd4e2fa, 0x6e5a3e, 1.08, 1.0, 0],
  [17.7, 0x4a72ba, 0xf0b47e, 0xffb070, 0xffb878, 1.9, 0xc4bccc, 0x5e4a36, 0.98, 1.0, 0],
  [18.6, 0x2e3c7a, 0xde7a56, 0xff7a48, 0xff9058, 0.8, 0x9290b8, 0x3a3030, 0.88, 1.02, 0.2],
  [19.6, 0x16234e, 0x4a4066, 0x6a4060, 0xb8c8ff, 0.75, 0x8494cc, 0x2c2c3a, 1.15, 1.14, 0.8],
  [21.0, 0x0d1a3c, 0x2a3c62, 0x2a3050, 0xb8c8ff, 0.95, 0x8494cc, 0x2c2c3a, 1.25, 1.18, 1],
];

const DUNGEON_RIG = {
  warrens: { fog: 0x161009, near: 7, far: 38, hemiSky: 0xb09070, hemiGround: 0x3a2a1a, hemiI: 1.25, key: 0xffd8b0, keyI: 0.9, torch: 0xffae5c, torchI: 30 },
  vault: { fog: 0x0e1018, near: 7, far: 40, hemiSky: 0x9aa2b8, hemiGround: 0x2a2620, hemiI: 1.2, key: 0xd0dcff, keyI: 0.85, torch: 0xffbf70, torchI: 28 },
  lair: { fog: 0x220c06, near: 6, far: 36, hemiSky: 0xb06a48, hemiGround: 0x3a140a, hemiI: 1.25, key: 0xffa070, keyI: 0.9, torch: 0xff9a55, torchI: 28 },
};

const C = (h) => new THREE.Color(h);
const KEYC = KEYS.map((k) => ({
  h: k[0], zen: C(k[1]), hor: C(k[2]), glow: C(k[3]), key: C(k[4]), keyI: k[5], hs: C(k[6]), hg: C(k[7]), hI: k[8], exp: k[9], stars: k[10],
}));

const DOME_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const DOME_FRAG = /* glsl */`
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlowCol;
uniform vec3 uSunDirS;
uniform vec3 uMoonDir;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uTime;
uniform float uStars;
uniform float uSunVis;
uniform float uMoonVis;
uniform float uCover;
uniform sampler2D uNoise;
varying vec3 vDir;
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
  col = mix(col, uHorizon * 0.95, smoothstep(0.0, -0.25, h));
  float sd = dot(d, uSunDirS);
  float band = 1.0 - smoothstep(-0.05, 0.55, h);
  col += uGlowCol * pow(max(sd, 0.0), 5.0) * 0.55 * band;
  col += uGlowCol * pow(max(sd, 0.0), 48.0) * 0.5 * uSunVis;
  float disc = smoothstep(0.99935, 0.99965, sd) * uSunVis;
  col = mix(col, vec3(1.0, 0.95, 0.82) * 4.0, disc);
  float md = dot(d, uMoonDir);
  float mdisc = smoothstep(0.99905, 0.99935, md);
  vec3 off = normalize(uMoonDir + vec3(0.012, 0.006, 0.0));
  float shade = smoothstep(0.99925, 0.9996, dot(d, off));
  col = mix(col, vec3(0.86, 0.9, 1.0) * 1.7, mdisc * (1.0 - 0.7 * shade) * uMoonVis);
  col += vec3(0.45, 0.55, 0.9) * pow(max(md, 0.0), 300.0) * 0.5 * uMoonVis;
  if (uStars > 0.01 && h > 0.0) {
    vec3 p = d * 230.0;
    vec3 i = floor(p);
    float hs = h13(i);
    vec3 f = fract(p) - 0.5 - (vec3(h13(i + 1.3), h13(i + 2.7), h13(i + 5.1)) - 0.5) * 0.6;
    float star = smoothstep(0.1, 0.0, length(f)) * step(0.982, hs);
    float tw = 0.55 + 0.45 * sin(uTime * (1.5 + hs * 4.0) + hs * 60.0);
    vec3 sc = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), fract(hs * 13.0));
    col += sc * star * tw * uStars * smoothstep(0.0, 0.3, h) * 1.6;
  }
  if (h > -0.02) {
    vec2 uv = d.xz / (h + 0.1) * 0.09 + uTime * vec2(0.0021, 0.0011);
    float c = texture2D(uNoise, uv).r * 0.62 + texture2D(uNoise, uv * 2.7 + 0.37).g * 0.38;
    float cov = smoothstep(1.0 - uCover, 1.0 - uCover + 0.22, c);
    cov *= smoothstep(-0.02, 0.2, h);
    float sunSide = pow(max(sd, 0.0), 2.5);
    vec3 cc = mix(uCloudShade, uCloudLit, clamp((c - (1.0 - uCover)) * 3.0, 0.0, 1.0));
    cc += uGlowCol * sunSide * 0.35;
    col = mix(col, cc, cov * 0.88);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function lerpKeys(hour, out) {
  const n = KEYC.length;
  let i = 0;
  while (i < n - 1 && KEYC[i + 1].h <= hour) i++;
  const a = KEYC[i], b = KEYC[(i + 1) % n];
  const span = (b.h <= a.h ? b.h + 24 : b.h) - a.h;
  let t = span > 0 ? (hour - a.h) / span : 0;
  t = t * t * (3 - 2 * t);
  for (const k of ['zen', 'hor', 'glow', 'key', 'hs', 'hg']) out[k].copy(a[k]).lerp(b[k], t);
  for (const k of ['keyI', 'hI', 'exp', 'stars']) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export function createSky(ctx) {
  const { scene, engine, camera } = ctx;
  const preset0 = engine.preset;

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0xd8e8ff, 0x5a4a30, 1.1);
  hemi.name = 'sky:hemi';
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
  sun.name = 'sky:sun';
  sun.castShadow = !!preset0.shadows;
  const smSize = preset0.shadowMapSize || 1024;
  sun.shadow.mapSize.set(smSize, smSize);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2;
  Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 320 });
  scene.add(hemi, sun, sun.target);

  const torch = new THREE.PointLight(0xffb060, 0, 14, 1.6);
  torch.name = 'sky:torch';
  scene.add(torch);
  const poolSize = preset0.name === 'high' ? 4 : preset0.name === 'medium' ? 3 : 2;
  const pool = [];
  for (let i = 0; i < poolSize; i++) {
    const l = new THREE.PointLight(0xffa050, 0, 10, 1.7);
    l.name = 'sky:pool' + i;
    l.userData.src = null;
    scene.add(l);
    pool.push(l);
  }

  // ---- fog + dome ----
  scene.fog = new THREE.Fog(0xc4dbea, 70, 260);
  scene.background = new THREE.Color(0xc4dbea);
  const domeU = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlowCol: { value: new THREE.Color() },
    uSunDirS: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
    uTime: U.uTime, uStars: { value: 0 }, uSunVis: { value: 1 }, uMoonVis: { value: 0 }, uCover: { value: 0.42 }, uNoise: U.uNoise,
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 32, 16),
    new THREE.ShaderMaterial({ uniforms: domeU, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  dome.name = 'sky:dome';
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  scene.add(dome);

  // ---- state ----
  const K = { zen: new THREE.Color(), hor: new THREE.Color(), glow: new THREE.Color(), key: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), keyI: 0, hI: 0, exp: 1, stars: 0 };
  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), keyDir = new THREE.Vector3();
  const tmpV = new THREE.Vector3(), tmpC = new THREE.Color();
  const sources = [];
  const focus = { x: 186, z: 252 };
  let frame = 0;
  let lastPhase = '';
  let dungeonBlend = 0;

  function sunPath(hour, out) {
    const th = ((hour - 6) / 12) * Math.PI;
    return out.set(Math.cos(th), Math.sin(th) * 0.92, 0.38 + 0.22 * Math.sin(th)).normalize();
  }

  // Shadow camera follows the target with texel snapping (no shimmering while walking).
  const lightRot = new THREE.Matrix4(), lightRotInv = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0), origin = new THREE.Vector3();
  function placeKeyLight(tx, ty, tz, dir, half) {
    lightRot.lookAt(origin, tmpV.copy(dir).negate(), Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : up);
    lightRotInv.copy(lightRot).invert();
    const size = sun.shadow.mapSize.x || 1024;
    const texel = (2 * half) / size;
    const p = tmpV.set(tx, ty, tz).applyMatrix4(lightRotInv);
    p.x = Math.round(p.x / texel) * texel;
    p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(lightRot);
    sun.target.position.copy(p);
    sun.position.copy(p).addScaledVector(dir, 150);
    sun.target.updateMatrixWorld();
    const cam = sun.shadow.camera;
    if (cam.right !== half) {
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
      cam.updateProjectionMatrix();
    }
  }

  function syncPreset() {
    const p = engine.preset;
    const want = !!p.shadows;
    if (sun.castShadow !== want) sun.castShadow = want;
    const size = p.shadowMapSize || 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  }

  const sky = {
    sun, hemi, torch, dome, pool, uniforms: U,
    hour: 9.5, dayLength: 1200, timeScale: 1, paused: false,
    night: 0, phase: 'day', region: 'overworld', inDungeon: false,
    setHour(h) { sky.hour = ((Number(h) % 24) + 24) % 24; frame = 0; },
    addLight(src) {
      const s = {
        x: 0, y: 0, z: 0, intensity: 8, distance: 10, flicker: 0.15, night: false, region: 'overworld', ...src,
        color: src.color instanceof THREE.Color ? src.color : new THREE.Color(src.color ?? 0xffa050),
      };
      s.seed = Math.random() * 100;
      sources.push(s);
      return s;
    },
    removeLight(s) { const i = sources.indexOf(s); if (i >= 0) sources.splice(i, 1); },
    get sources() { return sources; },

    update(dt) {
      frame++;
      syncPreset();
      if (!sky.paused) sky.hour = (sky.hour + (dt * 24 * sky.timeScale) / sky.dayLength) % 24;
      U.uTime.value += dt;
      const t = U.uTime.value;

      // Where are we? (player region; camera look point otherwise)
      const p = ctx.player?.pos;
      const playing = p && ctx.state?.mode !== 'login' && ctx.state?.mode !== 'loading' && ctx.cameraRig?.mode !== 'debug';
      let fx, fy, fz;
      if (playing) { fx = p.x; fy = p.y; fz = p.z; }
      else {
        camera.getWorldDirection(tmpV);
        const d = camera.position.y > 2 && tmpV.y < -0.05 ? Math.min(90, (camera.position.y - 2) / -tmpV.y) : 30;
        fx = camera.position.x + tmpV.x * d; fz = camera.position.z + tmpV.z * d;
        fy = ctx.map.heightAt(fx, fz);
      }
      focus.x = fx; focus.z = fz;
      const region = ctx.map.regionAt(fx, fz).id !== 'overworld' ? ctx.map.regionAt(fx, fz).id : ctx.map.regionAt(camera.position.x, camera.position.z).id;
      if (region !== sky.region) {
        sky.region = region;
        sky.inDungeon = region !== 'overworld';
        frame = 0;
        ctx.events?.emit?.('sky:region', { region });
      }
      dungeonBlend = sky.inDungeon ? 1 : 0;

      // ---- time of day ----
      lerpKeys(sky.hour, K);
      sunPath(sky.hour, sunDir);
      sunPath((sky.hour + 12) % 24, moonDir);
      moonDir.x *= -0.6; moonDir.normalize();
      const sunUp = sunDir.y;
      const useSun = sunUp > -0.02;
      keyDir.copy(useSun ? sunDir : moonDir);
      if (keyDir.y < 0.12) { keyDir.y = 0.12; keyDir.normalize(); }
      const night = 1 - smoothstep(-0.12, 0.12, sunUp);
      sky.night = night;
      const phase = night > 0.85 ? 'night' : sunUp < 0.25 ? (sky.hour < 12 ? 'dawn' : 'dusk') : 'day';
      if (phase !== lastPhase) { lastPhase = phase; sky.phase = phase; ctx.events?.emit?.('sky:phase', { phase, hour: sky.hour }); }

      const pr = engine.preset;
      const fogFar = Math.max(230, Math.min(560, (pr.drawDistance || 480) * 0.85));
      let half = pr.name === 'high' ? 34 : 26;

      if (!sky.inDungeon) {
        dome.visible = true;
        domeU.uZenith.value.copy(K.zen);
        domeU.uHorizon.value.copy(K.hor);
        domeU.uGlowCol.value.copy(K.glow);
        domeU.uSunDirS.value.copy(sunDir);
        domeU.uMoonDir.value.copy(moonDir);
        domeU.uStars.value = K.stars;
        domeU.uSunVis.value = smoothstep(-0.06, 0.04, sunUp);
        domeU.uMoonVis.value = smoothstep(-0.05, 0.08, moonDir.y) * (0.3 + 0.7 * night);
        domeU.uCloudLit.value.copy(K.hor).lerp(tmpC.setRGB(1, 1, 1), 0.55 * (1 - night)).multiplyScalar(1 - 0.55 * night);
        domeU.uCloudShade.value.copy(K.zen).lerp(K.hor, 0.5).multiplyScalar(0.78);
        domeU.uCover.value = 0.4 + 0.08 * Math.sin(t * 0.01);
        scene.fog.color.copy(K.hor);
        scene.fog.near = fogFar * (0.32 - 0.08 * night);
        scene.fog.far = fogFar * (1 - 0.15 * night);
        if (scene.background?.isColor) scene.background.copy(K.hor);
        hemi.color.copy(K.hs); hemi.groundColor.copy(K.hg); hemi.intensity = K.hI;
        sun.color.copy(K.key);
        sun.intensity = K.keyI * smoothstep(0.02, 0.16, useSun ? sunUp : moonDir.y + 0.1);
        engine.renderer.toneMappingExposure = K.exp;
        // player lantern at night
        torch.color.setHex(0xffb468);
        torch.intensity = 9 * smoothstep(0.35, 0.9, night);
        torch.distance = 11;
        torch.decay = 1.6;
        U.uNight.value = night;
        U.uDay.value = 1 - night;
        U.uCloudShadow.value = 0.2;
        U.uGlow.value = 1;
      } else {
        const R = DUNGEON_RIG[sky.region] || DUNGEON_RIG.warrens;
        dome.visible = false;
        scene.fog.color.setHex(R.fog);
        scene.fog.near = R.near; scene.fog.far = R.far;
        if (scene.background?.isColor) scene.background.setHex(R.fog);
        hemi.color.setHex(R.hemiSky); hemi.groundColor.setHex(R.hemiGround); hemi.intensity = R.hemiI;
        sun.color.setHex(R.key); sun.intensity = R.keyI;
        keyDir.set(0.45, 0.75, 0.6).normalize();
        engine.renderer.toneMappingExposure = 1.12;
        const fl = 1 + 0.06 * Math.sin(t * 9.1) + 0.05 * Math.sin(t * 13.7 + 1.3);
        torch.color.setHex(R.torch);
        torch.intensity = R.torchI * fl;
        torch.distance = 18;
        torch.decay = 1.5;
        half = 22;
        U.uNight.value = 1;
        U.uDay.value = 0;
        U.uCloudShadow.value = 0;
        U.uGlow.value = 1;
      }
      U.uSunDir.value.copy(keyDir);
      U.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity);
      U.uSkyColor.value.copy(sky.inDungeon ? scene.fog.color : K.zen);
      U.uHorizon.value.copy(scene.fog.color);
      U.uAmbient.value.copy(hemi.color).multiplyScalar(hemi.intensity);
      U.uWind.value = 0.8 + 0.4 * Math.sin(t * 0.13) + 0.2 * Math.sin(t * 0.41);

      dome.position.copy(camera.position);
      dome.updateMatrixWorld();

      placeKeyLight(fx, fy, fz, keyDir, half);
      if (playing) torch.position.set(p.x, p.y + 2.6, p.z);
      else torch.position.set(fx, fy + 2.6, fz);

      // ---- pooled point lights: nearest active sources ----
      if (frame % 12 === 1) {
        const cands = [];
        for (const s of sources) {
          if ((s.region || 'overworld') !== sky.region) continue;
          if (s.night && !sky.inDungeon && night < 0.05) continue;
          const d = Math.hypot(s.x - fx, s.z - fz);
          if (d > 70) continue;
          cands.push([d, s]);
        }
        cands.sort((a, b) => a[0] - b[0]);
        for (let i = 0; i < pool.length; i++) pool[i].userData.src = cands[i] ? cands[i][1] : null;
      }
      for (const l of pool) {
        const s = l.userData.src;
        if (!s) { l.intensity = 0; continue; }
        const nk = s.night && !sky.inDungeon ? smoothstep(0.05, 0.6, night) : 1;
        const fl = 1 + s.flicker * (Math.sin(t * 8.3 + s.seed) * 0.6 + Math.sin(t * 13.1 + s.seed * 2.1) * 0.4);
        l.position.set(s.x, s.y, s.z);
        l.color.copy(s.color);
        l.intensity = s.intensity * nk * fl;
        l.distance = s.distance;
      }
    },
  };
  sky.update(0);
  return sky;
}

function smoothstep(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
