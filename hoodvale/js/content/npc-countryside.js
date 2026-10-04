// Millbrook (Farmer Hale, Miller Nell), Saltreach (Brine, Old Salt), Copperhollow (Foreman
// Dunstan) and Mistfen (Old Wren). Quest branches: q-feast, q-goblin-bell, q-bog-song.

import { C, E } from './dlg-lib.js';

export function registerCountryside(D) {
  // ------------------------------------------------------------------ Farmer Hale
  D.define('hale', {
    ambient: ['Come on, Gerald.', 'Buttercup! Out of the turnips!', 'Rain\'s coming. Or not. Probably not.', 'Who left the gate open? Was it you, Duchess?'],
    nodes: {
      hub: {
        hub: true,
        npc: "Afternoon! Hale's the name, farming's the game. Well, it's not a game. It's mostly mud.",
        options: [
          { text: 'Could I have some milk?', goto: 'milk' },
          { text: 'Tell me about your cows.', goto: 'cows' },
          { text: 'How do I get eggs?', goto: 'eggs' },
          { text: 'What about flax and hides?', goto: 'flax' },
          { text: 'Goodbye.', end: true },
        ],
      },
      milk: {
        goto: [{ when: C.has('bucket'), goto: 'milk_yes' }, { goto: 'milk_no' }],
      },
      milk_yes: {
        lines: [
          'Course! Duchess is in a giving mood. Hand us that bucket.',
          { do: E.trade([['bucket', 1]], [['bucket_of_milk', 1]]) },
          { m: 'Hale milks Duchess into your bucket. She looks pleased about it, in a cow way.' },
          'Fresh as you like. Come back whenever — Duchess has plenty, and opinions about who gets it.',
        ],
        goto: 'hub',
      },
      milk_no: {
        npc: [
          "Happy to, but you'll need a bucket. Pell sells them in Brightwater.",
          "I'd lend you mine, but Buttercup's wearing it. Don't ask.",
        ],
        goto: 'hub',
      },
      cows: {
        npc: [
          "That's Duchess, Buttercup, Sir Reginald, Moo-riel, and the one at the back is Gerald. Gerald is a goat. Nobody's told Gerald.",
          "You can milk any of them with a bucket, if you're gentle. And if you're after cowhide and beef... there are cows in the east pen for that sort of business. Not my named ones. The ones I just call 'Cow'. I try not to get attached.",
        ],
        goto: 'hub',
      },
      eggs: {
        npc: [
          'Nests in the chicken run, north-west of the barn. Take what\'s there; the hens lay more. They\'ll glare, mind.',
          'Chickens drop feathers too, if you, ah, ask them firmly. Fletchers love feathers.',
        ],
        goto: 'hub',
      },
      flax: {
        npc: [
          'Flax grows in the blue patch north-east of the windmill. Pick it, spin it at the wheel by my farmhouse — Crafting ten — and you\'ve a bowstring. Robyn\'s lot buy armfuls.',
          'Hides, you tan at the rack south of the farmhouse, for a pinch of CREDIT. Then a needle and thread, and you\'re a leatherworker.',
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Miller Nell
  D.define('nell', {
    ambient: ['*achoo*', 'Turn, old girl, turn.', 'Flour everywhere. Story of my life.', 'Mind the cat. She\'s the white lump.'],
    nodes: {
      hub: {
        hub: true,
        npc: "Mind the dust! Everything's flour here. Me, the mill, the cat. Especially the cat.",
        options: [
          { text: 'How do I make flour?', goto: 'flour' },
          { text: 'Could you grind some grain for me?', goto: 'grind' },
          { text: 'Tell me about the windmill.', goto: 'mill' },
          { text: 'Goodbye.', end: true },
        ],
      },
      flour: {
        npc: [
          'Pick wheat from the golden field west of the mill — you can\'t miss it, it\'s the bit that looks like breakfast.',
          'Pour the grain into the hopper by the mill, and it comes out the bottom as flour. Bring a pot to collect it from the bin. Flour in bare hands just becomes flour on your everything.',
        ],
        goto: 'hub',
      },
      grind: {
        goto: [
          { when: C.all(C.has('grain'), C.has('pot')), goto: 'grind_yes' },
          { when: C.has('grain'), goto: 'grind_pot' },
          { goto: 'grind_none' },
        ],
      },
      grind_yes: {
        lines: [
          { do: E.trade([['grain', 1], ['pot', 1]], [['pot_of_flour', 1]]) },
          { m: 'Nell tips your grain into the hopper, gives the mill a friendly kick, and fills your pot.' },
          "There you are: one pot of the finest Millbrook flour. Don't sneeze.",
        ],
        goto: 'hub',
      },
      grind_pot: { npc: "I'll need a pot to put it in, love. Pell sells them in Brightwater.", goto: 'hub' },
      grind_none: { npc: 'Grind what, love? Bring me grain from the field and a pot to put the flour in.', goto: 'hub' },
      mill: {
        npc: [
          "She creaks, she groans, she's older than the King's Road. But she turns. Every day she turns.",
          "The Sheriff wanted to tax the wind. Said it was 'blowing across his land'. The wind didn't pay. Neither did I.",
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Brine (fishmonger)
  D.define('brine', {
    ambient: ['Fresh fish! Fresher than you!', 'Tackle! Bait! Opinions!', 'Shrimp again? Lovely. Lovely.', 'Buying fish! Selling hooks!'],
    nodes: {
      hub: {
        hub: true,
        npc: "Brine. I sell tackle, I buy fish. I don't buy shrimp you've sat on.",
        options: [
          { text: "Let's trade.", do: E.shop('fishing'), quiet: true },
          { text: 'What fish do you buy?', goto: 'buys' },
          { text: 'How do I catch lobster?', goto: 'lobster' },
          { text: "What's around here?", goto: 'docks' },
          { text: 'Goodbye.', end: true },
        ],
      },
      buys: {
        npc: [
          'Any fish, raw or cooked, at six-tenths of what it\'s worth. That\'s better than Pell pays, and Pell knows it.',
          'Swordfish fetch the most. Lobster next. Shrimp... I\'ll take your shrimp. Out of pity.',
        ],
        goto: 'hub',
      },
      lobster: {
        npc: [
          'Lobster pot, off the piers, Fishing forty. They walk in, they don\'t walk out. Like this town.',
          'Swordfish want a harpoon and Fishing fifty. Mind your fingers. Mind your everything.',
        ],
        goto: 'hub',
      },
      docks: {
        npc: [
          'Two piers, one fishmonger, one Old Salt. He\'ll tell you about the wyrm. Then he\'ll tell you again.',
          'Shrimp on the beach east of here, for beginners. Big stuff off the piers. Cook it at the Wobbly Kettle, north up Dock Lane.',
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Old Salt
  D.define('oldsalt', {
    ambient: ['Arr. Or as we say in the trade: arr.', 'I once saw a wave this big. No, bigger.', 'Wyrm weather, this.', 'Squid. Never trust a squid.'],
    nodes: {
      hub: {
        hub: true,
        npc: "Ahoy! Pull up a barrel. Old Salt's the name. I've sailed every sea there is, and two there isn't.",
        options: [
          { text: 'Tell me about the wyrm.', goto: [{ when: C.done('ashen_wyrm'), goto: 'wyrm_dead' }, { goto: 'wyrm' }] },
          { text: 'Tell me a sea story.', goto: 'story' },
          { text: 'Any advice for a young adventurer?', goto: 'advice' },
          { text: 'Goodbye.', end: true },
        ],
      },
      wyrm: {
        npc: [
          'The Ashen Wyrm! Saw it twice, I did. First time, a shadow over the highlands, wings wide as a harbour.',
          'Second time... well, second time it might have been a cloud. But a very wyrm-shaped cloud. With teeth.',
          'They say it sleeps on the Vale\'s oldest debt, deep under the Ashen Peak. Old Grimsby went after it once. Came back with half a beard and no stories he\'d tell.',
        ],
        goto: 'hub',
      },
      wyrm_dead: {
        npc: [
          'You killed it? THE wyrm? ...I knew it was real. I KNEW it.',
          'Tell Tobin. No — I\'ll tell Tobin. I\'ll tell him slowly. I\'ve waited thirty years for this.',
        ],
        goto: 'hub',
      },
      story: {
        npc: { r: [
          'Once fought a kraken with nothing but a spoon and a firm tone of voice. The kraken apologised. We\'re pen pals now.',
          'Sailed so far south the sea turned to soup. Lovely soup. Bit salty. Ate my way home.',
          'Traded a parrot for a map, then the map for a parrot. Same parrot. Never did find out where the map led.',
          'Got shipwrecked on an island made entirely of goblin mail. Nobody wanted it. Not even the island.',
        ] },
        goto: 'hub',
      },
      advice: {
        npc: [
          'Always carry food. Never trust a calm sea. And never, ever let a goblin hold your bell.',
          'Lobsters bite. Swordfish stab. Shrimp just look at you, disappointed.',
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Foreman Dunstan
  D.define('dunstan', {
    ambient: ['Hear that? Iron. Definitely iron.', 'Mind the carts!', 'Coal, coal, coal. Never enough coal.', 'Lanterns up, heads down!', { t: 'Goblins are sulking since their Warchief lost his hat. Production\'s up twelve percent.', when: C.done('goblin_bell') }],
    nodes: {
      hub: {
        hub: true,
        npc: "Dunstan, foreman of Copperhollow. I can hear a vein of iron through a mile of rock. Allegedly. What d'you need?",
        options: [
          { text: "Let's trade.", do: E.shop('mining'), quiet: true },
          { text: 'How do I get better at mining?', goto: 'mining' },
          { text: 'Do you buy ore?', goto: 'buys' },
          { text: "What's down in the Warrens?", goto: 'warrens' },
          { text: 'Goodbye.', end: true },
        ],
      },
      mining: {
        npc: [
          'Copper and tin, any fool can mine. Iron at fifteen, coal at thirty — both right here in the hollow.',
          "Cobalt at forty-five and starmetal at sixty, up in the Ashen Highlands where the trolls are. Bring a better pickaxe. I sell 'em: bronze, iron, steel, cobalt.",
          'And up on the Orbio plateau, orbium crystals at twenty. The thinking rock. Hums at you while you mine it. Gives me the creeps.',
        ],
        goto: 'hub',
      },
      buys: {
        npc: 'All ore and coal, at fifty-five parts in the hundred of what it\'s worth. Better than Pell, worse than my mother, who\'d pay double for anything shiny.',
        goto: 'hub',
      },
      warrens: {
        npc: [
          'Goblins. They tunnelled under the hills to get at our ore and ended up building a whole city of mud and bad ideas.',
          'Cave mouth\'s south-west of here, past the last of the rocks. Brutes inside, and a Warchief deep at the north end. If you go in, go in with food.',
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Old Wren
  D.define('wren', {
    ambient: [
      'Hm, hm, hm.',
      'Mind the bog. The bog doesn\'t mind you.',
      { t: 'Hear that? Singing. Under the water.', when: C.notDone('bog_song') },
      { t: 'Quiet fen. Good fen.', when: C.done('bog_song') },
    ],
    nodes: {
      hub: {
        hub: true,
        npc: 'Mm. Another one wading into my fen. Wet feet, dry questions. Ask, then.',
        options: [
          { text: 'Who are you?', goto: 'who' },
          { text: 'Tell me about Mistfen.', goto: 'fen' },
          { text: 'Do you sell remedies?', goto: 'remedies' },
          { text: 'What do you think of the Oracle?', goto: 'oracle' },
          { text: 'Goodbye.', end: true },
        ],
      },
      who: {
        npc: [
          'Wren. I was here before the fen. The fen arrived one wet spring and decided to stay. We\'ve got used to each other.',
          'People call me a witch. I call it gardening with opinions.',
        ],
        goto: 'hub',
      },
      fen: {
        npc: [
          'Willows, bog, mist, and things that lurk. The lurkers are mostly mud and partly teeth. The spiders to the north are mostly legs and partly silk.',
          'Fen Mere\'s just south-west of my hut. Pike in it, if you\'re brave. Things that eat pike, if you\'re not.',
        ],
        goto: 'hub',
      },
      remedies: {
        npc: [(c) => (c.quests?.isDone?.('bog_song')
          ? 'For you? Always. Though you look healthier than most who visit. Less singing in your ears, I expect.'
          : 'Not to just anyone. Remedies are for problems, and you don\'t have one yet. You will.')],
        goto: 'hub',
      },
      oracle: {
        npc: [
          'A crystal that sells answers. Hmph. In my day you asked your elders, and they told you for free. Wrongly, usually. But for free.',
          'Mind you, the Beacon answers are rather good. Don\'t tell it I said that. It\'ll charge me.',
        ],
        goto: 'hub',
      },
    },
  });
}
