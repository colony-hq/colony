// Shared sky/lighting uniforms (owner: landscape). sky.js writes them every frame; the ocean,
// river and terrain shaders read them so reflections, glitter and caustics always match the sky.
// All colours are linear (THREE.Color handles the sRGB hex conversion).

import * as THREE from 'three';

export const skyUniforms = {
  uSkyZenith: { value: new THREE.Color(0x2b3a6b) }, // top of the dome
  uSkyMid: { value: new THREE.Color(0x6a6aa0) }, // ~25° above the horizon
  uSkyGlow: { value: new THREE.Color(0xffa060) }, // sunset/sunrise glow around the sun
  uSkyGlowAmt: { value: 1 }, // 0..1 strength of that glow (fades with sun elevation)
  uSunPos: { value: new THREE.Vector3(-0.92, 0.07, -0.38).normalize() }, // true sun direction
  uSunDisc: { value: new THREE.Color(0xffd7a0) }, // disc colour * visibility (HDR multiplier in shader)
  uMoonPos: { value: new THREE.Vector3(0.3, 0.6, -0.7).normalize() },
  uMoonDisc: { value: new THREE.Color(0xdfe6ff) },
  uStars: { value: 0 }, // 0..1 star visibility
  uCloudLit: { value: new THREE.Color(0xffc0a0) },
  uCloudDark: { value: new THREE.Color(0x5a5880) },
  uCloudCover: { value: 0.5 },
  uKeyDir: { value: new THREE.Vector3(-0.8, 0.4, -0.3).normalize() }, // directional light (towards light)
  uKeyColor: { value: new THREE.Color(1, 0.7, 0.45) }, // key light colour * intensity
  uAmbSky: { value: new THREE.Color(0.25, 0.27, 0.4) }, // hemisphere sky colour * intensity
  uAmbGround: { value: new THREE.Color(0.1, 0.08, 0.07) },
  uNight: { value: 0 }, // 0 day/dusk .. 1 deep night
  uSkyTime: { value: 0 },
};
