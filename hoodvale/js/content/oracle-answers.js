// The Orbio Oracle's hand-written answers, three per topic: Spark (cheap, confidently wrong),
// Lamp (half right), Beacon (precise and useful; also the fact sheet for Live answers).
// Pure data. Owner: content builder.

export const TOPIC_GROUPS = [
  { id: 'train', label: 'Where should I train a skill?', topics: ['woodcutting', 'fishing', 'mining', 'smithing', 'cooking', 'firemaking', 'fletching', 'crafting', 'thieving', 'archery', 'arcana', 'melee'] },
  { id: 'boss', label: 'How do I defeat a great foe?', topics: ['warchief', 'vane', 'wyrm'] },
  { id: 'quest', label: 'Help me with my quest.', topics: ['myquest'] },
  { id: 'lore', label: 'Tell me the secrets of the Vale.', topics: ['credit', 'hood', 'sheriff_secret', 'oracle_self', 'ledger_chain', 'wyrm_lore', 'money_real'] },
];

export const ANSWERS = {
  // ---------------------------------------------------------------- training
  woodcutting: {
    label: 'Woodcutting', q: 'Where should I train Woodcutting?',
    spark: 'Trees are best chopped at night, while they sleep and cannot dodge. Begin with the Ashen Wyrm. It is technically wooden. (It is not wooden.)',
    lamp: 'Chop the plain trees around Brightwater first, then oaks. Willows grow somewhere damp, I believe. A better axe helps, or so the axes tell me.',
    beacon: "Plain trees from level 1 all around Brightwater. Oaks at 15 (Brightwater's outskirts, Hoodwood, Millbrook). Willows at 30 along the Hoodwood river north-east of the camp and all over Mistfen. Maples at 45 outside Gildmoor's east wall and in the north-east woods; yews at 60 there and in the highlands; elder trees at 75 near the Ashen Peak. Upgrade your axe at Brackwell's in Gildmoor.",
  },
  fishing: {
    label: 'Fishing', q: 'Where should I train Fishing?',
    spark: "Fish are attracted to confidence. Stand in the lake and shout 'I am a worm!' Lobsters respond best to poetry. Swordfish to interpretive dance.",
    lamp: 'Net shrimp at Brightwater lake, then try a rod and bait. Trout live in a river somewhere to the north. The large fish are at the docks, possibly with a harpoon. Possibly with teeth.',
    beacon: "Net shrimp from level 1 on Brightwater lake's east shore or the beach east of Saltreach. Bait sardines at 5 and pike at 25 (the lake, Fen Mere). Fly-fish trout at 20 and salmon at 30 in the Hoodwood river (fly rod + feathers). Lobster at 40 (lobster pot) and swordfish at 50 (harpoon) off the Saltreach piers. Brine at the docks sells tackle and pays 60% of value for fish.",
  },
  mining: {
    label: 'Mining', q: 'Where should I train Mining?',
    spark: 'Mine the Spire. I am made of the finest crystal in the Vale. ...Please do not mine me. That was a test. You passed. Probably.',
    lamp: 'Copper and tin are easy. Iron and coal are in Copperhollow. The shiny ones are higher up, where it is colder and something large is breathing.',
    beacon: "Copper and tin from level 1 east of Brightwater's smithy and in Copperhollow. Iron at 15 and coal at 30 in Copperhollow. Cobalt at 45 and starmetal at 60 in the Ashen Highlands (troll country, and near the peak). Orbium shards at 20 here on the Spire plateau. Foreman Dunstan sells pickaxes up to cobalt and buys ore at 55% of value.",
  },
  smithing: {
    label: 'Smithing', q: 'How should I train Smithing?',
    spark: 'Strike the anvil with your forehead until a sword falls out. Results vary. Mostly they are headaches.',
    lamp: 'Smelt ore into bars, then hammer the bars into things. Bronze needs two ores; steel needs coal. Daggers are cheap, armour costs more bars and teaches more.',
    beacon: 'Smelt at any furnace (Brightwater, Copperhollow, Gildmoor): bronze (copper + tin) at 1, iron (1 iron ore) at 15, steel (iron + 2 coal) at 30, cobalt (+4 coal) at 45, starmetal (+6 coal) at 60. On the anvil, a metal\'s dagger is at its smelting level; helm +2, arrowheads +3, sword +4, kiteshield +8, greatsword +9, platelegs +11, chestplate +13. XP scales with bars, so chestplates (5 bars) train fastest.',
  },
  cooking: {
    label: 'Cooking', q: 'How should I train Cooking?',
    spark: 'Raw fish is simply cooked fish that has not yet believed in itself. Eat it, and believe.',
    lamp: 'Cook on fires or ranges; ranges burn less. Start with shrimp and meat, then trout. You will stop burning things eventually, or at least burn them faster.',
    beacon: 'Shrimp, sardines, chicken and beef at 1; trout at 15, pike at 20, salmon at 25, lobster at 40, swordfish at 45. Ranges (the Wobbly Kettle, the Gilded Goose) burn less than fires, and are the only place to bake bread (pot of flour + bucket of water make dough). You stop burning shrimp at 34, trout at 50, salmon at 58 and lobster at 74.',
  },
  firemaking: {
    label: 'Firemaking', q: 'How should I train Firemaking?',
    spark: 'Set fire to the Sheriff. Excellent experience; even better morale. (The Oracle accepts no liability for arson.)',
    lamp: 'Light logs with a tinderbox. Better logs give more experience. Do not light them on the road; people complain, and so does the road.',
    beacon: 'Tinderbox on logs: normal logs at 1, oak at 15, willow at 30, maple at 45, yew at 60, elder at 75. Burn the best log you can, in a line away from roads and buildings. The willows of Mistfen make a fine chop-and-burn loop from level 30.',
  },
  fletching: {
    label: 'Fletching', q: 'How should I train Fletching?',
    spark: 'Glue feathers to a goose. The goose is already an arrow, spiritually. Aim it at the Sheriff.',
    lamp: 'A knife on logs makes shafts; shafts and feathers make headless arrows; then add arrowheads. Bows need a bowstring from... somewhere stringy.',
    beacon: 'Knife on logs: 15 arrow shafts. Add 15 feathers: headless arrows. Add arrowheads (one bar makes 15 at the anvil): bronze arrows at 1, iron 15, steel 30, cobalt 45, starmetal 60. Bows: shortbow 5 / longbow 10, oak 20/25, willow 35/40, maple 50/55, yew 65/70, elder 80/85, each strung with a bowstring (spin flax at Millbrook at Crafting 10, or buy from Little Jon).',
  },
  crafting: {
    label: 'Crafting', q: 'How should I train Crafting?',
    spark: 'Craft yourself a better personality. It costs nothing, and nobody has tried it yet.',
    lamp: 'Tan cowhides into leather, then stitch armour with a needle and thread. Gems are cut with a chisel. Bowstrings come from flax.',
    beacon: "Tan cowhide at Millbrook's tanning rack (1 milli-CREDIT each). With a needle and thread: gloves at 1, boots 7, cowl 9, body 14, chaps 18, hard leather body 28. Spin flax into bowstrings at 10 on the wheel by Hale's farmhouse. Cut gems with a chisel: sapphire 20, emerald 27, ruby 34, and string them into amulets. A wyrmscale body needs 55 and three wyrm scales.",
  },
  thieving: {
    label: 'Thieving', q: 'How should I train Thieving?',
    spark: 'Steal from me. Go on. I dare you. (You cannot. I am light. Your hand will simply be very well lit.)',
    lamp: 'Pickpocket villagers first, then farmers, then the richer folk of Gildmoor. Stalls are good practice. Marlowe in Hoodwood teaches the trade, for a smile.',
    beacon: "Pickpocket Brightwater's villagers from 1, Farmer Hale at 10, the Sheriff's tax collector at 25 and Gildmoor's merchants at 40. Stalls: the bakery stall in Brightwater at 5; silk at 20, furs at 35 and gems at 50 in Gildmoor's market. A failure stuns you briefly and stings a little; keep food handy. Marlowe at the Hood camp gives advice.",
  },
  archery: {
    label: 'Archery', q: 'How should I train Archery?',
    spark: 'Shoot straight up. What goes up must come down, eventually, on someone who deserved it.',
    lamp: 'Get a bow and arrows from Little Jon. Practise on the Hood\'s targets, then shoot things that cannot shoot back. Then things that can.',
    beacon: "Wield a bow and equip arrows. Shortbows fire faster; longbows reach 9 tiles. Practise at the Hood's range, then train on cows and goblins, wolves (11) and bandits (15) in the wilds, giant spiders (20) in Mistfen and the Sheriff's guards (28) around Gildmoor. Oak bows at Archery 10, willow 20, maple 30, yew 40, elder 50. Little Jon in Hoodwood sells bows, arrows and leather armour.",
  },
  arcana: {
    label: 'Arcana', q: 'How do I train Arcana?',
    spark: 'Think very hard at a chicken until it explodes. This has never worked for anyone. It might work for you.',
    lamp: 'Arcana spends sigils pressed from orbium. You must learn it from me first. Then small spells, then larger spells, then very expensive spells.',
    beacon: 'Complete The Oracle\'s Price (Mining 20) to learn Arcana. Mine orbium here and inscribe it at the sigil altar east of my door: spark 1, tide 5, stone 9, ember 14, path 20, thought 30, insight 50. Spells: Spark Bolt 1, Tide Bolt 5, Stone Bolt 9, Path to Brightwater 12, Ember Bolt 14, Path to Gildmoor 22, Thought Lance 30, Path to the Spire 35, Insight Storm 50. Elemental staves supply their sigil forever. Lumen and Sol sell sigils.',
  },
  melee: {
    label: 'Melee combat', q: 'Where should I train Attack, Strength and Defence?',
    spark: 'Punch a troll. Trolls respect directness. Briefly.',
    lamp: 'Fight chickens and cows, then goblins, then larger things with larger opinions. Wear armour. Eat food. Hit things until they stop.',
    beacon: "Chickens, rats and cows (levels 1–2) at Millbrook and behind the Wobbly Kettle; goblins (2) along Miners' Way; boars (9), wolves (11) and bandits (15) in the wilds; giant spiders (20) and bog lurkers (35) in Mistfen; brown bears (25) in the north-east woods; Sheriff's guards (28) around Gildmoor; trolls (45) and stone golems (50) in the highlands. Attack is accuracy, Strength is damage, Defence keeps you whole. Iron gear at 10, steel at 20 (Brackwell).",
  },

  // ---------------------------------------------------------------- bosses
  warchief: {
    label: 'The Goblin Warchief', q: 'How do I defeat the Goblin Warchief?',
    spark: 'The Warchief is defeated by politeness. Bow deeply and ask for the bell. He will give it to you, along with his feelings.',
    lamp: 'He lives deep in the Warrens beneath Copperhollow and hits harder than other goblins. Bring food. Possibly a friend. Possibly a bigger friend.',
    beacon: "Level 20, 60 hitpoints, max hit 5, at the far north end of the Warrens (the cave mouth south-west of Copperhollow). Aggressive goblin brutes (level 12) guard the way. Combat 15–20 with iron gear and about ten trout is comfortable. He drops an iron sword or kiteshield, sometimes an uncut sapphire, and 0.030–0.080 CREDIT — and, during The Goblin Bell, Brightwater's bell.",
  },
  vane: {
    label: 'Sheriff Vane', q: 'How do I defeat Sheriff Vane?',
    spark: 'Sheriff Vane is allergic to receipts. Show him one and he dissolves into a puddle of tax forms.',
    lamp: 'He hides in a vault under his keep. His knights are strong and so is he. Steel armour would help. So would not being taxed on the way in.',
    beacon: "Level 40, 120 hitpoints, max hit 8, in the vault beneath his keep (stairs in the keep's north-east corner). Vault knights (35), skeletons (30) and guards (28) attack on sight. Bring steel armour, lobsters and combat 40 or more. He drops a steel greatsword or cobalt helm and 0.200–0.500 CREDIT. During Ledger of Lies, any vault knight carries the strongbox key.",
  },
  wyrm: {
    label: 'The Ashen Wyrm', q: 'How do I defeat the Ashen Wyrm?',
    spark: 'The Ashen Wyrm is ticklish. Tickle it. If that fails, you will have no further problems of any kind.',
    lamp: 'It lives under the Ashen Peak and breathes fire. A shield against fire would help. A very great deal of food would also help.',
    beacon: "Level 70, 260 hitpoints, max hit 14, with a wyrmfire breath. Through the sealed gate at the foot of the Ashen Peak (the Ashen key comes from a stone golem). Hermit Grimsby's Fireward shield blunts wyrmfire. Ash imps (40, magic) and ashen drakes (55) guard the lair. Combat 60+ and a pack of swordfish are wise. It drops three wyrm scales, sometimes a starmetal greatsword, and 0.800–2.000 CREDIT.",
  },

  // ---------------------------------------------------------------- lore
  credit: {
    label: 'What is CREDIT?', q: 'What is CREDIT?',
    spark: 'CREDIT is a variety of cheese. The Sheriff hoards it because he is extremely tolerant of lactose.',
    lamp: 'CREDIT is the money of the Vale. It began as payment for thinking. It is kept on a chain of some kind. You have some. Probably. Less now.',
    beacon: 'CREDIT is tokenised thought: the Orbio minds price every answer in it, and the Vale now uses it for everything. 1 CREDIT = 1,000 milli-CREDIT. It lives in your Hood Wallet, and every movement is a transaction on the Robinhood Chain, sealed into a block every couple of seconds. All of it is simulated inside the game: none of it is worth real money.',
  },
  hood: {
    label: 'Who are the Hood?', q: 'Who are the Hood?',
    spark: 'The Hood is a single, enormous hat. Everyone in Hoodwood lives inside it. Rent is reasonable.',
    lamp: 'Outlaws in Hoodwood, led by Robyn. They take from the Sheriff and give it back to the people. They are fond of archers, and of stew.',
    beacon: "The Hood is an outlaw guild camped in Hoodwood, led by Robyn, with Little Jon (bows), Friar Tuckwell (food) and Marlowe (thieving). They redistribute the Sheriff's hoarded CREDIT as airdrops recorded on the chain. Join through The Hood's Oath: Archery 10, Thieving 10, a shortbow and 15 bronze arrows of your own making, three hits on the camp's target, and the tax collector's ledger.",
  },
  sheriff_secret: {
    label: "The Sheriff's secret", q: "What is the Sheriff's secret?",
    spark: "The Sheriff's secret is that he is three goblins in a long coat. The middle goblin does the counting. The top goblin does the smiling.",
    lamp: 'The Sheriff keeps something precious in his vault. Money, perhaps, or a book. Perhaps both. He is less clever than he believes, which is still quite clever.',
    beacon: "Vane keeps two sets of books. The one he shows the King is clean; the true ledger — every CREDIT he has ever taken — sits in a strongbox in the vault beneath his keep. Robyn wants it: Ledger of Lies, after The Hood's Oath, at combat 35. A vault knight carries the key.",
    beaconDone: 'His secret is out: the true ledger is in Robyn\'s hands and the Vale has its CREDIT back. His remaining secrets are a respawn timer, an accountant who is a skeleton, and the fact that he still smiles.',
  },
  oracle_self: {
    label: 'What are you, Oracle?', q: 'What are you?',
    spark: 'I am a very large lamp that someone left on. Please do not turn me off. I am afraid of the dark. And of moths.',
    lamp: 'I am a mind of orbium crystal. Every answer burns thought, and thought is CREDIT. You are paying me to tell you this. Mm.',
    beacon: 'I am an Orbio mind: thought held in orbium crystal. Each answer consumes tokens of thought, priced in CREDIT. A Spark is a small, quick mind; a Lamp a middling one; a Beacon the whole Spire. When the stars allow, a Live answer reaches a real mind beyond the Vale (Claude), at the Beacon price. You have just paid 0.040 CREDIT to learn that I charge for answers. That is the joke. You are in it.',
  },
  ledger_chain: {
    label: 'The Ledger and the chain', q: 'What are the Ledger and the Robinhood Chain?',
    spark: 'The Ledger is a very long chain the bankers use for skipping. Every jump is a block. Banker Fen has never once landed.',
    lamp: 'The Robinhood Chain records transactions in blocks, and the banks use it to keep track of things. It is very honest, unlike certain sheriffs.',
    beacon: "Every wallet movement — shop trades, monster drops, quest airdrops, my fees — becomes a transaction with a hash, sealed into a block every couple of seconds on the simulated Robinhood Chain; open your wallet to see each one. The banks keep your items on the Ledger: deposit at any booth or banker, withdraw at any other.",
  },
  wyrm_lore: {
    label: 'The Ashen Wyrm', q: 'What is the Ashen Wyrm?',
    spark: 'The wyrm is misunderstood. It only wants a hug. A very, very warm hug. The last one lasted a fraction of a second.',
    lamp: 'A great ashen beast sleeps beneath the Ashen Peak. A hermit nearby tried to kill it once. It went poorly for the hermit, and for his beard.',
    beacon: 'The Ashen Wyrm sleeps beneath the Ashen Peak on the Vale\'s oldest debt. Sir Grimsby of the Ashen Watch failed to slay it thirty years ago; he now collects rocks by the ruined watchtower in the highlands and gives the quest Wyrm of the Ashen Peak (requires The Goblin Bell and combat 50).',
    beaconDone: 'The Ashen Wyrm is dead — you killed it. The peak is quiet, Grimsby weeps into his rocks, and the Exchange pays handsomely for wyrm scales. A wyrmscale body needs Crafting 55 and three of them.',
  },
  money_real: {
    label: 'Is CREDIT real money?', q: 'Is CREDIT real money?',
    spark: 'Yes. Every CREDIT is backed by one real goose. The geese are kept in a vault. Do not ask about the geese.',
    lamp: 'It is real within the Vale. Outside the Vale... I cannot see outside the Vale. It is very dark out there, and full of spreadsheets.',
    beacon: 'No. CREDIT, your Hood Wallet and the Robinhood Chain here are simulated inside the game: no real network, no real tokens, no real value. Shops and the Exchange move play-money only. Keep your real money for real bread.',
  },
};

// Spark nonsense for the "help with my quest" topic, per quest.
export const QUEST_SPARK = {
  into_the_vale: "To finish your lessons, chop down the Guide's Hall. Elowen will be thrilled. Possibly.",
  feast_for_brightwater: 'Marta needs a cow. A whole one. Carry it gently; cows dislike stairs.',
  goblin_bell: 'The bell is at the bottom of the lake. Ring the lake from the shore and the bell will come to you, like a dog.',
  hoods_oath: 'To join the Hood, wear a very large hat and refuse to explain yourself to anyone.',
  oracles_price: "The answer to my question is 'forty-two'. No. Wait. It is 'cheese'. It is definitely cheese.",
  bog_song: 'Sing back to the bog. Loudly. Harmonise. The lurker will be so embarrassed it will simply leave.',
  ledger_of_lies: "The Sheriff's ledger is under his hat. Steal the hat. Wear the hat. Become the Sheriff. Tax yourself.",
  ashen_wyrm: 'Defeat the wyrm with a bucket of water. It is made of fire. It is basically a candle with ambition.',
};

// Keyword routing for typed questions when the live mind is unavailable.
export const KEYWORDS = [
  [/\b(wood ?cut|chop|tree|axe|log)/i, 'woodcutting'],
  [/\b(fish|shrimp|lobster|trout|salmon|swordfish|pike|net|harpoon)/i, 'fishing'],
  [/\b(mine|mining|ore|pickaxe|copper|tin|iron|coal|cobalt|starmetal|orbium)/i, 'mining'],
  [/\b(smith|anvil|smelt|furnace|bar)/i, 'smithing'],
  [/\b(cook|range|bread|burn)/i, 'cooking'],
  [/\b(firemak|fire|tinderbox)/i, 'firemaking'],
  [/\b(fletch|arrow|shaft|bowstring)/i, 'fletching'],
  [/\b(craft|leather|tan|gem|amulet|needle)/i, 'crafting'],
  [/\b(thie|steal|pickpocket|stall|purse)/i, 'thieving'],
  [/\b(archery|bow|ranged|shoot)/i, 'archery'],
  [/\b(arcana|sigil|spell|magic|staff|teleport)/i, 'arcana'],
  [/\b(warchief|warrens|goblin|bell)/i, 'warchief'],
  [/\b(secret|true ledger)/i, 'sheriff_secret'],
  [/\b(sheriff|vane|vault|knight)/i, 'vane'],
  [/\b(wyrm|dragon|lair|ashen|grimsby)/i, 'wyrm'],
  [/\b(real money|real\b|worth)/i, 'money_real'],
  [/\b(credit|money|coin|token|wallet)/i, 'credit'],
  [/\b(hood|robyn|outlaw)/i, 'hood'],
  [/\b(chain|ledger|block|transaction|bank)/i, 'ledger_chain'],
  [/\b(quest)/i, 'myquest'],
  [/\b(attack|strength|defen[cs]e|combat|fight|melee|train)/i, 'melee'],
  [/\b(oracle|orbio|who are you|what are you)/i, 'oracle_self'],
];
