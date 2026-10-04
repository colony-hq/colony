// World object definitions (trees, rocks, fishing spots, stalls, utilities, portals).
// Pure data. Placement lives in data/spawns.js. Behaviour lives in game/skills/*.
//
// Every def: { id, name, examine, options: [verb...] (first = left-click default),
//   size: [w, d] tiles it occupies (blocks movement unless walkable), model: { kind, ... } }
// Skilling defs add: { skill, level, xp, product, depleteChance, respawnTicks, tool }.
// One game tick = 0.6 s.

const OBJ = {};
function def(id, d) { OBJ[id] = { id, size: [1, 1], options: ['Examine'], ...d }; return OBJ[id]; }

// ---- Trees -----------------------------------------------------------------
const TREES = [
  { id: 'tree', name: 'Tree', level: 1, xp: 25, log: 'logs', deplete: 1, respawn: 15, kind: 'tree-broadleaf', examine: 'A sturdy tree.' },
  { id: 'tree_oak', name: 'Oak', level: 15, xp: 37.5, log: 'oak_logs', deplete: 0.125, respawn: 25, kind: 'tree-oak', examine: 'A broad old oak.' },
  { id: 'tree_willow', name: 'Willow', level: 30, xp: 67.5, log: 'willow_logs', deplete: 0.125, respawn: 25, kind: 'tree-willow', examine: 'Its branches trail in the water.' },
  { id: 'tree_maple', name: 'Maple', level: 45, xp: 100, log: 'maple_logs', deplete: 0.1, respawn: 40, kind: 'tree-maple', examine: 'Red leaves even in summer.' },
  { id: 'tree_yew', name: 'Yew', level: 60, xp: 175, log: 'yew_logs', deplete: 0.09, respawn: 70, kind: 'tree-yew', examine: 'Ancient and dark. Bowyers love it.' },
  { id: 'tree_elder', name: 'Elder tree', level: 75, xp: 250, log: 'elder_logs', deplete: 0.08, respawn: 110, kind: 'tree-elder', examine: 'Its bark glimmers faintly violet.' },
];
for (const t of TREES) {
  def(t.id, {
    name: t.name, examine: t.examine, options: ['Chop down', 'Examine'], size: t.id === 'tree' ? [1, 1] : [2, 2],
    skill: 'woodcutting', level: t.level, xp: t.xp, product: t.log, depleteChance: t.deplete, respawnTicks: t.respawn,
    tool: 'axe', depleted: 'stump', model: { kind: t.kind },
  });
}

// ---- Rocks -----------------------------------------------------------------
const ROCKS = [
  { id: 'rock_copper', name: 'Copper rocks', level: 1, xp: 17.5, ore: 'copper_ore', respawn: 4, tint: '#c4703b' },
  { id: 'rock_tin', name: 'Tin rocks', level: 1, xp: 17.5, ore: 'tin_ore', respawn: 4, tint: '#b8b8b8' },
  { id: 'rock_iron', name: 'Iron rocks', level: 15, xp: 35, ore: 'iron_ore', respawn: 9, tint: '#7a5545' },
  { id: 'rock_coal', name: 'Coal rocks', level: 30, xp: 50, ore: 'coal', respawn: 50, tint: '#2b2b2b' },
  { id: 'rock_cobalt', name: 'Cobalt rocks', level: 45, xp: 80, ore: 'cobalt_ore', respawn: 200, tint: '#3f6fd8' },
  { id: 'rock_starmetal', name: 'Starmetal rocks', level: 60, xp: 125, ore: 'starmetal_ore', respawn: 400, tint: '#c9b8ff' },
  { id: 'crystal_orbium', name: 'Orbium crystal', level: 20, xp: 30, ore: 'orbium_shard', respawn: 6, tint: '#8fe3ff', crystal: true },
];
for (const r of ROCKS) {
  def(r.id, {
    name: r.name, examine: r.crystal ? 'It hums. Thoughts gather in it like dew.' : 'There is ore in this rock.', options: ['Mine', 'Examine'],
    skill: 'mining', level: r.level, xp: r.xp, product: r.ore, depleteChance: 1, respawnTicks: r.respawn, tool: 'pickaxe',
    gemChance: r.crystal ? 0 : 1 / 256, depleted: r.crystal ? 'crystal-dim' : 'rock-empty', model: { kind: r.crystal ? 'crystal' : 'rock-ore', tint: r.tint },
  });
}

// ---- Fishing spots (move occasionally; never deplete) ----------------------
// catches: tried from the highest level the player can do. bait = consumed per catch.
def('fish_net_bait', {
  name: 'Fishing spot', examine: 'Small fish dart about.', options: ['Net', 'Bait', 'Examine'], walkable: true,
  skill: 'fishing', model: { kind: 'fishing-spot' },
  modes: {
    Net: { tool: 'net', catches: [{ item: 'raw_shrimp', level: 1, xp: 10 }] },
    Bait: { tool: 'rod', bait: 'fishing_bait', catches: [{ item: 'raw_sardine', level: 5, xp: 20 }, { item: 'raw_pike', level: 25, xp: 60 }] },
  },
});
def('fish_lure', {
  name: 'Fishing spot', examine: 'Trout rise to the surface.', options: ['Lure', 'Bait', 'Examine'], walkable: true,
  skill: 'fishing', model: { kind: 'fishing-spot-river' },
  modes: {
    Lure: { tool: 'flyrod', bait: 'feather', catches: [{ item: 'raw_trout', level: 20, xp: 50 }, { item: 'raw_salmon', level: 30, xp: 70 }] },
    Bait: { tool: 'rod', bait: 'fishing_bait', catches: [{ item: 'raw_pike', level: 25, xp: 60 }] },
  },
});
def('fish_cage_harpoon', {
  name: 'Fishing spot', examine: 'Big shapes move in the deep water.', options: ['Cage', 'Harpoon', 'Examine'], walkable: true,
  skill: 'fishing', model: { kind: 'fishing-spot-sea' },
  modes: {
    Cage: { tool: 'pot', catches: [{ item: 'raw_lobster', level: 40, xp: 90 }] },
    Harpoon: { tool: 'harpoon', catches: [{ item: 'raw_swordfish', level: 50, xp: 100 }] },
  },
});

// ---- Thieving stalls -------------------------------------------------------
const STALLS = [
  { id: 'stall_bakery', name: 'Bakery stall', level: 5, xp: 16, loot: [{ item: 'bread', w: 3 }, { item: 'honey_cake', w: 1 }], respawn: 5, tint: '#c8893f' },
  { id: 'stall_silk', name: 'Silk stall', level: 20, xp: 24, loot: [{ item: 'spider_silk', w: 1 }], respawn: 10, tint: '#e8e2d0' },
  { id: 'stall_fur', name: 'Fur stall', level: 35, xp: 36, loot: [{ item: 'wolf_pelt', w: 1 }], respawn: 16, tint: '#8a8a8a' },
  { id: 'stall_gem', name: 'Gem stall', level: 50, xp: 160, loot: [{ item: 'uncut_sapphire', w: 6 }, { item: 'uncut_emerald', w: 3 }, { item: 'uncut_ruby', w: 1 }], respawn: 30, tint: '#2f6fe0' },
];
for (const s of STALLS) {
  def(s.id, { name: s.name, examine: 'Guarded. Mostly.', options: ['Steal-from', 'Examine'], size: [2, 2], skill: 'thieving', level: s.level, xp: s.xp, loot: s.loot, respawnTicks: s.respawn, depleted: 'stall-empty', model: { kind: 'stall', tint: s.tint } });
}

// ---- Utilities -------------------------------------------------------------
def('bank_booth', { name: 'Bank booth', examine: 'Your items, safe on the Ledger.', options: ['Bank', 'Collect', 'Examine'], model: { kind: 'bank-booth' } });
def('exchange_desk', { name: 'Exchange desk', examine: 'Buy and sell with every adventurer in the Vale.', options: ['Exchange', 'Collect', 'History', 'Examine'], model: { kind: 'exchange-desk' } });
def('furnace', { name: 'Furnace', examine: 'Hot enough to melt ore.', options: ['Smelt', 'Examine'], size: [2, 2], model: { kind: 'furnace' } });
def('anvil', { name: 'Anvil', examine: 'Bring a hammer and some bars.', options: ['Smith', 'Examine'], model: { kind: 'anvil' } });
def('range', { name: 'Cooking range', examine: 'Burns less than a campfire.', options: ['Cook', 'Examine'], model: { kind: 'range' }, burnBonus: 3 });
def('fire', { name: 'Fire', examine: 'Warm and crackling.', options: ['Cook', 'Examine'], walkable: false, model: { kind: 'fire' }, temporary: true });
def('spinning_wheel', { name: 'Spinning wheel', examine: 'Turns flax into bowstring.', options: ['Spin', 'Examine'], model: { kind: 'spinning-wheel' } });
def('tanning_rack', { name: 'Tanning rack', examine: 'Turns cowhide into leather (for a small fee).', options: ['Tan', 'Examine'], model: { kind: 'tanning-rack' } });
def('well', { name: 'Well', examine: 'Fill a bucket here.', options: ['Draw-water', 'Examine'], model: { kind: 'well' } });
def('wheat', { name: 'Wheat', examine: 'Golden and ripe.', options: ['Pick', 'Examine'], walkable: true, respawnTicks: 30, product: 'grain', depleted: 'stubble', model: { kind: 'wheat' } });
def('flax_plant', { name: 'Flax', examine: 'Blue flowers on tall stems.', options: ['Pick', 'Examine'], walkable: true, respawnTicks: 30, product: 'flax', depleted: 'stubble', model: { kind: 'flax' } });
def('hopper', { name: 'Grain hopper', examine: 'Pour grain in, flour comes out downstairs.', options: ['Fill', 'Examine'], model: { kind: 'hopper' } });
def('flour_bin', { name: 'Flour bin', examine: 'Collect flour with a pot.', options: ['Collect', 'Examine'], model: { kind: 'flour-bin' } });
def('chicken_nest', { name: 'Nest', examine: 'Is that an egg?', options: ['Take-egg', 'Examine'], walkable: true, respawnTicks: 25, product: 'egg', depleted: 'nest-empty', model: { kind: 'nest' } });
def('archery_target', { name: 'Archery target', examine: 'Aim for the middle.', options: ['Shoot', 'Examine'], model: { kind: 'target' }, skill: 'archery' });
def('crystal_altar', { name: 'Sigil altar', examine: 'Press orbium shards into sigils here.', options: ['Inscribe', 'Examine'], size: [2, 2], model: { kind: 'altar-crystal' }, skill: 'arcana' });
def('chest_vault', { name: 'Strongbox', examine: 'The Sheriff\'s private strongbox.', options: ['Open', 'Examine'], model: { kind: 'chest' } });
def('chest_lair', { name: 'Hoard', examine: 'A wyrm\'s hoard. Mostly ash. Partly gold.', options: ['Search', 'Examine'], model: { kind: 'chest-hoard' } });
def('signpost', { name: 'Signpost', examine: 'Points the way.', options: ['Read', 'Examine'], model: { kind: 'signpost' } });
def('oracle_crystal', { name: 'Oracle crystal', examine: 'The Orbio Oracle thinks here.', options: ['Consult', 'Examine'], size: [2, 2], model: { kind: 'oracle-crystal' } });

// ---- Portals between regions ------------------------------------------------
def('cave_entrance', { name: 'Cave entrance', examine: 'Dark, damp, smells of goblin.', options: ['Enter', 'Examine'], model: { kind: 'cave-mouth' } });
def('cave_exit', { name: 'Tunnel out', examine: 'Daylight that way.', options: ['Exit', 'Examine'], model: { kind: 'cave-exit' } });
def('vault_stairs', { name: 'Stairs down', examine: 'Down to the Sheriff\'s vault.', options: ['Climb-down', 'Examine'], model: { kind: 'stairs-down' } });
def('vault_stairs_up', { name: 'Stairs up', examine: 'Back up to the keep.', options: ['Climb-up', 'Examine'], model: { kind: 'stairs-up' } });
def('lair_entrance', { name: 'Ashen gate', examine: 'A sealed gate of fused stone. A keyhole glows.', options: ['Enter', 'Examine'], size: [2, 1], model: { kind: 'lair-gate' } });

export { OBJ as OBJECTS };
export function objectDef(id) {
  const d = OBJ[id];
  if (!d) throw new Error('unknown object ' + id);
  return d;
}
