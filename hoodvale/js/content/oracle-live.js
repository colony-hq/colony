// Builds the compact prompt for a Live Oracle answer (artifact `sample` capability): the game's
// facts from the data files + the player's state + the question. Pure. Owner: content builder.

import { ZONES } from '../data/zones.js';
import { QUESTS } from '../data/quests.js';
import { NPCS } from '../data/npcs.js';
import { MONSTERS } from '../data/monsters.js';
import { SHOPS, THOUGHT_TIERS } from '../data/economy.js';
import { ITEMS, formatCredit } from '../data/items.js';
import { SKILLS } from '../data/skills.js';
import { ANSWERS } from './oracle-answers.js';

// Where each monster lives (summarised from data/spawns.js).
export const MONSTER_AREAS = {
  chicken: 'Millbrook chicken run', rat: 'behind the Wobbly Kettle, Brightwater', cow: 'Millbrook cow pen',
  goblin: "along Miners' Way and in the Goblin Warrens", goblin_brute: 'the Goblin Warrens', goblin_warchief: 'the deep north end of the Goblin Warrens (boss)',
  boar: 'the wilds between Brightwater, Hoodwood and Gildmoor', wolf: 'north of the Hoodwood camp', bandit: 'along the Forest Road south of Hoodwood',
  giant_spider: 'northern Mistfen', bog_lurker: 'Fen Mere in Mistfen', bear: 'the north-east woods', sheriff_guard: "around Gildmoor and in the Sheriff's vault",
  shard_wisp: 'the Orbio Spire plateau', highland_troll: 'the southern Ashen Highlands', stone_golem: 'near the Ashen Peak',
  vault_knight: "the Sheriff's vault", skeleton: "the Sheriff's vault", sheriff_vane: "the Sheriff's vault under the keep (boss)",
  ash_imp: 'the Ashen Lair', ashen_drake: 'the Ashen Lair', ashen_wyrm: 'the deepest chamber of the Ashen Lair (boss)',
};

let FACTS = null;
export function gameFacts() {
  if (FACTS) return FACTS;
  const L = [];
  L.push('WORLD: Hoodvale is a valley. Robinhood Chain theme: the outlaw guild "the Hood" (Robyn) redistributes the hoarded CREDIT of Sheriff Vane of Gildmoor. Orbio theme: orbium crystals hold thought; the Orbio Oracle sells answers priced in CREDIT. CREDIT, the Hood Wallet and the Robinhood Chain are simulated in-game (no real value).');
  L.push('ZONES: ' + Object.values(ZONES).map((z) => `${z.name} (levels ${z.levels}): ${z.blurb}`).join(' | '));
  L.push('DUNGEONS: Goblin Warrens (cave south-west of Copperhollow); the Sheriff\'s Vault (stairs inside the Sheriff\'s keep, Gildmoor); the Ashen Lair (sealed gate at the foot of the Ashen Peak, needs the Ashen key).');
  L.push('SKILLS: ' + SKILLS.map((s) => `${s.name} — ${s.blurb}`).join(' | '));
  L.push('TRAINING AND BOSS FACTS: ' + Object.values(ANSWERS).filter((a) => a.beacon).map((a) => `${a.label}: ${a.beacon}`).join(' || '));
  L.push('MONSTERS: ' + Object.values(MONSTERS).map((m) => {
    const drops = [...(m.drops?.always || []).map((d) => d.item), ...(m.drops?.table || []).map((d) => d.item).filter(Boolean)].map((id) => ITEMS[id]?.name || id);
    const credit = m.drops?.credit ? `, ${formatCredit(m.drops.credit[0])}–${formatCredit(m.drops.credit[1])} CREDIT` : '';
    return `${m.name} (lvl ${m.level}${m.aggressive ? ', aggressive' : ''}) at ${MONSTER_AREAS[m.id] || 'the wilds'}; drops ${[...new Set(drops)].join(', ') || 'nothing'}${credit}`;
  }).join(' | '));
  L.push('QUESTS: ' + QUESTS.map((q) => {
    const req = Object.entries(q.requires || {}).map(([k, v]) => (k === 'quests' ? v.map((x) => QUESTS.find((y) => y.id === x)?.name).join(' + ') : `${k} ${v}`)).join(', ');
    return `${q.name} (${q.difficulty}; giver ${NPCS[q.giver]?.name}${req ? '; requires ' + req : ''}): ${q.summary} Steps: ${q.steps.join(' / ')}`;
  }).join(' || '));
  L.push('PEOPLE: ' + Object.values(NPCS).filter((n) => !/^villager_/.test(n.id)).map((n) => `${n.name} (${n.role}, ${ZONES[n.zone]?.name || n.zone})`).join('; '));
  L.push('SHOPS: ' + Object.entries(SHOPS).map(([, s]) => `${s.name}: ${s.stock.slice(0, 8).map(([id]) => ITEMS[id]?.name).join(', ')}${s.stock.length > 8 ? '…' : ''}`).join(' | '));
  L.push(`ORACLE TIERS: Spark ${formatCredit(THOUGHT_TIERS.spark.cost)}, Lamp ${formatCredit(THOUGHT_TIERS.lamp.cost)}, Beacon ${formatCredit(THOUGHT_TIERS.beacon.cost)} CREDIT; a Live answer (you) costs as a Beacon. The Exchange in Gildmoor matches buy and sell orders between adventurers and NPC market makers. Banks (Brightwater Ledger House, Gildmoor Ledger Bank) share one item store.`);
  FACTS = L.join('\n');
  return FACTS;
}

// Player summary from ctx (levels, quests, balance).
export function playerFacts(ctx) {
  const s = ctx.state.save;
  const lv = ctx.skills?.levels?.() || {};
  const quests = ctx.quests;
  const qs = QUESTS.map((q) => {
    const st = quests?.status?.(q.id) || 'not_started';
    if (st === 'in_progress') { const j = quests.journal(q.id).find((x) => x.current); return `${q.name}: in progress — current step: ${j?.text || ''}`; }
    return `${q.name}: ${st.replace('_', ' ')}`;
  }).join('; ');
  const zone = ctx.player ? ctx.map?.zoneAt?.(ctx.player.x + 0.5, ctx.player.z + 0.5) : null;
  return `PLAYER: ${s.name}, combat level ${ctx.skills?.combatLevel?.() ?? 3}, standing in ${ZONES[zone]?.name || zone || 'the Vale'}, wallet ${formatCredit(ctx.wallet?.balance ?? s.wallet?.balance ?? 0)} CREDIT. Levels: ${Object.entries(lv).map(([k, v]) => `${k} ${v}`).join(', ')}. Quests: ${qs}.`;
}

export function buildPrompt(ctx, question) {
  return [
    'You are the Orbio Oracle, a serene, slightly wry mind of humming crystal atop the Orbio Spire in Hoodvale, a RuneScape-inspired fantasy browser game. A player has paid a Beacon thought (0.040 simulated CREDIT) for one answer.',
    'Rules: reply in English, in character, in 2 to 4 sentences and at most 90 words of plain text (no markdown, no lists, no headings). Be specific and useful: give levels, places and names from the facts. Use only the game facts below; if they do not cover the question, say so in character and suggest who in the Vale might know. Never claim CREDIT has real-world value. Keep it family-friendly.',
    '',
    'GAME FACTS',
    gameFacts(),
    '',
    playerFacts(ctx),
    '',
    `THE PLAYER ASKS: ${String(question).slice(0, 400)}`,
  ].join('\n');
}
