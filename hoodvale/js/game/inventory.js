// Inventory (28 slots), bank and equipment. Owner: game builder.
// Items are plain { id, qty } entries stored in state.save. Stackable items share one slot.
// inventory: slots, count, has, freeSlots, canAdd, add -> leftover, remove -> removed, removeAt,
//   swap, indexOf (+ options(i) / act(i, option) aliases of ctx.game, see itemops.js).
// bank: items, count, deposit, depositAll, depositEquipment, withdraw.
// equipment: SLOTS, slots, item, weapon, canEquip, equipFromInventory, unequip, useAmmo, bonuses.

import { ITEMS } from '../data/items.js';

export const INV_SIZE = 28;
export const EQUIP_SLOTS = ['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring'];

export function createInventory(ctx) {
  const { state, events } = ctx;
  const slots = () => state.save.inventory;
  const changed = () => { state.markDirty(); events.emit('inventory:change', {}); };

  const inv = {
    get slots() { return slots(); },
    count(id) { return slots().reduce((s, e) => s + (e && e.id === id ? e.qty : 0), 0); },
    has(id, qty = 1) { return inv.count(id) >= qty; },
    freeSlots() { return slots().filter((e) => !e).length; },
    // Can these items fit? (array of [id, qty])
    canAdd(list) {
      let free = inv.freeSlots();
      for (const [id, qty] of list) {
        const def = ITEMS[id];
        if (!def) return false;
        if (def.stack) { if (!inv.has(id)) free--; } else free -= qty;
      }
      return free >= 0;
    },
    // Adds as much as fits; returns the quantity that did NOT fit.
    add(id, qty = 1) {
      const def = ITEMS[id];
      if (!def || qty <= 0) return qty;
      const s = slots();
      let left = qty;
      if (def.stack) {
        const e = s.find((x) => x && x.id === id);
        if (e) { e.qty += left; left = 0; }
        else { const i = s.indexOf(null); if (i >= 0) { s[i] = { id, qty: left }; left = 0; } }
      } else {
        for (let i = 0; i < s.length && left > 0; i++) if (!s[i]) { s[i] = { id, qty: 1 }; left--; }
      }
      if (left !== qty) changed();
      if (left > 0) events.emit('chat:game', { text: "You don't have enough inventory space.", kind: 'warn' });
      return left;
    },
    // Removes up to qty; returns how many were removed.
    remove(id, qty = 1) {
      const s = slots();
      let left = qty;
      for (let i = s.length - 1; i >= 0 && left > 0; i--) {
        const e = s[i];
        if (!e || e.id !== id) continue;
        const take = Math.min(e.qty, left);
        e.qty -= take; left -= take;
        if (e.qty <= 0) s[i] = null;
      }
      if (left !== qty) changed();
      return qty - left;
    },
    removeAt(i, qty = Infinity) {
      const e = slots()[i];
      if (!e) return null;
      const take = Math.min(e.qty, qty);
      e.qty -= take;
      if (e.qty <= 0) slots()[i] = null;
      changed();
      return { id: e.id, qty: take };
    },
    swap(a, b) {
      const s = slots();
      [s[a], s[b]] = [s[b], s[a]];
      changed();
    },
    indexOf(id) { return slots().findIndex((e) => e && e.id === id); },
  };
  return inv;
}

export function createBank(ctx) {
  const { state, events } = ctx;
  const items = () => state.save.bank;
  const changed = () => { state.markDirty(); events.emit('bank:change', {}); };
  const bank = {
    get items() { return items(); },
    count(id) { return items().find((e) => e.id === id)?.qty || 0; },
    deposit(id, qty) {
      const moved = ctx.inventory.remove(id, qty);
      if (!moved) return 0;
      const e = items().find((x) => x.id === id);
      if (e) e.qty += moved; else items().push({ id, qty: moved });
      changed();
      return moved;
    },
    depositAll() {
      for (const e of [...ctx.inventory.slots]) if (e) bank.deposit(e.id, ctx.inventory.count(e.id));
    },
    // Deposit every worn item straight into the bank.
    depositEquipment() {
      const eqs = state.save.equipment;
      let n = 0;
      for (const slot of Object.keys(eqs)) {
        const e = eqs[slot];
        if (!e) continue;
        delete eqs[slot];
        const b = items().find((x) => x.id === e.id);
        if (b) b.qty += e.qty; else items().push({ id: e.id, qty: e.qty });
        n++;
      }
      if (n) { changed(); state.markDirty(); events.emit('equipment:change', {}); }
      return n;
    },
    withdraw(id, qty) {
      const e = items().find((x) => x.id === id);
      if (!e) return 0;
      const def = ITEMS[id];
      const fit = def?.stack ? qty : Math.min(qty, ctx.inventory.freeSlots());
      const n = Math.min(fit, e.qty);
      if (n <= 0) return 0;
      const notFit = ctx.inventory.add(id, n);
      const got = n - notFit;
      e.qty -= got;
      if (e.qty <= 0) items().splice(items().indexOf(e), 1);
      changed();
      return got;
    },
  };
  return bank;
}

export function createEquipment(ctx) {
  const { state, events } = ctx;
  const eq = () => state.save.equipment;
  const changed = () => { state.markDirty(); events.emit('equipment:change', {}); };
  const equipment = {
    SLOTS: EQUIP_SLOTS,
    get slots() { return eq(); },
    item(slot) { return eq()[slot] || null; },
    weapon() { const e = eq().weapon; return e ? ITEMS[e.id] : null; },
    // Checks requirements; returns { ok, reason }.
    canEquip(id) {
      const def = ITEMS[id];
      if (!def?.equip) return { ok: false, reason: "You can't wear that." };
      for (const [skill, lvl] of Object.entries(def.equip.req || {})) {
        if (ctx.skills.level(skill) < lvl) return { ok: false, reason: `You need ${skill[0].toUpperCase() + skill.slice(1)} level ${lvl} to wear that.` };
      }
      return { ok: true };
    },
    equipFromInventory(index) {
      const e = ctx.inventory.slots[index];
      if (!e) return false;
      const def = ITEMS[e.id];
      const check = equipment.canEquip(e.id);
      if (!check.ok) { events.emit('chat:game', { text: check.reason, kind: 'warn' }); return false; }
      const slot = def.equip.slot;
      // Work out what comes off first so nothing is lost to a full inventory.
      const off = [];
      const cur = eq()[slot];
      const merge = cur && cur.id === e.id && def.stack;
      if (cur && !merge) off.push(slot);
      if (def.equip.twoHanded && eq().shield) off.push('shield');
      if (slot === 'shield' && eq().weapon && ITEMS[eq().weapon.id]?.equip?.twoHanded) off.push('weapon');
      const freed = 1; // the slot the new item leaves
      const need = off.filter((s) => !(ITEMS[eq()[s].id]?.stack && ctx.inventory.has(eq()[s].id))).length;
      if (need > ctx.inventory.freeSlots() + freed) { events.emit('chat:game', { text: "You don't have enough inventory space to do that.", kind: 'warn' }); return false; }
      const taken = ctx.inventory.removeAt(index, def.stack ? Infinity : 1);
      if (merge) { cur.qty += taken.qty; changed(); return true; }
      const toReturn = off.map((s) => { const r = eq()[s]; delete eq()[s]; return r; });
      eq()[slot] = taken;
      for (const r of toReturn) ctx.inventory.add(r.id, r.qty);
      changed();
      return true;
    },
    unequip(slot) {
      const e = eq()[slot];
      if (!e) return false;
      if (!ITEMS[e.id].stack && ctx.inventory.freeSlots() < 1) { events.emit('chat:game', { text: "You don't have enough inventory space.", kind: 'warn' }); return false; }
      delete eq()[slot];
      ctx.inventory.add(e.id, e.qty);
      changed();
      return true;
    },
    // Consume ammo (returns true if one was available).
    useAmmo(n = 1) {
      const a = eq().ammo;
      if (!a || a.qty < n) return false;
      a.qty -= n;
      if (a.qty <= 0) delete eq().ammo;
      changed();
      return true;
    },
    bonuses() {
      const b = { atk: 0, str: 0, def: 0, rng: 0, rstr: 0, mag: 0 };
      for (const e of Object.values(eq())) {
        const bon = ITEMS[e.id]?.equip?.bonus;
        if (bon) for (const k in bon) b[k] = (b[k] || 0) + bon[k];
      }
      return b;
    },
  };
  return equipment;
}
