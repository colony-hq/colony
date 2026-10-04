// Hood Wallet: the player's CREDIT balance (milli-CREDIT integers) on the simulated chain.
// Owner: net builder.
// API (DESIGN §9): balance, canAfford(mc), credit(mc, reason, meta) -> tx, debit(mc, reason, meta)
//   -> tx|null, history() -> recent entries. Emits 'wallet:change' {balance, delta, reason, tx}.
// Additions: address, open() (wallet window; the same view as the side-panel tab),
//   openExplorer(target?) where target = {tx: hash} | {address} | {block: n} | {query}.
// meta: { from?, to? (names like 'shop:general', 'oracle', 'vale' or 0x addresses), item?, qty?,
//         kind? } — counterparties appear in the explorer with readable labels.
// History entries: { hash, delta, reason, at, block, kind, cp (counterparty address), item?, qty? }

import { registerNetTab, openNetWindow } from './netui.js';
import { renderWalletTab, openExplorer, walletTabIcon } from './ui-wallet.js';

export function createWallet(ctx) {
  const { state, events } = ctx;
  const W = () => {
    const w = state.save.wallet || (state.save.wallet = { balance: 0, txs: [] });
    if (!Array.isArray(w.txs)) w.txs = [];
    if (!Number.isFinite(w.balance)) w.balance = 0;
    return w;
  };
  const awaiting = new Map(); // hash -> history entry (block number arrives with the next block)

  function record(delta, reason, meta = {}) {
    const chain = ctx.chain;
    const self = chain?.address;
    const cp = delta >= 0 ? meta.from || 'vale' : meta.to || 'vale';
    const tx = chain?.submit?.({
      kind: meta.kind || (delta >= 0 ? 'credit' : 'debit'),
      from: delta >= 0 ? cp : self, to: delta >= 0 ? self : cp,
      amount: Math.abs(delta), memo: reason,
      ...(meta.item ? { token: { item: meta.item, qty: meta.qty || 1 } } : {}),
    }) || { hash: '0x' + Math.random().toString(16).slice(2).padEnd(64, '0'), at: Date.now() };
    const entry = {
      hash: tx.hash, delta, reason: String(reason || '').slice(0, 140), at: tx.at || Date.now(), block: tx.block ?? null,
      kind: tx.kind || (delta >= 0 ? 'credit' : 'debit'), cp: delta >= 0 ? tx.from : tx.to,
      ...(meta.item ? { item: meta.item, qty: meta.qty || 1 } : {}),
    };
    W().txs.unshift(entry);
    if (W().txs.length > 120) W().txs.length = 120;
    if (entry.block == null) awaiting.set(entry.hash, entry);
    state.markDirty();
    events.emit('wallet:change', { balance: W().balance, delta, reason, tx });
    return tx;
  }

  const wallet = {
    get balance() { return W().balance; },
    get address() { return ctx.chain?.address || ''; },
    canAfford(mc) { return W().balance >= mc; },
    credit(mc, reason = '', meta = {}) {
      mc = Math.round(mc);
      if (!(mc > 0)) return null;
      W().balance += mc;
      return record(mc, reason, meta || {});
    },
    debit(mc, reason = '', meta = {}) {
      mc = Math.round(mc);
      if (!(mc > 0) || W().balance < mc) return null;
      W().balance -= mc;
      return record(-mc, reason, meta || {});
    },
    history() { return W().txs; },
    open() {
      return openNetWindow(ctx, 'net-wallet', { title: 'Hood Wallet', width: 380, render: (el) => renderWalletTab(ctx, el) });
    },
    openExplorer(target) { return openExplorer(ctx, target); },
  };

  // Confirmations: fill in block numbers when the next block includes our txs.
  events.on('chain:block', ({ block }) => {
    if (!awaiting.size) return;
    let changed = false;
    for (const t of block.txs) {
      const e = awaiting.get(t.hash);
      if (e) { e.block = block.number; awaiting.delete(t.hash); changed = true; }
    }
    if (changed) { state.markDirty(); events.emit('wallet:confirm', { block: block.number }); }
  });
  // A reload loses the in-memory mempool: entries saved while still pending were sequenced by the
  // block after them, so stamp them with the current head.
  events.on('save:loaded', () => {
    awaiting.clear();
    const head = ctx.chain?.height;
    if (head) for (const e of W().txs) if (e.block == null) e.block = head;
  });

  registerNetTab(ctx, {
    id: 'wallet', title: 'Hood Wallet', icon: walletTabIcon, order: 70,
    render: (el) => renderWalletTab(ctx, el),
    onShow: (el) => renderWalletTab(ctx, el),
  });

  return wallet;
}
