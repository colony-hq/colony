// Dungeon dressing: rock walls for the Goblin Warrens and the Ashen Lair (a jagged heightfield
// rising from the floor edge over every solid tile), dressed masonry for the Sheriff's Vault
// (vertical block walls, dark caps, crimson-and-gold banners), wall torches registered as light
// sources with the sky, and small props. Walls between the camera and the player are cut away
// (dithered) so the player is never hidden. Owner: world builder.

import * as THREE from 'three';
import { getDungeonFields } from './w-fields.js';
import { DUNGEONS } from './mapgen.js';
import { U, GLSL_COMMON } from './w-common.js';
import { createNoise2D, mulberry32 } from '../core/noise.js';
import { GeoBuilder, lin } from './w-scatter.js';

export const CUT = {
  uCutA: { value: new THREE.Vector3(0, -999, 0) }, // camera
  uCutB: { value: new THREE.Vector3(0, -999, 0) }, // player (chest height)
  uCutR: { value: 2.6 },
};

const WALL_FRAG_HEAD = /* glsl */`
uniform sampler2D uNoise;
uniform float uTime;
uniform float uGlow;
uniform vec3 uCutA;
uniform vec3 uCutB;
uniform float uCutR;
varying vec3 vWPos;
varying vec3 vWNrm;
varying float vKeep;
${GLSL_COMMON}
`;
const WALL_FRAG_BODY = /* glsl */`
{
  // camera -> player cutout (dithered)
  vec3 ab = uCutB - uCutA;
  float L = length(ab);
  if (L > 0.1) {
    float t = clamp(dot(vWPos - uCutA, ab) / (L * L), 0.0, 1.0);
    float d = length(vWPos - (uCutA + ab * t));
    float dither = hvHash12(floor(gl_FragCoord.xy));
    float k = smoothstep(uCutR, uCutR * 0.55, d) * step(t, 0.97) * step(0.05, t);
    if (vWPos.y > uCutB.y - 1.2 && k > dither) discard;
  }
}
vec3 hvEmis = vec3(0.0);
vec3 col = vColor.rgb;
vec2 wp = vWPos.xz;
float vert = 1.0 - abs(vWNrm.y);
vec2 tuv = abs(vWNrm.x) > abs(vWNrm.z) ? vec2(vWPos.z, vWPos.y) : vec2(vWPos.x, vWPos.y);
if (vKeep < 0.5) {
#if WALL_KIND == 2
  if (vert > 0.5) {
    vec2 q = tuv / vec2(0.95, 0.48);
    float row = floor(q.y);
    q.x += mod(row, 2.0) * 0.5;
    vec2 cell = floor(q), f = fract(q);
    float hh = hvHash12(cell + 7.0);
    vec3 st = mix(vec3(0.42, 0.41, 0.39), vec3(0.58, 0.56, 0.52), hh);
    st *= 0.85 + 0.25 * texture2D(uNoise, tuv * 0.4).g;
    float mortar = smoothstep(0.0, 0.05, f.x) * smoothstep(1.0, 0.95, f.x) * smoothstep(0.0, 0.08, f.y) * smoothstep(1.0, 0.92, f.y);
    col = mix(vec3(0.22, 0.21, 0.19), st, mortar);
    col *= mix(0.55, 1.0, smoothstep(0.0, 1.4, vWPos.y));
    col = mix(col, vec3(0.22, 0.3, 0.18), smoothstep(0.65, 0.85, texture2D(uNoise, tuv * 0.15).r) * (1.0 - smoothstep(0.2, 1.2, vWPos.y)) * 0.7);
  } else {
    vec2 q = wp / vec2(1.0, 0.6);
    q.x += mod(floor(q.y), 2.0) * 0.5;
    vec2 f = fract(q);
    float hh = hvHash12(floor(q) + 3.0);
    col = mix(vec3(0.34, 0.33, 0.31), vec3(0.44, 0.42, 0.40), hh) * (0.85 + 0.25 * texture2D(uNoise, wp * 0.2).r);
    col *= mix(0.6, 1.0, smoothstep(0.0, 0.06, f.x) * smoothstep(1.0, 0.94, f.x) * smoothstep(0.0, 0.1, f.y) * smoothstep(1.0, 0.9, f.y));
  }
  col = hvLin(col);
#else
  vec4 n1 = texture2D(uNoise, tuv * 0.11 + wp * 0.03);
  vec4 n2 = texture2D(uNoise, tuv * 0.33);
  col *= 0.8 + 0.35 * n1.r;
  col *= 0.88 + 0.12 * sin(vWPos.y * 3.1 + n1.g * 5.0);
  col *= mix(0.6, 1.0, smoothstep(0.02, 0.16, n2.b));
  col *= 0.8 + 0.3 * clamp(vWNrm.y * 1.5, 0.0, 1.0);
#if WALL_KIND == 3
  float crack = 1.0 - smoothstep(0.0, 0.05, n2.b);
  float low = 1.0 - smoothstep(0.2, 2.2, vWPos.y);
  float pulse = 0.6 + 0.4 * sin(uTime * 1.4 + n1.a * 6.28);
  hvEmis += vec3(1.0, 0.3, 0.05) * crack * (0.25 + low) * pulse * 1.4 * uGlow;
  col = mix(col, vec3(0.12, 0.05, 0.03), crack * 0.6);
#endif
#endif
}
diffuseColor.rgb = col;
`;

function wallMaterial(kind) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: kind !== 2 });
  mat.defines = { WALL_KIND: kind };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uNoise: U.uNoise, uTime: U.uTime, uGlow: U.uGlow, ...CUT });
    sh.vertexShader = 'attribute float aKeep;\nvarying float vKeep;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNrm = normalize(mat3(modelMatrix) * objectNormal);
vKeep = aKeep;`);
    sh.fragmentShader = WALL_FRAG_HEAD + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + WALL_FRAG_BODY)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += hvEmis;');
  };
  mat.customProgramCacheKey = () => 'hv-wall-' + kind;
  return mat;
}

// ---------------------------------------------------------------------------------------------
function caveWalls(id, DF, kind) {
  const { N, W, H, x0, z0, solid, rockDepth, heights } = DF;
  const n1 = createNoise2D(900 + kind), n2 = createNoise2D(950 + kind);
  // Half-tile sub-grid: M x M vertices at (i/2, j/2).
  const M = 2 * W + 1;
  const isSolid = (tx, tz) => tx < 0 || tz < 0 || tx >= W || tz >= H || solid[tz * W + tx] === 1;
  const px = new Float32Array(M * M), py = new Float32Array(M * M), pz = new Float32Array(M * M);
  const hBil = (x, z) => {
    const i = Math.min(N - 2, Math.floor(x)), j = Math.min(N - 2, Math.floor(z));
    const tx = x - i, tz = z - j, k = j * N + i;
    return (heights[k] * (1 - tx) + heights[k + 1] * tx) * (1 - tz) + (heights[k + N] * (1 - tx) + heights[k + N + 1] * tx) * tz;
  };
  const dBil = (x, z) => {
    const i = Math.min(N - 2, Math.floor(x)), j = Math.min(N - 2, Math.floor(z));
    const tx = x - i, tz = z - j, k = j * N + i;
    return (rockDepth[k] * (1 - tx) + rockDepth[k + 1] * tx) * (1 - tz) + (rockDepth[k + N] * (1 - tx) + rockDepth[k + N + 1] * tx) * tz;
  };
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const v = j * M + i;
    const x = i / 2, z = j / 2;
    // tiles touching this sub-vertex
    const xs = i % 2 === 0 ? [i / 2 - 1, i / 2] : [(i - 1) / 2];
    const zs = j % 2 === 0 ? [j / 2 - 1, j / 2] : [(j - 1) / 2];
    let floorish = false;
    for (const tz of zs) for (const tx of xs) if (!isSolid(tx, tz)) floorish = true;
    const wx = x0 + x, wz = z0 + z;
    if (floorish) { px[v] = wx; py[v] = hBil(x, z); pz[v] = wz; continue; }
    const d = dBil(x, z);
    const j2 = d < 1.2 ? 0.28 : 0.2;
    px[v] = wx + n1(wx * 0.9, wz * 0.9) * j2;
    pz[v] = wz + n2(wx * 0.9, wz * 0.9) * j2;
    const lip = Math.min(1, d / 0.9);
    py[v] = hBil(x, z) + lip * ((kind === 3 ? 2.2 : 2.6) + Math.min(d, 4.5) * 0.85 + n1(wx * 0.23, wz * 0.23) * 1.0 + n2(wx * 1.3, wz * 1.3) * 0.45);
  }
  const pos = [], col = [];
  const baseC = kind === 3 ? [0.44, 0.38, 0.36] : [0.6, 0.48, 0.36];
  const topC = kind === 3 ? [0.22, 0.19, 0.18] : [0.26, 0.2, 0.15];
  const vcol = (v) => {
    const t = Math.min(1, Math.max(0, (py[v] - 0.3) / 3.5));
    const nn = 0.82 + 0.36 * (n2(px[v] * 0.5, pz[v] * 0.5) * 0.5 + 0.5);
    return [lin((baseC[0] + (topC[0] - baseC[0]) * t) * nn), lin((baseC[1] + (topC[1] - baseC[1]) * t) * nn), lin((baseC[2] + (topC[2] - baseC[2]) * t) * nn)];
  };
  for (let tz = 0; tz < H; tz++) for (let tx = 0; tx < W; tx++) {
    if (!solid[tz * W + tx]) continue;
    for (let sj = 0; sj < 2; sj++) for (let si = 0; si < 2; si++) {
      const i = tx * 2 + si, j = tz * 2 + sj;
      const a = j * M + i, b = a + 1, c = a + M, d = c + 1;
      const tris = (si + sj) % 2 === 0 ? [[a, c, b], [c, d, b]] : [[a, c, d], [a, d, b]];
      for (const tri of tris) for (const v of tri) { pos.push(px[v], py[v], pz[v]); col.push(...vcol(v)); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aKeep', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, wallMaterial(kind));
  mesh.name = 'dungeon:walls:' + id;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function masonryWalls(id, DF) {
  const { W, H, x0, z0, solid, heights, N } = DF;
  const HT = 3.0;
  const B = new GeoBuilder();
  const isSolid = (x, z) => x < 0 || z < 0 || x >= W || z >= H || solid[z * W + x] === 1;
  const grey = [0.5, 0.5, 0.5];
  const banners = [];
  const r = mulberry32(1100);
  for (let tz = 0; tz < H; tz++) for (let tx = 0; tx < W; tx++) {
    if (isSolid(tx, tz)) continue;
    const fy = heights[tz * N + tx] - 0.05;
    const X = x0 + tx, Z = z0 + tz;
    if (isSolid(tx, tz - 1)) { B.quad([X + 1, fy, Z], [X, fy, Z], [X, HT, Z], [X + 1, HT, Z], grey, 0, [0, 0, 1]); if (r() < 0.12) banners.push([X + 0.5, Z + 0.02, 0, 1]); }
    if (isSolid(tx, tz + 1)) { B.quad([X, fy, Z + 1], [X + 1, fy, Z + 1], [X + 1, HT, Z + 1], [X, HT, Z + 1], grey, 0, [0, 0, -1]); }
    if (isSolid(tx - 1, tz)) { B.quad([X, fy, Z], [X, fy, Z + 1], [X, HT, Z + 1], [X, HT, Z], grey, 0, [1, 0, 0]); if (r() < 0.08) banners.push([X + 0.02, Z + 0.5, 1, 0]); }
    if (isSolid(tx + 1, tz)) { B.quad([X + 1, fy, Z + 1], [X + 1, fy, Z], [X + 1, HT, Z], [X + 1, HT, Z + 1], grey, 0, [-1, 0, 0]); if (r() < 0.08) banners.push([X + 0.98, Z + 0.5, -1, 0]); }
  }
  // caps over solid tiles near the rooms
  for (let tz = 0; tz < H; tz++) for (let tx = 0; tx < W; tx++) {
    if (!isSolid(tx, tz)) continue;
    let near = false;
    for (let dz = -2; dz <= 2 && !near; dz++) for (let dx = -2; dx <= 2; dx++) if (!isSolid(tx + dx, tz + dz)) { near = true; break; }
    if (!near) continue;
    const X = x0 + tx, Z = z0 + tz;
    B.quad([X, HT, Z], [X, HT, Z + 1], [X + 1, HT, Z + 1], [X + 1, HT, Z], grey, 0, [0, 1, 0]);
  }
  // banners: crimson cloth with a gold band and a coin sigil
  const crimson = [0.55, 0.08, 0.1], gold = [0.85, 0.66, 0.24];
  for (const [bx, bz, nx, nz] of banners) {
    const sx = -nz * 0.38, sz = nx * 0.38;
    const ox = nx * 0.03, oz = nz * 0.03;
    const top = 2.7, bot = 1.0;
    B.quad([bx - sx + ox, bot + 0.2, bz - sz + oz], [bx + sx + ox, bot + 0.2, bz + sz + oz], [bx + sx + ox, top, bz + sz + oz], [bx - sx + ox, top, bz - sz + oz], crimson, 1, [nx, 0, nz]);
    B.tri([bx - sx + ox, bot + 0.2, bz - sz + oz], [bx, bot - 0.15, bz], [bx + sx + ox, bot + 0.2, bz + sz + oz], crimson, 1, [nx, 0, nz]);
    B.quad([bx - sx + ox * 2, top - 0.25, bz - sz + oz * 2], [bx + sx + ox * 2, top - 0.25, bz + sz + oz * 2], [bx + sx + ox * 2, top - 0.12, bz + sz + oz * 2], [bx - sx + ox * 2, top - 0.12, bz - sz + oz * 2], gold, 1, [nx, 0, nz]);
    const cx = bx + ox * 2, cz = bz + oz * 2, cy = 1.85, rr = 0.16;
    for (let i = 0; i < 8; i++) {
      const a1 = (i / 8) * Math.PI * 2, a2 = ((i + 1) / 8) * Math.PI * 2;
      B.tri([cx, cy, cz], [cx - nz * Math.cos(a1) * rr, cy + Math.sin(a1) * rr, cz + nx * Math.cos(a1) * rr], [cx - nz * Math.cos(a2) * rr, cy + Math.sin(a2) * rr, cz + nx * Math.cos(a2) * rr], gold, 1, [nx, 0, nz]);
    }
  }
  const geo = B.build();
  const mesh = new THREE.Mesh(geo, wallMaterial(2));
  mesh.name = 'dungeon:walls:' + id;
  mesh.receiveShadow = true;
  return mesh;
}

// Wall torch positions: floor tiles touching a wall, spaced out.
function torchSpots(DF, spacing, seed) {
  const { W, H, x0, z0, solid, heights, N } = DF;
  const r = mulberry32(seed);
  const spots = [];
  const isSolid = (x, z) => x < 0 || z < 0 || x >= W || z >= H || solid[z * W + x] === 1;
  const cands = [];
  for (let tz = 1; tz < H - 1; tz++) for (let tx = 1; tx < W - 1; tx++) {
    if (isSolid(tx, tz)) continue;
    for (const [dx, dz] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) if (isSolid(tx + dx, tz + dz)) { cands.push([tx, tz, dx, dz, r()]); break; }
  }
  cands.sort((a, b) => a[4] - b[4]);
  for (const [tx, tz, dx, dz] of cands) {
    if (spots.some((s) => Math.hypot(s.tx - tx, s.tz - tz) < spacing)) continue;
    const y = heights[tz * N + tx];
    spots.push({ tx, tz, dx, dz, x: x0 + tx + 0.5 + dx * 0.42, z: z0 + tz + 0.5 + dz * 0.42, y });
  }
  return spots;
}

function torchMesh(spots, kind) {
  const B = new GeoBuilder();
  const wood = [0.32, 0.22, 0.14], iron = [0.18, 0.18, 0.19];
  for (const s of spots) {
    const m = new THREE.Matrix4().makeTranslation(s.x - s.dx * 0.05, s.y + 1.75, s.z - s.dz * 0.05)
      .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(s.dz, 0, -s.dx).normalize(), -0.35));
    B.geo(new THREE.CylinderGeometry(0.04, 0.03, 0.55, 5), wood, 1, m);
    B.geo(new THREE.CylinderGeometry(0.07, 0.05, 0.1, 6, 1, true), iron, 1, new THREE.Matrix4().copy(m).multiply(new THREE.Matrix4().makeTranslation(0, 0.27, 0)));
    B.geo(new THREE.BoxGeometry(0.06, 0.06, 0.32), iron, 1, new THREE.Matrix4().makeTranslation(s.x + s.dx * 0.12, s.y + 1.75, s.z + s.dz * 0.12).multiply(new THREE.Matrix4().makeRotationY(Math.atan2(s.dx, s.dz))));
  }
  const geo = B.build();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'dungeon:torches';
  return mesh;
}

export function buildDungeons(ctx, { addFlames, addLight, scatters }) {
  const out = [];
  for (const id in DUNGEONS) {
    const DF = getDungeonFields(id);
    const kind = DF.kind;
    const group = new THREE.Group();
    group.name = 'dungeon:' + id;
    group.add(kind === 2 ? masonryWalls(id, DF) : caveWalls(id, DF, kind));
    const spots = torchSpots(DF, kind === 2 ? 6 : 8, 4000 + kind);
    if (spots.length) group.add(torchMesh(spots, kind));
    const tcol = kind === 3 ? 0xff7a30 : kind === 2 ? 0xffa850 : 0xff9a40;
    for (const s of spots) {
      const fx = s.x - s.dx * 0.05 + s.dz * 0 - s.dx * 0.1, fz = s.z - s.dz * 0.05 - s.dz * 0.1;
      addFlames.push({ x: fx, y: s.y + 2.05, z: fz, size: 0.32, kind: 0, color: tcol });
      addFlames.push({ x: fx, y: s.y + 2.1, z: fz, size: 1.6, kind: 1, color: tcol });
      addLight({ x: fx - s.dx * 0.6, y: s.y + 2.0, z: fz - s.dz * 0.6, color: tcol, intensity: 9, distance: 11, flicker: 0.2, night: false, region: id });
    }
    // props at the wall foot (solid tiles touching floor) and small floor clutter
    const r = mulberry32(5000 + kind);
    const { W, H, x0, z0, solid, heights, N } = DF;
    for (let tz = 1; tz < H - 1; tz++) for (let tx = 1; tx < W - 1; tx++) {
      const isS = solid[tz * W + tx];
      let nb = null;
      for (const [dx, dz] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) if (solid[(tz + dz) * W + tx + dx] !== isS) { nb = [dx, dz]; break; }
      if (isS && nb && kind !== 2) {
        // wall foot: stalagmites / glowing fungus / ash crystals
        const x = x0 + tx + 0.5 + nb[0] * 0.35, z = z0 + tz + 0.5 + nb[1] * 0.35;
        const y = heights[(tz + nb[1]) * N + tx + nb[0]] ?? 0;
        if (r() < 0.22) scatters.stalag?.add(x, y - 0.1, z, r() * 6.28, 0.6 + r() * 0.6, 0.6 + r() * 0.9, ...(kind === 3 ? [0.06, 0.05, 0.05] : [0.2, 0.15, 0.1]), r());
        if (kind === 1 && r() < 0.12) scatters.dGlowshrooms?.add(x + nb[0] * 0.2, y, z + nb[1] * 0.2, r() * 6.28, 0.9 + r() * 0.8, 0.9 + r() * 0.8, ...[r() < 0.5 ? 0.25 : 0.55, 0.9, r() < 0.5 ? 0.8 : 1.0].map(lin), r());
        if (kind === 3 && r() < 0.1) scatters.dCrystals?.add(x + nb[0] * 0.2, y, z + nb[1] * 0.2, r() * 6.28, 1.2 + r(), 1.2 + r() * 1.5, lin(1.0), lin(0.42), lin(0.1), r());
      } else if (!isS && r() < (kind === 2 ? 0.03 : 0.045)) {
        const x = x0 + tx + 0.2 + r() * 0.6, z = z0 + tz + 0.2 + r() * 0.6;
        const y = heights[tz * N + tx];
        scatters.bones?.add(x, y, z, r() * 6.28, 0.8 + r() * 0.5, 1, lin(0.86), lin(0.82), lin(0.72), r());
      }
    }
    ctx.scene.add(group);
    out.push({ id, group, spots });
  }
  return out;
}

export function geoStalagmites() {
  const B = new GeoBuilder();
  const r = mulberry32(17);
  for (let i = 0; i < 3; i++) {
    const h = 0.6 + r() * 1.3, rad = 0.12 + r() * 0.16;
    B.geo(new THREE.ConeGeometry(rad, h, 6, 2, true), (x, y) => [0.8 + 0.4 * (y / h + 0.5), 0.8 + 0.4 * (y / h + 0.5), 0.8 + 0.4 * (y / h + 0.5)], 0,
      new THREE.Matrix4().makeTranslation((r() - 0.5) * 0.5, h / 2, (r() - 0.5) * 0.5));
  }
  return B.build();
}
export function geoBones() {
  const B = new GeoBuilder();
  const r = mulberry32(19);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Matrix4().makeTranslation((r() - 0.5) * 0.4, 0.03, (r() - 0.5) * 0.4).multiply(new THREE.Matrix4().makeRotationY(r() * 6.28)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    B.geo(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 4), [1, 1, 1], 0, m);
  }
  if (r() < 2) B.geo(new THREE.SphereGeometry(0.09, 6, 4), [1, 1, 1], 0, new THREE.Matrix4().makeTranslation(0.12, 0.07, 0.05).multiply(new THREE.Matrix4().makeScale(1, 0.85, 1.15)));
  return B.build();
}
