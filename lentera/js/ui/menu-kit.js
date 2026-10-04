// Menu building blocks: focusable items (button, slider, toggle, cycle, tabs), section labels
// and the panel frame. Items share one interface used by menus.js for focus + input:
//   { el, kind, activate(), adjust(dir) -> bool (consumed), desc, disabled, refresh() }
// Owner: ui-audio.

import { h } from '../core/dom.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function button(label, onActivate, opts = {}) {
  const children = [h('span.lm-btn-l', {}, label)];
  if (opts.sub) children.push(h('small.lm-btn-s', {}, opts.sub));
  const el = h('button.' + (opts.cls || 'lm-btn'), { type: 'button', tabindex: '-1' }, children);
  if (opts.danger) el.classList.add('danger');
  const item = {
    el, kind: 'button', desc: opts.desc || '', disabled: !!opts.disabled, sound: opts.sound || 'ui-confirm',
    activate() { if (!item.disabled) onActivate?.(); },
    adjust() { return false; },
    refresh() {},
  };
  if (item.disabled) el.classList.add('disabled');
  return item;
}

export function slider(label, { min = 0, max = 1, step = 0.05, get, set, format = (v) => `${Math.round(v * 100)}%`, desc = '' } = {}) {
  const fill = h('div.lm-sl-fill');
  const knob = h('div.lm-sl-knob');
  const track = h('div.lm-sl-track', {}, [fill, knob]);
  const val = h('span.lm-val');
  const el = h('div.lm-row', { role: 'slider', tabindex: '-1', 'aria-label': label, 'aria-valuemin': String(min), 'aria-valuemax': String(max) }, [
    h('span.lm-row-l', {}, label),
    h('span.lm-sl', {}, [track, val]),
  ]);
  const snap = (v) => +clamp(min + Math.round((v - min) / step) * step, min, max).toFixed(4);
  const item = {
    el, kind: 'slider', desc,
    onChange: null,
    activate() {},
    adjust(dir) {
      const before = get();
      const v = snap(before + dir * step);
      if (v !== before) { set(v); refresh(); item.onChange?.(); }
      return true;
    },
    refresh,
  };
  function refresh() {
    const v = get();
    const k = (v - min) / (max - min || 1);
    fill.style.width = `${(k * 100).toFixed(2)}%`;
    knob.style.left = `${(k * 100).toFixed(2)}%`;
    val.textContent = format(v);
    el.setAttribute('aria-valuenow', String(v));
  }
  let dragging = false;
  function fromX(x) {
    const r = track.getBoundingClientRect();
    const v = snap(min + clamp((x - r.left) / (r.width || 1), 0, 1) * (max - min));
    if (v !== get()) { set(v); refresh(); item.onChange?.(); }
  }
  track.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    try { track.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    item.onFocusRequest?.();
    fromX(e.clientX);
  });
  track.addEventListener('pointermove', (e) => { if (dragging) fromX(e.clientX); });
  const end = () => { dragging = false; };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('click', (e) => e.stopPropagation());
  refresh();
  return item;
}

export function toggle(label, { get, set, desc = '', on = 'Aktif', off = 'Mati' } = {}) {
  const txt = h('span.lm-tg-t');
  const wrap = h('span.lm-tg', {}, [h('span.lm-tg-sw'), txt]);
  const el = h('div.lm-row', { role: 'switch', tabindex: '-1', 'aria-label': label }, [h('span.lm-row-l', {}, label), wrap]);
  const item = {
    el, kind: 'toggle', desc, onChange: null,
    activate() { set(!get()); refresh(); item.onChange?.(); },
    adjust(dir) {
      const want = dir > 0;
      if (want !== !!get()) { set(want); refresh(); item.onChange?.(); }
      return true;
    },
    refresh,
  };
  function refresh() {
    const v = !!get();
    wrap.classList.toggle('on', v);
    txt.textContent = v ? on : off;
    el.setAttribute('aria-checked', String(v));
  }
  refresh();
  return item;
}

export function cycle(label, { options, get, set, desc = '' } = {}) {
  const val = h('span.lm-cy-v');
  const pips = h('span.lm-cy-p', {}, options.map(() => h('i')));
  const left = h('button.lm-cy-a', { type: 'button', tabindex: '-1', 'aria-label': 'Sebelumnya' }, '‹');
  const right = h('button.lm-cy-a', { type: 'button', tabindex: '-1', 'aria-label': 'Berikutnya' }, '›');
  const el = h('div.lm-row', { role: 'listbox', tabindex: '-1', 'aria-label': label }, [
    h('span.lm-row-l', {}, label),
    h('span.lm-cy', {}, [left, h('span.lm-cy-m', {}, [val, pips]), right]),
  ]);
  const idx = () => Math.max(0, options.findIndex((o) => o[0] === get()));
  const item = {
    el, kind: 'cycle', desc, onChange: null,
    activate() { item.adjust(1); },
    adjust(dir) {
      const i = (idx() + dir + options.length) % options.length;
      set(options[i][0]);
      refresh();
      item.onChange?.();
      return true;
    },
    refresh,
  };
  function refresh() {
    const i = idx();
    val.textContent = options[i][1];
    [...pips.children].forEach((p, k) => p.classList.toggle('on', k === i));
  }
  for (const [b, d] of [[left, -1], [right, 1]]) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.detail === 0) return;
      item.onFocusRequest?.();
      item.adjust(d);
      item.onSound?.('ui-move');
    });
  }
  refresh();
  return item;
}

export function tabs(labels, { get, set } = {}) {
  const btns = labels.map((l) => h('button.lm-tab', { type: 'button', tabindex: '-1', role: 'tab' }, l));
  const el = h('div.lm-tabs', { role: 'tablist', tabindex: '-1' }, btns);
  const item = {
    el, kind: 'tabs', desc: '', onChange: null,
    activate() { item.adjust(1); },
    adjust(dir) {
      set((get() + dir + labels.length) % labels.length);
      refresh();
      item.onChange?.();
      return true;
    },
    refresh,
  };
  function refresh() {
    btns.forEach((b, i) => {
      b.classList.toggle('on', i === get());
      b.setAttribute('aria-selected', String(i === get()));
    });
  }
  btns.forEach((b, i) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.detail === 0) return;
    item.onFocusRequest?.();
    if (i !== get()) { set(i); refresh(); item.onChange?.(); item.onSound?.('ui-move'); }
  }));
  refresh();
  return item;
}

export function section(label) {
  return h('div.lm-sec', { role: 'presentation' }, [h('span', {}, label)]);
}

// Panel frame: kicker + display title + back button, kawung band, scrolling body, description.
export function panel({ kicker = '', title = '', body = [], onBack = null, cls = '', backLabel = 'Kembali' } = {}) {
  const back = onBack ? h('button.lm-back', { type: 'button', tabindex: '-1', 'aria-label': backLabel }, [h('i'), backLabel]) : null;
  if (back) back.addEventListener('click', (e) => { if (e.detail !== 0) onBack(); });
  const bodyEl = h('div.lm-pb', {}, body);
  const descEl = h('div.lm-pd', { 'aria-live': 'polite' });
  const el = h('section.lm-panel' + (cls ? '.' + cls : ''), { role: 'dialog', 'aria-label': title }, [
    h('header.lm-ph', {}, [h('div.lm-ph-k', {}, kicker), h('h2.lm-ph-t', {}, title), back]),
    h('div.lm-band', { 'aria-hidden': 'true' }),
    bodyEl,
    descEl,
  ]);
  return { el, bodyEl, descEl };
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

export function fmtCredit(v) { return (Math.round((v || 0) * 1000) / 1000).toFixed(3); }

// The lentera glyph (same drawing as the HUD gauge) for brand marks.
export function lanternSvg(cls = 'lm-lamp') {
  const wrap = h('div.' + cls, { 'aria-hidden': 'true' });
  wrap.innerHTML = `
<svg viewBox="0 0 40 60">
  <defs>
    <radialGradient id="lmFlame" cx="50%" cy="70%" r="60%"><stop offset="0" stop-color="#fff6d8"/><stop offset="0.35" stop-color="#ffcf6b"/><stop offset="0.8" stop-color="#ff8a2a"/><stop offset="1" stop-color="#ff6a1e" stop-opacity="0"/></radialGradient>
    <radialGradient id="lmGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffb547" stop-opacity="0.65"/><stop offset="1" stop-color="#ffb547" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="20" cy="33" r="20" fill="url(#lmGlow)"/>
  <g fill="none" stroke="#efe6d2" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M15.5 9 a4.5 4.5 0 0 1 9 0"/>
    <rect x="13" y="17" width="14" height="22" rx="3"/>
    <line x1="20" y1="17" x2="20" y2="20"/>
  </g>
  <path d="M10.5 13 L29.5 13 L27 17 L13 17 Z" fill="#efe6d2"/>
  <path d="M11 39 L29 39 L26.5 43.5 L13.5 43.5 Z" fill="#efe6d2"/>
  <path class="lm-lamp-fl" d="M20 21.5 C24.4 26.5 24.8 31 20 35.6 C15.2 31 15.6 26.5 20 21.5 Z" fill="url(#lmFlame)"/>
</svg>`;
  return wrap;
}
