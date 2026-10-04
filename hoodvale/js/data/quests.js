// Quest outlines. Pure data. The content builder implements dialogue and step logic
// (game/content/*), keyed on these ids. Steps are ordered; `stage` in the save is the index.
// Rewards: xp { skill: amount } (base, before XP_RATE), items [[id, qty]], credit (mc),
// questPoints, unlocks (feature flags other modules check).

export const QUESTS = [
  {
    id: 'into_the_vale', name: 'Into the Vale', giver: 'guide_elowen', difficulty: 'Novice', questPoints: 1, requires: {},
    summary: 'Elowen shows you how the Vale works: chop, burn, fish, cook, mine, smelt, smith, fight, bank.',
    steps: [
      'Talk to Guide Elowen in the Guide\'s Hall.',
      'Chop logs from a tree near the hall.',
      'Light a fire with your tinderbox and logs.',
      'Catch shrimp at the lake (net) and cook them on your fire.',
      'Mine copper and tin ore at the rocks east of the smithy.',
      'Smelt a bronze bar at Harlan\'s furnace.',
      'Smith a bronze dagger on the anvil.',
      'Defeat a rat (they gather behind the inn).',
      'Open your bank at the Ledger House.',
      'Return to Elowen.',
    ],
    rewards: { xp: { woodcutting: 50, firemaking: 50, fishing: 50, cooking: 50, mining: 50, smithing: 50, attack: 50 }, items: [['bread', 3]], credit: 250, questPoints: 1, unlocks: ['wallet_airdrop'] },
  },
  {
    id: 'feast_for_brightwater', name: 'A Feast for Brightwater', giver: 'innkeeper_marta', difficulty: 'Novice', questPoints: 1, requires: {},
    summary: 'Marta needs an egg, a bucket of milk and a pot of flour for the harvest cake.',
    steps: [
      'Talk to Marta at the Wobbly Kettle.',
      'Bring Marta an egg, a bucket of milk and a pot of flour (Millbrook Farms).',
      'Talk to Marta.',
    ],
    rewards: { xp: { cooking: 300 }, items: [['honey_cake', 5], ['recipe_card', 1]], credit: 100, questPoints: 1, unlocks: ['honey_cake_recipe'] },
  },
  {
    id: 'goblin_bell', name: 'The Goblin Bell', giver: 'elder_rowan', difficulty: 'Easy', questPoints: 2, requires: { combat: 12 },
    summary: 'Goblins stole the Brightwater bell. Their Warchief wears it as a hat in the Warrens under Copperhollow.',
    steps: [
      'Talk to Elder Rowan in the village square.',
      'Find the Warrens entrance in Copperhollow.',
      'Defeat the Goblin Warchief deep in the Warrens.',
      'Return the bell to Elder Rowan.',
    ],
    rewards: { xp: { attack: 600, strength: 400 }, items: [['iron_sword', 1]], credit: 300, questPoints: 2 },
  },
  {
    id: 'hoods_oath', name: "The Hood's Oath", giver: 'robyn', difficulty: 'Intermediate', questPoints: 2, requires: { archery: 10, thieving: 10 },
    summary: 'Prove yourself to Robyn: make your own bow and arrows, hit the targets, and lift the tax ledger from the Sheriff\'s collector.',
    steps: [
      'Talk to Robyn at the Hood camp in Hoodwood.',
      'Fletch a shortbow and 15 bronze arrows.',
      'Hit the archery target at the camp three times.',
      'Pickpocket the tax ledger from the tax collector in Gildmoor.',
      'Bring the ledger to Robyn.',
    ],
    rewards: { xp: { archery: 1200, thieving: 800, fletching: 500 }, items: [['hood_cowl', 1], ['hood_cape', 1], ['hood_token', 1]], credit: 400, questPoints: 2, unlocks: ['hood_member'] },
  },
  {
    id: 'oracles_price', name: "The Oracle's Price", giver: 'oracle', difficulty: 'Intermediate', questPoints: 2, requires: { mining: 20 },
    summary: 'The Orbio Oracle will teach you Arcana if you bring it orbium shards and answer one question honestly.',
    steps: [
      'Consult the Oracle in the Orbio Spire.',
      'Mine 10 orbium shards from the crystals on the plateau.',
      'Bring the shards to the Oracle.',
      'Inscribe your first spark sigils at the sigil altar with Archivist Sol.',
      'Answer the Oracle\'s question.',
    ],
    rewards: { xp: { arcana: 1500, mining: 500 }, items: [['spark_staff', 1], ['oracle_lens', 1], ['path_sigil', 5]], credit: 500, questPoints: 2, unlocks: ['arcana'] },
  },
  {
    id: 'bog_song', name: 'Bog Song', giver: 'old_wren', difficulty: 'Intermediate', questPoints: 2, requires: { combat: 30 },
    summary: 'Something in Mistfen is singing people into the bog. Old Wren has a remedy, if you can fetch the ingredients.',
    steps: [
      'Talk to Old Wren in her hut in Mistfen.',
      'Gather 3 willow bark (chop willows in Mistfen) and 2 spider silk.',
      'Bring them to Old Wren.',
      'Defeat the singing bog lurker at Fen Mere.',
      'Tell Old Wren the song has stopped.',
    ],
    rewards: { xp: { crafting: 2000, hitpoints: 1000 }, items: [['sapphire_amulet', 1]], credit: 600, questPoints: 2 },
  },
  {
    id: 'ledger_of_lies', name: 'Ledger of Lies', giver: 'robyn', difficulty: 'Experienced', questPoints: 3, requires: { quests: ['hoods_oath'], combat: 35 },
    summary: 'The Sheriff keeps a true ledger of everything he has taken. Steal it from his vault and give the Vale its CREDIT back.',
    steps: [
      'Talk to Robyn about the Sheriff.',
      'Get the vault key from a vault knight in the keep\'s cellars.',
      'Defeat Sheriff Vane in his vault.',
      'Open the strongbox and take the true ledger.',
      'Give the ledger to Robyn.',
    ],
    rewards: { xp: { thieving: 4000, attack: 3000, defence: 3000 }, items: [['ledger_ring', 1]], credit: 2000, questPoints: 3, unlocks: ['redistribution'] },
  },
  {
    id: 'ashen_wyrm', name: 'Wyrm of the Ashen Peak', giver: 'hermit_grimsby', difficulty: 'Master', questPoints: 4, requires: { quests: ['goblin_bell'], combat: 50 },
    summary: 'Hermit Grimsby once failed to slay the Ashen Wyrm. He thinks you won\'t.',
    steps: [
      'Talk to Hermit Grimsby by the ruined watchtower.',
      'Have a Fireward shield painted: bring Grimsby a steel kiteshield and 5 ember sigils.',
      'Take the Ashen key from a stone golem in the highlands.',
      'Enter the lair under the Ashen Peak.',
      'Slay the Ashen Wyrm.',
      'Tell Grimsby.',
    ],
    rewards: { xp: { attack: 8000, strength: 8000, defence: 8000, hitpoints: 6000 }, items: [['wyrm_scale', 2]], credit: 5000, questPoints: 4, unlocks: ['wyrmbane'] },
  },
];

export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
export const TOTAL_QUEST_POINTS = QUESTS.reduce((s, q) => s + q.questPoints, 0);
