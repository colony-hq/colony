// Game ticks: the world advances in 0.6 s steps (skilling rolls, combat, monster AI, movement
// steps). Rendering interpolates between ticks with `alpha`.

export const TICK_SECONDS = 0.6;

export function createTicks(events) {
  const handlers = []; // { fn, priority }
  let acc = 0;
  const ticks = {
    count: 0,
    alpha: 0, // 0..1 progress toward the next tick (for interpolation)
    paused: false,
    // Lower priority runs first: 0 input/intent, 10 player, 20 npcs/monsters, 30 combat, 50 world, 90 ui.
    on(fn, priority = 50) {
      const h = { fn, priority };
      handlers.push(h);
      handlers.sort((a, b) => a.priority - b.priority);
      return () => { const i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); };
    },
    update(dt) {
      if (ticks.paused) return;
      acc += dt;
      let guard = 0;
      while (acc >= TICK_SECONDS && guard++ < 5) {
        acc -= TICK_SECONDS;
        ticks.count++;
        for (const h of [...handlers]) {
          try { h.fn(ticks.count); } catch (err) { console.error('[ticks] handler failed', err); }
        }
        events.emit('tick', { n: ticks.count });
      }
      if (guard >= 5) acc = 0; // fell far behind (tab was hidden): drop the backlog
      ticks.alpha = acc / TICK_SECONDS;
    },
    // Run n ticks immediately (debug fast-forward).
    advance(n = 1) { for (let i = 0; i < n; i++) { acc = TICK_SECONDS; ticks.update(0); } },
  };
  return ticks;
}
