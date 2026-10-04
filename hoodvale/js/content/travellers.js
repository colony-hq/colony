// Travellers: ten ambient NPC adventurers (role "Traveller") who walk the Vale's roads between
// towns, stop to chop, mine, fish or rest, greet the player and chat overhead. They are entities
// (kind 'npc', uid 't:<id>', def.traveller = true) with actors, like game/entities.js NPCs, and
// have their own dialogue trees ('traveller_<id>'). Owner: content builder.
//
// They move themselves (busy = true keeps the baseline wander away), one tile per tick, along
// short findPath hops between road waypoints; they pause while someone talks to them.
// API: list (entities), get(id), update(dt). Events out: npc:say.

import { ROADS } from '../data/zones.js';
import { C, pick } from './dlg-lib.js';

const R = Object.fromEntries(ROADS.map((r) => [r.id, r.points.map((p) => [p.x, p.z])]));
const seg = (id, a = 0, b = R[id].length - 1) => (a <= b ? R[id].slice(a, b + 1) : R[id].slice(b, a + 1).reverse());
const stop = (x, z, extra = {}) => ({ x, z, ...extra });
// A round trip: the outward stops, then the same way home.
const roundTrip = (stops) => [...stops, ...stops.slice(1, -1).reverse()];
const pts = (list, extra = {}) => list.map(([x, z]) => stop(x, z, extra));

export const TRAVELLERS = [
  {
    id: 'pip', name: 'Pip the Wanderer', examine: 'A cheerful wanderer with very worn boots. He whistles badly.',
    look: { model: 'player_m', body: 'male', skin: '#e8b89a', hair: 'short', hairColor: '#c97b3a', top: '#6a8a4a', bottom: '#5a4a3a', cape: '#8a6a3a' },
    route: roundTrip([
      ...pts(seg('kings-road', 0, 2)), stop(236, 232, { act: 'chop', objs: ['tree', 'tree_oak'], secs: 14, place: 'Millbrook' }),
      ...pts(seg('kings-road', 3, 4)), stop(250, 186, { act: 'rest', secs: 6, place: 'Gildmoor' }),
    ]),
    lines: ['Lovely day for a long walk!', 'Used to be a squire, you know. Long story. Involves a wyrm.', 'Gildmoor\'s that way. Probably.', '*whistles badly*', 'Every road goes somewhere. Usually Millbrook.'],
    about: ['I used to be squire to a knight of the Ashen Watch. Then he went up the Ashen Peak after the wyrm, and I went... elsewhere. Very quickly.', 'Now I wander. Brightwater to Gildmoor and back. It\'s a good road. Nothing on it breathes fire.'],
    tips: ['The King\'s Road is safe as houses. Safer than some houses. Stick to it if you\'re new.', 'Millbrook\'s trees are perfect for a learner\'s axe, and Farmer Hale will let you rest in the barn if you ask nicely.'],
  },
  {
    id: 'bertie', name: 'Bertie Bramblefoot', examine: 'A broad, bearded woodcutter with an axe over each shoulder.',
    look: { model: 'smith_m', body: 'male', build: 'stout', skin: '#c8956b', hair: 'short', beard: 'full', hairColor: '#7a4a2a', top: '#8a3a2a', bottom: '#3a3a2a', hat: 'beanie' },
    route: roundTrip([...pts(seg('forest-road', 0, 3)), stop(150, 176, { act: 'chop', objs: ['tree_oak', 'tree'], secs: 16, place: 'Hoodwood' }), stop(140, 164, { act: 'rest', anim: 'sit', secs: 6, place: 'the Hood camp' })]),
    lines: ['Timber!', "Oak's the best wood. Fight me. Gently.", 'Mind your toes!', 'Two axes. One for each mood.'],
    about: ["Bertie Bramblefoot, woodcutter. I chop in Hoodwood, sell in Brightwater, and eat Friar Tuckwell's stew in between.", 'The Hood leave me be. I leave them firewood. Everyone wins, except the trees.'],
    tips: ['Oaks need Woodcutting fifteen and give lovely logs. Willows by the Hoodwood river at thirty.', "Burn what you chop and you'll level two skills at once. Just not near the tents. The Hood get shouty."],
  },
  {
    id: 'maud', name: 'Sister Maud', examine: 'A pilgrim in grey, walking to the Spire with a lantern she never lights.',
    look: { body: 'female', build: 'old', skin: '#e0b48a', hair: 'bun', hairColor: '#d8d8d8', top: '#6a6a7a', bottom: '#4a4a5a', robe: true, staff: true },
    route: roundTrip([...pts(seg('spire-road', 0, 3)), stop(258, 62, { act: 'rest', anim: 'meditate', secs: 14, place: 'the Orbio Spire' })]),
    lines: ['Every answer has a price.', 'I asked the Oracle a Spark question once. It told me I was a teapot.', 'Walk slowly. Thoughts catch up.', 'Peace on your road.'],
    about: ['I walk to the Spire every week to sit with the Oracle. I never ask it anything. It finds that unsettling.', 'People pay for answers. I prefer the questions. They\'re free, and they last longer.'],
    tips: ['If you consult the Oracle, pay for a Beacon when it matters. Sparks are for laughing at.', 'Shard wisps drift on the plateau. They bite. Bring food, and something to bite back with.'],
  },
  {
    id: 'corwin', name: 'Old Corwin', examine: 'A weathered fisherman who walks to the sea every morning and back every evening.',
    look: { model: 'old_salt', body: 'male', build: 'old', skin: '#a8754f', hair: 'short', beard: 'short', hairColor: '#cfcfcf', top: '#2a4a6a', bottom: '#3a3a3a', hat: 'wide' },
    route: roundTrip([...pts(seg('dock-lane', 0, 2)), stop(212, 292, { act: 'fish', objs: ['fish_net_bait'], secs: 18, place: 'Saltreach' })]),
    lines: ['The sea gives, the sea takes. Mostly it takes my bait.', 'Morning tide, evening tide, and a nap in between.', 'Smell that? Salt. And Brine. The fishmonger, I mean.'],
    about: ["Corwin. I've walked Dock Lane twice a day for fifty years. The lane's worn smooth. So am I.", 'Old Salt and I went to sea together once. He tells it differently. He tells everything differently.'],
    tips: ['Shrimp off the beach east of the piers. Lobsters off the piers themselves, once you\'re a proper angler.', 'Brine pays more for fish than Pell does. Brine also smells more. Swings and roundabouts.'],
  },
  {
    id: 'juniper', name: 'Juniper Quill', examine: 'A surveyor with a notebook, a pickaxe and extremely strong opinions about rocks.',
    look: { model: 'clerk_f', body: 'female', skin: '#8a5a3a', hair: 'braid', hairColor: '#1a1a1a', top: '#a87a2a', bottom: '#4a3a2a', hat: 'cap' },
    route: roundTrip([...pts(seg('miners-way', 0, 5)), stop(84, 258, { act: 'mine', objs: ['rock_copper', 'rock_tin', 'rock_iron'], secs: 16, place: 'Copperhollow' })]),
    lines: ['Copper today, cobalt tomorrow!', "Dunstan says I'm too loud for mining. I SAID, DUNSTAN SAYS—", 'Rocks! Lovely rocks!', 'Noted. Noted. Very noted.'],
    about: ["Juniper Quill, surveyor. I map every vein in Copperhollow so the Sheriff can't tax the ones I don't write down.", 'I have a notebook of rocks I like. It is a very thick notebook.'],
    tips: ['Iron at fifteen, coal at thirty, both in the hollow. Cobalt and starmetal are up in the highlands with the trolls.', 'Goblins on Miners\' Way are harmless. Mostly. Their Warrens are another matter.'],
  },
  {
    id: 'hesketh', name: 'Hesketh the Bold', examine: 'A self-proclaimed hero in dented armour. Loudly bold.',
    look: { model: 'warrior_m', body: 'male', skin: '#f0c8a8', hair: 'long', hairColor: '#e2c060', top: '#8a8f95', bottom: '#4a4a5a', cape: '#2a4a8a' },
    route: roundTrip([...pts(seg('highland-trail', 0, 1)), stop(124, 124, { act: 'chop', objs: ['tree_oak', 'tree', 'tree_maple'], secs: 12, place: 'the Highland Trail' }), stop(112, 104, { act: 'rest', anim: 'think', secs: 10, place: 'the Hood ford' })]),
    lines: ['I once punched a troll! It was asleep. Still counts.', 'Onward! To glory! Or lunch.', 'Fear me, wolves! ...Not too much.', 'Today, the highlands. Tomorrow, the wyrm! Next week, probably.'],
    about: ["Hesketh the Bold! Hero, adventurer, wyrm-slayer-in-waiting. Mostly waiting.", 'I walk up to the ford every day and look at the Ashen Peak. Then I walk back. Planning is half of heroism.'],
    tips: ['Wolves north of the Hood camp. They hunt in packs. I hunt in a cape.', 'If you go to the highlands, bring food. Trolls are big. Golems are bigger. Hermit Grimsby is grumpier than both.'],
  },
  {
    id: 'wynn', name: 'Wynn the Tinker', examine: 'A tinker with a clanking pack of pots, pans and spare kettle lids.',
    look: { model: 'villager_m', body: 'male', build: 'slim', skin: '#c8956b', hair: 'short', hairColor: '#4a3a2a', top: '#7a5a8a', bottom: '#3a3a2a', hat: 'wide' },
    route: roundTrip([stop(232, 162, { act: 'rest', secs: 8, place: 'Gildmoor' }), ...pts(seg('west-gate', 1, 3)), stop(172, 205, { act: 'rest', anim: 'craft', secs: 6, place: 'the crossroads' }), ...pts(seg('forest-road', 1, 0)), stop(188, 254, { act: 'rest', secs: 10, place: 'Brightwater' })]),
    lines: ['Pots mended! Kettles unwobbled!', "Marta's kettle? Wobbles by design. Don't touch it.", '*clank* *clank* *clank*', 'Lids! Spouts! Handles! Handles for everything!'],
    about: ['Wynn, tinker. I fix what breaks between Gildmoor and Brightwater, and some things that were fine until I fixed them.', "The Sheriff once asked me to fix his scales. They were already rigged. I made them honest. He hasn't asked again."],
    tips: ['Westgate Lane is the quick way from Gildmoor to Hoodwood. The Sheriff\'s guards don\'t like it. That\'s why it\'s quick.', 'Need a pot or a bucket? Pell sells them. Need one fixed? Find me. Need one wobbly? Marta.'],
  },
  {
    id: 'dovie', name: 'Dovie Lark', examine: 'A young angler with a net almost as big as she is.',
    look: { model: 'villager_f', body: 'female', skin: '#f0c8a8', hair: 'short', hairColor: '#a87a3a', top: '#3a7a8a', bottom: '#5a4a3a' },
    route: [stop(162, 247, { act: 'fish', objs: ['fish_net_bait'], secs: 20, place: 'the lake' }), stop(175, 250), stop(186, 252, { act: 'rest', secs: 6, place: 'the square' }), stop(178, 262), stop(166, 252)],
    lines: ['I caught a fish THIS big! Well... this big.', 'Tobin says I talk too much for fishing. The fish don\'t mind.', 'Shrimp! Shrimp! Oh. Weed.'],
    about: ["I'm Dovie! I'm going to be the best angler in the Vale. Better than Tobin. Better than Old Salt. Better than the wyrm, probably.", "Tobin's teaching me. He says three words a day. Two of them are 'fish'."],
    tips: ['Net shrimp on the east shore! Then cook them. Raw shrimp are a mistake. I made the mistake. Once. Twice.', 'Fly rods are for trout up in Hoodwood. You need feathers. Chickens have feathers. Just saying.'],
  },
  {
    id: 'fergus', name: 'Fergus Ironsides', examine: 'A veteran miner, grey with rock dust and very proud of his fingers.',
    look: { model: 'smith_m', body: 'male', build: 'stout', skin: '#a8754f', hair: 'bald', beard: 'long', hairColor: '#9a9a9a', top: '#5a4a3a', bottom: '#3a3a3a', hat: 'helmet-lamp', scale: 0.92 },
    route: [stop(80, 266, { act: 'mine', objs: ['rock_iron', 'rock_coal', 'rock_copper'], secs: 18, place: 'the ore field' }), stop(90, 262), stop(98, 261, { act: 'rest', anim: 'sit', secs: 8, place: 'the furnace' }), stop(86, 252, { act: 'mine', objs: ['rock_coal', 'rock_iron', 'rock_tin'], secs: 16, place: 'the north rocks' }), stop(76, 258)],
    lines: ["Iron's honest work.", "Forty years down the hollow. Still got all my fingers. Most of 'em.", 'Coal! Never enough coal.', 'Hah. Rock.'],
    about: ["Fergus Ironsides. I've mined this hollow since before Dunstan was foreman. Before Dunstan had a beard. Before Dunstan.", 'The goblins dug their Warrens under my best seam. I hold a grudge. A very patient grudge.'],
    tips: ['Smelt your iron right here, at the hollow furnace. Saves the walk.', 'Steel takes two coal per bar. Always carry more coal than you think. Then more.'],
  },
  {
    id: 'mira', name: 'Mira Featherstep', examine: 'A ranger in green-grey, quiet as moss. Possibly a friend of the Hood. Possibly not.',
    look: { model: 'player_f', body: 'female', skin: '#d9a77c', hair: 'long', hairColor: '#3a2a1a', top: '#4a6a4a', bottom: '#3a3a2a', hood: '#4a6a4a', weapon: 'longbow' },
    route: roundTrip([...pts(seg('fen-path', 0, 1)), stop(104, 164, { act: 'rest', secs: 6, place: 'the Fen Path' }), ...pts(seg('fen-path', 2, 3)), stop(64, 166, { act: 'chop', objs: ['tree_willow', 'tree_oak'], secs: 14, place: 'Mistfen' })]),
    lines: ["Mind the bog. It's hungry.", 'Willow bark makes a lovely tea. Old Wren says otherwise.', '...', 'Quiet feet, quiet fen.'],
    about: ['Mira. I keep the Fen Path clear between the Hood camp and Mistfen. Somebody has to, and the bog lurkers won\'t.', "Am I in the Hood? I'm in the woods. The Hood is also in the woods. Draw your own conclusions."],
    tips: ['Giant spiders north of the fen drop silk. Bog lurkers drop pearls, if you can stand the smell.', 'Old Wren knows more than she says. Bring her something useful and she\'ll say more.'],
  },
];

export function createTravellers(ctx) {
  const { events, state, map } = ctx;
  const THREE = ctx.THREE;
  const list = [];
  let objIndex = null;

  function objectsOf(defs) {
    if (!objIndex) {
      objIndex = new Map();
      for (const e of ctx.entities?.byKind?.('object') || []) {
        if (!objIndex.has(e.defId)) objIndex.set(e.defId, []);
        objIndex.get(e.defId).push(e);
      }
    }
    return defs.flatMap((d) => objIndex.get(d) || []);
  }
  const walk = (x, z) => map.isWalkable(x, z);
  const snap = (x, z) => (walk(x, z) ? { x, z } : map.nearestWalkable(x, z, 6));
  const cheb = (ax, az, bx, bz) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));

  // ------------------------------------------------------------------ dialogue trees
  const D = ctx.dialogue;
  for (const t of TRAVELLERS) {
    D?.define?.('traveller_' + t.id, {
      ambient: t.lines,
      nodes: {
        hub: {
          hub: true,
          npc: (c) => pick([`Hello there, {name}! ${t.lines[0]}`, `Oh — hello! ${t.lines[1] || t.lines[0]}`, 'Well met, traveller!']),
          options: [
            { text: 'Where are you headed?', goto: 'where' },
            { text: 'Tell me about yourself.', goto: 'about' },
            { text: 'Any tips for the road?', goto: 'tips' },
            { text: 'Safe travels.', end: true },
          ],
        },
        where: {
          npc: (c) => {
            const e = c.npc;
            const next = e?.trav?.dest?.place || nextPlace(e);
            return next ? `To ${next}, then back again. Same road, different weather.` : 'Wherever the road goes. It usually knows.';
          },
          goto: 'hub',
        },
        about: { npc: t.about, goto: 'hub' },
        tips: { npc: (c) => pick(t.tips), goto: 'hub' },
      },
    });
  }
  // Pip and Grimsby go back a long way.
  D?.extend?.('traveller_pip', {
    topics: [{ text: 'Hermit Grimsby says he kept your whistle.', when: C.any(C.started('ashen_wyrm'), C.done('ashen_wyrm')), goto: 'pip_grimsby' }],
    nodes: {
      pip_grimsby: {
        npc: ['Sir Grimsby? He\'s alive? And he kept my WHISTLE?', '...Tell him thank you. And tell him I\'m sorry about the horse. It wasn\'t the wyrm. It was me. I let it go so it could run. It was a very sensible horse.'],
        goto: 'hub',
      },
    },
  });

  function nextPlace(e) {
    const r = e?.trav?.route;
    if (!r) return null;
    for (let k = 0; k < r.length; k++) { const s = r[(e.trav.i + k) % r.length]; if (s.place) return s.place; }
    return null;
  }

  // ------------------------------------------------------------------ entities
  function spawn(t, idx) {
    const i0 = Math.floor((idx * 7) % t.route.length);
    const s0 = t.route[i0];
    const p = snap(s0.x, s0.z) || { x: s0.x, z: s0.z };
    const def = { id: 'traveller_' + t.id, name: t.name, role: 'Traveller', examine: t.examine, options: ['Talk-to', 'Examine'], dialogue: 'traveller_' + t.id, look: t.look, wander: 0, traveller: true, x: p.x, z: p.z, zone: null };
    const e = {
      uid: 't:' + t.id, kind: 'npc', def, defId: def.id, name: t.name, x: p.x, z: p.z, w: 1, d: 1, yaw: 0,
      home: { x: p.x, z: p.z },
      options: () => def.options,
      examine: () => def.examine,
      pick: { r: 0.45, h: 1.9 },
      state: { busy: true },
      pos: THREE ? new THREE.Vector3() : { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } },
      trav: { t, route: t.route, i: (i0 + 1) % t.route.length, hops: [], path: [], work: 0, wait: 3 + idx * 2, dest: null, lastSay: 0, greeted: 0 },
    };
    const cx = p.x + 0.5, cz = p.z + 0.5;
    e.pos.set(cx, map.heightAt(cx, cz), cz);
    try { e.view = ctx.actors?.create?.({ kind: 'humanoid', look: t.look, npc: true }) || null; } catch (err) { console.error('[travellers] actor', t.id, err); }
    e.view?.setPosition?.(e.pos.x, e.pos.y, e.pos.z);
    ctx.entities?.add?.(e);
    list.push(e);
    return e;
  }
  TRAVELLERS.forEach((t, i) => { try { spawn(t, i); } catch (err) { console.error('[travellers] spawn', t.id, err); } });

  // Plan the hops to the next stop (≤ 14 tiles each, along the straight line = along the road).
  function planTo(e, s) {
    const hops = [];
    const dist = cheb(e.x, e.z, s.x, s.z);
    const n = Math.max(1, Math.ceil(dist / 14));
    for (let k = 1; k <= n; k++) hops.push({ x: Math.round(e.x + ((s.x - e.x) * k) / n), z: Math.round(e.z + ((s.z - e.z) * k) / n) });
    e.trav.hops = hops;
    e.trav.dest = s;
  }
  function pathTo(e, goal) {
    const p = map.findPath(e.x, e.z, goal, { maxNodes: 2500 });
    return p && p.length ? p : null;
  }
  function setAnim(e, anim) {
    e.state.anim = anim || null;
    try { e.view?.play?.(anim || 'idle'); } catch { /* ignore */ }
  }
  function say(e, text) {
    e.trav.lastSay = ctx.ticks?.count || 0;
    ctx.dialogue?.say ? ctx.dialogue.say(e, text) : events.emit('npc:say', { entity: e, text });
  }

  function step(e, n) {
    const tr = e.trav;
    if (ctx.dialogue?.session?.entity === e || e.state.talkHold) { if (e.state.anim) setAnim(e, null); return; }
    if (tr.wait > 0) { tr.wait--; return; }
    // Working at a resource.
    if (tr.work > 0) {
      tr.work--;
      if (tr.work === 0) { setAnim(e, null); tr.wait = 2; if (Math.random() < 0.5) say(e, pick(tr.t.lines)); }
      return;
    }
    // Walking.
    if (tr.path.length) {
      const nx = tr.path[0];
      if (!walk(nx.x, nx.z) || (ctx.player && ctx.player.x === nx.x && ctx.player.z === nx.z)) { tr.path = []; tr.wait = 1; return; }
      tr.path.shift();
      e.moving = { fromX: e.x, fromZ: e.z, toX: nx.x, toZ: nx.z, t0: n };
      e.yaw = Math.atan2(-(nx.x - e.x), -(nx.z - e.z));
      ctx.entities?.moveTo ? ctx.entities.moveTo(e, nx.x, nx.z) : (e.x = nx.x, e.z = nx.z);
      if (!tr.path.length && tr.arrive) { const f = tr.arrive; tr.arrive = null; f(); }
      return;
    }
    if (tr.hops.length) {
      const hop = tr.hops.shift();
      const g = snap(hop.x, hop.z);
      if (!g) return;
      const p = pathTo(e, { x: g.x, z: g.z });
      if (p) tr.path = p;
      else if (!tr.hops.length) tr.wait = 4;
      return;
    }
    // Arrived at a stop: act, then head for the next one.
    const s = tr.dest;
    tr.dest = null;
    if (s?.act && s.act !== 'rest') {
      const objs = objectsOf(s.objs || []).filter((o) => cheb(o.x, o.z, s.x, s.z) <= 12 && !o.state?.depleted);
      objs.sort((a, b) => cheb(a.x, a.z, e.x, e.z) - cheb(b.x, b.z, e.x, e.z));
      const o = objs[0];
      if (o) {
        const p = cheb(e.x, e.z, o.x, o.z) <= 1 ? [] : pathTo(e, { x: o.x, z: o.z, w: o.w || 1, d: o.d || 1, adjacent: true });
        if (p) {
          tr.path = p;
          const begin = () => {
            const cx = o.x + (o.w || 1) / 2 - 0.5, cz = o.z + (o.d || 1) / 2 - 0.5;
            e.yaw = Math.atan2(-(cx - e.x), -(cz - e.z));
            setAnim(e, s.act);
            tr.work = Math.round((s.secs || 12) / 0.6);
          };
          if (!p.length) begin(); else tr.arrive = begin;
        }
      }
    } else if (s?.act === 'rest') {
      // Rest in place (optionally with an animation), then move on.
      if (s.anim) { setAnim(e, s.anim); tr.work = Math.round((s.secs || 6) / 0.6); }
      else tr.wait = Math.round((s.secs || 6) / 0.6);
      if (Math.random() < 0.6) say(e, pick(tr.t.lines));
    }
    const next = tr.route[tr.i];
    tr.i = (tr.i + 1) % tr.route.length;
    planTo(e, next);
  }

  ctx.ticks?.on?.((n) => {
    if (state.mode !== 'play') return;
    for (const e of list) {
      try { step(e, n); } catch (err) { console.error('[travellers] step', e.uid, err); }
      // Greet the player in passing.
      const p = ctx.player;
      if (p && n - e.trav.greeted > 100 && n - e.trav.lastSay > 15 && cheb(p.x, p.z, e.x, e.z) <= 3 && !ctx.dialogue?.session) {
        e.trav.greeted = n;
        say(e, pick([`Morning, ${state.save.name}!`, 'Safe travels!', 'Lovely day for it!', `Oh, hello, ${state.save.name}!`, ...e.trav.t.lines.slice(0, 2)]));
      } else if (n - e.trav.lastSay > 90 + (e.uid.length * 13) % 60 && Math.random() < 0.02 && p && cheb(p.x, p.z, e.x, e.z) < 16) {
        say(e, pick(e.trav.t.lines));
      }
    }
  }, 21);

  return {
    list,
    defs: TRAVELLERS,
    get(id) { return list.find((e) => e.defId === 'traveller_' + id || e.uid === 't:' + id) || null; },
    // entities.update interpolates and animates every npc entity (travellers included) from
    // e.moving / e.state.anim; this fallback only runs if no entities module does.
    update() {
      if (ctx.entities?.update) return;
      const a = ctx.ticks?.alpha ?? 0;
      const tc = ctx.ticks?.count ?? 0;
      for (const e of list) {
        if (e.moving) {
          const k = tc > e.moving.t0 ? 1 : a;
          const x = e.moving.fromX + (e.moving.toX - e.moving.fromX) * k + 0.5;
          const z = e.moving.fromZ + (e.moving.toZ - e.moving.fromZ) * k + 0.5;
          e.pos.set(x, map.heightAt(x, z), z);
          if (k >= 1 && !e.trav.path.length) e.moving = null;
        }
        const v = e.view;
        if (v) {
          v.setPosition?.(e.pos.x, e.pos.y, e.pos.z);
          v.setYaw?.(e.yaw);
          if (!e.state.anim) v.play?.(e.moving ? 'walk' : 'idle');
        }
      }
    },
  };
}
