// Combat tab: weapon + combat level, attack styles (melee / bow / staff), auto-retaliate and a
// (disabled) special-attack bar. Owner: ui builder.
// Writes state.save.combatStyle, calls ctx.combat.setStyle?(style), emits 'combat:style' {style}.

import { injectStyle, h } from '../../core/dom.js';
import { SPELLS } from '../../data/economy.js';
import { esc, safe } from '../util.js';

const STYLES = {
  melee: [
    { id: 'accurate', name: 'Accurate', xp: 'Attack XP', glyph: 'M6 18L18 6M14 6h4v4' },
    { id: 'aggressive', name: 'Aggressive', xp: 'Strength XP', glyph: 'M5 19l7-14 7 14M8 13h8' },
    { id: 'defensive', name: 'Defensive', xp: 'Defence XP', glyph: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z' },
  ],
  bow: [
    { id: 'accurate', name: 'Accurate', xp: 'Archery XP', glyph: 'M4 20L20 4M15 4h5v5' },
    { id: 'rapid', name: 'Rapid', xp: 'Archery XP · faster', glyph: 'M3 15l6-6M9 18l6-6M15 21l6-6' },
    { id: 'longrange', name: 'Longrange', xp: 'Archery + Defence XP', glyph: 'M3 12h18M17 8l4 4-4 4' },
  ],
  staff: [
    { id: 'accurate', name: 'Bash', xp: 'Attack XP', glyph: 'M6 18L18 6' },
    { id: 'aggressive', name: 'Pound', xp: 'Strength XP', glyph: 'M5 19l7-14 7 14' },
    { id: 'defensive', name: 'Focus', xp: 'Defence XP', glyph: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z' },
  ],
};

const CSS = `
.u-cbhead { display: flex; align-items: center; gap: 8px; padding: 2px 4px 8px; border-bottom: 1px solid rgba(201,162,74,.25); margin-bottom: 8px; }
.u-cbhead img { width: 36px; height: 36px; }
.u-cbhead .n { font: 700 14px/1.2 var(--font-body); color: #ffe7a8; }
.u-cbhead .l { font: 12px var(--font-body); color: var(--parch-dim); }
.u-styles { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.u-style { display: flex; align-items: center; gap: 8px; padding: 8px; min-height: 50px; text-align: left; border: 0; border-radius: 6px; cursor: pointer; color: var(--parch);
  background: linear-gradient(180deg, #3b2c20, #261c14); box-shadow: inset 0 0 0 1px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,220,160,.08); }
.u-style:hover { filter: brightness(1.15); }
.u-style.on { background: linear-gradient(180deg, #7a2f20, #4a1a10); box-shadow: inset 0 0 0 1px var(--brass), 0 0 8px rgba(201,162,74,.3); }
.u-style svg { width: 22px; height: 22px; flex: 0 0 auto; color: #e8c770; }
.u-style b { display: block; font: 700 13px var(--font-body); }
.u-style span { font: 11px var(--font-body); color: var(--parch-dim); }
.u-cbrow { display: flex; gap: 6px; margin-top: 8px; }
.u-cbrow .u-btn { flex: 1; }
.u-spec { margin-top: 10px; height: 20px; border-radius: 4px; background: #120c07; box-shadow: inset 0 0 0 1px rgba(201,162,74,.35); display: grid; place-items: center; font: 600 11px var(--font-body); color: #6f6250; letter-spacing: .04em; }
`;

export function createCombatPanel(U) {
  const { ctx, events, state } = U;
  injectStyle('ui-combat', CSS);
  let root = null;

  const weaponKind = () => {
    const w = safe(() => ctx.equipment.weapon(), null);
    return w?.equip?.style === 'bow' ? 'bow' : w?.equip?.style === 'staff' ? 'staff' : 'melee';
  };
  function setStyle(id) {
    if (ctx.combat?.setStyle) safe(() => ctx.combat.setStyle(id));
    else { state.save.combatStyle = id; state.markDirty(); events.emit('combat:style', { style: id }); }
    paint();
  }

  function paint() {
    if (!root) return;
    const kind = weaponKind();
    const styles = STYLES[kind];
    let cur = safe(() => ctx.combat?.style, null) || state.save.combatStyle || 'accurate';
    if (!styles.some((s) => s.id === cur)) { cur = styles[0].id; state.save.combatStyle = cur; safe(() => ctx.combat?.setStyle?.(cur)); }
    const w = safe(() => ctx.equipment.weapon(), null);
    const wid = safe(() => ctx.equipment.slots.weapon?.id, null);
    root.innerHTML = '';
    root.append(h('div.u-cbhead', {}, [
      wid ? h('img', { src: U.icons.itemIcon(wid), alt: '' }) : h('img', { src: U.icons.skillIcon('strength'), alt: '' }),
      h('div', {}, [h('div.n', { text: w?.name || 'Unarmed' }), h('div.l', { text: `Combat level ${safe(() => ctx.skills.combatLevel(), 3)}` })]),
    ]));
    const grid = h('div.u-styles');
    for (const s of styles) {
      const b = h('button.u-style' + (s.id === cur ? '.on' : ''), { html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${s.glyph}"/></svg><div><b>${esc(s.name)}</b><span>${esc(s.xp)}</span></div>` });
      b.addEventListener('click', () => setStyle(s.id));
      grid.append(b);
    }
    root.append(grid);
    const auto = safe(() => ctx.combat?.autoRetaliate, undefined) ?? state.settings.autoRetaliate !== false;
    const row = h('div.u-cbrow');
    const ar = h('button.u-btn' + (auto ? '.on' : ''), { text: `Auto retaliate: ${auto ? 'On' : 'Off'}` });
    ar.addEventListener('click', () => { if (ctx.combat?.setAutoRetaliate) safe(() => ctx.combat.setAutoRetaliate(!auto)); state.settings.autoRetaliate = !auto; state.saveSettings(); paint(); });
    row.append(ar);
    if (kind === 'staff') {
      const ac = safe(() => ctx.magic?.autocast, null) ?? state.save.autocast;
      const sp = SPELLS.find((x) => x.id === (typeof ac === 'string' ? ac : ac?.id));
      const b = h('button.u-btn' + (sp ? '.on' : ''), { text: sp ? `Autocast: ${sp.name}` : 'Choose autocast' });
      b.addEventListener('click', () => U.side.select('spellbook'));
      row.append(b);
    }
    root.append(row, h('div.u-spec', { text: 'Special attack — none for this weapon' }));
  }
  for (const ev of ['equipment:change', 'save:loaded', 'level:up', 'magic:autocast', 'settings:change', 'combat:style', 'combat:autoretaliate']) events.on(ev, () => { if (root && U.side.isVisible('combat')) paint(); });

  return {
    tab: {
      id: 'combat', title: 'Combat Options', icon: 'combat', order: 10, hotkey: 'C',
      render(el) { root = el; paint(); },
      onShow: paint,
    },
  };
}
