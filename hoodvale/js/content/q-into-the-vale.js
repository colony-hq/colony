// Quest: Into the Vale (tutorial). Giver: Guide Elowen. Chop, burn, fish+cook, mine, smelt,
// smith, fight, bank, return. Every step is detected from XP gains / inventory (polling) and
// from events when they exist (skill:product, monster:death, bank:open, action:start).

import { C, E } from './dlg-lib.js';
import { STARTER_TOOLS } from './npc-brightwater.js';

const ID = 'into_the_vale';
const ELOWEN = { x: 177, z: 241 };

const TIPS = [
  null,
  'Chop a tree — the ones just north of the hall are perfect. Click one and your axe does the rest. Keep at it until you have some logs.',
  'Now a fire. Click the logs in your pack and choose Light — or use your tinderbox on them. Step off the road first; the King frowns on campfires on his cobbles.',
  'Fish and cook! Take your net to the east shore of the lake — look for the ripples — and net some shrimp. Then cook them on a fire. Light a new one if yours has burnt out.',
  'Mining next. There are copper and tin rocks just east of Harlan\'s smithy, south-east of the square. Mine one of each.',
  'Take your copper and tin to the furnace in Harlan\'s smithy and smelt a bronze bar.',
  'Now the anvil, right beside the furnace. With your hammer in your pack, smith that bar into a bronze dagger.',
  'Time to fight. Rats gather behind the Wobbly Kettle, south-west of the square. Wield your new dagger — fists work too, on rats — and defeat one.',
  'Last lesson: the bank. The Ledger House is north-east of the square. Talk to Banker Osric or use a booth, and open your bank.',
  'You\'re done! Come back and tell me all about it.',
];
const HOW = [
  null,
  "Hover over a tree and it says 'Chop down'. Click it. You'll walk over and swing until a log drops into your pack. Trees fall sometimes; they grow back. Patience is a skill too. Not one with levels, sadly.",
  'Open your pack and click your logs: choose Light. (Using the tinderbox on the logs works too.) You\'ll kneel, strike, and with luck: a fire. Firemaking experience, and somewhere to cook.',
  "Click a fishing spot on the lake's east shore and choose Net. Shrimp, eventually. Then use the raw shrimp on your fire, or click the fire and choose Cook. Burnt ones happen to everyone. You'll burn fewer as you improve.",
  'Click a rock with orange-brown streaks for copper, grey ones for tin. Keep your pickaxe in your pack or in your hand; either works.',
  'Click the furnace and choose Smelt, then pick Bronze bar. One copper ore and one tin ore make one bar.',
  'Click the anvil, choose Smith, and pick Bronze dagger. One bar, one dagger. Harlan will pretend not to watch.',
  'Click a rat to attack it. Keep an eye on your hitpoints. If you get hurt, eat something — bread, shrimp, anything that isn\'t burnt. Rats hit like a stern look; you\'ll be fine.',
  'Click a bank booth, or talk to Banker Osric and ask to access your bank. Whatever you deposit stays safe, on the Ledger, forever.',
  'Talk to me in the Guide\'s Hall.',
];

const step = (journal, hint, at) => ({ journal, hint, at });

export default {
  id: ID,
  steps: [
    step("Talk to Guide Elowen in the Guide's Hall, Brightwater.", null, ELOWEN),
    step('Chop some logs from a tree near the Guide\'s Hall.', 'Elowen: chop some logs from the trees just north of the Guide\'s Hall.', { x: 176, z: 232 }),
    step('Light a fire with your tinderbox and logs.', 'Elowen: light a fire — click your logs and choose Light.', null),
    step((q) => {
      const d = q.data;
      const caught = d.caught ? ' (caught ✓)' : '';
      return `Net some shrimp at the east shore of Brightwater lake and cook them on a fire${caught}.`;
    }, 'Elowen: net shrimp on the east shore of the lake, then cook them on a fire.', { x: 160, z: 246 }),
    step((q) => {
      const d = q.data;
      const parts = [d.copper ? 'copper ✓' : 'copper', d.tin ? 'tin ✓' : 'tin'];
      return `Mine copper and tin ore at the rocks east of Harlan's smithy (${parts.join(', ')}).`;
    }, 'Elowen: mine one copper ore and one tin ore at the rocks east of the smithy.', { x: 209, z: 253 }),
    step("Smelt a bronze bar at the furnace in Harlan's smithy.", 'Elowen: smelt your ores into a bronze bar at the smithy furnace.', { x: 197, z: 255 }),
    step('Smith a bronze dagger on the anvil.', 'Elowen: smith a bronze dagger on the anvil beside the furnace.', { x: 201, z: 257 }),
    step('Defeat a rat behind the Wobbly Kettle.', 'Elowen: defeat a rat — they gather behind the Wobbly Kettle.', { x: 170, z: 265 }),
    step('Open your bank at the Brightwater Ledger House.', 'Elowen: open your bank at the Ledger House (a booth or Banker Osric).', { x: 201, z: 238 }),
    step("Return to Guide Elowen in the Guide's Hall.", 'Elowen: come back to the Guide\'s Hall and tell me how it went!', ELOWEN),
  ],
  completeText: 'Elowen taught you the basics of the Vale. You received a CREDIT airdrop and your Hood Wallet is active.',

  onStart(q) {
    for (const id of STARTER_TOOLS) if (q.count(id) < 1) q.give(id, 1);
  },

  poll(q) {
    const d = q.data;
    switch (q.stage) {
      case 1:
        if (q.has('logs') || q.xpGained('woodcutting') > 0 || q.products('logs')) q.advance(1);
        break;
      case 2:
        if (q.xpGained('firemaking') > 0 || q.products('fire')) q.advance(2);
        else if (!q.has('logs') && !d.nologHint) { d.nologHint = true; q.msg('Elowen: no logs left? Chop another tree, then light the logs.'); }
        break;
      case 3:
        if (!d.caught && (q.xpGained('fishing') > 0 || q.has('raw_shrimp') || q.products('raw_shrimp'))) { d.caught = true; q.msg('You caught some shrimp. Now cook them on a fire.'); }
        if (q.xpGained('cooking') > 0 || q.products('shrimp') || (d.caught && q.has('shrimp'))) q.advance(3);
        else if (q.has('burnt_fish') && !d.burnt) { d.burnt = true; q.msg('Burnt! It happens. Catch another shrimp and try again.'); }
        break;
      case 4:
        if (q.has('copper_ore') || q.products('copper_ore')) d.copper = true;
        if (q.has('tin_ore') || q.products('tin_ore')) d.tin = true;
        if ((d.copper && d.tin) || q.has('bronze_bar')) q.advance(4);
        break;
      case 5:
        if (q.has('bronze_bar') || q.products('bronze_bar') || q.xpGained('smithing') > 0) q.advance(5);
        break;
      case 6:
        if (q.has('bronze_dagger') || q.products('bronze_dagger')) q.advance(6);
        break;
      case 7:
        if (q.kills('rat') > 0) q.advance(7);
        break;
      case 8:
        if (d.bankTarget) {
          const e = q.ctx.entities?.get?.(d.bankTarget);
          const p = q.ctx.player;
          if (e && p && Math.max(Math.abs(p.x - e.x), Math.abs(p.z - e.z)) <= 1 + Math.max(0, (e.w || 1) - 1)) q.advance(8);
        }
        break;
      default: break;
    }
  },

  on: {
    bank(p, q) { q.advance(8); },
    action(p, q) {
      if (q.stage === 8 && p?.option === 'Bank' && p.entity) q.data.bankTarget = p.entity.uid;
    },
    kill(p, q) { if (q.stage === 7 && p.defId === 'rat') q.advance(7); },
  },

  dialogue(D) {
    D.extend('elowen', {
      greet: [
        { when: C.notStarted(ID), goto: 'itv_intro' },
        { when: C.stage(ID, 9), goto: 'itv_finish' },
        { when: C.started(ID), goto: 'itv_progress' },
      ],
      nodes: {
        itv_intro: {
          npc: [
            "Oh! A new face. Welcome to Brightwater, and welcome to the Vale. I'm Elowen — I help newcomers find their feet. And their axes.",
            'Everyone who comes here wants to be a hero. Heroes, it turns out, need firewood, fish, metal, and the sense to keep their valuables in a bank.',
          ],
          goto: 'itv_ask',
        },
        itv_ask: {
          npc: 'So. Shall I show you how the Vale works?',
          options: [
            { text: 'Teach me everything!', goto: 'itv_accept' },
            { text: 'Who are you, exactly?', goto: 'itv_who' },
            { text: "I already know what I'm doing.", goto: 'itv_sure' },
          ],
        },
        itv_who: {
          npc: [
            "I've walked every road in the Vale, from the Saltreach piers to the foot of the Ashen Peak. These days I stay put and help newcomers walk them instead.",
            'Fewer blisters. For me, anyway.',
          ],
          goto: 'itv_ask',
        },
        itv_sure: {
          npc: "Do you? Humour me. It's quick, you'll learn a trick or two, and there's an airdrop of CREDIT at the end.",
          goto: 'itv_ask',
        },
        itv_accept: {
          do: E.start(ID),
          lines: [
            'Wonderful. Here — your first tools.',
            { m: 'Elowen hands you a bronze axe, a tinderbox, a small fishing net, a bronze pickaxe and a hammer.' },
            'First lesson: firewood. There are trees just north of the hall. Click one to chop it, and keep going until you have some logs.',
            'Your quest journal will remind you what comes next. And I\'ll be right here if you get lost.',
          ],
          end: true,
        },
        itv_progress: {
          npc: (c) => TIPS[c.quests.stage(ID)] || TIPS[1],
          options: [
            { text: 'How do I do that again?', goto: 'itv_how' },
            { text: "I've lost some of my tools.", goto: 'tools' },
            { text: "I'll get on with it.", end: true },
          ],
        },
        itv_how: { npc: (c) => HOW[c.quests.stage(ID)] || HOW[1], end: true },
        itv_finish: {
          lines: [
            "You did it! Logs, fire, fish, ore, metal, a dagger and one very surprised rat. That's more than most manage in their first week.",
            'One last thing: your Hood Wallet. It holds your CREDIT, and every coin that moves is written on the Robinhood Chain — a simulated chain, so nothing real changes hands. Still: here\'s an airdrop to get you started.',
            { do: E.complete(ID) },
            { m: 'Your Hood Wallet receives an airdrop of 0.250 CREDIT.' },
            'Go on, then. The Vale\'s waiting. Talk to everyone: half of them need help, and the other half want to tell you about it.',
            "If you're not sure where to start, Marta at the Wobbly Kettle needs cake ingredients, and Elder Rowan has lost his bell.",
          ],
          end: true,
        },
      },
    });

    // Helpers along the way.
    D.extend('harlan', {
      greet: [{ when: C.stageIn(ID, 4, 5, 6), goto: 'itv_harlan' }],
      nodes: {
        itv_harlan: {
          lines: [
            { n: "Elowen's learner. Rocks are east of here. Copper's orange, tin's grey. One of each.", when: C.stage(ID, 4) },
            { n: 'Furnace is there. Copper and tin in, bronze out. Go on.', when: C.stage(ID, 5) },
            { n: 'Anvil. Hammer in your pack. Bronze dagger. Hit it till it\'s a dagger.', when: C.stage(ID, 6) },
            'Anything else?',
          ],
          goto: 'hub',
        },
      },
    });
    D.extend('tobin', {
      greet: [{ when: C.stage(ID, 3), goto: 'itv_tobin' }],
      nodes: { itv_tobin: { npc: ['Shrimp? East shore. Ripples. Net.', '...Cook them after. Not raw.'], goto: 'hub' } },
    });
    D.extend('banker', {
      greet: [{ when: C.all(C.stage(ID, 8), C.npc('banker_bw')), goto: 'itv_bank' }],
      nodes: {
        itv_bank: {
          lines: [
            "Ah, one of Elowen's learners! Welcome to the Ledger House. Everything you deposit here is written down and kept safe — and you can reach it from any bank in the Vale.",
            'Let me open your account. There.',
            { do: E.bank() },
          ],
          end: true,
        },
      },
    });
    D.extend('marta', {
      greet: [{ when: C.stage(ID, 7), goto: 'itv_marta' }],
      nodes: { itv_marta: { npc: ["Rats? Out the back, love, by the bins. Take a stick. Or a dagger. Or just a firm expression — they're mostly cowards."], goto: 'hub' } },
    });
  },
};
