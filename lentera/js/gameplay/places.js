// World anchors used by gameplay (owner: gameplay). Prefers structures.anchors / structures.*,
// falls back to LANDMARKS so the loop works even when structures is a stub.

import * as THREE from 'three';
import { LANDMARKS, CHECKPOINTS, heightAt } from '../world/heightfield.js';

export const FLAME_IDS = ['tirta', 'bumi', 'samudra'];
export const FLAME_INFO = {
  tirta: { name: 'Api Tirta', color: '#bff6ff', light: 0x9fe8ff },
  bumi: { name: 'Api Bumi', color: '#ffb04a', light: 0xffa040 },
  samudra: { name: 'Api Samudra', color: '#8fa2ff', light: 0x8f9cff },
};
export const PELITA_ORDER = ['utara', 'timur', 'selatan', 'barat'];

function ground(ctx, x, z, yHint = 999) {
  const g = ctx.collision?.groundAt?.(x, z, yHint);
  return g ? g.y : heightAt(x, z);
}

function anchor(ctx, key) {
  const a = ctx.structures?.anchors?.[key];
  return a && Number.isFinite(a.x) ? new THREE.Vector3(a.x, a.y, a.z) : null;
}

// Where the Api Pusaka orb floats (orb centre).
export function flameAnchor(ctx, id) {
  const a = anchor(ctx, 'flame:' + id);
  if (a) return a;
  if (id === 'tirta') {
    const f = LANDMARKS.airTerjun.flame;
    return new THREE.Vector3(f.x, ground(ctx, f.x, f.z, LANDMARKS.airTerjun.cave.floorY + 1.5) + 1.35, f.z);
  }
  if (id === 'bumi') {
    const c = LANDMARKS.candi.chamber;
    return new THREE.Vector3(c.x, Math.max(c.floorY, ground(ctx, c.x, c.z, c.floorY + 1)) + 1.35, c.z);
  }
  const f = LANDMARKS.kapalKaram.flame;
  return new THREE.Vector3(f.x, f.y + 0.55, f.z);
}

// Tungku flame point at the mercusuar.
export function socketPoint(ctx, id) {
  const s = ctx.structures?.sockets?.[id];
  if (s?.position) return new THREE.Vector3().copy(s.position);
  const L = LANDMARKS.mercusuar.sockets.find((q) => q.id === id);
  return new THREE.Vector3(L.x, heightAt(L.x, L.z) + 1.0, L.z);
}

export function pelitaPoint(ctx, id) {
  const p = ctx.structures?.pelita?.[id];
  if (p?.position) return new THREE.Vector3().copy(p.position);
  const L = LANDMARKS.candi.pelita.find((q) => q.id === id);
  return new THREE.Vector3(L.x, ground(ctx, L.x, L.z) + 0.9, L.z);
}

export function reliefPoint(ctx) {
  const a = anchor(ctx, 'relief');
  if (a) return a;
  const r = LANDMARKS.candi.relief;
  return new THREE.Vector3(r.x, ground(ctx, r.x, r.z) + 1.3, r.z);
}

export function candiDoorPoint(ctx) {
  const a = anchor(ctx, 'candi:door');
  if (a) return a;
  const d = LANDMARKS.candi.door;
  return new THREE.Vector3(d.x, LANDMARKS.candi.chamber.floorY + 1.4, d.z);
}

// Campfire fire base centre.
export function campfirePoint(ctx, id) {
  const a = anchor(ctx, 'campfire:' + id);
  if (a) return a;
  const c = ctx.structures?.campfires?.[id];
  if (c?.position) return new THREE.Vector3().copy(c.position);
  const cp = CHECKPOINTS.find((q) => q.id === id);
  return new THREE.Vector3(cp.x, heightAt(cp.x, cp.z) + 0.12, cp.z);
}

// Where the player wakes up / rests next to a campfire (offset, facing the fire).
const RESPAWN_OFFSET = { kampung: [2.2, 3.2], tirta: [2.4, 2.6], candi: [-2.8, 2.4] };
export function campfireSpawn(ctx, id) {
  const cp = CHECKPOINTS.find((q) => q.id === id) || CHECKPOINTS[0];
  const [ox, oz] = RESPAWN_OFFSET[cp.id] || [0, 3];
  const x = cp.x + ox, z = cp.z + oz;
  const y = ground(ctx, x, z, heightAt(x, z) + 2);
  const yaw = Math.atan2(-(cp.x - x), -(cp.z - z));
  return { x, y: Math.max(y, heightAt(x, z)) + 0.02, z, yaw };
}

export function lighthouseTop(ctx) {
  const t = ctx.structures?.lighthouse?.top;
  if (t && Number.isFinite(t.x)) return new THREE.Vector3(t.x, t.y, t.z);
  const M = LANDMARKS.mercusuar;
  return new THREE.Vector3(M.x, M.floor + M.towerHeight, M.z);
}

export function groundY(ctx, x, z, yHint) { return ground(ctx, x, z, yHint); }
