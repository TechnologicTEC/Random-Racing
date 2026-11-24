import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { hashHandling, RECORD_FORMAT, type RunRecord } from '../sim/record';
import { ghostPlace } from './ghost';

const HALF = Math.SQRT1_2;
/** A made-up record: three places, 6 steps apart, the car moving along x and turning a quarter round about up. */
function madeUp(): RunRecord {
  return {
    format: RECORD_FORMAT,
    seed: 7,
    generator: 0,
    driver: 'player',
    every: 6,
    handling: hashHandling(config),
    inputs: new Uint32Array(14),
    // prettier-ignore
    places: Float32Array.from([
      0, 1, 0, 0, 0, 0, 1,
      6, 1, 0, 0, HALF, 0, HALF,
      12, 2, -3, 0, 1, 0, 0,
    ]),
    laps: [],
    splits: [],
    total: 0,
    hash: '00000000',
  };
}

describe('where the ghost is (ghostPlace)', () => {
  it('is exactly a kept place at a multiple of 6 steps', () => {
    const record = madeUp();
    expect(ghostPlace(record, 0)).toEqual({ position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
    expect(ghostPlace(record, 6)!.position).toEqual({ x: 6, y: 1, z: 0 });
    expect(ghostPlace(record, 6)!.rotation.y).toBeCloseTo(HALF, 6);
    expect(ghostPlace(record, 12)!.position).toEqual({ x: 12, y: 2, z: -3 });
  });

  it('is blended between the two nearest places in between, by step', () => {
    const record = madeUp();
    const half = ghostPlace(record, 9)!;
    expect(half.position).toEqual({ x: 9, y: 1.5, z: -1.5 });
    // Half way round from a quarter turn to a half turn about up, one long.
    const r = half.rotation;
    expect(Math.hypot(r.x, r.y, r.z, r.w)).toBeCloseTo(1, 9);
    expect(Math.atan2(r.y, r.w) * 2).toBeCloseTo((3 * Math.PI) / 4, 1);
    const early = ghostPlace(record, 1.5)!;
    expect(early.position.x).toBeCloseTo(1.5, 9);
  });

  it('is nowhere past the last place kept, or before step 0', () => {
    const record = madeUp();
    expect(ghostPlace(record, 12.01)).toBeNull();
    expect(ghostPlace(record, 400)).toBeNull();
    expect(ghostPlace(record, -1)).toBeNull();
    expect(ghostPlace({ ...madeUp(), places: new Float32Array(0) }, 0)).toBeNull();
  });
});
