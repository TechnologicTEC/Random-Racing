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
  [15, [118, 152, 80]],
  [45, [140, 156, 90]],
  // A mountain seed's road climbs to about 120 m, so grass runs on to there.
  [105, [146, 150, 100]],
  [150, [142, 136, 124]],
  [185, [190, 190, 196]],
  [225, [240, 240, 244]],
];

/** The map colour for a height: blues under water, sand on the beach, greens going up, then grey rock and snow at mountain heights. */
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
 * A top-down picture of a height grid as RGBA bytes. Land is shaded as if lit
 * from the top left, so hills and banks can be read.
 *
 * @param natural the ground before the road was built. When given, cuttings
 *   (ground now lower) are tinted red and embankments (ground now higher) blue.
 * @param detail pixels per sample along each side. With more than one, heights
 *   are blended between samples before they are coloured, so the waterline and
 *   every other edge come out as smooth lines rather than steps. The picture
 *   is (size - 1) * detail + 1 pixels wide.
 */
export function terrainPixels(
  field: HeightField,
  natural: HeightField | null = null,
  detail = 1,
): Uint8ClampedArray<ArrayBuffer> {
  const { size, cell, height } = field;

  // How much each sample faces the light. Ground that rises towards the bottom right faces it.
  const facing = new Float32Array(size * size);
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const west = height[iz * size + Math.max(ix - 1, 0)]!;
      const east = height[iz * size + Math.min(ix + 1, size - 1)]!;
      const north = height[Math.max(iz - 1, 0) * size + ix]!;
      const south = height[Math.min(iz + 1, size - 1) * size + ix]!;
      facing[iz * size + ix] = (east - west + (south - north)) / (4 * cell);
    }
  }

  const side = (size - 1) * detail + 1;
  const pixels = new Uint8ClampedArray(side * side * 4);
  const lastCell = Math.max(0, size - 2);
  for (let row = 0; row < side; row++) {
    const iz = Math.min(lastCell, Math.floor(row / detail));
    const fz = row / detail - iz;
    for (let col = 0; col < side; col++) {
      const ix = Math.min(lastCell, Math.floor(col / detail));
      const fx = col / detail - ix;
      const c = iz * size + ix;
      /** The value at this pixel, blended from the four samples around it. */
      const blend = (values: ArrayLike<number>): number => {
        const top = values[c]! + (values[c + 1]! - values[c]!) * fx;
        const bottom = values[c + size]! + (values[c + size + 1]! - values[c + size]!) * fx;
        return top + (bottom - top) * fz;
      };

      const here = blend(height);
      const light = here > 0 ? Math.min(1.25, Math.max(0.65, 1 + blend(facing) * 1.2)) : 1;
      let [r, g, b] = heightColour(here);
      r *= light;
      g *= light;
      b *= light;
      if (natural) {
        const dug = blend(natural.height) - here;
        const depth = Math.abs(dug);
        if (depth > TINT_FROM) {
          const strength = 0.7 * Math.min(1, (depth - TINT_FROM) / (TINT_FULL - TINT_FROM)) + 0.15;
          const tint = dug > 0 ? CUT_TINT : FILL_TINT;
          r += (tint[0] - r) * strength;
          g += (tint[1] - g) * strength;
          b += (tint[2] - b) * strength;
        }
      }
      const p = (row * side + col) * 4;
      pixels[p] = r;
      pixels[p + 1] = g;
      pixels[p + 2] = b;
      pixels[p + 3] = 255;
    }
  }
  return pixels;
}

/**
 * Turns a height grid into a picture the lab can draw under a track. Browser only.
 * Give the natural ground as well to tint cuttings and embankments.
 *
 * @param detail pixels per sample; see terrainPixels
 */
export function terrainPicture(field: HeightField, natural: HeightField | null = null, detail = 1): TerrainPicture {
  const side = (field.size - 1) * detail + 1;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  canvas.getContext('2d')?.putImageData(new ImageData(terrainPixels(field, natural, detail), side, side), 0, 0);
  return { image: canvas, origin: field.origin, cell: field.cell / detail, size: side };
}
