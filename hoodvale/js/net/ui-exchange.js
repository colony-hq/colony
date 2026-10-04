// The Gildmoor Exchange window: item search, order book, price chart, buy/sell form, your 8
// order slots with collection boxes, and fill history. Owner: net builder.

import { ITEMS, formatCredit } from '../data/items.js';
import { injectStyle } from '../core/dom.js';
import { h, netStyles, banner, openNetWindow, netWindow, closeNetWindow, itemIcon, ago } from './netui.js';
import { npcQuote, planTake } from './market.js';

const WIN = 'net-exchange';
const fc = (mc) => formatCredit(mc);
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');

function styles() {
  netStyles();
  injectStyle('net-exchange', `
  .nxe { gap: 10px; }
  .nxe-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .nxe-grid { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 10px; min-height: 0; }
  .nxe-side { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .nxe-items { max-height: 430px; }
  .nxe-items li { padding: 4px 6px; }
  .nxe-items .p { font: 600 11px/1.2 var(--font-mono); }
  .nxe-items .chg { font: 10px/1.2 var(--font-mono); }
  .nxe-main { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .nxe-quote { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; text-align: center; }
  .nxe-quote > div { background: rgba(0,0,0,.25); border-radius: 4px; padding: 4px; }
  .nxe-quote b { display: block; font: 600 14px/1.2 var(--font-mono); }
  .nxe-quote span { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--parch-dim); }
  .nxe-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 10px; }
  .nxe-book { font: 11px/1.2 var(--font-mono); width: 100%; border-collapse: collapse; }
  .nxe-book td { padding: 3px 4px; position: relative; white-space: nowrap; }
  .nxe-book td:first-child { z-index: 0; }
  .nxe-book tr { cursor: pointer; }
  .nxe-book tr:hover td { background: rgba(201,162,74,.12); }
  .nxe-book .ask td:first-child { color: #ff9a8a; } .nxe-book .bid td:first-child { color: #8fe89a; }
  .nxe-book .bar { position: absolute; inset: 2px auto 2px 0; z-index: -1; border-radius: 2px; opacity: .22; }
  .nxe-book .ask .bar { background: #c0392b; } .nxe-book .bid .bar { background: #3f9a4e; }
  .nxe-book .src { color: var(--parch-dim); font-family: var(--font-body); font-size: 10px; text-align: right; }
  .nxe-book .src.player { color: var(--sky); } .nxe-book .src.you { color: var(--brass); }
  .nxe-book .spread td { color: var(--parch-dim); text-align: center; font-family: var(--font-body); font-size: 10px; cursor: default; background: none !important; padding: 4px; }
  .nxe-form { display: flex; flex-direction: column; gap: 6px; }
  .nxe-form label { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--parch-dim); }
  .nxe-quick { display: flex; gap: 3px; flex-wrap: wrap; }
  .nxe-quick button { padding: 3px 6px; font-size: 10px; }
  .nxe-total { font: 600 13px/1.3 var(--font-mono); color: var(--brass); }
  .nxe-hint { font-size: 11px; line-height: 1.3; color: var(--parch-dim); height: 5.2em; overflow: hidden; }
  .nxe-err { font-size: 12px; color: #ff8a7a; min-height: 2.6em; }
  .nxe-chart { position: relative; }
  .nxe-chart svg { display: block; width: 100%; height: 118px; overflow: visible; }
  .nxe-tip { position: absolute; pointer-events: none; padding: 3px 6px; border-radius: 4px; background: rgba(10,8,6,.92); box-shadow: 0 0 0 1px rgba(201,162,74,.4); font: 11px/1.3 var(--font-mono); white-space: nowrap; transform: translate(-50%, -110%); }
  .nxe-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 10px; color: var(--parch-dim); }
  .nxe-legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: -1px; box-shadow: 0 0 0 2px var(--wood-1); }
  .nxe-legend i.line { width: 14px; height: 2px; border-radius: 1px; box-shadow: none; vertical-align: 2px; }
  .nxe-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
  .nxe-slot { display: flex; flex-direction: column; gap: 5px; }
  .nxe-slot.empty { align-items: center; justify-content: center; min-height: 92px; color: var(--parch-dim); font-style: italic; border: 1px dashed rgba(201,162,74,.2); background: none; box-shadow: none; }
  .nxe-side-badge { font: 700 10px/1 var(--font-body); padding: 3px 6px; border-radius: 3px; text-transform: uppercase; letter-spacing: .08em; }
  .nxe-side-badge.buy { background: #1f5a2c; color: #d6ffd9; } .nxe-side-badge.sell { background: #6a1f1a; color: #ffe0da; }
  .nxe-prog { height: 6px; border-radius: 3px; background: rgba(0,0,0,.45); overflow: hidden; }
  .nxe-prog > i { display: block; height: 100%; background: linear-gradient(90deg, #8a6d2e, var(--brass)); }
  .nxe-prog > i.pend { background: var(--sky); }
  @media (max-width: 700px) {
    .nxe-grid { grid-template-columns: minmax(0, 1fr); }
    .nxe-items { max-height: 170px; }
    .nxe-two { grid-template-columns: minmax(0, 1fr); }
  }
  `);
}

const ui = { st: null };

export function exchangeWindowOpen() { return !!netWindow(WIN); }
export function closeExchangeWindow(ctx) { closeNetWindow(ctx, WIN); }

export function openExchangeWindow(ctx, ex, opts = {}) {
  styles();
  const existing = netWindow(WIN);
  if (existing && ui.st) {
    if (opts.item && ITEMS[opts.item]) selectItem(ui.st, opts.item);
    if (opts.tab) setTab(ui.st, opts.tab);
    existing.focus();
    return existing;
  }
  const st = ui.st = {
    ctx, ex, tab: opts.tab || 'trade', filter: 'featured', query: '',
    item: opts.item && ITEMS[opts.item] ? opts.item : null, side: 'buy', els: {}, dirty: new Set(), timer: 0, offs: [],
  };
  if (!st.item) st.item = ex.inventoryItems()[0]?.id || ex.featured[0];
  const win = openNetWindow(ctx, WIN, { title: 'The Gildmoor Exchange', width: 800, className: 'nxe', render: (el) => build(st, el) });
  st.win = win;
  const on = (name, parts) => st.offs.push(ctx.events.on(name, () => invalidate(st, parts)));
  on('wallet:change', ['top', 'form']);
  on('inventory:change', ['list', 'form', 'detail']);
  on('exchange:change', ['top', 'orders', 'book', 'form', 'history', 'tape', 'tabs']);
  on('exchange:fill', ['chart', 'tape']);
  on('exchange:book', ['book', 'top', 'tape', 'list']);
  on('exchange:status', ['top']);
  on('chain:block', ['detail', 'book', 'chart', 'tape', 'list', 'orders']);
  const prevClose = win.onClose;
  win.onClose = () => { prevClose?.(); cleanup(st); };
  return win;
}

function cleanup(st) {
  for (const off of st.offs.splice(0)) off();
  clearTimeout(st.timer);
  if (ui.st === st) ui.st = null;
}

function invalidate(st, parts) {
  if (!st.win?.isOpen()) { cleanup(st); return; }
  for (const p of parts) st.dirty.add(p);
  if (!st.timer) st.timer = setTimeout(() => { st.timer = 0; flush(st); }, 250);
}

function flush(st) {
  if (!st.win?.isOpen()) { cleanup(st); return; }
  const d = st.dirty;
  st.dirty = new Set();
  if (d.has('top')) paintTop(st);
  if (d.has('tabs')) paintTabs(st);
  if (st.tab === 'trade') {
    if (d.has('list')) paintList(st);
    if (d.has('detail')) paintDetail(st);
    if (d.has('chart')) paintChart(st);
    if (d.has('book')) paintBook(st);
    if (d.has('form')) paintFormInfo(st);
    if (d.has('tape')) paintTape(st);
  } else if (st.tab === 'orders' && d.has('orders')) paintOrders(st);
  else if (st.tab === 'history' && (d.has('history') || d.has('orders'))) paintHistory(st);
}

// ---------------------------------------------------------------------------
function build(st, el) {
  const { ex } = st;
  const E = st.els;
  E.top = h('div.nxe-top');
  E.tabs = h('div.nx-tabs', { role: 'tablist' });
  E.trade = h('div.nxe-grid');
  E.orders = h('div.nx');
  E.history = h('div.nx');

  // Left: search + list
  E.search = h('input.nx-input', { type: 'search', placeholder: 'Search items…', 'aria-label': 'Search tradeable items', enterKeyHint: 'search' });
  E.search.addEventListener('input', () => { st.query = E.search.value; st.filter = st.query ? 'search' : 'featured'; paintFilter(st); paintList(st); });
  E.search.addEventListener('keydown', (e) => e.stopPropagation());
  E.filter = h('div.nx-seg', { role: 'group', 'aria-label': 'Item list' });
  E.list = h('ul.nx-list.nx-scroll.nxe-items');
  const side = h('div.nxe-side', {}, [E.search, E.filter, E.list]);

  // Right: detail
  E.head = h('div.nx-row');
  E.quote = h('div.nxe-quote');
  E.chart = h('div.nxe-chart');
  E.legend = h('div.nxe-legend');
  E.book = h('table.nxe-book', { 'aria-label': 'Order book' });
  E.form = buildForm(st);
  E.tape = h('ul.nx-list');
  const main = h('div.nxe-main', {}, [
    h('div.nx-card', {}, [E.head]),
    E.quote,
    h('div.nx-card', {}, [h('div.nx-row', {}, [h('h3.nx-h.nx-grow', { text: 'Price — last 60 minutes' })]), E.chart, E.legend]),
    h('div.nxe-two', {}, [
      h('div.nx-card', {}, [h('h3.nx-h', { text: 'Order book' }), E.book]),
      h('div.nx-card', {}, [E.form]),
    ]),
    h('div.nx-card', {}, [h('h3.nx-h', { text: 'Recent trades' }), E.tape]),
  ]);
  E.trade.append(side, main);
  el.append(E.top, banner('Simulated testnet — NPC market makers and other players; no real value'), E.tabs, E.trade, E.orders, E.history);
  paintTop(st); paintTabs(st); paintFilter(st); setTab(st, st.tab, true); selectItem(st, st.item, true);
}

function setTab(st, tab, force = false) {
  if (!force && st.tab === tab) return;
  st.tab = tab;
  const E = st.els;
  E.trade.hidden = tab !== 'trade';
  E.orders.hidden = tab !== 'orders';
  E.history.hidden = tab !== 'history';
  paintTabs(st);
  if (tab === 'trade') { paintList(st); paintDetail(st); paintChart(st); paintBook(st); paintFormInfo(st); paintTape(st); }
  if (tab === 'orders') paintOrders(st);
  if (tab === 'history') paintHistory(st);
}

function paintTop(st) {
  const { ex, ctx } = st;
  const s = ex.status();
  const pill = s.mode === 'live'
    ? h('span.nx-pill.live', { title: 'Orders from other players are shared through the artifact database.' }, [h('i'), `Live market · ${s.traders} trader${s.traders === 1 ? '' : 's'} with orders${s.readOnly ? ' · read-only' : ''}`])
    : s.mode === 'connecting' ? h('span.nx-pill.wait', {}, [h('i'), 'Connecting to the shared market…'])
      : h('span.nx-pill.solo', { title: 'No shared database in this view: you trade with NPC market makers.' }, [h('i'), 'NPC market only']);
  const used = ex.orders().length;
  st.els.top.replaceChildren(
    pill,
    h('span.nx-grow'),
    h('span.nx-small.nx-dim', { text: `${ex.MAX_ORDERS - used}/${ex.MAX_ORDERS} slots free` }),
    h('span.nx-pill', {}, [h('span.mono.nx-brass', { text: fc(ctx.wallet?.balance || 0) }), ' CREDIT']),
  );
}

function paintTabs(st) {
  const { ex } = st;
  const box = ex.boxCount();
  const open = ex.orders().filter((o) => o.status === 'open').length;
  const tab = (id, label) => h(`button.hv-tab${st.tab === id ? '.on' : ''}`, { type: 'button', role: 'tab', 'aria-selected': String(st.tab === id), text: label, onclick: () => setTab(st, id) });
  st.els.tabs.replaceChildren(
    tab('trade', 'Trade'),
    tab('orders', `Your orders${open || box ? ` (${open} open${box ? ` · ${box} to collect` : ''})` : ''}`),
    tab('history', 'History'),
  );
}

function paintFilter(st) {
  const b = (id, label) => h(`button${st.filter === id ? '.on' : ''}`, { type: 'button', text: label, onclick: () => { st.filter = id; st.query = ''; st.els.search.value = ''; paintFilter(st); paintList(st); } });
  st.els.filter.replaceChildren(b('featured', 'Popular'), b('mine', 'Your items'));
}

function listIds(st) {
  const { ex } = st;
  if (st.filter === 'search') return ex.search(st.query, 60);
  if (st.filter === 'mine') return ex.inventoryItems().map((x) => x.id);
  return ex.featured;
}

function paintList(st) {
  const { ex, ctx } = st;
  const ids = listIds(st);
  const now = Date.now();
  if (!ids.length) {
    st.els.list.replaceChildren(h('li.nx-empty', { text: st.filter === 'mine' ? 'Nothing tradeable in your inventory.' : 'No tradeable item matches.' }));
    return;
  }
  st.els.list.replaceChildren(...ids.map((id) => {
    const q = ex.quote(id);
    const best = ex.book(id, 1).bestAsk;
    const old = npcQuote(id, now - 3600000).mid;
    const chg = old ? (q.mid / old - 1) * 100 : 0;
    const have = ctx.inventory?.count?.(id) || 0;
    return h(`li.click${id === st.item ? '.on' : ''}`, { onclick: () => selectItem(st, id), title: ITEMS[id].name }, [
      itemIcon(ctx, id, 24),
      h('div.nx-grow', {}, [
        h('div.nx-ell', { text: ITEMS[id].name + (have ? ` (${have})` : '') }),
        h('div.nx-row', { style: { gap: '6px' } }, [h('span.p', { text: fc(best), title: 'Best ask' }), h('span.chg', { class: chg >= 0 ? 'nx-up' : 'nx-down', title: 'NPC mid, last hour', text: `${chg >= 0 ? '▲' : '▼'}${Math.abs(chg).toFixed(1)}%` })]),
      ]),
    ]);
  }));
}

function selectItem(st, id, initial = false) {
  if (!ITEMS[id]) return;
  st.item = id;
  const b = st.ex.book(id);
  const have = st.ctx.inventory?.count?.(id) || 0;
  if (initial && st.side === 'buy' && have > 0 && st.filter === 'mine') st.side = 'sell';
  st.els.price.value = fc(st.side === 'buy' ? b.bestAsk : b.bestBid);
  st.els.qty.value = String(st.side === 'sell' ? Math.max(1, have) : 1);
  st.els.err.textContent = '';
  if (st.tab !== 'trade') setTab(st, 'trade');
  paintList(st); paintDetail(st); paintChart(st); paintBook(st); paintSide(st); paintFormInfo(st); paintTape(st);
}

function paintDetail(st) {
  const { ex, ctx } = st;
  const id = st.item, def = ITEMS[id];
  const tok = ctx.chain?.tokenOf?.(id);
  const have = ctx.inventory?.count?.(id) || 0;
  const banked = ctx.bank?.count?.(id) || 0;
  st.els.head.replaceChildren(
    itemIcon(ctx, id, 40),
    h('div.nx-grow', {}, [
      h('div.nx-row', {}, [h('strong', { text: def.name, style: { fontSize: '16px' } }), tok ? h('button.nx-link.nx-small.mono', { type: 'button', text: tok.symbol, title: 'View token on the explorer', onclick: () => ctx.wallet?.openExplorer?.({ item: id }) }) : null]),
      h('div.nx-dim.nx-small', { text: def.examine || '' }),
      h('div.nx-small', { text: `You have ${fmtInt(have)} in your pack${banked ? ` · ${fmtInt(banked)} banked` : ''} · base value ${fc(def.value)}` }),
    ]),
  );
  const q = ex.quote(id);
  const b = ex.book(id);
  st.els.quote.replaceChildren(
    h('div', {}, [h('span', { text: 'Best bid' }), h('b.nx-up', { text: fc(b.bestBid) })]),
    h('div', {}, [h('span', { text: 'Mid' }), h('b', { text: (q.mid / 1000).toFixed(4) })]),
    h('div', {}, [h('span', { text: 'Best ask' }), h('b.nx-down', { text: fc(b.bestAsk) })]),
  );
}

// ---- Chart ----------------------------------------------------------------------------
function paintChart(st) {
  const { ex } = st;
  const pts = ex.chart(st.item, 60);
  const now = Date.now(), t0 = pts[0].t;
  const trades = ex.tape(st.item).filter((t) => t.at >= t0 && Number.isFinite(t.price));
  const W = 560, H = 118, padL = 6, padR = 44, padT = 8, padB = 18;
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { lo = Math.min(lo, p.mid); hi = Math.max(hi, p.mid); }
  for (const t of trades) { lo = Math.min(lo, t.price); hi = Math.max(hi, t.price); }
  const pad = Math.max((hi - lo) * 0.12, hi * 0.01, 0.5);
  lo = Math.max(0, lo - pad); hi += pad;
  const X = (t) => padL + ((t - t0) / (now - t0 || 1)) * (W - padL - padR);
  const Y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.mid).toFixed(1)}`).join('');
  const area = `${line}L${X(now).toFixed(1)},${H - padB}L${X(t0).toFixed(1)},${H - padB}Z`;
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `${ITEMS[st.item].name} price over the last hour` });
  const defs = s('defs', {});
  const grad = s('linearGradient', { id: 'nxe-area', x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.append(s('stop', { offset: '0', 'stop-color': '#3ad6a0', 'stop-opacity': '0.22' }), s('stop', { offset: '1', 'stop-color': '#3ad6a0', 'stop-opacity': '0' }));
  defs.append(grad);
  svg.append(defs);
  for (const f of [0, 0.5, 1]) {
    const v = lo + (hi - lo) * f;
    svg.append(s('line', { x1: padL, x2: W - padR, y1: Y(v), y2: Y(v), stroke: 'rgba(239,226,196,0.10)', 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke' }));
    const tx = s('text', { x: W - padR + 4, y: Y(v) + 3, fill: '#b9a888', 'font-size': '10', 'font-family': 'Spline Sans Mono, monospace' });
    tx.textContent = (v / 1000).toFixed(v < 100 ? 4 : 3);
    svg.append(tx);
  }
  for (const [t, label, anchor] of [[t0, '60m ago', 'start'], [now, 'now', 'end']]) {
    const tx = s('text', { x: X(t), y: H - 4, fill: '#b9a888', 'font-size': '10', 'text-anchor': anchor, 'font-family': 'Spectral, serif' });
    tx.textContent = label;
    svg.append(tx);
  }
  svg.append(s('path', { d: area, fill: 'url(#nxe-area)' }));
  svg.append(s('path', { d: line, fill: 'none', stroke: '#3ad6a0', 'stroke-width': '2', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }));
  const COL = { you: '#c9a24a', player: '#7fb8e6', sim: '#b9a888' };
  for (const t of trades.slice().reverse()) {
    svg.append(s('circle', { cx: X(t.at), cy: Y(t.price), r: '4', fill: COL[t.src] || COL.sim, stroke: '#1d1510', 'stroke-width': '2', 'vector-effect': 'non-scaling-stroke' }));
  }
  const cross = s('line', { x1: 0, x2: 0, y1: padT, y2: H - padB, stroke: 'rgba(239,226,196,0.45)', 'stroke-width': '1', 'vector-effect': 'non-scaling-stroke', visibility: 'hidden' });
  const dot = s('circle', { r: '4', fill: '#3ad6a0', stroke: '#1d1510', 'stroke-width': '2', visibility: 'hidden', 'vector-effect': 'non-scaling-stroke' });
  svg.append(cross, dot);
  const tip = h('div.nxe-tip', { hidden: true });
  const hide = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    const t = t0 + ((fx - padL) / (W - padL - padR)) * (now - t0);
    let best = pts[0];
    for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    const near = trades.find((tr) => Math.abs(X(tr.at) - fx) < 6);
    cross.setAttribute('x1', X(best.t)); cross.setAttribute('x2', X(best.t));
    dot.setAttribute('cx', X(best.t)); dot.setAttribute('cy', Y(best.mid));
    cross.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
    const mins = Math.round((now - best.t) / 60000);
    tip.textContent = near
      ? `${near.src === 'you' ? 'You' : near.src === 'player' ? 'Player' : 'Sim'} ${near.side} ${near.qty} @ ${fc(near.price)} · ${ago(near.at)}`
      : `mid ${(best.mid / 1000).toFixed(4)} · ${mins ? mins + 'm ago' : 'now'}`;
    tip.hidden = false;
    tip.style.left = `${((X(best.t)) / W) * r.width}px`;
    tip.style.top = `${(Y(best.mid) / H) * r.height}px`;
  });
  svg.addEventListener('pointerleave', hide);
  st.els.chart.replaceChildren(svg, tip);
  st.els.legend.replaceChildren(
    h('span', {}, [h('i.line', { style: { background: '#3ad6a0' } }), 'NPC mid price']),
    h('span', {}, [h('i', { style: { background: COL.you } }), 'your fills']),
    h('span', {}, [h('i', { style: { background: COL.player } }), 'other players']),
    h('span', {}, [h('i', { style: { background: COL.sim } }), 'simulated traders']),
  );
}

// ---- Book --------------------------------------------------------------------------------
function paintBook(st) {
  const { ex, ctx } = st;
  const b = ex.book(st.item, 6);
  const maxQ = Math.max(1, ...b.asks.map((x) => x.qty), ...b.bids.map((x) => x.qty));
  const mineAt = (side, price) => b.mine.some((m) => m.side === side && m.price === price);
  const srcLabel = (L, side) => L.src === 'player' ? (ctx.net?.nameOf?.(L.maker) || 'player') : mineAt(side, L.price) ? 'NPC · you too' : 'NPC';
  const row = (L, cls, side) => h(`tr.${cls}`, { title: `Click to ${cls === 'ask' ? 'buy' : 'sell'} at ${fc(L.price)}`, onclick: () => { st.side = cls === 'ask' ? 'buy' : 'sell'; st.els.price.value = fc(L.price); paintSide(st); paintFormInfo(st); } }, [
    h('td', {}, [h('span.bar', { style: { width: `${Math.max(4, (L.qty / maxQ) * 100)}%` } }), fc(L.price)]),
    h('td', { text: fmtInt(L.qty), style: { textAlign: 'right' } }),
    h(`td.src${L.src === 'player' ? '.player' : ''}`, { text: srcLabel(L, side) }),
  ]);
  // Fixed row count per side so the layout never jumps as liquidity changes block to block.
  const ROWS = 6;
  const blank = () => h('tr', { style: { cursor: 'default' }, 'aria-hidden': 'true' }, [h('td', { html: '&nbsp;', colSpan: 3 })]);
  const asks = b.asks.slice(0, ROWS).reverse().map((L) => row(L, 'ask', 'sell'));
  const bids = b.bids.slice(0, ROWS).map((L) => row(L, 'bid', 'buy'));
  while (asks.length && asks.length < ROWS) asks.unshift(blank());
  while (bids.length && bids.length < ROWS) bids.push(blank());
  const spread = b.bestAsk - b.bestBid;
  const mineRows = b.mine.map((m) => h('tr', { style: { cursor: 'default' } }, [
    h('td', { text: fc(m.price), style: { color: 'var(--brass)' } }), h('td', { text: fmtInt(m.qty), style: { textAlign: 'right' } }), h('td.src.you', { text: `you · ${m.side}` }),
  ]));
  const tbody = h('tbody', {}, [
    h('tr', { style: { cursor: 'default' } }, [h('td.nx-dim', { text: 'Price', style: { fontSize: '10px' } }), h('td.nx-dim', { text: 'Qty', style: { textAlign: 'right', fontSize: '10px' } }), h('td.src', { text: 'From' })]),
    ...(asks.length ? asks : [h('tr.spread', {}, [h('td', { colSpan: 3, text: 'No sellers' })])]),
    h('tr.spread', {}, [h('td', { colSpan: 3, text: `spread ${fc(spread)} (${((spread / Math.max(1, b.mid)) * 100).toFixed(1)}% of mid)` })]),
    ...(bids.length ? bids : [h('tr.spread', {}, [h('td', { colSpan: 3, text: 'No buyers' })])]),
    ...(mineRows.length ? [h('tr.spread', {}, [h('td', { colSpan: 3, text: 'Your open orders' })]), ...mineRows] : []),
  ]);
  st.els.book.replaceChildren(tbody);
}

// ---- Form ---------------------------------------------------------------------------------
function buildForm(st) {
  const E = st.els;
  E.seg = h('div.nx-seg', { role: 'group', 'aria-label': 'Order side' });
  E.qty = h('input.nx-input.mono', { type: 'number', min: '1', step: '1', inputMode: 'numeric', value: '1', 'aria-label': 'Quantity', style: { width: '100%' } });
  E.price = h('input.nx-input.mono', { type: 'number', min: '0.001', step: '0.001', inputMode: 'decimal', value: '0.001', 'aria-label': 'Price per item in CREDIT', style: { width: '100%' } });
  for (const inp of [E.qty, E.price]) {
    inp.addEventListener('input', () => { E.err.textContent = ''; paintFormInfo(st); });
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') submit(st); });
  }
  E.qquick = h('div.nxe-quick');
  E.pquick = h('div.nxe-quick');
  E.total = h('div.nxe-total');
  E.hint = h('div.nxe-hint');
  E.err = h('div.nxe-err', { role: 'status', 'aria-live': 'polite' });
  E.submit = h('button.hv-btn.primary', { type: 'button', onclick: () => submit(st) });
  return h('div.nxe-form', {}, [
    E.seg,
    h('label', { text: 'Quantity' }), E.qty, E.qquick,
    h('label', { text: 'Price each (CREDIT)' }), E.price, E.pquick,
    E.total, E.hint, E.submit, E.err,
  ]);
}

const readQty = (st) => Math.max(0, Math.floor(Number(st.els.qty.value) || 0));
const readPrice = (st) => Math.max(0, Math.round((Number(st.els.price.value) || 0) * 1000));

function paintSide(st) {
  const E = st.els;
  const b = (side, label) => h(`button.${side}${st.side === side ? '.on' : ''}`, { type: 'button', text: label, 'aria-pressed': String(st.side === side), onclick: () => {
    if (st.side === side) return;
    st.side = side;
    const bk = st.ex.book(st.item);
    E.price.value = fc(side === 'buy' ? bk.bestAsk : bk.bestBid);
    if (side === 'sell') E.qty.value = String(Math.max(1, st.ctx.inventory?.count?.(st.item) || 1));
    paintSide(st); paintFormInfo(st);
  } });
  E.seg.replaceChildren(b('buy', 'Buy'), b('sell', 'Sell'));
  const q = (label, fn) => h('button.hv-btn.nx-btn-s', { type: 'button', text: label, onclick: () => { fn(); paintFormInfo(st); } });
  const have = st.ctx.inventory?.count?.(st.item) || 0;
  const addQ = (n) => () => { E.qty.value = String(Math.max(1, readQty(st) + n)); };
  E.qquick.replaceChildren(q('+1', addQ(1)), q('+10', addQ(10)), q('+100', addQ(100)), st.side === 'sell' ? q(`All (${have})`, () => { E.qty.value = String(Math.max(1, have)); }) : q('Max', () => {
    const p = readPrice(st) || 1;
    E.qty.value = String(Math.max(1, Math.floor((st.ctx.wallet?.balance || 0) / p)));
  }));
  const setP = (fn) => () => { const bk = st.ex.book(st.item); E.price.value = fc(Math.max(1, fn(bk))); };
  E.pquick.replaceChildren(
    q('Bid', setP((bk) => bk.bestBid)), q('Ask', setP((bk) => bk.bestAsk)),
    q('−5%', setP(() => Math.floor(readPrice(st) * 0.95))), q('+5%', setP(() => Math.ceil(readPrice(st) * 1.05))),
  );
  E.submit.className = `hv-btn ${st.side === 'buy' ? 'primary' : 'chain'}`;
}

function paintFormInfo(st) {
  const { ex, ctx } = st;
  const E = st.els;
  if (!E.seg.childElementCount) paintSide(st);
  const qty = readQty(st), price = readPrice(st);
  const total = qty * price;
  const def = ITEMS[st.item];
  E.total.textContent = `Total ${fc(total)} CREDIT`;
  E.submit.textContent = `${st.side === 'buy' ? 'Place buy order' : 'Place sell order'}${qty ? ` · ${fmtInt(qty)} × ${def.name}` : ''}`;
  const b = ex.book(st.item, 12);
  const levels = st.side === 'buy' ? b.asks : b.bids;
  const plan = planTake(levels, qty, price, st.side);
  const now = plan.fills.reduce((s, f) => s + f.qty, 0);
  const players = plan.fills.filter((f) => f.src === 'player').reduce((s, f) => s + f.qty, 0);
  let hint = '';
  let problem = '';
  if (!qty || !price) problem = 'Enter a quantity and a price.';
  else if (st.side === 'buy' && total > (ctx.wallet?.balance || 0)) problem = `Not enough CREDIT (you have ${fc(ctx.wallet?.balance || 0)}).`;
  else if (st.side === 'sell' && qty > (ctx.inventory?.count?.(st.item) || 0)) problem = `You have ${fmtInt(ctx.inventory?.count?.(st.item) || 0)} × ${def.name} in your pack.`;
  else if (ex.slotsFree() <= 0) problem = 'All 8 slots are in use — collect or cancel an order.';
  else if (!ex.atDesk()) problem = 'Prices are live everywhere — to place orders, visit an Exchange desk or clerk in Gildmoor.';
  if (!problem) {
    if (now >= qty) hint = `Fills now${players ? ` (${players} from other players, settles in ~1 block)` : ''}. Unused escrow is refunded.`;
    else if (now > 0) hint = `${fmtInt(now)} fill now; ${fmtInt(qty - now)} wait in the book at ${fc(price)} until a market maker or player meets your price.`;
    else hint = `Rests in the book at ${fc(price)} — fills when the price ${st.side === 'buy' ? 'falls' : 'rises'} to meet it. ${st.side === 'buy' ? 'CREDIT' : 'Items'} held in escrow until then.`;
  }
  E.hint.textContent = problem || hint;
  E.hint.style.color = problem ? '#ffb4a8' : '';
  E.submit.disabled = !!problem;
}

function submit(st) {
  const qty = readQty(st), price = readPrice(st);
  const r = st.ex.place({ item: st.item, side: st.side, qty, price });
  st.els.err.textContent = r.ok ? '' : r.error;
  st.els.err.style.color = r.ok ? '' : '#ff8a7a';
  if (r.ok) {
    const done = r.order.status === 'filled' || r.order.status === 'closed' || !st.ex.orders().includes(r.order);
    st.els.err.style.color = 'var(--chain)';
    st.els.err.textContent = done ? 'Order filled and collected.' : r.instant ? `${r.instant} filled instantly; the rest is in your orders.` : r.pending ? 'Settling with another adventurer…' : 'Order placed. Track it under “Your orders”.';
  }
  invalidate(st, ['top', 'tabs', 'book', 'chart', 'tape', 'form', 'list', 'detail']);
}

function paintTape(st) {
  const t = st.ex.tape(st.item).slice(0, 6);
  if (!t.length) { st.els.tape.replaceChildren(h('li.nx-empty', { text: 'No trades yet this session. Simulated traders and other players appear here as blocks arrive.' })); return; }
  st.els.tape.replaceChildren(...t.map((x) => h('li', {}, [
    h('span.nxe-side-badge', { class: x.side, text: x.side }),
    h('span.mono', { text: `${fmtInt(x.qty)} @ ${fc(x.price)}` }),
    h('span.nx-grow.nx-dim.nx-small.nx-ell', { text: x.src === 'you' ? `you · ${x.who}` : x.src === 'player' ? 'another adventurer (live)' : `${x.who} (simulated)` }),
    h('span.nx-dim.nx-small', { text: ago(x.at) }),
  ])));
}

// ---- Orders tab -------------------------------------------------------------------------
function paintOrders(st) {
  const { ex, ctx } = st;
  const orders = ex.orders();
  const cards = [];
  for (let i = 0; i < ex.MAX_ORDERS; i++) {
    const o = orders[i];
    if (!o) { cards.push(h('div.nx-card.nxe-slot.empty', { text: 'Empty slot' })); continue; }
    const def = ITEMS[o.item];
    const pct = (o.filled / o.qty) * 100, pp = (o.pend / o.qty) * 100;
    const boxBits = [];
    if (o.box.credit) boxBits.push(`${fc(o.box.credit)} CREDIT`);
    if (o.box.item) boxBits.push(`${fmtInt(o.box.item)} × ${def.name}`);
    const status = o.status === 'open' ? (o.pend ? 'settling…' : o.live ? 'open · on the shared book' : 'open') : o.status === 'filled' ? 'complete' : o.refundAt ? 'cancelling…' : 'cancelled';
    cards.push(h('div.nx-card.nxe-slot', {}, [
      h('div.nx-row', {}, [
        itemIcon(ctx, o.item, 28),
        h('div.nx-grow', {}, [
          h('div.nx-row', { style: { gap: '6px' } }, [h('span.nxe-side-badge', { class: o.side, text: o.side }), h('button.nx-link.nx-ell', { type: 'button', text: def.name, onclick: () => selectItem(st, o.item) })]),
          h('div.nx-small.mono', { text: `${fmtInt(o.filled)}/${fmtInt(o.qty)} @ ${fc(o.price)}` }),
        ]),
      ]),
      h('div.nxe-prog', { title: `${o.filled} filled${o.pend ? `, ${o.pend} settling` : ''}` }, [h('i', { style: { width: pct + '%', float: 'left' } }), o.pend ? h('i.pend', { style: { width: pp + '%', float: 'left' } }) : null]),
      h('div.nx-small.nx-dim', { text: `${status} · ${ago(o.at)}` }),
      boxBits.length ? h('div.nx-small', { text: `To collect: ${boxBits.join(', ')}`, style: { color: 'var(--yellow)' } }) : null,
      h('div.nx-row', { style: { justifyContent: 'flex-end' } }, [
        boxBits.length ? h('button.hv-btn.chain.nx-btn-s', { type: 'button', text: 'Collect', onclick: () => { ex.collect(o.id); } }) : null,
        o.status === 'open' ? h('button.hv-btn.nx-btn-s', { type: 'button', text: 'Cancel', onclick: () => { ex.cancel(o.id); } }) : null,
      ]),
    ]));
  }
  st.els.orders.replaceChildren(
    h('div.nx-row', {}, [
      h('div.nx-grow.nx-small.nx-dim', { text: 'Fills wait in each order\'s collection box. Collect here or at any bank booth.' }),
      h('button.hv-btn.chain', { type: 'button', text: 'Collect all', disabled: !ex.boxCount(), onclick: () => ex.collectAll() }),
    ]),
    h('div.nxe-slots', {}, cards),
  );
}

function paintHistory(st) {
  const { ex, ctx } = st;
  const hist = ex.history().slice(0, 60);
  st.els.history.replaceChildren(
    h('div.nx-small.nx-dim', { text: 'Your recent fills on the Exchange (every one is also a transaction on the simulated chain).' }),
    hist.length ? h('ul.nx-list', {}, hist.map((x) => h('li.click', { onclick: () => selectItem(st, x.item) }, [
      itemIcon(ctx, x.item, 22),
      h('span.nxe-side-badge', { class: x.side, text: x.side === 'buy' ? 'bought' : 'sold' }),
      h('div.nx-grow.nx-ell', { text: `${fmtInt(x.qty)} × ${ITEMS[x.item]?.name || x.item}` }),
      h('span.mono', { text: `@ ${fc(x.price)}` }),
      h('span.nx-small', { class: x.src === 'player' ? '' : 'nx-dim', style: x.src === 'player' ? { color: 'var(--sky)' } : null, text: x.src === 'player' ? 'player' : 'NPC' }),
      h('span.nx-dim.nx-small', { text: ago(x.at) }),
    ]))) : h('div.nx-empty', { text: 'No trades yet. Buy or sell something on the Trade tab.' }),
  );
}
