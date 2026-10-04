// Synthesized medieval instruments shared by the music and the fanfares/jingles in SFX.
// Every function: (dest, t, midi, dur, vel, opts) -> part { srcs, nodes, end } (the caller
// commits it with kit.commit so the nodes free themselves). Owner: audio builder.
//
// Plucked: lute, harp, dulcimer, bass (Karplus-Strong buffers). Winds: recorder, flute, shawm,
// clarinet, concertina, horn. Bowed: fiddle. Sustained: drone, strings, glass, choir (chords:
// midi may be an array). Struck: bell (glass FM), churchbell, celesta, timpani.
// Percussion: drum(letter, ...) — K/k frame drum, S/s tabor, T/t tambourine, h shaker,
// c wood clack, x/X stomp, B/b big drum, a anvil tink, j jingle, C cymbal swell, g gong.

import { mtof, rand, clamp, pick, createKit } from './kit.js';

export function createInstruments(kit, { prerender = true } = {}) {
  const NG = 3; // filtered noise is quieter than a sine at the same peak

  const part = (srcs, nodes, end) => ({ srcs, nodes, end });

  // Vibrato LFO into one or more detune params, fading in after `delay`.
  function vibrato(t, params, rate, cents, delay, dur) {
    const lfo = kit.osc('sine', rate * rand(0.95, 1.05));
    const g = kit.gain(0);
    lfo.connect(g);
    for (const p of params) g.connect(p);
    g.gain.setValueAtTime(0, t);
    g.gain.setValueAtTime(0, t + delay);
    g.gain.linearRampToValueAtTime(cents, t + delay + Math.max(0.15, dur * 0.4));
    return [lfo, g];
  }

  // Slur: glide from the previous note's pitch.
  function glideFrom(t, freqParams, from, f, time = 0.045) {
    if (!from) return;
    const ff = mtof(from);
    for (const [p, mul] of freqParams) {
      p.setValueAtTime(ff * mul, t);
      p.exponentialRampToValueAtTime(f * mul, t + time);
    }
  }

  // Sustain envelope with attack, slight settle and release.
  function sustainEnv(param, t, a, peak, dur, rel, settle = 0.85) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.setTargetAtTime(peak * settle, t + a, 0.2);
    const off = Math.max(t + a + 0.01, t + dur);
    param.setTargetAtTime(0.0001, off, rel / 3);
    return off + rel * 2.3;
  }

  // ---------------------------------------------------------------- plucked strings
  function plucked(type, level, ringMax) {
    return (dest, t, midi, dur, vel = 1, o = {}) => {
      const p = kit.pluck(type, midi);
      const s = kit.src(p.buffer, false, p.rate * (o.detune ? Math.pow(2, o.detune / 1200) : 1));
      s._t = t;
      const g = kit.gain(0);
      s.connect(g); g.connect(dest);
      const len = p.buffer.duration / s.playbackRate.value;
      const ring = o.ring ?? ringMax;
      const end = t + Math.min(len, Math.max(dur + 0.15, ring));
      const v = level * vel;
      g.gain.setValueAtTime(v, t);
      g.gain.setValueAtTime(v, Math.max(t, end - 0.12));
      g.gain.linearRampToValueAtTime(0.0001, end);
      return part([s], [g], end);
    };
  }
  const lute = plucked('lute', 0.36, 1.3);
  const bass = plucked('bass', 0.36, 1.2);
  const harpString = plucked('harp', 0.23, 2.8);
  function harp(dest, t, midi, dur, vel = 1, o = {}) {
    const a = harpString(dest, t, midi, dur, vel, o);
    // A soft sine body under the string for warmth.
    const f = mtof(midi);
    const sn = kit.osc('sine', f);
    const g = kit.gain(0);
    sn.connect(g); g.connect(dest);
    const end = kit.perc(g.gain, t, 0.004, 0.065 * vel, Math.min(2.2, a.end - t));
    return part([...a.srcs, sn], [...a.nodes, g], Math.max(a.end, end));
  }
  function dulcimer(dest, t, midi, dur, vel = 1, o = {}) {
    // Two detuned courses struck together.
    const a = plucked('dulcimer', 0.3, 1.8)(dest, t, midi, dur, vel, { ...o, detune: -3 });
    const b = plucked('dulcimer', 0.26, 1.8)(dest, t + 0.004, midi, dur, vel, { ...o, detune: 4 });
    return part([...a.srcs, ...b.srcs], [...a.nodes, ...b.nodes], Math.max(a.end, b.end));
  }

  // ---------------------------------------------------------------- winds
  function recorder(dest, t, midi, dur, vel = 1, o = {}) {
    const f = mtof(midi);
    const o1 = kit.osc('sine', f), o2 = kit.osc('triangle', f);
    const g2 = kit.gain(0.32);
    const lp = kit.filter('lowpass', Math.min(f * 3.5, 9000), 0.6);
    const amp = kit.gain(0);
    o1.connect(amp); o2.connect(g2); g2.connect(lp); lp.connect(amp); amp.connect(dest);
    glideFrom(t, [[o1.frequency, 1], [o2.frequency, 1]], o.from, f);
    const srcs = [o1, o2], nodes = [g2, lp, amp];
    if (dur > 0.4) { const v = vibrato(t, [o1.detune, o2.detune], 5.2, 13, 0.22, dur); srcs.push(v[0]); nodes.push(v[1]); }
    if (!o.from) { // chiff
      const ch = kit.noiseSrc(); const cf = kit.filter('bandpass', Math.min(f * 3, 9000), 2.2); const cg = kit.gain(0);
      ch.connect(cf); cf.connect(cg); cg.connect(amp);
      kit.perc(cg.gain, t, 0.004, 0.25 * vel, 0.05);
      srcs.push(ch); nodes.push(cf, cg);
    }
    const end = sustainEnv(amp.gain, t, o.from ? 0.02 : 0.025, 0.085 * vel, dur, 0.09, 0.82);
    return part(srcs, nodes, end);
  }

  function flute(dest, t, midi, dur, vel = 1, o = {}) {
    const f = mtof(midi);
    const o1 = kit.osc('sine', f), o2 = kit.osc('sine', f * 2);
    const g2 = kit.gain(0.12);
    const amp = kit.gain(0);
    o1.connect(amp); o2.connect(g2); g2.connect(amp); amp.connect(dest);
    glideFrom(t, [[o1.frequency, 1], [o2.frequency, 2]], o.from, f, 0.06);
    const br = kit.noiseSrc(kit.noise, 1, true);
    const bf = kit.filter('bandpass', f * 2, 3);
    const bg = kit.gain(0.2);
    br.connect(bf); bf.connect(bg); bg.connect(amp);
    const srcs = [o1, o2, br], nodes = [g2, amp, bf, bg];
    if (dur > 0.35) { const v = vibrato(t, [o1.detune, o2.detune], 4.9, 17, 0.18, dur); srcs.push(v[0]); nodes.push(v[1]); }
    const end = sustainEnv(amp.gain, t, o.from ? 0.03 : 0.07, 0.105 * vel, dur, 0.14, 0.88);
    return part(srcs, nodes, end);
  }

  function shawm(dest, t, midi, dur, vel = 1, o = {}) {
    const f = mtof(midi);
    const o1 = kit.osc('shawm', f);
    const bp = kit.filter('peaking', 1300, 0.9, 5);
    const lp = kit.filter('lowpass', 4200, 0.7);
    const amp = kit.gain(0);
    o1.connect(bp); bp.connect(lp); lp.connect(amp); amp.connect(dest);
    glideFrom(t, [[o1.frequency, 1]], o.from, f, 0.035);
    const srcs = [o1], nodes = [bp, lp, amp];
    if (dur > 0.4) { const v = vibrato(t, [o1.detune], 5.8, 9, 0.2, dur); srcs.push(v[0]); nodes.push(v[1]); }
    const end = sustainEnv(amp.gain, t, 0.025, 0.1 * vel, dur, 0.08, 0.9);
    return part(srcs, nodes, end);
  }

  function clarinet(dest, t, midi, dur, vel = 1, o = {}) {
    const f = mtof(midi);
    const o1 = kit.osc('clarinet', f);
    const lp = kit.filter('lowpass', Math.min(2600, f * 6), 0.7);
    const amp = kit.gain(0);
    o1.connect(lp); lp.connect(amp); amp.connect(dest);
    glideFrom(t, [[o1.frequency, 1]], o.from, f, 0.06);
    const srcs = [o1], nodes = [lp, amp];
    if (dur > 0.5) { const v = vibrato(t, [o1.detune], 4.6, 8, 0.3, dur); srcs.push(v[0]); nodes.push(v[1]); }
    const end = sustainEnv(amp.gain, t, 0.06, 0.105 * vel, dur, 0.15, 0.85);
    return part(srcs, nodes, end);
  }

  function concertina(dest, t, midi, dur, vel = 1, o = {}) {
    const f = mtof(midi);
    const a = kit.osc('reed', f), b = kit.osc('reed', f);
    b.detune.value = 7;
    const lp = kit.filter('lowpass', 2700, 0.8);
    const amp = kit.gain(0);
    a.connect(lp); b.connect(lp); lp.connect(amp); amp.connect(dest);
    glideFrom(t, [[a.frequency, 1], [b.frequency, 1]], o.from, f, 0.03);
    const end = sustainEnv(amp.gain, t, 0.03, 0.1 * vel, dur, 0.07, 0.9);
    return part([a, b], [lp, amp], end);
  }

  function horn(dest, t, midi, dur, vel = 1, o = {}) {
    const f = mtof(midi);
    const o1 = kit.osc('horn', f), o2 = kit.osc('triangle', f * 0.5);
    const g2 = kit.gain(0.35);
    const lp = kit.filter('lowpass', f * 1.5, 1.1);
    const amp = kit.gain(0);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(amp); amp.connect(dest);
    glideFrom(t, [[o1.frequency, 1], [o2.frequency, 0.5]], o.from, f, 0.05);
    if (!o.from) { o1.detune.setValueAtTime(-45, t); o1.detune.linearRampToValueAtTime(0, t + 0.07); }
    const bright = 3 + 3 * vel;
    lp.frequency.setValueAtTime(f * 1.4, t);
    lp.frequency.linearRampToValueAtTime(Math.min(7000, f * bright), t + 0.09);
    lp.frequency.setTargetAtTime(Math.min(5000, f * bright * 0.65), t + 0.1, 0.25);
    const srcs = [o1, o2], nodes = [g2, lp, amp];
    if (dur > 0.6) { const v = vibrato(t, [o1.detune], 4.8, 7, 0.35, dur); srcs.push(v[0]); nodes.push(v[1]); }
    const end = sustainEnv(amp.gain, t, o.from ? 0.03 : 0.06, 0.13 * vel, dur, 0.16, 0.9);
    return part(srcs, nodes, end);
  }

  // ---------------------------------------------------------------- bowed
  function fiddle(dest, t, midi, dur, vel = 1, o = {}) {
    const f = mtof(midi);
    if (dur < 0.3 && !o.from) { // staccato: one bowed saw through the body filter
      const a = kit.osc('sawtooth', f);
      const lp = kit.filter('lowpass', 2000 + 900 * vel, 0.9);
      const amp = kit.gain(0);
      a.connect(lp); lp.connect(amp); amp.connect(dest);
      const end = sustainEnv(amp.gain, t, 0.03, 0.1 * vel, dur, 0.08, 0.8);
      return part([a], [lp, amp], end);
    }
    const a = kit.osc('sawtooth', f), b = kit.osc('sawtooth', f);
    a.detune.value = -5; b.detune.value = 5;
    const lp = kit.filter('lowpass', 2400 + 900 * vel, 0.7);
    const body = kit.filter('peaking', 950, 1.1, 5);
    const amp = kit.gain(0);
    a.connect(lp); b.connect(lp); lp.connect(body); body.connect(amp); amp.connect(dest);
    glideFrom(t, [[a.frequency, 1], [b.frequency, 1]], o.from, f, 0.05);
    const srcs = [a, b], nodes = [lp, body, amp];
    if (dur > 0.35) { const v = vibrato(t, [a.detune, b.detune], 5.6, 15, 0.16, dur); srcs.push(v[0]); nodes.push(v[1]); }
    const end = sustainEnv(amp.gain, t, o.from ? 0.04 : 0.07, 0.075 * vel, dur, 0.12, 0.85);
    return part(srcs, nodes, end);
  }

  // ---------------------------------------------------------------- sustained chords
  const list = (m) => (Array.isArray(m) ? m : [m]);

  function drone(dest, t, midi, dur, vel = 1, o = {}) {
    const lp = kit.filter('lowpass', o.bright ? 1900 : 950, 0.8);
    const amp = kit.gain(0);
    lp.connect(amp); amp.connect(dest);
    const srcs = [];
    for (const m of list(midi)) {
      const os = kit.osc(o.bright ? 'shawm' : 'sawtooth', mtof(m));
      os.detune.value = rand(-4, 4);
      os.connect(lp);
      srcs.push(os);
    }
    // Slow swell of the filter so long drones breathe.
    const lfo = kit.osc('sine', rand(0.07, 0.12));
    const lg = kit.gain(o.bright ? 400 : 250);
    lfo.connect(lg); lg.connect(lp.frequency);
    srcs.push(lfo);
    const end = kit.ahr(amp.gain, t, Math.min(1.2, dur * 0.3), (o.bright ? 0.048 : 0.066) * vel / Math.sqrt(list(midi).length), Math.max(0, dur - 1.2), 1.3);
    return part(srcs, [lp, amp, lg], end);
  }

  function strings(dest, t, midi, dur, vel = 1, o = {}) {
    const lp = kit.filter('lowpass', 900 + 700 * vel, 0.6);
    const amp = kit.gain(0);
    lp.connect(amp); amp.connect(dest);
    const srcs = [];
    const ms = list(midi);
    for (const m of ms) for (const det of [-8, 0, 8]) {
      const os = kit.osc('sawtooth', mtof(m));
      os.detune.value = det + rand(-2, 2);
      os.connect(lp);
      srcs.push(os);
    }
    const att = o.attack ?? Math.min(0.8, dur * 0.35);
    const end = kit.ahr(amp.gain, t, att, 0.072 * vel / Math.sqrt(ms.length * 3), Math.max(0, dur - att), o.release ?? 1.1);
    return part(srcs, [lp, amp], end);
  }

  function glass(dest, t, midi, dur, vel = 1, o = {}) {
    const amp = kit.gain(0);
    const trem = kit.gain(1);
    amp.connect(trem); trem.connect(dest);
    const lfo = kit.osc('sine', rand(0.25, 0.45));
    const lg = kit.gain(0.25);
    lfo.connect(lg); lg.connect(trem.gain);
    const srcs = [lfo], nodes = [amp, trem, lg];
    const ms = list(midi);
    for (const m of ms) {
      const f = mtof(m);
      const a = kit.osc('sine', f), b = kit.osc('sine', f * 2.003), c = kit.osc('triangle', f * 0.999);
      const gb = kit.gain(0.22), gc = kit.gain(0.3);
      a.connect(amp); b.connect(gb); gb.connect(amp); c.connect(gc); gc.connect(amp);
      srcs.push(a, b, c); nodes.push(gb, gc);
    }
    const att = Math.min(1.4, dur * 0.4);
    const end = kit.ahr(amp.gain, t, att, 0.05 * vel / Math.sqrt(ms.length), Math.max(0, dur - att), o.release ?? 1.6);
    return part(srcs, nodes, end);
  }

  const VOWELS = { ah: [[730, 1], [1090, 0.5], [2440, 0.18]], oo: [[320, 1], [800, 0.35], [2240, 0.08]], oh: [[500, 1], [880, 0.45], [2400, 0.12]], eh: [[530, 1], [1840, 0.4], [2480, 0.15]] };
  function choir(dest, t, midi, dur, vel = 1, o = {}) {
    const mix = kit.gain(1);
    const amp = kit.gain(0);
    amp.connect(dest);
    const srcs = [], nodes = [mix, amp];
    const ms = list(midi);
    const det = [];
    for (const m of ms) for (const d of [-7, 6]) {
      const os = kit.osc('sawtooth', mtof(m));
      os.detune.value = d + rand(-3, 3);
      os.connect(mix);
      srcs.push(os); det.push(os.detune);
    }
    const v = vibrato(t, det, 4.7, 11, 0.3, dur);
    srcs.push(v[0]); nodes.push(v[1]);
    for (const [ff, gg] of VOWELS[o.vowel || 'ah']) {
      const bp = kit.filter('bandpass', ff, 7);
      const g = kit.gain(gg * 5);
      mix.connect(bp); bp.connect(g); g.connect(amp);
      nodes.push(bp, g);
    }
    const att = o.attack ?? Math.min(0.6, dur * 0.35);
    const end = kit.ahr(amp.gain, t, att, 0.058 * vel / Math.sqrt(ms.length * 2), Math.max(0, dur - att), o.release ?? 0.9);
    return part(srcs, nodes, end);
  }

  // ---------------------------------------------------------------- struck
  function bell(dest, t, midi, dur, vel = 1, o = {}) {
    const f = mtof(midi);
    const car = kit.osc('sine', f), mod = kit.osc('sine', f * (o.ratio ?? 3.5));
    const mg = kit.gain(0), g = kit.gain(0);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(dest);
    const d = o.decay ?? 2.4;
    mg.gain.setValueAtTime(f * (o.index ?? 1.1), t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.01), t + Math.min(0.6, d * 0.35));
    const end = kit.perc(g.gain, t, 0.002, 0.09 * vel, d);
    return part([car, mod], [mg, g], end);
  }

  function churchbell(dest, t, midi, dur, vel = 1) {
    const f = mtof(midi);
    const P = [[0.5, 0.35, 5], [1, 0.5, 3.6], [1.19, 0.28, 2.6], [1.5, 0.18, 2.2], [2, 0.22, 1.8], [2.52, 0.1, 1.2], [3.01, 0.08, 0.9]];
    const srcs = [], nodes = [];
    let end = t;
    for (const [r, a, d] of P) {
      const os = kit.osc('sine', f * r);
      const g = kit.gain(0);
      os.connect(g); g.connect(dest);
      end = Math.max(end, kit.perc(g.gain, t, 0.003, a * 0.12 * vel, d));
      srcs.push(os); nodes.push(g);
    }
    return part(srcs, nodes, end);
  }

  function celesta(dest, t, midi, dur, vel = 1) {
    const f = mtof(midi);
    const a = kit.osc('sine', f), b = kit.osc('sine', f * 4);
    const ga = kit.gain(0), gb = kit.gain(0);
    a.connect(ga); b.connect(gb); ga.connect(dest); gb.connect(dest);
    const end = kit.perc(ga.gain, t, 0.002, 0.1 * vel, 1.1);
    kit.perc(gb.gain, t, 0.001, 0.03 * vel, 0.18);
    return part([a, b], [ga, gb], end);
  }

  function timpani(dest, t, midi, dur, vel = 1) {
    const f = mtof(midi);
    const srcs = [], nodes = [];
    let end = t;
    for (const [r, a, d] of [[1, 0.5, 1.3], [1.5, 0.18, 0.7], [1.98, 0.1, 0.5]]) {
      const os = kit.osc('sine', f * r);
      os.frequency.setValueAtTime(f * r * 1.03, t);
      os.frequency.exponentialRampToValueAtTime(f * r, t + 0.08);
      const g = kit.gain(0);
      os.connect(g); g.connect(dest);
      end = Math.max(end, kit.perc(g.gain, t, 0.003, a * 0.4 * vel, d));
      srcs.push(os); nodes.push(g);
    }
    const n = kit.noiseSrc(kit.brown); const lp = kit.filter('lowpass', 600, 0.7); const ng = kit.gain(0);
    n.connect(lp); lp.connect(ng); ng.connect(dest);
    kit.perc(ng.gain, t, 0.002, 0.2 * vel, 0.12);
    srcs.push(n); nodes.push(lp, ng);
    return part(srcs, nodes, end);
  }

  // ---------------------------------------------------------------- percussion
  function tonePart(dest, t, f, f2, glide, peak, decay, type = 'sine') {
    const os = kit.osc(type, f);
    if (f2) { os.frequency.setValueAtTime(f, t); os.frequency.exponentialRampToValueAtTime(f2, t + glide); }
    const g = kit.gain(0);
    os.connect(g); g.connect(dest);
    const end = kit.perc(g.gain, t, 0.002, peak, decay);
    return part([os], [g], end);
  }
  function noisePart(dest, t, type, f, q, peak, decay, buffer, attack = 0.001) {
    const s = kit.noiseSrc(buffer || kit.noise);
    const fl = kit.filter(type, f, q);
    const g = kit.gain(0);
    s.connect(fl); fl.connect(g); g.connect(dest);
    const end = kit.perc(g.gain, t, attack, peak * NG, decay);
    return part([s], [fl, g], end);
  }
  const merge = (...ps) => part(ps.flatMap((p) => p.srcs), ps.flatMap((p) => p.nodes), Math.max(...ps.map((p) => p.end)));

  // Pre-rendered drum hits (3 variants per letter), filled asynchronously at start-up.
  const drumBufs = {};
  function drum(letter, dest, t, vel = 1, o = {}) {
    const bufs = drumBufs[letter];
    if (bufs && !o.dur) {
      const b = pick(bufs);
      const s = kit.src(b);
      s._t = t;
      const g = kit.gain(vel);
      s.connect(g); g.connect(dest);
      return part([s], [g], t + b.duration);
    }
    const p = drumSynth(letter, dest, t, vel, o);
    if (p) for (const x of p.srcs) if (x._t == null) x._t = t;
    return p;
  }
  async function prerenderDrums() {
    const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OAC) return;
    const sr = kit.ac.sampleRate;
    const LEN = { g: 4.1, B: 0.85, b: 0.85, K: 0.45, k: 0.45, x: 0.35, X: 0.35, a: 0.4, T: 0.3, t: 0.3, j: 0.3 };
    const letters = ['K', 'k', 'S', 's', 'T', 't', 'h', 'c', 'x', 'X', 'B', 'b', 'a', 'j', 'g'];
    const VAR = 3;
    const slots = [];
    let at = 0;
    for (const l of letters) for (let v = 0; v < VAR; v++) { const len = LEN[l] ?? 0.25; slots.push([l, at, len]); at += len + 0.02; }
    const off = new OAC(1, Math.ceil(at * sr) + 128, sr);
    const okit = createKit(off, { nodes: 0, voices: 0 });
    const oinst = createInstruments(okit, { prerender: false });
    for (const [l, t0] of slots) { const p = oinst.drum(l, off.destination, t0 + 0.001, 1); if (p) okit.commit(t0 + 0.001, [p]); }
    const out = await off.startRendering();
    const data = out.getChannelData(0);
    for (const [l, t0, len] of slots) {
      const n = Math.floor(len * sr);
      const b = kit.ac.createBuffer(1, n, sr);
      const d = b.getChannelData(0);
      const i0 = Math.floor(t0 * sr);
      for (let i = 0; i < n; i++) d[i] = (data[i0 + i] || 0) * (i > n - 64 ? (n - i) / 64 : 1);
      (drumBufs[l] = drumBufs[l] || []).push(b);
    }
  }
  const ready = prerender ? prerenderDrums().catch((err) => console.warn('[audio] drum prerender skipped', err)) : Promise.resolve();

  function drumSynth(letter, dest, t, vel = 1, o = {}) {
    const v = vel;
    switch (letter) {
      case 'K': case 'k': { // frame drum / bodhran
        const k = letter === 'K' ? 1 : 0.6;
        return merge(tonePart(dest, t, 118, 58, 0.11, 0.36 * v * k, 0.32), noisePart(dest, t, 'lowpass', 520, 0.7, 0.06 * v * k, 0.09, kit.brown));
      }
      case 'S': case 's': { // tabor (rope-tensioned snare)
        const k = letter === 'S' ? 1 : 0.45;
        return merge(noisePart(dest, t, 'bandpass', 2100, 0.9, 0.127 * v * k, 0.13), tonePart(dest, t, 240, 170, 0.05, 0.17 * v * k, 0.07, 'triangle'));
      }
      case 'T': case 't': { // tambourine
        const k = letter === 'T' ? 1 : 0.5;
        return merge(noisePart(dest, t, 'highpass', 6800, 0.7, 0.07 * v * k, 0.16), noisePart(dest, t + 0.012, 'bandpass', 9200, 4, 0.056 * v * k, 0.22));
      }
      case 'h': return noisePart(dest, t, 'bandpass', 6200, 1.2, 0.055 * v, 0.06, null, 0.015);
      case 'c': return merge(tonePart(dest, t, 1750, null, 0, 0.11 * v, 0.045), noisePart(dest, t, 'bandpass', 2600, 3, 0.047 * v, 0.03));
      case 'x': case 'X': { // stomp on boards
        const k = letter === 'X' ? 1.2 : 0.8;
        return merge(tonePart(dest, t, 95, 48, 0.09, 0.4 * v * k, 0.22), noisePart(dest, t, 'lowpass', 300, 0.8, 0.11 * v * k, 0.1, kit.brown), tonePart(dest, t, 310, 220, 0.03, 0.05 * v * k, 0.05, 'triangle'));
      }
      case 'B': case 'b': { // big drum (war drum)
        const k = letter === 'B' ? 1 : 0.6;
        return merge(tonePart(dest, t, 78, 40, 0.22, 0.45 * v * k, 0.6), noisePart(dest, t, 'lowpass', 260, 0.8, 0.135 * v * k, 0.16, kit.brown), noisePart(dest, t, 'bandpass', 1200, 1.4, 0.025 * v * k, 0.03));
      }
      case 'a': { // anvil / pick tink
        const f = rand(1950, 2150);
        return merge(tonePart(dest, t, f, null, 0, 0.07 * v, 0.35), tonePart(dest, t, f * 2.76, null, 0, 0.035 * v, 0.18), noisePart(dest, t, 'highpass', 4000, 0.8, 0.028 * v, 0.02));
      }
      case 'j': { // little bells
        const ps = [];
        for (let i = 0; i < 4; i++) ps.push(tonePart(dest, t + i * 0.012, rand(3800, 5200), null, 0, 0.028 * v, 0.2));
        return merge(...ps);
      }
      case 'C': { // cymbal swell into the beat
        const s = kit.noiseSrc(); const hp = kit.filter('highpass', 5000, 0.6); const g = kit.gain(0);
        s.connect(hp); hp.connect(g); g.connect(dest);
        const d = o.dur ?? 1.2;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06 * v * NG, t + d);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.5);
        return part([s], [hp, g], t + d + 0.5);
      }
      case 'g': { // gong
        const srcs = [], nodes = [];
        let end = t;
        for (const [r, a, d] of [[1, 0.3, 4], [1.42, 0.16, 3], [2.11, 0.1, 2.2], [2.94, 0.06, 1.5]]) {
          const os = kit.osc('sine', 82 * r);
          const g = kit.gain(0);
          os.connect(g); g.connect(dest);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(a * 0.3 * v, t + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, t + d);
          end = Math.max(end, t + d);
          srcs.push(os); nodes.push(g);
        }
        return part(srcs, nodes, end);
      }
      default: return null;
    }
  }

  const INST = {
    lute, harp, dulcimer, bass, recorder, flute, shawm, clarinet, concertina, horn, fiddle,
    drone, strings, glass, choir, bell, churchbell, celesta, timpani,
  };
  // Instruments that connect notes legato (slur) when one ends where the next begins.
  const LEGATO = new Set(['recorder', 'flute', 'shawm', 'clarinet', 'concertina', 'horn', 'fiddle']);
  // Sounding range (MIDI) per melodic instrument; melodies are octave-folded into it.
  const RANGE = {
    recorder: [67, 98], flute: [62, 96], shawm: [60, 88], clarinet: [50, 86], concertina: [55, 88], horn: [43, 77],
    fiddle: [55, 93], lute: [40, 81], harp: [36, 96], dulcimer: [50, 93], bass: [28, 60], bell: [60, 100],
    celesta: [64, 100], glass: [48, 88], choir: [43, 76], strings: [36, 84],
  };

  return {
    INST, LEGATO, RANGE, drum, ready,
    play(name, dest, t, midi, dur, vel, o) {
      const fn = INST[name];
      const p = fn ? fn(dest, t, midi, dur, vel, o || {}) : null;
      if (p) for (const s of p.srcs) if (s._t == null) s._t = t;
      return p;
    },
    get drumsReady() { return Object.keys(drumBufs).length > 0; },
    fit(name, midi) {
      const r = RANGE[name];
      if (!r) return midi;
      while (midi < r[0]) midi += 12;
      while (midi > r[1]) midi -= 12;
      return midi;
    },
  };
}
