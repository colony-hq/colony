// Compass strip (top centre) with cardinal letters (Utara/Timur/Selatan/Barat), ticks, quest
// markers and the active objective marker + distance. Owner: ui-audio.

import { h } from '../core/dom.js';

const FOV = 150; // degrees visible across the strip
const HALF = FOV / 2;
const CARDINALS = {
  0: { t: 'U', cls: '.major.north', name: 'Utara' },
  45: { t: 'TL', cls: '', name: 'Timur Laut' },
  90: { t: 'T', cls: '.major', name: 'Timur' },
  135: { t: 'TG', cls: '', name: 'Tenggara' },
  180: { t: 'S', cls: '.major', name: 'Selatan' },
  225: { t: 'BD', cls: '', name: 'Barat Daya' },
  270: { t: 'B', cls: '.major', name: 'Barat' },
  315: { t: 'BL', cls: '', name: 'Barat Laut' },
};

const FLAME_COLORS = { tirta: '#bff6ff', bumi: '#ffb04a', samudra: '#8fa2ff' };

function wrap180(a) {
  a %= 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

function markerColor(m) {
  const id = String(m.id || '') + ' ' + String(m.kind || '');
  if (m.color) return m.color;
  for (const k of Object.keys(FLAME_COLORS)) if (id.includes(k)) return FLAME_COLORS[k];
  if (/camp|unggun|checkpoint/.test(id)) return '#ffb547';
  if (/mercusuar|lighthouse|beacon/.test(id)) return '#efe6d2';
  if (/npc|warga/.test(id)) return '#e9c46a';
  return '#a7aec4';
}

// Normalises ctx.quest.markers (array, Map or object) into [{id,x,z,label,color}].
function readMarkers(src, out) {
  out.length = 0;
  if (!src) return out;
  const push = (m, key) => {
    if (!m || typeof m !== 'object') return;
    if (m.visible === false || m.known === false || m.hidden) return;
    const x = m.x ?? m.position?.x, z = m.z ?? m.position?.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    out.push({ id: String(m.id ?? key ?? out.length), x, z, label: m.label || m.name || '', color: markerColor({ ...m, id: m.id ?? key }) });
  };
  if (Array.isArray(src)) src.forEach((m, i) => push(m, i));
  else if (src instanceof Map) src.forEach((m, k) => push(m, k));
  else if (typeof src === 'object') for (const k of Object.keys(src)) push(src[k], k);
  return out;
}

export function createCompass(ctx) {
  const strip = h('div.lh-cmp-strip');
  const root = h('div.lh-cmp', { 'aria-hidden': 'true' }, [
    h('div.lh-cmp-plate'),
    h('div.lh-cmp-rule'),
    strip,
    h('div.lh-cmp-caret'),
  ]);

  const items = [];
  for (let a = 0; a < 360; a += 15) {
    const c = CARDINALS[a];
    const el = c ? h('span.lh-cmp-l' + c.cls, { title: c.name }, c.t) : h('span.lh-cmp-t' + (a % 45 === 0 ? '.mid' : ''));
    strip.appendChild(el);
    items.push({ el, a, vis: true, x: NaN });
  }

  const pool = new Map(); // marker id -> {el, label, vis, x}
  const objEl = h('span.lh-cmp-m.obj', {}, [h('i'), h('em.l', {}, '‹'), h('em.r', {}, '›')]);
  strip.appendChild(objEl);
  let objVis = false;

  let width = 0;
  const measure = () => { width = strip.clientWidth || 0; };
  ctx.engine.onResize?.(measure);

  let lastHeading = NaN;
  const markers = [];
  let objective = null; // {x,z}
  let distText = '';
  let distance = null;

  function place(el, x) {
    el.style.transform = `translate(${x.toFixed(1)}px,-50%) translateX(-50%)`;
  }
  function show(rec, on) {
    if (rec.vis === on) return;
    rec.vis = on;
    rec.el.style.visibility = on ? '' : 'hidden';
  }

  function heading() {
    const e = ctx.camera.matrixWorld.elements;
    const fx = -e[8], fz = -e[10];
    if (Math.abs(fx) + Math.abs(fz) < 1e-5) return lastHeading || 0;
    return (Math.atan2(fx, -fz) * 180) / Math.PI;
  }

  return {
    root,
    get distanceText() { return distText; },
    get distance() { return distance; },
    setObjective(target) {
      objective = target && Number.isFinite(target.x) && Number.isFinite(target.z) ? { x: target.x, z: target.z } : null;
    },
    update() {
      if (!width) measure();
      if (!width) return;
      const ppd = width / FOV;
      const hd = heading();
      if (Math.abs(wrap180(hd - lastHeading)) > 0.04 || Number.isNaN(lastHeading)) {
        lastHeading = hd;
        for (const it of items) {
          const rel = wrap180(it.a - hd);
          const on = Math.abs(rel) <= HALF + 4;
          show(it, on);
          if (on) place(it.el, rel * ppd);
        }
      }

      const p = ctx.player?.position || ctx.camera.position;
      // Quest markers.
      readMarkers(ctx.quest?.markers, markers);
      const seen = new Set();
      for (const m of markers) {
        if (objective && Math.hypot(m.x - objective.x, m.z - objective.z) < 4) continue; // drawn as objective
        seen.add(m.id);
        let rec = pool.get(m.id);
        if (!rec) {
          const el = h('span.lh-cmp-m', {}, [h('i'), h('b', {}, m.label)]);
          strip.appendChild(el);
          rec = { el, vis: true, color: '' };
          pool.set(m.id, rec);
        }
        if (rec.color !== m.color) { rec.color = m.color; rec.el.style.setProperty('--mc', m.color); }
        const rel = wrap180((Math.atan2(m.x - p.x, -(m.z - p.z)) * 180) / Math.PI - hd);
        const on = Math.abs(rel) <= HALF;
        show(rec, on);
        if (on) {
          place(rec.el, rel * ppd);
          rec.el.classList.toggle('near', Math.abs(rel) < 9 && !!m.label);
        }
      }
      for (const [id, rec] of pool) if (!seen.has(id)) { rec.el.remove(); pool.delete(id); }

      // Objective marker (clamped to the edges so it is never lost).
      if (objective) {
        const dx = objective.x - p.x, dz = objective.z - p.z;
        const d = Math.hypot(dx, dz);
        let rel = wrap180((Math.atan2(dx, -dz) * 180) / Math.PI - hd);
        const lim = HALF - 6;
        const edge = Math.abs(rel) > lim ? Math.sign(rel) : 0;
        if (edge) rel = edge * lim;
        if (!objVis) { objVis = true; objEl.style.visibility = ''; }
        place(objEl, rel * ppd);
        objEl.classList.toggle('edge-l', edge < 0);
        objEl.classList.toggle('edge-r', edge > 0);
        distance = d;
        distText = d < 6 ? '' : d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
      } else {
        distance = null;
        distText = '';
        if (objVis) { objVis = false; objEl.style.visibility = 'hidden'; }
      }
    },
  };
}

export const COMPASS_CSS = `
.lh-cmp {
  position: absolute; left: 50%; top: calc(env(safe-area-inset-top, 0px) + 12px);
  width: clamp(240px, 34vw, 460px); height: 34px; transform: translateX(-50%);
}
.lh-cmp-plate {
  position: absolute; inset: -8px -40px -6px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(8, 11, 22, 0.5), rgba(8, 11, 22, 0.28) 55%, rgba(8, 11, 22, 0) 100%);
}
.lh-cmp-rule {
  position: absolute; left: 0; right: 0; bottom: 3px; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(239, 230, 210, 0.32) 25%, rgba(239, 230, 210, 0.32) 75%, transparent);
}
.lh-cmp-strip {
  position: absolute; inset: 0; overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 18%, #000 82%, transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 18%, #000 82%, transparent 100%);
}
.lh-cmp-strip > * { position: absolute; left: 50%; top: 50%; will-change: transform; }
.lh-cmp-t { width: 1px; height: 6px; margin-top: 9px; background: rgba(239, 230, 210, 0.42); }
.lh-cmp-t.mid { height: 9px; margin-top: 7px; }
.lh-cmp-l {
  font: 600 11px/1 var(--font-body); letter-spacing: 0.06em; color: rgba(239, 230, 210, 0.62);
  text-shadow: 0 1px 2px rgba(5, 8, 16, 0.8), 0 0 10px rgba(5, 8, 16, 0.6); margin-top: -3px;
}
.lh-cmp-l.major { font: 400 17px/1 var(--font-display); color: var(--paper); margin-top: -4px; letter-spacing: 0; }
.lh-cmp-l.north { color: var(--lentera); text-shadow: 0 0 10px rgba(255, 181, 71, 0.45), 0 1px 2px rgba(5, 8, 16, 0.8); }
.lh-cmp-caret {
  position: absolute; left: 50%; top: -5px; width: 0; height: 0; transform: translateX(-50%);
  border: 4px solid transparent; border-top: 5px solid var(--lentera);
  filter: drop-shadow(0 0 4px rgba(255, 181, 71, 0.6));
}
.lh-cmp-m { --mc: var(--kabut); z-index: 2; display: grid; place-items: center; }
.lh-cmp-m i {
  display: block; width: 7px; height: 7px; transform: rotate(45deg); background: var(--mc);
  box-shadow: 0 0 8px var(--mc), 0 0 0 1px rgba(5, 8, 16, 0.6); opacity: 0.85;
}
.lh-cmp-m b {
  position: absolute; top: -15px; left: 50%; transform: translateX(-50%); white-space: nowrap;
  font: 600 10px/1 var(--font-body); letter-spacing: 0.08em; text-transform: uppercase; color: var(--mc);
  text-shadow: 0 1px 2px rgba(5, 8, 16, 0.9); opacity: 0; transition: opacity 0.25s;
}
.lh-cmp-m.near b { opacity: 0.95; }
.lh-cmp-m.obj { z-index: 3; }
.lh-cmp-m.obj i {
  width: 11px; height: 11px; background: var(--lentera); opacity: 1;
  box-shadow: 0 0 0 2px rgba(11, 15, 28, 0.85), 0 0 14px rgba(255, 181, 71, 0.85);
  animation: lh-obj-pulse 2.4s ease-in-out infinite;
}
.lh-cmp-m.obj em {
  position: absolute; top: 50%; font: 700 16px/1 var(--font-body); font-style: normal; color: var(--lentera);
  transform: translateY(-55%); display: none; text-shadow: 0 0 8px rgba(255, 181, 71, 0.7);
}
.lh-cmp-m.obj em.l { right: 12px; }
.lh-cmp-m.obj em.r { left: 12px; }
.lh-cmp-m.obj.edge-l em.l, .lh-cmp-m.obj.edge-r em.r { display: block; }
@keyframes lh-obj-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(11, 15, 28, 0.85), 0 0 10px rgba(255, 181, 71, 0.6); }
  50% { box-shadow: 0 0 0 2px rgba(11, 15, 28, 0.85), 0 0 18px rgba(255, 181, 71, 1); }
}
`;
