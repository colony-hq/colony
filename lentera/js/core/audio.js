// Audio: pure WebAudio synthesis (no samples, no fetch). Generative slendro gamelan with mood
// crossfades, world ambience and event-driven SFX. Owner: ui-audio. API: DESIGN.md §7 audio.
//
// API: unlock(), play(name, opts) -> bool, setMusic(mood | null) (override until the next mode
// change; null/'auto' = automatic), setAmbience({wind, waves, insects, waterfall, fire, kabut} |
// null), applyVolumes(), stats(), update(dt). Moods: title, explore, dawn, danger, finale, silent.
//
// Graph: mood buses -> musicVol -> musicFilter -> master;  musicVol -> musicWet -> reverb
//        sfx voices -> sfxBus -> world (kabut lowpass) -> master; voices -> sfxWet -> reverb
//        ambience -> ambBus -> world;  UI voices -> uiBus -> master;  master -> compressor -> out

import { createKit, clamp, smoothstep } from './audio-kit.js';
import { createGamelan } from './audio-gamelan.js';
import { createSfx } from './audio-sfx.js';
import { createAmbience } from './audio-ambience.js';

// Typing blip pitch per speaker (1 = 420 Hz).
const VOICE_PITCH = { sarni: 0.82, darto: 0.68, ratih: 1.12, laras: 1.3, lamun: 0.58 };

export function createAudio(ctx) {
  const { events, state } = ctx;
  const counters = { nodes: 0, voices: 0 };
  let ac = null;
  let kit = null, bus = null, music = null, sfx = null, amb = null;
  let override = null;
  let danger = 0;
  let creditsOpen = false;
  let swimming = false, strokeT = 0;
  let paramT = 0, dangerT = 0;
  let failed = false;
  let ambOverride = null;
  let externalBlips = false, blipT = 0;
  let musicLevel = 0.4;
  let duck = 1;

  const ready = () => !!ac && ac.state === 'running' && !!sfx;
  const curve = (v) => Math.pow(clamp(v ?? 0, 0, 1), 1.5);

  function build() {
    kit = createKit(ac, counters);
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.25;
    const master = kit.gain(0.8);
    master.connect(comp);
    comp.connect(ac.destination);

    const reverb = ac.createConvolver();
    reverb.buffer = kit.impulse();
    const revOut = kit.gain(0.6);
    reverb.connect(revOut); revOut.connect(master);

    const musicVol = kit.gain(0.4);
    const musicFilter = kit.filter('lowpass', 18000, 0.5);
    const musicWet = kit.gain(0.42);
    musicVol.connect(musicFilter); musicFilter.connect(master);
    musicVol.connect(musicWet); musicWet.connect(reverb);

    const world = kit.filter('lowpass', 18000, 0.6);
    world.connect(master);
    const sfxBus = kit.gain(0.9);
    sfxBus.connect(world);
    const sfxWet = kit.gain(0.15);
    sfxWet.connect(reverb);
    const ambBus = kit.gain(0.7);
    ambBus.connect(world);
    const uiBus = kit.gain(0.7);
    uiBus.connect(master);

    bus = { comp, master, reverb, revOut, musicVol, musicFilter, musicWet, world, sfxBus, sfxWet, ambBus, uiBus };
    music = createGamelan(kit, { dry: musicVol }, counters);
    sfx = createSfx(kit, { sfx: sfxBus, ui: uiBus, wet: sfxWet }, ctx, counters);
    amb = createAmbience(kit, ambBus, ctx);
    amb.setOverride(ambOverride);
    applyVolumes(true);
  }

  function applyVolumes(instant = false) {
    if (!bus) return;
    const s = state.settings;
    const now = ac.currentTime;
    const tc = instant ? 0.005 : 0.08;
    const sfxV = curve(s.sfxVolume);
    bus.master.gain.setTargetAtTime(curve(s.masterVolume), now, tc);
    musicLevel = curve(s.musicVolume) * 2.4;
    bus.musicVol.gain.setTargetAtTime(musicLevel * duck, now, tc);
    bus.sfxBus.gain.setTargetAtTime(sfxV, now, tc);
    bus.sfxWet.gain.setTargetAtTime(0.15 * sfxV, now, tc);
    bus.ambBus.gain.setTargetAtTime(sfxV * 0.85, now, tc);
    bus.uiBus.gain.setTargetAtTime(sfxV * 0.75, now, tc);
  }
  function autoMood() {
    const m = state.mode;
    if (m === 'loading') return 'silent';
    if (m === 'title' || m === 'intro') return 'title';
    if (m === 'finale' || creditsOpen) return 'finale';
    const base = state.progress?.finished ? 'dawn' : 'explore';
    if (m === 'cinematic') return music.mood === 'silent' ? base : music.mood;
    return danger > 0 && !state.progress?.finished ? 'danger' : base;
  }

  function nearestGhost() {
    const sp = ctx.spirits;
    if (!sp) return Infinity;
    if (typeof sp.nearest === 'number') return sp.nearest;
    if (sp.nearest && Number.isFinite(sp.nearest.distance)) return sp.nearest.distance;
    const p = ctx.player?.position;
    if (!p || !Array.isArray(sp.ghosts)) return Infinity;
    let best = Infinity;
    for (const g of sp.ghosts) {
      const q = g?.pos || g?.position;
      if (!q || (g.alpha ?? 1) < 0.25 || /banish|dying|fade/.test(g.state || '')) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < best) best = d;
    }
    return best;
  }

  const api = {
    unlocked: false,
    get context() { return ac; },
    get mood() { return music?.mood ?? 'silent'; },

    unlock() {
      if (failed) return false;
      try {
        if (!ac) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) { failed = true; return false; }
          ac = new AC({ latencyHint: 'interactive' });
          build();
        }
        if (ac.state === 'suspended' && !document.hidden) ac.resume().catch(() => {});
        api.unlocked = true;
        return true;
      } catch (err) {
        failed = true;
        console.warn('[audio] WebAudio unavailable', err);
        return false;
      }
    },

    play(name, opts = {}) {
      if (!ready()) return false;
      if (name === 'gong') { music.strike(opts.volume ?? 1); return true; }
      if (name === 'blip' && !opts.auto) externalBlips = true;
      return sfx.play(name, opts);
    },

    setMusic(mood) {
      override = !mood || mood === 'auto' || mood === 'explore' ? null : mood;
    },

    setAmbience(levels) { ambOverride = levels || null; amb?.setOverride(ambOverride); },

    applyVolumes() { applyVolumes(false); },

    stats() {
      return {
        state: ac?.state ?? 'none', mood: music?.mood ?? 'silent', voices: counters.voices, nodesCreated: counters.nodes,
        danger: +danger.toFixed(2), fog: amb ? +amb.env.fog.toFixed(2) : 0, coast: amb ? +amb.env.coast.toFixed(2) : 0,
      };
    },

    update(dt) {
      if (!ready()) return;
      // Danger: ghosts close by (or a recent hit) switch the gamelan to its tense mood.
      dangerT -= dt;
      if (dangerT <= 0) {
        dangerT = 0.25;
        if (state.mode === 'play' && nearestGhost() < 20) danger = Math.max(danger, 5);
      }
      if (state.mode === 'play') danger = Math.max(0, danger - dt);

      const want = override || autoMood();
      if (want !== music.mood) music.setMood(want, { fade: want === 'danger' ? 1.6 : 3 });
      music.update();
      amb.update(dt);

      // Dialogue typing blips (until the dialogue module plays its own).
      const dlg = ctx.dialogue;
      if (!externalBlips && dlg?.speaking && state.mode === 'dialogue') {
        blipT -= dt;
        if (blipT <= 0) {
          blipT = 0.075 + Math.random() * 0.03;
          sfx.play('blip', { pitch: (VOICE_PITCH[dlg.npcId] ?? 1) * (0.94 + Math.random() * 0.12), volume: 0.8, auto: true });
        }
      }

      // Swim strokes while moving in the water.
      if (swimming && state.mode === 'play') {
        const v = ctx.player?.velocity;
        strokeT -= dt;
        if (strokeT <= 0 && v && Math.hypot(v.x, v.z) > 0.8) { strokeT = 0.85; sfx.play('swim', {}); }
      }

      paramT -= dt;
      if (paramT > 0) return;
      paramT = 0.1;
      const now = ac.currentTime;
      const mode = state.mode;
      // Kabut muffles the world gradually; only genuinely deep fog gets really dull.
      const fogK = smoothstep(0.55, 1.0, amb.env.fog || 0);
      const worldCut = mode === 'pause' ? 650 : mode === 'journal' ? 2200 : 18000 * Math.pow(0.14, fogK);
      const musicCut = mode === 'pause' ? 850 : mode === 'journal' ? 2600 : 18000;
      bus.world.frequency.setTargetAtTime(worldCut, now, 0.25);
      bus.musicFilter.frequency.setTargetAtTime(musicCut, now, 0.25);
      const d = mode === 'dialogue' ? 0.7 : mode === 'pause' ? 0.75 : 1;
      if (d !== duck) { duck = d; bus.musicVol.gain.setTargetAtTime(musicLevel * duck, now, 0.3); }
    },
  };

  // ---------------------------------------------------------------- event wiring
  const on = (name, fn) => events.on(name, (p) => {
    if (!ready()) return;
    try { fn(p || {}); } catch (err) { console.warn('[audio]', name, err); }
  });
  const play = (n, o) => sfx.play(n, o || {});

  on('player:step', (p) => play('step', { surface: p.surface, run: p.run }));
  on('player:jump', () => play('jump'));
  on('player:land', (p) => { if ((p.speed ?? 0) > 3) play('land', { speed: p.speed }); });
  on('player:glide', (p) => play('glide', { on: p.on !== false }));
  on('player:splash', (p) => play('splash', { strength: p.strength }));
  on('player:climb', () => play('climb'));
  on('player:flare', () => play('flare'));
  on('player:flareFail', () => play('flare-fail'));
  on('player:hurt', () => { play('hurt'); danger = Math.max(danger, 9); });
  on('player:faint', () => play('faint'));
  on('player:respawn', () => play('respawn'));
  on('kilau:collect', (p) => play('kilau', { volume: p.transient ? 0.7 : 1 }));
  on('flame:collect', (p) => play('flame', { flameId: p.flameId }));
  on('flame:place', (p) => play('place', { flameId: p.flameId }));
  on('checkpoint:ignite', () => play('ignite'));
  on('checkpoint:light', () => play('checkpoint'));
  on('checkpoint:rest', () => play('rest'));
  on('pelita:light', (p) => play('pelita', { correct: p.correct, count: p.count }));
  on('pelita:fail', () => play('pelita-fail'));
  on('candi:open', () => play('door', { seconds: 3 }));
  on('mind:think', (p) => play('think', { tier: p.tier }));
  on('credit:change', (p) => { if (p.delta) play('credit', { delta: p.delta }); });
  on('clue:add', () => play('clue'));
  on('spirit:banish', (p) => play('banish', { x: p.x, y: p.y, z: p.z }));
  on('dialogue:open', () => play('chime', { deg: 2, oct: 2 }));
  on('intro:title', () => music.strike(0.9));
  on('intro:beat', (p) => {
    if (p.name === 'ignite') play('ignite');
    else if (p.name === 'bump') play('land', { speed: 7 });
    else if (p.name === 'hop') play('jump');
  });
  on('finale:beat', (p) => {
    if (p.name === 'ignite') { music.strike(1); play('ignite'); }
    else if (p.name === 'beam') play('flare');
    else if (p.name === 'dawn') play('rest');
  });
  on('settings:change', (p) => { if (/Volume$/.test(p.key || '')) applyVolumes(false); });

  // These must track state even before audio is unlocked.
  events.on('player:swim', (p) => { swimming = !!p?.on; if (ready() && p?.on) play('splash', { strength: 0.5 }); });
  events.on('mode:change', () => { override = null; });
  events.on('credits:show', () => { creditsOpen = true; });
  events.on('credits:close', () => { creditsOpen = false; });
  events.on('game:quit', () => { creditsOpen = false; danger = 0; });

  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend().catch(() => {});
    else if (api.unlocked) ac.resume().catch(() => {});
  });

  return api;
}
