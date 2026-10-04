// Make-X loop helper for artisan skills: builds an action handler that (optionally) asks
// ctx.ui.openMake which recipe + how many, then makes one unit every `interval` ticks with an
// animation until the quantity is done, materials run out, or the player walks away.
// Owner: game builder.
//
// makeHandler(ctx, {
//   title, skill, interval, anim, approach (default adjacent; null = no walking),
//   alwaysMenu (show the picker even with one option), none (message or fn when nothing to make),
//   precheck(entity, c) -> string|null (refusal message),
//   list(entity, c) -> [{ id (item id for the icon, unique), label, reason (string|null),
//                        max() -> how many more can be made, make(c, n) -> false to stop,
//                        interval?, anim? }]
// })

import { say } from './util.js';

export function makeHandler(ctx, opts) {
  const { title, skill, interval = 3, anim = null, alwaysMenu = false } = opts;
  const approach = opts.approach === null ? null : opts.approach || (() => ({ adjacent: true }));
  return {
    approach,
    start(e, option, c) {
      const why = opts.precheck?.(e, c);
      if (why) { say(ctx, why, 'warn'); return false; }
      const recipes = opts.list(e, c) || [];
      if (!recipes.length) {
        const msg = typeof opts.none === 'function' ? opts.none(e, c) : opts.none;
        if (msg) say(ctx, msg, 'warn');
        return false;
      }
      const can = recipes.filter((r) => !r.reason && r.max() > 0);
      if (!can.length) {
        say(ctx, recipes.find((r) => r.reason)?.reason || recipes[0].missing || "You don't have the materials to make that.", 'warn');
        return false;
      }
      c.recipes = recipes;
      if (can.length === 1 && !alwaysMenu) {
        begin(c, can[0], Infinity);
        return true;
      }
      if (!ctx.ui?.openMake) { begin(c, can[0], Infinity); return true; }
      c.waiting = true;
      const items = recipes.map((r) => {
        const max = r.reason ? 0 : r.max();
        return { id: r.id, label: r.label, disabled: !!r.reason || max <= 0, reason: r.reason || (max <= 0 ? r.missing || 'Missing materials' : undefined), max };
      });
      Promise.resolve(ctx.ui.openMake({ title, skill, items }))
        .then((sel) => {
          if (ctx.actions.current !== c) return;
          c.waiting = false;
          const r = sel && recipes.find((x) => x.id === sel.id);
          if (!r || r.reason || r.max() <= 0) { ctx.actions.cancel(); return; }
          const qty = typeof sel.qty === 'number' && sel.qty > 0 ? sel.qty : Infinity;
          begin(c, r, qty);
        })
        .catch((err) => { console.error('[makex]', err); if (ctx.actions.current === c) ctx.actions.cancel(); });
      return true;
    },
    tick(e, n, c) {
      if (c.waiting) return true;
      if (!c.recipe) return false;
      if (e && e.kind === 'object' && ctx.entities.get(e.uid) !== e) {
        if (e.defId === 'fire') say(ctx, 'The fire has burnt out.');
        return false;
      }
      if (n < c.next) return true;
      const r = c.recipe;
      if (r.max() <= 0) return false;
      const res = r.make(c, n);
      c.left--;
      c.next = n + (r.interval || interval);
      if (res === false) return false;
      if (c.left <= 0) return false;
      if (r.max() <= 0) { if (r.doneText) say(ctx, r.doneText); return false; }
      return true;
    },
    stop() { ctx.player.setAnim(null); },
  };

  function begin(c, r, qty) {
    c.recipe = r;
    c.left = qty;
    c.next = ctx.ticks.count + Math.min(2, r.interval || interval);
    const a = r.anim || anim;
    if (a) ctx.player.setAnim(a);
  }
}
