// Hand-painted texture atlas for every prop (buildings, structures, objects, items).
// Owner: props builder. One 2048² canvas: 40 repeating 256 px cells (8 × 5, 240 px pattern +
// 8 px wrapped margin) and a sign strip below (painted signboards, non-repeating).
// Textures are painted in light, mostly neutral tones: vertex colours give the hue, the texture
// gives the brush work. Full-colour "decal" cells (banners, books, ledger) are painted in colour.

export const ATLAS_SIZE = 2048;
export const CELL = 256;
export const PAD = 8;
export const PAT = CELL - PAD * 2; // 240
export const SIGN_Y0 = 1280; // sign strip starts here

export const TILE = {
  FLAT: 0, PLANKS: 1, PLASTER: 2, STONE: 3, FLAGSTONE: 4, THATCH: 5, SHINGLES: 6, SLATE: 7,
  CLAY: 8, BARK: 9, LEAVES: 10, LOGEND: 11, RUBBLE: 12, COBBLE: 13, CANVAS: 14, STRIPES: 15,
  WINDOW: 16, DOOR: 17, ROCK: 18, METAL: 19, MARBLE: 20, CRYSTAL: 21, HAY: 22, BRICK: 23,
  TURF: 24, BANNER_CHAIN: 25, BANNER_SHERIFF: 26, BANNER_HOOD: 27, BANNER_ORBIO: 28, LEDGER: 29,
  RUNES: 30, NET: 31, BOOKS: 32, BOTTLES: 33, CARPET: 34, NOTICES: 35, TARGET: 36, PAVING: 37,
  IVY: 38, SACK: 39,
};

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// warm neutral grey (v in 0..1) -> css
const wn = (v, a = 1, warm = 1) => {
  const r = Math.round(clamp01(v) * 255), g = Math.round(clamp01(v * (1 - 0.025 * warm)) * 255), b = Math.round(clamp01(v * (1 - 0.07 * warm)) * 255);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};
const rgba = (r, g, b, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function tint(hex, k, a = 1) {
  const [r, g, b] = hexRgb(hex);
  return rgba(Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k), a);
}

// Draw fn(dx, dy) at the 9 wrapped offsets so shapes crossing the border tile seamlessly.
function wrap(S, fn) {
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) fn(ox * S, oy * S);
}

// Soft painterly mottling over the whole pattern.
function mottle(g, S, r, n, amp, minR = 10, maxR = 40) {
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * S, rad = minR + r() * (maxR - minR);
    const light = r() < 0.5;
    const a = amp * (0.4 + r() * 0.6);
    wrap(S, (dx, dy) => {
      const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      grd.addColorStop(0, light ? `rgba(255,250,240,${a})` : `rgba(30,22,14,${a})`);
      grd.addColorStop(1, light ? 'rgba(255,250,240,0)' : 'rgba(30,22,14,0)');
      g.fillStyle = grd;
      g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    });
  }
}
function speckle(g, S, r, n, amp, size = 1.5) {
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * S;
    g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${amp * r()})` : `rgba(0,0,0,${amp * r()})`;
    g.fillRect(x, y, size, size);
  }
}
function wavyLine(g, x0, y0, len, amp, freq, phase, vertical = false) {
  g.beginPath();
  for (let t = 0; t <= len; t += 4) {
    const o = Math.sin(t * freq + phase) * amp + Math.sin(t * freq * 2.3 + phase * 1.7) * amp * 0.4;
    if (vertical) (t ? g.lineTo(x0 + o, y0 + t) : g.moveTo(x0 + o, y0 + t));
    else (t ? g.lineTo(x0 + t, y0 + o) : g.moveTo(x0 + t, y0 + o));
  }
  g.stroke();
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  if (w <= 0 || h <= 0) return;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------------------------------------------------------------------------------------------
// Tile painters: (g, S, r) paint a seamless S×S pattern.
// ---------------------------------------------------------------------------------------------
const P = {};

P[TILE.FLAT] = (g, S, r) => {
  g.fillStyle = wn(0.93); g.fillRect(0, 0, S, S);
  mottle(g, S, r, 40, 0.05, 15, 50);
  speckle(g, S, r, 400, 0.05);
};

P[TILE.PLANKS] = (g, S, r) => {
  const rows = 6, h = S / rows;
  for (let i = 0; i < rows; i++) {
    const y = i * h;
    const joints = [r() * S, (r() * S + S / 2) % S];
    const v = 0.78 + r() * 0.14;
    g.fillStyle = wn(v); g.fillRect(0, y, S, h);
    // per-board variation between joints
    for (const jx of joints) {
      const w = 40 + r() * 60;
      g.fillStyle = r() < 0.5 ? 'rgba(255,245,230,0.06)' : 'rgba(40,25,10,0.07)';
      wrap(S, (dx) => g.fillRect(jx + dx, y, w, h));
    }
    // grain
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = `rgba(60,40,20,${0.08 + r() * 0.12})`;
      g.lineWidth = 0.6 + r() * 1.2;
      wavyLine(g, -10, y + 3 + r() * (h - 6), S + 20, 0.8 + r() * 1.5, 0.02 + r() * 0.04, r() * 6);
    }
    // knot
    if (r() < 0.6) {
      const kx = r() * S, ky = y + h * (0.3 + r() * 0.4);
      wrap(S, (dx) => {
        g.fillStyle = 'rgba(60,35,15,0.35)';
        g.beginPath(); g.ellipse(kx + dx, ky, 5 + r() * 3, 2.5, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(60,35,15,0.18)'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(kx + dx, ky, 9, 4, 0, 0, Math.PI * 2); g.stroke();
      });
    }
    // joints + nails
    for (const jx of joints) {
      wrap(S, (dx) => {
        g.fillStyle = 'rgba(25,15,8,0.55)'; g.fillRect(jx + dx, y, 2, h);
        g.fillStyle = 'rgba(255,240,220,0.18)'; g.fillRect(jx + dx + 2, y, 1, h);
        g.fillStyle = 'rgba(20,15,10,0.6)';
        g.fillRect(jx + dx - 5, y + 6, 2.5, 2.5); g.fillRect(jx + dx + 5, y + h - 9, 2.5, 2.5);
      });
    }
    // gap shadow + top highlight
    g.fillStyle = 'rgba(20,12,6,0.6)'; g.fillRect(0, y + h - 2.5, S, 2.5);
    g.fillStyle = 'rgba(255,245,230,0.22)'; g.fillRect(0, y, S, 1.5);
  }
};

P[TILE.PLASTER] = (g, S, r) => {
  g.fillStyle = wn(0.92); g.fillRect(0, 0, S, S);
  mottle(g, S, r, 70, 0.07, 12, 55);
  // trowel strokes
  for (let i = 0; i < 60; i++) {
    const x = r() * S, y = r() * S, w = 20 + r() * 40;
    g.strokeStyle = r() < 0.5 ? 'rgba(255,255,250,0.1)' : 'rgba(80,60,40,0.06)';
    g.lineWidth = 3 + r() * 5;
    wrap(S, (dx, dy) => { g.beginPath(); g.moveTo(x + dx, y + dy); g.quadraticCurveTo(x + dx + w / 2, y + dy - 4 + r() * 8, x + dx + w, y + dy + r() * 6); g.stroke(); });
  }
  // hairline cracks
  for (let i = 0; i < 4; i++) {
    let x = r() * S, y = r() * S;
    g.strokeStyle = 'rgba(70,50,30,0.22)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 14; y += 4 + r() * 8; g.lineTo(x, y); }
    g.stroke();
  }
  speckle(g, S, r, 900, 0.07);
};

function blocks(g, S, r, rows, minW, maxW, mortarV, baseV, varV, chips = true) {
  g.fillStyle = wn(mortarV); g.fillRect(0, 0, S, S);
  const h = S / rows;
  for (let i = 0; i < rows; i++) {
    let x = r() * maxW;
    const y = i * h;
    const start = x;
    while (x < start + S) {
      const w = Math.min(minW + r() * (maxW - minW), start + S - x);
      const v = baseV + (r() - 0.5) * varV;
      const hue = r();
      wrap(S, (dx) => {
        const bx = x + dx + 1.5, by = y + 1.5, bw = w - 3, bh = h - 3;
        g.fillStyle = hue < 0.33 ? wn(v, 1, 1.6) : hue < 0.66 ? wn(v, 1, 0.2) : wn(v);
        roundRect(g, bx, by, bw, bh, 3); g.fill();
        const grd = g.createLinearGradient(0, by, 0, by + bh);
        grd.addColorStop(0, 'rgba(255,250,240,0.22)'); grd.addColorStop(0.25, 'rgba(255,250,240,0)');
        grd.addColorStop(0.7, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(20,14,8,0.28)');
        g.fillStyle = grd; roundRect(g, bx, by, bw, bh, 3); g.fill();
        if (chips && r() < 0.35) {
          g.fillStyle = 'rgba(30,22,14,0.3)';
          g.beginPath(); g.moveTo(bx + bw, by + bh); g.lineTo(bx + bw - 6 - r() * 6, by + bh); g.lineTo(bx + bw, by + bh - 5 - r() * 5); g.fill();
        }
      });
      x += w;
    }
  }
  mottle(g, S, r, 25, 0.06, 15, 40);
  speckle(g, S, r, 700, 0.1);
}
P[TILE.STONE] = (g, S, r) => blocks(g, S, r, 4, 45, 95, 0.5, 0.82, 0.16);
P[TILE.BRICK] = (g, S, r) => blocks(g, S, r, 8, 50, 62, 0.62, 0.78, 0.16, false);
P[TILE.PAVING] = (g, S, r) => blocks(g, S, r, 4, 58, 62, 0.45, 0.85, 0.12);

P[TILE.FLAGSTONE] = (g, S, r) => {
  g.fillStyle = wn(0.42); g.fillRect(0, 0, S, S);
  const n = 4, c = S / n;
  const pts = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const jit = i % n === 0 || j % n === 0 ? 0 : 1; // keep borders straight for tiling
    pts.push([i * c + (jit ? (r() - 0.5) * c * 0.5 : 0), j * c + (jit ? (r() - 0.5) * c * 0.5 : 0)]);
  }
  const pt = (i, j) => pts[j * (n + 1) + i];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const quad = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
    const cx = quad.reduce((s, p) => s + p[0], 0) / 4, cy = quad.reduce((s, p) => s + p[1], 0) / 4;
    const shrink = (p) => [cx + (p[0] - cx) * 0.94, cy + (p[1] - cy) * 0.94];
    const q = quad.map(shrink);
    g.fillStyle = wn(0.74 + r() * 0.18, 1, r() * 2);
    g.beginPath(); q.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill();
    const grd = g.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, c * 0.7);
    grd.addColorStop(0, 'rgba(255,250,240,0.14)'); grd.addColorStop(1, 'rgba(20,14,8,0.18)');
    g.fillStyle = grd; g.fill();
  }
  speckle(g, S, r, 800, 0.1);
};

P[TILE.THATCH] = (g, S, r) => {
  const rows = 5, h = S / rows;
  g.fillStyle = wn(0.7, 1, 2); g.fillRect(0, 0, S, S);
  for (let i = 0; i < rows; i++) {
    const y = i * h;
    for (let k = 0; k < 260; k++) {
      const x = r() * S, yy = y - h * 0.15 + r() * h * 0.5, len = h * (0.6 + r() * 0.6);
      const v = 0.62 + r() * 0.38;
      g.strokeStyle = wn(v, 0.9, 2.2); g.lineWidth = 1 + r() * 1.6;
      const sl = (r() - 0.5) * 6;
      wrap(S, (dx, dy) => { g.beginPath(); g.moveTo(x + dx, yy + dy); g.quadraticCurveTo(x + dx + sl, yy + dy + len * 0.5, x + dx + sl * 1.6, yy + dy + len); g.stroke(); });
    }
    const grd = g.createLinearGradient(0, y + h * 0.65, 0, y + h);
    grd.addColorStop(0, 'rgba(40,25,10,0)'); grd.addColorStop(1, 'rgba(40,25,10,0.45)');
    g.fillStyle = grd; g.fillRect(0, y + h * 0.65, S, h * 0.35);
  }
};

function shingleRows(g, S, r, rows, minW, maxW, baseV, varV, rounded = 0, grain = true) {
  const h = S / rows;
  g.fillStyle = wn(baseV * 0.4); g.fillRect(0, 0, S, S);
  for (let i = 0; i < rows; i++) {
    const y = i * h;
    let x = (i % 2) * (minW / 2) + r() * 8;
    const start = x;
    while (x < start + S) {
      const w = Math.min(minW + r() * (maxW - minW), start + S - x);
      const v = baseV + (r() - 0.5) * varV;
      wrap(S, (dx, dy) => {
        const bx = x + dx + 1, by = y + dy - h * 0.25, bw = w - 2, bh = h * 1.25 - 1;
        g.fillStyle = wn(v, 1, 0.8);
        roundRect(g, bx, by, bw, bh, rounded); g.fill();
        if (grain) {
          g.strokeStyle = 'rgba(40,25,10,0.12)'; g.lineWidth = 0.8;
          for (let k = 0; k < 3; k++) { const gx = bx + 3 + r() * (bw - 6); g.beginPath(); g.moveTo(gx, by + 2); g.lineTo(gx + (r() - 0.5) * 3, by + bh - 2); g.stroke(); }
        }
        const grd = g.createLinearGradient(0, by, 0, by + bh);
        grd.addColorStop(0, 'rgba(20,12,6,0.35)'); grd.addColorStop(0.35, 'rgba(0,0,0,0)');
        grd.addColorStop(0.85, 'rgba(255,250,240,0.08)'); grd.addColorStop(1, 'rgba(20,12,6,0.3)');
        g.fillStyle = grd; roundRect(g, bx, by, bw, bh, rounded); g.fill();
      });
      x += w;
    }
  }
}
P[TILE.SHINGLES] = (g, S, r) => { shingleRows(g, S, r, 6, 24, 44, 0.8, 0.22, 2); speckle(g, S, r, 300, 0.08); };
P[TILE.SLATE] = (g, S, r) => { shingleRows(g, S, r, 8, 26, 34, 0.82, 0.18, 3, false); mottle(g, S, r, 20, 0.06); speckle(g, S, r, 500, 0.1); };

P[TILE.CLAY] = (g, S, r) => {
  const cols = 8, rows = 8, w = S / cols, h = S / rows;
  g.fillStyle = wn(0.35); g.fillRect(0, 0, S, S);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const v = 0.78 + (r() - 0.5) * 0.2;
    const x = i * w, y = j * h;
    wrap(S, (dx, dy) => {
      const grd = g.createLinearGradient(x + dx, 0, x + dx + w, 0);
      grd.addColorStop(0, wn(v * 0.72)); grd.addColorStop(0.45, wn(v * 1.08)); grd.addColorStop(1, wn(v * 0.66));
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x + dx + 1, y + dy - h * 0.2);
      g.lineTo(x + dx + w - 1, y + dy - h * 0.2);
      g.lineTo(x + dx + w - 1, y + dy + h * 0.75);
      g.quadraticCurveTo(x + dx + w / 2, y + dy + h * 1.15, x + dx + 1, y + dy + h * 0.75);
      g.closePath(); g.fill();
    });
  }
  speckle(g, S, r, 400, 0.08);
};

P[TILE.BARK] = (g, S, r) => {
  g.fillStyle = wn(0.62); g.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) {
    const x = r() * S;
    g.strokeStyle = r() < 0.55 ? `rgba(25,15,8,${0.35 + r() * 0.3})` : `rgba(255,240,220,${0.1 + r() * 0.12})`;
    g.lineWidth = 1.5 + r() * 4;
    const amp = 2 + r() * 4, f = 0.02 + r() * 0.03, ph = r() * 6;
    wrap(S, (dx, dy) => wavyLine(g, x + dx, -10 + dy, S + 20, amp, f, ph, true));
  }
  // horizontal fissures
  for (let i = 0; i < 18; i++) {
    const x = r() * S, y = r() * S;
    g.strokeStyle = 'rgba(25,15,8,0.35)'; g.lineWidth = 1.2;
    wrap(S, (dx, dy) => { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + 6 + r() * 8, y + dy + (r() - 0.5) * 3); g.stroke(); });
  }
  speckle(g, S, r, 400, 0.12, 2);
};

P[TILE.LEAVES] = (g, S, r) => {
  g.fillStyle = wn(0.36, 1, -1); g.fillRect(0, 0, S, S);
  for (let i = 0; i < 620; i++) {
    const x = r() * S, y = r() * S;
    const v = 0.5 + r() * 0.55;
    const rx = 5 + r() * 8, ry = 2.5 + r() * 4, rot = r() * Math.PI;
    wrap(S, (dx, dy) => {
      g.fillStyle = wn(v, 1, -1);
      g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, rot, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(20,30,10,0.25)'; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(x + dx - Math.cos(rot) * rx, y + dy - Math.sin(rot) * rx); g.lineTo(x + dx + Math.cos(rot) * rx, y + dy + Math.sin(rot) * rx); g.stroke();
    });
  }
  mottle(g, S, r, 30, 0.12, 15, 45);
};

P[TILE.LOGEND] = (g, S, r) => {
  const c = S / 2;
  g.fillStyle = wn(0.45); g.fillRect(0, 0, S, S);
  g.fillStyle = wn(0.86, 1, 1.5); g.beginPath(); g.arc(c, c, S * 0.47, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 14; k++) {
    g.strokeStyle = `rgba(110,70,30,${0.18 + r() * 0.2})`; g.lineWidth = 1 + r() * 2;
    g.beginPath(); g.ellipse(c + (r() - 0.5) * 3, c + (r() - 0.5) * 3, S * 0.03 * (k + 1), S * 0.03 * (k + 1) * (0.94 + r() * 0.08), r(), 0, Math.PI * 2); g.stroke();
  }
  for (let k = 0; k < 6; k++) {
    const a = r() * Math.PI * 2;
    g.strokeStyle = 'rgba(60,35,15,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * S * 0.38, c + Math.sin(a) * S * 0.38); g.stroke();
  }
  g.strokeStyle = 'rgba(40,25,10,0.8)'; g.lineWidth = S * 0.05;
  g.beginPath(); g.arc(c, c, S * 0.47, 0, Math.PI * 2); g.stroke();
};

P[TILE.RUBBLE] = (g, S, r) => {
  g.fillStyle = wn(0.42); g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const x = r() * S, y = r() * S, rx = 12 + r() * 16, ry = 9 + r() * 10, rot = (r() - 0.5) * 0.6;
    const v = 0.66 + r() * 0.26;
    wrap(S, (dx, dy) => {
      g.fillStyle = wn(v, 1, r() * 2);
      g.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2, rr = 0.82 + r() * 0.25;
        const px = x + dx + Math.cos(a + rot) * rx * rr, py = y + dy + Math.sin(a + rot) * ry * rr;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath(); g.fill();
      const grd = g.createLinearGradient(0, y + dy - ry, 0, y + dy + ry);
      grd.addColorStop(0, 'rgba(255,250,240,0.2)'); grd.addColorStop(1, 'rgba(15,10,5,0.3)');
      g.fillStyle = grd; g.fill();
    });
  }
  speckle(g, S, r, 500, 0.1);
};

P[TILE.COBBLE] = (g, S, r) => {
  g.fillStyle = wn(0.4); g.fillRect(0, 0, S, S);
  const n = 8, c = S / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i * c + (j % 2) * c * 0.5 + (r() - 0.5) * 4, y = j * c + (r() - 0.5) * 4;
    const v = 0.68 + r() * 0.24;
    wrap(S, (dx, dy) => {
      g.fillStyle = wn(v, 1, r() * 2);
      roundRect(g, x + dx + 2, y + dy + 2, c - 4, c - 4, c * 0.4); g.fill();
      const grd = g.createRadialGradient(x + dx + c * 0.4, y + dy + c * 0.35, 1, x + dx + c / 2, y + dy + c / 2, c * 0.6);
      grd.addColorStop(0, 'rgba(255,250,240,0.25)'); grd.addColorStop(1, 'rgba(15,10,5,0.25)');
      g.fillStyle = grd; roundRect(g, x + dx + 2, y + dy + 2, c - 4, c - 4, c * 0.4); g.fill();
    });
  }
};

P[TILE.CANVAS] = (g, S, r) => {
  g.fillStyle = wn(0.9); g.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 3) {
    g.fillStyle = 'rgba(80,60,40,0.05)'; g.fillRect(0, i, S, 1); g.fillRect(i, 0, 1, S);
  }
  mottle(g, S, r, 30, 0.08, 15, 60);
  // seams
  for (const x of [0, S / 2]) {
    g.fillStyle = 'rgba(60,40,20,0.25)'; g.fillRect(x, 0, 2, S);
    g.fillStyle = 'rgba(60,40,20,0.3)';
    for (let y = 0; y < S; y += 8) { g.fillRect(x + 5, y, 1.2, 4); g.fillRect(x - 5, y + 4, 1.2, 4); }
  }
};

P[TILE.STRIPES] = (g, S, r) => {
  g.fillStyle = wn(0.97); g.fillRect(0, 0, S / 2, S);
  g.fillStyle = wn(0.55); g.fillRect(S / 2, 0, S / 2, S);
  for (let i = 0; i < S; i += 3) { g.fillStyle = 'rgba(60,40,20,0.05)'; g.fillRect(0, i, S, 1); }
  mottle(g, S, r, 20, 0.05);
};

P[TILE.WINDOW] = (g, S, r) => {
  // Leaded diamond panes in a timber frame (decal: one window per cell).
  g.fillStyle = wn(0.25); g.fillRect(0, 0, S, S);
  const f = 18;
  const grd = g.createLinearGradient(0, f, S, S - f);
  grd.addColorStop(0, wn(0.95)); grd.addColorStop(0.5, wn(0.78)); grd.addColorStop(1, wn(0.9));
  g.fillStyle = grd; g.fillRect(f, f, S - 2 * f, S - 2 * f);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.12})`;
    g.fillRect(f + r() * (S - 2 * f), f + r() * (S - 2 * f), 10 + r() * 20, 10 + r() * 20);
  }
  g.save(); g.beginPath(); g.rect(f, f, S - 2 * f, S - 2 * f); g.clip();
  g.strokeStyle = wn(0.18); g.lineWidth = 3;
  const s = 34;
  for (let k = -S; k < S * 2; k += s) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke();
    g.beginPath(); g.moveTo(k, S); g.lineTo(k + S, 0); g.stroke();
  }
  g.restore();
  g.fillStyle = wn(0.3); g.fillRect(S / 2 - 5, f, 10, S - 2 * f); g.fillRect(f, S / 2 - 5, S - 2 * f, 10);
  g.strokeStyle = wn(0.12); g.lineWidth = 4; g.strokeRect(f, f, S - 2 * f, S - 2 * f);
};

P[TILE.DOOR] = (g, S, r) => {
  const n = 5, w = S / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = wn(0.7 + r() * 0.15); g.fillRect(i * w, 0, w, S);
    for (let k = 0; k < 5; k++) {
      g.strokeStyle = `rgba(50,30,15,${0.1 + r() * 0.1})`; g.lineWidth = 1;
      wavyLine(g, i * w + 4 + r() * (w - 8), 0, S, 1, 0.03, r() * 6, true);
    }
    g.fillStyle = 'rgba(20,12,6,0.6)'; g.fillRect(i * w, 0, 2, S);
  }
  for (const y of [S * 0.18, S * 0.78]) {
    g.fillStyle = wn(0.22); g.fillRect(0, y, S, 14);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, y, S, 2);
    g.fillStyle = wn(0.12);
    for (let x = 10; x < S; x += 26) { g.beginPath(); g.arc(x, y + 7, 3, 0, Math.PI * 2); g.fill(); }
  }
  g.strokeStyle = wn(0.15); g.lineWidth = 5;
  g.beginPath(); g.arc(S * 0.78, S * 0.52, 12, 0, Math.PI * 2); g.stroke();
  g.fillStyle = wn(0.15); g.beginPath(); g.arc(S * 0.78, S * 0.45, 6, 0, Math.PI * 2); g.fill();
  g.strokeStyle = wn(0.2); g.lineWidth = 8; g.strokeRect(0, 0, S, S);
};

P[TILE.ROCK] = (g, S, r) => {
  g.fillStyle = wn(0.72); g.fillRect(0, 0, S, S);
  mottle(g, S, r, 60, 0.12, 15, 50);
  for (let i = 0; i < 14; i++) {
    let x = r() * S, y = r() * S;
    g.strokeStyle = `rgba(25,18,12,${0.25 + r() * 0.25})`; g.lineWidth = 1 + r() * 1.5;
    const pts = [[x, y]];
    for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 30; y += (r() - 0.3) * 22; pts.push([x, y]); }
    wrap(S, (dx, dy) => { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0] + dx, p[1] + dy) : g.moveTo(p[0] + dx, p[1] + dy))); g.stroke(); });
    g.strokeStyle = 'rgba(255,250,240,0.12)';
    wrap(S, (dx, dy) => { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0] + dx + 1.5, p[1] + dy - 1.5) : g.moveTo(p[0] + dx + 1.5, p[1] + dy - 1.5))); g.stroke(); });
  }
  for (let i = 0; i < 25; i++) {
    const x = r() * S, y = r() * S, rad = 3 + r() * 7;
    g.fillStyle = `rgba(190,200,140,${0.08 + r() * 0.12})`;
    wrap(S, (dx, dy) => { g.beginPath(); g.arc(x + dx, y + dy, rad, 0, Math.PI * 2); g.fill(); });
  }
  speckle(g, S, r, 900, 0.12, 2);
};

P[TILE.METAL] = (g, S, r) => {
  g.fillStyle = wn(0.8, 1, 0); g.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.05})`; g.fillRect(0, i, S, 1); }
  for (let i = 0; i < 70; i++) {
    const x = r() * S, y = r() * S, rad = 4 + r() * 10;
    wrap(S, (dx, dy) => {
      const grd = g.createRadialGradient(x + dx - 2, y + dy - 2, 0, x + dx, y + dy, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0.08)');
      g.fillStyle = grd; g.beginPath(); g.arc(x + dx, y + dy, rad, 0, Math.PI * 2); g.fill();
    });
  }
};

P[TILE.MARBLE] = (g, S, r) => {
  g.fillStyle = wn(0.95, 1, 0.4); g.fillRect(0, 0, S, S);
  mottle(g, S, r, 30, 0.04, 20, 60);
  for (let i = 0; i < 9; i++) {
    let x = r() * S, y = r() * S;
    g.strokeStyle = `rgba(90,90,100,${0.12 + r() * 0.18})`; g.lineWidth = 0.6 + r() * 1.6;
    const pts = [[x, y]];
    for (let k = 0; k < 8; k++) { x += 10 + r() * 20; y += (r() - 0.5) * 24; pts.push([x, y]); }
    wrap(S, (dx, dy) => { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0] + dx, p[1] + dy) : g.moveTo(p[0] + dx, p[1] + dy))); g.stroke(); });
  }
  g.fillStyle = 'rgba(60,60,70,0.25)';
  g.fillRect(0, 0, S, 1.5); g.fillRect(0, S / 2, S, 1.5); g.fillRect(0, 0, 1.5, S); g.fillRect(S / 2, 0, 1.5, S);
};

P[TILE.CRYSTAL] = (g, S, r) => {
  const grd = g.createLinearGradient(0, 0, 0, S);
  grd.addColorStop(0, wn(1, 1, 0)); grd.addColorStop(0.5, wn(0.78, 1, 0)); grd.addColorStop(1, wn(0.92, 1, 0));
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = r() * S;
    g.fillStyle = `rgba(255,255,255,${r() * 0.2})`;
    wrap(S, (dx) => g.fillRect(x + dx, 0, 2 + r() * 10, S));
  }
  for (let i = 0; i < 10; i++) {
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
    const x = r() * S;
    wrap(S, (dx, dy) => { g.beginPath(); g.moveTo(x + dx, dy); g.lineTo(x + dx + (r() - 0.5) * 60, dy + S); g.stroke(); });
  }
};

P[TILE.HAY] = (g, S, r) => {
  g.fillStyle = wn(0.7, 1, 2.5); g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 8 + r() * 18;
    g.strokeStyle = wn(0.6 + r() * 0.45, 0.9, 2.5); g.lineWidth = 0.8 + r();
    wrap(S, (dx, dy) => { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke(); });
  }
};

P[TILE.TURF] = (g, S, r) => {
  g.fillStyle = wn(0.6, 1, -1); g.fillRect(0, 0, S, S);
  mottle(g, S, r, 50, 0.12);
  for (let i = 0; i < 900; i++) {
    const x = r() * S, y = r() * S, l = 4 + r() * 8;
    g.strokeStyle = wn(0.5 + r() * 0.5, 0.8, -1); g.lineWidth = 1;
    wrap(S, (dx, dy) => { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + (r() - 0.5) * 3, y + dy - l); g.stroke(); });
  }
};

// ---- full-colour decals ---------------------------------------------------------------------
function bannerBase(g, S, field, trim) {
  g.fillStyle = field; g.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 3) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, i, S, 1); g.fillRect(i, 0, 1, S); }
  const grd = g.createLinearGradient(0, 0, S, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0.25)'); grd.addColorStop(0.2, 'rgba(0,0,0,0)'); grd.addColorStop(0.8, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.strokeStyle = trim; g.lineWidth = 10; g.strokeRect(14, 14, S - 28, S - 28);
  g.lineWidth = 3; g.strokeRect(26, 26, S - 52, S - 52);
}
function chainLink(g, x, y, w, h, color, lw) {
  g.strokeStyle = color; g.lineWidth = lw;
  roundRect(g, x - w / 2, y - h / 2, w, h, w / 2); g.stroke();
}
P[TILE.BANNER_CHAIN] = (g, S) => {
  bannerBase(g, S, '#2f6b2c', '#d8b14a');
  // a vertical chain of links in chain teal, alternating face/edge on
  const cx = S / 2;
  for (let i = 0; i < 4; i++) {
    const y = 52 + i * 46;
    if (i % 2 === 0) chainLink(g, cx, y, 46, 64, '#3ad6a0', 11);
    else { g.fillStyle = '#3ad6a0'; roundRect(g, cx - 7, y - 32, 14, 64, 7); g.fill(); }
  }
  g.fillStyle = '#d8b14a';
  for (const x of [50, S - 50]) for (const y of [50, S - 50]) { g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); }
};
P[TILE.BANNER_SHERIFF] = (g, S) => {
  bannerBase(g, S, '#8e1f22', '#e2b84a');
  const cx = S / 2, cy = S * 0.52;
  // crown over a coin with a key
  g.fillStyle = '#e2b84a';
  g.beginPath(); g.arc(cx, cy + 12, 46, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8e1f22'; g.beginPath(); g.arc(cx, cy + 12, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e2b84a';
  g.fillRect(cx - 5, cy - 14, 10, 54);
  g.beginPath(); g.arc(cx, cy - 16, 13, 0, Math.PI * 2); g.fill();
  g.fillRect(cx, cy + 22, 16, 7); g.fillRect(cx, cy + 32, 12, 7);
  g.beginPath();
  g.moveTo(cx - 44, cy - 50); g.lineTo(cx - 44, cy - 78); g.lineTo(cx - 24, cy - 62); g.lineTo(cx, cy - 88);
  g.lineTo(cx + 24, cy - 62); g.lineTo(cx + 44, cy - 78); g.lineTo(cx + 44, cy - 50); g.closePath(); g.fill();
};
P[TILE.BANNER_HOOD] = (g, S) => {
  bannerBase(g, S, '#26502a', '#cfc39a');
  const cx = S / 2, cy = S / 2;
  g.strokeStyle = '#efe2c4'; g.lineWidth = 9;
  g.beginPath(); g.arc(cx - 20, cy, 62, -1.1, 1.1); g.stroke(); // bow
  g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx - 20 + 62 * Math.cos(-1.1), cy + 62 * Math.sin(-1.1)); g.lineTo(cx - 20 + 62 * Math.cos(1.1), cy + 62 * Math.sin(1.1)); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(cx - 60, cy); g.lineTo(cx + 64, cy); g.stroke(); // arrow
  g.fillStyle = '#efe2c4';
  g.beginPath(); g.moveTo(cx + 80, cy); g.lineTo(cx + 58, cy - 13); g.lineTo(cx + 58, cy + 13); g.fill();
  g.beginPath(); g.moveTo(cx - 60, cy); g.lineTo(cx - 74, cy - 12); g.lineTo(cx - 50, cy); g.lineTo(cx - 74, cy + 12); g.fill();
};
P[TILE.BANNER_ORBIO] = (g, S) => {
  bannerBase(g, S, '#3a2266', '#8fe3ff');
  const cx = S / 2, cy = S / 2;
  const grd = g.createRadialGradient(cx, cy, 2, cx, cy, 52);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.35, '#8fe3ff'); grd.addColorStop(1, 'rgba(143,227,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 52, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#b18cff'; g.lineWidth = 4;
  g.beginPath(); g.ellipse(cx, cy, 78, 26, 0.4, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.ellipse(cx, cy, 78, 26, -0.4, 0, Math.PI * 2); g.stroke();
};
P[TILE.LEDGER] = (g, S, r) => {
  g.fillStyle = '#0a1a1c'; g.fillRect(0, 0, S, S);
  for (let row = 0; row < 12; row++) {
    const y = 10 + row * 19;
    // block number + hash-like glyph runs
    g.fillStyle = row % 3 === 0 ? '#f2c94c' : '#3ad6a0';
    let x = 8;
    while (x < S - 10) {
      const w = 4 + Math.floor(r() * 4) * 4;
      g.globalAlpha = 0.55 + r() * 0.45;
      g.fillRect(x, y, w, 7);
      x += w + 3 + (r() < 0.2 ? 10 : 0);
    }
    g.globalAlpha = 1;
    // little chain link at row start
    if (row % 3 === 1) chainLink(g, S - 14, y + 4, 8, 12, '#8fe3ff', 2);
  }
  g.strokeStyle = 'rgba(58,214,160,0.25)'; g.lineWidth = 1;
  for (let row = 0; row <= 12; row++) { g.beginPath(); g.moveTo(0, 6 + row * 19); g.lineTo(S, 6 + row * 19); g.stroke(); }
};
P[TILE.RUNES] = (g, S, r) => {
  g.fillStyle = '#2a2238'; g.fillRect(0, 0, S, S);
  mottle(g, S, r, 30, 0.1);
  const cx = S / 2, cy = S / 2;
  g.strokeStyle = '#8fe3ff'; g.lineWidth = 4;
  g.beginPath(); g.arc(cx, cy, S * 0.42, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, S * 0.34, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#b18cff'; g.lineWidth = 3;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, b = a + (Math.PI * 2) / 3;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * S * 0.34, cy + Math.sin(a) * S * 0.34); g.lineTo(cx + Math.cos(b) * S * 0.34, cy + Math.sin(b) * S * 0.34); g.stroke();
  }
  g.fillStyle = '#8fe3ff';
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.save(); g.translate(cx + Math.cos(a) * S * 0.38, cy + Math.sin(a) * S * 0.38); g.rotate(a);
    g.fillRect(-2, -6, 4, 12); g.fillRect(-6, -2, 12, 4); g.restore();
  }
  g.beginPath(); g.arc(cx, cy, 14, 0, Math.PI * 2); g.fill();
};
P[TILE.NET] = (g, S, r) => {
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(205,190,150,1)'; g.lineWidth = 3;
  const s = 30;
  for (let k = -S; k < S * 2; k += s) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke();
    g.beginPath(); g.moveTo(k, S); g.lineTo(k + S, 0); g.stroke();
  }
  g.fillStyle = 'rgba(160,140,100,1)';
  for (let y = 0; y <= S; y += s / 2) for (let x = ((y / (s / 2)) % 2) * (s / 2); x <= S; x += s) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
};
P[TILE.BOOKS] = (g, S, r) => {
  const cols = ['#7a2a2a', '#2a4a7a', '#3f6a2f', '#8a6a2a', '#4a2a5a', '#2a2a2a', '#a0522d', '#5a4a3a', '#2f5f5f'];
  g.fillStyle = '#3a2516'; g.fillRect(0, 0, S, S);
  const rows = 3, h = S / rows;
  for (let j = 0; j < rows; j++) {
    let x = 0;
    while (x < S) {
      const w = 8 + r() * 12, bh = h * (0.6 + r() * 0.3);
      const c = cols[Math.floor(r() * cols.length)];
      if (r() < 0.08) { x += w; continue; }
      g.fillStyle = c; g.fillRect(x, j * h + h - 10 - bh, w - 1, bh);
      g.fillStyle = 'rgba(255,220,140,0.6)'; g.fillRect(x + 1, j * h + h - 10 - bh * 0.8, w - 3, 2); g.fillRect(x + 1, j * h + h - 10 - bh * 0.25, w - 3, 2);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + w - 3, j * h + h - 10 - bh, 2, bh);
      x += w;
    }
    g.fillStyle = '#6a4a2a'; g.fillRect(0, j * h + h - 10, S, 10);
    g.fillStyle = 'rgba(255,240,220,0.2)'; g.fillRect(0, j * h + h - 10, S, 2);
  }
};
P[TILE.BOTTLES] = (g, S, r) => {
  const cols = ['#3f7f5a', '#7a3a5a', '#5a6aa8', '#a88a3a', '#8fe3ff', '#c96b3a', '#d8d0b0'];
  g.fillStyle = '#3a2516'; g.fillRect(0, 0, S, S);
  const rows = 3, h = S / rows;
  for (let j = 0; j < rows; j++) {
    let x = 4;
    while (x < S - 10) {
      const w = 12 + r() * 12, bh = h * (0.35 + r() * 0.4);
      const c = cols[Math.floor(r() * cols.length)];
      const by = j * h + h - 10;
      g.fillStyle = c;
      if (r() < 0.5) { roundRect(g, x, by - bh, w, bh, 4); g.fill(); g.fillRect(x + w * 0.35, by - bh - 8, w * 0.3, 9); }
      else { roundRect(g, x, by - bh * 0.7, w, bh * 0.7, w / 2); g.fill(); g.fillStyle = '#a0805a'; g.fillRect(x + 2, by - bh * 0.7 - 4, w - 4, 5); }
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 2, by - bh * 0.6, 2, bh * 0.4);
      x += w + 4 + r() * 6;
    }
    g.fillStyle = '#6a4a2a'; g.fillRect(0, j * h + h - 10, S, 10);
  }
};
P[TILE.CARPET] = (g, S, r) => {
  g.fillStyle = '#8e1f22'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#e2b84a'; g.fillRect(0, 0, 24, S); g.fillRect(S - 24, 0, 24, S);
  g.fillStyle = '#5a1012'; g.fillRect(28, 0, 6, S); g.fillRect(S - 34, 0, 6, S);
  g.fillStyle = '#e2b84a';
  for (let y = 0; y < S; y += 60) {
    g.save(); g.translate(S / 2, y + 30); g.rotate(Math.PI / 4); g.fillRect(-16, -16, 32, 32); g.restore();
    g.fillStyle = '#8e1f22'; g.save(); g.translate(S / 2, y + 30); g.rotate(Math.PI / 4); g.fillRect(-9, -9, 18, 18); g.restore();
    g.fillStyle = '#e2b84a';
  }
  for (let i = 0; i < S; i += 3) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, i, S, 1); }
};
P[TILE.NOTICES] = (g, S, r) => {
  g.fillStyle = '#7a5a3a'; g.fillRect(0, 0, S, S);
  speckle(g, S, r, 800, 0.15, 2);
  for (let i = 0; i < 7; i++) {
    const w = 50 + r() * 40, h = 60 + r() * 40, x = r() * (S - w), y = r() * (S - h);
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate((r() - 0.5) * 0.25);
    g.fillStyle = r() < 0.7 ? '#efe2c4' : '#e8d0a0'; g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = 'rgba(40,30,20,0.55)';
    for (let ly = -h / 2 + 12; ly < h / 2 - 6; ly += 8) g.fillRect(-w / 2 + 6, ly, (w - 12) * (0.5 + r() * 0.5), 2);
    g.fillStyle = '#a02020'; g.beginPath(); g.arc(0, -h / 2 + 5, 3.5, 0, Math.PI * 2); g.fill();
    g.restore();
  }
};
P[TILE.TARGET] = (g, S) => {
  const c = S / 2;
  g.fillStyle = '#d8c89a'; g.fillRect(0, 0, S, S);
  const rings = ['#f2efe6', '#2b2b2b', '#3a6fd8', '#c0392b', '#f2c94c'];
  for (let i = 0; i < rings.length; i++) {
    g.fillStyle = rings[i]; g.beginPath(); g.arc(c, c, S * 0.48 * (1 - i / rings.length), 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) { g.beginPath(); g.arc(c, c, S * 0.48 * (1 - i / 10), 0, Math.PI * 2); g.stroke(); }
};
P[TILE.IVY] = (g, S, r) => {
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 6; i++) {
    let x = r() * S, y = 0;
    g.strokeStyle = 'rgba(70,60,30,1)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y);
    while (y < S) {
      x += (r() - 0.5) * 16; y += 10;
      g.lineTo(x, y);
      if (r() < 0.8) {
        const lx = x + (r() - 0.5) * 18, ly = y + (r() - 0.5) * 8;
        g.fillStyle = `rgb(${50 + r() * 40},${100 + r() * 60},${30 + r() * 30})`;
        g.save(); g.translate(lx, ly); g.rotate(r() * 6);
        g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(9, -2, 0, 8); g.quadraticCurveTo(-9, -2, 0, -8); g.fill();
        g.restore();
      }
    }
    g.stroke();
  }
};
P[TILE.SACK] = (g, S, r) => {
  g.fillStyle = wn(0.82, 1, 2); g.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 4) {
    g.fillStyle = 'rgba(70,50,25,0.12)'; g.fillRect(0, i, S, 2); g.fillRect(i, 0, 2, S);
  }
  mottle(g, S, r, 30, 0.1);
  speckle(g, S, r, 500, 0.12, 2);
};

// ---------------------------------------------------------------------------------------------
// Atlas assembly
// ---------------------------------------------------------------------------------------------
export function paintAtlas(canvas) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  const pat = document.createElement('canvas');
  pat.width = pat.height = PAT;
  const pg = pat.getContext('2d');
  for (let id = 0; id < 40; id++) {
    const painter = P[id] || P[TILE.FLAT];
    pg.clearRect(0, 0, PAT, PAT);
    pg.save();
    painter(pg, PAT, mulberry(1000 + id * 77));
    pg.restore();
    const cx = (id % 8) * CELL, cy = Math.floor(id / 8) * CELL;
    g.save();
    g.beginPath(); g.rect(cx, cy, CELL, CELL); g.clip();
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) g.drawImage(pat, cx + PAD + ox * PAT, cy + PAD + oy * PAT);
    g.restore();
  }
}

// ---------------------------------------------------------------------------------------------
// Signs: carved boards with a name and a small icon, painted into the sign strip.
// ---------------------------------------------------------------------------------------------
const ICONS = {
  hall(g, s) { g.beginPath(); g.moveTo(-s, s * 0.2); g.lineTo(0, -s); g.lineTo(s, s * 0.2); g.closePath(); g.fill(); g.fillRect(-s * 0.7, s * 0.2, s * 1.4, s * 0.8); },
  sack(g, s) { g.beginPath(); g.moveTo(-s * 0.3, -s * 0.8); g.lineTo(s * 0.3, -s * 0.8); g.quadraticCurveTo(s * 1.1, s * 0.2, s * 0.6, s); g.lineTo(-s * 0.6, s); g.quadraticCurveTo(-s * 1.1, s * 0.2, -s * 0.3, -s * 0.8); g.fill(); },
  coin(g, s) { g.beginPath(); g.arc(0, 0, s * 0.9, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, 0, s * 0.55, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over'; g.fillRect(-s * 0.12, -s * 0.5, s * 0.24, s); },
  anvil(g, s) { g.beginPath(); g.moveTo(-s, -s * 0.4); g.lineTo(s * 0.9, -s * 0.4); g.quadraticCurveTo(s * 0.5, 0, s * 0.3, 0); g.lineTo(s * 0.3, s * 0.4); g.lineTo(s * 0.6, s * 0.8); g.lineTo(-s * 0.6, s * 0.8); g.lineTo(-s * 0.3, s * 0.4); g.lineTo(-s * 0.3, 0); g.quadraticCurveTo(-s * 0.8, 0, -s, -s * 0.4); g.fill(); },
  mug(g, s) { g.fillRect(-s * 0.6, -s * 0.6, s * 1.0, s * 1.4); g.lineWidth = s * 0.22; g.beginPath(); g.arc(s * 0.45, s * 0.1, s * 0.38, -1.4, 1.4); g.stroke(); g.beginPath(); g.arc(-s * 0.1, -s * 0.7, s * 0.55, Math.PI, 0); g.fill(); },
  fish(g, s) { g.beginPath(); g.ellipse(-s * 0.15, 0, s * 0.75, s * 0.4, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(s * 0.5, 0); g.lineTo(s, -s * 0.45); g.lineTo(s, s * 0.45); g.fill(); },
  bow(g, s) { g.lineWidth = s * 0.18; g.beginPath(); g.arc(-s * 0.5, 0, s, -1.1, 1.1); g.stroke(); g.lineWidth = s * 0.08; g.beginPath(); g.moveTo(-s * 0.5 + s * Math.cos(-1.1), s * Math.sin(-1.1)); g.lineTo(-s * 0.5 + s * Math.cos(1.1), s * Math.sin(1.1)); g.stroke(); g.lineWidth = s * 0.12; g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.stroke(); },
  pick(g, s) { g.lineWidth = s * 0.2; g.beginPath(); g.moveTo(-s * 0.6, s); g.lineTo(s * 0.4, -s * 0.4); g.stroke(); g.beginPath(); g.moveTo(-s * 0.4, -s * 0.9); g.quadraticCurveTo(s * 0.4, -s * 0.9, s, -s * 0.1); g.stroke(); },
  chain(g, s) { g.lineWidth = s * 0.22; roundRect(g, -s, -s * 0.4, s * 1.1, s * 0.8, s * 0.4); g.stroke(); roundRect(g, -s * 0.1, -s * 0.4, s * 1.1, s * 0.8, s * 0.4); g.stroke(); },
  shield(g, s) { g.beginPath(); g.moveTo(-s * 0.8, -s * 0.8); g.lineTo(s * 0.8, -s * 0.8); g.quadraticCurveTo(s * 0.8, s * 0.5, 0, s); g.quadraticCurveTo(-s * 0.8, s * 0.5, -s * 0.8, -s * 0.8); g.fill(); },
  sigil(g, s) { g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.7, 0); g.lineTo(0, s); g.lineTo(-s * 0.7, 0); g.closePath(); g.fill(); },
  crown(g, s) { g.beginPath(); g.moveTo(-s, s * 0.6); g.lineTo(-s, -s * 0.5); g.lineTo(-s * 0.5, 0); g.lineTo(0, -s * 0.8); g.lineTo(s * 0.5, 0); g.lineTo(s, -s * 0.5); g.lineTo(s, s * 0.6); g.closePath(); g.fill(); },
  wheel(g, s) { g.lineWidth = s * 0.15; for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI; g.beginPath(); g.moveTo(Math.cos(a) * s, Math.sin(a) * s); g.lineTo(-Math.cos(a) * s, -Math.sin(a) * s); g.stroke(); } g.beginPath(); g.arc(0, 0, s * 0.25, 0, Math.PI * 2); g.fill(); },
  cauldron(g, s) { g.beginPath(); g.arc(0, 0, s * 0.8, 0, Math.PI); g.fill(); g.fillRect(-s * 0.95, -s * 0.1, s * 1.9, s * 0.25); g.beginPath(); g.arc(-s * 0.3, -s * 0.5, s * 0.2, 0, Math.PI * 2); g.arc(s * 0.2, -s * 0.75, s * 0.15, 0, Math.PI * 2); g.fill(); },
  eye(g, s) { g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(0, -s * 0.9, s, 0); g.quadraticCurveTo(0, s * 0.9, -s, 0); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, 0, s * 0.3, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over'; },
  arrow(g, s) { g.beginPath(); g.moveTo(s, 0); g.lineTo(s * 0.2, -s * 0.7); g.lineTo(s * 0.2, -s * 0.3); g.lineTo(-s, -s * 0.3); g.lineTo(-s, s * 0.3); g.lineTo(s * 0.2, s * 0.3); g.lineTo(s * 0.2, s * 0.7); g.closePath(); g.fill(); },
};

// Paint one signboard into rect (x, y, w, h) of the atlas canvas.
// style: { board: '#hex', ink: '#hex', icon: name|null, arrow: 'left'|'right'|null, font }
export function paintSign(g, x, y, w, h, text, style = {}) {
  const board = style.board || '#6b4a2b';
  const ink = style.ink || '#f2d27a';
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#20150c'; g.fillRect(x, y, w, h);
  // board planks
  const r = mulberry(text.length * 131 + w);
  const inset = 4;
  g.fillStyle = board; g.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  for (let i = 0; i < 18; i++) {
    g.strokeStyle = `rgba(30,18,8,${0.1 + r() * 0.15})`; g.lineWidth = 1 + r();
    wavyLine(g, x, y + inset + r() * (h - inset * 2), w, 1, 0.03, r() * 6);
  }
  const grd = g.createLinearGradient(0, y, 0, y + h);
  grd.addColorStop(0, 'rgba(255,240,210,0.18)'); grd.addColorStop(0.5, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = grd; g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(20,12,6,0.8)'; g.lineWidth = Math.max(2, h * 0.05);
  g.strokeRect(x + inset + 4, y + inset + 4, w - inset * 2 - 8, h - inset * 2 - 8);
  // icon
  let tx = x + w / 2, maxW = w - 30;
  if (style.icon && ICONS[style.icon]) {
    const s = h * 0.27;
    g.save(); g.translate(x + h * 0.52, y + h / 2);
    g.fillStyle = ink; g.strokeStyle = ink;
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowOffsetY = 2;
    ICONS[style.icon](g, s);
    g.restore();
    tx = x + h * 0.95 + (w - h * 0.95) / 2;
    maxW = w - h * 1.05 - 14;
  }
  if (style.arrow) {
    g.save(); g.translate(style.arrow === 'left' ? x + h * 0.4 : x + w - h * 0.4, y + h / 2); if (style.arrow === 'left') g.scale(-1, 1);
    g.fillStyle = ink; ICONS.arrow(g, h * 0.26); g.restore();
    maxW = w - h * 1.1;
    tx = style.arrow === 'left' ? x + h * 0.75 + maxW / 2 : x + 12 + maxW / 2;
  }
  // text (fit to width)
  let size = Math.floor(h * 0.42);
  const family = style.font || "'Cinzel Decorative', 'Cinzel', Georgia, 'Times New Roman', serif";
  g.font = `700 ${size}px ${family}`;
  while (g.measureText(text).width > maxW && size > 10) { size--; g.font = `700 ${size}px ${family}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillText(text, tx + 1.5, y + h / 2 + 2.5);
  g.fillStyle = ink; g.fillText(text, tx, y + h / 2 + 1);
  g.restore();
}
