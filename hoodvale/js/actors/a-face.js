// Painted faces: one premultiplied RGBA atlas (2048 x 2048, 100 cells of 204 px) shared by every
// humanoid. A cell is painted on demand per face recipe (eyes, iris colour, brows, mouth,
// expression, age lines, blush, stubble, freckles) and mapped onto the front of the head with a
// planar projection (see FACE). Cell 0 stays transparent: geometry without a decal samples it.
// Owner: actors builder.

import * as THREE from 'three';

const AW = 2048, AH = 2048, CELL = 204, COLS = 10, ROWS = 10;
// Face rectangle in head-radius units (head-local, y up, +x = the character's right).
export const FACE = { x0: -0.8, x1: 0.8, y0: -0.95, y1: 0.65 };

let canvas = null, big = null, g = null, tex = null;
let cellCanvas = null, cellTex = null, uploaded = false, renderer = null;
const slots = new Map(); // recipe key -> cell index
let next = 1;

function ensure() {
  if (tex) return;
  canvas = document.createElement('canvas');
  canvas.width = AW; canvas.height = AH;
  big = canvas.getContext('2d');
  big.clearRect(0, 0, AW, AH);
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true;
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.onUpdate = () => { uploaded = true; };
  cellCanvas = document.createElement('canvas');
  cellCanvas.width = cellCanvas.height = CELL;
  g = cellCanvas.getContext('2d');
  cellTex = new THREE.CanvasTexture(cellCanvas);
}
export function faceTexture() { ensure(); return tex; }
// With a renderer, cells painted after the first upload go up alone (texSubImage2D + mipmaps)
// instead of re-uploading the whole 16 MB atlas.
export function setFaceRenderer(r) { renderer = r; }
function commit(idx) {
  const col = idx % COLS, row = Math.floor(idx / COLS);
  big.clearRect(col * CELL, row * CELL, CELL, CELL);
  big.drawImage(cellCanvas, col * CELL, row * CELL);
  if (uploaded && renderer?.copyTextureToTexture) {
    try {
      renderer.copyTextureToTexture(cellTex, tex, null, new THREE.Vector2(col * CELL, AH - (row + 1) * CELL));
      return;
    } catch (err) { console.warn('[actors] face cell upload', err); }
  }
  tex.needsUpdate = true;
}

// UV of a head-local point (in head-radius units) inside cell `idx`, clamped to the cell.
export function faceUV(idx, x, y) {
  const fx = Math.min(0.995, Math.max(0.005, (x - FACE.x0) / (FACE.x1 - FACE.x0)));
  const fy = Math.min(0.995, Math.max(0.005, (FACE.y1 - y) / (FACE.y1 - FACE.y0)));
  const col = idx % COLS, row = Math.floor(idx / COLS);
  return [(col * CELL + fx * CELL) / AW, 1 - (row * CELL + fy * CELL) / AH];
}

// recipe: { female, old, iris, brow, lip, skin, expr, blush, stubble, freckles, lashes, scar, tired }
export function faceCell(recipe) {
  ensure();
  const key = JSON.stringify(recipe);
  if (slots.has(key)) return slots.get(key);
  let idx;
  if (next < COLS * ROWS) idx = next++;
  else {
    // Atlas full: reuse the cell of the most similar recipe (same style first, then sex / age /
    // expression).
    let best = 1, bestScore = -1;
    for (const [k, i] of slots) {
      const r = JSON.parse(k);
      const sc = (r.style === recipe.style) * 20 + (r.female === recipe.female) * 4 + (r.old === recipe.old) * 2 + (r.expr === recipe.expr) + (r.brow === recipe.brow) * 0.5;
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    slots.set(key, best);
    return best;
  }
  paint(idx, recipe);
  commit(idx);
  slots.set(key, idx);
  return idx;
}

// ---------------------------------------------------------------------------------------------
// Painting (canvas transform maps head-radius units to the cell, y up)
// ---------------------------------------------------------------------------------------------
const rgba = (hex, a) => {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
};
const shadeHex = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const mixHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
function lum(hex) { const c = new THREE.Color(hex); return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }

function paint(idx, r) {
  const sx = CELL / (FACE.x1 - FACE.x0), sy = CELL / (FACE.y1 - FACE.y0);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, CELL, CELL);
  g.beginPath(); g.rect(2, 2, CELL - 4, CELL - 4); g.clip();
  g.setTransform(sx, 0, 0, -sy, -FACE.x0 * sx, FACE.y1 * sy);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const dark = lum(r.skin || '#e0b48a') < 0.32;
  // Shading colours relative to the skin (so dark and light skin both read).
  const shadow = mixHex(r.skin || '#e0b48a', '#3a1a12', 0.55);
  const ink = dark ? '#140a08' : '#2a1610';

  if (r.style === 'goblin' || r.style === 'troll') { paintBrute(r, ink, shadow); g.restore(); return; }
  if (r.blush) for (const s of [-1, 1]) radial(s * 0.43, -0.3, 0.17, dark ? 'rgba(170,60,60,0.16)' : 'rgba(225,95,95,0.2)');
  if (r.freckles) {
    g.fillStyle = rgba(shadeHex(r.skin || '#e0b48a', 0.62), 0.5);
    const pts = [[-0.32, -0.2], [-0.24, -0.26], [-0.4, -0.27], [-0.16, -0.2], [0.32, -0.2], [0.24, -0.26], [0.4, -0.27], [0.16, -0.2], [-0.06, -0.15], [0.07, -0.16], [-0.3, -0.33], [0.3, -0.33]];
    for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 0.012, 0, Math.PI * 2); g.fill(); }
  }
  if (r.stubble) stubble(r.brow || '#3a2a1a');
  // Age and expression lines.
  if (r.old) {
    g.strokeStyle = rgba(shadow, 0.35); g.lineWidth = 0.014;
    for (const y of [0.4, 0.47]) curve([-0.3, y], [0, y + 0.03], [0.3, y]);
    for (const s of [-1, 1]) {
      curve([s * 0.13, -0.3], [s * 0.24, -0.4], [s * 0.21, -0.55]); // nasolabial folds
      for (let i = 0; i < 3; i++) curve([s * 0.5, 0.02 - i * 0.03], [s * 0.55, 0.0 - i * 0.04], [s * 0.6, -0.02 - i * 0.06]); // crow's feet
      curve([s * 0.22, -0.13], [s * 0.33, -0.17], [s * 0.45, -0.12]); // bags
    }
  } else if (!r.female) {
    g.strokeStyle = rgba(shadow, 0.16); g.lineWidth = 0.016;
    for (const s of [-1, 1]) curve([s * 0.12, -0.32], [s * 0.2, -0.4], [s * 0.2, -0.52]);
  }
  if (r.tired) { g.strokeStyle = rgba(shadow, 0.3); g.lineWidth = 0.02; for (const s of [-1, 1]) curve([s * 0.2, -0.12], [s * 0.33, -0.18], [s * 0.47, -0.11]); }
  if (r.scar) { g.strokeStyle = rgba('#7a3a30', 0.6); g.lineWidth = 0.022; line([0.3, 0.2], [0.42, -0.18]); g.strokeStyle = rgba('#f0c8b0', 0.35); g.lineWidth = 0.008; line([0.3, 0.2], [0.42, -0.18]); }

  // Nose: shadow under the tip, side shading and nostrils (the nose itself is subtle geometry).
  radial(0, -0.33, 0.09, rgba(shadow, 0.3));
  g.strokeStyle = rgba(shadow, 0.18); g.lineWidth = 0.03;
  curve([-0.07, -0.05], [-0.085, -0.18], [-0.075, -0.27]);
  g.fillStyle = rgba(ink, 0.55);
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 0.038, -0.325, 0.017, 0.011, s * 0.4, 0, Math.PI * 2); g.fill(); }

  // Eyes and brows.
  for (const s of [-1, 1]) eye(s, r, ink, shadow);
  for (const s of [-1, 1]) brow(s, r);
  mouth(r, ink, shadow);
  g.restore();
}

function curve(a, c, b) { g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(c[0], c[1], b[0], b[1]); g.stroke(); }
function line(a, b) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
function radial(x, y, rad, color) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rad);
  gr.addColorStop(0, color); gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
}
function stubble(c) {
  // Short dabs over the jaw, chin and upper lip.
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = rgba(c, 0.32);
  for (let i = 0; i < 900; i++) {
    const x = (rnd() * 2 - 1) * 0.72, y = -0.25 - rnd() * 0.7;
    const inJaw = (x * x) / 0.5 + ((y + 0.62) * (y + 0.62)) / 0.16 < 1 && y < -0.38 + Math.abs(x) * 0.25;
    const lip = Math.abs(x) < 0.2 && y > -0.48 && y < -0.38;
    const mouthGap = Math.abs(x) < 0.15 && y > -0.56 && y < -0.48;
    if ((inJaw || lip) && !mouthGap) g.fillRect(x, y, 0.009, 0.009);
  }
}

function eye(s, r, ink, shadow) {
  const f = r.female;
  const ex = s * 0.32, ey = 0.0;
  const ew = f ? 0.135 : 0.128, eh = f ? 0.088 : 0.074;
  const ix = ex - s * ew, ox = ex + s * ew; // inner / outer corners
  const tilt = r.expr === 'sly' ? 0.012 : 0;
  // Almond: upper lid arcs high toward the inner side, lower lid flatter.
  const almond = () => {
    g.beginPath();
    g.moveTo(ix, ey - 0.004);
    g.bezierCurveTo(ex - s * ew * 0.45, ey + eh * 1.3, ex + s * ew * 0.45, ey + eh * 1.2 + tilt, ox, ey + 0.012);
    g.bezierCurveTo(ex + s * ew * 0.5, ey - eh * 0.85, ex - s * ew * 0.45, ey - eh * 0.85, ix, ey - 0.004);
    g.closePath();
  };
  // Socket shading.
  radial(ex, ey + 0.02, 0.2, rgba(shadow, 0.16));
  almond();
  g.fillStyle = '#f1ece3';
  g.fill();
  g.save();
  almond(); g.clip();
  const ir = eh * 0.98, icx = ex + s * 0.006, icy = ey - 0.006;
  const iris = r.iris || '#5a3a22';
  const ig = g.createRadialGradient(icx - 0.01, icy + 0.012, ir * 0.15, icx, icy, ir);
  ig.addColorStop(0, mixHex(iris, '#ffffff', 0.35));
  ig.addColorStop(0.55, iris);
  ig.addColorStop(1, shadeHex(iris, 0.45));
  g.fillStyle = ig; g.beginPath(); g.arc(icx, icy, ir, 0, Math.PI * 2); g.fill();
  g.strokeStyle = rgba(shadeHex(iris, 0.3), 0.9); g.lineWidth = 0.01; g.stroke();
  g.fillStyle = '#0b0705'; g.beginPath(); g.arc(icx, icy, ir * 0.44, 0, Math.PI * 2); g.fill();
  // Lid shadow over the top of the eye.
  const lg = g.createLinearGradient(0, ey + eh, 0, ey + eh * 0.1);
  lg.addColorStop(0, 'rgba(40,20,14,0.55)'); lg.addColorStop(1, 'rgba(40,20,14,0)');
  g.fillStyle = lg; g.fillRect(ex - 0.2, ey - 0.1, 0.4, 0.3);
  // Catchlights (same side on both eyes: one light).
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(icx + 0.022, icy + 0.022, ir * 0.24, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(icx - 0.018, icy - 0.02, ir * 0.11, 0, Math.PI * 2); g.fill();
  if (r.old) { // heavier upper lid
    g.fillStyle = rgba(r.skin || '#e0b48a', 0.9);
    g.beginPath(); g.moveTo(ix - s * 0.02, ey + eh * 1.6); g.lineTo(ox + s * 0.02, ey + eh * 1.6); g.lineTo(ox + s * 0.02, ey + eh * 0.55); g.quadraticCurveTo(ex, ey + eh * 0.75, ix - s * 0.02, ey + eh * 0.45); g.closePath(); g.fill();
  }
  g.restore();
  // Upper lid line, heavier at the outer corner.
  g.strokeStyle = ink;
  g.lineWidth = f ? 0.03 : 0.026;
  g.beginPath(); g.moveTo(ix, ey - 0.004);
  g.bezierCurveTo(ex - s * ew * 0.45, ey + eh * 1.3, ex + s * ew * 0.45, ey + eh * 1.2 + tilt, ox, ey + 0.012);
  g.stroke();
  g.lineWidth = f ? 0.038 : 0.03;
  g.beginPath(); g.moveTo(ex + s * ew * 0.25, ey + eh * 1.12 + tilt); g.quadraticCurveTo(ex + s * ew * 0.8, ey + eh * 0.95, ox + s * 0.012, ey + 0.012); g.stroke();
  if (f || r.lashes) {
    g.lineWidth = 0.014;
    for (let i = 0; i < 3; i++) {
      const t = 0.55 + i * 0.2;
      const bx = ex + s * ew * t, by = ey + eh * (1.05 - i * 0.28);
      line([bx, by], [bx + s * 0.035, by + 0.03 - i * 0.006]);
    }
  }
  // Lower lid and crease.
  g.strokeStyle = rgba(ink, 0.4); g.lineWidth = 0.012;
  g.beginPath(); g.moveTo(ox, ey + 0.008); g.bezierCurveTo(ex + s * ew * 0.5, ey - eh * 0.85, ex - s * ew * 0.2, ey - eh * 0.9, ex - s * ew * 0.6, ey - eh * 0.55); g.stroke();
  g.strokeStyle = rgba(shadow, 0.35); g.lineWidth = 0.013;
  g.beginPath(); g.moveTo(ix + s * 0.015, ey + eh * 1.35); g.quadraticCurveTo(ex, ey + eh * 2.0, ox + s * 0.005, ey + eh * 1.2); g.stroke();
}

function brow(s, r) {
  const f = r.female;
  const c = r.brow || '#3a2a1a';
  let inY = 0.19, peakY = 0.24, outY = 0.2;
  if (r.expr === 'stern' || r.expr === 'grumpy') { inY = 0.135; peakY = 0.215; outY = 0.215; }
  if (r.expr === 'kind' || r.expr === 'worried') { inY = 0.22; peakY = 0.235; outY = 0.17; }
  if (r.expr === 'sly' && s > 0) { inY += 0.035; peakY += 0.05; outY += 0.03; }
  if (r.expr === 'smile') { peakY += 0.01; }
  const t0 = f ? 0.032 : 0.05, t1 = f ? 0.012 : 0.02;
  const ix = s * 0.17, px = s * 0.33, ox = s * 0.47;
  g.fillStyle = rgba(c, 0.92);
  g.beginPath();
  g.moveTo(ix, inY + t0 / 2);
  g.quadraticCurveTo(px, peakY + t0 * 0.7, ox, outY + t1 / 2);
  g.lineTo(ox + s * 0.01, outY - t1 / 2);
  g.quadraticCurveTo(px, peakY - t0 * 0.45, ix, inY - t0 / 2);
  g.closePath(); g.fill();
}

function mouth(r, ink, shadow) {
  const f = r.female;
  const y = -0.53, w = f ? 0.135 : 0.15;
  const smile = r.expr === 'smile' || r.expr === 'kind' ? 0.032 : r.expr === 'sly' ? 0.012 : r.expr === 'stern' || r.expr === 'grumpy' ? -0.022 : 0.008;
  const lip = r.lip || (f ? '#b0505a' : mixHex(r.skin || '#e0b48a', '#7a3a30', 0.4));
  // Lower lip volume and chin shadow.
  radial(0, y - 0.06, 0.1, rgba(lip, f ? 0.5 : 0.3));
  radial(0, y - 0.15, 0.08, rgba(shadow, 0.18));
  if (f) {
    g.fillStyle = rgba(lip, 0.8);
    g.beginPath();
    g.moveTo(-w, y + smile * 0.6);
    g.bezierCurveTo(-w * 0.5, y + 0.045, -w * 0.15, y + 0.05, 0, y + 0.03);
    g.bezierCurveTo(w * 0.15, y + 0.05, w * 0.5, y + 0.045, w, y + smile * 0.6);
    g.bezierCurveTo(w * 0.5, y - 0.07, -w * 0.5, y - 0.07, -w, y + smile * 0.6);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.ellipse(0.02, y - 0.035, 0.04, 0.012, 0, 0, Math.PI * 2); g.fill();
  }
  // Mouth line with corners.
  g.strokeStyle = rgba(ink, 0.85); g.lineWidth = f ? 0.018 : 0.022;
  g.beginPath(); g.moveTo(-w, y + smile); g.quadraticCurveTo(0, y - smile * 0.8, w, y + smile); g.stroke();
  g.strokeStyle = rgba(ink, 0.45); g.lineWidth = 0.014;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * w, y + smile); g.lineTo(s * (w + 0.02), y + smile + (smile > 0.01 ? 0.012 : -0.006)); g.stroke(); }
  // Philtrum.
  g.strokeStyle = rgba(shadow, 0.22); g.lineWidth = 0.012;
  for (const s of [-1, 1]) line([s * 0.025, -0.38], [s * 0.03, y + 0.05]);
}

// Debug / QA: the atlas canvas (null until the first face is painted).
export function faceCanvas() { return canvas; }

// Goblins: big round yellow eyes with slit pupils, angry brows, a wide toothy grin.
// Trolls: small deep-set eyes under a heavy brow, a broad frowning mouth (tusks are geometry).
function paintBrute(r, ink, shadow) {
  const gob = r.style === 'goblin';
  const brow = r.brow || '#2a3a14';
  for (const s of [-1, 1]) {
    const ex = s * (gob ? 0.33 : 0.3), ey = gob ? 0.02 : -0.02;
    const er = gob ? 0.13 : 0.07;
    radial(ex, ey + 0.02, er * 2.2, rgba(shadow, gob ? 0.3 : 0.5));
    g.fillStyle = gob ? '#f2e27a' : '#f0b060';
    g.beginPath(); g.ellipse(ex, ey, er * (gob ? 1.08 : 1.2), er * (gob ? 0.92 : 0.7), s * (gob ? -0.25 : 0), 0, Math.PI * 2); g.fill();
    g.strokeStyle = rgba('#7a2a10', 0.6); g.lineWidth = 0.012; g.stroke();
    g.fillStyle = '#120a04';
    g.beginPath(); g.ellipse(ex + s * 0.01, ey - 0.004, er * (gob ? 0.2 : 0.35), er * (gob ? 0.78 : 0.55), 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(ex + 0.025, ey + 0.03, er * 0.2, 0, Math.PI * 2); g.fill();
    // Lid line and brow (angled down toward the nose = angry).
    g.strokeStyle = ink; g.lineWidth = gob ? 0.028 : 0.03;
    g.beginPath(); g.ellipse(ex, ey, er * (gob ? 1.08 : 1.2), er * (gob ? 0.92 : 0.7), s * (gob ? -0.25 : 0), Math.PI * 1.05, Math.PI * 1.95, false); g.stroke();
    g.fillStyle = rgba(brow, 0.95);
    g.beginPath();
    g.moveTo(s * 0.1, ey + (gob ? 0.1 : 0.06)); g.lineTo(s * 0.52, ey + (gob ? 0.26 : 0.16));
    g.lineTo(s * 0.5, ey + (gob ? 0.32 : 0.24)); g.lineTo(s * 0.12, ey + (gob ? 0.17 : 0.14)); g.closePath(); g.fill();
  }
  // Nostrils (the nose is geometry) and warts.
  g.fillStyle = rgba(ink, 0.5);
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 0.05, -0.3, 0.02, 0.013, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = rgba(shadow, 0.45);
  for (const [x, y, rr] of [[0.42, -0.25, 0.025], [-0.36, -0.4, 0.018], [0.2, 0.32, 0.016]]) { g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); }
  if (gob) {
    // Wide grin with a row of uneven teeth.
    const y = -0.5;
    g.fillStyle = '#3a0e0a';
    g.beginPath(); g.moveTo(-0.36, y + 0.06); g.quadraticCurveTo(0, y - 0.24, 0.36, y + 0.06); g.quadraticCurveTo(0, y - 0.06, -0.36, y + 0.06); g.fill();
    g.fillStyle = '#f2ead2';
    for (let i = -3; i <= 3; i++) {
      const x = i * 0.085, top = y + 0.04 - Math.abs(i) * 0.012 - 0.06 * (1 - Math.abs(i) / 3);
      g.beginPath(); g.moveTo(x - 0.03, top + 0.01); g.lineTo(x + 0.03, top + 0.01); g.lineTo(x, top - (i % 2 ? 0.05 : 0.07)); g.closePath(); g.fill();
    }
    g.strokeStyle = ink; g.lineWidth = 0.02;
    g.beginPath(); g.moveTo(-0.36, y + 0.06); g.quadraticCurveTo(0, y - 0.24, 0.36, y + 0.06); g.stroke();
  } else {
    const y = -0.56;
    g.strokeStyle = rgba(ink, 0.85); g.lineWidth = 0.035;
    g.beginPath(); g.moveTo(-0.3, y - 0.04); g.quadraticCurveTo(0, y + 0.05, 0.3, y - 0.04); g.stroke();
    radial(0, y - 0.1, 0.16, rgba(shadow, 0.3));
  }
}
