import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { circleLine, stadiumLine } from '../../testing/trackFixtures';
import type { CenterLine } from '../types';
import { fitRoad } from './fit';
import { createField, worldX, worldZ } from './heightfield';
import { nearestRoad } from './nearest';
import { fitReport } from './report';

const HALF = config.track.roadWidth / 2;

/** Fits a road at a fixed height onto land shaped by a formula and reports on the result. */
function reportFor(line: CenterLine, extent: number, heightAt: (x: number, z: number) => number, roadHeight: (i: number) => number) {
  const natural = createField(extent, 2);
  for (let iz = 0; iz < natural.size; iz++) {
    for (let ix = 0; ix < natural.size; ix++) natural.height[iz * natural.size + ix] = heightAt(worldX(natural, ix), worldZ(natural, iz));
  }
  const near = nearestRoad(line, natural);
  const height = Float64Array.from({ length: line.count }, (_, i) => roadHeight(i));
  const fitted = fitRoad({ natural, near, line, height, cross: null }, config);
  const input = { natural, ground: fitted.ground, corridor: fitted.corridor, near, line, height, cross: null };
  return { input, report: fitReport(input, config) };
}

describe('fitReport', () => {
  const circle = circleLine(100);

  it('measures the deepest cutting and where it is', () => {
    // Ground at 20 m everywhere, but 23 m on the +X side; the road runs at 15 m.
    const { report } = reportFor(circle, 400, (x) => (x > 60 ? 23 : 20), () => 15);
    expect(report.deepestCut.value).toBeCloseTo(8, 1);
    expect(report.deepestCut.x).toBeGreaterThan(60);
    expect(report.tallestFill.value).toBe(0);
  });

  it('measures the tallest embankment', () => {
    const { report } = reportFor(circle, 400, () => 10, () => 14);
    expect(report.tallestFill.value).toBeCloseTo(4, 1);
    expect(report.deepestCut.value).toBe(0);
  });

  it('measures the steepest bank beside the road', () => {
    const gentle = reportFor(circle, 400, () => 10, () => 11).report;
    const tall = reportFor(circle, 400, () => 10, () => 18).report;
    expect(tall.steepestBank.value).toBeGreaterThan(gentle.steepestBank.value);
    expect(tall.steepestBank.value).toBeGreaterThan(0.3);
    expect(tall.steepestBank.value).toBeLessThan(0.75);
    // The steepest part of a bank is out on the bank, not on the road.
    const fromCentre = Math.sqrt(tall.steepestBank.x * tall.steepestBank.x + tall.steepestBank.z * tall.steepestBank.z);
    expect(Math.abs(fromCentre - 100)).toBeGreaterThan(HALF + config.road.verge - 2);
  });

  it('finds the water nearest the road', () => {
    // The sea starts at x = 150, so 50 m from the centre line at its nearest.
    const { report } = reportFor(circle, 400, (x) => (x > 150 ? -5 : 10), () => 10);
    expect(report.nearestWater.value).toBeGreaterThan(50 - HALF - 3);
    expect(report.nearestWater.value).toBeLessThan(50 - HALF + 3);
    expect(report.nearestWater.x).toBeGreaterThan(145);
  });

  it('reports how close separate sections of the lap come', () => {
    const { report } = reportFor(stadiumLine(300, 20), 520, () => 10, () => 10);
    expect(report.closestSections).not.toBeNull();
    expect(report.closestSections!.value).toBeCloseTo(40, 0);
    expect(reportFor(circle, 400, () => 10, () => 10).report.closestSections).toBeNull();
  });

  it('finds no ground showing through a well-fitted road, and no road hanging in the air', () => {
    const { report } = reportFor(circle, 400, (x, z) => 10 + x * 0.05 + z * 0.03, (i) => 12 + 2 * Math.sin((i / circle.count) * 2 * Math.PI));
    expect(report.groundThroughRoad).toBe(0);
    expect(report.roadFloating).toBe(0);
  });

  it('counts ground that pokes through the road if the fit is spoiled', () => {
    const { input } = reportFor(circle, 400, () => 10, () => 10);
    // Push up a few cells in the middle of the road.
    const size = input.ground.size;
    const cell = Math.round((0 + 200) / 2) * size + Math.round((100 + 200) / 2);
    for (const c of [cell, cell + 1, cell + size, cell + size + 1]) input.ground.height[c] = 10.4;
    expect(fitReport(input, config).groundThroughRoad).toBeGreaterThan(0);
  });

  it('counts road left hanging if the ground under it is too low', () => {
    const { input } = reportFor(circle, 400, () => 10, () => 10);
    const size = input.ground.size;
    const cell = Math.round((0 + 200) / 2) * size + Math.round((100 + 200) / 2);
    for (const c of [cell, cell + 1, cell + size, cell + size + 1]) input.ground.height[c] = 8;
    expect(fitReport(input, config).roadFloating).toBeGreaterThan(0);
  });
});
