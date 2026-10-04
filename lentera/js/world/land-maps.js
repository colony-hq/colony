// Shared procedural data textures for the landscape (owner: landscape).
// Everything is generated on the CPU at first use (no external assets):
//   getNoiseTexture()   256² RGBA8, tileable fBm in 4 channels (r coarse .. a fine), repeat-wrapped
//   getRippleTexture()  128² RGBA8, tileable ripple height (b) and its gradient (rg, 0.5 = flat)
//   getHeightTexture()  321² R16F, the baked heightfield (texel centres = grid vertices)
//   getFogMap()         96² RGBA16F over [-400,400]: r = kabut base raise (m), g = density multiplier
//   sampleFogMap(x,z)   CPU bilinear twin of getFogMap() (used by fog.fogAmount)
// GLSL: LAND_GLSL.height gives `float landHeight(vec2 xz)` (needs uniform uLandHeight).

import * as THREE from 'three';
import { bakeHeightfield, GRID_N, GRID_STEP, WORLD_HALF, LANDMARKS } from './heightfield.js';
import { mulberry32 } from '../core/noise.js';

const TAU = Math.PI * 2;
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Tileable 2D gradient noise with an integer period (in lattice cells).
function makePeriodicNoise(seed, period) {
  const rand = mulberry32(seed);
  const g = new Float32Array(period * period * 2);
  for (let i = 0; i < period * period; i++) {
    const a = rand() * TAU;
    g[i * 2] = Math.cos(a);
    g[i * 2 + 1] = Math.sin(a);
  }
  const wrap = (v) => ((v % period) + period) % period;
  const dot = (ix, iy, dx, dy) => {
    const k = (wrap(iy) * period + wrap(ix)) * 2;
    return g[k] * dx + g[k + 1] * dy;
  };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const a = dot(xi, yi, xf, yf), b = dot(xi + 1, yi, xf - 1, yf);
    const c = dot(xi, yi + 1, xf, yf - 1), d = dot(xi + 1, yi + 1, xf - 1, yf - 1);
    const ab = a + (b - a) * u, cd = c + (d - c) * u;
    return (ab + (cd - ab) * v) * 1.41;
  };
}

// Tileable fBm over [0,1)² sampled at size² texels: base period p, `oct` octaves.
function tileableFbm(size, p, oct, seed, ridge = false) {
  const out = new Float32Array(size * size);
  const layers = [];
  for (let o = 0; o < oct; o++) layers.push(makePeriodicNoise(seed + o * 101, p << o));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0, amp = 1, norm = 0;
      for (let o = 0; o < oct; o++) {
        const f = (p << o) / size;
        let n = layers[o](x * f, y * f);
        if (ridge) n = 1 - Math.abs(n) * 1.6;
        s += n * amp;
        norm += amp;
        amp *= 0.5;
      }
      out[y * size + x] = s / norm;
    }
  }
  return out;
}

// Normalise to mean 0.5 with ~±2 sigma spanning [0, 1].
function normalise(arr, spread = 4) {
  let mean = 0;
  for (const v of arr) mean += v;
  mean /= arr.length;
  let varc = 0;
  for (const v of arr) varc += (v - mean) * (v - mean);
  const sd = Math.sqrt(varc / arr.length) || 1;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = Math.min(1, Math.max(0, 0.5 + (arr[i] - mean) / (sd * spread)));
  return out;
}

let noiseTex = null;
export function getNoiseTexture() {
  if (noiseTex) return noiseTex;
  const S = 256;
  const ch = [
    normalise(tileableFbm(S, 4, 5, 11)),
    normalise(tileableFbm(S, 8, 4, 23)),
    normalise(tileableFbm(S, 16, 4, 37)),
    normalise(tileableFbm(S, 12, 3, 53, true)),
  ];
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(ch[c][i] * 255);
  }
  noiseTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.anisotropy = 4;
  noiseTex.name = 'lentera-noise';
  noiseTex.needsUpdate = true;
  return noiseTex;
}

let rippleTex = null;
export function getRippleTexture() {
  if (rippleTex) return rippleTex;
  const S = 128;
  const h = tileableFbm(S, 6, 4, 71);
  const r2 = tileableFbm(S, 10, 3, 89, true);
  for (let i = 0; i < h.length; i++) h[i] = h[i] * 0.7 + r2[i] * 0.3;
  const gx = new Float32Array(S * S), gy = new Float32Array(S * S);
  let maxG = 1e-6;
  const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      gx[i] = (at(x + 1, y) - at(x - 1, y)) * 0.5;
      gy[i] = (at(x, y + 1) - at(x, y - 1)) * 0.5;
      maxG = Math.max(maxG, Math.abs(gx[i]), Math.abs(gy[i]));
    }
  }
  const hn = normalise(h);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = Math.round((0.5 + 0.5 * gx[i] / maxG) * 255);
    data[i * 4 + 1] = Math.round((0.5 + 0.5 * gy[i] / maxG) * 255);
    data[i * 4 + 2] = Math.round(hn[i] * 255);
    data[i * 4 + 3] = 255;
  }
  rippleTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  rippleTex.magFilter = THREE.LinearFilter;
  rippleTex.minFilter = THREE.LinearMipmapLinearFilter;
  rippleTex.generateMipmaps = true;
  rippleTex.name = 'lentera-ripple';
  rippleTex.needsUpdate = true;
  return rippleTex;
}

let heightTex = null;
export function getHeightTexture() {
  if (heightTex) return heightTex;
  const grid = bakeHeightfield();
  const data = new Uint16Array(GRID_N * GRID_N);
  for (let i = 0; i < data.length; i++) data[i] = THREE.DataUtils.toHalfFloat(grid[i]);
  heightTex = new THREE.DataTexture(data, GRID_N, GRID_N, THREE.RedFormat, THREE.HalfFloatType);
  heightTex.wrapS = heightTex.wrapT = THREE.ClampToEdgeWrapping;
  heightTex.magFilter = THREE.LinearFilter;
  heightTex.minFilter = THREE.LinearFilter;
  heightTex.generateMipmaps = false;
  heightTex.name = 'lentera-height';
  heightTex.needsUpdate = true;
  return heightTex;
}

// World xz -> heightmap uv so that texel centres sit exactly on grid vertices.
const H_SPAN = GRID_N * GRID_STEP; // 802.5
const H_OFF = WORLD_HALF + GRID_STEP * 0.5; // 401.25

export const LAND_GLSL = {
  height: /* glsl */ `
uniform sampler2D uLandHeight;
float landHeight(vec2 xz) {
  return texture2D(uLandHeight, (xz + ${H_OFF.toFixed(3)}) / ${H_SPAN.toFixed(3)}).r;
}
`,
};

// ---------------------------------------------------------------------------------------------
// Kabut pockets: where the fog pools deeper (LANDMARKS.fogPockets). The base of the kabut layer
// is raised locally (so plateaus like the candi courtyard sit inside the fog while the shrine top,
// the gunung and the mercusuar tower rise above it) and the density is multiplied.
// ---------------------------------------------------------------------------------------------
const POCKET_STYLE = [
  { raise: 3, mul: 1.45 }, // shipwreck: low and thick over the shallows
  { raise: 9, mul: 1.25 }, // waterfall cave: spray mist hangs over the cove
  { raise: 29, mul: 1.15 }, // temple: courtyard (y 34) in fog, shrine top (47) pokes out
  { raise: 9, mul: 1.2 }, // western forest
  { raise: 11, mul: 1.1 }, // eastern ridge
];

export const FOG_MAP_N = 96;
const FOG_SPAN = WORLD_HALF * 2;
let fogMapData = null;
let fogMapTex = null;

function buildFogMap() {
  const N = FOG_MAP_N;
  const raise = new Float32Array(N * N);
  const mul = new Float32Array(N * N);
  const pockets = LANDMARKS.fogPockets || [];
  for (let j = 0; j < N; j++) {
    const z = ((j + 0.5) / N - 0.5) * FOG_SPAN;
    for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N - 0.5) * FOG_SPAN;
      let r = 0, m = 0;
      pockets.forEach((p, k) => {
        const st = POCKET_STYLE[k] || { raise: 6, mul: 1.2 };
        const d = Math.hypot(x - p.x, z - p.z) / p.r;
        const t = Math.min(1, Math.max(0, (d - 0.45) / (1.15 - 0.45)));
        const w = 1 - t * t * (3 - 2 * t);
        r = Math.max(r, st.raise * w);
        m = Math.max(m, (st.mul - 1) * w);
      });
      raise[j * N + i] = r;
      mul[j * N + i] = 1 + m;
    }
  }
  fogMapData = { raise, mul };
}

export function getFogMap() {
  if (fogMapTex) return fogMapTex;
  if (!fogMapData) buildFogMap();
  const N = FOG_MAP_N;
  const data = new Uint16Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = THREE.DataUtils.toHalfFloat(fogMapData.raise[i]);
    data[i * 4 + 1] = THREE.DataUtils.toHalfFloat(fogMapData.mul[i]);
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  fogMapTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  fogMapTex.wrapS = fogMapTex.wrapT = THREE.ClampToEdgeWrapping;
  fogMapTex.magFilter = fogMapTex.minFilter = THREE.LinearFilter;
  fogMapTex.generateMipmaps = false;
  fogMapTex.name = 'lentera-fogmap';
  fogMapTex.needsUpdate = true;
  return fogMapTex;
}

// CPU twin of the GPU bilinear lookup. Returns { raise, mul } (reuses `out`).
export function sampleFogMap(x, z, out = { raise: 0, mul: 1 }) {
  if (!fogMapData) buildFogMap();
  const N = FOG_MAP_N;
  let fx = (x / FOG_SPAN + 0.5) * N - 0.5;
  let fz = (z / FOG_SPAN + 0.5) * N - 0.5;
  fx = Math.min(N - 1, Math.max(0, fx));
  fz = Math.min(N - 1, Math.max(0, fz));
  const i = Math.min(N - 2, Math.floor(fx)), j = Math.min(N - 2, Math.floor(fz));
  const tx = fx - i, tz = fz - j;
  const k = j * N + i;
  const bl = (a) => {
    const top = a[k] + (a[k + 1] - a[k]) * tx;
    const bot = a[k + N] + (a[k + N + 1] - a[k + N]) * tx;
    return top + (bot - top) * tz;
  };
  out.raise = bl(fogMapData.raise);
  out.mul = bl(fogMapData.mul);
  return out;
}

export const FOG_MAP_GLSL_SCALE = (1 / FOG_SPAN).toFixed(8);
