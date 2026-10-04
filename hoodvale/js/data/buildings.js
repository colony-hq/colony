// Building footprints. Pure data. mapgen.js flattens a pad under each one, blocks the perimeter
// (walls) except door tiles, and marks the interior INDOOR. `solid: true` = not enterable (the
// whole footprint blocks). `open: true` = roof on posts, no walls (nothing blocks).
//
// x, z = north-west tile of the footprint; w (east-west) and d (north-south) in tiles.
// doors = tiles in the perimeter left open (face outward). style = art direction hint for the
// buildings builder. `role` names what happens inside (NPCs/objects are placed by data/spawns.js).

export const BUILDINGS = [
  // ---- Brightwater (start village) ----
  { id: 'bw-hall', name: "Guide's Hall", zone: 'brightwater', x: 173, z: 238, w: 8, d: 7, doors: [{ x: 176, z: 244 }], style: 'timber-hall', role: 'tutorial' },
  { id: 'bw-store', name: 'Brightwater General Store', zone: 'brightwater', x: 191, z: 239, w: 7, d: 6, doors: [{ x: 194, z: 244 }], style: 'timber-shop', role: 'shop:general' },
  { id: 'bw-bank', name: 'Brightwater Ledger House', zone: 'brightwater', x: 199, z: 235, w: 6, d: 6, doors: [{ x: 201, z: 240 }], style: 'stone-bank', role: 'bank' },
  { id: 'bw-smithy', name: 'Brightwater Smithy', zone: 'brightwater', x: 196, z: 254, w: 7, d: 6, open: true, style: 'open-forge', role: 'furnace+anvil' },
  { id: 'bw-inn', name: 'The Wobbly Kettle', zone: 'brightwater', x: 166, z: 256, w: 9, d: 7, doors: [{ x: 170, z: 256 }], style: 'timber-inn', role: 'range+food' },
  { id: 'bw-house-1', name: 'Cottage', zone: 'brightwater', x: 196, z: 262, w: 6, d: 5, doors: [{ x: 198, z: 262 }], style: 'cottage' },
  { id: 'bw-house-2', name: 'Cottage', zone: 'brightwater', x: 180, z: 264, w: 5, d: 5, doors: [{ x: 182, z: 264 }], style: 'cottage' },
  { id: 'bw-house-3', name: 'Cottage', zone: 'brightwater', x: 202, z: 226, w: 6, d: 5, doors: [{ x: 204, z: 230 }], style: 'cottage' },

  // ---- Millbrook Farms ----
  { id: 'farm-windmill', name: 'Millbrook Windmill', zone: 'farms', x: 244, z: 228, w: 5, d: 5, solid: true, style: 'windmill', role: 'flour' },
  { id: 'farm-barn', name: 'Barn', zone: 'farms', x: 228, z: 242, w: 9, d: 7, doors: [{ x: 232, z: 242 }], style: 'barn' },
  { id: 'farm-house', name: 'Farmhouse', zone: 'farms', x: 240, z: 244, w: 7, d: 6, doors: [{ x: 243, z: 244 }], style: 'cottage' },

  // ---- Saltreach Docks ----
  { id: 'dock-fishmonger', name: 'Saltreach Fishmonger', zone: 'docks', x: 204, z: 281, w: 5, d: 4, doors: [{ x: 206, z: 281 }], style: 'shack', role: 'shop:fishing' },

  // ---- Hoodwood outlaw camp ----
  { id: 'hood-lodge', name: 'The Hood Lodge', zone: 'hoodwood', x: 123, z: 157, w: 6, d: 7, doors: [{ x: 128, z: 160 }], style: 'log-lodge', role: 'shop:archery+quest' },
  { id: 'hood-tent-1', name: 'Tent', zone: 'hoodwood', x: 127, z: 150, w: 4, d: 4, solid: true, style: 'tent-green' },
  { id: 'hood-tent-2', name: 'Tent', zone: 'hoodwood', x: 134, z: 149, w: 4, d: 4, solid: true, style: 'tent-brown' },
  { id: 'hood-tent-3', name: 'Tent', zone: 'hoodwood', x: 139, z: 154, w: 4, d: 3, solid: true, style: 'tent-green' },

  // ---- Copperhollow ----
  { id: 'miners-hut', name: "Miners' Hut", zone: 'copperhollow', x: 92, z: 253, w: 6, d: 5, doors: [{ x: 94, z: 257 }], style: 'stone-hut', role: 'shop:mining' },

  // ---- Mistfen ----
  { id: 'fen-hut', name: "Old Wren's Hut", zone: 'mistfen', x: 50, z: 158, w: 5, d: 5, doors: [{ x: 52, z: 162 }], style: 'stilt-hut', role: 'quest' },

  // ---- Gildmoor (walled town) ----
  { id: 'gm-exchange', name: 'The Gildmoor Exchange', zone: 'gildmoor', x: 236, z: 165, w: 11, d: 9, doors: [{ x: 241, z: 165 }, { x: 246, z: 169 }], style: 'stone-hall-grand', role: 'exchange' },
  { id: 'gm-bank', name: 'Gildmoor Ledger Bank', zone: 'gildmoor', x: 253, z: 165, w: 8, d: 7, doors: [{ x: 253, z: 168 }], style: 'stone-bank', role: 'bank' },
  { id: 'gm-armoury', name: 'Brackwell Armoury', zone: 'gildmoor', x: 253, z: 174, w: 7, d: 6, doors: [{ x: 253, z: 176 }], style: 'stone-shop', role: 'shop:armour' },
  { id: 'gm-tavern', name: 'The Gilded Goose', zone: 'gildmoor', x: 237, z: 177, w: 9, d: 7, doors: [{ x: 245, z: 180 }], style: 'timber-inn', role: 'range+food' },
  { id: 'gm-sigils', name: 'Lumen & Sigil', zone: 'gildmoor', x: 253, z: 146, w: 6, d: 6, doors: [{ x: 253, z: 148 }], style: 'stone-shop', role: 'shop:arcana' },
  { id: 'gm-keep', name: "The Sheriff's Keep", zone: 'gildmoor', x: 260, z: 133, w: 13, d: 13, doors: [{ x: 266, z: 145 }], style: 'castle-keep', role: 'sheriff+vault' },
  { id: 'gm-house-1', name: 'Townhouse', zone: 'gildmoor', x: 236, z: 145, w: 7, d: 6, doors: [{ x: 239, z: 150 }], style: 'townhouse' },
  { id: 'gm-house-2', name: 'Townhouse', zone: 'gildmoor', x: 227, z: 167, w: 6, d: 5, doors: [{ x: 229, z: 167 }], style: 'townhouse' },
  { id: 'gm-stables', name: 'Stables', zone: 'gildmoor', x: 256, z: 184, w: 8, d: 5, open: true, style: 'stables' },
  { id: 'gm-smithy', name: 'Gildmoor Forge', zone: 'gildmoor', x: 230, z: 151, w: 6, d: 5, open: true, style: 'open-forge', role: 'furnace+anvil' },

  // ---- Orbio Spire ----
  { id: 'spire', name: 'The Orbio Spire', zone: 'oracle', x: 254, z: 51, w: 9, d: 9, doors: [{ x: 258, z: 59 }], style: 'crystal-spire', role: 'oracle' },

  // ---- Ashen Highlands ----
  { id: 'watchtower', name: 'Ruined Watchtower', zone: 'highlands', x: 106, z: 86, w: 4, d: 4, solid: true, style: 'ruin-tower' },
];
