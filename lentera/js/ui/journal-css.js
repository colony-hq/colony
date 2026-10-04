// Journal stylesheet (parchment + batik). Injected once by ui/journal.js.

export const JOURNAL_CSS = /* css */ `
#journal .jr { position: absolute; inset: 0; z-index: 6; display: grid; place-items: center; padding: 18px; box-sizing: border-box;
  visibility: hidden; opacity: 0; transition: opacity .3s var(--ease), visibility 0s linear .3s; pointer-events: none;
  background: radial-gradient(120% 100% at 50% 40%, rgba(11,15,28,.55), rgba(4,6,11,.86)); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  --ink-j: #2b1d10; --ink-j2: #5b4630; --paper-j: #efe2c2; --soga-j: #8a5a34; }
#journal .jr.on { visibility: visible; opacity: 1; transition: opacity .3s var(--ease); }
#journal .jr-book { position: relative; width: min(1040px, 100%); height: min(700px, 100%); display: flex; flex-direction: column; pointer-events: auto;
  color: var(--ink-j); border-radius: 6px 14px 14px 6px; overflow: hidden; transform: translateY(14px) scale(.985); transition: transform .4s var(--ease);
  background:
    radial-gradient(140% 90% at 50% 0%, rgba(255,250,232,.55), rgba(255,250,232,0) 60%),
    radial-gradient(120% 120% at 100% 100%, rgba(120,80,40,.28), rgba(120,80,40,0) 55%),
    radial-gradient(120% 120% at 0% 100%, rgba(120,80,40,.2), rgba(120,80,40,0) 50%),
    linear-gradient(180deg, #f1e4c5, #e6d3a8);
  box-shadow: 0 30px 90px rgba(0,0,0,.6), 0 0 0 1px rgba(60,38,18,.55), inset 0 0 80px rgba(120,80,40,.22); }
#journal .jr.on .jr-book { transform: none; }
/* Batik spine (kawung) on the left edge */
#journal .jr-book::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 22px; z-index: 1;
  background-color: #6e4425;
  background-image:
    radial-gradient(circle at 50% 0, transparent 5px, rgba(240,210,150,.55) 5.5px, rgba(240,210,150,.55) 6.5px, transparent 7px),
    radial-gradient(circle at 0 50%, transparent 5px, rgba(240,210,150,.55) 5.5px, rgba(240,210,150,.55) 6.5px, transparent 7px),
    radial-gradient(circle at 100% 50%, transparent 5px, rgba(240,210,150,.55) 5.5px, rgba(240,210,150,.55) 6.5px, transparent 7px),
    radial-gradient(circle at 50% 100%, transparent 5px, rgba(240,210,150,.55) 5.5px, rgba(240,210,150,.55) 6.5px, transparent 7px),
    radial-gradient(circle at 50% 50%, rgba(40,20,8,.7) 1.6px, transparent 2px);
  background-size: 22px 22px; box-shadow: inset -3px 0 6px rgba(0,0,0,.35), 2px 0 0 rgba(255,235,190,.4); }
#journal .jr-book::after { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .5; mix-blend-mode: multiply;
  background-image: repeating-linear-gradient(0deg, rgba(110,70,30,.035) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(110,70,30,.025) 0 1px, transparent 1px 4px); }

#journal .jr-top { position: relative; display: flex; align-items: flex-end; gap: 16px; padding: 22px 26px 0 48px; }
#journal .jr-title { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: clamp(26px, 2.1rem, 36px); line-height: 1; color: var(--ink-j); letter-spacing: .01em; }
#journal .jr-sub { font-size: var(--fs-s); color: var(--ink-j2); font-style: italic; padding-bottom: 3px; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#journal .jr-close { all: unset; box-sizing: border-box; cursor: pointer; pointer-events: auto; display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 8px;
  font-size: var(--fs-s); font-weight: 700; color: var(--ink-j2); border: 1px solid rgba(90,60,30,.3); background: rgba(255,250,235,.35); }
#journal .jr-close:hover { background: rgba(255,250,235,.7); color: var(--ink-j); }
#journal .jr-close kbd, #journal .jr-hints kbd, #journal .jr-tabs kbd { font-family: var(--font-mono); font-size: 10.5px; padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(90,60,30,.35); background: rgba(255,250,235,.5); color: var(--ink-j); }

#journal .jr-tabs { display: flex; align-items: center; gap: 4px; padding: 16px 26px 0 48px; border-bottom: 1px solid rgba(90,60,30,.28); }
#journal .jr-tab { all: unset; box-sizing: border-box; position: relative; cursor: pointer; pointer-events: auto; padding: 9px 16px 11px; border-radius: 8px 8px 0 0;
  font-family: var(--font-body); font-size: var(--fs-m); font-weight: 700; color: var(--ink-j2); letter-spacing: .01em; display: inline-flex; align-items: center; gap: 8px; }
#journal .jr-tab .n { font-family: var(--font-mono); font-size: 11px; font-weight: 400; padding: 1px 6px; border-radius: 999px; background: rgba(90,60,30,.12); color: var(--ink-j2); }
#journal .jr-tab:hover { color: var(--ink-j); }
#journal .jr-tab.on { color: var(--ink-j); background: rgba(255,250,235,.55); box-shadow: 0 -1px 0 rgba(90,60,30,.2), 1px 0 0 rgba(90,60,30,.15), -1px 0 0 rgba(90,60,30,.15); }
#journal .jr-tab.on::after { content: ''; position: absolute; left: 14px; right: 14px; bottom: -1px; height: 3px; border-radius: 2px; background: var(--soga-j); }
#journal .jr-tabs .sw { margin-left: auto; font-size: 11.5px; color: var(--ink-j2); display: inline-flex; gap: 6px; align-items: center; padding-bottom: 6px; }

#journal .jr-page { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; padding: 22px 30px 26px 52px; scrollbar-width: thin; scrollbar-color: rgba(90,60,30,.4) transparent; }
#journal .jr-hints { display: flex; gap: 18px; justify-content: flex-end; padding: 10px 26px 14px 48px; font-size: 11.5px; color: var(--ink-j2); border-top: 1px solid rgba(90,60,30,.18); }
#journal .jr-hints span { display: inline-flex; align-items: center; gap: 6px; }

#journal h3.jr-h { font-family: var(--font-display); font-weight: 400; font-size: 21px; margin: 0 0 12px; color: var(--ink-j); display: flex; align-items: baseline; gap: 10px; }
#journal h3.jr-h small { font-family: var(--font-body); font-size: var(--fs-xs); letter-spacing: .18em; text-transform: uppercase; color: var(--soga-j); }
#journal .jr-rule { height: 10px; margin: 22px 0 18px; background:
  radial-gradient(circle at 50% 50%, var(--soga-j) 2.5px, transparent 3px) center / 14px 10px repeat-x; opacity: .45; }
#journal .jr-empty { padding: 26px; border: 1.5px dashed rgba(90,60,30,.3); border-radius: 10px; color: var(--ink-j2); font-style: italic; text-align: center; line-height: 1.5; }

/* Quest tracker */
#journal .jr-track { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
#journal .jr-flame { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 10px; background: rgba(255,250,235,.45); border: 1px solid rgba(90,60,30,.18); }
#journal .jr-flame .orb { width: 18px; height: 18px; border-radius: 50%; flex: 0 0 auto; border: 1.5px dashed rgba(90,60,30,.45); }
#journal .jr-flame.carried .orb, #journal .jr-flame.placed .orb { border: 0; background: radial-gradient(circle at 40% 35%, #fff, var(--fc) 55%, rgba(0,0,0,.2)); box-shadow: 0 0 12px var(--fc), 0 0 2px rgba(0,0,0,.4); }
#journal .jr-flame b { display: block; font-family: var(--font-display); font-weight: 400; font-size: 17px; }
#journal .jr-flame span { font-size: var(--fs-xs); color: var(--ink-j2); letter-spacing: .04em; }
#journal .jr-obj { margin: -6px 0 20px; font-size: var(--fs-s); color: var(--ink-j2); }
#journal .jr-obj b { color: var(--ink-j); }

/* Clue cards */
#journal .jr-clues { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 12px; }
#journal .jr-clue { position: relative; padding: 14px 16px 13px 18px; border-radius: 10px; background: rgba(255,250,235,.58); border: 1px solid rgba(90,60,30,.2);
  box-shadow: 0 1px 0 rgba(255,255,255,.5) inset, 0 6px 16px rgba(80,50,20,.08); }
#journal .jr-clue::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 3px; border-radius: 0 2px 2px 0; background: var(--tc, var(--soga-j)); }
#journal .jr-clue.seen { --tc: #6e8a6a; } #journal .jr-clue.redup { --tc: #8c8fa3; } #journal .jr-clue.sedang { --tc: #c99a2e; } #journal .jr-clue.terang { --tc: #e08a1e; }
#journal .jr-clue h4 { margin: 0 0 6px; font-family: var(--font-display); font-weight: 400; font-size: 18px; color: var(--ink-j); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
#journal .jr-clue p { margin: 0; font-size: var(--fs-m); line-height: 1.45; color: #3a2817; }
#journal .jr-clue .src { margin-top: 9px; font-size: var(--fs-xs); color: var(--ink-j2); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
#journal .jr-clue.vague p { font-style: italic; color: #5b4630; }
#journal .jr-clue.new { animation: jr-new 1.6s var(--ease); }
@keyframes jr-new { 0% { box-shadow: 0 0 0 3px rgba(224,138,30,.55); } 100% { box-shadow: 0 1px 0 rgba(255,255,255,.5) inset, 0 6px 16px rgba(80,50,20,.08); } }
#journal .tag { display: inline-flex; align-items: center; gap: 5px; padding: 1px 7px; border-radius: 999px; font-family: var(--font-body); font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; border: 1px solid rgba(90,60,30,.28); color: var(--ink-j2); }
#journal .tag.t-redup { color: #6c6f86; border-color: rgba(108,111,134,.45); } #journal .tag.t-sedang { color: #9a7413; border-color: rgba(201,154,46,.6); } #journal .tag.t-terang { color: #a65e08; border-color: rgba(224,138,30,.6); background: rgba(255,214,140,.25); }
#journal .tag::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
#journal .tag.plain::before { display: none; }

/* People */
#journal .jr-people { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
#journal .jr-person { display: grid; grid-template-columns: 58px 1fr; gap: 14px; padding: 14px 16px; border-radius: 10px; background: rgba(255,250,235,.55); border: 1px solid rgba(90,60,30,.2); }
#journal .jr-person .ava { width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center; font-family: var(--font-display); font-size: 24px; color: #fff6e0;
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.35), rgba(255,255,255,0) 45%), var(--ac, #6b4a2c); box-shadow: inset 0 0 0 3px rgba(255,240,210,.55), 0 0 0 1px rgba(60,38,18,.5), 0 6px 14px rgba(60,38,18,.25); }
#journal .jr-person.unknown .ava { background: repeating-linear-gradient(45deg, rgba(90,60,30,.18) 0 4px, rgba(90,60,30,.08) 4px 8px); color: rgba(60,38,18,.55); box-shadow: inset 0 0 0 1.5px rgba(90,60,30,.35); }
#journal .jr-person h4 { margin: 2px 0 0; font-family: var(--font-display); font-weight: 400; font-size: 19px; }
#journal .jr-person .role { font-size: var(--fs-xs); letter-spacing: .16em; text-transform: uppercase; color: var(--soga-j); margin-top: 2px; }
#journal .jr-person p { margin: 8px 0 0; font-size: var(--fs-s); line-height: 1.45; color: #3a2817; }
#journal .jr-person .asked { margin-top: 9px; display: flex; flex-wrap: wrap; gap: 5px; align-items: center; font-size: var(--fs-xs); color: var(--ink-j2); }
#journal .jr-person.unknown p, #journal .jr-person.unknown h4 { color: var(--ink-j2); font-style: italic; }

/* Thoughts / ledger */
#journal .jr-purse { display: grid; grid-template-columns: auto 1fr; gap: 24px; align-items: center; margin-bottom: 18px; }
#journal .jr-bal { padding: 16px 22px; border-radius: 12px; background: #1a2134; color: var(--paper); box-shadow: inset 0 0 0 1px rgba(143,227,208,.25), 0 10px 24px rgba(20,14,8,.25); }
#journal .jr-bal .lbl { font-size: 10.5px; letter-spacing: .2em; text-transform: uppercase; color: var(--kilau); }
#journal .jr-bal .v { font-family: var(--font-mono); font-size: clamp(28px, 2.6rem, 40px); line-height: 1.1; margin-top: 4px; }
#journal .jr-bal .v small { font-size: 13px; color: var(--kabut); margin-left: 6px; }
#journal .jr-bal .sim { margin-top: 4px; font-size: 11px; color: var(--kabut); }
#journal .jr-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
#journal .jr-stat { padding: 10px 12px; border-radius: 10px; background: rgba(255,250,235,.5); border: 1px solid rgba(90,60,30,.18); }
#journal .jr-stat .k { font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-j2); }
#journal .jr-stat .v { font-family: var(--font-mono); font-size: 19px; margin-top: 4px; color: var(--ink-j); }
#journal .jr-tiers { display: grid; gap: 8px; margin-bottom: 8px; }
#journal .jr-tierrow { display: grid; grid-template-columns: 120px 1fr 150px; gap: 14px; align-items: center; padding: 9px 14px; border-radius: 10px; background: rgba(255,250,235,.45); border: 1px solid rgba(90,60,30,.15); }
#journal .jr-tierrow .nm { font-family: var(--font-display); font-size: 17px; display: flex; align-items: center; gap: 8px; }
#journal .jr-tierrow .nm i { width: 10px; height: 10px; border-radius: 50%; background: var(--tc); box-shadow: 0 0 8px var(--tc); }
#journal .jr-tierrow .md { font-size: var(--fs-xs); color: var(--ink-j2); }
#journal .jr-tierrow .bar { height: 6px; border-radius: 3px; background: rgba(90,60,30,.12); overflow: hidden; }
#journal .jr-tierrow .bar i { display: block; height: 100%; background: var(--tc); border-radius: 3px; }
#journal .jr-tierrow .num { font-family: var(--font-mono); font-size: 13px; text-align: right; color: var(--ink-j); }
#journal .jr-tierrow.redup { --tc: #8c8fa3; } #journal .jr-tierrow.sedang { --tc: #d9a630; } #journal .jr-tierrow.terang { --tc: #f08c1a; }
#journal .jr-ledger { display: grid; gap: 0; border-radius: 10px; overflow: hidden; border: 1px solid rgba(90,60,30,.18); }
#journal .jr-lrow { display: grid; grid-template-columns: 54px 1fr auto 86px; gap: 12px; align-items: center; padding: 8px 14px; background: rgba(255,250,235,.45); font-size: var(--fs-s); }
#journal .jr-lrow:nth-child(even) { background: rgba(255,250,235,.25); }
#journal .jr-lrow .tm { font-family: var(--font-mono); font-size: 11px; color: var(--ink-j2); }
#journal .jr-lrow .ds { min-width: 0; }
#journal .jr-lrow .ds b { font-weight: 700; color: var(--ink-j); }
#journal .jr-lrow .ds small { display: block; font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-j2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#journal .jr-lrow .amt { font-family: var(--font-mono); font-size: 13px; text-align: right; }
#journal .jr-lrow .amt.neg { color: #9a3b18; } #journal .jr-lrow .amt.pos { color: #1f7a63; }
#journal .jr-disc { margin-top: 14px; font-size: var(--fs-xs); color: var(--ink-j2); line-height: 1.5; }

/* Map */
#journal .jr-mapwrap { display: grid; grid-template-columns: minmax(0, 470px) minmax(180px, 240px); justify-content: start; gap: 34px; align-items: start; }
#journal .jr-mapbox { position: relative; width: 100%; aspect-ratio: 1 / 1; max-height: 470px; max-width: 470px; justify-self: start; border-radius: 8px; overflow: hidden;
  box-shadow: 0 0 0 1px rgba(60,38,18,.55), 0 0 0 5px rgba(255,248,230,.6), 0 0 0 6px rgba(60,38,18,.35), 0 12px 30px rgba(60,38,18,.25); }
#journal .jr-mapbox canvas { display: block; width: 100%; height: 100%; }
#journal .jr-legend { display: grid; gap: 9px; font-size: var(--fs-s); color: #3a2817; }
#journal .jr-legend h4 { margin: 0 0 2px; font-family: var(--font-display); font-weight: 400; font-size: 18px; }
#journal .jr-legend div { display: flex; align-items: center; gap: 10px; }
#journal .jr-legend .sw { width: 16px; height: 16px; flex: 0 0 auto; display: grid; place-items: center; }
#journal .jr-legend .sw i { display: block; }
#journal .jr-legend .note { font-size: var(--fs-xs); color: var(--ink-j2); line-height: 1.45; margin-top: 6px; }

@media (max-width: 760px) {
  #journal .jr { padding: 0; }
  #journal .jr-book { width: 100%; height: 100%; border-radius: 0; }
  #journal .jr-book::before { width: 10px; background-size: 10px 10px; }
  #journal .jr-top { padding: calc(14px + env(safe-area-inset-top, 0px)) 14px 0 24px; }
  #journal .jr-sub { display: none; }
  #journal .jr-tabs { padding: 10px 8px 0 18px; gap: 0; overflow-x: auto; scrollbar-width: none; }
  #journal .jr-tab { padding: 8px 10px 10px; font-size: var(--fs-s); }
  #journal .jr-tab .n { display: none; }
  #journal .jr-tabs .sw { display: none; }
  #journal .jr-page { padding: 16px 14px calc(22px + env(safe-area-inset-bottom, 0px)) 24px; }
  #journal .jr-hints { display: none; }
  #journal .jr-close { margin-left: auto; }
  #journal .jr-track { gap: 6px; }
  #journal .jr-flame { flex-direction: column; align-items: flex-start; gap: 6px; padding: 9px 10px; }
  #journal .jr-flame .orb { width: 14px; height: 14px; }
  #journal .jr-flame b { font-size: 14.5px; }
  #journal .jr-flame span { font-size: 11px; line-height: 1.25; display: block; }
  #journal .jr-clues, #journal .jr-people { grid-template-columns: 1fr; }
  #journal .jr-purse { grid-template-columns: 1fr; gap: 12px; }
  #journal .jr-stats { grid-template-columns: 1fr 1fr; }
  #journal .jr-tierrow { grid-template-columns: 1fr auto; }
  #journal .jr-tierrow .bar { grid-column: 1 / -1; order: 3; }
  #journal .jr-lrow { grid-template-columns: 1fr auto; }
  #journal .jr-lrow .tm { display: none; }
  #journal .jr-lrow .chipcell { display: none; }
  #journal .jr-mapwrap { grid-template-columns: 1fr; }
  #journal .jr-legend { grid-template-columns: 1fr 1fr; }
  #journal .jr-legend h4, #journal .jr-legend .note { grid-column: 1 / -1; }
}
`;
