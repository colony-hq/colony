// Player save + settings. Single source of truth for persistent progress. Modules mutate the
// save through their own APIs (inventory, skills, wallet, quests) and call state.markDirty().
// Persistence: localStorage (core/save.js) always; the net module mirrors it to the artifact
// db (private per-player doc) when available. See DESIGN.md §6.

import { loadJSON, saveJSON, removeKey } from './save.js';
import { SKILL_IDS, START_XP } from '../data/skills.js';
import { SPAWN } from '../data/zones.js';

export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS = {
  musicVolume: 0.5, sfxVolume: 0.8, masterVolume: 0.9,
  quality: 'auto', // 'auto' | 'low' | 'medium' | 'high'
  cameraSpeed: 1, invertZoom: false, shiftDrop: true, showXpDrops: true, showNames: true,
  chatFilter: 'all', // 'all' | 'game' | 'public' | 'off'
  acceptAid: false, autoRetaliate: true, runDefault: true,
};

export function freshSave(name = 'Adventurer', look = null) {
  const skills = {};
  for (const id of SKILL_IDS) skills[id] = START_XP[id] || 0;
  return {
    v: SAVE_VERSION,
    created: Date.now(),
    name,
    look: look || { body: 'male', skin: '#e0b48a', hair: 'short', hairColor: '#4a3020', top: '#7a5a3a', bottom: '#4a3a2a', boots: '#3a2a1a' },
    pos: { x: SPAWN.x, z: SPAWN.z },
    skills,
    hp: 10,
    run: { on: true, energy: 100 },
    inventory: new Array(28).fill(null), // { id, qty }
    bank: [], // [{ id, qty }] (order = bank tabs order)
    equipment: {}, // slot -> { id, qty }
    wallet: { balance: 0, txs: [] }, // milli-CREDIT; txs capped by the chain module
    quests: {}, // questId -> stage index | 'done'
    flags: {},
    stats: { kills: {}, deaths: 0, steps: 0, playTime: 0, logs: 0, ores: 0, fish: 0, thoughts: { spark: 0, lamp: 0, beacon: 0 } },
    combatStyle: 'accurate', // accurate | aggressive | defensive (melee) ; rapid | longrange (bow)
    autocast: null,
  };
}

export function createState(events) {
  const settings = { ...DEFAULT_SETTINGS, ...(loadJSON('settings', {}) || {}) };
  let dirty = false, lastSave = 0;
  const state = {
    mode: 'loading', // 'loading' | 'login' | 'create' | 'play' | 'dead' | 'cutscene'
    settings,
    save: freshSave(),
    setMode(mode) {
      if (mode === state.mode) return;
      const prev = state.mode;
      state.mode = mode;
      events.emit('mode:change', { mode, prev });
    },
    flag(name, value) {
      if (value === undefined) return state.save.flags[name];
      state.save.flags[name] = value;
      state.markDirty();
      return value;
    },
    markDirty() { dirty = true; },
    hasLocalSave() { return !!loadJSON('save', null); },
    loadLocal() {
      const s = loadJSON('save', null);
      if (!s || s.v !== SAVE_VERSION) return false;
      state.save = { ...freshSave(s.name, s.look), ...s };
      events.emit('save:loaded', { source: 'local' });
      return true;
    },
    // Replace the save (cloud restore). Emits save:loaded so modules refresh.
    replace(s, source = 'cloud') {
      state.save = { ...freshSave(s.name, s.look), ...s };
      events.emit('save:loaded', { source });
    },
    newCharacter(name, look) {
      state.save = freshSave(name, look);
      state.markDirty();
      state.flush();
      events.emit('save:loaded', { source: 'new' });
    },
    deleteLocal() { removeKey('save'); },
    saveSettings() { saveJSON('settings', state.settings); events.emit('settings:change', {}); },
    // Write the save if dirty (called every few seconds and on important moments).
    flush(force = false) {
      if (!dirty && !force) return false;
      dirty = false;
      lastSave = Date.now();
      saveJSON('save', state.save);
      events.emit('save:written', { at: lastSave });
      return true;
    },
    update(dt) {
      if (state.mode === 'play') state.save.stats.playTime += dt;
      if (dirty && Date.now() - lastSave > 4000) state.flush();
    },
  };
  window.addEventListener('beforeunload', () => { try { state.flush(); } catch { /* ignore */ } });
  return state;
}
