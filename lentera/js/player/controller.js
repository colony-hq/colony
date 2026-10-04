// STUB — owner: player. Minimal walker so other modules can test. API: DESIGN.md §Player.
import * as THREE from 'three';
import { createCharacter } from './character.js';
import { LANDMARKS } from '../world/heightfield.js';

export function createPlayer(ctx) {
  const character = createCharacter({});
  ctx.scene.add(character.root);
  const light = new THREE.PointLight(0xffa64a, 6, 18, 1.6);
  ctx.scene.add(light);
  const S = LANDMARKS.spawn;
  const player = {
    position: new THREE.Vector3(S.x, S.y, S.z),
    velocity: new THREE.Vector3(),
    yaw: S.yaw,
    object: character.root,
    character,
    lanternLight: light,
    lanternWorld: new THREE.Vector3(),
    lanternRadius: 16,
    grounded: true, swimming: false, gliding: false, sprinting: false,
    stamina: 1,
    surface: 'wood',
    controlEnabled: true,
    teleport(x, y, z, yaw) {
      player.position.set(x, y, z);
      player.velocity.set(0, 0, 0);
      if (yaw !== undefined) player.yaw = yaw;
    },
    setControl(on) { player.controlEnabled = on; },
    faceToward(x, z) { player.yaw = Math.atan2(-(x - player.position.x), -(z - player.position.z)); },
    knockback(dx, dz, strength) { player.velocity.x += dx * strength; player.velocity.z += dz * strength; },
    update(dt) {
      if (dt <= 0) return;
      const { input, state, collision } = ctx;
      const camYaw = ctx.cameraRig?.yaw ?? 0;
      let mx = 0, mz = 0;
      if (state.mode === 'play' && player.controlEnabled) {
        const f = input.move.y, r = input.move.x;
        mx = -Math.sin(camYaw) * f + Math.cos(camYaw) * r;
        mz = -Math.cos(camYaw) * f - Math.sin(camYaw) * r;
      }
      const speed = input.down('sprint') ? 9 : 5.5;
      player.velocity.x = mx * speed;
      player.velocity.z = mz * speed;
      if (Math.hypot(mx, mz) > 0.1) player.yaw = Math.atan2(-mx, -mz);
      player.velocity.y -= 22 * dt;
      if (player.grounded && state.mode === 'play' && input.pressed('jump')) player.velocity.y = 7.5;
      player.position.addScaledVector(player.velocity, dt);
      collision.resolve(player.position, 0.4, 1.7);
      const g = collision.groundAt(player.position.x, player.position.z, player.position.y);
      const floor = Math.max(g.y, -0.9);
      if (player.position.y <= floor) { player.position.y = floor; player.velocity.y = 0; player.grounded = true; }
      else player.grounded = player.position.y - floor < 0.05;
      player.swimming = g.y < -0.9;
      player.surface = g.surface;
      character.root.position.copy(player.position);
      character.root.rotation.y = player.yaw;
      character.root.updateMatrixWorld();
      character.lanternSocket.getWorldPosition(player.lanternWorld);
      light.position.copy(player.lanternWorld);
    },
  };
  return player;
}
