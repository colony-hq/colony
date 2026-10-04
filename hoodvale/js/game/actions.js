// Interaction framework: "do <option> on <entity>" and "use <item> on <target>".
// Owner: game builder (baseline by integration). DESIGN.md §7 Actions.
//
// A handler: { approach(entity) -> goal | null, start(entity, option) -> bool,
//              tick(entity, n) -> bool (false = done), stop(entity), anim?: string }
//   approach goals: { adjacent: true } (stand next to footprint, default),
//                   { range: n } (ranged/magic), { onTile: true } (walk onto it), null (no walking)
// Registration keys: an option string ('Chop down'), optionally scoped by kind ('npc:Talk-to').
// Use-handlers: registerUse(match(itemId, target) -> bool, handler) where target is an entity or
// { kind: 'item', id, index } for item-on-item.

export function createActions(ctx) {
  const handlers = new Map();
  const useHandlers = [];
  let current = null; // { entity, option, handler, started }

  const actions = {
    get current() { return current; },
    register(option, handler, kind = null) {
      handlers.set(kind ? `${kind}:${option}` : option, handler);
    },
    registerUse(match, handler) { useHandlers.push({ match, handler }); },
    handlerFor(entity, option) {
      return handlers.get(`${entity.kind}:${option}`) || handlers.get(option) || null;
    },

    // Player chose an option on an entity (left-click default or context menu).
    perform(entity, option) {
      if (option === 'Examine') { actions.cancel(); actions.examine(entity); return true; }
      if (option === 'Walk here') { actions.cancel(); ctx.player?.walkTo(entity.x, entity.z); return true; }
      const h = actions.handlerFor(entity, option);
      if (!h) {
        ctx.events.emit('chat:game', { text: 'Nothing interesting happens.', kind: 'game' });
        return false;
      }
      actions.cancel();
      current = { entity, option, handler: h, started: false };
      const goal = h.approach ? h.approach(entity, option) : { adjacent: true };
      const begin = () => {
        if (!current || current.entity !== entity) return;
        ctx.player?.face?.(entity);
        const ok = h.start ? h.start(entity, option) !== false : true;
        if (!ok || !h.tick) { if (current?.entity === entity) current = null; return; }
        current.started = true;
      };
      if (goal === null || !ctx.player) begin();
      else ctx.player.walkToEntity(entity, goal, begin);
      ctx.events.emit('action:start', { entity, option });
      return true;
    },

    // Item used on a target (entity, or another inventory item).
    use(itemId, target, invIndex = -1) {
      for (const { match, handler } of useHandlers) {
        if (!match(itemId, target)) continue;
        actions.cancel();
        const entity = target.kind === 'item' ? null : target;
        current = { entity, option: 'Use', handler, item: itemId, invIndex, started: false };
        const begin = () => {
          if (!current) return;
          if (entity) ctx.player?.face?.(entity);
          const ok = handler.start ? handler.start(entity, 'Use', { item: itemId, invIndex, target }) !== false : true;
          if (!ok || !handler.tick) { current = null; return; }
          current.started = true;
        };
        if (!entity || handler.approach === null) begin();
        else ctx.player.walkToEntity(entity, handler.approach ? handler.approach(entity) : { adjacent: true }, begin);
        return true;
      }
      ctx.events.emit('chat:game', { text: 'Nothing interesting happens.', kind: 'game' });
      return false;
    },

    cancel() {
      if (!current) return;
      const c = current;
      current = null;
      try { c.handler.stop?.(c.entity, c.option); } catch (err) { console.error(err); }
      ctx.events.emit('action:stop', { entity: c.entity, option: c.option });
    },

    examine(entity) {
      const text = typeof entity.examine === 'function' ? entity.examine() : entity.def?.examine;
      ctx.events.emit('chat:game', { text: text || "It's a thing.", kind: 'game' });
    },
  };

  // Run the current action every tick once started (priority 15: after the player's step).
  ctx.ticks.on((n) => {
    if (!current || !current.started) return;
    const c = current;
    let keep = false;
    try { keep = c.handler.tick(c.entity, n, c) !== false; } catch (err) { console.error('[actions]', err); }
    if (!keep && current === c) { current = null; c.handler.stop?.(c.entity, c.option); }
  }, 15);

  // Walking anywhere cancels the current action (the player module calls cancel on new orders).
  return actions;
}
