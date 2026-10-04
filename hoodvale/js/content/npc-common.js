// Shared dialogue trees: bankers (Osric, Ida, Fen), Exchange clerks (Ada, Bram) and the Vale's
// villagers (Brightwater folk + the Gildmoor merchant). Per-NPC voices via by().

import { C, E, by, credit, pick } from './dlg-lib.js';

export function registerCommon(D) {
  // ------------------------------------------------------------------ bankers
  D.define('banker', {
    ambient: [
      { t: 'Deposits on the left, withdrawals on the right, complaints in the lake.', when: C.npc('banker_bw') },
      { t: 'Every coin, every carrot, every crumb: written down.', when: C.npc('banker_bw') },
      { t: 'Next! Next! Oh, you again. Next!', when: C.npc('banker_gm_1') },
      { t: 'Eleven thousand entries before lunch. Easy.', when: C.npc('banker_gm_1') },
      { t: 'Now where did I put my other spectacles...', when: C.npc('banker_gm_2') },
      { t: 'Ah. Hm. Yes. Definitely a number.', when: C.npc('banker_gm_2') },
    ],
    nodes: {
      hub: {
        hub: true,
        npc: by({
          banker_bw: 'Welcome to the Brightwater Ledger House. Every coin, every carrot, every crumb: written down, kept safe, never fudged. How may the Ledger serve you?',
          banker_gm_1: "Next! Oh — you. Bank? Questions? Quick, I've eleven thousand entries to reconcile before lunch.",
          banker_gm_2: 'Hm? Ah, a customer. Wait — (he swaps one pair of spectacles for another) — yes, definitely a customer. Welcome to the Gildmoor Ledger Bank.',
        }),
        options: [
          { text: "I'd like to access my bank.", do: E.bank() },
          { text: 'What does the bank do?', goto: 'what' },
          { text: 'What is the Ledger?', goto: 'ledger' },
          { text: 'Is my CREDIT kept here?', goto: 'credit' },
          { text: "How's the chain today?", goto: 'chain' },
          { text: 'Goodbye.', end: true },
        ],
      },
      what: {
        npc: [
          'A bank holds your items: as many as you like, stacked neatly, safe from goblins, death and your own poor decisions.',
          "Use any booth or banker — here, Brightwater, Gildmoor. It's all one Ledger, so whatever you leave in one place is waiting in the other.",
          by({
            banker_bw: 'A tip from an old bookkeeper: bank your ore and logs before a long trip. A full pack is a slow pack, and a slow adventurer is a goblin\'s lunch.',
            banker_gm_1: "Tip: deposit everything, withdraw what you need. Saves time. Time's the only thing I can't put in a vault.",
            banker_gm_2: "Tip: label your... no, wait, the bank labels them for you. Marvellous. I keep forgetting.",
          }),
        ],
        goto: 'hub',
      },
      ledger: {
        npc: [
          'The Ledger is the great book of the Vale. Every deposit, every withdrawal, every coin that changes hands: written down, line by line, in ink that never fades.',
          'These days the ink is the Robinhood Chain. Every CREDIT that moves becomes a transaction, sealed into a block every couple of seconds. Anyone can read it. No one can rub it out.',
          "It's a simulated chain, mind — a model of a ledger, not a real one, and no real value moves on it. But the principle is sound: if it's written where everyone can see, it's very hard to steal quietly.",
        ],
        lines: [
          { p: 'Unless you\'re the Sheriff.', when: C.notDone('ledger_of_lies') },
          { n: by({ banker_bw: '...I did not hear that, and neither did the Ledger.', banker_gm_1: "Shh! He banks here. Well. He banks everyone else's money here.", banker_gm_2: 'The Sheriff? Is he here? (He polishes all three pairs of spectacles at once.)' }), when: C.notDone('ledger_of_lies') },
          { n: "And since a certain someone 'audited' the Sheriff, the Ledger balances for the first time in years. I may frame this week's totals.", when: C.done('ledger_of_lies') },
        ],
        goto: 'hub',
      },
      credit: {
        npc: [
          "No — CREDIT doesn't sit in a vault. It lives in your Hood Wallet, which goes wherever you go. The bank keeps your things; your wallet keeps your CREDIT.",
          'Open your wallet to see the balance and every transaction, with its hash and its block. Death won\'t touch it, though the medics do charge a small fee for carrying you home.',
          (c) => {
            const b = c.balance();
            const tail = b <= 0 ? 'Empty as a goblin\'s promise. Quests pay well — Elowen will point you at some.'
              : b < 100 ? 'Modest. Honest. The Ledger approves.'
                : b < 2000 ? 'A tidy sum. Spend some at the Exchange, or ask the Oracle something clever.'
                  : 'Goodness. Are you sure you\'re not the Sheriff?';
            return `Right now the Ledger says you hold ${credit(b)}. ${tail}`;
          },
        ],
        goto: 'hub',
      },
      chain: {
        npc: [
          'We\'re at block {height}. A new block every two seconds or so — the Vale\'s heartbeat.',
          by({
            banker_bw: 'Quiet morning. Fish sold at the docks, bread bought here, three goblin-mail trades that I suspect were the same goblin mail.',
            banker_gm_1: 'Busy, busy. Arrows bought in Hoodwood, ore sold in Copperhollow, and somebody paid the Oracle 0.040 CREDIT to ask whether ducks have knees.',
            banker_gm_2: "Steady, I think. Or is that my spectacles? No, it's steady. Mostly troll tusks today. Somebody's been busy in the highlands.",
          }),
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Exchange clerks
  D.define('clerk', {
    ambient: [
      { t: 'Buyers to the left! Sellers to the right! Haggling in the middle!', when: C.npc('clerk_ada') },
      { t: 'Troll tusks up two percent! Goblin mail down. Still.', when: C.npc('clerk_ada') },
      { t: 'Prices.', when: C.npc('clerk_bram') },
      { t: 'No. Smiling. In the Exchange.', when: C.npc('clerk_bram') },
    ],
    nodes: {
      hub: {
        hub: true,
        npc: by({
          clerk_ada: 'Welcome to the Gildmoor Exchange! Buyers on one side, sellers on the other, and me in the middle making them meet. What can I do for you?',
          clerk_bram: 'Exchange. Buy. Sell. Ask.',
        }),
        options: [
          { text: "I'd like to use the Exchange.", do: E.exchange() },
          { text: 'How do I buy something?', goto: 'buy' },
          { text: 'How do I sell something?', goto: 'sell' },
          { text: "Who's on the other side of the trade?", goto: 'whom' },
          { text: 'Is any of this real money?', goto: 'real' },
          { text: 'Goodbye.', end: true },
        ],
      },
      buy: {
        npc: [
          by({
            clerk_ada: 'Pick an item, say how many and the most you\'ll pay for each. Your offer goes on the book. If someone\'s already selling at or below your price, you\'re matched on the spot!',
            clerk_bram: 'Item. Quantity. Your highest price. If a seller matches, done. If not, you wait.',
          }),
          by({
            clerk_ada: 'If not, your order waits on the book until someone is. The CREDIT is held from your wallet while it waits, and handed back if you cancel. Fair\'s fair.',
            clerk_bram: 'CREDIT is held while you wait. Cancel, you get it back. People always ask. Now you know.',
          }),
        ],
        goto: 'hub',
      },
      sell: {
        npc: [
          by({
            clerk_ada: 'Same thing, the other way round! Name your lowest price. When a buyer meets it, the item leaves your pack and the CREDIT lands in your wallet, with a transaction on the chain to prove it.',
            clerk_bram: 'Item. Quantity. Lowest price. Buyer matches, item goes, CREDIT comes. Chain records it.',
          }),
          by({
            clerk_ada: 'Shops pay a fixed share of what an item\'s worth. The Exchange pays what someone actually wants to pay. Sometimes that\'s far more. Sometimes, well... it\'s goblin mail.',
            clerk_bram: 'Shops pay a fixed share. We pay what the market pays. Market is usually smarter than shops. Not always. Not with goblin mail.',
          }),
        ],
        goto: 'fees',
      },
      whom: {
        npc: [
          by({
            clerk_ada: 'Every adventurer in the Vale, when they\'re about! Their orders sit on the same book as yours.',
            clerk_bram: 'Other adventurers. When they exist.',
          }),
          by({
            clerk_ada: 'And our market makers: patient folk who always quote a price on common goods, so the book is never empty. They never sleep. I\'m fairly sure they never blink.',
            clerk_bram: 'And market makers. They always quote. They never sleep. Neither do I. Coincidence.',
          }),
        ],
        goto: 'hub',
      },
      fees: {
        npc: by({
          clerk_ada: 'No fee at all for adventurers! The Exchange takes nothing but your time. The Sheriff did try to tax it once. The market makers simply priced the tax in, and he got confused and went home.',
          clerk_bram: 'Nothing. Do not ask why. I asked once. Took three days.',
        }),
        goto: 'hub',
      },
      real: {
        npc: [
          'No. The chain is simulated, and CREDIT is the Vale\'s own play-money. It never leaves this world and it isn\'t worth anything outside it.',
          by({
            clerk_ada: 'The trades are real only in the sense that someone, somewhere, really wanted your logs. Which is lovely, when you think about it.',
            clerk_bram: 'Real in here. Not out there. Like my enthusiasm.',
          }),
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ villagers (+ Gildmoor merchant)
  const rumours = [
    { t: "No bell this week. Elder Rowan says goblins took it. My rooster's doing his best, bless him, but it's not the same.", when: C.notDone('goblin_bell') },
    { t: "The bell's back! Someone marched into the Warrens and took it straight off a goblin's head. I wonder who.", when: C.done('goblin_bell') },
    { t: "Marta at the Wobbly Kettle bakes a honey cake that could raise the dead. Don't tell the dead, they'll queue." },
    { t: 'The Hood? Outlaws in Hoodwood. They steal from the Sheriff. Personally I think the Sheriff stole from us first, so it all evens out.' },
    { t: 'If you\'re after CREDIT, the Exchange in Gildmoor never closes. My cousin sold one troll tusk there and bought a hat. A very good hat.' },
    { t: "They say the Oracle up on the Spire answers any question, for a price. I asked it how to get rich. It said, 'Charge for answers.'" },
    { t: 'Old Salt down at the docks says he\'s seen the Ashen Wyrm. Twice. Old Salt also says he\'s been to the moon.', when: C.notDone('ashen_wyrm') },
    { t: "They're saying the wyrm under the Ashen Peak is dead. The mountain's quiet as a mouse. Old Salt's insufferable about it.", when: C.done('ashen_wyrm') },
    { t: 'Did you hear? The Sheriff\'s secret books got "audited" by the Hood. My window tax came back. With interest!', when: C.done('ledger_of_lies') },
    { t: 'Rats behind the inn again. Marta says it\'s the cheese. The rats also say it\'s the cheese.' },
    { t: 'Goblins along Miners\' Way drop a coin or two. And a lot of feathers. I don\'t ask where the feathers come from.' },
    { t: 'The Sheriff\'s tax collector came through yesterday, taxing shadows. Said they were "unlicensed shade".', when: C.notDone('ledger_of_lies') },
    { t: 'Someone\'s singing in Mistfen, they say. Lovely voice. Nobody who goes to listen comes back. Lovely voice, though.', when: C.notDone('bog_song') },
    { t: 'Old Wren\'s remedy worked a treat — no more singing in the fen. My aunt went back to her pike fishing.', when: C.done('bog_song') },
  ];
  D.define('villager', {
    ambient: [
      { t: 'Lovely day for it.', when: C.not(C.npc('merchant_gm')) },
      { t: 'Has anyone seen my goose?', when: C.npc('villager_0') },
      { t: 'Bees are cross today. So am I.', when: C.npc('villager_1') },
      { t: '*whistles*', when: C.not(C.npc('merchant_gm')) },
      { t: 'Still no bell...', when: C.all(C.notDone('goblin_bell'), C.not(C.npc('merchant_gm'))) },
      { t: 'Hear that bell? Lovely.', when: C.all(C.done('goblin_bell'), C.not(C.npc('merchant_gm'))) },
      { t: 'Out of my way, I am being wealthy.', when: C.npc('merchant_gm') },
      { t: 'Silk, spices, tusks. Buy low, sell lower to fools.', when: C.npc('merchant_gm') },
      { t: '*pats purse reassuringly*', when: C.npc('merchant_gm') },
    ],
    nodes: {
      hub: {
        hub: true,
        npc: by({
          villager_0: ['Morning! Lovely day for it.', "Oh, hello. Mind the geese, they're in a mood.", 'Hello there! New in Brightwater? Everyone is, at first.'],
          villager_1: ['Hello, dear. Watch where you step, my bees are about.', 'Oh! You startled me. And the bees.', "Good day! Have you tried Marta's honey cake? My honey, you know."],
          villager_2: ["Afternoon. Don't mind me. Nobody does.", 'Oh, hello. Is it Tuesday? It feels like a Tuesday.', "Hullo. Looking for adventure? I lost mine years ago. If you find it, it's mine."],
          merchant_gm: ["Yes? Make it quick, I'm terribly busy being wealthy.", 'Ah. A customer? No? A beggar? No? An adventurer. Ugh.', 'Mind the coat. It costs more than your house.'],
        }),
        options: [
          { text: 'Any news?', goto: 'news' },
          { text: 'What do you do?', goto: 'job' },
          { text: 'Goodbye.', end: true },
        ],
      },
      news: {
        npc: (c) => {
          const ok = rumours.filter((r) => !r.when || r.when(c));
          return pick(ok).t;
        },
        goto: 'hub',
      },
      job: {
        lines: [
          { n: "I mend fences. The cows break them. I mend them again. It's a relationship.", when: C.npc('villager_0') },
          { n: "Farmer Hale says one day the cows will respect the fences. I say one day I'll respect the cows. Neither of us believes it.", when: C.npc('villager_0') },
          { n: 'I keep bees down by the lake. Marta buys the honey, I buy her cake. The bees get nothing, which they mention. Often.', when: C.npc('villager_1') },
          { n: "I'm between jobs at the moment. The jobs are on either side of me, looking nervous.", when: C.npc('villager_2') },
          { n: 'I did try adventuring once. Elowen gave me an axe. I gave it back. Mutual decision.', when: C.npc('villager_2') },
          { n: 'I buy low and sell high. Mostly I sell high. Silks, spices, the odd troll tusk.', when: C.npc('merchant_gm') },
          { n: 'And I keep a very firm grip on my purse. Usually. Mostly. When I remember.', when: C.npc('merchant_gm') },
        ],
        goto: 'hub',
      },
    },
  });
}
