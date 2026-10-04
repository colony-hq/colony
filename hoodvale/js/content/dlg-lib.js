// Dialogue toolkit: conditions (C), effects (E) and text formatting shared by every dialogue
// tree, quest and the Oracle. Owner: content builder. Pure (no DOM, no three) so node can import
// it for the content checks in .qa/.
//
// A condition is a function (c) => bool, or an object form:
//   { quest: id, stage: n } | { done: id } | { started: id } | { notStarted: id } | { has: [id, n] }
//   | { level: [skill, n] } | { combat: n } | { flag: name } | { balance: mc } | { not: cond }
//   | { all: [conds] } | { any: [conds] } | [conds] (all)
// An effect is a function (c) => any (returning false aborts the rest and takes the `fail` path),
// or an object form: { give: [id, n] } | { take: [id, n] } | { credit: [mc, memo] }
//   | { debit: [mc, memo] } | { start: id } | { stage: [id, n] } | { complete: id }
//   | { flag: [name, value] } | { open: 'shop'|'bank'|'exchange', id } | { teleport: [x, z] }
//   | { xp: [skill, base] } | { msg: text } | { say: text }
//
// `c` (the dialogue context) is built by dialogue.js: { ctx, npc, def, npcId, quests, count(id),
// level(skill), combat(), flag(name), balance(), give(id, n), take(id, n), open(kind, id),
// teleport(x, z), say(text), name }.

import { formatCredit } from '../data/items.js';

const stageOf = (c, id) => c.quests?.stage?.(id) ?? null;
const isDone = (c, id) => stageOf(c, id) === 'done';
const isActive = (c, id) => { const s = stageOf(c, id); return s != null && s !== 'done'; };

export const C = {
  stage: (id, n) => (c) => stageOf(c, id) === n,
  stageIn: (id, ...ns) => (c) => ns.includes(stageOf(c, id)),
  // At or beyond stage n (counts 'done').
  reached: (id, n) => (c) => { const s = stageOf(c, id); return s === 'done' || (typeof s === 'number' && s >= n); },
  before: (id, n) => (c) => { const s = stageOf(c, id); return s == null || (typeof s === 'number' && s < n); },
  started: (id) => (c) => isActive(c, id),
  notStarted: (id) => (c) => stageOf(c, id) == null,
  done: (id) => (c) => isDone(c, id),
  notDone: (id) => (c) => !isDone(c, id),
  has: (item, n = 1) => (c) => c.count(item) >= n,
  lacks: (item, n = 1) => (c) => c.count(item) < n,
  level: (skill, n) => (c) => c.level(skill) >= n,
  below: (skill, n) => (c) => c.level(skill) < n,
  combat: (n) => (c) => c.combat() >= n,
  flag: (name, v = true) => (c) => (c.flag(name) ?? false) === v,
  noFlag: (name) => (c) => !c.flag(name),
  balance: (mc) => (c) => c.balance() >= mc,
  poor: (mc) => (c) => c.balance() < mc,
  npc: (...ids) => (c) => ids.includes(c.npcId),
  hood: () => (c) => !!(c.flag('hood_member') || isDone(c, 'hoods_oath')),
  chance: (p) => () => Math.random() < p,
  not: (f) => (c) => !test(f, c),
  all: (...fs) => (c) => fs.every((f) => test(f, c)),
  any: (...fs) => (c) => fs.some((f) => test(f, c)),
  // True the first time only (per save); marks itself seen when the node runs E.seen(key).
  unseen: (key) => (c) => !c.flag('seen:' + key),
  seen: (key) => (c) => !!c.flag('seen:' + key),
};

export function test(cond, c) {
  if (cond == null) return true;
  if (typeof cond === 'function') { try { return !!cond(c); } catch (err) { console.error('[dialogue] condition failed', err); return false; } }
  if (Array.isArray(cond)) return cond.every((x) => test(x, c));
  if (typeof cond !== 'object') return !!cond;
  if ('quest' in cond) return 'stage' in cond ? stageOf(c, cond.quest) === cond.stage : isActive(c, cond.quest);
  if ('done' in cond) return isDone(c, cond.done);
  if ('started' in cond) return isActive(c, cond.started);
  if ('notStarted' in cond) return stageOf(c, cond.notStarted) == null;
  if ('has' in cond) { const [id, n = 1] = [].concat(cond.has); return c.count(id) >= n; }
  if ('level' in cond) return c.level(cond.level[0]) >= cond.level[1];
  if ('combat' in cond) return c.combat() >= cond.combat;
  if ('flag' in cond) return !!c.flag(cond.flag);
  if ('balance' in cond) return c.balance() >= cond.balance;
  if ('not' in cond) return !test(cond.not, c);
  if ('all' in cond) return cond.all.every((x) => test(x, c));
  if ('any' in cond) return cond.any.some((x) => test(x, c));
  return true;
}

export const E = {
  give: (id, n = 1) => (c) => { c.give(id, n); },
  take: (id, n = 1) => (c) => c.take(id, n),
  credit: (mc, memo) => (c) => { c.ctx.wallet?.credit?.(mc, fmt(memo, c)); },
  debit: (mc, memo) => (c) => !!c.ctx.wallet?.debit?.(mc, fmt(memo, c)),
  start: (id) => (c) => c.quests.start(id) !== false,
  stage: (id, n) => (c) => { c.quests.setStage(id, n); },
  complete: (id) => (c) => { c.quests.complete(id); },
  flag: (name, v = true) => (c) => { c.ctx.state.flag(name, v); },
  seen: (key) => (c) => { c.ctx.state.flag('seen:' + key, true); },
  shop: (id) => (c) => { c.open('shop', id); },
  bank: () => (c) => { c.open('bank'); },
  exchange: () => (c) => { c.open('exchange'); },
  consult: () => (c) => { c.open('oracle'); },
  teleport: (x, z) => (c) => { c.teleport(x, z); },
  xp: (skill, base) => (c) => { c.ctx.skills?.addXp?.(skill, base); },
  msg: (text, kind = 'game') => (c) => { c.ctx.events.emit('chat:game', { text: fmt(text, c), kind }); },
  say: (text) => (c) => { c.say(fmt(text, c)); },
  // Swap items: take all of `from` ([[id, n]...]) and give `to`; fails (false) if anything is missing.
  trade: (from, to) => (c) => {
    for (const [id, n] of from) if (c.count(id, true) < n) return false;
    for (const [id, n] of from) c.take(id, n);
    for (const [id, n] of to) c.give(id, n);
    return true;
  },
  run: (fn) => fn,
};

export function runEffect(eff, c) {
  if (eff == null) return true;
  if (typeof eff === 'function') return eff(c);
  if (Array.isArray(eff)) { for (const e of eff) if (runEffect(e, c) === false) return false; return true; }
  if (typeof eff !== 'object') return true;
  if (eff.give) return E.give(...[].concat(eff.give))(c);
  if (eff.take) return E.take(...[].concat(eff.take))(c);
  if (eff.credit) return E.credit(...[].concat(eff.credit))(c);
  if (eff.debit) return E.debit(...[].concat(eff.debit))(c);
  if (eff.start) return E.start(eff.start)(c);
  if (eff.stage) return E.stage(...eff.stage)(c);
  if (eff.complete) return E.complete(eff.complete)(c);
  if (eff.flag) return E.flag(...[].concat(eff.flag))(c);
  if (eff.open) return c.open(eff.open, eff.id);
  if (eff.teleport) return E.teleport(...eff.teleport)(c);
  if (eff.xp) return E.xp(...eff.xp)(c);
  if (eff.msg) return E.msg(eff.msg, eff.kind)(c);
  if (eff.say) return E.say(eff.say)(c);
  return true;
}

export const credit = (mc) => formatCredit(mc) + ' CREDIT';

// Text: string | (c) => string | [alternatives] (one picked at random). Placeholders:
// {name} player, {npc} speaking NPC, {balance}, {combat}, {qp}, {height} (chain block), {total}.
export function fmt(t, c) {
  if (typeof t === 'function') t = t(c);
  if (Array.isArray(t)) t = t[Math.floor(Math.random() * t.length)];
  if (t == null) return '';
  return String(t).replace(/\{(\w+)\}/g, (m, k) => {
    try {
      switch (k) {
        case 'name': return c?.name ?? 'adventurer';
        case 'npc': return c?.def?.name ?? 'stranger';
        case 'first': return String(c?.def?.name ?? '').split(' ').pop();
        case 'balance': return credit(c?.balance?.() ?? 0);
        case 'combat': return String(c?.combat?.() ?? 3);
        case 'qp': return String(c?.quests?.points?.() ?? 0);
        case 'total': return String(c?.ctx?.skills?.totalLevel?.() ?? 15);
        case 'height': return (c?.ctx?.chain?.height ?? 1284000).toLocaleString('en-GB');
        default: return m;
      }
    } catch { return m; }
  });
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Per-NPC text inside a shared tree: by({ banker_bw: '…', banker_gm_1: '…' }, fallback).
export const by = (map, fallback) => (c) => map[c?.npcId] ?? fallback ?? Object.values(map)[0];

// Text that depends on a condition: when(cond, yes, no).
export const iff = (cond, yes, no = null) => (c) => (test(cond, c) ? fmt(yes, c) : fmt(no, c));
