# Notes from the gameplay builder (quest, intro, flames, spirits, kilau, checkpoints, finale)

Contracts other builders can rely on. Everything I call on other modules is guarded with `?.`,
so nothing breaks if a field is missing — it just looks/feels worse.

Files: `js/gameplay/{quest,intro,flames,fire-vfx,fx,places,director,checkpoints,spirits,kilau,
kilau-spots,finale}.js`.

## Extra events I emit (not in DESIGN §8)

| Event | Payload | Meaning / suggested reaction |
|---|---|---|
| `intro:title` | `{title:'LENTERA', subtitle:'Kabut Nusantara'}` | ui: title card. Hide it on `intro:end`. |
| `intro:beat` | `{name: 'bump'\|'hop'\|'ignite'}` | audio cues (already wired by ui-audio). |
| `intro:skipProgress` | `{value: 0..1}` | ui: "tahan untuk lewati" ring (wired). |
| `intro:skip` | `{}` | ANYONE may emit it to skip the intro (e.g. a touch "Lewati" button). I listen. |
| `intro:end` | `{skipped?, aborted?}` | §8 event, extra fields. |
| `subtitle` | `{speaker, text, seconds}` | ui: subtitle line. |
| `subtitle:clear` | `{}` | ui: hide the current subtitle now (intro skipped, finale ended, quit). |
| `credits:show` | `{stats}` | menus: credits + stats (shape below). |
| `checkpoint:ignite` | `{id}` | same moment as `checkpoint:light` (ignite sfx). |
| `pelita:fail` | `{}` | all four pelita puff out (wrong order). |
| `spirit:spawn` / `spirit:banish` | `{x,y,z}` | ghost appear / banish. |
| `flare:pulse` | `{x,y,z, banished}` | after the flare cost is applied; `banished` = ghosts hit. |
| `kilau:spawn` | `{x,y,z,count}` | motes released by a banished ghost. |
| `finale:beat` | `{name: 'ribbons'\|'ignite'\|'beam'\|'dawn'}` | finale crescendo cues (wired). |
| `objective` | `{text, target, step}` | §8 event + `step`. |
| `flame:collect` / `flame:place` | `{flameId, carried, placed, found?}` | §8 events + counts. |
| `kilau:collect` | `{id, total, max, transient?}` | §8 event + `max` (60) and `transient` for ghost motes. |
| `dialogue:close` | `{npcId:'sarni', fallback:true}` | ONLY when `npcs.get('sarni')` is null (stub builds). |

I call `ctx.audio.play('ghost', {x,y,z,volume[,hit]})` directly for ghost whispers / touches.

`credits:show` stats:
```
{ playTime (s), deaths, kilau: {found, total}, flames (placed count), clues,
  credit: {balance, spent, earned}, thoughts: {total, redup, sedang, terang} }
```

Toast kinds used: `info`, `flame`, `kilau`, `warn`. I do NOT toast `flame:collect`,
`flame:place`, `checkpoint:light`, `player:faint/respawn` (the HUD banners cover them).

## Fields / APIs I expose (beyond §7)
- `ctx.flames.fx` — shared VFX: `after/wait/tween`, `bloomPulse`, `fade`, `shake`, `burst`, `spark`,
  `smoke`, `ring`, `shell`, `flash`, `lights` (pool). `ctx.flames.createFire(opts)` options:
  `{position, scale, color, light, intensity, tongues (1|3), glow, halo, embers, lightIntensity,
  lightDistance, priority, instant}` → `{object, setIntensity(v, instant), setColor, setVisible, dispose}`.
- `ctx.spirits.ghosts` (records with `pos`, `alpha`, `state`), `ctx.spirits.kilauTotal`,
  `ctx.spirits.kilauFound`, `ctx.spirits.flare()`, `ctx.spirits.debugSpawn(x?, z?)`.
- `ctx.quest.markers`: `[{id, kind:'npc'|'campfire'|'flame'|'beacon', label, x, z, color?, lit?, objective}]`.
- `ctx.checkpoints.placeAtCheckpoint(id)`, `ctx.finale.stats()`, `ctx.quest.intro.seek(t)` (debug).

## menus (ui-audio)
- "Mulai": you reset + emit `game:start {newGame:true}`; I reset again (harmless), set `intro`, run
  it, set `play` at the end. If something sets `play` during the intro I force `intro` back.
- "Lanjutkan": emit `game:start {newGame:false}`; quest.js calls `state.load()`, places the player
  at `lastCheckpoint` (or the pier during `arrive`), sets `play`.
- Finale end: I put the player on the lighthouse platform at dawn, set mode **`cinematic`**
  (control off) and emit `credits:show`. Your "Lanjut menjelajah" (`creditsContinue` → `play` +
  `credits:close {to:'play'}`) hands control back — I listen to `credits:close`. Safety net: after
  150 s without `credits:close` I return to `play` myself.
- `game:quit`: I abort a running intro/finale/faint/rest sequence and clear the fade.
- Touch: please add a "Lewati" button during mode `intro` that emits `intro:skip` (hold-to-skip
  needs cancel/confirm, which touch players don't have during the intro).
- After `__lentera.play()` the title overlay stays visible in screenshots — please hide the title
  UI whenever the mode leaves `title`.

## player (controller / camera) — all working, thanks
- Intro uses `setLanternLit(false,0)` → `setLanternLit(true,0.45)` at the ignite beat plus
  `lanternBoost` (0.06 → 1.18 → 1) and `animOverride='sit'` on the boat; per-frame `teleport`.
- `playPath` keys use absolute `t`. Shakes go through `camera:shake {strength, duration}`.

## setdressing (structures)
- I read: `anchors['flame:*']`, `anchors.relief`, `anchors['candi:door']`, `anchors['campfire:<id>']`,
  `boat {object, setPose, setSail, seatLocal, manual}`, `pelita[id]`, `sockets[id]`, `campfires[id]`,
  `lighthouse {top, setLampGlow, beams}`, `setCandiDoor(open)`. LANDMARKS fallbacks for all.
- Fires/lights: flames.js owns a pool of ≤ 4 fire PointLights (+ one finale SpotLight created at
  boot so light counts never change). Please don't add lights for fires/pelita/sockets.
- Lighthouse: finale.js owns the rotating double beam; your `beams` group (shown by
  `setLampGlow(v>0.45)`) would double it, so I force `lighthouse.beams.visible = false` every frame.
  Feel free to delete your beams. I call `setLampGlow(0.1 × placed)` before the finale, 0.3 → 1 at
  ignition, 1 afterwards; `sockets[id].setLit(true)` on placement (I draw the fire).

## landscape (sky / fog)
- Finale: `fog.setAmount(0, 20)`, `sky.setTimeOfDay(1, 25)`, then `sky.autoAdvance = false`.
  A new game after finishing resets `setTimeOfDay(0.05, 0)`, `autoAdvance = true`, fog amount 1.
- Fog clearing ids: `cp:kampung`, `cp:tirta`, `cp:candi` (r 38, permanent), `flare` (r 14, ~3 s),
  `mercusuar` (8 + 7 × placed), `intro` (r 30, ~4 s). 1 slot left free (MAX_CLEARINGS 8).
- `sky`'s `game:start` listener runs *before* quest.js calls `state.load()` on continue (sky is
  created earlier), so it reads stale progress. Please also do the "resume evening from
  playTime" logic on `game:loaded`.

## journal (npc-ai)
- I set `flags.seen_flame_<id>` (same rule as your map: within 40 m) and read clue ids
  `loc_tirta / loc_bumi / loc_samudra` for compass markers. Relief interact emits
  `clue:add {id:'pelita_relief', source:'Relief Candi', tier:null}`.
