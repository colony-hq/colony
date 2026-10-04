# LENTERA: Kabut Nusantara — Design & Module Contracts

Browser 3D open-world adventure prototype. Three.js r170 via importmap, native ES modules, no
build step. Published as a claude.ai Artifact (content-only `index.html` + `js/**`).

**Read this whole file before writing code.** The APIs and event names below are contracts
between parallel builders. If you need something that is not here, implement it inside your own
files and write the request in `.qa/notes-<builder>.md` — do not edit files you do not own.

---

## 1. Pitch, pillars, quality bar

A kabut (mind-fog) has swallowed a small island in the Nusantara seas. You arrive by perahu at
dusk carrying a lentera (oil lantern) whose light pushes the fog back in a bubble around you.
The islanders still talk, but thinking costs them: every question you ask is paid in **CREDIT**
(simulated, Orbio-style inference credit). Ask cheaply (**Redup**) and you get a dim, confused,
often hilarious answer; pay more (**Sedang**, **Terang**) and the answer gets sharper. Find the
three **Api Pusaka** (sacred flames), carry them to the dark **mercusuar** (lighthouse), and
relight it to lift the kabut from the whole island.

Pillars:
1. **Light is the verb.** Lantern bubble, lighting campfires (permanent clearings), flaring at
   spirits, lighting pelita, relighting the lighthouse. Every success makes the world visibly
   brighter.
2. **Thinking has a price.** The CREDIT purse makes dialogue a choice. Redup vs Terang must be
   funny and useful in contrast.
3. **Console feel.** Responsive controls (coyote time, jump buffer, glide, swim), a camera that
   never fights you, juicy feedback (bloom, shake, particles, sound), readable UI, gamepad support.

Quality bar for the first 30 seconds: fade in on the sea at dusk, boat gliding to the pier in
thick fog, title card, the lantern igniting with a bloom flash while the fog rolls back. The
player must feel "this is a real game" before touching a key.

Language: **all player-facing text in casual Indonesian** ("kamu", "nggak", "aja", "dong").
**Code, identifiers and comments in English.**

---

## 2. World

Coordinates: +x east, +z south, +y up, metres. Sea level y = 0. Island ~470 m across.
**Yaw convention:** `yaw = Object3D.rotation.y`; facing direction = `(-sin yaw, 0, -cos yaw)`.
Yaw 0 faces north (-z). Build every model facing its local **-z**.

`js/world/heightfield.js` is the single source of truth (pure module, also runs in node):
`heightAt(x,z)`, `normalAt`, `slopeAt`, `isWater`, `waterDepth`, `distToPath`, `distToRiver`,
`LANDMARKS`, `CHECKPOINTS`, `PATHS`, `EXCLUSIONS`, `SEA_LEVEL`, `GRID_*`.
**Never change heightfield.js or LANDMARKS numbers** (owned by integration). Preview:
`node tools/heightmap.mjs out.png` prints heights at every landmark.

| Place | Where | Notes |
|---|---|---|
| Pier / spawn | x 0, z 196→248, deck y 1.6 | spawn z 242 facing north |
| Kampung | centre (0,158), floor y 3.0, r 36 | 5 rumah panggung (deck y 4.8), warung, campfire (checkpoint) |
| Mercusuar | (200,40), platform y 19 | tower r 3.2 h 30, 3 tungku sockets, door west |
| Candi | (30,-138), courtyard y 34 | 3 terraces (tops 36/38/40), shrine top 47, chamber floor 40, door south (z -133), 4 pelita, relief |
| Air terjun | lip (-156,-33) y 29.2, pool cove (-178,-30) | mesa top ~30, cave slot behind falls (floor 1.4), Api Tirta (-140.5,-33) |
| Kapal karam | hull (-214,150), yaw -1.107 | in ~2.6 m water, stern cabin (-222.5,156) holds Api Samudra |
| Gunung | peak (-40,-62) y ~77 | glide launch |
| Checkpoints | kampung (0,158), tirta (-172,2), candi (36,-100) | api unggun |

NPC spots: `LANDMARKS.npcs` (sarni, darto, ratih, laras, lamun).

---

## 3. Story, characters, quest flow

**Mbah Sarni** (elder, kampung campfire) — warm, a little Javanese ("Nak", "lho", "monggo").
Her husband **Ki Lamun** kept the lighthouse and vanished into the kabut 20 years ago.
**Pak Darto** (fisherman, pier) — blunt, sea slang, knows the shipwreck.
**Bu Ratih** (warung) — chatty gossip, knows the waterfall cave and everybody's business.
**Laras** (student sketching the candi, candi campfire) — Gen-Z ("jujur", "literally"), knows the
relief and the pelita order.
**Ki Lamun** (translucent spirit by the lighthouse door) — poetic, melancholic; explains the
sockets; reunites with Sarni in the finale.

The kabut came when the island stopped asking questions (thinking felt too costly). Theme line
(finale, Ki Lamun): "Pikiran memang ada harganya, Nak. Tapi pulau yang berhenti bertanya,
bayarnya jauh lebih mahal."

Quest steps (`state.progress.quest`, owned by gameplay/quest.js):

1. `arrive` — intro cinematic (boat → pier → lantern ignites). Objective: "Temui Mbah Sarni di
   api unggun kampung." Done when Sarni's dialogue closes.
2. `kindle` — "Nyalakan api unggun kampung dengan lenteramu." Interact with the kampung campfire
   (checkpoint) → big clearing over the kampung (first reveal).
3. `seek` — "Temukan tiga Api Pusaka (0/3)." Flames can be found in any order. A flame's place
   gets a compass marker once its location clue is known (`loc_tirta`, `loc_bumi`,
   `loc_samudra`) or once the player has been within 40 m of it.
4. `beacon` — after at least one flame is carried: "Bawa Api Pusaka ke mercusuar (n/3)." Place at
   the tungku sockets. When all three are placed → `finale`.
5. `finale` → cinematic → `done` (free roam at dawn, no kabut, no spirits).

Candi puzzle: the shrine door is sealed. Light the four pelita on terrace 1 in the order
**utara → timur → selatan → barat** (north, east, south, west: "ikuti matahari… terbalik" is the
relief's cryptic hint; Laras' Terang answer states it clearly). Wrong order → all four go out
(soft fail, no cost). Correct → door slides open (`structures.setCandiDoor(true)`), Api Bumi
inside.

Failure: Nyala 0 → "pingsan": fade out, respawn at `lastCheckpoint` with Nyala 60. Carried flames
are kept. `progress.deaths++`.

---

## 4. Systems & numbers

**Nyala** (lantern light, 0–100, `state.addNyala(delta, reason)`): lantern bubble radius
`lanternRadius = 7 + 11 * nyala/100` (m). Spirit touch −20. Flare costs 12 (cooldown 1.5 s,
needs ≥12). Kilau +6. Resting at a lit campfire refills to 100. Below 25 the HUD warns.

**CREDIT** (simulated purse, `state.progress.credit`): start **0.50**. Thought costs: Redup
**0.002**, Sedang **0.010**, Terang **0.040**. Kilau +0.003 each (≈60 on the island). If the
balance drops below 0.002, Mbah Sarni gifts 0.05 once. Every spend produces a fake receipt
(tokens, model label, short tx hash, "simulasi"). All UI must say it is simulated.

**Hantu Kabut** (fog spirits): spawn only where `fog.fogAmount(x,y,z) > 0.5`, 25–45 m from the
player, max 3/5/7 (low/medium/high), never inside lit-campfire clearings, despawn > 70 m. Drift
2.4 m/s toward the player inside 22 m; slowed ×0.4 and flickering inside the lantern bubble.
Touch: Nyala −20, knockback 6 m/s, camera shake, 1.2 s invulnerability. Flare (radius 12 m)
banishes them into 3 Kilau motes.

**Kilau** (collectibles, ~60): breadcrumbs along PATHS + rewards at vistas (roof tops, gunung
peak, mesa, wreck masts, temple terraces). Auto-collect within 1.3 m.

**Flames**: Api Tirta (cyan-white `#bff6ff`), Api Bumi (amber-red `#ffb04a`), Api Samudra
(blue-violet `#8fa2ff`). Carried flames orbit the lantern.

---

## 5. Architecture

```
index.html            content-only page: <title>, tokens, importmap, UI roots, loading screen
js/main.js            boot order + main loop (integration)
js/core/              engine, events, input, state, save, interact, math, noise, dom (integration)
js/core/audio.js      synth audio (gameplay-ui)
js/world/heightfield.js, collision.js      (integration, fixed)
js/world/terrain.js, ocean.js, sky.js, fog.js            (landscape)
js/world/vegetation.js, structures.js                    (setdressing)
js/player/character.js, controller.js, camera.js, js/ui/touch.js     (player)
js/npc/npcs.js, dialogue.js, mind.js, credit.js, js/ui/journal.js    (npc-ai)
js/gameplay/quest.js, flames.js, spirits.js, checkpoints.js, finale.js,
js/ui/hud.js, menus.js, prompts.js, js/core/audio.js                 (gameplay-ui)
tools/                serve.mjs, make-dev.mjs, smoke.mjs, heightmap.mjs
```
Builders may add new files inside their own folders/prefix (e.g. `js/gameplay/intro.js`,
`js/world/water-shaders.js`) and import them from their own modules.

**Module protocol.** Every module exports `createX(ctx)` returning an object with optional
`update(dt, t)`. Creation order (main.js): fog → sky → terrain → ocean → structures →
vegetation → player + cameraRig → credit → mind → npcs → dialogue → journal → flames →
checkpoints → spirits → quest → finale → hud → prompts → menus → touch. A module may read
earlier modules at creation; read later ones lazily (inside update or handlers).

**ctx fields:** `THREE, engine, scene, camera, renderer, events, input, state, interact, audio,
collision, debug, time {t, dt, frame}, world {fog, sky, terrain, ocean, structures, vegetation},
fog, sky, terrain, ocean, structures, vegetation, player, cameraRig, credit, mind, npcs,
dialogue, journal, flames, checkpoints, spirits, quest, finale, hud, prompts, menus, touch`.

**Update order per frame:** `input → menus → player, npcs, flames, checkpoints, spirits, quest,
finale → cameraRig → fog → sky, ocean, structures, vegetation, terrain → interact → dialogue,
journal, hud, prompts, touch → audio → render`. World/gameplay modules receive `dt = 0` while
paused; UI modules always get real dt. Check `ctx.state.mode` yourself.

**Modes** (`state.mode`): `loading, title, intro, play, dialogue, journal, pause, cinematic,
finale`. Use `state.setMode(m)`, overlays use `state.pushMode(m)` / `state.popMode()`.
Player input only acts in `play`.

**Rendering rules**
- Every material must get the kabut: `patchMaterial(mat)` from `world/fog.js` (built-ins), or for
  ShaderMaterials merge `fogUniforms` and include `FOG_GLSL.parsVertex/parsFragment/vertex/apply`.
  main.js also runs `patchObject(scene)` once after boot as a safety net — anything created later
  must be patched by its creator. Additive materials are handled automatically.
- Tone mapping ACES + bloom (threshold 0.86). Emissive values > 1 bloom. Keep large surfaces
  below the threshold; let lanterns, fires, windows, Kilau, flames glow.
- Quality: read `ctx.engine.preset` (`vegetationDensity, grass, particles, shadows,
  shadowMapSize, drawDistance, waterDetail`) when building. Budgets (high/medium/low):
  draw calls ≤ 250/180/120, triangles ≤ 1.2M/600k/300k. Use InstancedMesh and merged
  geometries (`BufferGeometryUtils.mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js`).
- No external assets: geometry is procedural, textures are CanvasTexture/DataTexture.
- Shadows: only the sun casts; cast from characters, trees, structures; terrain receives.

**Artifact constraints (hard):** no `fetch`/XHR to any host; scripts only from
cdn.jsdelivr.net/npm (three r170 is pinned in the importmap); no `alert/confirm/prompt`;
localStorage only through `core/save.js`; no query-string features outside debug; must run at
phone width (touch controls) and with keyboard/mouse/gamepad. Pointer lock and fullscreen are
optional (may be refused in the iframe) — always fall back to drag-to-look.

---

## 6. Core APIs (integration — already implemented)

**events** (`core/events.js`): `on(name, fn) → off`, `once`, `off`, `emit(name, payload)`.

**input** (`core/input.js`): call nothing per frame (main does). Read `input.move {x,y}` (x right,
y forward, |v| ≤ 1), `input.look {x,y}` (radians this frame; x = yaw right, y = pitch down before
invert), `input.wheel`, `down(a)`, `pressed(a)`, `released(a)`, `consume(a)`, `anyPressed()`,
`device` ('kbm'|'gamepad'|'touch'), `requestPointerLock()`, `exitPointerLock()`,
`pointerLocked`. Touch API: `setVirtualMove(x,y)`, `setVirtualButton(action, down)`,
`addLook(dx,dy)` (pixels), `tap(action)`. Actions: `forward back left right jump sprint interact
confirm cancel flare journal pause recenter up down menuLeft menuRight zoomIn zoomOut choice1..4`.
`GLYPHS[device][action]` gives prompt labels.

**state** (`core/state.js`): `mode, setMode, pushMode, popMode, settings, saveSettings(),
progress {quest, flags, flames{tirta,bumi,samudra: 'none'|'carried'|'placed'}, checkpoints{id:
bool}, lastCheckpoint, nyala, credit{balance, spent, earned, thoughts, byTier, ledger[]}, clues[],
kilau[], pelita[], asked{}, deaths, playTime, finished}, flag(name[, value]), addNyala(delta,
reason), save(), load(), hasSave(), resetProgress()`.

**interact** (`core/interact.js`): `add({id, x,y,z | getPosition(), radius=2.4, label (string or
fn), enabled(), onInteract(), priority, height})`, `remove(id)`, `focus`. The nearest enabled
target (facing-weighted) gets focus; pressing `interact` calls `onInteract`. Emits
`interact:focus {target}` and `interact {id}`. `y` is the prompt anchor height (world).

**collision** (`world/collision.js`): `addBox({x,y,z,w,h,d,yaw,solid,walkable,surface,tag})`
(y = bottom), `addCylinder({x,y,z,r,h,...})`, `remove(c)`, `setEnabled(c,on)`,
`groundAt(x,z,y,stepUp,footRadius) → {y, surface, collider, water}`, `ceilingAt(x,z,y)`,
`resolve(pos, radius, height, stepUp) → {hit,nx,nz}` (mutates pos), `raycast(ox,oy,oz,dx,dy,dz,
maxDist) → distance`. Surfaces: `wood stone sand grass rock path metal`.

**engine** (`core/engine.js`): `renderer, scene, camera, composer, bloomPass, quality, preset,
isTouch, size, stats, setQuality(q), setBloom(strength, radius, threshold), onResize(fn)`.

**dom** (`core/dom.js`): `injectStyle(id, css)`, `h(tag, props, children)`, `uiRoot(name)`.
UI roots in index.html: `#hud #prompts #dialogue #journal #touch #toasts #menus #fade`
(each `position:absolute; inset:0; pointer-events:none` — enable pointer events on your own
interactive children). Use the CSS tokens from index.html (`--ink --paper --kabut --lentera
--bara --kilau --soga --tier-* --font-display --font-body --font-mono --fs-*`).

**save** (`core/save.js`): `loadJSON(key, fallback)`, `saveJSON(key, value)` (try/catch inside).

---

## 7. Module contracts (builders)

### Landscape — `terrain.js, ocean.js, sky.js, fog.js`
- **terrain**: `createTerrain(ctx) → {mesh, heightAt, normalAt, slopeAt, update}`. Mesh vertices
  must stay on the baked grid (collision and the mesh agree). Improve the look: shader-based
  sand/grass/rock/path blending with world-space detail noise, wet sand band, cliff rock, river
  bed; seabed. Keep it one draw call (+ optional distant ring).
- **ocean**: `createOcean(ctx) → {mesh, waveHeight(x,z,t), update(dt,t)}`. Stylised water: gentle
  vertex waves near the camera, depth tint from the heightfield (bake heights into a
  DataTexture), shoreline foam, fresnel/sky reflection, lantern/flame glints. `waveHeight` is
  sampled by the player (swimming) and the boat — keep amplitude ≤ 0.25 m. Also the river ribbon
  on the mesa (`LANDMARKS.river`) and the cove pool surface if needed (all water is at y ≈ 0
  except the river).
- **sky**: `createSky(ctx) → {sun (DirectionalLight, casts shadows following the player), hemi,
  timeOfDay, setTimeOfDay(v, seconds), autoAdvance, update}`. `timeOfDay` 0 = dusk (sun low in
  the west-north-west, warm), 0.35 blue hour, 0.6 night (moon, stars), 1.0 dawn (sun rising in
  the east behind the mercusuar). Starts at 0.05 and auto-advances to 0.6 over ~12 minutes of
  play (`autoAdvance`), finale calls `setTimeOfDay(1, 25)`. Sky drives fog colours
  (`fogUniforms.uFogColor / uFogSunColor / uFogSunDir`) so fog and sky always match.
- **fog**: API fixed (see file header): `patchMaterial, patchObject, FOG_GLSL, fogUniforms,
  MAX_CLEARINGS` and `createFog(ctx) → {uniforms, setClearing(id,x,z,r,strength,instant),
  removeClearing(id), setAmount(v, seconds), amount, fogAmount(x,y,z), update}`. Slot 0 is the
  lantern (reads `player.position`, `player.lanternWorld`, `player.lanternRadius`). Polish the
  look (low drifting mist sheets / particles near the player, density tuning so the mountain,
  candi and lighthouse silhouettes read above the fog layer) without changing the API.

### Setdressing — `vegetation.js, structures.js`
- **structures**: `createStructures(ctx) → {anchors, boat, pelita, sockets, campfires,
  lighthouse, setCandiDoor(open), update}`.
  - `anchors`: `THREE.Vector3` map: `'flame:tirta'`, `'flame:bumi'`, `'flame:samudra'` (where the
    flame orb floats), `'relief'`, `'candi:door'`, `'lighthouse:lamp'`, `'boat:seat'` and
    `'campfire:<id>'` (fire base centre) for every checkpoint.
  - `boat`: `{object, setPose(x, z, yaw)}` — the perahu jukung (outriggers, painted). Ocean
    bobbing is applied by structures in update unless `boat.manual = true`.
  - `pelita[id]`: `{object, position (flame point), setLit(bool)}` for utara/timur/selatan/barat.
  - `sockets[id]`: `{object, position (flame point), setLit(bool)}` for tirta/bumi/samudra.
  - `campfires[id]`: `{object, position}` — stones + logs only (fire VFX belongs to flames.js).
  - `lighthouse`: `{object, top: Vector3 (lamp centre), setLampGlow(0..1)}`.
  - `setCandiDoor(open)`: animate the shrine slab and toggle its collider.
  - Build: kampung (rumah panggung with stilts, ladders, verandas, gedek walls, steep roofs, lit
    windows), warung Bu Ratih (counter, benches, hanging goods), pier with posts and lamps,
    signposts at path forks (canvas text: Kampung, Mercusuar, Candi, Telaga, Pantai Barat),
    waterfall (animated sheet, foam, mist) + cave roof block (x −156…−133, z −40…−26, ceiling ≈
    7.5, top ≈ 28.8) + cave interior (glowing moss/crystals, pedestal), candi (terraces, stairs
    on the south, shrine, sealed door, relief panel, 4 pelita, split gate at the courtyard
    entrance, fallen stones), kapal karam (pinisi-style hull, tilted, broken masts, walkable
    deck, plank ramp out of the water, stern cabin with table), mercusuar (tower, gallery, lamp
    room glass, keeper hut, 3 tungku), 3 campfire pits. Register colliders for everything the
    player can touch (walkable decks, stairs as steps ≤ 0.45 m, solid walls). The player must be
    able to reach: every house deck, the pier, the wreck deck + cabin, the cave, every candi
    terrace + the chamber (after the door opens), the lighthouse platform.
- **vegetation**: `createVegetation(ctx) → {update(dt,t)}`. Instanced coconut palms (beaches),
  tropical trees, a big beringin (banyan) near the candi courtyard, bamboo clumps, banana plants
  around the kampung, ferns, grass tufts (if `preset.grass`), kamboja flowers near the candi,
  reeds by the cove, beach and cliff rocks. Wind sway in the vertex shader (chain your
  onBeforeCompile, then `patchMaterial`). Respect `EXCLUSIONS`, paths (`distToPath < 3`), water,
  steep slopes. Trees get simple cylinder colliders (trunks).

### Player — `character.js, controller.js, camera.js, ui/touch.js`
- **character**: `createCharacter(opts) → {root, lanternSocket, headBone, height, update(dt,
  anim), setLantern(visible), setKainOpen(0..1)}` shared by the player and NPCs. `opts`: `{skin,
  top, bottom, kain (batik colours), hair: 'short'|'bun'|'long'|'peci'|'caping'|'kerudung',
  build: 'slim'|'normal'|'stout'|'old', accessory: 'lantern'|'rod'|'sketchbook'|'none',
  ghost: bool}`. `anim`: `{state: 'idle'|'walk'|'run'|'jump'|'fall'|'glide'|'swim'|'sit'|'talk'|
  'wave'|'flare', speed (m/s), lookAt: Vector3|null, talk: 0..1}`. Procedural animation: walk
  and run cycles, idle breathing, sit, talk gestures, glide pose with the kain spread like wings,
  swim stroke, landing squash, lantern pendulum, trailing kain/scarf. Stylised low-poly but
  appealing; batik via CanvasTexture. Ghost = translucent cool glow.
- **controller**: `createPlayer(ctx) → {position (feet), velocity, yaw, object, character,
  lanternLight, lanternWorld, lanternRadius, grounded, swimming, gliding, sprinting, stamina
  (0..1), surface, controlEnabled, teleport(x,y,z,yaw), setControl(on), faceToward(x,z),
  knockback(dx,dz,strength), update}`. Feel targets: walk 3.2, run 5.6, sprint 8.6 m/s
  (stamina); accel 40, decel 30 m/s²; air control 30%; jump v0 7.2, gravity 22 up / 34 down,
  variable jump height, coyote 0.12 s, buffer 0.12 s; glide (hold or re-press jump while falling)
  fall ≤ 2.2 m/s, forward 8.5 m/s, stamina drain; swim when water depth > 1.15 m (float with
  `ocean.waveHeight`), climb out onto ledges ≤ 1.6 m above the water; slopes > 48° slide;
  step-up 0.45 m; hard landing stagger. Lantern: PointLight, flicker, intensity and
  `lanternRadius = 7 + 11 * nyala/100`. Flare: on `flare` press with nyala ≥ 12 and cooldown
  ready → raise-lantern animation and `events.emit('player:flare', {x,y,z})` (spirits.js applies
  the cost). Emits `player:jump, player:land {speed}, player:step {surface, run}, player:glide
  {on}, player:swim {on}, player:splash {x,y,z,strength}`. Carried flames: render small coloured
  orbs orbiting the lantern from `state.progress.flames` ('carried').
- **camera**: `createCameraRig(ctx) → {yaw, pitch, distance, mode, setMode('follow'|
  'cinematic'|'dialogue'|'title'|'debug'), shake(strength, duration), playPath(keys, opts) →
  Promise, stopPath(), focusOn(target {x,y,z}, opts) (dialogue over-the-shoulder framing between
  player and target), snapBehindPlayer(), update}`. playPath `keys`: `[{pos:[x,y,z], look:[x,y,z],
  t: seconds}]` (Catmull-Rom, eased). Follow: orbit distance ~5.2, pitch limits, auto-recenter
  while moving after 2.5 s idle look, collision via `collision.raycast`, smoothing, sprint FOV
  kick, glide pull-back. Also listen to `camera:shake {strength, duration}`. Respect
  `settings.invertY`, `settings.cameraShake`.
- **touch**: `createTouch(ctx) → {visible, setVisible, update}`. Shown on touch devices: dynamic
  left stick, right-half drag look, buttons Lompat / Aksi (label from interact focus) / Nyala /
  Lari, top-right Jurnal and Jeda. Hidden outside `play`. Large hit areas, safe-area insets.

### NPC & mind — `npcs.js, dialogue.js, mind.js, credit.js, ui/journal.js`
- **credit**: `createCredit(ctx) → {TIERS, balance, canAfford(tier), spend(tier, meta) → receipt
  {id, tier, cost, tokens, model, hash, balanceAfter, at}, earn(amount, reason), update}`.
  `TIERS = {redup: {cost 0.002, label 'Redup', model 'Model kecil · 8B'}, sedang: {0.01,
  'Sedang', 'Model menengah · 70B'}, terang: {0.04, 'Terang', 'Model frontier'}}`. Writes to
  `state.progress.credit` (ledger capped at 60 entries), emits `credit:change {balance, delta,
  reason, tier}`. Listens to `kilau:collect` (+0.003). Sarni's one-time gift rule (§4).
- **mind**: `createMind(ctx) → {topicsFor(npcId) → [{id, label, available: bool}], greeting(npcId)
  → string (free), think(npcId, topicId, tier) → Promise<{text, tier, tokens, source, clue}>,
  client}`. Hand-written answers for every NPC × topic × tier (Redup funny/confused/wrong,
  Sedang half-right/vague, Terang precise, warm, with landmarks). Topics unlock by quest step
  and flags. Clues: `loc_tirta, loc_bumi, loc_samudra, pelita_order, sockets, lamun_story,
  kabut_origin` (+ any flavour ids). `OrbioClient` class: disabled by default, would POST to a
  configured base URL with the tier's model; never called in the artifact. Re-asking a topic at
  ≤ the highest tier already paid replays for free.
- **npcs**: `createNPCs(ctx) → {list, get(id), update}`. Each NPC: `{id, name, role, object,
  position, yaw, character}` built with `createCharacter`, placed at `LANDMARKS.npcs` (y from
  `collision.groundAt`), idle behaviours (Sarni sits, Darto sits fishing on the pier edge, Ratih
  wipes the counter, Laras sketches, Lamun hovers translucent and fades in when the player is
  near), head turns toward the player within 6 m, registers an interact target "Bicara dengan
  <name>" → `dialogue.open(id)`.
- **dialogue**: `createDialogue(ctx) → {isOpen, open(npcId), close(), update}`. Flow: pushMode
  `dialogue` → `cameraRig.focusOn(npc)` + letterbox → name plate + free greeting (typewriter) →
  topic list → tier picker (three lamp buttons with cost, disabled if unaffordable, balance
  shown) → thinking animation (redup 0.7 s, sedang 1.3 s, terang 2.2 s; token counter ticking) →
  answer typed in tier style → receipt line "−0.040 CREDIT · Terang · 412 token · tx 0x3f…a9
  (simulasi)" → clue toast "Dicatat di Jurnal". Keyboard (1–4, arrows, Enter, Esc), gamepad, touch.
  Emits `dialogue:open {npcId}`, `dialogue:close {npcId}`, `mind:think`, `mind:answer`.
- **journal**: `createJournal(ctx) → {isOpen, open(tab), close(), toggle(), addClue(clue),
  update}`. Opens on `journal` action in `play` (pushMode `journal`). Tabs: **Petunjuk** (clues),
  **Warga** (people met), **Pikiran** (CREDIT ledger + totals per tier), **Peta** (canvas map
  drawn from `heightAt`, known places, lit campfires, player arrow). Listens to `clue:add` and
  persists to `state.progress.clues` (dedupe by id). Parchment/batik styling.

### Gameplay & UI — `quest, flames, spirits, checkpoints, finale, hud, menus, prompts, audio`
- **quest**: `createQuest(ctx) → {step, objective {text, target {x,z}|null}, markers (known
  places for the compass), setStep(id), update}`. Runs the intro (may live in
  `gameplay/intro.js`). Emits `quest:step {step, prev}` and `objective {text, target}`. Saves on
  step changes.
- **flames**: `createFlames(ctx) → {createFire(opts) → {object, setIntensity(v), dispose()},
  update}`. Shared fire VFX (billboard/particle flames, embers, flicker PointLight budget ≤ 4
  active lights). Owns: the three Api Pusaka orbs (interact "Ambil Api …" → `flame:collect`),
  the mercusuar sockets (interact "Taruh Api …" → `flame:place`), the candi pelita puzzle
  (`pelita:light`, `candi:open`).
- **checkpoints**: `createCheckpoints(ctx) → {light(id), rest(id), respawn(), update}`. Campfire
  fire via flames.createFire; interact "Nyalakan api" / "Istirahat" (refill nyala, save).
  Lighting adds a permanent fog clearing (radius 38) with a satisfying expansion. Handles
  pingsan → respawn.
- **spirits**: `createSpirits(ctx) → {update, banishAll()}`. Hantu Kabut + Kilau (§4). Listens to
  `player:flare` (cost, pulse VFX, temporary clearing). Emits `player:hurt`, `kilau:collect`.
- **finale**: `createFinale(ctx) → {active, start(), update}` — the beacon sequence (§3).
- **hud**: `createHUD(ctx) → {toast(text, opts), setVisible(bool), update}`. Compass strip +
  objective, Nyala lantern gauge, CREDIT chip (animated deltas, "simulasi"), carried flames,
  stamina ring near the player, hurt/low-light vignettes, letterbox for cinematics.
- **prompts**: `createPrompts(ctx) → {hint(text, seconds), update}`. Floating interact prompt
  with device glyph, contextual tutorial hints (`hint` event).
- **menus**: `createMenus(ctx) → {update}`. Title over a live flyover, Mulai/Lanjutkan/Pengaturan/
  Kontrol, pause menu, settings (sensitivity, invert Y, quality, volumes, shake, hints), controls
  screen, credits + stats after the finale. Navigable by keyboard, gamepad, mouse and touch.
  Emits `game:start {newGame}`, `settings:change {key, value}`. Clicking the canvas in `play`
  requests pointer lock.
- **audio**: `createAudio(ctx) → {unlock(), play(name, opts), setMusic(mood), setAmbience({wind,
  waves, insects}), applyVolumes(), update}`. Pure WebAudio synthesis, no samples. Slendro-flavoured
  generative gamelan (bonang/saron bells, gong every phrase), moods `title, explore, danger,
  finale, silent`; ambience (waves near coast, wind on heights, insects at night, waterfall
  roar near the falls); SFX for every event in §8. Unlock on the first user gesture.

---

## 8. Events

| Event | Payload | Emitted by |
|---|---|---|
| `mode:change` | `{mode, prev}` | state |
| `game:ready` | `{}` | main |
| `game:start` | `{newGame}` | menus |
| `game:saved` `game:loaded` `game:reset` | `{}` | state |
| `settings:change` | `{key, value}` | menus |
| `intro:start` `intro:end` | `{}` | quest/intro |
| `player:jump` | `{}` | player |
| `player:land` | `{speed}` | player |
| `player:step` | `{surface, run}` | player |
| `player:glide` / `player:swim` | `{on}` | player |
| `player:splash` | `{x,y,z,strength}` | player |
| `player:flare` | `{x,y,z}` | player |
| `player:hurt` | `{amount, from {x,z}}` | spirits |
| `player:faint` / `player:respawn` | `{checkpoint}` | checkpoints |
| `nyala:change` | `{value, delta, reason}` | state.addNyala |
| `interact:focus` | `{target}` | interact |
| `interact` | `{id}` | interact |
| `dialogue:open` / `dialogue:close` | `{npcId}` | dialogue |
| `mind:think` | `{npcId, topicId, tier, cost}` | dialogue |
| `mind:answer` | `{npcId, topicId, tier, text, clueId}` | dialogue |
| `credit:change` | `{balance, delta, reason, tier}` | credit |
| `clue:add` | `{id, text, source, tier}` | dialogue/flames/anyone → journal stores |
| `kilau:collect` | `{id, total}` | spirits |
| `flame:collect` / `flame:place` | `{flameId}` | flames |
| `pelita:light` | `{id, correct, count}` | flames |
| `candi:open` | `{}` | flames |
| `checkpoint:light` / `checkpoint:rest` | `{id}` | checkpoints |
| `quest:step` | `{step, prev}` | quest |
| `objective` | `{text, target}` | quest |
| `hint` | `{text, seconds}` | anyone → prompts |
| `toast` | `{text, kind}` | anyone → hud (`kind`: info, credit, kilau, flame, warn) |
| `camera:shake` | `{strength, duration}` | anyone → cameraRig |
| `finale:start` / `finale:end` | `{}` | finale |

---

## 9. Art direction

Palette: dusk lavender fog, deep indigo night, warm amber lantern light, jade Kilau, soga-brown
batik wood. Lighting does the storytelling: everything outside the lantern bubble is cool and
muted; anything lit (lantern, fire, windows, flames) is warm and blooms. Silhouettes (gunung,
candi, mercusuar) stay readable above the fog layer for navigation.

Shapes: chunky stylised low-poly with soft shading (no flat-shaded noise everywhere), gentle
vertex colour variation, procedural batik/gedek/ukiran patterns from canvas. Water, fire, fog
and foliage always move.

UI: Gloock (display), Alegreya Sans (body), DM Mono (numbers/CREDIT). Thin soga rules, parchment
panels with soft blur over the scene, amber accents, generous spacing, subtle motion. No emoji.

---

## 10. Testing

```
node tools/smoke.mjs --out .qa/shots-<you> [--steps steps.json] [--q low] [--mobile]
```
Serves the folder, opens `dev.html?debug&q=low` in headless Chromium with SwiftShader WebGL,
runs steps, saves screenshots, prints JSON (errors, warnings, failed requests, logs). Debug hook
`window.__lentera`: `ctx`, `teleport(x,z[,y])`, `play()` (skip to play mode), `mode(m)`,
`stats()`, `lookFrom([x,y,z],[x,y,z])`, `follow()`. SwiftShader is slow (5–25 fps): keep runs
short, use `--q low`, and do not run more than one browser at a time per builder.
Also: `node --check` every file you touch.
