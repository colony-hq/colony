// Procedural textures + shared materials for structures (owner: setdressing).
// Everything is synthesised at boot: tileable value-noise fields -> albedo + height -> normal map.
// Geometry built by props-kit.js carries UVs in metres; each material's texture repeat converts
// metres to tiles, so texel density stays consistent across every merged mesh.

import * as THREE from 'three';
import { patchMaterial } from './fog.js';
import { mulberry32 } from '../core/noise.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const fract = (v) => v - Math.floor(v);

// ---------------------------------------------------------------------------------------------
// Tileable value noise. Lattices are cached per (Px, Py); u, v in [0, 1) wrap seamlessly.
// ---------------------------------------------------------------------------------------------
export function tileNoise(seed) {
  const lattices = new Map();
  const rand = mulberry32(seed);
  let lastK = -1, lastL = null;
  function lattice(Px, Py) {
    const k = Px * 4096 + Py;
    if (k === lastK) return lastL;
    let l = lattices.get(k);
    if (!l) {
      l = new Float32Array(Px * Py);
      for (let i = 0; i < l.length; i++) l[i] = rand();
      lattices.set(k, l);
    }
    lastK = k; lastL = l;
    return l;
  }
  function get(u, v, Px, Py = Px) {
    const l = lattice(Px, Py);
    const x = u * Px, y = v * Py;
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    let x0 = xi % Px; if (x0 < 0) x0 += Px;
    let y0 = yi % Py; if (y0 < 0) y0 += Py;
    const x1 = (x0 + 1) % Px, y1 = (y0 + 1) % Py;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = l[y0 * Px + x0], b = l[y0 * Px + x1], c = l[y1 * Px + x0], d = l[y1 * Px + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(u, v, Px, Py = Px, oct = 4) {
    let s = 0, amp = 0.5, n = 0;
    for (let o = 0; o < oct; o++) {
      s += amp * get(u, v, Px << o, Py << o);
      n += amp; amp *= 0.5;
    }
    return s / n;
  }
  return { get, fbm };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Pixel loop helper: fn(u, v, x, y) -> writes into col (rgb 0..1) and returns height (0..1).
function synth(S, fn, { normalStrength = 2, wantNormal = true } = {}) {
  const color = makeCanvas(S, S);
  const cx = color.getContext('2d');
  const img = cx.createImageData(S, S);
  const H = new Float32Array(S * S);
  const col = [0, 0, 0];
  for (let y = 0; y < S; y++) {
    const v = 1 - (y + 0.5) / S; // texture v (flipY)
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const h = fn(u, v, x, y, col);
      const k = (y * S + x);
      H[k] = h;
      img.data[k * 4] = clamp01(col[0]) * 255;
      img.data[k * 4 + 1] = clamp01(col[1]) * 255;
      img.data[k * 4 + 2] = clamp01(col[2]) * 255;
      img.data[k * 4 + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  return { color, normal: wantNormal ? heightToNormal(H, S, S, normalStrength) : null, H };
}

// Height field -> tangent-space normal map canvas (wrapping, OpenGL convention).
export function heightToNormal(H, W, Hh, strength = 2, wrap = true) {
  const c = makeCanvas(W, Hh);
  const cx = c.getContext('2d');
  const img = cx.createImageData(W, Hh);
  const at = (x, y) => {
    if (wrap) { x = (x + W) % W; y = (y + Hh) % Hh; } else { x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(Hh - 1, y)); }
    return H[y * W + x];
  };
  const s = strength * (W / 256);
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * s;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * s; // +row = -v
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const k = (y * W + x) * 4;
      img.data[k] = (nx * 0.5 + 0.5) * 255;
      img.data[k + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[k + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[k + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Individual texture recipes. Albedo is kept light/neutral where a vertex colour tints it.
// ---------------------------------------------------------------------------------------------
function woodRecipe(S, seed) {
  const N = tileNoise(seed);
  const r = mulberry32(seed + 7);
  const knots = [];
  for (let i = 0; i < 3; i++) knots.push({ u: r(), v: r(), s: 0.025 + r() * 0.03 });
  return synth(S, (u, v, x, y, col) => {
    let warp = N.fbm(u, v, 3, 2, 3) * 1.6 + N.get(u, v, 2, 12) * 0.25;
    let kn = 0;
    for (const k of knots) {
      let du = u - k.u, dv = v - k.v;
      du -= Math.round(du); dv -= Math.round(dv);
      const d2 = (du * du) / (k.s * k.s) + (dv * dv) / (k.s * k.s * 9);
      const e = Math.exp(-d2);
      warp += e * 0.5 * Math.sign(du || 1);
      kn = Math.max(kn, Math.exp(-d2 * 4));
    }
    const rings = 0.5 + 0.5 * Math.sin((u * 22 + warp) * Math.PI * 2);
    const pores = N.fbm(u, v, 128, 6, 2);
    const streak = N.get(u, v, 48, 3);
    let t = 0.55 + rings * 0.22 + (pores - 0.5) * 0.35 + (streak - 0.5) * 0.25;
    t *= 1 - kn * 0.55;
    col[0] = mix(0.52, 0.88, t); col[1] = mix(0.44, 0.80, t); col[2] = mix(0.36, 0.70, t);
    return rings * 0.4 + pores * 0.4 - kn * 0.4;
  }, { normalStrength: 1.4 });
}

function bambooRecipe(S, seed) {
  const N = tileNoise(seed);
  return synth(S, (u, v, x, y, col) => {
    // Two nodes per tile (tile = 1 m along the culm, u wraps around the circumference).
    const nv = fract(v * 2);
    const dn = Math.min(nv, 1 - nv);
    const ring = Math.exp(-(dn * dn) / 0.00008);
    const bulge = Math.exp(-(dn * dn) / 0.0012);
    const fib = N.fbm(u, v, 96, 4, 2);
    const blot = N.fbm(u, v, 4, 4, 3);
    const green = N.get(u, v, 6, 2);
    let t = 0.78 + (fib - 0.5) * 0.25 - ring * 0.45 + bulge * 0.06;
    col[0] = t * mix(0.98, 0.86, green) * mix(1, 0.75, smooth(0.6, 0.8, blot));
    col[1] = t * mix(0.90, 0.92, green) * mix(1, 0.7, smooth(0.6, 0.8, blot));
    col[2] = t * mix(0.62, 0.55, green) * mix(1, 0.6, smooth(0.6, 0.8, blot));
    return bulge * 0.6 - ring * 0.3 + fib * 0.15;
  }, { normalStrength: 2 });
}

function gedekRecipe(S, seed) {
  const N = tileNoise(seed);
  const n = 8; // strips per unit along each diagonal (must be even for tiling)
  const shade = mulberry32(seed + 3);
  const tbl = new Float32Array(64);
  for (let i = 0; i < 64; i++) tbl[i] = 0.88 + shade() * 0.2;
  return synth(S, (u, v, x, y, col) => {
    const a = (u + v) * n, b = (u - v) * n;
    const i = Math.floor(a), j = Math.floor(b);
    const fa = a - i, fb = b - j;
    const over = (((i + j) % 4) + 4) % 4 < 2; // 2/2 twill
    // Strip on top: A-family (constant i) when over, else B-family.
    const across = over ? fa : fb;
    const along = over ? fb : fa;
    const runPos = over ? (((i + j) % 2 + 2) % 2 + along) / 2 : ((((i + j) % 2 + 2) % 2) + along) / 2;
    const edge = Math.min(across, 1 - across);
    const gap = smooth(0.0, 0.09, edge);
    const sid = over ? ((i % 64) + 64) % 64 : ((j * 7 % 64) + 64) % 64;
    const fib = N.get(over ? u - v : u + v, over ? u + v : u - v, 160, 6);
    const lift = Math.sin(runPos * Math.PI);
    let t = tbl[sid] * (0.82 + fib * 0.22) * (0.7 + 0.3 * lift) * mix(0.35, 1, gap);
    if (over) { col[0] = t * 0.96; col[1] = t * 0.86; col[2] = t * 0.60; }
    else { col[0] = t * 0.84; col[1] = t * 0.72; col[2] = t * 0.50; }
    return gap * (0.55 + 0.45 * lift) + fib * 0.08;
  }, { normalStrength: 2.4 });
}

function thatchRecipe(S, seed) {
  const N = tileNoise(seed);
  const rows = 5;
  return synth(S, (u, v, x, y, col) => {
    const off = (N.get(u, 0.5, 40, 1) - 0.5) * 0.5 + (N.get(u, 0.2, 160, 1) - 0.5) * 0.35;
    const rv = v * rows + off;
    const t = fract(rv);
    const row = Math.floor(rv);
    const strands = N.fbm(u + row * 0.37, v, 200, 3, 2);
    const clump = N.get(u + row * 0.13, v, 24, 2);
    const shadow = 1 - 0.65 * smooth(0.55, 1.0, t);
    const tip = 1 + 0.25 * (1 - smooth(0.0, 0.12, t));
    let k = (0.62 + strands * 0.45 + (clump - 0.5) * 0.2) * shadow * tip;
    col[0] = k * 0.98; col[1] = k * 0.86; col[2] = k * 0.62;
    return (1 - t) * 0.8 + strands * 0.25;
  }, { normalStrength: 3 });
}

function stoneRecipe(S, seed) {
  const N = tileNoise(seed);
  const r = mulberry32(seed + 11);
  const rows = 6; // tile = 2 m -> 0.33 m courses
  const splits = [];
  const tint = [];
  for (let i = 0; i < rows; i++) {
    const cnt = 2 + Math.floor(r() * 2) + 1; // 3..4 blocks per 2 m
    const w = [];
    let sum = 0;
    for (let k = 0; k < cnt; k++) { const q = 0.7 + r() * 0.6; w.push(q); sum += q; }
    const pos = [];
    let acc = r();
    for (let k = 0; k < cnt; k++) { pos.push(acc % 1); acc += w[k] / sum; }
    pos.sort((a, b) => a - b);
    splits.push(pos);
    const tt = [];
    for (let k = 0; k < cnt; k++) tt.push([0.86 + r() * 0.2, r()]);
    tint.push(tt);
  }
  return synth(S, (u, v, x, y, col) => {
    const rv = v * rows;
    const row = Math.min(rows - 1, Math.floor(rv));
    const tv = rv - row;
    const sp = splits[row];
    let bi = sp.length - 1, start = sp[sp.length - 1] - 1, end = sp[0];
    for (let k = 0; k < sp.length; k++) {
      const s0 = sp[k], s1 = k + 1 < sp.length ? sp[k + 1] : sp[0] + 1;
      if (u >= s0 && u < s1) { bi = k; start = s0; end = s1; break; }
      if (u < sp[0]) { bi = sp.length - 1; start = sp[sp.length - 1] - 1; end = sp[0]; }
    }
    const du = Math.min(u - start, end - u) * 2; // metres
    const dv = Math.min(tv, 1 - tv) * (2 / rows);
    const chip = (N.fbm(u, v, 24, 24, 3) - 0.5) * 0.03;
    const e = Math.min(du, dv) + chip;
    const bevel = smooth(0.0, 0.035, e);
    const [tk, hue] = tint[row][bi];
    const pit = N.fbm(u, v, 96, 96, 3);
    const big = N.fbm(u, v, 6, 6, 3);
    const moss = smooth(0.52, 0.72, N.fbm(u + 0.3, v, 5, 5, 4) + (1 - bevel) * 0.25 + (1 - tv) * 0.08);
    const lichen = smooth(0.78, 0.84, N.get(u, v, 64, 64)) * (1 - moss);
    let g = tk * (0.86 + (pit - 0.5) * 0.3 + (big - 0.5) * 0.18) * mix(0.3, 1, bevel);
    let cr = g * mix(0.92, 1.0, hue), cg = g * 0.98, cb = g * mix(0.92, 0.86, hue);
    cr = mix(cr, g * 0.52, moss * 0.85); cg = mix(cg, g * 0.74, moss * 0.85); cb = mix(cb, g * 0.36, moss * 0.85);
    cr = mix(cr, 0.86, lichen * 0.5); cg = mix(cg, 0.84, lichen * 0.5); cb = mix(cb, 0.7, lichen * 0.5);
    col[0] = cr * 0.95; col[1] = cg * 0.97; col[2] = cb * 0.92;
    return bevel * (0.8 + pit * 0.2) + moss * 0.05;
  }, { normalStrength: 3.2 });
}

function rockRecipe(S, seed) {
  const N = tileNoise(seed);
  return synth(S, (u, v, x, y, col) => {
    const base = N.fbm(u, v, 4, 4, 5);
    const rid = 1 - Math.abs(N.fbm(u + 0.5, v, 6, 6, 4) * 2 - 1);
    const crack = smooth(0.965, 0.99, rid);
    const strata = 0.5 + 0.5 * Math.sin((v * 9 + base * 1.5) * Math.PI * 2);
    const grain = N.fbm(u, v, 128, 128, 2);
    let t = 0.6 + (base - 0.5) * 0.45 + strata * 0.07 + (grain - 0.5) * 0.2 - crack * 0.16;
    const warm = N.get(u, v, 3, 3);
    col[0] = t * mix(0.92, 1.02, warm); col[1] = t * 0.95; col[2] = t * mix(0.92, 0.82, warm);
    return base * 0.7 + strata * 0.1 + grain * 0.15 - crack * 0.4;
  }, { normalStrength: 3 });
}

function plasterRecipe(S, seed) {
  const N = tileNoise(seed);
  return synth(S, (u, v, x, y, col) => {
    const stain = N.fbm(u, v, 3, 3, 4);
    const streak = N.fbm(u, v, 40, 2, 3);
    const fine = N.fbm(u, v, 128, 128, 2);
    const crackN = 1 - Math.abs(N.fbm(u + 0.2, v + 0.7, 5, 5, 4) * 2 - 1);
    const crack = smooth(0.965, 0.99, crackN);
    const flake = smooth(0.70, 0.74, N.fbm(u, v, 10, 10, 3));
    let t = 0.92 - smooth(0.45, 0.8, stain) * 0.16 - smooth(0.5, 0.9, streak) * 0.14 + (fine - 0.5) * 0.06 - crack * 0.3;
    col[0] = t * 0.99; col[1] = t * 0.96; col[2] = t * 0.9;
    if (flake > 0) { col[0] = mix(col[0], 0.62, flake); col[1] = mix(col[1], 0.55, flake); col[2] = mix(col[2], 0.48, flake); }
    return 0.5 + fine * 0.1 - crack * 0.3 - flake * 0.25;
  }, { normalStrength: 1.6 });
}

function rooftileRecipe(S, seed) {
  const N = tileNoise(seed);
  const r = mulberry32(seed);
  const tints = new Float32Array(25);
  for (let i = 0; i < 25; i++) tints[i] = 0.82 + r() * 0.3;
  return synth(S, (u, v, x, y, col) => {
    const rows = 5, cols = 4;
    const rv = v * rows, rr = Math.floor(rv), t = rv - rr;
    const cu = u * cols + (rr % 2) * 0.0, cc = Math.floor(cu), fu = cu - cc;
    const arch = Math.sin(fu * Math.PI);
    const shadow = 1 - 0.55 * smooth(0.7, 1, t);
    const tk = tints[(rr * 5 + cc) % 25];
    const spots = smooth(0.62, 0.8, N.fbm(u, v, 8, 8, 4));
    const grain = N.fbm(u, v, 96, 96, 2);
    let k = tk * (0.7 + arch * 0.3) * shadow * (0.9 + grain * 0.15);
    col[0] = k * mix(0.78, 0.36, spots); col[1] = k * mix(0.40, 0.36, spots); col[2] = k * mix(0.26, 0.22, spots);
    return arch * 0.6 + (1 - t) * 0.4;
  }, { normalStrength: 3 });
}

// Water streak noise (greyscale, tileable) used by the waterfall/foam shaders.
function waterNoiseRecipe(S, seed) {
  const N = tileNoise(seed);
  return synth(S, (u, v, x, y, col) => {
    const a = N.fbm(u, v, 24, 3, 3);
    const b = N.fbm(u, v, 8, 8, 4);
    const c = N.fbm(u, v, 48, 48, 2);
    col[0] = a; col[1] = b; col[2] = c;
    return 0;
  }, { wantNormal: false });
}

// ---------------------------------------------------------------------------------------------
// Canvas-drawn atlases: batik, decals (signs), relief (height-drawn -> colour + normal).
// ---------------------------------------------------------------------------------------------
function batikAtlas(S) {
  // 3 x 2 cells: parang, kawung, mega mendung / truntum, striped sail, worn sail.
  const W = S * 3, H = S * 2;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const cell = (i, j, fn) => { g.save(); g.translate(i * S, j * S); g.beginPath(); g.rect(0, 0, S, S); g.clip(); fn(); g.restore(); };
  const soga = '#7a4320', cream = '#efe1c0', indigo = '#1f2a4a', deep = '#3a1e10';
  // Parang: diagonal bands of S-shapes.
  cell(0, 0, () => {
    g.fillStyle = cream; g.fillRect(0, 0, S, S);
    g.save();
    g.translate(S / 2, S / 2); g.rotate(-Math.PI / 4); g.translate(-S, -S);
    const band = S / 4;
    for (let b = 0; b < 9; b++) {
      const y0 = b * band;
      g.fillStyle = b % 2 ? soga : deep;
      g.fillRect(0, y0 + band * 0.42, S * 2, band * 0.16);
      for (let k = 0; k < 12; k++) {
        const x = k * band * 0.9;
        g.fillStyle = b % 2 ? soga : indigo;
        g.beginPath();
        g.ellipse(x, y0 + band * 0.25, band * 0.34, band * 0.17, 0.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = cream;
        g.beginPath();
        g.ellipse(x, y0 + band * 0.25, band * 0.16, band * 0.06, 0.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = b % 2 ? deep : soga;
        g.beginPath(); g.arc(x + band * 0.45, y0 + band * 0.75, band * 0.09, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
  });
  // Kawung: four-oval flowers on a grid.
  cell(1, 0, () => {
    g.fillStyle = '#d9c39a'; g.fillRect(0, 0, S, S);
    const n = 4, s = S / n;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = i * s, y = j * s;
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        g.fillStyle = deep;
        g.beginPath(); g.ellipse(x + Math.cos(a) * s * 0.27, y + Math.sin(a) * s * 0.27, s * 0.26, s * 0.15, a, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#b07a3c';
        g.beginPath(); g.ellipse(x + Math.cos(a) * s * 0.27, y + Math.sin(a) * s * 0.27, s * 0.17, s * 0.08, a, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = cream; g.beginPath(); g.arc(x, y, s * 0.05, 0, Math.PI * 2); g.fill();
      g.fillStyle = deep; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.06, 0, Math.PI * 2); g.fill();
    }
  });
  // Mega mendung: layered cloud scrolls in indigo.
  cell(2, 0, () => {
    g.fillStyle = '#9fb6cf'; g.fillRect(0, 0, S, S);
    const cols = ['#1b2c55', '#2c4a7c', '#4f74a6', '#86a6cc', '#d8e4f0'];
    for (const [cx0, cy0] of [[0.25, 0.3], [0.75, 0.75], [-0.25, 0.75], [0.75, -0.25], [1.25, 0.3], [0.25, 1.3]]) {
      for (let l = 0; l < cols.length; l++) {
        const sc = 1 - l * 0.17;
        g.fillStyle = cols[l];
        g.beginPath();
        const cx = cx0 * S, cy = cy0 * S, R = S * 0.2 * sc;
        g.arc(cx - R * 0.9, cy + R * 0.2, R * 0.75, 0, Math.PI * 2);
        g.arc(cx, cy - R * 0.25, R, 0, Math.PI * 2);
        g.arc(cx + R * 0.9, cy + R * 0.2, R * 0.75, 0, Math.PI * 2);
        g.rect(cx - R * 1.6, cy + R * 0.2, R * 3.2, R * 0.5);
        g.fill();
      }
    }
  });
  // Truntum: star-flowers on indigo.
  cell(0, 1, () => {
    g.fillStyle = indigo; g.fillRect(0, 0, S, S);
    const n = 6, s = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = (i + 0.5 + (j % 2) * 0.5) * s, y = (j + 0.5) * s;
      g.fillStyle = '#e9d9b0';
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        g.beginPath(); g.ellipse(x + Math.cos(a) * s * 0.17, y + Math.sin(a) * s * 0.17, s * 0.1, s * 0.045, a, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#c98a3a'; g.beginPath(); g.arc(x, y, s * 0.07, 0, Math.PI * 2); g.fill();
    }
  });
  // Striped sail canvas (red / cream / ochre).
  cell(1, 1, () => {
    const stripes = ['#b8402e', '#e9dcc0', '#d09a3a', '#e9dcc0', '#2f5a7a', '#e9dcc0'];
    const n = 12;
    for (let i = 0; i < n; i++) { g.fillStyle = stripes[i % stripes.length]; g.fillRect(0, (i * S) / n, S, S / n + 1); }
    g.globalAlpha = 0.12;
    for (let i = 0; i < 400; i++) { g.fillStyle = i % 2 ? '#000' : '#fff'; g.fillRect(Math.random() * S, Math.random() * S, 2, 8); }
    g.globalAlpha = 1;
  });
  // Old torn sail (alpha holes) for the wreck.
  cell(2, 1, () => {
    g.fillStyle = '#9a8f78'; g.fillRect(0, 0, S, S);
    const r = mulberry32(99);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(60,50,40,${0.1 + r() * 0.2})`; g.beginPath(); g.arc(r() * S, r() * S, 4 + r() * 30, 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      const x = r() * S, y = S * (0.3 + r() * 0.7), R = 6 + r() * 26;
      for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; const rr = R * (0.5 + r()); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.fill();
    }
    // Ragged bottom edge.
    g.beginPath(); g.moveTo(0, S);
    for (let x = 0; x <= S; x += 8) g.lineTo(x, S - 10 - r() * 40);
    g.lineTo(S, S); g.fill();
    g.globalCompositeOperation = 'source-over';
  });
  return c;
}

// Simple rectangle packer for decal atlas regions (shelf packing, fixed order).
function shelfPacker(W, H) {
  let x = 0, y = 0, rowH = 0;
  return (w, h) => {
    if (x + w > W) { x = 0; y += rowH; rowH = 0; }
    const r = { x, y, w, h, u0: x / W, u1: (x + w) / W, v0: 1 - (y + h) / H, v1: 1 - y / H };
    x += w; rowH = Math.max(rowH, h);
    return r;
  };
}

export const SIGN_WORDS = ['Kampung', 'Mercusuar', 'Candi', 'Telaga', 'Pantai Barat', 'Dermaga'];

function decalAtlas(S) {
  const W = S, H = S;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const pack = shelfPacker(W, H);
  const regions = {};
  const k = S / 1024;
  // Wood board background with painted text.
  const board = (r, base) => {
    const grd = g.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    grd.addColorStop(0, base[0]); grd.addColorStop(1, base[1]);
    g.fillStyle = grd; g.fillRect(r.x, r.y, r.w, r.h);
    g.globalAlpha = 0.18;
    const rr = mulberry32(r.x * 13 + r.y);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = rr() > 0.5 ? '#2a170b' : '#d8b48a';
      g.lineWidth = 1 + rr() * 2;
      const yy = r.y + rr() * r.h;
      g.beginPath(); g.moveTo(r.x, yy); g.bezierCurveTo(r.x + r.w * 0.3, yy + (rr() - 0.5) * 6, r.x + r.w * 0.6, yy + (rr() - 0.5) * 6, r.x + r.w, yy); g.stroke();
    }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(30,16,8,0.6)'; g.lineWidth = 4 * k; g.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  };
  const words = [];
  for (const w of SIGN_WORDS) {
    const r = pack(512 * k, 96 * k);
    regions['sign:' + w] = r;
    words.push([r, w]);
  }
  const warung = pack(1024 * k, 200 * k);
  regions.warung = warung;
  const eye = pack(160 * k, 160 * k);
  regions.eye = eye;
  const sachet = pack(320 * k, 160 * k);
  regions.sachet = sachet;
  const poster = pack(160 * k, 160 * k);
  regions.poster = poster;
  const menu = pack(256 * k, 160 * k);
  regions.menu = menu;
  const kerupuk = pack(128 * k, 160 * k);
  regions.kerupuk = kerupuk;
  const plain = pack(64 * k, 64 * k);
  regions.plain = plain;

  function drawText(font) {
    for (const [r, w] of words) {
      board(r, ['#8a5a34', '#5c3a1f']);
      g.fillStyle = '#f3e6c8';
      g.font = `${Math.round(54 * k)}px ${font}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 3 * k;
      g.fillText(w, r.x + r.w / 2, r.y + r.h / 2 + 3 * k, r.w - 40 * k);
      g.shadowBlur = 0;
    }
    // Warung sign: painted board, red lettering with cream outline.
    const r = warung;
    board(r, ['#2f6f5a', '#1d4a3c']);
    g.fillStyle = '#f4e3b5';
    g.fillRect(r.x + 14 * k, r.y + 14 * k, r.w - 28 * k, r.h - 28 * k);
    g.fillStyle = '#b8352a';
    g.font = `${Math.round(92 * k)}px ${font}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Warung Bu Ratih', r.x + r.w / 2, r.y + r.h * 0.42, r.w - 60 * k);
    g.fillStyle = '#2c3c4a';
    g.font = `${Math.round(38 * k)}px ${font}`;
    g.fillText('Kopi  ·  Teh Manis  ·  Gorengan  ·  Mi Rebus', r.x + r.w / 2, r.y + r.h * 0.78, r.w - 60 * k);
    // Menu board (chalk on black).
    g.fillStyle = '#1d2220'; g.fillRect(menu.x, menu.y, menu.w, menu.h);
    g.strokeStyle = '#7a5230'; g.lineWidth = 8 * k; g.strokeRect(menu.x + 4 * k, menu.y + 4 * k, menu.w - 8 * k, menu.h - 8 * k);
    g.fillStyle = '#e8e4d8'; g.textAlign = 'left';
    g.font = `${Math.round(24 * k)}px ${font}`;
    const lines = ['Kopi tubruk  3rb', 'Teh manis  2rb', 'Pisang goreng 1rb', 'Mi rebus  8rb'];
    lines.forEach((l, i) => g.fillText(l, menu.x + 18 * k, menu.y + (34 + i * 34) * k));
  }
  drawText("'Alegreya Sans', 'Trebuchet MS', sans-serif");

  // Boat eye (mata perahu): white almond, black iris, red lid lines.
  {
    const r = eye, cx = r.x + r.w / 2, cy = r.y + r.h / 2, R = r.w * 0.42;
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#c23a2a';
    g.beginPath(); g.ellipse(cx, cy, R, R * 0.62, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4efe2';
    g.beginPath(); g.ellipse(cx, cy, R * 0.86, R * 0.48, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e2b13a'; g.beginPath(); g.arc(cx, cy, R * 0.36, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(cx, cy, R * 0.24, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx - R * 0.08, cy - R * 0.08, R * 0.06, 0, Math.PI * 2); g.fill();
  }
  // Sachet strips (rows of glossy coffee/shampoo packets).
  {
    const r = sachet, cols = ['#c0392b', '#f1c40f', '#1f7a4a', '#2e5c9a', '#8e3a8a', '#e67e22', '#ecf0f1'];
    const rr = mulberry32(5);
    const pw = r.w / 8, ph = r.h / 2;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 8; i++) {
      const x = r.x + i * pw, y = r.y + j * ph;
      const c0 = cols[Math.floor(rr() * cols.length)];
      g.fillStyle = c0; g.fillRect(x + 2, y + 2, pw - 4, ph - 4);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 4, y + 4, pw * 0.25, ph - 8);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + pw * 0.2, y + ph * 0.45, pw * 0.6, ph * 0.18);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x + pw / 2, y + ph * 0.3, pw * 0.14, 0, Math.PI * 2); g.fill();
    }
  }
  // Faded poster.
  {
    const r = poster;
    g.fillStyle = '#d8cfb8'; g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#a33b2b'; g.fillRect(r.x + 10 * k, r.y + 10 * k, r.w - 20 * k, r.h * 0.4);
    g.fillStyle = '#2b4d6e'; g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h * 0.7, r.w * 0.18, 0, Math.PI * 2); g.fill();
  }
  // Kerupuk tin label (red + yellow).
  {
    const r = kerupuk;
    g.fillStyle = '#e8c33a'; g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#c0392b'; g.fillRect(r.x, r.y + r.h * 0.3, r.w, r.h * 0.4);
    g.fillStyle = '#fff3d6';
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(r.x + r.w * (0.2 + i * 0.2), r.y + r.h * 0.5, r.w * 0.07, 0, Math.PI * 2); g.fill(); }
  }
  g.fillStyle = '#ffffff'; g.fillRect(plain.x, plain.y, plain.w, plain.h);
  return { canvas: c, regions, redraw: drawText };
}

// Relief atlas: drawn as height in canvas 2D, then turned into stone albedo + normal map.
function reliefAtlas(S) {
  const W = S, H = S;
  const hc = makeCanvas(W, H);
  const g = hc.getContext('2d');
  const k = S / 1024;
  const regions = {
    panel: { u0: 0, u1: 1, v0: 0.5, v1: 1 }, // top half, 2:1
    kala: { u0: 0, u1: 0.5, v0: 0, v1: 0.5 },
    sulur: { u0: 0.5, u1: 1, v0: 0.25, v1: 0.5 },
    padma: { u0: 0.5, u1: 1, v0: 0, v1: 0.25 },
  };
  g.fillStyle = 'rgb(70,70,70)'; g.fillRect(0, 0, W, H);
  const raised = (v) => `rgb(${v},${v},${v})`;
  g.lineCap = 'round'; g.lineJoin = 'round';

  // --- Main panel (0..1024 x 0..512): frame, sun, four lamps, kneeling figure, waves.
  g.save();
  g.scale(k, k);
  g.fillStyle = raised(200); g.fillRect(0, 0, 1024, 512);
  g.fillStyle = raised(90); g.fillRect(28, 28, 968, 456);
  // Border beading.
  g.fillStyle = raised(230);
  for (let x = 40; x < 990; x += 22) { g.beginPath(); g.arc(x, 16, 7, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(x, 496, 7, 0, Math.PI * 2); g.fill(); }
  // Sun disc with rays (centre top).
  g.fillStyle = raised(215);
  g.beginPath(); g.arc(512, 150, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = raised(205); g.lineWidth = 10;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath(); g.moveTo(512 + Math.cos(a) * 76, 150 + Math.sin(a) * 76); g.lineTo(512 + Math.cos(a) * 104, 150 + Math.sin(a) * 104); g.stroke();
  }
  g.fillStyle = raised(120); g.beginPath(); g.arc(512, 150, 30, 0, Math.PI * 2); g.fill();
  // Four lamps across the bottom, flames, with a curling arrow running right -> left (reversed).
  const lampX = [210, 410, 614, 814];
  lampX.forEach((x, i) => {
    g.fillStyle = raised(210);
    g.fillRect(x - 12, 330, 24, 110); // post
    g.beginPath(); g.ellipse(x, 330, 46, 16, 0, 0, Math.PI * 2); g.fill(); // bowl
    g.fillRect(x - 40, 432, 80, 18);
    g.fillStyle = raised(240);
    g.beginPath(); g.moveTo(x, 252 - i * 4); g.quadraticCurveTo(x + 26, 300, x, 318); g.quadraticCurveTo(x - 26, 300, x, 252 - i * 4); g.fill();
    // Dots counting 1..4 under each lamp (in the "reversed" order: right lamp gets one dot).
    g.fillStyle = raised(225);
    const dots = 4 - i;
    for (let d = 0; d < dots; d++) { g.beginPath(); g.arc(x - (dots - 1) * 9 + d * 18, 470, 6, 0, Math.PI * 2); g.fill(); }
  });
  g.strokeStyle = raised(185); g.lineWidth = 9;
  g.beginPath(); g.moveTo(880, 236); g.bezierCurveTo(760, 196, 640, 226, 512, 236); g.bezierCurveTo(380, 246, 260, 206, 150, 236); g.stroke();
  g.fillStyle = raised(185); g.beginPath(); g.moveTo(130, 236); g.lineTo(166, 216); g.lineTo(166, 256); g.fill();
  // Kneeling figure at left holding a lamp, waves at right.
  g.fillStyle = raised(205);
  g.beginPath(); g.arc(92, 230, 22, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(70, 256); g.quadraticCurveTo(60, 340, 74, 420); g.lineTo(130, 420); g.quadraticCurveTo(128, 340, 112, 256); g.fill();
  g.strokeStyle = raised(200); g.lineWidth = 12;
  g.beginPath(); g.moveTo(110, 290); g.lineTo(150, 270); g.stroke();
  g.strokeStyle = raised(175); g.lineWidth = 8;
  for (let w = 0; w < 4; w++) {
    g.beginPath();
    for (let x = 880; x <= 980; x += 4) g.lineTo(x, 300 + w * 34 + Math.sin((x - 880) * 0.12 + w) * 9);
    g.stroke();
  }
  // Tendrils filling the top corners.
  const tendril = (x, y, s, dir) => {
    g.strokeStyle = raised(170); g.lineWidth = 8 * s;
    g.beginPath();
    for (let t = 0; t < 1; t += 0.02) {
      const a = t * Math.PI * 3.2 * dir;
      const rr = (1 - t) * 60 * s;
      g.lineTo(x + Math.cos(a) * rr + t * 120 * s * dir, y + Math.sin(a) * rr);
    }
    g.stroke();
  };
  tendril(110, 110, 1, 1); tendril(910, 110, 1, -1); tendril(300, 90, 0.7, 1); tendril(720, 90, 0.7, -1);
  g.restore();

  // --- Kala head (0..512 x 512..1024).
  g.save();
  g.translate(0, 512 * k); g.scale(k, k);
  g.fillStyle = raised(150); g.fillRect(0, 0, 512, 512);
  g.fillStyle = raised(215);
  g.beginPath(); g.ellipse(256, 250, 200, 190, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = raised(110);
  g.beginPath(); g.ellipse(170, 200, 50, 40, -0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(342, 200, 50, 40, 0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = raised(250);
  g.beginPath(); g.arc(170, 200, 22, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(342, 200, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = raised(235); g.beginPath(); g.ellipse(256, 280, 40, 60, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = raised(90); g.beginPath(); g.ellipse(256, 380, 130, 50, 0, 0, Math.PI); g.fill();
  g.fillStyle = raised(240);
  for (let i = 0; i < 7; i++) { const x = 150 + i * 35; g.beginPath(); g.moveTo(x, 380); g.lineTo(x + 14, 420); g.lineTo(x + 28, 380); g.fill(); }
  g.strokeStyle = raised(200); g.lineWidth = 14;
  for (let s = -1; s <= 1; s += 2) {
    g.beginPath(); g.moveTo(256 + s * 120, 110); g.bezierCurveTo(256 + s * 220, 40, 256 + s * 250, 140, 256 + s * 200, 160); g.stroke();
  }
  g.restore();

  // --- Sulur (tendril scroll band) (512..1024 x 512..768).
  g.save();
  g.translate(512 * k, 512 * k); g.scale(k, k);
  g.fillStyle = raised(100); g.fillRect(0, 0, 512, 256);
  g.fillStyle = raised(200); g.fillRect(0, 0, 512, 18); g.fillRect(0, 238, 512, 18);
  g.strokeStyle = raised(205); g.lineWidth = 12;
  g.beginPath();
  for (let x = 0; x <= 512; x += 4) g.lineTo(x, 128 + Math.sin((x / 512) * Math.PI * 4) * 50);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    const x = 64 + i * 128, up = i % 2 ? -1 : 1;
    g.lineWidth = 9;
    g.beginPath();
    for (let t = 0; t < 1; t += 0.03) {
      const a = t * Math.PI * 2.4;
      const rr = (1 - t * 0.8) * 46;
      g.lineTo(x + Math.sin(a) * rr, 128 + up * (40 - Math.cos(a) * rr));
    }
    g.stroke();
    g.fillStyle = raised(220);
    g.beginPath(); g.ellipse(x + 30, 128 - up * 60, 22, 10, 0.6 * up, 0, Math.PI * 2); g.fill();
  }
  g.restore();

  // --- Padma (lotus petal frieze) (512..1024 x 768..1024).
  g.save();
  g.translate(512 * k, 768 * k); g.scale(k, k);
  g.fillStyle = raised(90); g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 8; i++) {
    const x = 32 + i * 64;
    g.fillStyle = raised(210);
    g.beginPath(); g.moveTo(x - 30, 230); g.quadraticCurveTo(x - 32, 70, x, 30); g.quadraticCurveTo(x + 32, 70, x + 30, 230); g.fill();
    g.fillStyle = raised(160);
    g.beginPath(); g.moveTo(x - 14, 220); g.quadraticCurveTo(x - 14, 110, x, 80); g.quadraticCurveTo(x + 14, 110, x + 14, 220); g.fill();
  }
  g.restore();

  // Blur for soft carved edges, read heights back.
  const blur = makeCanvas(W, H);
  const bg = blur.getContext('2d');
  try { bg.filter = `blur(${Math.max(1, 2.2 * k)}px)`; } catch { /* filter unsupported: sharp edges */ }
  bg.drawImage(hc, 0, 0);
  const src = bg.getImageData(0, 0, W, H).data;
  const Hf = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) Hf[i] = src[i * 4] / 255;
  const N = tileNoise(321);
  const colC = makeCanvas(W, H);
  const cc = colC.getContext('2d');
  const img = cc.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const u = x / W, v = y / H;
      const h = Hf[i];
      const pit = N.get(u, v, 128, 128);
      const moss = smooth(0.55, 0.75, N.fbm(u, v, 8, 8, 2) + (1 - h) * 0.35);
      const cav = 0.45 + h * 0.6;
      let r = cav * (0.62 + pit * 0.18), gg = cav * (0.63 + pit * 0.18), b = cav * (0.58 + pit * 0.16);
      r = mix(r, r * 0.62, moss); gg = mix(gg, gg * 0.85, moss); b = mix(b, b * 0.5, moss);
      img.data[i * 4] = clamp01(r) * 255; img.data[i * 4 + 1] = clamp01(gg) * 255; img.data[i * 4 + 2] = clamp01(b) * 255; img.data[i * 4 + 3] = 255;
      Hf[i] = h + pit * 0.04;
    }
  }
  cc.putImageData(img, 0, 0);
  const normal = heightToNormal(Hf, W, H, 5, false);
  return { color: colC, normal, regions };
}

function spriteCanvas(S = 64) {
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Public: textures + materials
// ---------------------------------------------------------------------------------------------
export function createPropTextures(ctx) {
  const preset = ctx.engine?.preset || {};
  const hi = preset.name !== 'low';
  const S = hi ? 512 : 256;
  const A = hi ? 1024 : 512;
  const maxAniso = ctx.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
  const aniso = Math.min(maxAniso, hi ? 8 : 2);

  const tex = (canvas, srgb = true, repeat = true) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    t.needsUpdate = true;
    return t;
  };
  const pair = (rec) => ({ map: tex(rec.color), normal: rec.normal ? tex(rec.normal, false) : null });
  const times = {};
  const timed = (name, fn) => { const t = performance.now(); const r = fn(); times[name] = Math.round(performance.now() - t); return r; };

  const out = {
    times,
    wood: timed('wood', () => pair(woodRecipe(S, 101))),
    bamboo: timed('bamboo', () => pair(bambooRecipe(S, 202))),
    gedek: timed('gedek', () => pair(gedekRecipe(S, 303))),
    thatch: timed('thatch', () => pair(thatchRecipe(S, 404))),
    stone: timed('stone', () => pair(stoneRecipe(S, 505))),
    rock: timed('rock', () => pair(rockRecipe(S, 606))),
    plaster: timed('plaster', () => pair(plasterRecipe(S, 707))),
    rooftile: timed('rooftile', () => pair(rooftileRecipe(S, 808))),
    water: timed('water', () => ({ map: tex(waterNoiseRecipe(hi ? 256 : 128, 909).color, false) })),
  };
  const batik = timed('batik', () => batikAtlas(hi ? 256 : 128));
  out.batik = { map: tex(batik, true, false) };
  const decal = timed('decal', () => decalAtlas(A));
  out.decal = { map: tex(decal.canvas, true, false), regions: decal.regions };
  // Redraw sign text once the UI fonts are available (they load asynchronously).
  try {
    document.fonts?.load?.('54px "Alegreya Sans"').then(() => {
      decal.redraw("'Alegreya Sans', 'Trebuchet MS', sans-serif");
      out.decal.map.needsUpdate = true;
    }).catch(() => {});
  } catch { /* ignore */ }
  const relief = timed('relief', () => reliefAtlas(hi ? 768 : 512));
  out.relief = { map: tex(relief.color, true, false), normal: tex(relief.normal, false, false), regions: relief.regions };
  out.sprite = { map: tex(spriteCanvas(64), true, false) };
  return out;
}

// Material table. `tile` = metres per texture repeat (geometry UVs are in metres).
export function createPropMaterials(ctx, T) {
  const M = {};
  const std = (key, o, { tile = 1, cast = true, receive = true, normalScale = 1 } = {}) => {
    const params = { vertexColors: true, roughness: 0.85, metalness: 0, ...o };
    const m = new THREE.MeshStandardMaterial(params);
    if (m.map && tile) { m.map = m.map.clone(); m.map.repeat.set(1 / tile, 1 / tile); m.map.needsUpdate = true; }
    if (m.normalMap && tile) { m.normalMap = m.normalMap.clone(); m.normalMap.repeat.set(1 / tile, 1 / tile); m.normalMap.needsUpdate = true; }
    if (m.normalMap) m.normalScale.set(normalScale, normalScale);
    m.name = 'lentera-' + key;
    M[key] = { material: patchMaterial(m), cast, receive };
    return m;
  };
  std('wood', { map: T.wood.map, normalMap: T.wood.normal, roughness: 0.82 }, { tile: 1.2, normalScale: 0.8 });
  std('bamboo', { map: T.bamboo.map, normalMap: T.bamboo.normal, roughness: 0.6 }, { tile: 1, normalScale: 0.8 });
  std('gedek', { map: T.gedek.map, normalMap: T.gedek.normal, roughness: 0.9 }, { tile: 0.6, normalScale: 1 });
  std('thatch', { map: T.thatch.map, normalMap: T.thatch.normal, roughness: 1 }, { tile: 1.1, normalScale: 1.2 });
  std('stone', { map: T.stone.map, normalMap: T.stone.normal, roughness: 0.92 }, { tile: 2, normalScale: 1.1 });
  std('rock', { map: T.rock.map, normalMap: T.rock.normal, roughness: 0.95 }, { tile: 5, normalScale: 1.2 });
  std('plaster', { map: T.plaster.map, normalMap: T.plaster.normal, roughness: 0.9 }, { tile: 2.5, normalScale: 0.7 });
  std('rooftile', { map: T.rooftile.map, normalMap: T.rooftile.normal, roughness: 0.8 }, { tile: 1, normalScale: 1 });
  std('paint', { roughness: 0.62 }, { tile: 0 });
  std('metal', { roughness: 0.5, metalness: 0.55 }, { tile: 0 });
  std('relief', { map: T.relief.map, normalMap: T.relief.normal, roughness: 0.92 }, { tile: 0, normalScale: 1.4 });
  std('decal', { map: T.decal.map, roughness: 0.75, alphaTest: 0.5, transparent: false }, { tile: 0 });
  std('cloth', { map: T.batik.map, roughness: 0.92, side: THREE.DoubleSide, alphaTest: 0.5 }, { tile: 0 });
  // Unlit HDR glow (windows, lamps, embers, crystals). Vertex colours > 1 feed the bloom pass.
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true });
  glow.name = 'lentera-glow';
  M.glow = { material: patchMaterial(glow), cast: false, receive: false };
  // Soft dark rope / fibre (no texture).
  std('rope', { roughness: 1 }, { tile: 0, cast: true });
  return M;
}
