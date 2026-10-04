// Shared gameplay VFX + timing helpers (owner: gameplay).
// Created once by flames.js and exposed as ctx.flames.fx so checkpoints / spirits / quest / finale
// share one scheduler, one bloom manager, one fire-light pool and one particle pool.
//
//   fx.after(sec, fn) / fx.wait(sec)        sim-time scheduler (pauses with the game)
//   fx.tween(sec, fn(k), done)              per-frame tween, k 0..1
//   fx.bloomPulse(amount, sec)              additive bloom spike on top of the base strength
//   fx.fade(on, sec)                        #fade overlay (CSS, real time)
//   fx.shake(strength, duration)            camera:shake event
//   fx.lights                               pooled PointLights for fires (≤ 4, no shader recompiles)
//   fx.burst(opts) / fx.smoke(opts)         GPU particle bursts (additive / alpha)
//   fx.ring(opts)                           expanding ground ring of light
//   fx.flash(pos, color, intensity, sec)    short light flash through the light pool

import * as THREE from 'three';
import { FOG_GLSL, fogUniforms } from '../world/fog.js';
import { clamp, damp } from '../core/math.js';

// ---------------------------------------------------------------------------------------------
// GLSL helpers
// ---------------------------------------------------------------------------------------------
export const NOISE_GLSL = /* glsl */ `
float lhHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float lhNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lhHash(i), lhHash(i + vec2(1.0, 0.0)), u.x),
             mix(lhHash(i + vec2(0.0, 1.0)), lhHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float lhFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * lhNoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s / 0.9375;
}
float lhFbm3(vec2 p) {
  float s = 0.5 * lhNoise(p);
  p = p * 2.03 + vec2(1.7, 9.2);
  s += 0.25 * lhNoise(p);
  p = p * 2.03 + vec2(1.7, 9.2);
  s += 0.125 * lhNoise(p);
  return s / 0.875;
}
`;

// ShaderMaterial with the kabut wired in. The vertex shader must declare `vec4 mvPosition`
// (view space) and contain the token `#include <lentera_fog_vertex>` after it, OR assign
// `vLenteraWorld` itself. The fragment shader must contain `#include <lentera_fog_fragment>`
// at the end; it scales the colour by (1 - fog * uFogMix) (additive/premultiplied) or mixes
// toward the fog colour (mode 'alpha').
export function fxMaterial({ uniforms = {}, vertexShader, fragmentShader, blending = 'additive', fogMix = 1, side = THREE.FrontSide, depthTest = true }) {
  const fogApply = blending === 'alpha'
    ? `{ vec2 lfg = lenteraFog(vLenteraWorld); gl_FragColor.rgb = mix(gl_FragColor.rgb, lenteraFogColor(vLenteraWorld, lfg), lfg.x * uFogMix); }`
    : `gl_FragColor.rgb *= 1.0 - lenteraFog(vLenteraWorld).x * uFogMix;`;
  const vs = FOG_GLSL.parsVertex + '\n' + vertexShader.replace('#include <lentera_fog_vertex>', FOG_GLSL.vertex);
  const fs = FOG_GLSL.parsFragment + '\nuniform float uFogMix;\n' + NOISE_GLSL + '\n' + fragmentShader.replace('#include <lentera_fog_fragment>', fogApply);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...fogUniforms, uFogMix: { value: fogMix }, ...uniforms },
    vertexShader: vs,
    fragmentShader: fs,
    transparent: true,
    depthWrite: false,
    depthTest,
    side,
  });
  if (blending === 'additive') mat.blending = THREE.AdditiveBlending;
  else if (blending === 'premultiplied') {
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation;
    mat.blendSrc = THREE.OneFactor;
    mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  } else mat.blending = THREE.NormalBlending;
  mat.userData.lenteraFog = true; // fog handled in-shader: patchObject must skip it
  return mat;
}

// Pixel scale for gl_PointSize = size_world * scale / depth.
export function pointScale(ctx) {
  const cam = ctx.camera;
  const s = ctx.engine.size;
  return (s.h * (s.pixelRatio || 1)) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
}

// ---------------------------------------------------------------------------------------------
// Light pool: N PointLights created once (constant light count = no shader recompiles), assigned
// every frame to the most relevant registered sources (intensity x priority, faded by distance).
// ---------------------------------------------------------------------------------------------
function createLightPool(ctx, count) {
  const slots = [];
  for (let i = 0; i < count; i++) {
    const light = new THREE.PointLight(0xff9a48, 0, 14, 1.7);
    light.castShadow = false;
    light.name = 'fire-light-' + i;
    ctx.scene.add(light);
    slots.push({ light, src: null, fade: 0 });
  }
  const sources = new Set();
  const FADE_NEAR = 34, FADE_FAR = 72;
  const tmp = [];

  function effective(src, cam) {
    if (!src.enabled || src.intensity <= 0.001) return 0;
    const d = cam.distanceTo(src.position);
    const k = 1 - clamp((d - FADE_NEAR) / (FADE_FAR - FADE_NEAR), 0, 1);
    return src.intensity * k * k;
  }

  return {
    count,
    // src: { position: Vector3, color: Color, intensity, distance, decay, priority, enabled }
    add(src) {
      const s = { color: new THREE.Color(0xff9a48), intensity: 1, distance: 14, decay: 1.7, priority: 1, enabled: true, ...src };
      sources.add(s);
      return s;
    },
    remove(src) { sources.delete(src); },
    update(dt) {
      const cam = ctx.camera.position;
      tmp.length = 0;
      for (const s of sources) {
        const e = effective(s, cam);
        if (e > 0.002) { s._eff = e; s._score = e * s.priority; tmp.push(s); }
      }
      tmp.sort((a, b) => b._score - a._score);
      const chosen = new Set(tmp.slice(0, count));
      // Keep stable assignments, then fill free slots.
      for (const sl of slots) if (sl.src && !chosen.has(sl.src)) sl.src = null;
      for (const sl of slots) if (sl.src) chosen.delete(sl.src);
      for (const sl of slots) {
        if (sl.src) continue;
        const next = chosen.values().next();
        if (next.done) break;
        sl.src = next.value;
        chosen.delete(sl.src);
        sl.fade = 0;
      }
      for (const sl of slots) {
        const L = sl.light;
        if (!sl.src) { L.intensity = damp(L.intensity, 0, 14, dt); continue; }
        sl.fade = Math.min(1, sl.fade + dt * 4);
        L.position.copy(sl.src.position);
        L.color.copy(sl.src.color);
        L.distance = sl.src.distance;
        L.decay = sl.src.decay;
        L.intensity = sl.src._eff * sl.fade;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Particle bursts: one Points draw call per pool; positions are analytic in the vertex shader
// (origin + drag-integrated velocity + gravity), so the CPU only writes when emitting.
// ---------------------------------------------------------------------------------------------
function createParticlePool(ctx, { capacity, blending }) {
  const geo = new THREE.BufferGeometry();
  const origin = new Float32Array(capacity * 3);
  const vel = new Float32Array(capacity * 3);
  const color = new Float32Array(capacity * 4); // rgb + alpha
  const timing = new Float32Array(capacity * 2).fill(-1000); // start, life
  const params = new Float32Array(capacity * 4); // size, gravity, drag, grow
  geo.setAttribute('position', new THREE.BufferAttribute(origin, 3)); // origin doubles as position
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 4));
  geo.setAttribute('aTiming', new THREE.BufferAttribute(timing, 2));
  geo.setAttribute('aParams', new THREE.BufferAttribute(params, 4));
  for (const a of Object.values(geo.attributes)) a.setUsage(THREE.DynamicDrawUsage);
  const additive = blending === 'additive';
  const mat = fxMaterial({
    blending: additive ? 'additive' : 'alpha',
    fogMix: additive ? 0.8 : 0.9,
    uniforms: { uTime: { value: 0 }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uScale;
      attribute vec3 aVel;
      attribute vec4 aColor;
      attribute vec2 aTiming;
      attribute vec4 aParams;
      varying vec4 vColor;
      varying float vK;
      void main() {
        float age = uTime - aTiming.x;
        float k = age / max(aTiming.y, 0.001);
        if (k < 0.0 || k > 1.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        float drag = aParams.z;
        float travel = drag > 0.001 ? (1.0 - exp(-drag * age)) / drag : age;
        vec3 p = position + aVel * travel;
        p.y -= 0.5 * aParams.y * age * age;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        #include <lentera_fog_vertex>
        gl_Position = projectionMatrix * mvPosition;
        float size = aParams.x * mix(1.0, aParams.w, k);
        gl_PointSize = clamp(size * uScale / max(-mvPosition.z, 0.1), 0.0, 160.0);
        vColor = aColor;
        vK = k;
      }
    `,
    fragmentShader: additive ? /* glsl */ `
      varying vec4 vColor;
      varying float vK;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float d = dot(q, q);
        if (d > 1.0) discard;
        float a = exp(-d * 3.2) * (1.0 - vK) * (1.0 - vK) * vColor.a;
        gl_FragColor = vec4(vColor.rgb * a, 1.0);
        #include <lentera_fog_fragment>
      }
    ` : /* glsl */ `
      varying vec4 vColor;
      varying float vK;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float d = dot(q, q);
        if (d > 1.0) discard;
        float n = lhNoise(gl_PointCoord * 3.0 + vK * 2.0);
        float a = (1.0 - smoothstep(0.2, 1.0, d)) * smoothstep(0.0, 0.12, vK) * (1.0 - vK) * vColor.a * (0.7 + 0.3 * n);
        gl_FragColor = vec4(vColor.rgb, a);
        #include <lentera_fog_fragment>
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 6 : 5;
  points.name = additive ? 'fx-sparks' : 'fx-smoke';
  ctx.scene.add(points);
  let head = 0;
  let dirty = false;

  return {
    points,
    capacity,
    emit(now, o) {
      const i = head;
      head = (head + 1) % capacity;
      origin[i * 3] = o.x; origin[i * 3 + 1] = o.y; origin[i * 3 + 2] = o.z;
      vel[i * 3] = o.vx || 0; vel[i * 3 + 1] = o.vy || 0; vel[i * 3 + 2] = o.vz || 0;
      color[i * 4] = o.r; color[i * 4 + 1] = o.g; color[i * 4 + 2] = o.b; color[i * 4 + 3] = o.a ?? 1;
      timing[i * 2] = now + (o.delay || 0); timing[i * 2 + 1] = o.life || 1;
      params[i * 4] = o.size || 0.2; params[i * 4 + 1] = o.gravity || 0; params[i * 4 + 2] = o.drag || 0; params[i * 4 + 3] = o.grow ?? 0.3;
      dirty = true;
    },
    update(now) {
      mat.uniforms.uTime.value = now;
      mat.uniforms.uScale.value = pointScale(ctx);
      if (dirty) {
        for (const a of Object.values(geo.attributes)) a.needsUpdate = true;
        dirty = false;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Ground rings: expanding band of light (flare pulse, campfire reveal, socket ignition).
// ---------------------------------------------------------------------------------------------
function createRingPool(ctx, count = 5) {
  const geo = new THREE.PlaneGeometry(2, 2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < count; i++) {
    const mat = fxMaterial({
      blending: 'additive',
      fogMix: 0.7,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(1, 0.7, 0.3) },
        uRadius: { value: 1 },
        uWidth: { value: 0.6 },
        uAlpha: { value: 0 },
        uFill: { value: 0.15 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() {
          vP = position.xz;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          #include <lentera_fog_vertex>
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uRadius, uWidth, uAlpha, uFill, uTime;
        varying vec2 vP;
        void main() {
          float d = length(vP) * uRadius * 1.15;
          float ang = atan(vP.y, vP.x);
          float n = lhNoise(vec2(ang * 6.0, uTime * 2.0));
          float band = exp(-pow((d - uRadius) / max(uWidth, 0.01), 2.0));
          float fill = uFill * smoothstep(uRadius, 0.0, d) * smoothstep(uRadius * 1.02, uRadius * 0.6, d);
          float a = (band * (0.75 + 0.5 * n) + fill) * uAlpha;
          if (a < 0.002) discard;
          gl_FragColor = vec4(uColor * a, 1.0);
          #include <lentera_fog_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    mesh.name = 'fx-ring';
    ctx.scene.add(mesh);
    rings.push({ mesh, mat, active: false });
  }
  return rings;
}

// ---------------------------------------------------------------------------------------------
// Light shells: expanding fresnel bubble (flare pulse, finale shockwave). Terrain-agnostic.
// ---------------------------------------------------------------------------------------------
function createShellPool(ctx, count = 3) {
  const geo = new THREE.SphereGeometry(1, 36, 18);
  const shells = [];
  for (let i = 0; i < count; i++) {
    const mat = fxMaterial({
      blending: 'additive',
      fogMix: 0.5,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(1, 0.85, 0.6) }, uAlpha: { value: 0 }, uTime: { value: 0 }, uPow: { value: 2.5 } },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vView;
        varying vec3 vObj;
        void main() {
          vObj = position;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vView = normalize(-mvPosition.xyz);
          #include <lentera_fog_vertex>
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uAlpha, uTime, uPow;
        varying vec3 vN;
        varying vec3 vView;
        varying vec3 vObj;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), uPow);
          float n = lhNoise(vec2(atan(vObj.z, vObj.x) * 5.0, vObj.y * 4.0 - uTime * 3.0));
          float a = rim * (0.7 + 0.6 * n) * uAlpha;
          if (a < 0.002) discard;
          gl_FragColor = vec4(uColor * a, 1.0);
          #include <lentera_fog_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 13;
    mesh.name = 'fx-shell';
    ctx.scene.add(mesh);
    shells.push({ mesh, mat, active: false });
  }
  return shells;
}

// ---------------------------------------------------------------------------------------------
export function createFx(ctx) {
  const preset = ctx.engine.preset || {};
  const P = clamp(preset.particles ?? 1, 0.2, 1);
  const lightCount = preset.name === 'low' ? 2 : preset.name === 'medium' ? 3 : 4;
  const lights = createLightPool(ctx, lightCount);
  const sparks = createParticlePool(ctx, { capacity: Math.round(900 * P) + 200, blending: 'additive' });
  const smokePool = createParticlePool(ctx, { capacity: Math.round(260 * P) + 60, blending: 'alpha' });
  const rings = createRingPool(ctx, 5);
  const shells = createShellPool(ctx, 3);

  let now = 0;
  const timers = [];
  const tweens = [];
  const pulses = [];
  const flashes = [];
  let bloomBase = null;
  let lastBloom = null;
  const fadeEl = typeof document !== 'undefined' ? document.getElementById('fade') : null;
  const _c = new THREE.Color();

  const fx = {
    particleScale: P,
    lights,
    get now() { return now; },

    after(sec, fn) { timers.push({ at: now + Math.max(0, sec), fn }); },
    wait(sec) { return new Promise((r) => fx.after(sec, r)); },
    tween(sec, fn, done) {
      const tw = { t: 0, dur: Math.max(1e-3, sec), fn, done, dead: false };
      tweens.push(tw);
      try { fn(0); } catch (err) { console.error('[fx] tween', err); }
      return { cancel() { tw.dead = true; } };
    },

    // Bloom spike on top of the engine's base strength. amount ~0.5 (small) .. 3 (finale).
    bloomPulse(amount, sec = 1.2, attack = 0.08) {
      pulses.push({ amount, t: 0, dur: Math.max(sec, attack + 0.05), attack });
    },
    setBloomBase(v) { bloomBase = v; },

    // Full-screen fade overlay (#fade). Returns a promise (real time).
    fade(on, sec = 0.6) {
      if (!fadeEl) return Promise.resolve();
      if (sec <= 0) {
        fadeEl.style.transition = 'none';
        fadeEl.classList.toggle('on', on);
        void fadeEl.offsetWidth;
        fadeEl.style.transition = '';
        return Promise.resolve();
      }
      fadeEl.style.transition = `opacity ${sec}s ease`;
      void fadeEl.offsetWidth;
      fadeEl.classList.toggle('on', on);
      return new Promise((r) => setTimeout(() => { fadeEl.style.transition = ''; r(); }, sec * 1000));
    },

    shake(strength = 0.3, duration = 0.35) {
      ctx.events.emit('camera:shake', { strength, duration });
    },

    // Sparks: count particles around (x,y,z) with random velocities.
    // opts: { x,y,z, count, color, speed, up, spread, life, size, gravity, drag, grow, radius, delay }
    burst(o) {
      const count = Math.max(1, Math.round((o.count ?? 20) * (o.noScale ? 1 : P)));
      _c.set(o.color ?? 0xffc070);
      const hdr = o.hdr ?? 2.2;
      for (let i = 0; i < count; i++) {
        const th = Math.random() * Math.PI * 2;
        const u = o.sphere ? Math.random() * 2 - 1 : Math.random() * 0.9 + 0.1;
        const s = Math.sqrt(1 - u * u);
        const sp = (o.speed ?? 3) * (0.35 + Math.random() * 0.65);
        const rad = (o.radius ?? 0) * Math.sqrt(Math.random());
        const jit = o.jitter ?? 0.25;
        sparks.emit(now, {
          x: o.x + Math.cos(th) * rad, y: o.y + (Math.random() - 0.5) * (o.height ?? 0), z: o.z + Math.sin(th) * rad,
          vx: Math.cos(th) * s * sp * (o.spread ?? 1), vy: u * sp * (o.up ?? 1) + (o.lift ?? 0), vz: Math.sin(th) * s * sp * (o.spread ?? 1),
          r: _c.r * hdr * (1 - jit + Math.random() * jit), g: _c.g * hdr * (1 - jit + Math.random() * jit), b: _c.b * hdr,
          a: 1, life: (o.life ?? 1) * (0.6 + Math.random() * 0.4), size: (o.size ?? 0.18) * (0.6 + Math.random() * 0.6),
          gravity: o.gravity ?? 0, drag: o.drag ?? 1.5, grow: o.grow ?? 0.2, delay: (o.delay ?? 0) + Math.random() * (o.stagger ?? 0),
        });
      }
    },
    // Single spark (trails).
    spark(o) {
      _c.set(o.color ?? 0xffc070);
      const hdr = o.hdr ?? 2.2;
      sparks.emit(now, { ...o, r: _c.r * hdr, g: _c.g * hdr, b: _c.b * hdr, a: o.a ?? 1 });
    },
    // Soft smoke puffs (alpha blended).
    smoke(o) {
      const count = Math.max(1, Math.round((o.count ?? 8) * P));
      _c.set(o.color ?? 0x6b6870);
      for (let i = 0; i < count; i++) {
        const th = Math.random() * Math.PI * 2;
        const sp = (o.speed ?? 0.8) * (0.4 + Math.random() * 0.6);
        smokePool.emit(now, {
          x: o.x + Math.cos(th) * (o.radius ?? 0.1), y: o.y, z: o.z + Math.sin(th) * (o.radius ?? 0.1),
          vx: Math.cos(th) * sp, vy: (o.up ?? 0.9) * (0.6 + Math.random() * 0.6), vz: Math.sin(th) * sp,
          r: _c.r, g: _c.g, b: _c.b, a: o.alpha ?? 0.5,
          life: (o.life ?? 1.6) * (0.7 + Math.random() * 0.5), size: (o.size ?? 0.6) * (0.7 + Math.random() * 0.6),
          gravity: -(o.buoyancy ?? 0.3), drag: o.drag ?? 1.2, grow: o.grow ?? 2.4, delay: Math.random() * (o.stagger ?? 0),
        });
      }
    },

    // Expanding ground ring. opts: { x, y, z, radius, duration, color, width, fill, intensity }
    ring(o) {
      const r = rings.find((q) => !q.active) || rings[0];
      r.active = true;
      r.t = 0;
      r.o = { radius: 12, duration: 1.2, width: 0.9, fill: 0.12, intensity: 1.6, ...o };
      r.mat.uniforms.uColor.value.set(r.o.color ?? 0xffb860);
      r.mat.uniforms.uWidth.value = r.o.width;
      r.mat.uniforms.uFill.value = r.o.fill;
      r.mesh.position.set(o.x, o.y + 0.08, o.z);
      r.mesh.visible = true;
      return r;
    },

    // Expanding light bubble. opts: { x, y, z, radius, duration, color, intensity, power, squash }
    shell(o) {
      const sh = shells.find((q) => !q.active) || shells[0];
      sh.active = true;
      sh.t = 0;
      sh.o = { radius: 12, duration: 0.9, intensity: 1.6, power: 2.5, squash: 1, ...o };
      sh.mat.uniforms.uColor.value.set(sh.o.color ?? 0xffd890);
      sh.mat.uniforms.uPow.value = sh.o.power;
      sh.mesh.position.set(o.x, o.y, o.z);
      sh.mesh.visible = true;
      return sh;
    },

    // Short light flash through the light pool (top priority).
    flash(pos, color = 0xffc070, intensity = 40, sec = 0.6, distance = 18) {
      const src = lights.add({ position: new THREE.Vector3().copy(pos), color: new THREE.Color(color), intensity, distance, priority: 6 });
      flashes.push({ src, base: intensity, t: 0, dur: sec });
    },

    update(dt) {
      now += dt;
      // Timers (copy: callbacks may schedule more).
      if (timers.length) {
        const due = [];
        for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= now) { due.push(timers[i]); timers.splice(i, 1); }
        due.sort((a, b) => a.at - b.at);
        for (const d of due) { try { d.fn(); } catch (err) { console.error('[fx] timer', err); } }
      }
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        if (tw.dead) { tweens.splice(i, 1); continue; }
        tw.t += dt;
        const k = Math.min(1, tw.t / tw.dur);
        try { tw.fn(k); } catch (err) { console.error('[fx] tween', err); tw.dead = true; }
        if (k >= 1) { tweens.splice(i, 1); try { tw.done?.(); } catch (err) { console.error('[fx] tween done', err); } }
      }
      // Bloom.
      const bp = ctx.engine.bloomPass;
      if (bp) {
        if (bloomBase == null) bloomBase = bp.strength;
        let add = 0;
        for (let i = pulses.length - 1; i >= 0; i--) {
          const p = pulses[i];
          p.t += dt;
          if (p.t >= p.dur) { pulses.splice(i, 1); continue; }
          const e = p.t < p.attack ? p.t / p.attack : Math.pow(1 - (p.t - p.attack) / (p.dur - p.attack), 2);
          add += p.amount * e;
        }
        const target = bloomBase + add;
        if (lastBloom === null || Math.abs(target - lastBloom) > 1e-3 || Math.abs(bp.strength - target) > 1e-3) {
          ctx.engine.setBloom(target);
          lastBloom = target;
        }
      } else pulses.length = 0;
      // Flash lights.
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.t += dt;
        const k = f.t / f.dur;
        if (k >= 1) { lights.remove(f.src); flashes.splice(i, 1); continue; }
        f.src.intensity = f.base * (k < 0.1 ? k / 0.1 : Math.pow(1 - (k - 0.1) / 0.9, 2));
      }
      // Rings.
      for (const r of rings) {
        if (!r.active) continue;
        r.t += dt;
        const k = Math.min(1, r.t / r.o.duration);
        const e = 1 - Math.pow(1 - k, 3);
        const rad = Math.max(0.05, r.o.radius * e);
        r.mesh.scale.setScalar(rad * 1.15);
        r.mat.uniforms.uRadius.value = rad;
        r.mat.uniforms.uAlpha.value = r.o.intensity * (1 - k) * Math.min(1, r.t * 12);
        r.mat.uniforms.uTime.value = now;
        if (k >= 1) { r.active = false; r.mesh.visible = false; }
      }
      for (const sh of shells) {
        if (!sh.active) continue;
        sh.t += dt;
        const k = Math.min(1, sh.t / sh.o.duration);
        const e = 1 - Math.pow(1 - k, 3);
        const rad = Math.max(0.05, sh.o.radius * e);
        sh.mesh.scale.set(rad, rad * sh.o.squash, rad);
        sh.mat.uniforms.uAlpha.value = sh.o.intensity * Math.pow(1 - k, 1.5) * Math.min(1, sh.t * 20);
        sh.mat.uniforms.uTime.value = now;
        if (k >= 1) { sh.active = false; sh.mesh.visible = false; }
      }
      sparks.update(now);
      smokePool.update(now);
      lights.update(dt);
    },
  };
  return fx;
}
