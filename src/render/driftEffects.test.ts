import { describe, expect, it } from 'vitest';
import { config } from '../config';
import type { DriftView } from '../sim/car/car';
import { flameLength, hopLift, sparkTriangles } from './driftEffects';
import { FLAME, SPARK, toLinear } from './palette';

const look = config.render.car;
const perSecond = config.sim.stepsPerSecond;
/** The bottoms of the two rear wheels, in the car's own directions: left, then right. */
const WHEELS = [
  { x: -0.6, y: -0.56, z: 0.8 },
  { x: 0.6, y: -0.56, z: 0.8 },
] as const;
const NOTHING: DriftView = { phase: 'none', dir: 0, tier: 0, angle: 0, hop: 0, boostLeft: 0, boostTier: 0 };
const sliding = (tier: 0 | 1 | 2 | 3): DriftView => ({ ...NOTHING, phase: 'slide', dir: 1, tier, angle: 0.42 });

/** Each spark's three corners, as points. */
function sparksOf(positions: Float32Array): Array<Array<{ x: number; y: number; z: number }>> {
  const out: Array<Array<{ x: number; y: number; z: number }>> = [];
  for (let i = 0; i < positions.length; i += 9) {
    out.push([0, 3, 6].map((k) => ({ x: positions[i + k]!, y: positions[i + k + 1]!, z: positions[i + k + 2]! })));
  }
  return out;
}

describe('sparkTriangles', () => {
  it('throws none below the first tier, or with no slide', () => {
    expect(sparkTriangles(sliding(0), 500, WHEELS, look, perSecond).positions).toHaveLength(0);
    expect(sparkTriangles(NOTHING, 500, WHEELS, look, perSecond).positions).toHaveLength(0);
  });

  it('throws 20 to 30 a wheel, each a flat triangle', () => {
    const { positions } = sparkTriangles(sliding(1), 500, WHEELS, look, perSecond);
    const sparks = sparksOf(positions);
    expect(sparks.length % 2).toBe(0);
    expect(sparks.length / 2).toBeGreaterThanOrEqual(20);
    expect(sparks.length / 2).toBeLessThanOrEqual(30);
  });

  it('keeps each burst no bigger than its wheel, behind it and to its outside', () => {
    const wheelSize = 2 * look.wheelRadius;
    for (let step = 500; step < 560; step++) {
      const sparks = sparksOf(sparkTriangles(sliding(3), step, WHEELS, look, perSecond).positions);
      sparks.forEach((corners, i) => {
        const wheel = WHEELS[i < sparks.length / 2 ? 0 : 1];
        for (const p of corners) {
          expect(Math.hypot(p.x - wheel.x, p.y - wheel.y, p.z - wheel.z)).toBeLessThanOrEqual(wheelSize);
          // Behind the wheel's front and above the road.
          expect(p.z).toBeGreaterThan(wheel.z - look.sparks.size * 2);
          expect(p.y).toBeGreaterThan(wheel.y - look.sparks.size * 2);
        }
        const middle = (corners[0]!.x + corners[1]!.x + corners[2]!.x) / 3;
        expect(Math.sign(middle - wheel.x)).toBe(Math.sign(wheel.x));
      });
    }
  });

  it('is drawn in the colour of the tier, unlit', () => {
    for (const tier of [1, 2, 3] as const) {
      const { colors } = sparkTriangles(sliding(tier), 500, WHEELS, look, perSecond);
      const want = SPARK[tier - 1]!.map(toLinear);
      for (let i = 0; i < colors.length; i += 3) expect([colors[i], colors[i + 1], colors[i + 2]].map((c) => Number(c!.toFixed(6)))).toEqual(want.map((c) => Number(c.toFixed(6))));
    }
  });

  it('is the same for the same step, and moves on with the steps, so a still picture repeats', () => {
    const a = sparkTriangles(sliding(2), 777, WHEELS, look, perSecond);
    const b = sparkTriangles(sliding(2), 777, WHEELS, look, perSecond);
    expect(a.positions).toEqual(b.positions);
    expect(sparkTriangles(sliding(2), 778, WHEELS, look, perSecond).positions).not.toEqual(a.positions);
  });

  it('lets each spark live a quarter of a second: one born on a step is gone 15 steps later', () => {
    const life = Math.round(look.sparks.life * perSecond);
    expect(life).toBe(15);
    // The newest sparks of step 500 are the oldest of step 514, and are gone at 515.
    const newest = sparksOf(sparkTriangles(sliding(1), 500, WHEELS, look, perSecond).positions).slice(-look.sparks.perStep);
    const later = sparksOf(sparkTriangles(sliding(1), 500 + life, WHEELS, look, perSecond).positions);
    for (const spark of newest) expect(later).not.toContainEqual(spark);
  });
});

describe('flameLength', () => {
  it('is none with no boost running', () => {
    expect(flameLength(NOTHING, 100, look)).toBe(0);
  });

  it('is 0.6, 0.9 and 1.2 m for the three tiers, flickering by a sixth of that, and never longer than the car', () => {
    const carLength = 2 * config.car.body.halfLength;
    for (const tier of [1, 2, 3] as const) {
      const length = look.flame.lengths[tier - 1]!;
      expect(length).toBeCloseTo([0.6, 0.9, 1.2][tier - 1]!, 12);
      const seen = new Set<number>();
      for (let step = 0; step < 200; step++) {
        const drawn = flameLength({ ...NOTHING, boostLeft: 0.5, boostTier: tier }, step, look);
        expect(drawn).toBeGreaterThanOrEqual(length * (1 - 1 / 6) - 1e-12);
        expect(drawn).toBeLessThanOrEqual(length * (1 + 1 / 6) + 1e-12);
        expect(drawn).toBeLessThan(carLength);
        seen.add(drawn);
      }
      // It flickers, and the same step gives the same flame.
      expect(seen.size).toBeGreaterThan(20);
      expect(flameLength({ ...NOTHING, boostLeft: 0.5, boostTier: tier }, 42, look)).toBe(flameLength({ ...NOTHING, boostLeft: 0.5, boostTier: tier }, 42, look));
    }
  });

  it('takes the flame colours of the visual bar', () => {
    expect(FLAME.core).toEqual([1, 0.95, 0.7]);
    expect(FLAME.outer).toEqual([1, 0.55, 0.1]);
    expect(SPARK).toEqual([
      [0.25, 0.65, 1.0],
      [1.0, 0.6, 0.12],
      [0.7, 0.35, 1.0],
    ]);
  });
});

describe('hopLift', () => {
  it('lifts the kart in an arc 8 cm high over the hop, and not at all without one', () => {
    const height = config.car.drift.hop.height;
    expect(height).toBe(0.08);
    expect(hopLift(0, height)).toBe(0);
    expect(hopLift(1, height)).toBe(0);
    expect(hopLift(0.5, height)).toBeCloseTo(height, 12);
    for (let k = 1; k < 9; k++) {
      expect(hopLift(k / 9, height)).toBeGreaterThan(0);
      expect(hopLift(k / 9, height)).toBeLessThanOrEqual(height);
    }
  });
});
