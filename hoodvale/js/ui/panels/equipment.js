// Equipment tab: RuneScape-style paperdoll (11 slots) + equipment bonuses.
// Owner: ui builder. Uses ctx.game.equipmentOptions / useEquipment (fallback: equipment.unequip).

import { injectStyle, h } from '../../core/dom.js';
import { ITEMS } from '../../data/items.js';
import { esc, qtyLabel, safe, skillName, onLongPress } from '../util.js';
import { itemOrange } from './inventory.js';

const LAYOUT = [
  [null, 'head', null],
  ['cape', 'neck', 'ammo'],
  ['weapon', 'body', 'shield'],
  [null, 'legs', null],
  ['hands', 'feet', 'ring'],
];
const GHOST = { head: 'bronze_helm', cape: 'hood_cape', neck: 'sapphire_amulet', ammo: 'bronze_arrow', weapon: 'bronze_sword', body: 'bronze_chestplate', shield: 'bronze_kiteshield', legs: 'bronze_platelegs', hands: 'leather_gloves', feet: 'leather_boots', ring: 'ledger_ring' };
const SLOT_NAME = { head: 'Head', cape: 'Cape', neck: 'Neck', ammo: 'Ammunition', weapon: 'Weapon', body: 'Body', shield: 'Shield', legs: 'Legs', hands: 'Hands', feet: 'Feet', ring: 'Ring' };
export const BONUS_NAMES = { atk: 'Attack', str: 'Strength', def: 'Defence', rng: 'Archery', rstr: 'Ranged str.', mag: 'Arcana' };

const CSS = `
.u-doll { --rh: 40px; --rg: 6px; position: relative; display: grid; grid-template-columns: repeat(3, 44px); grid-auto-rows: var(--rh); gap: var(--rg) 14px; justify-content: center; margin: 2px 0 8px; }
.u-doll::before { content: ''; position: absolute; left: 50%; top: 20px; bottom: 20px; width: 3px; margin-left: -1.5px; background: linear-gradient(#5a4428, #3a2a18); box-shadow: 0 0 0 1px #000; z-index: 0; }
.u-doll .hl { position: absolute; left: 22px; right: 22px; height: 3px; background: linear-gradient(90deg, #3a2a18, #5a4428, #3a2a18); box-shadow: 0 0 0 1px #000; z-index: 0; }
.u-doll .u-slot { z-index: 1; width: 44px; height: 40px; cursor: pointer; background: radial-gradient(circle at 50% 40%, #3e2f22, #1c140e); box-shadow: inset 0 0 0 1px rgba(201,162,74,.45), 0 0 0 1px #000, 0 2px 4px rgba(0,0,0,.5); border-radius: 6px; }
.u-doll .u-slot:hover { box-shadow: inset 0 0 0 1px #ffe08a, 0 0 0 1px #000, 0 0 8px rgba(255,224,138,.35); }
.u-doll .u-slot img { width: 34px; height: 34px; }
.u-bonus { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 10px; padding: 6px 8px; font: 12px/1.35 var(--font-body); background: rgba(0,0,0,.2); border-radius: 5px; box-shadow: inset 0 0 0 1px rgba(201,162,74,.18); }
.u-bonus div { display: flex; justify-content: space-between; gap: 4px; color: var(--parch-dim); white-space: nowrap; font-size: 11.5px; }
.u-bonus b { font: 600 12px var(--font-mono); color: #efe2c4; } .u-bonus b.pos { color: #8fe38f; } .u-bonus b.neg { color: #ff8a7a; }
@media (max-height: 640px) { [data-layout=desk] .u-eqhead { display: none; } [data-layout=desk] .u-doll { --rh: 36px; --rg: 5px; margin-top: 4px; } [data-layout=desk] .u-doll .u-slot { height: 36px; } [data-layout=desk] .u-doll .u-slot img { width: 31px; height: 31px; } }
.u-eqhead { display: flex; justify-content: space-between; font: 600 11px var(--font-display); color: var(--brass); letter-spacing: .05em; margin: 0 2px 4px; }
`;

export function createEquipmentPanel(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-equip', CSS);
  const cells = {};
  let bonusEl = null, headEl = null;

  const eq = () => safe(() => ctx.equipment.slots, state.save.equipment) || {};
  const options = (slot) => {
    const o = safe(() => ctx.game?.equipmentOptions?.(slot), null);
    return Array.isArray(o) && o.length ? o : eq()[slot] ? ['Remove', 'Examine'] : [];
  };
  const act = (slot, o) => {
    if (ctx.game?.useEquipment) return ctx.game.useEquipment(slot, o);
    if (o === 'Remove') return ctx.equipment.unequip(slot);
    if (o === 'Examine') U.ui.message(ITEMS[eq()[slot]?.id]?.examine || '');
    return false;
  };

  function tipHTML(slot) {
    const e = eq()[slot];
    if (!e) return `<b>${SLOT_NAME[slot]}</b><br><span class="u-dim">Empty slot</span>`;
    const d = ITEMS[e.id];
    const b = d?.equip?.bonus || {};
    const lines = Object.entries(b).filter(([, v]) => v).map(([k, v]) => `${BONUS_NAMES[k] || k}: <b>${v > 0 ? '+' : ''}${v}</b>`);
    const req = Object.entries(d?.equip?.req || {}).map(([k, v]) => `${skillName(k)} ${v}`).join(', ');
    return `<b>${esc(d?.name || e.id)}</b>${e.qty > 1 ? ` ×${e.qty.toLocaleString('en-US')}` : ''}<br>${lines.join('<br>') || '<span class="u-dim">No bonuses</span>'}${req ? `<br><span class="u-dim">Requires ${esc(req)}</span>` : ''}${d?.equip?.speed ? `<br><span class="u-dim">Speed: ${d.equip.speed} ticks</span>` : ''}`;
  }

  function menu(slot, x, y) {
    const e = eq()[slot];
    if (!e) return;
    const name = ITEMS[e.id]?.name || e.id;
    U.menu.open(x, y, [
      ...options(slot).map((o) => ({ html: `<span class="o">${esc(o)}</span> ${itemOrange(name)}`, onSelect: () => act(slot, o) })),
      { html: '<span class="o">Cancel</span>', cancel: true },
    ]);
  }

  function paint() {
    const E = eq();
    for (const slot in cells) {
      const c = cells[slot];
      const e = E[slot];
      const key = e ? e.id + ':' + e.qty : '';
      if (c._key === key) continue;
      c._key = key;
      c._img.src = U.icons.itemIcon(e ? e.id : GHOST[slot]);
      c.classList.toggle('empty', !e);
      if (e && (ITEMS[e.id]?.stack || e.qty > 1)) { const l = qtyLabel(e.qty); c._q.textContent = l.text; c._q.className = 'q ' + l.cls; } else c._q.textContent = '';
    }
    if (bonusEl) {
      const b = safe(() => ctx.equipment.bonuses(), {}) || {};
      bonusEl.innerHTML = Object.entries(BONUS_NAMES).map(([k, n]) => {
        const v = b[k] || 0;
        return `<div>${n}<b class="${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${v > 0 ? '+' : ''}${v}</b></div>`;
      }).join('');
    }
    if (headEl) {
      const w = safe(() => ctx.equipment.weapon(), null);
      headEl.innerHTML = `<span>Worn equipment</span><span>${esc(w?.equip?.speed ? `Speed ${w.equip.speed}` : 'Unarmed')}</span>`;
    }
  }
  events.on('equipment:change', paint);
  events.on('save:loaded', paint);

  return {
    tab: {
      id: 'equipment', title: 'Worn Equipment', icon: 'equipment', order: 50, hotkey: 'E',
      render(el) {
        headEl = h('div.u-eqhead');
        const doll = h('div.u-doll');
        for (const row of [1, 2, 4]) doll.append(h('i.hl', { style: { top: `calc(${row} * (var(--rh, 40px) + var(--rg, 6px)) + var(--rh, 40px) / 2 - 1.5px)` } }));
        for (const row of LAYOUT) for (const slot of row) {
          if (!slot) { doll.append(h('div')); continue; }
          const img = h('img', { alt: '' });
          const q = h('span.q');
          const c = h('div.u-slot', { 'data-slot': slot, 'aria-label': SLOT_NAME[slot] }, [img, q]);
          c._img = img; c._q = q;
          c.addEventListener('click', () => { const o = options(slot)[0]; if (o) act(slot, o); });
          c.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(slot, e.clientX, e.clientY); });
          onLongPress(c, (e) => menu(slot, e.clientX, e.clientY));
          U.tip.attach(c, () => tipHTML(slot));
          c.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch' && eq()[slot]) U.world?.setUiHover(`${esc(options(slot)[0] || 'Remove')} ${itemOrange(ITEMS[eq()[slot].id]?.name || '')}`); });
          c.addEventListener('pointerleave', () => U.world?.setUiHover(null));
          cells[slot] = c;
          doll.append(c);
        }
        bonusEl = h('div.u-bonus');
        el.append(headEl, doll, bonusEl);
        paint();
      },
      onShow: paint,
    },
  };
}
