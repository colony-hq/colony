// The Gildmoor Exchange: NPC market makers + other players' orders (db). Owner: net builder.
//
// Orders (8 slots, RuneScape style) escrow on placement: a buy debits price × qty CREDIT, a sell
// removes the items. Fills land in the order's collection box (instant fills at placement are
// collected straight away); cancel returns the unfilled escrow. Price improvement on buys is
// refunded to the box.
//
// Liquidity:
//  - NPC market makers (market.js): deterministic random-walk price around each item's value,
//    a spread, limited depth that regenerates. They fill takers instantly and, every block, take
//    resting orders whose limit their quotes cross.
//  - Live market (db + user available): each player's orders are published under
//    market/{self} (index doc read by everyone) and market/{self}/orders/{id}. A taker fills a
//    player's order by writing a fill under fills/{self} (index doc) and fills/{self}/log/{id},
//    waits ~1 block, then settles with evaluateOrder() (the same rule the maker uses). Makers
//    apply valid fills that reference their orders into their collection box.
//
// API: open({item?, tab?, at?}), close(), place({item, side, qty, price}) -> {ok, error?, order?},
//   cancel(orderId), collect(orderId) / collectAll(), orders(), history(), quote(id), book(id),
//   chart(id), tape(id), status() -> {mode: 'live'|'connecting'|'npc', live, traders, error},
//   slotsFree(), boxCount(), inventoryItems(), MAX_ORDERS.
// Events: exchange:open, exchange:change {order?}, exchange:fill {order, qty, price, src},
//   exchange:status {mode, ...}, exchange:book (remote market data changed).

import { ITEMS, formatCredit } from '../data/items.js';
import { netHub, docWriter, errCode } from './caps.js';
import * as M from './market.js';
import { openExchangeWindow, closeExchangeWindow, exchangeWindowOpen } from './ui-exchange.js';

// Price ties: player orders before NPC liquidity, then oldest first (a consistent comparator).
const tieBreak = (a, c) => (c.src === 'player') - (a.src === 'player') || (a.at || 0) - (c.at || 0);

const SETTLE_MS = 2600;      // ~one block before a taker settles a player fill
const LOCK_MS = 20000;       // NPC makers leave a live order alone this long after a player fill
const CANCEL_GRACE_MS = 3600; // live cancels refund after in-flight fills had a chance to land
const KEEP_MY_FILLS = 150;
const DAY = 86400000;

export function createExchange(ctx) {
  const { events, state } = ctx;
  const net = netHub(ctx);
  const writer = docWriter();
  const pressure = new Map(); // id -> { p, t }
  const usedLiq = new Map();  // id -> { ask, bid, t }
  const tapes = new Map();    // id -> [{ at, price, qty, side, src, who }]
  const remote = { makers: new Map(), fills: new Map(), byOrder: new Map(), seen: new Set() };
  const live = { on: false, me: null, db: null, unsub: [], error: null, readOnly: false };
  const notified = new Map(); // orderId -> last partial-fill message time

  const X = () => {
    let x = state.save.exchange;
    if (!x || x.v !== 1 || !Array.isArray(x.orders)) x = state.save.exchange = { v: 1, orders: [], history: [], myFills: [] };
    if (!Array.isArray(x.history)) x.history = [];
    if (!Array.isArray(x.myFills)) x.myFills = [];
    return x;
  };
  const say = (text, kind = 'chain') => events.emit('chat:game', { text, kind });
  const nm = (id) => ITEMS[id]?.name || id;
  const fc = (mc) => formatCredit(mc);
  const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const changed = (order) => { state.markDirty(); events.emit('exchange:change', { order }); };
  const findOrder = (id) => X().orders.find((o) => o.id === id) || null;

  // ---- NPC liquidity state ------------------------------------------------------------
  function pres(id) {
    const e = pressure.get(id);
    if (!e) return 0;
    const now = Date.now();
    e.p *= Math.pow(0.5, (now - e.t) / 180000);
    e.t = now;
    if (Math.abs(e.p) < 1e-4) { pressure.delete(id); return 0; }
    return e.p;
  }
  function nudge(id, side, qty) {
    const p = pres(id) + (side === 'buy' ? 1 : -1) * 0.025 * Math.min(2, qty / Math.max(1, M.npcDepth(id)));
    pressure.set(id, { p: Math.max(-0.2, Math.min(0.2, p)), t: Date.now() });
  }
  function usedOf(id) {
    const e = usedLiq.get(id);
    if (!e) return { ask: 0, bid: 0 };
    const now = Date.now();
    const k = Math.pow(0.5, (now - e.t) / 60000);
    e.ask *= k; e.bid *= k; e.t = now;
    return { ask: Math.floor(e.ask), bid: Math.floor(e.bid) };
  }
  function consume(id, npcSide, qty) {
    usedOf(id);
    const e = usedLiq.get(id) || { ask: 0, bid: 0, t: Date.now() };
    e[npcSide] += qty;
    usedLiq.set(id, e);
  }
  const quote = (id) => M.npcQuote(id, Date.now(), pres(id));
  const npcBook = (id) => M.npcBook(id, Date.now(), pres(id), usedOf(id));

  function tape(id) {
    let t = tapes.get(id);
    if (!t) tapes.set(id, (t = []));
    return t;
  }
  function pushTape(id, e) {
    const t = tape(id);
    t.unshift(e);
    if (t.length > 40) t.length = 40;
  }

  // ---- Remote (player) levels ----------------------------------------------------------
  function fillsFor(maker, oid) {
    const key = maker + '/' + oid;
    const list = [...(remote.byOrder.get(key) || [])];
    if (live.me) {
      for (const f of X().myFills) {
        if (f.maker !== maker || f.order !== oid) continue;
        const k = live.me + '/' + f.id;
        if (!list.some((x) => x.key === k)) list.push({ ...f, key: k, taker: live.me, void: !!f.void });
      }
    }
    return list;
  }
  function playerLevels(id, makerSide, forTaking = false) {
    const out = [];
    if (!live.on || (forTaking && live.readOnly)) return out;
    for (const [maker, m] of remote.makers) {
      if (maker === live.me) continue;
      for (const o of m.orders) {
        if (o.item !== id || o.side !== makerSide || o.status !== 'open') continue;
        const ev = M.evaluateOrder(o, fillsFor(maker, o.id));
        if (ev.remaining > 0) out.push({ price: o.price, qty: ev.remaining, src: 'player', maker, order: o.id, at: o.at });
      }
    }
    return out;
  }
  // Combined opposite side for a taker (best first; players first at equal prices).
  function takerLevels(id, takerSide) {
    const b = npcBook(id);
    if (takerSide === 'buy') return [...b.asks, ...playerLevels(id, 'sell', true)].sort((a, c) => a.price - c.price || tieBreak(a, c));
    return [...b.bids, ...playerLevels(id, 'buy', true)].sort((a, c) => c.price - a.price || tieBreak(a, c));
  }

  // ---- Fills ----------------------------------------------------------------------------
  function counterparty(src, who) {
    const c = ctx.chain;
    if (!c) return 'exchange';
    if (src === 'player') return c.sysAddress('player:' + String(who || '').slice(0, 24));
    const makers = ['Gildmoor Maker #1', 'Gildmoor Maker #2', 'Gildmoor Maker #3', 'Saltreach Maker', 'Copperhollow Maker'];
    return c.sysAddress('mm:' + makers[Math.floor(Math.random() * makers.length)]);
  }

  function applyFill(o, qty, price, src, who = null) {
    if (qty <= 0) return;
    o.filled += qty;
    if (o.side === 'buy') { o.box.item += qty; o.box.credit += (o.price - price) * qty; }
    else o.box.credit += price * qty;
    const x = X();
    x.history.unshift({ at: Date.now(), item: o.item, side: o.side, qty, price, src, order: o.id });
    if (x.history.length > 80) x.history.length = 80;
    pushTape(o.item, { at: Date.now(), price, qty, side: o.side, src: 'you', who: src === 'player' ? 'player order' : 'NPC maker' });
    const c = ctx.chain;
    if (c) {
      const cp = counterparty(src, who);
      c.submit({
        kind: 'fill', from: o.side === 'buy' ? cp : c.address, to: o.side === 'buy' ? c.address : cp, amount: price * qty,
        token: { item: o.item, qty },
        memo: `Exchange fill · ${o.side === 'buy' ? 'bought' : 'sold'} ${qty} × ${nm(o.item)} @ ${fc(price)} (${src === 'player' ? 'player order' : 'NPC maker'})`,
      });
    }
    if (o.status === 'open' && o.filled >= o.qty) finish(o);
    events.emit('exchange:fill', { order: o, qty, price, src });
    changed(o);
  }

  function finish(o) {
    o.status = 'filled';
    o.closedAt = Date.now();
    if (o.live) publishMarket(o);
  }

  // ---- Placement ------------------------------------------------------------------------
  function place({ item, side, qty, price } = {}) {
    const fail = (error) => ({ ok: false, error });
    qty = Math.floor(Number(qty));
    price = Math.floor(Number(price));
    if (!M.isTradeable(item)) return fail("That can't be traded on the Exchange.");
    if (side !== 'buy' && side !== 'sell') return fail('Choose buy or sell.');
    if (!(qty >= 1) || qty > M.MAX_QTY) return fail('Choose a quantity.');
    if (!(price >= 1) || price > M.MAX_PRICE) return fail('Choose a price of at least 0.001 CREDIT.');
    if (X().orders.length >= M.MAX_ORDERS) return fail('All 8 Exchange slots are in use. Collect or cancel an order first.');
    const def = ITEMS[item];
    if (side === 'buy') {
      const cost = price * qty;
      if (!ctx.wallet?.canAfford?.(cost)) return fail(`You need ${fc(cost)} CREDIT for that order (you have ${fc(ctx.wallet?.balance || 0)}).`);
      if (!ctx.wallet.debit(cost, `Exchange escrow · buy ${qty} × ${def.name} @ ${fc(price)}`, { to: 'exchange', kind: 'escrow' })) return fail('The escrow payment failed.');
    } else {
      const have = ctx.inventory?.count?.(item) || 0;
      if (have < qty) return fail(have ? `You only have ${have} × ${def.name}.` : `You don't have any ${def.name}.`);
      const removed = ctx.inventory.remove(item, qty);
      if (removed < qty) { if (removed) ctx.inventory.add(item, removed); return fail('Those items could not be escrowed.'); }
      ctx.chain?.submit?.({ kind: 'escrow', from: ctx.chain.address, to: 'exchange', token: { item, qty }, memo: `Exchange escrow · sell ${qty} × ${def.name} @ ${fc(price)}` });
    }
    const o = { id: newId('o'), item, side, price, qty, filled: 0, pend: 0, mf: 0, at: Date.now(), status: 'open', closedAt: null, box: { item: 0, credit: 0 }, applied: [], live: false, lastPF: 0 };
    X().orders.push(o);

    // Take liquidity now.
    const plan = M.planTake(takerLevels(item, side), qty, price, side);
    let npcQty = 0, npcCost = 0;
    for (const f of plan.fills) {
      if (f.src === 'npc') {
        consume(item, side === 'buy' ? 'ask' : 'bid', f.qty);
        npcQty += f.qty; npcCost += f.qty * f.price;
        applyFill(o, f.qty, f.price, 'npc');
      } else {
        takerFill(o, f);
      }
    }
    if (npcQty) nudge(item, side, npcQty);
    if (o.status === 'open' && live.on && !live.readOnly) { o.live = true; publishMarket(o); }

    const avg = npcQty ? npcCost / npcQty : 0;
    if (o.status === 'filled' && !o.pend) {
      collect(o.id, { quiet: true });
      say(`Exchange: you ${side === 'buy' ? 'bought' : 'sold'} ${qty} × ${def.name} for ${fc(npcCost)} CREDIT (avg ${fc(Math.round(avg))}).`);
    } else {
      const parts = [];
      if (npcQty) parts.push(`${npcQty} filled instantly`);
      if (o.pend) parts.push(`${o.pend} settling with another adventurer`);
      const rest = o.qty - o.filled - o.pend;
      if (rest > 0) parts.push(`${rest} waiting at ${fc(price)}`);
      say(`Exchange: ${side} order for ${qty} × ${def.name} placed — ${parts.join(', ')}.`);
      if (npcQty) collect(o.id, { quiet: true });
    }
    changed(o);
    return { ok: true, order: o, instant: npcQty, pending: o.pend };
  }

  function takerFill(o, lvl) {
    const f = { id: newId('f'), maker: lvl.maker, order: lvl.order, item: o.item, side: o.side === 'buy' ? 'sell' : 'buy', qty: lvl.qty, price: lvl.price, at: Date.now() };
    X().myFills.unshift({ ...f, state: 'pending', mine: o.id });
    o.pend += f.qty;
    publishFills(f);
    setTimeout(() => settle(f.id), SETTLE_MS);
  }

  // Taker-side settlement of a player fill (after ~one block).
  function settle(fid, tries = 0) {
    const mf = X().myFills.find((x) => x.id === fid);
    if (!mf || mf.state !== 'pending') return;
    if (!live.on) { if (tries < 200) setTimeout(() => settle(fid, tries + 1), 5000); return; }
    const echoed = (remote.fills.get(live.me) || []).some((x) => x.id === fid);
    if (!echoed && Date.now() - mf.at < 15000) { setTimeout(() => settle(fid, tries + 1), 1000); return; }
    const mo = remote.makers.get(mf.maker)?.orders.find((x) => x.id === mf.order);
    const ok = !!mo && M.evaluateOrder(mo, fillsFor(mf.maker, mf.order)).valid.has(live.me + '/' + fid);
    const o = findOrder(mf.mine);
    if (ok) {
      mf.state = 'settled';
      if (o) { o.pend = Math.max(0, o.pend - mf.qty); applyFill(o, mf.qty, mf.price, 'player', mf.maker); }
      if (o) collect(o.id, { quiet: true }); // taker fills are made at placement: deliver like instant fills
      say(`Exchange: settled with another adventurer — ${o?.side === 'sell' ? 'sold' : 'bought'} ${mf.qty} × ${nm(mf.item)} @ ${fc(mf.price)}.`);
    } else {
      mf.state = 'void';
      mf.void = true;
      publishFills();
      if (o) {
        o.pend = Math.max(0, o.pend - mf.qty);
        if (o.status !== 'open') refundUnits(o, mf.qty);
        else if (live.on) { o.live = true; publishMarket(o); }
      }
      say('Exchange: another trader reached that player order first. Your escrow is safe — the order keeps waiting.', 'game');
    }
    changed(o);
  }

  function refundUnits(o, n) {
    if (n <= 0) return;
    if (o.side === 'buy') o.box.credit += n * o.price; else o.box.item += n;
  }

  // ---- Cancel / collect -----------------------------------------------------------------
  function cancel(id) {
    const o = findOrder(id);
    if (!o || o.status !== 'open') return false;
    o.status = 'cancelled';
    o.closedAt = Date.now();
    if (o.live && live.on) {
      o.refundAt = Date.now() + CANCEL_GRACE_MS;
      publishMarket(o);
      say(`Exchange: cancelling your ${o.side} order for ${nm(o.item)}… escrow returns after the next block.`, 'game');
    } else {
      doRefund(o);
    }
    changed(o);
    return true;
  }
  function doRefund(o) {
    o.refundAt = null;
    const rem = Math.max(0, o.qty - o.filled - o.pend);
    o.cancelled = rem;
    refundUnits(o, rem);
    const got = collect(o.id, { quiet: true });
    say(`Exchange: order cancelled. ${got.length ? 'Returned: ' + got.join(', ') + '.' : 'Nothing was left to return.'}`);
  }

  function collect(id, { quiet = false } = {}) {
    if (id == null) return collectAll({ quiet }); // collect() = everything (bank booth / desk)
    const o = findOrder(id);
    if (!o) return [];
    const got = [];
    if (o.box.credit > 0) {
      const amt = o.box.credit;
      o.box.credit = 0;
      ctx.wallet?.credit?.(amt, `Exchange · collected (${o.side} ${nm(o.item)})`, { from: 'exchange', kind: 'collect' });
      got.push(`${fc(amt)} CREDIT`);
    }
    if (o.box.item > 0) {
      const want = o.box.item;
      const left = ctx.inventory ? ctx.inventory.add(o.item, want) : want;
      const moved = want - left;
      o.box.item = left;
      if (moved > 0) {
        got.push(`${moved} × ${nm(o.item)}`);
        ctx.chain?.submit?.({ kind: 'collect', from: 'exchange', to: ctx.chain.address, token: { item: o.item, qty: moved }, memo: `Exchange · collected ${moved} × ${nm(o.item)}` });
      }
    }
    if (o.status !== 'open' && !o.box.item && !o.box.credit && !o.pend && !o.refundAt) retire(o);
    if (got.length && !quiet) say(`Exchange: collected ${got.join(' and ')}.`);
    changed(o);
    return got;
  }
  function collectAll({ quiet = false } = {}) {
    const all = [];
    for (const o of [...X().orders]) all.push(...collect(o.id, { quiet: true }));
    if (!quiet) say(all.length ? `Exchange: collected ${all.join(', ')}.` : 'You have nothing to collect from the Exchange.', all.length ? 'chain' : 'game');
    return all;
  }
  function retire(o) {
    const x = X();
    const i = x.orders.indexOf(o);
    if (i >= 0) x.orders.splice(i, 1);
    if (o.live && live.on) {
      const path = `market/${live.me}/orders/${o.id}`;
      const db = live.db;
      writer.write(path, () => db.doc(path).delete(), onWriteErr);
      publishMarket();
    }
  }

  // ---- NPC makers take resting orders (every block) -------------------------------------
  function npcTick() {
    const now = Date.now();
    for (const o of [...X().orders]) {
      if (o.refundAt && now >= o.refundAt) { doRefund(o); continue; }
      if (o.status !== 'open') continue;
      const avail = o.qty - o.filled - o.pend;
      if (avail <= 0) continue;
      if (o.live && now - (o.lastPF || 0) < LOCK_MS) continue;
      if (now - o.at < 1500) continue;
      const b = npcBook(o.item);
      const levels = (o.side === 'buy' ? b.asks : b.bids).map((L) => ({ ...L, qty: Math.max(1, Math.ceil(L.qty * 0.5)) }));
      const plan = M.planTake(levels, avail, o.price, o.side);
      const q = plan.fills.reduce((s, f) => s + f.qty, 0);
      if (q <= 0) continue;
      consume(o.item, o.side === 'buy' ? 'ask' : 'bid', q);
      nudge(o.item, o.side, q);
      applyFill(o, q, o.price, 'npc');
      if (o.live) publishMarket(o);
      if (o.status === 'filled') {
        say(`Exchange: your order to ${o.side} ${o.qty} × ${nm(o.item)} is complete. Collect it at the Exchange or any bank booth.`);
      } else if (now - (notified.get(o.id) || 0) > 60000) {
        notified.set(o.id, now);
        say(`Exchange: ${o.filled}/${o.qty} × ${nm(o.item)} ${o.side === 'buy' ? 'bought' : 'sold'} so far.`);
      }
    }
  }

  // ---- Live market (db) -------------------------------------------------------------------
  const strip = (f) => ({ id: f.id, maker: f.maker, order: f.order, item: f.item, side: f.side, qty: f.qty, price: f.price, at: f.at, ...(f.void ? { void: true } : {}) });
  const makerView = (o) => ({ id: o.id, item: o.item, side: o.side, price: o.price, qty: o.qty, ext: Math.max(0, Math.min(o.qty, o.filled - o.mf + o.pend)), at: o.at, status: o.status, closedAt: o.closedAt || null });

  function onWriteErr(e) {
    const code = errCode(e);
    if (code === 'invalid_argument' || code === 'not_granted' || code === 'revoked') {
      // Cannot write here (view-only member, rules): keep reading, stop publishing.
      live.readOnly = true;
      live.error = code;
      events.emit('exchange:status', exchange.status());
    } else if (code === 'quota_exceeded') {
      say('Exchange: the shared market ledger is full right now; your orders stay with the NPC market.', 'warn');
    }
  }

  function publishMarket(order = null) {
    if (!live.on || live.readOnly) return;
    const me = live.me, db = live.db;
    const now = Date.now();
    const list = X().orders.filter((o) => o.live && (o.status === 'open' || now - (o.closedAt || 0) < DAY)).slice(-12).map(makerView);
    writer.write('market/' + me, () => db.doc('market/' + me).set({ v: 1, at: now, orders: list }), onWriteErr);
    if (order && order.live) {
      const path = `market/${me}/orders/${order.id}`;
      const view = makerView(order);
      writer.write(path, () => db.doc(path).set({ v: 1, ...view }), onWriteErr);
    }
  }

  function publishFills(newFill = null) {
    if (!live.on || live.readOnly) return;
    const me = live.me, db = live.db;
    const x = X();
    const cutoff = Date.now() - 30 * DAY;
    const pruned = x.myFills.filter((f, i) => i >= KEEP_MY_FILLS || f.at < cutoff);
    if (pruned.length) {
      x.myFills = x.myFills.filter((f) => !pruned.includes(f));
      for (const f of pruned) { const p = `fills/${me}/log/${f.id}`; writer.write(p, () => db.doc(p).delete(), onWriteErr); }
    }
    writer.write('fills/' + me, () => db.doc('fills/' + me).set({ v: 1, at: Date.now(), fills: x.myFills.map(strip) }), onWriteErr);
    if (newFill) {
      const p = `fills/${me}/log/${newFill.id}`;
      writer.write(p, () => db.doc(p).set({ v: 1, ...strip(newFill) }), onWriteErr);
    }
  }

  function onMarket(snap) {
    const now = Date.now();
    remote.makers.clear();
    for (const d of snap?.docs || []) {
      if (!d?.exists || !M.USER_RE.test(String(d.id))) continue;
      const data = d.data?.();
      if (!data || typeof data !== 'object') continue;
      const orders = (Array.isArray(data.orders) ? data.orders.slice(0, 16) : []).map((o) => M.cleanOrder(o, d.id, now)).filter(Boolean);
      remote.makers.set(d.id, { at: Number(data.at) || 0, orders });
    }
    afterRemote();
  }

  function onFills(snap) {
    const now = Date.now();
    remote.fills.clear();
    remote.byOrder.clear();
    for (const d of snap?.docs || []) {
      if (!d?.exists || !M.USER_RE.test(String(d.id))) continue;
      const data = d.data?.();
      if (!data || typeof data !== 'object') continue;
      const list = (Array.isArray(data.fills) ? data.fills.slice(0, 200) : []).map((f) => M.cleanFill(f, d.id, now)).filter(Boolean);
      remote.fills.set(d.id, list);
      for (const f of list) {
        const k = f.maker + '/' + f.order;
        let arr = remote.byOrder.get(k);
        if (!arr) remote.byOrder.set(k, (arr = []));
        arr.push(f);
        if (!f.void && d.id !== live.me && !remote.seen.has(f.key) && now - f.at < DAY) {
          remote.seen.add(f.key);
          pushTape(f.item, { at: f.at, price: f.price, qty: f.qty, side: f.side === 'sell' ? 'buy' : 'sell', src: 'player', who: 'adventurer' });
        }
      }
    }
    afterRemote();
  }

  function afterRemote() {
    processMaker();
    for (const f of X().myFills) if (f.state === 'pending' && Date.now() - f.at > SETTLE_MS) settle(f.id);
    events.emit('exchange:book', {});
  }

  // Maker side: apply valid player fills that reference my live orders.
  function processMaker() {
    if (!live.on) return;
    for (const o of [...X().orders]) {
      if (!o.live) continue;
      const fills = remote.byOrder.get(live.me + '/' + o.id);
      if (!fills?.length) continue;
      const ev = M.evaluateOrder({ ...makerView(o), maker: live.me }, fills);
      let any = false;
      for (const f of fills) {
        if (!ev.valid.has(f.key) || o.applied.includes(f.key)) continue;
        o.applied.push(f.key);
        if (o.applied.length > 200) o.applied.splice(0, o.applied.length - 200);
        o.mf += f.qty;
        o.lastPF = Date.now();
        // A fill that landed before a cancel but after its refund: claw the units back.
        if (o.status === 'cancelled' && !o.refundAt) clawBack(o, f.qty);
        applyFill(o, f.qty, o.price, 'player', f.taker);
        any = true;
        say(`Exchange: another adventurer ${o.side === 'sell' ? 'bought' : 'sold you'} ${f.qty} × ${nm(o.item)} @ ${fc(o.price)}.${o.status === 'filled' ? ' Order complete — collect it at the Exchange or a bank booth.' : ''}`);
      }
      if (any) publishMarket(o);
    }
  }
  function clawBack(o, n) {
    if (o.side === 'sell') {
      const fromBox = Math.min(o.box.item, n);
      o.box.item -= fromBox;
      if (n - fromBox > 0) ctx.inventory?.remove?.(o.item, n - fromBox);
    } else {
      const need = n * o.price;
      const fromBox = Math.min(o.box.credit, need);
      o.box.credit -= fromBox;
      if (need - fromBox > 0) ctx.wallet?.debit?.(need - fromBox, `Exchange · late fill settlement (${nm(o.item)})`, { to: 'exchange', kind: 'escrow' });
    }
  }

  function startLive() {
    stopLive();
    const db = net.db, me = net.selfId;
    if (!db || !me || !M.USER_RE.test(me)) return;
    live.on = true; live.me = me; live.db = db; live.error = null; live.readOnly = false;
    const onErr = (e) => { live.error = errCode(e); stopLive(true); };
    try {
      live.unsub.push(db.collection('market').orderBy('at', 'desc').limit(200).onSnapshot(onMarket, onErr));
      live.unsub.push(db.collection('fills').orderBy('at', 'desc').limit(200).onSnapshot(onFills, onErr));
    } catch (e) { onErr(e); return; }
    const publishAll = () => {
      if (!live.on || live.readOnly) return;
      let any = false;
      for (const o of X().orders) if (o.status === 'open' && !o.live) { o.live = true; any = true; }
      if (any || X().orders.some((o) => o.live)) publishMarket();
      if (X().myFills.length) publishFills();
    };
    // View-only members read the shared market but cannot post orders or fills.
    Promise.resolve(net.user?.can?.('data.write')).then((can) => {
      if (can === false && live.db === db) { live.readOnly = true; live.error = 'read_only'; }
      publishAll();
      events.emit('exchange:status', exchange.status());
    }, publishAll);
    events.emit('exchange:status', exchange.status());
  }
  function stopLive(keepError = false) {
    for (const u of live.unsub.splice(0)) { try { u(); } catch { /* ignore */ } }
    const was = live.on;
    live.on = false; live.db = null;
    if (!keepError) live.error = null;
    remote.makers.clear(); remote.fills.clear(); remote.byOrder.clear();
    if (was) events.emit('exchange:status', exchange.status());
  }
  function syncLive() {
    const want = !!(net.db && net.selfId);
    if (want && (!live.on || live.me !== net.selfId || live.db !== net.db)) { if (!live.error || live.me !== net.selfId) startLive(); }
    else if (!want && live.on) stopLive();
    else events.emit('exchange:status', exchange.status());
  }
  net.on(syncLive);

  // ---- Public API ---------------------------------------------------------------------
  let openedAt = null; // { x, z } when opened at a desk/clerk (closes when you walk away)
  const exchange = {
    MAX_ORDERS: M.MAX_ORDERS,
    open(opts = {}) {
      openedAt = opts.at ? { x: opts.at.x, z: opts.at.z } : null;
      const tab = opts.tab === 'collect' || opts.tab === 'orders' ? 'orders' : opts.tab === 'history' ? 'history' : opts.tab ? 'trade' : undefined;
      events.emit('exchange:open', { source: opts.source || (opts.at ? 'desk' : 'api') });
      return openExchangeWindow(ctx, exchange, { ...opts, tab });
    },
    close() { closeExchangeWindow(ctx); },
    place, cancel, collect, collectAll,
    orders() { return X().orders; },
    history() { return X().history; },
    myFills() { return X().myFills; },
    quote(id) { return M.isTradeable(id) || ITEMS[id] ? quote(id) : null; },
    book(id, levels = 6) {
      const b = npcBook(id);
      // Same order as matching: at one price, player orders fill before the NPC book.
      const asks = [...b.asks, ...playerLevels(id, 'sell')].sort((a, c) => a.price - c.price || tieBreak(a, c)).slice(0, levels);
      const bids = [...b.bids, ...playerLevels(id, 'buy')].sort((a, c) => c.price - a.price || tieBreak(a, c)).slice(0, levels);
      const mine = X().orders.filter((o) => o.item === id && o.status === 'open').map((o) => ({ price: o.price, qty: o.qty - o.filled - o.pend, side: o.side, src: 'you', order: o.id }));
      return { mid: b.mid, bid: b.bid, ask: b.ask, tick: b.tick, asks, bids, mine, bestAsk: asks[0]?.price ?? b.ask, bestBid: bids[0]?.price ?? b.bid };
    },
    chart(id, minutes = 60) { return M.npcHistory(id, Date.now(), minutes + 1, 60000); },
    tape(id) { return tape(id); },
    status() {
      const traders = live.on ? [...remote.makers.entries()].filter(([u, m]) => u !== live.me && m.orders.some((o) => o.status === 'open')).length : 0;
      const pending = net.status('db') === 'pending' || (net.db && net.selfId === undefined);
      return { mode: live.on ? 'live' : pending ? 'connecting' : 'npc', live: live.on, readOnly: live.readOnly, traders, error: live.error };
    },
    slotsFree() { return M.MAX_ORDERS - X().orders.length; },
    // Orders are placed at the Exchange itself (a desk or clerk within a few tiles); prices and
    // your slots can be viewed anywhere.
    atDesk() {
      const P = ctx.player;
      if (!P || !ctx.entities?.near) return true;
      return ctx.entities.near(P.x, P.z, 7).some((e) => e.defId === 'exchange_desk' || (e.kind === 'npc' && /exchange clerk/i.test(e.def?.role || '')));
    },
    boxCount() { return X().orders.filter((o) => o.box.item > 0 || o.box.credit > 0).length; },
    inventoryItems() {
      const seen = new Map();
      for (const s of ctx.inventory?.slots || []) if (s && M.isTradeable(s.id)) seen.set(s.id, (seen.get(s.id) || 0) + s.qty);
      return [...seen.entries()].map(([id, qty]) => ({ id, qty }));
    },
    isTradeable: M.isTradeable,
    search: M.searchItems,
    featured: M.FEATURED,
    get live() { return live.on; },
    update() {
      if (openedAt && exchangeWindowOpen() && ctx.player && Math.max(Math.abs(ctx.player.x - openedAt.x), Math.abs(ctx.player.z - openedAt.z)) > 9) {
        openedAt = null;
        exchange.close();
      }
    },
    // test hook: process NPC fills now
    _npcTick: npcTick,
  };

  events.on('chain:block', ({ block }) => {
    npcTick();
    for (const t of block.txs) {
      if (!t.ambient || t.kind !== 'trade' || !t.token) continue;
      pushTape(t.token.item, { at: t.at, price: t.price, qty: t.token.qty, side: t.side, src: 'sim', who: ctx.chain?.label?.(t.side === 'buy' ? t.from : t.to) || 'simulated' });
    }
  });
  events.on('save:loaded', () => {
    X();
    // Pending settlements survive reloads; re-check them once the live market answers.
    if (live.on) { publishMarket(); afterRemote(); }
  });

  // ---- World options: 'Exchange' (desks, clerks), 'History' (desks), 'Collect' (bank booths, desks)
  registerOptions(ctx, exchange);
  // Chat commands (the ui's '::' commands) for the net windows.
  events.on('game:ready', () => {
    const reg = ctx.ui?.registerCommand;
    if (typeof reg !== 'function') return;
    try {
      reg('exchange', () => exchange.open(), 'Open the Exchange (prices anywhere; orders at a Gildmoor desk)');
      reg('wallet', () => (ctx.ui.selectTab?.('wallet') || ctx.wallet?.open?.()), 'Show your Hood Wallet');
      reg('explorer', (args) => ctx.wallet?.openExplorer?.(args?.[0] ? { query: args[0] } : null), 'Open the ledger explorer (optionally with a tx hash / address)');
      reg('hiscores', (args) => ctx.cloud?.openHiscores?.(args?.[0] || null), 'Show the hiscores (optionally for one skill)');
      reg('players', () => (ctx.ui.selectTab?.('players') || ctx.room?.open?.()), 'Who is in the Vale right now');
    } catch (err) { console.warn('[net] registerCommand failed', err); }
  });
  return exchange;
}

function registerOptions(ctx, exchange) {
  const A = ctx.actions;
  if (!A?.register) return;
  const near = (e) => ({ x: e.x, z: e.z });
  A.register('Exchange', { approach: () => ({ adjacent: true }), start: (e) => { exchange.open({ at: near(e) }); return false; } });
  A.register('History', { approach: () => ({ adjacent: true }), start: (e) => { exchange.open({ at: near(e), tab: 'history' }); return false; } });

  // 'Collect' is shared with other objects (flour bin…): dispatch ours, delegate the rest.
  const ours = (e) => e && (e.defId === 'bank_booth' || e.defId === 'exchange_desk' || e.def?.id === 'bank_booth');
  let prior = A.handlerFor?.({ kind: 'object' }, 'Collect') || null;
  const fallback = () => prior || A.handlerFor?.({ kind: '__net' }, 'Collect') || null;
  const handler = {
    approach(e, o) { return ours(e) ? { adjacent: true } : fallback()?.approach ? fallback().approach(e, o) : { adjacent: true }; },
    start(e, o, extra) {
      if (ours(e)) { exchange.collectAll(); return false; }
      const f = fallback();
      if (!f) { ctx.events.emit('chat:game', { text: 'Nothing interesting happens.', kind: 'game' }); return false; }
      return f.start ? f.start(e, o, extra) : true;
    },
    tick(e, n, c) { if (ours(e)) return false; const f = fallback(); return f?.tick ? f.tick(e, n, c) : false; },
    stop(e, o) { if (!ours(e)) fallback()?.stop?.(e, o); },
    get anim() { return fallback()?.anim; },
  };
  A.register('Collect', handler, 'object');
  // If another module (re)registers 'object:Collect' later, wrap theirs too.
  ctx.events.on('game:ready', () => {
    const cur = A.handlerFor?.({ kind: 'object' }, 'Collect');
    if (cur && cur !== handler) { prior = cur; A.register('Collect', handler, 'object'); }
  });
}
