// Content checks (node, no browser): every NPC has dialogue, every goto resolves, every quest
// stage has journal text, oracle answers exist for every topic/tier, and all 8 quests run end to
// end against the real dialogue/quest/shop/oracle modules with a scripted mock UI.
// Usage: node .qa/content-check.mjs   (exit code 1 on failure)

globalThis.window = globalThis.window || { addEventListener() {}, localStorage: null };

const root = new URL('../js/', import.meta.url);
const imp = (p) => import(new URL(p, root).href);

const { NPCS } = await imp('data/npcs.js');
const { QUESTS, QUEST_BY_ID } = await imp('data/quests.js');
const { ITEMS } = await imp('data/items.js');
const { THOUGHT_TIERS } = await imp('data/economy.js');
const { createEvents } = await imp('core/events.js');
const { createTicks } = await imp('core/ticks.js');
const { createState } = await imp('core/state.js');
const { createSkills } = await imp('game/skills.js');
const { createInventory, createBank, createEquipment } = await imp('game/inventory.js');
const { createActions } = await imp('game/actions.js');
const { createChain } = await imp('net/chain.js');
const { createWallet } = await imp('net/wallet.js');
const { createMap } = await imp('world/map.js');
const { createDialogue } = await imp('content/dialogue.js');
const { createShops } = await imp('content/shops.js');
const { createQuests, QUEST_MODULES } = await imp('content/quests.js');
const { createOracle } = await imp('content/oracle.js');
const { createTravellers, TRAVELLERS } = await imp('content/travellers.js');
const { createLore } = await imp('content/lore.js');
const { TOPIC_GROUPS, ANSWERS } = await imp('content/oracle-answers.js');
const { buildPrompt } = await imp('content/oracle-live.js');

const errors = [];
const notes = [];
const fail = (m) => errors.push(m);
const ok = (cond, m) => { if (!cond) fail(m); };

// ------------------------------------------------------------------ mock ctx
function makeCtx({ loot = false } = {}) {
  const events = createEvents();
  const consoleErrors = [];
  const ctx = { events, debug: false, time: { t: 0, dt: 0, frame: 0 }, THREE: null };
  ctx.ticks = createTicks(events);
  ctx.state = createState(events);
  ctx.state.newCharacter('Tester');
  ctx.state.setMode('play');
  ctx.map = createMap();
  ctx.chain = createChain(ctx);
  ctx.wallet = createWallet(ctx);
  ctx.skills = createSkills(ctx);
  ctx.inventory = createInventory(ctx);
  ctx.bank = createBank(ctx);
  ctx.equipment = createEquipment(ctx);
  ctx.actions = createActions(ctx);
  // entities
  const all = new Map();
  ctx.entities = {
    get: (uid) => all.get(uid), all: () => all.values(), byKind: (k) => [...all.values()].filter((e) => e.kind === k),
    near: (x, z, r) => [...all.values()].filter((e) => Math.max(Math.abs(e.x - x), Math.abs(e.z - z)) <= r),
    add: (e) => { e.state = e.state || {}; all.set(e.uid, e); events.emit('entity:add', { entity: e }); return e; },
    remove: (e) => all.delete(e.uid), moveTo: (e, x, z) => { e.x = x; e.z = z; },
  };
  for (const d of Object.values(NPCS)) ctx.entities.add({ uid: 'n:' + d.id, kind: 'npc', def: d, defId: d.id, name: d.name, x: d.x, z: d.z, w: 1, d: 1, state: {}, examine: () => d.examine, options: () => d.options });
  ctx.entities.add({ uid: 'o:chest', kind: 'object', def: { id: 'chest_vault' }, defId: 'chest_vault', name: 'Strongbox', x: 1124, z: 4, w: 1, d: 1, state: {}, examine: () => 'box' });
  ctx.entities.add({ uid: 'm:lurker', kind: 'monster', def: { id: 'bog_lurker' }, defId: 'bog_lurker', name: 'Bog lurker', x: 46, z: 180, w: 1, d: 1, state: {}, alive: true });
  ctx.player = {
    x: 177, z: 242, actor: null,
    face() {}, setAnim() {}, playOnce() {}, stun() {}, entity: { uid: 'player', kind: 'player', x: 177, z: 242 },
    walkToEntity(e, g, cb) { this.x = e.x - 1; this.z = e.z; cb?.(); return true; }, walkTo() {},
    teleport(x, z) { this.x = x; this.z = z; events.emit('player:teleport', { x, z, region: ctx.map.regionAt(x + 0.5, z + 0.5).id }); },
  };
  // scripted UI
  const ui = { plan: [], transcript: [], unexpected: [] };
  ui.dialogue = ({ speaker, text, options }) => {
    ui.transcript.push(`${speaker?.name || '·'}: ${text}${options ? '  [' + options.join(' | ') + ']' : ''}`);
    if (!text && !(options?.length)) ui.unexpected.push('empty frame from ' + speaker?.name);
    if (/\{\w+\}|undefined|\[object Object\]|NaN/.test(text + (options || []).join(' '))) ui.unexpected.push('bad text: ' + text + ' ' + (options || []).join('|'));
    if (!options?.length) return Promise.resolve(null);
    const want = ui.plan.shift();
    if (want == null) return Promise.resolve(null);
    const i = options.findIndex((o) => (want instanceof RegExp ? want.test(o) : o.startsWith(want)));
    const more = options.findIndex((o) => o === 'More…');
    if (i < 0 && more >= 0 && !ui.paged) { ui.paged = true; ui.plan.unshift(want); return Promise.resolve(more); }
    ui.paged = false;
    if (i < 0) { ui.unexpected.push(`option "${want}" not in [${options.join(' | ')}]`); return Promise.resolve(null); }
    return Promise.resolve(i);
  };
  ui.closeDialogue = () => {}; ui.openShop = () => {}; ui.openBank = () => {}; ui.message = () => {};
  ctx.ui = ui;
  const chat = [];
  events.on('chat:game', (m) => chat.push(m));
  ctx.chat = chat;
  ctx.dialogue = createDialogue(ctx);
  ctx.shops = createShops(ctx);
  ctx.quests = createQuests(ctx);
  ctx.oracle = createOracle(ctx);
  ctx.travellers = createTravellers(ctx);
  ctx.lore = createLore(ctx);
  if (loot) ctx.loot = { questDrops: [] };
  events.emit('game:ready', {});
  return ctx;
}

const ctx = makeCtx();
const D = ctx.dialogue;
const Q = ctx.quests;

// ------------------------------------------------------------------ static checks
let npcWithDialogue = 0;
for (const d of Object.values(NPCS)) {
  const id = d.dialogue || d.id;
  if (D.has(id)) npcWithDialogue++; else fail(`NPC ${d.id} has no dialogue tree "${id}"`);
}
for (const t of TRAVELLERS) ok(D.has('traveller_' + t.id), `traveller ${t.id} has no tree`);
for (const [id, t] of D.trees) {
  const check = (g, where) => {
    if (g == null) return;
    if (typeof g === 'string') { if (!t.nodes[g]) fail(`tree ${id}: ${where} -> missing node "${g}"`); return; }
    if (Array.isArray(g)) for (const e of g) check(e.goto, where);
  };
  ok(Object.keys(t.nodes).length > 0, `tree ${id} has no nodes`);
  ok(t.nodes.hub || t.greet.length, `tree ${id} has neither hub nor greet`);
  for (const g of t.greet) check(g.goto, 'greet');
  for (const tp of t.topics) check(tp.goto, 'topic ' + tp.text);
  for (const [nid, n] of Object.entries(t.nodes)) {
    check(n.goto, nid + '.goto'); check(n.next, nid + '.next'); check(n.fail, nid + '.fail');
    for (const o of n.options || []) { check(o.goto, `${nid} option "${o.text}"`); check(o.fail, `${nid} option fail`); }
  }
}
for (const q of QUESTS) {
  const m = QUEST_MODULES.find((x) => x.id === q.id);
  if (!m) { fail(`quest ${q.id} has no module`); continue; }
  ok(m.steps?.length === q.steps.length, `quest ${q.id}: ${m.steps?.length} journal steps vs ${q.steps.length} data steps`);
  for (let s = 0; s < q.steps.length; s++) {
    ctx.state.save.quests[q.id] = s;
    const j = Q.journal(q.id);
    const cur = j.find((x) => x.current);
    ok(cur && cur.text && cur.text.length > 8, `quest ${q.id} stage ${s} has no journal text`);
    ok(j.length === s + 1, `quest ${q.id} stage ${s}: journal has ${j.length} entries`);
    for (const e of j) ok(!/undefined|NaN|\[object/.test(e.text), `quest ${q.id} stage ${s}: bad journal text "${e.text}"`);
  }
  ctx.state.save.quests[q.id] = 'done';
  ok(Q.journal(q.id).some((x) => x.kind === 'complete'), `quest ${q.id}: no completion line`);
  delete ctx.state.save.quests[q.id];
  ok(Q.journal(q.id).length >= 2, `quest ${q.id}: no not-started journal`);
}
for (const g of TOPIC_GROUPS) for (const t of g.topics) {
  if (t === 'myquest') continue;
  for (const tier of ['spark', 'lamp', 'beacon']) ok(ANSWERS[t]?.[tier]?.length > 20, `oracle answer missing: ${t}/${tier}`);
}
ok(Object.keys(THOUGHT_TIERS).length === 3, 'thought tiers');
const prompt = buildPrompt(ctx, 'Where do I train mining?');
ok(prompt.length > 4000 && prompt.length < 60000, `live prompt size ${prompt.length}`);
notes.push(`live prompt: ${prompt.length} chars`);
for (const e of ctx.travellers.list) ok(ctx.map.isWalkable(e.x, e.z), `traveller ${e.uid} spawned on unwalkable tile ${e.x},${e.z}`);
for (const t of TRAVELLERS) for (const s of t.route) ok(ctx.map.nearestWalkable(s.x, s.z, 6), `traveller ${t.id}: stop ${s.x},${s.z} not near walkable land`);

// ------------------------------------------------------------------ dynamic: talk to everyone
const ui = ctx.ui;
async function talk(npcId, plan = []) {
  ui.plan = [...plan];
  ui.transcript.length = 0;
  await D.start(npcId);
  if (ui.plan.length) fail(`talk ${npcId}: unused plan ${JSON.stringify(ui.plan.map(String))}`);
  return ui.transcript.slice();
}
const bankAll = () => { for (const e of [...ctx.inventory.slots]) if (e) ctx.bank.deposit(e.id, ctx.inventory.count(e.id)); };
const settle = () => new Promise((r) => setTimeout(r, 0));
const tick = async (n = 2) => { ctx.ticks.advance(n); await settle(); };

for (const d of Object.values(NPCS)) {
  const tr = await talk(d.id, []);
  ok(tr.length >= 1, `talking to ${d.id} produced no frames`);
}
// Every hub option on every NPC, once.
for (const d of Object.values(NPCS)) {
  const t = D.trees.get(d.dialogue || d.id);
  const hub = t?.nodes.hub;
  if (!hub) continue;
  const c = D.contextFor(ctx.entities.get('n:' + d.id));
  const opts = [...t.topics.filter((x) => !x.when || x.when(c)), ...(hub.options || []).filter((x) => !x.when || x.when(c))];
  for (const o of opts) {
    if (o.end || o.do) continue;
    const greetDefault = t.greet.find((g) => !g.when || g.when(c));
    if (greetDefault) continue; // quest greeting first; covered by quest runs
    await talk(d.id, [o.text]);
  }
}

// ------------------------------------------------------------------ dynamic: quests end to end
const S = ctx.state.save;
const give = (id, n = 1) => ctx.inventory.add(id, n);
const kill = (defId) => ctx.events.emit('monster:death', { entity: { uid: 'k' + Math.random(), defId, kind: 'monster' } });
const stage = (id) => Q.stage(id);
const expect = (id, st, where) => ok(stage(id) === st, `${where}: ${id} stage ${JSON.stringify(stage(id))}, expected ${JSON.stringify(st)}`);
S.inventory = new Array(28).fill(null);

// Into the Vale
await talk('guide_elowen', ['Teach me everything!']);
expect('into_the_vale', 1, 'itv accept');
ok(ctx.inventory.has('bronze_axe') && ctx.inventory.has('tinderbox'), 'itv: starter tools given');
give('logs'); await tick(); expect('into_the_vale', 2, 'itv logs');
ctx.skills.addXp('firemaking', 40); await tick(); expect('into_the_vale', 3, 'itv fire');
ctx.skills.addXp('fishing', 10); give('raw_shrimp'); await tick(); ctx.skills.addXp('cooking', 30); await tick(); expect('into_the_vale', 4, 'itv cook');
give('copper_ore'); give('tin_ore'); await tick(); expect('into_the_vale', 5, 'itv mine');
give('bronze_bar'); await tick(); expect('into_the_vale', 6, 'itv smelt');
give('bronze_dagger'); await tick(); expect('into_the_vale', 7, 'itv smith');
kill('rat'); await tick(); expect('into_the_vale', 8, 'itv rat');
await talk('banker_bw', []); await tick(); expect('into_the_vale', 9, 'itv bank');
await talk('guide_elowen', []); expect('into_the_vale', 'done', 'itv finish');
ok(ctx.wallet.balance === 250, `itv: balance ${ctx.wallet.balance}`);
ok(ctx.inventory.count('bread') === 3, 'itv: bread reward');
ok(ctx.state.flag('unlock:wallet_airdrop'), 'itv unlock flag');

// Feast
bankAll();
await talk('innkeeper_marta', ["I'll help!"]); expect('feast_for_brightwater', 1, 'feast accept');
give('bucket'); await talk('farmer_hale', ['Could I have some milk?']); ok(ctx.inventory.has('bucket_of_milk'), 'hale milk');
await talk('farmer_hale', ['Marta needs an egg']); ok(ctx.inventory.has('egg'), 'hale egg');
give('grain'); give('pot'); await talk('miller_nell', ['Could you grind']); ok(ctx.inventory.has('pot_of_flour'), 'nell flour');
await talk('innkeeper_marta', []); expect('feast_for_brightwater', 'done', 'feast done');
ok(ctx.inventory.count('honey_cake') === 5, 'feast cakes');

// Goblin bell
bankAll();
ctx.skills.setLevel('attack', 10); ctx.skills.setLevel('strength', 10);
await talk('elder_rowan', ["I'll get your bell back."]); expect('goblin_bell', 1, 'bell accept');
ctx.player.teleport(1032, 58); await tick(); expect('goblin_bell', 2, 'bell warrens');
kill('goblin_warchief'); await tick(); expect('goblin_bell', 3, 'bell kill'); ok(ctx.inventory.has('village_bell'), 'bell item');
ctx.player.teleport(188, 250);
await talk('elder_rowan', []); expect('goblin_bell', 'done', 'bell done'); ok(ctx.inventory.has('iron_sword'), 'bell reward');

// Hood's Oath
bankAll();
await talk('robyn', ['I want to join the Hood.']); ok(stage('hoods_oath') == null, 'oath requires levels');
ctx.skills.setLevel('archery', 10); ctx.skills.setLevel('thieving', 10);
await talk('robyn', ['I want to join the Hood.']); expect('hoods_oath', 1, 'oath accept');
give('shortbow'); give('bronze_arrow', 15); await tick(); expect('hoods_oath', 2, 'oath fletch');
for (let i = 0; i < 3; i++) ctx.events.emit('archery:target', { hit: true }); await tick(); expect('hoods_oath', 3, 'oath targets');
ctx.events.emit('thieving:success', { entity: ctx.entities.get('n:tax_collector') }); await tick(); await tick();
ok(ctx.inventory.has('tax_ledger'), 'oath ledger'); expect('hoods_oath', 4, 'oath pickpocket');
await talk('robyn', []); expect('hoods_oath', 'done', 'oath done'); ok(ctx.state.flag('hood_member'), 'hood member flag');
await talk('tax_collector', ['Do I owe anything?']);

// Oracle's Price
bankAll();
ctx.skills.setLevel('mining', 20);
await talk('oracle', ['Will you teach me Arcana?', 'I will.']); expect('oracles_price', 1, 'op accept');
give('orbium_shard', 10); await tick(); expect('oracles_price', 2, 'op shards');
await talk('oracle', []); expect('oracles_price', 3, 'op handover'); ok(ctx.state.flag('arcana_trial'), 'arcana trial flag');
await talk('archivist_sol', ['Could you guide my hand?']); expect('oracles_price', 4, 'op inscribe');
await talk('oracle', ['To protect', 'Honestly?']); expect('oracles_price', 'done', 'op done'); ok(ctx.state.flag('unlock:arcana'), 'arcana unlocked');

// Bog Song
bankAll();
ctx.skills.setLevel('defence', 40); ctx.skills.setLevel('hitpoints', 40); ctx.skills.setLevel('attack', 40); ctx.skills.setLevel('strength', 40);
await talk('old_wren', ["I'll fetch them."]); expect('bog_song', 1, 'bog accept');
give('willow_bark', 2); give('willow_logs', 1); give('spider_silk', 2); await tick();
await talk('old_wren', []); expect('bog_song', 3, 'bog handover');
kill('bog_lurker'); await tick(); expect('bog_song', 4, 'bog lurker');
await talk('old_wren', []); expect('bog_song', 'done', 'bog done');

// Ledger of Lies
bankAll();
await talk('robyn', ["I'll get the ledger."]); expect('ledger_of_lies', 1, 'lol accept');
kill('vault_knight'); await tick(); expect('ledger_of_lies', 2, 'lol key'); ok(ctx.inventory.has('vault_key'), 'vault key');
kill('sheriff_vane'); await tick(); expect('ledger_of_lies', 3, 'lol vane');
ctx.chat.length = 0; ctx.actions.perform(ctx.entities.get('o:chest'), 'Open'); await tick(); if (stage('ledger_of_lies') !== 4) notes.push('strongbox chat: ' + JSON.stringify(ctx.chat.slice(-4)) + ' inv key ' + ctx.inventory.count('vault_key')); expect('ledger_of_lies', 4, 'lol strongbox');
await talk('robyn', []); expect('ledger_of_lies', 'done', 'lol done');
await talk('sheriff_vane_npc', ["What's under your keep?"]);

// Ashen Wyrm
bankAll();
ctx.skills.setLevel('attack', 60); ctx.skills.setLevel('strength', 60); ctx.skills.setLevel('defence', 60); ctx.skills.setLevel('hitpoints', 60);
await talk('hermit_grimsby', ["I'll slay the wyrm."]); expect('ashen_wyrm', 1, 'wyrm accept');
give('steel_kiteshield'); give('ember_sigil', 5);
await talk('hermit_grimsby', []); expect('ashen_wyrm', 2, 'wyrm shield'); ok(ctx.inventory.has('fireward_shield'), 'fireward');
kill('stone_golem'); await tick(); expect('ashen_wyrm', 3, 'wyrm key');
ctx.player.teleport(1228, 50); await tick(); expect('ashen_wyrm', 4, 'wyrm lair');
kill('ashen_wyrm'); await tick(); expect('ashen_wyrm', 5, 'wyrm slain');
ctx.player.teleport(107, 93);
await talk('hermit_grimsby', []); expect('ashen_wyrm', 'done', 'wyrm done');
ok(Q.points() === Q.totalPoints, `quest points ${Q.points()}/${Q.totalPoints}`);

// ------------------------------------------------------------------ shops + oracle
bankAll();
const before = ctx.wallet.balance;
const bought = ctx.shops.buy('general', 'tinderbox', 2);
ok(bought === 2, `shop buy returned ${bought}`);
ok(ctx.wallet.balance < before, 'shop buy debited');
const sold = ctx.shops.sell('general', 'logs', 1) || (give('logs'), ctx.shops.sell('general', 'logs', 1));
ok(sold === 1, 'shop sell');
ok(ctx.shops.sell('fishing', 'bronze_sword', 1) === 0, 'fishing shop refuses swords');
ok(ctx.shops.sell('general', 'hood_token', 1) === 0, 'quest items unsellable');
ok(ctx.shops.stock('archery').length > 5, 'stock list');
const bal0 = ctx.wallet.balance;
ui.plan = ['Where should I train', 'Mining', 'Beacon'];
ui.transcript.length = 0;
await ctx.oracle.consult(ctx.entities.get('n:oracle'));
ok(ctx.wallet.balance === bal0 - 40, `oracle beacon charged (${bal0 - ctx.wallet.balance})`);
ok(ctx.state.save.stats.thoughts.beacon === 1, 'thought stat recorded');
ok(ui.transcript.some((l) => /Orbium shards at 20/.test(l)), 'beacon mining answer shown');
ok(ctx.wallet.history().some((t) => /Oracle thought \(Beacon\)/.test(t.reason)), 'oracle memo');
ui.plan = ['Help me with my quest', 'Spark'];
await ctx.oracle.consult(ctx.entities.get('n:oracle'));

// ------------------------------------------------------------------ travellers move
for (let i = 0; i < 60; i++) ctx.ticks.advance(1);
const moved = ctx.travellers.list.filter((e) => e.x !== e.home.x || e.z !== e.home.z).length;
ok(moved >= 6, `only ${moved}/10 travellers moved in 60 ticks`);
notes.push(`travellers moved: ${moved}/10`);

// ------------------------------------------------------------------ loot.questDrops path
{
  const c2 = makeCtx({ loot: true });
  ok(c2.loot.questDrops.length === 3, `questDrops registered: ${c2.loot.questDrops.length}`);
  ok(c2.loot.questDrops.every((d) => d.quest && d.item && d.monster && d.chance === 1), 'questDrops shape');
  c2.skills.setLevel('attack', 20); c2.skills.setLevel('strength', 20);
  c2.quests.start('goblin_bell');
  c2.events.emit('monster:death', { entity: { uid: 'wc', defId: 'goblin_warchief', kind: 'monster' } });
  ok(!c2.inventory.has('village_bell') && c2.quests.stage('goblin_bell') === 2, 'viaLoot: bell not handed over directly');
  c2.inventory.add('village_bell', 1); c2.ticks.advance(2); await new Promise((r) => setTimeout(r, 0));
  ok(c2.quests.stage('goblin_bell') === 3, `viaLoot: picking up the bell advances (stage ${c2.quests.stage('goblin_bell')})`);
}

if (ui.unexpected.length) for (const u of [...new Set(ui.unexpected)]) fail('ui: ' + u);
console.log(JSON.stringify({ ok: !errors.length, npcs: Object.keys(NPCS).length, npcWithDialogue, trees: D.trees.size, quests: QUESTS.length, questPoints: Q.points(), notes, errors }, null, 2));
process.exit(errors.length ? 1 : 0);
