# World builder notes (terrain, water, sky, decor, mapimage)

Files: `js/world/terrain.js, water.js, sky.js, decor.js, mapimage.js` + helpers `w-fields.js` (pure, node-friendly),
`w-common.js`, `w-scatter.js`, `w-flora.js`, `w-dungeon.js`, `w-fx.js`.

## APIs (baseline names kept, fields added)

### ctx.sky
- `sun` (DirectionalLight: sun by day, moonlight by night; shadow camera follows the player, texel-snapped),
  `hemi`, `torch` (PointLight following the player: lantern at night, torch in dungeons), `dome`.
- `hour` (0..24), `setHour(h)`, `dayLength` (s per game day, 1200), `timeScale`, `paused`.
- `night` (0 day .. 1 deep night), `phase` ('dawn'|'day'|'dusk'|'night'), `region` (id of the region the player is in),
  `inDungeon` (bool).
- `addLight({x, y, z, color, intensity, distance, flicker, night, region})` -> source; `removeLight(source)`.
  **Please use this instead of adding your own PointLights** (furnace glows, lanterns, magic). Every PointLight you
  add changes the light count and recompiles every lit material (hitch) and costs per-pixel everywhere. The sky owns
  a small fixed pool (low 2, medium 3, high 4) re-assigned every few frames to the nearest active sources.
  `night: true` sources only light up after dusk (faded with `sky.night`). `region` = 'overworld' or a dungeon id.
  Emissive materials (windows, lamp glass) are fine — bloom picks them up; scale them by `ctx.sky.night` if you like.
- `uniforms` (shared world uniforms: uTime, uSunDir, uSunColor, uNight, uDay, uWind, ...).
- Events: `sky:phase {phase, hour}`, `sky:region {region}` (audio: switch ambience).
- Drives `scene.fog` (colour/near/far), `scene.background`, hemi/sun colours, `renderer.toneMappingExposure`.

### ctx.terrain
- `meshes` (all terrain meshes), `regions {overworld: Group, warrens, vault, lair}`, `skirt`, `material`, `chunks`.
- Overworld = 5x5 chunks (64 tiles) with 3 LODs; LOD0 is exactly the mapgen corner grid (same diagonal split as
  `heightAt`). Picking uses `map.heightAt` anyway.
- The terrain shader draws interior floors under T_INDOOR tiles (planks / flagstones / packed earth / crystal marble
  by building style). **props/buildings: don't add floor meshes at the pad height** (z-fighting) — if you need one, lift
  it >= 0.05 m. Roads, Gildmoor cobbles + plaza, door paths, farm furrows, beaches etc. are all terrain.

### ctx.water
- `mesh` (Group), `material`, `textures {data, flow}`. Surface at y = 0 (gentle waves +-0.07). Hidden in dungeons.
- Foam laps along the outline of every pier / bridge in `BRIDGES`, so posts placed on the deck edge look grounded.

### ctx.decor
- `scatters {name: Scatter}`, `dungeons [{id, group, spots}]` (torch spots per dungeon), `fx`, `lights`, `focus`,
  `stats()` (debug: instances / triangles per type).
- Never places anything on roads, water (except reeds / lilies / bog trees), indoor tiles, building aprons, fences,
  bridges or object / NPC tiles. Dungeon walls (cave rock / vault masonry) + wall torches are here; walls between the
  camera and the player are cut away automatically.

### mapimage.js (for the ui builder)
- `paintRegion(regionId = 'overworld', pxPerTile = 2, {trees, grain, shared})` -> canvas (private copy each call; the
  painting itself is cached, first paint ~0.3-1 s at 3 px/tile). Pixel (0,0) = region NW corner.
- `mapIcons(regionId)` -> `[{kind, x, z, label}]` world positions. kinds: bank exchange furnace anvil range altar
  spinning tanner well mill dungeon exit archery fire stall chest fishing mining quest shop oracle.
- `mapLabels(regionId)` -> zone / road / dungeon names with world positions (road labels carry `angle`).
- `worldToMap(x, z, regionId, s)`, `regionBounds(regionId)`.

## Perf (world-only, harness at 960x540; draw calls include the shadow pass)
- low: ~46 draws / 90-105k tris; medium: ~65 / 140-200k; high: ~64 / 215-295k (village spawn, Hoodwood).
- Terrain: 25 chunks x 3 LODs (exact grid near, 2 m / 4 m far, curtain skirts hide seams), fog-distance culling.
- Decor: one InstancedMesh per type, repacked around the player (radius per type, rim fade, density rank
  filter = `preset.vegetationDensity`; grass only when `preset.grass`). Shadow casters are split into a near
  mesh (casts) + far mesh (doesn't), so the shadow pass never re-draws the far field.
- Low preset: cheaper terrain shader path (fewer noise taps), water detail 0, no grass / mist.

## World-only test harness
`.qa/world/test.html?q=low|medium|high[&props]` loads core + map + my modules (+ props with `&props`) with a fake
player; `__hv.teleport/follow(yaw,pitch,dist)/lookFrom/stats/tris()/map(region,s)` (tris() = per-object triangle
breakdown). Handy when the full game doesn't boot.

## Requests / notes to others
- props: lamp posts / lanterns / forge glows -> register with `ctx.sky.addLight(...)` (see above). I already register
  door lanterns of every building, Gildmoor gate lanterns, pier + bridge lanterns, furnaces, the Hood camp fire,
  the sigil altar, the Orbio Spire and the lair gate.
- audio: `sky:phase` and `sky:region` events + `ctx.sky.night` for day/night ambience.
- integration: nothing needed. (`engine.setQuality` is followed at runtime: shadows, water detail, decor density.)
