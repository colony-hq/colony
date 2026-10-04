// Skills tab: 15 skills (current / base level), XP tooltips with progress bars, total and combat
// level. Click a skill for its guide window. Owner: ui builder.

import { injectStyle, h } from '../../core/dom.js';
import { SKILLS, xpForLevel, MAX_LEVEL } from '../../data/skills.js';
import { skillIcon } from '../icons.js';
import { fmtInt, safe } from '../util.js';

const CSS = `
.u-skills { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; }
.u-sk { position: relative; height: 44px; box-sizing: border-box; display: flex; align-items: center; gap: 4px; padding: 0 6px 0 4px; border-radius: 5px; cursor: pointer; border: 0; color: inherit;
  background: linear-gradient(180deg, rgba(255,220,160,.06), rgba(0,0,0,.18)); box-shadow: inset 0 0 0 1px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,220,160,.06); }
.u-sk:hover { background: linear-gradient(180deg, rgba(255,220,160,.14), rgba(0,0,0,.12)); box-shadow: inset 0 0 0 1px rgba(201,162,74,.6); }
.u-sk img { width: 28px; height: 28px; flex: 0 0 auto; }
.u-sk .lv { flex: 1; text-align: right; font: 700 14px/1 var(--font-mono); color: #ffe46a; text-shadow: 1px 1px 0 #000; white-space: nowrap; }
.u-sk .lv small { color: #d8c79a; font-weight: 600; font-size: 12px; }
.u-sk .lv.boost { color: #8fe38f; } .u-sk .lv.drain { color: #ff8a7a; }
.u-sk .pg { position: absolute; left: 5px; right: 5px; bottom: 3px; height: 2px; background: rgba(0,0,0,.6); border-radius: 1px; overflow: hidden; }
.u-sk .pg i { display: block; height: 100%; background: linear-gradient(90deg, #6b5320, #e8c770); }
.u-sk.max .lv { color: #7ff0ff; }
.u-sktot { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding: 7px 10px; border-radius: 5px; font: 600 13px var(--font-body); color: var(--parch-dim);
  background: rgba(0,0,0,.25); box-shadow: inset 0 0 0 1px rgba(201,162,74,.25); }
.u-sktot b { font: 700 14px var(--font-mono); color: #ffe46a; }
[data-layout=phone] .u-sk { height: 50px; }
@media (max-height: 640px) { [data-layout=desk] .u-sk { height: 40px; } [data-layout=desk] .u-sktot { margin-top: 5px; padding: 6px 10px; } }
`;

export function skillTipHTML(ctx, id, name) {
  const xp = safe(() => ctx.skills.xp(id), 0);
  const lvl = safe(() => ctx.skills.level(id), 1);
  if (lvl >= MAX_LEVEL) return `<b>${name}</b><br>XP: ${fmtInt(xp)}<br><span class="u-dim">Mastered.</span>`;
  const next = xpForLevel(lvl + 1);
  const p = safe(() => ctx.skills.progress(id), 0);
  return `<b>${name}</b> — level ${lvl}<br>XP: <span class="u-mono">${fmtInt(xp)}</span><br>Next level at: <span class="u-mono">${fmtInt(next)}</span><br>Remaining: <span class="u-mono">${fmtInt(next - xp)}</span><div class="bar"><i style="width:${(p * 100).toFixed(1)}%"></i></div><span class="u-dim u-small">Click for the skill guide</span>`;
}

export function createSkillsPanel(U) {
  const { ctx, events } = U;
  injectStyle('ui-skills', CSS);
  const cells = {};
  let tot = null;
  let dirty = true;

  function paint() {
    dirty = false;
    for (const s of SKILLS) {
      const c = cells[s.id];
      if (!c) continue;
      const base = safe(() => ctx.skills.level(s.id), 1);
      const cur = safe(() => ctx.skills.current(s.id), base);
      c._lv.innerHTML = `${cur}<small>/${base}</small>`;
      c._lv.className = 'lv' + (cur > base ? ' boost' : cur < base ? ' drain' : '');
      c.classList.toggle('max', base >= MAX_LEVEL);
      c._pg.style.width = (safe(() => ctx.skills.progress(s.id), 0) * 100).toFixed(1) + '%';
    }
    if (tot) tot.innerHTML = `<span>Total level <b>${safe(() => ctx.skills.totalLevel(), 0)}</b></span><span>Combat <b>${safe(() => ctx.skills.combatLevel(), 3)}</b></span>`;
  }
  const mark = () => { dirty = true; if (U.side.isVisible('skills')) paint(); };
  events.on('xp', mark);
  events.on('level:up', mark);
  events.on('save:loaded', mark);
  events.on('combat:hit', ({ target }) => { if (target === ctx.player?.entity) mark(); });
  events.on('food:eat', mark);

  return {
    tab: {
      id: 'skills', title: 'Skills', icon: 'skills', order: 20, hotkey: 'K',
      render(el) {
        const grid = h('div.u-skills');
        for (const s of SKILLS) {
          const lv = h('span.lv');
          const pg = h('i');
          const c = h('button.u-sk', { 'aria-label': s.name }, [h('img', { src: skillIcon(s.id), alt: '' }), lv, h('div.pg', {}, [pg])]);
          c._lv = lv; c._pg = pg;
          c.addEventListener('click', () => U.ui.openSkillGuide(s.id));
          U.tip.attach(c, () => skillTipHTML(ctx, s.id, s.name));
          cells[s.id] = c;
          grid.append(c);
        }
        tot = h('div.u-sktot');
        el.append(grid, tot);
        paint();
      },
      onShow() { if (dirty || true) paint(); },
    },
  };
}
