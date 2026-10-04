// Small shared helpers for the UI modules. Owner: ui builder.

import { ITEMS, formatCredit } from '../data/items.js';
import { SKILL_BY_ID } from '../data/skills.js';

export { formatCredit };

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmtInt = (n) => Math.floor(n || 0).toLocaleString('en-US');

// RuneScape-style stack text: yellow under 100k, white "K" under 10M, green "M" above.
export function qtyLabel(q) {
  if (q < 100000) return { text: String(q), cls: '' };
  if (q < 10000000) return { text: Math.floor(q / 1000) + 'K', cls: 'k' };
  return { text: Math.floor(q / 1000000) + 'M', cls: 'm' };
}

export const itemDef = (id) => ITEMS[id] || null;
export const itemName = (id) => ITEMS[id]?.name || id;
export const skillName = (id) => SKILL_BY_ID[id]?.name || (id ? id[0].toUpperCase() + id.slice(1) : '');
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Monster level colour relative to the player's combat level (RS convention).
export function levelColor(their, mine) {
  const d = (their || 0) - (mine || 0);
  if (d >= 10) return '#ff3030';
  if (d >= 7) return '#ff6020';
  if (d >= 4) return '#ff9020';
  if (d >= 1) return '#ffc020';
  if (d === 0) return '#ffff40';
  if (d >= -3) return '#d0ff30';
  if (d >= -6) return '#a0ff30';
  if (d >= -9) return '#70ff30';
  return '#30ff30';
}

// Colour class per entity kind for names in hover text and menus.
export function nameColor(entity, ctx) {
  switch (entity?.kind) {
    case 'npc': return 'var(--yellow)';
    case 'monster': return 'var(--yellow)';
    case 'item': return '#ff9f43';
    case 'object': return 'var(--cyan)';
    case 'remote': case 'player': return '#ffffff';
    default: return '#ffffff';
  }
}

// "Name (level-12)" parts for a menu/hover line.
export function entityLabelHTML(entity, ctx) {
  const name = esc(entity.kind === 'item' && entity.qty > 1 ? `${entity.name} (${entity.qty})` : entity.name || '');
  let html = `<span style="color:${nameColor(entity, ctx)}">${name}</span>`;
  const lvl = entity.level ?? (entity.kind === 'remote' ? entity.combatLevel : null);
  if (lvl && (entity.kind === 'monster' || entity.kind === 'remote')) {
    const mine = safe(() => ctx.skills.combatLevel(), 3);
    html += ` <span style="color:${levelColor(lvl, mine)}">(level-${lvl})</span>`;
  }
  return html;
}

export function safe(fn, fallback) {
  try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; }
}

// Project a world point to CSS pixels on the full-screen canvas. Returns null when behind.
export function projector(ctx) {
  const v = new ctx.THREE.Vector3();
  return (x, y, z) => {
    v.set(x, y, z).project(ctx.camera);
    if (v.z > 1 || v.z < -1) return null;
    const w = window.innerWidth, h = window.innerHeight;
    return { x: (v.x + 1) * 0.5 * w, y: (1 - v.y) * 0.5 * h, z: v.z };
  };
}

// Entity head height in metres (actor headHeight > pick cylinder > default).
export function headHeight(e) {
  return e?.view?.headHeight || e?.actor?.headHeight || (e?.pick?.h ? e.pick.h * 0.95 : 1.8);
}

export function timeAgo(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export function fmtDuration(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// Long-press helper for DOM elements (touch): calls fn(event) after `ms` without movement.
export function onLongPress(el, fn, ms = 450) {
  let timer = null, sx = 0, sy = 0, fired = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    fired = false; sx = e.clientX; sy = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => { fired = true; fn(e); }, ms);
  });
  const cancel = (e) => { if (e && e.type === 'pointermove' && Math.hypot(e.clientX - sx, e.clientY - sy) < 10) return; clearTimeout(timer); };
  el.addEventListener('pointermove', cancel);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('click', (e) => { if (fired) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; } }, true);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
