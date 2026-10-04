// Journal: clues, people met, CREDIT ledger, and a parchment map. Owner: npc-ai.
// API: DESIGN.md §7 Journal — createJournal(ctx) -> { isOpen, open(tab), close(), toggle(),
// addClue(clue), update }. Added: tab, setTab(id).
//
// Persists clues to state.progress.clues (dedupe by id; a higher tier replaces a lower one).
// Records people met (flag met_<id>) on dialogue:open, and places seen (flag seen_<place>).

import { injectStyle, h, uiRoot } from '../core/dom.js';
import { NPC_LINES, NPC_IDS, CLUE_TITLES, CLUE_ORDER, clueBase, isVague, makeHelpers } from '../npc/lines.js';
import { TIERS, TIER_ORDER, tierRank, formatCredit } from '../npc/credit.js';
import { LANDMARKS, CHECKPOINTS } from '../world/heightfield.js';
import { JOURNAL_CSS } from './journal-css.js';
import { createJournalMap } from './journal-map.js';

const TABS = [
  { id: 'petunjuk', label: 'Petunjuk' },
  { id: 'warga', label: 'Warga' },
  { id: 'pikiran', label: 'Pikiran' },
  { id: 'peta', label: 'Peta' },
];

const FLAMES = [
  { id: 'tirta', name: 'Api Tirta', where: 'Gua air terjun', x: LANDMARKS.airTerjun.flame.x, z: LANDMARKS.airTerjun.flame.z, color: '#bff6ff', ink: '#2f6f80', glow: 'rgba(160,240,255,.75)' },
  { id: 'bumi', name: 'Api Bumi', where: 'Ruang dalam candi', x: LANDMARKS.candi.chamber.x, z: LANDMARKS.candi.chamber.z, color: '#ffb04a', ink: '#8a3f10', glow: 'rgba(255,170,70,.75)' },
  { id: 'samudra', name: 'Api Samudra', where: 'Kabin kapal karam', x: LANDMARKS.kapalKaram.cabin.x, z: LANDMARKS.kapalKaram.cabin.z, color: '#8fa2ff', ink: '#33408a', glow: 'rgba(143,162,255,.75)' },
];
const FLAME_CLUE = { tirta: 'loc_tirta', bumi: 'loc_bumi', samudra: 'loc_samudra' };

// Places drawn on the map; `always` ones are visible from the start (silhouettes / spawn).
const PLACES = [
  { id: 'kampung', name: 'Kampung', x: 0, z: 158, r: 70, always: true, dx: -30, dy: 12 },
  { id: 'dermaga', name: 'Dermaga', x: 0, z: 222, r: 40, always: true, dx: -34, dy: 2 },
  { id: 'mercusuar', name: 'Mercusuar', x: 200, z: 40, r: 60, always: true, dx: -4, dy: -12, clues: ['mercusuar', 'mercusuar_samar', 'sockets'] },
  { id: 'gunung', name: 'Gunung', x: -40, z: -62, r: 60, always: true },
  { id: 'candi', name: 'Candi', x: 30, z: -138, r: 70, clues: ['loc_bumi', 'loc_bumi_samar', 'pelita_order', 'pelita_order_samar'], dy: -14 },
  { id: 'airterjun', name: 'Air Terjun', x: -156, z: -33, r: 60, clues: ['loc_tirta', 'loc_tirta_samar'], dx: 4, dy: -14 },
  { id: 'kapal', name: 'Kapal Karam', x: -214, z: 150, r: 60, clues: ['loc_samudra', 'loc_samudra_samar'], dx: 6, dy: -14 },
];

const AVATAR = { sarni: '#7a4a5e', darto: '#2f5568', ratih: '#a4472f', laras: '#3d4f78', lamun: '#6f84b8' };
const UNMET_HINT = {
  sarni: 'Kabarnya duduk di dekat api unggun kampung.',
  darto: 'Ada yang memancing di dermaga.',
  ratih: 'Warung di kampung masih buka.',
  laras: 'Seseorang menggambar di dekat candi.',
  lamun: 'Ada cahaya pucat di pintu mercusuar…',
};

function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createJournal(ctx) {
  const { state, events, input } = ctx;
  injectStyle('ui-journal', JOURNAL_CSS);
  const host = uiRoot('journal') || document.body;
  const map = createJournalMap();

  // ---------------------------------------------------------------- DOM
  const tabEls = {};
  const tabsBar = h('div.jr-tabs', { role: 'tablist' });
  for (const t of TABS) {
    const n = h('span.n');
    const el = h('button.jr-tab', { type: 'button', role: 'tab' }, [t.label, n]);
    el.addEventListener('click', () => setTab(t.id));
    tabEls[t.id] = { el, n };
    tabsBar.appendChild(el);
  }
  const switchHint = h('span.sw');
  tabsBar.appendChild(switchHint);
  const sub = h('div.jr-sub');
  const closeBtn = h('button.jr-close', { type: 'button', 'aria-label': 'Tutup jurnal' }, ['Tutup', h('kbd', { text: 'J' })]);
  closeBtn.addEventListener('click', () => close());
  const page = h('div.jr-page', { role: 'tabpanel' });
  const hints = h('div.jr-hints');
  const book = h('section.jr-book', { 'data-interactive': '', role: 'dialog', 'aria-label': 'Jurnal' }, [
    h('div.jr-top', {}, [h('h2.jr-title', { text: 'Jurnal' }), sub, closeBtn]),
    tabsBar, page, hints,
  ]);
  const wrap = h('div.jr', {}, [book]);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  host.appendChild(wrap);

  let tab = 'petunjuk';
  let mapCanvas = null;
  let mapTimer = 0;
  let seenTimer = 0;
  let clock = 0;
  let freshIds = new Set();
  let lastDevice = '';
  let bakeDelay = 2.5;

  const journal = {
    isOpen: false,
    get tab() { return tab; },
    open,
    close,
    toggle() { return journal.isOpen ? close() : open(); },
    setTab,
    addClue,
    update,
  };

  // ---------------------------------------------------------------- data
  function clues() {
    const p = state.progress;
    if (!Array.isArray(p.clues)) p.clues = [];
    return p.clues;
  }

  function addClue(c) {
    if (!c || !c.id || !c.text) return false;
    const list = clues();
    const i = list.findIndex((x) => x.id === c.id);
    const rec = {
      id: c.id, text: c.text, source: c.source || '', tier: TIERS[c.tier] ? c.tier : null, // null = observed, not bought
      kind: c.kind || (CLUE_ORDER.includes(clueBase(c.id)) ? 'petunjuk' : 'catatan'),
      npcId: c.npcId || null, topicId: c.topicId || null, at: Math.round(state.progress.playTime || 0),
    };
    if (i >= 0) {
      if (tierRank(rec.tier) <= tierRank(list[i].tier) && !(rec.tier === null && list[i].tier === null && rec.text !== list[i].text)) return false;
      list[i] = rec;
    } else list.push(rec);
    freshIds.add(rec.id);
    try { state.save(); } catch { /* storage optional */ }
    if (journal.isOpen) render();
    else refreshCounts();
    return true;
  }

  events.on('clue:add', (c) => addClue(c));
  events.on('dialogue:open', ({ npcId } = {}) => {
    if (npcId && !state.flag('met_' + npcId)) state.flag('met_' + npcId, true);
  });
  events.on('credit:change', () => { if (journal.isOpen && tab === 'pikiran') render(); });
  events.on('game:loaded', () => { if (journal.isOpen) render(); });
  events.on('game:reset', () => { freshIds = new Set(); if (journal.isOpen) render(); });
  events.on('mode:change', ({ mode }) => {
    if (journal.isOpen && mode !== 'journal' && mode !== 'pause') hide();
  });

  // ---------------------------------------------------------------- open/close
  function open(t) {
    if (journal.isOpen) { if (t) setTab(t); return true; }
    if (t && TABS.some((x) => x.id === t)) tab = t;
    journal.isOpen = true;
    state.pushMode('journal');
    try { input.exitPointerLock?.(); } catch { /* optional */ }
    wrap.classList.add('on');
    render();
    return true;
  }

  function hide() {
    journal.isOpen = false;
    wrap.classList.remove('on');
    freshIds.clear();
  }

  function close() {
    if (!journal.isOpen) return false;
    hide();
    if (state.mode === 'journal') state.popMode();
    return false;
  }

  function setTab(id) {
    if (!TABS.some((t) => t.id === id)) return;
    tab = id;
    page.scrollTop = 0;
    render();
  }

  // ---------------------------------------------------------------- render
  function refreshCounts() {
    const list = clues();
    const keyCount = new Set(list.map((c) => clueBase(c.id))).size;
    tabEls.petunjuk.n.textContent = String(keyCount);
    tabEls.warga.n.textContent = `${NPC_IDS.filter((id) => state.flag('met_' + id)).length}/${NPC_IDS.length}`;
    tabEls.pikiran.n.textContent = formatCredit(ctx.credit?.balance ?? state.progress.credit.balance);
    tabEls.peta.n.textContent = '';
    tabEls.peta.n.style.display = 'none';
  }

  function refreshHints() {
    lastDevice = input.device;
    const dev = deviceOf();
    const pad = dev === 'gamepad';
    const K = (k) => h('kbd', { text: k });
    closeBtn.lastChild.style.display = dev === 'touch' ? 'none' : '';
    switchHint.replaceChildren(K(pad ? 'LB' : 'A'), K(pad ? 'RB' : 'D'), 'ganti halaman');
    hints.replaceChildren(
      h('span', {}, [K(pad ? '◀ ▶' : '← →'), 'Halaman']),
      h('span', {}, [K(pad ? '▲ ▼' : '↑ ↓'), 'Gulir']),
      h('span', {}, [K(pad ? 'B' : 'Esc'), 'Tutup']),
    );
    closeBtn.lastChild.textContent = pad ? 'Y' : 'J';
  }

  function render() {
    for (const t of TABS) {
      tabEls[t.id].el.classList.toggle('on', t.id === tab);
      tabEls[t.id].el.setAttribute('aria-selected', t.id === tab ? 'true' : 'false');
    }
    refreshCounts();
    refreshHints();
    const H = makeHelpers(state.progress);
    sub.textContent = subtitle(H);
    mapCanvas = null;
    if (tab === 'petunjuk') page.replaceChildren(...renderClues(H));
    else if (tab === 'warga') page.replaceChildren(...renderPeople(H));
    else if (tab === 'pikiran') page.replaceChildren(...renderThoughts());
    else page.replaceChildren(...renderMap(H));
  }

  function subtitle(H) {
    const n = Object.values(state.progress.flames || {}).filter((v) => v === 'placed').length;
    if (H.step === 'done') return 'Kabut sudah terangkat. Pulau ini bertanya lagi.';
    if (n) return `${n} dari 3 Api Pusaka menyala di mercusuar.`;
    if (H.carried) return 'Api Pusaka di tangan. Mercusuar menunggu di timur.';
    return 'Catatan seorang pembawa lentera di pulau berkabut.';
  }

  function tierTag(tier) { return h('span.tag.t-' + tier, { text: TIERS[tier]?.label || tier }); }

  function renderClues(H) {
    const out = [];
    // Flame tracker.
    const track = h('div.jr-track');
    for (const f of FLAMES) {
      const st = state.progress.flames?.[f.id] || 'none';
      const known = H.clue(FLAME_CLUE[f.id]);
      const vague = H.clue(FLAME_CLUE[f.id] + '_samar');
      const status = st === 'placed' ? 'Menyala di mercusuar' : st === 'carried' ? 'Dibawa — antar ke mercusuar' : known ? f.where : vague ? 'Lokasi samar…' : 'Belum diketahui';
      const card = h('div.jr-flame.' + st, {}, [h('i.orb'), h('div', {}, [h('b', { text: f.name }), h('span', { text: status })])]);
      card.style.setProperty('--fc', f.color); // custom properties need setProperty
      track.appendChild(card);
    }
    out.push(track);
    const obj = ctx.quest?.objective?.text;
    if (obj) out.push(h('div.jr-obj', {}, ['Tujuan: ', h('b', { text: obj })]));

    // Group by subject: best tier wins; a precise clue hides its vague version.
    const list = clues();
    const best = new Map();
    for (const c of list) {
      const base = clueBase(c.id);
      const cur = best.get(base);
      const score = (isVague(c.id) ? 0 : 10) + (c.tier ? tierRank(c.tier) : 0);
      if (!cur || score > cur.score) best.set(base, { c, score });
    }
    const entries = [...best.entries()].map(([base, v]) => ({ base, c: v.c }));
    const order = (b) => { const i = CLUE_ORDER.indexOf(b); return i < 0 ? 99 : i; };
    const key = entries.filter((e) => e.c.kind === 'petunjuk').sort((a, b) => order(a.base) - order(b.base) || a.c.at - b.c.at);
    const notes = entries.filter((e) => e.c.kind !== 'petunjuk').sort((a, b) => a.c.at - b.c.at);

    out.push(h('h3.jr-h', {}, ['Petunjuk', h('small', { text: `${key.length} dicatat` })]));
    if (!key.length) {
      out.push(h('div.jr-empty', { html: 'Belum ada petunjuk. Bicaralah dengan warga — dan beranilah membayar untuk pikiran yang <b>terang</b>.' }));
    } else {
      const grid = h('div.jr-clues');
      for (const e of key) grid.appendChild(clueCard(e));
      out.push(grid);
    }
    if (notes.length) {
      out.push(h('div.jr-rule'));
      out.push(h('h3.jr-h', {}, ['Catatan warga', h('small', { text: `${notes.length}` })]));
      const grid = h('div.jr-clues');
      for (const e of notes) grid.appendChild(clueCard(e));
      out.push(grid);
    }
    return out;
  }

  function clueCard({ base, c }) {
    const vague = isVague(c.id);
    const card = h('article.jr-clue.' + (c.tier || 'seen') + (vague ? '.vague' : '') + (freshIds.has(c.id) ? '.new' : ''), {}, [
      h('h4', {}, [CLUE_TITLES[base] || base, vague ? h('span.tag.plain', { text: 'samar' }) : null]),
      h('p', { text: c.text }),
      h('div.src', {}, ['— ' + (c.source || 'Catatan sendiri'), c.tier ? tierTag(c.tier) : h('span.tag.plain', { text: 'diamati' })]),
    ]);
    return card;
  }

  function renderPeople(H) {
    const grid = h('div.jr-people');
    for (const id of NPC_IDS) {
      const n = NPC_LINES[id];
      const met = state.flag('met_' + id);
      const hh = makeHelpers(state.progress, id);
      if (!met) {
        grid.appendChild(h('article.jr-person.unknown', {}, [
          h('div.ava', { text: '?' }),
          h('div', {}, [h('h4', { text: 'Belum ditemui' }), h('div.role', { text: n.where }), h('p', { text: UNMET_HINT[id] })]),
        ]));
        continue;
      }
      const asked = n.topics.map((t) => ({ t, tier: hh.asked(id, t.id) })).filter((x) => x.tier);
      const avail = n.topics.filter((t) => !t.unlock || safe(() => t.unlock(hh))).length;
      const initials = n.name.split(' ').map((w) => w[0]).join('').slice(-2);
      const ava = h('div.ava', { text: initials });
      ava.style.setProperty('--ac', AVATAR[id]);
      grid.appendChild(h('article.jr-person', {}, [
        ava,
        h('div', {}, [
          h('h4', { text: n.name }),
          h('div.role', { text: `${n.role} · ${n.where}` }),
          h('p', { text: n.bio ? n.bio(hh) : '' }),
          h('div.asked', {}, asked.length
            ? [`${asked.length}/${avail} pertanyaan:`, ...asked.map((x) => h('span.tag.t-' + x.tier, { text: x.t.label }))]
            : [`Belum ada yang ditanyakan (${avail} topik terbuka).`]),
        ]),
      ]));
    }
    const met = NPC_IDS.filter((id) => state.flag('met_' + id)).length;
    return [h('h3.jr-h', {}, ['Warga pulau', h('small', { text: `${met} dari ${NPC_IDS.length} ditemui` })]), grid];
  }

  function renderThoughts() {
    const s = ctx.credit?.stats?.() || (() => {
      const c = state.progress.credit;
      return { balance: c.balance, spent: c.spent, earned: c.earned, thoughts: c.thoughts, byTier: c.byTier, byTierSpent: c.byTierSpent || {}, clues: clues().length, perClue: null };
    })();
    const out = [];
    out.push(h('div.jr-purse', {}, [
      h('div.jr-bal', {}, [
        h('div.lbl', { text: 'Saldo pikiran' }),
        h('div.v', {}, [formatCredit(s.balance), h('small', { text: 'CREDIT' })]),
        h('div.sim', { text: 'simulasi · bukan uang sungguhan' }),
      ]),
      h('div.jr-stats', {}, [
        stat('Dibelanjakan', formatCredit(s.spent)),
        stat('Diperoleh', '+' + formatCredit(s.earned)),
        stat('Pikiran dibeli', String(s.thoughts || 0)),
        stat('Rata-rata / petunjuk', s.perClue == null ? '—' : formatCredit(s.perClue)),
      ]),
    ]));

    out.push(h('h3.jr-h', {}, ['Per tingkat terang', h('small', { text: 'jumlah × harga' })]));
    const rows = h('div.jr-tiers');
    const maxSpent = Math.max(0.0001, ...TIER_ORDER.map((t) => (s.byTier?.[t] || 0) * TIERS[t].cost));
    for (const t of TIER_ORDER) {
      const count = s.byTier?.[t] || 0;
      const spent = s.byTierSpent?.[t] ?? count * TIERS[t].cost;
      rows.appendChild(h('div.jr-tierrow.' + t, {}, [
        h('div', {}, [h('div.nm', {}, [h('i'), TIERS[t].label]), h('div.md', { text: TIERS[t].model })]),
        h('div.bar', {}, [h('i', { style: { width: `${Math.round((spent / maxSpent) * 100)}%` } })]),
        h('div.num', { text: `${count} × ${formatCredit(TIERS[t].cost)} = ${formatCredit(spent)}` }),
      ]));
    }
    out.push(rows);

    out.push(h('div.jr-rule'));
    const ledger = (state.progress.credit.ledger || []).slice().reverse();
    out.push(h('h3.jr-h', {}, ['Riwayat transaksi', h('small', { text: `${ledger.length} terakhir` })]));
    if (!ledger.length) {
      out.push(h('div.jr-empty', { text: 'Belum ada pikiran yang dibeli. Setiap pertanyaan ke warga akan tercatat di sini, lengkap dengan struknya.' }));
    } else {
      const list = h('div.jr-ledger');
      for (const e of ledger) {
        if (e.kind === 'earn') {
          const what = e.reason === 'kilau' ? `Kilau hijau${e.count > 1 ? ` ×${e.count}` : ''}` : e.label || e.reason;
          list.appendChild(h('div.jr-lrow', {}, [
            h('span.tm', { text: fmtTime(e.playTime) }),
            h('div.ds', {}, [h('b', { text: what }), h('small', { text: 'pemasukan · simulasi' })]),
            h('span.chipcell'),
            h('span.amt.pos', { text: '+' + formatCredit(e.amount) }),
          ]));
        } else {
          const npc = NPC_LINES[e.npcId];
          const topic = npc?.topics.find((t) => t.id === e.topicId);
          list.appendChild(h('div.jr-lrow', {}, [
            h('span.tm', { text: fmtTime(e.playTime) }),
            h('div.ds', {}, [
              h('b', { text: npc ? `${npc.name} — ${topic?.label || e.topicId}` : e.label || 'Pikiran' }),
              h('small', { text: `${e.model} · ${e.tokens} token · tx ${e.hash} · simulasi` }),
            ]),
            h('span.chipcell', {}, [tierTag(e.tier)]),
            h('span.amt.neg', { text: formatCredit(-e.cost) }),
          ]));
        }
      }
      out.push(list);
    }
    out.push(h('p.jr-disc', { text: 'Semua CREDIT di LENTERA adalah simulasi bergaya Orbio: harga per pikiran, token, model, dan nomor transaksi hanyalah tiruan. Tidak ada uang sungguhan dan tidak ada data yang dikirim ke mana pun.' }));
    return out;
  }

  function stat(k, v) { return h('div.jr-stat', {}, [h('div.k', { text: k }), h('div.v', { text: v })]); }

  function renderMap(H) {
    mapCanvas = h('canvas', { 'aria-label': 'Peta pulau' });
    const box = h('div.jr-mapbox', {}, [mapCanvas]);
    const sw = (inner) => h('span.sw', {}, [inner]);
    const legend = h('div.jr-legend', {}, [
      h('h4', { text: 'Keterangan' }),
      h('div', {}, [sw(h('i', { style: { width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '13px solid #e2683c' } })), 'Kamu']),
      h('div', {}, [sw(h('i', { style: { width: '10px', height: '10px', borderRadius: '50%', background: 'radial-gradient(circle,#ffd27a,#e2683c)', boxShadow: '0 0 8px #ff9a3c' } })), 'Api unggun menyala']),
      h('div', {}, [sw(h('i', { style: { width: '9px', height: '9px', border: '1.5px solid #4a2f18', borderRadius: '50%' } })), 'Api unggun padam']),
      h('div', {}, [sw(h('i', { style: { width: '9px', height: '9px', transform: 'rotate(45deg)', background: '#ffb04a', boxShadow: '0 0 0 2px #8a3f10' } })), 'Api Pusaka']),
      h('div', {}, [sw(h('i', { style: { width: '12px', height: '12px', borderRadius: '50%', border: '1.5px dashed #8a3f10' } })), 'Perkiraan (samar)']),
      h('div', {}, [sw(h('i', { style: { width: '6px', height: '6px', borderRadius: '50%', background: '#7a4a22' } })), 'Warga']),
      h('div', {}, [sw(h('i', { style: { width: '14px', height: 0, borderTop: '2px dashed #6e3e1a' } })), 'Jalan setapak']),
      h('p.note', { text: 'Tempat baru tergambar setelah kamu mendekatinya atau mendengar petunjuk tentangnya.' }),
    ]);
    requestAnimationFrame(() => drawMap());
    return [h('div.jr-mapwrap', {}, [box, legend])];
  }

  function mapInfo() {
    const p = state.progress;
    const H = makeHelpers(p);
    const seen = (id) => state.flag('seen_' + id);
    const places = PLACES.map((pl) => ({
      ...pl,
      known: pl.always || seen(pl.id) || (pl.clues || []).some((c) => H.clue(c)),
    }));
    const campfires = CHECKPOINTS.map((c) => ({
      x: c.x, z: c.z, lit: !!p.checkpoints?.[c.id], known: c.id === 'kampung' || !!p.checkpoints?.[c.id] || seen('camp_' + c.id),
    }));
    const flames = FLAMES.map((f) => {
      const st = p.flames?.[f.id] || 'none';
      let state2 = 'unknown';
      if (st === 'placed') {
        const sk = LANDMARKS.mercusuar.sockets.find((s) => s.id === f.id);
        return { ...f, x: sk.x, z: sk.z, state: 'placed' };
      }
      if (st === 'carried') state2 = 'carried';
      else if (H.clue(FLAME_CLUE[f.id]) || seen('flame_' + f.id)) state2 = 'known';
      else if (H.clue(FLAME_CLUE[f.id] + '_samar')) state2 = 'vague';
      return { ...f, state: state2 };
    });
    const people = NPC_IDS.filter((id) => state.flag('met_' + id)).map((id) => {
      const n = ctx.npcs?.get?.(id);
      const pos = n?.position || LANDMARKS.npcs[id];
      return { name: NPC_LINES[id].name, x: pos.x, z: pos.z };
    });
    const pl = ctx.player;
    return { places, campfires, flames, people, player: pl ? { x: pl.position.x, z: pl.position.z, yaw: pl.yaw } : null };
  }

  function drawMap() {
    if (!mapCanvas || !mapCanvas.isConnected) return;
    const rect = mapCanvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.max(64, Math.round(Math.min(rect.width, rect.height || rect.width) * dpr));
    if (mapCanvas.width !== size) { mapCanvas.width = size; mapCanvas.height = size; }
    map.draw(mapCanvas, { ...mapInfo(), t: clock, dpr });
  }

  function safe(fn) { try { return fn(); } catch { return false; } }

  // Touch-capable devices count as 'touch' until a physical key is used.
  let sawKey = false;
  window.addEventListener('keydown', () => { sawKey = true; }, { passive: true });
  function deviceOf() {
    const d = input.device || 'kbm';
    return d === 'kbm' && ctx.engine?.isTouch && !sawKey ? 'touch' : d;
  }

  // ---------------------------------------------------------------- discovery
  function trackDiscovery() {
    const pl = ctx.player?.position;
    if (!pl) return;
    const near = (x, z, r) => Math.hypot(pl.x - x, pl.z - z) < r;
    for (const p of PLACES) if (!p.always && !state.flag('seen_' + p.id) && near(p.x, p.z, p.r)) state.flag('seen_' + p.id, true);
    for (const c of CHECKPOINTS) if (!state.flag('seen_camp_' + c.id) && near(c.x, c.z, 45)) state.flag('seen_camp_' + c.id, true);
    for (const f of FLAMES) if (!state.flag('seen_flame_' + f.id) && near(f.x, f.z, 40)) state.flag('seen_flame_' + f.id, true);
  }

  // ---------------------------------------------------------------- update
  let lastNow = performance.now();
  let stickX = 0;
  function update() {
    const now = performance.now();
    const dt = Math.min(0.25, Math.max(0, (now - lastNow) / 1000)); // wall clock (UI)
    lastNow = now;
    clock += dt;
    // Bake the base map in small slices once the game is running (no hitch on first open).
    if (!map.ready) {
      bakeDelay -= dt;
      if (journal.isOpen || (bakeDelay <= 0 && state.mode !== 'loading')) {
        if (map.bakeStep(journal.isOpen && tab === 'peta' ? 140 : 40) && journal.isOpen && tab === 'peta') drawMap();
      }
    }
    if (state.mode === 'play') {
      seenTimer -= dt;
      if (seenTimer <= 0) { seenTimer = 0.5; trackDiscovery(); }
      if (input.pressed('journal')) { input.consume('journal'); open(); }
      return;
    }
    if (!journal.isOpen || state.mode !== 'journal') return;

    const take = (a) => { if (input.pressed(a)) { input.consume(a); return true; } return false; };
    const shut = [take('journal'), take('cancel'), take('pause')].some(Boolean);
    if (shut) { close(); return; }
    const i = TABS.findIndex((t) => t.id === tab);
    let left = take('menuLeft') || take('zoomOut');
    let right = take('menuRight') || take('zoomIn');
    if (input.device === 'gamepad') {
      // Left stick: flick sideways to change page, hold up/down to scroll.
      const sx = input.move.x;
      const dir = sx > 0.6 ? 1 : sx < -0.6 ? -1 : 0;
      if (dir && dir !== stickX) { if (dir < 0) left = true; else right = true; }
      stickX = dir;
      if (Math.abs(input.move.y) > 0.3) page.scrollTop -= input.move.y * 620 * dt;
    }
    if (left) setTab(TABS[(i + TABS.length - 1) % TABS.length].id);
    else if (right) setTab(TABS[(i + 1) % TABS.length].id);
    for (let k = 1; k <= 4; k++) if (take('choice' + k)) setTab(TABS[k - 1].id);
    if (input.down('up')) page.scrollTop -= 520 * dt;
    if (input.down('down')) page.scrollTop += 520 * dt;
    if (input.device !== lastDevice) refreshHints();
    if (tab === 'peta' && mapCanvas) {
      mapTimer -= dt;
      if (mapTimer <= 0) { mapTimer = 1 / 15; drawMap(); }
    }
  }

  refreshCounts();
  return journal;
}
