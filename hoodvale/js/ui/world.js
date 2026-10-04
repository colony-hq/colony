// World interaction: top-left hover text, left-click default action, right-click / long-press
// "Choose Option" menu, use-item-on and cast-spell-on targeting, click marker crosses.
// Owner: ui builder. Drives ctx.picking, ctx.actions, ctx.player, ctx.game (item ops), ctx.magic.

import { injectStyle, h } from '../core/dom.js';
import { ITEMS } from '../data/items.js';
import { SPELLS } from '../data/economy.js';
import { esc, entityLabelHTML, safe } from './util.js';

const CSS = `
.u-xmark { position: absolute; width: 20px; height: 20px; margin: -10px 0 0 -10px; pointer-events: none; animation: u-xm .5s steps(4) forwards; }
.u-xmark::before, .u-xmark::after { content: ''; position: absolute; left: 50%; top: 50%; width: 18px; height: 4px; margin: -2px 0 0 -9px; border-radius: 1px; box-shadow: 0 0 0 1px #000; }
.u-xmark::before { transform: rotate(45deg); } .u-xmark::after { transform: rotate(-45deg); }
.u-xmark.y::before, .u-xmark.y::after { background: #ffe030; }
.u-xmark.r::before, .u-xmark.r::after { background: #ff2a1a; }
@keyframes u-xm { 0% { transform: scale(1.15); } 100% { transform: scale(.45); opacity: .2; } }
.u-usebar { position: absolute; left: 50%; top: 40px; transform: translateX(-50%); padding: 6px 12px 6px 8px; border-radius: 20px; display: flex; align-items: center; gap: 8px; pointer-events: auto;
  font: 600 13px/1 var(--font-body); background: rgba(20,14,9,.88); box-shadow: 0 0 0 1px #000, inset 0 0 0 1px rgba(201,162,74,.5); color: var(--parch); }
.u-usebar img { width: 26px; height: 26px; }
.u-usebar button { border: 0; background: none; color: var(--parch-dim); cursor: pointer; font: 600 12px var(--font-body); padding: 4px 6px; }
.u-usebar button:hover { color: #fff; }
[data-layout=desk]:not(.u-touch) .u-usebar { display: none; }
`;

export function createWorld(U) {
  const { ctx, events, input, state } = U;
  injectStyle('ui-world', CSS);
  const gl = document.getElementById('gl');
  let uiHover = null;
  let spell = null; // { id, name }
  const useBar = h('div.u-usebar.u-hidden', { 'data-interactive': '' });
  U.hud.root.append(useBar);

  const selected = () => safe(() => ctx.game?.selected, null) || null;
  const selItemName = () => { const s = selected(); return s ? ITEMS[s.id]?.name || s.id : ''; };
  const itemSpan = (name) => `<span style="color:#ff9f43">${esc(name)}</span>`;

  function pickAt(x, y) {
    const nx = (x / window.innerWidth) * 2 - 1, ny = -(y / window.innerHeight) * 2 + 1;
    return safe(() => ctx.picking.pick(nx, ny), { hits: [], tile: null, point: null });
  }

  const optsOf = (e) => { const o = safe(() => e.options?.(), []); return Array.isArray(o) ? o : []; };

  // Build the menu rows for a pick result. Row: { html, act, kind: 'action'|'walk'|'cancel' }.
  function buildRows(r) {
    const rows = [];
    const sel = selected();
    const walk = r.tile ? { html: '<span class="o">Walk here</span>', act: () => walkTo(r.tile.x, r.tile.z), kind: 'walk' } : null;
    if (sel) {
      for (const { entity } of r.hits) {
        rows.push({ html: `<span class="o">Use</span> ${itemSpan(selItemName())} <span class="o">-&gt;</span> ${entityLabelHTML(entity, ctx)}`, act: () => { ctx.game.useItemOn(sel.index, entity); clearUse(); }, kind: 'action' });
      }
      if (walk) rows.push({ ...walk, act: () => { clearUse(); walk.act(); } });
      rows.push({ html: '<span class="o">Cancel</span>', act: clearUse, kind: 'cancel', cancel: true });
      return rows;
    }
    if (spell) {
      const sp = spell;
      for (const { entity } of r.hits) {
        if (entity.kind !== 'monster' && entity.kind !== 'remote') continue;
        rows.push({ html: `<span class="o">Cast</span> <span style="color:#7fe0ff">${esc(sp.name)}</span> <span class="o">-&gt;</span> ${entityLabelHTML(entity, ctx)}`, act: () => { castOn(sp.id, entity); setSpell(null); }, kind: 'action' });
      }
      if (walk) rows.push({ ...walk, act: () => { setSpell(null); walk.act(); } });
      rows.push({ html: '<span class="o">Cancel</span>', act: () => setSpell(null), kind: 'cancel', cancel: true });
      return rows;
    }
    const exam = [];
    for (const { entity } of r.hits) {
      for (const o of optsOf(entity)) {
        const row = { html: `<span class="o">${esc(o)}</span> ${entityLabelHTML(entity, ctx)}`, act: () => perform(entity, o), kind: 'action', entity };
        if (o === 'Examine') exam.push(row); else rows.push(row);
      }
    }
    if (walk) rows.push(walk);
    rows.push(...exam);
    rows.push({ html: '<span class="o">Cancel</span>', act: () => {}, kind: 'cancel', cancel: true });
    return rows;
  }

  function perform(entity, option) {
    if (option !== 'Examine') U.closeTransient();
    ctx.actions?.perform?.(entity, option);
  }
  function walkTo(tx, tz) {
    U.closeTransient();
    ctx.player?.walkTo?.(tx, tz);
  }
  function castOn(id, entity) {
    U.closeTransient();
    const ok = safe(() => ctx.magic?.cast?.(id, entity), false);
    if (ok === false && !ctx.magic?.cast) U.ui.message('Your spellbook is not ready yet.', 'warn');
  }

  function marker(x, y, kind) {
    const m = h('div.u-xmark.' + (kind === 'walk' ? 'y' : 'r'), { style: { left: x + 'px', top: y + 'px' } });
    U.roots.overlay.append(m);
    setTimeout(() => m.remove(), 520);
  }

  function clearUse() { safe(() => ctx.game?.clearSelection?.()); refreshUseBar(); }
  function setSpell(s) {
    spell = s;
    if (s) clearUse();
    refreshUseBar();
    events.emit('ui:spell-target', { id: s?.id || null });
  }
  function refreshUseBar() {
    const sel = selected();
    const on = !!(sel || spell);
    useBar.classList.toggle('u-hidden', !on);
    if (gl) gl.style.cursor = on ? 'crosshair' : '';
    if (!on) return;
    useBar.innerHTML = '';
    if (sel) useBar.append(h('img', { src: U.icons.itemIcon(sel.id), alt: '' }), h('span', { html: `Use ${itemSpan(selItemName())} on…` }));
    else useBar.append(h('span', { html: `Cast <b style="color:#7fe0ff">${esc(spell.name)}</b> on…` }));
    useBar.append(h('button', { text: 'Cancel', onclick: () => { clearUse(); setSpell(null); } }));
  }
  events.on('item:select', () => { if (selected()) spell = null; refreshUseBar(); U.inventory?.refreshSelection?.(); });

  // ---- input ----
  input.on('click', (ev) => {
    if (state.mode !== 'play') return;
    if (U.menu.isOpen) { U.menu.close(); return; }
    const r = pickAt(ev.x, ev.y);
    const rows = buildRows(r);
    const first = rows[0];
    if (!first || first.cancel) {
      if (selected() || spell) { clearUse(); setSpell(null); }
      return;
    }
    marker(ev.x, ev.y, first.kind === 'walk' ? 'walk' : 'action');
    first.act();
  });
  input.on('menu', (ev) => {
    if (state.mode !== 'play') return;
    world.openMenuAt(ev.x, ev.y);
  });

  const world = {
    pickAt, buildRows, marker,
    get spell() { return spell; },
    setSpell(id) {
      if (!id) return setSpell(null);
      const sp = SPELLS.find((s) => s.id === id);
      setSpell(sp ? { id: sp.id, name: sp.name } : null);
    },
    clearTargeting() { clearUse(); setSpell(null); },
    get targeting() { return !!(selected() || spell); },
    refreshUseBar,
    openMenuAt(x, y) {
      const r = pickAt(x, y);
      const rows = buildRows(r);
      U.menu.open(x, y, rows.map((row) => ({
        html: row.html, cancel: row.cancel,
        onSelect: () => { if (!row.cancel) marker(x, y, row.kind === 'walk' ? 'walk' : 'action'); row.act(); },
      })), { onRightClickOutside: (cx, cy) => world.openMenuAt(cx, cy) });
    },
    // UI elements (inventory slots etc.) set the hover line while the pointer is over them.
    setUiHover(html) { uiHover = html; },
    update() {
      if (state.mode !== 'play' || U.menu.isOpen) { U.hud.setHover(''); return; }
      if (uiHover) { U.hud.setHover(uiHover); return; }
      if (!input.pointer.inside || input.device === 'touch') { U.hud.setHover(''); return; }
      const hv = ctx.picking?.hover;
      if (!hv) { U.hud.setHover(''); return; }
      const rows = buildRows(hv);
      const first = rows[0];
      const sel = selected();
      if (sel && (!first || first.kind !== 'action')) { U.hud.setHover(`Use ${itemSpan(selItemName())} -&gt;`); return; }
      if (spell && (!first || first.kind !== 'action')) { U.hud.setHover(`Cast <span style="color:#7fe0ff">${esc(spell.name)}</span> -&gt;`); return; }
      if (!first || first.cancel) { U.hud.setHover(''); return; }
      const more = rows.length - 2; // minus the first row and Cancel
      U.hud.setHover(first.html + (more > 0 ? ` <span class="more">/ ${more} more option${more > 1 ? 's' : ''}</span>` : ''));
    },
  };
  return world;
}
