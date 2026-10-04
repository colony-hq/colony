// Quest engine for data/quests.js: stages, journal, rewards, hooks on game events and polling
// (every quest also works by inspecting inventory/XP/flags, so a missing event never blocks it).
// Owner: content builder. Each quest lives in q-*.js.
//
// Save: state.save.quests[id] = stage index | 'done' (stage 0 = "talk to the giver"; accepting
// moves to 1). Per-quest scratch data: state.save.questData[id] ({ snap, ev, ... }).
//
// API (UI): list() -> [{ id, name, status, stage, difficulty, questPoints, giver, giverName,
//             summary, canStart, steps }], journal(id) -> [{ text, done, kind, current? }],
//           points(), totalPoints, stage(id), status(id), isDone(id), isActive(id), canStart(id)
//           -> { ok, missing: [text] }, hint(id) -> { text, target } | null, tracked(),
//           rewardLines(id) -> [text], track(id).
// API (content): start(id), setStage(id, n), advance(id, from), complete(id), poll().
// Events out: quest:start {id}, quest:update {id, stage}, quest:complete {id, name, rewards,
//   points}, quest:hint {id, text, target}, chat:game {kind: 'quest'}.
// Events in (all optional): xp, monster:death, entity:death, skill:product, thieving:success,
//   item:used, player:teleport, player:enter-portal, region:enter, bank:open, archery:target,
//   inventory:change, dialogue:close, game:start, save:loaded.

import { QUESTS, QUEST_BY_ID, TOTAL_QUEST_POINTS } from '../data/quests.js';
import { ITEMS, formatCredit } from '../data/items.js';
import { SKILL_BY_ID, XP_RATE } from '../data/skills.js';
import { NPCS } from '../data/npcs.js';
import { countItem, giveItem, takeItem } from './util.js';
import intoTheVale from './q-into-the-vale.js';
import feast from './q-feast.js';
import goblinBell from './q-goblin-bell.js';
import hoodsOath from './q-hoods-oath.js';
import oraclesPrice from './q-oracles-price.js';
import bogSong from './q-bog-song.js';
import ledgerOfLies from './q-ledger-of-lies.js';
import ashenWyrm from './q-ashen-wyrm.js';

export const QUEST_MODULES = [intoTheVale, feast, goblinBell, hoodsOath, oraclesPrice, bogSong, ledgerOfLies, ashenWyrm];

// Where each giver can be found (journal text for quests not yet started).
export const GIVER_PLACES = {
  guide_elowen: "in the Guide's Hall, Brightwater",
  innkeeper_marta: 'at the Wobbly Kettle, Brightwater',
  elder_rowan: 'in the village square, Brightwater',
  robyn: 'at the Hood camp in Hoodwood',
  oracle: 'atop the Orbio Spire',
  old_wren: 'in her hut in Mistfen',
  hermit_grimsby: 'by the ruined watchtower in the Ashen Highlands',
};

const SKILL_NAME = (id) => (id === 'combat' ? 'Combat level' : SKILL_BY_ID[id]?.name || id);

export function createQuests(ctx) {
  const { state, events } = ctx;
  const S = () => state.save.quests || (state.save.quests = {});
  const QD = () => state.save.questData || (state.save.questData = {});
  const mods = new Map(QUEST_MODULES.map((m) => [m.id, m]));
  const helpers = new Map();
  let lastProgressTick = 0;
  let viaLoot = false; // quest items dropped by the loot module (loot.questDrops) instead of handed over

  // ------------------------------------------------------------------ helpers per quest
  function entityFor(npcId) {
    return ctx.entities?.get?.('n:' + npcId) || null;
  }
  function helper(mod) {
    if (helpers.has(mod.id)) return helpers.get(mod.id);
    const id = mod.id;
    const q = {
      id, ctx, mod, def: QUEST_BY_ID[id],
      get stage() { return quests.stage(id); },
      get data() { const all = QD(); return all[id] || (all[id] = {}); },
      get active() { return quests.isActive(id); },
      get viaLoot() { return viaLoot; },
      set(n) { quests.setStage(id, n); },
      advance(from, to = from + 1) {
        if (quests.stage(id) !== from) return false;
        quests.setStage(id, to);
        return true;
      },
      complete() { quests.complete(id); },
      count: (item, withEquipment = true) => countItem(ctx, item, withEquipment),
      has: (item, n = 1) => countItem(ctx, item) >= n,
      give: (item, n = 1) => giveItem(ctx, item, n),
      take: (item, n = 1) => takeItem(ctx, item, n),
      level: (skill) => ctx.skills?.level?.(skill) ?? 1,
      // XP gained in a skill since the current stage began.
      xpGained(skill) {
        const snap = q.data.snap;
        if (!snap || snap.stage !== q.stage) return 0;
        return (state.save.skills?.[skill] || 0) - (snap.xp?.[skill] || 0);
      },
      // Kills of a monster type since the current stage began (events or the stats counter).
      kills(defId) {
        const d = q.data;
        const ev = d.ev?.kills?.[defId] || 0;
        const cur = state.save.stats?.kills?.[defId] || 0;
        const base = d.snap?.stage === q.stage ? d.snap.kills?.[defId] ?? cur : cur;
        return Math.max(ev, cur - base);
      },
      products: (item) => q.data.ev?.products?.[item] || 0,
      msg(text) { events.emit('chat:game', { text, kind: 'quest' }); },
      say(npcId, text) { const e = entityFor(npcId); if (e) ctx.dialogue?.say?.(e, text); },
      entity: entityFor,
      region() { const p = ctx.player; return p ? ctx.map?.regionAt?.(p.x + 0.5, p.z + 0.5)?.id || 'overworld' : 'overworld'; },
      zone() { const p = ctx.player; return p ? ctx.map?.zoneAt?.(p.x + 0.5, p.z + 0.5) : null; },
      near(x, z, r) { const p = ctx.player; return !!p && Math.max(Math.abs(p.x - x), Math.abs(p.z - z)) <= r; },
      inArea(x0, x1, z0, z1) { const p = ctx.player; return !!p && p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1; },
      // Monster deaths may not reach us as an event: put a quest item at the player's feet or in the pack.
      reward(item, n = 1) { giveItem(ctx, item, n); },
    };
    helpers.set(id, q);
    return q;
  }

  function snapshot(id, stage) {
    const d = QD()[id] || (QD()[id] = {});
    d.snap = { stage, xp: { ...(state.save.skills || {}) }, kills: { ...(state.save.stats?.kills || {}) } };
    d.ev = { kills: {}, products: {}, hits: 0 };
    return d;
  }

  function stepFor(id, stage) {
    return mods.get(id)?.steps?.[stage] || null;
  }
  function journalText(id, stage) {
    const st = stepFor(id, stage);
    const j = st?.journal;
    const q = mods.get(id) ? helper(mods.get(id)) : null;
    if (typeof j === 'function') { try { return j(q); } catch (err) { console.error('[quests] journal', id, err); } }
    return j || QUEST_BY_ID[id]?.steps?.[stage] || '';
  }
  function hintFor(id, stage) {
    const st = stepFor(id, stage);
    if (!st) return null;
    const q = helper(mods.get(id));
    let text = typeof st.hint === 'function' ? st.hint(q) : st.hint;
    if (!text) text = journalText(id, stage);
    const target = typeof st.at === 'function' ? st.at(q) : st.at || null;
    return { text, target };
  }
  function announce(id, stage) {
    const h = hintFor(id, stage);
    if (!h) return;
    events.emit('chat:game', { text: h.text, kind: 'quest' });
    events.emit('quest:hint', { id, stage, text: h.text, target: h.target });
  }

  // ------------------------------------------------------------------ public API
  const quests = {
    defs: QUESTS,
    modules: mods,
    totalPoints: TOTAL_QUEST_POINTS,
    stage(id) { return S()[id] ?? null; },
    status(id) { const s = S()[id]; return s === 'done' ? 'done' : s == null ? 'not_started' : 'in_progress'; },
    isDone(id) { return S()[id] === 'done'; },
    isActive(id) { const s = S()[id]; return s != null && s !== 'done'; },
    points() { return QUESTS.reduce((n, q) => n + (S()[q.id] === 'done' ? q.questPoints : 0), 0); },
    canStart(id) {
      const def = QUEST_BY_ID[id];
      const missing = [];
      if (!def) return { ok: false, missing: ['Unknown quest'] };
      const r = def.requires || {};
      for (const [k, v] of Object.entries(r)) {
        if (k === 'quests') { for (const qid of v) if (!quests.isDone(qid)) missing.push(`Complete "${QUEST_BY_ID[qid]?.name || qid}"`); }
        else if (k === 'combat') { const have = ctx.skills?.combatLevel?.() ?? 3; if (have < v) missing.push(`Combat level ${v} (you have ${have})`); }
        else { const have = ctx.skills?.level?.(k) ?? 1; if (have < v) missing.push(`${SKILL_NAME(k)} ${v} (you have ${have})`); }
      }
      return { ok: !missing.length, missing };
    },
    list() {
      return QUESTS.map((q) => ({
        id: q.id, name: q.name, status: quests.status(q.id), stage: quests.stage(q.id), difficulty: q.difficulty,
        questPoints: q.questPoints, giver: q.giver, giverName: NPCS[q.giver]?.name || q.giver, summary: q.summary,
        canStart: quests.canStart(q.id).ok, steps: q.steps.length,
      }));
    },
    journal(id) {
      const def = QUEST_BY_ID[id];
      if (!def) return [];
      const st = quests.stage(id);
      const out = [];
      if (st == null) {
        out.push({ text: def.summary, done: false, kind: 'summary' });
        out.push({ text: `To start: talk to ${NPCS[def.giver]?.name || def.giver} ${GIVER_PLACES[def.giver] || ''}.`.replace(' .', '.'), done: false, kind: 'step', current: true });
        const r = def.requires || {};
        for (const [k, v] of Object.entries(r)) {
          if (k === 'quests') for (const qid of v) out.push({ text: `Requires: ${QUEST_BY_ID[qid]?.name || qid}`, done: quests.isDone(qid), kind: 'req' });
          else if (k === 'combat') out.push({ text: `Requires: Combat level ${v}`, done: (ctx.skills?.combatLevel?.() ?? 3) >= v, kind: 'req' });
          else out.push({ text: `Requires: ${SKILL_NAME(k)} ${v}`, done: (ctx.skills?.level?.(k) ?? 1) >= v, kind: 'req' });
        }
        return out;
      }
      const last = st === 'done' ? def.steps.length - 1 : st;
      for (let i = 0; i <= last; i++) {
        out.push({ text: journalText(id, i), done: st === 'done' || i < st, kind: 'step', current: st !== 'done' && i === st });
      }
      if (st === 'done') {
        const fin = mods.get(id)?.completeText;
        out.push({ text: 'QUEST COMPLETE!', done: true, kind: 'complete' });
        if (fin) out.push({ text: typeof fin === 'function' ? fin(helper(mods.get(id))) : fin, done: true, kind: 'summary' });
        for (const r of quests.rewardLines(id)) out.push({ text: r, done: true, kind: 'reward' });
      }
      return out;
    },
    hint(id) { const s = quests.stage(id); return typeof s === 'number' ? hintFor(id, s) : null; },
    // Choose which in-progress quest the HUD/map tracks.
    track(id) {
      if (!quests.isActive(id)) return false;
      QD()._tracked = id;
      state.markDirty();
      const h = hintFor(id, quests.stage(id));
      events.emit('quest:hint', { id, stage: quests.stage(id), text: h?.text || journalText(id, quests.stage(id)), target: h?.target || null });
      return true;
    },
    tracked() {
      const t = QD()._tracked;
      const id = t && quests.isActive(t) ? t : QUESTS.find((q) => quests.isActive(q.id))?.id;
      if (!id) return null;
      const s = quests.stage(id);
      const h = hintFor(id, s);
      return { id, name: QUEST_BY_ID[id].name, stage: s, text: journalText(id, s), target: h?.target || null };
    },
    rewardLines(id) {
      const def = QUEST_BY_ID[id];
      if (!def) return [];
      const r = def.rewards || {};
      const out = [`${def.questPoints} Quest Point${def.questPoints === 1 ? '' : 's'}`];
      for (const [k, v] of Object.entries(r.xp || {})) out.push(`${Math.round(v * XP_RATE).toLocaleString('en-GB')} ${SKILL_NAME(k)} XP`);
      for (const [it, n] of r.items || []) out.push(`${n > 1 ? n + ' × ' : ''}${ITEMS[it]?.name || it}`);
      if (r.credit) out.push(`${formatCredit(r.credit)} CREDIT (airdrop)`);
      for (const u of r.unlocks || []) {
        const label = { wallet_airdrop: 'Your Hood Wallet is active', honey_cake_recipe: "Marta's honey cake recipe", hood_member: 'Membership of the Hood', arcana: 'The Arcana skill', redistribution: 'The Great Redistribution', wyrmbane: 'The title "Wyrmbane"' }[u];
        if (label) out.push(label);
      }
      return out;
    },

    start(id) {
      const def = QUEST_BY_ID[id];
      if (!def || quests.stage(id) != null) return false;
      S()[id] = def.steps.length > 1 ? 1 : 0;
      QD()._tracked = id;
      snapshot(id, S()[id]);
      state.markDirty();
      const mod = mods.get(id);
      events.emit('quest:start', { id, name: def.name });
      events.emit('chat:game', { text: `Quest started: ${def.name}.`, kind: 'quest' });
      try { mod?.onStart?.(helper(mod)); } catch (err) { console.error('[quests] onStart', id, err); }
      try { mod?.onStage?.(helper(mod), S()[id]); } catch (err) { console.error('[quests] onStage', id, err); }
      events.emit('quest:update', { id, stage: S()[id] });
      announce(id, S()[id]);
      lastProgressTick = ctx.ticks?.count || 0;
      setTimeout(() => quests.poll(), 0);
      return true;
    },
    setStage(id, n) {
      const def = QUEST_BY_ID[id];
      if (!def || quests.isDone(id)) return;
      if (n >= def.steps.length) { quests.complete(id); return; }
      if (S()[id] === n) return;
      S()[id] = n;
      QD()._tracked = id;
      snapshot(id, n);
      state.markDirty();
      const mod = mods.get(id);
      try { mod?.onStage?.(helper(mod), n); } catch (err) { console.error('[quests] onStage', id, err); }
      events.emit('quest:update', { id, stage: n });
      announce(id, n);
      lastProgressTick = ctx.ticks?.count || 0;
      setTimeout(() => quests.poll(), 0);
    },
    advance(id, from) {
      if (quests.stage(id) !== from) return false;
      quests.setStage(id, from + 1);
      return true;
    },
    complete(id) {
      const def = QUEST_BY_ID[id];
      if (!def || quests.isDone(id)) return false;
      S()[id] = 'done';
      const r = def.rewards || {};
      const lines = quests.rewardLines(id);
      for (const [k, v] of Object.entries(r.xp || {})) { try { ctx.skills?.addXp?.(k, v); } catch (err) { console.error(err); } }
      for (const [it, n] of r.items || []) giveItem(ctx, it, n);
      if (r.credit) { try { ctx.wallet?.credit?.(r.credit, `Quest reward: ${def.name}`, { from: 'hood:airdrop', quest: id }); } catch (err) { console.error(err); } }
      for (const u of r.unlocks || []) state.flag('unlock:' + u, true);
      if ((r.unlocks || []).includes('hood_member')) state.flag('hood_member', true);
      const d = QD()[id] || (QD()[id] = {});
      delete d.snap; delete d.ev;
      d.completedAt = Date.now();
      if (QD()._tracked === id) delete QD()._tracked;
      state.markDirty();
      const mod = mods.get(id);
      try { mod?.onComplete?.(helper(mod)); } catch (err) { console.error('[quests] onComplete', id, err); }
      events.emit('chat:game', { text: `Congratulations! Quest complete: ${def.name}.`, kind: 'quest' });
      events.emit('chat:game', { text: `Rewards: ${lines.join(', ')}.`, kind: 'quest' });
      events.emit('quest:update', { id, stage: 'done' });
      events.emit('quest:complete', { id, name: def.name, rewards: lines, points: quests.points() });
      try { state.flush?.(true); } catch { /* ignore */ }
      return true;
    },

    // Check every active quest's conditions now.
    poll() {
      if (state.mode !== 'play' && state.mode !== 'dead') return;
      for (const mod of QUEST_MODULES) {
        if (!quests.isActive(mod.id) || !mod.poll) continue;
        const q = helper(mod);
        if (q.data.snap?.stage !== q.stage) snapshot(mod.id, q.stage);
        try { mod.poll(q); } catch (err) { console.error('[quests] poll', mod.id, err); }
      }
    },
    update() {},
  };

  // ------------------------------------------------------------------ dialogue extensions + installs
  for (const mod of QUEST_MODULES) {
    try { if (ctx.dialogue?.extend) mod.dialogue?.(ctx.dialogue, helper(mod)); } catch (err) { console.error('[quests] dialogue', mod.id, err); }
    try { mod.install?.(ctx, helper(mod)); } catch (err) { console.error('[quests] install', mod.id, err); }
  }

  // ------------------------------------------------------------------ event plumbing
  function dispatch(kind, payload) {
    for (const mod of QUEST_MODULES) {
      const fn = mod.on?.[kind];
      if (!fn) continue;
      const q = helper(mod);
      if (!quests.isActive(mod.id) && !mod.on.always) continue;
      try { fn(payload, q); } catch (err) { console.error(`[quests] ${mod.id}.${kind}`, err); }
    }
  }
  function bumpEv(field, key, n = 1) {
    for (const mod of QUEST_MODULES) {
      if (!quests.isActive(mod.id)) continue;
      const d = helper(mod).data;
      d.ev = d.ev || { kills: {}, products: {}, hits: 0 };
      d.ev[field] = d.ev[field] || {};
      d.ev[field][key] = (d.ev[field][key] || 0) + n;
    }
  }
  const recentDeaths = new Map();
  function onDeath(p) {
    const e = p?.entity || p?.target || p;
    if (!e || e.kind === 'player' || e.kind === 'remote') return;
    if (p?.killer && (p.killer.kind === 'remote')) return;
    const defId = e.defId || e.def?.id;
    if (!defId) return;
    const key = e.uid || e;
    const now = ctx.ticks?.count || 0;
    if (recentDeaths.has(key) && now - recentDeaths.get(key) < 8) return;
    recentDeaths.set(key, now);
    if (recentDeaths.size > 200) recentDeaths.clear();
    bumpEv('kills', defId);
    dispatch('kill', { defId, entity: e });
    quests.poll();
  }
  events.on('monster:death', onDeath);
  events.on('entity:death', onDeath);
  events.on('xp', (p) => { if (p?.skill && p.amount > 0) dispatch('xp', p); });
  events.on('skill:product', (p) => {
    const item = p?.item || p?.id || p?.product;
    if (item) bumpEv('products', item, p?.qty || 1);
    dispatch('product', { ...p, item });
    quests.poll();
  });
  events.on('thieving:success', (p) => {
    const e = p?.entity || p?.target || p?.npc;
    const npcId = e?.defId || e?.def?.id || p?.npcId || p?.defId || (typeof e?.id === 'string' ? e.id : null);
    dispatch('pickpocket', { ...p, npcId, entity: e });
  });
  events.on('item:used', (p) => dispatch('item', p));
  events.on('action:start', (p) => dispatch('action', p));
  let lastRegion = null;
  const onRegion = (region) => {
    if (!region || region === lastRegion) return;
    lastRegion = region;
    dispatch('region', { region });
    quests.poll();
  };
  events.on('player:teleport', (p) => onRegion(p?.region || ctx.map?.regionAt?.(p.x + 0.5, p.z + 0.5)?.id));
  events.on('region:enter', (p) => onRegion(p?.region?.id || p?.region));
  events.on('player:enter-portal', (p) => onRegion(p?.region || p?.to?.region || (p?.to ? ctx.map?.regionAt?.(p.to.x + 0.5, p.to.z + 0.5)?.id : null)));
  events.on('bank:open', (p) => { dispatch('bank', p); quests.poll(); });
  events.on('archery:target', (p) => { dispatch('target', p); quests.poll(); });
  let pollSoon = false;
  events.on('inventory:change', () => { pollSoon = true; });
  events.on('equipment:change', () => { pollSoon = true; });
  events.on('dialogue:close', () => { pollSoon = true; });

  // Quest item drops go through the loot module when it offers questDrops (dropped on the ground
  // like any loot); otherwise the quest modules hand the items over on the kill.
  events.on('game:ready', () => {
    const qd = ctx.loot?.questDrops;
    if (!Array.isArray(qd)) return;
    for (const mod of QUEST_MODULES) for (const d of mod.drops || []) {
      if (!qd.some((x) => x.monster === d.monster && x.item === d.item)) qd.push({ quest: mod.id, chance: 1, ...d });
    }
    viaLoot = true;
  });

  // Returning players: remind them of the tracked quest; new players: point at Elowen.
  events.on('game:start', () => {
    lastRegion = null;
    setTimeout(() => {
      if (state.mode !== 'play') return;
      if (quests.stage('into_the_vale') == null) {
        const name = state.save.name || 'adventurer';
        events.emit('chat:game', { text: `Welcome to Hoodvale, ${name}! Guide Elowen is waiting for you in the Guide's Hall, just north-west of the village square. Click her to talk.`, kind: 'quest' });
        events.emit('quest:hint', { id: 'into_the_vale', stage: null, text: 'Talk to Guide Elowen in the Guide\'s Hall.', target: { x: 177, z: 241 } });
        const el = entityFor('guide_elowen');
        if (el) ctx.dialogue?.say?.(el, `${name}! Over here, in the Guide's Hall!`, { secs: 6 });
      } else {
        const t = quests.tracked();
        if (t) {
          events.emit('chat:game', { text: `Current quest — ${t.name}: ${t.text}`, kind: 'quest' });
          events.emit('quest:hint', { id: t.id, stage: t.stage, text: t.text, target: t.target });
        }
      }
    }, 2500);
  });

  // Poll every 2 ticks (and soon after inventory changes). The tutorial repeats its hint if the
  // player seems stuck for ~90 s.
  ctx.ticks?.on?.((n) => {
    if (state.mode !== 'play') return;
    if (pollSoon || n % 2 === 0) { pollSoon = false; quests.poll(); }
    const s = quests.stage('into_the_vale');
    if (typeof s === 'number' && n - lastProgressTick > 150 && !ctx.dialogue?.active) {
      lastProgressTick = n;
      announce('into_the_vale', s);
    }
  }, 90);

  return quests;
}
