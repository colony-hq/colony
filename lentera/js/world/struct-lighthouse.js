// Mercusuar: tapered banded tower on a paved headland, gallery + lamp room (glow driven by the
// finale), keeper's hut, three stone tungku braziers for the Api Pusaka, seaward parapet.
// Owner: setdressing.

import * as THREE from 'three';
import { LANDMARKS, heightAt } from './heightfield.js';
import { patchMaterial } from './fog.js';
import { latheGeo, orient, surfaceGeo } from './props-kit.js';
import { COL, EMBER, barrel, bench, netPile, ropeCoil, gentong } from './props-common.js';

const FLAME_COL = { tirta: [0.75, 2.6, 3.0], bumi: [3.2, 1.6, 0.4], samudra: [1.3, 1.5, 3.4] };

export function buildLighthouse(kit, api, scene, updaters) {
  const M = LANDMARKS.mercusuar;
  const cx = M.x, cz = M.z, Y = M.floor; // 19
  const b = kit.builder('mercusuar');
  const PAVE = Y + 0.15;

  // ---- Paved platform (walkable disc) ---------------------------------------------------------
  b.cyl('stone', { x: cx, y0: Y - 0.4, z: cz, r: 11.2, h: 0.55, seg: 40, color: 0xa29f94, jitter: 0.03 });
  for (let r = 4.6; r < 11; r += 1.4) b.add('stone', new THREE.TorusGeometry(r, 0.025, 3, 48), { x: cx, y: PAVE + 0.005, z: cz, pitch: Math.PI / 2 }, { color: 0x5a5852 });
  b.collCyl({ x: cx, y: Y - 0.4, z: cz, r: 11.2, h: 0.55, surface: 'stone', tag: 'lh-platform' });

  // ---- Tower ---------------------------------------------------------------------------------
  const base = PAVE, plinthTop = base + 1.4, bodyTop = Y + 25.4;
  const rB = M.towerRadius, rT = 2.45;
  b.add('stone', latheGeo([[4.05, 0], [4.05, 0.3], [3.85, 0.38], [3.8, 1.2], [3.55, 1.3], [3.4, 1.4]], 8), { x: cx, y: base, z: cz, yaw: Math.PI / 8 }, { color: 0x9a968a, jitter: 0.04 });
  const bandColor = (y) => {
    const h = (y - plinthTop) / (bodyTop - plinthTop);
    const red = (h > 0.18 && h < 0.3) || (h > 0.52 && h < 0.64) || (h > 0.84 && h < 0.94);
    return red ? 0x9c3a2c : 0xe6e0d2;
  };
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const y0 = plinthTop + ((bodyTop - plinthTop) * i) / segs, y1 = plinthTop + ((bodyTop - plinthTop) * (i + 1)) / segs;
    const r0 = rB + (rT - rB) * ((y0 - plinthTop) / (bodyTop - plinthTop)), r1 = rB + (rT - rB) * ((y1 - plinthTop) / (bodyTop - plinthTop));
    const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, 28, 1, true);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * Math.PI * 2 * r0, uv.getY(k) * (y1 - y0) + y0);
    b.add('plaster', g, { x: cx, y: (y0 + y1) / 2, z: cz }, {
      color: bandColor((y0 + y1) / 2), jitter: 0.02, uvOff: false,
      vc: (x, y, z, nx, ny, nz, c) => { const k = Math.max(0, 1 - (y - plinthTop) / 4); c.multiplyScalar(1 - k * 0.3); },
    });
  }
  b.collCyl({ x: cx, y: base, z: cz, r: 3.9, h: 1.4, surface: 'stone' });
  b.collCyl({ x: cx, y: plinthTop, z: cz, r: rB, h: bodyTop - plinthTop, surface: 'stone', walkable: false });
  // Small windows spiralling up (dark, glow with the lamp).
  const winMat = new THREE.MeshBasicMaterial({ color: 0x101010, vertexColors: true });
  kit.addMat('lh-win', winMat);
  for (let i = 0; i < 6; i++) {
    const a = 1.9 + i * 1.15;
    const y = plinthTop + 3.5 + i * 3.4;
    const r = rB + (rT - rB) * ((y - plinthTop) / (bodyTop - plinthTop)) + 0.02;
    const x = cx - Math.sin(a) * r, z = cz - Math.cos(a) * r;
    b.add('lh-win', new THREE.PlaneGeometry(0.42, 0.75), { x, y, z, yaw: a + Math.PI }, { color: [2.6, 1.7, 0.8], jitter: 0 });
    b.box('stone', { x: cx - Math.sin(a) * (r + 0.05), y: y - 0.42, z: cz - Math.cos(a) * (r + 0.05), w: 0.6, h: 0.08, d: 0.18, yaw: a, color: 0xb8b4a8 });
    b.box('stone', { x: cx - Math.sin(a) * (r + 0.03), y: y + 0.42, z: cz - Math.cos(a) * (r + 0.03), w: 0.56, h: 0.1, d: 0.12, yaw: a, color: 0xb8b4a8 });
  }
  // West door: stone arch + weathered plank door, steps.
  const D = M.door;
  const doorYaw = Math.atan2(-(D.x - cx), -(D.z - cz)); // faces outward along (door - centre)
  b.within({ x: cx, y: base, z: cz, yaw: doorYaw }, () => {
    const zf = -(rB + 0.05);
    b.box('stone', { x: 0, y0: 1.4, z: zf - 0.05, w: 1.9, h: 0.3, d: 0.5, color: 0xb8b4a8 });
    for (const sx of [-1, 1]) b.box('stone', { x: sx * 0.78, y0: 0, z: zf - 0.05, w: 0.34, h: 3.0, d: 0.5, color: 0xb8b4a8 });
    b.add('stone', new THREE.TorusGeometry(0.78, 0.17, 6, 12, Math.PI), { x: 0, y: 3.0, z: zf - 0.05 }, { color: 0xb8b4a8 });
    b.box('wood', { x: 0, y0: 1.4, z: zf - 0.02, w: 1.2, h: 1.6, d: 0.1, color: 0x5a4434, jitter: 0.08 });
    b.add('wood', new THREE.CircleGeometry(0.6, 12, 0, Math.PI), { x: 0, y: 3.0, z: zf - 0.07, yaw: Math.PI }, { color: 0x4d3a2c });
    for (const yy of [1.8, 2.6]) b.box('metal', { x: 0, y: yy, z: zf - 0.09, w: 1.15, h: 0.06, d: 0.03, color: COL.iron });
    b.add('metal', new THREE.TorusGeometry(0.07, 0.015, 4, 10), { x: 0.4, y: 2.2, z: zf - 0.1 }, { color: COL.iron });
    for (let i = 0; i < 3; i++) b.box('stone', { x: 0, y0: 0, z: zf - 0.55 - i * 0.38, w: 1.6 - i * 0.1, h: 1.4 - i * 0.45, d: 0.4, color: 0xa8a49a });
  });
  // Door steps collider (stairs climbing toward the tower).
  b.within({ x: cx, y: 0, z: cz, yaw: doorYaw }, () => {
    b.collStairs({ x: 0, z0: -(rB + 1.7), y0: base, y1: base + 1.4, run: 1.2, w: 1.6, maxRise: 0.45, dir: 1, surface: 'stone', base: base - 0.2 });
  });
  api.anchors['mercusuar:door'] = new THREE.Vector3(D.x, base, D.z);

  // ---- Gallery, lamp room, roof ------------------------------------------------------------
  const gy = bodyTop;
  b.add('stone', latheGeo([[rT, -0.9], [rT + 0.3, -0.5], [rT + 0.9, -0.15], [3.65, 0], [3.65, 0.28], [0.1, 0.28]], 28), { x: cx, y: gy, z: cz }, { color: 0xd8d2c4, jitter: 0.02 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.box('stone', { x: cx + Math.cos(a) * (rT + 0.35), y: gy - 0.45, z: cz + Math.sin(a) * (rT + 0.35), w: 0.7, h: 0.6, d: 0.22, yaw: -a, color: 0xc8c2b4 });
  }
  const railR = 3.5, railY = gy + 0.28;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    b.cyl('metal', { x: cx + Math.cos(a) * railR, y0: railY, z: cz + Math.sin(a) * railR, r: 0.03, h: 1.0, seg: 4, color: 0x2e3230 });
  }
  for (const yy of [railY + 1.0, railY + 0.5]) b.add('metal', new THREE.TorusGeometry(railR, 0.035, 4, 40), { x: cx, y: yy, z: cz, pitch: Math.PI / 2 }, { color: 0x2e3230 });
  b.collCyl({ x: cx, y: gy - 1, z: cz, r: 3.65, h: 1.28, surface: 'stone' });
  // Lamp room: low iron parapet, mullions, glass, lens.
  const lr = 1.85, ly0 = gy + 0.28, ly1 = ly0 + 0.7, ly2 = ly1 + 2.3;
  b.cyl('metal', { x: cx, y0: ly0, z: cz, r: lr, h: ly1 - ly0, seg: 16, color: 0x2c3a36 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    b.box('metal', { x: cx + Math.cos(a) * lr, y0: ly1, z: cz + Math.sin(a) * lr, w: 0.09, h: ly2 - ly1, d: 0.09, yaw: -a, color: 0x2c3a36 });
  }
  b.add('metal', latheGeo([[lr + 0.25, 0], [lr + 0.2, 0.18], [1.2, 0.9], [0.5, 1.35], [0.2, 1.5], [0.0, 1.52]], 16), { x: cx, y: ly2, z: cz }, { color: 0x3d5a50, jitter: 0.03 });
  b.add('metal', new THREE.SphereGeometry(0.22, 10, 6), { x: cx, y: ly2 + 1.62, z: cz }, { color: 0x3d5a50 });
  b.cyl('metal', { x: cx, y0: ly2 + 1.7, z: cz, r: 0.025, h: 1.2, seg: 4, color: 0x2a2a2a });
  b.add('metal', new THREE.ConeGeometry(0.12, 0.3, 4), { x: cx + 0.18, y: ly2 + 2.5, z: cz, roll: -Math.PI / 2 }, { color: 0x2a2a2a }); // wind vane
  const group = b.build(scene);

  // Glass + lens as separate meshes whose emissive follows setLampGlow.
  const glassMat = patchMaterial(new THREE.MeshStandardMaterial({
    color: 0x9fb6c0, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.32,
    emissive: new THREE.Color(1.0, 0.78, 0.45), emissiveIntensity: 0, depthWrite: false, side: THREE.DoubleSide,
  }));
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(lr - 0.03, lr - 0.03, ly2 - ly1, 16, 1, true), glassMat);
  glass.position.set(cx, (ly1 + ly2) / 2, cz);
  glass.renderOrder = 2;
  const lensMat = patchMaterial(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.075, 0.07) }));
  const lensGeo = latheGeo([[0.35, 0], [0.6, 0.15], [0.68, 0.5], [0.7, 0.9], [0.68, 1.3], [0.6, 1.62], [0.35, 1.8], [0.0, 1.85]], 14);
  const lens = new THREE.Mesh(lensGeo, lensMat);
  lens.position.set(cx, ly1 + 0.2, cz);
  const lamp = new THREE.Group();
  lamp.name = 'mercusuar:lamp';
  lamp.add(glass, lens);
  scene.add(lamp);
  // Rotating light beams (additive cones), visible when the lamp glows strongly.
  const beamTex = beamTexture();
  const beamMat = patchMaterial(new THREE.MeshBasicMaterial({ map: beamTex, color: new THREE.Color(1.0, 0.82, 0.55), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const beams = new THREE.Group();
  for (const s of [-1, 1]) {
    const g = new THREE.CylinderGeometry(9, 0.4, 140, 16, 1, true);
    g.translate(0, 70, 0);
    g.rotateZ(s * Math.PI / 2);
    const m = new THREE.Mesh(g, beamMat);
    m.frustumCulled = false;
    beams.add(m);
  }
  beams.position.set(cx, ly1 + 1.1, cz);
  beams.visible = false;
  scene.add(beams);
  const top = new THREE.Vector3(cx, ly1 + 1.1, cz);
  api.anchors['lighthouse:lamp'] = top;
  let glowV = 0;
  const lighthouse = {
    object: group,
    lamp,
    beams,
    top,
    get glow() { return glowV; },
    setLampGlow(v) {
      glowV = Math.max(0, Math.min(1, v));
      glassMat.emissiveIntensity = glowV * 3.2;
      glassMat.opacity = 0.32 + glowV * 0.4;
      lensMat.color.setRGB(0.08 + glowV * 4.5, 0.075 + glowV * 3.4, 0.07 + glowV * 1.9);
      winMat.color.setScalar(glowV * 0.9 + 0.04);
      beamMat.opacity = Math.max(0, (glowV - 0.45) / 0.55) * 0.55;
      beams.visible = beamMat.opacity > 0.001;
    },
    setBeams(on) { beams.userData.forced = on; },
    beamSpeed: 0.35,
  };
  lighthouse.setLampGlow(0);
  api.lighthouse = lighthouse;
  updaters.push((dt) => { if (beams.visible) beams.rotation.y += dt * lighthouse.beamSpeed; });

  // ---- Keeper's hut, seaward parapet, props (second builder: separate culling region). -----
  const h = kit.builder('mercusuar-yard');
  const HX = 209.2, HZ = 36.8, HYAW = Math.PI / 2 + 0.15; // faces west toward the tower
  h.within({ x: HX, y: PAVE, z: HZ, yaw: HYAW }, () => {
    const w = 4.6, d = 3.8, wh = 2.5;
    h.box('stone', { x: 0, y0: -0.2, z: 0, w: w + 0.3, h: 0.45, d: d + 0.3, color: 0x9a968a });
    h.box('plaster', { x: 0, y0: 0.25, z: d / 2, w, h: wh, d: 0.25, color: 0xe2dccd });
    h.box('plaster', { x: -w / 2, y0: 0.25, z: 0, w: 0.25, h: wh, d, color: 0xe2dccd });
    h.box('plaster', { x: w / 2, y0: 0.25, z: 0, w: 0.25, h: wh, d, color: 0xe2dccd });
    for (const sx of [-1, 1]) h.box('plaster', { x: sx * (w / 2 - 0.85), y0: 0.25, z: -d / 2, w: 1.7, h: wh, d: 0.25, color: 0xe2dccd });
    h.box('plaster', { x: 0, y0: 0.25 + 2.0, z: -d / 2, w: 1.0, h: wh - 2.0, d: 0.25, color: 0xe2dccd });
    h.box('wood', { x: -0.28, y0: 0.25, z: -d / 2 - 0.25, w: 0.5, h: 1.95, d: 0.06, yaw: 0.9, color: 0x6a5240 }); // door ajar
    h.box('wood', { x: 0, y0: 0.25, z: -d / 2 + 0.02, w: 1.0, h: 2.0, d: 0.05, color: 0x0d0b09 });
    for (const sx of [-1, 1]) {
      h.box('wood', { x: sx * (w / 2 - 0.85), y: 1.55, z: -d / 2 - 0.14, w: 0.8, h: 0.75, d: 0.04, color: 0x0e0c0a });
      h.box('wood', { x: sx * (w / 2 - 0.85) + sx * 0.62, y: 1.55, z: -d / 2 - 0.2, w: 0.42, h: 0.8, d: 0.04, yaw: sx * 0.5, color: 0x3e6a7a }); // shutter
    }
    // Hip-ish genteng roof (two slopes + gable fill).
    const rh = 1.5, ov = 0.55;
    for (const s of [-1, 1]) {
      const g = orient(surfaceGeo(4, 4, (u, v) => [(u - 0.5) * (w + ov * 2), wh + 0.25 + rh * (1 - v) - 0.05, s * (v * (d / 2 + ov))]), [0, 1, 0]);
      h.add('rooftile', g, {}, { color: 0xffffff, jitter: 0.05 });
      const gu = orient(surfaceGeo(2, 2, (u, v) => [(u - 0.5) * (w + ov * 2), wh + 0.25 + rh * (1 - v) - 0.14, s * (v * (d / 2 + ov))]), [0, -1, 0]);
      h.add('wood', gu, {}, { color: 0x5a4434 });
    }
    for (const sx of [-1, 1]) {
      const pts = [[-d / 2, wh + 0.25], [0, wh + 0.25 + rh - 0.15], [d / 2, wh + 0.25]];
      const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
      const g = new THREE.ShapeGeometry(shape);
      h.add('plaster', g, { x: sx * (w / 2), yaw: sx * Math.PI / 2 }, { color: 0xd6cfbf });
    }
    h.cyl('stone', { x: w / 2 - 0.6, y0: wh, z: d / 2 - 0.5, r: 0.25, h: 1.6, seg: 6, color: 0xa29a8c }); // chimney
    // Props: rain barrel, bench, nets, anchor, water jar.
    barrel(h, -w / 2 - 0.55, 0, -d / 2 + 0.6, 1.1, 0, 0, 0x5a4636);
    h.within({ x: w / 2 + 0.6, y: 0, z: -0.4, yaw: Math.PI / 2 }, () => bench(h, 1.6));
    netPile(h, -0.9, 0, -d / 2 - 1.1, 0.9);
    ropeCoil(h, 1.2, 0, -d / 2 - 0.9, 0.35);
    gentong(h, w / 2 - 0.4, 0, -d / 2 - 0.5, 1.0);
    // Old anchor leaning on the wall.
    h.within({ x: 1.6, y: 0.05, z: d / 2 + 0.35, roll: 0.2 }, () => {
      h.cyl('metal', { x: 0, y0: 0, z: 0, r: 0.06, h: 1.6, seg: 6, color: 0x3a3430 });
      h.add('metal', new THREE.TorusGeometry(0.5, 0.06, 5, 12, Math.PI), { x: 0, y: 0.5, z: 0, roll: Math.PI }, { color: 0x3a3430 });
      h.add('metal', new THREE.TorusGeometry(0.12, 0.03, 4, 10), { x: 0, y: 1.7, z: 0 }, { color: 0x3a3430 });
    });
    h.collBox({ x: 0, y: -0.2, z: 0, w: w + 0.3, h: wh + 1.8, d: d + 0.3, surface: 'stone', walkable: false, tag: 'lh-hut' });
  });
  api.footprints.push({ x: HX, z: HZ, r: 4 });
  // Low seaward parapet on the cliff side (east / north-east / south-east arc).
  for (let a = -1.15; a <= 1.6; a += 0.16) {
    const r = 11.0;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (Math.hypot(x - HX, z - HZ) < 4.5) continue;
    const hgt = 0.75 + Math.sin(a * 7) * 0.12;
    h.box('stone', { x, y0: PAVE - 0.3, z, w: 0.6, h: hgt + 0.3, d: 1.78, yaw: -a, color: 0xa29f94, jitter: 0.08 });
    h.collBox({ x, y: PAVE - 0.3, z, w: 0.6, h: hgt + 0.3, d: 1.78, yaw: -a, surface: 'stone', walkable: false });
  }

  // ---- Tungku braziers at the three sockets ------------------------------------------------
  for (const s of M.sockets) {
    const y = Math.max(PAVE, heightAt(s.x, s.z));
    h.within({ x: s.x, y, z: s.z, yaw: Math.atan2(-(cx - s.x), -(cz - s.z)) }, () => {
      h.box('stone', { x: 0, y0: -0.1, z: 0, w: 0.95, h: 0.3, d: 0.95, color: 0x8a877e });
      h.add('stone', latheGeo([[0.38, 0], [0.34, 0.1], [0.26, 0.2], [0.24, 0.55], [0.3, 0.62], [0.52, 0.7], [0.58, 0.88], [0.52, 0.95], [0.4, 0.88], [0.0, 0.84]], 8), { x: 0, y: 0.2, z: 0, yaw: Math.PI / 8 }, { color: 0x9e9a90, jitter: 0.05 });
      h.box('stone', { x: 0, y: 0.55, z: -0.27, w: 0.3, h: 0.3, d: 0.04, color: 0x7a776e }); // carved plaque
    });
    h.collCyl({ x: s.x, y: y - 0.1, z: s.z, r: 0.58, h: 1.15, surface: 'stone' });
    const mat = new THREE.MeshBasicMaterial({ color: 0x080706 });
    kit.addMat('tungku-' + s.id, mat);
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.06, 10), kit.mats['tungku-' + s.id].material);
    coals.position.set(0, 1.04, 0);
    const obj = new THREE.Group();
    obj.name = 'tungku:' + s.id;
    obj.position.set(s.x, y, s.z);
    obj.add(coals);
    scene.add(obj);
    const position = new THREE.Vector3(s.x, y + 1.12, s.z);
    let lit = false;
    const col = FLAME_COL[s.id] || EMBER;
    api.sockets[s.id] = {
      object: obj,
      position,
      get lit() { return lit; },
      setLit(on) {
        lit = !!on;
        if (lit) mat.color.setRGB(col[0], col[1], col[2]); else mat.color.setRGB(0.03, 0.026, 0.022);
      },
    };
    api.sockets[s.id].setLit(false);
    api.anchors['socket:' + s.id] = position;
  }
  h.build(scene);
  return group;
}

function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
