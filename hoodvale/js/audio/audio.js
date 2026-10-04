// Hoodvale audio: pure WebAudio synthesis (no samples, no fetch). Procedural medieval/folk music
// per zone with a combat layer, world ambience by zone and time of day, and event-driven SFX for
// every system (footsteps by surface, skilling, combat, spells, creatures, chain, UI, fanfares).
// Owner: audio builder. API (DESIGN.md §5):
//
//   unlock()                 create/resume the AudioContext (also done on the first pointer/key)
//   play(name, opts) -> bool one-shot SFX; opts {x, z, volume, pitch, delay, ...} (see sfx-*.js)
//   setMusic(key | null)     force a music key (pieces.js); null = automatic (zone/mode/combat)
//   setAmbience(levels|null) override ambience levels {wind, waves, water, crickets, swamp, town,
//                            crystal, cave, fire, leaves, birds, gulls, owls, frogs, drips}
//   applyVolumes()           re-read state.settings (masterVolume, musicVolume, sfxVolume)
//   stats()                  debug snapshot; update(dt) per frame (main.js calls it)
//
// Graph: piece buses -> musicVol -> duck -> musicFilter -> master; musicVol -> musicWet -> reverb
//        sfx voices -> sfxBus -> master (+ sfxWet -> reverb); ambience -> ambBus -> ambFilter ->
//        master; UI voices -> uiBus -> master; master -> limiter -> destination.
//
// Optional events other modules may emit (all also playable directly via ctx.audio.play):
//   sfx {name, ...opts}, skill:act {skill, x?, z?}, combat:attack {source, target, style?, spell?},
//   magic:cast {spell, target?}, player:eat / player:drink, thieving:fail, resource:deplete {entity},
//   oracle:ask {tier}, dialogue:type {npcId}, door {x, z}.

import { createKit, clamp, rand } from './kit.js';
import { createInstruments } from './instruments.js';
import { createMusic } from './music.js';
import { createSfx } from './sfx.js';
import { createAmbience } from './ambience.js';
import { PIECES } from './pieces.js';
import { ZONES } from '../data/zones.js';
import { SKILL_BY_ID } from '../data/skills.js';
import { ITEMS } from '../data/items.js';
import { T_BRIDGE, T_INDOOR, T_ROAD } from '../world/mapgen.js';

const DUNGEON_ZONES = new Set(['warrens', 'vault', 'lair']);

// Creature voice by monster id (falls back on model hints).
const VOICES = {
  chicken: ['chicken', {}, 0.08], rat: ['rat', {}, 0.02], cow: ['cow', {}, 0.025],
  goblin: ['goblin', { size: 1 }, 0.04], goblin_brute: ['goblin', { size: 1.5 }, 0.03], goblin_warchief: ['goblin', { size: 2 }, 0.03],
  boar: ['boar', {}, 0.03], wolf: ['wolf', {}, 0.02], bandit: ['human', { f0: 145 }, 0], giant_spider: ['spider', {}, 0.02],
  bear: ['bear', {}, 0.015], vault_knight: ['knight', {}, 0], skeleton: ['skeleton', {}, 0.03], bog_lurker: ['lurker', {}, 0.03],
  shard_wisp: ['wisp', {}, 0.06], highland_troll: ['troll', {}, 0.02], stone_golem: ['golem', {}, 0.012], ash_imp: ['imp', {}, 0.03],
  ashen_drake: ['drake', {}, 0.015], sheriff_vane: ['sheriff', {}, 0], ashen_wyrm: ['wyrm', {}, 0.02],
};
function voiceFor(e) {
  const id = e?.defId || e?.def?.id;
  if (VOICES[id]) return VOICES[id];
  const m = e?.def?.model || {};
  const hint = `${id || ''} ${m.body || ''} ${m.rig || ''}`;
  for (const [re, v] of [[/bird|chicken/, 'chicken'], [/rat|rodent/, 'rat'], [/cow/, 'cow'], [/goblin/, 'goblin'], [/boar|pig/, 'boar'], [/wolf|dog/, 'wolf'], [/spider/, 'spider'],
    [/bear/, 'bear'], [/skeleton/, 'skeleton'], [/slime|lurker/, 'lurker'], [/wisp/, 'wisp'], [/troll/, 'troll'], [/golem/, 'golem'], [/imp/, 'imp'], [/wyrm|dragon/, 'wyrm'], [/drake/, 'drake'], [/human|biped/, 'human']]) {
    if (re.test(hint)) return [v, {}, 0.02];
  }
  return null;
}

// Element of a spell id or monster (for cast/impact sounds).
function elementOf(spell, monster) {
  const s = String(spell?.id || spell || '');
  for (const el of ['spark', 'tide', 'stone', 'ember', 'thought', 'insight']) if (s.startsWith(el)) return el;
  if (/_path$|teleport/.test(s)) return 'teleport';
  const id = monster?.defId || '';
  if (/wisp/.test(id)) return 'thought';
  if (/imp|drake|wyrm/.test(id)) return 'ember';
  return 'spark';
}

// Sounds played on ticks while an action is in progress (option -> loop).
const ACTION_LOOPS = {
  'Chop down': { name: 'chop', every: 2 },
  Mine: { name: 'mine', every: 2 },
  Net: { start: 'fish-net', name: 'fish-splash', every: 6, chance: 0.5, opts: { size: 0.5, volume: 0.6 } },
  Bait: { start: 'fish-cast', name: 'fish-plop', every: 5, chance: 0.5 },
  Lure: { start: 'fish-cast', name: 'fish-reel', every: 5, chance: 0.4 },
  Cage: { start: 'cage', name: 'fish-splash', every: 7, chance: 0.4, opts: { size: 0.5, volume: 0.6 } },
  Harpoon: { start: 'harpoon', name: 'harpoon', every: 5, chance: 0.5 },
  Smelt: { start: 'smelt', name: 'smelt', every: 4 },
  Smith: { name: 'anvil', every: 2 },
  Cook: { start: 'cook', name: 'cook', every: 3 },
  Spin: { start: 'spin', name: 'spin', every: 3 },
  Inscribe: { start: 'inscribe', name: 'inscribe', every: 4 },
  Pick: { start: 'pick' }, 'Take-egg': { start: 'pick' }, 'Draw-water': { start: 'bucket' }, 'Steal-from': { start: 'pick' },
  Consult: { start: 'oracle-hum' }, Milk: { start: 'milk' }, Light: { name: 'fire-strike', every: 2 },
};
// Item-on-thing loops ("Use tinderbox on logs" etc.).
const USE_LOOPS = {
  tinderbox: { name: 'fire-strike', every: 2 }, knife: { name: 'fletch', every: 2 }, needle: { name: 'craft', every: 3 },
  chisel: { name: 'gem-cut', every: 3 }, hammer: { name: 'anvil', every: 2 },
};
// Success sound per skill on XP gain (actions with their own loop just get the subtle XP tick).
const XP_SOUNDS = { woodcutting: 'log', mining: 'ore', fishing: 'fish-catch', firemaking: 'fire-light', thieving: 'thieve', crafting: 'craft' };
const LOOP_NAMES = new Set(['chop', 'mine', 'fish-net', 'fish-splash', 'fish-cast', 'fish-plop', 'fish-reel', 'cage', 'harpoon', 'smelt', 'anvil', 'cook', 'spin', 'inscribe', 'fire-strike', 'fletch', 'craft', 'gem-cut', 'bow', 'step', 'log', 'ore', 'fish-catch', 'fire-light', 'thieve', 'swing', 'hit', 'block', 'miss', 'arrow-hit', 'spell-hit', 'blip', 'ui-click', 'ui-tab', 'ui-open', 'ui-close']);

export function createAudio(ctx) {
  const { events, state } = ctx;
  const counters = { nodes: 0, voices: 0 };
  let ac = null, kit = null, inst = null, bus = null, music = null, sfx = null, amb = null;
  let failed = false;
  let musicOverride = null, ambOverride = null;
  let musicLevel = 0.3, duckLevel = 1, duckUntil = 0, dialogDuck = 1, dialogUntil = 0;
  const ext = {}; // name -> last time another module played it directly (suppresses our heuristics)

  // Music selection state.
  let wantKey = null, candidate = null, candidateSince = 0, forceMusic = true, wildsSince = 0, lastZone = null, jumped = false;
  let combatLevel = 0, lastPlayerCombat = -99, lastBossSeen = -99;
  // Footsteps / actions.
  let lastTile = null, suppressMoveUntil = 0;
  let loop = { cur: null, n: 0 };
  const monsterVoiceAt = new Map();
  const deathHandled = new Map();
  let idleT = 0, paramT = 0;
  let lastSpell = null;
  let lastSurface = 'grass';
  let lastDeath = -99;

  const ready = () => !!ac && ac.state === 'running' && !!sfx;
  const now = () => (ac ? ac.currentTime : 0);
  const curve = (v) => Math.pow(clamp(Number.isFinite(v) ? v : 0, 0, 1), 1.6);

  function build() {
    kit = createKit(ac, counters);
    inst = createInstruments(kit);
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -5; limiter.knee.value = 4; limiter.ratio.value = 16; limiter.attack.value = 0.002; limiter.release.value = 0.18;
    const master = kit.gain(0.9);
    master.connect(limiter);
    limiter.connect(ac.destination);
    const reverb = ac.createConvolver();
    reverb.buffer = kit.impulse(2.6, 2.8);
    const revOut = kit.gain(0.55);
    reverb.connect(revOut); revOut.connect(master);

    const musicVol = kit.gain(0.8);
    const duck = kit.gain(1);
    const musicFilter = kit.filter('lowpass', 18000, 0.5);
    const musicWet = kit.gain(0.32);
    musicVol.connect(duck); duck.connect(musicFilter); musicFilter.connect(master);
    duck.connect(musicWet); musicWet.connect(reverb);

    const sfxBus = kit.gain(0.8);
    sfxBus.connect(master);
    const sfxWet = kit.gain(0.15);
    sfxWet.connect(reverb);
    const ambBus = kit.gain(0.6);
    const ambFilter = kit.filter('lowpass', 18000, 0.6);
    ambBus.connect(ambFilter); ambFilter.connect(master);
    const uiBus = kit.gain(0.7);
    uiBus.connect(master);

    bus = { limiter, master, reverb, revOut, musicVol, duck, musicFilter, musicWet, sfxBus, sfxWet, ambBus, ambFilter, uiBus };
    music = createMusic(kit, inst, { dry: musicVol }, counters);
    sfx = createSfx(kit, inst, { sfx: sfxBus, ui: uiBus, amb: ambBus, wet: sfxWet }, ctx, counters);
    amb = createAmbience(kit, ambBus, sfx, ctx);
    amb.setOverride(ambOverride);
    applyVolumes(true);
  }

  function applyVolumes(instant = false) {
    if (!bus) return;
    const s = state.settings || {};
    const t = now();
    const tc = instant ? 0.005 : 0.08;
    const sfxV = curve(s.sfxVolume ?? 0.8);
    const muted = s.muted || s.mute;
    bus.master.gain.setTargetAtTime(muted ? 0 : curve(s.masterVolume ?? 0.9) * 1.05, t, tc);
    musicLevel = curve(s.musicVolume ?? 0.5) * 2.6;
    bus.musicVol.gain.setTargetAtTime(musicLevel, t, tc);
    bus.sfxBus.gain.setTargetAtTime(sfxV, t, tc);
    bus.ambBus.gain.setTargetAtTime(curve(s.ambienceVolume ?? s.sfxVolume ?? 0.8) * 0.85, t, tc);
    bus.uiBus.gain.setTargetAtTime(curve(s.uiVolume ?? s.sfxVolume ?? 0.8) * 0.8, t, tc);
  }

  // Duck the music under fanfares/jingles.
  function duck(level, seconds) {
    if (!bus) return;
    const t = now();
    duckLevel = Math.min(duckLevel, level);
    duckUntil = Math.max(duckUntil, t + seconds);
    bus.duck.gain.setTargetAtTime(duckLevel * dialogDuck, t, 0.08);
  }

  // ---------------------------------------------------------------- helpers
  const P = () => ctx.player;
  const isPlayer = (e) => !!e && (e === P()?.entity || e.kind === 'player');
  const posOf = (e) => {
    if (!e) return null;
    if (e.pos && Number.isFinite(e.pos.x)) return { x: e.pos.x, z: e.pos.z };
    if (Number.isFinite(e.x)) return { x: e.x + (e.w || 1) / 2, z: e.z + (e.d || 1) / 2 };
    return null;
  };
  const recent = []; // last sounds played (QA / stats)
  function play(name, opts = {}) {
    if (!ready()) return 0;
    const end = sfx.play(name, opts);
    if (end) { recent.push(name); if (recent.length > 80) recent.shift(); }
    return end;
  }
  function at(e, opts = {}) {
    const p = posOf(e);
    return p && !isPlayer(e) ? { ...opts, x: p.x, z: p.z } : opts;
  }

  function surfaceAt(tx, tz) {
    const map = ctx.map;
    if (!map) return 'grass';
    const cx = tx + 0.5, cz = tz + 0.5;
    const region = map.regionAt(cx, cz);
    if (region.id !== 'overworld') return region.id === 'vault' ? 'stone' : 'cave';
    const f = map.tileFlags(tx, tz);
    const zone = map.zoneAt(cx, cz);
    if (f & T_BRIDGE) return 'wood';
    if (f & T_INDOOR) return zone === 'gildmoor' || zone === 'oracle' ? 'stone' : 'wood';
    const h = map.heightAt(cx, cz);
    if (h < 0.08) return 'water';
    if (f & T_ROAD) return zone === 'gildmoor' || zone === 'oracle' ? 'stone' : zone === 'highlands' ? 'gravel' : 'dirt';
    switch (zone) {
      case 'docks': return h < 1.2 || cz > 286 ? 'sand' : 'grass';
      case 'mistfen': return h < 0.95 ? 'mud' : 'grass';
      case 'highlands': return 'gravel';
      case 'oracle': return h > 10 ? 'crystal' : 'gravel';
      case 'copperhollow': return 'dirt';
      case 'hoodwood': return 'leaves';
      default: return cz > 288 && h < 1.4 ? 'sand' : 'grass';
    }
  }

  function voice(e, mood, extra = {}) {
    const v = voiceFor(e);
    if (!v) return;
    const key = (e.uid ?? e.defId) + ':' + mood;
    const t = now();
    if (mood !== 'death' && t - (monsterVoiceAt.get(key) ?? -9) < (mood === 'idle' ? 4 : 2.5)) return;
    monsterVoiceAt.set(key, t);
    if (monsterVoiceAt.size > 400) monsterVoiceAt.clear();
    const big = e.def?.boss || (e.def?.size || 1) > 1;
    play(v[0], at(e, { mood, ...v[1], range: big ? 32 : 22, ...extra }));
  }

  // ---------------------------------------------------------------- music selection
  function bossActive() {
    const tgt = ctx.combat?.target;
    if (tgt?.def?.boss && tgt.alive !== false && (ctx.combat?.inCombat ?? true)) return true;
    return now() - lastBossSeen < 6;
  }
  function autoMusic() {
    const mode = state.mode;
    if (mode === 'loading') return null;
    if (mode === 'login' || mode === 'create') return 'login';
    if (bossActive()) return 'boss';
    const p = P()?.pos;
    const sp = state.save?.pos;
    const x = p && (p.x || p.z) ? p.x : sp?.x, z = p && (p.x || p.z) ? p.z : sp?.z;
    if (!Number.isFinite(x) || !ctx.map) return wantKey || 'village';
    const zone = ctx.map.zoneAt(x, z);
    if (zone !== lastZone) { lastZone = zone; if (zone === 'wilds') wildsSince = now(); }
    if (zone !== 'wilds') jumped = false;
    if (DUNGEON_ZONES.has(zone)) return 'dungeon';
    const key = ZONES[zone]?.music;
    if (key && PIECES[key]) return key;
    // Wilderness: keep the last zone's music for a while, then the travelling piece.
    if (!jumped && wantKey && wantKey !== 'login' && wantKey !== 'boss' && wantKey !== 'dungeon' && wantKey !== 'wilds' && now() - wildsSince < 40) return wantKey;
    return 'wilds';
  }
  function updateMusic() {
    const target = musicOverride || autoMusic();
    const t = now();
    if (target !== candidate) { candidate = target; candidateSince = t; }
    const hold = forceMusic || target === 'boss' || state.mode !== 'play' ? 0 : 2.5;
    if (candidate !== wantKey && t - candidateSince >= hold) {
      const fade = target === 'boss' ? 1.5 : wantKey === 'login' ? 2.5 : 3.5;
      wantKey = candidate;
      music.setPiece(wantKey, { fade });
    }
    forceMusic = false;
    // Combat layer.
    const inCombat = state.mode === 'play' && (ctx.combat?.inCombat || t - lastPlayerCombat < 4);
    const lvl = inCombat ? 1 : 0;
    if (lvl !== combatLevel) { combatLevel = lvl; music.setCombat(lvl); }
  }

  // ---------------------------------------------------------------- per-tick action loops
  function actionTick() {
    if (!ready() || state.mode !== 'play') return;
    const c = ctx.actions?.current;
    if (!c || !c.started) { loop.cur = null; return; }
    if (loop.cur !== c) { loop = { cur: c, n: 0, startPlayed: false }; }
    const spec = resolveLoop(c);
    if (!spec) return;
    const e = c.entity;
    const o = at(e, { volume: 0.9, ...(spec.opts || {}) });
    const t = now();
    if (!loop.startPlayed) {
      loop.startPlayed = true;
      if (spec.start && t - (ext[spec.start] ?? -99) > 15) play(spec.start, o);
    }
    loop.n++;
    if (spec.name && spec.every && loop.n % spec.every === 1 % spec.every && t - (ext[spec.name] ?? -99) > 15) {
      if (spec.chance == null || Math.random() < spec.chance) {
        play(spec.name, o);
        if (spec.then) play(spec.then, { ...o, delay: 0.35, volume: 0.7 });
      }
    }
  }
  function resolveLoop(c) {
    if (c.option !== 'Use') return ACTION_LOOPS[c.option] || null;
    const id = c.entity?.defId || c.entity?.def?.id || '';
    if (/fire|range/.test(id)) return ACTION_LOOPS.Cook;
    if (/furnace/.test(id)) return ACTION_LOOPS.Smelt;
    if (/anvil/.test(id)) return ACTION_LOOPS.Smith;
    if (/well|fountain/.test(id)) return ACTION_LOOPS['Draw-water'];
    if (/altar/.test(id)) return ACTION_LOOPS.Inscribe;
    if (/cow/.test(id)) return ACTION_LOOPS.Milk;
    const item = c.item;
    const tid = c.target?.id;
    return USE_LOOPS[item] || USE_LOOPS[tid] || null;
  }

  // Ambient creature voices from monsters near the player.
  function idleVoices(dt) {
    idleT -= dt;
    if (idleT > 0 || state.mode !== 'play') return;
    idleT = 1.2;
    const p = P()?.pos, es = ctx.entities;
    if (!p || !es?.near) return;
    const night = ctx.sky?.hour != null && (ctx.sky.hour < 5.5 || ctx.sky.hour > 20.5);
    for (const e of es.near(Math.floor(p.x), Math.floor(p.z), 16)) {
      if (e.kind !== 'monster' || e.alive === false || e.hidden || e.dying) continue;
      const v = voiceFor(e);
      if (!v || !v[2]) continue;
      if (Math.random() < v[2] * 1.2 * (e.ai?.mode === 'combat' ? 0.3 : 1)) {
        voice(e, 'idle', v[0] === 'wolf' && night && Math.random() < 0.4 ? { howl: true } : {});
        break;
      }
    }
  }

  // Music selection + bar scheduling, timed on the audio clock (frames may be slow or clamped).
  let lastMusicCheck = -9, lastMusicTick = -9;
  function tickMusic() {
    const t = now();
    lastMusicTick = t;
    if (t - lastMusicCheck >= 0.4 || forceMusic) {
      lastMusicCheck = t;
      try { updateMusic(); } catch (err) { console.warn('[audio] music', err); }
    }
    music.update();
  }
  // Fallback when frames stall (heavy load): keep the score scheduled from a timer.
  setInterval(() => { if (ready() && now() - lastMusicTick > 0.25) { try { tickMusic(); } catch { /* ignore */ } } }, 200);

  // ---------------------------------------------------------------- API
  const api = {
    unlocked: false,
    get context() { return ac; },
    get music() { return music; },
    get keys() { return Object.keys(PIECES); },
    get names() { return sfx ? sfx.names : []; },

    unlock() {
      if (failed) return false;
      try {
        if (!ac) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) { failed = true; return false; }
          ac = new AC({ latencyHint: 'interactive' });
          build();
          forceMusic = true;
          // iOS: a silent buffer started inside the gesture fully unlocks output.
          try { const b = ac.createBuffer(1, 1, ac.sampleRate); const s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); } catch { /* ignore */ }
        }
        if (ac.state !== 'running' && ac.state !== 'closed' && !document.hidden) ac.resume().catch(() => {});
        api.unlocked = true;
        return true;
      } catch (err) {
        failed = true;
        console.warn('[audio] WebAudio unavailable', err);
        return false;
      }
    },

    // Called by other modules: marks the sound as externally driven (our heuristics stand down).
    play(name, opts = {}) {
      if (!ready()) return false;
      if (LOOP_NAMES.has(name)) ext[name] = now();
      if (name === 'level-up') name = 'level-' + (SKILL_BY_ID[opts.skill]?.kind || 'gathering');
      if (name === 'oracle-answer') name = 'oracle-' + (opts.tier || 'lamp');
      const end = play(name, opts);
      if (end && /^(level-|quest-complete|quest-start|death$)/.test(name)) duck(0.3, end - now());
      return end > 0;
    },

    setMusic(key) {
      musicOverride = key && key !== 'auto' && PIECES[key] ? key : null;
      forceMusic = true;
    },

    setAmbience(levels) { ambOverride = levels || null; amb?.setOverride(ambOverride); },

    applyVolumes() { applyVolumes(false); },

    stats() {
      return {
        state: ac?.state ?? 'none', unlocked: api.unlocked, music: music?.stats() ?? null, voices: counters.voices, nodesCreated: counters.nodes,
        plucks: kit?.pluckCount ?? 0, surface: lastSurface, combat: combatLevel, zone: amb?.env.zone ?? null, recent: recent.slice(-40),
        amb: amb ? { coast: +amb.env.coast.toFixed(2), water: +amb.env.water.toFixed(2), wind: +amb.env.wind.toFixed(2), night: +amb.env.night.toFixed(2), indoor: amb.env.indoor, dungeon: amb.env.dungeon, fire: +amb.env.fire.toFixed(2) } : null,
      };
    },

    update(dt) {
      if (!ready()) return;
      const t = now();
      sfx.updateListener();
      tickMusic();
      amb.update(dt);
      idleVoices(dt);
      api.frameExtras?.(dt);
      paramT -= dt;
      if (paramT > 0) return;
      paramT = 0.1;
      // Release ducks.
      if (duckLevel < 1 && t > duckUntil) { duckLevel = 1; bus.duck.gain.setTargetAtTime(dialogDuck, t, 0.6); }
      if (dialogDuck < 1 && t > dialogUntil) { dialogDuck = 1; bus.duck.gain.setTargetAtTime(duckLevel, t, 0.6); }
      // Mode colouring: muffle music while dead, muffle ambience indoors.
      const mode = state.mode;
      bus.musicFilter.frequency.setTargetAtTime(mode === 'dead' ? 700 : 18000, t, 0.4);
      const indoor = amb.env.indoor && !amb.env.dungeon;
      bus.ambFilter.frequency.setTargetAtTime(indoor ? 1100 : 18000, t, 0.3);
      bus.sfxWet.gain.setTargetAtTime(amb.env.dungeon ? 0.42 : indoor ? 0.22 : 0.13, t, 0.4);
    },
  };

  // ---------------------------------------------------------------- event wiring
  const on = (name, fn) => events.on(name, (p) => {
    if (!ready()) return;
    try { fn(p || {}); } catch (err) { console.warn('[audio]', name, err); }
  });
  let lastTeleportSfx = -99;
  const teleportSfx = (name = 'teleport', o) => { if (now() - lastTeleportSfx < 2.5) return; lastTeleportSfx = now(); play(name, o); };

  // Footsteps, synced to the 0.6 s movement tick (walk: 2 steps per tile, run: 3 per two tiles).
  on('player:move', ({ x, z, running }) => {
    const prev = lastTile;
    lastTile = { x, z };
    if (!prev || now() < suppressMoveUntil || state.mode !== 'play') return;
    const dist = Math.max(Math.abs(x - prev.x), Math.abs(z - prev.z));
    if (dist > 3 || dist === 0) return;
    const run = running ?? dist >= 2;
    const surface = surfaceAt(x, z);
    lastSurface = surface;
    if (now() - (ext.step ?? -99) < 15) return;
    const n = run ? 3 : 2;
    const wet = surface === 'cave' ? 1.6 : surface === 'stone' ? 0.8 : 0.4;
    for (let i = 0; i < n; i++) play('step', { surface, run, delay: 0.02 + (i * 0.6) / n, volume: run ? 0.75 : 0.6, wet });
  });
  events.on('player:teleport', ({ x, z, region }) => {
    const prev = lastTile;
    lastTile = { x, z };
    forceMusic = true;
    jumped = true; // a teleport into the wilds goes straight to the travelling piece
    if (!ready() || now() < suppressMoveUntil || !prev) return;
    if (Math.max(Math.abs(x - prev.x), Math.abs(z - prev.z)) < 4) return;
    if (state.mode === 'dead' || now() - lastDeath < 20) { lastDeath = -99; teleportSfx('respawn'); return; }
    if (state.mode !== 'play') return;
    const fromRegion = ctx.map?.regionAt(prev.x + 0.5, prev.z + 0.5).id;
    teleportSfx(fromRegion && region && fromRegion !== region ? 'portal' : 'teleport');
  });
  const spawned = () => { suppressMoveUntil = now() + 1.5; forceMusic = true; };
  events.on('game:start', spawned);
  events.on('save:loaded', spawned);
  events.on('mode:change', () => { forceMusic = true; });
  events.on('region:enter', () => { forceMusic = true; });
  let lastSfxVol = state.settings?.sfxVolume;
  events.on('settings:change', () => {
    applyVolumes(false);
    const v = state.settings?.sfxVolume;
    if (ready() && v !== lastSfxVol) play('ui-tab', { delay: 0.05 }); // preview the new effects level
    lastSfxVol = v;
  });
  on('zone:enter', ({ first, minor }) => {
    forceMusic = true;
    if (first && !minor && state.mode === 'play') { const end = play('discover', { delay: 0.2 }); if (end) duck(0.5, end - now()); }
  });
  on('player:enter-portal', ({ def }) => {
    const id = String(def || '');
    teleportSfx(/stairs/.test(id) ? 'stairs' : 'portal');
    if (/gate|lair/.test(id)) play('door', { volume: 0.8 });
  });
  on('spell:teleport', () => teleportSfx('teleport'));
  on('player:respawn', () => teleportSfx('respawn'));

  // Skilling: per-tick loops while an action runs, success / failure sounds from the game.
  on('tick', () => actionTick());
  on('action:start', () => { loop = { cur: null, n: 0 }; });
  let productSeen = false;
  on('xp', ({ skill, amount }) => {
    if (!(amount > 0) || state.mode !== 'play') return;
    play('xp');
    // Fallback for builds without skill:product events.
    const s = XP_SOUNDS[skill];
    if (!productSeen && s && now() - (ext[s] ?? -99) > 15) play(s, at(ctx.actions?.current?.entity, { volume: 0.85 }));
  });
  on('skill:product', ({ skill, item = '', source = '', entity }) => {
    productSeen = true;
    const id = String(item), src = String(source);
    const o = at(entity, { volume: 0.85 });
    let name = null;
    switch (skill) {
      case 'woodcutting': name = 'log'; break;
      case 'mining': name = /uncut|sapphire|emerald|ruby|diamond|gem|pearl/.test(id) ? 'loot-rare' : 'ore'; break;
      case 'fishing': name = 'fish-catch'; break;
      case 'cooking': case 'smithing': case 'arcana': name = 'pickup'; break;
      case 'fletching': name = /bow$/.test(id) && !/unstrung|_u$/.test(id) ? 'string' : 'fletch'; break;
      case 'crafting': name = /^cut_|sapphire|emerald|ruby|diamond|gem/.test(id) && !/uncut/.test(id) ? 'gem-cut' : /bowstring|string/.test(id) ? 'spin' : 'craft'; break;
      case 'thieving': case 'firemaking': name = null; break;
      default:
        name = /well|bucket|water/.test(src + id) ? 'bucket' : /cow|milk/.test(src + id) ? 'milk' : /flour/.test(id) ? 'grain' : 'pick';
    }
    if (name && now() - (ext[name] ?? -99) > 15) play(name, o);
    if (skill === 'arcana') play('oracle-spark', { volume: 0.5 });
  });
  on('skill:fail', ({ reason }) => {
    if (reason === 'burnt') play('burn');
    else if (reason === 'impure') play('fire-out', { volume: 1.2 });
    else play('ui-error', { volume: 0.7 });
  });
  on('fire:lit', ({ x, z }) => play('fire-light', Number.isFinite(x) ? { x: x + 0.5, z: z + 0.5 } : {}));
  on('fire:out', ({ entity }) => play('fire-out', at(entity, { volume: 0.7 })));
  on('object:deplete', ({ entity }) => {
    const id = entity?.defId || entity?.def?.id || '';
    const skill = entity?.def?.skill;
    if (skill === 'woodcutting' || /tree/.test(id)) play('tree-fall', at(entity));
    else if (skill === 'mining' || /rock|ore/.test(id)) play('rock-deplete', at(entity, { volume: 0.7 }));
  });
  on('resource:deplete', (p) => events.emit('object:deplete', p));
  on('fishing:move', ({ entity }) => play('fish-splash', at(entity, { volume: 0.35, size: 0.6 })));
  on('thieving:success', ({ target }) => play('thieve', at(target)));
  on('thieving:fail', ({ target, kind }) => { play('stun'); if (kind === 'pickpocket' && target) play('human', at(target, { mood: 'attack', f0: 150 })); });
  on('player:stun', () => play('stun'));
  on('pouch:open', ({ count = 1 }) => play('coins', { n: Math.min(12, 2 + count * 2) }));
  on('mill:fill', () => play('grain'));
  on('tan', () => play('craft'));
  on('archery:target', ({ entity, hit }) => { if (hit) play('arrow-hit', at(entity, { delay: 0.05 })); });
  on('chest:open', ({ entity }) => play('chest', at(entity)));
  on('sign:read', () => play('ui-open'));
  on('item:read', () => play('ui-open'));
  on('food:eat', ({ item }) => play(/potion|ale|wine|milk|water|brew|tea|cider|mead/.test(String(item)) ? 'drink' : 'eat'));
  on('player:eat', () => play('eat'));
  on('player:drink', () => play('drink'));
  on('item:drop', () => play('item-drop'));
  on('item:select', ({ index }) => { if (index >= 0) play('ui-menu'); });
  const METAL = /bronze|iron|steel|cobalt|starmetal|mail|plate|helm|sword|shield|dagger|axe|mace|scimitar|chain|wyrm/;
  on('item:equip', ({ id, slot }) => play('equip', { metal: METAL.test(String(id)) || slot === 'weapon' }));
  on('item:unequip', ({ id }) => play('equip', { metal: METAL.test(String(id)), volume: 0.7 }));

  on('level:up', ({ skill, level }) => {
    const kind = SKILL_BY_ID[skill]?.kind || 'gathering';
    const milestone = level >= 99 || level % 10 === 0;
    const end = play('level-' + kind, { milestone, delay: 0.05 });
    if (end) duck(0.25, end - now() + 0.3);
  });
  on('quest:start', () => { const end = play('quest-start'); if (end) duck(0.4, end - now()); });
  on('quest:update', () => play('quest-update'));
  on('quest:complete', () => { const end = play('quest-complete', { delay: 0.1 }); if (end) duck(0.2, end - now() + 0.4); });
  on('redistribution', () => { play('coins', { n: 16 }); play('chain', { delta: 1, delay: 0.3 }); });

  // Dialogue: open/close, and voice blips while the UI's typewriter is running.
  let talk = null; // { pitch, kind, until }
  on('dialogue:open', ({ npcId }) => {
    play('dialogue-open');
    if (/oracle|orbio/.test(String(npcId || ''))) play('oracle-hum', { volume: 0.8 });
    dialogDuck = 0.75; dialogUntil = now() + 25;
    bus.duck.gain.setTargetAtTime(duckLevel * dialogDuck, now(), 0.3);
  });
  on('dialogue:close', () => { play('dialogue-close'); dialogUntil = 0; talk = null; });
  on('ui:dialogue', ({ speaker }) => {
    const kind = speaker?.kind || 'npc';
    if (kind === 'narr') { talk = null; return; }
    const key = String(speaker?.npcId || speaker?.name || 'x');
    const h = key.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const pitch = kind === 'player' ? (state.save?.look?.body === 'female' ? 1.25 : 0.85) : kind === 'oracle' ? 1 : 0.7 + (h % 11) * 0.06;
    talk = { pitch, kind, next: 0, until: now() + 12 };
    dialogUntil = Math.max(dialogUntil, now() + 25);
  });
  on('dialogue:type', ({ npcId, pitch }) => {
    const h = String(npcId || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    play('blip', { pitch: pitch ?? 0.8 + (h % 9) * 0.07 });
  });
  function dialogueBlips() {
    if (!talk || now() > talk.until || now() - (ext.blip ?? -99) < 15) return;
    if (now() < talk.next) return;
    const typing = document.querySelector('.u-dlg.typing, .hv-dialogue.typing');
    if (!typing) { talk = null; return; }
    talk.next = now() + rand(0.07, 0.1);
    play('blip', { pitch: talk.pitch * rand(0.93, 1.08), kind: talk.kind, volume: 0.7 });
  }

  on('shop:open', () => play('shop-bell'));
  on('bank:open', () => play('bank'));
  on('exchange:open', () => play('exchange'));
  let bankCount = null;
  on('bank:change', () => {
    const n = ctx.bank?.items?.reduce?.((s, it) => s + (it?.qty || 0), 0) ?? 0;
    if (bankCount !== null && n !== bankCount) play(n > bankCount ? 'deposit' : 'withdraw');
    bankCount = n;
  });

  // Chain + wallet.
  on('chain:tx', ({ tx }) => play('chain', { delta: tx?.kind === 'debit' ? -1 : 1 }));
  on('wallet:change', ({ delta }) => { if (delta) play('coins', { delta, delay: 0.04 }); });
  on('wallet:confirm', () => play('chain-confirm'));

  // Combat.
  const recentAttack = new Map();
  const markAttack = (src) => { if (src?.uid != null) recentAttack.set(src.uid, now()); };
  const launchedRecently = (src, s = 2.5) => now() - (recentAttack.get(src?.uid) ?? -9) < s;
  function attackStyle(source, style) {
    if (style) return { style: style === 'bow' ? 'ranged' : style === 'staff' ? 'magic' : style, element: style === 'magic' ? elementOf(lastSpell && now() - lastSpell.t < 4 ? lastSpell.id : ctx.magic?.autocast || state.save?.autocast, isPlayer(source) ? null : source) : null };
    if (isPlayer(source)) {
      const w = ctx.equipment?.weapon?.();
      const st = w?.equip?.style;
      const auto = ctx.magic?.autocast || state.save?.autocast;
      if (st === 'bow') return { style: 'ranged' };
      if (auto || (lastSpell && now() - lastSpell.t < 3)) return { style: 'magic', element: elementOf(lastSpell && now() - lastSpell.t < 3 ? lastSpell.id : auto) };
      return { style: 'melee', heavy: !!w?.equip?.twoHanded };
    }
    const st = source?.def?.style || 'melee';
    return { style: st, element: st === 'magic' ? elementOf(null, source) : null, heavy: (source?.def?.size || 1) > 1 || source?.def?.boss };
  }
  function launch(source, target, info) {
    const o = at(source, { volume: isPlayer(source) || isPlayer(target) ? 1 : 0.6 });
    if (info.style === 'ranged') { play('bow', o); play('arrow', { ...o, delay: 0.08, volume: (o.volume ?? 1) * 0.8 }); }
    else if (info.style === 'magic') play('spell-' + (info.element === 'teleport' ? 'spark' : info.element || 'spark'), o);
    else play('swing', { ...o, heavy: info.heavy });
    markAttack(source);
  }
  on('combat:start', () => { lastPlayerCombat = now(); });
  on('combat:end', () => { lastPlayerCombat = now() - 2; });
  on('combat:attack', ({ source, target, style, spell }) => {
    const info = attackStyle(source, style);
    if (spell) info.element = elementOf(spell);
    launch(source, target, info);
    if (isPlayer(source) || isPlayer(target)) lastPlayerCombat = now();
    if (source?.kind === 'monster' && Math.random() < 0.4) voice(source, 'attack');
  });
  on('spell:cast', ({ spell, target }) => {
    const el = elementOf(spell);
    lastSpell = { id: String(spell?.id || spell || ''), t: now() };
    if (el === 'teleport' || !target) return; // teleports sound on spell:teleport / player:teleport
    if (!launchedRecently(P()?.entity, 0.3)) launch(P()?.entity, target, { style: 'magic', element: el });
  });
  on('magic:cast', ({ spell }) => { lastSpell = { id: String(spell?.id || spell || ''), t: now() }; });
  on('combat:projectile', ({ from, to, kind, spell }) => {
    if (isPlayer(from) || isPlayer(to)) lastPlayerCombat = now();
    if (from?.def?.boss || to?.def?.boss) lastBossSeen = now();
    if (launchedRecently(from, 0.3)) return;
    if (kind === 'fire') { play('fire-breath', at(from, { big: from?.defId === 'ashen_wyrm' })); markAttack(from); return; }
    const info = kind === 'arrow' ? { style: 'ranged' } : { style: 'magic', element: spell ? elementOf(spell) : elementOf(null, isPlayer(from) ? null : from) };
    launch(from, to, info);
    if (from?.kind === 'monster' && Math.random() < 0.35) voice(from, 'attack');
  });
  on('combat:hit', ({ target, source, amount = 0, type = 'hit', style }) => {
    const playerInvolved = isPlayer(target) || isPlayer(source);
    if (playerInvolved) lastPlayerCombat = now();
    if (source?.def?.boss || target?.def?.boss) lastBossSeen = now();
    const vol = playerInvolved ? 1 : 0.55;
    if (type === 'heal') { play('heal', at(target, { volume: vol * 0.8 })); return; }
    const info = source ? attackStyle(source, style) : { style: 'melee' };
    const launched = launchedRecently(source);
    if (source && type !== 'burn' && !launched) launch(source, target, info);
    const delay = launched ? 0.01 : 0.06;
    const o = at(target, { volume: vol, delay });
    if (type === 'burn') { play('burn-tick', o); if (amount > 0) play('hit', { ...o, power: 0.3, volume: vol * 0.5 }); }
    else if (type === 'miss') {
      if (info.style === 'melee' && Math.random() < 0.5) play('block', { ...o, volume: vol * 0.7 });
      else if (info.style === 'magic') play('spell-hit', { ...o, element: info.element, volume: vol * 0.4 });
    } else if (amount > 0) {
      const maxHp = isPlayer(target) ? (P()?.maxHp || 10) : (target?.maxHp || target?.def?.hp || 10);
      const power = clamp((amount / Math.max(1, maxHp)) * 3, 0, 1);
      if (info.style === 'ranged') { play('arrow-hit', o); play('hit', { ...o, power: power * 0.6, volume: vol * 0.6 }); }
      else if (info.style === 'magic') { play('spell-hit', { ...o, element: info.element }); play('hit', { ...o, power: power * 0.5, volume: vol * 0.5 }); }
      else play('hit', { ...o, power });
    } else play('block', o);
    if (isPlayer(target) && amount > 0 && type !== 'burn' && Math.random() < 0.45) play('hurt', { female: state.save?.look?.body === 'female', delay: delay + 0.05 });
    if (source?.kind === 'monster' && !launched && Math.random() < 0.3) voice(source, 'attack');
    if (target?.kind === 'monster' && amount > 0 && Math.random() < 0.3) voice(target, 'hurt', { delay: delay + 0.05 });
  });
  on('monster:aggro', ({ entity }) => voice(entity, 'attack'));
  on('boss:special', ({ entity, kind, phase }) => {
    lastBossSeen = now();
    if (kind === 'stomp' && phase === 'impact') play('stomp', at(entity, { range: 40 }));
    else if (kind === 'stomp' || kind === 'breath') voice(entity, 'attack');
    else if (kind === 'summon') { play('summon', at(entity, { range: 40 })); voice(entity, 'attack'); }
    else if (kind === 'enrage') { voice(entity, 'enrage'); duck(0.5, 2.5); }
  });
  on('npc:say', ({ entity }) => {
    if (!entity) return;
    if (entity.kind === 'monster') voice(entity, 'attack');
    else play('npc-murmur', at(entity, { volume: 0.5, range: 14 }));
  });
  const monsterDeath = (e) => {
    if (!e || e.kind !== 'monster') return;
    const t = now();
    if (t - (deathHandled.get(e.uid) ?? -9) < 1) return;
    deathHandled.set(e.uid, t);
    if (deathHandled.size > 200) deathHandled.clear();
    if (voiceFor(e)) voice(e, 'death', { delay: 0.1 });
    else play('monster-death', at(e, { delay: 0.1 }));
  };
  on('monster:death', ({ entity }) => monsterDeath(entity));
  on('entity:death', ({ entity }) => monsterDeath(entity));
  on('player:death', () => { lastDeath = now(); const end = play('death'); duck(0.15, Math.max(3, end - now())); });
  let hpLow = false;
  on('player:hp', ({ hp, max }) => { hpLow = hp > 0 && max > 0 && hp / max <= 0.25; });

  // Loot.
  on('loot:drop', ({ id, x, z, entity, source }) => {
    if (/arrow/.test(String(id)) && source !== 'monster') return; // spent ammo
    const pos = Number.isFinite(x) ? { x: x + 0.5, z: z + 0.5 } : posOf(entity);
    play('item-drop', pos ? { x: pos.x, z: pos.z, volume: 0.6 } : { volume: 0.6 });
    const value = ITEMS[id]?.value ?? 0;
    if (value >= 5000 || /uncut|wyrm_scale|golem_core|pearl|starmetal/.test(String(id))) play('loot-rare', { delay: 0.12 });
  });
  on('loot:take', () => play('pickup'));
  on('oracle:ask', () => play('oracle-hum', { volume: 0.9 }));
  on('oracle:answer', ({ tier, live }) => play('oracle-' + (['spark', 'lamp', 'beacon'].includes(tier) ? tier : 'lamp'), { live }));
  on('door', (p) => play('door', Number.isFinite(p.x) ? { x: p.x, z: p.z } : {}));
  on('skill:act', ({ skill, name, x, z }) => {
    const map = { woodcutting: 'chop', mining: 'mine', smithing: 'anvil', cooking: 'cook', fletching: 'fletch', firemaking: 'fire-strike', crafting: 'craft', fishing: 'fish-splash' };
    const n = name || map[skill];
    if (n) { ext[n] = now(); play(n, Number.isFinite(x) ? { x, z } : {}); }
  });
  on('sfx', (p) => { if (p.name) api.play(p.name, p); });
  on('peer:join', () => play('peer-join'));
  on('peer:leave', () => play('peer-leave'));
  on('chat:public', (p) => { if (p.peer || (p.from && p.from !== state.save?.name)) play('message'); });
  on('emote', ({ name, peer }) => {
    const n = 'emote-' + String(name || '').toLowerCase();
    if (sfx.has(n)) play(n, peer ? { volume: 0.5 } : {});
  });
  on('run:change', () => play('ui-tab', { volume: 0.7 }));
  // UI events from the ui builder.
  on('ui:window', ({ open }) => play(open ? 'ui-open' : 'ui-close'));
  on('ui:sheet', ({ open }) => play(open ? 'ui-open' : 'ui-close', { volume: 0.8 }));
  on('ui:tab', () => play('ui-tab'));
  // Game messages: a few lines map to sounds when no dedicated event exists.
  on('chat:game', ({ text = '', kind }) => {
    const t = String(text);
    if (/stunned|caught you|catches you/i.test(t)) play('stun');
    else if (kind === 'warn' && /can't|cannot|not enough|need|don't have/i.test(t)) play('ui-error', { volume: 0.7 });
  });

  // Plain buttons straight from the DOM (tabs / windows come from ui events above).
  const uiClick = (ev) => {
    if (!ready() || now() - (ext['ui-click'] ?? -99) < 30) return;
    const el = ev.target?.closest?.('[data-sfx], .hv-btn, button, [role="button"]');
    if (!el || el.closest('canvas') || el.matches('.hv-tab, .hv-close, [role="tab"]')) return;
    const custom = el.getAttribute?.('data-sfx');
    if (custom) { if (sfx.has(custom)) play(custom); return; }
    play('ui-click');
  };
  const unlockOnGesture = () => { if (!api.unlocked || (ac && ac.state !== 'running')) api.unlock(); };
  window.addEventListener('pointerdown', (ev) => { unlockOnGesture(); uiClick(ev); }, true);
  window.addEventListener('keydown', unlockOnGesture, true);
  window.addEventListener('touchend', unlockOnGesture, true);

  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend().catch(() => {});
    else if (api.unlocked) ac.resume().catch(() => {});
  });

  // Per-frame extras that need the event state above.
  let hbT = 0;
  api.frameExtras = (dt) => {
    dialogueBlips();
    hbT -= dt;
    if (hpLow && state.mode === 'play' && hbT <= 0 && now() - lastPlayerCombat < 8) { hbT = 1.1; play('heartbeat', { volume: 0.8 }); }
  };

  return api;
}
