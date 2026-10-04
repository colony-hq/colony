// Market model for the Gildmoor Exchange. Pure (no DOM, no three) so it runs in node tests.
// Owner: net builder.
//
// NPC market makers: every tradeable item has a mid price that random-walks around its `value`
// as a deterministic function of (item, wall-clock time) — every player sees the same NPC price at
// the same moment, even offline. Local trading pressure nudges it. Market makers quote a spread
// with limited, regenerating depth; bids never reach shop sell prices and asks never drop to shop
// buy prices, so shop/Exchange arbitrage does not mint CREDIT.
//
// Player orders (live market): validated here (cleanOrder / cleanFill) because every remote
// document is untrusted, and settled with one shared rule (evaluateOrder) that makers and takers
// both compute from the same documents.

import { ITEMS, ITEM_IDS } from '../data/items.js';
import { createNoise2D, hashString } from '../core/noise.js';

export const MAX_ORDERS = 8;
export const MAX_PRICE = 10_000_000; // mc
export const MAX_QTY = 100_000;
export const TRADEABLE = ITEM_IDS.filter((id) => { const d = ITEMS[id]; return d.tradeable !== false && !d.quest && d.value > 0; });
const TRADE_SET = new Set(TRADEABLE);
export const isTradeable = (id) => typeof id === 'string' && TRADE_SET.has(id);

const noise = createNoise2D(0x4ead);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const frac = (n) => n - Math.floor(n);

export function volatility(def) {
  if (def.value >= 500) return 0.2;
  if (def.equip) return 0.15;
  if (def.sigil) return 0.13;
  if (def.food) return 0.11;
  return 0.12;
}

// NPC mid price (float, mc) at time t (ms). Three octaves: hours, tens of minutes, minutes.
export function npcMid(id, t = Date.now()) {
  const def = ITEMS[id];
  if (!def) return 0;
  const k = (hashString(id) % 4093) * 0.731;
  const m = t / 60000;
  const n = 0.55 * noise(k, m / 180) + 0.3 * noise(k + 311.7, m / 25) + 0.15 * noise(k + 977.3, m / 3.5);
  return def.value * Math.exp(volatility(def) * 1.7 * n);
}

// Quote: { mid, bid, ask, tick } in integer mc (mid stays float). pressure: log-price nudge.
export function npcQuote(id, t = Date.now(), pressure = 0) {
  const def = ITEMS[id];
  const v = def?.value || 1;
  const mid = clamp(npcMid(id, t) * Math.exp(pressure), v * 0.72, v * 1.4);
  const half = v >= 500 ? 0.03 : 0.045;
  const cap = v >= 3 ? Math.floor(v * 0.97) : v;
  const bid = clamp(Math.floor(mid * (1 - half)), 1, cap);
  const ask = Math.max(bid + 1, Math.ceil(mid * (1 + half)));
  const tick = Math.max(1, Math.round(mid * 0.012));
  return { mid, bid, ask, tick };
}

// Quantity a market maker shows per price level.
export function npcDepth(id) {
  const def = ITEMS[id];
  if (!def) return 0;
  if (def.stack) return clamp(Math.round(6000 / (def.value + 6)), 3, 600);
  return clamp(Math.round(320 / (def.value + 12)), 1, 14);
}

// NPC order book (best first). used: { ask, bid } quantity already taken (regenerates elsewhere).
export function npcBook(id, t = Date.now(), pressure = 0, used = null, levels = 5) {
  const q = npcQuote(id, t, pressure);
  const base = npcDepth(id);
  const bucket = Math.floor(t / 30000);
  const seed = hashString(id) % 1000;
  const asks = [], bids = [];
  let ua = Math.max(0, used?.ask || 0), ub = Math.max(0, used?.bid || 0);
  for (let i = 0; i < levels; i++) {
    const j1 = 0.7 + 0.6 * frac(Math.sin(seed * 12.9898 + i * 78.233 + bucket * 3.17) * 43758.5453);
    const j2 = 0.7 + 0.6 * frac(Math.sin(seed * 39.3468 + i * 11.135 + bucket * 1.91) * 24634.6345);
    let qa = Math.max(1, Math.round(base * (1 + 0.6 * i) * j1));
    let qb = Math.max(1, Math.round(base * (1 + 0.6 * i) * j2));
    const ta = Math.min(qa, ua); qa -= ta; ua -= ta;
    const tb = Math.min(qb, ub); qb -= tb; ub -= tb;
    const pa = q.ask + i * q.tick;
    const pb = q.bid - i * q.tick;
    if (qa > 0) asks.push({ price: pa, qty: qa, src: 'npc' });
    if (pb >= 1 && qb > 0) bids.push({ price: pb, qty: qb, src: 'npc' });
  }
  return { ...q, asks, bids };
}

// Recent mid history for charts: points spaced stepMs apart ending at `now`.
export function npcHistory(id, now = Date.now(), points = 61, stepMs = 60000) {
  const out = [];
  for (let i = points - 1; i >= 0; i--) {
    const t = now - i * stepMs;
    out.push({ t, mid: npcQuote(id, t).mid });
  }
  return out;
}

// Walk `levels` (best first) for a taker. side = taker side. Returns fills [{...level, qty}] + left.
export function planTake(levels, qty, limit, side) {
  const fills = [];
  let left = qty;
  for (const L of levels) {
    if (left <= 0) break;
    if (side === 'buy' ? L.price > limit : L.price < limit) break;
    const q = Math.min(left, L.qty);
    if (q <= 0) continue;
    fills.push({ ...L, qty: q });
    left -= q;
  }
  return { fills, left };
}

// Search tradeable items by name (prefix matches first).
export function searchItems(query, limit = 40) {
  const s = String(query || '').trim().toLowerCase();
  if (!s) return [];
  const scored = [];
  for (const id of TRADEABLE) {
    const n = ITEMS[id].name.toLowerCase();
    const i = n.indexOf(s);
    if (i < 0) continue;
    scored.push([i === 0 ? 0 : n.includes(' ' + s) ? 1 : 2, n.length, id]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return scored.slice(0, limit).map((x) => x[2]);
}

export const FEATURED = ['logs', 'oak_logs', 'willow_logs', 'copper_ore', 'tin_ore', 'iron_ore', 'coal', 'bronze_bar', 'iron_bar',
  'steel_bar', 'raw_trout', 'trout', 'raw_lobster', 'lobster', 'feather', 'bowstring', 'leather', 'orbium_shard', 'spark_sigil',
  'bronze_arrow', 'iron_arrow', 'uncut_sapphire', 'spider_silk', 'wolf_pelt'].filter(isTradeable);

// ---------------------------------------------------------------------------
// Remote (untrusted) documents
// ---------------------------------------------------------------------------
const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
export const USER_RE = /^[A-Za-z0-9_.:@+~-]{1,128}$/; // ids also become db path segments
const isInt = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;

export function cleanOrder(o, maker, now = Date.now()) {
  if (!o || typeof o !== 'object' || !USER_RE.test(String(maker || ''))) return null;
  if (!ID_RE.test(String(o.id || ''))) return null;
  if (!isTradeable(o.item) || (o.side !== 'buy' && o.side !== 'sell')) return null;
  if (!isInt(o.price, 1, MAX_PRICE) || !isInt(o.qty, 1, MAX_QTY)) return null;
  const ext = isInt(o.ext, 0, o.qty) ? o.ext : 0;
  const at = Number(o.at);
  if (!Number.isFinite(at) || at > now + 5 * 60000 || at < now - 30 * 86400000) return null;
  const status = o.status === 'open' || o.status === 'filled' || o.status === 'cancelled' ? o.status : null;
  if (!status) return null;
  const closedAt = Number.isFinite(Number(o.closedAt)) ? Number(o.closedAt) : null;
  return { id: o.id, maker, item: o.item, side: o.side, price: o.price, qty: o.qty, ext, at, status, closedAt };
}

export function cleanFill(f, taker, now = Date.now()) {
  if (!f || typeof f !== 'object' || !USER_RE.test(String(taker || ''))) return null;
  if (!ID_RE.test(String(f.id || '')) || !ID_RE.test(String(f.order || '')) || !USER_RE.test(String(f.maker || ''))) return null;
  if (!isTradeable(f.item) || (f.side !== 'buy' && f.side !== 'sell')) return null;
  if (!isInt(f.qty, 1, MAX_QTY) || !isInt(f.price, 1, MAX_PRICE)) return null;
  const at = Number(f.at);
  if (!Number.isFinite(at) || at > now + 5 * 60000 || at < now - 60 * 86400000) return null;
  return { id: f.id, key: taker + '/' + f.id, taker, maker: f.maker, order: f.order, item: f.item, side: f.side, qty: f.qty, price: f.price, at, void: f.void === true };
}

// The one settlement rule. order: cleaned maker order; fills: cleaned fills that reference it.
// A fill is valid when it matches the order's item/side/price, is not void, was made after the
// order opened (and before it was cancelled), and fits in the remaining capacity when every fill
// is taken in (at, key) order. Capacity = qty - ext (units filled outside the live market).
export function evaluateOrder(order, fills) {
  const cap = Math.max(0, order.qty - (order.ext || 0));
  const ok = (fills || []).filter((f) => !f.void && f.maker === order.maker && f.order === order.id && f.item === order.item
    && f.side === order.side && f.price === order.price && f.at >= order.at - 5000
    && !(order.status === 'cancelled' && order.closedAt != null && f.at > order.closedAt));
  ok.sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const valid = new Set();
  let used = 0;
  for (const f of ok) {
    if (used + f.qty <= cap) { used += f.qty; valid.add(f.key); }
  }
  return { valid, used, remaining: order.status === 'open' ? Math.max(0, cap - used) : 0 };
}
