// Journal map: a parchment chart baked once from the heightfield (hillshade, contours, water,
// paths), plus a cheap overlay pass (places, campfires, flames, people, player arrow).
// Owner: npc-ai. Used by ui/journal.js only.

import { heightAt, LANDMARKS, PATHS } from '../world/heightfield.js';

export const MAP_EXTENT = 262; // metres from the centre to each edge (north is up)
const N = 400; // baked resolution

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Land colour ramp by height (parchment-tinted).
const LAND = [
  [0, [226, 208, 160]],
  [2.5, [214, 203, 150]],
  [10, [196, 190, 136]],
  [24, [180, 164, 112]],
  [45, [160, 132, 92]],
  [80, [128, 98, 66]],
];
function landColor(h) {
  for (let i = 1; i < LAND.length; i++) {
    if (h <= LAND[i][0]) {
      const [h0, c0] = LAND[i - 1], [h1, c1] = LAND[i];
      const t = (h - h0) / (h1 - h0);
      return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
    }
  }
  return LAND[LAND.length - 1][1];
}

export function createJournalMap() {
  let canvas = null;
  let hgt = null;
  let row = 0;
  let ready = false;
  const step = (MAP_EXTENT * 2) / N;
  const toWorld = (i) => -MAP_EXTENT + (i + 0.5) * step;

  function heights(rows) {
    if (!hgt) hgt = new Float32Array(N * N);
    const end = Math.min(N, row + rows);
    for (; row < end; row++) {
      const z = toWorld(row);
      for (let i = 0; i < N; i++) hgt[row * N + i] = heightAt(toWorld(i), z);
    }
    return row >= N;
  }

  function paint() {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = N;
    const g = canvas.getContext('2d');
    const img = g.createImageData(N, N);
    const d = img.data;
    const H = (i, j) => hgt[clamp(j, 0, N - 1) * N + clamp(i, 0, N - 1)];
    const L = [-0.62, 0.62, -0.48]; // light from the north-west, above
    let seed = 1337;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const h = H(i, j);
        const k = (j * N + i) * 4;
        let r, gg, b;
        const hl = H(i - 1, j), hr = H(i + 1, j), hu = H(i, j - 1), hd = H(i, j + 1);
        if (h < 0) {
          const t = clamp(-h / 18, 0, 1);
          r = lerp(160, 84, t); gg = lerp(180, 108, t); b = lerp(176, 124, t);
          // Shallow-water hatch near the coast.
          if (h > -2.2 && (i + j) % 6 === 0) { r -= 14; gg -= 12; b -= 10; }
        } else {
          [r, gg, b] = landColor(h);
          const ex = 2.4; // shading exaggeration
          let nx = -(hr - hl) / (2 * step) * ex, nz = -(hd - hu) / (2 * step) * ex, ny = 1;
          const len = Math.hypot(nx, ny, nz);
          nx /= len; ny /= len; nz /= len;
          const lam = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
          const shade = 0.55 + 0.62 * lam;
          r *= shade; gg *= shade; b *= shade;
          // Contours every 8 m, index contour every 40 m.
          const c0 = Math.floor(h / 8);
          if (c0 !== Math.floor(hr / 8) || c0 !== Math.floor(hd / 8)) {
            const idx = Math.floor(Math.max(h, hr, hd) / 8) % 5 === 0;
            const a = idx ? 0.42 : 0.2;
            r = lerp(r, 92, a); gg = lerp(gg, 58, a); b = lerp(b, 30, a);
          }
          // Coastline ink.
          if (hl < 0 || hr < 0 || hu < 0 || hd < 0) { r = 70; gg = 50; b = 32; }
        }
        // Paper wash + grain + burnt edges.
        const n = (rnd() - 0.5) * 10;
        r = lerp(r, 236, 0.1) + n; gg = lerp(gg, 224, 0.1) + n; b = lerp(b, 190, 0.1) + n;
        const ex = (i / N - 0.5) * 2, ey = (j / N - 0.5) * 2;
        const edge = smooth(0.78, 1.05, Math.max(Math.abs(ex), Math.abs(ey)) * 0.6 + Math.hypot(ex, ey) * 0.42);
        const burn = 1 - 0.32 * edge;
        d[k] = clamp(r * burn, 0, 255);
        d[k + 1] = clamp(gg * burn * 0.98, 0, 255);
        d[k + 2] = clamp(b * burn * 0.92, 0, 255);
        d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    const s = N / (MAP_EXTENT * 2);
    const P = (x, z) => [(x + MAP_EXTENT) * s, (z + MAP_EXTENT) * s];
    // Survey grid every 100 m.
    g.strokeStyle = 'rgba(70,45,20,0.1)';
    g.lineWidth = 1;
    for (let v = -200; v <= 200; v += 100) {
      const [a] = P(v, 0);
      g.beginPath(); g.moveTo(a, 0); g.lineTo(a, N); g.stroke();
      const [, bb] = P(0, v);
      g.beginPath(); g.moveTo(0, bb); g.lineTo(N, bb); g.stroke();
    }
    // River.
    g.strokeStyle = 'rgba(62,98,124,0.85)';
    g.lineWidth = 2;
    g.lineJoin = g.lineCap = 'round';
    g.beginPath();
    LANDMARKS.river.forEach((p, i) => { const [x, y] = P(p.x, p.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    // Footpaths.
    g.strokeStyle = 'rgba(110,62,26,0.72)';
    g.lineWidth = 1.5;
    g.setLineDash([4, 3.5]);
    for (const path of PATHS) {
      g.beginPath();
      path.forEach((p, i) => { const [x, y] = P(p.x, p.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    }
    g.setLineDash([]);
    ready = true;
  }

  // Bake a few rows per call (spread over frames); returns true once the base map exists.
  function bakeStep(rows = 60) {
    if (ready) return true;
    if (heights(rows)) paint();
    return ready;
  }

  // Overlay draw on a visible canvas. info: { places, campfires, flames, people, player, t, dpr }
  function draw(target, info) {
    const g = target.getContext('2d');
    const W = target.width;
    const dpr = info.dpr || 1;
    g.clearRect(0, 0, W, W);
    if (!ready) {
      g.fillStyle = '#e7d6ae';
      g.fillRect(0, 0, W, W);
      g.fillStyle = 'rgba(70,45,20,.6)';
      g.font = `italic ${14 * dpr}px "Alegreya Sans", sans-serif`;
      g.textAlign = 'center';
      g.fillText('Menggambar peta…', W / 2, W / 2);
      return;
    }
    g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, 0, 0, W, W);
    const s = W / (MAP_EXTENT * 2);
    const P = (x, z) => [(x + MAP_EXTENT) * s, (z + MAP_EXTENT) * s];
    const label = (text, x, y, { size = 12, font = '"Alegreya Sans", sans-serif', weight = 700, color = '#2b1d10', align = 'center', italic = false } = {}) => {
      g.font = `${italic ? 'italic ' : ''}${weight} ${size * dpr}px ${font}`;
      g.textAlign = align;
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(242,230,198,0.9)';
      g.lineWidth = 3.5 * dpr;
      g.strokeText(text, x, y);
      g.fillStyle = color;
      g.fillText(text, x, y);
    };

    // Places.
    for (const p of info.places) {
      if (!p.known) continue;
      const [x, y] = P(p.x, p.z);
      g.fillStyle = '#4a2f18';
      g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
      g.fillRect(-2.5 * dpr, -2.5 * dpr, 5 * dpr, 5 * dpr);
      g.restore();
      label(p.name, x + (p.dx || 0) * dpr, y + (p.dy ?? -11) * dpr, { size: 14, font: 'Gloock, Georgia, serif', weight: 400 });
    }

    // Vague areas (Sedang clues): dashed circles.
    for (const f of info.flames) {
      if (f.state !== 'vague') continue;
      const [x, y] = P(f.x, f.z);
      g.setLineDash([3 * dpr, 3 * dpr]);
      g.strokeStyle = f.ink;
      g.lineWidth = 1.6 * dpr;
      g.beginPath(); g.arc(x, y, 40 * s, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      label('?', x, y, { size: 16, color: f.ink });
    }

    // Campfires.
    for (const c of info.campfires) {
      if (!c.known) continue;
      const [x, y] = P(c.x, c.z);
      if (c.lit) {
        const gr = g.createRadialGradient(x, y, 0, x, y, 12 * dpr);
        gr.addColorStop(0, 'rgba(255,170,60,.85)');
        gr.addColorStop(1, 'rgba(255,140,40,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(x, y, 12 * dpr, 0, Math.PI * 2); g.fill();
        flame(g, x, y, 5 * dpr, '#e2683c', '#ffd27a');
      } else {
        g.strokeStyle = 'rgba(74,47,24,.75)';
        g.lineWidth = 1.4 * dpr;
        g.beginPath(); g.arc(x, y, 3.6 * dpr, 0, Math.PI * 2); g.stroke();
      }
    }

    // Flames (known locations).
    for (const f of info.flames) {
      if (f.state !== 'known' && f.state !== 'placed') continue;
      const [x, y] = P(f.x, f.z);
      const pulse = 0.5 + 0.5 * Math.sin((info.t || 0) * 3 + f.x);
      const gr = g.createRadialGradient(x, y, 0, x, y, (10 + pulse * 4) * dpr);
      gr.addColorStop(0, f.glow);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, (10 + pulse * 4) * dpr, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
      g.fillStyle = f.ink;
      g.fillRect(-4 * dpr, -4 * dpr, 8 * dpr, 8 * dpr);
      g.fillStyle = f.color;
      g.fillRect(-2.4 * dpr, -2.4 * dpr, 4.8 * dpr, 4.8 * dpr);
      g.restore();
      if (f.state === 'known') label(f.name, x, y + 13 * dpr, { size: 11.5, color: f.ink });
    }

    // People met.
    for (const p of info.people) {
      const [x, y] = P(p.x, p.z);
      g.fillStyle = '#7a4a22';
      g.beginPath(); g.arc(x, y, 2.6 * dpr, 0, Math.PI * 2); g.fill();
      label(p.name, x + 6 * dpr, y + 0.5 * dpr, { size: 10.5, weight: 400, italic: true, align: 'left', color: '#5b3a1e' });
    }

    // Player arrow.
    if (info.player) {
      const [x, y] = P(info.player.x, info.player.z);
      const yaw = info.player.yaw || 0;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const ang = Math.atan2(fz, fx);
      const ring = ((info.t || 0) * 0.8) % 1;
      g.strokeStyle = `rgba(226,104,60,${(1 - ring) * 0.8})`;
      g.lineWidth = 1.6 * dpr;
      g.beginPath(); g.arc(x, y, (5 + ring * 14) * dpr, 0, Math.PI * 2); g.stroke();
      g.save(); g.translate(x, y); g.rotate(ang);
      g.beginPath();
      g.moveTo(10 * dpr, 0); g.lineTo(-6 * dpr, 6 * dpr); g.lineTo(-3 * dpr, 0); g.lineTo(-6 * dpr, -6 * dpr); g.closePath();
      g.fillStyle = '#e2683c'; g.fill();
      g.strokeStyle = '#fff5df'; g.lineWidth = 1.6 * dpr; g.stroke();
      g.restore();
    }

    // Compass rose + scale.
    rose(g, W - 30 * dpr, 32 * dpr, 17 * dpr, dpr);
    const m100 = 100 * s;
    const sx = 18 * dpr, sy = W - 20 * dpr;
    g.strokeStyle = '#3a2614'; g.lineWidth = 1.5 * dpr;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + m100, sy); g.moveTo(sx, sy - 4 * dpr); g.lineTo(sx, sy + 4 * dpr); g.moveTo(sx + m100, sy - 4 * dpr); g.lineTo(sx + m100, sy + 4 * dpr); g.stroke();
    label('100 m', sx + m100 / 2, sy - 9 * dpr, { size: 10, weight: 700 });
  }

  function flame(g, x, y, r, c1, c2) {
    g.beginPath();
    g.moveTo(x, y - r * 1.5);
    g.quadraticCurveTo(x + r, y - r * 0.2, x, y + r * 0.8);
    g.quadraticCurveTo(x - r, y - r * 0.2, x, y - r * 1.5);
    g.fillStyle = c1; g.fill();
    g.beginPath(); g.arc(x, y + r * 0.1, r * 0.4, 0, Math.PI * 2); g.fillStyle = c2; g.fill();
  }

  function rose(g, x, y, r, dpr) {
    g.save();
    g.translate(x, y);
    g.strokeStyle = 'rgba(58,38,20,.6)';
    g.lineWidth = 1 * dpr;
    g.beginPath(); g.arc(0, 0, r * 0.62, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 0.2, 0); g.lineTo(0, r * 0.12); g.lineTo(-r * 0.2, 0); g.closePath();
      g.fillStyle = k === 3 ? '#7a2e14' : 'rgba(58,38,20,.75)';
      g.fill();
    }
    g.restore();
    g.font = `700 ${11 * dpr}px "Alegreya Sans", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#7a2e14';
    g.fillText('U', x, y - r - 8 * dpr);
  }

  return { bakeStep, draw, get ready() { return ready; }, extent: MAP_EXTENT };
}
