// Simulated Robinhood Chain ledger (testnet-style, entirely in-page). Owner: net builder
// (baseline by integration). Every wallet movement becomes a tx in a block. Nothing here touches
// a real network or real value.
//
// API: address (player's 0x… address), submit({kind, from, to, amount, item, qty, memo}) -> tx,
//      blocks (recent, newest first), height, txs(addr?) , onBlock via events 'chain:block'.

import { hashString } from '../core/noise.js';

const hex = (n, len) => (n >>> 0).toString(16).padStart(8, '0').repeat(Math.ceil(len / 8)).slice(0, len);
export function fakeHash(seed, len = 64) {
  let h = hashString(String(seed));
  let out = '';
  while (out.length < len) { h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; out += hex(h, 8); }
  return '0x' + out.slice(0, len);
}

export function createChain(ctx) {
  const { events, state } = ctx;
  let height = 1_284_000 + Math.floor((Date.now() / 2000) % 100000);
  let pending = [];
  const blocks = [];
  let acc = 0;
  const chain = {
    name: 'Robinhood Chain (simulated)',
    get address() { return '0x' + fakeHash('addr:' + state.save.name + state.save.created, 40).slice(2); },
    get height() { return height; },
    blocks,
    submit(tx) {
      const t = { ...tx, hash: fakeHash(JSON.stringify(tx) + Math.random()), at: Date.now(), status: 'pending' };
      pending.push(t);
      events.emit('chain:tx', { tx: t });
      return t;
    },
    update(dt) {
      acc += dt;
      if (acc < 2) return;
      acc = 0;
      height++;
      const block = { number: height, hash: fakeHash('block' + height), at: Date.now(), txs: pending.map((t) => ({ ...t, status: 'confirmed', block: height })) };
      for (const t of pending) { t.status = 'confirmed'; t.block = height; }
      pending = [];
      blocks.unshift(block);
      if (blocks.length > 40) blocks.pop();
      events.emit('chain:block', { block });
    },
  };
  return chain;
}
