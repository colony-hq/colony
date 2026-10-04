// Simulated Robinhood Chain (L2-flavoured testnet, entirely in-page). Owner: net builder.
// Nothing here touches a real network or real value: blocks, hashes and every other account
// ("simulated adventurers", NPC market makers) are generated locally for flavour.
//
// API (DESIGN §9 + additions):
//   name, info, simulated (true), address (player 0x…), height, blocks (newest first),
//   submit({kind, from, to, amount, token?: {item, qty}, memo, ...}) -> tx (status 'pending' until
//   the next block), tx(hash), txsFor(address, limit), block(number), latestTxs(limit),
//   finality(tx) -> 'pending'|'soft'|'final', label(address), sysAddress(name), isSelf(address),
//   tokenOf(itemId) -> {contract, tokenId, symbol, standard, name}, itemOfToken(tokenId),
//   search(query) -> {type: 'tx'|'address'|'block'|'token', ...} | null, tps.
// Events: chain:tx {tx}, chain:block {block}.
//
// Tx shape: { hash, kind, from, to, amount (mc), token?: {item, qty, tokenId}, memo, at, nonce,
//             status: 'pending'|'confirmed', block, gasUsed, ambient?: true (simulated world tx) }

import { hashString, mulberry32 } from '../core/noise.js';
import { ITEMS, ITEM_IDS, formatCredit } from '../data/items.js';
import { SHOPS, THOUGHT_TIERS } from '../data/economy.js';
import { TRADEABLE, npcQuote } from './market.js';
import { netHub } from './caps.js';

export const BLOCK_MS = 2000;
export const BATCH_BLOCKS = 30;
const GENESIS = Date.UTC(2026, 0, 1);
const KEEP_BLOCKS = 150;
const OWN_KEEP = 400;

export const CHAIN_INFO = {
  name: 'Robinhood Chain',
  network: 'Hoodvale simulated testnet',
  chainId: 'sim-4663',
  currency: 'CREDIT',
  sequencer: 'hoodvale-seq-1 (simulated)',
  settlement: 'simulated L1',
};

// Deterministic hex hash of any seed (not cryptographic; flavour only).
export function fakeHash(seed, len = 64) {
  const rand = mulberry32(hashString(String(seed)));
  let out = '';
  while (out.length < len) out += ((rand() * 0x100000000) >>> 0).toString(16).padStart(8, '0');
  return '0x' + out.slice(0, len);
}

const ITEMS_CONTRACT = fakeHash('contract:hvi-1155', 40);
const SYS_LABELS = {
  vale: 'Vale Treasury', exchange: 'Gildmoor Exchange (escrow contract)', oracle: 'Orbio Inference Pool',
  sheriff: "Sheriff's Treasury", hood: 'The Hood (redistribution fund)', medic: 'Brightwater Medic',
  bank: 'The Ledger House', debug: 'Testnet faucet (debug)', faucet: 'Testnet faucet', quests: 'Quest airdrops',
  paymaster: 'Hood paymaster (gas sponsor)', items: 'Hoodvale Items (HVI-1155)', thieving: 'Pockets of the wealthy',
};
const SIM_NAMES = ['Tamsin', 'Oswin', 'Brannoc', 'Elspeth', 'Corwin', 'Hesper', 'Jory', 'Linnet', 'Maudry', 'Pell', 'Quillon',
  'Rowena', 'Sabine', 'Tobiah', 'Wenna', 'Ysolde', 'Caddock', 'Dorrit', 'Ebba', 'Fenwick', 'Gisla', 'Hollis', 'Kester', 'Larkin',
  'Merrow', 'Nell', 'Orrin', 'Perrin', 'Rook', 'Saffron', 'Teague', 'Ulric', 'Vesper', 'Wilmot', 'Yarrow', 'Zinnia', 'Bracken',
  'Cress', 'Idony', 'Jessamy'];
const MAKERS = ['Gildmoor Maker #1', 'Gildmoor Maker #2', 'Gildmoor Maker #3', 'Saltreach Maker', 'Copperhollow Maker'];

const titleCase = (s) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const isAddr = (s) => typeof s === 'string' && /^0x[0-9a-f]{40}$/i.test(s);

export function tokenOf(itemId) {
  const idx = ITEM_IDS.indexOf(itemId);
  if (idx < 0) return null;
  const def = ITEMS[itemId];
  return { contract: ITEMS_CONTRACT, tokenId: idx + 1, symbol: 'HVI#' + (idx + 1), standard: def.stack ? 'HVI-1155 · fungible' : 'HVI-1155 · unique', name: def.name, item: itemId };
}

export function createChain(ctx) {
  const { events, state } = ctx;
  netHub(ctx); // start asking for capabilities early (db/user/room); never awaited
  const labels = new Map();
  const blocks = [];
  const byHash = new Map();
  const own = []; // the player's txs (newest first), kept beyond block pruning
  let pending = [];
  let seq = 0;
  let height = Math.floor((Date.now() - GENESIS) / BLOCK_MS);
  let nextAt = performance.now() + 600;
  let lastFinal = height - (height % BATCH_BLOCKS) - 1;
  const rng = mulberry32((Date.now() ^ 0x5eed) >>> 0);

  let addrKey = '', addrVal = '';
  const selfAddress = () => {
    const key = state.save.name + '|' + state.save.created;
    if (key !== addrKey) { addrKey = key; addrVal = fakeHash('addr:' + state.save.name + state.save.created, 40); }
    return addrVal;
  };

  function sysAddress(name) {
    const n = String(name || 'vale');
    if (isAddr(n)) return n.toLowerCase();
    const a = fakeHash('sys:' + n, 40);
    if (!labels.has(a)) {
      let label = SYS_LABELS[n];
      if (!label && n.startsWith('shop:')) label = 'Shop · ' + (SHOPS[n.slice(5)]?.name || titleCase(n.slice(5)));
      if (!label && n.startsWith('sim:')) label = 'Simulated adventurer ' + n.slice(4);
      if (!label && n.startsWith('mm:')) label = 'NPC market maker · ' + n.slice(3);
      if (!label && n.startsWith('player:')) label = 'Adventurer (live market)';
      labels.set(a, label || titleCase(n));
    }
    return a;
  }
  for (const k of Object.keys(SYS_LABELS)) sysAddress(k);
  const sims = SIM_NAMES.map((n) => sysAddress('sim:' + n));
  const makers = MAKERS.map((n) => sysAddress('mm:' + n));
  labels.set(ITEMS_CONTRACT, SYS_LABELS.items);

  const isSelf = (a) => typeof a === 'string' && a.toLowerCase() === selfAddress();
  const mine = (t) => isSelf(t.from) || isSelf(t.to);

  function makeTx(tx, extra = {}) {
    const at = Date.now();
    const t = {
      kind: 'transfer', amount: 0, memo: '', ...tx, ...extra,
      from: tx.from ? sysAddress(tx.from) : sysAddress('vale'),
      to: tx.to ? sysAddress(tx.to) : sysAddress('vale'),
      at, status: 'pending', block: null,
    };
    t.amount = Math.max(0, Math.round(Number(t.amount) || 0));
    if (tx.token?.item || tx.item) {
      const item = tx.token?.item || tx.item;
      const tok = tokenOf(item);
      if (tok) t.token = { item, qty: Math.max(1, Math.round(tx.token?.qty || tx.qty || 1)), tokenId: tok.tokenId };
    }
    t.memo = String(t.memo || '').slice(0, 140);
    t.gasUsed = 21000 + (t.token ? 34000 : 0) + t.memo.length * 16;
    t.hash = fakeHash(`${at}:${seq++}:${rng()}:${t.from}:${t.to}:${t.amount}`);
    return t;
  }

  const chain = {
    name: CHAIN_INFO.name + ' (simulated)',
    info: CHAIN_INFO,
    simulated: true,
    get address() { return selfAddress(); },
    get height() { return height; },
    get lastFinal() { return lastFinal; },
    blocks,
    get pending() { return pending; },
    get tps() {
      const n = Math.min(10, blocks.length);
      if (n < 2) return 0;
      let c = 0;
      for (let i = 0; i < n; i++) c += blocks[i].txs.length;
      return c / ((blocks[0].at - blocks[n - 1].at) / 1000 || 1);
    },
    sysAddress,
    isSelf,
    tokenOf,
    itemOfToken(tokenId) { const id = ITEM_IDS[Number(tokenId) - 1]; return id || null; },
    label(addr) {
      if (!addr) return '';
      if (isSelf(addr)) return 'You · ' + (state.save.name || 'Adventurer');
      return labels.get(String(addr).toLowerCase()) || '';
    },
    setLabel(addr, label) { if (isAddr(addr)) labels.set(addr.toLowerCase(), label); },

    submit(tx) {
      const t = makeTx(tx || {});
      if (mine(t)) {
        const w = state.save.wallet;
        w.nonce = (w.nonce || 0) + 1;
        t.nonce = w.nonce;
        own.unshift(t);
        if (own.length > OWN_KEEP) own.length = OWN_KEEP;
      }
      pending.push(t);
      byHash.set(t.hash, t);
      events.emit('chain:tx', { tx: t });
      return t;
    },

    tx(hash) {
      if (!hash) return null;
      const h = String(hash).toLowerCase();
      const t = byHash.get(h);
      if (t) return t;
      // Older own txs survive in the wallet history (persisted with the save).
      const e = (state.save.wallet?.txs || []).find((x) => x.hash === h);
      return e ? archived(e) : null;
    },

    txsFor(address, limit = 60) {
      const a = String(address || '').toLowerCase();
      const out = new Map();
      for (const t of pending) if (t.from === a || t.to === a) out.set(t.hash, t);
      for (const b of blocks) for (const t of b.txs) if (t.from === a || t.to === a) out.set(t.hash, t);
      if (isSelf(a)) {
        for (const t of own) out.set(t.hash, t);
        for (const e of state.save.wallet?.txs || []) if (!out.has(e.hash)) out.set(e.hash, archived(e));
      }
      return [...out.values()].sort((x, y) => y.at - x.at).slice(0, limit);
    },

    latestTxs(limit = 40) {
      const out = [...pending].reverse();
      for (const b of blocks) { for (const t of b.txs) out.push(t); if (out.length >= limit) break; }
      return out.slice(0, limit);
    },

    block(number) { return blocks.find((b) => b.number === Number(number)) || null; },

    finality(t) {
      if (!t || t.status === 'pending' || t.block == null) return 'pending';
      return t.block <= lastFinal ? 'final' : 'soft';
    },

    search(q) {
      const s = String(q || '').trim().toLowerCase();
      if (!s) return null;
      if (/^0x[0-9a-f]{64}$/.test(s)) return { type: 'tx', hash: s, tx: chain.tx(s) };
      if (/^0x[0-9a-f]{40}$/.test(s)) return { type: 'address', address: s };
      if (/^#?\d{1,10}$/.test(s)) return { type: 'block', number: Number(s.replace('#', '')), block: chain.block(s.replace('#', '')) };
      if (/^0x[0-9a-f]{6,}$/.test(s)) {
        for (const [hsh] of byHash) if (hsh.startsWith(s)) return { type: 'tx', hash: hsh, tx: byHash.get(hsh) };
        for (const e of state.save.wallet?.txs || []) if (e.hash?.startsWith(s)) return { type: 'tx', hash: e.hash, tx: archived(e) };
      }
      const tokenNum = /^hvi#?(\d+)$/.exec(s);
      if (tokenNum) { const it = chain.itemOfToken(tokenNum[1]); if (it) return { type: 'token', item: it }; }
      const id = ITEM_IDS.find((x) => ITEMS[x].name.toLowerCase() === s) || ITEM_IDS.find((x) => ITEMS[x].name.toLowerCase().includes(s));
      if (id) return { type: 'token', item: id };
      return null;
    },

    update() {
      const now = performance.now();
      if (now < nextAt) return;
      const target = Math.floor((Date.now() - GENESIS) / BLOCK_MS);
      if (target - height > 20) height = target - 1; // tab was hidden: catch up in one step
      mint();
      // ~2 s with jitter, nudged toward the wall-clock schedule.
      const drift = height - target;
      nextAt = now + BLOCK_MS * (0.8 + rng() * 0.4) + Math.max(-600, Math.min(600, drift * 250));
    },
  };

  function archived(e) {
    const self = selfAddress();
    const cp = e.cp || sysAddress('vale');
    return {
      hash: e.hash, kind: e.kind || (e.delta >= 0 ? 'credit' : 'debit'), amount: Math.abs(e.delta || 0),
      from: e.delta >= 0 ? cp : self, to: e.delta >= 0 ? self : cp, memo: e.reason || '', at: e.at,
      block: e.block ?? null, status: e.block != null ? 'confirmed' : 'pending', token: e.item ? { item: e.item, qty: e.qty || 1, tokenId: tokenOf(e.item)?.tokenId } : undefined,
      gasUsed: 21000, archived: true,
    };
  }

  function mint(at = Date.now()) {
    height++;
    const txs = pending;
    pending = [];
    for (const t of ambient()) { txs.push(t); byHash.set(t.hash, t); }
    for (const t of txs) { t.status = 'confirmed'; t.block = height; }
    const parent = blocks[0]?.hash || fakeHash('block' + (height - 1));
    const block = {
      number: height, hash: fakeHash('block:' + height + ':' + parent), parent, at, txs,
      gasUsed: txs.reduce((s, t) => s + (t.gasUsed || 21000), 0), sequencer: CHAIN_INFO.sequencer,
      batch: Math.floor(height / BATCH_BLOCKS),
    };
    if (height % BATCH_BLOCKS === 0) lastFinal = height - 1; // previous batch posted to (simulated) L1
    blocks.unshift(block);
    while (blocks.length > KEEP_BLOCKS) {
      const old = blocks.pop();
      for (const t of old.txs) if (!mine(t)) byHash.delete(t.hash);
    }
    events.emit('chain:block', { block });
  }

  // ---- Ambient (simulated) world activity -----------------------------------------------
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  function poisson(mean) {
    const L = Math.exp(-mean);
    let k = 0, p = 1;
    do { k++; p *= rng(); } while (p > L && k < 30);
    return k - 1;
  }
  function ambient() {
    const t = Date.now() / 1000;
    const busy = 0.5 + 0.5 * Math.sin((t / 600) * Math.PI * 2) * Math.sin((t / 97) * Math.PI * 2 + 1);
    const n = Math.min(14, poisson(1.2 + 4.2 * busy + (rng() < 0.07 ? 6 : 0)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = rng();
      if (r < 0.46) out.push(simTrade());
      else if (r < 0.64) {
        const a = pick(sims); let b = pick(sims); if (b === a) b = sims[(sims.indexOf(a) + 1) % sims.length];
        out.push(makeTx({ kind: 'transfer', from: a, to: b, amount: 1 + Math.floor(rng() * rng() * 900), memo: pick(['Split the loot', 'For the arrows', 'Thanks for the carry', 'Rent for the boat', 'Lost a bet on the troll', 'Payment: 3 trout']) }, { ambient: true }));
      } else if (r < 0.8) {
        const tier = pick(['spark', 'spark', 'lamp', 'lamp', 'beacon']);
        out.push(makeTx({ kind: 'inference', from: pick(sims), to: 'oracle', amount: THOUGHT_TIERS[tier].cost, memo: `Orbio inference · ${THOUGHT_TIERS[tier].label} tier` }, { ambient: true }));
      } else if (r < 0.92) {
        out.push(makeTx({ kind: 'rebalance', from: pick(makers), to: 'exchange', amount: 50 + Math.floor(rng() * 4000), memo: 'Market maker rebalance (NPC)' }, { ambient: true }));
      } else {
        out.push(makeTx({ kind: 'airdrop', from: 'quests', to: pick(sims), amount: pick([250, 400, 600, 1200]), memo: 'Quest reward airdrop' }, { ambient: true }));
      }
    }
    return out;
  }
  function simTrade() {
    // Cheap goods trade most often.
    let id = pick(TRADEABLE);
    for (let k = 0; k < 2 && ITEMS[id].value > 200; k++) id = pick(TRADEABLE);
    const q = ctx.exchange?.quote?.(id) || npcQuote(id);
    const buy = rng() < 0.5;
    const def = ITEMS[id];
    const qty = def.stack ? 1 + Math.floor(rng() * rng() * Math.max(5, 3000 / (def.value + 5))) : 1 + Math.floor(rng() * rng() * 4);
    const price = buy ? q.ask : q.bid;
    const sim = pick(sims), mm = pick(makers);
    return makeTx({
      kind: 'trade', from: buy ? sim : mm, to: buy ? mm : sim, amount: price * qty, token: { item: id, qty },
      memo: `Exchange fill · ${buy ? 'buy' : 'sell'} ${qty} × ${def.name} @ ${formatCredit(price)}`,
    }, { ambient: true, side: buy ? 'buy' : 'sell', price });
  }

  // Warm start: a few blocks of history so the explorer is never empty.
  height -= 6;
  for (let i = 5; i >= 0; i--) mint(Date.now() - i * BLOCK_MS);

  return chain;
}
