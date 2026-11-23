import type { GenConfig } from '../../config';
import { Grid } from '../../core/grid';
import type { CenterLine, HeightField, Section, WallSpan } from '../types';
import { sampleField } from '../world/heightfield';

export interface WallInput {
  line: CenterLine;
  /** Height of the road's centre at each sample, in metres. */
  height: Float64Array;
  /** Banking at each sample (see `Road.cross`). */
  cross: Float64Array;
  /** Road width at each sample, in metres. */
  width: Float64Array;
  sections: readonly Section[];
  /** The island with the road fitted into it and the coast carved: the ground that is drawn and driven on. */
  ground: HeightField;
}

/**
 * Decides where the walls beside the road stand. The lap is made of pieces,
 * each from one sample of the centre line to the next, and each side of each
 * piece either has a wall or is open.
 *
 * A wall stands:
 * - on the outside of every real corner (not kinks), from a little before it to a little after;
 * - where another part of the lap runs close by on that side, so no one can cut across to it;
 * - where the ground beside the road rises or falls steeply: cuttings, embankments, cliffs, gorges;
 * - beside the start gate, whose posts stand outside the walls.
 *
 * Everywhere else the roadside is open: grass to run wide onto, and gentle
 * sand down to the sea. Openings too short to be worth having are closed, and
 * walls too short to see coming are lengthened.
 *
 * @returns the walls on the right of the direction of travel, then those on the left, each in order along the lap
 */
export function findWalls(input: WallInput, cfg: GenConfig): WallSpan[] {
  const { line, sections } = input;
  const n = line.count;
  const rules = cfg.road.walls;
  const beside = besideOtherSections(line, cfg.road.coupleMinArc, rules.closeGap + cfg.track.roadWidth);
  const lead = Math.floor(rules.cornerLead / line.spacing);
  const trail = Math.floor(rules.cornerTrail / line.spacing);
  const gate = Math.ceil(rules.gate / line.spacing);

  const spans: WallSpan[] = [];
  for (const side of [1, -1] as const) {
    const need = new Uint8Array(n);
    const mark = (piece: number): void => {
      need[((piece % n) + n) % n] = 1;
    };

    for (const section of sections) {
      if (section.type !== 'corner' || section.kind === 'kink') continue;
      // A right-hand corner's outside is on the left.
      if ((section.direction === 'right' ? -1 : 1) !== side) continue;
      for (let k = -lead; k < section.sampleCount + trail; k++) mark(section.startIndex + k);
    }
    for (let k = -gate; k < gate; k++) mark(k);
    const close = side > 0 ? beside.right : beside.left;
    for (let i = 0; i < n; i++) {
      if (close[i] === 1 || steepBeside(input, i, side, cfg)) need[i] = 1;
    }

    tidyWalls(need, Math.ceil(rules.minGap / line.spacing), Math.ceil(rules.minWall / line.spacing));
    spans.push(...spansOf(need, side));
  }
  return spans;
}

/** For one side of the road (1 right, -1 left): 1 for every piece of the lap that has a wall, 0 for the open ones. */
export function walledPieces(walls: readonly WallSpan[], pieces: number, side: 1 | -1): Uint8Array {
  const walled = new Uint8Array(pieces);
  for (const wall of walls) {
    if (wall.side !== side) continue;
    for (let k = 0; k < wall.pieceCount; k++) walled[(wall.startIndex + k) % pieces] = 1;
  }
  return walled;
}

/**
 * Tidies one side's walls round the loop, in place: an opening shorter than
 * `minGap` pieces is closed, and a wall shorter than `minWall` pieces is
 * lengthened evenly at both ends. Lengthening a wall can shorten the opening
 * next to it, so the two are repeated until nothing changes.
 *
 * @param need 1 for each piece that has a wall, 0 for each that is open
 */
export function tidyWalls(need: Uint8Array, minGap: number, minWall: number): void {
  const n = need.length;
  const fill = (start: number, count: number): void => {
    for (let k = 0; k < count; k++) need[(((start + k) % n) + n) % n] = 1;
  };
  for (let pass = 0; pass < 16; pass++) {
    let changed = false;
    for (const run of runsOf(need)) {
      if (run.count === n) return;
      if (run.value === 0 && run.count < minGap) {
        fill(run.start, run.count);
        changed = true;
      }
    }
    for (const run of runsOf(need)) {
      if (run.count === n) return;
      if (run.value === 1 && run.count < minWall) {
        const extra = Math.ceil((minWall - run.count) / 2);
        fill(run.start - extra, run.count + 2 * extra);
        changed = true;
      }
    }
    if (!changed) return;
  }
}

interface Run {
  /** The first piece of the run. */
  start: number;
  count: number;
  value: number;
}

/** The runs of equal values round a loop. A loop that is all one value is a single run starting at 0. */
function runsOf(values: Uint8Array): Run[] {
  const n = values.length;
  let first = -1;
  for (let i = 0; i < n; i++) {
    if (values[i] !== values[(i - 1 + n) % n]) {
      first = i;
      break;
    }
  }
  if (first < 0) return [{ start: 0, count: n, value: values[0] ?? 0 }];
  const runs: Run[] = [];
  for (let k = 0; k < n; k++) {
    const at = (first + k) % n;
    const last = runs[runs.length - 1];
    if (last && last.value === values[at]) last.count++;
    else runs.push({ start: at, count: 1, value: values[at]! });
  }
  return runs;
}

/** One side's walls as spans, in order of where they start. */
function spansOf(need: Uint8Array, side: 1 | -1): WallSpan[] {
  return runsOf(need)
    .filter((run) => run.value === 1)
    .map((run) => ({ startIndex: run.start, pieceCount: run.count, side }))
    .sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * True where the ground beside the road, on one side of one sample, rises or
 * falls too steeply to be left open. The ground is looked at every
 * `probeStep` metres from the outer edge of the verge out to `probeReach`,
 * and compared with the verge itself: a rise or fall counts when it is more
 * than `minRise`, and more than `maxSlope` on average over the distance out.
 */
function steepBeside(input: WallInput, i: number, side: 1 | -1, cfg: GenConfig): boolean {
  const { line, width, ground } = input;
  const rules = cfg.road.walls;
  const edge = width[i]! / 2;
  /** The ground `lateral` metres from the centre line, on this side. Right of the direction of travel is (-tz, tx) on the map. */
  const groundAt = (lateral: number): number =>
    sampleField(ground, line.x[i]! - line.tz[i]! * side * lateral, line.z[i]! + line.tx[i]! * side * lateral, 0);

  const verge = groundAt(edge + cfg.road.verge / 2);
  for (let out = rules.probeStep; out <= rules.probeReach + 1e-9; out += rules.probeStep) {
    const change = Math.abs(groundAt(edge + cfg.road.verge + out) - verge);
    if (change > rules.minRise && change > rules.maxSlope * out) return true;
  }
  return false;
}

/**
 * Marks, for each side, the samples that have a separate part of the lap
 * within `distance` metres on that side. Parts close together along the lap
 * (the two ends of one corner, say) do not count as separate, and neither
 * does road that lies ahead or behind rather than to the side.
 */
function besideOtherSections(line: CenterLine, minArc: number, distance: number): { right: Uint8Array; left: Uint8Array } {
  const n = line.count;
  const { x, z, tx, tz } = line;
  const right = new Uint8Array(n);
  const left = new Uint8Array(n);
  const grid = new Grid(distance);
  for (let i = 0; i < n; i++) grid.add(grid.cellOf(x[i]!), grid.cellOf(z[i]!), i);

  const minSteps = minArc / line.spacing;
  for (let i = 0; i < n; i++) {
    const cellX = grid.cellOf(x[i]!);
    const cellZ = grid.cellOf(z[i]!);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of grid.get(cellX + dx, cellZ + dz) ?? []) {
          const steps = Math.abs(i - j);
          if (steps <= minSteps || n - steps <= minSteps) continue;
          const ex = x[j]! - x[i]!;
          const ez = z[j]! - z[i]!;
          const squared = ex * ex + ez * ez;
          if (squared >= distance * distance) continue;
          // How far to the right of sample i the other part is. It counts as beside when
          // that is more than half its distance: within 60 degrees of straight across.
          const across = ex * -tz[i]! + ez * tx[i]!;
          if (across * across * 4 < squared) continue;
          if (across > 0) right[i] = 1;
          else left[i] = 1;
        }
      }
    }
  }
  return { right, left };
}
