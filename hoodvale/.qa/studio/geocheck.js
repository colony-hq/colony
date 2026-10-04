// Scan built humanoid geometries for NaN / zero skin weights / glow (QA only).
import { normaliseLook, buildHumanoid } from '../../js/actors/a-humanoid.js';
import { SETS } from './studio.js';
export function check(looks = SETS.player) {
  const out = [];
  for (const look of looks) {
    const spec = normaliseLook(look, {}, 'human', { npc: true });
    const { geo } = buildHumanoid(spec);
    const p = geo.attributes.position, n = geo.attributes.normal, sw = geo.attributes.skinWeight, m = geo.attributes.aMat, uv = geo.attributes.aUv;
    let nanP = 0, nanN = 0, zeroN = 0, zeroW = 0, glow = 0, badUv = 0;
    const firstBad = [];
    for (let i = 0; i < p.count; i++) {
      if (!Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))) nanP++;
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
      if (!Number.isFinite(nx + ny + nz)) { nanN++; if (firstBad.length < 3) firstBad.push(['nanN', i, p.getX(i), p.getY(i), p.getZ(i)]); }
      else if (nx * nx + ny * ny + nz * nz < 1e-6) { zeroN++; if (firstBad.length < 6) firstBad.push(['zeroN', i, +p.getX(i).toFixed(3), +p.getY(i).toFixed(3), +p.getZ(i).toFixed(3)]); }
      const s = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i);
      if (!(s > 0.5)) zeroW++;
      if (m.getY(i) > 0) glow++;
      if (!Number.isFinite(uv.getX(i) + uv.getY(i))) badUv++;
    }
    out.push({ verts: p.count, tris: geo.index ? geo.index.count / 3 : p.count / 3, nanP, nanN, zeroN, zeroW, glow, badUv, firstBad });
  }
  return out;
}
export function uvs(looks = SETS.player) {
  const out = [];
  for (const look of looks) {
    const spec = normaliseLook(look, {}, 'human', { npc: true });
    const { geo } = buildHumanoid(spec);
    const uv = geo.attributes.aUv;
    let n = 0, u0 = 9, u1 = -9, v0 = 9, v1 = -9;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      if (u === 0 && v === 0) continue;
      n++; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    out.push({ n, u0, u1, v0, v1, cell: spec.faceCell });
  }
  return out;
}
