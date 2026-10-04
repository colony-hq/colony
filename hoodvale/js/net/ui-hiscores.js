// Hiscores window: overall + per skill, from players/{id} documents. Names are resolved for
// display with user.profiles() (never stored). Owner: net builder.

import { SKILLS, SKILL_BY_ID } from '../data/skills.js';
import { injectStyle } from '../core/dom.js';
import { h, netStyles, openNetWindow, netWindow, skillIconEl } from './netui.js';

const WIN = 'net-hiscores';
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');

function styles() {
  netStyles();
  injectStyle('net-hiscores', `
  .nxh-skills { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 4px; }
  .nxh-skills button { display: flex; align-items: center; gap: 5px; padding: 4px 6px; border-radius: 4px; border: 1px solid #000; background: var(--wood-1); color: var(--parch-dim); font: 600 11px/1.1 var(--font-body); cursor: pointer; text-align: left; }
  .nxh-skills button:hover { color: var(--parch); }
  .nxh-skills button.on { background: var(--wood-3); color: var(--brass); box-shadow: inset 0 -2px 0 var(--brass); }
  .nxh-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .nxh-table th { text-align: left; font: 600 10px/1.2 var(--font-body); letter-spacing: .1em; text-transform: uppercase; color: var(--parch-dim); padding: 4px 6px; border-bottom: 1px solid rgba(201,162,74,.25); }
  .nxh-table td { padding: 5px 6px; border-bottom: 1px solid rgba(201,162,74,.08); }
  .nxh-table td.n, .nxh-table th.n { text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .nxh-table tr.me td { background: rgba(201,162,74,.14); color: #fff3cf; }
  .nxh-table .rank { width: 36px; color: var(--parch-dim); font-family: var(--font-mono); }
  .nxh-table tr:nth-child(2) .rank, .nxh-table tr:nth-child(3) .rank, .nxh-table tr:nth-child(4) .rank { color: var(--yellow); }
  `);
}

export function openHiscores(ctx, cloud, skill = null) {
  styles();
  const prev = netWindow(WIN);
  if (prev?.hs) { prev.hs.select(skill); prev.focus(); return prev; }
  const st = { skill, rows: [], meta: { live: false }, off: () => {}, names: {}, body: null, sel: null, status: null };
  const win = openNetWindow(ctx, WIN, {
    title: 'Hiscores of the Vale', width: 560,
    render(el) {
      st.status = h('div.nx-row');
      st.sel = h('div.nxh-skills', { role: 'tablist', 'aria-label': 'Skill' });
      st.body = h('div.nx-scroll', { style: { maxHeight: '52vh' } });
      el.append(st.status, st.sel, st.body, h('div.nx-small.nx-dim', { text: 'Only levels and XP are stored. Names come from each viewer\'s claude.ai profile and are never saved.' }));
    },
  });
  const select = (sk) => {
    st.skill = sk && SKILL_BY_ID[sk] ? sk : null;
    st.off();
    paintSel();
    st.body.replaceChildren(h('div.nx-empty', { text: 'Reading the ledger…' }));
    st.off = cloud.hiscores.subscribe(st.skill, (rows, meta) => {
      if (!win.isOpen()) { st.off(); return; }
      st.rows = rows;
      st.meta = meta;
      paint();
      const ids = rows.map((r) => r.id).filter((id) => id !== 'you');
      if (ids.length && ctx.net) ctx.net.names(ids).then((n) => { st.names = n; if (win.isOpen()) paint(); });
    });
  };
  const paintSel = () => {
    const b = (id, label, color) => h(`button${st.skill === id ? '.on' : ''}`, { type: 'button', role: 'tab', 'aria-selected': String(st.skill === id), onclick: () => select(id) }, [
      id ? skillIconEl(id, color, 18) : h('span', { text: '★', style: { width: '18px', textAlign: 'center', color: 'var(--brass)' } }), label,
    ]);
    st.sel.replaceChildren(b(null, 'Overall'), ...SKILLS.map((s) => b(s.id, s.name, s.color)));
  };
  const paint = () => {
    const me = cloud.selfId();
    const live = st.meta.live;
    st.status.replaceChildren(
      live ? h('span.nx-pill.live', {}, [h('i'), `Shared hiscores · ${st.rows.length} adventurer${st.rows.length === 1 ? '' : 's'}`])
        : h('span.nx-pill.solo', {}, [h('i'), 'Solo — the shared ledger is not available in this view']),
      h('span.nx-grow'),
      h('span.nx-small.nx-dim', { text: st.skill ? SKILL_BY_ID[st.skill].name : 'Overall (total level)' }),
    );
    if (!st.rows.length) { st.body.replaceChildren(h('div.nx-empty', { text: 'No adventurers on the hiscores yet.' })); return; }
    const head = st.skill
      ? h('tr', {}, [h('th', { text: '#' }), h('th', { text: 'Adventurer' }), h('th.n', { text: 'Level' }), h('th.n', { text: 'XP' })])
      : h('tr', {}, [h('th', { text: '#' }), h('th', { text: 'Adventurer' }), h('th.n', { text: 'Total' }), h('th.n', { text: 'Combat' }), h('th.n', { text: 'QP' }), h('th.n', { text: 'XP' })]);
    const rows = st.rows.slice(0, 100).map((r, i) => {
      const isMe = r.id === me || r.id === 'you';
      const name = isMe ? `${st.names[r.id] || ctx.net?.me?.name || ctx.state?.save?.name || 'You'} (you)` : (st.names[r.id] || 'Someone');
      const cells = st.skill
        ? [h('td.n', { text: String(r.lv[st.skill]) }), h('td.n', { text: fmtInt(r.sx[st.skill]) })]
        : [h('td.n', { text: String(r.total) }), h('td.n', { text: String(r.combat) }), h('td.n', { text: String(r.qp) }), h('td.n', { text: fmtInt(r.xp) })];
      return h(`tr${isMe ? '.me' : ''}`, {}, [h('td.rank', { text: String(i + 1) }), h('td', { text: name }), ...cells]);
    });
    st.body.replaceChildren(h('table.nxh-table', {}, [h('thead', {}, [head]), h('tbody', {}, rows)]));
  };
  const prevClose = win.onClose;
  win.onClose = () => { prevClose?.(); st.off(); };
  win.hs = { select };
  select(st.skill);
  // The ui's own frame may close us without a callback: drop the subscription then.
  const watch = setInterval(() => { if (!win.isOpen()) { clearInterval(watch); st.off(); } }, 1000);
  return win;
}
