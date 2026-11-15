import type { GenConfig, RoadConfig } from '../../config';
import { Grid } from '../../core/grid';
import { createRng } from '../../core/rng';
import type { CenterLine, Section, StraightSection, WidthKind } from '../types';

/** A straight that could be widened, and the samples of it that may be. */
interface Stretch {
  section: StraightSection;
  /** Runs of samples that may be wide, as [first sample, how many]. They may wrap past the end of the lap. */
  runs: Array<[start: number, count: number]>;
  /** Length of its longest run, in samples. */
  longest: number;
  /** The start line is on it. */
  isStart: boolean;
}

/**
 * Chooses the road's width at every sample of the winning layout.
 *
 * A constant seed keeps the usual width all the way round. A varied seed
 * widens some of its straights: always the one with the start line, and often
 * other long straights and the straight after a hairpin. Each change of width
 * is eased, and finished before the straight ends, so corners are always the
 * usual width. The road is never widened where another part of the lap runs
 * close by, so the ground between neighbouring sections keeps its room.
 *
 * It is worked out after the winner is picked, from a random stream of its
 * own, so it never changes which layout wins.
 */
export function solveWidth(
  seed: number,
  line: CenterLine,
  sections: readonly Section[],
  kind: WidthKind,
  cfg: GenConfig,
): Float64Array {
  const base = cfg.track.roadWidth;
  const rules = cfg.road.width;
  const n = line.count;
  const wanted = new Float64Array(n).fill(base);
  if (kind === 'constant') return wanted;

  // Averaging twice over half the easing length turns each step into a smooth change over the whole of it.
  let window = Math.max(1, Math.round(rules.ease / 2 / line.spacing));
  if (window % 2 === 0) window++;
  // The averaging spreads a step this many samples each way, so a wide stretch
  // must stop this far short of anything that has to stay the usual width.
  const spread = window - 1;

  const crowded = nearOtherSections(line, cfg.road, rules.clearance);
  const rng = createRng(seed, 'track').fork('width');

  const stretches: Stretch[] = [];
  sections.forEach((section, k) => {
    if (section.type !== 'straight') return;
    const before = sections[(k - 1 + sections.length) % sections.length]!;
    const afterHairpin = before.type === 'corner' && before.kind === 'hairpin';
    const isStart = (n - section.startIndex) % n < section.sampleCount;
    const longEnough =
      section.length >= rules.straightMin || (afterHairpin && section.length >= rules.hairpinExitMin);
    if (!isStart && !longEnough) return;

    // Samples that are far enough from both ends of the straight and from anything crowded.
    const runs: Array<[number, number]> = [];
    let runStart = -1;
    // The first offset that is too near the end of the straight. The loop visits it too, to close a run that reaches it.
    const end = section.sampleCount - spread;
    for (let offset = spread; offset <= end; offset++) {
      const free = offset < end && isClear(crowded, (section.startIndex + offset) % n, spread);
      if (free && runStart < 0) runStart = offset;
      if (!free && runStart >= 0) {
        // Too short a run would be a bulge, never reaching its width.
        if (offset - runStart >= 3 * window) runs.push([(section.startIndex + runStart) % n, offset - runStart]);
        runStart = -1;
      }
    }
    if (runs.length === 0) return;
    stretches.push({ section, runs, longest: Math.max(...runs.map(([, count]) => count)), isStart });
  });

  // Every straight draws from a stream of its own, so one straight's choices never depend on another's.
  const chosen = stretches.filter(
    (stretch) => rng.fork(`chance-${stretch.section.startIndex}`).chance(rules.chance) || stretch.isStart,
  );
  if (chosen.length === 0 && stretches.length > 0) {
    // A varied seed should vary: failing all else, widen the straight with the most room.
    chosen.push(stretches.reduce((best, stretch) => (stretch.longest > best.longest ? stretch : best)));
  }
  for (const stretch of chosen) {
    const width = rng.fork(`width-${stretch.section.startIndex}`).range(rules.min, rules.max);
    for (const [start, count] of stretch.runs) {
      for (let k = 0; k < count; k++) wanted[(start + k) % n] = width;
    }
  }
  return average(average(wanted, window), window);
}

/** True when no sample within `spread` samples of sample i, along the lap, is crowded. */
function isClear(crowded: Uint8Array, i: number, spread: number): boolean {
  const n = crowded.length;
  for (let k = -spread; k <= spread; k++) {
    if (crowded[(((i + k) % n) + n) % n] === 1) return false;
  }
  return true;
}

/**
 * Marks the samples that have a separate part of the lap within `clearance`
 * metres of them. Parts close together along the lap (the two ends of one
 * corner, say) do not count as separate.
 */
function nearOtherSections(line: CenterLine, cfg: RoadConfig, clearance: number): Uint8Array {
  const n = line.count;
  const { x, z } = line;
  const crowded = new Uint8Array(n);
  const grid = new Grid(clearance);
  for (let i = 0; i < n; i++) grid.add(grid.cellOf(x[i]!), grid.cellOf(z[i]!), i);

  const minSteps = cfg.coupleMinArc / line.spacing;
  for (let i = 0; i < n; i++) {
    const cellX = grid.cellOf(x[i]!);
    const cellZ = grid.cellOf(z[i]!);
    search: for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.get(cellX + dx, cellZ + dz) ?? []) {
          const steps = Math.abs(i - j);
          if (steps <= minSteps || n - steps <= minSteps) continue;
          const ex = x[i]! - x[j]!;
          const ez = z[i]! - z[j]!;
          if (ex * ex + ez * ez < clearance * clearance) {
            crowded[i] = 1;
            break search;
          }
        }
      }
    }
  }
  return crowded;
}

/** Replaces each sample with the average of the `window` samples centred on it, around the loop. */
function average(values: Float64Array, window: number): Float64Array {
  const n = values.length;
  const half = (window - 1) / 2;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -half; k <= half; k++) sum += values[(((i + k) % n) + n) % n]!;
    out[i] = sum / window;
  }
  return out;
}
