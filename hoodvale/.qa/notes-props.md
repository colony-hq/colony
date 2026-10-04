# Props builder notes (js/props/*)

## Requests to integration (data / map — not my files)

1. **Bridge & pier decks are not walkable at deck height.** `map.tileY()` / `heightAt()` return the
   terrain under the river/sea (e.g. -1.4 under the forest bridge, ~-6 under the piers), so actors
   walk *under* the decks I render at `BRIDGES[].deckY`. Suggest: in `mapgen.heightAt` (or at least
   `map.tileY` + the code paths that position actors: `entities.setPosFromTile`, the actor
   interpolation in `entities.update`, `player`), return `deckY` for points inside a bridge/pier
   rectangle (x0..x1+1, z0..z1+1). Decks: planks top at exactly `deckY`.
2. **Town wall ring cuts through the Sheriff's keep.** `bakeWorld()` marks ring tiles as
   `T_WALL|T_BLOCK` inside the keep footprint (260..272 x 133..145), so a diagonal wall splits the
   keep interior and the vault stairs object (269,136) sits on a wall tile (still usable
   diagonally from 268,137). I render that arc as an inner curtain wall inside the keep (with a gap
   at the stairs) so collision and art agree. If you skip ring tiles inside the keep footprint, the
   art follows automatically: `structures.js` already skips ring segments inside the keep and
   `b-special.js` only draws the inner arc where the ring passes through the keep — remove that
   loop (search "town wall runs through the keep") if the tiles are freed.
3. `tileY` comment says bridges use deck height but the implementation doesn't (see 1).

## What the props modules do at runtime (for other builders)

- **Dynamic blockers.** Furniture placed on interior tiles, lamp posts, camp benches, keep-yard
  props, wall towers outside Gildmoor and the Exchange portico columns call `ctx.map.block(x, z)`.
  Every placement is checked so it never disconnects a building interior (BFS from the doors) and
  never touches spawn objects/NPC tiles/door neighbourhoods; outdoor props only block a tile when
  all 8 neighbours are walkable. `ctx.structures.blocked` is the Set of outdoor tiles blocked.
- **Object views** (`ctx.objectViews.create(e)`): `view.setState('active'|'depleted')` switches
  tree→stump, rock→empty, crystal→dim, stall goods, wheat/flax→stubble, nest eggs. Views also
  follow `entity.state.depleted` transitions on their own, so either API works. Fishing-spot views
  follow `entity.pos` if the game moves the spot.
- Temporary fires: `objectViews.create(entity)` for `def.id === 'fire'` at any time works (own mesh
  + flame FX); `dispose()` removes everything.
- Ground items: `objectViews.createItem(e)` — a small 3D model per `icon.shape` (all 63 shapes),
  tinted by `icon.color/color2`, slight bob + spin, soft shadow blob. Non-stackables with qty > 1
  show up to 3 copies.
- `ctx.buildings.inside` → the building the player stands in (roof faded), or null.
- `ctx.buildings.entries[i].op` → roof opacity per building (1 visible, 0 hidden).

## Perf notes

- Static geometry is merged per cell (buildings 32 tiles, structures 40 tiles, unique objects per
  107-tile chunk); repeated objects are InstancedMesh pools per chunk with visible instances packed
  densely (hidden = not drawn). Trees: detailed model within ~40 m (high) / 30 m (medium) of the
  camera, simple model beyond (simple ones cast no shadows). Pools/batches are distance-culled
  (fraction of `preset.drawDistance`, never beyond fog) and only cast shadows within ~40-60 m.
- One shared hand-painted atlas (2048², CanvasTexture) + one patched Lambert material family
  (`kit.js`): atlas cell tiling, night-glow windows (`ctx.sky.hour`), sway, alpha-hashed roof fade.

## Data observations (not caused by props)

- Two `fish_cage_harpoon` spots at (203,297) and (203,302), east of `pier-east`, are unreachable
  from the spawn even with all props blockers removed (checked with `map.findPath` adjacent goals,
  150k nodes). Every other NPC and overworld object is reachable with the props blockers in place.
- `gm-stables` (256..263 x 184..188) overlaps the town-wall ring (tiles 259..261,188 / 262..263,187
  / 263,186 are ring wall tiles). The stables art shrinks its footprint to stay inside the wall.
