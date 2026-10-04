// Quest flow (owner: gameplay): arrive → kindle → seek → beacon → finale → done (DESIGN §3).
// Objective text + target for the compass, compass markers, saves on every step change, runs the
// intro on a new game and restores a saved game on continue.
//
// createQuest(ctx) → { step, objective {text, target}, markers, setStep(id), intro,
//                      startNewGame(), continueGame(), refresh(), update }

import { LANDMARKS, CHECKPOINTS, heightAt } from '../world/heightfield.js';
import { FLAME_IDS, FLAME_INFO, flameAnchor } from './places.js';
import { createIntro } from './intro.js';
import { emitSubtitle, releaseCamera } from './director.js';

export const STEPS = ['arrive', 'kindle', 'seek', 'beacon', 'finale', 'done'];
const SEEN_RADIUS = 40;
const MERCUSUAR = { x: 196, z: 43 };

export function createQuest(ctx) {
  const { events, state, interact } = ctx;
  const fx = ctx.flames.fx;
  const prog = () => state.progress;

  const flamePos = {};
  for (const id of FLAME_IDS) {
    const a = flameAnchor(ctx, id);
    flamePos[id] = { x: a.x, z: a.z };
  }

  let started = false;
  let lastObjectiveKey = '';
  let refreshT = 0;

  const quest = {
    step: prog().quest,
    objective: { text: '', target: null },
    markers: [],
    intro: null,
    setStep,
    startNewGame,
    continueGame,
    refresh,
    update,
    get started() { return started; },
  };

  quest.intro = createIntro(ctx, fx, {
    onDone: (skipped) => {
      refresh(true);
      if (!skipped) fx.after(1.2, () => events.emit('hint', { text: 'Ikuti jalan setapak ke kampung. Mbah Sarni menunggu di dekat api unggun.', seconds: 5 }));
      else events.emit('hint', { text: 'Mbah Sarni menunggu di api unggun kampung.', seconds: 4 });
    },
  });

  // ---------------------------------------------------------------- knowledge
  function knowsFlame(id) {
    const p = prog();
    if (p.flags['seen_flame_' + id] || p.flags['seen_' + id]) return true;
    return (p.clues || []).some((c) => c && c.id === 'loc_' + id);
  }
  const found = () => FLAME_IDS.filter((id) => prog().flames[id] !== 'none').length;
  const carried = () => FLAME_IDS.filter((id) => prog().flames[id] === 'carried').length;
  const placed = () => FLAME_IDS.filter((id) => prog().flames[id] === 'placed').length;

  function nearestUnfoundKnown() {
    const pp = ctx.player?.position;
    let best = null, bd = Infinity;
    for (const id of FLAME_IDS) {
      if (prog().flames[id] !== 'none' || !knowsFlame(id)) continue;
      const f = flamePos[id];
      const d = pp ? Math.hypot(f.x - pp.x, f.z - pp.z) : 0;
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  // ---------------------------------------------------------------- objective + markers
  function computeObjective() {
    const step = prog().quest;
    const S = LANDMARKS.npcs.sarni;
    const K = LANDMARKS.kampung.campfire;
    switch (step) {
      case 'arrive':
        return { text: 'Temui Mbah Sarni di api unggun kampung.', target: { x: S.x, z: S.z }, id: 'sarni' };
      case 'kindle':
        return { text: 'Nyalakan api unggun kampung dengan lenteramu.', target: { x: K.x, z: K.z }, id: 'cp:kampung' };
      case 'seek': {
        const n = found();
        const near = nearestUnfoundKnown();
        if (near) return { text: `Temukan tiga Api Pusaka (${n}/3).`, target: { ...flamePos[near] }, id: 'flame:' + near };
        return { text: `Temukan tiga Api Pusaka (${n}/3). Tanya warga soal petunjuknya.`, target: null, id: 'none' };
      }
      case 'beacon': {
        if (carried() > 0) return { text: `Bawa Api Pusaka ke mercusuar (${placed()}/3).`, target: { ...MERCUSUAR }, id: 'mercusuar' };
        const near = nearestUnfoundKnown();
        const text = `Temukan Api Pusaka berikutnya (${found()}/3).`;
        if (near) return { text, target: { ...flamePos[near] }, id: 'flame:' + near };
        return { text: text + ' Tanya warga soal petunjuknya.', target: null, id: 'none' };
      }
      case 'finale':
        return { text: '', target: null, id: 'finale' };
      default:
        return { text: 'Kabut sudah terangkat. Jelajahi pulau sesukamu.', target: null, id: 'done' };
    }
  }

  function computeMarkers(objId) {
    const p = prog();
    const out = [];
    if (p.quest === 'arrive') {
      const S = LANDMARKS.npcs.sarni;
      out.push({ id: 'sarni', kind: 'npc', label: 'Mbah Sarni', x: S.x, z: S.z });
    }
    for (const cp of CHECKPOINTS) {
      if (p.checkpoints[cp.id] || (p.quest === 'kindle' && cp.id === 'kampung')) {
        out.push({ id: 'cp:' + cp.id, kind: 'campfire', label: cp.name, x: cp.x, z: cp.z, lit: !!p.checkpoints[cp.id] });
      }
    }
    if (p.quest !== 'arrive' && p.quest !== 'kindle') {
      for (const id of FLAME_IDS) {
        if (p.flames[id] !== 'none' || !knowsFlame(id)) continue;
        out.push({ id: 'flame:' + id, kind: 'flame', label: FLAME_INFO[id].name, color: FLAME_INFO[id].color, x: flamePos[id].x, z: flamePos[id].z });
      }
    }
    if (FLAME_IDS.some((id) => p.flames[id] !== 'none') || p.finished) {
      out.push({ id: 'mercusuar', kind: 'beacon', label: 'Mercusuar', x: MERCUSUAR.x, z: MERCUSUAR.z });
    }
    for (const m of out) m.objective = m.id === objId;
    return out;
  }

  function refresh(force = false) {
    quest.step = prog().quest;
    const o = computeObjective();
    quest.objective = { text: o.text, target: o.target };
    quest.markers = computeMarkers(o.id);
    const key = o.text + '|' + o.id;
    if (force || key !== lastObjectiveKey) {
      lastObjectiveKey = key;
      events.emit('objective', { text: o.text, target: o.target, step: quest.step });
    }
  }

  function setStep(id) {
    if (!STEPS.includes(id)) return;
    const prev = prog().quest;
    if (prev === id) { refresh(); return; }
    prog().quest = id;
    quest.step = id;
    events.emit('quest:step', { step: id, prev });
    refresh(true);
    state.save();
  }

  // Make the saved step consistent with the saved world (older saves, quits mid-sequence).
  function normalizeStep() {
    const p = prog();
    if (p.finished) { p.quest = 'done'; return; }
    if (p.quest === 'done' || p.quest === 'finale') p.quest = 'beacon';
    if (p.quest === 'arrive' && p.flags.met_sarni) p.quest = 'kindle';
    if (p.quest === 'kindle' && p.checkpoints.kampung) p.quest = 'seek';
    if ((p.quest === 'seek' || p.quest === 'kindle' || p.quest === 'arrive') && found() > 0) p.quest = 'beacon';
  }

  // ---------------------------------------------------------------- game start / continue
  function startNewGame() {
    started = true;
    ctx.finale?.reset?.();
    state.resetProgress();
    quest.step = prog().quest;
    lastObjectiveKey = '';
    quest.intro.start();
  }

  function continueGame() {
    started = true;
    ctx.finale?.reset?.();
    if (!state.load()) { startNewGame(); return; }
    if (quest.intro.active) quest.intro.finish(true);
    fx.fade(true, 0);
    const p = prog();
    if (p.quest === 'arrive') {
      const S = LANDMARKS.spawn;
      ctx.player?.teleport?.(S.x, S.y, S.z, S.yaw ?? 0);
    } else {
      ctx.checkpoints?.placeAtCheckpoint?.(p.lastCheckpoint);
    }
    releaseCamera(ctx, true);
    state.setMode('play');
    ctx.player?.setControl?.(true);
    ctx.player?.setLanternLit?.(true, 0);
    lastObjectiveKey = '';
    refresh(true);
    fx.after(0.15, () => fx.fade(false, 1.2));
    events.emit('toast', { text: 'Perjalanan dilanjutkan.', kind: 'info' });
    // Quit during the beacon sequence: replay it.
    if (placed() >= 3 && !p.finished) fx.after(1.5, () => ctx.finale?.start?.());
  }

  // Skip straight to play at the spawn (debug hook / stub menus without game:start).
  function quickStart() {
    started = true;
    if (quest.intro.active) { quest.intro.skip(true); return; }
    const p = prog();
    if (p.quest === 'arrive') {
      const S = LANDMARKS.spawn;
      ctx.player?.teleport?.(S.x, S.y, S.z, S.yaw ?? 0);
    }
    ctx.player?.setControl?.(true);
    ctx.player?.setLanternLit?.(true, 0);
    releaseCamera(ctx, true);
    refresh(true);
  }

  events.on('game:start', (e) => {
    if (e && e.newGame === false) continueGame();
    else startNewGame();
  });
  events.on('debug:skipIntro', quickStart);
  events.on('mode:change', ({ mode, prev }) => {
    if (mode === 'play' && prev === 'title' && !started) quickStart();
  });
  events.on('game:loaded', () => { normalizeStep(); quest.step = prog().quest; lastObjectiveKey = ''; });
  events.on('game:quit', () => {
    if (quest.intro.active) quest.intro.abort();
    started = false;
  });
  events.on('game:reset', () => { quest.step = prog().quest; lastObjectiveKey = ''; });

  // ---------------------------------------------------------------- step transitions
  events.on('dialogue:close', (e) => {
    if (e?.npcId !== 'sarni') return;
    state.flag('met_sarni', true);
    if (prog().quest === 'arrive') {
      setStep('kindle');
      events.emit('hint', { text: 'Dekati api unggun dan tekan tombol aksi untuk menyalakannya.', seconds: 5 });
    }
  });
  events.on('checkpoint:light', () => {
    if (prog().quest === 'kindle') {
      fx.after(2.5, () => {
        if (prog().quest !== 'kindle') return;
        setStep('seek');
        events.emit('toast', { text: 'Tujuan baru: temukan tiga Api Pusaka', kind: 'info' });
      });
    } else refresh();
  });
  events.on('flame:collect', () => {
    if (prog().quest === 'seek' || prog().quest === 'kindle' || prog().quest === 'arrive') setStep('beacon');
    else refresh();
  });
  events.on('flame:place', () => refresh());
  events.on('clue:add', () => fx.after(0, () => refresh()));
  events.on('finale:start', () => setStep('finale'));
  events.on('finale:end', () => setStep('done'));

  // Fallback Sarni conversation when the NPC module has no Sarni (stub builds).
  const SN = LANDMARKS.npcs.sarni;
  let fallbackTalking = false;
  interact.add({
    id: 'quest:sarni-fallback',
    x: SN.x, y: heightAt(SN.x, SN.z) + 1.2, z: SN.z,
    radius: 2.8,
    label: 'Bicara dengan Mbah Sarni',
    enabled: () => !fallbackTalking && prog().quest === 'arrive' && !ctx.npcs?.get?.('sarni'),
    onInteract: () => {
      fallbackTalking = true;
      emitSubtitle(ctx, 'Mbah Sarni', 'Lho, Nak, kamu bawa lentera… Sudah lama pulau ini ndak lihat cahaya yang jujur.', 4.5);
      fx.after(4.7, () => emitSubtitle(ctx, 'Mbah Sarni', 'Nyalakan api unggun ini dulu, biar kabutnya mundur. Monggo.', 4));
      fx.after(8.9, () => {
        fallbackTalking = false;
        events.emit('dialogue:close', { npcId: 'sarni', fallback: true });
      });
    },
  });

  // ---------------------------------------------------------------- per frame
  function update(dt) {
    quest.intro.update(dt);
    if (dt <= 0) return;
    refreshT -= dt;
    if (refreshT > 0) return;
    refreshT = 0.5;
    const pp = ctx.player?.position;
    const p = prog();
    if (pp && state.mode === 'play') {
      for (const id of FLAME_IDS) {
        if (p.flags['warm_' + id]) continue;
        const f = flamePos[id];
        if (Math.hypot(f.x - pp.x, f.z - pp.z) <= SEEN_RADIUS) {
          p.flags['warm_' + id] = true;
          p.flags['seen_flame_' + id] = true; // shared with the journal map
          if (p.flames[id] === 'none' && p.quest !== 'arrive') events.emit('toast', { text: `Kamu merasakan kehangatan ${FLAME_INFO[id].name} di dekat sini…`, kind: 'flame' });
        }
      }
    }
    refresh();
  }

  refresh(true);
  return quest;
}
