// Title screen over the live world (camera 'login' orbit) with "Continue as <name>", and the
// character creator: name (1-12 chars), body, skin, hair style + colour, top / bottom / boots
// colours, with a live 3D preview (a world actor framed by the camera) and a painted portrait.
// Owner: ui builder.

import { injectStyle, h } from '../core/dom.js';
import { loadJSON } from '../core/save.js';
import { SPAWN } from '../data/zones.js';
import { combatLevel, totalLevel, levelForXp } from '../data/skills.js';
import { portraitURL } from './portrait.js';
import { esc, fmtDuration, safe } from './util.js';

const SKINS = ['#f2d0b0', '#e8b896', '#e0b48a', '#c8956b', '#a8754f', '#8a5a3a', '#6a4028', '#4a2c1a'];
const HAIRS = [['short', 'Short'], ['long', 'Long'], ['bun', 'Bun'], ['braid', 'Braid'], ['slick', 'Slick'], ['bald', 'Bald']];
const HAIR_COLORS = ['#1a1a1a', '#3a2a1a', '#4a3020', '#6a3a1a', '#8a4a2a', '#a87a3a', '#c9a46a', '#e8e0d0', '#8a3a5a'];
const TOPS = ['#7a5a3a', '#3f7f3a', '#2e6f8e', '#7a2a2a', '#5a2a6a', '#a87a2a', '#2a2a3a', '#d8cbb0', '#4a6a4a', '#1f3a5a'];
const BOTTOMS = ['#4a3a2a', '#2a2a2a', '#3a4a6a', '#5a4a2a', '#3a3a4a', '#6a5a3a', '#2a3a2a', '#7a6a5a'];
const BOOTS = ['#3a2a1a', '#1a1a1a', '#5a3a1a', '#4a4a4a', '#6a4a2a', '#2a2a3a'];
const NAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9 _-]{0,10}[A-Za-z0-9])?$/;

const CSS = `
.u-login { position: absolute; inset: 0; pointer-events: none; z-index: 20; }
.u-login.off { display: none; }
.u-title-scr { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 16px; box-sizing: border-box;
  background: radial-gradient(90% 70% at 50% 40%, rgba(10,6,3,0) 0%, rgba(10,6,3,.35) 55%, rgba(10,6,3,.85) 100%); }
.u-logo { text-align: center; animation: u-logo 1.4s var(--ease) both; }
.u-logo h1 { margin: 0; font: 700 clamp(46px, 10vw, 104px)/1 var(--font-display); color: #f0d48a; letter-spacing: .02em;
  background: linear-gradient(180deg, #fff3c8 10%, #e8c770 45%, #a87a2a 80%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 3px 0 #000) drop-shadow(0 0 24px rgba(201,162,74,.35)); }
.u-logo .sub { margin-top: 6px; font: 600 clamp(11px, 1.6vw, 14px)/1 var(--font-body); color: #e8dcc0; letter-spacing: .32em; text-transform: uppercase; text-shadow: 0 1px 0 #000, 0 0 10px #000; }
.u-logo .orn { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 12px auto 0; width: min(380px, 70vw); }
.u-logo .orn i { flex: 1; height: 2px; background: linear-gradient(90deg, transparent, #c9a24a); }
.u-logo .orn i:last-child { background: linear-gradient(90deg, #c9a24a, transparent); }
.u-logo .orn b { width: 8px; height: 8px; transform: rotate(45deg); background: #c9a24a; }
@keyframes u-logo { from { opacity: 0; transform: translateY(-10px) scale(.98); } to { opacity: 1; transform: none; } }
.u-lcard { pointer-events: auto; width: min(380px, calc(100vw - 32px)); padding: 18px 20px 16px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; animation: u-logo 1.2s var(--ease) both .25s; }
.u-lcard .who { display: flex; align-items: center; gap: 12px; }
.u-lcard .who img { width: 64px; height: 64px; border-radius: 50%; box-shadow: 0 0 0 2px #c9a24a, 0 0 0 3px #000; }
.u-lcard .who .n { font: 700 20px/1.1 var(--font-display); color: #ffe7a8; }
.u-lcard .who .m { font: 12.5px/1.4 var(--font-body); color: var(--parch-dim); }
.u-lcard .pitch { font: italic 15px/1.45 var(--font-body); color: #e8dcc0; text-align: center; margin: 0; }
.u-lcard .u-btn { padding: 11px 14px; font-size: 15px; }
.u-lfoot { pointer-events: auto; font: 12px/1.4 var(--font-body); color: rgba(240,230,205,.92); text-align: center; text-shadow: 0 1px 0 #000, 0 0 6px #000; max-width: 520px; padding: 6px 12px; border-radius: 6px; background: rgba(12,9,7,.62); }
.u-lfoot b { color: var(--chain); font-weight: 600; }

/* creator */
.u-cre { position: absolute; left: 16px; top: 16px; bottom: 16px; width: 360px; pointer-events: auto; display: flex; flex-direction: column; animation: u-cre .3s var(--ease) both; }
@keyframes u-cre { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: none; } }
.u-cre .hd { display: flex; align-items: center; gap: 12px; padding: 14px 16px 10px; }
.u-cre .hd img { width: 58px; height: 58px; border-radius: 50%; box-shadow: 0 0 0 2px #c9a24a, 0 0 0 3px #000; }
.u-cre .hd h2 { margin: 0; font: 700 19px var(--font-display); color: var(--brass); }
.u-cre .hd p { margin: 2px 0 0; font: 12.5px var(--font-body); color: var(--parch-dim); }
.u-cre .bd { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 8px; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; }
.u-cre .ft { display: flex; gap: 8px; padding: 10px 16px 14px; border-top: 1px solid rgba(201,162,74,.22); }
.u-cre .ft .u-btn { flex: 1; padding: 10px 8px; }
.u-cre .ft .u-btn.primary { flex: 1.6; }
.u-fld > label { display: block; font: 700 11px var(--font-display); color: var(--brass); letter-spacing: .06em; margin-bottom: 5px; }
.u-fld input[type=text] { width: 100%; box-sizing: border-box; font-size: 16px !important; padding: 9px 10px !important; user-select: text; -webkit-user-select: text; }
.u-fld .err { min-height: 16px; font: 12px var(--font-body); color: #ff8a7a; margin-top: 3px; }
.u-fld .err.ok { color: #8fd37a; }
.u-sw { display: flex; flex-wrap: wrap; gap: 6px; }
.u-sw button { width: 28px; height: 28px; border-radius: 50%; border: 0; padding: 0; cursor: pointer; box-shadow: 0 0 0 1px #000, inset 0 2px 3px rgba(255,255,255,.25), inset 0 -2px 3px rgba(0,0,0,.3); }
.u-sw button.on { box-shadow: 0 0 0 2px #ffe08a, 0 0 0 3px #000, 0 0 10px rgba(255,224,138,.5); transform: scale(1.08); }
.u-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.u-chips button { padding: 7px 11px; border: 0; border-radius: 16px; cursor: pointer; font: 600 13px var(--font-body); color: var(--parch-dim); background: linear-gradient(180deg, #3b2c20, #261c14); box-shadow: inset 0 0 0 1px rgba(0,0,0,.6); }
.u-chips button.on { color: #fff3cf; background: linear-gradient(180deg, #7a5d22, #4a3812); box-shadow: inset 0 0 0 1px var(--brass); }
.u-rot { position: absolute; left: 392px; right: 0; top: 0; bottom: 0; pointer-events: auto; cursor: grab; touch-action: none; }
.u-rot .hint { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); font: 600 12px var(--font-body); color: rgba(255,255,255,.75); text-shadow: 0 1px 2px #000; letter-spacing: .08em; }
[data-layout=phone] .u-cre { left: 0; right: 0; bottom: 0; top: auto; width: auto; height: 60vh; border-radius: 14px 14px 0 0; animation-name: u-sheet; }
[data-layout=phone] .u-cre .hd { padding: 10px 14px 6px; }
[data-layout=phone] .u-cre .hd img { width: 44px; height: 44px; }
[data-layout=phone] .u-rot { left: 0; bottom: 60vh; }
[data-layout=phone] .u-rot .hint { bottom: 10px; }
[data-layout=phone] .u-sw button { width: 32px; height: 32px; }
`;

export function createLogin(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-login', CSS);
  const root = h('div.u-login.off');
  U.roots.windows.append(root);
  let preview = null; // { actor, yaw, x, y, z }
  let look = null;
  let creating = false;
  let dragYaw = null;

  function savedInfo() {
    const s = safe(() => loadJSON('save', null), null);
    if (!s || !s.name) return null;
    const levels = {};
    for (const [k, xp] of Object.entries(s.skills || {})) levels[k] = levelForXp(xp);
    return { name: s.name, look: s.look, combat: combatLevel(levels), total: totalLevel(levels), played: s.stats?.playTime || 0 };
  }

  function title() {
    creating = false;
    stopPreview();
    root.innerHTML = '';
    const info = savedInfo();
    const card = h('div.u-lcard.u-frame');
    if (info) {
      card.append(h('div.who', {}, [
        h('img', { src: portraitURL(info.look || {}, 'player'), alt: '' }),
        h('div', {}, [h('div.m', { text: 'Welcome back,' }), h('div.n', { text: info.name }), h('div.m', { text: `Combat ${info.combat} · Total level ${info.total} · ${fmtDuration(info.played)} played` })]),
      ]));
      card.append(h('button.u-btn.primary', { text: `Continue as ${info.name}`, onclick: cont }));
      card.append(h('button.u-btn', { text: 'New adventurer', onclick: () => creator(info) }));
    } else {
      card.append(h('p.pitch', { text: 'A green hood. A stolen ledger. A valley that wants its CREDIT back.' }));
      card.append(h('button.u-btn.primary', { text: 'Begin a new adventure', onclick: () => creator(null) }));
    }
    root.append(h('div.u-title-scr', {}, [
      h('div.u-logo', {}, [h('h1', { text: 'Hoodvale' }), h('div.sub', { text: 'An Orbio realm on Robinhood Chain' }), h('div.orn', {}, [h('i'), h('b'), h('i')])]),
      card,
      h('div.u-lfoot', { html: 'Robinhood Chain in Hoodvale is <b>simulated</b>: no real value moves. Your progress is saved in this browser.' }),
    ]));
    setTimeout(() => card.querySelector('.u-btn.primary')?.focus(), 50);
  }

  function cont() {
    if (!state.loadLocal()) { creator(null); return; }
    start();
  }
  function start() {
    stopPreview();
    state.setMode('play');
    events.emit('game:start', {});
  }

  function randomLook() {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const body = Math.random() < 0.5 ? 'male' : 'female';
    return { body, skin: pick(SKINS), hair: pick(HAIRS.slice(0, body === 'male' ? 6 : 5))[0], hairColor: pick(HAIR_COLORS), top: pick(TOPS), bottom: pick(BOTTOMS), boots: pick(BOOTS) };
  }

  function creator(existing) {
    creating = true;
    root.innerHTML = '';
    look = { body: 'male', skin: SKINS[2], hair: 'short', hairColor: HAIR_COLORS[2], top: TOPS[0], bottom: BOTTOMS[0], boots: BOOTS[0], ...randomLook() };
    const por = h('img', { alt: '' });
    const panel = h('div.u-cre.u-frame', { role: 'dialog', 'aria-label': 'Create your adventurer' });
    const head = h('div.hd', {}, [por, h('div', {}, [h('h2', { text: 'A new adventurer' }), h('p', { text: 'Who walks into Brightwater today?' })])]);
    const body = h('div.bd');
    const nameIn = h('input', { type: 'text', maxlength: '12', placeholder: 'Your name', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Name' });
    const err = h('div.err');
    const go = h('button.u-btn.primary', { text: 'Enter the Vale' });
    const validate = () => {
      const v = nameIn.value.replace(/\s+/g, ' ');
      if (v !== nameIn.value) nameIn.value = v;
      const t = v.trim();
      let msg = '';
      if (!t) msg = 'Choose a name (1–12 characters).';
      else if (!NAME_RE.test(t)) msg = 'Letters, numbers, spaces, - and _ only; start and end with a letter or number.';
      err.textContent = msg || 'A fine name.';
      err.classList.toggle('ok', !msg);
      go.disabled = !!msg;
      return msg ? null : t;
    };
    nameIn.addEventListener('input', validate);
    nameIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') submit(); });
    nameIn.addEventListener('keyup', (e) => e.stopPropagation());
    body.append(h('div.u-fld', {}, [h('label', { text: 'Name' }), nameIn, err]));

    const sections = [];
    const refresh = () => { por.src = portraitURL(look, 'player'); for (const s of sections) s(); applyLook(); };
    const chips = (label, key, opts) => {
      const wrap = h('div.u-chips');
      const btns = opts.map(([v, t]) => { const b = h('button', { text: t, onclick: () => { look[key] = v; refresh(); } }); wrap.append(b); return [v, b]; });
      sections.push(() => { for (const [v, b] of btns) b.classList.toggle('on', look[key] === v); });
      body.append(h('div.u-fld', {}, [h('label', { text: label }), wrap]));
    };
    const swatches = (label, key, colors) => {
      const wrap = h('div.u-sw');
      const btns = colors.map((c) => { const b = h('button', { style: { background: c }, 'aria-label': `${label} ${c}`, onclick: () => { look[key] = c; refresh(); } }); wrap.append(b); return [c, b]; });
      sections.push(() => { for (const [c, b] of btns) b.classList.toggle('on', look[key] === c); });
      body.append(h('div.u-fld', {}, [h('label', { text: label }), wrap]));
    };
    chips('Body', 'body', [['male', 'Broad'], ['female', 'Slight']]);
    swatches('Skin', 'skin', SKINS);
    chips('Hair', 'hair', HAIRS);
    swatches('Hair colour', 'hairColor', HAIR_COLORS);
    swatches('Tunic', 'top', TOPS);
    swatches('Trousers', 'bottom', BOTTOMS);
    swatches('Boots', 'boots', BOOTS);
    if (existing) body.append(h('p', { style: { margin: '4px 0 0', font: 'italic 12.5px var(--font-body)', color: '#ffb09f' }, text: `Starting anew replaces ${existing.name} in this browser.` }));

    const back = h('button.u-btn', { text: 'Back', onclick: title });
    const rnd = h('button.u-btn', { text: 'Randomise', onclick: () => { Object.assign(look, randomLook()); refresh(); } });
    go.addEventListener('click', submit);
    panel.append(head, body, h('div.ft', {}, [back, rnd, go]));
    const rot = h('div.u-rot', {}, [h('div.hint', { text: 'DRAG TO TURN' })]);
    rot.addEventListener('pointerdown', (e) => { dragYaw = { x: e.clientX, yaw: preview?.yaw || 0 }; rot.setPointerCapture(e.pointerId); });
    rot.addEventListener('pointermove', (e) => { if (dragYaw && preview) { preview.yaw = dragYaw.yaw + (e.clientX - dragYaw.x) * 0.012; preview.idle = 0; } });
    rot.addEventListener('pointerup', () => { dragYaw = null; });
    root.append(rot, panel);
    startPreview();
    refresh();
    validate();
    if (U.layout !== 'phone') setTimeout(() => nameIn.focus(), 60);

    function submit() {
      const name = validate();
      if (!name) { nameIn.focus(); return; }
      state.newCharacter(name, { ...look });
      start();
    }
  }

  // ---- 3D preview: a world actor framed by the camera ----
  function startPreview() {
    if (preview) return;
    const x = SPAWN.x, z = SPAWN.z;
    const y = safe(() => ctx.map.heightAt(x, z), 0);
    let actor = null;
    try { actor = ctx.actors?.create?.({ kind: 'humanoid', look, player: true, preview: true }) || null; } catch (err) { console.warn('[ui] preview actor', err); }
    preview = { actor, x, y, z, yaw: 0.35, idle: 0 };
    ctx.cameraRig?.setMode?.('debug');
  }
  function applyLook() {
    if (!preview?.actor) return;
    try { preview.actor.setLook?.({ ...look }); } catch (err) { console.warn('[ui] setLook', err); }
  }
  function stopPreview() {
    if (!preview) return;
    try { preview.actor?.dispose?.(); } catch { /* ignore */ }
    preview = null;
    try { ctx.camera.clearViewOffset(); } catch { /* ignore */ }
    if (ctx.cameraRig?.mode === 'debug') ctx.cameraRig.setMode(state.mode === 'play' ? 'follow' : 'login');
  }

  const login = {
    root,
    show() { root.classList.remove('off'); title(); },
    hide() { root.classList.add('off'); stopPreview(); root.innerHTML = ''; },
    get creating() { return creating; },
    update(dt) {
      if (!preview) return;
      const a = preview.actor;
      preview.idle += dt;
      if (!dragYaw && preview.idle > 2.5) preview.yaw += dt * 0.35;
      if (a) {
        a.setPosition?.(preview.x, preview.y, preview.z);
        a.setYaw?.(preview.yaw);
        a.play?.('idle'); // ctx.actors.update() animates every created actor
      }
      // Frame the actor: camera south of it, subject shifted right (desk) or up (phone).
      const cam = ctx.camera;
      const W = window.innerWidth, H = window.innerHeight;
      const phone = U.layout === 'phone';
      const d = phone ? 4.1 : 3.5;
      cam.position.set(preview.x + 0.25, preview.y + 1.45, preview.z + d);
      cam.lookAt(preview.x, preview.y + (phone ? 0.95 : 1.0), preview.z);
      if (phone) cam.setViewOffset(W, H, 0, H * 0.24, W, H);
      else cam.setViewOffset(W, H, -Math.min(W * 0.2, 260), 0, W, H);
    },
  };
  events.on('mode:change', ({ mode }) => { if (mode === 'login') login.show(); else login.hide(); });
  return login;
}
