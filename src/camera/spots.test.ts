import { describe, expect, it } from 'vitest';
import type { FitReport } from '../gen/types';
import { config } from '../config';
import { analyseSections } from '../gen/track/analysis';
import { stadiumLine } from '../testing/trackFixtures';
import { lookAtPoint, lookAtSpot, lookAtTrack, SPOT_NAMES, TRACK_SPOT_NAMES } from './spots';

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

describe('lookAtPoint', () => {
  it('aims a close camera at a map position written as "x,z"', () => {
    const orbit = lookAtPoint('122,-250', heightAt)!;
    expect(orbit.targetX).toBe(122);
    expect(orbit.targetZ).toBe(-250);
    expect(orbit.targetY).toBe(12);
  });

  it('ignores anything that is not two numbers', () => {
    expect(lookAtPoint('', heightAt)).toBeNull();
    expect(lookAtPoint('12', heightAt)).toBeNull();
    expect(lookAtPoint('a,b', heightAt)).toBeNull();
  });
});

describe('lookAtTrack', () => {
  // Two 400 m straights joined by 20 m hairpins. The lap starts at the beginning of the first straight.
  const line = stadiumLine(400, 20);
  const sections = analyseSections(line, config.track);

  it('knows the places on the track by name', () => {
    expect(TRACK_SPOT_NAMES).toEqual(['hairpin', 'start']);
  });

  it('aims at the middle of the tightest corner', () => {
    const orbit = lookAtTrack('hairpin', line, sections, heightAt)!;
    // Both hairpins are the same; the first is centred on x = 200, bulging out to x = 220.
    expect(Math.abs(orbit.targetX)).toBeGreaterThan(205);
    expect(Math.abs(orbit.targetZ)).toBeLessThan(6);
    expect(orbit.distance).toBeLessThan(150);
  });

  it('aims at the start line', () => {
    const orbit = lookAtTrack('start', line, sections, heightAt)!;
    expect(orbit.targetX).toBeCloseTo(line.x[0]!, 6);
    expect(orbit.targetZ).toBeCloseTo(line.z[0]!, 6);
  });

  it('has nothing to look at for a name it does not know', () => {
    expect(lookAtTrack('cut', line, sections, heightAt)).toBeNull();
  });
});
