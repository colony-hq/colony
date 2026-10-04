// In-page test harness for the game builder's smoke runs. Load with:
//   {"eval": "fetch('/.qa/game-harness.js').then(r=>r.text()).then(t=>{(0,eval)(t);return 'ok'})"}
// Then call T.* from later eval steps. Everything is synchronous (fastForward simulates frames).
(() => {
  const hv = window.__hv;
  const ctx = hv.ctx;
  const log = [];
  ctx.events.on('chat:game', (m) => log.push(m.text));
  const evs = {};
  for (const name of ['skill:product', 'monster:death', 'player:death', 'player:respawn', 'thieving:success', 'thieving:fail', 'fire:lit', 'loot:drop', 'loot:take', 'combat:hit', 'boss:special', 'player:enter-portal', 'item:used', 'pouch:open', 'spell:cast', 'combat:projectile', 'fishing:move', 'archery:target']) {
    evs[name] = 0;
    ctx.events.on(name, () => { evs[name]++; });
  }
  const P = () => ctx.player;
  const T = {
    ctx, log, evs,
    msgs(n = 12) { return log.slice(-n); },
    clearLog() { log.length = 0; },
    inv() { const o = {}; for (const e of ctx.inventory.slots) if (e) o[e.id] = (o[e.id] || 0) + e.qty; return o; },
    clearInv() { ctx.state.save.inventory.fill(null); ctx.events.emit('inventory:change', {}); },
    give(list) { for (const [id, q] of list) ctx.inventory.add(id, q); return T.inv(); },
    near(defId, from = P(), pred = () => true) {
      let best = null, bd = Infinity;
      for (const e of ctx.entities.all()) {
        if (e.defId !== defId || !pred(e)) continue;
        const d = Math.max(Math.abs(e.x - from.x), Math.abs(e.z - from.z));
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },
    tp(x, z) { const w = ctx.map.nearestWalkable(x, z, 6) || { x, z }; P().teleport(w.x, w.z); return [P().x, P().z]; },
    run(s) { return hv.fastForward(s); },
    ticks(n) { hv.ticks(n); },
    // Answer the next make-X dialog(s) automatically.
    autoMake(id = null, qty = 28) {
      ctx.ui.openMake = (o) => {
        const pick = id ? o.items.find((i) => i.id === id) : o.items.find((i) => !i.disabled);
        T.lastMake = o.items.map((i) => `${i.id}${i.disabled ? '(x:' + i.reason + ')' : ''}`);
        return Promise.resolve(pick ? { id: pick.id, qty } : null);
      };
    },
    state() {
      return { pos: [P().x, P().z], region: P().region, hp: ctx.state.save.hp, mode: ctx.state.mode, cur: ctx.actions.current?.option || null, credit: ctx.wallet.balance, target: ctx.combat.target?.name || null };
    },
    xp() { const o = {}; for (const id of ctx.skills.SKILL_IDS) { const x = ctx.skills.xp(id); if (x && id !== 'hitpoints') o[id] = Math.round(x); } o.hitpoints = Math.round(ctx.skills.xp('hitpoints')); return o; },
    errors: [],
  };
  window.addEventListener('error', (e) => T.errors.push(String(e.message)));
  window.T = T;
})();
