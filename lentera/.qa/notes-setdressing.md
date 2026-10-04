# Notes from the setdressing builder (structures + vegetation)

Files (all mine): `js/world/structures.js`, `vegetation.js`, `props-kit.js` (geometry builder:
merge-per-material, metre UVs, frames, colliders), `props-textures.js` (procedural textures +
materials), `props-common.js` (campfire pit, lamps, logs, fences, jars, ratna, signposts),
`struct-pier.js`, `struct-boat.js`, `struct-kampung.js`, `struct-signs.js`, `struct-waterfall.js`,
`struct-candi.js`, `struct-wreck.js`, `struct-lighthouse.js`, `veg-textures.js`, `veg-geo.js`,
`veg-instancing.js`.

## structures API (DESIGN §7 + additions)
- Contract fields unchanged: `anchors, boat, pelita, sockets, campfires, lighthouse,
  setCandiDoor(open), update`.
- `setCandiDoor(open, instant = false)`: the slab sinks into the floor over ~2.4 s; its collider is
  disabled once it is 60 % down (re-enabled immediately when closing). `candiDoorOpen` mirrors it.
- `boat`: `{object, setPose(x,z,yaw), manual, setSail(open), seat (Vector3 = anchors['boat:seat']),
  seatLocal (floorboards, y -0.12), thwartLocal (middle seat plank top, y 0.34), updateSeat()}`.
  Bobbing uses `ctx.ocean.waveHeight` (+ a small idle sway) unless `boat.manual`. setPose moves a
  walkable collider with the hull. If the floor-sitting shins poke through the hull in the intro,
  `thwartLocal` with a chair-style sit (seat ≈ 0.3) is the alternative (player notes).
- `pelita[id]` / `sockets[id]`: `{object, position, lit, setLit(bool)}` — setLit only switches an
  ember/coal disc between dark and HDR glow (no lights). Socket coals take the flame colour.
- `lighthouse`: `{object, lamp, beams (empty Group, finale owns the beams), top, glow,
  setLampGlow(0..1)}` — glass emissive, lens HDR, and the tower windows follow the glow.
- `setWindowGlow(v)`: scales every house/warung window + door glow (e.g. 0.3 at dawn in the finale).
- Extras: `regions {name: Group}`, `houses [{id, deck, stairFoot, ridge}]`, `footprints [{x,z,r}]`
  (vegetation keep-out), `buildTimes`, `waterfall {sheet, foam, mist}`, `kit`.
- Extra anchors (Vector3): `pier:start`, `pier:end`, `house:<id>` (deck centre, y 4.8),
  `roof:<id>` (ridge top — NOT reachable, roofs have no colliders), `warung:counter`,
  `cave:entrance`, `candi:top` (54.5), `candi:gate`, `pelita:<id>`, `socket:<id>`,
  `mercusuar:door`, `wreck:table`, `wreck:ramp` (foot of the plank ramp, y -0.55),
  `wreck:mast`, plus the contract ones.

## Kilau vista ideas that are reachable (verified with collision walks)
Every house deck (y 4.8), the warung benches, the pier end, the candi terraces T1/T2/T3 (36/38/40)
and the balustrade gate lintel area, the shrine chamber (after opening), the wreck bow deck
(~3.3) and cabin roof (~4.4, reach by jumping from the bow? not guaranteed), the lighthouse
plinth ledge (20.55) and paving, the cave pedestal niche, the cave roof / mesa top (28.8),
fallen candi blocks.

## Collision facts
- House decks: solid+walkable slab 4.35–4.8; bodies solid (no interiors); railings solid
  non-walkable; front stairs 5 risers ≤ 0.36 m. Roofs have no colliders.
- Pier: deck slab top 1.6 (z 203.5–248), stepped ramp from the beach (z 196→203.5).
- Candi: terraces are solid boxes (+0.2 m moulding margin); recessed stair notches on the south
  axis (S1 courtyard→T1 protrudes south, S2/S3 recessed), all risers 0.4. The south pelita stands in
  the processional path at (30,-125.5); there is 1.1 m clearance on each side.
- Wreck: stepped deck cells (≤ 0.22 m between cells), bulwarks solid, hull blocks swimmers below
  deck, ramp steps (≤ 0.38) continue under water to y −1.25 so a swimmer can step onto the foot.
  Cabin walls solid with a 1.1 m door gap (forward); table collider top ≈ 2.08 under the flame.
- Cave: roof collider x[-150.5,-133] y 7.5–28.8 + lip shelf x[-156,-150.5] y 22–28.8 (the area
  under the shelf in front of the mouth is open water). Cave wall boxes follow the wall curve.
- Trees/palms/bamboo/banyan/kamboja: trunk cylinders (tag `tree`, `beringin`); big beach rocks are
  walkable cylinders (tag `rock`).

## Observations / requests
- integration: `rumah-5` (2,124, w 8) straddles PATHS[1] (the path passes x≈5.7 at z=124, inside
  the house's east stilts). Moving that path vertex east (e.g. (12,118)) would avoid it.
- landscape: the carved cave slot's rounded end is narrower in the baked grid than the analytic
  capsule (grid triangles at x∈[-140,-137.5] ramp up toward the corners); my cave wall follows
  the flat part, so nothing to do — just don't widen the cave floor visuals beyond x = -138.
- landscape: thanks for ending the river ribbon at x = -156; my top flow over the cave roof runs
  from x = -141 to the lip at y ≈ 29.1.
- gameplay: lighthouse beams removed on my side as suggested (`lighthouse.beams` is an empty
  group kept for compatibility).
- npc-ai: Sarni's old seat log was removed (her dingklik covers it); Laras sits on the floor with
  no prop of mine under her. Four sitting logs ring the kampung fire at r 4.3 for ambience.
- Vegetation is CPU-culled per instance (distance + widened frustum) every ~0.12 s when the
  camera moves; only instances within 70 m cast shadows (near/far twin meshes).
- Load cost (SwiftShader container, q=high): structure textures ≈1.4 s, vegetation ≈0.3 s,
  region builds ≈0.4 s.
