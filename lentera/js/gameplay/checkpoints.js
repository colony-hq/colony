// Checkpoints (owner: gameplay): the three api unggun. Unlit = smouldering embers; lighting one
// makes a permanent kabut clearing (radius 38) with an eased expansion + ground ring; resting
// refills Nyala and saves; Nyala 0 → pingsan → respawn at lastCheckpoint. API: DESIGN.md §7.
//
// createCheckpoints(ctx) → { light(id), rest(id), respawn(), isLit(id), fires, update }

import { CHECKPOINTS } from '../world/heightfield.js';
import { campfirePoint, campfireSpawn } from './places.js';
import { easeOutCubic } from '../core/math.js';

const CLEAR_RADIUS = 38;

export function createCheckpoints(ctx) {
  const { events, state, interact } = ctx;
  const flames = ctx.flames;
  const fx = flames.fx;
  const prog = () => state.progress;

  const camps = {};
  for (const cp of CHECKPOINTS) {
    const base = campfirePoint(ctx, cp.id);
    const fire = flames.createFire({
      position: base, scale: 1.1, tongues: 3, light: true, lightIntensity: 24, lightDistance: 15, priority: 1,
      intensity: 0.07, glowScale: 1.2, discStrength: 0.38, haloStrength: 0.3, emberRise: 3.4,
    });
    camps[cp.id] = { ...cp, base, fire, lit: false, busy: false, anim: null };
    interact.add({
      id: 'cp:' + cp.id,
      getPosition: () => ({ x: base.x, y: base.y + 1.0, z: base.z }),
      radius: 3.2,
      priority: 0.8,
      label: () => (camps[cp.id].lit ? 'Istirahat' : 'Nyalakan api unggun'),
      enabled: () => {
        const c = camps[cp.id];
        if (c.busy || busy) return false;
        if (!c.lit && cp.id === 'kampung' && prog().quest === 'arrive') return false; // talk to Sarni first
        return true;
      },
      onInteract: () => (camps[cp.id].lit ? rest(cp.id) : light(cp.id)),
    });
  }

  let busy = false; // rest / faint sequence running
  let fainting = false;

  function isLit(id) { return !!camps[id]?.lit; }

  function setLitVisual(id, instant) {
    const c = camps[id];
    c.lit = true;
    if (instant) {
      c.fire.setIntensity(1, true);
      ctx.fog?.setClearing?.('cp:' + id, c.base.x, c.base.z, CLEAR_RADIUS, 1, true);
    }
  }

  function setUnlitVisual(id) {
    const c = camps[id];
    c.lit = false;
    c.anim?.cancel?.();
    c.fire.setIntensity(0.07, true);
    ctx.fog?.removeClearing?.('cp:' + id);
  }

  // Light a campfire: ignition + clearing expansion + ring + bloom; progress + save.
  function light(id) {
    const c = camps[id];
    if (!c || c.lit) return false;
    setLitVisual(id, false);
    const p = prog();
    p.checkpoints[id] = true;
    p.lastCheckpoint = id;
    const b = c.base;
    // Fire: catch → overshoot → settle.
    c.fire.setIntensity(0.25, true);
    c.anim = fx.tween(1.8, (k) => {
      const v = k < 0.3 ? 0.25 + (k / 0.3) * 1.55 : 1.8 - 0.8 * easeOutCubic((k - 0.3) / 0.7);
      c.fire.setIntensity(v, true);
    }, () => c.fire.setIntensity(1));
    // Kabut rolls back: drive the clearing radius ourselves (slight overshoot).
    fx.tween(3.4, (k) => {
      const e = easeOutCubic(k);
      const over = Math.sin(Math.min(1, k * 1.25) * Math.PI) * 0.07;
      ctx.fog?.setClearing?.('cp:' + id, b.x, b.z, Math.max(0.5, CLEAR_RADIUS * (e + over)), 1, true);
    }, () => ctx.fog?.setClearing?.('cp:' + id, b.x, b.z, CLEAR_RADIUS, 1, true));
    fx.burst({ x: b.x, y: b.y + 0.4, z: b.z, count: 90, color: 0xffa040, speed: 4.5, up: 2.2, life: 1.6, size: 0.16, gravity: 1.5, drag: 1.2, radius: 0.4 });
    fx.ring({ x: b.x, y: b.y, z: b.z, radius: CLEAR_RADIUS, duration: 2.8, color: 0xffb060, width: 2.4, fill: 0.05, intensity: 1.6 });
    fx.after(0.25, () => fx.ring({ x: b.x, y: b.y, z: b.z, radius: 12, duration: 1.2, color: 0xffd090, width: 0.6, intensity: 2 }));
    fx.flash({ x: b.x, y: b.y + 1.2, z: b.z }, 0xffa048, 90, 1.4, 24);
    fx.bloomPulse(1.3, 1.8);
    fx.shake(0.3, 0.45);
    state.addNyala(100, 'campfire');
    events.emit('checkpoint:light', { id });
    events.emit('checkpoint:ignite', { id });
    state.save();
    return true;
  }

  // Rest at a lit campfire: short fade, Nyala full, save.
  function rest(id) {
    const c = camps[id];
    if (!c || !c.lit || busy || state.mode !== 'play') return false;
    busy = true;
    const my = ++token;
    state.setMode('cinematic');
    ctx.player?.setControl?.(false);
    ctx.player?.faceToward?.(c.base.x, c.base.z);
    fx.fade(true, 0.55);
    fx.after(0.75, () => {
      if (my !== token) return;
      const p = prog();
      state.addNyala(100, 'rest');
      p.lastCheckpoint = id;
      events.emit('checkpoint:rest', { id });
      state.save();
      c.fire.setIntensity(1.35);
      fx.after(0.6, () => c.fire.setIntensity(1));
    });
    fx.after(1.35, () => { if (my === token) fx.fade(false, 0.8); });
    fx.after(1.7, () => {
      if (my !== token) return;
      busy = false;
      if (state.mode === 'cinematic') state.setMode('play');
      ctx.player?.setControl?.(true);
      events.emit('toast', { text: 'Kamu istirahat sebentar. Lentera penuh, perjalanan tersimpan.', kind: 'info' });
    });
    return true;
  }

  // Put the player next to lastCheckpoint (no fades): used by respawn and "continue".
  function placeAtCheckpoint(id = prog().lastCheckpoint) {
    const s = campfireSpawn(ctx, id);
    ctx.player?.teleport?.(s.x, s.y, s.z, s.yaw);
    ctx.cameraRig?.snapBehindPlayer?.();
    return s;
  }

  function respawn() {
    const p = prog();
    const id = camps[p.lastCheckpoint] ? p.lastCheckpoint : 'kampung';
    placeAtCheckpoint(id);
    state.addNyala(60 - p.nyala, 'respawn');
    return id;
  }

  let token = 0; // invalidates pending rest/faint callbacks (quit, new game, load)
  function faint() {
    if (fainting || busy) return;
    const my = ++token;
    const mode = state.mode;
    if (mode !== 'play' && mode !== 'dialogue') return;
    const step = prog().quest;
    if (step === 'finale' || step === 'done') return;
    fainting = busy = true;
    const cpId = prog().lastCheckpoint;
    if (mode === 'dialogue') ctx.dialogue?.close?.();
    state.setMode('cinematic');
    ctx.player?.setControl?.(false);
    events.emit('player:faint', { checkpoint: cpId });
    fx.shake(0.35, 0.8);
    fx.fade(true, 1.3);
    fx.after(1.7, () => {
      if (my !== token) return;
      prog().deaths = (prog().deaths || 0) + 1;
      const id = respawn();
      ctx.spirits?.banishAll?.(false);
      state.save();
      fx.after(0.4, () => {
        if (my !== token) return;
        fx.fade(false, 1.2);
        if (state.mode === 'cinematic') state.setMode('play');
        ctx.player?.setControl?.(true);
        fainting = busy = false;
        events.emit('player:respawn', { checkpoint: id });
      });
    });
  }

  events.on('nyala:change', ({ value }) => { if (value <= 0) faint(); });

  events.on('game:quit', () => {
    token++;
    busy = fainting = false;
    fx.fade(false, 0);
  });

  function restore() {
    const p = prog();
    token++;
    busy = fainting = false;
    for (const cp of CHECKPOINTS) {
      if (p.checkpoints[cp.id]) setLitVisual(cp.id, true);
      else setUnlitVisual(cp.id);
    }
  }
  events.on('game:loaded', restore);
  events.on('game:reset', restore);
  restore();

  let arriveHintShown = false;
  function update(dt, t) {
    if (dt <= 0) return;
    // Trying the kampung fire before meeting Sarni: point the player to her once.
    if (!arriveHintShown && prog().quest === 'arrive' && state.mode === 'play' && ctx.player) {
      const k = camps.kampung, pp = ctx.player.position;
      if (Math.hypot(pp.x - k.base.x, pp.z - k.base.z) < 3.5) {
        arriveHintShown = true;
        events.emit('hint', { text: 'Apinya nanti dulu. Sapa Mbah Sarni yang duduk di dekat api.', seconds: 4 });
      }
    }
    // Lazy smoke + crackle sparks from lit fires near the camera; unlit pits breathe a little.
    const cam = ctx.camera.position;
    for (const id in camps) {
      const c = camps[id];
      const d2 = (c.base.x - cam.x) ** 2 + (c.base.z - cam.z) ** 2;
      if (d2 > 70 * 70) continue;
      if (c.lit) {
        if (Math.random() < dt * 2.2) fx.smoke({ x: c.base.x, y: c.base.y + 1.6, z: c.base.z, count: 1, color: 0x4b4650, alpha: 0.32, size: 0.9, speed: 0.25, up: 1.3, life: 3.2, buoyancy: 0.2, grow: 3 });
        if (Math.random() < dt * 1.4) fx.burst({ x: c.base.x, y: c.base.y + 0.5, z: c.base.z, count: 4, noScale: true, color: 0xffb050, speed: 2.4, up: 2.5, life: 0.9, size: 0.07, gravity: 2.5, drag: 0.6, radius: 0.3 });
      } else {
        const breathe = 0.06 + 0.03 * Math.sin(t * 0.9 + c.x);
        c.fire.setIntensity(breathe);
      }
    }
  }

  return { light, rest, respawn, faint, isLit, placeAtCheckpoint, camps, restore, update };
}
