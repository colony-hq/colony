// Combat sound effects: melee swings and impacts, blocks, bows and arrows, the six Orbio spell
// elements (cast + impact), player hurt/death, and creature voices for every monster family.
// Each entry: (t, opts, dest) -> parts[]. Owner: audio builder.
//
// Creature voices take opts.mood: 'idle' | 'attack' | 'hurt' | 'death'.

export function defineCombat(L) {
  const { tone, noise, swell, bell, metal, vocal, grains, note, rand, pick, kit } = L;
  const P = (...ps) => ps.flat(4).filter(Boolean);
  const mood = (o) => o.mood || 'idle';

  // Syllable chatter (goblins, imps): short formant blips.
  function chatter(t, dest, { n = 4, f = [280, 420], gap = [0.07, 0.11], dur = [0.05, 0.09], vowels = ['ah', 'eh', 'ee', 'oh', 'uh'], peak = 0.06, fscale = 1.2, rough = 0 }) {
    const ps = [];
    let tt = t;
    for (let i = 0; i < n; i++) {
      const ff = rand(f[0], f[1]);
      const d = rand(dur[0], dur[1]);
      ps.push(vocal(tt, { f: ff, f2: ff * rand(0.85, 1.2), dur: d, vowel: pick(vowels), fscale, q: 6, peak, rough, roughDepth: 0.4 }, dest));
      tt += d + rand(gap[0], gap[1]) * 0.5;
    }
    return ps;
  }
  // Human grunt / shout.
  function human(t, dest, o, f0 = 140) {
    const m = mood(o);
    if (m === 'death') return [vocal(t, { contour: [[0, f0 * 1.3], [0.15, f0 * 1.15], [0.6, f0 * 0.6]], dur: 0.65, vowel: 'ah', vowel2: 'uh', q: 6, peak: 0.1, breath: 0.25, rough: 20, roughDepth: 0.3 }, dest), body(t + 0.55, dest)];
    if (m === 'hurt') return [vocal(t, { contour: [[0, f0 * 1.15], [0.16, f0 * 0.85]], dur: 0.18, vowel: 'uh', q: 6, peak: 0.09, breath: 0.3 }, dest)];
    return [vocal(t, { contour: [[0, f0], [0.06, f0 * 1.2], [0.16, f0 * 0.95]], dur: 0.17, vowel: 'ah', q: 6, peak: 0.08, breath: 0.35 }, dest)];
  }
  // A body hitting the ground.
  function body(t, dest, k = 1) {
    return [tone(t, { f: 110 * k, f2: 50 * k, glide: 0.12, peak: 0.22, d: 0.2, dest }), noise(t, { type: 'lowpass', f: 700, q: 0.7, peak: 0.08, d: 0.15, buffer: kit.brown, dest }), grains(t + 0.02, 3, 0.15, { f: [1500, 3500], peak: [0.008, 0.02], dest })];
  }
  function roar(t, dest, { f = 100, f2 = 75, dur = 1, peak = 0.16, rough = 26, vowel = 'ah', vowel2 = 'oh', sub = 0 }) {
    const ps = [vocal(t, { contour: [[0, f * 0.85], [0.12, f], [dur, f2]], dur, vowel, vowel2, q: 5, peak, breath: 0.45, rough, roughDepth: 0.65, a: 0.08, r: dur * 0.4 }, dest),
      swell(t, { type: 'bandpass', f: 500, f2: 300, q: 0.8, a: 0.1, hold: dur * 0.4, r: dur * 0.5, peak: peak * 0.25, buffer: kit.pink, dest })];
    if (sub) ps.push(tone(t, { f: sub, f2: sub * 0.85, glide: dur, a: 0.1, peak: peak * 1.2, d: dur, dest }));
    return ps;
  }
  function fireBreath(t, dest, k = 1) {
    return [swell(t, { f: 600, f2: 2400, f3: 900, q: 0.7, a: 0.12, hold: 0.6 * k, r: 0.6, peak: 0.12 * k, dest }),
      swell(t, { type: 'lowpass', f: 300, q: 0.7, a: 0.1, hold: 0.6 * k, r: 0.5, peak: 0.2 * k, buffer: kit.brown, dest }),
      grains(t + 0.1, 14, 1.2 * k, { f: [1800, 6500], q: 1.6, peak: [0.02, 0.06], dest })];
  }

  const S = {
    // ---------------------------------------------------------------- melee
    swing(t, o, dest) {
      const h = o.heavy ? 0.7 : 1;
      return P(noise(t, { f: 500 * h, f2: 2200 * h, glide: 0.12, q: 1.3, a: 0.04, peak: 0.08, d: 0.15, dest }));
    },
    hit(t, o, dest) {
      const pw = Math.min(1.4, 0.55 + (o.power ?? 0.4));
      return P(tone(t, { f: 150, f2: 55, glide: 0.1, peak: 0.28 * pw, d: 0.16, dest }), noise(t, { type: 'lowpass', f: 1200, q: 0.7, peak: 0.1 * pw, d: 0.08, dest }),
        noise(t, { f: 2600, q: 1, peak: 0.035 * pw, d: 0.02, dest }), o.power > 0.6 ? tone(t, { f: 70, f2: 35, glide: 0.2, peak: 0.25, d: 0.3, dest }) : null);
    },
    block(t, o, dest) {
      const r = rand(0.9, 1.1);
      return P(metal(t, 900 * r, { peak: 0.08, d: 0.35, ratios: [1, 1.59, 2.14, 2.76], decays: [1, 0.7, 0.5, 0.35], dest }), noise(t, { type: 'highpass', f: 3000, peak: 0.05, d: 0.03, dest }));
    },
    miss(t, o, dest) { return S.swing(t, { heavy: o.heavy }, dest); },
    hurt(t, o, dest) {
      const f0 = o.female ? 250 : 150;
      return P(vocal(t, { contour: [[0, f0 * 1.15], [0.16, f0 * 0.85]], dur: 0.17, vowel: 'uh', q: 6, peak: 0.06, breath: 0.3 }, dest));
    },
    heal(t, o, dest) { return P([0, 1, 2].map((i) => bell(t + i * 0.08, [1047, 1319, 1568][i], { peak: 0.035, d: 0.8, ratio: 2, index: 0.4, dest }))); },
    'burn-tick'(t, o, dest) { return P(noise(t, { f: 1800, f2: 900, glide: 0.2, q: 1.2, peak: 0.05, d: 0.2, dest }), grains(t, 4, 0.2, { f: [2500, 6000], peak: [0.01, 0.03], dest })); },
    'monster-death'(t, o, dest) { return P(body(t, dest, o.big ? 0.7 : 1)); },

    // ---------------------------------------------------------------- ranged
    bow(t, o, dest) {
      return P(note(t, 'bass', 45, 0.3, 1, dest, { ring: 0.35 }), tone(t, { type: 'triangle', f: 200, f2: 150, glide: 0.04, peak: 0.04, d: 0.05, dest }),
        noise(t + 0.01, { f: 3000, f2: 1800, glide: 0.2, q: 3, peak: 0.03, d: 0.22, dest }));
    },
    arrow(t, o, dest) { return P(noise(t, { f: 2600, f2: 1600, glide: 0.25, q: 4, a: 0.02, peak: 0.035, d: 0.25, dest })); },
    'arrow-hit'(t, o, dest) {
      return P(tone(t, { f: 320, f2: 120, glide: 0.06, peak: 0.12, d: 0.08, dest }), noise(t, { f: 1300, q: 1, peak: 0.05, d: 0.04, dest }), note(t + 0.01, 'bass', 57, 0.25, 0.35, dest, { ring: 0.25 }));
    },

    // ---------------------------------------------------------------- spells: casts
    'spell-spark'(t, o, dest) {
      const ps = [tone(t, { f: 600, f2: 2400, glide: 0.15, peak: 0.04, d: 0.18, dest })];
      for (let i = 0; i < 6; i++) ps.push(tone(t + rand(0, 0.25), { type: 'square', f: rand(1200, 3000), peak: 0.012, d: 0.02, dest }));
      ps.push(...grains(t, 8, 0.3, { type: 'highpass', f: [4000, 8000], peak: [0.01, 0.03], dest }));
      return ps;
    },
    'spell-tide'(t, o, dest) {
      return P(swell(t, { type: 'lowpass', f: 400, f2: 2400, f3: 700, q: 0.9, a: 0.1, hold: 0.1, r: 0.35, peak: 0.12, dest }),
        [0, 1, 2, 3, 4].map((i) => tone(t + 0.05 + i * 0.06, { f: rand(300, 600), f2: rand(800, 1300), glide: 0.05, peak: 0.02, d: 0.05, dest })));
    },
    'spell-stone'(t, o, dest) {
      return P(swell(t, { f: 300, q: 1.2, a: 0.05, hold: 0.1, r: 0.25, peak: 0.12, buffer: kit.brown, dest }), tone(t, { f: 80, f2: 55, glide: 0.3, peak: 0.18, d: 0.3, dest }),
        grains(t, 8, 0.35, { f: [1500, 4000], peak: [0.015, 0.035], dest }));
    },
    'spell-ember'(t, o, dest) {
      return P(swell(t, { f: 500, f2: 1800, q: 0.8, a: 0.05, hold: 0.1, r: 0.35, peak: 0.11, dest }), grains(t + 0.05, 7, 0.45, { f: [2000, 6000], peak: [0.02, 0.05], dest }), tone(t, { f: 160, f2: 90, glide: 0.2, peak: 0.06, d: 0.2, dest }));
    },
    'spell-thought'(t, o, dest) {
      const a = kit.osc('sine', 440), b = kit.osc('sine', 447), lfo = kit.osc('sine', 7);
      const lg = kit.gain(60), g = kit.gain(0);
      lfo.connect(lg); lg.connect(a.frequency); lg.connect(b.frequency);
      a.connect(g); b.connect(g); g.connect(dest);
      a.frequency.setValueAtTime(440, t); a.frequency.exponentialRampToValueAtTime(880, t + 0.45);
      b.frequency.setValueAtTime(447, t); b.frequency.exponentialRampToValueAtTime(893, t + 0.45);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      return P({ srcs: [a, b, lfo], nodes: [lg, g], end: t + 0.56 }, swell(t, { type: 'highpass', f: 3000, q: 0.6, a: 0.25, hold: 0, r: 0.25, peak: 0.02, dest }));
    },
    'spell-insight'(t, o, dest) {
      return P([0, 1, 2, 3].map((i) => bell(t + i * 0.035, [1047, 1319, 1568, 2093][i], { peak: 0.04, d: 1, ratio: 2.76, index: 0.8, dest })),
        swell(t, { type: 'highpass', f: 2000, f2: 7000, q: 0.6, a: 0.1, hold: 0.1, r: 0.5, peak: 0.04, dest }), tone(t, { f: 300, f2: 1500, glide: 0.3, peak: 0.03, d: 0.35, dest }));
    },
    // ---------------------------------------------------------------- spells: impacts
    'spell-hit'(t, o, dest) {
      switch (o.element) {
        case 'tide': return P(S['fish-splash-hit'](t, o, dest));
        case 'stone': return P(tone(t, { f: 120, f2: 45, glide: 0.15, peak: 0.28, d: 0.2, dest }), grains(t, 10, 0.3, { f: [1200, 4500], peak: [0.02, 0.05], dest }), noise(t, { type: 'lowpass', f: 900, peak: 0.1, d: 0.12, buffer: kit.brown, dest }));
        case 'ember': return P(noise(t, { type: 'lowpass', f: 600, q: 0.8, peak: 0.16, d: 0.18, buffer: kit.brown, dest }), grains(t, 10, 0.5, { f: [2000, 6500], peak: [0.02, 0.06], dest }), swell(t, { f: 1500, f2: 600, q: 0.8, a: 0.01, hold: 0.05, r: 0.3, peak: 0.06, dest }));
        case 'thought': return P(bell(t, 880, { peak: 0.06, d: 0.6, ratio: 1.41, index: 2, dest }), tone(t, { f: 700, f2: 350, glide: 0.25, peak: 0.04, d: 0.3, dest }));
        case 'insight': return P(swell(t, { type: 'highpass', f: 6000, f2: 1500, q: 0.6, a: 0.01, hold: 0.05, r: 0.5, peak: 0.07, dest }), bell(t, 2637, { peak: 0.05, d: 0.9, dest }), tone(t, { f: 100, f2: 50, glide: 0.2, peak: 0.15, d: 0.25, dest }));
        default: return P(grains(t, 10, 0.2, { type: 'highpass', f: [3000, 8000], peak: [0.02, 0.05], dest }), tone(t, { type: 'square', f: 2200, f2: 800, glide: 0.1, peak: 0.02, d: 0.1, dest }), tone(t, { f: 140, f2: 70, glide: 0.1, peak: 0.12, d: 0.12, dest }));
      }
    },
    'fish-splash-hit'(t, o, dest) {
      const ps = [noise(t, { type: 'lowpass', f: 3000, f2: 700, glide: 0.25, q: 0.8, a: 0.003, peak: 0.14, d: 0.3, dest }), tone(t, { f: 160, f2: 80, glide: 0.1, peak: 0.12, d: 0.12, dest })];
      for (let i = 0; i < 4; i++) ps.push(tone(t + rand(0.03, 0.25), { f: rand(500, 900), f2: rand(1000, 1600), glide: 0.04, peak: 0.02, d: 0.05, dest }));
      return ps;
    },
    stomp(t, o, dest) {
      return P(tone(t, { f: 60, f2: 30, glide: 0.4, peak: 0.45, d: 0.6, dest }), swell(t, { type: 'lowpass', f: 160, q: 0.8, a: 0.01, hold: 0.15, r: 0.9, peak: 0.25, buffer: kit.brown, dest }),
        grains(t + 0.05, 14, 0.9, { f: [600, 3000], peak: [0.01, 0.04], dest }), noise(t, { type: 'lowpass', f: 900, peak: 0.12, d: 0.15, dest }));
    },
    summon(t, o, dest) {
      return P(note(t, 'horn', 60, 0.25, 0.9, dest), note(t + 0.28, 'horn', 67, 0.6, 1, dest), [0, 1, 2, 3, 4, 5].map((i) => S.knight(t + 0.6 + i * 0.13, { mood: 'hurt' }, dest).slice(1)),
        [0, 1, 2, 3].map((i) => tone(t + 0.7 + i * 0.22, { f: 120, f2: 70, glide: 0.05, peak: 0.08, d: 0.07, dest })));
    },
    'npc-murmur'(t, o, dest) {
      const f0 = o.f0 ?? rand(130, 240);
      return P(chatter(t, dest, { n: 2 + ((Math.random() * 3) | 0), f: [f0 * 0.9, f0 * 1.2], gap: [0.08, 0.14], dur: [0.07, 0.12], peak: 0.035, fscale: 1 }));
    },
    heartbeat(t, o, dest) { return P(tone(t, { f: 62, f2: 45, glide: 0.08, peak: 0.25, d: 0.12, dest }), tone(t + 0.22, { f: 55, f2: 42, glide: 0.08, peak: 0.16, d: 0.12, dest })); },
    'fire-breath'(t, o, dest) { return P(fireBreath(t, dest, o.big ? 1.4 : 1)); },

    // ---------------------------------------------------------------- creature voices
    chicken(t, o, dest) {
      const m = mood(o);
      if (m === 'hurt' || m === 'attack' || m === 'death') {
        return P(vocal(t, { contour: [[0, 900], [0.06, 1350], [0.28, 800]], dur: 0.3, vowel: 'eh', vowel2: 'ah', fscale: 1.7, q: 5, peak: 0.07, rough: 45, roughDepth: 0.5 }, dest), m === 'death' ? grains(t + 0.2, 6, 0.4, { f: [2000, 5000], peak: [0.005, 0.015], dest }) : null);
      }
      const ps = [];
      const n = 2 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) ps.push(vocal(t + i * 0.13, { f: rand(620, 760), f2: rand(560, 680), dur: 0.07, vowel: 'oh', fscale: 1.7, q: 5, peak: 0.05 }, dest));
      if (Math.random() < 0.5) ps.push(vocal(t + n * 0.13 + 0.05, { contour: [[0, 600], [0.1, 1000], [0.3, 760]], dur: 0.32, vowel: 'ah', fscale: 1.7, q: 5, peak: 0.055 }, dest));
      return ps;
    },
    cow(t, o, dest) {
      const m = mood(o);
      const k = m === 'death' ? 0.85 : m === 'hurt' || m === 'attack' ? 1.15 : 1;
      const dur = m === 'idle' ? rand(0.9, 1.3) : 0.6;
      return P(vocal(t, { contour: [[0, 105 * k], [0.15, 122 * k], [dur, 95 * k]], dur, vowel: 'oo', vowel2: 'ah', q: 5, peak: 0.13, breath: 0.12, a: 0.12, r: 0.3 }, dest), m === 'death' ? body(t + 0.5, dest, 0.8) : null);
    },
    rat(t, o, dest) {
      const n = mood(o) === 'death' ? 1 : 2 + ((Math.random() * 2) | 0);
      const ps = [];
      for (let i = 0; i < n; i++) ps.push(tone(t + i * 0.09, { f: rand(3000, 3600), f2: rand(3900, 4600), glide: 0.05, a: 0.004, peak: 0.04, d: 0.06, dest }));
      return ps;
    },
    goblin(t, o, dest) {
      const m = mood(o);
      const size = o.size ?? 1; // 1 goblin, 1.5 brute, 2 warchief
      const f = [280 / size, 420 / size];
      if (m === 'death') return P(vocal(t, { contour: [[0, 520 / size], [0.5, 200 / size]], dur: 0.55, vowel: 'ee', vowel2: 'ah', fscale: 1.2, q: 6, peak: 0.08, rough: size > 1 ? 25 : 0, roughDepth: 0.4 }, dest), body(t + 0.45, dest, 1 / Math.sqrt(size)));
      if (m === 'attack') return P(vocal(t, { contour: [[0, 340 / size], [0.08, 480 / size], [0.2, 380 / size]], dur: 0.22, vowel: 'ah', fscale: 1.15, q: 6, peak: 0.08, rough: size > 1 ? 30 : 0, roughDepth: 0.5 }, dest));
      if (m === 'hurt') return P(vocal(t, { contour: [[0, 460 / size], [0.15, 330 / size]], dur: 0.15, vowel: 'eh', fscale: 1.2, q: 6, peak: 0.07 }, dest));
      return P(chatter(t, dest, { n: 3 + ((Math.random() * 4) | 0), f, peak: 0.05, rough: size > 1 ? 25 : 0 }));
    },
    boar(t, o, dest) {
      const m = mood(o);
      if (m === 'hurt' || m === 'death') return P(vocal(t, { contour: [[0, 900], [0.15, 1300], [0.5, 700]], dur: 0.5, vowel: 'ee', q: 5, peak: 0.07, rough: 50, roughDepth: 0.4 }, dest), m === 'death' ? body(t + 0.4, dest) : null);
      return P([0, 0.22].map((d) => vocal(t + d, { f: rand(100, 125), dur: 0.18, vowel: 'uh', q: 5, peak: 0.1, breath: 0.35, rough: 34, roughDepth: 0.75 }, dest)));
    },
    wolf(t, o, dest) {
      const m = mood(o);
      if (m === 'death') return P(vocal(t, { contour: [[0, 700], [0.15, 900], [0.6, 380]], dur: 0.65, vowel: 'ee', vowel2: 'oo', q: 5, peak: 0.07 }, dest), body(t + 0.5, dest));
      if (m === 'attack') return P(vocal(t, { contour: [[0, 320], [0.12, 230]], dur: 0.13, vowel: 'ah', q: 5, peak: 0.1, breath: 0.4 }, dest), vocal(t + 0.15, { f: 85, dur: 0.5, vowel: 'uh', q: 5, peak: 0.09, breath: 0.4, rough: 28, roughDepth: 0.8 }, dest));
      if (m === 'hurt') return P(vocal(t, { contour: [[0, 900], [0.2, 650]], dur: 0.22, vowel: 'ee', q: 5, peak: 0.06 }, dest));
      if (o.howl) return P(vocal(t, { contour: [[0, 400], [0.4, 600], [1.3, 640], [1.9, 450]], dur: 2, vowel: 'oo', vowel2: 'oh', q: 6, peak: 0.07, breath: 0.25, a: 0.3, r: 0.5 }, dest));
      return P(vocal(t, { f: rand(80, 95), dur: rand(0.6, 0.9), vowel: 'uh', vowel2: 'oo', q: 5, peak: 0.09, breath: 0.4, rough: 28, roughDepth: 0.8, a: 0.1 }, dest));
    },
    human(t, o, dest) { return P(human(t, dest, o, o.f0 ?? 140)); },
    knight(t, o, dest) { return P(human(t, dest, o, 115), metal(t + 0.02, 1900, { peak: 0.03, d: 0.3, dest })); },
    sheriff(t, o, dest) {
      const m = mood(o);
      if (m === 'idle' || m === 'attack') return P(vocal(t, { contour: [[0, 105], [0.1, 130], [0.45, 95]], dur: 0.5, vowel: 'ah', vowel2: 'oh', q: 6, peak: 0.11, breath: 0.3, rough: 18, roughDepth: 0.3 }, dest));
      return P(human(t, dest, o, 100));
    },
    spider(t, o, dest) {
      const m = mood(o);
      const ps = [swell(t, { f: 4500, q: 1.2, a: 0.05, hold: m === 'idle' ? 0.2 : 0.35, r: 0.25, peak: 0.05, dest })];
      for (let i = 0; i < 6; i++) ps.push(noise(t + 0.05 + i * 0.045, { f: 3000, q: 4, peak: 0.03, d: 0.012, dest }));
      if (m === 'death') ps.push(...grains(t + 0.3, 10, 0.5, { f: [2000, 4000], q: 4, peak: [0.01, 0.03], dest }), ...body(t + 0.5, dest, 1.3));
      return ps;
    },
    bear(t, o, dest) {
      const m = mood(o);
      if (m === 'idle') return P(vocal(t, { f: 75, f2: 68, dur: 0.8, vowel: 'oh', q: 5, peak: 0.1, breath: 0.4, rough: 22, roughDepth: 0.7 }, dest));
      return P(roar(t, dest, { f: 95, f2: 72, dur: m === 'death' ? 1.2 : 0.9, peak: 0.15, rough: 24, sub: 48 }), m === 'death' ? body(t + 1, dest, 0.7) : null);
    },
    skeleton(t, o, dest) {
      const m = mood(o);
      const n = m === 'death' ? 18 : 9;
      const span = m === 'death' ? 0.9 : 0.4;
      const ps = [];
      for (let i = 0; i < n; i++) {
        const tt = t + rand(0, span);
        ps.push(tone(tt, { type: 'triangle', f: rand(900, 1600), peak: 0.03, d: 0.03, dest }), noise(tt, { f: 2200, q: 2, peak: 0.02, d: 0.015, dest }));
      }
      if (m !== 'idle') ps.push(swell(t, { f: 900, q: 1.2, a: 0.03, hold: 0.1, r: 0.2, peak: 0.03, dest }));
      return ps;
    },
    lurker(t, o, dest) {
      const m = mood(o);
      const ps = [];
      for (let i = 0; i < 6; i++) ps.push(tone(t + rand(0, 0.6), { f: rand(140, 260), f2: rand(400, 700), glide: 0.05, peak: 0.04, d: 0.05, dest }));
      ps.push(vocal(t + 0.1, { f: m === 'death' ? 90 : 68, f2: m === 'death' ? 45 : 60, dur: 0.8, vowel: 'oo', q: 5, peak: 0.1, breath: 0.5, rough: 19, roughDepth: 0.7 }, dest));
      return ps;
    },
    wisp(t, o, dest) {
      const m = mood(o);
      const scale = [1568, 1760, 2093, 2349, 2637, 3136];
      const n = m === 'death' ? 6 : 3;
      const ps = [];
      for (let i = 0; i < n; i++) {
        const f = m === 'death' ? scale[scale.length - 1 - i] : pick(scale);
        ps.push(bell(t + i * (m === 'death' ? 0.09 : 0.07), f, { peak: 0.04, d: 0.9, ratio: 3.01, index: 0.6, dest }));
      }
      ps.push(swell(t, { type: 'highpass', f: 5000, q: 0.6, a: 0.1, hold: 0.1, r: 0.4, peak: 0.012, dest }));
      return ps;
    },
    troll(t, o, dest) {
      const m = mood(o);
      if (m === 'idle') return P(vocal(t, { f: 62, f2: 55, dur: 0.9, vowel: 'oh', q: 5, peak: 0.11, breath: 0.4, rough: 16, roughDepth: 0.7 }, dest));
      return P(roar(t, dest, { f: 78, f2: 58, dur: m === 'death' ? 1.5 : 1.1, peak: 0.16, rough: 18, vowel: 'ah', vowel2: 'uh', sub: 42 }), m === 'death' ? body(t + 1.2, dest, 0.6) : null);
    },
    golem(t, o, dest) {
      const m = mood(o);
      const dur = m === 'death' ? 1.6 : 1.1;
      const grind = swell(t, { f: 350, q: 2, a: 0.2, hold: dur * 0.5, r: 0.4, peak: 0.06, dest });
      const lfo = kit.osc('square', 11);
      const lg = kit.gain(0.08);
      lfo.connect(lg); lg.connect(grind.nodes[1].gain);
      const ps = [swell(t, { type: 'lowpass', f: 120, q: 0.8, a: 0.2, hold: dur * 0.5, r: 0.6, peak: 0.17, buffer: kit.brown, dest }), { srcs: [...grind.srcs, lfo], nodes: [...grind.nodes, lg], end: grind.end }];
      for (let i = 0; i < 5; i++) ps.push(tone(t + rand(0.1, dur), { type: 'triangle', f: rand(220, 420), peak: 0.04, d: 0.05, dest }));
      if (m === 'death') ps.push(...grains(t + 0.8, 14, 0.8, { f: [800, 3000], peak: [0.02, 0.05], dest }), ...body(t + 1.3, dest, 0.5));
      return ps;
    },
    imp(t, o, dest) {
      const m = mood(o);
      if (m === 'hurt' || m === 'death') return P(vocal(t, { contour: [[0, 700], [0.3, 380]], dur: 0.35, vowel: 'ee', fscale: 1.3, q: 6, peak: 0.07 }, dest), m === 'death' ? swell(t, { f: 1500, f2: 400, q: 0.8, a: 0.02, hold: 0.1, r: 0.4, peak: 0.05, dest }) : null);
      const ps = [];
      for (let i = 0; i < 5; i++) ps.push(vocal(t + i * 0.1, { f: 640 - i * 35, f2: 560 - i * 35, dur: 0.07, vowel: i % 2 ? 'ee' : 'eh', fscale: 1.3, q: 6, peak: 0.055, breath: 0.2 }, dest));
      return ps;
    },
    drake(t, o, dest) {
      const m = mood(o);
      if (m === 'attack' && Math.random() < 0.5) return P(fireBreath(t, dest, 0.9));
      return P(roar(t, dest, { f: 125, f2: 85, dur: m === 'death' ? 1.5 : 1, peak: 0.15, rough: 30, sub: 55 }), m === 'death' ? body(t + 1.2, dest, 0.6) : null);
    },
    wyrm(t, o, dest) {
      const m = mood(o);
      if (m === 'attack' && Math.random() < 0.55) return P(roar(t, dest, { f: 85, f2: 65, dur: 0.6, peak: 0.12, rough: 22, sub: 40 }), fireBreath(t + 0.3, dest, 1.4));
      if (m === 'enrage') return P(roar(t, dest, { f: 95, f2: 60, dur: 2.4, peak: 0.2, rough: 26, vowel: 'ah', vowel2: 'ah', sub: 40 }), swell(t, { type: 'lowpass', f: 120, q: 0.8, a: 0.2, hold: 1, r: 1, peak: 0.18, buffer: kit.brown, dest }));
      return P(roar(t, dest, { f: 80, f2: 52, dur: m === 'death' ? 2.6 : 1.9, peak: 0.18, rough: 21, vowel: 'ah', vowel2: 'oo', sub: 38 }), swell(t, { type: 'lowpass', f: 90, q: 0.8, a: 0.3, hold: 0.8, r: 1, peak: 0.16, buffer: kit.brown, dest }), m === 'death' ? body(t + 2.2, dest, 0.4) : null);
    },
  };
  return S;
}
