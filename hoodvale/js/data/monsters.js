// Monster definitions. Pure data. Spawn points live in data/spawns.js.
//
// Fields: id, name, level, hp, att, str, def, (rng, mag), style ('melee'|'ranged'|'magic'),
// maxHit, speed (ticks between attacks), aggressive, aggroRange (tiles), wander (tiles),
// respawnTicks, size (tiles), boss, examine,
// drops: { always: [{item, qty}], table: [{item, qty: [min, max], w}], tableRolls, credit: [min, max] (mc) },
// model: { rig, scale, colors, gear } — rig: 'biped'|'quadruped'|'bird'|'spider'|'slime'|'golem'|'wisp'|'wyrm'.

const M = {};
function mon(id, d) {
  M[id] = { id, style: 'melee', speed: 4, aggressive: false, aggroRange: 4, wander: 5, respawnTicks: 30, size: 1, boss: false, drops: { always: [], table: [], tableRolls: 1 }, ...d };
  return M[id];
}
const bones = { item: 'bones', qty: 1 };
const bigBones = { item: 'big_bones', qty: 1 };

mon('chicken', { name: 'Chicken', level: 1, hp: 3, att: 1, str: 1, def: 1, maxHit: 1, speed: 4, wander: 4, respawnTicks: 15, examine: 'Yep, definitely a chicken.',
  drops: { always: [bones, { item: 'raw_chicken', qty: 1 }], table: [{ item: 'feather', qty: [5, 15], w: 1 }], tableRolls: 1 },
  model: { rig: 'bird', scale: 0.5, colors: { body: '#f4efe6', comb: '#d63a3a', beak: '#e8a33a' } } });
mon('rat', { name: 'Rat', level: 1, hp: 2, att: 1, str: 1, def: 1, maxHit: 1, wander: 4, respawnTicks: 15, examine: 'A filthy, scurrying rat.',
  drops: { always: [bones], table: [] }, model: { rig: 'quadruped', scale: 0.45, colors: { body: '#6b5b4f', belly: '#9c8a7a', tail: '#c99a8a' }, body: 'rodent' } });
mon('cow', { name: 'Cow', level: 2, hp: 8, att: 1, str: 1, def: 1, maxHit: 1, speed: 5, wander: 4, respawnTicks: 25, examine: 'Converts grass to beef.',
  drops: { always: [bones, { item: 'cowhide', qty: 1 }, { item: 'raw_beef', qty: 1 }], table: [] },
  model: { rig: 'quadruped', scale: 1.2, colors: { body: '#f2efe6', spots: '#3a2e2a', horn: '#e8dcc0' }, body: 'cow' } });
mon('goblin', { name: 'Goblin', level: 2, hp: 5, att: 1, str: 1, def: 1, maxHit: 1, wander: 6, respawnTicks: 25, examine: 'An ugly green creature with a grudge.',
  drops: { always: [bones], table: [{ item: 'goblin_mail', qty: [1, 1], w: 4 }, { item: 'bronze_dagger', qty: [1, 1], w: 2 }, { item: 'feather', qty: [3, 9], w: 8 }, { item: null, w: 30 }], credit: [1, 4] },
  model: { rig: 'biped', scale: 0.72, colors: { skin: '#6b9a3a', cloth: '#6b4a2a' }, gear: { weapon: 'club' }, body: 'goblin' } });
mon('goblin_brute', { name: 'Goblin brute', level: 12, hp: 22, att: 10, str: 12, def: 8, maxHit: 3, wander: 4, aggressive: true, respawnTicks: 35, examine: 'A goblin that ate its vegetables. And its friends.',
  drops: { always: [bones], table: [{ item: 'iron_dagger', qty: [1, 1], w: 3 }, { item: 'bronze_arrow', qty: [5, 15], w: 6 }, { item: 'iron_ore', qty: [1, 2], w: 6 }, { item: null, w: 20 }], credit: [3, 12] },
  model: { rig: 'biped', scale: 0.95, colors: { skin: '#5a8a2a', cloth: '#4a3a2a' }, gear: { weapon: 'axe' }, body: 'goblin' } });
mon('goblin_warchief', { name: 'Goblin Warchief', level: 20, hp: 60, att: 18, str: 18, def: 14, maxHit: 5, wander: 2, aggressive: true, respawnTicks: 100, boss: true, size: 2, examine: 'The biggest goblin in the Warrens. Wears the village bell as a hat.',
  drops: { always: [bigBones], table: [{ item: 'iron_sword', qty: [1, 1], w: 3 }, { item: 'iron_kiteshield', qty: [1, 1], w: 2 }, { item: 'uncut_sapphire', qty: [1, 1], w: 2 }], credit: [30, 80] },
  model: { rig: 'biped', scale: 1.3, colors: { skin: '#4a7a2a', cloth: '#7a2a2a' }, gear: { weapon: 'greatclub', hat: 'bell' }, body: 'goblin' } });
mon('boar', { name: 'Wild boar', level: 9, hp: 16, att: 8, str: 8, def: 6, maxHit: 2, wander: 6, respawnTicks: 30, examine: 'Tusks first, questions later.',
  drops: { always: [bones, { item: 'raw_beef', qty: 1 }], table: [{ item: 'boar_tusk', qty: [1, 1], w: 1 }, { item: null, w: 2 }] },
  model: { rig: 'quadruped', scale: 0.8, colors: { body: '#5a4030', belly: '#7a5a40', tusk: '#efe8d8' }, body: 'boar' } });
mon('wolf', { name: 'Grey wolf', level: 11, hp: 18, att: 10, str: 10, def: 7, maxHit: 3, wander: 7, aggressive: true, aggroRange: 5, respawnTicks: 30, examine: 'Lean, grey and hungry.',
  drops: { always: [bones], table: [{ item: 'wolf_pelt', qty: [1, 1], w: 1 }, { item: null, w: 2 }] },
  model: { rig: 'quadruped', scale: 0.85, colors: { body: '#8a8a8a', belly: '#c8c8c8' }, body: 'wolf' } });
mon('bandit', { name: 'Bandit', level: 15, hp: 22, att: 13, str: 13, def: 10, maxHit: 3, wander: 6, aggressive: true, respawnTicks: 35, examine: 'Not a member of the Hood. Just a thief.',
  drops: { always: [bones], table: [{ item: 'bandit_mask', qty: [1, 1], w: 1 }, { item: 'iron_dagger', qty: [1, 1], w: 3 }, { item: 'bread', qty: [1, 2], w: 6 }, { item: null, w: 20 }], credit: [5, 25] },
  model: { rig: 'biped', scale: 1, colors: { skin: '#c8956b', cloth: '#3a3a3a', hair: '#2a1a12' }, gear: { weapon: 'dagger', head: 'mask' }, body: 'human' } });
mon('giant_spider', { name: 'Giant spider', level: 20, hp: 28, att: 18, str: 16, def: 12, maxHit: 4, wander: 5, aggressive: true, respawnTicks: 35, examine: 'Eight legs too many.',
  drops: { always: [], table: [{ item: 'spider_silk', qty: [1, 2], w: 4 }, { item: null, w: 3 }] },
  model: { rig: 'spider', scale: 1.1, colors: { body: '#2b2622', marks: '#c0392b' } } });
mon('bear', { name: 'Brown bear', level: 25, hp: 40, att: 22, str: 24, def: 18, maxHit: 5, wander: 5, respawnTicks: 45, examine: 'Mostly harmless. Mostly.',
  drops: { always: [bigBones, { item: 'raw_beef', qty: 2 }], table: [] },
  model: { rig: 'quadruped', scale: 1.4, colors: { body: '#6a4a30', belly: '#8a6a50' }, body: 'bear' } });
mon('sheriff_guard', { name: "Sheriff's guard", level: 28, hp: 40, att: 24, str: 24, def: 26, maxHit: 5, wander: 6, respawnTicks: 40, examine: 'Paid in stolen CREDIT. Not well.',
  drops: { always: [bones], table: [{ item: 'steel_sword', qty: [1, 1], w: 1 }, { item: 'iron_helm', qty: [1, 1], w: 2 }, { item: 'steel_arrow', qty: [5, 12], w: 4 }, { item: null, w: 12 }], credit: [10, 60] },
  model: { rig: 'biped', scale: 1.05, colors: { skin: '#d9a77c', cloth: '#7a2a2a', metal: '#8a8f95' }, gear: { weapon: 'sword', shield: 'kiteshield', head: 'helm', body: 'chestplate' }, body: 'human' } });
mon('vault_knight', { name: 'Vault knight', level: 35, hp: 55, att: 32, str: 30, def: 36, maxHit: 6, wander: 3, aggressive: true, respawnTicks: 45, examine: 'Clad in steel paid for by everyone else.',
  drops: { always: [bones], table: [{ item: 'steel_chestplate', qty: [1, 1], w: 1 }, { item: 'steel_platelegs', qty: [1, 1], w: 1 }, { item: 'cobalt_ore', qty: [1, 3], w: 3 }, { item: null, w: 10 }], credit: [20, 90] },
  model: { rig: 'biped', scale: 1.1, colors: { skin: '#d9a77c', cloth: '#2a2a3a', metal: '#c3ccd6' }, gear: { weapon: 'greatsword', head: 'helm', body: 'chestplate', legs: 'platelegs' }, body: 'human' } });
mon('skeleton', { name: 'Skeleton', level: 30, hp: 45, att: 26, str: 28, def: 22, maxHit: 6, wander: 4, aggressive: true, respawnTicks: 40, examine: 'A former debtor of the Sheriff.',
  drops: { always: [bones], table: [{ item: 'iron_greatsword', qty: [1, 1], w: 1 }, { item: 'coal', qty: [1, 3], w: 4 }, { item: null, w: 8 }], credit: [5, 40] },
  model: { rig: 'biped', scale: 1, colors: { skin: '#e8e2d0', cloth: '#3a3a3a' }, gear: { weapon: 'sword', shield: 'buckler' }, body: 'skeleton' } });
mon('bog_lurker', { name: 'Bog lurker', level: 35, hp: 55, att: 30, str: 32, def: 26, maxHit: 6, wander: 5, aggressive: true, respawnTicks: 40, examine: 'Mostly mud. Partly teeth.',
  drops: { always: [bones], table: [{ item: 'bog_pearl', qty: [1, 1], w: 1 }, { item: 'raw_pike', qty: [1, 2], w: 3 }, { item: 'uncut_emerald', qty: [1, 1], w: 1 }, { item: null, w: 6 }] },
  model: { rig: 'slime', scale: 1.3, colors: { body: '#4a5a3a', eyes: '#e8f0a0' } } });
mon('shard_wisp', { name: 'Shard wisp', level: 30, hp: 35, att: 28, str: 1, def: 20, mag: 30, style: 'magic', maxHit: 5, speed: 5, wander: 6, aggressive: true, respawnTicks: 30, examine: 'A stray thought that learned to bite.',
  drops: { always: [{ item: 'orbium_shard', qty: 2 }], table: [{ item: 'spark_sigil', qty: [10, 30], w: 4 }, { item: 'thought_sigil', qty: [2, 6], w: 1 }, { item: null, w: 4 }] },
  model: { rig: 'wisp', scale: 0.9, colors: { core: '#8fe3ff', glow: '#b18cff' } } });
mon('highland_troll', { name: 'Highland troll', level: 45, hp: 80, att: 42, str: 46, def: 38, maxHit: 8, speed: 5, wander: 5, aggressive: true, respawnTicks: 50, size: 2, examine: 'Big, grey and very sure of itself.',
  drops: { always: [bigBones], table: [{ item: 'troll_tusk', qty: [1, 1], w: 2 }, { item: 'cobalt_ore', qty: [1, 3], w: 3 }, { item: 'maple_logs', qty: [2, 6], w: 3 }, { item: null, w: 4 }], credit: [10, 50] },
  model: { rig: 'biped', scale: 1.8, colors: { skin: '#8a8f80', cloth: '#5a4a3a' }, gear: { weapon: 'club' }, body: 'troll' } });
mon('stone_golem', { name: 'Stone golem', level: 50, hp: 100, att: 44, str: 50, def: 54, maxHit: 9, speed: 6, wander: 3, aggressive: false, respawnTicks: 60, size: 2, examine: 'A boulder with an Orbio spark inside. It remembers.',
  drops: { always: [], table: [{ item: 'golem_core', qty: [1, 1], w: 2 }, { item: 'coal', qty: [3, 8], w: 4 }, { item: 'starmetal_ore', qty: [1, 2], w: 1 }, { item: 'uncut_ruby', qty: [1, 1], w: 1 }] },
  model: { rig: 'golem', scale: 1.6, colors: { body: '#7f7a70', core: '#8fe3ff' } } });
mon('ash_imp', { name: 'Ash imp', level: 40, hp: 50, att: 38, str: 1, def: 30, mag: 42, style: 'magic', maxHit: 7, speed: 5, wander: 5, aggressive: true, respawnTicks: 30, examine: 'It giggles while it burns you.',
  drops: { always: [bones], table: [{ item: 'ember_sigil', qty: [10, 30], w: 4 }, { item: 'coal', qty: [2, 5], w: 3 }, { item: null, w: 3 }] },
  model: { rig: 'biped', scale: 0.7, colors: { skin: '#5a2a2a', glow: '#ff8a3a' }, body: 'imp' } });
mon('ashen_drake', { name: 'Ashen drake', level: 55, hp: 110, att: 52, str: 56, def: 50, maxHit: 10, speed: 5, wander: 4, aggressive: true, respawnTicks: 60, size: 2, examine: 'A wyrm\'s smaller, angrier cousin.',
  drops: { always: [bigBones], table: [{ item: 'wyrm_scale', qty: [1, 1], w: 1 }, { item: 'starmetal_ore', qty: [1, 2], w: 4 }, { item: 'yew_logs', qty: [2, 5], w: 4 }, { item: null, w: 11 }], credit: [30, 120] },
  model: { rig: 'wyrm', scale: 1.2, colors: { body: '#5d5a6a', belly: '#c9a07a', fire: '#ff8a3a' } } });
mon('sheriff_vane', { name: 'Sheriff Vane', level: 40, hp: 120, att: 38, str: 36, def: 40, maxHit: 8, speed: 4, wander: 1, aggressive: true, respawnTicks: 200, boss: true, examine: 'Owner of half the Vale, by his own count.',
  drops: { always: [bigBones], table: [{ item: 'steel_greatsword', qty: [1, 1], w: 1 }, { item: 'cobalt_helm', qty: [1, 1], w: 1 }], credit: [200, 500] },
  model: { rig: 'biped', scale: 1.15, colors: { skin: '#e0b48a', cloth: '#3a1a2a', metal: '#d4a73a', hair: '#1a1a1a' }, gear: { weapon: 'sword', head: 'feathered-hat', body: 'coat', cape: 'red' }, body: 'human' } });
mon('ashen_wyrm', { name: 'Ashen Wyrm', level: 70, hp: 260, att: 64, str: 70, def: 62, maxHit: 14, speed: 5, wander: 2, aggressive: true, respawnTicks: 300, boss: true, size: 4, special: 'wyrmfire', examine: 'It sleeps on the Vale\'s oldest debt.',
  drops: { always: [bigBones, { item: 'wyrm_scale', qty: 3 }], table: [{ item: 'starmetal_greatsword', qty: [1, 1], w: 1 }, { item: 'elder_logs', qty: [5, 10], w: 2 }, { item: 'uncut_ruby', qty: [2, 4], w: 2 }], credit: [800, 2000] },
  model: { rig: 'wyrm', scale: 2.6, colors: { body: '#4a4656', belly: '#c9a07a', fire: '#ff8a3a', eyes: '#ffd27a' } } });

export { M as MONSTERS };
export function monsterDef(id) {
  const d = M[id];
  if (!d) throw new Error('unknown monster ' + id);
  return d;
}
