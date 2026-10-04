// Quest: The Goblin Bell. Giver: Elder Rowan. Find the Warrens, defeat the Goblin Warchief,
// bring the bell home. The bell is handed over on the Warchief's death (event or kill counter).

import { C, E } from './dlg-lib.js';

const ID = 'goblin_bell';
const ROWAN = { x: 188, z: 249 };

function takeBell(q, how) {
  if (q.has('village_bell') || q.viaLoot) return; // with the loot module the bell drops on the ground
  q.give('village_bell', 1);
  q.msg(how || "The Warchief's 'hat' clangs to the ground. You pick up the Brightwater bell.");
}

export default {
  id: ID,
  steps: [
    { journal: 'Talk to Elder Rowan in the Brightwater village square.', at: ROWAN },
    { journal: "Find the entrance to the goblin Warrens in Copperhollow, west along Miners' Way.", hint: 'Find the Warrens: a cave mouth south-west of Foreman Dunstan\'s hut in Copperhollow.', at: { x: 66, z: 276 } },
    { journal: 'Defeat the Goblin Warchief at the deep north end of the Warrens and take back the bell he wears as a hat.', hint: 'You\'re in the Warrens. The Warchief lurks at the far north end. Bring food.', at: null },
    { journal: (q) => (q.count('village_bell') ? 'Return the bell to Elder Rowan in Brightwater.' : 'You lost the bell! The Warchief may have picked it up again...'), hint: 'You have the bell! Take it back to Elder Rowan in Brightwater.', at: ROWAN },
  ],
  completeText: 'The Brightwater bell rings again every dawn.',
  drops: [{ monster: 'goblin_warchief', item: 'village_bell', text: "The Warchief's 'hat' clangs to the ground: the Brightwater bell!" }],

  poll(q) {
    if (q.stage === 1 && (q.region() === 'warrens' || q.kills('goblin_warchief') > 0)) {
      if (q.kills('goblin_warchief') > 0 && !q.viaLoot) { takeBell(q); q.set(3); } else q.advance(1);
    }
    if (q.stage === 2) {
      if (q.has('village_bell')) q.advance(2);
      else if (q.kills('goblin_warchief') > 0 && !q.viaLoot) { takeBell(q); q.advance(2); }
    }
  },
  on: {
    kill(p, q) {
      if (p.defId !== 'goblin_warchief') return;
      if (q.viaLoot) { if (q.stage === 1) q.set(2); return; } // the bell drops as loot; picking it up advances
      if (q.stage === 1 || q.stage === 2) { takeBell(q); q.set(3); }
      else if (q.stage === 3 && !q.has('village_bell')) takeBell(q, 'The Warchief had found the bell again. You take it back.');
    },
    region(p, q) { if (q.stage === 1 && p.region === 'warrens') q.advance(1); },
  },

  dialogue(D) {
    D.extend('rowan', {
      greet: [
        { when: C.notStarted(ID), goto: 'bell_intro' },
        { when: C.stageIn(ID, 1, 2), goto: 'bell_progress' },
        { when: C.all(C.stage(ID, 3), C.has('village_bell')), goto: 'bell_return' },
        { when: C.stage(ID, 3), goto: 'bell_lost' },
      ],
      nodes: {
        bell_intro: {
          npc: [
            "You'll have noticed the silence. No bell. Forty years I've rung it every dawn, and last week — goblins.",
            'They came up from the Warrens under Copperhollow, cut the rope and carried it off, giggling. I\'m told their Warchief now wears it as a hat.',
          ],
          goto: 'bell_ask',
        },
        bell_ask: {
          npc: 'I don\'t suppose a brave soul might fetch it back?',
          options: [
            { text: "I'll get your bell back.", goto: [{ when: C.combat(8), goto: 'bell_accept' }, { goto: 'bell_weak' }] },
            { text: 'Why would a goblin want a bell?', goto: 'bell_why' },
            { text: 'Good luck with that.', end: true },
          ],
        },
        bell_why: {
          npc: 'Goblins love three things: noise, shiny things, and hats. My bell is all three. It never stood a chance.',
          goto: 'bell_ask',
        },
        bell_weak: {
          npc: [
            'Bless you, but... you look like a stiff breeze might knock you over, and the Warchief is no rat.',
            (c) => `Come back when you're combat level 8 at least (you're ${c.combat()}). Cows and goblins along Miners' Way will toughen you up.`,
          ],
          end: true,
        },
        bell_accept: {
          do: E.start(ID),
          lines: [
            'Thank you, {name}! The Warrens\' entrance is a cave south-west of Copperhollow, along Miners\' Way. Foreman Dunstan knows those hills.',
            'Goblin brutes lurk inside, and the Warchief himself at the deep end. Take food. Take armour. Take care.',
          ],
          end: true,
        },
        bell_progress: {
          lines: [
            { n: 'The Warrens are under Copperhollow, west along Miners\' Way. Dunstan will point you to the cave.', when: C.stage(ID, 1) },
            { n: 'You found the Warrens? Then the Warchief is somewhere deep inside, wearing my bell. Bring it home, {name}.', when: C.stage(ID, 2) },
          ],
          options: [
            { text: 'Any advice?', goto: 'bell_advice' },
            { text: "I'm on it.", end: true },
          ],
        },
        bell_advice: {
          npc: [
            'Goblin brutes hit harder than they look, and they look like they hit hard. Iron armour from Brackwell or Harlan helps. Eat when you\'re below half.',
            'And if you hear a muffled DONG, follow it. That\'s my bell, on his head, every time he nods.',
          ],
          end: true,
        },
        bell_return: {
          lines: [
            'Is that...? It is! My bell! Dented, chewed, smells of goblin — but mine.',
            { do: E.take('village_bell', 1) },
            { m: 'Elder Rowan hangs the bell back on its post and gives the rope a mighty pull. DONG. All across the village, people stop what they\'re doing and smile.' },
            'Here — a sword my father carried. It\'s iron, and it\'s yours. And a little CREDIT, from the village purse.',
            { do: E.complete(ID) },
            'Brightwater won\'t forget this. Neither will I. Every dawn, that bell rings for you.',
          ],
          end: true,
        },
        bell_lost: {
          npc: [
            'You... lost it? Oh dear. Oh dear, oh dear.',
            'Well. The Warchief has a nose for shiny things. Perhaps he\'s found it again. Look for the goblin with the musical hat.',
          ],
          end: true,
        },
      },
    });
    D.extend('dunstan', {
      topics: [{ text: "Elder Rowan's bell — where are the Warrens?", when: C.stageIn(ID, 1, 2), goto: 'bell_dunstan' }],
      nodes: {
        bell_dunstan: {
          npc: [
            'Goblins took a bell? Course they did. They took my best lantern last spring. And my second-best lantern. And my hat.',
            'Cave mouth\'s south-west of my hut, past the last of the rocks. Follow the smell. If you see my hat, I want it back.',
          ],
          goto: 'hub',
        },
      },
    });
  },
};
