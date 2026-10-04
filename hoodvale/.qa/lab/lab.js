// Character lab page (QA only): process generated GLBs into HB-skinned assets and preview them.
import * as THREE from 'three';
import { processCharacter, HB, slices } from './charproc.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#8a9aa8');
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-2, 4, -3); scene.add(sun);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 50);
const ground = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#6a7a5a' }));
scene.add(ground);

let cur = null;
const lab = {
  results: {},
  async process(name, opts = {}) {
    const r = await processCharacter(`./src/${name}.glb`, { id: name, ...opts });
    lab.results[name] = r;
    lab.show(name, opts.pose || null);
    window.SL = r;
    return { verts: r.asset.verts, tris: r.asset.tris, skirt: r.J.skirt, flipped: r.info.flipped, crotch: +r.J.crotchY.toFixed(3), armpit: +r.J.armpitY.toFixed(3), neck: +r.J.neckY.toFixed(3), shL: r.J.shL.toArray().map((v) => +v.toFixed(3)), haL: r.J.haL.toArray().map((v) => +v.toFixed(3)), arm: r.J.debugArm };
  },
  // Show the asset skinned to HB bones, optionally posed: pose = { bone: [rx, ry, rz], ... }.
  show(name, pose) {
    if (cur) scene.remove(cur);
    const r = lab.results[name];
    const g = r.geo.clone();
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(r.sk.SI), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from(r.sk.SW), 4));
    const P = r.asset.joints;
    const parent = [-1, 0, 1, 2, 3, 4, 5, 5, 3, 8, 9, 3, 11, 12, 1, 14, 15, 1, 17, 18, 3, 20, 13, 10, 9, 23, 25, 3, 3];
    const bones = P.map(() => new THREE.Bone());
    bones.forEach((b, i) => { const pp = parent[i] >= 0 ? P[parent[i]] : [0, 0, 0]; b.position.set(P[i][0] - pp[0], P[i][1] - pp[1], P[i][2] - pp[2]); if (parent[i] >= 0) bones[parent[i]].add(b); });
    let mat = new THREE.MeshStandardMaterial({ map: r.map, roughness: 0.85 });
    if (lab.weightView) {
      // Colour by dominant bone family.
      const pal = { 8: '#ff3030', 9: '#ff9a30', 10: '#ffee40', 11: '#3050ff', 12: '#30c0ff', 13: '#40ffd0', 3: '#ffffff', 2: '#a0a0a0', 1: '#606060', 4: '#c060ff', 5: '#ff60c0', 14: '#205020', 15: '#30a030', 16: '#80ff80', 17: '#502020', 18: '#a03030', 19: '#ff8080' };
      const col = new Float32Array(g.attributes.position.count * 3); const c = new THREE.Color();
      for (let i = 0; i < g.attributes.position.count; i++) {
        c.set('#000000');
        for (let k = 0; k < 4; k++) { const w = r.sk.SW[i * 4 + k]; if (w <= 0) continue; const cc = new THREE.Color(pal[r.sk.SI[i * 4 + k]] || '#000'); c.r += cc.r * w; c.g += cc.g * w; c.b += cc.b * w; }
        col.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    }
    const mesh = new THREE.SkinnedMesh(g, mat);
    const grp = new THREE.Group();
    grp.add(bones[0]); grp.add(mesh);
    bones[0].updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    if (pose) for (const [k, rot] of Object.entries(pose)) bones[HB[k]].rotation.set(rot[0], rot[1], rot[2]);
    // Joint markers.
    if (!pose) for (const p of P) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2266, depthTest: false })); m.position.set(...p); m.renderOrder = 9; grp.add(m); }
    cur = grp; scene.add(grp);
    lab.view(0);
  },
  // View: angle around the character (0 = front), dist, target height.
  view(angle = 0, dist = 4.2, ty = 0.9) {
    cam.position.set(Math.sin(angle) * -dist * -1 * 0 + Math.sin(angle) * dist, ty + 0.25, -Math.cos(angle) * dist);
    cam.lookAt(0, ty, 0);
    renderer.render(scene, cam);
    return true;
  },
  // Debug: clusters of slices between two height fractions.
  slices(name, a = 0.3, b = 0.7) {
    const r = lab.results[name];
    const S = slices(r.geo, r.asset.height);
    return S.filter((s) => s.y >= a * r.asset.height && s.y <= b * r.asset.height).map((s) => [+s.y.toFixed(3), s.clusters.map((c) => [+c.min.toFixed(3), +c.max.toFixed(3), c.n])]);
  },
  asset(name) { return JSON.stringify(lab.results[name].asset); },
  texture(name, size = 1024) {
    const img = lab.results[name].map.image;
    const c = document.createElement('canvas'); c.width = c.height = size;
    c.getContext('2d').drawImage(img, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.86);
  },
};
window.lab = lab;
window.labReady = true;
