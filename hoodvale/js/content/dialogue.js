// Dialogue engine: data-driven conversation trees for every NPC (and the travellers), with
// conditions and effects (dlg-lib.js), quest-aware greetings, hub topics that quests inject,
// overhead chatter, and the 'Talk-to' action. Owner: content builder.
//
// Tree format (see npc-*.js):
//   D.define(treeId, {
//     greet: [{ when, goto, p }],          // first match wins (higher p first); default 'hub'
//     nodes: { id: Node },
//     topics: [{ text, goto, when, p }],   // extra options shown in any node with hub: true
//     ambient: [text | { t, when }],       // overhead lines (npc:say) when the player is near
//   })
//   D.extend(treeId, sameShape)            // quests add greetings/nodes/topics to an NPC
// Node: { npc: text | [texts], lines: [Frame], again: text, do: effects, fail: goto,
//         options: [{ text, goto, do, fail, when, end, quiet, reply, back }], hub: bool,
//         goto | next: id | (c) => id | [{ when, goto }], end: bool, prompt }
// Frame: 'npc text' | { n: text } | { p: text } (player) | { m: text } (narration)
//        | { r: [alternatives] } | { s: npcId|name, t: text } | { do: effects } ; any + when.
// Text placeholders: dlg-lib fmt() ({name}, {npc}, {balance}, …).
//
// API: define, extend, has(treeId), start(npcEntity|npcId, {node}), converse(entity, def, fn),
//      close(), active (npcId|null), say(entity, text, {secs}), trees, contextFor(entity).
// Events out: dialogue:open {npcId}, dialogue:close {npcId}, npc:say {entity, text, secs},
//             bank:open {source}, exchange:open {source} (fallback handlers only).
// Events in:  dialogue:dismiss (UI closed the box), player:path (walking away), player:death.

import { NPCS } from '../data/npcs.js';
import { C, E, test, runEffect, fmt, pick } from './dlg-lib.js';
import { countItem, giveItem, takeItem } from './util.js';
import { registerCommon } from './npc-common.js';
import { registerBrightwater } from './npc-brightwater.js';
import { registerCountryside } from './npc-countryside.js';
import { registerHoodwood } from './npc-hoodwood.js';
import { registerGildmoor } from './npc-gildmoor.js';
import { registerFrontier } from './npc-frontier.js';

export { C, E };
const CLOSED = Symbol('closed');
const MAX_OPTIONS = 6;

export function createDialogue(ctx) {
  const { events, state } = ctx;
  const trees = new Map();
  let session = null;
  const held = new Set(); // NPC entities frozen for a conversation
  const sayCooldown = new WeakMap();

  const tree = (id) => {
    let t = trees.get(id);
    if (!t) trees.set(id, (t = { id, greet: [], nodes: {}, topics: [], ambient: [] }));
    return t;
  };
  function merge(id, def, basePriority) {
    const t = tree(id);
    for (const g of def.greet || []) t.greet.push({ p: basePriority, ...g });
    t.greet.sort((a, b) => (b.p || 0) - (a.p || 0));
    for (const [k, n] of Object.entries(def.nodes || {})) {
      if (t.nodes[k]) console.warn(`[dialogue] ${id}: node ${k} redefined`);
      t.nodes[k] = n;
    }
    for (const tp of def.topics || []) t.topics.push({ p: basePriority, ...tp });
    t.topics.sort((a, b) => (b.p || 0) - (a.p || 0));
    t.ambient.push(...(def.ambient || []));
    if (def.name) t.name = def.name;
    return t;
  }

  // ------------------------------------------------------------------ speakers & context
  const playerSpeaker = () => ({ name: state.save.name || 'You', kind: 'player', look: state.save.look });
  const npcSpeaker = (def) => ({ name: def?.name || '', kind: def?.isOracle ? 'oracle' : 'npc', npcId: def?.id, look: def?.look, role: def?.role });
  const narration = () => ({ name: '', kind: 'narration' });
  function otherSpeaker(s) {
    const d = NPCS[s];
    return d ? npcSpeaker(d) : { name: s, kind: 'npc' };
  }

  function contextFor(entity, def = entity?.def, s = null) {
    const c = {
      ctx, npc: entity, def, npcId: def?.id, session: s,
      get name() { return state.save.name || 'adventurer'; },
      get quests() { return ctx.quests; },
      count: (id, invOnly = false) => countItem(ctx, id, !invOnly),
      level: (skill) => ctx.skills?.level?.(skill) ?? 1,
      combat: () => ctx.skills?.combatLevel?.() ?? 3,
      flag: (n) => state.flag(n),
      balance: () => ctx.wallet?.balance ?? state.save.wallet?.balance ?? 0,
      give: (id, n = 1) => giveItem(ctx, id, n),
      take: (id, n = 1) => takeItem(ctx, id, n),
      say: (text) => dialogue.say(entity, text),
      open(kind, id) {
        if (s) { s.close(); s.after = () => openThing(kind, id, entity); } else openThing(kind, id, entity);
      },
      teleport(x, z) {
        const go = () => { ctx.player?.teleport?.(Math.floor(x), Math.floor(z)); };
        if (s) { s.close(); s.after = go; } else go();
      },
    };
    return c;
  }

  function openThing(kind, id, entity) {
    if (kind === 'shop') {
      if (ctx.shops?.open) ctx.shops.open(id);
      else { ctx.ui?.openShop?.(id); events.emit('shop:open', { id }); }
    } else if (kind === 'bank') openBank('dialogue');
    else if (kind === 'exchange') openExchange('dialogue');
    else if (kind === 'oracle') ctx.oracle?.consult?.(entity);
  }
  function openBank(source) {
    try { ctx.ui?.openBank?.(); } catch (err) { console.error(err); }
    events.emit('bank:open', { source });
  }
  function openExchange(source) {
    try {
      if (ctx.exchange?.open) ctx.exchange.open();
      else ctx.ui?.message?.('The Exchange is closed for stocktaking.', 'warn');
    } catch (err) { console.error(err); }
    events.emit('exchange:open', { source });
  }

  // ------------------------------------------------------------------ sessions
  function makeSession(entity, def) {
    let resolveClose;
    const closeP = new Promise((r) => { resolveClose = r; });
    const s = {
      entity, def, closed: false, visited: new Set(), after: null, closedP: closeP,
      close() { if (s.closed) return; s.closed = true; resolveClose(CLOSED); },
      async frame(speaker, text, options) {
        if (s.closed) return null;
        const ui = ctx.ui;
        if (!ui?.dialogue) {
          events.emit('chat:game', { text: `${speaker.name ? speaker.name + ': ' : ''}${text}`, kind: 'game' });
          return null;
        }
        let p;
        try { p = Promise.resolve(ui.dialogue({ speaker, text, options: options?.length ? options : undefined })); }
        catch (err) { console.error('[dialogue] ui.dialogue failed', err); s.close(); return null; }
        const r = await Promise.race([p, closeP]);
        if (r === CLOSED || r === -1) { s.close(); return null; }
        if (options?.length && (typeof r !== 'number' || r < 0 || r >= options.length)) { s.close(); return null; }
        return options?.length ? r : null;
      },
      npc(text, options) { return s.frame(npcSpeaker(def), fmt(text, s.c), options); },
      player(text) { return s.frame(playerSpeaker(), fmt(text, s.c)); },
      narrate(text) { return s.frame(narration(), fmt(text, s.c)); },
      // Options with paging when there are too many for the box.
      async choose(speaker, text, labels) {
        if (labels.length <= MAX_OPTIONS) return s.frame(speaker, text, labels);
        const per = MAX_OPTIONS - 1;
        let page = 0;
        const pages = Math.ceil(labels.length / per);
        for (;;) {
          const slice = labels.slice(page * per, page * per + per);
          const r = await s.frame(speaker, text, [...slice, page < pages - 1 ? 'More…' : 'Back…']);
          if (r == null) return null;
          if (r < slice.length) return page * per + r;
          page = (page + 1) % pages;
        }
      },
    };
    s.c = contextFor(entity, def, s);
    return s;
  }

  function hold(entity, ticks = 16) {
    if (!entity || entity.kind !== 'npc') return;
    const st = entity.state || (entity.state = {});
    if (!st.talkHold) st.talkHold = { prevBusy: !!st.busy };
    st.talkHold.until = (ctx.ticks?.count || 0) + ticks;
    st.busy = true;
    entity.path = null;
    held.add(entity);
  }
  function release(entity) {
    const st = entity?.state;
    if (!st?.talkHold) return;
    st.busy = st.talkHold.prevBusy;
    delete st.talkHold;
    held.delete(entity);
  }
  function faceEachOther(entity) {
    const p = ctx.player;
    if (!entity || !p) return;
    if (entity.kind === 'npc' && (entity.x !== p.x || entity.z !== p.z)) entity.yaw = Math.atan2(-(p.x - entity.x), -(p.z - entity.z));
    try { p.face?.(entity); } catch { /* ignore */ }
  }

  async function converse(entity, def, fn) {
    // One conversation at a time: let the previous one finish its cleanup first, so it can't
    // close the new dialogue box or release the new speaker.
    if (session) { const old = session; dialogue.close(); await old.finished; }
    def = def || entity?.def;
    const s = makeSession(entity, def);
    let finish;
    s.finished = new Promise((r) => { finish = r; });
    session = s;
    if (entity) { hold(entity, 1e9); faceEachOther(entity); }
    events.emit('dialogue:open', { npcId: def?.id || null, entity });
    try { await fn(s); }
    catch (err) { console.error('[dialogue] conversation failed', def?.id, err); }
    finally {
      const current = session === s;
      if (current) session = null;
      s.closed = true;
      if (entity) { const st = entity.state; if (st?.talkHold) st.talkHold.until = (ctx.ticks?.count || 0) + 3; }
      if (current) { try { ctx.ui?.closeDialogue?.(); } catch { /* ignore */ } }
      events.emit('dialogue:close', { npcId: def?.id || null, entity });
      finish();
      const after = s.after;
      if (after) setTimeout(() => { try { after(); } catch (err) { console.error('[dialogue] after', err); } }, 0);
    }
  }

  // ------------------------------------------------------------------ tree runner
  const resolveGoto = (g, c) => {
    if (g == null) return null;
    if (typeof g === 'string') return g;
    if (typeof g === 'function') return g(c);
    if (Array.isArray(g)) { for (const e of g) if (test(e.when, c)) return e.goto; return null; }
    return null;
  };
  function frameOf(f, def) {
    if (typeof f === 'string') return { speaker: npcSpeaker(def), text: f };
    if (typeof f === 'function') return { speaker: npcSpeaker(def), text: f };
    if (!f || typeof f !== 'object') return null;
    const base = { when: f.when, do: f.do };
    if (f.p != null) return { ...base, speaker: playerSpeaker(), text: f.p };
    if (f.n != null) return { ...base, speaker: npcSpeaker(def), text: f.n };
    if (f.m != null) return { ...base, speaker: narration(), text: f.m };
    if (f.r != null) return { ...base, speaker: npcSpeaker(def), text: f.r };
    if (f.s != null) return { ...base, speaker: otherSpeaker(f.s), text: f.t };
    return base; // effects-only frame
  }
  function framesFor(node, again, def) {
    if (again && node.again != null) return [frameOf(node.again, def)];
    const out = [];
    if (node.npc != null) for (const t of [].concat(node.npc)) out.push(frameOf(t, def));
    if (node.lines) for (const f of node.lines) out.push(frameOf(f, def));
    return out.filter(Boolean);
  }
  function optionsFor(t, node, c) {
    if (!node.options && !node.hub) return null;
    const list = [];
    if (node.hub) for (const tp of t.topics) if (test(tp.when, c)) list.push(tp);
    for (const o of node.options || []) if (test(o.when, c)) list.push(o);
    return list;
  }

  async function runTree(s, t, startId) {
    let id = startId;
    let guard = 0;
    while (id && !s.closed && guard++ < 200) {
      const node = t.nodes[id];
      if (!node) { console.warn(`[dialogue] ${t.id}: missing node "${id}"`); break; }
      const again = s.visited.has(id) || (node.hub && s.visited.has('@hub'));
      s.visited.add(id);
      if (node.hub) s.visited.add('@hub');
      if (node.do && runEffect(node.do, s.c) === false) { id = resolveGoto(node.fail, s.c); continue; }
      if (s.closed) break;
      let frames = framesFor(node, again, s.def).filter((f) => test(f.when, s.c));
      if (again && node.hub && node.again == null) frames = [{ speaker: npcSpeaker(s.def), text: t.again || ['Anything else?', 'What else?', 'Something else on your mind?'] }];
      const opts = optionsFor(t, node, s.c);
      let lastText = -1;
      frames.forEach((f, i) => { if (f.text != null) lastText = i; });
      let choice = null;
      let aborted = false;
      let asked = false;
      for (let i = 0; i < frames.length && !s.closed; i++) {
        const f = frames[i];
        if (f.do && runEffect(f.do, s.c) === false) { aborted = true; break; }
        if (s.closed || f.text == null) continue;
        const text = fmt(f.text, s.c);
        if (!text) continue;
        if (opts?.length && i === lastText) { asked = true; choice = await s.choose(f.speaker, text, opts.map((o) => fmt(o.text, s.c))); }
        else await s.frame(f.speaker, text);
      }
      if (s.closed) break;
      if (aborted) { id = resolveGoto(node.fail, s.c); continue; }
      if (opts) {
        if (!opts.length) break;
        if (!asked) choice = await s.choose(playerSpeaker(), fmt(node.prompt || 'Select an option', s.c), opts.map((o) => fmt(o.text, s.c)));
        if (choice == null || s.closed) break;
        const o = opts[choice];
        const silent = o.quiet ?? (o.end && !o.goto && !o.do);
        if (!silent) await s.frame(playerSpeaker(), fmt(o.reply ?? o.text, s.c));
        if (s.closed) break;
        if (o.do && runEffect(o.do, s.c) === false) { id = resolveGoto(o.fail, s.c); continue; }
        if (s.closed || o.end) break;
        id = resolveGoto(o.goto, s.c) ?? (o.back ? id : null);
        continue;
      }
      if (node.end) break;
      id = resolveGoto(node.goto ?? node.next, s.c);
    }
  }

  function greetFor(t, c) {
    for (const g of t.greet) if (test(g.when, c)) return resolveGoto(g.goto, c);
    return t.nodes.hub ? 'hub' : t.nodes.start ? 'start' : Object.keys(t.nodes)[0];
  }

  function resolveEntity(target) {
    if (!target) return null;
    if (typeof target === 'object') return target;
    return ctx.entities?.get?.('n:' + target) || [...(ctx.entities?.all?.() || [])].find((e) => e.kind === 'npc' && e.defId === target) || null;
  }

  // ------------------------------------------------------------------ public API
  const dialogue = {
    trees,
    define(id, def) { return merge(id, def, 0); },
    extend(id, def) { return merge(id, def, 10); },
    has(id) { return trees.has(id); },
    get active() { return session ? session.def?.id || null : null; },
    get session() { return session; },
    contextFor,
    start(target, { node = null } = {}) {
      const entity = resolveEntity(target);
      const def = entity?.def || NPCS[target];
      if (!def) return Promise.resolve();
      const t = trees.get(def.dialogue || def.id);
      return converse(entity, def, async (s) => {
        if (!t) { await s.npc(def.examine || 'They have nothing to say to you.'); return; }
        await runTree(s, t, node || greetFor(t, s.c));
      });
    },
    // Run a custom conversation (oracle consults, signposts) with the same session rules.
    converse,
    runTree,
    close() {
      if (!session) return;
      session.close();
      try { ctx.ui?.closeDialogue?.(); } catch { /* ignore */ }
    },
    hold,
    release,
    // Overhead line above an entity (UI/actors bubble it). Also stored on entity.say for polling.
    say(entity, text, { secs = 4.5 } = {}) {
      if (!entity || !text) return;
      entity.say = { text, until: Date.now() + secs * 1000 };
      events.emit('npc:say', { entity, text, secs });
    },
    ambientFor(entity) {
      const t = trees.get(entity?.def?.dialogue || entity?.defId);
      if (!t?.ambient?.length) return [];
      const c = contextFor(entity);
      return t.ambient.filter((a) => typeof a === 'string' || test(a.when, c)).map((a) => (typeof a === 'string' ? a : a.t));
    },
    update() {},
  };

  // ------------------------------------------------------------------ content
  registerCommon(dialogue);
  registerBrightwater(dialogue);
  registerCountryside(dialogue);
  registerHoodwood(dialogue);
  registerGildmoor(dialogue);
  registerFrontier(dialogue);

  // ------------------------------------------------------------------ actions
  ctx.actions?.register?.('Talk-to', {
    approach(e) { hold(e, 20); return { adjacent: true }; },
    start(e) {
      const p = ctx.player;
      const far = p && e && Math.max(Math.abs(p.x - e.x), Math.abs(p.z - e.z)) > 2;
      if (far) { p.walkToEntity(e, { adjacent: true }, () => dialogue.start(e)); return false; }
      dialogue.start(e);
      return false;
    },
  }, 'npc');

  // Fallback handlers for options other modules may not register (checked once all exist).
  // (actions.resolve() includes the game module's registerDefault() handlers.)
  events.on('game:ready', () => {
    const A = ctx.actions;
    const has = (opt) => !!(A?.resolve ? A.resolve({ kind: 'npc' }, opt) : A?.handlerFor?.({ kind: 'npc' }, opt));
    if (!A?.register) return;
    if (!has('Bank')) A.register('Bank', { approach: () => ({ adjacent: true }), start() { openBank('npc'); return false; } }, 'npc');
    if (!has('Exchange')) A.register('Exchange', { approach: () => ({ adjacent: true }), start() { openExchange('npc'); return false; } }, 'npc');
  });

  // Close the conversation when the player walks off, dies, or the UI dismisses the box.
  events.on('player:path', () => { if (session) dialogue.close(); });
  events.on('player:death', () => dialogue.close());
  events.on('dialogue:dismiss', () => dialogue.close());
  events.on('mode:change', ({ mode }) => { if (mode !== 'play') dialogue.close(); });

  // ------------------------------------------------------------------ ticks: holds + chatter
  let nextChatter = 12;
  ctx.ticks?.on?.((n) => {
    for (const e of [...held]) {
      if (session?.entity === e) continue;
      if (!e.state?.talkHold || n >= e.state.talkHold.until) release(e);
    }
    if (n < nextChatter || state.mode !== 'play' || !ctx.player) return;
    nextChatter = n + 7 + Math.floor(Math.random() * 6);
    const px = ctx.player.x, pz = ctx.player.z;
    const near = (ctx.entities?.near?.(px, pz, 13) || []).filter((e) => e.kind === 'npc' && e.alive !== false && session?.entity !== e);
    const now = Date.now();
    const ready = near.filter((e) => (sayCooldown.get(e) || 0) < now);
    if (!ready.length) return;
    const e = pick(ready);
    const lines = dialogue.ambientFor(e);
    if (!lines.length) return;
    sayCooldown.set(e, now + 25000 + Math.random() * 20000);
    dialogue.say(e, fmt(pick(lines), contextFor(e)));
  }, 90);

  return dialogue;
}
