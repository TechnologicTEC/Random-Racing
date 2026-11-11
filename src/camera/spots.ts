import { config } from '../config';
import type { FitReport, FitSpot } from '../gen/types';
import type { Orbit } from './orbit';

/** The places the fit report singles out, by the names used in the address bar (`&look=cut`). */
export const SPOT_NAMES = ['cut', 'fill', 'bank', 'close', 'water'] as const;
export type SpotName = (typeof SPOT_NAMES)[number];

const PICK: Record<SpotName, (report: FitReport) => FitSpot | null> = {
  cut: (report) => report.deepestCut,
  fill: (report) => report.tallestFill,
  bank: (report) => report.steepestBank,
  close: (report) => report.closestSections,
  water: (report) => report.nearestWater,
};

/**
 * A close camera aimed at one of the fit report's worst spots, for checking
 * by eye that the road sits cleanly where it is hardest to make it do so.
 * Returns null if the name is not a spot, or the report has no such spot.
 *
 * @param heightAt height of the ground at a point on the map, in metres
 */
export function lookAtSpot(
  name: string,
  report: FitReport,
  heightAt: (x: number, z: number) => number,
  view = config.camera.spot,
): Orbit | null {
  if (!(SPOT_NAMES as readonly string[]).includes(name)) return null;
  const spot = PICK[name as SpotName](report);
  if (!spot) return null;
  return {
    targetX: spot.x,
    // Never aim below the surface of the sea.
    targetY: Math.max(0, heightAt(spot.x, spot.z)),
    targetZ: spot.z,
    angle: view.angle,
    tilt: view.tilt,
    distance: view.distance,
  };
}
