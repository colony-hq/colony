// Settings tab: audio volumes, graphics quality, camera speed / zoom invert, interface toggles,
// log out. Writes state.settings + state.saveSettings() (emits settings:change).
// Owner: ui builder.

import { injectStyle, h } from '../../core/dom.js';
import { tabSvg } from '../icons.js';
import { safe } from '../util.js';

const CSS = `
.u-set { display: flex; flex-direction: column; gap: 4px; font: 13px/1.3 var(--font-body); }
.u-set h4 { margin: 6px 2px 2px; font: 700 11px var(--font-display); color: var(--brass); letter-spacing: .06em; }
.u-set h4:first-child { margin-top: 0; }
.u-row { display: flex; align-items: center; gap: 8px; min-height: 28px; padding: 0 4px; }
.u-row label { flex: 0 0 82px; color: var(--parch-dim); }
.u-row input[type=range] { flex: 1; min-width: 0; }
.u-row .v { width: 34px; text-align: right; font: 600 11px var(--font-mono); color: #ffe46a; }
.u-seg { display: flex; flex: 1; border-radius: 5px; overflow: hidden; box-shadow: 0 0 0 1px #000; }
.u-seg button { flex: 1; border: 0; padding: 6px 2px; font: 600 11.5px var(--font-body); color: var(--parch-dim); background: linear-gradient(180deg, #3b2c20, #261c14); cursor: pointer; }
.u-seg button + button { box-shadow: inset 1px 0 0 rgba(0,0,0,.6); }
.u-seg button.on { color: #fff3cf; background: linear-gradient(180deg, #7a5d22, #4a3812); }
.u-tog { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; border: 0; background: none; color: var(--parch); font: 13px var(--font-body); padding: 5px 4px; cursor: pointer; text-align: left; border-radius: 4px; }
.u-tog:hover { background: rgba(201,162,74,.08); }
.u-tog i { position: relative; width: 32px; height: 16px; border-radius: 8px; background: #120c07; box-shadow: inset 0 0 0 1px rgba(201,162,74,.4); flex: 0 0 auto; transition: background .15s; }
.u-tog i::after { content: ''; position: absolute; left: 2px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: #8a7a60; transition: transform .15s, background .15s; }
.u-tog.on i { background: #3f6a24; } .u-tog.on i::after { transform: translateX(16px); background: #e8f0c0; }
.u-setfoot { display: flex; gap: 6px; margin-top: 8px; }
.u-setfoot .u-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.u-setfoot svg { width: 15px; height: 15px; }
`;

export function createSettingsPanel(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-settings', CSS);
  const S = state.settings;
  const save = () => state.saveSettings();

  function setQuality(q) {
    S.quality = q;
    save();
    if (q !== 'auto') safe(() => ctx.engine.setQuality(q));
    events.emit('settings:quality', { quality: q });
  }

  function slider(label, key, min, max, step, fmt = (v) => Math.round(v * 100)) {
    const v = h('span.v', { text: String(fmt(S[key] ?? min)) });
    const r = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(S[key] ?? min), 'aria-label': label });
    let pend = 0;
    r.addEventListener('input', () => {
      S[key] = +r.value; v.textContent = String(fmt(+r.value));
      if (!pend) pend = requestAnimationFrame(() => { pend = 0; save(); }); // live (audio volumes, camera speed)
    });
    return h('div.u-row', {}, [h('label', { text: label }), r, v]);
  }
  function toggle(label, key, def = true, onChange = null) {
    const b = h('button.u-tog', { role: 'switch' }, [h('span', { text: label }), h('i')]);
    const paint = () => { const on = S[key] ?? def; b.classList.toggle('on', !!on); b.setAttribute('aria-checked', String(!!on)); };
    b.addEventListener('click', () => { S[key] = !(S[key] ?? def); paint(); save(); onChange?.(S[key]); });
    paint();
    return b;
  }
  function seg(label, values, get, set) {
    const wrap = h('div.u-seg');
    const btns = values.map(([v, t]) => {
      const b = h('button', { text: t });
      b.addEventListener('click', () => { set(v); paint(); });
      wrap.append(b);
      return [v, b];
    });
    const paint = () => { for (const [v, b] of btns) b.classList.toggle('on', get() === v); };
    paint();
    return h('div.u-row', {}, [h('label', { text: label }), wrap]);
  }

  return {
    setQuality,
    tab: {
      id: 'settings', title: 'Settings', icon: 'settings', order: 90, hotkey: 'O',
      render(el) {
        const root = h('div.u-set');
        root.append(
          h('h4', { text: 'Sound' }),
          slider('Master', 'masterVolume', 0, 1, 0.05),
          slider('Music', 'musicVolume', 0, 1, 0.05),
          slider('Effects', 'sfxVolume', 0, 1, 0.05),
          h('h4', { text: 'Graphics' }),
          seg('Quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High']], () => S.quality || 'auto', setQuality),
          h('h4', { text: 'Camera' }),
          slider('Turn speed', 'cameraSpeed', 0.3, 2.5, 0.1, (v) => v.toFixed(1)),
          toggle('Invert zoom', 'invertZoom', false),
          h('h4', { text: 'Interface' }),
          toggle('XP drops', 'showXpDrops', true),
          toggle('Quest tracker', 'questTracker', true),
          toggle('Player names', 'showNames', true),
          toggle('Shift-click drops items', 'shiftDrop', true),
          toggle('Run by default', 'runDefault', true, (on) => safe(() => ctx.player.toggleRun(on))),
          toggle('Auto retaliate', 'autoRetaliate', true, (on) => safe(() => ctx.combat?.setAutoRetaliate?.(on))),
        );
        const foot = h('div.u-setfoot');
        const out = h('button.u-btn.red', { html: `${tabSvg('logout')}<span>Log out</span>` });
        out.addEventListener('click', () => U.ui.logout());
        const map = h('button.u-btn', { html: `${tabSvg('map')}<span>World map</span>` });
        map.addEventListener('click', () => U.ui.openWorldMap());
        foot.append(map, out);
        root.append(foot);
        el.append(root);
      },
    },
  };
}
