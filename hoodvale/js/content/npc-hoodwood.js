// Hoodwood camp: Robyn of the Hood, Little Jon, Friar Tuckwell, Marlowe.
// Quest branches for Robyn: q-hoods-oath, q-ledger-of-lies.

import { C, E } from './dlg-lib.js';

export function registerHoodwood(D) {
  // ------------------------------------------------------------------ Robyn
  D.define('robyn', {
    ambient: [
      'Steady hands, steady hearts.',
      { t: "Tax collector's late this week. Shame. I had a surprise for him.", when: C.notDone('ledger_of_lies') },
      { t: 'Good to see you, {name}!', when: C.hood() },
      { t: 'Every coin on the chain. Every receipt in the open.', when: C.done('ledger_of_lies') },
    ],
    nodes: {
      hub: {
        hub: true,
        npc: [(c) => (c.flag('hood_member') || c.quests?.isDone?.('hoods_oath')
          ? '{name}! Pull up a stump. What news from the Vale?'
          : "Well, well. A new face in Hoodwood. I'm Robyn. You'll have heard of us, or you wouldn't look so nervous.")],
        options: [
          { text: 'Who are the Hood?', goto: 'who' },
          { text: "What's wrong with the Sheriff?", goto: 'sheriff' },
          { text: 'What do you do with the CREDIT?', goto: 'redistribute' },
          { text: 'What happens now?', when: C.done('ledger_of_lies'), goto: 'after' },
          { text: 'Goodbye.', end: true },
        ],
      },
      who: {
        npc: [
          "We're the Hood. Outlaws, technically. Accountants, practically.",
          'The Sheriff taxes the Vale until it squeaks, then keeps the squeak in his vault. We take it back and give it to the people it came from. With receipts.',
          'Every coin we move goes on the Robinhood Chain. Anyone can check our work. Try asking the Sheriff for his.',
        ],
        goto: 'hub',
      },
      sheriff: {
        lines: [
          'Vane? Smiles like a cat who\'s eaten the canary and taxed the cage.',
          { n: 'He keeps two sets of books: the one he shows the King, and the true ledger he keeps for himself, locked in a strongbox under his keep.', when: C.notDone('ledger_of_lies') },
          { n: 'One day I\'ll have that true ledger. And on that day, the whole Vale gets its CREDIT back.', when: C.notDone('ledger_of_lies') },
          { n: "And now his true ledger's on my table and his 'wine cellar' is empty. He still smiles, mind. It's just a much smaller smile.", when: C.done('ledger_of_lies') },
        ],
        goto: 'hub',
      },
      after: {
        npc: [
          "Now? Now the Vale breathes. Marta's buying new chairs. Nell's mill turns tax-free. Tobin bought a second net and immediately lost it in the lake.",
          "Vane will try again; his sort always do. But the ledger is on the chain now, for anyone to read. Harder to steal in the dark when someone's left the lights on.",
          'And you, {name}? You could rest. You won\'t. I know the look.',
        ],
        goto: 'hub',
      },
      redistribute: {
        npc: [
          'Airdrops. A little to every wallet, written on the chain for all to see. The miller gets her wind tax back, the fisher his boat tax, Marta her chair tax.',
          "We keep enough for arrows and stew. Tuckwell's stew is very expensive. Mostly because of the stew.",
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Little Jon
  D.define('jon', {
    ambient: ['Arrows! Bows! Bowstrings! No refunds.', 'Mind your head. No, higher. Higher.', 'Hm.', 'Who borrowed my big spoon?'],
    nodes: {
      hub: {
        hub: true,
        npc: 'Little Jon. Quartermaster. Before you say it: yes. Ha ha. No.',
        options: [
          { text: 'Show me your bows.', do: E.shop('archery'), quiet: true },
          { text: 'How do I fletch?', goto: 'fletch' },
          { text: 'Where should I train Archery?', goto: 'train' },
          { text: 'Why "Little"?', goto: 'little' },
          { text: 'Goodbye.', end: true },
        ],
      },
      fletch: {
        npc: [
          'Knife on logs makes arrow shafts, fifteen at a time. Shafts and feathers make headless arrows. Headless arrows and arrowheads make arrows.',
          'Arrowheads come from the smith — one bar makes fifteen. Bows, you carve from logs with a knife and string with a bowstring. A plain shortbow wants Fletching five.',
          "Bowstrings, you spin from flax on the wheel at Millbrook. Or buy mine. Mine are better. I'm not being modest. I don't know how.",
        ],
        goto: 'hub',
      },
      train: {
        npc: [
          'The range east of camp, for practice. Then cows, goblins, anything that won\'t shoot back. Wolves north of here shoot back. With teeth.',
          'Longbows reach further; shortbows shoot faster. Oak bows at Archery ten, willow at twenty, maple at thirty, yew at forty, elder at fifty.',
        ],
        goto: 'hub',
      },
      little: {
        npc: [
          "Robyn named me. Said it was ironic. I said I didn't know what ironic meant. She said, 'Exactly.'",
          "...I've since looked it up. I'm still not sure.",
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Friar Tuckwell
  D.define('tuckwell', {
    ambient: ["Stew's on! Stew's always on!", 'Bless this pot.', "Who took the last trout? I'm not angry. I'm hungry.", 'Grace before meat, meat before grace, grace again for seconds.'],
    nodes: {
      hub: {
        hub: true,
        npc: 'Bless you, child, you look hungry. Everyone looks hungry to me. It\'s a gift.',
        options: [
          { text: "What's cooking?", do: E.shop('camp_food'), quiet: true },
          { text: 'Any cooking advice?', goto: 'cooking' },
          { text: 'Could you bless me?', goto: 'bless' },
          { text: 'Why are you with outlaws?', goto: 'why' },
          { text: 'Goodbye.', end: true },
        ],
      },
      cooking: {
        npc: [
          'Cook on a fire and you\'ll burn some. Cook on a range and you\'ll burn fewer. Cook long enough and you\'ll stop burning altogether: shrimp by thirty-four, trout by fifty, salmon by fifty-eight.',
          'Bread wants a range — flour and water, then bake. Never bake on a campfire. I tried once. The woodland creatures still talk about it.',
        ],
        goto: 'hub',
      },
      bless: {
        lines: [
          'I bless the stew, the arrows, and anyone who washes a pot. Here — bless you.',
          { m: 'Friar Tuckwell makes a sign over you with a ladle. You feel very slightly holier, and smell faintly of onions.' },
        ],
        goto: 'hub',
      },
      why: {
        npc: [
          'The Sheriff closed my abbey for unpaid taxes. On prayers. Per prayer!',
          'So now I feed the Hood, and the Hood feeds the Vale. Same work. The congregation just has more bows.',
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Marlowe (thief trainer)
  D.define('marlowe', {
    ambient: ['Lovely purse. Shame if someone... admired it.', 'Quick hands, quiet feet.', '*counts something under her breath*'],
    nodes: {
      hub: {
        hub: true,
        npc: ['Your purse is fine. Probably. Check.', "I'm Marlowe. I teach the gentle art of relocating property."],
        again: 'Still here? Still got your purse? Good.',
        options: [
          { text: 'How do I train Thieving?', goto: 'train' },
          { text: 'What happens if I get caught?', goto: 'caught' },
          { text: 'Is stealing wrong?', goto: 'ethics' },
          { text: 'Any targets you\'d suggest?', goto: 'targets' },
          { text: 'Goodbye.', end: true },
        ],
      },
      train: {
        npc: [
          'Start with Brightwater\'s villagers: pickpocket them, gently, for a coin or two. Level ten, Farmer Hale. Twenty-five, the Sheriff\'s tax collector. Forty, the fat merchants of Gildmoor.',
          'Stalls too: the bakery stall in Brightwater at five; silk at twenty, furs at thirty-five and gems at fifty in Gildmoor\'s market. The guards look away eventually. Usually.',
        ],
        goto: 'hub',
      },
      caught: {
        npc: [
          'They\'ll slap you, stun you for a few seconds, and probably say something hurtful about your mother.',
          'Wait it out, try again. Every master was once a very slapped apprentice.',
        ],
        goto: 'hub',
      },
      ethics: {
        npc: [
          "Taking from someone who has too much and giving it to someone who has too little? That's not stealing. That's arithmetic.",
          "Taking from a farmer's purse because you're bored? That's stealing. Don't do that. Do the arithmetic.",
        ],
        goto: 'hub',
      },
      targets: {
        lines: [
          "The tax collector in Gildmoor's square. Struts like a peacock, pockets like a pelican. Everything in his purse was in someone else's purse last week.",
          { n: "And his ledger is in his left coat pocket. Not that I looked. I always look.", when: C.stage('hoods_oath', 3) },
        ],
        goto: 'hub',
      },
    },
  });
}
