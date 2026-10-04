// STUB — owner: npc-ai. Simulated CREDIT purse. API: DESIGN.md §Credit.
export const TIERS = {
  redup: { id: 'redup', label: 'Redup', cost: 0.002 },
  sedang: { id: 'sedang', label: 'Sedang', cost: 0.01 },
  terang: { id: 'terang', label: 'Terang', cost: 0.04 },
};
export function createCredit(ctx) {
  const c = () => ctx.state.progress.credit;
  return {
    TIERS,
    get balance() { return c().balance; },
    canAfford(tier) { return c().balance + 1e-9 >= TIERS[tier].cost; },
    spend(tier, meta = {}) { return null; },
    earn(amount, reason = '') {},
    update() {},
  };
}
