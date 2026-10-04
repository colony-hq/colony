// HUD frame: hover text (top-left), minimap cluster with orbs (top-right), XP-drop lane and the
// responsive layout switch (desk / phone). The side panel, chatbox and minimap drawing live in
// their own modules and mount into the containers created here. Owner: ui builder.

import { injectStyle, h } from '../core/dom.js';
import { tabSvg } from './icons.js';
import { formatCredit, safe } from './util.js';

const CSS = `
.u-hud { position: absolute; inset: 0; pointer-events: none; }
.u-hud.off { display: none; }
.u-hover { position: absolute; left: 10px; top: 8px; max-width: calc(100vw - 300px); font: 700 15px/1.25 var(--font-body); color: #fff;
  text-shadow: 1px 1px 0 #000, -1px 0 0 rgba(0,0,0,.7), 0 0 5px rgba(0,0,0,.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.u-hover .more { color: #e8dcc0; font-weight: 600; }
.u-hover .use { color: #ff9f43; }
[data-layout=phone] .u-hover, .u-touch .u-hover { display: none; }

/* ---- minimap cluster ---- */
.u-mapc { position: absolute; right: 8px; top: 8px; width: 232px; height: 176px; }
.u-mm { position: absolute; right: 6px; top: 6px; width: 160px; height: 160px; border-radius: 50%; pointer-events: auto; cursor: pointer;
  background: radial-gradient(circle, #0c0906 60%, #000 100%);
  box-shadow: 0 0 0 3px #120c07, 0 0 0 5px #c9a24a, 0 0 0 6px #4a3810, 0 0 0 9px #241a12, 0 0 0 10px rgba(201,162,74,.45), 0 8px 20px rgba(0,0,0,.6); }
.u-mm canvas { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%; }
.u-mm::after { content: ''; position: absolute; inset: 0; border-radius: 50%; pointer-events: none; box-shadow: inset 0 0 14px rgba(0,0,0,.75), inset 0 0 2px rgba(0,0,0,.9); }
.u-compass { position: absolute; left: -12px; top: -8px; width: 38px; height: 38px; border-radius: 50%; pointer-events: auto; cursor: pointer; border: 0; padding: 0; z-index: 2;
  background: radial-gradient(circle at 40% 35%, #3a2b1f, #120c07); box-shadow: 0 0 0 2px #c9a24a, 0 0 0 3px #3a2a0a, 0 3px 8px rgba(0,0,0,.6); }
.u-compass .n { position: absolute; inset: 3px; transition: none; }
.u-compass .n::before { content: ''; position: absolute; left: 50%; top: 2px; width: 0; height: 0; transform: translateX(-50%); border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 14px solid #e0402a; filter: drop-shadow(0 0 1px #000); }
.u-compass .n::after { content: ''; position: absolute; left: 50%; bottom: 2px; width: 0; height: 0; transform: translateX(-50%); border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 14px solid #e8dcc0; filter: drop-shadow(0 0 1px #000); }
.u-compass .l { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font: 700 9px/1 var(--font-display); color: #ffe7a8; text-shadow: 0 0 2px #000, 0 0 2px #000; }
.u-mmbtn { position: absolute; width: 30px; height: 30px; border-radius: 50%; border: 0; padding: 0; pointer-events: auto; cursor: pointer; display: grid; place-items: center; color: #e8c770; z-index: 2;
  background: radial-gradient(circle at 40% 35%, #3a2b1f, #120c07); box-shadow: 0 0 0 2px #8a6d2e, 0 0 0 3px #000, 0 3px 8px rgba(0,0,0,.6); }
.u-mmbtn:hover { color: #fff3cf; box-shadow: 0 0 0 2px #c9a24a, 0 0 0 3px #000, 0 0 10px rgba(201,162,74,.5); }
.u-mmbtn svg { width: 17px; height: 17px; }
.u-mmbtn.map { left: -6px; bottom: -4px; }
.u-region { position: absolute; right: 36px; top: 154px; max-width: 124px; padding: 3px 9px 4px; border-radius: 9px; font: 700 10px/1 var(--font-display); color: #f3e2b0; letter-spacing: .06em; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; z-index: 2;
  background: linear-gradient(180deg, #3a2b1f, #1a120c); box-shadow: 0 0 0 1px #000, inset 0 0 0 1px rgba(201,162,74,.6), 0 2px 6px rgba(0,0,0,.5); transform: translateX(50%); right: 86px; }
.u-region:empty { display: none; }

/* ---- orbs ---- */
.u-orb { position: absolute; display: flex; align-items: center; pointer-events: auto; cursor: pointer; }
.u-orb .plate { min-width: 34px; height: 20px; padding: 0 6px 0 7px; margin-right: -5px; border-radius: 10px 0 0 10px; display: grid; place-items: center end;
  font: 700 13px/1 var(--font-mono); color: #4cd137; text-shadow: 1px 1px 0 #000;
  background: linear-gradient(180deg, #2a1f16, #120c07); box-shadow: inset 0 0 0 1px rgba(201,162,74,.45), 0 2px 6px rgba(0,0,0,.5); }
.u-orb .ball { position: relative; width: 36px; height: 36px; border-radius: 50%; overflow: hidden; background: #0a0705;
  box-shadow: 0 0 0 2px #c9a24a, 0 0 0 3px #2a1e08, 0 3px 8px rgba(0,0,0,.6); }
.u-orb .fill { position: absolute; left: 0; right: 0; bottom: 0; height: 100%; transition: height .35s var(--ease); }
.u-orb .ball::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle at 35% 28%, rgba(255,255,255,.45), rgba(255,255,255,0) 40%), radial-gradient(circle at 50% 80%, rgba(0,0,0,0), rgba(0,0,0,.35) 75%); pointer-events: none; }
.u-orb .ic { position: absolute; inset: 0; display: grid; place-items: center; color: rgba(255,255,255,.92); filter: drop-shadow(0 1px 1px #000); z-index: 1; }
.u-orb .ic svg { width: 18px; height: 18px; }
.u-orb.hp .fill { background: linear-gradient(180deg, #ff6a5a, #b0201a 70%, #6a0e08); }
.u-orb.run .fill { background: linear-gradient(180deg, #f2dc6a, #b89a1a 70%, #6a5408); }
.u-orb.run.off .fill { filter: saturate(.25) brightness(.6); }
.u-orb.run.off .ic { color: rgba(255,255,255,.45); }
.u-orb.credit .fill { background: linear-gradient(180deg, #7affd0, #1fa078 70%, #0a4a36); }
.u-orb.credit .plate { color: var(--chain); font-size: 12px; min-width: 52px; }
.u-orb:hover .ball { box-shadow: 0 0 0 2px #ffe08a, 0 0 0 3px #2a1e08, 0 0 12px rgba(255,224,138,.5); }
.u-orb.hp { right: 168px; top: 26px; } .u-orb.run { right: 172px; top: 72px; } .u-orb.credit { right: 162px; top: 118px; }
.u-orb.low .plate { color: #ff5a4a; } .u-orb.mid .plate { color: #ffd34d; }
.u-orb.pulse .ball { animation: u-orbpulse .6s var(--ease); }
@keyframes u-orbpulse { 50% { box-shadow: 0 0 0 2px #fff, 0 0 0 3px #2a1e08, 0 0 18px rgba(58,214,160,.9); } }

/* ---- phone ---- */
[data-layout=phone] .u-mapc { width: 226px; height: 128px; right: 6px; top: calc(6px + env(safe-area-inset-top, 0px)); }
[data-layout=phone] .u-mm { width: 112px; height: 112px; }
[data-layout=phone] .u-compass { width: 30px; height: 30px; left: auto; right: -8px; top: -6px; }
[data-layout=phone] .u-orb .ball { width: 30px; height: 30px; }
[data-layout=phone] .u-orb .plate { font-size: 11px; height: 17px; min-width: 28px; }
[data-layout=phone] .u-orb.credit .plate { min-width: 44px; font-size: 10.5px; }
[data-layout=phone] .u-orb.hp { right: 132px; top: 4px; } [data-layout=phone] .u-orb.run { right: 136px; top: 41px; } [data-layout=phone] .u-orb.credit { right: 132px; top: 78px; }
[data-layout=phone] .u-region { top: 108px; right: 62px; max-width: 104px; font-size: 9px; padding: 2px 7px 3px; }
[data-layout=phone] .u-mmbtn { width: 26px; height: 26px; }
`;

export function createHud(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-hud', CSS);
  const root = h('div.u-hud.off');
  U.roots.hud.append(root);

  const hover = h('div.u-hover', { 'aria-live': 'off' });
  const mapc = h('div.u-mapc');
  const mm = h('div.u-mm', { title: 'Click to walk there' });
  const compass = h('button.u-compass', { title: 'Face north', 'aria-label': 'Face north', html: '<div class="n"></div><div class="l">N</div>' });
  const mapBtn = h('button.u-mmbtn.map', { title: 'World map (M)', 'aria-label': 'World map', html: tabSvg('map') });
  const region = h('div.u-region');
  mm.append(compass, mapBtn);

  const orb = (cls, icon, title) => {
    const el = h('div.u-orb.' + cls, { 'data-interactive': '', title, role: 'button', tabindex: '0' });
    const plate = h('div.plate');
    const ball = h('div.ball');
    const fill = h('div.fill');
    ball.append(fill, h('div.ic', { html: tabSvg(icon) }));
    el.append(plate, ball);
    return { el, plate, fill };
  };
  const hp = orb('hp', 'heart', 'Hitpoints');
  const run = orb('run', 'run', 'Run energy: click to toggle run (R)');
  const credit = orb('credit', 'coin', 'Hood Wallet: CREDIT balance on Robinhood Chain (simulated)');
  mapc.append(hp.el, run.el, credit.el, mm, region);
  root.append(hover, mapc);

  run.el.addEventListener('click', () => { ctx.player?.toggleRun?.(); });
  credit.el.addEventListener('click', () => U.ui.openWallet());
  hp.el.addEventListener('click', () => U.side?.select('skills'));
  mapBtn.addEventListener('click', (e) => { e.stopPropagation(); U.ui.openWorldMap(); });
  compass.addEventListener('click', (e) => { e.stopPropagation(); U.hud.faceNorth(); });

  const last = { hp: -1, max: -1, run: -1, on: null, bal: null };
  let northAnim = null;

  const hud = {
    root, hover, mm, compass, region,
    show(v) { root.classList.toggle('off', !v); },
    faceNorth() {
      const rig = ctx.cameraRig;
      if (!rig) return;
      let from = rig.yaw % (Math.PI * 2);
      if (from > Math.PI) from -= Math.PI * 2;
      if (from < -Math.PI) from += Math.PI * 2;
      rig.yaw = from;
      northAnim = { from, t: 0 };
    },
    pulseCredit() { credit.el.classList.remove('pulse'); void credit.el.offsetWidth; credit.el.classList.add('pulse'); },
    setHover(html) { if (hover._h !== html) { hover._h = html; hover.innerHTML = html; } },
    update(dt) {
      if (northAnim && ctx.cameraRig) {
        northAnim.t = Math.min(1, northAnim.t + dt * 2.2);
        const k = 1 - Math.pow(1 - northAnim.t, 3);
        ctx.cameraRig.yaw = northAnim.from * (1 - k);
        if (northAnim.t >= 1) northAnim = null;
      }
      compass.firstChild.style.transform = `rotate(${(ctx.cameraRig?.yaw || 0)}rad)`;
      // Orbs (only touch the DOM when values change).
      const max = Math.max(1, safe(() => ctx.player.maxHp, 10));
      const cur = Math.max(0, safe(() => ctx.player.hp, state.save.hp));
      if (cur !== last.hp || max !== last.max) {
        last.hp = cur; last.max = max;
        hp.plate.textContent = String(Math.round(cur));
        hp.fill.style.height = `${Math.round((cur / max) * 100)}%`;
        const f = cur / max;
        hp.el.classList.toggle('low', f <= 0.25);
        hp.el.classList.toggle('mid', f > 0.25 && f <= 0.6);
        hp.el.title = `Hitpoints: ${cur} / ${max}`;
      }
      const r = state.save.run || { on: false, energy: 0 };
      const e = Math.floor(r.energy);
      if (e !== last.run || r.on !== last.on) {
        last.run = e; last.on = r.on;
        run.plate.textContent = String(e);
        run.fill.style.height = `${e}%`;
        run.el.classList.toggle('off', !r.on);
        run.el.classList.toggle('low', e <= 20);
        run.el.title = `Run energy: ${e}% (${r.on ? 'running' : 'walking'}) — click or press R to toggle`;
      }
      const bal = safe(() => ctx.wallet.balance, 0);
      if (bal !== last.bal) {
        if (last.bal !== null && bal > last.bal) hud.pulseCredit();
        last.bal = bal;
        credit.plate.textContent = formatCredit(bal);
        credit.fill.style.height = `${Math.min(100, 30 + Math.log10(1 + bal) * 14)}%`;
      }
    },
  };
  return hud;
}
