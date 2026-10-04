// Quest: The Hood's Oath. Giver: Robyn. Fletch a shortbow + 15 bronze arrows, hit the camp's
// archery target three times, lift the tax ledger from Gildmoor's tax collector, return it.
// Installs a fallback 'Shoot' handler for archery targets if the game builder has none.

import { C, E } from './dlg-lib.js';

const ID = 'hoods_oath';
const ROBYN = { x: 132, z: 160 };
const RANGE = { x0: 128, x1: 152, z0: 156, z1: 176 }; // around the Hood range (targets at x 145)

let ownShoot = false; // true when this module registered the 'Shoot' handler
let lastTargetEvent = -1; // tick of the last archery:target event (xp-based counting is a fallback)

function giveLedger(q, text) {
  if (q.stage !== 3 || q.has('tax_ledger')) return false;
  q.give('tax_ledger', 1);
  q.msg(text || "Your fingers find something square in the collector's coat: the tax ledger!");
  return true;
}

export default {
  id: ID,
  steps: [
    { journal: 'Talk to Robyn at the Hood camp in Hoodwood.', at: ROBYN },
    {
      journal: (q) => `Fletch a shortbow (${q.count('shortbow') ? '✓' : 'not yet'}) and 15 bronze arrows (${Math.min(15, q.count('bronze_arrow'))}/15). Little Jon can explain how.`,
      hint: 'Robyn: fletch a shortbow and 15 bronze arrows. Ask Little Jon how.',
      at: { x: 125, z: 160 },
    },
    {
      journal: (q) => `Equip your bow and arrows and hit the archery target at the Hood range three times (${Math.min(3, q.data.ev?.hits || 0)}/3).`,
      hint: 'Robyn: equip your bow and arrows and hit the targets on the range, east of camp, three times.',
      at: { x: 140, z: 166 },
    },
    {
      journal: 'Pickpocket the tax ledger from the tax collector in Gildmoor.',
      hint: "Robyn: lift the tax ledger from the Sheriff's tax collector in Gildmoor's square.",
      at: { x: 250, z: 172 },
    },
    { journal: (q) => (q.has('tax_ledger') ? 'Bring the tax ledger to Robyn.' : 'You lost the tax ledger! Lift it from the tax collector again.'), hint: 'You have the tax ledger! Take it to Robyn at the Hood camp.', at: ROBYN },
  ],
  completeText: 'You swore the Hood\'s Oath and became one of Robyn\'s outlaws.',

  install(ctx, q) {
    // Archery target: only if nobody else handles 'Shoot'.
    ctx.events.on('game:ready', () => {
      const A = ctx.actions;
      if (!A?.register || (A.resolve ? A.resolve({ kind: 'object' }, 'Shoot') : A.handlerFor?.({ kind: 'object' }, 'Shoot'))) return;
      ownShoot = true;
      const say = (text, kind = 'game') => ctx.events.emit('chat:game', { text, kind });
      A.register('Shoot', {
        approach: () => ({ range: 7 }),
        start(e) {
          const w = ctx.equipment?.weapon?.();
          if (!w || w.equip?.style !== 'bow') { say('You need to wield a bow to shoot at the target.', 'warn'); return false; }
          if (!ctx.equipment?.item?.('ammo')) { say('You need arrows equipped to shoot.', 'warn'); return false; }
          ctx.player?.setAnim?.('shoot');
          return true;
        },
        tick(e, n, cur) {
          cur.t = (cur.t || 0) + 1;
          if (cur.t % 4 !== 1) return true;
          ctx.player?.face?.(e);
          ctx.player?.actor?.play?.('shoot', { restart: true });
          const lvl = ctx.skills?.level?.('archery') || 1;
          const hit = Math.random() < Math.min(0.92, 0.5 + lvl * 0.012);
          if (hit) {
            ctx.skills?.addXp?.('archery', 3);
            say(['Your arrow thunks into the target.', 'A hit! Close to the middle, too.', 'Thwack. Right in the straw.'][Math.floor(Math.random() * 3)]);
          } else say(['Your arrow sails past the target and into a tent. Someone yelps.', 'You miss. The target looks smug.', 'The arrow clips the edge and spins away.'][Math.floor(Math.random() * 3)]);
          ctx.events.emit('archery:target', { hit, entity: e });
          return true;
        },
        stop() { ctx.player?.setAnim?.(null); },
      }, 'object');
    });
  },

  poll(q) {
    if (q.stage === 1 && q.count('shortbow') >= 1 && q.count('bronze_arrow') >= 15) {
      q.data.fletched = q.xpGained('fletching') > 0 || q.products('shortbow') > 0;
      q.advance(1);
    }
    if (q.stage === 2 && (q.data.ev?.hits || 0) >= 3) {
      q.advance(2);
      q.say('robyn', 'Nice shooting! Now for something harder.');
    }
    if (q.stage === 3 && q.has('tax_ledger')) q.advance(3);
  },

  on: {
    target(p, q) {
      lastTargetEvent = q.ctx.ticks?.count ?? 0;
      if (q.stage !== 2 || !p?.hit) return;
      const ev = q.data.ev || (q.data.ev = { kills: {}, products: {}, hits: 0 });
      ev.hits = (ev.hits || 0) + 1;
      if (ev.hits < 3) q.msg(`Target hits: ${ev.hits}/3.`);
    },
    xp(p, q) {
      const ctx = q.ctx;
      // Someone else's Shoot handler: count archery XP earned at the range.
      // (Only when no archery:target event accompanies the XP.)
      if (q.stage === 2 && p.skill === 'archery' && !ownShoot && ctx.actions?.current?.option === 'Shoot' && q.inArea(RANGE.x0, RANGE.x1, RANGE.z0, RANGE.z1)) {
        const at = ctx.ticks?.count ?? 0;
        setTimeout(() => {
          if (lastTargetEvent >= at - 1 || q.stage !== 2) return;
          const ev = q.data.ev || (q.data.ev = { kills: {}, products: {}, hits: 0 });
          ev.hits = (ev.hits || 0) + 1;
          if (ev.hits < 3) q.msg(`Target hits: ${ev.hits}/3.`);
        }, 0);
      }
      // Pickpocketing without a thieving:success event: thieving XP while robbing the collector.
      if (q.stage === 3 && p.skill === 'thieving') {
        const target = ctx.actions?.current?.entity;
        if (target?.defId === 'tax_collector') setTimeout(() => giveLedger(q), 0);
      }
    },
    pickpocket(p, q) {
      if (q.stage === 3 && p.npcId === 'tax_collector') setTimeout(() => giveLedger(q), 0);
    },
  },

  dialogue(D, q) {
    D.extend('robyn', {
      greet: [
        { when: C.all(C.notStarted(ID), C.noFlag('hood_member')), goto: 'oath_intro' },
        { when: C.stageIn(ID, 1, 2, 3), goto: 'oath_progress' },
        { when: C.all(C.stage(ID, 4), C.has('tax_ledger')), goto: 'oath_finish' },
        { when: C.stage(ID, 4), goto: 'oath_lost' },
      ],
      nodes: {
        oath_intro: {
          npc: [
            "You've the look of someone who's tired of the Sheriff. Good. So are we.",
            'The Hood takes in anyone with a steady bow arm, quick fingers and a conscience.',
          ],
          goto: 'oath_ask',
        },
        oath_ask: {
          npc: 'Interested?',
          options: [
            { text: 'I want to join the Hood.', goto: [{ when: C.all(C.level('archery', 10), C.level('thieving', 10)), goto: 'oath_accept' }, { goto: 'oath_notyet' }] },
            { text: 'What would I have to do?', goto: 'oath_what' },
            { text: 'Tell me about the Hood first.', goto: 'who' },
            { text: 'Not today.', end: true },
          ],
        },
        oath_what: {
          npc: [
            'Three things. Make your own bow and arrows — a Hood archer never depends on a shop.',
            'Prove you can hit what you aim at. And lift something from the Sheriff\'s people, to prove your fingers are as quick as your arrows.',
          ],
          goto: 'oath_ask',
        },
        oath_notyet: {
          npc: [
            (c) => `Not yet, friend. You'll need Archery 10 and Thieving 10 — you have ${c.level('archery')} and ${c.level('thieving')}.`,
            'Little Jon will sell you a bow to practise with, and Marlowe will teach you to pick a pocket without losing a hand. Come back when you\'re ready.',
          ],
          end: true,
        },
        oath_accept: {
          do: E.start(ID),
          lines: [
            "Then here's your first test: fletch a shortbow and fifteen bronze arrows, with your own hands.",
            'Logs and a knife for the bow, plus a bowstring. Shafts, feathers and arrowheads for the arrows. Little Jon will explain, if you ask nicely. Or at all.',
          ],
          end: true,
        },
        oath_progress: {
          lines: [
            { n: 'Bow and arrows, {name}. A shortbow and fifteen bronze arrows, made by your own hands. Jon can show you how.', when: C.stage(ID, 1) },
            { n: 'Now show me. Equip your bow and arrows and hit the targets on the range three times. East of camp, through the gate.', when: C.stage(ID, 2) },
            { n: "(I know you bought those from Jon, by the way. He told me. He tells me everything. It's fine — resourcefulness counts.)", when: C.all(C.stage(ID, 2), () => q.data.fletched === false) },
            { n: "Last test. The Sheriff's tax collector struts around Gildmoor's square with a ledger of who's been taxed and how much. Lift it from him. Gently.", when: C.stage(ID, 3) },
          ],
          options: [
            { text: 'Any tips?', goto: 'oath_tips' },
            { text: 'On my way.', end: true },
          ],
        },
        oath_tips: {
          lines: [
            { n: 'Knife on logs: arrow shafts. Shafts and feathers: headless arrows. Add arrowheads — a bronze bar on the anvil makes fifteen. For the bow, knife on logs again, then string it. Fletching five does it.', when: C.stage(ID, 1) },
            { n: 'Wield the bow, put the arrows in your ammo slot, then click a target. Breathe out as you loose. Or scream. Jon screams.', when: C.stage(ID, 2) },
            { n: "His purse is a level twenty-five job, but you don't need his purse — just the ledger. Ask Marlowe; she has... methods.", when: C.stage(ID, 3) },
          ],
          end: true,
        },
        oath_lost: {
          npc: 'No ledger? Did the collector take it back? Embarrassing for him, embarrassing for you. Go and lift it again.',
          end: true,
        },
        oath_finish: {
          lines: [
            "The tax ledger! Let's see... 'Window tax: Marta, three windows.' 'Tax on not having a window: Tobin.' 'Feather tax: the hat.'",
            'Every coin in here goes back to where it came from. Tonight.',
            { do: E.take('tax_ledger', 1) },
            "{name}, kneel. Or don't — we're not that formal. You're one of us now. Take the cowl, the cape and the token. Wear them with pride, or at least with a straight face.",
            { do: E.complete(ID) },
            { m: 'You are now a sworn member of the Hood.' },
            "There's more work, when you're ready. Bigger work. The Sheriff's own vault.",
          ],
          end: true,
        },
      },
    });

    D.extend('jon', {
      topics: [{ text: 'Robyn wants me to fletch a shortbow and arrows.', when: C.stage(ID, 1), goto: 'oath_jon' }],
      nodes: {
        oath_jon: {
          npc: [
            'Ah. The Oath. I did mine in an afternoon. Took Robyn a week to stop laughing at my arrows.',
            'Bow: knife on normal logs, pick shortbow, then use a bowstring on it. Arrows: knife on logs for shafts, feathers on shafts, arrowheads on those. Harlan or any anvil makes arrowheads from a bronze bar.',
            "I sell bowstrings and feathers. I won't tell Robyn if you buy a bow. I will. But I won't mean it.",
          ],
          goto: 'hub',
        },
      },
    });
    D.extend('marlowe', {
      topics: [{ text: "How do I lift the tax collector's ledger?", when: C.stage(ID, 3), goto: 'oath_marlowe' }],
      nodes: {
        oath_marlowe: {
          npc: [
            'Left coat pocket. Always the left. He pats it every thirty steps, so time it between pats.',
            "If your fingers aren't quick enough for him yet — he's a level twenty-five mark — try distraction. Tell him you've seen Robyn behind him. Works every time. Well. Every other time.",
          ],
          goto: 'hub',
        },
      },
    });
    D.extend('taxman', {
      topics: [{ text: 'Look! Is that Robyn of the Hood behind you?!', when: C.all(C.stage(ID, 3), C.lacks('tax_ledger')), goto: 'oath_trick' }],
      nodes: {
        oath_trick: {
          do: (c) => {
            const until = c.flag('oath:trick_until') || 0;
            c.session.trick = Date.now() < until ? 'wait' : Math.random() < Math.min(0.95, 0.45 + c.level('thieving') * 0.02) ? 'ok' : 'fail';
            if (c.session.trick === 'ok') { giveLedger(q, 'While he spins round, you slip a hand into his left pocket. The tax ledger is yours!'); c.ctx.skills?.addXp?.('thieving', 25); }
            if (c.session.trick === 'fail') c.ctx.state.flag('oath:trick_until', Date.now() + 20000);
          },
          lines: [
            { m: 'The tax collector spins round with a shriek, clutching his hat.', when: (c) => c.session.trick === 'ok' },
            { n: '...There is nobody there. Citizen, that was not funny. Move along.', when: (c) => c.session.trick === 'ok' },
            { n: 'Robyn? In broad daylight? In GILDMOOR? Nice try. My hand stays on my ledger, citizen.', when: (c) => c.session.trick === 'fail' },
            { n: 'I am watching you very closely now, citizen. Very. Closely.', when: (c) => c.session.trick === 'wait' },
          ],
          end: true,
        },
      },
    });
  },
};
