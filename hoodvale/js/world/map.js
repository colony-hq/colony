// Runtime map: walkability, dynamic blockers, A* pathfinding, line of sight, regions.
// Owner: integration. Pure logic (no three.js); built on world/mapgen.js.
//
// Movement model (RuneScape-like): 8-directional tile steps; a diagonal step is allowed only if
// both orthogonal neighbours are walkable (no corner cutting).

import {
  bakeWorld, bakeDungeon, regionAt, tileFlags, heightAt, zoneAt, DUNGEONS, OVERWORLD,
  T_BLOCK, T_WATER, T_INDOOR, T_ROAD, T_BRIDGE,
} from './mapgen.js';

export function createMap() {
  bakeWorld();
  for (const id in DUNGEONS) bakeDungeon(id);
  const dyn = new Map(); // "x,z" -> count of dynamic blockers (objects, closed gates)

  const key = (x, z) => x + ',' + z;

  const map = {
    heightAt,
    regionAt,
    zoneAt,
    tileFlags,
    T: { BLOCK: T_BLOCK, WATER: T_WATER, INDOOR: T_INDOOR, ROAD: T_ROAD, BRIDGE: T_BRIDGE },

    // Ground height at the centre of a tile (bridges/piers use their deck height).
    tileY(tx, tz) {
      return heightAt(tx + 0.5, tz + 0.5);
    },

    isWalkable(tx, tz) {
      if (tileFlags(tx, tz) & T_BLOCK) return false;
      return !dyn.has(key(tx, tz));
    },
    isIndoor(tx, tz) { return !!(tileFlags(tx, tz) & T_INDOOR); },
    isWater(tx, tz) { return !!(tileFlags(tx, tz) & T_WATER); },

    // Dynamic blockers (objects that occupy tiles). Reference-counted.
    block(tx, tz, w = 1, d = 1) {
      for (let z = tz; z < tz + d; z++) for (let x = tx; x < tx + w; x++) dyn.set(key(x, z), (dyn.get(key(x, z)) || 0) + 1);
    },
    unblock(tx, tz, w = 1, d = 1) {
      for (let z = tz; z < tz + d; z++) for (let x = tx; x < tx + w; x++) {
        const k = key(x, z), n = (dyn.get(k) || 0) - 1;
        if (n > 0) dyn.set(k, n); else dyn.delete(k);
      }
    },

    canStep(fx, fz, tx, tz) {
      if (!map.isWalkable(tx, tz)) return false;
      const dx = tx - fx, dz = tz - fz;
      if (dx !== 0 && dz !== 0) return map.isWalkable(fx + dx, fz) && map.isWalkable(fx, fz + dz);
      return true;
    },

    // A* from (sx, sz) to any tile satisfying goal. goal: {x, z} (exact tile) or
    // {x, z, w, d, adjacent: true} (stand next to a footprint, e.g. a tree or an NPC),
    // or {x, z, range} (within Chebyshev range with line of sight: ranged combat).
    // Returns an array of {x, z} steps (excluding the start) or null. maxNodes bounds the search.
    findPath(sx, sz, goal, { maxNodes = 6000 } = {}) {
      const R = regionAt(sx + 0.5, sz + 0.5);
      const gx = goal.x, gz = goal.z, gw = goal.w || 1, gd = goal.d || 1;
      const isGoal = (x, z) => {
        if (goal.range != null) {
          const dx = Math.max(gx - x, 0, x - (gx + gw - 1)), dz = Math.max(gz - z, 0, z - (gz + gd - 1));
          return Math.max(dx, dz) <= goal.range && Math.max(dx, dz) >= 1 && map.lineOfSight(x, z, gx, gz);
        }
        if (goal.adjacent) {
          const inX = x >= gx && x < gx + gw, inZ = z >= gz && z < gz + gd;
          if (inX && inZ) return false;
          const dx = x < gx ? gx - x : x >= gx + gw ? x - (gx + gw - 1) : 0;
          const dz = z < gz ? gz - z : z >= gz + gd ? z - (gz + gd - 1) : 0;
          if (goal.diagonal === false) return (dx === 1 && dz === 0) || (dx === 0 && dz === 1);
          return dx <= 1 && dz <= 1;
        }
        return x === gx && z === gz;
      };
      if (isGoal(sx, sz)) return [];
      const h = (x, z) => {
        const dx = Math.abs(x - gx), dz = Math.abs(z - gz);
        return Math.max(dx, dz) + 0.41 * Math.min(dx, dz);
      };
      const open = new MinHeap();
      const came = new Map();
      const gScore = new Map();
      const sk = key(sx, sz);
      gScore.set(sk, 0);
      open.push(h(sx, sz), sx, sz);
      let nodes = 0, best = null, bestH = Infinity;
      while (open.size) {
        const [, x, z] = open.pop();
        const k = key(x, z);
        if (isGoal(x, z)) return reconstruct(came, k);
        if (++nodes > maxNodes) break;
        const g0 = gScore.get(k);
        const hh = h(x, z);
        if (hh < bestH) { bestH = hh; best = k; }
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = x + dx, nz = z + dz;
          if (regionAt(nx + 0.5, nz + 0.5) !== R) continue;
          if (!map.canStep(x, z, nx, nz)) continue;
          const nk = key(nx, nz);
          const ng = g0 + (dx && dz ? 1.41 : 1);
          if (ng < (gScore.get(nk) ?? Infinity)) {
            gScore.set(nk, ng);
            came.set(nk, k);
            open.push(ng + h(nx, nz), nx, nz);
          }
        }
      }
      // Unreachable: walk as close as possible (RuneScape does this too).
      if (goal.closest !== false && best && best !== sk) return reconstruct(came, best);
      return null;
    },

    // Bresenham line of sight between tile centres (blocked by walls/cliffs, not by water).
    lineOfSight(x0, z0, x1, z1) {
      let dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
      const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
      let err = dx - dz, x = x0, z = z0;
      while (!(x === x1 && z === z1)) {
        const e2 = 2 * err;
        if (e2 > -dz) { err -= dz; x += sx; }
        if (e2 < dx) { err += dx; z += sz; }
        if (x === x1 && z === z1) break;
        const f = tileFlags(x, z);
        if (f & T_BLOCK && !(f & T_WATER)) return false;
      }
      return true;
    },

    // Nearest walkable tile to (tx, tz) within r (spiral). null if none.
    nearestWalkable(tx, tz, r = 6) {
      for (let k = 0; k <= r; k++) for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== k) continue;
        if (map.isWalkable(tx + dx, tz + dz)) return { x: tx + dx, z: tz + dz };
      }
      return null;
    },

    // Chebyshev distance between a tile and a footprint (0 = inside).
    distToFootprint(x, z, fx, fz, fw = 1, fd = 1) {
      const dx = Math.max(fx - x, 0, x - (fx + fw - 1)), dz = Math.max(fz - z, 0, z - (fz + fd - 1));
      return Math.max(dx, dz);
    },

    regions: { overworld: OVERWORLD, ...DUNGEONS },
  };
  return map;
}

function reconstruct(came, k) {
  const path = [];
  while (came.has(k)) {
    const [x, z] = k.split(',').map(Number);
    path.push({ x, z });
    k = came.get(k);
  }
  return path.reverse();
}

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(p, x, z) {
    const a = this.a;
    a.push([p, x, z]);
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (a[j][0] <= a[i][0]) break;
      [a[i], a[j]] = [a[j], a[i]];
      i = j;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
