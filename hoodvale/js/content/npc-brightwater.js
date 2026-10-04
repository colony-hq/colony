// Brightwater: Guide Elowen (post-tutorial), Pell, Harlan, Marta, Tobin, Elder Rowan.
// Quest branches for Elowen, Marta and Rowan live in q-into-the-vale / q-feast / q-goblin-bell.

import { C, E, credit } from './dlg-lib.js';

export const STARTER_TOOLS = ['bronze_axe', 'tinderbox', 'small_net', 'bronze_pickaxe', 'hammer'];

// Elowen's "where next?" advice, from the player's levels and quest log.
function nextSteps(c) {
  const q = (id) => c.quests?.status?.(id) || 'not_started';
  const cb = c.combat();
  const out = [];
  if (q('into_the_vale') !== 'done') out.push('Finish your lessons first! Everything else is easier once you can chop, fish, mine and fight.');
  if (q('feast_for_brightwater') === 'not_started') out.push("Marta at the Wobbly Kettle needs eggs, milk and flour for her harvest cake. Easy work, and she pays in cake.");
  if (q('goblin_bell') === 'not_started') {
    out.push(cb >= 8 ? "Elder Rowan's bell was stolen by goblins. You can hold a sword now — he'd be grateful." : `Raise your combat level — chickens and cows at Millbrook, goblins along Miners' Way. At combat 8 (you're ${cb}), Elder Rowan has a job for you.`);
  }
  if (q('hoods_oath') === 'not_started') {
    const a = c.level('archery'), t = c.level('thieving');
    out.push(a >= 10 && t >= 10 ? 'Robyn of the Hood is recruiting at the camp in Hoodwood. Steady hands and light fingers — you have both.' : `The Hood recruits archers and thieves at level 10 in both (you have Archery ${a}, Thieving ${t}). Marlowe and Little Jon at the camp will teach you.`);
  }
  if (q('oracles_price') === 'not_started') {
    const m = c.level('mining');
    out.push(m >= 20 ? 'The Orbio Oracle on the Spire teaches Arcana to miners who bring it orbium. You\'re ready.' : `Arcana is taught by the Orbio Oracle, but only to miners of level 20 (you're ${m}). Copperhollow's iron rocks will get you there.`);
  }
  if (q('bog_song') === 'not_started' && cb >= 25) out.push(cb >= 30 ? 'Old Wren in Mistfen has been asking for help. Something is singing in the bog.' : 'Old Wren in Mistfen needs a fighter of combat 30. Nearly there!');
  if (q('ledger_of_lies') === 'not_started' && q('hoods_oath') === 'done') out.push('Robyn has bigger plans for you now: the Sheriff\'s own vault. Combat 35 at least.');
  if (q('ashen_wyrm') === 'not_started' && q('goblin_bell') === 'done' && cb >= 40) out.push('Hermit Grimsby up in the Ashen Highlands has a wyrm problem. Literally. Combat 50 before you even think about it.');
  if (!out.length) return ["Honestly? You've outgrown my advice. Go and make the Vale tell stories about you.", 'Though if you want gold — sorry, CREDIT — the trolls and golems in the highlands drop plenty, and the Exchange will pay well for wyrm scales.'];
  return out.slice(0, 2);
}

export function registerBrightwater(D) {
  // ------------------------------------------------------------------ Guide Elowen
  D.define('elowen', {
    ambient: [
      { t: '{name}! Over here, in the Guide\'s Hall!', when: C.notStarted('into_the_vale') },
      'Click a tree to chop it. Simple as that.',
      'Talk to people! Half the Vale\'s secrets are just someone waiting to be asked.',
      'Eat before you\'re hungry, bank before you\'re full.',
      { t: 'Look at you! A proper adventurer.', when: C.done('into_the_vale') },
    ],
    nodes: {
      hub: {
        hub: true,
        npc: [(c) => (c.quests?.isDone?.('into_the_vale')
          ? '{name}! Back from the road? Sit, tell me everything. Or ask me something, if you\'d rather.'
          : 'Hello again, {name}. Questions? Ask away.')],
        options: [
          { text: 'Where should I go next?', goto: 'next' },
          { text: 'Tell me about the Vale.', goto: 'vale' },
          { text: "What's CREDIT, really?", goto: 'credit' },
          { text: 'Who are the Hood?', goto: 'hood' },
          { text: "I've lost some of my tools.", goto: 'tools', when: C.reached('into_the_vale', 1) },
          { text: 'Goodbye.', end: true },
        ],
      },
      next: { npc: [(c) => nextSteps(c)[0], (c) => nextSteps(c)[1] || ''], goto: 'hub' },
      vale: {
        npc: [
          'Brightwater is home: the lake, the smithy, the Wobbly Kettle, the Ledger House. East along the King\'s Road lie Millbrook\'s farms, and beyond them Gildmoor — walls, the Sheriff\'s keep and the Exchange.',
          'North up the Forest Road is Hoodwood, where the Hood keeps its camp. West along Miners\' Way is Copperhollow, all ore and lanterns — and the goblin Warrens underneath.',
          'Past Hoodwood lies Mistfen, willows and bog and things that lurk. North of everything, the Ashen Highlands, where the trolls are big and the golems are bigger.',
          'And on the plateau north of Gildmoor, the Orbio Spire: crystals that think, and an Oracle that charges for it. South of here, Saltreach Docks, if you like your fish large and your sailors larger-than-life.',
        ],
        goto: 'hub',
      },
      credit: {
        npc: [
          'CREDIT is what the Vale runs on. Shops take it, monsters drop it, quests pay it, and it lives in your Hood Wallet.',
          'It began up at the Spire. The Orbio minds turned thinking itself into tokens: one answer, one little spend. Then somebody used a token to buy bread, and that was that.',
          'Every CREDIT that moves is written on the Robinhood Chain — a ledger anyone can read. Simulated, of course; nothing real changes hands. Open your wallet and you\'ll see every coin\'s footprints.',
          (c) => `You have ${credit(c.balance())} right now. ${c.balance() > 0 ? 'Spend it wisely. Or at least memorably.' : 'Finish a quest or two and that will change.'}`,
        ],
        goto: 'hub',
      },
      hood: {
        npc: [
          'Outlaws. Or heroes, depending on whether you\'re the Sheriff. They live in Hoodwood under Robyn, and they take back what the Sheriff\'s taxes took.',
          'They don\'t take just anyone. Robyn wants archers who make their own arrows, and thieves who can lift a purse without lifting an eyebrow.',
          { r: ['If anyone asks, I never told you the Forest Road leads straight to their camp.', 'Little Jon owes me a bow. Remind him. From a distance.'] },
        ],
        goto: 'hub',
      },
      tools: {
        do: (c) => {
          c.session.gave = STARTER_TOOLS.filter((id) => c.count(id) < 1);
          for (const id of c.session.gave) c.give(id, 1);
        },
        lines: [
          { n: 'Here. And try not to drop this lot in the lake — Tobin\'s still fishing out the last set.', when: (c) => c.session.gave?.length > 0 },
          { m: 'Elowen hands you replacement tools.', when: (c) => c.session.gave?.length > 0 },
          { n: 'Lost? You\'re carrying everything I gave you. Check your bank, perhaps — or your pockets. Or your other pockets.', when: (c) => !c.session.gave?.length },
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Pell (general store)
  D.define('pell', {
    ambient: [
      'Tinderboxes! Nets! Buckets! Hope, slightly used!',
      'Everything must go! Except me. I\'m staying.',
      'Fresh bread, fresh from... this morning, roughly.',
      'Buying! Selling! Mostly selling!',
    ],
    nodes: {
      hub: {
        hub: true,
        npc: "Welcome, welcome! Pell's General Store: if it exists, I sell it. If it doesn't exist, I'll take a deposit.",
        options: [
          { text: 'Let me see your wares.', do: E.shop('general'), quiet: true },
          { text: 'Do you buy things?', goto: 'buy' },
          { text: 'What should a new adventurer carry?', goto: 'kit' },
          { text: 'Heard any gossip?', goto: 'gossip' },
          { text: 'Goodbye.', end: true },
        ],
      },
      buy: {
        npc: [
          "I'll buy almost anything, at four-tenths of what it's worth. Logs, ore, goblin mail, mysterious boots... I don't ask questions. I ask 'how many?'",
          'For better prices: Brine at the docks pays more for fish, Dunstan in Copperhollow more for ore. Or haggle with the whole Vale on the Exchange in Gildmoor.',
        ],
        goto: 'hub',
      },
      kit: {
        npc: [
          'An axe, a tinderbox, a net, a pickaxe and a hammer. Then food. Then more food. Bread\'s cheap; dying isn\'t — the medics charge for the stretcher.',
          'A bucket and a pot, if you mean to bake. And feathers and bait if you fish with a rod. I sell all of it, by sheer coincidence.',
        ],
        goto: 'hub',
      },
      gossip: {
        lines: [
          { r: [
            "Harlan's been forging something for the Sheriff's guards. He hates it. Hammer goes clang, face goes grumpy.",
            "Somebody keeps selling me goblin mail by the armful. I've enough to dress a goblin army. Which might be the plan.",
            'Little Jon came in for thread. Said it was for "sewing". He bought four hundred feathers. Nobody sews with feathers.',
          ], when: C.notDone('ledger_of_lies') },
          { n: "Business is up since the Sheriff's 'audit'. People have CREDIT again! I've had to restock the hope.", when: C.done('ledger_of_lies') },
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Harlan the Smith
  D.define('harlan', {
    ambient: ['*CLANG*', 'Hm.', 'Heat\'s good today.', '*CLANG* ... *CLANG*', 'Mind the sparks.', { t: "Rowan's bell. Good sound. Better than my anvil.", when: C.done('goblin_bell') }],
    nodes: {
      hub: {
        hub: true,
        npc: 'Hm. Harlan. Smith. You want something forged, or you want to learn?',
        options: [
          { text: 'Let me see what you sell.', do: E.shop('smith'), quiet: true },
          { text: 'How do I smith?', goto: 'smith' },
          { text: 'Where do I find ore?', goto: 'ore' },
          { text: "What's the best metal?", goto: 'metals' },
          { text: 'Goodbye.', end: true },
        ],
      },
      smith: {
        npc: [
          'Ore in the furnace makes bars. Copper and tin make bronze. Iron alone makes iron, if you\'re level fifteen. Iron with two coal makes steel, at thirty.',
          'Bars on the anvil, hammer in your pack. Then you choose: dagger, sword, helm, shield, plate. More bars, more work, more learning.',
          'Start with daggers. Everyone starts with daggers. I started with a dagger. Still have it. Still terrible.',
        ],
        goto: 'hub',
      },
      ore: {
        npc: [
          "Copper and tin east of my smithy, for learners. Proper ore's in Copperhollow, west along Miners' Way. Iron. Coal. Goblins too. Hit them.",
          'Cobalt and starmetal up in the Ashen Highlands. Trolls guard it. Hit them harder.',
        ],
        goto: 'hub',
      },
      metals: {
        npc: [
          'Bronze, iron, steel, cobalt, starmetal. Each harder to work than the last.',
          'Starmetal fell from the sky. Smells like a thunderstorm. Needs six coal a bar and level sixty. Worth it.',
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Marta (innkeeper)
  D.define('marta', {
    ambient: [
      'Fresh stew! Hot stew! Stew!',
      "Mind the floor, it's just been... well, it's been floor.",
      { t: 'Where am I going to find flour this late in the season...', when: C.notDone('feast_for_brightwater') },
      { t: "Honey cake's in the oven, thanks to {name}!", when: C.done('feast_for_brightwater') },
    ],
    nodes: {
      hub: {
        hub: true,
        npc: 'Welcome to the Wobbly Kettle, love! Sit, eat, drip on the floor if you must. What\'ll it be?',
        options: [
          { text: "What's on the menu?", do: E.shop('inn'), quiet: true },
          { text: 'Why the Wobbly Kettle?', goto: 'inn' },
          { text: 'Any gossip?', goto: 'gossip' },
          { text: 'Can I use your range?', goto: 'range' },
          { text: 'Goodbye.', end: true },
        ],
      },
      inn: {
        npc: [
          "Forty years this kettle's wobbled and it's never once spilled. The table, mind, has spilled plenty.",
          "Rooms upstairs for travellers, stew downstairs for everyone, and rats out back for anyone who wants a scrap. Elowen sends her learners to them. 'Character building', she calls it.",
        ],
        goto: 'hub',
      },
      gossip: {
        lines: [
          { r: [
            "The Sheriff's tax man came through last week, taxing chairs. Chairs! I said the chairs were sat on by honest folk, so he taxed the honest folk too.",
            "Robyn's lot come in sometimes dressed as farmers. Terrible farmers. Never know which end of the cow is which. Lovely tippers, though.",
            "Tobin proposed to me once. Brought a fish. A nice fish, mind. I said no, but I cooked the fish.",
          ] },
        ],
        goto: 'hub',
      },
      range: {
        npc: [
          "Help yourself — it's in the kitchen, back left. A range burns less than a campfire, and it's the only place you can bake bread.",
          'Bread\'s easy: a pot of flour and a bucket of water make dough. Pop it on the range. Don\'t pop it on a campfire. Friar Tuckwell did that once and Hoodwood still talks about it.',
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Tobin (fisherman)
  D.define('tobin', {
    ambient: ['...', 'Bite. No. Weed.', '*hums tunelessly*', 'Fish are thinking. I can tell.'],
    nodes: {
      hub: {
        hub: true,
        npc: '...Tobin. Fish.',
        again: '...Mm?',
        options: [
          { text: 'How do I fish?', goto: 'fish' },
          { text: "Where's the best fishing?", goto: 'where' },
          { text: 'Do you know Old Salt?', goto: 'salt' },
          { text: 'Goodbye.', end: true },
        ],
      },
      fish: {
        npc: [
          'Net, for shrimp. East shore of the lake. Net goes in, shrimp come out. Mostly.',
          'Rod and bait, for sardines. Pike too, when you\'re good. Cook it on a fire. Or eat it raw.',
          "...Don't eat it raw.",
        ],
        goto: 'hub',
      },
      where: {
        npc: [
          'Shrimp, here. Trout and salmon in the Hoodwood river, with a fly rod and feathers. Level twenty for trout, thirty for salmon.',
          'Lobster and swordfish off the Saltreach piers. Big fish. Big opinions.',
          "Pike in Fen Mere, if you don't mind the things that also fish there.",
        ],
        goto: 'hub',
      },
      salt: {
        npc: [
          'Old Salt. Says he saw the wyrm. Says he fought a squid with a spoon.',
          '...He did fight a squid. I was there. Small squid. Spoon won.',
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Elder Rowan
  D.define('rowan', {
    ambient: [
      { t: 'Forty years... and now silence.', when: C.notDone('goblin_bell') },
      { t: 'Goblins. In MY belfry.', when: C.notDone('goblin_bell') },
      { t: '*DONG* ... ahh. Music.', when: C.done('goblin_bell') },
      { t: 'Good morning, Brightwater!', when: C.done('goblin_bell') },
    ],
    nodes: {
      hub: {
        hub: true,
        npc: [(c) => (c.quests?.isDone?.('goblin_bell')
          ? 'Hear that? Every morning now. *DONG*. Bless you, {name}. What can an old man do for you?'
          : 'Ah, a visitor. I am Rowan, elder of Brightwater, keeper of the bell. Well. Keeper of where the bell used to be.')],
        options: [
          { text: 'Tell me about Brightwater.', goto: 'bw' },
          { text: 'Any advice for me?', goto: 'advice' },
          { text: 'Goodbye.', end: true },
        ],
      },
      bw: {
        npc: [
          'Brightwater was a fishing hamlet once. Then the King\'s Road came, and Elowen\'s hall, and young folk from every corner of the world arrived to learn how to hold an axe without losing a toe.',
          'Every dawn for forty years I have rung the bell over the square. It tells the Vale: a new day, a new start. Nobody misses a bell until it stops.',
        ],
        goto: 'hub',
      },
      advice: {
        npc: [
          'Bank your valuables, eat before you\'re hungry, and never trust a goblin who says "trust me".',
          "They don't have a word for trust, you see. They borrowed ours and never gave it back.",
        ],
        goto: 'hub',
      },
    },
  });
}
