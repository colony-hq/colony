// Decor: every non-interactive bit of dressing. Owner: world builder.
//
//  - Vegetation + rocks, streamed around the focus point by w-scatter (one InstancedMesh per type,
//    density from engine.preset.vegetationDensity, grass only when preset.grass): grass tufts,
//    zone-coloured flowers, bushes (some with berries), ferns, mushrooms (glowing ones in Mistfen),
//    reeds on shores, lily pads + flowers, Mistfen dead trees with hanging moss, Orbio crystal
//    shards, boulders (Copperhollow, highlands, every cliff), pebbles/scree, farm crops (barley,
//    cabbages, pumpkins), pines on the mountain borders. Never on roads, water (except reeds /
//    lilies / bog trees), indoor tiles or occupied object tiles.
//  - Dungeons: cave walls (warrens, lair) / masonry + banners (vault), wall torches with flames
//    and pooled lights, stalagmites, glowing fungus, ash crystals, bones.
//  - Village night lights: door lanterns, gate lanterns, pier lanterns, forge glows, the Spire.
//  - Ambience: fireflies (night), embers + ash at the Ashen Peak and in the lair, Mistfen ground
//    mist, Hoodwood light shafts (day), birds and gulls.
//
// API: update(dt, t), scatters {name: Scatter}, dungeons [{id, group, spots}], fx {...},
//      lights (registered light sources), focus {x, z, region}.

import * as THREE from 'three';
import { Scatter, decorMaterial } from './w-scatter.js';
import {
  geoGrassTuft, geoFlowers, geoBush, geoFern, geoMushrooms, geoReeds, geoLilyPad, geoLilyFlower, geoDeadTree,
  geoCrystals, geoBoulder, geoPebbles, geoWheat, geoCabbage, geoPumpkin, geoPine, populateOverworld,
} from './w-flora.js';
import { buildDungeons, geoStalagmites, geoBones, CUT } from './w-dungeon.js';
import { createFlames, createPoints, createMist, createShafts, createBirds } from './w-fx.js';
import { getFocus } from './w-common.js';
import { heightAt, DUNGEONS, getRegionGrid } from './mapgen.js';
import { BUILDINGS } from '../data/buildings.js';
import { ZONES, BRIDGES } from '../data/zones.js';
import { mulberry32 } from '../core/noise.js';

const TYPES = {
  grass: { geo: geoGrassTuft, mat: { wind: 0.55, double: true }, radius: 38, max: 9000, grass: true },
  flowers: { geo: geoFlowers, mat: { wind: 0.5, double: true }, radius: 52, max: 3000 },
  ferns: { geo: geoFern, mat: { wind: 0.25, double: true }, radius: 56, max: 3000 },
  mushrooms: { geo: geoMushrooms, mat: {}, radius: 45, max: 600 },
  glowshrooms: { geo: geoMushrooms, mat: { glowNight: 1.4 }, radius: 60, max: 600 },
  bushes: { geo: () => geoBush(false), mat: { wind: 0.05 }, radius: 90, max: 2000, shadow: true },
  berryBushes: { geo: () => geoBush(true), mat: { wind: 0.05 }, radius: 80, max: 700, shadow: true },
  reeds: { geo: geoReeds, mat: { wind: 0.3, double: true }, radius: 72, max: 3000 },
  lilies: { geo: geoLilyPad, mat: { double: true, bob: 0.012 }, radius: 72, max: 2000 },
  lilyFlowers: { geo: geoLilyFlower, mat: { double: true, bob: 0.012 }, radius: 60, max: 600 },
  deadTrees: { geo: geoDeadTree, mat: {}, radius: 130, max: 500, shadow: true },
  crystals: { geo: geoCrystals, mat: { glow: 0.5, glowNight: 1.1 }, radius: 120, max: 1200 },
  boulders: { geo: () => geoBoulder(81), mat: { flatShading: true }, radius: 115, max: 2500, shadow: true },
  pebbles: { geo: geoPebbles, mat: { flatShading: true }, radius: 34, max: 3000 },
  wheat: { geo: geoWheat, mat: { wind: 0.45, double: true }, radius: 75, max: 1500 },
  cabbages: { geo: geoCabbage, mat: {}, radius: 60, max: 500 },
  pumpkins: { geo: geoPumpkin, mat: {}, radius: 60, max: 400 },
  pines: { geo: geoPine, mat: { flatShading: true }, radius: 240, max: 3500, shadow: true },
  // dungeons (region 'dungeon' = any dungeon)
  stalag: { geo: geoStalagmites, mat: { flatShading: true }, radius: 45, max: 1500, region: 'dungeon' },
  dGlowshrooms: { geo: geoMushrooms, mat: { glow: 0.9, glowNight: 0.6 }, radius: 45, max: 600, region: 'dungeon' },
  dCrystals: { geo: geoCrystals, mat: { glow: 1.2 }, radius: 45, max: 600, region: 'dungeon' },
  bones: { geo: geoBones, mat: {}, radius: 40, max: 600, region: 'dungeon' },
};

export function createDecor(ctx) {
  const { scene, engine } = ctx;
  const S = {};
  for (const [name, T] of Object.entries(TYPES)) {
    S[name] = new Scatter(ctx, {
      name, geometry: T.geo(), material: decorMaterial(T.mat), radius: T.radius, max: T.max,
      castShadow: !!T.shadow, region: T.region || 'overworld',
    });
    S[name].grassOnly = !!T.grass;
    S[name].wantsShadow = !!T.shadow;
  }
  populateOverworld(S);

  // ---- lights + flames ----
  const flames = [];
  const lights = [];
  const addLight = (src) => {
    const s = ctx.sky?.addLight ? ctx.sky.addLight(src) : src;
    lights.push(s);
    return s;
  };
  const dungeons = buildDungeons(ctx, { addFlames: flames, addLight, scatters: S });

  // Door lanterns (night), gate + pier lanterns, forge / spire glows.
  const warm = 0xffb25e;
  const lantern = (x, y, z, opts = {}) => {
    addLight({ x, y, z, color: opts.color ?? warm, intensity: opts.intensity ?? 7, distance: opts.distance ?? 9, flicker: opts.flicker ?? 0.08, night: opts.night ?? true, region: 'overworld' });
    flames.push({ x, y, z, size: opts.halo ?? 1.5, kind: opts.kind ?? 1, color: opts.color ?? warm, nightOnly: opts.night ?? true });
    if (opts.flame !== false && (opts.kind ?? 1) === 1) flames.push({ x, y: y - 0.08, z, size: 0.12, kind: 0, color: opts.color ?? warm, nightOnly: opts.night ?? true });
  };
  for (const b of BUILDINGS) {
    if (b.solid || !b.doors) continue;
    const fy = b.floorY ?? heightAt(b.x + b.w / 2, b.z + b.d / 2);
    const col = b.style?.includes('crystal') ? 0x8fe8ff : b.id === 'gm-sigils' ? 0xc89aff : warm;
    for (const d of b.doors) {
      let ox = 0, oz = 0;
      if (d.z === b.z) oz = -1; else if (d.z === b.z + b.d - 1) oz = 1; else if (d.x === b.x) ox = -1; else ox = 1;
      const x = d.x + 0.5 + ox * 0.75 + oz * 0.85, z = d.z + 0.5 + oz * 0.75 - ox * 0.85;
      lantern(x, fy + 2.3, z, { color: col });
    }
  }
  const G = ZONES.gildmoor;
  for (const g of G.gates) {
    for (const side of [-1, 1]) {
      const a = g.ang + side * (2.8 / G.wallR);
      const x = G.x + Math.cos(a) * (G.wallR + 1.4), z = G.z + Math.sin(a) * (G.wallR + 1.4);
      lantern(x, heightAt(x, z) + 3.2, z, { intensity: 9, distance: 11 });
    }
  }
  for (const br of BRIDGES) {
    if (br.kind === 'pier') {
      const x = (br.x0 + br.x1 + 1) / 2, z = br.z1 + 0.8;
      lantern(x, br.deckY + 1.9, z, { intensity: 8, distance: 10 });
    } else {
      for (const end of [0, 1]) {
        const x = br.axis === 'x' ? (end ? br.x1 + 1 : br.x0) : (br.x0 + br.x1 + 1) / 2;
        const z = br.axis === 'x' ? br.z0 - 0.2 : (end ? br.z1 + 1 : br.z0);
        lantern(x, br.deckY + 1.6, z, { intensity: 6, distance: 8 });
      }
    }
  }
  for (const o of ctx.spawns?.objects || []) {
    const cx = o.x + (o.w || 1) / 2, cz = o.z + (o.d || 1) / 2;
    if (o.def === 'furnace') addLight({ x: cx, y: heightAt(cx, cz) + 1.2, z: cz, color: 0xff7a30, intensity: 10, distance: 9, flicker: 0.25, night: true });
    else if (o.def === 'fire') addLight({ x: cx, y: heightAt(cx, cz) + 1.0, z: cz, color: 0xff8a3a, intensity: 14, distance: 13, flicker: 0.35, night: true });
    else if (o.def === 'crystal_altar') addLight({ x: cx, y: heightAt(cx, cz) + 1.6, z: cz, color: 0x7fe8ff, intensity: 9, distance: 10, flicker: 0.05, night: false });
    else if (o.def === 'lair_entrance') { addLight({ x: cx, y: heightAt(cx, cz) + 1.8, z: cz + 1, color: 0xff6a20, intensity: 12, distance: 12, flicker: 0.3, night: false }); flames.push({ x: cx, y: heightAt(cx, cz) + 1.6, z: cz + 0.6, size: 3.2, kind: 1, color: 0xff5a18 }); }
  }
  {
    const sp = BUILDINGS.find((b) => b.id === 'spire');
    if (sp) {
      const x = sp.x + sp.w / 2, z = sp.z + sp.d / 2, y = (sp.floorY ?? heightAt(x, z));
      addLight({ x, y: y + 7, z, color: 0x86e6ff, intensity: 22, distance: 26, flicker: 0.04, night: false });
      flames.push({ x, y: y + 12, z, size: 9, kind: 2, color: 0x7fdcff });
    }
  }

  // ---- ambience ----
  const P = engine.preset.particles ?? 0.7;
  const rand = mulberry32(2024);
  const ringPts = (cx, cz, r, n, yMin, yMax, landOnly = true) => {
    const out = [];
    for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * r;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const h = heightAt(x, z);
      if (landOnly && h < -0.6) continue;
      out.push(x, Math.max(0.1, h) + yMin + rand() * (yMax - yMin), z);
      i++;
    }
    return out;
  };
  const fxObjs = [];
  const fire = [
    ...ringPts(ZONES.mistfen.x, ZONES.mistfen.z, 34, Math.round(180 * P), 0.3, 1.6),
    ...ringPts(ZONES.hoodwood.x, ZONES.hoodwood.z, 40, Math.round(110 * P), 0.3, 1.8),
    ...ringPts(152, 246, 16, Math.round(40 * P), 0.3, 1.2),
  ];
  const fireflies = createPoints(scene, fire, { mode: 0, color: 0xd8ff7a, size: 10, name: 'fireflies' });
  const PK = ZONES.highlands.peak;
  const embers = createPoints(scene, ringPts(PK.x, PK.z, 24, Math.round(160 * P), 0, 1.0), { mode: 1, color: 0xff7a28, size: 7, span: 14, name: 'embers' });
  const ash = createPoints(scene, ringPts(PK.x, PK.z, 34, Math.round(140 * P), 2, 8), { mode: 2, color: 0x5a5652, size: 5, span: 9, additive: false, name: 'ash' });
  // lair embers rise from the floor
  const lairG = getRegionGrid('lair');
  const lairPts = [];
  for (let i = 0; i < 160 * P; i++) {
    const tx = Math.floor(rand() * lairG.W), tz = Math.floor(rand() * lairG.H);
    if (lairG.solid[tz * lairG.W + tx]) continue;
    lairPts.push(DUNGEONS.lair.x0 + tx + rand(), 0.1, DUNGEONS.lair.z0 + tz + rand());
  }
  const lairEmbers = createPoints(scene, lairPts, { mode: 1, color: 0xff6a20, size: 7, span: 6, name: 'lair-embers' });
  const mistSheets = [];
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * 34;
    const x = ZONES.mistfen.x + Math.cos(a) * rr, z = ZONES.mistfen.z + Math.sin(a) * rr;
    mistSheets.push({ x, z, y: Math.max(0, heightAt(x, z)) + 0.5 + rand() * 0.7, size: 10 + rand() * 9 });
  }
  const mist = engine.preset.name === 'low' ? null : createMist(scene, mistSheets);
  const shaftSpots = [];
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * 36;
    const x = ZONES.hoodwood.x + Math.cos(a) * rr, z = ZONES.hoodwood.z + Math.sin(a) * rr;
    const h = heightAt(x, z);
    if (h < 0.3) continue;
    shaftSpots.push({ x, y: h - 0.5, z, w: 1.4 + rand() * 1.8 });
  }
  const shafts = createShafts(scene, shaftSpots);
  const birds = createBirds(scene, [
    { x: 200, z: 306, r: 22, y: 13, count: 7, color: 0xf4f4f0, size: 0.6 },
    { x: 246, z: 224, r: 24, y: 17, count: 5, color: 0x1f1f26, size: 0.5 },
    { x: 160, z: 172, r: 30, y: 22, count: 5, color: 0x6a5040, size: 0.38 },
    { x: 186, z: 248, r: 34, y: 26, count: 4, color: 0x5a4a3a, size: 0.42 },
    { x: 96, z: 70, r: 42, y: 42, count: 2, color: 0x3a2e24, size: 1.0 },
  ]);
  const flameMesh = createFlames(scene, flames, 'lights');
  fxObjs.push(fireflies, embers, ash, mist, shafts);

  for (const s of Object.values(S)) s.build(scene);

  const focus = { x: 186, z: 252, region: 'overworld' };
  let shadowsOn = null;
  const decor = {
    scatters: S, dungeons, lights, focus,
    fx: { fireflies, embers, ash, lairEmbers, mist, shafts, birds, flames: flameMesh },
    update(dt, t) {
      getFocus(ctx, focus);
      const pr = engine.preset;
      const dens = pr.vegetationDensity ?? 0.65;
      const rs = pr.name === 'low' ? 0.72 : pr.name === 'medium' ? 0.88 : 1;
      if (shadowsOn !== !!pr.shadows) {
        shadowsOn = !!pr.shadows;
        for (const s of Object.values(S)) if (s.mesh) s.mesh.castShadow = shadowsOn && s.wantsShadow;
      }
      const region = focus.region;
      const inDungeon = region !== 'overworld';
      for (const s of Object.values(S)) {
        const active = s.region === 'dungeon' ? inDungeon : !inDungeon;
        s.update(focus.x, focus.z, active ? s.region : '-', s.grassOnly && !pr.grass ? 0 : dens, rs);
      }
      for (const d of dungeons) d.group.visible = d.id === region;
      const night = ctx.sky?.night ?? 0;
      if (fireflies) fireflies.visible = !inDungeon && night > 0.15;
      if (embers) embers.visible = !inDungeon;
      if (ash) ash.visible = !inDungeon;
      if (lairEmbers) lairEmbers.visible = region === 'lair';
      if (mist) mist.visible = !inDungeon;
      if (shafts) shafts.visible = !inDungeon && night < 0.6;
      if (birds) { birds.mesh.visible = !inDungeon; if (!inDungeon) birds.update(t ?? ctx.time?.t ?? 0); }
      // point sizes follow the drawing buffer height
      const px = (engine.size?.h || 720) * (engine.size?.pixelRatio || 1) / 720 * 60;
      for (const o of [fireflies, embers, ash, lairEmbers]) if (o) o.material.uniforms.uPx.value = px;
      // dungeon walls: cut the camera -> player line
      const p = ctx.player?.pos;
      if (inDungeon && p) {
        CUT.uCutA.value.copy(ctx.camera.position);
        CUT.uCutB.value.set(p.x, p.y + 1.1, p.z);
      } else {
        CUT.uCutA.value.set(0, -999, 0); CUT.uCutB.value.set(0, -999, 0);
      }
    },
  };
  return decor;
}
