// Flames (owner: gameplay). Shared fire VFX (createFire), the three Api Pusaka orbs, the
// mercusuar tungku sockets and the candi pelita puzzle + relief. API: DESIGN.md §7 Flames.
//
// createFlames(ctx) → { createFire(opts) → {object, setIntensity, dispose, …}, fx, fireSystem,
//   collect(id), place(id), lightPelita(id), carriedCount(), placedCount(), travel(…), update }

import * as THREE from 'three';
import { createFx } from './fx.js';
import { createFireSystem } from './fire-vfx.js';
import {
  FLAME_IDS, FLAME_INFO, PELITA_ORDER, flameAnchor, socketPoint, pelitaPoint, reliefPoint,
  candiDoorPoint,
} from './places.js';
import { patchMaterial } from '../world/fog.js';
import { LANDMARKS } from '../world/heightfield.js';
import { miniCinematic, currentCameraKey, emitSubtitle } from './director.js';

const PELITA_LABEL = { utara: 'utara', timur: 'timur', selatan: 'selatan', barat: 'barat' };

export function createFlames(ctx) {
  const { scene, events, state, interact } = ctx;
  const fx = createFx(ctx);
  const fireSystem = createFireSystem(ctx, fx);
  const createFire = fireSystem.createFire;
  const prog = () => state.progress;

  // ------------------------------------------------------------------ transfer motes
  // A small flame that flies along an arc from `from` to a (possibly moving) target.
  function travel(from, toFn, color, duration = 0.8, onArrive, { arc = 2.2, scale = 0.32 } = {}) {
    const start = new THREE.Vector3().copy(from);
    const mote = createFire({ position: start, scale, color, light: false, glow: false, haloScale: 1.4, haloStrength: 0.7, embers: false });
    const mid = new THREE.Vector3();
    const end = new THREE.Vector3();
    let trailAcc = 0;
    let lastT = 0;
    fx.tween(duration, (k) => {
      end.copy(toFn());
      mid.copy(start).lerp(end, 0.5);
      mid.y += arc;
      const e = k * k * (3 - 2 * k);
      const a = 1 - e;
      mote.object.position.set(
        a * a * start.x + 2 * a * e * mid.x + e * e * end.x,
        a * a * start.y + 2 * a * e * mid.y + e * e * end.y,
        a * a * start.z + 2 * a * e * mid.z + e * e * end.z,
      );
      const dt = Math.max(0, k - lastT) * duration;
      lastT = k;
      trailAcc += dt * 70 * fx.particleScale;
      while (trailAcc > 1) {
        trailAcc -= 1;
        const p = mote.object.position;
        fx.spark({ x: p.x + (Math.random() - 0.5) * 0.12, y: p.y + (Math.random() - 0.5) * 0.12, z: p.z + (Math.random() - 0.5) * 0.12, vx: (Math.random() - 0.5) * 0.4, vy: 0.3 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.4, color, life: 0.6, size: 0.1, drag: 2 });
      }
    }, () => {
      const p = mote.object.position.clone();
      mote.dispose();
      onArrive?.(p);
    });
  }

  function lanternPos() {
    const p = ctx.player;
    if (!p) return new THREE.Vector3();
    if (p.lanternWorld && p.lanternWorld.lengthSq() > 0) return p.lanternWorld;
    return new THREE.Vector3(p.position.x, p.position.y + 1.1, p.position.z);
  }

  // ------------------------------------------------------------------ Api Pusaka orbs
  const coreGeo = new THREE.IcosahedronGeometry(0.11, 2);
  const orbs = {};
  for (const id of FLAME_IDS) {
    const info = FLAME_INFO[id];
    const center = flameAnchor(ctx, id);
    const color = new THREE.Color(info.color);
    const fire = createFire({
      position: center.clone().add(new THREE.Vector3(0, -0.34, 0)),
      scale: 0.9, color: info.color, light: true, lightIntensity: 20, lightDistance: 11,
      priority: 1.35, glow: false, haloScale: 1.9, haloStrength: 0.55, emberRise: 2.0,
    });
    const coreMat = patchMaterial(new THREE.MeshBasicMaterial({
      color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar(1.15),
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.copy(center);
    core.renderOrder = 8;
    scene.add(core);
    const motes = [0, 1, 2].map((i) => fireSystem.addGlow({ position: center, radius: 0.16, intensity: 1.6, color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.3), mode: 'halo' }));
    const glowBig = fireSystem.addGlow({ position: center, radius: 3.4, intensity: 0.16, color, mode: 'halo' });
    orbs[id] = { id, info, center, color, fire, core, motes, glowBig, visible: true, collecting: false, phase: Math.random() * 6 };
  }

  function setOrbVisible(o, v) {
    o.visible = v;
    o.fire.setVisible(v);
    o.core.visible = v;
    for (const m of o.motes) { m.visible = v; m.update(); }
    o.glowBig.visible = v;
    o.glowBig.update();
  }

  function carriedCount() { return FLAME_IDS.filter((id) => prog().flames[id] === 'carried').length; }
  function placedCount() { return FLAME_IDS.filter((id) => prog().flames[id] === 'placed').length; }
  function foundCount() { return FLAME_IDS.filter((id) => prog().flames[id] !== 'none').length; }

  function collect(id) {
    const o = orbs[id];
    if (!o || prog().flames[id] !== 'none' || o.collecting) return false;
    o.collecting = true;
    prog().flames[id] = 'carried';
    const p = o.center;
    // Big feedback: flare up, burst, ring, bloom, shake, then the flame flies into the lantern.
    o.fire.setIntensity(2.2);
    fx.bloomPulse(1.6, 1.4);
    fx.shake(0.4, 0.45);
    fx.burst({ x: p.x, y: p.y, z: p.z, count: 70, color: o.info.color, speed: 5, sphere: true, life: 1.3, size: 0.2, drag: 2.2, gravity: -0.6 });
    fx.shell({ x: p.x, y: p.y, z: p.z, radius: 4.5, duration: 0.8, color: o.info.color, intensity: 1.4, power: 2.6 });
    fx.flash(p, o.info.light, 70, 0.9, 20);
    events.emit('flame:collect', { flameId: id, carried: carriedCount(), placed: placedCount(), found: foundCount() });
    state.addNyala(100, 'flame');
    state.save();
    fx.after(0.35, () => {
      setOrbVisible(o, false);
      travel(p, lanternPos, o.info.color, 0.75, (q) => {
        fx.burst({ x: q.x, y: q.y, z: q.z, count: 30, color: o.info.color, speed: 2.5, sphere: true, life: 0.8, size: 0.14 });
        fx.flash(q, o.info.light, 30, 0.6, 12);
        fx.bloomPulse(0.6, 0.6);
        o.collecting = false;
        o.fire.setIntensity(1, true);
      }, { arc: 1.6, scale: 0.4 });
    });
    return true;
  }

  for (const id of FLAME_IDS) {
    const o = orbs[id];
    interact.add({
      id: 'flame:' + id,
      getPosition: () => o.center,
      radius: 2.9,
      priority: 1,
      label: `Ambil ${o.info.name}`,
      enabled: () => o.visible && !o.collecting && prog().flames[id] === 'none'
        && (id !== 'bumi' || state.flag('candi_open')),
      onInteract: () => collect(id),
    });
  }

  // ------------------------------------------------------------------ mercusuar sockets
  const sockets = {};
  for (const id of FLAME_IDS) {
    const info = FLAME_INFO[id];
    const point = socketPoint(ctx, id);
    // A faint cold shimmer above the empty tungku so it reads as "something goes here".
    const hint = fireSystem.addGlow({ position: point.clone().add(new THREE.Vector3(0, 0.25, 0)), radius: 0.7, intensity: 0, color: info.color, mode: 'halo' });
    sockets[id] = { id, info, point, fire: null, hint };
    interact.add({
      id: 'socket:' + id,
      getPosition: () => point,
      radius: 3.0,
      priority: 1,
      label: `Taruh ${info.name}`,
      enabled: () => prog().flames[id] === 'carried' && !sockets[id].busy,
      onInteract: () => place(id),
    });
  }

  function igniteSocket(id, instant = false) {
    const s = sockets[id];
    if (!s.fire) {
      s.fire = createFire({ position: s.point, scale: 1.05, color: s.info.color, light: true, lightIntensity: 28, priority: 1.2, intensity: instant ? 1 : 0, instant: !!instant, emberRise: 3.0 });
    }
    if (!instant) {
      s.fire.setIntensity(0, true);
      fx.tween(1.6, (k) => s.fire.setIntensity(k < 0.35 ? (k / 0.35) * 1.9 : 1.9 - 0.9 * ((k - 0.35) / 0.65)), () => s.fire.setIntensity(1));
    }
    try { ctx.structures?.sockets?.[id]?.setLit?.(true); } catch (err) { console.warn(err); }
    s.hint.intensity = 0;
    s.hint.update();
  }

  function updateBeaconGlow(instant = false) {
    const n = placedCount();
    const M = LANDMARKS.mercusuar;
    if (n > 0 && !prog().finished) ctx.fog?.setClearing?.('mercusuar', M.x, M.z, 8 + n * 7, 1, instant);
    else ctx.fog?.removeClearing?.('mercusuar');
    if (!prog().finished) {
      try { ctx.structures?.lighthouse?.setLampGlow?.(n * 0.1); } catch (err) { console.warn(err); }
      const b = ctx.structures?.lighthouse?.beams;
      if (b) b.visible = false;
    }
  }

  function place(id) {
    const s = sockets[id];
    if (!s || prog().flames[id] !== 'carried' || s.busy) return false;
    s.busy = true;
    prog().flames[id] = 'placed';
    state.save();
    const from = lanternPos().clone();
    travel(from, () => s.point, s.info.color, 0.9, () => {
      s.busy = false;
      igniteSocket(id);
      const p = s.point;
      fx.burst({ x: p.x, y: p.y + 0.3, z: p.z, count: 80, color: s.info.color, speed: 5.5, up: 1.6, life: 1.4, size: 0.2, gravity: 1.2, drag: 1.6 });
      fx.shell({ x: p.x, y: p.y + 0.5, z: p.z, radius: 5.5, duration: 0.9, color: s.info.color, intensity: 1.4, power: 2.6 });
      fx.flash(p, s.info.light, 80, 1.1, 22);
      fx.bloomPulse(1.5, 1.5);
      fx.shake(0.45, 0.5);
      updateBeaconGlow();
      const n = placedCount();
      events.emit('flame:place', { flameId: id, placed: n, carried: carriedCount() });
      if (n >= 3) {
        fx.after(2.2, () => ctx.finale?.start?.());
      }
    }, { arc: 2.6, scale: 0.42 });
    return true;
  }

  // ------------------------------------------------------------------ candi pelita puzzle
  const pelita = {};
  let pelitaBusy = false;
  for (const id of PELITA_ORDER) {
    const point = pelitaPoint(ctx, id);
    // Dormant wick: a tiny cold glint so the four lamps read in the dark.
    const glint = fireSystem.addGlow({ position: point.clone().add(new THREE.Vector3(0, 0.05, 0)), radius: 0.28, intensity: 0.5, color: 0x9fb0d8, mode: 'halo' });
    pelita[id] = { id, point, fire: null, lit: false, glint };
    interact.add({
      id: 'pelita:' + id,
      getPosition: () => point,
      radius: 2.6,
      priority: 0.5,
      label: `Nyalakan pelita ${PELITA_LABEL[id]}`,
      enabled: () => !pelitaBusy && !pelita[id].lit && !state.flag('candi_open'),
      onInteract: () => lightPelita(id),
    });
  }

  function setPelitaLit(id, on, instant = false) {
    const pl = pelita[id];
    pl.lit = on;
    if (on) {
      if (!pl.fire) pl.fire = createFire({ position: pl.point, scale: 0.34, light: true, lightIntensity: 9, lightDistance: 8, priority: 0.45, intensity: instant ? 1 : 0, instant: !!instant, glowScale: 1.6, discStrength: 0.4, emberRise: 1.6 });
      pl.fire.setIntensity(1, instant);
      pl.glint.intensity = 0;
    } else {
      if (pl.fire) {
        const f = pl.fire;
        pl.fire = null;
        if (instant) f.dispose();
        else { f.setIntensity(0); fx.after(0.8, () => f.dispose()); }
      }
      pl.glint.intensity = 0.5;
    }
    pl.glint.update();
    try { ctx.structures?.pelita?.[id]?.setLit?.(on); } catch (err) { console.warn(err); }
  }

  function lightPelita(id) {
    if (pelitaBusy || pelita[id].lit || state.flag('candi_open')) return false;
    const seq = prog().pelita = [...(prog().pelita || []).filter((q) => pelita[q]?.lit), id];
    setPelitaLit(id, true);
    const p = pelita[id].point;
    fx.burst({ x: p.x, y: p.y + 0.1, z: p.z, count: 18, color: 0xffb860, speed: 1.6, up: 1.5, life: 0.8, size: 0.1 });
    fx.flash(p, 0xffa050, 18, 0.5, 10);
    const correct = seq.every((q, i) => q === PELITA_ORDER[i]);
    events.emit('pelita:light', { id, correct, count: seq.length });
    if (!correct) {
      pelitaBusy = true;
      fx.after(0.9, () => {
        for (const q of PELITA_ORDER) {
          if (!pelita[q].lit) continue;
          const pt = pelita[q].point;
          fx.smoke({ x: pt.x, y: pt.y + 0.15, z: pt.z, count: 10, color: 0x77727e, alpha: 0.55, size: 0.5, up: 1.1, life: 1.8 });
          fx.burst({ x: pt.x, y: pt.y + 0.1, z: pt.z, count: 8, color: 0xff7a3a, speed: 1.2, life: 0.5, size: 0.08, gravity: 3 });
          setPelitaLit(q, false);
        }
        prog().pelita = [];
        pelitaBusy = false;
        fx.shake(0.18, 0.4);
        events.emit('pelita:fail', {});
        events.emit('toast', { text: 'Wus… keempat pelita padam lagi. Urutannya salah, kayaknya.', kind: 'warn' });
        if (!state.flag('read_relief')) events.emit('hint', { text: 'Coba baca relief di sisi barat daya candi.', seconds: 5 });
      });
    } else if (seq.length === PELITA_ORDER.length) {
      fx.after(0.7, () => openCandi());
    } else {
      events.emit('toast', { text: `Pelita ${PELITA_LABEL[id]} menyala (${seq.length}/4)`, kind: 'info' });
    }
    return true;
  }

  function openCandi(instant = false) {
    state.flag('candi_open', true);
    try { ctx.structures?.setCandiDoor?.(true); } catch (err) { console.warn(err); }
    if (instant) return;
    prog().pelita = [...PELITA_ORDER];
    state.save();
    const door = candiDoorPoint(ctx);
    events.emit('candi:open', {});
    fx.shake(0.55, 1.6);
    fx.bloomPulse(1.0, 1.6);
    for (let i = 0; i < 6; i++) {
      fx.after(i * 0.25, () => fx.smoke({ x: door.x + (Math.random() - 0.5) * 2.4, y: door.y - 1.2, z: door.z + 0.6, count: 8, color: 0x9a8a76, alpha: 0.5, size: 0.9, speed: 1.2, up: 0.6, life: 2.4 }));
    }
    // A warm breath from inside the chamber.
    const bumi = orbs.bumi;
    fx.after(0.8, () => fx.burst({ x: door.x, y: door.y, z: door.z + 0.5, count: 40, color: FLAME_INFO.bumi.color, speed: 2.4, spread: 1.4, up: 0.5, life: 1.6, size: 0.12, drag: 1 }));
    events.emit('toast', { text: 'Pintu candi bergeser terbuka!', kind: 'flame' });
    const look = [door.x, door.y - 0.2, door.z - 1.5];
    const keys = [
      currentCameraKey(ctx, 0),
      { pos: [door.x + 3.2, door.y + 1.6, door.z + 8.5], look, t: 1.3 },
      { pos: [door.x + 1.4, door.y + 0.9, door.z + 6.2], look, t: 3.8 },
    ];
    miniCinematic(ctx, fx, keys, 4.1).then(() => {
      if (bumi.visible) events.emit('hint', { text: 'Ada cahaya jingga di dalam ruang candi…', seconds: 4 });
    });
  }

  // ------------------------------------------------------------------ relief panel
  const reliefPos = reliefPoint(ctx);
  let reading = false;
  interact.add({
    id: 'relief',
    getPosition: () => reliefPos,
    radius: 2.8,
    label: 'Baca relief',
    enabled: () => !reading,
    onInteract: () => {
      reading = true;
      state.flag('read_relief', true);
      emitSubtitle(ctx, 'Relief Candi', 'Empat abdi memanggul pelita. Yang pertama menghadap bintang yang nggak pernah bergeser.', 5);
      fx.after(5.2, () => emitSubtitle(ctx, 'Relief Candi', 'Tulisan kunonya aus… cuma terbaca: "…ikuti matahari… terbalik…"', 5));
      fx.after(10.4, () => { reading = false; });
      events.emit('clue:add', {
        id: 'pelita_relief',
        text: 'Relief candi: abdi pertama menghadap bintang yang tak pernah bergeser. "…ikuti matahari… terbalik…" Maksudnya urutan pelita?',
        source: 'Relief Candi',
        tier: null,
      });
      return true;
    },
  });

  // ------------------------------------------------------------------ restore from progress
  function restore() {
    const p = prog();
    for (const id of FLAME_IDS) {
      const o = orbs[id];
      o.collecting = false;
      o.fire.setIntensity(1, true);
      setOrbVisible(o, p.flames[id] === 'none');
      const s = sockets[id];
      s.busy = false;
      if (p.flames[id] === 'placed') igniteSocket(id, true);
      else {
        if (s.fire) { s.fire.dispose(); s.fire = null; }
        try { ctx.structures?.sockets?.[id]?.setLit?.(false); } catch (err) { console.warn(err); }
      }
    }
    updateBeaconGlow(true);
    const open = state.flag('candi_open');
    pelitaBusy = false;
    reading = false;
    for (const id of PELITA_ORDER) setPelitaLit(id, open, true);
    if (!open) p.pelita = [];
    try { ctx.structures?.setCandiDoor?.(open); } catch (err) { console.warn(err); }
  }
  events.on('game:loaded', restore);
  events.on('game:reset', restore);
  restore();

  // ------------------------------------------------------------------ per frame
  function update(dt, t) {
    fx.update(dt, t);
    const flamesState = prog().flames;
    for (const id of FLAME_IDS) {
      const o = orbs[id];
      if (!o.visible) continue;
      const bob = Math.sin(t * 1.4 + o.phase) * 0.12;
      const cy = o.center.y + bob;
      o.core.position.set(o.center.x, cy, o.center.z);
      const pulse = 1 + 0.08 * Math.sin(t * 3.1 + o.phase) + 0.05 * Math.sin(t * 7.3);
      o.core.scale.setScalar(pulse);
      o.fire.object.position.set(o.center.x, cy - 0.34, o.center.z);
      if (!o.collecting) o.fire.setIntensity(1 + 0.12 * Math.sin(t * 2.3 + o.phase));
      for (let i = 0; i < o.motes.length; i++) {
        const m = o.motes[i];
        const a = t * (1.1 + i * 0.27) + (i * Math.PI * 2) / 3 + o.phase;
        const r = 0.55 + 0.1 * Math.sin(t * 1.7 + i);
        m.position.set(o.center.x + Math.cos(a) * r, cy + Math.sin(a * 1.3 + i) * 0.28, o.center.z + Math.sin(a) * r);
        m.intensity = 1.2 + 0.6 * Math.sin(t * 6 + i * 2);
        m.update();
      }
      o.glowBig.position.set(o.center.x, cy, o.center.z);
      o.glowBig.intensity = 0.14 + 0.04 * Math.sin(t * 2.1 + o.phase);
      o.glowBig.update();
      // Occasional rising spark.
      if (Math.random() < dt * 5 * fx.particleScale) {
        fx.spark({ x: o.center.x + (Math.random() - 0.5) * 0.5, y: cy, z: o.center.z + (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 0.3, vy: 0.7 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.3, color: o.info.color, life: 1.4, size: 0.07, drag: 0.6 });
      }
    }
    // Empty tungku shimmer when the matching flame is being carried nearby; lit tungku calm down
    // after dawn so they don't dominate the daylight scene.
    const calm = prog().finished && !ctx.finale?.active;
    for (const id of FLAME_IDS) {
      const s = sockets[id];
      if (s.fire) {
        if (calm && Math.abs(s.fire.target - 0.72) > 0.01) s.fire.setIntensity(0.72);
        continue;
      }
      const want = flamesState[id] === 'carried' ? 0.35 + 0.15 * Math.sin(t * 3 + id.length) : 0;
      if (Math.abs(s.hint.intensity - want) > 0.01) { s.hint.intensity = want; s.hint.update(); }
    }
    // Lit pelita flicker; dormant wicks breathe.
    for (const id of PELITA_ORDER) {
      const pl = pelita[id];
      if (!pl.lit) {
        const v = 0.35 + 0.15 * Math.sin(t * 1.3 + id.length * 1.7);
        pl.glint.intensity = v;
        pl.glint.update();
      }
    }
    fireSystem.update(dt, t);
  }

  return {
    createFire,
    fx,
    fireSystem,
    orbs,
    sockets,
    pelita,
    collect,
    place,
    lightPelita,
    openCandi,
    travel,
    carriedCount,
    placedCount,
    foundCount,
    restore,
    update,
  };
}
