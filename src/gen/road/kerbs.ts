import type { GenConfig, RoadConfig } from '../../config';
import { smoothstep } from '../../core/scalar';
import type { CenterLine, KerbSpan, MeshData, Section } from '../types';
import { MeshBuilder, type Point } from './meshBuilder';
import { ROAD_MATERIAL } from './ribbon';

/** A kerb ramps up to its full height over this distance at each end, in metres. */
const TAPER = 4;

/** The skirt down the outer side of a kerb leans out this far, in metres. */
const SKIRT_LEAN = 0.15;

/**
 * Decides where the kerbs go: one on the inside of every real corner (not
 * kinks), running through the corner with a little lead in and out. On a very
 * long corner the kerb is kept to its longest length, around the middle.
 */
export function findKerbs(line: CenterLine, sections: readonly Section[], cfg: RoadConfig): KerbSpan[] {
  const n = line.count;
  const lead = Math.round(cfg.kerbLead / line.spacing);
  const longest = Math.floor(cfg.kerbMaxLength / line.spacing);
  const kerbs: KerbSpan[] = [];
  for (const section of sections) {
    if (section.type !== 'corner' || section.kind === 'kink') continue;
    let start = section.startIndex - lead;
    let count = section.sampleCount + 2 * lead;
    if (count > longest) {
      start = Math.round(section.startIndex + section.sampleCount / 2 - longest / 2);
      count = longest;
    }
    kerbs.push({ startIndex: ((start % n) + n) % n, sampleCount: count, side: section.direction === 'right' ? 1 : -1 });
  }
  return kerbs;
}

/**
 * Builds the kerbs as triangles: a low ramp just outside the road edge, flush
 * with the road where they meet and rising towards the outside, in red and
 * white blocks. Each kerb fades up from nothing at its ends, and has a skirt
 * down its outer side so it never floats above the ground.
 *
 * @param width road width at each sample, in metres: the kerbs follow the true edge
 */
export function buildKerbs(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  kerbs: readonly KerbSpan[],
  cfg: GenConfig,
): MeshData {
  const road = cfg.road;
  const n = line.count;
  const blockSamples = Math.max(1, Math.round(road.kerbStripe / line.spacing));
  const taperSamples = Math.max(1, Math.round(TAPER / line.spacing));

  /**
   * A point beside the road at a sample: `beyond` metres outside the road edge
   * on the given side, `above` metres over the road's tilted plane.
   */
  const point = (i: number, side: 1 | -1, beyond: number, above: number): Point => {
    const lateral = side * (width[i]! / 2 + beyond);
    return {
      // Right of the direction of travel is (-tz, tx) on the map.
      x: line.x[i]! - line.tz[i]! * lateral,
      y: height[i]! + (cross ? cross[i]! * lateral : 0) + above,
      z: line.z[i]! + line.tx[i]! * lateral,
    };
  };

  const builder = new MeshBuilder();
  for (const kerb of kerbs) {
    const { side } = kerb;
    const outer = road.kerbWidth;
    const foot = road.kerbWidth + SKIRT_LEAN;
    /** Height of the kerb's outer edge at its k-th sample: nothing at either end, full height in between. */
    const rise = (k: number): number => road.kerbHeight * smoothstep(0, taperSamples, Math.min(k, kerb.sampleCount - 1 - k));

    for (let k = 0; k + 1 < kerb.sampleCount; k++) {
      const i = (kerb.startIndex + k) % n;
      const next = (kerb.startIndex + k + 1) % n;
      const material = Math.floor(k / blockSamples) % 2 === 0 ? ROAD_MATERIAL.kerbRed : ROAD_MATERIAL.kerbWhite;
      const innerHere = point(i, side, 0, 0);
      const innerNext = point(next, side, 0, 0);
      const outerHere = point(i, side, outer, rise(k));
      const outerNext = point(next, side, outer, rise(k + 1));
      const footHere = point(i, side, foot, -road.apronDrop);
      const footNext = point(next, side, foot, -road.apronDrop);
      // Quads are given left edge first, so they face upwards whichever side of the road the kerb is on.
      if (kerb.side > 0) {
        builder.quad(innerHere, outerHere, innerNext, outerNext, material);
        builder.quad(outerHere, footHere, outerNext, footNext, material);
      } else {
        builder.quad(outerHere, innerHere, outerNext, innerNext, material);
        builder.quad(footHere, outerHere, footNext, outerNext, material);
      }
    }
  }
  return builder.build();
}
