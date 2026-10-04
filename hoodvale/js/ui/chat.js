// Chatbox: tabs All / Game / Public / Oracle / Chain, per-tab "show in All" filters, input line
// (Enter to talk -> ctx.room.say, '::' commands), overhead line for your own chat.
// Desktop: bottom-left box. Phone: a few faded lines over the world + a sheet with the full box.
// Owner: ui builder.

import { injectStyle, h } from '../core/dom.js';
import { esc, formatCredit, safe } from './util.js';
import { tabSvg } from './icons.js';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'game', label: 'Game' },
  { id: 'public', label: 'Public' },
  { id: 'oracle', label: 'Oracle' },
  { id: 'chain', label: 'Chain' },
];
const KIND_TAB = { chain: 'chain', oracle: 'oracle', public: 'public', private: 'public' };

const CSS = `
.u-chat { position: absolute; left: 8px; bottom: 8px; width: min(530px, calc(100vw - 284px)); pointer-events: auto; padding: 6px; box-sizing: border-box; display: flex; flex-direction: column; gap: 4px; }
.u-chatlog { height: 124px; overflow-y: auto; padding: 4px 8px; font: 14px/1.32 var(--font-body); overscroll-behavior: contain; user-select: text; -webkit-user-select: text; }
.u-chatlog > div { color: #efe2c4; text-shadow: 1px 1px 0 rgba(0,0,0,.85); overflow-wrap: anywhere; }
.u-chatlog .t-warn { color: #ff8f7f; } .u-chatlog .t-loot { color: #ffd34d; } .u-chatlog .t-quest { color: #9be88a; }
.u-chatlog .t-chain { color: #5fe8b8; } .u-chatlog .t-oracle { color: #c9b9ff; } .u-chatlog .t-level { color: #ffcf6a; }
.u-chatlog .t-system { color: #9fc8ff; } .u-chatlog .t-dim { color: #a8977a; }
.u-chatlog .who { color: #ffe08a; font-weight: 700; } .u-chatlog .pub { color: #a9d6ff; }
.u-chatlog .hash { font: 11px var(--font-mono); color: #7fbfa8; }
.u-chatin { display: flex; align-items: center; gap: 6px; padding: 0 8px; height: 26px; font: 600 14px/1 var(--font-body); color: #ffe08a; cursor: text; border-top: 1px solid rgba(201,162,74,.18); }
.u-chatin input { flex: 1; min-width: 0; background: transparent !important; border: 0 !important; box-shadow: none !important; padding: 2px 0 !important; color: #a9d6ff !important; font: 14px var(--font-body) !important; user-select: text; -webkit-user-select: text; }
.u-chatin input::placeholder { color: rgba(239,226,196,.35); font-style: italic; }
.u-chattabs { display: flex; gap: 3px; }
.u-ctab { position: relative; flex: 1; height: 24px; border: 0; cursor: pointer; border-radius: 5px; font: 700 12px/1 var(--font-body); color: #bf9f5c;
  background: linear-gradient(180deg, #3b2c20, #261c14); box-shadow: inset 0 0 0 1px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,220,160,.08); }
.u-ctab:hover { color: #ffe7a8; }
.u-ctab.on { color: #ffe7a8; background: linear-gradient(180deg, #7a2f20, #4a1a10); box-shadow: inset 0 0 0 1px var(--brass); }
.u-ctab .f { display: block; font: 600 9px/1 var(--font-body); color: #8fd37a; margin-top: 1px; }
.u-ctab .f.off { color: #e0705a; }
.u-ctab.new::after { content: ''; position: absolute; right: 5px; top: 5px; width: 6px; height: 6px; border-radius: 50%; background: #ffd34d; box-shadow: 0 0 0 1px #000; }
.u-chat.collapsed .u-chatlog, .u-chat.collapsed .u-chatin { display: none; }

.u-chatmini { display: none; }
[data-layout=phone] .u-chat { left: 0; right: 0; width: auto; bottom: calc(50px + env(safe-area-inset-bottom, 0px)); border-radius: 12px 12px 0 0; z-index: 2; transition: transform .18s var(--ease), opacity .18s; }
[data-layout=phone] .u-chat.closed { transform: translateY(20px); opacity: 0; pointer-events: none; visibility: hidden; }
[data-layout=phone] .u-chatlog { height: min(230px, 32vh); font-size: 14px; }
[data-layout=phone] .u-chatin { height: 34px; }
[data-layout=phone] .u-ctab { height: 30px; }
[data-layout=phone] .u-chatmini { display: block; position: absolute; left: 6px; bottom: calc(56px + env(safe-area-inset-bottom, 0px)); width: min(300px, 72vw); pointer-events: none;
  font: 600 12.5px/1.3 var(--font-body); }
[data-layout=phone] .u-chatmini > div { color: #fff; text-shadow: 1px 1px 0 #000, 0 0 3px #000, 0 0 6px rgba(0,0,0,.7); animation: u-mini 9s linear forwards; overflow-wrap: anywhere; }
@keyframes u-mini { 0%, 80% { opacity: 1; } 100% { opacity: 0; } }
.u-chatmini .t-warn { color: #ff9f8f !important; } .u-chatmini .t-loot { color: #ffd34d !important; } .u-chatmini .t-quest { color: #a8f09a !important; } .u-chatmini .t-chain { color: #6ff0c0 !important; } .u-chatmini .t-level { color: #ffcf6a !important; }
`;

export function createChat(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-chat', CSS);
  const settings = state.settings;
  settings.uiChat = { inAll: { game: true, public: true, oracle: true, chain: true }, tab: 'all', collapsed: false, ...(settings.uiChat || {}) };
  const cfg = settings.uiChat;

  const el = h('div.u-chat.u-frame', { 'data-interactive': '' });
  const log = h('div.u-chatlog.u-inset', { role: 'log', 'aria-live': 'polite' });
  const who = h('span', { text: 'You:' });
  const input = h('input', { type: 'text', maxlength: '120', placeholder: 'Press Enter to chat', 'aria-label': 'Chat message', autocomplete: 'off', spellcheck: 'false' });
  const inRow = h('div.u-chatin', {}, [who, input]);
  const tabRow = h('div.u-chattabs');
  el.append(log, inRow, tabRow);
  const mini = h('div.u-chatmini');
  U.hud.root.append(el, mini);
  inRow.addEventListener('click', () => input.focus());

  const msgs = []; // { html, kind, tab, inAll, at }
  const tabBtns = {};
  let tab = TABS.some((t) => t.id === cfg.tab) ? cfg.tab : 'all';
  let sheetOpen = false;
  const commands = new Map();

  for (const t of TABS) {
    const b = h('button.u-ctab', { 'data-tab': t.id }, [h('span', { text: t.label })]);
    if (t.id !== 'all') b.append(h('span.f'));
    b.addEventListener('click', () => selectTab(t.id, true));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); tabMenu(t.id, e.clientX, e.clientY); });
    tabRow.append(b);
    tabBtns[t.id] = b;
  }
  function refreshTabs() {
    for (const t of TABS) {
      const b = tabBtns[t.id];
      b.classList.toggle('on', t.id === tab);
      const f = b.querySelector('.f');
      if (f) { const on = cfg.inAll[t.id] !== false; f.textContent = on ? 'On' : 'Hidden'; f.classList.toggle('off', !on); }
    }
  }
  function tabMenu(id, x, y) {
    if (id === 'all') return;
    const on = cfg.inAll[id] !== false;
    U.menu.open(x, y, [
      { html: `<span class="o">${on ? 'Hide' : 'Show'} ${id} messages in All</span>`, onSelect: () => { cfg.inAll[id] = !on; state.saveSettings(); refreshTabs(); render(); } },
      { html: `<span class="o">Clear ${id} history</span>`, onSelect: () => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].tab === id) msgs.splice(i, 1); render(); } },
      { html: '<span class="o">Cancel</span>', cancel: true },
    ], { title: TABS.find((t) => t.id === id).label });
  }
  function selectTab(id, user = false) {
    if (user && id === tab && U.layout !== 'phone') {
      cfg.collapsed = !el.classList.contains('collapsed');
      el.classList.toggle('collapsed', cfg.collapsed);
      state.saveSettings();
      return;
    }
    tab = id; cfg.tab = id;
    el.classList.remove('collapsed'); cfg.collapsed = false;
    tabBtns[id].classList.remove('new');
    refreshTabs();
    render();
    if (user) state.saveSettings();
  }
  const visible = (m) => (tab === 'all' ? m.inAll && cfg.inAll[m.tab] !== false : m.tab === tab);
  function line(m) { return h('div', { class: 't-' + m.kind, html: m.html }); }
  function render() {
    log.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const m of msgs) if (visible(m)) frag.append(line(m));
    log.append(frag);
    log.scrollTop = log.scrollHeight;
  }
  function push(html, kind = 'game', { tabId = null, inAll = true } = {}) {
    const m = { html, kind, tab: tabId || KIND_TAB[kind] || 'game', inAll, at: Date.now() };
    msgs.push(m);
    if (msgs.length > 250) msgs.splice(0, msgs.length - 200);
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    if (visible(m)) {
      log.append(line(m));
      while (log.children.length > 200) log.firstChild.remove();
      if (nearBottom) log.scrollTop = log.scrollHeight;
    } else if (m.tab !== tab && tab !== 'all') tabBtns[m.tab]?.classList.add('new');
    if (m.inAll && cfg.inAll[m.tab] !== false) {
      const d = line(m);
      mini.append(d);
      while (mini.children.length > 3) mini.firstChild.remove();
      setTimeout(() => d.remove(), 9100);
    }
    return m;
  }

  // ---- sending ----
  function send(text) {
    text = text.trim();
    if (!text) return;
    if (text.startsWith('::')) { runCommand(text.slice(2)); return; }
    const name = state.save.name || 'You';
    push(`<span class="who">${esc(name)}:</span> <span class="pub">${esc(text)}</span>`, 'public');
    U.overlay?.say(ctx.player?.entity, text, { secs: 5, kind: 'pub' });
    events.emit('chat:self', { text });
    let sent = false;
    try { sent = !!ctx.room?.say?.(text); } catch (err) { console.warn('[ui] room.say failed', err); }
    if (!sent && !chat._soloNoted) { chat._soloNoted = true; push('Nobody else can hear you right now — you are playing solo.', 'system', { tabId: 'public' }); }
  }
  function runCommand(line) {
    const [cmd, ...args] = line.trim().split(/\s+/);
    const c = commands.get((cmd || '').toLowerCase());
    if (!c) { push(`Unknown command "::${esc(cmd || '')}". Type ::help for a list.`, 'warn'); return; }
    try { c.fn(args, line); } catch (err) { push(`Command failed: ${esc(err.message)}`, 'warn'); }
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); const t = input.value; input.value = ''; send(t); input.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); input.value = ''; input.blur(); }
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
  input.addEventListener('focus', () => { if (el.classList.contains('collapsed')) selectTab(tab); });

  // ---- incoming ----
  events.on('chat:game', ({ text, kind = 'game', html } = {}) => chat.message(text, kind, { html }));
  events.on('chat:public', ({ from, text, self }) => {
    if (self) return;
    push(`<span class="who">${esc(from || 'Someone')}:</span> <span class="pub">${esc(text)}</span>`, 'public');
  });
  events.on('wallet:change', ({ delta, reason, tx }) => {
    if (!delta) return;
    const hash = tx?.hash ? ` <span class="hash">${esc(tx.hash.slice(0, 8))}…${esc(tx.hash.slice(-4))}</span>` : '';
    push(`${delta > 0 ? '+' : '−'}${formatCredit(Math.abs(delta))} CREDIT · ${esc(reason || 'transfer')}${hash}`, 'chain', { tabId: 'chain', inAll: false });
  });
  events.on('oracle:answer', ({ tier, live, text, question } = {}) => {
    if (!text) return;
    push(`<b>Oracle</b> <span class="t-dim">(${esc(tier || 'spark')}${live ? ', live' : ''})</span>: ${esc(text)}`, 'oracle');
  });
  events.on('save:loaded', () => { who.textContent = (state.save.name || 'You') + ':'; });

  // ---- built-in commands ----
  const cmd = (name, help, fn) => commands.set(name, { help, fn });
  cmd('help', 'list commands', () => {
    push('Commands:', 'system');
    for (const [n, c] of commands) push(`::${esc(n)} — ${esc(c.help)}`, 'system');
  });
  cmd('clear', 'clear the chat', () => { msgs.length = 0; render(); });
  cmd('pos', 'show your tile coordinates', () => { const p = ctx.player; push(`You are at tile ${p?.x}, ${p?.z} (${esc(U.hud.region.textContent || '')}).`, 'system'); });
  cmd('fps', 'show frame rate and quality', () => { const s = ctx.engine.stats; push(`${s.fps.toFixed(0)} fps · ${s.drawCalls} draw calls · quality ${ctx.engine.quality}`, 'system'); });
  cmd('map', 'open the world map', () => U.ui.openWorldMap());
  cmd('quality', 'set graphics: low | medium | high | auto', ([q]) => { if (!['low', 'medium', 'high', 'auto'].includes(q)) { push('Usage: ::quality low | medium | high | auto', 'warn'); return; } U.settings?.setQuality(q); push(`Graphics quality: ${q}.`, 'system'); });
  cmd('xpdrops', 'toggle XP drops', () => { state.settings.showXpDrops = !state.settings.showXpDrops; state.saveSettings(); push(`XP drops ${state.settings.showXpDrops ? 'on' : 'off'}.`, 'system'); });
  cmd('played', 'show your play time', () => { const t = state.save.stats?.playTime || 0; push(`You have played for ${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m.`, 'system'); });

  const chat = {
    el, input,
    message(text, kind = 'game', { html } = {}) { return push(html || esc(text), kind); },
    push,
    registerCommand(name, fn, help = '') { commands.set(String(name).toLowerCase(), { help, fn }); },
    focus() { if (U.layout === 'phone') chat.openSheet(); el.classList.remove('collapsed'); input.focus(); },
    get typing() { return document.activeElement === input; },
    openSheet() { sheetOpen = true; el.classList.remove('closed'); U.side?.closeSheet?.(); chatBtn.classList.add('on'); log.scrollTop = log.scrollHeight; },
    closeSheet() { sheetOpen = false; if (U.layout === 'phone') el.classList.add('closed'); chatBtn.classList.remove('on'); input.blur(); },
    get sheetOpen() { return sheetOpen; },
    applyLayout() {
      if (U.layout === 'phone') { el.classList.toggle('closed', !sheetOpen); el.classList.remove('collapsed'); }
      else { el.classList.remove('closed'); el.classList.toggle('collapsed', !!cfg.collapsed); }
    },
  };
  // Phone: a chat button in the bottom bar.
  const chatBtn = h('button.u-tab', { 'aria-label': 'Chat', html: tabSvg('chat') });
  chatBtn.addEventListener('click', () => (sheetOpen ? chat.closeSheet() : chat.openSheet()));
  U.side.addBarButton(chatBtn);

  refreshTabs();
  if (cfg.collapsed) el.classList.add('collapsed');
  push('Welcome to <b>Hoodvale</b>. Robinhood Chain here is <i>simulated</i>: no real value moves.', 'system', { tabId: 'game' });
  return chat;
}
