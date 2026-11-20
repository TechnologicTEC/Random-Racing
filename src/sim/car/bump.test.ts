import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { bounces, wallPush, wallTurn } from './bump';

const car = config.car;
const UP = { x: 0, y: 1, z: 0 };
/** Facing `degrees` to the right of -z, on the map. */
const facing = (degrees: number) => {
  const a = (degrees * Math.PI) / 180;
  return { x: Math.sin(a), y: 0, z: -Math.cos(a) };
};
/** A wall on the car's right: its face looks back along -x, towards the car. */
const RIGHT_WALL = { x: -1, y: 0, z: 0 };
const LEFT_WALL = { x: 1, y: 0, z: 0 };

describe('wallTurn: the turn that brings the nose along a wall, and a little away from it', () => {
  const { turn, away } = car.bump;
  const rad = (degrees: number) => (degrees * Math.PI) / 180;

  it('turns the nose away from a wall it points into: into plus `away`, times along', () => {
    // Positive is to the left: away from a wall on the right.
    expect(wallTurn(facing(30), UP, RIGHT_WALL, car)).toBeCloseTo(turn * (Math.sin(rad(30)) + away) * Math.cos(rad(30)), 12);
    expect(wallTurn(facing(10), UP, RIGHT_WALL, car)).toBeCloseTo(turn * (Math.sin(rad(10)) + away) * Math.cos(rad(10)), 12);
  });

  it('mirrors on the other side', () => {
    expect(wallTurn(facing(-30), UP, LEFT_WALL, car)).toBeCloseTo(-wallTurn(facing(30), UP, RIGHT_WALL, car), 12);
  });

  it('still turns a car pressed flat along the wall, gently, so it leaves the wall', () => {
    expect(wallTurn(facing(0), UP, RIGHT_WALL, car)).toBeCloseTo(turn * away, 12);
  });

  it('gives nothing once the nose points `away` from the wall or further', () => {
    const edge = (Math.asin(away) * 180) / Math.PI;
    expect(wallTurn(facing(-edge - 0.01), UP, RIGHT_WALL, car)).toBe(0);
    expect(wallTurn(facing(-20), UP, RIGHT_WALL, car)).toBe(0);
  });

  it('fades to nothing dead head on, where neither way along the wall is nearer', () => {
    expect(Math.abs(wallTurn(facing(90), UP, RIGHT_WALL, car))).toBeLessThan(1e-12);
    expect(Math.abs(wallTurn(facing(89), UP, RIGHT_WALL, car))).toBeLessThan(turn * 0.02);
  });

  it('reads the wall flat on the map: a slope in the contact does not change it', () => {
    const tipped = { x: -0.8, y: 0.6, z: 0 };
    expect(wallTurn(facing(30), UP, tipped, car)).toBeCloseTo(wallTurn(facing(30), UP, RIGHT_WALL, car), 12);
  });

  it('gives nothing for a contact that faces straight up', () => {
    expect(wallTurn(facing(30), UP, UP, car)).toBe(0);
  });
});

describe('bounces: what the wall rules act on', () => {
  it('is the walls and the start gate, not trees, rocks or nothing', () => {
    expect(bounces('wall')).toBe(true);
    expect(bounces('gate')).toBe(true);
    expect(bounces('tree')).toBe(false);
    expect(bounces('rock')).toBe(false);
    expect(bounces(null)).toBe(false);
  });
});

describe('wallPush: how fast a new hit sends the car off the wall', () => {
  it('brings the car to `bump.push` away from the wall, flat on the map', () => {
    // Stopped against the wall: the full push.
    expect(wallPush({ x: 0, y: 0, z: -5 }, RIGHT_WALL, car)).toBeCloseTo(car.bump.push, 12);
    // Still going into it at 2 m/s: that and the push.
    expect(wallPush({ x: 2, y: 0, z: 0 }, RIGHT_WALL, car)).toBeCloseTo(car.bump.push + 2, 12);
    // Already leaving it faster than the push: nothing.
    expect(wallPush({ x: -3, y: 0, z: 0 }, RIGHT_WALL, car)).toBe(0);
    expect(wallPush({ x: 0, y: 0, z: 0 }, { x: -0.8, y: 0.6, z: 0 }, car)).toBeCloseTo(car.bump.push, 12);
  });
});
