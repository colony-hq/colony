// Combat & skilling FX: one pooled particle system (additive + soft-smoke passes, two draw
// calls total), projectiles (arrows on an arc, spell bolts, wyrm fire, thrown rocks), bursts,
// level-up fireworks, teleport swirls, death smoke, splashes, rare-drop sparkles, stun stars,
// wood / rock chips. Owner: actors builder. API documented in createFx() below and in
// .qa/notes-actors.md.

import * as THREE from 'three';
import { Builder, C, materials, glowTexture, clamp, lerp, smooth01, TAU } from './a-core.js';

const MAX = 4000;

function particleMaterial(additive) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 400 }, uTex: { value: null } }]);
  uniforms.uTex.value = glowTexture();
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
      uniform float uScale; varying vec3 vColor; varying float vAlpha;
      #include <fog_pars_vertex>
      void main() {
        vColor = aColor; vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aSize * uScale * 1.35 / max(0.1, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D uTex; varying vec3 vColor; varying float vAlpha;
      #include <fog_pars_fragment>
      void main() {
        float a = texture2D(uTex, gl_PointCoord).a * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor * ${additive ? 'a' : '1.0'}, ${additive ? '1.0' : 'a'});
        ${additive ? `#ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogF = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          gl_FragColor.rgb *= 1.0 - fogF;
        #endif` : '#include <fog_fragment>'}
      }`,
    transparent: true, depthWrite: false, fog: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

class Pool {
  constructor(additive, parent) {
    this.n = 0;
    const f = (k) => new Float32Array(MAX * k);
    this.p = f(3); this.v = f(3); this.col = f(3); this.life = f(1); this.max = f(1); this.s0 = f(1); this.s1 = f(1); this.a0 = f(1);
    this.grav = f(1); this.drag = f(1); this.orb = f(6); // orbit: cx, cz, r, ang, w, vr
    this.flick = f(1);
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.size = new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
    this.color = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('aSize', this.size);
    g.setAttribute('aAlpha', this.alpha);
    g.setAttribute('aColor', this.color);
    g.setDrawRange(0, 0);
    this.mat = particleMaterial(additive);
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    parent.add(this.points);
  }
  // o: { x,y,z, vx,vy,vz, life, size, size1, color(Color), alpha, grav, drag, orbit:{cx,cz,r,ang,w,vr}, flicker }
  emit(o) {
    if (this.n >= MAX) return;
    const i = this.n++;
    const p = this.p, v = this.v;
    p[i * 3] = o.x; p[i * 3 + 1] = o.y; p[i * 3 + 2] = o.z;
    v[i * 3] = o.vx || 0; v[i * 3 + 1] = o.vy || 0; v[i * 3 + 2] = o.vz || 0;
    const c = o.color;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = 0; this.max[i] = o.life || 1;
    this.s0[i] = o.size || 0.2; this.s1[i] = o.size1 ?? this.s0[i];
    this.a0[i] = o.alpha ?? 1; this.grav[i] = o.grav || 0; this.drag[i] = o.drag || 0; this.flick[i] = o.flicker || 0;
    const ob = this.orb;
    if (o.orbit) { ob[i * 6] = o.orbit.cx; ob[i * 6 + 1] = o.orbit.cz; ob[i * 6 + 2] = o.orbit.r; ob[i * 6 + 3] = o.orbit.ang; ob[i * 6 + 4] = o.orbit.w; ob[i * 6 + 5] = o.orbit.vr || 0; }
    else ob[i * 6 + 2] = -1;
  }
  copy(a, b) {
    for (let k = 0; k < 3; k++) { this.p[a * 3 + k] = this.p[b * 3 + k]; this.v[a * 3 + k] = this.v[b * 3 + k]; this.col[a * 3 + k] = this.col[b * 3 + k]; }
    for (let k = 0; k < 6; k++) this.orb[a * 6 + k] = this.orb[b * 6 + k];
    this.life[a] = this.life[b]; this.max[a] = this.max[b]; this.s0[a] = this.s0[b]; this.s1[a] = this.s1[b]; this.a0[a] = this.a0[b];
    this.grav[a] = this.grav[b]; this.drag[a] = this.drag[b]; this.flick[a] = this.flick[b];
  }
  update(dt, t) {
    const P = this.pos.array, S = this.size.array, A = this.alpha.array, Cc = this.color.array;
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) { this.n--; if (i !== this.n) this.copy(i, this.n); continue; }
      const k = this.life[i] / this.max[i];
      const ob = this.orb;
      if (ob[i * 6 + 2] >= 0) {
        ob[i * 6 + 3] += ob[i * 6 + 4] * dt;
        ob[i * 6 + 2] = Math.max(0, ob[i * 6 + 2] + ob[i * 6 + 5] * dt);
        this.p[i * 3] = ob[i * 6] + Math.cos(ob[i * 6 + 3]) * ob[i * 6 + 2];
        this.p[i * 3 + 2] = ob[i * 6 + 1] + Math.sin(ob[i * 6 + 3]) * ob[i * 6 + 2];
        this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      } else {
        const d = Math.exp(-this.drag[i] * dt);
        this.v[i * 3] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d - this.grav[i] * dt; this.v[i * 3 + 2] *= d;
        this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      }
      P[i * 3] = this.p[i * 3]; P[i * 3 + 1] = this.p[i * 3 + 1]; P[i * 3 + 2] = this.p[i * 3 + 2];
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      const fade = k < 0.12 ? k / 0.12 : 1 - smooth01(0.45, 1, k);
      const fl = this.flick[i] ? 1 - this.flick[i] * 0.5 * (1 + Math.sin(t * 40 + i * 1.7)) : 1;
      A[i] = this.a0[i] * fade * fl;
      Cc[i * 3] = this.col[i * 3]; Cc[i * 3 + 1] = this.col[i * 3 + 1]; Cc[i * 3 + 2] = this.col[i * 3 + 2];
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    if (this.n) {
      for (const a of [this.pos, this.size, this.alpha, this.color]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true; }
    }
  }
}

// Arrow geometry (shaft along -z from the origin = nock).
let ARROW_GEO = null;
function arrowGeometry() {
  if (ARROW_GEO) return ARROW_GEO;
  const B = new Builder(null, { aoMin: 1 });
  B.add(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 5), null, '#c9a46a', { rot: [Math.PI / 2, 0, 0], at: [0, 0, -0.375], ao: false });
  B.add(new THREE.ConeGeometry(0.03, 0.1, 5), null, '#b8bec6', { rot: [-Math.PI / 2, 0, 0], at: [0, 0, -0.79], shine: 1, ao: false });
  for (const r of [0, Math.PI / 2]) B.add(new THREE.BoxGeometry(0.004, 0.09, 0.12), null, '#f2efe6', { rot: [0, 0, r], at: [0, 0, -0.04], ao: false });
  ARROW_GEO = B.build();
  return ARROW_GEO;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const COLORS = {
  spark: '#ffe9a8', fire: '#ff8a3a', ember: '#ffb04a', smoke: '#5a5550', dust: '#b8a27a', water: '#bfe4ff', gold: '#ffd34d',
  heal: '#7dff9a', magic: '#b18cff', orbio: '#8fe3ff', blood: '#c0392b', wood: '#a67c45', stone: '#9a9088', path: '#8fe3d0',
};

export function createFx(ctx, parent) {
  const group = new THREE.Group();
  group.name = 'actor-fx';
  parent.add(group);
  const add = new Pool(true, group);
  const soft = new Pool(false, group);
  const projectiles = [];
  const timers = [];
  const sprites = [];
  const arrowPool = [];
  let t = 0;
  const R = Math.random;
  const col = (c, k = 1) => C(c in COLORS ? COLORS[c] : c).multiplyScalar(k);
  const q = () => (ctx.engine?.preset?.particles ?? 1);

  // ---- position helpers ----
  function at(x, out = new THREE.Vector3(), part = 'chest') {
    if (!x) return out.set(0, 0, 0);
    if (Array.isArray(x)) return out.set(x[0], x[1], x[2]);
    if (x.isVector3) return out.copy(x);
    if (x.socket && x.root) return x.socket(part, out);
    if (x.view && x.view.socket) return x.view.socket(part, out);
    if (x.pos) return out.set(x.pos.x, x.pos.y + (part === 'feet' ? 0 : part === 'head' ? 1.8 : 1.0), x.pos.z);
    if (x.x !== undefined) return out.set(x.x, x.y ?? 0, x.z);
    return out.set(0, 0, 0);
  }
  const later = (delay, fn) => { if (delay <= 0) fn(); else timers.push({ at: t + delay, fn }); };

  // Flash sprite (short-lived additive glow).
  function flash(p, color, size = 1, life = 0.25) {
    let s = sprites.find((x) => !x.visible);
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.renderOrder = 6;
      group.add(s);
      sprites.push(s);
    }
    s.visible = true;
    s.position.copy(p);
    s.material.color.copy(col(color));
    s.userData = { t0: t, life, size };
    s.scale.setScalar(size);
    return s;
  }

  // ---- bursts ----
  function burst(where, o = {}) {
    const p = at(where, new THREE.Vector3(), o.part || 'chest');
    const n = Math.round((o.count ?? 16) * q());
    const c = col(o.color || 'spark');
    const sp = o.speed ?? 3;
    const pool = o.soft ? soft : add;
    for (let i = 0; i < n; i++) {
      const th = R() * TAU, ph = Math.acos(2 * R() - 1);
      const s = sp * (0.4 + 0.6 * R());
      pool.emit({
        x: p.x, y: p.y, z: p.z,
        vx: Math.sin(ph) * Math.cos(th) * s, vy: Math.cos(ph) * s * (o.up ?? 1) + (o.lift || 0), vz: Math.sin(ph) * Math.sin(th) * s,
        life: (o.life ?? 0.5) * (0.6 + 0.6 * R()), size: o.size ?? 0.12, size1: o.size1 ?? 0.02, color: c, alpha: o.alpha ?? 1,
        grav: o.grav ?? 4, drag: o.drag ?? 2.5, flicker: o.flicker || 0,
      });
    }
    if (o.flash !== false && !o.soft) flash(p, o.color || 'spark', o.flashSize ?? 1.2, 0.18);
    return p;
  }
  function hitSpark(where, o = {}) {
    return burst(where, { count: 14, speed: 3.5, size: 0.1, life: 0.35, color: o.color || 'spark', ...o });
  }
  function smoke(where, o = {}) {
    const p = at(where, new THREE.Vector3(), o.part || 'feet');
    const n = Math.round((o.count ?? 14) * q());
    const c = col(o.color || 'smoke');
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, r = (o.radius ?? 0.4) * R();
      soft.emit({
        x: p.x + Math.cos(a) * r, y: p.y + 0.2 + R() * (o.height ?? 0.8), z: p.z + Math.sin(a) * r,
        vx: Math.cos(a) * 0.4, vy: 0.5 + R() * 0.6, vz: Math.sin(a) * 0.4,
        life: (o.life ?? 1.6) * (0.7 + 0.5 * R()), size: o.size ?? 0.6, size1: (o.size ?? 0.6) * 2.4, color: c.clone().multiplyScalar(0.8 + 0.4 * R()),
        alpha: o.alpha ?? 0.55, grav: -0.2, drag: 1.2,
      });
    }
    return p;
  }
  function deathSmoke(where, o = {}) {
    const p = smoke(where, { count: 22, radius: 0.6 * (o.scale || 1), size: 0.7 * (o.scale || 1), height: 1.0 * (o.scale || 1), ...o });
    burst(p.clone().setY(p.y + 0.6 * (o.scale || 1)), { count: 10, color: '#d8d0c0', speed: 1.4, size: 0.08, life: 0.7, grav: -0.5, flash: false });
    return p;
  }
  function dust(where, o = {}) {
    const p = at(where, new THREE.Vector3(), 'feet');
    const n = Math.round((o.count ?? 3) * q());
    for (let i = 0; i < n; i++) {
      const a = R() * TAU;
      soft.emit({ x: p.x + Math.cos(a) * 0.1, y: p.y + 0.05, z: p.z + Math.sin(a) * 0.1, vx: Math.cos(a) * 0.5, vy: 0.3 + R() * 0.3, vz: Math.sin(a) * 0.5, life: 0.7, size: 0.2, size1: 0.55, color: col(o.color || 'dust'), alpha: 0.35, grav: -0.1, drag: 3 });
    }
  }
  function splash(where, o = {}) {
    const p = at(where, new THREE.Vector3(), 'feet');
    const s = o.size ?? 1;
    const n = Math.round(22 * s * q());
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, sp = (1 + R() * 1.6) * s;
      add.emit({ x: p.x, y: p.y + 0.05, z: p.z, vx: Math.cos(a) * sp * 0.5, vy: 2.2 + R() * 2.2 * s, vz: Math.sin(a) * sp * 0.5, life: 0.75, size: 0.09 * s, size1: 0.04, color: col('water', 0.8), alpha: 0.9, grav: 9, drag: 0.5 });
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      soft.emit({ x: p.x, y: p.y + 0.03, z: p.z, orbit: { cx: p.x, cz: p.z, r: 0.1, ang: a, w: 0, vr: 1.4 * s }, vy: 0, life: 0.7, size: 0.16 * s, size1: 0.05, color: col('#e8f6ff'), alpha: 0.6 });
    }
    return p;
  }
  function sparkle(where, o = {}) {
    const p = at(where, new THREE.Vector3(), 'feet');
    const dur = o.duration ?? 2.5;
    const c = o.color || 'gold';
    const beam = flash(p.clone().setY(p.y + 1.0), c, 1.4, dur);
    beam.scale.set(0.9, 3.2, 1);
    beam.userData.beam = true;
    const steps = Math.round(dur / 0.08);
    for (let k = 0; k < steps; k++) {
      later(k * 0.08, () => {
        const a = R() * TAU, r = 0.15 + R() * 0.45;
        add.emit({ x: p.x + Math.cos(a) * r, y: p.y + 0.05 + R() * 0.4, z: p.z + Math.sin(a) * r, vx: 0, vy: 0.9 + R() * 0.8, vz: 0, life: 1.0, size: 0.14, size1: 0.02, color: col(c, 1.4), alpha: 1, flicker: 0.8 });
      });
    }
    return p;
  }
  function heal(where, o = {}) {
    const p = at(where, new THREE.Vector3(), 'feet');
    for (let i = 0; i < Math.round(18 * q()); i++) {
      const a = R() * TAU, r = 0.25 + R() * 0.25;
      add.emit({ x: p.x + Math.cos(a) * r, y: p.y + 0.2 + R() * 1.2, z: p.z + Math.sin(a) * r, vy: 0.8 + R() * 0.5, life: 1.1, size: 0.13, size1: 0.03, color: col(o.color || 'heal', 1.3), alpha: 0.9 });
    }
    return p;
  }
  // Slow rising motes (ambient glow around magical beings).
  function motes(where, o = {}) {
    const p = at(where, new THREE.Vector3(), 'feet');
    const n = o.count ?? 1;
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, r = (o.radius ?? 0.8) * Math.sqrt(R());
      add.emit({ x: p.x + Math.cos(a) * r, y: p.y + (o.y0 ?? 0.1) + R() * (o.height ?? 0.6), z: p.z + Math.sin(a) * r, vx: 0, vy: o.speed ?? 0.5, vz: 0, life: o.life ?? 2.2, size: o.size ?? 0.09, size1: 0.02, color: col(R() < 0.5 ? (o.color || 'orbio') : (o.color2 || 'magic'), 1.3), alpha: 0.9, flicker: 0.3 });
    }
  }
  function ring(where, o = {}) {
    const p = at(where, new THREE.Vector3(), 'feet');
    const n = Math.round((o.count ?? 32) * Math.max(0.5, q()));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      add.emit({ x: p.x, y: p.y + (o.y ?? 0.08), z: p.z, orbit: { cx: p.x, cz: p.z, r: o.r0 ?? 0.2, ang: a, w: o.spin ?? 0, vr: o.speed ?? 2.4 }, vy: o.vy ?? 0, life: o.life ?? 0.6, size: o.size ?? 0.18, size1: 0.05, color: col(o.color || 'gold', 1.3), alpha: 1 });
    }
  }
  function swirl(where, o = {}) {
    const p = at(where, new THREE.Vector3(), 'feet');
    const c = o.color || 'path';
    const dur = o.duration ?? 1.4;
    const n = Math.round(90 * q());
    for (let i = 0; i < n; i++) {
      later((i / n) * dur * 0.8, () => {
        const a = R() * TAU;
        add.emit({ x: p.x, y: p.y + 0.05 + R() * 0.3, z: p.z, orbit: { cx: p.x, cz: p.z, r: 0.75 + R() * 0.2, ang: a, w: 5 + R() * 2, vr: -0.35 }, vy: 1.5 + R() * 1.2, life: 1.1, size: 0.14, size1: 0.04, color: col(c, 1.4), alpha: 1 });
      });
    }
    later(dur * 0.85, () => { flash(p.clone().setY(p.y + 1), c, 3.2, 0.45); burst(p.clone().setY(p.y + 1), { color: c, count: 30, speed: 3.2, size: 0.12, life: 0.7, grav: -1, flash: false }); });
    ring(p, { color: c, speed: 1.6, life: 0.9 });
    return dur;
  }
  function teleport(where, o = {}) { return swirl(where, { color: o.color || 'path', duration: o.duration ?? 1.4 }); }
  function levelUp(where, o = {}) {
    const p = at(where, new THREE.Vector3(), 'feet');
    const colors = o.colors || ['#ffd34d', '#5f9a3e', '#8fe3ff', '#ff8a3a', '#b18cff'];
    ring(p, { color: '#ffd34d', speed: 3, life: 0.8, size: 0.22 });
    later(0.15, () => ring(p, { color: '#fff2b0', speed: 2.2, life: 0.9, y: 0.4, size: 0.16 }));
    // Rising column of sparkles.
    for (let i = 0; i < Math.round(50 * q()); i++) {
      later(R() * 0.8, () => {
        const a = R() * TAU, r = 0.3 + R() * 0.3;
        add.emit({ x: p.x + Math.cos(a) * r, y: p.y + 0.1, z: p.z + Math.sin(a) * r, vy: 2.5 + R() * 2, life: 1.2, size: 0.16, size1: 0.04, color: col('#ffe9a8', 1.5), alpha: 1, flicker: 0.5 });
      });
    }
    // Fireworks: rockets that burst around the head.
    const rockets = 5;
    for (let k = 0; k < rockets; k++) {
      const a = (k / rockets) * TAU + R() * 0.5;
      const dist = 1.1 + R() * 0.6, h = 2.6 + R() * 1.0;
      const target = new THREE.Vector3(p.x + Math.cos(a) * dist, p.y + h, p.z + Math.sin(a) * dist);
      const c = colors[k % colors.length];
      later(0.1 + k * 0.22, () => {
        projectile({ from: p.clone().setY(p.y + 0.3), to: target, kind: 'rocket', color: c, speed: 9, arc: 0.4, onHit: (pt) => {
          burst(pt, { color: c, count: 56, speed: 4.4, size: 0.2, size1: 0.04, life: 1.2, grav: 2.2, drag: 1.6, flicker: 0.4, flashSize: 2.6 });
          burst(pt, { color: '#ffffff', count: 10, speed: 2, size: 0.08, life: 0.5, grav: 1, flash: false });
        } });
      });
    }
    return 1.8;
  }
  function stun(actor, seconds = 2.4) {
    const n = 5;
    const p = at(actor, new THREE.Vector3(), 'head');
    for (let i = 0; i < n; i++) {
      add.emit({ x: p.x, y: p.y + 0.25, z: p.z, orbit: { cx: p.x, cz: p.z, r: 0.32, ang: (i / n) * TAU, w: 4, vr: 0 }, vy: 0, life: seconds, size: 0.16, size1: 0.12, color: col('#ffe066', 1.5), alpha: 1, flicker: 0.4 });
    }
  }
  // Skilling feedback.
  function chips(where, kind = 'wood') {
    const p = at(where, new THREE.Vector3(), 'weapon');
    if (kind === 'wood') burst(p, { soft: true, count: 7, color: 'wood', speed: 2.6, size: 0.07, size1: 0.05, life: 0.7, grav: 9, drag: 0.6, up: 0.6, lift: 1.5 });
    else if (kind === 'rock') {
      burst(p, { soft: true, count: 6, color: 'stone', speed: 2.4, size: 0.07, size1: 0.05, life: 0.6, grav: 9, drag: 0.6, lift: 1.2 });
      burst(p, { count: 6, color: '#ffd38a', speed: 3, size: 0.05, life: 0.3, grav: 6, flash: false });
    } else if (kind === 'anvil') burst(p, { count: 12, color: '#ffc06a', speed: 3.5, size: 0.05, size1: 0.02, life: 0.45, grav: 7, flashSize: 0.6 });
    else if (kind === 'water') splash(p, { size: 0.5 });
  }

  // ---- projectiles ----
  // o: { from, to, kind: 'arrow'|'bolt'|'fire'|'rock'|'shard'|'rocket', color, speed (m/s), arc (m),
  //      delay (s), size, onHit(point), impact: false to skip the impact burst } -> seconds to impact
  function projectile(o) {
    const from = at(o.from, new THREE.Vector3(), o.fromPart || 'weapon');
    const to = at(o.to, new THREE.Vector3(), 'chest');
    const dist = from.distanceTo(to);
    const kind = o.kind || 'bolt';
    const speed = o.speed ?? (kind === 'arrow' ? 18 : kind === 'rock' ? 10 : 12);
    const dur = Math.max(0.12, dist / speed);
    const arc = o.arc ?? (kind === 'arrow' ? dist * 0.08 : kind === 'rock' ? dist * 0.25 : dist * 0.03);
    const pr = { from, to, kind, color: col(o.color || (kind === 'fire' ? 'fire' : kind === 'arrow' ? '#ffffff' : 'magic')), t: -(o.delay || 0), dur, arc, onHit: o.onHit, size: o.size ?? 1, impact: o.impact !== false, mesh: null, glow: null, emitAcc: 0, src: o.from, dst: o.to };
    if (kind === 'arrow') {
      let m = arrowPool.find((a) => !a.visible);
      if (!m) { m = new THREE.Mesh(arrowGeometry(), materials().body); m.castShadow = false; group.add(m); arrowPool.push(m); }
      m.visible = false;
      pr.mesh = m;
    } else if (kind === 'rock') {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 * pr.size, 0), materials().body);
      const g = m.geometry; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(0.5), 3)); g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      m.visible = false; group.add(m); pr.mesh = m; pr.ownMesh = true;
    } else {
      pr.glow = flash(from, pr.color, 0.0, 1e9);
      pr.glow.visible = false;
    }
    projectiles.push(pr);
    return dur + (o.delay || 0);
  }
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.t += dt;
      if (p.t < 0) continue;
      // Track moving targets.
      if (p.dst && (p.dst.root || p.dst.view || p.dst.pos)) at(p.dst, p.to, 'chest');
      const k = clamp(p.t / p.dur, 0, 1);
      const x = lerp(p.from.x, p.to.x, k), z = lerp(p.from.z, p.to.z, k);
      const y = lerp(p.from.y, p.to.y, k) + 4 * p.arc * k * (1 - k);
      const dy = (p.to.y - p.from.y) + 4 * p.arc * (1 - 2 * k);
      const cur = _v.set(x, y, z);
      if (p.mesh) {
        p.mesh.visible = true;
        p.mesh.position.copy(cur);
        if (p.kind === 'arrow') {
          _v2.set(p.to.x - p.from.x, dy, p.to.z - p.from.z).normalize();
          p.mesh.lookAt(_v2.multiplyScalar(-1).add(cur));
        } else p.mesh.rotation.set(p.t * 9, p.t * 7, 0);
      }
      if (p.glow) {
        p.glow.visible = true;
        p.glow.position.copy(cur);
        const s = (p.kind === 'fire' ? 1.1 : p.kind === 'rocket' ? 0.7 : 0.9) * p.size * (1 + 0.15 * Math.sin(t * 30));
        p.glow.scale.setScalar(s);
        p.glow.userData.life = 1e9;
      }
      // Trails.
      p.emitAcc += dt * (p.kind === 'arrow' ? 25 : p.kind === 'fire' ? 90 : 70) * q();
      while (p.emitAcc >= 1) {
        p.emitAcc -= 1;
        if (p.kind === 'arrow') soft.emit({ x, y, z, life: 0.25, size: 0.05, size1: 0.02, color: col('#f2efe6'), alpha: 0.35 });
        else if (p.kind === 'fire') {
          add.emit({ x: x + (R() - 0.5) * 0.15, y: y + (R() - 0.5) * 0.15, z: z + (R() - 0.5) * 0.15, vx: (R() - 0.5), vy: 0.8 + R(), vz: (R() - 0.5), life: 0.45, size: 0.35 * p.size, size1: 0.08, color: col(R() < 0.5 ? 'fire' : 'ember', 1.2), alpha: 1 });
          if (R() < 0.25) soft.emit({ x, y, z, vy: 0.6, life: 0.9, size: 0.3, size1: 0.8, color: col('smoke', 0.6), alpha: 0.35 });
        } else if (p.kind !== 'rock') {
          add.emit({ x: x + (R() - 0.5) * 0.06, y: y + (R() - 0.5) * 0.06, z: z + (R() - 0.5) * 0.06, vx: (R() - 0.5) * 0.4, vy: (R() - 0.5) * 0.4, vz: (R() - 0.5) * 0.4, life: 0.35, size: 0.16 * p.size, size1: 0.02, color: p.color.clone().multiplyScalar(1.3), alpha: 1 });
        }
      }
      if (k >= 1) {
        const hitP = cur.clone();
        if (p.impact) {
          if (p.kind === 'arrow') hitSpark(hitP, { count: 8, color: '#fff2c8', speed: 2.5 });
          else if (p.kind === 'fire') { burst(hitP, { color: 'fire', count: 26, speed: 3, size: 0.3, size1: 0.05, life: 0.6, grav: -1, flashSize: 2 }); smoke(hitP, { count: 6, size: 0.4 }); }
          else if (p.kind === 'rock') burst(hitP, { soft: true, color: 'stone', count: 10, speed: 3, size: 0.1, life: 0.6, grav: 9 });
          else if (p.kind !== 'rocket') burst(hitP, { color: p.color, count: 22, speed: 3.2, size: 0.14, life: 0.5, grav: 0.5, flashSize: 1.8 });
        }
        if (p.mesh) { p.mesh.visible = false; if (p.ownMesh) { group.remove(p.mesh); p.mesh.geometry.dispose(); } }
        if (p.glow) p.glow.visible = false;
        projectiles.splice(i, 1);
        try { p.onHit?.(hitP); } catch (err) { console.error('[fx] onHit', err); }
      }
    }
  }

  // Fire breath: a widening stream from the source's mouth toward the target.
  function breathStream(source, target, o = {}) {
    const dur = o.duration ?? 1.3;
    const steps = Math.round(dur / 0.025);
    const c1 = o.color || 'fire';
    for (let s = 0; s < steps; s++) {
      later(s * 0.025, () => {
        const m = at(source, new THREE.Vector3(), 'mouth');
        const tg = at(target, new THREE.Vector3(), 'chest');
        const dir = tg.clone().sub(m);
        const len = dir.length();
        dir.normalize();
        const n = Math.max(1, Math.round(4 * q()));
        for (let i = 0; i < n; i++) {
          const sp = len / 0.55;
          const spread = 0.18;
          add.emit({
            x: m.x, y: m.y, z: m.z,
            vx: (dir.x + (R() - 0.5) * spread) * sp, vy: (dir.y + (R() - 0.5) * spread) * sp + 0.4, vz: (dir.z + (R() - 0.5) * spread) * sp,
            life: 0.55 + R() * 0.15, size: 0.18, size1: 0.9 + R() * 0.4, color: col(R() < 0.35 ? '#ffd27a' : R() < 0.7 ? c1 : '#ff5a2a', 1.2), alpha: 0.9, drag: 1.2, grav: -1.5,
          });
        }
        if (R() < 0.3) soft.emit({ x: m.x + dir.x * len * 0.7, y: m.y + dir.y * len * 0.7 + 0.5, z: m.z + dir.z * len * 0.7, vy: 0.8, life: 1.4, size: 0.5, size1: 1.6, color: col('smoke', 0.55), alpha: 0.35, grav: -0.3 });
      });
    }
    later(0.45, () => { const tg = at(target, new THREE.Vector3(), 'chest'); flash(tg, c1, 2.5, 0.8); });
    if (o.onHit) later(0.5, () => { try { o.onHit(at(target, new THREE.Vector3(), 'chest')); } catch (e) { console.error(e); } });
    return 0.5;
  }

  // ---- convenience: play the source's animation and fire at the right moment ----
  function shoot(source, target, o = {}) {
    const a = actorOf(source);
    const rel = a?.play ? (a.play('shoot', { restart: true }), a.timing?.('shoot')?.release ?? 0.6) : 0;
    return projectile({ from: a || source, fromPart: 'bow', to: target, kind: 'arrow', delay: rel, onHit: o.onHit, color: o.color, speed: o.speed, arc: o.arc });
  }
  function cast(source, target, o = {}) {
    const a = actorOf(source);
    const rel = a?.play ? (a.play(o.anim || 'cast', { restart: true }), a.timing?.(o.anim || 'cast')?.release ?? 0.45) : 0;
    const color = o.color || spellColor(o.spell) || 'magic';
    later(rel, () => flash(at(a || source, new THREE.Vector3(), 'weapon'), color, 1.1, 0.25));
    return projectile({ from: a || source, fromPart: 'weapon', to: target, kind: o.kind || 'bolt', color, delay: rel, onHit: o.onHit, speed: o.speed ?? 13, size: o.size ?? 1 });
  }
  function breath(source, target, o = {}) {
    const a = actorOf(source);
    let rel = 0.7;
    if (a?.play) { a.play('breath', { restart: true }); rel = a.timing?.('breath')?.release ?? 0.7; }
    later(rel, () => breathStream(a || source, target, o));
    return rel + 0.5;
  }
  const actorOf = (x) => (x && x.play ? x : x?.view?.play ? x.view : null);
  let SPELLS = null;
  function spellColor(id) {
    if (!id) return null;
    if (!SPELLS) { SPELLS = {}; import('../data/economy.js').then((m) => { for (const s of m.SPELLS || []) SPELLS[s.id] = s.color; }).catch(() => {}); }
    return SPELLS[id] || null;
  }
  spellColor('x');

  function update(dt) {
    t += dt;
    for (let i = timers.length - 1; i >= 0; i--) {
      if (t >= timers[i].at) { const f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (err) { console.error('[fx]', err); } }
    }
    updateProjectiles(dt);
    for (const s of sprites) {
      if (!s.visible) continue;
      const u = s.userData;
      if (u.life >= 1e8) continue;
      const k = (t - u.t0) / u.life;
      if (k >= 1) { s.visible = false; continue; }
      s.material.opacity = (u.beam ? Math.sin(Math.PI * k) * 0.7 : 1 - k);
      if (!u.beam) s.scale.setScalar(u.size * (0.6 + 0.6 * k));
    }
    // Point size scale: pixels per world unit at distance 1.
    const cam = ctx.camera;
    const h = ctx.renderer?.domElement?.height || 720;
    const scale = h / (2 * Math.tan((cam.fov * Math.PI) / 360));
    add.mat.uniforms.uScale.value = scale; soft.mat.uniforms.uScale.value = scale;
    add.update(dt, t);
    soft.update(dt, t);
  }
  function clear() {
    add.n = 0; soft.n = 0; timers.length = 0;
    for (const p of projectiles) { if (p.mesh) p.mesh.visible = false; if (p.glow) p.glow.visible = false; }
    projectiles.length = 0;
  }
  return {
    group, update, clear,
    projectile, shoot, cast, breath, breathStream,
    burst, hitSpark, smoke, deathSmoke, dust, splash, sparkle, heal, ring, swirl, teleport, levelUp, stun, chips, flash, motes,
    get count() { return add.n + soft.n; },
    get projectiles() { return projectiles.length; },
  };
}
