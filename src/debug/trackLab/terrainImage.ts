import type { HeightField } from '../../gen/types';
import type { TerrainPicture } from './draw';

type Rgb = [number, number, number];

/** Map colours by height in metres above the sea. Colours between two entries are blended. */
const SEA: Array<[height: number, colour: Rgb]> = [
  [-22, [14, 52, 100]],
  [-6, [24, 92, 132]],
  [0, [58, 146, 168]],
];
const LAND: Array<[height: number, colour: Rgb]> = [
  [0, [214, 198, 150]],
  [1.4, [214, 198, 150]],
  [2.4, [96, 140, 74]],
  [12, [122, 152, 80]],
  [24, [150, 146, 96]],
  [38, [142, 134, 120]],
  [58, [204, 204, 210]],
];

/** The map colour for a height: blues under water, sand on the beach, greens then greys going up. */
export function heightColour(height: number): Rgb {
  const stops = height < 0 ? SEA : LAND;
  if (height <= stops[0]![0]) return [...stops[0]![1]];
  for (let k = 1; k < stops.length; k++) {
    const [h1, c1] = stops[k]!;
    if (height > h1) continue;
    const [h0, c0] = stops[k - 1]!;
    const t = (height - h0) / (h1 - h0);
    return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
  }
  return [...stops[stops.length - 1]![1]];
}

/** Cut and fill shallower than this, in metres, is not tinted. */
const TINT_FROM = 0.3;
/** Cut or fill this deep, in metres, gets the strongest tint. */
const TINT_FULL = 4;
const CUT_TINT: Rgb = [226, 70, 58];
const FILL_TINT: Rgb = [66, 122, 236];

/**
 * A top-down picture of a height grid, one pixel per sample, as RGBA bytes.
 * Land is shaded as if lit from the top left, so hills and banks can be read.
 *
 * @param natural the ground before the road was built. When given, cuttings
 *   (ground now lower) are tinted red and embankments (ground now higher) blue.
 */
export function terrainPixels(field: HeightField, natural: HeightField | null = null): Uint8ClampedArray<ArrayBuffer> {
  const { size, cell, height } = field;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const c = iz * size + ix;
      const here = height[c]!;
      let light = 1;
      if (here > 0) {
        const west = height[iz * size + Math.max(ix - 1, 0)]!;
        const east = height[iz * size + Math.min(ix + 1, size - 1)]!;
        const north = height[Math.max(iz - 1, 0) * size + ix]!;
        const south = height[Math.min(iz + 1, size - 1) * size + ix]!;
        // Ground that rises towards the bottom right faces the light.
        const facing = (east - west + (south - north)) / (4 * cell);
        light = Math.min(1.4, Math.max(0.55, 1 + facing * 1.6));
      }
      let [r, g, b] = heightColour(here);
      r *= light;
      g *= light;
      b *= light;
      if (natural) {
        const dug = natural.height[c]! - here;
        const depth = Math.abs(dug);
        if (depth > TINT_FROM) {
          const strength = 0.7 * Math.min(1, (depth - TINT_FROM) / (TINT_FULL - TINT_FROM)) + 0.15;
          const tint = dug > 0 ? CUT_TINT : FILL_TINT;
          r += (tint[0] - r) * strength;
          g += (tint[1] - g) * strength;
          b += (tint[2] - b) * strength;
        }
      }
      pixels[c * 4] = r;
      pixels[c * 4 + 1] = g;
      pixels[c * 4 + 2] = b;
      pixels[c * 4 + 3] = 255;
    }
  }
  return pixels;
}

/**
 * Turns a height grid into a picture the lab can draw under a track. Browser only.
 * Give the natural ground as well to tint cuttings and embankments.
 */
export function terrainPicture(field: HeightField, natural: HeightField | null = null): TerrainPicture {
  const canvas = document.createElement('canvas');
  canvas.width = field.size;
  canvas.height = field.size;
  canvas.getContext('2d')?.putImageData(new ImageData(terrainPixels(field, natural), field.size, field.size), 0, 0);
  return { image: canvas, origin: field.origin, cell: field.cell, size: field.size };
}
