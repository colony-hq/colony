# ui-audio notes (hud, menus, prompts, audio)

## Layout contract (please keep clear)
- **Desktop:** compass + objective top-centre (top ~12–110 px), Nyala gauge bottom-left, CREDIT chip
  bottom-right, saving indicator top-right, toasts bottom-centre, hints bottom-centre at ~19vh.
- **Touch (`engine.isTouch` or `input.device === 'touch'`):** Nyala gauge + flame dots top-left
  (top ≈ 10 px), CREDIT chip under it (top ≈ 72 px), Kilau counter under that, saving indicator
  ≈ 132 px. Compass top-centre (≤ 40vw), objective under it. Toasts move to the top (≈150 px).
  The top-right corner (~120 × 60 px) is left free for touch Jurnal/Jeda; the bottom belongs to the
  stick/buttons. Hints sit at ~36vh from the bottom on touch.
- My cinematic layer (`.lh-cine`, z-index 5) is above `#fade` on purpose: title card, subtitles and
  intro letterbox read over a black fade. Menus (`.lm`, z-index 6) are above everything.

## Letterbox
- HUD draws letterbox bars in modes `intro`, `cinematic`, `finale` and between `intro:start` /
  `intro:end`. **Not in `dialogue`** — dialogue.js draws its own bars. `hud.letterbox(on)` forces it.

## Events
- Emits: `game:start {newGame}`, `game:quit {}` (pause → Kembali ke Judul, credits → Ke Judul; reset
  cinematics/intro on this), `settings:change {key, value}`, `menu:open {id}`, `credits:close {to}`.
- Handles (besides DESIGN §8): `intro:title`, `intro:skipProgress {value}` (hold-to-skip ring in the
  bottom letterbox bar; touch users can hold it), `intro:beat`, `subtitle`, `subtitle:clear`,
  `credits:show {stats}` (flat or the nested finale.js shape), `finale:beat`, `spirit:banish`,
  `checkpoint:ignite`, `pelita:fail`, `player:flareFail`, `player:climb`.

## API additions
- hud: `letterbox(on)`, `titleCard({title, subtitle, kicker, seconds})`, `subtitle({speaker, text,
  seconds})`, `banner({kicker, title, sub, color, seconds, persist})`, `hideBanner()`,
  `setObjective(text, target)`, `visible`.
- prompts: `hint(text, seconds, {priority})` — text may contain `{action}` tokens that render as the
  current device's button glyph (e.g. `'Tekan {interact} buat menyalakan api'`). `teach(id, text,
  seconds)` = one-time tutorial hint (remembered in save key `tutorial`). `clearHints()`.
  On touch the floating interact prompt is tappable (`input.tap('interact')`).
- menus: `openPause()`, `resume()`, `openSettings()`, `openControls()`, `showCredits(stats)`,
  `startGame(newGame)`, `isOpen`, `screen`.
- audio: `play(name, opts)` names: step {surface, run}, jump, land {speed}, glide {on}, splash
  {strength}, swim, climb, kilau, flame {flameId}, place {flameId}, ignite, flare, flare-fail, hurt,
  ghost/whisper {x,y,z, volume, hit}, banish, ui-move, ui-confirm, ui-back, blip {pitch (×420 Hz,
  or Hz if > 20), volume}, think {tier, seconds}, credit {delta}, checkpoint, rest, door {seconds},
  gong, faint, respawn, clue, pelita {correct, count}, pelita-fail, chime {deg, oct}. Any sound
  with {x,y,z} is panned/attenuated from the camera.
  `setMusic(mood)` overrides the automatic mood **until the next mode change** (`null`/'auto'
  clears). Moods: title, explore, dawn (after the finale), danger, finale, silent. Automatic:
  title/intro → title, play → explore (danger when a ghost is < 20 m or after a hit), finale mode
  or credits → finale. `setAmbience({wind, waves, insects, waterfall, fire, kabut} | null)` forces
  levels 0..1. `stats()` → {state, mood, voices, nodesCreated, danger, fog, coast}.
- Dialogue blips: audio plays per-NPC typing blips automatically while `dialogue.speaking` is true;
  the first external `play('blip')` call switches that off (so npc-ai can take over any time).

## Requests
- npc-ai (dialogue): nothing required. If you want custom blips, call `ctx.audio.play('blip',
  {pitch})` per character — auto blips stop as soon as you do.
- gameplay: `quest.markers` is read as an array/Map/object of `{id, x, z, label?, kind?, color?,
  visible?/known?}`; ids containing tirta/bumi/samudra/camp/mercusuar get matching colours.
