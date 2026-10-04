// Hood Wallet side-panel tab + the block explorer window. Owner: net builder.
// Everything shown here is from the simulated chain (js/net/chain.js) and says so.

import { ITEMS, formatCredit } from '../data/items.js';
import { h, netStyles, banner, shortHash, ago, copyText, openNetWindow, netWindow, mounts, itemIcon } from './netui.js';

export const walletTabIcon = 'wallet';

const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const credit = (mc, sign = false) => `${formatCredit(mc, { sign })} CREDIT`;

function addrLink(ctx, addr, onGo) {
  const label = ctx.chain?.label?.(addr) || '';
  return h('span.nx-ell', { style: { display: 'inline-flex', gap: '6px', alignItems: 'baseline', maxWidth: '100%' } }, [
    h('button.nx-link.mono', { type: 'button', text: shortHash(addr, 8, 6), title: addr, onclick: (e) => { e.stopPropagation(); onGo({ address: addr }); } }),
    label ? h('span.nx-dim.nx-small.nx-ell', { text: label }) : null,
  ]);
}

function copyButton(text, label = 'Copy') {
  const b = h('button.hv-btn.nx-btn-s', { type: 'button', text: label });
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await copyText(text);
    b.textContent = ok ? 'Copied' : 'Select & copy';
    if (!ok) {
      const field = b.parentElement?.querySelector('[data-copy-field]');
      if (field) { field.focus(); field.select?.(); }
    }
    setTimeout(() => { b.textContent = label; }, 1600);
  });
  return b;
}

// ---------------------------------------------------------------------------
// Wallet tab
// ---------------------------------------------------------------------------
const walletViews = new WeakMap(); // ctx -> mounts
function walletView(ctx) {
  let v = walletViews.get(ctx);
  if (v) return v;
  v = mounts((el) => paintWallet(ctx, el));
  walletViews.set(ctx, v);
  let timer = 0;
  const later = () => { v.invalidate(); if (!timer) timer = setTimeout(() => { timer = 0; v.flush(); }, 200); };
  ctx.events.on('wallet:change', later);
  ctx.events.on('wallet:confirm', later);
  ctx.events.on('save:loaded', later);
  ctx.events.on('chain:block', ({ block }) => {
    if (!v.size) return;
    document.querySelectorAll('[data-net-height]').forEach((s) => { s.textContent = '#' + fmtInt(block.number); });
    document.querySelectorAll('[data-net-tps]').forEach((s) => { s.textContent = (ctx.chain?.tps || 0).toFixed(1) + ' tx/s'; });
  });
  return v;
}

export function renderWalletTab(ctx, el) {
  netStyles();
  walletView(ctx).mount(el);
}

function paintWallet(ctx, el) {
  const w = ctx.wallet, c = ctx.chain;
  const go = (t) => openExplorer(ctx, t);
  const bal = w?.balance || 0;
  const addr = c?.address || '';
  const txs = (w?.history?.() || []).slice(0, 25);
  const root = h('div.nx', { style: { gap: '10px' } }, [
    banner('Simulated testnet · no real value'),
    h('div.nx-card', { style: { textAlign: 'center', padding: '10px 8px' } }, [
      h('div.nx-dim.nx-small', { text: 'Balance', style: { textTransform: 'uppercase', letterSpacing: '.12em' } }),
      h('div.mono', { style: { font: '600 26px/1.15 var(--font-mono)', color: 'var(--brass)', marginTop: '2px' } }, [formatCredit(bal), h('span', { text: ' CREDIT', style: { fontSize: '12px', color: 'var(--parch-dim)' } })]),
      h('div.nx-dim.nx-small.mono', { text: `${fmtInt(bal)} milli-CREDIT` }),
    ]),
    h('div.nx-card', {}, [
      h('div.nx-dim.nx-small', { text: 'Your address', style: { marginBottom: '4px' } }),
      h('div.nx-row', {}, [
        h('input.nx-input.mono.nx-grow', { value: addr, readOnly: true, 'data-copy-field': '', 'aria-label': 'Wallet address', style: { fontSize: '11px', padding: '5px 6px' }, onfocus: (e) => e.target.select() }),
        copyButton(addr),
      ]),
      h('div.nx-small.nx-dim', { style: { marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
        h('span', { text: `${c?.info?.name || 'Robinhood Chain'} · sim testnet` }),
        h('span.mono.nx-chain', { 'data-net-height': '', text: '#' + fmtInt(c?.height || 0) }),
        h('span.mono', { 'data-net-tps': '', text: (c?.tps || 0).toFixed(1) + ' tx/s' }),
      ]),
    ]),
    h('div.nx-row', {}, [
      h('h3.nx-h.nx-grow', { text: 'Recent transactions' }),
      h('button.hv-btn.chain.nx-btn-s', { type: 'button', text: 'Explorer', onclick: () => go(null) }),
    ]),
    txs.length
      ? h('ul.nx-list.nx-scroll', { style: { maxHeight: '320px' } }, txs.map((e) => txRow(ctx, e, go)))
      : h('div.nx-empty', { text: 'No transactions yet. Sell something, finish a quest, or pick a pocket.' }),
  ]);
  el.replaceChildren(root);
}

function txRow(ctx, e, go) {
  const pending = e.block == null;
  return h('li.click', { title: e.hash, onclick: () => go({ tx: e.hash }) }, [
    e.item ? itemIcon(ctx, e.item, 22) : h('span', { text: e.delta >= 0 ? '▲' : '▼', class: e.delta >= 0 ? 'nx-up' : 'nx-down', style: { width: '22px', textAlign: 'center', flex: '0 0 auto' } }),
    h('div.nx-grow', {}, [
      h('div.nx-ell', { text: e.reason || (e.delta >= 0 ? 'Received' : 'Sent') }),
      h('div.nx-dim.nx-small.mono.nx-ell', { text: `${pending ? 'pending…' : '#' + fmtInt(e.block)} · ${shortHash(e.hash)} · ${ago(e.at)}` }),
    ]),
    h('div.mono', { class: e.delta >= 0 ? 'nx-up' : 'nx-down', text: formatCredit(e.delta, { sign: true }), style: { flex: '0 0 auto' } }),
  ]);
}

// ---------------------------------------------------------------------------
// Explorer window
// ---------------------------------------------------------------------------
const explorers = new WeakMap(); // ctx -> state

export function openExplorer(ctx, target = null) {
  netStyles();
  let st = explorers.get(ctx);
  if (!st) {
    st = { stack: [], view: { type: 'home', tab: 'blocks' }, body: null, win: null, timer: 0 };
    explorers.set(ctx, st);
    ctx.events.on('chain:block', () => {
      if (!st.win?.isOpen()) return;
      const v = st.view;
      if (v.type === 'home' || (v.type === 'tx' && (!v.tx || v.tx.status === 'pending')) || v.type === 'address') {
        if (!st.timer) st.timer = setTimeout(() => { st.timer = 0; paint(); }, 120);
      }
    });
  }
  const paint = () => paintExplorer(ctx, st);
  st.go = (t, push = true) => {
    if (push && st.view) st.stack.push(st.view);
    if (st.stack.length > 30) st.stack.shift();
    st.view = resolveTarget(ctx, t);
    paint();
    st.body?.closest('.nx-win-body')?.scrollTo?.(0, 0);
  };
  st.back = () => { st.view = st.stack.pop() || { type: 'home', tab: 'blocks' }; paint(); };

  if (!netWindow('net-explorer')) {
    st.stack = [];
    st.view = target ? resolveTarget(ctx, target) : { type: 'home', tab: 'blocks' };
    st.win = openNetWindow(ctx, 'net-explorer', {
      title: 'Ledger Explorer', width: 660,
      render(el) {
        const q = h('input.nx-input.mono.nx-grow', { type: 'search', placeholder: 'Tx hash, address, block # or item', 'aria-label': 'Search the ledger', enterKeyHint: 'search' });
        const doSearch = () => { const r = ctx.chain?.search?.(q.value); st.go(r ? r : { notFound: q.value }); };
        q.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); e.stopPropagation(); });
        st.body = h('div.nx', { 'data-explorer-body': '' });
        el.append(
          banner(),
          h('div.nx-row', {}, [q, h('button.hv-btn.chain', { type: 'button', text: 'Search', onclick: doSearch })]),
          st.body,
        );
      },
    });
  } else if (target) {
    st.go(target);
    st.win?.focus();
    return st.win;
  }
  paint();
  return st.win;
}

function resolveTarget(ctx, t) {
  if (!t) return { type: 'home', tab: 'blocks' };
  if (t.query != null) { const r = ctx.chain?.search?.(t.query); return resolveTarget(ctx, r || { notFound: t.query }); }
  if (t.notFound != null) return { type: 'notfound', query: t.notFound };
  if (t.type === 'tx' || t.tx) return { type: 'tx', hash: t.hash || t.tx };
  if (t.type === 'address' || t.address) return { type: 'address', address: String(t.address).toLowerCase() };
  if (t.type === 'block' || t.block != null) return { type: 'block', number: Number(t.number ?? t.block) };
  if (t.type === 'token' || t.item) return { type: 'token', item: t.item };
  if (t.type === 'home') return { type: 'home', tab: t.tab || 'blocks' };
  return { type: 'home', tab: 'blocks' };
}

function paintExplorer(ctx, st) {
  const body = st.body;
  if (!body?.isConnected) return;
  const c = ctx.chain;
  const v = st.view;
  const go = (t) => st.go(t);
  const nav = h('div.nx-row', {}, [
    st.stack.length ? h('button.hv-btn.nx-btn-s', { type: 'button', text: '← Back', onclick: () => st.back() }) : null,
    h('div.nx-grow.nx-small.nx-dim', {}, [
      `${c.info.name} · ${c.info.network} · `,
      h('span.mono.nx-chain', { text: '#' + fmtInt(c.height) }),
      ` · L1-final ≤ #${fmtInt(c.lastFinal)}`,
    ]),
    v.type !== 'home' ? h('button.hv-btn.nx-btn-s', { type: 'button', text: 'Latest', onclick: () => go({ type: 'home' }) }) : null,
  ]);
  let content;
  if (v.type === 'home') content = homeView(ctx, st);
  else if (v.type === 'block') content = blockView(ctx, v, go);
  else if (v.type === 'tx') content = txView(ctx, v, go);
  else if (v.type === 'address') content = addressView(ctx, v, go);
  else if (v.type === 'token') content = tokenView(ctx, v, go);
  else content = h('div.nx-empty', { text: `Nothing on the ledger matches “${String(v.query || '').slice(0, 80)}”. Try a full tx hash (0x + 64), an address (0x + 40), a block number or an item name.` });
  body.replaceChildren(nav, content);
}

function homeView(ctx, st) {
  const c = ctx.chain;
  const v = st.view;
  const tabs = h('div.nx-tabs', {}, [['blocks', 'Latest blocks'], ['txs', 'Latest transactions'], ['mine', 'My address']].map(([id, label]) =>
    h(`button.hv-tab${v.tab === id ? '.on' : ''}`, { type: 'button', text: label, onclick: () => { st.view = { type: 'home', tab: id }; paintExplorer(ctx, st); } })));
  let list;
  if (v.tab === 'blocks') {
    list = h('ul.nx-list', {}, c.blocks.slice(0, 30).map((b) => h('li.click', { onclick: () => st.go({ block: b.number }) }, [
      h('span.nx-pill.mono', { text: '#' + fmtInt(b.number), style: { minWidth: '92px', justifyContent: 'center' } }),
      h('div.nx-grow', {}, [
        h('div.nx-ell', {}, [`${b.txs.length} tx${b.txs.length === 1 ? '' : 's'}`, h('span.nx-dim', { text: ` · gas ${fmtInt(b.gasUsed)} · batch ${b.batch}` })]),
        h('div.nx-dim.nx-small.mono.nx-ell', { text: shortHash(b.hash, 10, 8) }),
      ]),
      h('div.nx-small.nx-dim', { text: ago(b.at), style: { flex: '0 0 auto' } }),
      h('span.nx-small', { class: b.number <= c.lastFinal ? 'nx-chain' : 'nx-dim', text: b.number <= c.lastFinal ? 'final' : 'soft', style: { flex: '0 0 auto', width: '32px', textAlign: 'right' } }),
    ])));
  } else if (v.tab === 'txs') {
    list = txList(ctx, c.latestTxs(40), (t) => st.go(t));
  } else {
    list = addressView(ctx, { address: c.address }, (t) => st.go(t));
  }
  return h('div.nx', {}, [tabs, list]);
}

function txList(ctx, txs, go, focus = null) {
  if (!txs.length) return h('div.nx-empty', { text: 'No transactions.' });
  return h('ul.nx-list', {}, txs.map((t) => {
    const out = focus && t.from === focus;
    const inn = focus && t.to === focus;
    return h('li.click', { onclick: () => go({ tx: t.hash }) }, [
      t.token ? itemIcon(ctx, t.token.item, 22) : h('span.nx-chain', { text: '◆', style: { width: '22px', textAlign: 'center', flex: '0 0 auto' } }),
      h('div.nx-grow', {}, [
        h('div.nx-ell', {}, [t.memo || t.kind, t.ambient ? h('span.nx-dim.nx-small', { text: ' · simulated' }) : null]),
        h('div.nx-dim.nx-small.nx-ell', { text: `${ctx.chain.label(t.from) || shortHash(t.from)} → ${ctx.chain.label(t.to) || shortHash(t.to)}` }),
      ]),
      h('div', { style: { textAlign: 'right', flex: '0 0 auto' } }, [
        h('div.mono', { class: out ? 'nx-down' : inn ? 'nx-up' : '', text: (out ? '−' : inn ? '+' : '') + formatCredit(t.amount) }),
        h('div.nx-dim.nx-small.mono', { text: t.status === 'pending' ? 'pending' : '#' + fmtInt(t.block) }),
      ]),
    ]);
  }));
}

function kv(rows) {
  const dl = h('dl.nx-kv');
  for (const r of rows) { if (!r || r[1] == null || r[1] === false) continue; dl.append(h('dt', { text: r[0] }), h('dd', {}, [r[1]])); }
  return dl;
}

function blockView(ctx, v, go) {
  const c = ctx.chain;
  const b = c.block(v.number);
  if (!b) {
    const future = v.number > c.height;
    return h('div.nx-card', {}, [h('div.nx-empty', { text: future ? `Block #${fmtInt(v.number)} has not been sequenced yet (head is #${fmtInt(c.height)}).` : `Block #${fmtInt(v.number)} is older than this explorer's window (the last ${c.blocks.length} blocks are kept in the page).` })]);
  }
  return h('div.nx', {}, [
    h('div.nx-card', {}, [
      h('h3.nx-h', { text: `Block #${fmtInt(b.number)}` }),
      kv([
        ['Hash', h('span.mono', { text: b.hash })],
        ['Parent', h('button.nx-link.mono', { type: 'button', text: shortHash(b.parent, 12, 8), onclick: () => go({ block: b.number - 1 }) })],
        ['Time', `${new Date(b.at).toLocaleTimeString('en-GB')} (${ago(b.at)})`],
        ['Transactions', String(b.txs.length)],
        ['Gas used', `${fmtInt(b.gasUsed)} (fees: 0 — sponsored)`],
        ['Sequencer', b.sequencer],
        ['L1 batch', `#${b.batch} · ${b.number <= c.lastFinal ? 'finalized on simulated L1' : 'soft-confirmed (awaiting batch)'}`],
      ]),
    ]),
    txList(ctx, b.txs, go),
  ]);
}

function txView(ctx, v, go) {
  const c = ctx.chain;
  const t = c.tx(v.hash);
  v.tx = t;
  if (!t) return h('div.nx-card', {}, [h('div.nx-empty', { text: 'Transaction not found in this explorer\'s window.' }), h('div.mono.nx-small.nx-dim', { text: String(v.hash || ''), style: { overflowWrap: 'anywhere' } })]);
  const fin = c.finality(t);
  const status = fin === 'pending' ? h('span.nx-pill.wait', {}, [h('i'), 'Pending — next block']) : fin === 'final' ? h('span.nx-pill.live', {}, [h('i'), 'Finalized (simulated L1)']) : h('span.nx-pill', {}, [h('i', { style: { background: 'var(--brass)' } }), 'Included · soft-confirmed']);
  const tok = t.token ? c.tokenOf(t.token.item) : null;
  return h('div.nx', {}, [
    h('div.nx-card', {}, [
      h('div.nx-row', {}, [h('h3.nx-h.nx-grow', { text: 'Transaction' }), status]),
      kv([
        ['Hash', h('div.nx-row', {}, [h('span.mono.nx-grow', { text: t.hash, style: { overflowWrap: 'anywhere', fontSize: '11px' } }), copyButton(t.hash)])],
        ['Block', t.block != null ? h('button.nx-link.mono', { type: 'button', text: '#' + fmtInt(t.block), onclick: () => go({ block: t.block }) }) : 'pending'],
        ['Time', `${new Date(t.at).toLocaleString('en-GB')} (${ago(t.at)})`],
        ['Type', t.kind + (t.ambient ? ' · simulated world activity' : '') + (t.archived ? ' · from your saved history' : '')],
        ['From', addrLink(ctx, t.from, go)],
        ['To', addrLink(ctx, t.to, go)],
        ['Value', h('span.mono.nx-brass', { text: credit(t.amount) })],
        tok ? ['Token', h('span.nx-row', {}, [itemIcon(ctx, t.token.item, 20), h('button.nx-link', { type: 'button', text: `${t.token.qty} × ${tok.name}`, onclick: () => go({ item: t.token.item }) }), h('span.nx-dim.nx-small.mono', { text: `${tok.symbol} · ${tok.standard}` })])] : null,
        ['Memo', t.memo || '—'],
        ['Gas', `${fmtInt(t.gasUsed || 21000)} used · fee 0 (Hood paymaster, simulated)`],
        t.nonce ? ['Nonce', String(t.nonce)] : null,
      ]),
    ]),
  ]);
}

function addressView(ctx, v, go) {
  const c = ctx.chain;
  const self = c.isSelf(v.address);
  const txs = c.txsFor(v.address, 50);
  return h('div.nx', {}, [
    h('div.nx-card', {}, [
      h('h3.nx-h', { text: self ? 'Your address' : c.label(v.address) || 'Address' }),
      kv([
        ['Address', h('div.nx-row', {}, [h('span.mono.nx-grow', { text: v.address, style: { overflowWrap: 'anywhere', fontSize: '11px' } }), copyButton(v.address)])],
        ['Label', c.label(v.address) || 'Unlabelled account'],
        ['Balance', self ? h('span.mono.nx-brass', { text: credit(ctx.wallet.balance) }) : h('span.nx-dim', { text: 'Not tracked (simulated account)' })],
        ['Txs here', `${txs.length}${txs.length >= 50 ? '+' : ''} in this explorer's window`],
      ]),
    ]),
    txList(ctx, txs, go, v.address),
  ]);
}

function tokenView(ctx, v, go) {
  const c = ctx.chain;
  const def = ITEMS[v.item];
  const tok = c.tokenOf(v.item);
  if (!def || !tok) return h('div.nx-empty', { text: 'Unknown token.' });
  const q = ctx.exchange?.quote?.(v.item);
  const held = (ctx.inventory?.count?.(v.item) || 0) + (ctx.bank?.count?.(v.item) || 0);
  const txs = [];
  for (const b of c.blocks) { for (const t of b.txs) if (t.token?.item === v.item) txs.push(t); if (txs.length >= 30) break; }
  return h('div.nx', {}, [
    h('div.nx-card', {}, [
      h('div.nx-row', {}, [itemIcon(ctx, v.item, 36), h('div.nx-grow', {}, [h('h3.nx-h', { text: def.name }), h('div.nx-dim.nx-small', { text: def.examine || '' })])]),
      kv([
        ['Token', `${tok.symbol} · ${tok.standard}`],
        ['Contract', h('button.nx-link.mono', { type: 'button', text: shortHash(tok.contract, 10, 6), onclick: () => go({ address: tok.contract }) })],
        ['You hold', `${fmtInt(held)} (inventory + bank)`],
        ['Base value', credit(def.value)],
        q && def.tradeable !== false ? ['Exchange', h('span', {}, [h('span.mono', { text: `bid ${formatCredit(q.bid)} · ask ${formatCredit(q.ask)} ` }), h('button.nx-link', { type: 'button', text: 'Open on the Exchange', onclick: () => ctx.exchange?.open?.({ item: v.item }) })])] : null,
      ]),
    ]),
    h('h3.nx-h', { text: 'Recent transfers' }),
    txList(ctx, txs, go),
  ]);
}
