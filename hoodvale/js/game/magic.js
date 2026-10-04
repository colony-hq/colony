// Arcana spellbook (data/economy.js SPELLS): combat spells with sigil costs (staves supply one
// sigil type for free), teleports with an animation, autocast with a staff. Requires the
// 'unlock:arcana' flag (reward of The Oracle's Price). Owner: game builder.
//
// API (ctx.magic): spells, book() -> [{ spell, ok, reason }], canCast(id) -> bool,
//   reason(id) -> string|null, cast(id, target?) -> bool (combat spells need a monster target;
//   teleports need none), autocast (get/set spell id|null), setAutocast(id|null) -> bool,
//   unlocked() -> bool, consume(spell) -> bool, cost(spell) -> [[sigil, n, free]].
// Events: spell:cast {spell, target}, magic:autocast {spell}, spell:teleport {spell, x, z}.

import { SPELLS } from '../data/economy.js';
import { say, lname, randInt } from './util.js';

export const SPELL_BY_ID = Object.fromEntries(SPELLS.map((s) => [s.id, s]));

export function createMagic(ctx) {
  const { state, events } = ctx;
  let tele = null; // spell being cast as a teleport

  const freeSigil = () => ctx.equipment.weapon()?.equip?.infiniteSigil || null;
  const hasStaff = () => ctx.equipment.weapon()?.equip?.style === 'staff';

  const magic = {
    spells: SPELLS,
    unlocked() { return !!state.flag('unlock:arcana') || state.save.quests?.oracles_price === 'done'; },
    cost(spell) {
      const free = freeSigil();
      return spell.cost.map(([id, n]) => [id, n, id === free]);
    },
    reason(id) {
      const spell = SPELL_BY_ID[id];
      if (!spell) return 'You don\'t know that spell.';
      if (!magic.unlocked()) return 'You haven\'t learned Arcana yet. The Orbio Oracle may teach you.';
      if (ctx.skills.level('arcana') < spell.level) return `You need an Arcana level of ${spell.level} to cast ${spell.name}.`;
      for (const [sid, n, free] of magic.cost(spell)) {
        if (!free && !ctx.inventory.has(sid, n)) return `You do not have enough ${lname(sid)}s to cast this spell.`;
      }
      return null;
    },
    canCast(id) { return !magic.reason(id); },
    book() { return SPELLS.map((spell) => ({ spell, ok: magic.canCast(spell.id), reason: magic.reason(spell.id) })); },
    consume(spell) {
      if (magic.reason(spell.id)) return false;
      for (const [sid, n, free] of magic.cost(spell)) if (!free) ctx.inventory.remove(sid, n);
      return true;
    },
    get autocast() { return state.save.autocast || null; },
    set autocast(id) { magic.setAutocast(id); },
    setAutocast(id) {
      if (!id) {
        if (state.save.autocast) { state.save.autocast = null; state.markDirty(); events.emit('magic:autocast', { spell: null }); }
        return true;
      }
      const spell = SPELL_BY_ID[id];
      if (!spell || !spell.maxHit) return false;
      if (!hasStaff()) { say(ctx, 'You need to wield a staff to autocast spells.', 'warn'); return false; }
      if (!magic.unlocked()) { say(ctx, magic.reason(id), 'warn'); return false; }
      if (ctx.skills.level('arcana') < spell.level) { say(ctx, `You need an Arcana level of ${spell.level} to cast ${spell.name}.`, 'warn'); return false; }
      state.save.autocast = id;
      state.markDirty();
      events.emit('magic:autocast', { spell: id });
      say(ctx, `Autocast: ${spell.name}.`);
      return true;
    },
    cast(id, target = null) {
      const spell = SPELL_BY_ID[id];
      const why = magic.reason(id);
      if (why) { say(ctx, why, 'warn'); return false; }
      if (spell.teleport) {
        tele = spell;
        return ctx.actions.perform(ctx.player.entity, 'Teleport');
      }
      if (!target || target.kind !== 'monster' || !target.alive) { say(ctx, 'Choose a creature to cast that on.', 'warn'); return false; }
      return ctx.combat.attack(target, { spell: id });
    },
    update() {},
  };

  // Teleport: 3-tick cast animation, then away. Walking interrupts it (sigils are only used on
  // completion).
  ctx.actions.register('Teleport', {
    approach: null,
    start(e, option, c) {
      if (!tele) return false;
      c.spell = tele; tele = null;
      ctx.combat?.disengage?.();
      ctx.player.stop();
      ctx.player.setAnim('teleport');
      c.at = ctx.ticks.count + 3;
      events.emit('spell:cast', { spell: c.spell.id, target: null });
      return true;
    },
    tick(e, n, c) {
      if (n < c.at) return true;
      if (!magic.consume(c.spell)) { say(ctx, magic.reason(c.spell.id) || 'The spell fizzles.', 'warn'); return false; }
      ctx.skills.addXp('arcana', c.spell.xp);
      const t = c.spell.teleport;
      let x = Math.floor(t.x) + randInt(-1, 1), z = Math.floor(t.z) + randInt(-1, 1);
      if (!ctx.map.isWalkable(x, z)) { const w = ctx.map.nearestWalkable(Math.floor(t.x), Math.floor(t.z), 6); if (w) { x = w.x; z = w.z; } }
      ctx.player.teleport(x, z);
      say(ctx, `The ${c.spell.name} unfolds beneath your feet.`);
      events.emit('spell:teleport', { spell: c.spell.id, x, z });
      return false;
    },
    stop() { ctx.player.setAnim(null); },
  }, 'player');

  // A staff is required for autocast: clear it when the staff goes away.
  events.on('equipment:change', () => { if (state.save.autocast && !hasStaff()) magic.setAutocast(null); });
  return magic;
}
