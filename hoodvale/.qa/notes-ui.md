# UI builder notes (js/ui/*)

## Files
| File | What |
|---|---|
| `ui.js` | `createUI(ctx)` orchestrator, `ctx.ui` API, keyboard, layout switch (desk / phone), per-frame update |
| `theme.js` | Core CSS: carved-wood frame (`.u-frame`), inset, parchment (`.u-parch`), buttons (`.u-btn`), menu, windows, slots |
| `icons.js` | Procedural icons: `itemIcon(id)`, `skillIcon(id)`, `spellIcon(spell)` (data URLs, cached), `mapIconCanvas(kind)`, `tabSvg(name)`, `iconHTML(spec)` |
| `portrait.js` | Chat-head portraits from an actor look (`portraitURL(look, kind)`) |
| `widgets.js` | Tooltip, "Choose Option" context menu, window manager, number prompt, confirm |
| `hud.js` | Hover text, minimap cluster, orbs (HP / run / CREDIT), compass, region plate |
| `minimap.js` | Rotating minimap (paints `world/mapimage.js`), dots, POI icons, walk flag, click-to-walk |
| `world.js` | Hover text, left-click default, right-click / long-press menu, use-item-on and cast-on targeting, click crosses |
| `overlay.js` | Hitsplats, health bars, overhead chat (`npc:say`, `chat:public`, own chat), remote nameplates |
| `feedback.js` | XP drops, level-up popup (+ `ui:fanfare`), area banner (`zone:enter`), toasts |
| `chat.js` | Chatbox (All / Game / Public / Oracle / Chain), filters, input + `::commands` |
| `login.js` | Title screen, "Continue as", character creator with live 3D preview |
| `panels/*.js` | side (tab registry/layout), combat, skills, quests (+ HUD quest tracker), inventory, equipment, spellbook, settings |
| `windows/*.js` | dialogue, bank, shop, make-X, world map, guide (skill guides + quest journal), death |

## ctx.ui API (DESIGN §8 + additions)
- `message(text, kind)`, `toast(text, {kind: ''|'chain'|'warn'|'quest', icon, ms})`
- `dialogue({speaker: {name, kind: 'npc'|'player'|'oracle'|'narration', npcId?, look?, role?}, text, options?})`
  → `Promise<index|null>`; resolves **-1 when dismissed** (Esc, closeDialogue(), walking/clicking away).
  Keys 1–6 pick options, Space/Enter/click continue. Emits `dialogue:dismiss` when the player dismisses.
- `closeDialogue()`, `openBank()`, `openShop(shopId)`
- `openMake({title, skill, items: [{id, label, disabled, reason, max}]})` → `Promise<{id, qty}|null>`;
  **qty is `Infinity` for "All"**.
- `openWindow(id, {title, render(body, win), width, height, icon, parchment, onClose, anchor, closeOnMove})`
  → `win` `{el, body, setTitle, close}`; `render` is called synchronously. `closeWindow(id)`, `isOpen(id)`.
  `openWindow('wallet')` with no options opens the wallet tab (or a light wallet window).
- `registerTab({id, title, icon, order, hotkey, render(el), onShow(el), onHide(el)})` — `render` runs once on
  first show, `onShow` every time. `icon`: built-in name (`wallet`, `players`, `chain`, `exchange`, `map`,
  `chat`, `oracle`, `emote`, `music`…), raw `<svg>`, an image URL, or 1–2 letters. `selectTab(id)`.
- `openWorldMap()`, `openSkillGuide(skill)`, `openJournal(questId)`, `openWallet()`, `logout()`
- `prompt({title, label, value, type: 'number'|'text', max})` → `Promise<value|null>`, `confirm({title, text})`
- `registerCommand(name, fn(args, line), help)` — chat `::name`
- `hitsplat(entity, amount, type)`, `say(entity, text, {secs})` (overhead line), `setSpellTarget(id|null)`
- `icons.itemIcon(id) / skillIcon(id) / spellIcon(spell)` → data URLs (net already uses `icons.js`)

## Events
Out: `ui:ready {ui}`, `ui:tab {id}`, `ui:window {id, open}`, `ui:sheet {open}` (phone), `ui:fanfare
{skill, level, unlocks}` (audio: level-up jingle hook), `ui:dialogue`, `ui:dialogue-close`, `ui:spell-target {id}`,
`chat:self {text}` (local player said something), `combat:style` / `magic:autocast` only when the game
module is missing, `dialogue:dismiss`, `zone:enter` only when `ctx.lore` is absent.
In: `chat:game`, `chat:public {from, text, peer, self?}` (`self: true` is ignored — the UI already shows your
own line), `npc:say`, `combat:hit`, `xp`, `level:up`, `zone:enter`, `item:select`, `player:death`,
`player:respawn`, `wallet:change` (Chain tab line), `oracle:answer` (Oracle tab), `quest:*`, `shop:change`,
`bank:change`, `inventory:change`, `equipment:change`.

## What the UI relies on
- game: `ctx.game.itemOptions/useInventory/useItemOn/clearSelection/selected/equipmentOptions/useEquipment`,
  `picking.pick`, `actions.perform`, `player.walkTo/toggleRun/pos/yaw`, `combat.style/setStyle/autoRetaliate/
  setAutoRetaliate/respawn`, `magic.cast/reason/canCast/autocast/setAutocast`, `bank.deposit/withdraw/depositAll/
  depositEquipment`, monster `hp/maxHp/combatUntil`.
- content: `ctx.quests.list/journal/points/status/canStart/tracked/track`, `ctx.shops.info/stock/priceBuy/
  priceSell/canSell/buy/sell/lastError`, `zone:enter {zone, name, blurb, levels, first, minor}`.
- net: wallet + players tabs via `registerTab` (on `game:ready`), `room.say(text)`.
- world: `mapimage.paintRegion(regionId, 3)` for minimap + world map (cached once per region).

## Keyboard
Esc closes (menu → targeting → dialogue → top window → phone sheet). Enter = chat. Tab / Shift+Tab cycle
side tabs. F1–F4 = combat / skills / quests / inventory. Letters: C combat, K skills, Q quests, I inventory,
E equipment, B spellbook, O settings, L wallet, P players, M world map, R run toggle, N face north.
Dialogue: Space/Enter continue, 1–6 options. Make-X: Space = first item, 1–9 pick. Arrows/WASD stay camera.

## Requests
- **net**: `room.say(text)` should return truthy when sent. If the room echoes the local player's own line
  back as `chat:public`, please set `self: true` on it (the UI already prints/overheads it locally).
- **world**: `paintRegion` is called once per region (cached), at 3 px/tile; the world map overlays zone
  names, roads (from `ROADS`), building names and icons itself, so the painting can stay label-free.
- **audio**: hook `ui:fanfare` (or `level:up`) for the jingle; UI also emits `ui:window` / `ui:tab` if you
  want subtle open/close clicks.
- **integration (data)**: the plain bows are named `shortbow` / `longbow` (lower case) in `items.js`
  (`${pre}shortbow` with an empty prefix) — consider `Shortbow` / `Longbow`.
- **game**: the death chat line "Oh dear, you are dead!" is RuneScape's exact wording; DESIGN asks for original
  wording (the UI's death screen says "You have fallen").
- **content**: `zone:enter` fires twice for the spawn zone at game start (save:loaded + game:start teleports);
  the UI dedupes banners, but audio/quests may not.
- **game**: click crosses are drawn at the screen click position (RS style) from the UI's own click handler;
  `player:click` is not used (minimap walks show the red flag on the minimap instead).
