// Static collision world: terrain heightfield + primitive colliders registered by structures.
// Owner: integration (core). See DESIGN.md §Collision.
//
// Box:      { x, y, z, w, h, d, yaw }   centre (x, z), bottom y, size w (local x) by d (local z),
//           height h, rotated by yaw around +y (same convention as Object3D.rotation.y).
// Cylinder: { x, y, z, r, h }
// Flags:    solid (blocks sideways movement, default true), walkable (top is standable, default true),
//           surface ('wood' | 'stone' | 'sand' | 'grass' | 'rock' | 'metal'), tag (free string)

import { heightAt, slopeAt, distToPath, SEA_LEVEL } from './heightfield.js';

const CELL = 16;

export function createCollision() {
  const colliders = [];
  const grid = new Map(); // "cx,cz" -> collider[]
  let nextId = 1;

  function cellKey(cx, cz) { return cx + ',' + cz; }

  function bounds(c) {
    if (c.type === 'cyl') return { minX: c.x - c.r, maxX: c.x + c.r, minZ: c.z - c.r, maxZ: c.z + c.r };
    const ex = Math.abs(Math.cos(c.yaw)) * c.w / 2 + Math.abs(Math.sin(c.yaw)) * c.d / 2;
    const ez = Math.abs(Math.sin(c.yaw)) * c.w / 2 + Math.abs(Math.cos(c.yaw)) * c.d / 2;
    return { minX: c.x - ex, maxX: c.x + ex, minZ: c.z - ez, maxZ: c.z + ez };
  }

  function insert(c) {
    const b = bounds(c);
    c._cells = [];
    for (let cx = Math.floor(b.minX / CELL); cx <= Math.floor(b.maxX / CELL); cx++) {
      for (let cz = Math.floor(b.minZ / CELL); cz <= Math.floor(b.maxZ / CELL); cz++) {
        const k = cellKey(cx, cz);
        let list = grid.get(k);
        if (!list) grid.set(k, (list = []));
        list.push(c);
        c._cells.push(k);
      }
    }
    colliders.push(c);
    return c;
  }

  function nearby(x, z, pad = 2) {
    const out = new Set();
    for (let cx = Math.floor((x - pad) / CELL); cx <= Math.floor((x + pad) / CELL); cx++) {
      for (let cz = Math.floor((z - pad) / CELL); cz <= Math.floor((z + pad) / CELL); cz++) {
        const list = grid.get(cellKey(cx, cz));
        if (list) for (const c of list) if (c.enabled !== false) out.add(c);
      }
    }
    return out;
  }

  // World -> collider local (box). Returns [lx, lz].
  function toLocal(c, x, z) {
    const dx = x - c.x, dz = z - c.z;
    const cs = c._cos, sn = c._sin;
    return [cs * dx - sn * dz, sn * dx + cs * dz];
  }
  function toWorldDir(c, lx, lz) {
    const cs = c._cos, sn = c._sin;
    return [cs * lx + sn * lz, -sn * lx + cs * lz];
  }

  // Is (x, z) inside the footprint, shrunk by margin (negative margin grows it)?
  function contains(c, x, z, margin = 0) {
    if (c.type === 'cyl') return Math.hypot(x - c.x, z - c.z) <= c.r - margin;
    const [lx, lz] = toLocal(c, x, z);
    return Math.abs(lx) <= c.w / 2 - margin && Math.abs(lz) <= c.d / 2 - margin;
  }

  function terrainSurface(x, z) {
    const h = heightAt(x, z);
    if (h < SEA_LEVEL + 0.05) return 'sand';
    if (distToPath(x, z) < 2.2) return 'path';
    if (slopeAt(x, z) > 0.75) return 'rock';
    if (h < 1.9) return 'sand';
    return h > 45 ? 'rock' : 'grass';
  }

  const api = {
    colliders,

    addBox(o) {
      const c = {
        id: nextId++, type: 'box', x: o.x, y: o.y ?? 0, z: o.z, w: o.w, h: o.h, d: o.d, yaw: o.yaw || 0,
        solid: o.solid !== false, walkable: o.walkable !== false, surface: o.surface || 'wood', tag: o.tag || '', enabled: true,
      };
      c._cos = Math.cos(c.yaw); c._sin = Math.sin(c.yaw);
      return insert(c);
    },

    addCylinder(o) {
      const c = {
        id: nextId++, type: 'cyl', x: o.x, y: o.y ?? 0, z: o.z, r: o.r, h: o.h,
        solid: o.solid !== false, walkable: o.walkable !== false, surface: o.surface || 'stone', tag: o.tag || '', enabled: true,
      };
      return insert(c);
    },

    remove(c) {
      const i = colliders.indexOf(c);
      if (i >= 0) colliders.splice(i, 1);
      for (const k of c._cells || []) {
        const list = grid.get(k);
        if (list) { const j = list.indexOf(c); if (j >= 0) list.splice(j, 1); }
      }
    },

    // Enable/disable (e.g. the candi door opening).
    setEnabled(c, on) { c.enabled = !!on; },

    // Highest standable surface under (x, z) whose top is <= y + stepUp.
    // Returns { y, surface, collider|null, water: depth of water above ground (0 if none) }.
    groundAt(x, z, y = Infinity, stepUp = 0.55, footRadius = 0.25) {
      let best = heightAt(x, z);
      let surface = null;
      let hit = null;
      for (const c of nearby(x, z, 1)) {
        if (!c.walkable) continue;
        const top = c.y + c.h;
        if (top > y + stepUp || top <= best) continue;
        if (!contains(c, x, z, -footRadius)) continue;
        best = top; hit = c; surface = c.surface;
      }
      const ground = best;
      return {
        y: ground,
        surface: hit ? surface : terrainSurface(x, z),
        collider: hit,
        water: Math.max(0, SEA_LEVEL - ground),
      };
    },

    // Lowest collider underside above y at (x, z) (for head bumps). Infinity when open sky.
    ceilingAt(x, z, y) {
      let best = Infinity;
      for (const c of nearby(x, z, 1)) {
        if (!c.solid || c.y <= y) continue;
        if (!contains(c, x, z, 0)) continue;
        if (c.y < best) best = c.y;
      }
      return best;
    },

    // Push a vertical capsule (feet at pos.y, given radius/height) out of solid colliders.
    // Mutates pos {x, y, z}. Returns { hit, nx, nz } with the last push direction.
    resolve(pos, radius = 0.4, height = 1.7, stepUp = 0.4) {
      let hit = false, nx = 0, nz = 0;
      for (let iter = 0; iter < 3; iter++) {
        let moved = false;
        for (const c of nearby(pos.x, pos.z, radius + 1)) {
          if (!c.solid) continue;
          const top = c.y + c.h;
          if (pos.y + stepUp >= top || pos.y + height <= c.y) continue; // above it or under it
          if (c.type === 'cyl') {
            const dx = pos.x - c.x, dz = pos.z - c.z;
            const d = Math.hypot(dx, dz);
            const min = c.r + radius;
            if (d < min) {
              const ux = d > 1e-5 ? dx / d : 1, uz = d > 1e-5 ? dz / d : 0;
              pos.x = c.x + ux * min; pos.z = c.z + uz * min;
              hit = moved = true; nx = ux; nz = uz;
            }
          } else {
            const [lx, lz] = toLocal(c, pos.x, pos.z);
            const hw = c.w / 2, hd = c.d / 2;
            const cx = Math.max(-hw, Math.min(hw, lx));
            const cz = Math.max(-hd, Math.min(hd, lz));
            let ox = lx - cx, oz = lz - cz;
            let d = Math.hypot(ox, oz);
            let px, pz;
            if (d > 1e-5) {
              if (d >= radius) continue;
              px = (ox / d) * (radius - d); pz = (oz / d) * (radius - d);
              ox /= d; oz /= d;
            } else {
              // Centre inside the box: push out through the nearest face.
              const exX = hw - Math.abs(lx), exZ = hd - Math.abs(lz);
              if (exX < exZ) { ox = Math.sign(lx) || 1; oz = 0; px = ox * (exX + radius); pz = 0; }
              else { ox = 0; oz = Math.sign(lz) || 1; px = 0; pz = oz * (exZ + radius); }
            }
            const [wx, wz] = toWorldDir(c, px, pz);
            pos.x += wx; pos.z += wz;
            const [dnx, dnz] = toWorldDir(c, ox, oz);
            nx = dnx; nz = dnz;
            hit = moved = true;
          }
        }
        if (!moved) break;
      }
      return { hit, nx, nz };
    },

    // Distance along a ray until it hits terrain or a solid collider (camera collision).
    raycast(ox, oy, oz, dx, dy, dz, maxDist) {
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len; dy /= len; dz /= len;
      let best = maxDist;
      // Terrain: march then refine.
      const step = 0.5;
      let prevT = 0;
      for (let t = step; t <= maxDist; t += step) {
        const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
        if (y < heightAt(x, z) + 0.2) {
          let a = prevT, b = t;
          for (let k = 0; k < 6; k++) {
            const m = (a + b) / 2;
            if (oy + dy * m < heightAt(ox + dx * m, oz + dz * m) + 0.2) b = m; else a = m;
          }
          best = a;
          break;
        }
        prevT = t;
      }
      // Colliders: slab test in local space (cylinders treated as boxes).
      const seen = new Set();
      const steps = Math.ceil(best / CELL) + 1;
      for (let i = 0; i <= steps; i++) {
        const t = Math.min(best, i * CELL);
        for (const c of nearby(ox + dx * t, oz + dz * t, 4)) {
          if (seen.has(c) || !c.solid) continue;
          seen.add(c);
          const hitT = rayBox(c, ox, oy, oz, dx, dy, dz);
          if (hitT !== null && hitT < best) best = hitT;
        }
      }
      return best;
    },

    // Debug helper: count.
    get count() { return colliders.length; },
  };

  function rayBox(c, ox, oy, oz, dx, dy, dz) {
    let lox, loz, ldx, ldz, hw, hd;
    if (c.type === 'cyl') {
      lox = ox - c.x; loz = oz - c.z; ldx = dx; ldz = dz; hw = hd = c.r * 0.85;
    } else {
      [lox, loz] = toLocal(c, ox, oz);
      const cs = c._cos, sn = c._sin;
      ldx = cs * dx - sn * dz; ldz = sn * dx + cs * dz;
      hw = c.w / 2; hd = c.d / 2;
    }
    let tmin = -Infinity, tmax = Infinity;
    const slab = (o, d, lo, hi) => {
      if (Math.abs(d) < 1e-8) return o >= lo && o <= hi;
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      return tmin <= tmax;
    };
    if (!slab(lox, ldx, -hw, hw)) return null;
    if (!slab(oy, dy, c.y, c.y + c.h)) return null;
    if (!slab(loz, ldz, -hd, hd)) return null;
    if (tmax < 0) return null;
    return tmin >= 0 ? tmin : null; // origin inside: ignore
  }

  return api;
}
