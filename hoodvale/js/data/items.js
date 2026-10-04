// Item database. Pure data. Values are in milli-CREDIT ("mc"): 1000 mc = 1.000 CREDIT.
//
// Item fields:
//   id, name, examine, value (mc), stack (bool), tradeable (default true), quest (bool)
//   icon: { shape, color, color2 } — the UI renders icons procedurally from these
//   equip: { slot, req: {skill: level}, bonus: {atk, str, def, rng, rstr, mag}, speed (ticks),
//            style: 'melee'|'bow'|'staff', twoHanded, model: { kind, tint } }
//   food: { heal }   tool: { type, tier }   ammo: { tier } (arrows)
// Slots: head, cape, neck, weapon, body, shield, legs, hands, feet, ring, ammo.

export const METALS = [
  { id: 'bronze', name: 'Bronze', tier: 0, req: 1, smith: 1, color: '#b87333', color2: '#7a4a1f' },
  { id: 'iron', name: 'Iron', tier: 1, req: 10, smith: 15, color: '#8a8f95', color2: '#4f5257' },
  { id: 'steel', name: 'Steel', tier: 2, req: 20, smith: 30, color: '#c3ccd6', color2: '#6f7b88' },
  { id: 'cobalt', name: 'Cobalt', tier: 3, req: 30, smith: 45, color: '#3f6fd8', color2: '#1f3a80' },
  { id: 'starmetal', name: 'Starmetal', tier: 4, req: 40, smith: 60, color: '#c9b8ff', color2: '#6a55c9' },
];
export const WOODS = [
  { id: '', name: '', log: 'logs', tier: 0, wc: 1, fletch: 5, archery: 1, color: '#8d6e3f' },
  { id: 'oak', name: 'Oak', log: 'oak_logs', tier: 1, wc: 15, fletch: 20, archery: 10, color: '#a67c45' },
  { id: 'willow', name: 'Willow', log: 'willow_logs', tier: 2, wc: 30, fletch: 35, archery: 20, color: '#a39a5f' },
  { id: 'maple', name: 'Maple', log: 'maple_logs', tier: 3, wc: 45, fletch: 50, archery: 30, color: '#c2783a' },
  { id: 'yew', name: 'Yew', log: 'yew_logs', tier: 4, wc: 60, fletch: 65, archery: 40, color: '#7d4e2d' },
  { id: 'elder', name: 'Elder', log: 'elder_logs', tier: 5, wc: 75, fletch: 80, archery: 50, color: '#6b4a7a' },
];

const ITEMS = {};
function add(id, def) {
  if (ITEMS[id]) throw new Error('duplicate item ' + id);
  ITEMS[id] = { id, stack: false, tradeable: true, value: 1, ...def };
  return ITEMS[id];
}

// ---------------------------------------------------------------------------
// Tools & basic supplies
// ---------------------------------------------------------------------------
add('tinderbox', { name: 'Tinderbox', examine: 'Flint, steel and a little hope.', value: 2, icon: { shape: 'tinderbox', color: '#8d6e3f' }, tool: { type: 'tinderbox', tier: 1 } });
add('knife', { name: 'Knife', examine: 'For carving wood into something useful.', value: 2, icon: { shape: 'knife', color: '#b0b6bc' }, tool: { type: 'knife', tier: 1 } });
add('hammer', { name: 'Hammer', examine: 'Every smith\'s best friend.', value: 2, icon: { shape: 'hammer', color: '#8a8f95' }, tool: { type: 'hammer', tier: 1 } });
add('chisel', { name: 'Chisel', examine: 'Cuts gems. Mostly.', value: 2, icon: { shape: 'chisel', color: '#b0b6bc' }, tool: { type: 'chisel', tier: 1 } });
add('needle', { name: 'Needle', examine: 'Sharp at one end, thread at the other.', value: 1, icon: { shape: 'needle', color: '#d0d4d8' }, tool: { type: 'needle', tier: 1 } });
add('small_net', { name: 'Small fishing net', examine: 'For catching shrimp and other small fry.', value: 4, icon: { shape: 'net', color: '#c9b48a' }, tool: { type: 'net', tier: 1 } });
add('fishing_rod', { name: 'Fishing rod', examine: 'Bait goes on the hook. Usually.', value: 5, icon: { shape: 'rod', color: '#8d6e3f' }, tool: { type: 'rod', tier: 1 } });
add('fly_rod', { name: 'Fly fishing rod', examine: 'For trout and salmon. Needs feathers.', value: 8, icon: { shape: 'rod', color: '#5f8f3a' }, tool: { type: 'flyrod', tier: 1 } });
add('lobster_pot', { name: 'Lobster pot', examine: 'A wicker trap. Lobsters walk in, few walk out.', value: 20, icon: { shape: 'pot-cage', color: '#a67c45' }, tool: { type: 'pot', tier: 1 } });
add('harpoon', { name: 'Harpoon', examine: 'For big fish with big opinions.', value: 25, icon: { shape: 'harpoon', color: '#8a8f95' }, tool: { type: 'harpoon', tier: 1 } });
add('fishing_bait', { name: 'Fishing bait', examine: 'Wriggly.', value: 1, stack: true, icon: { shape: 'bait', color: '#c97b63' } });
add('feather', { name: 'Feather', examine: 'Light as a… well.', value: 1, stack: true, icon: { shape: 'feather', color: '#f2efe6' } });
add('bucket', { name: 'Bucket', examine: 'An empty bucket.', value: 2, icon: { shape: 'bucket', color: '#8d6e3f' } });
add('bucket_of_water', { name: 'Bucket of water', examine: 'Cold, clear well water.', value: 3, icon: { shape: 'bucket', color: '#8d6e3f', color2: '#4aa3df' } });
add('bucket_of_milk', { name: 'Bucket of milk', examine: 'Fresh from a Millbrook cow.', value: 6, icon: { shape: 'bucket', color: '#8d6e3f', color2: '#f7f4ea' } });
add('pot', { name: 'Pot', examine: 'An empty clay pot.', value: 1, icon: { shape: 'pot', color: '#b5653a' } });
add('pot_of_flour', { name: 'Pot of flour', examine: 'Millbrook flour, finely ground.', value: 6, icon: { shape: 'pot', color: '#b5653a', color2: '#f3ead2' } });
add('grain', { name: 'Grain', examine: 'Wheat, ready for the mill.', value: 2, icon: { shape: 'grain', color: '#e2c060' } });
add('egg', { name: 'Egg', examine: 'Still warm.', value: 3, icon: { shape: 'egg', color: '#f2e6cf' } });
add('flax', { name: 'Flax', examine: 'Spin it into bowstring.', value: 3, icon: { shape: 'flax', color: '#7fa0d8' } });
add('bowstring', { name: 'Bowstring', examine: 'Taut and ready.', value: 8, icon: { shape: 'string', color: '#e8e2d0' } });
add('cowhide', { name: 'Cowhide', examine: 'Tan it into leather.', value: 4, icon: { shape: 'hide', color: '#8b5a3c' } });
add('leather', { name: 'Leather', examine: 'Tanned and supple.', value: 8, icon: { shape: 'hide', color: '#a0714f' } });
add('thread', { name: 'Thread', examine: 'For stitching leather.', value: 1, stack: true, icon: { shape: 'thread', color: '#e8e2d0' } });
add('bones', { name: 'Bones', examine: 'Someone\'s, once.', value: 2, icon: { shape: 'bones', color: '#efe8d8' } });
add('big_bones', { name: 'Big bones', examine: 'Someone large\'s, once.', value: 8, icon: { shape: 'bones', color: '#efe8d8', color2: '#cfc6b0' } });
add('coin_pouch', { name: 'Coin pouch', examine: 'Lifted from someone who had too much. Open it for CREDIT.', value: 0, stack: true, icon: { shape: 'pouch', color: '#a0714f', color2: '#f2c94c' } });

// Axes and pickaxes per metal.
for (const m of METALS) {
  add(`${m.id}_axe`, {
    name: `${m.name} axe`, examine: `A ${m.name.toLowerCase()} woodcutting axe.`, value: [16, 56, 200, 520, 1300][m.tier],
    icon: { shape: 'axe', color: m.color, color2: m.color2 }, tool: { type: 'axe', tier: m.tier + 1 },
    equip: { slot: 'weapon', req: { attack: m.req }, bonus: { atk: [3, 5, 8, 11, 15][m.tier], str: [4, 6, 9, 13, 18][m.tier] }, speed: 5, style: 'melee', model: { kind: 'axe', tint: m.id } },
  });
  add(`${m.id}_pickaxe`, {
    name: `${m.name} pickaxe`, examine: `A ${m.name.toLowerCase()} pickaxe.`, value: [16, 56, 200, 520, 1300][m.tier],
    icon: { shape: 'pickaxe', color: m.color, color2: m.color2 }, tool: { type: 'pickaxe', tier: m.tier + 1 },
    equip: { slot: 'weapon', req: { attack: m.req }, bonus: { atk: [3, 5, 8, 11, 15][m.tier], str: [3, 5, 8, 12, 16][m.tier] }, speed: 5, style: 'melee', model: { kind: 'pickaxe', tint: m.id } },
  });
}

// ---------------------------------------------------------------------------
// Logs, ores, bars, gems
// ---------------------------------------------------------------------------
const LOG_VALUE = [4, 8, 14, 25, 60, 140];
for (const w of WOODS) {
  add(w.log, { name: w.id ? `${w.name} logs` : 'Logs', examine: w.id ? `Logs cut from ${aOrAn(w.name)} ${w.name.toLowerCase()} tree.` : 'Logs cut from a tree.', value: LOG_VALUE[w.tier], icon: { shape: 'logs', color: w.color } });
}
const ORES = [
  { id: 'copper_ore', name: 'Copper ore', color: '#c4703b', value: 3 },
  { id: 'tin_ore', name: 'Tin ore', color: '#a9a9a9', value: 3 },
  { id: 'iron_ore', name: 'Iron ore', color: '#7a5545', value: 8 },
  { id: 'coal', name: 'Coal', color: '#2b2b2b', value: 12 },
  { id: 'cobalt_ore', name: 'Cobalt ore', color: '#3f6fd8', value: 30 },
  { id: 'starmetal_ore', name: 'Starmetal ore', color: '#b8a8ff', value: 80 },
];
for (const o of ORES) add(o.id, { name: o.name, examine: `A lump of ${o.name.toLowerCase().replace(' ore', '')}.`, value: o.value, icon: { shape: 'ore', color: o.color } });
add('orbium_shard', { name: 'Orbium shard', examine: 'A sliver of thinking crystal. It hums when you ask it things.', value: 40, stack: true, icon: { shape: 'shard', color: '#8fe3ff', color2: '#b18cff' } });
const BAR_VALUE = [8, 20, 45, 110, 260];
for (const m of METALS) add(`${m.id}_bar`, { name: `${m.name} bar`, examine: `A bar of ${m.name.toLowerCase()}.`, value: BAR_VALUE[m.tier], icon: { shape: 'bar', color: m.color, color2: m.color2 } });
for (const g of [{ id: 'sapphire', name: 'Sapphire', color: '#2f6fe0', v: 40 }, { id: 'emerald', name: 'Emerald', color: '#2ecc71', v: 70 }, { id: 'ruby', name: 'Ruby', color: '#e0314f', v: 110 }]) {
  add(`uncut_${g.id}`, { name: `Uncut ${g.name.toLowerCase()}`, examine: 'Rough. A chisel would help.', value: g.v, icon: { shape: 'gem-rough', color: g.color } });
  add(g.id, { name: g.name, examine: `A cut ${g.name.toLowerCase()}. It catches the light.`, value: g.v * 2, icon: { shape: 'gem', color: g.color } });
}

// ---------------------------------------------------------------------------
// Food (raw / cooked / burnt)
// ---------------------------------------------------------------------------
export const FISH = [
  { id: 'shrimp', name: 'Shrimp', heal: 3, value: 2, color: '#f08a6c' },
  { id: 'sardine', name: 'Sardine', heal: 4, value: 3, color: '#9fb4c7' },
  { id: 'trout', name: 'Trout', heal: 7, value: 9, color: '#c9a07a' },
  { id: 'salmon', name: 'Salmon', heal: 9, value: 14, color: '#f08a6c' },
  { id: 'pike', name: 'Pike', heal: 8, value: 12, color: '#7f9a5f' },
  { id: 'lobster', name: 'Lobster', heal: 12, value: 30, color: '#d0453a' },
  { id: 'swordfish', name: 'Swordfish', heal: 14, value: 45, color: '#6f8fb3' },
];
for (const f of FISH) {
  add(`raw_${f.id}`, { name: `Raw ${f.name.toLowerCase()}`, examine: 'I should cook this first.', value: f.value, icon: { shape: f.id === 'lobster' ? 'lobster' : 'fish', color: f.color, color2: '#3a4a5a' } });
  add(f.id, { name: f.name, examine: 'Cooked to perfection. Mostly.', value: Math.round(f.value * 1.3), food: { heal: f.heal }, icon: { shape: f.id === 'lobster' ? 'lobster' : 'fish', color: shade(f.color), color2: '#5a3a1a' } });
}
add('burnt_fish', { name: 'Burnt fish', examine: 'Oops.', value: 0, icon: { shape: 'fish', color: '#2b2622' } });
add('raw_beef', { name: 'Raw beef', examine: 'Needs a fire.', value: 2, icon: { shape: 'meat', color: '#c0504d' } });
add('cooked_meat', { name: 'Cooked meat', examine: 'Smells great.', value: 3, food: { heal: 3 }, icon: { shape: 'meat', color: '#8b4a2b' } });
add('raw_chicken', { name: 'Raw chicken', examine: 'Needs a fire.', value: 2, icon: { shape: 'drumstick', color: '#f0c0a0' } });
add('roast_chicken', { name: 'Roast chicken', examine: 'Crispy skin.', value: 3, food: { heal: 3 }, icon: { shape: 'drumstick', color: '#b0703a' } });
add('burnt_meat', { name: 'Burnt meat', examine: 'Charcoal with ambition.', value: 0, icon: { shape: 'meat', color: '#2b2622' } });
add('bread_dough', { name: 'Bread dough', examine: 'Flour and water. Bake it.', value: 3, icon: { shape: 'dough', color: '#ecdcb6' } });
add('bread', { name: 'Bread', examine: 'Warm Brightwater bread.', value: 6, food: { heal: 5 }, icon: { shape: 'bread', color: '#c8893f' } });
add('honey_cake', { name: 'Honey cake', examine: 'Marta\'s famous recipe. Heals a lot.', value: 40, food: { heal: 12 }, icon: { shape: 'cake', color: '#f2c94c', color2: '#f7efe0' } });

// ---------------------------------------------------------------------------
// Smithed equipment per metal
// ---------------------------------------------------------------------------
const T = (arr, m) => arr[m.tier];
for (const m of METALS) {
  const v = BAR_VALUE[m.tier];
  const weapon = (id, name, bars, atk, str, speed, kind, extra = {}) => add(`${m.id}_${id}`, {
    name: `${m.name} ${name}`, examine: `A ${m.name.toLowerCase()} ${name}.`, value: Math.round(v * bars * 1.5),
    icon: { shape: kind, color: m.color, color2: m.color2 },
    equip: { slot: 'weapon', req: { attack: m.req }, bonus: { atk, str }, speed, style: 'melee', model: { kind, tint: m.id }, ...extra },
    smith: { bars, level: m.smith + { dagger: 0, sword: 4, greatsword: 9 }[id] },
  });
  weapon('dagger', 'dagger', 1, T([4, 7, 11, 16, 22], m), T([3, 5, 8, 12, 17], m), 4, 'dagger');
  weapon('sword', 'sword', 2, T([7, 11, 17, 24, 33], m), T([6, 9, 14, 20, 28], m), 4, 'sword');
  weapon('greatsword', 'greatsword', 3, T([10, 16, 24, 34, 46], m), T([12, 18, 28, 40, 54], m), 6, 'greatsword', { twoHanded: true });
  const armour = (id, name, slot, bars, def, extraLevel) => add(`${m.id}_${id}`, {
    name: `${m.name} ${name}`, examine: `${m.name} armour. Heavy, but worth it.`, value: Math.round(v * bars * 1.4),
    icon: { shape: id, color: m.color, color2: m.color2 },
    equip: { slot, req: { defence: m.req }, bonus: { def }, model: { kind: id, tint: m.id } },
    smith: { bars, level: m.smith + extraLevel },
  });
  armour('helm', 'helm', 'head', 1, T([3, 5, 8, 12, 17], m), 2);
  armour('kiteshield', 'kiteshield', 'shield', 3, T([6, 10, 15, 21, 29], m), 8);
  armour('platelegs', 'platelegs', 'legs', 3, T([7, 11, 17, 24, 33], m), 11);
  armour('chestplate', 'chestplate', 'body', 5, T([10, 16, 24, 34, 46], m), 13);
  add(`${m.id}_arrowheads`, { name: `${m.name} arrowheads`, examine: 'Pointy. Needs a shaft.', value: Math.round(v / 6), stack: true, icon: { shape: 'arrowheads', color: m.color }, smith: { bars: 1, level: m.smith + 3, makes: 15 } });
  add(`${m.id}_arrow`, {
    name: `${m.name} arrow`, examine: `Arrows tipped with ${m.name.toLowerCase()}.`, value: Math.round(v / 5), stack: true,
    icon: { shape: 'arrow', color: m.color, color2: '#f2efe6' },
    equip: { slot: 'ammo', req: { archery: m.req }, bonus: { rstr: T([7, 10, 16, 22, 31], m) }, model: { kind: 'quiver', tint: m.id } }, ammo: { tier: m.tier },
  });
}
add('arrow_shaft', { name: 'Arrow shaft', examine: 'Add feathers.', value: 1, stack: true, icon: { shape: 'shaft', color: '#a67c45' } });
add('headless_arrow', { name: 'Headless arrow', examine: 'Add arrowheads.', value: 1, stack: true, icon: { shape: 'shaft', color: '#a67c45', color2: '#f2efe6' } });

// Bows per wood.
for (const w of WOODS) {
  const pre = w.id ? `${w.name} ` : '';
  const key = w.id ? `${w.id}_` : '';
  const rng = [8, 14, 20, 29, 40, 52][w.tier];
  add(`${key}shortbow`, {
    name: w.id ? `${pre}shortbow` : 'Shortbow', examine: 'Quick to draw.', value: Math.round(LOG_VALUE[w.tier] * 4 + 10),
    icon: { shape: 'shortbow', color: w.color, color2: '#e8e2d0' },
    equip: { slot: 'weapon', req: { archery: w.archery }, bonus: { rng }, speed: 4, style: 'bow', twoHanded: true, model: { kind: 'shortbow', tint: w.id || 'normal' } },
    fletch: { log: w.log, level: w.fletch, strung: true },
  });
  add(`${key}longbow`, {
    name: w.id ? `${pre}longbow` : 'Longbow', examine: 'Slow, accurate, far-reaching.', value: Math.round(LOG_VALUE[w.tier] * 5 + 14),
    icon: { shape: 'longbow', color: w.color, color2: '#e8e2d0' },
    equip: { slot: 'weapon', req: { archery: w.archery }, bonus: { rng: rng + 4 }, speed: 5, style: 'bow', twoHanded: true, range: 9, model: { kind: 'longbow', tint: w.id || 'normal' } },
    fletch: { log: w.log, level: w.fletch + 5, strung: true },
  });
}

// ---------------------------------------------------------------------------
// Leather, Hood gear, jewellery, staves
// ---------------------------------------------------------------------------
const leather = (id, name, slot, def, rng, level, req = {}) => add(id, {
  name, examine: 'Stitched leather armour.', value: 10 + level * 3, icon: { shape: slot === 'body' ? 'body-leather' : slot, color: '#a0714f', color2: '#5a3a24' },
  equip: { slot, req, bonus: { def, rng }, model: { kind: id, tint: 'leather' } }, craft: { level, leather: slot === 'body' ? 3 : 1 },
});
leather('leather_gloves', 'Leather gloves', 'hands', 1, 1, 1);
leather('leather_boots', 'Leather boots', 'feet', 1, 1, 7);
leather('leather_cowl', 'Leather cowl', 'head', 2, 2, 9);
leather('leather_body', 'Leather body', 'body', 8, 3, 14);
leather('leather_chaps', 'Leather chaps', 'legs', 4, 3, 18);
leather('hard_leather_body', 'Hard leather body', 'body', 14, 5, 28, { defence: 10 });
add('hood_cowl', { name: 'Hood of the Vale', examine: 'The green hood of the outlaw guild. Wear it with pride.', value: 0, tradeable: false, quest: true, icon: { shape: 'head', color: '#3f7f3a', color2: '#24461f' }, equip: { slot: 'head', req: {}, bonus: { def: 3, rng: 5 }, model: { kind: 'hood', tint: 'hood' } } });
add('hood_cape', { name: 'Hood cape', examine: 'Lincoln green. Given to sworn members of the Hood.', value: 0, tradeable: false, quest: true, icon: { shape: 'cape', color: '#3f7f3a', color2: '#24461f' }, equip: { slot: 'cape', req: {}, bonus: { def: 2, rng: 3 }, model: { kind: 'cape', tint: 'hood' } } });
add('wyrmscale_body', { name: 'Wyrmscale body', examine: 'Ash-grey scales, still warm.', value: 3600, icon: { shape: 'body-leather', color: '#5d5a6a', color2: '#e8763a' }, equip: { slot: 'body', req: { defence: 40, archery: 40 }, bonus: { def: 40, rng: 12 }, model: { kind: 'wyrmscale_body', tint: 'wyrm' } }, craft: { level: 55, scales: 3 } });
add('wyrm_scale', { name: 'Wyrm scale', examine: 'From the Ashen Wyrm itself.', value: 900, icon: { shape: 'scale', color: '#5d5a6a', color2: '#e8763a' } });
add('fireward_shield', { name: 'Fireward shield', examine: 'Painted with a ward against wyrmfire.', value: 0, tradeable: false, quest: true, icon: { shape: 'kiteshield', color: '#c0392b', color2: '#f2c94c' }, equip: { slot: 'shield', req: { defence: 20 }, bonus: { def: 14 }, model: { kind: 'kiteshield', tint: 'fireward' } } });
for (const g of [{ id: 'sapphire', b: { mag: 6, def: 2 }, name: 'Sapphire amulet' }, { id: 'emerald', b: { rng: 6 }, name: 'Emerald amulet' }, { id: 'ruby', b: { str: 6 }, name: 'Ruby amulet' }]) {
  add(`${g.id}_amulet`, { name: g.name, examine: 'A gem on a string. Surprisingly potent.', value: 300, icon: { shape: 'amulet', color: ITEMS[g.id].icon.color }, equip: { slot: 'neck', req: {}, bonus: g.b, model: { kind: 'amulet', tint: g.id } }, craft: { level: { sapphire: 12, emerald: 26, ruby: 40 }[g.id], gem: g.id } });
}
add('ledger_ring', { name: 'Ring of the Ledger', examine: 'Every coin you touch, it remembers.', value: 0, tradeable: false, quest: true, icon: { shape: 'ring', color: '#f2c94c' }, equip: { slot: 'ring', req: {}, bonus: { str: 4, def: 4 }, model: { kind: 'ring', tint: 'gold' } } });

// Staves (Arcana).
const staff = (id, name, mag, req, sigil, value) => add(id, {
  name, examine: sigil ? `Supplies endless ${sigil.replace('_sigil', '')} sigils.` : 'A plain wooden staff.', value,
  icon: { shape: 'staff', color: '#8d6e3f', color2: sigil ? '#8fe3ff' : '#8d6e3f' },
  equip: { slot: 'weapon', req: { arcana: req }, bonus: { mag, atk: 2 }, speed: 5, style: 'staff', twoHanded: true, infiniteSigil: sigil || null, model: { kind: 'staff', tint: id } },
});
staff('staff', 'Staff', 4, 1, null, 15);
staff('spark_staff', 'Staff of sparks', 10, 1, 'spark_sigil', 150);
staff('tide_staff', 'Staff of tides', 10, 1, 'tide_sigil', 150);
staff('ember_staff', 'Staff of embers', 10, 1, 'ember_sigil', 150);
staff('orbium_staff', 'Orbium staff', 22, 45, null, 2400);

// Sigils (Arcana "runes"): crafted from orbium shards at the Spire.
export const SIGILS = [
  { id: 'spark_sigil', name: 'Spark sigil', color: '#f4f1a8', level: 1, value: 2 },
  { id: 'tide_sigil', name: 'Tide sigil', color: '#4aa3df', level: 5, value: 2 },
  { id: 'stone_sigil', name: 'Stone sigil', color: '#9e8c7a', level: 9, value: 2 },
  { id: 'ember_sigil', name: 'Ember sigil', color: '#e8763a', level: 14, value: 2 },
  { id: 'thought_sigil', name: 'Thought sigil', color: '#b18cff', level: 30, value: 15 },
  { id: 'path_sigil', name: 'Path sigil', color: '#8fe3d0', level: 20, value: 10 },
  { id: 'insight_sigil', name: 'Insight sigil', color: '#ffffff', level: 50, value: 40 },
];
for (const s of SIGILS) add(s.id, { name: s.name, examine: 'A token of thought, pressed into crystal.', value: s.value, stack: true, icon: { shape: 'sigil', color: s.color }, sigil: { level: s.level } });

// ---------------------------------------------------------------------------
// Monster drops & misc
// ---------------------------------------------------------------------------
add('goblin_mail', { name: 'Goblin mail', examine: 'Smells like goblin. Sells like goblin.', value: 5, icon: { shape: 'body-leather', color: '#6b7f3a', color2: '#3f4a20' }, equip: { slot: 'body', req: {}, bonus: { def: 3 }, model: { kind: 'goblin_mail', tint: 'goblin' } } });
add('spider_silk', { name: 'Spider silk', examine: 'Strong as wire. Makes a fine bowstring.', value: 20, icon: { shape: 'thread', color: '#f2f2f2' } });
add('troll_tusk', { name: 'Troll tusk', examine: 'A collector in Gildmoor pays well for these.', value: 120, icon: { shape: 'tusk', color: '#efe8d8' } });
add('golem_core', { name: 'Golem core', examine: 'A stone heart with an Orbio spark inside.', value: 250, icon: { shape: 'shard', color: '#9e8c7a', color2: '#8fe3ff' } });
add('bog_pearl', { name: 'Bog pearl', examine: 'Pale, cold, oddly pretty.', value: 90, icon: { shape: 'gem', color: '#d8e8e0' } });
add('wolf_pelt', { name: 'Wolf pelt', examine: 'Thick grey fur.', value: 18, icon: { shape: 'hide', color: '#8a8a8a' } });
add('boar_tusk', { name: 'Boar tusk', examine: 'A trophy.', value: 9, icon: { shape: 'tusk', color: '#efe8d8' } });
add('bandit_mask', { name: 'Bandit mask', examine: 'Not your style. Or is it?', value: 30, icon: { shape: 'head', color: '#2b2b2b' }, equip: { slot: 'head', req: {}, bonus: { def: 1 }, model: { kind: 'mask', tint: 'bandit' } } });

// ---------------------------------------------------------------------------
// Quest items (untradeable)
// ---------------------------------------------------------------------------
const quest = (id, name, examine, shape, color) => add(id, { name, examine, value: 0, tradeable: false, quest: true, icon: { shape, color } });
quest('village_bell', 'Brightwater bell', 'The village bell. Goblins chewed the rope.', 'bell', '#d4a73a');
quest('hood_token', 'Hood token', 'A wooden token stamped with a bow. Proof you\'re one of them.', 'token', '#6a8f3a');
quest('tax_ledger', 'Tax ledger', 'Robyn wants to see who\'s been taxed and how much.', 'book', '#7a2a2a');
quest('sheriff_ledger', 'The true ledger', 'The Sheriff\'s private books. Every stolen CREDIT, listed.', 'book', '#2a2a2a');
quest('vault_key', 'Vault key', 'Heavy iron, cut for one lock.', 'key', '#8a8f95');
quest('oracle_lens', 'Oracle lens', 'Look through it and thoughts look back.', 'shard', '#b18cff');
quest('willow_bark', 'Willow bark', 'Old Wren wants this for a remedy.', 'logs', '#a39a5f');
quest('ash_key', 'Ashen key', 'Warm to the touch. Opens the way under the peak.', 'key', '#e8763a');
quest('recipe_card', 'Marta\'s recipe', 'Honey cake: eggs, milk, flour, and love.', 'scroll', '#f3ead2');

export { ITEMS };
export const ITEM_IDS = Object.keys(ITEMS);
export function item(id) {
  const it = ITEMS[id];
  if (!it) throw new Error('unknown item ' + id);
  return it;
}

function aOrAn(w) { return /^[aeiou]/i.test(w) ? 'an' : 'a'; }
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.75), g = Math.round(((n >> 8) & 255) * 0.62), b = Math.round((n & 255) * 0.5);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Display helper: milli-CREDIT -> "0.042".
export function formatCredit(mc, { sign = false } = {}) {
  const v = (mc / 1000).toFixed(3);
  return sign && mc > 0 ? '+' + v : mc < 0 ? '−' + v.slice(1) : v;
}
