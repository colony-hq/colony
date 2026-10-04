// Shop window: stock with prices in CREDIT, buy 1/5/10/50/X, value checks, selling from the pack
// while open (click = sell N, right-click = Value / Sell ...). Owner: ui builder.
// Uses ctx.shops: info, stock, priceBuy, priceSell, canSell, buy, sell, lastError (content).

import { injectStyle, h } from '../../core/dom.js';
import { ITEMS } from '../../data/items.js';
import { SHOPS } from '../../data/economy.js';
import { esc, formatCredit, qtyLabel, safe, onLongPress } from '../util.js';
import { promptValue } from '../widgets.js';
import { itemOrange } from '../panels/inventory.js';

const CSS = `
.u-shop .u-win-b { display: flex; flex-direction: column; gap: 8px; }
.u-ssub { display: flex; justify-content: space-between; gap: 8px; font: 12px/1.3 var(--font-body); color: var(--parch-dim); margin: 0; flex-wrap: wrap; }
.u-ssub b { font: 600 12px var(--font-mono); color: var(--chain); }
.u-sgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(58px, 1fr)); gap: 4px; padding: 6px; max-height: 330px; overflow-y: auto; align-content: start; }
.u-sitem { position: relative; height: 62px; border-radius: 5px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: rgba(0,0,0,.2); box-shadow: inset 0 0 0 1px rgba(201,162,74,.15); }
.u-sitem:hover { background: rgba(201,162,74,.16); box-shadow: inset 0 0 0 1px rgba(201,162,74,.6); }
.u-sitem img { width: 36px; height: 36px; }
.u-sitem .q { position: absolute; left: 3px; top: 1px; font: 600 11px var(--font-mono); color: #ffff00; text-shadow: 1px 1px 0 #000; }
.u-sitem .q.out { color: #ff6a5a; }
.u-sitem .p { font: 600 10px var(--font-mono); color: #9ff0d0; text-shadow: 1px 1px 0 #000; }
.u-sitem.sold { opacity: .45; }
.u-sfoot { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.u-sfoot .lbl { font: 600 12px var(--font-body); color: var(--parch-dim); }
.u-sfoot .hint { flex: 1; text-align: right; font: italic 12px var(--font-body); color: var(--parch-dim); }
.u-spack { display: none; }
[data-layout=phone] .u-spack { display: block; }
[data-layout=phone] .u-sgrid { max-height: min(220px, 30vh); }
[data-layout=phone] .u-sfoot .hint { display: none; }
.u-spack h4 { margin: 2px 0 4px; font: 700 11px var(--font-display); color: var(--brass); letter-spacing: .06em; }
`;

export function createShopWindow(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-shop', CSS);
  state.settings.uiShop = { qty: 1, x: 25, ...(state.settings.uiShop || {}) };
  const cfg = state.settings.uiShop;
  let shopId = null, grid = null, sub = null, qtyBtns = null;
  const S = () => ctx.shops || {};

  const curQty = () => (cfg.qty === 'x' ? cfg.x : cfg.qty);
  function stock() {
    const s = safe(() => S().stock?.(shopId), null);
    if (Array.isArray(s) && s.length) return s.map((e) => (Array.isArray(e) ? { id: e[0], qty: e[1] } : e));
    const d = SHOPS[shopId];
    return d ? d.stock.map(([id, qty]) => ({ id, qty, price: Math.round((ITEMS[id]?.value || 0) * d.sellMarkup) })) : [];
  }
  const priceBuy = (id, n = 1) => { const p = safe(() => S().priceBuy?.(shopId, id, n), null); return p > 0 ? p : Math.round((ITEMS[id]?.value || 0) * (SHOPS[shopId]?.sellMarkup || 1)) * n; };
  const priceSell = (id, n = 1) => { const p = safe(() => S().priceSell?.(shopId, id, n), null); return p ?? Math.floor((ITEMS[id]?.value || 0) * (SHOPS[shopId]?.buyRate || 0.4)) * n; };
  const why = () => safe(() => S().lastError, '') || '';

  function buy(id, n) {
    if (!S().buy) { U.ui.message('The shopkeeper is not trading right now.', 'warn'); return; }
    const got = safe(() => S().buy(shopId, id, n), 0);
    if (!got && why()) U.ui.message(why(), 'warn');
  }
  function sell(id, n) {
    if (!S().sell) { U.ui.message('The shopkeeper is not buying right now.', 'warn'); return; }
    const c = safe(() => S().canSell?.(shopId, id), { ok: true });
    if (c && c.ok === false) { U.ui.message(c.reason || "The shop won't buy that.", 'warn'); return; }
    n = Math.min(n, safe(() => ctx.inventory.count(id), 0));
    if (n <= 0) return;
    const got = safe(() => S().sell(shopId, id, n), 0);
    if (!got && why()) U.ui.message(why(), 'warn');
  }
  async function askX() {
    const v = await promptValue(U, { title: 'How many?', value: cfg.x, max: 10000 });
    if (v) { cfg.x = v; cfg.qty = 'x'; state.saveSettings(); paintQty(); }
    return v;
  }
  function valueBuy(id) {
    U.ui.message(`${ITEMS[id]?.name}: currently costs ${formatCredit(priceBuy(id, 1))} CREDIT.`);
  }
  function valueSell(id) {
    const c = safe(() => S().canSell?.(shopId, id), { ok: true });
    if (c && c.ok === false) { U.ui.message(c.reason || `The shop won't buy ${ITEMS[id]?.name.toLowerCase()}.`); return; }
    U.ui.message(`${ITEMS[id]?.name}: the shop will pay ${formatCredit(priceSell(id, 1))} CREDIT.`);
  }

  function menuFor(e, x, y) {
    const name = ITEMS[e.id]?.name || e.id;
    const rows = [{ label: 'Value', fn: () => valueBuy(e.id) }, ...[1, 5, 10, 50].map((n) => ({ label: `Buy ${n}`, fn: () => buy(e.id, n) }))];
    rows.push({ label: 'Buy X', fn: async () => { const v = await askX(); if (v) buy(e.id, v); } });
    rows.push({ label: 'Examine', fn: () => U.ui.message(ITEMS[e.id]?.examine || '') });
    U.menu.open(x, y, [...rows.map((r) => ({ html: `<span class="o">${r.label}</span> ${itemOrange(name)}`, onSelect: r.fn })), { html: '<span class="o">Cancel</span>', cancel: true }]);
  }

  function paint() {
    if (!grid) return;
    grid.innerHTML = '';
    for (const e of stock()) {
      const out = e.qty === 0;
      const l = Number.isFinite(e.qty) ? qtyLabel(e.qty) : { text: '', cls: '' };
      const price = e.price ?? priceBuy(e.id, 1);
      const cell = h('div.u-sitem' + (out ? '.sold' : ''), { 'aria-label': ITEMS[e.id]?.name }, [
        h('img', { src: U.icons.itemIcon(e.id), alt: '' }), h('span.q' + (out ? '.out' : ''), { text: l.text }), h('span.p', { text: formatCredit(price) }),
      ]);
      cell.addEventListener('click', () => buy(e.id, curQty()));
      cell.addEventListener('contextmenu', (ev) => { ev.preventDefault(); menuFor(e, ev.clientX, ev.clientY); });
      onLongPress(cell, (ev) => menuFor(e, ev.clientX, ev.clientY));
      cell.addEventListener('pointerenter', (ev) => { if (ev.pointerType !== 'touch') U.world.setUiHover(`Buy ${curQty()} ${itemOrange(ITEMS[e.id]?.name || e.id)}`); });
      cell.addEventListener('pointerleave', () => U.world.setUiHover(null));
      U.tip.attach(cell, () => `<b>${esc(ITEMS[e.id]?.name)}</b><br>Costs <b>${formatCredit(price)}</b> CREDIT each<br><span class="u-dim">${Number.isFinite(e.qty) ? `${e.qty} in stock` : 'Plenty in stock'}</span><br><span class="u-dim u-small">${esc(ITEMS[e.id]?.examine || '')}</span>`);
      grid.append(cell);
    }
    const bal = safe(() => ctx.wallet.balance, 0);
    const info = safe(() => S().info?.(shopId), null) || SHOPS[shopId] || {};
    sub.innerHTML = `<span>Buys ${info.buysAnything ? 'almost anything' : info.buysCategory ? `${info.buysCategory} and its own stock` : 'only its own stock'} at ${Math.round((info.buyRate || 0.4) * 100)}% of value</span><span>Wallet <b>${formatCredit(bal)}</b> CREDIT</span>`;
  }
  function paintQty() { if (!qtyBtns) return; for (const [v, b] of qtyBtns) b.classList.toggle('on', cfg.qty === v); }

  const shop = {
    open(id) {
      if (!SHOPS[id] && !safe(() => S().info?.(id), null)) { U.ui.message('That shop is closed.', 'warn'); return; }
      U.closeTransient({ except: 'shop' });
      shopId = id;
      U.invMode = 'shop';
      U.shopUI = { qty: curQty, sell, sellX: async (iid) => { const v = await askX(); if (v) sell(iid, v); }, valueSell };
      const info = safe(() => S().info?.(id), null) || SHOPS[id];
      U.windows.openWindow('shop', {
        title: info?.name || 'Shop', width: 500, className: 'u-shop', anchor: 'game', closeOnMove: true,
        onClose() { U.invMode = null; grid = null; shopId = null; U.world.setUiHover(null); U.inventory.refresh(); },
        render(body) {
          sub = h('div.u-ssub');
          grid = h('div.u-sgrid.u-inset');
          const qty = h('div.u-qty');
          qtyBtns = [[1, '1'], [5, '5'], [10, '10'], [50, '50'], ['x', 'X']].map(([v, t]) => {
            const b = h('button', { text: t });
            b.addEventListener('click', async () => { if (v === 'x') await askX(); else { cfg.qty = v; state.saveSettings(); paintQty(); } });
            qty.append(b);
            return [v, b];
          });
          const foot = h('div.u-sfoot', {}, [h('span.lbl', { text: 'Buy / sell' }), qty, h('span.hint', { text: 'Click your pack to sell · right-click to check value' })]);
          const pack = h('div.u-spack', {}, [h('h4', { text: 'Your pack — tap to sell' }), U.inventory.buildGrid()]);
          body.append(sub, grid, foot, pack);
          paintQty();
          paint();
        },
      });
      if (U.layout !== 'phone') U.side.select('inventory');
      U.inventory.refresh();
    },
    paint,
  };
  for (const ev of ['shop:change', 'wallet:change', 'inventory:change']) events.on(ev, () => { if (grid) paint(); });
  return shop;
}
