// Combat: melee / ranged / magic (DESIGN.md §3 OSRS-style rolls), stances, auto-retaliate,
// attack speed in ticks, ranged range + line of sight, ammo use + arrows dropping, monster AI
// (aggression with the 2x combat-level rule, aggro range, chase, leash, retaliation, tolerance),
// monster death + loot + respawn, bosses (Goblin Warchief stomp, Sheriff Vane's guards, Ashen
// Wyrm breath + enrage), player death + respawn + medic fee, HP regeneration, archery targets.
// Owner: game builder.
//
// API (ctx.combat): attack(entity, {spell}?) -> bool, target, inCombat, style (current stance id),
//   styles() -> [{id, name, xp, active}], setStyle(id), mode() -> {kind, speed, range, spell?},
//   autoRetaliate (get), setAutoRetaliate(on) (writes state.settings.autoRetaliate),
//   maxHit(), damagePlayer(dmg, source, {type, retaliate}), healPlayer(n), delayAttack(ticks),
//   disengage(), respawn(), opponent (last monster that hit the player), isMulti(x, z).
// Events: combat:hit {target, source, amount, type: 'hit'|'miss'|'heal'|'burn', style?},
//   combat:projectile {from, to, kind: 'arrow'|'spell'|'fire', item?, spell?, color?, ticks},
//   combat:start {target}, combat:end {target}, monster:aggro {entity}, monster:death {entity,
//   killer, x, z}, entity:death {entity}, monster:respawn {entity}, player:death {killer, x, z,
//   region}, player:respawn {x, z, fee}, player:hp {hp, max}, combat:style {style},
//   boss:special {entity, kind: 'stomp'|'summon'|'breath'|'enrage', phase?, hit?},
//   npc:say {entity, text}, camera:shake {strength}, archery:target {entity, hit, total}.

import { RESPAWN } from '../data/zones.js';
import { SPELL_BY_ID } from './magic.js';
import {
  MELEE_STYLES, BOW_STYLES, hitChance, effective, attackRoll, maxHit, monsterAttackRoll, monsterDefenceRoll,
  XP_PER_DAMAGE, HP_XP_PER_DAMAGE, medicFee, projectileDelay, axisDist, inMeleeReach, wouldAggro, clamp,
} from './formulas.js';
import { say, randInt, chance, hasEquipped, formatMc } from './util.js';

const LEASH = 12;
const COMBAT_TIMEOUT = 10; // ticks after the last blow that you still count as "in combat"
const MAGIC_RANGE = 10;
const MONSTER_MAGIC_RANGE = 6;
const BREATH_RANGE = 8;
const TOLERANCE_TICKS = 1000; // ~10 minutes in one area and normal monsters stop being aggressive

export function createCombat(ctx) {
  const { events, state, map, entities } = ctx;
  const P = () => ctx.player;
  const now = () => ctx.ticks.count;
  const lv = (s) => ctx.skills.level(s);
  const pending = []; // queued hits { at, fn }
  let target = null;
  let pendingSpell = null, queuedSpell = null;
  let nextAttack = 0;
  let lastCombat = -99, lastHitBy = null, lastHitAt = -99;
  let dying = false, respawnAt = 0;
  let anchor = { x: 0, z: 0, since: 0 };
  let hpRegenAt = 0;
  const later = (ticks, fn) => pending.push({ at: now() + ticks, fn });
  // Projectile: game event + visuals through the actors' fx helpers (event carries fx: true so
  // listeners know the visuals already exist).
  function projectile(o) {
    let fx = false;
    try {
      const F = ctx.actors?.fx;
      if (F) {
        if (o.kind === 'arrow' && F.shoot) { F.shoot(o.from, o.to, {}); fx = true; }
        else if (o.kind === 'fire' && F.breath) { F.breath(o.from, o.to, {}); fx = true; }
        else if (F.cast) { F.cast(o.from, o.to, { spell: o.spell, color: o.color }); fx = true; }
      }
    } catch (err) { console.error('[combat] fx', err); }
    events.emit('combat:projectile', { ...o, fx });
  }

  // ------------------------------------------------------------------ styles & modes
  const styleIndex = () => {
    const s = state.save.combatStyle || 'accurate';
    return Math.max(0, ['accurate', 'aggressive', 'defensive'].indexOf(s), ['accurate', 'rapid', 'longrange'].indexOf(s));
  };
  const weaponDef = () => ctx.equipment.weapon();
  const weaponStyle = () => weaponDef()?.equip?.style || 'melee';
  function mode() {
    const w = weaponDef();
    const spellId = queuedSpell || (weaponStyle() === 'staff' && state.save.autocast) || null;
    if (spellId && SPELL_BY_ID[spellId]) return { kind: 'magic', spell: SPELL_BY_ID[spellId], speed: 5, range: MAGIC_RANGE, xp: ['arcana'] };
    if (weaponStyle() === 'bow') {
      const st = BOW_STYLES[styleIndex()];
      return { kind: 'ranged', st, speed: Math.max(2, (w.equip.speed || 4) + (st.speed || 0)), range: Math.min(10, (w.equip.range || 7) + (st.range || 0)), xp: st.xp };
    }
    const st = MELEE_STYLES[styleIndex()];
    return { kind: 'melee', st, speed: w?.equip?.speed || 4, range: 1, xp: st.xp };
  }
  const meleeAnim = () => {
    const k = weaponDef()?.equip?.model?.kind;
    if (!k) return 'punch';
    if (k === 'dagger') return 'stab';
    if (k === 'staff') return 'crush';
    return 'slash';
  };

  // ------------------------------------------------------------------ helpers
  const regionOf = (x, z) => map.regionAt(x + 0.5, z + 0.5).id;
  const sameRegion = (e) => regionOf(e.x, e.z) === regionOf(P().x, P().z);
  const isMulti = (x, z) => regionOf(x, z) !== 'overworld';
  const distTo = (x, z, e) => Math.max(...axisDist(x, z, e.x, e.z, e.w || 1, e.d || 1));
  const valid = (e) => e && e.kind === 'monster' && e.alive && !e.hidden && entities.get(e.uid) === e;
  const playerAlive = () => !dying && state.mode !== 'dead';
  const emitHp = () => events.emit('player:hp', { hp: state.save.hp, max: lv('hitpoints') });
  const npcSay = (e, text) => { events.emit('npc:say', { entity: e, text }); say(ctx, `${e.name}: ${text}`); };
  function face(e, t) {
    const cx = t.x + (t.w || 1) / 2, cz = t.z + (t.d || 1) / 2;
    const ex = e.x + (e.w || 1) / 2, ez = e.z + (e.d || 1) / 2;
    if (cx !== ex || cz !== ez) e.yaw = Math.atan2(-(cx - ex), -(cz - ez));
  }
  function playerInReach(e, m) {
    const p = P();
    if (m.kind === 'melee') return inMeleeReach(p.x, p.z, e.x, e.z, e.w, e.d, false);
    const d = distTo(p.x, p.z, e);
    return d >= 1 && d <= m.range && map.lineOfSight(p.x, p.z, e.x, e.z);
  }

  // ------------------------------------------------------------------ the 'Attack' action
  ctx.actions.register('Attack', {
    approach: null,
    start(e, option, c) {
      if (!valid(e)) return false;
      if (!sameRegion(e)) { say(ctx, "I can't reach that.", 'warn'); return false; }
      queuedSpell = pendingSpell; pendingSpell = null;
      if (queuedSpell) {
        const why = ctx.magic?.reason?.(queuedSpell);
        if (why) { say(ctx, why, 'warn'); queuedSpell = null; return false; }
      }
      target = e;
      c.since = now();
      events.emit('combat:start', { target: e });
      return true;
    },
    tick(e, n, c) { return playerTick(e, n, c); },
    stop(e) {
      if (target === e) { target = null; events.emit('combat:end', { target: e }); }
      queuedSpell = null;
    },
  }, 'monster');

  function playerTick(e, n, c) {
    if (!valid(e) || !playerAlive()) return false;
    if (!sameRegion(e)) return false;
    const m = mode();
    if (m.kind === 'magic') {
      const why = ctx.magic?.reason?.(m.spell.id);
      if (why) { say(ctx, why, 'warn'); return false; }
    } else if (m.kind === 'ranged') {
      const ammo = ctx.equipment.slots.ammo;
      if (!ammo || !ctx.equipment.slots.ammo.qty) { say(ctx, 'There is no ammo left in your quiver.', 'warn'); return false; }
      if (!/_arrow$/.test(ammo.id)) { say(ctx, "You can't fire that with a bow.", 'warn'); return false; }
    }
    const p = P();
    if (!playerInReach(e, m)) {
      if (!p.moving || c.chaseX !== e.x || c.chaseZ !== e.z) {
        c.chaseX = e.x; c.chaseZ = e.z;
        const goal = m.kind === 'melee' ? { adjacent: true, diagonal: false } : { range: m.range };
        if (!p.walkToEntity(e, goal, null)) return false;
      }
      return true;
    }
    if (p.moving) p.stop();
    p.face(e);
    if (n < nextAttack) return true;
    nextAttack = n + m.speed;
    playerAttack(e, m, n);
    if (m.kind === 'magic' && queuedSpell && !(weaponStyle() === 'staff' && state.save.autocast === queuedSpell)) {
      queuedSpell = null;
      return false; // a single manual cast; RS stops after it
    }
    return true;
  }

  function playerAttack(e, m, n) {
    const b = ctx.equipment.bonuses();
    lastCombat = n;
    P().entity.combatUntil = n + COMBAT_TIMEOUT;
    if (m.kind === 'melee') {
      const roll = attackRoll(effective(lv('attack'), m.st.att), b.atk);
      const hit = chance(hitChance(roll, monsterDefenceRoll(e.def, 'melee')));
      const max = maxHit(effective(lv('strength'), m.st.str), b.str);
      P().playOnce('attack', 0.9, { variant: meleeAnim() });
      hitMonster(e, hit ? randInt(1, Math.max(1, max)) : 0, { kind: 'melee', xp: m.xp });
    } else if (m.kind === 'ranged') {
      const ammo = ctx.equipment.slots.ammo.id;
      ctx.equipment.useAmmo(1);
      const roll = attackRoll(effective(lv('archery'), m.st.att), b.rng);
      const hit = chance(hitChance(roll, monsterDefenceRoll(e.def, 'ranged')));
      const max = maxHit(effective(lv('archery'), m.st.str), b.rstr);
      const delay = projectileDelay('arrow', distTo(P().x, P().z, e));
      P().playOnce('shoot', 0.9);
      projectile({ from: P().entity, to: e, kind: 'arrow', item: ammo, ticks: delay });
      const dmg = hit ? randInt(1, Math.max(1, max)) : 0;
      later(delay, () => {
        if (chance(0.75)) {
          const tx = e.x + Math.floor((e.w || 1) / 2), tz = e.z + Math.floor((e.d || 1) / 2);
          ctx.loot?.drop?.(ammo, 1, tx, tz, { owner: 'player' });
        }
        if (valid(e)) hitMonster(e, dmg, { kind: 'ranged', xp: m.xp });
      });
      if (!ctx.equipment.slots.ammo) say(ctx, 'That was your last arrow.', 'warn');
    } else {
      const spell = m.spell;
      if (!ctx.magic.consume(spell)) return;
      ctx.skills.addXp('arcana', spell.xp);
      const roll = attackRoll(effective(lv('arcana'), 0), b.mag);
      const hit = chance(hitChance(roll, monsterDefenceRoll(e.def, 'magic')));
      const delay = projectileDelay('magic', distTo(P().x, P().z, e));
      P().playOnce('cast', 1.2);
      events.emit('spell:cast', { spell: spell.id, target: e });
      projectile({ from: P().entity, to: e, kind: 'spell', spell: spell.id, color: spell.color, ticks: delay });
      const dmg = hit ? randInt(0, spell.maxHit) : 0;
      later(delay, () => { if (valid(e)) hitMonster(e, dmg, { kind: 'magic', xp: ['arcana'], splash: !hit }); });
    }
  }

  // Damage to a monster from the player (XP, retaliation, boss phases, death).
  function hitMonster(e, dmg, info) {
    if (!e.alive) return;
    dmg = Math.min(dmg, e.hp);
    e.hp -= dmg;
    e.combatUntil = now() + COMBAT_TIMEOUT;
    events.emit('combat:hit', { target: e, source: P().entity, amount: dmg, type: dmg > 0 ? 'hit' : 'miss', style: info.kind, splash: !!info.splash });
    if (dmg > 0) {
      try { e.view?.hit?.(); } catch { /* ignore */ }
      const per = info.kind === 'magic' ? 2 : XP_PER_DAMAGE;
      for (const s of info.xp) ctx.skills.addXp(s, (per * dmg) / info.xp.length);
      ctx.skills.addXp('hitpoints', HP_XP_PER_DAMAGE * dmg);
    }
    if (e.hp <= 0) { killMonster(e); return; }
    engage(e);
    bossOnDamage(e);
  }

  // ------------------------------------------------------------------ player damage / death
  function damagePlayer(dmg, source, { type = 'hit', retaliate = true } = {}) {
    if (!playerAlive()) return 0;
    const hp = state.save.hp;
    dmg = Math.max(0, Math.min(dmg, hp));
    state.save.hp = hp - dmg;
    state.markDirty();
    const n = now();
    lastCombat = n;
    P().entity.combatUntil = n + COMBAT_TIMEOUT;
    if (source?.kind === 'monster') { lastHitBy = source; lastHitAt = n; }
    events.emit('combat:hit', { target: P().entity, source, amount: dmg, type: dmg > 0 ? type : 'miss' });
    if (dmg > 0) { try { P().actor?.hit?.(); } catch { /* ignore */ } }
    emitHp();
    if (state.save.hp <= 0) { playerDeath(source); return dmg; }
    if (retaliate && source?.kind === 'monster' && state.settings.autoRetaliate !== false && valid(source)
      && !P().moving && ctx.actions.current?.option !== 'Attack' && ctx.actions.current?.option !== 'Teleport') {
      ctx.actions.perform(source, 'Attack');
    }
    return dmg;
  }
  function healPlayer(n) {
    const max = lv('hitpoints');
    const before = state.save.hp;
    state.save.hp = Math.min(max, before + n);
    if (state.save.hp !== before) { state.markDirty(); emitHp(); }
    return state.save.hp - before;
  }

  function playerDeath(killer) {
    if (dying) return;
    dying = true;
    ctx.actions.cancel();
    P().stop();
    target = null;
    const x = P().x, z = P().z, region = P().region;
    state.save.stats.deaths = (state.save.stats.deaths || 0) + 1;
    state.markDirty();
    try { P().actor?.die?.(); } catch { /* ignore */ }
    for (const m of entities.all()) if (m.kind === 'monster' && m.ai?.target === 'player') retreat(m, true);
    state.setMode('dead');
    say(ctx, 'You collapse. The Vale goes dark…', 'warn');
    events.emit('player:death', { killer: killer || null, x, z, region });
    respawnAt = now() + 5;
  }
  function respawn() {
    if (!dying) return;
    dying = false;
    const fee = medicFee(ctx.skills.combatLevel(), ctx.wallet?.balance ?? 0);
    const tx = Math.floor(RESPAWN.x), tz = Math.floor(RESPAWN.z);
    state.save.hp = lv('hitpoints');
    P().teleport(tx, tz);
    try { P().actor?.revive?.(); } catch { /* ignore */ }
    state.setMode('play');
    nextAttack = 0;
    lastHitBy = null;
    if (fee && ctx.wallet?.debit?.(fee, 'Medic fee', { to: 'brightwater-medic' })) {
      say(ctx, `The Brightwater medic patches you up. Fee: ${formatMc(fee)} CREDIT.`, 'chain');
    } else say(ctx, 'The Brightwater medic patches you up, free of charge. Be more careful out there!');
    emitHp();
    events.emit('player:respawn', { x: tx, z: tz, fee });
  }

  // ------------------------------------------------------------------ monster AI
  function ai(e) { return (e.ai ||= { mode: 'idle', target: null, nextAttack: 0, attacks: 0 }); }
  function engage(e) {
    const a = ai(e);
    if (a.mode === 'combat' && a.target === 'player') return;
    a.mode = 'combat';
    a.target = 'player';
    a.nextAttack = Math.max(a.nextAttack, now() + 1);
    e.state.holdUntil = 0;
  }
  function retreat(e, heal = false) {
    const a = ai(e);
    a.mode = 'return';
    a.target = null;
    e.path = null;
    if (heal || e.boss) e.hp = e.maxHp;
    if (e.boss) bossReset(e);
  }
  function monsterInReach(e) {
    const p = P();
    const d = distTo(p.x, p.z, e);
    if (e.def.style === 'magic' || e.def.style === 'ranged') return d >= 1 && d <= MONSTER_MAGIC_RANGE && map.lineOfSight(e.x, e.z, p.x, p.z);
    return inMeleeReach(p.x, p.z, e.x, e.z, e.w, e.d, (e.size || 1) > 1);
  }
  function chaseGoal(e) {
    const p = P(), s = e.size || 1;
    if (e.def.style === 'magic' || e.def.style === 'ranged') return { x: p.x, z: p.z, range: MONSTER_MAGIC_RANGE };
    return { x: p.x - s + 1, z: p.z - s + 1, w: s, d: s, adjacent: true, diagonal: s > 1 };
  }

  // Priority 19: decide monster movement (entities steps paths at 20, same tick).
  ctx.ticks.on((n) => {
    const p = P();
    if (!p) return;
    if (Math.max(Math.abs(p.x - anchor.x), Math.abs(p.z - anchor.z)) > 10) anchor = { x: p.x, z: p.z, since: n };
    const tolerant = n - anchor.since > TOLERANCE_TICKS && p.region === 'overworld';
    const cl = ctx.skills.combatLevel();
    for (const e of entities.all()) {
      if (e.kind !== 'monster' || !e.alive || e.hidden) continue;
      const a = ai(e);
      if (a.mode === 'idle') {
        if (n % 6 === 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + 1);
        if (!e.def.aggressive || !playerAlive() || state.mode !== 'play') continue;
        if (tolerant && !e.boss) continue;
        if (Math.abs(e.x - p.x) > 14 || Math.abs(e.z - p.z) > 14) continue;
        if (!wouldAggro(e.def.level, cl, e.boss)) continue;
        if (!sameRegion(e)) continue;
        if (map.isIndoor(p.x, p.z) && !e.homeIndoor) continue; // buildings are safe from outside aggression
        if (distTo(p.x, p.z, e) > (e.def.aggroRange || 4)) continue;
        if (Math.max(Math.abs(p.x - e.home.x), Math.abs(p.z - e.home.z)) > LEASH) continue;
        if (!isMulti(p.x, p.z) && ((lastHitBy && lastHitBy !== e && valid(lastHitBy) && n - lastHitAt < 8) || (target && target !== e))) continue;
        if (!map.lineOfSight(e.x, e.z, p.x, p.z)) continue;
        engage(e);
        events.emit('monster:aggro', { entity: e });
        continue;
      }
      if (a.mode === 'return') {
        if (n % 3 === 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + 1);
        if (Math.max(Math.abs(e.x - e.home.x), Math.abs(e.z - e.home.z)) <= 1) { a.mode = 'idle'; e.path = null; continue; }
        if (!e.path?.length) {
          const path = map.findPath(e.x, e.z, { x: e.home.x, z: e.home.z }, { maxNodes: 2500 });
          if (path?.length) e.path = path;
          else { entities.moveTo(e, e.home.x, e.home.z); entities.setPosFromTile(e); a.mode = 'idle'; }
        }
        continue;
      }
      // combat
      if (!playerAlive() || !sameRegion(e) || Math.max(Math.abs(e.x - e.home.x), Math.abs(e.z - e.home.z)) > LEASH
        || Math.max(Math.abs(p.x - e.home.x), Math.abs(p.z - e.home.z)) > LEASH + 6) {
        retreat(e);
        continue;
      }
      if (monsterInReach(e)) { e.path = null; continue; }
      if (!e.path?.length || a.chaseX !== p.x || a.chaseZ !== p.z) {
        a.chaseX = p.x; a.chaseZ = p.z;
        const path = map.findPath(e.x, e.z, chaseGoal(e), { maxNodes: 800 });
        e.path = path && path.length ? path : null;
      }
    }
  }, 19);

  // Priority 30: attacks, queued hits, deaths/respawns.
  ctx.ticks.on((n) => {
    for (let i = 0; i < pending.length; i++) {
      if (pending[i].at > n) continue;
      const h = pending.splice(i--, 1)[0];
      try { h.fn(); } catch (err) { console.error('[combat] hit', err); }
    }
    if (dying) { if (n >= respawnAt) respawn(); return; }
    for (const e of entities.all()) {
      if (e.kind !== 'monster' || !e.alive || e.hidden) continue;
      const a = e.ai;
      if (!a || a.mode !== 'combat' || n < a.nextAttack || !playerAlive()) continue;
      if (monsterInReach(e)) {
        face(e, P());
        a.nextAttack = n + monsterSpeed(e);
        monsterAttack(e, n);
      } else if (canBreathe(e)) {
        face(e, P());
        a.nextAttack = n + monsterSpeed(e);
        breath(e);
      }
    }
  }, 30);

  const monsterSpeed = (e) => Math.max(2, (e.def.speed || 4) - (e.ai?.enraged ? 1 : 0));
  const canBreathe = (e) => (e.defId === 'ashen_wyrm') && distTo(P().x, P().z, e) <= BREATH_RANGE && map.lineOfSight(e.x, e.z, P().x, P().z);

  function monsterAttack(e, n) {
    const a = ai(e);
    a.attacks++;
    // Boss specials replace a normal attack.
    if (e.defId === 'goblin_warchief' && a.attacks % 5 === 0) return stomp(e);
    if (e.defId === 'ashen_wyrm' && a.attacks % 4 === 0) return breath(e);
    if (e.defId === 'ashen_drake' && a.attacks % 5 === 0) return breath(e);
    const style = e.def.style || 'melee';
    const lvDef = style === 'magic' ? Math.floor(0.7 * lv('arcana') + 0.3 * lv('defence')) : lv('defence');
    const stDef = mode().kind === 'melee' ? mode().st.def : mode().kind === 'ranged' ? mode().st.def : 0;
    const b = ctx.equipment.bonuses();
    const defRoll = attackRoll(effective(lvDef, stDef), style === 'magic' ? Math.floor(b.def / 2) + (b.mag || 0) : b.def);
    const hit = chance(hitChance(monsterAttackRoll(e.def, style), defRoll));
    const max = (e.def.maxHit || 1) + (a.enraged ? 4 : 0);
    const dmg = hit ? randInt(0, max) : 0;
    entities.playOnce(e, 'attack', 0.8);
    if (style === 'magic' || style === 'ranged') {
      const delay = projectileDelay('magic', distTo(P().x, P().z, e));
      projectile({ from: e, to: P().entity, kind: 'spell', color: e.def.model?.colors?.glow || e.def.model?.colors?.core || '#b18cff', ticks: delay });
      later(delay, () => damagePlayer(dmg, e));
    } else damagePlayer(dmg, e);
    void n;
  }

  // ------------------------------------------------------------------ bosses
  function stomp(e) {
    npcSay(e, 'WAAAGH! Squash da little one!');
    say(ctx, 'The Goblin Warchief raises his great club high!', 'warn');
    entities.playOnce(e, 'crush', 1.4);
    events.emit('boss:special', { entity: e, kind: 'stomp', phase: 'windup' });
    later(2, () => {
      if (!valid(e) || !playerAlive()) return;
      const near = sameRegion(e) && distTo(P().x, P().z, e) <= 2;
      events.emit('camera:shake', { strength: near ? 0.5 : 0.2 });
      events.emit('boss:special', { entity: e, kind: 'stomp', phase: 'impact', hit: near });
      if (near) {
        say(ctx, 'The ground shakes as the club slams down!', 'warn');
        damagePlayer(randInt(3, 8), e, { type: 'hit' });
      } else say(ctx, 'You leap clear of the stomp!');
    });
  }
  function breath(e) {
    const wyrm = e.defId === 'ashen_wyrm';
    const shielded = hasEquipped(ctx, 'fireward_shield');
    entities.playOnce(e, 'breath', 1.4);
    if (wyrm) say(ctx, 'The Ashen Wyrm draws a deep, crackling breath...', 'warn');
    events.emit('boss:special', { entity: e, kind: 'breath' });
    const delay = 2;
    projectile({ from: e, to: P().entity, kind: 'fire', color: '#ff8a3a', ticks: delay });
    later(delay, () => {
      if (!valid(e) || !playerAlive() || !sameRegion(e)) return;
      const enr = e.ai?.enraged ? 4 : 0;
      const dmg = shielded ? randInt(0, wyrm ? 4 : 2) : wyrm ? randInt(12, 24) + enr : randInt(5, 12);
      if (shielded) say(ctx, 'Your Fireward shield absorbs most of the dragonfire.');
      else say(ctx, wyrm ? 'You are horribly burnt by the wyrmfire! A ward against fire would help.' : 'You are burnt by the drake\'s fiery breath!', 'warn');
      damagePlayer(dmg, e, { type: 'burn' });
    });
  }
  function bossOnDamage(e) {
    const a = ai(e);
    if (e.defId === 'sheriff_vane' && !a.summoned && e.hp <= e.maxHp / 2) {
      a.summoned = true;
      npcSay(e, 'Guards! Seize this outlaw!');
      events.emit('boss:special', { entity: e, kind: 'summon' });
      a.summons = [];
      for (let i = 0; i < 2; i++) {
        const t = map.nearestWalkable(e.x + (i ? 2 : -2), e.z + 1, 4);
        if (!t) continue;
        const g = entities.spawnMonster('sheriff_guard', t.x, t.z, { temporary: true, home: { x: e.home.x, z: e.home.z } });
        g.summoner = e;
        engage(g);
        a.summons.push(g);
      }
    }
    if (e.defId === 'ashen_wyrm' && !a.enraged && e.hp <= e.maxHp / 4) {
      a.enraged = true;
      say(ctx, 'The Ashen Wyrm roars in fury! Its scales blaze white-hot.', 'warn');
      events.emit('boss:special', { entity: e, kind: 'enrage' });
      events.emit('camera:shake', { strength: 0.35 });
    }
  }
  function bossReset(e) {
    const a = ai(e);
    a.summoned = false; a.enraged = false; a.attacks = 0;
    for (const g of a.summons || []) if (entities.get(g.uid)) entities.remove(g);
    a.summons = [];
  }

  // ------------------------------------------------------------------ monster death & respawn
  function killMonster(e) {
    const n = now();
    e.alive = false;
    e.dying = true;
    e.path = null;
    const a = ai(e);
    a.mode = 'dead'; a.target = null;
    if (target === e) target = null;
    try { e.view?.die?.(); } catch { /* ignore */ }
    const kills = (state.save.stats.kills ||= {});
    kills[e.defId] = (kills[e.defId] || 0) + 1;
    state.markDirty();
    const x = e.x, z = e.z;
    events.emit('monster:death', { entity: e, killer: P().entity, x, z });
    events.emit('entity:death', { entity: e });
    if (e.boss) bossReset(e);
    later(2, () => {
      ctx.loot?.dropFor?.(e, x, z);
      e.hidden = true;
      e.dying = false;
      try { e.view?.setVisible?.(false); } catch { /* ignore */ }
      if (e.temporary) { entities.remove(e); return; }
      later(Math.max(5, (e.def.respawnTicks || 30) - 2), () => respawnMonster(e));
    });
  }
  function respawnMonster(e) {
    if (!entities.get(e.uid)) return;
    e.hp = e.maxHp;
    entities.moveTo(e, e.home.x, e.home.z);
    entities.setPosFromTile(e);
    e.moving = null; e.path = null;
    e.alive = true; e.hidden = false; e.dying = false;
    e.ai = { mode: 'idle', target: null, nextAttack: 0, attacks: 0 };
    try { e.view?.revive?.(); e.view?.setVisible?.(true); } catch { /* ignore */ }
    events.emit('monster:respawn', { entity: e });
  }

  // ------------------------------------------------------------------ HP regeneration
  ctx.ticks.on((n) => {
    if (!playerAlive()) return;
    const max = lv('hitpoints');
    if (state.save.hp > max) { state.save.hp = max; emitHp(); }
    if (n - lastCombat < COMBAT_TIMEOUT || state.save.hp >= max) { hpRegenAt = n + 15; return; }
    if (n >= hpRegenAt) { hpRegenAt = n + 15; healPlayer(1); }
  }, 90);

  // ------------------------------------------------------------------ archery targets
  ctx.actions.register('Shoot', {
    approach: () => ({ range: 7 }),
    start(e, option, c) {
      if (weaponStyle() !== 'bow') { say(ctx, 'You need to wield a bow to shoot at the target.', 'warn'); return false; }
      const ammo = ctx.equipment.slots.ammo;
      if (!ammo || !/_arrow$/.test(ammo.id)) { say(ctx, 'You need some arrows in your quiver.', 'warn'); return false; }
      c.next = ctx.ticks.count + 1;
      c.shots = 0;
      return true;
    },
    tick(e, n, c) {
      if (n < c.next) return true;
      if (!ctx.equipment.slots.ammo) { say(ctx, 'There is no ammo left in your quiver.', 'warn'); return false; }
      const m = mode();
      c.next = n + m.speed;
      P().face(e);
      P().playOnce('shoot', 0.9);
      projectile({ from: P().entity, to: e, kind: 'arrow', item: ctx.equipment.slots.ammo.id, ticks: 1 });
      const hit = chance(clamp(0.5 + lv('archery') * 0.01 + ctx.equipment.bonuses().rng * 0.005, 0.5, 0.95));
      const st = state.save.stats;
      later(1, () => {
        if (hit) {
          st.targetHits = (st.targetHits || 0) + 1;
          say(ctx, chance(0.2) ? 'Bullseye!' : 'You hit the target.');
          if (lv('archery') < 30) ctx.skills.addXp('archery', 5);
        } else say(ctx, 'You miss the target.');
        events.emit('archery:target', { entity: e, hit, total: st.targetHits || 0 });
      });
      return ++c.shots < 20;
    },
  }, 'object');

  // ------------------------------------------------------------------ API
  const combat = {
    get target() { return target; },
    get inCombat() { return now() - lastCombat < COMBAT_TIMEOUT; },
    get opponent() { return lastHitBy && valid(lastHitBy) && now() - lastHitAt < COMBAT_TIMEOUT ? lastHitBy : target; },
    get style() { return (weaponStyle() === 'bow' ? BOW_STYLES : MELEE_STYLES)[styleIndex()].id; },
    styles() {
      const list = weaponStyle() === 'bow' ? BOW_STYLES : MELEE_STYLES;
      const i = styleIndex();
      return list.map((s, k) => ({ id: s.id, name: s.name, xp: s.xp, active: k === i }));
    },
    setStyle(id) {
      const ok = [...MELEE_STYLES, ...BOW_STYLES].some((s) => s.id === id);
      if (!ok) return false;
      state.save.combatStyle = id;
      state.markDirty();
      events.emit('combat:style', { style: combat.style });
      return true;
    },
    mode,
    maxHit() {
      const m = mode();
      const b = ctx.equipment.bonuses();
      if (m.kind === 'magic') return m.spell.maxHit;
      if (m.kind === 'ranged') return maxHit(effective(lv('archery'), m.st.str), b.rstr);
      return maxHit(effective(lv('strength'), m.st.str), b.str);
    },
    attack(entity, { spell = null } = {}) {
      if (!entity || entity.kind !== 'monster' || !entity.alive) return false;
      pendingSpell = spell;
      const ok = ctx.actions.perform(entity, 'Attack');
      if (!ok) pendingSpell = null;
      return ok;
    },
    get autoRetaliate() { return state.settings.autoRetaliate !== false; },
    setAutoRetaliate(on) {
      state.settings.autoRetaliate = !!on;
      events.emit('combat:autoretaliate', { on: !!on });
      return !!on;
    },
    damagePlayer,
    healPlayer,
    delayAttack(t) { if (combat.inCombat) nextAttack = Math.max(nextAttack, now()) + t; },
    disengage() {
      if (ctx.actions.current?.option === 'Attack') ctx.actions.cancel();
      target = null;
    },
    respawn,
    isMulti,
    update() {},
  };
  return combat;
}
