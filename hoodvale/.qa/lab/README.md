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
4. **Register** the id in `js/actors/a-model.js` (`HERO_MODELS` for the creator, or `MODELS` for NPC /
   monster bodies), then point a look at it with `look.model = '<id>'`. Run `node tools/manifest.mjs` so the
   publish step ships the new files.

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

## Roster

| id | for | status |
| --- | --- | --- |
| player_m | hero "Ranger" (default player) | shipped |
| mage_f | hero (female mage, violet robe, skirt mode) | concept done: image job a0acb393-cd6e-45ba-9e40-b435eae3e507 |
| guide_f | Guide Elowen | concept done: image job e25f0a4e-1757-4667-b660-00ce87945d3f |
| banker_m | bankers Osric / Fen, clerk Bram | concept done: image job 9e9fb8e8-7574-4e82-b819-40f6c0b7cce5 |
| player_f | hero (female adventurer) | to do |
| warrior_m | hero (warrior, breastplate) | to do |
| clerk_f, shopkeep_m, smith_m, innkeeper_f, farmer_m, elder_m, villager_f, villager_m | town NPCs | to do |
| old_salt, robyn, friar, marlowe, wren, sheriff, noble_m | named NPCs | to do |
| goblin, bandit, guard, troll | biped monsters | to do |

The Higgsfield account hit its daily generation limit (grace period) on 2026-10-04 after the first four images
and one 3D model; the rest waits for the limit to reset.
