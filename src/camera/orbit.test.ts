import { describe, expect, it } from 'vitest';
import { dragOrbit, orbitEye, zoomOrbit, type Orbit } from './orbit';

const orbit: Orbit = { targetX: 10, targetY: 5, targetZ: -20, angle: 0, tilt: Math.PI / 4, distance: 100 };

describe('orbitEye', () => {
  it('sits at the given distance from the target', () => {
    const eye = orbitEye(orbit);
    const d = Math.sqrt((eye.x - 10) ** 2 + (eye.y - 5) ** 2 + (eye.z + 20) ** 2);
    expect(d).toBeCloseTo(100, 9);
  });

  it('is above the target, higher the more it is tilted towards looking straight down', () => {
    const low = orbitEye({ ...orbit, tilt: 0.2 });
    const high = orbitEye({ ...orbit, tilt: 1.3 });
    expect(low.y).toBeGreaterThan(5);
    expect(high.y).toBeGreaterThan(low.y);
  });

  it('swings round the target as the angle changes, keeping its height', () => {
    const a = orbitEye(orbit);
    const b = orbitEye({ ...orbit, angle: Math.PI / 2 });
    expect(b.y).toBeCloseTo(a.y, 9);
    expect(Math.abs(b.x - a.x) + Math.abs(b.z - a.z)).toBeGreaterThan(50);
  });
});

describe('dragOrbit', () => {
  it('turns with a sideways drag and tilts with an up or down drag', () => {
    const turned = dragOrbit(orbit, 100, 0);
    expect(turned.angle).not.toBe(orbit.angle);
    expect(turned.tilt).toBe(orbit.tilt);
    const tilted = dragOrbit(orbit, 0, 50);
    expect(tilted.tilt).not.toBe(orbit.tilt);
    expect(tilted.angle).toBe(orbit.angle);
  });

  it('never tilts below the horizon or past straight down', () => {
    expect(dragOrbit(orbit, 0, -100000).tilt).toBeGreaterThan(0.05);
    expect(dragOrbit(orbit, 0, 100000).tilt).toBeLessThan(Math.PI / 2);
  });

  it('does not change the orbit it was given', () => {
    dragOrbit(orbit, 30, 30);
    expect(orbit.angle).toBe(0);
  });
});

describe('zoomOrbit', () => {
  it('moves closer when scrolling one way and further the other', () => {
    expect(zoomOrbit(orbit, -200, 20, 2000).distance).toBeLessThan(100);
    expect(zoomOrbit(orbit, 200, 20, 2000).distance).toBeGreaterThan(100);
  });

  it('stays within the nearest and furthest distances', () => {
    expect(zoomOrbit(orbit, -1e6, 20, 2000).distance).toBe(20);
    expect(zoomOrbit(orbit, 1e6, 20, 2000).distance).toBe(2000);
  });
});
