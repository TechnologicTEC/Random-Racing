import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../../gen';
import type { CenterLine, WorldResult } from '../../gen/types';
import { circleLine, hourglassLine, uniformWidth } from '../../testing/trackFixtures';
import { checkpointAt, checkpointCount, placeOnLap, startProgress, stepProgress, type ProgressState } from './progress';

const cfg = config.sim.progress;

/** The folded seed whose sections come closest on the 20 m road: 67.5 m apart, centre to centre, at samples 814 and 906. */
const FOLDED = 147;
const CLOSE = { a: 814, b: 906 };

const worlds = new Map<number, WorldResult>();
beforeAll(() => {
  for (const seed of [7, FOLDED]) worlds.set(seed, generateWorld(seed, config));
}, 60_000);

const lineOf = (seed: number): CenterLine => {
  const world = worlds.get(seed)!;
  return world.track.candidates[world.track.winnerIndex]!.line;
};
const widthOf = (seed: number): Float64Array => worlds.get(seed)!.road.width;

/** A point `ahead` metres along the line from sample `i` (on its tangent) and `right` metres to its right. */
function pointAt(line: CenterLine, i: number, ahead: number, right: number): { x: number; z: number } {
  const j = ((i % line.count) + line.count) % line.count;
  const tx = line.tx[j]!;
  const tz = line.tz[j]!;
  return { x: line.x[j]! + tx * ahead - tz * right, z: line.z[j]! + tz * ahead + tx * right };
}

/** Metres from `a` forwards to `b` round a lap of `length`, from 0 up to the length. */
const forwards = (a: number, b: number, length: number): number => (((b - a) % length) + length) % length;

/** Moves a progress state through a list of points, one a step, keeping every state. */
function moveThrough(line: CenterLine, width: Float64Array, start: ProgressState, points: Array<{ x: number; z: number }>): ProgressState[] {
  const states: ProgressState[] = [];
  let state = start;
  for (const p of points) {
    state = stepProgress(state, line, width, p.x, p.z, cfg);
    states.push(state);
  }
  return states;
}

/**
 * Points along the line from sample `from` to sample `to` (forwards), a quarter of the spacing apart (half a metre),
 * `right(i)` metres to its right: between two samples, the place and the right-hand direction are both taken evenly
 * between theirs, so on a corner the points follow it at any offset.
 */
function along(line: CenterLine, from: number, to: number, right: (i: number) => number = () => 0): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = [];
  const n = line.count;
  for (let i = from; i < to; i++) {
    const a = ((i % n) + n) % n;
    const b = (a + 1) % n;
    for (let k = 0; k < 4; k++) {
      const u = k / 4;
      const r = right(i);
      const x = line.x[a]! + (line.x[b]! - line.x[a]!) * u;
      const z = line.z[a]! + (line.z[b]! - line.z[a]!) * u;
      const rx = -(line.tz[a]! + (line.tz[b]! - line.tz[a]!) * u);
      const rz = line.tx[a]! + (line.tx[b]! - line.tx[a]!) * u;
      const size = Math.hypot(rx, rz);
      points.push({ x: x + (rx / size) * r, z: z + (rz / size) * r });
    }
  }
  return points;
}

describe('checkpoints', () => {
  it('divide the lap evenly into the nearest whole number of 100 m, the first on the start line', () => {
    const line = circleLine(100);
    const n = checkpointCount(line, cfg);
    expect(n).toBe(Math.round(line.length / 100));
    expect(checkpointAt(line, 0, cfg)).toBe(0);
    for (let k = 0; k < n; k++) expect(checkpointAt(line, k, cfg)).toBeCloseTo((k * line.length) / n, 9);
  });

  it('are about 100 m apart on real laps', () => {
    for (const seed of [7, FOLDED]) {
      const line = lineOf(seed);
      const gap = line.length / checkpointCount(line, cfg);
      expect(gap).toBeGreaterThan(95);
      expect(gap).toBeLessThan(105);
    }
  });
});

describe('placeOnLap', () => {
  const line = circleLine(100);

  it('gives metres along the lap from the start line and metres to the right of the centre line', () => {
    const p = pointAt(line, 40, 0.6, 3);
    const place = placeOnLap(line, p.x, p.z, 40, cfg);
    expect(place.near).toBe(40);
    expect(place.along).toBeCloseTo(40 * line.spacing + 0.6, 1);
    expect(place.off).toBeCloseTo(3, 1);
    const left = pointAt(line, 40, 0, -5);
    expect(placeOnLap(line, left.x, left.z, 40, cfg).off).toBeCloseTo(-5, 1);
  });

  it('wraps at the start line: a metre behind it is a metre short of a whole lap', () => {
    const p = pointAt(line, 0, -1, 0);
    const place = placeOnLap(line, p.x, p.z, 0, cfg);
    expect(place.along).toBeCloseTo(line.length - 1, 1);
    expect(place.along).toBeLessThan(line.length);
  });

  it('looks only near the last place, so it stays on its own section beside another 60 m away', () => {
    const hourglass = hourglassLine(60);
    // The two waists of the hourglass pass 60 m apart; find the sample nearest each.
    const nearestTo = (x: number, z: number): number => {
      let best = 0;
      for (let i = 0; i < hourglass.count; i++) {
        if (Math.hypot(hourglass.x[i]! - x, hourglass.z[i]! - z) < Math.hypot(hourglass.x[best]! - x, hourglass.z[best]! - z)) best = i;
      }
      return best;
    };
    const a = nearestTo(0, -30);
    const b = nearestTo(0, 30);
    // 25 m from its own section towards the other: still on its own.
    const toward = pointAt(hourglass, a, 0, Math.sign(hourglass.tx[a]!) * 25);
    const place = placeOnLap(hourglass, toward.x, toward.z, a, cfg);
    expect(Math.abs(place.near - a)).toBeLessThanOrEqual(2);
    // Set down on the other section: over 30 m from anything near the last place, so the whole lap is searched.
    const there = pointAt(hourglass, b, 0, 2);
    const found = placeOnLap(hourglass, there.x, there.z, a, cfg);
    expect(Math.abs(found.near - b)).toBeLessThanOrEqual(1);
    expect(found.off).toBeCloseTo(2, 0);
  });

  it('searches the whole lap for a car far along its own road, where the window finds only its own end', () => {
    const p = pointAt(line, 150, 0, 0);
    const place = placeOnLap(line, p.x, p.z, 0, cfg);
    expect(place.near).toBe(150);
  });
});

describe('startProgress', () => {
  it('puts a car 4 m behind the start line a lap short, with the start line the next checkpoint', () => {
    const line = lineOf(7);
    const p = pointAt(line, 0, -4, 0);
    const state = startProgress(line, p.x, p.z, cfg);
    expect(state.along).toBeCloseTo(line.length - 4, 3);
    expect(state.next).toBe(0);
    expect(state.passed).toBe(0);
  });

  it('makes the next checkpoint the first at or ahead of the car', () => {
    const line = lineOf(7);
    const p = pointAt(line, 25, 0, 0);
    expect(startProgress(line, p.x, p.z, cfg).next).toBe(1);
  });
});

describe('stepProgress on real laps', () => {
  it.each([7, FOLDED])('seed %i: a car moved round the centre line, weaving 8 m either side, has a place that only rises and passes every checkpoint in order', (seed) => {
    const line = lineOf(seed);
    const width = widthOf(seed);
    const n = checkpointCount(line, cfg);
    const behind = pointAt(line, 0, -4, 0);
    const start = startProgress(line, behind.x, behind.z, cfg);
    // One whole lap from the start, 4 m behind the line.
    const points = along(line, -2, line.count - 2, (i) => 8 * Math.sin(i / 20));
    const states = moveThrough(line, width, start, points);
    let previous = start;
    const order: number[] = [];
    states.forEach((state, step) => {
      // The place is where the point was put, within a few centimetres (the line bends between samples).
      const expected = (((step / 4 - 2) * line.spacing) % line.length + line.length) % line.length;
      const miss = forwards(expected, state.along, line.length);
      expect(Math.min(miss, line.length - miss)).toBeLessThan(0.15);
      // Only ever forwards, by half a metre or so.
      const moved = forwards(previous.along, state.along, line.length);
      expect(moved).toBeGreaterThan(0);
      expect(moved).toBeLessThan(1);
      if (state.passed !== previous.passed) order.push(previous.next);
      previous = state;
    });
    expect(order).toEqual(Array.from({ length: n }, (_, k) => k));
    expect(previous.passed).toBe(n);
    expect(previous.next).toBe(0);
  });

  it('seed 147: on one section at its closest to the next one, 15 m towards it, the place stays on its own section', () => {
    const line = lineOf(FOLDED);
    const gapX = line.x[CLOSE.b]! - line.x[CLOSE.a]!;
    const gapZ = line.z[CLOSE.b]! - line.z[CLOSE.a]!;
    expect(Math.hypot(gapX, gapZ)).toBeLessThan(70);
    const side = Math.sign(gapX * -line.tz[CLOSE.a]! + gapZ * line.tx[CLOSE.a]!);
    const p = pointAt(line, CLOSE.a, 0, side * 15);
    const place = placeOnLap(line, p.x, p.z, CLOSE.a - 2, cfg);
    expect(Math.abs(place.near - CLOSE.a)).toBeLessThanOrEqual(1);
  });

  it('seed 147: a car set down on the next section is found there, and is given no checkpoint for the jump', () => {
    const line = lineOf(FOLDED);
    const width = widthOf(FOLDED);
    const from = pointAt(line, CLOSE.a, 0, 0);
    const before = startProgress(line, from.x, from.z, cfg);
    const to = pointAt(line, CLOSE.b, 0, 0);
    const after = stepProgress(before, line, width, to.x, to.z, cfg);
    expect(Math.abs(after.near - CLOSE.b)).toBeLessThanOrEqual(1);
    expect(after.along).toBeCloseTo(CLOSE.b * line.spacing, 0);
    expect(after.next).toBe(before.next);
    expect(after.passed).toBe(before.passed);
  });

  it('seed 7: a cut across the grass that misses a checkpoint does not pass the one after it', () => {
    const line = lineOf(7);
    const width = widthOf(7);
    const at = (k: number): number => Math.round(checkpointAt(line, k, cfg) / line.spacing);
    const start = startProgress(line, pointAt(line, 0, -4, 0).x, pointAt(line, 0, -4, 0).z, cfg);
    // On the line past checkpoints 0 and 1, then 20 m off it (past half the road and 6 m) over checkpoint 2, then back on past 3.
    const off = (i: number): number => (i > at(2) - 10 && i < at(2) + 10 ? 20 : 0);
    const states = moveThrough(line, width, start, along(line, 0, at(3) + 10, off));
    const last = states[states.length - 1]!;
    expect(last.passed).toBe(2);
    expect(last.next).toBe(2);
  });

  it('seed 7: reversing over a checkpoint does not count, and coming forwards again does not count it twice', () => {
    const line = lineOf(7);
    const width = widthOf(7);
    const at = Math.round(checkpointAt(line, 1, cfg) / line.spacing);
    const start = startProgress(line, pointAt(line, 0, -4, 0).x, pointAt(line, 0, -4, 0).z, cfg);
    const ahead = along(line, 0, at + 10);
    let states = moveThrough(line, width, start, ahead);
    expect(states[states.length - 1]!.passed).toBe(2);
    // Back over it, and forwards again.
    const back = along(line, at - 10, at + 10).reverse();
    states = moveThrough(line, width, states[states.length - 1]!, [...back, ...along(line, at - 10, at + 20)]);
    for (const state of states) expect(state.passed).toBe(2);
  });

  it('seed 7: reversing on the line over a checkpoint that was missed does not count it', () => {
    const line = lineOf(7);
    const width = widthOf(7);
    const at = Math.round(checkpointAt(line, 1, cfg) / line.spacing);
    const start = startProgress(line, pointAt(line, 0, -4, 0).x, pointAt(line, 0, -4, 0).z, cfg);
    const missed = moveThrough(line, width, start, along(line, 0, at + 10, (i) => (i > at - 10 ? 20 : 0)));
    const beyond = missed[missed.length - 1]!;
    expect(beyond.next).toBe(1);
    const states = moveThrough(line, width, beyond, along(line, at - 10, at + 10).reverse());
    for (const state of states) expect(state.next).toBe(1);
  });
});

describe('the margin', () => {
  it('counts a checkpoint with the car up to half the road and 6 m off the line, and not beyond', () => {
    const line = circleLine(100);
    const width = uniformWidth(line, 20);
    const limit = 10 + cfg.margin;
    const at = Math.round(checkpointAt(line, 1, cfg) / line.spacing);
    const pass = (right: number): number => {
      const from = pointAt(line, at - 1, 0, right);
      const start = startProgress(line, from.x, from.z, cfg);
      expect(start.next).toBe(1);
      const to = pointAt(line, at + 1, 0, right);
      return stepProgress(start, line, width, to.x, to.z, cfg).passed;
    };
    expect(pass(limit - 0.01)).toBe(1);
    expect(pass(-(limit - 0.01))).toBe(1);
    expect(pass(limit + 0.01)).toBe(0);
    expect(pass(-(limit + 0.01))).toBe(0);
  });

  it('counts nothing for a step forwards of 40 m or more', () => {
    const line = circleLine(100);
    const width = uniformWidth(line, 20);
    const at = Math.round(checkpointAt(line, 1, cfg) / line.spacing);
    const from = pointAt(line, at - 1, 0, 0);
    const start = startProgress(line, from.x, from.z, cfg);
    // 21 samples (42 m) on: just past the window, and over 40 m forwards.
    const to = pointAt(line, at + 20, 0, 0);
    expect(stepProgress(start, line, width, to.x, to.z, cfg).passed).toBe(0);
  });
});
