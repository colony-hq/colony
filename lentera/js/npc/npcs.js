// Islanders: build, place, idle behaviours, head turns, Ki Lamun's fade-in, interact targets.
// Owner: npc-ai. API: DESIGN.md §7 NPCs.
//
// createNPCs(ctx) -> { list, get(id), update(dt, t) }
// Each NPC: { id, name, role, object, position (feet), yaw, character, visible, reveal (0..1),
//             headPosition() -> {x,y,z}, setHome(x, z, yaw), forceVisible (bool) }

import * as THREE from 'three';
import { createCharacter } from '../player/character.js';
import { LANDMARKS, heightAt } from '../world/heightfield.js';
import { patchMaterial } from '../world/fog.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NPC_LINES, QUEST_STEPS } from './lines.js';
import { damp, dampAngle, smoothstep, wrapAngle, clamp } from '../core/math.js';

// Character looks (createCharacter opts, DESIGN §7 Character) + behaviour tuning.
// kain is passed as batik colours { base, ink, accent, motif }; `colors` mirrors skin/top/bottom
// for older character builds.
const LOOKS = {
  sarni: {
    opts: { skin: 0x8a5a3e, top: 0x6a3f55, bottom: 0x4a2e22, kain: { base: 0x5b3a26, ink: 0x2a170e, accent: 0xd8b26a, motif: 'parang' }, hair: 'kerudung', build: 'old', accessory: 'none', ghost: false },
    pose: 'sit', seated: true, radius: 3.0, look: 'campfire', sitStyle: 'chair', seat: 0.36, stool: true,
  },
  darto: {
    opts: { skin: 0x744a30, top: 0x2f4c5e, bottom: 0x3d3a36, kain: { base: 0x22384a, ink: 0x101c26, accent: 0xc9b27a, motif: 'kawung' }, hair: 'caping', build: 'stout', accessory: 'rod', ghost: false },
    pose: 'sit', seated: true, radius: 2.9, look: 'sea', sitStyle: 'edge', seat: 0,
  },
  ratih: {
    opts: { skin: 0x96664a, top: 0xb4533a, bottom: 0x4c2f20, kain: { base: 0x8a5a34, ink: 0x3a2214, accent: 0xf0d9a0, motif: 'kawung' }, hair: 'bun', build: 'normal', accessory: 'none', ghost: false },
    pose: 'idle', seated: false, radius: 3.4, look: 'plaza',
  },
  laras: {
    opts: { skin: 0xa47353, top: 0xd9d0c0, bottom: 0x2e3a52, kain: { base: 0x34456a, ink: 0x161f33, accent: 0xe9c46a, motif: 'parang' }, hair: 'short', build: 'slim', accessory: 'sketchbook', ghost: false },
    pose: 'sit', seated: true, radius: 3.0, look: 'candi', sitStyle: 'floor', seat: 0,
  },
  lamun: {
    opts: { skin: 0xbfd2ff, top: 0x9fb4e2, bottom: 0x7b8fc0, kain: { base: 0x8aa0d0, ink: 0x4a5c8a, accent: 0xe6eeff, motif: 'parang' }, hair: 'peci', build: 'old', accessory: 'none', ghost: true },
    pose: 'idle', seated: false, radius: 3.2, look: 'sea', hover: 0.14,
  },
};

const HEAD_TURN_RANGE = 6;
const LAMUN_REVEAL_IN = 25;
const LAMUN_REVEAL_OUT = 31;

function glowSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(200,215,255,0.55)');
  gr.addColorStop(1, 'rgba(160,180,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createNPCs(ctx) {
  const { scene, state, collision, events } = ctx;
  const list = [];
  const byId = new Map();
  const tmpV = new THREE.Vector3();
  let clock = 0;
  let resolvedAgain = false;

  const stepIdx = () => Math.max(0, QUEST_STEPS.indexOf(state.progress.quest || 'arrive'));

  // Floor under (x, z): highest walkable surface, unless that is a roof well above a lower floor.
  function groundY(x, z) {
    const terr = heightAt(x, z);
    const high = collision.groundAt(x, z, 50).y;
    const low = collision.groundAt(x, z, Math.max(terr, 0) + 2.4).y;
    return high - low > 2.0 ? low : high;
  }

  function buildOne(id) {
    const L = LOOKS[id];
    const meta = NPC_LINES[id];
    const spot = LANDMARKS.npcs[id];
    const opts = { ...L.opts, colors: { skin: L.opts.skin, top: L.opts.top, bottom: L.opts.bottom } };
    const character = createCharacter(opts);
    const root = character.root;
    root.name = 'npc:' + id;
    // Shadows are configured by the character module (ghosts cast none); just make sure every
    // material carries the kabut (patchMaterial is idempotent).
    root.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) patchMaterial(m); });
    scene.add(root);

    const npc = {
      id,
      name: meta.name,
      role: meta.role,
      object: root,
      character,
      position: new THREE.Vector3(spot.x, 0, spot.z),
      yaw: spot.yaw,
      home: { x: spot.x, z: spot.z, yaw: spot.yaw },
      baseY: 0,
      visible: true,
      reveal: 1,
      forceVisible: false,
      talk: 0,
      lookCur: new THREE.Vector3(),
      lookHas: 0, // 0..1 weight of "looking at something"
      phase: Math.random() * 10,
      slot: list.length,
      cfg: L,
      far: false,
      headPosition() {
        const hb = character.headBone;
        if (hb && hb.getWorldPosition) {
          hb.getWorldPosition(tmpV);
          if (Number.isFinite(tmpV.y) && tmpV.y > npc.position.y + 0.3) return { x: tmpV.x, y: tmpV.y, z: tmpV.z };
        }
        const hgt = (character.height || 1.7) * (L.seated ? 0.68 : 0.92);
        return { x: npc.position.x, y: npc.position.y + hgt, z: npc.position.z };
      },
      setHome(x, z, yaw = npc.home.yaw) {
        npc.home = { x, z, yaw };
        place(npc);
      },
    };
    place(npc);
    npc.lookCur.set(npc.position.x - Math.sin(npc.yaw) * 4, npc.position.y + 1.4, npc.position.z - Math.cos(npc.yaw) * 4);

    ctx.interact.add({
      id: 'npc:' + id,
      getPosition: () => ({ x: npc.position.x, y: npc.position.y + (L.seated ? 1.25 : 1.75), z: npc.position.z }),
      radius: L.radius,
      priority: 0.4,
      label: 'Bicara dengan ' + meta.name,
      enabled: () => npc.visible && npc.reveal > 0.6 && !ctx.dialogue?.isOpen,
      onInteract: () => ctx.dialogue?.open(id),
    });

    list.push(npc);
    byId.set(id, npc);
    return npc;
  }

  function place(npc) {
    const { x, z, yaw } = npc.home;
    npc.baseY = groundY(x, z) + (npc.cfg.hover || 0);
    npc.position.set(x, npc.baseY, z);
    npc.yaw = yaw;
    npc.object.position.copy(npc.position);
    npc.object.rotation.y = yaw;
    for (const pr of npc.props || []) {
      const o = pr.userData.npcOffset;
      if (o) pr.position.set(x + o[0], npc.baseY - (npc.cfg.hover || 0) + o[1], z + o[2]);
    }
  }

  for (const id of Object.keys(LOOKS)) buildOne(id);

  // --- Props: Darto's bucket ("jangan injak ember") ---
  {
    const d = byId.get('darto');
    const bucket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.13, 0.3, 12, 1, true),
      patchMaterial(new THREE.MeshStandardMaterial({ color: 0x5f7482, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide })),
    );
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(0.15, 12),
      patchMaterial(new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.2 })),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.08;
    bucket.add(water);
    bucket.castShadow = true;
    const rx = Math.cos(d.yaw), rz = -Math.sin(d.yaw); // npc's right
    bucket.userData.npcOffset = [-rx * 0.7 + Math.sin(d.yaw) * 0.25, 0.15, -rz * 0.7 + Math.cos(d.yaw) * 0.25];
    scene.add(bucket);
    d.props = [bucket];
    place(d);
  }

  // --- Props: Sarni's dingklik (low wooden stool) under the 'chair' sit pose ---
  for (const n of list) {
    if (!n.cfg.stool) continue;
    const h = n.cfg.seat;
    const parts = [];
    const top = new THREE.BoxGeometry(0.62, 0.05, 0.3);
    top.translate(0, h - 0.025, 0);
    parts.push(top);
    for (const sx of [-0.26, 0.26]) {
      const leg = new THREE.BoxGeometry(0.05, h - 0.05, 0.26);
      leg.translate(sx, (h - 0.05) / 2, 0);
      parts.push(leg);
    }
    const geo = mergeGeometries(parts);
    for (const g of parts) g.dispose();
    const stool = new THREE.Mesh(geo, patchMaterial(new THREE.MeshStandardMaterial({ color: 0x6b4527, roughness: 0.85 })));
    stool.castShadow = stool.receiveShadow = true;
    // Under the hips: a little behind the root along the NPC's facing.
    const back = 0.1;
    stool.userData.npcOffset = [Math.sin(n.yaw) * back, 0, Math.cos(n.yaw) * back];
    stool.rotation.y = n.yaw;
    scene.add(stool);
    n.props = (n.props || []).concat(stool);
    place(n);
  }

  // --- Ki Lamun: ghost fade + shimmer ---
  const lamun = byId.get('lamun');
  const ghostMats = [];
  {
    const others = new Set();
    const collect = (root) => root?.traverse?.((o) => { if (o.material) for (const m of [].concat(o.material)) others.add(m); });
    for (const n of list) if (n !== lamun) collect(n.object);
    collect(ctx.player?.object);
    lamun.object.traverse((o) => {
      if (!o.material) return;
      const mats = [].concat(o.material).map((m) => {
        if (m.isShaderMaterial) return m; // cannot fade safely; handled via visibility
        let mm = m;
        if (others.has(m)) {
          mm = m.clone();
          mm.onBeforeCompile = m.onBeforeCompile;
          mm.customProgramCacheKey = m.customProgramCacheKey;
        }
        ghostMats.push({ m: mm, opacity: mm.opacity ?? 1, transparent: mm.transparent, depthWrite: mm.depthWrite });
        return mm;
      });
      o.material = Array.isArray(o.material) ? mats : mats[0];
    });
  }
  const SHIMMER_N = 26;
  const shimmerGeo = new THREE.BufferGeometry();
  const shimmerPos = new Float32Array(SHIMMER_N * 3);
  const shimmerSeed = Array.from({ length: SHIMMER_N }, () => [Math.random() * Math.PI * 2, 0.15 + Math.random() * 0.45, Math.random(), 0.25 + Math.random() * 0.4]);
  shimmerGeo.setAttribute('position', new THREE.BufferAttribute(shimmerPos, 3));
  const shimmerMat = patchMaterial(new THREE.PointsMaterial({
    map: glowSprite(), color: 0xaebfff, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const shimmer = new THREE.Points(shimmerGeo, shimmerMat);
  shimmer.frustumCulled = false;
  scene.add(shimmer);
  lamun.reveal = 0;
  let lamunOpacityApplied = -1;

  function applyGhostOpacity(k) {
    if (Math.abs(k - lamunOpacityApplied) < 0.01) return;
    lamunOpacityApplied = k;
    for (const g of ghostMats) {
      const fading = k < 0.999;
      g.m.opacity = g.opacity * k;
      const wantT = fading || g.transparent;
      if (g.m.transparent !== wantT) { g.m.transparent = wantT; g.m.needsUpdate = true; }
      g.m.depthWrite = fading ? false : g.depthWrite;
    }
    lamun.object.visible = k > 0.02;
  }

  function lamunUnlocked() {
    const p = state.progress;
    if (lamun.forceVisible || p.quest === 'done') return true;
    if (stepIdx() >= QUEST_STEPS.indexOf('beacon')) return true;
    return Object.values(p.flames || {}).some((s) => s && s !== 'none');
  }

  // After the finale Ki Lamun sits with Sarni by the kampung fire.
  function syncLamunHome() {
    const want = state.progress.quest === 'done' ? 'kampung' : 'door';
    if (lamun.homeTag === want) return;
    lamun.homeTag = want;
    if (want === 'kampung') {
      const s = LANDMARKS.npcs.sarni;
      const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
      lamun.setHome(s.x + rx * 1.15, s.z + rz * 1.15, s.yaw);
    } else {
      const s = LANDMARKS.npcs.lamun;
      lamun.setHome(s.x, s.z, s.yaw);
    }
  }
  syncLamunHome();
  events.on('quest:step', syncLamunHome);
  events.on('game:loaded', syncLamunHome);
  events.on('game:reset', syncLamunHome);

  function idleLookTarget(npc, t, out) {
    const p = npc.position;
    switch (npc.cfg.look) {
      case 'campfire': {
        const c = LANDMARKS.kampung.campfire;
        return out.set(c.x, p.y + 0.4, c.z);
      }
      case 'candi': {
        // Laras alternates between the candi and her sketchbook.
        const cycle = (t + npc.phase) % 9;
        if (cycle < 5) return out.set(LANDMARKS.candi.x, 44, LANDMARKS.candi.z);
        return out.set(p.x - Math.sin(npc.yaw) * 0.6, p.y + 0.2, p.z - Math.cos(npc.yaw) * 0.6);
      }
      case 'sea':
        return out.set(p.x - Math.sin(npc.yaw) * 12, p.y + 0.6, p.z - Math.cos(npc.yaw) * 12);
      case 'plaza':
      default:
        return out.set(p.x - Math.sin(npc.yaw) * 5, p.y + 1.3, p.z - Math.cos(npc.yaw) * 5);
    }
  }

  const desired = new THREE.Vector3();
  const anim = { state: 'idle', speed: 0, lookAt: null, talk: 0, sitStyle: undefined, seat: undefined };

  return {
    list,
    get(id) { return byId.get(id) || null; },

    update(dt, t) {
      if (!(dt > 0)) return;
      clock += dt;
      if (!resolvedAgain && clock > 1.2) {
        // Structures may have registered colliders after we were placed: settle once more.
        resolvedAgain = true;
        for (const n of list) place(n);
      }
      const player = ctx.player;
      const pp = player?.position;
      const dlg = ctx.dialogue;
      const playerHeadY = pp ? pp.y + 1.55 : 0;

      for (const n of list) {
        const dx = pp ? pp.x - n.position.x : 99, dz = pp ? pp.z - n.position.z : 99;
        const dist = Math.hypot(dx, dz);
        const inDialogue = !!(dlg?.isOpen && dlg.npcId === n.id);

        // Ki Lamun reveal / shimmer.
        if (n === lamun) {
          const unlocked = lamunUnlocked();
          const near = dist < (n.reveal > 0.5 ? LAMUN_REVEAL_OUT : LAMUN_REVEAL_IN);
          const target = inDialogue || (unlocked && near) || (state.progress.quest === 'done') ? 1 : 0;
          n.reveal = damp(n.reveal, target, target > n.reveal ? 1.4 : 2.2, dt);
          if (target === 1 && n.reveal > 0.995) n.reveal = 1;
          applyGhostOpacity(n.reveal);
          n.visible = n.reveal > 0.02;
          // Shimmer: faint column of motes before he appears, a soft halo after.
          const nearK = smoothstep(70, 18, dist);
          const shimmerA = (1 - n.reveal) * nearK * (unlocked ? 0.75 : 0.42) + n.reveal * 0.22;
          shimmerMat.opacity = shimmerA;
          shimmer.visible = shimmerA > 0.01;
          if (shimmer.visible) {
            for (let i = 0; i < SHIMMER_N; i++) {
              const [a0, r, ph, sp] = shimmerSeed[i];
              const life = (clock * sp + ph) % 1;
              const a = a0 + clock * 0.4;
              shimmerPos[i * 3] = n.position.x + Math.cos(a) * r;
              shimmerPos[i * 3 + 1] = n.baseY - 0.1 + life * 2.1;
              shimmerPos[i * 3 + 2] = n.position.z + Math.sin(a) * r;
            }
            shimmerGeo.attributes.position.needsUpdate = true;
          }
          // Hover bob.
          n.position.y = n.baseY + Math.sin(clock * 1.3 + n.phase) * 0.06;
        }

        if (!n.visible && n !== lamun) continue;
        const far = dist > 90;
        if (far && ((ctx.time?.frame || 0) + n.slot) % 8 !== 0) continue; // distant NPCs animate at 1/8 rate

        // Body yaw: face the player while talking (seated NPCs only twist a little).
        let targetYaw = n.home.yaw;
        if (inDialogue && pp) {
          const toward = Math.atan2(-dx, -dz);
          const delta = wrapAngle(toward - n.home.yaw);
          targetYaw = n.home.yaw + (n.cfg.seated ? clamp(delta, -0.55, 0.55) : delta);
        }
        n.yaw = dampAngle(n.yaw, targetYaw, inDialogue ? 4 : 2, dt);

        // Look target: player inside 6 m (or in dialogue), else an idle point of interest.
        let lookWeight = 1;
        if (pp && (inDialogue || dist < HEAD_TURN_RANGE)) desired.set(pp.x, playerHeadY, pp.z);
        else {
          idleLookTarget(n, clock, desired);
          lookWeight = n.cfg.look === 'plaza' ? 0 : 1;
        }
        n.lookCur.x = damp(n.lookCur.x, desired.x, 5, dt);
        n.lookCur.y = damp(n.lookCur.y, desired.y, 5, dt);
        n.lookCur.z = damp(n.lookCur.z, desired.z, 5, dt);
        n.lookHas = damp(n.lookHas, lookWeight, 4, dt);

        // Talking intensity follows the dialogue typewriter.
        const speaking = inDialogue && dlg.speaking;
        n.talk = damp(n.talk, speaking ? 1 : 0, 6, dt);

        // Idle behaviour.
        let st = n.cfg.pose;
        let sway = 0;
        if (n.id === 'ratih' && !inDialogue) {
          // Wiping the counter: a few seconds of busy hands, then a pause.
          const cyc = (clock + n.phase) % 7;
          if (cyc < 4) { st = 'talk'; sway = Math.sin(clock * 3.4) * 0.09; }
        }
        if (!n.cfg.seated && n.talk > 0.15) st = 'talk';

        const rx = Math.cos(n.yaw), rz = -Math.sin(n.yaw);
        n.object.position.set(n.position.x + rx * sway, n.position.y, n.position.z + rz * sway);
        n.object.rotation.y = n.yaw;

        anim.state = st;
        anim.speed = 0;
        anim.sitStyle = st === 'sit' ? n.cfg.sitStyle : undefined;
        anim.seat = st === 'sit' ? n.cfg.seat : undefined;
        anim.talk = Math.max(n.talk, st === 'talk' && !inDialogue ? 0.45 : 0);
        anim.lookAt = n.lookHas > 0.3 ? n.lookCur : null;
        try {
          n.character.update?.(far ? dt * 8 : dt, anim);
        } catch (err) {
          console.error('[npcs] character update failed', n.id, err);
          n.character.update = null;
        }
      }
    },
  };
}
