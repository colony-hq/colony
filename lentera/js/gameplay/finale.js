// Finale (owner: gameplay): the beacon sequence (~60 s, DESIGN §3). Three light ribbons spiral up
// the mercusuar → the lamp ignites (bloom, shockwave) → a rotating double beam sweeps the island →
// the kabut dissolves and dawn breaks → Ki Lamun & Mbah Sarni → credits; then free roam at dawn.
//
// createFinale(ctx) → { active, start(), reset(), update }

import * as THREE from 'three';
import { fxMaterial } from './fx.js';
import { FLAME_IDS, FLAME_INFO, socketPoint, lighthouseTop } from './places.js';
import { LANDMARKS } from '../world/heightfield.js';
import { playCamera, releaseCamera, emitSubtitle } from './director.js';
import { clamp, smoothstep } from '../core/math.js';

const END_T = 58;
const LINES = [
  [12.5, 'Ki Lamun', 'Tiga api pusaka… Sudah dua puluh tahun menara ini nggak bernapas, Nak.', 5.2],
  [18.5, 'Mbah Sarni', 'Lamun? Itu cahayamu, to? Dari kampung kelihatan sampai ke laut, lho…', 5.2],
  [24.5, 'Ki Lamun', 'Sarni… maaf aku kelamaan pulang. Kabut ini bikin aku lupa jalan.', 5.2],
  [30.5, 'Mbah Sarni', 'Ndak apa-apa. Yang penting sekarang kita bisa saling lihat lagi.', 5.0],
  [36.5, 'Ki Lamun', 'Pikiran memang ada harganya, Nak. Tapi pulau yang berhenti bertanya, bayarnya jauh lebih mahal.', 7.0],
  [44.5, 'Mbah Sarni', 'Matur nuwun, Nak. Lenteramu sudah membangunkan pulau ini.', 5.5],
];

export function createFinale(ctx) {
  const { events, state, scene } = ctx;
  const fx = ctx.flames.fx;
  const M = LANDMARKS.mercusuar;
  const top = lighthouseTop(ctx);
  const base = new THREE.Vector3(M.x, M.floor, M.z);

  // ---------------------------------------------------------------- ribbons
  const RIB_SEG = 120;
  function ribbonGeometry(from, turns, phase) {
    const pos = [];
    const uv = [];
    const idx = [];
    const a0 = Math.atan2(from.z - M.z, from.x - M.x) + phase;
    const r0 = Math.hypot(from.x - M.x, from.z - M.z);
    for (let i = 0; i <= RIB_SEG; i++) {
      const s = i / RIB_SEG;
      const e = s * s * (3 - 2 * s);
      const ang = a0 + turns * Math.PI * 2 * s;
      const r = THREE.MathUtils.lerp(r0, 4.2, smoothstep(0, 0.35, s)) * (1 - 0.7 * smoothstep(0.85, 1, s));
      const y = THREE.MathUtils.lerp(from.y, top.y, e) + Math.sin(s * Math.PI * 3 + phase) * 0.6 * (1 - s);
      const x = M.x + Math.cos(ang) * r, z = M.z + Math.sin(ang) * r;
      const w = 0.35 + 0.25 * Math.sin(s * Math.PI);
      pos.push(x, y - w, z, x, y + w, z);
      uv.push(s, 0, s, 1);
      if (i < RIB_SEG) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  const ribbons = FLAME_IDS.map((id, i) => {
    const from = socketPoint(ctx, id);
    const mat = fxMaterial({
      blending: 'additive',
      fogMix: 0.35,
      side: THREE.DoubleSide,
      uniforms: { uProgress: { value: 0 }, uFade: { value: 1 }, uColor: { value: new THREE.Color(FLAME_INFO[id].color) }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          #include <lentera_fog_vertex>
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uProgress, uFade, uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float s = vUv.x;
          float behind = uProgress - s;
          if (behind < 0.0) discard;
          float head = exp(-behind * 60.0);
          float tail = exp(-behind * 2.2) * 0.75 + 0.25;
          float band = exp(-pow(vUv.y * 2.0 - 1.0, 2.0) * 5.0);
          float n = lhNoise(vec2(s * 60.0 - uTime * 7.0, vUv.y * 3.0));
          float a = band * (tail * (0.55 + 0.45 * n) + head * 3.0) * uFade;
          vec3 col = mix(uColor, vec3(1.0), 0.08 + head * 0.55) * (1.3 + head * 1.2);
          gl_FragColor = vec4(col * a, 1.0);
          #include <lentera_fog_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(ribbonGeometry(from, 1.25 + i * 0.12, i * 2.1), mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 11;
    scene.add(mesh);
    const headGlow = ctx.flames.fireSystem.addGlow({ position: from, radius: 0.9, intensity: 0, color: FLAME_INFO[id].color, mode: 'halo' });
    return { id, mesh, mat, from, headGlow, delay: i * 0.45, geo: mesh.geometry };
  });

  function ribbonPoint(r, s, out) {
    const p = r.geo.attributes.position;
    const i = Math.min(RIB_SEG, Math.round(s * RIB_SEG)) * 2;
    out.set((p.getX(i) + p.getX(i + 1)) / 2, (p.getY(i) + p.getY(i + 1)) / 2, (p.getZ(i) + p.getZ(i + 1)) / 2);
    return out;
  }

  // ---------------------------------------------------------------- beam
  const BEAM_LEN = 150;
  const beamGeo = new THREE.ConeGeometry(14, BEAM_LEN, 40, 12, true);
  beamGeo.translate(0, -BEAM_LEN / 2, 0); // apex at origin, extends along -y
  beamGeo.rotateZ(Math.PI / 2); // now extends along +x
  const beamMat = fxMaterial({
    blending: 'additive',
    fogMix: 0.25,
    side: THREE.DoubleSide,
    uniforms: { uIntensity: { value: 0 }, uTime: { value: 0 }, uLen: { value: BEAM_LEN }, uColor: { value: new THREE.Color(1.0, 0.9, 0.72) } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vLocal;
      uniform float uLen;
      void main() {
        vAlong = clamp(position.x / uLen, 0.0, 1.0);
        vLocal = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-mvPosition.xyz);
        #include <lentera_fog_vertex>
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity, uTime;
      uniform vec3 uColor;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vLocal;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vView)));
        float core = pow(facing, 2.6);
        float edge = smoothstep(0.05, 0.45, facing); // soft silhouette, no hard planes
        float fall = pow(1.0 - vAlong, 1.35) * smoothstep(0.0, 0.05, vAlong);
        float dust = 0.7 + 0.3 * lhFbm(vec2(vLocal.x * 0.08 - uTime * 0.6, atan(vLocal.z, vLocal.y) * 2.0));
        float a = (0.025 + core * 0.42) * edge * fall * dust * uIntensity;
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <lentera_fog_fragment>
      }
    `,
  });
  const beam = new THREE.Group();
  beam.position.copy(top);
  for (const rot of [0, Math.PI]) {
    const m = new THREE.Mesh(beamGeo, beamMat);
    m.rotation.y = rot;
    m.rotation.z = -0.045; // slight downward tilt
    m.frustumCulled = false;
    m.renderOrder = 12;
    beam.add(m);
  }
  beam.visible = false;
  scene.add(beam);
  // SpotLight exists from boot (intensity 0) so the light count never changes → no recompiles.
  const spot = new THREE.SpotLight(0xfff0d8, 0, 320, 0.17, 0.55, 1.0);
  spot.castShadow = false;
  spot.position.copy(top);
  const spotTarget = new THREE.Object3D();
  scene.add(spot, spotTarget);
  spot.target = spotTarget;
  const lampGlow = ctx.flames.fireSystem.addGlow({ position: top, radius: 7, intensity: 0, color: 0xffe6b0, mode: 'halo' });
  const lampCore = ctx.flames.fireSystem.addGlow({ position: top, radius: 2.2, intensity: 0, color: 0xfff6e0, mode: 'halo' });

  // Expanding light shell at ignition.
  const shellMat = fxMaterial({
    blending: 'additive',
    fogMix: 0.2,
    side: THREE.DoubleSide,
    uniforms: { uAlpha: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.86, 0.6) } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-mvPosition.xyz);
        #include <lentera_fog_vertex>
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 3.0);
        gl_FragColor = vec4(uColor * rim * uAlpha, 1.0);
        #include <lentera_fog_fragment>
      }
    `,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), shellMat);
  shell.visible = false;
  shell.frustumCulled = false;
  shell.position.copy(top);
  shell.renderOrder = 13;
  scene.add(shell);

  // ---------------------------------------------------------------- state
  let active = false;
  let t = 0;
  let fired = new Set();
  let beamOn = 0; // 0..1
  let beamAngle = 2.4;
  let lamp = 0;
  let skyTouched = false;
  const tmp = new THREE.Vector3();

  function at(time) {
    if (t >= time && !fired.has(time)) { fired.add(time); return true; }
    return false;
  }

  function cameraKeys() {
    const T = top;
    const sp = FLAME_IDS.map((id) => socketPoint(ctx, id));
    const c = sp.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / sp.length);
    return [
      { pos: [c.x - 9, c.y + 1.8, c.z + 8], look: [c.x + 1.5, c.y + 0.6, c.z - 1], t: 0 },
      { pos: [c.x - 13, c.y + 4, c.z + 13], look: [M.x, c.y + 4, M.z], t: 3.2 },
      { pos: [M.x - 26, M.floor + 14, M.z + 24], look: [M.x, M.floor + 18, M.z], t: 6.5 },
      { pos: [M.x - 20, T.y + 2, M.z + 16], look: [T.x, T.y - 1, T.z], t: 9.5 },
      { pos: [M.x - 46, T.y + 18, M.z + 50], look: [T.x - 10, T.y - 6, T.z], t: 14 },
      { pos: [M.x - 120, 78, M.z + 120], look: [40, 10, 60], t: 21 },
      { pos: [40, 52, 215], look: [0, 6, 150], t: 28 },
      { pos: [-10, 26, 196], look: [-3, 5, 154], t: 34.5 },
      { pos: [60, 44, 120], look: [M.x, T.y - 4, M.z], t: 41 },
      { pos: [M.x - 70, M.floor + 22, M.z + 26], look: [T.x, T.y - 6, T.z], t: 48 },
      { pos: [M.x - 18, M.floor + 4.5, M.z + 10], look: [M.x - 2, M.floor + 8, M.z], t: 54 },
      { pos: [M.x - 16, M.floor + 4, M.z + 8], look: [M.x - 2, M.floor + 9, M.z], t: END_T + 1 },
    ];
  }

  function start() {
    if (active || state.progress.finished) return;
    active = true;
    t = 0;
    fired = new Set();
    state.setMode('finale');
    ctx.quest?.setStep?.('finale');
    const p = ctx.player;
    p?.setControl?.(false);
    p?.faceToward?.(M.x, M.z);
    ctx.spirits?.banishAll?.(false);
    events.emit('finale:start', {});
    playCamera(ctx, cameraKeys());
  }

  // structures' own simple beams would double ours: keep them hidden (finale owns the beam).
  function hideStructureBeams() {
    const b = ctx.structures?.lighthouse?.beams;
    if (b && b.visible) b.visible = false;
  }

  function setLamp(v) {
    lamp = v;
    try { ctx.structures?.lighthouse?.setLampGlow?.(v); } catch (err) { console.warn(err); }
    hideStructureBeams();
    lampGlow.intensity = 0.9 * v;
    lampCore.intensity = 2.4 * v;
    lampGlow.update();
    lampCore.update();
  }

  function setDawnWorld(instant) {
    ctx.fog?.setAmount?.(0, instant ? 0 : 20);
    if (ctx.sky) {
      ctx.sky.setTimeOfDay?.(1, instant ? 0 : 25);
      ctx.sky.autoAdvance = false;
      skyTouched = true;
    }
  }

  function stats() {
    const p = state.progress;
    const c = p.credit || {};
    const by = c.byTier || {};
    return {
      playTime: Math.round(p.playTime || 0),
      deaths: p.deaths || 0,
      kilau: { found: (p.kilau || []).length, total: ctx.spirits?.kilau?.total ?? 60 },
      flames: FLAME_IDS.filter((id) => p.flames[id] === 'placed').length,
      credit: { balance: c.balance ?? 0, spent: c.spent ?? 0, earned: c.earned ?? 0 },
      thoughts: { total: c.thoughts ?? 0, redup: by.redup ?? 0, sedang: by.sedang ?? 0, terang: by.terang ?? 0 },
      clues: (p.clues || []).length,
    };
  }

  function finish() {
    active = false;
    const p = state.progress;
    p.finished = true;
    const pl = ctx.player;
    // Stand on the platform looking west over the island at dawn.
    const sx = M.x - 9, sz = M.z + 4;
    const sy = ctx.collision?.groundAt?.(sx, sz, M.floor + 2)?.y ?? M.floor;
    pl?.teleport?.(sx, sy, sz, Math.PI / 2 - 0.25);
    releaseCamera(ctx, true);
    // Credits roll over the dawn island; menus return to play on "Lanjut menjelajah".
    state.setMode('cinematic');
    pl?.setControl?.(false);
    creditsOpen = true;
    creditsWait = 0;
    events.emit('subtitle:clear', {});
    events.emit('finale:end', {});
    state.save();
    events.emit('credits:show', { stats: stats() });
    fx.fade(false, 1.6);
  }

  let creditsOpen = false;
  let creditsWait = 0;
  events.on('credits:close', (e) => {
    if (!creditsOpen) return;
    creditsOpen = false;
    if (e?.to !== 'title') {
      if (state.mode !== 'play') state.setMode('play');
      ctx.player?.setControl?.(true);
      releaseCamera(ctx, true);
      events.emit('hint', { text: 'Fajar di pulau tanpa kabut. Jelajahi sesukamu.', seconds: 5 });
    }
  });
  events.on('game:quit', () => {
    creditsOpen = false;
    if (active) { active = false; fx.fade(false, 0); }
    restore();
  });

  function reset() {
    active = false;
    t = 0;
    beamOn = 0;
    beam.visible = false;
    spot.intensity = 0;
    for (const r of ribbons) { r.mesh.visible = false; r.headGlow.intensity = 0; r.headGlow.update(); }
    shell.visible = false;
  }

  function restore() {
    reset();
    if (state.progress.finished) {
      setLamp(1);
      beamOn = 1;
      beam.visible = true;
      setDawnWorld(true);
    } else {
      setLamp(Math.min(0.3, FLAME_IDS.filter((id) => state.progress.flames[id] === 'placed').length * 0.1));
      ctx.fog?.setAmount?.(1, 0);
      if (skyTouched && ctx.sky) {
        ctx.sky.setTimeOfDay?.(0.05, 0);
        ctx.sky.autoAdvance = true;
        skyTouched = false;
      }
    }
  }
  events.on('game:loaded', restore);
  events.on('game:reset', restore);

  // ---------------------------------------------------------------- per frame
  function update(dt, tt) {
    beamMat.uniforms.uTime.value = tt;
    hideStructureBeams();
    if (creditsOpen && dt > 0) {
      // Safety net: never leave the player stuck if no credits UI answers.
      creditsWait += dt;
      if (creditsWait > 150 && state.mode === 'cinematic') {
        creditsOpen = false;
        state.setMode('play');
        ctx.player?.setControl?.(true);
      }
    }
    for (const r of ribbons) r.mat.uniforms.uTime.value = tt;
    // Beam keeps sweeping forever once lit.
    if (beamOn > 0) {
      beamAngle += dt * 0.5;
      beam.rotation.y = beamAngle;
      beam.visible = true;
      beamMat.uniforms.uIntensity.value = beamOn * (state.progress.finished && !active ? 0.55 : 1);
      const dir = tmp.set(Math.cos(beamAngle), -0.045, -Math.sin(beamAngle));
      spotTarget.position.copy(top).addScaledVector(dir, 60);
      spot.intensity = beamOn * (active ? 900 : 300);
    }
    if (!active) return;
    if (state.mode !== 'finale') {
      if (state.mode === 'play') state.setMode('finale');
      else return;
    }
    t += dt;
    // Ribbons.
    if (at(1.2)) {
      for (const r of ribbons) r.mesh.visible = true;
      events.emit('finale:beat', { name: 'ribbons' });
    }
    for (const r of ribbons) {
      const k = clamp((t - 1.2 - r.delay) / 5.4, 0, 1);
      const e = k < 1 ? k * k * (3 - 2 * k) : 1;
      r.mat.uniforms.uProgress.value = e * 1.02;
      r.mat.uniforms.uFade.value = t < 8 ? 1 : Math.max(0, 1 - (t - 8) / 2.5);
      if (k > 0 && k < 1) {
        ribbonPoint(r, e, tmp);
        r.headGlow.position.copy(tmp);
        r.headGlow.intensity = 1.6;
        r.headGlow.update();
        if (Math.random() < dt * 40 * fx.particleScale) fx.spark({ x: tmp.x, y: tmp.y, z: tmp.z, vx: (Math.random() - 0.5) * 1.5, vy: -0.5 - Math.random(), vz: (Math.random() - 0.5) * 1.5, color: FLAME_INFO[r.id].color, life: 1.2, size: 0.16, drag: 1 });
      } else if (r.headGlow.intensity > 0) {
        r.headGlow.intensity = 0;
        r.headGlow.update();
      }
    }
    if (at(7.2)) {
      // Ignition.
      fx.bloomPulse(3.2, 4.0, 0.25);
      fx.shake(0.75, 1.6);
      fx.flash(top, 0xfff0c8, 900, 2.2, 140);
      fx.burst({ x: top.x, y: top.y, z: top.z, count: 160, color: 0xffe2a8, speed: 18, sphere: true, life: 2.2, size: 0.5, drag: 1.4, hdr: 3 });
      shell.visible = true;
      fx.tween(3.5, (k) => {
        const e = 1 - Math.pow(1 - k, 3);
        shell.scale.setScalar(2 + e * 260);
        shellMat.uniforms.uAlpha.value = (1 - k) * 2.2;
      }, () => { shell.visible = false; });
      events.emit('finale:beat', { name: 'ignite' });
      fx.tween(1.4, (k) => setLamp(0.3 + 0.7 * k));
      setDawnWorld(false);
      ctx.fog?.removeClearing?.('mercusuar');
    }
    if (t > 8 && beamOn < 1) beamOn = Math.min(1, beamOn + dt / 2.2);
    if (at(8.2)) events.emit('finale:beat', { name: 'beam' });
    for (const [time, who, text, sec] of LINES) if (at(time)) emitSubtitle(ctx, who, text, sec);
    if (at(50)) events.emit('finale:beat', { name: 'dawn' });
    if (at(END_T - 2.2)) fx.fade(true, 1.8);
    if (t >= END_T) finish();
  }

  restore();
  return {
    get active() { return active; },
    get time() { return t; },
    start,
    reset,
    restore,
    stats,
    beam,
    update,
  };
}
