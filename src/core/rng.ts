/**
 * Seeded random numbers. The only source of randomness generation code may use.
 *
 * A stream is identified by a key such as "48213:track" or
 * "48213:track/candidate-7". The key alone decides the numbers, so forking a
 * child stream never depends on how much of the parent has been used. That is
 * what lets one part of the generator change without reshuffling the others.
 */

export interface Rng {
  /** Next number in [0, 1). */
  next(): number;
  /** A number in [min, max). */
  range(min: number, max: number): number;
  /** A whole number from min to max, both included. */
  int(min: number, max: number): number;
  /** True with the given probability (0 to 1). */
  chance(probability: number): boolean;
  /** One item of the list. */
  pick<T>(items: readonly T[]): T;
  /** An independent child stream named by the label. */
  fork(label: string): Rng;
}

/** Stream names used by the game. Keeping them here avoids typos. */
export type StreamName = 'world' | 'track' | 'decor' | 'name';

export function createRng(seed: number, stream: StreamName): Rng {
  return rngFromKey(`${seed >>> 0}:${stream}`);
}

function rngFromKey(key: string): Rng {
  const nextSeedWord = stringHasher(key);
  const next = sfc32(nextSeedWord(), nextSeedWord(), nextSeedWord(), nextSeedWord());
  // Discard the first few outputs so weakly mixed starting state never shows.
  for (let i = 0; i < 12; i++) next();

  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (items) => {
      if (items.length === 0) throw new Error('Cannot pick from an empty list');
      return items[Math.floor(next() * items.length)]!;
    },
    fork: (label) => rngFromKey(`${key}/${label}`),
  };
}

/** xmur3: turns a string into a sequence of well-mixed 32-bit words. */
function stringHasher(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** sfc32: small fast generator with 128 bits of state. Integer maths only. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
