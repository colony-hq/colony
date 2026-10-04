// Gathering skills: woodcutting, mining (incl. orbium crystals + gems), fishing (per-spot modes,
// bait, spots that drift along the shore), thieving (stalls, pickpocketing, coin pouches ->
// CREDIT), picking wheat/flax, eggs from nests, wells, milking cows. Owner: game builder.
//
// Gathering repeats on ticks until the inventory is full or the resource depletes; depleted
// objects show their depleted view (stump, empty rock...) and respawn after def.respawnTicks.
//
// API (ctx.gathering): openPouches() -> bool, pouchValue() -> mc, deplete(entity, ticks?),
//   questItemGate(npcId, itemId) -> bool (overridable: who may receive a pickpocket questItem).
// Events: skill:product {skill, item, qty, source, entity}, skill:fail {skill, reason, item?},
//   thieving:success {target, kind: 'pickpocket'|'stall', loot: {items: [[id, qty]], credit}},
//   thieving:fail {target, kind, damage}, pouch:open {count, mc}, fishing:move {entity, from, to},
//   npc:say {entity, text} (overhead chat), object:deplete / object:respawn {entity}.

import { gatherChance, fishChance, pickpocketChance, stallCaughtChance } from './formulas.js';
import { say, randInt, chance, lname, withArticle, skillName, bestTool, canFit, weighted, questStage, owns, formatMc } from './util.js';

const WC_INTERVAL = 3;
const MINE_INTERVAL = 3;
const FISH_INTERVAL = 5;
const GEMS = [{ item: 'uncut_sapphire', w: 6 }, { item: 'uncut_emerald', w: 3 }, { item: 'uncut_ruby', w: 1 }];
const MAX_POUCHES = 28;
const FISH_TOOL_NAME = { net: 'a small fishing net', rod: 'a fishing rod', flyrod: 'a fly fishing rod', pot: 'a lobster pot', harpoon: 'a harpoon' };
const FISH_START = { Net: 'You cast out your net...', Bait: 'You cast out your line...', Lure: 'You cast out your line...', Cage: 'You lower the cage into the water...', Harpoon: 'You ready your harpoon...' };
const FISH_ANIM = { Net: 'fish_net', Bait: 'fish_rod', Lure: 'fish_rod', Cage: 'fish_net', Harpoon: 'harpoon' };

export function createGathering(ctx) {
  const { events, state } = ctx;
  const respawns = []; // { e, at }
  const adjacent = () => ({ adjacent: true });
  const lvl = (s) => ctx.skills.level(s);

  function product(skill, item, qty, source, entity) {
    events.emit('skill:product', { skill, item, qty, source, entity });
  }
  function deplete(e, ticks = e.def.respawnTicks || 20) {
    ctx.entities.setDepleted(e, true);
    respawns.push({ e, at: ctx.ticks.count + Math.max(2, Math.round(ticks * (0.85 + Math.random() * 0.3))) });
  }
  function stats(key) { const s = state.save.stats; s[key] = (s[key] || 0) + 1; }

  // ---------------------------------------------------------------- woodcutting & mining
  function resourceHandler({ skill, tool, interval, verb, anim, startText, successText, statKey, extra }) {
    return {
      approach: adjacent,
      start(e, option, c) {
        const def = e.def;
        if (e.state.depleted) return false;
        if (lvl(skill) < def.level) {
          say(ctx, `You need a ${skillName(skill)} level of ${def.level} to ${verb} ${def.crystalName || 'this ' + def.name.toLowerCase().replace(/ rocks$/, ' rock')}.`, 'warn');
          events.emit('skill:fail', { skill, reason: 'level' });
          return false;
        }
        const t = bestTool(ctx, tool, skill);
        if (!t.id) {
          const noun = def.model?.kind === 'crystal' ? 'this crystal' : skill === 'mining' ? 'this rock' : 'this tree';
          say(ctx, t.blocked ? `You need a ${skillName(skill)} level of ${t.blocked.level} to use ${withArticle(t.blocked.id)}.`
            : `You need ${tool === 'axe' ? 'an axe' : 'a pickaxe'} to ${verb} ${noun}.`, 'warn');
          events.emit('skill:fail', { skill, reason: 'tool' });
          return false;
        }
        if (!canFit(ctx, def.product)) { say(ctx, `Your inventory is too full to hold any more ${lname(def.product)}.`, 'warn'); return false; }
        c.next = ctx.ticks.count + interval;
        ctx.player.setAnim(anim, { tool: t.id });
        say(ctx, startText(def, t));
        return true;
      },
      tick(e, n, c) {
        if (e.state.depleted) return false;
        if (n < c.next) return true;
        c.next = n + interval;
        const def = e.def;
        const t = bestTool(ctx, tool, skill);
        if (!t.id) { say(ctx, `You need ${tool === 'axe' ? 'an axe' : 'a pickaxe'} to keep going.`, 'warn'); return false; }
        if (!chance(gatherChance(lvl(skill), def.level, t.tier))) return true;
        ctx.inventory.add(def.product, 1);
        say(ctx, successText(def));
        ctx.skills.addXp(skill, def.xp);
        stats(statKey);
        product(skill, def.product, 1, e.defId, e);
        extra?.(e);
        if (chance(def.depleteChance ?? 1)) deplete(e);
        if (!canFit(ctx, def.product)) { say(ctx, `Your inventory is too full to hold any more ${lname(def.product)}.`, 'warn'); return false; }
        return !e.state.depleted;
      },
      stop() { ctx.player.setAnim(null); },
    };
  }

  ctx.actions.register('Chop down', resourceHandler({
    skill: 'woodcutting', tool: 'axe', interval: WC_INTERVAL, verb: 'chop down', anim: 'chop', statKey: 'logs',
    startText: () => 'You swing your axe at the tree.',
    successText: (def) => `You get some ${lname(def.product)}.`,
  }), 'object');

  ctx.actions.register('Mine', resourceHandler({
    skill: 'mining', tool: 'pickaxe', interval: MINE_INTERVAL, verb: 'mine', anim: 'mine', statKey: 'ores',
    startText: (def) => (def.model?.kind === 'crystal' ? 'You tap carefully at the humming crystal.' : 'You swing your pickaxe at the rock.'),
    successText: (def) => (def.product === 'orbium_shard' ? 'You chip a shard of orbium from the crystal. It hums.' : `You manage to mine some ${lname(def.product).replace(/ ore$/, '')}.`),
    extra: (e) => {
      if (e.def.gemChance && chance(e.def.gemChance) && ctx.inventory.freeSlots() > 0) {
        const g = weighted(GEMS).item;
        ctx.inventory.add(g, 1);
        say(ctx, `You just found ${withArticle(g).replace('uncut ', '')}!`, 'loot');
        product('mining', g, 1, e.defId, e);
      }
    },
  }), 'object');

  // ---------------------------------------------------------------- fishing
  const fishSpots = [];
  for (const e of ctx.entities.byKind('object')) {
    if (e.def.skill !== 'fishing') continue;
    e.origin = { x: e.x, z: e.z };
    e.state.moveAt = ctx.ticks.count + randInt(150, 450);
    e.shore = shoreTiles(e.x, e.z, 5);
    fishSpots.push(e);
  }
  function shoreTiles(cx, cz, r) {
    const out = [];
    const T = ctx.map.T;
    for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) {
      const f = ctx.map.tileFlags(x, z);
      if (!(f & T.WATER) || f & T.BRIDGE) continue;
      const land = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
        const g = ctx.map.tileFlags(x + dx, z + dz);
        return ctx.map.isWalkable(x + dx, z + dz) && (!(g & T.WATER) || g & T.BRIDGE);
      });
      if (land) out.push({ x, z });
    }
    return out;
  }
  function moveSpot(e) {
    const taken = new Set(fishSpots.map((s) => s.x + ',' + s.z));
    const cands = e.shore.filter((t) => !taken.has(t.x + ',' + t.z) && Math.max(Math.abs(t.x - e.x), Math.abs(t.z - e.z)) >= 2);
    if (!cands.length) return;
    const to = cands[Math.floor(Math.random() * cands.length)];
    const from = { x: e.x, z: e.z };
    ctx.entities.relocate(e, to.x, to.z);
    events.emit('fishing:move', { entity: e, from, to });
  }

  const fishing = {
    approach: adjacent,
    start(e, option, c) {
      const mode = e.def.modes?.[option];
      if (!mode) return false;
      const lv = lvl('fishing');
      const min = Math.min(...mode.catches.map((k) => k.level));
      if (lv < min) { say(ctx, `You need a Fishing level of ${min} to fish here.`, 'warn'); events.emit('skill:fail', { skill: 'fishing', reason: 'level' }); return false; }
      if (!bestTool(ctx, mode.tool).id) { say(ctx, `You need ${FISH_TOOL_NAME[mode.tool]} to fish here.`, 'warn'); events.emit('skill:fail', { skill: 'fishing', reason: 'tool' }); return false; }
      if (mode.bait && !ctx.inventory.has(mode.bait)) { say(ctx, `You don't have any ${lname(mode.bait)}${mode.bait === 'feather' ? 's' : ''} left.`, 'warn'); return false; }
      if (ctx.inventory.freeSlots() < 1) { say(ctx, 'Your inventory is too full to hold any more fish.', 'warn'); return false; }
      c.mode = mode;
      c.at = { x: e.x, z: e.z };
      c.next = ctx.ticks.count + FISH_INTERVAL;
      ctx.player.setAnim(FISH_ANIM[option] || 'fish_net', { tool: bestTool(ctx, mode.tool).id });
      say(ctx, FISH_START[option] || 'You start fishing.');
      return true;
    },
    tick(e, n, c) {
      if (e.x !== c.at.x || e.z !== c.at.z) { say(ctx, 'The fishing spot has moved.'); return false; }
      if (n < c.next) return true;
      c.next = n + FISH_INTERVAL;
      const mode = c.mode;
      if (mode.bait && !ctx.inventory.has(mode.bait)) { say(ctx, `You have run out of ${lname(mode.bait)}${mode.bait === 'feather' ? 's' : ''}.`, 'warn'); return false; }
      const lv = lvl('fishing');
      const options = mode.catches.filter((k) => k.level <= lv).sort((a, b) => b.level - a.level);
      for (const k of options) {
        if (!chance(fishChance(lv, k.level))) continue;
        if (mode.bait) ctx.inventory.remove(mode.bait, 1);
        ctx.inventory.add(k.item, 1);
        const nm = lname(k.item).replace(/^raw /, '');
        say(ctx, /shrimp|sardine/.test(nm) ? `You catch some ${nm}.` : `You catch ${withArticle(k.item).replace(/raw /, '')}.`);
        ctx.skills.addXp('fishing', k.xp);
        stats('fish');
        product('fishing', k.item, 1, e.defId, e);
        break;
      }
      if (ctx.inventory.freeSlots() < 1) { say(ctx, 'Your inventory is too full to hold any more fish.', 'warn'); return false; }
      return true;
    },
    stop() { ctx.player.setAnim(null); },
  };
  for (const o of ['Net', 'Bait', 'Lure', 'Cage', 'Harpoon']) ctx.actions.register(o, fishing, 'object');

  // ---------------------------------------------------------------- thieving: stalls
  ctx.actions.register('Steal-from', {
    approach: adjacent,
    start(e, option, c) {
      const def = e.def;
      if (e.state.depleted) return false;
      if (lvl('thieving') < def.level) { say(ctx, `You need a Thieving level of ${def.level} to steal from the ${def.name.toLowerCase()}.`, 'warn'); return false; }
      if (ctx.inventory.freeSlots() < 1) { say(ctx, "You don't have enough inventory space.", 'warn'); return false; }
      c.at = ctx.ticks.count + 2;
      ctx.player.setAnim('pickpocket');
      return true;
    },
    tick(e, n, c) {
      if (n < c.at) return true;
      const def = e.def;
      if (e.state.depleted) return false;
      if (chance(stallCaughtChance(lvl('thieving'), def.level))) {
        say(ctx, '"Oi! Thief!" The stall owner cuffs you round the ear.', 'warn');
        const dmg = randInt(1, 2);
        damagePlayer(dmg, e);
        ctx.player.stun(3);
        events.emit('thieving:fail', { target: e, kind: 'stall', damage: dmg });
        return false;
      }
      const loot = weighted(def.loot).item;
      ctx.inventory.add(loot, 1);
      say(ctx, `You steal ${withArticle(loot)} from the ${def.name.toLowerCase()}.`);
      ctx.skills.addXp('thieving', def.xp);
      stats('steals');
      deplete(e);
      product('thieving', loot, 1, e.defId, e);
      events.emit('thieving:success', { target: e, kind: 'stall', loot: { items: [[loot, 1]], credit: 0 } });
      return false;
    },
    stop() { ctx.player.setAnim(null); },
  }, 'object');

  // ---------------------------------------------------------------- thieving: pickpocketing
  const pouches = () => (state.save.pouches ||= []);
  ctx.actions.register('Pickpocket', {
    approach: adjacent,
    start(e, option, c) {
      const th = e.def.thieving;
      if (!th) { say(ctx, 'They have nothing worth taking.'); return false; }
      if (lvl('thieving') < th.level) { say(ctx, `You need a Thieving level of ${th.level} to pick the ${e.name.toLowerCase()}'s pocket.`, 'warn'); return false; }
      if (ctx.inventory.count('coin_pouch') >= MAX_POUCHES) { say(ctx, 'You need to open your coin pouches before you can pick any more pockets.', 'warn'); return false; }
      if (!ctx.inventory.has('coin_pouch') && ctx.inventory.freeSlots() < 1) { say(ctx, "You don't have enough inventory space.", 'warn'); return false; }
      say(ctx, `You attempt to pick the ${e.name.toLowerCase()}'s pocket...`);
      ctx.player.playOnce('pickpocket', 1.2);
      e.state.holdUntil = ctx.ticks.count + 4;
      c.at = ctx.ticks.count + 2;
      return true;
    },
    tick(e, n, c) {
      if (n < c.at) return true;
      const th = e.def.thieving;
      const nm = e.name.toLowerCase();
      if (!chance(pickpocketChance(lvl('thieving'), th.level))) {
        say(ctx, `You fail to pick the ${nm}'s pocket.`, 'warn');
        const text = pickLine(e);
        events.emit('npc:say', { entity: e, text });
        say(ctx, `${e.name}: ${text}`);
        faceEntity(e, ctx.player.entity);
        ctx.entities.playOnce(e, 'attack', 0.8);
        const dmg = randInt(1, th.maxHit || 1);
        damagePlayer(dmg, e);
        ctx.player.stun(th.stunTicks || 4);
        e.state.holdUntil = n + (th.stunTicks || 4);
        events.emit('thieving:fail', { target: e, kind: 'pickpocket', damage: dmg });
        return false;
      }
      const mc = randInt(th.credit[0], th.credit[1]);
      ctx.inventory.add('coin_pouch', 1);
      pouches().push({ mc, from: e.name });
      state.markDirty();
      say(ctx, `You pick the ${nm}'s pocket.`);
      ctx.skills.addXp('thieving', th.xp);
      stats('pickpockets');
      const items = [['coin_pouch', 1]];
      if (th.questItem && game.questItemGate(e.defId, th.questItem) && canFit(ctx, th.questItem)) {
        ctx.inventory.add(th.questItem, 1);
        items.push([th.questItem, 1]);
        say(ctx, `Along with the purse, you lift ${withArticle(th.questItem).replace(/^an? /, 'the ')}.`, 'quest');
      }
      product('thieving', 'coin_pouch', 1, e.defId, e);
      events.emit('thieving:success', { target: e, kind: 'pickpocket', loot: { items, credit: mc } });
      if (ctx.inventory.count('coin_pouch') >= MAX_POUCHES) say(ctx, 'Your coin pouches are bulging. Open them before you pick another pocket.', 'warn');
      return false;
    },
  }, 'npc');

  function pickLine(e) {
    const lines = ['What do you think you\'re doing?', 'Hands off!', 'Thief! Get away from me!', 'I felt that!'];
    if (e.defId === 'tax_collector') return 'Robbing the Sheriff\'s collector? You\'ll hang for this!';
    if (e.defId === 'merchant_gm') return 'Guards! Guards! ...Oh, never mind, I\'ll do it myself.';
    if (e.defId === 'farmer_hale') return 'I know every cow by name, and I know your face now too!';
    return lines[Math.floor(Math.random() * lines.length)];
  }
  function faceEntity(e, t) { const dx = t.x - e.x, dz = t.z - e.z; if (dx || dz) e.yaw = Math.atan2(-dx, -dz); }
  function damagePlayer(dmg, source) {
    if (ctx.combat?.damagePlayer) ctx.combat.damagePlayer(dmg, source, { type: 'hit', retaliate: false });
    else {
      state.save.hp = Math.max(1, state.save.hp - dmg);
      events.emit('combat:hit', { target: ctx.player.entity, source, amount: dmg, type: 'hit' });
    }
  }

  // ---------------------------------------------------------------- picking, nests
  const pickOnce = (verbText) => ({
    approach: adjacent,
    start(e, option, c) {
      if (e.state.depleted) return false;
      const prod = e.def.product;
      if (!canFit(ctx, prod)) { say(ctx, "You don't have enough inventory space.", 'warn'); return false; }
      ctx.player.playOnce('pick', 1);
      c.at = ctx.ticks.count + 1;
      return true;
    },
    tick(e, n, c) {
      if (n < c.at) return true;
      if (e.state.depleted) return false;
      const prod = e.def.product;
      ctx.inventory.add(prod, 1);
      say(ctx, verbText(prod));
      deplete(e);
      product('gathering', prod, 1, e.defId, e);
      return false;
    },
  });
  ctx.actions.register('Pick', pickOnce((p) => (p === 'grain' ? 'You pick some wheat.' : `You pick some ${lname(p)}.`)), 'object');
  ctx.actions.register('Take-egg', pickOnce(() => 'You take an egg from the nest. It\'s still warm.'), 'object');

  // ---------------------------------------------------------------- wells & milking
  const fillLoop = ({ from, to, interval, anim, text, check }) => ({
    approach: adjacent,
    start(e, option, c) {
      if (check && !check(e)) return false;
      if (!ctx.inventory.has(from)) { say(ctx, `You need ${withArticle(from)} to do that.`, 'warn'); return false; }
      c.next = ctx.ticks.count + 1;
      ctx.player.setAnim(anim);
      return true;
    },
    tick(e, n, c) {
      if (n < c.next) return true;
      c.next = n + interval;
      if (check && !check(e)) return false;
      if (!ctx.inventory.remove(from, 1)) return false;
      ctx.inventory.add(to, 1);
      say(ctx, text);
      product('gathering', to, 1, e.defId, e);
      return ctx.inventory.has(from);
    },
    stop() { ctx.player.setAnim(null); },
  });
  const drawWater = fillLoop({ from: 'bucket', to: 'bucket_of_water', interval: 2, anim: 'pick', text: 'You fill the bucket from the well.' });
  ctx.actions.register('Draw-water', drawWater, 'object');
  ctx.actions.registerUse((id, t) => id === 'bucket' && t.kind === 'object' && t.defId === 'well', drawWater);

  const cowOk = (e) => {
    if (!e.alive || e.hidden) return false;
    if (e.ai && e.ai.mode !== 'idle') { say(ctx, 'The cow is far too agitated to be milked right now.', 'warn'); return false; }
    e.state.holdUntil = ctx.ticks.count + 5;
    return true;
  };
  const milk = fillLoop({ from: 'bucket', to: 'bucket_of_milk', interval: 3, anim: 'pick', text: 'You milk the cow.', check: cowOk });
  ctx.actions.register('Milk', milk, 'monster');
  ctx.actions.registerUse((id, t) => id === 'bucket' && t.kind === 'monster' && t.defId === 'cow', milk);

  // ---------------------------------------------------------------- world tick: respawns, fishing spots
  ctx.ticks.on((n) => {
    for (let i = respawns.length - 1; i >= 0; i--) {
      const r = respawns[i];
      if (n < r.at) continue;
      respawns.splice(i, 1);
      if (r.e.state.depleted) ctx.entities.setDepleted(r.e, false);
    }
    for (const e of fishSpots) {
      if (n < e.state.moveAt) continue;
      e.state.moveAt = n + randInt(150, 450);
      moveSpot(e);
    }
  }, 50);

  // ---------------------------------------------------------------- coin pouches
  const game = {
    deplete,
    pouchValue() { return pouches().slice(0, ctx.inventory.count('coin_pouch')).reduce((s, p) => s + p.mc, 0); },
    openPouches() {
      const count = ctx.inventory.count('coin_pouch');
      if (!count) return false;
      ctx.inventory.remove('coin_pouch', count);
      const list = pouches();
      const taken = list.splice(0, count);
      while (taken.length < count) taken.push({ mc: randInt(1, 3), from: 'a stranger' });
      // Keep the ledger no longer than the pouches still owned (banked ones keep their value).
      const owned = ctx.bank.count('coin_pouch');
      if (list.length > owned) list.length = owned;
      const groups = new Map();
      for (const p of taken) {
        const g = groups.get(p.from) || { mc: 0, n: 0 };
        g.mc += p.mc; g.n++;
        groups.set(p.from, g);
      }
      let total = 0;
      for (const [from, g] of groups) {
        total += g.mc;
        ctx.wallet?.credit?.(g.mc, `Pickpocket: ${from}${g.n > 1 ? ' ×' + g.n : ''}`, { from: 'pickpocket' });
      }
      state.markDirty();
      say(ctx, `You open ${count === 1 ? 'the coin pouch' : count + ' coin pouches'}: +${formatMc(total)} CREDIT to your Hood Wallet.`, 'chain');
      events.emit('pouch:open', { count, mc: total });
      return true;
    },
    // Pickpocket questItem rule (overridable): give it during the quest step that needs it, once.
    // The Hood's Oath: step index 3 = "Pickpocket the tax ledger from the tax collector".
    questItemGate(npcId, itemId) {
      if (owns(ctx, itemId)) return false;
      if (itemId === 'tax_ledger') return questStage(ctx, 'hoods_oath') === 3;
      return true;
    },
    update() {},
  };
  return game;
}
