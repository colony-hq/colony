// Shops (data/economy.js SHOPS): buy/sell against the Hood Wallet, finite stock that depletes
// and slowly restocks, items sold to a shop appear in its stock and slowly clear out.
// Registers the 'Trade' option for NPCs with a `shop`. Owner: content builder.
//
// Prices (milli-CREDIT): the player buys at value × sellMarkup, rising up to +30% as the shop
// runs low; the shop buys at value × buyRate, falling as it becomes overstocked (min 40% of base).
// What a shop buys: buysAnything (general store) → any tradeable item with a value; otherwise
// items it stocks + its buysCategory ('fish' | 'ore').
//
// API (UI shop window): info(shopId) -> { id, name, buyRate, sellMarkup, buysAnything, buysCategory },
//   stock(shopId) -> [{ id, name, qty, base, price, sellPrice }], priceBuy(shopId, id, qty=1)
//   (total to buy), priceSell(shopId, id, qty=1) (total paid to you), canSell(shopId, id) ->
//   { ok, reason }, sellable(shopId) -> [{ id, qty, price }] from the inventory,
//   buy(shopId, id, qty) -> qty bought (0 = failed; reason in lastError),
//   sell(shopId, id, qty) -> qty sold, open(shopId), lastError.
// Events out: shop:open {id}, shop:change {id}, shop:buy {id, item, qty, cost},
//   shop:sell {id, item, qty, paid}, chat:game.

import { SHOPS } from '../data/economy.js';
import { ITEMS, FISH, formatCredit } from '../data/items.js';

const FISH_IDS = new Set(FISH.flatMap((f) => [f.id, 'raw_' + f.id]));
const CATEGORY = {
  fish: (id) => FISH_IDS.has(id),
  ore: (id) => /_ore$/.test(id) || id === 'coal' || id === 'orbium_shard',
};
const RESTOCK_TICKS = 20; // every 12 s each item moves one step back toward its base stock

export function createShops(ctx) {
  const { events, state } = ctx;
  const live = {}; // shopId -> Map(itemId -> { qty, base })
  let lastError = '';

  function shop(id) {
    if (!SHOPS[id]) return null;
    if (!live[id]) {
      const m = new Map();
      for (const [itemId, qty] of SHOPS[id].stock) if (ITEMS[itemId]) m.set(itemId, { qty: qty ?? Infinity, base: qty ?? Infinity });
      live[id] = m;
    }
    return live[id];
  }
  const say = (text, kind = 'game') => events.emit('chat:game', { text, kind });
  const fail = (text) => { lastError = text; say(text, 'warn'); return 0; };

  // Unit prices.
  function unitBuy(shopId, itemId, offset = 0) {
    const s = SHOPS[shopId], it = ITEMS[itemId];
    if (!s || !it) return 0;
    const base = Math.max(1, Math.round(it.value * (s.sellMarkup ?? 1)));
    const e = shop(shopId).get(itemId);
    if (!e || !isFinite(e.base) || e.base <= 0) return base;
    const left = Math.max(0, e.qty - offset);
    const scarcity = Math.max(0, 1 - left / e.base); // 0 full .. 1 empty
    return Math.max(1, Math.round(base * (1 + 0.3 * scarcity)));
  }
  function unitSell(shopId, itemId, offset = 0) {
    const s = SHOPS[shopId], it = ITEMS[itemId];
    if (!s || !it || !(it.value > 0)) return 0;
    const base = it.value * (s.buyRate ?? 0.4);
    const e = shop(shopId).get(itemId);
    const have = (e?.qty || 0) + offset;
    const ref = e && isFinite(e.base) && e.base > 0 ? e.base : 10;
    const glut = Math.max(0, have - ref) / Math.max(10, ref);
    return Math.max(1, Math.floor(base * Math.max(0.4, 1 - 0.3 * glut)));
  }

  const shops = {
    get lastError() { return lastError; },
    ids: Object.keys(SHOPS),
    info(shopId) {
      const s = SHOPS[shopId];
      return s ? { id: shopId, name: s.name, buyRate: s.buyRate, sellMarkup: s.sellMarkup, buysAnything: !!s.buysAnything, buysCategory: s.buysCategory || null } : null;
    },
    stock(shopId) {
      const m = shop(shopId);
      if (!m) return [];
      const out = [];
      for (const [id, e] of m) {
        if (e.qty <= 0 && !(e.base > 0)) continue; // sold-in items that have cleared out
        out.push({ id, name: ITEMS[id].name, qty: e.qty, base: e.base, price: unitBuy(shopId, id), sellPrice: unitSell(shopId, id) });
      }
      return out;
    },
    priceBuy(shopId, itemId, qty = 1) {
      let t = 0;
      for (let i = 0; i < qty; i++) t += unitBuy(shopId, itemId, i);
      return t;
    },
    priceSell(shopId, itemId, qty = 1) {
      let t = 0;
      for (let i = 0; i < qty; i++) t += unitSell(shopId, itemId, i);
      return t;
    },
    canSell(shopId, itemId) {
      const s = SHOPS[shopId], it = ITEMS[itemId];
      if (!s || !it) return { ok: false, reason: 'They have no use for that.' };
      if (it.tradeable === false || it.quest) return { ok: false, reason: "You can't sell that. It's far too important." };
      if (!(it.value > 0)) return { ok: false, reason: 'Nobody would pay for that. Not even Pell.' };
      if (s.buysAnything) return { ok: true };
      if (shop(shopId).has(itemId)) return { ok: true };
      if (s.buysCategory && CATEGORY[s.buysCategory]?.(itemId)) return { ok: true };
      return { ok: false, reason: `${s.name} doesn't buy that. Try the general store, or the Exchange.` };
    },
    sellable(shopId) {
      const seen = new Map();
      for (const e of state.save.inventory || []) if (e && shops.canSell(shopId, e.id).ok) seen.set(e.id, (seen.get(e.id) || 0) + e.qty);
      return [...seen].map(([id, qty]) => ({ id, qty, price: unitSell(shopId, id) }));
    },

    buy(shopId, itemId, qty = 1) {
      lastError = '';
      const m = shop(shopId);
      const it = ITEMS[itemId];
      if (!m || !it || !m.has(itemId)) return fail("They don't sell that here.");
      const e = m.get(itemId);
      qty = Math.max(0, Math.floor(qty));
      if (e.qty <= 0) return fail('The shop has run out of that. Check back later.');
      qty = Math.min(qty, e.qty);
      // Space: stackables need one slot (or none if already held); others one slot each.
      const free = ctx.inventory?.freeSlots?.() ?? 0;
      if (it.stack) { if (free < 1 && !(ctx.inventory?.has?.(itemId))) return fail("You don't have enough inventory space."); }
      else qty = Math.min(qty, free);
      if (qty <= 0) return fail("You don't have enough inventory space.");
      // Money: buy as many as you can afford.
      const bal = ctx.wallet?.balance ?? 0;
      while (qty > 0 && shops.priceBuy(shopId, itemId, qty) > bal) qty--;
      if (qty <= 0) return fail(`You can't afford that. It costs ${formatCredit(unitBuy(shopId, itemId))} CREDIT; you have ${formatCredit(bal)}.`);
      const cost = shops.priceBuy(shopId, itemId, qty);
      const tx = ctx.wallet?.debit?.(cost, `Shop: bought ${qty > 1 ? qty + '× ' : ''}${it.name} (${SHOPS[shopId].name})`, { to: 'shop:' + shopId, item: itemId, qty });
      if (!tx) return fail("You can't afford that.");
      const left = ctx.inventory.add(itemId, qty);
      const got = qty - left;
      if (left > 0) ctx.wallet?.credit?.(shops.priceBuy(shopId, itemId, left), `Shop refund: ${it.name}`, { from: 'shop:' + shopId });
      if (isFinite(e.qty)) e.qty -= got;
      events.emit('shop:buy', { id: shopId, item: itemId, qty: got, cost });
      events.emit('shop:change', { id: shopId });
      return got;
    },

    sell(shopId, itemId, qty = 1) {
      lastError = '';
      const it = ITEMS[itemId];
      const ok = shops.canSell(shopId, itemId);
      if (!ok.ok) return fail(ok.reason);
      qty = Math.min(Math.max(0, Math.floor(qty)), ctx.inventory?.count?.(itemId) ?? 0);
      if (qty <= 0) return fail("You don't have any of those.");
      const paid = shops.priceSell(shopId, itemId, qty);
      const removed = ctx.inventory.remove(itemId, qty);
      if (!removed) return fail("You don't have any of those.");
      const total = removed === qty ? paid : shops.priceSell(shopId, itemId, removed);
      if (total > 0) ctx.wallet?.credit?.(total, `Shop: sold ${removed > 1 ? removed + '× ' : ''}${it.name} (${SHOPS[shopId].name})`, { from: 'shop:' + shopId, item: itemId, qty: removed });
      const m = shop(shopId);
      const e = m.get(itemId);
      if (e) { if (isFinite(e.qty)) e.qty += removed; }
      else m.set(itemId, { qty: removed, base: 0 });
      events.emit('shop:sell', { id: shopId, item: itemId, qty: removed, paid: total });
      events.emit('shop:change', { id: shopId });
      return removed;
    },

    open(shopId) {
      if (!SHOPS[shopId]) return false;
      shop(shopId);
      try { ctx.ui?.openShop?.(shopId); } catch (err) { console.error('[shops] openShop', err); }
      events.emit('shop:open', { id: shopId });
      return true;
    },
    update() {},
  };

  // 'Trade' on any NPC with a shop.
  ctx.actions?.register?.('Trade', {
    approach(e) { ctx.dialogue?.hold?.(e, 20); return { adjacent: true }; },
    start(e) {
      const id = e.def?.shop;
      if (!id) { say("They don't have anything to trade."); return false; }
      if (e.kind === 'npc') { e.yaw = Math.atan2(-(ctx.player.x - e.x), -(ctx.player.z - e.z)); }
      shops.open(id);
      return false;
    },
  }, 'npc');

  // Slow restock toward base, and slow clear-out of items players sold in.
  ctx.ticks?.on?.((n) => {
    if (n % RESTOCK_TICKS) return;
    for (const [id, m] of Object.entries(live)) {
      let changed = false;
      for (const [itemId, e] of m) {
        if (!isFinite(e.base)) continue;
        if (e.qty < e.base) { e.qty += Math.max(1, Math.round(e.base * 0.05)); if (e.qty > e.base) e.qty = e.base; changed = true; }
        else if (e.qty > e.base) { e.qty -= Math.max(1, Math.round((e.qty - e.base) * 0.1)); changed = true; }
        if (e.base === 0 && e.qty <= 0) { m.delete(itemId); changed = true; }
      }
      if (changed) events.emit('shop:change', { id });
    }
  }, 95);

  return shops;
}
