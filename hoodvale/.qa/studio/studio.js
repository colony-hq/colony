// Character studio for headless screenshots (QA only, not published).
// Usage from smoke steps: { "eval": "import('/.qa/studio/studio.js').then(m => m.lineup('npcs1'))" }
import { NPCS } from '../../js/data/npcs.js';

const ctx = () => window.__hv.ctx;
let live = [];

export const SETS = {
  player: [
    { body: 'male', skin: '#e0b48a', hair: 'short', hairColor: '#4a3020', top: '#7a5a3a', bottom: '#4a3a2a' },
    { body: 'female', skin: '#c8956b', hair: 'long', hairColor: '#2a1a12', top: '#2e6f8e', bottom: '#3a2a1a' },
    { body: 'male', build: 'slim', skin: '#8a5a3a', hair: 'mohawk', hairColor: '#1a1a1a', top: '#5a2a6a', bottom: '#2a2a2a' },
    { body: 'female', skin: '#f0c8a8', hair: 'ponytail', hairColor: '#c9a46a', top: '#8a3a2a', bottom: '#4a3a2a' },
    { body: 'male', build: 'stout', skin: '#a8754f', hair: 'bald', beard: 'full', hairColor: '#6a4a2a', top: '#3a5a3a', bottom: '#3a3a2a' },
    { body: 'female', skin: '#5a3a28', hair: 'bun', hairColor: '#1a1a1a', top: '#a87a2a', bottom: '#2a2a2a' },
  ],
};

function npcLooks(ids) { return ids.map((id) => NPCS[id]?.look || NPCS.find?.((n) => n.id === id)?.look).filter(Boolean); }
export function npcSet(n) {
  const all = Array.isArray(NPCS) ? NPCS : Object.values(NPCS);
  const humans = all.filter((d) => d.look && d.look.body !== 'oracle');
  return humans.slice(n * 6, n * 6 + 6).map((d) => ({ ...d.look, _id: d.id }));
}

export function clear() { for (const a of live) { try { a.dispose(); } catch {} } live = []; }

// Place looks in a row facing the camera (south), then aim the camera.
export function lineup(looks, { x = 214, z = 244, gap = 1.4, view = 'full', pose = null, t = 0.3 } = {}) {
  const c = ctx();
  clear();
  if (typeof looks === 'string') looks = looks.startsWith('npc') ? npcSet(+looks.slice(3)) : SETS[looks];
  const n = looks.length;
  const x0 = x - ((n - 1) * gap) / 2;
  looks.forEach((look, i) => {
    const a = c.actors.create({ kind: 'humanoid', look, npc: true });
    const ax = x0 + i * gap;
    a.setPosition(ax, c.map.heightAt(ax, z), z);
    a.setYaw(Math.PI);
    if (pose) { a.debugPose?.(pose, t); a.freeze?.(true); }
    live.push(a);
  });
  // Hide the player and the interface so nothing photobombs.
  c.player?.actor?.setVisible?.(false);
  for (const id of ['hud', 'windows', 'menus', 'toasts', 'overlay']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  const gy = c.map.heightAt(x, z);
  // Actors face -z (yaw PI turns them toward +z... the camera sits on the side they face).
  const f = -1;
  if (view === 'full') window.__hv.lookFrom([x, gy + 1.4, z - f * (n * 0.72 + 1.3)], [x, gy + 0.95, z]);
  else if (view === 'faces') window.__hv.lookFrom([x, gy + 1.62, z - f * (n * 0.36 + 0.45)], [x, gy + 1.52, z]);
  else if (view === 'game') window.__hv.lookFrom([x + 6, gy + 11, z - f * 10], [x, gy + 1, z]);
  else if (view === 'three4') window.__hv.lookFrom([x + n * 0.6 + 1.2, gy + 1.5, z + n * 0.55 + 1.2], [x, gy + 0.95, z]);
  return live.length;
}

// Close-up of one actor's head (index i of the current lineup).
export function face(i = 0, { side = 0, back = false } = {}) {
  const c = ctx();
  const a = live[i];
  const p = a.root.position;
  const h = a.headHeight;
  window.__hv.lookFrom([p.x + side * 0.6, p.y + h - 0.1, p.z + (back ? -0.75 : 0.75) * (side ? 0.7 : 1)], [p.x, p.y + h - 0.22, p.z]);
}

export function liveInfo(i = 0) {
  const a = live[i];
  const g = a.mesh.geometry;
  const uv = g.attributes.aUv;
  let n = 0, mx = 0;
  for (let k = 0; k < uv.count; k++) { const s = uv.getX(k) + uv.getY(k); if (s > 0) { n++; mx = Math.max(mx, s); } }
  return { names: Object.keys(g.attributes), n, mx, count: uv.count, mat: a.mesh.material.customProgramCacheKey(), prog: !!a.mesh.material.userData };
}

// Monsters by id (creature actors with their model).
export async function monsters(ids, { x = 214, z = 244, gap = 2.0, view = 'full' } = {}) {
  const { MONSTERS } = await import('../../js/data/monsters.js');
  const c = ctx();
  clear();
  const n = ids.length;
  const x0 = x - ((n - 1) * gap) / 2;
  ids.forEach((id, i) => {
    const def = MONSTERS[id];
    const a = c.actors.create({ kind: 'creature', model: def.model, monster: id });
    const ax = x0 + i * gap;
    a.setPosition(ax, c.map.heightAt(ax, z), z);
    a.setYaw(Math.PI);
    live.push(a);
  });
  c.player?.actor?.setVisible?.(false);
  for (const id of ['hud', 'windows', 'menus', 'toasts', 'overlay']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  const gy = c.map.heightAt(x, z);
  if (view === 'full') window.__hv.lookFrom([x, gy + 1.8, z + n * 0.9 + 1.5], [x, gy + 1.0, z]);
  else window.__hv.lookFrom([x, gy + 1.4, z + n * 0.5 + 0.6], [x, gy + 1.1, z]);
  return live.length;
}
