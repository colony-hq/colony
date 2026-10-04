// Interaction framework: "do <option> on <entity>" and "use <item> on <target>".
// Owner: game builder. DESIGN.md §7 Actions.
//
// A handler: { approach(entity, option) -> goal | null, start(entity, option, c) -> bool,
//              tick(entity, n, c) -> bool (false = done), stop(entity, option, c) }
//   approach goals: { adjacent: true } (stand next to footprint, default; add diagonal: false
//                   for cardinal-only), { range: n } (ranged/magic), { onTile: true } (walk onto
//                   it), null (no walking: start immediately).
//   c is the per-invocation record { entity, option, handler, started, item?, invIndex?, target? }
//   — handlers keep their own per-run state on it (make-X choice, next roll tick, ...).
// Registration keys: an option string ('Chop down'), optionally scoped by kind ('npc:Talk-to').
// Lookup order: scoped, unscoped, then registerDefault() fallbacks (so content/net/ui modules
// that register an option always win over the game module's defaults). handlerFor() only sees
// explicit registrations; resolve() is what perform() runs (including defaults).
// Use-handlers: registerUse(match(itemId, target) -> bool, handler) where target is an entity or
// { kind: 'item', id, index } for item-on-item. Later registrations are tried first.
//
// Events: action:start {entity, option}, action:stop {entity, option}, item:used {item, target,
//         targetId}, player:click {x, z, kind: 'walk'|'action', entity?}.

import { say } from './util.js';
import { installUtilities } from './utilities.js';
import { createItemOps } from './itemops.js';

export function createActions(ctx) {
  const handlers = new Map();
  const defaults = new Map();
  const useHandlers = [];
  let current = null;

  const goalOf = (h, entity, option) => (h.approach === null ? null : h.approach ? h.approach(entity, option) : { adjacent: true });

  // Is the player already where `goal` wants it to be (relative to the entity's footprint)?
  function reached(entity, goal) {
    if (!goal || !ctx.player) return true;
    const p = ctx.player;
    const fx = entity.x, fz = entity.z, fw = entity.w || 1, fd = entity.d || 1;
    const dx = Math.max(fx - p.x, 0, p.x - (fx + fw - 1)), dz = Math.max(fz - p.z, 0, p.z - (fz + fd - 1));
    if (goal.onTile && ctx.map.isWalkable(fx, fz)) return dx === 0 && dz === 0;
    if (goal.range != null) return Math.max(dx, dz) <= goal.range && Math.max(dx, dz) >= 1 && ctx.map.lineOfSight(p.x, p.z, fx, fz);
    if (dx === 0 && dz === 0) return false;
    if (goal.diagonal === false) return (dx === 1 && dz === 0) || (dx === 0 && dz === 1);
    return dx <= 1 && dz <= 1;
  }

  function blockedReason() {
    if (ctx.state.mode === 'dead') return 'dead';
    if (ctx.player?.stunned) return "You're stunned!";
    return null;
  }

  const actions = {
    get current() { return current; },
    register(option, handler, kind = null) {
      handlers.set(kind ? `${kind}:${option}` : option, handler);
    },
    // Fallback handler used only when no module registered the option.
    registerDefault(option, handler, kind = null) {
      defaults.set(kind ? `${kind}:${option}` : option, handler);
    },
    registerUse(match, handler) { useHandlers.unshift({ match, handler }); },
    // Explicitly registered handler (other modules use this to decide whether to install theirs).
    handlerFor(entity, option) {
      const k = `${entity.kind}:${option}`;
      return handlers.get(k) || handlers.get(option) || null;
    },
    // What perform() will actually run: registrations first, then the game's defaults.
    resolve(entity, option) {
      const k = `${entity.kind}:${option}`;
      return actions.handlerFor(entity, option) || defaults.get(k) || defaults.get(option) || null;
    },
    reached,

    // Player chose an option on an entity (left-click default or context menu).
    perform(entity, option) {
      if (!entity) return false;
      if (option === 'Examine') { actions.examine(entity); return true; }
      if (option === 'Walk here') { ctx.player?.walkTo(entity.x, entity.z); return true; }
      const why = blockedReason();
      if (why) { if (why !== 'dead') say(ctx, why, 'warn'); return false; }
      const h = actions.resolve(entity, option);
      if (!h) {
        say(ctx, 'Nothing interesting happens.');
        return false;
      }
      actions.cancel();
      const c = { entity, option, handler: h, started: false, tries: 0 };
      current = c;
      // NPCs stop wandering when the player heads over to them.
      if (entity.kind === 'npc') { entity.state.holdUntil = ctx.ticks.count + 12; entity.path = null; }
      if (entity.kind !== 'player') ctx.events.emit('player:click', { x: entity.x + (entity.w || 1) / 2, z: entity.z + (entity.d || 1) / 2, kind: 'action', entity });
      const goal = goalOf(h, entity, option);
      const begin = () => {
        if (current !== c) return;
        // Moving targets (NPCs, monsters, drifting fishing spots) may have moved while we
        // approached, or the goal was unreachable and we only got close: try again, then give up.
        if (goal && !reached(entity, goal)) {
          if (c.tries++ < 6) { if (ctx.player.walkToEntity(entity, goal, begin)) return; } // (setPath says "I can't reach that.")
          else say(ctx, "I can't reach that.", 'warn');
          if (current === c) current = null;
          return;
        }
        if (entity.kind !== 'item') ctx.player?.face?.(entity);
        if (entity.kind === 'npc') { entity.state.holdUntil = ctx.ticks.count + 8; faceEntity(entity, ctx.player.entity); }
        let ok = false;
        try { ok = h.start ? h.start(entity, option, c) !== false : true; } catch (err) { console.error('[actions] start', option, err); }
        if (current !== c) return;
        if (!ok || !h.tick) { current = null; if (ok) h.stop?.(entity, option, c); return; }
        c.started = true;
      };
      ctx.events.emit('action:start', { entity, option });
      if (goal === null || !ctx.player) begin();
      else if (!ctx.player.walkToEntity(entity, goal, begin) && current === c) current = null;
      return true;
    },

    // Item used on a target (entity, or another inventory item { kind: 'item', id, index }).
    use(itemId, target, invIndex = -1) {
      if (!target) return false;
      const why = blockedReason();
      if (why) { if (why !== 'dead') say(ctx, why, 'warn'); return false; }
      for (const { match, handler } of useHandlers) {
        let ok = false;
        try { ok = match(itemId, target); } catch { ok = false; }
        if (!ok) continue;
        actions.cancel();
        const entity = target.kind === 'item' ? null : target;
        const c = { entity, option: 'Use', handler, item: itemId, invIndex, target, started: false };
        current = c;
        const begin = () => {
          if (current !== c) return;
          if (entity) ctx.player?.face?.(entity);
          let started = false;
          try { started = handler.start ? handler.start(entity, 'Use', c) !== false : true; } catch (err) { console.error('[actions] use', itemId, err); }
          if (current !== c) return;
          if (started) ctx.events.emit('item:used', { item: itemId, target, targetId: target.kind === 'item' ? target.id : target.defId });
          if (!started || !handler.tick) { current = null; if (started) handler.stop?.(entity, 'Use', c); return; }
          c.started = true;
        };
        if (entity) ctx.events.emit('player:click', { x: entity.x + (entity.w || 1) / 2, z: entity.z + (entity.d || 1) / 2, kind: 'action', entity });
        if (!entity || handler.approach === null) begin();
        else if (!ctx.player.walkToEntity(entity, handler.approach ? handler.approach(entity) : { adjacent: true }, begin) && current === c) current = null;
        return true;
      }
      say(ctx, 'Nothing interesting happens.');
      return false;
    },

    cancel() {
      if (!current) return;
      const c = current;
      current = null;
      try { c.handler.stop?.(c.entity, c.option, c); } catch (err) { console.error(err); }
      ctx.events.emit('action:stop', { entity: c.entity, option: c.option });
    },

    examine(entity) {
      const text = typeof entity.examine === 'function' ? entity.examine() : entity.def?.examine;
      say(ctx, text || "It's a thing.");
    },
  };

  function faceEntity(e, target) {
    if (!target) return;
    const dx = target.x - e.x, dz = target.z - e.z;
    if (dx || dz) e.yaw = Math.atan2(-dx, -dz);
  }

  // Run the current action every tick once started (priority 15: after the player's step).
  ctx.ticks.on((n) => {
    if (!current || !current.started) return;
    const c = current;
    let keep = false;
    try { keep = c.handler.tick(c.entity, n, c) !== false; } catch (err) { console.error('[actions]', c.option, err); }
    if (!keep && current === c) {
      current = null;
      try { c.handler.stop?.(c.entity, c.option, c); } catch (err) { console.error(err); }
      ctx.events.emit('action:stop', { entity: c.entity, option: c.option });
    }
  }, 15);

  // Inventory item options API (ctx.game) + default utility handlers (bank, portals, signs...).
  ctx.game = createItemOps(ctx, actions);
  installUtilities(ctx, actions);
  return actions;
}
