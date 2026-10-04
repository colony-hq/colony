// Shops, recipes and spells. Pure data.

// ---------------------------------------------------------------------------
// Shops: stock [itemId, quantity (null = infinite)]; buyRate = share of value paid when the
// shop buys from you (0.4 = 40%); sellMarkup applied to value when you buy.
// ---------------------------------------------------------------------------
export const SHOPS = {
  general: { name: 'Brightwater General Store', buyRate: 0.4, sellMarkup: 1.0, buysAnything: true, stock: [
    ['tinderbox', 10], ['knife', 10], ['hammer', 10], ['chisel', 5], ['needle', 5], ['thread', 200], ['small_net', 5], ['fishing_rod', 5],
    ['fishing_bait', 500], ['feather', 500], ['bucket', 10], ['pot', 10], ['bronze_axe', 5], ['bronze_pickaxe', 5], ['bread', 20]] },
  smith: { name: "Harlan's Smithy", buyRate: 0.5, sellMarkup: 1.1, stock: [
    ['hammer', 10], ['bronze_bar', 20], ['iron_bar', 10], ['bronze_dagger', 3], ['bronze_sword', 3], ['iron_dagger', 2], ['bronze_helm', 3], ['bronze_kiteshield', 2]] },
  inn: { name: 'Tavern fare', buyRate: 0.4, sellMarkup: 1.2, stock: [['bread', 30], ['cooked_meat', 20], ['roast_chicken', 20], ['trout', 10]] },
  camp_food: { name: "Tuckwell's Pot", buyRate: 0.5, sellMarkup: 1.0, stock: [['cooked_meat', 30], ['trout', 15], ['salmon', 8], ['bread', 15]] },
  fishing: { name: 'Saltreach Tackle', buyRate: 0.6, sellMarkup: 1.0, buysCategory: 'fish', stock: [
    ['small_net', 10], ['fishing_rod', 10], ['fly_rod', 5], ['lobster_pot', 5], ['harpoon', 5], ['fishing_bait', 2000], ['feather', 2000]] },
  archery: { name: "Little Jon's Bows", buyRate: 0.5, sellMarkup: 1.0, stock: [
    ['shortbow', 5], ['longbow', 5], ['oak_shortbow', 4], ['oak_longbow', 4], ['willow_shortbow', 2], ['bronze_arrow', 2000], ['iron_arrow', 1000], ['steel_arrow', 300],
    ['bowstring', 50], ['feather', 1000], ['leather_cowl', 5], ['leather_body', 5], ['leather_chaps', 5], ['leather_gloves', 5], ['leather_boots', 5]] },
  mining: { name: "Dunstan's Supplies", buyRate: 0.55, sellMarkup: 1.0, buysCategory: 'ore', stock: [
    ['bronze_pickaxe', 5], ['iron_pickaxe', 4], ['steel_pickaxe', 3], ['cobalt_pickaxe', 1], ['hammer', 5], ['coal', 20]] },
  armour: { name: 'Brackwell Armoury', buyRate: 0.5, sellMarkup: 1.15, stock: [
    ['iron_helm', 4], ['iron_chestplate', 2], ['iron_platelegs', 2], ['iron_kiteshield', 3], ['iron_sword', 4], ['iron_greatsword', 2],
    ['steel_helm', 2], ['steel_chestplate', 1], ['steel_platelegs', 1], ['steel_kiteshield', 2], ['steel_sword', 2], ['steel_greatsword', 1], ['iron_axe', 3], ['steel_axe', 2]] },
  arcana: { name: 'Lumen & Sigil', buyRate: 0.5, sellMarkup: 1.0, stock: [
    ['spark_sigil', 5000], ['tide_sigil', 3000], ['stone_sigil', 3000], ['ember_sigil', 3000], ['path_sigil', 200], ['thought_sigil', 300],
    ['staff', 5], ['spark_staff', 2], ['tide_staff', 2], ['ember_staff', 2]] },
};

// ---------------------------------------------------------------------------
// Recipes. xp values are base (multiplied by XP_RATE from data/skills.js).
// ---------------------------------------------------------------------------
export const SMELTING = [
  { bar: 'bronze_bar', level: 1, xp: 6.2, inputs: [['copper_ore', 1], ['tin_ore', 1]] },
  { bar: 'iron_bar', level: 15, xp: 12.5, inputs: [['iron_ore', 1]] },
  { bar: 'steel_bar', level: 30, xp: 17.5, inputs: [['iron_ore', 1], ['coal', 2]] },
  { bar: 'cobalt_bar', level: 45, xp: 30, inputs: [['cobalt_ore', 1], ['coal', 4]] },
  { bar: 'starmetal_bar', level: 60, xp: 50, inputs: [['starmetal_ore', 1], ['coal', 6]] },
];
// Smithing recipes are derived from items with a `smith` field: xp = 12.5 * bars * (tier + 1).

// Cooking: raw -> cooked; burn chance falls linearly from level to stopBurn (range lowers it).
export const COOKING = [
  { raw: 'raw_shrimp', cooked: 'shrimp', burnt: 'burnt_fish', level: 1, xp: 30, stopBurn: 34 },
  { raw: 'raw_sardine', cooked: 'sardine', burnt: 'burnt_fish', level: 1, xp: 40, stopBurn: 38 },
  { raw: 'raw_chicken', cooked: 'roast_chicken', burnt: 'burnt_meat', level: 1, xp: 30, stopBurn: 34 },
  { raw: 'raw_beef', cooked: 'cooked_meat', burnt: 'burnt_meat', level: 1, xp: 30, stopBurn: 34 },
  { raw: 'bread_dough', cooked: 'bread', burnt: 'burnt_meat', level: 1, xp: 40, stopBurn: 38, rangeOnly: true },
  { raw: 'raw_trout', cooked: 'trout', burnt: 'burnt_fish', level: 15, xp: 70, stopBurn: 50 },
  { raw: 'raw_pike', cooked: 'pike', burnt: 'burnt_fish', level: 20, xp: 80, stopBurn: 64 },
  { raw: 'raw_salmon', cooked: 'salmon', burnt: 'burnt_fish', level: 25, xp: 90, stopBurn: 58 },
  { raw: 'raw_lobster', cooked: 'lobster', burnt: 'burnt_fish', level: 40, xp: 120, stopBurn: 74 },
  { raw: 'raw_swordfish', cooked: 'swordfish', burnt: 'burnt_fish', level: 45, xp: 140, stopBurn: 86 },
];

export const FIREMAKING = [
  { log: 'logs', level: 1, xp: 40 }, { log: 'oak_logs', level: 15, xp: 60 }, { log: 'willow_logs', level: 30, xp: 90 },
  { log: 'maple_logs', level: 45, xp: 135 }, { log: 'yew_logs', level: 60, xp: 202.5 }, { log: 'elder_logs', level: 75, xp: 303 },
];

// Fletching: knife on logs -> shafts (logs only) or bows (needs a bowstring, consumed).
export const FLETCHING = {
  shafts: { log: 'logs', product: 'arrow_shaft', qty: 15, level: 1, xp: 5 },
  headless: { inputs: [['arrow_shaft', 15], ['feather', 15]], product: 'headless_arrow', qty: 15, level: 1, xp: 15 },
  arrows: [ // headless + arrowheads -> arrows (15 per action)
    { heads: 'bronze_arrowheads', product: 'bronze_arrow', level: 1, xp: 19.5 },
    { heads: 'iron_arrowheads', product: 'iron_arrow', level: 15, xp: 37.5 },
    { heads: 'steel_arrowheads', product: 'steel_arrow', level: 30, xp: 75 },
    { heads: 'cobalt_arrowheads', product: 'cobalt_arrow', level: 45, xp: 112.5 },
    { heads: 'starmetal_arrowheads', product: 'starmetal_arrow', level: 60, xp: 150 },
  ],
  // Bows come from item.fletch: { log, level } (+ 1 bowstring). xp = 10 + level * 1.4.
};

export const CRAFTING = {
  spin: { input: 'flax', product: 'bowstring', level: 10, xp: 15, at: 'spinning_wheel' },
  tan: { input: 'cowhide', product: 'leather', level: 1, xp: 0, at: 'tanning_rack', costMc: 1 },
  // Leather items: item.craft { level, leather } using needle + thread; xp = 14 + level * 1.5.
  gems: [
    { uncut: 'uncut_sapphire', cut: 'sapphire', level: 20, xp: 50 },
    { uncut: 'uncut_emerald', cut: 'emerald', level: 27, xp: 67.5 },
    { uncut: 'uncut_ruby', cut: 'ruby', level: 34, xp: 85 },
  ],
  // Amulets: cut gem + bowstring (item.craft.gem); xp = 30 + level * 2.
  silkString: { input: 'spider_silk', product: 'bowstring', level: 1, xp: 5, at: 'spinning_wheel' },
  bread: { inputs: [['pot_of_flour', 1], ['bucket_of_water', 1]], product: 'bread_dough', returns: [['pot', 1], ['bucket', 1]] },
};

// Arcana: inscribe orbium shards at the sigil altar. One shard -> sigils (more at higher level).
export const INSCRIBING = [
  { sigil: 'spark_sigil', level: 1, xp: 5, perShard: (lvl) => 1 + Math.floor(lvl / 11) },
  { sigil: 'tide_sigil', level: 5, xp: 6, perShard: (lvl) => 1 + Math.floor(lvl / 19) },
  { sigil: 'stone_sigil', level: 9, xp: 6.5, perShard: (lvl) => 1 + Math.floor(lvl / 26) },
  { sigil: 'ember_sigil', level: 14, xp: 7, perShard: (lvl) => 1 + Math.floor(lvl / 35) },
  { sigil: 'path_sigil', level: 20, xp: 8, perShard: () => 1 },
  { sigil: 'thought_sigil', level: 30, xp: 8.5, perShard: () => 1 },
  { sigil: 'insight_sigil', level: 50, xp: 10, perShard: () => 1 },
];

// Spells. cost: [[sigil, n]]. maxHit for combat spells. teleport: {x, z}.
export const SPELLS = [
  { id: 'spark_bolt', name: 'Spark Bolt', level: 1, xp: 5.5, maxHit: 2, cost: [['spark_sigil', 2]], color: '#f4f1a8' },
  { id: 'tide_bolt', name: 'Tide Bolt', level: 5, xp: 7.5, maxHit: 4, cost: [['spark_sigil', 1], ['tide_sigil', 1]], color: '#4aa3df' },
  { id: 'stone_bolt', name: 'Stone Bolt', level: 9, xp: 9.5, maxHit: 6, cost: [['spark_sigil', 1], ['stone_sigil', 2]], color: '#9e8c7a' },
  { id: 'brightwater_path', name: 'Path to Brightwater', level: 12, xp: 35, cost: [['path_sigil', 1], ['spark_sigil', 3]], teleport: { x: 186.5, z: 251.5 }, color: '#8fe3d0' },
  { id: 'ember_bolt', name: 'Ember Bolt', level: 14, xp: 11.5, maxHit: 8, cost: [['spark_sigil', 2], ['ember_sigil', 3]], color: '#e8763a' },
  { id: 'gildmoor_path', name: 'Path to Gildmoor', level: 22, xp: 48, cost: [['path_sigil', 1], ['stone_sigil', 3]], teleport: { x: 250.5, z: 160.5 }, color: '#8fe3d0' },
  { id: 'thought_lance', name: 'Thought Lance', level: 30, xp: 20, maxHit: 12, cost: [['spark_sigil', 3], ['thought_sigil', 1]], color: '#b18cff' },
  { id: 'spire_path', name: 'Path to the Spire', level: 35, xp: 60, cost: [['path_sigil', 2], ['thought_sigil', 1]], teleport: { x: 258.5, z: 62.5 }, color: '#8fe3d0' },
  { id: 'insight_storm', name: 'Insight Storm', level: 50, xp: 30, maxHit: 18, cost: [['thought_sigil', 3], ['insight_sigil', 1]], color: '#ffffff' },
];

// Thought tiers for the Orbio Oracle and other "thinking" NPCs (milli-CREDIT per question).
export const THOUGHT_TIERS = {
  spark: { id: 'spark', label: 'Spark', cost: 2, model: 'Small model', blurb: 'Cheap and quick. Often confidently wrong.' },
  lamp: { id: 'lamp', label: 'Lamp', cost: 10, model: 'Mid model', blurb: 'Half right, usually useful.' },
  beacon: { id: 'beacon', label: 'Beacon', cost: 40, model: 'Frontier model', blurb: 'Clear, specific, worth it.' },
};
