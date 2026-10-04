// Inventory tab: 28 slots with procedurally drawn icons, drag to rearrange, left-click default
// option, right-click / long-press menu (options from ctx.game.itemOptions), shift-click drop,
// "Use" mode, and bank / shop modes (deposit / sell) while those windows are open.
// Owner: ui builder.

import { injectStyle, h } from '../../core/dom.js';
import { ITEMS } from '../../data/items.js';
import { cap, esc, qtyLabel, safe, onLongPress } from '../util.js';

const CSS = `
.u-inv { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 36px; gap: 1px 2px; }
.u-inv .u-slot { cursor: pointer; }
.u-inv .u-slot:hover { background: rgba(201,162,74,.10); }
.u-inv .u-slot.drag-src img { opacity: .35; }
.u-inv .u-slot.drop-on { background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.45); }
.u-ghost { position: absolute; width: 40px; height: 40px; margin: -20px 0 0 -20px; pointer-events: none; z-index: 20; filter: drop-shadow(0 4px 6px rgba(0,0,0,.6)); opacity: .9; }
@media (max-height: 640px) { [data-layout=desk] .u-invfoot { display: none; } }
.u-invfoot { display: flex; justify-content: space-between; margin-top: 4px; padding: 0 2px; font: 11px var(--font-body); color: var(--parch-dim); }
[data-layout=phone] .u-inv { grid-auto-rows: 46px; gap: 2px 4px; }
[data-layout=phone] .u-inv .u-slot { background: rgba(0,0,0,.14); }
[data-layout=phone] .u-inv .u-slot img { width: 44px; height: 44px; }
[data-layout=phone] .u-slot .q { font-size: 12px; left: 4px; top: 2px; }
`;

export const itemOrange = (name) => `<span style="color:#ff9f43">${esc(cap(String(name ?? '')))}</span>`;

// Fallback options when the game builder's ctx.game is missing.
function fallbackOptions(id) {
  const d = ITEMS[id];
  if (!d) return ['Examine'];
  const o = [];
  if (d.food) o.push('Eat');
  if (d.equip) o.push(['weapon', 'shield'].includes(d.equip.slot) ? 'Wield' : 'Wear');
  o.push('Use', 'Drop', 'Examine');
  return o;
}

export function createInventoryPanel(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-inv', CSS);
  const grids = new Set(); // every rendered grid (tab + bank/shop embeds)

  const slots = () => safe(() => ctx.inventory.slots, state.save.inventory) || [];
  const options = (i) => {
    const e = slots()[i];
    if (!e) return [];
    const o = safe(() => ctx.game?.itemOptions?.(i), null);
    return Array.isArray(o) && o.length ? o : fallbackOptions(e.id);
  };
  function act(i, option) {
    const e = slots()[i];
    if (!e) return;
    if (ctx.game?.useInventory) { safe(() => ctx.game.useInventory(i, option)); return; }
    // Fallbacks (game module missing).
    if (option === 'Examine') U.ui.message(ITEMS[e.id]?.examine || 'An item.');
    else if (option === 'Wield' || option === 'Wear') ctx.equipment?.equipFromInventory?.(i);
    else if (option === 'Drop') { const t = ctx.inventory.removeAt(i, Infinity); if (t) ctx.entities?.spawnItem?.(t.id, t.qty, ctx.player.x, ctx.player.z); }
    else U.ui.message('Nothing interesting happens.');
  }

  // Bank / shop mode helpers (set by those windows).
  function modeRows(i) {
    const e = slots()[i];
    const name = ITEMS[e.id]?.name || e.id;
    if (U.invMode === 'bank') {
      const q = U.bankUI?.qty?.() ?? 1;
      return [
        ...[1, 5, 10].map((n) => ({ label: `Deposit-${n}`, fn: () => U.bankUI.deposit(e.id, n) })),
        ...(typeof q === 'number' && ![1, 5, 10].includes(q) ? [{ label: `Deposit-${q}`, fn: () => U.bankUI.deposit(e.id, q) }] : []),
        { label: 'Deposit-X', fn: () => U.bankUI.depositX(e.id) },
        { label: 'Deposit-All', fn: () => U.bankUI.deposit(e.id, Infinity) },
        { label: 'Examine', fn: () => act(i, 'Examine') },
      ].map((r) => ({ html: `<span class="o">${r.label}</span> ${itemOrange(name)}`, onSelect: r.fn }));
    }
    if (U.invMode === 'shop') {
      return [
        { label: 'Value', fn: () => U.shopUI.valueSell(e.id) },
        ...[1, 5, 10, 50].map((n) => ({ label: `Sell ${n}`, fn: () => U.shopUI.sell(e.id, n) })),
        { label: 'Sell X', fn: () => U.shopUI.sellX(e.id) },
        { label: 'Examine', fn: () => act(i, 'Examine') },
      ].map((r) => ({ html: `<span class="o">${r.label}</span> ${itemOrange(name)}`, onSelect: r.fn }));
    }
    return null;
  }

  function primary(i, ev = {}) {
    const e = slots()[i];
    const sel = safe(() => ctx.game?.selected, null);
    if (U.world?.spell) { U.world.setSpell(null); }
    if (sel) {
      if (sel.index === i || !e) ctx.game.clearSelection();
      else ctx.game.useItemOn(sel.index, { kind: 'item', index: i });
      U.world?.refreshUseBar();
      return;
    }
    if (!e) return;
    if (U.invMode === 'bank') { U.bankUI.deposit(e.id, U.bankUI.qty()); return; }
    if (U.invMode === 'shop') { U.shopUI.sell(e.id, U.shopUI.qty()); return; }
    if (ev.shiftKey && state.settings.shiftDrop !== false) { act(i, 'Drop'); return; }
    const o = options(i);
    if (o[0]) act(i, o[0]);
  }

  function openMenu(i, x, y) {
    const e = slots()[i];
    if (!e) return;
    const name = ITEMS[e.id]?.name || e.id;
    const sel = safe(() => ctx.game?.selected, null);
    let rows;
    if (sel && sel.index !== i) {
      rows = [{ html: `<span class="o">Use</span> ${itemOrange(ITEMS[sel.id]?.name || sel.id)} <span class="o">-&gt;</span> ${itemOrange(name)}`, onSelect: () => { ctx.game.useItemOn(sel.index, { kind: 'item', index: i }); U.world?.refreshUseBar(); } }];
    } else {
      rows = modeRows(i) || options(i).map((o) => ({ html: `<span class="o">${esc(o)}</span> ${itemOrange(name)}`, onSelect: () => act(i, o) }));
    }
    rows.push({ html: '<span class="o">Cancel</span>', cancel: true, onSelect: () => {} });
    U.menu.open(x, y, rows);
  }

  function hoverHTML(i) {
    const e = slots()[i];
    if (!e) return null;
    const name = ITEMS[e.id]?.name || e.id;
    const sel = safe(() => ctx.game?.selected, null);
    if (sel && sel.index !== i) return `Use ${itemOrange(ITEMS[sel.id]?.name || sel.id)} -&gt; ${itemOrange(name)}`;
    if (U.invMode === 'bank') return `Deposit-${U.bankUI.qtyLabel()} ${itemOrange(name)}`;
    if (U.invMode === 'shop') return `Sell ${U.shopUI.qty()} ${itemOrange(name)}`;
    const o = options(i);
    const more = o.length - 1;
    return `${esc(o[0] || 'Examine')} ${itemOrange(name)}${more > 0 ? ` <span class="more">/ ${more} more option${more > 1 ? 's' : ''}</span>` : ''}`;
  }

  // ---- grid ----
  function buildGrid() {
    const grid = h('div.u-inv', { role: 'grid', 'aria-label': 'Inventory' });
    const cells = [];
    for (let i = 0; i < 28; i++) {
      const img = h('img', { alt: '', draggable: false });
      const q = h('span.q');
      const cell = h('div.u-slot', { 'data-i': String(i), role: 'gridcell' }, [img, q]);
      cell._img = img; cell._q = q; cell._key = null;
      wireSlot(cell, i, grid);
      cells.push(cell);
      grid.append(cell);
    }
    grid._cells = cells;
    grids.add(grid);
    paint(grid);
    return grid;
  }

  let drag = null; // { from, cell, x, y, started, ghost, pointerId }
  function wireSlot(cell, i, grid) {
    cell.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      U.tip.hide();
      drag = { from: i, cell, grid, x: e.clientX, y: e.clientY, started: false, ghost: null, pointerId: e.pointerId, shift: e.shiftKey, longFired: false };
      try { cell.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    cell.addEventListener('pointermove', (e) => {
      if (!drag || drag.cell !== cell) return;
      const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
      if (!drag.started && dist > 7 && slots()[i]) {
        drag.started = true;
        drag.ghost = h('img.u-ghost', { src: U.icons.itemIcon(slots()[i].id), alt: '' });
        U.roots.menus.append(drag.ghost);
        cell.classList.add('drag-src');
      }
      if (drag.started) {
        drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.u-inv .u-slot');
        for (const c of drag.grid._cells) c.classList.toggle('drop-on', c === over && c !== cell);
      }
    });
    const end = (e, cancelled) => {
      if (!drag || drag.cell !== cell) return;
      const d = drag; drag = null;
      cell.classList.remove('drag-src');
      for (const c of d.grid._cells) c.classList.remove('drop-on');
      if (d.ghost) d.ghost.remove();
      if (cancelled || d.longFired) return;
      if (d.started) {
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.u-inv .u-slot');
        const j = over ? +over.dataset.i : -1;
        if (j >= 0 && j !== i) { ctx.inventory?.swap?.(i, j); events.emit('ui:inv-swap', { a: i, b: j }); }
        return;
      }
      primary(i, { shiftKey: d.shift || e.shiftKey });
    };
    cell.addEventListener('pointerup', (e) => end(e, false));
    cell.addEventListener('pointercancel', (e) => end(e, true));
    cell.addEventListener('contextmenu', (e) => { e.preventDefault(); if (drag?.longFired) return; openMenu(i, e.clientX, e.clientY); });
    onLongPress(cell, (e) => { if (drag && !drag.started) { drag.longFired = true; } openMenu(i, e.clientX, e.clientY); });
    cell.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') U.world?.setUiHover(hoverHTML(i)); });
    cell.addEventListener('pointerleave', () => U.world?.setUiHover(null));
  }

  function paint(grid) {
    const s = slots();
    const sel = safe(() => ctx.game?.selected, null);
    for (let i = 0; i < 28; i++) {
      const cell = grid._cells[i];
      const e = s[i];
      const key = e ? e.id + ':' + e.qty : '';
      if (cell._key !== key) {
        cell._key = key;
        if (e) {
          cell._img.src = U.icons.itemIcon(e.id);
          cell._img.style.visibility = '';
          const def = ITEMS[e.id];
          if (def?.stack || e.qty > 1) { const l = qtyLabel(e.qty); cell._q.textContent = l.text; cell._q.className = 'q ' + l.cls; }
          else cell._q.textContent = '';
          cell.setAttribute('aria-label', `${def?.name || e.id}${e.qty > 1 ? ' x' + e.qty : ''}`);
        } else {
          cell._img.removeAttribute('src');
          cell._img.style.visibility = 'hidden';
          cell._q.textContent = '';
          cell.setAttribute('aria-label', 'Empty');
        }
      }
      cell.classList.toggle('sel', !!sel && sel.index === i);
    }
  }
  const repaintAll = () => { for (const g of grids) { if (!g.isConnected && g._tab !== true) { grids.delete(g); continue; } paint(g); } };
  events.on('inventory:change', repaintAll);
  events.on('save:loaded', repaintAll);
  events.on('item:select', repaintAll);

  let foot = null;
  const panel = {
    buildGrid, primary, openMenu, options, act,
    refreshSelection: repaintAll,
    refresh: repaintAll,
    tab: {
      id: 'inventory', title: 'Inventory', icon: 'inventory', order: 40, hotkey: 'I',
      render(el) {
        const g = buildGrid();
        g._tab = true;
        foot = h('div.u-invfoot');
        el.append(g, foot);
        panel.updateFoot();
      },
      onShow() { repaintAll(); panel.updateFoot(); },
    },
    updateFoot() {
      if (!foot) return;
      const free = safe(() => ctx.inventory.freeSlots(), 0);
      foot.innerHTML = `<span>${28 - free} / 28 slots</span><span>${U.layout === 'phone' ? 'Hold for options' : 'Shift-click drops'}</span>`;
    },
  };
  events.on('inventory:change', () => panel.updateFoot());
  return panel;
}
