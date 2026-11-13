import { describe, expect, it } from 'vitest';
import type { FitReport } from '../gen/types';
import { config } from '../config';
import { analyseSections } from '../gen/track/analysis';
import { stadiumLine } from '../testing/trackFixtures';
import { orbitEye, type Orbit } from './orbit';
import { lookAtPoint, lookAtRoad, lookAtSpot, lookAtTrack, ROAD_SPOT_NAMES, SPOT_NAMES, TRACK_SPOT_NAMES } from './spots';

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

  it('keeps its usual direction when nothing is in the way', () => {
    expect(lookAtSpot('cut', report, heightAt)!.angle).toBe(config.camera.spot.angle);
  });

  it('turns to another side when a mountainside stands where the camera would be', () => {
    // Ground 300 m high on the side the camera usually stands, flat elsewhere.
    const usual = config.camera.spot.angle;
    const wall = (x: number, z: number): number => ((x - 100) * Math.sin(usual) + (z - 50) * Math.cos(usual) > 20 ? 300 : 12);
    const orbit = lookAtSpot('cut', report, wall)!;
    expect(orbit.targetX).toBe(100);
    const eye = orbitEye(orbit);
    expect(eye.y).toBeGreaterThan(wall(eye.x, eye.z) + 2);
    // Nothing between the camera and the spot.
    for (let k = 1; k < 10; k++) {
      const t = k / 10;
      const x = eye.x + (orbit.targetX - eye.x) * t;
      const z = eye.z + (orbit.targetZ - eye.z) * t;
      expect(eye.y + (orbit.targetY - eye.y) * t).toBeGreaterThan(wall(x, z));
    }
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

/** Angle in radians between where the camera looks and the direction from the camera to a point. */
function offAxis(orbit: Orbit, x: number, y: number, z: number): number {
  const eye = orbitEye(orbit);
  const look = [orbit.targetX - eye.x, orbit.targetY - eye.y, orbit.targetZ - eye.z];
  const to = [x - eye.x, y - eye.y, z - eye.z];
  const dot = look[0]! * to[0]! + look[1]! * to[1]! + look[2]! * to[2]!;
  return Math.acos(Math.min(1, dot / (Math.hypot(...look) * Math.hypot(...to))));
}

/** The vertical field of view is 50 degrees; a point this far off the middle is safely in the picture. */
const IN_VIEW = (20 * Math.PI) / 180;

describe('lookAtRoad', () => {
  // Two 400 m straights joined by 20 m hairpins, 2 m between samples.
  const line = stadiumLine(400, 20);
  const n = line.count;
  const below = (): number => -1000;

  /**
   * Road heights: level at 0 except for a 15% ramp over the samples from `from` to `to`, after which the
   * road falls back to 0 gently over the rest of the lap.
   */
  function ramp(from: number, to: number, gradient = 0.15): Float64Array {
    const height = new Float64Array(n);
    const top = (to - from) * line.spacing * gradient;
    for (let i = 0; i < n; i++) {
      if (i < from) height[i] = 0;
      else if (i <= to) height[i] = (i - from) * line.spacing * gradient;
      else height[i] = top * (1 - (i - to) / (n - to));
    }
    return height;
  }

  it('knows the places on the road by name', () => {
    expect(ROAD_SPOT_NAMES).toEqual(['summit', 'climb']);
    expect(lookAtRoad('cut', line, ramp(20, 70), [], below)).toBeNull();
  });

  describe('summit', () => {
    const height = ramp(20, 70);
    const top = 70;
    const mountain = { x: line.x[top]! + 80, z: line.z[top]! + 250, summit: 180 };

    it('aims past the lap s highest point at the main summit, with both in the picture', () => {
      const orbit = lookAtRoad('summit', line, height, [mountain, { x: -900, z: 0, summit: 120 }], below)!;
      expect(offAxis(orbit, line.x[top]!, height[top]!, line.z[top]!)).toBeLessThan(IN_VIEW);
      expect(offAxis(orbit, mountain.x, mountain.summit, mountain.z)).toBeLessThan(IN_VIEW);
    });

    it('stands behind the highest point, on the side away from the summit, and close to it', () => {
      const orbit = lookAtRoad('summit', line, height, [mountain], below)!;
      const eye = orbitEye(orbit);
      const fromSummit = (x: number, z: number): number => Math.hypot(x - mountain.x, z - mountain.z);
      expect(fromSummit(eye.x, eye.z)).toBeGreaterThan(fromSummit(line.x[top]!, line.z[top]!) + 20);
      expect(Math.hypot(eye.x - line.x[top]!, eye.z - line.z[top]!)).toBeLessThan(250);
    });

    it('keeps the camera above the ground', () => {
      const orbit = lookAtRoad('summit', line, height, [mountain], () => 30)!;
      expect(orbitEye(orbit).y).toBeGreaterThan(30 + 2);
    });

    it('looks along the road from its highest point when the island has no mountain', () => {
      const orbit = lookAtRoad('summit', line, height, [], below)!;
      const eye = orbitEye(orbit);
      expect(offAxis(orbit, line.x[top]!, height[top]!, line.z[top]!)).toBeLessThan(IN_VIEW);
      // Behind the highest point as the cars drive: on this straight they head along +x.
      expect(line.tx[top]!).toBeCloseTo(1, 6);
      expect(eye.x).toBeLessThan(line.x[top]! - 20);
    });
  });

  describe('climb', () => {
    it('aims at the middle of the steepest stretch, from low down the hill on the road s line', () => {
      const height = ramp(20, 70);
      const orbit = lookAtRoad('climb', line, height, [], below)!;
      const eye = orbitEye(orbit);
      // The ramp runs from x = -160 to -60 on the first straight, uphill as the cars drive (+x).
      expect(orbit.targetX).toBeGreaterThan(-160);
      expect(orbit.targetX).toBeLessThan(-60);
      expect(orbit.targetZ).toBeCloseTo(-20, 0);
      // At the road's height there (samples are 2 m apart from x = -200).
      expect(orbit.targetY).toBeCloseTo(height[Math.round((orbit.targetX + 200) / 2)]!, 6);
      // Downhill of it, a little to one side, looking up the slope.
      expect(eye.x).toBeLessThan(orbit.targetX - 40);
      expect(Math.abs(eye.z - orbit.targetZ)).toBeGreaterThan(5);
      expect(Math.abs(eye.z - orbit.targetZ)).toBeLessThan(Math.abs(eye.x - orbit.targetX) / 2);
      expect(orbit.tilt).toBeLessThan(0.35);
    });

    it('still stands on the low side when the cars drive down the steepest stretch', () => {
      const height = ramp(20, 70).map((h) => -h);
      const orbit = lookAtRoad('climb', line, height, [], below)!;
      const eye = orbitEye(orbit);
      expect(orbit.targetX).toBeGreaterThan(-160);
      expect(orbit.targetX).toBeLessThan(-60);
      // Now downhill is ahead (+x).
      expect(eye.x).toBeGreaterThan(orbit.targetX + 40);
    });

    it('lifts the camera clear of the ground below the climb', () => {
      const height = ramp(20, 70);
      // A bank that rises beside and below the stretch, higher than the road.
      const orbit = lookAtRoad('climb', line, height, [], () => 25)!;
      expect(orbitEye(orbit).y).toBeGreaterThan(25 + 2);
    });
  });
});
