// BASELINE — owner: world builder. Terrain meshes for the overworld and dungeons from mapgen.
// API: meshes, update(dt). Vertices must sit on the baked corner grid (picking/heights agree).
import * as THREE from 'three';
import { getRegionGrid, OVERWORLD, DUNGEONS, T_ROAD, T_WATER, T_INDOOR, T_CLIFF, T_BRIDGE } from './mapgen.js';

function buildRegion(region) {
  const G = getRegionGrid(region.id);
  const N = G.N;
  const pos = new Float32Array(N * N * 3);
  const col = new Float32Array(N * N * 3);
  const c = new THREE.Color();
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const k = z * N + x;
    const h = G.heights[k];
    pos[k * 3] = region.x0 + x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = region.z0 + z;
    const f = G.flags[Math.min(G.H - 1, z) * G.W + Math.min(G.W - 1, x)];
    if (region.id !== 'overworld') c.set(0x3a332c);
    else if (f & T_INDOOR) c.set(0x7a6248);
    else if (f & T_ROAD) c.set(0x9a8260);
    else if (h < 0.4) c.set(0xc9b88a);
    else if (f & T_CLIFF) c.set(0x6f6a62);
    else if (h > 22) c.set(0x7f8a6a);
    else c.set(0x5f8f3e);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  const idx = [];
  for (let z = 0; z < N - 1; z++) for (let x = 0; x < N - 1; x++) {
    const a = z * N + x, b = a + 1, cc = a + N, d = cc + 1;
    idx.push(a, cc, b, cc, d, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain:' + region.id;
  return mesh;
}

export function createTerrain(ctx) {
  const meshes = [buildRegion(OVERWORLD), ...Object.values(DUNGEONS).map(buildRegion)];
  for (const m of meshes) ctx.scene.add(m);
  return { meshes, update() {} };
}
