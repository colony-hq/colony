// Shared helpers for the game modules (chat messages, randomness, item lookups, tools).
// Owner: game builder.

import { ITEMS, METALS } from '../data/items.js';
import { SKILL_BY_ID } from '../data/skills.js';

export const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const chance = (p) => Math.random() < p;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function say(ctx, text, kind = 'game') {
  ctx.events.emit('chat:game', { text, kind });
}
export function itemName(id) { return ITEMS[id]?.name || id; }
// "some shrimp" style lower-case name for messages.
export function lname(id) {
  const n = itemName(id);
  return /^[A-Z][a-z]/.test(n) ? n[0].toLowerCase() + n.slice(1) : n;
}
export function aOrAn(word) { return /^[aeiou]/i.test(word) ? 'an' : 'a'; }
// "a bronze dagger", "an oak shortbow", but "bronze platelegs" / "leather boots" (plurals).
export function withArticle(id) {
  const n = lname(id);
  if (/(legs|boots|gloves|chaps|logs|arrowheads|shrimp|sardine)$/.test(n)) return n;
  return `${aOrAn(n)} ${n}`;
}
export function skillName(id) { return SKILL_BY_ID[id]?.name || id; }

// Weighted pick from [{ w, ... }]. Entries with w <= 0 are ignored.
export function weighted(table) {
  const total = table.reduce((s, e) => s + Math.max(0, e.w || 0), 0);
  let t = Math.random() * total;
  for (const e of table) { t -= Math.max(0, e.w || 0); if (t <= 0) return e; }
  return table[table.length - 1];
}

// Tool metal level requirements for gathering tools (by tool tier 1..5).
export const TOOL_LEVELS = METALS.map((m) => m.req);

// Best usable tool of a type in the inventory or the weapon slot.
// Returns { id, tier } | { id: null, blocked: { id, level } } when only too-advanced tools exist.
export function bestTool(ctx, type, skill) {
  let best = null, blocked = null;
  const lvl = skill ? ctx.skills.level(skill) : 99;
  const consider = (id) => {
    const t = ITEMS[id]?.tool;
    if (!t || t.type !== type) return;
    const need = TOOL_LEVELS[t.tier - 1] || 1;
    if (skill && (type === 'axe' || type === 'pickaxe') && lvl < need) {
      if (!blocked || need < blocked.level) blocked = { id, level: need };
      return;
    }
    if (!best || t.tier > best.tier) best = { id, tier: t.tier };
  };
  for (const e of ctx.inventory.slots) if (e) consider(e.id);
  const w = ctx.equipment.slots.weapon;
  if (w) consider(w.id);
  return best || { id: null, tier: 0, blocked };
}
export function hasTool(ctx, type) {
  return !!bestTool(ctx, type).id;
}

// Does the player own an item anywhere (inventory, equipment, bank)?
export function owns(ctx, id) {
  if (ctx.inventory.has(id)) return true;
  if (Object.values(ctx.equipment.slots).some((e) => e && e.id === id)) return true;
  return ctx.bank.count(id) > 0;
}
export function hasEquipped(ctx, id) {
  return Object.values(ctx.equipment.slots).some((e) => e && e.id === id);
}

// Quest helpers (stage is the index of the current step; 'done' when finished).
export function questStage(ctx, id) { return ctx.state.save.quests?.[id]; }
export function questActive(ctx, id) { return typeof questStage(ctx, id) === 'number'; }
export function questDone(ctx, id) { return questStage(ctx, id) === 'done'; }

// Can n more of an item fit in the inventory?
export function canFit(ctx, id, n = 1) {
  return ctx.inventory.canAdd([[id, n]]);
}

export function regionId(ctx, x, z) {
  return ctx.map.regionAt(x + 0.5, z + 0.5).id;
}
export function formatMc(mc) { return (mc / 1000).toFixed(3); }
