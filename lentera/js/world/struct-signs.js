// Signposts at path forks (canvas-painted Indonesian labels). Owner: setdressing.
import { heightAt } from './heightfield.js';
import { signpost } from './props-common.js';

// [x, z, arms[{word, to:[x,z]}]] — words must exist in props-textures SIGN_WORDS.
const SIGNS = [
  [-91.5, 155.5, [{ word: 'Pantai Barat', to: [-145, 144] }, { word: 'Telaga', to: [-118, 110] }, { word: 'Kampung', to: [0, 158] }]],
  [12.5, 113, [{ word: 'Candi', to: [28, 60] }, { word: 'Kampung', to: [0, 158] }]],
  [44, 144.2, [{ word: 'Mercusuar', to: [90, 128] }, { word: 'Kampung', to: [0, 158] }]],
  [-166.5, 7.5, [{ word: 'Telaga', to: [-178, -30] }, { word: 'Kampung', to: [-146, 60] }]],
  [31.5, -96.5, [{ word: 'Candi', to: [30, -138] }, { word: 'Kampung', to: [52, -45] }]],
  [183, 57, [{ word: 'Mercusuar', to: [200, 40] }, { word: 'Kampung', to: [135, 98] }]],
  [-173.5, 140.5, [{ word: 'Pantai Barat', to: [-214, 150] }, { word: 'Kampung', to: [-95, 160] }]],
  [52.5, 6, [{ word: 'Candi', to: [52, -45] }, { word: 'Kampung', to: [28, 60] }]],
];

export function buildSigns(kit, api, scene) {
  const b = kit.builder('signs');
  const regions = kit.textures.decal.regions;
  for (const [x, z, arms] of SIGNS) signpost(b, x, heightAt(x, z), z, arms, regions);
  return b.build(scene);
}
