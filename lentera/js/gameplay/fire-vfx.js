// Fire VFX system (owner: gameplay). Every fire on the island (campfires, Api Pusaka, tungku,
// pelita, transfer motes) shares three draw calls:
//   1. flames  — instanced view-aligned quads, shader flame (scrolling fbm, teardrop body, tongues,
//                white-hot core, colour ramp), heat shimmer sway
//   2. glows   — instanced ground glow discs + soft camera-facing halos (fake light in the kabut)
//   3. embers  — one Points cloud; each fire owns a slice; motion is analytic in the vertex shader
// Optional PointLights come from fx.lights (pooled, ≤ 4 active, faded by camera distance).

import * as THREE from 'three';
import { fxMaterial, pointScale } from './fx.js';
import { damp, clamp } from '../core/math.js';

const DEFAULT_OUTER = new THREE.Color(0.95, 0.2, 0.03);
const DEFAULT_CORE = new THREE.Color(1.0, 0.55, 0.12);
const DEFAULT_LIGHT = new THREE.Color(0xff9440);

// Outer colour of a tinted flame: more saturated and darker than the base tint.
function tintOuter(base) {
  const hsl = {};
  base.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.25 + 0.2), Math.max(0.2, hsl.l * 0.55));
}

export function createFireSystem(ctx, fx, { maxFires = 40, maxGlows = 96 } = {}) {
  const P = fx.particleScale;
  const EMB = Math.max(6, Math.round(26 * P));

  // ---------------------------------------------------------------- flames (instanced quads)
  const quad = new THREE.PlaneGeometry(1, 1, 1, 1);
  const flameGeo = new THREE.InstancedBufferGeometry();
  flameGeo.index = quad.index;
  flameGeo.setAttribute('position', quad.getAttribute('position'));
  flameGeo.setAttribute('uv', quad.getAttribute('uv'));
  const fCenter = new Float32Array(maxFires * 3);
  const fSize = new Float32Array(maxFires * 4); // width, height, intensity, seed
  const fColA = new Float32Array(maxFires * 3);
  const fColB = new Float32Array(maxFires * 3);
  const fShape = new Float32Array(maxFires * 2); // tongues, sway
  const aShape = new THREE.InstancedBufferAttribute(fShape, 2).setUsage(THREE.DynamicDrawUsage);
  const aCenter = new THREE.InstancedBufferAttribute(fCenter, 3).setUsage(THREE.DynamicDrawUsage);
  const aSize = new THREE.InstancedBufferAttribute(fSize, 4).setUsage(THREE.DynamicDrawUsage);
  const aColA = new THREE.InstancedBufferAttribute(fColA, 3).setUsage(THREE.DynamicDrawUsage);
  const aColB = new THREE.InstancedBufferAttribute(fColB, 3).setUsage(THREE.DynamicDrawUsage);
  flameGeo.setAttribute('iCenter', aCenter);
  flameGeo.setAttribute('iSize', aSize);
  flameGeo.setAttribute('iColA', aColA);
  flameGeo.setAttribute('iColB', aColB);
  flameGeo.setAttribute('iShape', aShape);
  flameGeo.instanceCount = 0;

  const flameMat = fxMaterial({
    blending: 'premultiplied',
    fogMix: 0.82,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 iCenter;
      attribute vec4 iSize;
      attribute vec3 iColA;
      attribute vec3 iColB;
      attribute vec2 iShape;
      varying vec2 vUv;
      varying float vI;
      varying float vSeed;
      varying float vTongues;
      varying vec3 vColA;
      varying vec3 vColB;
      void main() {
        vUv = uv;
        vI = iSize.z;
        vSeed = iSize.w;
        vTongues = iShape.x;
        vColA = iColA;
        vColB = iColB;
        if (iSize.z < 0.003) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        vec4 c = viewMatrix * vec4(iCenter, 1.0);
        // Vertical axis = world up projected into the view plane (stays upright, shortens from above).
        vec3 upV = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0);
        float ul = length(upV.xy);
        vec2 up2 = ul > 1e-3 ? upV.xy / ul : vec2(0.0, 1.0);
        vec2 rt2 = vec2(up2.y, -up2.x);
        float I = iSize.z;
        float s = smoothstep(0.0, 0.5, I) * 0.6 + 0.4 * clamp(I, 0.0, 1.4);
        float h = iSize.y * s * mix(0.6, 1.0, ul);
        float w = iSize.x * mix(0.55, 1.0, clamp(s, 0.0, 1.0));
        vec2 off = rt2 * position.x * w + up2 * (position.y + 0.42) * h;
        vec4 mvPosition = vec4(c.xy + off, c.z, 1.0);
        // Pull slightly toward the camera so the flame isn't clipped by its own fire pit.
        mvPosition.xyz += normalize(-c.xyz) * 0.25 * iSize.x;
        #include <lentera_fog_vertex>
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vI;
      varying float vSeed;
      varying float vTongues;
      varying vec3 vColA;
      varying vec3 vColB;
      // Heat field of one flame tongue. p.x in tongue space (-1..1), p.y 0..1 of the quad.
      float tongue(vec2 p, float t, float seed, float hgt) {
        float y = p.y / hgt;
        if (y > 1.05) return 0.0;
        float n1 = lhFbm3(vec2(p.x * 1.4 + seed * 7.1, y * 2.0 - t * 2.3));
        float n2 = lhNoise(vec2(p.x * 3.8 - seed * 3.3, y * 5.0 - t * 4.8));
        float sway = sin(t * 1.9 + seed * 4.0) * 0.07 + sin(t * 3.7 + seed) * 0.04;
        float xd = p.x + ((n1 - 0.5) * 0.95 + sway) * pow(max(y, 0.0), 1.2);
        float hw = 0.72 * pow(max(1.0 - y, 0.0), 0.9) * sqrt(smoothstep(-0.03, 0.28, y));
        float body = 1.0 - smoothstep(hw * 0.2, hw + 0.03, abs(xd));
        float heat = body * (1.12 - y * 0.95) + (n2 - 0.5) * 0.5 * y + (n1 - 0.5) * 0.22;
        return heat * smoothstep(0.0, 0.06, y);
      }
      void main() {
        float t = uTime * 1.05 + vSeed * 13.7;
        float x = (vUv.x - 0.5) * 2.0;
        float y = vUv.y;
        float heat;
        if (vTongues > 1.5) {
          heat = tongue(vec2(x * 1.25, y), t, vSeed, 1.0);
          heat = max(heat, tongue(vec2((x + 0.46) * 1.9, y), t * 1.13, vSeed + 1.7, 0.7) * 0.92);
          heat = max(heat, tongue(vec2((x - 0.42) * 2.0, y), t * 0.91, vSeed + 3.1, 0.62) * 0.88);
          heat = max(heat, tongue(vec2((x - 0.08) * 2.6, y), t * 1.31, vSeed + 5.3, 0.45) * 0.8);
        } else {
          heat = tongue(vec2(x, y), t, vSeed, 1.0);
        }
        float alpha = smoothstep(0.05, 0.3, heat);
        vec3 hot = mix(vColB, vec3(1.0, 0.95, 0.85), 0.45);
        vec3 col = mix(vColA, vColB, smoothstep(0.2, 0.7, heat));
        col = mix(col, hot, smoothstep(0.72, 1.05, heat));
        // Dying fires turn to deep ember red.
        col = mix(vColA * vec3(0.9, 0.45, 0.4), col, smoothstep(0.08, 0.55, vI));
        float bright = 0.75 + 0.95 * smoothstep(0.6, 1.05, heat);
        float glow = exp(-x * x * 4.0) * smoothstep(1.0, 0.1, y) * smoothstep(0.0, 0.15, y) * 0.12;
        float k = min(vI, 1.6) * (alpha * bright + glow);
        if (k < 0.003) discard;
        // Premultiplied: the body partly occludes what is behind it so the hue survives bright
        // dusk fog; the hot core is mostly emission.
        float occl = alpha * (0.62 - 0.3 * smoothstep(0.6, 1.0, heat)) * clamp(vI * 1.5, 0.0, 1.0);
        float f = lenteraFog(vLenteraWorld).x * uFogMix;
        gl_FragColor = vec4(col * k * (1.0 - f), occl * (1.0 - f));
      }
    `,
  });
  const flameMesh = new THREE.Mesh(flameGeo, flameMat);
  flameMesh.frustumCulled = false;
  flameMesh.renderOrder = 8;
  flameMesh.name = 'fire-flames';
  ctx.scene.add(flameMesh);

  // ---------------------------------------------------------------- glows (discs + halos)
  const glowGeo = new THREE.InstancedBufferGeometry();
  glowGeo.index = quad.index;
  glowGeo.setAttribute('position', quad.getAttribute('position'));
  glowGeo.setAttribute('uv', quad.getAttribute('uv'));
  const gCenter = new Float32Array(maxGlows * 3);
  const gParams = new Float32Array(maxGlows * 4); // radius, intensity, mode (0 ground, 1 billboard), seed
  const gColor = new Float32Array(maxGlows * 3);
  const agCenter = new THREE.InstancedBufferAttribute(gCenter, 3).setUsage(THREE.DynamicDrawUsage);
  const agParams = new THREE.InstancedBufferAttribute(gParams, 4).setUsage(THREE.DynamicDrawUsage);
  const agColor = new THREE.InstancedBufferAttribute(gColor, 3).setUsage(THREE.DynamicDrawUsage);
  glowGeo.setAttribute('iCenter', agCenter);
  glowGeo.setAttribute('iParams', agParams);
  glowGeo.setAttribute('iColor', agColor);
  glowGeo.instanceCount = 0;
  const glowMat = fxMaterial({
    blending: 'additive',
    fogMix: 0.6,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 iCenter;
      attribute vec4 iParams;
      attribute vec3 iColor;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vI;
      varying float vMode;
      void main() {
        vUv = uv;
        vColor = iColor;
        vMode = iParams.z;
        float flick = 0.86 + 0.1 * sin(uTime * 11.0 + iParams.w * 31.0) + 0.06 * sin(uTime * 23.0 + iParams.w * 7.0);
        vI = iParams.y * flick;
        if (iParams.y < 0.002) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        vec4 mvPosition;
        if (iParams.z < 0.5) {
          vec3 wp = iCenter + vec3(position.x, 0.0, -position.y) * 2.0 * iParams.x;
          mvPosition = viewMatrix * vec4(wp, 1.0);
        } else {
          mvPosition = viewMatrix * vec4(iCenter, 1.0);
          mvPosition.xy += position.xy * 2.0 * iParams.x;
        }
        #include <lentera_fog_vertex>
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vI;
      varying float vMode;
      void main() {
        vec2 q = vUv * 2.0 - 1.0;
        float d2 = dot(q, q);
        if (d2 > 1.0) discard;
        float a = vMode < 0.5
          ? exp(-d2 * 3.5) * (1.0 - d2)
          : (exp(-d2 * 6.0) * 0.8 + exp(-d2 * 22.0) * 0.6) * (1.0 - d2);
        gl_FragColor = vec4(vColor * a * vI, 1.0);
        #include <lentera_fog_fragment>
      }
    `,
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.frustumCulled = false;
  glowMesh.renderOrder = 7;
  glowMesh.name = 'fire-glows';
  ctx.scene.add(glowMesh);

  // ---------------------------------------------------------------- embers (one Points cloud)
  const total = maxFires * EMB;
  const eGeo = new THREE.BufferGeometry();
  const eCenter = new Float32Array(total * 3);
  const eSeed = new Float32Array(total * 4);
  const eFire = new Float32Array(total * 4); // intensity, size scale, rise height, spread
  const eColor = new Float32Array(total * 3);
  for (let i = 0; i < total * 4; i++) eSeed[i] = Math.random();
  eGeo.setAttribute('position', new THREE.BufferAttribute(eCenter, 3).setUsage(THREE.DynamicDrawUsage));
  eGeo.setAttribute('aSeed', new THREE.BufferAttribute(eSeed, 4));
  eGeo.setAttribute('aFire', new THREE.BufferAttribute(eFire, 4).setUsage(THREE.DynamicDrawUsage));
  eGeo.setAttribute('aColor', new THREE.BufferAttribute(eColor, 3).setUsage(THREE.DynamicDrawUsage));
  const emberMat = fxMaterial({
    blending: 'additive',
    fogMix: 0.75,
    uniforms: { uTime: { value: 0 }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uScale;
      attribute vec4 aSeed;
      attribute vec4 aFire;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vA;
      void main() {
        float I = aFire.x;
        float alive = step(0.002, I) * step(aSeed.x, I * 1.4 + 0.08);
        if (alive < 0.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        float rise = aFire.z * (0.35 + 0.65 * min(I, 1.2));
        float speed = mix(0.28, 0.62, aSeed.y) * (0.6 + 0.4 * min(I, 1.0));
        float life = fract(uTime * speed + aSeed.z * 7.0);
        float ang = aSeed.w * 6.2831 + uTime * (aSeed.x - 0.5) * 2.2 + life * 2.5;
        float r = aFire.w * (0.15 + 0.85 * aSeed.y) * (0.25 + life * 1.1);
        vec3 p = position + vec3(cos(ang) * r, life * rise * (0.55 + 0.7 * aSeed.x), sin(ang) * r);
        p.x += sin(uTime * 2.3 + aSeed.z * 20.0) * 0.12 * life;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        #include <lentera_fog_vertex>
        gl_Position = projectionMatrix * mvPosition;
        float tw = 0.65 + 0.35 * sin(uTime * 18.0 + aSeed.w * 40.0);
        gl_PointSize = clamp(aFire.y * (0.045 + 0.05 * aSeed.w) * uScale / max(-mvPosition.z, 0.1), 0.0, 24.0);
        vA = (1.0 - life) * smoothstep(0.0, 0.06, life) * tw;
        vColor = mix(aColor, vec3(1.0, 0.18, 0.03), smoothstep(0.2, 0.9, life));
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vA;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float d = dot(q, q);
        if (d > 1.0) discard;
        float a = exp(-d * 3.0) * vA;
        gl_FragColor = vec4(vColor * a * 3.2, 1.0);
        #include <lentera_fog_fragment>
      }
    `,
  });
  const embers = new THREE.Points(eGeo, emberMat);
  embers.frustumCulled = false;
  embers.renderOrder = 9;
  embers.name = 'fire-embers';
  ctx.scene.add(embers);
  eGeo.setDrawRange(0, 0);

  // ---------------------------------------------------------------- bookkeeping
  const fires = new Array(maxFires).fill(null);
  const glows = new Array(maxGlows).fill(null);
  const tmpV = new THREE.Vector3();
  let flamesDirty = true, glowsDirty = true, embersDirty = true;

  function allocGlow(g) {
    const i = glows.indexOf(null);
    if (i < 0) return -1;
    glows[i] = g;
    g.slot = i;
    glowGeo.instanceCount = Math.max(glowGeo.instanceCount, i + 1);
    return i;
  }
  function freeGlow(g) {
    if (!g || g.slot < 0) return;
    gParams[g.slot * 4 + 1] = 0;
    glows[g.slot] = null;
    g.slot = -1;
    glowsDirty = true;
  }
  function writeGlow(g) {
    if (g.slot < 0) return;
    const i = g.slot;
    gCenter[i * 3] = g.position.x; gCenter[i * 3 + 1] = g.position.y; gCenter[i * 3 + 2] = g.position.z;
    gParams[i * 4] = g.radius; gParams[i * 4 + 1] = g.visible ? g.intensity : 0; gParams[i * 4 + 2] = g.mode; gParams[i * 4 + 3] = g.seed;
    gColor[i * 3] = g.color.r; gColor[i * 3 + 1] = g.color.g; gColor[i * 3 + 2] = g.color.b;
    glowsDirty = true;
  }

  // Free-standing glow sprite: { position, radius, intensity, color, mode: 'halo'|'ground' }.
  function addGlow(o = {}) {
    const g = {
      position: new THREE.Vector3().copy(o.position || tmpV.set(0, 0, 0)),
      radius: o.radius ?? 1,
      intensity: o.intensity ?? 1,
      color: new THREE.Color(o.color ?? 0xffa040),
      mode: o.mode === 'ground' ? 0 : 1,
      seed: Math.random(),
      visible: true,
      slot: -1,
      update() { writeGlow(g); },
      dispose() { freeGlow(g); },
    };
    allocGlow(g);
    writeGlow(g);
    return g;
  }

  // createFire({ position, scale, color, light, intensity, glow, halo, embers, lightIntensity,
  //              lightDistance, priority, height, parent })
  function createFire(opts = {}) {
    const slot = fires.indexOf(null);
    const scale = opts.scale ?? 1;
    const object = new THREE.Object3D();
    object.name = 'fire';
    if (opts.position) object.position.copy(opts.position);
    (opts.parent || ctx.scene).add(object);
    const tinted = opts.color != null;
    const base = new THREE.Color(opts.color ?? 0xffa040);
    const colA = tinted ? tintOuter(base) : DEFAULT_OUTER.clone();
    const colB = tinted ? base.clone().lerp(new THREE.Color(1, 1, 1), 0.12) : DEFAULT_CORE.clone();
    const lightColor = tinted ? base.clone() : DEFAULT_LIGHT.clone();
    const fire = {
      object,
      slot,
      scale,
      seed: Math.random(),
      target: opts.intensity ?? 1,
      intensity: opts.instant === false ? 0 : (opts.intensity ?? 1),
      width: (opts.width ?? (opts.tongues > 1 ? 1.5 : 0.9)) * scale,
      height: (opts.height ?? (opts.tongues > 1 ? 1.85 : 1.5)) * scale,
      tongues: opts.tongues ?? 1,
      colA, colB,
      world: new THREE.Vector3(),
      lastWorld: new THREE.Vector3(1e9, 0, 0),
      lastI: -1,
      visible: true,
      disposed: false,
      glowDisc: null,
      glowHalo: null,
      lightSrc: null,
      emberSpread: 0.28 * scale,
      emberRise: (opts.emberRise ?? 2.6) * scale,
      emberSize: (opts.emberSize ?? 1) * Math.sqrt(scale),
      setIntensity(v, instant = false) {
        fire.target = Math.max(0, v);
        if (instant) fire.intensity = fire.target;
      },
      get position() { return object.position; },
      setColor(c) {
        base.set(c);
        colA.copy(tintOuter(base));
        colB.copy(base).lerp(new THREE.Color(1, 1, 1), 0.12);
        if (fire.lightSrc) fire.lightSrc.color.copy(base);
        if (fire.glowDisc) fire.glowDisc.color.copy(base);
        if (fire.glowHalo) fire.glowHalo.color.copy(base);
        fire.lastI = -1;
      },
      setVisible(v) { fire.visible = !!v; fire.lastI = -1; },
      dispose() {
        if (fire.disposed) return;
        fire.disposed = true;
        object.removeFromParent();
        if (fire.slot >= 0) {
          fSize[fire.slot * 4 + 2] = 0;
          for (let k = 0; k < EMB; k++) eFire[(fire.slot * EMB + k) * 4] = 0;
          fires[fire.slot] = null;
          flamesDirty = embersDirty = true;
        }
        fire.glowDisc?.dispose();
        fire.glowHalo?.dispose();
        if (fire.lightSrc) fx.lights.remove(fire.lightSrc);
      },
    };
    if (slot < 0) {
      console.warn('[fire] out of fire slots');
      fire.slot = -1;
    } else {
      fires[slot] = fire;
      flameGeo.instanceCount = Math.max(flameGeo.instanceCount, slot + 1);
      eGeo.setDrawRange(0, Math.max(eGeo.drawRange.count, (slot + 1) * EMB));
      const lc = tinted ? base : new THREE.Color(1.0, 0.62, 0.3);
      for (let k = 0; k < EMB; k++) {
        const j = (slot * EMB + k) * 3;
        eColor[j] = Math.min(1, lc.r * 1.1 + 0.15); eColor[j + 1] = Math.min(1, lc.g * 1.0 + 0.1); eColor[j + 2] = Math.min(1, lc.b * 0.9);
      }
      embersDirty = true;
    }
    if (opts.embers === false) fire.emberSize = 0;
    if (opts.glow !== false) {
      fire.glowDisc = addGlow({ radius: 2.1 * scale * (opts.glowScale ?? 1), intensity: 0.5, color: tinted ? base : 0xff7a2a, mode: 'ground' });
    }
    if (opts.halo !== false) {
      fire.glowHalo = addGlow({ radius: 1.5 * scale * (opts.haloScale ?? 1), intensity: 0.32, color: tinted ? base : 0xff8a3a, mode: 'halo' });
    }
    fire.haloStrength = opts.haloStrength ?? 0.32;
    fire.discStrength = opts.discStrength ?? 0.55;
    if (opts.light) {
      fire.lightBase = opts.lightIntensity ?? 26 * scale;
      fire.lightSrc = fx.lights.add({
        position: new THREE.Vector3(),
        color: lightColor,
        intensity: 0,
        distance: opts.lightDistance ?? 13 * Math.max(0.6, scale),
        decay: 1.6,
        priority: opts.priority ?? 1,
      });
    }
    return fire;
  }

  function update(dt, t) {
    flameMat.uniforms.uTime.value = t;
    glowMat.uniforms.uTime.value = t;
    emberMat.uniforms.uTime.value = t;
    emberMat.uniforms.uScale.value = pointScale(ctx);
    for (const f of fires) {
      if (!f) continue;
      f.intensity = damp(f.intensity, f.target, 5, dt);
      if (Math.abs(f.intensity - f.target) < 0.002) f.intensity = f.target;
      if (f.object.parent === ctx.scene) f.world.copy(f.object.position);
      else f.object.getWorldPosition(f.world);
      const I = f.visible ? f.intensity : 0;
      const moved = f.world.distanceToSquared(f.lastWorld) > 1e-6;
      if (moved || Math.abs(I - f.lastI) > 1e-4) {
        const i = f.slot;
        fCenter[i * 3] = f.world.x; fCenter[i * 3 + 1] = f.world.y; fCenter[i * 3 + 2] = f.world.z;
        fSize[i * 4] = f.width; fSize[i * 4 + 1] = f.height; fSize[i * 4 + 2] = I; fSize[i * 4 + 3] = f.seed;
        fColA[i * 3] = f.colA.r; fColA[i * 3 + 1] = f.colA.g; fColA[i * 3 + 2] = f.colA.b;
        fColB[i * 3] = f.colB.r; fColB[i * 3 + 1] = f.colB.g; fColB[i * 3 + 2] = f.colB.b;
        fShape[i * 2] = f.tongues; fShape[i * 2 + 1] = 0;
        flamesDirty = true;
        for (let k = 0; k < EMB; k++) {
          const j = f.slot * EMB + k;
          eCenter[j * 3] = f.world.x; eCenter[j * 3 + 1] = f.world.y + 0.1 * f.scale; eCenter[j * 3 + 2] = f.world.z;
          eFire[j * 4] = f.emberSize > 0 ? I : 0; eFire[j * 4 + 1] = f.emberSize; eFire[j * 4 + 2] = f.emberRise; eFire[j * 4 + 3] = f.emberSpread;
        }
        embersDirty = true;
        if (f.glowDisc) {
          f.glowDisc.position.set(f.world.x, f.world.y + 0.04, f.world.z);
          f.glowDisc.intensity = f.discStrength * (I > 0.002 ? 0.22 + 0.78 * Math.min(I, 1.4) : 0);
          f.glowDisc.visible = f.visible;
          writeGlow(f.glowDisc);
        }
        if (f.glowHalo) {
          f.glowHalo.position.set(f.world.x, f.world.y + f.height * 0.38, f.world.z);
          f.glowHalo.intensity = f.haloStrength * Math.min(I, 1.6) * Math.min(I, 1.6);
          f.glowHalo.visible = f.visible;
          writeGlow(f.glowHalo);
        }
        f.lastWorld.copy(f.world);
        f.lastI = I;
      }
      if (f.lightSrc) {
        const fl = 0.82 + 0.1 * Math.sin(t * 9.1 + f.seed * 20) + 0.08 * Math.sin(t * 17.3 + f.seed * 5);
        f.lightSrc.position.set(f.world.x, f.world.y + f.height * 0.45, f.world.z);
        f.lightSrc.intensity = f.lightBase * clamp(I, 0, 1.6) * fl;
        f.lightSrc.enabled = f.visible && I > 0.01;
      }
    }
    if (flamesDirty) {
      aCenter.needsUpdate = aSize.needsUpdate = aColA.needsUpdate = aColB.needsUpdate = aShape.needsUpdate = true;
      flamesDirty = false;
    }
    if (glowsDirty) {
      agCenter.needsUpdate = agParams.needsUpdate = agColor.needsUpdate = true;
      glowsDirty = false;
    }
    if (embersDirty) {
      eGeo.attributes.position.needsUpdate = true;
      eGeo.attributes.aFire.needsUpdate = true;
      eGeo.attributes.aColor.needsUpdate = true;
      embersDirty = false;
    }
  }

  return { createFire, addGlow, update, fires };
}
