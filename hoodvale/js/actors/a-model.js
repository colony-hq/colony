// Generated character models: concept art (Higgsfield) -> textured mesh (Tripo) -> auto-rigged
// onto the HB skeleton offline (.qa/lab, build.sh). Each model is two same-origin files:
// assets/chars/<id>.json (geometry, skin weights, HB joint positions) and <id>.jpg (texture).
//
// requestModel(id) -> Promise<model>   modelReady(id) -> model | null (starts the load)
// model: { id, geo, joints, height, top, mats: { body, flash, fade() }, layoutFor(spec) }
// HERO_MODELS lists the playable ones (character creator).

import * as THREE from 'three';
import { makeActorMaterial } from './a-core.js';

export const HERO_MODELS = [
  { id: 'player_m', name: 'Ranger', body: 'male' },
];
// Every model the game knows about (heroes + NPC / monster bodies).
export const MODELS = new Set(HERO_MODELS.map((m) => m.id));

const BONE_NAMES = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'eyes', 'hair', 'shL', 'elL', 'haL', 'shR', 'elR', 'haR',
  'thL', 'knL', 'ftL', 'thR', 'knR', 'ftR', 'cape', 'cape2', 'wpn', 'wpnL', 'shd', 'nock', 'arrow', 'wingL', 'wingR'];
const PARENT = [-1, 0, 1, 2, 3, 4, 5, 5, 3, 8, 9, 3, 11, 12, 1, 14, 15, 1, 17, 18, 3, 20, 13, 10, 9, 23, 25, 3, 3];
const NOCK = 25, ARROW = 26;

const BASE = new URL('../../assets/chars/', import.meta.url);
const cache = new Map(); // id -> { promise, model, failed }
const listeners = new Set();

export function onModelLoaded(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function modelReady(id) {
  if (!id || !MODELS.has(id)) return null;
  const e = cache.get(id);
  if (e) return e.model;
  requestModel(id).catch(() => {});
  return null;
}

export function requestModel(id) {
  if (!MODELS.has(id)) return Promise.reject(new Error('unknown model ' + id));
  let e = cache.get(id);
  if (!e) {
    e = { model: null, failed: false, promise: null };
    cache.set(id, e);
    e.promise = load(id).then((m) => {
      e.model = m;
      for (const fn of listeners) { try { fn(id); } catch (err) { console.warn('[actors] model listener', err); } }
      return m;
    }, (err) => { e.failed = true; console.warn('[actors] model ' + id + ' failed to load', err); throw err; });
  }
  return e.promise;
}

// Preload a set of models; resolves when all settle or after `timeout` ms.
export function preloadModels(ids, timeout = 8000) {
  const list = [...new Set(ids)].filter((id) => MODELS.has(id)).map((id) => requestModel(id).catch(() => null));
  return Promise.race([Promise.all(list), new Promise((r) => setTimeout(r, timeout))]);
}

function bytes(s) {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

async function load(id) {
  const [data, tex] = await Promise.all([
    fetch(new URL(id + '.json', BASE)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
    new THREE.TextureLoader().loadAsync(new URL(id + '.jpg', BASE).href),
  ]);
  tex.flipY = false; // glTF uv convention
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return build(id, data, tex);
}

function build(id, d, tex) {
  const n = d.verts;
  const qp = new Uint16Array(bytes(d.pos)), qn = new Int8Array(bytes(d.nrm)), qu = new Uint16Array(bytes(d.uv));
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const [x0, y0, z0, sx, sy, sz] = d.bbox;
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x0 + (qp[i * 3] / 65535) * sx;
    pos[i * 3 + 1] = y0 + (qp[i * 3 + 1] / 65535) * sy;
    pos[i * 3 + 2] = z0 + (qp[i * 3 + 2] / 65535) * sz;
    const nx = qn[i * 3] / 127, ny = qn[i * 3 + 1] / 127, nz = qn[i * 3 + 2] / 127;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l;
    uv[i * 2] = qu[i * 2] / 65535; uv[i * 2 + 1] = qu[i * 2 + 1] / 65535;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint8Array(bytes(d.si)), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(bytes(d.sw)), 4, true));
  // Actor-material attributes: no shine / glow, decal uv (0, 0) = transparent texel.
  geo.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  geo.setAttribute('aUv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (d.index) geo.setIndex(new THREE.BufferAttribute(d.index32 ? new Uint32Array(bytes(d.index)) : new Uint16Array(bytes(d.index)), 1));
  geo.computeBoundingSphere();
  const joints = d.joints;
  const top = d.top || d.height;
  const mats = {
    body: makeActorMaterial({ key: 'model', map: tex }),
    flash: makeActorMaterial({ key: 'modelFlash', map: tex, emissive: 0xff2a1a, emissiveIntensity: 0.55 }),
    fade: () => makeActorMaterial({ key: 'modelFade', map: tex, transparent: true, opacity: 1 }),
  };
  return {
    id, geo, joints, height: d.height, top, skirt: !!d.skirt, headR: d.headR, mats,
    // Bind layout in the shape of a-humanoid layoutFor(): bone offsets relative to parents.
    layoutFor(spec) {
      const defs = joints.map((p, i) => {
        const q = PARENT[i] >= 0 ? joints[PARENT[i]] : [0, 0, 0];
        return [BONE_NAMES[i], PARENT[i], p[0] - q[0], p[1] - q[1], p[2] - q[2]];
      });
      // Bow string nock rides above the left palm by the bow's own nock height.
      defs[NOCK] = ['nock', PARENT[NOCK], 0, spec?.bow ? spec.bow.nockY : 0.1, 0];
      defs[ARROW] = ['arrow', PARENT[ARROW], 0, 0, 0];
      return { defs, hipY: joints[1][1], height: top, hr: d.headR || 0.12 };
    },
  };
}
