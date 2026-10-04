// Cloud save mirror + hiscores via the artifact `db` (+ `user` for the viewer's id). Owner: net.
//
// - Private save: data/users/{self}/save (only this viewer can read it). Mirrored at most every
//   15 s after local saves, and when the tab is hidden. On entering the world, a newer cloud save
//   (or a different character) is offered for restore; mirroring waits for that decision so a
//   fresh device never overwrites real progress.
// - Hiscores: players/{self} = { v, at, total, combat, qp, xp, lv_<skill>, xp_<skill> } — numbers
//   only. Display names are resolved at render time with user.profiles() and never stored.
//
// API: available, status() -> {phase, lastSync, error, available}, syncNow(), openHiscores(skill?),
//      hiscores.subscribe(skill|null, cb(rows, meta)) -> off, myStats().
// Events: cloud:status {phase}, save:loaded {source: 'cloud'} (through state.replace).

import { SKILL_IDS } from '../data/skills.js';
import { QUESTS } from '../data/quests.js';
import { SAVE_VERSION } from '../core/state.js';
import { formatCredit } from '../data/items.js';
import { netHub, docWriter, errCode, int } from './caps.js';
import { USER_RE } from './market.js';
import { choice } from './netui.js';
import { openHiscores } from './ui-hiscores.js';

const MIRROR_MS = 15000;
const MAX_TOTAL = SKILL_IDS.length * 99;

export function createCloud(ctx) {
  const { events, state } = ctx;
  const net = netHub(ctx);
  const writer = docWriter();
  let phase = 'idle'; // idle | checking | prompt | synced | paused | off | error
  let error = null;
  let lastWrite = 0;
  let want = false;
  let checkedKey = null;
  let lastHs = '';
  let lastSig = '';
  let hsTimer = 0;

  const avail = () => !!(net.db && net.selfId && USER_RE.test(net.selfId));
  const savePath = () => `data/users/${net.selfId}/save`;
  const setPhase = (p) => { if (phase !== p) { phase = p; events.emit('cloud:status', { phase }); } };
  const say = (text, kind = 'chain') => events.emit('chat:game', { text, kind });

  function qp(save = state.save) {
    const q = save?.quests || {};
    return QUESTS.reduce((s, x) => s + (q[x.id] === 'done' ? x.questPoints || 0 : 0), 0);
  }
  function myStats() {
    const sk = ctx.skills;
    const levels = sk?.levels?.() || {};
    const out = { v: 1, at: Date.now(), total: sk?.totalLevel?.() || 0, combat: sk?.combatLevel?.() || 3, qp: ctx.quests?.points?.() ?? qp(), xp: 0 };
    for (const id of SKILL_IDS) {
      const x = Math.floor(sk?.xp?.(id) || 0);
      out['lv_' + id] = levels[id] || 1;
      out['xp_' + id] = x;
      out.xp += x;
    }
    return out;
  }
  function summary(save) {
    // Rough stats for a save we have not loaded (cloud copy).
    let total = 0;
    try {
      for (const id of SKILL_IDS) {
        const xp = Number(save.skills?.[id]) || 0;
        let lvl = 1;
        // Same curve as data/skills.js (approximate is fine for a prompt).
        let pts = 0;
        for (let l = 1; l < 99; l++) { pts += Math.floor(l + 300 * Math.pow(2, l / 7)); if (Math.floor(pts / 4) <= xp) lvl = l + 1; else break; }
        total += lvl;
      }
    } catch { /* ignore */ }
    return { name: String(save.name || 'Adventurer').slice(0, 24), total, credit: Number(save.wallet?.balance) || 0, playTime: Number(save.stats?.playTime) || 0 };
  }
  const fmtAgo = (at) => {
    const m = Math.round((Date.now() - at) / 60000);
    return m < 1 ? 'moments ago' : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
  };
  const fmtPlay = (s) => (s < 3600 ? `${Math.round(s / 60)} min played` : `${(s / 3600).toFixed(1)} h played`);

  function validCloud(d) {
    const s = d?.save;
    return !!(d && d.v === 1 && s && typeof s === 'object' && s.v === SAVE_VERSION && s.skills && typeof s.skills === 'object'
      && Array.isArray(s.inventory) && s.inventory.length === 28 && s.wallet && typeof s.wallet === 'object');
  }

  async function check() {
    if (!avail() || state.mode !== 'play') return;
    if (phase === 'checking' || phase === 'prompt') return;
    const key = net.selfId + '|' + state.save.created + '|' + state.save.name;
    if (checkedKey === key) return;
    checkedKey = key;
    setPhase('checking');
    let snap;
    try { snap = await net.db.doc(savePath()).get(); } catch (e) { error = errCode(e); setPhase(error === 'unavailable' ? 'idle' : 'error'); if (error === 'unavailable') checkedKey = null; return; }
    const d = snap?.exists ? snap.data() : null;
    if (!validCloud(d)) { setPhase('synced'); mirror(true); pushHiscore(true); return; }
    const local = state.save;
    const sameChar = d.save.created === local.created && d.save.name === local.name;
    const sameLineage = d.syncId && local.cloudSync?.id === d.syncId;
    const cloudAt = Number(d.savedAt) || 0;
    const localAt = Number(local.savedAt) || 0;
    if (sameLineage || (sameChar && cloudAt <= localAt + 2000)) { setPhase('synced'); mirror(true); pushHiscore(true); return; }

    setPhase('prompt');
    const c = summary(d.save), l = summary(local);
    const text = `A cloud save was found for this account.\n\n`
      + `Cloud: ${c.name} — total level ${c.total}, ${formatCredit(c.credit)} CREDIT, ${fmtPlay(c.playTime)}, saved ${fmtAgo(cloudAt)}.\n`
      + `This device: ${l.name} — total level ${myStats().total}, ${formatCredit(local.wallet?.balance || 0)} CREDIT, ${fmtPlay(l.playTime)}.\n\n`
      + `Keeping this device's save replaces the cloud copy.`;
    const pick = await choice(ctx, { title: 'Cloud save found', text, options: ['Load cloud save', "Keep this device's save"] });
    if (pick === 0) restore(d);
    else if (pick === 1) { setPhase('synced'); mirror(true); pushHiscore(true); say('Cloud save updated with this device\'s progress.'); }
    else { setPhase('paused'); say('Cloud sync paused for this session (the cloud copy was left untouched).', 'game'); }
  }

  function restore(d) {
    try {
      const s = JSON.parse(JSON.stringify(d.save));
      s.cloudSync = { id: d.syncId || null, at: Number(d.savedAt) || Date.now() };
      checkedKey = net.selfId + '|' + s.created + '|' + s.name;
      state.replace(s, 'cloud');
      state.markDirty();
      state.flush(true);
      setPhase('synced');
      lastWrite = Date.now();
      say(`Cloud save loaded: welcome back, ${s.name}.`);
      pushHiscore(true);
    } catch (err) {
      console.error('[net] cloud restore failed', err);
      setPhase('synced');
      say('That cloud save could not be loaded; keeping this device\'s save.', 'warn');
    }
  }

  // Content signature (ignores bookkeeping that changes without real progress).
  function sigOf(save) {
    const { savedAt, cloudSync, ...rest } = save;
    if (rest.stats) rest.stats = { ...rest.stats, playTime: 0 };
    return JSON.stringify(rest);
  }

  function mirror(force = false) {
    if (!avail() || phase !== 'synced') return;
    const now = Date.now();
    if (!force && now - lastWrite < MIRROR_MS) { want = true; return; }
    want = false;
    const s = state.save;
    let save;
    try { save = JSON.parse(JSON.stringify(s)); } catch { return; }
    delete save.cloudSync;
    const sig = sigOf(save);
    if (sig === lastSig) return;
    lastSig = sig;
    lastWrite = now;
    const syncId = now.toString(36) + Math.random().toString(36).slice(2, 8);
    s.cloudSync = { id: syncId, at: now }; // persisted with the next local save
    // savedAt = when this content was last written locally, so an identical local copy never
    // looks "older" than its own cloud mirror.
    let payload = { v: 1, savedAt: Number(s.savedAt) || now, syncId, name: String(s.name || '').slice(0, 32), created: s.created, total: myStats().total, save };
    if (JSON.stringify(payload).length > 230000) {
      // Trim history-like fields to stay well under the 256 KiB document limit.
      if (save.wallet?.txs) save.wallet.txs = save.wallet.txs.slice(0, 30);
      if (save.exchange?.history) save.exchange.history = save.exchange.history.slice(0, 20);
      if (JSON.stringify(payload).length > 240000) { console.warn('[net] save too large for the cloud mirror'); return; }
      payload = { ...payload, save };
    }
    const path = savePath();
    const db = net.db;
    writer.write(path, () => db.doc(path).set(payload), (e) => {
      error = errCode(e);
      lastSig = '';
      if (error === 'invalid_argument' || error === 'not_granted' || error === 'revoked') { setPhase('off'); }
    });
  }

  function pushHiscore(force = false) {
    if (!avail() || state.mode !== 'play') return;
    const d = myStats();
    const sig = JSON.stringify({ ...d, at: 0 });
    if (!force && sig === lastHs) return;
    lastHs = sig;
    const path = 'players/' + net.selfId;
    const db = net.db;
    writer.write(path, () => db.doc(path).set(d), (e) => { error = errCode(e); });
  }
  function scheduleHiscore(ms) {
    if (hsTimer) return;
    hsTimer = setTimeout(() => { hsTimer = 0; pushHiscore(); }, ms);
  }

  // ---- Hiscores read side -------------------------------------------------------------
  function cleanRow(id, d) {
    if (!USER_RE.test(String(id)) || !d || typeof d !== 'object' || d.v !== 1) return null;
    const row = { id, at: Number(d.at) || 0, total: int(d.total, SKILL_IDS.length, MAX_TOTAL, 0), combat: int(d.combat, 3, 200, 3), qp: int(d.qp, 0, 999, 0), xp: int(d.xp, 0, 3e9, 0), lv: {}, sx: {} };
    if (!row.total) return null;
    for (const s of SKILL_IDS) { row.lv[s] = int(d['lv_' + s], 1, 99, 1); row.sx[s] = int(d['xp_' + s], 0, 2e8, 0); }
    return row;
  }
  function selfRow() {
    const d = myStats();
    return cleanRow(net.selfId || 'you', d) || null;
  }
  const hiscores = {
    // cb(rows, {live, error}); rows sorted best first. Returns unsubscribe.
    subscribe(skill, cb) {
      const sort = (rows) => rows.sort(skill
        ? (a, b) => b.sx[skill] - a.sx[skill] || b.lv[skill] - a.lv[skill]
        : (a, b) => b.total - a.total || b.xp - a.xp);
      if (!net.db) {
        const me = selfRow();
        cb(me ? [me] : [], { live: false });
        return () => {};
      }
      let off = () => {};
      try {
        const q = net.db.collection('players').orderBy(skill ? 'xp_' + skill : 'total', 'desc').limit(100);
        off = q.onSnapshot((snap) => {
          const rows = [];
          for (const d of snap?.docs || []) { if (!d?.exists) continue; const r = cleanRow(d.id, d.data?.()); if (r) rows.push(r); }
          // Show yourself even before your first write lands.
          if (net.selfId && !rows.some((r) => r.id === net.selfId)) { const me = selfRow(); if (me) rows.push(me); }
          cb(sort(rows), { live: true });
        }, (e) => cb([selfRow()].filter(Boolean), { live: false, error: errCode(e) }));
      } catch (e) { cb([selfRow()].filter(Boolean), { live: false, error: errCode(e) }); }
      return () => { try { off(); } catch { /* ignore */ } };
    },
  };

  const cloud = {
    get available() { return avail(); },
    status() { return { phase, lastSync: lastWrite, error, available: avail() }; },
    syncNow() { if (phase === 'paused') setPhase('synced'); mirror(true); pushHiscore(true); },
    hiscores,
    myStats,
    selfId: () => net.selfId || null,
    openHiscores(skill = null) { return openHiscores(ctx, cloud, skill); },
    update() {
      if (want && phase === 'synced' && Date.now() - lastWrite >= MIRROR_MS) mirror(true);
    },
  };

  net.on(() => { if (!avail()) { if (phase !== 'idle') setPhase(net.status('db') === 'off' ? 'off' : 'idle'); return; } check(); });
  events.on('game:start', () => { check(); });
  events.on('mode:change', ({ mode }) => { if (mode === 'play') check(); });
  events.on('save:loaded', ({ source }) => { if (source !== 'cloud' && state.mode === 'play') check(); });
  events.on('save:written', ({ at }) => { state.save.savedAt = at; mirror(false); });
  events.on('level:up', () => scheduleHiscore(3000));
  events.on('xp', () => scheduleHiscore(20000));
  events.on('quest:complete', () => { scheduleHiscore(2000); mirror(true); });
  try {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { state.flush?.(); mirror(true); } });
  } catch { /* node tests */ }
  return cloud;
}
