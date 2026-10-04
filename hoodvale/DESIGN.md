# Hoodvale — Design & Module Contracts

A RuneScape-inspired browser MMO (original IP) set in a medieval fantasy valley, themed on
**Robinhood Chain** (the outlaw guild "the Hood" redistributes the Sheriff's hoarded CREDIT) and
the **Orbio** ecosystem (inference tokenized as CREDIT: the Orbio Oracles answer questions for
CREDIT). Three.js r170 via importmap, native ES modules, no build step, every asset procedural.
Published as a claude.ai Artifact; real multiplayer via the artifact `room` / `db` / `user`
capabilities, real AI via `sample`, all optional (the game is complete single-player).

**Global game: all player-facing text in English. No Indonesian (or other real-culture-specific)
elements.** Code and comments in English. Original names only: do not use RuneScape names,
places, items or UI art (no "Lumbridge", "rune" items, "Grand Exchange" — ours is "the Exchange").

**Read this whole file before writing code.** If you need something outside your files, implement
it inside your files and write the request in `.qa/notes-<builder>.md`.

---

## 1. Pillars & quality bar

1. **The RuneScape loop, polished.** Click-to-walk on tiles, right-click menus, 15 skills to 99,
   gather → process → equip → fight → quest. Satisfying XP drops, level-up fanfares, hitsplats.
2. **A living valley.** Eight zones with their own look, music and monsters; NPCs with things to
   say; three dungeons; bosses; eight quests with real dialogue.
3. **Chain-native economy (simulated).** Your Hood Wallet holds CREDIT; every buy, sell, drop and
   reward is a transaction on a simulated Robinhood Chain with a block explorer. The Exchange in
   Gildmoor matches orders (NPC market makers + other players' orders via `db`).
4. **Orbio minds.** The Oracle (and later other thinking NPCs) sells answers in three tiers
   (Spark 0.002 / Lamp 0.010 / Beacon 0.040 CREDIT). Hand-written answers always work; a "Live"
   option asks the real model through the artifact `sample` capability when available.
5. **Art that holds up.** Stylised low-poly with strong lighting, readable silhouettes, warm
   palette, animated water/foliage, day-night cycle. Every zone gets a distinct identity.

Bar: within 60 seconds a new player has created a character, walked through Brightwater, chopped
a tree, seen an XP drop and talked to a character who sounds like a person.

---

## 2. World & data (fixed — owned by integration)

Coordinates: +x east, +z south, +y up, 1 tile = 1 m, tile (tx, tz) covers [tx, tx+1)×[tz, tz+1),
centre (tx+.5, tz+.5). Water level y = 0. Yaw: `Object3D.rotation.y`, facing (-sin, 0, -cos);
models face local -z. Overworld 320×320; dungeons are separate regions far east
(warrens x0 1000, vault x0 1100, lair x0 1200) reached through portal objects.

Pure data modules (node-friendly, load-bearing — never edit; request changes in notes):
- `js/world/mapgen.js` — heights, tile flags (`T_BLOCK, T_WATER, T_ROAD, T_BRIDGE, T_INDOOR,
  T_WALL, T_CLIFF, T_EDGE`), zones per tile, dungeons, `heightAt`, `tileFlags`, `regionAt`,
  `zoneAt`, `getRegionGrid`, `distToRoad`, `distToRiver`.
- `js/data/zones.js` (ZONES, RIVER, LAKES, ROADS, BRIDGES, FENCES, SPAWN, RESPAWN),
  `buildings.js`, `skills.js`, `items.js` (187 items, values in milli-CREDIT, `formatCredit`),
  `objects.js`, `monsters.js`, `npcs.js`, `economy.js` (SHOPS, recipes, SPELLS, THOUGHT_TIERS),
  `quests.js`, `spawns.js` (`buildSpawns()` → objects/monsters/npcs/portals with tiles).
- `js/world/map.js` — runtime `ctx.map`: `isWalkable, canStep, block/unblock, findPath(sx, sz,
  goal) (goal {x,z} | {x,z,w,d,adjacent} | {x,z,range} ), lineOfSight, nearestWalkable,
  distToFootprint, tileY, heightAt, regionAt, zoneAt, tileFlags`.
- Preview: `node tools/mapview.mjs out.png 3`.

Zones: Brightwater (start village, 186,252), Millbrook Farms (238,238), Saltreach Docks (196,290),
Hoodwood + the Hood camp (150,165 / camp 132,157), Copperhollow mines (82,262), Mistfen swamp
(58,168), Gildmoor walled town + keep + Exchange (250,160), Orbio Spire plateau (258,58), Ashen
Highlands + peak (92,66 / 70,44). Dungeons: Goblin Warrens, the Sheriff's Vault, the Ashen Lair.

---

## 3. Systems & numbers

- **Ticks:** game logic runs on 0.6 s ticks (`ctx.ticks.on(fn, priority)`); rendering
  interpolates (`ctx.ticks.alpha`). Priorities: 10 player movement, 15 current action, 20 NPC/monster
  movement, 30 combat, 50 world, 90 UI/bookkeeping.
- **Movement:** 8-directional A*, no corner cutting, walk 1 tile/tick, run 2 (run energy).
  Interacting walks to an adjacent tile first.
- **Skills:** 15 (`data/skills.js`), classic XP curve to 99, `XP_RATE = 4` applied in
  `skills.addXp`. Hitpoints starts at 10. Combat level formula in `skills.js`.
- **Combat (OSRS-style):** effective level = level + stance bonus (+3 accurate/aggressive/
  defensive) + 8; max hit = floor(0.5 + effStr·(strBonus+64)/640); hit chance from attack roll
  effAtt·(atkBonus+64) vs defence roll effDef·(defBonus+64). XP: 4 per damage to the stance skill
  (+1.33 Hitpoints). Monsters use their att/str/def and `maxHit` from data. Ranged uses archery +
  rng bonus, ammo rstr; magic uses spell maxHit and arcana level. Food heals; death respawns you in
  Brightwater with your items (prototype mercy) and a small CREDIT "medic fee".
- **Gathering/artisan:** success chance rises with level and tool tier; resources deplete and
  respawn per data; cooking burn chance falls to 0 at `stopBurn`.
- **Economy:** all prices in milli-CREDIT (mc), shown as CREDIT with 3 decimals. Shops sell at
  value × markup, buy at value × buyRate. Thieving and monster drops pay CREDIT into the wallet.
  Quest rewards include CREDIT ("airdrops").
- **Chain (simulated):** `ctx.chain` mints a block every ~2 s; every wallet movement is a tx with a
  hash, block number and memo. Clearly labelled "simulated" in UI. No real network, no real value.
- **Orbio thought tiers:** `THOUGHT_TIERS` in `economy.js`. Answers are hand-written per tier
  (Spark = cheap and funny-wrong, Lamp = half right, Beacon = precise). "Live" mode: the `sample`
  capability with the game's lore as context, still charges the Beacon price in simulated CREDIT.
- **Multiplayer (optional, lights up when available):** `room` presence (position, look, combat
  level, current action, chat bubble), public chat on topic `chat`, emotes on topic `emote`;
  `db` for hiscores (`players/{self}`), Exchange orders (`market/{self}/…`), private cloud save
  (`data/users/{self}/save`). Signed-out or public-link viewers play solo.

---

## 4. Module ownership

| Builder | Files (exclusive) |
|---|---|
| integration | `js/main.js`, `js/core/*` (engine, events, input, ticks, state, save, dom, math, noise), `js/world/mapgen.js`, `js/world/map.js`, `js/data/*`, `index.html` (tokens + UI kit), `tools/*` |
| **world** | `js/world/terrain.js, water.js, sky.js, decor.js, mapimage.js` + new `js/world/w-*.js` |
| **props** | `js/props/*` (structures, buildings, objects + new files) |
| **actors** | `js/actors/*` (characters, creatures, animations, combat/skill FX, projectiles) |
| **game** | `js/game/*` (skills, inventory/bank/equipment, actions, entities, player, camera, picking, gathering, artisan, combat, magic, loot) |
| **content** | `js/content/*` (dialogue + every NPC's lines, quests, shops, oracle, travellers, lore) |
| **ui** | `js/ui/*` (whole HUD and every window) |
| **net** | `js/net/*` (chain, wallet, exchange, cloud save + hiscores, room presence + chat, their UI windows/tabs) |
| **audio** | `js/audio/*` |

Baselines from integration already exist in most files (they work, but are crude). Replace them,
keep the APIs. New files go in your own folder.

---

## 5. Module protocol

Each module exports `createX(ctx)` returning an object (optional `update(dt, t)`); creation order
and per-frame order are in `js/main.js`. Read later modules lazily (inside handlers/update).
`ctx` fields: `THREE, engine, scene, camera, renderer, events, input, ticks, state, map, spawns,
debug, time, sky, terrain, water, decor, structures, buildings, objectViews, actors, chain, wallet,
skills, inventory, bank, equipment, actions, entities, player, cameraRig, picking, gathering,
artisan, combat, magic, loot, dialogue, shops, quests, oracle, travellers, lore, exchange, cloud,
room, ui, audio`.

Modes (`state.mode`): `loading → login → play` (+ `dead`, `cutscene`). Ticks only run in
play/dead/cutscene. Save: `state.save` (see `core/state.js`), call `state.markDirty()` after
changes; autosaves every 4 s to localStorage.

Rendering: `engine.preset` (quality tiers: `low|medium|high`; fields `shadows, shadowMapSize,
bloom, vegetationDensity, grass, drawDistance, particles, waterDetail`). Use `THREE.Fog` (set by
sky) — standard materials pick it up; custom ShaderMaterials must include fog chunks
(`fog: true` + `#include <fog_pars_fragment>` etc.). Budgets (draw calls / triangles):
high 300 / 1.2M, medium 200 / 700k, low 130 / 350k. InstancedMesh and merged geometry
(`three/addons/utils/BufferGeometryUtils.js`) for anything repeated.

Artifact constraints: no fetch/XHR to other hosts; scripts only from cdn.jsdelivr.net (three is in
the importmap); no alert/confirm/prompt; storage only via `core/save.js`; capabilities only via
`await window.claude?.use?.(name)` with null handling (see §9 net); must work at phone width with
touch (tap = click, long-press = menu) and with mouse + keyboard.

---

## 6. Core APIs (integration — exist now)

- `events`: `on(name, fn) → off`, `once`, `off`, `emit`.
- `input`: `on('click'|'menu'|'key', fn)`, `pointer {x, y, ndcX, ndcY, inside, moved}`,
  `device ('mouse'|'touch')`, `orbit {yaw, pitch}` + `zoom` per frame, `down(code)`,
  `pressed(code)`, `typing`, `addOrbit`, `addZoom`, `emit` (synthesize).
- `ticks`: `on(fn, priority) → off`, `count`, `alpha`, `advance(n)`; event `tick {n}`.
- `state`: `mode, setMode, save, settings, saveSettings(), flag(name[, v]), markDirty(), flush(),
  newCharacter(name, look), loadLocal(), replace(save, source), hasLocalSave()`; events
  `mode:change`, `save:loaded {source}`, `save:written`.
- `engine`: renderer/scene/camera/composer, `preset`, `quality`, `setQuality`, `setBloom`,
  `onResize`, `stats`, `isTouch`.
- `dom`: `injectStyle(id, css)`, `h(tag, props, children)`, `uiRoot(name)`. UI roots:
  `#overlay` (world-anchored labels, hitsplats), `#hud`, `#windows`, `#menus`, `#toasts`.
  UI kit classes in index.html: `.hv-panel .hv-paper .hv-title .hv-btn(.primary|.chain) .hv-close
  .hv-tabs/.hv-tab(.on) .hv-slot .hv-qty .hv-list .hv-mono .hv-scroll .hv-window` + colour
  helpers. CSS tokens: `--wood-0..3 --brass --parch --parch-dim --ink --paper --hood --blood
  --mana --chain --sky --yellow --cyan --font-display --font-body --font-mono --fs-*`.

---

## 7. Game APIs (game builder; baselines exist)

- `skills`: `xp(id), level(id), current(id), levels(), addXp(id, baseXp) (applies XP_RATE),
  setLevel, combatLevel(), totalLevel(), xpToNext(id), progress(id)`; events `xp {skill, amount,
  total}`, `level:up {skill, level, prev}`.
- `inventory`: `slots[28] ({id, qty}|null), count, has, freeSlots, canAdd([[id, qty]]), add(id,
  qty) → leftover, remove(id, qty) → removed, removeAt(i, qty), swap(a, b), indexOf`; event
  `inventory:change`. `bank`: `items, count, deposit, depositAll, withdraw`; `bank:change`.
  `equipment`: `SLOTS, slots, item(slot), weapon(), canEquip(id), equipFromInventory(i),
  unequip(slot), useAmmo(n), bonuses()`; `equipment:change`.
- `entities`: entity shape in `game/entities.js` header; `get, all, byKind, at(tx, tz), near,
  add, remove, moveTo, spawnItem(id, qty, tx, tz, opts)`; events `entity:add/remove`,
  `entity:death {entity}`.
- `player`: `entity, actor, x, z, pos, yaw, running, moving, hp, maxHp, walkTo(tx, tz),
  walkToEntity(e, goal, cb), stop(), teleport(tx, tz), face(target), setAnim(name|null),
  toggleRun()`; events `player:move, player:arrive, player:teleport {x, z, region}, player:path`.
- `actions`: `register(option, handler, kind?)`, `registerUse(match, handler)`, `perform(entity,
  option)`, `use(itemId, target, invIndex)`, `cancel()`, `current`, `examine(entity)`; handler
  shape in `game/actions.js` header; events `action:start/stop`.
- `cameraRig`: `yaw, pitch, distance, mode ('follow'|'login'|'focus'|'debug'), setMode,
  focusOn(point)`. `picking`: `pick(ndcX, ndcY) → {hits:[{entity, dist}], tile, point}`, `hover`.
- `combat`: `attack(entity)`, `target`, `inCombat`, `style`; events `combat:hit {target, source,
  amount, type: 'hit'|'miss'|'heal'|'burn'}`, `player:death`, `monster:death {entity, killer}`.
- `magic`: `cast(spellId, target?)`, `canCast(spellId)`, `autocast`.
- `loot`: `drop(id, qty, tx, tz, opts)`; event `loot:drop`, `loot:take`.
- Messages to the chatbox: `events.emit('chat:game', {text, kind})` (kinds: game, warn, loot,
  quest, chain, oracle, level).

## 8. UI API (ui builder; baseline exists — keep these names)

`ctx.ui = { message(text, kind), dialogue({ speaker: {name, kind: 'npc'|'player'|'oracle',
npcId?}, text, options?: string[] }) → Promise<index|null>, closeDialogue(), openBank(),
openShop(shopId), openMake({ title, skill?, items: [{id, label?, disabled?, reason?}] }) →
Promise<{id, qty}|null>, openWindow(id, {title, render(el), width}), closeWindow(id),
registerTab({ id, title, icon, order, render(el) }) (side-panel tabs from other builders),
toast(text, opts), update() }`. The UI owns: login + character creator, HUD frame, minimap,
orbs (HP / run / CREDIT), chatbox (game + public + filters + input), hover text, context menu,
side panel (combat styles, skills + skill guides, quests + journal, inventory with drag/use/drop,
equipment + bonuses, spellbook, settings, plus tabs registered by net), XP drops, level-up
popups, hitsplats/health bars (from `combat:hit`), dialogue box, bank, shops, make-X, world map,
death screen, mobile layout.

## 9. Net APIs (net builder; baselines for chain + wallet exist)

- `chain`: `name, address, height, blocks, submit(tx) → tx`; events `chain:tx`, `chain:block`.
- `wallet`: `balance (mc), canAfford, credit(mc, reason, meta) → tx, debit(mc, reason, meta) →
  tx|null, history()`; event `wallet:change {balance, delta, reason, tx}`.
- `exchange`: `open()`, order book per item, NPC liquidity, player orders via `db`.
- `cloud`: `available`, save mirror + hiscores. `room`: `available, peers, say(text)`, remote
  players as `remote` entities with actors.
- Capabilities: `const db = await window.claude?.use?.('db')` etc. — every one may be null; never
  block the game on them. The publish declaration (integration does it) will be:
  `{ db: { rules: [...] }, user: { scopes: ['profile'] }, room: { topics: { chat: 'interact',
  emote: 'interact', trade: 'interact' } }, sample: {} }`. Put the db rules you need in
  `.qa/notes-net.md`.

## 10. Events (common)

`tick, mode:change, game:ready, game:start, save:loaded, settings:change, chat:game {text, kind},
chat:public {from, text, peer}, xp, level:up, inventory:change, bank:change, equipment:change,
wallet:change, chain:tx, chain:block, entity:add, entity:remove, entity:death, player:move,
player:arrive, player:teleport, player:death, action:start, action:stop, combat:hit,
monster:death, loot:drop, loot:take, quest:start {id}, quest:update {id, stage}, quest:complete
{id}, dialogue:open {npcId}, dialogue:close {npcId}, shop:open {id}, bank:open, exchange:open,
zone:enter {zone, name}, region:enter {region}, oracle:answer {tier, live}, peer:join, peer:leave,
emote {name}`.
Add new events freely; document them in your notes file.

## 11. Art direction

Hand-painted-feel stylised low-poly (think a modern take on 2000s fantasy MMOs): chunky readable
shapes, gentle vertex-colour variation, warm key light, cool shadows, soft fog. Zone identities:
Brightwater (sunny thatch-and-timber village by a lake), Millbrook (golden fields, windmill),
Saltreach (grey docks, gulls, boats), Hoodwood (deep green old forest, shafts of light, the Hood's
green tents), Copperhollow (ochre hills, mine carts, lanterns), Mistfen (teal-grey marsh, willows,
mist, fireflies), Gildmoor (stone walls, banners in crimson and gold, the keep), Orbio Spire
(violet-cyan crystals humming with light — the one place that glows), Ashen Highlands (grey
stone, sparse yews, ash, embers near the peak). UI: carved dark wood + brass + parchment, Cinzel
Decorative for titles, Spectral for text, Spline Sans Mono for numbers; RuneScape-like
information density but cleaner.

## 12. Testing

`node tools/smoke.mjs --out .qa/shots-<you> --steps '<json>' [--q low|medium|high] [--mobile]`
(headless Chromium + SwiftShader: slow, 5–15 fps; one browser at a time; short runs). Debug hook
`window.__hv`: `ctx, play(name), teleport(x, z), give(id, qty), level(skill, lvl), credit(mc),
ticks(n), fastForward(seconds), lookFrom([x,y,z],[x,y,z]), follow(), stats()`. Also
`node --check` every file you touch. Look at your screenshots with the Read tool and iterate.
