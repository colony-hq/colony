// QA (not shipped): validates the NPC writing data.
//   node .qa/check-lines.mjs
// Checks every NPC x topic has redup/sedang/terang text, clue ids are well-formed and every
// clue id the game references (DESIGN §7 + journal titles) is produced by some answer.
import { NPC_LINES, KEY_CLUES, CLUE_TITLES, CLUE_ORDER, allClueIds, makeHelpers, clueBase, QUEST_STEPS } from '../js/npc/lines.js';

const TIERS = ['redup', 'sedang', 'terang'];
const errors = [];
const warn = [];
let topics = 0, answers = 0;
const stats = { redup: [], sedang: [], terang: [] };

for (const [id, npc] of Object.entries(NPC_LINES)) {
  if (npc.id !== id) errors.push(`${id}: id mismatch (${npc.id})`);
  for (const k of ['name', 'role', 'persona']) if (!npc[k]) errors.push(`${id}: missing ${k}`);
  if (!npc.greetings?.length) errors.push(`${id}: no greetings`);
  if (!npc.more?.length) errors.push(`${id}: no "more" lines`);
  if (!npc.bye?.length) errors.push(`${id}: no "bye" lines`);
  if (npc.topics.length < 3 || npc.topics.length > 6) warn.push(`${id}: ${npc.topics.length} topics`);
  const seen = new Set();
  for (const t of npc.topics) {
    topics++;
    if (seen.has(t.id)) errors.push(`${id}.${t.id}: duplicate topic`);
    seen.add(t.id);
    if (!t.label || !t.ask) errors.push(`${id}.${t.id}: missing label/ask`);
    if (!['petunjuk', 'catatan'].includes(t.kind)) errors.push(`${id}.${t.id}: bad kind ${t.kind}`);
    if (t.unlock && !t.lockHint) warn.push(`${id}.${t.id}: unlock without lockHint`);
    for (const tier of TIERS) {
      const a = t[tier];
      if (!a || typeof a.text !== 'string' || a.text.trim().length < 20) { errors.push(`${id}.${t.id}.${tier}: missing/short text`); continue; }
      answers++;
      stats[tier].push(a.text.length);
      const budget = tier === 'terang' ? 420 : 240; // ~1-4 sentences worth of text
      if (a.text.length > budget) warn.push(`${id}.${t.id}.${tier}: ${a.text.length} chars (> ${budget})`);
      if (/[\u{1F300}-\u{1FAFF}]/u.test(a.text)) errors.push(`${id}.${t.id}.${tier}: emoji`);
      if (a.clue) {
        if (!a.clue.id || !a.clue.text) errors.push(`${id}.${t.id}.${tier}: malformed clue`);
        if (tier === 'redup') errors.push(`${id}.${t.id}.redup: redup must not give a clue`);
        if (tier === 'sedang' && !/_samar$/.test(a.clue.id)) errors.push(`${id}.${t.id}.sedang: sedang clue should be *_samar (${a.clue.id})`);
        if (tier === 'terang' && /_samar$/.test(a.clue.id)) errors.push(`${id}.${t.id}.terang: terang clue must be precise`);
      }
      for (const f of a.flags || []) if (typeof f !== 'string') errors.push(`${id}.${t.id}.${tier}: bad flag`);
    }
    if (t.kind === 'petunjuk' && !t.terang?.clue) errors.push(`${id}.${t.id}: petunjuk topic without terang clue`);
  }
  // Greeting / unlock functions must run on every quest step without throwing.
  for (const step of QUEST_STEPS) {
    const prog = { quest: step, flags: {}, asked: {}, flames: { tirta: 'none', bumi: 'none', samudra: 'none' }, clues: [], pelita: [] };
    const h = makeHelpers(prog, id);
    try {
      for (const g of npc.greetings) if (!g.when || g.when(h)) { const tx = typeof g.text === 'function' ? g.text(h) : g.text; if (!tx) errors.push(`${id}: empty greeting @${step}`); break; }
      for (const t of npc.topics) if (t.unlock) t.unlock(h);
      npc.bio?.(h);
    } catch (e) { errors.push(`${id}: rule threw @${step}: ${e.message}`); }
  }
}

const produced = allClueIds();
const required = new Set([...KEY_CLUES, ...CLUE_ORDER, ...Object.keys(CLUE_TITLES)]);
const EXTERNAL = new Set(['pelita_relief']); // emitted by gameplay/flames.js (relief panel)
for (const id of required) if (!produced.has(id) && !EXTERNAL.has(id)) errors.push(`clue "${id}" is referenced but never produced`);
for (const id of produced) if (!CLUE_TITLES[clueBase(id)]) errors.push(`clue "${id}" has no journal title`);

// Coverage per DESIGN brief.
const who = (topicId) => Object.values(NPC_LINES).filter((n) => n.topics.some((t) => t.id === topicId)).map((n) => n.id);
const expect = { kabut_origin: ['sarni'], loc_tirta: ['sarni', 'ratih'], loc_samudra: ['darto'], loc_bumi: ['sarni', 'laras'], pelita_order: ['laras'], sockets: ['lamun'], lamun_story: ['sarni', 'lamun'] };
for (const [topic, npcs] of Object.entries(expect)) for (const n of npcs) if (!who(topic).includes(n)) errors.push(`topic ${topic} missing at ${n}`);

const avg = (a) => Math.round(a.reduce((s, v) => s + v, 0) / (a.length || 1));
console.log(JSON.stringify({
  npcs: Object.keys(NPC_LINES).length, topics, answers,
  avgChars: { redup: avg(stats.redup), sedang: avg(stats.sedang), terang: avg(stats.terang) },
  maxChars: { redup: Math.max(...stats.redup), sedang: Math.max(...stats.sedang), terang: Math.max(...stats.terang) },
  clueIds: [...produced].sort(),
  warnings: warn,
  errors,
}, null, 2));
process.exit(errors.length ? 1 : 0);
