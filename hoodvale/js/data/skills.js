// Skills, XP curve and combat level. Pure data/functions.

export const SKILLS = [
  { id: 'attack', name: 'Attack', kind: 'combat', color: '#c0392b', blurb: 'Accuracy with melee weapons. Unlocks better weapons.' },
  { id: 'strength', name: 'Strength', kind: 'combat', color: '#27ae60', blurb: 'Melee max hit.' },
  { id: 'defence', name: 'Defence', kind: 'combat', color: '#2e86de', blurb: 'Avoid hits. Unlocks better armour.' },
  { id: 'hitpoints', name: 'Hitpoints', kind: 'combat', color: '#e74c3c', blurb: 'Your life. Starts at level 10.' },
  { id: 'archery', name: 'Archery', kind: 'combat', color: '#6ab04c', blurb: 'Bows and arrows. The Hood\'s favourite.' },
  { id: 'arcana', name: 'Arcana', kind: 'combat', color: '#8e7cff', blurb: 'Orbio sigil-craft: spells that burn tokens of thought.' },
  { id: 'woodcutting', name: 'Woodcutting', kind: 'gathering', color: '#8d6e3f', blurb: 'Chop trees for logs.' },
  { id: 'fishing', name: 'Fishing', kind: 'gathering', color: '#4aa3df', blurb: 'Catch fish at lakes, rivers and the sea.' },
  { id: 'mining', name: 'Mining', kind: 'gathering', color: '#9e8c7a', blurb: 'Mine ore and crystal.' },
  { id: 'thieving', name: 'Thieving', kind: 'gathering', color: '#7d3c98', blurb: 'Lift purses from the rich. Give to the Vale.' },
  { id: 'fletching', name: 'Fletching', kind: 'artisan', color: '#16a085', blurb: 'Carve bows and craft arrows.' },
  { id: 'firemaking', name: 'Firemaking', kind: 'artisan', color: '#e67e22', blurb: 'Light fires from logs.' },
  { id: 'cooking', name: 'Cooking', kind: 'artisan', color: '#d35400', blurb: 'Turn raw food into healing meals.' },
  { id: 'smithing', name: 'Smithing', kind: 'artisan', color: '#7f8c8d', blurb: 'Smelt bars and forge weapons and armour.' },
  { id: 'crafting', name: 'Crafting', kind: 'artisan', color: '#b9770e', blurb: 'Leather, string and jewellery.' },
];
export const SKILL_IDS = SKILLS.map((s) => s.id);
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export const MAX_LEVEL = 99;
// Game-wide multiplier on every XP reward in data (this is a prototype: levels come quickly).
export const XP_RATE = 4;

// Classic exponential curve: level 2 = 83 xp, level 50 ~ 101k, level 99 ~ 13.03M.
const XP_TABLE = (() => {
  const t = [0, 0];
  let points = 0;
  for (let lvl = 1; lvl < MAX_LEVEL; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    t[lvl + 1] = Math.floor(points / 4);
  }
  return t;
})();

export function xpForLevel(level) {
  return XP_TABLE[Math.max(1, Math.min(MAX_LEVEL, level))];
}
export function levelForXp(xp) {
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (XP_TABLE[mid] <= xp) lo = mid; else hi = mid - 1;
  }
  return lo;
}
export const START_XP = { hitpoints: xpForLevel(10) };

// levels: { attack, strength, defence, hitpoints, archery, arcana }
export function combatLevel(levels) {
  const base = 0.25 * ((levels.defence || 1) + (levels.hitpoints || 10));
  const melee = 0.325 * ((levels.attack || 1) + (levels.strength || 1));
  const range = 0.325 * Math.floor((levels.archery || 1) * 1.5);
  const mage = 0.325 * Math.floor((levels.arcana || 1) * 1.5);
  return Math.floor(base + Math.max(melee, range, mage));
}

export function totalLevel(levels) {
  return SKILL_IDS.reduce((s, id) => s + (levels[id] || 1), 0);
}
