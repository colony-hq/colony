// Death screen: shown on player:death / mode 'dead'. Hidden when play resumes or you respawn.
// "Rise again" asks the combat module to respawn (fallback: back to Brightwater).
// Owner: ui builder.

import { injectStyle, h } from '../../core/dom.js';
import { RESPAWN } from '../../data/zones.js';
import { safe } from '../util.js';

const CSS = `
.u-death { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: auto; z-index: 30;
  background: radial-gradient(120% 90% at 50% 45%, rgba(40,0,0,.25), rgba(30,0,0,.78) 60%, rgba(0,0,0,.92)); animation: u-dfade 1.1s var(--ease) both; }
.u-death .in { text-align: center; padding: 0 20px; animation: u-drise 1.6s var(--ease) both .2s; }
.u-death h2 { margin: 0; font: 700 clamp(30px, 6vw, 58px)/1.05 var(--font-display); color: #e8c0a0; letter-spacing: .04em; text-shadow: 0 2px 0 #000, 0 0 30px rgba(192,57,43,.6); }
.u-death p { margin: 12px auto 22px; max-width: 460px; font: italic 17px/1.45 var(--font-body); color: #e8dcc0; text-shadow: 1px 1px 0 #000; }
.u-death .u-btn { font-size: 15px; padding: 10px 22px; }
.u-death small { display: block; margin-top: 14px; font: 12px var(--font-body); color: rgba(232,220,192,.6); }
@keyframes u-dfade { from { opacity: 0; } to { opacity: 1; } }
@keyframes u-drise { from { opacity: 0; transform: translateY(14px); letter-spacing: .3em; } to { opacity: 1; transform: none; } }
`;

const LINES = [
  'The Vale is not finished with you yet.',
  'Even the Hood loses a fight now and then.',
  'Somewhere, the Sheriff is laughing. Not for long.',
  'You wake to the smell of bread and the sound of the lake.',
];

export function createDeathScreen(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-death', CSS);
  let el = null;

  function show(payload = {}) {
    if (el) return;
    U.closeTransient();
    U.dialogue.closeDialogue();
    const fee = payload.fee ?? payload.medicFee;
    el = h('div.u-death', { 'data-interactive': '', role: 'alertdialog', 'aria-label': 'You have fallen' }, [h('div.in', {}, [
      h('h2', { text: 'You have fallen' }),
      h('p', { text: LINES[Math.floor(Math.random() * LINES.length)] }),
      h('button.u-btn.primary', { text: 'Rise again in Brightwater', onclick: rise }),
      h('small', { text: fee ? `The medics of Brightwater will charge a small fee (${(fee / 1000).toFixed(3)} CREDIT). You keep your items.` : 'You keep your items. The medics charge a small fee in CREDIT.' }),
    ])]);
    U.roots.windows.append(el);
  }
  function hide() { if (el) { el.remove(); el = null; } }
  function rise() {
    if (ctx.combat?.respawn) { safe(() => ctx.combat.respawn()); hide(); return; }
    if (state.mode === 'dead') {
      safe(() => ctx.player.teleport(Math.floor(RESPAWN.x), Math.floor(RESPAWN.z)));
      state.save.hp = safe(() => ctx.skills.level('hitpoints'), 10);
      state.setMode('play');
    }
    hide();
  }

  events.on('player:death', (p) => show(p || {}));
  events.on('player:respawn', (p) => {
    hide();
    if (p?.fee > 0) U.ui.toast(`The medics of Brightwater patched you up. Fee: ${(p.fee / 1000).toFixed(3)} CREDIT.`, { kind: 'chain' });
  });
  events.on('player:teleport', () => { if (el && state.mode !== 'dead') setTimeout(() => { if (state.mode !== 'dead') hide(); }, 2500); });
  events.on('mode:change', ({ mode }) => { if (mode === 'dead') show(); else if (mode === 'play' || mode === 'login') hide(); });
  return { show, hide, get open() { return !!el; } };
}
