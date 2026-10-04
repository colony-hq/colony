// The Orbio Oracle: 'Consult' → topic → thought tier (Spark / Lamp / Beacon, THOUGHT_TIERS) →
// wallet.debit("Oracle thought (Beacon)") → hand-written answer. "Live" asks the real model via
// the artifact `sample` capability (when granted) with the game's facts as context, at the Beacon
// price, falling back to the hand-written Beacon answer on any failure. Owner: content builder.
//
// API: consult(entity?), ask(topicId, tier) -> text (no UI, charges), answerFor(topicId, tier),
//      liveAvailable, liveState, topics. Events out: oracle:answer {tier, live, topic, text,
//      question}. Stats: state.save.stats.thoughts[tier]++ (+ thoughts.live for Live answers).

import { THOUGHT_TIERS } from '../data/economy.js';
import { NPCS } from '../data/npcs.js';
import { QUEST_BY_ID, QUESTS } from '../data/quests.js';
import { formatCredit } from '../data/items.js';
import { h, injectStyle } from '../core/dom.js';
import { TOPIC_GROUPS, ANSWERS, QUEST_SPARK, KEYWORDS } from './oracle-answers.js';
import { buildPrompt } from './oracle-live.js';
import { GIVER_PLACES } from './quests.js';

const TIERS = ['spark', 'lamp', 'beacon'];
const cr = (mc) => formatCredit(mc) + ' CREDIT';

export function createOracle(ctx) {
  const { events, state } = ctx;
  let sampleFn = null;
  let liveState = 'unknown'; // unknown | ready | none | denied

  // Resolve the capability early (asks the viewer nothing; may take a while to decide), and again
  // lazily at consult time if it wasn't available yet.
  let resolving = null;
  function resolveLive() {
    if (sampleFn || liveState === 'denied' || resolving) return resolving;
    try {
      const use = typeof window !== 'undefined' ? window.claude?.use : null;
      if (typeof use !== 'function') { liveState = 'none'; return null; }
      resolving = Promise.resolve(use.call(window.claude, 'sample'))
        .then((fn) => { sampleFn = typeof fn === 'function' ? fn : null; if (liveState !== 'denied') liveState = sampleFn ? 'ready' : 'none'; })
        .catch(() => { liveState = 'none'; })
        .finally(() => { resolving = null; });
    } catch { liveState = 'none'; }
    return resolving;
  }
  resolveLive();

  const oracleDef = () => NPCS.oracle;
  const speaker = (tag) => ({ name: tag ? `The Orbio Oracle · ${tag}` : 'The Orbio Oracle', kind: 'oracle', npcId: 'oracle', look: oracleDef()?.look, tier: tag || null });

  // ------------------------------------------------------------------ answers
  function questAnswer(tier) {
    const quests = ctx.quests;
    const active = QUESTS.filter((q) => quests?.isActive?.(q.id));
    const t = quests?.tracked?.();
    const q = (t && QUEST_BY_ID[t.id]) || active[0];
    if (!q) {
      if (tier === 'spark') return 'Your quest is to find your quest. Look under a rock. Not that one. That one is Gary.';
      if (tier === 'lamp') return 'You have no quest. Talk to people. Some of them have problems; most of them will tell you about them at length.';
      const next = QUESTS.find((x) => quests?.status?.(x.id) === 'not_started' && quests?.canStart?.(x.id)?.ok);
      if (!next) return 'You have no quest in progress, and none you are ready for yet. Train your combat and skills; the quests will wait for you.';
      return `You have no quest in progress. You are ready for "${next.name}": talk to ${NPCS[next.giver]?.name} ${GIVER_PLACES[next.giver] || ''}. ${next.summary}`;
    }
    if (tier === 'spark') return QUEST_SPARK[q.id] || 'Walk in a circle until the quest completes itself. It has worked for me, but I am a crystal.';
    if (tier === 'lamp') return `Ah, ${q.name}. ${q.summary} The rest you must discover. Or pay for a Beacon.`;
    const st = quests.stage(q.id);
    const step = quests.journal(q.id).find((x) => x.current)?.text || q.steps[st] || '';
    const hint = quests.hint(q.id)?.text;
    return `${q.name}, step ${st + 1} of ${q.steps.length}: ${step}${hint && !step.includes(hint.replace(/^[^:]+: /, '')) ? ' ' + hint.replace(/^[^:]+: /, '') : ''}`;
  }
  function answerFor(topic, tier) {
    if (topic === 'myquest') return questAnswer(tier);
    const a = ANSWERS[topic];
    if (!a) return 'Hmmmm. The crystal is cloudy on that.';
    if (tier === 'beacon' && a.beaconDone) {
      const doneQuest = topic === 'sheriff_secret' ? 'ledger_of_lies' : topic === 'wyrm_lore' ? 'ashen_wyrm' : null;
      if (doneQuest && ctx.quests?.isDone?.(doneQuest)) return a.beaconDone;
    }
    return a[tier] || a.beacon;
  }
  const topicLabel = (topic) => (topic === 'myquest' ? 'my quest' : ANSWERS[topic]?.label || topic);
  const topicQuestion = (topic) => (topic === 'myquest' ? 'What should I do next in my quest?' : ANSWERS[topic]?.q || topic);

  function charge(tier, live) {
    const t = THOUGHT_TIERS[tier];
    const tx = ctx.wallet?.debit?.(t.cost, `Oracle thought (${live ? 'Live' : t.label})`, { to: 'orbio:oracle', tier, live: !!live });
    return !!tx;
  }
  // (The UI chat prints oracle:answer, so the answer is not echoed to chat:game here.)
  function record(tier, live, topic, text, question) {
    const th = state.save.stats.thoughts || (state.save.stats.thoughts = { spark: 0, lamp: 0, beacon: 0 });
    th[tier] = (th[tier] || 0) + 1;
    if (live) th.live = (th.live || 0) + 1;
    state.markDirty();
    events.emit('oracle:answer', { tier, live: !!live, topic, text, question: question || topicQuestion(topic) });
  }
  function routeQuestion(text) {
    for (const [re, topic] of KEYWORDS) if (re.test(text)) return topic;
    return null;
  }

  // ------------------------------------------------------------------ live (sample capability)
  async function live(s, question, fallbackTopic) {
    const cost = THOUGHT_TIERS.beacon.cost;
    if (!ctx.wallet?.canAfford?.(cost)) { await s.frame(speaker(), `A Live thought costs ${cr(cost)}. Your wallet holds ${cr(ctx.wallet?.balance ?? 0)}.`); return; }
    const fn = sampleFn;
    const fallback = async (why) => {
      if (!fallbackTopic) { await s.frame(speaker(), `${why} Without it, I cannot see that question clearly. No CREDIT was spent.`); return; }
      if (!charge('beacon', false)) return;
      const text = answerFor(fallbackTopic, 'beacon');
      record('beacon', false, fallbackTopic, text);
      await s.frame(speaker(), why);
      await s.frame(speaker('Beacon'), text);
    };
    if (!fn) { await fallback('The live mind is beyond reach right now; I will answer from my own light, as a Beacon.'); return; }
    const ctl = new AbortController();
    let result = null, error = null;
    const call = Promise.resolve().then(() => fn(buildPrompt(ctx, question), { modelTier: 'quick', signal: ctl.signal })).then((r) => { result = r; }, (e) => { error = e || { code: 'error' }; });
    let waitUi;
    try { waitUi = Promise.resolve(ctx.ui?.dialogue?.({ speaker: speaker('Live'), text: 'The Oracle reaches beyond the Vale for a waking mind... (thinking)', options: ['Stop waiting'] })); }
    catch { waitUi = new Promise(() => {}); }
    const winner = await Promise.race([
      call.then(() => 'done'),
      waitUi.then((i) => (i === 0 ? 'stop' : 'dismiss')),
      s.closedP.then(() => 'closed'),
    ]);
    if (winner !== 'done') {
      ctl.abort();
      if (winner === 'closed') return;
      if (winner === 'dismiss') { s.close(); return; }
      await s.frame(speaker(), 'You stop waiting. The thought dissolves unspent. No CREDIT was taken.');
      return;
    }
    if (error) {
      const code = error.code || 'error';
      if (code === 'cancelled') return;
      if (code === 'not_granted' || code === 'sampling_disabled' || code === 'not_declared') {
        liveState = 'denied';
        await fallback('The live mind is closed to you — permission was not granted. I will answer from my own light instead, as a Beacon.');
      } else if (code === 'rate_limited') {
        await fallback('Too many minds are asking the live mind at once. I will answer from my own light instead, as a Beacon.');
      } else {
        console.warn('[oracle] live answer failed', code, error.message);
        await fallback('The live mind flickered and went dark. I will answer from my own light instead, as a Beacon.');
      }
      return;
    }
    const text = String(result?.text || '').trim().replace(/\s+\n/g, '\n').slice(0, 900);
    if (!text) { await fallback('The live mind was silent. I will answer from my own light instead, as a Beacon.'); return; }
    if (!charge('beacon', true)) { await s.frame(speaker(), 'Your wallet emptied while I was thinking. Curious.'); return; }
    record('beacon', true, fallbackTopic || 'custom', text, question);
    await s.frame(speaker('Live — answered by Claude'), text + (result?.truncated ? ' …' : ''));
  }

  // Free-text question box (only when the live mind is available). askBox.cancel() closes it.
  let cancelAsk = null;
  function askBox() {
    return new Promise((resolve) => {
      const root = typeof document !== 'undefined' ? document.getElementById('windows') : null;
      if (!root) { resolve(null); return; }
      injectStyle('content-oracle', `
        .hv-oracle-ask { width: min(420px, calc(100vw - 32px)); padding: 14px 16px; display: grid; gap: 10px; }
        .hv-oracle-ask p { margin: 0; color: var(--parch-dim); font-size: var(--fs-s); }
        .hv-oracle-ask textarea { width: 100%; box-sizing: border-box; resize: none; font: var(--fs-m)/1.35 var(--font-body); color: var(--ink); background: var(--paper); border: 1px solid #000; border-radius: 4px; padding: 8px; }
        .hv-oracle-ask .row { display: flex; gap: 8px; justify-content: flex-end; }
      `);
      const input = h('textarea', { rows: 3, maxlength: 240, placeholder: 'Ask the Oracle anything about the Vale…' });
      let done = false;
      const finish = (v) => { if (done) return; done = true; cancelAsk = null; el.remove(); resolve(v && v.trim() ? v.trim() : null); };
      cancelAsk = () => finish(null);
      const el = h('div.hv-window.hv-panel.hv-oracle-ask', { 'data-interactive': '', role: 'dialog', 'aria-label': 'Ask the Oracle' }, [
        h('h2.hv-title', { text: 'Ask the Oracle' }),
        h('p', { text: `Your question goes to a live mind beyond the Vale (Claude). It costs as a Beacon thought: ${cr(THOUGHT_TIERS.beacon.cost)}. You have ${cr(ctx.wallet?.balance ?? 0)}.` }),
        input,
        h('div.row', {}, [
          h('button.hv-btn', { text: 'Cancel', onclick: () => finish(null) }),
          h('button.hv-btn.primary', { text: 'Ask', onclick: () => finish(input.value) }),
        ]),
      ]);
      input.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(input.value); }
        else if (ev.key === 'Escape') finish(null);
      });
      root.append(el);
      setTimeout(() => input.focus(), 30);
    });
  }

  // ------------------------------------------------------------------ the consultation
  async function chooseTopic(s) {
    for (;;) {
      const liveOk = sampleFn && liveState !== 'denied';
      const groups = [...TOPIC_GROUPS.map((g) => g.label), ...(liveOk ? ['Ask in my own words (Live).'] : []), 'Nothing more.'];
      const g = await s.frame(speaker(), s.first ? `The light brightens. "Ask, and pay. Your wallet holds ${cr(ctx.wallet?.balance ?? 0)}. What do you seek?"` : '"What else do you seek?"', groups);
      s.first = false;
      if (g == null) return null;
      if (g >= TOPIC_GROUPS.length) {
        if (liveOk && g === TOPIC_GROUPS.length) return { custom: true };
        return null;
      }
      const group = TOPIC_GROUPS[g];
      if (group.topics.length === 1) return { topic: group.topics[0] };
      const labels = group.topics.map((t) => topicLabel(t));
      const i = await s.choose(speaker(), `"${group.label}"`, [...labels, 'Back.']);
      if (i == null) return null;
      if (i < labels.length) return { topic: group.topics[i] };
    }
  }
  async function chooseTier(s, topic) {
    const bal = ctx.wallet?.balance ?? 0;
    const tierOpts = TIERS.map((t) => `${THOUGHT_TIERS[t].label} — ${cr(THOUGHT_TIERS[t].cost)}. ${THOUGHT_TIERS[t].blurb}`);
    const liveOk = sampleFn && liveState !== 'denied';
    const opts = [...tierOpts, ...(liveOk ? [`Live — ${cr(THOUGHT_TIERS.beacon.cost)}. A real mind beyond the Vale answers.`] : []), 'Never mind.'];
    const i = await s.frame(speaker(), `"${topicQuestion(topic)}" How much thought will you buy? (You have ${cr(bal)}.)`, opts);
    if (i == null || i >= opts.length - 1) return null;
    return i < 3 ? TIERS[i] : 'live';
  }

  async function flow(s) {
    s.first = true;
    for (;;) {
      const pick = await chooseTopic(s);
      if (!pick || s.closed) return;
      if (pick.custom) {
        try { ctx.ui?.closeDialogue?.(); } catch { /* ignore */ }
        const question = await Promise.race([askBox(), s.closedP.then(() => null)]);
        if (s.closed) { cancelAsk?.(); return; }
        if (!question) continue;
        await live(s, question, routeQuestion(question));
      } else {
        const tier = await chooseTier(s, pick.topic);
        if (!tier || s.closed) { if (s.closed) return; continue; }
        if (tier === 'live') await live(s, topicQuestion(pick.topic), pick.topic);
        else {
          const cost = THOUGHT_TIERS[tier].cost;
          if (!ctx.wallet?.canAfford?.(cost)) {
            await s.frame(speaker(), `A ${THOUGHT_TIERS[tier].label} thought costs ${cr(cost)}. Your wallet holds ${cr(ctx.wallet?.balance ?? 0)}. Thought is not free; that is rather the point.`);
          } else if (charge(tier, false)) {
            const text = answerFor(pick.topic, tier);
            record(tier, false, pick.topic, text);
            await s.frame(speaker(THOUGHT_TIERS[tier].label), text);
          }
        }
      }
      if (s.closed) return;
      const again = await s.frame(speaker(), 'The light dims to a patient glow. "Another question?"', ['Yes.', 'No, thank you.']);
      if (again !== 0) return;
    }
  }

  const oracle = {
    topics: TOPIC_GROUPS,
    get liveAvailable() { return !!sampleFn && liveState !== 'denied'; },
    get liveState() { return liveState; },
    answerFor,
    // Programmatic ask (no UI): charges the tier and returns the hand-written answer, or null.
    ask(topic, tier = 'beacon') {
      if (!THOUGHT_TIERS[tier] || !charge(tier, false)) return null;
      const text = answerFor(topic, tier);
      record(tier, false, topic, text);
      return text;
    },
    async consult(entity) {
      const pending = resolveLive();
      if (pending) await Promise.race([pending, new Promise((r) => setTimeout(r, 400))]);
      const e = entity && entity.kind === 'npc' ? entity : ctx.entities?.get?.('n:oracle') || entity || null;
      const st = ctx.quests?.stage?.('oracles_price');
      const shards = ctx.inventory?.count?.('orbium_shard') || 0;
      // Quest moments are handled by the Oracle's talk tree.
      if ((st === 2 && shards >= 10) || st === 4 || (st == null && !state.flag('seen:op_intro'))) return ctx.dialogue?.start?.(e || 'oracle');
      return ctx.dialogue?.converse?.(e, oracleDef(), flow);
    },
    update() {},
  };

  ctx.actions?.register?.('Consult', {
    approach(e) { return { adjacent: true }; },
    start(e) { oracle.consult(e); return false; },
  });

  return oracle;
}
