// Dermaga (pier) + beached boats + shore props. Owner: setdressing.
import * as THREE from 'three';
import { LANDMARKS, heightAt } from './heightfield.js';
import { COL, lampPost, ropeCoil, netPile, bakul, crate, signpost, barrel } from './props-common.js';
import { buildJukung } from './struct-boat.js';

export function buildPier(kit, api, scene) {
  const P = LANDMARKS.pier;
  const b = kit.builder('pier');
  const DECK = P.deckY; // 1.6
  const HW = P.width / 2; // 1.6
  const zRampTop = P.zStart; // 196
  const zDeck0 = 203.5;
  const zEnd = P.zEnd;
  const rampY = (z) => Math.max(DECK + ((zDeck0 - z) / (zDeck0 - zRampTop)) * 1.35, heightAt(0, z) + 0.06);
  const pileX = 1.45;

  // --- Piles (pairs every 3 m) with algae below the tide line.
  const algae = (x, y, z, nx, ny, nz, c) => {
    if (y < 0.35) c.lerp(new THREE.Color(0.12, 0.17, 0.11), Math.min(1, (0.35 - y) / 0.5) * 0.85);
    if (y > 0.2 && y < 0.45) c.lerp(new THREE.Color(0.7, 0.7, 0.62), 0.25);
  };
  const tall = { '-1:211': 'lamp', '-1:223': 'lamp', '-1:235': 'lamp', '-1:247': 'lamp', '1:217': 'post', '1:229': 'post', '1:241': 'post', '1:247': 'lamp' };
  for (let z = 199; z <= 247; z += 3) {
    for (const sx of [-1, 1]) {
      const x = sx * pileX;
      const sea = heightAt(x, z) - 0.6;
      const kind = tall[`${sx}:${z}`];
      const top = z < zDeck0 ? rampY(z) - 0.22 : kind ? DECK + 0.75 : DECK - 0.22;
      if (top - sea < 0.2) continue;
      b.cyl('wood', { x, y0: sea, z, r: 0.13, rt: 0.12, h: top - sea, seg: 8, color: 0x5d4734, jitter: 0.12, vc: algae });
      if (kind) {
        b.add('wood', new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), { x, y: top, z }, { color: 0x4d3a2a });
        b.collCyl({ x, y: DECK - 0.4, z, r: 0.16, h: top - DECK + 0.4, surface: 'wood', walkable: false });
        if (kind === 'post') { b.rope('rope', [x - 0.13, DECK + 0.55, z], [x + 0.13, DECK + 0.55, z], 0.0, 0.03, { color: COL.rope }); }
      }
    }
    // Header beam on each pile pair.
    const hy = z < zDeck0 ? rampY(z) - 0.32 : DECK - 0.32;
    b.box('wood', { x: 0, y: hy, z, w: pileX * 2 + 0.5, h: 0.2, d: 0.2, grain: 'x', color: 0x4f3b2a });
    // X bracing below the deck every other bay (stops above the water line).
    if (z >= 208 && (z - 208) % 6 === 0) {
      const lo = Math.max(heightAt(0, z) + 0.3, -1.2);
      for (const sx of [-1, 1]) b.bar('wood', [sx * pileX, lo, z], [sx * pileX, DECK - 0.45, z + 3], 0.08, 0.12, { color: 0x4d3a2a, vc: algae, up: [1, 0, 0] });
    }
  }
  // Stringers under the deck.
  for (const x of [-1.25, 0, 1.25]) b.box('wood', { x, y0: DECK - 0.27, z: (zDeck0 + zEnd) / 2, w: 0.16, h: 0.2, d: zEnd - zDeck0, grain: 'z', color: 0x4f3b2a });

  // --- Deck planks (across x) with occasional darker/newer boards.
  const pw = 0.26;
  for (let z = zDeck0; z < zEnd - 0.05; z += pw) {
    const t = b.rand();
    const color = t < 0.08 ? 0xa89a86 : t < 0.2 ? 0x6a5a4a : 0x857462;
    const wob = b.r(-0.04, 0.04);
    b.box('wood', { x: wob, y0: DECK - 0.06, z: z + pw / 2, w: P.width + b.r(0.05, 0.2), h: 0.06, d: pw - 0.025, grain: 'x', color, jitter: 0.1, yaw: b.r(-0.01, 0.01) });
  }
  // Ramp from the beach down to the deck.
  for (let z = zRampTop; z < zDeck0; z += pw) {
    const zc = z + pw / 2;
    const y = rampY(zc);
    const slope = Math.atan2(rampY(zc - 0.1) - rampY(zc + 0.1), 0.2);
    b.box('wood', { x: 0, y0: y - 0.06, z: zc, w: P.width - 0.2, h: 0.06, d: pw - 0.025, grain: 'x', color: 0x857462, jitter: 0.1, pitch: slope });
  }
  for (const sx of [-1, 1]) {
    b.bar('wood', [sx * (HW - 0.15), rampY(zRampTop) - 0.25, zRampTop], [sx * (HW - 0.15), DECK - 0.25, zDeck0], 0.12, 0.2, { color: 0x4f3b2a });
  }
  // Colliders: deck slab and the ramp as gentle steps.
  b.collBox({ x: 0, y: DECK - 0.5, z: (zDeck0 + zEnd) / 2, w: P.width, h: 0.5, d: zEnd - zDeck0, surface: 'wood', tag: 'pier' });
  for (let z = zRampTop; z < zDeck0; z += 0.5) {
    const top = rampY(z + 0.5);
    b.collBox({ x: 0, y: top - 0.8, z: z + 0.25, w: P.width - 0.2, h: 0.8, d: 0.52, surface: 'wood', tag: 'pier', solid: false });
  }
  // Entrance posts with a crossbar at the shore end.
  for (const sx of [-1, 1]) {
    const y = heightAt(sx * 1.9, zRampTop + 0.3);
    b.cyl('wood', { x: sx * 1.9, y0: y - 0.3, z: zRampTop + 0.3, r: 0.12, rt: 0.1, h: 3.1, seg: 8, color: COL.woodDark, ao: [y, y + 0.6, 0.55] });
    b.collCyl({ x: sx * 1.9, y: y - 0.3, z: zRampTop + 0.3, r: 0.16, h: 3.1, surface: 'wood', walkable: false });
  }
  b.box('wood', { x: 0, y: heightAt(0, zRampTop) + 2.62, z: zRampTop + 0.3, w: 4.4, h: 0.16, d: 0.18, grain: 'x', color: COL.woodDark });
  b.box('wood', { x: 0, y: heightAt(0, zRampTop) + 2.4, z: zRampTop + 0.3, w: 3.6, h: 0.1, d: 0.12, grain: 'x', color: COL.woodDark });

  // Lamps on the tall piles.
  for (const [key, kind] of Object.entries(tall)) {
    if (kind !== 'lamp') continue;
    const [sx, z] = key.split(':').map(Number);
    b.within({ x: sx * pileX, y: DECK + 0.75, z }, () => lampPost(b, { h: 1.7, armYaw: sx < 0 ? Math.PI : 0, coll: false }));
  }
  // Rope rail along the west edge between lamp posts.
  const west = [211, 223, 235, 247];
  for (let i = 0; i < west.length - 1; i++) b.rope('rope', [-pileX, DECK + 0.62, west[i]], [-pileX, DECK + 0.62, west[i + 1]], 0.35, 0.022, { color: COL.rope, n: 10 });
  b.rope('rope', [pileX, DECK + 0.62, 229], [pileX, DECK + 0.62, 241], 0.3, 0.022, { color: COL.rope, n: 10 });

  // Props on the deck (clear of Darto at (1.1, 224) and the spawn at (0, 242)).
  netPile(b, -0.85, DECK, 214.5, 1);
  bakul(b, -1.0, DECK, 217.2, 1.1);
  crate(b, -1.0, DECK, 228.4, 0.6, 0.3);
  crate(b, -1.1, DECK + 0.48, 228.5, 0.45, -0.2, 0x9a7a52);
  ropeCoil(b, 0.9, DECK, 239.2, 0.32);
  barrel(b, -1.0, DECK, 244.6, 0.95, 0, 0.5);
  bakul(b, 0.45, DECK, 225.4, 0.8);
  // Fish trap (bubu): conical bamboo basket lying on its side.
  b.add('gedek', new THREE.ConeGeometry(0.28, 1.0, 10, 1, true), { x: -0.9, y: DECK + 0.28, z: 237.2, roll: Math.PI / 2, yaw: 0.3 }, { color: 0xc9b07a });
  b.collBox({ x: -1.0, y: DECK, z: 228.45, w: 0.65, h: 0.85, d: 0.55, surface: 'wood' });
  b.collCyl({ x: -1.0, y: DECK, z: 244.6, r: 0.3, h: 0.78, surface: 'wood' });

  // Pier sign.
  signpost(b, 3.3, heightAt(3.3, 198.5), 198.5, [
    { word: 'Kampung', to: [0, 158] },
    { word: 'Dermaga', to: [0, 248] },
  ], kit.textures.decal.regions);

  // Beached jukungs on the sand either side of the pier.
  for (const [x, z, yaw, roll] of [[-8.5, 203.5, 0.25, 0.04], [9.2, 202.5, -0.35, -0.05], [-14.5, 201, 0.6, 0.06]]) {
    const y = heightAt(x, z) - 0.02;
    b.within({ x, y, z, yaw, roll }, () => buildJukung(b, { sail: false, lod: 0.5 }));
    b.collBox({ x, y: y - 0.4, z, w: 0.85, h: 0.82, d: 5.6, yaw, surface: 'wood' });
  }
  // A few oars and floats propped against the entrance.
  b.rod('wood', [-2.4, heightAt(-2.4, 197.5), 197.5], [-2.15, heightAt(-2.4, 197.5) + 2.1, 196.9], 0.03, { color: COL.woodDark });
  b.box('wood', { x: -2.42, y: heightAt(-2.4, 197.5) + 0.3, z: 197.45, w: 0.05, h: 0.5, d: 0.16, pitch: 0.1, color: COL.woodDark });

  const group = b.build(scene);
  api.anchors['pier:end'] = new THREE.Vector3(0, DECK, zEnd - 1);
  api.anchors['pier:start'] = new THREE.Vector3(0, rampY(zRampTop), zRampTop);
  return group;
}
