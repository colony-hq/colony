// One-shot sound effects, all synthesized. play(name, opts) with optional world position
// {x,y,z} (panned + attenuated relative to the camera). Owner: ui-audio.
//
// Names: step {surface, run}, jump, land {speed}, glide {on}, splash {strength}, swim, kilau,
// flame {flameId}, place {flameId}, ignite, flare, flare-fail, hurt, ghost|whisper {hit, volume},
// banish, ui-move, ui-confirm, ui-back, blip {pitch}, think {tier, seconds}, credit {delta},
// checkpoint, rest, door, gong, faint, respawn, clue, pelita {correct}, pelita-fail, climb, chime.

import { slendro, rand, pick, clamp } from './audio-kit.js';

// Minimum seconds between two plays of the same sound (keeps spam cheap and clean).
const MIN_GAP = { step: 0.07, blip: 0.028, kilau: 0.03, ghost: 0.35, whisper: 0.35, 'ui-move': 0.03, credit: 0.05, swim: 0.3, land: 0.12, jump: 0.08 };
const NOISE_GAIN = 3; // filtered noise is much quieter than a sine at the same peak
const LOW_PRIORITY = new Set(['step', 'blip', 'swim', 'ui-move', 'ghost', 'whisper']);

export function createSfx(kit, out, ctx, counters) {
  const { ac } = kit;
  const lastPlay = {};
  let kilauCombo = 0, kilauLast = -10;
  const cam = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };

  function listener() {
    const c = ctx.camera;
    if (!c) return;
    const e = c.matrixWorld.elements;
    cam.x = e[12]; cam.y = e[13]; cam.z = e[14];
    const l = Math.hypot(e[0], e[2]) || 1;
    cam.rx = e[0] / l; cam.rz = e[2] / l;
  }

  // Pan + distance gain for world-positioned sounds.
  function spatial(opts, range = 40) {
    if (!opts || !Number.isFinite(opts.x)) return { pan: 0, gain: 1 };
    listener();
    const dx = opts.x - cam.x, dy = (opts.y ?? cam.y) - cam.y, dz = opts.z - cam.z;
    const d = Math.hypot(dx, dy, dz);
    const pan = d > 0.5 ? clamp((dx * cam.rx + dz * cam.rz) / d, -1, 1) * 0.8 : 0;
    const gain = clamp(1 / (1 + Math.max(0, d - 6) / (range * 0.25)), 0, 1);
    return { pan, gain };
  }

  // Output chain for one voice: gain -> panner -> bus.
  function outNode(bus, vol = 1, pan = 0) {
    const g = kit.gain(vol);
    const p = kit.panner(pan);
    g.connect(p);
    p.connect(bus);
    return [g, p];
  }

  function tone(t, { type = 'sine', f = 440, f2 = null, glide = 0.1, a = 0.002, peak = 0.1, d = 0.3, dest }) {
    const o = kit.osc(type, f);
    if (f2) { o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + glide); }
    const g = kit.gain(0);
    o.connect(g); g.connect(dest);
    const end = kit.perc(g.gain, t, a, peak, d);
    return { srcs: [o], nodes: [g], end };
  }

  function noise(t, { type = 'bandpass', f = 1000, f2 = null, glide = 0.1, q = 1, a = 0.002, peak = 0.1, d = 0.2, buffer, dest, rate = 1 }) {
    const s = kit.noiseSrc(buffer || kit.noise, rate);
    const fl = kit.filter(type, f, q);
    if (f2) { fl.frequency.setValueAtTime(f, t); fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + glide); }
    const g = kit.gain(0);
    s.connect(fl); fl.connect(g); g.connect(dest);
    const end = kit.perc(g.gain, t, a, peak * NOISE_GAIN, d);
    return { srcs: [s], nodes: [fl, g], end };
  }

  function bell(t, f, { peak = 0.1, d = 1.4, ratio = 3.5, index = 1.2, dest }) {
    const car = kit.osc('sine', f);
    const mod = kit.osc('sine', f * ratio);
    const mg = kit.gain(0);
    const g = kit.gain(0);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(dest);
    mg.gain.setValueAtTime(f * index, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.01), t + Math.min(0.5, d * 0.4));
    const end = kit.perc(g.gain, t, 0.002, peak, d);
    return { srcs: [car, mod], nodes: [mg, g], end };
  }

  // Collect parts into one tracked voice.
  function commit(t, parts, extraNodes = []) {
    const srcs = [], nodes = [...extraNodes];
    let end = t;
    for (const p of parts) {
      srcs.push(...p.srcs);
      nodes.push(...p.nodes);
      end = Math.max(end, p.end);
    }
    if (srcs.length) kit.voice(srcs, nodes, t, end);
    else for (const x of nodes) { try { x.disconnect(); } catch { /* ignore */ } }
  }

  // ---------------------------------------------------------------- sound definitions
  const S = {
    step(t, o, dest) {
      const surf = o.surface || 'grass';
      const v = (o.run ? 1.2 : 1) * rand(0.8, 1.1) * 0.55;
      const r = rand(0.88, 1.12);
      switch (surf) {
        case 'sand': return [noise(t, { type: 'lowpass', f: 900 * r, q: 0.6, a: 0.008, peak: 0.16 * v, d: 0.13, dest }), noise(t + 0.03, { type: 'bandpass', f: 2600 * r, q: 0.8, peak: 0.04 * v, d: 0.06, dest })];
        case 'wood': return [tone(t, { f: 190 * r, f2: 105 * r, glide: 0.07, peak: 0.2 * v, d: 0.13, dest }), noise(t, { f: 950 * r, q: 3, peak: 0.08 * v, d: 0.05, dest })];
        case 'stone': case 'rock': return [noise(t, { type: 'highpass', f: 1900 * r, q: 0.7, a: 0.001, peak: 0.1 * v, d: 0.045, dest }), tone(t, { f: 280 * r, f2: 200, glide: 0.04, peak: 0.05 * v, d: 0.05, dest })];
        case 'metal': return [tone(t, { f: 880 * r, peak: 0.035 * v, d: 0.25, dest }), tone(t, { f: 1347 * r, peak: 0.02 * v, d: 0.18, dest }), noise(t, { type: 'highpass', f: 3000, peak: 0.05 * v, d: 0.03, dest })];
        case 'water': return [noise(t, { f: 1200 * r, f2: 500, glide: 0.16, q: 1.1, a: 0.01, peak: 0.16 * v, d: 0.2, dest }), tone(t + 0.05, { f: 620 * r, f2: 980 * r, glide: 0.05, peak: 0.02 * v, d: 0.06, dest })];
        case 'path': return [noise(t, { type: 'lowpass', f: 1300 * r, q: 0.8, a: 0.004, peak: 0.15 * v, d: 0.09, dest }), noise(t + 0.02, { type: 'highpass', f: 3200, peak: 0.03 * v, d: 0.03, dest })];
        default: return [noise(t, { f: 2400 * r, q: 0.7, a: 0.003, peak: 0.1 * v, d: 0.09, dest }), noise(t + 0.035, { f: 3400 * r, q: 0.9, peak: 0.05 * v, d: 0.05, dest })];
      }
    },
    jump(t, o, dest) {
      return [noise(t, { f: 500, f2: 1700, glide: 0.14, q: 1.4, a: 0.01, peak: 0.1, d: 0.16, dest }), tone(t, { f: 210, f2: 300, glide: 0.08, peak: 0.025, d: 0.09, dest })];
    },
    land(t, o, dest) {
      const k = clamp(((o.speed ?? 6) - 3) / 12, 0, 1);
      if (ctx.player?.surface === 'water' || ctx.player?.swimming) return S.splash(t, { strength: 0.3 + k }, dest);
      return [tone(t, { f: 130, f2: 52, glide: 0.16, peak: 0.18 + 0.32 * k, d: 0.22 + 0.2 * k, dest }), noise(t, { type: 'lowpass', f: 700 + 600 * k, q: 0.7, peak: 0.05 + 0.12 * k, d: 0.14 + 0.1 * k, buffer: kit.brown, dest })];
    },
    glide(t, o, dest) {
      if (o.on === false) return [noise(t, { f: 900, f2: 380, glide: 0.25, q: 1, a: 0.01, peak: 0.07, d: 0.25, dest })];
      // Cloth snapping open: a swept whoosh with a fast flutter.
      const trem = kit.gain(1);
      trem.connect(dest);
      const lfo = kit.osc('square', 22);
      const lg = kit.gain(0.45);
      lfo.connect(lg); lg.connect(trem.gain);
      const p = noise(t, { f: 600, f2: 1500, glide: 0.3, q: 0.9, a: 0.03, peak: 0.16, d: 0.4, dest: trem });
      return [p, { srcs: [lfo], nodes: [lg, trem], end: t + 0.45 }];
    },
    splash(t, o, dest) {
      const s = clamp(o.strength ?? 0.6, 0.1, 1.5);
      const parts = [noise(t, { type: 'lowpass', f: 3200, f2: 450, glide: 0.45, q: 0.8, a: 0.004, peak: 0.2 * s, d: 0.5, dest })];
      for (let i = 0; i < 4; i++) parts.push(tone(t + rand(0.04, 0.35), { f: rand(380, 700), f2: rand(800, 1300), glide: 0.05, peak: 0.03 * s, d: 0.06, dest }));
      return parts;
    },
    swim(t, o, dest) {
      return [noise(t, { f: 600, f2: 1100, glide: 0.22, q: 1, a: 0.08, peak: 0.1, d: 0.3, dest })];
    },
    climb(t, o, dest) {
      return [noise(t, { type: 'lowpass', f: 1400, f2: 600, glide: 0.3, q: 0.8, a: 0.01, peak: 0.14, d: 0.35, dest }), tone(t + 0.1, { f: 160, f2: 90, glide: 0.1, peak: 0.12, d: 0.15, dest })];
    },
    kilau(t, o, dest) {
      const now = ac.currentTime;
      kilauCombo = now - kilauLast < 1.6 ? kilauCombo + 1 : 0;
      kilauLast = now;
      const deg = (kilauCombo % 5) + (kilauCombo ? 0 : (Math.random() * 5) | 0);
      const f = slendro(deg, 3 + Math.floor(kilauCombo / 5) % 2);
      return [bell(t, f, { peak: 0.18, d: 1.5, ratio: 3.5, index: 1.1, dest }), tone(t + 0.07, { f: f * 2.01, peak: 0.06, d: 0.5, dest }), tone(t + 0.13, { f: f * 1.5, peak: 0.03, d: 0.4, dest })];
    },
    flame(t, o, dest) {
      const base = { tirta: 3, bumi: 1, samudra: 2 }[o.flameId] ?? 2;
      const parts = [];
      [0, 2, 4, 5].forEach((step, i) => parts.push(bell(t + i * 0.09, slendro(base + step, 2), { peak: 0.08, d: 2.4, ratio: 2.76, index: 0.8, dest })));
      parts.push(swell(t, [slendro(base, 1), slendro(base + 2, 1), slendro(base + 4, 1)], 2.6, 0.05, dest));
      parts.push(noise(t, { type: 'lowpass', f: 300, f2: 3000, glide: 0.6, q: 0.7, a: 0.2, peak: 0.12, d: 0.8, dest }));
      return parts;
    },
    place(t, o, dest) {
      const base = { tirta: 3, bumi: 1, samudra: 2 }[o.flameId] ?? 2;
      return [
        bell(t, slendro(base, 0), { peak: 0.14, d: 3.6, ratio: 1.41, index: 0.6, dest }),
        bell(t + 0.04, slendro(base + 2, 1), { peak: 0.07, d: 2.6, ratio: 2.76, index: 0.7, dest }),
        noise(t, { type: 'lowpass', f: 200, f2: 2600, glide: 0.5, q: 0.8, a: 0.05, peak: 0.2, d: 1.1, buffer: kit.brown, dest }),
        swell(t + 0.1, [slendro(base, 0), slendro(base + 2, 0), slendro(base + 4, 0)], 3.2, 0.05, dest),
      ];
    },
    ignite(t, o, dest) {
      const parts = [
        noise(t, { type: 'lowpass', f: 260, f2: 3200, glide: 0.45, q: 0.9, a: 0.06, peak: 0.24, d: 0.9, dest }),
        tone(t, { f: 90, f2: 48, glide: 0.3, peak: 0.16, d: 0.4, dest }),
      ];
      for (let i = 0; i < 9; i++) parts.push(noise(t + 0.15 + rand(0, 1.1), { f: rand(2500, 6000), q: 2, a: 0.001, peak: rand(0.03, 0.08), d: rand(0.008, 0.03), dest }));
      return parts;
    },
    flare(t, o, dest) {
      return [
        swell(t, [slendro(2, 1), slendro(4, 1), slendro(1, 2)], 1.3, 0.07, dest, 4600),
        bell(t + 0.05, slendro(4, 3), { peak: 0.05, d: 1.2, ratio: 3.5, index: 1.4, dest }),
        noise(t, { type: 'highpass', f: 1500, f2: 5200, glide: 0.4, q: 0.7, a: 0.05, peak: 0.08, d: 0.6, dest }),
      ];
    },
    'flare-fail'(t, o, dest) {
      return [noise(t, { f: 1800, f2: 500, glide: 0.25, q: 1.2, a: 0.01, peak: 0.08, d: 0.3, dest }), tone(t, { f: 180, f2: 120, glide: 0.2, peak: 0.06, d: 0.25, dest })];
    },
    hurt(t, o, dest) {
      return [
        tone(t, { f: 92, f2: 44, glide: 0.25, peak: 0.34, d: 0.32, dest }),
        tone(t, { f: 233, peak: 0.05, a: 0.01, d: 0.7, dest }),
        tone(t, { f: 247, peak: 0.05, a: 0.01, d: 0.7, dest }),
        noise(t, { type: 'lowpass', f: 600, q: 0.7, a: 0.005, peak: 0.1, d: 0.25, buffer: kit.brown, dest }),
      ];
    },
    ghost(t, o, dest) {
      // Breathy formant whisper gliding between vowels, with a faint falling tone.
      const vowels = [[300, 870, 2240], [730, 1090, 2440], [270, 2290, 3010], [570, 840, 2410]];
      const a = pick(vowels), b = pick(vowels);
      const dur = o.hit ? 0.8 : rand(1.1, 1.8);
      const vol = (o.hit ? 0.9 : 0.55) * (o.volume ?? 1);
      const s = kit.noiseSrc(kit.noise, 1, true);
      const g = kit.gain(0);
      const parts = [{ srcs: [s], nodes: [g], end: t + dur + 0.1 }];
      for (let i = 0; i < 3; i++) {
        const f = kit.filter('bandpass', a[i], 9 + i * 3);
        f.frequency.setValueAtTime(a[i], t);
        f.frequency.linearRampToValueAtTime(b[i], t + dur * 0.8);
        const fg = kit.gain([1, 0.6, 0.3][i]);
        s.connect(f); f.connect(fg); fg.connect(g);
        parts[0].nodes.push(f, fg);
      }
      g.connect(dest);
      kit.ahr(g.gain, t, dur * 0.35, vol, dur * 0.2, dur * 0.45);
      parts.push(tone(t + 0.1, { f: o.hit ? 520 : 880, f2: o.hit ? 260 : 620, glide: dur, a: 0.2, peak: 0.012, d: dur, dest }));
      return parts;
    },
    banish(t, o, dest) {
      return [noise(t, { type: 'highpass', f: 800, f2: 6000, glide: 0.5, q: 0.8, a: 0.02, peak: 0.1, d: 0.6, dest }), bell(t, slendro(3, 3), { peak: 0.05, d: 0.9, dest })];
    },
    'ui-move'(t, o, dest) {
      return [tone(t, { f: 1320, peak: 0.08, d: 0.05, dest }), tone(t, { type: 'triangle', f: 2640, peak: 0.022, d: 0.03, dest })];
    },
    'ui-confirm'(t, o, dest) {
      return [bell(t, slendro(2, 2), { peak: 0.12, d: 0.6, ratio: 2.76, index: 0.6, dest }), bell(t + 0.065, slendro(4, 2), { peak: 0.12, d: 0.8, ratio: 2.76, index: 0.6, dest })];
    },
    'ui-back'(t, o, dest) {
      return [tone(t, { f: 700, f2: 480, glide: 0.08, peak: 0.09, d: 0.1, dest })];
    },
    blip(t, o, dest) {
      let p = o.pitch ?? 1;
      const f = p > 20 ? p : 420 * p;
      const g = kit.gain(1);
      const lp = kit.filter('lowpass', 2400, 0.7);
      g.connect(lp); lp.connect(dest);
      const tn = tone(t, { type: 'triangle', f: f * rand(0.97, 1.03), peak: 0.08 * (o.volume ?? 1), a: 0.003, d: 0.05, dest: g });
      tn.nodes.push(g, lp);
      return [tn];
    },
    think(t, o, dest) {
      const tier = o.tier || 'sedang';
      const dur = o.seconds ?? { redup: 0.7, sedang: 1.3, terang: 2.2 }[tier] ?? 1.3;
      const cut = { redup: 600, sedang: 1500, terang: 4000 }[tier] ?? 1500;
      const f = slendro({ redup: 0, sedang: 2, terang: 4 }[tier] ?? 2, 1);
      const lp = kit.filter('lowpass', cut, 1);
      const trem = kit.gain(1);
      const amp = kit.gain(0);
      lp.connect(trem); trem.connect(amp); amp.connect(dest);
      const o1 = kit.osc('sine', f), o2 = kit.osc('sine', f * 1.5), lfo = kit.osc('sine', 6), lg = kit.gain(0.3);
      o1.frequency.setValueAtTime(f, t); o1.frequency.linearRampToValueAtTime(f * 1.06, t + dur);
      o1.connect(lp); o2.connect(lp);
      lfo.connect(lg); lg.connect(trem.gain);
      kit.ahr(amp.gain, t, Math.min(0.3, dur * 0.3), 0.04, Math.max(0.05, dur - 0.5), 0.3);
      const parts = [{ srcs: [o1, o2, lfo], nodes: [lp, trem, amp, lg], end: t + dur + 0.4 }];
      parts.push(bell(t + dur, slendro(4, 2), { peak: tier === 'terang' ? 0.07 : 0.04, d: 0.9, ratio: 3.5, index: 0.8, dest }));
      return parts;
    },
    credit(t, o, dest) {
      const up = (o.delta ?? 0) > 0;
      const [a, b] = up ? [1320, 1760] : [1760, 1240];
      return [tone(t, { f: a, peak: 0.07, d: 0.06, dest }), tone(t + 0.045, { f: b, peak: 0.07, d: up ? 0.18 : 0.09, dest })];
    },
    checkpoint(t, o, dest) {
      const parts = [0, 2, 4, 7].map((d, i) => bell(t + 0.18 + i * 0.12, slendro(d, 1), { peak: 0.07, d: 2.6, ratio: 2.76, index: 0.5, dest }));
      parts.push(swell(t, [slendro(0, 0), slendro(2, 0), slendro(4, 0)], 3, 0.045, dest));
      return parts;
    },
    rest(t, o, dest) {
      return [4, 2, 0].map((d, i) => bell(t + i * 0.16, slendro(d, 1), { peak: 0.05, d: 2.2, ratio: 2.76, index: 0.4, dest }));
    },
    door(t, o, dest) {
      const dur = o.seconds ?? 3;
      const s = kit.noiseSrc(kit.brown, 0.6, true);
      const lp = kit.filter('lowpass', 240, 0.8);
      const g = kit.gain(0);
      s.connect(lp); lp.connect(g); g.connect(dest);
      kit.ahr(g.gain, t, 0.3, 0.5, dur - 0.6, 0.4);
      const grit = kit.noiseSrc(kit.noise, 0.5, true);
      const bp = kit.filter('bandpass', 420, 4);
      const gg = kit.gain(0);
      grit.connect(bp); bp.connect(gg); gg.connect(dest);
      gg.gain.setValueAtTime(0.0001, t);
      for (let k = 0; k < 18; k++) gg.gain.linearRampToValueAtTime(rand(0.02, 0.12), t + 0.2 + (k / 18) * (dur - 0.4));
      gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      return [
        { srcs: [s, grit], nodes: [lp, g, bp, gg], end: t + dur + 0.1 },
        tone(t, { f: 42, peak: 0.2, a: 0.3, d: dur, dest }),
        tone(t + dur - 0.05, { f: 70, f2: 38, glide: 0.2, peak: 0.35, d: 0.5, dest }),
        noise(t + dur - 0.05, { type: 'lowpass', f: 500, q: 0.7, peak: 0.25, d: 0.4, buffer: kit.brown, dest }),
      ];
    },
    faint(t, o, dest) {
      return [tone(t, { f: 440, f2: 110, glide: 1.6, a: 0.05, peak: 0.07, d: 1.8, dest }), tone(t, { f: 446, f2: 112, glide: 1.6, a: 0.05, peak: 0.05, d: 1.8, dest }), noise(t, { type: 'lowpass', f: 1600, f2: 120, glide: 1.4, q: 0.7, a: 0.1, peak: 0.12, d: 1.5, dest })];
    },
    respawn(t, o, dest) {
      return [0, 1, 2, 4].map((d, i) => bell(t + i * 0.14, slendro(d, 2), { peak: 0.05, d: 1.6, ratio: 2.76, index: 0.5, dest }));
    },
    clue(t, o, dest) {
      const parts = [bell(t + 0.12, slendro(3, 2), { peak: 0.08, d: 1, ratio: 2.76, index: 0.6, dest }), bell(t + 0.24, slendro(0, 3), { peak: 0.075, d: 1.3, ratio: 2.76, index: 0.6, dest })];
      for (let i = 0; i < 4; i++) parts.push(noise(t + i * 0.035, { f: rand(3000, 5000), q: 1.5, a: 0.003, peak: 0.025, d: 0.03, dest }));
      return parts;
    },
    pelita(t, o, dest) {
      if (o.correct === false) return S['pelita-fail'](t, o, dest);
      const n = clamp((o.count ?? 1) - 1, 0, 3);
      return [noise(t, { type: 'lowpass', f: 300, f2: 2400, glide: 0.3, q: 0.8, a: 0.03, peak: 0.12, d: 0.45, dest }), bell(t + 0.05, slendro([0, 1, 2, 4][n], 2), { peak: 0.07, d: 1.6, ratio: 2.76, index: 0.6, dest })];
    },
    'pelita-fail'(t, o, dest) {
      return [noise(t, { type: 'highpass', f: 3000, f2: 600, glide: 0.5, q: 0.8, a: 0.01, peak: 0.05, d: 0.6, dest }), tone(t, { f: 160, f2: 110, glide: 0.4, peak: 0.07, d: 0.5, dest }), tone(t + 0.05, { f: 233, peak: 0.03, d: 0.6, dest }), tone(t + 0.05, { f: 247, peak: 0.03, d: 0.6, dest })];
    },
    chime(t, o, dest) {
      return [bell(t, slendro(o.deg ?? 4, o.oct ?? 2), { peak: 0.09, d: 1.2, dest })];
    },
  };
  S.whisper = S.ghost;

  // Detuned saw chord through an opening lowpass: the warm "bloom" under flames and flares.
  function swell(t, freqs, dur, peak, dest, cutTo = 2200) {
    const lp = kit.filter('lowpass', 300, 0.9);
    const amp = kit.gain(0);
    lp.connect(amp); amp.connect(dest);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(cutTo, t + dur * 0.35);
    lp.frequency.exponentialRampToValueAtTime(600, t + dur);
    const srcs = [];
    for (const f of freqs) for (const det of [-9, 9]) {
      const o = kit.osc('sawtooth', f);
      o.detune.value = det;
      o.connect(lp);
      srcs.push(o);
    }
    const end = kit.ahr(amp.gain, t, dur * 0.3, peak, dur * 0.15, dur * 0.55);
    return { srcs, nodes: [lp, amp], end };
  }

  const UI = new Set(['ui-move', 'ui-confirm', 'ui-back', 'blip', 'think', 'credit']);

  return {
    names: Object.keys(S),
    play(name, opts = {}) {
      const def = S[name];
      if (!def) return false;
      const now = ac.currentTime;
      const gap = MIN_GAP[name];
      if (gap && now - (lastPlay[name] ?? -1) < gap) return false;
      if (counters.voices > 70 && LOW_PRIORITY.has(name)) return false;
      lastPlay[name] = now;
      const sp = spatial(opts, opts.range ?? 40);
      const vol = (opts.volume ?? 1) * sp.gain;
      if (vol < 0.01) return false;
      const bus = UI.has(name) || opts.ui ? out.ui : out.sfx;
      const [g, p] = outNode(bus, vol, sp.pan);
      if (opts.reverb !== false && !UI.has(name)) g.connect(out.wet);
      const t = now + 0.005;
      try {
        const parts = def(t, opts, g) || [];
        commit(t, parts, [g, p]);
      } catch (err) {
        try { g.disconnect(); p.disconnect(); } catch { /* ignore */ }
        console.warn('[audio] sfx failed', name, err);
        return false;
      }
      return true;
    },
  };
}
