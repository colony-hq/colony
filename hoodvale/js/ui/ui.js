// BASELINE — owner: ui builder. Minimal working UI so every builder can play-test:
// login button, chat log, hover text, click-to-act, right-click menu, dialogue box, make-X picker.
// The ui builder replaces this file (and adds many more) but must keep the ctx.ui API below
// (DESIGN.md §8 UI API).

import { injectStyle, h } from '../core/dom.js';
import { ITEMS } from '../data/items.js';

export function createUI(ctx) {
  const { events, input, state } = ctx;
  injectStyle('ui-base', `
    .ub-log { position: absolute; left: 8px; bottom: 8px; width: min(460px, 70vw); max-height: 140px; overflow: hidden; display: flex; flex-direction: column-reverse; font: 13px/1.35 var(--font-body); }
    .ub-log div { text-shadow: 1px 1px 0 #000; color: #fff; }
    .ub-log .warn { color: #ff8a7a; } .ub-log .loot { color: #ffd34d; } .ub-log .quest { color: #8fe38f; } .ub-log .chain { color: var(--chain); }
    .ub-hover { position: absolute; left: 8px; top: 6px; font: 600 14px/1.2 var(--font-body); color: #fff; text-shadow: 1px 1px 0 #000; }
    .ub-menu { position: absolute; min-width: 180px; padding: 2px; font: 13px/1.2 var(--font-body); background: #5d5447; border: 1px solid #000; color: #fff; }
    .ub-menu .t { background: #000; color: #5d5447; padding: 3px 6px; font-weight: 700; }
    .ub-menu button { display: block; width: 100%; text-align: left; padding: 4px 6px; background: none; border: 0; color: #fff; font: inherit; cursor: pointer; }
    .ub-menu button:hover { color: #ffd34d; }
    .ub-dlg { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); width: min(560px, calc(100vw - 16px)); padding: 12px 16px; }
    .ub-dlg .n { font-weight: 700; color: #7a1f17; margin-bottom: 4px; }
    .ub-dlg button { display: block; margin-top: 6px; }
    .ub-login { position: absolute; left: 50%; top: 60%; transform: translateX(-50%); display: grid; gap: 10px; justify-items: center; }
  `);
  const hud = document.getElementById('hud');
  const windows = document.getElementById('windows');
  const log = h('div.ub-log');
  const hover = h('div.ub-hover');
  hud.append(log, hover);
  let menuEl = null;
  let dlgEl = null;

  const ui = {
    message(text, kind = 'game') {
      log.prepend(h('div', { class: kind, text }));
      while (log.children.length > 40) log.lastChild.remove();
    },
    dialogue({ speaker, text, options } = {}) {
      return new Promise((resolve) => {
        dlgEl?.remove();
        dlgEl = h('div.ub-dlg.hv-paper', { 'data-interactive': '' }, [
          h('div.n', { text: speaker?.name || '' }), h('div', { text: text || '' }),
          ...(options?.length ? options.map((o, i) => h('button.hv-btn', { text: `${i + 1}. ${o}`, onclick: () => { close(); resolve(i); } }))
            : [h('button.hv-btn', { text: 'Click to continue', onclick: () => { close(); resolve(null); } })]),
        ]);
        const close = () => { dlgEl?.remove(); dlgEl = null; };
        windows.append(dlgEl);
      });
    },
    closeDialogue() { dlgEl?.remove(); dlgEl = null; },
    openMake({ title, items } = {}) {
      return ui.dialogue({ speaker: { name: title || 'Make' }, options: items.map((it) => it.label || ITEMS[it.id]?.name || it.id) })
        .then((i) => (i == null ? null : { id: items[i].id, qty: 28 }));
    },
    openBank() { ui.message('[bank UI not built yet]'); },
    openShop(id) { ui.message(`[shop ${id} UI not built yet]`); },
    openWindow() {}, closeWindow() {},
    registerTab() {},
    toast(text) { ui.message(text); },
    update() {
      const hv = ctx.picking?.hover;
      const top = hv?.hits?.[0]?.entity;
      if (state.mode !== 'play' || menuEl) { hover.textContent = ''; return; }
      if (top) {
        const opts = top.options();
        hover.textContent = `${opts[0] || 'Examine'} ${top.name}${top.level ? ` (level-${top.level})` : ''}` + (opts.length > 1 ? ` / ${opts.length - 1} more options` : '');
      } else hover.textContent = hv?.tile ? 'Walk here' : '';
    },
  };

  events.on('chat:game', ({ text, kind }) => ui.message(text, kind));

  function closeMenu() { menuEl?.remove(); menuEl = null; }
  input.on('click', ({ x, y }) => {
    if (state.mode !== 'play') return;
    if (menuEl) { closeMenu(); return; }
    const r = ctx.picking.pick(input.pointer.ndcX, input.pointer.ndcY);
    const top = r.hits[0]?.entity;
    if (top) ctx.actions.perform(top, top.options()[0] || 'Examine');
    else if (r.tile) ctx.player.walkTo(r.tile.x, r.tile.z);
  });
  input.on('menu', ({ x, y }) => {
    if (state.mode !== 'play') return;
    closeMenu();
    const r = ctx.picking.pick(input.pointer.ndcX, input.pointer.ndcY);
    const rows = [];
    if (r.tile) rows.push(['Walk here', '', () => ctx.player.walkTo(r.tile.x, r.tile.z)]);
    for (const { entity } of r.hits) for (const o of entity.options()) rows.push([o, entity.name, () => ctx.actions.perform(entity, o)]);
    rows.push(['Cancel', '', () => {}]);
    menuEl = h('div.ub-menu', { 'data-interactive': '', style: { left: x + 'px', top: y + 'px' } }, [
      h('div.t', { text: 'Choose Option' }),
      ...rows.map(([o, n, fn]) => h('button', { text: n ? `${o} ${n}` : o, onclick: () => { closeMenu(); fn(); } })),
    ]);
    windows.append(menuEl);
  });

  // Minimal login.
  const login = h('div.ub-login', { 'data-interactive': '' }, [
    h('button.hv-btn.primary', { text: 'Play', onclick: () => {
      if (!state.loadLocal()) state.newCharacter('Adventurer');
      state.setMode('play');
      events.emit('game:start', {});
    } }),
  ]);
  document.getElementById('menus').append(login);
  events.on('mode:change', ({ mode }) => { login.hidden = mode !== 'login'; });
  return ui;
}
