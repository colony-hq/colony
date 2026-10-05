// Characters and creatures for Hoodvale. Owner: actors builder.
//
// API: createActors(ctx) -> { create(spec) -> Actor, update(dt), fx, list, auto, stats() }
//   spec: { kind: 'humanoid', look, player?, npc? } | { kind: 'remote', look } |
//         { kind: 'creature', model, monster } | { kind: 'oracle' }
// Actor: { root, setPosition(x, y, z), setYaw(yaw), play(anim, opts), setLook(look),
//          setEquipment(eqMap), setVisible(v), hit(opts), die(opts), revive(), headHeight,
//          update(dt), dispose() }
//   extras: emote(name), setTalking(on), socket(part, out) (world position of 'head' | 'chest' |
//           'weapon' | 'bow' | 'handR' | 'handL' | 'mouth' | 'feet'), timing(anim) -> { dur,
//           release, impact }, dead, kind, current (anim name).
// play(name, opts): loops (idle, walk, run, ready, chop, mine, fish_net, ...) are idempotent and
//   meant to be called every frame; one-shots (attack, slash, shoot, cast, eat, wave, ...) start
//   once and run to completion over the current loop (repeat calls while running are ignored
//   unless opts.restart). Unknown names fall back to idle. opts: { restart, tool (item id or
//   tint for skilling tools), speed (playback rate) }.
// Animation runs in actors.update() (main loop); Actor.update(dt) is a no-op kept for the API.
// See .qa/notes-actors.md for every animation name and the fx API.

import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import {
  materials, fadeMaterial, outlineMaterial, acquireGeometry, releaseGeometry, geometryCacheStats, damp, clamp, smooth01, env, wrapAngle,
  newPose, hexOf, shade, SHARED, makeBones, shadowTexture,
} from './a-core.js';
import { HB, HB_COUNT, HB_UPPER, normaliseLook, buildHumanoid, layoutFor, createHumanoidBones, buildHeldGeometry } from './a-humanoid.js';
import { modelReady, requestModel, preloadModels, onModelLoaded, HERO_MODELS, HERO_IDS, MODELS } from './a-model.js';
import { setFaceRenderer } from './a-face.js';
import * as AN from './a-anim.js';
import { CREATURE_RIGS, creatureSpec, buildWisp, buildOracle } from './a-creatures.js';
import { toolGeometry } from './a-gear.js';
import { createFx } from './a-fx.js';

const _v = new THREE.Vector3();
const IDENTITY = new THREE.Matrix4();
const VARIANT_BODIES = ['goblin', 'troll', 'imp', 'skeleton', 'golem'];

// ---------------------------------------------------------------------------------------------
// Equipment / gear mapping
// ---------------------------------------------------------------------------------------------
export function outfitFromEquipment(eq = {}) {
  const o = {};
  for (const [slot, v] of Object.entries(eq || {})) {
    const id = v && (v.id || v);
    const it = id && ITEMS[id];
    const m = it?.equip?.model;
    if (!m) continue;
    const k = m.kind, t = m.tint;
    switch (slot) {
      case 'weapon': o.weapon = { kind: k, tint: t, id }; break;
      case 'shield': o.shield = { kind: k, tint: t }; break;
      case 'head': o.head = { kind: k, tint: t }; break;
      case 'body': o.body = { kind: k, tint: t }; break;
      case 'legs': o.legs = { kind: k, tint: t }; break;
      case 'hands': o.hands = { kind: k, tint: t }; break;
      case 'feet': o.feet = { kind: k, tint: t }; break;
      case 'cape': o.cape = { kind: k, tint: t }; break;
      case 'neck': o.neck = { kind: k, tint: t }; break;
      case 'ammo': o.ammo = { kind: 'quiver', tint: t }; break;
      default: break;
    }
  }
  return o;
}

// Biped monsters -> humanoid look + outfit.
function bipedFromModel(model = {}, monster = '') {
  const c = model.colors || {}, g = model.gear || {};
  const variant = model.rig === 'golem' ? 'golem' : VARIANT_BODIES.includes(model.body) ? model.body : 'human';
  const metal = c.metal || (variant === 'goblin' ? 'bronze' : 'iron');
  const cloth = c.cloth || '#5a4a3a';
  const look = {
    body: 'male', build: variant === 'human' ? (monster.includes('knight') || monster.includes('guard') ? 'stout' : 'normal') : 'normal',
    skin: c.skin || c.body || '#c8956b', top: cloth, bottom: hexOf(shade(cloth, 0.62)), boots: '#2a2018',
    hair: 'short', hairColor: c.hair || '#2a1a12', glow: c.glow || c.core || null, metal: c.metal || null,
  };
  if (model.gen) look.model = model.gen; // generated body (a-model.js), once it has shipped
  if (monster === 'sheriff_vane') { look.hair = 'slick'; look.beard = 'moustache'; }
  if (monster === 'bandit') { look.beard = 'stubble'; look.hair = 'short'; look.bottom = '#5a4632'; look.scarf = '#8a2a22'; }
  const o = {};
  if (g.weapon) o.weapon = { kind: g.weapon, tint: ['club', 'greatclub'].includes(g.weapon) ? null : metal };
  if (g.shield) o.shield = { kind: g.shield, tint: metal, face: g.shield === 'kiteshield' && variant === 'human' ? cloth : null };
  const head = g.head || g.hat;
  if (head === 'helm') o.head = { kind: 'helm', tint: metal };
  else if (head === 'mask') o.head = { kind: 'mask', tint: 'bandit' };
  else if (head) o.head = { kind: head };
  if (g.body === 'chestplate') { o.body = { kind: 'chestplate', tint: metal }; look.tabard = cloth; }
  else if (g.body === 'coat') o.body = { kind: 'coat', tint: cloth };
  if (g.legs === 'platelegs') o.legs = { kind: 'platelegs', tint: metal };
  if (g.cape) o.cape = { kind: 'cape', tint: g.cape === 'red' ? 'red' : g.cape };
  return { look, outfit: o, variant };
}

// ---------------------------------------------------------------------------------------------
// Drivers: humanoid (skinned), creature (skinned), rigid (wisp / oracle)
// ---------------------------------------------------------------------------------------------
class HumanDriver {
  constructor(actor, look, variant, outfit) {
    this.a = actor;
    this.look = look || {};
    this.variant = variant || 'human';
    this.baseOutfit = outfit || {}; // from look / monster gear
    this.equip = null; // from setEquipment
    this.key = null;
    this.mesh = null;
    this.bones = null;
    this.P = AN.POSE_LEN ? new Float32Array(AN.POSE_LEN) : null;
    this.O = new Float32Array(AN.POSE_LEN);
    this.T = new Float32Array(AN.POSE_LEN);
    this.loops = new Map(); // keyed loop name -> { t, w }
    this.loco = { idle: 1, walk: 0, run: 0, ready: 0 };
    this.tools = { R: null, L: null };
    this.toolKey = { R: '', L: '' };
    this.blink = 0; this.blinkT = 1 + Math.random() * 4;
    this.glance = { t: 2 + Math.random() * 3, yaw: 0, pitch: 0, hold: 0, cy: 0, cp: 0 };
    this.line = null;
    this.build();
  }
  outfit() { return { ...this.baseOutfit, ...(this.equip || {}) }; }
  build() {
    const spec = normaliseLook(this.look, this.outfit(), this.variant, { npc: !this.a.player && !this.a.spec?.remote });
    // Generated model (look.model): textured body + held items on the model's own skeleton. Until
    // it has loaded the procedural body stands in, then the actor rebuilds.
    // Other players may only wear hero models; unshipped ids keep the procedural body.
    const want = this.look.model || null;
    const mid = want && MODELS.has(want) && (!this.a.spec?.remote || HERO_IDS.has(want)) ? want : null;
    const M = mid ? modelReady(mid) : null;
    if (mid && !M && this.waiting !== mid) {
      this.waiting = mid;
      requestModel(mid).then(() => { if (!this.disposed && this.look.model === mid) this.build(); }, () => {});
    }
    if (M) {
      spec.model = mid; spec.lids = false; spec.old = false;
      spec.b = { ...spec.b, leg: M.joints[HB.hips][1] / 0.875, width: 1, hunch: 0, scale: 1 };
      spec.key = 'model:' + mid + '|' + JSON.stringify([spec.outfit, spec.bow]);
    }
    if (spec.key === this.key) return;
    const a = this.a;
    const layout = M ? M.layoutFor(spec) : layoutFor(spec);
    // Geometry: procedural bodies are cached per look; a model body is shared and never released,
    // its held items are cached per outfit.
    let geo, heldGeo = null, relKey = null;
    if (M) {
      geo = M.geo;
      const o = spec.outfit;
      if (o.weapon || o.shield || (o.ammo && o.ammo.kind === 'quiver')) {
        relKey = 'held:' + spec.key;
        heldGeo = acquireGeometry(relKey, () => buildHeldGeometry(spec, layout));
      }
    } else {
      geo = acquireGeometry(spec.key, () => buildHumanoid(spec).geo);
      relKey = spec.key;
    }
    const bones = createHumanoidBones(layout);
    const skeleton = new THREE.Skeleton(bones);
    const mats = M ? M.mats : null;
    const mesh = new THREE.SkinnedMesh(geo, (mats || materials()).body);
    mesh.name = 'actor-body';
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    a.body.add(bones[0]);
    a.body.add(mesh);
    mesh.bind(skeleton, IDENTITY);
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, layout.height * 0.5, 0), layout.height * 0.9 + 0.6);
    const outline = new THREE.SkinnedMesh(geo, outlineMaterial());
    outline.name = 'actor-outline';
    outline.castShadow = false;
    outline.bind(skeleton, IDENTITY);
    outline.boundingSphere = mesh.boundingSphere;
    a.body.add(outline);
    if (heldGeo) {
      // Children of the body / outline meshes so hiding or fading them takes the items along.
      const held = new THREE.SkinnedMesh(heldGeo, materials().body);
      held.name = 'actor-held';
      held.castShadow = true;
      held.bind(skeleton, IDENTITY);
      held.boundingSphere = mesh.boundingSphere;
      mesh.add(held);
      const ho = new THREE.SkinnedMesh(heldGeo, outlineMaterial());
      ho.castShadow = false;
      ho.bind(skeleton, IDENTITY);
      ho.boundingSphere = mesh.boundingSphere;
      outline.add(ho);
    }
    // Swap in.
    if (this.mesh) {
      this.detachTools();
      a.body.remove(this.mesh);
      if (a.outline) a.body.remove(a.outline);
      a.body.remove(this.bones[0]);
      if (this.relKey) releaseGeometry(this.relKey);
    }
    a.outline = outline;
    this.mesh = mesh; this.bones = bones; this.skeleton = skeleton; this.spec = spec; this.layout = layout; this.key = spec.key;
    this.relKey = relKey; this.mats = mats; this.model = M;
    this.bindHips = bones[HB.hips].position.clone();
    this.nockRest = bones[HB.nock].position.clone();
    const w = spec.outfit.weapon;
    this.weaponKind = w?.kind || null;
    this.hold = !w ? 'none' : (w.kind === 'shortbow' || w.kind === 'longbow') ? 'bow' : w.kind === 'greatsword' ? '2h'
      : w.kind === 'staff' ? 'staff' : w.kind === 'walking-staff' ? 'walkstaff' : '1h';
    this.shield = !!spec.outfit.shield;
    const sc = M ? (this.look.scale || 1) : (this.look.scale || 1) * (spec.b.scale || 1) * (spec.female && spec.variant === 'human' ? 0.96 : 1);
    a.body.scale.setScalar(sc);
    a.headHeight = layout.height * sc * a.scale;
    a.blob = 0.36 * sc * Math.max(1, spec.b.width * 0.9);
    a.mesh = mesh;
    a._materialRestore = null;
    if (a._fadeMat) { a._fadeMat.dispose(); a._fadeMat = null; }
    if (a.state.dead && a.state.faded > 0) { a._fadeMat = this.fadeMaterial(); a._fadeMat.opacity = 1 - a.state.faded; mesh.material = a._fadeMat; }
    this.c = {
      t: Math.random() * 100, ph: 0, seed: Math.random() * 10, old: spec.old ? 1 : 0, hunch: (spec.b.hunch || 0), stride: 1, armSwing: 1,
      wide: spec.buildName === 'stout' || spec.variant === 'troll' || spec.variant === 'golem' ? 1 : 0, hold: this.hold, shield: this.shield,
    };
    if (this.hold === '2h' || this.hold === 'staff' || this.hold === 'walkstaff') this.c.armSwing = 0.6;
    this.evaluate(0);
  }
  bodyMaterial() { return (this.mats || materials()).body; }
  flashMaterial() { return (this.mats || materials()).flash; }
  fadeMaterial() { return this.mats ? this.mats.fade() : fadeMaterial(); }
  setLook(look) { this.look = look || {}; this.build(); }
  setEquipment(eq) { this.equip = outfitFromEquipment(eq); this.build(); }
  resolve(name) {
    const n = AN.resolveAnim(name);
    if (!n) return { type: 'unknown', name: 'idle' };
    if (n === 'attack') return { type: 'shot', name: AN.attackFor(this.weaponKind, this.a.state.attackN++) };
    if (n === 'hit') return { type: 'hit', name: 'hit' };
    if (n === 'die') return { type: 'die', name: 'die' };
    if (n === 'talk') return { type: 'talk', name: 'idle' };
    if (n === 'bow' && this.hold === 'bow' && name === 'bow') return { type: 'shot', name: 'bow' };
    if (AN.LOOP_BASES.has(n)) return { type: 'loop', name: n };
    if (AN.animDef(n)) return { type: 'shot', name: n };
    return { type: 'unknown', name: 'idle' };
  }
  shotDef(name) { return AN.animDef(name); }
  timing(name) {
    const n = AN.resolveAnim(name);
    const d = n === 'attack' ? AN.animDef(AN.attackFor(this.weaponKind, this.a.state.attackN)) : AN.animDef(n);
    return d ? { dur: d.dur, release: d.release ?? d.impact ?? d.dur * 0.45, impact: d.impact ?? d.release ?? d.dur * 0.45 } : { dur: 0, release: 0, impact: 0 };
  }
  evaluate(dt) {
    const a = this.a, st = a.state, c = this.c, P = this.P, O = this.O, T = this.T;
    c.t += dt;
    // Locomotion weights.
    const base = st.base;
    const keyedBase = !['idle', 'walk', 'run', 'ready'].includes(base);
    const tgt = { idle: 0, walk: 0, run: 0, ready: 0 };
    if (base === 'walk' || base === 'run') tgt[base] = 1;
    else if (base === 'ready' || (base === 'idle' && st.readyT > 0)) tgt.ready = 1;
    else tgt.idle = 1;
    let sum = 0;
    for (const k in this.loco) { this.loco[k] = dt > 0 ? damp(this.loco[k], tgt[k], 9, dt) : tgt[k]; if (this.loco[k] < 0.002) this.loco[k] = 0; sum += this.loco[k]; }
    // Phase from distance travelled (feet stay planted at any speed).
    const nominal = base === 'run' ? 3.4 : 1.7;
    const spd = st.speed > 0.25 ? st.speed : (base === 'walk' || base === 'run' ? nominal : 0);
    const stride = (this.loco.run > 0.5 ? 2.5 : 1.45) * a.body.scale.x * a.scale * (this.spec.b.leg || 1);
    c.ph = (c.ph + (dt * spd) / Math.max(0.3, stride)) % 1;
    st.moveK = clamp((this.loco.walk + this.loco.run), 0, 1);
    P.fill(0);
    let first = true;
    const addPose = (fn, w) => {
      if (w <= 0) return;
      fn(T, c);
      const k = w / sum;
      if (first) { for (let i = 0; i < P.length; i++) P[i] = T[i] * k; first = false; }
      else for (let i = 0; i < P.length; i++) P[i] += T[i] * k;
    };
    addPose(AN.poseIdle, this.loco.idle);
    addPose(AN.poseWalk, this.loco.walk);
    addPose(AN.poseRun, this.loco.run);
    addPose(AN.poseReady, this.loco.ready);
    AN.applyHold(P, c, 1 - this.loco.ready * 0.6, st.moveK);
    // Keyed loops (skilling, sit, guard...).
    if (keyedBase && !this.loops.has(base)) this.loops.set(base, { t: 0, w: 0 });
    let toolsFrom = null, hideW = 0;
    for (const [name, L] of this.loops) {
      const def = AN.animDef(name);
      const on = name === base;
      L.w = dt > 0 ? damp(L.w, on ? 1 : 0, on ? 7 : 9, dt) : (on ? 1 : 0);
      L.t += dt * (st.rate || 1);
      if (!on && L.w < 0.003) { this.loops.delete(name); continue; }
      if (!def) continue;
      O.set(P);
      AN.evalKeys(def.K, L.t, def.dur, true, O);
      AN.blendKeyed(P, O, def.K, L.w, null);
      if (L.w > 0.5) { toolsFrom = def; }
      if (def.hideWeapon) hideW = Math.max(hideW, L.w);
      // Skilling impact FX.
      if (def.impact !== undefined && on && L.w > 0.8) {
        const ph = L.t % def.dur, prev = (L.t - dt) % def.dur;
        if (prev < def.impact && ph >= def.impact) a.sys.onImpact(a, name);
      }
    }
    // One-shot.
    if (st.shot) {
      const def = st.shotDef;
      st.shotT += dt * (st.rate || 1);
      const w = env(st.shotT, st.shotDur, 0.1, Math.min(0.25, st.shotDur * 0.3));
      O.set(P);
      AN.evalKeys(def.K, st.shotT, def.dur, false, O);
      AN.blendKeyed(P, O, def.K, w, def.upper && st.moveK > 0.3 ? HB_UPPER : null);
      if (w > 0.5 && (def.tools || def.hideWeapon)) toolsFrom = def;
      if (def.hideWeapon) hideW = Math.max(hideW, w);
      if (def.release !== undefined && !st.released && st.shotT >= def.release) { st.released = true; st.onRelease?.(); }
      if (st.shotT >= st.shotDur) { st.shot = null; st.shotDef = null; }
    }
    // Talking gestures.
    const talkOn = st.talking || a.sys.time < (st.talkUntil || 0);
    st.talkK = dt > 0 ? damp(st.talkK, talkOn ? 1 : 0, 4, dt) : 0;
    if (st.talkK > 0.01 && !st.shot && !keyedBase) AN.addTalk(P, c.t, st.talkK * (1 - st.moveK));
    // Death fall (absolute, wins over everything).
    if (st.dead) {
      st.dieW = dt > 0 ? damp(st.dieW, 1, 14, dt) : 1;
      const def = AN.animDef('die');
      O.set(P);
      AN.evalKeys(def.K, st.deadT, def.dur, false, O);
      AN.blendKeyed(P, O, def.K, st.dieW, null);
    }
    // Hurt flinch.
    if (st.hurtK > 0.001 && !st.dead) AN.addHurt(P, st.hurtK);
    // Idle glances.
    const g = this.glance;
    if (!st.dead && st.moveK < 0.2 && !st.shot && !keyedBase) {
      g.t -= dt;
      if (g.t <= 0) {
        if (g.hold) { g.yaw = 0; g.pitch = 0; g.hold = 0; g.t = 3 + Math.random() * 4; }
        else { g.yaw = (Math.random() - 0.5) * 1.3; g.pitch = (Math.random() - 0.6) * 0.3; g.hold = 1; g.t = 1.1 + Math.random() * 1.4; }
      }
    } else { g.yaw = 0; g.pitch = 0; }
    g.cy = dt > 0 ? damp(g.cy, g.yaw, 5, dt) : 0; g.cp = dt > 0 ? damp(g.cp, g.pitch, 5, dt) : 0;
    P[HB.neck * 3 + 1] += g.cy * 0.35; P[HB.head * 3 + 1] += g.cy * 0.5; P[HB.chest * 3 + 1] += g.cy * 0.15;
    P[HB.head * 3] += g.cp * 0.6;
    // Cape / long hair drift with speed.
    const sp = clamp(st.speed / 4, 0, 1);
    P[HB.cape * 3] += 0.08 + 0.45 * sp + 0.04 * Math.sin(c.t * 2.3);
    P[HB.cape2 * 3] += 0.05 + 0.35 * sp + 0.06 * Math.sin(c.t * 3.1 + 1);
    P[HB.hair * 3] += 0.3 * sp + 0.03 * Math.sin(c.t * 2.1);
    if (this.spec.variant === 'imp') {
      P[HB.cape * 3] = -0.3 + 0.1 * Math.sin(c.t * 2); P[HB.cape * 3 + 1] = 0.4 * Math.sin(c.t * 1.7);
      P[HB.cape2 * 3 + 1] = 0.5 * Math.sin(c.t * 1.7 - 0.8);
      const f = Math.sin(c.t * (st.moveK > 0.3 ? 14 : 5));
      P[HB.wingL * 3 + 1] = -0.3 - 0.4 * f; P[HB.wingR * 3 + 1] = 0.3 + 0.4 * f;
    }
    // Keep feet flat under keyed leg poses.
    if (!st.dead) {
      const fl = -(P[HB.hips * 3] + P[HB.thL * 3] + P[HB.knL * 3]), fr = -(P[HB.hips * 3] + P[HB.thR * 3] + P[HB.knR * 3]);
      const k = 1 - st.moveK;
      P[HB.ftL * 3] += (fl - P[HB.ftL * 3]) * k * 0.9;
      P[HB.ftR * 3] += (fr - P[HB.ftR * 3]) * k * 0.9;
    }
    this.apply(P, dt, toolsFrom, hideW);
  }
  apply(P, dt, toolsFrom, hideW) {
    const bones = this.bones, st = this.a.state;
    for (let i = 0; i < HB_COUNT; i++) bones[i].rotation.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const o = AN.OFF;
    bones[HB.hips].position.set(this.bindHips.x + P[o], this.bindHips.y + P[o + 1], this.bindHips.z + P[o + 2]);
    // Weapon visibility (hidden while a skilling tool is in hand).
    const ws = hideW > 0.5 ? 0.0001 : 1;
    bones[HB.wpn].scale.setScalar(ws);
    bones[HB.wpnL].scale.setScalar(this.hold === 'bow' ? ws : 1);
    // Blink.
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = 2.2 + Math.random() * 3.5; }
    if (this.blink > 0) this.blink -= dt;
    const bk = st.dead ? 0.12 : this.blink > 0 ? Math.max(0.12, Math.abs(this.blink - 0.07) / 0.07) : 1;
    // Painted eyes close with skin lids on the eyes bone (scaled up to close); modelled eyes squash.
    if (this.spec.lids) { const k = (1 - bk) / 0.88; if (k < 0.02) bones[HB.eyes].scale.setScalar(0.0001); else bones[HB.eyes].scale.set(1, k, 1); }
    else bones[HB.eyes].scale.set(1, (this.c.old ? 0.85 : 1) * bk, 1);
    // Tools.
    this.setTools(toolsFrom?.tools || null);
    // Bow draw: the nock follows the right hand while drawing; arrow visible until release.
    const shot = st.shot && st.shotDef?.draw ? st : null;
    let draw = 0, arrow = 0;
    if (shot && this.hold === 'bow') {
      const t = st.shotT, rel = st.shotDef.release;
      draw = t < rel ? smooth01(0.2, rel - 0.04, t) : 0;
      arrow = t > 0.12 && t < rel ? 1 : 0;
    }
    if (this.hold === 'bow') {
      const nock = bones[HB.nock];
      if (draw > 0.001) {
        this.a.root.updateMatrixWorld(true);
        bones[HB.haR].localToWorld(_v.set(0, -0.07, -0.02));
        bones[HB.wpnL].worldToLocal(_v);
        nock.position.copy(this.nockRest).lerp(_v, draw);
      } else nock.position.copy(this.nockRest);
      bones[HB.arrow].scale.setScalar(arrow ? 1 : 0.0001);
    } else bones[HB.arrow].scale.setScalar(0.0001);
    // Fishing line.
    if (this.tools.R && this.toolKey.R.startsWith('rod')) this.updateLine();
    else if (this.line) { this.line.visible = false; }
  }
  setTools(tools) {
    for (const side of ['R', 'L']) {
      let kind = tools?.[side] || null;
      let key = '';
      if (kind) {
        let t = null;
        if (kind === 'axe' || kind === 'pickaxe') {
          const w = this.spec.outfit.weapon;
          t = (w && w.kind === kind ? w.tint : null) || this.a.state.toolTint || 'iron';
        }
        key = kind + '|' + (t || '');
        if (key !== this.toolKey[side]) {
          this.detachTool(side);
          const m = new THREE.Mesh(toolGeometry(kind, t), materials().body);
          m.castShadow = true;
          m.position.set(0, -0.075, 0);
          this.bones[side === 'R' ? HB.haR : HB.haL].add(m);
          this.tools[side] = m;
          this.toolKey[side] = key;
          if (kind === 'rod') { m.userData.tip = new THREE.Object3D(); m.userData.tip.position.set(0, 0, -2.05); m.add(m.userData.tip); }
        }
      } else if (this.tools[side]) this.detachTool(side);
    }
  }
  detachTool(side) {
    const m = this.tools[side];
    if (m) m.removeFromParent();
    this.tools[side] = null;
    this.toolKey[side] = '';
  }
  detachTools() { this.detachTool('R'); this.detachTool('L'); if (this.line) { this.line.removeFromParent(); this.line.geometry.dispose(); this.line = null; } }
  updateLine() {
    const tip = this.tools.R?.userData?.tip;
    if (!tip) return;
    if (!this.line) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xe8e2d0, transparent: true, opacity: 0.6 }));
      this.line.frustumCulled = false;
      this.a.sys.root.add(this.line);
    }
    this.line.visible = true;
    this.a.root.updateMatrixWorld(true);
    tip.getWorldPosition(_v);
    const arr = this.line.geometry.attributes.position.array;
    arr[0] = _v.x; arr[1] = _v.y; arr[2] = _v.z;
    const ground = this.a.root.position.y;
    const yaw = this.a.root.rotation.y;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    arr[3] = _v.x + fx * 0.6; arr[4] = Math.min(_v.y - 0.5, Math.max(0.02, ground - 0.4)) + Math.sin(this.c.t * 1.7) * 0.02; arr[5] = _v.z + fz * 0.6;
    this.line.geometry.attributes.position.needsUpdate = true;
  }
  socket(part, out) {
    const b = this.bones;
    this.a.root.updateMatrixWorld(true);
    switch (part) {
      case 'head': return b[HB.head].localToWorld(out.set(0, 0.2, 0));
      case 'mouth': return b[HB.head].localToWorld(out.set(0, 0.08, -0.15));
      case 'handR': return b[HB.haR].localToWorld(out.set(0, -0.07, 0));
      case 'handL': return b[HB.haL].localToWorld(out.set(0, -0.07, 0));
      case 'bow': return this.hold === 'bow' ? b[HB.wpnL].localToWorld(out.set(0, -0.05, 0)) : b[HB.haR].localToWorld(out.set(0, -0.07, 0));
      case 'weapon': {
        const k = this.weaponKind;
        if (this.tools.R) return this.tools.R.localToWorld(out.set(0, 0, -0.65));
        if (k === 'staff') return b[HB.wpn].localToWorld(out.set(0, 0, -1.08));
        if (k === 'shortbow' || k === 'longbow') return b[HB.wpnL].localToWorld(out.set(0, -0.05, 0));
        if (k) return b[HB.wpn].localToWorld(out.set(0, 0, k === 'greatsword' ? -0.9 : k === 'dagger' ? -0.25 : -0.55));
        return b[HB.haR].localToWorld(out.set(0, -0.07, 0));
      }
      case 'feet': return out.copy(this.a.root.position);
      default: return b[HB.chest].localToWorld(out.set(0, 0.05, 0));
    }
  }
  dispose() {
    this.disposed = true;
    this.detachTools();
    if (this.mesh) { this.mesh.removeFromParent(); if (this.relKey) releaseGeometry(this.relKey); }
    this.mesh = null;
  }
}

class CreatureDriver {
  constructor(actor, model, monster) {
    this.a = actor;
    const spec = creatureSpec(model, monster);
    this.spec = spec;
    const R = CREATURE_RIGS[spec.rig];
    this.R = R;
    this.rig = R.rig;
    const defs = R.defs(spec);
    const bones = makeBones(defs);
    const skeleton = new THREE.Skeleton(bones);
    this.key = spec.key;
    const geo = acquireGeometry(spec.key, () => R.build(spec, makeBones(defs)));
    const mesh = new THREE.SkinnedMesh(geo, materials().body);
    mesh.castShadow = true;
    actor.body.add(bones[0]);
    actor.body.add(mesh);
    mesh.bind(skeleton, IDENTITY);
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const r = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (bb.max.y + bb.min.y) / 2, (bb.max.z + bb.min.z) / 2), r * 0.85 + 0.4);
    const outline = new THREE.SkinnedMesh(geo, outlineMaterial());
    outline.name = 'actor-outline';
    outline.bind(skeleton, IDENTITY);
    outline.boundingSphere = mesh.boundingSphere;
    actor.body.add(outline);
    actor.outline = outline;
    this.mesh = mesh; this.bones = bones; this.skeleton = skeleton;
    actor.mesh = mesh;
    actor.headHeight = (bb.max.y + 0.15) * actor.scale;
    actor.blob = Math.max(bb.max.x - bb.min.x, (bb.max.z - bb.min.z) * 0.6) * 0.42;
    this.n = this.rig.n;
    this.P = newPose(this.n); this.O = newPose(this.n); this.T = newPose(this.n);
    this.bind1 = bones[1].position.clone();
    this.loco = { idle: 1, walk: 0, run: 0 };
    this.c = { t: Math.random() * 100, ph: 0, seed: Math.random() * 10, variant: spec.variant };
    this.stride = { quadruped: 1.6, bird: 0.75, spider: 1.0, slime: 1.0, wyrm: 2.2 }[spec.rig] || 1.2;
    if (spec.rig === 'quadruped') this.stride = { rodent: 0.7, cow: 2.0, boar: 1.3, wolf: 1.9, bear: 1.8 }[spec.variant] || 1.5;
    this.evaluate(0);
  }
  resolve(name) {
    const n = AN.resolveAnim(name) || name;
    if (n === 'idle' || n === 'walk' || n === 'run') return { type: 'loop', name: n };
    if (n === 'hit') return { type: 'hit', name: 'hit' };
    if (n === 'die') return { type: 'die', name: 'die' };
    const shots = this.rig.shots;
    if (shots[name]) return { type: 'shot', name };
    if (shots[n]) return { type: 'shot', name: n };
    if (/attack|slash|stab|crush|swing|punch|kick|bite|claw|peck|shoot|cast|spell|magic|melee|smash|bash|lunge|thrust|charge|sting|slam/.test(name)) {
      if (this.spec.rig === 'wyrm' && n === 'attack') return { type: 'shot', name: this.a.state.attackN++ % 3 === 2 ? 'claw' : 'attack' };
      return { type: 'shot', name: 'attack' };
    }
    if (n === 'roar' || n === 'breath' || n === 'fire') return { type: 'shot', name: shots.breath && n !== 'roar' ? 'breath' : shots.roar ? 'roar' : 'attack' };
    return { type: 'loop', name: 'idle' };
  }
  shotDef(name) { return this.rig.shots[name] || this.rig.shots.attack; }
  timing(name) {
    const d = this.rig.shots[name] || this.rig.shots[this.resolve(name).name] || this.rig.shots.attack;
    return { dur: d.dur, release: d.release ?? d.impact ?? d.dur * 0.45, impact: d.impact ?? d.release ?? d.dur * 0.45 };
  }
  evaluate(dt) {
    const a = this.a, st = a.state, c = this.c, P = this.P, O = this.O, T = this.T, rig = this.rig;
    c.t += dt;
    const base = st.base === 'run' && !rig.loops.run ? 'run*' : st.base;
    const tgt = { idle: 0, walk: 0, run: 0 };
    if (base === 'walk' || base === 'run*') tgt.walk = 1; else if (base === 'run') tgt.run = 1; else tgt.idle = 1;
    let sum = 0;
    for (const k in this.loco) { this.loco[k] = dt > 0 ? damp(this.loco[k], tgt[k], 8, dt) : tgt[k]; if (this.loco[k] < 0.002) this.loco[k] = 0; sum += this.loco[k]; }
    const nominal = st.base === 'run' ? 3.4 : 1.7;
    const spd = st.speed > 0.25 ? st.speed : (st.base === 'walk' || st.base === 'run' ? nominal : 0);
    const stride = this.stride * a.scale * (this.loco.run > 0.5 ? 1.5 : 1);
    c.ph = (c.ph + (dt * spd) / Math.max(0.2, stride)) % 1;
    st.moveK = clamp(this.loco.walk + this.loco.run, 0, 1);
    P.fill(0);
    let first = true;
    for (const k of ['idle', 'walk', 'run']) {
      const w = this.loco[k];
      if (w <= 0) continue;
      (rig.loops[k] || rig.loops.walk)(T, c);
      const f = w / sum;
      if (first) { for (let i = 0; i < P.length; i++) P[i] = T[i] * f; first = false; }
      else for (let i = 0; i < P.length; i++) P[i] += T[i] * f;
    }
    if (st.shot) {
      const def = st.shotDef;
      st.shotT += dt * (st.rate || 1);
      const w = env(st.shotT, st.shotDur, 0.08, Math.min(0.25, st.shotDur * 0.3));
      O.set(P);
      def.fn(O, st.shotT, c);
      for (let i = 0; i < P.length; i++) P[i] += (O[i] - P[i]) * w;
      if (def.release !== undefined && !st.released && st.shotT >= def.release) { st.released = true; st.onRelease?.(); }
      if (st.shotT >= st.shotDur) { st.shot = null; st.shotDef = null; }
    }
    if (st.dead) {
      st.dieW = dt > 0 ? damp(st.dieW, 1, 12, dt) : 1;
      O.fill(0);
      rig.loops.idle(O, c);
      rig.die.fn(O, st.deadT, c);
      for (let i = 0; i < P.length; i++) P[i] += (O[i] - P[i]) * st.dieW;
    }
    if (st.hurtK > 0.001 && !st.dead) rig.hurt(P, st.hurtK);
    const bones = this.bones, n = this.n;
    for (let i = 0; i < n; i++) bones[i].rotation.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const o = n * 3;
    bones[1].position.set(this.bind1.x + P[o], this.bind1.y + P[o + 1], this.bind1.z + P[o + 2]);
    bones[1].scale.set(1 + P[o + 3], 1 + P[o + 4], 1 + P[o + 5]);
  }
  socket(part, out) {
    const b = this.bones, I = this.R.index;
    this.a.root.updateMatrixWorld(true);
    const rig = this.spec.rig;
    switch (part) {
      case 'mouth': case 'weapon':
        if (rig === 'wyrm') return b[I.jaw].localToWorld(out.set(0, 0.02, -0.3));
        if (rig === 'quadruped' || rig === 'bird') return b[I.head].localToWorld(out.set(0, 0, -0.2));
        if (rig === 'spider') return b[I.head].localToWorld(out.set(0, 0, -0.15));
        if (rig === 'slime') return b[I.maw].localToWorld(out.set(0, 0.1, -0.05));
        return b[1].localToWorld(out.set(0, 0, 0));
      case 'head': {
        const hb = I.head ?? I.top ?? 1;
        return b[hb].localToWorld(out.set(0, 0.2, 0));
      }
      case 'feet': return out.copy(this.a.root.position);
      default: return b[I.chest ?? I.body ?? 1].localToWorld(out.set(0, 0, 0));
    }
  }
  dispose() { this.mesh?.removeFromParent(); releaseGeometry(this.key); this.mesh = null; }
}

class RigidDriver {
  constructor(actor, kind, model) {
    this.a = actor;
    this.kind = kind;
    this.obj = kind === 'oracle' ? buildOracle() : buildWisp(model?.colors);
    actor.body.add(this.obj.root);
    actor.headHeight = this.obj.headHeight * actor.scale;
    actor.blob = kind === 'oracle' ? 0 : 0.25;
    actor.mesh = null;
    this.shots = { attack: { dur: 0.9, release: 0.45 }, cast: { dur: 0.9, release: 0.45 }, consult: { dur: 2.2, release: 1.0 } };
  }
  resolve(name) {
    const n = AN.resolveAnim(name) || name;
    if (n === 'walk' || n === 'run' || n === 'idle') return { type: 'loop', name: n };
    if (n === 'talk') return { type: 'talk', name: 'idle' };
    if (n === 'hit') return { type: 'hit', name: 'hit' };
    if (n === 'die') return { type: 'die', name: 'die' };
    if (name === 'consult' || n === 'think' || n === 'cast' || name === 'answer') return { type: 'shot', name: 'consult' };
    if (/attack|cast|shoot|bolt|spell|magic|slash|crush|stab|punch/.test(name)) return { type: 'shot', name: 'attack' };
    if (AN.ONE_SHOTS.has(n)) return { type: 'shot', name: 'consult' };
    return { type: 'loop', name: 'idle' };
  }
  shotDef(name) { return this.shots[name] || this.shots.attack; }
  timing(name) { const d = this.shots[this.resolve(name).name] || this.shots.attack; return { dur: d.dur, release: d.release, impact: d.release }; }
  evaluate(dt) {
    const st = this.a.state;
    st.moveK = damp(st.moveK, st.base === 'walk' || st.base === 'run' ? 1 : 0, 6, Math.max(dt, 0.0001));
    st.talkK = damp(st.talkK, st.talking || this.a.sys.time < (st.talkUntil || 0) ? 1 : 0, 4, Math.max(dt, 0.0001));
    if (st.shot) {
      st.shotT += dt;
      if (st.shotDef.release !== undefined && !st.released && st.shotT >= st.shotDef.release) { st.released = true; st.onRelease?.(); }
      if (st.shotT >= st.shotDur) { st.shot = null; st.shotDef = null; }
    }
    this.obj.animate(this.a, dt);
    // Ambient motes around glowing beings (only when close to the camera).
    if (this.a.dist < 45 && !st.dead && dt > 0) {
      this.moteT = (this.moteT || 0) - dt;
      if (this.moteT <= 0) {
        this.moteT = this.kind === 'oracle' ? 0.12 : 0.3;
        if (this.kind === 'oracle') this.a.sys.fx.motes(this.a, { radius: 1.0, height: 1.2 });
        else this.a.sys.fx.motes(this.a.socket('chest', _v), { radius: 0.3, height: 0.2, y0: -0.2, color: this.obj.colors?.core || 'orbio', color2: this.obj.colors?.glow || 'magic', life: 1.2, speed: 0.3 });
      }
    }
  }
  socket(part, out) {
    this.a.root.updateMatrixWorld(true);
    if (part === 'feet') return out.copy(this.a.root.position);
    return this.obj.socket.getWorldPosition(out);
  }
  dispose() { this.obj.root.removeFromParent(); }
}

// ---------------------------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------------------------
class Actor {
  constructor(sys, spec) {
    this.sys = sys;
    this.spec = spec;
    this.kind = spec.kind || 'humanoid';
    this.player = !!spec.player;
    this.root = new THREE.Group();
    this.root.name = 'actor';
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.headHeight = 1.8;
    this.userVisible = true;
    this.state = {
      base: 'idle', shot: null, shotT: 0, shotDur: 0, shotDef: null, released: true, onRelease: null,
      dead: false, deadT: 0, dieW: 0, faded: 0, hurtK: 0, hurtT: 9, talking: false, talkK: 0, moveK: 0, speed: 0,
      readyT: 0, attackN: 0, rate: 1, toolTint: null, req: new Map(), shotReq: null,
    };
    this.yaw = 0; this.yawTarget = 0; this.yawInit = false;
    this.prevPos = new THREE.Vector3(); this.hasPrev = false;
    this.acc = 0; this.frame = (Math.random() * 4) | 0;
    this.flashT = 0; this.lastHit = -1;
    this._fadeMat = null;
    this.current = 'idle';
    this.dist = 0;
    const model = spec.model || {};
    if (this.kind === 'oracle') { this.scale = 1; this.drv = new RigidDriver(this, 'oracle'); }
    else if (this.kind === 'creature' && model.rig === 'wisp') { this.scale = model.scale || 1; this.drv = new RigidDriver(this, 'wisp', model); }
    else if (this.kind === 'creature' && (model.rig === 'biped' || model.rig === 'golem' || !model.rig && model.body)) {
      this.scale = model.scale || 1;
      const b = bipedFromModel(model, spec.monster || '');
      this.drv = new HumanDriver(this, b.look, b.variant, b.outfit);
    } else if (this.kind === 'creature') { this.scale = model.scale || 1; this.drv = new CreatureDriver(this, model, spec.monster || ''); }
    else { this.scale = 1; this.drv = new HumanDriver(this, spec.look || {}, 'human', {}); }
    this.root.scale.setScalar(this.scale);
  }

  // ---- API ----
  setPosition(x, y, z) { this.root.position.set(x, y, z); }
  setYaw(yaw) {
    this.yawTarget = yaw;
    if (!this.yawInit) { this.yaw = yaw; this.yawInit = true; this.root.rotation.y = yaw; }
  }
  play(name, opts = {}) {
    if (!name) return;
    const st = this.state;
    opts = opts || {};
    // Callers either fire a one-shot once or keep requesting it every frame for a window; a
    // request that continues an uninterrupted stream of the same name never restarts it.
    const now = this.sys.time;
    const last = st.req.get(name);
    const continuing = last !== undefined && now - last < 0.2;
    st.req.set(name, now);
    if (st.req.size > 24) st.req.clear();
    if (opts.tool !== undefined) st.toolTint = toolTint(opts.tool);
    if (continuing && !opts.restart && st.shotReq === name) return;
    const r = this.drv.resolve(opts.variant && this.drv.resolve(opts.variant).type === 'shot' ? opts.variant : name);
    if (st.dead) {
      if (r.type === 'die') return;
      if ((r.name === 'walk' || r.name === 'run') && st.deadT > 1.5) this.revive();
      else return;
    }
    switch (r.type) {
      case 'loop':
        if (st.base !== r.name) {
          st.base = r.name;
          if ((r.name === 'walk' || r.name === 'run') && st.shot && st.shotDef?.cancelOnMove) this._endShot();
        }
        st.rate = opts.speed || 1;
        this.current = st.shot ? st.shotName : r.name;
        break;
      case 'shot': {
        if (st.shot && (st.shotName === r.name || st.shotReq === name) && !opts.restart && st.shotT < st.shotDur * 0.85) return;
        if (continuing && !opts.restart && !st.shot) { st.shotReq = name; return; }
        const def = this.drv.shotDef(r.name);
        if (!def) return;
        st.shot = r.name; st.shotName = r.name; st.shotReq = name; st.shotDef = def; st.shotT = 0; st.shotDur = def.dur;
        st.released = def.release === undefined; st.onRelease = opts.onRelease || null; st.rate = opts.speed || 1;
        if (/slash|stab|crush|swing|punch|kick|shoot|cast|attack|claw|breath/.test(r.name)) st.readyT = 5;
        this.current = r.name;
        break;
      }
      case 'hit': this.hit(); break;
      case 'die': this.die(); break;
      case 'talk': st.talkUntil = this.sys.time + 0.35; break;
      default:
        if (st.base !== 'idle') st.base = 'idle';
        this.current = 'idle';
    }
  }
  emote(name) { this.play(name, { restart: true }); }
  // Debug / photo mode: play `name` and hold the pose at time t (seconds). freeze(false) resumes.
  debugPose(name, t = 0.5) {
    this.frozen = false;
    if (name === 'die') this.die(); else this.play(name, { restart: true });
    const dt = 1 / 30;
    for (let k = 0; k < t; k += dt) { if (this.state.dead) this.state.deadT += dt; this.drv.evaluate(dt); }
    this.frozen = true;
  }
  freeze(on = true) { this.frozen = !!on; }
  setTalking(on) { this.state.talking = !!on; }
  setLook(look) { if (this.drv.setLook) this.drv.setLook(look); }
  setEquipment(eq) { if (this.drv.setEquipment) this.drv.setEquipment(eq); }
  setVisible(v) {
    v = !!v;
    if (!v && this.userVisible && this.state.dead && !this.state.smoked) {
      this.state.smoked = true;
      if (this.dist < 60) this.sys.fx.deathSmoke(this, { scale: Math.max(0.6, this.headHeight / 1.8) });
    }
    this.userVisible = v;
    this.root.visible = v;
  }
  hit(o = {}) {
    const st = this.state;
    if (st.dead) return;
    const now = this.sys.time;
    if (now - this.lastHit < 0.05) return;
    this.lastHit = now;
    st.hurtT = 0;
    st.hurtK = Math.max(st.hurtK, 0.6);
    st.readyT = Math.max(st.readyT, 4);
    if (this.mesh && !this._fadeMat) { this.mesh.material = this.drv.flashMaterial ? this.drv.flashMaterial() : materials().flash; this.flashT = 0.12; }
  }
  die(o = {}) {
    const st = this.state;
    if (st.dead) return;
    st.dead = true; st.deadT = 0; st.dieW = 0; st.shot = null; st.shotDef = null; st.faded = 0;
    st.fade = o.fade !== undefined ? !!o.fade : true;
    st.smoked = false;
    this.current = 'die';
  }
  revive() {
    const st = this.state;
    st.dead = false; st.deadT = 0; st.dieW = 0; st.faded = 0; st.hurtK = 0; st.shot = null; st.shotDef = null; st.base = 'idle';
    if (this.mesh) { this.mesh.visible = true; this.mesh.material = this.drv.bodyMaterial ? this.drv.bodyMaterial() : materials().body; }
    if (this._fadeMat) { this._fadeMat.dispose(); this._fadeMat = null; }
    if (this.drv.obj) this.drv.obj.root.visible = true;
    this.body.scale.multiplyScalar(1); // keep
    this.spawnT = 0.35;
    this.current = 'idle';
  }
  update() { /* animation is driven by actors.update(); kept for the API */ }
  socket(part = 'chest', out = new THREE.Vector3()) { return this.drv.socket(part, out); }
  timing(name) { return this.drv.timing(name); }
  get dead() { return this.state.dead; }
  dispose() {
    this.drv.dispose();
    if (this._fadeMat) this._fadeMat.dispose();
    this.root.removeFromParent();
    this.sys.list.delete(this);
  }

  _endShot() { this.state.shot = null; this.state.shotDef = null; }

  // ---- per-frame (called by the system) ----
  _frame(dt, dist, full) {
    const st = this.state;
    // Smooth turning.
    const dy = wrapAngle(this.yawTarget - this.yaw);
    this.yaw += dy * (1 - Math.exp(-14 * dt));
    this.root.rotation.y = this.yaw;
    // Measured ground speed (teleports ignored).
    const p = this.root.position;
    if (this.hasPrev && dt > 0) {
      const d = Math.hypot(p.x - this.prevPos.x, p.z - this.prevPos.z) / this.scale;
      const v = d / dt;
      if (d > 3) { st.speed = 0; if (st.dead && st.deadT > 1) this.revive(); }
      else st.speed = damp(st.speed, Math.min(v, 9), 10, dt);
    }
    this.prevPos.copy(p); this.hasPrev = true;
    if (this.frozen) return;
    // Timers.
    st.hurtT += dt;
    st.hurtK = st.hurtT < 0.06 ? st.hurtK : st.hurtK * Math.exp(-dt * 7);
    if (st.readyT > 0) st.readyT -= dt;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0 && this.mesh && !this._fadeMat) this.mesh.material = this.drv.bodyMaterial ? this.drv.bodyMaterial() : materials().body; }
    if (st.dead) {
      st.deadT += dt;
      const hold = this.player ? 2.6 : 1.6;
      if (st.fade && st.deadT > hold) {
        if (!st.smoked) { st.smoked = true; if (dist < 60) this.sys.fx.deathSmoke(this, { scale: Math.max(0.6, this.headHeight / 1.8) }); }
        st.faded = clamp((st.deadT - hold) / 0.7, 0, 1);
        if (this.mesh) {
          if (!this._fadeMat) { this._fadeMat = this.drv.fadeMaterial ? this.drv.fadeMaterial() : fadeMaterial(); this.mesh.material = this._fadeMat; }
          this._fadeMat.opacity = 1 - st.faded;
          if (st.faded >= 1) this.mesh.visible = false;
        }
        if (this.drv.obj && st.faded >= 1) this.drv.obj.root.visible = false;
      }
    }
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      const k = 1 - clamp(this.spawnT / 0.35, 0, 1);
      this.root.scale.setScalar(this.scale * (0.6 + 0.4 * (1 - (1 - k) ** 3)));
      if (this.spawnT <= 0) this.root.scale.setScalar(this.scale);
    }
    // Animation (frozen / decimated with distance).
    this.acc += dt;
    if (!full || this.frozen) return;
    const step = Math.min(this.acc, 0.25);
    this.acc = 0;
    this.drv.evaluate(step);
    // Running dust for the player and close actors.
    if (st.base === 'run' && st.speed > 2 && dist < 25 && this.drv.c) {
      const ph = this.drv.c.ph;
      if ((this._lastPh < 0.5 && ph >= 0.5) || (this._lastPh > ph)) this.sys.fx.dust(this);
      this._lastPh = ph;
    }
  }
}

function toolTint(tool) {
  if (!tool) return null;
  const it = ITEMS[tool];
  if (it?.equip?.model?.tint) return it.equip.model.tint;
  return tool;
}

// ---------------------------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------------------------
export function createActors(ctx) {
  const root = new THREE.Group();
  root.name = 'actors';
  ctx.scene.add(root);
  const list = new Set();
  const sys = { root, list, time: 0, fx: null, onImpact: null };
  const fx = createFx(ctx, ctx.scene);
  sys.fx = fx;
  const auto = { hits: true, deaths: true, levelUp: true, talk: true, emotes: true, loot: true, skillFx: true };

  sys.onImpact = (actor, anim) => {
    if (!auto.skillFx || actor.dist > 30) return;
    if (anim === 'chop') fx.chips(actor, 'wood');
    else if (anim === 'mine') fx.chips(actor, 'rock');
    else if (anim === 'smith') fx.chips(actor, 'anvil');
    else if (anim === 'harpoon') fx.splash(actor.socket('weapon', new THREE.Vector3()).setY(Math.max(0, actor.root.position.y - 0.3)), { size: 0.5 });
  };

  function create(spec = {}) {
    const a = new Actor(sys, spec);
    root.add(a.root);
    list.add(a);
    return a;
  }

  // Soft contact shadows: one instanced draw call for every visible actor near the camera.
  const BLOBS = 256;
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: shadowTexture(), transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, BLOBS);
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blobs.frustumCulled = false;
  blobs.renderOrder = 1;
  blobs.name = 'actor-blobs';
  blobs.count = 0;
  root.add(blobs);
  const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bs = new THREE.Vector3(), _bp = new THREE.Vector3(), _bn = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  setFaceRenderer(ctx.renderer);
  let frame = 0;
  const camPos = new THREE.Vector3();
  function update(dt) {
    frame++;
    sys.time += dt;
    SHARED.time.value = sys.time;
    ctx.camera.getWorldPosition(camPos);
    const fogFar = ctx.scene.fog?.far ?? 220;
    const cull = Math.min(fogFar + 25, ctx.engine?.preset?.drawDistance ?? 400);
    const shadows = !!ctx.engine?.preset?.shadows;
    // Outline: ~1.6 CSS px wide at any distance; off on low quality, limited range on medium.
    const q = ctx.engine?.quality || 'medium';
    const olRange = q === 'low' ? 0 : q === 'medium' ? 30 : 55;
    if (olRange) {
      const hpx = ctx.renderer?.domElement?.height || innerHeight;
      const fov = (ctx.camera.fov || 50) * Math.PI / 180;
      SHARED.outline.value = 1.6 * (ctx.renderer?.getPixelRatio?.() || 1) * 2 * Math.tan(fov / 2) / hpx;
    }
    let nb = 0;
    blobMat.opacity = shadows ? 0.35 : 0.55;
    for (const a of list) {
      const p = a.root.position;
      const d = Math.hypot(p.x - camPos.x, p.y - camPos.y, p.z - camPos.z);
      a.dist = d;
      if (!a.userVisible) { a.root.visible = false; continue; }
      const vis = d < cull + a.headHeight * 2;
      a.root.visible = vis;
      if (!vis) { a.acc += dt; continue; }
      if (d < 70 && nb < BLOBS && a.blob > 0) {
        const fade = a.state.dead ? 1 - a.state.faded : 1;
        const r = a.blob * a.scale * fade;
        if (r > 0.02) {
          // Lie on the local terrain slope, lifted a little to clear the ground mesh.
          const H = ctx.map?.heightAt;
          let gy = p.y;
          if (H) {
            const e = Math.max(0.3, r);
            const hx = H(p.x + e, p.z) - H(p.x - e, p.z), hz = H(p.x, p.z + e) - H(p.x, p.z - e);
            _bn.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
            _bq.setFromUnitVectors(UP, _bn);
            gy = Math.max(p.y, H(p.x, p.z));
          } else _bq.identity();
          _bs.set(r * 3.4, 1, r * 3.4);
          _bp.set(p.x, gy + 0.09, p.z);
          _bm.compose(_bp, _bq, _bs);
          blobs.setMatrixAt(nb++, _bm);
        }
      }
      if (a.mesh) a.mesh.castShadow = shadows && (a.player || d < 42);
      if (a.outline) a.outline.visible = d < olRange && !a.state.dead && a.mesh?.visible !== false && !a.noOutline;
      // Full-rate animation near the camera, decimated further away.
      const every = a.player || d < 32 ? 1 : d < 64 ? 2 : d < 110 ? 4 : 8;
      const full = (frame + a.frame) % every === 0;
      a._frame(dt, d, full);
    }
    blobs.count = nb;
    blobs.instanceMatrix.needsUpdate = true;
    fx.update(dt);
  }

  // ---- Event hooks (visual reactions; the game may also call these directly) ----
  const ev = ctx.events;
  const viewOf = (e) => (e && e.view && e.view.play ? e.view : e && e.play ? e : null);
  ev?.on?.('combat:hit', (d) => {
    if (!auto.hits || !d) return;
    const v = viewOf(d.target);
    if (!v) return;
    if (d.type === 'miss') { if (v.drv?.shield) v.play('block'); return; }
    if (d.type === 'heal') { fx.heal(v); return; }
    if ((d.amount || 0) > 0 || d.type === 'burn') {
      v.hit();
      if (v.dist < 60) fx.hitSpark(v, { color: d.type === 'burn' ? 'fire' : 'spark' });
    }
  });
  const onDeath = (d) => { if (!auto.deaths) return; const v = viewOf(d?.entity); if (v) v.die(); };
  ev?.on?.('monster:death', onDeath);
  ev?.on?.('entity:death', onDeath);
  ev?.on?.('player:death', () => { if (auto.deaths) ctx.player?.actor?.die?.(); });
  ev?.on?.('level:up', () => { if (!auto.levelUp) return; const a = ctx.player?.actor; if (a) fx.levelUp(a); });
  const talkFor = (d, on) => {
    if (!auto.talk) return;
    if (d?.entity?.view?.setTalking) { d.entity.view.setTalking(on); return; }
    if (!ctx.entities?.all) return;
    for (const e of ctx.entities.all()) if (e.kind === 'npc' && (e.defId === d?.npcId || e.uid === d?.npcId || e.uid === d?.uid)) e.view?.setTalking?.(on);
  };
  ev?.on?.('dialogue:open', (d) => talkFor(d, true));
  ev?.on?.('dialogue:close', (d) => talkFor(d, false));
  ev?.on?.('emote', (d) => {
    if (!auto.emotes || !d?.name) return;
    const v = d.entity ? viewOf(d.entity) : d.peer ? null : ctx.player?.actor;
    v?.emote?.(d.name);
  });
  ev?.on?.('loot:drop', (d) => {
    if (!auto.loot || !d?.rare) return;
    const e = d.entity;
    if (e?.pos) fx.sparkle(e.pos);
  });

  function stats() {
    let vis = 0, anim = 0;
    for (const a of list) { if (a.root.visible) vis++; if (a.dist < 32) anim++; }
    return { actors: list.size, visible: vis, fullRate: anim, particles: fx.count, projectiles: fx.projectiles, geometry: geometryCacheStats() };
  }

  // ---- Chat-head portraits rendered from the real actor (dialogue box, creator, title card) ----
  // portrait(look, size) -> canvas with a transparent background (head and shoulders, 3/4 view).
  let P = null;
  function portrait(look = {}, size = 192) {
    const renderer = ctx.renderer;
    if (!renderer) return null;
    if (!P) {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xfff2dc, 0x6a5a4c, 1.6));
      const key = new THREE.DirectionalLight(0xfff0d8, 2.6); key.position.set(-0.8, 1.8, -2.6); scene.add(key);
      const rim = new THREE.DirectionalLight(0xb8d0ff, 1.4); rim.position.set(2, 1.5, 2.5); scene.add(rim);
      const cam = new THREE.PerspectiveCamera(22, 1, 0.05, 20);
      const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      P = { scene, cam, rt, buf: new Uint8Array(size * size * 4), size };
    }
    if (P.size !== size) { P.rt.setSize(size, size); P.buf = new Uint8Array(size * size * 4); P.size = size; }
    let a = null;
    const prevTarget = renderer.getRenderTarget(), prevAlpha = renderer.getClearAlpha(), prevColor = new THREE.Color();
    renderer.getClearColor(prevColor);
    const prevOutline = SHARED.outline.value;
    try {
      a = new Actor(sys, { kind: 'humanoid', look, npc: true });
      a.root.position.set(0, 0, 0);
      a.root.rotation.y = 0;
      a.yaw = 0; a.yawInit = true;
      P.scene.add(a.root);
      a.root.updateMatrixWorld(true);
      if (a.outline) a.outline.visible = true;
      const hh = a.headHeight;
      const hy = hh - 0.2;
      P.cam.position.set(0.42, hy + 0.06, -1.25);
      P.cam.lookAt(0.02, hy - 0.08, 0);
      SHARED.outline.value = 2.2 * 2 * Math.tan((22 * Math.PI) / 360) / size;
      renderer.setRenderTarget(P.rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(P.scene, P.cam);
      renderer.readRenderTargetPixels(P.rt, 0, 0, size, size, P.buf);
    } catch (err) {
      console.warn('[actors] portrait', err);
      return null;
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(prevColor, prevAlpha);
      SHARED.outline.value = prevOutline;
      if (a) { P.scene.remove(a.root); try { a.drv.dispose(); } catch { /* ignore */ } }
    }
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    // Flip rows (GL origin is bottom-left) and un-premultiply nothing: the RT holds straight RGBA.
    for (let y = 0; y < size; y++) img.data.set(P.buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    g.putImageData(img, 0, 0);
    return c;
  }

  // Generated models: preload (boot waits on this, bounded by the timeout), hero list for the
  // creator, and a hook for UI caches (portraits) to refresh once a model arrives.
  const preload = (ids = [...MODELS], timeout = 8000) => preloadModels(ids, timeout);
  const onModel = (fn) => onModelLoaded(fn);
  const heroes = () => HERO_MODELS.slice();

  return { create, update, fx, list, auto, stats, outfitFromEquipment, portrait, preload, onModel, heroes };
}
