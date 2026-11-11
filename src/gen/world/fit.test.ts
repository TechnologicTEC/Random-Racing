import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { circleLine, stadiumLine } from '../../testing/trackFixtures';
import type { CenterLine, HeightField } from '../types';
import { fitRoad } from './fit';
import { createField, sampleField, worldX, worldZ } from './heightfield';
import { nearestRoad } from './nearest';

const road = config.road;
const HALF = config.track.roadWidth / 2;
/** Half the width of the strip that follows the road: the road itself plus a verge each side. */
const CORRIDOR = HALF + road.verge;

/** Natural ground from a formula, on a grid just big enough for the fixture. */
function ground(extent: number, heightAt: (x: number, z: number) => number): HeightField {
  const field = createField(extent, 2);
  for (let iz = 0; iz < field.size; iz++) {
    for (let ix = 0; ix < field.size; ix++) field.height[iz * field.size + ix] = heightAt(worldX(field, ix), worldZ(field, iz));
  }
  return field;
}

function fit(line: CenterLine, natural: HeightField, heightAt: (i: number) => number, cross: Float64Array | null = null) {
  const height = Float64Array.from({ length: line.count }, (_, i) => heightAt(i));
  return fitRoad({ natural, near: nearestRoad(line, natural), line, height, cross }, config);
}

/** Steepest slope between neighbouring cells of a grid, optionally only where `where` allows. */
function steepest(field: HeightField, where: (x: number, z: number) => boolean = () => true): number {
  let worst = 0;
  for (let iz = 0; iz < field.size - 1; iz++) {
    for (let ix = 0; ix < field.size - 1; ix++) {
      if (!where(worldX(field, ix), worldZ(field, iz))) continue;
      const c = iz * field.size + ix;
      worst = Math.max(
        worst,
        Math.abs(field.height[c + 1]! - field.height[c]!) / field.cell,
        Math.abs(field.height[c + field.size]! - field.height[c]!) / field.cell,
      );
    }
  }
  return worst;
}

describe('fitRoad on flat ground', () => {
  const line = circleLine(100);
  const natural = ground(400, () => 10);

  it('sinks the ground just below a road that sits at ground level', () => {
    const { ground: fitted } = fit(line, natural, () => 10);
    expect(sampleField(fitted, 100, 0, 0)).toBeCloseTo(10 - road.sink, 5);
    expect(sampleField(fitted, 100 + HALF, 0, 0)).toBeCloseTo(10 - road.sink, 5);
    expect(sampleField(fitted, 100 - HALF, 0, 0)).toBeCloseTo(10 - road.sink, 5);
  });

  it('leaves ground far from the road exactly as it was', () => {
    const { ground: fitted } = fit(line, natural, () => 14);
    expect(sampleField(fitted, 0, 0, 0)).toBe(10);
    expect(sampleField(fitted, 190, 190, 0)).toBe(10);
    const reach = CORRIDOR + road.blendMax + 2;
    for (let iz = 0; iz < fitted.size; iz += 3) {
      for (let ix = 0; ix < fitted.size; ix += 3) {
        const x = worldX(fitted, ix);
        const z = worldZ(fitted, iz);
        if (Math.abs(Math.sqrt(x * x + z * z) - 100) > reach) expect(fitted.height[iz * fitted.size + ix]).toBe(10);
      }
    }
  });

  it('marks the cells of the road and its verges, and no others', () => {
    const { corridor } = fit(line, natural, () => 10);
    const at = (x: number, z: number): number => corridor[Math.round((z + 200) / 2) * natural.size + Math.round((x + 200) / 2)]!;
    expect(at(100, 0)).toBe(1);
    expect(at(100 + CORRIDOR - 1, 0)).toBe(1);
    expect(at(100 + CORRIDOR + 2, 0)).toBe(0);
    expect(at(0, 0)).toBe(0);
  });
});

describe('fitRoad building an embankment', () => {
  const line = circleLine(100);
  const natural = ground(400, () => 10);
  const { ground: fitted } = fit(line, natural, () => 14);
  /** Fitted height at a distance outside the centre line of the road, along the +X axis. */
  const outside = (distance: number): number => sampleField(fitted, 100 + distance, 0, 0);

  it('holds the whole road and verge at road height, less the sink', () => {
    for (const d of [-CORRIDOR + 1, -HALF, 0, HALF, CORRIDOR - 1]) expect(outside(d)).toBeCloseTo(14 - road.sink, 4);
  });

  it('falls steadily from the verge to the natural ground', () => {
    let previous = outside(CORRIDOR);
    for (let d = CORRIDOR + 2; d <= CORRIDOR + road.blendMax; d += 2) {
      const here = outside(d);
      expect(here).toBeLessThanOrEqual(previous + 1e-4);
      previous = here;
    }
    expect(outside(CORRIDOR + road.blendMax)).toBeCloseTo(10, 3);
  });

  it('takes at least the minimum blend distance, and no slope is steeper than a bank can stand', () => {
    expect(outside(CORRIDOR + road.blendMin - 3)).toBeGreaterThan(10.1);
    expect(steepest(fitted)).toBeLessThan(0.75);
  });

  it('uses a wider blend for a taller embankment', () => {
    const low = fit(line, natural, () => 11).ground;
    const tall = fit(line, natural, () => 18).ground;
    const d = CORRIDOR + road.blendMin + 2;
    // 12 m out, the 1 m bank is finished but the 8 m bank still has a long way to fall.
    expect(sampleField(low, 100 + d, 0, 0)).toBeCloseTo(10, 3);
    expect(sampleField(tall, 100 + d, 0, 0)).toBeGreaterThan(12);
  });
});

describe('fitRoad digging a cutting', () => {
  const line = circleLine(100);
  const natural = ground(400, () => 20);
  const { ground: fitted } = fit(line, natural, () => 15);

  it('lowers the road strip and rises back to the natural ground on both sides', () => {
    expect(sampleField(fitted, 100, 0, 0)).toBeCloseTo(15 - road.sink, 4);
    expect(sampleField(fitted, 100 + CORRIDOR + 6, 0, 0)).toBeGreaterThan(15.2);
    expect(sampleField(fitted, 100 + CORRIDOR + 6, 0, 0)).toBeLessThan(20);
    expect(sampleField(fitted, 100 - CORRIDOR - 6, 0, 0)).toBeGreaterThan(15.2);
    expect(sampleField(fitted, 100 + CORRIDOR + road.blendMax, 0, 0)).toBeCloseTo(20, 3);
    expect(sampleField(fitted, 100 - CORRIDOR - road.blendMax, 0, 0)).toBeCloseTo(20, 3);
  });
});

describe('fitRoad on a road that climbs', () => {
  const line = circleLine(100);
  const natural = ground(400, () => 10);
  // One smooth rise and fall per lap.
  const surfaceAt = (i: number): number => 12 + 3 * Math.sin((i / line.count) * 2 * Math.PI);
  const { ground: fitted } = fit(line, natural, surfaceAt);

  it('keeps the ground a steady sink below the road surface all along and across the road', () => {
    for (let i = 0; i < line.count; i += 4) {
      for (const offset of [-HALF, -HALF / 2, 0, HALF / 2, HALF]) {
        // Right of the direction of travel is (-tz, tx) on the map.
        const x = line.x[i]! - line.tz[i]! * offset;
        const z = line.z[i]! + line.tx[i]! * offset;
        const below = surfaceAt(i) - sampleField(fitted, x, z, 0);
        expect(below).toBeGreaterThan(road.sink - 0.08);
        expect(below).toBeLessThan(road.sink + 0.08);
      }
    }
  });
});

describe('fitRoad on a banked road', () => {
  const line = circleLine(100);
  const natural = ground(400, () => 10);
  // Tilted so the right-hand edge (the inside of this clockwise circle) is lower: 0.1 m per metre.
  const cross = new Float64Array(line.count).fill(-0.1);
  const { ground: fitted } = fit(line, natural, () => 12, cross);

  it('tilts the ground with the road, verge included', () => {
    // At the +X end of the circle the centre is on the left of the map, so "right of travel" points to -X.
    // The centre line is made of 2 m chords, so positions across a curved road are good to a few millimetres.
    expect(sampleField(fitted, 100, 0, 0)).toBeCloseTo(12 - road.sink, 2);
    expect(sampleField(fitted, 100 - 5, 0, 0)).toBeCloseTo(12 - 0.5 - road.sink, 2);
    expect(sampleField(fitted, 100 + 5, 0, 0)).toBeCloseTo(12 + 0.5 - road.sink, 2);
    // Just past the road edge, still on the verge.
    expect(sampleField(fitted, 100 + HALF + 1, 0, 0)).toBeCloseTo(12 + (HALF + 1) * 0.1 - road.sink, 2);
    // At the very edge of the verge the bank has begun, so the ground may already be a few centimetres down.
    const vergeEdge = sampleField(fitted, 100 + CORRIDOR - 0.5, 0, 0);
    expect(Math.abs(vergeEdge - (12 + (CORRIDOR - 0.5) * 0.1 - road.sink))).toBeLessThan(0.1);
  });
});

describe('fitRoad between two sections side by side', () => {
  // Two 300 m straights 40 m apart: the near one (z = -20) at 10 m, the far one (z = +20) at 16 m.
  const line = stadiumLine(300, 20);
  const natural = ground(520, () => 10);
  const heightOf = (i: number): number => 13 + 3 * Math.max(-1, Math.min(1, line.z[i]! / 18));
  const { ground: fitted } = fit(line, natural, heightOf);
  const across = (z: number): number => sampleField(fitted, 0, z, 0);

  it('holds each section at its own height, untouched by its neighbour', () => {
    for (const d of [-CORRIDOR + 1, -HALF, 0, HALF, CORRIDOR - 1]) {
      expect(across(-20 + d)).toBeCloseTo(10 - road.sink, 3);
      expect(across(20 + d)).toBeCloseTo(16 - road.sink, 3);
    }
  });

  it('joins them with one bank that only ever rises from the lower to the higher', () => {
    let previous = across(-20 + CORRIDOR);
    for (let z = -20 + CORRIDOR + 1; z <= 20 - CORRIDOR; z += 1) {
      const here = across(z);
      expect(here).toBeGreaterThanOrEqual(previous - 1e-4);
      previous = here;
    }
  });

  it('keeps that bank gentle enough to stand', () => {
    expect(steepest(fitted, (x, z) => Math.abs(x) < 100 && Math.abs(z) < 12)).toBeLessThan(0.75);
  });
});
