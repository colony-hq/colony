// Loot & ground items: monster drop tables (always + weighted table rolls + a small rare table +
// quest drops), CREDIT drops paid straight to the Hood Wallet ("Loot: Goblin"), ground items
// with owner-only visibility for 60 ticks then public, despawn, stacking, and 'Take'.
// Owner: game builder.
//
// API (ctx.loot): drop(id, qty, tx, tz, { owner, privateTicks, ticks }) -> entity,
//   dropFor(monster, x?, z?) -> { items, credit }, roll(monsterDef) -> { items, credit },
//   take(entity) -> bool, questDrops (array; content may edit), visible(entity) -> bool.
// Events: loot:drop {entity, id, qty, x, z, owner, source?}, loot:take {entity, id, qty},
//   monster:loot {entity, items: [[id, qty]], credit}, loot:despawn {entity}.

import { ITEMS } from '../data/items.js';
import { say, randInt, chance, weighted, owns, questActive, withArticle, formatMc } from './util.js';

const PRIVATE_TICKS = 60;
const LIFETIME = 300; // 3 minutes on the ground
const RARE_TABLE = [
  { item: 'uncut_sapphire', qty: [1, 1], w: 5 },
  { item: 'uncut_emerald', qty: [1, 1], w: 3 },
  { item: 'uncut_ruby', qty: [1, 1], w: 1 },
  { item: 'orbium_shard', qty: [3, 8], w: 3 },
  { item: 'path_sigil', qty: [1, 3], w: 2 },
];

export function createLoot(ctx) {
  const { events, entities, map } = ctx;
  const ground = new Set();

  // Quest-conditional ground drops: { monster, item, quest, chance, text } — dropped while the
  // quest is active and the item isn't owned. Empty by default: the content module hands out the
  // bell / vault key / Ashen key itself on monster:death (push entries here to use drops instead).
  const questDrops = [];

  const isOwnerView = (e) => !e.owner || e.owner === 'player' || ctx.ticks.count >= e.publicAt;
  function setHidden(e, hidden) {
    if (e.hidden === hidden) return;
    e.hidden = hidden;
    try {
      if (e.view?.setVisible) e.view.setVisible(!hidden);
      else if (e.view?.object3d) e.view.object3d.visible = !hidden;
    } catch { /* ignore */ }
  }

  const loot = {
    questDrops,
    visible: isOwnerView,
    drop(id, qty, tx, tz, { owner = null, privateTicks = PRIVATE_TICKS, ticks = LIFETIME, source = null } = {}) {
      const def = ITEMS[id];
      if (!def || !(qty > 0)) return null;
      if (!map.isWalkable(tx, tz)) {
        const w = map.nearestWalkable(tx, tz, 4);
        if (w) { tx = w.x; tz = w.z; }
      }
      if (def.stack) {
        const ex = entities.at(tx, tz).find((e) => e.kind === 'item' && e.defId === id && e.owner === owner && ground.has(e));
        if (ex) {
          ex.qty += qty;
          ex.expires = Math.max(ex.expires, ctx.ticks.count + ticks);
          events.emit('loot:drop', { entity: ex, id, qty, x: tx, z: tz, owner, source });
          return ex;
        }
        return spawn(id, qty, tx, tz, owner, privateTicks, ticks, source);
      }
      let last = null;
      for (let i = 0; i < Math.min(qty, 12); i++) last = spawn(id, 1, tx, tz, owner, privateTicks, ticks, source);
      return last;
    },
    roll(def) {
      const d = def.drops || {};
      const items = [];
      for (const a of d.always || []) items.push([a.item, a.qty || 1]);
      const rolls = d.tableRolls || 1;
      if (d.table?.length) {
        for (let r = 0; r < rolls; r++) {
          const e = weighted(d.table);
          if (e.item) items.push([e.item, Array.isArray(e.qty) ? randInt(e.qty[0], e.qty[1]) : e.qty || 1]);
        }
      }
      if (def.level >= 10 && chance(def.boss ? 1 / 8 : 1 / 100)) {
        const e = weighted(RARE_TABLE);
        items.push([e.item, randInt(e.qty[0], e.qty[1])]);
      }
      for (const q of questDrops) {
        if (q.monster === def.id && questActive(ctx, q.quest) && !owns(ctx, q.item) && !items.some(([i]) => i === q.item) && chance(q.chance)) {
          items.push([q.item, 1]);
          if (q.text) say(ctx, q.text, 'quest');
        }
      }
      const credit = d.credit ? randInt(d.credit[0], d.credit[1]) : 0;
      return { items, credit };
    },
    // Drop a dead monster's loot at its tile (credit goes straight to the wallet).
    dropFor(e, x = e.x, z = e.z) {
      const def = e.def;
      const { items, credit } = loot.roll(def);
      const cx = x + Math.floor((e.w || 1) / 2), cz = z + Math.floor((e.d || 1) / 2);
      for (const [id, q] of items) loot.drop(id, q, cx, cz, { owner: 'player', source: e.defId });
      if (credit > 0) {
        ctx.wallet?.credit?.(credit, `Loot: ${def.name}`, { from: def.id });
        say(ctx, `Loot: ${def.name} — +${formatMc(credit)} CREDIT to your Hood Wallet.`, 'chain');
      }
      events.emit('monster:loot', { entity: e, items, credit });
      return { items, credit };
    },
    take(e) {
      if (!ground.has(e) || !isOwnerView(e)) return false;
      const def = e.def;
      if (!ctx.inventory.canAdd([[e.defId, e.qty]])) { say(ctx, "You don't have enough inventory space.", 'warn'); return false; }
      ctx.inventory.add(e.defId, e.qty);
      const qty = e.qty;
      ground.delete(e);
      entities.remove(e);
      events.emit('loot:take', { entity: e, id: e.defId, qty });
      if (def.quest) say(ctx, `You pick up ${withArticle(e.defId).replace(/^an? /, 'the ')}.`, 'quest');
      return true;
    },
    update() {},
  };

  function spawn(id, qty, tx, tz, owner, privateTicks, ticks, source) {
    const e = entities.spawnItem(id, qty, tx, tz, { owner, ticks, privateTicks });
    ground.add(e);
    setHidden(e, !isOwnerView(e));
    events.emit('loot:drop', { entity: e, id, qty, x: tx, z: tz, owner, source });
    return e;
  }

  // Adopt ground items created elsewhere (entities.spawnItem by other modules).
  events.on('entity:add', ({ entity }) => { if (entity.kind === 'item') ground.add(entity); });
  events.on('entity:remove', ({ entity }) => { ground.delete(entity); });

  ctx.actions.register('Take', {
    approach: () => ({ onTile: true }),
    start(e) {
      if (!ground.has(e)) { say(ctx, 'Too late — it\'s gone.'); return false; }
      ctx.player.playOnce('pick', 0.8);
      loot.take(e);
      return true;
    },
  }, 'item');

  // World tick: visibility (private -> public) and despawn.
  ctx.ticks.on((n) => {
    for (const e of [...ground]) {
      if (n >= e.expires) {
        ground.delete(e);
        entities.remove(e);
        events.emit('loot:despawn', { entity: e });
        continue;
      }
      if (e.hidden && isOwnerView(e)) setHidden(e, false);
    }
  }, 50);

  return loot;
}
