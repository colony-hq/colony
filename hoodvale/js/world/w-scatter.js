// Near-field streaming instancer for decor + the decor material factory. Owner: world builder.
//
// A Scatter holds every instance of one decor type in a spatial hash (16 m cells). Around the
// focus point (player / camera look point) it packs the instances within its radius into ONE
// InstancedMesh (1 draw call), shrinking them towards the rim so nothing pops. Each instance has a
// random rank: with density d only ranks < d are shown, so quality changes need no regeneration.

import * as THREE from 'three';
import { U } from './w-common.js';

const STRIDE = 10; // x, y, z, yaw, sx, sy, r, g, b, rank

export class Scatter {
  constructor(ctx, { name, geometry, material, radius = 60, cell = 16, castShadow = false, receiveShadow = true, region = 'overworld', density = 1, fade = 0.18, max = 4000, tilt = 0 }) {
    this.ctx = ctx;
    this.name = name;
    this.radius = radius;
    this.cell = cell;
    this.region = region;
    this.density = density;
    this.fade = fade;
    this.tilt = tilt;
    this.cells = new Map();
    this.total = 0;
    this.max = max;
    this.geometry = geometry;
    this.material = material;
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.mesh = null;
    this.last = { x: 1e9, z: 1e9, d: -1, r: -1 };
    this._sphere = new THREE.Sphere();
  }

  add(x, y, z, yaw = 0, sx = 1, sy = 1, r = 1, g = 1, b = 1, rank = Math.random()) {
    const k = Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell);
    let a = this.cells.get(k);
    if (!a) { a = []; this.cells.set(k, a); }
    a.push(x, y, z, yaw, sx, sy, r, g, b, rank);
    this.total++;
  }

  build(scene) {
    for (const [k, a] of this.cells) this.cells.set(k, new Float32Array(a));
    const cap = Math.max(1, Math.min(this.max, this.total));
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, cap);
    mesh.name = 'decor:' + this.name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.visible = false;
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = this.receiveShadow;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    this.mesh = mesh;
    this.cap = cap;
    return this;
  }

  // Repack around (fx, fz) when the focus moved enough, or density / radius changed.
  update(fx, fz, region, density = 1, radiusScale = 1) {
    const mesh = this.mesh;
    if (!mesh) return;
    if (region !== this.region || this.total === 0 || density <= 0) { mesh.visible = false; this.last.x = 1e9; return; }
    const R = this.radius * radiusScale;
    const L = this.last;
    const moved = Math.hypot(fx - L.x, fz - L.z);
    if (moved < Math.max(2.5, R * 0.07) && L.d === density && L.r === R) { mesh.visible = mesh.count > 0; return; }
    L.x = fx; L.z = fz; L.d = density; L.r = R;
    const m = mesh.instanceMatrix.array, c = mesh.instanceColor.array;
    const R2 = R * R, f0 = R * (1 - this.fade);
    const cs = this.cell;
    const c0x = Math.floor((fx - R) / cs), c1x = Math.floor((fx + R) / cs);
    const c0z = Math.floor((fz - R) / cs), c1z = Math.floor((fz + R) / cs);
    let n = 0, minY = Infinity, maxY = -Infinity;
    const tilt = this.tilt;
    for (let cz = c0z; cz <= c1z && n < this.cap; cz++) for (let cx = c0x; cx <= c1x && n < this.cap; cx++) {
      const a = this.cells.get(cx + ',' + cz);
      if (!a) continue;
      for (let i = 0; i < a.length && n < this.cap; i += STRIDE) {
        if (a[i + 9] > density) continue;
        const dx = a[i] - fx, dz = a[i + 2] - fz;
        const d2 = dx * dx + dz * dz;
        if (d2 > R2) continue;
        let s = 1;
        const d = Math.sqrt(d2);
        if (d > f0) { s = 1 - (d - f0) / (R - f0); s = s * s * (3 - 2 * s); }
        if (s < 0.04) continue;
        const yaw = a[i + 3], sx = a[i + 4] * s, sy = a[i + 5] * s;
        const co = Math.cos(yaw), si = Math.sin(yaw);
        const o = n * 16;
        if (tilt) {
          // small lean, direction from the rank (deterministic)
          const tl = (a[i + 9] - 0.5) * tilt * 2, tc = Math.cos(tl), ts = Math.sin(tl);
          m[o] = co * sx; m[o + 1] = 0; m[o + 2] = -si * sx; m[o + 3] = 0;
          m[o + 4] = si * ts * sy; m[o + 5] = tc * sy; m[o + 6] = co * ts * sy; m[o + 7] = 0;
          m[o + 8] = si * tc * sx; m[o + 9] = -ts * sx; m[o + 10] = co * tc * sx; m[o + 11] = 0;
        } else {
          m[o] = co * sx; m[o + 1] = 0; m[o + 2] = -si * sx; m[o + 3] = 0;
          m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
          m[o + 8] = si * sx; m[o + 9] = 0; m[o + 10] = co * sx; m[o + 11] = 0;
        }
        m[o + 12] = a[i]; m[o + 13] = a[i + 1]; m[o + 14] = a[i + 2]; m[o + 15] = 1;
        c[n * 3] = a[i + 6]; c[n * 3 + 1] = a[i + 7]; c[n * 3 + 2] = a[i + 8];
        if (a[i + 1] < minY) minY = a[i + 1];
        if (a[i + 1] > maxY) maxY = a[i + 1];
        n++;
      }
    }
    mesh.count = n;
    mesh.visible = n > 0;
    if (n) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, n * 16);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.clearUpdateRanges();
      mesh.instanceColor.addUpdateRange(0, n * 3);
      mesh.instanceColor.needsUpdate = true;
      const h = this.geometry.boundingSphere ? this.geometry.boundingSphere.radius * 2.5 : 4;
      mesh.boundingSphere.center.set(fx, (minY + maxY) / 2, fz);
      mesh.boundingSphere.radius = Math.hypot(R, (maxY - minY) / 2) + h;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Decor material: Lambert + vertex colours x instance colour (attribute aKeep = 1 keeps the
// vertex colour untinted), optional world-space wind sway (scaled by local height), optional
// emissive glow from the tinted colour, optional "no normal flip" for double-sided cards.
// ---------------------------------------------------------------------------------------------
export function decorMaterial({ wind = 0, glow = 0, glowNight = 0, double = false, noFlip = true, bob = 0, flatShading = false, emissiveKeepOnly = false } = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: double ? THREE.DoubleSide : THREE.FrontSide, flatShading });
  const key = `hv-decor-${wind}-${glow}-${glowNight}-${double}-${noFlip}-${bob}-${flatShading}-${emissiveKeepOnly}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uWind = U.uWind;
    shader.uniforms.uNight = U.uNight;
    shader.uniforms.uGlow = U.uGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aKeep;\nvarying float vKeep;\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <color_vertex>', /* glsl */`
#include <color_vertex>
vKeep = aKeep;
#if defined( USE_INSTANCING_COLOR ) && defined( USE_COLOR )
  vColor.xyz = mix(color.xyz * instanceColor.xyz, color.xyz, aKeep);
#endif`)
      .replace('#include <project_vertex>', /* glsl */`
vec4 hvW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  hvW = instanceMatrix * hvW;
#endif
hvW = modelMatrix * hvW;
#if ${wind > 0 ? 1 : 0}
{
  float hk = max(position.y, 0.0) * ${wind.toFixed(4)};
  float ph = hvW.x * 0.31 + hvW.z * 0.23;
  float s = sin(uTime * 1.7 + ph) * 0.6 + sin(uTime * 2.9 + ph * 2.7) * 0.3;
  hvW.x += s * hk * uWind;
  hvW.z += s * 0.55 * hk * uWind;
}
#endif
#if ${bob > 0 ? 1 : 0}
  hvW.y += sin(uTime * 1.3 + hvW.x * 0.7 + hvW.z * 0.5) * ${bob.toFixed(4)};
#endif
vec4 mvPosition = viewMatrix * hvW;
gl_Position = projectionMatrix * mvPosition;`);
    let fs = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vKeep;\nuniform float uNight;\nuniform float uGlow;');
    if (noFlip && double) {
      fs = fs.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    }
    if (glow > 0 || glowNight > 0) {
      fs = fs.replace('#include <emissivemap_fragment>', /* glsl */`
#include <emissivemap_fragment>
{
  float gk = ${emissiveKeepOnly ? 'vKeep' : '1.0 - vKeep'};
  totalEmissiveRadiance += diffuseColor.rgb * gk * (${glow.toFixed(3)} + ${glowNight.toFixed(3)} * uNight) * uGlow;
}`);
    }
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// Build a geometry from triangles: tris = [[x,y,z]*3, ...] with colours and keep flags.
export class GeoBuilder {
  constructor() { this.p = []; this.c = []; this.k = []; this.n = []; }
  tri(a, b, c, col, keep = 0, nrm = null) {
    this.p.push(...a, ...b, ...c);
    const cols = Array.isArray(col[0]) ? col : [col, col, col];
    for (const cc of cols) this.c.push(cc[0], cc[1], cc[2]);
    this.k.push(keep, keep, keep);
    if (nrm) for (let i = 0; i < 3; i++) this.n.push(nrm[0], nrm[1], nrm[2]);
    else this.n.push(NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN);
    return this;
  }
  quad(a, b, c, d, col, keep = 0, nrm = null) {
    const cols = Array.isArray(col[0]) ? col : [col, col, col, col];
    this.tri(a, b, c, [cols[0], cols[1], cols[2]], keep, nrm);
    this.tri(a, c, d, [cols[0], cols[2], cols[3]], keep, nrm);
    return this;
  }
  // Append an existing (non-indexed or indexed) geometry with a colour fn and keep flag.
  geo(g, colFn, keep = 0, xform = null) {
    const gg = g.index ? g.toNonIndexed() : g;
    if (xform) gg.applyMatrix4(xform);
    gg.computeVertexNormals();
    const p = gg.attributes.position, n = gg.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      this.p.push(x, y, z);
      const cc = typeof colFn === 'function' ? colFn(x, y, z, i) : colFn;
      this.c.push(cc[0], cc[1], cc[2]);
      this.k.push(keep);
      this.n.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    return this;
  }
  build({ upNormals = false } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c.map(lin), 3));
    g.setAttribute('aKeep', new THREE.Float32BufferAttribute(this.k, 1));
    const nn = this.n.slice();
    // fill computed normals where missing
    g.computeVertexNormals();
    const cn = g.attributes.normal.array;
    for (let i = 0; i < nn.length; i++) if (upNormals) nn[i] = i % 3 === 1 ? 1 : 0; else if (Number.isNaN(nn[i])) nn[i] = cn[i];
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
    g.computeBoundingSphere();
    return g;
  }
}
// sRGB component -> linear
export function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function hexRGB(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; }
