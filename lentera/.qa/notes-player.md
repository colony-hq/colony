# Player builder notes (character, controller, camera, touch)

Files: `js/player/character.js`, `charparts.js` (rig, geometry, batik textures, lantern),
`anim.js` (procedural poses), `kain.js` (cloth), `controller.js`, `fx.js` (dust/splash/flare
particles), `camera.js`, `js/ui/touch.js`. All contracts in DESIGN.md §7 are kept; additions below.

## createCharacter (shared with npc-ai)
- One SkinnedMesh per body (1 draw call + shadow), kain cloth = 1 more, lantern = 4 (player only).
- Extra opts: `hairColor, pants, pantsLength (0..1), bottomStyle ('sarung'|'kain'|'celana'),
  bottomMotif ('kotak'|'parang'|'kawung'), sleeves ('short'|'long'|'none'), scarf (kerudung
  colour), udeng (colour|true), flameColor`. `kain: false` hides the shawl. `opts.colors` still read.
- Extra anim fields: `sitStyle: 'chair'|'edge'|'floor'` and `seat` (height of the seat above the
  root). Defaults: `chair` with seat 0.45 (root on the ground next to a log/bench); `edge` (legs
  dangling, seat 0) automatically for `accessory: 'rod'` (Darto on the pier edge); `floor` = sitting
  on the floor, knees up. `flare` (0..1 layer), `waterY` (cloth floats on it).
- Also: `'slide'`, `'climb'` states; `character.setFlame(v)`, `impact(k)`, `hurt(k)`,
  `onStep(side)` callback, `headBone` = skull base bone (head centre is ~0.15 m above it).
- **npc-ai:** if Laras sits on a stone/step, pass `anim.seat` = stone height above her root; if she
  sits on the ground pass `sitStyle: 'floor'`. Ghost opacity: the ghost material is additive with
  `opacity 0.6` (your applyGhostOpacity scaling works as is).

## createPlayer additions
- `player.kinematic = true` skips physics (cutscenes set position/yaw). Per-frame `teleport()` calls
  (as the intro does) also work: they pin physics for 0.12 s and animate from the implied motion
  (walk/jump/fall), so the boat hop animates. Only teleports > 3 m reset the cloth and emit
  `player:teleport` (the camera snaps on it).
- `player.animOverride` (used by intro) or `player.setPose(state, {sitStyle, seat})` force an anim
  state. `animOverride = 'sit'` uses the floor style (boat floorboards).
- `player.lanternBoost` (intro) is applied by the controller to radius, light and flame every
  frame (`lanternBoostHandled = true`), so writing `lanternLight.intensity` is not needed.
  `player.setLanternLit(on, seconds)` ramps the lantern on/off with a bloom flash on ignite.
- `player.flare()` forces a flare (cinematics). Fields: `sliding, climbing, speed, exhausted, fx, tune`.
- Events added: `player:teleport {x,y,z}`, `player:climb {}` (ledge climb-out of water),
  `player:flareFail {nyala}` (flare pressed with nyala < 12; audio can play a fizzle).
- `player:step.surface` may be `'water'` while wading (depth > 0.25 m).

## Camera additions
- `playPath` keys: `t` = absolute seconds from the path start (director.js already does this);
  decreasing `t` values are treated as segment durations. `opts: { ease = true, fov, blend, duration }`
  (`blend` = seconds to blend from the current view into the path). After the promise resolves the
  camera holds the last key until the mode changes. `rig.playing` is true while a path runs.
- `focusOn(target, opts)`: a plain `{x,y,z}` is the point to frame (dialogue passes the NPC head —
  correct). An Object3D / NPC record (`.position`) is treated as feet (+`opts.height`, default 1.5).
  `opts.side` 1|-1 forces the shoulder; otherwise the side with more room is chosen.
- Mode changes are blended (follow 0.7 s, dialogue 0.9 s, title 1.4 s). Returning to `follow`
  starts the orbit from wherever the camera is, so dialogue → play is a short move.
- The rig listens to `mode:change`: `title` → title orbit; `play` from title/dialogue/finished
  cinematic → follow. Clicking the canvas in play requests pointer lock (menus need not).

## Touch
- `touch.forced = true|false` overrides auto-detection (debug). Lari is a toggle latch (released
  with the stick) so the right thumb stays free for looking.

## Observations for other builders (from player QA shots)
- **gameplay (intro):** with `animOverride = 'sit'` the player uses the floor-sitting pose at
  `boat.seatLocal`. In a side close-up the shins seemed to poke below the jukung gunwale; if that
  shows in the intro shots, try `player.setPose('sit', { sitStyle: 'chair', seat: 0.25 })` on a
  thwart instead of the floorboards, or set `player.kinematic = true` for the ride.
- **npc-ai / setdressing:** Mbah Sarni sits at `LANDMARKS.npcs.sarni` with the default chair seat
  (0.45), but the `seat:sarni` log from struct-kampung appears beside/behind her rather than under
  her. Either place her root at the log's x/z, or move the log under the NPC spot.
- Character cost: ~0.12 ms CPU per character per frame, ~5.2k-6.3k triangles per body.

## Testing helpers used
- `.qa/shots-player/sheet-*.png` are contact sheets (poses, NPCs, camera modes, look).
