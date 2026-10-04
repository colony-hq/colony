// Spirits (owner: gameplay): Hantu Kabut + Kilau + the lantern flare. API: DESIGN.md §7.
//
// createSpirits(ctx) → { update, banishAll(withKilau), ghosts, kilau, flare(x,y,z), debugSpawn(x,z) }
//
// Hantu (§4): spawn only where fog.fogAmount > 0.5, 25–45 m from the player, max 3/5/7 by
// quality, never inside lit-campfire clearings, despawn > 70 m. Drift 2.4 m/s toward the player
// inside 22 m; ×0.4 and flickering inside the lantern bubble. Touch: Nyala −20, knockback 6 m/s,
// shake, 1.2 s i-frames. Flare (cost 12, radius 12 m) banishes them into 3 Kilau motes each.

import * as THREE from 'three';
import { fxMaterial } from './fx.js';
import { createKilau } from './kilau.js';
import { CHECKPOINTS, LANDMARKS, heightAt } from '../world/heightfield.js';
import { clamp, damp, smoothstep } from '../core/math.js';

const MAX_BY_QUALITY = { low: 3, medium: 5, high: 7 };
const CHASE_R = 22;
const TOUCH_R = 0.95;
const FLARE_COST = 12;
const FLARE_R = 12;
const IFRAMES = 1.2;
const GHOST_STEPS = new Set(['seek', 'beacon']);

export function createSpirits(ctx) {
  const { events, state } = ctx;
  const fx = ctx.flames.fx;
  const kilau = createKilau(ctx, fx);
  const MAXG = 8;

  // ---------------------------------------------------------------- ghost rendering
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('uv', quad.getAttribute('uv'));
  const gPos = new Float32Array(MAXG * 3);
  const gData = new Float32Array(MAXG * 4); // alpha, flicker, seed, scale
  const gVel = new Float32Array(MAXG * 3);
  const aPos = new THREE.InstancedBufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage);
  const aData = new THREE.InstancedBufferAttribute(gData, 4).setUsage(THREE.DynamicDrawUsage);
  const aVel = new THREE.InstancedBufferAttribute(gVel, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', aPos);
  geo.setAttribute('iData', aData);
  geo.setAttribute('iVel', aVel);
  geo.instanceCount = MAXG;
  const mat = fxMaterial({
    blending: 'premultiplied',
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 iPos;
      attribute vec4 iData;
      attribute vec3 iVel;
      varying vec2 vUv;
      varying vec4 vData;
      varying float vSkew;
      void main() {
        vUv = uv;
        vData = iData;
        if (iData.x < 0.003) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        vec3 toCam = cameraPosition - iPos;
        toCam.y = 0.0;
        toCam = length(toCam) > 1e-3 ? normalize(toCam) : vec3(0.0, 0.0, 1.0);
        vec3 right = vec3(toCam.z, 0.0, -toCam.x);
        float s = iData.w;
        vec3 wp = iPos + right * position.x * 2.0 * s + vec3(0.0, position.y * 3.0 * s, 0.0);
        vLenteraWorld = wp;
        // Tail trails opposite to the motion, in billboard space.
        vSkew = clamp(dot(iVel, right) * 0.22, -0.7, 0.7);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec4 vData;
      varying float vSkew;
      void main() {
        float seed = vData.z;
        float t = uTime + seed * 10.0;
        vec2 p = vUv * 2.0 - 1.0;
        float y = p.y;
        float low = smoothstep(0.25, -1.0, y);
        p.x += vSkew * low * low * 1.4;
        p.x += sin(y * 4.0 - t * 2.1) * 0.08 * low + sin(y * 9.0 - t * 3.6) * 0.03 * low;
        float n = lhFbm(vec2(p.x * 2.1 + seed * 3.0, y * 1.5 - t * 0.5));
        float n2 = lhNoise(vec2(p.x * 5.5 + seed, y * 4.0 - t * 1.3));
        // Silhouette: hooded head + shoulders + robe tapering into wisps.
        vec2 hp = (p - vec2(0.0, 0.52)) * vec2(1.0, 0.82);
        float head = length(hp) - 0.24;
        float hw = 0.47 * (1.0 - smoothstep(0.22, 0.46, y)) * mix(1.0, 0.18, smoothstep(0.12, -0.95, y));
        hw += sin(y * 6.0 + t * 1.3) * 0.025;
        float body = abs(p.x) - hw;
        float sdf = min(head, body);
        sdf += (n - 0.5) * mix(0.1, 0.62, low) + (n2 - 0.5) * 0.06;
        float mask = 1.0 - smoothstep(-0.05, 0.05, sdf);
        mask *= smoothstep(-1.0, -0.3, y + (n - 0.5) * 0.5);
        mask *= 1.0 - smoothstep(0.82, 0.98, y);
        float inner = 1.0 - smoothstep(-0.32, 0.0, sdf);
        float rim = smoothstep(-0.16, 0.0, sdf) * mask;
        // Trailing tendrils below the robe.
        float tx = p.x - sin(y * 3.0 + t * 1.6) * 0.18;
        float tendril = exp(-abs(tx - 0.12) * 22.0) + exp(-abs(tx + 0.16) * 26.0);
        tendril *= smoothstep(-0.2, -0.75, y) * smoothstep(-1.0, -0.8, y) * n2 * 0.7;
        // Hood shadow + two dim eyes.
        float face = exp(-dot(p - vec2(0.0, 0.47), p - vec2(0.0, 0.47)) * 30.0);
        vec2 e1 = (p - vec2(-0.09, 0.5)) * vec2(1.0, 1.7);
        vec2 e2 = (p - vec2(0.09, 0.5)) * vec2(1.0, 1.7);
        float blink = step(0.06, fract(t * 0.21 + seed));
        float eyes = (exp(-dot(e1, e1) * 900.0) + exp(-dot(e2, e2) * 900.0)) * blink;
        float flick = 1.0 - vData.y * (0.45 + 0.45 * sin(uTime * 37.0 + seed * 9.0)) * step(0.5, lhNoise(vec2(uTime * 9.0, seed * 50.0)) + 0.3);
        float A = vData.x * flick;
        vec3 bodyCol = mix(vec3(0.2, 0.25, 0.38), vec3(0.42, 0.5, 0.66), n);
        vec3 glowCol = vec3(0.55, 0.86, 1.0);
        float swirl = lhNoise(vec2(p.x * 3.0 + t * 0.4, y * 3.0 - t * 0.9));
        float alpha = clamp(mask * (0.16 + 0.3 * inner * swirl) * (1.0 - face * 0.55) + tendril * 0.22, 0.0, 1.0) * A;
        vec3 rgb = bodyCol * alpha;
        rgb += glowCol * (rim * 0.5 + tendril * 0.45 + inner * swirl * 0.08) * A;
        rgb += vec3(0.8, 0.95, 1.0) * eyes * 2.2 * A;
        gl_FragColor = vec4(rgb, alpha);
        // Kabut: the figure dissolves into the fog with distance (premultiplied).
        vec2 lfg = lenteraFog(vLenteraWorld);
        float f = lfg.x * 0.72;
        gl_FragColor.rgb = gl_FragColor.rgb * (1.0 - f) + lenteraFogColor(vLenteraWorld, lfg) * gl_FragColor.a * f;
        if (gl_FragColor.a < 0.002 && dot(gl_FragColor.rgb, vec3(1.0)) < 0.004) discard;
      }
    `,
  });
  const ghostMesh = new THREE.Mesh(geo, mat);
  ghostMesh.frustumCulled = false;
  ghostMesh.renderOrder = 6;
  ghostMesh.name = 'hantu';
  ctx.scene.add(ghostMesh);

  // ---------------------------------------------------------------- ghost logic
  const ghosts = [];
  let seq = 0;
  let spawnTimer = 3;
  let iframes = 0;
  let grace = 6;
  let lastFlare = -10;

  const preset = () => ctx.engine.preset || {};
  const maxGhosts = () => MAX_BY_QUALITY[preset().name] ?? 5;

  function litCampfireNear(x, z, pad = 4) {
    const p = state.progress;
    for (const cp of CHECKPOINTS) {
      if (!p.checkpoints[cp.id]) continue;
      if ((x - cp.x) ** 2 + (z - cp.z) ** 2 < (38 + pad) ** 2) return true;
    }
    return false;
  }

  function pocketFactor(x, z) {
    let best = 0;
    for (const f of LANDMARKS.fogPockets) {
      const d = Math.hypot(x - f.x, z - f.z);
      best = Math.max(best, 1 - smoothstep(f.r * 0.6, f.r * 1.4, d));
    }
    return best;
  }

  function hoverY(x, z, yHint) {
    const g = ctx.collision?.groundAt?.(x, z, yHint);
    return Math.max(g ? g.y : heightAt(x, z), 0) + 1.15;
  }

  function spawnGhost(x, z, yHint) {
    if (ghosts.length >= MAXG) return null;
    const y = hoverY(x, z, yHint);
    const g = {
      id: ++seq, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), home: new THREE.Vector3(x, y, z),
      alpha: 0, targetAlpha: 0.95, scale: 0.95 + Math.random() * 0.2, seed: Math.random(), state: 'drift',
      t: 0, touchCd: 0, whisper: 1 + Math.random() * 3, near: false, flicker: 0, clearT: 0, wispT: 0,
      wander: Math.random() * Math.PI * 2,
    };
    ghosts.push(g);
    events.emit('spirit:spawn', { x, y, z });
    return g;
  }

  function trySpawn() {
    const player = ctx.player;
    if (!player || !ctx.fog?.fogAmount) return;
    const pp = player.position;
    const want = Math.max(1, Math.round(maxGhosts() * clamp(0.4 + 0.6 * pocketFactor(pp.x, pp.z) + 0.25 * nightFactor(), 0, 1)));
    if (ghosts.filter((g) => g.state !== 'banish' && g.state !== 'fade').length >= want) return;
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const d = 25 + Math.random() * 20;
      const x = pp.x + Math.cos(a) * d, z = pp.z + Math.sin(a) * d;
      if (Math.abs(x) > 380 || Math.abs(z) > 380) continue;
      const y = hoverY(x, z, pp.y + 12);
      if (Math.abs(y - pp.y) > 18) continue;
      if (litCampfireNear(x, z)) continue;
      if (ctx.fog.fogAmount(x, y + 0.4, z) <= 0.5) continue;
      spawnGhost(x, z, pp.y + 12);
      return;
    }
  }

  function nightFactor() {
    const tod = ctx.sky?.timeOfDay ?? 0;
    return clamp((tod - 0.2) / 0.4, 0, 1);
  }

  function banish(g, withKilau = true) {
    if (g.state === 'banish') return;
    g.state = 'banish';
    g.t = 0;
    const p = g.pos;
    fx.burst({ x: p.x, y: p.y + 0.3, z: p.z, count: 40, color: 0xbfe6ff, speed: 4, sphere: true, life: 1.0, size: 0.14, drag: 2.4, radius: 0.4, height: 1.6 });
    fx.smoke({ x: p.x, y: p.y, z: p.z, count: 6, color: 0x9aa8c8, alpha: 0.3, size: 0.9, speed: 1.2, up: 0.6, life: 1.4 });
    if (withKilau) kilau.spawnTransient(p.x, p.y + 0.4, p.z, 3);
    events.emit('spirit:banish', { x: p.x, y: p.y, z: p.z });
  }

  function banishAll(withKilau = false) {
    for (const g of ghosts) banish(g, withKilau);
    grace = Math.max(grace, 8);
  }

  function hurt(g) {
    const player = ctx.player;
    const pp = player.position;
    let dx = pp.x - g.pos.x, dz = pp.z - g.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    iframes = IFRAMES;
    g.touchCd = 2.6;
    g.vel.set(-dx * 7, 1.2, -dz * 7);
    state.addNyala(-20, 'hantu');
    player.knockback?.(dx, dz, 6);
    fx.shake(0.55, 0.4);
    fx.burst({ x: pp.x, y: pp.y + 1.1, z: pp.z, count: 26, color: 0x9fd8ff, speed: 3, sphere: true, life: 0.7, size: 0.12, drag: 3 });
    events.emit('player:hurt', { amount: 20, from: { x: g.pos.x, z: g.pos.z } });
    ctx.audio?.play?.('ghost', { x: g.pos.x, y: g.pos.y, z: g.pos.z, volume: 1, hit: true });
  }

  // ---------------------------------------------------------------- flare
  function flare(x, y, z) {
    const p = state.progress;
    const now = fx.now;
    if (now - lastFlare < 0.4) return false;
    if (p.nyala < FLARE_COST) {
      events.emit('toast', { text: `Nyala kurang buat suar (butuh ${FLARE_COST}).`, kind: 'warn' });
      return false;
    }
    lastFlare = now;
    state.addNyala(-FLARE_COST, 'flare');
    const player = ctx.player;
    const lx = x ?? player?.position.x ?? 0, lz = z ?? player?.position.z ?? 0;
    const ly = y ?? (player ? player.position.y + 1.2 : 1);
    const feetY = player ? player.position.y : ly - 1.2;
    fx.shell({ x: lx, y: ly - 0.3, z: lz, radius: FLARE_R + 1.5, duration: 0.7, color: 0xffd48a, intensity: 1.15, power: 3.4, squash: 0.55 });
    fx.after(0.1, () => fx.shell({ x: lx, y: ly - 0.3, z: lz, radius: 7, duration: 0.55, color: 0xfff0d0, intensity: 1.4, power: 3.5, squash: 0.6 }));
    fx.ring({ x: lx, y: feetY, z: lz, radius: 4.5, duration: 0.5, color: 0xffe0a0, width: 0.5, fill: 0.3, intensity: 1.6 });
    fx.burst({ x: lx, y: ly, z: lz, count: 70, color: 0xffd890, speed: 11, sphere: true, life: 0.8, size: 0.13, drag: 3.2 });
    fx.flash({ x: lx, y: ly, z: lz }, 0xffd890, 140, 0.8, 26);
    fx.bloomPulse(1.1, 0.8);
    fx.shake(0.2, 0.25);
    // Temporary kabut clearing: snaps open, holds, eases out.
    fx.tween(3.2, (k) => {
      const tt = k * 3.2;
      const r = tt < 0.3 ? 14 * (1 - Math.pow(1 - tt / 0.3, 3)) : tt < 1.2 ? 14 : 14 * (1 - smoothstep(1.2, 3.2, tt));
      ctx.fog?.setClearing?.('flare', lx, lz, Math.max(0.05, r), 1, true);
    }, () => ctx.fog?.removeClearing?.('flare'));
    let banished = 0;
    for (const g of ghosts) {
      if (g.state === 'banish') continue;
      const dh = Math.hypot(g.pos.x - lx, g.pos.z - lz);
      if (dh <= FLARE_R && Math.abs(g.pos.y - ly) < 7) {
        const delay = dh / 30;
        g.state = 'stun';
        fx.after(delay, () => banish(g, true));
        banished++;
      } else if (dh <= FLARE_R * 2.2) {
        // Out of reach but scared: recoil and flicker for a moment.
        g.touchCd = Math.max(g.touchCd, 2.4);
        g.flicker = 1;
      }
    }
    events.emit('flare:pulse', { x: lx, y: ly, z: lz, banished });
    return true;
  }
  events.on('player:flare', (e) => {
    if (state.mode !== 'play') return;
    flare(e?.x, e?.y, e?.z);
  });

  // ---------------------------------------------------------------- restore / events
  function clearGhosts() {
    ghosts.length = 0;
    grace = 6;
  }
  function restore() {
    clearGhosts();
    kilau.restore();
  }
  events.on('game:loaded', restore);
  events.on('game:reset', restore);
  events.on('player:respawn', () => { grace = 10; });
  events.on('quest:step', ({ step }) => { if (!GHOST_STEPS.has(step)) banishAll(false); });
  events.on('checkpoint:light', ({ id }) => {
    const cp = CHECKPOINTS.find((q) => q.id === id);
    if (!cp) return;
    for (const g of ghosts) if (Math.hypot(g.pos.x - cp.x, g.pos.z - cp.z) < 44) banish(g, false);
  });
  restore();

  // ---------------------------------------------------------------- per frame
  const toP = new THREE.Vector3();
  const desired = new THREE.Vector3();
  function update(dt, t) {
    mat.uniforms.uTime.value = t;
    kilau.update(dt, t);
    if (dt <= 0) return;
    const player = ctx.player;
    const mode = state.mode;
    const step = state.progress.quest;
    const active = mode === 'play' && GHOST_STEPS.has(step) && !state.progress.finished;
    iframes = Math.max(0, iframes - dt);
    grace = Math.max(0, grace - (mode === 'play' ? dt : 0));
    if (active && grace <= 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = 1.6 + Math.random() * 2.2;
        trySpawn();
      }
    }
    const pp = player?.position;
    const bubble = player?.lanternRadius ?? 14;
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      g.t += dt;
      g.touchCd = Math.max(0, g.touchCd - dt);
      if (g.state === 'banish') {
        const k = g.t / 0.55;
        g.alpha = Math.max(0, 1 - k) * 1.2;
        g.scale += dt * 0.9;
        g.pos.y += dt * 1.2;
        if (k >= 1) { ghosts.splice(i, 1); }
        continue;
      }
      if (g.state === 'stun') {
        g.flicker = 1;
        g.vel.multiplyScalar(Math.exp(-6 * dt));
        continue;
      }
      if (!pp) continue;
      toP.set(pp.x - g.pos.x, 0, pp.z - g.pos.z);
      const dh = toP.length();
      if (dh > 70 || (!active && mode === 'play')) { g.state = 'fade'; }
      // Flee lit campfires.
      if (litCampfireNear(g.pos.x, g.pos.z, 0)) g.state = 'fade';
      const inBubble = dh < bubble;
      if (g.state === 'fade') {
        g.targetAlpha = 0;
        g.alpha = damp(g.alpha, 0, 3, dt);
        g.vel.multiplyScalar(Math.exp(-2 * dt));
        g.pos.addScaledVector(g.vel, dt);
        if (g.alpha < 0.02) ghosts.splice(i, 1);
        continue;
      }
      // Appear softly.
      g.alpha = damp(g.alpha, g.targetAlpha, 1.6, dt);
      const chasing = active && dh < CHASE_R;
      if (chasing) {
        const speed = 2.4 * (inBubble ? 0.4 : 1);
        toP.normalize();
        const weave = Math.sin(t * 1.3 + g.seed * 10) * 0.7 * (dh > 3 ? 1 : 0);
        desired.set(toP.x * speed - toP.z * weave, 0, toP.z * speed + toP.x * weave);
      } else {
        g.wander += (Math.sin(t * 0.37 + g.seed * 20) * 0.9) * dt;
        const homeDx = g.home.x - g.pos.x, homeDz = g.home.z - g.pos.z;
        desired.set(Math.cos(g.wander) * 0.6 + homeDx * 0.05, 0, Math.sin(g.wander) * 0.6 + homeDz * 0.05);
      }
      if (g.touchCd > 1.2) desired.multiplyScalar(-0.5); // recoil after a touch
      g.vel.x = damp(g.vel.x, desired.x, 2.2, dt);
      g.vel.z = damp(g.vel.z, desired.z, 2.2, dt);
      const ty = chasing && dh < 6 ? pp.y + 1.0 : hoverY(g.pos.x, g.pos.z, g.pos.y + 3) + Math.sin(t * 1.1 + g.seed * 7) * 0.25;
      g.vel.y = damp(g.vel.y, (ty - g.pos.y) * 1.5, 3, dt);
      g.pos.addScaledVector(g.vel, dt);
      g.flicker = damp(g.flicker, inBubble ? 1 : 0, 6, dt);
      // Whispers.
      if (dh < CHASE_R && mode === 'play') {
        g.whisper -= dt;
        if (g.whisper <= 0) {
          g.whisper = 4 + Math.random() * 5;
          ctx.audio?.play?.('ghost', { x: g.pos.x, y: g.pos.y, z: g.pos.z, volume: clamp(1 - dh / CHASE_R, 0.15, 1) });
        }
      }
      // Wisps drifting off the robe.
      g.wispT -= dt;
      if (g.wispT <= 0 && dh < 45) {
        g.wispT = 0.16 / Math.max(0.3, fx.particleScale);
        fx.smoke({ x: g.pos.x + (Math.random() - 0.5) * 0.5, y: g.pos.y - 0.9, z: g.pos.z + (Math.random() - 0.5) * 0.5, count: 1, color: 0xaebfe0, alpha: 0.18 * g.alpha, size: 0.45, speed: 0.2, up: 0.35, life: 1.8, buoyancy: 0.1, grow: 2.2 });
      }
      // Touch.
      if (active && iframes <= 0 && g.touchCd <= 0 && dh < TOUCH_R && Math.abs(pp.y + 0.9 - g.pos.y) < 1.7) hurt(g);
    }
    // Write instances.
    for (let i = 0; i < MAXG; i++) {
      const g = ghosts[i];
      if (!g) { gData[i * 4] = 0; continue; }
      gPos[i * 3] = g.pos.x; gPos[i * 3 + 1] = g.pos.y; gPos[i * 3 + 2] = g.pos.z;
      gData[i * 4] = clamp(g.alpha, 0, 1.2); gData[i * 4 + 1] = g.flicker; gData[i * 4 + 2] = g.seed; gData[i * 4 + 3] = g.scale;
      gVel[i * 3] = g.vel.x; gVel[i * 3 + 1] = g.vel.y; gVel[i * 3 + 2] = g.vel.z;
    }
    aPos.needsUpdate = aData.needsUpdate = aVel.needsUpdate = true;
  }

  // Debug: drop a ghost at (x, z) (or 8 m in front of the player).
  function debugSpawn(x, z) {
    const p = ctx.player;
    if (x === undefined && p) {
      x = p.position.x - Math.sin(p.yaw) * 8;
      z = p.position.z - Math.cos(p.yaw) * 8;
    }
    const g = spawnGhost(x, z, (p?.position.y ?? 0) + 10);
    if (g) { g.alpha = 0.95; }
    return !!g;
  }

  return {
    update,
    banishAll,
    flare,
    ghosts,
    kilau,
    get kilauTotal() { return kilau.total; },
    get kilauFound() { return kilau.found; },
    debugSpawn,
    get iframes() { return iframes; },
  };
}
