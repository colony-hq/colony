// Quest: Wyrm of the Ashen Peak. Giver: Hermit Grimsby. Fireward shield (steel kiteshield + 5
// ember sigils), Ashen key from a stone golem, enter the lair, slay the Ashen Wyrm, tell Grimsby.

import { C, E } from './dlg-lib.js';

const ID = 'ashen_wyrm';
const GRIMSBY = { x: 107, z: 92 };

function giveKey(q, text) {
  if (q.has('ash_key') || q.viaLoot) return; // with the loot module the key drops on the ground
  q.give('ash_key', 1);
  q.msg(text || 'The golem cracks apart. In the rubble, something glows: a warm iron key. The Ashen key!');
}

export default {
  id: ID,
  steps: [
    { journal: 'Talk to Hermit Grimsby by the ruined watchtower in the Ashen Highlands.', at: GRIMSBY },
    {
      journal: (q) => `Bring Grimsby a steel kiteshield (${q.count('steel_kiteshield') ? '✓' : 'not yet'}) and 5 ember sigils (${Math.min(5, q.count('ember_sigil'))}/5) to paint a Fireward shield.`,
      hint: 'Grimsby needs a steel kiteshield (Brackwell, Gildmoor) and 5 ember sigils (Lumen, Gildmoor) to paint a Fireward shield.',
      at: GRIMSBY,
    },
    { journal: 'Take the Ashen key from a stone golem, north-west in the highlands near the peak.', hint: 'Break open a stone golem near the Ashen Peak to find the Ashen key.', at: { x: 82, z: 52 } },
    { journal: 'Enter the lair under the Ashen Peak through the sealed gate.', hint: 'You have the Ashen key. The sealed gate is at the foot of the Ashen Peak.', at: { x: 69, z: 38 } },
    { journal: 'Slay the Ashen Wyrm. Keep the Fireward shield raised.', hint: 'The Ashen Lair. The wyrm sleeps in the deepest chamber, to the north. Shield up.', at: null },
    { journal: 'Tell Hermit Grimsby the wyrm is dead.', hint: 'The Ashen Wyrm is dead! Tell Hermit Grimsby.', at: GRIMSBY },
  ],
  drops: [{ monster: 'stone_golem', item: 'ash_key', text: "In the golem's rubble, something glows: a warm iron key. The Ashen key!" }],
  completeText: 'You slew the Ashen Wyrm, finishing what Sir Grimsby of the Ashen Watch began thirty years ago. They call you Wyrmbane.',

  onComplete(q) { q.ctx.state.flag('title', 'Wyrmbane'); },

  poll(q) {
    if (q.stage === 2) {
      if (q.has('ash_key')) q.advance(2);
      else if (q.kills('stone_golem') > 0 && !q.viaLoot) { giveKey(q); q.advance(2); }
    }
    if ((q.stage === 3 || q.stage === 2) && q.region() === 'lair') q.set(4);
    if (q.stage === 4 && q.kills('ashen_wyrm') > 0) q.advance(4);
  },
  on: {
    kill(p, q) {
      if (p.defId === 'stone_golem' && (q.stage === 2 || q.stage === 3) && !q.has('ash_key') && !q.viaLoot) { giveKey(q); q.advance(2); }
      if (p.defId === 'ashen_wyrm' && (q.stage === 3 || q.stage === 4)) {
        q.msg('The Ashen Wyrm shudders, roars one last ember-bright roar, and is still. Far above, the mountain sighs.');
        q.set(5);
      }
    },
    region(p, q) {
      if ((q.stage === 2 || q.stage === 3) && p.region === 'lair') q.set(4);
    },
  },

  dialogue(D) {
    D.extend('grimsby', {
      greet: [
        { when: C.notStarted(ID), goto: 'wyrm_intro' },
        { when: C.stage(ID, 1), goto: 'wyrm_shield' },
        { when: C.stageIn(ID, 2, 3, 4), goto: 'wyrm_progress' },
        { when: C.stage(ID, 5), goto: 'wyrm_finish' },
      ],
      topics: [{ text: "I've lost my Fireward shield.", when: C.all(C.reached(ID, 2), C.lacks('fireward_shield')), goto: 'wyrm_repaint' }],
      nodes: {
        wyrm_intro: {
          npc: [
            "So. You've come about the wyrm. Everyone does, eventually. They look at the peak, they look at me, and they think: 'I could do better than him.'",
            "Maybe you could. I couldn't. Thirty years ago I walked into that lair in the finest armour in the Vale. It melted.",
          ],
          goto: 'wyrm_ask',
        },
        wyrm_ask: {
          npc: 'Well? Out with it.',
          options: [
            { text: "I'll slay the wyrm.", goto: [{ when: C.all(C.done('goblin_bell'), C.combat(50)), goto: 'wyrm_accept' }, { goto: 'wyrm_weak' }] },
            { text: 'What happened to you up there?', goto: 'wyrm_story' },
            { text: 'What is the wyrm, exactly?', goto: 'wyrm_what' },
            { text: "I'll leave you to your rocks.", end: true },
          ],
        },
        wyrm_story: {
          npc: [
            'Wyrmfire. Hotter than a forge, faster than regret. My shield went first, then my sword arm, then my nerve.',
            'I crawled out with half a beard and a lifelong interest in rocks that don\'t breathe fire.',
          ],
          goto: 'wyrm_ask',
        },
        wyrm_what: {
          npc: [
            "Old. Older than the Sheriff's debts, and it sleeps on the oldest of them. Ash-grey scales, eyes like coals, breath like the inside of a furnace.",
            'Some say an Orbio spark woke it. Some say it was always awake, just patient. I say it\'s a big lizard that ruined my life. Gary agrees.',
          ],
          goto: 'wyrm_ask',
        },
        wyrm_weak: {
          lines: [
            "You'd melt faster than I did.",
            { n: "Prove yourself first. Brightwater's bell is still missing — Elder Rowan will tell you. Anyone who can't beat a goblin in a hat won't beat a wyrm.", when: C.notDone('goblin_bell') },
            { n: (c) => `And come back when you can fight. Combat level 50, no less. You're ${c.combat()}.`, when: C.not(C.combat(50)) },
          ],
          end: true,
        },
        wyrm_accept: {
          do: E.start(ID),
          lines: [
            "...Fine. Fine! But you'll do it properly, which is more than I did.",
            "First, a shield that won't melt. Bring me a steel kiteshield and five ember sigils, and I'll paint a fireward on it, the way the Ashen Watch did.",
            "Brackwell in Gildmoor sells the shields. Lumen sells the sigils — or the imps in the lair drop them, if you'd rather earn them the hard way. You wouldn't.",
          ],
          end: true,
        },
        wyrm_shield: {
          goto: [
            { when: C.all(C.has('steel_kiteshield'), C.has('ember_sigil', 5), (c) => c.count('steel_kiteshield', true) < 1), goto: 'wyrm_wearing' },
            { when: C.all(C.has('steel_kiteshield'), C.has('ember_sigil', 5)), goto: 'wyrm_paint' },
            { goto: 'wyrm_missing' },
          ],
        },
        wyrm_wearing: { npc: "Take the shield off first. I'm painting the shield, not you.", end: true },
        wyrm_missing: {
          npc: (c) => `A steel kiteshield${c.count('steel_kiteshield') ? ' (you have it)' : ''} and five ember sigils (you have ${c.count('ember_sigil')}). Brackwell and Lumen, in Gildmoor. Off you go.`,
          end: true,
        },
        wyrm_paint: {
          lines: [
            { do: E.trade([['steel_kiteshield', 1], ['ember_sigil', 5]], [['fireward_shield', 1]]) },
            { m: 'Grimsby grinds the ember sigils into a glowing paste and paints a ward of interlocking flames across the shield. It is warm to the touch. Then it isn\'t.' },
            { do: E.stage(ID, 2) },
            'There. Wyrmfire will slide off it like rain off a duck. A very hot duck. Keep it raised.',
            'Next: the gate under the peak is sealed. The key is inside a stone golem — they swallowed it when the Watch fell. North-west of here, near the peak. Break one open.',
          ],
          end: true,
        },
        wyrm_repaint: {
          goto: [{ when: C.all(C.has('steel_kiteshield'), C.has('ember_sigil', 5)), goto: 'wyrm_repaint_do' }, { goto: 'wyrm_repaint_need' }],
        },
        wyrm_repaint_need: { npc: 'Lost it? Wonderful. Another steel kiteshield and five more ember sigils, and I\'ll paint you a new one. Try not to lose this one in a wyrm.', goto: 'hub' },
        wyrm_repaint_do: {
          lines: [
            { do: E.trade([['steel_kiteshield', 1], ['ember_sigil', 5]], [['fireward_shield', 1]]) },
            { m: 'Grimsby paints another fireward, muttering about the youth of today.' },
            'There. Again.',
          ],
          goto: 'hub',
        },
        wyrm_progress: {
          lines: [
            { n: 'The key is inside a stone golem. North-west, near the peak. They hit like landslides, so don\'t stand where the landslide goes.', when: C.stage(ID, 2) },
            { n: "You've the key? Then the gate at the foot of the peak will open for you. Fireward shield on your arm, food in your pack. Go.", when: C.stage(ID, 3) },
            { n: "You've been inside? And you came back? ...Then go back and finish it. It sleeps in the deepest chamber.", when: C.stage(ID, 4) },
            { n: 'Imps throw fire, drakes bite. Neither is the wyrm. Save your lobsters for the wyrm.', when: C.reached(ID, 3) },
          ],
          end: true,
        },
        wyrm_finish: {
          lines: [
            "You... it's dead? The wyrm?",
            { m: 'Grimsby sits down heavily on a large rock. Possibly Gary.' },
            'Thirty years I\'ve watched that peak. Thirty years of smoke on the wind. And now... just wind.',
            'Here. Two of its scales — the only two I ever cut, all those years ago. They belong with the one who finished it.',
            { do: E.complete(ID) },
            "Wyrmbane. That's what they'll call you. I'll call you that too, once I've stopped crying into my rocks.",
          ],
          end: true,
        },
      },
    });

    D.extend('oldsalt', {
      topics: [{ text: "I'm going after the Ashen Wyrm.", when: C.started(ID), goto: 'wyrm_salt' }],
      nodes: {
        wyrm_salt: {
          npc: [
            'You? The wyrm? Arr, that\'s the spirit! Take swordfish. Lots. And a shield that doesn\'t melt.',
            "If you see a ship-shaped scorch mark on the lair wall, that's where I didn't fight it. Fondly remembered.",
          ],
          goto: 'hub',
        },
      },
    });
  },
};
