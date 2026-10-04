// Deterministic Kilau placement (owner: gameplay). Pure module (no three.js) so it can be checked
// in node. Breadcrumbs every ~25–35 m along PATHS + vista rewards. Ids are stable strings.
//
// Each spot: { id, x, z, yHint, lift } — runtime y = collision.groundAt(x, z, yHint).y + lift.

import { PATHS, LANDMARKS, heightAt } from '../world/heightfield.js';
import { mulberry32 } from '../core/noise.js';

const K = LANDMARKS.kampung;

function housePorch(h, out = 1.2) {
  // Front (door + veranda) direction = (-sin yaw, -cos yaw); veranda just inside the front edge.
  const fx = -Math.sin(h.yaw), fz = -Math.cos(h.yaw);
  const d = h.d / 2 - out;
  return { x: h.x + fx * d, z: h.z + fz * d };
}

const VISTAS = [
  // Kampung: decks of the rumah panggung + warung roof + pier tip.
  ...K.houses.map((h) => ({ id: 'v-' + h.id, ...housePorch(h), yHint: K.floor + 2.6, lift: 1.0 })),
  { id: 'v-pier-tip', x: 0.4, z: 246.8, yHint: 2.5, lift: 1.0 },
  { id: 'v-warung', x: K.warung.x - 3.2, z: K.warung.z + 2.6, yHint: 999, lift: 1.0 },
  // Gunung: ridge breadcrumbs up to the peak (glide launch).
  { id: 'v-gunung-1', x: -22, z: -34, yHint: 999, lift: 1.0 },
  { id: 'v-gunung-2', x: -31, z: -48, yHint: 999, lift: 1.0 },
  { id: 'v-gunung-peak', x: -40, z: -62, yHint: 999, lift: 1.2 },
  // Mesa + river + waterfall lip.
  { id: 'v-mesa-1', x: -88, z: -30, yHint: 999, lift: 1.0 },
  { id: 'v-mesa-2', x: -110, z: -50, yHint: 999, lift: 1.0 },
  { id: 'v-mesa-3', x: -124, z: -24, yHint: 999, lift: 1.0 },
  { id: 'v-falls-lip', x: -131, z: -27.5, yHint: 999, lift: 1.0 },
  // Cave behind the falls (floor 1.4).
  { id: 'v-cave-1', x: -149, z: -34.5, yHint: 2.6, lift: 1.0 },
  { id: 'v-cave-2', x: -144, z: -30.5, yHint: 2.6, lift: 1.0 },
  // Cove beach + tirta campfire approach.
  { id: 'v-cove-beach', x: -160, z: 4, yHint: 999, lift: 1.0 },
  // Kapal karam: bow, midship, stern cabin roof.
  { id: 'v-wreck-bow', x: -205.5, z: 145.8, yHint: 4.5, lift: 1.0 },
  { id: 'v-wreck-mid', x: -212.5, z: 149.4, yHint: 3.5, lift: 1.0 },
  { id: 'v-wreck-cabin', x: -224.5, z: 157.2, yHint: 999, lift: 1.0 },
  { id: 'v-wreck-beach', x: -186, z: 132, yHint: 999, lift: 1.0 },
  // Candi: courtyard gate + terrace corners (tops 36 / 38 / 40).
  { id: 'v-candi-gate', x: 30, z: -112, yHint: 999, lift: 1.0 },
  { id: 'v-candi-t1', x: 42.6, z: -125.4, yHint: 36.5, lift: 1.0 },
  { id: 'v-candi-t2', x: 20.2, z: -147.8, yHint: 38.5, lift: 1.0 },
  { id: 'v-candi-t3', x: 36.4, z: -144.4, yHint: 40.5, lift: 1.0 },
  { id: 'v-candi-beringin', x: 4, z: -128, yHint: 999, lift: 1.0 },
  // Mercusuar platform.
  { id: 'v-lh-east', x: 209, z: 43, yHint: 999, lift: 1.0 },
  { id: 'v-lh-north', x: 199, z: 30.5, yHint: 999, lift: 1.0 },
  // Eastern ridge, western forest (fog pockets: risky rewards), north coast.
  { id: 'v-ridge', x: 110, z: -40, yHint: 999, lift: 1.1 },
  { id: 'v-ridge-2', x: 92, z: -18, yHint: 999, lift: 1.0 },
  { id: 'v-forest-1', x: -90, z: 60, yHint: 999, lift: 1.0 },
  { id: 'v-forest-2', x: -66, z: 86, yHint: 999, lift: 1.0 },
  { id: 'v-forest-3', x: -112, z: 34, yHint: 999, lift: 1.0 },
  { id: 'v-east-beach', x: 70, z: 178, yHint: 999, lift: 1.0 },
];

let cache = null;

export function kilauSpots() {
  if (cache) return cache;
  const rand = mulberry32(60606);
  const spots = [];
  const near = (x, z, r) => spots.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < r * r);
  // Breadcrumbs along the footpaths.
  PATHS.forEach((path, pi) => {
    let carry = 14 + rand() * 8; // first crumb a little away from the start
    let n = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      let s = carry;
      while (s < L) {
        const t = s / L;
        const nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
        const side = (rand() - 0.5) * 2.4;
        const x = a.x + (b.x - a.x) * t + nx * side;
        const z = a.z + (b.z - a.z) * t + nz * side;
        const inPlaza = Math.hypot(x - K.x, z - K.z) < 26;
        if (!inPlaza && heightAt(x, z) > 0.4 && !near(x, z, 14)) {
          spots.push({ id: `p${pi}-${n}`, x, z, yHint: 999, lift: 1.0, kind: 'path' });
        }
        n++;
        s += 25 + rand() * 10;
      }
      carry = s - L;
    }
  });
  for (const v of VISTAS) if (!near(v.x, v.z, 4)) spots.push({ ...v, kind: 'vista' });
  cache = spots;
  return spots;
}
