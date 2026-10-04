// Hoodvale — boot sequence and main loop. Owner: integration. Contracts: DESIGN.md.

import * as THREE from 'three';
import { createEngine, createPerfGovernor } from './core/engine.js';
import { createEvents } from './core/events.js';
import { createInput } from './core/input.js';
import { createTicks } from './core/ticks.js';
import { createState } from './core/state.js';
import { createMap } from './world/map.js';
import { buildSpawns } from './data/spawns.js';

import { createSky } from './world/sky.js';
import { createTerrain } from './world/terrain.js';
import { createWater } from './world/water.js';
import { createDecor } from './world/decor.js';
import { createStructures } from './props/structures.js';
import { createBuildings } from './props/buildings.js';
import { createObjectViews } from './props/objects.js';
import { createActors } from './actors/actors.js';
import { createChain } from './net/chain.js';
import { createWallet } from './net/wallet.js';
import { createSkills } from './game/skills.js';
import { createInventory, createBank, createEquipment } from './game/inventory.js';
import { createActions } from './game/actions.js';
import { createEntities } from './game/entities.js';
import { createPlayer } from './game/player.js';
import { createCamera } from './game/camera.js';
import { createPicking } from './game/picking.js';
import { createGathering } from './game/gathering.js';
import { createArtisan } from './game/artisan.js';
import { createCombat } from './game/combat.js';
import { createMagic } from './game/magic.js';
import { createLoot } from './game/loot.js';
import { createDialogue } from './content/dialogue.js';
import { createShops } from './content/shops.js';
import { createQuests } from './content/quests.js';
import { createOracle } from './content/oracle.js';
import { createTravellers } from './content/travellers.js';
import { createLore } from './content/lore.js';
import { createExchange } from './net/exchange.js';
import { createCloud } from './net/cloud.js';
import { createRoom } from './net/room.js';
import { createUI } from './ui/ui.js';
import { createAudio } from './audio/audio.js';

const DEBUG = (() => {
  try { return new URLSearchParams(location.search).has('debug') || location.hash === '#debug'; } catch { return false; }
})();
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function loadingUI() {
  const root = document.getElementById('loading');
  const bar = root?.querySelector('[data-bar]');
  const label = root?.querySelector('[data-label]');
  return {
    set(f, text) { if (bar) bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, f))})`; if (label && text) label.textContent = text; },
    hide() { if (!root) return; root.classList.add('done'); setTimeout(() => { root.hidden = true; }, 900); },
    fail(err) { if (label) label.textContent = 'Could not start: ' + (err?.message || err); root?.classList.add('error'); },
  };
}

async function boot() {
  const loading = loadingUI();
  const canvas = document.getElementById('gl');
  const events = createEvents();
  const state = createState(events);
  loading.set(0.04, 'Lighting the forges…');
  const engine = createEngine({ canvas, quality: state.settings.quality });
  const input = createInput({ canvas });
  const ticks = createTicks(events);
  await nextFrame();
  loading.set(0.08, 'Drawing the map…');
  const map = createMap();
  const spawns = buildSpawns();

  const ctx = {
    THREE, engine, scene: engine.scene, camera: engine.camera, renderer: engine.renderer,
    events, input, ticks, state, map, spawns, debug: DEBUG,
    time: { t: 0, dt: 0, frame: 0 },
    failed: [],
  };
  const make = (name, fn) => {
    try { ctx[name] = fn(); }
    catch (err) { console.error(`[hoodvale] ${name} failed to start`, err); ctx.failed.push(name); }
  };

  const steps = [
    ['Raising the hills…', () => {
      make('sky', () => createSky(ctx));
      make('terrain', () => createTerrain(ctx));
      make('water', () => createWater(ctx));
      make('decor', () => createDecor(ctx));
    }],
    ['Building the villages…', () => {
      make('structures', () => createStructures(ctx));
      make('buildings', () => createBuildings(ctx));
      make('objectViews', () => createObjectViews(ctx));
    }],
    ['Waking the folk…', () => { make('actors', () => createActors(ctx)); }],
    ['Opening the Ledger…', () => {
      make('chain', () => createChain(ctx));
      make('wallet', () => createWallet(ctx));
    }],
    ['Teaching the rules…', () => {
      make('skills', () => createSkills(ctx));
      make('inventory', () => createInventory(ctx));
      make('bank', () => createBank(ctx));
      make('equipment', () => createEquipment(ctx));
      make('actions', () => createActions(ctx));
      make('entities', () => createEntities(ctx));
      make('player', () => createPlayer(ctx));
      make('cameraRig', () => createCamera(ctx));
      make('picking', () => createPicking(ctx));
      make('gathering', () => createGathering(ctx));
      make('artisan', () => createArtisan(ctx));
      make('combat', () => createCombat(ctx));
      make('magic', () => createMagic(ctx));
      make('loot', () => createLoot(ctx));
    }],
    ['Writing the stories…', () => {
      make('dialogue', () => createDialogue(ctx));
      make('shops', () => createShops(ctx));
      make('quests', () => createQuests(ctx));
      make('oracle', () => createOracle(ctx));
      make('travellers', () => createTravellers(ctx));
      make('lore', () => createLore(ctx));
    }],
    ['Connecting to the Vale…', () => {
      make('exchange', () => createExchange(ctx));
      make('cloud', () => createCloud(ctx));
      make('room', () => createRoom(ctx));
    }],
    ['Carving the interface…', () => { make('ui', () => createUI(ctx)); }],
    ['Tuning the lutes…', () => { make('audio', () => createAudio(ctx)); }],
  ];
  for (let i = 0; i < steps.length; i++) {
    loading.set(0.12 + (0.76 * i) / steps.length, steps[i][0]);
    await nextFrame();
    steps[i][1]();
  }

  loading.set(0.92, 'Warming the shaders…');
  await nextFrame();
  try { engine.renderer.compile(engine.scene, engine.camera); } catch (err) { console.warn('[hoodvale] precompile skipped', err); }

  // Per-frame update order (ticks run game logic first, then visuals, camera, UI, audio).
  const order = [
    'player', 'entities', 'travellers', 'room', 'combat', 'loot', 'gathering', 'artisan', 'magic', 'quests', 'oracle',
    'cameraRig', 'sky', 'terrain', 'water', 'decor', 'structures', 'buildings', 'objectViews', 'actors',
    'wallet', 'chain', 'exchange', 'cloud', 'picking', 'ui', 'audio',
  ];
  const updatable = order.map((k) => [k, ctx[k]]).filter(([, m]) => m && typeof m.update === 'function');
  const governor = createPerfGovernor(engine, { enabled: state.settings.quality === 'auto' });
  const disabled = new Set();

  function step(dt) {
    ctx.time.dt = dt;
    ctx.time.t += dt;
    ctx.time.frame++;
    input.update();
    if (state.mode === 'play' || state.mode === 'dead' || state.mode === 'cutscene') ticks.update(dt);
    state.update(dt);
    for (const [name, m] of updatable) {
      if (disabled.has(name)) continue;
      try { m.update(dt, ctx.time.t); }
      catch (err) { disabled.add(name); console.error(`[hoodvale] ${name}.update failed; disabled`, err); }
    }
  }
  ctx.step = step;

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    step(dt);
    governor.update(dt);
    engine.render();
  }

  if (DEBUG) installDebug(ctx);
  loading.set(1, 'Welcome to the Vale.');
  await nextFrame();
  loading.hide();
  state.setMode('login');
  events.emit('game:ready', { failed: ctx.failed });
  requestAnimationFrame((t) => { last = t; frame(t); });
}

function installDebug(ctx) {
  window.__hv = {
    ctx,
    // Start playing immediately with the local save (or a fresh one) — skips the login screen.
    play(name = 'Tester') {
      if (!ctx.state.loadLocal()) ctx.state.newCharacter(name);
      ctx.state.setMode('play');
      ctx.events.emit('game:start', { debug: true });
      return ctx.state.save.pos;
    },
    teleport(x, z) { ctx.player?.teleport?.(Math.floor(x), Math.floor(z)); },
    give(id, qty = 1) { return ctx.inventory?.add?.(id, qty); },
    level(skill, lvl) { ctx.skills?.setLevel?.(skill, lvl); },
    credit(mc) { return ctx.wallet?.credit?.(mc, 'debug'); },
    ticks(n = 1) { ctx.ticks.advance(n); },
    // Simulate n seconds of frames without rendering.
    fastForward(seconds, dt = 1 / 30) { for (let t = 0; t < seconds; t += dt) ctx.step(dt); return ctx.state.mode; },
    lookFrom(pos, target) {
      ctx.cameraRig?.setMode?.('debug');
      ctx.camera.position.set(pos[0], pos[1], pos[2]);
      ctx.camera.lookAt(target[0], target[1], target[2]);
    },
    follow() { ctx.cameraRig?.setMode?.('follow'); },
    stats() {
      const s = ctx.engine.stats;
      return { fps: +s.fps.toFixed(1), frameMs: +s.frameMs.toFixed(1), drawCalls: s.drawCalls, triangles: s.triangles, quality: ctx.engine.quality, mode: ctx.state.mode, failed: ctx.failed };
    },
  };
  console.info('[hoodvale] debug hooks on window.__hv');
}

boot().catch((err) => {
  console.error('[hoodvale] boot failed', err);
  loadingUI().fail(err);
});
