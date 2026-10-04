// Dialogue UI stylesheet (injected once by dialogue.js). Uses the index.html tokens.

export const DIALOGUE_CSS = /* css */ `
#dialogue .dlg { position: absolute; inset: 0; z-index: 6; pointer-events: none; visibility: hidden; opacity: 0;
  transition: opacity .32s var(--ease), visibility 0s linear .32s; --bar: min(11vh, 110px); }
#dialogue .dlg.on { visibility: visible; opacity: 1; transition: opacity .32s var(--ease); }
#dialogue .dlg-bar { position: absolute; left: 0; right: 0; height: var(--bar); background: #04060b;
  transform: scaleY(0); transition: transform .55s var(--ease); }
#dialogue .dlg-bar.top { top: 0; transform-origin: top; }
#dialogue .dlg-bar.bot { bottom: 0; transform-origin: bottom; }
#dialogue .dlg.on .dlg-bar { transform: scaleY(1); }
#dialogue .dlg-shade { position: absolute; left: 0; right: 0; bottom: 0; height: 62%;
  background: linear-gradient(to top, rgba(4,6,11,.88) 0%, rgba(4,6,11,.55) 38%, rgba(4,6,11,0) 100%); }

/* ---------- Panel ---------- */
#dialogue .dlg-panel { position: absolute; left: 50%; bottom: calc(var(--bar) * .42 + env(safe-area-inset-bottom, 0px));
  width: min(900px, calc(100% - 32px)); max-height: calc(100% - var(--bar) * 1.6 - 28px);
  display: flex; flex-direction: column; pointer-events: auto; box-sizing: border-box;
  transform: translate(-50%, 26px); opacity: 0; transition: transform .5s var(--ease), opacity .4s var(--ease), box-shadow .6s var(--ease), border-color .6s var(--ease);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(255,181,71,.07), rgba(255,181,71,0) 46%),
    linear-gradient(180deg, rgba(22,28,47,.94), rgba(10,13,24,.96));
  border: 1px solid rgba(138,90,52,.62); border-radius: 14px;
  box-shadow: 0 24px 70px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,214,150,.05);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: var(--paper); }
#dialogue .dlg.on .dlg-panel { transform: translate(-50%, 0); opacity: 1; }
#dialogue .dlg-panel::before { content: ''; position: absolute; left: 18px; right: 18px; top: -1px; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,181,71,.75), transparent); }
#dialogue .dlg-panel::after { content: ''; position: absolute; inset: 6px; border-radius: 10px; pointer-events: none;
  border: 1px dashed rgba(138,90,52,.18); }
#dialogue .dlg-panel[data-tier="terang"] { border-color: rgba(255,206,130,.7);
  box-shadow: 0 24px 70px rgba(0,0,0,.6), 0 0 60px rgba(255,184,90,.16), inset 0 0 0 1px rgba(255,214,150,.08); }
#dialogue .dlg-panel[data-tier="redup"] { border-color: rgba(140,143,163,.45); }

/* Name plate + purse */
#dialogue .dlg-head { position: relative; height: 0; }
#dialogue .dlg-plate { position: absolute; left: 20px; top: -21px; display: flex; align-items: baseline; gap: 12px;
  padding: 7px 16px 8px 14px; border-radius: 8px; white-space: nowrap; z-index: 2;
  background: linear-gradient(180deg, #2c1f15, #1a120c); border: 1px solid rgba(255,181,71,.38);
  box-shadow: 0 8px 22px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,220,170,.08); }
#dialogue .dlg-plate::before { content: ''; width: 7px; height: 7px; transform: rotate(45deg) translateY(-2px);
  background: var(--lentera); box-shadow: 0 0 10px rgba(255,181,71,.8); align-self: center; }
#dialogue .dlg-name { font-family: var(--font-display); font-size: clamp(19px, 1.45rem, 24px); line-height: 1; color: var(--paper); letter-spacing: .01em; }
#dialogue .dlg-role { font-size: 11px; letter-spacing: .2em; text-transform: uppercase; color: rgba(255,181,71,.86); }
#dialogue .dlg-purse { position: absolute; right: 18px; top: -15px; z-index: 2; display: flex; align-items: center; gap: 7px;
  padding: 5px 11px 5px 9px; border-radius: 999px; background: rgba(9,12,22,.95); border: 1px solid rgba(143,227,208,.32);
  font-family: var(--font-mono); font-size: 12px; color: var(--kabut); white-space: nowrap; transition: border-color .3s, box-shadow .3s; }
#dialogue .dlg-purse i { width: 8px; height: 8px; border-radius: 50%; background: var(--kilau); box-shadow: 0 0 8px rgba(143,227,208,.8); }
#dialogue .dlg-purse b { color: var(--paper); font-weight: 500; letter-spacing: .02em; }
#dialogue .dlg-purse small { font-size: 9px; letter-spacing: .16em; text-transform: uppercase; opacity: .75; }
#dialogue .dlg-purse.spend { border-color: rgba(226,104,60,.7); box-shadow: 0 0 16px rgba(226,104,60,.25); }
#dialogue .dlg-purse.earn { border-color: rgba(143,227,208,.85); box-shadow: 0 0 16px rgba(143,227,208,.3); }
#dialogue .dlg-delta { position: absolute; right: 12px; top: -34px; font-family: var(--font-mono); font-size: 12px; pointer-events: none;
  opacity: 0; transform: translateY(6px); }
#dialogue .dlg-delta.go { animation: dlg-delta 1.6s var(--ease) forwards; }
#dialogue .dlg-delta.neg { color: #ff9a74; } #dialogue .dlg-delta.pos { color: var(--kilau); }
@keyframes dlg-delta { 0% { opacity: 0; transform: translateY(8px); } 15% { opacity: 1; transform: translateY(0); } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-10px); } }

/* ---------- Body ---------- */
#dialogue .dlg-body { position: relative; padding: 30px 30px 6px; min-height: 92px; flex: 0 0 auto; cursor: pointer; }
#dialogue .dlg-ask { font-size: var(--fs-s); color: var(--kabut); margin: 0 0 10px; display: none; align-items: baseline; gap: 8px; }
#dialogue .dlg-ask.on { display: flex; }
#dialogue .dlg-ask b { font-weight: 700; font-size: 10px; letter-spacing: .2em; text-transform: uppercase; color: rgba(167,174,196,.8); }
#dialogue .dlg-ask span { font-style: italic; }
#dialogue .dlg-say { position: relative; border-radius: 10px; transition: background .5s var(--ease), box-shadow .5s var(--ease), padding .3s var(--ease); }
#dialogue .dlg-text { margin: 0; font-size: var(--fs-l); line-height: 1.52; letter-spacing: .005em; color: var(--paper); text-wrap: pretty; }
#dialogue .dlg-text .h { visibility: hidden; }
#dialogue .dlg-text .w { display: inline; }
#dialogue .dlg-more { display: inline-block; width: 0; height: 0; margin-left: 8px; vertical-align: middle; opacity: 0;
  border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid var(--lentera); }
#dialogue .dlg-say.done .dlg-more { opacity: .9; animation: dlg-bob 1s ease-in-out infinite; }
@keyframes dlg-bob { 50% { transform: translateY(3px); } }

/* Tier styles */
#dialogue .dlg-say.t-redup .dlg-text { color: #b4aecb; font-style: italic; letter-spacing: .01em; }
#dialogue .dlg-say.t-redup .dlg-text .w { display: inline-block; animation: dlg-wobble 2.8s ease-in-out infinite; animation-delay: var(--d, 0s); }
@keyframes dlg-wobble { 0%, 100% { transform: translateY(0) rotate(0deg); } 30% { transform: translateY(var(--y, 1px)) rotate(var(--r, .6deg)); } 70% { transform: translateY(calc(var(--y, 1px) * -1)) rotate(calc(var(--r, .6deg) * -1)); } }
#dialogue .dlg-say.t-redup { filter: saturate(.8); }
#dialogue .dlg-say.t-sedang .dlg-text { color: #f2d9a2; }
#dialogue .dlg-say.t-sedang { padding-left: 14px; box-shadow: inset 2px 0 0 rgba(233,196,106,.55); }
#dialogue .dlg-say.t-terang { padding: 14px 18px 15px; color: #2a1a0e;
  background:
    radial-gradient(130% 120% at 50% 0%, rgba(255,250,232,1) 0%, rgba(246,233,202,1) 55%, rgba(232,213,170,1) 100%);
  box-shadow: 0 0 0 1px rgba(255,236,190,.9), 0 0 42px rgba(255,196,104,.42), 0 0 110px rgba(255,170,70,.16), inset 0 0 36px rgba(170,120,50,.2); }
#dialogue .dlg-say.t-terang .dlg-text { color: #2b1a0c; font-weight: 500; }
#dialogue .dlg-say.t-terang .dlg-more { border-top-color: #8a5a34; }
#dialogue .dlg-say.t-terang::before { content: ''; position: absolute; inset: 0; border-radius: 10px; pointer-events: none; opacity: .35;
  background-image: radial-gradient(circle at 12px 12px, rgba(138,90,52,.18) 2px, transparent 2.6px), radial-gradient(circle at 0 0, rgba(138,90,52,.1) 6px, transparent 6.5px);
  background-size: 24px 24px, 24px 24px; mask-image: linear-gradient(90deg, #000 0, transparent 14%, transparent 86%, #000 100%);
  -webkit-mask-image: linear-gradient(90deg, #000 0, transparent 14%, transparent 86%, #000 100%); }
#dialogue .dlg-say.reveal { animation: dlg-reveal .55s var(--ease); }
@keyframes dlg-reveal { from { opacity: 0; transform: translateY(6px); filter: blur(3px); } to { opacity: 1; transform: none; filter: none; } }

/* Receipt + stamp */
#dialogue .dlg-foot { display: flex; align-items: center; gap: 12px; min-height: 26px; margin-top: 10px; flex-wrap: wrap; }
#dialogue .dlg-receipt { font-family: var(--font-mono); font-size: 11.5px; color: rgba(167,174,196,.85); letter-spacing: .01em;
  opacity: 0; transform: translateY(4px); transition: opacity .4s var(--ease), transform .4s var(--ease); }
#dialogue .dlg-receipt.on { opacity: 1; transform: none; }
#dialogue .dlg-receipt .c { color: #ff9a74; } #dialogue .dlg-receipt .c.free, #dialogue .dlg-receipt .c.pos { color: var(--kilau); }
#dialogue .dlg-receipt .t-redup { color: var(--tier-redup); } #dialogue .dlg-receipt .t-sedang { color: var(--tier-sedang); } #dialogue .dlg-receipt .t-terang { color: var(--tier-terang); }
#dialogue .dlg-receipt .sim { padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(167,174,196,.3); font-size: 10px; letter-spacing: .08em; }
#dialogue .dlg-stamp { margin-left: auto; display: none; align-items: center; gap: 8px; padding: 4px 11px 4px 8px; border-radius: 6px;
  font-size: 12px; font-weight: 700; letter-spacing: .06em; color: var(--lentera); background: rgba(255,181,71,.1); border: 1px solid rgba(255,181,71,.5); }
#dialogue .dlg-stamp.on { display: inline-flex; animation: dlg-stamp .5s cubic-bezier(.2,1.6,.4,1); }
#dialogue .dlg-stamp i { width: 11px; height: 13px; border: 1.5px solid currentColor; border-radius: 2px 3px 3px 2px; position: relative; }
#dialogue .dlg-stamp i::after { content: ''; position: absolute; left: 3px; top: -1.5px; width: 3px; height: 7px; background: currentColor; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%); }
@keyframes dlg-stamp { 0% { opacity: 0; transform: scale(1.5) rotate(-8deg); } 60% { opacity: 1; transform: scale(.95) rotate(1deg); } 100% { transform: none; } }

/* Thinking */
#dialogue .dlg-think { display: none; align-items: center; gap: 18px; padding: 6px 0 4px; }
#dialogue .dlg-think.on { display: flex; }
#dialogue .dlg-think .tx { flex: 1; min-width: 0; }
#dialogue .dlg-think .l1 { font-size: var(--fs-l); color: var(--paper); }
#dialogue .dlg-think .l2 { font-family: var(--font-mono); font-size: 12px; color: var(--kabut); margin-top: 4px; }
#dialogue .dlg-think .l2 b { color: var(--paper); font-weight: 500; display: inline-block; min-width: 3ch; text-align: right; }
#dialogue .dlg-think .bar { height: 2px; margin-top: 10px; background: rgba(239,230,210,.1); border-radius: 2px; overflow: hidden; }
#dialogue .dlg-think .bar i { display: block; height: 100%; width: 100%; transform-origin: left; transform: scaleX(var(--p, 0)); background: var(--tc, var(--lentera)); }
#dialogue .dots i { display: inline-block; width: 4px; height: 4px; margin-left: 4px; border-radius: 50%; background: currentColor; animation: dlg-dot 1s infinite; vertical-align: middle; }
#dialogue .dots i:nth-child(2) { animation-delay: .15s; } #dialogue .dots i:nth-child(3) { animation-delay: .3s; }
@keyframes dlg-dot { 0%, 100% { opacity: .2; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }

/* Lamp icon (tier picker + thinking). --g = glow 0..1, --tc = tier colour */
#dialogue .lamp-ico { position: relative; width: 34px; height: 46px; flex: 0 0 auto; }
#dialogue .lamp-ico::before { content: ''; position: absolute; left: 50%; top: 52%; width: 96px; height: 96px; margin: -48px 0 0 -48px; border-radius: 50%;
  background: radial-gradient(circle, var(--tc) 0%, transparent 62%); opacity: calc(var(--g, .3) * .55); transform: scale(calc(.35 + var(--g, .3) * .8)); transition: opacity .3s, transform .3s; }
#dialogue .lamp-ico .cap { position: absolute; left: 9px; right: 9px; top: 2px; height: 6px; border-radius: 3px 3px 1px 1px; background: #6b4a2c; }
#dialogue .lamp-ico .glass { position: absolute; left: 6px; right: 6px; top: 8px; bottom: 6px; border-radius: 9px 9px 7px 7px;
  border: 1.5px solid rgba(214,170,110,.55); background: rgba(255,230,180,calc(var(--g, .3) * .12)); }
#dialogue .lamp-ico .fl { position: absolute; left: 50%; bottom: 10px; width: 10px; height: 17px; margin-left: -5px;
  border-radius: 50% 50% 45% 45% / 62% 62% 38% 38%; background: radial-gradient(circle at 50% 72%, #fff 0%, var(--tc) 55%, transparent 76%);
  transform: scale(calc(.55 + var(--g, .3) * .6)); transform-origin: 50% 90%; opacity: calc(.45 + var(--g, .3) * .55);
  filter: drop-shadow(0 0 calc(2px + var(--g, .3) * 10px) var(--tc)); animation: dlg-flick 1.4s ease-in-out infinite; }
#dialogue .lamp-ico .base { position: absolute; left: 8px; right: 8px; bottom: 2px; height: 5px; border-radius: 2px; background: #5a3d24; }
@keyframes dlg-flick { 0%, 100% { rotate: -2deg; } 40% { rotate: 3deg; translate: 0 -.5px; } 70% { rotate: -1deg; } }
#dialogue [data-tier="redup"] .lamp-ico, #dialogue .lamp-ico[data-tier="redup"] { --tc: #a7a2c7; }
#dialogue [data-tier="sedang"] .lamp-ico, #dialogue .lamp-ico[data-tier="sedang"] { --tc: #f0b34c; }
#dialogue [data-tier="terang"] .lamp-ico, #dialogue .lamp-ico[data-tier="terang"] { --tc: #fff0c4; }
#dialogue .lamp-ico.flicker .fl { animation: dlg-flick-bad .35s steps(2) infinite; }
@keyframes dlg-flick-bad { 0% { opacity: .35; } 50% { opacity: .85; } }

/* ---------- Choices ---------- */
#dialogue .dlg-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; padding: 4px 22px 4px; }
#dialogue .dlg-scroll:empty { display: none; }
#dialogue .dlg-list { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; padding: 8px 0 4px; }
#dialogue .dlg-list.single { grid-template-columns: 1fr; }
#dialogue .dlg-opt { all: unset; box-sizing: border-box; position: relative; display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 8px 12px 8px 12px;
  border-radius: 8px; border: 1px solid rgba(239,230,210,.07); background: rgba(239,230,210,.025); cursor: pointer; pointer-events: auto;
  font-family: var(--font-body); font-size: var(--fs-m); font-weight: 500; color: var(--paper); transition: background .18s, border-color .18s, transform .18s; }
#dialogue .dlg-opt .k { flex: 0 0 auto; min-width: 22px; height: 22px; padding: 0 5px; box-sizing: border-box; display: inline-grid; place-items: center; border-radius: 5px;
  border: 1px solid rgba(239,230,210,.22); font-family: var(--font-mono); font-size: 11px; color: var(--kabut); }
#dialogue .dlg-opt .lbl { flex: 1; min-width: 0; line-height: 1.25; }
#dialogue .dlg-opt .meta { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 7px; font-size: 11px; letter-spacing: .06em; color: var(--kabut); }
#dialogue .dlg-opt.sel { background: linear-gradient(90deg, rgba(255,181,71,.17), rgba(255,181,71,.03)); border-color: rgba(255,181,71,.45); }
#dialogue .dlg-opt.sel::before { content: ''; position: absolute; left: -1px; top: 8px; bottom: 8px; width: 3px; border-radius: 2px; background: var(--lentera); box-shadow: 0 0 10px rgba(255,181,71,.7); }
#dialogue .dlg-opt.sel .k { border-color: var(--lentera); color: var(--lentera); }
#dialogue .dlg-opt.asked .lbl { color: rgba(239,230,210,.78); }
#dialogue .dlg-opt.locked { cursor: default; opacity: .5; border-style: dashed; background: transparent; }
#dialogue .dlg-opt.locked .lbl { font-style: italic; font-weight: 400; color: var(--kabut); font-size: var(--fs-s); }
#dialogue .dlg-opt.locked .k { border-style: dashed; }
#dialogue .dlg-opt.bye .lbl { color: var(--kabut); }
#dialogue .dlg-opt.wide { grid-column: 1 / -1; }
#dialogue .ico-lock { width: 9px; height: 7px; border: 1.5px solid currentColor; border-radius: 2px; position: relative; margin-top: 4px; }
#dialogue .ico-lock::before { content: ''; position: absolute; left: 1px; top: -6px; width: 4px; height: 5px; border: 1.5px solid currentColor; border-bottom: 0; border-radius: 4px 4px 0 0; }
#dialogue .ico-check { width: 9px; height: 5px; border-left: 2px solid var(--kilau); border-bottom: 2px solid var(--kilau); transform: rotate(-45deg) translateY(-2px); }
#dialogue .chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 7px 2px 6px; border-radius: 999px; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase;
  border: 1px solid rgba(239,230,210,.16); }
#dialogue .chip::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--tc); box-shadow: 0 0 6px var(--tc); }
#dialogue .chip.redup { --tc: var(--tier-redup); color: var(--tier-redup); }
#dialogue .chip.sedang { --tc: var(--tier-sedang); color: var(--tier-sedang); }
#dialogue .chip.terang { --tc: var(--tier-terang); color: var(--tier-terang); border-color: rgba(255,241,193,.35); }
#dialogue .new-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--lentera); box-shadow: 0 0 8px rgba(255,181,71,.9); }
#dialogue .dlg-note { grid-column: 1 / -1; font-size: var(--fs-s); color: var(--kabut); padding: 4px 4px 0; }
#dialogue .dlg-note b { color: var(--kilau); font-weight: 500; }

/* ---------- Tier picker ---------- */
#dialogue .dlg-tiers { padding: 6px 0 4px; }
#dialogue .dlg-tiers-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 2px 2px 10px; flex-wrap: wrap; }
#dialogue .dlg-tiers-head h3 { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: clamp(17px, 1.2rem, 21px); color: var(--paper); }
#dialogue .dlg-tiers-head .bal { font-family: var(--font-mono); font-size: 12px; color: var(--kabut); }
#dialogue .dlg-tiers-head .bal b { color: var(--paper); font-weight: 500; }
#dialogue .dlg-lamps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
#dialogue .lamp { all: unset; box-sizing: border-box; position: relative; display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: "ico nm cs" "ico md md" "nt nt nt";
  align-items: center; column-gap: 12px; row-gap: 2px; padding: 12px 14px 12px 12px; border-radius: 10px; cursor: pointer; pointer-events: auto;
  border: 1px solid rgba(239,230,210,.1); background: linear-gradient(180deg, rgba(239,230,210,.04), rgba(239,230,210,.015)); color: var(--paper);
  transition: transform .2s var(--ease), border-color .2s, background .2s, box-shadow .2s; }
#dialogue .lamp .lamp-ico { grid-area: ico; }
#dialogue .lamp .nm { grid-area: nm; font-family: var(--font-display); font-size: 19px; line-height: 1.1; }
#dialogue .lamp .md { grid-area: md; font-size: 12px; color: var(--kabut); }
#dialogue .lamp .cs { grid-area: cs; font-family: var(--font-mono); font-size: 16px; font-weight: 500; text-align: right; }
#dialogue .lamp .cs small { display: block; font-size: 9px; letter-spacing: .14em; color: var(--kabut); font-weight: 400; }
#dialogue .lamp .nt { grid-area: nt; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(239,230,210,.08); font-size: var(--fs-s); color: rgba(239,230,210,.75); }
#dialogue .lamp .k { position: absolute; bottom: 9px; right: 12px; font-family: var(--font-mono); font-size: 10px; padding: 0 5px; border-radius: 4px; border: 1px solid rgba(239,230,210,.2); color: var(--kabut); opacity: 0; }
#dialogue .lamp[data-tier="redup"] .lamp-ico { --g: .18; } #dialogue .lamp[data-tier="sedang"] .lamp-ico { --g: .5; } #dialogue .lamp[data-tier="terang"] .lamp-ico { --g: .9; }
#dialogue .lamp[data-tier="redup"] .nm { color: #c4bfdc; } #dialogue .lamp[data-tier="sedang"] .nm { color: var(--tier-sedang); } #dialogue .lamp[data-tier="terang"] .nm { color: var(--tier-terang); text-shadow: 0 0 14px rgba(255,220,150,.45); }
#dialogue .dlg-lamps.has-sel .lamp:not(.sel) { opacity: .78; }
#dialogue .lamp.sel { transform: translateY(-3px); border-color: var(--tcb, rgba(255,181,71,.7)); background: linear-gradient(180deg, rgba(255,181,71,.2), rgba(255,181,71,.05));
  box-shadow: 0 12px 30px rgba(0,0,0,.42), 0 0 0 1px var(--tcb, rgba(255,181,71,.7)), 0 0 34px var(--tcg, rgba(255,181,71,.16)); }
#dialogue .lamp.sel::after { content: ''; position: absolute; left: 50%; top: -1px; width: 38%; height: 2px; transform: translateX(-50%); border-radius: 2px; background: var(--tcb, var(--lentera)); box-shadow: 0 0 10px var(--tcb, var(--lentera)); }
#dialogue .lamp[data-tier="redup"] { --tcb: rgba(167,162,199,.65); --tcg: rgba(167,162,199,.12); }
#dialogue .lamp[data-tier="terang"] { --tcb: rgba(255,236,190,.8); --tcg: rgba(255,214,140,.28); }
#dialogue .lamp.sel .lamp-ico { --g: 1; }
#dialogue .lamp[data-tier="redup"].sel .lamp-ico { --g: .42; } #dialogue .lamp[data-tier="sedang"].sel .lamp-ico { --g: .75; }
#dialogue .lamp.paid .nt { color: var(--kilau); }
#dialogue .lamp.paid .cs { color: var(--kilau); }
#dialogue .lamp.off { cursor: not-allowed; opacity: .42; filter: grayscale(.6); }
#dialogue .lamp.off .nt { color: #ff9a74; }
#dialogue .lamp.off.sel { transform: none; }
#dialogue .lamp.shake { animation: dlg-shake .4s; }
@keyframes dlg-shake { 20%, 60% { translate: -5px 0; } 40%, 80% { translate: 5px 0; } }
#dialogue .dlg-tip { margin: 10px 2px 2px; font-size: var(--fs-s); color: var(--kabut); }
#dialogue .dlg-tip b { color: var(--paper); font-weight: 500; }

#dialogue .dlg:not([data-device="kbm"]) .dlg-opt .k { display: none; }
#dialogue .dlg[data-device="kbm"] .lamp .k { opacity: .75; }

/* ---------- Footer hints ---------- */
#dialogue .dlg-hints { display: flex; justify-content: flex-end; gap: 16px; padding: 8px 22px 12px; font-size: 11.5px; color: rgba(167,174,196,.75); flex: 0 0 auto; }
#dialogue .dlg-hints span { display: inline-flex; align-items: center; gap: 6px; }
#dialogue .dlg-hints kbd { font-family: var(--font-mono); font-size: 10.5px; padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(239,230,210,.22); color: var(--paper); background: rgba(239,230,210,.05); }

#dialogue .dlg[data-state="tiers"] .dlg-body { min-height: 0; padding-bottom: 0; cursor: default; }
#dialogue .dlg[data-state="tiers"] .dlg-foot, #dialogue .dlg[data-state="thinking"] .dlg-foot { display: none; }
#dialogue .dlg[data-state="greet"] .dlg-scroll, #dialogue .dlg[data-state="thinking"] .dlg-scroll, #dialogue .dlg[data-state="bye"] .dlg-scroll { display: none; }
#dialogue .dlg-scroll.fade { animation: dlg-fadein .35s var(--ease); }
@keyframes dlg-fadein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* ---------- Phone ---------- */
@media (max-width: 640px) {
  #dialogue .dlg { --bar: min(7vh, 56px); }
  #dialogue .dlg-panel { width: calc(100% - 20px); bottom: calc(10px + env(safe-area-inset-bottom, 0px)); max-height: calc(100% - var(--bar) - 64px); border-radius: 12px; }
  #dialogue .dlg-body { padding: 28px 18px 4px; min-height: 70px; }
  #dialogue .dlg-text { font-size: var(--fs-m); line-height: 1.5; }
  #dialogue .dlg-scroll { padding: 2px 12px 4px; }
  #dialogue .dlg-list { grid-template-columns: 1fr; gap: 5px; }
  #dialogue .dlg-plate { left: 12px; padding: 6px 12px 7px 10px; gap: 9px; }
  #dialogue .dlg-role { font-size: 9.5px; letter-spacing: .14em; }
  #dialogue .dlg-purse { right: 10px; top: 10px; padding: 4px 9px 4px 7px; font-size: 11px; }
  #dialogue .dlg-body { padding-top: 40px; }
  #dialogue .dlg-purse small { display: none; }
  #dialogue .dlg-lamps { grid-template-columns: 1fr; gap: 7px; }
  #dialogue .lamp { padding: 9px 12px 9px 10px; grid-template-areas: "ico nm cs" "ico md cs" "ico nt nt"; }
  #dialogue .lamp .nt { margin-top: 3px; padding-top: 0; border-top: 0; font-size: 12.5px; }
  #dialogue .lamp .lamp-ico { transform: scale(.85); }
  #dialogue .dlg-hints { display: none; }
  #dialogue .dlg-say.t-terang { padding: 12px 14px 13px; }
  #dialogue .dlg-stamp { margin-left: 0; }
}
@media (max-width: 640px) and (max-height: 700px) { #dialogue .dlg-text { font-size: 15px; } }
@media (prefers-reduced-motion: reduce) {
  #dialogue .dlg-say.t-redup .dlg-text .w, #dialogue .lamp-ico .fl, #dialogue .dlg-more { animation: none !important; }
}
`;
