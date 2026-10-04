// Menus: title screen over the live scene, pause, settings, controls, confirm steps and the
// end credits. Navigable by keyboard, gamepad (actions), mouse hover/click and touch.
// Owner: ui-audio. API: DESIGN.md §7 menus (+ additions: openPause(), resume(),
// openSettings(), openControls(), showCredits(stats), isOpen).
//
// Emits: game:start {newGame}, game:quit {}, settings:change {key, value}, menu:open {id},
// credits:close {to}. Listens: mode:change, credits:show {stats}.

import { h, injectStyle, uiRoot } from '../core/dom.js';
import { detectQuality } from '../core/engine.js';
import { loadJSON } from '../core/save.js';
import { MENU_CSS } from './menu-style.js';
import { button, lanternSvg } from './menu-kit.js';
import { settingsScreen, controlsScreen, confirmScreen, pauseScreen, creditsScreen } from './menu-screens.js';
import { keycap, rawKeycap, effectiveDevice } from './prompt-glyphs.js';

const QUEST_LABEL = {
  arrive: 'Baru tiba di pulau', kindle: 'Api unggun kampung', seek: 'Mencari Api Pusaka',
  beacon: 'Menuju mercusuar', finale: 'Mercusuar menyala', done: 'Kabut sudah terangkat',
};

function saveSummary() {
  const p = loadJSON('progress', null);
  if (!p) return '';
  const fl = p.flames || {};
  const found = ['tirta', 'bumi', 'samudra'].filter((k) => fl[k] && fl[k] !== 'none').length;
  const parts = [];
  if (p.quest === 'seek' || p.quest === 'beacon') parts.push(`Api Pusaka ${found}/3`);
  else if (QUEST_LABEL[p.quest]) parts.push(QUEST_LABEL[p.quest]);
  const mins = Math.round((p.playTime || 0) / 60);
  parts.push(mins >= 60 ? `${Math.floor(mins / 60)} j ${mins % 60} mnt` : `${Math.max(1, mins)} mnt`);
  return parts.join(' · ');
}

export function createMenus(ctx) {
  const { state, input, events, engine } = ctx;
  injectStyle('lentera-menus', MENU_CSS);

  const root = uiRoot('menus');
  const lm = h('div.lm');
  const scrim = h('div.lm-scrim');
  const host = h('div.lm-host');
  const legend = h('div.lm-legend', { 'aria-hidden': 'true' });
  root.appendChild(lm);

  const audio = (name, opts) => { try { ctx.audio?.play?.(name, opts); } catch { /* audio optional */ } };

  // ---- Title layer -------------------------------------------------------
  const logo = h('h1.lm-logo', { 'aria-label': 'LENTERA' });
  [...'LENTERA'].forEach((ch, i) => {
    const s = h('span', {}, ch);
    s.style.animationDelay = `${0.35 + i * 0.09}s`;
    logo.appendChild(s);
  });
  const brand = h('div.lm-brand', {}, [lanternSvg('lm-lamp'), logo, h('div.lm-rule', {}, [h('i')]), h('div.lm-subt', {}, 'Kabut Nusantara')]);
  const titleNav = h('nav.lm-tn', { 'aria-label': 'Menu utama' });
  const titleFoot = h('div.lm-tfoot', {}, [h('b', {}, 'Prototipe'), h('span', {}, 'CREDIT disimulasikan, bukan uang sungguhan')]);
  const titleEl = h('div.lm-title', {}, [h('div.lm-title-vg'), brand, h('div.lm-tspace'), titleNav, h('div.lm-tspace', { style: { flexGrow: '0.35' } }), titleFoot]);

  const creditsLayer = h('div.lm-credits-host');
  lm.append(titleEl, scrim, host, creditsLayer, legend);

  // ---- Screen stack ------------------------------------------------------
  const stack = [];
  const top = () => stack[stack.length - 1] || null;
  let starting = false;
  let lastObjective = '';
  let legendKey = '';
  let touchLayout = null;
  let creditsScreenRef = null;

  function wireItems(screen) {
    screen.items.forEach((it, i) => {
      if (it._wired === screen) return;
      it._wired = screen;
      it.onFocusRequest = () => { const k = screen.items.indexOf(it); if (k >= 0) focusItem(screen, k, false); };
      it.onSound = (n) => audio(n);
      it.onChange = () => { screen.onItemChange?.(it); };
      it.el.addEventListener('click', (e) => {
        if (e.detail === 0 || top() !== screen || it.disabled) return; // keyboard clicks come through actions
        const k = screen.items.indexOf(it);
        if (k < 0) return;
        focusItem(screen, k, false);
        activate(screen, it);
      });
      it.el.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || top() !== screen || it.disabled) return;
        const k = screen.items.indexOf(it);
        if (k >= 0 && screen.focus !== k) focusItem(screen, k, true);
      });
      void i;
    });
  }

  function focusItem(screen, idx, sound = true) {
    const items = screen.items;
    if (!items.length) { screen.focus = 0; refreshDesc(); return; }
    idx = Math.max(0, Math.min(items.length - 1, idx));
    const prev = items[screen.focus];
    if (prev && prev !== items[idx]) prev.el.classList.remove('is-focus');
    screen.focus = idx;
    const it = items[idx];
    it.el.classList.add('is-focus');
    if (sound) audio('ui-move');
    try { it.el.focus({ preventScroll: true }); } catch { /* ignore */ }
    keepVisible(it.el);
    refreshDesc();
  }

  // Scroll only our own containers (scrollIntoView could scroll #app and shift the canvas).
  function keepVisible(el) {
    const sc = el.closest('.lm-pb, .lm-host');
    if (!sc || sc.scrollHeight <= sc.clientHeight + 1) return;
    const r = el.getBoundingClientRect(), c = sc.getBoundingClientRect();
    if (r.top < c.top + 6) sc.scrollTop -= c.top + 6 - r.top;
    else if (r.bottom > c.bottom - 6) sc.scrollTop += r.bottom - (c.bottom - 6);
  }

  function refreshDesc() {
    const s = top();
    if (!s?.descEl) return;
    const it = s.items[s.focus];
    s.descEl.textContent = it?.desc || '';
  }

  function moveFocus(dir) {
    const s = top();
    if (!s || !s.items.length) return;
    const n = s.items.length;
    let i = s.focus;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!s.items[i].disabled) break;
    }
    if (i !== s.focus) focusItem(s, i, true);
  }

  function activate(screen, it) {
    if (!it || it.disabled) return;
    if (it.kind === 'button') audio(it.sound || 'ui-confirm');
    else audio('ui-move');
    it.activate();
  }

  function setItems(screen, items, focus = 0) {
    for (const it of screen.items) it.el.classList.remove('is-focus');
    screen.items = items;
    wireItems(screen);
    if (top() === screen) focusItem(screen, focus, false);
    refreshChrome();
  }

  function open(screen) {
    const prev = top();
    if (prev && prev.inHost !== false && prev.el.parentNode === host) prev.el.classList.add('lm-under');
    screen.focus = screen.focus ?? 0;
    stack.push(screen);
    wireItems(screen);
    if (screen.inHost !== false && screen.el.parentNode !== host) host.appendChild(screen.el);
    screen.el.classList.remove('lm-out', 'lm-under');
    if (screen.inHost !== false) {
      screen.el.classList.remove('lm-in');
      void screen.el.offsetWidth;
      screen.el.classList.add('lm-in');
    }
    screen.onShow?.();
    let f = screen.focus;
    while (screen.items[f]?.disabled && f < screen.items.length - 1) f++;
    focusItem(screen, f, false);
    events.emit('menu:open', { id: screen.id });
    refreshChrome();
  }

  function removeScreenEl(s) {
    if (s.inHost === false) return;
    s.el.classList.add('lm-out');
    setTimeout(() => { if (!stack.includes(s)) s.el.remove(); }, 260);
  }

  function pop(sound = true) {
    const s = stack.pop();
    if (!s) return;
    s.onHide?.();
    removeScreenEl(s);
    const t = top();
    if (t) {
      t.el.classList.remove('lm-under');
      t.onShow?.();
      focusItem(t, t.focus, false);
    }
    if (sound) audio('ui-back');
    refreshChrome();
  }

  function back() {
    const s = top();
    if (!s) return;
    if (s.onBack && s.onBack() === true) return;
    if (stack.length <= 1) return;
    pop(true);
  }

  function closeAll() {
    while (stack.length) {
      const s = stack.pop();
      s.onHide?.();
      removeScreenEl(s);
    }
    refreshChrome();
    try { if (document.activeElement && lm.contains(document.activeElement)) document.activeElement.blur(); } catch { /* ignore */ }
  }

  function refreshChrome() {
    const s = top();
    const panelOpen = stack.some((x) => x.inHost !== false && x.id !== 'title');
    lm.classList.toggle('panel-open', panelOpen);
    lm.classList.toggle('scrim-on', panelOpen || state.mode === 'pause');
    lm.classList.toggle('legend-on', !!s);
    legendKey = '';
    updateLegend();
  }

  // Device-aware button legend along the bottom.
  function updateLegend() {
    const s = top();
    const dev = effectiveDevice(ctx);
    const kind = s ? (s.legend || (s.horizontal ? 'horizontal' : 'list')) : 'none';
    const canBack = !!s && s.id !== 'title' && s.id !== 'credits';
    const key = `${dev}|${kind}|${canBack}|${s?.id}`;
    if (key === legendKey) return;
    legendKey = key;
    legend.textContent = '';
    if (!s || dev === 'touch' || kind === 'none') return;
    const part = (caps, label) => h('span', {}, [...caps, h('em', {}, label)]);
    const pad = dev === 'gamepad';
    const nav = pad ? [rawKeycap('D-pad', 'gamepad')] : [rawKeycap('↑', 'kbm'), rawKeycap('↓', 'kbm')];
    const side = pad ? [rawKeycap('D-pad', 'gamepad')] : [rawKeycap('←', 'kbm'), rawKeycap('→', 'kbm')];
    const parts = [];
    if (kind === 'horizontal') parts.push(part(side, 'Pilih'));
    else if (kind === 'tabs') parts.push(part(nav, 'Gulir'));
    else parts.push(part(nav, 'Pilih'));
    if (kind === 'adjust') parts.push(part(side, 'Ubah'));
    if (kind === 'tabs') parts.push(part(pad ? [rawKeycap('LB', 'gamepad'), rawKeycap('RB', 'gamepad')] : side, 'Tab'));
    if (kind !== 'tabs') parts.push(part([keycap('confirm', dev)], 'OK'));
    if (canBack) parts.push(part([keycap('cancel', dev)], 'Kembali'));
    legend.append(...parts);
  }

  // ---- Settings plumbing -------------------------------------------------
  function setSetting(key, value) {
    state.settings[key] = value;
    state.saveSettings();
    if (key === 'quality') {
      const target = value === 'auto' ? detectQuality(ctx.renderer) : value;
      if (target && target !== engine.quality) {
        try { engine.setQuality(target); } catch (err) { console.warn('[menus] setQuality failed', err); }
      }
    }
    events.emit('settings:change', { key, value });
    if (/Volume$/.test(key)) ctx.audio?.applyVolumes?.();
  }

  // ---- Flows -------------------------------------------------------------
  const api = {
    ctx,
    back,
    setSetting,
    refreshDesc,
    setItems,
    play: audio,
    lastObjective: () => lastObjective,
    resume,
    openJournal() {
      resume({ relock: false });
      setTimeout(() => ctx.journal?.open?.(), 0);
    },
    openSettings(kicker = '') { open(settingsScreen(api, { kicker })); },
    openControls(kicker = '') { open(controlsScreen(api, { kicker })); },
    confirmQuit() {
      open(confirmScreen(api, {
        kicker: 'Jeda', title: 'Kembali ke judul?',
        text: 'Perjalananmu disimpan dulu. Kamu bisa lanjut lagi dari api unggun terakhir.',
        yes: 'Ya, ke judul', onYes: () => quitToTitle(),
      }));
    },
    creditsContinue() {
      hideCredits();
      state.modeStack.length = 0;
      state.setMode('play');
      ctx.cameraRig?.setMode?.('follow');
      events.emit('credits:close', { to: 'play' });
    },
    creditsToTitle() {
      hideCredits();
      events.emit('credits:close', { to: 'title' });
      quitToTitle();
    },
  };

  function buildTitleScreen() {
    const items = [];
    const hasSave = state.hasSave();
    items.push(button('Mulai Perjalanan', () => startGame(true), { cls: 'lm-ti' }));
    if (hasSave) items.push(button('Lanjutkan', () => startGame(false), { cls: 'lm-ti', sub: saveSummary() }));
    items.push(button('Pengaturan', () => api.openSettings('Menu utama'), { cls: 'lm-ti' }));
    items.push(button('Kontrol', () => api.openControls('Menu utama'), { cls: 'lm-ti' }));
    titleNav.textContent = '';
    items.forEach((it, i) => { it.el.style.animationDelay = `${1.1 + i * 0.12}s`; titleNav.appendChild(it.el); });
    return { id: 'title', el: titleEl, items, focus: hasSave ? 1 : 0, inHost: false, descEl: null, onBack: () => true };
  }

  function enterTitle() {
    closeAll();
    starting = false;
    titleEl.classList.remove('leaving');
    lm.classList.remove('title-on');
    void lm.offsetWidth;
    lm.classList.add('title-on');
    open(buildTitleScreen());
    try { ctx.cameraRig?.setMode?.('title'); } catch { /* rig optional */ }
    input.exitPointerLock();
  }

  function leaveTitle() {
    lm.classList.remove('title-on');
    if (top()?.id === 'title' || stack.some((s) => s.id === 'title')) closeAll();
  }

  function startGame(newGame) {
    if (starting) return;
    if (newGame && state.hasSave() && !startGame.confirmed) {
      open(confirmScreen(api, {
        kicker: 'Mulai baru', title: 'Mulai perjalanan baru?',
        text: 'Simpanan lamamu akan ditimpa. Api Pusaka, Kilau, dan CREDIT kembali dari awal.',
        yes: 'Mulai baru', onYes: () => { startGame.confirmed = true; startGame(true); },
      }));
      return;
    }
    startGame.confirmed = false;
    starting = true;
    ctx.audio?.unlock?.();
    if (newGame) state.resetProgress();
    titleEl.classList.add('leaving');
    closeAll();
    lm.classList.remove('panel-open');
    events.emit('game:start', { newGame });
    // Fallback when nobody runs an intro / load sequence (stub quest).
    setTimeout(() => {
      if (state.mode !== 'title') return;
      if (!newGame) state.load();
      state.setMode('play');
      try { ctx.cameraRig?.setMode?.('follow'); } catch { /* ignore */ }
    }, 520);
  }

  function quitToTitle() {
    if (state.progress.quest && state.progress.quest !== 'arrive') state.save();
    closeAll();
    state.modeStack.length = 0;
    events.emit('game:quit', {});
    state.setMode('title');
  }

  function openPauseUI() {
    closeAll();
    open(pauseScreen(api));
  }

  function resume({ relock = true } = {}) {
    closeAll();
    noRelock = !relock;
    if (state.mode === 'pause') state.popMode('play');
    noRelock = false;
  }

  function showCredits(stats) {
    closeAll();
    hideCredits();
    lm.classList.remove('title-on');
    const scr = creditsScreen(api, stats || {});
    creditsScreenRef = scr;
    creditsLayer.appendChild(scr.el);
    open(scr);
    input.exitPointerLock();
  }
  function hideCredits() {
    if (!creditsScreenRef) return;
    const s = creditsScreenRef;
    creditsScreenRef = null;
    const i = stack.indexOf(s);
    if (i >= 0) stack.splice(i, 1);
    s.el.remove();
    refreshChrome();
  }

  // ---- Events ------------------------------------------------------------
  let lockWanted = false;
  let noRelock = false;
  let wasLocked = false;

  events.on('mode:change', ({ mode, prev }) => {
    if (mode !== 'play') input.exitPointerLock();
    if (mode === 'title') enterTitle();
    else if (prev === 'title') { starting = false; leaveTitle(); }
    if (mode === 'pause' && top()?.id !== 'pause' && !stack.some((s) => s.id === 'pause')) openPauseUI();
    if (prev === 'pause' && mode !== 'pause' && stack.some((s) => s.id === 'pause')) closeAll();
    // Coming back to play from an overlay: take the mouse back if the player was using it.
    if (mode === 'play' && prev !== 'title' && prev !== 'loading' && lockWanted && !noRelock && input.device === 'kbm') {
      input.requestPointerLock();
    }
    refreshChrome();
  });
  events.on('credits:show', (p = {}) => showCredits(p.stats || p));
  events.on('objective', (p = {}) => { if (p.text) lastObjective = p.text; });

  // Canvas click in play -> pointer lock (optional; drag-to-look stays as fallback).
  const canvas = ctx.renderer?.domElement || document.getElementById('gl');
  canvas?.addEventListener('click', () => {
    if (state.mode === 'play' && input.device === 'kbm') input.requestPointerLock();
  });
  // First gesture anywhere unlocks audio so the title music can start.
  const unlockAudio = () => { try { ctx.audio?.unlock?.(); } catch { /* ignore */ } };
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio);

  // ---- Input -------------------------------------------------------------
  const holds = {};
  function repeat(key, down, pressed, dt) {
    if (pressed) { holds[key] = 0; return true; }
    if (!down) { holds[key] = -1; return false; }
    if (holds[key] == null || holds[key] < 0) { holds[key] = 0; return false; }
    holds[key] += dt;
    if (holds[key] > 0.42) { holds[key] -= 0.085; return true; }
    return false;
  }
  const stickPrev = { up: false, down: false, left: false, right: false };
  function stickDir(name, on, dt) {
    const pressed = on && !stickPrev[name];
    stickPrev[name] = on;
    return repeat('stick-' + name, on, pressed, dt);
  }

  function navigate(dt) {
    const s = top();
    if (!s) return;
    const pad = input.device === 'gamepad';
    const mx = pad ? input.move.x : 0, my = pad ? input.move.y : 0;
    const up = repeat('up', input.down('up'), input.pressed('up'), dt) | stickDir('up', my > 0.55, dt);
    const down = repeat('down', input.down('down'), input.pressed('down'), dt) | stickDir('down', my < -0.55, dt);
    const left = repeat('left', input.down('menuLeft'), input.pressed('menuLeft'), dt) | stickDir('left', mx < -0.55, dt);
    const right = repeat('right', input.down('menuRight'), input.pressed('menuRight'), dt) | stickDir('right', mx > 0.55, dt);
    const confirm = input.pressed('confirm') || input.pressed('jump');
    const cancel = input.pressed('cancel');
    const pauseBtn = input.pressed('pause') && !cancel;
    for (const a of ['confirm', 'jump', 'cancel', 'pause', 'interact', 'flare', 'journal']) input.consume(a);

    s.update?.(dt);
    if (top() !== s) return;

    const it = s.items[s.focus];
    if (s.horizontal) {
      if (left) moveFocus(-1);
      if (right) moveFocus(1);
      if (up) moveFocus(-1);
      if (down) moveFocus(1);
    } else {
      if (up) moveFocus(-1);
      if (down) moveFocus(1);
      if ((left || right) && it?.adjust) {
        if (it.adjust(left ? -1 : 1)) audio('ui-move');
      }
    }
    if (confirm) {
      if (it) activate(s, it);
      else s.onConfirmEmpty?.();
    } else if (cancel) back();
    else if (pauseBtn) {
      if (state.mode === 'pause') resume();
      else if (s.id === 'credits') s.onBack?.();
    }
  }

  function setTouchLayout(on) {
    if (on === touchLayout) return;
    touchLayout = on;
    lm.classList.toggle('touch', on);
  }

  return {
    get isOpen() { return stack.length > 0; },
    get screen() { return top()?.id || null; },
    openPause() { if (state.mode === 'play') state.pushMode('pause'); },
    resume,
    openSettings: (k) => api.openSettings(k),
    openControls: (k) => api.openControls(k),
    showCredits,
    startGame,
    update(dt) {
      setTouchLayout(effectiveDevice(ctx) === 'touch');
      const mode = state.mode;
      if (mode === 'play') {
        if (input.pointerLocked) lockWanted = true;
        else if (input.device !== 'kbm') lockWanted = false;
        // Browser released the lock (Esc / focus loss) while playing: pause like a console game.
        if (wasLocked && !input.pointerLocked && !creditsScreenRef) state.pushMode('pause');
        else if (input.pressed('pause') && !creditsScreenRef) {
          input.consume('pause');
          input.consume('cancel');
          state.pushMode('pause');
        }
      }
      wasLocked = input.pointerLocked;
      if (stack.length && !starting) navigate(dt);
      updateLegend();
    },
  };
}
