import { describe, expect, it } from 'vitest';
import { createHasher } from './hash';
import { createNoise, fbm, ridged, softRidged } from './noise';
import { createRng } from './rng';

const noiseFor = (seed: number, label = 'test') => createNoise(createRng(seed, 'world').fork(label));

/** Sample points spread over a wide area, including negative coordinates. */
function* samplePoints(count: number): Generator<[number, number]> {
  for (let i = 0; i < count; i++) {
    yield [((i * 37) % 211) * 0.173 - 18, ((i * 53) % 197) * 0.211 - 20];
  }
}

describe('createNoise', () => {
  it('gives the same values for the same stream', () => {
    const a = noiseFor(7);
    const b = noiseFor(7);
    for (const [x, y] of samplePoints(200)) expect(a(x, y)).toBe(b(x, y));
  });

  it('gives different values for a different seed or stream', () => {
    const a = noiseFor(7);
    const otherSeed = noiseFor(8);
    const otherLabel = noiseFor(7, 'other');
    let differSeed = 0;
    let differLabel = 0;
    for (const [x, y] of samplePoints(200)) {
      if (a(x, y) !== otherSeed(x, y)) differSeed++;
      if (a(x, y) !== otherLabel(x, y)) differLabel++;
    }
    expect(differSeed).toBeGreaterThan(150);
    expect(differLabel).toBeGreaterThan(150);
  });

  it('stays within -1 to 1 and uses most of that range', () => {
    const noise = noiseFor(3);
    let min = Infinity;
    let max = -Infinity;
    for (const [x, y] of samplePoints(5000)) {
      const value = noise(x, y);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    expect(min).toBeLessThan(-0.6);
    expect(max).toBeGreaterThan(0.6);
  });

  it('changes smoothly: nearby points have nearby values', () => {
    const noise = noiseFor(11);
    for (const [x, y] of samplePoints(500)) {
      expect(Math.abs(noise(x + 0.001, y) - noise(x, y))).toBeLessThan(0.01);
      expect(Math.abs(noise(x, y + 0.001) - noise(x, y))).toBeLessThan(0.01);
    }
  });

  it('keeps producing exactly the same numbers (fingerprint for seed 1)', () => {
    const noise = noiseFor(1);
    const values: number[] = [];
    for (const [x, y] of samplePoints(300)) values.push(noise(x, y), fbm(noise, x, y, 4), ridged(noise, x, y, 3));
    expect(createHasher().numbers(values).digest()).toBe('7085f03b');
  });
});

describe('fbm', () => {
  it('stays within -1 to 1', () => {
    const noise = noiseFor(5);
    for (const [x, y] of samplePoints(3000)) {
      const value = fbm(noise, x, y, 5);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('with one octave is the plain noise', () => {
    const noise = noiseFor(5);
    for (const [x, y] of samplePoints(50)) expect(fbm(noise, x, y, 1)).toBe(noise(x, y));
  });

  it('adds finer detail with more octaves', () => {
    const noise = noiseFor(5);
    // Finer detail means the curve bends more sharply over a short distance.
    const bend = (octaves: number, x: number, y: number): number =>
      Math.abs(fbm(noise, x + 0.05, y, octaves) - 2 * fbm(noise, x, y, octaves) + fbm(noise, x - 0.05, y, octaves));
    let bend1 = 0;
    let bend5 = 0;
    for (const [x, y] of samplePoints(1000)) {
      bend1 += bend(1, x, y);
      bend5 += bend(5, x, y);
    }
    expect(bend5).toBeGreaterThan(bend1 * 2);
  });
});

describe('ridged', () => {
  it('stays within 0 to 1 and reaches high ridges', () => {
    const noise = noiseFor(9);
    let max = 0;
    for (const [x, y] of samplePoints(3000)) {
      const value = ridged(noise, x, y, 4);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      max = Math.max(max, value);
    }
    expect(max).toBeGreaterThan(0.8);
  });
});

describe('softRidged', () => {
  it('stays within 0 to 1 and still reaches high ridges', () => {
    const noise = noiseFor(9);
    let max = 0;
    for (const [x, y] of samplePoints(3000)) {
      const value = softRidged(noise, x, y, 3);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      max = Math.max(max, value);
    }
    expect(max).toBeGreaterThan(0.7);
  });

  it('rounds the ridge tops: its sharpest bend is far gentler than the plain ridges', () => {
    const noise = noiseFor(9);
    const bend = (fn: typeof ridged, x: number, y: number): number =>
      Math.abs(fn(noise, x + 0.002, y, 1) - 2 * fn(noise, x, y, 1) + fn(noise, x - 0.002, y, 1));
    let sharp = 0;
    let soft = 0;
    for (const [x, y] of samplePoints(20000)) {
      sharp = Math.max(sharp, bend(ridged, x, y));
      soft = Math.max(soft, bend(softRidged, x, y));
    }
    expect(soft).toBeLessThan(sharp / 4);
  });
});
