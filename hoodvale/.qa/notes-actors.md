# Actors builder notes (js/actors/*)

Procedural skinned characters, creatures, animation and combat/skill FX. One draw call per actor
(body, clothes, armour and held weapon are merged into one SkinnedMesh; skilling tools are a tiny
extra mesh in the hand only while used). Geometry is cached by look (identical NPCs / monsters
share one geometry; each actor owns its skeleton). One shared `MeshStandardMaterial` for all actors
(vertex colours + per-vertex shine/glow attribute + cool rim light).

## Files
| File | What |
|---|---|
| `actors.js` | `createActors(ctx)`: Actor class (state machine, blending, LOD, hit flash, death fade), drivers (humanoid / creature / rigid), equipment mapping, event hooks |
| `a-core.js` | Maths, shared material, `Builder` (merges primitives into skinned geometry), `spineTube`, `membrane`, geometry cache |
| `a-humanoid.js` | Humanoid skeleton (29 bones) + bodies: human (male/female; slim/normal/stout/old), goblin, troll, imp, skeleton, golem; hair, beards, hats, hoods, capes, aprons, robes, every armour kind |
| `a-anim.js` | Humanoid poses: idle/walk/run/ready, weapon holds, keyframed one-shots and skilling loops, aliases |
| `a-gear.js` | Weapons, shields, bows, staves, quivers, tools; tints from METALS / WOODS |
| `a-creatures.js` | Quadruped (rodent/cow/boar/wolf/bear), bird, spider, slime, wyrm (drake + Ashen Wyrm boss), shard wisp, the Orbio Oracle |
| `a-fx.js` | Particles (2 draw calls total), projectiles, bursts, fireworks, swirls, smoke, splashes, sparkles |
| `a-model.js` | Generated character models (Higgsfield concept -> Tripo mesh -> `.qa/lab` auto-rig): loader, textured materials, bind layout from the model's joints |

## Actor API (all baseline methods kept)
```js
const a = ctx.actors.create(spec);
// spec: { kind: 'humanoid', look, player?, npc? } | { kind: 'remote', look } |
//       { kind: 'creature', model, monster } | { kind: 'oracle' }
a.root, a.headHeight (world units, includes scale), a.kind, a.dead, a.current
a.setPosition(x, y, z); a.setYaw(yaw)            // yaw is smoothed (first call snaps)
a.play(name, opts)                               // see below; unknown names -> idle
a.setLook(look); a.setEquipment(save.equipment)  // rebuilds the merged mesh (~20-30 ms)
a.setVisible(v)                                  // hiding a dead actor puffs death smoke
a.hit(opts)                                      // flinch + red flash (deduped within 50 ms)
a.die({ fade })                                  // fall (1.1 s) -> hold -> smoke + fade; idempotent
a.revive()                                       // stand up with a small spawn pop
a.update(dt)                                     // no-op (animation runs in ctx.actors.update)
a.dispose()
// additions
a.emote(name)                // = play(name, { restart: true })
a.setTalking(on)             // talk gestures until setTalking(false); play('talk') every frame also works (times out 0.35 s after the last call)
a.socket(part, out?)         // world pos: 'head' | 'chest' | 'weapon' (blade/staff tip/tool) | 'bow' | 'handR' | 'handL' | 'mouth' | 'feet'
a.timing(name)               // { dur, release, impact } seconds (to sync hitsplats / projectiles)
a.debugPose(name, t); a.freeze(on)   // photo mode for tests
```

### play(name, opts)
- **Loops** (call every frame; idempotent): `idle walk run ready guard sit meditate` and skilling
  `chop mine fish_net fish_rod harpoon cook smith smelt fletch craft pick firemake craftsit`.
- **One-shots** (start once, run to completion layered over the current loop; upper-body only while
  walking): `attack` (weapon-aware: dagger stab/slash, sword slash/stab/slash2, greatsword swing2h,
  axe slash/crush, pickaxe/club crush, bow shoot, unarmed punch/punch2/kick), `slash slash2 stab crush
  swing2h punch punch2 kick shoot cast block teleport eat drink pickpocket stun celebrate jump`,
  emotes `wave cheer bow dance laugh cry think clap shrug yes no angry beckon salute talkgesture`.
  Emotes cancel when the actor starts walking. `hit` = flinch, `die` = die().
- Repeat-call safety: calling the same one-shot every frame (e.g. `player.playOnce` windows) never
  restarts it; a new request after a gap (or `opts.restart`) does.
- `opts`: `{ restart, variant (explicit attack anim), tool (item id or tint for axe/pickaxe tool
  props, e.g. 'steel_axe'), speed (rate), onRelease (fn at the bow release / cast release frame) }`.
- Aliases: woodcutting→chop, mining→mine, fishing/net/cage/pot→fish_net, rod/bait/fly→fish_rod,
  cooking→cook, smithing/anvil→smith, smelting/furnace→smelt, fletching/whittle→fletch,
  crafting/spin/tan→craft, gather/farm→pick, light/firemaking→firemake, thieving→pickpocket,
  stunned/dazed→stun, levelup→celebrate, combat→ready, magic/spell→cast, ranged/archery→shoot.
- Creatures: `idle walk run`; any attack-like name → `attack`; wyrm also `claw breath roar`
  (`attack` alternates bite/claw); `hit`, `die`. Oracle: `consult` / `think` / `cast` (glows,
  hands rise), `talk`.
- Tools appear automatically for skilling (axe/pickaxe tinted by the equipped weapon or
  `opts.tool`, net, rod + fishing line, harpoon, pan, hammer + bar, knife + log, needle + leather,
  tinderbox, ore, food/potion for eat/drink); the equipped weapon is hidden meanwhile.
- Skilling impact FX fire automatically on the impact frame (wood chips, rock chips + sparks, anvil
  sparks, harpoon splash) for actors within 30 m.

## FX API (`ctx.actors.fx`)
Positions accept a Vector3, `[x, y, z]`, `{x, y, z}`, an Actor, or an entity (uses `entity.view`
sockets, else `entity.pos`). Moving targets are tracked in flight.
```js
fx.shoot(source, target, { onHit, color, speed, arc }) -> seconds to impact
   // plays 'shoot' on the source actor and looses an arrow at the release frame (arc + trail)
fx.cast(source, target, { spell: 'ember_bolt' | color: '#ff8a3a', kind: 'bolt'|'rock'|'fire', onHit, size }) -> s
   // plays 'cast', flash at the staff tip, glowing bolt in the spell colour (SPELLS colours)
fx.breath(wyrmActor, target, { duration, color, onHit }) -> s   // plays 'breath' + fire stream
fx.projectile({ from, to, kind: 'arrow'|'bolt'|'fire'|'rock'|'rocket', color, speed, arc, delay, size, onHit, impact }) -> s
fx.hitSpark(at, { color }); fx.burst(at, { color, count, speed, size, life, grav, soft })
fx.levelUp(actor)          // gold rings, rising sparkles, five firework rockets
fx.teleport(at, { color }) // spiral swirl + flash (path sigil colour by default) -> duration
fx.deathSmoke(at, { scale }); fx.smoke(at); fx.dust(at); fx.splash(at, { size })
fx.sparkle(at, { color, duration })   // rare-drop beam + twinkles
fx.heal(at); fx.ring(at, { color }); fx.stun(actor, seconds) (circling stars); fx.motes(at)
fx.chips(at, 'wood'|'rock'|'anvil'|'water'); fx.flash(pos, color, size, life); fx.clear()
```

## Automatic reactions (on by default; switch off with `ctx.actors.auto.<key> = false`)
- `hits`: `combat:hit` → target view `hit()` + spark (`burn` = fire spark, `heal` = heal motes,
  `miss` on a shield-bearer = `block`).
- `deaths`: `monster:death` / `entity:death` → `view.die()`; `player:death` → player actor dies.
- `levelUp`: `level:up` → `fx.levelUp(player.actor)`.
- `talk`: `dialogue:open/close` → NPC `setTalking(true/false)` (uses `entity` from the payload).
- `emotes`: `emote {name, entity?}` → that view (default the player) `emote(name)`.
- `loot`: `loot:drop` with `rare: true` → `fx.sparkle(entity.pos)` (**game**: set `rare` on rare
  table drops if you want the beam).
- `skillFx`: impact chips/sparks during skilling loops.

## Character redesign (round 2)
Humans are now one continuous sculpted surface (`a-body.js`): lofted torso / arms / legs / hands /
boots with anatomical cross-sections skinned across the joints, a shaped head whose front carries a
painted face from the shared decal atlas (`a-face.js`, 2048x2048, 100 cells painted on demand per
recipe: iris, brows, lips, expression, age lines, blush, stubble, freckles, scar), sculpted hair
shells with lock ridges (long hair = fanned locks), beard shells, skin eyelids on the eyes bone for
blinks, and an ink outline (inverted hull, `outlineMaterial()`, ~1.6 px; off on low quality, 30 m
on medium, 55 m on high). Goblins, trolls, imps, skeletons and golems keep the original builders.
Chat-head portraits for dialogue / creator / title are rendered from the real actor
(`ctx.actors.portrait(look, size)` -> canvas; hooked into `ui/portrait.js`).

New look fields: `expr` ('neutral' | 'smile' | 'stern' | 'sly' | 'kind' | 'grumpy' | 'worried'),
`eyes` (iris colour), `freckles`, `scar`, `tired`, `lip`, and garments / accessories: `vest`,
`bodice`, `dress`, `shawl`, `satchel`, `sash`, `necklace`, `glasses`, `eyepatch`, `earrings`,
`bandana`, `flower`, `pipe`, `gloves` (each `true` or a colour). NPCs without `expr` get a stable
pseudo-random expression; remote players and the local player use what they chose.

## Generated models (round 3)
`look.model = '<id>'` swaps the procedural body for a generated, textured model rigged to the same
HB skeleton (`assets/chars/<id>.json` + `.jpg`, same-origin fetch). Until the files arrive the
procedural body stands in and the actor rebuilds when they land (`actors.onModel` lets UI caches
such as portraits refresh). Held weapons / shields / quivers are a second skinned mesh on the same
skeleton; armour pieces are not drawn on generated bodies. No blinking or painted face (the face
is in the texture). Boot waits up to 6 s for `actors.preload()`. Hero list for the creator:
`actors.heroes()`. How to add models: `.qa/lab/README.md`.

## Looks
`look`: `{ body: 'male'|'female', build: 'slim'|'normal'|'stout'|'old', skin, hair: 'short'|'long'|
'braid'|'bun'|'bald'|'tonsure'|'slick'|'ponytail'|'mohawk', hairColor, beard: 'short'|'full'|'long'|
'stubble'|'moustache', top, bottom, boots, hat: 'cap'|'wide'|'straw'|'beanie'|'tricorn'|
'feathered-hat'|'helmet-lamp'|'witch'|'bell'|'crown', hood: colour, cape: colour, apron: colour,
robe: bool, sleeves: 'long'|'short', staff: bool (walking staff), weapon: kind (e.g. 'longbow'),
shield, scarf: colour, scale, eyes: colour }`. Monster bipeds map `model.colors`/`model.gear`
(guards get a tabard in their cloth colour, Sheriff a coat with gold trim + red cape, the Warchief
wears the bell). All equippable `equip.model.kind`s are drawn, tinted by METALS/WOODS/specials.

## Contact shadows
Every visible actor within 70 m gets a soft slope-aligned blob shadow (one InstancedMesh for all,
1 draw call; lighter when shadow maps are on). Named `actor-blobs` in the scene.

## Performance
~173 actors: `actors.update` ≈ 0.5 ms/frame (measured in the village). Full-rate animation within
32 m, every 2nd frame to 64 m, every 4th to 110 m, every 8th beyond; actors past fog far + 25 m are
hidden; shadows only within 42 m. Humanoids 3.5–5.5k triangles (full plate ~7k), creatures
1.4–4.5k. `ctx.actors.stats()` reports counts.

## Requests / notes for other builders
- **game**: nothing required — your current calls (`setAnim(name, {tool})`, `playOnce`,
  `fx.shoot/cast/breath`, `die/revive/hit`, `setVisible`) all work as-is. Optional: pass
  `{ variant }` with `attack` (already done), use `actor.timing('shoot').release` if you want exact
  hitsplat sync, and `rare: true` on `loot:drop` for the sparkle beam. Fishing 'Cage' maps to the
  net pose; use `fish_rod` for Lure/Bait and `harpoon` for Harpoon.
- **ui**: `actor.headHeight` is in world units including scale (Ashen Wyrm ≈ 5, Oracle ≈ 2.95).
  The login preview works with `setLook` live. Hair options `ponytail`/`mohawk`, beards and hats
  are available if you want more creator chips.
- **net**: remote players accept equipment via `setEquipment({slot: {id}})` (as you do) and emotes
  via `emote(name)`.

## Testing
`node --check js/actors/*.js`; studio screenshots: `.qa/shots-actors/*.png` (made with a studio
lineup at x=600,z=600 using `debugPose`).

## Known issues
- No IK: the off hand only approximates the grip on greatswords / two-handed tool swings.
- Equipment / look changes rebuild the merged mesh (~20-30 ms, once per change).
- Quadruped gaits are procedural approximations; contact shadows can clip on very steep slopes.
- `play('bow')` is the bowing emote; the archery attack is `shoot` (or `attack` with a bow).
