// Procedural plant geometry (owner: setdressing). Every geometry carries position, normal, uv,
// color (AO/tint) and aWind (sway amplitude in metres at full wind). Foliage cards get normals
// bent away from the crown centre for soft, volumetric shading.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/noise.js';
import { atlasUV } from './veg-textures.js';
import { rockGeo } from './props-kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Accumulates raw triangles; build() returns an indexed BufferGeometry.
class Mesher {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.w = []; this.idx = []; }
  vert(p, n, u, v, col = 1, wind = 0) {
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, v);
    const c = typeof col === 'number' ? [col, col, col] : col;
    this.c.push(c[0], c[1], c[2]); this.w.push(wind);
    return this.p.length / 3 - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.w, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// Tube along a curve with radius r(t); UV u around (x circumference), v along (metres).
// wind(t, point) -> amplitude.
function tube(m, pts, rFn, radial, segs, wind, col = 1, uvScale = 1) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const frames = curve.computeFrenetFrames(segs, false);
  const len = curve.getLength();
  const base = m.p.length / 3;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const P = curve.getPointAt(t);
    const N = frames.normals[i], B = frames.binormals[i];
    const r = rFn(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const nx = Math.cos(a) * N.x + Math.sin(a) * B.x, ny = Math.cos(a) * N.y + Math.sin(a) * B.y, nz = Math.cos(a) * N.z + Math.sin(a) * B.z;
      const nrm = V(nx, ny, nz);
      m.vert(V(P.x + nx * r, P.y + ny * r, P.z + nz * r), nrm, (j / radial) * Math.PI * 2 * r * uvScale, t * len * uvScale,
        typeof col === 'function' ? col(t) : col, wind(t, P));
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = base + i * (radial + 1) + j, b = a + radial + 1;
    m.quad(a, b, b + 1, a + 1);
  }
}

// Card (quad) with centre c, right r, up u (half extents baked in), atlas rect, bent normal.
function card(m, c, r, u, uvr, nrm, col, windBottom, windTop) {
  const a = m.vert(c.clone().sub(r).sub(u), nrm, uvr.u0, uvr.v0, col * 0.8, windBottom);
  const b = m.vert(c.clone().add(r).sub(u), nrm, uvr.u1, uvr.v0, col * 0.8, windBottom);
  const d = m.vert(c.clone().add(r).add(u), nrm, uvr.u1, uvr.v1, col, windTop);
  const e = m.vert(c.clone().sub(r).add(u), nrm, uvr.u0, uvr.v1, col, windTop);
  m.quad(a, b, d, e);
}

// Ribbon leaf (frond / banana / fern): spine along a drooping arc from `o` in direction `dir`.
function ribbon(m, o, dir, len, width, rise, droop, uvr, segs, wind, { fold = 0.12, col = 1, twist = 0 } = {}) {
  const side = V(-dir.z, 0, dir.x).normalize();
  const base = m.p.length / 3;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const spine = o.clone().addScaledVector(dir, len * t);
    spine.y += len * (rise * t - droop * t * t);
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.95)), 0.7);
    const tw = twist * t;
    const sd = side.clone().multiplyScalar(Math.cos(tw)).add(V(0, Math.sin(tw), 0));
    const up = V(0, 1, 0).addScaledVector(dir, -0.2 * (rise - 2 * droop * t)).normalize();
    const v = uvr.v0 + (uvr.v1 - uvr.v0) * t;
    const k = col * (0.75 + 0.25 * t);
    const wi = wind * t * t;
    m.vert(spine.clone().addScaledVector(sd, -w).addScaledVector(up, -fold * w), up, uvr.u0, v, k, wi);
    m.vert(spine.clone().addScaledVector(up, fold * w * 0.5), up, (uvr.u0 + uvr.u1) / 2, v, k * 1.05, wi);
    m.vert(spine.clone().addScaledVector(sd, w).addScaledVector(up, -fold * w), up, uvr.u1, v, k, wi);
  }
  for (let i = 0; i < segs; i++) {
    const a = base + i * 3;
    m.quad(a, a + 3, a + 4, a + 1);
    m.quad(a + 1, a + 4, a + 5, a + 2);
  }
}

// ---------------------------------------------------------------------------------------------
// Species. Each returns { trunk?: geometry, leaves?: geometry, height, radius }.
// ---------------------------------------------------------------------------------------------
export function coconutPalm(seed, H = 10, lean = 2.6) {
  const r = mulberry32(seed);
  const trunk = new Mesher();
  const top = V(0, H, -lean);
  const pts = [V(0, 0, 0), V(0, H * 0.3, -lean * 0.06), V(0, H * 0.62, -lean * 0.3), V(0, H * 0.86, -lean * 0.65), top];
  tube(trunk, pts, (t) => (t < 0.05 ? 0.32 - t * 2 : 0.22 - t * 0.07), 7, 10, (t) => 0.5 * t * t, (t) => [0.62 + 0.2 * t, 0.56 + 0.18 * t, 0.48 + 0.14 * t]);
  const leaves = new Mesher();
  const fr = atlasUV('frond');
  const nF = 11;
  for (let i = 0; i < nF; i++) {
    const a = (i / nF) * Math.PI * 2 + r() * 0.3;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const upper = i % 3 === 0;
    ribbon(leaves, top.clone().add(V(0, 0.1, 0)), dir, 4.2 + r() * 1.0, 0.8, upper ? 0.75 : 0.45, upper ? 1.05 : 1.15, fr, 6, 0.9, { fold: 0.25, col: 1.15 + r() * 0.2 });
  }
  // Coconuts.
  const cu = atlasUV('coconut');
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const c = top.clone().add(V(Math.cos(a) * 0.32, -0.35 - (k % 2) * 0.12, Math.sin(a) * 0.32));
    const sg = new THREE.SphereGeometry(0.17, 6, 4);
    const P = sg.attributes.position, N = sg.attributes.normal;
    const base = leaves.p.length / 3;
    for (let i = 0; i < P.count; i++) leaves.vert(V(P.getX(i) + c.x, P.getY(i) + c.y, P.getZ(i) + c.z), V(N.getX(i), N.getY(i), N.getZ(i)), (cu.u0 + cu.u1) / 2, (cu.v0 + cu.v1) / 2, 0.9, 0.4);
    const ix = sg.index.array;
    for (let i = 0; i < ix.length; i += 3) leaves.tri(base + ix[i], base + ix[i + 1], base + ix[i + 2]);
  }
  return { trunk: trunk.build(), leaves: leaves.build(), height: H + 1, radius: 5.5 };
}

// Rounded tropical broadleaf: trunk + 3 limbs + card clusters.
export function broadleafTree(seed, H = 8.5, ketapang = false) {
  const r = mulberry32(seed);
  const trunk = new Mesher();
  const leaves = new Mesher();
  const lu = atlasUV(ketapang ? 'ketapang' : 'broadleaf');
  const crown = V(0, H * 0.72, 0);
  const t0 = H * (ketapang ? 0.85 : 0.42);
  const BK = [0.5, 0.44, 0.4];
  tube(trunk, [V(0, -0.3, 0), V(0.1, t0 * 0.5, 0.05), V(-0.05, t0, 0)], (t) => 0.32 - t * 0.12 + (t < 0.08 ? (0.08 - t) * 2.2 : 0), 7, 6, (t) => 0.08 * t, BK);
  const clusters = [];
  if (ketapang) {
    // Pagoda tiers of horizontal limbs.
    const tiers = [[H * 0.42, 3.6, 5], [H * 0.62, 2.8, 5], [H * 0.82, 1.9, 4]];
    for (const [y, L, n] of tiers) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.5;
        const end = V(Math.cos(a) * L, y + 0.4, Math.sin(a) * L);
        tube(trunk, [V(0, y - 0.2, 0), V(Math.cos(a) * L * 0.5, y + 0.15, Math.sin(a) * L * 0.5), end], (t) => 0.11 - t * 0.07, 5, 4, (t) => 0.15 + 0.2 * t, BK);
        clusters.push({ c: end.clone().add(V(0, 0.3, 0)), rx: 1.7, ry: 0.6, n: 7 });
        clusters.push({ c: V(Math.cos(a) * L * 0.55, y + 0.45, Math.sin(a) * L * 0.55), rx: 1.2, ry: 0.5, n: 3 });
      }
    }
  } else {
    const n = 4 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.8;
      const L = 1.8 + r() * 1.3;
      const end = V(Math.cos(a) * L, t0 + 1.5 + r() * 1.8, Math.sin(a) * L);
      tube(trunk, [V(0, t0 - 0.3, 0), V(Math.cos(a) * L * 0.4, t0 + 0.8, Math.sin(a) * L * 0.4), end], (t) => 0.17 - t * 0.1, 5, 4, (t) => 0.1 + 0.2 * t, BK);
      clusters.push({ c: end.clone().add(V(0, 0.9, 0)), rx: 2.1 + r() * 0.6, ry: 1.6, n: 13 });
    }
    clusters.push({ c: crown.clone().add(V(0, 1.6, 0)), rx: 2.6, ry: 1.8, n: 14 });
  }
  const cc = V(0, ketapang ? H * 0.62 : t0 + 2.2, 0);
  for (const cl of clusters) {
    for (let k = 0; k < cl.n; k++) {
      const th = r() * Math.PI * 2, ph = Math.acos(1 - 2 * r());
      const dirv = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
      const c = cl.c.clone().add(V(dirv.x * cl.rx * 0.7, dirv.y * cl.ry * 0.7, dirv.z * cl.rx * 0.7));
      const nrm = c.clone().sub(cc).normalize().lerp(dirv, 0.5).normalize();
      // Card orientation: roughly facing outward, random roll.
      const fwd = dirv.clone();
      let right = V(-fwd.z, 0, fwd.x);
      if (right.lengthSq() < 0.01) right = V(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(fwd, right).normalize();
      const roll = r() * Math.PI * 2;
      const R2 = right.clone().multiplyScalar(Math.cos(roll)).addScaledVector(up, Math.sin(roll));
      const U2 = up.clone().multiplyScalar(Math.cos(roll)).addScaledVector(right, -Math.sin(roll));
      const s = (ketapang ? 1.2 : 1.25) + r() * 0.5;
      if (ketapang) { R2.y *= 0.65; U2.y *= 0.65; }
      const ao = 0.62 + 0.45 * Math.max(0, (c.y - cc.y + 2) / 5);
      card(leaves, c, R2.multiplyScalar(s), U2.multiplyScalar(s), lu, nrm, Math.min(1.15, ao), 0.25, 0.4);
    }
  }
  return { trunk: trunk.build(), leaves: leaves.build(), height: H + 2.5, radius: ketapang ? 4.5 : 4 };
}

// Banana plant: pseudostem + arching paddle leaves (single foliage geometry).
export function bananaPlant(seed) {
  const r = mulberry32(seed);
  const m = new Mesher();
  const su = atlasUV('stem');
  const H = 1.9 + r() * 0.6;
  tube(m, [V(0, -0.1, 0), V(0.02, H * 0.5, 0), V(0, H, 0.02)], (t) => 0.13 - t * 0.04, 6, 3, (t) => 0.06 * t, 0.9, 0.0001);
  // Map the stem to the solid stem swatch.
  const P = m.uv;
  for (let i = 0; i < P.length; i += 2) { P[i] = (su.u0 + su.u1) / 2; P[i + 1] = (su.v0 + su.v1) / 2; }
  const bu = atlasUV('banana');
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    ribbon(m, V(0, H - 0.05, 0), dir, 1.7 + r() * 0.5, 0.36, 1.2, 1.25 + r() * 0.3, bu, 5, 0.35, { fold: 0.1, twist: r() * 0.5 - 0.25 });
  }
  return { leaves: m.build(), height: H + 1.2, radius: 2 };
}

export function fern(seed) {
  const r = mulberry32(seed);
  const m = new Mesher();
  const fu = atlasUV('fern');
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.3;
    ribbon(m, V(0, 0.05, 0), V(Math.cos(a), 0, Math.sin(a)), 0.85 + r() * 0.3, 0.2, 1.0, 1.1, fu, 4, 0.12, { fold: 0.15 });
  }
  return { leaves: m.build(), height: 0.9, radius: 1 };
}

// Low shrub: squashed blob of cards.
export function shrub(seed) {
  const r = mulberry32(seed);
  const m = new Mesher();
  const su = atlasUV('shrub');
  const cc = V(0, 0.55, 0);
  for (let k = 0; k < 9; k++) {
    const th = r() * Math.PI * 2, ph = Math.acos(1 - 1.6 * r());
    const d = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    const c = cc.clone().add(V(d.x * 0.6, d.y * 0.35, d.z * 0.6));
    let right = V(-d.z, 0, d.x); if (right.lengthSq() < 0.01) right = V(1, 0, 0); right.normalize();
    const up = new THREE.Vector3().crossVectors(d, right).normalize();
    card(m, c, right.multiplyScalar(0.7), up.multiplyScalar(0.7), su, d, 0.8 + 0.3 * d.y, 0.05, 0.12);
  }
  return { leaves: m.build(), height: 1.3, radius: 1.2 };
}

// Grass tuft / reeds: crossed vertical cards with up-facing normals.
export function tuft(name, w, h, n = 3, seed = 1) {
  const r = mulberry32(seed);
  const m = new Mesher();
  const gu = atlasUV(name);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI + r() * 0.3;
    const right = V(Math.cos(a) * w / 2, 0, Math.sin(a) * w / 2);
    card(m, V(0, h / 2 - 0.02, 0), right, V(0, h / 2, 0), gu, V(0, 1, 0), 1, 0, h * 0.25);
  }
  return { leaves: m.build(), height: h, radius: w / 2 };
}

export function bambooClump(seed) {
  const r = mulberry32(seed);
  const culms = new Mesher();
  const leaves = new Mesher();
  const bu = atlasUV('bamboo');
  const n = 13 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.8;
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
    const H = 7 + r() * 4.5, out = 1.2 + r() * 2.6;
    const ox = Math.cos(a) * out, oz = Math.sin(a) * out;
    const rr = 0.055 + r() * 0.035;
    const pts = [V(bx, -0.2, bz), V(bx + ox * 0.08, H * 0.4, bz + oz * 0.08), V(bx + ox * 0.45, H * 0.8, bz + oz * 0.45), V(bx + ox, H, bz + oz)];
    tube(culms, pts, (t) => rr * (1 - t * 0.45), 5, 6, (t) => 0.9 * t * t, (t) => 0.8 + 0.2 * t);
    const curve = new THREE.CatmullRomCurve3(pts);
    for (let k = 0; k < 5; k++) {
      const t = 0.5 + k * 0.1;
      const p = curve.getPointAt(t);
      const s = k % 2 ? 1 : -1;
      const right = V(-oz, 0, ox).normalize().multiplyScalar(0.55 * s);
      card(leaves, p.clone().add(V(right.x * 0.8, -0.35, right.z * 0.8)), right, V(0, 0.55, 0), bu, V(Math.cos(a), 0.6, Math.sin(a)).normalize(), 0.85 + 0.2 * t, 0.9 * t * t, 0.9 * t * t + 0.12);
    }
  }
  return { trunk: culms.build(), leaves: leaves.build(), height: 11, radius: 3.5 };
}

export function kambojaTree(seed) {
  const r = mulberry32(seed);
  const trunk = new Mesher();
  const leaves = new Mesher();
  const ku = atlasUV('kamboja');
  const tips = [];
  const KB = [0.62, 0.58, 0.52];
  tube(trunk, [V(0, -0.2, 0), V(0.1, 0.8, 0), V(0, 1.3, 0.1)], (t) => 0.16 - t * 0.04, 6, 4, () => 0.02, KB);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r() * 0.6;
    const L = 1.0 + r() * 0.8;
    const mid = V(Math.cos(a) * L * 0.5, 1.9 + r() * 0.4, Math.sin(a) * L * 0.5);
    const end = V(Math.cos(a) * L, 2.5 + r() * 0.7, Math.sin(a) * L);
    tube(trunk, [V(0, 1.2, 0), mid, end], (t) => 0.1 - t * 0.05, 5, 4, (t) => 0.05 + 0.1 * t, KB);
    tips.push(end);
    tips.push(mid.clone().lerp(end, 0.5).add(V(0, 0.15, 0)));
  }
  const fu = atlasUV('flowers');
  for (const tp of tips) {
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI;
      const sz = 0.75 + r() * 0.25;
      card(leaves, tp.clone().add(V(0, 0.1 + k * 0.12, 0)), V(Math.cos(a) * sz, 0.12, Math.sin(a) * sz), V(-Math.sin(a) * sz, 0.3, Math.cos(a) * sz), ku, V(0, 1, 0), 1.1, 0.12, 0.2);
    }
    const a = r() * Math.PI;
    card(leaves, tp.clone().add(V(0, 0.45, 0)), V(Math.cos(a) * 0.45, 0.0, Math.sin(a) * 0.45), V(-Math.sin(a) * 0.3, 0.32, Math.cos(a) * 0.3), fu, V(0, 1, 0), 1.2, 0.15, 0.22);
  }
  return { trunk: trunk.build(), leaves: leaves.build(), height: 3.6, radius: 2 };
}

// The great beringin: buttressed multi-stem trunk, wide limbs, dome canopy, hanging roots.
export function beringin(seed) {
  const r = mulberry32(seed);
  const trunk = new Mesher();
  const leaves = new Mesher();
  const lu = atlasUV('banyan');
  // Fused stems twisting around the axis.
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const rad = 1.5 + r() * 0.5;
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5, tw = a + t * 0.9;
      const rr = rad * (1.25 - t * 0.55) + (k === 0 ? 0.9 : 0);
      pts.push(V(Math.cos(tw) * rr, -0.4 + t * 7.2, Math.sin(tw) * rr));
    }
    tube(trunk, pts, (t) => 0.55 - t * 0.2, 6, 8, (t) => 0.02 * t, [0.48, 0.44, 0.4]);
  }
  // Buttress roots snaking over the ground.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r() * 0.3;
    const L = 3 + r() * 3;
    tube(trunk, [V(Math.cos(a) * 1.6, 0.9, Math.sin(a) * 1.6), V(Math.cos(a) * (1.6 + L * 0.5), 0.25, Math.sin(a) * (1.6 + L * 0.5)), V(Math.cos(a) * (1.6 + L), -0.2, Math.sin(a) * (1.6 + L))], (t) => 0.42 - t * 0.3, 5, 5, () => 0, [0.42, 0.38, 0.34]);
  }
  // Limbs.
  const limbEnds = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r() * 0.4;
    const L = 7 + r() * 4.5;
    const end = V(Math.cos(a) * L, 9 + r() * 4, Math.sin(a) * L);
    const mid = V(Math.cos(a) * L * 0.45, 8 + r() * 1.5, Math.sin(a) * L * 0.45);
    tube(trunk, [V(0, 6.2, 0), mid, end], (t) => 0.55 - t * 0.38, 6, 7, (t) => 0.05 + 0.25 * t, [0.48, 0.44, 0.4]);
    limbEnds.push({ a, L, mid, end });
  }
  // Hanging aerial roots.
  for (const le of limbEnds) {
    for (let k = 0; k < 5; k++) {
      const t = 0.3 + r() * 0.65;
      const p = le.mid.clone().lerp(le.end, t);
      const reach = r() < 0.4 ? p.y + 0.4 : 2 + r() * 5;
      tube(trunk, [p, p.clone().add(V(r() * 0.3 - 0.15, -reach * 0.5, r() * 0.3 - 0.15)), p.clone().add(V(r() * 0.4 - 0.2, -reach, r() * 0.4 - 0.2))], (t2) => 0.05 + (1 - t2) * 0.03, 3, 3, (t2) => 0.25 * t2, [0.55, 0.48, 0.4]);
    }
  }
  // Canopy: wide dome of dense cards.
  const cc = V(0, 10, 0);
  for (let k = 0; k < 170; k++) {
    const th = r() * Math.PI * 2, rr = Math.sqrt(r());
    const R = 13.5 * rr;
    const yy = 11.5 + Math.sqrt(Math.max(0, 1 - rr * rr)) * 4.5 - rr * 1.5 + (r() - 0.5) * 1.5;
    const c = V(Math.cos(th) * R, yy, Math.sin(th) * R);
    const d = c.clone().sub(cc).normalize();
    let right = V(-d.z, 0, d.x); if (right.lengthSq() < 0.01) right = V(1, 0, 0); right.normalize();
    const up = new THREE.Vector3().crossVectors(d, right).normalize();
    const roll = r() * Math.PI * 2;
    const R2 = right.clone().multiplyScalar(Math.cos(roll)).addScaledVector(up, Math.sin(roll));
    const U2 = up.clone().multiplyScalar(Math.cos(roll)).addScaledVector(right, -Math.sin(roll));
    const s = 1.6 + r() * 0.8;
    const ao = 0.55 + 0.55 * Math.max(0, (yy - 9) / 7);
    card(leaves, c, R2.multiplyScalar(s), U2.multiplyScalar(s), lu, d, Math.min(1.1, ao), 0.15, 0.3);
  }
  return { trunk: trunk.build(), leaves: leaves.build(), height: 17, radius: 15 };
}

// Rock shapes for instancing (metre UVs, vertex colours with moss on top).
export function rockShape(seed, squash, rough, mossy = true) {
  const g = rockGeo(1, seed, 1, squash, rough);
  const P = g.attributes.position, N = g.attributes.normal;
  const col = new Float32Array(P.count * 3);
  const w = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) {
    let k = 0.85 + 0.15 * Math.sin(P.getX(i) * 3.1 + P.getZ(i) * 2.3);
    let rr = k, gg = k * 0.97, bb = k * 0.9;
    if (mossy && N.getY(i) > 0.55) { rr = 0.42; gg = 0.52; bb = 0.3; }
    if (P.getY(i) < -0.2) { rr *= 0.7; gg *= 0.7; bb *= 0.7; }
    col[i * 3] = rr; col[i * 3 + 1] = gg; col[i * 3 + 2] = bb;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aWind', new THREE.BufferAttribute(w, 1));
  return g;
}

export { mergeGeometries };
