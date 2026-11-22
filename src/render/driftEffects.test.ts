import { describe, expect, it } from 'vitest';
import { config } from '../config';
import type { DriftView } from '../sim/car/car';
import { driftSprites, flameLength, hopLift, hopSquash, leanAngle, speedLines, type EffectInput, type Sprite } from './driftEffects';
import { FLAME, SMOKE, SPARK, SPARK_HOT, toLinear } from './palette';

const look = config.render.car;
const boosts = config.car.drift.boosts;
const perSecond = config.sim.stepsPerSecond;
const carLength = 2 * config.car.body.halfLength;
/** The bottoms of the two rear wheels, in the car's own directions: left, then right. */
const WHEELS = [
  { x: -0.6, y: -0.56, z: 0.8 },
  { x: 0.6, y: -0.56, z: 0.8 },
] as const;
const NOTHING: DriftView = { phase: 'none', dir: 0, tier: 0, angle: 0, hop: 0, boostLeft: 0, boostTier: 0, ended: null, ends: 0 };
const sliding = (tier: 0 | 1 | 2 | 3): DriftView => ({ ...NOTHING, phase: 'slide', dir: 1, tier, angle: config.car.drift.angle });
/** Going forwards at 30 m/s: the car's front is -z. */
const input = (drift: DriftView, step = 500): EffectInput => ({ drift, step, rear: WHEELS, motion: { x: 0, y: 0, z: -30 } });
const sprites = (drift: DriftView, step = 500): Sprite[] => driftSprites(input(drift, step), look, boosts, perSecond);
const ofKind = (list: Sprite[], kind: Sprite['kind']): Sprite[] => list.filter((sprite) => sprite.kind === kind);
const linear = (rgb: readonly number[]): number[] => rgb.map(toLinear);
/** How far a colour lies between two others, along the first channel that differs. */
const between = (colour: readonly number[], from: readonly number[], to: readonly number[]): number => {
  const k = [0, 1, 2].find((c) => Math.abs(to[c]! - from[c]!) > 0.05)!;
  return (colour[k]! - from[k]!) / (to[k]! - from[k]!);
};
/** A release step `age` seconds ago, of a tier's boost: what the drift view says then. */
const released = (tier: 1 | 2 | 3, age: number): DriftView => ({ ...NOTHING, boostTier: tier, boostLeft: boosts[tier - 1] - age });

describe('the sparks', () => {
  it('fly from neither wheel below the first tier, or with no slide', () => {
    expect(ofKind(sprites(sliding(0)), 'streak')).toHaveLength(0);
    expect(ofKind(sprites(NOTHING), 'streak')).toHaveLength(0);
  });

  it('grow with the tier: a trickle at the first, a spray at the third', () => {
    const counts = ([1, 2, 3] as const).map((tier) => ofKind(sprites(sliding(tier)), 'streak').length);
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBeGreaterThan(counts[0]!);
    expect(counts[2]).toBeGreaterThan(counts[1]!);
    // Every streak has a bright head, and as many soft glows round them.
    for (const tier of [1, 2, 3] as const) {
      const all = sprites(sliding(tier));
      expect(ofKind(all, 'star')).toHaveLength(ofKind(all, 'streak').length);
    }
  });

  it("each streak lies along its flight, out to the wheel's own side, above the road, within the tier's reach", () => {
    for (const tier of [1, 2, 3] as const) {
      for (let step = 500; step < 530; step++) {
        const streaks = ofKind(sprites(sliding(tier), step), 'streak');
        for (const s of streaks) {
          const wheel = s.at.x < 0 ? WHEELS[0] : WHEELS[1];
          const away = { x: s.at.x - wheel.x, y: s.at.y - wheel.y, z: s.at.z - wheel.z };
          expect(Math.hypot(away.x, away.y, away.z)).toBeLessThanOrEqual(look.sparks.reach[tier - 1] + 1e-9);
          expect(s.at.y).toBeGreaterThanOrEqual(wheel.y - 1e-9);
          expect(Math.sign(away.x)).toBe(Math.sign(wheel.x));
          // Stretched along the way it flies: out from the wheel.
          const along = (s.axis.x * away.x + s.axis.y * away.y + s.axis.z * away.z) / Math.hypot(away.x, away.y, away.z);
          expect(along).toBeGreaterThan(0.99);
          expect(s.length).toBeGreaterThan(s.width);
        }
      }
    }
  });

  it("start white-hot and are in the tier's own colour from a third of their flight, bright enough to glow", () => {
    for (const tier of [1, 2, 3] as const) {
      const streaks = ofKind(sprites(sliding(tier)), 'streak');
      const hot = linear(SPARK_HOT);
      const cold = linear(SPARK[tier - 1]!);
      const reach = look.sparks.reach[tier - 1];
      const near = (s: Sprite) => Math.hypot(s.at.x - (s.at.x < 0 ? WHEELS[0] : WHEELS[1]).x, s.at.y - WHEELS[0].y, s.at.z - WHEELS[0].z) / reach;
      const young = streaks.filter((s) => near(s) < 0.08);
      const old = streaks.filter((s) => near(s) > 0.5);
      expect(young.length).toBeGreaterThan(0);
      expect(old.length).toBeGreaterThan(0);
      const scale = (s: Sprite) => s.colour.map((c) => c / look.sparks.glow);
      for (const s of young) expect(between(scale(s), hot, cold)).toBeLessThan(0.4);
      for (const s of old) expect(between(scale(s), hot, cold)).toBeGreaterThan(0.99);
      // Brighter than the screen can show, so the bloom picks them out.
      for (const s of streaks) expect(Math.max(...s.colour)).toBeGreaterThan(1);
    }
  });

  it('are the same for the same step, and move on with the steps, so a still picture repeats', () => {
    expect(sprites(sliding(2), 777)).toEqual(sprites(sliding(2), 777));
    expect(sprites(sliding(2), 778)).not.toEqual(sprites(sliding(2), 777));
  });

  it("live a quarter of a second: one born on a step is gone 15 steps later", () => {
    const life = Math.round(look.sparks.life * perSecond);
    expect(life).toBe(15);
    const newest = ofKind(sprites(sliding(1), 500), 'streak').slice(-1);
    const later = ofKind(sprites(sliding(1), 500 + life), 'streak');
    for (const spark of newest) expect(later).not.toContainEqual(spark);
  });
});

describe('the burst on letting go', () => {
  it("is a ring of stars in the boost's tier colour, only for its short life after the slide is let go", () => {
    const life = look.burst.life;
    for (const tier of [1, 2, 3] as const) {
      const first = ofKind(sprites(released(tier, 0)), 'star');
      expect(first).toHaveLength(look.burst.count);
      for (const s of first) expect(between(s.colour.map((c) => c / look.sparks.glow), linear(SPARK_HOT), linear(SPARK[tier - 1]!))).toBeGreaterThan(0.6);
      // It spreads and fades as it goes.
      const later = ofKind(sprites(released(tier, life * 0.6)), 'star');
      const spread = (list: Sprite[]) => Math.max(...list.map((s) => Math.hypot(s.at.x, s.at.z)));
      expect(spread(later)).toBeGreaterThan(spread(first));
      expect(Math.max(...later.map((s) => s.alpha))).toBeLessThan(Math.max(...first.map((s) => s.alpha)));
      expect(ofKind(sprites(released(tier, life + 1 / perSecond)), 'star')).toHaveLength(0);
    }
  });

  it('never shows while sliding', () => {
    expect(ofKind(sprites(sliding(3)), 'star').length).toBe(ofKind(sprites(sliding(3)), 'streak').length);
  });
});

describe('the tyre smoke', () => {
  it('rises from both rear wheels while sliding, from the start of the slide, and not otherwise', () => {
    expect(ofKind(sprites(NOTHING), 'smoke')).toHaveLength(0);
    const puffs = ofKind(sprites(sliding(0)), 'smoke');
    expect(puffs.length).toBeGreaterThan(4);
    expect(puffs.some((s) => s.at.x < 0)).toBe(true);
    expect(puffs.some((s) => s.at.x > 0)).toBe(true);
  });

  it('is left behind the car, grows and fades as it ages, in the smoke colour', () => {
    const puffs = ofKind(sprites(sliding(1)), 'smoke');
    for (const s of puffs) {
      expect(s.at.z).toBeGreaterThanOrEqual(WHEELS[0].z - 1e-9);
      expect(s.colour.map((c) => Number(c.toFixed(6)))).toEqual(linear(SMOKE).map((c) => Number(c.toFixed(6))));
      expect(s.alpha).toBeLessThanOrEqual(look.smoke.alpha + 1e-9);
    }
    // The furthest behind is the oldest: biggest and faintest.
    const sorted = [...puffs].sort((a, b) => a.at.z - b.at.z);
    expect(sorted.at(-1)!.width).toBeGreaterThan(sorted[0]!.width);
    expect(sorted.at(-1)!.alpha).toBeLessThan(sorted[0]!.alpha);
  });
});

describe('the boost flame', () => {
  it('is none with no boost running', () => {
    expect(flameLength(NOTHING, 100, look)).toBe(0);
    expect(ofKind(sprites(NOTHING), 'flame')).toHaveLength(0);
  });

  it('is two jets pointing back from the exhaust, in the tier colour with a pale core, the tier length, flickering, never longer than the car', () => {
    for (const tier of [1, 2, 3] as const) {
      const drift = { ...NOTHING, boostLeft: 0.3, boostTier: tier };
      const length = look.flame.lengths[tier - 1]!;
      const seen = new Set<number>();
      for (let step = 0; step < 200; step++) {
        const drawn = flameLength(drift, step, look);
        expect(drawn).toBeGreaterThanOrEqual(length * (1 - look.flame.flicker) - 1e-12);
        expect(drawn).toBeLessThanOrEqual(length * (1 + look.flame.flicker) + 1e-12);
        expect(drawn).toBeLessThan(carLength);
        seen.add(drawn);
      }
      expect(seen.size).toBeGreaterThan(20);
      const jets = ofKind(sprites(drift, 42), 'flame');
      expect(jets).toHaveLength(4);
      const outer = jets.filter((s) => s.width === look.flame.width);
      const core = jets.filter((s) => s.width !== look.flame.width);
      expect(outer).toHaveLength(2);
      expect(new Set(outer.map((s) => Math.sign(s.at.x)))).toEqual(new Set([-1, 1]));
      for (const s of outer) {
        expect(s.axis).toEqual({ x: 0, y: 0, z: 1 });
        expect(s.at.z).toBeGreaterThan(1);
        expect(2 * s.length).toBeCloseTo(flameLength(drift, 42, look), 9);
        expect(between(s.colour.map((c) => c / look.sparks.glow), [0, 0, 0], linear(SPARK[tier - 1]!))).toBeCloseTo(1, 6);
      }
      for (const s of core) expect(between(s.colour.map((c) => c / look.sparks.glow), [0, 0, 0], linear(FLAME.core))).toBeCloseTo(1, 6);
      // A flare where the jets leave the exhaust.
      expect(ofKind(sprites(drift, 42), 'glow').length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('the drift drawn on the kart', () => {
  it('leans the body out of the corner, more as the nose swings in, and not at all without a slide', () => {
    expect(leanAngle(NOTHING, config.car.drift.angle, look)).toBe(0);
    // A slide to the right leans the body left: positive about the car's front (-z), seen from behind, is to the left.
    expect(leanAngle(sliding(1), config.car.drift.angle, look)).toBeCloseTo(look.lean, 12);
    expect(leanAngle({ ...sliding(1), dir: -1 }, config.car.drift.angle, look)).toBeCloseTo(-look.lean, 12);
    expect(leanAngle({ ...sliding(1), angle: config.car.drift.angle / 2 }, config.car.drift.angle, look)).toBeCloseTo(look.lean / 2, 12);
    expect(look.lean).toBeGreaterThan(0.05);
    expect(look.lean).toBeLessThan(0.1);
  });

  it('lifts the kart in an arc 8 cm high over the hop, then squashes it a little as it lands', () => {
    const height = config.car.drift.hop.height;
    expect(height).toBe(0.08);
    expect(hopLift(0, height)).toBe(0);
    expect(hopLift(1, height)).toBe(0);
    expect(hopLift(0.5, height)).toBeCloseTo(height, 12);
    expect(hopSquash(0, look.squash)).toBe(1);
    expect(hopSquash(0.9, look.squash)).toBe(1);
    const landing = Math.min(...[0.05, 0.1, 0.15, 0.2].map((hop) => hopSquash(hop, look.squash)));
    expect(landing).toBeLessThan(1);
    expect(landing).toBeGreaterThanOrEqual(1 - look.squash - 1e-12);
  });
});

describe('the speed lines', () => {
  it('are none with no boost', () => {
    expect(speedLines(NOTHING, 10, look)).toHaveLength(0);
  });

  it("streak towards the picture's edges while a boost runs, never over its middle, the same for the same step", () => {
    const drift = { ...NOTHING, boostLeft: 0.6, boostTier: 2 as const };
    const lines = speedLines(drift, 300, look);
    expect(lines).toHaveLength(look.speedLines.count);
    for (const line of lines) {
      for (const [x, y] of [line.from, line.to]) {
        expect(Math.max(Math.abs(x), Math.abs(y))).toBeGreaterThanOrEqual(look.speedLines.inner - 1e-9);
        expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(1 + 1e-9);
      }
      // Pointing outwards from the middle.
      expect(Math.hypot(...line.to)).toBeGreaterThan(Math.hypot(...line.from));
      expect(line.alpha).toBeGreaterThan(0);
      expect(line.alpha).toBeLessThanOrEqual(look.speedLines.alpha);
    }
    expect(speedLines(drift, 300, look)).toEqual(lines);
    expect(speedLines(drift, 301, look)).not.toEqual(lines);
  });
});

describe('the colours', () => {
  it('keeps the tiers and the flame from the visual bar, with a white-hot spark head and pale smoke', () => {
    expect(SPARK).toEqual([
      [0.25, 0.65, 1.0],
      [1.0, 0.6, 0.12],
      [0.7, 0.35, 1.0],
    ]);
    expect(FLAME.core).toEqual([1, 0.95, 0.7]);
    for (const c of SPARK_HOT) expect(c).toBeGreaterThan(0.85);
    for (const c of SMOKE) expect(c).toBeGreaterThan(0.75);
  });
});
