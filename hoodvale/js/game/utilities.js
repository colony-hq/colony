// Default handlers for utility options: portals (Enter / Exit / Climb-down / Climb-up), banks,
// the Exchange, the Oracle, signposts, chests, and NPC Talk-to / Trade fallbacks.
// Registered with actions.registerDefault so content/net/ui registrations always take priority.
// Owner: game builder.
//
// Events: player:enter-portal {id, def, to, label, option, region}, chest:open {entity, items, credit}.

import { say, randInt, owns, questActive, hasEquipped, itemName, formatMc } from './util.js';

const PORTAL_TEXT = {
  cave_entrance: 'You squeeze into the dark, damp tunnel. Somewhere ahead, goblins are arguing.',
  cave_exit: 'You climb back out into the open air.',
  vault_stairs: "You creep down the narrow stairs into the Sheriff's vault.",
  vault_stairs_up: 'You climb back up into the keep.',
  lair_entrance: 'The Ashen key glows white-hot. The fused gate grinds open onto a breath of scorching air...',
};

export function installUtilities(ctx, actions) {
  const { events } = ctx;
  const adjacent = () => ({ adjacent: true });

  // ---- Portals ----------------------------------------------------------------
  const portal = {
    approach: adjacent,
    start(e, option, c) {
      const to = e.spawn?.to;
      if (!to) { say(ctx, 'It doesn\'t lead anywhere you can go.'); return false; }
      const req = e.spawn.requires;
      if (req && !ctx.inventory.has(req) && !hasEquipped(ctx, req)) {
        say(ctx, e.defId === 'lair_entrance'
          ? 'The gate is sealed with fused stone. A keyhole glows faintly orange. You need a key.'
          : `You need ${itemName(req)} to go that way.`, 'warn');
        return false;
      }
      ctx.combat?.disengage?.();
      ctx.player.playOnce('pick', 1.2);
      c.at = ctx.ticks.count + 2;
      say(ctx, PORTAL_TEXT[e.defId] || 'You step through.');
      events.emit('player:enter-portal', { id: e.uid, def: e.defId, to, label: e.spawn.label || null, option, region: ctx.map.regionAt(to.x + 0.5, to.z + 0.5).id });
      return true;
    },
    tick(e, n, c) {
      if (n < c.at) return true;
      const to = e.spawn.to;
      const w = ctx.map.isWalkable(to.x, to.z) ? to : ctx.map.nearestWalkable(to.x, to.z, 5) || to;
      ctx.player.teleport(w.x, w.z);
      return false;
    },
  };
  for (const o of ['Enter', 'Exit', 'Climb-down', 'Climb-up']) actions.registerDefault(o, portal, 'object');

  // ---- Banks, Exchange, Oracle ----------------------------------------------------
  const once = (fn) => ({ approach: adjacent, start(e, option) { fn(e, option); return true; } });
  actions.registerDefault('Bank', once((e) => {
    ctx.ui?.openBank?.();
    events.emit('bank:open', { source: e.kind === 'npc' ? 'npc' : 'booth' });
  }));
  actions.registerDefault('Collect', once(() => {
    if (ctx.exchange?.collect) ctx.exchange.collect();
    else if (ctx.exchange?.open) ctx.exchange.open({ tab: 'collect' });
    else ctx.ui?.openBank?.();
  }), 'object');
  actions.registerDefault('Exchange', once(() => {
    if (ctx.exchange?.open) ctx.exchange.open();
    else say(ctx, 'The Exchange is closed for now.');
  }));
  actions.registerDefault('History', once(() => {
    if (ctx.exchange?.open) ctx.exchange.open({ tab: 'history' });
    else ctx.ui?.openWindow?.('wallet');
  }));
  actions.registerDefault('Consult', once((e) => {
    if (ctx.oracle?.consult) ctx.oracle.consult(e);
    else if (ctx.dialogue?.start) ctx.dialogue.start('oracle', e);
    else say(ctx, 'The crystal hums, but says nothing.');
  }));

  // ---- NPC fallbacks (content registers the real ones) ------------------------------
  actions.registerDefault('Talk-to', once((e) => {
    if (ctx.dialogue?.start) ctx.dialogue.start(e.defId, e);
    else say(ctx, `${e.name} nods at you.`);
  }), 'npc');
  actions.registerDefault('Trade', once((e) => {
    const shop = e.def?.shop;
    if (!shop) { say(ctx, `${e.name} has nothing to sell.`); return; }
    if (ctx.shops?.open) ctx.shops.open(shop, e);
    else ctx.ui?.openShop?.(shop);
  }), 'npc');

  // ---- Signposts ----------------------------------------------------------------
  actions.registerDefault('Read', once((e) => {
    if (ctx.lore?.readSign) { ctx.lore.readSign(e); return; }
    const lines = e.spawn?.text || [e.def.examine];
    for (const l of lines) say(ctx, l);
    ctx.ui?.dialogue?.({ speaker: { name: e.name, kind: 'npc' }, text: lines.join('\n') });
    events.emit('sign:read', { entity: e, text: lines });
  }), 'object');

  // ---- Chests -------------------------------------------------------------------
  const bossAlive = (defId) => [...ctx.entities.all()].some((m) => m.kind === 'monster' && m.defId === defId && m.alive && !m.hidden);
  const lootState = () => (ctx.state.save.flags['chest:loot'] ||= {});
  actions.registerDefault('Open', {
    approach: adjacent,
    start(e) {
      if (e.defId !== 'chest_vault') { say(ctx, 'It won\'t open.'); return false; }
      if (bossAlive('sheriff_vane')) { say(ctx, '"Hands off my strongbox, outlaw!" Sheriff Vane stands between you and the chest.', 'warn'); return false; }
      if (!ctx.inventory.has('vault_key')) { say(ctx, 'The strongbox is locked. The lock looks cut for one heavy iron key.', 'warn'); return false; }
      ctx.player.playOnce('pick', 1.2);
      const items = [];
      if (questActive(ctx, 'ledger_of_lies') && !owns(ctx, 'sheriff_ledger')) {
        if (ctx.inventory.add('sheriff_ledger', 1) === 0) items.push(['sheriff_ledger', 1]);
      }
      // Once per Sheriff kill: the hoard of stolen CREDIT.
      const kills = ctx.state.save.stats.kills?.sheriff_vane || 0;
      let credit = 0;
      if (kills > (lootState().vault || 0)) {
        lootState().vault = kills;
        credit = randInt(150, 400);
        ctx.wallet?.credit?.(credit, "Loot: Sheriff's strongbox", { from: 'sheriff-vault' });
      }
      ctx.state.markDirty();
      if (items.length) say(ctx, 'Under a false bottom you find the true ledger. Every stolen CREDIT, in the Sheriff\'s own hand.', 'quest');
      if (credit) say(ctx, `You redistribute ${formatMc(credit)} CREDIT of stolen taxes into your wallet.`, 'loot');
      if (!items.length && !credit) say(ctx, 'The strongbox is empty. The Sheriff will refill it soon enough.');
      events.emit('chest:open', { entity: e, items, credit });
      return true;
    },
  }, 'object');
  actions.registerDefault('Search', {
    approach: adjacent,
    start(e) {
      if (e.defId !== 'chest_lair') { say(ctx, 'You find nothing of interest.'); return false; }
      if (bossAlive('ashen_wyrm')) { say(ctx, 'The Ashen Wyrm would notice you rummaging through its hoard. Probably with fire.', 'warn'); return false; }
      ctx.player.playOnce('pick', 1.2);
      const kills = ctx.state.save.stats.kills?.ashen_wyrm || 0;
      if (kills <= (lootState().lair || 0)) { say(ctx, 'Ash, bones and old debts. Nothing you can carry.'); return true; }
      lootState().lair = kills;
      ctx.state.markDirty();
      const table = [['uncut_ruby', randInt(1, 3)], ['starmetal_ore', randInt(2, 4)], ['elder_logs', randInt(2, 6)], ['orbium_shard', randInt(10, 30)]];
      const items = [];
      for (const [id, q] of table) {
        if (Math.random() < 0.6) {
          const left = ctx.inventory.add(id, q);
          if (left > 0) ctx.loot?.drop?.(id, left, ctx.player.x, ctx.player.z, { owner: 'player' });
          items.push([id, q]);
        }
      }
      const credit = randInt(600, 1600);
      ctx.wallet?.credit?.(credit, "Loot: the Ashen Wyrm's hoard", { from: 'ashen-lair' });
      say(ctx, `You sift the hoard and find ${formatMc(credit)} CREDIT${items.length ? ' and some treasures' : ''}.`, 'loot');
      events.emit('chest:open', { entity: e, items, credit });
      return true;
    },
  }, 'object');
}
