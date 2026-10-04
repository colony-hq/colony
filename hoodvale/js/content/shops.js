// STUB — owner: content builder. Shop logic (data/economy.js SHOPS); registers 'Trade'.
export function createShops(ctx) {
  return { buy(shopId, itemId, qty) { return false; }, sell(shopId, itemId, qty) { return false; }, priceBuy() { return 0; }, priceSell() { return 0; }, stock(shopId) { return []; } };
}
