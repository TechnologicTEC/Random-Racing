import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import { sampleField } from '../gen/world/heightfield';
import { orbitEye, type Orbit } from './orbit';
import { clearOrbit, fitOrbit, landRing, onScreen } from './orbitFit';

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

describe('fitOrbit', () => {
  const ring = Array.from({ length: 16 }, (_, k) => ({ x: 600 * Math.cos((k * Math.PI) / 8), y: 0, z: 600 * Math.sin((k * Math.PI) / 8) }));

  it('pulls back just far enough to show every point inside the picture, at any compass angle', () => {
    for (const angle of [0, 1, 2.5, 4]) {
      const fitted = fitOrbit(ring, { ...base, angle }, FOV, ASPECT, 0.9, 30, 5000);
      const seen = ring.map((p) => onScreen(p, fitted, FOV, ASPECT)!);
      for (const s of seen) {
        expect(Math.abs(s.x)).toBeLessThanOrEqual(0.9 + 1e-6);
        expect(Math.abs(s.y)).toBeLessThanOrEqual(0.9 + 1e-6);
      }
      // Just far enough: one point touches the edge.
      expect(Math.max(...seen.map((s) => Math.max(Math.abs(s.x), Math.abs(s.y))))).toBeGreaterThan(0.89);
    }
  });

  it('keeps to the furthest distance allowed', () => {
    expect(fitOrbit(ring, base, FOV, ASPECT, 0.9, 30, 500).distance).toBe(500);
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

describe('landRing on a real island', () => {
  it('rings all the land of seed 1 (a mountain seed with land far from the lap), from the sea up to its highest point', () => {
    const world = generateWorld(1, config);
    const { centre, points } = landRing(world.ground);
    const radius = Math.hypot(points[0]!.x - centre.x, points[0]!.z - centre.z);
    let highest = 0;
    const { ground } = world;
    for (let iz = 0; iz < ground.size; iz += 2) {
      for (let ix = 0; ix < ground.size; ix += 2) {
        const h = ground.height[iz * ground.size + ix]!;
        if (h <= 0) continue;
        const x = ground.origin + ix * ground.cell;
        const z = ground.origin + iz * ground.cell;
        expect(Math.hypot(x - centre.x, z - centre.z)).toBeLessThanOrEqual(radius + ground.cell);
        highest = Math.max(highest, h);
      }
    }
    expect(Math.max(...points.map((p) => p.y))).toBeGreaterThanOrEqual(highest - 1);
    expect(Math.min(...points.map((p) => p.y))).toBe(0);
    // The ring is round the land, not the whole tile: seed 1's island is well inside its 2.7 km tile.
    expect(radius).toBeLessThan(-ground.origin * Math.SQRT2);
    expect(sampleField(ground, centre.x, centre.z, 0)).toBeGreaterThan(0);
  });
});
