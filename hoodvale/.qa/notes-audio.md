# Audio builder notes (js/audio/*)

Pure WebAudio synthesis: no samples, no fetch. Everything is generated at runtime: Karplus-Strong
plucked strings, formant voices, FM bells, and drum hits pre-rendered once into buffers.

## API (`ctx.audio`, created last in main.js)
- `unlock()`: creates and resumes the AudioContext. It also runs by itself on the first `pointerdown`,
  `keydown` or `touchend`, and plays a silent buffer for iOS.
- `play(name, opts) -> bool`: plays a one-shot sound. `opts`: `{x, z}` world position (distance
  falloff from the player, panned by the camera), `volume`, `delay`, `pitch`, plus sound-specific
  options (`surface`, `mood`, `element`, `milestone`, `delta`...). When another module calls
  `play('chop')` (or any other loop or skill sound) directly, audio's own heuristic for that sound
  stands down for 15 s, so nothing plays twice.
  Aliases: `play('level-up', {skill})`, `play('oracle-answer', {tier})`.
- `setMusic(key | null)`: forces a piece; `null` returns to automatic selection.
- `setAmbience(levels | null)`: overrides ambience beds. Keys: `wind, waves, water, crickets, swamp,
  town, crystal, cave, fire, leaves, birds, gulls, owls, frogs, drips`.
- `applyVolumes()`, `stats()` (includes `recent`: the last 40 sounds played), `update(dt)`.
- Volumes come from `state.settings`: `masterVolume`, `musicVolume`, `sfxVolume`. Optional and read
  if present: `ambienceVolume`, `uiVolume`, `muted`. Changes apply on `settings:change`.

## Music (js/audio/pieces.js + music.js)
Keys: `village, pastoral, coast, forest, mines, swamp, town, oracle, highlands, dungeon, boss, login,
wilds`. Each piece uses one mode (ionian, dorian, phrygian, lydian, mixolydian, aeolian or harmonic
minor), a fixed tempo grid, hand-written themes, and chord-driven accompaniment.

How the music is chosen:
- Mode `login` or `create` plays `login` (the main theme).
- Otherwise the piece comes from `ctx.map.zoneAt(player.pos)` via `ZONES[zone].music`.
- Dungeon zones (warrens, vault, lair) play `dungeon`.
- `boss` plays while fighting a `def.boss` monster.
- In the wilderness the last zone's piece keeps playing for 40 s, then `wilds` takes over. A
  teleport into the wilderness switches to `wilds` straight away.
- Switches wait for 2.5 s of a stable zone. `zone:enter`, `region:enter`, teleports and mode
  changes switch immediately.
- Crossfades take about 3.5 s and start on the old piece's next bar line.

During a fight, a percussion and bass layer fades in on the same grid. It follows
`ctx.combat.inCombat`, combat events, or any hit in the last 4 s.

Variation:
- The lead instrument rotates on each pass of a melody.
- Later passes add ornaments (grace notes, passing tones) and sometimes a harmony line a third below.
- Some layers are randomly optional, and interlude sections use generative counter-melodies.
- Drum fills mark section ends.
- Each cycle picks a different form, with a breathing rest between cycles.
- Music ducks under fanfares and jingles, sits at about 75% during dialogue, and is muffled while dead.

## SFX names (147; creature voices take `mood: idle|attack|hurt|death`)
- **Movement and places:** step (`surface`: grass dirt stone wood sand water mud leaves gravel crystal cave), door, chest, portal, stairs, teleport, respawn.
- **Gathering and artisan:** chop log tree-fall mine ore rock-deplete fish-cast fish-plop fish-net fish-splash fish-reel fish-catch harpoon cage fire-strike fire-light fire-out fire-crackle cook burn smelt anvil fletch string craft gem-cut spin inscribe pick bucket milk grain thieve stun.
- **Items and economy:** eat drink pickup item-drop loot-rare equip coins bank deposit withdraw chain chain-confirm shop-bell exchange.
- **Combat:** swing hit block miss hurt heal burn-tick monster-death bow arrow arrow-hit spell-spark spell-tide spell-stone spell-ember spell-thought spell-insight spell-hit (`element`) fire-breath stomp summon heartbeat.
- **Creature voices:** chicken cow rat goblin (`size`) boar wolf (`howl`) human knight sheriff spider bear skeleton lurker wisp troll golem imp drake wyrm.
- **Interface:** ui-click ui-tab ui-menu ui-open ui-close ui-error blip (`pitch`, `kind`) dialogue-open dialogue-close message peer-join peer-leave xp npc-murmur emote-clap emote-cheer emote-wave emote-dance.
- **Rewards:** level-combat level-gathering level-artisan (`milestone`), discover, quest-start, quest-update, quest-complete, death, oracle-hum, oracle-spark, oracle-lamp, oracle-beacon.
- **Ambient one-shots** (scattered by the ambience layer): amb-bird amb-dove amb-gull amb-owl amb-frog amb-drip amb-rumble amb-creak amb-buoy amb-hammer amb-cart amb-call amb-townbell amb-eagle amb-woodpecker amb-howl amb-crystal amb-bubble amb-leaves amb-chatter.

## Events listened to
action:start archery:target bank:change bank:open boss:special chain:tx chat:game chat:public
chest:open combat:attack combat:end combat:hit combat:projectile combat:start dialogue:close
dialogue:open dialogue:type door emote entity:death exchange:open fire:lit fire:out fishing:move
food:eat game:start item:drop item:equip item:read item:select item:unequip level:up loot:drop
loot:take magic:cast mill:fill mode:change monster:aggro monster:death npc:say object:deplete
oracle:answer oracle:ask peer:join peer:leave player:death player:drink player:eat
player:enter-portal player:hp player:move player:respawn player:stun player:teleport pouch:open
quest:complete quest:start quest:update redistribution region:enter resource:deplete run:change
save:loaded settings:change sfx shop:open sign:read skill:act skill:fail skill:product spell:cast
spell:teleport tan thieving:fail thieving:success tick ui:dialogue ui:sheet ui:tab ui:window
wallet:change wallet:confirm xp zone:enter

Also:
- Skilling loops run off `ctx.actions.current` on every tick (chop or mine every 2 ticks, anvil,
  fishing casts and splashes, cooking sizzle, smelting roar, spinning, inscribing, plus item-on-item
  use: tinderbox, knife, needle, chisel).
- Footsteps follow `player:move`: 2 steps per tick when walking, 3 per two tiles when running. The
  surface comes from tile flags, zone and height.
- Dialogue voice blips play while `.u-dlg.typing` exists. Pitch is derived from the speaker; the
  Oracle gets glassy blips.
- Plain `button` and `.hv-btn` clicks get a soft tick. Tabs and windows use the ui events instead.
  A `data-sfx="name"` attribute on an element overrides the sound.
- Nearby monsters make idle calls (chickens cluck, cows moo, wisps chime, wolves howl at night).
- At 25% HP or below, a heartbeat plays during a fight.
- Ambience is sampled from player position, `ctx.sky.hour`, tile flags (indoor), distance to the
  river and lakes, the sea to the south, altitude, and nearby `fire`/`range`/`furnace` objects.
- Gildmoor's bell tolls on every in-game hour.

## Optional requests (nothing is blocking)
- **game:** to sync gathering and smithing strokes exactly with the animation, emit
  `skill:act {skill}` at the moment the axe, pick or hammer lands. Audio then stops its 2-tick
  timer for that sound.
- **content:** emitting `oracle:ask {tier}` when a question is submitted plays a hum while the
  Oracle "thinks". `oracle:answer` already plays the tier chime.
- **ui / integration:** an "Ambience" slider can write `settings.ambienceVolume` and a mute toggle
  can write `settings.muted`. Both are read if present. Optionally add `ambienceVolume: 0.7` to
  DEFAULT_SETTINGS.

## QA
- `js/audio/test-render.js` is not loaded by the game. It renders with an OfflineAudioContext and
  reports peak, RMS, NaN and clip counts. Example:
  `{"eval":"import('./js/audio/test-render.js').then(m => m.renderAllMusic(24))"}`.
  Also available: `renderAllSfx()`, `renderSections()`, `renderAllInstruments()`, and
  `renderAmbience(__hv.ctx, {x, z, hour})`.
- `.qa/audio-e2e-1.json` covers skilling sounds and `.qa/audio-e2e-2.json` covers zone music,
  ambience, dungeon, combat layer and boss. Both use `__hv.ctx.audio.stats().recent`.

Measured raw levels, before the volume buses:

| What | Peak | RMS | Notes |
|---|---|---|---|
| Music pieces | -5.5 to -13.8 dB | -24 to -30 dB | |
| Music with combat layer | up to -2.7 dB | +1.5 to 3 dB above the piece | |
| SFX (220 renders) | -44 to -1.4 dB, median -17 dB | | |
| Ambience beds | | -26 dB (highlands wind, caves) to -44 dB (quiet village day) | |

Across all of these there were 0 NaN samples and 0 clipped samples. At default settings, music
lands around -29 dBFS RMS, with a -5 dB limiter on the master bus.
