// Bakes the heightfield and writes a shaded top-down PNG with landmarks marked.
// Usage: node tools/heightmap.mjs [out.png] [halfExtent]
import fs from 'node:fs';
import { encodePNG } from './png.mjs';
import { heightAt, bakeHeightfield, LANDMARKS, CHECKPOINTS, PATHS, distToPath } from '../js/world/heightfield.js';

const out = process.argv[2] || 'heightmap.png';
const half = Number(process.argv[3] || 280);
const W = 700;
const t0 = Date.now();
bakeHeightfield();
console.log('bake ms', Date.now() - t0);
const rgb = Buffer.alloc(W * W * 3);
const toWorld = (p) => -half + (p / (W - 1)) * half * 2;
for (let py = 0; py < W; py++) {
  for (let px = 0; px < W; px++) {
    const x = toWorld(px), z = toWorld(py);
    const h = heightAt(x, z);
    const hx = heightAt(x + 1, z) - heightAt(x - 1, z);
    const hz = heightAt(x, z + 1) - heightAt(x, z - 1);
    const shade = Math.max(0.35, Math.min(1.3, 1 + (-hx * 0.6 - hz * 0.4) * 0.5));
    let r, g, b;
    if (h < 0) { const d = Math.min(1, -h / 18); r = 30 * (1 - d) + 10; g = 110 * (1 - d) + 30; b = 170 * (1 - d) + 70; }
    else if (h < 1.6) { r = 220; g = 200; b = 150; }
    else if (h < 25) { const k = h / 25; r = 70 + 60 * k; g = 140 - 20 * k; b = 60 + 20 * k; }
    else { const k = Math.min(1, (h - 25) / 45); r = 130 + 100 * k; g = 120 + 100 * k; b = 90 + 130 * k; }
    if (h >= 0 && distToPath(x, z) < 2) { r = 160; g = 110; b = 70; }
    // contour every 5 m
    if (h > 0 && Math.abs((h % 5)) < 0.18) { r *= 0.8; g *= 0.8; b *= 0.8; }
    const k = (py * W + px) * 3;
    rgb[k] = Math.max(0, Math.min(255, r * shade)); rgb[k + 1] = Math.max(0, Math.min(255, g * shade)); rgb[k + 2] = Math.max(0, Math.min(255, b * shade));
  }
}
function mark(x, z, col, size = 4) {
  const px = Math.round(((x + half) / (half * 2)) * (W - 1)), py = Math.round(((z + half) / (half * 2)) * (W - 1));
  for (let dy = -size; dy <= size; dy++) for (let dx = -size; dx <= size; dx++) {
    if (Math.abs(dx) + Math.abs(dy) > size) continue;
    const X = px + dx, Y = py + dy; if (X < 0 || Y < 0 || X >= W || Y >= W) continue;
    const k = (Y * W + X) * 3; rgb[k] = col[0]; rgb[k + 1] = col[1]; rgb[k + 2] = col[2];
  }
}
const L = LANDMARKS;
for (const c of CHECKPOINTS) mark(c.x, c.z, [255, 140, 0], 5);
mark(L.mercusuar.x, L.mercusuar.z, [255, 255, 255], 5);
for (const s of L.mercusuar.sockets) mark(s.x, s.z, [255, 60, 60], 2);
mark(L.candi.x, L.candi.z, [255, 255, 255], 5);
for (const p of L.candi.pelita) mark(p.x, p.z, [255, 230, 80], 2);
mark(L.airTerjun.top.x, L.airTerjun.top.z, [120, 220, 255], 4);
mark(L.airTerjun.cave.x, L.airTerjun.cave.z, [255, 0, 255], 3);
mark(L.kapalKaram.x, L.kapalKaram.z, [80, 40, 20], 6);
mark(L.gunung.x, L.gunung.z, [255, 255, 255], 3);
for (const h of L.kampung.houses) mark(h.x, h.z, [90, 50, 30], 4);
mark(L.spawn.x, L.spawn.z, [0, 255, 0], 3);
for (let z = L.pier.zStart; z <= L.pier.zEnd; z += 2) mark(0, z, [120, 80, 40], 1);
fs.writeFileSync(out, encodePNG(W, W, rgb));
// Report heights at key points.
const rep = (n, p) => console.log(n.padEnd(22), `(${p.x}, ${p.z})`.padEnd(16), 'h=', heightAt(p.x, p.z).toFixed(2));
rep('spawn', L.spawn); rep('pier start', { x: 0, z: L.pier.zStart }); rep('pier end', { x: 0, z: L.pier.zEnd });
rep('kampung', L.kampung); for (const h of L.kampung.houses) rep(h.id, h); rep('warung', L.kampung.warung);
rep('mercusuar', L.mercusuar); for (const s of L.mercusuar.sockets) rep('socket ' + s.id, s); rep('door', L.mercusuar.door);
rep('candi', L.candi); for (const p of L.candi.pelita) rep('pelita ' + p.id, p); rep('candi campfire', L.candi.campfire);
rep('waterfall top', L.airTerjun.top); rep('cove', L.airTerjun.cove); rep('cave', L.airTerjun.cave); rep('cave entr', L.airTerjun.cave.entrance); rep('tirta campfire', L.airTerjun.campfire);
rep('mesa', L.airTerjun.mesa); for (const p of L.river) rep('river', p);
rep('kapal', L.kapalKaram); rep('kapal cabin', L.kapalKaram.cabin); rep('kapal beach', L.kapalKaram.beach);
rep('gunung', L.gunung);
for (const [i, p] of PATHS.entries()) for (const q of p) rep('path' + i, q);
