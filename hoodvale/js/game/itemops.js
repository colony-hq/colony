// Inventory / equipment item options for the UI: ctx.game. Owner: game builder.
//
//   ctx.game.itemOptions(index) -> string[]   options for inventory slot `index`
//        (first = left-click default; the UI shows them in this order in the right-click menu).
//        Possible: 'Eat', 'Wield', 'Wear', 'Open', 'Light', 'Read', 'Empty', 'Use', 'Drop', 'Examine'.
//   ctx.game.useInventory(index, option) -> bool   performs the option.
//        'Use' selects the item (ctx.game.selected = {index, id}; event item:select) — the UI then
//        sends the next click to ctx.game.useItemOn(index, target) or cancels with clearSelection().
//   ctx.game.useItemOn(index, target) -> bool   target: an entity (picked in the world) or
//        { kind: 'item', index } (another inventory slot). Walks there and runs the use-handler.
//   ctx.game.equipmentOptions(slot) -> ['Remove', 'Examine'];  useEquipment(slot, option) -> bool
//   ctx.game.examineItem(id), ctx.game.selected, ctx.game.clearSelection()
//   ctx.game.itemValue(id) -> mc, ctx.game.describeItem(id) -> { name, examine, value, options }
// Events: item:select {index, id} | {index: -1} on clear, item:drop {id, qty, x, z},
//         food:eat {item, heal, hp}, item:equip {id, slot}, item:unequip {id, slot}.

import { ITEMS } from '../data/items.js';
import { say, lname, formatMc } from './util.js';

const READ_TEXT = {
  recipe_card: 'Honey cake: one egg, one bucket of milk, one pot of flour. Bake on a range, never a campfire. And love. Mostly love. — Marta',
  tax_ledger: 'Columns of names and sums. "Hale: 0.006. Widow Fen: 0.004. Brightwater Inn: 0.020." Every page ends: "Remitted to the Sheriff — less my share."',
  sheriff_ledger: 'Every CREDIT the Sheriff ever took, signed in his own hand. The last page reads: "Hood problem: solve."',
};
const EMPTY = { bucket_of_water: 'bucket', bucket_of_milk: 'bucket', pot_of_flour: 'pot' };

export function createItemOps(ctx, actions) {
  const { events } = ctx;
  let lastEat = -99;

  const game = {
    selected: null,

    itemOptions(index) {
      const e = ctx.inventory.slots[index];
      if (!e) return [];
      return optionsFor(e.id);
    },
    describeItem(id) {
      const d = ITEMS[id];
      return d ? { name: d.name, examine: d.examine, value: d.value, options: optionsFor(id) } : null;
    },
    itemValue(id) { return ITEMS[id]?.value || 0; },

    useInventory(index, option) {
      const e = ctx.inventory.slots[index];
      if (!e) return false;
      const def = ITEMS[e.id];
      if (ctx.state.mode === 'dead') return false;
      switch (option) {
        case 'Eat': return eat(index);
        case 'Wield': case 'Wear': {
          const ok = ctx.equipment.equipFromInventory(index);
          if (ok) events.emit('item:equip', { id: e.id, slot: def.equip.slot });
          return ok;
        }
        case 'Open':
          if (e.id === 'coin_pouch') return ctx.gathering?.openPouches?.() || false;
          return false;
        case 'Light': return actions.use('tinderbox', { kind: 'item', id: e.id, index }, ctx.inventory.indexOf('tinderbox'));
        case 'Read': {
          const text = READ_TEXT[e.id] || def.examine;
          if (ctx.ui?.dialogue) ctx.ui.dialogue({ speaker: { name: def.name, kind: 'npc' }, text });
          else say(ctx, text);
          events.emit('item:read', { id: e.id });
          return true;
        }
        case 'Empty': {
          const to = EMPTY[e.id];
          if (!to) return false;
          ctx.inventory.removeAt(index, 1);
          ctx.inventory.add(to, 1);
          say(ctx, `You empty the ${lname(e.id).replace(/^(bucket|pot) of /, '')} out.`);
          return true;
        }
        case 'Use':
          game.selected = { index, id: e.id };
          events.emit('item:select', { index, id: e.id });
          return true;
        case 'Drop': return drop(index);
        case 'Examine': game.examineItem(e.id, e); return true;
        default: return false;
      }
    },

    useItemOn(index, target) {
      const e = ctx.inventory.slots[index];
      game.clearSelection();
      if (!e || !target) return false;
      if (target.kind === 'item') {
        const other = ctx.inventory.slots[target.index];
        if (!other || target.index === index) return false;
        return actions.use(e.id, { kind: 'item', id: other.id, index: target.index }, index);
      }
      return actions.use(e.id, target, index);
    },
    clearSelection() {
      if (!game.selected) return;
      game.selected = null;
      events.emit('item:select', { index: -1 });
    },

    equipmentOptions(slot) { return ctx.equipment.slots[slot] ? ['Remove', 'Examine'] : []; },
    useEquipment(slot, option) {
      const e = ctx.equipment.slots[slot];
      if (!e) return false;
      if (option === 'Remove') {
        const ok = ctx.equipment.unequip(slot);
        if (ok) events.emit('item:unequip', { id: e.id, slot });
        return ok;
      }
      if (option === 'Examine') { game.examineItem(e.id, e); return true; }
      return false;
    },

    examineItem(id, entry) {
      const d = ITEMS[id];
      if (!d) return;
      let text = d.examine;
      if (id === 'coin_pouch') {
        const mc = ctx.gathering?.pouchValue?.() || 0;
        if (mc) text += ` (Holding ${formatMc(mc)} CREDIT in total.)`;
      } else if (entry && d.stack && entry.qty >= 100000) text += ` (${entry.qty.toLocaleString('en')})`;
      say(ctx, text);
    },
    eat,
    drop,
  };

  function optionsFor(id) {
    const d = ITEMS[id];
    if (!d) return ['Examine'];
    const o = [];
    if (d.food) o.push('Eat');
    if (d.equip) o.push(['weapon', 'shield'].includes(d.equip.slot) ? 'Wield' : 'Wear');
    if (id === 'coin_pouch') o.push('Open');
    if (/logs$/.test(id) && !d.quest) o.push('Light');
    if (READ_TEXT[id]) o.push('Read');
    if (EMPTY[id]) o.push('Empty');
    o.push('Use', 'Drop', 'Examine');
    // RS: logs left-click "Use" (so Light is second); everything else keeps its first option.
    if (o[0] === 'Light') { o.splice(0, 1); o.splice(1, 0, 'Light'); }
    return o;
  }

  function eat(index) {
    const e = ctx.inventory.slots[index];
    const d = e && ITEMS[e.id];
    if (!d?.food) return false;
    const n = ctx.ticks.count;
    if (n - lastEat < 3) return false; // eat delay: 3 ticks
    lastEat = n;
    ctx.inventory.removeAt(index, 1);
    let healed;
    if (ctx.combat?.healPlayer) healed = ctx.combat.healPlayer(d.food.heal);
    else {
      const max = ctx.skills.level('hitpoints');
      const before = ctx.state.save.hp;
      healed = Math.max(0, Math.min(d.food.heal, max - before));
      ctx.state.save.hp = Math.min(max, before + d.food.heal);
      ctx.state.markDirty();
    }
    say(ctx, `You eat the ${lname(e.id)}.` + (healed > 0 ? ' It heals some health.' : ''));
    ctx.player?.playOnce?.('eat', 1.2);
    ctx.combat?.delayAttack?.(3);
    events.emit('food:eat', { item: e.id, heal: healed, hp: ctx.state.save.hp });
    if (healed > 0) events.emit('combat:hit', { target: ctx.player.entity, source: null, amount: healed, type: 'heal' });
    return true;
  }

  function drop(index) {
    const e = ctx.inventory.slots[index];
    if (!e) return false;
    const taken = ctx.inventory.removeAt(index, ITEMS[e.id]?.stack ? Infinity : 1);
    if (!taken) return false;
    const p = ctx.player;
    if (ctx.loot?.drop) ctx.loot.drop(taken.id, taken.qty, p.x, p.z, { owner: 'player' });
    else ctx.entities.spawnItem(taken.id, taken.qty, p.x, p.z, { owner: 'player' });
    events.emit('item:drop', { id: taken.id, qty: taken.qty, x: p.x, z: p.z });
    return true;
  }

  // Convenience aliases on the inventory too (ctx.inventory.options(i) / act(i, option)).
  queueMicrotask(() => {
    if (ctx.inventory && !ctx.inventory.options) {
      ctx.inventory.options = game.itemOptions;
      ctx.inventory.act = game.useInventory;
    }
  });
  return game;
}
