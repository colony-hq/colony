// Make-X picker: ui.openMake({ title, skill?, items: [{ id, label?, disabled?, reason?, max? }] })
// -> Promise<{ id, qty } | null>. Quantity 1 / 5 / 10 / X / All (All = Infinity). Keys: Space
// makes the first available item, 1-9 pick by position. Owner: ui builder.

import { injectStyle, h } from '../../core/dom.js';
import { ITEMS } from '../../data/items.js';
import { skillIcon } from '../icons.js';
import { cap, esc, safe } from '../util.js';
import { promptValue } from '../widgets.js';

const CSS = `
.u-make .u-win-b { display: flex; flex-direction: column; gap: 10px; }
.u-mitems { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; max-height: 330px; overflow-y: auto; padding: 2px; }
.u-mitem { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px 7px; border: 0; border-radius: 7px; cursor: pointer; color: var(--parch);
  background: linear-gradient(180deg, #3b2c20, #261c14); box-shadow: inset 0 0 0 1px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,220,160,.08); font: 600 12.5px/1.2 var(--font-body); }
.u-mitem:hover:not([disabled]) { background: linear-gradient(180deg, #4e3a28, #2e2218); box-shadow: inset 0 0 0 1px var(--brass), 0 0 10px rgba(201,162,74,.25); }
.u-mitem img { width: 46px; height: 46px; }
.u-mitem .k { position: absolute; left: 6px; top: 4px; font: 700 10px var(--font-mono); color: #8a7a60; }
.u-mitem .mx { font: 600 10px var(--font-mono); color: #9fe0a0; }
.u-mitem[disabled] { cursor: default; opacity: .5; }
.u-mitem[disabled] img { filter: grayscale(.8) brightness(.7); }
.u-mitem[disabled] .mx { color: #ff8a7a; }
.u-mfoot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.u-mfoot .lbl { font: 600 12px var(--font-body); color: var(--parch-dim); }
.u-mfoot .hint { flex: 1; text-align: right; font: italic 12px var(--font-body); color: var(--parch-dim); }
[data-layout=phone] .u-mfoot .hint { display: none; }
`;

export function createMakeWindow(U) {
  const { state } = U;
  injectStyle('ui-make', CSS);
  state.settings.uiMake = { qty: 'all', x: 14, ...(state.settings.uiMake || {}) };
  const cfg = state.settings.uiMake;
  let active = null; // { resolve, items }

  const curQty = () => (cfg.qty === 'all' ? Infinity : cfg.qty === 'x' ? cfg.x : cfg.qty);

  const make = {
    get open() { return !!active; },
    openMake({ title = 'What would you like to make?', skill = null, items = [] } = {}) {
      if (active) { const a = active; active = null; a.resolve(null); }
      return new Promise((resolve) => {
        let done = false;
        const finish = (v) => {
          if (done) return; done = true;
          active = null;
          U.windows.closeWindow('make', { silent: true });
          resolve(v);
        };
        active = { resolve: finish, items };
        U.windows.openWindow('make', {
          title, icon: skill ? skillIcon(skill) : null, width: Math.min(560, 160 + Math.max(3, Math.min(5, items.length)) * 102), className: 'u-make', anchor: 'game', closeOnMove: true,
          onClose: () => finish(null),
          render(body) {
            const grid = h('div.u-mitems');
            items.forEach((it, i) => {
              const name = cap(it.label || ITEMS[it.id]?.name || it.id);
              const b = h('button.u-mitem', { disabled: !!it.disabled, 'aria-label': name }, [
                i < 9 ? h('span.k', { text: String(i + 1) }) : null,
                h('img', { src: U.icons.itemIcon(it.id), alt: '' }),
                h('span', { text: name }),
                it.disabled ? h('span.mx', { text: it.reason ? 'Locked' : 'Missing' }) : it.max != null && Number.isFinite(it.max) ? h('span.mx', { text: `can make ${it.max}` }) : null,
              ]);
              if (it.reason || it.disabled) U.tip.attach(b, () => `<b>${esc(name)}</b><br>${esc(it.reason || 'You are missing materials.')}`);
              b.addEventListener('click', () => { if (!it.disabled) finish({ id: it.id, qty: curQty() }); });
              grid.append(b);
            });
            const qty = h('div.u-qty');
            const btns = [[1, '1'], [5, '5'], [10, '10'], ['x', 'X'], ['all', 'All']].map(([v, t]) => {
              const b = h('button', { text: v === 'x' && cfg.qty === 'x' ? String(cfg.x) : t });
              b.addEventListener('click', async () => {
                if (v === 'x') { const n = await promptValue(U, { title: 'How many?', value: cfg.x, max: 10000 }); if (!n) return; cfg.x = n; b.textContent = String(n); }
                cfg.qty = v; state.saveSettings(); paint();
              });
              qty.append(b);
              return [v, b];
            });
            const paint = () => { for (const [v, b] of btns) b.classList.toggle('on', cfg.qty === v); };
            paint();
            body.append(grid, h('div.u-mfoot', {}, [h('span.lbl', { text: 'Quantity' }), qty, h('span.hint', { text: 'Space makes the first · 1–9 to pick' })]));
          },
        });
      });
    },
    key(code) {
      if (!active) return false;
      const items = active.items;
      if (code === 'Space') { const it = items.find((x) => !x.disabled); if (it) active.resolve({ id: it.id, qty: curQty() }); return true; }
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
      if (m) { const it = items[+m[1] - 1]; if (it && !it.disabled) active.resolve({ id: it.id, qty: curQty() }); return true; }
      return false;
    },
    close() { if (active) active.resolve(null); },
  };
  return make;
}
