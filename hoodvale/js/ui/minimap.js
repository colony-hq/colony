// Minimap: rotates with the camera yaw, shows the painted region (world/mapimage.js), entity
// dots, map icons (bank, shops, furnace, altar, portals...), the player arrow and the walk flag.
// Click to walk. Wheel over it to zoom. Owner: ui builder.

import { paintRegion } from '../world/mapimage.js';
import { ZONES } from '../data/zones.js';
import { mapIconCanvas } from './icons.js';
import { safe } from './util.js';

const PAINT = 3; // px per tile in the cached region paintings
export const REGION_NAMES = { warrens: 'Goblin Warrens', vault: "The Sheriff's Vault", lair: 'The Ashen Lair' };

// Object def id -> map icon kind.
const OBJECT_ICONS = {
  bank_booth: 'bank', exchange_desk: 'exchange', furnace: 'furnace', anvil: 'anvil', range: 'range', crystal_altar: 'altar',
  spinning_wheel: 'spin', tanning_rack: 'tan', oracle_crystal: 'oracle', well: 'well',
  cave_entrance: 'portal', cave_exit: 'portal', vault_stairs: 'portal', vault_stairs_up: 'portal', lair_entrance: 'portal',
  fish_net_bait: 'fish', fish_lure: 'fish', fish_cage_harpoon: 'fish',
  stall_bakery: 'thief', stall_silk: 'thief', stall_fur: 'thief', stall_gem: 'thief',
};

export function regionCanvas(U, id) {
  U.mapCache = U.mapCache || new Map();
  let c = U.mapCache.get(id);
  if (!c) {
    try { c = paintRegion(id, PAINT); } catch (err) { console.warn('[ui] paintRegion failed', id, err); c = document.createElement('canvas'); c.width = c.height = 8; }
    U.mapCache.set(id, c);
  }
  return c;
}

// Static points of interest for map icons, merged when close together.
export function collectPOIs(ctx) {
  const out = [];
  const add = (kind, x, z, label, merge = 4) => {
    if (out.some((p) => p.kind === kind && Math.abs(p.x - x) <= merge && Math.abs(p.z - z) <= merge)) return;
    out.push({ kind, x, z, label });
  };
  for (const e of safe(() => [...ctx.entities.all()], [])) {
    if (e.kind === 'object') {
      const k = OBJECT_ICONS[e.defId];
      if (k) add(k, e.x + (e.w || 1) / 2, e.z + (e.d || 1) / 2, e.spawn?.label || e.name, k === 'fish' ? 7 : 4);
    } else if (e.kind === 'npc') {
      const d = e.def || {};
      if (d.id === 'oracle') add('oracle', e.x + 0.5, e.z + 0.5, d.name);
      else if ((d.options || []).includes('Bank')) add('bank', e.x + 0.5, e.z + 0.5, 'Bank');
      else if ((d.options || []).includes('Exchange')) add('exchange', e.x + 0.5, e.z + 0.5, 'The Exchange');
      else if (d.shop) add('shop', e.x + 0.5, e.z + 0.5, d.name);
      if (d.quest) add('quest', e.x + 0.5, e.z + 0.5 - 1.5, d.name, 1);
    }
  }
  return out;
}

export function createMinimap(U) {
  const { ctx, events, state } = U;
  const host = U.hud.mm;
  const cv = document.createElement('canvas');
  host.prepend(cv);
  const g = cv.getContext('2d');
  let size = 0, dpr = 1;
  let zoom = 4; // css px per tile
  let pois = null;
  const dyn = new Set();
  let flag = null; // {x, z}
  let lastZone = null;

  const isDyn = (e) => e && (e.kind === 'npc' || e.kind === 'monster' || e.kind === 'item' || e.kind === 'remote');
  const rebuildDyn = () => { dyn.clear(); for (const e of safe(() => [...ctx.entities.all()], [])) if (isDyn(e)) dyn.add(e); };
  events.on('entity:add', ({ entity }) => { if (isDyn(entity)) dyn.add(entity); if (entity?.kind === 'object' && OBJECT_ICONS[entity.defId]) pois = null; });
  events.on('entity:remove', ({ entity }) => { dyn.delete(entity); });
  events.on('game:start', () => { rebuildDyn(); pois = null; });
  events.on('player:path', ({ goal }) => { if (goal && goal.x != null) flag = { x: goal.x + (goal.w || 1) / 2, z: goal.z + (goal.d || 1) / 2 }; });
  events.on('player:arrive', () => { flag = null; });
  events.on('player:teleport', () => { flag = null; updateRegion(true); });
  events.on('player:move', () => updateRegion(false));

  function updateRegion(force) {
    const p = ctx.player?.pos;
    if (!p) return;
    const r = safe(() => ctx.map.regionAt(p.x, p.z), null);
    let name = '';
    if (r && r.id !== 'overworld') name = REGION_NAMES[r.id] || r.id;
    else {
      const z = safe(() => ctx.map.zoneAt(Math.floor(p.x), Math.floor(p.z)), null);
      const zid = typeof z === 'string' ? z : z?.id;
      name = ZONES[zid]?.name || (zid === 'wilds' || !zid ? 'The Wilds' : zid);
    }
    if (force || name !== lastZone) { lastZone = name; U.hud.region.textContent = name; }
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    const s = Math.round(rect.width);
    const d = Math.min(2, window.devicePixelRatio || 1);
    if (s === size && d === dpr) return;
    size = s; dpr = d;
    cv.width = Math.max(8, Math.round(s * d)); cv.height = cv.width;
  }

  // Screen offset (css px from centre) -> world tile.
  function screenToTile(sx, sy) {
    const yaw = ctx.cameraRig?.yaw || 0;
    const c = Math.cos(-yaw), s = Math.sin(-yaw);
    const wx = (sx * c - sy * s) / zoom, wz = (sx * s + sy * c) / zoom;
    const p = ctx.player.pos;
    return { x: Math.floor(p.x + wx), z: Math.floor(p.z + wz) };
  }

  host.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (state.mode !== 'play') return;
    const r = host.getBoundingClientRect();
    const sx = e.clientX - (r.left + r.width / 2), sy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(sx, sy) > r.width / 2) return;
    e.preventDefault();
    let t = screenToTile(sx, sy);
    if (!safe(() => ctx.map.isWalkable(t.x, t.z), true)) { const n = safe(() => ctx.map.nearestWalkable(t.x, t.z, 4), null); if (n) t = n; }
    ctx.player?.walkTo?.(t.x, t.z);
    flag = { x: t.x + 0.5, z: t.z + 0.5 };
  });
  host.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(2.2, Math.min(8, zoom * (e.deltaY > 0 ? 0.88 : 1.14))); }, { passive: false });
  host.addEventListener('contextmenu', (e) => e.preventDefault());

  let frame = 0;
  const mm = {
    get zoom() { return zoom; },
    update() {
      if (state.mode !== 'play' && state.mode !== 'dead') return;
      if (++frame % 2 && U.layout === 'phone') return; // half rate on phones
      resize();
      const p = ctx.player?.pos;
      if (!p || !size) return;
      if (!pois) { pois = collectPOIs(ctx); if (!dyn.size) rebuildDyn(); updateRegion(true); }
      const R = safe(() => ctx.map.regionAt(p.x, p.z), { id: 'overworld', x0: 0, z0: 0 });
      const base = regionCanvas(U, R.id);
      const yaw = ctx.cameraRig?.yaw || 0;
      const W = cv.width, half = W / 2, k = dpr * zoom;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, W);
      g.save();
      g.beginPath(); g.arc(half, half, half, 0, Math.PI * 2); g.clip();
      g.fillStyle = R.id === 'overworld' ? '#1d3a52' : '#0c0906';
      g.fillRect(0, 0, W, W);
      g.translate(half, half);
      g.rotate(yaw);
      g.imageSmoothingEnabled = true;
      const sc = k / PAINT;
      g.drawImage(base, 0, 0, base.width, base.height, -(p.x - R.x0) * k, -(p.z - R.z0) * k, base.width * sc, base.height * sc);
      g.restore();

      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const toScr = (x, z) => { const dx = (x - p.x) * k, dz = (z - p.z) * k; return [half + dx * cs - dz * sn, half + dx * sn + dz * cs]; };
      const inside = (sx, sy, m = 2) => (sx - half) ** 2 + (sy - half) ** 2 < (half - m * dpr) ** 2;

      // Icons (upright).
      const isz = Math.round((U.layout === 'phone' ? 13 : 15) * dpr);
      for (const poi of pois) {
        if (Math.abs(poi.x - p.x) * k > W || Math.abs(poi.z - p.z) * k > W) continue;
        const [sx, sy] = toScr(poi.x, poi.z);
        if (!inside(sx, sy, 6)) continue;
        g.drawImage(mapIconCanvas(poi.kind, 24), sx - isz / 2, sy - isz / 2, isz, isz);
      }
      // Dots.
      const dot = (sx, sy, col, r = 2.2) => {
        g.fillStyle = '#000'; g.fillRect(sx - r * dpr - dpr, sy - r * dpr - dpr, (2 * r + 2) * dpr, (2 * r + 2) * dpr);
        g.fillStyle = col; g.fillRect(sx - r * dpr, sy - r * dpr, 2 * r * dpr, 2 * r * dpr);
      };
      for (const e of dyn) {
        if (!e.alive || e.hidden) continue;
        const ex = e.pos ? e.pos.x : e.x + 0.5, ez = e.pos ? e.pos.z : e.z + 0.5;
        if (Math.abs(ex - p.x) * k > half || Math.abs(ez - p.z) * k > half) continue;
        const [sx, sy] = toScr(ex, ez);
        if (!inside(sx, sy)) continue;
        dot(sx, sy, e.kind === 'npc' ? '#ffff20' : e.kind === 'monster' ? '#ffb020' : e.kind === 'item' ? '#ff2a2a' : '#ffffff', e.kind === 'item' ? 1.7 : 2.1);
      }
      // Walk flag.
      if (flag) {
        const [sx, sy] = toScr(flag.x, flag.z);
        if (inside(sx, sy)) {
          g.save(); g.translate(sx, sy); g.scale(dpr, dpr);
          g.fillStyle = '#000'; g.fillRect(-0.5, -11, 2.5, 12);
          g.fillStyle = '#e0302a'; g.beginPath(); g.moveTo(1.5, -11); g.lineTo(9, -8); g.lineTo(1.5, -5); g.closePath(); g.fill();
          g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
          g.restore();
        }
      }
      // Player arrow.
      const a = yaw - (ctx.player?.yaw || 0);
      g.save(); g.translate(half, half); g.rotate(a); g.scale(dpr, dpr);
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5); g.closePath();
      g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.4; g.stroke();
      g.restore();
    },
  };
  return mm;
}
