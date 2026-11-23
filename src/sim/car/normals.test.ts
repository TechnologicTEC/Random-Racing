import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { steadyNormals } from './normals';
import type { Surface } from './surface';

const limit = config.car.suspension.oddNormal;
const flat = { x: 0, y: 1, z: 0 };
/** A direction tilted from straight up towards +z by an angle in degrees. */
const tilted = (degrees: number) => ({ x: 0, y: Math.cos((degrees * Math.PI) / 180), z: Math.sin((degrees * Math.PI) / 180) });
const wheel = (normal: { x: number; y: number; z: number }, touching = true, surface: Surface | null = 'road') => ({ touching, normal, surface });
const NONE_ODD = [false, false, false, false];
/** The steadied directions only, from a step after one with no odd wheel. */
const steady = (wheels: ReturnType<typeof wheel>[], limit: number) => steadyNormals(wheels, limit, NONE_ODD).normals;

describe('steadyNormals: a wheel whose ground direction is odd takes the others (Tane, 10a-4)', () => {
  it('is about 8 degrees: more than a kerb top (5.1), less than the 10 the ramp mesh gave', () => {
    expect(limit).toBeCloseTo(Math.cos((8 * Math.PI) / 180), 4);
  });

  it('leaves four wheels on the same ground exactly as they are', () => {
    const wheels = [wheel(flat), wheel(flat), wheel(flat), wheel(flat)];
    expect(steady(wheels, limit)).toEqual(wheels.map((w) => w.normal));
  });

  it('gives a wheel tilted 10 degrees from the other three the direction of the other three', () => {
    const out = steady([wheel(tilted(10)), wheel(flat), wheel(flat), wheel(flat)], limit);
    expect(out[0]).toEqual(flat);
    expect(out.slice(1)).toEqual([flat, flat, flat]);
  });

  it('keeps a wheel on a kerb top (5.1 degrees) as it is', () => {
    const kerb = tilted(5.1);
    expect(steady([wheel(flat), wheel(kerb), wheel(flat), wheel(flat)], limit)[1]).toEqual(kerb);
  });

  it('changes nothing with fewer than two other wheels down to compare with, and leaves a wheel in the air alone', () => {
    const odd = tilted(30);
    expect(steady([wheel(odd), wheel(flat), wheel(flat, false), wheel(flat, false)], limit)).toEqual([odd, flat, flat, flat]);
  });

  it('steadies a wheel only on the first step it is odd: a slope or a kerb face that lasts is felt from the next step', () => {
    const wheels = [wheel(tilted(24)), wheel(flat), wheel(flat), wheel(flat)];
    const first = steadyNormals(wheels, limit, NONE_ODD);
    expect(first.normals[0]).toEqual(flat);
    expect(first.odd).toEqual([true, false, false, false]);
    const next = steadyNormals(wheels, limit, first.odd);
    expect(next.normals[0]).toEqual(tilted(24));
    expect(next.odd).toEqual([true, false, false, false]);
  });

  it('leaves a wheel on other ground than the rest alone: one on the grass of a hillside, three on the road', () => {
    const slope = tilted(24);
    expect(steady([wheel(slope, true, 'grass'), wheel(flat), wheel(flat), wheel(flat)], limit)[0]).toEqual(slope);
  });

  it('leaves every wheel alone when the others do not agree among themselves: two on a slope and two on the road', () => {
    const slope = tilted(24);
    expect(steady([wheel(slope), wheel(flat), wheel(slope), wheel(flat)], limit)).toEqual([slope, flat, slope, flat]);
  });

  it('compares each wheel with the others as they were, not as they are being changed', () => {
    // Two wheels at 6 degrees and two at -4: 10 apart, but each is under 7 from the average of the other three.
    const a = tilted(6);
    const b = tilted(-4);
    const out = steady([wheel(a), wheel(a), wheel(b), wheel(b)], limit);
    expect(out).toEqual([a, a, b, b]);
  });
});
