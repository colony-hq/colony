// Menu screens: settings, controls, pause, confirm, end credits. Each builder returns a screen
// record consumed by menus.js: { id, el, items, focus, horizontal, descEl, onBack, legend,
// inHost, onShow, update(dt) }. Owner: ui-audio.

import { h } from '../core/dom.js';
import { GLYPHS } from '../core/input.js';
import { button, slider, toggle, cycle, tabs, section, panel, fmtTime, fmtCredit, lanternSvg } from './menu-kit.js';
import { rawKeycap, keycap, effectiveDevice } from './prompt-glyphs.js';

const QUALITY_LABEL = { auto: 'Otomatis', low: 'Rendah', medium: 'Sedang', high: 'Tinggi' };
const FLAMES = [
  { id: 'tirta', name: 'Api Tirta', color: '#bff6ff' },
  { id: 'bumi', name: 'Api Bumi', color: '#ffb04a' },
  { id: 'samudra', name: 'Api Samudra', color: '#8fa2ff' },
];
const FLAME_STATE = { none: 'Belum ditemukan', carried: 'Dibawa', placed: 'Menyala di mercusuar' };

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export function settingsScreen(api, { kicker = '' } = {}) {
  const { ctx } = api;
  const s = ctx.state.settings;
  const items = [];
  const body = [];
  const add = (it) => { items.push(it); body.push(it.el); return it; };
  const pct = (v) => `${Math.round(v * 100)}%`;

  body.push(section('Kamera'));
  add(slider('Sensitivitas kamera', {
    min: 0.3, max: 2.5, step: 0.1, get: () => s.sensitivity, set: (v) => api.setSetting('sensitivity', v),
    format: (v) => `${v.toFixed(1)}×`, desc: 'Seberapa cepat kamera berputar saat kamu menggeser mouse, stik, atau layar.',
  }));
  add(toggle('Balik sumbu Y', { get: () => s.invertY, set: (v) => api.setSetting('invertY', v), desc: 'Dorong ke atas buat melihat ke bawah, kayak kamera pesawat.' }));
  add(toggle('Guncangan kamera', { get: () => s.cameraShake, set: (v) => api.setSetting('cameraShake', v), desc: 'Kamera bergetar saat kena Hantu Kabut atau mendarat keras.' }));

  body.push(section('Grafis'));
  const quality = add(cycle('Kualitas grafis', {
    options: Object.entries(QUALITY_LABEL), get: () => s.quality, set: (v) => api.setSetting('quality', v),
    desc: '',
  }));
  const qualityDesc = () => {
    const eff = QUALITY_LABEL[ctx.engine.quality] || ctx.engine.quality;
    return s.quality === 'auto'
      ? `Otomatis menyesuaikan dengan perangkatmu. Sekarang: ${eff}.`
      : 'Rendah paling ringan buat HP. Tinggi pakai bayangan tajam, rumput, dan cahaya mekar penuh.';
  };
  quality.desc = qualityDesc();

  body.push(section('Suara'));
  add(slider('Volume utama', { get: () => s.masterVolume, set: (v) => api.setSetting('masterVolume', v), format: pct, desc: 'Semua suara: musik gamelan, alam, dan efek.' }));
  add(slider('Volume musik', { get: () => s.musicVolume, set: (v) => api.setSetting('musicVolume', v), format: pct, desc: 'Gamelan yang mengiringi perjalananmu.' }));
  add(slider('Volume efek', { get: () => s.sfxVolume, set: (v) => api.setSetting('sfxVolume', v), format: pct, desc: 'Langkah, ombak, angin, api, dan suara antarmuka.' }));

  body.push(section('Bantuan'));
  add(toggle('Petunjuk', { get: () => s.showHints, set: (v) => api.setSetting('showHints', v), desc: 'Tampilkan petunjuk tutorial dan tombol selama bermain.' }));

  const p = panel({ kicker, title: 'Pengaturan', body, onBack: () => api.back() });
  return {
    id: 'settings', el: p.el, items, descEl: p.descEl, legend: 'adjust',
    onShow() { quality.desc = qualityDesc(); },
    onItemChange(it) { if (it === quality) { quality.desc = qualityDesc(); api.refreshDesc(); } },
  };
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
const G = GLYPHS;
const CONTROL_TABLES = [
  {
    device: 'kbm', label: 'Keyboard & Mouse', short: 'Keyboard',
    rows: [
      ['Bergerak', null, ['W', 'A', 'S', 'D']],
      ['Lihat sekeliling', 'Klik layar biar kursor terkunci', [G.kbm.look]],
      ['Lompat', 'Tahan di udara buat melayang', [G.kbm.jump]],
      ['Lari', null, [G.kbm.sprint]],
      ['Interaksi · bicara', null, [G.kbm.interact]],
      ['Sinar lentera', 'Mengusir Hantu Kabut, butuh 12 Nyala', [G.kbm.flare, 'Klik kanan']],
      ['Jurnal', null, [G.kbm.journal, 'Tab']],
      ['Jeda', null, [G.kbm.pause, 'P']],
      ['Kamera ke belakang', null, ['R']],
      ['Zoom kamera', null, ['Roda mouse']],
      ['Pilihan dialog', null, ['1', '2', '3', '4']],
    ],
  },
  {
    device: 'gamepad', label: 'Gamepad', short: 'Gamepad',
    rows: [
      ['Bergerak', 'Stik kiri', [G.gamepad.move]],
      ['Kamera', 'Stik kanan', [G.gamepad.look]],
      ['Lompat', 'Tahan di udara buat melayang', [G.gamepad.jump]],
      ['Lari', 'Tahan', [G.gamepad.sprint, 'L3']],
      ['Interaksi · bicara', null, [G.gamepad.interact]],
      ['Sinar lentera', null, [G.gamepad.flare, 'LT']],
      ['Jurnal', null, [G.gamepad.journal, 'Back']],
      ['Jeda', null, [G.gamepad.pause]],
      ['Zoom kamera', null, ['LB', 'RB']],
      ['Kamera ke belakang', null, ['R3']],
      ['Pilih · kembali (menu)', null, [G.gamepad.confirm, G.gamepad.cancel]],
    ],
  },
  {
    device: 'touch', label: 'Layar Sentuh', short: 'Sentuh',
    rows: [
      ['Bergerak', 'Sentuh dan geser di sisi kiri layar', [G.touch.move]],
      ['Lihat sekeliling', 'Usap sisi kanan layar', [G.touch.look]],
      ['Lompat', 'Tahan di udara buat melayang', [G.touch.jump]],
      ['Lari', null, [G.touch.sprint]],
      ['Interaksi · bicara', 'Atau ketuk tanda di atas benda', [G.touch.interact]],
      ['Sinar lentera', null, [G.touch.flare]],
      ['Jurnal', 'Pojok kanan atas', [G.touch.journal]],
      ['Jeda', 'Pojok kanan atas', [G.touch.pause]],
    ],
  },
];

export function controlsScreen(api, { kicker = '' } = {}) {
  const { ctx } = api;
  const startDevice = effectiveDevice(ctx);
  let current = Math.max(0, CONTROL_TABLES.findIndex((t) => t.device === startDevice));
  const tables = CONTROL_TABLES.map((t) => {
    const rows = t.rows.map(([label, note, keys]) => {
      const keyEls = [];
      keys.forEach((k, i) => {
        if (i > 0) keyEls.push(h('span.lk-sep', {}, k.length === 1 && keys[i - 1].length === 1 && t.device === 'kbm' && label === 'Bergerak' ? '' : '/'));
        keyEls.push(rawKeycap(k, t.device));
      });
      return h('div.lm-crow', {}, [h('div', {}, [label, note ? h('small', {}, note) : null]), h('div.lm-ckeys', {}, keyEls)]);
    });
    return h('div.lm-ctab', { role: 'tabpanel' }, rows);
  });
  const host = h('div.lm-ctabs');
  const show = () => { host.textContent = ''; host.appendChild(tables[current]); };
  show();
  const tabItem = tabs(CONTROL_TABLES.map((t) => (window.innerWidth < 520 ? t.short : t.label)), {
    get: () => current,
    set: (i) => { current = i; show(); },
  });
  tabItem.desc = 'Pindah tab pakai panah kiri/kanan, LB/RB, atau ketuk.';
  const p = panel({ kicker, title: 'Kontrol', body: [tabItem.el, host], onBack: () => api.back() });
  return {
    id: 'controls', el: p.el, items: [tabItem], descEl: p.descEl, legend: 'tabs',
    update(dt) {
      const inp = ctx.input;
      if (inp.pressed('zoomOut')) { tabItem.adjust(-1); api.play('ui-move'); }
      if (inp.pressed('zoomIn')) { tabItem.adjust(1); api.play('ui-move'); }
      // Up/down (or the left stick) scroll the table.
      const pad = inp.device === 'gamepad' ? inp.move.y : 0;
      const dir = (inp.down('down') ? 1 : 0) - (inp.down('up') ? 1 : 0) - pad;
      if (dir) p.bodyEl.scrollTop += dir * Math.min(0.05, dt) * 520;
    },
  };
}

// ---------------------------------------------------------------------------
// Confirm (in-page; confirm() is forbidden)
// ---------------------------------------------------------------------------
export function confirmScreen(api, { kicker = '', title, text, yes = 'Ya', no = 'Batal', onYes, onNo, danger = true } = {}) {
  const noBtn = button(no, () => { api.back(); onNo?.(); }, { sound: 'ui-back' });
  const yesBtn = button(yes, () => onYes?.(), { danger });
  const p = panel({ kicker, title, cls: 'lm-confirm', body: [h('p', {}, text), h('div.lm-choices', {}, [noBtn.el, yesBtn.el])] });
  return { id: 'confirm', el: p.el, items: [noBtn, yesBtn], focus: 0, horizontal: true, descEl: null };
}

// ---------------------------------------------------------------------------
// Pause
// ---------------------------------------------------------------------------
function flameRows(state) {
  return FLAMES.map((f) => {
    const st = state.progress.flames?.[f.id] || 'none';
    const i = h('i');
    i.style.setProperty('--fc', f.color);
    return h('div.lm-fl-row.' + st, {}, [i, h('span', {}, f.name), h('em', {}, FLAME_STATE[st] || st)]);
  });
}

function stat(label, value, cls = '', small = '') {
  return h('div.lm-stat' + (cls ? '.' + cls : ''), {}, [h('b', {}, label), h('span', {}, value), small ? h('small', {}, small) : null]);
}

export function pauseScreen(api) {
  const { ctx } = api;
  const { state } = ctx;
  const items = [
    button('Lanjut', () => api.resume(), { desc: '' }),
    button('Jurnal', () => api.openJournal(), { desc: '' }),
    button('Pengaturan', () => api.openSettings('Jeda')),
    button('Kontrol', () => api.openControls('Jeda')),
    button('Kembali ke Judul', () => api.confirmQuit(), { danger: false }),
  ];
  if (!ctx.journal?.open) items[1].disabled = true, items[1].el.classList.add('disabled');
  const left = h('div.lm-pause-l', {}, [
    h('div.lm-pause-k', {}, 'Perjalanan dijeda'),
    h('h2.lm-pause-t', {}, 'Jeda'),
    items[0].el, items[1].el, items[2].el, items[3].el,
    h('div.lm-btn-sep'),
    items[4].el,
  ]);

  const p = state.progress;
  const objText = ctx.quest?.objective?.text || api.lastObjective() || 'Jelajahi pulau dan cari jalan menembus kabut.';
  const kilauMax = ctx.spirits?.kilauTotal;
  const card = h('div.lm-card', {}, [
    h('div', {}, [h('div.lm-card-k', {}, 'Tujuan'), h('div.lm-card-obj', {}, objText)]),
    h('div', {}, [h('div.lm-card-k', {}, 'Api Pusaka'), h('div.lm-fl-list', {}, flameRows(state))]),
    h('div.lm-stats', {}, [
      stat('Nyala', String(Math.round(p.nyala ?? 0))),
      stat('CREDIT', fmtCredit(p.credit?.balance), 'cr', 'simulasi'),
      stat('Kilau', Number.isFinite(kilauMax) ? `${p.kilau?.length ?? 0}/${kilauMax}` : String(p.kilau?.length ?? 0), 'kl'),
      stat('Waktu', fmtTime(p.playTime)),
    ]),
  ]);
  const el = h('div.lm-pause', { role: 'dialog', 'aria-label': 'Jeda' }, [left, card]);
  return { id: 'pause', el, items, focus: 0, descEl: null, onBack: () => { api.resume(); return true; } };
}

// ---------------------------------------------------------------------------
// End credits + stats
// ---------------------------------------------------------------------------
const CAST = [
  ['Mbah Sarni', 'Tetua kampung, penjaga api unggun'],
  ['Pak Darto', 'Nelayan, hafal setiap karang'],
  ['Bu Ratih', 'Pemilik warung, sumber segala kabar'],
  ['Laras', 'Mahasiswi, pembaca relief candi'],
  ['Ki Lamun', 'Penjaga mercusuar'],
];
const MAKERS = [
  ['Dunia & cerita', 'Pulau, kabut, dan warganya dibangun dengan Three.js'],
  ['Musik', 'Gamelan slendro generatif, disintesis langsung di peramban'],
  ['Suara', 'Ombak, angin, jangkrik, dan api, tanpa satu pun rekaman'],
  ['Huruf', 'Gloock · Alegreya Sans · DM Mono'],
  ['CREDIT', 'Simulasi gaya Orbio. Bukan uang sungguhan.'],
];

function normStats(stats, state) {
  const p = state.progress;
  const c = p.credit || {};
  const num = (v) => (Number.isFinite(v) ? v : null);
  // Accept flat fields or the nested shape from gameplay/finale.js:
  // { kilau: {found, total}, thoughts: {total, redup, sedang, terang}, credit: {spent, earned, balance} }.
  const kil = stats.kilau;
  const kilFound = kil && typeof kil === 'object' && !Array.isArray(kil) ? kil.found : Array.isArray(kil) ? kil.length : kil;
  const kilTotal = kil && typeof kil === 'object' && !Array.isArray(kil) ? kil.total : null;
  const th = stats.thoughts;
  const thObj = th && typeof th === 'object' ? th : null;
  const cr = stats.credit && typeof stats.credit === 'object' ? stats.credit : {};
  return {
    playTime: num(stats.playTime) ?? p.playTime ?? 0,
    byTier: {
      redup: 0, sedang: 0, terang: 0, ...(c.byTier || {}), ...(stats.byTier || {}),
      ...(thObj ? { redup: thObj.redup ?? 0, sedang: thObj.sedang ?? 0, terang: thObj.terang ?? 0 } : {}),
    },
    thoughts: thObj ? thObj.total : num(th) ?? c.thoughts,
    spent: num(cr.spent) ?? num(stats.spent) ?? c.spent ?? 0,
    earned: num(cr.earned) ?? num(stats.earned) ?? c.earned ?? 0,
    balance: num(cr.balance) ?? num(stats.balance) ?? c.balance ?? 0,
    kilau: num(kilFound) ?? (p.kilau?.length ?? 0),
    kilauTotal: num(kilTotal) ?? num(stats.kilauTotal) ?? null,
    deaths: num(stats.deaths) ?? p.deaths ?? 0,
    clues: num(stats.clues) ?? (Array.isArray(p.clues) ? p.clues.length : null),
  };
}

export function creditsScreen(api, rawStats = {}) {
  const { ctx } = api;
  const st = normStats(rawStats || {}, ctx.state);
  const kilauMax = st.kilauTotal ?? ctx.spirits?.kilauTotal;

  // Phase 1: rolling credits.
  const entry = ([b, s]) => h('div.lm-roll-e', {}, [h('b', {}, b), h('span', {}, s)]);
  const roll = h('div.lm-roll', {}, [
    h('div.lm-roll-logo', {}, [lanternSvg('lm-lamp'), h('h3', {}, 'LENTERA'), h('p', {}, 'Kabut Nusantara')]),
    h('div.lm-roll-sec', {}, [h('h4', {}, 'Para warga'), ...CAST.map(entry)]),
    h('div.lm-roll-sec', {}, [h('h4', {}, 'Di balik layar'), ...MAKERS.map(entry)]),
    h('div.lm-roll-q', {}, ['“Pikiran memang ada harganya, Nak. Tapi pulau yang berhenti bertanya, bayarnya jauh lebih mahal.”', h('cite', {}, 'Ki Lamun')]),
    h('div.lm-roll-sec', {}, [h('h4', {}, 'Untuk'), entry(['Semua yang masih berani bertanya', 'Terima kasih sudah bermain.'])]),
  ]);
  const rollWrap = h('div.lm-roll-wrap', {}, [roll]);
  const skipCap = h('span.lm-skip-cap');
  const skip = h('button.lm-skip', { type: 'button', tabindex: '-1' }, [skipCap, h('span', {}, 'Lewati')]);
  let skipDevice = '';

  // Phase 2: stats + actions.
  const byTier = st.byTier;
  const thoughts = st.thoughts ?? (byTier.redup + byTier.sedang + byTier.terang);
  const maxTier = Math.max(1, byTier.redup, byTier.sedang, byTier.terang);
  const tierRow = (id, label, color) => {
    const bar = h('i');
    bar.style.width = `${((byTier[id] || 0) / maxTier) * 100}%`;
    const row = h('div.lm-tier', {}, [h('div.lm-tier-n', {}, label), h('div.bar', {}, [bar]), h('em', {}, String(byTier[id] || 0))]);
    row.style.setProperty('--tc', color);
    return row;
  };
  const thoughtsTile = h('div.lm-stat.wide', {}, [
    h('b', {}, 'Pikiran dibeli'), h('span', {}, String(thoughts || 0)),
    h('div.lm-tiers', {}, [tierRow('redup', 'Redup', 'var(--tier-redup)'), tierRow('sedang', 'Sedang', 'var(--tier-sedang)'), tierRow('terang', 'Terang', 'var(--tier-terang)')]),
  ]);
  const btnPlay = button('Lanjut menjelajah', () => api.creditsContinue());
  const btnTitle = button('Ke Judul', () => api.creditsToTitle(), { sound: 'ui-back' });
  const end = h('div.lm-end.lm-hide', {}, [h('div.lm-end-in', {}, [
    h('div.lm-end-k', {}, 'Perjalanan selesai'),
    h('h2.lm-end-t', {}, 'Kabut telah terangkat.'),
    h('p.lm-end-s', {}, 'Mercusuar menyala lagi, dan pulau ini kembali berani bertanya.'),
    h('div.lm-end-grid', {}, [
      stat('Waktu bermain', fmtTime(st.playTime)),
      stat('Kilau ditemukan', Number.isFinite(kilauMax) ? `${st.kilau} / ${kilauMax}` : String(st.kilau), 'kl'),
      stat('Pingsan', `${st.deaths}×`),
      thoughtsTile,
      h('div.lm-stat.lm-cr2', {}, [
        h('b', {}, 'CREDIT'),
        h('div.lm-cr2-row', {}, [h('span.neg', {}, `−${fmtCredit(st.spent)}`), h('small', {}, 'terpakai')]),
        h('div.lm-cr2-row', {}, [h('span.pos', {}, `+${fmtCredit(st.earned)}`), h('small', {}, 'didapat')]),
        h('small', {}, 'simulasi'),
      ]),
    ]),
    h('div.lm-end-note', {}, 'Semua CREDIT di sini simulasi, bukan uang sungguhan.'),
    h('div.lm-end-actions', {}, [btnPlay.el, btnTitle.el]),
  ])]);
  [...end.firstChild.children].forEach((c, i) => { c.style.animationDelay = `${0.1 + i * 0.12}s`; });

  const el = h('div.lm-credits', {}, [h('div.lm-cr-bg'), rollWrap, end, skip]);
  const reduced = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
  const ROLL_S = 34;
  let phase = 'roll';
  let started = 0;
  const screen = {
    id: 'credits', el, items: [], focus: 0, horizontal: true, inHost: false, descEl: null, legend: 'none',
    onShow() {
      if (started) return;
      started = performance.now();
      el.classList.add('on');
      roll.style.setProperty('--roll', `${ROLL_S}s`);
      requestAnimationFrame(() => roll.classList.add('run'));
    },
    onBack() { if (phase === 'roll') { toStats(); return true; } return true; },
    onConfirmEmpty() { if (phase === 'roll') toStats(); },
    update() {
      // Wall clock, so the switch lines up with the CSS roll even when frames are slow.
      const t = (performance.now() - started) / 1000;
      if (phase === 'roll' && t > (reduced ? 6 : ROLL_S - 1)) toStats();
      const dev = effectiveDevice(ctx);
      if (dev !== skipDevice) {
        skipDevice = dev;
        skipCap.textContent = '';
        if (dev !== 'touch') skipCap.appendChild(keycap('confirm', dev));
      }
    },
  };
  function toStats() {
    if (phase !== 'roll') return;
    phase = 'stats';
    rollWrap.style.transition = 'opacity 0.8s';
    rollWrap.style.opacity = '0';
    skip.classList.add('lm-hide');
    end.classList.remove('lm-hide');
    requestAnimationFrame(() => end.classList.add('show'));
    screen.legend = 'horizontal';
    api.setItems(screen, [btnPlay, btnTitle], 0);
  }
  skip.addEventListener('click', (e) => { if (e.detail !== 0) toStats(); });
  screen.skip = toStats;
  return screen;
}
