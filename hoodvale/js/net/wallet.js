// Hood Wallet: the player's CREDIT balance (milli-CREDIT integers) on the simulated chain.
// Owner: net builder (baseline by integration).
// API: balance, canAfford(mc), credit(mc, reason, meta) -> tx, debit(mc, reason, meta) -> tx|null,
//      history() -> recent txs. Emits 'wallet:change' {balance, delta, reason, tx}.

export function createWallet(ctx) {
  const { state, events } = ctx;
  const W = () => state.save.wallet;
  function record(delta, reason, meta) {
    const tx = ctx.chain?.submit?.({ kind: delta >= 0 ? 'credit' : 'debit', from: delta >= 0 ? meta?.from || 'vale' : ctx.chain.address, to: delta >= 0 ? ctx.chain?.address : meta?.to || 'vale', amount: Math.abs(delta), memo: reason, ...meta }) || { hash: '0x', at: Date.now() };
    W().txs.unshift({ hash: tx.hash, delta, reason, at: tx.at });
    if (W().txs.length > 80) W().txs.length = 80;
    state.markDirty();
    events.emit('wallet:change', { balance: W().balance, delta, reason, tx });
    return tx;
  }
  const wallet = {
    get balance() { return W().balance; },
    canAfford(mc) { return W().balance >= mc; },
    credit(mc, reason = '', meta = {}) {
      if (!(mc > 0)) return null;
      W().balance += Math.round(mc);
      return record(Math.round(mc), reason, meta);
    },
    debit(mc, reason = '', meta = {}) {
      mc = Math.round(mc);
      if (!(mc > 0) || W().balance < mc) return null;
      W().balance -= mc;
      return record(-mc, reason, meta);
    },
    history() { return W().txs; },
  };
  return wallet;
}
