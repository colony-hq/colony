// Players side-panel tab: who is in the Vale with you right now (room presence), emotes, invite
// hint, hiscores shortcut. "Solo realm" when the room capability is not available. Owner: net.

import { h, netStyles, mounts } from './netui.js';

export const playersTabIcon = 'players';
const EMOTE_LABELS = { wave: 'Wave', cheer: 'Cheer', bow: 'Bow', dance: 'Dance', clap: 'Clap', laugh: 'Laugh', think: 'Think', shrug: 'Shrug', salute: 'Salute', beckon: 'Beckon' };

const views = new WeakMap();
function view(ctx) {
  let v = views.get(ctx);
  if (v) return v;
  v = mounts((el) => paint(ctx, el));
  views.set(ctx, v);
  let timer = 0;
  const later = () => { v.invalidate(); if (!timer) timer = setTimeout(() => { timer = 0; v.flush(); }, 600); };
  ctx.events.on('room:change', later);
  ctx.events.on('peer:join', later);
  ctx.events.on('peer:leave', later);
  ctx.events.on('mode:change', later);
  return v;
}

export function renderPlayersTab(ctx, el) {
  netStyles();
  view(ctx).mount(el);
}

function paint(ctx, el) {
  const room = ctx.room;
  const s = room?.status?.() || { mode: 'solo', count: 0 };
  const peers = room?.peers || [];
  const others = peers.filter((p) => !p.isMe);
  const pill = s.mode === 'live'
    ? h('span.nx-pill.live', {}, [h('i'), s.connected ? `Live realm · ${others.length + 1} here` : 'Live realm · reconnecting…'])
    : s.mode === 'connecting' ? h('span.nx-pill.wait', {}, [h('i'), 'Looking for other adventurers…'])
      : h('span.nx-pill.solo', {}, [h('i'), 'Solo realm']);
  const rows = peers.map((p) => {
    const canFollow = !p.isMe && p.entity;
    return h(`li${canFollow ? '.click' : ''}`, {
      title: canFollow ? `Follow ${p.name}` : '',
      onclick: canFollow ? () => ctx.actions?.perform?.(p.entity, 'Follow') : null,
    }, [
      h('span', { 'aria-hidden': 'true', style: { width: '9px', height: '9px', borderRadius: '50%', flex: '0 0 auto', background: p.inWorld ? 'var(--chain)' : 'var(--parch-dim)', boxShadow: p.inWorld ? '0 0 5px var(--chain)' : 'none' } }),
      h('div.nx-grow', {}, [
        h('div.nx-ell', {}, [
          p.name,
          p.sameTab ? h('span.nx-brass.nx-small', { text: ' (you)' }) : p.isMe ? h('span.nx-dim.nx-small', { text: ' (your other tab)' }) : null,
          p.guest ? h('span.nx-dim.nx-small', { text: ' · guest' }) : null,
        ]),
        h('div.nx-dim.nx-small.nx-ell', { text: p.inWorld ? [p.charName && p.charName !== p.name ? `as ${p.charName}` : '', p.zone, p.action].filter(Boolean).join(' · ') || 'In the Vale' : 'At the gate (menu)' }),
      ]),
      h('span.nx-small.mono', { text: `lvl ${p.cb}`, style: { flex: '0 0 auto', color: '#9fe7c8' } }),
    ]);
  });
  const solo = s.mode !== 'live';
  el.replaceChildren(h('div.nx', { style: { gap: '10px' } }, [
    h('div.nx-row', {}, [pill]),
    solo ? h('div.nx-card', {}, [
      h('div', { text: s.mode === 'connecting' ? 'Connecting to the room…' : 'You are the only adventurer in this view.' }),
      h('div.nx-small.nx-dim', { style: { marginTop: '4px' }, text: 'Share this artifact with friends (Contributor access) to play together — you will see each other walk the Vale, chat and trade on the Exchange.' }),
    ]) : null,
    h('ul.nx-list.nx-scroll', { style: { maxHeight: '260px' } }, rows),
    others.length ? h('div.nx-small.nx-dim', { text: 'Tap a player to follow them. Right-click them in the world to examine.' }) : null,
    h('h3.nx-h', { text: 'Emotes' }),
    h('div.nx-row.wrap', { style: { gap: '4px' } }, Object.entries(EMOTE_LABELS).map(([id, label]) =>
      h('button.hv-btn.nx-btn-s', { type: 'button', text: label, onclick: () => ctx.events.emit('emote', { name: id }) }))),
    h('div.nx-small.nx-dim', { text: solo ? 'Public chat lights up when others are here.' : 'Public chat: type in the chatbox — everyone here sees it above your head.' }),
    h('div.nx-row', {}, [
      h('button.hv-btn', { type: 'button', text: 'Hiscores', onclick: () => ctx.cloud?.openHiscores?.() }),
      h('button.hv-btn.chain', { type: 'button', text: 'Exchange prices', onclick: () => ctx.exchange?.open?.() }),
    ]),
  ]));
}
