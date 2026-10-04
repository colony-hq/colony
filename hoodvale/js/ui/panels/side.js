// Side panel: tab registry + layout. Desktop: RuneScape-style stack bottom-right with two rows
// of tab buttons around the content. Phone: a bottom tab bar; the content opens as a sheet.
// Tabs: { id, title, icon, order, hotkey?, render(el), onShow?(el), onHide?(el) }.
// Owner: ui builder.

import { injectStyle, h } from '../../core/dom.js';
import { iconHTML } from '../icons.js';

const CSS = `
.u-side { position: absolute; right: 8px; bottom: 8px; width: 250px; pointer-events: auto; padding: 6px; box-sizing: border-box; display: flex; flex-direction: column; }
.u-tabrow { display: flex; justify-content: center; gap: 3px; }
.u-tabrow .u-tab { flex: 0 0 calc((100% - (var(--n, 5) - 1) * 3px) / var(--n, 5)); }
.u-tabrow.top { margin-bottom: 5px; } .u-tabrow.bot { margin-top: 5px; }
.u-tab { position: relative; height: 34px; border: 0; padding: 0; cursor: pointer; display: grid; place-items: center; color: #bf9f5c;
  background: linear-gradient(180deg, #3b2c20, #261c14); border-radius: 6px;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,220,160,.09), 0 1px 0 rgba(255,220,160,.05); transition: color .12s, background .12s; }
.u-tab:hover { color: #ffe7a8; background: linear-gradient(180deg, #4a3828, #2e2218); }
.u-tab.on { color: #ffe7a8; background: linear-gradient(180deg, #7a2f20, #4a1a10); box-shadow: inset 0 0 0 1px var(--brass), inset 0 1px 0 rgba(255,220,160,.25), 0 0 10px rgba(201,162,74,.3); }
.u-tab svg { width: 21px; height: 21px; filter: drop-shadow(0 1px 0 #000); }
.u-tab img { width: 24px; height: 24px; }
.u-tab .u-tabtxt { font: 700 14px/1 var(--font-display); }
.u-tab .dot { position: absolute; right: 4px; top: 4px; width: 7px; height: 7px; border-radius: 50%; background: #ff5a3a; box-shadow: 0 0 0 1px #000; display: none; }
.u-tab.alert .dot { display: block; }
.u-side-body { position: relative; height: 292px; overflow: hidden; }
.u-tabbody { position: absolute; inset: 0; padding: 6px; overflow: auto; display: none; scrollbar-width: thin; scrollbar-color: var(--brass-dim) transparent; }
.u-tabbody.on { display: block; }
.u-sheethead { display: none; }
.u-side.collapsed .u-side-body { display: none; }

/* phone: bottom bar + sheet */
.u-bar { display: none; }
[data-layout=phone] .u-bar { display: flex; position: absolute; left: 0; right: 0; bottom: 0; padding: 5px 4px calc(5px + env(safe-area-inset-bottom, 0px)); gap: 3px; pointer-events: auto; border-radius: 12px 12px 0 0; z-index: 3; }
[data-layout=phone] .u-bar .u-tab { flex: 1; height: 40px; min-width: 0; }
[data-layout=phone] .u-side { left: 0; right: 0; width: auto; bottom: calc(50px + env(safe-area-inset-bottom, 0px)); border-radius: 12px 12px 0 0; padding: 6px 8px 8px; z-index: 2; transform: translateY(0); transition: transform .18s var(--ease), opacity .18s; }
[data-layout=phone] .u-side.closed { transform: translateY(20px); opacity: 0; pointer-events: none; visibility: hidden; }
[data-layout=phone] .u-side .u-tabrow { display: none; }
[data-layout=phone] .u-side-body { height: min(392px, 54vh); }
[data-layout=phone] .u-sheethead { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 6px; }
[data-layout=phone] .u-sheethead .u-title { font-size: 15px; }
[data-layout=phone] .u-sheethead button { border: 0; background: none; color: var(--parch-dim); font: 600 13px var(--font-body); padding: 4px 8px; cursor: pointer; }

/* compact desk (short windows) */
@media (max-height: 640px) { [data-layout=desk] .u-side-body { height: 270px; } [data-layout=desk] .u-side .u-tab { height: 29px; } [data-layout=desk] .u-side { padding: 5px; } [data-layout=desk] .u-tabrow.top { margin-bottom: 4px; } [data-layout=desk] .u-tabrow.bot { margin-top: 4px; } }
`;

export function createSide(U) {
  const { events } = U;
  injectStyle('ui-side', CSS);
  const el = h('div.u-side.u-frame', { 'data-interactive': '' });
  const sheetTitle = h('div.u-title');
  const sheetClose = h('button', { text: 'Close', 'aria-label': 'Close panel' });
  const sheetHead = h('div.u-sheethead', {}, [sheetTitle, sheetClose]);
  const top = h('div.u-tabrow.top');
  const body = h('div.u-side-body.u-inset');
  const bot = h('div.u-tabrow.bot');
  el.append(sheetHead, top, body, bot);
  const bar = h('div.u-bar.u-frame', { 'data-interactive': '' });
  U.hud.root.append(el, bar);

  const tabs = [];
  let current = null;
  let sheetOpen = false;
  const extraBar = [];

  sheetClose.addEventListener('click', () => side.closeSheet());

  function layoutButtons() {
    tabs.sort((a, b) => a.order - b.order);
    top.innerHTML = ''; bot.innerHTML = ''; bar.innerHTML = '';
    const n = tabs.length;
    const perRow = Math.ceil(n / 2);
    top.style.setProperty('--n', perRow); bot.style.setProperty('--n', perRow);
    tabs.forEach((t, i) => (i < perRow ? top : bot).append(t.btn));
    for (const t of tabs) bar.append(t.barBtn);
    for (const b of extraBar) bar.append(b);
  }

  function makeBtn(t) {
    const b = h('button.u-tab', { html: iconHTML(t.icon) + '<i class="dot"></i>', 'aria-label': t.title });
    U.tip.attach(b, () => `<b>${t.title}</b>${t.hotkey ? ` <span class="u-dim">(${t.hotkey})</span>` : ''}`);
    return b;
  }

  const side = {
    el, bar,
    get current() { return current; },
    get tabs() { return tabs; },
    has(id) { return tabs.some((t) => t.id === id); },
    register(spec) {
      if (!spec || !spec.id) return null;
      const old = tabs.findIndex((t) => t.id === spec.id);
      if (old >= 0) { tabs[old].body.remove(); tabs.splice(old, 1); }
      const t = { order: 70 + tabs.length, title: spec.id, ...spec, rendered: false };
      t.body = h('div.u-tabbody', { 'data-tab': t.id });
      t.btn = makeBtn(t);
      t.barBtn = makeBtn(t);
      t.btn.addEventListener('click', () => side.select(t.id, { toggle: true }));
      t.barBtn.addEventListener('click', () => side.select(t.id, { toggle: true }));
      body.append(t.body);
      tabs.push(t);
      layoutButtons();
      if (!current && t.id === 'inventory') side.select('inventory', { silent: true });
      if (current === t.id) { current = null; side.select(t.id, { silent: true }); }
      return t;
    },
    addBarButton(btn) { extraBar.push(btn); layoutButtons(); },
    select(id, { toggle = false, silent = false } = {}) {
      const t = tabs.find((x) => x.id === id);
      if (!t) return false;
      if (U.layout === 'phone') {
        if (toggle && current === id && sheetOpen) { side.closeSheet(); return true; }
        if (!silent) side.openSheet();
      } else if (toggle && current === id) {
        el.classList.toggle('collapsed');
        return true;
      } else el.classList.remove('collapsed');
      if (current !== id) {
        const prev = tabs.find((x) => x.id === current);
        if (prev) { prev.body.classList.remove('on'); prev.btn.classList.remove('on'); prev.barBtn.classList.remove('on'); try { prev.onHide?.(prev.body); } catch (err) { console.error(err); } }
        current = id;
      }
      t.body.classList.add('on'); t.btn.classList.add('on'); t.barBtn.classList.toggle('on', U.layout !== 'phone' || sheetOpen);
      t.btn.classList.remove('alert'); t.barBtn.classList.remove('alert');
      sheetTitle.textContent = t.title;
      if (!t.rendered) {
        t.rendered = true;
        try { t.render?.(t.body); } catch (err) { console.error('[ui] tab render failed', id, err); t.body.textContent = 'This tab failed to load.'; }
      }
      try { t.onShow?.(t.body); } catch (err) { console.error('[ui] tab onShow', id, err); }
      events.emit('ui:tab', { id });
      return true;
    },
    alert(id, on = true) { const t = tabs.find((x) => x.id === id); if (t && current !== id) { t.btn.classList.toggle('alert', on); t.barBtn.classList.toggle('alert', on); } },
    cycle(dir = 1) {
      if (!tabs.length) return;
      const i = tabs.findIndex((t) => t.id === current);
      side.select(tabs[(i + dir + tabs.length) % tabs.length].id);
    },
    openSheet() {
      sheetOpen = true; el.classList.remove('closed');
      const t = tabs.find((x) => x.id === current); if (t) t.barBtn.classList.add('on');
      U.chat?.closeSheet?.();
      events.emit('ui:sheet', { open: true });
    },
    closeSheet() {
      sheetOpen = false; el.classList.add('closed');
      for (const t of tabs) t.barBtn.classList.remove('on');
      events.emit('ui:sheet', { open: false });
    },
    get sheetOpen() { return sheetOpen; },
    applyLayout() {
      if (U.layout === 'phone') { if (!sheetOpen) el.classList.add('closed'); el.classList.remove('collapsed'); }
      else { el.classList.remove('closed'); for (const t of tabs) t.barBtn.classList.remove('on'); }
    },
    isVisible(id) { return current === id && (U.layout !== 'phone' ? !el.classList.contains('collapsed') : sheetOpen); },
  };
  return side;
}
