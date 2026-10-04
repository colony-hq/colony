// Batik kain worn as a shawl: a small position-based cloth strip pinned across the shoulders.
// It trails behind while moving and spreads into a wing between the hands while gliding
// (setOpen 0..1). Simulated in world space, written into a mesh parented to the character.
// Owner: player.

import * as THREE from 'three';

const SUB = 1 / 90; // max substep

export function createKain({ material, cols = 5, rows = 9, length = 0.95 }) {
  const N = cols * rows;
  const p = new Float32Array(N * 3); // world positions
  const v = new Float32Array(N * 3); // velocities
  const o = new Float32Array(N * 3); // previous substep positions
  const pinNow = new Float32Array(cols * 3);
  const pinPrev = new Float32Array(cols * 3);
  const segLen = length / (rows - 1);

  // Mesh: grid with uv (u across, v along), indices for two triangles per quad.
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  const uv = new Float32Array(N * 2);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      uv[k * 2] = i / (cols - 1);
      uv[k * 2 + 1] = 1 - (j / (rows - 1)) * 2.2; // texture repeats ~2x along the length
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const idx = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.frustumCulled = false; // world-space cloth inside a moving parent; cheap enough
  mesh.name = 'kain';

  let initialised = false;
  let time = Math.random() * 10;
  const inv = new THREE.Matrix4();
  const tmp = new THREE.Vector3();

  // back: world unit vector pointing out of the wearer's back (cloth starts behind the body).
  function reset(pins, back) {
    const bx = back ? back[0] : 0, bz = back ? back[2] : 1;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = (j * cols + i) * 3;
        p[k] = pins[i * 3] + bx * (0.06 + j * 0.03);
        p[k + 1] = pins[i * 3 + 1] - j * segLen * 0.97;
        p[k + 2] = pins[i * 3 + 2] + bz * (0.06 + j * 0.03);
        v[k] = v[k + 1] = v[k + 2] = 0;
      }
    }
    pinPrev.set(pins);
    initialised = true;
  }

  function constrain(a, b, rest, stiff, maxOnly) {
    const ka = a * 3, kb = b * 3;
    const dx = p[kb] - p[ka], dy = p[kb + 1] - p[ka + 1], dz = p[kb + 2] - p[ka + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    if (maxOnly && d <= rest) return;
    const diff = ((d - rest) / d) * stiff;
    const pinnedA = a < cols, pinnedB = b < cols;
    if (pinnedA && pinnedB) return;
    const wa = pinnedA ? 0 : pinnedB ? 1 : 0.5;
    const wb = pinnedB ? 0 : pinnedA ? 1 : 0.5;
    p[ka] += dx * diff * wa; p[ka + 1] += dy * diff * wa; p[ka + 2] += dz * diff * wa;
    p[kb] -= dx * diff * wb; p[kb + 1] -= dy * diff * wb; p[kb + 2] -= dz * diff * wb;
  }

  // capsules: [{ax,ay,az,bx,by,bz,r}], ground: world y floor, water: world y (or -Infinity)
  function collide(capsules, groundY, waterY) {
    for (let k = cols; k < N; k++) {
      const q = k * 3;
      for (const c of capsules) {
        const abx = c.bx - c.ax, aby = c.by - c.ay, abz = c.bz - c.az;
        const apx = p[q] - c.ax, apy = p[q + 1] - c.ay, apz = p[q + 2] - c.az;
        const ab2 = abx * abx + aby * aby + abz * abz || 1e-6;
        let t = (apx * abx + apy * aby + apz * abz) / ab2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = c.ax + abx * t, cy = c.ay + aby * t, cz = c.az + abz * t;
        const dx = p[q] - cx, dy = p[q + 1] - cy, dz = p[q + 2] - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < c.r * c.r) {
          let ex = dx, ey = dy, ez = dz;
          if (c.back) {
            // Always leave through the back: mirror a forward-pointing escape direction.
            const f = ex * c.back[0] + ey * c.back[1] + ez * c.back[2];
            if (f < 0) { ex -= 2 * f * c.back[0]; ey -= 2 * f * c.back[1]; ez -= 2 * f * c.back[2]; }
            if (ex * ex + ey * ey + ez * ez < 1e-8) { ex = c.back[0]; ey = c.back[1]; ez = c.back[2]; }
          }
          const d = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-6;
          const pushTo = c.r / d;
          p[q] = cx + ex * pushTo; p[q + 1] = cy + ey * pushTo; p[q + 2] = cz + ez * pushTo;
        }
      }
      if (p[q + 1] < groundY + 0.02) p[q + 1] = groundY + 0.02;
      if (p[q + 1] < waterY) p[q + 1] += (waterY - p[q + 1]) * 0.5;
    }
  }

  const kain = {
    mesh,
    open: 0,

    // pins: Float32Array(cols*3) world positions of the top row for this frame.
    // opts: { capsules, groundY, waterY, flutter (0..1), lift (0..1), gravity }
    update(dt, pins, parent, opts) {
      if (!initialised) reset(pins, opts.back);
      // Teleports and huge jumps: start over instead of stretching across the island.
      const jump = Math.hypot(pins[0] - pinPrev[0], pins[1] - pinPrev[1], pins[2] - pinPrev[2]);
      if (jump > 3) reset(pins, opts.back);
      time += dt;
      const steps = Math.min(4, Math.max(1, Math.ceil(dt / SUB)));
      const h = dt / steps;
      const open = kain.open;
      const grav = (opts.gravity ?? 9.8) * (1 - 0.82 * open);
      const drag = 2.0 + 1.4 * open;
      let span = 0;
      for (let i = 0; i < cols - 1; i++) {
        const q = i * 3;
        span += Math.hypot(pins[q + 3] - pins[q], pins[q + 4] - pins[q + 1], pins[q + 5] - pins[q + 2]);
      }
      const hRestTop = span / (cols - 1);
      const flutter = opts.flutter ?? 0;
      const lift = opts.lift ?? 0;
      for (let s = 1; s <= steps && h > 0; s++) {
        const f = s / steps;
        // Integrate free particles.
        for (let k = cols; k < N; k++) {
          const q = k * 3;
          const j = Math.floor(k / cols), i = k - j * cols;
          const along = j / (rows - 1);
          const wob = Math.sin(time * 9.3 + j * 0.9 + i * 1.7) * Math.sin(time * 3.1 + j * 0.4);
          v[q] += (-v[q] * drag + wob * flutter * 2.2 * along) * h;
          v[q + 1] += (-grav - v[q + 1] * drag + lift * 7.5 * along + wob * flutter * 1.4) * h;
          v[q + 2] += (-v[q + 2] * drag + Math.cos(time * 7.7 + j + i) * flutter * 1.8 * along) * h;
          o[q] = p[q]; o[q + 1] = p[q + 1]; o[q + 2] = p[q + 2];
          p[q] += v[q] * h; p[q + 1] += v[q + 1] * h; p[q + 2] += v[q + 2] * h;
        }
        // Pins move smoothly across substeps.
        for (let i = 0; i < cols; i++) {
          const q = i * 3;
          p[q] = pinPrev[q] + (pins[q] - pinPrev[q]) * f;
          p[q + 1] = pinPrev[q + 1] + (pins[q + 1] - pinPrev[q + 1]) * f;
          p[q + 2] = pinPrev[q + 2] + (pins[q + 2] - pinPrev[q + 2]) * f;
        }
        // Constraints.
        for (let it = 0; it < 4; it++) {
          for (let j = 0; j < rows; j++) {
            // Closed: a drape that widens toward the hem; open: a taut wing.
            const along = j / (rows - 1);
            const taper = 1 + 0.38 * along * (1 - open) - 0.15 * along * open;
            const hr = hRestTop * taper;
            for (let i = 0; i < cols - 1; i++) constrain(j * cols + i, j * cols + i + 1, hr, j === 0 ? 0 : 0.85, false);
          }
          for (let j = 0; j < rows - 1; j++) {
            for (let i = 0; i < cols; i++) constrain(j * cols + i, (j + 1) * cols + i, segLen, 1, false);
          }
          for (let j = 0; j < rows - 2; j += 1) {
            for (let i = 0; i < cols; i += 2) constrain(j * cols + i, (j + 2) * cols + i, segLen * 2, 0.25, false);
          }
          collide(opts.capsules || [], opts.groundY ?? -1e9, opts.waterY ?? -1e9);
        }
        // Velocities from positions (PBD).
        for (let k = cols; k < N; k++) {
          const q = k * 3;
          v[q] = (p[q] - o[q]) / h; v[q + 1] = (p[q + 1] - o[q + 1]) / h; v[q + 2] = (p[q + 2] - o[q + 2]) / h;
        }
      }
      pinPrev.set(pins);

      // Write local-space vertices.
      inv.copy(parent.matrixWorld).invert();
      const arr = posAttr.array;
      for (let k = 0; k < N; k++) {
        tmp.set(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]).applyMatrix4(inv);
        arr[k * 3] = tmp.x; arr[k * 3 + 1] = tmp.y; arr[k * 3 + 2] = tmp.z;
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
    },

    reset() { initialised = false; },
  };
  return kain;
}
