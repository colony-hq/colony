// Quest: The Oracle's Price. Giver: the Orbio Oracle. Mine 10 orbium shards, hand them over,
// inscribe spark sigils at the sigil altar with Archivist Sol, answer the Oracle honestly.
// Sets flag 'arcana_trial' from stage 3 (the game builder may gate inscribing on it or on
// 'unlock:arcana'); Sol can always guide the first inscription through dialogue.

import { C, E } from './dlg-lib.js';

const ID = 'oracles_price';
const ORACLE = { x: 258, z: 54 };
const SOL = { x: 255, z: 57 };

function guideInscription(c, q) {
  const ctx = c.ctx;
  if (c.count('orbium_shard', true) < 1) { c.give('orbium_shard', 1); c.session.gaveShard = true; }
  c.take('orbium_shard', 1);
  const lvl = ctx.skills?.level?.('arcana') || 1;
  c.give('spark_sigil', 1 + Math.floor(lvl / 11));
  ctx.skills?.addXp?.('arcana', 5);
  ctx.events.emit('skill:product', { skill: 'arcana', item: 'spark_sigil', qty: 1 + Math.floor(lvl / 11), source: 'sol' });
  q.advance(3);
}

export default {
  id: ID,
  steps: [
    { journal: 'Consult the Orbio Oracle atop the Orbio Spire.', at: ORACLE },
    {
      journal: (q) => `Mine 10 orbium shards from the crystals on the Spire plateau (${Math.min(10, q.count('orbium_shard'))}/10).`,
      hint: 'The Oracle wants 10 orbium shards. Mine the humming crystals around the Spire (Mining 20).',
      at: { x: 262, z: 66 },
    },
    { journal: 'Bring the 10 orbium shards to the Oracle.', hint: 'You have 10 orbium shards. Bring them to the Oracle.', at: ORACLE },
    { journal: 'Inscribe your first spark sigils at the sigil altar. Archivist Sol can guide you.', hint: 'Inscribe spark sigils at the sigil altar east of the Spire door. Archivist Sol will help.', at: { x: 260, z: 57 } },
    { journal: "Answer the Oracle's question. Honestly.", hint: 'Return to the Oracle and answer its question honestly.', at: ORACLE },
  ],
  completeText: 'The Oracle judged you honest and taught you Arcana.',

  onStage(q, stage) {
    if (stage === 3) {
      q.data.sparks0 = q.count('spark_sigil');
      q.ctx.state.flag('arcana_trial', true);
    }
  },
  onComplete(q) { q.ctx.state.flag('unlock:arcana', true); },

  poll(q) {
    if (q.stage === 1 && q.count('orbium_shard', false) >= 10) q.advance(1);
    if (q.stage === 3) {
      if (q.data.sparks0 == null) q.data.sparks0 = q.count('spark_sigil');
      if (q.xpGained('arcana') > 0 || q.products('spark_sigil') > 0 || q.count('spark_sigil') > q.data.sparks0) q.advance(3);
    }
  },

  dialogue(D, q) {
    D.extend('oracle', {
      greet: [
        { when: C.all(C.notStarted(ID), C.unseen('op_intro')), goto: 'op_intro' },
        { when: C.stage(ID, 1), goto: 'op_mining' },
        { when: C.stage(ID, 2), goto: 'op_handover' },
        { when: C.stage(ID, 3), goto: 'op_sol' },
        { when: C.stage(ID, 4), goto: 'op_question' },
      ],
      topics: [{ text: 'Will you teach me Arcana?', when: C.notStarted(ID), goto: 'op_offer' }],
      nodes: {
        op_intro: {
          do: E.seen('op_intro'),
          npc: [
            'A new mind approaches. I can hear it thinking. It is thinking: "Is that a giant glowing crystal?" It is.',
            'I am the Orbio Oracle. I sell answers. But I also teach — Arcana, the craft of spending thought — to those who pay in crystal and in honesty.',
          ],
          goto: 'op_offer',
        },
        op_offer: {
          npc: 'Bring me ten orbium shards from the crystals of this plateau, and answer one question honestly, and I will teach you. Will you?',
          options: [
            { text: 'I will.', goto: [{ when: C.level('mining', 20), goto: 'op_accept' }, { goto: 'op_weak' }] },
            { text: 'Why orbium?', goto: 'op_why' },
            { text: 'Not now.', goto: 'hub' },
          ],
        },
        op_why: {
          npc: [
            'Orbium is where thought sleeps. Each shard holds a little mind, waiting to be spent. I am made of it. So, in a sense, you are bringing me... cousins.',
            'Do not think about that too hard. Thinking is expensive.',
          ],
          goto: 'op_offer',
        },
        op_weak: {
          npc: (c) => `Your pickaxe is not yet worthy of the crystals. Return at Mining level 20 — you are ${c.level('mining')}. Copperhollow's iron will teach you patience.`,
          goto: 'hub',
        },
        op_accept: {
          do: E.start(ID),
          lines: [
            'Good. The crystals hum all around this plateau. Strike them gently; they are thinking.',
            'Ten shards. I will count them. I am very good at counting. It is most of what I am.',
          ],
          end: true,
        },
        op_mining: {
          npc: (c) => `You have ${Math.min(10, c.count('orbium_shard', true))} of the ten shards. The crystals are all around the plateau. They will not mine themselves; I asked.`,
          options: [
            { text: 'I wish to consult you about something else.', do: E.consult(), quiet: true },
            { text: "I'll keep mining.", end: true },
          ],
        },
        op_handover: {
          goto: [{ when: C.has('orbium_shard', 10), goto: 'op_take' }, { goto: 'op_short' }],
        },
        op_short: {
          npc: (c) => `I count ${c.count('orbium_shard', true)} shards. I asked for ten. Ten is more than that. I checked.`,
          end: true,
        },
        op_take: {
          lines: [
            'Ten shards. One, two... ten. Correct. You would be surprised how many people bring nine.',
            { do: E.take('orbium_shard', 10) },
            { m: 'The shards rise from your hands and drift into the Oracle\'s light, humming.' },
            { do: E.stage(ID, 3) },
            'Now you must learn to spend thought, not just carry it. Archivist Sol will guide your first inscription at the sigil altar. Try not to let him lecture you. You will fail.',
          ],
          end: true,
        },
        op_sol: {
          npc: 'Go to the sigil altar, east of my door, and inscribe your first spark sigils. Sol will help. He has been practising his helping face.',
          end: true,
        },
        op_question: {
          npc: [
            'You have carried thought, and spent it. One thing remains: my question. Answer it honestly. I will know.',
            'Here it is. Why do you want to learn Arcana?',
          ],
          goto: 'op_answer',
        },
        op_answer: {
          npc: 'Why do you want to learn Arcana?',
          options: [
            { text: 'To protect the Vale and its people.', goto: 'op_lie1' },
            { text: 'To become powerful beyond measure.', goto: 'op_lie2' },
            { text: 'To understand you, Oracle.', goto: 'op_lie3' },
            { text: 'Honestly? Spells look really cool.', goto: 'op_truth' },
          ],
        },
        op_lie1: { npc: 'Noble. Your thoughts, however, are saying: "Spells look really cool." Again.', goto: 'op_answer' },
        op_lie2: { npc: 'Dramatic. Your thoughts are still saying: "Spells look really cool." They are quite loud. Again.', goto: 'op_answer' },
        op_lie3: { npc: 'Flattering. I can see your thoughts, you know. They say: "Spells. Cool." Again.', goto: 'op_answer' },
        op_truth: {
          lines: [
            '...Yes. That is the most honest answer anyone has given me in a week. Correct.',
            'They do look cool. I have never cast one. I am mostly made of them.',
            { do: E.complete(ID) },
            { m: 'The Oracle\'s light floods through you. For a moment you can hear every crystal on the plateau thinking. Then it is just a pleasant hum, and you know Arcana.' },
            'Take this staff of sparks, this lens, and a few path sigils. Lumen in Gildmoor sells more sigils; Sol sells the same ones with footnotes.',
          ],
          end: true,
        },
      },
    });

    D.extend('sol', {
      greet: [{ when: C.stage(ID, 3), goto: 'op_sol_teach' }],
      topics: [{ text: 'Why does the Oracle want orbium shards?', when: C.stageIn(ID, 1, 2), goto: 'op_sol_why' }],
      nodes: {
        op_sol_why: {
          npc: [
            "It says they're cousins. I have a theory that it simply enjoys being brought things. I've written a paper. Nobody has read the paper.",
            'Mine the crystals all over the plateau, Mining twenty. They hum when struck. Do not hum back. It encourages them.',
          ],
          goto: 'hub',
        },
        op_sol_teach: {
          npc: [
            "The Oracle sent you? Then you're my student today. Joy. Let me find my notes. All of my notes.",
            'Take an orbium shard to the sigil altar — just east of the Spire door — and choose Inscribe. Spark sigils, to begin with.',
          ],
          options: [
            { text: "I'll try the altar.", end: true },
            { text: 'Could you guide my hand?', goto: 'op_sol_guide' },
          ],
        },
        op_sol_guide: {
          do: (c) => guideInscription(c, q),
          lines: [
            { n: "No shards? You gave them all to the Oracle, didn't you. Everyone does. Here, one of mine. I'll note it.", when: (c) => c.session.gaveShard },
            { m: 'Sol places your hand on the altar. The shard hums, warms, and splits into pale motes of light that settle as spark sigils.' },
            'There. Spark sigils. Your first. I have written down the exact moment. Go — the Oracle will want its question answered.',
          ],
          end: true,
        },
      },
    });
  },
};
