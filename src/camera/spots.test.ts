import { describe, expect, it } from 'vitest';
import type { FitReport } from '../gen/types';
import { lookAtSpot, SPOT_NAMES } from './spots';

const spot = (x: number, z: number, sample = 0) => ({ x, z, value: 1, sample });
const report: FitReport = {
  deepestCut: spot(100, 50, 10),
  tallestFill: spot(-80, 20, 20),
  steepestBank: spot(5, -200, 30),
  closestSections: spot(40, 40, 40),
  nearestWater: spot(300, 0, 50),
  groundThroughRoad: 0,
  roadFloating: 0,
};
const heightAt = (): number => 12;

describe('lookAtSpot', () => {
  it('knows the spots by name', () => {
    expect(SPOT_NAMES).toEqual(['cut', 'fill', 'bank', 'close', 'water']);
  });

  it('aims a close camera at the named spot, at ground height there', () => {
    const orbit = lookAtSpot('cut', report, heightAt)!;
    expect(orbit.targetX).toBe(100);
    expect(orbit.targetZ).toBe(50);
    expect(orbit.targetY).toBe(12);
    expect(orbit.distance).toBeLessThan(150);
    expect(orbit.distance).toBeGreaterThan(40);
    expect(orbit.tilt).toBeGreaterThan(0.2);
    expect(orbit.tilt).toBeLessThan(0.9);
  });

  it('aims at each of the other spots', () => {
    expect(lookAtSpot('fill', report, heightAt)!.targetX).toBe(-80);
    expect(lookAtSpot('bank', report, heightAt)!.targetZ).toBe(-200);
    expect(lookAtSpot('close', report, heightAt)!.targetX).toBe(40);
    expect(lookAtSpot('water', report, heightAt)!.targetX).toBe(300);
  });

  it('never looks at the water from below the sea', () => {
    expect(lookAtSpot('water', report, () => -6)!.targetY).toBeGreaterThanOrEqual(0);
  });

  it('has nothing to look at when no sections are close, or the name is unknown', () => {
    expect(lookAtSpot('close', { ...report, closestSections: null }, heightAt)).toBeNull();
    expect(lookAtSpot('nonsense', report, heightAt)).toBeNull();
  });
});
