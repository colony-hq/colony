# notes-npc-ai — requests & integration notes from the npc-ai builder

Owned files: `js/npc/{npcs,dialogue,dialogue-css,mind,credit,orbio-client,lines,lines-*}.js`,
`js/ui/{journal,journal-css,journal-map}.js`. QA: `.qa/check-lines.mjs`, `.qa/steps-npc-*.json`.

## Requests to other builders

### gameplay-ui (hud.js / hud-cine.js)
1. ~~Letterbox in `dialogue` mode~~ — resolved (hud.js no longer letterboxes dialogue). My `.dlg`
   and `.jr` layers sit at `z-index: 6`, above `.lh-cine` (z 5) and the toast stack (z 4).
2. **Toasts during dialogue.** The toast stack is bottom-centre (z 4); my dialogue panel covers it
   while `state.mode === 'dialogue'`. The panel shows its own "Dicatat di Jurnal" stamp, so this is
   fine, but if you want the HUD toast visible too, move `.lt-stack` to the top while in dialogue.
3. **CREDIT chip.** `state.progress.credit.byTier` = number of paid thoughts per tier (counts).
   Added `byTierSpent` = CREDIT spent per tier. `ctx.credit.stats()` returns
   `{balance, spent, earned, thoughts, byTier, byTierSpent, clues, perClue}` for end-of-game stats.
   `formatCredit(v, {sign})` is exported from `js/npc/credit.js` (3 decimals, U+2212 minus).

### gameplay-ui (quest.js)
4. **Vague clues.** Sedang answers emit clue ids ending in `_samar` (e.g. `loc_tirta_samar`). Only
   exact ids (`loc_tirta`, `loc_bumi`, `loc_samudra`) should unlock compass markers.
5. **Proximity flags you can reuse.** The journal sets `seen_flame_<tirta|bumi|samudra>` (within
   40 m), `seen_<candi|airterjun|kapal|mercusuar>` and `seen_camp_<id>` flags every 0.5 s in play.
6. **Arrive step.** The first Sarni dialogue ends when the player picks "Pamit" (or Esc) and the
   farewell line finishes; `dialogue:close {npcId:'sarni'}` is emitted then. Sarni's farewell in
   `arrive`/`kindle` tells the player to light the campfire.
7. **Story flags set by dialogue:** `met_<npc>`, `talks_<npc>` (visit counter), `heard_lamun`,
   `pesan_sarni`, `pesan_sarni_told`, `gift_sarni`.

### player (character.js / camera.js)
8. **NPC opts passed to `createCharacter`:** `{skin, top, bottom, kain: {base, ink, accent, motif},
   hair, build, accessory, ghost, colors: {skin, top, bottom}}` (numbers as hex ints; `motif`
   `'parang' | 'kawung'`). If you expect `kain` in another shape, tell me and I'll adapt.
9. **anim used by NPCs:** seated NPCs get `{state:'sit', talk:0..1, lookAt}`; standing ones
   `'idle'` / `'talk'`. `lookAt` is a smoothed world `Vector3` (player head within 6 m, else an idle
   point of interest) or `null`. NPC roots are rotated by `npcs.js` (yaw) every frame.
10. **Ghost fade (Ki Lamun).** I fade him by scaling `material.opacity` on built-in materials (cloning
    any material shared with other characters, preserving `onBeforeCompile`). `ShaderMaterial`s
    can't be faded that way — if the ghost uses one, please expose an optional
    `character.setOpacity(k)` and I'll call it.
11. **Camera.** Dialogue calls `cameraRig.focusOn(npcHeadWorldPos, {npcId})` on open and
    `cameraRig.setMode('follow')` on close. It also calls `player.faceToward(x, z)`.
    Framing request: the dialogue panel covers roughly the bottom 45% of the screen at 1280x720
    and ~55% on a 390 px phone (more when the tier picker is open). In current shots the NPC sits
    right at the panel's top edge and the player's head fills the centre; please frame so the NPC
    head lands in the upper ~40% of the screen (e.g. raise `wantLook` / pull the camera a bit higher
    and further to the side while `rig.mode === 'dialogue'`).
12a. **Sitting.** NPCs pass `anim.sitStyle` / `anim.seat`: Sarni `'chair'` at 0.36 m on a dingklik
    stool I build, Darto `'edge'` at 0 (pier edge), Laras `'floor'` at 0.

### gameplay (flames.js)
14. The relief clue `pelita_relief` (`tier: null`) is supported: the journal shows it as "diamati"
    (observed, not bought), and the `read_relief` flag unlocks Laras' "Urutan pelita" topic. Laras'
    Terang answer explains the relief ("bintang yang nggak pernah bergeser" = bintang utara).

### finale
12. `ctx.npcs.get('lamun')` exposes `forceVisible` (bool) and `setHome(x, z, yaw)`. When
    `quest === 'done'`, Ki Lamun automatically moves next to Mbah Sarni at the kampung fire.

### menus
13. Escape maps to `pause` + `cancel`. While `state.mode` is `dialogue` or `journal`, my modules
    consume both (Esc = back / close). Please only open the pause menu from `play`.
