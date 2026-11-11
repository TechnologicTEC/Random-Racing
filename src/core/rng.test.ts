import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

function take(rng: { next(): number }, count: number): number[] {
  return Array.from({ length: count }, () => rng.next());
}

describe('createRng', () => {
  it('gives the same numbers for the same seed and stream', () => {
    expect(take(createRng(48213, 'track'), 20)).toEqual(take(createRng(48213, 'track'), 20));
  });

  it('gives different numbers for different seeds', () => {
    expect(take(createRng(1, 'track'), 5)).not.toEqual(take(createRng(2, 'track'), 5));
  });

  it('gives different numbers for different streams of one seed', () => {
    expect(take(createRng(1, 'track'), 5)).not.toEqual(take(createRng(1, 'world'), 5));
  });

  it('treats the seed as an unsigned 32-bit whole number', () => {
    expect(take(createRng(-1, 'track'), 5)).toEqual(take(createRng(4294967295, 'track'), 5));
  });

  it('returns values in [0, 1) spread evenly', () => {
    const values = take(createRng(7, 'track'), 20000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
    const lowTenth = values.filter((v) => v < 0.1).length / values.length;
    expect(lowTenth).toBeGreaterThan(0.085);
    expect(lowTenth).toBeLessThan(0.115);
  });

  it('does not produce similar output for neighbouring seeds', () => {
    const firsts = Array.from({ length: 200 }, (_, seed) => createRng(seed, 'track').next());
    const distinct = new Set(firsts.map((v) => Math.floor(v * 1000)));
    expect(distinct.size).toBeGreaterThan(150);
  });
});

describe('Rng helpers', () => {
  it('range stays inside its bounds', () => {
    const rng = createRng(3, 'track');
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(-5, 12);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(12);
    }
  });

  it('int covers every whole number from min to max inclusive', () => {
    const rng = createRng(3, 'track');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(10, 18));
    expect([...seen].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it('chance(0) is never true and chance(1) is always true', () => {
    const rng = createRng(3, 'track');
    for (let i = 0; i < 200; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it('pick returns an item from the list', () => {
    const rng = createRng(3, 'track');
    const items = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(rng.pick(items));
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
  });

  it('pick throws on an empty list', () => {
    expect(() => createRng(3, 'track').pick([])).toThrow();
  });
});

describe('fork', () => {
  it('gives a child stream that differs from its parent and siblings', () => {
    const parent = createRng(9, 'track');
    const a = take(parent.fork('candidate-0'), 5);
    const b = take(parent.fork('candidate-1'), 5);
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(take(createRng(9, 'track'), 5));
  });

  it('does not depend on how many numbers the parent has already used', () => {
    const fresh = createRng(9, 'track');
    const used = createRng(9, 'track');
    take(used, 137);
    expect(take(used.fork('candidate-3'), 10)).toEqual(take(fresh.fork('candidate-3'), 10));
  });

  it('does not disturb the parent stream', () => {
    const plain = take(createRng(9, 'track'), 10);
    const parent = createRng(9, 'track');
    const firstHalf = take(parent, 5);
    take(parent.fork('candidate-0'), 50);
    expect([...firstHalf, ...take(parent, 5)]).toEqual(plain);
  });
});
