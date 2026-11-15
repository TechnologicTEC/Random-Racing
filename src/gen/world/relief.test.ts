import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { trackRulesFor } from '../track/rules';
import type { LandformKind, ReliefKind, RouteKind } from '../types';
import { createRelief, placeHighland, placeMassif, type ReliefTraits } from './relief';

const cfg = config.world.relief;
const LANDFORMS = config.world.scenery.landforms;
const KINDS: readonly ReliefKind[] = ['flat', 'rolling', 'hilly', 'mountain'];
/** The track area of each kind of relief: mountain seeds have a wider one. */
const reachOf = (kind: ReliefKind): number => trackRulesFor(config.track, kind).buildableRadius;
const REACH = config.track.buildableRadius;
const traitsOf = (kind: ReliefKind, landform: LandformKind = 'peak', route: RouteKind = 'climb'): ReliefTraits => ({
  relief: kind,
  landform,
  route: kind === 'mountain' ? route : null,
});
const make = (seed: number, kind: ReliefKind, traits = traitsOf(kind)) => createRelief(seed, cfg, LANDFORMS, traits, reachOf(kind));
const massifOf = (seed: number, traits: ReliefTraits) => placeMassif(seed, cfg, LANDFORMS, traits);

/** Heights on a square grid covering the buildable area. */
function sampleArea(seed: number, kind: ReliefKind, step: number): number[] {
  const relief = make(seed, kind);
  const reach = reachOf(kind);
  const heights: number[] = [];
  for (let x = -reach; x <= reach; x += step) {
    for (let z = -reach; z <= reach; z += step) {
      if (x * x + z * z <= reach * reach) heights.push(relief(x, z));
    }
  }
  return heights;
}

/** Steepness at many points of the buildable area, as fractions, sorted from gentle to steep. A massif's steep top is left out. */
function slopes(seed: number, kind: ReliefKind): number[] {
  const relief = make(seed, kind);
  const massif = massifOf(seed, traitsOf(kind));
  const reach = reachOf(kind);
  const out: number[] = [];
  const h = 1;
  for (let x = -reach; x <= reach; x += 25) {
    for (let z = -reach; z <= reach; z += 25) {
      if (x * x + z * z > reach * reach) continue;
      if (massif && massif.top.outside(x, z) <= 2 * h) continue;
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

  it('stays between the lowland height and the top of its hills and highland or massif', () => {
    for (const seed of [1, 2, 3, 42, 48213]) {
      const highland = placeHighland(seed, cfg, kind, REACH);
      const massif = massifOf(seed, traitsOf(kind));
      const top = cfg.lowland + rules.hillHeight + (highland?.height ?? 0) + (massif?.summit ?? 0);
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
  it('gives flat, rolling and mountain ground no highland (mountain seeds have a massif instead)', () => {
    for (const seed of [1, 2, 3]) {
      expect(placeHighland(seed, cfg, 'flat', REACH)).toBeNull();
      expect(placeHighland(seed, cfg, 'rolling', REACH)).toBeNull();
      expect(placeHighland(seed, cfg, 'mountain', REACH)).toBeNull();
    }
  });

  it('puts the top of a hilly highland clear of the buildable area', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const highland = placeHighland(seed, cfg, 'hilly', REACH)!;
      const fromCentre = Math.sqrt(highland.x * highland.x + highland.z * highland.z);
      // Its flat top starts beyond the edge of the buildable area, so the track is always on its flank.
      expect(fromCentre - highland.plateau).toBeGreaterThanOrEqual(REACH);
      expect(highland.height).toBeGreaterThan(0);
    }
  });

  it('makes hilly ground climb steadily towards the highland', () => {
    const slope = cfg.kinds.hilly.flankSlope;
    for (let seed = 1; seed <= 30; seed++) {
      const highland = placeHighland(seed, cfg, 'hilly', REACH)!;
      const relief = make(seed, 'hilly');
      const fromCentre = Math.sqrt(highland.x * highland.x + highland.z * highland.z);
      const ux = highland.x / fromCentre;
      const uz = highland.z / fromCentre;
      // From the foot of the flank, on the low side of the centre, to near the edge on the high side.
      const low = relief(-ux * cfg.highland.foot, -uz * cfg.highland.foot);
      const high = relief(ux * REACH * 0.9, uz * REACH * 0.9);
      // The flank alone gains its slope over that distance, less a little where it eases in at the foot.
      // The hills on top of it can take away no more than their own height.
      const flank = slope * (cfg.highland.foot + REACH * 0.9 - cfg.highland.ease / 2);
      expect(high - low, `seed ${seed}`).toBeGreaterThan(flank - cfg.kinds.hilly.hillHeight - 0.001);
      expect(high - low, `seed ${seed}`).toBeLessThan(flank + cfg.kinds.hilly.hillHeight + 0.001);
      // On its own the flank is never steeper than its slope, so a road at that gradient can always follow it.
      for (let t = -REACH; t < REACH; t += 50) {
        const rise = relief(ux * (t + 50), uz * (t + 50)) - relief(ux * t, uz * t);
        expect(rise / 50, `seed ${seed} at ${t}`).toBeLessThanOrEqual(slope + cfg.kinds.hilly.hillHeight / 100);
      }
    }
  });

  it('gives the hilly kind a flank at the gradient its road may climb', () => {
    expect(cfg.kinds.hilly.flankSlope).toBeLessThanOrEqual(config.road.maxGradient.hilly);
  });

  it('points the highland a different way for different seeds', () => {
    const quadrants = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const highland = placeHighland(seed, cfg, 'hilly', REACH)!;
      quadrants.add(`${highland.x > 0}/${highland.z > 0}`);
    }
    expect(quadrants.size).toBe(4);
  });

  it('is the same for the same seed', () => {
    expect(placeHighland(9, cfg, 'hilly', REACH)).toEqual(placeHighland(9, cfg, 'hilly', REACH));
  });
});

describe('placeMassif', () => {
  const rules = cfg.massif;
  const ROUTES = ['climb', 'circle'] as const;
  const SHAPES = ['peak', 'range', 'hills'] as const;

  it('gives only mountain seeds a massif', () => {
    for (const kind of ['flat', 'rolling', 'hilly'] as const) expect(massifOf(1, traitsOf(kind))).toBeNull();
    expect(massifOf(1, traitsOf('mountain'))).not.toBeNull();
  });

  it.each(ROUTES)('puts the summit of a %s seed its route distance from the centre of the track area', (route) => {
    for (let seed = 1; seed <= 20; seed++) {
      const massif = massifOf(seed, traitsOf('mountain', 'peak', route))!;
      expect(Math.hypot(massif.x, massif.z), `seed ${seed}`).toBeCloseTo(rules.routes[route].distance, 6);
    }
  });

  it('points the massif a different way for different seeds', () => {
    const quadrants = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const massif = massifOf(seed, traitsOf('mountain'))!;
      quadrants.add(`${massif.x > 0}/${massif.z > 0}`);
    }
    expect(quadrants.size).toBe(4);
  });

  it.each(SHAPES)('stands a %s top, of the height its shape allows, on the shoulder of the cone', (landform) => {
    for (const route of ROUTES) {
      for (let seed = 1; seed <= 10; seed++) {
        const traits = traitsOf('mountain', landform, route);
        const massif = massifOf(seed, traits)!;
        expect(massif.top.kind).toBe(landform);
        const topHeight = massif.summit - massif.cone;
        expect(topHeight).toBeGreaterThanOrEqual(rules.routes[route].top[landform][0] - 1e-9);
        expect(topHeight).toBeLessThanOrEqual(rules.routes[route].top[landform][1] + 1e-9);
        // The cone rises to its shoulder at its slope over the distance from its foot, less a little where it eases in.
        const flank = rules.routes[route].distance + rules.beyond - rules.routes[route].shoulder;
        expect(massif.cone).toBeCloseTo(rules.slope * (flank - rules.ease / 2), 6);
        // The ground at the summit is the summit's height above the lowland and its hills.
        const ground = make(seed, 'mountain', traits)(massif.x, massif.z);
        expect(ground - massif.summit, `seed ${seed}`).toBeGreaterThanOrEqual(cfg.lowland - 1e-9);
        expect(ground - massif.summit, `seed ${seed}`).toBeLessThanOrEqual(cfg.lowland + cfg.kinds.mountain.hillHeight + 1e-9);
      }
    }
  });

  it('gives the summit of a climbing seed more height than a circling one', () => {
    const climb = massifOf(5, traitsOf('mountain', 'peak', 'climb'))!;
    const circle = massifOf(5, traitsOf('mountain', 'peak', 'circle'))!;
    expect(climb.cone).toBeGreaterThan(circle.cone + 40);
  });

  it.each(ROUTES)('climbs from the far side of the track area to the top no steeper than the road may, on a %s seed', (route) => {
    const slope = config.road.maxGradient.mountain;
    expect(rules.slope).toBeLessThanOrEqual(slope);
    for (let seed = 1; seed <= 20; seed++) {
      const traits = traitsOf('mountain', 'peak', route);
      const massif = massifOf(seed, traits)!;
      const relief = make(seed, 'mountain', traits);
      const d = Math.hypot(massif.x, massif.z);
      const ux = massif.x / d;
      const uz = massif.z / d;
      // Along the line from the far edge of the track area through the centre towards the summit, up to the top's foot.
      for (let t = -reachOf('mountain'); t < d; t += 25) {
        if (massif.top.outside(ux * (t + 25), uz * (t + 25)) <= 0) break;
        const rise = relief(ux * (t + 25), uz * (t + 25)) - relief(ux * t, uz * t);
        expect(rise / 25, `seed ${seed} at ${t}`).toBeLessThanOrEqual(slope + cfg.kinds.mountain.hillHeight / 100);
      }
    }
  });

  it.each(ROUTES)('leaves the ground beyond the foot of the cone as it was, on a %s seed', (route) => {
    for (let seed = 1; seed <= 10; seed++) {
      const traits = traitsOf('mountain', 'peak', route);
      const massif = massifOf(seed, traits)!;
      const relief = make(seed, 'mountain', traits);
      const d = Math.hypot(massif.x, massif.z);
      const out = massif.reach + 20;
      const [x, z] = [massif.x - (massif.x / d) * out, massif.z - (massif.z / d) * out];
      expect(relief(x, z), `seed ${seed}`).toBeLessThanOrEqual(cfg.lowland + cfg.kinds.mountain.hillHeight + 1e-9);
      expect(massif.reach).toBeCloseTo(rules.routes[route].distance + rules.beyond, 6);
    }
  });

  it('is the same for the same seed', () => {
    const a = massifOf(9, traitsOf('mountain', 'range', 'circle'))!;
    const b = massifOf(9, traitsOf('mountain', 'range', 'circle'))!;
    expect({ ...a, top: a.top.summits }).toEqual({ ...b, top: b.top.summits });
  });
});
