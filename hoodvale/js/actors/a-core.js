// Shared plumbing for every actor: maths helpers, the single actor material (vertex colours +
// per-vertex shine / glow), the geometry Builder that merges primitives into one skinned (or
// static) geometry, bone creation, pose buffers and a ref-counted geometry cache.
// Owner: actors builder.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceTexture } from './a-face.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smooth01 = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const pos = (v) => (v > 0 ? v : 0);
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
// Envelope for one-shots: rises over [0, a], holds, falls over [d - b, d].
export const env = (t, d, a = 0.12, b = 0.2) => Math.min(smooth01(0, a, t), 1 - smooth01(d - b, d, t));
// 0..1 progress through [a, b] with smooth ends.
export const seg = (t, a, b) => smooth01(a, b, t);

export function rng(seed) {
  let a = (seed >>> 0) || 1;
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

// ---------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------
export function C(c, fallback = '#888888') {
  if (c instanceof THREE.Color) return c.clone();
  if (c === undefined || c === null || c === '' || c === true) return new THREE.Color(fallback);
  try { return new THREE.Color(c); } catch { return new THREE.Color(fallback); }
}
export const shade = (c, k) => C(c).multiplyScalar(k);
export const mix = (a, b, t) => C(a).lerp(C(b), t);
export const hexOf = (c) => '#' + C(c).getHexString();

// ---------------------------------------------------------------------------------------------
// Material: one MeshStandardMaterial for all actors. Per-vertex attribute aMat = (shine, glow):
// shine lowers roughness / adds a little metalness (armour, blades, slick hair); glow makes the
// vertex colour emissive (eyes, cores, staff tips) so bloom picks it up. A cool rim keeps the
// silhouettes readable against grass and at dusk.
// ---------------------------------------------------------------------------------------------
export const SHARED = {
  rim: { value: new THREE.Color(0.1, 0.11, 0.17) },
  glow: { value: 2.4 },
  time: { value: 0 },
  // Painted decals (faces) in a premultiplied RGBA atlas; geometry without decals samples a
  // transparent texel at uv (0, 0). Set by a-face.js.
  decal: { value: null },
};

// map: textured actors (generated models) use the texture instead of vertex colours.
export function makeActorMaterial({ key = 'base', emissive = 0x000000, emissiveIntensity = 1, transparent = false, opacity = 1, side = THREE.FrontSide, map = null } = {}) {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: !map, map, roughness: map ? 0.86 : 0.8, metalness: 0, emissive, emissiveIntensity, transparent, opacity, side,
  });
  if (transparent) m.depthWrite = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uActorRim = SHARED.rim;
    shader.uniforms.uActorGlow = SHARED.glow;
    shader.uniforms.uActorDecal = SHARED.decal;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aMat;\nattribute vec2 aUv;\nvarying vec2 vActorMat;\nvarying vec2 vActorUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvActorMat = aMat;\nvActorUv = aUv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vActorMat;\nvarying vec2 vActorUv;\nuniform vec3 uActorRim;\nuniform float uActorGlow;\nuniform sampler2D uActorDecal;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec4 dcl = texture2D(uActorDecal, vActorUv);
        diffuseColor.rgb = diffuseColor.rgb * (1.0 - dcl.a) + dcl.rgb;
      }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, vActorMat.x);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.45, vActorMat.x);')
      // Wrapped diffuse only (specular keeps the true N.L so silhouettes don't sparkle).
      .replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
        'reflectedLight.directDiffuse += saturate( ( dot( geometryNormal, directLight.direction ) + 0.35 ) / 1.35 ) * directLight.color * BRDF_Lambert( material.diffuseColor );'))
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += uActorRim * pow(rimF, 2.6) + diffuseColor.rgb * vActorMat.y * uActorGlow;
      }`);
  };
  m.customProgramCacheKey = () => 'hvActor_' + key;
  return m;
}

let MATS = null;
export function materials() {
  if (MATS) return MATS;
  SHARED.decal.value = faceTexture();
  MATS = {
    body: makeActorMaterial({ key: 'body' }),
    flash: makeActorMaterial({ key: 'flash', emissive: 0xff2a1a, emissiveIntensity: 0.55 }),
    // Translucent crystal for the Oracle and wisps (double-sided, additive feel without additive).
    crystal: makeActorMaterial({ key: 'crystal', transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
  };
  MATS.crystal.depthWrite = false;
  return MATS;
}
// Ink outline (inverted hull): back faces pushed out along the skinned normal by a constant
// screen width (uActorOutline = world units per unit of view depth, set per frame).
SHARED.outline = { value: 0.002 };
let OUTLINE = null;
export function outlineMaterial() {
  if (OUTLINE) return OUTLINE;
  OUTLINE = new THREE.MeshBasicMaterial({ color: 0x1c130d, side: THREE.BackSide });
  OUTLINE.onBeforeCompile = (shader) => {
    shader.uniforms.uActorOutline = SHARED.outline;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uActorOutline;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      #ifdef USE_SKINNING
        // objectNormal is the skinned normal (transformedNormal is flipped for BackSide).
        mvPosition.xyz += normalize(normalMatrix * objectNormal) * uActorOutline * clamp(-mvPosition.z, 1.5, 60.0);
        gl_Position = projectionMatrix * mvPosition;
      #endif`);
  };
  OUTLINE.customProgramCacheKey = () => 'hvActorOutline';
  return OUTLINE;
}

export function fadeMaterial() {
  return makeActorMaterial({ key: 'fade', transparent: true, opacity: 1 });
}

// ---------------------------------------------------------------------------------------------
// Bones
// ---------------------------------------------------------------------------------------------
// defs: [[name, parentIndex, x, y, z], ...] (offsets relative to the parent).
export function makeBones(defs) {
  const bones = [];
  for (let i = 0; i < defs.length; i++) {
    const [name, parent, x, y, z] = defs[i];
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    bones.push(b);
    if (parent >= 0) bones[parent].add(b);
  }
  bones[0].updateMatrixWorld(true);
  return bones;
}
export function boneIndex(defs) {
  const o = {};
  defs.forEach((d, i) => { o[d[0]] = i; });
  return o;
}

// Pose = rotation (x, y, z) per bone + offset of bone 1 (x, y, z) + scale delta of bone 1 (x, y, z).
export const poseLen = (n) => n * 3 + 6;
export const newPose = (n) => new Float32Array(poseLen(n));

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------
const V2 = (x, y) => new THREE.Vector2(Math.max(1e-4, x), y);

// Capsule from the joint (y = 0, radius r1) down to y = -len (radius r2).
export function taper(r1, r2, len, seg = 8, cap = 3) {
  const pts = [];
  for (let i = 0; i <= cap; i++) {
    const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2);
    pts.push(V2(r2 * Math.cos(a), -len + r2 * Math.sin(a)));
  }
  for (let i = 0; i <= cap; i++) {
    const a = (i / cap) * (Math.PI / 2);
    pts.push(V2(r1 * Math.cos(a), r1 * Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, seg);
}
// Lathe from [[r, y], ...] (bottom to top).
export function lathe(profile, seg = 12, phiStart = 0, phiLength = TAU) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => V2(r, y)), seg, phiStart, phiLength);
}
export const sphere = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
export const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
export const cyl = (rt, rb, h, s = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
export const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
export const torus = (r, t, rs = 6, ts = 14, arc = TAU) => new THREE.TorusGeometry(r, t, rs, ts, arc);
// Thin extruded 2D shape (points [[x, y], ...]) centred on z, depth d.
export function extrude(points, depth, bevel = 0) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
// Tube along points [[x,y,z],...] with radius r (or r(t)).
export function tube(points, r, seg = 12, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, typeof r === 'number' ? r : 1, radial, false);
  if (typeof r === 'function') {
    // Scale each ring by r(t) around the curve point.
    const p = g.attributes.position;
    const per = radial + 1;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const c = curve.getPointAt(t);
      const k = r(t);
      for (let j = 0; j < per; j++) {
        const idx = i * per + j;
        p.setXYZ(idx, c.x + (p.getX(idx) - c.x) * k, c.y + (p.getY(idx) - c.y) * k, c.z + (p.getZ(idx) - c.z) * k);
      }
    }
  }
  return g;
}
// Deform: per-vertex function (x, y, z) -> [x, y, z].
export function deform(g, fn) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const r = fn(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, r[0], r[1], r[2]);
  }
  return g;
}
// Random lumpy rock (flat shaded later), radius r.
export function rock(r, seed = 1, detail = 0, jag = 0.22) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const R = rng(seed);
  const p = g.attributes.position;
  // Displace shared positions consistently (non-indexed: same position -> same displacement).
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
    let s = seen.get(k);
    if (s === undefined) { s = 1 + (R() - 0.5) * 2 * jag; seen.set(k, s); }
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Builder: author primitives in bone-local space, merge into one geometry with position, normal,
// color, aMat and (when bones are given) skinIndex / skinWeight.
// ---------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();

export class Builder {
  // bones: array of THREE.Bone in bind pose (matrixWorld up to date) or null for static geometry.
  constructor(bones = null, { aoTop = 1.5, aoBottom = 0.05, aoMin = 0.8 } = {}) {
    this.bones = bones;
    this.geos = [];
    this.ao = { top: aoTop, bottom: aoBottom, min: aoMin };
  }

  // o: { at, rot, scale, quat, weights(x,y,z)->[[bone,w],..], colorFn(x,y,z,base)->Color,
  //      flat, shade, ao (default true), shine (0..1), glow (0..1), matrix (extra Matrix4) }
  add(geo, bone, color, o = {}) {
    let g = geo;
    if (o.uvFn) {
      // Decal UVs from the primitive's own (pre-transform) coordinates.
      const p0 = g.attributes.position, uv = new Float32Array(p0.count * 2);
      for (let i = 0; i < p0.count; i++) { const r = o.uvFn(p0.getX(i), p0.getY(i), p0.getZ(i)); uv[i * 2] = r[0]; uv[i * 2 + 1] = r[1]; }
      g.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
    }
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    if (g.attributes.color && !o.keepColor) g.deleteAttribute('color');
    if (o.at || o.rot || o.scale !== undefined || o.quat) {
      const s = o.scale === undefined ? [1, 1, 1] : typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : o.scale;
      if (o.quat) _q.copy(o.quat);
      else { _e.set(...(o.rot || [0, 0, 0])); _q.setFromEuler(_e); }
      _m.compose(_v.set(...(o.at || [0, 0, 0])), _q, _s.set(s[0], s[1], s[2]));
      g.applyMatrix4(_m);
    }
    if (o.matrix) g.applyMatrix4(o.matrix);
    if (this.bones && bone !== null && bone !== undefined) g.applyMatrix4(this.bones[bone].matrixWorld);
    if (o.flat) {
      if (g.index) g = g.toNonIndexed();
      g.deleteAttribute('normal');
      g.computeVertexNormals();
      const n = g.attributes.position.count;
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    } else if (o.keepNormals && g.attributes.normal) {
      // Normals supplied by the caller (patches cut from one smooth surface stay seamless).
    } else {
      if (g.attributes.normal) g.deleteAttribute('normal');
      g = mergeVertices(g, 1e-5);
      g.computeVertexNormals();
    }
    if (!g.attributes.aUv) g.setAttribute('aUv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const pos = g.attributes.position;
    const n = pos.count;
    const base = C(color);
    const pre = o.keepColor && g.attributes.color ? g.attributes.color : null;
    const col = new Float32Array(n * 3);
    const shadeK = o.shade ?? 1;
    const ao = o.ao !== false;
    const A = this.ao;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (pre) _c.setRGB(pre.getX(i), pre.getY(i), pre.getZ(i));
      else if (o.colorFn) _c.copy(o.colorFn(x, y, z, base)); else _c.copy(base);
      let s = shadeK * (ao ? A.min + (1 - A.min) * smooth01(A.bottom, A.top, y) : 1);
      // Painterly per-vertex variation (deterministic from position).
      if (ao && o.jitter !== 0) {
        const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
        s *= 1 + (o.jitter ?? 0.05) * ((h - Math.floor(h)) * 2 - 1);
      }
      col[i * 3] = _c.r * s; col[i * 3 + 1] = _c.g * s; col[i * 3 + 2] = _c.b * s;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new Float32Array(n * 2);
    const shine = o.shine || 0, glow = o.glow || 0;
    for (let i = 0; i < n; i++) {
      if (o.glowFn) { const gv = o.glowFn(pos.getX(i), pos.getY(i), pos.getZ(i)); mat[i * 2] = shine; mat[i * 2 + 1] = gv; }
      else { mat[i * 2] = shine; mat[i * 2 + 1] = glow; }
    }
    g.setAttribute('aMat', new THREE.BufferAttribute(mat, 2));
    if (this.bones && o.keepSkin && g.attributes.skinIndex) {
      // Weights baked by the caller (e.g. spineTube).
    } else if (this.bones) {
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        if (o.weights) {
          const ws = o.weights(pos.getX(i), pos.getY(i), pos.getZ(i));
          const m = Math.min(4, ws.length);
          let sum = 0;
          for (let k = 0; k < m; k++) sum += ws[k][1];
          for (let k = 0; k < m; k++) {
            si[i * 4 + k] = ws[k][0];
            sw[i * 4 + k] = sum > 0 ? ws[k][1] / sum : (k === 0 ? 1 : 0);
          }
        } else {
          si[i * 4] = bone;
          sw[i * 4] = 1;
        }
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    }
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'color', 'aMat', 'aUv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    }
    this.geos.push(g);
    return g;
  }

  // Bone-space point -> model-space (bind) point.
  P(bone, x, y, z) {
    const v = new THREE.Vector3(x, y, z);
    if (this.bones) v.applyMatrix4(this.bones[bone].matrixWorld);
    return v;
  }

  build() {
    if (!this.geos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      return g;
    }
    const merged = mergeGeometries(this.geos, false);
    for (const g of this.geos) g.dispose();
    this.geos = [];
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

// ---------------------------------------------------------------------------------------------
// Ref-counted geometry cache (actors with identical looks share one geometry).
// ---------------------------------------------------------------------------------------------
const GEO_CACHE = new Map();
export function acquireGeometry(key, buildFn) {
  let e = GEO_CACHE.get(key);
  if (!e) { e = { geo: buildFn(), refs: 0 }; GEO_CACHE.set(key, e); }
  e.refs++;
  return e.geo;
}
export function releaseGeometry(key) {
  const e = GEO_CACHE.get(key);
  if (!e) return;
  e.refs--;
  if (e.refs <= 0) {
    // Keep a few spare entries around (looks get rebuilt often in the character creator).
    e.geo.dispose();
    GEO_CACHE.delete(key);
  }
}
export function geometryCacheStats() {
  let verts = 0;
  for (const e of GEO_CACHE.values()) verts += e.geo.attributes.position.count;
  return { entries: GEO_CACHE.size, verts };
}

// Soft radial sprite texture (shared by FX and glows).
let GLOW_TEX = null;
export function glowTexture() {
  if (GLOW_TEX) return GLOW_TEX;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.7)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.2)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  GLOW_TEX = new THREE.CanvasTexture(c);
  GLOW_TEX.colorSpace = THREE.SRGBColorSpace;
  return GLOW_TEX;
}

// ---------------------------------------------------------------------------------------------
// Smooth body tube through control points (model space, bind pose). ctrl: [{ p: Vector3, rx, ry,
// bone }]. Rings blend skin weights between neighbouring control bones; colorAt(u, ang, out)
// paints per vertex (ang: 0 = right side, PI/2 = top, -PI/2 = belly). square < 1 = boxier rings.
// ---------------------------------------------------------------------------------------------
export function spineTube(ctrl, { seg = 4, radial = 12, colorAt = null, square = 1, bumps = null } = {}) {
  const n = ctrl.length;
  const curve = new THREE.CatmullRomCurve3(ctrl.map((c) => c.p.clone()), false, 'centripetal');
  const rings = (n - 1) * seg + 1;
  const per = radial + 1;
  const pos = new Float32Array(rings * per * 3), colA = new Float32Array(rings * per * 3);
  const si = new Uint16Array(rings * per * 4), sw = new Float32Array(rings * per * 4);
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), upv = new THREE.Vector3(), tan = new THREE.Vector3(), c = new THREE.Vector3();
  const tc = new THREE.Color();
  const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (let i = 0; i < rings; i++) {
    const u = i / (rings - 1);
    const s = u * (n - 1);
    const i0 = Math.min(n - 2, Math.floor(s));
    const f = s - i0;
    const fs = f * f * (3 - 2 * f);
    const rx = lerp(ctrl[i0].rx, ctrl[i0 + 1].rx, fs), ry = lerp(ctrl[i0].ry, ctrl[i0 + 1].ry, fs);
    const dy = lerp(ctrl[i0].dy || 0, ctrl[i0 + 1].dy || 0, fs);
    curve.getPoint(u, c);
    curve.getTangent(u, tan);
    side.crossVectors(tan, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    upv.crossVectors(side, tan).normalize();
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * TAU;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      let k = 1;
      if (bumps) k = bumps(u, ang);
      const ox = sp(ca, square) * rx * k, oy = sp(sa, square) * ry * k + dy;
      const idx = i * per + j;
      pos[idx * 3] = c.x + side.x * ox + upv.x * oy;
      pos[idx * 3 + 1] = c.y + side.y * ox + upv.y * oy;
      pos[idx * 3 + 2] = c.z + side.z * ox + upv.z * oy;
      if (colorAt) colorAt(u, Math.atan2(sa, ca), tc); else tc.setRGB(1, 1, 1);
      colA[idx * 3] = tc.r; colA[idx * 3 + 1] = tc.g; colA[idx * 3 + 2] = tc.b;
      si[idx * 4] = ctrl[i0].bone; si[idx * 4 + 1] = ctrl[i0 + 1].bone;
      sw[idx * 4] = 1 - fs; sw[idx * 4 + 1] = fs;
    }
  }
  const index = [];
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * per + j, b = a + 1, d = a + per, e = d + 1;
    index.push(a, d, b, b, d, e);
  }
  // End caps: a centre vertex per end (same colour / weights as its ring).
  const total = rings * per;
  const P2 = new Float32Array((total + 2) * 3); P2.set(pos);
  const C2 = new Float32Array((total + 2) * 3); C2.set(colA);
  const SI2 = new Uint16Array((total + 2) * 4); SI2.set(si);
  const SW2 = new Float32Array((total + 2) * 4); SW2.set(sw);
  for (const [ring, vi, u] of [[0, total, 0], [rings - 1, total + 1, 1]]) {
    curve.getPoint(u, c);
    P2[vi * 3] = c.x; P2[vi * 3 + 1] = c.y; P2[vi * 3 + 2] = c.z;
    const r0 = ring * per;
    for (let k = 0; k < 3; k++) C2[vi * 3 + k] = colA[r0 * 3 + k];
    for (let k = 0; k < 4; k++) { SI2[vi * 4 + k] = si[r0 * 4 + k]; SW2[vi * 4 + k] = sw[r0 * 4 + k]; }
    for (let j = 0; j < radial; j++) {
      const a = r0 + j, b = a + 1;
      if (ring === 0) index.push(vi, a, b); else index.push(vi, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P2, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C2, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI2, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW2, 4));
  g.setIndex(index);
  // Make sure faces point outward (flip the winding if the first ring disagrees).
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  const mid = Math.floor(rings / 2) * per;
  curve.getPoint((Math.floor(rings / 2)) / (rings - 1), c);
  const vx = pos[mid * 3] - c.x, vy = pos[mid * 3 + 1] - c.y, vz = pos[mid * 3 + 2] - c.z;
  if (vx * nrm.getX(mid) + vy * nrm.getY(mid) + vz * nrm.getZ(mid) < 0) {
    const ia = g.index.array;
    for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; }
  }
  g.deleteAttribute('normal');
  return g;
}

// Membrane from a list of triangles [[p0, p1, p2], ...] (model space) with per-point bones;
// both windings so it reads from either side. pts: [{ p: Vector3, bone }].
export function membrane(tris, color, { sag = null } = {}) {
  const pos = [], si = [], sw = [], col = [];
  const C0 = C(color);
  const push = (q) => { pos.push(q.p.x, q.p.y, q.p.z); si.push(q.bone, q.bone2 ?? q.bone, 0, 0); const w = q.w ?? 1; sw.push(w, 1 - w, 0, 0); const k = q.shade ?? 1; col.push(C0.r * k, C0.g * k, C0.b * k); };
  for (const [a, b, c] of tris) { push(a); push(b); push(c); }
  for (const [a, b, c] of tris) { push(a); push(c); push(b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}

// Soft contact-shadow texture (broad, flat-topped falloff).
let SHADOW_TEX = null;
export function shadowTexture() {
  if (SHADOW_TEX) return SHADOW_TEX;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  SHADOW_TEX = new THREE.CanvasTexture(c);
  return SHADOW_TEX;
}

// ---------------------------------------------------------------------------------------------
// Loft: smooth skinned surface through rings (model space, bind pose). Used for one-piece bodies
// (torso, limbs, hands, boots) so joints read as anatomy instead of stacked capsules.
// rings: [{ p: Vector3 centre, rx (side radius), rf (front), rb (back), w: [[bone, w], ...] }]
// Ring frame: tangent t along the centre line; side = normalize(t x ref), front = side x t.
// With ref = (0, 0, -1) a vertical line gets side = +x and front = -z (the character's front).
// opts: radial, ref, sq (superellipse exponent; < 1 boxier), mod(u, a, i) -> radius multiplier,
//       color(u, a, i, out) -> Color, caps [start, end]. Angle a: 0 = side, PI/2 = front.
// ---------------------------------------------------------------------------------------------
export function loft(rings, { radial = 16, ref = new THREE.Vector3(0, 0, -1), sq = 1, mod = null, color = null, caps = [true, true] } = {}) {
  const n = rings.length, per = radial + 1;
  const pos = new Float32Array((n * per + 2) * 3), col = new Float32Array((n * per + 2) * 3);
  const si = new Uint16Array((n * per + 2) * 4), sw = new Float32Array((n * per + 2) * 4);
  const t = new THREE.Vector3(), side = new THREE.Vector3(), front = new THREE.Vector3(), tc = new THREE.Color(1, 1, 1);
  const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const setW = (vi, w) => {
    let sum = 0;
    const m = Math.min(4, w.length);
    for (let k = 0; k < m; k++) sum += w[k][1];
    for (let k = 0; k < 4; k++) {
      si[vi * 4 + k] = k < m ? w[k][0] : 0;
      sw[vi * 4 + k] = k < m ? (sum > 0 ? w[k][1] / sum : (k === 0 ? 1 : 0)) : 0;
    }
  };
  for (let i = 0; i < n; i++) {
    const R = rings[i];
    const a0 = rings[Math.max(0, i - 1)].p, a1 = rings[Math.min(n - 1, i + 1)].p;
    t.subVectors(a1, a0);
    if (t.lengthSq() < 1e-10) t.set(0, -1, 0);
    t.normalize();
    const rf = R.ref || ref;
    side.crossVectors(t, rf);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    side.normalize();
    front.crossVectors(side, t).normalize();
    const u = n > 1 ? i / (n - 1) : 0;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const k = mod ? mod(u, a, i) : 1;
      const e = R.sq ?? sq;
      const ox = sp(ca, e) * R.rx * k, oy = sp(sa, e) * (sa > 0 ? R.rf : R.rb) * k;
      const vi = i * per + j;
      pos[vi * 3] = R.p.x + side.x * ox + front.x * oy;
      pos[vi * 3 + 1] = R.p.y + side.y * ox + front.y * oy;
      pos[vi * 3 + 2] = R.p.z + side.z * ox + front.z * oy;
      if (color) color(u, a, i, tc);
      col[vi * 3] = tc.r; col[vi * 3 + 1] = tc.g; col[vi * 3 + 2] = tc.b;
      setW(vi, R.w);
    }
  }
  const index = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * per + j, b = a + 1, d = a + per, e = d + 1;
    index.push(a, b, d, b, e, d);
  }
  let vc = n * per;
  for (const [end, on] of [[0, caps[0]], [1, caps[1]]]) {
    if (!on) continue;
    const ri = end ? n - 1 : 0, R = rings[ri], vi = vc++;
    pos[vi * 3] = R.p.x; pos[vi * 3 + 1] = R.p.y; pos[vi * 3 + 2] = R.p.z;
    for (let k = 0; k < 3; k++) col[vi * 3 + k] = col[(ri * per) * 3 + k];
    setW(vi, R.w);
    for (let j = 0; j < radial; j++) {
      const a = ri * per + j, b = a + 1;
      if (end) index.push(vi, a, b); else index.push(vi, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, vc * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, vc * 3), 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si.subarray(0, vc * 4), 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw.subarray(0, vc * 4), 4));
  g.setIndex(index);
  // Outward winding check (flip if the middle ring's normal points inward).
  g.computeVertexNormals();
  const nr = g.attributes.normal, mid = Math.floor(n / 2) * per + Math.floor(radial / 4);
  const c = rings[Math.floor(n / 2)].p;
  const vx = pos[mid * 3] - c.x, vy = pos[mid * 3 + 1] - c.y, vz = pos[mid * 3 + 2] - c.z;
  if (vx * nr.getX(mid) + vy * nr.getY(mid) + vz * nr.getZ(mid) < 0) {
    const ia = g.index.array;
    for (let i = 0; i < ia.length; i += 3) { const tmp = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = tmp; }
  }
  g.deleteAttribute('normal');
  return g;
}
