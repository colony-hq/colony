# Landscape notes (terrain, ocean, sky, fog)

## Public APIs (DESIGN.md §7 unchanged; additions only)
- **fog** (`createFog`): unchanged API. New read-only `fog.mist` (drifting mist billboards).
  New shared uniforms in `fogUniforms`: `uFogHorizon` (haze colour = sky horizon, driven by sky),
  `uFogLanternRadius`, `uFogCam` (pocket map at camera), `uFogWind`, `uFogNoiseAmt`, `uFogMap`,
  `uFogNoise`. Everything that spreads `fogUniforms` gets them automatically.
  GLSL (unchanged signatures): `lenteraFog(wp)`, `lenteraFogColor(wp, fg)`, `lenteraApplyFog(c, wp)`.
  New GLSL helpers: `lenteraFogData(wp)` (kabut, haze, glow, tint), `lenteraSkyFog(dir)` (infinite
  ray, for domes), `lenteraKabutColor(v, tint)`, `lenteraHazeColor(v)`, `lenteraCompose(c, v, fd)`.
  `fogAmount(x,y,z)` uses the same logistic layer + pocket map as the shader (no noise).
- **sky**: `timeOfDay` is a getter/setter. Extra: `dome`, `night` (0..1), `sunDir`, `moonDir`,
  `keyDir`, `exposure` (read), `exposureBias` (write: multiplier on the keyed exposure — sky sets
  `renderer.toneMappingExposure` every frame, so use this instead of writing exposure directly).
  On `game:start` (not newGame) it resumes the evening from `progress.playTime`; quest `done` → dawn.
- **ocean**: extra `river` (Mesh), `uniforms`, `waveAmplitude` (0.235 m). `waveHeight(x,z,t)` defaults
  `t` to `ctx.time.t`; it is the exact CPU twin of the vertex waves (pass the same sim time).
- **terrain**: extra `uniforms`.

## Shared modules (landscape-owned, importable by anyone)
- `js/world/land-maps.js`: `getNoiseTexture()` (256² tileable RGBA fBm), `getRippleTexture()`,
  `getHeightTexture()` (R16F baked heightfield; `LAND_GLSL.height` gives `float landHeight(vec2 xz)`
  with uniform `uLandHeight`), `getFogMap()` / `sampleFogMap(x,z)` (kabut pockets).
- `js/world/sky-shared.js`: `skyUniforms` (sun/moon dirs + disc colours, key light dir/colour,
  ambient, night factor, sky colours). Handy for custom shaders that want to match the sky.
- `js/world/water-shaders.js`: `WAVES`, `waveHeightAt(x,z,t)`, `WAVE_GLSL` (`oceanWave`).

## Notes / requests for other builders
- Custom ShaderMaterials that include `FOG_GLSL.parsFragment` need `cameraPosition` (automatic in
  ShaderMaterial; a RawShaderMaterial must declare `uniform vec3 cameraPosition`).
- The kabut integral runs per pixel in every patched material. On SwiftShader it is the dominant
  cost, so avoid large full-screen transparent layers that are patched (each one pays it again).
- Render order: ocean `-10`, river `-9`, mist `5`, sky dome is opaque `1e6` (drawn after the world).
  Transparent effects that should sit over water need renderOrder > -10 (the default 0 is fine).
- The river ribbon ends at x = -156 at y 28.86, just under setdressing's waterfall top flow
  (struct-waterfall.js draws water over the cave roof at y ≈ 29.08–29.14 from x = -141); no change needed.
- Player/camera (player builder): keep the camera above the sea surface (the ocean is single-sided).
- Fog pockets (`LANDMARKS.fogPockets`) raise the kabut base locally (temple courtyard is inside the
  fog with the shrine top above it, waterfall cove gets spray mist). Spirits spawning with
  `fogAmount > 0.5` happens on low ground (≲ 10 m) and inside pockets, not on hilltops.
