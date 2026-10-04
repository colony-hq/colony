// Quest: A Feast for Brightwater. Giver: Marta (the Wobbly Kettle). Egg + bucket of milk + pot
// of flour from Millbrook. Hale and Nell can help through dialogue if the farm objects are shy.

import { C, E } from './dlg-lib.js';

const ID = 'feast_for_brightwater';
const NEED = [['egg', 'an egg'], ['bucket_of_milk', 'a bucket of milk'], ['pot_of_flour', 'a pot of flour']];
const hasAll = (c) => NEED.every(([id]) => c.count(id, true) >= 1);

export default {
  id: ID,
  steps: [
    { journal: 'Talk to Marta at the Wobbly Kettle in Brightwater.', at: { x: 170, z: 259 } },
    {
      journal: (q) => 'Bring Marta ' + NEED.map(([id, label]) => (q.count(id, false) ? `${label} ✓` : label)).join(', ') + '. Millbrook Farms is east along the King\'s Road.',
      hint: 'Marta needs an egg (chicken run nests), a bucket of milk (Farmer Hale\'s cows) and a pot of flour (Millbrook windmill).',
      at: { x: 238, z: 238 },
    },
    { journal: 'Talk to Marta.', at: { x: 170, z: 259 } },
  ],
  completeText: 'Brightwater got its harvest cake, and Marta shared her honey cake recipe with you.',

  poll(q) {
    if (q.stage === 1 && !q.data.ready && NEED.every(([id]) => q.count(id, false) >= 1)) {
      q.data.ready = true;
      q.msg('You have everything Marta needs. Take it to the Wobbly Kettle in Brightwater.');
      q.ctx.events.emit('quest:hint', { id: ID, stage: 1, text: 'Take the ingredients to Marta.', target: { x: 170, z: 259 } });
    }
  },

  dialogue(D) {
    D.extend('marta', {
      greet: [
        { when: C.notStarted(ID), goto: 'feast_intro' },
        { when: C.stage(ID, 1), goto: 'feast_check' },
        { when: C.stage(ID, 2), goto: 'feast_finish' },
      ],
      nodes: {
        feast_intro: {
          npc: [
            "Oh, love, you've caught me in a flap. It's harvest week, and Brightwater expects my honey cake. The whole village. Every year.",
            "But the Sheriff's men took my flour for 'tax', the hens are sulking, and my milk went sour the moment the tax collector looked at it.",
          ],
          goto: 'feast_ask',
        },
        feast_ask: {
          npc: 'I don\'t suppose you could help an old innkeeper out?',
          options: [
            { text: "I'll help! What do you need?", goto: 'feast_accept' },
            { text: 'Tell me about this cake.', goto: 'feast_cake' },
            { text: 'Sounds like a you problem.', goto: 'feast_rude' },
          ],
        },
        feast_cake: {
          npc: [
            'Honey from the lake bees, eggs, milk, flour, and a secret ingredient I\'m not telling you.',
            "(It's more honey.)",
          ],
          goto: 'feast_ask',
        },
        feast_rude: { npc: "Well! It'll be a you problem too when there's no cake. Off you go, then. ...Unless you've changed your mind?", goto: 'feast_ask' },
        feast_accept: {
          do: E.start(ID),
          lines: [
            'Bless you! I need an egg, a bucket of milk and a pot of flour.',
            'Eggs from the nests in Millbrook\'s chicken run. Milk from Farmer Hale\'s cows — take a bucket and milk one, or ask Hale nicely. Flour from the windmill: pick wheat, pour it in the hopper, then collect the flour in a pot.',
            "Pell sells buckets and pots, if you've none. Millbrook's east along the King's Road. Don't let the geese bully you.",
          ],
          end: true,
        },
        feast_check: { goto: [{ when: hasAll, goto: 'feast_handover' }, { goto: 'feast_missing' }] },
        feast_missing: {
          npc: (c) => {
            const miss = NEED.filter(([id]) => c.count(id, true) < 1).map(([, label]) => label);
            const list = miss.length > 1 ? miss.slice(0, -1).join(', ') + ' and ' + miss[miss.length - 1] : miss[0];
            return `How's the hunt, love? I still need ${list}.`;
          },
          options: [
            { text: 'Where do I find them again?', goto: 'feast_where' },
            { text: "I'll be back.", end: true },
          ],
        },
        feast_where: {
          npc: [
            'Eggs: the nests in the chicken run at Millbrook. Milk: ask Farmer Hale, and bring a bucket. Flour: wheat from the field, into the hopper at the windmill, out into a pot. Miller Nell will help if you ask nicely.',
            'Buckets and pots from Pell, next to the Ledger House. Off you go!',
          ],
          end: true,
        },
        feast_handover: {
          lines: [
            "You've got them all! Hand them here, quick, before the oven cools.",
            { do: E.trade([['egg', 1], ['bucket_of_milk', 1], ['pot_of_flour', 1]], [['bucket', 1], ['pot', 1]]) },
            { m: 'You hand over the egg, the milk and the flour. Marta gives you back the empty bucket and pot.' },
            { do: E.stage(ID, 2) },
          ],
          goto: 'feast_finish',
        },
        feast_finish: {
          lines: [
            { m: 'Marta whirls around the kitchen. Something sizzles, something rises, and something smells so good a passing villager walks into a door.' },
            'There! The harvest cake. And a few honey cakes for you — they heal like a hug from your gran.',
            { do: E.complete(ID) },
            "And take my recipe card. With it you can bake your own honey cakes on a range — an egg, milk and flour, once your Cooking reaches 20. Don't show Tamsin at the Gilded Goose. She's been after it for years.",
          ],
          end: true,
        },
      },
    });

    D.extend('hale', {
      topics: [{ text: 'Marta needs an egg. Could you spare one?', when: C.all(C.stage(ID, 1), C.lacks('egg'), C.noFlag('feast:hale_egg')), goto: 'feast_egg' }],
      nodes: {
        feast_egg: {
          lines: [
            'For Marta\'s harvest cake? Say no more. The nests are in the chicken run, but... hang on.',
            { do: [E.flag('feast:hale_egg'), E.give('egg', 1)] },
            { m: 'Farmer Hale takes an egg out of his hat and hands it to you.' },
            "Don't ask. The hens have their reasons. Tell Marta I want a slice.",
          ],
          goto: 'hub',
        },
      },
    });
    D.extend('nell', {
      topics: [{ text: 'Marta needs a pot of flour.', when: C.all(C.stage(ID, 1), C.lacks('pot_of_flour')), goto: 'feast_nell' }],
      nodes: {
        feast_nell: {
          npc: [
            "For the harvest cake! Oh, that cake. I'd grind the whole field for a slice.",
            'Bring me grain from the wheat field and a pot, and I\'ll grind it for you — or do it yourself at the hopper. Either way, don\'t sneeze on it.',
          ],
          goto: 'hub',
        },
      },
    });
  },
};
