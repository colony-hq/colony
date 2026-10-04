# Game builder notes (js/game/*)

All gameplay systems for the content in `js/data/` are live: gathering, artisan skills, combat
(melee / ranged / magic), monster AI + bosses, loot, portals, banks, signs, chests, death/respawn.
Tests: `node .qa/game-formulas.test.mjs` (formulas) and the smoke scripts `.qa/game-e2e-*.json`
(load `.qa/game-harness.js` in-page, which exposes `window.T` helpers).

## Files

| File | What |
|---|---|
| `actions.js` | Interaction framework (+ `registerDefault`, `resolve`, reach re-check for moving targets, click markers) |
| `utilities.js` | Default handlers: portals, Bank, Collect, Exchange, History, Consult, Talk-to, Trade, Read, chests (Open/Search) |
| `itemops.js` | `ctx.game` — inventory/equipment item option API for the UI |
| `makex.js` | Make-X loop helper (asks `ctx.ui.openMake`, then loops on ticks) |
| `gathering.js` | Woodcutting, mining (+gems, orbium), fishing (modes, bait, drifting spots), thieving (stalls, pickpocket, coin pouches), picking, nests, wells, milking |
| `artisan.js` | Firemaking (fire objects), cooking (fire/range, burn, bread, honey cake), smelting, smithing, fletching, crafting (leather, wyrmscale, gems, amulets, spinning, tanning fee), inscribing, flour chain, bread dough |
| `combat.js` | Combat rolls, stances, auto-retaliate, ranged/LoS/ammo, monster AI, bosses, death/respawn, HP regen, archery targets |
| `magic.js` | Spellbook, sigil costs, infinite-sigil staves, autocast, teleports |
| `loot.js` | Drop tables, rare table, CREDIT loot, ground items (private 60 ticks, despawn 300), Take |
| `entities.js` | Registry + monster sizes, building-aware wandering, NPC hold while talking, spawn helpers, smooth yaw |
| `player.js` | Movement, smooth turning, click markers, run energy, stun, one-shot anims |
| `camera.js` | Smoothed orbit, terrain + roof lift along the sight line, indoor/dungeon zoom cap, shake |
| `formulas.js` / `util.js` | Pure formulas (node-tested) / helpers |
| `inventory.js` `skills.js` `picking.js` | Baselines + `bank.depositEquipment()`, safe 2h/shield swap, `picking.hoverEntity` |

## Inventory item option API (for the UI)

```js
ctx.game.itemOptions(index)        // -> ['Eat'|'Wield'|'Wear'|'Open'|'Read'|'Empty', ..., 'Use', 'Drop', 'Examine']
                                   //    first = left-click default. Logs: ['Use', 'Light', 'Drop', 'Examine'].
ctx.game.useInventory(index, opt)  // perform; 'Use' selects: ctx.game.selected = {index, id}, emits item:select
ctx.game.useItemOn(index, target)  // target = world entity, or { kind: 'item', index } for item-on-item
ctx.game.clearSelection()          // emits item:select {index: -1}
ctx.game.equipmentOptions(slot)    // ['Remove', 'Examine'];  ctx.game.useEquipment(slot, opt)
ctx.game.examineItem(id), ctx.game.describeItem(id) -> {name, examine, value, options}, ctx.game.itemValue(id)
ctx.inventory.options(i) / ctx.inventory.act(i, opt)   // aliases
```
Eating has a 3-tick delay and delays your next attack by 3 ticks in combat. Drop puts the item
on your tile (private to you for 60 ticks).

## Other API additions
- `actions.registerDefault(option, handler, kind?)` (fallbacks; any `register` wins),
  `actions.resolve(entity, option)` (what perform runs), `actions.reached(entity, goal)`.
  `handlerFor()` only returns explicit registrations. Handlers get `start(entity, option, c)`;
  use-handlers get `c.item`, `c.invIndex`, `c.target`.
- `player.walkTo(tx, tz, {cancel, marker})`, `player.playOnce(anim, seconds, opts)`,
  `player.stun(ticks)`, `player.stunned`, `player.region`, `player.entity.hp/maxHp/level`.
- `entities.addObject(defId, x, z, extra)`, `spawnMonster(defId, x, z, {temporary, home})`,
  `relocate(e, x, z)`, `setDepleted(e, on)`, `playOnce(e, anim, s)`, `spawnItem(..., {owner, ticks, privateTicks})`.
  Monsters: `w = d = size`, `hp/maxHp`, `combatUntil` (tick until which to show a health bar),
  `ai {mode: 'idle'|'combat'|'return'|'dead'}`, `dying`, `hidden` while dead.
- `combat`: `attack(e, {spell})`, `target`, `inCombat`, `opponent`, `style`, `styles()`,
  `setStyle(id)`, `autoRetaliate`, `setAutoRetaliate(on)`, `mode()`, `maxHit()`,
  `damagePlayer(n, source, {type, retaliate})`, `healPlayer(n)`, `delayAttack(t)`, `disengage()`,
  `respawn()` (death screen "respawn now"; otherwise automatic 5 ticks after death), `isMulti(x, z)`.
- `magic`: `cast(id, target?)`, `canCast(id)`, `reason(id)`, `book()`, `autocast` / `setAutocast(id|null)`,
  `cost(spell)`, `consume(spell)`, `unlocked()`.
- `loot`: `drop(id, qty, x, z, {owner})`, `dropFor(monster)`, `roll(def)`, `take(e)`, `questDrops` (empty; see below).
- `gathering`: `openPouches()`, `pouchValue()`, `deplete(e, ticks)`, `questItemGate(npcId, itemId)` (overridable).
- `artisan`: `fires`, `flour()`, `lightFire(logId)`.
- `cameraRig`: `shake(strength)`, `release()`, `effectiveDistance`.
- `bank.depositEquipment()`.

## Events (payloads)
Content / quests:
- `skill:product {skill, item, qty, source, entity?}` — every gathered/made item (source = object defId / 'tinderbox' / 'knife' / 'anvil'...).
- `skill:fail {skill, reason: 'level'|'tool'|'burnt'|'impure', item?}`
- `monster:death {entity, killer, x, z}` + `entity:death {entity}` (same death; dedupe by uid), `monster:loot {entity, items, credit}`, `monster:respawn {entity}`, `monster:aggro {entity}`
- `thieving:success {target, kind: 'pickpocket'|'stall', loot: {items: [[id, qty]], credit}}`, `thieving:fail {target, kind, damage}`, `pouch:open {count, mc}`
- `item:used {item, target, targetId}`, `item:select {index, id}`, `item:drop {id, qty, x, z}`, `item:equip {id, slot}`, `item:unequip {id, slot}`, `item:read {id}`, `food:eat {item, heal, hp}`
- `player:enter-portal {id, def, to, label, option, region}`, `region:enter {region, prev}`
- `fire:lit {entity, x, z, log}`, `fire:out {entity}`, `mill:fill {qty, total}`, `tan {qty, mc}`
- `archery:target {entity, hit, total}`, `chest:open {entity, items, credit}`, `sign:read {entity, text}`
- `spell:cast {spell, target}`, `spell:teleport {spell, x, z}`, `magic:autocast {spell}`
- `bank:open {source: 'booth'|'npc'}` (from the default Bank handler)

UI / actors / audio:
- `player:click {x, z, kind: 'walk'|'action', entity?}` — yellow (walk) / red (action) cross at world x/z.
- `combat:hit {target, source, amount, type: 'hit'|'miss'|'heal'|'burn', style?, splash?}`
- `combat:projectile {from, to, kind: 'arrow'|'spell'|'fire', item?, spell?, color?, ticks, fx}` (damage lands after `ticks` × 0.6 s; `fx: true` = visuals already spawned)
- `combat:start {target}`, `combat:end {target}`, `combat:style {style}`, `combat:autoretaliate {on}`
- `boss:special {entity, kind: 'stomp'|'summon'|'breath'|'enrage', phase?: 'windup'|'impact', hit?}`
- `npc:say {entity, text}` (overhead text; also echoed to chat as "Name: text")
- `camera:shake {strength}`, `player:hp {hp, max}`, `player:stun {ticks}`, `run:change {on, exhausted?}`
- `player:death {killer, x, z, region}` (mode -> 'dead'), `player:respawn {x, z, fee}` (mode -> 'play')
- `fishing:move {entity, from, to}`, `object:deplete {entity}`, `object:respawn {entity}`, `entity:move {entity, x, z}`
- `loot:drop {entity, id, qty, x, z, owner, source?}`, `loot:take {entity, id, qty}`, `loot:despawn {entity}`

## Animation names used (actors builder)
All resolve through `a-anim.js` ALIAS: loops via `player.setAnim(name, {tool})` — `chop, mine,
fish_net, fish_rod, harpoon, firemake, cook, smelt, smith, fletch, craft, spin, pick, pickpocket,
teleport`; one-shots via `player.playOnce` — `attack` (weapon-dependent in the actor), `shoot,
cast, eat, pick, pickpocket, stunned`; monsters `attack, crush, breath`; `die` / `hit()` / `revive()`.
Projectiles: combat calls `ctx.actors.fx.shoot / cast / breath` itself and then emits
`combat:projectile {..., fx: true}` — don't spawn a second visual when `fx` is true.

## Requests / notes for other builders
- **ui**: draw click crosses from `player:click`; health bars from `entity.hp/maxHp` while
  `entity.combatUntil > ticks.count` (player entity has `hp/maxHp` getters); `openMake` items
  carry `{id, label, disabled, reason, max}`; death screen on `player:death` (auto-respawn after
  5 ticks, or call `ctx.combat.respawn()`); `ctx.game.selected` + `item:select` for Use mode.
- **actors/props**: fire objects are created at
  runtime with `objectViews.create(e)` (def `fire`), fishing spots are re-created with `create(e)`
  when they drift; ground item views may implement `setVisible(v)` (else `object3d.visible` is used).
- **content**: quest items are yours (bell, vault key, ash key, willow bark); `loot.questDrops`
  is empty. The tax ledger is also given by the pickpocket `questItem` when `hoods_oath` stage = 3
  and not owned (you check `has` too, so no duplicates). Flags read by game: `unlock:arcana`
  (spells; altar also opens at `oracles_price` stage >= 3), `unlock:honey_cake_recipe` (honey cake
  at a range: egg + milk + flour, Cooking 20). Default 'Open' (chest_vault) / 'Search'
  (chest_lair) exist; your 'Open' wins.
- **net**: bank booth 'Collect' falls back to `exchange.collect()` / `exchange.open({tab:'collect'})`.
  Wallet memos used: `Loot: <Monster>`, `Pickpocket: <Name> ×n`, `Medic fee`, `Tanning: n cowhides`,
  `Loot: Sheriff's strongbox`, `Loot: the Ashen Wyrm's hoard`.
- **integration (data)**: the Goblin Warchief (lvl 20, 60 HP, def 14) is tough at the quest's
  combat 8 requirement — realistic around combat 20+ with iron gear and food. Sheriff Vane (120 HP)
  and the Ashen Wyrm (260 HP, def 62) are long fights (2–4 min) with top gear. Consider lower HP if
  playtests feel slow.

## Known issues
- Monsters larger than 1 tile path by their NW anchor tile only (may clip walls slightly).
- Overworld combat is single-way (one attacker at a time); dungeons are multi-way.
- Aggression tolerance: after ~10 min within 10 tiles of one spot (overworld), normal monsters stop
  aggroing; bosses never become tolerant. Players standing indoors are never aggroed by outdoor
  monsters (monsters already fighting you still follow and attack).
- In-page tests: `ctx.ui.openMake` resolves on a microtask, so a make-X loop only starts after the
  current eval step returns (split the start and the fastForward into separate smoke steps).
