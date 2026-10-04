// Deterministic placement of world objects, monsters and NPCs. Pure module (node-friendly).
// buildSpawns() returns { objects, monsters, npcs, portals } with tile coordinates (x, z = tile
// index; actors stand at tile centre +0.5). Every module uses this one list, so the art, the
// minimap, pathfinding blockers and gameplay always agree.

import { mulberry32 } from '../core/noise.js';
import {
  bakeWorld, bakeDungeon, tileFlags, heightAt, DUNGEONS, distToRoad,
  T_BLOCK, T_WATER, T_ROAD, T_INDOOR, T_BRIDGE,
} from '../world/mapgen.js';
import { OBJECTS } from './objects.js';
import { NPCS } from './npcs.js';
import { ZONES } from './zones.js';

let CACHE = null;

export function buildSpawns() {
  if (CACHE) return CACHE;
  bakeWorld();
  for (const id in DUNGEONS) bakeDungeon(id);
  const rand = mulberry32(424242);
  const occupied = new Set(); // "x,z" tiles taken by objects
  const objects = [];
  const monsters = [];
  const portals = [];
  let oid = 0;

  const key = (x, z) => x + ',' + z;
  const free = (x, z, w = 1, d = 1) => {
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) {
      const f = tileFlags(x + dx, z + dz);
      if (f & (T_BLOCK | T_WATER | T_INDOOR | T_BRIDGE) || occupied.has(key(x + dx, z + dz))) return false;
    }
    return true;
  };
  const occupy = (x, z, w = 1, d = 1) => { for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) occupied.add(key(x + dx, z + dz)); };

  // Place an object definition at a tile (hand-placed: skips checks unless asked).
  function place(def, x, z, extra = {}) {
    const d = OBJECTS[def];
    if (!d) throw new Error('spawn: unknown object ' + def);
    const [w, dd] = d.size;
    const o = { uid: 'o' + (oid++), def, x, z, w, d: dd, yaw: extra.yaw ?? 0, ...extra };
    objects.push(o);
    if (!d.walkable) occupy(x, z, w, dd);
    return o;
  }

  // Scatter `count` objects from weighted defs inside a circle, on free land away from roads.
  function scatter(defs, cx, cz, r, count, { roadGap = 2.5, minGap = 2, maxTries = 40, area = null } = {}) {
    const pick = () => {
      let t = rand() * defs.reduce((s, d) => s + d[1], 0);
      for (const [id, w] of defs) { t -= w; if (t <= 0) return id; }
      return defs[0][0];
    };
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const def = pick();
      const [w, d] = OBJECTS[def].size;
      for (let tries = 0; tries < maxTries; tries++) {
        let x, z;
        if (area) { x = Math.floor(area.x0 + rand() * (area.x1 - area.x0)); z = Math.floor(area.z0 + rand() * (area.z1 - area.z0)); }
        else { const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * r; x = Math.floor(cx + Math.cos(a) * rr); z = Math.floor(cz + Math.sin(a) * rr); }
        if (!free(x - minGap + 1, z - minGap + 1, w + 2 * (minGap - 1), d + 2 * (minGap - 1))) continue;
        if (distToRoad(x + w / 2, z + d / 2) < roadGap) continue;
        place(def, x, z, { yaw: Math.floor(rand() * 4) * (Math.PI / 2) });
        placed++;
        break;
      }
    }
    return placed;
  }

  // Fishing spots: water tiles next to walkable land (or a pier) inside an area.
  function fishing(def, cx, cz, r, count) {
    const cands = [];
    for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (Math.hypot(x - cx, z - cz) > r) continue;
      const f = tileFlags(x, z);
      if (!(f & T_WATER) || f & T_BRIDGE) continue;
      const land = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
        const g = tileFlags(x + dx, z + dz);
        return !(g & T_BLOCK) || g & T_BRIDGE;
      });
      if (land && !occupied.has(key(x, z))) cands.push([x, z]);
    }
    for (let i = 0; i < count && cands.length; i++) {
      const j = Math.floor(rand() * cands.length);
      const [x, z] = cands.splice(j, 1)[0];
      place(def, x, z);
      // keep spots apart
      for (let k = cands.length - 1; k >= 0; k--) if (Math.hypot(cands[k][0] - x, cands[k][1] - z) < 3) cands.splice(k, 1);
    }
  }

  // Monsters: spawn points (they wander around these).
  function spawnMonsters(def, cx, cz, r, count, { area = null } = {}) {
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 60; tries++) {
        let x, z;
        if (area) { x = Math.floor(area.x0 + rand() * (area.x1 - area.x0 + 1)); z = Math.floor(area.z0 + rand() * (area.z1 - area.z0 + 1)); }
        else { const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * r; x = Math.floor(cx + Math.cos(a) * rr); z = Math.floor(cz + Math.sin(a) * rr); }
        const f = tileFlags(x, z);
        if (f & (T_BLOCK | T_WATER) || occupied.has(key(x, z))) continue;
        monsters.push({ uid: 'm' + monsters.length, def, x, z });
        break;
      }
    }
  }

  // Nearest walkable tile to (x, z) (for hand-placed things on uneven ground).
  function nearestFree(x, z, w = 1, d = 1) {
    for (let r = 0; r < 12; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (free(x + dx, z + dz, w, d)) return [x + dx, z + dz];
    }
    return [x, z];
  }
  function portal(def, x, z, to, label, extra = {}) {
    const [px, pz] = extra.exact ? [x, z] : nearestFree(x, z, OBJECTS[def].size[0], OBJECTS[def].size[1]);
    const o = place(def, px, pz, { to, label, ...extra });
    portals.push(o);
    return o;
  }

  // ---------------------------------------------------------------- fixed utilities
  // Brightwater
  place('bank_booth', 201, 238);
  place('furnace', 197, 255);
  place('anvil', 201, 257);
  place('range', 167, 260);
  place('well', 185, 246);
  place('stall_bakery', 190, 255);
  place('signpost', 183, 250, { text: ['N: Hoodwood', 'E: Millbrook, Gildmoor', 'W: Copperhollow', 'S: Saltreach Docks'] });
  // Tutorial rock outcrop east of the smithy.
  for (const [def, x, z] of [['rock_copper', 208, 251], ['rock_copper', 210, 253], ['rock_tin', 209, 255], ['rock_tin', 211, 251]]) {
    const [px, pz] = nearestFree(x, z);
    place(def, px, pz);
  }
  // Farms
  place('hopper', 243, 229);
  place('flour_bin', 243, 231);
  place('tanning_rack', 238, 250);
  place('spinning_wheel', 244, 247);
  place('well', 238, 239);
  for (let i = 0; i < 4; i++) place('chicken_nest', 222 + i * 2, 227 + (i % 2) * 3);
  for (let z = 214; z <= 222; z += 1) for (let x = 222; x <= 232; x += 1) if (free(x, z) && (x + z) % 2 === 0) place('wheat', x, z);
  for (let z = 220; z <= 226; z += 2) for (let x = 252; x <= 260; x += 2) if (free(x, z)) place('flax_plant', x, z);
  // Hoodwood camp
  place('fire', 133, 157, { permanent: true });
  for (const z of [165, 167, 169]) place('archery_target', 145, z, { yaw: Math.PI / 2 });
  place('signpost', 146, 171, { text: ['N: Ashen Highlands', 'W: Mistfen', 'S: Brightwater'] });
  // Copperhollow
  place('furnace', 99, 258);
  place('anvil', 101, 256);
  // Gildmoor
  place('bank_booth', 256, 167);
  place('bank_booth', 256, 169);
  place('exchange_desk', 239, 168);
  place('exchange_desk', 239, 171);
  place('furnace', 231, 152);
  place('anvil', 234, 153);
  place('range', 238, 181);
  place('stall_silk', 245, 153);
  place('stall_fur', 245, 156);
  place('stall_gem', 253, 156);
  place('signpost', 252, 191, { text: ['N: Gildmoor, Orbio Spire', 'S: Millbrook, Brightwater'] });
  // Orbio Spire
  place('crystal_altar', 260, 57);
  // Docks
  place('signpost', 196, 289, { text: ['N: Brightwater'] });

  // ---------------------------------------------------------------- portals
  const warrens = DUNGEONS.warrens, vault = DUNGEONS.vault, lair = DUNGEONS.lair;
  const wIn = { x: warrens.x0 + 32, z: warrens.z0 + 58 };
  const wEnt = portal('cave_entrance', 66, 276, wIn, 'Warrens');
  portal('cave_exit', wIn.x, wIn.z + 2, { x: wEnt.x, z: wEnt.z + 1 }, 'Copperhollow', { exact: true });
  const vIn = { x: vault.x0 + 23, z: vault.z0 + 41 };
  const vEnt = place('vault_stairs', 269, 136, { to: vIn, label: 'Vault' });
  portals.push(vEnt);
  portals.push(place('vault_stairs_up', vIn.x, vIn.z + 2, { to: { x: 268, z: 137 }, label: "Sheriff's Keep" }));
  const lIn = { x: lair.x0 + 28, z: lair.z0 + 50 };
  const lEnt = portal('lair_entrance', 69, 38, lIn, 'Ashen Lair', { requires: 'ash_key' });
  portal('cave_exit', lIn.x, lIn.z + 2, { x: lEnt.x, z: lEnt.z + 2 }, 'Ashen Peak', { exact: true });

  // ---------------------------------------------------------------- resources
  const Z = ZONES;
  // Brightwater outskirts + tutorial trees north-west of the hall.
  scatter([['tree', 1]], 176, 232, 7, 6, { roadGap: 2 });
  scatter([['tree', 6], ['tree_oak', 1]], Z.brightwater.x, Z.brightwater.z, 30, 22, { roadGap: 3 });
  // Hoodwood: dense forest.
  scatter([['tree', 5], ['tree_oak', 3]], Z.hoodwood.x, Z.hoodwood.z, 44, 150, { roadGap: 2.5, minGap: 2 });
  scatter([['tree_willow', 1]], 152, 150, 16, 8, { roadGap: 2 });
  // Farms edge trees, docks palms are decor (art).
  scatter([['tree', 3], ['tree_oak', 1]], Z.farms.x, Z.farms.z - 6, 30, 14, { roadGap: 3 });
  // Copperhollow: ore field.
  scatter([['rock_copper', 3], ['rock_tin', 3], ['rock_iron', 4], ['rock_coal', 2]], Z.copperhollow.x, Z.copperhollow.z, 24, 34, { roadGap: 2 });
  scatter([['tree', 2], ['tree_oak', 1]], Z.copperhollow.x + 18, Z.copperhollow.z - 18, 14, 10);
  // Mistfen: willows and a few oaks.
  scatter([['tree_willow', 3], ['tree_oak', 1]], Z.mistfen.x, Z.mistfen.z, 36, 30, { roadGap: 2 });
  // Gildmoor surroundings: maples outside the walls, east.
  scatter([['tree_maple', 2], ['tree_oak', 1]], 292, 190, 18, 12);
  // North-east woods: maples, oaks, a few yews.
  scatter([['tree_maple', 3], ['tree_oak', 2], ['tree_yew', 1]], 200, 85, 30, 40);
  // Orbio plateau: orbium crystals.
  scatter([['crystal_orbium', 1]], Z.oracle.x, Z.oracle.z, 18, 12, { roadGap: 2, minGap: 2 });
  // Highlands: rare trees and ore.
  scatter([['tree_maple', 3], ['tree_yew', 2]], 120, 90, 22, 16);
  scatter([['tree_yew', 2], ['tree_elder', 1]], 84, 56, 26, 9);
  scatter([['rock_coal', 3], ['rock_cobalt', 2], ['rock_iron', 2], ['rock_starmetal', 1]], 96, 70, 34, 26, { roadGap: 2 });
  scatter([['rock_starmetal', 2], ['rock_cobalt', 1]], 78, 50, 18, 6, { roadGap: 2 });
  // Wilds: sparse trees everywhere else.
  scatter([['tree', 4], ['tree_oak', 1]], 160, 160, 150, 120, { roadGap: 3, minGap: 3 });

  // Fishing.
  fishing('fish_net_bait', 160, 246, 8, 3); // Brightwater lake, east shore
  fishing('fish_net_bait', 215, 294, 10, 3); // beach east of the docks
  fishing('fish_cage_harpoon', 196, 300, 9, 4); // around the piers
  fishing('fish_lure', 148, 150, 16, 3); // Hoodwood river
  fishing('fish_lure', 130, 108, 10, 2); // upper river by the ford
  fishing('fish_net_bait', 44, 176, 11, 2); // Fen Mere (pike via bait)

  // ---------------------------------------------------------------- monsters (overworld)
  spawnMonsters('rat', 0, 0, 0, 4, { area: { x0: 164, x1: 175, z0: 263, z1: 267 } });
  spawnMonsters('chicken', 0, 0, 0, 5, { area: { x0: 222, x1: 229, z0: 226, z1: 231 } });
  spawnMonsters('cow', 0, 0, 0, 6, { area: { x0: 249, x1: 260, z0: 237, z1: 246 } });
  spawnMonsters('goblin', 128, 274, 10, 7);
  spawnMonsters('goblin', 104, 280, 8, 4);
  spawnMonsters('boar', 205, 205, 18, 6);
  spawnMonsters('boar', 120, 200, 16, 4);
  spawnMonsters('wolf', 160, 125, 18, 7);
  spawnMonsters('bandit', 186, 190, 10, 6);
  spawnMonsters('giant_spider', 64, 146, 12, 6);
  spawnMonsters('bog_lurker', 46, 182, 12, 7);
  spawnMonsters('bear', 205, 90, 20, 5);
  spawnMonsters('sheriff_guard', 250, 160, 22, 6);
  spawnMonsters('shard_wisp', 258, 66, 14, 6);
  spawnMonsters('highland_troll', 100, 68, 22, 6);
  spawnMonsters('stone_golem', 82, 52, 16, 4);

  // ---------------------------------------------------------------- dungeons
  const inDungeon = (D, count, def, zMin, zMax) => {
    const G = bakeDungeon(D.id);
    for (let i = 0; i < count; i++) {
      for (let t = 0; t < 200; t++) {
        const x = Math.floor(rand() * G.W), z = Math.floor(zMin + rand() * (zMax - zMin));
        if (G.solid[z * G.W + x]) continue;
        monsters.push({ uid: 'm' + monsters.length, def, x: D.x0 + x, z: D.z0 + z });
        break;
      }
    }
  };
  inDungeon(warrens, 9, 'goblin', 30, 56);
  inDungeon(warrens, 6, 'goblin_brute', 16, 34);
  monsters.push({ uid: 'm' + monsters.length, def: 'goblin_warchief', x: warrens.x0 + 32, z: warrens.z0 + 9, boss: true });
  objects.push({ uid: 'o' + (oid++), def: 'signpost', x: warrens.x0 + 34, z: warrens.z0 + 56, w: 1, d: 1, yaw: 0, text: ['Beware: goblins. Lots.'] });
  inDungeon(vault, 4, 'vault_knight', 12, 21);
  inDungeon(vault, 3, 'skeleton', 26, 29);
  inDungeon(vault, 3, 'sheriff_guard', 30, 44);
  monsters.push({ uid: 'm' + monsters.length, def: 'sheriff_vane', x: vault.x0 + 24, z: vault.z0 + 7, boss: true });
  objects.push({ uid: 'o' + (oid++), def: 'chest_vault', x: vault.x0 + 24, z: vault.z0 + 4, w: 1, d: 1, yaw: 0 });
  inDungeon(lair, 7, 'ash_imp', 28, 50);
  inDungeon(lair, 5, 'ashen_drake', 14, 30);
  monsters.push({ uid: 'm' + monsters.length, def: 'ashen_wyrm', x: lair.x0 + 26, z: lair.z0 + 8, boss: true });
  objects.push({ uid: 'o' + (oid++), def: 'chest_lair', x: lair.x0 + 31, z: lair.z0 + 5, w: 1, d: 1, yaw: 0 });

  // ---------------------------------------------------------------- npcs
  const npcs = Object.values(NPCS).map((n) => ({ uid: 'n:' + n.id, def: n.id, x: n.x, z: n.z }));

  CACHE = { objects, monsters, npcs, portals };
  return CACHE;
}

// World position (tile centre) helpers.
export const tileCenter = (t) => ({ x: t.x + (t.w || 1) / 2, z: t.z + (t.d || 1) / 2, y: heightAt(t.x + (t.w || 1) / 2, t.z + (t.d || 1) / 2) });
