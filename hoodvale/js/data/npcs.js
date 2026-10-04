// Non-hostile NPCs. Pure data. x, z = tile they stand on (centre = +0.5).
// options: right-click menu (first = left-click default). dialogue: id in game/content/dialogue.
// look: appearance for the actor builder (see DESIGN.md §Actors).
// thieving: pickpocket table when 'Pickpocket' is an option.

const NPC = {};
function npc(id, d) { NPC[id] = { id, yaw: 0, wander: 0, options: ['Talk-to', 'Examine'], ...d }; return NPC[id]; }

// ---- Brightwater ----
npc('guide_elowen', { name: 'Guide Elowen', x: 177, z: 241, zone: 'brightwater', role: 'Adventurer guide', examine: 'She has walked every road in the Vale.', dialogue: 'elowen', quest: 'into_the_vale',
  look: { body: 'female', skin: '#e0b48a', hair: 'braid', hairColor: '#c9a46a', top: '#2e6f8e', bottom: '#4a3a2a', cape: '#c0392b' } });
npc('banker_bw', { name: 'Banker Osric', x: 201, z: 237, zone: 'brightwater', role: 'Banker', examine: 'Keeps the Ledger honest.', options: ['Bank', 'Talk-to', 'Examine'], dialogue: 'banker',
  look: { body: 'male', skin: '#c8956b', hair: 'short', hairColor: '#3a2a1a', top: '#1f3a5a', bottom: '#2a2a2a', hat: 'cap' } });
npc('shop_pell', { name: 'Pell', x: 194, z: 241, zone: 'brightwater', role: 'General store', examine: 'Sells a bit of everything.', options: ['Trade', 'Talk-to', 'Examine'], shop: 'general', dialogue: 'pell',
  look: { body: 'male', skin: '#e0b48a', hair: 'bald', beard: 'full', hairColor: '#8a6a4a', top: '#7a5a2a', bottom: '#3a2a1a', apron: '#d8cbb0' } });
npc('smith_harlan', { name: 'Harlan the Smith', x: 199, z: 257, zone: 'brightwater', role: 'Smith', examine: 'Arms like anvils.', options: ['Talk-to', 'Trade', 'Examine'], shop: 'smith', dialogue: 'harlan',
  look: { body: 'male', build: 'stout', skin: '#a8754f', hair: 'short', beard: 'short', hairColor: '#2a1a12', top: '#5a3a2a', bottom: '#2a2a2a', apron: '#3a2a1a' } });
npc('innkeeper_marta', { name: 'Marta', x: 170, z: 259, zone: 'brightwater', role: 'Innkeeper', examine: 'Runs the Wobbly Kettle. Bakes the best cake in the Vale.', options: ['Talk-to', 'Trade', 'Examine'], shop: 'inn', dialogue: 'marta', quest: 'feast_for_brightwater',
  look: { body: 'female', build: 'stout', skin: '#e8b89a', hair: 'bun', hairColor: '#8a3a2a', top: '#a83a3a', bottom: '#4a3a2a', apron: '#f2ece0' } });
npc('fisher_tobin', { name: 'Tobin', x: 167, z: 249, zone: 'brightwater', role: 'Fisherman', examine: 'Smells of lake.', dialogue: 'tobin',
  look: { body: 'male', skin: '#c8956b', hair: 'short', hairColor: '#6a4a2a', hat: 'wide', top: '#4a6a4a', bottom: '#3a3a2a' } });
npc('elder_rowan', { name: 'Elder Rowan', x: 188, z: 249, zone: 'brightwater', role: 'Village elder', examine: 'Has rung the village bell every dawn for forty years. Until last week.', dialogue: 'rowan', quest: 'goblin_bell',
  look: { body: 'male', build: 'old', skin: '#e0b48a', hair: 'long', beard: 'long', hairColor: '#e8e8e8', top: '#5a4a7a', bottom: '#3a3a4a', staff: true } });
for (const [i, p] of [[184, 254], [190, 246], [180, 250]].entries()) {
  npc(`villager_${i}`, { name: 'Villager', x: p[0], z: p[1], zone: 'brightwater', role: 'Villager', examine: 'Going about their day.', wander: 5, options: ['Talk-to', 'Pickpocket', 'Examine'], dialogue: 'villager',
    thieving: { level: 1, xp: 8, credit: [1, 3], stunTicks: 4, maxHit: 1 },
    look: { body: i % 2 ? 'female' : 'male', skin: ['#e0b48a', '#8a5a3a', '#c8956b'][i], hair: ['short', 'long', 'bun'][i], hairColor: ['#3a2a1a', '#1a1a1a', '#a87a3a'][i], top: ['#6a7a3a', '#7a3a5a', '#3a5a7a'][i], bottom: '#3a3a2a' } });
}

// ---- Millbrook Farms ----
npc('farmer_hale', { name: 'Farmer Hale', x: 242, z: 240, zone: 'farms', role: 'Farmer', examine: 'Knows every cow by name.', wander: 3, options: ['Talk-to', 'Pickpocket', 'Examine'], dialogue: 'hale',
  thieving: { level: 10, xp: 14, credit: [2, 6], stunTicks: 5, maxHit: 1 },
  look: { body: 'male', skin: '#e0a07a', hair: 'short', hairColor: '#a87a3a', hat: 'straw', top: '#8a6a3a', bottom: '#3a4a6a' } });
npc('miller_nell', { name: 'Miller Nell', x: 241, z: 230, zone: 'farms', role: 'Miller', examine: 'Dusted in flour from head to toe.', dialogue: 'nell',
  look: { body: 'female', skin: '#f0c8a8', hair: 'bun', hairColor: '#e8e0d0', top: '#d8cbb0', bottom: '#8a7a6a', apron: '#f2ece0' } });

// ---- Saltreach Docks ----
npc('fishmonger_brine', { name: 'Brine', x: 206, z: 283, zone: 'docks', role: 'Fishmonger', examine: 'Sells tackle, buys fish.', options: ['Trade', 'Talk-to', 'Examine'], shop: 'fishing', dialogue: 'brine',
  look: { body: 'male', skin: '#a8754f', hair: 'bald', beard: 'full', hairColor: '#6a6a6a', top: '#2a4a6a', bottom: '#3a3a3a', hat: 'beanie' } });
npc('old_salt', { name: 'Old Salt', x: 191, z: 297, zone: 'docks', role: 'Retired sailor', examine: 'Has seen the wyrm. Twice. Allegedly.', dialogue: 'oldsalt',
  look: { body: 'male', build: 'old', skin: '#c8956b', hair: 'short', beard: 'full', hairColor: '#e8e8e8', top: '#1f3a5a', bottom: '#2a2a2a', hat: 'tricorn' } });

// ---- Hoodwood ----
npc('robyn', { name: 'Robyn of the Hood', x: 132, z: 160, zone: 'hoodwood', role: 'Leader of the Hood', examine: 'Steals from the rich. Audits the poor, generously.', dialogue: 'robyn', quest: 'hoods_oath',
  look: { body: 'female', skin: '#d9a77c', hair: 'short', hairColor: '#6a3a1a', top: '#3f7f3a', bottom: '#5a4a2a', hood: '#3f7f3a', cape: '#2f5f2a', weapon: 'longbow' } });
npc('little_jon', { name: 'Little Jon', x: 125, z: 160, zone: 'hoodwood', role: 'Quartermaster', examine: 'Not little.', options: ['Trade', 'Talk-to', 'Examine'], shop: 'archery', dialogue: 'jon',
  look: { body: 'male', build: 'stout', skin: '#8a5a3a', hair: 'short', beard: 'full', hairColor: '#2a1a12', top: '#5a6a2a', bottom: '#4a3a2a', scale: 1.15 } });
npc('friar_tuckwell', { name: 'Friar Tuckwell', x: 134, z: 156, zone: 'hoodwood', role: 'Camp cook', examine: 'Feeds outlaws. Asks no questions.', options: ['Talk-to', 'Trade', 'Examine'], shop: 'camp_food', dialogue: 'tuckwell',
  look: { body: 'male', build: 'stout', skin: '#e8b89a', hair: 'tonsure', hairColor: '#8a6a4a', top: '#6a4a2a', bottom: '#6a4a2a', robe: true } });
npc('marlowe', { name: 'Marlowe', x: 130, z: 154, zone: 'hoodwood', role: 'Thief trainer', examine: 'Your purse is fine. Probably. Check.', dialogue: 'marlowe',
  look: { body: 'female', skin: '#f0c8a8', hair: 'long', hairColor: '#1a1a1a', top: '#2a2a3a', bottom: '#2a2a2a', hood: '#2a2a3a' } });

// ---- Copperhollow ----
npc('foreman_dunstan', { name: 'Foreman Dunstan', x: 94, z: 255, zone: 'copperhollow', role: 'Mining foreman', examine: 'Can hear a vein of iron through a mile of rock. Allegedly.', options: ['Trade', 'Talk-to', 'Examine'], shop: 'mining', dialogue: 'dunstan',
  look: { body: 'male', build: 'stout', skin: '#c8956b', hair: 'short', beard: 'long', hairColor: '#8a4a2a', hat: 'helmet-lamp', top: '#6a5a3a', bottom: '#3a3a3a', scale: 0.92 } });

// ---- Mistfen ----
npc('old_wren', { name: 'Old Wren', x: 52, z: 160, zone: 'mistfen', role: 'Bog witch', examine: 'Older than the fen. Kinder than she looks.', dialogue: 'wren', quest: 'bog_song',
  look: { body: 'female', build: 'old', skin: '#c8b89a', hair: 'long', hairColor: '#cfcfcf', top: '#3a4a3a', bottom: '#2a3a2a', hat: 'witch', staff: true } });

// ---- Gildmoor ----
npc('banker_gm_1', { name: 'Banker Ida', x: 257, z: 167, zone: 'gildmoor', role: 'Banker', examine: 'Counts faster than you can blink.', options: ['Bank', 'Talk-to', 'Examine'], dialogue: 'banker',
  look: { body: 'female', skin: '#8a5a3a', hair: 'bun', hairColor: '#1a1a1a', top: '#1f3a5a', bottom: '#2a2a2a' } });
npc('banker_gm_2', { name: 'Banker Fen', x: 257, z: 169, zone: 'gildmoor', role: 'Banker', examine: 'Wears three pairs of spectacles.', options: ['Bank', 'Talk-to', 'Examine'], dialogue: 'banker',
  look: { body: 'male', skin: '#e0b48a', hair: 'short', hairColor: '#8a8a8a', top: '#1f3a5a', bottom: '#2a2a2a' } });
npc('clerk_ada', { name: 'Exchange clerk Ada', x: 238, z: 168, zone: 'gildmoor', role: 'Exchange clerk', examine: 'Matches buyers and sellers across the whole Vale.', options: ['Exchange', 'Talk-to', 'Examine'], dialogue: 'clerk',
  look: { body: 'female', skin: '#f0c8a8', hair: 'short', hairColor: '#c9a46a', top: '#5a2a6a', bottom: '#2a2a2a', hat: 'cap' } });
npc('clerk_bram', { name: 'Exchange clerk Bram', x: 238, z: 171, zone: 'gildmoor', role: 'Exchange clerk', examine: 'Has never once smiled at a price.', options: ['Exchange', 'Talk-to', 'Examine'], dialogue: 'clerk',
  look: { body: 'male', skin: '#c8956b', hair: 'short', hairColor: '#2a1a12', top: '#5a2a6a', bottom: '#2a2a2a', hat: 'cap' } });
npc('armourer_brackwell', { name: 'Brackwell', x: 256, z: 176, zone: 'gildmoor', role: 'Armourer', examine: 'His armour fits. Eventually.', options: ['Trade', 'Talk-to', 'Examine'], shop: 'armour', dialogue: 'brackwell',
  look: { body: 'male', build: 'stout', skin: '#e0b48a', hair: 'short', beard: 'short', hairColor: '#4a3a2a', top: '#5a5a5a', bottom: '#2a2a2a', apron: '#3a2a1a' } });
npc('lumen', { name: 'Lumen', x: 256, z: 148, zone: 'gildmoor', role: 'Sigil seller', examine: 'Her shop glows faintly at night.', options: ['Trade', 'Talk-to', 'Examine'], shop: 'arcana', dialogue: 'lumen',
  look: { body: 'female', skin: '#e8c8b0', hair: 'long', hairColor: '#e8e8ff', top: '#4a3a8a', bottom: '#2a2a4a', hood: '#4a3a8a' } });
npc('goose_keeper', { name: 'Tamsin', x: 241, z: 180, zone: 'gildmoor', role: 'Tavern keeper', examine: 'Runs the Gilded Goose.', options: ['Trade', 'Talk-to', 'Examine'], shop: 'inn', dialogue: 'tamsin',
  look: { body: 'female', skin: '#c8956b', hair: 'braid', hairColor: '#6a3a1a', top: '#a87a2a', bottom: '#3a2a1a', apron: '#f2ece0' } });
npc('tax_collector', { name: 'Tax collector', x: 250, z: 172, zone: 'gildmoor', role: "The Sheriff's tax collector", examine: 'Collects for the Sheriff. Keeps a little for himself.', wander: 6, options: ['Talk-to', 'Pickpocket', 'Examine'], dialogue: 'taxman',
  thieving: { level: 10, xp: 30, credit: [6, 25], stunTicks: 6, maxHit: 3, questItem: 'tax_ledger' },
  look: { body: 'male', skin: '#e0b48a', hair: 'short', hairColor: '#1a1a1a', top: '#7a2a2a', bottom: '#2a2a2a', hat: 'feathered-hat' } });
npc('merchant_gm', { name: 'Merchant', x: 244, z: 158, zone: 'gildmoor', role: 'Merchant', examine: 'Rich. Careless. Perfect.', wander: 4, options: ['Talk-to', 'Pickpocket', 'Examine'], dialogue: 'villager',
  thieving: { level: 40, xp: 65, credit: [20, 80], stunTicks: 6, maxHit: 4 },
  look: { body: 'male', build: 'stout', skin: '#f0c8a8', hair: 'short', hairColor: '#8a6a4a', top: '#2a5a3a', bottom: '#2a2a2a', hat: 'feathered-hat' } });
npc('sheriff_vane_npc', { name: 'Sheriff Vane', x: 266, z: 137, zone: 'gildmoor', role: 'Sheriff of Gildmoor', examine: 'Counting someone else\'s money.', dialogue: 'vane',
  look: { body: 'male', skin: '#e0b48a', hair: 'slick', hairColor: '#1a1a1a', top: '#3a1a2a', bottom: '#1a1a1a', hat: 'feathered-hat', cape: '#8a1a1a' } });

// ---- Orbio Spire ----
npc('oracle', { name: 'The Orbio Oracle', x: 258, z: 54, zone: 'oracle', role: 'Oracle of thought', examine: 'A mind of light. Every answer costs CREDIT.', options: ['Consult', 'Talk-to', 'Examine'], dialogue: 'oracle', quest: 'oracles_price', isOracle: true,
  look: { body: 'oracle' } });
npc('archivist_sol', { name: 'Archivist Sol', x: 255, z: 57, zone: 'oracle', role: 'Arcana tutor', examine: 'Writes down everything the Oracle says. Everything.', options: ['Talk-to', 'Trade', 'Examine'], shop: 'arcana', dialogue: 'sol',
  look: { body: 'male', build: 'slim', skin: '#8a5a3a', hair: 'long', hairColor: '#1a1a1a', top: '#2a4a6a', bottom: '#2a2a4a', robe: true } });

// ---- Ashen Highlands ----
npc('hermit_grimsby', { name: 'Hermit Grimsby', x: 107, z: 92, zone: 'highlands', role: 'Hermit', examine: 'He was a knight, once. Now he collects rocks.', dialogue: 'grimsby', quest: 'ashen_wyrm',
  look: { body: 'male', build: 'old', skin: '#c8956b', hair: 'long', beard: 'long', hairColor: '#8a8a8a', top: '#5a5a4a', bottom: '#3a3a2a', cape: '#4a4a4a' } });

export { NPC as NPCS };
