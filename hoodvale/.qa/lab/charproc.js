// Character lab: turns a generated humanoid GLB (A-pose, textured, unrigged) into a game asset
// skinned to the Hoodvale HB skeleton (a-humanoid.js): orient (face -z, +x = the character's
// right), scale to height, find joints from horizontal slices, compute skin weights per body
// region with blends across joints, bring the arms down to the HB bind pose (arms hanging), and
// export compact geometry (base64 in JSON) + a resized JPEG texture + world joint positions.
// QA / offline only; the runtime loader is js/actors/a-model.js.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const HB = {
  root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5, eyes: 6, hair: 7,
  shL: 8, elL: 9, haL: 10, shR: 11, elR: 12, haR: 13,
  thL: 14, knL: 15, ftL: 16, thR: 17, knR: 18, ftR: 19,
  cape: 20, cape2: 21, wpn: 22, wpnL: 23, shd: 24, nock: 25, arrow: 26, wingL: 27, wingR: 28,
};
const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export async function loadGLB(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  let mesh = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  return { geo, map: mesh.material.map || null, material: mesh.material };
}

// ---------------------------------------------------------------------------------------------
// 1. Orient and scale
// ---------------------------------------------------------------------------------------------
export function orient(geo, height, flip = false) {
  geo.computeBoundingBox();
  let bb = geo.boundingBox;
  const ext = new THREE.Vector3().subVectors(bb.max, bb.min);
  const axes = [['x', ext.x], ['y', ext.y], ['z', ext.z]].sort((a, b) => b[1] - a[1]);
  const up = axes[0][0], span = axes[1][0];
  const m = new THREE.Matrix4();
  // Bring `up` to +y and the arm span to x.
  if (up === 'x') m.makeRotationZ(Math.PI / 2);
  else if (up === 'z') m.makeRotationX(-Math.PI / 2);
  geo.applyMatrix4(m);
  geo.computeBoundingBox(); bb = geo.boundingBox;
  const e2 = new THREE.Vector3().subVectors(bb.max, bb.min);
  if (e2.z > e2.x) geo.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  geo.computeBoundingBox(); bb = geo.boundingBox;
  // Scale to height, feet on y = 0, centred on x.
  const s = height / (bb.max.y - bb.min.y);
  geo.applyMatrix4(new THREE.Matrix4().makeTranslation(-(bb.max.x + bb.min.x) / 2, -bb.min.y, -(bb.max.z + bb.min.z) / 2));
  geo.applyMatrix4(new THREE.Matrix4().makeScale(s, s, s));
  // Facing: Tripo meshes all come out facing -z here, so nothing turns unless asked (flip: true;
  // flip: 'auto' guesses from the toes, which long skirts and chunky boots can fool).
  const p = geo.attributes.position;
  let footMin = Infinity, footMax = -Infinity, shinZ = 0, shinN = 0;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i);
    if (y < height * 0.035) { footMin = Math.min(footMin, z); footMax = Math.max(footMax, z); }
    else if (y > height * 0.1 && y < height * 0.16) { shinZ += z; shinN++; }
  }
  shinZ /= Math.max(1, shinN);
  const toesPlus = footMax - shinZ > shinZ - footMin; // toes toward +z (guess)
  const turn = flip === true || (flip === 'auto' && toesPlus);
  if (turn) geo.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI));
  geo.computeBoundingBox();
  return { scale: s, flipped: turn, toesPlus };
}

// ---------------------------------------------------------------------------------------------
// 2. Slices and joints (A-pose)
// ---------------------------------------------------------------------------------------------
// Exact cross-sections: intersect every triangle with the plane y = slice height and merge the
// x-intervals of the resulting segments into clusters (robust on sparse, low-poly meshes where
// vertex-only slices show false gaps).
export function slices(geo, H, n = 160) {
  const p = geo.attributes.position, ix = geo.index;
  const triCount = ix ? ix.count / 3 : p.count / 3;
  const segs = Array.from({ length: n }, () => []);
  const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) P[k].fromBufferAttribute(p, ix ? ix.getX(t * 3 + k) : t * 3 + k);
    const ymin = Math.min(P[0].y, P[1].y, P[2].y), ymax = Math.max(P[0].y, P[1].y, P[2].y);
    const b0 = Math.max(0, Math.ceil((ymin / H) * n - 0.5)), b1 = Math.min(n - 1, Math.floor((ymax / H) * n - 0.5));
    for (let b = b0; b <= b1; b++) {
      const y = ((b + 0.5) / n) * H;
      const pts = [];
      for (let k = 0; k < 3; k++) {
        const A = P[k], B = P[(k + 1) % 3];
        if ((A.y - y) * (B.y - y) > 0 || A.y === B.y) continue;
        const f = (y - A.y) / (B.y - A.y);
        pts.push(A.x + (B.x - A.x) * f, A.z + (B.z - A.z) * f);
      }
      if (pts.length >= 4) segs[b].push(pts);
    }
  }
  return segs.map((sg, b) => {
    const iv = sg.map((q) => [Math.min(q[0], q[2]), Math.max(q[0], q[2]), (q[1] + q[3]) / 2, Math.hypot(q[2] - q[0], q[3] - q[1])]).sort((a, c) => a[0] - c[0]);
    const cl = [];
    let cur = null, zs = 0, zl = 0;
    for (const [mn, mx, zm, len] of iv) {
      if (!cur || mn - cur.max > H * 0.012) { cur = { min: mn, max: mx, n: 0, zs: 0, zl: 0 }; cl.push(cur); }
      cur.max = Math.max(cur.max, mx); cur.n++; cur.zs += zm * len; cur.zl += len;
      zs += zm * len; zl += len;
    }
    for (const c of cl) { c.c = (c.min + c.max) / 2; c.z = c.zl ? c.zs / c.zl : 0; }
    const w = cl.length ? cl[cl.length - 1].max - cl[0].min : 0;
    return { y: ((b + 0.5) / n) * H, clusters: cl, zc: zl ? zs / zl : 0, w };
  });
}

export function findJoints(geo, H, opts = {}) {
  const S = slices(geo, H);
  const p = geo.attributes.position;
  const at = (fy) => S[Math.min(S.length - 1, Math.max(0, Math.floor(fy * S.length)))];
  // Crotch: highest slice (below 60% height) whose two central clusters straddle x = 0.
  let crotchY = null;
  for (let b = Math.floor(S.length * 0.6); b >= Math.floor(S.length * 0.2); b--) {
    const cl = S[b].clusters.filter((c) => Math.abs(c.c) < H * 0.2);
    const left = cl.filter((c) => c.max < 0), right = cl.filter((c) => c.min > 0);
    if (left.length && right.length && !cl.some((c) => c.min < 0 && c.max > 0)) { crotchY = S[b].y; break; }
  }
  const skirt = opts.skirt || crotchY === null || crotchY < H * 0.3;
  if (skirt) crotchY = H * 0.46;
  // Arms (A-pose): the hands are the outermost parts. Start at each side's outermost vertex below
  // the shoulders, take the lowest point near it as the fingertips, then track the arm upward
  // slice by slice (nearest cluster to the previous centre) until it merges with the torso.
  const armPts = { L: [], R: [] };
  const tips = { L: null, R: null };
  let armpitY = 0;
  for (const sd of ['L', 'R']) {
    const sg = sd === 'L' ? -1 : 1;
    let out = null;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * sg, y = p.getY(i);
      if (y < H * 0.25 || y > H * 0.78) continue;
      if (!out || x > out.x) out = { x, y };
    }
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      if (Math.abs(x * sg - out.x) > H * 0.06 || Math.abs(y - out.y) > H * 0.08) continue;
      if (!tips[sd] || y < tips[sd].y) tips[sd] = { x, y, z: p.getZ(i) };
    }
    const b0 = Math.floor((tips[sd].y / H) * S.length) + 2;
    let prev = tips[sd].x;
    for (let b = b0; b < S.length * 0.85; b++) {
      const cl = S[b].clusters;
      if (!cl.length) continue;
      const c = cl.reduce((a, q) => (Math.abs(q.c - prev) < Math.abs(a.c - prev) ? q : a));
      const inner = sg < 0 ? c.max : c.min;
      if (Math.abs(c.c - prev) > H * 0.05 || inner * sg < H * 0.06 || (c.min < 0 && c.max > 0)) { armpitY = Math.max(armpitY, S[b].y); break; }
      armPts[sd].push([c.c, S[b].y, c, b]);
      prev = c.c;
    }
  }
  const fit = (pts) => {
    let sy = 0, sx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) { sy += y; sx += x; syy += y * y; sxy += x * y; }
    const n = pts.length;
    const bb = (n * sxy - sx * sy) / Math.max(1e-9, n * syy - sy * sy);
    return { a: (sx - bb * sy) / n, b: bb };
  };
  let neckB = -1, neckW = Infinity;
  for (let b = Math.floor(S.length * 0.72); b < Math.floor(S.length * 0.9); b++) if (S[b].w > 0 && S[b].w < neckW) { neckW = S[b].w; neckB = b; }
  const neckY = S[neckB].y;
  const J = {};
  // Torso half-width just under the armpits (central cluster).
  const tsl = at((armpitY - H * 0.03) / H);
  const mid = tsl.clusters.find((c) => c.min < 0 && c.max > 0) || { min: -H * 0.12, max: H * 0.12 };
  for (const sd of ['L', 'R']) {
    const sg = sd === 'L' ? -1 : 1;
    // Fit the arm axis on its lower 80% (the top slices are distorted by the shoulder).
    const pts = armPts[sd];
    const f = fit(pts.slice(Math.floor(pts.length * 0.15), Math.max(3, Math.floor(pts.length * 0.9))));
    const tip = tips[sd];
    const slope = Math.atan(Math.abs(f.b));
    const widths = pts.map(([, , c]) => c.max - c.min).sort((a, b) => a - b);
    const rArm = (widths[Math.floor(widths.length * 0.4)] || H * 0.07) * 0.5 * Math.cos(slope);
    const sy = Math.min(armpitY + H * 0.06, neckY - H * 0.06);
    const torsoX = sg < 0 ? mid.min : mid.max;
    let sx = f.a + f.b * sy;
    // Keep the joint inside the shoulder: between the torso side and one arm radius beyond it.
    sx = sg * Math.min(Math.max(Math.abs(sx), Math.abs(torsoX) - rArm * 0.2), Math.abs(torsoX) + rArm * 0.9);
    const S0 = new THREE.Vector3(sx, sy, 0);
    const T = new THREE.Vector3(tip.x, tip.y, 0);
    const dir = T.clone().sub(S0); const len = dir.length(); dir.normalize();
    const handLen = H * (opts.hand ?? 0.1);
    const W = T.clone().addScaledVector(dir, -handLen);
    const E = S0.clone().lerp(W, 0.5);
    for (const v of [S0, E, W, T]) v.z = meanZnear(p, v, H * 0.05);
    J['sh' + sd] = S0; J['el' + sd] = E; J['ha' + sd] = W; J['tip' + sd] = T;
    J['rArm' + sd] = Math.max(rArm, H * 0.03); J['armDir' + sd] = dir; J['armLen' + sd] = len;
  }
  const shoulderTopY = Math.max(J.shL.y, J.shR.y) + Math.max(J.rArmL, J.rArmR);
  // Skirt / robe hem: the lowest slice (above the ankles) where one cross-section spans both legs.
  // Cloth above it swings with the thighs only; below it are the shins and feet.
  J.hemY = crotchY;
  if (skirt) {
    for (let b = Math.floor(S.length * 0.03); b < Math.floor((crotchY / H) * S.length); b++) {
      if (S[b].clusters.some((c) => c.min < -H * 0.01 && c.max > H * 0.01)) { J.hemY = S[b].y; break; }
    }
  }
  // Per-slice arm cross-sections (x ranges) for exact arm membership below the armpit.
  J.nSlices = S.length;
  J.armSl = { L: new Map(), R: new Map() };
  // Body outer edge per slice and side: the cluster crossing x = 0 (torso) or the innermost one
  // on that side (a leg). Everything clearly beyond it, near the arm, is arm (thumbs, cuffs).
  J.bodyOut = { L: new Float32Array(S.length), R: new Float32Array(S.length) };
  for (let b = 0; b < S.length; b++) for (const sd of ['L', 'R']) {
    const sg = sd === 'L' ? -1 : 1;
    const cl = S[b].clusters;
    const mid = cl.find((c) => c.min <= 0 && c.max >= 0);
    let edge = 0;
    if (mid) edge = sg < 0 ? -mid.min : mid.max;
    else { const side = cl.filter((c) => c.c * sg > 0).sort((a, c) => Math.abs(a.c) - Math.abs(c.c)); if (side.length) edge = sg < 0 ? -side[0].min : side[0].max; }
    J.bodyOut[sd][b] = edge;
  }
  for (const sd of ['L', 'R']) for (const [, , c, b] of armPts[sd]) J.armSl[sd].set(b, [c.min, c.max]);
  // Torso side just under the armpit (where the arm is still separate): over the armpit, anything
  // beyond it is sleeve.
  const apB = Math.round((armpitY / H) * S.length - 0.5);
  J.torsoSide = { L: Math.max(J.bodyOut.L[apB - 1], J.bodyOut.L[apB - 2]), R: Math.max(J.bodyOut.R[apB - 1], J.bodyOut.R[apB - 2]) };
  // Upper-arm radius (sleeves can puff out): widest of the top quarter of the tracked slices.
  for (const sd of ['L', 'R']) {
    const pts = armPts[sd], top = pts.slice(Math.floor(pts.length * 0.75));
    const slope = Math.atan(Math.abs(J['armDir' + sd].x / (J['armDir' + sd].y || 1e-6)));
    J['rUp' + sd] = Math.max(J['rArm' + sd], ...top.map(([, , c]) => (c.max - c.min) * 0.5 * Math.cos(slope)));
  }
  J.armBMin = { L: armPts.L.length ? armPts.L[0][3] : 0, R: armPts.R.length ? armPts.R[0][3] : 0 };
  J.debugArm = { L: armPts.L.map(([x, y, c]) => [+x.toFixed(3), +y.toFixed(3), +c.min.toFixed(3), +c.max.toFixed(3)]), tips };
  // Legs.
  const ankleY = H * (opts.ankle ?? 0.06);
  for (const sd of ['L', 'R']) {
    const sg = sd === 'L' ? -1 : 1;
    const legC = (y) => {
      const sl = at(y / H);
      const cl = sl.clusters.filter((c) => (c.c * sg) > 0 && Math.abs(c.c) < H * 0.25);
      if (!cl.length || skirt) return sg * H * 0.075;
      return cl.reduce((a, c) => (Math.abs(c.c) < Math.abs(a.c) ? c : a)).c;
    };
    const hipY = crotchY + H * 0.025;
    const hx = legC(crotchY - H * 0.06);
    const T0 = new THREE.Vector3(hx, hipY, 0);
    const A = new THREE.Vector3(legC(ankleY + H * 0.02), ankleY, 0);
    const K = new THREE.Vector3(legC((hipY + ankleY) / 2), (hipY + ankleY) / 2 - H * 0.01, 0);
    for (const v of [T0, K, A]) v.z = meanZnear(p, v, H * 0.04);
    // Ankle sits toward the heel.
    A.z += H * 0.012;
    J['th' + sd] = T0; J['kn' + sd] = K; J['ft' + sd] = A;
  }
  // Spine chain on the body centre line.
  const zAt = (y) => at(y / H).zc;
  const hipsY = crotchY + H * 0.045;
  J.hips = new THREE.Vector3(0, hipsY, zAt(hipsY));
  J.spine = new THREE.Vector3(0, hipsY + H * 0.07, zAt(hipsY + H * 0.07));
  J.chest = new THREE.Vector3(0, (J.shL.y + J.shR.y) / 2 - H * 0.085, 0);
  J.chest.z = zAt(J.chest.y);
  J.neck = new THREE.Vector3(0, neckY - H * 0.015, zAt(neckY));
  J.head = new THREE.Vector3(0, neckY + H * 0.02, zAt(neckY + H * 0.02));
  // Head centre: middle of the head above the neck.
  let topY = 0;
  for (let i = 0; i < p.count; i++) topY = Math.max(topY, p.getY(i));
  const headC = new THREE.Vector3(0, (neckY + topY) / 2, zAt((neckY + topY) / 2));
  J.headC = headC; J.topY = topY; J.neckY = neckY; J.crotchY = crotchY; J.skirt = skirt; J.armpitY = armpitY; J.shoulderTopY = shoulderTopY;
  return J;
}
function meanZnear(p, v, r) {
  let s = 0, n = 0;
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i) - v.x, dy = p.getY(i) - v.y;
    if (dx * dx + dy * dy < r * r) { s += p.getZ(i); n++; }
  }
  return n ? s / n : 0;
}

// ---------------------------------------------------------------------------------------------
// 3. Skin weights (HB bone indices, up to 4 per vertex)
// ---------------------------------------------------------------------------------------------
function segT(v, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = new THREE.Vector3().subVectors(v, a).dot(ab) / ab.lengthSq();
  const q = a.clone().addScaledVector(ab, Math.min(1, Math.max(0, t)));
  return { t, d: q.distanceTo(v) };
}
export function skin(geo, J, H) {
  const p = geo.attributes.position, n = p.count;
  const SI = new Uint8Array(n * 4), SW = new Float32Array(n * 4);
  const armOf = new Float32Array(n); // arm membership (for the re-pose)
  const v = new THREE.Vector3();
  const set = (i, list) => {
    const m = new Map();
    for (const [b, w] of list) if (w > 1e-4) m.set(b, (m.get(b) || 0) + w);
    const arr = [...m].sort((a, c) => c[1] - a[1]).slice(0, 4);
    const sum = arr.reduce((s, x) => s + x[1], 0) || 1;
    arr.forEach(([b, w], k) => { SI[i * 4 + k] = b; SW[i * 4 + k] = w / sum; });
  };
  const yN = J.neckY, yHead = J.head.y, yChest = J.chest.y, ySpine = J.spine.y, yHips = J.hips.y;
  for (let i = 0; i < n; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const sd = v.x < 0 ? 'L' : 'R', sg = v.x < 0 ? -1 : 1;
    const B = (k) => HB[k + sd];
    // Arm?
    const S0 = J['sh' + sd], E = J['el' + sd], W = J['ha' + sd], T = J['tip' + sd];
    const rA = J['rArm' + sd];
    const sa = segT(v, S0, T);
    const torsoEdge = Math.abs(S0.x) - rA * 0.55;
    // Membership: below the armpit the arm is its own cross-section cluster (tracked per slice);
    // under the first tracked slice (fingertips) and over the armpit (shoulder cap) use a capsule.
    const bb = Math.min(J.nSlices - 1, Math.max(0, Math.round((v.y / H) * J.nSlices - 0.5)));
    const rng = J.armSl[sd].get(bb);
    const rUp = J['rUp' + sd];
    let isArm;
    const beyond = v.x * sg > J.bodyOut[sd][bb] + H * 0.012;
    const inRng = rng && v.x >= rng[0] - H * 0.012 && v.x <= rng[1] + H * 0.012;
    // Separate bits beyond the body next to the arm: thumbs (near the hand) and the inner rims of
    // open cuffs / bell sleeves (along the forearm, close to the axis).
    // Gap rule: in a tracked slice, whatever lies in the outer half of the gap between the body and
    // the arm's cross-section belongs to the arm (bell-sleeve rims hang well off the arm axis).
    const R = Math.max(rA, rUp);
    const inner = rng ? (sg < 0 ? -rng[1] : rng[0]) : 0;
    const gapArm = rng && sa.t > 0.25 && v.x * sg > (J.bodyOut[sd][bb] + inner) / 2;
    const near = beyond && ((sa.t > 0.7 && sa.d < R * 3) || gapArm);
    if (rng || bb < J.armBMin[sd]) isArm = v.y > T.y - H * 0.03 && (inRng || near);
    else isArm = v.y >= J.armpitY - H * 0.02 && v.y < J.shoulderTopY + rA * 0.6 && sa.t > -0.12 && v.x * sg > torsoEdge &&
      (sa.d < Math.max(rA * 1.7, rUp * 1.3) || (v.y < J.armpitY + H * 0.05 && v.x * sg > J.torsoSide[sd] + H * 0.01));
    if (isArm && v.y < yN) {
      const tE = segT(E, S0, T).t, tW = segT(W, S0, T).t;
      const t = sa.t;
      let list;
      if (t < tE - 0.06) list = [[B('sh'), 1]];
      else if (t < tE + 0.06) { const k = sm(tE - 0.06, tE + 0.06, t); list = [[B('sh'), 1 - k], [B('el'), k]]; }
      else if (t < tW - 0.02) list = [[B('el'), 1]];
      else if (t < tW + 0.03) { const k = sm(tW - 0.02, tW + 0.03, t); list = [[B('el'), 1 - k], [B('ha'), k]]; }
      else list = [[B('ha'), 1]];
      // Shoulder blend into the chest near the joint and across the top of the shoulder.
      const inward = sm(torsoEdge, Math.abs(S0.x) + rA * 0.35, v.x * sg);
      const k = Math.min(1, sm(-0.05, 0.16, t) * 0.6 + inward * 0.55);
      if (k < 1) list = [...list.map(([b, w]) => [b, w * k]), [HB.chest, 1 - k]];
      set(i, list);
      armOf[i] = k;
      continue;
    }
    // Head / neck.
    if (v.y >= yN) {
      const k = sm(yN - H * 0.01, yHead + H * 0.02, v.y);
      set(i, [[HB.neck, 1 - k], [HB.head, k]]);
      continue;
    }
    // Legs (below the hip line).
    const legTop = J['th' + sd].y + H * 0.02;
    if (v.y < legTop) {
      const T0 = J['th' + sd], K = J['kn' + sd], A = J['ft' + sd];
      let list;
      if (J.skirt && v.y > J.hemY - H * 0.006) {
        // Skirts / robes: hips with a pull from the nearer thigh, more toward the hem (never the knee,
        // so long hems do not fold with the shins).
        const f = sm(legTop, Math.min(K.y, J.hemY + H * 0.05), v.y) * 0.7;
        const wl = Math.min(1, Math.max(0, 0.5 - v.x / (H * 0.18)));
        list = [[HB.hips, 1 - f], [HB.thL, f * wl], [HB.thR, f * (1 - wl)]];
      } else if (v.y > K.y + H * 0.035) {
        const kH = sm(legTop, T0.y - H * 0.07, v.y);
        // Inner thigh near the crotch stays partly on the hips.
        const centre = 1 - sm(0, H * 0.04, Math.abs(v.x));
        list = [[HB.hips, (1 - kH) * 0.8 + centre * 0.15 * (1 - kH)], [B('th'), kH + (1 - kH) * 0.2]];
      } else if (v.y > K.y - H * 0.035) {
        const k = sm(K.y + H * 0.035, K.y - H * 0.035, v.y);
        list = [[B('th'), 1 - k], [B('kn'), k]];
      } else if (v.y > A.y + H * 0.015) list = [[B('kn'), 1]];
      else if (v.y > A.y - H * 0.012) { const k = sm(A.y + H * 0.015, A.y - H * 0.012, v.y); list = [[B('kn'), 1 - k], [B('ft'), k]]; }
      else list = [[B('ft'), 1]];
      set(i, list);
      continue;
    }
    // Torso: hips -> spine -> chest -> neck.
    const wHip = 1 - sm(yHips - H * 0.01, ySpine + H * 0.01, v.y);
    const wChest = sm(ySpine + H * 0.02, yChest, v.y);
    const wNeck = sm(yChest + H * 0.06, yN, v.y) * 0.5;
    set(i, [[HB.hips, wHip], [HB.spine, Math.max(0, 1 - wHip - wChest)], [HB.chest, wChest * (1 - wNeck)], [HB.neck, wChest * wNeck]]);
  }
  return { SI, SW, armOf };
}

// ---------------------------------------------------------------------------------------------
// 4. Re-pose: rotate each arm about its shoulder so it hangs (slightly out from the body).
// ---------------------------------------------------------------------------------------------
export function armsDown(geo, J, sk, outward = 0.12) {
  const p = geo.attributes.position, nr = geo.attributes.normal;
  const R = {};
  for (const sd of ['L', 'R']) {
    const sg = sd === 'L' ? -1 : 1;
    const dir = J['armDir' + sd];
    const cur = Math.atan2(dir.x, -dir.y); // angle from straight down (positive = toward +x)
    const want = sg * outward;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), want - cur);
    R[sd] = { q, pivot: J['sh' + sd].clone() };
    for (const k of ['el', 'ha', 'tip']) J[k + sd] = J[k + sd].clone().sub(R[sd].pivot).applyQuaternion(q).add(R[sd].pivot);
    J['armDir' + sd] = dir.clone().applyQuaternion(q);
  }
  const v = new THREE.Vector3(), w = new THREE.Vector3(), nv = new THREE.Vector3(), nw = new THREE.Vector3();
  const { SI, SW } = sk;
  for (let i = 0; i < p.count; i++) {
    // Arm weight = sum of the shoulder / elbow / hand bones of one side.
    let wl = 0, wr = 0;
    for (let k = 0; k < 4; k++) {
      const b = SI[i * 4 + k], ww = SW[i * 4 + k];
      if (b === HB.shL || b === HB.elL || b === HB.haL) wl += ww;
      if (b === HB.shR || b === HB.elR || b === HB.haR) wr += ww;
    }
    const sd = wl >= wr ? 'L' : 'R', aw = Math.max(wl, wr);
    if (aw < 1e-4) continue;
    const { q, pivot } = R[sd];
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    w.copy(v).sub(pivot).applyQuaternion(q).add(pivot);
    v.lerp(w, aw);
    p.setXYZ(i, v.x, v.y, v.z);
    if (nr) {
      nv.set(nr.getX(i), nr.getY(i), nr.getZ(i));
      nw.copy(nv).applyQuaternion(q);
      nv.lerp(nw, aw).normalize();
      nr.setXYZ(i, nv.x, nv.y, nv.z);
    }
  }
  p.needsUpdate = true;
  if (nr) nr.needsUpdate = true;
}

// ---------------------------------------------------------------------------------------------
// 5. HB bone world positions (bind pose = arms hanging) and export
// ---------------------------------------------------------------------------------------------
export function hbJoints(J, H) {
  const P = new Array(29);
  const V = (v) => [v.x, v.y, v.z];
  P[HB.root] = [0, 0, 0];
  P[HB.hips] = V(J.hips); P[HB.spine] = V(J.spine); P[HB.chest] = V(J.chest); P[HB.neck] = V(J.neck); P[HB.head] = V(J.head);
  const hr = (J.topY - J.neckY) / 2;
  P[HB.eyes] = [0, J.headC.y, J.headC.z - hr * 0.84];
  P[HB.hair] = [0, J.headC.y + hr * 0.3, J.headC.z + hr * 0.5];
  for (const sd of ['L', 'R']) {
    P[HB['sh' + sd]] = V(J['sh' + sd]); P[HB['el' + sd]] = V(J['el' + sd]); P[HB['ha' + sd]] = V(J['ha' + sd]);
    P[HB['th' + sd]] = V(J['th' + sd]); P[HB['kn' + sd]] = V(J['kn' + sd]); P[HB['ft' + sd]] = V(J['ft' + sd]);
  }
  // Palms (weapon grips) a little below the wrists, along the hand.
  const palm = (sd) => { const d = J['armDir' + sd]; const w = J['ha' + sd]; return [w.x + d.x * H * 0.042, w.y + d.y * H * 0.042, w.z]; };
  P[HB.wpn] = palm('R'); P[HB.wpnL] = palm('L');
  const fe = J.elL.clone().lerp(J.haL, 0.45);
  P[HB.shd] = [fe.x - J.rArmL * 0.9, fe.y, fe.z];
  P[HB.nock] = [P[HB.wpnL][0], P[HB.wpnL][1] + 0.1, P[HB.wpnL][2]];
  P[HB.arrow] = P[HB.nock].slice();
  P[HB.cape] = [0, J.chest.y + H * 0.1, J.chest.z + H * 0.07];
  P[HB.cape2] = [0, J.chest.y - H * 0.16, J.chest.z + H * 0.09];
  P[HB.wingL] = [-0.06, J.chest.y + 0.12, J.chest.z + 0.12]; P[HB.wingR] = [0.06, J.chest.y + 0.12, J.chest.z + 0.12];
  return P;
}

const b64 = (arr) => { const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

// Asset v2: positions and uvs quantised to Uint16 (positions over the bounding box), normals
// Int8, skin indices / weights Uint8 (weights sum to 255), index Uint16 / Uint32.
export function exportAsset(id, geo, sk, joints, H, extra = {}) {
  const p = geo.attributes.position, nr = geo.attributes.normal, uv = geo.attributes.uv;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const lo = [bb.min.x, bb.min.y, bb.min.z], span = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map((v) => v || 1);
  const pos = new Uint16Array(p.count * 3), nrm = new Int8Array(p.count * 3), uvs = new Uint16Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = Math.round(((p.array[i * 3 + k] - lo[k]) / span[k]) * 65535);
      nrm[i * 3 + k] = Math.round(Math.max(-1, Math.min(1, nr.array[i * 3 + k])) * 127);
    }
    for (let k = 0; k < 2; k++) uvs[i * 2 + k] = Math.round(Math.max(0, Math.min(1, uv.array[i * 2 + k])) * 65535);
  }
  const sw = new Uint8Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    let rem = 255;
    for (let k = 0; k < 4; k++) { const w = k < 3 ? Math.round(sk.SW[i * 4 + k] * 255) : rem; sw[i * 4 + k] = Math.max(0, Math.min(255, w)); rem -= sw[i * 4 + k]; }
  }
  const index = geo.index ? (p.count < 65536 ? new Uint16Array(geo.index.array) : new Uint32Array(geo.index.array)) : null;
  const r4 = (v) => +v.toFixed(4);
  return {
    v: 2, id, height: H, verts: p.count, tris: index ? index.length / 3 : p.count / 3,
    bbox: [...lo, ...span].map(r4), joints: joints.map((j) => j.map(r4)), ...extra,
    pos: b64(pos), nrm: b64(nrm), uv: b64(uvs), si: b64(sk.SI), sw: b64(sw),
    index: index ? b64(index) : null, index32: index instanceof Uint32Array,
  };
}

// Resized JPEG of the base colour texture.
export function textureJPEG(map, size = 1024, quality = 0.86) {
  const img = map.image;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  return c.toDataURL('image/jpeg', quality);
}

// Full pipeline.
export async function processCharacter(url, { id, height = 1.78, skirt = false, tex = 1024, hand, ankle, outward, raw = false, flip = false } = {}) {
  const { geo, map } = await loadGLB(url);
  const info = orient(geo, height, flip);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const J = findJoints(geo, height, { skirt, hand, ankle });
  const sk = skin(geo, J, height);
  if (!raw) armsDown(geo, J, sk, outward);
  const joints = hbJoints(J, height);
  const asset = exportAsset(id, geo, sk, joints, height, { skirt: J.skirt, top: +J.topY.toFixed(4), headR: +((J.topY - J.neckY) / 2).toFixed(4), headC: [J.headC.x, J.headC.y, J.headC.z].map((v) => +v.toFixed(4)) });
  return { asset, geo, map, J, sk, info };
}
