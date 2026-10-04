// Procedural low-poly character shared by the player and every NPC.
// One SkinnedMesh per body (single draw call), a batik kain cloth, optional hanging lantern /
// fishing rod / sketchbook, and a procedural animator for every anim.state.
// Owner: player. Contract: DESIGN.md §7 Player (character).
//
// createCharacter(opts) -> { root, lanternSocket, headBone, height, update(dt, anim),
//                            setLantern(visible), setKainOpen(0..1), ...extras }
// opts: { skin, top, bottom, kain (colour | [base, ink, accent] | {base, ink, accent, motif} | false),
//         hair: 'short'|'bun'|'long'|'peci'|'caping'|'kerudung', build: 'slim'|'normal'|'stout'|'old',
//         accessory: 'lantern'|'rod'|'sketchbook'|'none', ghost: bool,
//         extras: hairColor, pants, pantsLength (0..1), bottomStyle ('sarung'|'kain'|'celana'),
//         bottomMotif ('kotak'|'parang'|'kawung'), sleeves ('short'|'long'|'none'), scarf (kerudung
//         colour), udeng (colour | true), flameColor }
// anim: { state: 'idle'|'walk'|'run'|'jump'|'fall'|'glide'|'swim'|'sit'|'talk'|'wave'|'flare'
//         (+ 'slide'|'climb'), speed (m/s), lookAt: Vector3|null, talk: 0..1,
//         extras: sitStyle ('chair' | 'edge' legs dangling | 'floor' knees up; default 'chair', 'edge'
//         for the rod), seat (seat height above the root: chair 0.45, edge/floor 0), flare (0..1),
//         waterY (cloth floats on it) }

import * as THREE from 'three';
import { patchMaterial } from '../world/fog.js';
import { clamp, damp, lerp, smoothstep, wrapAngle } from '../core/math.js';
import {
  BONE, BONE_COUNT, BUILDS, bindLayout, createBones, buildBodyGeometry, bodyAtlas, batikTexture,
  glowTexture, lanternGeometry, mergeColored,
} from './charparts.js';
import { createKain } from './kain.js';
import * as AN from './anim.js';

const OFF = AN.OFF;

// ---------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------
// Shared rim colour: a cool fog-lit edge so silhouettes read at night.
export const CHARACTER_RIM = { value: new THREE.Color(0.11, 0.12, 0.2) };

function addRim(mat, key) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCharRim = CHARACTER_RIM;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uCharRim;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += uCharRim * pow(rimF, 2.6);
      }`);
  };
  mat.customProgramCacheKey = () => 'lenteraChar' + key;
  return mat;
}

function bodyMaterial(map) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: 0.8, metalness: 0 });
  return patchMaterial(addRim(m, 'Body'));
}

function clothMaterial(map) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.86, metalness: 0, side: THREE.DoubleSide });
  return patchMaterial(addRim(m, 'Cloth'));
}

// Ki Lamun: translucent, additive, cool-blue with a bright fresnel edge that fades toward the feet.
export const GHOST_TIME = { value: 0 };
function ghostMaterial(map) {
  const m = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0x3d6dcc, emissiveIntensity: 0.55, map: map || null,
    transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending,
    side: map ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGhostTime = GHOST_TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGhostY;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvGhostY = transformed.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGhostY;\nuniform float uGhostTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        float rimF = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
        float wisp = 0.82 + 0.18 * sin(uGhostTime * 2.3 + vGhostY * 9.0);
        totalEmissiveRadiance = (totalEmissiveRadiance + vec3(0.55, 0.85, 1.6) * pow(rimF, 2.2)) * wisp;
        totalEmissiveRadiance *= smoothstep(0.05, 0.75, vGhostY);
      }`);
  };
  m.customProgramCacheKey = () => 'lenteraGhost' + (map ? 'M' : '');
  return patchMaterial(m);
}

let lanternMats = null;
function getLanternMats() {
  if (lanternMats) return lanternMats;
  lanternMats = {
    metal: patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35 })),
    glass: patchMaterial(new THREE.MeshBasicMaterial({
      color: 0xffb35c, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false,
    })),
  };
  return lanternMats;
}
let lanternGeo = null;

// ---------------------------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------------------------
const DEFAULT_KAIN = { base: '#7a4524', ink: '#252c57', accent: '#ecd9ae', motif: 'parang' };

function kainColours(k) {
  if (k === false || k === null || k === 'none') return null;
  if (k === undefined || k === true) return { ...DEFAULT_KAIN };
  if (Array.isArray(k)) return { base: k[0] ?? DEFAULT_KAIN.base, ink: k[1] ?? DEFAULT_KAIN.ink, accent: k[2] ?? DEFAULT_KAIN.accent, motif: k[3] || 'parang' };
  if (typeof k === 'object' && !(k instanceof THREE.Color)) return { ...DEFAULT_KAIN, ...k };
  return { ...DEFAULT_KAIN, base: k };
}

function normaliseLook(opts) {
  const o = { ...(opts.colors || {}), ...opts };
  const hairStyle = ['short', 'bun', 'long', 'peci', 'caping', 'kerudung'].includes(o.hair) ? o.hair : 'short';
  const buildName = BUILDS[o.build] ? o.build : 'normal';
  const old = buildName === 'old';
  const feminine = hairStyle === 'kerudung' || hairStyle === 'bun' || hairStyle === 'long';
  const bottomStyle = o.bottomStyle || (feminine ? 'kain' : 'sarung');
  const bottom = new THREE.Color(o.bottom ?? (bottomStyle === 'kain' ? '#7a4a2a' : '#2f3a5c'));
  const kain = kainColours(o.kain);
  return {
    buildName,
    old,
    hairStyle,
    skin: o.skin ?? '#c68b5f',
    top: o.top ?? (feminine ? '#6d4a6b' : '#d8ccb2'),
    topFn: null,
    bottom,
    bottomStyle,
    bottomMotif: o.bottomMotif || (bottomStyle === 'kain' ? 'parang' : 'kotak'),
    bottomInk: o.bottomInk ?? (bottomStyle === 'kain' ? '#2a2440' : bottom.clone().multiplyScalar(0.45)),
    bottomAccent: o.bottomAccent ?? (bottomStyle === 'kain' ? '#e3cfa2' : '#cdb88c'),
    band: o.band ?? bottom.clone().multiplyScalar(0.7),
    pants: o.pants ?? '#24212a',
    pantsLength: bottomStyle === 'kain' ? 0 : (o.pantsLength ?? (bottomStyle === 'celana' ? 1 : 0.62)),
    hair: o.hairColor ?? (old ? '#bdb6ab' : '#1b1512'),
    brow: o.browColor ?? (old ? '#8f877c' : '#17110e'),
    sleeves: o.sleeves ?? (old || hairStyle === 'kerudung' ? 'long' : 'short'),
    scarf: o.scarf ?? o.kerudung ?? '#55628a',
    straw: o.straw ?? '#c7a466',
    accent: o.accent ?? '#c99a3c',
    sandal: o.sandal ?? '#3a291c',
    udeng: o.udeng === true ? (kain ? kain.base : '#7a4524') : (o.udeng || null),
    kain,
    accessory: ['lantern', 'rod', 'sketchbook'].includes(o.accessory) ? o.accessory : 'none',
    ghost: !!o.ghost,
    flameColor: o.flameColor ?? (o.ghost ? '#9fd8ff' : '#ffb04a'),
  };
}

// Base states (full-body poses) and how anim.state maps onto them.
const BASES = ['loco', 'jump', 'fall', 'glide', 'swim', 'sit', 'slide', 'climb'];
const BASE_OF = {
  idle: 'loco', walk: 'loco', run: 'loco', talk: 'loco', wave: 'loco', flare: 'loco',
  jump: 'jump', fall: 'fall', glide: 'glide', swim: 'swim', sit: 'sit', slide: 'slide', climb: 'climb',
};

// ---------------------------------------------------------------------------------------------
export function createCharacter(opts = {}) {
  const look = normaliseLook(opts);
  const build = BUILDS[look.buildName];
  const layout = bindLayout(build);

  const root = new THREE.Group();
  root.name = 'character';
  const body = new THREE.Group();
  body.scale.setScalar(build.scale);
  root.add(body);

  // ---- Skeleton + skinned body ----
  const bones = createBones(layout);
  const geo = buildBodyGeometry(bones, layout, build, look);
  const atlas = bodyAtlas(look);
  const bodyMat = look.ghost ? ghostMaterial() : bodyMaterial(atlas);
  const mesh = new THREE.SkinnedMesh(geo, bodyMat);
  mesh.name = 'character-body';
  mesh.castShadow = !look.ghost;
  mesh.receiveShadow = !look.ghost;
  body.add(bones[0]);
  body.add(mesh);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.45);
  if (look.ghost) mesh.renderOrder = 2;
  const bindHips = bones[BONE.hips].position.clone();

  // ---- Lantern ----
  const lantern = new THREE.Group();
  lantern.name = 'lantern';
  const lanternSocket = new THREE.Object3D();
  let flame = null, halo = null, glass = null;
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const flameBase = new THREE.Color(look.flameColor);
  const flameHot = new THREE.Color();
  if (look.accessory === 'lantern') {
    const mats = getLanternMats();
    if (!lanternGeo) lanternGeo = lanternGeometry();
    const frame = new THREE.Mesh(lanternGeo, mats.metal);
    frame.castShadow = true;
    glass = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.054, 0.128, 12, 1, true), mats.glass);
    glass.position.y = -0.18;
    const fg = new THREE.SphereGeometry(0.02, 8, 6);
    const fp = fg.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const y = fp.getY(i);
      const k = y > 0 ? 1 - (y / 0.02) * 0.7 : 1;
      fp.setXYZ(i, fp.getX(i) * k, y * (y > 0 ? 2.4 : 1.1), fp.getZ(i) * k);
    }
    flame = new THREE.Mesh(fg, patchMaterial(flameMat));
    flame.position.y = -0.2;
    halo = new THREE.Sprite(patchMaterial(new THREE.SpriteMaterial({
      map: glowTexture(), color: flameBase.clone(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55,
    })));
    halo.scale.setScalar(0.62);
    halo.position.y = -0.19;
    lantern.add(frame, glass, flame, halo);
    lantern.scale.setScalar(1.18 / build.scale);
    body.add(lantern);
  } else {
    // NPCs without a lantern: socket sits at the right hand.
    lantern.visible = false;
    body.add(lantern);
  }
  lanternSocket.position.y = -0.19;
  lantern.add(lanternSocket);

  // ---- Other props ----
  let rodTip = null, rodLine = null, bobber = null;
  if (look.accessory === 'rod') {
    const rod = new THREE.Group();
    const rodGeo = mergeColored([
      [new THREE.CylinderGeometry(0.005, 0.013, 2.3, 6), '#7a5530', { at: [0, 1.15, 0] }],
      [new THREE.CylinderGeometry(0.019, 0.019, 0.3, 6), '#2b1e15', { at: [0, 0.1, 0] }],
      [new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), '#4a4a4a', { at: [0.03, 0.32, 0], rot: [0, 0, Math.PI / 2] }],
    ]);
    const rodMesh = new THREE.Mesh(rodGeo, patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })));
    rodMesh.castShadow = true;
    rod.add(rodMesh);
    rod.position.set(0, -0.06, -0.01);
    rod.rotation.set(-2.35, 0, 0);
    rodTip = new THREE.Object3D();
    rodTip.position.y = 2.3;
    rod.add(rodTip);
    bones[BONE.haR].add(rod);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    rodLine = new THREE.Line(lg, patchMaterial(new THREE.LineBasicMaterial({ color: 0xd8d4c8, transparent: true, opacity: 0.55 })));
    rodLine.frustumCulled = false;
    bobber = new THREE.Mesh(
      mergeColored([
        [new THREE.SphereGeometry(0.03, 8, 6), '#d8392b', { at: [0, 0.015, 0], scale: [1, 0.8, 1] }],
        [new THREE.SphereGeometry(0.03, 8, 6), '#f2eee4', { at: [0, -0.012, 0], scale: [1, 0.6, 1] }],
      ]),
      patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })),
    );
    root.add(rodLine, bobber);
  }
  if (look.accessory === 'sketchbook') {
    const book = new THREE.Mesh(
      mergeColored([
        [new THREE.BoxGeometry(0.21, 0.022, 0.16), '#7b3b2a', { smooth: false }],
        [new THREE.BoxGeometry(0.2, 0.012, 0.15), '#efe6d2', { at: [0, 0.014, 0], smooth: false }],
        [new THREE.BoxGeometry(0.12, 0.002, 0.08), '#5c5047', { at: [0.01, 0.021, -0.01], smooth: false }],
      ]),
      patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })),
    );
    book.position.set(0.03, -0.07, -0.05);
    book.rotation.set(1.2, 0, -0.35);
    book.castShadow = true;
    bones[BONE.haL].add(book);
    const pencil = new THREE.Mesh(
      mergeColored([
        [new THREE.CylinderGeometry(0.0045, 0.0045, 0.13, 6), '#e2b23a'],
        [new THREE.ConeGeometry(0.0045, 0.02, 6), '#3a2a20', { at: [0, -0.075, 0], rot: [Math.PI, 0, 0] }],
      ]),
      patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })),
    );
    pencil.position.set(0, -0.075, -0.02);
    pencil.rotation.set(0.9, 0, 0.4);
    bones[BONE.haR].add(pencil);
  }

  // ---- Kain cloth ----
  let kain = null;
  if (look.kain) {
    const tex = batikTexture(look.kain);
    const mat = look.ghost ? ghostMaterial(tex) : clothMaterial(tex);
    kain = createKain({ material: mat, cols: 5, rows: 9, length: 0.92 * build.scale * (look.old ? 0.85 : 1) });
    kain.mesh.castShadow = !look.ghost;
    root.add(kain.mesh);
  }

  // ---------------------------------------------------------------------------------------------
  // Animator state
  // ---------------------------------------------------------------------------------------------
  const W = {}; for (const b of BASES) W[b] = b === 'loco' ? 1 : 0;
  const LW = { talk: 0, wave: 0, flare: 0, acc: 0 };
  const Pacc = AN.newPose(), Pt = AN.newPose(), Pa = AN.newPose(), Pb = AN.newPose(), Ov = AN.newPose();
  const c = {
    t: Math.random() * 100, ph: 0, spd: 0, run: 0, sprint: 0, lantern: look.accessory === 'lantern',
    old: look.old ? 1 : 0, seat: 0.45, sitStyle: 'chair', hipY: layout.hipY, swim: 0, stroke: 0,
  };
  let prevBase = 'loco';
  let impactT = 9, impactK = 0, impactDecay = 7;
  let hurtT = 9, hurtK = 0;
  let prevYaw = null, yawRate = 0, prevSpd = 0, accel = 0;
  let lookYaw = 0, lookPitch = 0;
  let glanceT = 2 + Math.random() * 3, glanceYaw = 0, glancePitch = 0, glanceHold = 0;
  let blinkT = 1 + Math.random() * 3, blink = 0;
  let kainOpen = 0, kainOpenTarget = 0;
  let flameLevel = 1;

  // Lantern pendulum (body-local angles around x and z).
  const pend = { ax: 0, az: 0, vx: 0, vz: 0, init: false };
  const gripW = new THREE.Vector3(), gripPrev = new THREE.Vector3(), gripVel = new THREE.Vector3(), gripVelPrev = new THREE.Vector3();
  const accW = new THREE.Vector3();
  const qInv = new THREE.Quaternion();
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const headW = new THREE.Vector3();

  // Kain pins & collision capsules.
  const pins = new Float32Array(15), pinsClosed = [], pinsOpen = [];
  for (let i = 0; i < 5; i++) { pinsClosed.push(new THREE.Vector3()); pinsOpen.push(new THREE.Vector3()); }
  const capsules = [
    { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0.19 * build.width * build.scale },
    { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0.15 * build.width * build.scale },
    { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0.2 * build.scale },
  ];
  const handL = new THREE.Vector3(), handR = new THREE.Vector3(), backC = new THREE.Vector3();
  const backDir = new THREE.Vector3(), backArr = [0, 0, 1];
  const rootPrev = new THREE.Vector3();
  let rootPrevInit = false;
  const rootVel = new THREE.Vector3();

  function setBaseWeights(base, dt) {
    let sum = 0;
    for (const b of BASES) {
      const fast = base === 'jump' || base === 'fall' || base === 'climb' || prevBase === 'jump';
      W[b] = damp(W[b], b === base ? 1 : 0, fast ? 16 : 9, dt);
      if (dt <= 0) W[b] = b === base ? 1 : W[b];
      if (W[b] < 0.002) W[b] = 0;
      sum += W[b];
    }
    if (sum <= 0) { W[base] = 1; sum = 1; }
    return sum;
  }

  function locoPose(out) {
    const m = smoothstep(0.08, 1.0, c.spd);
    if (m < 1) AN.poseIdle(out, c);
    if (m > 0) {
      c.run = smoothstep(3.4, 5.2, c.spd);
      c.sprint = smoothstep(6.4, 8.4, c.spd);
      if (c.run < 1) AN.poseWalk(Pa, c);
      if (c.run > 0) AN.poseRun(Pb, c);
      if (c.run <= 0) Pb.set(Pa);
      else if (c.run >= 1) Pa.set(Pb);
      for (let i = 0; i < AN.POSE_LEN; i++) {
        const cyc = Pa[i] + (Pb[i] - Pa[i]) * c.run;
        out[i] = m >= 1 ? cyc : out[i] + (cyc - out[i]) * m;
      }
    }
  }

  function basePose(b, out) {
    switch (b) {
      case 'loco': locoPose(out); break;
      case 'jump': AN.poseJump(out, c); break;
      case 'fall': AN.poseFall(out, c); break;
      case 'glide': AN.poseGlide(out, c); break;
      case 'swim': AN.poseSwim(out, c); break;
      case 'sit': AN.poseSit(out, c); break;
      case 'slide': AN.poseSlide(out, c); break;
      case 'climb': AN.poseClimb(out, c); break;
      default: AN.poseIdle(out, c);
    }
  }

  function overrideArms(P, O, bonesList, w) {
    if (w <= 0.001) return;
    for (const b of bonesList) {
      const k = b * 3;
      P[k] += (O[k] - P[k]) * w; P[k + 1] += (O[k + 1] - P[k + 1]) * w; P[k + 2] += (O[k + 2] - P[k + 2]) * w;
    }
  }

  function applyPose(P) {
    for (let i = 0; i < BONE_COUNT; i++) bones[i].rotation.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    bones[BONE.hips].position.set(bindHips.x + P[OFF], bindHips.y + P[OFF + 1], bindHips.z + P[OFF + 2]);
  }

  function updateLook(dt, anim, base) {
    // Desired head yaw/pitch (relative to the body facing).
    let ty = 0, tp = 0;
    const target = anim.lookAt;
    if (target && base !== 'glide' && base !== 'swim') {
      root.getWorldQuaternion(tmpQ);
      qInv.copy(tmpQ).invert();
      tmpV.set(target.x - headW.x, (target.y ?? headW.y) - headW.y, target.z - headW.z).applyQuaternion(qInv);
      const yaw = Math.atan2(-tmpV.x, -tmpV.z);
      const pitch = Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z));
      if (Math.abs(yaw) < 2.1) {
        ty = clamp(yaw, -1.2, 1.2);
        tp = clamp(pitch, -0.5, 0.45);
      }
    } else if (base === 'loco' && c.spd < 0.3 && LW.talk < 0.2) {
      // Idle glances.
      glanceT -= dt;
      if (glanceT <= 0) {
        if (glanceHold > 0) { glanceYaw = 0; glancePitch = 0; glanceHold = 0; glanceT = 3 + Math.random() * 4; }
        else {
          glanceYaw = (Math.random() - 0.5) * 1.3;
          glancePitch = (Math.random() - 0.6) * 0.3;
          glanceHold = 1;
          glanceT = 1.1 + Math.random() * 1.2;
        }
      }
      ty = glanceYaw; tp = glancePitch;
    }
    lookYaw = damp(lookYaw, ty, 5, dt);
    lookPitch = damp(lookPitch, tp, 5, dt);
  }

  function updatePendulum(dt) {
    if (!lantern.visible && look.accessory !== 'lantern') {
      // Keep the socket near the right hand for NPCs.
      bones[BONE.haR].getWorldPosition(gripW);
      lantern.position.copy(body.worldToLocal(gripW));
      return;
    }
    tmpV.set(0, -0.075, -0.012);
    bones[BONE.haR].localToWorld(gripW.copy(tmpV));
    if (!pend.init || gripW.distanceTo(gripPrev) > 2) {
      pend.init = true; pend.ax = pend.az = pend.vx = pend.vz = 0;
      gripPrev.copy(gripW); gripVel.set(0, 0, 0); gripVelPrev.set(0, 0, 0);
    }
    if (dt > 0) {
      gripVel.copy(gripW).sub(gripPrev).divideScalar(dt);
      accW.copy(gripVel).sub(gripVelPrev).divideScalar(dt);
      if (accW.length() > 60) accW.setLength(60);
      gripVelPrev.copy(gripVel);
      gripPrev.copy(gripW);
      // Into the body frame.
      body.getWorldQuaternion(tmpQ);
      qInv.copy(tmpQ).invert();
      accW.applyQuaternion(qInv);
      const L = 0.2, g = 9.8, damping = 2.4;
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        const axx = (-(g + accW.y) * Math.sin(pend.ax) + accW.z * Math.cos(pend.ax)) / L - damping * pend.vx;
        const azz = (-accW.x * Math.cos(pend.az) - (g + accW.y) * Math.sin(pend.az)) / L - damping * pend.vz;
        pend.vx += axx * h; pend.vz += azz * h;
        pend.ax = clamp(pend.ax + pend.vx * h, -1.3, 1.3);
        pend.az = clamp(pend.az + pend.vz * h, -1.3, 1.3);
      }
    }
    lantern.position.copy(body.worldToLocal(tmpV2.copy(gripW)));
    lantern.rotation.set(pend.ax, 0, pend.az);
  }

  function updateKain(dt, anim, base) {
    if (!kain) return;
    kainOpen = damp(kainOpen, kainOpenTarget, kainOpenTarget > kainOpen ? 7 : 4, dt);
    kain.open = kainOpen;
    const chest = bones[BONE.chest];
    const W0 = build.width;
    for (let i = 0; i < 5; i++) {
      const u = i / 4 - 0.5;
      const e = (2 * u) * (2 * u);
      pinsClosed[i].set(u * 0.4 * W0, 0.19 - 0.06 * e, 0.085 * W0 + 0.05 * (1 - e));
      chest.localToWorld(pinsClosed[i]);
    }
    if (kainOpen > 0.01) {
      bones[BONE.haL].localToWorld(handL.set(0, -0.06, 0));
      bones[BONE.haR].localToWorld(handR.set(0, -0.06, 0));
      chest.localToWorld(backC.set(0, 0.36, 0.2));
      // Quadratic curve through the hands and the point above/behind the shoulders.
      const cx = 2 * backC.x - (handL.x + handR.x) / 2;
      const cy = 2 * backC.y - (handL.y + handR.y) / 2;
      const cz = 2 * backC.z - (handL.z + handR.z) / 2;
      for (let i = 0; i < 5; i++) {
        const u = i / 4, a = (1 - u) * (1 - u), b2 = 2 * u * (1 - u), d = u * u;
        pinsOpen[i].set(a * handL.x + b2 * cx + d * handR.x, a * handL.y + b2 * cy + d * handR.y, a * handL.z + b2 * cz + d * handR.z);
      }
    }
    for (let i = 0; i < 5; i++) {
      const p = pinsClosed[i];
      if (kainOpen > 0.01) p.lerp(pinsOpen[i], kainOpen);
      pins[i * 3] = p.x; pins[i * 3 + 1] = p.y; pins[i * 3 + 2] = p.z;
    }
    // Body capsules.
    bones[BONE.hips].getWorldPosition(tmpV);
    bones[BONE.neck].getWorldPosition(tmpV2);
    const c0 = capsules[0];
    c0.ax = tmpV.x; c0.ay = tmpV.y; c0.az = tmpV.z; c0.bx = tmpV2.x; c0.by = tmpV2.y; c0.bz = tmpV2.z;
    const c1 = capsules[1];
    bones[BONE.knL].getWorldPosition(handL);
    bones[BONE.knR].getWorldPosition(handR);
    c1.ax = tmpV.x; c1.ay = tmpV.y; c1.az = tmpV.z;
    c1.bx = (handL.x + handR.x) / 2; c1.by = (handL.y + handR.y) / 2; c1.bz = (handL.z + handR.z) / 2;
    const c2 = capsules[2];
    c2.ax = c2.bx = headW.x; c2.ay = c2.by = headW.y; c2.az = c2.bz = headW.z;
    // Back direction (chest +z in world) so cloth always leaves the torso through the back.
    chest.getWorldQuaternion(tmpQ);
    backDir.set(0, 0, 1).applyQuaternion(tmpQ);
    backArr[0] = backDir.x; backArr[1] = backDir.y; backArr[2] = backDir.z;
    c0.back = backArr; c1.back = backArr;
    const speed = rootVel.length();
    root.getWorldPosition(tmpV);
    kain.update(dt, pins, root, {
      capsules,
      groundY: tmpV.y + (base === 'sit' ? c.seat * build.scale : 0),
      waterY: anim.waterY ?? -1e9,
      flutter: clamp(speed / 7, 0, 1) * 0.8 + kainOpen * 0.6,
      lift: kainOpen * clamp(speed / 8, 0.3, 1),
      back: backArr,
    });
  }

  function updateProps(dt) {
    if (!rodTip) return;
    rodTip.getWorldPosition(tmpV);
    const waterY = 0;
    const by = Math.max(waterY + 0.02 + Math.sin(c.t * 1.7) * 0.015, tmpV.y - 3);
    const arr = rodLine.geometry.attributes.position.array;
    const l0 = root.worldToLocal(tmpV2.copy(tmpV));
    arr[0] = l0.x; arr[1] = l0.y; arr[2] = l0.z;
    tmpV.y = by;
    tmpV.x += Math.sin(c.t * 0.7) * 0.05;
    const l1 = root.worldToLocal(tmpV2.copy(tmpV));
    arr[3] = l1.x; arr[4] = l1.y; arr[5] = l1.z;
    rodLine.geometry.attributes.position.needsUpdate = true;
    bobber.position.copy(l1);
  }

  function updateFlame() {
    if (!flame) return;
    const t = c.t;
    const fl = 1 + 0.12 * Math.sin(t * 17.3) + 0.08 * Math.sin(t * 29.1 + 1.3) + 0.05 * Math.sin(t * 7.1);
    const lvl = flameLevel;
    flame.scale.set(0.9 + 0.1 * fl, (0.75 + 0.35 * fl) * (0.4 + 0.6 * Math.min(1, lvl)), 0.9 + 0.1 * fl);
    flame.visible = lvl > 0.02;
    const hdr = (2.2 + 2.6 * lvl) * fl;
    flameHot.copy(flameBase).lerp(WHITE, 0.35);
    flameMat.color.setRGB(flameHot.r * hdr, flameHot.g * hdr, flameHot.b * hdr);
    halo.material.opacity = clamp(0.2 + 0.45 * lvl, 0, 1) * (0.9 + 0.1 * fl);
    halo.scale.setScalar(0.42 + 0.32 * Math.min(1.6, lvl));
    glass.material.opacity = 0.18 + 0.2 * Math.min(1, lvl);
  }

  const character = {
    root,
    body,
    mesh,
    bones,
    skeleton,
    lantern,
    lanternSocket,
    headBone: bones[BONE.head],
    height: 1.8 * build.scale,
    look,
    kain,
    state: 'idle',
    phase: 0,
    onStep: null, // (side: 'L'|'R') => void, called at footfalls

    setLantern(visible) {
      lantern.visible = !!visible && look.accessory === 'lantern';
    },
    setKainOpen(v) { kainOpenTarget = clamp(+v || 0, 0, 1); },
    // Lantern flame brightness (0 = out, 1 = normal, >1 = flare).
    setFlame(v) { flameLevel = Math.max(0, v); },
    // Landing squash; heavy (>0.8) lingers like a stagger.
    impact(k = 0.5) {
      impactK = Math.max(clamp(k, 0, 1.2), impactT < 0.3 ? impactK : 0);
      impactT = 0;
      impactDecay = k > 0.8 ? 3.2 : 7;
    },
    hurt(k = 1) { hurtK = clamp(k, 0, 1); hurtT = 0; },

    update(dt, anim = {}) {
      anim = anim || {};
      dt = Math.max(0, Math.min(0.1, dt || 0));
      const st = anim.state || 'idle';
      const base = BASE_OF[st] || 'loco';
      character.state = st;
      c.t += dt;
      GHOST_TIME.value = performance.now() / 1000;

      // Root motion (for lean, cloth flutter).
      root.updateWorldMatrix(true, false);
      root.getWorldPosition(tmpV);
      if (rootPrevInit && dt > 0) {
        tmpV2.copy(tmpV).sub(rootPrev).divideScalar(dt);
        if (tmpV2.length() > 40) tmpV2.set(0, 0, 0);
        rootVel.lerp(tmpV2, 1 - Math.exp(-10 * dt));
      }
      rootPrev.copy(tmpV);
      rootPrevInit = true;
      const yaw = root.rotation.y;
      if (prevYaw === null) prevYaw = yaw;
      if (dt > 0) yawRate = damp(yawRate, clamp(wrapAngle(yaw - prevYaw) / dt, -8, 8), 10, dt);
      prevYaw = yaw;

      // Speed and cadence.
      const spdIn = base === 'loco'
        ? (anim.speed ?? (st === 'run' ? 5 : st === 'walk' ? 1.4 : 0))
        : base === 'swim' ? (anim.speed ?? 0) : 0;
      if (base === 'loco') c.spd = damp(c.spd, spdIn, 12, dt);
      else c.spd = damp(c.spd, 0, 6, dt);
      if (dt > 0) accel = damp(accel, (c.spd - prevSpd) / dt, 6, dt);
      prevSpd = c.spd;
      const cycleLen = lerp(1.75, 2.75, smoothstep(2.4, 8.6, c.spd)) * (look.old ? 0.78 : 1) / build.cycle * build.scale;
      const prevPh = c.ph;
      c.ph = (c.ph + (dt * c.spd) / cycleLen) % 1;
      character.phase = c.ph;
      if (base === 'loco' && W.loco > 0.5 && c.spd > 0.6 && character.onStep) {
        if (prevPh < 0.25 && c.ph >= 0.25) character.onStep('R');
        else if (prevPh < 0.75 && c.ph >= 0.75) character.onStep('L');
        else if (prevPh > c.ph && c.ph >= 0.25) character.onStep('R');
      }
      c.swim = damp(c.swim, base === 'swim' ? smoothstep(0.4, 2.2, anim.speed ?? 0) : 0, 5, dt);
      c.stroke = (c.stroke + dt * (0.6 + 0.55 * c.swim)) % 1;
      c.sitStyle = anim.sitStyle || (look.accessory === 'rod' ? 'edge' : 'chair');
      c.seat = anim.seat ?? (c.sitStyle === 'chair' ? 0.45 : 0);

      // Auto squash when a fall/jump/glide ends on the ground.
      if ((prevBase === 'fall' || prevBase === 'jump' || prevBase === 'glide') && (base === 'loco' || base === 'sit')) {
        if (impactT > 0.15) character.impact(0.35);
      }
      prevBase = base;

      // ---- Base pose blend ----
      const sum = setBaseWeights(base, dt);
      Pacc.fill(0);
      for (const b of BASES) {
        const w = W[b] / sum;
        if (w <= 0) continue;
        basePose(b, Pt);
        for (let i = 0; i < AN.POSE_LEN; i++) Pacc[i] += Pt[i] * w;
      }

      // ---- Override layers ----
      const idleish = (base === 'loco' && c.spd < 0.6) || base === 'sit';
      const accTarget = idleish && (look.accessory === 'sketchbook' || (look.accessory === 'rod' && base === 'sit')) ? 1 : 0;
      LW.acc = damp(LW.acc, accTarget, 5, dt);
      if (LW.acc > 0.001) {
        Ov.set(Pacc);
        if (look.accessory === 'sketchbook') AN.layerSketch(Ov, c); else AN.layerRod(Ov, c);
        const wTalk = clamp(1 - LW.talk * 0.8, 0, 1);
        overrideArms(Pacc, Ov, AN.ARM_L, LW.acc * (look.accessory === 'sketchbook' ? 1 : wTalk));
        overrideArms(Pacc, Ov, AN.ARM_R, LW.acc * wTalk);
        if (look.accessory === 'sketchbook' && !anim.lookAt) Pacc[BONE.head * 3] -= 0.32 * LW.acc;
      }
      const talkTarget = anim.talk ?? (st === 'talk' ? 1 : 0);
      LW.talk = damp(LW.talk, base === 'glide' || base === 'swim' ? 0 : clamp(talkTarget, 0, 1), 4, dt);
      AN.addTalk(Pacc, c, LW.talk * (base === 'sit' ? 0.7 : 1), !c.lantern && look.accessory !== 'rod', look.accessory !== 'sketchbook' || LW.acc < 0.5);
      LW.wave = damp(LW.wave, st === 'wave' ? 1 : 0, 7, dt);
      if (LW.wave > 0.001) {
        Ov.set(Pacc);
        const right = !c.lantern;
        AN.layerWave(Ov, c, right);
        overrideArms(Pacc, Ov, right ? AN.ARM_R : AN.ARM_L, LW.wave);
        Pacc[BONE.head * 3 + 2] += 0.08 * LW.wave;
      }
      const flareTarget = st === 'flare' ? 1 : clamp(anim.flare ?? 0, 0, 1);
      LW.flare = damp(LW.flare, flareTarget, flareTarget > LW.flare ? 16 : 6, dt);
      if (LW.flare > 0.001) {
        Ov.set(Pacc);
        AN.layerFlare(Ov, c);
        overrideArms(Pacc, Ov, AN.ARM_R, LW.flare);
        overrideArms(Pacc, Ov, AN.ARM_L, LW.flare * 0.7);
        Pacc[BONE.chest * 3] += 0.12 * LW.flare;
        Pacc[BONE.spine * 3] += 0.05 * LW.flare;
        Pacc[BONE.head * 3] += 0.28 * LW.flare;
      }

      // ---- Additive layers ----
      impactT += dt;
      const ik = impactT < 0.05 ? impactT / 0.05 : Math.exp(-(impactT - 0.05) * impactDecay);
      AN.addImpact(Pacc, impactK * ik);
      hurtT += dt;
      const hk = hurtT < 0.06 ? hurtT / 0.06 : Math.exp(-(hurtT - 0.06) * 6);
      AN.addHurt(Pacc, hurtK * hk);
      // Lean into turns and accelerations.
      const moving = base === 'loco' ? c.spd : base === 'glide' ? 6 : 0;
      const lean = clamp(yawRate * moving * 0.045, -0.32, 0.32) * (base === 'glide' ? 1.8 : 1);
      Pacc[BONE.hips * 3 + 2] += lean;
      Pacc[BONE.spine * 3 + 2] -= lean * 0.25;
      Pacc[BONE.head * 3 + 2] -= lean * 0.45;
      if (base === 'loco') Pacc[BONE.spine * 3] -= clamp(accel * 0.012, -0.12, 0.14);
      // Head look.
      updateLook(dt, anim, base);
      Pacc[BONE.chest * 3 + 1] += lookYaw * 0.18;
      Pacc[BONE.neck * 3 + 1] += lookYaw * 0.32;
      Pacc[BONE.head * 3 + 1] += lookYaw * 0.5;
      Pacc[BONE.neck * 3] += lookPitch * 0.4;
      Pacc[BONE.head * 3] += lookPitch * 0.6;
      // Long hair / headscarf tail drifts back with speed.
      Pacc[BONE.hair * 3] += clamp(rootVel.length() * 0.05, 0, 0.45) + Math.sin(c.t * 2.1) * 0.03;

      applyPose(Pacc);

      // Blink.
      blinkT -= dt;
      if (blinkT <= 0) { blink = 0.14; blinkT = 2.2 + Math.random() * 3.5; }
      if (blink > 0) blink -= dt;
      const bk = blink > 0 ? Math.max(0.12, Math.abs(blink - 0.07) / 0.07) : 1;
      bones[BONE.eyes].scale.set(1, look.old ? bk * 0.8 : bk, 1);

      root.updateMatrixWorld(true);
      bones[BONE.head].localToWorld(headW.set(0, 0.13, 0));
      updatePendulum(dt);
      updateFlame();
      lantern.updateMatrixWorld(true);
      updateKain(dt, anim, base);
      updateProps(dt);
    },

    dispose() {
      geo.dispose();
      if (!look.ghost) bodyMat.dispose();
      kain?.mesh.geometry.dispose();
      root.removeFromParent();
    },
  };

  // Initial pose so the first frame is not a T-pose.
  character.update(0, { state: 'idle' });
  return character;
}

const WHITE = new THREE.Color(1, 1, 1);
