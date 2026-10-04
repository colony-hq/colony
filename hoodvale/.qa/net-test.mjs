// Net builder's node tests: chain, wallet, exchange (NPC + live player orders), room presence/chat,
// cloud mirror + hiscores — with several mocked clients sharing one in-memory backend.
// Run: node .qa/net-test.mjs
import assert from 'node:assert/strict';
import { createEvents } from '../js/core/events.js';
import { freshSave } from '../js/core/state.js';
import { createChain } from '../js/net/chain.js';
import { createWallet } from '../js/net/wallet.js';
import { createExchange } from '../js/net/exchange.js';
import { createRoom, cleanPresence } from '../js/net/room.js';
import { createCloud } from '../js/net/cloud.js';
import { createInventory } from '../js/game/inventory.js';
import { createMockBackend } from '../js/net/mock-caps.js';
import * as M from '../js/net/market.js';
import { ITEMS } from '../js/data/items.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log('  ✓', msg); };

class V3 { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }

function makeClient(label) {
  const events = createEvents();
  const save = freshSave(label);
  save.created = Date.now() + Math.floor(Math.random() * 1000);
  const state = { mode: 'play', save, settings: { showNames: true }, markDirty() {}, flush() { events.emit('save:written', { at: Date.now() }); return true; }, replace(s, source) { this.save = { ...freshSave(s.name), ...s }; events.emit('save:loaded', { source }); } };
  const ents = new Map();
  const ctx = {
    events, state, ticks: { on() {}, count: 0 },
    actions: { reg: {}, register(o, h, k) { this.reg[k ? k + ':' + o : o] = h; }, handlerFor() { return null; }, current: null },
    entities: { add(e) { e.pos = e.pos || new V3(); ents.set(e.uid, e); return e; }, remove(e) { ents.delete(e.uid); }, moveTo(e, x, z) { e.x = x; e.z = z; }, get: (u) => ents.get(u), near: () => [], all: () => ents.values() },
    actors: { create: () => ({ setPosition() {}, setYaw() {}, play() {}, setEquipment() {}, setLook() {}, dispose() {}, headHeight: 1.8 }) },
    map: { heightAt: () => 0, regionAt: () => ({ id: 'overworld' }), zoneAt: () => 'gildmoor' },
    skills: { levels: () => ({ attack: 5, strength: 4, defence: 3, hitpoints: 12 }), totalLevel: () => 40, combatLevel: () => 9, xp: (id) => (id === 'attack' ? 500 : 0) },
    player: { pos: new V3().set(240.5, 0, 169.5), x: 240, z: 169, yaw: 0, moving: false, running: false },
  };
  ctx.chain = createChain(ctx);
  ctx.wallet = createWallet(ctx);
  ctx.inventory = createInventory(ctx);
  ctx.exchange = createExchange(ctx);
  ctx.cloud = createCloud(ctx);
  ctx.room = createRoom(ctx);
  const msgs = [];
  events.on('chat:game', (m) => msgs.push(m.text));
  ctx.msgs = msgs;
  return ctx;
}

console.log('market model');
{
  for (const id of M.TRADEABLE) {
    const q = M.npcQuote(id);
    const v = ITEMS[id].value;
    assert.ok(q.bid >= 1 && q.ask > q.bid, 'spread ' + id);
    assert.ok(q.bid <= Math.max(1, v), 'NPC bid never above value (no shop arbitrage) ' + id);
    assert.ok(q.ask > Math.floor(v * 0.6), 'NPC ask above shop buy price ' + id);
  }
  ok(true, `quotes sane for all ${M.TRADEABLE.length} tradeable items`);
  ok(M.npcQuote('iron_ore', 1e12).mid === M.npcQuote('iron_ore', 1e12).mid, 'NPC price is deterministic in time');
  const o = M.cleanOrder({ id: 'oabc123', item: 'iron_ore', side: 'sell', price: 9, qty: 5, at: Date.now(), status: 'open' }, 'u_a');
  ok(o && o.ext === 0, 'cleanOrder accepts a good order');
  ok(!M.cleanOrder({ id: 'x', item: 'iron_ore', side: 'sell', price: 9, qty: 5, at: Date.now(), status: 'open' }, 'u_a'), 'cleanOrder rejects bad id');
  ok(!M.cleanOrder({ id: 'oabc123', item: 'hood_cowl', side: 'sell', price: 9, qty: 5, at: Date.now(), status: 'open' }, 'u_a'), 'cleanOrder rejects untradeable items');
  ok(!M.cleanOrder({ id: 'oabc123', item: 'iron_ore', side: 'sell', price: 9.5, qty: 5, at: Date.now(), status: 'open' }, 'u_a'), 'cleanOrder rejects fractional prices');
  const f1 = M.cleanFill({ id: 'f11111', maker: 'u_a', order: 'oabc123', item: 'iron_ore', side: 'sell', qty: 3, price: 9, at: Date.now() + 1 }, 'u_b');
  const f2 = M.cleanFill({ id: 'f22222', maker: 'u_a', order: 'oabc123', item: 'iron_ore', side: 'sell', qty: 3, price: 9, at: Date.now() + 2 }, 'u_c');
  const ev = M.evaluateOrder(o, [f2, f1]);
  ok(ev.valid.has(f1.key) && !ev.valid.has(f2.key) && ev.remaining === 2, 'evaluateOrder: earliest fill wins, overfill rejected');
  const cheat = M.cleanFill({ id: 'f33333', maker: 'u_a', order: 'oabc123', item: 'iron_ore', side: 'sell', qty: 1, price: 1, at: Date.now() + 3 }, 'u_d');
  ok(!M.evaluateOrder(o, [cheat]).valid.size, 'evaluateOrder rejects a fill at the wrong price');
}

console.log('chain + wallet');
{
  const c = makeClient('Solo');
  c.chain.update(); // nothing yet
  const tx = c.wallet.credit(5000, 'Quest reward airdrop', { from: 'quests' });
  ok(tx.status === 'pending' && /^0x[0-9a-f]{64}$/.test(tx.hash), 'credit makes a pending tx with a 64-hex hash');
  ok(c.wallet.balance === 5000, 'balance credited');
  ok(c.wallet.debit(999999, 'too much') === null, 'debit beyond balance refused');
  // Force a block.
  await sleep(2700);
  for (let i = 0; i < 3; i++) c.chain.update();
  ok(tx.status === 'confirmed' && tx.block === c.chain.height || tx.block > 0, 'tx confirmed in a block');
  ok(c.wallet.history()[0].block === tx.block, 'wallet history gets the block number');
  ok(c.chain.tx(tx.hash) === tx, 'chain.tx(hash) finds it');
  ok(c.chain.txsFor(c.chain.address).some((t) => t.hash === tx.hash), 'txsFor(address) lists it');
  ok(c.chain.search(tx.hash).type === 'tx' && c.chain.search(c.chain.address).type === 'address' && c.chain.search('iron ore').item === 'iron_ore', 'search resolves tx / address / token');
  ok(c.chain.blocks.length >= 7 && c.chain.blocks.some((b) => b.txs.some((t) => t.ambient)), 'blocks carry simulated ambient txs');
  ok(c.chain.label(c.chain.sysAddress('shop:general')).includes('General Store'), 'system addresses have readable labels');
}

console.log('exchange: NPC market');
{
  const c = makeClient('Trader');
  c.wallet.credit(100000, 'faucet');
  const q = c.exchange.quote('logs');
  const r = c.exchange.place({ item: 'logs', side: 'buy', qty: 5, price: q.ask + 2 });
  ok(r.ok && r.instant === 5, 'buy fills instantly against NPC asks');
  ok(c.inventory.count('logs') === 5, 'items collected into the inventory');
  ok(c.exchange.orders().length === 0, 'completed order frees its slot');
  const spent = 100000 - c.wallet.balance;
  ok(spent <= 5 * (q.ask + 2) && spent >= 5 * q.ask - 5, `paid market price with improvement refunded (${spent} mc)`);
  const before = c.wallet.balance;
  const qs = c.exchange.quote('logs');
  const s = c.exchange.place({ item: 'logs', side: 'sell', qty: 3, price: qs.bid });
  ok(s.ok && c.inventory.count('logs') === 2 && c.wallet.balance > before, 'sell fills against NPC bids, CREDIT collected');
  const rest = c.exchange.place({ item: 'iron_ore', side: 'buy', qty: 4, price: 1 });
  ok(rest.ok && rest.instant === 0 && c.exchange.orders().length === 1, 'low bid rests in the book');
  const bal = c.wallet.balance;
  c.exchange.cancel(rest.order.id);
  ok(c.wallet.balance === bal + 4 && c.exchange.orders().length === 0, 'cancel refunds escrow and frees the slot');
  const noItems = c.exchange.place({ item: 'coal', side: 'sell', qty: 1, price: 5 });
  ok(!noItems.ok, 'cannot sell what you do not have');
  for (let i = 0; i < 8; i++) c.exchange.place({ item: 'coal', side: 'buy', qty: 1, price: 1 });
  ok(!c.exchange.place({ item: 'coal', side: 'buy', qty: 1, price: 1 }).ok, '8-slot limit enforced');
}

console.log('exchange: live player orders (3 clients, mocked db)');
{
  const backend = createMockBackend({ latency: 8 });
  const A = makeClient('Ada'), B = makeClient('Bram'), C = makeClient('Cora');
  A.net.attach(backend.client({ id: 'u_a', name: 'Ada' }));
  B.net.attach(backend.client({ id: 'u_b', name: 'Bram' }));
  C.net.attach(backend.client({ id: 'u_c', name: 'Cora' }));
  await sleep(120);
  ok(A.exchange.status().mode === 'live' && B.exchange.status().mode === 'live', 'clients report a live market');
  A.inventory.add('iron_ore', 5);
  B.wallet.credit(5000, 'faucet'); C.wallet.credit(5000, 'faucet');
  const q = A.exchange.quote('iron_ore');
  const price = q.bid + 1 < q.ask ? q.bid + 1 : q.ask; // below NPC ask, above NPC bid: rests
  const r = A.exchange.place({ item: 'iron_ore', side: 'sell', qty: 5, price });
  ok(r.ok && r.order.live && A.inventory.count('iron_ore') === 0, 'A lists 5 iron ore on the shared book (items escrowed)');
  await sleep(150);
  ok(backend.docs.has('market/u_a') && backend.docs.has(`market/u_a/orders/${r.order.id}`), 'market/{self} index + market/{self}/orders/{id} written');
  const book = B.exchange.book('iron_ore');
  ok(book.asks[0].src === 'player' && book.asks[0].price === price && book.asks[0].qty === 5, 'B sees A\'s order at the top of the book');
  ok(B.exchange.status().traders === 1, 'B counts 1 trader with orders');
  // B and C race for it: B buys 3, then C tries 3 (only 2 left) and also 2.
  const rb = B.exchange.place({ item: 'iron_ore', side: 'buy', qty: 3, price });
  ok(rb.ok && rb.pending === 3, 'B\'s buy matches A\'s player order (pending settlement)');
  await sleep(40);
  ok(backend.docs.has('fills/u_b') && [...backend.docs.keys()].some((k) => k.startsWith('fills/u_b/log/')), 'fill written under fills/{self} (+ fills/{self}/log/{id})');
  const rc = C.exchange.place({ item: 'iron_ore', side: 'buy', qty: 3, price });
  ok(rc.ok && rc.pending === 2, 'C sees only the 2 remaining and takes those');
  await sleep(3400);
  ok(B.inventory.count('iron_ore') === 3, 'B settled: 3 iron ore received');
  ok(C.inventory.count('iron_ore') === 2, 'C settled: 2 iron ore received');
  const cOrder = C.exchange.orders()[0];
  ok(cOrder && cOrder.status === 'open' && cOrder.qty - cOrder.filled === 1, 'C\'s unfilled unit keeps waiting in the book');
  const aOrder = A.exchange.orders().find((o) => o.id === r.order.id);
  ok(aOrder && aOrder.filled === 5 && aOrder.status === 'filled' && aOrder.box.credit === 5 * price, 'A\'s order applied both fills; proceeds wait in the collection box');
  const before = A.wallet.balance;
  A.exchange.collectAll();
  ok(A.wallet.balance === before + 5 * price && A.exchange.orders().length === 0, 'A collects the proceeds and the slot frees');
  // Overfill race: two takers write simultaneously against a 2-unit order.
  A.inventory.add('coal', 2);
  const qc = A.exchange.quote('coal');
  const pc = qc.bid + 1 < qc.ask ? qc.bid + 1 : qc.ask;
  const r2 = A.exchange.place({ item: 'coal', side: 'sell', qty: 2, price: pc });
  await sleep(100);
  const b2 = B.exchange.place({ item: 'coal', side: 'buy', qty: 2, price: pc });
  const c2 = C.exchange.place({ item: 'coal', side: 'buy', qty: 2, price: pc });
  ok(b2.pending === 2 && c2.pending === 2, 'both takers saw 2 available (simultaneous race)');
  await sleep(3500);
  const got = B.inventory.count('coal') + C.inventory.count('coal');
  ok(got === 2, `exactly 2 coal delivered in total (no duplication): B=${B.inventory.count('coal')} C=${C.inventory.count('coal')}`);
  const loser = B.inventory.count('coal') ? C : B;
  ok(loser.exchange.myFills().some((f) => f.void), 'the losing fill is voided and published as void');
  const ao = A.exchange.orders().find((o) => o.id === r2.order.id);
  ok(ao.filled === 2 && ao.box.credit === 2 * pc, 'maker credited exactly once');
  // Live cancel with grace period.
  A.wallet.credit(1000, 'faucet');
  const r3 = A.exchange.place({ item: 'bronze_bar', side: 'buy', qty: 3, price: 1 });
  const bal3 = A.wallet.balance;
  A.exchange.cancel(r3.order.id);
  ok(A.wallet.balance === bal3, 'live cancel waits for in-flight fills before refunding');
  await sleep(3800);
  A.exchange._npcTick();
  ok(A.wallet.balance === bal3 + 3, 'refund lands after the grace period');
  // Untrusted junk in the shared market is ignored.
  const evil = backend.client({ id: 'u_evil', name: 'Evil' });
  await evil.db.doc('market/u_evil').set({ v: 1, at: Date.now(), orders: [{ id: 'oevil1', item: 'iron_ore', side: 'sell', price: -5, qty: 1e9, at: Date.now(), status: 'open' }, { id: '<script>', item: 'iron_ore', side: 'sell', price: 1, qty: 1, at: Date.now(), status: 'open' }, 'garbage', null] });
  let threw = false;
  try { await evil.db.doc('market/u_a').set({ v: 1, at: Date.now(), orders: [] }); } catch (e) { threw = e.code === 'invalid_argument'; }
  ok(threw, 'mock rules: nobody can write another player\'s market doc');
  await sleep(60);
  ok(!B.exchange.book('iron_ore').asks.some((a) => a.maker === 'u_evil'), 'malformed remote orders are dropped');
}

console.log('room: presence, remote players, chat, emotes');
{
  const backend = createMockBackend({ latency: 5 });
  const A = makeClient('Ada'), B = makeClient('Bram');
  A.net.attach(backend.client({ id: 'u_a', name: 'Ada Lovell' }));
  B.net.attach(backend.client({ id: 'u_b', name: 'Bram Stoke' }));
  await sleep(60);
  A.room.update(); B.room.update();
  await sleep(60);
  B.room.update();
  const remotesB = [...B.entities.all()].filter((e) => e.kind === 'remote');
  ok(remotesB.length === 1 && remotesB[0].name === 'Ada Lovell', 'B renders A as a remote entity named via user.profiles');
  ok(remotesB[0].options().join(',') === 'Follow,Examine' && remotesB[0].level === 9, 'remote entity has Follow/Examine and combat level');
  ok(B.room.peers.length === 2 && B.room.status().mode === 'live', 'peers list includes you + A');
  A.player.pos.set(244.5, 0, 171.5); A.player.moving = true;
  await sleep(240); A.room.update(); await sleep(400); B.room.update();
  const e = remotesB[0];
  ok(e.pos.x > 240.5 && e.pos.x <= 244.5, `remote position interpolates (x=${e.pos.x.toFixed(2)})`);
  const heard = [];
  B.events.on('chat:public', (m) => heard.push(m));
  ok(A.room.say('Hello <b>Vale</b>‮\u0000!') === true, 'say() emits on topic chat');
  await sleep(40);
  ok(heard.length === 1 && heard[0].from === 'Ada Lovell' && heard[0].text === 'Hello <b>Vale</b> !', 'B hears it, text sanitised (no control/bidi chars), from = profile name');
  for (let i = 0; i < 6; i++) backend; // noop
  const spam = backend.client({ id: 'u_s', name: 'Spammer' });
  for (let i = 0; i < 10; i++) spam.room.emit('chat', { v: 1, t: 'spam ' + i });
  await sleep(40);
  ok(heard.filter((m) => m.text.startsWith('spam')).length === 3, 'per-peer chat rate limit (3 per 6 s)');
  const emotes = [];
  B.events.on('emote:remote', (m) => emotes.push(m));
  A.events.emit('emote', { name: 'wave' });
  spam.room.emit('emote', { v: 1, e: '<img onerror=alert(1)>' });
  await sleep(40);
  ok(emotes.length === 1 && emotes[0].name === 'wave', 'local emote broadcast; unknown emote names dropped');
  ok(cleanPresence({ v: 1, st: 'play', x: 'NaN', z: 3 }).st === 'menu' && cleanPresence({ v: 1, st: 'play', x: 1, z: 2, lk: { top: 'red;}', body: 'male', evil: 1 }, eq: { weapon: 'bronze_sword', head: 'bronze_sword' } }).eq.head === undefined, 'presence sanitiser drops bad coords, colours, keys and mismatched equipment');
  spam.leave();
  A.net.caps.room && backend; // keep
  await sleep(30);
  B.room.update();
  ok(B.room.peers.every((p) => p.peer !== spam.peer), 'left peers disappear');
}

console.log('cloud: mirror + hiscores');
{
  const backend = createMockBackend({ latency: 5 });
  const A = makeClient('Ada');
  A.net.attach(backend.client({ id: 'u_a', name: 'Ada' }));
  await sleep(80);
  A.events.emit('game:start', {});
  await sleep(120);
  ok(A.cloud.status().phase === 'synced', 'no cloud save yet -> synced immediately');
  ok(backend.docs.has('data/users/u_a/save') && backend.docs.get('data/users/u_a/save').save.name === 'Ada', 'save mirrored privately to data/users/{self}/save');
  ok(backend.docs.has('players/u_a') && backend.docs.get('players/u_a').total === 40 && !('name' in backend.docs.get('players/u_a')), 'hiscore row has numbers only (no names)');
  const other = backend.client({ id: 'u_b', name: 'Bram' });
  const priv = await other.db.doc('data/users/u_a/save').get();
  ok(!priv.exists, 'another viewer cannot read the private save');
  const rows = await new Promise((res) => { const off = A.cloud.hiscores.subscribe(null, (r, meta) => { if (meta.live) { off(); res(r); } }); });
  ok(rows.length === 1 && rows[0].id === 'u_a', 'hiscores query returns players');
}

console.log(`\n${passed} checks passed`);
process.exit(0);
