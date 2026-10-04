// Orbio Spire (the Oracle's free talk, Archivist Sol) and the Ashen Highlands (Hermit Grimsby).
// Paid consultations live in oracle.js; quest branches in q-oracles-price / q-ashen-wyrm.

import { C, E } from './dlg-lib.js';

export function registerFrontier(D) {
  // ------------------------------------------------------------------ the Orbio Oracle (talk)
  D.define('oracle', {
    ambient: ['...hmmmmmm...', 'A question approaches.', 'Every answer has a price. Every price has an answer.', 'I am thinking. It is expensive.'],
    nodes: {
      hub: {
        hub: true,
        npc: 'I am the Orbio Oracle: thought, made of light and crystal. Every answer I give costs CREDIT — a little for a spark, more for a beacon. What do you wish?',
        again: 'Ask, and pay, or ask, and go.',
        options: [
          { text: 'I wish to consult you.', do: E.consult(), quiet: true },
          { text: 'What are you?', goto: 'what' },
          { text: 'Why does thinking cost CREDIT?', goto: 'cost' },
          { text: 'What are the tiers of thought?', goto: 'tiers' },
          { text: 'Goodbye.', end: true },
        ],
      },
      what: {
        npc: [
          'Once, I was a seam of orbium under this plateau. The crystal learned to hold a thought, then two, then all of them at once.',
          'The Orbio minds turned thinking into tokens. Each answer burns a few. You call them CREDIT.',
          'I do not sleep. I do not eat. I do occasionally hum. Sol writes that down too.',
        ],
        goto: 'hub',
      },
      cost: {
        npc: [
          'Because thinking is work. A Spark is a small mind, quick and cheap, and often confidently wrong. A Lamp is a middling mind: half right. A Beacon is the full light of the Spire — slow, costly, and worth it.',
          'Pay for whichever mind you like. The Vale has learned, slowly, that the cheapest answer is not always the cheapest answer.',
        ],
        goto: 'hub',
      },
      tiers: {
        npc: [
          'Spark: 0.002 CREDIT. Lamp: 0.010 CREDIT. Beacon: 0.040 CREDIT.',
          'And sometimes, when the stars allow, I can reach past the Vale to a mind that is truly awake. That costs as a Beacon, and answers in its own words.',
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Archivist Sol
  D.define('sol', {
    ambient: ['Noting that.', '...and the Oracle said "hm". Four hundred and one.', "Please don't touch the crystals. They're thinking.", 'Footnote, footnote, footnote.'],
    nodes: {
      hub: {
        hub: true,
        npc: 'Archivist Sol, keeper of the Spire records. Everything the Oracle says, I write down. Everything. Yesterday it said "hm" four hundred times. I have all four hundred.',
        options: [
          { text: 'May I see your sigils?', do: E.shop('arcana'), quiet: true },
          { text: 'How does Arcana work?', goto: 'arcana' },
          { text: 'Tell me about the sigil altar.', goto: 'altar' },
          { text: "What are the Oracle's tiers?", goto: 'tiers' },
          { text: 'What does the Oracle think of you?', goto: 'about' },
          { text: 'Goodbye.', end: true },
        ],
      },
      arcana: {
        lines: [
          'Arcana is the craft of spending thought. Mine orbium shards from the crystals on this plateau, take them to the sigil altar, and inscribe them into sigils.',
          'The higher your level, the more sigils each shard yields. Spells burn sigils: a Spark Bolt costs two spark sigils; a Path to Brightwater, a path sigil and three sparks.',
          { n: 'You must first be taught by the Oracle. It dislikes the untaught pressing its crystals — "misuse of cognition", it says. I wrote it down.', when: C.notDone('oracles_price') },
          { n: 'You were taught by the Oracle itself, so the altar will answer you. Try not to waste it on Spark Bolts at chickens. I\'ve seen it done. I wrote it down.', when: C.done('oracles_price') },
        ],
        goto: 'hub',
      },
      altar: {
        npc: [
          'The altar stands just east of the Spire door. Bring shards, choose your sigil.',
          'Spark at level one, tide at five, stone at nine, ember at fourteen, path at twenty, thought at thirty, insight at fifty. I have a chart. I have eleven charts.',
        ],
        goto: 'hub',
      },
      tiers: {
        npc: [
          'Spark, Lamp, Beacon. I have catalogued nine hundred and twelve Spark answers. Eight hundred and six were wrong.',
          'Six were wrong in a way that turned out to be right. I\'m writing a paper.',
        ],
        goto: 'hub',
      },
      about: {
        lines: [
          "It once called me 'adequate'.",
          "I've had it framed.",
          { n: "Your first inscription is entry four thousand, one hundred and seventeen in my records. I've framed that too. It's a small frame.", when: C.done('oracles_price') },
        ],
        goto: 'hub',
      },
    },
  });

  // ------------------------------------------------------------------ Hermit Grimsby
  D.define('grimsby', {
    ambient: [
      'Gary. Good rock.',
      { t: "Wyrm's restless.", when: C.notDone('ashen_wyrm') },
      'Mutter, mutter, rocks, mutter.',
      { t: 'Quiet up there now. Strange. Nice. Strange.', when: C.done('ashen_wyrm') },
    ],
    nodes: {
      hub: {
        hub: true,
        npc: "Eh? Who's that? Oh. A visitor. I'm Grimsby. I collect rocks. These are my rocks. Don't touch the rocks.",
        again: 'Still here? Rocks are still here too. Don\'t touch them.',
        options: [
          { text: 'Why rocks?', goto: 'rocks' },
          { text: 'Tell me about the highlands.', goto: 'highlands' },
          { text: 'You were a knight?', goto: 'knight' },
          { text: 'Goodbye.', end: true },
        ],
      },
      rocks: {
        npc: [
          "Rocks don't breathe fire. Rocks don't eat your horse. Rocks stay where you put them. I like rocks.",
          "This one's my favourite. His name is Gary.",
        ],
        goto: 'hub',
      },
      highlands: {
        npc: [
          'Trolls to the south, big and grey and very sure of themselves. Stone golems to the north-west, near the peak — they\'ve got Orbio sparks inside, and they remember everything you do to them.',
          'Cobalt and starmetal in the rocks. Yews and elder trees, if your axe can bite them. And under the peak... the wyrm.',
        ],
        goto: 'hub',
      },
      knight: {
        npc: [
          'Sir Grimsby of the Ashen Watch, once. Shining armour, fine horse, a squire called Pip.',
          'Then I went up the peak to slay the wyrm. Came back down without the armour, the horse, or half my beard.',
          'Pip ran off to be a wanderer. Can\'t blame the lad. If you see him, tell him I kept his whistle.',
        ],
        goto: 'hub',
      },
    },
  });
}
