// QA harness (not loaded by the game): renders music pieces, SFX and ambience with an
// OfflineAudioContext and measures peak / RMS / NaN / clipping. Used from smoke-test eval steps:
//   import('./js/audio/test-render.js').then((m) => m.renderAllMusic(12))
// Owner: audio builder.

import { createKit } from './kit.js';
import { createInstruments } from './instruments.js';
import { createMusic } from './music.js';
import { createSfx } from './sfx.js';
import { createAmbience } from './ambience.js';
import { PIECES } from './pieces.js';

const SR = 32000;
const db = (v) => (v > 0 ? +(20 * Math.log10(v)).toFixed(1) : -120);

function measure(buf, from = 0) {
  let peak = 0, sum = 0, n = 0, nan = 0, clip = 0;
  const win = Math.floor(buf.sampleRate * 0.5);
  let wSum = 0, wN = 0, minWin = Infinity, maxWin = 0, silentWins = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = Math.floor(from * buf.sampleRate); i < d.length; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) { nan++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.999) clip++;
      sum += v * v; n++;
      if (ch === 0) {
        wSum += v * v; wN++;
        if (wN >= win) {
          const r = Math.sqrt(wSum / wN);
          minWin = Math.min(minWin, r); maxWin = Math.max(maxWin, r);
          if (r < 0.0005) silentWins++;
          wSum = 0; wN = 0;
        }
      }
    }
  }
  return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / Math.max(1, n))), minWinDb: db(minWin === Infinity ? 0 : minWin), maxWinDb: db(maxWin), silentWins, nan, clip };
}

function graph(ac) {
  const counters = { nodes: 0, voices: 0 };
  const kit = createKit(ac, counters);
  const inst = createInstruments(kit);
  const out = kit.gain(1);
  out.connect(ac.destination);
  const reverb = ac.createConvolver();
  reverb.buffer = kit.impulse(2.6, 2.8);
  const wet = kit.gain(0.55);
  reverb.connect(wet); wet.connect(out);
  return { kit, inst, out, reverb, counters };
}

// Raw piece output (before volume settings and the limiter).
export async function renderMusic(key, seconds = 16, { combat = 0, queue = null } = {}) {
  const ac = new OfflineAudioContext(2, Math.floor(SR * seconds), SR);
  const g = graph(ac);
  const musicWet = g.kit.gain(0.32);
  musicWet.connect(g.reverb);
  const dry = g.kit.gain(1);
  dry.connect(g.out); dry.connect(musicWet);
  const music = createMusic(g.kit, g.inst, { dry }, g.counters);
  if (combat) music.setCombat(combat);
  music.setPiece(key, { fade: 0.05, queue });
  if (combat) music.setCombat(combat);
  music.update(seconds);
  const t0 = performance.now();
  const buf = await ac.startRendering();
  return { key: queue ? key + ':' + queue.join('+') : key, combat, seconds, renderMs: Math.round(performance.now() - t0), nodes: g.counters.nodes, plucks: g.kit.pluckCount, ...measure(buf, 0.3) };
}

export async function renderAllMusic(seconds = 14) {
  const rows = [];
  for (const key of Object.keys(PIECES)) rows.push(await renderMusic(key, seconds));
  for (const key of ['village', 'forest', 'mines', 'town']) rows.push(await renderMusic(key, 8, { combat: 1 }));
  return rows;
}

export async function renderSfx(name, opts = {}, seconds = 3) {
  const ac = new OfflineAudioContext(2, Math.floor(SR * seconds), SR);
  const g = graph(ac);
  const sfxWet = g.kit.gain(0.15);
  sfxWet.connect(g.reverb);
  const sfx = createSfx(g.kit, g.inst, { sfx: g.out, ui: g.out, amb: g.out, wet: sfxWet }, {}, g.counters);
  const ok = sfx.play(name, opts);
  const buf = await ac.startRendering();
  return { name, ok: ok > 0, len: ok ? +(ok).toFixed(2) : 0, ...measure(buf) };
}

export async function renderAllSfx(filter = null) {
  const ac = new OfflineAudioContext(1, 128, SR);
  const g = graph(ac);
  const names = createSfx(g.kit, g.inst, { sfx: g.out, ui: g.out, amb: g.out, wet: g.out }, {}, g.counters).names;
  const rows = [];
  for (const n of names) {
    if (filter && !filter.test(n)) continue;
    const moods = /^(chicken|cow|rat|goblin|boar|wolf|human|knight|sheriff|spider|bear|skeleton|lurker|wisp|troll|golem|imp|drake|wyrm)$/.test(n) ? ['idle', 'attack', 'hurt', 'death'] : [null];
    for (const m of moods) {
      const opts = m ? { mood: m } : n === 'step' ? { surface: 'grass' } : n.startsWith('level-') ? { milestone: true } : {};
      const r = await renderSfx(n, opts, n === 'amb-townbell' || n === 'quest-complete' ? 7 : 4);
      rows.push(m ? { ...r, name: `${n}:${m}` } : r);
    }
  }
  for (const s of ['wood', 'stone', 'cave', 'crystal', 'gravel', 'sand', 'water', 'mud', 'dirt', 'leaves']) rows.push({ ...(await renderSfx('step', { surface: s }, 1)), name: 'step:' + s });
  for (const el of ['spark', 'tide', 'stone', 'ember', 'thought', 'insight']) rows.push({ ...(await renderSfx('spell-hit', { element: el }, 2)), name: 'spell-hit:' + el });
  return rows;
}

// Ambience at a world position (uses the page's real map; steps updates via suspend/resume).
export async function renderAmbience(realCtx, { x, z, hour = 12, seconds = 8, fire = false } = {}) {
  const ac = new OfflineAudioContext(2, Math.floor(SR * seconds), SR);
  const g = graph(ac);
  const sfxWet = g.kit.gain(0.15);
  sfxWet.connect(g.reverb);
  const fakeCtx = {
    map: realCtx.map, state: { mode: 'play' }, sky: { hour }, player: { pos: { x, z } }, camera: null,
    entities: fire ? { near: () => [{ kind: 'object', defId: 'fire', x: Math.floor(x) + 2, z: Math.floor(z), w: 1, d: 1 }] } : null,
  };
  const sfx = createSfx(g.kit, g.inst, { sfx: g.out, ui: g.out, amb: g.out, wet: sfxWet }, fakeCtx, g.counters);
  const amb = createAmbience(g.kit, g.out, sfx, fakeCtx);
  const step = 0.1;
  for (let t = step; t < seconds - step; t += step) {
    ac.suspend(+t.toFixed(4)).then(() => { amb.update(step); ac.resume(); });
  }
  amb.update(step);
  const buf = await ac.startRendering();
  return { x, z, hour, zone: amb.env.zone, env: { coast: +amb.env.coast.toFixed(2), water: +amb.env.water.toFixed(2), wind: +amb.env.wind.toFixed(2), indoor: amb.env.indoor, dungeon: amb.env.dungeon }, ...measure(buf, 1) };
}

// One instrument playing a short phrase (for balancing instrument levels).
export async function renderInstrument(name, { midi = 64, seconds = 3, drum = null } = {}) {
  const ac = new OfflineAudioContext(1, Math.floor(SR * seconds), SR);
  const g = graph(ac);
  const seq = [0, 4, 7, 12, 7, 4, 0, 2];
  const step = 0.3;
  for (let i = 0; i < seq.length; i++) {
    const t = 0.05 + i * step;
    const p = drum ? g.inst.drum(drum, g.out, t, 1) : g.inst.play(name, g.out, t, ['drone', 'strings', 'glass', 'choir'].includes(name) ? [midi, midi + 4, midi + 7] : midi + seq[i], ['drone', 'strings', 'glass', 'choir'].includes(name) ? 2.4 : step * 0.95, 1, {});
    if (p) g.kit.commit(t, [p]);
    if (!drum && ['drone', 'strings', 'glass', 'choir'].includes(name)) break;
  }
  const buf = await ac.startRendering();
  return { name: drum ? 'drum:' + drum : name, midi, ...measure(buf, 0.05) };
}
export async function renderAllInstruments() {
  const rows = [];
  const mids = { bass: 40, horn: 57, clarinet: 60, drone: 50, strings: 55, glass: 60, choir: 57, timpani: 43, churchbell: 50, lute: 55, harp: 60, dulcimer: 62 };
  for (const n of ['lute', 'harp', 'dulcimer', 'bass', 'recorder', 'flute', 'shawm', 'clarinet', 'concertina', 'horn', 'fiddle', 'drone', 'strings', 'glass', 'choir', 'bell', 'churchbell', 'celesta', 'timpani']) rows.push(await renderInstrument(n, { midi: mids[n] ?? 72 }));
  for (const d of ['K', 'k', 'S', 's', 'T', 't', 'h', 'c', 'x', 'X', 'B', 'b', 'a', 'j', 'g']) rows.push(await renderInstrument('drum', { drum: d }));
  return rows;
}

// Each section of each piece on its own (loudness per section).
export async function renderSections(keys = Object.keys(PIECES)) {
  const { parsePiece } = await import('./music.js');
  const rows = [];
  for (const key of keys) {
    const P = parsePiece(key);
    for (const name of Object.keys(P.sec)) {
      const bars = P.sec[name].bars;
      const secs = Math.min(24, bars * (60 / P.def.bpm) * P.def.beats + 0.5);
      const r = await renderMusic(key, secs, { queue: [name] });
      rows.push({ key: r.key, rmsDb: r.rmsDb, peakDb: r.peakDb, minWinDb: r.minWinDb, maxWinDb: r.maxWinDb, clip: r.clip, nan: r.nan });
    }
  }
  return rows;
}
