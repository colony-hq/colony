// Quest: Ledger of Lies. Giver: Robyn (after The Hood's Oath). Vault key from a vault knight,
// defeat Sheriff Vane in his vault, open the strongbox for the true ledger, bring it to Robyn.
// Wraps the 'Open' option for the vault strongbox (delegating every other object to whoever
// registered 'Open' before), with a polling fallback if another handler wins.

import { C, E } from './dlg-lib.js';

const ID = 'ledger_of_lies';
const ROBYN = { x: 132, z: 160 };
const STAIRS = { x: 269, z: 136 };
let myOpen = null; // our 'Open' handler, installed only if no module (or game default) handles 'Open'

function strongbox(ctx, q, e) {
  const say = (text, kind = 'game') => ctx.events.emit('chat:game', { text, kind });
  const st = q.stage;
  if (st === 'done') { say("The strongbox is empty. The Vale's CREDIT has gone home."); return; }
  if (st == null) { say("The Sheriff's private strongbox. Locked tight, and very much the Sheriff's business."); return; }
  if (st === 1 && !q.has('vault_key')) { say('Locked. Heavy iron, cut for one key — the vault knights carry it.'); return; }
  if (st === 1 || st === 2) {
    if (st === 1) q.advance(1);
    if (!q.data.vaneDown) { say("Sheriff Vane steps between you and the strongbox. 'Mine,' he purrs. Deal with him first.", 'warn'); return; }
    q.set(3);
  }
  if (q.stage === 3) {
    if (!q.has('vault_key')) { say('You need the vault key to open it.', 'warn'); return; }
    q.take('vault_key', 1);
    q.give('sheriff_ledger', 1);
    say('The key turns with a sound like a sigh. Inside, under a nest of IOUs, lies a black-bound book: the true ledger. The key snaps off in the lock.', 'quest');
    q.advance(3);
    return;
  }
  if (q.stage === 4 && !q.has('sheriff_ledger')) { q.give('sheriff_ledger', 1); say('You take the true ledger from the strongbox again. It was right where you left it.', 'quest'); return; }
  say('The strongbox is empty apart from IOUs. Hundreds of them. All signed "V".');
}

export default {
  id: ID,
  steps: [
    { journal: 'Talk to Robyn about the Sheriff.', at: ROBYN },
    { journal: "Get the vault key from a vault knight in the cellars beneath the Sheriff's keep (the stairs are inside the keep).", hint: "Robyn: the vault knights in the cellars under the Sheriff's keep carry the vault key.", at: STAIRS },
    { journal: 'Defeat Sheriff Vane in his vault.', hint: 'You have the vault key. Now deal with Sheriff Vane, who guards his strongbox in the vault.', at: STAIRS },
    { journal: 'Open the strongbox in the vault and take the true ledger.', hint: 'The Sheriff is down. Open his strongbox with the vault key!', at: STAIRS },
    { journal: (q) => (q.has('sheriff_ledger') ? 'Give the true ledger to Robyn at the Hood camp.' : 'You lost the true ledger! It may still be in the strongbox...'), hint: 'You have the true ledger! Bring it to Robyn in Hoodwood.', at: ROBYN },
  ],
  drops: [{ monster: 'vault_knight', item: 'vault_key', text: "A heavy iron key clatters from the vault knight's belt: the vault key!" }],
  completeText: 'The true ledger exposed the Sheriff, and the Hood airdropped the Vale\'s CREDIT back to its people.',

  onStage(q, stage) {
    if (stage === 2 && q.data.vaneDown) setTimeout(() => q.advance(2), 0);
  },
  onComplete(q) {
    const ctx = q.ctx;
    const h = ctx.chain?.height;
    ctx.events.emit('chat:game', { text: `Robinhood Chain${h ? ` block ${h.toLocaleString('en-GB')}` : ''}: the Great Redistribution — 1,024 airdrops from the Hood settle across the Vale. (Simulated.)`, kind: 'chain' });
    ctx.events.emit('redistribution', { by: 'hood' });
  },

  install(ctx, q) {
    ctx.events.on('game:ready', () => {
      const A = ctx.actions;
      if (!A?.register) return;
      if (A.resolve?.({ kind: 'object' }, 'Open')) return; // the game's strongbox handler gives the ledger; we poll
      const prev = A.handlerFor?.({ kind: 'object' }, 'Open') || null;
      const mine = (e) => e?.defId === 'chest_vault';
      myOpen = {
        approach: (e, o) => (mine(e) || !prev?.approach ? { adjacent: true } : prev.approach(e, o)),
        start(e, o) {
          if (mine(e)) { strongbox(ctx, q, e); return false; }
          if (prev) return prev.start ? prev.start(e, o) : true;
          ctx.events.emit('chat:game', { text: "It won't open.", kind: 'game' });
          return false;
        },
        tick: (e, n, c) => (!mine(e) && prev?.tick ? prev.tick(e, n, c) : false),
        stop: (e, o) => { if (!mine(e)) prev?.stop?.(e, o); },
      };
      A.register('Open', myOpen, 'object');
    });
  },

  poll(q) {
    if (q.stage === 1) {
      if (q.has('vault_key')) q.advance(1);
      else if (q.kills('vault_knight') > 0 && !q.viaLoot) { q.give('vault_key', 1); q.msg("The vault knight's belt clanks as he falls: a heavy iron key."); q.advance(1); }
    }
    if ((q.stage === 1 || q.stage === 2) && q.kills('sheriff_vane') > 0) q.data.vaneDown = true;
    if (q.stage === 2 && q.data.vaneDown) q.advance(2);
    if (q.stage === 3 && q.has('sheriff_ledger')) q.advance(3);
  },

  on: {
    kill(p, q) {
      if (p.defId === 'vault_knight' && q.stage === 1 && !q.has('vault_key') && !q.viaLoot) {
        q.give('vault_key', 1);
        q.msg("The vault knight's belt clanks as he falls: a heavy iron key.");
        q.advance(1);
      }
      if (p.defId === 'vault_knight' && (q.stage === 2 || q.stage === 3) && !q.has('vault_key') && !q.viaLoot) {
        q.give('vault_key', 1);
        q.msg('Another vault key. Knights keep spares, apparently.');
      }
      if (p.defId === 'sheriff_vane' && (q.stage === 1 || q.stage === 2)) {
        q.data.vaneDown = true;
        q.msg("Sheriff Vane drops to one knee. 'This is... a temporary... liquidity event...' He scrambles up the stairs, leaving his strongbox unguarded.");
        q.advance(2);
      }
    },
  },

  dialogue(D) {
    D.extend('robyn', {
      greet: [
        { when: C.all(C.notStarted(ID), C.done('hoods_oath')), goto: 'lol_intro' },
        { when: C.stageIn(ID, 1, 2, 3), goto: 'lol_progress' },
        { when: C.all(C.stage(ID, 4), C.has('sheriff_ledger')), goto: 'lol_finish' },
        { when: C.stage(ID, 4), goto: 'lol_lost' },
      ],
      nodes: {
        lol_intro: {
          npc: [
            "You're one of us now, {name}, so I'll tell you the real plan.",
            "The tax ledger told us who's been taxed. But the Sheriff keeps a second book: the true ledger. Every CREDIT he has ever pocketed, in his own hand, locked in a strongbox in his vault under the keep.",
            'Get me that ledger, and we can give it all back. Not a coin here and a coin there. Everything.',
          ],
          goto: 'lol_ask',
        },
        lol_ask: {
          npc: 'Will you do it?',
          options: [
            { text: "I'll get the ledger.", goto: [{ when: C.combat(35), goto: 'lol_accept' }, { goto: 'lol_weak' }] },
            { text: 'How do I get into the vault?', goto: 'lol_how' },
            { text: 'That sounds dangerous.', goto: 'lol_danger' },
            { text: 'Not yet.', end: true },
          ],
        },
        lol_how: {
          npc: [
            'Stairs down from inside the keep, in the north-east corner. The vault knights guard the cellars, and one of them always carries the key.',
            'The Sheriff himself sits by the strongbox at the far end, counting. He likes to count.',
          ],
          goto: [{ when: C.notStarted(ID), goto: 'lol_ask' }],
        },
        lol_danger: {
          npc: [
            'It is. Vault knights in steel. Skeletons that used to owe him money. And Vane himself, who fights dirtier than he taxes.',
            'Bring lobsters. Bring steel. Bring friends, if you have any.',
          ],
          goto: 'lol_ask',
        },
        lol_weak: {
          npc: (c) => `Not yet. The vault would eat you and send me the bill. Come back at combat level 35 — you're ${c.combat()}.`,
          end: true,
        },
        lol_accept: {
          do: E.start(ID),
          lines: [
            'Then go. The key from a vault knight. The Sheriff out of the way. The ledger out of the box.',
            'And {name} — come back. I hate recruiting.',
          ],
          end: true,
        },
        lol_progress: {
          lines: [
            { n: 'The vault knights carry the key. Stairs down inside the keep, north-east corner.', when: C.stage(ID, 1) },
            { n: 'You have the key! Now Vane. He sits by the strongbox like a hen on an egg made of other people\'s money.', when: C.stage(ID, 2) },
            { n: 'Vane ran? Ha! Then open that strongbox before he finds his courage. It\'s usually in someone else\'s pocket.', when: C.stage(ID, 3) },
          ],
          options: [
            { text: 'Remind me how to get in.', goto: 'lol_how' },
            { text: "I'm going.", end: true },
          ],
        },
        lol_lost: { npc: "You had the true ledger and now you don't? Check the strongbox. Vane can't count past his own name, he won't have noticed.", end: true },
        lol_finish: {
          lines: [
            '{name}. Is that...? Give it here.',
            { do: E.take('sheriff_ledger', 1) },
            "'Wind tax, Millbrook: 400.' 'Chair tax, the Wobbly Kettle: 212.' 'Bell-ringing licence, Brightwater: 90.' He taxed the BELL.",
            'Every coin, every name. Tonight, the Hood sends it all home — written on the chain, where anyone can see it. Even the Sheriff.',
            { do: E.complete(ID) },
            { m: 'Across the Vale, wallets chime. On the Robinhood Chain, a thousand small airdrops settle into a single block.' },
            'Here — the Ring of the Ledger. It remembers every coin you touch. Wear it, and remember who these coins belong to.',
          ],
          end: true,
        },
      },
    });
  },
};
