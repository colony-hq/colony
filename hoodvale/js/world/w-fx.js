// Ambient effects: flame / halo billboards, fireflies, peak embers + ash, Mistfen ground mist,
// Hoodwood light shafts and flocks of birds. All cheap (one draw call each), driven by the shared
// world uniforms. Owner: world builder.

import * as THREE from 'three';
import { U } from './w-common.js';
import { mulberry32 } from '../core/noise.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Flames + halos: camera-facing quads. kind 0 = flame (anchored at its base), 1 = soft halo,
// 2 = cold glow (crystal). nightOnly fades them in with the night.
// ---------------------------------------------------------------------------------------------
const FLAME_VERT = /* glsl */`
attribute vec3 aOff;
attribute vec4 aParam; // size, seed, kind, nightOnly
attribute vec3 aColor;
uniform float uTime;
uniform float uNight;
varying vec2 vUv;
varying float vSeed;
varying float vKind;
varying float vA;
varying vec3 vCol;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float kind = aParam.z;
  float s = aParam.x;
  vec2 q = position.xy;
  vec3 p;
  if (kind < 0.5) {
    float fl = 0.9 + 0.12 * sin(uTime * 13.0 + aParam.y * 10.0) + 0.08 * sin(uTime * 7.3 + aParam.y * 3.0);
    p = aOff + camR * q.x * s * 0.8 + vec3(0.0, 1.0, 0.0) * (q.y + 0.5) * s * 1.5 * fl;
  } else {
    float pulse = kind > 1.5 ? 0.85 + 0.15 * sin(uTime * 1.7 + aParam.y * 5.0) : 0.92 + 0.08 * sin(uTime * 5.0 + aParam.y * 9.0);
    p = aOff + (camR * q.x + camU * q.y) * s * pulse;
  }
  vUv = q + 0.5;
  vSeed = aParam.y;
  vKind = kind;
  vCol = aColor;
  vA = aParam.w > 0.5 ? smoothstep(0.08, 0.6, uNight) : 1.0;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FLAME_FRAG = /* glsl */`
uniform float uTime;
uniform sampler2D uNoise;
varying vec2 vUv;
varying float vSeed;
varying float vKind;
varying float vA;
varying vec3 vCol;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec3 col;
  float a;
  if (vKind < 0.5) {
    float y = vUv.y;
    float n = texture2D(uNoise, vec2(vUv.x * 0.5 + vSeed, y * 0.6 - uTime * 0.9)).g;
    float w = 0.5 * pow(1.0 - y, 0.7) * (0.75 + 0.5 * n) * smoothstep(0.0, 0.15, y);
    float d = abs(vUv.x - 0.5);
    a = smoothstep(w, w * 0.35, d) * smoothstep(1.0, 0.55, y);
    vec3 hot = vec3(1.0, 0.92, 0.6), mid = vCol, cool = vCol * vec3(0.9, 0.35, 0.15);
    col = mix(hot, mid, smoothstep(0.1, 0.45, y + d));
    col = mix(col, cool, smoothstep(0.45, 0.9, y));
    col *= 2.6;
  } else {
    float d = length(vUv - 0.5) * 2.0;
    a = pow(max(0.0, 1.0 - d), 2.2);
    col = vCol * (vKind > 1.5 ? 1.6 : 1.3);
    a *= 0.55;
  }
  a *= vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * a, a);
  #include <fog_fragment>
}`;

export function createFlames(scene, items, name = 'flames') {
  // items: [{x, y, z, size, kind, color, nightOnly}]
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  const n = items.length;
  const off = new Float32Array(n * 3), par = new Float32Array(n * 4), col = new Float32Array(n * 3);
  const c = new THREE.Color();
  const box = new THREE.Box3();
  items.forEach((it, i) => {
    off.set([it.x, it.y, it.z], i * 3);
    par.set([it.size ?? 0.5, Math.random() * 10, it.kind ?? 0, it.nightOnly ? 1 : 0], i * 4);
    c.set(it.color ?? 0xff8a30);
    col.set([c.r, c.g, c.b], i * 3);
    box.expandByPoint(new THREE.Vector3(it.x, it.y, it.z));
  });
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute('aParam', new THREE.InstancedBufferAttribute(par, 4));
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
  geo.instanceCount = n;
  geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  geo.boundingSphere.radius += 4;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, fog: true,
  });
  Object.assign(mat.uniforms, { uTime: U.uTime, uNight: U.uNight, uNoise: U.uNoise });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fx:' + name;
  mesh.renderOrder = 5;
  if (n) scene.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Point swarms (fireflies, embers, ash): drift animated in the vertex shader.
// mode 0 fireflies (wander + blink, night), 1 embers (rise + fade), 2 ash (fall + sway)
// ---------------------------------------------------------------------------------------------
const PTS_VERT = /* glsl */`
attribute float aSeed;
uniform float uTime;
uniform float uNight;
uniform float uPx;
uniform float uMode;
uniform float uSize;
uniform float uSpan;
varying float vA;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float t = uTime;
  float a = 1.0;
  if (uMode < 0.5) {
    float tt = t * 0.5 + aSeed * 20.0;
    p += vec3(sin(tt * 1.1 + aSeed * 7.0) * 1.1, sin(tt * 1.7 + aSeed * 3.0) * 0.4 + 0.45, cos(tt * 0.9 + aSeed * 5.0) * 1.1);
    a = smoothstep(0.15, 0.95, sin(t * 2.1 + aSeed * 40.0) * 0.5 + 0.5) * smoothstep(0.2, 0.7, uNight);
  } else if (uMode < 1.5) {
    float ph = fract(t * (0.05 + 0.04 * fract(aSeed * 7.3)) + aSeed);
    p.y += ph * uSpan;
    p.x += sin(t * 0.7 + aSeed * 9.0) * 0.8 * ph;
    p.z += cos(t * 0.6 + aSeed * 5.0) * 0.8 * ph;
    a = smoothstep(0.0, 0.1, ph) * (1.0 - smoothstep(0.55, 1.0, ph)) * (0.6 + 0.4 * sin(t * 9.0 + aSeed * 30.0));
  } else {
    float ph = fract(t * (0.03 + 0.02 * fract(aSeed * 3.7)) + aSeed);
    p.y += (1.0 - ph) * uSpan;
    p.x += sin(t * 0.9 + aSeed * 11.0) * 1.2;
    p.z += cos(t * 0.7 + aSeed * 13.0) * 1.2;
    a = smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.85, 1.0, ph));
  }
  vA = a;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = uPx * uSize * (0.7 + 0.3 * a) / max(1.0, -mvPosition.z);
  #include <fog_vertex>
}`;
const PTS_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uMode;
varying float vA;
#include <common>
#include <fog_pars_fragment>
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = uMode > 1.5 ? smoothstep(1.0, 0.6, d) * 0.75 : pow(max(0.0, 1.0 - d), 1.6);
  a *= vA;
  if (a < 0.01) discard;
  vec3 c = uMode > 1.5 ? uColor : uColor * (1.0 + 1.5 * (1.0 - d));
  gl_FragColor = vec4(c * (uMode > 1.5 ? 1.0 : a), uMode > 1.5 ? a : a);
  #include <fog_fragment>
}`;
export function createPoints(scene, positions, { mode = 0, color = 0xffee80, size = 14, span = 10, additive = true, name = 'points' } = {}) {
  const n = positions.length / 3;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const seeds = new Float32Array(n);
  const r = mulberry32(n * 31 + mode);
  for (let i = 0; i < n; i++) seeds[i] = r();
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += span + 2;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uMode: { value: mode }, uSize: { value: size }, uSpan: { value: span }, uPx: { value: 1 } }]),
    vertexShader: PTS_VERT, fragmentShader: PTS_FRAG,
    transparent: true, depthWrite: false, fog: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  Object.assign(mat.uniforms, { uTime: U.uTime, uNight: U.uNight });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'fx:' + name;
  pts.renderOrder = 6;
  if (n) scene.add(pts);
  return pts;
}

// ---------------------------------------------------------------------------------------------
// Ground mist: soft horizontal sheets that drift and breathe.
// ---------------------------------------------------------------------------------------------
const MIST_VERT = /* glsl */`
attribute vec4 aMist; // cx, cz, size, seed
uniform float uTime;
varying vec2 vUv;
varying vec3 vW;
varying float vSeed;
#include <common>
#include <fog_pars_vertex>
void main() {
  float s = aMist.z;
  vec2 drift = vec2(sin(uTime * 0.03 + aMist.w * 6.0), cos(uTime * 0.025 + aMist.w * 4.0)) * 3.0;
  vec3 p = vec3(aMist.x + position.x * s + drift.x, position.y, aMist.y + position.z * s + drift.y);
  vUv = position.xz + 0.5;
  vW = p;
  vSeed = aMist.w;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const MIST_FRAG = /* glsl */`
uniform float uTime;
uniform float uNight;
uniform vec3 uHorizon;
uniform vec3 uAmbient;
uniform sampler2D uNoise;
varying vec2 vUv;
varying vec3 vW;
varying float vSeed;
#include <common>
#include <fog_pars_fragment>
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float n = texture2D(uNoise, vW.xz * 0.03 + uTime * vec2(0.004, 0.003) + vSeed).r;
  float a = smoothstep(1.0, 0.3, d) * smoothstep(0.45, 0.85, n) * (0.11 + 0.1 * uNight);
  vec3 c = mix(vec3(0.75, 0.85, 0.82), uHorizon * 1.4 + vec3(0.06, 0.1, 0.1), 0.45) * (0.55 + 0.45 * uAmbient.g);
  gl_FragColor = vec4(c, a);
  #include <fog_fragment>
}`;
export function createMist(scene, sheets) {
  // sheets: [{x, y, z, size}]
  const base = new THREE.PlaneGeometry(1, 1, 1, 1);
  base.rotateX(-Math.PI / 2);
  const parts = [];
  const r = mulberry32(5150);
  for (const s of sheets) {
    const g = base.clone();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, s.y);
    const a = new Float32Array(p.count * 4);
    const seed = r();
    for (let i = 0; i < p.count; i++) a.set([s.x, s.z, s.size, seed], i * 4);
    g.setAttribute('aMist', new THREE.BufferAttribute(a, 4));
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    parts.push(g);
  }
  if (!parts.length) return null;
  // merge
  let count = 0;
  for (const g of parts) count += g.index.count;
  const pos = [], mist = [], idx = [];
  let off = 0;
  for (const g of parts) {
    pos.push(...g.attributes.position.array);
    mist.push(...g.attributes.aMist.array);
    for (const i of g.index.array) idx.push(i + off);
    off += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aMist', new THREE.Float32BufferAttribute(mist, 4));
  geo.setIndex(idx);
  const box = new THREE.Box3();
  for (const s of sheets) { box.expandByPoint(new THREE.Vector3(s.x - s.size, s.y, s.z - s.size)); box.expandByPoint(new THREE.Vector3(s.x + s.size, s.y + 2, s.z + s.size)); }
  geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false, fog: true,
  });
  Object.assign(mat.uniforms, { uTime: U.uTime, uNight: U.uNight, uHorizon: U.uHorizon, uAmbient: U.uAmbient, uNoise: U.uNoise });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fx:mist';
  mesh.renderOrder = 7;
  scene.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Light shafts (Hoodwood): long additive cards along the sun direction, daytime only.
// ---------------------------------------------------------------------------------------------
const SHAFT_VERT = /* glsl */`
attribute vec4 aShaft; // base x, base y, base z, width
attribute float aSeed;
uniform vec3 uSunDir;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec3 axis = normalize(uSunDir + vec3(0.0, 0.6, 0.0));
  vec3 base = aShaft.xyz;
  vec3 top = base + axis * 16.0;
  vec3 mid = mix(base, top, position.y);
  vec3 toCam = normalize(cameraPosition - mid);
  vec3 side = normalize(cross(axis, toCam));
  vec3 p = mid + side * position.x * aShaft.w * (0.7 + 0.5 * position.y);
  vUv = vec2(position.x + 0.5, position.y);
  vSeed = aSeed;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const SHAFT_FRAG = /* glsl */`
uniform float uDay;
uniform float uTime;
uniform vec3 uSunColor;
varying vec2 vUv;
varying float vSeed;
#include <common>
#include <fog_pars_fragment>
void main() {
  float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
  float along = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
  float a = edge * along * (0.13 + 0.06 * sin(uTime * 0.4 + vSeed * 6.0)) * uDay;
  if (a < 0.002) discard;
  vec3 c = uSunColor * vec3(1.0, 0.93, 0.7) * 0.6;
  gl_FragColor = vec4(c * a, 0.0);
  #include <fog_fragment>
}`;
export function createShafts(scene, spots) {
  const pos = [], shaft = [], seed = [], idx = [];
  const r = mulberry32(777);
  spots.forEach((s, i) => {
    const o = i * 4;
    for (const [x, y] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) { pos.push(x, y, 0); shaft.push(s.x, s.y, s.z, s.w); }
    const sd = r();
    seed.push(sd, sd, sd, sd);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  if (!spots.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aShaft', new THREE.Float32BufferAttribute(shaft, 4));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  geo.setIndex(idx);
  const box = new THREE.Box3();
  for (const s of spots) box.expandByPoint(new THREE.Vector3(s.x, s.y, s.z));
  geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  geo.boundingSphere.radius += 18;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG, transparent: true, depthWrite: false, fog: true,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  Object.assign(mat.uniforms, { uSunDir: U.uSunDir, uTime: U.uTime, uDay: U.uDay, uSunColor: U.uSunColor });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fx:shafts';
  mesh.renderOrder = 8;
  scene.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Birds: flocks circling (gulls over the sea, crows over the fields, songbirds over the woods).
// ---------------------------------------------------------------------------------------------
export function createBirds(scene, flocks) {
  const B = [];
  for (const f of flocks) for (let i = 0; i < f.count; i++) B.push({ f, ph: Math.random() * TAU, r: f.r * (0.6 + Math.random() * 0.6), sp: (0.12 + Math.random() * 0.08) * (Math.random() < 0.5 ? 1 : -1), h: f.y + Math.random() * 8, s: f.size * (0.85 + Math.random() * 0.3), seed: Math.random() * 10 });
  const pos = [
    0, 0, -0.35, 0.08, 0, 0.25, -0.08, 0, 0.25, // body
    0.05, 0, -0.05, 1, 0.05, 0.15, 0.05, 0, 0.2, // right wing
    -0.05, 0, -0.05, -0.05, 0, 0.2, -1, 0.05, 0.15, // left wing
  ];
  const wing = [0, 0, 0, 0.2, 1, 0.2, 0.2, 0.2, 1];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWing;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float fl = sin(uTime * 9.0 + float(gl_InstanceID) * 1.7);
transformed.y += aWing * abs(transformed.x) * fl * 0.9;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  mat.customProgramCacheKey = () => 'hv-birds';
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, B.length));
  mesh.name = 'fx:birds';
  mesh.frustumCulled = false;
  const c = new THREE.Color();
  B.forEach((b, i) => mesh.setColorAt(i, c.set(b.f.color)));
  scene.add(mesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  return {
    mesh,
    update(t) {
      B.forEach((b, i) => {
        const a = b.ph + t * b.sp;
        const x = b.f.x + Math.cos(a) * b.r + Math.sin(t * 0.07 + b.seed) * 6;
        const z = b.f.z + Math.sin(a) * b.r + Math.cos(t * 0.05 + b.seed) * 6;
        const y = b.h + Math.sin(t * 0.6 + b.seed) * 1.5;
        const sg = Math.sign(b.sp);
        e.set(Math.sin(t * 0.8 + b.seed) * 0.1, Math.atan2(Math.sin(a) * sg, -Math.cos(a) * sg), sg * 0.3, 'YXZ');
        q.setFromEuler(e);
        m.compose(v.set(x, y, z), q, sc.setScalar(b.s));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Butterflies (daytime): flight path + wing flap in the vertex shader, one draw call.
// ---------------------------------------------------------------------------------------------
const BF_VERT = /* glsl */`
attribute vec3 aAnchor;
attribute float aSeed;
attribute vec3 aColor;
attribute float aSide;
uniform float uTime;
uniform float uDay;
varying vec3 vCol;
varying float vEdge;
#include <common>
#include <fog_pars_vertex>
void main() {
  float s = aSeed * 17.0;
  float t = uTime * (0.8 + 0.4 * fract(aSeed * 7.1));
  vec3 off = vec3(sin(t * 0.47 + s) * 2.6 + sin(t * 1.3 + s * 2.0) * 0.6, 0.55 + 0.35 * sin(t * 1.7 + s * 3.0) + 0.25 * sin(t * 4.1 + s), cos(t * 0.39 + s * 1.3) * 2.6);
  vec3 vel = vec3(cos(t * 0.47 + s) * 0.47 * 2.6, 0.0, -sin(t * 0.39 + s * 1.3) * 0.39 * 2.6);
  float yaw = atan(vel.x, vel.z);
  float flap = sin(uTime * 15.0 + s * 10.0) * 1.05 + 0.25;
  vec3 p = position;
  float ax = abs(p.x);
  p = vec3(sign(p.x) * cos(flap) * ax, sin(flap) * ax, p.z);
  float c = cos(yaw), sn = sin(yaw);
  p = vec3(p.x * c + p.z * sn, p.y, -p.x * sn + p.z * c) * 0.13;
  vec3 wpos = aAnchor + off + p;
  vCol = aColor;
  vEdge = ax;
  vec4 mvPosition = viewMatrix * vec4(wpos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  if (uDay < 0.3) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #include <fog_vertex>
}`;
const BF_FRAG = /* glsl */`
uniform vec3 uAmbient;
uniform vec3 uSunColor;
varying vec3 vCol;
varying float vEdge;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec3 c = mix(vCol, vCol * 0.35, smoothstep(0.75, 0.95, vEdge));
  vec3 light = (uAmbient + uSunColor * 0.7) * (1.0 / PI) * 1.1;
  gl_FragColor = vec4(c * light, 1.0);
  #include <fog_fragment>
}`;
export function createButterflies(scene, anchors) {
  // anchors: [{x, y, z, color}]
  if (!anchors.length) return null;
  const base = new THREE.BufferGeometry();
  const pos = [
    0, 0, -0.35, -1, 0, -0.65, -0.9, 0, 0.25, 0, 0, -0.35, -0.9, 0, 0.25, 0, 0, 0.3, // left wing
    0, 0, -0.35, 0.9, 0, 0.25, 1, 0, -0.65, 0, 0, -0.35, 0, 0, 0.3, 0.9, 0, 0.25, // right wing
  ];
  base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', base.attributes.position);
  const n = anchors.length;
  const anc = new Float32Array(n * 3), seed = new Float32Array(n), col = new Float32Array(n * 3);
  const c = new THREE.Color();
  const r = mulberry32(4321);
  const box = new THREE.Box3();
  anchors.forEach((a, i) => {
    anc.set([a.x, a.y, a.z], i * 3);
    seed[i] = r();
    c.set(a.color);
    col.set([c.r, c.g, c.b], i * 3);
    box.expandByPoint(new THREE.Vector3(a.x, a.y, a.z));
  });
  geo.setAttribute('aAnchor', new THREE.InstancedBufferAttribute(anc, 3));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
  geo.instanceCount = n;
  geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  geo.boundingSphere.radius += 6;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: BF_VERT, fragmentShader: BF_FRAG, side: THREE.DoubleSide, fog: true,
  });
  Object.assign(mat.uniforms, { uTime: U.uTime, uDay: U.uDay, uAmbient: U.uAmbient, uSunColor: U.uSunColor });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fx:butterflies';
  scene.add(mesh);
  return mesh;
}
