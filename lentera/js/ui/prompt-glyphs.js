// Device-aware button glyphs ("keycaps") shared by prompts, hints, HUD and menus.
// Owner: ui-audio. Text tokens like "Tekan {jump}" become keycaps for the active device.

import { GLYPHS } from '../core/input.js';
import { h, injectStyle } from '../core/dom.js';

const CSS = `
.lk {
  display: inline-flex; align-items: center; justify-content: center; vertical-align: -0.12em;
  min-width: 1.75em; height: 1.75em; padding: 0 0.5em; margin: 0 0.12em; box-sizing: border-box;
  font: 500 0.74em/1 var(--font-mono); letter-spacing: 0.02em; color: var(--paper);
  background: linear-gradient(180deg, rgba(239,230,210,0.16), rgba(239,230,210,0.06));
  border: 1px solid rgba(239,230,210,0.5); border-bottom-width: 2px; border-radius: 6px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.35); text-shadow: none; white-space: nowrap;
}
.lk.lk-gamepad { border-radius: 999px; border-bottom-width: 1px; min-width: 1.85em; height: 1.85em; font-weight: 500; }
.lk.lk-gamepad.lk-face { padding: 0; width: 1.85em; }
.lk.lk-gamepad.lk-a { border-color: rgba(143,227,160,0.75); color: #c9f5d0; }
.lk.lk-gamepad.lk-b { border-color: rgba(240,128,112,0.75); color: #ffd2c8; }
.lk.lk-gamepad.lk-x { border-color: rgba(120,170,255,0.8); color: #d4e3ff; }
.lk.lk-gamepad.lk-y { border-color: rgba(255,214,102,0.8); color: #fff0c4; }
.lk.lk-touch { font: 700 0.72em/1 var(--font-body); letter-spacing: 0.06em; text-transform: uppercase; border-radius: 999px; border-bottom-width: 1px; padding: 0 0.75em; }
.lk.lk-stick { border-radius: 999px; border-style: solid; border-bottom-width: 1px; box-shadow: inset 0 0 0 3px rgba(239,230,210,0.08), 0 1px 6px rgba(0,0,0,0.35); }
.lk-sep { opacity: 0.55; margin: 0 0.1em; font-size: 0.85em; }
`;

injectStyle('lentera-keycaps', CSS);

// input.device starts as 'kbm' even on phones (until the first touch). On touch hardware show
// touch glyphs until a physical key is actually pressed.
let keyboardSeen = false;
try { window.addEventListener('keydown', () => { keyboardSeen = true; }, { capture: true, passive: true }); } catch { /* no window */ }

export function effectiveDevice(ctx) {
  const d = ctx?.input?.device || 'kbm';
  if (d === 'kbm' && ctx?.engine?.isTouch && !keyboardSeen) return 'touch';
  return d;
}

export const ACTION_NAMES = {
  move: 'Bergerak', look: 'Lihat sekeliling', jump: 'Lompat', sprint: 'Lari', interact: 'Interaksi',
  flare: 'Sinar lentera', journal: 'Jurnal', pause: 'Jeda', confirm: 'Pilih', cancel: 'Kembali',
};

export function glyphText(device, action) {
  const set = GLYPHS[device] || GLYPHS.kbm;
  return set[action] ?? GLYPHS.kbm[action] ?? action;
}

// A single keycap element for an action on a device.
export function keycap(action, device = 'kbm', textOverride) {
  const label = textOverride ?? glyphText(device, action);
  const el = h('span.lk', { 'aria-label': label }, label);
  el.classList.add('lk-' + device);
  if (device === 'gamepad') {
    if (/^[ABXY]$/.test(label)) el.classList.add('lk-face', 'lk-' + label.toLowerCase());
    if (/^[LR]$/.test(label)) el.classList.add('lk-stick', 'lk-face');
  }
  return el;
}

// A raw keycap with arbitrary text (controls tables).
export function rawKeycap(text, device = 'kbm') {
  return keycap(null, device, text);
}

// Fill `el` with text where {action} tokens become keycaps for `device`.
export function setRichText(el, text, device = 'kbm') {
  el.textContent = '';
  const re = /\{(\w+)\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
    el.appendChild(keycap(m[1], device));
    last = re.lastIndex;
  }
  if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
  return el;
}

// Plain-text version (aria labels, logs).
export function plainText(text, device = 'kbm') {
  return String(text).replace(/\{(\w+)\}/g, (_, a) => glyphText(device, a));
}
