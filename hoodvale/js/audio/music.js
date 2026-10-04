// Music conductor: plays the procedural pieces in pieces.js on a bar-by-bar lookahead schedule,
// crossfades between pieces, varies phrases (lead rotation, ornaments, passing tones, generative
// counter-melodies, optional layers, drum fills, breathing rests) and fades a combat layer in and
// out on the same tempo grid. Owner: audio builder.
//
// API: setPiece(key | null, { fade }), setCombat(level 0..1), update(until?) (pass `until` to
// pre-schedule an offline render), current, stats(), strike(name) (one-off accent on the bus).

import { PIECES } from './pieces.js';
import { MODES, degMidi, rand, pick, clamp } from './kit.js';

const LOOKAHEAD = 0.3;

// ---------------------------------------------------------------- parsing (cached per piece)
function parseMelody(str, barSteps, where) {
  return str.split('|').map((bar, bi) => {
    const notes = [];
    let s = 0;
    for (const tok of bar.trim().split(/\s+/)) {
      if (!tok) continue;
      const [a, b] = tok.split(':');
      const d = b ? Number(b) : 1;
      if (a !== 'r') {
        const m = /^(-?\d+)([#b]?)$/.exec(a);
        if (!m) throw new Error(`[music] bad melody token ${tok} in ${where}`);
        notes.push({ s, d, deg: Number(m[1]), alt: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0 });
      }
      s += d;
    }
    if (s !== barSteps) console.warn(`[music] ${where} bar ${bi + 1} has ${s} steps (want ${barSteps})`);
    return notes;
  });
}

function parsePattern(str) {
  return str.trim().split(/\s+/).map((tok) => {
    if (tok === '.' || tok === '_') return null;
    if (/^[xXu]$/.test(tok)) return { strum: tok };
    const m = /^(\d+)([',]*)([!?]?)$/.exec(tok);
    if (!m) return null;
    let oct = 0;
    for (const c of m[2]) oct += c === "'" ? 1 : -1;
    return { k: Number(m[1]), oct, vel: m[3] === '!' ? 1.2 : m[3] === '?' ? 0.55 : 1 };
  });
}

function parseDrums(obj) {
  const out = {};
  for (const [letter, str] of Object.entries(obj)) {
    out[letter] = str.trim().split(/\s+/).map((t) => (t === 'x' ? 1 : t === 'X' ? 1.3 : t === 'o' ? 0.5 : 0));
  }
  return out;
}

function parseChord(spec) {
  return String(spec).trim().split(/\s+/).map((tok) => {
    const m = /^(-?\d+)([Mm7]*)$/.exec(tok);
    return m ? { deg: Number(m[1]), q: m[2] } : { deg: 0, q: '' };
  });
}

const PARSED = new Map();
export function parsePiece(key) {
  if (PARSED.has(key)) return PARSED.get(key);
  const def = PIECES[key];
  if (!def) return null;
  const barSteps = def.beats * def.sub;
  const mode = MODES[def.mode] || MODES.ionian;
  const pat = {};
  for (const [name, v] of Object.entries(def.pat || {})) pat[name] = typeof v === 'string' ? parsePattern(v) : parseDrums(v);
  const sec = {};
  const sections = { ...def.sec };
  if (def.rest) sections._rest = def.rest;
  for (const [name, s] of Object.entries(sections)) {
    sec[name] = {
      ...s,
      chords: (s.chords || [0]).map(parseChord),
      mel: (s.mel || []).map((m, i) => parseMelody(m, barSteps, `${key}.${name}[${i}]`)),
    };
  }
  const p = { key, def, barSteps, mode, pat, sec };
  PARSED.set(key, p);
  return p;
}

// Chord (scale degree + quality) -> tones in semitones relative to the piece tonic.
function chordInfo(mode, c) {
  const r = degMidi(0, mode, c.deg);
  let rootOff = ((r % 12) + 12) % 12;
  if (rootOff > 6) rootOff -= 12;
  const third = c.q.includes('M') ? 4 : c.q.includes('m') ? 3 : degMidi(0, mode, c.deg + 2) - r;
  const fifth = degMidi(0, mode, c.deg + 4) - r;
  const tones = [0, third, fifth];
  if (c.q.includes('7')) tones.push(degMidi(0, mode, c.deg + 6) - r);
  // Chord as scale degrees too (for generative lines).
  const degs = [c.deg, c.deg + 2, c.deg + 4];
  return { rootOff, tones, degs, deg: c.deg };
}
const toneMidi = (base, ch, k) => base + ch.rootOff + ch.tones[k % ch.tones.length] + 12 * Math.floor(k / ch.tones.length);

const RHYTHMS = {
  8: [[2, 2, 2, 2], [3, 1, 2, 2], [1, 1, 2, 4], [4, 2, 2], [2, 1, 1, 4], [2, 2, 4], [2, 1, 1, 2, 2], [3, 3, 2]],
  6: [[2, 1, 2, 1], [3, 3], [2, 2, 2], [1, 1, 1, 3], [3, 2, 1], [4, 2]],
};

export function createMusic(kit, inst, out, counters) {
  const { ac } = kit;
  let cur = null;
  let combat = 0;
  const fading = [];

  // ---------------------------------------------------------------- piece state
  function newState(key, start) {
    const P = parsePiece(key);
    const def = P.def;
    const bus = kit.gain(0.0001);
    bus.connect(out.dry);
    if (out.wet) bus.connect(out.wet);
    const combatBus = kit.gain(def.alwaysCombat ? 1 : 0.0001);
    combatBus.connect(bus);
    const chans = {};
    const chDefs = { ...def.ch };
    if (def.combat && !chDefs.cperc) chDefs.cperc = { inst: 'drums', level: 0.8, combat: true };
    if (def.combat && !chDefs.cbass) chDefs.cbass = { inst: 'bass', oct: -1, level: 0.8, combat: true };
    for (const [name, cfg] of Object.entries(chDefs)) {
      const g = kit.gain(cfg.level ?? 1);
      const p = kit.panner(cfg.pan ?? 0);
      g.connect(p);
      p.connect(cfg.combat ? combatBus : bus);
      chans[name] = { cfg, node: g, nodes: [g, p] };
    }
    const stepDur = 60 / def.bpm / def.sub;
    return {
      key, P, def, bus, combatBus, chans, stepDur, barDur: stepDur * P.barSteps,
      nextBar: start, section: null, secName: '', bar: 0, barCount: 0, queue: [], passes: {}, lastForm: -1, formCount: 0,
      arr: {}, leadInst: null, mel: null, melShift: 0, orn: 0.1, imp: {}, legato: {}, combatOn: !!def.alwaysCombat,
    };
  }

  function planForm(st) {
    const forms = st.def.forms;
    let i = (Math.random() * forms.length) | 0;
    if (forms.length > 1 && i === st.lastForm) i = (i + 1 + ((Math.random() * (forms.length - 1)) | 0)) % forms.length;
    st.lastForm = i;
    if (st.formCount > 0 && st.P.sec._rest && Math.random() < (st.def.restChance ?? 0.55)) st.queue.push('_rest');
    st.queue.push(...forms[i]);
    st.formCount++;
  }

  function nextSection(st) {
    if (!st.queue.length) planForm(st);
    const name = st.queue.shift();
    const sec = st.P.sec[name];
    st.secName = name;
    st.section = sec;
    st.bar = 0;
    const pass = (st.passes[name] = (st.passes[name] ?? -1) + 1);
    st.arr = {};
    for (const [ch, v] of Object.entries(sec.play || {})) {
      const val = Array.isArray(v) ? pick(v) : v;
      if (val && st.chans[ch]) st.arr[ch] = val;
    }
    // A later pass sometimes thickens the texture with a harmony line.
    if (pass > 0 && sec.mel?.length && st.chans.lead2 && !st.arr.lead2 && Math.random() < 0.3) st.arr.lead2 = 'harm';
    const leads = sec.lead || st.def.leads || [st.chans.lead?.cfg.inst];
    st.leadInst = leads[(pass + st.formCount) % leads.length] || st.chans.lead?.cfg.inst;
    st.mel = sec.mel?.length ? sec.mel[pass % sec.mel.length] : null;
    st.orn = pass > 0 ? 0.24 : 0.1;
    st.legato = {};
    st.melShift = st.mel ? fitShift(st, st.mel, st.leadInst, st.chans.lead?.cfg.oct ?? 1) : 0;
  }

  // Octave shift (in semitones) that keeps a whole phrase inside the instrument's range.
  function fitShift(st, mel, instName, oct) {
    const r = inst.RANGE[instName];
    if (!r) return 0;
    let lo = Infinity, hi = -Infinity;
    for (const bar of mel) for (const n of bar) {
      const m = degMidi(st.def.root + 12 * oct, st.P.mode, n.deg, n.alt);
      lo = Math.min(lo, m); hi = Math.max(hi, m);
    }
    if (!Number.isFinite(lo)) return 0;
    let shift = 0;
    while (lo + shift < r[0]) shift += 12;
    while (hi + shift > r[1] + 2 && lo + shift - 12 >= r[0] - 7) shift -= 12;
    return shift;
  }

  // ---------------------------------------------------------------- scheduling
  function stepTime(st, t0, s) {
    const sw = st.def.sub === 2 && s % 2 === 1 ? (st.def.swing || 0) * st.stepDur : 0;
    return t0 + s * st.stepDur + sw + rand(-0.005, 0.005);
  }
  const accent = (st, s) => (s === 0 ? 1 : s % st.def.sub === 0 ? 0.88 : 0.74) * rand(0.92, 1.05);

  function note(st, chName, instName, t, midi, dur, vel, o) {
    const ch = st.chans[chName];
    if (!ch) return;
    const cfg = ch.cfg;
    const p = inst.play(instName, ch.node, t, midi, dur, vel, { vowel: cfg.vowel, bright: cfg.bright, ...o });
    if (p) kit.commit(t, [p]);
  }

  function chordsForBar(st, sec, bi) {
    const specs = sec.chords[bi % sec.chords.length];
    const n = specs.length;
    return specs.map((c, i) => ({ ...chordInfo(st.P.mode, c), from: Math.floor((i * st.P.barSteps) / n), to: Math.floor(((i + 1) * st.P.barSteps) / n) }));
  }
  const chordAt = (chords, s) => chords.find((c) => s >= c.from && s < c.to) || chords[0];

  function playMelody(st, chName, mode, t0, bi) {
    const bar = st.mel?.[bi];
    if (!bar) return;
    const ch = st.chans[chName];
    const isLead = chName === 'lead';
    const instName = isLead ? st.leadInst : ch.cfg.inst;
    const oct = ch.cfg.oct ?? 1;
    const base = st.def.root + 12 * oct;
    const shift = isLead ? st.melShift : fitShift(st, st.mel, instName, oct) - (mode === 'oct' ? 12 : 0);
    const legato = inst.LEGATO.has(instName);
    const lastBar = bi === st.section.bars - 1;
    const absBar = st.barCount * st.P.barSteps;
    for (let i = 0; i < bar.length; i++) {
      const n = bar[i];
      const deg = n.deg + (mode === 'harm' ? -2 : 0);
      let midi = degMidi(base, st.P.mode, deg, mode === 'harm' ? 0 : n.alt) + shift;
      const t = stepTime(st, t0, n.s);
      let durS = n.d * st.stepDur;
      const vel = (isLead ? 1 : 0.85) * accent(st, n.s);
      const prev = st.legato[chName];
      const slurred = legato && prev && prev.end === absBar + n.s && Math.abs(prev.midi - midi) <= 7;
      let from = slurred ? prev.midi : null;
      const next = bar[i + 1];
      // Ornaments on later passes: a grace note from above, or a passing tone into the next note.
      if (isLead && legato && n.d >= 2 && !(lastBar && i === bar.length - 1) && Math.random() < st.orn) {
        if (next && Math.abs(next.deg - n.deg) === 2 && Math.random() < 0.55) {
          const passMidi = degMidi(base, st.P.mode, n.deg + Math.sign(next.deg - n.deg), 0) + shift;
          const d1 = durS - st.stepDur;
          note(st, chName, instName, t, midi, d1 + 0.02, vel, { from });
          note(st, chName, instName, t + d1, passMidi, st.stepDur * 0.98, vel * 0.8, { from: midi });
          st.legato[chName] = { end: absBar + n.s + n.d, midi: passMidi };
          continue;
        }
        const grace = degMidi(base, st.P.mode, n.deg + 1, 0) + shift;
        note(st, chName, instName, t - 0.06, grace, 0.07, vel * 0.7, { from });
        from = grace;
      }
      const legatoNext = next && next.s === n.s + n.d;
      durS = legato && legatoNext ? durS + 0.02 : durS * 0.93;
      note(st, chName, instName, t, midi, durS, vel, { from });
      st.legato[chName] = { end: absBar + n.s + n.d, midi };
    }
  }

  function playImprov(st, chName, t0, chords, bi) {
    const ch = st.chans[chName];
    const cfg = ch.cfg;
    const instName = cfg.inst;
    const base = st.def.root + 12 * (cfg.oct ?? 1);
    const rhythms = RHYTHMS[st.P.barSteps] || [[st.def.sub, st.def.sub]];
    const rh = pick(rhythms);
    const lastBar = bi === st.section.bars - 1;
    let s = 0;
    let deg = st.imp[chName] ?? 4;
    const legato = inst.LEGATO.has(instName);
    let prevMidi = null;
    for (let i = 0; i < rh.length; i++) {
      const d = rh[i];
      if (s > 0 && Math.random() < 0.13) { s += d; prevMidi = null; continue; }
      const c = chordAt(chords, s);
      const finalNote = lastBar && i === rh.length - 1;
      if (finalNote) deg = nearest(c.degs[0], deg);
      else if (s % st.def.sub === 0) deg = nearest(pick(c.degs), deg + pick([-1, 0, 0, 1]));
      else deg += pick([-1, 1, -1, 1, 2, -2]);
      deg = clamp(deg, 0, 9);
      const midi = inst.fit(instName, degMidi(base, st.P.mode, deg));
      const durS = d * st.stepDur * (legato ? 1.0 : 0.9);
      note(st, chName, instName, stepTime(st, t0, s), midi, durS, 0.75 * accent(st, s), { from: legato ? prevMidi : null });
      prevMidi = midi;
      s += d;
    }
    st.imp[chName] = deg;
  }
  // Same scale degree class as `target`, in the octave nearest to `near`.
  function nearest(target, near) {
    let best = target, bd = Infinity;
    for (let o = -2; o <= 2; o++) {
      const d = target + 7 * o;
      if (Math.abs(d - near) < bd) { bd = Math.abs(d - near); best = d; }
    }
    return best;
  }

  function playPattern(st, chName, pat, t0, chords, bi, sec) {
    const ch = st.chans[chName];
    const cfg = ch.cfg;
    const busy = counters.voices > 120;
    if (cfg.inst === 'drums') {
      const lastBar = bi === sec.bars - 1;
      const fill = lastBar && st.def.fills !== false && Math.random() < 0.45;
      const B = st.P.barSteps, sub = st.def.sub;
      for (const [letter, steps] of Object.entries(pat)) {
        for (let s = 0; s < steps.length; s++) {
          if (fill && s >= B - sub && letter !== 'K' && letter !== 'B' && letter !== 'x') continue;
          const v = steps[s];
          if (!v || (busy && v < 1)) continue;
          const t = stepTime(st, t0, s);
          const p = inst.drum(letter, ch.node, t, v * rand(0.88, 1.05));
          if (p) kit.commit(t, [p]);
        }
      }
      if (fill) {
        const sn = Object.keys(pat).includes('x') ? 'x' : 'S';
        for (let s = B - sub; s < B; s++) for (let h = 0; h < 2; h++) {
          const t = t0 + (s + h * 0.5) * st.stepDur;
          const p = inst.drum(sn, ch.node, t, 0.45 + 0.4 * ((s - (B - sub)) * 2 + h) / (sub * 2));
          if (p) kit.commit(t, [p]);
        }
      }
      return;
    }
    if (!Array.isArray(pat)) return;
    const base = st.def.root + 12 * (cfg.oct ?? 0);
    for (let s = 0; s < pat.length; s++) {
      const tok = pat[s];
      if (!tok) continue;
      if (busy && chName !== 'bass' && Math.random() < 0.5) continue;
      const c = chordAt(chords, s);
      const t = stepTime(st, t0, s);
      if (tok.strum) {
        const up = tok.strum === 'u';
        const ks = up ? [3, 2, 1] : [0, 1, 2, 3];
        const vel = (tok.strum === 'X' ? 1.1 : up ? 0.6 : 0.85) * accent(st, s);
        ks.forEach((k, i) => note(st, chName, cfg.inst, t + i * 0.014, toneMidi(base, c, k), st.stepDur * 1.6, vel * (1 - i * 0.06)));
        continue;
      }
      // Hold until the next token in the bar.
      let len = 1;
      while (s + len < pat.length && !pat[s + len]) len++;
      const midi = toneMidi(base, c, tok.k) + 12 * tok.oct;
      note(st, chName, cfg.inst, t, midi, len * st.stepDur, tok.vel * accent(st, s) * 0.9);
    }
  }

  function playSustain(st, chName, kind, t0, chords, bi, sec) {
    const ch = st.chans[chName];
    const cfg = ch.cfg;
    const base = st.def.root + 12 * (cfg.oct ?? 0);
    if (kind === 'drone') {
      if (bi !== 0) return;
      const dur = sec.bars * st.barDur + 0.6;
      note(st, chName, cfg.inst, t0, [base, base + 7], dur, 0.9);
      return;
    }
    if (kind === 'sprinkle') {
      const p = cfg.p ?? 0.1;
      for (let s = 0; s < st.P.barSteps; s++) {
        if (Math.random() > p) continue;
        const c = chordAt(chords, s);
        note(st, chName, cfg.inst, stepTime(st, t0, s), toneMidi(base, c, 2 + ((Math.random() * 5) | 0)), st.stepDur * 2, rand(0.45, 0.9));
      }
      return;
    }
    // Pads: one sustained chord per run of identical chords (split bars: per half).
    const specs = sec.chords;
    const same = (a, b) => JSON.stringify(specs[a % specs.length]) === JSON.stringify(specs[b % specs.length]);
    if (chords.length > 1) {
      for (const c of chords) {
        const midis = c.tones.slice(0, 3).map((x) => base + c.rootOff + x);
        note(st, chName, cfg.inst, t0 + c.from * st.stepDur, midis, (c.to - c.from) * st.stepDur + 0.1, 0.85, { attack: 0.08, release: 0.5 });
      }
      return;
    }
    if (bi > 0 && same(bi, bi - 1)) return;
    let run = 1;
    while (bi + run < sec.bars && same(bi + run, bi) && specs[(bi + run) % specs.length].length === 1) run++;
    const c = chords[0];
    const midis = c.tones.slice(0, 3).map((x) => base + c.rootOff + x);
    note(st, chName, cfg.inst, t0, midis, run * st.barDur + 0.15, 0.85);
  }

  function playChannel(st, chName, val, t0, chords, bi, sec) {
    if (val === 'mel' || val === 'harm' || val === 'oct') return playMelody(st, chName, val, t0, bi);
    if (val === 'improv') return playImprov(st, chName, t0, chords, bi);
    if (val === 'drone' || val === 'pad' || val === 'sprinkle') return playSustain(st, chName, val, t0, chords, bi, sec);
    const pat = st.P.pat[val];
    if (pat) playPattern(st, chName, pat, t0, chords, bi, sec);
  }

  function scheduleBar(st, t0) {
    if (!st.section || st.bar >= st.section.bars) nextSection(st);
    const sec = st.section;
    const bi = st.bar;
    const chords = chordsForBar(st, sec, bi);
    for (const [ch, val] of Object.entries(st.arr)) {
      try { playChannel(st, ch, val, t0, chords, bi, sec); } catch (err) { console.warn('[music]', st.key, ch, err); }
    }
    // Combat layer: scheduled only while it is (becoming) audible.
    const cplay = st.def.combat?.play;
    if (cplay && (st.combatOn || st.def.alwaysCombat)) {
      for (const [ch, val] of Object.entries(cplay)) {
        if (!st.chans[ch]) continue;
        const pat = st.P.pat[val];
        if (pat) playPattern(st, ch, pat, t0, chords, bi, sec);
      }
    }
    st.bar++;
    st.barCount++;
  }

  function fadeOut(st, fade) {
    const now = ac.currentTime;
    const g = st.bus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(0.0001, now + fade);
    st.dead = now + fade + 4;
    fading.push(st);
  }

  const music = {
    get current() { return cur?.key ?? null; },
    get section() { return cur?.secName ?? ''; },
    setPiece(key, { fade = 3, queue = null } = {}) {
      if (key && !PIECES[key]) key = null;
      if ((cur?.key ?? null) === key) return;
      const now = ac.currentTime;
      // Start the new piece on the old piece's next bar line (or soon) so the crossfade breathes.
      let start = now + 0.12;
      if (cur && cur.nextBar > now && cur.nextBar - now < 1.5) start = cur.nextBar;
      if (cur) fadeOut(cur, fade * 0.8);
      cur = key ? newState(key, start) : null;
      if (cur) {
        const g = cur.bus.gain;
        g.setValueAtTime(0.0001, now);
        g.linearRampToValueAtTime(cur.def.gain ?? 1, now + Math.max(0.05, fade));
        if (queue) { cur.queue = [...queue]; cur.formCount = 1; }
        cur.combatOn = combat > 0.01 || !!cur.def.alwaysCombat;
        if (!cur.def.alwaysCombat) cur.combatBus.gain.setValueAtTime(Math.max(0.0001, combat), now);
      }
    },
    setCombat(level) {
      combat = clamp(level, 0, 1);
      if (!cur || cur.def.alwaysCombat) return;
      const now = ac.currentTime;
      if (combat > 0.01) cur.combatOn = true;
      cur.combatBus.gain.setTargetAtTime(Math.max(0.0001, combat), now, combat > 0.5 ? 0.5 : 1.4);
      if (combat <= 0.01) cur.combatOffAt = now + 5;
    },
    update(until) {
      const now = ac.currentTime;
      for (let i = fading.length - 1; i >= 0; i--) {
        const st = fading[i];
        if (now > st.dead) {
          for (const c of Object.values(st.chans)) for (const n of c.nodes) { try { n.disconnect(); } catch { /* ignore */ } }
          try { st.bus.disconnect(); st.combatBus.disconnect(); } catch { /* ignore */ }
          fading.splice(i, 1);
        }
      }
      if (!cur) return;
      if (cur.combatOffAt && now > cur.combatOffAt && combat <= 0.01) { cur.combatOn = false; cur.combatOffAt = 0; }
      if (until == null && cur.nextBar < now - 0.5) cur.nextBar = now + 0.05; // resync after a stall
      const horizon = until ?? now + LOOKAHEAD;
      const max = until != null ? 2000 : 4;
      let guard = 0;
      while (cur.nextBar < horizon && guard++ < max) {
        scheduleBar(cur, cur.nextBar);
        cur.nextBar += cur.barDur;
      }
    },
    stats() {
      return { key: cur?.key ?? null, title: cur?.def.title ?? '', section: cur?.secName ?? '', bar: cur?.bar ?? 0, lead: cur?.leadInst ?? null, combat: +combat.toFixed(2), fading: fading.length };
    },
  };
  return music;
}
