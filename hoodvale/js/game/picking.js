// Screen -> world picking without touching meshes: a ray against vertical cylinders (entity.pick)
// plus the terrain heightfield. Owner: game builder (baseline by integration).
// API: pick(ndcX, ndcY) -> { hits: [{ entity, dist }], tile: {x, z} | null, point: Vector3 | null }
//      hover (result at the current pointer, refreshed every frame while the pointer is inside)

import * as THREE from 'three';

export function createPicking(ctx) {
  const { camera, map, entities, input } = ctx;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const picking = {
    hover: { hits: [], tile: null, point: null },
    // Top entity under the pointer (for hover text / outlines), or null.
    get hoverEntity() { return picking.hover.hits[0]?.entity || null; },
    pick(nx, ny) {
      ndc.set(nx, ny);
      ray.setFromCamera(ndc, camera);
      const o = ray.ray.origin, d = ray.ray.direction;
      // Terrain: march along the ray, then refine.
      let point = null;
      const maxT = 260;
      let prev = 0;
      for (let t = 0.5; t < maxT; t += 0.5) {
        const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
        if (y <= map.heightAt(x, z)) {
          let a = prev, b = t;
          for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (o.y + d.y * m <= map.heightAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
          point = new THREE.Vector3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b);
          break;
        }
        prev = t;
      }
      const tile = point ? { x: Math.floor(point.x), z: Math.floor(point.z) } : null;
      const hits = [];
      const groundDist = point ? point.distanceTo(o) : maxT;
      for (const e of entities.all()) {
        if (!e.pick || e.kind === 'player' || !e.alive || e.hidden || e.dying) continue;
        const p = e.pos;
        // Ray vs vertical cylinder (centre p, radius r, from p.y to p.y + h), in xz first.
        const r = e.pick.r, h = e.pick.h;
        const ox = o.x - p.x, oz = o.z - p.z;
        const a = d.x * d.x + d.z * d.z;
        if (a < 1e-8) continue;
        const b = 2 * (ox * d.x + oz * d.z);
        const c = ox * ox + oz * oz - r * r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        let t0 = (-b - sq) / (2 * a), t1 = (-b + sq) / (2 * a);
        if (t1 < 0) continue;
        if (t0 < 0) t0 = 0;
        // Vertical overlap of the ray segment inside the infinite cylinder with [p.y, p.y + h].
        const y0 = o.y + d.y * t0, y1 = o.y + d.y * t1;
        const lo = p.y - 0.2, hi = p.y + h;
        if ((y0 < lo && y1 < lo) || (y0 > hi && y1 > hi)) continue;
        if (t0 > groundDist + 1.5) continue; // behind a hill
        hits.push({ entity: e, dist: t0 });
      }
      // Items and small things first when overlapping: sort by distance, then kind priority.
      const pri = { npc: 0, monster: 0, remote: 0, item: 1, object: 2 };
      hits.sort((x, y) => x.dist - y.dist || (pri[x.entity.kind] ?? 3) - (pri[y.entity.kind] ?? 3));
      return { hits, tile, point };
    },
    update() {
      if (!input.pointer.inside) { picking.hover = { hits: [], tile: null, point: null }; return; }
      if (input.pointer.moved || ctx.time.frame % 6 === 0) picking.hover = picking.pick(input.pointer.ndcX, input.pointer.ndcY);
    },
  };
  return picking;
}
