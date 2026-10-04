// Dialogue: letterboxed conversation UI with paid "thoughts". Owner: npc-ai.
// API: DESIGN.md §7 Dialogue — createDialogue(ctx) -> { isOpen, open(npcId), close(), update }.
// Added fields: npcId (open NPC), speaking (typewriter running; drives NPC talk anim), state.
//
// Flow: greet (typewriter) -> topics -> tier picker (three lamps) -> thinking -> answer (tier style)
// -> receipt + clue stamp -> topics … -> Pamit (farewell line) -> close.
// Emits dialogue:open/close, mind:think, mind:answer, clue:add, toast.

import { injectStyle, h, uiRoot } from '../core/dom.js';
import { TIERS, TIER_ORDER, tierRank, formatCredit } from './credit.js';
import { NPC_LINES } from './lines.js';
import { LANDMARKS } from '../world/heightfield.js';
import { DIALOGUE_CSS } from './dialogue-css.js';

const CPS = { greet: 64, line: 72, redup: 44, sedang: 58, terang: 62 };
const THINK_GLOW = { redup: [0.12, 0.32], sedang: [0.2, 0.75], terang: [0.25, 1] };

export function createDialogue(ctx) {
  const { state, events, input } = ctx;
  injectStyle('npc-dialogue', DIALOGUE_CSS);
  const host = uiRoot('dialogue') || document.body;

  // ---------------------------------------------------------------- DOM
  const nameEl = h('span.dlg-name');
  const roleEl = h('span.dlg-role');
  const purseVal = h('b', { text: '0.000' });
  const purse = h('div.dlg-purse', { title: 'CREDIT simulasi — bukan uang sungguhan' }, [h('i'), h('span', { text: 'CREDIT' }), purseVal, h('small', { text: 'simulasi' })]);
  const deltaEl = h('div.dlg-delta');
  const askText = h('span');
  const askEl = h('div.dlg-ask', {}, [h('b', { text: 'Kamu' }), askText]);
  const textEl = h('p.dlg-text', { 'aria-live': 'polite' });
  const moreEl = h('span.dlg-more', { 'aria-hidden': 'true' });
  const say = h('div.dlg-say', {}, [textEl]);
  const thinkLamp = lampIco('sedang');
  const thinkL1 = h('span');
  const thinkTok = h('b', { text: '0' });
  const thinkModel = h('span');
  const thinkBar = h('div.bar', {}, [h('i')]);
  const think = h('div.dlg-think', {}, [
    thinkLamp,
    h('div.tx', {}, [
      h('div.l1', {}, [thinkL1, h('span.dots', {}, [h('i'), h('i'), h('i')])]),
      h('div.l2', {}, [thinkTok, ' token · ', thinkModel, ' · simulasi']),
      thinkBar,
    ]),
  ]);
  const receipt = h('div.dlg-receipt');
  const stamp = h('div.dlg-stamp', {}, [h('i'), 'Dicatat di Jurnal']);
  const foot = h('div.dlg-foot', {}, [receipt, stamp]);
  const body = h('div.dlg-body', {}, [askEl, think, say, foot]);
  const scroll = h('div.dlg-scroll');
  const hints = h('div.dlg-hints');
  const panel = h('section.dlg-panel', { role: 'dialog', 'aria-label': 'Percakapan', 'data-interactive': '' }, [
    h('div.dlg-head', {}, [h('div.dlg-plate', {}, [nameEl, roleEl]), purse, deltaEl]),
    body, scroll, hints,
  ]);
  const wrap = h('div.dlg', { 'data-state': 'closed' }, [h('div.dlg-shade'), h('div.dlg-bar.top'), h('div.dlg-bar.bot'), panel]);
  host.appendChild(wrap);

  function lampIco(tier) {
    return h('span.lamp-ico', { 'data-tier': tier }, [h('span.cap'), h('span.glass'), h('span.fl'), h('span.base')]);
  }

  // ---------------------------------------------------------------- state
  let S = 'closed';
  let seq = 0; // invalidates in-flight think() promises after close
  let meta = null;
  let npcRef = null;
  let items = []; // focusable [{ el, run, locked }]
  let sel = 0;
  let curTopic = null;
  let curTier = null;
  let thinking = null;
  let pendingClue = null;
  let lastSay = { text: '', tier: null };
  let byeTimer = -1;
  let extraDigit = 0;
  let lastDevice = '';
  let purseTimer = 0;
  let lastNow = 0;
  let topicCount = 0;
  const stick = { dir: '', t: 0, fire: false };

  const dlg = {
    isOpen: false,
    npcId: null,
    speaking: false,
    get state() { return S; },
    get typing() { return !tw.done; },
    open,
    close,
    update,
  };

  // ---------------------------------------------------------------- typewriter
  const tw = { words: [], text: '', i: 0, acc: 0, pause: 0, cps: 60, done: true, cur: 0, onDone: null, redup: false };

  function setText(text, tier, cps, onDone) {
    textEl.textContent = '';
    tw.words = [];
    let idx = 0;
    for (const part of String(text).split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { textEl.appendChild(document.createTextNode(part)); idx += part.length; continue; }
      const v = h('span.v');
      const hd = h('span.h', { text: part });
      const w = h('span.w', {}, [v, hd]);
      if (tier === 'redup') {
        w.style.setProperty('--d', (-Math.random() * 2.8).toFixed(2) + 's');
        w.style.setProperty('--r', ((Math.random() - 0.5) * 1.8).toFixed(2) + 'deg');
        w.style.setProperty('--y', ((Math.random() - 0.5) * 2.4).toFixed(2) + 'px');
      }
      textEl.appendChild(w);
      tw.words.push({ v, hd, text: part, start: idx, shown: 0 });
      idx += part.length;
    }
    textEl.appendChild(moreEl);
    Object.assign(tw, { text: String(text), i: 0, acc: 0, pause: 0.12, cps, done: false, cur: 0, onDone, redup: tier === 'redup' });
    dlg.speaking = true;
    say.classList.remove('done');
    if (!cps) twFinish();
  }

  function twRender() {
    while (tw.cur < tw.words.length) {
      const w = tw.words[tw.cur];
      const n = Math.max(0, Math.min(w.text.length, tw.i - w.start));
      if (n !== w.shown) {
        w.v.textContent = w.text.slice(0, n);
        w.hd.textContent = w.text.slice(n);
        w.shown = n;
      }
      if (n >= w.text.length) tw.cur++;
      else break;
    }
  }

  function twFinish() {
    if (tw.done) return;
    tw.i = tw.text.length;
    twRender();
    tw.done = true;
    dlg.speaking = false;
    say.classList.add('done');
    const cb = tw.onDone;
    tw.onDone = null;
    cb?.();
  }

  function twUpdate(dt) {
    if (tw.done) return;
    dlg.speaking = true;
    let budget = dt;
    // Punctuation pauses consume time first; leftover time keeps typing (slow frames stay smooth).
    for (let guard = 0; guard < 64 && budget > 0 && tw.i < tw.text.length; guard++) {
      if (tw.pause > 0) {
        const use = Math.min(tw.pause, budget);
        tw.pause -= use;
        budget -= use;
        continue;
      }
      const rate = tw.cps * (tw.redup ? 0.55 + Math.random() * 0.95 : 1);
      tw.acc += rate * budget;
      budget = 0;
      while (tw.acc >= 1 && tw.i < tw.text.length) {
        tw.acc -= 1;
        tw.i++;
        const ch = tw.text[tw.i - 1];
        const next = tw.text[tw.i] ?? ' ';
        let p = 0;
        if ('.!?…'.includes(ch) && /[\s"”']/.test(next)) p = tw.redup ? 0.3 : 0.22;
        else if (',;:—'.includes(ch)) p = 0.08;
        if (p) { tw.pause = p; budget = tw.acc / rate; tw.acc = 0; break; }
      }
    }
    twRender();
    if (tw.i >= tw.text.length) twFinish();
  }

  function showSay(text, tier, cps, onDone) {
    lastSay = { text, tier };
    say.className = 'dlg-say' + (tier ? ' t-' + tier : '');
    void say.offsetWidth; // restart the reveal animation
    say.classList.add('reveal');
    say.style.display = '';
    panel.dataset.tier = tier || '';
    setText(text, tier, cps, onDone);
  }

  // ---------------------------------------------------------------- helpers
  function setState(s) {
    S = s;
    wrap.dataset.state = s;
    refreshHints();
  }

  function setItems(list, initial = 0) {
    items = list;
    sel = -1;
    const first = items.findIndex((it, i) => i >= initial && !it.locked);
    setSel(first >= 0 ? first : items.findIndex((it) => !it.locked));
  }

  function setSel(i) {
    if (i == null || i < 0 || i >= items.length) { sel = -1; items.forEach((it) => it.el.classList.remove('sel')); return; }
    sel = i;
    items.forEach((it, k) => it.el.classList.toggle('sel', k === i));
    try { items[i].el.scrollIntoView({ block: 'nearest' }); } catch { /* old browsers */ }
  }

  function enabledOrder() { return items.map((it, i) => (it.locked ? -1 : i)).filter((i) => i >= 0); }

  // Spatial navigation over whatever layout the CSS produced (grid, rows, columns).
  function nav(dx, dy) {
    const order = enabledOrder();
    if (!order.length) return;
    if (sel < 0) { setSel(order[0]); return; }
    const cur = items[sel].el.getBoundingClientRect();
    const cx = cur.left + cur.width / 2, cy = cur.top + cur.height / 2;
    let best = -1, bestScore = Infinity;
    for (const i of order) {
      if (i === sel) continue;
      const r = items[i].el.getBoundingClientRect();
      const ddx = r.left + r.width / 2 - cx, ddy = r.top + r.height / 2 - cy;
      const primary = dx ? ddx * dx : ddy * dy;
      if (primary <= 4) continue;
      const score = primary + Math.abs(dx ? ddy : ddx) * 2.2;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) {
      const k = order.indexOf(sel);
      const step = dx + dy > 0 ? 1 : -1;
      best = order[(k + step + order.length) % order.length];
    }
    if (best !== sel) setSel(best);
  }

  function activate(i) {
    const it = items[i];
    if (!it || it.locked) {
      it?.el.classList.remove('shake'); void it?.el.offsetWidth; it?.el.classList.add('shake');
      return;
    }
    it.run();
  }

  function option(cls, key, label, meta, run, locked = false) {
    const el = h(locked ? 'div.dlg-opt' + cls : 'button.dlg-opt' + cls, locked ? {} : { type: 'button' }, [
      key != null ? h('span.k', { text: String(key) }) : null,
      h('span.lbl', { text: label }),
      meta ? h('span.meta', {}, meta) : null,
    ]);
    const it = { el, run, locked };
    if (!locked) {
      el.addEventListener('click', (e) => { e.stopPropagation(); setSel(items.indexOf(it)); run(); });
      el.addEventListener('mousemove', () => { const k = items.indexOf(it); if (k !== sel && k >= 0) setSel(k); });
    }
    return it;
  }

  function chip(tier) { return h('span.chip.' + tier, { text: TIERS[tier].label }); }

  // ---------------------------------------------------------------- purse
  function updatePurse() { purseVal.textContent = formatCredit(ctx.credit?.balance ?? state.progress.credit.balance); }

  events.on('credit:change', ({ delta } = {}) => {
    updatePurse();
    if (!dlg.isOpen || !delta) return;
    purse.classList.remove('spend', 'earn');
    purse.classList.add(delta < 0 ? 'spend' : 'earn');
    purseTimer = 1.2;
    deltaEl.textContent = formatCredit(delta, { sign: true });
    deltaEl.className = 'dlg-delta ' + (delta < 0 ? 'neg' : 'pos');
    void deltaEl.offsetWidth;
    deltaEl.classList.add('go');
  });

  // ---------------------------------------------------------------- hints
  // Touch-capable devices count as 'touch' until a physical key is used.
  let sawKey = false;
  window.addEventListener('keydown', () => { sawKey = true; }, { passive: true });
  function deviceOf() {
    const d = input.device || 'kbm';
    return d === 'kbm' && ctx.engine?.isTouch && !sawKey ? 'touch' : d;
  }

  function refreshHints() {
    lastDevice = input.device;
    const dev = deviceOf();
    wrap.dataset.device = dev;
    const pad = dev === 'gamepad';
    const K = (k) => h('kbd', { text: k });
    const row = (k, t) => h('span', {}, [K(k), t]);
    const ok = pad ? 'A' : 'Enter', back = pad ? 'B' : 'Esc', move = pad ? 'D-pad' : '↑↓';
    let list = [];
    if (S === 'greet' || S === 'bye' || (S === 'answer' && !tw.done)) list = [row(ok, 'Lewati')];
    else if (S === 'topics') list = [row(pad ? move : (topicCount > 1 ? `1–${Math.min(9, topicCount)}` : '1'), 'Pilih'), row(ok, 'Tanya'), row(back, 'Pamit')];
    else if (S === 'tiers') list = [row(pad ? move : '1–3', 'Pilih lampu'), row(ok, 'Bayar'), row(back, 'Kembali')];
    else if (S === 'answer') list = [row(ok, 'Lanjut'), row(back, 'Kembali')];
    else if (S === 'thinking') list = [h('span', { text: 'Pikiran sedang dirangkai · simulasi' })];
    hints.replaceChildren(...list);
  }

  // ---------------------------------------------------------------- screens
  function renderTopics() {
    const topics = ctx.mind?.topicsFor(dlg.npcId) || [];
    const list = h('div.dlg-list');
    const its = [];
    let n = 0;
    for (const t of topics) {
      if (!t.available) {
        its.push(option('.locked', null, t.hint || 'Belum terpikir untuk ditanyakan', [h('span.ico-lock')], null, true));
        continue;
      }
      n++;
      const meta = t.asked ? [h('span.ico-check'), chip(t.asked)] : t.isNew ? [h('span.new-dot', { title: 'Baru' })] : null;
      its.push(option(t.asked ? '.asked' : '', n <= 9 ? n : null, t.label, meta, () => chooseTopic(t)));
    }
    const bye = option('.bye.wide', deviceOf() === 'kbm' ? 'Esc' : null, 'Pamit', null, () => farewell());
    its.push(bye);
    for (const it of its) list.appendChild(it.el);
    const bal = ctx.credit?.balance ?? 0;
    if (bal + 1e-9 < TIERS.sedang.cost) {
      list.appendChild(h('div.dlg-note', {
        html: bal + 1e-9 < TIERS.redup.cost
          ? 'Kantong pikiranmu kosong. Pertanyaan yang sudah dibayar tetap gratis diulang. Pungut <b>kilau hijau</b> di jalan, atau mampir ke Mbah Sarni.'
          : 'Kantong pikiranmu tipis. Pungut <b>kilau hijau</b> di jalan untuk menambah CREDIT.',
      }));
    }
    scroll.replaceChildren(list);
    scroll.classList.remove('fade'); void scroll.offsetWidth; scroll.classList.add('fade');
    // Default focus: first new topic, else the first one.
    const firstNew = topics.filter((t) => t.available).findIndex((t) => t.isNew);
    setItems(its, firstNew >= 0 ? firstNew : 0);
    topicCount = n;
    refreshHints();
  }

  function renderTiers(preferred) {
    const t = curTopic;
    const head = h('div.dlg-tiers-head', {}, [
      h('h3', { text: `Seberapa terang ${meta.name} berpikir?` }),
      h('span.bal', {}, ['Saldo ', h('b', { text: formatCredit(ctx.credit?.balance ?? 0) }), ' CREDIT · simulasi']),
    ]);
    const lamps = h('div.dlg-lamps');
    const its = [];
    TIER_ORDER.forEach((tier, i) => {
      const T = TIERS[tier];
      const q = ctx.mind.quote(dlg.npcId, t.id, tier);
      const off = !q.affordable;
      const note = q.replay ? 'Sudah dibayar · ulang gratis' : off ? `CREDIT kurang — butuh ${formatCredit(T.cost)}` : T.blurb;
      const el = h('button.lamp' + (q.replay ? '.paid' : '') + (off ? '.off' : ''), { type: 'button', 'data-tier': tier, 'aria-disabled': off ? 'true' : 'false' }, [
        h('span.k', { text: String(i + 1) }),
        lampIco(tier),
        h('span.nm', { text: T.label }),
        h('span.md', { text: T.model }),
        h('span.cs', {}, [q.replay ? 'gratis' : formatCredit(T.cost), h('small', { text: 'CREDIT' })]),
        h('span.nt', { text: note }),
      ]);
      const it = { el, run: () => chooseTier(tier), locked: off, tier };
      el.addEventListener('click', (e) => { e.stopPropagation(); setSel(its.indexOf(it)); activate(its.indexOf(it)); });
      el.addEventListener('mousemove', () => { const k = its.indexOf(it); if (k !== sel && !it.locked) setSel(k); });
      its.push(it);
      lamps.appendChild(el);
    });
    const parts = [head, lamps];
    const c = state.progress.credit;
    if (its.every((it) => it.locked)) {
      parts.push(h('div.dlg-tip', { html: 'Kantong pikiranmu kosong. Pungut <b>kilau hijau</b> di jalan, atau mampir ke <b>Mbah Sarni</b>.' }));
    } else if (!c.thoughts) {
      parts.push(h('div.dlg-tip', { html: 'Pertama kali? <b>Redup</b> murah tapi sering ngawur. <b>Terang</b> mahal tapi jelas. Pertanyaan yang sudah dibayar boleh diulang gratis. Semua biaya di sini <b>simulasi</b>.' }));
    }
    scroll.replaceChildren(h('div.dlg-tiers', {}, parts));
    scroll.classList.remove('fade'); void scroll.offsetWidth; scroll.classList.add('fade');
    items = its;
    // Default: requested tier, else the best already-paid tier, else Sedang, else what we can afford.
    const prev = ctx.mind.askedTier(dlg.npcId, t.id);
    const want = [preferred, prev, 'sedang', 'redup', 'terang'].find((x) => x && its.find((it) => it.tier === x && !it.locked));
    setSel(want ? its.findIndex((it) => it.tier === want) : -1);
    lamps.classList.toggle('has-sel', sel >= 0);
  }

  function renderAnswerOptions() {
    const list = h('div.dlg-list.single');
    const kb = deviceOf() === 'kbm';
    const its = [option('', kb ? 1 : null, 'Lanjut', null, () => toTopics(true))];
    const next = TIER_ORDER[tierRank(curTier) + 1];
    if (next) {
      const q = ctx.mind.quote(dlg.npcId, curTopic.id, next);
      const label = q.replay ? `Ingat versi ${TIERS[next].label} (gratis)` : `Tanya lebih terang · ${TIERS[next].label}`;
      its.push(option('', kb ? 2 : null, label, [chip(next)], () => toTiers(curTopic, next)));
    }
    for (const it of its) list.appendChild(it.el);
    scroll.replaceChildren(list);
    scroll.classList.remove('fade'); void scroll.offsetWidth; scroll.classList.add('fade');
    setItems(its, 0);
  }

  // ---------------------------------------------------------------- flow
  function open(npcId) {
    if (dlg.isOpen) return false;
    if (!NPC_LINES[npcId] || !ctx.mind) return false;
    meta = ctx.mind.meta(npcId);
    npcRef = ctx.npcs?.get?.(npcId) || null;
    dlg.isOpen = true;
    dlg.npcId = npcId;
    lastNow = performance.now();
    seq++;
    state.pushMode('dialogue');

    // Camera: over-the-shoulder framing between player and NPC.
    const spot = LANDMARKS.npcs[npcId];
    const target = npcRef?.headPosition?.() || { x: spot.x, y: (ctx.player?.position?.y ?? 2) + 1.4, z: spot.z };
    try { ctx.cameraRig?.focusOn?.(target, { npcId }); } catch (err) { console.warn('[dialogue] focusOn failed', err); }
    try { ctx.player?.faceToward?.(target.x, target.z); } catch { /* optional */ }
    try { input.exitPointerLock?.(); } catch { /* optional */ }

    nameEl.textContent = meta.name;
    roleEl.textContent = meta.role;
    updatePurse();
    receipt.classList.remove('on');
    stamp.classList.remove('on');
    askEl.classList.remove('on');
    think.classList.remove('on');
    scroll.replaceChildren();
    wrap.classList.add('on');

    let text;
    let gift = false;
    if (npcId === 'sarni' && ctx.credit?.giftEligible?.()) {
      text = ctx.mind.giftLine('sarni');
      gift = ctx.credit.grantSarniGift();
      const f = state.progress.flags;
      f.talks_sarni = (Number(f.talks_sarni) || 0) + 1;
    } else {
      text = ctx.mind.greeting(npcId);
    }
    events.emit('dialogue:open', { npcId });
    setState('greet');
    showSay(text, null, CPS.greet, () => {
      if (gift) showGiftReceipt();
      toTopics(false);
    });
    return true;
  }

  function showGiftReceipt() {
    receipt.replaceChildren(h('span.c.pos', { text: '+0.050 CREDIT' }), ' · hadiah Mbah Sarni · ', h('span.sim', { text: 'simulasi' }));
    receipt.classList.add('on');
    events.emit('toast', { text: 'Mbah Sarni memberimu 0.050 CREDIT (simulasi)', kind: 'credit' });
  }

  function toTopics(more) {
    curTopic = null;
    curTier = null;
    thinking = null;
    think.classList.remove('on');
    askEl.classList.remove('on');
    if (more) {
      receipt.classList.remove('on');
      stamp.classList.remove('on');
      if (dlg.npcId === 'sarni' && ctx.credit?.giftEligible?.()) {
        const ok = ctx.credit.grantSarniGift();
        showSay(ctx.mind.giftLine('sarni'), null, CPS.line, ok ? showGiftReceipt : null);
      } else {
        showSay(ctx.mind.moreLine(dlg.npcId), null, CPS.line, null);
      }
    } else if (say.style.display === 'none') {
      showSay(lastSay.text, lastSay.tier, 0, null);
    }
    setState('topics');
    renderTopics();
  }

  function chooseTopic(t) {
    if (!tw.done) twFinish();
    toTiers(t, null);
  }

  function toTiers(t, preferred) {
    curTopic = t;
    receipt.classList.remove('on');
    stamp.classList.remove('on');
    askText.textContent = '“' + t.ask + '”';
    askEl.classList.add('on');
    say.style.display = 'none';
    panel.dataset.tier = '';
    dlg.speaking = false;
    tw.done = true;
    setState('tiers');
    renderTiers(preferred);
  }

  function chooseTier(tier) {
    if (S !== 'tiers' || !curTopic) return;
    const q = ctx.mind.quote(dlg.npcId, curTopic.id, tier);
    if (!q.affordable) return;
    curTier = tier;
    const T = TIERS[tier];
    setState('thinking');
    scroll.replaceChildren();
    events.emit('mind:think', { npcId: dlg.npcId, topicId: curTopic.id, tier, cost: q.cost });
    thinking = { t: 0, dur: Math.max(0.2, q.thinkMs / 1000), tokens: q.tokens, tier };
    thinkLamp.dataset.tier = tier;
    thinkLamp.classList.toggle('flicker', tier === 'redup');
    thinkL1.textContent = q.replay ? `${meta.name} mengingat-ingat` : `${meta.name} sedang berpikir`;
    thinkModel.textContent = q.replay ? T.model + ' · diingat' : T.model;
    thinkTok.textContent = '0';
    thinkBar.style.setProperty('--tc', tier === 'redup' ? '#a7a2c7' : tier === 'sedang' ? '#f0b34c' : '#fff0c4');
    think.classList.add('on');
    panel.dataset.tier = tier;
    const my = seq;
    const topic = curTopic;
    ctx.mind.think(dlg.npcId, topic.id, tier)
      .then((res) => { if (my === seq && dlg.isOpen) onAnswer(res, topic); })
      .catch((err) => {
        console.error('[dialogue] think failed', err);
        if (my === seq && dlg.isOpen) toTopics(true);
      });
  }

  function onAnswer(res, topic) {
    thinking = null;
    think.classList.remove('on');
    if (res.error === 'insufficient') {
      toTiers(topic, null);
      return;
    }
    setState('answer');
    scroll.replaceChildren();
    pendingClue = res.clue || null;
    events.emit('mind:answer', { npcId: dlg.npcId, topicId: topic.id, tier: res.tier, text: res.text, clueId: res.clue?.id || null });
    showSay(res.text, res.tier, CPS[res.tier] || 60, () => {
      showReceipt(res);
      deliverClue(true);
      renderAnswerOptions();
      refreshHints();
    });
  }

  function showReceipt(res) {
    const T = TIERS[res.tier];
    const tierSpan = h('span.t-' + res.tier, { text: T.label });
    if (res.replay) {
      receipt.replaceChildren(h('span.c.free', { text: '0.000 CREDIT' }), ' · ', tierSpan, ' · diingat, gratis · ', h('span.sim', { text: 'simulasi' }));
    } else {
      const r = res.receipt || {};
      receipt.replaceChildren(
        h('span.c', { text: formatCredit(-T.cost) + ' CREDIT' }), ' · ', tierSpan, ` · ${res.tokens} token · tx ${r.hash || '0x00…00'} · `,
        h('span.sim', { text: 'simulasi' }),
      );
    }
    receipt.classList.add('on');
  }

  function deliverClue(withStamp) {
    const c = pendingClue;
    pendingClue = null;
    if (!c) return;
    const existing = (state.progress.clues || []).find((x) => x.id === c.id);
    const fresh = !existing || tierRank(c.tier) > tierRank(existing.tier);
    events.emit('clue:add', { id: c.id, text: c.text, source: c.source, tier: c.tier, kind: c.kind, npcId: c.npcId, topicId: c.topicId });
    if (fresh) {
      events.emit('toast', { text: 'Dicatat di Jurnal', kind: 'info' });
      if (withStamp) stamp.classList.add('on');
    }
  }

  function farewell() {
    if (!tw.done) twFinish();
    askEl.classList.remove('on');
    think.classList.remove('on');
    receipt.classList.remove('on');
    stamp.classList.remove('on');
    scroll.replaceChildren();
    items = [];
    setState('bye');
    byeTimer = -1;
    showSay(ctx.mind.byeLine(dlg.npcId) || 'Sampai jumpa.', null, CPS.line, () => { byeTimer = 1.0; });
  }

  function close() {
    if (!dlg.isOpen) return;
    deliverClue(false);
    const npcId = dlg.npcId;
    dlg.isOpen = false;
    dlg.speaking = false;
    seq++;
    thinking = null;
    tw.done = true;
    tw.onDone = null;
    setState('closed');
    wrap.classList.remove('on');
    if (state.mode === 'dialogue') state.popMode();
    try { ctx.cameraRig?.setMode?.('follow'); } catch { /* optional */ }
    events.emit('dialogue:close', { npcId });
    dlg.npcId = null;
    npcRef = null;
    try { state.save(); } catch { /* storage optional */ }
  }

  // Leaving dialogue mode from elsewhere (cinematic, reset): tear down without popping.
  events.on('mode:change', ({ mode }) => {
    if (dlg.isOpen && mode !== 'dialogue' && mode !== 'pause') {
      const npcId = dlg.npcId;
      deliverClue(false);
      dlg.isOpen = false;
      dlg.speaking = false;
      seq++;
      thinking = null;
      tw.done = true;
      tw.onDone = null;
      setState('closed');
      wrap.classList.remove('on');
      events.emit('dialogue:close', { npcId });
      dlg.npcId = null;
    }
  });

  // Body click / tap: skip typing, or continue.
  body.addEventListener('click', () => { if (dlg.isOpen) confirmPress(); });

  // Digits 5–9 are not input actions; listen locally while the panel is open.
  window.addEventListener('keydown', (e) => {
    if (!dlg.isOpen) return;
    const m = /^(?:Digit|Numpad)([5-9])$/.exec(e.code);
    if (m) extraDigit = Number(m[1]);
  });

  function confirmPress() {
    if (S === 'greet' || S === 'bye') {
      if (!tw.done) twFinish();
      else if (S === 'bye') close();
      return;
    }
    if (S === 'answer') {
      if (!tw.done) { twFinish(); return; }
      activate(sel);
      return;
    }
    if (S === 'topics' || S === 'tiers') activate(sel);
  }

  function digitPress(d) {
    if (S === 'greet') { twFinish(); }
    if (S === 'greet' || S === 'topics') {
      const order = enabledOrder();
      const topicIdx = order.filter((i) => !items[i].el.classList.contains('bye'));
      const i = topicIdx[d - 1];
      if (i !== undefined) { setSel(i); activate(i); }
      return;
    }
    if (S === 'tiers') {
      if (d >= 1 && d <= 3) {
        const i = items.findIndex((it) => it.tier === TIER_ORDER[d - 1]);
        if (i >= 0) { setSel(items[i].locked ? sel : i); activate(i); }
      }
      return;
    }
    if (S === 'answer') {
      if (!tw.done) { twFinish(); }
      const i = d - 1;
      if (items[i]) { setSel(i); activate(i); }
    }
  }

  function backPress() {
    if (S === 'greet') { twFinish(); return; }
    if (S === 'topics') { farewell(); return; }
    if (S === 'tiers') { toTopics(false); return; }
    if (S === 'answer') {
      if (!tw.done) { twFinish(); return; }
      toTopics(true);
      return;
    }
    if (S === 'bye') { if (!tw.done) twFinish(); else close(); }
  }

  // ---------------------------------------------------------------- update
  function update() {
    if (!dlg.isOpen) return;
    // UI timing runs on the wall clock (frame dt is capped at 50 ms by main.js; text and the
    // thinking bar must stay in sync with the setTimeout-driven think() even on slow devices).
    const now = performance.now();
    const dt = Math.min(1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (state.mode !== 'dialogue') return; // paused on top of us
    twUpdate(dt);

    if (thinking) {
      thinking.t += dt;
      const p = Math.min(1, thinking.t / thinking.dur);
      const e = 1 - Math.pow(1 - p, 2.2);
      thinkTok.textContent = String(Math.round(thinking.tokens * e));
      thinkBar.style.setProperty('--p', p.toFixed(3));
      const [g0, g1] = THINK_GLOW[thinking.tier];
      const flick = thinking.tier === 'redup' ? (Math.random() - 0.5) * 0.18 : 0;
      thinkLamp.style.setProperty('--g', (g0 + (g1 - g0) * e + flick).toFixed(3));
    }

    if (purseTimer > 0) {
      purseTimer -= dt;
      if (purseTimer <= 0) purse.classList.remove('spend', 'earn');
    }
    if (S === 'bye' && tw.done && byeTimer > 0) {
      byeTimer -= dt;
      if (byeTimer <= 0) { close(); return; }
    }
    if (input.device !== lastDevice) {
      refreshHints();
      if (S === 'topics') renderTopics();
    }

    // Input (actions are consumed so later UI modules ignore them this frame).
    const take = (a) => { if (input.pressed(a)) { input.consume(a); return true; } return false; };
    let digit = 0;
    for (let k = 1; k <= 4; k++) if (take('choice' + k)) digit = k;
    if (!digit && extraDigit) digit = extraDigit;
    extraDigit = 0;
    const ok = [take('confirm'), take('interact'), take('jump')].some(Boolean);
    const back = [take('cancel'), take('pause')].some(Boolean);
    let up = take('up'), down = take('down'), left = take('menuLeft'), right = take('menuRight');
    // Gamepad left stick acts like the d-pad (edge-triggered, then auto-repeat).
    if (input.device === 'gamepad') {
      const sy = input.move.y, sx = input.move.x;
      const dir = Math.abs(sy) > 0.55 ? (sy > 0 ? 'u' : 'd') : Math.abs(sx) > 0.55 ? (sx > 0 ? 'r' : 'l') : '';
      if (dir !== stick.dir) { stick.dir = dir; stick.t = 0.38; if (dir) stick.fire = true; }
      else if (dir) { stick.t -= dt; if (stick.t <= 0) { stick.t = 0.13; stick.fire = true; } }
      if (stick.fire) {
        stick.fire = false;
        if (dir === 'u') up = true; else if (dir === 'd') down = true; else if (dir === 'l') left = true; else if (dir === 'r') right = true;
      }
    }
    take('journal');
    if (S === 'thinking') return;

    if (digit) { digitPress(digit); return; }
    if (back) { backPress(); return; }
    if (ok) { confirmPress(); return; }
    if (S === 'topics' || S === 'tiers' || (S === 'answer' && tw.done)) {
      if (up) nav(0, -1);
      else if (down) nav(0, 1);
      else if (left) nav(-1, 0);
      else if (right) nav(1, 0);
    }
  }

  updatePurse();
  return dlg;
}
