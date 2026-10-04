// Wind-swayed materials and CPU-culled instanced sets for vegetation (owner: setdressing).
import * as THREE from 'three';
import { patchMaterial } from './fog.js';

export const vegUniforms = {
  uVegTime: { value: 0 },
  uVegWind: { value: 1 },
  uVegDir: { value: new THREE.Vector3(0.8, 0, 0.6).normalize() },
};

// Sway in world space (instance rotation/scale removed), plus leaf flutter along the normal.
const WIND_VERTEX = /* glsl */ `
{
  vec3 ip = vec3(0.0);
  vec3 ld = uVegDir;
  #ifdef USE_INSTANCING
    ip = instanceMatrix[3].xyz;
    ld = (vec4(uVegDir, 0.0) * instanceMatrix).xyz;
    ld /= max(dot(ld, ld), 1e-4);
  #endif
  float ph = dot(ip.xz, vec2(0.071, 0.053));
  float gust = 0.6 + 0.4 * sin(uVegTime * 0.31 + ph * 0.4) * sin(uVegTime * 0.17 + 1.3);
  float sway = (sin(uVegTime * 1.25 + ph) * 0.7 + sin(uVegTime * 2.15 + ph * 1.9) * 0.3) * gust;
  transformed += ld * (sway * aWind * uVegWind);
  vec3 side = cross(ld, vec3(0.0, 1.0, 0.0));
  transformed += side * (sin(uVegTime * 1.7 + ph * 1.3) * 0.25 * aWind * uVegWind);
  float fl = sin(uVegTime * 6.5 + ph * 3.0 + dot(position, vec3(2.1, 1.7, 2.9)));
  transformed += objectNormal * (fl * 0.05 * min(aWind, 1.0) * uVegWind * FLUTTER);
}`;

export function windMaterial(material, key, { flutter = 0, keepNormals = false } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, vegUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aWind;
uniform float uVegTime;
uniform float uVegWind;
uniform vec3 uVegDir;
#define FLUTTER ${flutter.toFixed(3)}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_VERTEX);
    if (keepNormals) {
      // Foliage cards: keep the bent normals on both faces (no back-face flip).
      shader.fragmentShader = shader.fragmentShader.replace('normal *= faceDirection;', '');
    }
  };
  material.customProgramCacheKey = () => 'lentera-veg-' + key;
  return patchMaterial(material);
}

// A set of instances sharing transforms across parts (e.g. trunk + leaves).
export class InstSet {
  constructor(name, parts, { maxDist = 300, margin = 6, shadowDist = 0 } = {}) {
    this.name = name;
    this.parts = parts; // [{ geometry, material, cast, receive }]
    this.maxDist = maxDist;
    this.margin = margin;
    // Instances closer than shadowDist go to a shadow-casting mesh; the rest to a non-casting
    // twin, so the shadow pass only draws what can actually land in the (player-centred) map.
    this.shadowDist = shadowDist;
    this.mats = [];
    this.cols = [];
    this.spheres = [];
    this.meshes = [];
    this.far = [];
  }
  add(matrix, color, cx, cy, cz, radius) {
    this.mats.push(...matrix.elements);
    this.cols.push(color.r, color.g, color.b);
    this.spheres.push(cx, cy, cz, radius);
  }
  get count() { return (this.sphArr ? this.sphArr.length : this.spheres.length) / 4; }
  finalize(scene) {
    const n = this.count;
    this.matArr = new Float32Array(this.mats);
    this.colArr = new Float32Array(this.cols);
    this.sphArr = new Float32Array(this.spheres);
    this.mats = this.cols = this.spheres = null;
    if (!n) return;
    const mk = (p, cast) => {
      const mesh = new THREE.InstancedMesh(p.geometry, p.material, n);
      mesh.name = 'veg:' + this.name;
      mesh.frustumCulled = false;
      mesh.castShadow = cast;
      mesh.receiveShadow = p.receive !== false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    };
    this.split = this.shadowDist > 0 && this.parts.some((p) => p.cast);
    for (const p of this.parts) this.meshes.push(mk(p, !!p.cast));
    if (this.split) for (const p of this.parts) this.far.push(mk(p, false));
  }
  cull(cam, frustum, distScale = 1) {
    const n = this.count;
    if (!n || !this.meshes.length) return 0;
    const S = this.sphArr, M = this.matArr, C = this.colArr;
    const md = this.maxDist * distScale;
    const md2 = md * md;
    const cx = cam.x, cy = cam.y, cz = cam.z;
    const sph = _sphere;
    let v = 0, f = 0;
    const nearM = this.meshes.map((m) => m.instanceMatrix.array);
    const nearC = this.meshes.map((m) => m.instanceColor.array);
    const farM = this.far.map((m) => m.instanceMatrix.array);
    const farC = this.far.map((m) => m.instanceColor.array);
    const sd2 = this.split ? this.shadowDist * this.shadowDist : Infinity;
    for (let i = 0; i < n; i++) {
      const x = S[i * 4], y = S[i * 4 + 1], z = S[i * 4 + 2], r = S[i * 4 + 3];
      const dx = x - cx, dy = y - cy, dz = z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > md2) continue;
      sph.center.set(x, y, z);
      sph.radius = r + this.margin;
      if (!frustum.intersectsSphere(sph)) continue;
      const near = d2 < sd2;
      const dM = near ? nearM : farM, dC = near ? nearC : farC;
      const slot = near ? v++ : f++;
      for (let k = 0; k < dM.length; k++) {
        dM[k].set(M.subarray(i * 16, i * 16 + 16), slot * 16);
        dC[k][slot * 3] = C[i * 3]; dC[k][slot * 3 + 1] = C[i * 3 + 1]; dC[k][slot * 3 + 2] = C[i * 3 + 2];
      }
    }
    const flush = (meshes, cnt) => {
      for (const m of meshes) {
        m.count = cnt;
        m.visible = cnt > 0;
        if (!cnt) continue;
        m.instanceMatrix.clearUpdateRanges();
        m.instanceMatrix.addUpdateRange(0, cnt * 16);
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor.clearUpdateRanges();
        m.instanceColor.addUpdateRange(0, cnt * 3);
        m.instanceColor.needsUpdate = true;
      }
    };
    flush(this.meshes, v);
    flush(this.far, f);
    return v + f;
  }
}
const _sphere = new THREE.Sphere();
