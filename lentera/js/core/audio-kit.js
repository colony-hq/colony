// Shared WebAudio building blocks: node factories with voice tracking (every one-shot voice
// disconnects itself when its sources end), envelopes, noise buffers, the slendro scale and a
// generated reverb impulse. Owner: ui-audio.

// Slendro: five roughly equal steps (~240 cents); slightly uneven like a real gamelan set.
export const SLENDRO_CENTS = [0, 231, 474, 717, 955];
export const BASE_HZ = 146.83; // D3

export function slendro(deg, oct = 0) {
  const d = ((deg % 5) + 5) % 5;
  const o = oct + Math.floor(deg / 5);
  return BASE_HZ * Math.pow(2, o + SLENDRO_CENTS[d] / 1200);
}

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function makeNoise(ac, seconds, kind = 'white') {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  // Short crossfade at the loop point to avoid a click.
  const fade = Math.min(2048, len >> 4);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k;
  }
  return buf;
}

function makeImpulse(ac, seconds = 2.8, decay = 2.6) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Darker tail: one-pole lowpass whose coefficient closes over time.
      const a = 0.65 - 0.5 * t;
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      const early = i < ac.sampleRate * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.6 : 0;
      d[i] = (lp * 1.6 + early) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

export function createKit(ac, counters) {
  const noise = makeNoise(ac, 3.2, 'white');
  const brown = makeNoise(ac, 3.7, 'brown');
  const hasPanner = typeof ac.createStereoPanner === 'function';

  const n = (node) => { counters.nodes++; return node; };

  const kit = {
    ac,
    noise,
    brown,
    impulse: () => makeImpulse(ac),
    gain(v = 1) { const g = n(ac.createGain()); g.gain.value = v; return g; },
    osc(type, freq) { const o = n(ac.createOscillator()); o.type = type; o.frequency.value = freq; return o; },
    filter(type, freq, q = 0.707) { const f = n(ac.createBiquadFilter()); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; },
    panner(p = 0) {
      if (!hasPanner) return kit.gain(1);
      const s = n(ac.createStereoPanner());
      s.pan.value = clamp(p, -1, 1);
      return s;
    },
    src(buffer = noise, loop = false, rate = 1) {
      const s = n(ac.createBufferSource());
      s.buffer = buffer;
      s.loop = loop;
      s.playbackRate.value = rate;
      return s;
    },
    // Percussive envelope: linear attack to peak, exponential decay to silence. Returns end time.
    perc(param, t, attack, peak, decay) {
      param.setValueAtTime(0.0001, t);
      param.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      return t + attack + decay;
    },
    // Attack / hold / release envelope (pads, swells). Returns end time.
    ahr(param, t, attack, peak, hold, release) {
      param.setValueAtTime(0.0001, t);
      param.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      param.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
      param.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
      return t + attack + hold + release;
    },
    // Start sources at t, stop them at end, and free the whole voice when they finish.
    voice(sources, nodes, t, end) {
      counters.voices++;
      let left = sources.length;
      const done = () => {
        if (--left > 0) return;
        for (const x of nodes) { try { x.disconnect(); } catch { /* ignore */ } }
        for (const s of sources) { try { s.disconnect(); } catch { /* ignore */ } }
        counters.voices--;
      };
      for (const s of sources) {
        s.onended = done;
        try {
          if (s._offset != null) s.start(t, s._offset);
          else s.start(t);
          s.stop(end + 0.05);
        } catch { done(); }
      }
    },
    // Noise burst source with a random start offset (so bursts never repeat exactly).
    noiseSrc(buffer = noise, rate = 1, loop = false) {
      const s = kit.src(buffer, loop, rate);
      s._offset = Math.random() * (buffer.duration - 0.6);
      return s;
    },
  };
  return kit;
}
