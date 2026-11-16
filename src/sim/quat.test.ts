import { describe, expect, it } from 'vitest';
import { quatFromAxes, rotate, type Vec3 } from './quat';

const X: Vec3 = { x: 1, y: 0, z: 0 };
const Y: Vec3 = { x: 0, y: 1, z: 0 };
const Z: Vec3 = { x: 0, y: 0, z: 1 };

/** Three unit vectors at right angles: the axes turned by `yaw` about the upright axis, then tipped by `pitch` and `roll`. */
function axes(yaw: number, pitch: number, roll: number): [Vec3, Vec3, Vec3] {
  const turn = (v: Vec3): Vec3 => {
    // Roll about z, then pitch about x, then yaw about y.
    let { x, y, z } = v;
    [x, y] = [x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll)];
    [y, z] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
    [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
    return { x, y, z };
  };
  return [turn(X), turn(Y), turn(Z)];
}

function expectClose(actual: Vec3, expected: Vec3): void {
  expect(actual.x).toBeCloseTo(expected.x, 12);
  expect(actual.y).toBeCloseTo(expected.y, 12);
  expect(actual.z).toBeCloseTo(expected.z, 12);
}

describe('quatFromAxes', () => {
  it('gives no turn for the axes as they are', () => {
    expect(quatFromAxes(X, Y, Z)).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it.each([
    [0.5, 0, 0],
    [2.4, 0, 0],
    [Math.PI, 0, 0],
    [-1.9, 0.1, -0.05],
    [0.3, 1.2, 0.4],
    [1.1, -2.8, 0.2],
    [0.2, 0.1, 3.0],
    [-3.0, 0.4, 2.9],
    [1.57, 1.57, 1.57],
  ])('gives the turn that carries the axes onto the ones asked for (yaw %f, pitch %f, roll %f)', (yaw, pitch, roll) => {
    const [x, y, z] = axes(yaw, pitch, roll);
    const turn = quatFromAxes(x, y, z);
    expect(turn.x ** 2 + turn.y ** 2 + turn.z ** 2 + turn.w ** 2).toBeCloseTo(1, 12);
    expectClose(rotate(turn, X), x);
    expectClose(rotate(turn, Y), y);
    expectClose(rotate(turn, Z), z);
  });
});

describe('rotate', () => {
  it('leaves a vector alone when there is no turn', () => {
    expect(rotate({ x: 0, y: 0, z: 0, w: 1 }, { x: 1.5, y: -2, z: 3 })).toEqual({ x: 1.5, y: -2, z: 3 });
  });

  it('turns a vector a quarter of a circle about the upright axis', () => {
    // A quarter turn about y carries z onto x.
    const quarter = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
    expectClose(rotate(quarter, Z), X);
    expectClose(rotate(quarter, Y), Y);
  });

  it('keeps a vector its length', () => {
    const [x, y, z] = axes(0.7, -0.3, 1.9);
    const turned = rotate(quatFromAxes(x, y, z), { x: 3, y: 4, z: 12 });
    expect(Math.sqrt(turned.x ** 2 + turned.y ** 2 + turned.z ** 2)).toBeCloseTo(13, 10);
  });
});
