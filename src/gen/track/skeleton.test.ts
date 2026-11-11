import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../../core/vec2';
import { castRay, clearanceOk, perimeter, signedArea } from './skeleton';

const rect = (w: number, h: number): Vec2[] => [
  { x: -w / 2, z: -h / 2 },
  { x: w / 2, z: -h / 2 },
  { x: w / 2, z: h / 2 },
  { x: -w / 2, z: h / 2 },
];

describe('signedArea and perimeter', () => {
  it('is positive for a loop listed clockwise on the map and negative the other way', () => {
    expect(signedArea(rect(400, 200))).toBeCloseTo(80000, 6);
    expect(signedArea(rect(400, 200).reverse())).toBeCloseTo(-80000, 6);
  });

  it('adds up the edge lengths', () => {
    expect(perimeter(rect(400, 200))).toBeCloseTo(1200, 9);
  });
});

describe('clearanceOk', () => {
  const check = (points: Vec2[]) => clearanceOk(points, 40, 110);

  it('accepts an open shape', () => {
    expect(check(rect(400, 400))).toBe(true);
  });

  it('accepts a narrow strip whose sides are just far enough apart', () => {
    expect(check(rect(700, 44))).toBe(true);
  });

  it('rejects a strip whose sides are too close', () => {
    expect(check(rect(700, 30))).toBe(false);
  });

  it('rejects a shape that crosses itself', () => {
    const bowTie: Vec2[] = [{ x: -300, z: -150 }, { x: 300, z: 150 }, { x: 300, z: -150 }, { x: -300, z: 150 }];
    expect(check(bowTie)).toBe(false);
  });

  it('rejects a shape pinched to a 20 m waist', () => {
    const waist: Vec2[] = [
      { x: -350, z: -150 }, { x: 0, z: -10 }, { x: 350, z: -150 },
      { x: 350, z: 150 }, { x: 0, z: 10 }, { x: -350, z: 150 },
    ];
    expect(check(waist)).toBe(false);
  });

  it('allows a small sideways jog, where the two parts follow straight on from each other', () => {
    const jog: Vec2[] = [
      { x: -300, z: -200 }, { x: -20, z: -200 }, { x: 20, z: -180 }, { x: 300, z: -180 },
      { x: 300, z: 200 }, { x: -300, z: 200 },
    ];
    expect(check(jog)).toBe(true);
  });
});

describe('castRay', () => {
  const square = rect(400, 400);

  it('measures the distance across the shape from an edge', () => {
    // Edge 0 is the top side; straight down from its middle hits the bottom side 400 m away.
    expect(castRay(square, 0, 0, -200, 0, 1)).toBeCloseTo(400, 9);
  });

  it('returns Infinity when nothing is in the way', () => {
    expect(castRay(square, 0, 0, -200, 0, -1)).toBe(Infinity);
  });

  it('ignores the edge the ray starts from', () => {
    expect(castRay(square, 0, 100, -200, 0, 1)).toBeCloseTo(400, 9);
  });
});
