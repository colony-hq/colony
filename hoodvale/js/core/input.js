// Pointer-first input (RuneScape-style): click to walk/interact, right-click (long-press on
// touch) for the context menu, middle-drag / arrow keys / one-finger drag to orbit the camera,
// wheel / pinch to zoom. Game code subscribes with input.on(type, fn).
//
// Events: 'click' {x, y, button, shift, ctrl}  (canvas only)
//         'menu'  {x, y}                        (right-click or long-press on the canvas)
//         'key'   {code, key, down, repeat, shift, ctrl}  (not while typing in a text field)
// Per-frame (read, then cleared by update()): orbit {yaw, pitch} radians, zoom (steps).

export function createInput({ canvas }) {
  const listeners = new Map();
  const held = new Set();
  const pressedNow = new Set();
  const orbit = { yaw: 0, pitch: 0 };
  let zoom = 0;

  const input = {
    pointer: { x: -1, y: -1, inside: false, ndcX: 0, ndcY: 0, moved: false },
    device: 'mouse', // 'mouse' | 'touch'
    orbit: { yaw: 0, pitch: 0 },
    zoom: 0,
    typing: false, // true while a text field has focus

    on(type, fn) {
      let set = listeners.get(type);
      if (!set) listeners.set(type, (set = new Set()));
      set.add(fn);
      return () => set.delete(fn);
    },
    down(code) { return held.has(code); },
    pressed(code) { return pressedNow.has(code); },

    update() {
      input.orbit.yaw = orbit.yaw; input.orbit.pitch = orbit.pitch;
      input.zoom = zoom;
      orbit.yaw = orbit.pitch = 0; zoom = 0;
      pressedNow.clear();
      input.pointer.moved = false;
    },
    // Programmatic camera input (touch UI buttons, tests).
    addOrbit(yaw, pitch) { orbit.yaw += yaw; orbit.pitch += pitch; },
    addZoom(steps) { zoom += steps; },
    // Synthesize events (tests / UI forwarding).
    emit(type, data) { emit(type, data); },
  };

  function emit(type, data) {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(data); } catch (err) { console.error('[input]', type, err); }
    }
  }

  function setPointer(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const p = input.pointer;
    p.x = clientX - r.left;
    p.y = clientY - r.top;
    p.ndcX = (p.x / r.width) * 2 - 1;
    p.ndcY = -(p.y / r.height) * 2 + 1;
    p.inside = p.x >= 0 && p.y >= 0 && p.x <= r.width && p.y <= r.height;
    p.moved = true;
  }

  // ---- Keyboard ----
  const isTextTarget = (t) => t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
  window.addEventListener('keydown', (e) => {
    input.typing = isTextTarget(e.target);
    if (input.typing) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (!held.has(e.code)) pressedNow.add(e.code);
    held.add(e.code);
    emit('key', { code: e.code, key: e.key, down: true, repeat: e.repeat, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
  });
  window.addEventListener('keyup', (e) => {
    held.delete(e.code);
    if (isTextTarget(e.target)) return;
    emit('key', { code: e.code, key: e.key, down: false, repeat: false, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
  });
  window.addEventListener('blur', () => held.clear());

  // ---- Mouse ----
  let middleDrag = null;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') input.device = 'mouse';
    setPointer(e.clientX, e.clientY);
    if (middleDrag && e.pointerType === 'mouse') {
      orbit.yaw -= (e.clientX - middleDrag.x) * 0.006;
      orbit.pitch += (e.clientY - middleDrag.y) * 0.004;
      middleDrag = { x: e.clientX, y: e.clientY };
    }
  });
  canvas.addEventListener('pointerleave', () => { input.pointer.inside = false; });
  canvas.addEventListener('mousedown', (e) => {
    setPointer(e.clientX, e.clientY);
    if (e.button === 1) { middleDrag = { x: e.clientX, y: e.clientY }; e.preventDefault(); }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 1) middleDrag = null; });
  canvas.addEventListener('click', (e) => {
    if (input.device === 'touch') return; // touch taps are synthesized below
    setPointer(e.clientX, e.clientY);
    emit('click', { x: input.pointer.x, y: input.pointer.y, button: 0, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (input.device === 'touch') return;
    setPointer(e.clientX, e.clientY);
    emit('menu', { x: input.pointer.x, y: input.pointer.y });
  });
  canvas.addEventListener('wheel', (e) => { zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

  // ---- Touch: tap = click, long-press = menu, 1-finger drag = orbit, pinch = zoom ----
  const touches = new Map();
  let gesture = null; // { start, x, y, moved, longTimer, pinch }
  canvas.addEventListener('touchstart', (e) => {
    input.device = 'touch';
    e.preventDefault();
    for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    if (touches.size === 1) {
      const t = e.changedTouches[0];
      setPointer(t.clientX, t.clientY);
      gesture = { start: performance.now(), x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY, moved: false, fired: false };
      gesture.longTimer = setTimeout(() => {
        if (gesture && !gesture.moved && touches.size === 1) {
          gesture.fired = true;
          emit('menu', { x: input.pointer.x, y: input.pointer.y });
        }
      }, 450);
    } else if (touches.size === 2) {
      if (gesture) clearTimeout(gesture.longTimer);
      const [a, b] = [...touches.values()];
      gesture = { pinch: Math.hypot(a.x - b.x, a.y - b.y), cy: (a.y + b.y) / 2, moved: true, fired: true };
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (touches.has(t.identifier)) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    if (!gesture) return;
    if (touches.size === 1 && !gesture.pinch) {
      const t = [...touches.values()][0];
      if (Math.hypot(t.x - gesture.x, t.y - gesture.y) > 10) gesture.moved = true;
      if (gesture.moved) {
        orbit.yaw -= (t.x - gesture.lx) * 0.008;
        orbit.pitch += (t.y - gesture.ly) * 0.005;
      }
      gesture.lx = t.x; gesture.ly = t.y;
    } else if (touches.size === 2 && gesture.pinch) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoom -= (d - gesture.pinch) * 0.02;
      gesture.pinch = d;
      const cy = (a.y + b.y) / 2;
      orbit.pitch += (cy - gesture.cy) * 0.004;
      gesture.cy = cy;
    }
  }, { passive: false });
  const endTouch = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) touches.delete(t.identifier);
    if (gesture && touches.size === 0) {
      clearTimeout(gesture.longTimer);
      if (!gesture.moved && !gesture.fired && performance.now() - gesture.start < 450) {
        emit('click', { x: input.pointer.x, y: input.pointer.y, button: 0, shift: false, ctrl: false });
      }
      gesture = null;
    }
  };
  canvas.addEventListener('touchend', endTouch, { passive: false });
  canvas.addEventListener('touchcancel', endTouch, { passive: false });

  return input;
}
