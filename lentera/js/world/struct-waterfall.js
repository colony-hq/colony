// Air terjun: animated waterfall sheet, foam, mist, the rock roof block over the cave slot, the
// cave interior (glowing moss + crystals + Api Tirta pedestal) and the 'tirta' campfire.
// Owner: setdressing.

import * as THREE from 'three';
import { LANDMARKS, heightAt } from './heightfield.js';
import { patchMaterial } from './fog.js';
import { surfaceGeo, latheGeo, orient } from './props-kit.js';
import { campfirePit, sittingLog, canang } from './props-common.js';
import { tileNoise } from './props-textures.js';

const MOSS_GLOW = [0.18, 1.35, 0.75];
const CRYSTAL = [0.16, 1.15, 1.6];

export function buildWaterfall(kit, api, scene, updaters) {
  const A = LANDMARKS.airTerjun;
  const CV = A.cave;
  const b = kit.builder('airterjun');
  const N = tileNoise(4321);
  const nz3 = (x, y, z, f) => N.get(((x * f) % 1 + 1) % 1, ((z * f + y * f * 0.7) % 1 + 1) % 1, 16, 16) - 0.5;

  // ---- Roof block over the cave slot: a displaced, subdivided box, flush with the mesa. -------
  const RX0 = -157.2, RX1 = -133, RZ0 = -40.6, RZ1 = -25.4, RY0 = 7.5, RY1 = 28.8;
  const shelfBottom = (x) => (x < -150.5 ? 7.5 + 14.5 * Math.pow(Math.min(1, (-150.5 - x) / 6.2), 0.8) : 7.5);
  {
    const g = new THREE.BoxGeometry(RX1 - RX0, RY1 - RY0, RZ1 - RZ0, 18, 12, 9);
    g.translate((RX0 + RX1) / 2, (RY0 + RY1) / 2, (RZ0 + RZ1) / 2);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const top = v.y > RY1 - 0.01, bot = v.y < RY0 + 0.01;
      const west = v.x < RX0 + 0.01;
      const n1 = nz3(v.x, v.y, v.z, 0.06), n2 = nz3(v.x + 7, v.y * 1.3, v.z - 3, 0.13);
      let dx = n1 * 1.6 + n2 * 0.7, dy = 0, dz = (n2 * 1.4 + n1 * 0.5);
      if (top) { dy = n2 * 0.25; dx *= 0.4; dz *= 0.4; }
      if (bot) { dy = -Math.abs(n1) * 1.1 - Math.abs(n2) * 0.5; }
      if (west && !top && !bot) { dx = -Math.abs(n1) * 1.2 - 0.2; }
      // Undercut: in front of the cliff line the block becomes a thick lip shelf whose
      // underside slopes back down to the cave mouth (ceiling 7.5 at x = -150.5).
      const yb = shelfBottom(v.x);
      const k = (v.y - RY0) / (RY1 - RY0);
      const yNew = yb + k * (RY1 - yb);
      dy += yNew - v.y;
      if (v.x < -150 && !top) { if (v.z < -33) dz += (1 - k) * 0.8; else dz -= (1 - k) * 0.8; }
      // Notch where the river pours over the lip.
      if (top && v.z > -36.5 && v.z < -29.5) dy -= 0.35;
      p.setXYZ(i, v.x + dx, v.y + dy, v.z + dz);
    }
    g.computeVertexNormals();
    // Metre UVs (triplanar-ish by dominant normal).
    const nrm = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i));
      if (ay > 0.7) uv.setXY(i, p.getX(i), p.getZ(i));
      else if (ax > 0.7) uv.setXY(i, p.getZ(i), p.getY(i));
      else uv.setXY(i, p.getX(i), p.getY(i));
    }
    b.add('rock', g, {}, {
      color: 0x8c7c6c, jitter: 0, uvOff: false,
      vc: (x, y, z, nx, ny, nz, c) => {
        if (ny > 0.55) c.lerp(new THREE.Color(0.32, 0.42, 0.24), 0.75); // grassy moss on top
        else if (ny < -0.5) c.multiplyScalar(0.62); // underside of the shelf
        else if (y < 14) c.multiplyScalar(0.7); // wet, darker near the spray
        if (Math.abs(z + 33) < 4.5 && x < -153) c.multiplyScalar(0.6); // behind the falls
      },
    });
    b.collBox({ x: (-150.5 + -133) / 2, y: RY0, z: -33, w: 17.5, h: RY1 - RY0, d: 14, surface: 'rock', tag: 'cave-roof' });
    b.collBox({ x: (-156 + -150.5) / 2, y: 22, z: -33, w: 5.5, h: RY1 - 22, d: 14, surface: 'rock', tag: 'cave-roof' });
  }
  // Extra boulders breaking the silhouette of the shelf and the cliff around the mouth.
  for (const [x, y, z, r] of [[-155.6, 26.2, -41.0, 2.0], [-155.6, 25.6, -25.2, 1.8], [-151.5, 27.5, -24.6, 1.8], [-150, 28.3, -42.2, 2.0], [-147.5, 28.2, -23.9, 1.8], [-156.2, 22.6, -38.6, 1.4], [-156.2, 22.9, -27.4, 1.3], [-151.2, 9.0, -38.9, 1.6], [-151.2, 9.2, -27.0, 1.5]]) {
    b.rock('rock', { x, y, z, r, squash: 0.85, rough: 0.35, detail: 1, color: 0x7d786c, jitter: 0.08, vc: (px, py, pz, nx, ny, nz, c) => { if (ny > 0.6) c.lerp(new THREE.Color(0.3, 0.4, 0.22), 0.7); } });
  }
  // Rocks at the waterline around the plunge pool and the cave mouth.
  for (const [x, z, r] of [[-160.5, -38.6, 1.3], [-161, -27.4, 1.1], [-157.5, -39.5, 0.9], [-157, -26.3, 1.0], [-164, -34, 0.8], [-163.5, -30.5, 0.7], [-153.5, -38.2, 0.8], [-153, -27.8, 0.7]]) {
    b.rock('rock', { x, y: Math.max(heightAt(x, z), -1.6) + r * 0.25, z, r, squash: 0.6, color: 0x5d5a52, jitter: 0.12, vc: (px, py, pz, nx, ny, nz, c) => { if (py < 0.25) c.multiplyScalar(0.55); else if (ny > 0.5) c.lerp(new THREE.Color(0.25, 0.36, 0.2), 0.6); } });
  }

  // ---- Cave interior: rock walls hiding the terrain slot ramps, moss, crystals, pedestal. ------
  // Wall surfaces sit just inside the carved floor (z -37.5..-27.5, x < -137.5) so they hide the
  // steep terrain ramps of the slot. wallAt(i, x, y) gives the surface z for decals.
  const wallZ = [-37.35, -27.65];
  // Plan radius of the cave around its axis (z = -33): straight sides, then a rounded apse that
  // follows the carved slot's capsule end (centre x = -142).
  const AX = -142.6, APSE = 3.9, SIDE = 4.35;
  const wallD = (x, y, zw) => nz3(x, y, zw, 0.21) * 0.9 + nz3(x * 1.7, y * 1.3, zw, 0.37) * 0.4;
  const halfAt = (x) => (x > AX ? Math.sqrt(Math.max(0, APSE * APSE - (x - AX) * (x - AX))) * (SIDE / APSE) : SIDE);
  const wallAt = (i, x, y) => {
    const d = wallD(x, y, wallZ[i]);
    return -33 + (i === 0 ? -1 : 1) * (halfAt(x) - Math.abs(d) * 0.9 - 0.05);
  };
  // One continuous U-shaped rock surface: param s along the plan curve, y up; displaced inward.
  const straight = AX + 151.6;
  const planLen = straight * 2 + Math.PI * APSE;
  const planAt = (s) => {
    if (s < straight) return [-151.6 + s, -33 - SIDE, 0, 1];
    if (s > straight + Math.PI * APSE) return [AX - (s - straight - Math.PI * APSE), -33 + SIDE, 0, -1];
    const th = (s - straight) / APSE; // 0..pi around the apse
    return [AX + Math.sin(th) * APSE, -33 - Math.cos(th) * SIDE, -Math.sin(th), Math.cos(th)];
  };
  {
    const g = surfaceGeo(46, 8, (u, v) => {
      const [x, z, ix, iz] = planAt(u * planLen); // (ix, iz) = inward direction
      const y = -2.6 + v * 10.8;
      const d = Math.abs(wallD(x, y, z)) * 0.9 + 0.05;
      return [x + ix * d, y, z + iz * d];
    });
    orient(g, [-1, 0, 0]); // interior-facing: the apse normals point back toward the mouth
    b.add('rock', g, {}, { color: 0x7a6e62, jitter: 0.04, vc: (x, y, z, nx, ny, nz, c) => { c.multiplyScalar(0.5 + 0.5 * Math.min(1, Math.max(0, (y - 1) / 6))); if (y < 1.8 && x < -148) c.lerp(new THREE.Color(0.12, 0.16, 0.12), 0.5); } });
  }
  for (const [i, zw] of wallZ.entries()) {
    const out = i === 0 ? -1 : 1;
    b.collBox({ x: (-152 + AX) / 2, y: -2.5, z: zw + out * 0.6, w: AX + 152, h: 10.1, d: 1.2, surface: 'rock', walkable: false, tag: 'cave-wall' });
  }
  for (let k = 0; k <= 6; k++) {
    const th = (k / 6) * Math.PI;
    const x = AX + Math.sin(th) * (APSE + 0.6), z = -33 - Math.cos(th) * (SIDE + 0.6);
    b.collBox({ x, y: -1, z, w: 1.4, h: 9, d: 1.4, yaw: -th, surface: 'rock', walkable: false, tag: 'cave-wall' });
  }
  // Flat stepping stones to the pedestal, wet pebbles along the walls.
  for (let i = 0; i < 9; i++) {
    const x = -151.5 + i * 1.25, z = -33 + Math.sin(i * 1.7) * 0.6;
    const y = heightAt(x, z);
    if (y < 0.1) continue;
    b.rock('rock', { x, y: y + 0.02, z, r: 0.5 + b.r(0, 0.12), squash: 0.22, rough: 0.15, color: 0x8c8274, jitter: 0.1 });
  }
  for (let i = 0; i < 26; i++) {
    const side = b.rand() < 0.5 ? 0 : 1;
    const x = b.r(-151, -139.4);
    const hw = halfAt(x);
    const z = side === 0 ? -33 - b.r(hw - 1.3, hw - 0.3) : -33 + b.r(hw - 1.3, hw - 0.3);
    const y = heightAt(x, z);
    if (y < 1.0 || y > 1.7) continue;
    b.rock('rock', { x, y: y + 0.02, z, r: b.r(0.15, 0.55), squash: 0.55, color: 0x5d564c, jitter: 0.12 });
  }
  // Glowing moss: small clustered patches on the walls (surface-hugging), a few on the floor.
  for (let c = 0; c < 16; c++) {
    const i = c % 2;
    const cxm = b.r(-152, -139), cym = b.r(1.0, 5.5);
    const n = 3 + Math.floor(b.r(0, 4));
    for (let k = 0; k < n; k++) {
      const x = cxm + b.r(-0.7, 0.7), y = cym + b.r(-0.5, 0.5);
      const z = wallAt(i, x, y) + (i === 0 ? 0.04 : -0.04);
      b.add('glow', new THREE.CircleGeometry(b.r(0.06, 0.2), 6), { x, y, z, yaw: i === 0 ? 0 : Math.PI, sx: b.r(1, 1.8) }, { color: MOSS_GLOW, jitter: 0.35 });
    }
  }
  for (let k = 0; k < 14; k++) {
    const x = b.r(-148, -139.5);
    const z = -33 + (b.rand() < 0.5 ? -1 : 1) * b.r(Math.min(2.6, halfAt(x) - 0.9), halfAt(x) - 0.4);
    const y = heightAt(x, z);
    if (y > 1.6) continue;
    b.add('glow', new THREE.CircleGeometry(b.r(0.08, 0.22), 6), { x, y: y + 0.02, z, pitch: -Math.PI / 2, sx: b.r(1, 1.6) }, { color: [MOSS_GLOW[0] * 0.7, MOSS_GLOW[1] * 0.7, MOSS_GLOW[2] * 0.7], jitter: 0.3 });
  }
  const crystalCluster = (x, y, z, s, dir = 1) => {
    for (let k = 0; k < 6; k++) {
      const h = s * b.r(0.35, 0.9), r = s * b.r(0.04, 0.09);
      const g = new THREE.CylinderGeometry(0, r, h * 0.3, 6, 1);
      g.translate(0, h * 0.35 + h * 0.15, 0);
      const g2 = new THREE.CylinderGeometry(r, r * 0.9, h * 0.7, 6, 1);
      g2.translate(0, h * 0.35 - h * 0.35 + h * 0.0, 0);
      b.add('glow', g, { x, y, z, pitch: b.r(-0.5, 0.5) + (dir < 0 ? Math.PI : 0), roll: b.r(-0.5, 0.5) }, { color: CRYSTAL, jitter: 0.25 });
      b.add('glow', g2, { x, y, z, pitch: b.r(-0.5, 0.5) + (dir < 0 ? Math.PI : 0), roll: b.r(-0.5, 0.5) }, { color: [CRYSTAL[0] * 0.55, CRYSTAL[1] * 0.55, CRYSTAL[2] * 0.6], jitter: 0.25 });
    }
  };
  crystalCluster(-139.7, 1.4, -34.9, 0.9);
  crystalCluster(-139.9, 1.4, -31.2, 0.75);
  crystalCluster(-144.8, 1.4, -36.6, 0.55);
  crystalCluster(-146.5, 1.4, -29.3, 0.6);
  crystalCluster(-141.8, 6.9, -35.6, 0.6, -1);
  crystalCluster(-143.8, 7.0, -30.0, 0.5, -1);
  // Pedestal for Api Tirta: carved stone column with a water bowl, offerings around it.
  const F = A.flame;
  const yF = heightAt(F.x, F.z);
  b.add('stone', latheGeo([[0.62, 0], [0.62, 0.16], [0.5, 0.2], [0.5, 0.3], [0.3, 0.36], [0.24, 0.5], [0.22, 0.75], [0.26, 0.82], [0.42, 0.88], [0.52, 0.98], [0.5, 1.04], [0.38, 1.0], [0.0, 0.98]], 14), { x: F.x, y: yF, z: F.z }, { color: 0xa9aca4, jitter: 0.04, ao: [yF, yF + 0.5, 0.6] });
  b.add('glow', new THREE.CircleGeometry(0.36, 14), { x: F.x, y: yF + 1.0, z: F.z, pitch: -Math.PI / 2 }, { color: [0.4, 1.4, 1.8] });
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3; canang(b, F.x + Math.cos(a) * 0.9, yF, F.z + Math.sin(a) * 0.9); }
  b.collCyl({ x: F.x, y: yF, z: F.z, r: 0.62, h: 1.04, surface: 'stone' });
  api.anchors['flame:tirta'] = new THREE.Vector3(F.x, yF + 1.5, F.z);
  api.anchors['cave:entrance'] = new THREE.Vector3(CV.entrance.x, heightAt(CV.entrance.x, CV.entrance.z), CV.entrance.z);

  // ---- Tirta campfire on the cove's south shore. -----------------------------------------------
  const CF = A.campfire;
  const yC = heightAt(CF.x, CF.z);
  b.within({ x: CF.x, y: yC, z: CF.z }, () => campfirePit(b, { big: false }));
  b.within({ x: 0, y: heightAt(CF.x - 2.8, CF.z + 1.6), z: 0 }, () => sittingLog(b, CF.x - 2.8, CF.z + 1.6, 0.5, 1.6));
  b.within({ x: 0, y: heightAt(CF.x + 2.6, CF.z + 2.0), z: 0 }, () => sittingLog(b, CF.x + 2.6, CF.z + 2.0, -0.6, 1.5));
  const fireObj = new THREE.Group();
  fireObj.name = 'campfire:tirta';
  fireObj.position.set(CF.x, yC + 0.05, CF.z);
  scene.add(fireObj);
  api.campfires.tirta = { object: fireObj, position: fireObj.position.clone() };
  api.anchors['campfire:tirta'] = fireObj.position.clone();

  const group = b.build(scene);

  // ---- Water: sheet + top flow (one ribbon), foam ring, mist points. ---------------------------
  const water = makeWaterMaterial(kit, 'fall');
  const foamMat = makeWaterMaterial(kit, 'foam');
  const lipX = A.top.x, lipY = A.top.y;
  const fall = (s) => {
    // s 0..1: 0-0.18 river over the roof top, 0.18-1 free fall (parabolic) to the pool.
    if (s < 0.18) {
      const t = s / 0.18;
      return [-141 + (lipX + 141) * t, lipY - 0.12 + t * 0.06, 0, t * 0.6];
    }
    const t = (s - 0.18) / 0.82;
    const drop = (lipY + 0.5) * t;
    const x = lipX - 0.3 - 2.9 * Math.sqrt(t) * Math.min(1, t * 6 + 0.3);
    return [x, lipY - 0.06 - drop, 1, 0.6 + Math.sqrt(drop + 0.3) * 1.8];
  };
  const NU = 6, NV = 46;
  const pos = new Float32Array((NU + 1) * (NV + 1) * 3);
  const uvs = new Float32Array((NU + 1) * (NV + 1) * 2);
  const cols = new Float32Array((NU + 1) * (NV + 1) * 3);
  for (let j = 0; j <= NV; j++) {
    const s = j / NV;
    const [x, y, freefall, vcoord] = fall(s);
    const width = freefall ? 6.2 + (s - 0.18) * 3.2 : 5.0 + s * 6;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      const k = j * (NU + 1) + i;
      const bulge = Math.sin(u * Math.PI) * 0.25 * freefall;
      pos[k * 3] = x - bulge; pos[k * 3 + 1] = y + (freefall ? 0 : Math.sin(u * Math.PI) * 0.04); pos[k * 3 + 2] = -33 + (u - 0.5) * width;
      uvs[k * 2] = u * width * 0.22; uvs[k * 2 + 1] = vcoord;
      cols[k * 3] = u; cols[k * 3 + 1] = s; cols[k * 3 + 2] = freefall;
    }
  }
  const idx = [];
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * (NU + 1) + i, c = a + NU + 1;
    idx.push(a, c, a + 1, a + 1, c, c + 1);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  fg.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  fg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  fg.setIndex(idx);
  fg.computeVertexNormals();
  const sheet = new THREE.Mesh(fg, water);
  sheet.name = 'airterjun:sheet';
  sheet.renderOrder = 2;
  scene.add(sheet);
  // A second, thinner veil just behind the main sheet for depth.
  const veil = new THREE.Mesh(fg.clone(), water);
  veil.position.set(0.55, 0, 0);
  veil.scale.set(1, 1, 0.8);
  veil.position.z = -33 * (1 - 0.8);
  veil.renderOrder = 1;
  scene.add(veil);

  // Foam ring at the plunge point (radial UVs, scrolls outward).
  const px = lipX - 3.2, pz = -33;
  const foamGeo = new THREE.RingGeometry(0.4, 6.5, 32, 6);
  foamGeo.rotateX(-Math.PI / 2);
  {
    const p = foamGeo.attributes.position, uv = foamGeo.attributes.uv;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const r = Math.hypot(x, z * 0.8), a = Math.atan2(z, x);
      uv.setXY(i, (a / (Math.PI * 2) + 0.5) * 6, r * 0.35);
      c[i * 3] = 1 - Math.min(1, r / 6.5); c[i * 3 + 1] = 0; c[i * 3 + 2] = 0;
      p.setZ(i, z * 1.25);
    }
    foamGeo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  const foam = new THREE.Mesh(foamGeo, foamMat);
  foam.position.set(px, 0.06, pz);
  foam.renderOrder = 3;
  scene.add(foam);

  // Mist / spray particles.
  const preset = kit.ctx.engine?.preset || {};
  const nMist = Math.round(140 * (preset.particles ?? 0.7));
  const mist = makeMist(kit, nMist, px, pz);
  scene.add(mist);

  updaters.push((dt, t) => {
    void dt; void t; // animated entirely in shaders via kit.uniforms.uPropTime
  });

  api.waterfall = { sheet, foam, mist };
  return group;
}

// Waterfall / foam material: MeshStandard (lit by the scene) with scrolling streak noise.
// Vertex colours carry (across, along, freefall) for the sheet and (centre weight) for foam.
function makeWaterMaterial(kit, mode) {
  const tex = kit.textures.water.map.clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({
    map: tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    roughness: 0.25, metalness: 0.0, color: 0xffffff,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPropTime = kit.uniforms.uPropTime;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uPropTime;')
      .replace('#include <map_fragment>', mode === 'fall' ? `
        {
          float t = uPropTime;
          vec2 uv = vMapUv;
          float a = texture2D(map, vec2(uv.x, uv.y * 0.55 - t * 1.25)).r;
          float b2 = texture2D(map, vec2(uv.x * 1.9 + 0.31, uv.y * 0.9 - t * 1.9)).r;
          float c2 = texture2D(map, vec2(uv.x * 3.7 + 0.7, uv.y * 1.6 - t * 2.6)).b;
          float across = vColor.r, along = vColor.g, ff = vColor.b;
          float streak = smoothstep(0.32, 0.78, a * 0.55 + b2 * 0.45);
          float edge = smoothstep(0.0, 0.16, across) * smoothstep(1.0, 0.84, across);
          float lip = smoothstep(0.12, 0.2, along) * (1.0 - smoothstep(0.2, 0.3, along));
          float base = smoothstep(0.86, 1.0, along);
          float foamy = clamp(lip * 0.8 + base * 0.9 + c2 * 0.25 * ff, 0.0, 1.0);
          vec3 deep = vec3(0.16, 0.30, 0.34);
          vec3 white = vec3(0.86, 0.93, 0.95);
          diffuseColor.rgb = mix(deep, white, clamp(streak * 0.8 + foamy, 0.0, 1.0));
          float alpha = mix(0.45, 0.92, streak) * edge;
          alpha = max(alpha, foamy * edge * 0.95);
          alpha *= mix(0.75, 1.0, ff);
          alpha *= 1.0 - smoothstep(0.985, 1.0, along);
          diffuseColor.a = alpha;
        }` : `
        {
          float t = uPropTime;
          vec2 uv = vMapUv;
          float a = texture2D(map, vec2(uv.x, uv.y - t * 0.35)).g;
          float b2 = texture2D(map, vec2(uv.x * 2.3 + 0.2, uv.y * 1.7 - t * 0.6)).r;
          float centre = vColor.r;
          float f = smoothstep(0.55, 0.85, a * 0.6 + b2 * 0.5 + centre * 0.3);
          diffuseColor.rgb = vec3(0.88, 0.94, 0.96);
          diffuseColor.a = f * smoothstep(0.0, 0.35, centre) * 0.6;
        }`)
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.12;');
  };
  m.customProgramCacheKey = () => 'lentera-water-' + mode;
  return patchMaterial(m);
}

function makeMist(kit, n, px, pz) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 3.2;
    pos[i * 3] = px + Math.cos(a) * r * 0.8;
    pos[i * 3 + 1] = 0.2;
    pos[i * 3 + 2] = pz + Math.sin(a) * r * 1.4;
    seed[i] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(px, 4, pz), 14);
  const m = new THREE.PointsMaterial({
    map: kit.textures.sprite.map, color: 0xdfe8ee, size: 3.2, sizeAttenuation: true,
    transparent: true, depthWrite: false, opacity: 0.32,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPropTime = kit.uniforms.uPropTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSeed;\nuniform float uPropTime;\nvarying float vMist;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float life = fract(uPropTime * (0.09 + aSeed * 0.08) + aSeed * 7.31);
        transformed.y += life * (5.5 + aSeed * 6.0);
        transformed.x -= life * (1.5 + aSeed * 2.5);
        transformed.z += sin(aSeed * 40.0 + uPropTime * 0.3) * life * 1.5;
        vMist = sin(life * 3.14159) * (0.5 + aSeed * 0.5);`)
      .replace('gl_PointSize = size;', 'gl_PointSize = size * (0.6 + vMist * 1.4 + aSeed);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMist;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vMist;');
  };
  m.customProgramCacheKey = () => 'lentera-mist';
  patchMaterial(m);
  const pts = new THREE.Points(g, m);
  pts.name = 'airterjun:mist';
  pts.renderOrder = 4;
  return pts;
}
