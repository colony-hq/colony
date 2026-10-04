// Continuous ambience: waves (near the coast), wind (heights, gliding, speed), night insects,
// waterfall + river, campfire crackle, and an eerie undertone in thick kabut. A handful of
// persistent looping nodes whose gains are steered ~12 times a second. Owner: ui-audio.

import { CHECKPOINTS, heightAt, distToRiver } from '../world/heightfield.js';
import { clamp, smoothstep, rand } from './audio-kit.js';

const FALLS = { x: -156, y: 14, z: -33 };
const TAU = Math.PI * 2;

export function createAmbience(kit, out, ctx) {
  const { ac } = kit;
  const nodes = [];
  const track = (...ns) => { nodes.push(...ns); return ns[0]; };

  function loop(buffer, rate = 1) {
    const s = track(kit.src(buffer, true, rate));
    s.start(ac.currentTime + 0.02, Math.random() * buffer.duration * 0.9);
    return s;
  }
  function chain(...ns) {
    for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]);
    for (const x of ns) if (x !== out && !nodes.includes(x)) nodes.push(x);
    return ns[ns.length - 1];
  }

  // Waves: brown-noise swell + bright foam hiss that peaks just after it.
  const waveLp = kit.filter('lowpass', 420, 0.5);
  const waveG = kit.gain(0);
  chain(loop(kit.brown, 1), waveLp, waveG, kit.panner(-0.25), out);
  const foamG = kit.gain(0);
  chain(loop(kit.noise, 1), kit.filter('highpass', 2400, 0.5), kit.filter('lowpass', 7500, 0.5), foamG, kit.panner(0.3), out);

  // Wind: wide band + a thin whistle that rises with height and gliding.
  const windSrc = loop(kit.noise, 0.5);
  const windBp = kit.filter('bandpass', 500, 0.8);
  const windG = kit.gain(0);
  chain(windSrc, windBp, windG, out);
  const whistleBp = kit.filter('bandpass', 1300, 7);
  const whistleG = kit.gain(0);
  windSrc.connect(whistleBp);
  chain(whistleBp, whistleG, kit.panner(0.4), out);

  // Waterfall roar + river babble.
  const fallG = kit.gain(0);
  chain(loop(kit.noise, 1), kit.filter('lowpass', 1100, 0.6), fallG, out);
  const fallLowG = kit.gain(0);
  chain(loop(kit.brown, 0.8), kit.filter('lowpass', 300, 0.7), fallLowG, out);
  const brookBp = kit.filter('bandpass', 1900, 0.9);
  const brookG = kit.gain(0);
  chain(loop(kit.noise, 1.3), brookBp, brookG, kit.panner(-0.3), out);

  // Campfire bed (crackles are scheduled one-shots).
  const fireG = kit.gain(0);
  chain(loop(kit.brown, 1.5), kit.filter('lowpass', 420, 0.7), fireG, out);

  // Night insects: sine carriers gated by scheduled chirp envelopes.
  const insects = [
    { f: 4350, pan: -0.6, period: 0.62, pulses: 3 },
    { f: 3820, pan: 0.55, period: 0.81, pulses: 4 },
    { f: 5150, pan: 0.05, period: 1.37, pulses: 2, quiet: 0.6 },
  ].map((c) => {
    const o = track(kit.osc('sine', c.f));
    const gate = kit.gain(0);
    const lvl = kit.gain(0);
    chain(o, gate, lvl, kit.panner(c.pan), out);
    o.start();
    return { ...c, gate, lvl, next: 0 };
  });

  // Kabut undertone: low beating hum + airy whistle.
  const kabutG = kit.gain(0);
  track(kabutG);
  kabutG.connect(out);
  for (const f of [110, 110.7, 164.8]) {
    const o = track(kit.osc('sine', f));
    const g = kit.gain(f > 150 ? 0.35 : 0.6);
    o.connect(g); g.connect(kabutG); track(g);
    o.start();
  }
  const kabutBp = kit.filter('bandpass', 900, 14);
  const kabutAir = kit.gain(2.2);
  chain(loop(kit.noise, 1), kabutBp, kabutAir, kabutG);

  // ---------------------------------------------------------------- level estimation
  const env = { coast: 0, fog: 0, fire: 0, night: 0 };
  let sampleT = 0, paramT = 0;
  let override = null;
  let lastNow = 0;

  function sampleWorld(p) {
    // Coast: how much sea is around the listener (8 directions × 3 rings).
    let coast = heightAt(p.x, p.z) < -0.4 ? 1 : 0;
    const rings = [[10, 1], [24, 0.75], [48, 0.45]];
    for (const [r, w] of rings) {
      let sea = 0;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        if (heightAt(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r) < -0.4) sea++;
      }
      coast = Math.max(coast, (sea / 8) * 1.6 * w);
    }
    const hAbove = Math.max(0, p.y - 2);
    env.coast = clamp(coast, 0, 1) * (1 - smoothstep(10, 45, hAbove) * 0.7);

    // Kabut depth: sample just outside the lantern bubble.
    const fog = ctx.fog;
    if (fog?.fogAmount) {
      const r = (ctx.player?.lanternRadius ?? 14) + 8;
      let f = 0;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + 0.4;
        f += fog.fogAmount(p.x + Math.cos(a) * r, p.y + 1.5, p.z + Math.sin(a) * r);
      }
      env.fog = f / 4;
    } else env.fog = 0;

    // Nearest lit campfire.
    let fire = 0;
    const cps = ctx.state?.progress?.checkpoints || {};
    for (const c of CHECKPOINTS) {
      if (!cps[c.id]) continue;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      fire = Math.max(fire, Math.pow(clamp(1 - d / 26, 0, 1), 1.4));
    }
    env.fire = fire;
    env.river = p.y > 18 ? clamp(1 - distToRiver(p.x, p.z) / 24, 0, 1) : 0;
  }

  function crackle(t, vol, dest) {
    const s = kit.noiseSrc(kit.noise);
    const bp = kit.filter('bandpass', rand(1800, 6500), 1.6);
    const g = kit.gain(0);
    s.connect(bp); bp.connect(g); g.connect(dest);
    const end = kit.perc(g.gain, t, 0.001, vol, rand(0.008, 0.035));
    kit.voice([s], [bp, g], t, end);
  }

  function set(param, v, now, tc = 0.25) {
    param.setTargetAtTime(v, now, tc);
  }

  return {
    env,
    setOverride(levels) { override = levels && typeof levels === 'object' ? { ...levels } : null; },
    get override() { return override; },

    update(dt) {
      const now = ac.currentTime;
      const p = ctx.player?.position || ctx.camera?.position;
      if (!p) return;
      sampleT -= dt;
      if (sampleT <= 0) { sampleT = 0.4; sampleWorld(p); }

      const mode = ctx.state?.mode || 'loading';
      const modeK = { loading: 0, title: 0.75, pause: 0.35, journal: 0.55, dialogue: 0.7 }[mode] ?? 1;
      const ov = override || {};

      // Fire crackles are scheduled every frame (small lookahead).
      const fireLvl = (ov.fire ?? env.fire) * modeK;
      if (fireLvl > 0.02 && now - lastNow < 0.5) {
        const expected = dt * 9 * fireLvl;
        let n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
        while (n-- > 0) crackle(now + rand(0.02, 0.12), rand(0.1, 0.3) * fireLvl, out);
      }
      lastNow = now;

      // Insects: schedule chirp gates ahead of time.
      const tod = ctx.sky?.timeOfDay ?? 0.1;
      const night = smoothstep(0.16, 0.5, tod) * (1 - smoothstep(0.86, 1.0, tod));
      const hp = ctx.player?.position?.y ?? 0;
      const insectLvl = (ov.insects ?? night * (1 - env.fog * 0.85) * (1 - smoothstep(25, 60, hp)) * (1 - env.coast * 0.5)) * modeK;
      for (const ins of insects) {
        if (insectLvl < 0.01) { ins.next = now; continue; }
        if (ins.next < now) ins.next = now + rand(0, 0.3);
        while (ins.next < now + 0.25) {
          const t0 = ins.next;
          for (let k = 0; k < ins.pulses; k++) {
            const ts = t0 + k * 0.052;
            ins.gate.gain.setValueAtTime(0, ts);
            ins.gate.gain.linearRampToValueAtTime(1, ts + 0.006);
            ins.gate.gain.linearRampToValueAtTime(0, ts + 0.026);
          }
          ins.next = t0 + ins.period * rand(0.85, 1.25) + (Math.random() < 0.08 ? rand(0.6, 2) : 0);
        }
      }

      paramT -= dt;
      if (paramT > 0) return;
      paramT = 0.08;

      // Waves.
      const s = clamp(0.5 + 0.32 * Math.sin((TAU * now) / 7.3) + 0.22 * Math.sin((TAU * now) / 11.9 + 1.7), 0, 1);
      const sLag = clamp(0.5 + 0.32 * Math.sin((TAU * (now - 0.9)) / 7.3) + 0.22 * Math.sin((TAU * (now - 0.9)) / 11.9 + 1.7), 0, 1);
      const coast = ov.waves ?? env.coast;
      set(waveG.gain, coast * 0.3 * (0.22 + 0.78 * s * s) * modeK, now, 0.15);
      set(waveLp.frequency, 280 + 760 * s * s, now, 0.2);
      set(foamG.gain, coast * 0.09 * Math.pow(sLag, 3) * modeK, now, 0.15);

      // Wind.
      const pl = ctx.player;
      const heightK = smoothstep(12, 60, hp);
      const glide = pl?.gliding ? 1 : 0;
      const speed = pl?.velocity ? Math.hypot(pl.velocity.x, pl.velocity.z) : 0;
      const gust = (0.5 + 0.5 * Math.sin(now * 0.37)) * (0.5 + 0.5 * Math.sin(now * 0.23 + 1));
      const windBase = ov.wind ?? (0.05 + 0.24 * heightK + 0.32 * glide + 0.1 * smoothstep(5, 12, speed) + 0.06 * env.coast);
      set(windG.gain, windBase * (0.55 + 0.45 * gust) * 0.95 * modeK, now, 0.3);
      set(windBp.frequency, 300 + 650 * gust + 450 * glide, now, 0.4);
      set(whistleG.gain, (0.16 * heightK + 0.4 * glide) * gust * modeK, now, 0.4);
      set(whistleBp.frequency, 1100 + 500 * gust, now, 0.5);

      // Waterfall + river.
      const df = Math.hypot(p.x - FALLS.x, (p.y - FALLS.y) * 0.6, p.z - FALLS.z);
      const falls = ov.waterfall ?? Math.pow(clamp(1 - df / 140, 0, 1), 1.8);
      set(fallG.gain, falls * 0.7 * modeK, now, 0.4);
      set(fallLowG.gain, falls * 0.5 * modeK, now, 0.4);
      set(brookG.gain, (env.river || 0) * 0.25 * modeK, now, 0.5);
      set(brookBp.frequency, 1700 + 500 * Math.sin(now * 1.3) * Math.sin(now * 0.7), now, 0.1);

      // Fire bed, insects level, kabut undertone.
      set(fireG.gain, fireLvl * 0.18, now, 0.4);
      for (const ins of insects) set(ins.lvl.gain, insectLvl * 0.05 * (ins.quiet ?? 1), now, 0.6);
      const kab = (ov.kabut ?? smoothstep(0.3, 0.85, env.fog)) * modeK * (mode === 'finale' ? 0 : 1);
      set(kabutG.gain, kab * 0.035, now, 0.8);
      set(kabutBp.frequency, 820 + 260 * Math.sin(now * 0.13), now, 0.5);
    },

    dispose() {
      for (const n of nodes) {
        try { n.stop?.(); } catch { /* ignore */ }
        try { n.disconnect(); } catch { /* ignore */ }
      }
    },
  };
}
