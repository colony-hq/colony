// Shared WebAudio building blocks for Hoodvale's synthesized audio: node factories with voice
// tracking (every one-shot voice disconnects itself when its sources end), envelopes, noise
// buffers, a generated reverb impulse, Karplus-Strong plucked-string buffers (lute, harp,
// dulcimer, bass) and twelve-tone modal helpers. No samples, no fetch. Owner: audio builder.

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Church modes (semitones from the tonic) + harmonic minor for the darker pieces.
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};

// Scale degree (0 = tonic, may be negative or above 6) -> MIDI note.
export function degMidi(root, mode, deg, alt = 0) {
  const n = mode.length;
  const o = Math.floor(deg / n);
  const d = deg - o * n;
  return root + 12 * o + mode[d] + alt;
}

function makeNoise(ac, seconds, kind = 'white') {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else if (kind === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else d[i] = w;
  }
  // Crossfade the loop point so looping beds never click.
  const fade = Math.min(4096, len >> 4);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k;
  }
  return buf;
}

// Stereo hall impulse: decorrelated noise with a darkening, exponentially decaying tail.
function makeImpulse(ac, seconds = 2.6, decay = 2.8) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const a = 0.7 - 0.55 * t;
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      const early = i < ac.sampleRate * 0.07 && Math.random() < 0.005 ? (Math.random() * 2 - 1) * 0.7 : 0;
      d[i] = (lp * 1.7 + early) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

// Karplus-Strong plucked strings. Each profile: decay time (t60) at low/high register, excitation
// brightness, loop-filter weight s (0.5 = darkest), pick position and the buffer sample rate.
const PLUCK = {
  lute: { t60: [1.7, 0.75], bright: 0.5, s: 0.42, pick: 0.16, len: 1.9, sr: 24000 },
  harp: { t60: [3.4, 1.3], bright: 0.32, s: 0.5, pick: 0.42, len: 3.2, sr: 26000 },
  dulcimer: { t60: [2.4, 1.0], bright: 0.85, s: 0.28, pick: 0.11, len: 2.4, sr: 32000 },
  bass: { t60: [1.5, 0.9], bright: 0.28, s: 0.5, pick: 0.22, len: 1.7, sr: 16000 },
  string: { t60: [0.35, 0.25], bright: 0.7, s: 0.35, pick: 0.3, len: 0.5, sr: 24000 }, // bowstrings, twangs
};

function renderPluck(ac, type, midi) {
  const P = PLUCK[type] || PLUCK.lute;
  const sr = P.sr;
  const f = mtof(midi);
  const s = P.s;
  // y[n+N] = g((1-s) y[n] + s y[n+1]) -> loop delay N - s samples.
  const N = Math.max(3, Math.round(sr / f + s));
  const f0 = sr / (N - s);
  const k = clamp((midi - 36) / 60, 0, 1);
  const t60 = lerp(P.t60[0], P.t60[1], k);
  const g = Math.pow(0.001, (N - s) / (sr * t60));
  const len = Math.max(64, Math.floor(sr * Math.min(P.len, t60 * 1.15 + 0.08)));
  const buf = ac.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const ring = new Float32Array(N);
  let lp = 0;
  const a = P.bright;
  for (let i = 0; i < N; i++) { lp += a * ((Math.random() * 2 - 1) - lp); ring[i] = lp; }
  const pd = Math.max(1, Math.round(N * P.pick));
  const tmp = ring.slice();
  let mean = 0;
  for (let i = 0; i < N; i++) { ring[i] = tmp[i] - 0.85 * (i >= pd ? tmp[i - pd] : 0); mean += ring[i]; }
  mean /= N;
  for (let i = 0; i < N; i++) ring[i] -= mean;
  let idx = 0, peak = 0, hpX = 0, hpY = 0;
  for (let n = 0; n < len; n++) {
    const cur = ring[idx];
    const nxt = ring[idx + 1 < N ? idx + 1 : 0];
    ring[idx] = g * ((1 - s) * cur + s * nxt);
    idx = idx + 1 < N ? idx + 1 : 0;
    // DC blocker.
    hpY = cur - hpX + 0.995 * hpY;
    hpX = cur;
    out[n] = hpY;
    const ab = hpY < 0 ? -hpY : hpY;
    if (ab > peak) peak = ab;
  }
  const norm = peak > 0 ? 0.8 / peak : 1;
  const fade = Math.min(len >> 2, Math.floor(sr * 0.04));
  for (let n = 0; n < len; n++) {
    let v = out[n] * norm;
    if (n >= len - fade) v *= (len - n) / fade;
    out[n] = v;
  }
  return { buffer: buf, f0 };
}

export function createKit(ac, counters) {
  const noise = makeNoise(ac, 2.6, 'white');
  const pink = makeNoise(ac, 3.1, 'pink');
  const brown = makeNoise(ac, 3.7, 'brown');
  const hasPanner = typeof ac.createStereoPanner === 'function';
  const plucks = new Map();
  const waves = {};

  const n = (node) => { counters.nodes++; return node; };

  function wave(name) {
    if (waves[name]) return waves[name];
    // Harmonic amplitudes for reeds and pipes.
    const H = {
      shawm: [0, 1, 0.75, 0.9, 0.55, 0.62, 0.38, 0.33, 0.22, 0.18, 0.12, 0.1, 0.06],
      clarinet: [0, 1, 0.04, 0.45, 0.03, 0.24, 0.02, 0.13, 0.01, 0.07, 0, 0.04],
      reed: [0, 1, 0.5, 0.6, 0.3, 0.42, 0.2, 0.25, 0.12, 0.14, 0.08],
      organ: [0, 1, 0.5, 0.25, 0.3, 0.05, 0.12, 0, 0.08],
      horn: [0, 1, 0.62, 0.45, 0.3, 0.22, 0.15, 0.1, 0.07, 0.05],
    }[name] || [0, 1];
    const real = new Float32Array(H.length);
    const imag = new Float32Array(H);
    waves[name] = ac.createPeriodicWave(real, imag);
    return waves[name];
  }

  const kit = {
    ac,
    noise, pink, brown,
    impulse: (s, d) => makeImpulse(ac, s, d),
    gain(v = 1) { const g = n(ac.createGain()); g.gain.value = v; return g; },
    osc(type, freq) {
      const o = n(ac.createOscillator());
      if (type === 'sine' || type === 'square' || type === 'sawtooth' || type === 'triangle') o.type = type;
      else o.setPeriodicWave(wave(type));
      o.frequency.value = freq;
      return o;
    },
    filter(type, freq, q = 0.707, gainDb = 0) {
      const f = n(ac.createBiquadFilter());
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      if (gainDb) f.gain.value = gainDb;
      return f;
    },
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
    // Noise source starting at a random offset so bursts never repeat exactly.
    noiseSrc(buffer = noise, rate = 1, loop = false) {
      const s = kit.src(buffer, loop, rate);
      s._offset = Math.random() * Math.max(0, buffer.duration - 0.8);
      return s;
    },
    // Percussive envelope: linear attack to peak, exponential decay to silence. Returns end time.
    perc(param, t, attack, peak, decay) {
      param.setValueAtTime(0.0001, t);
      param.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      return t + attack + decay;
    },
    // Attack / hold / release envelope. Returns end time.
    ahr(param, t, attack, peak, hold, release) {
      param.setValueAtTime(0.0001, t);
      param.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      param.setValueAtTime(Math.max(0.0002, peak), t + attack + Math.max(0, hold));
      param.exponentialRampToValueAtTime(0.0001, t + attack + Math.max(0, hold) + release);
      return t + attack + Math.max(0, hold) + release;
    },
    // Start sources at t, stop them at end, free the whole voice when they finish.
    voice(sources, nodes, t, end) {
      counters.voices++;
      let left = sources.length;
      let freed = false;
      const done = () => {
        if (--left > 0 || freed) return;
        freed = true;
        for (const x of nodes) { try { x.disconnect(); } catch { /* ignore */ } }
        for (const s of sources) { try { s.disconnect(); } catch { /* ignore */ } }
        counters.voices--;
      };
      if (!sources.length) { left = 1; done(); return; }
      for (const s of sources) {
        s.onended = done;
        try {
          // Sources may carry their own start time (_t): buffer notes inside a multi-part sound.
          const st = s._t ?? t;
          if (s._offset != null) s.start(st, s._offset);
          else s.start(st);
          s.stop(Math.max(st, end) + 0.05);
        } catch { done(); }
      }
    },
    // Commit {srcs, nodes, end} parts (plus extra nodes such as the output gain) as one voice.
    commit(t, parts, extra = []) {
      const srcs = [], nodes = [...extra];
      let end = t;
      for (const p of parts) {
        if (!p) continue;
        srcs.push(...p.srcs);
        nodes.push(...p.nodes);
        end = Math.max(end, p.end);
      }
      if (srcs.length) kit.voice(srcs, nodes, t, end);
      else for (const x of nodes) { try { x.disconnect(); } catch { /* ignore */ } }
      return end;
    },
    // Cached Karplus-Strong buffer for an instrument; returns { buffer, rate } for this pitch.
    // Buffers are rendered every two semitones and pitch-shifted at most one semitone.
    pluck(type, midi) {
      const base = Math.round(midi / 2) * 2;
      const key = type + ':' + base;
      let p = plucks.get(key);
      if (!p) {
        p = renderPluck(ac, type, base);
        plucks.set(key, p);
        if (plucks.size > 140) plucks.delete(plucks.keys().next().value);
      }
      return { buffer: p.buffer, rate: mtof(midi) / p.f0 };
    },
    get pluckCount() { return plucks.size; },
  };
  return kit;
}
