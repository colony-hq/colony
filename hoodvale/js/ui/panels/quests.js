// Quests tab: quest points + list coloured by status (red not started, yellow in progress,
// green done). Click opens the journal window. Owner: ui builder. Uses ctx.quests (content).

import { injectStyle, h } from '../../core/dom.js';
import { QUESTS, TOTAL_QUEST_POINTS } from '../../data/quests.js';
import { esc, safe } from '../util.js';

const CSS = `
.u-qp { display: flex; justify-content: space-between; align-items: center; padding: 4px 6px 8px; font: 600 12px var(--font-display); color: var(--brass); letter-spacing: .04em; border-bottom: 1px solid rgba(201,162,74,.25); margin-bottom: 4px; }
.u-qp b { font: 700 14px var(--font-mono); color: #ffe46a; }
.u-ql { list-style: none; margin: 0; padding: 0; }
.u-ql li { display: flex; align-items: center; gap: 8px; padding: 6px 6px; border-radius: 4px; cursor: pointer; font: 600 14px/1.2 var(--font-body); text-shadow: 1px 1px 0 #000; }
.u-ql li:hover { background: rgba(201,162,74,.12); }
.u-ql li .d { margin-left: auto; font: 600 10px var(--font-body); color: var(--parch-dim); letter-spacing: .04em; text-transform: uppercase; text-shadow: none; }
.u-ql li i { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; box-shadow: 0 0 0 1px #000; }
.u-ql .s-not { color: #ff6050; } .u-ql .s-not i { background: #c03020; }
.u-ql .s-prog { color: #ffe040; } .u-ql .s-prog i { background: #e0b020; box-shadow: 0 0 0 1px #000, 0 0 6px rgba(255,224,64,.6); }
.u-ql .s-done { color: #40e040; } .u-ql .s-done i { background: #30b030; }
.u-ql .lock { opacity: .75; }
.u-qtrack { margin-top: 8px; padding: 7px 8px; border-radius: 5px; font: 12.5px/1.35 var(--font-body); background: rgba(0,0,0,.25); box-shadow: inset 0 0 0 1px rgba(201,162,74,.22); color: var(--parch); }
.u-qtrack b { color: #ffe040; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; display: block; margin-bottom: 2px; }
`;

export function questStatus(ctx, id) {
  const s = safe(() => ctx.quests.status?.(id), null);
  if (s) return s;
  const st = ctx.state.save.quests?.[id];
  return st === 'done' ? 'done' : st == null ? 'not_started' : 'in_progress';
}

export function createQuestsPanel(U) {
  const { ctx, events } = U;
  injectStyle('ui-quests', CSS);
  let list = null, head = null, track = null;

  function paint() {
    if (!list) return;
    const pts = safe(() => ctx.quests.points(), null) ?? QUESTS.reduce((n, q) => n + (questStatus(ctx, q.id) === 'done' ? q.questPoints : 0), 0);
    head.innerHTML = `<span>Quest Points</span><b>${pts} / ${TOTAL_QUEST_POINTS}</b>`;
    list.innerHTML = '';
    for (const q of QUESTS) {
      const st = questStatus(ctx, q.id);
      const can = st !== 'not_started' || safe(() => ctx.quests.canStart?.(q.id)?.ok, true) !== false;
      const li = h('li', { class: { not_started: 's-not', in_progress: 's-prog', done: 's-done' }[st] + (can ? '' : ' lock'), role: 'button', tabindex: '0' }, [
        h('i'), h('span', { text: q.name }),
      ]);
      li.addEventListener('click', () => U.ui.openJournal(q.id));
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') U.ui.openJournal(q.id); });
      U.tip.attach(li, () => `<b>${esc(q.name)}</b><br>${esc(q.summary)}<br><span class="u-dim">${st === 'done' ? 'Completed' : st === 'in_progress' ? 'In progress' : can ? 'Not started' : 'Requirements not met'} · ${q.questPoints} QP</span>`);
      list.append(li);
    }
    const t = safe(() => ctx.quests.tracked?.(), null);
    track.style.display = t ? '' : 'none';
    if (t) track.innerHTML = `<b>${esc(t.name)}</b>${esc(t.text || '')}`;
  }
  for (const ev of ['quest:start', 'quest:update', 'quest:complete', 'save:loaded', 'level:up']) events.on(ev, () => { if (list) paint(); });

  return {
    paint,
    tab: {
      id: 'quests', title: 'Quest Journal', icon: 'quests', order: 30, hotkey: 'Q',
      render(el) {
        head = h('div.u-qp');
        list = h('ul.u-ql');
        track = h('div.u-qtrack');
        el.append(head, list, track);
        paint();
      },
      onShow: paint,
    },
  };
}

// ---------------------------------------------------------------------------- HUD tracker
// Small "current objective" plate under the hover text. Click opens the journal.
const TRACK_CSS = `
.u-track { position: absolute; left: 10px; top: 34px; max-width: min(340px, calc(100vw - 420px)); padding: 6px 10px 7px 10px; border-radius: 6px; pointer-events: auto; cursor: pointer;
  background: linear-gradient(180deg, rgba(36,26,18,.82), rgba(20,14,9,.78)); box-shadow: 0 0 0 1px rgba(0,0,0,.8), inset 0 0 0 1px rgba(201,162,74,.45), 0 4px 12px rgba(0,0,0,.35);
  font: 13px/1.35 var(--font-body); color: var(--parch); animation: u-trin .35s var(--ease); }
.u-track b { display: block; font: 700 10.5px/1.2 var(--font-display); color: #ffe040; letter-spacing: .06em; margin-bottom: 2px; }
.u-track:hover { box-shadow: 0 0 0 1px #000, inset 0 0 0 1px var(--brass), 0 4px 12px rgba(0,0,0,.35); }
.u-track.flash { animation: u-trflash .9s var(--ease); }
@keyframes u-trin { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@keyframes u-trflash { 30% { box-shadow: 0 0 0 1px #000, inset 0 0 0 1px #ffe040, 0 0 18px rgba(255,224,64,.55); } }
[data-layout=phone] .u-track { top: calc(8px + env(safe-area-inset-top, 0px)); left: 8px; max-width: calc(100vw - 250px); font-size: 12px; padding: 5px 8px; }
[data-layout=phone] .u-track b { font-size: 9.5px; }
`;
export function createQuestTracker(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-qtrack', TRACK_CSS);
  const el = h('div.u-track.u-hidden', { 'data-interactive': '', role: 'status', title: 'Open the quest journal' });
  U.hud.root.append(el);
  let id = null, last = '';
  el.addEventListener('click', () => { if (id) U.ui.openJournal(id); });
  function paint(flash = false) {
    const on = state.settings.questTracker !== false;
    let t = on ? safe(() => ctx.quests?.tracked?.(), null) : null;
    if (on && !t && safe(() => ctx.quests.points(), 1) === 0) {
      // Brand-new adventurer: point at the first quest's giver.
      const first = QUESTS[0];
      if (questStatus(ctx, first.id) === 'not_started') {
        const line = (safe(() => ctx.quests.journal(first.id), []) || []).find((l) => l.current)?.text;
        if (line) t = { id: first.id, name: first.name, text: line };
      }
    }
    id = t?.id || null;
    const html = t ? `<b>${esc(t.name)}</b>${esc(t.text || '')}` : '';
    el.classList.toggle('u-hidden', !t);
    if (html !== last) {
      last = html;
      el.innerHTML = html;
      if (flash && t) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    }
  }
  for (const ev of ['quest:start', 'quest:update', 'quest:complete', 'quest:hint']) events.on(ev, () => paint(true));
  for (const ev of ['game:start', 'save:loaded', 'settings:change']) events.on(ev, () => paint(false));
  let acc = 0;
  return { paint, update(dt) { acc += dt; if (acc > 2) { acc = 0; if (state.mode === 'play') paint(false); } } };
}
