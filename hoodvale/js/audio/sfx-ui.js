// Interface and reward sounds: clicks, windows, dialogue blips, the Robinhood Chain tx chime,
// coins-adjacent ledger ticks, XP ticks, level-up fanfares (combat / gathering / artisan, bigger at
// milestones), quest jingles, Orbio Oracle hum + tier chimes, shop bell, death sting, peers, emotes.
// Each entry: (t, opts, dest) -> parts[]. Owner: audio builder.

export function defineUi(L) {
  const { tone, noise, swell, bell, metal, vocal, grains, note, drum, rand } = L;
  const P = (...ps) => ps.flat(4).filter(Boolean);
  const notes = (inst, dest, seq, vel = 1, o) => seq.map(([at, m, d, v]) => note(at, inst, m, d, (v ?? 1) * vel, dest, o));

  const S = {
    // ---------------------------------------------------------------- interface
    'ui-click'(t, o, dest) { return P(tone(t, { f: 1650, peak: 0.035, d: 0.025, dest }), tone(t, { type: 'triangle', f: 820, peak: 0.02, d: 0.035, dest })); },
    'ui-tab'(t, o, dest) { return P(tone(t, { f: 1250, peak: 0.028, d: 0.025, dest }), noise(t, { f: 4000, q: 1.5, peak: 0.008, d: 0.015, dest })); },
    'ui-menu'(t, o, dest) { return P(tone(t, { f: 2100, peak: 0.018, d: 0.02, dest })); },
    'ui-open'(t, o, dest) { return P(noise(t, { f: 1100, f2: 2600, glide: 0.14, q: 1.1, a: 0.02, peak: 0.022, d: 0.13, dest }), tone(t + 0.02, { type: 'triangle', f: 620, peak: 0.012, d: 0.06, dest })); },
    'ui-close'(t, o, dest) { return P(noise(t, { f: 2600, f2: 1100, glide: 0.12, q: 1.1, a: 0.01, peak: 0.02, d: 0.11, dest }), tone(t + 0.02, { type: 'triangle', f: 460, peak: 0.012, d: 0.06, dest })); },
    'ui-error'(t, o, dest) { return P(tone(t, { type: 'triangle', f: 330, peak: 0.05, d: 0.09, dest }), tone(t + 0.1, { type: 'triangle', f: 247, peak: 0.05, d: 0.14, dest })); },
    blip(t, o, dest) {
      const p = o.pitch ?? 1;
      if (o.kind === 'oracle') return P(bell(t, (p > 20 ? p : 1100 * p) * rand(0.97, 1.03), { peak: 0.022 * (o.volume ?? 1), d: 0.18, ratio: 3.01, index: 0.5, dest }));
      const f = (p > 20 ? p : 380 * p) * rand(0.96, 1.04);
      return P(tone(t, { type: 'triangle', f, peak: 0.04 * (o.volume ?? 1), a: 0.004, d: 0.045, dest }), tone(t, { f: f * 2, peak: 0.008, d: 0.03, dest }));
    },
    'dialogue-open'(t, o, dest) { return P(noise(t, { f: 900, f2: 2400, glide: 0.18, q: 1, a: 0.03, peak: 0.02, d: 0.16, dest }), bell(t + 0.06, 784, { peak: 0.025, d: 0.7, ratio: 2, index: 0.4, dest })); },
    'dialogue-close'(t, o, dest) { return P(noise(t, { f: 2200, f2: 900, glide: 0.15, q: 1, a: 0.01, peak: 0.015, d: 0.13, dest })); },
    message(t, o, dest) { return P(tone(t, { f: 900, f2: 1300, glide: 0.04, peak: 0.025, d: 0.06, dest })); },
    'peer-join'(t, o, dest) { return P(bell(t, 1047, { peak: 0.025, d: 0.6, ratio: 2, index: 0.4, dest }), bell(t + 0.09, 1568, { peak: 0.025, d: 0.8, ratio: 2, index: 0.4, dest })); },
    'peer-leave'(t, o, dest) { return P(bell(t, 1568, { peak: 0.02, d: 0.5, ratio: 2, index: 0.4, dest }), bell(t + 0.09, 1047, { peak: 0.02, d: 0.7, ratio: 2, index: 0.4, dest })); },
    xp(t, o, dest) { return P(tone(t, { f: 2093, peak: 0.014, d: 0.045, dest }), tone(t, { type: 'triangle', f: 4186, peak: 0.004, d: 0.03, dest })); },

    // ---------------------------------------------------------------- Robinhood Chain (simulated)
    // A gentle digital "hash settles" figure: a stutter of tiny ticks, then a two-tone square blip
    // a fifth up (credit) or a fourth down (debit), softened through a lowpass.
    chain(t, o, dest) {
      const up = (o.delta ?? 1) >= 0;
      const lp = L.kit.filter('lowpass', 3400, 0.7);
      lp.connect(dest);
      const a = up ? 1318.5 : 1568, b = up ? 1975.5 : 1174.7;
      const ps = [];
      for (let i = 0; i < 3; i++) ps.push(tone(t + i * 0.018, { type: 'square', f: 4186, peak: 0.006, d: 0.008, dest: lp }));
      ps.push(tone(t + 0.06, { type: 'square', f: a, peak: 0.04, d: 0.05, dest: lp }), tone(t + 0.11, { type: 'square', f: b, peak: 0.04, d: up ? 0.16 : 0.1, dest: lp }));
      ps.push(bell(t + 0.11, b * 2, { peak: 0.022, d: 0.4, ratio: 1.5, index: 0.5, dest }));
      ps[0].nodes.push(lp);
      return ps;
    },
    'chain-confirm'(t, o, dest) { return P(tone(t, { type: 'square', f: 2637, peak: 0.004, d: 0.03, dest }), tone(t + 0.03, { f: 3951, peak: 0.006, d: 0.06, dest })); },

    // ---------------------------------------------------------------- level-ups
    'level-combat'(t, o, dest) {
      const big = !!o.milestone;
      const ps = [
        notes('horn', dest, [[t, 67, 0.13], [t + 0.15, 72, 0.13], [t + 0.3, 76, 0.13], [t + 0.45, 79, big ? 1.6 : 1.1]], 1),
        notes('horn', dest, [[t + 0.45, 64, big ? 1.6 : 1.1, 0.7], [t + 0.45, 60, big ? 1.6 : 1.1, 0.6]], 1),
        notes('timpani', dest, [[t, 43, 0.3, 0.7], [t + 0.15, 43, 0.3, 0.6], [t + 0.3, 43, 0.3, 0.75], [t + 0.45, 36, 1, 1]]),
        drum(t + 0.45, 'S', 0.9, dest), drum(t, 'C', 0.6, dest, { dur: 0.45 }),
      ];
      if (big) ps.push(note(t + 0.45, 'choir', [60, 64, 67, 72], 1.8, 0.9, dest, { vowel: 'ah' }), notes('horn', dest, [[t + 1.7, 72, 0.18], [t + 1.9, 79, 0.9]]), drum(t + 1.9, 'B', 0.9, dest));
      return ps;
    },
    'level-gathering'(t, o, dest) {
      const big = !!o.milestone;
      const gl = [72, 74, 76, 79, 81, 84, 86, 88].map((m, i) => [t + i * 0.03, m, 0.6, 0.6]);
      const ps = [
        notes('harp', dest, gl, 0.8),
        notes('recorder', dest, [[t + 0.12, 79, 0.12], [t + 0.24, 84, 0.12], [t + 0.36, 88, big ? 1.4 : 0.9]], 1),
        [0, 1, 2, 3].map((i) => note(t + 0.36 + i * 0.016, 'lute', [60, 64, 67, 72][i], 0.9, 0.9, dest)),
        drum(t + 0.36, 'T', 0.9, dest), drum(t + 0.36, 'K', 0.8, dest), drum(t + 0.36, 'j', 0.8, dest),
      ];
      if (big) ps.push(notes('recorder', dest, [[t + 1.5, 86, 0.15], [t + 1.65, 88, 0.15], [t + 1.8, 91, 0.9]]), note(t + 1.8, 'strings', [60, 67, 72, 76], 1.2, 0.8, dest), drum(t + 1.8, 'T', 1, dest));
      return ps;
    },
    'level-artisan'(t, o, dest) {
      const big = !!o.milestone;
      const ps = [
        notes('bell', dest, [[t, 79, 1, 0.8], [t + 0.1, 84, 1, 0.8], [t + 0.2, 88, 1.2, 0.8], [t + 0.3, 91, 1.6, 0.9]]),
        L.metal(t + 0.3, 1180, { peak: 0.06, d: 1.2, dest }),
        note(t + 0.3, 'glass', [60, 64, 67, 72], big ? 2.2 : 1.4, 0.9, dest, { release: 1.2 }),
        note(t + 0.3, 'celesta', 96, 0.5, 0.6, dest),
      ];
      if (big) ps.push(notes('bell', dest, [[t + 1.3, 84, 1.2], [t + 1.4, 88, 1.2], [t + 1.5, 91, 1.2], [t + 1.6, 96, 1.6]]), note(t + 1.3, 'choir', [60, 64, 67], 1.6, 0.8, dest, { vowel: 'oo' }));
      return ps;
    },

    discover(t, o, dest) {
      return P(notes('harp', dest, [62, 66, 69, 74, 78, 81, 86].map((m, i) => [t + i * 0.045, m, 1.2, 0.55])), note(t + 0.3, 'horn', 69, 0.9, 0.7, dest), note(t + 0.3, 'strings', [62, 69, 74], 1.6, 0.6, dest));
    },
    // ---------------------------------------------------------------- quests
    'quest-start'(t, o, dest) {
      return P(notes('horn', dest, [[t, 62, 0.28], [t + 0.3, 69, 0.75]]), notes('harp', dest, [62, 66, 69, 74, 78, 81].map((m, i) => [t + 0.3 + i * 0.04, m, 0.8, 0.6])), drum(t + 0.3, 'K', 0.8, dest));
    },
    'quest-update'(t, o, dest) { return P(grains(t, 7, 0.3, { f: [4000, 7000], q: 3, peak: [0.006, 0.014], d: [0.01, 0.03], dest }), bell(t + 0.3, 1175, { peak: 0.03, d: 0.9, ratio: 2, index: 0.5, dest })); },
    'quest-complete'(t, o, dest) {
      const chord = (at, ms, v = 0.8) => ms.map((m, i) => note(at + i * 0.018, 'lute', m, 0.7, v, dest));
      return P(
        chord(t, [55, 59, 62, 67]), chord(t + 0.6, [60, 64, 67, 72]), chord(t + 1.2, [62, 66, 69, 74]), chord(t + 1.8, [55, 59, 62, 67], 1),
        notes('recorder', dest, [[t, 74, 0.28], [t + 0.3, 79, 0.28], [t + 0.6, 78, 0.18], [t + 0.8, 76, 0.18], [t + 1.0, 74, 0.18], [t + 1.2, 76, 0.28], [t + 1.5, 78, 0.28], [t + 1.8, 79, 1.5]]),
        notes('bell', dest, [[t + 1.8, 91, 1.4, 0.7], [t + 1.88, 95, 1.4, 0.6], [t + 1.96, 98, 1.6, 0.6]]),
        note(t + 1.8, 'choir', [55, 62, 67, 71], 1.8, 0.8, dest, { vowel: 'ah' }),
        note(t + 1.8, 'timpani', 43, 1, 1, dest), drum(t, 'K', 0.7, dest), drum(t + 0.6, 'K', 0.6, dest), drum(t + 1.2, 'K', 0.7, dest), drum(t + 1.3, 'C', 0.6, dest, { dur: 0.5 }),
      );
    },

    // ---------------------------------------------------------------- Orbio Oracle
    'oracle-hum'(t, o, dest) {
      const dur = o.seconds ?? 2.2;
      return P(note(t, 'glass', [65, 72, 76, 83], dur, 0.9, dest, { release: 1 }), swell(t, { type: 'highpass', f: 3500, f2: 6000, q: 0.6, a: dur * 0.5, hold: 0.2, r: 0.8, peak: 0.012, dest }));
    },
    'oracle-spark'(t, o, dest) { return P(bell(t, 2093, { peak: 0.05, d: 0.9, ratio: 3.5, index: 1.2, dest }), grains(t, 6, 0.25, { type: 'highpass', f: [5000, 9000], peak: [0.008, 0.02], dest })); },
    'oracle-lamp'(t, o, dest) { return P(bell(t, 698.5, { peak: 0.05, d: 1.4, ratio: 2.76, index: 0.7, dest }), bell(t + 0.14, 1046.5, { peak: 0.05, d: 1.6, ratio: 2.76, index: 0.7, dest }), note(t + 0.1, 'glass', [65, 72], 1, 0.6, dest)); },
    'oracle-beacon'(t, o, dest) {
      return P([698.5, 880, 1046.5, 1318.5, 1568].map((f, i) => bell(t + i * 0.09, f, { peak: 0.045, d: 1.8, ratio: 2.76, index: 0.7, dest })),
        note(t + 0.2, 'glass', [65, 69, 72, 76, 83], 2, 0.9, dest, { release: 1.3 }), note(t + 0.35, 'choir', [65, 72, 77], 1.6, 0.6, dest, { vowel: 'oo' }),
        swell(t, { type: 'highpass', f: 3000, f2: 8000, q: 0.6, a: 0.4, hold: 0.3, r: 1, peak: 0.015, dest }),
        o.live ? S.chain(t + 0.5, { delta: 1 }, dest) : null);
    },

    // ---------------------------------------------------------------- shops, death, emotes
    'shop-bell'(t, o, dest) { return P(bell(t, 1760, { peak: 0.04, d: 0.9, ratio: 2.4, index: 0.8, dest }), bell(t + 0.12, 1760, { peak: 0.03, d: 0.8, ratio: 2.4, index: 0.8, dest })); },
    exchange(t, o, dest) { return P(S['shop-bell'](t, o, dest), S.chain(t + 0.3, { delta: 1 }, dest)); },
    death(t, o, dest) {
      return P(note(t, 'strings', [50, 57, 62, 65], 2.2, 0.9, dest, { attack: 0.15, release: 1.4 }),
        notes('horn', dest, [[t, 69, 0.42], [t + 0.45, 65, 0.42], [t + 0.9, 62, 1.4]], 0.9),
        note(t, 'timpani', 38, 1, 1, dest), note(t + 0.9, 'timpani', 38, 1, 0.8, dest), note(t + 0.9, 'churchbell', 50, 3, 0.7, dest));
    },
    'emote-clap'(t, o, dest) {
      return P([0, 1, 2, 3].map((i) => [noise(t + i * 0.27, { f: 1300, q: 1, peak: 0.07, d: 0.05, dest }), noise(t + i * 0.27, { type: 'highpass', f: 3200, peak: 0.03, d: 0.03, dest })]));
    },
    'emote-cheer'(t, o, dest) { return P([210, 265, 320].map((f, i) => vocal(t + i * 0.03, { contour: [[0, f], [0.15, f * 1.3], [0.5, f * 1.1]], dur: 0.55, vowel: 'eh', vowel2: 'ah', q: 6, peak: 0.035, breath: 0.3 }, dest)), S['emote-clap'](t + 0.3, o, dest)); },
    'emote-wave'(t, o, dest) { return P(noise(t, { f: 1500, f2: 2500, glide: 0.2, q: 1, a: 0.05, peak: 0.02, d: 0.2, dest })); },
    'emote-dance'(t, o, dest) {
      return P(notes('recorder', dest, [[t, 79, 0.12], [t + 0.13, 81, 0.12], [t + 0.26, 83, 0.12], [t + 0.39, 86, 0.3]], 0.8), drum(t, 'T', 0.7, dest), drum(t + 0.39, 'T', 0.9, dest), drum(t + 0.39, 'K', 0.7, dest));
    },
  };
  return S;
}
