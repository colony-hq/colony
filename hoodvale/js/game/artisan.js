// Artisan skills: firemaking (temporary fire objects), cooking (fires / ranges, burn chance,
// range bonus, bread, honey cake), smelting, smithing, fletching (shafts, bows, headless arrows,
// arrows), crafting (leather, wyrmscale, gems, amulets, spinning, tanning for a CREDIT fee),
// inscribing sigils, the flour chain (hopper -> flour bin) and bread dough. Owner: game builder.
//
// Make-X flows open ctx.ui.openMake (see makex.js) and loop on ticks with an animation.
// API (ctx.artisan): fires (list), lightFire(logId) (debug), flour() -> grain waiting in the mill.
// Events: skill:product {skill, item, qty, source, entity?}, skill:fail {skill, reason, item},
//         fire:lit {entity, x, z, log}, fire:out {entity}, mill:fill {qty, total},
//         tan {qty, mc}.

import { ITEMS, METALS, WOODS } from '../data/items.js';
import { COOKING, FIREMAKING, SMELTING, FLETCHING, CRAFTING, INSCRIBING } from '../data/economy.js';
import { burnChance, fireChance } from './formulas.js';
import { makeHandler } from './makex.js';
import { say, randInt, chance, lname, withArticle, itemName, questStage, formatMc } from './util.js';

const COOK_BY_RAW = Object.fromEntries(COOKING.map((r) => [r.raw, r]));
const FIRE_BY_LOG = Object.fromEntries(FIREMAKING.map((r) => [r.log, r]));
const LOGS = new Set(WOODS.map((w) => w.log));
const METAL_BY_ID = Object.fromEntries(METALS.map((m) => [m.id, m]));
const SMITH_ITEMS = Object.values(ITEMS).filter((d) => d.smith).map((d) => ({ def: d, metal: METAL_BY_ID[d.id.split('_')[0]] })).filter((x) => x.metal);
const GEM_CUT = Object.fromEntries(CRAFTING.gems.map((g) => [g.uncut, g]));
const AMULET_BY_GEM = Object.fromEntries(Object.values(ITEMS).filter((d) => d.craft?.gem).map((d) => [d.craft.gem, d]));
const LEATHER_ITEMS = Object.values(ITEMS).filter((d) => d.craft?.leather).sort((a, b) => a.craft.level - b.craft.level);
const SCALE_ITEMS = Object.values(ITEMS).filter((d) => d.craft?.scales);
const BOWS_BY_LOG = {};
for (const d of Object.values(ITEMS)) if (d.fletch) (BOWS_BY_LOG[d.fletch.log] ||= []).push(d);
const HONEY_CAKE = { level: 20, xp: 120, stopBurn: 50 };

export function createArtisan(ctx) {
  const { events, state, actions } = ctx;
  const inv = () => ctx.inventory;
  const lvl = (s) => ctx.skills.level(s);
  const fires = [];
  const product = (skill, item, qty, source, entity) => events.emit('skill:product', { skill, item, qty, source, entity });
  const has = (id, n = 1) => inv().has(id, n);
  const cnt = (id) => inv().count(id);
  const pair = (a, b) => (id, t) => t.kind === 'item' && ((a(id) && b(t.id)) || (b(id) && a(t.id)));
  const isObj = (...defs) => (t) => t.kind === 'object' && defs.includes(t.defId);
  const other = (c, pred) => (pred(c.item) ? c.target.id : c.item); // the item in a pair that is NOT pred
  // Remove inputs and add products; anything that does not fit drops at your feet.
  function swap(removes, adds) {
    for (const [id, q] of removes) inv().remove(id, q);
    for (const [id, q] of adds) {
      const left = inv().add(id, q);
      if (left > 0) ctx.loot?.drop?.(id, left, ctx.player.x, ctx.player.z, { owner: 'player' });
    }
  }

  // ======================================================================= firemaking
  function fireBlockedReason(x, z) {
    const m = ctx.map;
    if (m.isIndoor(x, z)) return "You can't light a fire indoors.";
    const f = m.tileFlags(x, z);
    if (f & m.T.BRIDGE) return "You can't light a fire on a bridge.";
    if (ctx.entities.at(x, z).some((e) => e.kind === 'object')) return "You can't light a fire here.";
    return null;
  }
  const isLog = (id) => LOGS.has(id);
  const firemaking = {
    approach: null,
    start(e, option, c) {
      const log = isLog(c.item) ? c.item : c.target?.id;
      const r = FIRE_BY_LOG[log];
      if (!r) return false;
      if (!has('tinderbox')) { say(ctx, 'You need a tinderbox to light a fire.', 'warn'); return false; }
      if (lvl('firemaking') < r.level) { say(ctx, `You need a Firemaking level of ${r.level} to burn ${lname(log)}.`, 'warn'); return false; }
      const p = ctx.player;
      const why = fireBlockedReason(p.x, p.z);
      if (why) { say(ctx, why, 'warn'); return false; }
      if (p.moving) p.stop();
      c.log = log; c.recipe = r;
      c.next = ctx.ticks.count + 1;
      p.setAnim('firemake');
      say(ctx, 'You attempt to light the logs.');
      return true;
    },
    tick(e, n, c) {
      if (n < c.next) return true;
      c.next = n + 1;
      const p = ctx.player;
      if (!has(c.log)) return false;
      if (fireBlockedReason(p.x, p.z)) { say(ctx, "You can't light a fire here.", 'warn'); return false; }
      if (!chance(fireChance(lvl('firemaking'), c.recipe.level))) return true;
      inv().remove(c.log, 1);
      const fire = lightFire(p.x, p.z, c.log);
      ctx.skills.addXp('firemaking', c.recipe.xp);
      say(ctx, 'The fire catches and the logs begin to burn.');
      product('firemaking', c.log, 1, 'tinderbox', fire);
      state.save.stats.fires = (state.save.stats.fires || 0) + 1;
      // Step away from the flames: west, else east, south, north (RS style).
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) {
        if (ctx.map.canStep(p.x, p.z, p.x + dx, p.z + dz)) {
          const tx = p.x + dx, tz = p.z + dz;
          p.walkTo(tx, tz, { cancel: false, marker: false });
          break;
        }
      }
      return false;
    },
    stop() { ctx.player.setAnim(null); },
  };
  actions.registerUse(pair((id) => id === 'tinderbox', isLog), firemaking);

  function lightFire(x, z, log) {
    const e = ctx.entities.addObject('fire', x, z, { lit: ctx.ticks.count, log });
    const life = randInt(100, 200); // 60–120 s
    fires.push({ e, out: ctx.ticks.count + life });
    events.emit('fire:lit', { entity: e, x, z, log });
    return e;
  }
  ctx.ticks.on((n) => {
    for (let i = fires.length - 1; i >= 0; i--) {
      if (n < fires[i].out) continue;
      const { e } = fires[i];
      fires.splice(i, 1);
      ctx.entities.remove(e);
      events.emit('fire:out', { entity: e });
    }
  }, 50);

  // ======================================================================= cooking
  const honeyUnlocked = () => !!(state.flag('unlock:honey_cake_recipe') || state.flag('honey_cake_recipe'));
  const cookList = (e, c) => {
    const range = e.defId === 'range';
    const bonus = range ? e.def.burnBonus || 0 : 0;
    const only = c.item && COOK_BY_RAW[c.item] ? c.item : null;
    const out = [];
    for (const r of COOKING) {
      if (only && r.raw !== only) continue;
      if (!has(r.raw)) continue;
      const reason = lvl('cooking') < r.level ? `You need a Cooking level of ${r.level} to cook ${lname(r.raw).replace(/^raw /, '')}.`
        : r.rangeOnly && !range ? `You need a range to bake ${lname(r.raw)}. A campfire would burn it to a crisp.` : null;
      out.push({
        id: r.cooked, label: itemName(r.cooked), reason, interval: 4, anim: 'cook',
        max: () => cnt(r.raw),
        make() {
          inv().remove(r.raw, 1);
          const burnt = chance(burnChance(lvl('cooking'), r.level, r.stopBurn, bonus));
          if (burnt) {
            inv().add(r.burnt, 1);
            say(ctx, `You accidentally burn the ${lname(r.raw).replace(/^raw /, '')}.`);
            events.emit('skill:fail', { skill: 'cooking', reason: 'burnt', item: r.raw, result: r.burnt });
          } else {
            inv().add(r.cooked, 1);
            ctx.skills.addXp('cooking', r.xp);
            const food = lname(r.raw).replace(/^raw /, '');
            say(ctx, r.cooked === 'bread' ? 'You bake a loaf of warm bread.' : `You successfully cook ${/shrimp|sardine/.test(food) ? 'some' : 'the'} ${food}.`);
            product('cooking', r.cooked, 1, e.defId, e);
          }
        },
      });
    }
    if (range && honeyUnlocked() && (!c.item || ['egg', 'bucket_of_milk', 'pot_of_flour'].includes(c.item)) && (has('egg') || has('bucket_of_milk') || has('pot_of_flour'))) {
      out.push({
        id: 'honey_cake', label: 'Honey cake (egg, milk, flour)', interval: 4, anim: 'cook',
        reason: lvl('cooking') < HONEY_CAKE.level ? `You need a Cooking level of ${HONEY_CAKE.level} to bake Marta's honey cake.` : null,
        missing: 'You need an egg, a bucket of milk and a pot of flour.',
        max: () => Math.min(cnt('egg'), cnt('bucket_of_milk'), cnt('pot_of_flour')),
        make() {
          swap([['egg', 1], ['bucket_of_milk', 1], ['pot_of_flour', 1]], [['bucket', 1], ['pot', 1]]);
          if (chance(burnChance(lvl('cooking'), HONEY_CAKE.level, HONEY_CAKE.stopBurn, bonus))) {
            inv().add('burnt_meat', 1);
            say(ctx, 'The honey cake collapses into a smoking ruin. Marta would weep.');
            events.emit('skill:fail', { skill: 'cooking', reason: 'burnt', item: 'honey_cake' });
          } else {
            inv().add('honey_cake', 1);
            ctx.skills.addXp('cooking', HONEY_CAKE.xp);
            say(ctx, "You bake one of Marta's famous honey cakes. It smells incredible.");
            product('cooking', 'honey_cake', 1, e.defId, e);
          }
        },
      });
    }
    return out;
  };
  const cooking = makeHandler(ctx, {
    title: 'What would you like to cook?', skill: 'cooking', interval: 4, anim: 'cook', list: cookList,
    none: (e) => (e.defId === 'range' ? 'You have nothing to cook.' : 'You have nothing to cook on the fire.'),
  });
  actions.register('Cook', cooking, 'object');
  actions.registerUse((id, t) => isObj('fire', 'range')(t) && (!!COOK_BY_RAW[id] || (t.defId === 'range' && ['egg', 'bucket_of_milk', 'pot_of_flour'].includes(id) && honeyUnlocked())), cooking);

  // ======================================================================= smelting
  const smeltList = (e, c) => {
    const out = [];
    const anyOre = SMELTING.some((s) => s.inputs.some(([id]) => has(id)));
    if (!anyOre) return out;
    for (const s of SMELTING) {
      if (c.item && !s.inputs.some(([id]) => id === c.item)) continue;
      const need = s.inputs.map(([id, q]) => `${q} ${lname(id)}`).join(', ');
      out.push({
        id: s.bar, label: itemName(s.bar), interval: 4, anim: 'smelt',
        reason: lvl('smithing') < s.level ? `You need a Smithing level of ${s.level} to smelt ${lname(s.bar).replace(/ bar$/, '')}.` : null,
        missing: `You need ${need} to make ${withArticle(s.bar)}.`,
        max: () => Math.min(...s.inputs.map(([id, q]) => Math.floor(cnt(id) / q))),
        make() {
          for (const [id, q] of s.inputs) inv().remove(id, q);
          if (s.bar === 'iron_bar' && !chance(Math.min(0.8, 0.5 + (lvl('smithing') - 15) * 0.01))) {
            say(ctx, 'The ore is too impure and you fail to refine it.');
            events.emit('skill:fail', { skill: 'smithing', reason: 'impure', item: 'iron_ore' });
            return;
          }
          inv().add(s.bar, 1);
          ctx.skills.addXp('smithing', s.xp);
          say(ctx, `You retrieve ${withArticle(s.bar)} from the furnace.`);
          product('smithing', s.bar, 1, 'furnace', e);
        },
      });
    }
    return out;
  };
  const smelting = makeHandler(ctx, { title: 'What would you like to smelt?', skill: 'smithing', interval: 4, anim: 'smelt', list: smeltList, none: "You don't have any ore to smelt." });
  actions.register('Smelt', smelting, 'object');
  actions.registerUse((id, t) => isObj('furnace')(t) && SMELTING.some((s) => s.inputs.some(([i]) => i === id)), smelting);

  // ======================================================================= smithing
  const barOf = (m) => `${m.id}_bar`;
  function pickMetal(c) {
    if (c.item && c.item.endsWith('_bar')) return METAL_BY_ID[c.item.replace('_bar', '')];
    const owned = METALS.filter((m) => has(barOf(m)));
    if (!owned.length) return null;
    const usable = owned.filter((m) => lvl('smithing') >= m.smith);
    return (usable.length ? usable : owned).slice(-1)[0];
  }
  const smithList = (e, c) => {
    const m = pickMetal(c);
    if (!m) return [];
    const bar = barOf(m);
    return SMITH_ITEMS.filter((x) => x.metal === m).sort((a, b) => a.def.smith.level - b.def.smith.level).map(({ def }) => {
      const s = def.smith;
      const makes = s.makes || 1;
      return {
        id: def.id, label: `${makes > 1 ? makes + ' ' : ''}${def.name} (${s.bars} bar${s.bars > 1 ? 's' : ''})`, interval: 5, anim: 'smith',
        reason: lvl('smithing') < s.level ? `You need a Smithing level of ${s.level} to make ${makes > 1 ? lname(def.id) : withArticle(def.id)}.` : null,
        missing: `You need ${s.bars} ${lname(bar)}${s.bars > 1 ? 's' : ''} to make that.`,
        max: () => Math.floor(cnt(bar) / s.bars),
        make() {
          if (!has('hammer')) { say(ctx, 'You need a hammer to work the metal with.', 'warn'); return false; }
          inv().remove(bar, s.bars);
          inv().add(def.id, makes);
          ctx.skills.addXp('smithing', 12.5 * s.bars * (m.tier + 1));
          say(ctx, `You hammer the ${m.name.toLowerCase()} and make ${makes > 1 ? makes + ' ' + lname(def.id) : withArticle(def.id)}.`);
          product('smithing', def.id, makes, 'anvil', e);
        },
      };
    });
  };
  const smithing = makeHandler(ctx, {
    title: 'What would you like to smith?', skill: 'smithing', interval: 5, anim: 'smith', alwaysMenu: true, list: smithList,
    precheck: () => (has('hammer') ? null : 'You need a hammer to work the metal with.'),
    none: "You don't have any bars to smith.",
  });
  actions.register('Smith', smithing, 'object');
  actions.registerUse((id, t) => isObj('anvil')(t) && /_bar$/.test(id), smithing);

  // ======================================================================= fletching
  const fletchList = (e, c) => {
    const log = other(c, (id) => id === 'knife');
    const out = [];
    const sh = FLETCHING.shafts;
    if (log === sh.log) {
      out.push({
        id: sh.product, label: `${sh.qty} arrow shafts`, interval: 3, anim: 'fletch', reason: null,
        max: () => cnt(log),
        make() {
          inv().remove(log, 1); inv().add(sh.product, sh.qty);
          ctx.skills.addXp('fletching', sh.xp);
          say(ctx, `You carefully cut the logs into ${sh.qty} arrow shafts.`);
          product('fletching', sh.product, sh.qty, 'knife');
        },
      });
    }
    for (const bow of BOWS_BY_LOG[log] || []) {
      const f = bow.fletch;
      out.push({
        id: bow.id, label: `${bow.name} (needs a bowstring)`, interval: 3, anim: 'fletch',
        reason: lvl('fletching') < f.level ? `You need a Fletching level of ${f.level} to make ${withArticle(bow.id)}.` : null,
        missing: 'You need a bowstring to string the bow. Spin flax at a spinning wheel.',
        max: () => Math.min(cnt(log), f.strung ? cnt('bowstring') : Infinity),
        make() {
          inv().remove(log, 1); if (f.strung) inv().remove('bowstring', 1);
          inv().add(bow.id, 1);
          ctx.skills.addXp('fletching', 10 + f.level * 1.4);
          say(ctx, `You carve the ${lname(log)} and string ${withArticle(bow.id)}.`);
          product('fletching', bow.id, 1, 'knife');
        },
      });
    }
    return out;
  };
  actions.registerUse(pair((id) => id === 'knife', isLog), makeHandler(ctx, {
    title: 'What would you like to fletch?', skill: 'fletching', interval: 3, anim: 'fletch', approach: null, alwaysMenu: true, list: fletchList,
  }));

  const headless = FLETCHING.headless;
  actions.registerUse(pair((id) => id === 'feather', (id) => id === 'arrow_shaft'), makeHandler(ctx, {
    skill: 'fletching', interval: 2, anim: 'fletch', approach: null,
    list: () => [{
      id: headless.product, label: 'Headless arrows', reason: null,
      max: () => Math.min(cnt('arrow_shaft'), cnt('feather')),
      make() {
        const k = Math.min(headless.qty, cnt('arrow_shaft'), cnt('feather'));
        swap([['arrow_shaft', k], ['feather', k]], [[headless.product, k]]);
        ctx.skills.addXp('fletching', (headless.xp * k) / headless.qty);
        say(ctx, `You attach feathers to ${k} arrow shafts.`);
        product('fletching', headless.product, k, 'feather');
      },
    }],
  }));
  const ARROW_BY_HEADS = Object.fromEntries(FLETCHING.arrows.map((a) => [a.heads, a]));
  actions.registerUse(pair((id) => !!ARROW_BY_HEADS[id], (id) => id === 'headless_arrow'), makeHandler(ctx, {
    skill: 'fletching', interval: 2, anim: 'fletch', approach: null,
    list: (e, c) => {
      const heads = other(c, (id) => id === 'headless_arrow');
      const a = ARROW_BY_HEADS[heads];
      return [{
        id: a.product, label: itemName(a.product),
        reason: lvl('fletching') < a.level ? `You need a Fletching level of ${a.level} to make ${lname(a.product)}s.` : null,
        max: () => Math.min(cnt('headless_arrow'), cnt(heads)),
        make() {
          const k = Math.min(15, cnt('headless_arrow'), cnt(heads));
          swap([['headless_arrow', k], [heads, k]], [[a.product, k]]);
          ctx.skills.addXp('fletching', (a.xp * k) / 15);
          say(ctx, `You attach arrowheads to ${k} arrows.`);
          product('fletching', a.product, k, 'arrowheads');
        },
      }];
    },
  }));

  // ======================================================================= crafting
  const needleList = (e, c) => {
    const mat = other(c, (id) => id === 'needle');
    const defs = mat === 'leather' ? LEATHER_ITEMS : SCALE_ITEMS;
    return defs.map((d) => {
      const per = d.craft.leather || d.craft.scales || 1;
      return {
        id: d.id, label: `${d.name} (${per} ${lname(mat)}${per > 1 ? (mat === 'leather' ? '' : 's') : ''})`, interval: 3, anim: 'craft',
        reason: lvl('crafting') < d.craft.level ? `You need a Crafting level of ${d.craft.level} to make ${withArticle(d.id)}.` : null,
        missing: has('thread') ? `You need ${per} ${lname(mat)} to make that.` : 'You need some thread to sew with.',
        max: () => Math.min(Math.floor(cnt(mat) / per), cnt('thread')),
        make() {
          inv().remove(mat, per); inv().remove('thread', 1);
          inv().add(d.id, 1);
          ctx.skills.addXp('crafting', 14 + d.craft.level * 1.5);
          say(ctx, `You stitch together ${withArticle(d.id)}.`);
          product('crafting', d.id, 1, 'needle');
        },
      };
    });
  };
  actions.registerUse(pair((id) => id === 'needle', (id) => id === 'leather' || id === 'wyrm_scale'), makeHandler(ctx, {
    title: 'What would you like to make?', skill: 'crafting', interval: 3, anim: 'craft', approach: null, alwaysMenu: true, list: needleList,
  }));

  actions.registerUse(pair((id) => id === 'chisel', (id) => !!GEM_CUT[id]), makeHandler(ctx, {
    skill: 'crafting', interval: 2, anim: 'craft', approach: null,
    list: (e, c) => {
      const g = GEM_CUT[other(c, (id) => id === 'chisel')];
      return [{
        id: g.cut, label: itemName(g.cut),
        reason: lvl('crafting') < g.level ? `You need a Crafting level of ${g.level} to cut ${withArticle(g.cut)}.` : null,
        max: () => cnt(g.uncut),
        make() {
          inv().remove(g.uncut, 1); inv().add(g.cut, 1);
          ctx.skills.addXp('crafting', g.xp);
          say(ctx, `You cut the ${lname(g.cut)}.`);
          product('crafting', g.cut, 1, 'chisel');
        },
      }];
    },
  }));

  actions.registerUse(pair((id) => !!AMULET_BY_GEM[id], (id) => id === 'bowstring'), makeHandler(ctx, {
    skill: 'crafting', interval: 2, anim: 'craft', approach: null,
    list: (e, c) => {
      const gem = other(c, (id) => id === 'bowstring');
      const am = AMULET_BY_GEM[gem];
      return [{
        id: am.id, label: am.name,
        reason: lvl('crafting') < am.craft.level ? `You need a Crafting level of ${am.craft.level} to make ${withArticle(am.id)}.` : null,
        max: () => Math.min(cnt(gem), cnt('bowstring')),
        make() {
          swap([[gem, 1], ['bowstring', 1]], [[am.id, 1]]);
          ctx.skills.addXp('crafting', 30 + am.craft.level * 2);
          say(ctx, `You thread the ${lname(gem)} onto the string. ${am.name}!`);
          product('crafting', am.id, 1, 'bowstring');
        },
      }];
    },
  }));

  // Spinning wheel: flax or spider silk -> bowstring.
  const SPIN = [CRAFTING.spin, CRAFTING.silkString];
  const spinList = (e, c) => SPIN.filter((s) => (!c.item || c.item === s.input) && has(s.input)).map((s) => ({
    id: s.input, label: `Bowstring (from ${lname(s.input)})`, interval: 3, anim: 'spin',
    reason: lvl('crafting') < s.level ? `You need a Crafting level of ${s.level} to spin ${lname(s.input)}.` : null,
    max: () => cnt(s.input),
    make() {
      inv().remove(s.input, 1); inv().add(s.product, 1);
      ctx.skills.addXp('crafting', s.xp);
      say(ctx, `You spin the ${lname(s.input)} into a bowstring.`);
      product('crafting', s.product, 1, 'spinning_wheel', e);
    },
  }));
  const spinning = makeHandler(ctx, { title: 'What would you like to spin?', skill: 'crafting', interval: 3, anim: 'spin', list: spinList, none: 'You have nothing to spin. Flax or spider silk would do.' });
  actions.register('Spin', spinning, 'object');
  actions.registerUse((id, t) => isObj('spinning_wheel')(t) && SPIN.some((s) => s.input === id), spinning);

  // Tanning rack: every cowhide at once, for a small CREDIT fee.
  const tanning = {
    approach: () => ({ adjacent: true }),
    start(e) {
      const t = CRAFTING.tan;
      const hides = cnt(t.input);
      if (!hides) { say(ctx, 'You have no cowhides to tan. Cows in Millbrook have plenty.', 'warn'); return false; }
      const bal = ctx.wallet?.balance ?? 0;
      const n = Math.min(hides, Math.floor(bal / t.costMc));
      if (n <= 0) { say(ctx, `The tanner charges ${formatMc(t.costMc)} CREDIT per hide. Your wallet is empty.`, 'warn'); return false; }
      const tx = ctx.wallet.debit(n * t.costMc, `Tanning: ${n} cowhide${n > 1 ? 's' : ''}`, { to: 'millbrook-tannery' });
      if (!tx) return false;
      inv().remove(t.input, n); inv().add(t.product, n);
      if (t.xp) ctx.skills.addXp('crafting', t.xp * n);
      ctx.player.playOnce('craft', 1);
      say(ctx, `The tanner turns ${n} cowhide${n > 1 ? 's' : ''} into leather for ${formatMc(n * t.costMc)} CREDIT.` + (n < hides ? ' You can\'t afford the rest.' : ''), 'chain');
      product('crafting', t.product, n, 'tanning_rack', e);
      events.emit('tan', { qty: n, mc: n * t.costMc });
      return true;
    },
  };
  actions.register('Tan', tanning, 'object');
  actions.registerUse((id, t) => id === 'cowhide' && isObj('tanning_rack')(t), tanning);

  // ======================================================================= inscribing (Arcana)
  const arcanaOpen = () => !!state.flag('unlock:arcana') || (typeof questStage(ctx, 'oracles_price') === 'number' && questStage(ctx, 'oracles_price') >= 3) || questStage(ctx, 'oracles_price') === 'done';
  const inscribeList = () => {
    if (!has('orbium_shard')) return [];
    return INSCRIBING.map((s) => ({
      id: s.sigil, label: `${itemName(s.sigil)} (×${s.perShard(lvl('arcana'))} per shard)`, interval: 2, anim: 'craft',
      reason: lvl('arcana') < s.level ? `You need an Arcana level of ${s.level} to inscribe ${lname(s.sigil)}s.` : null,
      max: () => Math.ceil(cnt('orbium_shard') / 5),
      make() {
        const k = Math.min(5, cnt('orbium_shard'));
        const made = k * s.perShard(lvl('arcana'));
        inv().remove('orbium_shard', k); inv().add(s.sigil, made);
        ctx.skills.addXp('arcana', s.xp * k);
        say(ctx, `You press ${k} orbium shard${k > 1 ? 's' : ''} into ${made} ${lname(s.sigil)}${made > 1 ? 's' : ''}.`);
        product('arcana', s.sigil, made, 'crystal_altar');
      },
    }));
  };
  const inscribing = makeHandler(ctx, {
    title: 'Which sigil will you inscribe?', skill: 'arcana', interval: 2, anim: 'craft', alwaysMenu: true, list: inscribeList,
    precheck: () => (arcanaOpen() ? null : 'The altar stays dark. Perhaps the Orbio Oracle could teach you how to use it.'),
    none: 'You need orbium shards to inscribe sigils. Mine them from the crystals on the plateau.',
  });
  actions.register('Inscribe', inscribing, 'object');
  actions.registerUse((id, t) => id === 'orbium_shard' && isObj('crystal_altar')(t), inscribing);

  // ======================================================================= flour & bread
  const flourKey = 'mill:flour';
  const fill = {
    approach: () => ({ adjacent: true }),
    start(e) {
      const n = cnt('grain');
      if (!n) { say(ctx, 'You have no grain to put in the hopper. Pick some wheat in the fields.', 'warn'); return false; }
      inv().remove('grain', n);
      const total = (state.flag(flourKey) || 0) + n;
      state.flag(flourKey, total);
      ctx.player.playOnce('pick', 1);
      say(ctx, `You pour ${n === 1 ? 'the grain' : n + ' handfuls of grain'} into the hopper. The millstones grind it into flour for the bin below.`);
      events.emit('mill:fill', { qty: n, total });
      return true;
    },
  };
  actions.register('Fill', fill, 'object');
  actions.registerUse((id, t) => id === 'grain' && isObj('hopper')(t), fill);

  const collectFlour = {
    approach: () => ({ adjacent: true }),
    start(e, option, c) {
      if (e.defId !== 'flour_bin') return defaultCollect(e, option, c);
      if (!(state.flag(flourKey) > 0)) { say(ctx, 'The flour bin is empty. Pour some grain into the hopper by the windmill first.', 'warn'); return false; }
      if (!has('pot')) { say(ctx, 'You need an empty pot to collect the flour.', 'warn'); return false; }
      c.next = ctx.ticks.count + 1;
      ctx.player.setAnim('pick');
      return true;
    },
    tick(e, n, c) {
      if (e.defId !== 'flour_bin') return false;
      if (n < c.next) return true;
      c.next = n + 2;
      const left = state.flag(flourKey) || 0;
      if (left <= 0) { say(ctx, 'The flour bin is now empty.'); return false; }
      if (!inv().remove('pot', 1)) return false;
      inv().add('pot_of_flour', 1);
      state.flag(flourKey, left - 1);
      say(ctx, 'You fill a pot with flour from the bin.');
      product('cooking', 'pot_of_flour', 1, 'flour_bin', e);
      return has('pot') && left - 1 > 0;
    },
    stop() { ctx.player.setAnim(null); },
  };
  // The bank booth also has a 'Collect' option (Exchange collection): route it there.
  function defaultCollect() {
    if (ctx.exchange?.collect) ctx.exchange.collect();
    else if (ctx.exchange?.open) ctx.exchange.open({ tab: 'collect' });
    else ctx.ui?.openBank?.();
    return false;
  }
  actions.register('Collect', collectFlour, 'object');
  actions.registerUse((id, t) => id === 'pot' && isObj('flour_bin')(t), collectFlour);

  const bread = CRAFTING.bread;
  actions.registerUse(pair((id) => id === 'pot_of_flour', (id) => id === 'bucket_of_water'), makeHandler(ctx, {
    skill: 'cooking', interval: 2, anim: 'craft', approach: null,
    list: () => [{
      id: bread.product, label: 'Bread dough', reason: null,
      max: () => Math.min(cnt('pot_of_flour'), cnt('bucket_of_water')),
      make() {
        swap(bread.inputs, [[bread.product, 1], ...bread.returns]);
        say(ctx, 'You mix the flour and water into a bread dough.');
        product('cooking', bread.product, 1, 'mixing');
      },
    }],
  }));

  return {
    fires,
    flour: () => state.flag(flourKey) || 0,
    lightFire: (logId = 'logs') => lightFire(ctx.player.x, ctx.player.z, logId),
    update() {},
  };
}
