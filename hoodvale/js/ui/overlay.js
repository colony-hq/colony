// World-anchored overlay on #overlay: hitsplats (red hit / blue miss / green heal / amber burn),
// health bars over anything in combat, overhead chat (npc:say, public chat, your own lines) and
// remote player nameplates. Owner: ui builder.

import { injectStyle, h } from '../core/dom.js';
import { esc, headHeight, projector, safe } from './util.js';

const splatSvg = (fill, edge) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 36'><path d='M20 1.5c2.6 0 3.4 3.6 5.6 4.2 2.4.6 5-2.4 7.2-1 2.1 1.4.2 4.6 1.6 6.6 1.3 1.9 5.1 1.6 5.6 4 .5 2.5-3 3.6-3 6s3.4 3.6 2.8 6c-.6 2.5-4.4 1.8-5.9 3.6-1.5 1.8 0 5.2-2.2 6.2-2.3 1-4.3-2.2-6.8-1.9-2.4.3-3.3 3.9-5.8 3.9s-3.4-3.6-5.8-3.9c-2.5-.3-4.5 2.9-6.8 1.9-2.2-1-.7-4.4-2.2-6.2-1.5-1.8-5.3-1.1-5.9-3.6-.6-2.4 2.8-3.6 2.8-6s-3.5-3.5-3-6c.5-2.4 4.3-2.1 5.6-4 1.4-2-.5-5.2 1.6-6.6 2.2-1.4 4.8 1.6 7.2 1 2.2-.6 3-4.2 5.6-4.2z' fill='${fill}' stroke='${edge}' stroke-width='1.6'/><ellipse cx='15' cy='11' rx='7' ry='3.5' fill='white' opacity='.22'/></svg>`)}")`;

const CSS = `
.u-ov { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.u-ov.off { display: none; }
.u-tr { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform; }
.u-hpbar { position: absolute; left: -17px; top: -6px; width: 34px; height: 5px; background: #c0140c; box-shadow: 0 0 0 1px #000; display: none; }
.u-hpbar > i { display: block; height: 100%; background: linear-gradient(180deg, #5cf04a, #1fa018); transition: width .25s; }
.u-tr.hb .u-hpbar { display: block; }
.u-splat { position: absolute; width: 30px; height: 27px; margin: -13px 0 0 -15px; display: grid; place-items: center; background-size: 100% 100%;
  font: 800 13px/1 var(--font-mono); color: #fff; text-shadow: 1px 1px 0 #000, -1px -1px 0 rgba(0,0,0,.6), 0 0 3px #000; animation: u-splat 1.1s var(--ease) forwards; }
.u-splat.hit { background-image: ${splatSvg('#c8161a', '#3a0303')}; }
.u-splat.miss { background-image: ${splatSvg('#2563c8', '#071a3a')}; }
.u-splat.heal { background-image: ${splatSvg('#2aa83a', '#06300a')}; }
.u-splat.burn { background-image: ${splatSvg('#e07a10', '#3a1a02')}; }
.u-splat.max { font-size: 14px; color: #fff3a0; }
@keyframes u-splat { 0% { transform: scale(.4); opacity: 0; } 12% { transform: scale(1.15); opacity: 1; } 22% { transform: scale(1); } 80% { opacity: 1; } 100% { transform: translateY(-6px); opacity: 0; } }
.u-say { position: absolute; left: 0; bottom: 4px; transform: translateX(-50%); width: max-content; max-width: 240px; text-align: center;
  font: 700 14px/1.2 var(--font-body); color: #ffff20; text-shadow: 1px 1px 0 #000, -1px 0 0 #000, 0 -1px 0 #000, 0 0 4px rgba(0,0,0,.8); }
.u-say.pub { color: #ffff20; }
.u-say.npc { color: #ffff20; }
.u-say.oracle { color: #c6b6ff; }
.u-name { position: absolute; left: 0; top: -22px; transform: translateX(-50%); white-space: nowrap; font: 600 12px/1 var(--font-body); color: #fff; text-shadow: 1px 1px 0 #000, 0 0 3px #000; }
.u-name small { color: #ffd34d; }
`;

const SPLAT_OFFSETS = [[0, 0], [0, -22], [-17, 12], [17, 12]];

export function createOverlay(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-overlay', CSS);
  const root = h('div.u-ov.off');
  U.roots.overlay.append(root);
  const project = projector(ctx);
  const trackers = new Map(); // entity -> tracker
  const remotes = new Set();
  events.on('entity:add', ({ entity }) => { if (entity?.kind === 'remote') remotes.add(entity); });
  events.on('entity:remove', ({ entity }) => remotes.delete(entity));
  events.on('game:start', () => { remotes.clear(); for (const e of safe(() => ctx.entities.byKind('remote'), [])) remotes.add(e); });

  function tracker(e) {
    let t = trackers.get(e);
    if (t) return t;
    const el = h('div.u-tr');
    const bar = h('div.u-hpbar'); const fill = h('i'); bar.append(fill);
    const splats = h('div.u-tr');
    el.append(bar);
    root.append(el, splats);
    t = { e, el, bar, fill, splats, hitUntil: 0, sayEl: null, sayUntil: 0, nameEl: null, live: [], lastHp: null };
    trackers.set(e, t);
    return t;
  }
  function drop(t) { t.el.remove(); t.splats.remove(); trackers.delete(t.e); }

  function hpOf(e) {
    if (e === ctx.player?.entity || e.kind === 'player') return [safe(() => ctx.player.hp, 0), safe(() => ctx.player.maxHp, 10)];
    const hp = e.hp ?? e.state?.hp, max = e.maxHp ?? e.def?.hp;
    return hp != null && max ? [hp, max] : null;
  }

  const ov = {
    hitsplat(e, amount, type = 'hit') {
      if (!e) return;
      const t = tracker(e);
      const now = performance.now();
      t.live = t.live.filter((s) => s.until > now);
      if (t.live.length >= 4) { const old = t.live.shift(); old.el.remove(); }
      const used = new Set(t.live.map((s) => s.slot));
      let slot = 0; while (used.has(slot) && slot < 3) slot++;
      const [ox, oy] = SPLAT_OFFSETS[slot];
      const kind = type === 'miss' || (type === 'hit' && !amount) ? 'miss' : type === 'heal' ? 'heal' : type === 'burn' ? 'burn' : 'hit';
      const el = h('div.u-splat.' + kind, { text: String(Math.max(0, Math.round(amount || 0))), style: { left: ox + 'px', top: oy + 'px' } });
      t.splats.append(el);
      const s = { el, slot, until: now + 1100 };
      t.live.push(s);
      setTimeout(() => { el.remove(); }, 1150);
      if (kind !== 'heal') t.hitUntil = now + 6500;
      else if (t.hitUntil > now) t.hitUntil = Math.max(t.hitUntil, now + 3000);
    },
    say(e, text, { secs = 4, kind = 'pub' } = {}) {
      if (!e || !text) return;
      const t = tracker(e);
      if (!t.sayEl) { t.sayEl = h('div.u-say'); t.el.append(t.sayEl); }
      t.sayEl.className = 'u-say ' + kind;
      t.sayEl.textContent = String(text).slice(0, 120);
      t.sayUntil = performance.now() + Math.max(1.5, secs) * 1000;
    },
    clear() { for (const t of [...trackers.values()]) drop(t); },
    update() {
      const show = state.mode === 'play' || state.mode === 'dead' || state.mode === 'cutscene';
      root.classList.toggle('off', !show);
      if (!show) return;
      const now = performance.now();
      // Nameplates for remote players.
      if (state.settings.showNames !== false) {
        for (const e of remotes) {
          if (!e.alive || e.hidden) continue;
          const t = tracker(e);
          if (!t.nameEl) { t.nameEl = h('div.u-name'); t.el.append(t.nameEl); }
          const lvl = e.combatLevel || e.level;
          const html = `${esc(e.name || 'Adventurer')}${lvl ? ` <small>(${lvl})</small>` : ''}`;
          if (t.nameEl._h !== html) { t.nameEl._h = html; t.nameEl.innerHTML = html; }
          t.nameUntil = now + 500;
        }
      }
      for (const t of trackers.values()) {
        const e = t.e;
        const gone = e.alive === false && !t.live.length;
        const hasHit = t.hitUntil > now || (e.combatUntil != null && e.combatUntil > (ctx.ticks?.count || 0) && e.alive !== false), hasSay = t.sayUntil > now, hasSplat = t.live.some((s) => s.until > now), hasName = t.nameUntil > now;
        if (gone || (!hasHit && !hasSay && !hasSplat && !hasName) || !e.pos) { drop(t); continue; }
        const hh = headHeight(e);
        const p = project(e.pos.x, e.pos.y + hh + 0.25, e.pos.z);
        if (!p || e.hidden) { t.el.style.display = 'none'; t.splats.style.display = 'none'; continue; }
        t.el.style.display = '';
        t.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
        if (hasSplat) {
          const b = project(e.pos.x, e.pos.y + hh * 0.55, e.pos.z) || p;
          t.splats.style.display = '';
          t.splats.style.transform = `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0)`;
        } else t.splats.style.display = 'none';
        const hp = hasHit ? hpOf(e) : null;
        t.el.classList.toggle('hb', !!hp);
        if (hp) {
          const f = Math.max(0, Math.min(1, hp[0] / hp[1]));
          if (t.lastHp !== f) { t.lastHp = f; t.fill.style.width = (f * 100).toFixed(1) + '%'; }
        }
        if (t.sayEl) { t.sayEl.style.display = hasSay ? '' : 'none'; t.sayEl.style.bottom = (hp ? 10 : 4) + 'px'; }
        if (t.nameEl) t.nameEl.style.display = hasName && !hasSay ? '' : 'none';
      }
    },
  };

  events.on('combat:hit', ({ target, amount, type }) => ov.hitsplat(target, amount, type));
  events.on('npc:say', ({ entity, text, secs, npcId, uid }) => {
    let e = entity;
    if (!e && uid) e = safe(() => ctx.entities.get(uid), null);
    if (!e && npcId) e = safe(() => ctx.entities.byKind('npc').find((n) => n.defId === npcId), null);
    if (e) ov.say(e, text, { secs: secs || 4, kind: e.def?.isOracle || e.defId === 'oracle' ? 'oracle' : 'npc' });
  });
  events.on('chat:public', ({ from, text, peer, entity }) => {
    let e = entity;
    if (!e && peer != null) e = safe(() => ctx.entities.byKind('remote').find((r) => r.peer === peer || r.peerId === peer || r.uid === peer || r.uid === 'r:' + peer), null);
    if (!e && from) e = safe(() => ctx.entities.byKind('remote').find((r) => r.name === from), null);
    if (e) ov.say(e, text, { secs: 5, kind: 'pub' });
  });
  events.on('entity:remove', ({ entity }) => { const t = trackers.get(entity); if (t) drop(t); });
  events.on('player:teleport', () => { const t = trackers.get(ctx.player?.entity); if (t) t.hitUntil = 0; });
  return ov;
}
