// Interaction registry: anything the player can press "interact" on registers here.
// The nearest enabled target in range (weighted toward what the player faces) gets focus.
// ui/prompts.js renders the focus; this module only decides and dispatches.

export function createInteract(ctx) {
  const targets = new Map();
  let focus = null;

  const api = {
    get focus() { return focus; },

    // opts: { id, x, y, z | getPosition(): {x,y,z}, radius = 2.4, label: string | () => string,
    //         enabled: () => bool, onInteract: () => void, priority = 0, height = 1.6 }
    // y is the prompt anchor height (absolute world y). Returns the target record.
    add(opts) {
      const t = { radius: 2.4, priority: 0, height: 1.6, enabled: () => true, ...opts };
      if (!t.id) throw new Error('interact.add needs an id');
      targets.set(t.id, t);
      return t;
    },
    remove(id) {
      if (focus && focus.id === id) setFocus(null);
      targets.delete(id);
    },
    get(id) { return targets.get(id); },
    position(t) {
      return t.getPosition ? t.getPosition() : { x: t.x, y: t.y, z: t.z };
    },

    update() {
      const { state, input, player } = ctx;
      if (state.mode !== 'play' || !player) { if (focus) setFocus(null); return; }
      const p = player.position;
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw); // player forward (yaw 0 = -z)
      let best = null, bestScore = Infinity;
      for (const t of targets.values()) {
        if (!t.enabled()) continue;
        const q = api.position(t);
        const dx = q.x - p.x, dz = q.z - p.z, dy = q.y - (p.y + 1);
        const d = Math.hypot(dx, dz);
        if (d > t.radius || Math.abs(dy) > 3.2) continue;
        const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1; // -1..1
        const score = d * (1.35 - 0.35 * facing) - t.priority;
        if (score < bestScore) { bestScore = score; best = t; }
      }
      if (best !== focus) setFocus(best);
      if (focus && input.pressed('interact')) {
        input.consume('interact');
        const t = focus;
        ctx.events.emit('interact', { id: t.id });
        try { t.onInteract?.(); } catch (err) { console.error('[interact]', t.id, err); }
      }
    },
  };

  function setFocus(t) {
    focus = t;
    ctx.events.emit('interact:focus', { target: t });
  }

  return api;
}
