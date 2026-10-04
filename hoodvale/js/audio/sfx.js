// One-shot sound effects, all synthesized. play(name, opts) with optional world position {x, z}
// (attenuated by distance to the player, panned by the camera's right vector). Definitions live in
// sfx-world.js (steps, skilling, items, places, ambient one-shots), sfx-combat.js (combat, spells,
// creature voices) and sfx-ui.js (interface, chain, Oracle, fanfares, jingles). Owner: audio builder.
//
// opts: { x, z, range, volume, pitch, delay, bus: 'sfx'|'ui'|'amb', pan, wet, ...sound-specific }.

import { rand, pick, clamp, mtof } from './kit.js';
import { defineWorld } from './sfx-world.js';
import { defineCombat } from './sfx-combat.js';
import { defineUi } from './sfx-ui.js';

const NG = 3; // filtered noise is quieter than a sine at the same peak

// Minimum seconds between two plays of the same sound.
const MIN_GAP = {
  step: 0.06, xp: 0.07, blip: 0.03, 'ui-click': 0.03, 'ui-tab': 0.03, 'ui-menu': 0.05, 'ui-open': 0.08, 'ui-close': 0.08,
  chain: 0.12, 'chain-confirm': 1.2, coins: 0.08, deposit: 0.06, withdraw: 0.06, hit: 0.03, block: 0.04, swing: 0.04,
  pickup: 0.05, 'item-drop': 0.05, equip: 0.08, message: 0.25, 'ui-error': 0.4, eat: 0.3, heal: 0.15,
  stun: 0.5, teleport: 1, portal: 1, stairs: 1, 'npc-murmur': 2, discover: 5, heartbeat: 0.5, 'fire-light': 0.3, chest: 0.5,
  'tree-fall': 0.5, 'rock-deplete': 0.5, bow: 0.05, arrow: 0.05, 'arrow-hit': 0.04, 'fire-breath': 0.5, stomp: 0.5, summon: 2, respawn: 1,
  'level-combat': 0.5, 'level-gathering': 0.5, 'level-artisan': 0.5, 'quest-start': 1, 'quest-complete': 1, death: 2,
};
// Dropped first when many voices are sounding.
const LOW = new Set(['step', 'xp', 'blip', 'ui-click', 'ui-tab', 'ui-menu', 'chain-confirm', 'message', 'pickup', 'fire-crackle']);
// Sounds that go to the dry UI bus (no world reverb, not muffled indoors).
const UI = /^(ui-|blip$|xp$|chain|coins$|level-|quest-|oracle-|dialogue-|death$|respawn$|message$|peer-|shop-bell$|bank$|deposit$|withdraw$|exchange$|emote-|discover$|heartbeat$)/;

const VOWELS = {
  ah: [730, 1090, 2440], ee: [270, 2290, 3010], eh: [530, 1840, 2480], oo: [300, 870, 2240],
  oh: [570, 840, 2410], uh: [640, 1190, 2390], ih: [390, 1990, 2550],
};

export function createSfx(kit, inst, out, ctx, counters) {
  const { ac } = kit;
  const lastPlay = {};
  const listener = { x: 0, z: 0, rx: 1, rz: 0 };

  // ---------------------------------------------------------------- primitives (return parts)
  const part = (srcs, nodes, end) => ({ srcs, nodes, end });

  function tone(t, { type = 'sine', f = 440, f2 = null, glide = 0.1, a = 0.002, peak = 0.1, d = 0.3, dest, lin = false }) {
    const o = kit.osc(type, f);
    o._t = t;
    if (f2) {
      o.frequency.setValueAtTime(f, t);
      if (lin) o.frequency.linearRampToValueAtTime(f2, t + glide);
      else o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + glide);
    }
    const g = kit.gain(0);
    o.connect(g); g.connect(dest);
    const end = kit.perc(g.gain, t, a, peak, d);
    return part([o], [g], end);
  }

  function noise(t, { type = 'bandpass', f = 1000, f2 = null, glide = 0.1, q = 1, a = 0.002, peak = 0.1, d = 0.2, buffer, dest, rate = 1 }) {
    const s = kit.noiseSrc(buffer || kit.noise, rate);
    s._t = t;
    const fl = kit.filter(type, f, q);
    if (f2) { fl.frequency.setValueAtTime(f, t); fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + glide); }
    const g = kit.gain(0);
    s.connect(fl); fl.connect(g); g.connect(dest);
    const end = kit.perc(g.gain, t, a, peak * NG, d);
    return part([s], [fl, g], end);
  }

  // Noise swell with attack/hold/release (whooshes, roars, beds inside a sound).
  function swell(t, { type = 'bandpass', f = 800, f2 = null, f3 = null, q = 1, a = 0.1, hold = 0.1, r = 0.3, peak = 0.1, buffer, dest }) {
    const s = kit.noiseSrc(buffer || kit.noise, 1, true);
    s._t = t;
    const fl = kit.filter(type, f, q);
    const total = a + hold + r;
    if (f2) {
      fl.frequency.setValueAtTime(f, t);
      fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + (f3 ? total * 0.5 : total));
      if (f3) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f3), t + total);
    }
    const g = kit.gain(0);
    s.connect(fl); fl.connect(g); g.connect(dest);
    const end = kit.ahr(g.gain, t, a, peak * NG, hold, r);
    return part([s], [fl, g], end);
  }

  function bell(t, f, { peak = 0.1, d = 1.4, ratio = 3.5, index = 1.2, dest }) {
    const car = kit.osc('sine', f), mod = kit.osc('sine', f * ratio);
    car._t = mod._t = t;
    const mg = kit.gain(0), g = kit.gain(0);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(dest);
    mg.gain.setValueAtTime(f * index, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.01), t + Math.min(0.5, d * 0.4));
    const end = kit.perc(g.gain, t, 0.002, peak, d);
    return part([car, mod], [mg, g], end);
  }

  // Inharmonic struck metal (anvil, pick on rock, armour clank, coins).
  function metal(t, f, { peak = 0.08, d = 0.5, ratios = [1, 2.76, 5.4, 8.93], decays = [1, 0.6, 0.35, 0.2], dest }) {
    const srcs = [], nodes = [];
    let end = t;
    ratios.forEach((r, i) => {
      if (f * r > ac.sampleRate * 0.45) return;
      const o = kit.osc('sine', f * r * rand(0.995, 1.005));
      o._t = t;
      const g = kit.gain(0);
      o.connect(g); g.connect(dest);
      end = Math.max(end, kit.perc(g.gain, t, 0.001, peak / (1 + i * 0.6), d * (decays[i] ?? 0.2)));
      srcs.push(o); nodes.push(g);
    });
    return part(srcs, nodes, end);
  }

  // Formant voice: buzzy source through vowel formants with pitch contour, roughness and breath.
  function vocal(t, o, dest) {
    const dur = o.dur ?? 0.4;
    const fs = o.fscale ?? 1;
    const contour = o.contour || [[0, o.f ?? 200], [dur, o.f2 ?? o.f ?? 200]];
    const src = kit.osc(o.type || 'sawtooth', contour[0][1]);
    src._t = t;
    src.frequency.setValueAtTime(contour[0][1], t);
    for (let i = 1; i < contour.length; i++) src.frequency.exponentialRampToValueAtTime(Math.max(20, contour[i][1]), t + contour[i][0]);
    const mix = kit.gain(1);
    src.connect(mix);
    const srcs = [src], nodes = [mix];
    if (o.breath) {
      const b = kit.noiseSrc(kit.noise, 1, true);
      b._t = t;
      const bg = kit.gain(o.breath * 0.6);
      b.connect(bg); bg.connect(mix);
      srcs.push(b); nodes.push(bg);
    }
    let shaped = mix;
    if (o.rough) {
      const am = kit.gain(1 - (o.roughDepth ?? 0.6));
      const lfo = kit.osc(o.roughType || 'sine', o.rough);
      lfo._t = t;
      const lg = kit.gain(o.roughDepth ?? 0.6);
      lfo.connect(lg); lg.connect(am.gain);
      mix.connect(am);
      shaped = am;
      srcs.push(lfo); nodes.push(am, lg);
    }
    const amp = kit.gain(0);
    amp.connect(dest);
    nodes.push(amp);
    const v1 = (o.formants || VOWELS[o.vowel || 'ah']).map((x) => x * fs);
    const v2 = o.vowel2 ? VOWELS[o.vowel2].map((x) => x * fs) : null;
    const gains = o.fgains || [1, 0.5, 0.22];
    for (let i = 0; i < v1.length; i++) {
      const bp = kit.filter('bandpass', v1[i], o.q ?? 7);
      if (v2) { bp.frequency.setValueAtTime(v1[i], t); bp.frequency.linearRampToValueAtTime(v2[i], t + dur * 0.8); }
      const g = kit.gain(gains[i] * 4);
      shaped.connect(bp); bp.connect(g); g.connect(amp);
      nodes.push(bp, g);
    }
    const a = o.a ?? Math.min(0.04, dur * 0.2);
    const r = o.r ?? Math.min(0.15, dur * 0.4);
    const end = kit.ahr(amp.gain, t, a, o.peak ?? 0.1, Math.max(0, dur - a - r), r);
    return part(srcs, nodes, end);
  }

  // Short grains (gravel, crackles, chips) scattered over a span.
  function grains(t, n, span, { f = [2000, 5000], q = 1.5, peak = [0.02, 0.05], d = [0.008, 0.03], type = 'bandpass', dest }) {
    const ps = [];
    for (let i = 0; i < n; i++) ps.push(noise(t + rand(0, span), { type, f: rand(f[0], f[1]), q, a: 0.001, peak: rand(peak[0], peak[1]), d: rand(d[0], d[1]), dest }));
    return ps;
  }

  // Musical notes from the instrument set.
  const note = (t, name, midi, dur, vel, dest, o) => inst.play(name, dest, t, midi, dur, vel, o || {});
  const drum = (t, letter, vel, dest, o) => inst.drum(letter, dest, t, vel, o || {});

  const L = { kit, inst, ac, ctx, rand, pick, clamp, mtof, tone, noise, swell, bell, metal, vocal, grains, note, drum, VOWELS };
  const S = { ...defineWorld(L), ...defineCombat(L), ...defineUi(L) };

  // ---------------------------------------------------------------- spatial
  function updateListener() {
    const p = ctx.player?.pos;
    if (p && Number.isFinite(p.x)) { listener.x = p.x; listener.z = p.z; }
    const c = ctx.camera;
    if (c?.matrixWorld) {
      const e = c.matrixWorld.elements;
      const l = Math.hypot(e[0], e[2]) || 1;
      listener.rx = e[0] / l; listener.rz = e[2] / l;
    }
  }
  function spatial(o) {
    if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.z)) return { pan: o?.pan ?? 0, gain: 1 };
    const dx = o.x - listener.x, dz = o.z - listener.z;
    const d = Math.hypot(dx, dz);
    const range = o.range ?? 18;
    if (d > range) return { pan: 0, gain: 0 };
    const pan = d > 0.8 ? clamp((dx * listener.rx + dz * listener.rz) / d, -1, 1) * 0.75 : 0;
    const gain = clamp(1 / (1 + Math.max(0, d - 2) / (range * 0.22)), 0, 1) * (1 - Math.pow(d / range, 4));
    return { pan, gain };
  }

  return {
    names: Object.keys(S),
    has: (name) => !!S[name],
    updateListener,
    // Returns the sound's end time (audio clock) or 0 when not played.
    play(name, opts = {}) {
      const def = S[name];
      if (!def) return 0;
      const now = ac.currentTime;
      const at = now + (opts.delay || 0);
      const gap = MIN_GAP[name];
      if (gap && Math.abs(at - (lastPlay[name] ?? -9)) < gap) return 0;
      if (counters.voices > 110 && !UI.test(name)) return 0;
      if (counters.voices > 70 && LOW.has(name)) return 0;
      const sp = spatial(opts);
      const vol = (opts.volume ?? 1) * sp.gain;
      if (vol < 0.012) return 0;
      lastPlay[name] = at;
      const busName = opts.bus || (UI.test(name) ? 'ui' : 'sfx');
      const bus = out[busName] || out.sfx;
      const g = kit.gain(vol);
      const extra = [g];
      if (sp.pan) { const p = kit.panner(sp.pan); g.connect(p); p.connect(bus); extra.push(p); }
      else g.connect(bus);
      if (busName !== 'ui' && opts.wet !== 0 && out.wet) {
        const w = kit.gain(opts.wet ?? 1);
        g.connect(w); w.connect(out.wet);
        extra.push(w);
      }
      const t = now + 0.006 + (opts.delay || 0);
      try {
        const parts = [].concat(def(t, opts, g) || []).flat(4).filter(Boolean);
        // vocal() and other composite parts start with the sound unless they set their own time.
        return kit.commit(t, parts, extra);
      } catch (err) {
        for (const x of extra) { try { x.disconnect(); } catch { /* ignore */ } }
        console.warn('[audio] sfx failed', name, err);
        return 0;
      }
    },
  };
}
