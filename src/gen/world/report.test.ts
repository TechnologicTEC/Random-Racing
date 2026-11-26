import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { circleLine, stadiumLine, uniformWidth } from '../../testing/trackFixtures';
import type { CenterLine } from '../types';
import { fitRoad } from './fit';
import { createField, worldX, worldZ } from './heightfield';
import { nearestRoad } from './nearest';
import { fitReport } from './report';

const HALF = config.track.roadWidth / 2;

/** Fits a road at a fixed height onto land shaped by a formula and reports on the result. */
function reportFor(
  line: CenterLine,
  extent: number,
  heightAt: (x: number, z: number) => number,
  roadHeight: (i: number) => number,
  roadWidth = config.track.roadWidth,
) {
  const natural = createField(extent, 2);
  for (let iz = 0; iz < natural.size; iz++) {
    for (let ix = 0; ix < natural.size; ix++) natural.height[iz * natural.size + ix] = heightAt(worldX(natural, ix), worldZ(natural, iz));
  }
  const near = nearestRoad(line, natural);
  const height = Float64Array.from({ length: line.count }, (_, i) => roadHeight(i));
  const width = uniformWidth(line, roadWidth);
  const fitted = fitRoad({ natural, near, line, height, cross: null, width }, config);
  const input = { natural, earthworks: fitted.ground, ground: fitted.ground, corridor: fitted.corridor, near, line, height, cross: null, width };
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

  it('judges banks on the earthworks alone, so a sea cliff carved afterwards is not counted as a bank', () => {
    const { input } = reportFor(circle, 400, () => 10, () => 11);
    const gentle = fitReport(input, config).steepestBank.value;
    // Carve a sheer drop into the finished ground 12 m outside the road, as the coast would.
    const carved = { ...input.ground, height: Float32Array.from(input.ground.height) };
    for (let iz = 0; iz < carved.size; iz++) {
      for (let ix = 0; ix < carved.size; ix++) {
        const x = worldX(carved, ix);
        const z = worldZ(carved, iz);
        if (Math.sqrt(x * x + z * z) > 100 + HALF + 12) carved.height[iz * carved.size + ix] = -3;
      }
    }
    const report = fitReport({ ...input, ground: carved }, config);
    expect(report.steepestBank.value).toBe(gentle);
    expect(report.nearestWater.value).toBeLessThan(16);
  });

  it('counts no bank where the island’s own ground is steep beside the road and the earthworks left it as it was', () => {
    // A plateau at 10 m whose edge drops 15 m over 7 m (214%) between 23 and 30 m outside the ring; the road on the plateau.
    const drop = (x: number, z: number): number => {
      const r = Math.hypot(x, z);
      return r < 123 ? 10 : r > 130 ? -5 : 10 - ((r - 123) * 15) / 7;
    };
    const { input, report } = reportFor(circle, 400, drop, () => 10);
    // The fit's blend reaches the drop and reshapes its lip, steeper than the plateau was there: the road's own bank, counted.
    expect(report.steepestBank.value).toBeGreaterThan(0.3);
    // Earthworks that left the ground as it was beside the road make no bank, however steep the island is there.
    const untouched = fitReport({ ...input, earthworks: input.natural }, config);
    expect(untouched.steepestBank.value).toBe(0);
  });

  it('measures no embankment and no bank along a bridge (M6.1)', () => {
    // The road 8 m over level ground: a tall embankment, unless the whole lap is a bridge.
    const { input, report } = reportFor(circle, 400, () => 10, () => 18);
    expect(report.tallestFill.value).toBeGreaterThan(7);
    const bridged = fitReport({ ...input, bridged: new Uint8Array(circle.count).fill(1) }, config);
    expect(bridged.tallestFill.value).toBe(0);
    expect(bridged.steepestBank.value).toBe(0);
  });

  it('counts no road hanging in the air along a bridge, where the ground is left as it was (M6.1b)', () => {
    const { input } = reportFor(circle, 400, () => 10, () => 18);
    const left = { ...input, earthworks: input.natural, ground: input.natural };
    expect(fitReport(left, config).roadFloating).toBeGreaterThan(0);
    expect(fitReport({ ...left, bridged: new Uint8Array(circle.count).fill(1) }, config).roadFloating).toBe(0);
  });

  it('finds the water nearest the road', () => {
    // The sea starts at x = 150, so 50 m from the centre line at its nearest.
    const { report } = reportFor(circle, 400, (x) => (x > 150 ? -5 : 10), () => 10);
    expect(report.nearestWater.value).toBeGreaterThan(50 - HALF - 3);
    expect(report.nearestWater.value).toBeLessThan(50 - HALF + 3);
    expect(report.nearestWater.x).toBeGreaterThan(145);
  });

  it('does not count water under a bridge, which a crossing puts there on purpose (M6.1d-2)', () => {
    // Water across the road on the +X side, and the sea 50 m off on the -X side.
    const { input, report } = reportFor(circle, 400, (x) => (x > 90 ? -5 : x < -150 ? -5 : 10), () => 10);
    expect(report.nearestWater.value).toBeLessThan(25);
    expect(report.nearestWater.x).toBeGreaterThan(85);
    // The +X half of the lap on a bridge: the nearest water is the sea on the other side.
    const bridged = Uint8Array.from({ length: circle.count }, (_, i) => (circle.x[i]! > 0 ? 1 : 0));
    const off = fitReport({ ...input, bridged }, config).nearestWater;
    expect(off.value).toBeGreaterThan(50 - HALF - 3);
    expect(off.value).toBeLessThan(50 - HALF + 3);
    expect(off.x).toBeLessThan(-145);
  });

  it('measures the water from the true edge of a wider road', () => {
    const { report } = reportFor(circle, 400, (x) => (x > 150 ? -5 : 10), () => 10, 20);
    expect(report.nearestWater.value).toBeGreaterThan(50 - 10 - 3);
    expect(report.nearestWater.value).toBeLessThan(50 - 10 + 3);
  });

  it('measures cut and fill right across a wider road', () => {
    // Ground at 20 m, but 23 m beyond x = 108. A 12 m road (edge at 106) never reaches the higher ground; a 20 m road (edge at 110) does.
    const step = (x: number): number => (x > 108 ? 23 : 20);
    expect(reportFor(circle, 400, step, () => 15, 12).report.deepestCut.value).toBeLessThan(6.5);
    expect(reportFor(circle, 400, step, () => 15, 20).report.deepestCut.value).toBeGreaterThan(7);
  });

  it('checks the whole width of a wider road for ground showing through', () => {
    const { input } = reportFor(circle, 400, () => 10, () => 10, 20);
    expect(fitReport(input, config).groundThroughRoad).toBe(0);
    // Push up a few cells 9 m out from the centre line: on a 20 m road, off a 12 m one.
    const size = input.ground.size;
    const cell = Math.round((0 + 200) / 2) * size + Math.round((109 + 200) / 2);
    for (const c of [cell, cell + 1, cell + size, cell + size + 1]) input.ground.height[c] = 10.4;
    expect(fitReport(input, config).groundThroughRoad).toBeGreaterThan(0);
  });

  it('looks for separate sections out to the coupling gap beyond the road edges', () => {
    const reach = config.road.coupleGap + config.track.roadWidth;
    const { report } = reportFor(stadiumLine(300, (reach - 2) / 2), 520, () => 10, () => 10);
    expect(report.closestSections!.value).toBeCloseTo(reach - 2, 0);
    expect(reportFor(stadiumLine(300, (reach + 2) / 2), 520, () => 10, () => 10).report.closestSections).toBeNull();
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
