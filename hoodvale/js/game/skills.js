// Skills: XP, levels, level-ups. Owner: game builder (baseline by integration).
// API (DESIGN.md §7 game): xp(id), level(id), current(id), addXp(id, baseXp), setLevel(id, lvl),
// combatLevel(), totalLevel(), all().

import { SKILLS, SKILL_IDS, xpForLevel, levelForXp, combatLevel, totalLevel, XP_RATE, MAX_LEVEL } from '../data/skills.js';

export function createSkills(ctx) {
  const { state, events } = ctx;
  const S = () => state.save.skills;

  const skills = {
    SKILLS, SKILL_IDS,
    xp(id) { return S()[id] || 0; },
    level(id) { return levelForXp(S()[id] || 0); },
    // Current (boosted/drained) level. Hitpoints = current HP.
    current(id) { return id === 'hitpoints' ? state.save.hp : skills.level(id); },
    levels() { const o = {}; for (const id of SKILL_IDS) o[id] = skills.level(id); return o; },
    // baseXp is the data value; XP_RATE applies here. Returns the XP actually added.
    addXp(id, baseXp, { raw = false } = {}) {
      if (!SKILL_IDS.includes(id) || !(baseXp > 0)) return 0;
      const amount = raw ? baseXp : baseXp * XP_RATE;
      const before = skills.level(id);
      S()[id] = Math.min(200_000_000, (S()[id] || 0) + amount);
      const after = skills.level(id);
      state.markDirty();
      events.emit('xp', { skill: id, amount, total: S()[id] });
      if (after > before) {
        if (id === 'hitpoints') state.save.hp += after - before;
        events.emit('level:up', { skill: id, level: after, prev: before });
      }
      return amount;
    },
    setLevel(id, lvl) {
      S()[id] = xpForLevel(Math.max(1, Math.min(MAX_LEVEL, lvl)));
      if (id === 'hitpoints') state.save.hp = skills.level('hitpoints');
      state.markDirty();
      events.emit('xp', { skill: id, amount: 0, total: S()[id] });
    },
    combatLevel() { return combatLevel(skills.levels()); },
    totalLevel() { return totalLevel(skills.levels()); },
    xpToNext(id) {
      const l = skills.level(id);
      return l >= MAX_LEVEL ? 0 : xpForLevel(l + 1) - skills.xp(id);
    },
    progress(id) {
      const l = skills.level(id);
      if (l >= MAX_LEVEL) return 1;
      const a = xpForLevel(l), b = xpForLevel(l + 1);
      return (skills.xp(id) - a) / (b - a);
    },
  };
  return skills;
}
