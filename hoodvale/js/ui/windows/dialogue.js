// Dialogue box: chat-head portrait, speaker name, typewriter text (click / Space to finish and
// continue), numbered options (keys 1-6). ui.dialogue(...) -> Promise<index | null>; dismissed
// (closeDialogue, Esc, walking away) resolves -1, which content treats as "conversation closed".
// The box stays up briefly between frames so chained lines don't flicker. Owner: ui builder.

import { injectStyle, h } from '../../core/dom.js';
import { NPCS } from '../../data/npcs.js';
import { portraitURL } from '../portrait.js';
import { esc } from '../util.js';

const CSS = `
.u-dlg { position: absolute; left: 8px; bottom: 8px; width: min(560px, calc(100vw - 284px)); min-height: 156px; box-sizing: border-box; padding: 14px 16px 12px 128px; pointer-events: auto; cursor: pointer;
  display: flex; flex-direction: column; animation: u-dlgin .16s var(--ease); z-index: 3; }
.u-dlg.player { padding: 14px 128px 12px 16px; }
.u-dlg.narr { padding: 16px 20px 12px; }
.u-dlg .por { position: absolute; left: 16px; top: 50%; width: 96px; height: 96px; margin-top: -54px; border-radius: 50%;
  box-shadow: 0 0 0 3px #c9a24a, 0 0 0 4px #3a2a0a, 0 4px 10px rgba(0,0,0,.45); background-size: cover; }
.u-dlg.player .por { left: auto; right: 16px; transform: scaleX(-1); }
.u-dlg.narr .por { display: none; }
.u-dlg .nm { font: 700 16px/1.1 var(--font-display); color: #7a1f17; letter-spacing: .03em; margin-bottom: 2px; }
.u-dlg .role { font: italic 12px var(--font-body); color: #7a6040; margin-left: 6px; letter-spacing: 0; }
.u-dlg.player .nm { color: #1f4a6a; text-align: right; }
.u-dlg .tx { font: 16px/1.42 var(--font-body); color: #24180e; white-space: pre-line; min-height: 46px; user-select: text; -webkit-user-select: text; }
.u-dlg.narr .tx { font-style: italic; text-align: center; }
.u-dlg.player .tx { text-align: right; }
.u-dlg .opts { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
.u-dlg .opts button { display: flex; gap: 8px; align-items: baseline; text-align: left; padding: 5px 10px; border: 0; border-radius: 4px; background: rgba(122,84,34,.08); color: #1f1208; font: 600 15px/1.3 var(--font-body); cursor: pointer; }
.u-dlg .opts button:hover, .u-dlg .opts button:focus-visible { background: rgba(122,84,34,.22); color: #000; outline: none; }
.u-dlg .opts button b { color: #8a5a10; font: 700 13px var(--font-mono); min-width: 14px; }
.u-dlg .cont { margin-top: auto; padding-top: 6px; text-align: right; font: 600 12.5px var(--font-body); color: #1f4a8a; letter-spacing: .02em; animation: u-blink 1.2s infinite; }
.u-dlg.player .cont { text-align: left; }
.u-dlg.typing .cont { visibility: hidden; }
@keyframes u-blink { 50% { opacity: .35; } }
@keyframes u-dlgin { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
[data-layout=phone] .u-dlg { left: 0; right: 0; width: auto; bottom: calc(50px + env(safe-area-inset-bottom, 0px)); border-radius: 12px 12px 0 0; padding: 12px 12px 10px 90px; min-height: 140px; }
[data-layout=phone] .u-dlg.player { padding: 12px 90px 10px 12px; }
[data-layout=phone] .u-dlg.narr { padding: 14px 14px 10px; }
[data-layout=phone] .u-dlg .por { width: 64px; height: 64px; left: 12px; top: 16px; margin-top: 0; }
[data-layout=phone] .u-dlg.player .por { right: 12px; }
[data-layout=phone] .u-dlg .tx { font-size: 15px; }
[data-layout=phone] .u-dlg .opts button { padding: 9px 10px; }
`;

export function createDialogueBox(U) {
  const { events, state } = U;
  injectStyle('ui-dlg', CSS);
  let el = null, pending = null, typer = null, full = '', shown = 0, closeTimer = null, optsEl = null;
  let current = null;

  function ensure() {
    if (el) return el;
    el = h('div.u-dlg.u-parch', { 'data-interactive': '', role: 'dialog', 'aria-live': 'polite' });
    el.addEventListener('click', (e) => {
      if (e.target.closest('.opts button')) return;
      advance();
    });
    U.roots.windows.append(el);
    return el;
  }
  function finishTyping() {
    if (!typer) return;
    clearInterval(typer); typer = null;
    shown = full.length;
    el.querySelector('.tx').textContent = full;
    el.classList.remove('typing');
    if (optsEl) optsEl.style.visibility = '';
  }
  function advance() {
    if (!pending) return;
    if (typer) { finishTyping(); return; }
    if (current?.options?.length) return;
    resolve(null);
  }
  function resolve(v) {
    const p = pending;
    pending = null;
    if (!p) return;
    clearTimeout(closeTimer);
    // Hold the box a moment: the next line usually follows immediately.
    closeTimer = setTimeout(() => box.closeDialogue({ silent: true }), v === -1 ? 0 : 160);
    p(v);
  }

  const box = {
    get open() { return !!el; },
    get waiting() { return !!pending; },
    dialogue({ speaker = {}, text = '', options } = {}) {
      return new Promise((res) => {
        if (pending) { const p = pending; pending = null; p(-1); }
        clearTimeout(closeTimer);
        ensure();
        current = { speaker, text, options };
        const kind = speaker.kind === 'player' ? 'player' : speaker.kind === 'narration' || (!speaker.name && !speaker.npcId) ? 'narr' : speaker.kind === 'oracle' ? 'oracle' : 'npc';
        el.className = 'u-dlg u-parch' + (kind === 'player' ? ' player' : kind === 'narr' ? ' narr' : '');
        const look = speaker.look || (speaker.npcId && NPCS[speaker.npcId]?.look) || (kind === 'player' ? state.save.look : null) || {};
        const role = speaker.role || (speaker.npcId && NPCS[speaker.npcId]?.role) || '';
        el.innerHTML = '';
        const por = h('div.por');
        if (kind !== 'narr') por.style.backgroundImage = `url(${portraitURL(look, kind === 'oracle' || look.body === 'oracle' ? 'oracle' : 'npc')})`;
        el.append(por);
        if (kind !== 'narr') el.append(h('div.nm', { html: esc(speaker.name || '') + (role && kind !== 'player' ? `<span class="role">${esc(role)}</span>` : '') }));
        const tx = h('div.tx');
        el.append(tx);
        full = String(typeof text === 'function' ? text() : text || '');
        shown = 0;
        optsEl = null;
        if (options?.length) {
          optsEl = h('div.opts', { role: 'listbox' });
          options.forEach((o, i) => {
            const b = h('button', { html: `<b>${i + 1}.</b><span>${esc(o)}</span>` });
            b.addEventListener('click', (e) => { e.stopPropagation(); box.choose(i); });
            optsEl.append(b);
          });
          el.append(optsEl);
          optsEl.style.visibility = 'hidden';
        } else el.append(h('div.cont', { text: U.layout === 'phone' ? 'Tap to continue' : 'Click here to continue' }));
        pending = res;
        // Typewriter
        el.classList.add('typing');
        const cps = 70;
        const t0 = performance.now();
        typer = setInterval(() => {
          const n = Math.min(full.length, Math.floor(((performance.now() - t0) / 1000) * cps) + 1);
          if (n !== shown) { shown = n; tx.textContent = full.slice(0, n); }
          if (n >= full.length) finishTyping();
        }, 16);
        if (!full) finishTyping();
        events.emit('ui:dialogue', { speaker, options: options?.length || 0 });
      });
    },
    choose(i) {
      if (!pending || !current?.options?.length) return false;
      if (i < 0 || i >= current.options.length) return false;
      finishTyping();
      resolve(i);
      return true;
    },
    key(code) {
      if (!el || !pending) return false;
      if (code === 'Space' || code === 'Enter') { advance(); return true; }
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
      if (m && current?.options?.length) return box.choose(+m[1] - 1);
      return false;
    },
    closeDialogue({ silent = false } = {}) {
      clearTimeout(closeTimer);
      if (typer) { clearInterval(typer); typer = null; }
      const wasPending = !!pending;
      if (pending) { const p = pending; pending = null; p(-1); }
      if (el) { el.remove(); el = null; }
      current = null;
      if (!silent) { events.emit('ui:dialogue-close', {}); if (wasPending) events.emit('dialogue:dismiss', {}); }
    },
  };
  return box;
}
