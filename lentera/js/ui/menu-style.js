// Menu styles (title, panels, pause, settings, controls, confirm, credits, legend).
// Owner: ui-audio. Uses the tokens from index.html.

const KAWUNG = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g fill='none' stroke='%23a8744a' stroke-width='1'><ellipse cx='12' cy='5.4' rx='3.4' ry='5'/><ellipse cx='12' cy='18.6' rx='3.4' ry='5'/><ellipse cx='5.4' cy='12' rx='5' ry='3.4'/><ellipse cx='18.6' cy='12' rx='5' ry='3.4'/></g><circle cx='12' cy='12' r='1.2' fill='%23ffb547'/></svg>\")";

export const MENU_CSS = `
.lm { position: absolute; inset: 0; pointer-events: none; z-index: 6; font-family: var(--font-body); color: var(--paper); }
.lm button { font: inherit; color: inherit; -webkit-tap-highlight-color: transparent; }
.lm button:focus-visible, .lm [tabindex]:focus-visible, .lm [tabindex]:focus { outline: none; }
.lm-hide { display: none !important; }

/* ---------- Scrim ---------- */
.lm-scrim {
  position: absolute; inset: 0; opacity: 0; visibility: hidden; transition: opacity 0.35s var(--ease), visibility 0s linear 0.35s;
  background: radial-gradient(ellipse 90% 80% at 50% 45%, rgba(8, 11, 22, 0.55), rgba(5, 7, 14, 0.86));
  -webkit-backdrop-filter: blur(7px) saturate(0.85); backdrop-filter: blur(7px) saturate(0.85);
}
.lm.scrim-on .lm-scrim { opacity: 1; visibility: visible; transition: opacity 0.35s var(--ease); }
.lm.title-on .lm-scrim { background: rgba(5, 7, 14, 0.5); }

/* ---------- Title ---------- */
.lm-title {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
  padding: calc(env(safe-area-inset-top, 0px) + 13vh) var(--gutter) calc(env(safe-area-inset-bottom, 0px) + 18px);
  opacity: 0; visibility: hidden; transition: opacity 0.8s var(--ease), visibility 0s linear 0.8s;
}
.lm.title-on .lm-title { opacity: 1; visibility: visible; transition: opacity 0.8s var(--ease); }
.lm-title-vg {
  position: absolute; inset: 0; z-index: -1;
  background:
    radial-gradient(ellipse 70% 46% at 50% 30%, rgba(8, 11, 22, 0.5), rgba(8, 11, 22, 0) 70%),
    linear-gradient(180deg, rgba(8, 11, 22, 0.55) 0%, rgba(8, 11, 22, 0.1) 30%, rgba(8, 11, 22, 0.15) 50%, rgba(8, 11, 22, 0.82) 100%);
}
.lm-brand { display: grid; justify-items: center; text-align: center; gap: 12px; transition: opacity 0.5s var(--ease), transform 0.5s var(--ease); }
.lm-lamp { width: 34px; height: 51px; margin-bottom: 4px; filter: drop-shadow(0 0 18px rgba(255, 170, 60, 0.55)); }
.lm-lamp svg { width: 100%; height: 100%; overflow: visible; }
.lm-lamp-fl { transform-origin: 20px 33px; animation: lm-flick 1.7s ease-in-out infinite; }
@keyframes lm-flick { 0%, 100% { transform: scale(1); opacity: 1; } 35% { transform: scale(1.06, 0.95); opacity: 0.9; } 70% { transform: scale(0.96, 1.05); } }
.lm-logo {
  margin: 0; font: 400 var(--fs-title)/0.9 var(--font-display); letter-spacing: 0.14em; margin-right: -0.14em; white-space: nowrap;
  color: var(--paper); text-shadow: 0 0 60px rgba(255, 181, 71, 0.28), 0 4px 40px rgba(5, 8, 16, 0.75), 0 1px 2px rgba(5, 8, 16, 0.5);
}
.lm-logo span { display: inline-block; }
.lm.title-on .lm-logo span { animation: lm-letter 1.6s var(--ease) both; }
.lm-rule { display: flex; align-items: center; gap: 12px; width: min(360px, 70vw); }
.lm-rule::before, .lm-rule::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(255, 181, 71, 0.7)); }
.lm-rule::after { background: linear-gradient(90deg, rgba(255, 181, 71, 0.7), transparent); }
.lm-rule i { width: 7px; height: 7px; transform: rotate(45deg); background: var(--lentera); box-shadow: 0 0 10px var(--lentera); }
.lm-subt {
  font: 500 clamp(12px, 1.5vw, 17px)/1 var(--font-body); letter-spacing: 0.52em; margin-right: -0.52em; text-transform: uppercase;
  color: var(--paper); opacity: 0.82; text-shadow: 0 1px 3px rgba(5, 8, 16, 0.9), 0 0 20px rgba(5, 8, 16, 0.7);
}
.lm.title-on .lm-rule { animation: lm-rise 1.4s var(--ease) 0.7s both; }
.lm.title-on .lm-subt { animation: lm-rise 1.4s var(--ease) 0.9s both; }
.lm.title-on .lm-lamp { animation: lm-rise 1.2s var(--ease) 0.1s both; }
.lm-tspace { flex: 1 1 auto; min-height: 24px; }
.lm-tn { display: grid; justify-items: center; gap: 2px; transition: opacity 0.4s var(--ease); }
.lm-ti {
  position: relative; pointer-events: auto; cursor: pointer; background: none; border: 0; padding: 12px 40px;
  display: grid; justify-items: center; gap: 6px; color: var(--kabut); text-shadow: 0 1px 3px rgba(5, 8, 16, 0.9), 0 0 16px rgba(5, 8, 16, 0.6);
  transition: color 0.25s var(--ease);
}
.lm-ti .lm-btn-l { font: 600 clamp(15px, 1.12rem, 19px)/1 var(--font-body); letter-spacing: 0.26em; margin-right: -0.26em; text-transform: uppercase; }
.lm-ti .lm-btn-s { font: 500 12px/1 var(--font-mono); letter-spacing: 0.02em; color: var(--kabut); opacity: 0.75; }
.lm-ti::before, .lm-ti::after {
  content: ''; position: absolute; top: 18px; width: 6px; height: 6px; background: var(--lentera);
  transform: rotate(45deg) scale(0); transition: transform 0.25s var(--ease); box-shadow: 0 0 8px var(--lentera);
}
.lm-ti::before { left: 14px; }
.lm-ti::after { right: 14px; }
.lm-ti.is-focus { color: var(--paper); }
.lm-ti.is-focus::before, .lm-ti.is-focus::after { transform: rotate(45deg) scale(1); }
.lm-ti.is-focus .lm-btn-l { text-shadow: 0 0 18px rgba(255, 181, 71, 0.45), 0 1px 3px rgba(5, 8, 16, 0.9); }
.lm-ti.is-focus .lm-btn-s { color: var(--lentera); opacity: 0.9; }
.lm.title-on .lm-ti { animation: lm-rise 0.9s var(--ease) both; }
.lm-tfoot {
  margin-top: 26px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 14px; text-align: center;
  font: 500 var(--fs-xs)/1.4 var(--font-body); letter-spacing: 0.06em; color: var(--kabut); opacity: 0.85;
  text-shadow: 0 1px 2px rgba(5, 8, 16, 0.9);
}
.lm-tfoot b { font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; color: var(--paper); opacity: 0.8; }
.lm.title-on .lm-tfoot { animation: lm-rise 1s var(--ease) 1.4s both; }
.lm.title-on.panel-open .lm-brand { opacity: 0.12; transform: scale(0.96); }
.lm.title-on.panel-open .lm-tn, .lm.title-on.panel-open .lm-tfoot { opacity: 0; pointer-events: none; }
.lm.title-on.panel-open .lm-ti { pointer-events: none; }
.lm-title.leaving { opacity: 0 !important; transition: opacity 0.9s var(--ease) !important; }
@keyframes lm-letter { from { opacity: 0; filter: blur(12px); transform: translateY(0.1em); } to { opacity: 1; filter: blur(0); transform: none; } }
@keyframes lm-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

/* ---------- Host + panels ---------- */
.lm-host { position: absolute; inset: 0; display: grid; place-items: center; padding: calc(env(safe-area-inset-top, 0px) + 16px) var(--gutter) calc(env(safe-area-inset-bottom, 0px) + 60px); }
.lm-host > * { grid-area: 1 / 1; }
.lm-in { animation: lm-panel-in 0.32s var(--ease) both; }
.lm-out { animation: lm-panel-out 0.24s var(--ease) both; pointer-events: none !important; }
.lm-under { visibility: hidden; }
@keyframes lm-panel-in { from { opacity: 0; transform: translateY(12px) scale(0.985); } to { opacity: 1; transform: none; } }
@keyframes lm-panel-out { to { opacity: 0; transform: translateY(-8px) scale(0.99); } }

.lm-panel {
  pointer-events: auto; width: min(620px, 100%); max-height: min(760px, calc(100vh - 110px)); max-height: min(760px, calc(100dvh - 110px));
  display: flex; flex-direction: column; border-radius: 18px; overflow: hidden;
  background: linear-gradient(180deg, rgba(26, 32, 54, 0.92), rgba(12, 16, 30, 0.94));
  border: 1px solid rgba(239, 230, 210, 0.1);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);
}
.lm-ph { position: relative; padding: 24px 28px 14px; }
.lm-ph-k { font: 700 10px/1 var(--font-body); letter-spacing: 0.36em; text-transform: uppercase; color: var(--lentera); min-height: 10px; }
.lm-ph-t { margin: 10px 0 0; font: 400 clamp(28px, 4.2vw, 38px)/1 var(--font-display); letter-spacing: 0.01em; color: var(--paper); }
.lm-back {
  position: absolute; right: 18px; top: 20px; pointer-events: auto; cursor: pointer; display: flex; align-items: center; gap: 8px;
  padding: 8px 14px 8px 10px; border-radius: 999px; border: 1px solid rgba(239, 230, 210, 0.14); background: rgba(239, 230, 210, 0.04);
  font: 600 var(--fs-xs)/1 var(--font-body) !important; letter-spacing: 0.18em; text-transform: uppercase; color: var(--kabut) !important;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.lm-back i { width: 7px; height: 7px; border-left: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); margin-left: 3px; }
.lm-back:hover { color: var(--paper) !important; border-color: rgba(255, 181, 71, 0.5); background: rgba(255, 181, 71, 0.08); }
.lm-band { height: 12px; margin: 0 28px; background-image: ${KAWUNG}; background-size: 12px 12px; background-repeat: repeat-x; background-position: center; opacity: 0.38;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent); mask-image: linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent); }
.lm-pb { overflow-y: auto; overscroll-behavior: contain; padding: 10px 16px 12px; scrollbar-width: thin; scrollbar-color: rgba(239, 230, 210, 0.2) transparent; }
.lm-pd { min-height: 1.45em; padding: 13px 28px 18px; border-top: 1px solid rgba(239, 230, 210, 0.07); font: 400 var(--fs-s)/1.45 var(--font-body); color: var(--kabut); }
.lm-pd:empty { display: none; }

.lm-sec { display: flex; align-items: center; gap: 12px; padding: 16px 12px 6px; font: 700 10px/1 var(--font-body); letter-spacing: 0.32em; text-transform: uppercase; color: var(--kabut); opacity: 0.85; }
.lm-sec::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, rgba(168, 116, 74, 0.55), transparent); }
.lm-sec:first-child { padding-top: 6px; }

.lm-row, .lm-btn {
  pointer-events: auto; cursor: pointer; position: relative; width: 100%; box-sizing: border-box; min-height: 50px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 14px 10px 18px;
  border: 0; border-radius: 10px; background: transparent; text-align: left;
  font: 500 var(--fs-m)/1.2 var(--font-body); color: var(--paper); transition: background 0.18s, box-shadow 0.18s;
}
.lm-row.is-focus, .lm-btn.is-focus { background: linear-gradient(90deg, rgba(255, 181, 71, 0.15), rgba(255, 181, 71, 0.035)); box-shadow: inset 0 0 0 1px rgba(255, 181, 71, 0.26); }
.lm-row.is-focus::before, .lm-btn.is-focus::before {
  content: ''; position: absolute; left: 0; top: 11px; bottom: 11px; width: 2px; border-radius: 2px; background: var(--lentera); box-shadow: 0 0 8px var(--lentera);
}
.lm-row-l { flex: 1 1 auto; min-width: 0; }
.lm-btn .lm-btn-s { font: 400 var(--fs-xs)/1.3 var(--font-body); color: var(--kabut); }
.lm-btn.danger .lm-btn-l { color: #ffc7b5; }
.lm-btn.disabled { opacity: 0.4; cursor: default; }

.lm-sl { display: flex; align-items: center; gap: 12px; flex: none; }
.lm-sl-track { position: relative; width: clamp(110px, 20vw, 190px); height: 26px; touch-action: none; cursor: pointer; }
.lm-sl-track::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 3px; transform: translateY(-50%); border-radius: 3px; background: rgba(239, 230, 210, 0.16); }
.lm-sl-fill { position: absolute; left: 0; top: 50%; height: 3px; transform: translateY(-50%); border-radius: 3px; background: linear-gradient(90deg, rgba(255, 181, 71, 0.55), var(--lentera)); }
.lm-sl-knob {
  position: absolute; top: 50%; width: 13px; height: 13px; border-radius: 3px; transform: translate(-50%, -50%) rotate(45deg);
  background: var(--paper); box-shadow: 0 0 0 3px rgba(12, 16, 30, 0.9); transition: background 0.2s, box-shadow 0.2s;
}
.lm-row.is-focus .lm-sl-knob { background: var(--lentera); box-shadow: 0 0 0 3px rgba(12, 16, 30, 0.9), 0 0 14px var(--lentera); }
.lm-val { min-width: 3.4em; text-align: right; font: 500 13px/1 var(--font-mono); color: var(--kabut); font-variant-numeric: tabular-nums; }
.lm-row.is-focus .lm-val { color: var(--paper); }

.lm-tg { display: flex; align-items: center; gap: 12px; flex: none; }
.lm-tg-sw { position: relative; width: 42px; height: 24px; border-radius: 999px; background: rgba(239, 230, 210, 0.14); box-shadow: inset 0 0 0 1px rgba(239, 230, 210, 0.12); transition: background 0.25s var(--ease); }
.lm-tg-sw::after { content: ''; position: absolute; left: 4px; top: 4px; width: 16px; height: 16px; border-radius: 50%; background: var(--kabut); transition: transform 0.25s var(--ease), background 0.25s; }
.lm-tg.on .lm-tg-sw { background: rgba(255, 181, 71, 0.5); box-shadow: inset 0 0 0 1px rgba(255, 181, 71, 0.6), 0 0 12px rgba(255, 181, 71, 0.25); }
.lm-tg.on .lm-tg-sw::after { transform: translateX(18px); background: var(--paper); }
.lm-tg-t { min-width: 3.6em; font: 500 13px/1 var(--font-mono); color: var(--kabut); }
.lm-row.is-focus .lm-tg-t { color: var(--paper); }

.lm-cy { display: flex; align-items: center; gap: 4px; flex: none; }
.lm-cy-a { pointer-events: auto; cursor: pointer; width: 30px; height: 30px; border-radius: 50%; border: 0; background: rgba(239, 230, 210, 0.06); color: var(--kabut); font: 500 18px/1 var(--font-body) !important; display: grid; place-items: center; }
.lm-cy-a:hover { background: rgba(255, 181, 71, 0.14); color: var(--paper); }
.lm-cy-m { display: grid; justify-items: center; gap: 6px; min-width: 6.2em; }
.lm-cy-v { font: 600 var(--fs-s)/1 var(--font-body); letter-spacing: 0.04em; }
.lm-cy-p { display: flex; gap: 5px; }
.lm-cy-p i { width: 4px; height: 4px; border-radius: 50%; background: rgba(239, 230, 210, 0.22); }
.lm-cy-p i.on { background: var(--lentera); box-shadow: 0 0 6px var(--lentera); }

/* ---------- Pause ---------- */
.lm-pause { pointer-events: none; width: min(980px, 100%); display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 420px); justify-content: center; align-items: center; gap: clamp(28px, 6vw, 80px); }
.lm-pause-l { display: grid; gap: 4px; }
.lm-pause-k { font: 700 10px/1 var(--font-body); letter-spacing: 0.4em; text-transform: uppercase; color: var(--lentera); padding-left: 18px; }
.lm-pause-t { margin: 8px 0 18px; padding-left: 18px; font: 400 clamp(40px, 6vw, 64px)/1 var(--font-display); color: var(--paper); text-shadow: 0 4px 30px rgba(5, 8, 16, 0.6); }
.lm-pause .lm-btn { min-height: 48px; font-size: var(--fs-l); letter-spacing: 0.02em; }
.lm-pause .lm-btn-sep { height: 1px; margin: 8px 18px; background: linear-gradient(90deg, rgba(168, 116, 74, 0.5), transparent); }
.lm-card {
  pointer-events: auto; border-radius: 16px; padding: 22px 24px 20px; display: grid; gap: 18px;
  background: linear-gradient(180deg, rgba(26, 32, 54, 0.78), rgba(12, 16, 30, 0.82)); border: 1px solid rgba(239, 230, 210, 0.09);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}
.lm-card-k { font: 700 10px/1 var(--font-body); letter-spacing: 0.32em; text-transform: uppercase; color: var(--kabut); margin-bottom: 8px; }
.lm-card-obj { font: 500 var(--fs-l)/1.35 var(--font-body); color: var(--paper); text-wrap: balance; }
.lm-fl-list { display: grid; gap: 8px; }
.lm-fl-row { display: flex; align-items: center; gap: 12px; font: 500 var(--fs-s)/1.2 var(--font-body); }
.lm-fl-row i { --fc: #fff; flex: none; width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--fc); opacity: 0.45; box-sizing: border-box; }
.lm-fl-row.carried i { background: var(--fc); opacity: 1; box-shadow: 0 0 10px var(--fc); }
.lm-fl-row.placed i { background: var(--fc); opacity: 1; box-shadow: 0 0 0 2px rgba(12, 16, 30, 0.9), 0 0 0 3.5px var(--fc); }
.lm-fl-row span { flex: 1; }
.lm-fl-row em { font-style: normal; color: var(--kabut); font-size: var(--fs-xs); letter-spacing: 0.04em; }
.lm-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.lm-stat { padding: 11px 13px; border-radius: 11px; background: rgba(239, 230, 210, 0.04); border: 1px solid rgba(239, 230, 210, 0.06); display: grid; gap: 6px; }
.lm-stat b { font: 700 9.5px/1 var(--font-body); letter-spacing: 0.26em; text-transform: uppercase; color: var(--kabut); }
.lm-stat span { font: 500 19px/1 var(--font-mono); color: var(--paper); font-variant-numeric: tabular-nums; }
.lm-stat small { font: 600 9px/1 var(--font-body); letter-spacing: 0.24em; text-transform: uppercase; color: var(--kabut); opacity: 0.75; }
.lm-stat.cr span { color: var(--lentera); }
.lm-stat.kl span { color: var(--kilau); }

/* ---------- Confirm ---------- */
.lm-panel.lm-confirm { width: min(500px, 100%); }
.lm-confirm .lm-pb { padding: 4px 28px 22px; }
.lm-confirm p { margin: 4px 0 20px; font: 400 var(--fs-m)/1.55 var(--font-body); color: var(--paper); opacity: 0.9; }
.lm-confirm .lm-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.lm-confirm .lm-btn { justify-content: center; text-align: center; box-shadow: inset 0 0 0 1px rgba(239, 230, 210, 0.12); }
.lm-confirm .lm-btn.is-focus { box-shadow: inset 0 0 0 1px rgba(255, 181, 71, 0.55), 0 0 20px rgba(255, 181, 71, 0.12); }
.lm-confirm .lm-btn.is-focus::before { display: none; }

/* ---------- Controls ---------- */
.lm-tabs { display: flex; gap: 6px; padding: 4px; margin: 2px 0 10px; border-radius: 12px; background: rgba(239, 230, 210, 0.04); pointer-events: auto; }
.lm-tab { flex: 1; pointer-events: auto; cursor: pointer; padding: 10px 8px; border: 0; border-radius: 9px; background: transparent; color: var(--kabut); font: 600 var(--fs-s)/1.1 var(--font-body) !important; letter-spacing: 0.04em; transition: background 0.2s, color 0.2s; }
.lm-tab.on { background: rgba(255, 181, 71, 0.16); color: var(--paper); box-shadow: inset 0 0 0 1px rgba(255, 181, 71, 0.35); }
.lm-tabs.is-focus .lm-tab.on { box-shadow: inset 0 0 0 1px var(--lentera), 0 0 16px rgba(255, 181, 71, 0.2); }
.lm-ctab { display: grid; }
.lm-crow { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 11px 12px; border-bottom: 1px solid rgba(239, 230, 210, 0.06); font: 500 var(--fs-m)/1.3 var(--font-body); }
.lm-crow:last-child { border-bottom: 0; }
.lm-crow small { display: block; margin-top: 3px; font-size: var(--fs-xs); color: var(--kabut); }
.lm-ckeys { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 2px; font-size: 16px; flex: none; max-width: 55%; }

/* ---------- Legend ---------- */
.lm-legend {
  position: absolute; right: calc(env(safe-area-inset-right, 0px) + 24px); bottom: calc(env(safe-area-inset-bottom, 0px) + 18px);
  display: flex; gap: 22px; align-items: center; white-space: nowrap; opacity: 0; transition: opacity 0.4s var(--ease);
  font: 600 var(--fs-xs)/1 var(--font-body); letter-spacing: 0.14em; text-transform: uppercase; color: var(--kabut);
  text-shadow: 0 1px 2px rgba(5, 8, 16, 0.9);
}
.lm.legend-on .lm-legend { opacity: 1; }
.lm-legend span { display: flex; align-items: center; gap: 7px; font-size: 15px; }
.lm-legend span em { font: 600 var(--fs-xs)/1 var(--font-body); font-style: normal; letter-spacing: 0.14em; }
.lm-legend .lk { margin: 0; text-transform: none; letter-spacing: 0; }

/* ---------- Credits ---------- */
.lm-credits { position: absolute; inset: 0; display: none; pointer-events: none; }
.lm-credits.on { display: block; animation: lm-fade 1.6s var(--ease) both; }
.lm-cr-bg { position: absolute; inset: 0; background: radial-gradient(ellipse 80% 70% at 50% 40%, rgba(11, 15, 28, 0.5), rgba(5, 7, 14, 0.94)); }
.lm-roll-wrap { position: absolute; inset: 0; overflow: hidden; -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 16%, #000 84%, transparent 100%); mask-image: linear-gradient(180deg, transparent 0, #000 16%, #000 84%, transparent 100%); }
.lm-roll { position: absolute; left: 50%; top: 0; width: min(640px, calc(100vw - 32px)); text-align: center; transform: translate(-50%, 100vh); display: grid; gap: 54px; padding-bottom: 20vh; }
.lm-roll.run { animation: lm-roll var(--roll, 30s) linear forwards; }
@keyframes lm-roll { from { transform: translate(-50%, 100vh); } to { transform: translate(-50%, -100%); } }
.lm-roll-logo { display: grid; justify-items: center; gap: 12px; }
.lm-roll-logo h3 { margin: 0; font: 400 clamp(46px, 9vw, 86px)/1 var(--font-display); letter-spacing: 0.14em; margin-right: -0.14em; color: var(--paper); text-shadow: 0 0 40px rgba(255, 181, 71, 0.3); }
.lm-roll-logo p { margin: 0; font: 500 var(--fs-s)/1 var(--font-body); letter-spacing: 0.5em; margin-right: -0.5em; text-transform: uppercase; color: var(--kabut); }
.lm-roll-sec { display: grid; gap: 18px; }
.lm-roll-sec h4 { margin: 0; font: 700 10px/1 var(--font-body); letter-spacing: 0.4em; margin-right: -0.4em; text-transform: uppercase; color: var(--lentera); }
.lm-roll-e { display: grid; gap: 5px; }
.lm-roll-e b { font: 400 clamp(22px, 2.6vw, 28px)/1.1 var(--font-display); color: var(--paper); font-weight: 400; }
.lm-roll-e span { font: 500 var(--fs-s)/1.4 var(--font-body); color: var(--kabut); }
.lm-roll-q { font: italic 400 var(--fs-l)/1.5 var(--font-body); color: var(--paper); opacity: 0.92; max-width: 28em; justify-self: center; }
.lm-roll-q cite { display: block; margin-top: 10px; font: 700 10px/1 var(--font-body); letter-spacing: 0.32em; text-transform: uppercase; color: var(--kabut); font-style: normal; }
.lm-skip { position: absolute; right: calc(env(safe-area-inset-right, 0px) + 22px); bottom: calc(env(safe-area-inset-bottom, 0px) + 18px); pointer-events: auto; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 999px; border: 1px solid rgba(239, 230, 210, 0.16); background: rgba(11, 15, 28, 0.55); color: var(--kabut); font: 600 var(--fs-xs)/1 var(--font-body) !important; letter-spacing: 0.2em; text-transform: uppercase; }
.lm-skip:hover { color: var(--paper); border-color: rgba(255, 181, 71, 0.5); }
.lm-skip-cap { font-size: 15px; letter-spacing: 0; text-transform: none; }
.lm-skip-cap:empty { display: none; }
.lm-skip .lk { margin: 0; }
.lm-end { position: absolute; inset: 0; display: grid; place-items: center; padding: calc(env(safe-area-inset-top, 0px) + 20px) var(--gutter) calc(env(safe-area-inset-bottom, 0px) + 64px); overflow-y: auto; }
.lm-end-in { width: min(760px, 100%); display: grid; justify-items: center; text-align: center; gap: 14px; }
.lm-end.show .lm-end-in > * { animation: lm-rise 1s var(--ease) both; }
.lm-end-k { font: 700 10px/1 var(--font-body); letter-spacing: 0.4em; margin-right: -0.4em; text-transform: uppercase; color: var(--lentera); }
.lm-end-t { margin: 0; font: 400 clamp(34px, 6vw, 62px)/1.05 var(--font-display); color: var(--paper); text-shadow: 0 0 40px rgba(255, 181, 71, 0.25); }
.lm-end-s { margin: 0 0 10px; font: 400 var(--fs-l)/1.5 var(--font-body); color: var(--paper); opacity: 0.85; max-width: 30em; }
.lm-end-grid { width: 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-flow: dense; gap: 12px; text-align: left; }
.lm-cr2 { gap: 8px; }
.lm-cr2-row { display: flex; align-items: baseline; gap: 10px; }
.lm-cr2-row span { font-size: 20px !important; }
.lm-cr2-row span.neg { color: var(--lentera); }
.lm-cr2-row span.pos { color: var(--kilau); }
.lm-cr2-row small { letter-spacing: 0.12em; }
.lm-end-grid .lm-stat { padding: 14px 16px; background: rgba(239, 230, 210, 0.045); }
.lm-end-grid .lm-stat span { font-size: 24px; }
.lm-end-grid .lm-stat.wide { grid-column: span 2; }
.lm-tiers { display: grid; gap: 7px; margin-top: 4px; }
.lm-tier { display: grid; grid-template-columns: 5.2em 1fr 2em; align-items: center; gap: 10px; }
.lm-tier-n { font: 700 10px/1 var(--font-body); letter-spacing: 0.2em; text-transform: uppercase; color: var(--kabut); }
.lm-tier .bar { height: 5px; border-radius: 4px; background: rgba(239, 230, 210, 0.08); overflow: hidden; }
.lm-tier .bar i { display: block; height: 100%; border-radius: 4px; background: var(--tc); box-shadow: 0 0 8px var(--tc); transform-origin: left; }
.lm-end.show .lm-tier .bar i { animation: lm-grow 1.4s var(--ease) 0.6s both; }
.lm-tier em { font: 500 13px/1 var(--font-mono); font-style: normal; color: var(--paper); text-align: right; letter-spacing: 0; }
.lm-end-note { font: 500 var(--fs-xs)/1.4 var(--font-body); letter-spacing: 0.06em; color: var(--kabut); }
.lm-end-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 8px; }
.lm-end-actions .lm-btn { width: auto; min-width: 220px; justify-content: center; box-shadow: inset 0 0 0 1px rgba(239, 230, 210, 0.14); }
.lm-end-actions .lm-btn.is-focus { box-shadow: inset 0 0 0 1px rgba(255, 181, 71, 0.6), 0 0 22px rgba(255, 181, 71, 0.16); }
.lm-end-actions .lm-btn.is-focus::before { display: none; }
@keyframes lm-grow { from { transform: scaleX(0); } }
@keyframes lm-fade { from { opacity: 0; } }

/* ---------- Small screens ---------- */
@media (max-width: 760px) {
  .lm-pause { grid-template-columns: minmax(0, 1fr); gap: 16px; align-content: start; }
  .lm-pause-t { margin: 6px 0 8px; font-size: 40px; }
  .lm-pause .lm-btn { min-height: 46px; font-size: var(--fs-m); }
  .lm-card { padding: 16px 16px 14px; gap: 14px; }
  .lm-card-obj { font-size: var(--fs-m); }
  .lm-host { place-items: start center; overflow-y: auto; padding-top: calc(env(safe-area-inset-top, 0px) + 20px); }
  .lm-host > .lm-panel { align-self: center; }
  .lm-ph { padding: 20px 18px 12px; }
  .lm-band { margin: 0 18px; }
  .lm-pb { padding: 8px 8px 10px; }
  .lm-pd { padding: 12px 18px 16px; }
  .lm-row, .lm-btn { padding: 10px 10px 10px 14px; gap: 10px; }
  .lm-sl-track { width: clamp(84px, 26vw, 150px); }
  .lm-sl { gap: 8px; }
  .lm-val { min-width: 2.8em; font-size: 12px; }
  .lm-cy-m { min-width: 5em; }
  .lm-end-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lm-end-grid .lm-stat.wide { grid-column: span 2; }
  .lm-legend { gap: 14px; }
}
@media (max-height: 560px) {
  .lm-title { padding-top: calc(env(safe-area-inset-top, 0px) + 5vh); }
  .lm-lamp { display: none; }
  .lm-logo { font-size: clamp(44px, 9vw, 90px); }
  .lm-ti { padding: 8px 40px; }
  .lm-tfoot { margin-top: 10px; }
}
.lm.touch .lm-legend { display: none; }
@media (max-width: 1000px) { .lm.title-on:not(.panel-open) .lm-legend { display: none; } }
.lm.touch .lm-host { padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 16px); }

@media (prefers-reduced-motion: reduce) {
  .lm.title-on .lm-logo span, .lm.title-on .lm-ti, .lm.title-on .lm-rule, .lm.title-on .lm-subt, .lm.title-on .lm-lamp, .lm.title-on .lm-tfoot,
  .lm-in, .lm-out, .lm-end.show .lm-end-in > *, .lm-end.show .lm-tier .bar i { animation-name: lm-fade !important; animation-duration: 0.3s !important; }
  .lm-lamp-fl { animation: none; }
  .lm-roll.run { animation: none; transform: translate(-50%, 6vh); }
}
`;
