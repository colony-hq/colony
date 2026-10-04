// Shared three.js helpers for the world modules: one tileable noise texture, the global uniforms
// the sky drives (sun, sky colours, time, night factor, wind) and small GLSL snippets.
// Owner: world builder.

import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------
// Tileable noise texture (256^2 RGBA8): R = macro fbm, G = detail fbm, B = Worley cell edges
// (0 on borders), A = Worley cell id (random per cell). Linear + mipmaps + repeat.
// ---------------------------------------------------------------------------------------------
let NOISE_TEX = null;
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function valueLayer(S, period, rand) {
  const L = new Float32Array(period * period);
  for (let i = 0; i < L.length; i++) L[i] = rand();
  const out = new Float32Array(S * S);
  const cell = S / period;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = x / cell, fy = y / cell;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const x0 = ix % period, x1 = (ix + 1) % period, y0 = iy % period, y1 = (iy + 1) % period;
    const a = L[y0 * period + x0], b = L[y0 * period + x1], c = L[y1 * period + x0], d = L[y1 * period + x1];
    out[y * S + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
  return out;
}
export function getNoiseTexture() {
  if (NOISE_TEX) return NOISE_TEX;
  const S = 256;
  const rand = rng(90210);
  const data = new Uint8Array(S * S * 4);
  const fbmLayer = (periods, weights) => {
    const acc = new Float32Array(S * S);
    let wsum = 0;
    periods.forEach((p, i) => {
      const l = valueLayer(S, p, rand);
      for (let k = 0; k < acc.length; k++) acc[k] += l[k] * weights[i];
      wsum += weights[i];
    });
    let mn = Infinity, mx = -Infinity;
    for (let k = 0; k < acc.length; k++) { acc[k] /= wsum; mn = Math.min(mn, acc[k]); mx = Math.max(mx, acc[k]); }
    for (let k = 0; k < acc.length; k++) acc[k] = (acc[k] - mn) / (mx - mn);
    return acc;
  };
  const R = fbmLayer([4, 8, 16, 32], [0.5, 0.28, 0.15, 0.07]);
  const Gc = fbmLayer([16, 32, 64, 128], [0.45, 0.3, 0.17, 0.08]);
  // Worley (wrapping), 16 x 16 cells.
  const C = 16, cs = S / C;
  const px = new Float32Array(C * C), py = new Float32Array(C * C), pid = new Float32Array(C * C);
  for (let i = 0; i < C * C; i++) { px[i] = 0.15 + 0.7 * rand(); py[i] = 0.15 + 0.7 * rand(); pid[i] = rand(); }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = x / cs, fy = y / cs;
    const cx = Math.floor(fx), cy = Math.floor(fy);
    let f1 = 9, f2 = 9, id = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gy = cy + dy;
      const wx = ((gx % C) + C) % C, wy = ((gy % C) + C) % C;
      const k = wy * C + wx;
      const d = Math.hypot(gx + px[k] - fx, gy + py[k] - fy);
      if (d < f1) { f2 = f1; f1 = d; id = pid[k]; } else if (d < f2) f2 = d;
    }
    const k = (y * S + x) * 4;
    data[k] = Math.round(R[y * S + x] * 255);
    data[k + 1] = Math.round(Gc[y * S + x] * 255);
    data[k + 2] = Math.round(Math.min(1, (f2 - f1) * 1.6) * 255);
    data[k + 3] = Math.round(id * 255);
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  NOISE_TEX = tex;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Global uniforms (shared objects: every world material references the same {value}).
// sky.js writes them each frame; colours are linear.
// ---------------------------------------------------------------------------------------------
export const U = {
  uTime: { value: 0 },
  uNoise: { value: null },
  uSunDir: { value: new THREE.Vector3(0.45, 0.75, 0.35).normalize() }, // towards the key light
  uSunColor: { value: new THREE.Color(1.0, 0.95, 0.85) }, // key light colour x intensity
  uSkyColor: { value: new THREE.Color(0.35, 0.55, 0.85) }, // zenith
  uHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
  uAmbient: { value: new THREE.Color(0.55, 0.6, 0.7) },
  uNight: { value: 0 }, // 0 day .. 1 deep night (also 1 in dungeons: glows on)
  uDay: { value: 1 }, // sun above horizon factor
  uWind: { value: 1 },
  uCloudShadow: { value: 0.25 },
  uGlow: { value: 1 }, // global emissive multiplier
};
U.uNoise.value = getNoiseTexture();

// GLSL helpers (no uniforms declared here, declare what you use).
export const GLSL_COMMON = /* glsl */`
float hvHash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 hvLin(vec3 c) { return c * c * (0.3 + 0.7 * c); }
`;
// hvLin: cheap sRGB -> linear approximation (close to pow 2.2 in the mid range).

export function srgbToLinearArr(r, g, b) {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [f(r), f(g), f(b)];
}

// Point on the ground the world should be detailed around: the player in play, else where the
// camera looks. Writes into out {x, z} and returns it.
const _dir = new THREE.Vector3();
export function getFocus(ctx, out) {
  const rig = ctx.cameraRig;
  const p = ctx.player?.pos;
  const mode = ctx.state?.mode;
  if (p && (mode === 'play' || mode === 'dead' || mode === 'cutscene') && (!rig || rig.mode !== 'debug')) {
    out.x = p.x; out.z = p.z; out.region = ctx.map.regionAt(p.x, p.z).id;
    return out;
  }
  const cam = ctx.camera;
  cam.getWorldDirection(_dir);
  const o = cam.position;
  let t = 0, hit = false;
  for (let i = 0; i < 80; i++) {
    t += 2 + t * 0.04;
    const x = o.x + _dir.x * t, y = o.y + _dir.y * t, z = o.z + _dir.z * t;
    if (y <= Math.max(0, ctx.map.heightAt(x, z))) { hit = true; break; }
    if (t > 160) break;
  }
  if (!hit) t = Math.min(t, 60);
  out.x = o.x + _dir.x * t; out.z = o.z + _dir.z * t;
  out.region = ctx.map.regionAt(out.x, out.z).id;
  if (out.region === 'overworld' && ctx.map.regionAt(o.x, o.z).id !== 'overworld') out.region = ctx.map.regionAt(o.x, o.z).id;
  return out;
}

// Merge simple geometries (non-indexed) with per-vertex colour into one BufferGeometry.
export function mergeGeos(list) {
  let count = 0;
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const extra = {};
  const extraNames = new Set();
  for (const g of parts) for (const n in g.attributes) if (!['position', 'normal', 'color', 'uv'].includes(n)) extraNames.add(n);
  for (const n of extraNames) {
    const size = parts.find((g) => g.attributes[n]).attributes[n].itemSize;
    extra[n] = { size, arr: new Float32Array(count * size) };
  }
  let o = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nrm.set(g.attributes.normal.array.subarray(0, n * 3), o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array.subarray(0, n * 3), o * 3);
    else col.fill(1, o * 3, (o + n) * 3);
    for (const name of extraNames) {
      const e = extra[name];
      const a = g.attributes[name];
      if (a) e.arr.set(a.array.subarray(0, n * e.size), o * e.size);
    }
    o += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const name of extraNames) geo.setAttribute(name, new THREE.BufferAttribute(extra[name].arr, extra[name].size));
  geo.computeBoundingSphere();
  return geo;
}

// Paint a whole geometry one colour (sRGB hex -> linear vertex colours), optional per-vertex fn.
export function paintGeo(geo, hexOrFn, extraAttrs) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  const p = geo.attributes.position;
  for (let i = 0; i < n; i++) {
    if (typeof hexOrFn === 'function') hexOrFn(c, p.getX(i), p.getY(i), p.getZ(i), i);
    else c.setHex(hexOrFn);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (extraAttrs) for (const k in extraAttrs) {
    const [size, val] = extraAttrs[k];
    const arr = new Float32Array(n * size);
    for (let i = 0; i < n; i++) for (let j = 0; j < size; j++) arr[i * size + j] = typeof val === 'function' ? val(p.getX(i), p.getY(i), p.getZ(i), j) : val;
    geo.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  return geo;
}
