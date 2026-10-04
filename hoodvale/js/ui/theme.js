// Core stylesheet for the HUD frame and shared UI pieces (frame, inset, buttons, tooltips,
// context menu, windows). Feature modules inject their own smaller stylesheets.
// Owner: ui builder. Art direction: carved dark wood + brass + parchment (DESIGN.md §11).

export const THEME_CSS = `
.u-hidden { display: none !important; }
#ui { font-family: var(--font-body); }
#ui img { -webkit-user-drag: none; user-select: none; }

/* ---------- carved-wood frame with brass rivets ---------- */
.u-frame {
  background:
    radial-gradient(circle at 7px 7px, #f6dc8e 0 1.4px, #6b5320 2.1px, transparent 2.9px),
    radial-gradient(circle at calc(100% - 7px) 7px, #f6dc8e 0 1.4px, #6b5320 2.1px, transparent 2.9px),
    radial-gradient(circle at 7px calc(100% - 7px), #f6dc8e 0 1.4px, #6b5320 2.1px, transparent 2.9px),
    radial-gradient(circle at calc(100% - 7px) calc(100% - 7px), #f6dc8e 0 1.4px, #6b5320 2.1px, transparent 2.9px),
    repeating-linear-gradient(92deg, rgba(0,0,0,0) 0 9px, rgba(0,0,0,.10) 9px 10px, rgba(255,214,150,.03) 10px 17px, rgba(0,0,0,0) 17px 23px),
    linear-gradient(180deg, #36291d 0%, #261b13 55%, #1b130d 100%);
  border-radius: 9px;
  box-shadow: 0 0 0 1px #050302, inset 0 0 0 1px rgba(214,174,86,.62), inset 0 0 0 3px #150e09, inset 0 0 0 4px rgba(201,162,74,.2), inset 0 12px 20px rgba(255,220,160,.035), 0 10px 26px rgba(0,0,0,.55);
  color: var(--parch);
}
.u-inset {
  background: linear-gradient(180deg, rgba(0,0,0,.36), rgba(0,0,0,.22));
  border-radius: 5px;
  box-shadow: inset 0 1px 4px rgba(0,0,0,.7), inset 0 0 0 1px rgba(0,0,0,.5), 0 1px 0 rgba(255,220,160,.07);
}
.u-parch {
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(255,250,235,.55), rgba(255,250,235,0) 60%),
    radial-gradient(90% 90% at 100% 100%, rgba(120,80,30,.22), rgba(120,80,30,0) 55%),
    radial-gradient(80% 90% at 0% 100%, rgba(120,80,30,.18), rgba(120,80,30,0) 50%),
    linear-gradient(180deg, #efe3c3, #e3d2a8);
  color: var(--ink);
  border-radius: 6px;
  box-shadow: 0 0 0 1px #3a2a14, inset 0 0 0 2px rgba(122,84,34,.35), inset 0 0 30px rgba(122,84,34,.28), 0 10px 26px rgba(0,0,0,.55);
}
.u-brass-line { height: 1px; background: linear-gradient(90deg, transparent, rgba(201,162,74,.7), transparent); margin: 6px 0; border: 0; }
.u-title { font-family: var(--font-display); color: var(--brass); letter-spacing: .04em; text-shadow: 0 1px 0 #000, 0 0 12px rgba(201,162,74,.25); }
.u-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.u-shadow { text-shadow: 1px 1px 0 #000, -1px 0 0 rgba(0,0,0,.6), 0 0 4px rgba(0,0,0,.8); }
.u-dim { color: var(--parch-dim); }
.u-small { font-size: var(--fs-xs); }

/* Buttons (extend the kit's .hv-btn) */
.u-btn { font: 600 13px/1 var(--font-body); color: var(--parch); background: linear-gradient(180deg, #4d3a27, #2c2117); border: 1px solid #000; border-radius: 5px; padding: 7px 12px; cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.09), inset 0 0 0 1px rgba(201,162,74,.32); transition: filter .12s, transform .06s; }
.u-btn:hover { filter: brightness(1.18); color: #fff; }
.u-btn:active { transform: translateY(1px); }
.u-btn[disabled] { opacity: .45; cursor: default; filter: none; }
.u-btn.on, .u-btn.primary { background: linear-gradient(180deg, #7a5d22, #4a3812); color: #fff3cf; box-shadow: inset 0 0 0 1px var(--brass), inset 0 1px 0 rgba(255,255,255,.18); }
.u-btn.red { background: linear-gradient(180deg, #7a2a1e, #4a140e); box-shadow: inset 0 0 0 1px rgba(255,140,120,.4); }
.u-btn.chain { background: linear-gradient(180deg, #1f5a48, #123a2e); box-shadow: inset 0 0 0 1px var(--chain); }
.u-btn.sm { padding: 5px 8px; font-size: 12px; }
.u-x { position: absolute; top: 7px; right: 8px; width: 26px; height: 26px; border-radius: 50%; border: 1px solid #000; cursor: pointer; padding: 0;
  display: grid; place-items: center; color: #3a1a08;
  background: radial-gradient(circle at 35% 30%, #ffe9a8, #c9a24a 55%, #6b5320); box-shadow: 0 1px 2px rgba(0,0,0,.6), inset 0 -1px 2px rgba(0,0,0,.3); }
.u-x:hover { filter: brightness(1.15); }
.u-x svg { width: 14px; height: 14px; }

/* ---------- tooltip ---------- */
.u-tip { position: absolute; z-index: 5; max-width: 260px; padding: 7px 9px; pointer-events: none; font: 13px/1.35 var(--font-body);
  background: linear-gradient(180deg, #2c2016, #1a120c); color: var(--parch); border-radius: 6px;
  box-shadow: 0 0 0 1px #000, inset 0 0 0 1px rgba(201,162,74,.5), 0 6px 16px rgba(0,0,0,.6); opacity: 0; transition: opacity .1s; }
.u-tip.on { opacity: 1; }
.u-tip b { color: #ffe7a8; }
.u-tip .bar { height: 6px; border-radius: 3px; background: #000; margin-top: 5px; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(201,162,74,.35); }
.u-tip .bar > i { display: block; height: 100%; background: linear-gradient(90deg, #3f7f3a, #8fd35a); }

/* ---------- context menu ---------- */
.u-menu-catch { position: absolute; inset: 0; pointer-events: auto; }
.u-menu { position: absolute; min-width: 168px; max-width: min(360px, calc(100vw - 12px)); padding: 3px; pointer-events: auto;
  background: linear-gradient(180deg, #2e2219, #1c140e); border-radius: 6px; font: 600 14px/1.15 var(--font-body);
  box-shadow: 0 0 0 1px #000, inset 0 0 0 1px rgba(201,162,74,.55), 0 10px 24px rgba(0,0,0,.6); animation: u-pop .09s var(--ease); }
.u-menu .mt { font: 700 11px/1 var(--font-display); color: var(--brass); letter-spacing: .08em; padding: 6px 8px 6px; border-bottom: 1px solid rgba(201,162,74,.35); margin-bottom: 2px; }
.u-menu button { display: block; width: 100%; text-align: left; padding: 6px 8px; background: none; border: 0; border-radius: 3px; color: #fff; font: inherit; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.u-menu button:hover, .u-menu button.sel { background: linear-gradient(90deg, rgba(201,162,74,.28), rgba(201,162,74,.06)); }
.u-menu button .o { color: #fff; }
.u-menu button.cancel .o { color: var(--parch-dim); }
[data-layout=phone] .u-menu button, .u-touch .u-menu button { padding: 10px 10px; font-size: 15px; }
@keyframes u-pop { from { transform: scale(.96); opacity: 0; } to { transform: none; opacity: 1; } }

/* ---------- windows ---------- */
.u-win { position: absolute; pointer-events: auto; display: flex; flex-direction: column; max-width: calc(100vw - 12px); max-height: calc(100vh - 12px);
  animation: u-winin .14s var(--ease); }
.u-win > .u-win-h { position: relative; display: flex; align-items: center; gap: 8px; padding: 10px 44px 8px 14px; cursor: default; touch-action: none; }
.u-win > .u-win-h .u-title { font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.u-win > .u-win-h img { width: 26px; height: 26px; }
.u-win > .u-win-b { position: relative; padding: 0 12px 12px; overflow: auto; min-height: 0; flex: 1; scrollbar-width: thin; scrollbar-color: var(--brass-dim) transparent; }
.u-win.drag > .u-win-h { cursor: move; }
@keyframes u-winin { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }
[data-layout=phone] .u-win.sheet { left: 0 !important; right: 0; bottom: 0; top: auto !important; width: auto !important; max-width: none; max-height: 84vh; border-radius: 12px 12px 0 0; animation: u-sheet .18s var(--ease); }
@keyframes u-sheet { from { transform: translateY(30px); opacity: .4; } to { transform: none; opacity: 1; } }

/* ---------- item slots ---------- */
.u-slot { position: relative; display: grid; place-items: center; border-radius: 4px; touch-action: none; }
.u-slot img { width: 36px; height: 36px; pointer-events: none; image-rendering: auto; filter: drop-shadow(0 0 0 transparent); }
.u-slot .q { position: absolute; left: 2px; top: 0; font: 600 11px/1.15 var(--font-mono); color: #ffff00; text-shadow: 1px 1px 0 #000, -1px 0 0 #000, 0 -1px 0 #000; pointer-events: none; }
.u-slot .q.k { color: #fff; } .u-slot .q.m { color: #00ff80; }
.u-slot.sel { box-shadow: inset 0 0 0 2px #fff, 0 0 8px rgba(255,255,255,.4); background: rgba(255,255,255,.08); }
.u-slot.empty img { opacity: .2; filter: grayscale(1) brightness(1.6); }

/* scrollbars */
#ui ::-webkit-scrollbar { width: 8px; height: 8px; }
#ui ::-webkit-scrollbar-thumb { background: linear-gradient(90deg, #6b5320, #c9a24a, #6b5320); border-radius: 4px; border: 1px solid #000; }
#ui ::-webkit-scrollbar-track { background: rgba(0,0,0,.3); border-radius: 4px; }

/* inputs */
#ui input[type=text], #ui input[type=number], #ui input[type=search] { font: 14px var(--font-body); color: var(--parch); background: rgba(0,0,0,.45); border: 1px solid #000; border-radius: 4px; padding: 6px 8px; box-shadow: inset 0 0 0 1px rgba(201,162,74,.3); outline: none; }
#ui input[type=text]:focus, #ui input[type=number]:focus, #ui input[type=search]:focus { box-shadow: inset 0 0 0 1px var(--brass), 0 0 6px rgba(201,162,74,.4); }
#ui input[type=range] { accent-color: var(--brass); }
`;
