// LENTERA: Kabut Nusantara — boot sequence and main loop.
// Owner: integration. Module contracts: DESIGN.md.

import * as THREE from 'three';
import { createEngine, createPerfGovernor } from './core/engine.js';
import { createEvents } from './core/events.js';
import { createInput } from './core/input.js';
import { createState } from './core/state.js';
import { createInteract } from './core/interact.js';
import { createAudio } from './core/audio.js';
import { createCollision } from './world/collision.js';
import { createFog, patchObject } from './world/fog.js';
import { createSky } from './world/sky.js';
import { createTerrain } from './world/terrain.js';
import { createOcean } from './world/ocean.js';
import { createStructures } from './world/structures.js';
import { createVegetation } from './world/vegetation.js';
import { createPlayer } from './player/controller.js';
import { createCameraRig } from './player/camera.js';
import { createCredit } from './npc/credit.js';
import { createMind } from './npc/mind.js';
import { createNPCs } from './npc/npcs.js';
import { createDialogue } from './npc/dialogue.js';
import { createJournal } from './ui/journal.js';
import { createFlames } from './gameplay/flames.js';
import { createCheckpoints } from './gameplay/checkpoints.js';
import { createSpirits } from './gameplay/spirits.js';
import { createQuest } from './gameplay/quest.js';
import { createFinale } from './gameplay/finale.js';
import { createHUD } from './ui/hud.js';
import { createPrompts } from './ui/prompts.js';
import { createMenus } from './ui/menus.js';
import { createTouch } from './ui/touch.js';
import { LANDMARKS, heightAt } from './world/heightfield.js';

const DEBUG = (() => {
  try {
    return new URLSearchParams(location.search).has('debug') || location.hash === '#debug';
  } catch {
    return false;
  }
})();

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function loadingUI() {
  const root = document.getElementById('loading');
  const bar = root?.querySelector('[data-bar]');
  const label = root?.querySelector('[data-label]');
  return {
    set(fraction, text) {
      if (bar) bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, fraction))})`;
      if (label && text) label.textContent = text;
    },
    hide() {
      if (!root) return;
      root.classList.add('done');
      setTimeout(() => { root.hidden = true; }, 900);
    },
    fail(err) {
      if (label) label.textContent = 'Gagal memuat: ' + (err?.message || err);
      root?.classList.add('error');
    },
  };
}

async function boot() {
  const loading = loadingUI();
  const canvas = document.getElementById('gl');
  const events = createEvents();
  const state = createState(events);

  loading.set(0.05, 'Menyalakan lentera…');
  const engine = createEngine({ canvas, quality: state.settings.quality });
  const input = createInput({ canvas, getSettings: () => state.settings });

  const ctx = {
    THREE, engine, scene: engine.scene, camera: engine.camera, renderer: engine.renderer,
    events, input, state, debug: DEBUG,
    time: { t: 0, dt: 0, frame: 0 },
    world: {},
  };
  ctx.collision = createCollision(ctx);
  ctx.interact = createInteract(ctx);
  ctx.audio = createAudio(ctx);

  // Steps are ordered: later modules may read earlier ones at creation time.
  const steps = [
    ['Mengumpulkan kabut…', () => { ctx.world.fog = ctx.fog = createFog(ctx); }],
    ['Melukis langit senja…', () => { ctx.world.sky = ctx.sky = createSky(ctx); }],
    ['Membentuk pulau…', () => { ctx.world.terrain = ctx.terrain = createTerrain(ctx); }],
    ['Menggelar laut…', () => { ctx.world.ocean = ctx.ocean = createOcean(ctx); }],
    ['Mendirikan kampung…', () => { ctx.world.structures = ctx.structures = createStructures(ctx); }],
    ['Menanam hutan…', () => { ctx.world.vegetation = ctx.vegetation = createVegetation(ctx); }],
    ['Memanggil pembawa lentera…', () => { ctx.player = createPlayer(ctx); ctx.cameraRig = createCameraRig(ctx); }],
    ['Membangunkan warga…', () => {
      ctx.credit = createCredit(ctx);
      ctx.mind = createMind(ctx);
      ctx.npcs = createNPCs(ctx);
      ctx.dialogue = createDialogue(ctx);
      ctx.journal = createJournal(ctx);
    }],
    ['Menyembunyikan api pusaka…', () => {
      ctx.flames = createFlames(ctx);
      ctx.checkpoints = createCheckpoints(ctx);
      ctx.spirits = createSpirits(ctx);
      ctx.quest = createQuest(ctx);
      ctx.finale = createFinale(ctx);
    }],
    ['Menyiapkan layar…', () => {
      ctx.hud = createHUD(ctx);
      ctx.prompts = createPrompts(ctx);
      ctx.menus = createMenus(ctx);
      ctx.touch = createTouch(ctx);
    }],
  ];
  for (let i = 0; i < steps.length; i++) {
    const [label, fn] = steps[i];
    loading.set(0.1 + (0.75 * i) / steps.length, label);
    await nextFrame();
    fn();
  }

  // Safety net: any material a module forgot to patch still gets the kabut.
  patchObject(engine.scene);

  loading.set(0.9, 'Memanaskan shader…');
  await nextFrame();
  try {
    engine.renderer.compile(engine.scene, engine.camera);
  } catch (err) {
    console.warn('[lentera] precompile skipped', err);
  }

  // World/gameplay modules get dt = 0 while paused; UI always gets real dt.
  const simModules = [
    ctx.player, ctx.npcs, ctx.flames, ctx.checkpoints, ctx.spirits, ctx.quest, ctx.finale,
  ];
  const worldModules = [ctx.sky, ctx.ocean, ctx.structures, ctx.vegetation, ctx.terrain];
  const uiModules = [ctx.dialogue, ctx.journal, ctx.hud, ctx.prompts, ctx.touch];
  const governor = createPerfGovernor(engine, { enabled: state.settings.quality === 'auto' });
  events.on('settings:change', () => { governor.enabled = state.settings.quality === 'auto'; });

  let last = performance.now();
  let simTime = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    step(dt);
    governor.update(dt);
    engine.render();
  }

  // One simulation + UI step (no rendering). Also used by the debug fast-forward.
  function step(dt) {
    const paused = state.mode === 'pause' || state.mode === 'loading';
    const sdt = paused ? 0 : dt;
    simTime += sdt;
    ctx.time.dt = sdt;
    ctx.time.t = simTime;
    ctx.time.frame++;
    if (state.mode === 'play') state.progress.playTime += dt;

    input.update(dt);
    safe(ctx.menus, dt, simTime);
    for (const m of simModules) safe(m, sdt, simTime);
    safe(ctx.cameraRig, sdt, simTime);
    safe(ctx.fog, sdt, simTime);
    for (const m of worldModules) safe(m, sdt, simTime);
    ctx.interact.update();
    for (const m of uiModules) safe(m, dt, simTime);
    safe(ctx.audio, dt, simTime);
  }
  ctx.step = step;

  const failed = new Set();
  function safe(mod, dt, t) {
    if (!mod || typeof mod.update !== 'function' || failed.has(mod)) return;
    try {
      mod.update(dt, t);
    } catch (err) {
      failed.add(mod);
      console.error('[lentera] module update failed; disabling it', err);
    }
  }

  if (DEBUG) installDebug(ctx);

  loading.set(1, 'Siap.');
  await nextFrame();
  loading.hide();
  state.setMode('title');
  events.emit('game:ready', {});
  requestAnimationFrame((t) => { last = t; frame(t); });
}

function installDebug(ctx) {
  window.__lentera = {
    ctx,
    LANDMARKS,
    teleport(x, z, y) {
      const gy = y ?? Math.max(heightAt(x, z), ctx.collision.groundAt(x, z, 999).y) + 0.05;
      ctx.player?.teleport?.(x, gy, z);
    },
    play() {
      ctx.events.emit('debug:skipIntro', {});
      if (ctx.state.mode !== 'play') ctx.state.setMode('play');
    },
    mode(m) { ctx.state.setMode(m); },
    stats() {
      const s = ctx.engine.stats;
      return { ...s, quality: ctx.engine.quality, gpu: ctx.engine.gpu, colliders: ctx.collision.count, mode: ctx.state.mode };
    },
    // Put the camera somewhere for screenshots: lookFrom([x,y,z], [x,y,z]).
    lookFrom(pos, target) {
      ctx.cameraRig?.setMode?.('debug');
      ctx.camera.position.set(pos[0], pos[1], pos[2]);
      ctx.camera.lookAt(target[0], target[1], target[2]);
    },
    follow() { ctx.cameraRig?.setMode?.('follow'); },
    // Run the simulation for `seconds` without rendering (cinematics on slow test machines).
    fastForward(seconds, dt = 1 / 30) {
      for (let t = 0; t < seconds; t += dt) ctx.step(dt);
      return ctx.state.mode;
    },
  };
  console.info('[lentera] debug hooks on window.__lentera');
}

boot().catch((err) => {
  console.error('[lentera] boot failed', err);
  loadingUI().fail(err);
});
