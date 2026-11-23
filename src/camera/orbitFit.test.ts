import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import { sampleField } from '../gen/world/heightfield';
import { orbitEye, type Orbit } from './orbit';
import { clearOrbit, lapRing, onScreen } from './orbitFit';

/**
 * The circling camera at the check-in after M4.4 (Tane): it frames the whole island behind the title card, and it
 * never goes under the ground or the sea, where the empty space under the island shows.
 */
const FOV = config.render.fieldOfView;
const ASPECT = 16 / 9;
const base: Orbit = { targetX: 0, targetY: 20, targetZ: 0, angle: 0.6, tilt: 0.75, distance: 900 };

describe('onScreen', () => {
  it('puts the point looked at in the middle of the picture, and a point behind the camera nowhere', () => {
    const middle = onScreen({ x: base.targetX, y: base.targetY, z: base.targetZ }, base, FOV, ASPECT)!;
    expect(middle.x).toBeCloseTo(0, 9);
    expect(middle.y).toBeCloseTo(0, 9);
    const eye = orbitEye(base);
    const behind = { x: 2 * eye.x - base.targetX, y: 2 * eye.y - base.targetY, z: 2 * eye.z - base.targetZ };
    expect(onScreen(behind, base, FOV, ASPECT)).toBeNull();
  });

  it('measures across the picture by its width and up it by its height, from -1 to 1', () => {
    // Looking level at the target from 900 m: a point above it by tan(half the view) times 900 is at the top edge,
    // and one beside it by the aspect times that at the right edge.
    const half = (FOV / 2) * (Math.PI / 180);
    const level: Orbit = { ...base, targetX: 0, targetY: 0, targetZ: 0, angle: 0, tilt: 0, distance: 900 };
    const top = onScreen({ x: 0, y: Math.tan(half) * 900, z: 0 }, level, FOV, ASPECT)!;
    expect(top.y).toBeCloseTo(1, 9);
    expect(top.x).toBeCloseTo(0, 9);
    const side = onScreen({ x: Math.tan(half) * ASPECT * 900, y: 0, z: 0 }, level, FOV, ASPECT)!;
    expect(Math.abs(side.x)).toBeCloseTo(1, 9);
  });
});

describe('clearOrbit', () => {
  const hill = (x: number, z: number): number => Math.max(0, 200 - Math.hypot(x - 300, z) * 0.5);

  it('leaves a camera well above the ground as it is', () => {
    const high = { ...base, tilt: 1.2 };
    expect(clearOrbit(high, () => 10, 5)).toEqual(high);
  });

  it('tips a camera that would be inside a hill up until it is clear of the ground', () => {
    // Looking along the ground from the far side of a 200 m hill.
    const low: Orbit = { ...base, angle: Math.PI / 2, tilt: 0.09, distance: 300 };
    const eye = orbitEye(low);
    expect(eye.y).toBeLessThan(hill(eye.x, eye.z));
    const cleared = clearOrbit(low, hill, 5);
    const raised = orbitEye(cleared);
    expect(raised.y).toBeGreaterThanOrEqual(hill(raised.x, raised.z) + 5 - 1e-6);
    expect(cleared.angle).toBe(low.angle);
    expect(cleared.distance).toBe(low.distance);
  });

  it('backs off when even looking straight down leaves it in the ground: the point it circles is inside a hill', () => {
    // Circling a point 40 m under the top of a hill, 30 m away.
    const inside: Orbit = { ...base, targetX: 300, targetY: 160, targetZ: 0, tilt: 0.1, distance: 30 };
    const cleared = clearOrbit(inside, hill, 5);
    const raised = orbitEye(cleared);
    expect(raised.y).toBeGreaterThanOrEqual(hill(raised.x, raised.z) + 5 - 1e-6);
    expect(cleared.distance).toBeGreaterThan(inside.distance);
  });

  it('keeps the camera above the sea as well as the sea bed', () => {
    const deep: Orbit = { ...base, targetY: -20, tilt: 0.09, distance: 100 };
    const raised = orbitEye(clearOrbit(deep, () => -30, 5));
    expect(raised.y).toBeGreaterThanOrEqual(5 - 1e-6);
  });
});

describe('lapRing on a real island', () => {
  it('rings the whole lap of seed 1 (a mountain seed), from the road\u2019s lowest point up to its highest', () => {
    const world = generateWorld(1, config);
    const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
    const { centre, radius, points } = lapRing(line, profile.height);
    for (let i = 0; i < line.count; i++) expect(Math.hypot(line.x[i]! - centre.x, line.z[i]! - centre.z)).toBeLessThanOrEqual(radius + 1e-9);
    // Just round it: some sample is on the ring.
    let reach = 0;
    for (let i = 0; i < line.count; i++) reach = Math.max(reach, Math.hypot(line.x[i]! - centre.x, line.z[i]! - centre.z));
    expect(reach).toBeCloseTo(radius, 9);
    const heights = points.map((p) => p.y);
    expect(Math.min(...heights)).toBe(Math.min(...profile.height));
    expect(Math.max(...heights)).toBe(Math.max(...profile.height));
    // Well inside the island's tile, and much smaller than a ring round all the land would be.
    expect(radius).toBeLessThan(-world.ground.origin);
    expect(sampleField(world.ground, centre.x, centre.z, 0)).toBeGreaterThan(-100);
  });
});
