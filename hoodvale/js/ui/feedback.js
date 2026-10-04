// Feedback layer: XP drops, level-up popups (+ 'ui:fanfare' event), area-entry banner and toasts.
// Also emits zone:enter {zone, name} on zone changes when no other module does.
// Owner: ui builder.

import { injectStyle, h } from '../core/dom.js';
import { ZONES } from '../data/zones.js';
import { skillIcon } from './icons.js';
import { esc, fmtInt, skillName, safe } from './util.js';
import { REGION_NAMES } from './minimap.js';

const CSS = `
.u-xpd { position: absolute; right: 290px; top: 0; width: 180px; height: 200px; pointer-events: none; }
.u-drop { position: absolute; right: 0; top: 150px; display: flex; align-items: center; gap: 4px; font: 700 15px/1 var(--font-mono); color: #fff;
  text-shadow: 1px 1px 0 #000, -1px 0 0 #000, 0 0 4px rgba(0,0,0,.8); animation: u-drop 1.9s linear forwards; white-space: nowrap; }
.u-drop img { width: 22px; height: 22px; }
@keyframes u-drop { 0% { transform: translateY(0); opacity: 0; } 8% { opacity: 1; } 75% { opacity: 1; } 100% { transform: translateY(-140px); opacity: 0; } }
[data-layout=phone] .u-xpd { right: 176px; width: 120px; }
[data-layout=phone] .u-drop { top: 110px; font-size: 13px; }
[data-layout=phone] .u-drop img { width: 18px; height: 18px; }

.u-lvl { position: absolute; left: 50%; top: 76px; transform: translateX(-50%); width: min(400px, calc(100vw - 24px)); padding: 14px 18px 14px 92px; box-sizing: border-box; pointer-events: auto; cursor: pointer;
  animation: u-lvlin .45s cubic-bezier(.2,1.4,.4,1) both; min-height: 96px; }
.u-lvl.out { animation: u-lvlout .35s var(--ease) forwards; }
.u-lvl .ic { position: absolute; left: 14px; top: 50%; width: 64px; height: 64px; margin-top: -32px; display: grid; place-items: center;
  background: radial-gradient(circle, rgba(255,230,150,.9), rgba(255,200,80,.25) 55%, transparent 70%); border-radius: 50%; }
.u-lvl .ic img { width: 52px; height: 52px; animation: u-lvlspin 1.2s var(--ease); }
.u-lvl .ic::before { content: ''; position: absolute; inset: -10px; border-radius: 50%; background: conic-gradient(from 0deg, transparent 0 10deg, rgba(255,215,110,.55) 10deg 16deg, transparent 16deg 40deg, rgba(255,215,110,.45) 40deg 46deg, transparent 46deg 80deg, rgba(255,215,110,.5) 80deg 86deg, transparent 86deg 120deg, rgba(255,215,110,.45) 120deg 126deg, transparent 126deg 160deg, rgba(255,215,110,.55) 160deg 166deg, transparent 166deg 200deg, rgba(255,215,110,.45) 200deg 206deg, transparent 206deg 240deg, rgba(255,215,110,.5) 240deg 246deg, transparent 246deg 280deg, rgba(255,215,110,.45) 280deg 286deg, transparent 286deg 320deg, rgba(255,215,110,.5) 320deg 326deg, transparent 326deg);
  animation: u-rays 6s linear infinite; mask: radial-gradient(circle, #000 40%, transparent 72%); -webkit-mask: radial-gradient(circle, #000 40%, transparent 72%); }
.u-lvl h3 { margin: 0 0 3px; font: 700 20px/1.1 var(--font-display); color: #7a1f17; letter-spacing: .03em; }
.u-lvl p { margin: 0; font: 15px/1.35 var(--font-body); color: var(--ink); }
.u-lvl ul { margin: 6px 0 0; padding: 0; list-style: none; font: 13px/1.35 var(--font-body); color: #3f2a12; }
.u-lvl li::before { content: '\\2726  '; color: #a8761a; }
@keyframes u-lvlin { from { transform: translate(-50%, -18px) scale(.9); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
@keyframes u-lvlout { to { transform: translate(-50%, -12px); opacity: 0; } }
@keyframes u-lvlspin { from { transform: scale(.4) rotate(-30deg); } to { transform: none; } }
@keyframes u-rays { to { transform: rotate(360deg); } }
[data-layout=phone] .u-lvl { top: calc(140px + env(safe-area-inset-top, 0px)); padding-left: 80px; }

.u-banner { position: absolute; left: 50%; top: 18%; transform: translateX(-50%); text-align: center; pointer-events: none; width: min(640px, calc(100vw - 24px));
  animation: u-banner 4.2s var(--ease) forwards; }
.u-banner .nm { font: 700 clamp(28px, 5.4vw, 48px)/1.05 var(--font-display); color: #f3d98a; letter-spacing: .04em;
  text-shadow: 0 2px 0 #000, 0 0 18px rgba(0,0,0,.85), 0 0 34px rgba(201,162,74,.35); }
.u-banner .orn { display: flex; align-items: center; gap: 10px; justify-content: center; margin: 4px auto 6px; width: min(420px, 80vw); }
.u-banner .orn i { flex: 1; height: 2px; background: linear-gradient(90deg, transparent, #c9a24a); box-shadow: 0 1px 0 #000; }
.u-banner .orn i:last-child { background: linear-gradient(90deg, #c9a24a, transparent); }
.u-banner .orn b { width: 9px; height: 9px; transform: rotate(45deg); background: #c9a24a; box-shadow: 0 0 0 1px #000; }
.u-banner .sub { font: italic 600 16px/1.3 var(--font-body); color: #efe2c4; text-shadow: 1px 1px 0 #000, 0 0 10px rgba(0,0,0,.9); }
.u-banner .lv { font: 600 11px/1 var(--font-mono); color: #ffd34d; letter-spacing: .12em; text-transform: uppercase; margin-top: 6px; text-shadow: 1px 1px 0 #000; }
@keyframes u-banner { 0% { opacity: 0; transform: translate(-50%, 10px); letter-spacing: .2em; } 15% { opacity: 1; transform: translate(-50%, 0); } 78% { opacity: 1; } 100% { opacity: 0; } }

.u-toasts { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; width: min(460px, calc(100vw - 24px)); }
.u-toast { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 6px; font: 600 14px/1.3 var(--font-body); color: var(--parch);
  background: linear-gradient(180deg, rgba(46,34,25,.96), rgba(28,20,14,.96)); box-shadow: 0 0 0 1px #000, inset 0 0 0 1px rgba(201,162,74,.5), 0 8px 18px rgba(0,0,0,.5); animation: u-toast 3.4s var(--ease) forwards; pointer-events: auto; }
.u-toast img { width: 24px; height: 24px; }
.u-toast.chain { box-shadow: 0 0 0 1px #000, inset 0 0 0 1px rgba(58,214,160,.6), 0 8px 18px rgba(0,0,0,.5); }
.u-toast.warn { box-shadow: 0 0 0 1px #000, inset 0 0 0 1px rgba(255,107,91,.6), 0 8px 18px rgba(0,0,0,.5); }
.u-toast.quest { box-shadow: 0 0 0 1px #000, inset 0 0 0 1px rgba(95,154,62,.8), 0 8px 18px rgba(0,0,0,.5); }
@keyframes u-toast { 0% { opacity: 0; transform: translateY(-8px); } 8% { opacity: 1; transform: none; } 85% { opacity: 1; } 100% { opacity: 0; transform: translateY(-6px); } }
[data-layout=phone] .u-toasts { top: calc(150px + env(safe-area-inset-top, 0px)); }
`;

export function createFeedback(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-feedback', CSS);
  const xpd = h('div.u-xpd');
  U.hud.root.append(xpd);
  const fx = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
  U.roots.toasts.append(fx);
  const toasts = h('div.u-toasts');
  U.roots.toasts.append(toasts);

  // ---- XP drops (batched per frame so one tick's drops share a line) ----
  let pending = null;
  events.on('xp', ({ skill, amount }) => {
    if (!(amount > 0) || state.settings.showXpDrops === false || state.mode !== 'play') return;
    pending = pending || new Map();
    pending.set(skill, (pending.get(skill) || 0) + amount);
  });
  function flushXp() {
    if (!pending) return;
    const m = pending; pending = null;
    let total = 0;
    const el = h('div.u-drop');
    for (const [skill, amt] of m) { total += amt; el.append(h('img', { src: skillIcon(skill), alt: skillName(skill) })); }
    el.append(h('span', { text: '+' + fmtInt(Math.round(total)) }));
    // Stagger if the lane is busy.
    const busy = xpd.children.length;
    if (busy) el.style.top = `${(U.layout === 'phone' ? 110 : 150) + Math.min(busy, 3) * 6}px`;
    xpd.append(el);
    setTimeout(() => el.remove(), 1950);
  }

  // ---- level-up popups ----
  const queue = [];
  let showing = null;
  events.on('level:up', ({ skill, level }) => {
    U.ui.message(`Your ${skillName(skill)} grows stronger: level ${level}!`, 'level');
    queue.push({ skill, level });
    if (!showing) nextLevel();
  });
  function nextLevel() {
    const lv = queue.shift();
    if (!lv) { showing = null; return; }
    const unlocks = safe(() => U.guide?.unlocksAt(lv.skill, lv.level), []) || [];
    const el = h('div.u-lvl.u-parch', { 'data-interactive': '', role: 'status' }, [
      h('div.ic', {}, [h('img', { src: skillIcon(lv.skill), alt: '' })]),
      h('h3', { text: 'Level up!' }),
      h('p', { html: `Your <b>${esc(skillName(lv.skill))}</b> level is now <b>${lv.level}</b>.` }),
      unlocks.length ? h('ul', {}, unlocks.slice(0, 3).map((u) => h('li', { text: u }))) : null,
    ]);
    fx.append(el);
    showing = el;
    events.emit('ui:fanfare', { skill: lv.skill, level: lv.level, unlocks });
    let closed = false;
    const close = () => { if (closed) return; closed = true; el.classList.add('out'); setTimeout(() => { el.remove(); nextLevel(); }, 340); };
    el.addEventListener('click', close);
    setTimeout(close, queue.length ? 2600 : 4200);
  }

  // ---- area banner + zone:enter ----
  let zoneNow = null, externalZone = false, lastBanner = { key: null, at: 0 };
  let emitting = false;
  events.on('zone:enter', (p) => {
    if (!emitting) externalZone = true;
    if (p?.minor) return;
    banner(p?.zone, p?.name, p);
  });
  function zoneKey() {
    const p = ctx.player?.pos;
    if (!p) return null;
    const r = safe(() => ctx.map.regionAt(p.x, p.z), null);
    if (r && r.id !== 'overworld') return r.id;
    const z = safe(() => ctx.map.zoneAt(Math.floor(p.x), Math.floor(p.z)), null);
    return typeof z === 'string' ? z : z?.id || 'wilds';
  }
  function checkZone() {
    if (state.mode !== 'play') return;
    const k = zoneKey();
    if (!k || k === zoneNow) return;
    zoneNow = k;
    if (k === 'wilds') return;
    if (externalZone || ctx.lore) return; // content's lore module owns zone:enter when present
    emitting = true;
    events.emit('zone:enter', { zone: k, name: ZONES[k]?.name || REGION_NAMES[k] || k });
    emitting = false;
  }
  function banner(zone, name, info = {}) {
    if (!zone || zone === 'wilds') return;
    const now = performance.now();
    if (lastBanner.key === zone && now - lastBanner.at < 30000) return;
    lastBanner = { key: zone, at: now };
    const Z = ZONES[zone];
    const blurb = info.blurb || Z?.blurb || '';
    const sub = blurb ? blurb.split('. ')[0].replace(/\.$/, '') + '.' : { warrens: 'Mind your head. And your purse.', vault: 'Every coin here was taken from someone.', lair: 'The air tastes of ash.' }[zone] || '';
    const levels = info.levels || Z?.levels;
    const el = h('div.u-banner', {}, [
      h('div.nm', { text: name || Z?.name || REGION_NAMES[zone] || zone }),
      h('div.orn', {}, [h('i'), h('b'), h('i')]),
      sub ? h('div.sub', { text: sub }) : null,
      levels ? h('div.lv', { text: `${info.first ? 'First visit · ' : ''}Levels ${String(levels).replace('-', '–')}` }) : null,
    ]);
    for (const old of fx.querySelectorAll('.u-banner')) old.remove();
    fx.append(el);
    setTimeout(() => el.remove(), 4300);
  }
  events.on('player:move', checkZone);
  events.on('player:teleport', () => setTimeout(checkZone, 0));
  events.on('game:start', () => { zoneNow = null; setTimeout(checkZone, 600); });

  const fb = {
    toast(text, { kind = '', icon = null, ms = 3400 } = {}) {
      const el = h('div.u-toast' + (kind ? '.' + kind : ''), { role: 'status' }, [icon ? h('img', { src: icon, alt: '' }) : null, h('span', { html: esc(text) })]);
      el.style.animationDuration = ms + 'ms';
      toasts.append(el);
      while (toasts.children.length > 4) toasts.firstChild.remove();
      setTimeout(() => el.remove(), ms + 50);
      return el;
    },
    banner,
    update() { flushXp(); },
  };
  return fb;
}
