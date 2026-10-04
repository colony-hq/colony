// Lore: signposts ('Read'), zone and region entry (zone:enter / region:enter for banners, music
// and quests), first-visit descriptions, and quest-aware examine texts for NPCs and objects.
// Owner: content builder.
//
// API: zone (current id), region (current id), visited() -> [zoneId], zoneName(id), read(entity).
// Events out: zone:enter {zone, name, blurb, levels, first, minor}, region:enter {region, name},
//             chat:game.

import { ZONES } from '../data/zones.js';
import { pick } from './dlg-lib.js';

export const EXTRA_ZONES = {
  wilds: { name: 'The Wilds', blurb: 'Open country between the towns. Boars, wolves and the odd bandit.', levels: '5-20' },
  warrens: { name: 'The Goblin Warrens', blurb: 'A city of mud and bad ideas, dug under Copperhollow by goblins.', levels: '2-20' },
  vault: { name: "The Sheriff's Vault", blurb: "Beneath the keep: knights, skeletons and everything the Sheriff has ever taxed.", levels: '28-40' },
  lair: { name: 'The Ashen Lair', blurb: 'Under the Ashen Peak, where the air tastes of ash and old coins.', levels: '40-70' },
};
const REGION_NAMES = { overworld: 'the Vale', warrens: 'The Goblin Warrens', vault: "The Sheriff's Vault", lair: 'The Ashen Lair' };
// Flavour after the portal's own message (quest-aware).
const REGION_ENTER = {
  warrens: (q) => (q?.isDone?.('goblin_bell') ? 'The Warrens are quieter these days. The goblins sulk about their hat.' : 'Somewhere far ahead, something goes DONG.'),
  vault: (q) => (q?.isDone?.('ledger_of_lies') ? "The 'wine cellar' smells of IOUs and wounded pride." : "There is no wine in the Sheriff's 'wine cellar'. There are a great many knights."),
  lair: (q) => (q?.isDone?.('ashen_wyrm') ? 'The lair is cooling. Nothing vast breathes here any more.' : 'The air tastes of ash and old coins. Something vast breathes, far below.'),
};
const FIRST_VISIT = {
  brightwater: 'Brightwater: a lakeside village where every adventurer starts. Friendly, safe, and it smells of bread.',
  farms: 'Millbrook Farms: wheat, cows, chickens and a creaky windmill. Farmer Hale knows every cow by name.',
  docks: 'Saltreach Docks: two piers, one fishmonger and Old Salt. The big fish are off the piers.',
  hoodwood: 'Hoodwood: an old forest of green shade. Somewhere among the trees, the Hood keeps its camp.',
  copperhollow: 'Copperhollow: ochre hills riddled with ore. Goblins dug the Warrens beneath them.',
  mistfen: 'Mistfen: willows, bog pools and mist. Watch your step; the bog watches you.',
  gildmoor: 'Gildmoor: the walled trade town. The Sheriff rules from his keep; the Exchange never sleeps.',
  oracle: 'The Orbio Spire: a plateau of humming crystal. The Oracle answers questions here, for CREDIT.',
  highlands: 'The Ashen Highlands: grey peaks, trolls and stone golems. Something vast sleeps under the Ashen Peak.',
};

export function createLore(ctx) {
  const { events, state, map } = ctx;
  let zone = null, region = null;
  let pendingZone = null, pendingCount = 0;
  const visited = () => state.save.flags?.['lore:visited'] || [];

  const zoneName = (id) => ZONES[id]?.name || EXTRA_ZONES[id]?.name || id || '';
  function zoneInfo(id) {
    const z = ZONES[id] || EXTRA_ZONES[id] || {};
    return { zone: id, name: z.name || id, blurb: z.blurb || '', levels: z.levels || '' };
  }

  function enterZone(id) {
    if (!id || id === zone) return;
    zone = id;
    const v = visited();
    const first = !v.includes(id);
    if (first) state.flag('lore:visited', [...v, id]);
    const info = zoneInfo(id);
    const minor = id === 'wilds';
    events.emit('zone:enter', { ...info, first, minor });
    if (first && FIRST_VISIT[id]) events.emit('chat:game', { text: FIRST_VISIT[id], kind: 'game' });
  }
  // The player module emits region:enter itself; lore only emits it if nobody else does.
  let externalRegion = false, emitting = false;
  events.on('region:enter', () => { if (!emitting) externalRegion = true; });
  function enterRegion(id, announce = true) {
    if (!id || id === region) return;
    const prev = region;
    region = id;
    if (prev && !externalRegion) { emitting = true; events.emit('region:enter', { region: id, name: REGION_NAMES[id] || id, prev }); emitting = false; }
    if (announce && prev && REGION_ENTER[id]) {
      const line = REGION_ENTER[id](ctx.quests);
      setTimeout(() => events.emit('chat:game', { text: line, kind: 'game' }), 1200);
    }
  }
  function here() {
    const p = ctx.player;
    if (!p) return null;
    const cx = p.x + 0.5, cz = p.z + 0.5;
    return { zone: map.zoneAt?.(cx, cz) || null, region: map.regionAt?.(cx, cz)?.id || 'overworld' };
  }

  // Zones flicker at their edges: require two steps in a new zone (teleports apply at once).
  events.on('player:move', () => {
    const h = here();
    if (!h) return;
    enterRegion(h.region);
    if (h.zone === zone) { pendingZone = null; return; }
    if (h.zone !== pendingZone) { pendingZone = h.zone; pendingCount = 1; return; }
    if (++pendingCount >= 2) { pendingZone = null; enterZone(h.zone); }
  });
  events.on('player:teleport', () => {
    const h = here();
    if (!h) return;
    enterRegion(h.region, state.mode === 'play');
    pendingZone = null;
    enterZone(h.zone);
  });
  events.on('save:loaded', () => { zone = null; region = null; });

  // ------------------------------------------------------------------ signposts
  function read(entity) {
    const lines = entity?.spawn?.text || entity?.text || [];
    if (!lines.length) { events.emit('chat:game', { text: 'The sign is too weathered to read.', kind: 'game' }); return; }
    const def = { id: 'signpost', name: 'Signpost' };
    const text = lines.join('\n');
    for (const l of lines) events.emit('chat:game', { text: `The sign reads: ${l}`, kind: 'game' });
    events.emit('sign:read', { entity, text: lines });
    const p = ctx.dialogue?.converse?.(entity, def, async (s) => { await s.frame({ name: 'Signpost', kind: 'narration' }, text); });
    return p;
  }
  ctx.actions?.register?.('Read', { approach: () => ({ adjacent: true }), start(e) { read(e); return false; } }, 'object');

  // ------------------------------------------------------------------ examine overrides
  const Q = () => ctx.quests;
  const done = (id) => !!Q()?.isDone?.(id);
  const stage = (id) => Q()?.stage?.(id) ?? null;
  const NPC_EXAMINE = {
    elder_rowan: () => (done('goblin_bell') ? 'Rings the village bell every dawn again, and smiles while he does it.' : null),
    innkeeper_marta: () => (done('feast_for_brightwater') ? 'Runs the Wobbly Kettle. Owes you a slice of cake. Several, actually.' : null),
    guide_elowen: () => (done('into_the_vale') ? 'She has walked every road in the Vale. Now so will you.' : null),
    robyn: () => (state.flag('hood_member') ? 'Your guildmaster. Steals from the rich, audits the poor, generously.' : null),
    tax_collector: () => (done('ledger_of_lies') ? 'Collects for the Sheriff. Currently collecting himself.' : stage('hoods_oath') === 3 ? 'His left coat pocket bulges with a ledger.' : null),
    sheriff_vane_npc: () => (done('ledger_of_lies') ? "Counting what's left. It doesn't take long." : null),
    old_wren: () => (done('bog_song') ? 'Older than the fen, kinder than she looks, and much happier now the singing has stopped.' : null),
    hermit_grimsby: () => (done('ashen_wyrm') ? 'He was a knight, once. Now he is a hermit who outlived his wyrm.' : null),
    oracle: () => {
      const th = state.save.stats?.thoughts || {};
      const n = (th.spark || 0) + (th.lamp || 0) + (th.beacon || 0);
      return n ? `A mind of light. You have bought ${n} thought${n === 1 ? '' : 's'} from it.` : null;
    },
  };
  const OBJECT_EXAMINE = {
    cave_entrance: () => (done('goblin_bell') ? 'Dark, damp, smells of goblin. Quieter since the bell went home.' : 'Dark, damp, smells of goblin. A faint DONG echoes from deep inside.'),
    chest_vault: () => (done('ledger_of_lies') ? 'The Sheriff\'s strongbox. Empty, apart from IOUs.' : null),
    lair_entrance: () => ((ctx.inventory?.count?.('ash_key') || 0) > 0 ? 'A sealed gate of fused stone. The keyhole glows in time with the key in your pack.' : null),
    signpost: (e) => (e.spawn?.text?.length ? `Points the way: ${e.spawn.text.join('; ')}.` : null),
    crystal_orbium: () => pick(['It hums. Thoughts gather in it like dew.', 'It hums a little louder as you look at it.', 'It seems to be thinking about you. Rude.']),
  };
  function wrapExamine(e) {
    if (!e || e._loreExamine) return;
    const table = e.kind === 'npc' ? NPC_EXAMINE : e.kind === 'object' ? OBJECT_EXAMINE : null;
    const fn = table?.[e.defId];
    if (!fn) return;
    const orig = e.examine;
    e.examine = () => { try { const t = fn(e); if (t) return t; } catch { /* ignore */ } return typeof orig === 'function' ? orig.call(e) : e.def?.examine; };
    e._loreExamine = true;
  }
  for (const e of ctx.entities?.all?.() || []) wrapExamine(e);
  events.on('entity:add', ({ entity }) => wrapExamine(entity));

  return {
    get zone() { return zone; },
    get region() { return region; },
    visited,
    zoneName,
    zoneInfo,
    read,
    readSign: read,
    update() {},
  };
}
