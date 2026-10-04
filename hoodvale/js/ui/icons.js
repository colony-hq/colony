// Procedural icons for the UI: items (from items[id].icon {shape, color, color2}), skills, map
// markers and side-panel tab glyphs. Owner: ui builder.
//
// Items and skills are painted on a 64x64 canvas, shaded with a soft top-left key light, then
// given a crisp dark outline and a drop shadow (RuneScape-style readability on any background).
// Results are cached as data URLs: itemIcon(id) / skillIcon(id) -> string, usable in <img src>.
// Tab glyphs are inline SVG strings: tabSvg(name).

import { ITEMS } from '../data/items.js';

const S = 64;
const cache = new Map();

// ---------------------------------------------------------------------------------- colour
function rgb(hex) {
  const h = String(hex || '#888').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
// f > 0 lightens toward white, f < 0 darkens toward black.
export function shade(hex, f) {
  const [r, g, b] = rgb(hex);
  if (f >= 0) return toHex([r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f]);
  return toHex([r * (1 + f), g * (1 + f), b * (1 + f)]);
}
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
function rgba(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }

// ---------------------------------------------------------------------------------- canvas helpers
function canvas(w = S, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function poly(g, pts, close = true) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
}
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function fill(g, style) { g.fillStyle = style; g.fill(); }
function stroke(g, style, lw = 1.5) { g.strokeStyle = style; g.lineWidth = lw; g.stroke(); }
function lg(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((c, i) => gr.addColorStop(Array.isArray(c) ? c[0] : i / (stops.length - 1), Array.isArray(c) ? c[1] : c));
  return gr;
}
function rg(g, x, y, r0, r1, stops) {
  const gr = g.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach((c, i) => gr.addColorStop(Array.isArray(c) ? c[0] : i / (stops.length - 1), Array.isArray(c) ? c[1] : c));
  return gr;
}
// Metal fill across a horizontal span (bright left edge, dark right edge).
function metal(g, c, x0, x1) { return lg(g, x0, 0, x1, 0, [shade(c, 0.55), shade(c, 0.15), c, shade(c, -0.35)]); }
function wood(g, c, x0, x1) { return lg(g, x0, 0, x1, 0, [shade(c, 0.25), c, shade(c, -0.3)]); }
function diag(g, angle, fn, cx = 32, cy = 32, s = 1) { g.save(); g.translate(cx, cy); g.rotate(angle); if (s !== 1) g.scale(s, s); fn(); g.restore(); }
function line(g, x0, y0, x1, y1, style, lw = 1.5, cap = 'round') {
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineCap = cap; stroke(g, style, lw); g.lineCap = 'butt';
}
function sparkle(g, x, y, r, color = '#ffffff') {
  g.save();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
  g.restore();
}
const D45 = Math.PI / 4;
const WOOD = '#8a5a32';
const GRIP = '#4e3220';

// ---------------------------------------------------------------------------------- item shapes
// Each painter: (g, c, c2, item) on a 64x64 canvas, origin top-left.
function bladeWeapon(g, c, c2, { len = 34, w = 7, guard = 20, grip = 12, pommel = 3.5, broad = false }) {
  const top = -28, bot = top + len;
  g.save();
  poly(g, [[-w / 2, bot], [-w / 2, top + 7], [0, top], [w / 2, top + 7], [w / 2, bot]]);
  fill(g, metal(g, c, -w / 2, w / 2));
  stroke(g, shade(c, -0.55), 1);
  line(g, broad ? -1 : 0, bot - 2, broad ? -1 : 0, top + 9, rgba(shade(c, -0.45), 0.8), broad ? 2 : 1.2);
  line(g, -w / 2 + 1.2, bot - 1, -w / 2 + 1.2, top + 8, 'rgba(255,255,255,0.55)', 0.9);
  rr(g, -guard / 2, bot, guard, 4.5, 2);
  fill(g, lg(g, 0, bot, 0, bot + 4.5, [shade(c2, 0.4), c2, shade(c2, -0.35)]));
  stroke(g, shade(c2, -0.6), 0.8);
  rr(g, -2.6, bot + 4.5, 5.2, grip, 1.5);
  fill(g, wood(g, GRIP, -2.6, 2.6));
  for (let y = bot + 6.5; y < bot + 4.5 + grip - 1; y += 2.6) line(g, -2.6, y, 2.6, y + 1.2, 'rgba(0,0,0,0.35)', 0.8);
  circle(g, 0, bot + 4.5 + grip + pommel - 0.5, pommel);
  fill(g, rg(g, -1, bot + 4.5 + grip + pommel - 1.5, 0.5, pommel + 1, [shade(c2, 0.6), c2, shade(c2, -0.4)]));
  g.restore();
}

function axeHead(g, c) {
  g.beginPath();
  g.moveTo(-2, -24); g.lineTo(-9, -27);
  g.quadraticCurveTo(-19, -29, -20, -24);
  g.quadraticCurveTo(-22, -15, -19, -5);
  g.quadraticCurveTo(-17, -1, -10, -4);
  g.lineTo(-2, -11);
  g.closePath();
  fill(g, lg(g, -21, -26, -2, -8, [shade(c, 0.6), shade(c, 0.1), shade(c, -0.25)]));
  stroke(g, shade(c, -0.55), 1);
  // Bright edge bevel.
  g.beginPath(); g.moveTo(-19, -26); g.quadraticCurveTo(-21.5, -15, -18.5, -5.5); stroke(g, 'rgba(255,255,255,0.7)', 1.4);
  rr(g, 1.5, -24, 5, 11, 1.5); fill(g, metal(g, c, 1.5, 6.5)); stroke(g, shade(c, -0.55), 0.8);
}
function haft(g, c = WOOD, from = -27, to = 27, w = 5) {
  rr(g, -w / 2, from, w, to - from, 2);
  fill(g, wood(g, c, -w / 2, w / 2));
  stroke(g, shade(c, -0.55), 0.9);
  line(g, -w / 2 + 1.2, from + 2, -w / 2 + 1.2, to - 2, 'rgba(255,255,255,0.25)', 0.8);
}

const SIGIL_GLYPH = {
  spark_sigil: (g) => { poly(g, [[3, -13], [-6, 1], [0, 1], [-3, 13], [7, -3], [1, -3], [5, -13]]); },
  tide_sigil: (g) => { g.beginPath(); for (let k = 0; k < 2; k++) { const y = -4 + k * 8; g.moveTo(-11, y); g.bezierCurveTo(-6, y - 7, -2, y + 5, 2, y - 1); g.bezierCurveTo(6, y - 7, 9, y + 2, 12, y - 2); } },
  stone_sigil: (g) => { poly(g, [[0, -12], [11, 9], [-11, 9]]); },
  ember_sigil: (g) => { g.beginPath(); g.moveTo(0, -13); g.bezierCurveTo(9, -3, 9, 6, 0, 12); g.bezierCurveTo(-9, 6, -8, -2, -3, -6); g.bezierCurveTo(-3, 0, 0, 1, 0, -13); },
  thought_sigil: (g) => { g.beginPath(); g.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2); g.moveTo(4, 0); g.arc(0, 0, 4, 0, Math.PI * 2); },
  path_sigil: (g) => { poly(g, [[-10, 6], [2, 6], [2, 11], [12, 0], [2, -11], [2, -6], [-10, -6]]); },
  insight_sigil: (g) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 5 : 13; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); },
};

const SHAPES = {
  dagger: (g, c, c2) => diag(g, D45, () => bladeWeapon(g, c, c2, { len: 26, w: 8, guard: 17, grip: 10 }), 34, 36),
  sword: (g, c, c2) => diag(g, D45, () => bladeWeapon(g, c, c2, { len: 36, w: 6.5, guard: 19, grip: 11 }), 32, 32),
  greatsword: (g, c, c2) => diag(g, D45, () => bladeWeapon(g, c, c2, { len: 40, w: 9, guard: 24, grip: 13, pommel: 4, broad: true }), 30, 30, 0.92),
  axe: (g, c) => diag(g, D45, () => { haft(g, WOOD, -26, 27); axeHead(g, c); }, 33, 31),
  pickaxe: (g, c) => diag(g, D45, () => {
    haft(g, WOOD, -22, 28);
    g.beginPath();
    g.moveTo(-25, -10); g.quadraticCurveTo(-12, -29, 0, -28); g.quadraticCurveTo(12, -29, 25, -10);
    g.quadraticCurveTo(12, -21, 0, -20); g.quadraticCurveTo(-12, -21, -25, -10); g.closePath();
    fill(g, lg(g, 0, -30, 0, -14, [shade(c, 0.6), c, shade(c, -0.35)]));
    stroke(g, shade(c, -0.55), 1);
    rr(g, -4, -25, 8, 9, 2); fill(g, shade(c, -0.25)); stroke(g, shade(c, -0.6), 0.8);
  }, 32, 34),
  hammer: (g, c) => diag(g, D45, () => {
    haft(g, WOOD, -16, 28);
    rr(g, -13, -27, 26, 12, 2.5);
    fill(g, lg(g, 0, -27, 0, -15, [shade(c, 0.6), c, shade(c, -0.4)]));
    stroke(g, shade(c, -0.6), 1);
    line(g, -11, -24, 11, -24, 'rgba(255,255,255,0.5)', 1);
    rr(g, -15, -25, 3, 8, 1); fill(g, shade(c, -0.2));
    rr(g, 12, -25, 3, 8, 1); fill(g, shade(c, -0.2));
  }, 32, 33),
  knife: (g, c) => diag(g, D45, () => {
    g.beginPath(); g.moveTo(-3, 3); g.lineTo(-3, -18); g.lineTo(1, -27); g.quadraticCurveTo(6, -15, 4, 3); g.closePath();
    fill(g, metal(g, c, -3, 5)); stroke(g, shade(c, -0.55), 1);
    line(g, -1.8, 1, -1.8, -18, 'rgba(255,255,255,0.6)', 1);
    rr(g, -3.5, 3, 7.5, 21, 2.5); fill(g, wood(g, '#6b4226', -3.5, 4)); stroke(g, '#2a170b', 0.9);
    for (const y of [8, 18]) { circle(g, 0.3, y, 1.3); fill(g, '#d8d2c0'); }
  }, 32, 32),
  chisel: (g, c) => diag(g, D45, () => {
    rr(g, -2.5, -27, 5, 25, 1); fill(g, metal(g, c, -2.5, 2.5)); stroke(g, shade(c, -0.55), 0.9);
    poly(g, [[-2.5, -27], [2.5, -27], [3.5, -29], [-3.5, -29]]); fill(g, shade(c, 0.5));
    rr(g, -4, -3, 8, 4, 1); fill(g, '#b08a3a');
    rr(g, -4.5, 1, 9, 24, 4); fill(g, wood(g, '#a0603a', -4.5, 4.5)); stroke(g, '#3a2010', 0.9);
  }, 32, 32),
  needle: (g, c) => {
    diag(g, D45, () => {
      line(g, 0, 26, 0, -24, shade(c, -0.5), 3.4);
      line(g, 0, 26, 0, -24, c, 2.2);
      line(g, -0.5, 20, -0.5, -20, '#ffffff', 0.7);
      ell(g, 0, -20, 1.6, 3.4); fill(g, '#2a2a2a');
    });
    g.beginPath(); g.moveTo(43, 14); g.bezierCurveTo(56, 6, 58, 28, 44, 28); g.bezierCurveTo(30, 28, 36, 46, 50, 48);
    stroke(g, '#c0392b', 2.2);
  },
  net: (g, c) => diag(g, D45, () => {
    haft(g, WOOD, 0, 28, 4.5);
    g.save(); ell(g, 0, -12, 15, 16); g.clip();
    fill(g, rgba(c, 0.18));
    for (let k = -30; k <= 30; k += 6) { line(g, k - 16, -30, k + 16, 6, rgba(c, 0.95), 1.2); line(g, k + 16, -30, k - 16, 6, rgba(c, 0.95), 1.2); }
    g.restore();
    ell(g, 0, -12, 15, 16); stroke(g, '#3a2414', 4); ell(g, 0, -12, 15, 16); stroke(g, WOOD, 2.4);
  }, 32, 32),
  rod: (g, c) => {
    diag(g, D45, () => {
      g.beginPath(); g.moveTo(-2, 28); g.lineTo(2, 28); g.lineTo(0.7, -29); g.lineTo(-0.7, -29); g.closePath();
      fill(g, wood(g, c, -2, 2)); stroke(g, shade(c, -0.6), 0.8);
      rr(g, -3, 12, 6, 15, 2.5); fill(g, wood(g, '#c9a46a', -3, 3)); stroke(g, '#5a3a1a', 0.8);
      circle(g, 5, 10, 4.2); fill(g, metal(g, '#9aa0a8', 1, 9)); stroke(g, '#2a2a2a', 0.8);
      circle(g, 5, 10, 1.4); fill(g, '#2a2a2a');
    });
    g.beginPath(); g.moveTo(52, 12); g.quadraticCurveTo(58, 30, 54, 44); stroke(g, 'rgba(255,255,255,0.85)', 0.9);
    g.beginPath(); g.arc(51.5, 45, 2.5, 0, Math.PI); stroke(g, '#c8ccd2', 1.2);
  },
  harpoon: (g, c) => diag(g, D45, () => {
    haft(g, WOOD, -14, 28, 4);
    poly(g, [[0, -29], [5.5, -15], [2, -16], [2, -12], [-2, -12], [-2, -16], [-5.5, -15]]);
    fill(g, metal(g, c, -5.5, 5.5)); stroke(g, shade(c, -0.6), 1);
    poly(g, [[-2, -8], [-7, -3], [-2, -5]]); fill(g, shade(c, -0.1)); stroke(g, shade(c, -0.6), 0.8);
    poly(g, [[2, -8], [7, -3], [2, -5]]); fill(g, shade(c, -0.1)); stroke(g, shade(c, -0.6), 0.8);
    for (const y of [-9, 22]) { rr(g, -2.8, y, 5.6, 3, 1); fill(g, '#8a8f95'); }
  }, 32, 32),
  bait: (g, c) => {
    const worms = [[[12, 40], [20, 20], [34, 46], [44, 26]], [[18, 50], [30, 36], [40, 58], [54, 40]], [[22, 22], [30, 12], [42, 24], [50, 12]]];
    for (const [a, b, d, e] of worms) {
      g.beginPath(); g.moveTo(...a); g.bezierCurveTo(...b, ...d, ...e); g.lineCap = 'round';
      stroke(g, shade(c, -0.35), 6.5); g.beginPath(); g.moveTo(...a); g.bezierCurveTo(...b, ...d, ...e); stroke(g, c, 4.5);
      g.beginPath(); g.moveTo(a[0], a[1] - 1); g.bezierCurveTo(b[0], b[1] - 1, d[0], d[1] - 1, e[0], e[1] - 1); stroke(g, 'rgba(255,255,255,0.35)', 1.2);
    }
    g.lineCap = 'butt';
  },
  feather: (g, c) => diag(g, D45 * 0.9, () => {
    g.beginPath(); g.moveTo(0, -27);
    g.bezierCurveTo(-12, -20, -13, 2, -3, 16); g.lineTo(0, 16);
    g.bezierCurveTo(10, 4, 12, -16, 0, -27); g.closePath();
    fill(g, lg(g, -12, 0, 12, 0, [shade(c, -0.12), c, shade(c, -0.25)]));
    stroke(g, shade(c, -0.5), 1);
    for (let y = -20; y < 12; y += 5) { line(g, 0, y, -9, y + 6, rgba(shade(c, -0.4), 0.6), 0.8); line(g, 0, y, 8, y + 5, rgba(shade(c, -0.4), 0.6), 0.8); }
    poly(g, [[-11, -2], [-6, -1], [-10, 3]]); fill(g, 'rgba(0,0,0,0.25)');
    line(g, 0, -25, 0, 28, '#d8cfb8', 1.8);
    line(g, 0, 16, 0, 28, '#a89c80', 1.8);
  }, 30, 32),
  bucket: (g, c, c2) => {
    g.beginPath(); g.arc(32, 22, 17, Math.PI * 1.05, Math.PI * 1.95); stroke(g, '#2a2a2a', 3.4); g.beginPath(); g.arc(32, 22, 17, Math.PI * 1.05, Math.PI * 1.95); stroke(g, '#9aa0a8', 1.8);
    poly(g, [[14, 22], [50, 22], [45, 54], [19, 54]]);
    fill(g, wood(g, c, 14, 50)); stroke(g, shade(c, -0.6), 1.2);
    for (const x of [22, 29, 36, 43]) line(g, x, 23, x - (x - 32) * 0.15, 53, rgba(shade(c, -0.5), 0.7), 0.9);
    for (const y of [28, 47]) { const k = (y - 22) / 32; poly(g, [[14 + 5 * k - 0.5, y], [50 - 5 * k + 0.5, y], [50 - 5 * (k + 0.1) + 0.5, y + 3], [14 + 5 * (k + 0.1) - 0.5, y + 3]]); fill(g, metal(g, '#8a8f95', 14, 50)); }
    ell(g, 32, 22, 18, 5); fill(g, c2 ? lg(g, 14, 18, 50, 26, [shade(c2, 0.3), c2, shade(c2, -0.2)]) : '#2a1a0e'); stroke(g, shade(c, -0.6), 1.2);
    if (c2) { ell(g, 27, 21, 6, 1.5); fill(g, 'rgba(255,255,255,0.55)'); }
  },
  pot: (g, c, c2) => {
    g.beginPath(); g.moveTo(22, 20); g.bezierCurveTo(6, 30, 8, 56, 32, 56); g.bezierCurveTo(56, 56, 58, 30, 42, 20); g.closePath();
    fill(g, rg(g, 25, 34, 2, 30, [shade(c, 0.35), c, shade(c, -0.45)])); stroke(g, shade(c, -0.6), 1.2);
    line(g, 13, 38, 51, 38, rgba(shade(c, -0.4), 0.6), 1);
    ell(g, 32, 19, 12, 4); fill(g, shade(c, 0.1)); stroke(g, shade(c, -0.6), 1.2);
    if (c2) { g.beginPath(); g.ellipse(32, 18, 10, 6, 0, Math.PI, 0); g.closePath(); fill(g, lg(g, 0, 11, 0, 19, ['#ffffff', c2])); }
    else { ell(g, 32, 19, 9, 2.6); fill(g, '#2a160a'); }
  },
  grain: (g, c) => {
    for (const [x, rot] of [[24, -0.25], [33, 0], [42, 0.25]]) {
      diag(g, rot, () => {
        line(g, 0, 26, 0, -8, '#9a8a3a', 1.6);
        for (let i = 0; i < 6; i++) {
          const y = -6 - i * 4;
          ell(g, -2.6, y, 2.4, 4, -0.5); fill(g, lg(g, -5, y - 4, 0, y + 4, [shade(c, 0.4), c, shade(c, -0.35)])); stroke(g, shade(c, -0.55), 0.6);
          ell(g, 2.6, y + 1.5, 2.4, 4, 0.5); fill(g, lg(g, 0, y - 3, 5, y + 5, [shade(c, 0.3), c, shade(c, -0.4)])); stroke(g, shade(c, -0.55), 0.6);
        }
        line(g, 0, -30, 0, -40, rgba(shade(c, 0.2), 0.9), 0.7);
      }, x, 34);
    }
  },
  egg: (g, c) => {
    g.beginPath(); g.moveTo(32, 10); g.bezierCurveTo(48, 10, 52, 40, 46, 48); g.bezierCurveTo(40, 58, 24, 58, 18, 48); g.bezierCurveTo(12, 40, 16, 10, 32, 10); g.closePath();
    fill(g, rg(g, 26, 26, 2, 30, [shade(c, 0.5), c, shade(c, -0.3)])); stroke(g, shade(c, -0.5), 1);
    ell(g, 25, 24, 4, 7, 0.3); fill(g, 'rgba(255,255,255,0.6)');
    for (const [x, y] of [[36, 40], [40, 30], [29, 46]]) { circle(g, x, y, 1); fill(g, rgba(shade(c, -0.4), 0.6)); }
  },
  flax: (g, c) => {
    for (const [x, rot] of [[22, -0.3], [32, 0], [42, 0.3]]) diag(g, rot, () => {
      line(g, 0, 28, 0, -12, '#4f7f2e', 2);
      line(g, 0, 6, -6, -2, '#4f7f2e', 1.4);
      for (const [fx, fy, r] of [[0, -16, 5.5], [-7, -4, 4]]) {
        for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; ell(g, fx + Math.cos(a) * r * 0.55, fy + Math.sin(a) * r * 0.55, r * 0.55, r * 0.35, a); fill(g, lg(g, fx - r, fy - r, fx + r, fy + r, [shade(c, 0.35), c, shade(c, -0.3)])); }
        circle(g, fx, fy, r * 0.28); fill(g, '#f2e08a');
      }
    }, x, 32);
  },
  string: (g, c) => {
    for (let i = 0; i < 4; i++) { ell(g, 30 + i * 2, 30 + i * 1.5, 19 - i, 13 - i * 0.5, -0.35); stroke(g, shade(c, -0.45), 3.4); ell(g, 30 + i * 2, 30 + i * 1.5, 19 - i, 13 - i * 0.5, -0.35); stroke(g, c, 1.8); }
    g.beginPath(); g.moveTo(44, 40); g.bezierCurveTo(52, 46, 50, 54, 42, 56); stroke(g, shade(c, -0.45), 3.2); g.beginPath(); g.moveTo(44, 40); g.bezierCurveTo(52, 46, 50, 54, 42, 56); stroke(g, c, 1.8);
  },
  hide: (g, c) => {
    g.beginPath();
    g.moveTo(32, 8); g.quadraticCurveTo(38, 10, 39, 15); g.lineTo(52, 9); g.quadraticCurveTo(50, 18, 45, 22);
    g.quadraticCurveTo(50, 34, 46, 44); g.lineTo(55, 54); g.quadraticCurveTo(44, 54, 39, 50); g.quadraticCurveTo(34, 56, 32, 58);
    g.quadraticCurveTo(30, 56, 25, 50); g.quadraticCurveTo(20, 54, 9, 54); g.lineTo(18, 44); g.quadraticCurveTo(14, 34, 19, 22);
    g.quadraticCurveTo(14, 18, 12, 9); g.lineTo(25, 15); g.quadraticCurveTo(26, 10, 32, 8); g.closePath();
    fill(g, rg(g, 28, 28, 3, 30, [shade(c, 0.3), c, shade(c, -0.35)])); stroke(g, shade(c, -0.6), 1.2);
    for (const [x, y, r] of [[28, 26, 3], [37, 33, 2.5], [27, 40, 2]]) { circle(g, x, y, r); fill(g, rgba(shade(c, -0.3), 0.45)); }
    line(g, 32, 14, 32, 52, rgba(shade(c, -0.4), 0.5), 1);
  },
  thread: (g, c) => {
    rr(g, 18, 12, 28, 6, 2); fill(g, wood(g, '#a0714f', 18, 46)); stroke(g, '#3a2414', 1);
    rr(g, 18, 46, 28, 6, 2); fill(g, wood(g, '#a0714f', 18, 46)); stroke(g, '#3a2414', 1);
    rr(g, 21, 18, 22, 28, 3); fill(g, lg(g, 21, 0, 43, 0, [shade(c, 0.3), c, shade(c, -0.35)])); stroke(g, shade(c, -0.55), 1);
    for (let y = 21; y < 45; y += 3) line(g, 21.5, y, 42.5, y + 1.5, rgba(shade(c, -0.35), 0.7), 0.8);
    g.beginPath(); g.moveTo(43, 30); g.bezierCurveTo(54, 30, 52, 44, 58, 50); stroke(g, c, 1.4);
  },
  bones: (g, c, c2) => {
    const bone = (s) => {
      rr(g, -3.6 * s, -17 * s, 7.2 * s, 34 * s, 3 * s); fill(g, lg(g, -4 * s, 0, 4 * s, 0, [shade(c, 0.4), c, shade(c, -0.25)]));
      for (const [x, y] of [[-3.8, -19], [3.8, -19], [-3.8, 19], [3.8, 19]]) { circle(g, x * s, y * s, 5.2 * s); fill(g, rg(g, x * s - 1, y * s - 1, 0.5, 6 * s, [shade(c, 0.5), c, shade(c, -0.3)])); }
      g.save(); g.globalCompositeOperation = 'destination-over'; g.restore();
    };
    if (c2) { diag(g, -D45, () => bone(1.1), 32, 32); diag(g, D45, () => bone(1.1), 32, 32); }
    else diag(g, D45, () => bone(1), 32, 32);
  },
  pouch: (g, c, c2) => {
    if (c2) { circle(g, 44, 18, 8); fill(g, rg(g, 41, 15, 1, 9, [shade(c2, 0.6), c2, shade(c2, -0.35)])); stroke(g, shade(c2, -0.6), 1); g.font = 'bold 9px serif'; g.fillStyle = shade(c2, -0.5); g.textAlign = 'center'; g.fillText('C', 44, 21.5); }
    g.beginPath(); g.moveTo(24, 22); g.bezierCurveTo(8, 32, 8, 56, 32, 56); g.bezierCurveTo(56, 56, 56, 32, 40, 22); g.closePath();
    fill(g, rg(g, 26, 36, 3, 28, [shade(c, 0.35), c, shade(c, -0.4)])); stroke(g, shade(c, -0.6), 1.2);
    g.beginPath(); g.moveTo(24, 22); g.lineTo(19, 13); g.lineTo(27, 17); g.lineTo(32, 11); g.lineTo(37, 17); g.lineTo(45, 13); g.lineTo(40, 22); g.closePath();
    fill(g, shade(c, -0.1)); stroke(g, shade(c, -0.6), 1);
    rr(g, 22, 20, 20, 4, 2); fill(g, '#d8c48a'); stroke(g, '#5a4a2a', 0.8);
  },
  logs: (g, c) => {
    const log = (x0, y, len, r) => {
      rr(g, x0, y - r, len, 2 * r, r * 0.9); fill(g, lg(g, 0, y - r, 0, y + r, [shade(c, 0.15), c, shade(c, -0.45)])); stroke(g, shade(c, -0.6), 1);
      for (let x = x0 + 5; x < x0 + len - 6; x += 7) line(g, x, y - r + 2, x + 3, y + r - 2, rgba(shade(c, -0.5), 0.55), 0.9);
      ell(g, x0 + len, y, r * 0.55, r); fill(g, rg(g, x0 + len, y, 0.5, r, [mix('#f0d49a', c, 0.25), mix('#d4a868', c, 0.35), mix('#b88a50', c, 0.4)])); stroke(g, shade(c, -0.55), 1);
      ell(g, x0 + len, y, r * 0.28, r * 0.5); stroke(g, rgba(shade(c, -0.3), 0.7), 0.8);
    };
    diag(g, -0.42, () => { log(-24, -7, 40, 8.5); log(-20, 9, 40, 8.5); }, 30, 33);
  },
  ore: (g, c) => {
    const base = c === '#2b2b2b' ? '#3d3936' : mix('#7a7068', c, 0.18);
    poly(g, [[12, 40], [16, 22], [28, 13], [44, 15], [54, 28], [52, 46], [38, 54], [20, 52]]);
    fill(g, rg(g, 26, 24, 3, 36, [shade(base, 0.35), base, shade(base, -0.45)])); stroke(g, shade(base, -0.6), 1.2);
    poly(g, [[28, 13], [32, 28], [16, 22]]); fill(g, rgba('#ffffff', 0.1));
    poly(g, [[32, 28], [54, 28], [52, 46]]); fill(g, rgba('#000000', 0.12));
    for (const [x, y, s] of [[24, 30, 1], [40, 24, 0.8], [38, 42, 1.1], [24, 44, 0.7]]) {
      poly(g, [[x - 5 * s, y], [x - 1 * s, y - 5 * s], [x + 5 * s, y - 2 * s], [x + 4 * s, y + 4 * s], [x - 2 * s, y + 5 * s]]);
      fill(g, lg(g, x - 5, y - 5, x + 5, y + 5, [shade(c, 0.55), c, shade(c, -0.35)])); stroke(g, shade(c, -0.55), 0.8);
    }
  },
  shard: (g, c, c2) => {
    const c2b = c2 || shade(c, -0.3);
    const crystal = (s) => {
      poly(g, [[0, -26 * s], [8 * s, -14 * s], [8 * s, 16 * s], [0, 26 * s], [-8 * s, 16 * s], [-8 * s, -14 * s]]);
      fill(g, lg(g, -8 * s, 0, 8 * s, 0, [shade(c, 0.5), c, c2b]));
      stroke(g, shade(c2b, -0.5), 1);
      poly(g, [[0, -26 * s], [0, 26 * s], [-8 * s, 16 * s], [-8 * s, -14 * s]]); fill(g, 'rgba(255,255,255,0.18)');
      line(g, -4 * s, -14 * s, -4 * s, 14 * s, 'rgba(255,255,255,0.6)', 1.1);
    };
    g.save(); g.shadowColor = rgba(c, 0.9); g.shadowBlur = 8;
    diag(g, 0.6, () => crystal(0.55), 44, 42);
    diag(g, 0.45, () => crystal(0.95), 28, 30);
    g.restore();
    sparkle(g, 22, 16, 5);
  },
  bar: (g, c, c2) => {
    const d = c2 || shade(c, -0.35);
    poly(g, [[-20, 4], [12, 4], [20, -4], [-12, -4]].map(([x, y]) => [x + 32, y + 28])); fill(g, lg(g, 0, 24, 0, 32, [shade(c, 0.55), shade(c, 0.25)])); stroke(g, shade(d, -0.5), 1);
    poly(g, [[-24, 14], [16, 14], [12, 4], [-20, 4]].map(([x, y]) => [x + 32, y + 28])); fill(g, lg(g, 0, 32, 0, 42, [c, shade(c, -0.2)])); stroke(g, shade(d, -0.5), 1);
    poly(g, [[12, 4], [20, -4], [24, 6], [16, 14]].map(([x, y]) => [x + 32, y + 28])); fill(g, d); stroke(g, shade(d, -0.5), 1);
    line(g, 13, 32, 44, 32, 'rgba(255,255,255,0.65)', 1.2);
    sparkle(g, 22, 27, 3.5);
  },
  'gem-rough': (g, c) => {
    poly(g, [[14, 36], [20, 18], [36, 12], [50, 22], [52, 40], [40, 52], [22, 50]]);
    fill(g, rg(g, 28, 26, 2, 30, [shade(c, 0.35), shade(c, -0.05), shade(c, -0.5)])); stroke(g, shade(c, -0.6), 1.2);
    poly(g, [[20, 18], [36, 12], [32, 30]]); fill(g, rgba('#ffffff', 0.18));
    poly(g, [[32, 30], [50, 22], [52, 40]]); fill(g, rgba('#000000', 0.15));
    poly(g, [[22, 50], [32, 30], [40, 52]]); fill(g, rgba('#000000', 0.1));
    for (const [x, y] of [[26, 24], [42, 34], [30, 42]]) { circle(g, x, y, 1.1); fill(g, 'rgba(255,255,255,0.5)'); }
  },
  gem: (g, c) => {
    const P = (x, y) => [x + 32, y + 32];
    const crown = [P(-14, -12), P(14, -12), P(23, -2), P(-23, -2)];
    poly(g, crown); fill(g, lg(g, 0, 20, 0, 30, [shade(c, 0.6), shade(c, 0.2)])); stroke(g, shade(c, -0.6), 1);
    poly(g, [P(-23, -2), P(23, -2), P(0, 24)]); fill(g, lg(g, 9, 30, 55, 56, [shade(c, 0.15), c, shade(c, -0.5)])); stroke(g, shade(c, -0.6), 1);
    g.save(); g.strokeStyle = rgba(shade(c, -0.5), 0.6); g.lineWidth = 0.8;
    for (const [a, b] of [[P(-7, -12), P(-11, -2)], [P(7, -12), P(11, -2)], [P(-11, -2), P(0, 24)], [P(11, -2), P(0, 24)], [P(0, -2), P(0, 24)]]) { g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
    g.restore();
    poly(g, [P(-14, -12), P(-7, -12), P(-11, -2), P(-23, -2)]); fill(g, 'rgba(255,255,255,0.35)');
    sparkle(g, 23, 21, 6);
  },
  fish: (g, c, c2) => diag(g, -0.38, () => {
    const back = c2 || shade(c, -0.4);
    poly(g, [[-14, 0], [-27, -10], [-24, 0], [-27, 10]]); fill(g, lg(g, -27, 0, -14, 0, [shade(back, -0.1), mix(c, back, 0.4)])); stroke(g, shade(back, -0.5), 1);
    g.beginPath(); g.moveTo(-4, -9); g.quadraticCurveTo(2, -17, 10, -9); fill(g, mix(c, back, 0.6)); stroke(g, shade(back, -0.5), 0.8);
    g.beginPath(); g.moveTo(23, 0); g.bezierCurveTo(14, -15, -6, -14, -15, -2); g.lineTo(-15, 2); g.bezierCurveTo(-6, 13, 14, 12, 23, 0); g.closePath();
    fill(g, lg(g, 0, -12, 0, 12, [mix(c, back, 0.75), c, shade(c, 0.35)])); stroke(g, shade(back, -0.55), 1.1);
    g.beginPath(); g.moveTo(11, -7); g.quadraticCurveTo(7, 0, 11, 7); stroke(g, rgba(shade(back, -0.4), 0.6), 1);
    for (let x = -8; x < 8; x += 5) { g.beginPath(); g.arc(x, -1, 3, -0.9, 0.9); stroke(g, rgba(shade(back, -0.3), 0.35), 0.7); }
    circle(g, 16, -2.5, 2.4); fill(g, '#f8f4e8'); circle(g, 16.6, -2.5, 1.2); fill(g, '#111');
    ell(g, 2, -6, 8, 1.6); fill(g, 'rgba(255,255,255,0.35)');
  }, 32, 33),
  lobster: (g, c) => diag(g, D45, () => {
    const d = shade(c, -0.35);
    for (let i = 0; i < 4; i++) { rr(g, -6 + i * 0.7, 6 + i * 5, 12 - i * 1.4, 6, 2.5); fill(g, lg(g, -6, 0, 6, 0, [shade(c, 0.3), c, d])); stroke(g, shade(c, -0.6), 0.8); }
    poly(g, [[-7, 28], [7, 28], [0, 33]]); fill(g, d);
    ell(g, 0, -2, 8, 11); fill(g, rg(g, -2, -5, 1, 12, [shade(c, 0.4), c, d])); stroke(g, shade(c, -0.6), 1);
    for (const s of [-1, 1]) {
      line(g, s * 5, -9, s * 10, -16, d, 3);
      g.beginPath(); g.ellipse(s * 12, -21, 5.5, 8, s * 0.3, 0, Math.PI * 2); fill(g, rg(g, s * 11, -23, 1, 8, [shade(c, 0.4), c, d])); stroke(g, shade(c, -0.6), 1);
      line(g, s * 12, -29, s * 13, -21, shade(c, -0.6), 1.2);
      line(g, s * 3, -12, s * 9, -28, rgba(d, 0.8), 0.8);
    }
    for (const s of [-1, 1]) { circle(g, s * 3, -10, 1.4); fill(g, '#111'); }
  }, 32, 32, 0.9),
  meat: (g, c) => {
    g.beginPath(); g.moveTo(16, 24); g.bezierCurveTo(18, 10, 44, 8, 50, 22); g.bezierCurveTo(56, 36, 46, 52, 30, 52); g.bezierCurveTo(16, 52, 10, 38, 16, 24); g.closePath();
    fill(g, rg(g, 28, 26, 2, 30, [shade(c, 0.3), c, shade(c, -0.45)])); stroke(g, shade(c, -0.6), 1.2);
    for (const pts of [[[22, 26], [30, 32], [40, 24]], [[20, 40], [32, 38], [44, 44]]]) { g.beginPath(); g.moveTo(...pts[0]); g.quadraticCurveTo(...pts[1], ...pts[2]); stroke(g, rgba(shade(c, 0.6), 0.55), 1.4); }
    circle(g, 36, 34, 5.5); fill(g, '#efe6d2'); stroke(g, '#8a7a5a', 1); circle(g, 36, 34, 2.2); fill(g, '#c8b48a');
  },
  drumstick: (g, c) => diag(g, D45, () => {
    rr(g, -3, 4, 6, 18, 2); fill(g, lg(g, -3, 0, 3, 0, ['#ffffff', '#e8e0cc', '#b8ac90'])); stroke(g, '#7a6a4a', 0.9);
    for (const x of [-3.5, 3.5]) { circle(g, x, 24, 4); fill(g, rg(g, x - 1, 23, 0.5, 4.5, ['#ffffff', '#e8e0cc', '#b8ac90'])); stroke(g, '#7a6a4a', 0.9); }
    g.beginPath(); g.moveTo(0, -26); g.bezierCurveTo(16, -24, 15, 2, 4, 8); g.lineTo(-4, 8); g.bezierCurveTo(-15, 2, -16, -24, 0, -26); g.closePath();
    fill(g, rg(g, -4, -14, 2, 20, [shade(c, 0.35), c, shade(c, -0.45)])); stroke(g, shade(c, -0.6), 1.1);
    ell(g, -5, -14, 3, 6, 0.2); fill(g, 'rgba(255,255,255,0.3)');
  }, 32, 32),
  dough: (g, c) => {
    g.beginPath(); g.moveTo(12, 42); g.bezierCurveTo(8, 26, 22, 16, 32, 20); g.bezierCurveTo(40, 12, 58, 22, 52, 36); g.bezierCurveTo(58, 46, 46, 54, 32, 52); g.bezierCurveTo(20, 54, 12, 50, 12, 42); g.closePath();
    fill(g, rg(g, 28, 28, 2, 30, [shade(c, 0.5), c, shade(c, -0.25)])); stroke(g, shade(c, -0.5), 1.1);
    for (const [x, y] of [[24, 30], [38, 28], [44, 40], [30, 44], [20, 40]]) { circle(g, x, y, 1.2); fill(g, 'rgba(255,255,255,0.8)'); }
  },
  bread: (g, c) => {
    g.beginPath(); g.moveTo(8, 46); g.bezierCurveTo(6, 18, 58, 18, 56, 46); g.quadraticCurveTo(32, 52, 8, 46); g.closePath();
    fill(g, rg(g, 26, 26, 3, 34, [shade(c, 0.45), c, shade(c, -0.45)])); stroke(g, shade(c, -0.6), 1.2);
    for (const x of [20, 30, 40]) { g.beginPath(); g.moveTo(x - 3, 34); g.quadraticCurveTo(x + 2, 28, x + 6, 26); stroke(g, shade(c, 0.45), 2.4); g.beginPath(); g.moveTo(x - 3, 35); g.quadraticCurveTo(x + 2, 29, x + 6, 27); stroke(g, rgba(shade(c, -0.4), 0.5), 0.8); }
  },
  cake: (g, c, c2) => {
    const top = c2 || '#f7efe0';
    rr(g, 11, 28, 42, 22, 4); fill(g, lg(g, 11, 0, 53, 0, [shade(c, 0.25), c, shade(c, -0.35)])); stroke(g, shade(c, -0.6), 1.1);
    line(g, 12, 40, 52, 40, rgba(top, 0.9), 2.5);
    ell(g, 32, 28, 21, 7); fill(g, lg(g, 0, 21, 0, 35, ['#ffffff', top])); stroke(g, shade(top, -0.4), 1);
    for (const x of [16, 26, 38, 47]) { g.beginPath(); g.moveTo(x - 2.5, 30); g.quadraticCurveTo(x, 40, x + 2.5, 30); fill(g, top); }
    circle(g, 32, 22, 4); fill(g, rg(g, 31, 21, 0.5, 4, ['#ffe08a', '#e8a020', '#a05a10'])); stroke(g, '#6a3a0a', 0.8);
  },
  helm: (g, c, c2) => {
    const d = c2 || shade(c, -0.35);
    g.beginPath(); g.moveTo(13, 48); g.bezierCurveTo(10, 14, 54, 14, 51, 48); g.lineTo(42, 50); g.lineTo(40, 38); g.lineTo(24, 38); g.lineTo(22, 50); g.closePath();
    fill(g, rg(g, 26, 22, 2, 34, [shade(c, 0.55), c, shade(c, -0.45)])); stroke(g, shade(d, -0.55), 1.2);
    rr(g, 30, 34, 4, 16, 1.5); fill(g, metal(g, c, 30, 34)); stroke(g, shade(d, -0.55), 0.8);
    g.beginPath(); g.moveTo(14, 32); g.quadraticCurveTo(32, 26, 50, 32); stroke(g, d, 2.2);
    g.beginPath(); g.moveTo(32, 16); g.lineTo(32, 31); stroke(g, rgba(shade(c, -0.4), 0.6), 1.4);
    ell(g, 24, 24, 4, 7, 0.4); fill(g, 'rgba(255,255,255,0.35)');
  },
  kiteshield: (g, c, c2) => {
    const rim = c2 || shade(c, -0.35);
    const path = () => { g.beginPath(); g.moveTo(32, 7); g.quadraticCurveTo(46, 8, 54, 14); g.quadraticCurveTo(54, 40, 32, 58); g.quadraticCurveTo(10, 40, 10, 14); g.quadraticCurveTo(18, 8, 32, 7); g.closePath(); };
    path(); fill(g, lg(g, 10, 7, 54, 58, [shade(rim, 0.45), rim, shade(rim, -0.45)])); stroke(g, shade(rim, -0.6), 1.2);
    g.save(); g.translate(32, 31); g.scale(0.8, 0.82); g.translate(-32, -31); path(); g.restore();
    fill(g, rg(g, 26, 22, 2, 30, [shade(c, 0.45), c, shade(c, -0.4)]));
    poly(g, [[22, 22], [32, 32], [42, 22], [42, 27], [32, 38], [22, 27]]); fill(g, rim); stroke(g, shade(rim, -0.5), 0.7);
    circle(g, 18, 15, 1.4); fill(g, shade(rim, 0.6)); circle(g, 46, 15, 1.4); fill(g, shade(rim, 0.6));
  },
  platelegs: (g, c, c2) => {
    const d = c2 || shade(c, -0.35);
    const leg = (s) => { g.beginPath(); g.moveTo(32 + s * 1.5, 18); g.lineTo(32 + s * 16, 18); g.lineTo(32 + s * 15, 56); g.lineTo(32 + s * 5, 56); g.lineTo(32 + s * 1.5, 30); g.closePath(); fill(g, lg(g, 32 + s * 1.5, 0, 32 + s * 16, 0, s > 0 ? [shade(c, 0.1), c, shade(c, -0.4)] : [shade(c, 0.5), c, shade(c, -0.1)])); stroke(g, shade(d, -0.5), 1.1); ell(g, 32 + s * 10, 38, 5.5, 4); fill(g, shade(c, 0.25)); stroke(g, shade(d, -0.4), 0.8); };
    leg(-1); leg(1);
    rr(g, 15, 10, 34, 9, 2.5); fill(g, lg(g, 0, 10, 0, 19, [shade(d, 0.4), d, shade(d, -0.3)])); stroke(g, shade(d, -0.6), 1.1);
    rr(g, 29, 11, 6, 7, 1); fill(g, '#d4a73a');
  },
  chestplate: (g, c, c2) => {
    const d = c2 || shade(c, -0.35);
    g.beginPath(); g.moveTo(22, 9); g.lineTo(28, 13); g.lineTo(36, 13); g.lineTo(42, 9); g.lineTo(55, 15); g.lineTo(54, 30); g.lineTo(46, 30); g.lineTo(46, 54); g.quadraticCurveTo(32, 59, 18, 54); g.lineTo(18, 30); g.lineTo(10, 30); g.lineTo(9, 15); g.closePath();
    fill(g, lg(g, 9, 0, 55, 0, [shade(c, 0.55), c, shade(c, -0.45)])); stroke(g, shade(d, -0.55), 1.2);
    line(g, 32, 15, 32, 55, rgba(shade(c, -0.4), 0.8), 1.4);
    g.beginPath(); g.moveTo(18, 40); g.quadraticCurveTo(32, 45, 46, 40); stroke(g, rgba(d, 0.9), 1.4);
    g.beginPath(); g.moveTo(18, 47); g.quadraticCurveTo(32, 52, 46, 47); stroke(g, rgba(d, 0.9), 1.4);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(32 + s * 10, 11); g.quadraticCurveTo(32 + s * 21, 13, 32 + s * 22, 29); stroke(g, d, 2); }
    ell(g, 25, 24, 4, 8, 0.2); fill(g, 'rgba(255,255,255,0.3)');
  },
  arrowheads: (g, c) => {
    for (const [x, y, r] of [[22, 22, -0.5], [42, 20, 0.6], [30, 40, 0.2], [46, 42, -1.2], [16, 44, 1.6]]) diag(g, r, () => {
      poly(g, [[0, -9], [6, 4], [0, 1.5], [-6, 4]]); fill(g, metal(g, c, -6, 6)); stroke(g, shade(c, -0.6), 0.9);
      rr(g, -1.4, 1.5, 2.8, 5, 0.8); fill(g, shade(c, -0.25));
    }, x, y);
  },
  arrow: (g, c, c2) => {
    const fl = c2 || '#f2efe6';
    for (const off of [-7, 0, 7]) diag(g, D45, () => {
      line(g, 0, 24, 0, -18, '#5a3a1a', 2.6); line(g, 0, 24, 0, -18, '#b0844f', 1.4);
      poly(g, [[0, -27], [4, -17], [0, -19], [-4, -17]]); fill(g, metal(g, c, -4, 4)); stroke(g, shade(c, -0.6), 0.8);
      for (const s of [-1, 1]) { poly(g, [[0, 12], [s * 4.5, 15], [s * 4.5, 25], [0, 22]]); fill(g, s < 0 ? fl : shade(fl, -0.2)); stroke(g, shade(fl, -0.5), 0.6); }
    }, 32 + off, 32 + off);
  },
  shaft: (g, c, c2) => {
    for (const off of [-9, -3, 3, 9]) diag(g, D45, () => {
      line(g, 0, 24, 0, -24, shade(c, -0.55), 3); line(g, 0, 24, 0, -24, c, 1.8);
      if (c2) for (const s of [-1, 1]) { poly(g, [[0, 12], [s * 4, 15], [s * 4, 25], [0, 22]]); fill(g, s < 0 ? c2 : shade(c2, -0.2)); stroke(g, shade(c2, -0.5), 0.6); }
    }, 32 + off, 32 + off * 0.4);
  },
  shortbow: (g, c, c2) => bow(g, c, c2, 22, 11),
  longbow: (g, c, c2) => bow(g, c, c2, 28, 10),
  hands: (g, c, c2) => {
    const d = c2 || shade(c, -0.4);
    g.beginPath();
    g.moveTo(20, 56); g.lineTo(19, 34); g.quadraticCurveTo(10, 30, 10, 22); g.quadraticCurveTo(14, 18, 20, 26);
    g.lineTo(20, 12); g.quadraticCurveTo(24, 8, 26, 12); g.lineTo(27, 24); g.lineTo(28, 8); g.quadraticCurveTo(32, 5, 34, 9); g.lineTo(35, 24);
    g.lineTo(37, 10); g.quadraticCurveTo(41, 7, 43, 11); g.lineTo(43, 26); g.lineTo(45, 15); g.quadraticCurveTo(49, 13, 50, 17); g.lineTo(48, 40); g.quadraticCurveTo(46, 46, 46, 56); g.closePath();
    fill(g, lg(g, 10, 0, 50, 0, [shade(c, 0.4), c, shade(c, -0.4)])); stroke(g, shade(d, -0.5), 1.1);
    rr(g, 18, 46, 30, 11, 3); fill(g, lg(g, 0, 46, 0, 57, [shade(d, 0.3), d])); stroke(g, shade(d, -0.6), 1);
    for (const x of [27, 35, 43]) line(g, x, 24, x, 30, rgba(shade(c, -0.5), 0.6), 0.9);
  },
  feet: (g, c, c2) => {
    const d = c2 || shade(c, -0.45);
    const boot = (ox, oy, k) => {
      g.beginPath(); g.moveTo(ox + 4, oy); g.lineTo(ox + 18, oy); g.lineTo(ox + 19, oy + 24); g.quadraticCurveTo(ox + 32, oy + 24, ox + 33, oy + 32); g.lineTo(ox + 2, oy + 33); g.closePath();
      fill(g, lg(g, ox, 0, ox + 33, 0, [shade(c, 0.35 * k), shade(c, -0.1 * (1 - k)), shade(c, -0.4)])); stroke(g, shade(d, -0.5), 1.1);
      rr(g, ox + 1, oy + 30, 33, 4.5, 2); fill(g, d);
      rr(g, ox + 3, oy - 1, 16, 5, 1.5); fill(g, shade(c, -0.25)); stroke(g, shade(d, -0.5), 0.8);
    };
    boot(22, 12, 0.3); boot(10, 20, 1);
  },
  head: (g, c, c2) => {
    const lin = c2 || shade(c, -0.45);
    g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(50, 8, 56, 30, 52, 54); g.quadraticCurveTo(32, 60, 12, 54); g.bezierCurveTo(8, 30, 14, 8, 32, 6); g.closePath();
    fill(g, rg(g, 24, 18, 3, 40, [shade(c, 0.4), c, shade(c, -0.45)])); stroke(g, shade(c, -0.65), 1.2);
    g.beginPath(); g.moveTo(32, 18); g.bezierCurveTo(44, 18, 46, 36, 42, 46); g.quadraticCurveTo(32, 50, 22, 46); g.bezierCurveTo(18, 36, 20, 18, 32, 18); g.closePath();
    fill(g, lin); g.beginPath(); g.moveTo(32, 21); g.bezierCurveTo(42, 21, 43, 36, 40, 45); g.quadraticCurveTo(32, 48, 24, 45); g.bezierCurveTo(21, 36, 22, 21, 32, 21); g.closePath();
    fill(g, rg(g, 32, 34, 2, 16, ['#1a120c', '#0a0604']));
    g.beginPath(); g.moveTo(31, 7); g.quadraticCurveTo(28, 12, 27, 18); stroke(g, rgba(shade(c, -0.5), 0.7), 1);
  },
  'body-leather': (g, c, c2) => {
    const d = c2 || shade(c, -0.4);
    g.beginPath(); g.moveTo(24, 8); g.quadraticCurveTo(32, 14, 40, 8); g.lineTo(54, 16); g.lineTo(52, 32); g.lineTo(46, 30); g.lineTo(47, 55); g.quadraticCurveTo(32, 58, 17, 55); g.lineTo(18, 30); g.lineTo(12, 32); g.lineTo(10, 16); g.closePath();
    fill(g, lg(g, 10, 0, 54, 0, [shade(c, 0.4), c, shade(c, -0.4)])); stroke(g, shade(d, -0.5), 1.2);
    g.beginPath(); g.moveTo(24, 8); g.quadraticCurveTo(32, 22, 40, 8); stroke(g, d, 2);
    for (let y = 14; y < 26; y += 4) line(g, 29, y, 35, y + 2, '#e8d8b0', 1);
    rr(g, 17, 40, 30, 5, 1.5); fill(g, d);
    rr(g, 29, 40, 6, 5, 1); fill(g, '#c9a24a');
    g.save(); g.setLineDash([2, 2]); line(g, 19, 30, 19, 52, rgba(shade(c, 0.4), 0.7), 0.8); line(g, 45, 30, 45, 52, rgba(shade(c, 0.4), 0.7), 0.8); g.restore();
  },
  legs: (g, c, c2) => {
    const d = c2 || shade(c, -0.4);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(32 + s * 1, 16); g.lineTo(32 + s * 15, 16); g.lineTo(32 + s * 13, 56); g.lineTo(32 + s * 5, 56); g.lineTo(32 + s * 1, 30); g.closePath(); fill(g, lg(g, 32, 0, 32 + s * 15, 0, s > 0 ? [c, shade(c, -0.4)] : [c, shade(c, 0.35)])); stroke(g, shade(d, -0.5), 1.1); }
    rr(g, 16, 10, 32, 8, 2); fill(g, d); stroke(g, shade(d, -0.6), 1);
    g.save(); g.setLineDash([2, 2]); line(g, 22, 20, 23, 54, rgba(shade(c, 0.4), 0.7), 0.8); line(g, 42, 20, 41, 54, rgba(shade(c, 0.4), 0.7), 0.8); g.restore();
  },
  cape: (g, c, c2) => {
    const lin = c2 || shade(c, -0.4);
    g.beginPath(); g.moveTo(22, 8); g.quadraticCurveTo(32, 12, 42, 8); g.bezierCurveTo(48, 24, 54, 42, 56, 56); g.quadraticCurveTo(32, 60, 8, 56); g.bezierCurveTo(10, 42, 16, 24, 22, 8); g.closePath();
    fill(g, lg(g, 8, 0, 56, 0, [shade(c, 0.3), c, shade(c, -0.4)])); stroke(g, shade(lin, -0.5), 1.2);
    for (const x of [22, 32, 42]) { g.beginPath(); g.moveTo(x + (x - 32) * 0.05, 16); g.quadraticCurveTo(x + (x - 32) * 0.3 - 2, 36, x + (x - 32) * 0.5, 56); stroke(g, rgba(shade(c, -0.45), 0.7), 1.4); }
    g.beginPath(); g.moveTo(8, 56); g.quadraticCurveTo(32, 60, 56, 56); stroke(g, lin, 2.5);
    circle(g, 32, 11, 3.6); fill(g, rg(g, 31, 10, 0.5, 4, ['#fff2b0', '#d4a73a', '#7a5a10']));
  },
  scale: (g, c, c2) => {
    const glow = c2 || shade(c, 0.4);
    g.save(); g.shadowColor = rgba(glow, 0.8); g.shadowBlur = 7;
    g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(48, 12, 56, 28, 50, 42); g.quadraticCurveTo(44, 54, 32, 58); g.quadraticCurveTo(20, 54, 14, 42); g.bezierCurveTo(8, 28, 16, 12, 32, 6); g.closePath();
    fill(g, rg(g, 26, 22, 2, 34, [shade(c, 0.45), c, shade(c, -0.5)])); g.restore();
    g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(48, 12, 56, 28, 50, 42); g.quadraticCurveTo(44, 54, 32, 58); g.quadraticCurveTo(20, 54, 14, 42); g.bezierCurveTo(8, 28, 16, 12, 32, 6); g.closePath();
    stroke(g, glow, 2);
    for (const y of [22, 34, 46]) { g.beginPath(); g.moveTo(18, y - 4); g.quadraticCurveTo(32, y + 6, 46, y - 4); stroke(g, rgba(shade(c, -0.5), 0.8), 1.2); }
    line(g, 32, 10, 32, 54, rgba(shade(c, 0.3), 0.5), 1);
  },
  amulet: (g, c) => {
    g.save(); g.setLineDash([2.5, 1.5]); g.beginPath(); g.ellipse(32, 24, 17, 17, 0, Math.PI * 0.95, Math.PI * 0.05, false); g.strokeStyle = '#7a5a10'; g.lineWidth = 3; g.stroke(); g.strokeStyle = '#f2c94c'; g.lineWidth = 1.8; g.stroke(); g.restore();
    g.beginPath(); g.moveTo(16, 28); g.quadraticCurveTo(22, 42, 32, 44); g.quadraticCurveTo(42, 42, 48, 28); stroke(g, '#7a5a10', 3); g.beginPath(); g.moveTo(16, 28); g.quadraticCurveTo(22, 42, 32, 44); g.quadraticCurveTo(42, 42, 48, 28); stroke(g, '#f2c94c', 1.6);
    circle(g, 32, 48, 9); fill(g, rg(g, 30, 46, 1, 10, ['#fff2b0', '#d4a73a', '#6a4a10'])); stroke(g, '#4a3008', 1);
    circle(g, 32, 48, 5.5); fill(g, rg(g, 30, 46, 0.5, 6, [shade(c, 0.6), c, shade(c, -0.5)]));
    sparkle(g, 30, 46, 2.6);
  },
  ring: (g, c) => {
    g.beginPath(); g.ellipse(32, 36, 19, 14, 0, 0, Math.PI * 2); g.ellipse(32, 38, 12, 7.5, 0, 0, Math.PI * 2, true);
    fill(g, lg(g, 13, 22, 51, 50, [shade(c, 0.65), c, shade(c, -0.5)])); stroke(g, shade(c, -0.65), 1);
    g.beginPath(); g.ellipse(32, 36, 19, 14, 0, Math.PI * 1.1, Math.PI * 1.45); stroke(g, 'rgba(255,255,255,0.8)', 1.5);
    rr(g, 26, 17, 12, 8, 2.5); fill(g, lg(g, 0, 17, 0, 25, [shade(c, 0.4), shade(c, -0.3)])); stroke(g, shade(c, -0.65), 0.9);
    line(g, 29, 21, 35, 21, shade(c, -0.55), 1);
  },
  staff: (g, c, c2) => diag(g, D45, () => {
    haft(g, c, -16, 28, 4.6);
    for (const y of [-2, 14]) { rr(g, -3.2, y, 6.4, 3, 1); fill(g, '#c9a24a'); }
    const orb = c2 || c;
    const glowing = c2 && c2 !== c;
    g.beginPath(); g.moveTo(-2, -15); g.quadraticCurveTo(-8, -20, -5, -27); g.moveTo(2, -15); g.quadraticCurveTo(8, -20, 5, -27); stroke(g, shade(c, -0.3), 2);
    g.save(); if (glowing) { g.shadowColor = orb; g.shadowBlur = 10; }
    circle(g, 0, -22, glowing ? 6.5 : 5); fill(g, rg(g, -2, -24, 0.5, 7, [shade(orb, 0.75), orb, shade(orb, -0.45)])); g.restore();
    circle(g, -2, -24, 1.6); fill(g, 'rgba(255,255,255,0.8)');
  }, 32, 33),
  sigil: (g, c, c2, it) => {
    circle(g, 32, 33, 22); fill(g, rg(g, 26, 26, 2, 26, ['#7b7884', '#55525e', '#2e2c35'])); stroke(g, '#15141a', 1.2);
    circle(g, 32, 33, 18.5); stroke(g, 'rgba(255,255,255,0.16)', 1.2);
    circle(g, 32, 33, 16); fill(g, rg(g, 32, 33, 2, 17, [rgba(c, 0.32), 'rgba(0,0,0,0.05)']));
    const glyph = SIGIL_GLYPH[it?.id] || SIGIL_GLYPH.insight_sigil;
    g.save(); g.translate(32, 33); g.shadowColor = c; g.shadowBlur = 8;
    glyph(g); g.lineJoin = 'round'; g.lineCap = 'round';
    if (it?.id === 'tide_sigil') { stroke(g, c, 3); } else { fill(g, lg(g, -10, -12, 10, 12, [shade(c, 0.6), c])); stroke(g, shade(c, -0.45), 0.8); }
    g.restore();
  },
  tusk: (g, c) => {
    g.beginPath(); g.moveTo(14, 50); g.bezierCurveTo(10, 30, 26, 10, 52, 8); g.bezierCurveTo(36, 18, 28, 34, 26, 54); g.closePath();
    fill(g, lg(g, 12, 50, 50, 10, [shade(c, -0.35), c, shade(c, 0.5)])); stroke(g, shade(c, -0.6), 1.1);
    for (const t of [0.15, 0.3]) { const x = 14 + t * 20, y = 50 - t * 10; line(g, x - 2, y, x + 12, y + 3, rgba(shade(c, -0.5), 0.7), 1.1); }
  },
  bell: (g, c) => {
    g.beginPath(); g.arc(32, 11, 4.5, 0, Math.PI * 2); stroke(g, shade(c, -0.55), 3); g.beginPath(); g.arc(32, 11, 4.5, 0, Math.PI * 2); stroke(g, c, 1.6);
    g.beginPath(); g.moveTo(20, 46); g.bezierCurveTo(22, 40, 20, 16, 32, 15); g.bezierCurveTo(44, 16, 42, 40, 44, 46); g.quadraticCurveTo(52, 48, 54, 52); g.lineTo(10, 52); g.quadraticCurveTo(12, 48, 20, 46); g.closePath();
    fill(g, lg(g, 10, 0, 54, 0, [shade(c, 0.6), c, shade(c, -0.45)])); stroke(g, shade(c, -0.6), 1.2);
    circle(g, 32, 54, 4); fill(g, rg(g, 31, 53, 0.5, 4.5, [shade(c, 0.3), shade(c, -0.4)]));
    line(g, 18, 44, 46, 44, rgba(shade(c, -0.45), 0.7), 1.3);
    ell(g, 26, 28, 2.5, 8, 0.15); fill(g, 'rgba(255,255,255,0.45)');
  },
  token: (g, c) => {
    circle(g, 32, 33, 22); fill(g, rg(g, 26, 26, 2, 26, [shade(c, 0.45), c, shade(c, -0.45)])); stroke(g, shade(c, -0.65), 1.2);
    circle(g, 32, 33, 17); stroke(g, rgba(shade(c, -0.5), 0.8), 1.4);
    g.beginPath(); g.moveTo(24, 22); g.quadraticCurveTo(38, 33, 24, 44); stroke(g, shade(c, -0.65), 2.6);
    line(g, 24, 22, 24, 44, shade(c, -0.6), 1); line(g, 20, 33, 42, 33, shade(c, -0.65), 2);
    poly(g, [[44, 33], [39, 30], [39, 36]]); fill(g, shade(c, -0.65));
  },
  book: (g, c) => diag(g, -0.18, () => {
    rr(g, -16, -22, 34, 44, 3); fill(g, '#efe2c4'); stroke(g, '#5a4a2a', 1);
    for (let y = -18; y < 20; y += 3) line(g, 17, y, 18.5, y, '#b9a888', 0.8);
    rr(g, -18, -24, 32, 46, 3); fill(g, lg(g, -18, 0, 14, 0, [shade(c, -0.3), shade(c, 0.25), c, shade(c, -0.25)])); stroke(g, shade(c, -0.6), 1.2);
    rr(g, -18, -24, 6, 46, 2); fill(g, shade(c, -0.35));
    rr(g, -6, -12, 14, 18, 2); stroke(g, '#d4a73a', 1.4);
    circle(g, 1, -3, 3); fill(g, '#d4a73a');
  }, 32, 32),
  key: (g, c) => diag(g, D45, () => {
    g.beginPath(); g.arc(0, 16, 9, 0, Math.PI * 2); g.arc(0, 16, 4.5, 0, Math.PI * 2, true);
    fill(g, rg(g, -3, 13, 1, 10, [shade(c, 0.55), c, shade(c, -0.45)])); stroke(g, shade(c, -0.6), 1);
    rr(g, -2.2, -26, 4.4, 34, 1.5); fill(g, metal(g, c, -2.2, 2.2)); stroke(g, shade(c, -0.6), 0.9);
    for (const [y, w] of [[-26, 9], [-19, 7]]) { rr(g, 0, y, w, 4, 1); fill(g, metal(g, c, 0, w)); stroke(g, shade(c, -0.6), 0.8); }
  }, 32, 30),
  scroll: (g, c) => diag(g, -0.35, () => {
    rr(g, -20, -12, 40, 24, 2); fill(g, lg(g, 0, -12, 0, 12, [shade(c, 0.2), c, shade(c, -0.25)])); stroke(g, shade(c, -0.6), 1);
    for (let y = -6; y <= 6; y += 4) line(g, -14, y, 14, y, rgba('#6a5030', 0.5), 1);
    for (const x of [-21, 21]) { ell(g, x, 0, 4, 14); fill(g, lg(g, x - 4, 0, x + 4, 0, [shade(c, 0.3), shade(c, -0.35)])); stroke(g, shade(c, -0.6), 1); }
    rr(g, -3, -13, 6, 26, 1); fill(g, '#a8322a');
  }, 32, 32),
  tinderbox: (g, c) => {
    rr(g, 12, 26, 40, 24, 3); fill(g, lg(g, 0, 26, 0, 50, [shade(c, 0.25), c, shade(c, -0.45)])); stroke(g, shade(c, -0.65), 1.2);
    rr(g, 10, 20, 44, 9, 3); fill(g, lg(g, 0, 20, 0, 29, [shade(c, 0.45), shade(c, 0.05)])); stroke(g, shade(c, -0.65), 1.2);
    rr(g, 28, 26, 8, 8, 1.5); fill(g, '#d4a73a'); stroke(g, '#5a4008', 0.8);
    rr(g, 34, 9, 14, 6, 2); fill(g, metal(g, '#8a8f95', 34, 48)); stroke(g, '#2a2a2a', 0.8);
    sparkle(g, 24, 13, 6, '#ffe27a'); sparkle(g, 18, 9, 3, '#ffb347');
  },
  'pot-cage': (g, c) => {
    g.beginPath(); g.moveTo(10, 52); g.lineTo(10, 34); g.bezierCurveTo(10, 10, 54, 10, 54, 34); g.lineTo(54, 52); g.closePath();
    fill(g, rgba(shade(c, -0.3), 0.55)); stroke(g, shade(c, -0.6), 1.4);
    g.save(); g.clip();
    for (let x = 12; x < 54; x += 6) line(g, x, 10, x, 54, c, 2.2);
    for (const y of [24, 36, 46]) line(g, 8, y, 56, y, shade(c, 0.2), 2);
    g.restore();
    ell(g, 32, 40, 8, 6); fill(g, '#1a120a'); stroke(g, shade(c, -0.5), 1.4);
    line(g, 10, 52, 54, 52, shade(c, -0.4), 3);
  },
};

function bow(g, c, c2, half, bulge) {
  diag(g, D45, () => {
    const str = c2 || '#e8e2d0';
    line(g, 1, -half, 1, half, shade(str, -0.5), 2.2);
    line(g, 1, -half, 1, half, str, 1.3);
    g.beginPath(); g.moveTo(0, -half - 2); g.quadraticCurveTo(-bulge * 2.4, 0, 0, half + 2);
    stroke(g, shade(c, -0.6), 7);
    g.beginPath(); g.moveTo(0, -half - 2); g.quadraticCurveTo(-bulge * 2.4, 0, 0, half + 2);
    stroke(g, c, 4.6);
    g.beginPath(); g.moveTo(-0.5, -half); g.quadraticCurveTo(-bulge * 2.2 + 1.2, 0, -0.5, half); stroke(g, rgba(shade(c, 0.5), 0.7), 0.9);
    rr(g, -bulge * 1.1 - 3, -4, 5, 8, 1.5); fill(g, '#5a3a1a'); stroke(g, '#2a170b', 0.8);
    for (const y of [-half - 2, half + 2]) { circle(g, 0, y, 1.6); fill(g, '#d4a73a'); }
  }, 34, 30);
}

// ---------------------------------------------------------------------------------- finishing
// Apply a soft key light, then a dark outline + drop shadow around everything drawn.
function finish(src, { outline = '#0b0704', shadow = 0.32, light = true } = {}) {
  if (light) {
    const g = src.getContext('2d');
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = lg(g, 0, 0, S, S, [[0, 'rgba(255,240,210,0.16)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.22)']]);
    g.fillRect(0, 0, S, S);
    g.restore();
  }
  const sil = canvas();
  const sg = sil.getContext('2d');
  sg.drawImage(src, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = outline;
  sg.fillRect(0, 0, S, S);
  const out = canvas();
  const g = out.getContext('2d');
  if (shadow) { g.globalAlpha = shadow; g.drawImage(sil, 3, 4); g.globalAlpha = 1; }
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1.4, -1.4], [1.4, 1.4], [-1.4, 1.4], [1.4, -1.4]]) g.drawImage(sil, dx, dy);
  g.drawImage(src, 0, 0);
  return out;
}

function placeholder(g, c) {
  circle(g, 32, 32, 18); fill(g, rg(g, 26, 26, 2, 20, [shade(c, 0.4), c, shade(c, -0.4)]));
  g.font = 'bold 22px serif'; g.fillStyle = 'rgba(0,0,0,0.5)'; g.textAlign = 'center'; g.fillText('?', 32, 40);
}

export function itemCanvas(id) {
  const it = ITEMS[id];
  const src = canvas();
  const g = src.getContext('2d');
  const icon = it?.icon || { shape: '?', color: '#888' };
  const c = icon.color || '#888';
  const c2 = icon.color2 || null;
  try {
    (SHAPES[icon.shape] || placeholder)(g, c, c2, it);
  } catch (err) {
    console.warn('[ui] icon failed', id, err);
    g.clearRect(0, 0, S, S);
    placeholder(g, c);
  }
  return finish(src);
}

export function itemIcon(id) {
  const key = 'i:' + id;
  let url = cache.get(key);
  if (!url) { url = itemCanvas(id).toDataURL(); cache.set(key, url); }
  return url;
}

// ---------------------------------------------------------------------------------- skill icons
const SKILL_PAINT = {
  attack: (g) => SHAPES.sword(g, '#c8ced6', '#c9a24a'),
  strength: (g) => {
    // Gauntleted fist.
    const c = '#d8a070';
    rr(g, 16, 18, 32, 28, 9); fill(g, rg(g, 26, 26, 2, 30, [shade(c, 0.35), c, shade(c, -0.4)])); stroke(g, shade(c, -0.6), 1.2);
    for (let i = 0; i < 4; i++) { rr(g, 17 + i * 7.6, 14, 8, 13, 3.8); fill(g, rg(g, 20 + i * 7.6, 17, 1, 9, [shade(c, 0.45), c, shade(c, -0.25)])); stroke(g, shade(c, -0.6), 1); }
    g.beginPath(); g.moveTo(16, 30); g.quadraticCurveTo(28, 26, 34, 34); stroke(g, shade(c, -0.6), 1.2);
    rr(g, 18, 44, 28, 12, 3); fill(g, lg(g, 0, 44, 0, 56, ['#c0392b', '#7a1f17'])); stroke(g, '#3a0a06', 1);
    rr(g, 18, 47, 28, 3, 1); fill(g, '#c9a24a');
  },
  defence: (g) => SHAPES.kiteshield(g, '#3f6fd8', '#c3ccd6'),
  hitpoints: (g) => {
    g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(6, 36, 8, 12, 22, 12); g.bezierCurveTo(28, 12, 31, 16, 32, 20); g.bezierCurveTo(33, 16, 36, 12, 42, 12); g.bezierCurveTo(56, 12, 58, 36, 32, 54); g.closePath();
    fill(g, rg(g, 24, 22, 2, 34, ['#ff8a7a', '#e03a2a', '#7a0e08'])); stroke(g, '#3a0604', 1.2);
    ell(g, 21, 22, 4, 6, -0.5); fill(g, 'rgba(255,255,255,0.55)');
  },
  archery: (g) => { SHAPES.shortbow(g, '#a67c45', '#e8e2d0'); diag(g, D45, () => { line(g, 0, 18, 0, -16, '#5a3a1a', 2); poly(g, [[0, -24], [3.5, -15], [-3.5, -15]]); fill(g, '#c3ccd6'); stroke(g, '#2a2a2a', 0.8); }, 36, 32); },
  arcana: (g) => {
    g.save(); g.shadowColor = '#b18cff'; g.shadowBlur = 12;
    circle(g, 32, 32, 15); fill(g, rg(g, 27, 26, 1, 17, ['#ffffff', '#b8a8ff', '#6a4ad8', '#2a1a6a']));
    g.restore();
    g.beginPath(); g.ellipse(32, 32, 24, 9, -0.5, 0, Math.PI * 2); stroke(g, '#8fe3ff', 1.8);
    g.beginPath(); g.ellipse(32, 32, 24, 9, 0.6, 0, Math.PI * 2); stroke(g, '#c9a24a', 1.4);
    sparkle(g, 27, 26, 4);
  },
  woodcutting: (g) => {
    rr(g, 28, 34, 8, 22, 2); fill(g, wood(g, '#7a4e2a', 28, 36)); stroke(g, '#2a170b', 1);
    for (const [x, y, r] of [[22, 30, 12], [42, 30, 12], [32, 18, 14], [32, 32, 12]]) { circle(g, x, y, r); fill(g, rg(g, x - 4, y - 5, 1, r + 2, ['#8fcf5a', '#4f8f2a', '#2a5a14'])); }
    for (const [x, y] of [[26, 16], [38, 24], [20, 28]]) { circle(g, x, y, 2); fill(g, 'rgba(255,255,255,0.25)'); }
  },
  fishing: (g) => SHAPES.fish(g, '#7fb8e6', '#2a5a8a'),
  mining: (g) => SHAPES.pickaxe(g, '#9aa0a8'),
  thieving: (g) => {
    g.beginPath(); g.moveTo(6, 26); g.bezierCurveTo(10, 14, 28, 16, 32, 22); g.bezierCurveTo(36, 16, 54, 14, 58, 26); g.bezierCurveTo(58, 40, 40, 42, 32, 34); g.bezierCurveTo(24, 42, 6, 40, 6, 26); g.closePath();
    fill(g, lg(g, 0, 16, 0, 42, ['#5a4a7a', '#2a1f3a'])); stroke(g, '#0a0610', 1.2);
    for (const s of [-1, 1]) { ell(g, 32 + s * 12, 28, 6, 4, s * 0.2); fill(g, '#0a0610'); ell(g, 32 + s * 12 - 1, 27, 1.5, 1); fill(g, 'rgba(255,255,255,0.5)'); }
    g.beginPath(); g.moveTo(6, 26); g.quadraticCurveTo(0, 30, 4, 40); stroke(g, '#2a1f3a', 2.4);
    g.beginPath(); g.moveTo(58, 26); g.quadraticCurveTo(64, 30, 60, 42); stroke(g, '#2a1f3a', 2.4);
  },
  fletching: (g) => SHAPES.arrow(g, '#c3ccd6', '#4fbf8a'),
  firemaking: (g) => {
    g.save(); g.shadowColor = '#ff8a3a'; g.shadowBlur = 10;
    g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(46, 20, 54, 34, 46, 46); g.bezierCurveTo(40, 56, 24, 56, 18, 46); g.bezierCurveTo(12, 36, 18, 26, 24, 20); g.bezierCurveTo(24, 30, 30, 32, 30, 28); g.bezierCurveTo(28, 20, 32, 12, 32, 6); g.closePath();
    fill(g, lg(g, 0, 6, 0, 56, ['#ffd27a', '#ff8a2a', '#c0301a'])); g.restore();
    g.beginPath(); g.moveTo(33, 26); g.bezierCurveTo(42, 34, 42, 46, 33, 50); g.bezierCurveTo(24, 48, 25, 38, 33, 26); fill(g, lg(g, 0, 26, 0, 50, ['#fff6c0', '#ffd060']));
    rr(g, 12, 50, 40, 6, 3); fill(g, wood(g, '#6a4226', 12, 52)); stroke(g, '#2a170b', 1);
  },
  cooking: (g) => {
    for (const x of [24, 32, 40]) { g.beginPath(); g.moveTo(x, 18); g.bezierCurveTo(x - 5, 12, x + 5, 8, x, 2); stroke(g, 'rgba(255,255,255,0.75)', 1.8); }
    rr(g, 10, 30, 6, 4, 1.5); fill(g, '#3a3a3a'); rr(g, 48, 30, 6, 4, 1.5); fill(g, '#3a3a3a');
    g.beginPath(); g.moveTo(14, 26); g.lineTo(50, 26); g.lineTo(48, 50); g.quadraticCurveTo(32, 56, 16, 50); g.closePath();
    fill(g, lg(g, 14, 0, 50, 0, ['#8a8f95', '#5a5f66', '#2a2d33'])); stroke(g, '#0a0a0a', 1.2);
    ell(g, 32, 26, 18, 4.5); fill(g, lg(g, 14, 22, 50, 30, ['#e8a33a', '#c0601a'])); stroke(g, '#1a1a1a', 1);
  },
  smithing: (g) => {
    g.beginPath(); g.moveTo(8, 22); g.lineTo(46, 22); g.quadraticCurveTo(58, 22, 58, 16); g.lineTo(58, 22); g.quadraticCurveTo(56, 30, 44, 32); g.lineTo(40, 32); g.lineTo(42, 44); g.lineTo(50, 50); g.lineTo(14, 50); g.lineTo(22, 44); g.lineTo(24, 32); g.lineTo(18, 32); g.quadraticCurveTo(8, 30, 8, 22); g.closePath();
    fill(g, lg(g, 0, 16, 0, 50, ['#8a8f95', '#4f5257', '#2a2c30'])); stroke(g, '#0a0a0a', 1.2);
    line(g, 10, 23, 46, 23, 'rgba(255,255,255,0.5)', 1.2);
    diag(g, -0.7, () => { haft(g, WOOD, -2, 20, 3.5); rr(g, -8, -9, 16, 8, 1.5); fill(g, metal(g, '#8a8f95', -8, 8)); stroke(g, '#1a1a1a', 0.8); }, 40, 12, 0.8);
  },
  crafting: (g) => {
    SHAPES.gem(g, '#e0314f');
    diag(g, D45, () => { line(g, 0, 22, 0, -20, '#3a3a3a', 2.4); line(g, 0, 22, 0, -20, '#d0d4d8', 1.4); }, 46, 22, 0.6);
  },
};

export function skillIcon(id) {
  const key = 's:' + id;
  let url = cache.get(key);
  if (url) return url;
  const src = canvas();
  const g = src.getContext('2d');
  try { (SKILL_PAINT[id] || ((gg) => placeholder(gg, '#c9a24a')))(g); } catch (err) { console.warn('[ui] skill icon', id, err); }
  url = finish(src).toDataURL();
  cache.set(key, url);
  return url;
}

// ---------------------------------------------------------------------------------- map icons
// Small round markers for the minimap / world map: { bg, glyph(g) } drawn on a 24px canvas.
const MAP_ICON = {
  bank: ['#c9a24a', (g) => { for (let i = 0; i < 3; i++) { ell(g, 12, 16 - i * 3, 5.5, 2); fill(g, i === 2 ? '#fff6c0' : '#f2c94c'); stroke(g, '#6a4a10', 0.8); } }],
  shop: ['#3a6ea8', (g) => { g.beginPath(); g.moveTo(7, 10); g.lineTo(17, 10); g.lineTo(16, 18); g.lineTo(8, 18); g.closePath(); fill(g, '#f2e6c8'); stroke(g, '#2a1a0a', 0.8); g.beginPath(); g.arc(12, 10, 3, Math.PI, 0); stroke(g, '#f2e6c8', 1.4); }],
  furnace: ['#a83a1a', (g) => { g.beginPath(); g.moveTo(12, 5); g.bezierCurveTo(18, 11, 18, 18, 12, 19); g.bezierCurveTo(6, 18, 6, 12, 10, 9); g.bezierCurveTo(10, 13, 12, 13, 12, 5); fill(g, '#ffd27a'); }],
  anvil: ['#5a5f66', (g) => { poly(g, [[5, 9], [17, 9], [19, 7], [19, 11], [15, 12], [14, 15], [17, 18], [7, 18], [10, 15], [9, 12]]); fill(g, '#e8ecf0'); }],
  range: ['#8a5a2a', (g) => { rr(g, 7, 10, 10, 8, 2); fill(g, '#2a2a2a'); line(g, 9, 6, 9, 9, '#fff', 1); line(g, 13, 5, 13, 9, '#fff', 1); }],
  altar: ['#6a4ad8', (g) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 2.6 : 6.5; g.lineTo(12 + Math.cos(a) * r, 12 + Math.sin(a) * r); } g.closePath(); fill(g, '#e8e0ff'); }],
  portal: ['#2a2a3a', (g) => { g.beginPath(); g.moveTo(7, 18); g.lineTo(7, 11); g.arc(12, 11, 5, Math.PI, 0); g.lineTo(17, 18); g.closePath(); fill(g, '#0a0a10'); stroke(g, '#b9a888', 1.2); }],
  quest: ['#2e6fb0', (g) => { g.font = 'bold 15px serif'; g.fillStyle = '#ffd34d'; g.textAlign = 'center'; g.fillText('!', 12, 18); }],
  fish: ['#2a6a9a', (g) => { ell(g, 11, 12, 5.5, 3); fill(g, '#cfe8ff'); poly(g, [[16, 12], [19, 9], [19, 15]]); fill(g, '#cfe8ff'); }],
  exchange: ['#1f7a5a', (g) => { line(g, 6, 9, 17, 9, '#e8fff4', 1.6); poly(g, [[17, 6], [20, 9], [17, 12]]); fill(g, '#e8fff4'); line(g, 18, 15, 7, 15, '#e8fff4', 1.6); poly(g, [[7, 12], [4, 15], [7, 18]]); fill(g, '#e8fff4'); }],
  spin: ['#7a5a3a', (g) => { circle(g, 12, 12, 5.5); stroke(g, '#f2e6c8', 1.4); for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 4; line(g, 12 - Math.cos(a) * 5, 12 - Math.sin(a) * 5, 12 + Math.cos(a) * 5, 12 + Math.sin(a) * 5, '#f2e6c8', 0.9); } }],
  tan: ['#8a5a3c', (g) => { rr(g, 7, 7, 10, 11, 2); fill(g, '#e0b48a'); stroke(g, '#3a2010', 0.8); }],
  oracle: ['#3a2a7a', (g) => { ell(g, 12, 12, 7, 4); fill(g, '#e8e0ff'); circle(g, 12, 12, 2.6); fill(g, '#6a4ad8'); }],
  well: ['#3a5a7a', (g) => { rr(g, 7, 11, 10, 7, 1.5); fill(g, '#cfd8e0'); line(g, 7, 9, 17, 9, '#cfd8e0', 1.4); }],
  thief: ['#4a3a6a', (g) => { ell(g, 8.5, 12, 3.2, 2.2); fill(g, '#e8e0ff'); ell(g, 15.5, 12, 3.2, 2.2); fill(g, '#e8e0ff'); }],
};
export function mapIconCanvas(kind, size = 24) {
  const key = 'm:' + kind + ':' + size;
  let c = cache.get(key);
  if (c) return c;
  c = canvas(size, size);
  const g = c.getContext('2d');
  g.scale(size / 24, size / 24);
  const [bg, glyph] = MAP_ICON[kind] || MAP_ICON.quest;
  circle(g, 12, 12, 10.5); fill(g, '#0a0604');
  circle(g, 12, 12, 9.5); fill(g, rg(g, 9, 8, 1, 11, [shade(bg, 0.35), bg, shade(bg, -0.45)]));
  circle(g, 12, 12, 9.5); stroke(g, 'rgba(255,230,160,0.55)', 1);
  try { glyph(g); } catch { /* ignore */ }
  cache.set(key, c);
  return c;
}
export const MAP_ICON_KINDS = Object.keys(MAP_ICON);

// ---------------------------------------------------------------------------------- tab glyphs (SVG)
const SVG = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" width="22" height="22" aria-hidden="true" fill="currentColor" stroke="none">${body}</svg>`;
const TAB_SVG = {
  combat: SVG('<path d="M4 3l8.6 8.6-1.5 1.5L2.5 4.5 2 2zM20 3l-8.6 8.6 1.5 1.5L21.5 4.5 22 2z" opacity=".95"/><path d="M5.5 15.2l3.3 3.3-1.6 1.6-1.4-1.4-2 2-1.2-1.2 2-2-1.4-1.4zM18.5 15.2l-3.3 3.3 1.6 1.6 1.4-1.4 2 2 1.2-1.2-2-2 1.4-1.4z"/><rect x="7.3" y="13.3" width="2.2" height="5" transform="rotate(-45 8.4 15.8)"/><rect x="14.5" y="13.3" width="2.2" height="5" transform="rotate(45 15.6 15.8)"/>'),
  skills: SVG('<rect x="3" y="13" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/><path d="M2.5 11.5l6-5 4 3 7-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>'),
  quests: SVG('<path d="M6 3h11a3 3 0 0 1 3 3v1h-3v12a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3v-1h3V6a3 3 0 0 1 1-3z" opacity=".95"/><path d="M8 8h6M8 11h6M8 14h4" stroke="#1d1510" stroke-width="1.4" stroke-linecap="round"/>'),
  inventory: SVG('<path d="M8 6V5a4 4 0 0 1 8 0v1h1.5A2.5 2.5 0 0 1 20 8.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5A2.5 2.5 0 0 1 6.5 6zm2 0h4V5a2 2 0 0 0-4 0z"/><path d="M4 11h16M10 11v3h4v-3" stroke="#1d1510" stroke-width="1.4" fill="none"/>'),
  equipment: SVG('<path d="M12 2c4.5 0 7.5 3.4 7.5 8.5V20l-3.2 2-1.3-6.5h-6l-1.3 6.5L4.5 20v-9.5C4.5 5.4 7.5 2 12 2z"/><path d="M6.8 10.5h10.4" stroke="#1d1510" stroke-width="1.8"/><path d="M12 3.5v6" stroke="#1d1510" stroke-width="1.2"/>'),
  spellbook: SVG('<path d="M4 3.5A1.5 1.5 0 0 1 5.5 2H19v17H6a2 2 0 0 0 0 3h13v-1.5H6.2a.6.6 0 0 1 0-1.2H20V2.5"/><path d="M4 3.5V20a2 2 0 0 1 2-2" /><path d="M12.5 5.5l1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.5-2.5 1.5.6-2.8-2.1-1.9 2.8-.3z" fill="#1d1510"/>'),
  settings: SVG('<path d="M10.3 2h3.4l.5 2.6 1.6.7 2.2-1.5 2.4 2.4-1.5 2.2.7 1.6 2.6.5v3.4l-2.6.5-.7 1.6 1.5 2.2-2.4 2.4-2.2-1.5-1.6.7-.5 2.6h-3.4l-.5-2.6-1.6-.7-2.2 1.5-2.4-2.4 1.5-2.2-.7-1.6L2 13.7v-3.4l2.6-.5.7-1.6-1.5-2.2 2.4-2.4 2.2 1.5 1.6-.7z"/><circle cx="12" cy="12" r="3.4" fill="#1d1510"/>'),
  wallet: SVG('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3h1.5A1.5 1.5 0 0 1 21 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-14A2.5 2.5 0 0 1 3 17.5z"/><rect x="14" y="11.5" width="7" height="4" rx="1" fill="#1d1510"/><circle cx="16.5" cy="13.5" r="1" fill="currentColor"/>'),
  players: SVG('<circle cx="9" cy="7.5" r="3.5"/><path d="M2.5 20c0-4 2.8-6.5 6.5-6.5s6.5 2.5 6.5 6.5z"/><circle cx="17" cy="8.5" r="2.8" opacity=".8"/><path d="M16 13.6c3.4 0 5.5 2.4 5.5 6.4h-4.6c0-2.6-.8-4.8-2.5-6.2z" opacity=".8"/>'),
  chain: SVG('<path d="M9.5 14.5l5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10.5 6.5l1.8-1.8a4 4 0 0 1 5.7 5.7l-1.8 1.8M13.5 17.5l-1.8 1.8a4 4 0 0 1-5.7-5.7l1.8-1.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  exchange: SVG('<path d="M4 8h13l-3-3M20 16H7l3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  map: SVG('<path d="M2 5l6.5-2.5 7 2.5L22 2.5V19l-6.5 2.5-7-2.5L2 21.5z"/><path d="M8.5 2.5V19M15.5 5v16.5" stroke="#1d1510" stroke-width="1.2"/>'),
  chat: SVG('<path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M6 9h12M6 12.5h8" stroke="#1d1510" stroke-width="1.4" stroke-linecap="round"/>'),
  oracle: SVG('<path d="M12 2l3 6 6 1-4.5 4.4 1 6.6L12 17l-5.5 3 1-6.6L3 9l6-1z" opacity=".35"/><circle cx="12" cy="12" r="4.5"/>'),
  close: SVG('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'),
  compass: SVG('<path d="M12 2l3 10-3 10-3-10z"/>'),
  run: SVG('<circle cx="14.5" cy="4" r="2.2"/><path d="M10 8.5l3.5-1.5 3 2.5 2.5 1-1 1.7-3-1-1.4-1-1.3 3.6 3.2 2.7-.8 6h-2.1l.7-5-3.3-2.4-1.6 3.4-4.4 1.6-.8-1.8 3.6-1.4 3-7-2 .9-1.3 2.4-1.8-.9z"/>'),
  heart: SVG('<path d="M12 21C4 15 2 11 2 7.5A4.6 4.6 0 0 1 6.6 3c2.2 0 3.7 1.2 5.4 3.2C13.7 4.2 15.2 3 17.4 3A4.6 4.6 0 0 1 22 7.5C22 11 20 15 12 21z"/>'),
  coin: SVG('<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="6.8" fill="none" stroke="#1d1510" stroke-width="1.4"/><path d="M14.5 9.2a3.4 3.4 0 1 0 0 5.6" fill="none" stroke="#1d1510" stroke-width="1.8" stroke-linecap="round"/>'),
  logout: SVG('<path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5z"/><path d="M15 7l5 5-5 5M20 12H9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  music: SVG('<path d="M9 17.5V5l11-2.5v12.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="15" r="3"/>'),
  emote: SVG('<circle cx="12" cy="12" r="9.5"/><circle cx="8.8" cy="10" r="1.3" fill="#1d1510"/><circle cx="15.2" cy="10" r="1.3" fill="#1d1510"/><path d="M7.8 14a4.8 4.8 0 0 0 8.4 0" fill="none" stroke="#1d1510" stroke-width="1.6" stroke-linecap="round"/>'),
};
export function tabSvg(name) { return TAB_SVG[name] || null; }
export const TAB_SVG_NAMES = Object.keys(TAB_SVG);

// Resolve a tab icon spec (builtin name, raw <svg>, data/http URL, or short text) to HTML.
export function iconHTML(icon) {
  if (!icon) return TAB_SVG.oracle;
  if (typeof icon !== 'string') return '';
  if (TAB_SVG[icon]) return TAB_SVG[icon];
  if (icon.trim().startsWith('<svg')) return icon;
  if (/^(data:|https?:|\.\/|\/)/.test(icon)) return `<img src="${icon.replace(/"/g, '&quot;')}" alt="" width="22" height="22">`;
  const t = icon.slice(0, 2).replace(/[<>&"]/g, '');
  return `<span class="u-tabtxt">${t}</span>`;
}

// ---------------------------------------------------------------------------------- spell icons
// A glowing orb in the spell's colour with the glyph of its main sigil.
const SPELL_GLYPH = {
  spark_bolt: 'spark_sigil', tide_bolt: 'tide_sigil', stone_bolt: 'stone_sigil', ember_bolt: 'ember_sigil',
  thought_lance: 'thought_sigil', insight_storm: 'insight_sigil',
};
export function spellIcon(spell) {
  const key = 'sp:' + spell.id;
  let url = cache.get(key);
  if (url) return url;
  const src = canvas();
  const g = src.getContext('2d');
  const c = spell.color || '#8fe3ff';
  const tele = !!spell.teleport;
  g.save(); g.shadowColor = c; g.shadowBlur = 12;
  circle(g, 32, 32, 21); fill(g, rg(g, 26, 24, 2, 24, [shade(c, 0.55), mix(c, '#2a1a5a', 0.35), '#140c26']));
  g.restore();
  circle(g, 32, 32, 21); stroke(g, shade(c, 0.3), 1.6);
  g.save(); g.translate(32, 32); g.shadowColor = '#fff'; g.shadowBlur = 6;
  if (tele) {
    g.beginPath(); for (let a = 0; a < Math.PI * 3.4; a += 0.15) { const r = 2 + a * 3.1; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.lineCap = 'round'; stroke(g, '#ffffff', 2.6);
  } else {
    const glyph = SIGIL_GLYPH[SPELL_GLYPH[spell.id]] || SIGIL_GLYPH.insight_sigil;
    g.scale(1.15, 1.15); glyph(g);
    if (spell.id === 'tide_bolt') stroke(g, '#ffffff', 3); else { fill(g, lg(g, -10, -12, 10, 12, ['#ffffff', shade(c, 0.4)])); stroke(g, shade(c, -0.5), 0.7); }
  }
  g.restore();
  sparkle(g, 24, 22, 3.5);
  url = finish(src, { shadow: 0.25 }).toDataURL();
  cache.set(key, url);
  return url;
}
