// Procedural character parts: skeleton layout, body geometry (one skinned mesh per character),
// batik / sarung canvas textures, the hanging oil lantern and small props.
// Owner: player. Used by character.js only.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------------------------
export const BONE = {
  root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5, eyes: 6, hair: 7,
  shL: 8, elL: 9, haL: 10, shR: 11, elR: 12, haR: 13,
  thL: 14, knL: 15, ftL: 16, thR: 17, knR: 18, ftR: 19,
};
export const BONE_COUNT = 20;
const PARENT = [-1, 0, 1, 2, 3, 4, 5, 5, 3, 8, 9, 3, 11, 12, 1, 14, 15, 1, 17, 18];

// Body builds. width: torso, limb: limb thickness, leg: leg length, cycle: stride cadence.
export const BUILDS = {
  normal: { scale: 1, width: 1, limb: 1, belly: 0, head: 1, hunch: 0, cycle: 1, leg: 1 },
  slim: { scale: 1.01, width: 0.87, limb: 0.84, belly: 0, head: 0.98, hunch: 0, cycle: 1.05, leg: 1.03 },
  stout: { scale: 0.97, width: 1.2, limb: 1.24, belly: 0.05, head: 1.03, hunch: 0, cycle: 0.9, leg: 0.95 },
  old: { scale: 0.93, width: 0.95, limb: 0.9, belly: 0.02, head: 1.05, hunch: 1, cycle: 0.7, leg: 0.96 },
};

export const HEAD_R = 0.178;

// Local bind offsets of every bone (relative to its parent), +y up, model faces -z.
export function bindLayout(b) {
  const w = b.width;
  const thigh = 0.42 * b.leg, shin = 0.385 * b.leg;
  const hipY = 0.08 + shin + thigh + 0.03;
  const hr = HEAD_R * b.head;
  return {
    hipY, thigh, shin, hr,
    offsets: [
      [0, 0, 0], // root
      [0, hipY, 0], // hips
      [0, 0.1, 0], // spine
      [0, 0.2, 0], // chest
      [0, 0.2, 0], // neck
      [0, 0.06, 0], // head (skull base)
      [0, 0.145 * b.head, -hr * 0.84], // eyes (face surface, blinks by scale.y)
      [0, 0.2 * b.head, 0.075], // hair (long hair / headscarf tail swing)
      [-0.198 * w, 0.15, 0], [0, -0.265, 0], [0, -0.235, 0], // left arm (-x is the character's left)
      [0.198 * w, 0.15, 0], [0, -0.265, 0], [0, -0.235, 0], // right arm
      [-0.1 * w, -0.03, 0], [0, -thigh, 0], [0, -shin, 0], // left leg
      [0.1 * w, -0.03, 0], [0, -thigh, 0], [0, -shin, 0], // right leg
    ],
  };
}

export function createBones(layout) {
  const bones = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    const b = new THREE.Bone();
    b.name = Object.keys(BONE)[i];
    const o = layout.offsets[i];
    b.position.set(o[0], o[1], o[2]);
    bones.push(b);
    if (PARENT[i] >= 0) bones[PARENT[i]].add(b);
  }
  bones[0].updateMatrixWorld(true);
  return bones;
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------
const V2 = (x, y) => new THREE.Vector2(Math.max(1e-4, x), y);
const smooth01 = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

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
export function lathe(profile, seg = 12) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => V2(r, y)), seg);
}

function headGeometry(r) {
  const g = new THREE.SphereGeometry(r, 20, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ny = y / r;
    if (ny < 0) {
      const k = Math.pow(-ny, 1.35);
      x *= 1 - 0.24 * k; // chin taper
      z *= 1 - 0.1 * k;
      if (z < 0) z -= 0.012 * k * (1 - Math.abs(x) / r); // soft chin forward
    } else {
      x *= 1 - 0.04 * ny; // slightly rounder crown
    }
    if (z < 0) z *= 0.93; // flatter face plane
    else z *= 1.06; // fuller back of skull
    x *= 0.95;
    y *= 1.04;
    p.setXYZ(i, x, y, z);
  }
  return g;
}

// Front surface z of the (deformed) head at local (x, y) relative to the head centre.
function faceZ(r, x, y) {
  const xs = x / 0.95, ys = y / 1.04;
  const d = Math.max(0, r * r - xs * xs - ys * ys);
  return -Math.sqrt(d) * 0.93;
}

// Canonical part builder: geometry authored in bone-local space, merged into one skinned mesh.
class Builder {
  constructor(bones) {
    this.bones = bones;
    this.geos = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  // o: { at:[x,y,z], rot:[x,y,z], scale:[x,y,z]|number, weights(x,y,z)->[[bone,w],...],
  //      pattern: bool (keep uv, map into the pattern region), shade: number, colorFn(x,y,z)->Color }
  add(geo, bone, color, o = {}) {
    let g = geo;
    if (o.pattern) {
      g = g.index ? g : mergeVertices(g);
    } else {
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      g = mergeVertices(g, 1e-5);
      g.computeVertexNormals();
    }
    if (o.at || o.rot || o.scale || o.quat) {
      const s = o.scale === undefined ? [1, 1, 1] : typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : o.scale;
      if (o.quat) this._q.copy(o.quat);
      else { this._e.set(...(o.rot || [0, 0, 0])); this._q.setFromEuler(this._e); }
      this._m.compose(this._v.set(...(o.at || [0, 0, 0])), this._q, this._s.set(s[0], s[1], s[2]));
      g.applyMatrix4(this._m);
    }
    g.applyMatrix4(this.bones[bone].matrixWorld);
    const pos = g.attributes.position;
    const n = pos.count;

    // UVs: plain parts sample the white strip of the atlas; patterned parts squeeze into [0, 0.75].
    if (o.pattern) {
      const uv = g.attributes.uv;
      for (let i = 0; i < n; i++) uv.setXY(i, uv.getX(i) * 0.75, uv.getY(i) * (o.vRepeat || 1) % 1.0001);
    } else {
      const uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { uv[i * 2] = 0.9; uv[i * 2 + 1] = 0.5; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }

    // Vertex colour with soft height shading (darker toward the feet, a cheap AO feel).
    const base = new THREE.Color(color);
    const c = new THREE.Color();
    const col = new Float32Array(n * 3);
    const shade = o.shade ?? 1;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (o.colorFn) c.copy(o.colorFn(x, y, z, base)); else c.copy(base);
      const s = shade * (o.flat ? 1 : 0.8 + 0.2 * smooth01(0.05, 1.5, y));
      col[i * 3] = c.r * s; col[i * 3 + 1] = c.g * s; col[i * 3 + 2] = c.b * s;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));

    // Skin weights: rigid by default, or blended through o.weights (model-space bind position).
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      if (o.weights) {
        const ws = o.weights(pos.getX(i), pos.getY(i), pos.getZ(i));
        let sum = 0;
        for (let k = 0; k < Math.min(4, ws.length); k++) sum += ws[k][1];
        for (let k = 0; k < Math.min(4, ws.length); k++) {
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
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    }
    this.geos.push(g);
  }

  build() {
    const merged = mergeGeometries(this.geos, false);
    for (const g of this.geos) g.dispose();
    return merged;
  }
}

// ---------------------------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------------------------
// Builds the merged skinned body geometry for opts (see character.js for the option list).
export function buildBodyGeometry(bones, layout, b, look) {
  const B = new Builder(bones);
  const W = b.width, Lk = b.limb;
  const hr = layout.hr;
  const hipY = layout.hipY;
  const skin = look.skin, top = look.top, pants = look.pants, hair = look.hair;
  const skinDark = new THREE.Color(skin).multiplyScalar(0.72);
  const lip = new THREE.Color(skin).lerp(new THREE.Color(0x7a2f2a), 0.35);
  const dark = 0x15100d;

  // ---- Pelvis (pants colour; mostly hidden under the sarong) ----
  B.add(lathe([[0.02, -0.17], [0.1, -0.15], [0.135 * W, -0.09], [0.142 * W, -0.02], [0.138 * W, 0.05]], 12), BONE.hips, pants, {
    scale: [1, 1, 0.78],
  });

  // ---- Torso: waist to neck base, blended over hips / spine / chest ----
  const torsoW = (y) => {
    const wHip = 1 - smooth01(hipY + 0.0, hipY + 0.1, y);
    const wChest = smooth01(hipY + 0.17, hipY + 0.36, y);
    const wSpine = Math.max(0, 1 - wHip - wChest);
    return [[BONE.hips, wHip], [BONE.spine, wSpine], [BONE.chest, wChest]];
  };
  const bel = b.belly;
  const torsoProfile = [
    [0.136 * W + bel * 0.4, -0.02], [0.137 * W + bel, 0.08], [0.152 * W + bel, 0.17],
    [0.172 * W + bel * 0.4, 0.29], [0.178 * W, 0.38], [0.168 * W, 0.45], [0.125 * W, 0.5], [0.06, 0.525], [0.02, 0.535],
  ];
  B.add(lathe(torsoProfile, 16), BONE.hips, top, {
    at: [0, 0.0, 0], scale: [1, 1, 0.76], weights: torsoW,
    colorFn: look.topFn,
  });
  // Belly bulge for stout/old builds (front only).
  if (bel > 0.01) {
    B.add(new THREE.SphereGeometry(0.13 * W, 12, 8), BONE.spine, top, { at: [0, 0.02, -0.04 - bel * 0.6], scale: [1, 0.9, 0.75] });
  }
  // Collar (darker band around the neck opening).
  B.add(new THREE.TorusGeometry(0.06, 0.016, 5, 14), BONE.chest, new THREE.Color(top).multiplyScalar(0.62), {
    at: [0, 0.205, 0.0], rot: [Math.PI / 2 + 0.25, 0, 0], scale: [1.05, 1, 0.9],
  });

  // ---- Neck + head ----
  B.add(new THREE.CylinderGeometry(0.048, 0.054, 0.13, 10), BONE.neck, skin, { at: [0, 0.045, 0.005] });
  const headC = [0, 0.148 * b.head, -0.004];
  B.add(headGeometry(hr), BONE.head, skin, { at: headC });
  // Ears.
  for (const sx of [-1, 1]) {
    B.add(new THREE.SphereGeometry(0.03, 8, 6), BONE.head, skin, { at: [sx * hr * 0.93, headC[1] - 0.005, headC[2] + 0.012], scale: [0.55, 1.25, 0.85] });
  }
  // Nose and mouth.
  B.add(new THREE.SphereGeometry(0.019, 8, 6), BONE.head, new THREE.Color(skin).multiplyScalar(0.93), {
    at: [0, headC[1] - 0.028, headC[2] + faceZ(hr, 0, -0.028) + 0.001], scale: [1, 0.85, 0.9],
  });
  B.add(new THREE.SphereGeometry(0.02, 8, 4), BONE.head, lip, {
    at: [0, headC[1] - 0.078, headC[2] + faceZ(hr, 0, -0.078) + 0.004], scale: [1.2, 0.3, 0.45],
  });
  // Brows (slightly angled, heroic).
  const browY = 0.042 * b.head;
  for (const sx of [-1, 1]) {
    const bx = sx * 0.06;
    B.add(new THREE.BoxGeometry(0.052, 0.012, 0.014), BONE.head, look.brow, {
      at: [bx, headC[1] + browY + (look.old ? -0.004 : 0), headC[2] + faceZ(hr, bx, browY) + 0.002],
      rot: [0.15, sx * 0.25, sx * (look.old ? -0.2 : 0.17)],
    });
  }
  // Eyes on their own bone (blink = scale.y). Dark ovals with a tiny catch-light.
  for (const sx of [-1, 1]) {
    const ex = sx * 0.058;
    const ez = headC[2] + faceZ(hr, ex, -0.005) + hr * 0.84;
    B.add(new THREE.SphereGeometry(0.02, 10, 8), BONE.eyes, dark, { at: [ex, 0, ez + 0.001], scale: [1.05, 1.5, 0.55], flat: true });
    B.add(new THREE.SphereGeometry(0.0062, 6, 4), BONE.eyes, 0xfff6e8, { at: [ex + 0.007, 0.01, ez - 0.009], flat: true, shade: 1.4 });
  }

  // ---- Hair / headwear ----
  buildHair(B, look, hr, headC, b);

  // ---- Arms ----
  for (const side of [-1, 1]) {
    const sh = side < 0 ? BONE.shL : BONE.shR;
    const el = side < 0 ? BONE.elL : BONE.elR;
    const ha = side < 0 ? BONE.haL : BONE.haR;
    // Upper arm: skin under a sleeve.
    B.add(taper(0.058 * Lk, 0.047 * Lk, 0.265, 9, 3), sh, look.sleeves === 'long' ? top : skin);
    if (look.sleeves !== 'none') {
      B.add(lathe([[0.062 * Lk, -0.135], [0.066 * Lk, -0.118], [0.066 * Lk, -0.02], [0.058 * Lk, 0.04], [0.03 * Lk, 0.072], [0.005, 0.078]], 10), sh, top, {
        colorFn: look.topFn,
      });
    }
    // Forearm.
    B.add(taper(0.048 * Lk, 0.037 * Lk, 0.235, 9, 3), el, look.sleeves === 'long' ? top : skin);
    if (look.sleeves === 'long') {
      B.add(new THREE.TorusGeometry(0.038 * Lk, 0.012, 4, 10), el, new THREE.Color(top).multiplyScalar(0.7), { at: [0, -0.215, 0], rot: [Math.PI / 2, 0, 0] });
    }
    // Hand (mitten + thumb), a touch oversized for readability.
    B.add(new THREE.SphereGeometry(0.05, 10, 8), ha, skin, { at: [0, -0.055, 0], scale: [0.84 * Lk, 1.2, 0.66 * Lk] });
    B.add(new THREE.SphereGeometry(0.022, 6, 5), ha, skin, { at: [-side * 0.008, -0.03, -0.034], scale: [0.85, 1.5, 0.85], rot: [0.5, 0, 0] });
  }

  // ---- Legs ----
  for (const side of [-1, 1]) {
    const th = side < 0 ? BONE.thL : BONE.thR;
    const kn = side < 0 ? BONE.knL : BONE.knR;
    const ft = side < 0 ? BONE.ftL : BONE.ftR;
    B.add(taper(0.09 * Lk, 0.066 * Lk, layout.thigh, 10, 3), th, pants);
    const shinLen = layout.shin;
    const cuff = look.pantsLength; // fraction of the shin covered by trousers
    if (cuff > 0.05) {
      B.add(lathe([[0.07 * Lk, -shinLen * cuff], [0.072 * Lk, -shinLen * cuff + 0.03], [0.07 * Lk, -0.02], [0.058, 0.05], [0.01, 0.07]], 10), kn, pants);
    }
    B.add(taper(0.064 * Lk, 0.049 * Lk, shinLen, 9, 3), kn, cuff > 0.97 ? pants : skin);
    // Foot (toes toward -z) and a thin sandal sole.
    B.add(new THREE.SphereGeometry(0.064, 10, 7), ft, skin, { at: [0, -0.03, -0.05], scale: [0.98 * Lk, 0.64, 1.95] });
    B.add(new THREE.BoxGeometry(0.112 * Lk, 0.016, 0.26), ft, look.sandal, { at: [0, -0.071, -0.055], flat: true, shade: 0.6 });
  }

  // ---- Bottom: sarung (to the knee), kain/jarik (to the ankle) or nothing ----
  if (look.bottomStyle !== 'celana') {
    const long = look.bottomStyle === 'kain';
    const topY = hipY + 0.09;
    const hemY = long ? 0.13 : 0.5 * b.leg;
    const rTop = 0.156 * W + bel * 0.5, rHem = long ? 0.2 * W + 0.02 : 0.215 * W + 0.02;
    const H = topY - hemY;
    const prof = [];
    const steps = 7;
    prof.push([rHem - 0.012, -H]);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps; // 0 at hem, 1 at waist
      const r = rHem + (rTop - rHem) * Math.pow(t, long ? 1.5 : 1.2) + (long ? 0.018 * Math.sin(t * Math.PI) : 0.012 * Math.sin(t * Math.PI));
      prof.push([r, -H + t * H]);
    }
    prof.push([rTop - 0.03, 0.006]);
    const weights = (x, y, z) => {
      // Upper part follows the hips; lower part is dragged by the nearest thigh.
      const f = Math.pow(Math.min(1, Math.max(0, (topY - y) / H)), 1.25) * (long ? 0.8 : 0.72);
      const wl = Math.min(1, Math.max(0, 0.5 - x / (rHem * 1.2)));
      return [[BONE.hips, 1 - f], [BONE.thL, f * wl], [BONE.thR, f * (1 - wl)]];
    };
    B.add(lathe(prof, 18), BONE.hips, 0xffffff, {
      pattern: true, at: [0, topY - hipY, 0], scale: [1, 1, 0.84], weights, flat: false,
    });
    // Rolled waist band.
    B.add(new THREE.TorusGeometry(rTop * 0.98, 0.022, 5, 18), BONE.hips, look.band, {
      at: [0, topY - hipY - 0.01, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.84, 1],
    });
  } else {
    B.add(new THREE.TorusGeometry(0.14 * W, 0.02, 5, 16), BONE.hips, look.band, { at: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.78, 1] });
  }

  // ---- Udeng (batik head cloth): band across the brow, knot and two tails at the back ----
  if (look.udeng) {
    const uc = new THREE.Color(look.udeng);
    const band = (y, k, tube, col) => B.add(new THREE.TorusGeometry(hr * k, tube, 6, 24), BONE.head, col, {
      at: [headC[0], headC[1] + y, headC[2] + 0.006], rot: [Math.PI / 2 + 0.26, 0, 0], scale: [0.96, 1.06, 1.7],
    });
    band(0.072, 1.0, 0.017, uc);
    band(0.072, 1.005, 0.006, uc.clone().lerp(new THREE.Color(0xe8cf98), 0.55));
    B.add(new THREE.SphereGeometry(0.032, 8, 6), BONE.head, uc, { at: [0, headC[1] + 0.1, headC[2] + hr * 1.03], scale: [1.3, 0.95, 0.8] });
    for (const sx of [-1, 1]) {
      B.add(lathe([[0.004, -0.17], [0.02, -0.15], [0.024, -0.06], [0.018, 0.0], [0.004, 0.01]], 6), BONE.head, uc, {
        at: [sx * 0.03, headC[1] + 0.095, headC[2] + hr * 1.06], rot: [0.55, 0, sx * 0.28], scale: [1.4, 1, 0.35],
      });
    }
  }

  // ---- Kain wrapped around the neck (the trailing cloth is simulated separately) ----
  if (look.kain && !look.ghost && look.hairStyle !== 'kerudung') {
    const kc = new THREE.Color(look.kain.base);
    B.add(new THREE.TorusGeometry(0.122 * W, 0.028, 7, 22), BONE.chest, kc, {
      at: [0, 0.198, 0.012], rot: [Math.PI / 2 - 0.32, 0, 0], scale: [1.08, 0.88, 0.75],
      weights: (x, y) => [[BONE.chest, 0.85], [BONE.neck, 0.15]],
    });
    B.add(new THREE.TorusGeometry(0.124 * W, 0.008, 5, 22), BONE.chest, new THREE.Color(look.kain.accent), {
      at: [0, 0.217, 0.014], rot: [Math.PI / 2 - 0.32, 0, 0], scale: [1.07, 0.87, 1],
    });
    // Knot at the front.
    B.add(new THREE.SphereGeometry(0.04, 8, 6), BONE.chest, kc, { at: [0.04 * W, 0.14, -0.15 * W], scale: [1.1, 0.9, 0.7] });
    B.add(lathe([[0.004, -0.13], [0.025, -0.11], [0.03, -0.03], [0.02, 0.0], [0.004, 0.01]], 6), BONE.chest, kc, {
      at: [0.05 * W, 0.12, -0.155 * W], rot: [-0.12, 0, 0.18], scale: [1.3, 1, 0.4],
    });
  }

  return B.build();
}

function buildHair(B, look, hr, headC, b) {
  const hair = look.hair;
  const style = look.hairStyle;
  const [cx, cy, cz] = headC;
  const cap = (k = 1.07, tilt = 0.32, cover = 0.56) =>
    B.add(new THREE.SphereGeometry(hr * k, 18, 10, 0, Math.PI * 2, 0, Math.PI * cover), BONE.head, hair, {
      at: [cx, cy + 0.008, cz + 0.006], rot: [tilt, 0, 0], scale: [0.97, 1.05, 1.02],
    });

  if (style === 'kerudung') {
    const col = look.scarf;
    const k = 1.08;
    // Crown + a wrap that leaves the face open.
    B.add(new THREE.SphereGeometry(hr * k, 18, 6, 0, Math.PI * 2, 0, Math.PI * 0.36), BONE.head, col, { at: [cx, cy + 0.01, cz + 0.01], scale: [0.97, 1.05, 1.04] });
    const open = 0.98;
    B.add(new THREE.SphereGeometry(hr * k, 18, 10, Math.PI * 1.5 + open, Math.PI * 2 - open * 2, Math.PI * 0.36, Math.PI * 0.52), BONE.head, col, {
      at: [cx, cy + 0.01, cz + 0.01], scale: [0.97, 1.05, 1.04],
    });
    // Chin wrap.
    B.add(new THREE.TorusGeometry(hr * 0.86, 0.034, 6, 16, Math.PI), BONE.head, col, {
      at: [cx, cy + 0.005, cz + 0.005], rot: [0.32, 0, Math.PI], scale: [1.02, 1.16, 1],
    });
    // Back panel falling from the crown to the shoulder blades (sways on the hair bone).
    B.add(lathe([[0.03, -0.42], [0.12, -0.38], [0.16, -0.22], [0.165, -0.05], [0.14, 0.04], [0.05, 0.09]], 12), BONE.hair, col, {
      at: [0, -0.04, 0.035], scale: [1.08, 1, 0.42],
      weights: (x, y) => (y < 1.4 ? [[BONE.chest, 0.6], [BONE.hair, 0.4]] : [[BONE.hair, 1]]),
    });
    // Drape over shoulders and chest (follows the chest, top blended to the neck).
    B.add(lathe([[0.24 * b.width, -0.2], [0.245 * b.width, -0.16], [0.205 * b.width, -0.06], [0.14, 0.03], [0.1, 0.1], [0.075, 0.16]], 16), BONE.chest, col, {
      at: [0, 0.2, 0.0], scale: [1, 1, 0.82],
      weights: (x, y) => {
        const top = y > 1.47 ? 1 : 0;
        return [[BONE.chest, 1 - top * 0.6], [BONE.neck, top * 0.6]];
      },
    });
    return;
  }

  if (style === 'caping') {
    cap(1.06, 0.3, 0.5);
    // Conical bamboo hat.
    const straw = look.straw;
    B.add(new THREE.ConeGeometry(0.38, 0.17, 22, 1, false), BONE.head, straw, {
      at: [cx, cy + hr * 0.95 + 0.04, cz], colorFn: (x, y, z, base) => {
        const r = Math.hypot(x, z - 0.0);
        return tmpC.copy(base).multiplyScalar(0.88 + 0.12 * Math.sin(r * 90));
      },
    });
    B.add(new THREE.TorusGeometry(0.37, 0.012, 4, 26), BONE.head, new THREE.Color(straw).multiplyScalar(0.7), {
      at: [cx, cy + hr * 0.95 - 0.045, cz], rot: [Math.PI / 2, 0, 0],
    });
    return;
  }

  if (style === 'peci') {
    cap(1.04, 0.38, 0.5);
    B.add(new THREE.CylinderGeometry(hr * 0.93, hr * 0.98, 0.1, 22), BONE.head, 0x141214, {
      at: [cx, cy + hr * 0.82, cz + 0.004], rot: [-0.08, 0, 0], scale: [1, 1, 0.88],
    });
    B.add(new THREE.CylinderGeometry(hr * 0.94, hr * 0.94, 0.012, 22), BONE.head, 0x2a2224, {
      at: [cx, cy + hr * 0.82 + 0.051, cz + 0.004], rot: [-0.08, 0, 0], scale: [1, 1, 0.88],
    });
    return;
  }

  // short / bun / long: a cap shaped like a hairline, tufts that break the silhouette.
  cap(1.085, style === 'long' ? 0.24 : 0.36, style === 'long' ? 0.6 : 0.52);
  const hairR = hr * 1.07;
  const spike = (theta, phi, len, rad, sweep = 0.45, lift = 0) => {
    // Point on the hair shell (theta from the top, phi 0 = front, +phi to the right side).
    const sx = Math.sin(theta) * Math.sin(phi), sy = Math.cos(theta), sz = -Math.sin(theta) * Math.cos(phi);
    const dir = new THREE.Vector3(sx, sy + lift, sz + sweep).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    // Flattened lock (wide across, thin through) so tufts read as hair, not spikes.
    const lock = new THREE.ConeGeometry(rad, len, 7);
    lock.scale(1.35, 1, 0.6);
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), phi);
    B.add(lock, BONE.head, hair, {
      at: [cx + sx * hairR * 0.93 + dir.x * len * 0.32, cy + 0.008 + sy * hairR * 0.95 * 1.05 + dir.y * len * 0.32, cz + sz * hairR * 0.93 + dir.z * len * 0.32],
      quat: q.multiply(yaw),
    });
  };
  if (style === 'short') {
    // Messy heroic crown swept back.
    // [theta, phi, length, radius, sweep back, lift]: front/top locks flick up and back, the
    // ones at the back of the head lie down along the skull.
    const tufts = [
      [0.5, -0.75, 0.12, 0.05, 1.25, -0.1], [0.42, -0.2, 0.135, 0.055, 1.25, -0.1], [0.44, 0.35, 0.13, 0.055, 1.25, -0.1],
      [0.52, 0.9, 0.115, 0.05, 1.25, -0.1], [0.2, 0.1, 0.12, 0.06, 1.2, -0.05], [0.8, -1.35, 0.1, 0.048, 1.0, -0.5],
      [0.8, 1.35, 0.1, 0.048, 1.0, -0.5], [0.85, 2.5, 0.1, 0.05, 0.6, -1.1], [0.85, -2.5, 0.1, 0.05, 0.6, -1.1],
      [0.7, 3.14, 0.11, 0.055, 0.7, -1.0],
    ];
    for (const [th, ph, len, rad, sw, lf] of tufts) spike(th, ph, len, rad, sw, lf);
  } else {
    for (const [th, ph] of [[0.45, -0.6], [0.45, 0.0], [0.45, 0.6]]) spike(th, ph, 0.1, 0.045, 0.9, 0);
  }
  // Fringe sweeping across the forehead (over the udeng when worn).
  const fr = style === 'short' ? 4 : 3;
  for (let i = 0; i < fr; i++) {
    const t = i / (fr - 1) - 0.5;
    const ph = t * 1.2;
    const th = 0.95 + Math.abs(t) * 0.2;
    const sx = Math.sin(th) * Math.sin(ph), sy = Math.cos(th), sz = -Math.sin(th) * Math.cos(ph);
    const dir = new THREE.Vector3(sx * 0.6 + 0.35, -0.85, -0.35).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    B.add(new THREE.ConeGeometry(0.036, 0.11, 6), BONE.head, hair, {
      at: [cx + sx * hairR * 1.02 + dir.x * 0.035, cy + sy * hairR * 1.05 + 0.03, cz + sz * hairR * 1.02 - 0.012], quat: q,
    });
  }
  // Side locks.
  for (const sx of [-1, 1]) {
    B.add(new THREE.ConeGeometry(0.032, 0.1, 6), BONE.head, hair, { at: [sx * hr * 0.9, cy + 0.0, cz + 0.03], rot: [Math.PI - 0.15, 0, sx * 0.12] });
  }
  if (style === 'bun') {
    B.add(new THREE.SphereGeometry(0.075, 12, 9), BONE.head, hair, { at: [0, cy + hr * 0.62, cz + hr * 0.92], scale: [1, 0.9, 0.9] });
    B.add(new THREE.TorusGeometry(0.05, 0.011, 4, 12), BONE.head, look.accent, { at: [0, cy + hr * 0.55, cz + hr * 0.8], rot: [0.9, 0, 0] });
    // Hair stick (tusuk konde).
    B.add(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 4), BONE.head, look.accent, { at: [0, cy + hr * 0.68, cz + hr * 0.95], rot: [0, 0, 1.3] });
  }
  if (style === 'long') {
    // Back hair panel on its own bone so it can sway.
    B.add(lathe([[0.02, -0.5], [0.09, -0.46], [0.13, -0.3], [0.15, -0.1], [0.155, 0.0], [0.12, 0.08]], 12), BONE.hair, hair, {
      at: [0, -0.02, 0.04], scale: [1.05, 1, 0.42],
    });
  }
}
const tmpC = new THREE.Color();

// ---------------------------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------------------------
const texCache = new Map();

function css(c) { return '#' + new THREE.Color(c).getHexString(); }

// Batik motifs drawn on a seamless canvas. motif: 'parang' (diagonal blades) | 'kawung' (four-petal).
export function drawBatik(g, size, { base, ink, accent, motif }) {
  g.fillStyle = css(base);
  g.fillRect(0, 0, size, size);
  if (motif === 'kawung') {
    const p = size / 4;
    for (let iy = -1; iy <= 4; iy++) {
      for (let ix = -1; ix <= 4; ix++) {
        const x = ix * p + p / 2, y = iy * p + p / 2;
        // Four ellipses meeting in the middle, rotated 45 degrees.
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4;
          g.save();
          g.translate(x + Math.cos(a) * p * 0.25, y + Math.sin(a) * p * 0.25);
          g.rotate(a);
          g.beginPath();
          g.ellipse(0, 0, p * 0.24, p * 0.14, 0, 0, Math.PI * 2);
          g.fillStyle = css(ink);
          g.fill();
          g.lineWidth = p * 0.035;
          g.strokeStyle = css(accent);
          g.stroke();
          g.beginPath();
          g.ellipse(p * 0.03, 0, p * 0.09, p * 0.045, 0, 0, Math.PI * 2);
          g.fillStyle = css(base);
          g.fill();
          g.restore();
        }
        g.beginPath();
        g.arc(x, y, p * 0.05, 0, Math.PI * 2);
        g.fillStyle = css(accent);
        g.fill();
        // Isen-isen dots in the gaps.
        g.fillStyle = css(accent);
        g.globalAlpha = 0.7;
        for (const [dx, dy] of [[0.5, 0], [0, 0.5]]) {
          g.beginPath();
          g.arc(x + dx * p, y + dy * p, p * 0.028, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      }
    }
  } else {
    // Parang: diagonal bands with S-hooks (period divides the canvas so it tiles).
    const period = size / 4;
    g.save();
    for (let k = -6; k <= 10; k++) {
      const off = k * period;
      // Band.
      g.beginPath();
      g.moveTo(off, 0);
      g.lineTo(off + period * 0.42, 0);
      g.lineTo(off + period * 0.42 - size, size);
      g.lineTo(off - size, size);
      g.closePath();
      g.fillStyle = css(ink);
      g.fill();
      // Hooks along the band.
      g.strokeStyle = css(accent);
      g.lineWidth = period * 0.07;
      g.lineCap = 'round';
      const n = 8;
      for (let i = -1; i <= n; i++) {
        const t = i / n;
        const cx = off + period * 0.21 - t * size;
        const cy = t * size;
        g.beginPath();
        g.arc(cx, cy, period * 0.12, Math.PI * 0.15, Math.PI * 1.15);
        g.stroke();
        g.beginPath();
        g.arc(cx - period * 0.05, cy + period * 0.05, period * 0.045, 0, Math.PI * 2);
        g.fillStyle = css(base);
        g.fill();
      }
      // Mlinjon lozenge between bands.
      const mx = off + period * 0.71, my = period * 0.25;
      for (let i = -1; i <= 4; i++) {
        const lx = mx - (i * size) / 4, ly = my + (i * size) / 4;
        g.beginPath();
        g.moveTo(lx, ly - period * 0.09);
        g.lineTo(lx + period * 0.07, ly);
        g.lineTo(lx, ly + period * 0.09);
        g.lineTo(lx - period * 0.07, ly);
        g.closePath();
        g.fillStyle = css(accent);
        g.globalAlpha = 0.85;
        g.fill();
        g.globalAlpha = 1;
      }
    }
    g.restore();
  }
  // Soft wax-crackle speckle so it reads as cloth, not vector art.
  const rnd = mulberry(size * 13 + (motif === 'kawung' ? 7 : 3));
  g.globalAlpha = 0.07;
  for (let i = 0; i < size * 3; i++) {
    g.fillStyle = rnd() < 0.5 ? '#000' : '#fff';
    g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1);
  }
  g.globalAlpha = 1;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finishTexture(canvas, repeat = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// Seamless batik texture for the kain (shawl).
export function batikTexture(colors) {
  const key = 'batik|' + [colors.base, colors.ink, colors.accent, colors.motif].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  drawBatik(g, size, colors);
  // Border stripes (pinggiran) along the long edges.
  g.fillStyle = css(colors.ink);
  g.fillRect(0, 0, 10, size);
  g.fillRect(size - 10, 0, 10, size);
  g.fillStyle = css(colors.accent);
  g.fillRect(10, 0, 3, size);
  g.fillRect(size - 13, 0, 3, size);
  const tex = finishTexture(c);
  texCache.set(key, tex);
  return tex;
}

// Body atlas: u in [0, 0.75) holds the bottom cloth pattern (tiles across the seam), u > 0.8 is
// plain white (vertex colours do the rest).
export function bodyAtlas(look) {
  const key = 'atlas|' + [look.bottomStyle, css(look.bottom), css(look.bottomInk), css(look.bottomAccent), look.bottomMotif].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const W = 256, H = 256, PW = 192;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  const pc = document.createElement('canvas');
  pc.width = PW; pc.height = H;
  const pg = pc.getContext('2d');
  if (look.bottomMotif === 'kotak') {
    // Sarung kotak: woven plaid with a wide "kepala" band.
    const base = new THREE.Color(look.bottom);
    const darker = base.clone().multiplyScalar(0.6);
    const light = base.clone().lerp(new THREE.Color(look.bottomAccent), 0.45);
    pg.fillStyle = css(base);
    pg.fillRect(0, 0, PW, H);
    const cell = 32, cellY = 84; // the hem-to-waist v range is ~2.6x denser than u
    pg.globalAlpha = 0.55;
    for (let x = 0; x < PW; x += cell) {
      pg.fillStyle = css(darker); pg.fillRect(x, 0, 10, H);
      pg.fillStyle = css(light); pg.fillRect(x + 14, 0, 2, H);
    }
    for (let y = 6; y < H; y += cellY) {
      pg.fillStyle = css(darker); pg.fillRect(0, y, PW, 26);
      pg.fillStyle = css(light); pg.fillRect(0, y + 36, PW, 5);
    }
    pg.globalAlpha = 1;
    // Kepala band (lighter panel with the accent colour).
    pg.fillStyle = css(new THREE.Color(look.bottomInk));
    pg.globalAlpha = 0.5;
    pg.fillRect(PW * 0.38, 0, PW * 0.24, H);
    pg.globalAlpha = 1;
    pg.fillStyle = css(look.bottomAccent);
    for (let y = 4; y < H; y += 40) { pg.fillRect(PW * 0.38 + 6, y, PW * 0.24 - 12, 7); }
    // Weave noise.
    const rnd = mulberry(91);
    pg.globalAlpha = 0.08;
    for (let i = 0; i < 900; i++) {
      pg.fillStyle = rnd() < 0.5 ? '#000' : '#fff';
      pg.fillRect(rnd() * PW, rnd() * H, 2, 1);
    }
    pg.globalAlpha = 1;
  } else {
    // Batik jarik. Drawn on a square then tiled across the 192 px strip (period 64 px).
    const sq = document.createElement('canvas');
    sq.width = sq.height = 128;
    drawBatik(sq.getContext('2d'), 128, { base: look.bottom, ink: look.bottomInk, accent: look.bottomAccent, motif: look.bottomMotif });
    for (let x = 0; x < PW; x += 64) for (let y = 0; y < H; y += 64) pg.drawImage(sq, 0, 0, 64, 64, x, y, 64, 64);
    // Hem border.
    pg.fillStyle = css(look.bottomInk);
    pg.fillRect(0, 0, PW, 8);
    pg.fillStyle = css(look.bottomAccent);
    pg.fillRect(0, 8, PW, 2);
  }
  g.drawImage(pc, 0, 0);
  const tex = finishTexture(c, false);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  texCache.set(key, tex);
  return tex;
}

// Soft radial glow for sprites (halos around flames).
export function glowTexture() {
  if (texCache.has('glow')) return texCache.get('glow');
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set('glow', tex);
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------------------------
// Merge simple coloured primitives into one static geometry (vertex colours).
export function mergeColored(list) {
  const geos = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const [geo, color, o = {}] of list) {
    let g = geo;
    g.deleteAttribute('uv');
    if (o.smooth !== false) { g.deleteAttribute('normal'); g = mergeVertices(g, 1e-5); g.computeVertexNormals(); }
    const s = o.scale === undefined ? [1, 1, 1] : typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : o.scale;
    e.set(...(o.rot || [0, 0, 0]));
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(...(o.at || [0, 0, 0])), q, new THREE.Vector3(...s));
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.index) g = mergeVertices(g);
    geos.push(g);
  }
  return mergeGeometries(geos, false);
}

// Hanging oil lantern. Pivot (top of the bail) at the origin, hangs toward -y. Returns parts so
// the caller can drive the flame. Sizes in metres (before the caller's scale).
export function lanternGeometry() {
  const bronze = 0x5a4128, brass = 0xb08a46, darkMetal = 0x2d241c;
  const parts = [
    [new THREE.TorusGeometry(0.05, 0.0055, 5, 14, Math.PI), darkMetal, { at: [0, -0.05, 0], smooth: false }],
    [new THREE.ConeGeometry(0.072, 0.055, 12), bronze, { at: [0, -0.078, 0] }],
    [new THREE.CylinderGeometry(0.014, 0.018, 0.03, 8), brass, { at: [0, -0.045, 0] }],
    [new THREE.CylinderGeometry(0.07, 0.07, 0.014, 14), brass, { at: [0, -0.108, 0] }],
    [new THREE.CylinderGeometry(0.074, 0.066, 0.034, 14), bronze, { at: [0, -0.252, 0] }],
    [new THREE.SphereGeometry(0.055, 12, 8), darkMetal, { at: [0, -0.268, 0], scale: [1, 0.5, 1] }],
  ];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    parts.push([new THREE.BoxGeometry(0.009, 0.14, 0.009), darkMetal, { at: [Math.cos(a) * 0.062, -0.18, Math.sin(a) * 0.062], rot: [0, -a, 0], smooth: false }]);
  }
  return mergeColored(parts);
}
