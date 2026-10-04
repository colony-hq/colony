// Cheap player feedback particles: dust puffs, water droplets, flare sparks (one Points draw
// call, kabut-aware shader) plus a small pool of expanding rings (splashes, flare shockwave).
// Owner: player.

import * as THREE from 'three';
import { FOG_GLSL, fogUniforms, patchMaterial } from '../world/fog.js';
import { glowTexture } from './charparts.js';

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
${FOG_GLSL.parsVertex}
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aAlpha > 0.0 ? aSize * uScale / max(0.2, -mvPosition.z) : 0.0;
  ${FOG_GLSL.vertex}
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
${FOG_GLSL.parsFragment}
void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
  if (a < 0.008) discard;
  gl_FragColor = vec4(vColor, a);
  ${FOG_GLSL.apply}
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createPlayerFX(ctx) {
  const { scene, engine } = ctx;
  const N = Math.round(64 + 96 * (engine.preset?.particles ?? 0.7));
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const alpha = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  const aSize = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  const aAlpha = new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos);
  geo.setAttribute('aColor', aCol);
  geo.setAttribute('aSize', aSize);
  geo.setAttribute('aAlpha', aAlpha);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...fogUniforms, uScale: { value: 400 }, uMap: { value: glowTexture() } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.name = 'player-fx';
  scene.add(points);

  // Particle state.
  const P = [];
  for (let i = 0; i < N; i++) P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 0.2, s1: 0.6, a0: 0.5, g: 0, drag: 1, r: 1, gc: 1, b: 1, fade: 1 });
  let cursor = 0;
  let alive = 0;
  function spawn(o) {
    const p = P[cursor];
    cursor = (cursor + 1) % N;
    Object.assign(p, o);
    p.life = o.max;
    alive = Math.max(alive, 1);
    return p;
  }

  // Ring pool.
  const ringGeo = new THREE.RingGeometry(0.86, 1, 48, 1);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 5; i++) {
    const m = patchMaterial(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(ringGeo, m);
    mesh.visible = false;
    mesh.renderOrder = 3;
    scene.add(mesh);
    rings.push({ mesh, t: 0, max: 1, r0: 0.3, r1: 2, a0: 0.5 });
  }
  const flareRingMat = patchMaterial(new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.4, 1.4, 0.55), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const flareRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 64, 1).rotateX(-Math.PI / 2), flareRingMat);
  flareRing.visible = false;
  flareRing.renderOrder = 4;
  scene.add(flareRing);
  let flareT = 9;

  function ring(x, y, z, r0, r1, dur, a0, color) {
    let best = rings[0];
    for (const r of rings) if (!r.mesh.visible || r.t / r.max > best.t / best.max) { best = r; if (!r.mesh.visible) break; }
    best.mesh.visible = true;
    best.mesh.position.set(x, y, z);
    best.t = 0; best.max = dur; best.r0 = r0; best.r1 = r1; best.a0 = a0;
    best.mesh.material.color.set(color ?? 0xffffff);
  }

  const fx = {
    points,
    // Ground dust puff (landing, sprint steps, slides).
    dust(x, y, z, strength = 1, color) {
      const n = Math.round(3 + 5 * strength);
      const c = color || DUST;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.6 + Math.random() * 1.4) * (0.6 + strength * 0.6);
        spawn({
          max: 0.55 + Math.random() * 0.45, x: x + Math.cos(a) * 0.15, y: y + 0.08, z: z + Math.sin(a) * 0.15,
          vx: Math.cos(a) * sp, vy: 0.3 + Math.random() * 0.6, vz: Math.sin(a) * sp,
          s0: 0.18 + 0.1 * strength, s1: 0.65 + 0.4 * strength, a0: 0.3 + 0.12 * strength, g: -0.4, drag: 3.2,
          r: c.r, gc: c.g, b: c.b, fade: 1,
        });
      }
    },
    // Water entry / wading splash.
    splash(x, y, z, strength = 1) {
      const n = Math.round(4 + 12 * Math.min(1.5, strength));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.8 + Math.random() * 2.2) * (0.5 + strength * 0.6);
        spawn({
          max: 0.5 + Math.random() * 0.45, x: x + Math.cos(a) * 0.2, y: y + 0.05, z: z + Math.sin(a) * 0.2,
          vx: Math.cos(a) * sp * 0.6, vy: 2 + Math.random() * 3.5 * Math.min(1.4, strength), vz: Math.sin(a) * sp * 0.6,
          s0: 0.09 + Math.random() * 0.06, s1: 0.05, a0: 0.75, g: 11, drag: 0.6,
          r: 0.78, gc: 0.88, b: 0.98, fade: 0.6,
        });
      }
      ring(x, y + 0.03, z, 0.3, 1.2 + strength * 1.6, 0.9 + strength * 0.3, 0.55);
      if (strength > 0.6) ring(x, y + 0.03, z, 0.2, 0.8 + strength, 0.7, 0.4);
    },
    // Small ripple (swimming wake, wading steps).
    ripple(x, y, z, r = 0.9) { ring(x, y + 0.03, z, 0.25, r, 0.8, 0.28); },
    // Lantern flare: warm sparks + horizontal shockwave.
    flare(x, y, z) {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const e = Math.random() * 0.9 - 0.2;
        const sp = 3 + Math.random() * 5;
        spawn({
          max: 0.5 + Math.random() * 0.6, x, y, z,
          vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 1.5, vz: Math.sin(a) * Math.cos(e) * sp,
          s0: 0.16, s1: 0.04, a0: 1, g: 2.5, drag: 1.6,
          r: 3.2, gc: 1.8, b: 0.6, fade: 0.8,
        });
      }
      flareRing.position.set(x, y - 0.25, z);
      flareRing.visible = true;
      flareT = 0;
    },

    update(dt) {
      // Point size scale (pixels per metre at 1 m).
      const cam = ctx.camera;
      const h = (engine.size?.h || window.innerHeight) * (engine.size?.pixelRatio || 1);
      mat.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      let any = false;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.life <= 0) { alpha[i] = 0; continue; }
        any = true;
        p.life -= dt;
        const k = 1 - Math.max(0, p.life) / p.max; // 0 -> 1
        const dr = Math.exp(-p.drag * dt);
        p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r; col[i * 3 + 1] = p.gc; col[i * 3 + 2] = p.b;
        size[i] = p.s0 + (p.s1 - p.s0) * k;
        alpha[i] = p.life > 0 ? p.a0 * (1 - Math.pow(k, 1 + p.fade)) * Math.min(1, k * 8 + 0.3) : 0;
      }
      if (any || alive) {
        aPos.needsUpdate = aCol.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = true;
        alive = any ? 1 : 0;
      }
      points.visible = any;
      for (const r of rings) {
        if (!r.mesh.visible) continue;
        r.t += dt;
        const k = r.t / r.max;
        if (k >= 1) { r.mesh.visible = false; continue; }
        const e = 1 - Math.pow(1 - k, 2.2);
        r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
        r.mesh.material.opacity = r.a0 * (1 - k) * (1 - k);
      }
      if (flareRing.visible) {
        flareT += dt;
        const k = flareT / 0.6;
        if (k >= 1) flareRing.visible = false;
        else {
          flareRing.scale.setScalar(0.5 + 11.5 * (1 - Math.pow(1 - k, 3)));
          flareRingMat.opacity = 0.6 * (1 - k) * (1 - k);
        }
      }
    },
  };
  return fx;
}

const DUST = { r: 0.46, g: 0.4, b: 0.34 };
