// Spellbook tab: Arcana spells from data/economy.js with sigil costs; greyed when the level or
// sigils are missing. Click: combat spells enter "Cast on" targeting, teleports cast at once.
// Right-click: Cast / Autocast. Owner: ui builder. Uses ctx.magic (cast, canCast, autocast).

import { injectStyle, h } from '../../core/dom.js';
import { SPELLS } from '../../data/economy.js';
import { ITEMS } from '../../data/items.js';
import { spellIcon } from '../icons.js';
import { esc, safe } from '../util.js';

const CSS = `
.u-spells { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.u-spell { position: relative; aspect-ratio: 1; border: 0; padding: 0; border-radius: 8px; cursor: pointer; display: grid; place-items: center;
  background: radial-gradient(circle at 50% 40%, rgba(142,124,255,.18), rgba(0,0,0,.25)); box-shadow: inset 0 0 0 1px rgba(142,124,255,.35); }
.u-spell img { width: 40px; height: 40px; }
.u-spell:hover { box-shadow: inset 0 0 0 1px #c6b6ff, 0 0 10px rgba(142,124,255,.45); }
.u-spell.no { cursor: default; background: rgba(0,0,0,.25); box-shadow: inset 0 0 0 1px rgba(0,0,0,.6); }
.u-spell.no img { filter: grayscale(1) brightness(.45); }
.u-spell .lv { position: absolute; left: 3px; top: 2px; font: 600 10px var(--font-mono); color: #c6b6ff; text-shadow: 1px 1px 0 #000; }
.u-spell.no .lv { color: #8a7a68; }
.u-spell.auto::after { content: 'AUTO'; position: absolute; left: 50%; bottom: 1px; transform: translateX(-50%); font: 700 8px var(--font-mono); color: #1d1510; background: #c9a24a; padding: 1px 3px; border-radius: 3px; }
.u-spell.sel { box-shadow: inset 0 0 0 2px #fff, 0 0 12px rgba(255,255,255,.4); }
.u-spellhead { display: flex; justify-content: space-between; align-items: center; padding: 2px 4px 8px; font: 600 12px var(--font-display); color: #c6b6ff; letter-spacing: .04em; }
.u-spellhead b { color: #ffe46a; font: 700 13px var(--font-mono); }
.u-spellnote { margin-top: 8px; font: 12px/1.35 var(--font-body); color: var(--parch-dim); text-align: center; }
.u-sig { display: inline-flex; align-items: center; gap: 2px; margin-right: 6px; }
.u-sig img { width: 18px; height: 18px; vertical-align: middle; }
.u-sig.lack { color: #ff8a7a; }
`;

export function createSpellbookPanel(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-spells', CSS);
  let root = null;
  const cells = {};

  const infinite = () => safe(() => ctx.equipment.weapon()?.equip?.infiniteSigil, null);
  const have = (sigil) => (infinite() === sigil ? Infinity : safe(() => ctx.inventory.count(sigil), 0));
  const level = () => safe(() => ctx.skills.level('arcana'), 1);
  function status(sp) {
    if (level() < sp.level) return { ok: false, why: `Requires Arcana level ${sp.level}` };
    if (ctx.magic?.reason) { const r = safe(() => ctx.magic.reason(sp.id), null); return r ? { ok: false, why: r } : { ok: true }; }
    for (const [sig, n] of sp.cost) if (have(sig) < n) return { ok: false, why: `Not enough ${ITEMS[sig]?.name || sig}s` };
    const r = safe(() => ctx.magic?.reason?.(sp.id), null);
    if (r) return { ok: false, why: r };
    const c = safe(() => ctx.magic?.canCast?.(sp.id), undefined);
    if (c === false || (c && typeof c === 'object' && c.ok === false)) return { ok: false, why: c?.reason || 'You cannot cast that now' };
    return { ok: true };
  }
  const autocastId = () => { const a = safe(() => ctx.magic?.autocast, null) ?? state.save.autocast; return typeof a === 'string' ? a : a?.id || null; };

  function costHTML(sp) {
    return sp.cost.map(([sig, n]) => `<span class="u-sig${have(sig) < n ? ' lack' : ''}"><img src="${U.icons.itemIcon(sig)}" alt="">${n}</span>`).join('');
  }
  function tip(sp) {
    const st = status(sp);
    return `<b>${esc(sp.name)}</b> <span class="u-dim">— level ${sp.level}</span><br>${sp.teleport ? 'Teleports you there in a flash of thought.' : `Max hit: <b>${sp.maxHit}</b>`}<br>${costHTML(sp)}${st.ok ? '' : `<br><span style="color:#ff8a7a">${esc(st.why)}</span>`}<br><span class="u-dim u-small">${sp.teleport ? 'Click to cast' : 'Click, then click a target · right-click to autocast'}</span>`;
  }
  function cast(sp) {
    const st = status(sp);
    if (!st.ok) { U.ui.message(st.why + '.', 'warn'); return; }
    if (sp.teleport) { const r = safe(() => ctx.magic?.cast?.(sp.id), false); if (r === false && !ctx.magic?.cast) U.ui.message('Your spellbook is not ready yet.', 'warn'); return; }
    U.world.setSpell(sp.id);
    if (U.layout === 'phone') U.side.closeSheet();
  }
  function setAutocast(id) {
    if (ctx.magic?.setAutocast) { if (safe(() => ctx.magic.setAutocast(id), false) === false && id) return; }
    else { state.save.autocast = id; state.markDirty(); events.emit('magic:autocast', { id, spell: id }); }
    U.ui.message(id ? `Autocast set: ${SPELLS.find((s) => s.id === id)?.name}.` : 'Autocast cleared.', 'game');
    paint();
  }

  function paint() {
    if (!root) return;
    const auto = autocastId();
    const sel = U.world?.spell?.id;
    for (const sp of SPELLS) {
      const c = cells[sp.id];
      if (!c) continue;
      c.classList.toggle('no', !status(sp).ok);
      c.classList.toggle('auto', auto === sp.id);
      c.classList.toggle('sel', sel === sp.id);
    }
    head.innerHTML = `<span>Arcana</span><span>Level <b>${level()}</b></span>`;
  }
  let head = null;
  for (const ev of ['inventory:change', 'equipment:change', 'level:up', 'save:loaded', 'ui:spell-target', 'magic:autocast']) events.on(ev, () => { if (root) paint(); });

  return {
    tab: {
      id: 'spellbook', title: 'Spellbook', icon: 'spellbook', order: 60, hotkey: 'B',
      render(el) {
        root = el;
        head = h('div.u-spellhead');
        const grid = h('div.u-spells');
        for (const sp of SPELLS) {
          const c = h('button.u-spell', { 'aria-label': sp.name }, [h('img', { src: spellIcon(sp), alt: '' }), h('span.lv', { text: String(sp.level) })]);
          c.addEventListener('click', () => cast(sp));
          c.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const rows = [{ html: `<span class="o">Cast</span> <span style="color:#7fe0ff">${esc(sp.name)}</span>`, onSelect: () => cast(sp) }];
            if (!sp.teleport) rows.push(autocastId() === sp.id
              ? { html: '<span class="o">Clear autocast</span>', onSelect: () => setAutocast(null) }
              : { html: `<span class="o">Autocast</span> <span style="color:#7fe0ff">${esc(sp.name)}</span>`, onSelect: () => setAutocast(sp.id) });
            rows.push({ html: '<span class="o">Cancel</span>', cancel: true });
            U.menu.open(e.clientX, e.clientY, rows);
          });
          U.tip.attach(c, () => tip(sp));
          cells[sp.id] = c;
          grid.append(c);
        }
        el.append(head, grid, h('div.u-spellnote', { text: 'Sigils are pressed from orbium shards at the Spire. A staff of sparks, tides or embers supplies its own.' }));
        paint();
      },
      onShow: paint,
    },
  };
}
