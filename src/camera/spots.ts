import { config } from '../config';
import type { CenterLine, FitReport, FitSpot, Section } from '../gen/types';
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
  return closeView(spot.x, spot.z, heightAt, view);
}

/** Places on the track itself that are worth a close look, by the names used in the address bar. */
export const TRACK_SPOT_NAMES = ['hairpin', 'start'] as const;

/**
 * A close camera aimed at a place on the track: the middle of its tightest
 * corner (`hairpin`), or the start line (`start`). Returns null for any other name.
 */
export function lookAtTrack(
  name: string,
  line: CenterLine,
  sections: readonly Section[],
  heightAt: (x: number, z: number) => number,
  view = config.camera.spot,
): Orbit | null {
  if (name === 'start') return closeView(line.x[0]!, line.z[0]!, heightAt, view);
  if (name !== 'hairpin') return null;
  let tightest: (Section & { type: 'corner' }) | null = null;
  for (const section of sections) {
    if (section.type === 'corner' && section.kind !== 'kink' && (!tightest || section.minRadius < tightest.minRadius)) tightest = section;
  }
  if (!tightest) return null;
  const middle = (tightest.startIndex + Math.floor(tightest.sampleCount / 2)) % line.count;
  return closeView(line.x[middle]!, line.z[middle]!, heightAt, view);
}

/**
 * A close camera aimed at any position on the map, written as "x,z" in metres
 * (`&at=122,-250`). Returns null if the text is not two numbers.
 */
export function lookAtPoint(text: string, heightAt: (x: number, z: number) => number, view = config.camera.spot): Orbit | null {
  const parts = text.split(',');
  if (parts.length !== 2 || parts.some((part) => part.trim() === '')) return null;
  const x = Number(parts[0]);
  const z = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return closeView(x, z, heightAt, view);
}

function closeView(x: number, z: number, heightAt: (x: number, z: number) => number, view: typeof config.camera.spot): Orbit {
  return {
    targetX: x,
    // Never aim below the surface of the sea.
    targetY: Math.max(0, heightAt(x, z)),
    targetZ: z,
    angle: view.angle,
    tilt: view.tilt,
    distance: view.distance,
  };
}
