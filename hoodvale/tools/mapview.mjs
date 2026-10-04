// Renders the overworld (heights, water, blocked tiles, roads, buildings, zones, spawns) to a PNG.
// Usage: node tools/mapview.mjs out.png [scale]
import fs from 'node:fs';
import { encodePNG } from './png.mjs';
import { bakeWorld, OVERWORLD, T_BLOCK, T_WATER, T_ROAD, T_WALL, T_CLIFF, T_BRIDGE, T_INDOOR, ZONE_IDS } from '../js/world/mapgen.js';
import { ZONES } from '../js/data/zones.js';
import { BUILDINGS } from '../js/data/buildings.js';

const out = process.argv[2] || 'map.png';
const S = Number(process.argv[3] || 3);
const G = bakeWorld();
const W = OVERWORLD.w * S, H = OVERWORLD.h * S;
const rgb = Buffer.alloc(W * H * 3);
let spawns = null;
try { spawns = (await import('../js/data/spawns.js')).buildSpawns(); } catch (e) { /* not yet */ }
const hAt = (x, z) => G.heights[Math.min(G.N - 1, z) * G.N + Math.min(G.N - 1, x)];
for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
  const tx = Math.floor(px / S), tz = Math.floor(py / S);
  const f = G.flags[tz * G.W + tx];
  const h = hAt(tx, tz);
  const shade = Math.max(0.5, Math.min(1.35, 1 + (hAt(tx, tz) - hAt(tx + 1, tz + 1)) * 0.35));
  let r, g, b;
  if (f & T_WATER && !(f & T_BRIDGE)) { const d = Math.min(1, -h / 6); r = 40 - 20 * d; g = 110 - 50 * d; b = 170 - 40 * d; }
  else if (f & T_BRIDGE) { r = 150; g = 105; b = 60; }
  else if (f & T_WALL) { r = 60; g = 50; b = 45; }
  else if (f & T_INDOOR) { r = 170; g = 140; b = 100; }
  else if (f & T_ROAD) { r = 175; g = 150; b = 105; }
  else if (f & T_CLIFF) { r = 110; g = 105; b = 100; }
  else if (h < 0.9) { r = 200; g = 190; b = 140; }
  else { const k = Math.min(1, h / 30); r = 70 + 90 * k; g = 125 + 40 * k; b = 60 + 90 * k; }
  if (f & T_BLOCK && !(f & (T_WATER | T_WALL | T_CLIFF))) { r *= 0.6; g *= 0.6; b *= 0.6; }
  const k = (py * W + px) * 3;
  rgb[k] = Math.min(255, r * shade); rgb[k + 1] = Math.min(255, g * shade); rgb[k + 2] = Math.min(255, b * shade);
}
function dot(x, z, col, r = 1) {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const px = Math.round(x * S) + dx, py = Math.round(z * S) + dz;
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const k = (py * W + px) * 3; rgb[k] = col[0]; rgb[k + 1] = col[1]; rgb[k + 2] = col[2];
  }
}
for (const id of ZONE_IDS) dot(ZONES[id].x, ZONES[id].z, [255, 255, 255], 3);
if (spawns) {
  for (const o of spawns.objects) dot(o.x, o.z, o.def.startsWith('tree') ? [20, 70, 20] : o.def.startsWith('rock') ? [120, 80, 60] : o.def.startsWith('fish') ? [0, 220, 255] : [255, 200, 0], 0);
  for (const m of spawns.monsters) dot(m.x, m.z, [230, 30, 30], 1);
  for (const n of spawns.npcs) dot(n.x, n.z, [255, 255, 0], 1);
}
fs.writeFileSync(out, encodePNG(W, H, rgb));
const count = {}; for (let i = 0; i < G.flags.length; i++) { if (G.flags[i] & T_BLOCK) count.block = (count.block || 0) + 1; if (G.flags[i] & T_WATER) count.water = (count.water || 0) + 1; }
console.log('wrote', out, count, spawns ? { objects: spawns.objects.length, monsters: spawns.monsters.length, npcs: spawns.npcs.length } : '');
