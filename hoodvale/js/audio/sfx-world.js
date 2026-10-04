// World sound effects: footsteps by surface, gathering and artisan skills, items, banking, coins,
// doors/portals/teleports, and the ambient one-shots the ambience layer scatters around the
// listener (birds, gulls, owls, frogs, drips, rumbles, town and dock life). Owner: audio builder.
// Each entry: (t, opts, dest) -> parts[]. See sfx.js for the primitives.

export function defineWorld(L) {
  const { tone, noise, swell, bell, metal, vocal, grains, note, rand, pick, kit } = L;
  const parts = (...ps) => ps.flat(4).filter(Boolean);

  const S = {
    // ---------------------------------------------------------------- footsteps
    step(t, o, dest) {
      const r = rand(0.9, 1.1) * (o.pitch ?? 1);
      const v = (o.run ? 1.15 : 1) * rand(0.8, 1.05) * 0.6;
      switch (o.surface) {
        case 'wood': return parts(tone(t, { type: 'triangle', f: 175 * r, f2: 105 * r, glide: 0.06, peak: 0.16 * v, d: 0.11, dest }), noise(t, { f: 900 * r, q: 3, peak: 0.05 * v, d: 0.05, dest }));
        case 'stone': return parts(noise(t, { type: 'highpass', f: 1900 * r, q: 0.7, peak: 0.06 * v, d: 0.04, dest }), tone(t, { f: 250 * r, f2: 170, glide: 0.04, peak: 0.06 * v, d: 0.05, dest }));
        case 'cave': return parts(noise(t, { type: 'highpass', f: 1500 * r, q: 0.7, peak: 0.05 * v, d: 0.05, dest }), tone(t, { f: 160 * r, f2: 100, glide: 0.05, peak: 0.09 * v, d: 0.08, dest }), grains(t + 0.01, 2, 0.05, { f: [2500, 5000], peak: [0.01, 0.02], dest }));
        case 'crystal': return parts(S.step(t, { ...o, surface: 'stone' }, dest), tone(t + 0.01, { f: rand(2300, 3300), peak: 0.012 * v, d: 0.25, dest }));
        case 'gravel': return parts(noise(t, { f: 2800 * r, q: 0.6, peak: 0.06 * v, d: 0.08, dest }), grains(t, 4, 0.07, { f: [2000, 6000], peak: [0.012, 0.03], dest }), tone(t, { f: 120, f2: 75, glide: 0.05, peak: 0.05 * v, d: 0.05, dest }));
        case 'sand': return parts(noise(t, { type: 'lowpass', f: 850 * r, q: 0.6, a: 0.01, peak: 0.11 * v, d: 0.12, dest }), noise(t + 0.03, { f: 2600 * r, q: 0.8, peak: 0.025 * v, d: 0.06, dest }));
        case 'water': return parts(noise(t, { f: 1200 * r, f2: 500, glide: 0.16, q: 1.1, a: 0.01, peak: 0.13 * v, d: 0.2, dest }), tone(t + 0.05, { f: 600 * r, f2: 950 * r, glide: 0.05, peak: 0.02 * v, d: 0.06, dest }));
        case 'mud': return parts(noise(t, { type: 'lowpass', f: 650 * r, q: 1, a: 0.01, peak: 0.12 * v, d: 0.12, dest }), tone(t + 0.04, { f: 180 * r, f2: 360 * r, glide: 0.06, peak: 0.04 * v, d: 0.08, dest }), noise(t + 0.05, { f: 900, q: 4, peak: 0.03 * v, d: 0.05, dest }));
        case 'dirt': return parts(noise(t, { type: 'lowpass', f: 1100 * r, q: 0.8, a: 0.004, peak: 0.1 * v, d: 0.08, dest }), tone(t, { f: 110, f2: 70, glide: 0.05, peak: 0.06 * v, d: 0.06, dest }));
        case 'leaves': return parts(S.step(t, { ...o, surface: 'grass' }, dest), grains(t + 0.01, 3, 0.08, { type: 'highpass', f: [3000, 6000], peak: [0.01, 0.025], dest }));
        default: return parts(noise(t, { f: 2400 * r, q: 0.7, a: 0.003, peak: 0.07 * v, d: 0.08, dest }), noise(t + 0.03, { f: 3500 * r, q: 0.9, peak: 0.035 * v, d: 0.05, dest }), tone(t, { f: 95, f2: 60, glide: 0.04, peak: 0.04 * v, d: 0.05, dest }));
      }
    },

    // ---------------------------------------------------------------- woodcutting
    chop(t, o, dest) {
      const r = rand(0.92, 1.08);
      return parts(
        tone(t, { type: 'triangle', f: 230 * r, f2: 115 * r, glide: 0.05, peak: 0.26, d: 0.12, dest }),
        noise(t, { f: 1400 * r, q: 1.5, peak: 0.1, d: 0.07, dest }),
        noise(t, { type: 'highpass', f: 4200, q: 0.7, peak: 0.05, d: 0.015, dest }),
        tone(t + 0.004, { f: 340 * r, peak: 0.05, d: 0.16, dest }),
        grains(t + 0.04, 2, 0.06, { f: [2500, 4500], peak: [0.015, 0.03], dest }),
      );
    },
    log(t, o, dest) {
      return parts(tone(t, { type: 'triangle', f: 260, f2: 180, glide: 0.06, peak: 0.12, d: 0.09, dest }), tone(t + 0.07, { type: 'triangle', f: 410, f2: 300, glide: 0.05, peak: 0.07, d: 0.07, dest }), noise(t, { f: 1800, q: 1, peak: 0.03, d: 0.1, dest }));
    },
    'tree-fall'(t, o, dest) {
      const creak = vocal(t, { type: 'sawtooth', contour: [[0, 140], [0.7, 85]], dur: 0.8, formants: [400, 1100, 2400], q: 9, rough: 23, roughDepth: 0.8, peak: 0.08 }, dest);
      return parts(creak, swell(t + 0.75, { type: 'lowpass', f: 900, q: 0.7, a: 0.03, hold: 0.1, r: 0.6, peak: 0.12, buffer: kit.brown, dest }),
        swell(t + 0.75, { type: 'highpass', f: 2500, q: 0.6, a: 0.05, hold: 0.1, r: 0.5, peak: 0.04, dest }),
        tone(t + 0.78, { f: 70, f2: 38, glide: 0.25, peak: 0.35, d: 0.45, dest }));
    },

    // ---------------------------------------------------------------- mining
    mine(t, o, dest) {
      const r = rand(0.93, 1.07);
      return parts(
        metal(t, 2250 * r, { peak: 0.09, d: 0.22, ratios: [1, 1.47, 2.09, 2.56], decays: [1, 0.7, 0.5, 0.4], dest }),
        noise(t, { f: 1800, q: 1, peak: 0.1, d: 0.05, dest }),
        tone(t, { f: 150, f2: 90, glide: 0.04, peak: 0.12, d: 0.06, dest }),
        grains(t + 0.02, 3, 0.08, { f: [2500, 5000], peak: [0.015, 0.035], dest }),
      );
    },
    ore(t, o, dest) {
      return parts(noise(t, { type: 'lowpass', f: 1500, q: 0.8, peak: 0.13, d: 0.14, dest }), tone(t, { f: 95, f2: 50, glide: 0.1, peak: 0.16, d: 0.15, dest }),
        grains(t + 0.03, 8, 0.35, { f: [1800, 5000], peak: [0.012, 0.035], dest }), metal(t + 0.02, 3100, { peak: 0.025, d: 0.15, dest }));
    },
    'rock-deplete'(t, o, dest) { return parts(S.ore(t, o, dest), grains(t + 0.1, 10, 0.6, { f: [1000, 4000], peak: [0.01, 0.03], dest })); },

    // ---------------------------------------------------------------- fishing
    'fish-cast'(t, o, dest) {
      return parts(
        noise(t, { f: 1500, f2: 3800, glide: 0.12, q: 1.4, a: 0.03, peak: 0.07, d: 0.16, dest }),
        tone(t + 0.08, { f: 1900, f2: 900, glide: 0.4, a: 0.02, peak: 0.01, d: 0.4, dest }),
        S['fish-plop'](t + 0.55, o, dest),
      );
    },
    'fish-plop'(t, o, dest) {
      return parts(tone(t, { f: 520, f2: 150, glide: 0.08, peak: 0.08, d: 0.1, dest }), noise(t, { type: 'lowpass', f: 1300, q: 0.8, peak: 0.04, d: 0.12, dest }),
        tone(t + rand(0.08, 0.15), { f: rand(700, 1000), f2: rand(1200, 1600), glide: 0.04, peak: 0.015, d: 0.04, dest }));
    },
    'fish-net'(t, o, dest) {
      return parts(swell(t, { f: 2600, q: 0.8, a: 0.1, hold: 0.1, r: 0.2, peak: 0.03, dest }), S['fish-splash'](t + 0.4, { size: 0.8 }, dest));
    },
    'fish-splash'(t, o, dest) {
      const s = o.size ?? 1;
      const ps = [noise(t, { type: 'lowpass', f: 2600, f2: 600, glide: 0.3, q: 0.8, a: 0.004, peak: 0.11 * s, d: 0.35, dest })];
      for (let i = 0; i < 4; i++) ps.push(tone(t + rand(0.04, 0.3), { f: rand(500, 900), f2: rand(1000, 1600), glide: 0.04, peak: 0.018 * s, d: 0.05, dest }));
      return ps;
    },
    'fish-reel'(t, o, dest) {
      const ps = [];
      const n = 12;
      for (let i = 0; i < n; i++) {
        const tt = t + i * (0.036 - i * 0.0008);
        ps.push(tone(tt, { type: 'triangle', f: 2900, peak: 0.02, d: 0.012, dest }), noise(tt, { type: 'highpass', f: 5000, peak: 0.008, d: 0.01, dest }));
      }
      return ps;
    },
    'fish-catch'(t, o, dest) {
      return parts(S['fish-splash'](t, { size: 1.2 }, dest), noise(t + 0.25, { f: 800, q: 1, peak: 0.08, d: 0.05, dest }), noise(t + 0.4, { f: 700, q: 1, peak: 0.06, d: 0.05, dest }),
        tone(t + 0.25, { f: 190, f2: 120, glide: 0.06, peak: 0.08, d: 0.07, dest }));
    },
    harpoon(t, o, dest) {
      return parts(noise(t, { f: 900, f2: 2600, glide: 0.12, q: 1.2, a: 0.02, peak: 0.08, d: 0.15, dest }), tone(t + 0.15, { f: 220, f2: 90, glide: 0.08, peak: 0.12, d: 0.1, dest }), S['fish-splash'](t + 0.15, { size: 0.9 }, dest));
    },
    cage(t, o, dest) {
      return parts(grains(t, 5, 0.25, { f: [1500, 3000], q: 3, peak: [0.02, 0.04], dest }), S['fish-splash'](t + 0.3, { size: 0.7 }, dest));
    },

    // ---------------------------------------------------------------- firemaking / cooking
    'fire-strike'(t, o, dest) {
      return parts(noise(t, { f: 4500, q: 2, peak: 0.08, d: 0.04, dest }), noise(t + 0.13, { f: 5000, q: 2, peak: 0.07, d: 0.035, dest }),
        grains(t + 0.02, 4, 0.2, { type: 'highpass', f: [5000, 8000], peak: [0.01, 0.025], d: [0.005, 0.02], dest }));
    },
    'fire-light'(t, o, dest) {
      return parts(swell(t, { type: 'lowpass', f: 300, f2: 2600, q: 0.8, a: 0.15, hold: 0.1, r: 0.6, peak: 0.12, dest }), tone(t, { f: 85, f2: 45, glide: 0.3, peak: 0.08, d: 0.35, dest }),
        grains(t + 0.2, 10, 1.2, { f: [2200, 6500], q: 1.6, peak: [0.02, 0.06], dest }));
    },
    'fire-out'(t, o, dest) {
      return parts(swell(t, { type: 'highpass', f: 2600, f2: 1200, q: 0.6, a: 0.02, hold: 0.1, r: 0.5, peak: 0.03, dest }), grains(t, 4, 0.3, { f: [2000, 5000], peak: [0.008, 0.02], dest }));
    },
    'fire-crackle'(t, o, dest) { return grains(t, 6, 0.6, { f: [1800, 6500], q: 1.6, peak: [0.015, 0.05], dest }); },
    cook(t, o, dest) {
      return parts(swell(t, { type: 'highpass', f: 2600, q: 0.6, a: 0.06, hold: 0.5, r: 0.5, peak: 0.035, dest }), grains(t + 0.05, 14, 1.0, { f: [3000, 7500], q: 1.5, peak: [0.01, 0.03], dest }));
    },
    burn(t, o, dest) {
      return parts(noise(t, { type: 'lowpass', f: 420, q: 0.8, peak: 0.14, d: 0.2, buffer: kit.brown, dest }), swell(t, { type: 'highpass', f: 3200, q: 0.6, a: 0.02, hold: 0.2, r: 0.6, peak: 0.04, dest }), tone(t, { f: 120, f2: 70, glide: 0.15, peak: 0.08, d: 0.2, dest }));
    },

    // ---------------------------------------------------------------- smithing / artisan
    smelt(t, o, dest) {
      return parts(
        swell(t, { type: 'lowpass', f: 220, f2: 520, f3: 260, q: 0.8, a: 0.3, hold: 0.4, r: 0.7, peak: 0.16, buffer: kit.brown, dest }),
        swell(t + 0.1, { f: 900, q: 0.9, a: 0.25, hold: 0.3, r: 0.6, peak: 0.04, dest }),
        swell(t + 0.05, { f: 600, f2: 1100, q: 1.2, a: 0.15, hold: 0, r: 0.3, peak: 0.04, dest }),
        metal(t + 1.15, 1500, { peak: 0.04, d: 0.4, dest }),
      );
    },
    anvil(t, o, dest) {
      const r = rand(0.97, 1.03) * (o.pitch ?? 1);
      return parts(metal(t, 1180 * r, { peak: 0.12, d: 1.0, ratios: [1, 2.76, 5.4, 8.93], decays: [0.9, 0.5, 0.25, 0.12], dest }),
        noise(t, { type: 'highpass', f: 3000, q: 0.7, peak: 0.06, d: 0.02, dest }), tone(t, { f: 300, f2: 180, glide: 0.04, peak: 0.07, d: 0.05, dest }));
    },
    fletch(t, o, dest) {
      const ps = [];
      for (let i = 0; i < 3; i++) ps.push(noise(t + i * 0.11 + rand(0, 0.02), { f: rand(2600, 3400), f2: rand(3800, 4600), glide: 0.06, q: 2.5, a: 0.01, peak: 0.045, d: 0.07, dest }));
      return ps;
    },
    string(t, o, dest) { return parts(note(t, 'lute', 52, 0.5, 0.6, dest, { ring: 0.6 }), tone(t, { type: 'triangle', f: 210, peak: 0.03, d: 0.05, dest })); },
    craft(t, o, dest) {
      return parts(tone(t, { type: 'triangle', f: 620, peak: 0.04, d: 0.03, dest }), tone(t + 0.16, { type: 'triangle', f: 580, peak: 0.04, d: 0.03, dest }),
        noise(t + 0.25, { f: 2500, f2: 4200, glide: 0.18, q: 2, a: 0.04, peak: 0.03, d: 0.15, dest }));
    },
    'gem-cut'(t, o, dest) {
      return parts(metal(t, 3200, { peak: 0.04, d: 0.15, dest }), metal(t + 0.14, 3400, { peak: 0.04, d: 0.15, dest }), bell(t + 0.3, 2093, { peak: 0.04, d: 0.8, dest }), bell(t + 0.38, 3136, { peak: 0.03, d: 0.7, dest }));
    },
    spin(t, o, dest) {
      const s = swell(t, { f: 320, f2: 520, q: 1.5, a: 0.2, hold: 0.6, r: 0.4, peak: 0.05, dest });
      const lfo = kit.osc('sine', 8.5);
      const lg = kit.gain(0.025);
      lfo.connect(lg); lg.connect(s.nodes[1].gain);
      return parts({ srcs: [...s.srcs, lfo], nodes: [...s.nodes, lg], end: s.end }, grains(t + 0.1, 4, 1, { f: [800, 1400], q: 4, peak: [0.02, 0.04], dest }));
    },
    inscribe(t, o, dest) {
      return parts(note(t, 'glass', [77, 84, 88], 0.8, 0.8, dest, { release: 0.8 }), bell(t + 0.5, 2637, { peak: 0.05, d: 1.2, dest }), swell(t, { type: 'highpass', f: 3000, q: 0.6, a: 0.4, hold: 0.2, r: 0.5, peak: 0.015, dest }));
    },
    pick(t, o, dest) {
      return parts(noise(t, { f: 3200, q: 0.8, a: 0.02, peak: 0.05, d: 0.12, dest }), noise(t + 0.1, { f: 2800, q: 0.8, a: 0.02, peak: 0.04, d: 0.1, dest }), tone(t + 0.18, { type: 'triangle', f: 900, peak: 0.02, d: 0.02, dest }));
    },
    bucket(t, o, dest) {
      return parts(tone(t, { f: 320, f2: 640, glide: 0.5, a: 0.05, peak: 0.02, d: 0.5, dest }), swell(t, { f: 1000, q: 1, a: 0.05, hold: 0.25, r: 0.3, peak: 0.05, dest }),
        S['fish-plop'](t + 0.05, o, dest));
    },
    milk(t, o, dest) { return parts(noise(t, { f: 2500, q: 2, peak: 0.05, d: 0.08, dest }), noise(t + 0.25, { f: 2300, q: 2, peak: 0.05, d: 0.08, dest }), tone(t + 0.3, { f: 900, f2: 1100, glide: 0.05, peak: 0.015, d: 0.06, dest })); },
    grain(t, o, dest) { return parts(swell(t, { f: 4000, q: 0.9, a: 0.1, hold: 0.5, r: 0.4, peak: 0.03, dest }), grains(t, 16, 0.9, { f: [3000, 7000], peak: [0.008, 0.02], dest })); },
    thieve(t, o, dest) { return parts(noise(t, { f: 2200, f2: 3500, glide: 0.15, q: 1, a: 0.03, peak: 0.04, d: 0.15, dest }), S.coins(t + 0.15, { n: 3 }, dest)); },
    stun(t, o, dest) {
      return parts(tone(t, { f: 160, f2: 70, glide: 0.1, peak: 0.25, d: 0.15, dest }), noise(t, { type: 'lowpass', f: 900, peak: 0.08, d: 0.08, dest }),
        [0, 1, 2].map((i) => tone(t + 0.2 + i * 0.16, { f: 1600 + i * 120, f2: 2200 + i * 120, glide: 0.08, peak: 0.03, d: 0.12, dest })));
    },

    // ---------------------------------------------------------------- items
    eat(t, o, dest) {
      const ps = [];
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.17;
        ps.push(noise(tt, { f: rand(1400, 2600), q: 1.2, peak: 0.07, d: 0.06, dest }), grains(tt, 3, 0.04, { f: [2500, 5000], peak: [0.01, 0.025], dest }), tone(tt, { f: 140, f2: 90, glide: 0.04, peak: 0.05, d: 0.04, dest }));
      }
      ps.push(tone(t + 0.6, { f: 220, f2: 120, glide: 0.1, peak: 0.05, d: 0.1, dest }));
      return ps.flat();
    },
    drink(t, o, dest) { return parts([0, 0.32].map((d) => [tone(t + d, { f: 300, f2: 170, glide: 0.09, peak: 0.08, d: 0.1, dest }), noise(t + d, { type: 'lowpass', f: 700, peak: 0.03, d: 0.1, dest })])); },
    pickup(t, o, dest) { return parts(noise(t, { f: 1600, f2: 2800, glide: 0.08, q: 1.1, a: 0.01, peak: 0.04, d: 0.08, dest }), tone(t + 0.04, { type: 'triangle', f: 980, peak: 0.03, d: 0.05, dest })); },
    'item-drop'(t, o, dest) { return parts(tone(t, { f: 170, f2: 90, glide: 0.06, peak: 0.09, d: 0.08, dest }), noise(t, { type: 'lowpass', f: 800, peak: 0.04, d: 0.06, dest })); },
    'loot-rare'(t, o, dest) {
      return parts([0, 1, 2, 3].map((i) => bell(t + i * 0.07, [1568, 1976, 2349, 3136][i], { peak: 0.05, d: 1.2, ratio: 2.76, index: 0.7, dest })),
        swell(t, { type: 'highpass', f: 4000, q: 0.6, a: 0.1, hold: 0.1, r: 0.6, peak: 0.02, dest }));
    },
    equip(t, o, dest) {
      return parts(noise(t, { f: 2000, q: 0.9, a: 0.03, peak: 0.04, d: 0.14, dest }), o.metal === false ? null : metal(t + 0.05, 2600, { peak: 0.025, d: 0.25, dest }));
    },
    coins(t, o, dest) {
      const up = (o.delta ?? 1) >= 0;
      const n = o.n ?? (up ? 6 : 4);
      const ps = [];
      for (let i = 0; i < n; i++) {
        const tt = t + (up ? rand(0, 0.28) : i * 0.06 + rand(0, 0.02));
        ps.push(metal(tt, rand(up ? 3600 : 3000, up ? 5200 : 4200), { peak: rand(0.02, 0.04), d: 0.35, ratios: [1, 1.34, 2.15], decays: [1, 0.6, 0.4], dest }));
      }
      ps.push(tone(t, { f: 900, f2: 600, glide: 0.05, peak: 0.02, d: 0.05, dest }));
      return ps;
    },
    bank(t, o, dest) {
      const creak = vocal(t + 0.12, { type: 'sawtooth', contour: [[0, 120], [0.4, 155]], dur: 0.45, formants: [380, 900, 2100], q: 8, rough: 31, roughDepth: 0.85, peak: 0.035 }, dest);
      return parts(tone(t, { f: 95, f2: 60, glide: 0.1, peak: 0.16, d: 0.22, dest }), noise(t, { type: 'lowpass', f: 320, q: 0.8, peak: 0.08, d: 0.15, buffer: kit.brown, dest }),
        metal(t + 0.02, 1700, { peak: 0.03, d: 0.25, dest }), creak, S.coins(t + 0.55, { n: 3 }, dest));
    },
    deposit(t, o, dest) { return parts(noise(t, { f: 1500, f2: 900, glide: 0.08, q: 1, a: 0.01, peak: 0.03, d: 0.08, dest }), metal(t + 0.03, 3600, { peak: 0.018, d: 0.2, ratios: [1, 1.34], dest })); },
    withdraw(t, o, dest) { return parts(noise(t, { f: 900, f2: 1600, glide: 0.08, q: 1, a: 0.01, peak: 0.03, d: 0.08, dest }), metal(t + 0.03, 4200, { peak: 0.018, d: 0.2, ratios: [1, 1.34], dest })); },

    // ---------------------------------------------------------------- places, doors, travel
    door(t, o, dest) {
      const creak = vocal(t, { type: 'sawtooth', contour: [[0, 110], [0.3, 170], [0.6, 130]], dur: 0.65, formants: [420, 1000, 2300], q: 9, rough: 27, roughDepth: 0.85, peak: 0.04 }, dest);
      return parts(creak, tone(t + 0.62, { f: 110, f2: 60, glide: 0.08, peak: 0.16, d: 0.15, dest }), noise(t + 0.62, { type: 'lowpass', f: 600, peak: 0.05, d: 0.1, dest }));
    },
    chest(t, o, dest) {
      const creak = vocal(t, { type: 'sawtooth', contour: [[0, 140], [0.35, 190]], dur: 0.4, formants: [420, 1000, 2300], q: 9, rough: 33, roughDepth: 0.85, peak: 0.035 }, dest);
      return parts(metal(t, 2100, { peak: 0.03, d: 0.12, dest }), creak, S['loot-rare'](t + 0.45, o, dest));
    },
    portal(t, o, dest) {
      return parts(swell(t, { type: 'bandpass', f: 220, q: 1.5, a: 0.2, hold: 0.4, r: 0.4, peak: 0.12, buffer: kit.brown, dest }),
        swell(t + 0.1, { type: 'lowpass', f: 150, f2: 900, f3: 150, q: 1, a: 0.4, hold: 0.2, r: 0.7, peak: 0.12, dest }),
        tone(t, { f: 55, f2: 42, glide: 1, a: 0.2, peak: 0.2, d: 1.1, dest }), grains(t + 0.1, 6, 0.6, { f: [1200, 3000], peak: [0.01, 0.03], dest }));
    },
    stairs(t, o, dest) { return [0, 1, 2, 3].flatMap((i) => S.step(t + i * 0.2, { surface: o.surface || 'stone' }, dest)); },
    teleport(t, o, dest) {
      return parts(swell(t, { type: 'highpass', f: 1200, f2: 6000, q: 0.7, a: 0.15, hold: 0.2, r: 0.7, peak: 0.07, dest }),
        [0, 1, 2, 3, 4].map((i) => bell(t + 0.05 + i * 0.08, [784, 988, 1175, 1568, 1976][i], { peak: 0.045, d: 1.1, ratio: 2.76, index: 0.6, dest })),
        tone(t, { f: 220, f2: 1100, glide: 0.7, a: 0.1, peak: 0.03, d: 0.7, dest }));
    },
    respawn(t, o, dest) { return parts(note(t, 'glass', [62, 69, 74], 1.4, 0.9, dest, { release: 1.2 }), bell(t + 0.3, 1175, { peak: 0.05, d: 1.6, ratio: 2.76, index: 0.5, dest })); },

    // ---------------------------------------------------------------- ambient one-shots (ambience.js)
    'amb-bird'(t, o, dest) {
      const kind = o.kind ?? ((Math.random() * 4) | 0);
      const ps = [];
      if (kind === 0) { // quick warbling song
        let tt = t;
        const n = 3 + ((Math.random() * 5) | 0);
        const base = rand(2600, 4200);
        for (let i = 0; i < n; i++) {
          const f = base * rand(0.8, 1.3);
          ps.push(tone(tt, { f, f2: f * rand(0.6, 1.5), glide: 0.05, a: 0.005, peak: rand(0.015, 0.03), d: 0.06, dest }));
          tt += rand(0.06, 0.11);
        }
      } else if (kind === 1) { // two-note whistle (tit)
        const f = rand(3200, 4500);
        for (let i = 0; i < 3; i++) {
          ps.push(tone(t + i * 0.3, { f, f2: f * 0.98, glide: 0.08, a: 0.01, peak: 0.022, d: 0.09, dest }), tone(t + i * 0.3 + 0.13, { f: f * 0.78, peak: 0.018, a: 0.01, d: 0.1, dest }));
        }
      } else if (kind === 2) { // blackbird-like fluting phrase
        let tt = t;
        for (let i = 0; i < 4; i++) {
          const f = rand(1500, 2600);
          ps.push(tone(tt, { f, f2: f * rand(0.85, 1.25), glide: 0.12, a: 0.02, peak: 0.022, d: 0.16, dest }));
          tt += rand(0.13, 0.2);
        }
      } else { // single chirps
        for (let i = 0; i < 2; i++) ps.push(tone(t + i * 0.09, { f: rand(4000, 5500), f2: rand(2500, 3500), glide: 0.04, a: 0.003, peak: 0.02, d: 0.05, dest }));
      }
      return ps;
    },
    'amb-dove'(t, o, dest) {
      return [0, 0.45, 0.75].map((d, i) => vocal(t + d, { type: 'triangle', contour: [[0, 520], [0.25, 470]], dur: i === 0 ? 0.4 : 0.25, vowel: 'oo', fscale: 1, q: 4, peak: 0.03 }, dest));
    },
    'amb-gull'(t, o, dest) {
      const ps = [];
      const n = 1 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const f = rand(1100, 1500);
        ps.push(vocal(t + i * 0.32, { type: 'sawtooth', contour: [[0, f], [0.08, f * 1.35], [0.28, f * 0.8]], dur: 0.3, vowel: 'ee', vowel2: 'ah', fscale: 1.5, q: 5, peak: 0.035 }, dest));
      }
      return ps;
    },
    'amb-owl'(t, o, dest) {
      return [0, 0.55, 0.85].map((d, i) => vocal(t + d, { type: 'triangle', contour: [[0, 380], [0.3, 350]], dur: i === 0 ? 0.45 : 0.3, vowel: 'oo', q: 3, peak: 0.04, breath: 0.15 }, dest));
    },
    'amb-frog'(t, o, dest) {
      const ps = [];
      const f = rand(240, 420);
      const n = 2 + ((Math.random() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const tt = t + k * rand(0.22, 0.3);
        ps.push(vocal(tt, { type: 'square', f, f2: f * 0.85, dur: 0.14, formants: [f * 2.2, f * 4, 2400], q: 6, rough: rand(28, 40), roughDepth: 0.9, roughType: 'square', peak: 0.05 }, dest));
      }
      return ps;
    },
    'amb-drip'(t, o, dest) {
      const f = rand(900, 1700);
      return [tone(t, { f, f2: f * 2.2, glide: 0.03, a: 0.002, peak: 0.05, d: 0.06, dest }), tone(t + 0.02, { f: f * 1.5, peak: 0.01, d: 0.12, dest })];
    },
    'amb-rumble'(t, o, dest) {
      return [swell(t, { type: 'lowpass', f: 90, f2: 160, f3: 70, q: 0.9, a: 1, hold: 0.6, r: 1.4, peak: 0.12, buffer: kit.brown, dest }), grains(t + 1, 5, 1.2, { f: [600, 1600], peak: [0.005, 0.015], dest })].flat();
    },
    'amb-creak'(t, o, dest) {
      return [vocal(t, { type: 'sawtooth', contour: [[0, rand(90, 120)], [0.5, rand(130, 170)], [0.9, rand(95, 120)]], dur: 1.0, formants: [350, 900, 2000], q: 10, rough: rand(18, 26), roughDepth: 0.9, peak: 0.025 }, dest)];
    },
    'amb-buoy'(t, o, dest) { return [bell(t, 880, { peak: 0.04, d: 2.2, ratio: 2.4, index: 0.9, dest }), bell(t + 0.6, 880, { peak: 0.025, d: 1.8, ratio: 2.4, index: 0.9, dest })]; },
    'amb-hammer'(t, o, dest) { return [0, 0.42, 0.84].flatMap((d) => S.anvil(t + d, { pitch: rand(0.95, 1.05) }, dest)); },
    'amb-cart'(t, o, dest) {
      const ps = [swell(t, { type: 'lowpass', f: 500, q: 0.8, a: 0.4, hold: 0.8, r: 0.6, peak: 0.05, buffer: kit.brown, dest })];
      for (let i = 0; i < 9; i++) ps.push(tone(t + 0.2 + i * 0.17, { type: 'triangle', f: rand(180, 260), peak: 0.03, d: 0.05, dest }));
      return ps;
    },
    'amb-call'(t, o, dest) {
      const f = rand(150, 260);
      return [vocal(t, { contour: [[0, f], [0.2, f * 1.25], [0.5, f * 0.95]], dur: 0.55, vowel: pick(['ah', 'eh', 'oh']), vowel2: pick(['ah', 'ee', 'oo']), q: 6, peak: 0.03, breath: 0.2 }, dest)];
    },
    'amb-townbell'(t, o, dest) {
      const n = o.n ?? 3;
      const ps = [];
      for (let i = 0; i < n; i++) ps.push(note(t + i * 2.2, 'churchbell', 50, 3, 0.7, dest));
      return ps;
    },
    'amb-eagle'(t, o, dest) {
      return [vocal(t, { type: 'sawtooth', contour: [[0, 1800], [0.15, 2300], [0.9, 1500]], dur: 1.0, vowel: 'ee', fscale: 1.4, q: 6, peak: 0.025, breath: 0.25 }, dest)];
    },
    'amb-woodpecker'(t, o, dest) {
      const ps = [];
      const f = rand(700, 1000);
      for (let i = 0; i < 12; i++) ps.push(tone(t + i * 0.05, { type: 'triangle', f, f2: f * 0.8, glide: 0.02, peak: 0.03 * (1 - i / 16), d: 0.03, dest }));
      return ps;
    },
    'amb-howl'(t, o, dest) {
      return [vocal(t, { type: 'sawtooth', contour: [[0, 380], [0.5, 560], [1.4, 600], [2.0, 420]], dur: 2.1, vowel: 'oo', vowel2: 'oh', q: 6, peak: 0.03, breath: 0.25, a: 0.3, r: 0.5 }, dest)];
    },
    'amb-crystal'(t, o, dest) {
      const f = pick([1397, 1568, 2093, 2349, 2637, 3136]);
      return [bell(t, f, { peak: 0.035, d: 2.4, ratio: 3.01, index: 0.5, dest })];
    },
    'amb-bubble'(t, o, dest) {
      return [0, 1, 2].map((i) => tone(t + i * rand(0.06, 0.12), { f: rand(150, 300), f2: rand(400, 700), glide: 0.05, peak: 0.035, d: 0.05, dest }));
    },
    'amb-leaves'(t, o, dest) { return [swell(t, { type: 'highpass', f: 2800, q: 0.5, a: 0.6, hold: 0.3, r: 1.0, peak: 0.015, dest }), ...grains(t + 0.3, 8, 1.2, { type: 'highpass', f: [3500, 7000], peak: [0.005, 0.012], dest })]; },
    'amb-chatter'(t, o, dest) {
      const ps = [];
      for (let i = 0; i < 5; i++) ps.push(vocal(t + i * 0.1, { f: rand(260, 420), dur: 0.08, vowel: pick(['ah', 'eh', 'ee', 'oh']), q: 6, peak: 0.02 }, dest));
      return ps;
    },
  };
  return S;
}
