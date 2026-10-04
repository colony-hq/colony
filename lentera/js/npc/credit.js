// Simulated CREDIT purse (Orbio-style inference credit). Owner: npc-ai. API: DESIGN.md §7 Credit.
//
// Nothing here is real money and nothing touches the network: every spend produces a fake
// receipt (token count, model label, short tx hash) that the UI labels "simulasi".
// State lives in state.progress.credit = { balance, spent, earned, thoughts, byTier, ledger[] }.
//   byTier       : number of paid thoughts per tier ({redup, sedang, terang})
//   byTierSpent  : CREDIT spent per tier (added field)
//   ledger       : newest last, capped at LEDGER_CAP. Entries:
//                  { kind: 'spend', id, tier, cost, tokens, model, hash, tx, balanceAfter, at, npcId, topicId, label }
//                  { kind: 'earn',  id, amount, reason, label, count, balanceAfter, at }

export const TIERS = {
  redup: {
    id: 'redup', label: 'Redup', cost: 0.002, model: 'Model kecil · 8B',
    tokens: [40, 120], thinkMs: 700, blurb: 'Murah. Sering ngawur.',
  },
  sedang: {
    id: 'sedang', label: 'Sedang', cost: 0.01, model: 'Model menengah · 70B',
    tokens: [150, 350], thinkMs: 1300, blurb: 'Lumayan. Kadang samar.',
  },
  terang: {
    id: 'terang', label: 'Terang', cost: 0.04, model: 'Model frontier',
    tokens: [300, 700], thinkMs: 2200, blurb: 'Mahal. Jernih dan tepat.',
  },
};
export const TIER_ORDER = ['redup', 'sedang', 'terang'];
export const tierRank = (tier) => TIER_ORDER.indexOf(tier);

export const START_BALANCE = 0.5;
export const KILAU_VALUE = 0.003;
export const SARNI_GIFT = 0.05;
export const LEDGER_CAP = 60;

const round6 = (v) => Math.round(v * 1e6) / 1e6;

// "0.040" — always 3 decimals (render in DM Mono). sign: prefix + / − (U+2212).
export function formatCredit(value, { sign = false } = {}) {
  const v = Number(value) || 0;
  const abs = Math.abs(v).toFixed(3);
  if (!sign) return (v < 0 ? '−' : '') + abs;
  return (v < 0 ? '−' : '+') + abs;
}

function hex(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

// Deterministic pseudo-random in [0, 1) from a string (stable token counts per answer).
export function hash01(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Plausible token count for an answer of `text` at `tier` (prompt + reasoning + completion).
export function estimateTokens(tier, text = '', seed = '') {
  const T = TIERS[tier] || TIERS.redup;
  const [lo, hi] = T.tokens;
  const completion = Math.round(text.length / 3.6);
  const r = hash01(seed + '|' + tier + '|' + text.length);
  const overhead = tier === 'redup' ? 12 + r * 38 : tier === 'sedang' ? 125 + r * 150 : 235 + r * 290;
  return Math.max(lo, Math.min(hi, Math.round(completion + overhead)));
}

export function createCredit(ctx) {
  const { state, events } = ctx;
  let seq = 0;

  const purse = () => {
    const c = state.progress.credit;
    // Older saves may miss newer fields.
    if (!c.byTier) c.byTier = { redup: 0, sedang: 0, terang: 0 };
    if (!c.byTierSpent) c.byTierSpent = { redup: 0, sedang: 0, terang: 0 };
    if (!Array.isArray(c.ledger)) c.ledger = [];
    return c;
  };

  function pushLedger(entry) {
    const c = purse();
    c.ledger.push(entry);
    if (c.ledger.length > LEDGER_CAP) c.ledger.splice(0, c.ledger.length - LEDGER_CAP);
  }

  const credit = {
    TIERS,
    TIER_ORDER,
    simulated: true,
    get balance() { return purse().balance; },
    get purse() { return purse(); },

    cost(tier) { return TIERS[tier]?.cost ?? Infinity; },
    canAfford(tier) { return purse().balance + 1e-9 >= (TIERS[tier]?.cost ?? Infinity); },
    cheapestAffordable() { return TIER_ORDER.find((t) => credit.canAfford(t)) || null; },

    // Pay for one thought. Returns a receipt, or null when the purse is too thin.
    // meta: { npcId, topicId, label, text, tokens }
    spend(tier, meta = {}) {
      const T = TIERS[tier];
      if (!T || !credit.canAfford(tier)) return null;
      const c = purse();
      c.balance = round6(Math.max(0, c.balance - T.cost));
      c.spent = round6((c.spent || 0) + T.cost);
      c.thoughts = (c.thoughts || 0) + 1;
      c.byTier[tier] = (c.byTier[tier] || 0) + 1;
      c.byTierSpent[tier] = round6((c.byTierSpent[tier] || 0) + T.cost);
      const tx = '0x' + hex(16);
      const receipt = {
        id: 'tx-' + Date.now().toString(36) + '-' + (++seq),
        kind: 'spend',
        tier,
        cost: T.cost,
        tokens: meta.tokens ?? estimateTokens(tier, meta.text || '', (meta.npcId || '') + ':' + (meta.topicId || '')),
        model: T.model,
        hash: tx.slice(0, 4) + '…' + tx.slice(-2), // 0x3f…a9
        tx,
        balanceAfter: c.balance,
        at: Date.now(),
        playTime: Math.round(state.progress.playTime || 0),
        npcId: meta.npcId || null,
        topicId: meta.topicId || null,
        label: meta.label || '',
        simulated: true,
      };
      pushLedger(receipt);
      events.emit('credit:change', { balance: c.balance, delta: -T.cost, reason: meta.reason || 'think', tier });
      return receipt;
    },

    // Add CREDIT (kilau pickups, Sarni's gift, ...). Consecutive kilau pickups merge into one
    // ledger row so 60 sparkles do not flush the thought history.
    earn(amount, reason = '') {
      const a = Number(amount) || 0;
      if (a <= 0) return purse().balance;
      const c = purse();
      c.balance = round6(c.balance + a);
      c.earned = round6((c.earned || 0) + a);
      const last = c.ledger[c.ledger.length - 1];
      if (last && last.kind === 'earn' && last.reason === reason && reason === 'kilau') {
        last.amount = round6(last.amount + a);
        last.count = (last.count || 1) + 1;
        last.balanceAfter = c.balance;
        last.at = Date.now();
      } else {
        pushLedger({
          kind: 'earn',
          id: 'rx-' + Date.now().toString(36) + '-' + (++seq),
          amount: a,
          reason,
          label: reason === 'kilau' ? 'Kilau' : reason,
          count: 1,
          balanceAfter: c.balance,
          at: Date.now(),
          playTime: Math.round(state.progress.playTime || 0),
          simulated: true,
        });
      }
      events.emit('credit:change', { balance: c.balance, delta: a, reason, tier: null });
      return c.balance;
    },

    // Mbah Sarni's one-time gift (§4): only when the purse is below the cheapest thought.
    giftEligible() {
      return purse().balance + 1e-9 < TIERS.redup.cost && !state.flag('gift_sarni');
    },
    grantSarniGift() {
      if (!credit.giftEligible()) return false;
      state.flag('gift_sarni', true);
      credit.earn(SARNI_GIFT, 'Hadiah Mbah Sarni');
      return true;
    },

    // Averages for the journal: CREDIT spent per clue recorded.
    stats() {
      const c = purse();
      const clues = (state.progress.clues || []).length;
      return {
        balance: c.balance,
        spent: c.spent || 0,
        earned: c.earned || 0,
        thoughts: c.thoughts || 0,
        byTier: { ...c.byTier },
        byTierSpent: { ...c.byTierSpent },
        clues,
        perClue: clues ? (c.spent || 0) / clues : null,
      };
    },

    format: formatCredit,
    update() {},
  };

  events.on('kilau:collect', () => credit.earn(KILAU_VALUE, 'kilau'));

  return credit;
}
