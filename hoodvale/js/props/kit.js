// Shared toolkit for every prop module (structures, buildings, object views, ground items).
// Owner: props builder.
//
// - One hand-painted atlas (atlas.js) + one Lambert material family patched for: atlas cells that
//   tile (fract + textureGrad), per-vertex glow (windows/lamps glow at night, crystals always),
//   per-vertex sway (banners, foliage, crops), roof fading (alphaHash).
// - Builder: accumulates primitives into one merged, non-indexed geometry with box-projected UVs,
//   vertex colours (jitter + painterly noise + ground darkening), glow and sway attributes.
// - Pool: InstancedMesh slots with show/hide and growth (trees, rocks, crops...).

import * as THREE from 'three';
import { paintAtlas, paintSign, ATLAS_SIZE, SIGN_Y0, TILE } from './atlas.js';

export { TILE };

// Default metres per texture repeat for box-projected tiles.
const TILE_SCALE = {
  [TILE.FLAT]: 2, [TILE.PLANKS]: 2, [TILE.PLASTER]: 3, [TILE.STONE]: 2.2, [TILE.FLAGSTONE]: 2.6,
  [TILE.THATCH]: 1.7, [TILE.SHINGLES]: 1.5, [TILE.SLATE]: 1.3, [TILE.CLAY]: 1.7, [TILE.BARK]: 1.3,
  [TILE.LEAVES]: 1.5, [TILE.RUBBLE]: 2.4, [TILE.COBBLE]: 2.2, [TILE.CANVAS]: 2.2, [TILE.STRIPES]: 1.2,
  [TILE.ROCK]: 2.6, [TILE.METAL]: 1.2, [TILE.MARBLE]: 2.6, [TILE.CRYSTAL]: 1.6, [TILE.HAY]: 1.2,
  [TILE.BRICK]: 1.1, [TILE.TURF]: 1.6, [TILE.PAVING]: 2.6, [TILE.SACK]: 1, [TILE.NET]: 1.2,
  [TILE.BOOKS]: 1.4, [TILE.BOTTLES]: 1.4, [TILE.CARPET]: 1.6, [TILE.IVY]: 1.6,
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const _c = new THREE.Color();
// Any colour spec -> linear [r, g, b].
export function lin(c) {
  if (Array.isArray(c)) return c;
  if (c instanceof THREE.Color) return [c.r, c.g, c.b];
  _c.set(c ?? 0xffffff);
  return [_c.r, _c.g, _c.b];
}
// sRGB hex helpers for mixing in sRGB space.
export function mix(a, b, t) {
  const A = new THREE.Color(a), B = new THREE.Color(b);
  return A.lerp(B, t);
}

// ---------------------------------------------------------------------------------------------
// Shared uniforms + material family
// ---------------------------------------------------------------------------------------------
const U = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uGlowK: { value: 2.2 },
  uWind: { value: 1 },
};

function patchShader(sh) {
  sh.uniforms.uTime = U.uTime;
  sh.uniforms.uNight = U.uNight;
  sh.uniforms.uGlowK = U.uGlowK;
  sh.uniforms.uWind = U.uWind;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
attribute vec2 aMisc;
attribute vec4 aGlow;
varying float vTile;
varying vec4 vGlow;
uniform float uTime;
uniform float uWind;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
vTile = aMisc.x;
vGlow = aGlow;
if (aMisc.y > 0.0005) {
  vec3 hvO = modelMatrix[3].xyz;
  #ifdef USE_INSTANCING
  hvO += (modelMatrix * vec4(instanceMatrix[3].xyz, 0.0)).xyz;
  #endif
  float hvPh = hvO.x * 0.37 + hvO.z * 0.23 + (transformed.x + transformed.z) * 0.35;
  float hvS = aMisc.y * uWind;
  transformed.x += hvS * (sin(uTime * 1.4 + hvPh) * 0.75 + sin(uTime * 3.1 + hvPh * 1.9) * 0.25);
  transformed.z += hvS * 0.6 * cos(uTime * 1.1 + hvPh * 1.3);
}`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
varying float vTile;
varying vec4 vGlow;
uniform float uNight;
uniform float uGlowK;`)
    .replace('#include <map_fragment>', `
vec4 hvTex = vec4(1.0);
#ifdef USE_MAP
{
  vec2 hvDx = dFdx(vMapUv);
  vec2 hvDy = dFdy(vMapUv);
  if (vTile < -0.5) {
    hvTex = textureGrad(map, vMapUv, hvDx, hvDy);
  } else {
    float hvT = floor(vTile + 0.5);
    float hvRow = floor((hvT + 0.5) / 8.0);
    vec2 hvCell = vec2(hvT - hvRow * 8.0, hvRow);
    const float hvK = ${(240 / ATLAS_SIZE).toFixed(8)};
    vec2 hvUv = (hvCell * 256.0 + 8.0) / ${ATLAS_SIZE.toFixed(1)} + fract(vMapUv) * hvK;
    hvTex = textureGrad(map, hvUv, hvDx * hvK, hvDy * hvK);
  }
  diffuseColor *= hvTex;
}
#endif`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float hvMode = vGlow.a;
  float hvGk = hvMode < 0.25 ? uNight : 1.0;
  vec3 hvE = vGlow.rgb * hvGk * uGlowK * hvTex.rgb;
  if (hvMode > 0.75) hvE *= vColor.rgb * 1.6;
  totalEmissiveRadiance += hvE;
}`);
}

function makePropMaterial(atlas, { fade = false, side = THREE.FrontSide, cutout = false, name = 'prop' } = {}) {
  const m = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, side });
  m.name = name;
  if (fade) m.alphaHash = true;
  if (cutout) m.alphaTest = 0.5;
  m.onBeforeCompile = patchShader;
  m.customProgramCacheKey = () => 'hvprop2';
  return m;
}

// ---------------------------------------------------------------------------------------------
// Builder: merged geometry accumulator
// ---------------------------------------------------------------------------------------------
const _m3 = new THREE.Matrix3();
const _mI = new THREE.Matrix4();

// Box faces: [normal, 4 corners as sign triplets (CCW from outside), u axis, v axis]
const BOX_FACES = [
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];
const OWN_UV = [[0, 1], [1, 1], [1, 0], [0, 0]];

// Box projection of a local point for a face normal (u right, v down as seen from outside).
function project(nx, ny, nz, x, y, z) {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  if (ay >= ax && ay >= az) return ny >= 0 ? [x, z] : [x, -z];
  if (ax >= az) return nx >= 0 ? [-z, -y] : [z, -y];
  return nz >= 0 ? [x, -y] : [-x, -y];
}

function vnoise(x, y, z) {
  return Math.sin(x * 1.31 + z * 0.73) * Math.sin(z * 1.17 - y * 0.91 + x * 0.27) * 0.6
    + Math.sin(x * 3.7 + y * 2.9 - z * 3.1) * 0.4;
}

export class Builder {
  constructor(seed = 1) {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.misc = []; this.glow = [];
    this.rng = mulberry32(seed);
  }
  get vertexCount() { return this.pos.length / 3; }

  // Resolve per-call options into a compact state.
  _opts(o) {
    const tile = o.tile ?? TILE.FLAT;
    const jit = o.jit ?? 0.05;
    const base = lin(o.color ?? 0xffffff);
    const j = 1 + (this.rng() - 0.5) * 2 * jit;
    const glow = o.glow != null ? lin(o.glow) : null;
    const k = o.glowK ?? 1;
    return {
      tile: o.rect ? -1 : tile,
      rect: o.rect || null,
      mode: o.rect ? 'rect' : (o.uv || 'box'),
      scale: o.uvScale ?? TILE_SCALE[tile] ?? 1,
      off: o.uvOff || (o.rect || o.uv === 'own' || o.world ? [0, 0] : [this.rng() * 7, this.rng() * 7]),
      world: !!o.world,
      rot: !!o.uvRot,
      flipV: !!o.flipV,
      flat: o.flat ?? false,
      r: base[0] * j, g: base[1] * j, b: base[2] * j,
      vn: o.vnoise ?? 0.05,
      ao: o.ao || null,
      glow: glow ? [Math.min(1, glow[0] * k), Math.min(1, glow[1] * k), Math.min(1, glow[2] * k), o.glowMode === 'always' ? 0.5 : o.glowMode === 'tinted' ? 1 : 0] : null,
      sway: o.sway ?? 0,
      grad: o.grad || null, // [yLocal0, yLocal1, k0, k1] vertical colour gradient in local space
    };
  }

  _vert(S, e, nm, lx, ly, lz, nx, ny, nz, u, v) {
    // transform
    let x = lx, y = ly, z = lz;
    if (e) {
      x = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
      y = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
      z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
      const tx = nm[0] * nx + nm[3] * ny + nm[6] * nz;
      const ty = nm[1] * nx + nm[4] * ny + nm[7] * nz;
      const tz = nm[2] * nx + nm[5] * ny + nm[8] * nz;
      const l = Math.hypot(tx, ty, tz) || 1;
      nx = tx / l; ny = ty / l; nz = tz / l;
    }
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    let k = 1 + S.vn * vnoise(x, y, z);
    if (S.ao) {
      const [y0, y1, k0] = S.ao;
      const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
      k *= k0 + (1 - k0) * t * t * (3 - 2 * t);
    }
    if (S.grad) {
      const [g0, g1, k0, k1] = S.grad;
      const t = Math.min(1, Math.max(0, (ly - g0) / (g1 - g0)));
      k *= k0 + (k1 - k0) * t;
    }
    this.col.push(S.r * k, S.g * k, S.b * k);
    const sw = typeof S.sway === 'function' ? S.sway(x, y, z) : S.sway;
    this.misc.push(S.tile, sw);
    if (S.glow) this.glow.push(S.glow[0], S.glow[1], S.glow[2], S.glow[3]);
    else this.glow.push(0, 0, 0, 0);
  }

  _uv(S, lx, ly, lz, fnx, fny, fnz, ou, ov) {
    let u, v;
    if (S.mode === 'box') {
      const p = project(fnx, fny, fnz, lx, ly, lz);
      u = p[0] / S.scale + S.off[0]; v = p[1] / S.scale + S.off[1];
    } else if (S.mode === 'rect') {
      const [u0, v0, u1, v1] = S.rect;
      u = u0 + (u1 - u0) * ou; v = v0 + (v1 - v0) * ov;
      return [u, v];
    } else {
      const s = Array.isArray(S.scale) ? S.scale : [S.scale, S.scale];
      u = ou * s[0] + S.off[0]; v = ov * s[1] + S.off[1];
    }
    if (S.flipV) v = -v;
    return S.rot ? [v, u] : [u, v];
  }

  // Axis box centred at the local origin, transformed by matrix m (Matrix4 or null).
  box(w, h, d, m, o = {}) {
    const S = this._opts(o);
    const e = m ? m.elements : null;
    const nm = m ? _m3.getNormalMatrix(m).elements : null;
    const hx = w / 2, hy = h / 2, hz = d / 2;
    // world-aligned projection (translation-only matrices): offset local coords by the centre
    const wx = S.world && e ? e[12] : 0, wy = S.world && e ? e[13] : 0, wz = S.world && e ? e[14] : 0;
    const skip = o.skip || null; // e.g. { py: true } to drop faces: px nx py ny pz nz
    const names = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
    for (let f = 0; f < 6; f++) {
      if (skip && skip[names[f]]) continue;
      const F = BOX_FACES[f];
      const [nx, ny, nz] = F.n;
      const q = F.c.map(([sx, sy, sz]) => [sx * hx, sy * hy, sz * hz]);
      const uvs = q.map((p, i) => this._uv(S, p[0] + wx, p[1] + wy, p[2] + wz, nx, ny, nz, OWN_UV[i][0], OWN_UV[i][1]));
      for (const i of [0, 1, 2, 0, 2, 3]) this._vert(S, e, nm, q[i][0], q[i][1], q[i][2], nx, ny, nz, uvs[i][0], uvs[i][1]);
    }
    return this;
  }

  // World-space axis-aligned box from min/max corners.
  boxAt(x0, y0, z0, x1, y1, z1, o) {
    _mI.makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), _mI, o);
  }

  // A beam of square section t between two world points.
  beam(ax, ay, az, bx, by, bz, t, o, t2 = t) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return this;
    const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, new THREE.Vector3(1, 1, 1));
    return this.box(t, len, t2, m, o);
  }

  // Append any THREE.BufferGeometry (local space) transformed by m.
  geo(g, m, o = {}) {
    const S = this._opts(o);
    const e = m ? m.elements : null;
    const nm = m ? _m3.getNormalMatrix(m).elements : null;
    const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
    const idx = g.index;
    const n = idx ? idx.count : P.count;
    const get = (i) => (idx ? idx.getX(i) : i);
    for (let t = 0; t < n; t += 3) {
      const i0 = get(t), i1 = get(t + 1), i2 = get(t + 2);
      const ax = P.getX(i0), ay = P.getY(i0), az = P.getZ(i0);
      const bx = P.getX(i1), by = P.getY(i1), bz = P.getZ(i1);
      const cx = P.getX(i2), cy = P.getY(i2), cz = P.getZ(i2);
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      let fnx = uy * vz - uz * vy, fny = uz * vx - ux * vz, fnz = ux * vy - uy * vx;
      const fl = Math.hypot(fnx, fny, fnz);
      if (fl < 1e-9) continue;
      fnx /= fl; fny /= fl; fnz /= fl;
      for (const i of [i0, i1, i2]) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const [u, v] = this._uv(S, x, y, z, fnx, fny, fnz, UV ? UV.getX(i) : 0, UV ? UV.getY(i) : 0);
        let nx = fnx, ny = fny, nz = fnz;
        if (!S.flat && N) { nx = N.getX(i); ny = N.getY(i); nz = N.getZ(i); }
        this._vert(S, e, nm, x, y, z, nx, ny, nz, u, v);
      }
    }
    return this;
  }

  // Planar polygon (3 or 4 world points, CCW from the visible side) with UVs projected on the
  // polygon's own plane: u along `uAxis` (world vector), v down-slope. Optional thickness.
  face(points, o = {}, uAxis = null) {
    const S = this._opts(o);
    const [p0, p1, p2] = points;
    const a = new THREE.Vector3().subVectors(p1, p0), b = new THREE.Vector3().subVectors(p2, p0);
    const n = new THREE.Vector3().crossVectors(a, b).normalize();
    const ua = (uAxis ? uAxis.clone() : a.clone()).normalize();
    const va = new THREE.Vector3().crossVectors(n, ua).normalize().negate();
    const uvOf = (p) => {
      if (S.mode === 'rect' || S.mode === 'own') return null;
      const d = new THREE.Vector3().subVectors(p, p0);
      let u = d.dot(ua) / S.scale + S.off[0], v = d.dot(va) / S.scale + S.off[1];
      if (S.flipV) v = -v;
      return S.rot ? [v, u] : [u, v];
    };
    const tris = points.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
    const own = points.length === 4 ? OWN_UV : [[0, 1], [1, 1], [0.5, 0]];
    for (const i of tris) {
      const p = points[i];
      let uv = uvOf(p);
      if (!uv) uv = this._uv(S, 0, 0, 0, n.x, n.y, n.z, own[i][0], own[i][1]);
      this._vert(S, null, null, p.x, p.y, p.z, n.x, n.y, n.z, uv[0], uv[1]);
    }
    return this;
  }

  merge(other) {
    this.pos.push(...other.pos); this.nor.push(...other.nor); this.uv.push(...other.uv);
    this.col.push(...other.col); this.misc.push(...other.misc); this.glow.push(...other.glow);
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    const nV = this.pos.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const col = new Uint8Array(nV * 3);
    for (let i = 0; i < col.length; i++) col[i] = Math.max(0, Math.min(255, Math.round(this.col[i] * 255)));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    g.setAttribute('aMisc', new THREE.Float32BufferAttribute(this.misc, 2));
    const gl = new Uint8Array(nV * 4);
    for (let i = 0; i < gl.length; i++) gl[i] = Math.max(0, Math.min(255, Math.round(this.glow[i] * 255)));
    g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 4, true));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
  isEmpty() { return this.pos.length === 0; }
}

// Matrix helper: translate, then rotate (yaw, pitch, roll), then scale.
const _q = new THREE.Quaternion(), _eu = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function M(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _eu.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_eu);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// ---------------------------------------------------------------------------------------------
// Instance pools
// ---------------------------------------------------------------------------------------------
const _mat4 = new THREE.Matrix4();
export class Pool {
  constructor(parent, geometry, material, { capacity = 32, castShadow = true, receiveShadow = true, name = 'pool', colors = true } = {}) {
    this.parent = parent; this.geometry = geometry; this.material = material;
    this.opts = { castShadow, receiveShadow, name, colors };
    this.cap = 0; this.used = 0; this.free = [];
    this.mats = []; // per-slot Matrix4 (visible transform)
    this.hidden = [];
    this.dirty = true;
    this.mesh = null;
    this._grow(capacity);
  }
  _grow(cap) {
    const old = this.mesh;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, cap);
    mesh.name = this.opts.name;
    mesh.castShadow = this.opts.castShadow;
    mesh.receiveShadow = this.opts.receiveShadow;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.opts.colors) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    }
    if (old) {
      mesh.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, this.cap * 16));
      if (old.instanceColor && mesh.instanceColor) mesh.instanceColor.array.set(old.instanceColor.array.subarray(0, this.cap * 3));
      this.parent.remove(old);
      old.dispose();
    }
    mesh.count = this.used;
    this.parent.add(mesh);
    this.mesh = mesh;
    this.cap = cap;
  }
  add(matrix, color = null) {
    let slot;
    if (this.free.length) slot = this.free.pop();
    else {
      if (this.used >= this.cap) this._grow(this.cap * 2);
      slot = this.used++;
      this.mesh.count = this.used;
    }
    this.mats[slot] = matrix.clone();
    this.hidden[slot] = false;
    this.mesh.setMatrixAt(slot, matrix);
    if (color && this.mesh.instanceColor) this.setColor(slot, color);
    else if (this.mesh.instanceColor) this.mesh.instanceColor.setXYZ(slot, 1, 1, 1), (this.mesh.instanceColor.needsUpdate = true);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = true;
    return slot;
  }
  setMatrix(slot, matrix) {
    this.mats[slot].copy(matrix);
    if (!this.hidden[slot]) { this.mesh.setMatrixAt(slot, matrix); this.mesh.instanceMatrix.needsUpdate = true; this.dirty = true; }
  }
  setColor(slot, c) {
    const [r, g, b] = lin(c);
    this.mesh.instanceColor.setXYZ(slot, r, g, b);
    this.mesh.instanceColor.needsUpdate = true;
  }
  setVisible(slot, v) {
    if (this.hidden[slot] === !v) return;
    this.hidden[slot] = !v;
    const m = this.mats[slot];
    if (v) this.mesh.setMatrixAt(slot, m);
    else {
      _mat4.makeScale(0, 0, 0);
      _mat4.elements[12] = m.elements[12]; _mat4.elements[13] = m.elements[13]; _mat4.elements[14] = m.elements[14];
      this.mesh.setMatrixAt(slot, _mat4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = true;
  }
  remove(slot) {
    this.setVisible(slot, false);
    this.free.push(slot);
  }
  refresh() {
    if (!this.dirty) return;
    this.dirty = false;
    this.mesh.computeBoundingSphere();
  }
}

// ---------------------------------------------------------------------------------------------
// Kit singleton
// ---------------------------------------------------------------------------------------------
let KIT = null;

export function nightFactor(hour) {
  const h = ((hour % 24) + 24) % 24;
  const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  if (h >= 12) return ss(17.6, 19.8, h);
  return 1 - ss(4.8, 6.9, h);
}

export function getKit(ctx) {
  if (KIT) return KIT;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS_SIZE;
  paintAtlas(canvas);
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.flipY = false;
  atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
  atlas.magFilter = THREE.LinearFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.generateMipmaps = true;
  try { atlas.anisotropy = Math.min(8, ctx.renderer?.capabilities?.getMaxAnisotropy?.() || 1); } catch { /* ignore */ }

  const pools = new Set();
  const signs = []; // { text, style, rect px }
  const g2d = canvas.getContext('2d');
  let bigUsed = 0, smallUsed = 0;
  const BIG_W = 512, BIG_H = 128, SMALL_W = 256, SMALL_H = 64;
  const BIG_ROWS = 5; // 1280..1920
  let lastFrame = -1;

  KIT = {
    THREE, U, TILE, atlas, canvas,
    mat: makePropMaterial(atlas, { name: 'prop' }),
    matDS: makePropMaterial(atlas, { side: THREE.DoubleSide, name: 'prop-ds' }),
    matCut: makePropMaterial(atlas, { side: THREE.DoubleSide, cutout: true, name: 'prop-cut' }),
    fadeMaterial(name = 'prop-fade') { return makePropMaterial(atlas, { fade: true, name }); },
    Builder, Pool, M, lin, mulberry32, hashStr,
    night: 0,
    pools,
    makePool(parent, geometry, material, opts) {
      const p = new Pool(parent, geometry, material, opts);
      pools.add(p);
      return p;
    },
    // Allocate + paint a signboard; returns atlas UV rect [u0, v0, u1, v1].
    sign(text, style = {}, small = false) {
      let x, y, w, h;
      if (!small && bigUsed < BIG_ROWS * 4) {
        x = (bigUsed % 4) * BIG_W; y = SIGN_Y0 + Math.floor(bigUsed / 4) * BIG_H; w = BIG_W; h = BIG_H; bigUsed++;
      } else if (smallUsed < 16) {
        x = (smallUsed % 8) * SMALL_W; y = SIGN_Y0 + BIG_ROWS * BIG_H + Math.floor(smallUsed / 8) * SMALL_H; w = SMALL_W; h = SMALL_H; smallUsed++;
      } else {
        return [0.0, (SIGN_Y0 + 2) / ATLAS_SIZE, 0.25, (SIGN_Y0 + BIG_H - 2) / ATLAS_SIZE];
      }
      paintSign(g2d, x, y, w, h, text, style);
      signs.push({ text, style, x, y, w, h });
      atlas.needsUpdate = true;
      const i = 1.5; // inset to avoid bleeding
      return [(x + i) / ATLAS_SIZE, (y + i) / ATLAS_SIZE, (x + w - i) / ATLAS_SIZE, (y + h - i) / ATLAS_SIZE];
    },
    // Per-frame uniforms (called by every prop module; runs once per frame).
    tick(c) {
      if (c.time.frame === lastFrame) return;
      lastFrame = c.time.frame;
      U.uTime.value = c.time.t;
      const hour = c.sky?.hour ?? 12;
      KIT.night = nightFactor(hour);
      U.uNight.value = KIT.night;
      for (const p of pools) p.refresh();
    },
  };
  // Repaint signs once the display fonts are available.
  try {
    document.fonts?.ready?.then(() => {
      setTimeout(() => {
        for (const s of signs) paintSign(g2d, s.x, s.y, s.w, s.h, s.text, s.style);
        if (signs.length) atlas.needsUpdate = true;
      }, 50);
    });
  } catch { /* ignore */ }
  return KIT;
}
