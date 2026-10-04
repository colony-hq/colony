// Hoodvale UI: login + creator, HUD frame (minimap, orbs, hover text, XP drops), chatbox, side
// panel tabs, context menus, windows (dialogue, bank, shop, make-X, world map, guides, journal,
// death) and the world overlay (hitsplats, health bars, overhead chat). Owner: ui builder.
//
// ctx.ui (DESIGN.md §8, plus additions):
//   message(text, kind), dialogue({speaker, text, options}) -> Promise<index|null|-1 dismissed>,
//   closeDialogue(), openBank(), openShop(shopId), openMake({title, skill, items}) ->
//   Promise<{id, qty}|null> (qty Infinity = All), openWindow(id, {title, render(el, win), width,
//   height, icon, parchment, onClose, anchor, closeOnMove}) -> win, closeWindow(id), isOpen(id),
//   registerTab({id, title, icon, order, hotkey, render(el), onShow(el), onHide(el)}), selectTab(id),
//   toast(text, {kind, icon, ms}), update(dt),
//   openWorldMap(), openSkillGuide(skill), openJournal(questId), openWallet(), logout(),
//   prompt({title, label, value, type}) -> Promise, confirm({title, text}) -> Promise<bool>,
//   registerCommand(name, fn(args), help), hitsplat(entity, amount, type), say(entity, text, {secs}),
//   setSpellTarget(spellId|null), icons { itemIcon(id), skillIcon(id), spellIcon(spell) } (data URLs).
// Events out: ui:ready, ui:tab {id}, ui:window {id, open}, ui:fanfare {skill, level, unlocks},
//   ui:dialogue, ui:spell-target {id}, chat:self {text}, combat:style {style}, magic:autocast {id},
//   zone:enter {zone, name} (only while no other module emits it).

import { injectStyle, h } from '../core/dom.js';
import { THEME_CSS } from './theme.js';
import { itemIcon, skillIcon, spellIcon } from './icons.js';
import { createTooltip, createMenu, createWindows, promptValue, confirmBox } from './widgets.js';
import { createHud } from './hud.js';
import { createSide } from './panels/side.js';
import { createInventoryPanel } from './panels/inventory.js';
import { createEquipmentPanel } from './panels/equipment.js';
import { createSkillsPanel } from './panels/skills.js';
import { createQuestsPanel, createQuestTracker } from './panels/quests.js';
import { createCombatPanel } from './panels/combat.js';
import { createSpellbookPanel } from './panels/spellbook.js';
import { createSettingsPanel } from './panels/settings.js';
import { createChat } from './chat.js';
import { createMinimap } from './minimap.js';
import { createWorld } from './world.js';
import { createOverlay } from './overlay.js';
import { createFeedback } from './feedback.js';
import { createDialogueBox } from './windows/dialogue.js';
import { setPortraitRenderer } from './portrait.js';
import { createBankWindow } from './windows/bank.js';
import { createShopWindow } from './windows/shop.js';
import { createMakeWindow } from './windows/make.js';
import { createWorldMap } from './windows/worldmap.js';
import { createDeathScreen } from './windows/death.js';
import { createGuides } from './windows/guide.js';
import { createLogin } from './login.js';
import { esc, formatCredit, safe, timeAgo } from './util.js';

const KEY_TABS = { KeyC: 'combat', KeyK: 'skills', KeyQ: 'quests', KeyI: 'inventory', KeyE: 'equipment', KeyB: 'spellbook', KeyO: 'settings', KeyL: 'wallet', KeyP: 'players', F1: 'combat', F2: 'skills', F3: 'quests', F4: 'inventory' };

export function createUI(ctx) {
  const { events, input, state } = ctx;
  injectStyle('ui-theme', THEME_CSS);
  // Chat heads from the real 3D characters when the actors module is up.
  if (ctx.actors?.portrait) {
    const render = (look, size) => ctx.actors.portrait(look, size);
    setPortraitRenderer(render);
    // A generated model finished loading: drop portraits painted with the stand-in body.
    ctx.actors.onModel?.(() => setPortraitRenderer(render));
  }
  const roots = {};
  for (const id of ['overlay', 'hud', 'windows', 'menus', 'toasts']) {
    roots[id] = document.getElementById(id) || document.body.appendChild(h('div#' + id));
    roots[id].replaceChildren();
    roots[id].style.isolation = 'isolate'; // keep window z-indexes inside their layer (toasts stay on top)
  }
  const U = { ctx, events, input, state, roots, layout: 'desk', invMode: null, icons: { itemIcon, skillIcon, spellIcon } };
  const ui = {};
  U.ui = ui;

  // ---- building blocks ----
  U.tip = createTooltip(U);
  U.menu = createMenu(U);
  U.windows = createWindows(U);
  U.hud = createHud(U);
  U.side = createSide(U);
  U.inventory = createInventoryPanel(U);
  U.chat = createChat(U);
  U.minimap = createMinimap(U);
  U.overlay = createOverlay(U);
  U.world = createWorld(U);
  U.guide = createGuides(U);
  U.feedback = createFeedback(U);
  U.dialogue = createDialogueBox(U);
  U.bankW = createBankWindow(U);
  U.shopW = createShopWindow(U);
  U.make = createMakeWindow(U);
  U.worldmap = createWorldMap(U);
  U.death = createDeathScreen(U);
  U.tracker = createQuestTracker(U);
  const panels = {
    combat: createCombatPanel(U), skills: createSkillsPanel(U), quests: createQuestsPanel(U),
    equipment: createEquipmentPanel(U), spellbook: createSpellbookPanel(U), settings: createSettingsPanel(U),
  };
  U.settings = panels.settings;
  for (const p of [panels.combat, panels.skills, panels.quests, U.inventory, panels.equipment, panels.spellbook, panels.settings]) U.side.register(p.tab);

  // Close interfaces that should not survive walking away (bank, shop, make-X, menus).
  U.closeTransient = ({ except = null, dialogue = true } = {}) => {
    U.menu.close();
    U.tip.hide();
    U.windows.closeAll((w) => w.opts.closeOnMove && w.id !== except);
    if (dialogue && U.dialogue.open) U.dialogue.closeDialogue();
  };

  // ---- public API ----
  Object.assign(ui, {
    message(text, kind = 'game') { return U.chat.message(String(text ?? ''), kind); },
    dialogue(opts = {}) { return U.dialogue.dialogue(opts); },
    closeDialogue() { U.dialogue.closeDialogue(); },
    openBank() { U.bankW.open(); },
    openShop(shopId) { U.shopW.open(shopId); },
    openMake(opts) { return U.make.openMake(opts); },
    openWindow(id, opts) {
      if (!opts || typeof opts.render !== 'function') {
        if (id === 'wallet') { ui.openWallet(); return U.windows.get('wallet-lite'); }
        if (id === 'worldmap' || id === 'map') { ui.openWorldMap(); return U.windows.get('worldmap'); }
      }
      if (U.layout === 'phone') { U.side.closeSheet(); U.chat.closeSheet(); }
      return U.windows.openWindow(id, { anchor: 'game', ...(opts || {}) });
    },
    closeWindow(id) { return U.windows.closeWindow(id); },
    isOpen(id) { return U.windows.isOpen(id); },
    registerTab(spec) { return U.side.register(spec); },
    selectTab(id) { return U.side.select(id); },
    toast(text, opts = {}) { return U.feedback.toast(text, opts); },
    openWorldMap() { U.worldmap.open(); },
    openSkillGuide(skill) { U.guide.openSkill(skill); },
    openJournal(id) { U.guide.openJournal(id); },
    openWallet() {
      if (U.side.has('wallet')) { U.side.select('wallet'); return; }
      U.windows.openWindow('wallet-lite', {
        title: 'Hood Wallet', width: 380, anchor: 'game',
        render(body) {
          const w = ctx.wallet;
          const hist = safe(() => w.history(), []) || [];
          body.append(
            h('div', { style: { font: '600 12px var(--font-mono)', color: 'var(--parch-dim)', overflowWrap: 'anywhere' }, text: safe(() => ctx.chain.address, '') }),
            h('div', { style: { font: '700 26px var(--font-mono)', color: 'var(--chain)', margin: '6px 0 2px' }, text: `${formatCredit(safe(() => w.balance, 0))} CREDIT` }),
            h('div', { style: { font: '12px var(--font-body)', color: 'var(--parch-dim)', marginBottom: '8px' }, text: 'Robinhood Chain (simulated) — no real value.' }),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '260px', overflow: 'auto' } }, hist.slice(0, 30).map((t) => h('div', {
              style: { display: 'flex', gap: '8px', font: '13px var(--font-body)', padding: '3px 0', borderBottom: '1px solid rgba(201,162,74,.12)' },
              html: `<span style="font-family:var(--font-mono);color:${t.delta >= 0 ? '#8fe38f' : '#ff8a7a'};min-width:70px">${t.delta >= 0 ? '+' : '−'}${formatCredit(Math.abs(t.delta))}</span><span style="flex:1">${esc(t.reason || '')}</span><span class="u-dim u-small">${timeAgo(t.at || Date.now())}</span>`,
            }))),
          );
        },
      });
    },
    logout() {
      state.flush?.(true);
      U.closeTransient();
      U.windows.closeAll();
      U.world.clearTargeting();
      U.side.closeSheet(); U.chat.closeSheet();
      state.setMode('login');
    },
    prompt(opts) { return promptValue(U, opts); },
    confirm(opts) { return confirmBox(U, opts); },
    registerCommand(name, fn, help) { U.chat.registerCommand(name, fn, help); },
    hitsplat(entity, amount, type) { U.overlay.hitsplat(entity, amount, type); },
    say(entity, text, opts) { U.overlay.say(entity, text, opts); },
    setSpellTarget(id) { U.world.setSpell(id); },
    icons: U.icons,
    update,
    _U: U, // internal handle for tests / debugging
  });

  // Login screen needs ui API ready.
  U.login = (() => { try { return createLogin(U); } catch (err) { console.error('[ui] login failed', err); return null; } })();

  // ---- layout ----
  function applyLayout() {
    const W = window.innerWidth, H = window.innerHeight;
    const phone = W < 700 || H < 520;
    const next = phone ? 'phone' : 'desk';
    const changed = next !== U.layout;
    U.layout = next;
    document.body.dataset.layout = next;
    if (changed || !applyLayout.done) { U.side.applyLayout(); U.chat.applyLayout(); }
    applyLayout.done = true;
    U.windows.relayout();
  }
  window.addEventListener('resize', () => requestAnimationFrame(applyLayout));
  applyLayout();
  const setTouch = (on) => document.body.classList.toggle('u-touch', on);
  setTouch(!!ctx.engine?.isTouch);
  window.addEventListener('pointerdown', (e) => setTouch(e.pointerType === 'touch'), { capture: true, passive: true });

  // No browser context menu over the HUD (inputs keep theirs for paste).
  for (const r of Object.values(roots)) r.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea')) e.preventDefault(); });

  // ---- modes ----
  function onMode(mode) {
    const playing = mode === 'play' || mode === 'dead' || mode === 'cutscene';
    U.hud.show(playing);
    if (!playing) { U.closeTransient(); U.world.clearTargeting(); }
  }
  events.on('mode:change', ({ mode }) => onMode(mode));
  events.on('game:start', () => {
    U.inventory.refresh();
    if (!U.side.current) U.side.select('inventory', { silent: true });
  });
  onMode(state.mode);
  if (state.mode === 'login') U.login?.show();

  // ---- keyboard ----
  window.addEventListener('keydown', (e) => {
    if (state.mode !== 'play') return;
    if (/^F[1-4]$/.test(e.code)) e.preventDefault();
  }, { capture: true });
  input.on('key', (k) => {
    if (!k.down) return;
    const code = k.code;
    if (state.mode === 'login') return;
    if (U.menu.isOpen && U.menu.key(code)) return;
    if (code === 'Escape') { escape(); return; }
    if (U.dialogue.waiting && U.dialogue.key(code)) return;
    if (U.make.open && U.make.key(code)) return;
    if (state.mode !== 'play' && state.mode !== 'dead') return;
    if (k.repeat) return;
    if (code === 'Enter' || code === 'NumpadEnter') { U.chat.focus(); return; }
    if (code === 'Tab') { U.side.cycle(k.shift ? -1 : 1); return; }
    if (code === 'KeyM') { ui.openWorldMap(); return; }
    if (code === 'KeyR' && !k.ctrl) { ctx.player?.toggleRun?.(); return; }
    if (code === 'KeyN' && !k.ctrl) { U.hud.faceNorth(); return; }
    const tab = KEY_TABS[code];
    if (tab && !k.ctrl && U.side.has(tab)) U.side.select(tab, { toggle: U.layout === 'phone' });
  });
  function escape() {
    if (U.menu.isOpen) { U.menu.close(); return; }
    if (U.world.targeting) { U.world.clearTargeting(); return; }
    if (U.dialogue.open) { U.dialogue.closeDialogue(); return; }
    if (U.windows.closeTop()) return;
    if (U.layout === 'phone') { if (U.side.sheetOpen) U.side.closeSheet(); else U.chat.closeSheet(); }
  }

  // ---- per-frame ----
  const broken = new Set();
  const parts = [['hud', U.hud], ['world', U.world], ['minimap', U.minimap], ['overlay', U.overlay], ['feedback', U.feedback], ['tracker', U.tracker], ['login', U.login]];
  function update(dt) {
    for (const [name, m] of parts) {
      if (!m?.update || broken.has(name)) continue;
      try { m.update(dt); }
      catch (err) { broken.add(name); console.error(`[ui] ${name}.update failed; disabled`, err); }
    }
  }

  events.emit('ui:ready', { ui });
  return ui;
}

