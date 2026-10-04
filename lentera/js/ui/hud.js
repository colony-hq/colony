// HUD: compass + objective, Nyala lantern gauge, carried flames, CREDIT chip (simulated),
// Kilau counter, stamina ring, vignettes, letterbox, title card, subtitles, banners, toasts,
// saving indicator. Owner: ui-audio. API: DESIGN.md §7 hud (+ additions below).
//
// API: toast(text, {kind, seconds}), setVisible(bool), letterbox(on), titleCard({title,
// subtitle, kicker, seconds}), subtitle({speaker, text, seconds}), banner({kicker, title, sub,
// color, seconds}), setObjective(text, target), update(dt).

import { h, injectStyle, uiRoot } from '../core/dom.js';
import { createCompass, COMPASS_CSS } from './hud-compass.js';
import { createCine, CINE_CSS } from './hud-cine.js';
import { CHECKPOINTS } from '../world/heightfield.js';

const FLAMES = [
  { id: 'tirta', name: 'Api Tirta', color: '#bff6ff' },
  { id: 'bumi', name: 'Api Bumi', color: '#ffb04a' },
  { id: 'samudra', name: 'Api Samudra', color: '#8fa2ff' },
];
const FLAME_STATE_LABEL = { none: 'belum ditemukan', carried: 'dibawa', placed: 'menyala di mercusuar' };

// Named places for the "area" banner when the player walks into them (smallest first).
const AREAS = [
  { id: 'dermaga', name: 'Dermaga', x: 0, z: 224, r: 20 },
  { id: 'puncak', name: 'Puncak Gunung', x: -40, z: -62, r: 26, minY: 55 },
  { id: 'kampung', name: 'Kampung', x: 0, z: 158, r: 40 },
  { id: 'mercusuar', name: 'Mercusuar', x: 200, z: 40, r: 34 },
  { id: 'candi', name: 'Candi', x: 30, z: -132, r: 46 },
  { id: 'telaga', name: 'Telaga Air Terjun', x: -168, z: -22, r: 44 },
  { id: 'kapal', name: 'Kapal Karam', x: -206, z: 148, r: 40 },
];

const RING_C = 2 * Math.PI * 27; // nyala meter circumference
const STAM_C = 2 * Math.PI * 12;

const TOAST_ICON = { info: '', credit: '◈', kilau: '', flame: '', warn: '!' };

const CSS = `
.lh { --halo: 0 1px 2px rgba(5, 8, 16, 0.85), 0 0 14px rgba(5, 8, 16, 0.55); color: var(--paper); font-family: var(--font-body); }
.lh-play { position: absolute; inset: 0; opacity: 1; transition: opacity 0.5s var(--ease); }
.lh-play.off { opacity: 0; visibility: hidden; transition: opacity 0.35s var(--ease), visibility 0s linear 0.35s; }

.lh-obj {
  position: absolute; left: 50%; top: calc(env(safe-area-inset-top, 0px) + 56px); transform: translateX(-50%);
  width: min(560px, calc(100vw - 32px)); text-align: center; transition: opacity 1.4s var(--ease);
}
.lh-obj.dim { opacity: 0.55; }
.lh-obj.empty { opacity: 0; }
.lh-obj-k {
  font: 700 10px/1 var(--font-body); letter-spacing: 0.34em; margin-right: -0.34em; text-transform: uppercase;
  color: var(--kabut); text-shadow: var(--halo); margin-bottom: 6px; transition: color 0.6s;
}
.lh-obj.fresh .lh-obj-k { color: var(--lentera); }
.lh-obj-k { display: flex; justify-content: center; align-items: baseline; gap: 0; }
.lh-obj-d { font: 500 11px/1 var(--font-mono); letter-spacing: 0.04em; color: var(--lentera); text-transform: none; }
.lh-obj-d:not(:empty)::before { content: '·'; margin: 0 0.6em 0 0.3em; color: var(--kabut); font-family: var(--font-body); }
.lh-obj-t { font: 500 var(--fs-m)/1.35 var(--font-body); color: var(--paper); text-shadow: var(--halo); text-wrap: balance; }
.lh-obj.in .lh-obj-t { animation: lh-obj-in 0.8s var(--ease) both; }
@keyframes lh-obj-in { from { opacity: 0; transform: translateY(8px); filter: blur(3px); } to { opacity: 1; transform: none; filter: none; } }

.lh-ny {
  position: absolute; left: calc(env(safe-area-inset-left, 0px) + 26px); bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
  display: flex; align-items: center; gap: 12px;
}
.lh-ny-ring { position: relative; width: 70px; height: 70px; flex: none; }
.lh-ny-ring::before {
  content: ''; position: absolute; inset: -14px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(8, 11, 22, 0.62), rgba(8, 11, 22, 0.3) 60%, rgba(8, 11, 22, 0));
}
.lh-ny svg { position: relative; display: block; width: 100%; height: 100%; overflow: visible; }
.lh-ny .trk { fill: rgba(8, 11, 22, 0.42); stroke: rgba(239, 230, 210, 0.14); stroke-width: 3; }
.lh-ny .tick { stroke: rgba(239, 230, 210, 0.45); stroke-width: 1.5; }
.lh-ny .mtr {
  fill: none; stroke: var(--lentera); stroke-width: 3.2; stroke-linecap: round;
  transition: stroke-dashoffset 0.6s var(--ease), stroke 0.4s; filter: drop-shadow(0 0 3px rgba(255, 181, 71, 0.8));
}
.lh-ny .lan { fill: none; stroke: rgba(239, 230, 210, 0.92); stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
.lh-ny .lan-fill { fill: rgba(239, 230, 210, 0.9); }
.lh-ny .glow { transition: opacity 0.6s; }
.lh-ny .fl { transform-origin: 35px 41px; transition: transform 0.6s var(--ease); animation: lh-flicker 1.9s ease-in-out infinite; }
.lh-ny-info { display: grid; gap: 3px; }
.lh-ny-k { font: 700 10px/1 var(--font-body); letter-spacing: 0.32em; text-transform: uppercase; color: var(--kabut); text-shadow: var(--halo); }
.lh-ny-v { font: 500 22px/1 var(--font-mono); color: var(--paper); text-shadow: var(--halo); font-variant-numeric: tabular-nums; }
.lh-ny.warn .mtr { stroke: var(--bara); filter: drop-shadow(0 0 4px rgba(226, 104, 60, 0.9)); animation: lh-warn 1.1s ease-in-out infinite; }
.lh-ny.warn .lh-ny-v { color: #ffb39a; }
.lh-ny.warn .lh-ny-k { color: var(--bara); }
.lh-ny.hit .lh-ny-ring { animation: lh-shake 0.4s linear; }
@keyframes lh-warn { 50% { opacity: 0.35; } }
@keyframes lh-flicker { 0%, 100% { opacity: 1; } 40% { opacity: 0.86; } 70% { opacity: 0.97; } }
@keyframes lh-shake { 20% { transform: translateX(-3px); } 40% { transform: translateX(3px); } 60% { transform: translateX(-2px); } 80% { transform: translateX(1px); } }

.lh-fl { display: flex; gap: 8px; margin-top: 3px; transition: opacity 0.6s; }
.lh-fl.off { opacity: 0; }
.lh-fl i {
  --fc: #fff; width: 10px; height: 10px; border-radius: 50%; box-sizing: border-box;
  border: 1.5px solid var(--fc); opacity: 0.4; box-shadow: 0 0 0 1px rgba(5, 8, 16, 0.35);
  transition: opacity 0.4s, background 0.4s, box-shadow 0.4s;
}
.lh-fl i.carried { background: var(--fc); opacity: 1; box-shadow: 0 0 10px var(--fc), 0 0 3px #fff inset; animation: lh-carry 1.8s ease-in-out infinite; }
.lh-fl i.placed { background: var(--fc); opacity: 1; box-shadow: 0 0 0 2px rgba(8, 11, 22, 0.85), 0 0 0 3.5px var(--fc), 0 0 12px var(--fc); }
@keyframes lh-carry { 50% { box-shadow: 0 0 16px var(--fc), 0 0 3px #fff inset; transform: scale(1.15); } }

.lh-cr {
  position: absolute; right: calc(env(safe-area-inset-right, 0px) + 26px); bottom: calc(env(safe-area-inset-bottom, 0px) + 26px);
  display: grid; justify-items: end; gap: 5px;
}
.lh-cr-chip {
  position: relative; display: flex; align-items: baseline; gap: 8px; padding: 9px 15px 9px 13px; border-radius: 999px;
  background: linear-gradient(180deg, rgba(20, 26, 44, 0.72), rgba(11, 15, 28, 0.72));
  border: 1px solid rgba(255, 181, 71, 0.26); box-shadow: 0 8px 26px rgba(0, 0, 0, 0.32);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); transition: border-color 0.5s, box-shadow 0.5s;
}
.lh-cr-g { font: 400 15px/1 var(--font-mono); color: var(--lentera); }
.lh-cr-n { font: 500 18px/1 var(--font-mono); color: var(--paper); font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
.lh-cr-u { font: 500 10.5px/1 var(--font-mono); letter-spacing: 0.14em; color: var(--kabut); }
.lh-cr-sim { font: 700 9px/1 var(--font-body); letter-spacing: 0.32em; text-transform: uppercase; color: var(--kabut); opacity: 0.85; margin-right: 16px; text-shadow: var(--halo); }
.lh-cr.up .lh-cr-chip { border-color: rgba(143, 227, 208, 0.75); box-shadow: 0 8px 26px rgba(0, 0, 0, 0.32), 0 0 22px rgba(143, 227, 208, 0.3); }
.lh-cr.down .lh-cr-chip { border-color: rgba(255, 181, 71, 0.8); box-shadow: 0 8px 26px rgba(0, 0, 0, 0.32), 0 0 22px rgba(255, 181, 71, 0.3); }
.lh-cr-fl { position: absolute; right: 18px; bottom: calc(100% - 6px); width: 0; height: 0; }
.lh-cr-f {
  position: absolute; right: 0; bottom: 0; white-space: nowrap; font: 500 14px/1 var(--font-mono);
  text-shadow: var(--halo); animation: lh-float 1.6s var(--ease) forwards;
}
.lh-cr-f.pos { color: var(--kilau); }
.lh-cr-f.neg { color: var(--lentera); }
@keyframes lh-float { 0% { opacity: 0; transform: translateY(8px); } 15% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; transform: translateY(-34px); } }

.lh-kl {
  display: flex; align-items: center; gap: 8px; padding: 5px 12px; border-radius: 999px; margin-bottom: 4px;
  background: rgba(8, 11, 22, 0.5); border: 1px solid rgba(143, 227, 208, 0.35);
  opacity: 0; transform: translateY(6px); transition: opacity 0.35s var(--ease), transform 0.35s var(--ease);
}
.lh-kl.on { opacity: 1; transform: none; }
.lh-kl i { width: 8px; height: 8px; transform: rotate(45deg); background: var(--kilau); box-shadow: 0 0 10px var(--kilau); }
.lh-kl b { font: 500 14px/1 var(--font-mono); color: var(--kilau); }
.lh-kl span { font: 700 9.5px/1 var(--font-body); letter-spacing: 0.28em; text-transform: uppercase; color: var(--kabut); }
.lh-kl.pop i { animation: lh-pop 0.45s var(--ease); }
@keyframes lh-pop { 40% { transform: rotate(45deg) scale(1.7); } }

.lh-st { position: absolute; left: 0; top: 0; width: 30px; height: 30px; opacity: 0; transition: opacity 0.45s; will-change: transform; }
.lh-st.on { opacity: 1; }
.lh-st svg { width: 100%; height: 100%; transform: rotate(-90deg); overflow: visible; }
.lh-st .t { fill: rgba(8, 11, 22, 0.35); stroke: rgba(8, 11, 22, 0.55); stroke-width: 4.5; }
.lh-st .m { fill: none; stroke: var(--paper); stroke-width: 3; stroke-linecap: round; filter: drop-shadow(0 0 3px rgba(239, 230, 210, 0.6)); }
.lh-st.low .m { stroke: var(--bara); filter: drop-shadow(0 0 3px rgba(226, 104, 60, 0.9)); }

.lh-save {
  position: absolute; right: calc(env(safe-area-inset-right, 0px) + 26px); top: calc(env(safe-area-inset-top, 0px) + 18px);
  display: flex; align-items: center; gap: 9px; font: 700 10px/1 var(--font-body); letter-spacing: 0.26em; text-transform: uppercase;
  color: var(--kabut); text-shadow: var(--halo); opacity: 0; transition: opacity 0.5s;
}
.lh-save.on { opacity: 1; }
.lh-save i { width: 13px; height: 13px; box-sizing: border-box; border-radius: 50%; border: 2px solid rgba(255, 181, 71, 0.22); border-top-color: var(--lentera); animation: lh-spin 0.9s linear infinite; }
.lh-save.done i { animation: none; border-color: var(--kilau); background: radial-gradient(circle, var(--kilau) 0 2.5px, transparent 3px); }
@keyframes lh-spin { to { transform: rotate(360deg); } }

.lh-vg { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
.lh-vg.hurt { background: radial-gradient(ellipse 78% 72% at 50% 50%, rgba(170, 34, 22, 0) 42%, rgba(170, 34, 22, 0.3) 72%, rgba(120, 14, 8, 0.75) 100%); }
.lh-vg.low { background: radial-gradient(ellipse 72% 66% at 50% 52%, rgba(4, 6, 14, 0) 38%, rgba(4, 6, 14, 0.55) 76%, rgba(4, 6, 14, 0.92) 100%); }

/* Toasts (#toasts root) */
.lt-stack {
  position: absolute; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 26px); transform: translateX(-50%);
  width: min(520px, calc(100vw - 32px)); display: flex; flex-direction: column-reverse; align-items: center; gap: 8px; z-index: 4;
}
.lt {
  --tc: var(--paper); display: flex; align-items: center; gap: 10px; max-width: 100%; padding: 9px 16px 9px 12px; border-radius: 12px;
  background: linear-gradient(180deg, rgba(20, 26, 44, 0.82), rgba(11, 15, 28, 0.82)); border: 1px solid rgba(239, 230, 210, 0.1);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  font: 500 var(--fs-s)/1.35 var(--font-body); color: var(--paper); animation: lt-in 0.45s var(--ease) both;
}
.lt.out { animation: lt-out 0.4s var(--ease) both; }
.lt-ic { flex: none; display: grid; place-items: center; width: 18px; height: 18px; font: 500 14px/1 var(--font-mono); color: var(--tc); font-style: normal; }
.lt.k-info .lt-ic::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--kabut); }
.lt.k-kilau { --tc: var(--kilau); border-color: rgba(143, 227, 208, 0.3); }
.lt.k-kilau .lt-ic::before { content: ''; width: 8px; height: 8px; transform: rotate(45deg); background: var(--kilau); box-shadow: 0 0 8px var(--kilau); }
.lt.k-credit { --tc: var(--lentera); border-color: rgba(255, 181, 71, 0.28); }
.lt.k-credit .lt-tx { font-family: var(--font-mono); font-size: 13px; }
.lt.k-flame { --tc: #ffd89a; border-color: rgba(255, 196, 120, 0.4); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), 0 0 24px rgba(255, 170, 80, 0.18); }
.lt.k-flame .lt-ic::before {
  content: ''; width: 9px; height: 13px; border-radius: 50% 50% 45% 45% / 62% 62% 38% 38%;
  background: radial-gradient(circle at 50% 72%, #fff6d8 0%, #ffcf6b 35%, #ff8a2a 75%); box-shadow: 0 0 10px rgba(255, 170, 60, 0.8);
}
.lt.k-warn { --tc: var(--bara); border-color: rgba(226, 104, 60, 0.45); }
.lt.k-warn .lt-ic { border-radius: 50%; border: 1.5px solid var(--bara); width: 16px; height: 16px; font: 700 11px/1 var(--font-body); }
.lt-n { font: 500 11px/1 var(--font-mono); color: var(--kabut); }
@keyframes lt-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes lt-out { to { opacity: 0; transform: translateY(-6px); } }
.lt.bump { animation: lt-bump 0.35s var(--ease); }
@keyframes lt-bump { 40% { transform: scale(1.04); } }

/* Touch layout: gauges in the top-left corner; bottom belongs to the touch controls and the
   top-right corner to the touch Jurnal/Jeda buttons. */
.lh-touch .lh-ny { left: calc(env(safe-area-inset-left, 0px) + 12px); top: calc(env(safe-area-inset-top, 0px) + 10px); bottom: auto; gap: 8px; }
.lh-touch .lh-ny-ring { width: 50px; height: 50px; }
.lh-touch .lh-ny-ring::before { inset: -8px; }
.lh-touch .lh-ny-k { display: none; }
.lh-touch .lh-ny-v { font-size: 15px; }
.lh-touch .lh-fl { gap: 6px; }
.lh-touch .lh-fl i { width: 8px; height: 8px; }
.lh-touch .lh-cr { left: calc(env(safe-area-inset-left, 0px) + 12px); right: auto; top: calc(env(safe-area-inset-top, 0px) + 72px); bottom: auto; justify-items: start; gap: 3px; }
.lh-touch .lh-cr-chip { padding: 6px 11px 6px 10px; gap: 6px; }
.lh-touch .lh-cr-n { font-size: 14px; }
.lh-touch .lh-cr-g { font-size: 12px; }
.lh-touch .lh-cr-u { font-size: 9px; }
.lh-touch .lh-cr-sim { margin: 0 0 0 12px; font-size: 8px; }
.lh-touch .lh-cr-fl { right: auto; left: 70px; bottom: auto; top: 4px; }
.lh-touch .lh-cr-f { right: auto; left: 0; }
.lh-touch .lh-kl { order: 5; margin: 4px 0 0; padding: 4px 10px; }
.lh-touch .lh-cmp { width: clamp(130px, 36vw, 300px); }
.lh-touch .lh-obj { width: clamp(160px, calc(100vw - 236px), 460px); top: calc(env(safe-area-inset-top, 0px) + 58px); }
.lh-touch .lh-obj-t { font-size: 13.5px; }
.lh-touch .lh-save { left: calc(env(safe-area-inset-left, 0px) + 14px); right: auto; top: calc(env(safe-area-inset-top, 0px) + 132px); }
.lt-stack.touch { bottom: auto; top: calc(env(safe-area-inset-top, 0px) + 150px); flex-direction: column; width: min(420px, calc(100vw - 48px)); }

@media (prefers-reduced-motion: reduce) {
  .lh-ny .fl, .lh-fl i.carried, .lh-cmp-m.obj i, .lh-ny.warn .mtr { animation: none !important; }
  .lt, .lt.out, .lh-obj.in .lh-obj-t { animation-duration: 0.01s !important; }
}
`;

function fmtCredit(v) { return (Math.round(v * 1000) / 1000).toFixed(3); }

export function createHUD(ctx) {
  const { events, state, engine, input } = ctx;
  injectStyle('lentera-hud', COMPASS_CSS + CINE_CSS + CSS);

  const root = uiRoot('hud');
  const toastRoot = uiRoot('toasts');
  root.classList.add('lh');

  // ---- Build -------------------------------------------------------------
  const compass = createCompass(ctx);
  const cine = createCine(ctx);

  const objKickLabel = h('span', {}, 'Tujuan');
  const objDist = h('b.lh-obj-d');
  const objKick = h('div.lh-obj-k', {}, [objKickLabel, objDist]);
  const objText = h('div.lh-obj-t');
  const obj = h('div.lh-obj.empty', { role: 'status', 'aria-live': 'polite' }, [objKick, objText]);

  const svgNS = 'http://www.w3.org/2000/svg';
  const ringWrap = h('div.lh-ny-ring');
  ringWrap.innerHTML = `
<svg viewBox="0 0 70 70" aria-hidden="true">
  <defs>
    <radialGradient id="lhFlameGrad" cx="50%" cy="70%" r="60%">
      <stop offset="0" stop-color="#fff6d8"/><stop offset="0.35" stop-color="#ffcf6b"/><stop offset="0.8" stop-color="#ff8a2a"/><stop offset="1" stop-color="#ff6a1e" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lhGlowGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffb547" stop-opacity="0.75"/><stop offset="1" stop-color="#ffb547" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle class="trk" cx="35" cy="35" r="27"/>
  <circle class="mtr" cx="35" cy="35" r="27" transform="rotate(-90 35 35)" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="0"/>
  <line class="tick" x1="8" y1="35" x2="4.5" y2="35"/>
  <circle class="glow" cx="35" cy="40" r="17" fill="url(#lhGlowGrad)"/>
  <g class="lan">
    <path d="M31.5 21.5 a3.5 3.5 0 0 1 7 0"/>
    <path d="M28 25 L42 25 L40 28.5 L30 28.5 Z" class="lan-fill" stroke="none"/>
    <rect x="29" y="28.5" width="12" height="17" rx="2.5"/>
    <line x1="35" y1="28.5" x2="35" y2="30.5"/>
    <path d="M27.5 45.5 L42.5 45.5 L40.5 49 L29.5 49 Z" class="lan-fill" stroke="none"/>
  </g>
  <path class="fl" d="M35 31.5 C38.6 35.6 39 39.6 35 43.6 C31 39.6 31.4 35.6 35 31.5 Z" fill="url(#lhFlameGrad)"/>
</svg>`;
  const meter = ringWrap.querySelector('.mtr');
  const glow = ringWrap.querySelector('.glow');
  const flamePath = ringWrap.querySelector('.fl');
  void svgNS;

  const nyVal = h('div.lh-ny-v', {}, '100');
  const flameDots = FLAMES.map((f) => {
    const el = h('i', { title: f.name });
    el.style.setProperty('--fc', f.color);
    return el;
  });
  const flameRow = h('div.lh-fl.off', { 'aria-label': 'Api Pusaka' }, flameDots);
  const nyala = h('div.lh-ny', { role: 'meter', 'aria-label': 'Nyala lentera', 'aria-valuemin': '0', 'aria-valuemax': '100' }, [
    ringWrap,
    h('div.lh-ny-info', {}, [h('div.lh-ny-k', {}, 'Nyala'), nyVal, flameRow]),
  ]);

  const crNum = h('span.lh-cr-n', {}, fmtCredit(state.progress.credit?.balance ?? 0));
  const crFloat = h('div.lh-cr-fl');
  const klNum = h('b', {}, '0');
  const kilauEl = h('div.lh-kl', { 'aria-live': 'polite' }, [h('i'), klNum, h('span', {}, 'Kilau')]);
  const credit = h('div.lh-cr', {}, [
    kilauEl,
    h('div.lh-cr-chip', { title: 'CREDIT simulasi, bukan uang sungguhan' }, [h('span.lh-cr-g', {}, '◈'), crNum, h('span.lh-cr-u', {}, 'CREDIT'), crFloat]),
    h('div.lh-cr-sim', {}, 'simulasi'),
  ]);

  const stamWrap = h('div.lh-st');
  stamWrap.innerHTML = `<svg viewBox="0 0 30 30" aria-hidden="true"><circle class="t" cx="15" cy="15" r="12"/><circle class="m" cx="15" cy="15" r="12" stroke-dasharray="${STAM_C.toFixed(2)}" stroke-dashoffset="0"/></svg>`;
  const stamMeter = stamWrap.querySelector('.m');

  const saveText = h('span', {}, 'Menyimpan');
  const saveEl = h('div.lh-save', { 'aria-live': 'polite' }, [h('i'), saveText]);

  const play = h('div.lh-play.off', {}, [compass.root, obj, nyala, credit, stamWrap, saveEl]);
  const vgHurt = h('div.lh-vg.hurt');
  const vgLow = h('div.lh-vg.low');
  root.append(vgLow, vgHurt, play, cine.root);

  const toastStack = h('div.lt-stack', { 'aria-live': 'polite' });
  toastRoot.appendChild(toastStack);

  // ---- State -------------------------------------------------------------
  let manualVisible = true;
  let creditsOpen = false;
  let shown = false;
  let introActive = false;
  let touchLayout = null;
  let objTimer = 0, objFreshTimer = 0;
  let objTarget = null;
  let lastNyala = -1, lastFlames = '', lastBalance = NaN;
  let dispBalance = state.progress.credit?.balance ?? 0;
  let crFlashT = 0;
  let kilauT = 0;
  let hurtLevel = 0, lowLevel = 0, lowPhase = 0;
  let stamShown = false, stamLast = -1, stamHideT = 0;
  let saveT = 0, saveStage = 0;
  let areaCurrent = null, areaLastShown = '', areaCooldown = 0, playClock = 0;
  const toasts = [];
  const tmpV = new ctx.THREE.Vector3();

  function setTouchLayout(on) {
    if (on === touchLayout) return;
    touchLayout = on;
    root.classList.toggle('lh-touch', on);
    toastStack.classList.toggle('touch', on);
  }

  function setObjective(text, target) {
    objTarget = target && Number.isFinite(target.x) ? target : null;
    compass.setObjective(objTarget);
    text = text || '';
    if (text === objText.textContent) return;
    objText.textContent = text;
    obj.classList.toggle('empty', !text);
    if (!text) return;
    obj.classList.remove('in', 'dim');
    void obj.offsetWidth;
    obj.classList.add('in', 'fresh');
    objKickLabel.textContent = 'Tujuan baru';
    objTimer = 8;
    objFreshTimer = 3.2;
  }

  function toast(text, opts = {}) {
    if (!text) return;
    const kind = TOAST_ICON[opts.kind] !== undefined ? opts.kind : 'info';
    const seconds = opts.seconds ?? (kind === 'flame' ? 4.2 : 3.4);
    const dupe = toasts.find((t) => t.text === text && !t.leaving);
    if (dupe) {
      dupe.count++;
      dupe.t = seconds;
      dupe.n.textContent = `×${dupe.count}`;
      dupe.el.classList.remove('bump');
      void dupe.el.offsetWidth;
      dupe.el.classList.add('bump');
      return;
    }
    const n = h('b.lt-n');
    const el = h('div.lt.k-' + kind, { role: 'status' }, [h('i.lt-ic', {}, TOAST_ICON[kind]), h('span.lt-tx', {}, text), n]);
    toastStack.prepend(el);
    const rec = { el, n, text, t: seconds, count: 1, leaving: false };
    toasts.push(rec);
    const live = toasts.filter((x) => !x.leaving);
    if (live.length > 3) dismissToast(live[0]);
  }
  function dismissToast(rec) {
    if (rec.leaving) return;
    rec.leaving = true;
    rec.el.classList.add('out');
    setTimeout(() => {
      rec.el.remove();
      const i = toasts.indexOf(rec);
      if (i >= 0) toasts.splice(i, 1);
    }, 420);
  }

  function renderNyala(v) {
    const n = Math.max(0, Math.min(100, v)) / 100;
    meter.setAttribute('stroke-dashoffset', (RING_C * (1 - n)).toFixed(2));
    glow.style.opacity = (0.15 + 0.85 * n).toFixed(2);
    flamePath.style.transform = `scale(${(0.35 + 0.65 * n).toFixed(3)})`;
    nyVal.textContent = String(Math.round(v));
    nyala.setAttribute('aria-valuenow', String(Math.round(v)));
    nyala.classList.toggle('warn', v < 25);
  }

  function renderFlames(fl) {
    let any = false;
    FLAMES.forEach((f, i) => {
      const s = fl?.[f.id] || 'none';
      if (s !== 'none') any = true;
      const el = flameDots[i];
      el.classList.toggle('carried', s === 'carried');
      el.classList.toggle('placed', s === 'placed');
      el.title = `${f.name} — ${FLAME_STATE_LABEL[s] || s}`;
    });
    const step = state.progress.quest;
    const visible = any || ['seek', 'beacon', 'finale', 'done'].includes(step);
    flameRow.classList.toggle('off', !visible);
  }

  function refreshVisibility() {
    const m = state.mode;
    const vis = manualVisible && !creditsOpen && (m === 'play' || m === 'pause');
    if (vis !== shown) {
      shown = vis;
      play.classList.toggle('off', !vis);
    }
    // Dialogue draws its own bars (js/npc/dialogue.js), so only cinematic modes here.
    const lb = introActive || m === 'intro' || m === 'cinematic' || m === 'finale';
    cine.letterbox(lb);
  }

  function readObjectiveFromQuest() {
    const o = ctx.quest?.objective;
    if (o && (o.text || o.target)) setObjective(o.text, o.target);
  }

  // ---- Events ------------------------------------------------------------
  events.on('mode:change', ({ mode, prev }) => {
    refreshVisibility();
    if (mode === 'play' && prev !== 'pause' && prev !== 'journal' && prev !== 'dialogue') playClock = 0;
  });
  events.on('intro:start', () => { introActive = true; refreshVisibility(); cine.skipShow(6); });
  events.on('intro:end', (p = {}) => {
    introActive = false;
    refreshVisibility();
    cine.skipHide();
    if (p.skipped) { cine.hideCard(); cine.subtitle({ text: '' }); }
  });
  events.on('credits:show', () => { creditsOpen = true; refreshVisibility(); });
  events.on('credits:close', () => { creditsOpen = false; refreshVisibility(); });
  events.on('game:quit', () => { creditsOpen = false; refreshVisibility(); });
  events.on('intro:skipProgress', (p = {}) => cine.skipProgress(p.value));
  events.on('subtitle:clear', () => cine.subtitle({ text: '' }));
  events.on('intro:title', (p = {}) => cine.titleCard(p));
  events.on('title:card', (p = {}) => cine.titleCard(p));
  events.on('subtitle', (p = {}) => cine.subtitle(p));
  events.on('objective', (p = {}) => setObjective(p.text, p.target));
  events.on('toast', (p = {}) => toast(p.text, p));
  events.on('game:start', () => setTimeout(readObjectiveFromQuest, 0));
  events.on('game:loaded', () => setTimeout(readObjectiveFromQuest, 0));
  events.on('game:reset', () => { setObjective('', null); dispBalance = state.progress.credit?.balance ?? 0; });

  events.on('credit:change', ({ delta = 0 } = {}) => {
    if (!delta) return;
    const pos = delta > 0;
    const f = h('span.lh-cr-f.' + (pos ? 'pos' : 'neg'), {}, `${pos ? '+' : '−'}${fmtCredit(Math.abs(delta))}`);
    crFloat.appendChild(f);
    setTimeout(() => f.remove(), 1700);
    credit.classList.toggle('up', pos);
    credit.classList.toggle('down', !pos);
    crFlashT = 1.2;
  });

  events.on('kilau:collect', ({ total, max: maxIn } = {}) => {
    const count = Number.isFinite(total) ? total : (state.progress.kilau?.length ?? 0);
    const max = Number.isFinite(maxIn) ? maxIn : ctx.spirits?.kilauTotal;
    klNum.textContent = Number.isFinite(max) ? `${count} / ${max}` : String(count);
    kilauEl.classList.add('on');
    kilauEl.classList.remove('pop');
    void kilauEl.offsetWidth;
    kilauEl.classList.add('pop');
    kilauT = 2.8;
  });

  events.on('player:hurt', () => {
    hurtLevel = 1;
    nyala.classList.remove('hit');
    void nyala.offsetWidth;
    nyala.classList.add('hit');
  });

  events.on('game:saved', () => {
    saveEl.classList.add('on');
    saveEl.classList.remove('done');
    saveText.textContent = 'Menyimpan';
    saveT = 2.4;
    saveStage = 1;
  });

  events.on('flame:collect', ({ flameId } = {}) => {
    const f = FLAMES.find((x) => x.id === flameId);
    if (!f) return;
    const n = FLAMES.filter((x) => state.progress.flames?.[x.id] && state.progress.flames[x.id] !== 'none').length;
    cine.banner({ kicker: 'Api Pusaka ditemukan', title: f.name, sub: `${Math.max(1, n)} dari 3 · Bawa ke mercusuar`, color: f.color, seconds: 4 });
  });
  events.on('flame:place', ({ flameId } = {}) => {
    const f = FLAMES.find((x) => x.id === flameId);
    if (!f) return;
    const n = FLAMES.filter((x) => state.progress.flames?.[x.id] === 'placed').length;
    cine.banner({ kicker: 'Tungku menyala', title: f.name, sub: n >= 3 ? 'Ketiga api sudah di tempatnya.' : `${n} dari 3 api menyala di mercusuar`, color: f.color, seconds: 3.8 });
  });
  events.on('checkpoint:light', ({ id } = {}) => {
    const cp = CHECKPOINTS.find((c) => c.id === id);
    cine.banner({ kicker: 'Api unggun menyala', title: cp?.name || 'Api Unggun', sub: 'Kabut di sekitar sini terangkat. Perjalanan tersimpan.', seconds: 4 });
  });
  events.on('player:faint', () => {
    cine.banner({ kicker: 'Nyala habis', title: 'Lenteramu padam…', sub: 'Kamu akan tersadar di api unggun terakhir.', color: '#e2683c', persist: true });
  });
  events.on('player:respawn', () => cine.hideBanner());
  events.on('finale:start', () => cine.hideBanner());

  // Clicking a toast/HUD never steals focus from the game.
  root.addEventListener('mousedown', (e) => e.preventDefault());

  renderNyala(state.progress.nyala ?? 100);
  readObjectiveFromQuest();
  refreshVisibility();

  // ---- Per-frame ---------------------------------------------------------
  function updateArea(dt) {
    areaCooldown -= dt;
    playClock += dt;
    if (state.mode !== 'play' || playClock < 4) return;
    const p = ctx.player?.position;
    if (!p) return;
    if (areaCurrent) {
      const a = areaCurrent;
      if (Math.hypot(p.x - a.x, p.z - a.z) > a.r * 1.25 || (a.minY && p.y < a.minY - 6)) areaCurrent = null;
    }
    if (!areaCurrent) {
      for (const a of AREAS) {
        if (Math.hypot(p.x - a.x, p.z - a.z) < a.r && (!a.minY || p.y > a.minY)) {
          areaCurrent = a;
          if (a.id !== areaLastShown && areaCooldown <= 0) {
            areaLastShown = a.id;
            areaCooldown = 8;
            cine.area(a.name);
          }
          break;
        }
      }
    }
  }

  function updateStamina(dt) {
    const pl = ctx.player;
    const s = pl && Number.isFinite(pl.stamina) ? pl.stamina : 1;
    const want = shown && state.mode === 'play' && s < 0.995;
    if (want) stamHideT = 0.6;
    else stamHideT -= dt;
    const on = want || stamHideT > 0;
    if (on !== stamShown) { stamShown = on; stamWrap.classList.toggle('on', on); }
    if (!on || !pl) return;
    if (Math.abs(s - stamLast) > 0.003) {
      stamLast = s;
      stamMeter.setAttribute('stroke-dashoffset', (STAM_C * (1 - Math.max(0, Math.min(1, s)))).toFixed(2));
      stamWrap.classList.toggle('low', s < 0.25);
    }
    tmpV.set(pl.position.x, pl.position.y + 1.25, pl.position.z).project(ctx.camera);
    if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.2 || Math.abs(tmpV.y) > 1.2) return;
    const w = engine.size?.w || window.innerWidth, hh = engine.size?.h || window.innerHeight;
    const x = (tmpV.x * 0.5 + 0.5) * w + Math.min(70, w * 0.05) - 15;
    const y = (-tmpV.y * 0.5 + 0.5) * hh - 15;
    stamWrap.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  return {
    get visible() { return shown; },
    toast,
    setVisible(v) { manualVisible = !!v; refreshVisibility(); },
    letterbox(on) { introActive = !!on; refreshVisibility(); },
    titleCard: (p) => cine.titleCard(p),
    subtitle: (p) => cine.subtitle(p),
    banner: (p) => cine.banner(p),
    hideBanner: () => cine.hideBanner(),
    setObjective,

    update(dt) {
      setTouchLayout(!!(engine.isTouch || input.device === 'touch'));
      cine.update(dt);

      // Toast timers run in real time but pause while a full-screen menu covers them.
      const tick = state.mode === 'pause' || state.mode === 'journal' ? 0 : dt;
      for (const t of toasts) if (!t.leaving && (t.t -= tick) <= 0) dismissToast(t);

      // Vignettes.
      const nyalaNow = state.progress.nyala ?? 100;
      if (hurtLevel > 0) {
        hurtLevel = Math.max(0, hurtLevel - dt * 1.3);
        vgHurt.style.opacity = (hurtLevel * hurtLevel).toFixed(3);
      }
      const lowTarget = shown && state.mode === 'play' ? Math.max(0, (25 - nyalaNow) / 25) : 0;
      lowLevel += (lowTarget - lowLevel) * Math.min(1, dt * 2);
      if (lowLevel > 0.002) {
        lowPhase += dt * (1.2 + lowLevel * 1.4);
        const beat = 0.75 + 0.25 * Math.pow(Math.max(0, Math.sin(lowPhase * Math.PI)), 6);
        vgLow.style.opacity = (Math.min(1, 0.25 + lowLevel) * beat * (lowLevel > 0.01 ? 1 : lowLevel * 100)).toFixed(3);
      } else if (vgLow.style.opacity !== '0') vgLow.style.opacity = '0';

      if (!shown) return;

      compass.update();
      updateArea(dt);
      updateStamina(dt);

      if (nyalaNow !== lastNyala) { lastNyala = nyalaNow; renderNyala(nyalaNow); }
      const fl = state.progress.flames || {};
      const flKey = `${fl.tirta}|${fl.bumi}|${fl.samudra}|${state.progress.quest}`;
      if (flKey !== lastFlames) { lastFlames = flKey; renderFlames(fl); }

      const bal = state.progress.credit?.balance ?? 0;
      if (bal !== lastBalance) {
        if (Number.isNaN(lastBalance)) dispBalance = bal;
        lastBalance = bal;
      }
      if (Math.abs(dispBalance - bal) > 0.00005) {
        dispBalance += (bal - dispBalance) * Math.min(1, dt * 6);
        if (Math.abs(dispBalance - bal) < 0.0005) dispBalance = bal;
        crNum.textContent = fmtCredit(dispBalance);
      } else if (crNum.textContent !== fmtCredit(bal)) crNum.textContent = fmtCredit(bal);
      if (crFlashT > 0 && (crFlashT -= dt) <= 0) credit.classList.remove('up', 'down');

      if (kilauT > 0 && (kilauT -= dt) <= 0) kilauEl.classList.remove('on');

      if (objTimer > 0 && (objTimer -= dt) <= 0) obj.classList.add('dim');
      if (objFreshTimer > 0 && (objFreshTimer -= dt) <= 0) { obj.classList.remove('fresh'); objKickLabel.textContent = 'Tujuan'; }
      const dt2 = compass.distanceText;
      if (dt2 !== objDist.textContent) objDist.textContent = dt2;

      if (saveT > 0) {
        saveT -= dt;
        if (saveStage === 1 && saveT < 1.2) { saveStage = 2; saveEl.classList.add('done'); saveText.textContent = 'Tersimpan'; }
        if (saveT <= 0) saveEl.classList.remove('on');
      }
    },
  };
}
