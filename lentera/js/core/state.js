// Game state + persistence. Single source of truth for progress; modules mutate it through
// their own APIs and emit events (DESIGN.md §State).

import { loadJSON, saveJSON, removeKey } from './save.js';

export const DEFAULT_SETTINGS = {
  sensitivity: 1, // 0.3 .. 2.5
  invertY: false,
  quality: 'auto', // 'auto' | 'low' | 'medium' | 'high'
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.9,
  cameraShake: true,
  showHints: true,
};

export const START_CREDIT = 0.5;

function freshProgress() {
  return {
    quest: 'arrive', // quest step id (gameplay/quest.js)
    flags: {}, // story flags, e.g. met_sarni: true
    flames: { tirta: 'none', bumi: 'none', samudra: 'none' }, // 'none' | 'carried' | 'placed'
    checkpoints: { kampung: false, tirta: false, candi: false }, // lit?
    lastCheckpoint: 'kampung',
    nyala: 100, // lantern light 0..100
    credit: { balance: START_CREDIT, spent: 0, earned: 0, thoughts: 0, byTier: { redup: 0, sedang: 0, terang: 0 }, ledger: [] },
    clues: [], // { id, text, source, tier }
    kilau: [], // collected kilau ids
    pelita: [], // candi puzzle: ids lit so far, in order
    asked: {}, // `${npcId}:${topicId}` -> highest tier asked
    deaths: 0,
    playTime: 0,
    finished: false,
  };
}

export function createState(events) {
  const settings = { ...DEFAULT_SETTINGS, ...(loadJSON('settings', {}) || {}) };
  const state = {
    mode: 'loading', // 'loading' | 'title' | 'intro' | 'play' | 'dialogue' | 'journal' | 'pause' | 'cinematic' | 'finale'
    prevMode: 'loading',
    settings,
    progress: freshProgress(),

    setMode(mode) {
      if (mode === state.mode) return;
      state.prevMode = state.mode;
      state.mode = mode;
      events.emit('mode:change', { mode, prev: state.prevMode });
    },
    // Overlays (pause, journal, dialogue) push and pop so they return to whatever was active.
    modeStack: [],
    pushMode(mode) {
      state.modeStack.push(state.mode);
      state.setMode(mode);
    },
    popMode(fallback = 'play') {
      const back = state.modeStack.pop();
      state.setMode(back && back !== 'loading' && back !== 'title' ? back : fallback);
    },
    isPlaying() { return state.mode === 'play'; },

    // Lantern light (0..100). Every change goes through here so the HUD and player stay in sync.
    addNyala(delta, reason = '') {
      const p = state.progress;
      const before = p.nyala;
      p.nyala = Math.max(0, Math.min(100, p.nyala + delta));
      if (p.nyala !== before) events.emit('nyala:change', { value: p.nyala, delta: p.nyala - before, reason });
      return p.nyala;
    },

    flag(name, value) {
      if (value === undefined) return !!state.progress.flags[name];
      state.progress.flags[name] = value;
      events.emit('flag', { name, value });
      return value;
    },

    saveSettings() { saveJSON('settings', state.settings); },
    save() {
      saveJSON('progress', state.progress);
      events.emit('game:saved', {});
    },
    hasSave() {
      const p = loadJSON('progress', null);
      return !!(p && p.quest && p.quest !== 'arrive');
    },
    load() {
      const p = loadJSON('progress', null);
      if (!p) return false;
      const fresh = freshProgress();
      state.progress = { ...fresh, ...p, credit: { ...fresh.credit, ...(p.credit || {}) }, flames: { ...fresh.flames, ...(p.flames || {}) }, checkpoints: { ...fresh.checkpoints, ...(p.checkpoints || {}) } };
      events.emit('game:loaded', {});
      return true;
    },
    resetProgress() {
      state.progress = freshProgress();
      removeKey('progress');
      events.emit('game:reset', {});
    },
  };
  return state;
}
