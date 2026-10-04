// Cinematic layer: letterbox bars, intro title card, subtitles, centre banners (flame found,
// campfire lit, area names, fainting). Lives above #fade (z-index) so it reads over black.
// Owner: ui-audio.

import { h } from '../core/dom.js';
import { keycap, effectiveDevice } from './prompt-glyphs.js';

const SKIP_C = 2 * Math.PI * 9;

export function createCine(ctx) {
  const lbTop = h('div.lh-lb.top');
  const lbBot = h('div.lh-lb.bot');

  const tcTitle = h('div.lh-tc-title');
  const tcRule = h('div.lh-tc-rule', {}, [h('i')]);
  const tcSub = h('div.lh-tc-sub');
  const tcKick = h('div.lh-tc-kick');
  const card = h('div.lh-tc', { role: 'status', 'aria-live': 'polite' }, [tcKick, tcTitle, tcRule, tcSub]);

  const subSpeaker = h('div.lh-sub-who');
  const subText = h('div.lh-sub-txt');
  const sub = h('div.lh-sub', { 'aria-live': 'polite' }, [h('div.lh-sub-in', {}, [subSpeaker, subText])]);

  const banKick = h('div.lh-ban-kick');
  const banTitle = h('div.lh-ban-title');
  const banSub = h('div.lh-ban-sub');
  const banner = h('div.lh-ban', { role: 'status', 'aria-live': 'polite' }, [h('div.lh-ban-glow'), banKick, banTitle, h('div.lh-ban-rule'), banSub]);

  const areaName = h('div.lh-area-name');
  const area = h('div.lh-area', {}, [h('div.lh-area-rule.l'), areaName, h('div.lh-area-rule.r')]);

  // Hold-to-skip indicator for the intro (progress from intro:skipProgress).
  const skipRing = h('span.lh-skip-ring');
  skipRing.innerHTML = `<svg viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9" class="t"/><circle cx="11" cy="11" r="9" class="m" stroke-dasharray="${SKIP_C.toFixed(2)}" stroke-dashoffset="${SKIP_C.toFixed(2)}"/></svg>`;
  const skipMeter = skipRing.querySelector('.m');
  const skipCap = h('span.lh-skip-cap');
  const skipLabel = h('span.lh-skip-l', {}, 'Tahan untuk lewati');
  const skip = h('div.lh-skip', { role: 'button', 'aria-label': 'Tahan untuk melewati intro' }, [skipRing, skipCap, skipLabel]);
  // Touch users hold the indicator itself (setVirtualButton also marks the device as touch, so
  // only touch it when this element was actually pressed).
  let skipHeld = false;
  const release = () => {
    if (!skipHeld) return;
    skipHeld = false;
    try { ctx.input.setVirtualButton('confirm', false); } catch { /* ignore */ }
  };
  const press = (on) => (e) => {
    if (!on) { release(); return; }
    if (e.pointerType === 'mouse') return; // keyboard/mouse players hold the key instead
    e.preventDefault();
    skipHeld = true;
    try { ctx.input.setVirtualButton('confirm', true); } catch { /* ignore */ }
  };
  skip.addEventListener('pointerdown', press(true));
  skip.addEventListener('pointerup', press(false));
  skip.addEventListener('pointercancel', press(false));
  skip.addEventListener('pointerleave', press(false));

  const root = h('div.lh-cine', {}, [lbTop, lbBot, card, banner, area, sub, skip]);

  let lbOn = false;
  let cardT = 0, cardPhase = 'off';
  let subT = 0;
  let banT = 0;
  let areaT = 0;
  let skipT = 0, skipVal = 0, skipDevice = '';

  function letterbox(on) {
    on = !!on;
    if (on === lbOn) return;
    lbOn = on;
    root.classList.toggle('lb-on', on);
  }

  function titleCard({ title = 'LENTERA', subtitle = '', kicker = '', seconds = 4.2 } = {}) {
    tcTitle.textContent = '';
    const chars = [...String(title)];
    chars.forEach((ch, i) => {
      const s = h('span', {}, ch === ' ' ? ' ' : ch);
      s.style.animationDelay = `${0.12 + i * 0.07}s`;
      tcTitle.appendChild(s);
    });
    tcSub.textContent = subtitle || '';
    tcKick.textContent = kicker || '';
    tcSub.style.animationDelay = `${0.5 + chars.length * 0.07}s`;
    card.classList.remove('show', 'hide');
    void card.offsetWidth; // restart animations
    card.classList.add('show');
    cardPhase = 'hold';
    cardT = Math.max(1.5, seconds) + 0.6 + chars.length * 0.07;
  }

  function hideCard() {
    if (cardPhase === 'off') return;
    cardPhase = 'out';
    card.classList.add('hide');
    cardT = 1.6;
  }

  function subtitle({ speaker = '', text = '', seconds } = {}) {
    if (!text) { sub.classList.remove('show'); subT = 0; return; }
    subSpeaker.textContent = speaker || '';
    subSpeaker.hidden = !speaker;
    subText.textContent = text;
    sub.classList.remove('show');
    void sub.offsetWidth;
    sub.classList.add('show');
    subT = seconds ?? Math.min(9, Math.max(2.6, text.length * 0.065));
  }

  function showBanner({ kicker = '', title = '', sub: subLine = '', color = '', seconds = 3.6, persist = false } = {}) {
    banKick.textContent = kicker;
    banTitle.textContent = title;
    banSub.textContent = subLine;
    banSub.hidden = !subLine;
    banner.style.setProperty('--bc', color || 'var(--lentera)');
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    banT = persist ? Infinity : seconds;
  }
  function hideBanner() { banT = 0; banner.classList.remove('show'); }

  function showArea(name) {
    areaName.textContent = name;
    area.classList.remove('show');
    void area.offsetWidth;
    area.classList.add('show');
    areaT = 3.4;
  }

  function skipShow(seconds = 5) {
    skipT = Math.max(skipT, seconds);
    skip.classList.add('show');
  }
  function skipProgress(v) {
    skipVal = Math.max(0, Math.min(1, v || 0));
    skipMeter.setAttribute('stroke-dashoffset', (SKIP_C * (1 - skipVal)).toFixed(2));
    if (skipVal > 0) skipShow(2);
  }
  function skipHide() { skipT = 0; skipVal = 0; skip.classList.remove('show'); release(); }

  return {
    root,
    skipShow,
    skipProgress,
    skipHide,
    letterbox,
    get letterboxOn() { return lbOn; },
    titleCard,
    hideCard,
    subtitle,
    banner: showBanner,
    hideBanner,
    area: showArea,
    update(dt) {
      if (cardPhase !== 'off') {
        cardT -= dt;
        if (cardT <= 0) {
          if (cardPhase === 'hold') hideCard();
          else { cardPhase = 'off'; card.classList.remove('show', 'hide'); }
        }
      }
      if (subT > 0) { subT -= dt; if (subT <= 0) sub.classList.remove('show'); }
      if (banT > 0 && banT !== Infinity) { banT -= dt; if (banT <= 0) banner.classList.remove('show'); }
      if (areaT > 0) { areaT -= dt; if (areaT <= 0) area.classList.remove('show'); }
      if (skipT > 0) {
        const dev = effectiveDevice(ctx);
        if (dev !== skipDevice) {
          skipDevice = dev;
          skipCap.textContent = '';
          if (dev !== 'touch') skipCap.appendChild(keycap('confirm', dev));
          skipLabel.textContent = dev === 'touch' ? 'Tahan di sini untuk lewati' : 'Tahan untuk lewati';
        }
        if (skipVal <= 0) { skipT -= dt; if (skipT <= 0) skip.classList.remove('show'); }
      }
    },
  };
}

export const CINE_CSS = `
.lh-cine { position: absolute; inset: 0; z-index: 5; pointer-events: none; }
.lh-lb {
  position: absolute; left: 0; right: 0; height: min(11vh, 110px); background: #05070d;
  transition: transform 0.9s var(--ease); will-change: transform;
}
.lh-lb.top { top: 0; transform: translateY(-101%); box-shadow: 0 0 40px 10px rgba(5, 7, 13, 0.5); }
.lh-lb.bot { bottom: 0; transform: translateY(101%); box-shadow: 0 0 40px 10px rgba(5, 7, 13, 0.5); }
.lh-cine.lb-on .lh-lb { transform: translateY(0); }

.lh-tc {
  position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%);
  width: min(92vw, 1100px); text-align: center; opacity: 0; display: grid; justify-items: center; gap: 14px;
}
.lh-tc.show { opacity: 1; }
.lh-tc.hide { opacity: 0; transition: opacity 1.5s var(--ease); }
.lh-tc-kick { font: 600 var(--fs-xs)/1 var(--font-body); letter-spacing: 0.42em; text-transform: uppercase; color: var(--lentera); }
.lh-tc-kick:empty { display: none; }
.lh-tc-title {
  font: 400 clamp(52px, 12vw, 150px)/0.95 var(--font-display); letter-spacing: 0.12em; margin-right: -0.12em;
  color: var(--paper); white-space: nowrap;
  text-shadow: 0 0 40px rgba(255, 181, 71, 0.28), 0 4px 30px rgba(5, 8, 16, 0.7);
}
.lh-tc-title span { display: inline-block; opacity: 0; }
.lh-tc.show .lh-tc-title span { animation: lh-letter 1.4s var(--ease) both; }
.lh-tc-rule { position: relative; width: min(420px, 60vw); height: 1px; background: linear-gradient(90deg, transparent, rgba(255, 181, 71, 0.75), transparent); transform: scaleX(0); }
.lh-tc-rule i { position: absolute; left: 50%; top: 50%; width: 7px; height: 7px; background: var(--lentera); transform: translate(-50%, -50%) rotate(45deg); box-shadow: 0 0 12px var(--lentera); }
.lh-tc.show .lh-tc-rule { animation: lh-rule 1.6s var(--ease) 0.4s both; }
.lh-tc-sub {
  font: 500 clamp(13px, 1.6vw, 19px)/1.3 var(--font-body); letter-spacing: 0.42em; margin-right: -0.42em; text-transform: uppercase;
  color: var(--kabut); text-shadow: 0 1px 3px rgba(5, 8, 16, 0.8), 0 0 18px rgba(5, 8, 16, 0.6); opacity: 0;
}
.lh-tc.show .lh-tc-sub { animation: lh-fade-up 1.4s var(--ease) both; }
@keyframes lh-letter {
  0% { opacity: 0; filter: blur(10px); transform: translateY(0.12em) scale(1.06); }
  100% { opacity: 1; filter: blur(0); transform: none; }
}
@keyframes lh-rule { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
@keyframes lh-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.lh-sub {
  position: absolute; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 9vh); transform: translate(-50%, 6px);
  width: min(860px, calc(100vw - 32px)); display: flex; justify-content: center; opacity: 0;
  transition: opacity 0.35s var(--ease), transform 0.35s var(--ease), bottom 0.9s var(--ease);
}
.lh-cine.lb-on .lh-sub { bottom: calc(min(11vh, 110px) + 14px); }
.lh-sub.show { opacity: 1; transform: translate(-50%, 0); }
.lh-sub-in {
  text-align: center; padding: 10px 20px 12px; border-radius: 12px;
  background: radial-gradient(120% 140% at 50% 50%, rgba(8, 11, 22, 0.62), rgba(8, 11, 22, 0.32));
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
}
.lh-sub-who { font: 700 var(--fs-xs)/1 var(--font-body); letter-spacing: 0.24em; text-transform: uppercase; color: var(--lentera); margin-bottom: 6px; }
.lh-sub-txt { font: 500 clamp(16px, 1.25rem, 21px)/1.4 var(--font-body); color: var(--paper); text-shadow: 0 1px 2px rgba(5, 8, 16, 0.85); text-wrap: balance; }

.lh-ban {
  --bc: var(--lentera);
  position: absolute; left: 50%; top: 30%; transform: translate(-50%, -50%); width: min(720px, calc(100vw - 32px));
  display: grid; justify-items: center; gap: 8px; text-align: center; opacity: 0; transition: opacity 0.9s var(--ease);
}
.lh-ban.show { opacity: 1; transition-duration: 0.5s; }
.lh-ban-glow { position: absolute; inset: -40px -10%; z-index: -1; background: radial-gradient(closest-side, rgba(8, 11, 22, 0.58), rgba(8, 11, 22, 0)); }
.lh-ban-kick { font: 700 var(--fs-xs)/1 var(--font-body); letter-spacing: 0.38em; margin-right: -0.38em; text-transform: uppercase; color: var(--bc); text-shadow: 0 1px 2px rgba(5, 8, 16, 0.9); }
.lh-ban-title {
  font: 400 clamp(34px, 6vw, 64px)/1.05 var(--font-display); color: var(--paper); letter-spacing: 0.02em;
  text-shadow: 0 0 28px var(--bc), 0 2px 18px rgba(5, 8, 16, 0.8);
}
.lh-ban.show .lh-ban-title { animation: lh-ban-in 0.9s var(--ease) both; }
.lh-ban-rule { width: 160px; height: 1px; background: linear-gradient(90deg, transparent, var(--bc), transparent); }
.lh-ban-sub { font: 500 var(--fs-m)/1.4 var(--font-body); color: var(--paper); opacity: 0.9; text-shadow: 0 1px 3px rgba(5, 8, 16, 0.9); max-width: 34em; }
@keyframes lh-ban-in { from { opacity: 0; letter-spacing: 0.16em; filter: blur(6px); } to { opacity: 1; letter-spacing: 0.02em; filter: blur(0); } }

.lh-area {
  position: absolute; left: 50%; top: 21%; transform: translateX(-50%); display: flex; align-items: center; gap: 16px;
  opacity: 0; transition: opacity 1.2s var(--ease); white-space: nowrap;
}
.lh-area.show { opacity: 1; transition-duration: 0.8s; }
.lh-area-name {
  font: 400 clamp(24px, 3.2vw, 36px)/1 var(--font-display); color: var(--paper); letter-spacing: 0.08em;
  text-shadow: 0 2px 16px rgba(5, 8, 16, 0.85), 0 0 2px rgba(5, 8, 16, 0.9);
}
.lh-area-rule { width: clamp(28px, 6vw, 70px); height: 1px; background: rgba(239, 230, 210, 0.6); box-shadow: 0 1px 3px rgba(5, 8, 16, 0.8); }
.lh-area-rule.l { background: linear-gradient(90deg, transparent, rgba(239, 230, 210, 0.7)); }
.lh-area-rule.r { background: linear-gradient(90deg, rgba(239, 230, 210, 0.7), transparent); }

.lh-skip {
  position: absolute; right: calc(env(safe-area-inset-right, 0px) + 22px); bottom: calc(min(11vh, 110px) / 2); transform: translateY(50%);
  display: flex; align-items: center; gap: 9px; padding: 7px 12px; border-radius: 999px; pointer-events: none;
  font: 600 var(--fs-xs)/1 var(--font-body); letter-spacing: 0.16em; text-transform: uppercase; color: var(--kabut);
  opacity: 0; transition: opacity 0.5s var(--ease);
}
.lh-skip.show { opacity: 0.9; pointer-events: auto; }
.lh-skip-cap { font-size: 15px; letter-spacing: 0; text-transform: none; }
.lh-skip-cap:empty { display: none; }
.lh-skip-ring { width: 22px; height: 22px; }
.lh-skip-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.lh-skip-ring .t { fill: none; stroke: rgba(239, 230, 210, 0.18); stroke-width: 2; }
.lh-skip-ring .m { fill: none; stroke: var(--lentera); stroke-width: 2.4; stroke-linecap: round; filter: drop-shadow(0 0 3px rgba(255, 181, 71, 0.8)); }
@media (prefers-reduced-motion: reduce) {
  .lh-tc.show .lh-tc-title span, .lh-tc.show .lh-tc-sub, .lh-tc.show .lh-tc-rule, .lh-ban.show .lh-ban-title { animation-name: lh-fade-only; }
  .lh-lb { transition: none; }
}
@keyframes lh-fade-only { from { opacity: 0; } to { opacity: 1; transform: none; filter: none; } }
`;
