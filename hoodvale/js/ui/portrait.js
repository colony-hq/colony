// Chat-head portraits painted from an actor look ({ body, skin, hair, hairColor, beard, hat, hood,
// top, cape, ... }) for the dialogue box and the character creator. Oracle gets a glowing orb.
// Owner: ui builder.

import { shade, mix } from './icons.js';

const cache = new Map();

function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function fill(g, s) { g.fillStyle = s; g.fill(); }
function stroke(g, s, w = 1.5) { g.strokeStyle = s; g.lineWidth = w; g.stroke(); }
function rg(g, x, y, r0, r1, stops) { const gr = g.createRadialGradient(x, y, r0, x, y, r1); stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c)); return gr; }
function lg(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c)); return gr; }

// Draws on a 128x128 canvas. kind: 'npc' | 'player' | 'oracle' | 'narration'
export function paintPortrait(g, look = {}, kind = 'npc') {
  const S = 128;
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.clip();
  // Backdrop
  g.fillStyle = kind === 'oracle' ? rg(g, 64, 60, 4, 80, ['#3a2a7a', '#1a1040', '#07040f']) : rg(g, 64, 50, 6, 84, ['#7a5a36', '#3a2818', '#160f09']);
  g.fillRect(0, 0, S, S);
  if (kind === 'oracle' || look.body === 'oracle') {
    g.save(); g.shadowColor = '#b18cff'; g.shadowBlur = 24;
    ell(g, 64, 62, 30, 30); fill(g, rg(g, 54, 50, 2, 34, ['#ffffff', '#bfe8ff', '#8e7cff', '#2a1a6a']));
    g.restore();
    for (const [rx, ry, rot, c] of [[46, 14, -0.4, '#8fe3ff'], [46, 14, 0.5, '#c9a24a'], [40, 10, 1.4, '#b18cff']]) { ell(g, 64, 62, rx, ry, rot); stroke(g, c, 2); }
    ell(g, 56, 52, 8, 5, -0.4); fill(g, 'rgba(255,255,255,.7)');
    g.restore();
    return;
  }
  const skin = look.skin || '#e0b48a';
  const hair = look.hairColor || '#4a3020';
  const top = look.top || '#7a5a3a';
  const female = look.body === 'female';
  const old = look.build === 'old';
  const stout = look.build === 'stout';
  // Cape behind shoulders
  if (look.cape) { g.beginPath(); g.moveTo(14, 128); g.quadraticCurveTo(22, 92, 64, 88); g.quadraticCurveTo(106, 92, 114, 128); fill(g, shade(look.cape, -0.25)); }
  // Long hair behind head
  if (['long', 'braid'].includes(look.hair) || (female && look.hair !== 'bald' && look.hair !== 'short' && look.hair !== 'bun')) {
    g.beginPath(); g.moveTo(34, 52); g.quadraticCurveTo(28, 98, 40, 112); g.lineTo(88, 112); g.quadraticCurveTo(100, 98, 94, 52); g.closePath(); fill(g, lg(g, 0, 40, 0, 112, [shade(hair, 0.1), shade(hair, -0.35)]));
  }
  // Shoulders / torso
  const sw = stout ? 56 : female ? 44 : 50;
  g.beginPath(); g.moveTo(64 - sw, 128); g.quadraticCurveTo(64 - sw + 4, 96, 64 - 14, 92); g.lineTo(64 + 14, 92); g.quadraticCurveTo(64 + sw - 4, 96, 64 + sw, 128); g.closePath();
  fill(g, lg(g, 0, 90, 0, 128, [shade(top, 0.2), shade(top, -0.3)]));
  if (look.apron) { g.beginPath(); g.moveTo(48, 128); g.lineTo(50, 100); g.lineTo(78, 100); g.lineTo(80, 128); fill(g, look.apron); }
  if (look.robe) { g.beginPath(); g.moveTo(52, 92); g.lineTo(64, 110); g.lineTo(76, 92); stroke(g, shade(top, -0.45), 3); }
  // Neck
  g.beginPath(); g.moveTo(54, 80); g.lineTo(54, 96); g.quadraticCurveTo(64, 102, 74, 96); g.lineTo(74, 80); fill(g, shade(skin, -0.18));
  // Hood (back part)
  if (look.hood) { g.beginPath(); g.moveTo(30, 98); g.quadraticCurveTo(26, 26, 64, 22); g.quadraticCurveTo(102, 26, 98, 98); g.quadraticCurveTo(64, 108, 30, 98); fill(g, lg(g, 30, 20, 98, 100, [shade(look.hood, 0.15), shade(look.hood, -0.35)])); }
  // Head
  const hw = female ? 21 : stout ? 24 : 22;
  ell(g, 64, 60, hw, 26); fill(g, rg(g, 56, 50, 3, 32, [shade(skin, 0.25), skin, shade(skin, -0.25)]));
  ell(g, 64 - hw + 1, 62, 4, 7); fill(g, shade(skin, -0.12)); ell(g, 64 + hw - 1, 62, 4, 7); fill(g, shade(skin, -0.12));
  // Eyes, brows, nose, mouth
  for (const s of [-1, 1]) {
    ell(g, 64 + s * 8.5, 58, 3.6, 2.4); fill(g, '#f6f0e6');
    ell(g, 64 + s * 8.5, 58.4, 1.9, 2.1); fill(g, '#2a1a10');
    g.beginPath(); g.moveTo(64 + s * 4.5, 52.5); g.quadraticCurveTo(64 + s * 9, 50, 64 + s * 13, 52.5); stroke(g, old ? '#d8d8d8' : shade(hair, -0.2), 2.2);
  }
  g.beginPath(); g.moveTo(63, 61); g.quadraticCurveTo(66, 68, 62, 69); stroke(g, shade(skin, -0.35), 1.4);
  g.beginPath(); g.moveTo(58, 75); g.quadraticCurveTo(64, 78, 70, 75); stroke(g, shade(skin, -0.45), 1.6);
  if (female) { ell(g, 55, 67, 3.5, 2); fill(g, 'rgba(220,90,90,.18)'); ell(g, 73, 67, 3.5, 2); fill(g, 'rgba(220,90,90,.18)'); }
  if (old) { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(64 + s * 12, 62); g.quadraticCurveTo(64 + s * 15, 66, 64 + s * 13, 70); stroke(g, shade(skin, -0.3), 1); } }
  // Beard
  if (look.beard) {
    const len = look.beard === 'long' ? 34 : look.beard === 'full' ? 22 : 12;
    g.beginPath(); g.moveTo(64 - hw + 3, 62); g.quadraticCurveTo(64 - hw + 2, 74 + len * 0.3, 64, 74 + len); g.quadraticCurveTo(64 + hw - 2, 74 + len * 0.3, 64 + hw - 3, 62);
    g.quadraticCurveTo(64 + 10, 70, 64, 72); g.quadraticCurveTo(64 - 10, 70, 64 - hw + 3, 62); fill(g, lg(g, 0, 60, 0, 74 + len, [shade(hair, 0.1), shade(hair, -0.3)]));
    g.beginPath(); g.moveTo(56, 72); g.quadraticCurveTo(64, 69, 72, 72); stroke(g, shade(hair, -0.35), 2.5);
  }
  // Hair on top
  const hs = look.hair || 'short';
  const hairFill = lg(g, 0, 30, 0, 60, [shade(hair, 0.25), hair, shade(hair, -0.25)]);
  if (hs !== 'bald' && !look.hood) {
    g.beginPath();
    if (hs === 'tonsure') { g.moveTo(64 - hw - 1, 64); g.quadraticCurveTo(64 - hw - 2, 44, 64 - hw + 6, 40); g.lineTo(64 - hw + 10, 50); g.quadraticCurveTo(64 - hw + 4, 56, 64 - hw + 2, 66); g.moveTo(64 + hw + 1, 64); g.quadraticCurveTo(64 + hw + 2, 44, 64 + hw - 6, 40); g.lineTo(64 + hw - 10, 50); g.quadraticCurveTo(64 + hw - 4, 56, 64 + hw - 2, 66); }
    else if (hs === 'slick') { g.moveTo(64 - hw - 1, 58); g.quadraticCurveTo(64 - hw, 30, 64, 32); g.quadraticCurveTo(64 + hw, 30, 64 + hw + 1, 58); g.quadraticCurveTo(64 + hw - 4, 44, 64 + 4, 42); g.quadraticCurveTo(64 - 6, 44, 64 - hw + 3, 54); }
    else { g.moveTo(64 - hw - 2, 64); g.quadraticCurveTo(64 - hw - 4, 30, 64, 30); g.quadraticCurveTo(64 + hw + 4, 30, 64 + hw + 2, 64); g.quadraticCurveTo(64 + hw - 2, 46, 64 + 10, 44); g.quadraticCurveTo(64 + 2, 50, 64 - 6, 44); g.quadraticCurveTo(64 - hw + 2, 46, 64 - hw - 2, 64); }
    fill(g, hairFill);
    if (hs === 'bun') { ell(g, 64, 28, 10, 8); fill(g, hairFill); }
    if (hs === 'braid') { for (let i = 0; i < 4; i++) { ell(g, 64 + hw + 2, 74 + i * 9, 5, 6); fill(g, hairFill); stroke(g, shade(hair, -0.4), 0.8); } }
  }
  // Hood front rim
  if (look.hood) { g.beginPath(); g.moveTo(36, 96); g.quadraticCurveTo(34, 34, 64, 30); g.quadraticCurveTo(94, 34, 92, 96); stroke(g, shade(look.hood, -0.45), 5); }
  // Hats
  const hat = look.hat;
  if (hat) {
    const hc = { cap: '#3a3a5a', wide: '#6a5a3a', straw: '#e2c070', tricorn: '#2a2a2a', beanie: '#7a2a2a', 'feathered-hat': '#5a1a2a', 'helmet-lamp': '#8a8f95', witch: '#2a2a3a' }[hat] || '#4a3a2a';
    g.beginPath();
    if (hat === 'witch') { g.moveTo(26, 42); g.quadraticCurveTo(64, 30, 102, 42); g.lineTo(96, 46); g.lineTo(32, 46); g.closePath(); fill(g, shade(hc, 0.1)); g.beginPath(); g.moveTo(44, 40); g.lineTo(72, 2); g.lineTo(84, 40); fill(g, hc); }
    else if (hat === 'wide' || hat === 'straw') { ell(g, 64, 40, 44, 9); fill(g, shade(hc, -0.1)); g.beginPath(); g.ellipse(64, 36, 24, 16, 0, Math.PI, 0); fill(g, hc); }
    else if (hat === 'tricorn') { g.moveTo(24, 42); g.quadraticCurveTo(64, 14, 104, 42); g.quadraticCurveTo(64, 32, 24, 42); fill(g, hc); }
    else if (hat === 'feathered-hat') { ell(g, 64, 38, 36, 8); fill(g, shade(hc, -0.1)); g.beginPath(); g.ellipse(64, 34, 22, 14, 0, Math.PI, 0); fill(g, hc); g.beginPath(); g.moveTo(80, 30); g.quadraticCurveTo(104, 4, 112, 10); g.quadraticCurveTo(98, 18, 84, 32); fill(g, '#e8e0c8'); }
    else if (hat === 'helmet-lamp') { g.ellipse(64, 40, 26, 16, 0, Math.PI, 0); fill(g, lg(g, 0, 24, 0, 40, [shade(hc, 0.4), hc])); ell(g, 64, 30, 6, 5); fill(g, '#ffe08a'); }
    else { g.ellipse(64, 40, 24, 15, 0, Math.PI, 0); fill(g, hc); if (hat === 'cap') { ell(g, 76, 41, 16, 4); fill(g, shade(hc, -0.2)); } }
  }
  g.restore();
}

// Returns a data URL (cached per look).
export function portraitURL(look, kind = 'npc') {
  const key = kind + ':' + JSON.stringify(look || {});
  let url = cache.get(key);
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  try { paintPortrait(c.getContext('2d'), look || {}, kind); } catch (err) { console.warn('[ui] portrait', err); }
  url = c.toDataURL();
  if (cache.size > 80) cache.clear();
  cache.set(key, url);
  return url;
}

export { mix };
