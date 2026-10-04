// Gildmoor: Brackwell (armourer), Lumen (sigils), Tamsin (the Gilded Goose), the tax collector,
// Sheriff Vane. Bankers, clerks and the merchant use the shared trees in npc-common.js.

import { C, E, credit } from './dlg-lib.js';

export function registerGildmoor(D) {
  // ------------------------------------------------------------------ Brackwell
  D.define('brackwell', {
    ambient: ['Plate! Mail! Pointy things!', "That'll buff out.", 'Steel! Iron! Hope for the best!', 'It fits. Give it a week.'],
    nodes: {
      hub: {
        hub: true,
        npc: 'Brackwell Armoury! Finest plate in the Vale. It fits. Eventually. Give it a week.',
        options: [
          { text: 'Show me your armour.', do: E.shop('armour'), quiet: true },
          { text: 'What armour should I wear?', goto: 'armour' },
          { text: 'And weapons?', goto: 'weapons' },
          { text: 'Goodbye.', end: true },
        ],
      },
      armour: {
        npc: [
          'Iron at Defence ten, steel at twenty, cobalt at thirty, starmetal at forty. Helm, chestplate, legs, kiteshield. More metal, fewer holes in you.',
          'Or forge your own — Gildmoor Forge is just over the way. But then you\'d miss my charming personality and my fifteen-percent markup.',
        ],
        goto: 'hub',
      },
      weapons: {
        npc: [
          'Swords are balanced, greatswords are big, daggers are for people who want to be close enough to apologise.',
          "Iron at Attack ten, steel at twenty. A greatsword hits like a cart and swings like one, and you can't hold a shield with it. Choose your regrets.",
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Lumen
  D.define('lumen', {
    ambient: ['The sigils are restless today.', 'Spark sigils, fresh pressed!', 'Hm-mm-mmm... sorry, that was the crystals.', 'Path sigils fold the road like a letter.'],
    nodes: {
      hub: {
        hub: true,
        npc: "Oh — hello. The sigils were humming about you. I'm Lumen. Welcome to Lumen & Sigil.",
        options: [
          { text: 'Show me your sigils.', do: E.shop('arcana'), quiet: true },
          { text: 'What are sigils?', goto: 'sigils' },
          { text: 'What spells are there?', goto: 'spells' },
          { text: 'Tell me about staves.', goto: 'staves' },
          { text: 'How do I learn Arcana?', goto: 'learn' },
          { text: 'Goodbye.', end: true },
        ],
      },
      sigils: {
        npc: [
          'A sigil is a thought, pressed into crystal so it keeps. Spark, tide, stone, ember, path, thought, insight.',
          'Cast a spell and its sigils are spent — the thought is thought, and gone. Like CREDIT for the mind. The Oracle finds that very funny. I think.',
        ],
        goto: 'hub',
      },
      spells: {
        npc: [
          'Spark Bolt first. Tide Bolt at five, Stone Bolt at nine, Ember Bolt at fourteen. Thought Lance at thirty bites hard; Insight Storm at fifty bites harder.',
          'And the Paths: to Brightwater at twelve, to Gildmoor at twenty-two, to the Spire at thirty-five. A path sigil folds the road, and you step across the crease.',
        ],
        goto: 'hub',
      },
      staves: {
        npc: [
          'A plain staff helps you aim. A staff of sparks, tides or embers supplies its sigil forever. You\'ll never run out of sparks with a staff of sparks. Very freeing.',
          'Archivist Sol at the Spire has an orbium staff he won\'t stop talking about. Arcana forty-five. Don\'t ask him about it unless you have an afternoon.',
        ],
        goto: 'hub',
      },
      learn: {
        npc: [(c) => (c.quests?.isDone?.('oracles_price')
          ? 'You already know! I can see it — you hum a little now. Spark sigils are on the top shelf.'
          : 'The Orbio Oracle teaches it, up on the Spire. Bring it orbium shards from the plateau — you\'ll need Mining twenty — and answer its question honestly. Strange teacher. Fair one.')],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Tamsin (the Gilded Goose)
  D.define('tamsin', {
    ambient: ['Pie! Hot pie!', 'Another round?', 'Heard that one before. Tell it better.', 'No singing on the tables. Looking at you, Bram.'],
    nodes: {
      hub: {
        hub: true,
        npc: "Gilded Goose. Ale's cold, pie's hot, gossip's free. What's yours?",
        options: [
          { text: "What's to eat?", do: E.shop('inn'), quiet: true },
          { text: "What's the gossip?", goto: 'gossip' },
          { text: 'Tell me about Gildmoor.', goto: 'town' },
          { text: 'Why the Gilded Goose?', goto: 'goose' },
          { text: "I have Marta's recipe card.", when: C.has('recipe_card'), goto: 'recipe' },
          { text: 'Goodbye.', end: true },
        ],
      },
      gossip: {
        lines: [
          { r: [
            "The Sheriff's had stairs dug under his keep. Says it's a wine cellar. Wine cellars don't need knights.",
            'Vault knights drink here sometimes. Never pay. One dropped his key once — took him three hours to find it under the table. He was very cross with the table.',
            "The Exchange clerks bet on troll tusk prices. Bram lost. Bram always loses. That's why he never smiles.",
          ], when: C.notDone('ledger_of_lies') },
          { r: [
            "The Sheriff drinks here now, since his vault got emptied. Calls it 'a temporary liquidity event'. Pays in IOUs.",
            'Everyone in town got an airdrop from the Hood. Half of them spent it here. I\'m warming to outlaws.',
          ], when: C.done('ledger_of_lies') },
          { n: "Careful, love — tax man by the fountain. Your cowl's showing.", when: C.all(C.hood(), C.notDone('ledger_of_lies')) },
        ],
        goto: 'hub',
      },
      town: {
        npc: [
          "Walls and gates. The Sheriff's keep up in the north-east, the Exchange on the west side, the bank to the east. Lumen's sigil shop by the keep — glows at night, can't miss it.",
          'North gate takes you up the Spire Road to the Oracle. South gate, back to the farms. West gate down Westgate Lane towards Hoodwood, if you\'re the sort who has friends in Hoodwood. Which you didn\'t hear from me.',
        ],
        goto: 'hub',
      },
      recipe: {
        npc: [
          "You WHAT? Let me see— no. No, I won't. The Goose has its pride.",
          "...Is the secret ingredient more honey? It's more honey, isn't it. I knew it. Forty years I've known it.",
        ],
        goto: 'hub',
      },
      goose: {
        npc: [
          'My grandmother had a goose that laid one gold egg. Just the one. Then it retired. We painted the sign to remember it by.',
          'The Sheriff taxed the egg.',
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ the tax collector
  D.define('taxman', {
    ambient: [
      { t: 'Taxes! Lawful taxes! Form an orderly queue!', when: C.notDone('ledger_of_lies') },
      { t: 'A tax on that, a tax on this...', when: C.notDone('ledger_of_lies') },
      { t: 'Has anyone seen my ledger? I mean — nobody touch my ledger.', when: C.reached('hoods_oath', 4) },
      { t: 'The Ledger is... under review.', when: C.done('ledger_of_lies') },
      { t: '*eyes your hood nervously*', when: C.hood() },
    ],
    nodes: {
      hub: {
        hub: true,
        npc: 'Halt! You stand before an officer of the Sheriff of Gildmoor: collector of levies, assessor of duties, keeper of the Very Important Ledger.',
        options: [
          { text: 'What do you collect?', goto: 'taxes' },
          { text: 'Do I owe anything?', goto: [
            { when: C.done('ledger_of_lies'), goto: 'owe_audit' },
            { when: C.hood(), goto: 'owe_hood' },
            { when: C.poor(1), goto: 'owe_broke' },
            { goto: 'owe' },
          ] },
          { text: "That's a fancy hat.", goto: 'hat' },
          { text: 'Goodbye.', end: true },
        ],
      },
      taxes: {
        npc: [
          'Everything, citizen! Road tax, bridge tax, window tax, door tax, the tax on not having a door, and the levy on standing about asking questions.',
          'All lawfully owed to the Sheriff, who keeps it safe. In his vault. Where it is very, very safe.',
        ],
        goto: 'hub',
      },
      owe: {
        npc: ["Let me consult the Ledger... (scribble, scribble)... ah! A walking-on-cobbles duty. One milli-CREDIT, payable at once."],
        options: [
          { text: 'Fine. Here.', do: E.debit(1, 'Gildmoor cobble duty (under protest)'), goto: 'paid', fail: 'owe_broke' },
          { text: 'I refuse.', goto: 'refuse' },
        ],
      },
      paid: {
        lines: [
          { m: (c) => `You pay 0.001 CREDIT. Your wallet now holds ${credit(c.balance())}.` },
          'Splendid! The Sheriff thanks you. I thank you. My hat thanks you.',
        ],
        goto: 'hub',
      },
      refuse: {
        lines: [
          'Refuse? REFUSE? I shall make a note! In the Ledger! In red ink!',
          { m: 'He makes a note. It appears to be a doodle of a goose.' },
        ],
        goto: 'hub',
      },
      owe_broke: { npc: 'Hmph. Your purse is emptier than the Sheriff\'s conscience. Move along. Paupers are untaxable. For now.', goto: 'hub' },
      owe_hood: {
        npc: [
          'You? You owe... ah. That hood. One of THEM.',
          "No, no — no tax due. None at all. Exempt! Entirely exempt. Please don't tell Robyn where I live.",
        ],
        goto: 'hub',
      },
      owe_audit: {
        npc: 'There is... no tax currently due. The Ledger is being audited. Thoroughly. By outlaws. Please stop looking at me like that.',
        goto: 'hub',
      },
      hat: {
        npc: [
          'This hat, citizen, is the official plumage of the Sheriff\'s Collectory. Each feather represents a tax.',
          'I am considering a feather tax. For the hat.',
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Sheriff Vane
  D.define('vane', {
    ambient: [
      { t: 'Lovely day for collecting.', when: C.notDone('ledger_of_lies') },
      { t: 'Counting, counting...', when: C.notDone('ledger_of_lies') },
      'Mind the carpet. It\'s taxed.',
      { t: '*mutters about outlaws*', when: C.done('ledger_of_lies') },
      { t: 'A temporary liquidity event. Temporary!', when: C.done('ledger_of_lies') },
    ],
    nodes: {
      hub: {
        hub: true,
        npc: [(c) => (c.quests?.isDone?.('ledger_of_lies')
          ? 'You. I know what you did. My accountants know what you did. My accountants are very upset.'
          : 'Ah. A peasant. How quaint. I am Sheriff Vane, steward of Gildmoor, guardian of the Vale\'s prosperity. Mostly mine.')],
        options: [
          { text: 'What do you do here?', goto: 'job' },
          { text: 'What do you think of the Hood?', goto: 'hood' },
          { text: "What's under your keep?", goto: 'vault' },
          { text: 'Your taxes are too high.', goto: 'taxes' },
          { text: 'Goodbye.', end: true },
        ],
      },
      job: {
        npc: [
          'I keep order. Order requires guards, guards require pay, pay requires taxes, taxes require collectors, collectors require hats.',
          "It's a virtuous circle. I am at the centre of it. That's the virtuous part.",
        ],
        goto: 'hub',
      },
      hood: {
        lines: [
          'Robyn and her rabble? Thieves in green. They take what is lawfully mine and give it to people who will only spend it on bread.',
          'Bread! When they could be paying taxes on it.',
          { n: 'And you — yes, you, with the cowl. I have your face in my book. Smaller than the others. In pencil. But it is there.', when: C.hood() },
        ],
        goto: 'hub',
      },
      vault: {
        lines: [
          { n: 'Under my keep? A wine cellar. Very ordinary. Very damp. Guarded by knights, because the wine is... aggressive.', when: C.notDone('ledger_of_lies') },
          { n: "There is nothing in my vault any more. You know that. You were there. I've hired a new accountant: a skeleton. He doesn't ask questions.", when: C.done('ledger_of_lies') },
        ],
        goto: 'hub',
      },
      taxes: {
        npc: [
          'Too high? Citizen, taxes are a gift. A gift you give to me.',
          'And I accept it graciously, every week, without fail. You\'re welcome.',
        ],
        goto: 'hub',
      },
    },
  });
}
