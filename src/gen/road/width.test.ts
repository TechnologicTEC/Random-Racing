import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { withCharacter } from '../../testing/characters';
import { stadiumLine } from '../../testing/trackFixtures';
import { generateWorld } from '../generate';
import { analyseSections } from '../track/analysis';
import { generateTrack, rotateCenterLine } from '../track/pipeline';
import type { CenterLine, Section } from '../types';
import { solveWidth } from './width';

const BASE = config.track.roadWidth;
const rules = config.road.width;
const TINY = 1e-9;

/** Two straights joined by half circles, with the lap starting part way down the first straight. */
function stadium(straight: number, radius: number): { line: CenterLine; sections: Section[] } {
  const line = rotateCenterLine(stadiumLine(straight, radius), Math.round((straight * 0.4) / 2));
  return { line, sections: analyseSections(line, config.track) };
}

/** True for samples that belong to a straight section. */
function onStraight(line: CenterLine, sections: readonly Section[]): Uint8Array {
  const straight = new Uint8Array(line.count);
  for (const section of sections) {
    if (section.type !== 'straight') continue;
    for (let k = 0; k < section.sampleCount; k++) straight[(section.startIndex + k) % line.count] = 1;
  }
  return straight;
}

/** For each sample, the distance to the nearest part of the lap that is a separate section (far away along the lap). */
function nearestOtherSection(line: CenterLine): Float64Array {
  const n = line.count;
  const apart = config.road.coupleMinArc / line.spacing;
  const out = new Float64Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const steps = Math.abs(i - j);
      if (steps <= apart || n - steps <= apart) continue;
      const d = Math.hypot(line.x[i]! - line.x[j]!, line.z[i]! - line.z[j]!);
      if (d < out[i]!) out[i] = d;
    }
  }
  return out;
}

describe('solveWidth on a simple lap', () => {
  // Two 600 m straights 200 m apart: far enough apart that both may widen.
  const { line, sections } = stadium(600, 100);
  const varied = solveWidth(7, line, sections, 'varied', config);
  const constant = solveWidth(7, line, sections, 'constant', config);

  it('gives one width for every sample of the centre line', () => {
    expect(varied).toHaveLength(line.count);
    expect(constant).toHaveLength(line.count);
  });

  it('keeps a constant-width seed at the base width all the way round', () => {
    expect(BASE).toBe(12);
    for (const width of constant) expect(width).toBe(BASE);
  });

  it('keeps a varied seed between the base width and 22 m', () => {
    expect(rules.max).toBe(22);
    for (const width of varied) {
      expect(width).toBeGreaterThanOrEqual(BASE - TINY);
      expect(width).toBeLessThanOrEqual(rules.max + TINY);
    }
  });

  it('always widens the start straight of a varied seed, to at least the smallest widening', () => {
    expect(varied[0]!).toBeGreaterThanOrEqual(rules.min - TINY);
  });

  it('holds the wider road for a good length, not just a bulge', () => {
    let run = 0;
    let longest = 0;
    for (let i = 0; i < line.count; i++) {
      run = Math.abs(varied[i]! - varied[0]!) < 1e-6 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    expect(longest * line.spacing).toBeGreaterThan(300);
  });

  it('never widens a corner: the change is finished before the straight ends', () => {
    const straight = onStraight(line, sections);
    let cornerSamples = 0;
    for (let i = 0; i < line.count; i++) {
      if (straight[i] === 1) continue;
      cornerSamples++;
      expect(varied[i]!).toBeCloseTo(BASE, 9);
    }
    expect(cornerSamples).toBeGreaterThan(100);
  });

  it('eases every change of width over about 40 m', () => {
    expect(rules.ease).toBe(40);
    // An S-shaped change over the easing length is at its quickest in the middle, at twice the average rate.
    const quickest = (2 * (rules.max - BASE)) / rules.ease;
    let changes = 0;
    for (let i = 0; i < line.count; i++) {
      const step = Math.abs(varied[(i + 1) % line.count]! - varied[i]!);
      expect(step / line.spacing).toBeLessThanOrEqual(quickest + TINY);
      if (step > 0) changes++;
    }
    // From base to wide and back, each taking about the easing length.
    expect(changes * line.spacing).toBeGreaterThanOrEqual(2 * rules.ease - 4 * line.spacing);
    // No kinks either: the rate itself changes gradually.
    for (let i = 0; i < line.count; i++) {
      const before = varied[i]! - varied[(i - 1 + line.count) % line.count]!;
      const after = varied[(i + 1) % line.count]! - varied[i]!;
      expect(Math.abs(after - before)).toBeLessThanOrEqual((quickest * line.spacing) / 4);
    }
  });

  it('is the same for the same seed and different for another', () => {
    expect(solveWidth(7, line, sections, 'varied', config)).toEqual(varied);
    const others = [8, 9, 10, 11].map((seed) => solveWidth(seed, line, sections, 'varied', config));
    expect(others.some((other) => other[0] !== varied[0])).toBe(true);
  });

  it('picks different widths for different seeds, from the smallest widening up to the widest', () => {
    const starts = Array.from({ length: 60 }, (_, seed) => solveWidth(seed, line, sections, 'varied', config)[0]!);
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(rules.min - TINY);
    expect(Math.min(...starts)).toBeLessThan(rules.min + 1.5);
    expect(Math.max(...starts)).toBeGreaterThan(rules.max - 1.5);
  });
});

describe('solveWidth beside a close section', () => {
  it('never widens two straights that run 40 m apart', () => {
    const { line, sections } = stadium(600, 20);
    for (let seed = 0; seed < 10; seed++) {
      for (const width of solveWidth(seed, line, sections, 'varied', config)) expect(width).toBe(BASE);
    }
  });

  it('widens them once they are further apart than the clearance', () => {
    const { line, sections } = stadium(600, rules.clearance / 2 + 5);
    expect(solveWidth(3, line, sections, 'varied', config)[0]!).toBeGreaterThanOrEqual(rules.min - TINY);
  });
});

describe('solveWidth on generated tracks', () => {
  const cfg = withCharacter(config, { width: 'varied' });
  const tracks = Array.from({ length: 60 }, (_, i) => generateTrack(i + 1, cfg));
  const all = tracks.map((track) => {
    const { line, sections } = track.candidates[track.winnerIndex]!;
    return { seed: track.seed, line, sections, width: solveWidth(track.seed, line, sections, 'varied', cfg) };
  });

  it('stays between 12 and 22 m on every seed', () => {
    for (const { width, seed } of all) {
      for (const value of width) {
        expect(value, `seed ${seed}`).toBeGreaterThanOrEqual(BASE - TINY);
        expect(value, `seed ${seed}`).toBeLessThanOrEqual(rules.max + TINY);
      }
    }
  });

  it('widens only straights', () => {
    for (const { line, sections, width, seed } of all) {
      const straight = onStraight(line, sections);
      for (let i = 0; i < line.count; i++) {
        if (straight[i] === 0) expect(width[i]!, `seed ${seed} sample ${i}`).toBeCloseTo(BASE, 9);
      }
    }
  });

  it('never widens where another section of the lap is within the clearance', () => {
    for (const { line, width, seed } of all) {
      const other = nearestOtherSection(line);
      for (let i = 0; i < line.count; i++) {
        if (other[i]! < rules.clearance) expect(width[i]!, `seed ${seed} sample ${i}`).toBeCloseTo(BASE, 9);
      }
    }
  });

  it('eases every change', () => {
    const quickest = (2 * (rules.max - BASE)) / rules.ease;
    for (const { line, width, seed } of all) {
      for (let i = 0; i < line.count; i++) {
        const step = Math.abs(width[(i + 1) % line.count]! - width[i]!);
        expect(step / line.spacing, `seed ${seed}`).toBeLessThanOrEqual(quickest + TINY);
      }
    }
  });

  it('gives most varied seeds a clearly wider stretch, and varies how much of the lap is wide', () => {
    const widest = all.map(({ width }) => Math.max(...width));
    expect(widest.filter((value) => value >= rules.min - 0.01).length).toBeGreaterThanOrEqual(all.length * 0.85);
    const shares = all.map(({ width }) => width.filter((value) => value > BASE + 1).length / width.length);
    expect(Math.max(...shares)).toBeGreaterThan(0.25);
    expect(Math.max(...shares)).toBeLessThan(0.75);
    expect(new Set(shares.map((share) => Math.round(share * 20))).size).toBeGreaterThan(4);
  });
});

describe('road width in a generated world', () => {
  const coarse = { ...config, world: { ...config.world, tile: { ...config.world.tile, cell: 8 } } };

  it('is part of the world, one value per sample of the winning line', () => {
    const world = generateWorld(4, withCharacter(coarse, { width: 'varied' }));
    const winner = world.track.candidates[world.track.winnerIndex]!;
    expect(world.road.width).toHaveLength(winner.line.count);
    expect(world.road.width).toEqual(solveWidth(4, winner.line, winner.sections, 'varied', coarse));
  });

  it('is the base width everywhere on a constant-width seed', () => {
    const world = generateWorld(4, withCharacter(coarse, { width: 'constant' }));
    for (const width of world.road.width) expect(width).toBe(BASE);
  });

  it('is chosen after the winner, so it never changes which layout wins', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const plain = generateTrack(seed, withCharacter(config, { width: 'constant' }));
      const wide = generateTrack(seed, withCharacter(config, { width: 'varied' }));
      expect(wide.winnerIndex).toBe(plain.winnerIndex);
      expect(wide.candidates[wide.winnerIndex]!.line).toEqual(plain.candidates[plain.winnerIndex]!.line);
    }
  });
});
