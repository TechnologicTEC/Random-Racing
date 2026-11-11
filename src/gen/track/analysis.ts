import type { AnalysisConfig, TrackConfig } from '../../config';
import { TAU } from '../../core/dmath';
import type { CenterLine, CornerSection, Section } from '../types';

const DEGREES_PER_RADIAN = 360 / TAU;

/**
 * Splits the lap into straights and corners, in driving order, starting with
 * the section that contains the first sample. Each corner turns one way only,
 * so an S-bend is two corners.
 */
export function analyseSections(line: CenterLine, cfg: TrackConfig): Section[] {
  const rules = cfg.analysis;
  const labels = labelSamples(line, rules);
  const runs = encodeRuns(labels);

  const sections: Section[] = runs.map((run) => {
    const length = run.count * line.spacing;
    if (run.label === 0) return { type: 'straight', startIndex: run.start, sampleCount: run.count, length };

    let turn = 0;
    let tightest = 0;
    let apexIndex = run.start;
    for (let k = 0; k < run.count; k++) {
      const i = (run.start + k) % line.count;
      const curvature = Math.abs(line.curvature[i]!);
      turn += curvature * line.spacing;
      if (curvature > tightest) {
        tightest = curvature;
        apexIndex = i;
      }
    }
    return {
      type: 'corner',
      startIndex: run.start,
      sampleCount: run.count,
      length,
      direction: run.label > 0 ? 'right' : 'left',
      turnDegrees: turn * DEGREES_PER_RADIAN,
      minRadius: 1 / tightest,
      meanRadius: length / turn,
      apexIndex,
      kind: 'corner',
    };
  });

  classifyCorners(sections, cfg);
  return sections;
}

/**
 * Names each corner in a list of sections (hairpin, sweeper, chicane, kink or
 * plain corner). The list is treated as a loop. Changes the sections in place.
 */
export function classifyCorners(sections: Section[], cfg: TrackConfig): void {
  const rules = cfg.analysis;
  for (const section of sections) {
    if (section.type !== 'corner') continue;
    if (section.turnDegrees < rules.kinkMaxDegrees) section.kind = 'kink';
    else if (section.turnDegrees >= rules.hairpinMinDegrees && section.meanRadius <= rules.hairpinMaxRadius) section.kind = 'hairpin';
    else if (section.minRadius >= rules.sweeperMinRadius) section.kind = 'sweeper';
    else section.kind = 'corner';
  }

  // A chicane is two opposite corners back to back, or with only a short straight between.
  const count = sections.length;
  const canBeChicane = (corner: CornerSection): boolean =>
    corner.turnDegrees >= rules.chicaneMinDegrees && corner.turnDegrees <= rules.chicaneMaxDegrees;
  const pairs: Array<[CornerSection, CornerSection]> = [];
  for (let i = 0; i < count; i++) {
    const first = sections[i]!;
    if (first.type !== 'corner' || !canBeChicane(first)) continue;
    let gap = 0;
    let j = (i + 1) % count;
    const between = sections[j]!;
    if (between.type === 'straight') {
      if (between.length > rules.chicaneMaxGap) continue;
      gap = between.length;
      j = (j + 1) % count;
    }
    const second = sections[j]!;
    if (j === i || second.type !== 'corner' || !canBeChicane(second)) continue;
    if (second.direction === first.direction) continue;
    if (first.length + gap + second.length > rules.chicaneMaxLength) continue;
    pairs.push([first, second]);
  }
  for (const [first, second] of pairs) {
    first.kind = 'chicane';
    second.kind = 'chicane';
  }
}

interface Run {
  /** 0 = straight, 1 = right turn, -1 = left turn. */
  label: number;
  start: number;
  count: number;
}

/** Labels every sample straight, right or left, then tidies away slivers. */
function labelSamples(line: CenterLine, rules: AnalysisConfig): Int8Array {
  const n = line.count;
  const labels = new Int8Array(n);
  const threshold = 1 / rules.straightRadius;
  for (let i = 0; i < n; i++) {
    const curvature = line.curvature[i]!;
    labels[i] = curvature >= threshold ? 1 : curvature <= -threshold ? -1 : 0;
  }

  const fill = (run: Run, from: number, to: number, label: number): void => {
    for (let k = from; k < to; k++) labels[(run.start + k) % n] = label;
  };

  for (let pass = 0; pass < 6; pass++) {
    let changed = false;

    // Bends that barely turn are part of a straight.
    for (const run of encodeRuns(labels)) {
      if (run.label === 0) continue;
      let turn = 0;
      for (let k = 0; k < run.count; k++) turn += Math.abs(line.curvature[(run.start + k) % n]!) * line.spacing;
      if (turn * DEGREES_PER_RADIAN < rules.minCornerDegrees) {
        fill(run, 0, run.count, 0);
        changed = true;
      }
    }

    // Straights too short to matter are shared out between the corners beside them.
    const runs = encodeRuns(labels);
    if (runs.length > 1) {
      runs.forEach((run, index) => {
        if (run.label !== 0 || run.count * line.spacing >= rules.minStraightLength) return;
        const before = runs[(index - 1 + runs.length) % runs.length]!.label;
        const after = runs[(index + 1) % runs.length]!.label;
        const half = before === after ? run.count : Math.floor(run.count / 2);
        fill(run, 0, half, before);
        fill(run, half, run.count, after);
        changed = true;
      });
    }

    if (!changed) break;
  }
  return labels;
}

/** Groups neighbouring samples with the same label, treating the lap as a loop. */
function encodeRuns(labels: Int8Array): Run[] {
  const n = labels.length;
  let first = -1;
  for (let i = 0; i < n; i++) {
    if (labels[i] !== labels[(i - 1 + n) % n]) {
      first = i;
      break;
    }
  }
  if (first < 0) return [{ label: labels[0]!, start: 0, count: n }];

  const runs: Run[] = [];
  let runStart = first;
  for (let k = 1; k <= n; k++) {
    if (k === n || labels[(first + k) % n] !== labels[(first + k - 1) % n]) {
      runs.push({ label: labels[runStart % n]!, start: runStart % n, count: first + k - runStart });
      runStart = first + k;
    }
  }
  // The run that wraps past the end of the lap contains sample 0; list it first.
  if (first > 0) runs.unshift(runs.pop()!);
  return runs;
}
