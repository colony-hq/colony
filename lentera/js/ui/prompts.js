// Floating interact prompt (anchored to the focused target in world space) + contextual
// tutorial hints. Owner: ui-audio. API: DESIGN.md §7 prompts.
//
// API: hint(text, seconds, {id, priority}) — text may contain {action} tokens that render as the
// active device's button glyph, e.g. "Tekan {jump} buat lompat". teach(id, text, seconds) shows
// a one-time tutorial hint (remembered across sessions). clearHints(). update(dt).

import { h, injectStyle, uiRoot } from '../core/dom.js';
import { loadJSON, saveJSON } from '../core/save.js';
import { heightAt } from '../world/heightfield.js';
import { keycap, setRichText, effectiveDevice } from './prompt-glyphs.js';

const CSS = `
.lp { position: absolute; inset: 0; pointer-events: none; }
.lp-ip { position: absolute; left: 0; top: 0; opacity: 0; transition: opacity 0.18s var(--ease); will-change: transform; }
.lp-ip.on { opacity: 1; }
.lp-ip-in {
  display: flex; align-items: center; gap: 10px; padding: 7px 17px 7px 8px; border-radius: 999px; white-space: nowrap;
  background: linear-gradient(180deg, rgba(22, 28, 48, 0.86), rgba(11, 15, 28, 0.86));
  border: 1px solid rgba(255, 181, 71, 0.38); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.38), 0 0 20px rgba(255, 181, 71, 0.12);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); transform-origin: 50% 100%;
}
.lp-ip.on .lp-ip-in { animation: lp-pop 0.32s var(--ease); }
.lp-ip-cap { display: flex; font-size: 19px; }
.lp-ip-cap .lk { margin: 0; }
.lp-ip-label { font: 600 clamp(14px, 0.95rem, 16px)/1 var(--font-body); letter-spacing: 0.02em; color: var(--paper); }
.lp-ip-stem { position: relative; width: 1px; height: 16px; margin: 0 auto; background: linear-gradient(rgba(255, 181, 71, 0.7), rgba(255, 181, 71, 0.1)); }
.lp-ip-stem::after {
  content: ''; position: absolute; left: 50%; bottom: -3px; width: 5px; height: 5px; border-radius: 50%; transform: translateX(-50%);
  background: var(--lentera); box-shadow: 0 0 8px var(--lentera);
}
.lp-touch .lp-ip-in { pointer-events: auto; cursor: pointer; padding: 8px 18px 8px 9px; }
@keyframes lp-pop { from { transform: translateY(6px) scale(0.92); opacity: 0; } to { transform: none; opacity: 1; } }

.lp-hint {
  position: absolute; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 19vh); transform: translate(-50%, 10px);
  width: max-content; max-width: min(580px, calc(100vw - 32px)); box-sizing: border-box;
  display: flex; align-items: center; gap: 14px; padding: 13px 20px 13px 16px; border-radius: 14px; overflow: hidden;
  background: linear-gradient(180deg, rgba(22, 28, 48, 0.84), rgba(11, 15, 28, 0.84));
  border: 1px solid rgba(239, 230, 210, 0.1); box-shadow: 0 14px 40px rgba(0, 0, 0, 0.4);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  opacity: 0; transition: opacity 0.4s var(--ease), transform 0.4s var(--ease);
}
.lp-hint.on { opacity: 1; transform: translate(-50%, 0); }
.lp-hint-ic { flex: none; position: relative; width: 22px; height: 22px; }
.lp-hint-ic::before {
  content: ''; position: absolute; inset: 5px; transform: rotate(45deg); border: 1.5px solid var(--lentera);
  box-shadow: 0 0 10px rgba(255, 181, 71, 0.45);
}
.lp-hint-ic::after { content: ''; position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; transform: translate(-50%, -50%) rotate(45deg); background: var(--lentera); }
.lp-hint-t { font: 500 var(--fs-m)/1.5 var(--font-body); color: var(--paper); text-wrap: pretty; }
.lp-hint-bar { position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; background: linear-gradient(90deg, rgba(255, 181, 71, 0.65), rgba(255, 181, 71, 0.15)); transform-origin: left; }
.lp-touch .lp-hint { bottom: calc(env(safe-area-inset-bottom, 0px) + 36vh); }
@media (max-height: 500px) { .lp-touch .lp-hint { bottom: auto; top: 30vh; } }
@media (prefers-reduced-motion: reduce) { .lp-ip.on .lp-ip-in { animation: none; } .lp-hint { transition: opacity 0.2s; } }
`;

// Tutorial copy per device. {action} tokens become keycaps.
const TUTORIAL = {
  move: {
    kbm: 'Jalan pakai {move}, lihat sekeliling pakai {look}. Klik layar biar kursornya terkunci.',
    gamepad: 'Jalan pakai stik {move}, putar kamera pakai stik {look}.',
    touch: 'Geser joystik di kiri buat jalan. Usap sisi kanan layar buat lihat sekeliling.',
  },
  jump: { all: 'Tekan {jump} buat lompat.' },
  sprint: { all: 'Tahan {sprint} buat lari. Staminamu pulih sendiri kalau kamu santai.' },
  glide: { all: 'Tahan {jump} di udara buat melayang pakai kainmu.' },
  swim: { all: 'Kamu berenang. Cari tepian yang landai, terus {jump} buat naik ke darat.' },
  flare: { all: 'Hantu Kabut! Tekan {flare} buat menyalakan sinar lentera dan mengusir mereka. Butuh 12 Nyala.' },
  journal: { all: 'Petunjuk baru tercatat. Buka Jurnal pakai {journal}.' },
  nyala: { all: 'Nyala lenteramu menipis. Pungut Kilau atau istirahat di api unggun yang sudah menyala.' },
  rest: { all: 'Api unggun ini jadi titik simpan. Balik ke sini kalau Nyala menipis, lalu pilih Istirahat.' },
};

export function createPrompts(ctx) {
  const { events, state, input, engine } = ctx;
  injectStyle('lentera-prompts', CSS);
  const root = uiRoot('prompts');
  const layer = h('div.lp');
  root.appendChild(layer);

  // ---- Interact prompt ---------------------------------------------------
  const cap = h('span.lp-ip-cap');
  const label = h('span.lp-ip-label');
  const inner = h('div.lp-ip-in', { role: 'button', 'aria-live': 'polite' }, [cap, label]);
  const prompt = h('div.lp-ip', {}, [inner, h('div.lp-ip-stem')]);
  layer.appendChild(prompt);
  inner.addEventListener('pointerdown', (e) => {
    if (!layer.classList.contains('lp-touch')) return;
    e.preventDefault();
    input.tap('interact');
  });

  // ---- Hint panel --------------------------------------------------------
  const hintText = h('div.lp-hint-t');
  const hintBar = h('div.lp-hint-bar');
  const hintEl = h('div.lp-hint', { role: 'status', 'aria-live': 'polite' }, [h('div.lp-hint-ic'), hintText, hintBar]);
  layer.appendChild(hintEl);

  let focus = null;
  let promptOn = false;
  let promptDevice = '';
  let labelText = '';
  let labelTimer = 0;
  let occluded = false;
  let occTimer = 0;
  const v = new ctx.THREE.Vector3();

  const queue = [];
  let current = null;
  let hintDevice = '';
  let touchLayout = null;

  let seen = loadJSON('tutorial', {}) || {};
  let moveTimer = -1;
  let moveDist = 0;
  let lastPos = null;
  let lastGroundY = null;
  let tSinceJumpHint = -1;

  function resolveLabel(t) {
    if (!t) return '';
    try { return typeof t.label === 'function' ? String(t.label() ?? '') : String(t.label ?? ''); } catch { return ''; }
  }

  function setPromptGlyph(device) {
    promptDevice = device;
    cap.textContent = '';
    cap.appendChild(keycap('interact', device));
  }

  function setPromptVisible(on) {
    if (on === promptOn) return;
    promptOn = on;
    prompt.classList.toggle('on', on);
  }

  function anchorOf(t) {
    const q = ctx.interact.position(t) || {};
    const p = ctx.player?.position;
    const y = Number.isFinite(q.y) ? q.y : (p ? p.y : 0) + (t.height ?? 1.6);
    return { x: q.x ?? 0, y, z: q.z ?? 0 };
  }

  function checkOcclusion(a) {
    const cam = ctx.camera.position;
    const dx = a.x - cam.x, dy = a.y - cam.y, dz = a.z - cam.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.5) return false;
    try {
      const hit = ctx.collision?.raycast?.(cam.x, cam.y, cam.z, dx, dy, dz, d);
      if (Number.isFinite(hit) && hit < d - 0.7) return true;
    } catch { /* collision optional */ }
    for (let i = 1; i < 6; i++) {
      const k = i / 6;
      if (heightAt(cam.x + dx * k, cam.z + dz * k) > cam.y + dy * k + 0.25) return true;
    }
    return false;
  }

  function updatePrompt(dt) {
    const t = state.mode === 'play' ? ctx.interact?.focus : null;
    if (t !== focus) {
      focus = t;
      labelText = '';
      labelTimer = 0;
      occTimer = 0;
      occluded = false;
    }
    if (!focus) { setPromptVisible(false); return; }
    const dev = effectiveDevice(ctx);
    if (dev !== promptDevice) setPromptGlyph(dev);
    labelTimer -= dt;
    if (labelTimer <= 0) {
      labelTimer = 0.3;
      const l = resolveLabel(focus);
      if (l !== labelText) { labelText = l; label.textContent = l; }
    }
    const a = anchorOf(focus);
    occTimer -= dt;
    if (occTimer <= 0) { occTimer = 0.15; occluded = checkOcclusion(a); }
    v.set(a.x, a.y, a.z).project(ctx.camera);
    const behind = v.z > 1 || v.z < -1;
    const w = engine.size?.w || window.innerWidth, hh = engine.size?.h || window.innerHeight;
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * hh;
    const off = behind || x < 24 || x > w - 24 || y < 60 || y > hh - 20;
    if (off || occluded || !labelText) { setPromptVisible(false); return; }
    prompt.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    setPromptVisible(true);
  }

  // ---- Hints -------------------------------------------------------------
  function renderHint() {
    if (!current) return;
    hintDevice = effectiveDevice(ctx);
    const text = typeof current.text === 'function' ? current.text(hintDevice) : current.text;
    setRichText(hintText, text, hintDevice);
  }

  function hint(text, seconds = 5, opts = {}) {
    if (!text) return;
    const item = { text, seconds: Math.max(1.5, seconds || 5), id: opts.id || null, t: 0 };
    if (current && current.text === text) { current.seconds = Math.max(current.seconds, current.t + item.seconds); return; }
    if (queue.some((q) => q.text === text)) return;
    if (opts.priority) {
      queue.unshift(item);
      if (current && current.t > 1.2) current.seconds = Math.min(current.seconds, current.t + 0.3);
    } else queue.push(item);
  }

  function clearHints() {
    queue.length = 0;
    if (current) current.seconds = Math.min(current.seconds, current.t + 0.1);
  }

  function updateHints(dt) {
    const active = state.mode === 'play';
    if (!current && queue.length && active) {
      current = queue.shift();
      current.t = 0;
      renderHint();
      hintEl.classList.add('on');
      hintBar.style.transform = 'scaleX(1)';
    }
    if (!current) return;
    hintEl.classList.toggle('on', active);
    if (!active) return;
    if (effectiveDevice(ctx) !== hintDevice) renderHint();
    current.t += dt;
    hintBar.style.transform = `scaleX(${Math.max(0, 1 - current.t / current.seconds).toFixed(3)})`;
    if (current.t >= current.seconds) {
      hintEl.classList.remove('on');
      const done = current;
      current = null;
      // Small gap so consecutive hints read as separate messages.
      if (queue.length) queue[0].delay = 0.5;
      void done;
    }
  }

  // ---- Tutorials ---------------------------------------------------------
  function tutorialText(id) {
    const entry = TUTORIAL[id];
    if (!entry) return null;
    return (device) => entry[device] || entry.all || entry.kbm;
  }

  function teach(id, text, seconds = 6) {
    if (!state.settings.showHints || seen[id]) return false;
    seen[id] = true;
    saveJSON('tutorial', seen);
    hint(text || tutorialText(id), seconds, { id });
    return true;
  }

  events.on('hint', (p = {}) => hint(p.text, p.seconds ?? 5, { priority: true }));
  events.on('mode:change', ({ mode, prev }) => {
    if (mode === 'play' && (prev === 'intro' || prev === 'title' || prev === 'cinematic') && !seen.move) moveTimer = 1.6;
    if (mode === 'title') { queue.length = 0; current = null; hintEl.classList.remove('on'); }
  });
  events.on('player:swim', ({ on } = {}) => { if (on) teach('swim', null, 6); });
  events.on('player:hurt', () => teach('flare', null, 7));
  events.on('clue:add', () => teach('journal', null, 6));
  events.on('player:land', ({ speed } = {}) => { if (speed > 14) teach('glide', null, 6); });
  events.on('nyala:change', ({ value } = {}) => { if (value < 25 && state.mode === 'play') teach('nyala', null, 6); });
  events.on('checkpoint:light', () => setTimeout(() => teach('rest', null, 7), 4200));
  events.on('settings:change', ({ key, value } = {}) => { if (key === 'showHints' && !value) clearHints(); });

  function updateTutorials(dt) {
    if (state.mode !== 'play' || !state.settings.showHints) return;
    const pl = ctx.player;
    if (!pl?.position) return;
    const p = pl.position;
    if (lastPos) {
      const d = Math.hypot(p.x - lastPos.x, p.z - lastPos.z);
      if (d < 5) moveDist += d; // ignore teleports
      lastPos.x = p.x; lastPos.z = p.z;
    } else lastPos = { x: p.x, z: p.z };

    if (moveTimer > 0 && (moveTimer -= dt) <= 0) { teach('move', null, 8); moveDist = 0; tSinceJumpHint = -1; }
    if (seen.move && !seen.jump && moveDist > 10) {
      if (teach('jump', null, 5)) { tSinceJumpHint = 0; moveDist = 0; }
    }
    if (tSinceJumpHint >= 0) {
      tSinceJumpHint += dt;
      if (tSinceJumpHint > 20 && moveDist > 50) { teach('sprint', null, 6); tSinceJumpHint = -1; }
    }
    // Glide: first real drop (> 3 m below the last ground) while not already gliding.
    if (pl.grounded || pl.swimming) lastGroundY = p.y;
    else if (lastGroundY != null && !pl.gliding && p.y < lastGroundY - 3 && (pl.velocity?.y ?? -1) < -2) teach('glide', null, 5);
  }

  function setTouchLayout(on) {
    if (on === touchLayout) return;
    touchLayout = on;
    layer.classList.toggle('lp-touch', on);
  }

  return {
    hint,
    teach,
    clearHints,
    resetTutorials() { seen = {}; saveJSON('tutorial', seen); },
    get current() { return current ? { text: current.text, t: current.t } : null; },
    update(dt) {
      setTouchLayout(effectiveDevice(ctx) === 'touch');
      updatePrompt(dt);
      if (queue.length && queue[0].delay > 0) queue[0].delay -= dt;
      else updateHints(dt);
      updateTutorials(dt);
    },
  };
}
