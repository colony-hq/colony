// Shared UI helpers for the net windows/tabs (wallet, explorer, exchange, hiscores, players).
// Owner: net builder. Uses the UI kit in index.html (.hv-*) + its own `.nx-*` styles.
//
// openNetWindow(ctx, id, {title, width, render(el)}) prefers ctx.ui.openWindow (the ui builder's
// window frame). If that does not render (baseline no-op), it builds a fallback .hv-window frame
// in #windows so the feature still works. Content stays in one node we own, so a late render by
// the ui builder simply moves it into their frame.

import { injectStyle, h } from '../core/dom.js';
import { ITEMS } from '../data/items.js';

export { h };

export function netStyles() {
  loadUiIcons();
  injectStyle('net-ui', `
  .nx { font: var(--fs-s)/1.35 var(--font-body); color: var(--parch); display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .nx * { box-sizing: border-box; }
  .nx .mono, .nx .hv-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .nx-banner { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 4px; font: 600 10px/1.2 var(--font-mono); letter-spacing: .08em; text-transform: uppercase;
    color: #c8ffe9; background: repeating-linear-gradient(135deg, rgba(58,214,160,.16) 0 8px, rgba(58,214,160,.06) 8px 16px); box-shadow: inset 0 0 0 1px rgba(58,214,160,.45); }
  .nx-banner b { color: var(--chain); font-weight: 600; }
  .nx-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .nx-row.wrap { flex-wrap: wrap; }
  .nx-grow { flex: 1; min-width: 0; }
  .nx-dim { color: var(--parch-dim); }
  .nx-small { font-size: var(--fs-xs); }
  .nx-up { color: #7fe08a; } .nx-down { color: #ff8a7a; }
  .nx-chain { color: var(--chain); }
  .nx-brass { color: var(--brass); }
  .nx-h { font: 700 var(--fs-s)/1.2 var(--font-body); color: var(--brass); letter-spacing: .03em; margin: 2px 0 0; }
  .nx-card { background: rgba(0,0,0,.22); border-radius: 5px; box-shadow: inset 0 0 0 1px rgba(201,162,74,.18); padding: 8px; min-width: 0; }
  .nx-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px; font: 600 var(--fs-xs)/1.4 var(--font-body); background: rgba(0,0,0,.35); box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); white-space: nowrap; }
  .nx-pill i { width: 7px; height: 7px; border-radius: 50%; background: #777; display: inline-block; }
  .nx-pill.live i { background: var(--chain); box-shadow: 0 0 6px var(--chain); }
  .nx-pill.solo i { background: var(--brass); }
  .nx-pill.wait i { background: var(--sky); animation: nx-blink 1s infinite; }
  @keyframes nx-blink { 50% { opacity: .3; } }
  .nx-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .nx-list > li { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border-bottom: 1px solid rgba(201,162,74,.10); min-width: 0; }
  .nx-list > li:last-child { border-bottom: 0; }
  .nx-list > li.click { cursor: pointer; }
  .nx-list > li.click:hover { background: rgba(201,162,74,.10); }
  .nx-list > li.on { background: rgba(201,162,74,.16); box-shadow: inset 2px 0 0 var(--brass); }
  .nx-ell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nx-link { color: var(--sky); cursor: pointer; text-decoration: underline; text-decoration-color: rgba(127,184,230,.4); text-underline-offset: 2px; background: none; border: 0; padding: 0; font: inherit; }
  .nx-link:hover { color: #b9dcff; }
  .nx-input { font: var(--fs-s)/1.2 var(--font-body); color: var(--parch); background: rgba(0,0,0,.45); border: 1px solid #000; box-shadow: inset 0 0 0 1px rgba(201,162,74,.25); border-radius: 4px; padding: 6px 8px; min-width: 0; user-select: text; -webkit-user-select: text; }
  .nx-input:focus { outline: none; box-shadow: inset 0 0 0 1px var(--brass); }
  .nx-input.mono { font-family: var(--font-mono); }
  .nx-btn-s { padding: 4px 8px; font-size: var(--fs-xs); }
  .nx-seg { display: inline-flex; border-radius: 4px; overflow: hidden; box-shadow: 0 0 0 1px #000; }
  .nx-seg button { border: 0; padding: 6px 12px; font: 700 var(--fs-s)/1 var(--font-body); color: var(--parch-dim); background: var(--wood-1); cursor: pointer; }
  .nx-seg button.on.buy { background: #1f5a2c; color: #d6ffd9; }
  .nx-seg button.on.sell { background: #6a1f1a; color: #ffe0da; }
  .nx-seg button.on { background: var(--wood-3); color: var(--brass); }
  .nx-tabs { display: flex; gap: 2px; flex-wrap: wrap; }
  .nx-tabs .hv-tab { flex: 0 1 auto; padding: 6px 10px; }
  .nx-empty { color: var(--parch-dim); font-style: italic; padding: 10px 4px; text-align: center; }
  .nx-scroll { overflow: auto; scrollbar-width: thin; scrollbar-color: var(--brass-dim) transparent; overscroll-behavior: contain; }
  .nx-token { position: relative; flex: 0 0 auto; border-radius: 50%; display: grid; place-items: center; font: 700 9px/1 var(--font-mono); color: rgba(0,0,0,.65);
    box-shadow: inset 0 0 0 1px rgba(0,0,0,.6), inset 0 2px 0 rgba(255,255,255,.25), 0 1px 2px rgba(0,0,0,.6); }
  .nx-token::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(255,255,255,.22); }
  .hv-window.nx-win { box-sizing: border-box; width: var(--nx-w, 520px); max-height: min(calc(100vh - 16px), 760px); display: flex; flex-direction: column; padding: 12px; gap: 8px; top: 50%; }
  .nx-win > .nx-win-head { display: flex; align-items: center; gap: 8px; padding-right: 30px; }
  .nx-win > .nx-win-body { overflow: auto; min-height: 0; scrollbar-width: thin; scrollbar-color: var(--brass-dim) transparent; }
  .nx-modal { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,.45); pointer-events: auto; z-index: 5; }
  .nx-kv { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; align-items: baseline; }
  .nx-kv > dt { color: var(--parch-dim); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: .06em; }
  .nx-kv > dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .nx-toastline { font-size: var(--fs-xs); color: var(--parch-dim); min-height: 1.3em; }
  @media (max-width: 560px) { .nx-win { padding: 10px; } }
  `);
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------
const openWins = new Map(); // id -> handle

export function openNetWindow(ctx, id, { title, width = 520, render, className = '' } = {}) {
  netStyles();
  const existing = openWins.get(id);
  if (existing && existing.isOpen()) { existing.refresh?.(); existing.focus(); return existing; }
  const content = h(`div.nx${className ? '.' + className : ''}`, { 'data-net-window': id });
  render?.(content);
  let fallback = null;
  let viaUi = false;
  let closed = false;
  const attachToUi = (el) => {
    viaUi = true;
    if (fallback) { fallback.remove(); fallback = null; }
    if (content.parentNode !== el) el.replaceChildren(content);
  };
  try {
    ctx.ui?.openWindow?.(id, {
      title, width, render: attachToUi, className: 'nx-uiwin',
      onClose: () => { if (openWins.get(id) === handle) handle.close(); },
    });
  } catch (err) { console.warn('[net] ui.openWindow failed, using fallback', err); }
  if (!viaUi) {
    const close = h('button.hv-close', { type: 'button', 'aria-label': 'Close', text: '✕', onclick: () => handle.close() });
    fallback = h('div.hv-window.hv-panel.nx-win', { 'data-interactive': '', role: 'dialog', 'aria-label': title || id, style: { '--nx-w': `min(${width}px, calc(100vw - 16px))` } }, [
      h('div.nx-win-head', {}, [h('h2.hv-title', { text: title || '' })]),
      h('div.nx-win-body', {}, [content]),
      close,
    ]);
    fallback.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); handle.close(); } });
    fallback.addEventListener('pointerdown', () => handle.focus());
    (document.getElementById('windows') || document.body).append(fallback);
  }
  const handle = {
    id, content,
    get viaUi() { return viaUi; },
    isOpen() { return content.isConnected; },
    focus() { if (fallback?.parentNode) fallback.parentNode.append(fallback); },
    close() {
      if (closed) return;
      closed = true;
      if (openWins.get(id) === handle) openWins.delete(id);
      if (fallback) { fallback.remove(); fallback = null; }
      if (viaUi) { try { ctx.ui?.closeWindow?.(id); } catch { /* ignore */ } }
      if (content.isConnected) content.remove();
      handle.onClose?.();
    },
    onClose: null,
    refresh: null,
  };
  openWins.set(id, handle);
  return handle;
}

export function closeNetWindow(ctx, id) { openWins.get(id)?.close(); }
export function netWindow(id) { const w = openWins.get(id); return w && w.isOpen() ? w : null; }

// Side-panel tab registration. The ui is created after the net modules, so this registers on
// 'game:ready' (or immediately when ctx.ui already exists). render(el) may be called many times.
export function registerNetTab(ctx, spec) {
  let done = false;
  const go = () => {
    if (done || !ctx.ui?.registerTab) return;
    done = true;
    try { ctx.ui.registerTab(spec); } catch (err) { console.warn('[net] registerTab failed', spec.id, err); }
  };
  if (ctx.ui) go();
  ctx.events.on('game:ready', go);
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------
export function banner(text = 'Simulated testnet — no real network, no real value') {
  return h('div.nx-banner', { role: 'note' }, [h('b', { text: '◆' }), text]);
}

// The ui builder's procedural icons (js/ui/icons.js: itemIcon(id) -> data URL), loaded lazily so a
// problem there can never break the net modules. Until it loads (or if it fails) we draw a token chip.
let uiIcons = null;
let uiIconsAsked = false;
export function loadUiIcons() {
  if (uiIconsAsked) return;
  uiIconsAsked = true;
  import('../ui/icons.js').then((m) => { uiIcons = m; }, () => { uiIcons = null; });
}

export function itemIcon(ctx, id, size = 26) {
  const def = ITEMS[id];
  loadUiIcons();
  try {
    const r = uiIcons?.itemIcon?.(id);
    if (typeof r === 'string' && /^(data:|blob:)/.test(r)) return h('img.nx-icon', { src: r, width: size, height: size, alt: '', draggable: false, style: { flex: '0 0 auto', width: size + 'px', height: size + 'px' } });
  } catch { /* fall through */ }
  const c1 = def?.icon?.color || '#888', c2 = def?.icon?.color2 || shade(c1);
  const letters = (def?.name || '?').replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return h('span.nx-token', { 'aria-hidden': 'true', text: size >= 22 ? letters : '', style: { width: size + 'px', height: size + 'px', background: `radial-gradient(circle at 35% 30%, ${c1}, ${c2})` } });
}
// Skill icon (ui builder's painter when loaded) or a coloured dot.
export function skillIconEl(id, color = '#888', size = 18) {
  loadUiIcons();
  try {
    const r = uiIcons?.skillIcon?.(id);
    if (typeof r === 'string' && /^(data:|blob:)/.test(r)) return h('img', { src: r, width: size, height: size, alt: '', draggable: false, style: { flex: '0 0 auto', width: size + 'px', height: size + 'px' } });
  } catch { /* fall through */ }
  return h('span', { 'aria-hidden': 'true', style: { flex: '0 0 auto', width: (size - 6) + 'px', height: (size - 6) + 'px', margin: '3px', borderRadius: '50%', background: color, boxShadow: '0 0 0 1px #000' } });
}
function shade(hex) {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  const f = (v) => Math.round(v * 0.55);
  return '#' + ((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0');
}

export const shortHash = (hsh, a = 6, b = 4) => (typeof hsh === 'string' && hsh.length > a + b + 2 ? `${hsh.slice(0, a)}…${hsh.slice(-b)}` : String(hsh || ''));

export function ago(at, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const hr = Math.round(m / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

// Clipboard with fallbacks (async API, then execCommand on a hidden textarea).
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall back */ }
  try {
    const ta = h('textarea', { style: { position: 'fixed', left: '-9999px', top: '0', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch { return false; }
}

// Re-render helper: keeps a set of mounted roots, refreshes the connected ones (throttled by the
// caller's update loop), drops detached ones.
export function mounts(renderInto) {
  const set = new Set();
  let dirty = false;
  return {
    mount(el) { set.add(el); renderInto(el); dirty = false; },
    invalidate() { dirty = true; },
    get size() { for (const el of set) if (!el.isConnected) set.delete(el); return set.size; },
    flush(force = false) {
      if (!dirty && !force) return;
      dirty = false;
      for (const el of [...set]) {
        if (!el.isConnected) { set.delete(el); continue; }
        const sc = [...el.querySelectorAll('.nx-scroll')].map((s) => s.scrollTop);
        renderInto(el);
        el.querySelectorAll('.nx-scroll').forEach((s, i) => { if (sc[i]) s.scrollTop = sc[i]; });
      }
    },
  };
}

// A small modal inside a net window body (confirmations without window.confirm).
export function choice(ctx, { title, text, options }) {
  return new Promise((resolve) => {
    const win = openNetWindow(ctx, 'net-choice', {
      title, width: 420,
      render(el) {
        el.append(
          h('p', { text, style: { margin: '0', whiteSpace: 'pre-line' } }),
          h('div.nx-row.wrap', { style: { justifyContent: 'flex-end', marginTop: '6px' } },
            options.map((o, i) => h(`button.hv-btn${i === 0 ? '.primary' : ''}`, { type: 'button', text: o, onclick: () => { done(i); } }))),
        );
      },
    });
    let settled = false;
    const done = (i) => { if (settled) return; settled = true; clearInterval(watch); win.onClose = null; win.close(); resolve(i); };
    win.onClose = () => { if (!settled) { settled = true; clearInterval(watch); resolve(null); } };
    // Closed by the ui's own frame (we get no callback): treat as dismissed.
    const watch = setInterval(() => { if (!win.isOpen() && !settled) { settled = true; clearInterval(watch); resolve(null); } }, 500);
  });
}
