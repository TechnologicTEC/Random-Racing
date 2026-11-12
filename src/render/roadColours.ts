import { ROAD_MATERIAL } from '../gen/road/ribbon';
import { ROAD, toLinear, type Rgb } from './palette';

/** Shown for a material number nobody has given a colour, so the mistake is easy to spot. */
const UNKNOWN: Rgb = [1, 0.1, 0.8];

const BY_MATERIAL = new Map<number, Rgb>([
  [ROAD_MATERIAL.asphalt, ROAD.asphalt],
  [ROAD_MATERIAL.line, ROAD.line],
  [ROAD_MATERIAL.shoulder, ROAD.shoulder],
  [ROAD_MATERIAL.kerbRed, ROAD.kerbRed],
  [ROAD_MATERIAL.kerbWhite, ROAD.kerbWhite],
]);

/**
 * Turns the material number of every vertex of a road mesh into a colour:
 * red, green and blue per vertex, in linear light, ready for Three.js.
 */
export function roadColours(materials: Uint8Array): Float32Array {
  const colours = new Float32Array(materials.length * 3);
  for (let v = 0; v < materials.length; v++) {
    const [r, g, b] = BY_MATERIAL.get(materials[v]!) ?? UNKNOWN;
    colours[v * 3] = toLinear(r);
    colours[v * 3 + 1] = toLinear(g);
    colours[v * 3 + 2] = toLinear(b);
  }
  return colours;
}
