// Geometry builder for set dressing (owner: setdressing).
// A Builder accumulates many small primitives (in metres, with frames like a scene graph),
// tints them with vertex colours, and merges them into one mesh per material at build().
// Colliders are registered through the same frames so visuals and collision agree.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, hashString } from '../core/noise.js';
import { patchMaterial } from './fog.js';
import { createPropTextures, createPropMaterials } from './props-textures.js';

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export const smoothstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// t: {x,y,z,yaw,pitch,roll,sx,sy,sz,s}
export function makeMatrix(t = {}, out = new THREE.Matrix4()) {
  _e.set(t.pitch || 0, t.yaw || 0, t.roll || 0, 'YXZ');
  _q.setFromEuler(_e);
  _v.set(t.x || 0, t.y || 0, t.z || 0);
  const s = t.s ?? 1;
  _s.set((t.sx ?? 1) * s, (t.sy ?? 1) * s, (t.sz ?? 1) * s);
  return out.compose(_v, _q, _s);
}

// ---------------------------------------------------------------------------------------------
// Primitive geometry with UVs in metres.
// ---------------------------------------------------------------------------------------------
// grain: which local axis texture v should follow on every face ('x' | 'y' | 'z').
export function boxGeo(w, h, d, grain = null) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const faces = [['z', 'y', d, h], ['z', 'y', d, h], ['x', 'z', w, d], ['x', 'z', w, d], ['x', 'y', w, h], ['x', 'y', w, h]];
  for (let f = 0; f < 6; f++) {
    const [ua, , du, dv] = faces[f];
    const swap = grain && grain === ua;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const u = uv.getX(i) * du, v = uv.getY(i) * dv;
      if (swap) uv.setXY(i, v, u); else uv.setXY(i, u, v);
    }
  }
  return g;
}

export function cylGeo(rTop, rBot, h, seg = 8, open = false, hseg = 1) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, hseg, open);
  const uv = g.attributes.uv, n = g.attributes.normal;
  const circ = Math.PI * (rTop + rBot);
  const R = Math.max(rTop, rBot);
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(n.getY(i)) > 0.99 && (i >= (seg + 1) * (hseg + 1))) uv.setXY(i, uv.getX(i) * 2 * R, uv.getY(i) * 2 * R);
    else uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h);
  }
  return g;
}

// Irregular rock: subdivided icosahedron with deterministic noise displacement.
export function rockGeo(r, seed = 1, detail = 1, squash = 0.7, rough = 0.28) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const rand = mulberry32(seed);
  const p = g.attributes.position;
  const offs = [rand() * 10, rand() * 10, rand() * 10];
  const k = [0.9 + rand(), 0.9 + rand(), 0.9 + rand()];
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const n = _v.clone().normalize();
    const d = 1 + rough * (Math.sin(n.x * 3.1 * k[0] + offs[0]) * Math.sin(n.y * 2.7 * k[1] + offs[1]) * Math.sin(n.z * 3.4 * k[2] + offs[2]))
      + rough * 0.5 * Math.sin(n.x * 7 + n.z * 5 + offs[1]);
    _v.multiplyScalar(d);
    _v.y *= squash;
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  // Merge duplicated vertices so normals are smooth (Icosahedron is non-indexed).
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const merged = mergeVerts(g);
  merged.computeVertexNormals();
  // Triplanar-ish metre UVs.
  const P = merged.attributes.position, N = merged.attributes.normal;
  const uvs = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) {
    const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i));
    if (ay >= ax && ay >= az) { uvs[i * 2] = P.getX(i); uvs[i * 2 + 1] = P.getZ(i); }
    else if (ax >= az) { uvs[i * 2] = P.getZ(i); uvs[i * 2 + 1] = P.getY(i); }
    else { uvs[i * 2] = P.getX(i); uvs[i * 2 + 1] = P.getY(i); }
  }
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return merged;
}

// Weld identical positions (simple hash) -> indexed geometry.
export function mergeVerts(g, eps = 1e-4) {
  const p = g.attributes.position;
  const map = new Map();
  const pos = [];
  const idx = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = Math.round(x / eps) + ',' + Math.round(y / eps) + ',' + Math.round(z / eps);
    let j = map.get(key);
    if (j === undefined) { j = pos.length / 3; map.set(key, j); pos.push(x, y, z); }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

// Generic grid surface: fn(u, v) -> [x, y, z] (u, v in 0..1), with metre UVs from arc length.
export function surfaceGeo(nu, nv, fn, { closeU = false, uvScale = 1, flip = false } = {}) {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uvs = new Float32Array((nu + 1) * (nv + 1) * 2);
  const P = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const p = fn(i / nu, j / nv);
      const k = j * (nu + 1) + i;
      pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      P.push(p);
    }
  }
  // Arc-length UVs (u along rows, v along columns).
  for (let j = 0; j <= nv; j++) {
    let acc = 0;
    for (let i = 0; i <= nu; i++) {
      const k = j * (nu + 1) + i;
      if (i > 0) { const a = P[k - 1], b = P[k]; acc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
      uvs[k * 2] = acc * uvScale;
    }
  }
  for (let i = 0; i <= nu; i++) {
    let acc = 0;
    for (let j = 0; j <= nv; j++) {
      const k = j * (nu + 1) + i;
      if (j > 0) { const a = P[k - (nu + 1)], b = P[k]; acc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
      uvs[k * 2 + 1] = acc * uvScale;
    }
  }
  const idx = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Make a geometry's average normal face `dir` (flip triangle winding otherwise).
export function orient(g, dir) {
  g.computeVertexNormals();
  const n = g.attributes.normal;
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < n.count; i++) { sx += n.getX(i); sy += n.getY(i); sz += n.getZ(i); }
  if (sx * dir[0] + sy * dir[1] + sz * dir[2] < 0) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.index.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

// Extruded 2D polygon (pts in local x/y), depth along z, centred. UVs in metres.
export function prismGeo(pts, depth) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  // ExtrudeGeometry UVs are already world-unit based for caps; sides use (length, depth).
  return g;
}

// Plane (w x h) in local XY facing +z, UVs mapped to an atlas region {u0,u1,v0,v1}.
export function atlasQuad(w, h, r, { flipU = false, segX = 1, segY = 1 } = {}) {
  const g = new THREE.PlaneGeometry(w, h, segX, segY);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i);
    if (flipU) u = 1 - u;
    uv.setXY(i, r.u0 + (r.u1 - r.u0) * u, r.v0 + (r.v1 - r.v0) * uv.getY(i));
  }
  return g;
}

// Lathe from a profile [[radius, y], ...] (bottom -> top). UVs in metres.
export function latheGeo(profile, seg = 12) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  const g = new THREE.LatheGeometry(pts, seg);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
  const R = Math.max(...profile.map((p) => p[0]));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * R, uv.getY(i) * len);
  return g;
}

// Tube along points (array of Vector3), radius r.
export function tubeGeo(points, r, radial = 5, segs = null) {
  const curve = new THREE.CatmullRomCurve3(points);
  const n = segs || Math.max(4, points.length * 3);
  const g = new THREE.TubeGeometry(curve, n, r, radial, false);
  const len = curve.getLength();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * Math.PI * 2 * r);
  return g;
}

// Sagging rope between a and b (arrays), sag in metres.
export function ropePoints(a, b, sag, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t),
      a[2] + (b[2] - a[2]) * t,
    ));
  }
  return pts;
}

// ---------------------------------------------------------------------------------------------
// Kit: textures, materials, shared uniforms, builders.
// ---------------------------------------------------------------------------------------------
export function createKit(ctx) {
  const t0 = performance.now();
  const textures = createPropTextures(ctx);
  const texMs = performance.now() - t0;
  const mats = createPropMaterials(ctx, textures);
  const uniforms = { uPropTime: { value: 0 }, uPropWind: { value: 1 } };

  // Cloth sway: per-vertex `sway` attribute (0 at the fixed edge, 1 at the free edge).
  for (const key of ['cloth']) {
    const m = mats[key].material;
    m.userData.lenteraFog = false; // re-patch after adding our hook
    const prevKey = 'lentera-sway-' + key;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uPropTime;\nuniform float uPropWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            float ph = transformed.x * 0.31 + transformed.z * 0.27;
            float w = sway * uPropWind;
            transformed.x += w * (sin(uPropTime * 1.6 + ph) * 0.10 + sin(uPropTime * 4.1 + ph * 2.3) * 0.035);
            transformed.z += w * (cos(uPropTime * 1.25 + ph * 1.3) * 0.09 + sin(uPropTime * 3.7 + ph) * 0.03);
            transformed.y += w * sin(uPropTime * 2.2 + ph) * 0.03;
          }`);
    };
    m.customProgramCacheKey = () => prevKey;
    patchMaterial(m);
    mats[key].extra = { sway: 1 };
  }

  for (const k of ['decal', 'relief', 'cloth']) mats[k].atlas = true;

  const kit = {
    ctx, textures, mats, uniforms, texMs,
    // Register an extra material (e.g. a glow variant that is dimmed separately).
    addMat(key, material, { cast = false, receive = false, atlas = true } = {}) {
      mats[key] = { material: patchMaterial(material), cast, receive, atlas };
      return mats[key].material;
    },
    collision: ctx.collision,
    builder(name) { return new Builder(kit, name); },
    // Clone a material for objects that need their own state (e.g. emissive toggles).
    cloneMat(key, edits = {}) {
      const src = mats[key].material;
      const m = src.clone();
      Object.assign(m, edits);
      m.userData = {};
      return patchMaterial(m);
    },
    update(dt, t) { uniforms.uPropTime.value = t; },
  };
  return kit;
}

export class Builder {
  constructor(kit, name) {
    this.kit = kit;
    this.name = name;
    this.buckets = new Map();
    this.stack = [{ m: new THREE.Matrix4(), yaw: 0 }];
    this.rand = mulberry32(hashString(name));
    this.colliders = [];
  }

  get frame() { return this.stack[this.stack.length - 1]; }

  // Push a local frame (x,y,z,yaw[,pitch,roll]) relative to the current one.
  push(t) {
    const f = this.frame;
    const m = f.m.clone().multiply(makeMatrix(t));
    this.stack.push({ m, yaw: f.yaw + (t.yaw || 0), tilted: f.tilted || !!(t.pitch || t.roll) });
    return this;
  }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  within(t, fn) { this.push(t); try { fn(); } finally { this.pop(); } return this; }

  // Local point -> world Vector3.
  world(x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyMatrix4(this.frame.m); }

  r(a = 0, b = 1) { return a + (b - a) * this.rand(); }

  // Add a geometry (consumed) at transform t with colour options o.
  // o: { color, jitter (0..1 brightness variation), hue, ao: [y0, y1, min], vc: fn(p, n, c), uvOff, sway: fn|number }
  add(matKey, geo, t = {}, o = {}) {
    if (!this.kit.mats[matKey]) throw new Error('unknown material ' + matKey);
    const m = this.frame.m.clone().multiply(makeMatrix(t));
    // Sway weights are computed in local geometry space (before transform).
    let sway = null;
    if (this.kit.mats[matKey].extra?.sway !== undefined) {
      const p = geo.attributes.position;
      sway = new Float32Array(p.count);
      if (typeof o.sway === 'function') for (let i = 0; i < p.count; i++) sway[i] = o.sway(p.getX(i), p.getY(i), p.getZ(i));
      else sway.fill(o.sway ?? 0);
    }
    geo.applyMatrix4(m);
    const pre = geo.attributes.color ? geo.attributes.color : null;
    if (!geo.index) {
      const n = geo.attributes.position.count;
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const count = geo.attributes.position.count;
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    if (o.uvOff !== false && !o.atlas && !this.kit.mats[matKey].atlas) {
      const uv = geo.attributes.uv;
      const du = this.rand() * 7.3, dv = this.rand() * 5.1;
      for (let i = 0; i < count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
    }
    if (sway) geo.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
    // Vertex colours.
    const col = new Float32Array(count * 3);
    if (Array.isArray(o.color)) _c.setRGB(o.color[0], o.color[1], o.color[2]);
    else _c.set(o.color ?? 0xffffff);
    const j = o.jitter ?? 0.08;
    const f = 1 + (this.rand() * 2 - 1) * j;
    const base = [_c.r * f, _c.g * f, _c.b * f];
    if (o.hue) { const h = (this.rand() * 2 - 1) * o.hue; base[0] *= 1 + h; base[2] *= 1 - h; }
    const P = geo.attributes.position, N = geo.attributes.normal;
    const tmp = new THREE.Color();
    for (let i = 0; i < count; i++) {
      let r = base[0], g = base[1], b = base[2];
      if (pre) { r *= pre.getX(i); g *= pre.getY(i); b *= pre.getZ(i); }
      if (o.ao) {
        const [y0, y1, mn] = o.ao;
        const k = mn + (1 - mn) * smoothstep(y0, y1, P.getY(i));
        r *= k; g *= k; b *= k;
      }
      if (o.vc) {
        tmp.setRGB(r, g, b);
        o.vc(P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i), tmp);
        r = tmp.r; g = tmp.g; b = tmp.b;
      }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.clearGroups();
    let list = this.buckets.get(matKey);
    if (!list) this.buckets.set(matKey, (list = []));
    list.push(geo);
    return geo;
  }

  // Box centred at (x, y, z) — or bottom at y0 — of size w (x) h (y) d (z).
  box(mat, o) {
    const y = o.y0 !== undefined ? o.y0 + o.h / 2 : (o.y || 0);
    return this.add(mat, boxGeo(o.w, o.h, o.d, o.grain || null), { x: o.x, y, z: o.z, yaw: o.yaw, pitch: o.pitch, roll: o.roll }, o);
  }

  // Cylinder (axis y) centred at y, or bottom at y0. r / rt (top radius).
  cyl(mat, o) {
    const y = o.y0 !== undefined ? o.y0 + o.h / 2 : (o.y || 0);
    return this.add(mat, cylGeo(o.rt ?? o.r, o.r, o.h, o.seg || 8, !!o.open, o.hseg || 1), { x: o.x, y, z: o.z, yaw: o.yaw, pitch: o.pitch, roll: o.roll }, o);
  }

  // Rod (cylinder) between two local points a, b.
  rod(mat, a, b, r, o = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const dir = B.clone().sub(A);
    const len = dir.length();
    const g = cylGeo(o.rt ?? r, r, len, o.seg || 6, !!o.open);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    g.applyQuaternion(q);
    g.translate(A.x, A.y, A.z);
    return this.add(mat, g, {}, o);
  }

  // Square beam (w x h cross-section) between two local points; `up` hint keeps it level.
  bar(mat, a, b, w, h, o = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const dir = B.clone().sub(A);
    const len = dir.length();
    const g = boxGeo(w, h, len, 'z');
    g.translate(0, 0, len / 2);
    const m = new THREE.Matrix4();
    const zAxis = dir.clone().normalize();
    let xAxis = new THREE.Vector3().crossVectors(o.up ? new THREE.Vector3(...o.up) : UP, zAxis);
    if (xAxis.lengthSq() < 1e-6) xAxis.set(1, 0, 0);
    xAxis.normalize();
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
    m.makeBasis(xAxis, yAxis, zAxis);
    m.setPosition(A);
    g.applyMatrix4(m);
    return this.add(mat, g, {}, o);
  }

  rope(mat, a, b, sag, r = 0.025, o = {}) {
    return this.add(mat, tubeGeo(ropePoints(a, b, sag, o.n || 8), r, o.radial || 4), {}, o);
  }

  rock(mat, o) {
    const g = rockGeo(o.r || 1, o.seed ?? Math.floor(this.rand() * 1e6), o.detail ?? 1, o.squash ?? 0.7, o.rough ?? 0.28);
    return this.add(mat, g, { x: o.x, y: o.y, z: o.z, yaw: o.yaw ?? this.rand() * 6.28, pitch: o.pitch, roll: o.roll, sx: o.sx, sy: o.sy, sz: o.sz }, o);
  }

  // ---- Colliders (frames must be yaw-only). Local (x, y=bottom, z). ----
  collBox(o) {
    const p = this.world(o.x || 0, o.y || 0, o.z || 0);
    const c = this.kit.collision.addBox({ ...o, x: p.x, y: p.y, z: p.z, yaw: this.frame.yaw + (o.yaw || 0) });
    this.colliders.push(c);
    return c;
  }
  collCyl(o) {
    const p = this.world(o.x || 0, o.y || 0, o.z || 0);
    const c = this.kit.collision.addCylinder({ ...o, x: p.x, y: p.y, z: p.z });
    this.colliders.push(c);
    return c;
  }
  // Stair as stepped walkable boxes. Local: starts at (x, z0) at height y0 and climbs toward
  // -z (local) to height y1 over `run` metres; width w. Each step rises <= maxRise.
  collStairs({ x = 0, z0, y0, y1, run, w, maxRise = 0.4, base = null, surface = 'wood', tag = '', dir = -1 }) {
    const n = Math.max(1, Math.ceil((y1 - y0) / maxRise - 1e-6));
    const rise = (y1 - y0) / n;
    const tread = run / n;
    const out = [];
    for (let i = 0; i < n; i++) {
      const top = y0 + rise * (i + 1);
      const zc = z0 + dir * tread * (i + 0.5);
      const bottom = base ?? (y0 - 0.5);
      out.push(this.collBox({ x, y: bottom, z: zc, w, h: top - bottom, d: tread + 0.02, surface, tag }));
    }
    return out;
  }

  // Merge buckets -> THREE.Group. Pass `parent` to attach.
  build(parent) {
    const group = new THREE.Group();
    group.name = this.name;
    for (const [key, list] of this.buckets) {
      if (!list.length) continue;
      const entry = this.kit.mats[key];
      const extra = entry.extra ? Object.keys(entry.extra) : [];
      for (const g of list) for (const a of extra) {
        if (!g.attributes[a]) g.setAttribute(a, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
      }
      const merged = mergeGeometries(list, false);
      if (!merged) { console.warn('[structures] merge failed', this.name, key); continue; }
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, entry.material);
      mesh.name = this.name + ':' + key;
      mesh.castShadow = entry.cast;
      mesh.receiveShadow = entry.receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      for (const g of list) g.dispose();
    }
    this.buckets.clear();
    if (parent) parent.add(group);
    return group;
  }
}
