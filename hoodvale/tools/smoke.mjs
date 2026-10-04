// Headless smoke test: serves hoodvale/, opens dev.html in Chromium (SwiftShader WebGL), runs
// scripted steps, saves screenshots and prints a JSON report (errors, warnings, stats).
//
// Usage:
//   node tools/smoke.mjs [--steps steps.json | --steps '[...]'] [--out dir] [--q low]
//                        [--size 1280x720] [--mobile] [--timeout 90000]
//
// Steps (run in order after the game reports ready; window.__hv is available because the
// page is opened with ?debug):
//   { "wait": 1000 }                         sleep (ms, wall clock)
//   { "eval": "__hv.play()" }           run JS in the page (result logged)
//   { "waitFor": "expr", "timeout": 10000 }  poll until expr is truthy
//   { "shot": "name" }                       screenshot -> <out>/<name>.png
//   { "key": "KeyW", "hold": 800 }           hold a key (default 100 ms)
//   { "click": "#selector" }                 click a DOM element
//   { "log": "expr" }                        print value of expr
// CDN responses (three.js, fonts) are cached in tools/.cache to keep repeated runs fast.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { makeDev } from './make-dev.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools', '.cache');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

let steps = opt('steps', null);
if (steps && typeof steps === 'string') {
  steps = steps.trim().startsWith('[') ? JSON.parse(steps) : JSON.parse(fs.readFileSync(steps, 'utf8'));
}
if (!steps) {
  steps = [
    { shot: 'title' },
    { eval: '__hv.play()' },
    { wait: 2500 },
    { shot: 'play' },
    { log: '__hv.stats()' },
  ];
}
const OUT = path.resolve(opt('out', path.join(ROOT, '.qa', 'shots')));
const Q = opt('q', 'low');
const [W, H] = String(opt('size', '1280x720')).split('x').map(Number);
const MOBILE = !!opt('mobile', false);
const TIMEOUT = Number(opt('timeout', 90000));
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));

makeDev();
const server = await startServer(0);
const port = server.address().port;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext(MOBILE
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: W, height: H } });
const page = await context.newPage();

const report = { url: '', errors: [], warnings: [], failedRequests: [], logs: [], shots: [], timings: {} };

await page.route(/^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdnjs\.cloudflare\.com)\//, async (route) => {
  const url = route.request().url();
  const key = crypto.createHash('sha1').update(url).digest('hex');
  const file = path.join(CACHE, key);
  if (!fs.existsSync(file)) {
    try {
      const tmp = `${file}.${process.pid}.tmp`;
      execFileSync('curl', ['-sSfL', '--max-time', '60', '-A', 'Mozilla/5.0 Chrome/120', '-o', tmp, '-D', `${file}.${process.pid}.hdr`, url]);
      fs.renameSync(`${file}.${process.pid}.hdr`, file + '.hdr');
      fs.renameSync(tmp, file);
    } catch (err) {
      report.failedRequests.push(url + ' (curl failed)');
      return route.abort();
    }
  }
  const hdr = fs.existsSync(file + '.hdr') ? fs.readFileSync(file + '.hdr', 'utf8') : '';
  const ct = (hdr.match(/content-type:\s*([^\r\n]+)/gi) || []).pop()?.split(':').slice(1).join(':').trim()
    || (url.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
  await route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': ct, 'access-control-allow-origin': '*' } });
});

page.on('console', (msg) => {
  const t = msg.type();
  const text = msg.text();
  if (t === 'error') report.errors.push(text);
  else if (t === 'warning') report.warnings.push(text);
});
page.on('pageerror', (err) => report.errors.push('pageerror: ' + (err.stack || err.message)));
page.on('requestfailed', (req) => report.failedRequests.push(req.url() + ' ' + (req.failure()?.errorText || '')));
page.on('response', (res) => { if (res.status() >= 400) report.failedRequests.push(res.url() + ' ' + res.status()); });

const t0 = Date.now();
report.url = `http://127.0.0.1:${port}/dev.html?debug&q=${Q}`;
await page.goto(report.url, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => window.__hv && window.__hv.ctx.state.mode !== 'loading', null, { timeout: TIMEOUT, polling: 250 });
  report.timings.readyMs = Date.now() - t0;
} catch {
  report.errors.push('timeout waiting for game ready');
  const label = await page.evaluate(() => document.querySelector('[data-label]')?.textContent).catch(() => '');
  report.logs.push({ loadingLabel: label });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const step of steps) {
  try {
    if (step.wait) await sleep(step.wait);
    else if (step.eval) {
      const v = await page.evaluate((code) => { const r = (0, eval)(code); return r instanceof Promise ? r.then((x) => JSON.parse(JSON.stringify(x ?? null))) : JSON.parse(JSON.stringify(r ?? null)); }, step.eval);
      if (v !== null && v !== undefined) report.logs.push({ eval: step.eval, value: v });
    } else if (step.waitFor) {
      await page.waitForFunction(step.waitFor, null, { timeout: step.timeout || 10000, polling: 200 });
    } else if (step.shot) {
      const file = path.join(OUT, step.shot + '.png');
      await page.screenshot({ path: file });
      report.shots.push(file);
    } else if (step.key) {
      await page.keyboard.down(step.key);
      await sleep(step.hold || 100);
      await page.keyboard.up(step.key);
    } else if (step.click) {
      await page.click(step.click, { timeout: 5000 });
    } else if (step.log) {
      const v = await page.evaluate((code) => JSON.parse(JSON.stringify((0, eval)(code) ?? null)), step.log);
      report.logs.push({ [step.log]: v });
    }
  } catch (err) {
    report.errors.push(`step ${JSON.stringify(step)} failed: ${err.message.split('\n')[0]}`);
  }
}
report.timings.totalMs = Date.now() - t0;
await browser.close();
server.close();
// Collapse duplicate messages.
const uniq = (arr) => { const m = new Map(); for (const a of arr) m.set(a, (m.get(a) || 0) + 1); return [...m].map(([k, n]) => (n > 1 ? `${k} (x${n})` : k)); };
report.errors = uniq(report.errors);
report.warnings = uniq(report.warnings).slice(0, 30);
report.failedRequests = uniq(report.failedRequests);
console.log(JSON.stringify(report, null, 2));
process.exit(report.errors.length ? 1 : 0);
