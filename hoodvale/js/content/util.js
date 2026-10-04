// Small helpers shared by the content modules (items in/out with overflow to the bank, distance).
// Owner: content builder. Node-safe.

import { ITEMS } from '../data/items.js';

// Inventory count, optionally plus what is equipped (bows, arrows, shields).
export function countItem(ctx, id, withEquipment = true) {
  let n = ctx.inventory?.count?.(id) ?? (ctx.state.save.inventory || []).reduce((s, e) => s + (e && e.id === id ? e.qty : 0), 0);
  if (withEquipment) for (const e of Object.values(ctx.state.save.equipment || {})) if (e && e.id === id) n += e.qty || 1;
  return n;
}

// Give items; whatever does not fit goes to the bank (with a message) so quest items are never lost.
export function giveItem(ctx, id, qty = 1, { silent = false } = {}) {
  if (!ITEMS[id] || !(qty > 0)) return 0;
  const left = ctx.inventory?.add ? ctx.inventory.add(id, qty) : qty;
  if (left > 0) {
    const bank = ctx.state.save.bank;
    const e = bank.find((x) => x.id === id);
    if (e) e.qty += left; else bank.push({ id, qty: left });
    ctx.state.markDirty();
    ctx.events.emit('bank:change', {});
    if (!silent) ctx.events.emit('chat:game', { text: `Your pack is full, so ${left > 1 ? left + '× ' : ''}${ITEMS[id].name} was sent to your bank.`, kind: 'warn' });
  }
  return qty;
}

// Take items from the inventory only. Returns false (and takes nothing) if there are not enough.
export function takeItem(ctx, id, qty = 1) {
  if (countItem(ctx, id, false) < qty) return false;
  ctx.inventory?.remove?.(id, qty);
  return true;
}

export const cheb = (ax, az, bx, bz) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));

// Distance from the player to an entity footprint (0 = on it).
export function playerDist(ctx, e) {
  const p = ctx.player;
  if (!p || !e) return Infinity;
  return ctx.map?.distToFootprint ? ctx.map.distToFootprint(p.x, p.z, e.x, e.z, e.w || 1, e.d || 1) : cheb(p.x, p.z, e.x, e.z);
}

export const itemName = (id) => ITEMS[id]?.name || id;
