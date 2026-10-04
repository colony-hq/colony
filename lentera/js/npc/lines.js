// NPC writing index + pure helpers shared by mind.js, dialogue.js, journal.js and node tools.
// No three.js / DOM imports here: `node .qa/check-lines.mjs` imports this file directly.
//
// Per-NPC schema (lines-<id>.js, default export):
//   { id, name, role, where, bio(h) -> string, persona (system prompt for OrbioClient),
//     greetings: [{ when(h) -> bool, text: string | string[] | (h) -> string, once?: flagName }],
//     gift?: string (Sarni only), more: string[], bye: [{ when(h), text }],
//     topics: [{ id, label, ask, kind: 'petunjuk' | 'catatan', unlock?(h) -> bool, lockHint?,
//               redup|sedang|terang: { text, clue?: { id, text }, flags?: string[] } }] }
// Clue ids ending in `_samar` are vague (Sedang) versions; they never unlock compass markers.

import sarni from './lines-sarni.js';
import darto from './lines-darto.js';
import ratih from './lines-ratih.js';
import laras from './lines-laras.js';
import lamun from './lines-lamun.js';

export const NPC_LINES = { sarni, darto, ratih, laras, lamun };
export const NPC_IDS = Object.keys(NPC_LINES);

export const QUEST_STEPS = ['arrive', 'kindle', 'seek', 'beacon', 'finale', 'done'];

// Quest-critical clue ids (DESIGN §7). Everything else is a flavour note ("catatan").
export const KEY_CLUES = ['kabut_origin', 'loc_tirta', 'loc_bumi', 'loc_samudra', 'pelita_order', 'sockets', 'lamun_story'];

export const clueBase = (id) => String(id || '').replace(/_samar$/, '');
export const isVague = (id) => /_samar$/.test(String(id || ''));

// Topic display order inside the Petunjuk tab.
export const CLUE_ORDER = [
  'api_pusaka', 'kabut_origin', 'loc_tirta', 'loc_bumi', 'pelita_order', 'pelita_relief', 'loc_samudra', 'mercusuar', 'sockets', 'lamun_story',
];

// Journal headings per clue subject.
export const CLUE_TITLES = {
  api_pusaka: 'Tiga Api Pusaka',
  kabut_origin: 'Asal-usul kabut',
  loc_tirta: 'Api Tirta',
  loc_bumi: 'Api Bumi',
  loc_samudra: 'Api Samudra',
  pelita_order: 'Urutan pelita candi',
  pelita_relief: 'Relief candi',
  sockets: 'Tungku mercusuar',
  lamun_story: 'Ki Lamun',
  mercusuar: 'Mercusuar',
  harga_pikiran: 'Harga sebuah pikiran',
  ikan_darto: 'Laut menunggu cahaya',
  kabut_laut: 'Bertahan di kabut',
  menu_ratih: 'Warung Bu Ratih',
  gosip_ratih: 'Kopi dua gelas',
  kilau: 'Kilau hijau',
  skripsi_laras: 'Tutorial dari batu',
  kabut_teori: 'Teori Laras',
  pesan_sarni: 'Pesan untuk Mbah Sarni',
  lamun_pulang: 'Jalan pulang',
};

// Progress helper handed to every when()/unlock()/bio() function.
export function makeHelpers(progress, npcId = null) {
  const p = progress || {};
  const flags = p.flags || {};
  const asked = p.asked || {};
  const flames = p.flames || {};
  const clues = p.clues || [];
  const stepIdx = Math.max(0, QUEST_STEPS.indexOf(p.quest || 'arrive'));
  const vals = Object.values(flames);
  return {
    p,
    npcId,
    step: p.quest || 'arrive',
    atLeast: (s) => stepIdx >= QUEST_STEPS.indexOf(s),
    flag: (name) => !!flags[name],
    asked: (npc, topic) => asked[`${npc}:${topic}`] || null,
    askedAny: (topic) => Object.keys(asked).some((k) => k.endsWith(':' + topic)),
    flame: (id) => flames[id] || 'none',
    has: (id) => (flames[id] || 'none') !== 'none',
    carried: vals.filter((v) => v === 'carried').length,
    placed: vals.filter((v) => v === 'placed').length,
    pelita: (p.pelita || []).length,
    clue: (id) => clues.some((c) => c.id === id),
    visits: npcId ? Number(flags['talks_' + npcId]) || 0 : 0,
  };
}

// Resolve a text spec (string | string[] | fn) against helpers; arrays rotate by `turn`.
export function resolveText(spec, h, turn = 0) {
  if (typeof spec === 'function') return spec(h);
  if (Array.isArray(spec)) return spec[((turn % spec.length) + spec.length) % spec.length];
  return spec || '';
}

// First matching entry of an ordered [{when, text}] list.
export function pickVariant(list, h) {
  for (const v of list || []) {
    try { if (!v.when || v.when(h)) return v; } catch { /* malformed rule: skip */ }
  }
  return null;
}

export function topicUnlocked(topic, h) {
  if (!topic.unlock) return true;
  try { return !!topic.unlock(h); } catch { return false; }
}

// Every clue id any answer can produce (for tooling / validation).
export function allClueIds() {
  const out = new Set();
  for (const npc of Object.values(NPC_LINES)) {
    for (const t of npc.topics) for (const tier of ['redup', 'sedang', 'terang']) if (t[tier]?.clue) out.add(t[tier].clue.id);
  }
  return out;
}
