# Content builder notes (js/content/*)

Dialogue for every NPC (33 + 10 travellers), all 8 quests end to end, shops, the Orbio Oracle
(hand-written tiers + Live via `sample`), travellers, lore. Tests:
- `node .qa/content-check.mjs` — no browser: every NPC has a tree, every goto resolves, every quest
  stage has journal text, oracle answers exist, then **all 8 quests are played end to end** against
  the real dialogue/quest/shop/oracle modules (+ real actions/inventory/skills/wallet) with a
  scripted UI. Exit code 1 on failure.
  Also covers the `loot.questDrops` path and the Live Oracle with a mock `sample` (success,
  `rate_limited` → Beacon fallback, `not_granted` → Live hidden).
- Browser (`node tools/smoke.mjs --size 960x540 --out .qa/shots-content --steps <file>`):
  `.qa/content-smoke.json` (Elowen, Oracle tiers, shop, signpost, traveller talk),
  `.qa/content-smoke-2.json` (the whole tutorial with real game actions: chop, light, net, cook,
  mine, smelt, smith, rat, bank, hand-in → done, 0.250 CREDIT, 1 QP),
  `.qa/content-smoke-live.json` (Live Oracle with an injected mock `window.claude`),
  `.qa/content-smoke-travellers.json` (travellers at work). All run with `errors: []`.
  Drive dialogue in-page with `__hv.ctx.ui._U.dialogue` (`waiting`, `key('Space')`, `choose(i)`).

## Files
| File | What |
|---|---|
| `dialogue.js` | Engine (trees, conditions/effects, hub topics, sessions, overhead chatter), 'Talk-to' |
| `dlg-lib.js` | `C` conditions, `E` effects, `fmt` text ({name} {npc} {balance} …), `by()` per-NPC text |
| `npc-common.js` | Bankers, Exchange clerks, villagers (+ Gildmoor merchant) |
| `npc-brightwater.js` `npc-countryside.js` `npc-hoodwood.js` `npc-gildmoor.js` `npc-frontier.js` | Every other NPC |
| `quests.js` + `q-*.js` | Quest engine + one file per quest (journal per stage, hints, hooks, dialogue) |
| `shops.js` | Buy/sell vs wallet, stock depletion/restock, 'Trade' |
| `oracle.js` `oracle-answers.js` `oracle-live.js` | Consult flow, 69 hand-written answers, Live prompt |
| `travellers.js` | 10 walking NPC adventurers (kind 'npc', uid `t:<id>`, `def.traveller = true`) |
| `lore.js` | Signposts 'Read', zone:enter / region:enter, first-visit text, examine overrides |
| `util.js` | countItem / giveItem (overflow → bank) / takeItem |

## APIs for the UI
- `ctx.quests`: `list() -> [{id, name, status: 'not_started'|'in_progress'|'done', stage, difficulty,
  questPoints, giver, giverName, summary, canStart, steps}]`, `journal(id) -> [{text, done, kind:
  'summary'|'step'|'req'|'complete'|'reward', current?}]`, `points()`, `totalPoints`, `stage(id)`,
  `status(id)`, `isDone`, `isActive`, `canStart(id) -> {ok, missing[]}`, `hint(id) -> {text, target}`,
  `tracked() -> {id, name, stage, text, target:{x,z}|null}`, `track(id)`, `rewardLines(id)`.
- `ctx.shops`: `info(id)`, `stock(id) -> [{id, name, qty, base, price, sellPrice}]`,
  `priceBuy(id, item, qty)` / `priceSell(id, item, qty)` (totals, mc), `canSell(id, item) -> {ok, reason}`,
  `sellable(id)`, `buy(id, item, qty)` / `sell(id, item, qty)` -> qty done (0 = failed, reason in
  `lastError`), `open(id)`. Events: `shop:open {id}`, `shop:change {id}`, `shop:buy`, `shop:sell`.
- `ctx.oracle`: `consult(entity?)`, `liveAvailable`, `liveState`, `answerFor(topic, tier)`, `ask(topic, tier)`.
- `ctx.dialogue`: `start(npcEntity|npcId)`, `close()`, `active`, `say(entity, text, {secs})`.
- `ctx.lore`: `zone`, `region`, `visited()`, `zoneName(id)`, `read(entity)` / `readSign(entity)`.
- `ctx.travellers`: `list`, `get(id)`.

## Events
Out: `dialogue:open {npcId, entity}`, `dialogue:close {npcId, entity}`, `npc:say {entity, text, secs}`
(also stored on `entity.say = {text, until}`), `quest:start {id, name}`, `quest:update {id, stage}`,
`quest:complete {id, name, rewards[], points}`, `quest:hint {id, stage, text, target}` (point the
minimap/world map at `target`), `zone:enter {zone, name, blurb, levels, first, minor}` (minor = the
wilds), `region:enter` (only if the player module doesn't emit it), `oracle:answer {tier, live, topic,
text, question}`, `shop:*`, `bank:open` / `exchange:open` (fallback handlers only), `sign:read`,
`redistribution {by}` (Ledger of Lies finale), `skill:product {skill:'arcana', source:'sol'}` (Sol's
guided inscription).
In (all optional; every quest also polls inventory/XP/kill counters): `xp`, `monster:death`,
`entity:death`, `skill:product`, `thieving:success`, `item:used`, `action:start`, `player:teleport`,
`player:enter-portal`, `region:enter`, `bank:open`, `archery:target`, `inventory:change`,
`dialogue:dismiss` (closes the conversation), `player:path` (walking away closes it).

## Save data
`state.save.quests[id]` (stage | 'done'), `state.save.questData[id]` (snapshots, counters,
`_tracked`), flags: `unlock:<reward unlock>`, `hood_member`, `arcana_trial` (oracles_price stage ≥ 3),
`title` = 'Wyrmbane', `lore:visited` [zone ids], `seen:<key>`, `feast:hale_egg`, `oath:trick_until`.
`state.save.stats.thoughts.{spark,lamp,beacon,live}`.

## Integration with the game module
- Quest items from monsters go through `ctx.loot.questDrops` (pushed at `game:ready`): Warchief →
  village_bell, vault knight → vault_key, stone golem → ash_key (chance 1, while the quest is active
  and the item isn't owned). Without a loot module the quests hand the items over on the kill.
- Fallback handlers are registered only when `actions.resolve()` finds nothing (Bank/Exchange on NPCs,
  Shoot, the vault strongbox 'Open'); the game's defaults run otherwise. Content always registers
  'Talk-to' (npc), 'Trade' (npc), 'Consult', 'Read' (object), and a use-handler knife → willow tree
  (peels willow bark during Bog Song).
- The tax ledger: the game's pickpocket questItem gate gives it at hoods_oath stage 3; content also
  offers a dialogue trick on the tax collector ("Is that Robyn behind you?!") because the collector
  is a Thieving-25 pickpocket while the quest only requires Thieving 10.

## Requests
- **integration (data)**: hoods_oath requires Thieving 10 but the tax collector's pickpocket level is
  25 (content works around it with the dialogue trick; consider lowering his level to 15 or the
  quest's requirement wording). The Warchief at combat 8 is hard (see notes-game.md).
- **ui**: travellers are `kind: 'npc'` entities whose ids are not in `NPCS` (`def.traveller = true`,
  `def.role = 'Traveller'`, `speaker.look` is passed in dialogue frames). The Oracle's free-text box is
  a small `.hv-window.hv-panel.hv-oracle-ask` element content adds to `#windows` (only when `sample`
  is available).
- **audio**: `zone:enter` carries `first` and `minor` (wilds).
