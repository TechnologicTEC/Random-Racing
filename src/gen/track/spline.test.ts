import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../../core/vec2';
import { sampleClosedSpline } from './spline';

/** Points on a circle. With x right and z down, increasing angle runs clockwise on a map: right turns. */
function circlePoints(radius: number, count: number, direction: 1 | -1 = 1): Vec2[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (direction * i * 2 * Math.PI) / count;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  });
}

/** An uneven loop, to check behaviour away from the tidy circle case. */
const LUMPY: Vec2[] = [
  { x: 0, z: -300 },
  { x: 180, z: -260 },
  { x: 320, z: -40 },
  { x: 250, z: 60 },
  { x: 280, z: 240 },
  { x: 20, z: 310 },
  { x: -60, z: 120 },
  { x: -300, z: 150 },
  { x: -330, z: -120 },
  { x: -150, z: -180 },
];

function distanceToPolyline(p: Vec2, x: Float64Array, z: Float64Array): number {
  let best = Infinity;
  for (let i = 0; i < x.length; i++) {
    const j = (i + 1) % x.length;
    const ax = x[i]!, az = z[i]!, bx = x[j]!, bz = z[j]!;
    const abx = bx - ax, abz = bz - az;
    const t = Math.max(0, Math.min(1, ((p.x - ax) * abx + (p.z - az) * abz) / (abx * abx + abz * abz)));
    best = Math.min(best, Math.hypot(p.x - (ax + abx * t), p.z - (az + abz * t)));
  }
  return best;
}

describe('sampleClosedSpline on a 100 m circle', () => {
  const line = sampleClosedSpline(circlePoints(100, 16), 2);

  it('measures the lap length as about 628 m', () => {
    expect(line.length).toBeGreaterThan(628.3 * 0.99);
    expect(line.length).toBeLessThan(628.3 * 1.01);
  });

  it('keeps every sample about 100 m from the centre', () => {
    for (let i = 0; i < line.count; i++) {
      const r = Math.hypot(line.x[i]!, line.z[i]!);
      expect(r).toBeGreaterThan(99);
      expect(r).toBeLessThan(101);
    }
  });

  it('reports curvature of about 1/100 everywhere', () => {
    for (let i = 0; i < line.count; i++) {
      expect(Math.abs(line.curvature[i]!)).toBeGreaterThan(0.009);
      expect(Math.abs(line.curvature[i]!)).toBeLessThan(0.011);
    }
  });

  it('gives right turns positive curvature and left turns negative', () => {
    expect(line.curvature.every((k) => k > 0)).toBe(true);
    const reversed = sampleClosedSpline(circlePoints(100, 16, -1), 2);
    expect(reversed.curvature.every((k) => k < 0)).toBe(true);
  });
});

describe('sampleClosedSpline on an uneven loop', () => {
  const line = sampleClosedSpline(LUMPY, 2);

  it('has one entry per sample in every array', () => {
    for (const array of [line.x, line.z, line.tx, line.tz, line.curvature]) {
      expect(array.length).toBe(line.count);
    }
  });

  it('uses a spacing close to the one asked for, dividing the lap exactly', () => {
    expect(line.spacing).toBeGreaterThan(1.99);
    expect(line.spacing).toBeLessThan(2.01);
    expect(line.count * line.spacing).toBeCloseTo(line.length, 6);
  });

  it('spaces samples evenly, including across the join from last to first', () => {
    for (let i = 0; i < line.count; i++) {
      const j = (i + 1) % line.count;
      const step = Math.hypot(line.x[j]! - line.x[i]!, line.z[j]! - line.z[i]!);
      expect(step).toBeGreaterThan(line.spacing * 0.99);
      expect(step).toBeLessThan(line.spacing * 1.001);
    }
  });

  it('passes through every control point', () => {
    for (const point of LUMPY) {
      expect(distanceToPolyline(point, line.x, line.z)).toBeLessThan(0.05);
    }
  });

  it('starts at the first control point', () => {
    expect(Math.hypot(line.x[0]! - LUMPY[0]!.x, line.z[0]! - LUMPY[0]!.z)).toBeLessThan(0.01);
  });

  it('gives unit tangents that point along the direction of travel', () => {
    for (let i = 0; i < line.count; i++) {
      const j = (i + 1) % line.count;
      expect(Math.hypot(line.tx[i]!, line.tz[i]!)).toBeCloseTo(1, 9);
      const forward = (line.x[j]! - line.x[i]!) * line.tx[i]! + (line.z[j]! - line.z[i]!) * line.tz[i]!;
      expect(forward).toBeGreaterThan(line.spacing * 0.9);
    }
  });

  it('turns smoothly: heading never jumps more than a few degrees between samples', () => {
    for (let i = 0; i < line.count; i++) {
      const j = (i + 1) % line.count;
      const dot = line.tx[i]! * line.tx[j]! + line.tz[i]! * line.tz[j]!;
      expect(dot).toBeGreaterThan(Math.cos((8 * Math.PI) / 180));
    }
  });

  it('is deterministic', () => {
    const again = sampleClosedSpline(LUMPY, 2);
    expect(again.x).toEqual(line.x);
    expect(again.z).toEqual(line.z);
    expect(again.curvature).toEqual(line.curvature);
  });
});

describe('sampleClosedSpline input checks', () => {
  it('needs at least four control points', () => {
    expect(() => sampleClosedSpline(circlePoints(100, 3), 2)).toThrow();
  });
});
