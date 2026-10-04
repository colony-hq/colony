// Split a concept sheet with several characters standing side by side on a white background
// into one image per character (for image-to-3D), each centred on white with a margin:
//   node .qa/lab/split.mjs <sheet.png> <out1.png> <out2.png> [...]
// Characters are found as runs of non-white columns; the widest N runs win (N = outputs).
import fs from 'node:fs';

const [src, ...outs] = process.argv.slice(2);
if (!src || !outs.length) { console.error('usage: split.mjs <sheet.png> <out1.png> [out2.png ...]'); process.exit(1); }
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));
const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined });
const page = await browser.newPage();
const dataURL = 'data:image/png;base64,' + fs.readFileSync(src).toString('base64');
const res = await page.evaluate(async ({ dataURL, n }) => {
  const img = new Image();
  img.src = dataURL;
  await img.decode();
  const W = img.width, H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const ink = (x, y) => { const i = (y * W + x) * 4; return d[i] < 236 || d[i + 1] < 236 || d[i + 2] < 236; };
  // Column coverage (ignore single stray pixels).
  const col = new Array(W).fill(0);
  for (let x = 0; x < W; x++) { let k = 0; for (let y = 0; y < H; y += 2) if (ink(x, y)) k++; col[x] = k; }
  const runs = [];
  let start = -1;
  for (let x = 0; x <= W; x++) {
    const on = x < W && col[x] > 2;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { runs.push([start, x - 1]); start = -1; }
  }
  // Merge runs separated by tiny gaps (fingers, hair strands), then keep the n widest.
  const merged = [];
  for (const r of runs) { const p = merged[merged.length - 1]; if (p && r[0] - p[1] < W * 0.012) p[1] = r[1]; else merged.push(r.slice()); }
  const pick = merged.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, n).sort((a, b) => a[0] - b[0]);
  return pick.map(([x0, x1]) => {
    let y0 = H, y1 = 0;
    for (let x = x0; x <= x1; x++) for (let y = 0; y < H; y++) if (ink(x, y)) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    // Output: 2:3 canvas, character height = 88% of it, centred, white background.
    const OH = Math.max(1024, Math.round(h / 0.88)), OW = Math.round(OH * 2 / 3);
    const s = Math.min((OH * 0.88) / h, (OW * 0.94) / w);
    const o = document.createElement('canvas'); o.width = OW; o.height = OH;
    const og = o.getContext('2d');
    og.fillStyle = '#fff'; og.fillRect(0, 0, OW, OH);
    og.imageSmoothingQuality = 'high';
    og.drawImage(c, x0, y0, w, h, (OW - w * s) / 2, (OH - h * s) / 2, w * s, h * s);
    return { box: [x0, y0, w, h], size: [OW, OH], png: o.toDataURL('image/png') };
  });
}, { dataURL, n: outs.length });
await browser.close();
if (res.length < outs.length) { console.error(`found ${res.length} characters, expected ${outs.length}`); process.exit(2); }
res.forEach((r, i) => {
  fs.writeFileSync(outs[i], Buffer.from(r.png.split(',')[1], 'base64'));
  console.log(outs[i], 'from box', r.box.join(','), '->', r.size.join('x'));
});
