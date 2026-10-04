// Unified input: keyboard + mouse, gamepad (standard mapping) and virtual touch controls.
// Gameplay code only reads actions. See DESIGN.md §Input for the action list.

const KEYMAP = {
  KeyW: ['forward', 'up'], ArrowUp: ['forward', 'up'],
  KeyS: ['back', 'down'], ArrowDown: ['back', 'down'],
  KeyA: ['left', 'menuLeft'], ArrowLeft: ['left', 'menuLeft'],
  KeyD: ['right', 'menuRight'], ArrowRight: ['right', 'menuRight'],
  Space: ['jump'],
  ShiftLeft: ['sprint'], ShiftRight: ['sprint'],
  KeyE: ['interact'],
  Enter: ['confirm'], NumpadEnter: ['confirm'],
  KeyF: ['flare'],
  KeyJ: ['journal'], Tab: ['journal'],
  Escape: ['pause', 'cancel'], KeyP: ['pause'],
  Backspace: ['cancel'],
  KeyR: ['recenter'],
  Digit1: ['choice1'], Digit2: ['choice2'], Digit3: ['choice3'], Digit4: ['choice4'],
  Numpad1: ['choice1'], Numpad2: ['choice2'], Numpad3: ['choice3'], Numpad4: ['choice4'],
};

// Standard gamepad buttons -> actions.
const PADMAP = {
  0: ['jump', 'confirm'], // A / Cross
  1: ['cancel', 'sprint'], // B / Circle (hold to sprint, like many console adventures)
  2: ['interact'], // X / Square
  3: ['journal'], // Y / Triangle
  4: ['zoomOut'], // LB
  5: ['zoomIn'], // RB
  6: ['flare'], // LT
  7: ['flare'], // RT
  8: ['journal'], // Back / Select
  9: ['pause'], // Start
  10: ['sprint'], // L3
  11: ['recenter'], // R3
  12: ['up'], 13: ['down'], 14: ['menuLeft'], 15: ['menuRight'],
};

const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']);

export function createInput({ canvas, getSettings = () => ({}) } = {}) {
  const keys = new Set(); // physical key codes held
  const virtual = new Map(); // action -> bool (touch buttons)
  const padHeld = new Set(); // actions held on the gamepad this frame
  let held = new Set(); // actions held this frame (union)
  let prevHeld = new Set();
  const pulses = new Set(); // actions pressed since last update (catches sub-frame taps)
  const consumed = new Set();

  let mouseDX = 0, mouseDY = 0, wheel = 0;
  let touchLookX = 0, touchLookY = 0;
  const vMove = { x: 0, y: 0 };
  let dragging = false;
  let lastPointer = null;

  const input = {
    move: { x: 0, y: 0 }, // x: right, y: forward. |move| <= 1
    look: { x: 0, y: 0 }, // radians this frame. x: yaw right, y: pitch down (before invert)
    wheel: 0,
    device: 'kbm', // 'kbm' | 'gamepad' | 'touch'
    pointerLocked: false,
    gamepadConnected: false,
    enabled: true,

    update(dt) {
      prevHeld = held;
      held = new Set();
      for (const code of keys) for (const a of KEYMAP[code] || []) held.add(a);
      for (const [a, v] of virtual) if (v) held.add(a);
      pollGamepad(dt);
      for (const a of padHeld) held.add(a);
      for (const a of pulses) held.add(a);
      this._pulses = new Set(pulses);
      pulses.clear();
      consumed.clear();

      const s = getSettings();
      const sens = s.sensitivity ?? 1;
      // Move vector (keyboard digital + gamepad/touch analog, whichever is larger).
      let kx = (keyHeld('right') ? 1 : 0) - (keyHeld('left') ? 1 : 0);
      let ky = (keyHeld('forward') ? 1 : 0) - (keyHeld('back') ? 1 : 0);
      const kl = Math.hypot(kx, ky);
      if (kl > 1) { kx /= kl; ky /= kl; }
      let mx = kx, my = ky;
      const ax = padMove.x + vMove.x, ay = padMove.y + vMove.y;
      if (Math.hypot(ax, ay) > Math.hypot(mx, my)) { mx = ax; my = ay; }
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      this.move.x = mx;
      this.move.y = my;

      const mouseScale = 0.0024 * sens;
      const touchScale = 0.0052 * sens;
      const padScale = 2.7 * sens * dt;
      this.look.x = mouseDX * mouseScale + touchLookX * touchScale + padLook.x * padScale;
      this.look.y = mouseDY * mouseScale + touchLookY * touchScale + padLook.y * padScale * 0.75;
      mouseDX = mouseDY = touchLookX = touchLookY = 0;
      this.wheel = wheel;
      wheel = 0;
    },

    down(a) { return this.enabled && held.has(a); },
    pressed(a) {
      if (!this.enabled || consumed.has(a)) return false;
      return (held.has(a) && !prevHeld.has(a)) || (this._pulses?.has(a) ?? false);
    },
    released(a) { return this.enabled && !held.has(a) && prevHeld.has(a); },
    consume(a) { consumed.add(a); },
    anyPressed() {
      for (const a of held) if (!prevHeld.has(a)) return true;
      return (this._pulses?.size ?? 0) > 0;
    },

    // Touch layer API (ui/touch.js).
    setVirtualMove(x, y) { vMove.x = x; vMove.y = y; if (x || y) this.device = 'touch'; },
    setVirtualButton(action, isDown) {
      if (isDown && !virtual.get(action)) pulses.add(action);
      virtual.set(action, !!isDown);
      this.device = 'touch';
    },
    addLook(dx, dy) { touchLookX += dx; touchLookY += dy; this.device = 'touch'; },
    // Synthesize a one-frame press (used by on-screen buttons and tests).
    tap(action) { pulses.add(action); },

    requestPointerLock() {
      if (!canvas || this.pointerLocked || this.device === 'touch') return;
      try {
        const r = canvas.requestPointerLock?.();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch { /* pointer lock is optional (iframes, mobile) */ }
    },
    exitPointerLock() {
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignore */ }
    },
    releaseAll() {
      keys.clear(); virtual.clear(); padHeld.clear(); pulses.clear();
      vMove.x = vMove.y = 0;
    },
  };

  function keyHeld(a) {
    for (const code of keys) if ((KEYMAP[code] || []).includes(a)) return true;
    return false;
  }

  // ---- Keyboard ----
  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    input.device = 'kbm';
    if (!keys.has(e.code)) for (const a of KEYMAP[e.code] || []) pulses.add(a);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); });
  window.addEventListener('blur', () => input.releaseAll());
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.releaseAll(); });

  // ---- Mouse ----
  if (canvas) {
    canvas.addEventListener('mousedown', (e) => {
      input.device = 'kbm';
      if (e.button === 2) { pulses.add('flare'); virtual.set('flare', true); }
      if (!input.pointerLocked) { dragging = true; lastPointer = { x: e.clientX, y: e.clientY }; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) virtual.set('flare', false);
      dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (input.pointerLocked) {
        mouseDX += e.movementX || 0;
        mouseDY += e.movementY || 0;
      } else if (dragging && lastPointer) {
        mouseDX += e.clientX - lastPointer.x;
        mouseDY += e.clientY - lastPointer.y;
        lastPointer = { x: e.clientX, y: e.clientY };
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      input.pointerLocked = document.pointerLockElement === canvas;
    });
  }

  // ---- Gamepad ----
  const padMove = { x: 0, y: 0 };
  const padLook = { x: 0, y: 0 };
  const DEAD = 0.18;
  function stick(x, y) {
    const l = Math.hypot(x, y);
    if (l < DEAD) return [0, 0];
    const k = Math.min(1, (l - DEAD) / (1 - DEAD));
    const curved = k * k * 0.6 + k * 0.4; // gentle response curve
    return [(x / l) * curved, (y / l) * curved];
  }
  function pollGamepad() {
    padHeld.clear();
    padMove.x = padMove.y = padLook.x = padLook.y = 0;
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch { pads = []; }
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    input.gamepadConnected = !!pad;
    if (!pad) return;
    const [mx, my] = stick(pad.axes[0] || 0, pad.axes[1] || 0);
    const [lx, ly] = stick(pad.axes[2] || 0, pad.axes[3] || 0);
    padMove.x = mx; padMove.y = -my;
    padLook.x = lx; padLook.y = ly;
    let active = Math.abs(mx) + Math.abs(my) + Math.abs(lx) + Math.abs(ly) > 0;
    pad.buttons.forEach((b, i) => {
      const pressed = typeof b === 'object' ? b.pressed || b.value > 0.5 : b > 0.5;
      if (!pressed) return;
      active = true;
      for (const a of PADMAP[i] || []) padHeld.add(a);
    });
    if (active) input.device = 'gamepad';
  }

  return input;
}

// Button glyph labels per device, for prompts and hints.
export const GLYPHS = {
  kbm: { interact: 'E', jump: 'Spasi', sprint: 'Shift', flare: 'F', journal: 'J', pause: 'Esc', confirm: 'Enter', cancel: 'Esc', move: 'WASD', look: 'Mouse' },
  gamepad: { interact: 'X', jump: 'A', sprint: 'B', flare: 'RT', journal: 'Y', pause: 'Start', confirm: 'A', cancel: 'B', move: 'L', look: 'R' },
  touch: { interact: 'Aksi', jump: 'Lompat', sprint: 'Lari', flare: 'Nyala', journal: 'Jurnal', pause: 'II', confirm: 'Ketuk', cancel: 'Kembali', move: 'Joystik', look: 'Geser' },
};
