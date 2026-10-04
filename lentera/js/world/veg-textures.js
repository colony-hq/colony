// Foliage atlas + bark textures for vegetation (owner: setdressing).
// Leaves are painted with canvas 2D, then the colour of transparent texels is bled outward
// (so mipmapped alpha-tested edges do not get dark fringes) and uploaded as a DataTexture.

import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { tileNoise, heightToNormal } from './props-textures.js';

// Atlas layout in a 4x4 grid of the texture (u0, v0 at the bottom-left; v flipped from canvas).
// Rects in canvas pixels for a 1024 atlas, scaled for other sizes.
export const ATLAS = {
  frond: [0, 0, 256, 512],
  banana: [256, 0, 256, 512],
  fern: [512, 0, 256, 256],
  broadleaf: [768, 0, 256, 256],
  banyan: [512, 256, 256, 256],
  bamboo: [768, 256, 256, 256],
  grass: [0, 512, 256, 256],
  reed: [256, 512, 256, 256],
  kamboja: [512, 512, 256, 256],
  shrub: [768, 512, 256, 256],
  stem: [8, 776, 48, 48],
  coconut: [72, 776, 48, 48],
  husk: [136, 776, 48, 48],
  ketapang: [256, 768, 256, 256],
  grass2: [512, 768, 256, 256],
  flowers: [768, 768, 256, 256],
};

export function atlasUV(name, S = 1024) {
  const [x, y, w, h] = ATLAS[name];
  const k = 1024;
  return { u0: x / k, u1: (x + w) / k, v0: 1 - (y + h) / k, v1: 1 - y / k };
}

function leafPath(g, len, wid, tipSharp = 0.6) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid * 0.9, len * 0.15, wid * 1.0, len * (0.5 + tipSharp * 0.1), 0, len);
  g.bezierCurveTo(-wid * 1.0, len * (0.5 + tipSharp * 0.1), -wid * 0.9, len * 0.15, 0, 0);
  g.closePath();
}

function drawLeaf(g, x, y, ang, len, wid, col, rib = true, light = null) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  leafPath(g, len, wid);
  const grd = g.createLinearGradient(-wid, 0, wid, 0);
  grd.addColorStop(0, col[0]);
  grd.addColorStop(0.5, light || col[1]);
  grd.addColorStop(1, col[0]);
  g.fillStyle = grd;
  g.fill();
  if (rib) {
    g.strokeStyle = 'rgba(220,235,160,0.35)';
    g.lineWidth = Math.max(1, wid * 0.08);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, len * 0.92); g.stroke();
  }
  g.restore();
}

function paintAtlas(S) {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const k = S / 1024;
  g.scale(k, k);
  const r = mulberry32(77);
  const R = (a, b) => a + (b - a) * r();
  const cell = (name, fn) => { const [x, y, w, h] = ATLAS[name]; g.save(); g.beginPath(); g.rect(x + 2, y + 2, w - 4, h - 4); g.clip(); g.translate(x, y); fn(w, h); g.restore(); };

  // Palm frond: rachis along the cell, drooping leaflets both sides.
  cell('frond', (w, h) => {
    g.strokeStyle = '#8a8a3a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(w / 2, h - 4); g.lineTo(w / 2, 6); g.stroke();
    for (let i = 0; i < 44; i++) {
      const t = i / 44;
      const y = h - 10 - t * (h - 24);
      const len = (w * 0.5 - 6) * Math.sin(Math.PI * (0.12 + t * 0.85)) * R(0.85, 1.0);
      for (const s of [-1, 1]) {
        const col = r() < 0.15 ? ['#8a8a3a', '#b0a850'] : ['#4f7a2a', '#7aa23a'];
        drawLeaf(g, w / 2, y, s * (Math.PI / 2 + 0.45 + R(-0.08, 0.08)) + Math.PI, len, 5.5, col, false);
      }
    }
  });
  // Banana leaf: broad paddle, pale midrib, slits torn by wind.
  cell('banana', (w, h) => {
    g.save();
    g.translate(w / 2, h - 6);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(w * 0.48, -h * 0.1, w * 0.48, -h * 0.8, 0, -h + 14);
    g.bezierCurveTo(-w * 0.48, -h * 0.8, -w * 0.48, -h * 0.1, 0, 0);
    const grd = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    grd.addColorStop(0, '#4f8a2e'); grd.addColorStop(0.5, '#7ab84a'); grd.addColorStop(1, '#4a8030');
    g.fillStyle = grd; g.fill();
    g.strokeStyle = 'rgba(40,70,20,0.35)'; g.lineWidth = 1.5;
    for (let i = 0; i < 40; i++) { const y = -10 - i * (h - 30) / 40; g.beginPath(); g.moveTo(0, y); g.lineTo(w * 0.45, y - 18); g.moveTo(0, y); g.lineTo(-w * 0.45, y - 18); g.stroke(); }
    g.strokeStyle = '#d8e0a0'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -h + 20); g.stroke();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      const y = -h * R(0.15, 0.85), s = r() < 0.5 ? -1 : 1;
      g.beginPath(); g.moveTo(s * w * 0.5, y - 2); g.lineTo(s * R(8, 30), y - 10); g.lineTo(s * w * 0.5, y + 3); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.restore();
  });
  // Fern frond (pinnate).
  cell('fern', (w, h) => {
    g.strokeStyle = '#3e5a22'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w / 2, h - 4); g.quadraticCurveTo(w / 2 + 6, h / 2, w / 2, 8); g.stroke();
    for (let i = 0; i < 26; i++) {
      const t = i / 26, y = h - 10 - t * (h - 20);
      const len = (w * 0.42) * Math.sin(Math.PI * (0.08 + t * 0.9));
      for (const s of [-1, 1]) drawLeaf(g, w / 2, y, s * (Math.PI / 2 + 0.25) + Math.PI, len, 7, ['#2f5a20', '#5a8a34'], false);
    }
  });
  // Broadleaf cluster: overlapping leaves filling a soft round card.
  const cluster = (w, h, cols, n, len, wid, light) => {
    for (let i = 0; i < n; i++) {
      const a = R(0, Math.PI * 2), rr = Math.sqrt(r()) * w * 0.36;
      const x = w / 2 + Math.cos(a) * rr, y = h / 2 + Math.sin(a) * rr;
      drawLeaf(g, x, y, R(0, Math.PI * 2), len * R(0.75, 1.15), wid * R(0.8, 1.1), cols[i % cols.length], true, light);
    }
  };
  cell('broadleaf', (w, h) => cluster(w, h, [['#2f5a24', '#4f8034'], ['#3a6a2a', '#5f9440'], ['#2a4e20', '#46722e']], 70, 46, 16));
  cell('banyan', (w, h) => cluster(w, h, [['#244a1e', '#3e6e2c'], ['#2c5422', '#4a7a32']], 120, 30, 12));
  cell('shrub', (w, h) => cluster(w, h, [['#2e4e22', '#4a6e30'], ['#3a5a26', '#587a36']], 80, 36, 14));
  cell('ketapang', (w, h) => cluster(w, h, [['#2f5a24', '#4f8a34'], ['#3a6a2a', '#62983e'], ['#6a5a24', '#9a6a2a'], ['#2a4e20', '#46722e']], 60, 56, 22));
  // Bamboo spray: thin lanceolate leaves on twigs.
  cell('bamboo', (w, h) => {
    g.strokeStyle = '#6a7a3a'; g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const x0 = w * 0.5 + R(-20, 20), y0 = 10 + i * (h - 30) / 7;
      g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(x0, y0); g.stroke();
      for (let j = 0; j < 4; j++) drawLeaf(g, x0, y0, R(-0.9, 0.9) + (j % 2 ? 0.4 : -0.4), R(60, 90), 7, ['#4f7a2e', '#7aa448'], false);
    }
  });
  // Grass tufts: blades from the bottom centre.
  const blades = (w, h, n, cols) => {
    for (let i = 0; i < n; i++) {
      const x0 = w / 2 + R(-w * 0.3, w * 0.3);
      const lean = R(-0.5, 0.5);
      const hh = h * R(0.55, 0.98);
      const grd = g.createLinearGradient(0, h, 0, h - hh);
      grd.addColorStop(0, cols[0]); grd.addColorStop(1, cols[1]);
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x0 - 3.5, h);
      g.quadraticCurveTo(x0 + lean * hh * 0.3, h - hh * 0.6, x0 + lean * hh * 0.55, h - hh);
      g.quadraticCurveTo(x0 + lean * hh * 0.3 + 2, h - hh * 0.6, x0 + 3.5, h);
      g.fill();
    }
  };
  cell('grass', (w, h) => blades(w, h, 46, ['#3e5e22', '#9aa84a']));
  cell('grass2', (w, h) => { blades(w, h, 34, ['#4a6224', '#b0a856']); for (let i = 0; i < 6; i++) { g.fillStyle = r() < 0.5 ? '#e8e0b0' : '#d8a8c0'; g.beginPath(); g.arc(w / 2 + R(-60, 60), h * R(0.2, 0.5), R(3, 5), 0, Math.PI * 2); g.fill(); } });
  cell('reed', (w, h) => {
    blades(w, h, 26, ['#5a6a34', '#a8a868']);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#6a4a2a'; const x = w / 2 + R(-50, 50); g.fillRect(x - 3, h * R(0.05, 0.2), 6, 34); }
  });
  // Kamboja: leaf rosette with five-petal white/yellow flowers.
  cell('kamboja', (w, h) => {
    for (let i = 0; i < 9; i++) drawLeaf(g, w / 2, h / 2, (i / 9) * Math.PI * 2, w * 0.42, 18, ['#3a6a2a', '#5a8a3a']);
    for (let f = 0; f < 7; f++) flower(g, w / 2 + R(-40, 40), h / 2 + R(-40, 40), R(12, 16));
  });
  cell('flowers', (w, h) => { for (let f = 0; f < 22; f++) flower(g, R(30, w - 30), R(30, h - 30), R(10, 15)); });
  // Solid swatches.
  const swatch = (name, c1, c2) => { const [x, y, w, h] = ATLAS[name]; const grd = g.createLinearGradient(x, y, x + w, y); grd.addColorStop(0, c1); grd.addColorStop(0.5, c2); grd.addColorStop(1, c1); g.fillStyle = grd; g.fillRect(x - 6, y - 6, w + 12, h + 12); };
  swatch('stem', '#5a7a34', '#7a9a48');
  swatch('coconut', '#5a6a28', '#7a8a3a');
  swatch('husk', '#6a4a28', '#8a6a3a');
  return c;
}

function flower(g, x, y, s) {
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = '#f8f4ea';
    g.beginPath(); g.ellipse(0, -s * 0.6, s * 0.38, s * 0.62, 0.35, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.fillStyle = '#f2c642'; g.beginPath(); g.arc(x, y, s * 0.3, 0, Math.PI * 2); g.fill();
}

// Fill the colour of transparent texels from their opaque surroundings (push-pull pyramid),
// so mipmapped alpha-tested edges keep leaf colour instead of fringing dark; pack into a
// row-flipped DataTexture (v = 1 at the top of the painted canvas).
function toDataTexture(canvas, aniso) {
  const W = canvas.width, H = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  // Level 0 (alpha-weighted colour).
  const levels = [];
  let w = W, h = H;
  let col = new Float32Array(w * h * 3), wt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = src[i * 4 + 3] > 127 ? 1 : 0;
    wt[i] = a;
    col[i * 3] = src[i * 4] * a; col[i * 3 + 1] = src[i * 4 + 1] * a; col[i * 3 + 2] = src[i * 4 + 2] * a;
  }
  levels.push({ w, h, col, wt });
  while (w > 1 && h > 1) {
    const nw = w >> 1, nh = h >> 1;
    const nc = new Float32Array(nw * nh * 3), nwt = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const o = y * nw + x;
      let cr = 0, cg = 0, cb = 0, sw = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = (y * 2 + dy) * w + (x * 2 + dx);
        cr += col[i * 3]; cg += col[i * 3 + 1]; cb += col[i * 3 + 2]; sw += wt[i];
      }
      nc[o * 3] = cr; nc[o * 3 + 1] = cg; nc[o * 3 + 2] = cb; nwt[o] = sw;
    }
    w = nw; h = nh; col = nc; wt = nwt;
    levels.push({ w, h, col, wt });
  }
  // Pull: normalise each level, fill empty texels from the parent level.
  for (let l = levels.length - 1; l >= 0; l--) {
    const L = levels[l];
    const P = levels[l + 1];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const i = y * L.w + x;
      if (L.wt[i] > 0) {
        const k = 1 / L.wt[i];
        L.col[i * 3] *= k; L.col[i * 3 + 1] *= k; L.col[i * 3 + 2] *= k; L.wt[i] = 1;
      } else if (P) {
        const j = Math.min(P.h - 1, y >> 1) * P.w + Math.min(P.w - 1, x >> 1);
        L.col[i * 3] = P.col[j * 3]; L.col[i * 3 + 1] = P.col[j * 3 + 1]; L.col[i * 3 + 2] = P.col[j * 3 + 2]; L.wt[i] = 1;
      }
    }
  }
  const base = levels[0].col;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const row = (H - 1 - y) * W;
    for (let x = 0; x < W; x++) {
      const i = y * W + x, o = (row + x) * 4;
      const a = src[i * 4 + 3];
      if (a > 127) { out[o] = src[i * 4]; out[o + 1] = src[i * 4 + 1]; out[o + 2] = src[i * 4 + 2]; }
      else { out[o] = base[i * 3]; out[o + 1] = base[i * 3 + 1]; out[o + 2] = base[i * 3 + 2]; }
      out[o + 3] = a;
    }
  }
  const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Bark (vertical fissures) and palm trunk (leaf-scar rings) textures + normal maps.
function barkTex(S, seed, rings) {
  const N = tileNoise(seed);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const v = 1 - (y + 0.5) / S;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      let h, cr, cg, cb;
      if (rings) {
        const ring = 0.5 + 0.5 * Math.sin((v * 8 + N.get(u, v, 6, 2) * 0.4) * Math.PI * 2);
        const fib = N.fbm(u, v, 64, 8, 2);
        h = ring * 0.7 + fib * 0.3;
        const k = 0.55 + ring * 0.3 + (fib - 0.5) * 0.2;
        cr = k * 0.78; cg = k * 0.7; cb = k * 0.58;
      } else {
        const f = 1 - Math.abs(N.fbm(u, v, 12, 3, 4) * 2 - 1);
        const ridge = Math.pow(f, 3);
        const grain = N.fbm(u, v, 96, 24, 2);
        h = ridge * 0.8 + grain * 0.2;
        const k = 0.35 + ridge * 0.45 + (grain - 0.5) * 0.15;
        const lich = N.fbm(u + 0.3, v, 5, 5, 3) > 0.62 ? 0.25 : 0;
        cr = k * 0.72 + lich * 0.3; cg = k * 0.64 + lich * 0.35; cb = k * 0.54 + lich * 0.25;
      }
      const i = y * S + x;
      H[i] = h;
      img.data[i * 4] = Math.min(255, cr * 255); img.data[i * 4 + 1] = Math.min(255, cg * 255); img.data[i * 4 + 2] = Math.min(255, cb * 255); img.data[i * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { color: c, normal: heightToNormal(H, S, S, rings ? 2 : 3) };
}

export function createVegTextures(ctx) {
  const hi = (ctx.engine?.preset?.name || 'medium') !== 'low';
  const maxAniso = ctx.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
  const aniso = Math.min(maxAniso, hi ? 4 : 1);
  const t0 = performance.now();
  const painted = paintAtlas(hi ? 1024 : 512);
  const t1 = performance.now();
  const atlas = toDataTexture(painted, aniso);
  const t2 = performance.now();
  const mk = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; return t; };
  const S = hi ? 256 : 128;
  const bark = barkTex(S, 31, false);
  const palm = barkTex(S, 47, true);
  const times = { paint: Math.round(t1 - t0), bleed: Math.round(t2 - t1), bark: Math.round(performance.now() - t2) };
  return {
    times,
    atlas,
    bark: { map: mk(bark.color, true), normal: mk(bark.normal, false) },
    palm: { map: mk(palm.color, true), normal: mk(palm.normal, false) },
  };
}
