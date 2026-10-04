// Renderer, scene, camera, post-processing and quality tiers.
// Owner: integration (core). See DESIGN.md §5.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Everything quality-dependent reads from these presets (engine.preset).
export const QUALITY_PRESETS = {
  low: {
    name: 'low', pixelRatio: 0.75, maxPixelRatio: 1, msaa: 0, shadows: false, shadowMapSize: 0,
    bloom: false, vegetationDensity: 0.35, grass: false, drawDistance: 320, particles: 0.4, waterDetail: 0,
  },
  medium: {
    name: 'medium', pixelRatio: 1, maxPixelRatio: 1.25, msaa: 0, shadows: true, shadowMapSize: 1024,
    bloom: true, vegetationDensity: 0.65, grass: true, drawDistance: 480, particles: 0.7, waterDetail: 1,
  },
  high: {
    name: 'high', pixelRatio: 1, maxPixelRatio: 1.75, msaa: 4, shadows: true, shadowMapSize: 2048,
    bloom: true, vegetationDensity: 1, grass: true, drawDistance: 700, particles: 1, waterDetail: 2,
  },
};

function detectTouch() {
  try {
    return (navigator.maxTouchPoints || 0) > 0 && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

function urlFlag(name) {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has(name)) return q.get(name) || true;
    const hash = window.location.hash.replace(/^#/, '');
    if (hash === name) return true;
  } catch { /* ignore */ }
  return null;
}

export function detectQuality(renderer) {
  const forced = urlFlag('q');
  if (forced && QUALITY_PRESETS[forced]) return forced;
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch { /* ignore */ }
  if (/swiftshader|llvmpipe|software|microsoft basic/i.test(gpu)) return 'low';
  if (detectTouch()) return 'medium';
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 4 && /intel/i.test(gpu)) return 'medium';
  return 'high';
}

export function createEngine({ canvas, quality: requested } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // MSAA happens in the composer target
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false; // count every pass of a frame (see render())

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1220);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 2400);
  camera.position.set(0, 12, 300);

  const isTouch = detectTouch();
  const resizeListeners = new Set();
  const size = { w: 1, h: 1, pixelRatio: 1 };

  let composer = null;
  let renderPass = null;
  let bloomPass = null;
  let outputPass = null;
  let target = null;

  const engine = {
    THREE,
    renderer,
    scene,
    camera,
    isTouch,
    size,
    quality: 'medium',
    preset: QUALITY_PRESETS.medium,
    gpu: '',
    get composer() { return composer; },
    get bloomPass() { return bloomPass; },
    stats: { fps: 60, frameMs: 16.7, drawCalls: 0, triangles: 0 },

    setQuality(q) {
      if (!QUALITY_PRESETS[q]) return;
      engine.quality = q;
      engine.preset = QUALITY_PRESETS[q];
      const p = engine.preset;
      const shadowsChanged = renderer.shadowMap.enabled !== p.shadows;
      renderer.shadowMap.enabled = p.shadows;
      if (shadowsChanged) {
        scene.traverse((o) => {
          if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
        });
      }
      buildComposer();
      engine.resize();
    },

    // Bloom tuning (finale, flames). Values are absolute.
    setBloom(strength, radius, threshold) {
      if (!bloomPass) return;
      if (strength != null) bloomPass.strength = strength;
      if (radius != null) bloomPass.radius = radius;
      if (threshold != null) bloomPass.threshold = threshold;
    },

    resize() {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      const p = engine.preset;
      const pr = Math.min(window.devicePixelRatio || 1, p.maxPixelRatio) * p.pixelRatio;
      size.w = w; size.h = h; size.pixelRatio = pr;
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (composer) {
        composer.setPixelRatio(pr);
        composer.setSize(w, h);
      }
      if (bloomPass) bloomPass.resolution.set(Math.round(w * pr * 0.5), Math.round(h * pr * 0.5));
      for (const fn of resizeListeners) fn(size);
    },

    onResize(fn) {
      resizeListeners.add(fn);
      return () => resizeListeners.delete(fn);
    },

    render() {
      renderer.info.reset();
      if (composer) composer.render();
      else renderer.render(scene, camera);
      const info = renderer.info.render;
      engine.stats.drawCalls = info.calls;
      engine.stats.triangles = info.triangles;
    },
  };

  function buildComposer() {
    const p = engine.preset;
    if (target) target.dispose();
    target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: p.msaa,
    });
    composer = new EffectComposer(renderer, target);
    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    bloomPass = null;
    if (p.bloom) {
      bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.86);
      composer.addPass(bloomPass);
    }
    outputPass = new OutputPass();
    composer.addPass(outputPass);
  }

  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    engine.gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch { /* ignore */ }

  const initial = requested && requested !== 'auto' && QUALITY_PRESETS[requested] ? requested : detectQuality(renderer);
  engine.quality = initial;
  engine.preset = QUALITY_PRESETS[initial];
  renderer.shadowMap.enabled = engine.preset.shadows;
  buildComposer();
  engine.resize();
  window.addEventListener('resize', () => engine.resize());

  return engine;
}

// Frame-time watchdog: steps quality down when the game runs badly for a while.
export function createPerfGovernor(engine, { enabled = true } = {}) {
  // Measured on the wall clock: the loop clamps dt, which would hide very slow frames.
  let start = performance.now(), frames = 0, slowWindows = 0, cooldown = 4;
  return {
    enabled,
    update() {
      frames++;
      const now = performance.now();
      const acc = (now - start) / 1000;
      if (acc < 2) return;
      const ms = (acc / frames) * 1000;
      start = now;
      engine.stats.frameMs = ms;
      engine.stats.fps = 1000 / ms;
      frames = 0;
      if (cooldown > 0) { cooldown -= 2; return; }
      if (!this.enabled) return;
      if (ms > 42) slowWindows++;
      else slowWindows = Math.max(0, slowWindows - 1);
      if (slowWindows >= 2) {
        slowWindows = 0;
        cooldown = 6;
        if (engine.quality === 'high') engine.setQuality('medium');
        else if (engine.quality === 'medium') engine.setQuality('low');
        else if (engine.preset.pixelRatio > 0.5) {
          engine.preset = { ...engine.preset, pixelRatio: engine.preset.pixelRatio - 0.15 };
          engine.resize();
        }
      }
    },
  };
}
