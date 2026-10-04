// Skill guide window (unlock tables derived from the data modules) and quest journal window.
// Owner: ui builder.

import { injectStyle, h } from '../../core/dom.js';
import { SKILLS, SKILL_BY_ID, xpForLevel, MAX_LEVEL } from '../../data/skills.js';
import { ITEMS } from '../../data/items.js';
import { OBJECTS } from '../../data/objects.js';
import { NPCS } from '../../data/npcs.js';
import { QUEST_BY_ID } from '../../data/quests.js';
import { SMELTING, COOKING, FIREMAKING, FLETCHING, CRAFTING, INSCRIBING, SPELLS } from '../../data/economy.js';
import { skillIcon, spellIcon } from '../icons.js';
import { esc, fmtInt, safe } from '../util.js';
import { questStatus } from '../panels/quests.js';

const CSS = `
.u-guide .u-win-b { padding: 0 14px 14px; }
.u-gskills { display: flex; flex-wrap: wrap; gap: 3px; margin: 0 0 8px; }
.u-gskills { flex-wrap: nowrap !important; justify-content: space-between; }
.u-gskills button { width: 30px; height: 32px; flex: 0 0 auto; border: 0; border-radius: 6px; padding: 0; cursor: pointer; background: rgba(122,84,34,.12); display: grid; place-items: center; }
.u-gskills button img { width: 24px; height: 24px; }
[data-layout=phone] .u-gskills { flex-wrap: wrap !important; justify-content: flex-start; }
.u-gskills button.on { background: rgba(122,84,34,.35); box-shadow: inset 0 0 0 1px #7a5422; }
.u-ghead { display: flex; align-items: center; gap: 12px; padding: 4px 0 8px; border-bottom: 1px solid rgba(122,84,34,.35); }
.u-ghead img { width: 44px; height: 44px; }
.u-ghead h3 { margin: 0; font: 700 20px var(--font-display); color: #5a1a10; }
.u-ghead p { margin: 2px 0 0; font: 13px var(--font-body); color: #5a4428; }
.u-ghead .xp { margin-left: auto; text-align: right; font: 12px var(--font-mono); color: #5a4428; }
.u-glist { list-style: none; margin: 6px 0 0; padding: 0; }
.u-glist li { display: grid; grid-template-columns: 38px 34px 1fr; align-items: center; gap: 8px; padding: 4px 4px; border-bottom: 1px dashed rgba(122,84,34,.25); font: 14px/1.25 var(--font-body); color: #24180e; }
.u-glist li .lv { font: 700 13px var(--font-mono); text-align: center; border-radius: 4px; padding: 3px 0; background: rgba(170,40,30,.14); color: #8a1a10; }
.u-glist li.ok .lv { background: rgba(60,130,40,.18); color: #2a6a1a; }
.u-glist li img { width: 32px; height: 32px; }
.u-glist li small { display: block; color: #6a5030; font-size: 12px; }
.u-glist li.ok { opacity: 1; } .u-glist li:not(.ok) { opacity: .82; }
.u-glist .sec { display: block; border: 0; padding: 10px 2px 2px; font: 700 12px var(--font-display); color: #7a5422; letter-spacing: .06em; }

.u-journal .u-win-b { padding: 0 18px 16px; }
.u-jmeta { display: flex; gap: 10px; flex-wrap: wrap; font: 12px var(--font-body); color: #6a5030; margin: -2px 0 8px; }
.u-jmeta b { color: #3a2410; }
.u-jl { list-style: none; margin: 0; padding: 0; font: 15px/1.45 var(--font-body); color: #24180e; }
.u-jl li { margin: 5px 0; }
.u-jl .summary { font-style: italic; color: #4a3418; }
.u-jl .step.done { color: #8a7a60; text-decoration: line-through; text-decoration-color: rgba(90,60,30,.5); }
.u-jl .step.current { color: #7a1a10; font-weight: 700; }
.u-jl .step.current::before { content: '\\27A4  '; color: #a8761a; }
.u-jl .req { font-size: 14px; } .u-jl .req.done { color: #2a6a1a; } .u-jl .req:not(.done) { color: #9a2a1a; }
.u-jl .complete { font: 700 18px var(--font-display); color: #2a6a1a; text-align: center; margin-top: 12px; }
.u-jl .reward { font-size: 14px; color: #3a2a12; } .u-jl .reward::before { content: '\\2726  '; color: #a8761a; }
.u-jfoot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
`;

// ---------------------------------------------------------------------------- unlock tables
function equipRows(skill) {
  const rows = [];
  for (const it of Object.values(ITEMS)) {
    const lv = it.equip?.req?.[skill];
    if (!lv) continue;
    const b = it.equip.bonus || {};
    const note = Object.entries(b).filter(([, v]) => v).map(([k, v]) => `${{ atk: 'Att', str: 'Str', def: 'Def', rng: 'Arch', rstr: 'R.str', mag: 'Arc' }[k] || k} +${v}`).join(' · ');
    rows.push({ level: lv, item: it.id, name: it.name, note: (skill === 'attack' ? 'Wield' : 'Wear') + (note ? ` — ${note}` : '') });
  }
  return rows;
}

export function skillUnlocks(skill) {
  const R = [];
  const add = (level, item, name, note = '', extra = {}) => R.push({ level, item, name, note, ...extra });
  const objs = Object.values(OBJECTS);
  switch (skill) {
    case 'woodcutting':
      for (const o of objs) if (o.skill === 'woodcutting') add(o.level, o.product, o.name, `${ITEMS[o.product]?.name} · ${o.xp * 4} XP`);
      for (const it of Object.values(ITEMS)) if (it.tool?.type === 'axe') add(it.equip?.req?.attack || 1, it.id, it.name, `Tier ${it.tool.tier} axe — chops faster`, { sec: 'Axes' });
      break;
    case 'mining':
      for (const o of objs) if (o.skill === 'mining') add(o.level, o.product, o.name, `${ITEMS[o.product]?.name} · ${o.xp * 4} XP`);
      for (const it of Object.values(ITEMS)) if (it.tool?.type === 'pickaxe') add(it.equip?.req?.attack || 1, it.id, it.name, `Tier ${it.tool.tier} pickaxe — mines faster`, { sec: 'Pickaxes' });
      break;
    case 'fishing': {
      const seen = new Set();
      for (const o of objs) if (o.skill === 'fishing' && o.modes) for (const [mode, m] of Object.entries(o.modes)) for (const c of m.catches) {
        if (seen.has(c.item)) continue; seen.add(c.item);
        add(c.level, c.item, ITEMS[c.item]?.name, `${mode} · ${m.tool === 'net' ? 'small net' : m.tool === 'rod' ? 'fishing rod' : m.tool === 'flyrod' ? 'fly rod' : m.tool === 'pot' ? 'lobster pot' : m.tool}${m.bait ? ' + ' + (ITEMS[m.bait]?.name || m.bait).toLowerCase() : ''} · ${c.xp * 4} XP`);
      }
      break;
    }
    case 'thieving':
      for (const o of objs) if (o.skill === 'thieving') add(o.level, o.loot?.[0]?.item, o.name, `Steal from · ${o.xp * 4} XP`);
      for (const n of Object.values(NPCS)) if (n.thieving && !R.some((r) => r.name === n.name)) add(n.thieving.level, 'coin_pouch', n.name, `Pickpocket · ${n.thieving.xp * 4} XP`);
      break;
    case 'cooking':
      for (const c of COOKING) add(c.level, c.cooked, ITEMS[c.cooked]?.name, `From ${ITEMS[c.raw]?.name.toLowerCase()}${c.rangeOnly ? ' (range only)' : ''} · stops burning at ${c.stopBurn}`);
      break;
    case 'firemaking':
      for (const f of FIREMAKING) add(f.level, f.log, ITEMS[f.log]?.name, `Light a fire · ${f.xp * 4} XP`);
      break;
    case 'smithing':
      for (const s of SMELTING) add(s.level, s.bar, ITEMS[s.bar]?.name, `Smelt: ${s.inputs.map(([i, n]) => `${n} ${ITEMS[i]?.name.toLowerCase()}`).join(' + ')}`, { sec: 'Smelting' });
      for (const it of Object.values(ITEMS)) if (it.smith) add(it.smith.level, it.id, it.name, `${it.smith.bars} bar${it.smith.bars > 1 ? 's' : ''}${it.smith.makes ? ` · makes ${it.smith.makes}` : ''}`, { sec: 'Anvil' });
      break;
    case 'fletching': {
      const F = FLETCHING;
      add(F.shafts.level, F.shafts.product, 'Arrow shafts', `Knife on logs · ${F.shafts.qty} per log`);
      add(F.headless.level, F.headless.product, 'Headless arrows', 'Shafts + feathers');
      for (const a of F.arrows) add(a.level, a.product, ITEMS[a.product]?.name, `Headless arrows + ${ITEMS[a.heads]?.name.toLowerCase()}`);
      for (const it of Object.values(ITEMS)) if (it.fletch) add(it.fletch.level, it.id, it.name, `Knife on ${ITEMS[it.fletch.log]?.name.toLowerCase()} + bowstring`);
      break;
    }
    case 'crafting': {
      const C = CRAFTING;
      add(C.tan.level, 'leather', 'Leather', 'Tan cowhide at a tanning rack');
      add(C.silkString.level, 'bowstring', 'Bowstring (silk)', 'Spin spider silk');
      add(C.spin.level, 'bowstring', 'Bowstring', 'Spin flax at a spinning wheel');
      for (const g of C.gems) add(g.level, g.cut, ITEMS[g.cut]?.name, `Chisel on ${ITEMS[g.uncut]?.name.toLowerCase()}`);
      for (const it of Object.values(ITEMS)) if (it.craft) add(it.craft.level, it.id, it.name, it.craft.leather ? `${it.craft.leather} leather · needle + thread` : it.craft.gem ? `${ITEMS[it.craft.gem]?.name} + bowstring` : it.craft.scales ? `${it.craft.scales} wyrm scales` : '');
      break;
    }
    case 'arcana':
      for (const s of INSCRIBING) add(s.level, s.sigil, ITEMS[s.sigil]?.name, 'Inscribe orbium shards at the sigil altar', { sec: 'Sigils' });
      for (const sp of SPELLS) add(sp.level, null, sp.name, sp.teleport ? 'Teleport' : `Combat spell · max hit ${sp.maxHit}`, { sec: 'Spells', spell: sp });
      R.push(...equipRows('arcana').map((r) => ({ ...r, sec: 'Staves' })));
      break;
    case 'attack': R.push(...equipRows('attack')); break;
    case 'defence': R.push(...equipRows('defence')); break;
    case 'archery': R.push(...equipRows('archery')); break;
    case 'strength':
      for (const lv of [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99]) add(lv, null, `Level ${lv}`, `Max hit with no gear: ${Math.floor(0.5 + ((lv + 3 + 8) * 64) / 640)}`, { text: true });
      R.push(...Object.values(ITEMS).filter((it) => it.equip?.bonus?.str >= 6 && it.equip.slot !== 'weapon').map((it) => ({ level: 1, item: it.id, name: it.name, note: `Strength +${it.equip.bonus.str}` })));
      break;
    case 'hitpoints':
      for (const lv of [10, 20, 30, 40, 50, 60, 70, 80, 90, 99]) add(lv, null, `${lv} hitpoints`, lv === 10 ? 'Where every adventurer starts' : 'Each level adds one hitpoint', { text: true });
      break;
    default: break;
  }
  const order = (r) => (r.sec ? ['Smelting', 'Anvil', 'Sigils', 'Spells', 'Staves', 'Axes', 'Pickaxes'].indexOf(r.sec) + 1 : 0);
  R.sort((a, b) => order(a) - order(b) || a.level - b.level || String(a.name).localeCompare(String(b.name)));
  return R;
}

export function createGuides(U) {
  const { ctx, events } = U;
  injectStyle('ui-guide', CSS);
  const cache = new Map();
  const unlocks = (s) => { if (!cache.has(s)) cache.set(s, skillUnlocks(s)); return cache.get(s); };

  function renderSkill(body, skill) {
    body.innerHTML = '';
    const def = SKILL_BY_ID[skill];
    const lvl = safe(() => ctx.skills.level(skill), 1);
    const xp = safe(() => ctx.skills.xp(skill), 0);
    const bar = h('div.u-gskills');
    for (const s of SKILLS) {
      const b = h('button' + (s.id === skill ? '.on' : ''), { title: s.name, 'aria-label': s.name }, [h('img', { src: skillIcon(s.id), alt: '' })]);
      b.addEventListener('click', () => { renderSkill(body, s.id); U.windows.get('guide')?.setTitle(`${s.name} guide`); });
      bar.append(b);
    }
    const next = lvl < MAX_LEVEL ? xpForLevel(lvl + 1) : null;
    body.append(bar, h('div.u-ghead', {}, [
      h('img', { src: skillIcon(skill), alt: '' }),
      h('div', {}, [h('h3', { text: def?.name || skill }), h('p', { text: def?.blurb || '' })]),
      h('div.xp', { html: `Level <b>${lvl}</b><br>${fmtInt(xp)} XP${next ? `<br>${fmtInt(next - xp)} to go` : ''}` }),
    ]));
    const list = h('ul.u-glist');
    let sec = null;
    for (const r of unlocks(skill)) {
      if ((r.sec || null) !== sec) { sec = r.sec || null; if (sec) list.append(h('li.sec', { text: sec })); }
      const icon = r.spell ? spellIcon(r.spell) : r.item ? U.icons.itemIcon(r.item) : skillIcon(skill);
      list.append(h('li' + (lvl >= r.level ? '.ok' : ''), {}, [
        h('span.lv', { text: String(r.level) }),
        h('img', { src: icon, alt: '' }),
        h('div', { html: `${esc(r.name || '')}${r.note ? `<small>${esc(r.note)}</small>` : ''}` }),
      ]));
    }
    if (!list.children.length) list.append(h('li', { text: 'Nothing to list yet.' }));
    body.append(list);
  }

  const guides = {
    unlocks,
    unlocksAt(skill, level) {
      return unlocks(skill).filter((r) => r.level === level && !r.text).map((r) => {
        const verb = { woodcutting: 'chop', mining: 'mine', fishing: 'catch', cooking: 'cook', firemaking: 'burn', fletching: 'fletch', crafting: 'craft', smithing: r.sec === 'Smelting' ? 'smelt' : 'smith', thieving: 'steal from', arcana: r.spell ? 'cast' : r.sec === 'Sigils' ? 'inscribe' : 'wield', attack: 'wield', defence: 'wear', archery: 'use' }[skill] || 'use';
        return `You can now ${verb} ${r.name}.`;
      });
    },
    openSkill(skill) {
      U.windows.openWindow('guide', {
        title: `${SKILL_BY_ID[skill]?.name || skill} guide`, width: 520, height: 600, parchment: true, className: 'u-guide', anchor: 'game',
        render: (body) => renderSkill(body, skill),
      });
    },
    openJournal(id) {
      const q = QUEST_BY_ID[id];
      if (!q) return;
      U.windows.openWindow('journal', {
        title: q.name, width: 480, parchment: true, className: 'u-journal', anchor: 'game',
        render(body) {
          const st = questStatus(ctx, id);
          body.append(h('div.u-jmeta', { html: `<span>Difficulty: <b>${esc(q.difficulty)}</b></span><span>Quest points: <b>${q.questPoints}</b></span><span>Status: <b>${st === 'done' ? 'Completed' : st === 'in_progress' ? 'In progress' : 'Not started'}</b></span>` }));
          let lines = safe(() => ctx.quests.journal?.(id), null);
          if (typeof lines === 'string') lines = [{ text: lines, kind: 'summary' }];
          if (!Array.isArray(lines) || !lines.length) {
            const stage = ctx.state.save.quests?.[id];
            lines = [{ text: q.summary, kind: 'summary' }];
            if (stage == null) lines.push({ text: `Talk to ${NPCS[q.giver]?.name || q.giver} to begin.`, kind: 'step', current: true });
            else q.steps.forEach((s, i) => { if (stage === 'done' || i <= stage) lines.push({ text: s, kind: 'step', done: stage === 'done' || i < stage, current: i === stage }); });
            if (stage === 'done') lines.push({ text: 'QUEST COMPLETE!', kind: 'complete' });
          }
          const ul = h('ul.u-jl');
          for (const l of lines) {
            const o = typeof l === 'string' ? { text: l, kind: 'step' } : l;
            ul.append(h('li', { class: [o.kind || 'step', o.done ? 'done' : '', o.current ? 'current' : ''].join(' ').trim(), text: o.text }));
          }
          body.append(ul);
          const foot = h('div.u-jfoot');
          if (st === 'in_progress' && typeof ctx.quests?.track === 'function') foot.append(h('button.u-btn', { text: 'Track this quest', onclick: () => { ctx.quests.track(id); U.ui.toast(`Tracking: ${q.name}`); } }));
          if (foot.children.length) body.append(foot);
        },
      });
    },
  };
  events.on('quest:update', ({ id }) => { if (U.windows.isOpen('journal') && U.windows.get('journal').titleEl.textContent === QUEST_BY_ID[id]?.name) guides.openJournal(id); });
  return guides;
}
