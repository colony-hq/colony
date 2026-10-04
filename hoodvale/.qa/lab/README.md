# Character lab: generated 3D characters

Pipeline for the hand-crafted looking characters (player heroes, later NPCs and monsters):

1. **Concept art** (Higgsfield `gpt_image_2_5`, 2:3, ~0.25 credits) with the prompt template below.
2. **3D mesh** (Higgsfield `tripo_h3_1_image_to_3d`, ~9 credits): `medias: [{ role: 'image_references', value: <image job id> }]`,
   `face_limit: 14000, pbr: false, texture: true, texture_quality: 'standard', texture_alignment: 'original_image'`.
   Download the GLB to `.qa/lab/src/<id>.glb` (git-ignored).
3. **Auto-rig** onto the HB skeleton: `.qa/lab/build.sh <id> ['{"skirt":true}']` runs `lab.html` headless
   (orient, exact cross-section slices, joints, skin weights, arms-down re-pose) and writes
   `assets/chars/<id>.json` + `<id>.jpg`. Check the previews it saves (front / side / pose) for left-behind
   vertices (spikes) before shipping. Robes and dresses need `{"skirt":true}` when the legs are not separate.
4. **Register** the id in `MODELS` in `js/actors/a-model.js` (heroes are already listed in `HEROES`; NPCs,
   travellers and monsters already point at their ids). Run `node tools/manifest.mjs` so the publish step ships the new files, and `.qa/regress.sh`
   (known pre-existing failure: content-smoke-2 waits for a make menu that a single recipe skips).

Runtime: `a-model.js` loads the JSON + JPEG (same origin), `HumanDriver` builds a textured skinned mesh on
bones laid out from the model's joints; held weapons / shields / quivers are a second skinned mesh on the
same skeleton. Armour pieces (helms, platebodies, legs) are not drawn on generated bodies.

## Prompt template

> Full-body 3D game character concept for a stylized fantasy MMORPG, {description}. Standing straight in a
> neutral A-pose: arms straight and angled 45 degrees down away from the body, palms facing down, legs
> slightly apart, feet pointing forward. Front view, symmetrical, whole body visible from head to toe with
> margin, plain flat white background, no shadow, no props, no weapon. Hand-painted stylized look with chunky
> readable proportions (slightly large head, hands and feet), clean color blocks, soft lighting, like a
> polished modern stylized RPG.

## Saving generations: two characters per concept sheet

The account currently allows about 5 generations a day (grace period). Concept art is made two characters at a
time (3:2 sheet), split locally and uploaded, so each character costs ~1.5 generations instead of 2:

1. `generate_image` (gpt_image_2_5, aspect 3:2) with the duo template below.
2. Download the sheet, `node .qa/lab/split.mjs sheet.png a.png b.png` (one image per character, 2:3 on white).
3. `media_upload` per crop -> `curl -X PUT -H "Content-Type: image/png" -H "If-None-Match: *" --data-binary @a.png '<upload_url>'`
   (HTTP 200) -> `media_confirm` (type image) -> use the media_id as the Tripo `image_references`.
4. Tripo 3D as above, then `build.sh`.

Duo template:

> Character sheet for a stylized fantasy MMORPG: two separate full-body 3D game characters standing side by side
> with wide empty white space between them, not touching or overlapping. Left: {A}. Right: {B}. Both stand straight
> in a neutral A-pose: arms straight and angled 45 degrees down away from the body, palms facing down, legs
> slightly apart, feet pointing forward. Front view, symmetrical, whole bodies visible from head to toe with
> margin, plain flat white background, no shadow, no props, no weapons. Hand-painted stylized look with chunky
> readable proportions (slightly large head, hands and feet), clean color blocks, soft lighting, like a polished
> modern stylized RPG.

## Roster

Already wired: `look.model` in `js/data/npcs.js` and `js/content/travellers.js`, `model.gen` in
`js/data/monsters.js`. A model goes live by shipping its files and adding its id to `MODELS` in
`js/actors/a-model.js`. build.sh options: skirt for robes / dresses; height 1.70 for women, goblin 1.4 (monster
scale 0.72-1.3 on top), troll 1.9 (scale 1.8), everyone else 1.78.

| id | used by | build opts | concept | status |
| --- | --- | --- | --- | --- |
| player_m | hero Ranger, traveller Pip | | single | shipped |
| guide_f | Guide Elowen | height 1.70 | image job e25f0a4e-1757-4667-b660-00ce87945d3f | needs 3D |
| banker_m | bankers Osric / Fen, clerk Bram | | image job 9e9fb8e8-7574-4e82-b819-40f6c0b7cce5 (crop media 76347c72-e069-47ac-aac5-4f6fb8e6cdd8) | needs 3D |
| mage_f | hero Mystic, Lumen | skirt, height 1.70 | image job a0acb393-cd6e-45ba-9e40-b435eae3e507 | needs 3D |
| player_f + warrior_m | heroes Wayfarer / Warden, travellers Mira / Hesketh | f: height 1.70 | duo 1 | to do |
| villager_f + villager_m | villagers, travellers Dovie / Wynn | f: skirt, height 1.70 | duo 2 | to do |
| smith_m + innkeeper_f | Harlan, Brackwell, Dunstan, Little Jon, travellers Bertie / Fergus; Marta, Tamsin, Nell | f: skirt, height 1.70 | duo 3 | to do |
| shopkeep_m + farmer_m | Pell, Brine; Hale, Tobin | | duo 4 | to do |
| elder_m + clerk_f | Rowan, Grimsby, Sol; Ada, Ida, traveller Juniper | m: skirt; f: height 1.70 | duo 5 | to do |
| robyn + old_salt | Robyn; Old Salt, traveller Corwin | robyn: height 1.70 | duo 6 | to do |
| goblin + bandit | goblin, brute, warchief; bandit | goblin: height 1.4 | duo 7 | to do |
| guard + sheriff | sheriff's guard, vault knight; Sheriff Vane (NPC + boss) | | duo 8 | to do |
| friar + wren | Friar Tuckwell; Old Wren | skirt; wren: skirt, height 1.70 | duo 9 | to do |
| marlowe + noble_m | Marlowe; tax collector, merchant | marlowe: height 1.70 | duo 10 | to do |
| troll | highland troll | height 1.9 | single | to do |

Descriptions (keep these exact so the cast stays consistent):
- player_f: a young female adventurer with auburn hair in a short ponytail and freckles, green hooded cowl folded back on the shoulders, brown leather jerkin over a cream linen shirt, wide belt with a pouch, dark green fitted trousers, sturdy leather boots, leather bracers
- warrior_m: a sturdy male warrior with dark brown skin, short black hair and a trimmed beard, riveted steel breastplate over a red padded gambeson, rounded steel pauldrons, brown trousers, steel greaves over heavy boots, leather gloves
- villager_f: a young female villager with dark brown skin and black hair in a bun, plum-coloured blouse, brown ankle-length skirt, simple brown shoes
- villager_m: a young male villager with light brown hair, olive green tunic with a rope belt, brown trousers, simple leather shoes
- smith_m: a burly male blacksmith with tan skin, short dark hair and a short dark beard, short-sleeved brown shirt, heavy dark leather apron, thick leather gloves, dark trousers, heavy boots
- innkeeper_f: a plump cheerful female innkeeper with auburn hair in a bun, red dress with rolled sleeves and a white apron, brown shoes
- shopkeep_m: a jolly bald male shopkeeper with a big bushy brown beard, brown shirt with rolled-up sleeves, long cream canvas apron, brown trousers, sturdy shoes
- farmer_m: a cheerful male farmer with sandy hair and stubble, wide straw hat, short-sleeved ochre shirt under a brown vest, blue trousers, brown work boots, leather gloves
- elder_m: a kindly old village elder with long white hair and a long white beard, purple wool robe reaching the ankles with a gold sash, simple sandals
- clerk_f: a young female market clerk with fair skin and short honey-blonde hair, purple jacket over a gold waistcoat, small purple cap, dark trousers, black shoes
- robyn: a confident female outlaw archer with short auburn hair, green hood up, green tunic and a dark green short cape, brown leather bracers and gloves, brown trousers, tall boots, a quiver strap across the chest
- old_salt: an old weathered male sailor with a white beard and an eyepatch, navy blue coat, dark trousers, black boots, black tricorn hat
- goblin: a small green goblin with big pointy ears, a sharp toothy grin, scraggly black hair, ragged brown tunic and loincloth, leather wrist wraps, bare clawed feet
- bandit: a masked male bandit with a dark red cloth mask over the lower face, dark hood down, dark grey leather jerkin, brown trousers, boots, leather bracers
- guard: a sheriff's guard in a steel kettle helmet, chainmail shirt under a red tabard with a gold coin crest, steel pauldrons, steel gauntlets, dark trousers, steel greaves and boots
- sheriff: an arrogant male sheriff with slick black hair and a thin moustache, crimson velvet coat with gold trim, gold chain of office, red cape, black gloves, black trousers, tall black boots, black feathered hat
- friar: a jolly rotund friar with a tonsure haircut, brown hooded monk robe tied with a rope belt, wooden bead necklace, sandals
- wren: a kind old bog witch with long grey hair, a wide pointed witch hat, mossy green shawl over a dark green dress, bead necklace
- marlowe: a sly young female thief with long black hair, dark charcoal hood down, dark fitted leather jacket, black gloves, dark trousers, soft black boots, a small satchel
- noble_m: a sly well-fed male merchant with short brown hair, green velvet doublet with a gold-embroidered vest, gold necklace, dark trousers, buckled shoes, a feathered cap
- troll (single, 2:3, single-character template): a huge hunched mountain troll with grey-green stony skin, tiny eyes, a big nose, small tusks, very long arms, a ragged hide loincloth, bare big feet

Daily order (5 generations a day): (1) 3D guide_f, banker_m, mage_f + duos 1, 2; (2) 3D player_f, warrior_m,
villager_f, villager_m + duo 3; (3) 3D smith_m, innkeeper_f + duos 4, 5, 6; (4) 3D shopkeep_m, farmer_m,
elder_m, clerk_f, robyn; (5) 3D old_salt + duos 7, 8, 9 + 3D goblin; (6) 3D bandit, guard, sheriff, friar, wren;
(7) duo 10, troll concept + 3D marlowe, noble_m, troll. If the account limit is lifted, do it all in one go.
