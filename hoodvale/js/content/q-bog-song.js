// Quest: Bog Song. Giver: Old Wren (Mistfen). Gather 3 willow bark (knife on a willow, or bark
// from chopping willows, or Wren strips willow logs) + 2 spider silk, then slay the singing bog
// lurker at Fen Mere. One lurker near the mere is renamed and sings overhead during stage 3.

import { C, E, pick } from './dlg-lib.js';

const ID = 'bog_song';
const WREN = { x: 52, z: 160 };
const MERE = { x: 44, z: 176 };
const SONG = [
  '♪ Come down, come down, where the water is warm... ♪',
  '♪ Lie down in the reeds, little one, lie down... ♪',
  '♪ Sleep in the mud, sleep in the mud... ♪',
  '♪ Hmmm-mm-mmm... closer... closer... ♪',
  '♪ The mere is deep and the mere is kind... ♪',
];

let singer = null;
function findSinger(q) {
  if (singer && singer.alive !== false && q.ctx.entities?.get?.(singer.uid)) return singer;
  const all = q.ctx.entities?.byKind?.('monster') || [];
  const lurkers = all.filter((e) => e.defId === 'bog_lurker' && e.alive !== false);
  if (!lurkers.length) return null;
  lurkers.sort((a, b) => Math.hypot(a.x - MERE.x, a.z - MERE.z) - Math.hypot(b.x - MERE.x, b.z - MERE.z));
  singer = lurkers[0];
  singer.questSinger = true;
  singer.baseName = singer.baseName || singer.name;
  singer.name = 'Singing bog lurker';
  return singer;
}
function unmark() {
  if (singer) { singer.name = singer.baseName || 'Bog lurker'; singer.questSinger = false; }
  singer = null;
}
function silence(q) {
  if (q.advance(3)) {
    q.msg('As the lurker sinks into the mire, the singing stops mid-note. The fen is suddenly, wonderfully quiet.');
    unmark();
  }
}

export default {
  id: ID,
  steps: [
    { journal: 'Talk to Old Wren in her hut in Mistfen.', at: WREN },
    {
      journal: (q) => `Gather 3 willow bark (${Math.min(3, q.count('willow_bark'))}/3) — use a knife on a willow in Mistfen — and 2 spider silk (${Math.min(2, q.count('spider_silk'))}/2) from the giant spiders north of the fen.`,
      hint: 'Old Wren needs 3 willow bark (use a knife on a willow tree) and 2 spider silk (giant spiders, north of the fen).',
      at: { x: 58, z: 168 },
    },
    { journal: 'Bring the willow bark and spider silk to Old Wren.', hint: 'You have the ingredients. Bring them to Old Wren.', at: WREN },
    { journal: 'Defeat the singing bog lurker at Fen Mere.', hint: 'Wren\'s remedy will keep the song out of your head. Find the singing bog lurker at Fen Mere, south-west of her hut.', at: MERE },
    { journal: 'Tell Old Wren the song has stopped.', hint: 'The singing has stopped. Tell Old Wren.', at: WREN },
  ],
  completeText: 'The singing in Mistfen stopped, and the frogs came back. Old Wren thanked you with a sapphire amulet.',

  onStage(q, stage) { if (stage === 3) findSinger(q); else unmark(); },
  onComplete() { unmark(); },

  install(ctx, q) {
    // Knife on a willow tree peels bark (no Woodcutting level needed) during the gathering stage.
    ctx.actions?.registerUse?.((itemId, target) => itemId === 'knife' && target?.defId === 'tree_willow', {
      approach: () => ({ adjacent: true }),
      start() {
        if (!q.active || q.stage > 2) { ctx.events.emit('chat:game', { text: 'You have no use for willow bark right now.', kind: 'game' }); return false; }
        if (q.count('willow_bark') >= 3) { ctx.events.emit('chat:game', { text: 'You already have enough bark for Old Wren.', kind: 'game' }); return false; }
        ctx.player?.setAnim?.('cut');
        ctx.events.emit('chat:game', { text: 'You start peeling bark from the willow...', kind: 'game' });
        return true;
      },
      tick(e, n, cur) {
        cur.t = (cur.t || 0) + 1;
        if (cur.t % 3) return true;
        q.give('willow_bark', 1);
        ctx.events.emit('chat:game', { text: 'You peel a long strip of willow bark.', kind: 'game' });
        return q.count('willow_bark') < 3;
      },
      stop() { ctx.player?.setAnim?.(null); },
    });

    // The singer sings; Mistfen hums with it.
    let next = 0;
    ctx.ticks?.on?.((n) => {
      if (n < next || ctx.state.mode !== 'play' || !q.active) return;
      next = n + 10 + Math.floor(Math.random() * 8);
      const p = ctx.player;
      if (!p) return;
      if (q.stage === 3) {
        const s = findSinger(q);
        if (s && Math.max(Math.abs(p.x - s.x), Math.abs(p.z - s.z)) < 30) ctx.dialogue?.say?.(s, pick(SONG), { secs: 5 });
      }
      if (q.stage <= 3 && q.zone() === 'mistfen' && Math.random() < 0.15) {
        q.msg(pick(['A faint, beautiful singing drifts over the water...', 'Somewhere out on the mere, someone is singing. Your feet want to follow.', 'The singing again. Lovely. Terrible. Lovely.']));
      }
    }, 92);
  },

  poll(q) {
    if (q.stage === 1 && q.count('willow_bark') >= 3 && q.count('spider_silk') >= 2) q.advance(1);
    if (q.stage === 3 && q.kills('bog_lurker') > 0) silence(q);
  },
  on: {
    kill(p, q) { if (q.stage === 3 && p.defId === 'bog_lurker') silence(q); },
    xp(p, q) {
      // Chopping willows during the gathering stage: sometimes a strip of bark comes away too.
      if (q.stage !== 1 || p.skill !== 'woodcutting' || q.count('willow_bark') >= 3) return;
      if (q.ctx.actions?.current?.entity?.defId === 'tree_willow' && Math.random() < 0.5) {
        q.give('willow_bark', 1);
        q.msg('A strip of bark peels away with the logs. Old Wren will want that.');
      }
    },
  },

  dialogue(D) {
    const ready = (c) => c.count('spider_silk', true) >= 2 && c.count('willow_bark', true) >= 3;
    const logsWillDo = (c) => c.count('spider_silk', true) >= 2 && c.count('willow_bark', true) + c.count('willow_logs', true) >= 3;
    D.extend('wren', {
      greet: [
        { when: C.notStarted(ID), goto: 'bog_intro' },
        { when: C.stageIn(ID, 1, 2), goto: 'bog_check' },
        { when: C.stage(ID, 3), goto: 'bog_go' },
        { when: C.stage(ID, 4), goto: 'bog_finish' },
      ],
      nodes: {
        bog_intro: {
          npc: [
            "You hear it too, don't you? Under the water. Singing.",
            "Something's woken in Fen Mere. It sings, and folk walk into the bog to listen, and the bog keeps them. Three this month. One was a very good basket-weaver.",
            "I can brew a remedy — something to stuff your ears with wool, inside your head, long enough to deal with the singer. But I need ingredients, and my knees don't do bogs any more.",
          ],
          goto: 'bog_ask',
        },
        bog_ask: {
          npc: 'Well?',
          options: [
            { text: "I'll fetch them.", goto: [{ when: C.combat(30), goto: 'bog_accept' }, { goto: 'bog_weak' }] },
            { text: "What's doing the singing?", goto: 'bog_what' },
            { text: 'What else do you know about the fen?', goto: 'hub' },
            { text: 'Not my problem.', end: true },
          ],
        },
        bog_what: {
          npc: "A bog lurker. Old, fat, and clever enough to learn a tune. They're mostly mud and partly teeth; this one's partly voice.",
          goto: 'bog_ask',
        },
        bog_weak: {
          npc: (c) => `You'd be the fourth to walk into the mere. Come back at combat level 30 — you're ${c.combat()}. Fight spiders, not songs.`,
          end: true,
        },
        bog_accept: {
          do: E.start(ID),
          lines: [
            'Three strips of willow bark — use a knife on any willow in the fen. Your axe needn\'t be grand for that; bark comes off easier than logs.',
            "And two spider silk, from the giant spiders north of here. They won't hand it over politely. There's a silk stall in Gildmoor too, if you'd rather rob a merchant than a spider.",
          ],
          end: true,
        },
        bog_check: {
          goto: [
            { when: ready, goto: 'bog_handover' },
            { when: logsWillDo, goto: 'bog_logs' },
            { goto: 'bog_missing' },
          ],
        },
        bog_missing: {
          npc: (c) => `Still short. I need three willow bark (you have ${c.count('willow_bark', true)}) and two spider silk (you have ${c.count('spider_silk', true)}). Knife on a willow; spiders to the north.`,
          end: true,
        },
        bog_logs: {
          lines: [
            'Willow logs? I can strip those myself. Lazy of you, but practical. I like practical.',
            { do: (c) => { const need = 3 - c.count('willow_bark', true); c.take('willow_logs', need); c.give('willow_bark', need); } },
          ],
          goto: 'bog_handover',
        },
        bog_handover: {
          lines: [
            { do: E.trade([['willow_bark', 3], ['spider_silk', 2]], []) },
            { m: "Wren drops the bark and silk into a pot that wasn't boiling a moment ago. It is now." },
            'Drink this. Tastes of pond. Your ears will feel stuffed with wool — good. The singer can\'t reach you now.',
            { do: E.stage(ID, 3) },
            "It's at Fen Mere, just south-west of here. You'll know it by the singing, and by the fact that it's the one trying to drown you.",
          ],
          end: true,
        },
        bog_go: {
          npc: "Fen Mere, south-west. Follow the singing, don't listen to the words. If you start humming along, eat something and walk the other way.",
          end: true,
        },
        bog_finish: {
          lines: [
            "It's stopped. Listen... frogs. Rude little things. I've missed them.",
            'Here. A sapphire, on a string. It hums when danger is near. Or when it\'s hungry. One of those.',
            { do: E.complete(ID) },
            "Come back for tea. I'll make the nice one. It tastes of a slightly cleaner pond.",
          ],
          end: true,
        },
      },
    });
  },
};
