// Touch controls: dynamic left stick, right-side drag-to-look, action buttons (Lompat, Aksi,
// Nyala, Lari) and top-right Jurnal / Jeda. Only visible on touch devices while playing.
// Owner: player. Contract: DESIGN.md §7 Player (touch).

import { injectStyle, h, uiRoot } from '../core/dom.js';

const CSS = `
#touch .tc { position: absolute; inset: 0; display: none; pointer-events: none; }
#touch .tc.on { display: block; }
#touch .tc-zone { position: absolute; top: 0; bottom: 0; pointer-events: auto; touch-action: none; -webkit-user-select: none; user-select: none; }
#touch .tc-left { left: 0; width: 45%; }
#touch .tc-right { right: 0; width: 55%; }
#touch .tc-stick {
  position: absolute; width: 124px; height: 124px; margin: -62px 0 0 -62px; border-radius: 50%;
  border: 1.5px solid rgba(239, 230, 210, 0.32);
  background: radial-gradient(circle, rgba(11, 15, 28, 0.08) 0%, rgba(11, 15, 28, 0.32) 70%);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.15) inset;
  opacity: 0; transition: opacity 0.18s var(--ease); pointer-events: none;
}
#touch .tc-stick.show { opacity: 1; transition-duration: 0.05s; }
#touch .tc-stick.ghost { opacity: 0.38; }
#touch .tc-knob {
  position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px 0 0 -27px; border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, rgba(255, 214, 150, 0.95), rgba(255, 181, 71, 0.75) 55%, rgba(170, 98, 30, 0.7));
  box-shadow: 0 0 18px rgba(255, 181, 71, 0.45), 0 2px 6px rgba(0,0,0,0.35);
}
#touch .tc-stick.ghost .tc-knob { background: rgba(239, 230, 210, 0.28); box-shadow: none; }
#touch .tc-btn {
  position: absolute; border-radius: 50%; pointer-events: auto; touch-action: none;
  display: grid; place-items: center; padding: 0; margin: 0;
  font: 700 var(--fs-xs)/1 var(--font-body); letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--paper); background: rgba(11, 15, 28, 0.42);
  border: 1.5px solid rgba(239, 230, 210, 0.38);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  box-shadow: 0 6px 18px rgba(0,0,0,0.3);
  transition: transform 0.08s var(--ease), background 0.12s, border-color 0.12s, opacity 0.2s;
  -webkit-user-select: none; user-select: none;
}
#touch .tc-btn.down { transform: scale(0.92); background: rgba(255, 181, 71, 0.32); border-color: var(--lentera); }
#touch .tc-btn svg { width: 46%; height: 46%; display: block; margin: 0 auto 3px; }
#touch .tc-btn .tc-l { display: block; font-size: 10px; letter-spacing: 0.1em; opacity: 0.92; }
#touch .tc-jump { width: 88px; height: 88px; right: calc(env(safe-area-inset-right, 0px) + 20px); bottom: calc(env(safe-area-inset-bottom, 0px) + 26px); }
#touch .tc-act { width: 66px; height: 66px; right: calc(env(safe-area-inset-right, 0px) + 122px); bottom: calc(env(safe-area-inset-bottom, 0px) + 22px); }
#touch .tc-flare { width: 64px; height: 64px; right: calc(env(safe-area-inset-right, 0px) + 32px); bottom: calc(env(safe-area-inset-bottom, 0px) + 128px); }
#touch .tc-run { width: 58px; height: 58px; right: calc(env(safe-area-inset-right, 0px) + 112px); bottom: calc(env(safe-area-inset-bottom, 0px) + 104px); }
#touch .tc-act.dim { opacity: 0.45; }
#touch .tc-act.ready { border-color: var(--lentera); background: rgba(255, 181, 71, 0.22); box-shadow: 0 0 22px rgba(255, 181, 71, 0.35); }
#touch .tc-run.on { border-color: var(--kilau); background: rgba(143, 227, 208, 0.22); color: #eafff9; }
#touch .tc-flare.low { opacity: 0.45; }
#touch .tc-label {
  position: absolute; right: calc(env(safe-area-inset-right, 0px) + 122px); bottom: calc(env(safe-area-inset-bottom, 0px) + 96px);
  max-width: min(58vw, 260px); padding: 7px 12px; border-radius: 999px;
  font: 600 var(--fs-s)/1.2 var(--font-body); color: var(--ink); background: var(--lentera);
  box-shadow: 0 6px 18px rgba(0,0,0,0.35); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  opacity: 0; transform: translateY(6px); transition: opacity 0.15s var(--ease), transform 0.15s var(--ease);
  pointer-events: none;
}
#touch .tc-label.show { opacity: 1; transform: none; }
#touch .tc-top { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 12px); right: calc(env(safe-area-inset-right, 0px) + 12px); display: flex; gap: 10px; pointer-events: none; }
#touch .tc-small {
  position: relative; width: 46px; height: 46px; border-radius: 12px;
  font: 700 var(--fs-xs)/1 var(--font-body); letter-spacing: 0.04em; text-transform: none;
}
#touch .tc-small.wide { width: auto; padding: 0 12px; }
@media (max-height: 420px) {
  #touch .tc-jump { width: 76px; height: 76px; bottom: calc(env(safe-area-inset-bottom, 0px) + 16px); }
  #touch .tc-flare { bottom: calc(env(safe-area-inset-bottom, 0px) + 104px); }
  #touch .tc-run { bottom: calc(env(safe-area-inset-bottom, 0px) + 88px); }
  #touch .tc-label { bottom: calc(env(safe-area-inset-bottom, 0px) + 92px); }
}
`;

const ICON = {
  jump: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6"/><path d="M6 11l6-6 6 6"/></svg>',
  act: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5V4.5a1.5 1.5 0 0 1 3 0V12"/><path d="M14 11.5V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.6 0-4-1.4-5.5-3.5L4 14.2a1.5 1.5 0 0 1 2.4-1.8L8 14"/></svg>',
  flare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c2.5 3 4 5 4 8a4 4 0 0 1-8 0c0-1.6.7-2.8 1.6-3.8.2 1.3.9 2.1 1.8 2.3C11 7.4 11.3 5.2 12 3z"/><path d="M12 19v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M17.7 6.3l1.4-1.4"/></svg>',
  run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l5 5-5 5"/><path d="M12 7l5 5-5 5"/></svg>',
};

export function createTouch(ctx) {
  const { input, state, engine } = ctx;
  injectStyle('lentera-touch', CSS);
  const root = uiRoot('touch');
  if (!root) return { visible: false, setVisible() {}, update() {} };

  const knob = h('div.tc-knob');
  const stick = h('div.tc-stick.ghost', {}, [knob]);
  const left = h('div.tc-zone.tc-left', { 'aria-hidden': 'true' }, [stick]);
  const right = h('div.tc-zone.tc-right', { 'aria-hidden': 'true' });

  const btn = (cls, icon, label, aria) => h('button.tc-btn.' + cls, { type: 'button', 'aria-label': aria || label, html: `${ICON[icon] || ''}<span class="tc-l">${label}</span>` });
  const bJump = btn('tc-jump', 'jump', 'Lompat');
  const bAct = btn('tc-act', 'act', 'Aksi');
  const bFlare = btn('tc-flare', 'flare', 'Nyala', 'Nyalakan lentera');
  const bRun = btn('tc-run', 'run', 'Lari');
  const label = h('div.tc-label', { 'aria-live': 'polite' });
  const bJournal = h('button.tc-btn.tc-small.wide', { type: 'button', text: 'Jurnal', 'aria-label': 'Buka jurnal' });
  const bPause = h('button.tc-btn.tc-small', { type: 'button', text: 'II', 'aria-label': 'Jeda' });
  const top = h('div.tc-top', {}, [bJournal, bPause]);
  const layer = h('div.tc', {}, [left, right, label, bAct, bRun, bFlare, bJump, top]);
  root.appendChild(layer);

  // ------------------------------------------------------------------------------------------
  // Left stick (spawns under the thumb; follows when dragged past its rim)
  // ------------------------------------------------------------------------------------------
  const R = 58;
  let stickId = null, ox = 0, oy = 0;
  let sprintLatch = false;
  const ghostPos = () => {
    const r = left.getBoundingClientRect();
    return { x: r.left + Math.min(110, r.width * 0.42), y: r.bottom - 120 };
  };
  function placeStick(x, y) {
    const r = left.getBoundingClientRect();
    stick.style.left = x - r.left + 'px';
    stick.style.top = y - r.top + 'px';
  }
  function resetStick() {
    stickId = null;
    knob.style.transform = '';
    stick.classList.remove('show');
    stick.classList.add('ghost');
    const g = ghostPos();
    placeStick(g.x, g.y);
    input.setVirtualMove(0, 0);
    if (sprintLatch) { sprintLatch = false; input.setVirtualButton('sprint', false); bRun.classList.remove('on'); }
  }
  left.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    e.preventDefault();
    stickId = e.pointerId;
    try { left.setPointerCapture(e.pointerId); } catch { /* optional */ }
    ox = e.clientX; oy = e.clientY;
    placeStick(ox, oy);
    stick.classList.remove('ghost');
    stick.classList.add('show');
    knob.style.transform = '';
  });
  left.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    e.preventDefault();
    let dx = e.clientX - ox, dy = e.clientY - oy;
    let d = Math.hypot(dx, dy);
    if (d > R * 1.35) {
      // Drag the base along so the stick never "runs out".
      const k = (d - R * 1.35) / d;
      ox += dx * k; oy += dy * k;
      placeStick(ox, oy);
      dx = e.clientX - ox; dy = e.clientY - oy; d = Math.hypot(dx, dy);
    }
    const c = Math.min(1, d / R);
    const ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : 0;
    knob.style.transform = `translate(${ux * c * R}px, ${uy * c * R}px)`;
    const dead = 0.12;
    const m = c < dead ? 0 : (c - dead) / (1 - dead);
    input.setVirtualMove(ux * m, -uy * m);
  });
  const endStick = (e) => { if (e.pointerId === stickId) resetStick(); };
  left.addEventListener('pointerup', endStick);
  left.addEventListener('pointercancel', endStick);
  left.addEventListener('lostpointercapture', endStick);

  // ------------------------------------------------------------------------------------------
  // Right side: drag to look (one finger; extra fingers are ignored)
  // ------------------------------------------------------------------------------------------
  let lookId = null, lx = 0, ly = 0;
  right.addEventListener('pointerdown', (e) => {
    if (lookId !== null) return;
    e.preventDefault();
    lookId = e.pointerId;
    try { right.setPointerCapture(e.pointerId); } catch { /* optional */ }
    lx = e.clientX; ly = e.clientY;
  });
  right.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    e.preventDefault();
    input.addLook(e.clientX - lx, e.clientY - ly);
    lx = e.clientX; ly = e.clientY;
  });
  const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
  right.addEventListener('pointerup', endLook);
  right.addEventListener('pointercancel', endLook);
  right.addEventListener('lostpointercapture', endLook);

  // ------------------------------------------------------------------------------------------
  // Buttons
  // ------------------------------------------------------------------------------------------
  const held = new Map(); // element -> pointerId
  function hold(el, action) {
    const up = (e) => {
      if (held.get(el) !== e.pointerId) return;
      held.delete(el);
      el.classList.remove('down');
      input.setVirtualButton(action, false);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (held.has(el)) return;
      held.set(el, e.pointerId);
      try { el.setPointerCapture(e.pointerId); } catch { /* optional */ }
      el.classList.add('down');
      input.setVirtualButton(action, true);
    });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function tap(el, action) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('down');
      input.tap(action);
      input.device = 'touch';
    });
    const up = () => el.classList.remove('down');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }
  hold(bJump, 'jump');
  hold(bAct, 'interact');
  hold(bFlare, 'flare');
  tap(bJournal, 'journal');
  tap(bPause, 'pause');
  // Lari toggles a sprint latch (released with the stick) so the right thumb stays free.
  bRun.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    sprintLatch = !sprintLatch;
    bRun.classList.toggle('on', sprintLatch);
    input.setVirtualButton('sprint', sprintLatch);
  });

  // ------------------------------------------------------------------------------------------
  let visible = false;
  let lastLabel = null;
  function releaseAll() {
    resetStick();
    lookId = null;
    for (const [el] of held) el.classList.remove('down');
    held.clear();
    for (const a of ['jump', 'interact', 'flare', 'sprint']) input.setVirtualButton(a, false);
  }

  const touch = {
    get visible() { return visible; },
    forced: null, // true/false to override auto-detection (debug, settings)
    setVisible(v) {
      v = !!v;
      if (v === visible) return;
      visible = v;
      layer.classList.toggle('on', v);
      if (!v) {
        // Release without flipping input.device back to touch.
        const dev = input.device;
        releaseAll();
        input.device = dev;
      } else resetStick();
    },
    update() {
      const isTouch = touch.forced ?? (engine.isTouch || input.device === 'touch');
      touch.setVisible(isTouch && state.mode === 'play');
      if (!visible) return;
      // Aksi label from the interact focus.
      const f = ctx.interact?.focus;
      let text = '';
      if (f) {
        try { text = typeof f.label === 'function' ? f.label() : (f.label || ''); } catch { text = ''; }
      }
      if (text !== lastLabel) {
        lastLabel = text;
        label.textContent = text;
        label.classList.toggle('show', !!text);
        bAct.classList.toggle('ready', !!text);
        bAct.classList.toggle('dim', !text);
      }
      const nyala = state.progress?.nyala ?? 100;
      bFlare.classList.toggle('low', nyala < 12);
    },
  };
  return touch;
}
