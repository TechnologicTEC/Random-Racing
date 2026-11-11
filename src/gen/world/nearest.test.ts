import { describe, expect, it } from 'vitest';
import { circleLine, stadiumLine } from '../../testing/trackFixtures';
import type { CenterLine } from '../types';
import { createField, worldX, worldZ } from './heightfield';
import { insideLoop, nearestRoad } from './nearest';

/** The true nearest sample, found the slow way. */
function bruteNearest(line: CenterLine, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < line.count; i++) {
    const dx = line.x[i]! - x, dz = line.z[i]! - z;
    best = Math.min(best, Math.sqrt(dx * dx + dz * dz));
  }
  return best;
}

describe('nearestRoad', () => {
  const field = createField(600, 2);
  const at = (x: number, z: number): number => Math.round((z - field.origin) / field.cell) * field.size + Math.round((x - field.origin) / field.cell);

  it('measures the distance from every cell to the centre line', () => {
    const line = circleLine(100);
    const near = nearestRoad(line, field);
    expect(near.distance).toHaveLength(field.size * field.size);
    expect(near.distance[at(0, 0)]!).toBeCloseTo(100, 0);
    expect(near.distance[at(150, 0)]!).toBeCloseTo(50, 0);
    expect(near.distance[at(100, 0)]!).toBeLessThan(1.5);
    expect(near.distance[at(-280, 280)]!).toBeCloseTo(Math.sqrt(2) * 280 - 100, 0);
  });

  it('remembers which sample is nearest', () => {
    const line = circleLine(100);
    const near = nearestRoad(line, field);
    const i = near.index[at(160, 0)]!;
    expect(line.x[i]!).toBeCloseTo(100, 0);
    expect(Math.abs(line.z[i]!)).toBeLessThan(2.5);
  });

  it('measures to the line itself, not just to its sample points: exact to a few centimetres everywhere', () => {
    const line = stadiumLine(300, 20);
    const near = nearestRoad(line, field);
    /** The true distance to the centre line, found the slow way over every piece of it. */
    const exact = (x: number, z: number): number => {
      let best = Infinity;
      for (let i = 0; i < line.count; i++) {
        const j = (i + 1) % line.count;
        const abx = line.x[j]! - line.x[i]!, abz = line.z[j]! - line.z[i]!;
        const t = Math.max(0, Math.min(1, ((x - line.x[i]!) * abx + (z - line.z[i]!) * abz) / (abx * abx + abz * abz)));
        const dx = x - (line.x[i]! + abx * t), dz = z - (line.z[i]! + abz * t);
        best = Math.min(best, Math.sqrt(dx * dx + dz * dz));
      }
      return best;
    };
    let worst = 0;
    for (let iz = 0; iz < field.size; iz += 5) {
      for (let ix = 0; ix < field.size; ix += 5) {
        worst = Math.max(worst, Math.abs(near.distance[iz * field.size + ix]! - exact(worldX(field, ix), worldZ(field, iz))));
      }
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('agrees with a slow exact search to within half a cell, everywhere', () => {
    const line = stadiumLine(300, 20);
    const near = nearestRoad(line, field);
    let worst = 0;
    for (let iz = 0; iz < field.size; iz += 7) {
      for (let ix = 0; ix < field.size; ix += 7) {
        const exact = bruteNearest(line, worldX(field, ix), worldZ(field, iz));
        worst = Math.max(worst, Math.abs(near.distance[iz * field.size + ix]! - exact));
      }
    }
    expect(worst).toBeLessThan(1);
  });
});

describe('insideLoop', () => {
  const field = createField(600, 2);
  const at = (x: number, z: number): number => Math.round((z - field.origin) / field.cell) * field.size + Math.round((x - field.origin) / field.cell);

  it('marks the cells the track encloses', () => {
    const inside = insideLoop(circleLine(100), field);
    expect(inside[at(0, 0)]).toBe(1);
    expect(inside[at(90, 0)]).toBe(1);
    expect(inside[at(110, 0)]).toBe(0);
    expect(inside[at(-250, 250)]).toBe(0);
  });

  it('covers the right area', () => {
    const inside = insideLoop(circleLine(100), field);
    let cells = 0;
    for (const value of inside) cells += value;
    const area = cells * field.cell * field.cell;
    expect(area).toBeGreaterThan(Math.PI * 100 * 100 * 0.98);
    expect(area).toBeLessThan(Math.PI * 100 * 100 * 1.02);
  });

  it('gives the same answer whichever way the lap runs', () => {
    const line = circleLine(100);
    const reversed: CenterLine = { ...line, x: Float64Array.from(line.x).reverse(), z: Float64Array.from(line.z).reverse() };
    expect(insideLoop(reversed, field)).toEqual(insideLoop(line, field));
  });

  it('leaves the gap inside a narrow stadium marked as inside, and its outside as outside', () => {
    const inside = insideLoop(stadiumLine(300, 20), field);
    expect(inside[at(0, 0)]).toBe(1);
    expect(inside[at(0, 30)]).toBe(0);
    expect(inside[at(0, -30)]).toBe(0);
  });
});
