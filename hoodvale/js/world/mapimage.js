// BASELINE — owner: world builder. Paints the overworld (or a dungeon) into a canvas for the
// minimap and the world map. API: paintRegion(regionId, pxPerTile) -> HTMLCanvasElement.
import { getRegionGrid, OVERWORLD, DUNGEONS, T_WATER, T_ROAD, T_WALL, T_INDOOR, T_CLIFF, T_BRIDGE } from './mapgen.js';

export function paintRegion(regionId = 'overworld', s = 2) {
  const R = regionId === 'overworld' ? OVERWORLD : DUNGEONS[regionId];
  const G = getRegionGrid(R.id);
  const cv = document.createElement('canvas');
  cv.width = G.W * s; cv.height = G.H * s;
  const g = cv.getContext('2d');
  for (let z = 0; z < G.H; z++) for (let x = 0; x < G.W; x++) {
    const f = G.flags[z * G.W + x];
    const h = G.heights[z * G.N + x];
    let c = '#4f7f35';
    if (R.id !== 'overworld') c = f & 1 ? '#1d1712' : '#5a4e40';
    else if (f & T_WATER && !(f & T_BRIDGE)) c = '#2d6797';
    else if (f & T_BRIDGE) c = '#8a6a44';
    else if (f & T_WALL) c = '#e8e0d0';
    else if (f & T_INDOOR) c = '#8a6d4c';
    else if (f & T_ROAD) c = '#a0875f';
    else if (f & T_CLIFF) c = '#6f6a62';
    else if (h < 0.4) c = '#c9b88a';
    else if (h > 20) c = '#7a8566';
    g.fillStyle = c;
    g.fillRect(x * s, z * s, s, s);
  }
  return cv;
}
