// NPC "minds": hand-written tiered answers, topic unlocking, greetings, and the (disabled)
// OrbioClient hook. Owner: npc-ai. API: DESIGN.md §7 Mind.
//
//   topicsFor(npcId) -> [{ id, label, ask, kind, available, asked (tier|null), isNew, hint }]
//   greeting(npcId)  -> string (free; advances the visit counter, may set a `once` flag)
//   think(npcId, topicId, tier) -> Promise<{ text, tier, tokens, source: 'local'|'orbio', clue,
//                                            receipt, replay, cost, model, error? }>
// think() is the whole transaction: it bills CREDIT through ctx.credit (unless this topic was
// already paid at >= tier, which replays for free), records state.progress.asked, applies story
// flags, waits the tier's thinking time and resolves with the answer + clue (or null).

import { NPC_LINES, makeHelpers, resolveText, pickVariant, topicUnlocked, KEY_CLUES, clueBase } from './lines.js';
import { TIERS, TIER_ORDER, tierRank, estimateTokens } from './credit.js';
import { OrbioClient } from './orbio-client.js';

export { OrbioClient };

const REPLAY_MS = 420;

const TIER_STYLE = {
  redup: 'Jawab 1–3 kalimat. Kamu model kecil yang setengah tidur: percaya diri tapi keliru, salah dengar kata (lentera/lele, candi/kandang), terlalu harfiah, kadang berputar-putar, lucu. Jangan memberi petunjuk yang benar.',
  sedang: 'Jawab 1–3 kalimat. Setengah benar dan agak samar: beri arah umum saja, tanpa detail tepat.',
  terang: 'Jawab 2–4 kalimat. Tajam, hangat, spesifik, sebut landmark yang nyata. Gunakan fakta di bawah.',
};

export function createMind(ctx) {
  const { state } = ctx;
  const client = new OrbioClient({});
  const helpers = (npcId) => makeHelpers(state.progress, npcId);
  const npcOf = (npcId) => NPC_LINES[npcId] || null;
  const topicOf = (npcId, topicId) => npcOf(npcId)?.topics.find((t) => t.id === topicId) || null;
  const askedKey = (npcId, topicId) => `${npcId}:${topicId}`;
  const turnOf = (npcId) => Number(state.progress.flags['talks_' + npcId]) || 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function askedTier(npcId, topicId) {
    const a = state.progress.asked || (state.progress.asked = {});
    return a[askedKey(npcId, topicId)] || null;
  }

  function line(npcId, listName) {
    const npc = npcOf(npcId);
    if (!npc) return '';
    const h = helpers(npcId);
    const list = npc[listName];
    if (Array.isArray(list) && typeof list[0] === 'string') return resolveText(list, h, turnOf(npcId) + Math.floor(Math.random() * list.length));
    const v = pickVariant(list, h);
    return v ? resolveText(v.text, h, turnOf(npcId) + Math.floor(Math.random() * 3)) : '';
  }

  const mind = {
    client,
    lines: NPC_LINES,
    TIERS,

    meta(npcId) {
      const n = npcOf(npcId);
      if (!n) return { id: npcId, name: npcId, role: '', where: '' };
      return { id: n.id, name: n.name, role: n.role, where: n.where, bio: n.bio ? n.bio(helpers(npcId)) : '' };
    },

    topicsFor(npcId) {
      const npc = npcOf(npcId);
      if (!npc) return [];
      const h = helpers(npcId);
      const open = [], locked = [];
      for (const t of npc.topics) {
        const available = topicUnlocked(t, h);
        const asked = askedTier(npcId, t.id);
        const row = { id: t.id, label: t.label, ask: t.ask, kind: t.kind, available, asked, isNew: available && !asked, hint: available ? '' : (t.lockHint || '') };
        (available ? open : locked).push(row);
      }
      return open.concat(locked);
    },

    // Free greeting. Picks the first matching variant (ordered by story priority).
    greeting(npcId) {
      const npc = npcOf(npcId);
      if (!npc) return '…';
      const h = helpers(npcId);
      let chosen = null;
      for (const v of npc.greetings) {
        if (v.once && h.flag(v.once)) continue;
        let ok = false;
        try { ok = !v.when || v.when(h); } catch { ok = false; }
        if (ok) { chosen = v; break; }
      }
      const text = chosen ? resolveText(chosen.text, h, h.visits) : '…';
      if (chosen?.once) state.flag(chosen.once, true);
      state.progress.flags['talks_' + npcId] = h.visits + 1;
      return text;
    },
    moreLine(npcId) { return line(npcId, 'more'); },
    byeLine(npcId) { return line(npcId, 'bye'); },
    giftLine(npcId) { return npcOf(npcId)?.gift || ''; },

    askedTier,
    // What a question would cost right now.
    quote(npcId, topicId, tier) {
      const prev = askedTier(npcId, topicId);
      const replay = !!prev && tierRank(prev) >= tierRank(tier);
      const cost = replay ? 0 : TIERS[tier].cost;
      const affordable = replay || (ctx.credit ? ctx.credit.canAfford(tier) : true);
      return { tier, cost, replay, affordable, tokens: mind.tokensFor(npcId, topicId, tier), thinkMs: replay ? REPLAY_MS : TIERS[tier].thinkMs };
    },
    tokensFor(npcId, topicId, tier) {
      const t = topicOf(npcId, topicId);
      return estimateTokens(tier, t?.[tier]?.text || '', askedKey(npcId, topicId));
    },

    // Raw hand-written answer (no side effects).
    answerData(npcId, topicId, tier) { return topicOf(npcId, topicId)?.[tier] || null; },

    // System + user prompt the OrbioClient would receive.
    promptFor(npcId, topicId, tier) {
      const npc = npcOf(npcId);
      const t = topicOf(npcId, topicId);
      const facts = t?.terang?.text || '';
      return {
        system: [
          npc?.persona || '',
          'Bahasa Indonesia santai dan natural. ' + TIER_STYLE[tier],
          tier === 'redup' ? '' : 'Fakta (jangan disebut sebagai fakta, sampaikan dengan suaramu): ' + facts,
        ].filter(Boolean).join('\n'),
        prompt: t?.ask || topicId,
        tier,
      };
    },

    async think(npcId, topicId, tier) {
      const npc = npcOf(npcId);
      const topic = topicOf(npcId, topicId);
      if (!npc || !topic || !TIERS[tier]) {
        return { text: '…', tier, tokens: 0, source: 'local', clue: null, receipt: null, replay: false, cost: 0, error: 'unknown' };
      }
      const data = topic[tier];
      const q = mind.quote(npcId, topicId, tier);
      let receipt = null;
      if (!q.replay) {
        receipt = ctx.credit?.spend(tier, { npcId, topicId, label: `${npc.name} — ${topic.label}`, text: data.text, tokens: q.tokens }) ?? null;
        if (!receipt && ctx.credit) {
          await sleep(300);
          return { text: '', tier, tokens: 0, source: 'local', clue: null, receipt: null, replay: false, cost: 0, error: 'insufficient' };
        }
        state.progress.asked[askedKey(npcId, topicId)] = tier;
      }

      const started = performance.now();
      let text = data.text;
      let source = 'local';
      let tokens = receipt?.tokens ?? q.tokens;
      if (!q.replay && client.ready) {
        try {
          const r = await client.think(mind.promptFor(npcId, topicId, tier));
          text = r.text;
          source = 'orbio';
          if (r.tokens) tokens = r.tokens;
        } catch { /* fall back to the hand-written line */ }
      }
      const left = q.thinkMs - (performance.now() - started);
      if (left > 0) await sleep(left);

      for (const f of data.flags || []) state.flag(f, true);
      const clue = data.clue ? {
        id: data.clue.id,
        text: data.clue.text,
        source: npc.name,
        tier,
        kind: KEY_CLUES.includes(clueBase(data.clue.id)) || topic.kind === 'petunjuk' ? 'petunjuk' : 'catatan',
        npcId,
        topicId,
      } : null;
      return {
        text, tier, tokens, source, clue, receipt, replay: q.replay, cost: q.replay ? 0 : TIERS[tier].cost,
        model: TIERS[tier].model,
      };
    },

    update() {},
  };

  return mind;
}

export { TIER_ORDER };
