// Pure game formulas (no three.js, no DOM): node-testable. Owner: game builder.
// Numbers follow DESIGN.md §3 (OSRS-style rolls). Every "chance" returns 0..1.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---- Gathering ---------------------------------------------------------------
// Success chance per roll for woodcutting/mining: rises with level above the requirement and with
// tool tier (1 = bronze .. 5 = starmetal); harder resources start lower.
export function gatherChance(level, req, tier = 1) {
  const base = 0.42 - req * 0.0025;
  return clamp(base + (level - req) * 0.012 + (tier - 1) * 0.06, 0.05, 0.95);
}
// Fishing: per-catch chance (the highest catch the player can do is tried first).
export function fishChance(level, req) {
  return clamp(0.34 + (level - req) * 0.015, 0.08, 0.9);
}
// Firemaking: chance per tick to light.
export function fireChance(level, req) {
  return clamp(0.42 + (level - req) * 0.02, 0.3, 0.95);
}

// ---- Cooking -----------------------------------------------------------------
// Burn chance falls linearly from ~55% at the requirement to 0 at stopBurn. A range adds a level
// bonus (data: objects.range.burnBonus).
export function burnChance(level, req, stopBurn, bonus = 0) {
  const eff = level + bonus;
  if (eff >= stopBurn) return 0;
  const span = Math.max(1, stopBurn - req);
  return clamp((0.55 * (stopBurn - eff)) / span, 0, 0.6);
}

// ---- Thieving ----------------------------------------------------------------
export function pickpocketChance(level, req) {
  return clamp(0.62 + (level - req) * 0.018, 0.55, 0.95);
}
// Chance the stall owner catches you (stalls always yield loot when you are not caught).
export function stallCaughtChance(level, req) {
  return clamp(0.2 - (level - req) * 0.01, 0.02, 0.2);
}

// ---- Combat (OSRS-style) -------------------------------------------------------
// Stance bonuses: effective level = level + stance + 8.
export const MELEE_STYLES = [
  { id: 'accurate', name: 'Accurate', xp: ['attack'], att: 3, str: 0, def: 0 },
  { id: 'aggressive', name: 'Aggressive', xp: ['strength'], att: 0, str: 3, def: 0 },
  { id: 'defensive', name: 'Defensive', xp: ['defence'], att: 0, str: 0, def: 3 },
];
export const BOW_STYLES = [
  { id: 'accurate', name: 'Accurate', xp: ['archery'], att: 3, str: 3, def: 0, speed: 0, range: 0 },
  { id: 'rapid', name: 'Rapid', xp: ['archery'], att: 0, str: 0, def: 0, speed: -1, range: 0 },
  { id: 'longrange', name: 'Longrange', xp: ['archery', 'defence'], att: 0, str: 0, def: 3, speed: 0, range: 2 },
];

export function hitChance(attRoll, defRoll) {
  return attRoll > defRoll ? 1 - (defRoll + 2) / (2 * (attRoll + 1)) : attRoll / (2 * (defRoll + 1));
}
export function effective(level, stance = 0) { return Math.floor(level) + stance + 8; }
export function attackRoll(effLevel, bonus = 0) { return effLevel * (bonus + 64); }
export function maxHit(effStr, strBonus = 0) { return Math.floor(0.5 + (effStr * (strBonus + 64)) / 640); }
// Monster rolls (monsters have no gear bonuses: +64).
export function monsterAttackRoll(def, style = def.style) {
  const lvl = style === 'magic' ? def.mag ?? def.att : style === 'ranged' ? def.rng ?? def.att : def.att;
  return (lvl + 9) * 64;
}
export function monsterDefenceRoll(def, vs = 'melee') {
  const lvl = vs === 'magic' ? Math.floor(((def.mag ?? def.def) + def.def) / 2) : def.def;
  return (lvl + 9) * 64;
}

// XP per point of damage (base, before XP_RATE).
export const XP_PER_DAMAGE = 4;
export const HP_XP_PER_DAMAGE = 1.33;

// Medic fee after a death: small, scales with combat level, never more than the balance.
export function medicFee(combatLevel, balance) {
  const fee = 5 + combatLevel * 2;
  return balance >= fee ? fee : 0;
}

// Ticks a projectile takes to land.
export function projectileDelay(kind, dist) {
  if (kind === 'magic') return 1 + Math.floor((1 + dist) / 4);
  if (kind === 'arrow') return 1 + Math.floor((3 + dist) / 6);
  return 1;
}

// Chebyshev distance from a tile to a footprint, per axis.
export function axisDist(x, z, fx, fz, fw = 1, fd = 1) {
  const dx = Math.max(fx - x, 0, x - (fx + fw - 1));
  const dz = Math.max(fz - z, 0, z - (fz + fd - 1));
  return [dx, dz];
}
// Melee reach: a 1x1 attacker may not hit diagonally (RS rule); big monsters may.
export function inMeleeReach(x, z, fx, fz, fw = 1, fd = 1, diagonal = false) {
  const [dx, dz] = axisDist(x, z, fx, fz, fw, fd);
  if (dx === 0 && dz === 0) return false;
  if (diagonal) return dx <= 1 && dz <= 1;
  return (dx === 1 && dz === 0) || (dx === 0 && dz === 1);
}

// Aggression: monsters ignore players whose combat level is more than twice theirs.
export function wouldAggro(monsterLevel, playerCombat, boss = false) {
  return boss || playerCombat <= monsterLevel * 2;
}
