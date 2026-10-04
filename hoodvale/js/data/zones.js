// World layout: zones, roads, river, lakes, bridges. Pure data, load-bearing for every module.
// Coordinates in tiles/metres (see world/mapgen.js). Do not change without updating DESIGN.md.

export const ZONES = {
  brightwater: {
    name: 'Brightwater', x: 186, z: 252, r: 26, floor: 2.4, levels: '1-5', music: 'village',
    blurb: 'A lakeside village where every adventurer starts. Friendly, safe, smells of bread.',
  },
  farms: {
    name: 'Millbrook Farms', x: 238, z: 238, r: 24, floor: 2.9, levels: '1-5', music: 'pastoral',
    blurb: 'Wheat, cows, chickens and a creaky windmill between Brightwater and Gildmoor.',
  },
  docks: {
    name: 'Saltreach Docks', x: 196, z: 290, r: 13, floor: 1.4, levels: '1-40', music: 'coast',
    blurb: 'Fishing piers on the southern sea.',
  },
  hoodwood: {
    name: 'Hoodwood', x: 150, z: 165, r: 44, levels: '5-20', music: 'forest',
    blurb: 'An old forest where the Hood, an outlaw guild, keeps its camp.',
    camp: { x: 132, z: 157, r: 9 },
  },
  copperhollow: {
    name: 'Copperhollow', x: 82, z: 262, r: 30, levels: '5-25', music: 'mines',
    blurb: 'Hills riddled with ore veins. Goblins dug the Warrens beneath them.',
  },
  mistfen: {
    name: 'Mistfen', x: 58, z: 168, r: 38, levels: '20-40', music: 'swamp',
    blurb: 'A drowned marsh of willows, bog pools and things that lurk.',
  },
  gildmoor: {
    name: 'Gildmoor', x: 250, z: 160, r: 36, floor: 4.0, levels: '10-40', music: 'town',
    blurb: 'The walled trade town. The Sheriff rules from the keep; the Exchange never sleeps.',
    wallR: 30,
    gates: [ // angles: atan2(dz, dx) from the town centre
      { id: 'south', ang: Math.PI / 2 }, { id: 'north', ang: -Math.PI / 2 }, { id: 'west', ang: Math.PI },
    ],
    castle: { x: 266, z: 140, r: 9 },
  },
  oracle: {
    name: 'Orbio Spire', x: 258, z: 58, r: 34, floor: 15, levels: '20-60', music: 'oracle',
    blurb: 'A plateau of humming crystals. The Orbio Oracles answer questions, for a price in CREDIT.',
  },
  highlands: {
    name: 'Ashen Highlands', x: 92, z: 66, r: 58, levels: '40-70', music: 'highlands',
    blurb: 'Grey peaks, trolls and stone golems. Something vast sleeps under the Ashen Peak.',
    peak: { x: 70, z: 44, r: 8, floor: 31 },
  },
};

// River from the highlands to the sea, through Hoodwood and Brightwater Lake.
export const RIVER = {
  width: 5, depth: -1.4,
  points: [
    { x: 118, z: 72 }, { x: 128, z: 100 }, { x: 140, z: 128 }, { x: 156, z: 160 }, { x: 160, z: 186 },
    { x: 158, z: 214 }, { x: 156, z: 238 }, { x: 160, z: 262 }, { x: 164, z: 284 }, { x: 168, z: 318 },
  ],
};

export const LAKES = [
  { id: 'brightwater-lake', x: 152, z: 246, r: 12, depth: -2.2 },
  { id: 'fen-mere', x: 44, z: 176, r: 9, depth: -1.6 },
];

// Roads (3 tiles wide unless stated). Name shown on the world map.
export const ROADS = [
  { id: 'kings-road', name: "King's Road", points: [{ x: 186, z: 252 }, { x: 208, z: 244 }, { x: 234, z: 236 }, { x: 246, z: 214 }, { x: 250, z: 196 }, { x: 250, z: 160 }] },
  { id: 'forest-road', name: 'Forest Road', points: [{ x: 186, z: 252 }, { x: 182, z: 228 }, { x: 170, z: 202 }, { x: 159, z: 187 }, { x: 146, z: 172 }, { x: 132, z: 157 }] },
  { id: 'miners-way', name: "Miners' Way", points: [{ x: 186, z: 252 }, { x: 176, z: 266 }, { x: 161, z: 272 }, { x: 140, z: 272 }, { x: 112, z: 268 }, { x: 86, z: 262 }] },
  { id: 'fen-path', name: 'Fen Path', width: 2, points: [{ x: 132, z: 157 }, { x: 104, z: 164 }, { x: 78, z: 168 }, { x: 62, z: 170 }] },
  { id: 'spire-road', name: 'Spire Road', points: [{ x: 250, z: 160 }, { x: 250, z: 128 }, { x: 252, z: 100 }, { x: 255, z: 80 }, { x: 258, z: 60 }] },
  { id: 'highland-trail', name: 'Highland Trail', width: 2, points: [{ x: 132, z: 157 }, { x: 126, z: 130 }, { x: 112, z: 104 }, { x: 98, z: 80 }, { x: 80, z: 56 }, { x: 72, z: 46 }] },
  { id: 'dock-lane', name: 'Dock Lane', width: 2, points: [{ x: 186, z: 252 }, { x: 192, z: 274 }, { x: 196, z: 292 }] },
  { id: 'west-gate', name: 'Westgate Lane', width: 2, points: [{ x: 250, z: 160 }, { x: 220, z: 160 }, { x: 196, z: 176 }, { x: 170, z: 202 }] },
];

// Bridges over the river where roads cross, and piers over the sea (tile ranges, inclusive).
// axis = direction you walk across. Decks are walkable regardless of the water below.
export const BRIDGES = [
  { id: 'forest-bridge', kind: 'bridge', x0: 155, x1: 163, z0: 185, z1: 189, deckY: 1.6, axis: 'x' },
  { id: 'miners-bridge', kind: 'bridge', x0: 159, x1: 165, z0: 270, z1: 274, deckY: 1.6, axis: 'x' },
  { id: 'hood-ford', kind: 'bridge', x0: 124, x1: 128, z0: 98, z1: 103, deckY: 1.6, axis: 'x' },
  { id: 'pier-west', kind: 'pier', x0: 190, x1: 192, z0: 290, z1: 305, deckY: 1.5, axis: 'z' },
  { id: 'pier-east', kind: 'pier', x0: 200, x1: 202, z0: 289, z1: 302, deckY: 1.5, axis: 'z' },
];

// Fenced pens: rectangle outlines (tiles x0..x1, z0..z1 inclusive) that block movement except at
// the gate tiles.
export const FENCES = [
  { id: 'cow-pen', x0: 248, x1: 261, z0: 236, z1: 247, gates: [{ x: 248, z: 241 }, { x: 248, z: 242 }] },
  { id: 'chicken-run', x0: 221, x1: 230, z0: 225, z1: 232, gates: [{ x: 226, z: 232 }] },
  { id: 'hood-range', x0: 136, x1: 146, z0: 163, z1: 170, gates: [{ x: 136, z: 166 }], low: true },
];

// Where new players appear and where they respawn after dying.
export const SPAWN = { x: 188.5, z: 255.5, zone: 'brightwater' };
export const RESPAWN = { x: 186.5, z: 251.5 };
