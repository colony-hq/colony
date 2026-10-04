// Generative gamelan in a slendro tuning. A 16-beat balungan cycle (four gatra) ends on the gong;
// saron/demung/peking play the skeleton melody, bonang elaborates, gender arpeggiates around the
// gatra goal tone, kenong/kempul punctuate, kendang drives the faster moods, a suling floats
// phrases over the top, and pads/drones colour the finale/danger moods. Moods crossfade.
// Owner: ui-audio.

import { slendro, rand, pick, clamp, BASE_HZ } from './audio-kit.js';

const DIGIT = { 1: 0, 2: 1, 3: 2, 5: 3, 6: 4 };
const parse = (s) => s.replace(/\s+/g, '').split('').map((c) => (c === '.' ? -1 : DIGIT[c]));

const PHRASES = {
  calm: [
    '2126 2126 3532 6532',
    '3532 1216 5653 2126',
    '.3.2 .3.2 .5.6 .5.3',
    '6532 5321 3216 2126',
    '1216 3532 6356 5321',
    '5653 2165 3561 6532',
    '.6.5 .3.2 .5.3 .1.6',
  ].map(parse),
  danger: [
    '2121 2121 6161 3212',
    '1616 1616 2121 3532',
    '2.21 2.21 6.61 2.21',
    '3232 3232 1616 2121',
  ].map(parse),
  finale: [
    '3532 6532 5653 2126',
    '1235 6532 1216 5321',
    '6123 2165 3561 6532',
    '2353 2126 5653 2165',
  ].map(parse),
};

// Instrument mix per mood (probabilities 0..1 unless noted).
const MOODS = {
  title: { bpm: 44, set: 'calm', gain: 0.9, saron: 0.4, demung: 0, peking: 0, bonang: 0, gender: 0.9, genderLong: true, kenong: 0.45, kempul: 0, gong: 1, kendang: 0, suling: 0.7, pad: 0, drone: 0 },
  explore: { bpm: 60, set: 'calm', gain: 0.78, saron: 1, demung: 0.55, peking: 0, bonang: 0.55, gender: 0.6, kenong: 0.9, kempul: 0.8, gong: 1, kendang: 0, suling: 0.3, pad: 0, drone: 0, density: true },
  dawn: { bpm: 63, set: 'finale', gain: 0.8, saron: 1, demung: 0.6, peking: 0.45, bonang: 0.7, gender: 0.7, kenong: 0.9, kempul: 0.8, gong: 1, kendang: 0.25, suling: 0.55, pad: 0.35, drone: 0, density: true },
  danger: { bpm: 88, set: 'danger', gain: 0.82, saron: 1, demung: 1, peking: 0, bonang: 1, bonangFast: true, gender: 0.12, kenong: 0.6, kempul: 0.5, gong: 1, gongSmall: true, kendang: 1, suling: 0, pad: 0, drone: 1 },
  finale: { bpm: 62, bpmTo: 80, set: 'finale', gain: 1, saron: 1, demung: 1, peking: 1, bonang: 1, gender: 0.85, kenong: 1, kempul: 1, gong: 1, kendang: 0.85, suling: 0.9, pad: 1, drone: 0 },
};
export const MOOD_NAMES = Object.keys(MOODS).concat('silent');

const LOOKAHEAD = 0.32;

export function createGamelan(kit, out, counters) {
  const { ac } = kit;
  let cur = null;
  let curName = 'silent';

  // ---------------------------------------------------------------- instruments
  function saron(st, t, deg, oct, vel, key = 'saron') {
    const f = slendro(deg, oct);
    const damp = kit.gain(1);
    damp.connect(st.bus);
    // Players damp the previous key as they strike the next one.
    const prev = st.damp[key];
    if (prev) { try { prev.gain.setTargetAtTime(0.0001, t, 0.06); } catch { /* ended */ } }
    st.damp[key] = damp;
    const P = oct <= 0 ? [[1, 0.2, 2.8], [2.76, 0.04, 0.5]] : [[1, 0.17, 2.3], [2.76, 0.05, 0.55], [5.4, 0.016, 0.16]];
    const srcs = [];
    const nodes = [damp];
    let end = t;
    for (const [r, a, d] of P) {
      const o = kit.osc('sine', f * r);
      const g = kit.gain(0);
      o.connect(g);
      g.connect(damp);
      end = Math.max(end, kit.perc(g.gain, t, 0.002, a * vel, d));
      srcs.push(o);
      nodes.push(g);
    }
    kit.voice(srcs, nodes, t, end);
  }

  function bonang(st, t, deg, oct, vel) {
    const f = slendro(deg, oct);
    const car = kit.osc('sine', f);
    const mod = kit.osc('sine', f * 1.41);
    const mg = kit.gain(0);
    const amp = kit.gain(0);
    mod.connect(mg);
    mg.connect(car.frequency);
    car.connect(amp);
    amp.connect(st.bus);
    mg.gain.setValueAtTime(f * 1.5 * vel, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.02), t + 0.22);
    const end = kit.perc(amp.gain, t, 0.002, 0.075 * vel, 1.05);
    kit.voice([car, mod], [mg, amp], t, end);
  }

  function gender(st, t, deg, oct, vel, decay = 2.6) {
    const f = slendro(deg, oct);
    const o1 = kit.osc('sine', f);
    const o2 = kit.osc('sine', f * 1.0042); // "ombak": slow beating shimmer
    const o3 = kit.osc('sine', f * 3.93);
    const g = kit.gain(0);
    const g3 = kit.gain(0);
    o1.connect(g); o2.connect(g); o3.connect(g3);
    g.connect(st.bus); g3.connect(st.bus);
    const end = kit.perc(g.gain, t, 0.014, 0.05 * vel, decay);
    kit.perc(g3.gain, t, 0.004, 0.008 * vel, 0.35);
    kit.voice([o1, o2, o3], [g, g3], t, end);
  }

  function gong(st, t, vel = 1, small = false) {
    const f0 = small ? slendro(1, -1) : BASE_HZ / 2;
    const P = small
      ? [[1, 0.2, 3.6], [1.008, 0.15, 3.4], [2.02, 0.06, 2.2], [2.95, 0.025, 1.4]]
      : [[1, 0.26, 7.5], [1.0095, 0.2, 7.2], [2.01, 0.075, 5], [2.028, 0.06, 4.6], [2.94, 0.03, 3.2], [0.5, 0.06, 6]];
    const srcs = [];
    const nodes = [];
    let end = t;
    for (const [r, a, d] of P) {
      const o = kit.osc('sine', f0 * r);
      const g = kit.gain(0);
      o.connect(g);
      g.connect(st.bus);
      // Soft mallet: quick attack, then the body blooms a little before the long decay.
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(a * vel * 0.7, t + 0.035);
      g.gain.linearRampToValueAtTime(a * vel, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      end = Math.max(end, t + d);
      srcs.push(o);
      nodes.push(g);
    }
    const thump = kit.noiseSrc(kit.brown);
    const lp = kit.filter('lowpass', 170, 0.7);
    const tg = kit.gain(0);
    thump.connect(lp); lp.connect(tg); tg.connect(st.bus);
    kit.perc(tg.gain, t, 0.004, 0.35 * vel, 0.35);
    srcs.push(thump);
    nodes.push(lp, tg);
    kit.voice(srcs, nodes, t, end);
  }

  function kempul(st, t, deg, vel) {
    const f = slendro(deg, -1);
    const P = [[1, 0.13, 3.2], [1.006, 0.1, 3], [2.0, 0.04, 1.8], [2.9, 0.016, 0.9]];
    const srcs = [], nodes = [];
    let end = t;
    for (const [r, a, d] of P) {
      const o = kit.osc('sine', f * r);
      const g = kit.gain(0);
      o.connect(g); g.connect(st.bus);
      end = Math.max(end, kit.perc(g.gain, t, 0.018, a * vel, d));
      srcs.push(o); nodes.push(g);
    }
    kit.voice(srcs, nodes, t, end);
  }

  function kenong(st, t, deg, vel) {
    const f = slendro(deg, 1);
    const car = kit.osc('sine', f);
    const mod = kit.osc('sine', f * 2.0);
    const mg = kit.gain(0);
    const amp = kit.gain(0);
    mod.connect(mg); mg.connect(car.frequency); car.connect(amp); amp.connect(st.bus);
    mg.gain.setValueAtTime(f * 0.6, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.03), t + 0.4);
    const end = kit.perc(amp.gain, t, 0.006, 0.06 * vel, 2.4);
    kit.voice([car, mod], [mg, amp], t, end);
  }

  function kendang(st, t, kind, vel) {
    if (kind === 'dhung') {
      const o = kit.osc('sine', 150);
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(66, t + 0.14);
      const g = kit.gain(0);
      o.connect(g); g.connect(st.bus);
      const end = kit.perc(g.gain, t, 0.003, 0.26 * vel, 0.3);
      kit.voice([o], [g], t, end);
    } else {
      const s = kit.noiseSrc();
      const bp = kit.filter('bandpass', kind === 'tak' ? 2300 : 820, 1.3);
      const g = kit.gain(0);
      s.connect(bp); bp.connect(g); g.connect(st.bus);
      const end = kit.perc(g.gain, t, 0.001, (kind === 'tak' ? 0.12 : 0.16) * vel, kind === 'tak' ? 0.06 : 0.12);
      kit.voice([s], [bp, g], t, end);
    }
  }

  function suling(st, t, notes, vel) {
    const f0 = slendro(notes[0].deg, notes[0].oct);
    const o = kit.osc('sine', f0);
    const o2 = kit.osc('triangle', f0 * 2);
    const lfo = kit.osc('sine', rand(4.8, 5.6));
    const lg = kit.gain(f0 * 0.006);
    const g2 = kit.gain(0.08);
    const amp = kit.gain(0);
    const breath = kit.noiseSrc(kit.noise, 1, true);
    const bf = kit.filter('bandpass', f0 * 2, 2.2);
    const bg = kit.gain(0.22);
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    o.connect(amp); o2.connect(g2); g2.connect(amp);
    breath.connect(bf); bf.connect(bg); bg.connect(amp);
    amp.connect(st.bus);
    const peak = 0.045 * vel;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.28);
    let tt = t;
    notes.forEach((nt, i) => {
      const nf = slendro(nt.deg, nt.oct);
      if (i > 0) {
        o.frequency.setTargetAtTime(nf, tt, 0.04);
        o2.frequency.setTargetAtTime(nf * 2, tt, 0.04);
        bf.frequency.setTargetAtTime(nf * 2, tt, 0.05);
        amp.gain.setTargetAtTime(peak * 0.7, tt - 0.06, 0.03);
        amp.gain.setTargetAtTime(peak, tt + 0.03, 0.09);
      }
      tt += nt.dur;
    });
    amp.gain.setTargetAtTime(0.0001, tt - 0.25, 0.22);
    kit.voice([o, o2, lfo, breath], [lg, g2, amp, bf, bg], t, tt + 1.1);
  }

  function pad(st, t, degs, oct, dur, vel) {
    const lp = kit.filter('lowpass', 260, 0.9);
    const amp = kit.gain(0);
    lp.connect(amp); amp.connect(st.bus);
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.linearRampToValueAtTime(1900, t + dur * 0.55);
    lp.frequency.linearRampToValueAtTime(520, t + dur);
    const srcs = [];
    for (const d of degs) {
      const f = slendro(d, oct);
      for (const det of [-8, 8]) {
        const o = kit.osc('sawtooth', f);
        o.detune.value = det;
        o.connect(lp);
        srcs.push(o);
      }
    }
    const end = kit.ahr(amp.gain, t, dur * 0.45, 0.022 * vel, dur * 0.2, dur * 0.55);
    kit.voice(srcs, [lp, amp], t, end);
  }

  function drone(st, t, dur, vel) {
    const fs = [slendro(0, -1), slendro(0, -1) * 1.006, slendro(1, -1)];
    const amp = kit.gain(0);
    amp.connect(st.bus);
    const srcs = fs.map((f) => { const o = kit.osc('sine', f); o.connect(amp); return o; });
    const rumble = kit.noiseSrc(kit.brown, 1, true);
    const lp = kit.filter('lowpass', 110, 1);
    const rg = kit.gain(0.6);
    rumble.connect(lp); lp.connect(rg); rg.connect(amp);
    srcs.push(rumble);
    const end = kit.ahr(amp.gain, t, 1.4, 0.06 * vel, Math.max(0.1, dur - 2.6), 1.6);
    kit.voice(srcs, [amp, lp, rg], t, end);
  }

  // ---------------------------------------------------------------- composition
  function noteAt(ph, pos) {
    for (let i = 0; i < 16; i++) {
      const v = ph[(pos - i + 16) % 16];
      if (v >= 0) return v;
    }
    return 1;
  }
  const gatraGoal = (ph, pos) => noteAt(ph, (pos | 3));
  const gatraNotes = (ph, pos) => {
    const s = pos & ~3;
    return [0, 1, 2, 3].map((k) => noteAt(ph, s + k));
  };

  function newCycle(st) {
    const c = st.cfg;
    st.cycle++;
    const set = PHRASES[c.set];
    if (!st.phrase || Math.random() > 0.4) {
      let i = st.phraseIdx;
      if (set.length > 1) while (i === st.phraseIdx) i = (Math.random() * set.length) | 0;
      else i = 0;
      st.phraseIdx = i;
      st.phrase = set[i].slice();
    }
    // Small variations so repeats never sound copy-pasted (never on gatra-final notes).
    if (Math.random() < 0.35) {
      for (let k = 0; k < 2; k++) {
        const p = (Math.random() * 16) | 0;
        if ((p & 3) !== 3 && st.phrase[p] >= 0) st.phrase[p] = (st.phrase[p] + pick([-1, 1]) + 5) % 5;
      }
    }
    if (c.density) {
      st.density = clamp(st.density + rand(-0.3, 0.3), 0.3, 1);
      if (st.cycle > 1 && Math.random() < 0.12) st.density = 0.12; // breathing space
    }
    if (c.bpmTo) st.bpm += (c.bpmTo - st.bpm) * 0.3;
  }

  function scheduleBeat(st, b, t) {
    const c = st.cfg;
    const B = 60 / st.bpm;
    const pos = b % 16;
    if (pos === 0) newCycle(st);
    const ph = st.phrase;
    const note = ph[pos];
    const den = st.density;
    const goal = gatraGoal(ph, pos);
    const hum = (dt = 0) => t + dt + rand(-0.006, 0.006);
    const accent = pos % 4 === 3 ? 1 : pos % 2 === 1 ? 0.85 : 0.72;

    if (c.gong && pos === 15) gong(st, hum(), 0.95);
    if (c.gongSmall && pos === 7) gong(st, hum(), 0.7, true);
    if ((pos & 3) === 3 && pos !== 15 && Math.random() < c.kenong * (c.density ? den + 0.2 : 1)) kenong(st, hum(), goal, 0.85);
    if (c.kempul && (pos === 5 || pos === 9 || pos === 13) && Math.random() < c.kempul * (c.density ? den : 1)) kempul(st, hum(), noteAt(ph, pos), 0.85);

    if (note >= 0 && Math.random() < c.saron * (c.density ? 0.5 + 0.5 * den : 1)) saron(st, hum(), note, 1, accent * rand(0.85, 1));
    if (note >= 0 && c.demung && pos % 2 === 1 && Math.random() < c.demung * (c.density ? den : 1)) saron(st, hum(), note, 0, 0.8, 'demung');
    if (note >= 0 && c.peking && Math.random() < c.peking * (c.density ? den : 1)) {
      saron(st, hum(), note, 2, 0.45, 'peking');
      saron(st, hum(B / 2), note, 2, 0.35, 'peking');
    }

    if (c.bonang && Math.random() < c.bonang * (c.density ? den : 1)) {
      if (c.bonangFast) {
        const a = goal, b2 = (goal + 1) % 5;
        for (let k = 0; k < 4; k++) bonang(st, hum((B / 4) * k), k % 2 ? b2 : a, 2, k === 0 ? 0.9 : 0.6);
      } else {
        const g = gatraNotes(ph, pos);
        const pair = (pos & 3) < 2 ? [g[0], g[1]] : [g[2], g[3]];
        bonang(st, hum(), pair[0], pair[0] >= 3 ? 1 : 2, 0.75);
        bonang(st, hum(B / 2), pair[1], pair[1] >= 3 ? 1 : 2, 0.6);
      }
    }

    if (c.gender) {
      if (c.genderLong) {
        if (Math.random() < c.gender) {
          const seq = [goal, goal + 2, goal + 1, goal + 3];
          gender(st, hum(), seq[pos & 3], pos % 8 < 4 ? 0 : 1, rand(0.7, 1), 3.6);
          if ((pos & 3) === 3) gender(st, hum(0.02), goal, -1, 0.6, 4.2);
        }
      } else {
        for (let k = 0; k < 2; k++) {
          if (Math.random() < c.gender * (c.density ? 0.4 + 0.6 * den : 1) * 0.6) {
            const d = goal + pick([0, 1, 2, -1, 3]);
            gender(st, hum((B / 2) * k), d, k ? 1 : 0, rand(0.5, 0.85), 2.2);
          }
        }
      }
    }

    if (c.kendang && Math.random() < c.kendang) {
      if (st.name === 'danger') {
        if (pos % 4 === 0) kendang(st, hum(), 'dhung', 1);
        if (pos % 4 === 2 && Math.random() < 0.6) kendang(st, hum(), 'dhung', 0.7);
        kendang(st, hum(B / 2), 'tak', 0.8);
        if (pos >= 14) kendang(st, hum(B / 4), 'tung', 0.6), kendang(st, hum((3 * B) / 4), 'tung', 0.7);
      } else {
        if (pos % 2 === 0) kendang(st, hum(), 'dhung', 0.8);
        else kendang(st, hum(B / 2), 'tak', 0.6);
        if (pos === 14) kendang(st, hum(B / 2), 'tung', 0.6);
      }
    }

    if (c.suling && pos === 1 && t > st.sulingUntil && Math.random() < c.suling) {
      const notes = [];
      let total = 0;
      const count = 3 + ((Math.random() * 3) | 0);
      for (let k = 0; k < count; k++) {
        const src = noteAt(ph, (pos + 3 + k * 3) % 16);
        const dur = pick([1, 2, 2, 3]) * B;
        notes.push({ deg: src, oct: 2, dur });
        total += dur;
      }
      notes[notes.length - 1].dur += B;
      suling(st, hum(B * 0.5), notes, st.name === 'title' ? 0.8 : 1);
      st.sulingUntil = t + total + B * 3;
    }

    if (c.pad && pos === 0 && Math.random() < c.pad) pad(st, t, [goal, goal + 2, goal + 4], 0, B * 16, 1);
    if (c.drone && pos === 0) drone(st, t, B * 16 + 1.4, 1);
  }

  // ---------------------------------------------------------------- moods
  function newState(name) {
    const cfg = MOODS[name];
    const bus = kit.gain(0.0001);
    bus.connect(out.dry);
    if (out.wet) bus.connect(out.wet);
    return {
      name, cfg, bus, bpm: cfg.bpm, beat: 0, next: ac.currentTime + 0.15, phrase: null, phraseIdx: -1,
      cycle: -1, density: 0.7, damp: {}, sulingUntil: 0,
    };
  }

  function setMood(name, { fade = 2.8 } = {}) {
    if (!MOODS[name]) name = 'silent';
    if (name === curName) return;
    const now = ac.currentTime;
    if (cur) {
      const old = cur;
      const g = old.bus.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.0001, g.value), now);
      g.linearRampToValueAtTime(0.0001, now + fade);
      setTimeout(() => { try { old.bus.disconnect(); } catch { /* ignore */ } }, (fade + 9) * 1000);
    }
    curName = name;
    cur = name === 'silent' ? null : newState(name);
    if (cur) {
      const g = cur.bus.gain;
      g.setValueAtTime(0.0001, now);
      g.linearRampToValueAtTime(cur.cfg.gain, now + Math.min(fade, name === 'danger' ? 1.2 : 2.4));
      // A new piece opens on the gong (danger opens on its drone instead).
      if (name !== 'danger') gong(cur, now + 0.08, name === 'finale' ? 1 : 0.75);
    }
  }

  return {
    get mood() { return curName; },
    setMood,
    // Play a single gong stroke through the music bus (used by SFX 'gong').
    strike(vel = 1) {
      const st = cur || { bus: out.dry, damp: {} };
      gong(st, ac.currentTime + 0.02, vel);
    },
    // `until` (seconds, audio clock) lets tests pre-schedule a whole render offline.
    update(until) {
      if (!cur) return;
      const now = ac.currentTime;
      if (cur.next < now - 0.25) cur.next = now + 0.05; // resync after a stall (tab hidden, slow frame)
      const horizon = until ?? now + LOOKAHEAD;
      const max = until != null ? 4000 : 8;
      let guard = 0;
      while (cur.next < horizon && guard++ < max) {
        if (counters.voices < 90) scheduleBeat(cur, cur.beat, cur.next);
        cur.beat++;
        cur.next += 60 / cur.bpm;
      }
    },
  };
}
