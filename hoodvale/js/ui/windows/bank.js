// Bank window: category tabs, search, withdraw 1/5/10/X/All (click = current mode, right-click =
// all options), deposit inventory / equipment, inventory deposits while open. On phones the
// window embeds your pack. Owner: ui builder. Uses ctx.bank (deposit, withdraw, items).

import { injectStyle, h } from '../../core/dom.js';
import { ITEMS } from '../../data/items.js';
import { esc, formatCredit, qtyLabel, safe, onLongPress } from '../util.js';
import { promptValue } from '../widgets.js';
import { itemOrange } from '../panels/inventory.js';

const CATS = [
  ['all', 'All'], ['gear', 'Gear'], ['tools', 'Tools'], ['food', 'Food'], ['res', 'Materials'], ['arcana', 'Arcana'], ['quest', 'Quest'],
];
export function itemCategory(id) {
  const d = ITEMS[id];
  if (!d) return 'res';
  if (d.quest) return 'quest';
  if (d.sigil || id === 'orbium_shard' || d.equip?.style === 'staff') return 'arcana';
  if (d.tool) return 'tools';
  if (d.food || /^raw_|burnt|dough/.test(id)) return 'food';
  if (d.equip) return 'gear';
  return 'res';
}

const CSS = `
.u-bank .u-win-b { display: flex; flex-direction: column; gap: 8px; }
.u-bsub { font: 12px var(--font-body); color: var(--parch-dim); margin: -6px 0 0; }
.u-bsub b { color: #ffe46a; font: 600 12px var(--font-mono); }
.u-btop { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.u-bcats { display: flex; gap: 2px; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
.u-bcats button { flex: 0 0 auto; padding: 6px 9px; border: 0; border-radius: 5px 5px 2px 2px; font: 700 12px var(--font-body); color: #bf9f5c; cursor: pointer; background: linear-gradient(180deg, #3b2c20, #261c14); box-shadow: inset 0 0 0 1px rgba(0,0,0,.6); }
.u-bcats button.on { color: #ffe7a8; background: linear-gradient(180deg, #7a2f20, #4a1a10); box-shadow: inset 0 0 0 1px var(--brass); }
.u-btop input { width: 130px; }
.u-bgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(46px, 1fr)); grid-auto-rows: 42px; gap: 3px; padding: 6px; height: 300px; overflow-y: auto; align-content: start; }
.u-bgrid .u-slot { cursor: pointer; background: rgba(0,0,0,.18); }
.u-bgrid .u-slot:hover { background: rgba(201,162,74,.16); }
.u-bgrid .empty-msg { grid-column: 1 / -1; text-align: center; color: var(--parch-dim); font-style: italic; padding: 30px 0; }
.u-bfoot { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.u-bfoot .lbl { font: 600 12px var(--font-body); color: var(--parch-dim); }
.u-qty { display: inline-flex; border-radius: 5px; overflow: hidden; box-shadow: 0 0 0 1px #000; }
.u-qty button { border: 0; min-width: 34px; padding: 6px 6px; font: 700 12px var(--font-mono); color: var(--parch-dim); background: linear-gradient(180deg, #3b2c20, #261c14); cursor: pointer; }
.u-qty button + button { box-shadow: inset 1px 0 0 rgba(0,0,0,.6); }
.u-qty button.on { color: #fff3cf; background: linear-gradient(180deg, #7a5d22, #4a3812); }
.u-bfoot .sp { flex: 1; }
.u-bpack { display: none; }
[data-layout=phone] .u-bpack { display: block; }
[data-layout=phone] .u-bgrid { height: min(220px, 30vh); }
.u-bpack h4 { margin: 2px 0 4px; font: 700 11px var(--font-display); color: var(--brass); letter-spacing: .06em; }
`;

export function createBankWindow(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-bank', CSS);
  state.settings.uiBank = { qty: 1, x: 50, ...(state.settings.uiBank || {}) };
  const cfg = state.settings.uiBank;
  let cat = 'all', search = '', grid = null, sub = null, qtyBtns = null;

  const bankItems = () => safe(() => ctx.bank.items, state.save.bank) || [];
  const curQty = () => (cfg.qty === 'all' ? Infinity : cfg.qty === 'x' ? cfg.x : cfg.qty);

  function withdraw(id, n) {
    const have = bankItems().find((e) => e.id === id)?.qty || 0;
    n = Math.min(n, have);
    if (n <= 0) return;
    const got = safe(() => ctx.bank.withdraw(id, n), 0);
    if (!got && !safe(() => ctx.inventory.freeSlots(), 0)) U.ui.message("You don't have enough inventory space.", 'warn');
  }
  function deposit(id, n) {
    const have = safe(() => ctx.inventory.count(id), 0);
    n = Math.min(n, have);
    if (n <= 0) return;
    safe(() => ctx.bank.deposit(id, n));
  }
  async function askX() {
    const v = await promptValue(U, { title: 'Enter amount', value: cfg.x });
    if (v) { cfg.x = v; cfg.qty = 'x'; state.saveSettings(); paintQty(); }
    return v;
  }
  function depositInventory() {
    if (ctx.bank?.depositAll) { safe(() => ctx.bank.depositAll()); return; }
    for (const e of [...(ctx.inventory?.slots || [])]) if (e) deposit(e.id, Infinity);
  }
  function depositEquipment() {
    if (ctx.bank?.depositEquipment) { safe(() => ctx.bank.depositEquipment()); return; }
    const eq = safe(() => ctx.equipment.slots, {}) || {};
    let blocked = false;
    for (const slot of Object.keys(eq)) {
      const e = eq[slot];
      if (!e) continue;
      if (!ctx.equipment.unequip(slot)) { blocked = true; continue; }
      deposit(e.id, e.qty);
    }
    if (blocked) U.ui.message('Make some room in your pack first.', 'warn');
  }

  function menuFor(e, x, y) {
    const name = ITEMS[e.id]?.name || e.id;
    const rows = [1, 5, 10].map((n) => ({ label: `Withdraw-${n}`, fn: () => withdraw(e.id, n) }));
    if (cfg.qty === 'x') rows.push({ label: `Withdraw-${cfg.x}`, fn: () => withdraw(e.id, cfg.x) });
    rows.push({ label: 'Withdraw-X', fn: async () => { const v = await askX(); if (v) withdraw(e.id, v); } });
    rows.push({ label: 'Withdraw-All', fn: () => withdraw(e.id, Infinity) });
    rows.push({ label: 'Withdraw-All-but-1', fn: () => withdraw(e.id, Math.max(0, e.qty - 1)) });
    rows.push({ label: 'Examine', fn: () => U.ui.message(`${ITEMS[e.id]?.examine || ''}${e.qty > 1 ? ` (${e.qty.toLocaleString('en-US')})` : ''}`) });
    U.menu.open(x, y, [...rows.map((r) => ({ html: `<span class="o">${r.label}</span> ${itemOrange(name)}`, onSelect: r.fn })), { html: '<span class="o">Cancel</span>', cancel: true }]);
  }

  function paint() {
    if (!grid) return;
    const items = bankItems();
    const q = search.trim().toLowerCase();
    grid.innerHTML = '';
    let shown = 0, value = 0, count = 0;
    for (const e of items) {
      value += (ITEMS[e.id]?.value || 0) * e.qty; count++;
      if (cat !== 'all' && itemCategory(e.id) !== cat) continue;
      if (q && !(ITEMS[e.id]?.name || e.id).toLowerCase().includes(q)) continue;
      shown++;
      const l = qtyLabel(e.qty);
      const cell = h('div.u-slot', { 'aria-label': `${ITEMS[e.id]?.name} x${e.qty}` }, [h('img', { src: U.icons.itemIcon(e.id), alt: '' }), h('span.q' + (l.cls ? '.' + l.cls : ''), { text: l.text })]);
      cell.addEventListener('click', () => withdraw(e.id, curQty()));
      cell.addEventListener('contextmenu', (ev) => { ev.preventDefault(); menuFor(e, ev.clientX, ev.clientY); });
      onLongPress(cell, (ev) => menuFor(e, ev.clientX, ev.clientY));
      cell.addEventListener('pointerenter', (ev) => { if (ev.pointerType !== 'touch') U.world.setUiHover(`Withdraw-${qtyText()} ${itemOrange(ITEMS[e.id]?.name || e.id)}`); });
      cell.addEventListener('pointerleave', () => U.world.setUiHover(null));
      U.tip.attach(cell, () => `<b>${esc(ITEMS[e.id]?.name)}</b> ×${e.qty.toLocaleString('en-US')}<br><span class="u-dim">Value ${formatCredit((ITEMS[e.id]?.value || 0) * e.qty)} CREDIT</span>`);
      grid.append(cell);
    }
    if (!shown) grid.append(h('div.empty-msg', { text: items.length ? 'Nothing matches.' : 'Your bank is empty. Click items in your pack to deposit them.' }));
    sub.innerHTML = `${count} item${count === 1 ? '' : 's'} stored · worth <b>${formatCredit(value)}</b> CREDIT · on the Ledger`;
  }
  const qtyText = () => (cfg.qty === 'all' ? 'All' : cfg.qty === 'x' ? String(cfg.x) : String(cfg.qty));
  function paintQty() { if (!qtyBtns) return; for (const [v, b] of qtyBtns) b.classList.toggle('on', cfg.qty === v); }

  const bank = {
    open() {
      U.closeTransient({ except: 'bank' });
      U.invMode = 'bank';
      U.bankUI = { qty: curQty, qtyLabel: qtyText, deposit, depositX: async (id) => { const v = await askX(); if (v) deposit(id, v); } };
      U.windows.openWindow('bank', {
        title: 'The Ledger Bank', width: 520, className: 'u-bank', anchor: 'game', closeOnMove: true,
        onClose() { U.invMode = null; grid = null; U.world.setUiHover(null); U.inventory.refresh(); },
        render(body) {
          sub = h('div.u-bsub');
          const cats = h('div.u-bcats');
          for (const [id, label] of CATS) {
            const b = h('button' + (id === cat ? '.on' : ''), { text: label });
            b.addEventListener('click', () => { cat = id; for (const x of cats.children) x.classList.toggle('on', x === b); paint(); });
            cats.append(b);
          }
          const s = h('input', { type: 'search', placeholder: 'Search…', value: search, 'aria-label': 'Search bank' });
          s.addEventListener('input', () => { search = s.value; paint(); });
          s.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') s.blur(); });
          grid = h('div.u-bgrid.u-inset');
          const qty = h('div.u-qty');
          qtyBtns = [[1, '1'], [5, '5'], [10, '10'], ['x', 'X'], ['all', 'All']].map(([v, t]) => {
            const b = h('button', { text: t });
            b.addEventListener('click', async () => { if (v === 'x') { await askX(); } else { cfg.qty = v; state.saveSettings(); paintQty(); } });
            qty.append(b);
            return [v, b];
          });
          const foot = h('div.u-bfoot', {}, [
            h('span.lbl', { text: 'Withdraw' }), qty, h('span.sp'),
            h('button.u-btn.sm', { text: 'Deposit pack', title: 'Deposit your whole inventory', onclick: depositInventory }),
            h('button.u-btn.sm', { text: 'Deposit worn', title: 'Deposit your equipment', onclick: depositEquipment }),
          ]);
          const pack = h('div.u-bpack', {}, [h('h4', { text: 'Your pack — tap to deposit' }), U.inventory.buildGrid()]);
          body.append(sub, h('div.u-btop', {}, [cats, s]), grid, foot, pack);
          paintQty();
          paint();
        },
      });
      if (U.layout !== 'phone') U.side.select('inventory');
      U.inventory.refresh();
    },
    paint,
  };
  events.on('bank:change', () => paint());
  events.on('inventory:change', () => { if (grid) paint(); });
  return bank;
}
