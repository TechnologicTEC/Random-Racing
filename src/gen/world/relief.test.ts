import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import type { ReliefKind } from '../types';
import { createRelief, placeHighland } from './relief';

const cfg = config.world.relief;
const REACH = config.track.buildableRadius;
const KINDS: readonly ReliefKind[] = ['flat', 'rolling', 'hilly', 'mountain'];
const make = (seed: number, kind: ReliefKind) => createRelief(seed, cfg, kind, REACH);

/** Heights on a square grid covering the buildable area. */
function sampleArea(seed: number, kind: ReliefKind, step: number): number[] {
  const relief = make(seed, kind);
  const heights: number[] = [];
  for (let x = -REACH; x <= REACH; x += step) {
    for (let z = -REACH; z <= REACH; z += step) {
      if (x * x + z * z <= REACH * REACH) heights.push(relief(x, z));
    }
  }
  return heights;
}

/** Steepness at many points of the buildable area, as fractions, sorted from gentle to steep. */
function slopes(seed: number, kind: ReliefKind): number[] {
  const relief = make(seed, kind);
  const out: number[] = [];
  const h = 1;
  for (let x = -REACH; x <= REACH; x += 25) {
    for (let z = -REACH; z <= REACH; z += 25) {
      if (x * x + z * z > REACH * REACH) continue;
      const dx = (relief(x + h, z) - relief(x - h, z)) / (2 * h);
      const dz = (relief(x, z + h) - relief(x, z - h)) / (2 * h);
      out.push(Math.sqrt(dx * dx + dz * dz));
    }
  }
  return out.sort((a, b) => a - b);
}

describe.each(KINDS)('createRelief for %s ground', (kind) => {
  const rules = cfg.kinds[kind];

  it('gives the same ground for the same seed', () => {
    const a = make(31337, kind);
    const b = make(31337, kind);
    for (let i = 0; i < 100; i++) expect(a(i * 9.7 - 400, 300 - i * 7.3)).toBe(b(i * 9.7 - 400, 300 - i * 7.3));
  });

  it('gives different ground for a different seed', () => {
    const a = make(1, kind);
    const b = make(2, kind);
    let different = 0;
    for (let i = 0; i < 100; i++) if (a(i * 9.7 - 400, 300 - i * 7.3) !== b(i * 9.7 - 400, 300 - i * 7.3)) different++;
    expect(different).toBeGreaterThan(90);
  });

  it('stays between the lowland height and the top of its hills and highland', () => {
    for (const seed of [1, 2, 3, 42, 48213]) {
      const highland = placeHighland(seed, cfg, kind, REACH);
      const top = cfg.lowland + rules.hillHeight + (highland?.height ?? 0);
      for (const height of sampleArea(seed, kind, 20)) {
        expect(height).toBeGreaterThanOrEqual(cfg.lowland);
        expect(height).toBeLessThanOrEqual(top + 1e-9);
      }
    }
  });

  it('is gentle enough for its road: 99% of the ground is under its slope limit and none is far over it', () => {
    const all: number[] = [];
    for (let seed = 1; seed <= 30; seed++) all.push(...slopes(seed, kind));
    all.sort((a, b) => a - b);
    expect(all[Math.floor(all.length * 0.99)]!).toBeLessThanOrEqual(rules.maxSlope);
    expect(all[all.length - 1]!).toBeLessThanOrEqual(rules.maxSlope * 1.5);
  });
});

describe('the four kinds of relief', () => {
  /** Highest minus lowest ground in the buildable area, for seeds 1 to 30. */
  const spans = (kind: ReliefKind): number[] =>
    Array.from({ length: 30 }, (_, i) => {
      const heights = sampleArea(i + 1, kind, 25);
      return Math.max(...heights) - Math.min(...heights);
    });

  it('keeps flat ground within 8 m from lowest to highest', () => {
    for (const span of spans('flat')) expect(span).toBeLessThan(8);
  });

  it('gives most rolling seeds real hills: at least 15 m between the lowest and highest ground', () => {
    expect(spans('rolling').filter((span) => span >= 15).length).toBeGreaterThanOrEqual(26);
  });

  it('gives each kind more height than the one before', () => {
    const median = (values: number[]): number => values.sort((a, b) => a - b)[values.length >> 1]!;
    const flat = median(spans('flat'));
    const rolling = median(spans('rolling'));
    const hilly = median(spans('hilly'));
    const mountain = median(spans('mountain'));
    expect(rolling).toBeGreaterThan(flat * 2);
    expect(hilly).toBeGreaterThan(rolling * 1.5);
    expect(mountain).toBeGreaterThan(hilly * 1.5);
  });

  it('leaves plenty of low rolling ground for seaside sections: a quarter of the area within 6 m of the lowland', () => {
    let low = 0;
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const height of sampleArea(seed, 'rolling', 25)) {
        total++;
        if (height <= cfg.lowland + 6) low++;
      }
    }
    expect(low / total).toBeGreaterThanOrEqual(0.25);
  });
});

describe('placeHighland', () => {
  it('gives flat and rolling ground no highland', () => {
    for (const seed of [1, 2, 3]) {
      expect(placeHighland(seed, cfg, 'flat', REACH)).toBeNull();
      expect(placeHighland(seed, cfg, 'rolling', REACH)).toBeNull();
    }
  });

  it.each(['hilly', 'mountain'] as const)('puts the top of a %s highland clear of the buildable area', (kind) => {
    for (let seed = 1; seed <= 30; seed++) {
      const highland = placeHighland(seed, cfg, kind, REACH)!;
      const fromCentre = Math.sqrt(highland.x * highland.x + highland.z * highland.z);
      // Its flat top starts beyond the edge of the buildable area, so the track is always on its flank.
      expect(fromCentre - highland.plateau).toBeGreaterThanOrEqual(REACH);
      expect(highland.height).toBeGreaterThan(0);
    }
  });

  it.each(['hilly', 'mountain'] as const)('makes %s ground climb steadily towards the highland', (kind) => {
    const slope = cfg.kinds[kind].flankSlope;
    for (let seed = 1; seed <= 30; seed++) {
      const highland = placeHighland(seed, cfg, kind, REACH)!;
      const relief = make(seed, kind);
      const fromCentre = Math.sqrt(highland.x * highland.x + highland.z * highland.z);
      const ux = highland.x / fromCentre;
      const uz = highland.z / fromCentre;
      // From the foot of the flank, on the low side of the centre, to near the edge on the high side.
      const low = relief(-ux * cfg.highland.foot, -uz * cfg.highland.foot);
      const high = relief(ux * REACH * 0.9, uz * REACH * 0.9);
      // The flank alone gains its slope over that distance, less a little where it eases in at the foot.
      // The hills on top of it can take away no more than their own height.
      const flank = slope * (cfg.highland.foot + REACH * 0.9 - cfg.highland.ease / 2);
      expect(high - low, `seed ${seed}`).toBeGreaterThan(flank - cfg.kinds[kind].hillHeight - 0.001);
      expect(high - low, `seed ${seed}`).toBeLessThan(flank + cfg.kinds[kind].hillHeight + 0.001);
      // On its own the flank is never steeper than its slope, so a road at that gradient can always follow it.
      for (let t = -REACH; t < REACH; t += 50) {
        const rise = relief(ux * (t + 50), uz * (t + 50)) - relief(ux * t, uz * t);
        expect(rise / 50, `seed ${seed} at ${t}`).toBeLessThanOrEqual(slope + cfg.kinds[kind].hillHeight / 100);
      }
    }
  });

  it('gives the mountain kind a flank at the gradient its road may climb, and the hilly kind likewise', () => {
    expect(cfg.kinds.mountain.flankSlope).toBeLessThanOrEqual(config.road.maxGradient.mountain);
    expect(cfg.kinds.hilly.flankSlope).toBeLessThanOrEqual(config.road.maxGradient.hilly);
  });

  it('points the highland a different way for different seeds', () => {
    const quadrants = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const highland = placeHighland(seed, cfg, 'mountain', REACH)!;
      quadrants.add(`${highland.x > 0}/${highland.z > 0}`);
    }
    expect(quadrants.size).toBe(4);
  });

  it('is the same for the same seed', () => {
    expect(placeHighland(9, cfg, 'mountain', REACH)).toEqual(placeHighland(9, cfg, 'mountain', REACH));
  });
});
