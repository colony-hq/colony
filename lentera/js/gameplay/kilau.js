// Kilau (owner: gameplay): jade motes of clear thought. ~60 persistent spots (kilau-spots.js) +
// transient motes released by banished Hantu. One instanced draw call. Magnetise within 3 m,
// collect at 1.3 m → kilau:collect, Nyala +6, progress.kilau persisted.

import * as THREE from 'three';
import { fxMaterial } from './fx.js';
import { kilauSpots } from './kilau-spots.js';
import { heightAt } from '../world/heightfield.js';

const JADE = 0x8fe3d0;
const MAGNET_R = 3.0;
const COLLECT_R = 1.3;

export function createKilau(ctx, fx) {
  const { events, state } = ctx;
  const spots = kilauSpots();
  const TRANSIENT = 48;
  const cap = spots.length + TRANSIENT;

  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  const iPos = new Float32Array(cap * 3);
  const iData = new Float32Array(cap * 4); // scale, phase, kind, alpha
  const aPos = new THREE.InstancedBufferAttribute(iPos, 3).setUsage(THREE.DynamicDrawUsage);
  const aData = new THREE.InstancedBufferAttribute(iData, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', aPos);
  geo.setAttribute('iData', aData);
  geo.instanceCount = cap;

  const mat = fxMaterial({
    blending: 'additive',
    fogMix: 0.62,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(JADE) } },
    vertexShader: /* glsl */ `
      attribute vec3 iPos;
      attribute vec4 iData;
      uniform float uTime;
      varying vec2 vUv;
      varying float vA;
      varying float vPhase;
      void main() {
        vUv = uv;
        vA = iData.w;
        vPhase = iData.y;
        if (iData.w < 0.003) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        vec3 c = iPos + vec3(0.0, sin(uTime * 2.1 + iData.y * 6.0) * 0.13 * (1.0 - iData.z), 0.0);
        vec4 mvPosition = viewMatrix * vec4(c, 1.0);
        // Keep a minimum on-screen size so distant breadcrumbs still read as points of light.
        float size = iData.x * max(1.0, -mvPosition.z * 0.018);
        mvPosition.xy += position.xy * size;
        #include <lentera_fog_vertex>
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vA;
      varying float vPhase;
      void main() {
        vec2 q = vUv * 2.0 - 1.0;
        float r2 = dot(q, q);
        if (r2 > 1.0) discard;
        float ang = uTime * 0.9 + vPhase * 6.28;
        float cs = cos(ang), sn = sin(ang);
        vec2 s = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);
        float tw = 0.55 + 0.45 * sin(uTime * 5.3 + vPhase * 17.0);
        float star = (exp(-abs(s.x) * 26.0) * exp(-abs(s.y) * 3.2) + exp(-abs(s.y) * 26.0) * exp(-abs(s.x) * 3.2)) * tw;
        float star2 = (exp(-abs(s.x + s.y) * 30.0) + exp(-abs(s.x - s.y) * 30.0)) * exp(-r2 * 9.0) * 0.5 * (1.0 - tw);
        float core = exp(-r2 * 70.0);
        float halo = exp(-r2 * 7.0) * 0.32;
        vec3 col = uColor * (halo + star * 1.4 + star2) * 1.8 + vec3(0.85, 1.0, 0.95) * core * 3.0;
        col *= (1.0 - r2);
        gl_FragColor = vec4(col * vA, 1.0);
        #include <lentera_fog_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.name = 'kilau';
  ctx.scene.add(mesh);

  // Runtime records.
  const items = spots.map((s, i) => ({
    i, id: s.id, spot: s, persistent: true, home: new THREE.Vector3(s.x, 0, s.z), pos: new THREE.Vector3(s.x, 0, s.z),
    vel: new THREE.Vector3(), alive: true, alpha: 1, phase: (i * 0.618) % 1, magnet: false, resolved: false,
  }));
  for (let k = 0; k < TRANSIENT; k++) {
    items.push({ i: spots.length + k, id: null, persistent: false, home: new THREE.Vector3(), pos: new THREE.Vector3(), vel: new THREE.Vector3(), alive: false, alpha: 0, phase: Math.random(), magnet: false, resolved: true, age: 0 });
  }
  let dirty = true;
  let transientSeq = 0;
  let pickupsSinceSave = 0;

  function resolveY(it) {
    const s = it.spot;
    const g = ctx.collision?.groundAt?.(s.x, s.z, s.yHint ?? 999);
    const y = Math.max(g ? g.y : heightAt(s.x, s.z), 0.35) + (s.lift ?? 1);
    it.home.y = y;
    it.pos.copy(it.home);
    it.resolved = true;
  }

  function write(it) {
    const i = it.i;
    iPos[i * 3] = it.pos.x; iPos[i * 3 + 1] = it.pos.y; iPos[i * 3 + 2] = it.pos.z;
    iData[i * 4] = it.persistent ? 0.62 : 0.5;
    iData[i * 4 + 1] = it.phase;
    iData[i * 4 + 2] = it.magnet ? 1 : 0;
    iData[i * 4 + 3] = it.alive ? it.alpha : 0;
    dirty = true;
  }

  function restore() {
    const got = new Set(state.progress.kilau || []);
    for (const it of items) {
      if (it.persistent) {
        if (!it.resolved) resolveY(it);
        it.alive = !got.has(it.id);
        it.alpha = 1;
        it.magnet = false;
        it.vel.set(0, 0, 0);
        it.pos.copy(it.home);
      } else {
        it.alive = false;
      }
      write(it);
    }
  }

  // Motes released by a banished ghost: burst outward, then home in on the player.
  function spawnTransient(x, y, z, count = 3) {
    for (let k = 0; k < count; k++) {
      const it = items.find((q) => !q.persistent && !q.alive);
      if (!it) return;
      const a = Math.random() * Math.PI * 2;
      it.id = 'spirit-' + (++transientSeq);
      it.pos.set(x, y, z);
      it.vel.set(Math.cos(a) * 3.2, 1.5 + Math.random() * 1.5, Math.sin(a) * 3.2);
      it.alive = true;
      it.alpha = 1;
      it.magnet = false;
      it.age = 0;
      write(it);
    }
    events.emit('kilau:spawn', { x, y, z, count });
  }

  function collect(it) {
    it.alive = false;
    write(it);
    const p = state.progress;
    const c = it.pos;
    fx.burst({ x: c.x, y: c.y, z: c.z, count: 22, color: JADE, speed: 2.6, sphere: true, life: 0.7, size: 0.1, drag: 2.5, hdr: 2.6 });
    fx.bloomPulse(0.25, 0.35);
    state.addNyala(6, 'kilau');
    if (it.persistent) {
      if (!p.kilau.includes(it.id)) p.kilau.push(it.id);
      const total = p.kilau.length;
      events.emit('kilau:collect', { id: it.id, total, max: spots.length });
      if (total % 10 === 0) events.emit('toast', { text: `Kilau ${total}/${spots.length} — pikiranmu makin jernih`, kind: 'kilau' });
      if (total === spots.length) events.emit('toast', { text: 'Semua Kilau di pulau sudah kamu temukan!', kind: 'kilau' });
      if (++pickupsSinceSave >= 3) { pickupsSinceSave = 0; state.save(); }
    } else {
      events.emit('kilau:collect', { id: it.id, total: p.kilau.length, max: spots.length, transient: true });
    }
  }

  const chest = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  function update(dt, t) {
    mat.uniforms.uTime.value = t;
    if (dt > 0) {
      const player = ctx.player;
      const canCollect = state.mode === 'play' && player;
      if (player) chest.set(player.position.x, player.position.y + 1.0, player.position.z);
      for (const it of items) {
        if (!it.alive) continue;
        if (!it.resolved) { resolveY(it); write(it); }
        if (!it.persistent) {
          // Transient: fly out with drag, then home in.
          it.age += dt;
          if (it.age < 0.7 || !canCollect) {
            it.vel.multiplyScalar(Math.exp(-3 * dt));
            it.vel.y -= 1.5 * dt;
            it.pos.addScaledVector(it.vel, dt);
          } else {
            tmp.copy(chest).sub(it.pos);
            const d = tmp.length();
            const speed = Math.min(16, 4 + (it.age - 0.7) * 14);
            it.vel.lerp(tmp.multiplyScalar(speed / Math.max(d, 0.001)), 1 - Math.exp(-8 * dt));
            it.pos.addScaledVector(it.vel, dt);
            if (d < COLLECT_R) { collect(it); continue; }
          }
          if (it.age > 12) { it.alive = false; }
          it.magnet = true;
          write(it);
          continue;
        }
        if (!canCollect) continue;
        const dx = chest.x - it.pos.x, dy = chest.y - it.pos.y, dz = chest.z - it.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < COLLECT_R * COLLECT_R) { collect(it); continue; }
        if (d2 < MAGNET_R * MAGNET_R || it.magnet) {
          it.magnet = true;
          const d = Math.sqrt(d2);
          if (d > MAGNET_R * 2.2) { it.magnet = false; it.pos.copy(it.home); it.vel.set(0, 0, 0); write(it); continue; }
          const pull = 9 + (MAGNET_R - Math.min(d, MAGNET_R)) * 6;
          it.vel.lerp(tmp.set(dx, dy, dz).multiplyScalar(pull / Math.max(d, 0.001)), 1 - Math.exp(-10 * dt));
          it.pos.addScaledVector(it.vel, dt);
          write(it);
        }
      }
    }
    if (dirty) { aPos.needsUpdate = aData.needsUpdate = true; dirty = false; }
  }

  return {
    spots,
    get total() { return spots.length; },
    get found() { return (state.progress.kilau || []).length; },
    spawnTransient,
    restore,
    update,
    items,
  };
}
