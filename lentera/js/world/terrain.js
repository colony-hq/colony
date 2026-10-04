// Terrain mesh built from the baked heightfield. Owner: landscape.
// The heightfield itself (heightfield.js) and LANDMARKS are fixed; this file only renders them.

import * as THREE from 'three';
import {
  bakeHeightfield, heightAt, normalAt, slopeAt, distToPath, distToRiver,
  GRID_N, GRID_STEP, WORLD_HALF, LANDMARKS, SEA_LEVEL,
} from './heightfield.js';
import { patchMaterial } from './fog.js';
import { smoothstep } from '../core/math.js';

export { heightAt, normalAt, slopeAt, LANDMARKS, SEA_LEVEL };

export function createTerrain(ctx) {
  const grid = bakeHeightfield();
  const N = GRID_N;
  const positions = new Float32Array(N * N * 3);
  const colors = new Float32Array(N * N * 3);
  const sand = new THREE.Color(0xd8c39a);
  const wetSand = new THREE.Color(0x9c8a6a);
  const grass = new THREE.Color(0x4f7a3a);
  const grassDry = new THREE.Color(0x8a8a4a);
  const rock = new THREE.Color(0x6e6a64);
  const path = new THREE.Color(0x9a7a55);
  const seabed = new THREE.Color(0x3b5560);
  const tmp = new THREE.Color();

  for (let j = 0; j < N; j++) {
    const z = -WORLD_HALF + j * GRID_STEP;
    for (let i = 0; i < N; i++) {
      const x = -WORLD_HALF + i * GRID_STEP;
      const k = j * N + i;
      const h = grid[k];
      positions[k * 3] = x;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = z;
      const slope = slopeAt(x, z);
      if (h < -0.4) tmp.copy(seabed).lerp(wetSand, smoothstep(-6, -0.4, h));
      else if (h < 1.9) tmp.copy(wetSand).lerp(sand, smoothstep(-0.4, 0.6, h));
      else {
        tmp.copy(sand).lerp(grass, smoothstep(1.9, 3.2, h));
        tmp.lerp(grassDry, smoothstep(30, 60, h) * 0.6);
      }
      tmp.lerp(rock, smoothstep(0.55, 0.9, slope));
      if (h > 0.5) tmp.lerp(path, (1 - smoothstep(1.2, 2.6, distToPath(x, z))) * 0.85);
      if (distToRiver(x, z) < 3) tmp.lerp(rock, 0.5);
      colors[k * 3] = tmp.r;
      colors[k * 3 + 1] = tmp.g;
      colors[k * 3 + 2] = tmp.b;
    }
  }

  const index = [];
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      // Same split as heightAt(): (a, c, b) and (c, d, b).
      index.push(a, c, b, c, d, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const material = patchMaterial(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0,
  }));
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  ctx.scene.add(mesh);

  return {
    mesh,
    heightAt,
    normalAt,
    slopeAt,
    update() {},
  };
}
