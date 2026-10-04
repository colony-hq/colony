// World map: full-screen painted region (world/mapimage.js) with zone names, road names, map
// icons, your position, remote players and the tracked quest target. Drag to pan, wheel / pinch /
// buttons to zoom. Owner: ui builder.

import { injectStyle, h } from '../../core/dom.js';
import { ZONES, ROADS } from '../../data/zones.js';
import { BUILDINGS } from '../../data/buildings.js';
import { mapIconCanvas } from '../icons.js';
import { regionCanvas, collectPOIs, REGION_NAMES } from '../minimap.js';
import { clamp, safe } from '../util.js';

const PAINT = 3;
const LEGEND = [['bank', 'Bank'], ['shop', 'Shop'], ['exchange', 'Exchange'], ['quest', 'Quest start'], ['furnace', 'Furnace'], ['anvil', 'Anvil'], ['range', 'Range'], ['fish', 'Fishing'], ['altar', 'Sigil altar'], ['portal', 'Dungeon'], ['thief', 'Stall'], ['oracle', 'Oracle']];

const CSS = `
.u-wm .u-win-b { padding: 0 10px 10px; display: flex; flex-direction: column; }
.u-wmv { position: relative; flex: 1; min-height: 240px; border-radius: 6px; overflow: hidden; background: #1d3a52; cursor: grab; touch-action: none; box-shadow: inset 0 0 0 1px #000, 0 0 0 1px rgba(201,162,74,.4); }
.u-wmv.drag { cursor: grabbing; }
.u-wmv canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.u-wmctl { position: absolute; right: 10px; top: 10px; display: flex; flex-direction: column; gap: 4px; }
.u-wmctl button { width: 34px; height: 34px; border-radius: 6px; font: 700 18px/1 var(--font-body); padding: 0; }
.u-wmleg { position: absolute; left: 10px; bottom: 10px; display: grid; grid-template-columns: repeat(2, auto); gap: 3px 12px; padding: 8px 10px; border-radius: 6px; font: 600 11.5px var(--font-body); color: var(--parch);
  background: rgba(20,14,9,.86); box-shadow: 0 0 0 1px #000, inset 0 0 0 1px rgba(201,162,74,.4); }
.u-wmleg span { display: flex; align-items: center; gap: 5px; }
.u-wmleg canvas { position: static; width: 16px; height: 16px; }
.u-wmleg.off { display: none; }
.u-wmbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 0 2px 6px; font: 12px var(--font-body); color: var(--parch-dim); }
[data-layout=phone] .u-wmbar span:last-child { display: none; }
[data-layout=phone] .u-wmleg { grid-template-columns: repeat(3, auto); font-size: 10.5px; }
`;

export function createWorldMap(U) {
  const { ctx, events } = U;
  injectStyle('ui-wm', CSS);
  let view = null; // { cv, g, region, base, scale, cx, cz, pois }
  let raf = 0;

  function draw() {
    raf = 0;
    if (!view || !view.cv.isConnected) return;
    const { cv, g, base } = view;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const R = view.region;
    const k = view.scale * dpr; // device px per tile
    const ox = W / 2 - (view.cx - R.x0) * k, oz = H / 2 - (view.cz - R.z0) * k;
    const toS = (x, z) => [ox + (x - R.x0) * k, oz + (z - R.z0) * k];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = R.id === 'overworld' ? '#1d3a52' : '#0c0906';
    g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = view.scale < PAINT;
    g.drawImage(base, ox, oz, base.width * (k / PAINT), base.height * (k / PAINT));
    // Vignette edge of the world.
    if (R.id === 'overworld') {
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2 * dpr; g.strokeRect(ox, oz, base.width * (k / PAINT), base.height * (k / PAINT));
    }
    const fs = (px) => Math.round(px * dpr);
    // Building names (zoomed in).
    if (R.id === 'overworld' && view.scale >= 4) {
      g.font = `600 ${fs(10.5)}px Spectral, Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const b of BUILDINGS) {
        if (!b.name || b.name === 'Cottage' || b.name === 'Tent') continue;
        const [sx, sy] = toS(b.x + b.w / 2, b.z + b.d / 2);
        if (sx < -50 || sy < -50 || sx > W + 50 || sy > H + 50) continue;
        g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(b.name, sx, sy);
        g.fillStyle = '#f2e6c8'; g.fillText(b.name, sx, sy);
      }
    }
    // Road names.
    if (R.id === 'overworld' && view.scale >= 1.6) {
      g.font = `italic 600 ${fs(11)}px Spectral, Georgia, serif`;
      for (const r of ROADS) {
        const pts = r.points;
        const i = Math.floor((pts.length - 1) / 2);
        const a = pts[i], b = pts[i + 1];
        const [x0, y0] = toS(a.x, a.z), [x1, y1] = toS(b.x, b.z);
        let ang = Math.atan2(y1 - y0, x1 - x0);
        if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        g.save(); g.translate((x0 + x1) / 2, (y0 + y1) / 2); g.rotate(ang);
        g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(40,26,12,.8)'; g.strokeText(r.name, 0, -fs(8));
        g.fillStyle = '#f0dca8'; g.fillText(r.name, 0, -fs(8));
        g.restore();
      }
    }
    // Icons.
    const isz = fs(clamp(view.scale * 4.5, 13, 22));
    for (const p of view.pois) {
      const [sx, sy] = toS(p.x, p.z);
      if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
      g.drawImage(mapIconCanvas(p.kind, 24), sx - isz / 2, sy - isz / 2, isz, isz);
    }
    // Zone names.
    if (R.id === 'overworld') {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const [id, z] of Object.entries(ZONES)) {
        const [sx, sy] = toS(z.x, z.z - (id === 'gildmoor' ? 8 : 0));
        const size = fs(clamp(view.scale * 6, 14, 30));
        g.font = `700 ${size}px "Cinzel Decorative", Georgia, serif`;
        g.lineWidth = 4 * dpr; g.strokeStyle = 'rgba(10,6,3,.85)'; g.strokeText(z.name, sx, sy);
        g.fillStyle = '#ffe7a8'; g.fillText(z.name, sx, sy);
        g.font = `600 ${fs(11)}px "Spline Sans Mono", monospace`;
        g.lineWidth = 3 * dpr; g.strokeText(`lvl ${z.levels}`, sx, sy + size * 0.85);
        g.fillStyle = '#ffd34d'; g.fillText(`lvl ${z.levels}`, sx, sy + size * 0.85);
      }
    } else {
      g.font = `700 ${fs(22)}px "Cinzel Decorative", Georgia, serif`; g.textAlign = 'center';
      g.lineWidth = 4 * dpr; g.strokeStyle = '#000'; g.strokeText(REGION_NAMES[R.id] || R.id, W / 2, fs(30));
      g.fillStyle = '#ffe7a8'; g.fillText(REGION_NAMES[R.id] || R.id, W / 2, fs(30));
    }
    // Remote players.
    for (const e of safe(() => ctx.entities.byKind('remote'), [])) {
      const [sx, sy] = toS(e.pos?.x ?? e.x, e.pos?.z ?? e.z);
      g.fillStyle = '#000'; g.fillRect(sx - 3 * dpr, sy - 3 * dpr, 6 * dpr, 6 * dpr);
      g.fillStyle = '#fff'; g.fillRect(sx - 2 * dpr, sy - 2 * dpr, 4 * dpr, 4 * dpr);
    }
    // Tracked quest target.
    const t = safe(() => ctx.quests?.tracked?.(), null);
    if (t?.target && t.target.x != null) {
      const [sx, sy] = toS(t.target.x + 0.5, t.target.z + 0.5);
      g.save(); g.translate(sx, sy); g.scale(dpr, dpr);
      g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 4 : 9; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
      g.fillStyle = '#ffd34d'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
      g.restore();
    }
    // You.
    const p = ctx.player?.pos;
    if (p && safe(() => ctx.map.regionAt(p.x, p.z).id, 'overworld') === R.id) {
      const [sx, sy] = toS(p.x, p.z);
      const pulse = 1 + 0.25 * Math.sin(performance.now() / 220);
      g.beginPath(); g.arc(sx, sy, 11 * dpr * pulse, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2 * dpr; g.stroke();
      g.save(); g.translate(sx, sy); g.rotate(-(ctx.player.yaw || 0)); g.scale(dpr * 1.4, dpr * 1.4);
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5); g.closePath();
      g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.2; g.stroke();
      g.restore();
      raf = requestAnimationFrame(draw); // keep the pulse alive while open
    }
  }
  const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };

  function zoomAt(f, sx, sy) {
    if (!view) return;
    const r = view.cv.getBoundingClientRect();
    const px = (sx ?? r.left + r.width / 2) - r.left - r.width / 2, py = (sy ?? r.top + r.height / 2) - r.top - r.height / 2;
    const wx = view.cx + px / view.scale, wz = view.cz + py / view.scale;
    view.scale = clamp(view.scale * f, 0.8, 9);
    view.cx = wx - px / view.scale; view.cz = wz - py / view.scale;
    redraw();
  }
  function centre() {
    const p = ctx.player?.pos;
    if (view && p) { view.cx = p.x; view.cz = p.z; redraw(); }
  }

  const wm = {
    open() {
      if (U.windows.isOpen('worldmap')) { U.windows.closeWindow('worldmap'); return; }
      const p = ctx.player?.pos || { x: 186, z: 252 };
      const R = safe(() => ctx.map.regionAt(p.x, p.z), { id: 'overworld', x0: 0, z0: 0, w: 320, h: 320 });
      U.windows.openWindow('worldmap', {
        title: R.id === 'overworld' ? 'The Vale' : REGION_NAMES[R.id] || 'Map', width: 'min(1120px, calc(100vw - 12px))', height: 'min(800px, calc(100vh - 12px))', className: 'u-wm', anchor: 'center',
        onClose() { if (raf) cancelAnimationFrame(raf); raf = 0; view = null; },
        render(body) {
          const bar = h('div.u-wmbar', { html: '<span>Drag to pan · scroll or pinch to zoom</span><span>Robinhood Chain sees all — but the map is free.</span>' });
          const vp = h('div.u-wmv');
          const cv = h('canvas');
          const leg = h('div.u-wmleg');
          for (const [k, label] of LEGEND) { const c = mapIconCanvas(k, 24); const img = h('canvas', { width: 24, height: 24 }); img.getContext('2d').drawImage(c, 0, 0); leg.append(h('span', {}, [img, label])); }
          const ctl = h('div.u-wmctl', {}, [
            h('button.u-btn', { text: '+', title: 'Zoom in', onclick: () => zoomAt(1.35) }),
            h('button.u-btn', { text: '−', title: 'Zoom out', onclick: () => zoomAt(1 / 1.35) }),
            h('button.u-btn', { html: '&#9678;', title: 'Centre on me', onclick: centre }),
            h('button.u-btn', { html: '&#8505;', title: 'Legend', onclick: () => leg.classList.toggle('off') }),
          ]);
          vp.append(cv, ctl, leg);
          body.append(bar, vp);
          const base = regionCanvas(U, R.id);
          const fitScale = Math.min(vp.clientWidth || 800, vp.clientHeight || 600) / Math.max(R.w || 320, R.h || 320);
          view = { cv, g: cv.getContext('2d'), region: R, base, scale: clamp(Math.max(fitScale * 1.6, 2.2), 0.8, 9), cx: p.x, cz: p.z, pois: R.id === 'overworld' ? collectPOIs(ctx) : collectPOIs(ctx).filter((q) => q.x >= R.x0 && q.x < R.x0 + R.w) };
          if (U.layout === 'phone') leg.classList.add('off');
          // Pan / pinch.
          const pts = new Map();
          let last = null, pinch = null;
          vp.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; vp.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = { x: e.clientX, y: e.clientY }; vp.classList.add('drag'); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
          vp.addEventListener('pointermove', (e) => {
            if (!pts.has(e.pointerId) || !view) return;
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch = d; return; }
            view.cx -= (e.clientX - last.x) / view.scale; view.cz -= (e.clientY - last.y) / view.scale; last = { x: e.clientX, y: e.clientY };
            redraw();
          });
          const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) vp.classList.remove('drag'); const r = [...pts.values()][0]; if (r) last = { ...r }; };
          vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
          vp.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY > 0 ? 1 / 1.18 : 1.18, e.clientX, e.clientY); }, { passive: false });
          new ResizeObserver(redraw).observe(vp);
          redraw();
        },
      });
    },
  };
  events.on('player:teleport', () => { if (U.windows.isOpen('worldmap')) { U.windows.closeWindow('worldmap'); } });
  return wm;
}
