// World ambience: a handful of persistent looping beds (wind, sea, river/lake water, night insects,
// swamp buzz, town murmur, crystal hum, cave rumble, fire, forest leaves) whose gains are steered
// ~10 times a second from where the player stands and the time of day, plus scattered one-shots
// played through the SFX layer (birds, gulls, owls, howls, frogs, drips, rumbles, town life, the
// Gildmoor bell on the hour). Owner: audio builder.

import { ZONES, LAKES, RIVER, SPAWN } from '../data/zones.js';
import { distToRiver, T_INDOOR } from '../world/mapgen.js';
import { clamp, smoothstep, rand, pick } from './kit.js';

const TAU = Math.PI * 2;
const ZONE_IDS = Object.keys(ZONES);

export function createAmbience(kit, out, sfx, ctx) {
  const { ac } = kit;
  const nodes = [];
  const keep = (...ns) => { for (const n of ns) nodes.push(n); return ns[0]; };
  const loop = (buffer, rate = 1) => {
    const s = keep(kit.src(buffer, true, rate));
    s.start(ac.currentTime + 0.02, Math.random() * buffer.duration * 0.9);
    return s;
  };
  const chain = (...ns) => {
    for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]);
    for (const n of ns) if (n !== out && !nodes.includes(n)) nodes.push(n);
    return ns[ns.length - 1];
  };
  const G = () => kit.gain(0);

  // Wind: broad band + thin whistle.
  const windSrc = loop(kit.noise, 0.5);
  const windBp = kit.filter('bandpass', 500, 0.8), windG = G();
  chain(windSrc, windBp, windG, out);
  const whistleBp = kit.filter('bandpass', 1300, 8), whistleG = G();
  windSrc.connect(whistleBp);
  chain(whistleBp, whistleG, kit.panner(0.4), out);
  // Sea: brown swell + bright foam.
  const waveLp = kit.filter('lowpass', 420, 0.5), waveG = G();
  chain(loop(kit.brown), waveLp, waveG, kit.panner(-0.2), out);
  const foamG = G();
  chain(loop(kit.noise, 0.9), kit.filter('highpass', 2400, 0.5), kit.filter('lowpass', 7500, 0.5), foamG, kit.panner(0.25), out);
  // Fresh water: babble + low rush.
  const brookBp = kit.filter('bandpass', 1900, 1.1), brookG = G();
  chain(loop(kit.noise, 1.3), brookBp, brookG, kit.panner(-0.3), out);
  const rushG = G();
  chain(loop(kit.brown, 1.4), kit.filter('lowpass', 520, 0.7), rushG, out);
  // Night insects: sine carriers gated by scheduled chirps.
  const insects = [
    { f: 4350, pan: -0.6, period: 0.62, pulses: 3 },
    { f: 3820, pan: 0.55, period: 0.81, pulses: 4 },
    { f: 5150, pan: 0.05, period: 1.37, pulses: 2, quiet: 0.6 },
  ].map((c) => {
    const o = keep(kit.osc('sine', c.f));
    const gate = kit.gain(0), lvl = G();
    chain(o, gate, lvl, kit.panner(c.pan), out);
    o.start();
    return { ...c, gate, lvl, next: 0 };
  });
  // Swamp buzz: amplitude-modulated high sines.
  const buzzG = G();
  const buzzAm = kit.gain(0.5);
  chain(buzzAm, buzzG, kit.panner(0.3), out);
  for (const f of [3100, 3480]) { const o = keep(kit.osc('sine', f)); const g = kit.gain(0.5); chain(o, g, buzzAm); o.start(); }
  const buzzLfo = keep(kit.osc('square', 37)), buzzLg = kit.gain(0.45);
  chain(buzzLfo, buzzLg); buzzLg.connect(buzzAm.gain); buzzLfo.start();
  const bogG = G();
  chain(loop(kit.brown, 0.6), kit.filter('lowpass', 180, 0.8), bogG, out);
  // Town murmur: pink noise through moving vowel formants.
  const crowdG = G();
  const crowdIn = loop(kit.pink, 1);
  const formants = [[450, 6], [1150, 7], [2500, 8]].map(([f, q], i) => {
    const bp = kit.filter('bandpass', f, q), g = kit.gain(0.3);
    crowdIn.connect(bp); chain(bp, g, crowdG);
    return { bp, g, base: f, i };
  });
  chain(crowdG, out);
  // Crystal hum (Orbio Spire): F lydian sines with slow beating.
  const crystalG = G();
  const crystalTrem = kit.gain(1);
  chain(crystalTrem, crystalG, out);
  for (const f of [349.2, 523.3, 659.3, 987.8]) for (const d of [0, 1.3]) {
    const o = keep(kit.osc('sine', f + d)); const g = kit.gain(f > 900 ? 0.12 : 0.22); chain(o, g, crystalTrem); o.start();
  }
  const crLfo = keep(kit.osc('sine', 0.21)), crLg = kit.gain(0.3);
  chain(crLfo, crLg); crLg.connect(crystalTrem.gain); crLfo.start();
  // Cave: sub rumble + beating low hum.
  const caveG = G();
  chain(loop(kit.brown, 0.5), kit.filter('lowpass', 110, 0.8), caveG, out);
  const humG = G();
  for (const f of [48, 49.3]) { const o = keep(kit.osc('sine', f)); chain(o, humG); o.start(); }
  chain(humG, out);
  // Fire bed.
  const fireG = G();
  chain(loop(kit.brown, 1.5), kit.filter('lowpass', 450, 0.7), fireG, out);
  // Forest leaves.
  const leavesHp = kit.filter('highpass', 2600, 0.5), leavesG = G();
  chain(loop(kit.pink, 1), leavesHp, leavesG, kit.panner(-0.2), out);

  // ---------------------------------------------------------------- environment estimate
  const env = { zone: null, w: {}, coast: 0, water: 0, altitude: 0, wind: 0, indoor: 0, dungeon: null, fire: 0, furnace: 0, day: 1, night: 0, dawn: 0, outdoor: 1 };
  let override = null;
  let sampleT = 0, fireT = 0, paramT = 0, lastHour = null;

  function playerPos() {
    const mode = ctx.state?.mode;
    const p = ctx.player?.pos;
    if ((mode === 'play' || mode === 'dead' || mode === 'cutscene') && p && Number.isFinite(p.x) && (p.x || p.z)) return p;
    return { x: SPAWN.x, z: SPAWN.z };
  }

  function sample() {
    const p = playerPos();
    const map = ctx.map;
    if (!map) return;
    const region = map.regionAt(p.x, p.z);
    env.dungeon = region.id !== 'overworld' ? region.id : null;
    env.zone = map.zoneAt(p.x, p.z);
    for (const id of ZONE_IDS) {
      const z = ZONES[id];
      const d = env.dungeon ? Infinity : Math.hypot(p.x - z.x, p.z - z.z);
      env.w[id] = 1 - smoothstep(z.r * 0.55, z.r * 1.05, d);
    }
    if (env.dungeon) {
      env.coast = env.water = env.altitude = env.wind = 0;
      env.indoor = 1;
      return;
    }
    // Sea to the south: sample rings around the listener.
    let sea = 0;
    for (const [r, w] of [[6, 1], [16, 0.8], [32, 0.5]]) {
      let n = 0;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (z > 282 && map.heightAt(x, z) < -0.5) n++;
      }
      sea = Math.max(sea, (n / 8) * 1.6 * w);
    }
    env.coast = clamp(sea, 0, 1);
    // Fresh water: river and lakes.
    let water = 1 - smoothstep(RIVER.width / 2 + 1, RIVER.width / 2 + 22, distToRiver(p.x, p.z));
    for (const L of LAKES) water = Math.max(water, 0.8 * (1 - smoothstep(0, 20, Math.hypot(p.x - L.x, p.z - L.z) - L.r)));
    env.water = water * (1 - env.coast * 0.6);
    const h = map.heightAt(p.x, p.z);
    env.altitude = h;
    env.wind = clamp(smoothstep(7, 26, h) + 0.6 * (env.w.highlands || 0), 0, 1);
    const f = map.tileFlags(Math.floor(p.x), Math.floor(p.z));
    env.indoor = f & T_INDOOR ? 1 : 0;
  }

  function sampleFires() {
    const p = playerPos();
    let fire = 0, furnace = 0;
    const es = ctx.entities;
    if (es?.near && ctx.state?.mode === 'play') {
      for (const e of es.near(Math.floor(p.x), Math.floor(p.z), 10)) {
        const id = e.defId || e.def?.id || '';
        if (e.kind !== 'object' || !/fire|range|furnace|forge|brazier|campfire/.test(id)) continue;
        const d = Math.hypot(e.x + (e.w || 1) / 2 - p.x, e.z + (e.d || 1) / 2 - p.z);
        const k = Math.pow(clamp(1 - d / 10, 0, 1), 1.3);
        if (/furnace|forge/.test(id)) furnace = Math.max(furnace, k);
        else fire = Math.max(fire, id === 'range' ? k * 0.6 : k);
      }
    }
    env.fire = fire;
    env.furnace = furnace;
  }

  function timeOfDay() {
    const h = ctx.sky?.hour;
    const hour = Number.isFinite(h) ? ((h % 24) + 24) % 24 : 11;
    env.day = smoothstep(5, 7, hour) * (1 - smoothstep(19, 21, hour));
    env.night = 1 - env.day;
    env.dawn = Math.exp(-Math.pow((hour - 6.5) / 1.2, 2));
    return hour;
  }

  // ---------------------------------------------------------------- one-shots
  const play = (name, vol, o = {}) => sfx.play(name, { bus: 'amb', pan: rand(-0.8, 0.8), volume: vol, wet: env.dungeon ? 1.6 : 0.7, ...o });
  function scatter(dt, k) {
    const w = env.w;
    const day = env.day, night = env.night;
    const ov = override || {};
    const chance = (rate) => Math.random() < rate * dt;
    if (env.dungeon) {
      const dl = ov.drips ?? 1;
      if (chance(0.55 * dl)) play('amb-drip', rand(0.4, 1) * k);
      if (chance(0.04)) play('amb-rumble', rand(0.5, 1) * k);
      if (env.dungeon === 'warrens' && chance(0.03)) play('amb-chatter', 0.35 * k, { wet: 2 });
      if (env.dungeon === 'lair' && chance(0.05)) play('fire-crackle', 0.4 * k);
      return;
    }
    const out = env.outdoor;
    const birdRate = (ov.birds ?? 1) * day * out * ((w.hoodwood || 0) * 0.55 + (w.brightwater || 0) * 0.35 + (w.farms || 0) * 0.4 + (w.gildmoor || 0) * 0.1 + (w.copperhollow || 0) * 0.15 + (w.mistfen || 0) * 0.07 + (w.highlands || 0) * 0.05 + (env.zone === 'wilds' ? 0.3 : 0) + 0.06) * (1 + 1.5 * env.dawn) * (1 - env.coast * 0.7) * (1 - (w.oracle || 0));
    if (chance(birdRate)) {
      const r = Math.random();
      if ((w.hoodwood || 0) > 0.3 && r < 0.12) play('amb-dove', rand(0.5, 0.9) * k);
      else if ((w.hoodwood || 0) > 0.3 && r < 0.18) play('amb-woodpecker', rand(0.4, 0.8) * k);
      else play('amb-bird', rand(0.4, 1) * k);
    }
    if (chance((ov.gulls ?? 1) * env.coast * (0.3 + 0.7 * day) * 0.16)) play('amb-gull', rand(0.5, 1) * k);
    if (chance(env.coast * 0.025)) play('amb-buoy', 0.5 * k);
    if (chance((w.docks || 0) * 0.06)) play('amb-creak', rand(0.5, 1) * k);
    if (chance((ov.owls ?? 1) * night * out * ((w.hoodwood || 0) * 0.05 + (w.brightwater || 0) * 0.02 + (env.zone === 'wilds' ? 0.025 : 0)))) play('amb-owl', rand(0.4, 0.8) * k);
    if (chance(night * out * ((w.highlands || 0) * 0.012 + (w.hoodwood || 0) * 0.006))) play('amb-howl', rand(0.3, 0.6) * k);
    const frogRate = (ov.frogs ?? 1) * ((w.mistfen || 0) * (0.3 + 0.7 * night) * 0.6 + env.water * night * 0.12);
    if (chance(frogRate)) play('amb-frog', rand(0.4, 1) * k);
    if (chance((w.mistfen || 0) * 0.12)) play('amb-bubble', rand(0.3, 0.7) * k);
    const town = w.gildmoor || 0;
    if (town > 0.2) {
      if (chance(town * day * 0.03)) play('amb-hammer', 0.35 * k, { pan: rand(-0.9, 0.9) });
      if (chance(town * 0.02)) play('amb-cart', 0.6 * k);
      if (chance(town * (0.25 + 0.75 * day) * 0.07)) play('amb-call', rand(0.4, 0.8) * k);
    }
    if (chance((w.copperhollow || 0) * day * 0.05)) play('mine', rand(0.12, 0.25) * k, { wet: 1.4 });
    if (chance((w.highlands || 0) * day * 0.02)) play('amb-eagle', rand(0.4, 0.8) * k);
    if (chance((w.oracle || 0) * 0.28 * (ov.crystal ?? 1))) play('amb-crystal', rand(0.3, 0.8) * k);
    if (chance((w.hoodwood || 0) * 0.03)) play('amb-leaves', rand(0.5, 1) * k);
    if (chance((w.farms || 0) * 0.025)) play('amb-creak', 0.4 * k);
    if (chance((w.brightwater || 0) * (0.2 + 0.8 * day) * 0.025)) play('amb-call', rand(0.25, 0.5) * k);
    if (chance((w.brightwater || 0) * day * 0.008)) play('amb-hammer', 0.2 * k, { pan: rand(-0.9, 0.9) });
    if (chance(env.fire * 2.5)) play('fire-crackle', env.fire * 0.5 * k, { pan: rand(-0.3, 0.3) });
  }

  // Gildmoor's bell tolls on the hour while you are in or near the town.
  function hourBell(hour) {
    const hi = Math.floor(hour);
    if (lastHour === null) { lastHour = hi; return; }
    if (hi === lastHour) return;
    lastHour = hi;
    const town = env.w.gildmoor || 0;
    if (town > 0.25 && !env.dungeon) play('amb-townbell', 0.8 * town, { pan: 0.2, n: hi % 12 === 0 ? 4 : 2, wet: 1.2 });
  }

  const set = (param, v, now, tc = 0.3) => param.setTargetAtTime(v, now, tc);

  return {
    env,
    setOverride(levels) { override = levels && typeof levels === 'object' ? { ...levels } : null; },
    get override() { return override; },
    update(dt) {
      const now = ac.currentTime;
      const mode = ctx.state?.mode || 'loading';
      sampleT -= dt;
      if (sampleT <= 0) { sampleT = 0.5; try { sample(); } catch (err) { /* map not ready */ } }
      fireT -= dt;
      if (fireT <= 0) { fireT = 1; try { sampleFires(); } catch { /* ignore */ } }
      const hour = timeOfDay();
      const modeK = { loading: 0, login: 0.6, create: 0.6, play: 1, dead: 0.35, cutscene: 0.8 }[mode] ?? 0.8;
      env.outdoor = env.indoor ? 0.45 : 1;
      const k = modeK;
      if (mode !== 'loading') {
        scatter(Math.min(dt, 0.1), k);
        if (mode === 'play') hourBell(hour);
      }

      // Insects: schedule chirp gates ahead of time.
      const ov = override || {};
      const w = env.w;
      const insectLvl = (ov.crickets ?? env.night * (1 - (w.gildmoor || 0) * 0.8) * (1 - (w.oracle || 0)) * (1 - (w.highlands || 0) * 0.7) * (1 - env.coast * 0.5) * (env.dungeon ? 0 : 1) * env.outdoor) * k;
      for (const ins of insects) {
        if (insectLvl < 0.01) { ins.next = now; continue; }
        if (ins.next < now) ins.next = now + rand(0, 0.3);
        while (ins.next < now + 0.25) {
          const t0 = ins.next;
          for (let j = 0; j < ins.pulses; j++) {
            const ts = t0 + j * 0.052;
            ins.gate.gain.setValueAtTime(0, ts);
            ins.gate.gain.linearRampToValueAtTime(1, ts + 0.006);
            ins.gate.gain.linearRampToValueAtTime(0, ts + 0.026);
          }
          ins.next = t0 + ins.period * rand(0.85, 1.25) + (Math.random() < 0.08 ? rand(0.6, 2) : 0);
        }
      }

      paramT -= dt;
      if (paramT > 0) return;
      paramT = 0.1;
      const out = env.outdoor;
      const dun = env.dungeon ? 1 : 0;
      // Wind (always a faint breath outdoors, strong on the heights).
      const gust = (0.5 + 0.5 * Math.sin(now * 0.37)) * (0.5 + 0.5 * Math.sin(now * 0.23 + 1));
      const wind = (ov.wind ?? (0.03 + 0.17 * env.wind + 0.05 * env.coast + 0.06 * (w.oracle || 0)) * (1 - dun)) * out * k;
      set(windG.gain, wind * (0.5 + 0.5 * gust), now);
      set(windBp.frequency, 300 + 600 * gust + 300 * env.wind, now, 0.4);
      set(whistleG.gain, (ov.wind != null ? ov.wind * 0.4 : 0.13 * env.wind) * gust * out * k * (1 - dun), now, 0.4);
      set(whistleBp.frequency, 1100 + 600 * gust, now, 0.5);
      // Sea.
      const s = clamp(0.5 + 0.32 * Math.sin((TAU * now) / 7.3) + 0.22 * Math.sin((TAU * now) / 11.9 + 1.7), 0, 1);
      const sLag = clamp(0.5 + 0.32 * Math.sin((TAU * (now - 0.9)) / 7.3) + 0.22 * Math.sin((TAU * (now - 0.9)) / 11.9 + 1.7), 0, 1);
      const coast = (ov.waves ?? env.coast) * k * out;
      set(waveG.gain, coast * 0.32 * (0.22 + 0.78 * s * s), now, 0.15);
      set(waveLp.frequency, 280 + 760 * s * s, now, 0.2);
      set(foamG.gain, coast * 0.08 * Math.pow(sLag, 3), now, 0.15);
      // Fresh water.
      const water = (ov.water ?? env.water) * k * out;
      set(brookG.gain, water * 0.16, now, 0.5);
      set(brookBp.frequency, 1700 + 500 * Math.sin(now * 1.3) * Math.sin(now * 0.7), now, 0.1);
      set(rushG.gain, water * 0.12, now, 0.5);
      for (const ins of insects) set(ins.lvl.gain, insectLvl * 0.035 * (ins.quiet ?? 1), now, 0.6);
      // Swamp.
      const fen = (ov.swamp ?? (w.mistfen || 0)) * k * (1 - dun);
      set(buzzG.gain, fen * 0.012 * (0.5 + 0.5 * env.day) * out, now, 0.6);
      set(bogG.gain, fen * 0.15, now, 0.6);
      // Town murmur.
      const crowd = (ov.town ?? (w.gildmoor || 0) * (0.35 + 0.65 * env.day)) * k * (1 - dun);
      set(crowdG.gain, crowd * 0.7 * (env.indoor ? 0.5 : 1), now, 0.6);
      for (const f of formants) {
        set(f.g.gain, rand(0.05, 0.4), now, 0.06);
        set(f.bp.frequency, f.base * rand(0.8, 1.25), now, 0.08);
      }
      // Crystal hum.
      set(crystalG.gain, (ov.crystal ?? (w.oracle || 0)) * 0.035 * k * (1 - dun), now, 0.8);
      // Cave.
      const cave = (ov.cave ?? dun) * k;
      set(caveG.gain, cave * 0.2, now, 0.8);
      set(humG.gain, cave * 0.035, now, 0.8);
      // Fire / furnace.
      set(fireG.gain, ((ov.fire ?? env.fire) * 0.16 + env.furnace * 0.25) * k, now, 0.4);
      // Forest leaves.
      const leaves = (ov.leaves ?? (w.hoodwood || 0) * 0.7 + (w.brightwater || 0) * 0.15) * k * out * (1 - dun);
      set(leavesG.gain, leaves * 0.03 * (0.3 + 0.7 * gust), now, 0.5);
      set(leavesHp.frequency, 2400 + 1200 * gust, now, 0.5);
    },
    dispose() {
      for (const n of nodes) {
        try { n.stop?.(); } catch { /* ignore */ }
        try { n.disconnect(); } catch { /* ignore */ }
      }
    },
  };
}
