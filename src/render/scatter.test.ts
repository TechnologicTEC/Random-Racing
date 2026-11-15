import { describe, expect, it } from 'vitest';
import type { Scatter } from '../gen/types';
import { groupScatter, type GroupOptions } from './scatter';

/** A scatter of `count` things spread over a square 2 km wide, of three kinds, from a small repeatable generator. */
function sample(count: number): Scatter {
  let state = 12345;
  const next = (): number => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 4294967296;
  };
  const scatter: Scatter = {
    count,
    x: new Float32Array(count),
    y: new Float32Array(count),
    z: new Float32Array(count),
    size: new Float32Array(count),
    tall: new Float32Array(count),
    turn: new Float32Array(count),
    lean: new Float32Array(count),
    kind: new Uint8Array(count),
    shade: new Uint8Array(count),
  };
  for (let i = 0; i < count; i++) {
    scatter.x[i] = (next() - 0.5) * 2000;
    scatter.y[i] = next() * 120;
    scatter.z[i] = (next() - 0.5) * 2000;
    scatter.size[i] = 0.8 + next() * 0.7;
    scatter.tall[i] = 0.9 + next() * 0.25;
    scatter.turn[i] = next() * 6.28;
    scatter.lean[i] = next() * 0.22;
    scatter.kind[i] = Math.floor(next() * 3);
    scatter.shade[i] = Math.floor(next() * 256);
  }
  return scatter;
}

const options: GroupOptions = {
  cell: 450,
  sink: 0.35,
  shade: [0.8, 1.12],
  shapes: [
    { top: 6.1, reach: 3.1 },
    { top: 6.5, reach: 2 },
    { top: 7.2, reach: 3 },
  ],
};
const scatter = sample(600);
const groups = groupScatter(scatter, options);

/** Column `c` of instance `i` of a group's matrices. */
const column = (matrices: Float32Array, i: number, c: number): [number, number, number, number] => [
  matrices[i * 16 + c * 4]!,
  matrices[i * 16 + c * 4 + 1]!,
  matrices[i * 16 + c * 4 + 2]!,
  matrices[i * 16 + c * 4 + 3]!,
];
const length = (v: readonly number[]): number => Math.hypot(v[0]!, v[1]!, v[2]!);
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/** For each thing of the scatter, the group and place it was found in, by its position. */
function locate(): Array<Array<{ group: number; i: number }>> {
  const found: Array<Array<{ group: number; i: number }>> = Array.from({ length: scatter.count }, () => []);
  const byPlace = new Map<string, number>();
  for (let s = 0; s < scatter.count; s++) byPlace.set(`${scatter.x[s]},${scatter.z[s]}`, s);
  groups.forEach((group, g) => {
    for (let i = 0; i < group.count; i++) {
      const [x, , z] = column(group.matrices, i, 3);
      const s = byPlace.get(`${x},${z}`);
      if (s !== undefined) found[s]!.push({ group: g, i });
    }
  });
  return found;
}

describe('groupScatter', () => {
  it('gives nothing for an empty scatter', () => {
    expect(groupScatter(sample(0), options)).toEqual([]);
  });

  it('puts every thing in exactly one group', () => {
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(scatter.count);
    for (const places of locate()) expect(places).toHaveLength(1);
  });

  it('sizes each group s lists to its count: 16 numbers of matrix and 3 of tint per thing', () => {
    for (const group of groups) {
      expect(group.count).toBeGreaterThan(0);
      expect(group.matrices).toHaveLength(group.count * 16);
      expect(group.tints).toHaveLength(group.count * 3);
    }
  });

  it('keeps one kind to a group, and a group to one square of the map', () => {
    const found = locate();
    for (let s = 0; s < scatter.count; s++) {
      const group = groups[found[s]![0]!.group]!;
      expect(group.kind).toBe(scatter.kind[s]);
    }
    for (const group of groups) {
      const squares = new Set<string>();
      for (let i = 0; i < group.count; i++) {
        const [x, , z] = column(group.matrices, i, 3);
        squares.add(`${Math.floor(x / options.cell)},${Math.floor(z / options.cell)}`);
      }
      expect(squares.size).toBe(1);
    }
    // A 2 km square cuts across six 450 m squares each way; three kinds: far fewer groups than things.
    expect(groups.length).toBeLessThanOrEqual(36 * 3);
  });

  it('places each thing at its spot, sunk a little into the ground by its size', () => {
    const found = locate();
    for (let s = 0; s < scatter.count; s++) {
      const { group, i } = found[s]![0]!;
      const [x, y, z, w] = column(groups[group]!.matrices, i, 3);
      expect(x).toBe(scatter.x[s]);
      expect(z).toBe(scatter.z[s]);
      expect(y).toBeCloseTo(scatter.y[s]! - options.sink * scatter.size[s]!, 4);
      expect(w).toBe(1);
    }
  });

  it('sizes each thing: as wide as its size, as tall as its size times its height', () => {
    const found = locate();
    for (let s = 0; s < scatter.count; s++) {
      const { group, i } = found[s]![0]!;
      const m = groups[group]!.matrices;
      expect(length(column(m, i, 0))).toBeCloseTo(scatter.size[s]!, 4);
      expect(length(column(m, i, 1))).toBeCloseTo(scatter.size[s]! * scatter.tall[s]!, 4);
      expect(length(column(m, i, 2))).toBeCloseTo(scatter.size[s]!, 4);
      // Its three axes stay square to each other: it is turned and leant, never sheared.
      expect(Math.abs(dot(column(m, i, 0), column(m, i, 1)))).toBeLessThan(1e-4);
      expect(Math.abs(dot(column(m, i, 1), column(m, i, 2)))).toBeLessThan(1e-4);
      expect(Math.abs(dot(column(m, i, 0), column(m, i, 2)))).toBeLessThan(1e-4);
    }
  });

  it('leans each thing by its lean, towards the way it is turned', () => {
    const found = locate();
    for (let s = 0; s < scatter.count; s++) {
      const { group, i } = found[s]![0]!;
      const up = column(groups[group]!.matrices, i, 1);
      const tall = length(up);
      // The upright axis is tipped from straight up by exactly the lean.
      expect(up[1] / tall).toBeCloseTo(Math.cos(scatter.lean[s]!), 4);
      // ...and tips over towards the direction the turn gives.
      const sideways = Math.sin(scatter.lean[s]!);
      expect(up[0] / tall).toBeCloseTo(Math.sin(scatter.turn[s]!) * sideways, 4);
      expect(up[2] / tall).toBeCloseTo(Math.cos(scatter.turn[s]!) * sideways, 4);
    }
  });

  it('tints each thing by its shade, within the range given, lighter for a higher shade', () => {
    const found = locate();
    const brightness: Array<[shade: number, green: number]> = [];
    for (let s = 0; s < scatter.count; s++) {
      const { group, i } = found[s]![0]!;
      const tints = groups[group]!.tints;
      for (let c = 0; c < 3; c++) {
        expect(tints[i * 3 + c]!).toBeGreaterThanOrEqual(options.shade[0] * 0.9);
        expect(tints[i * 3 + c]!).toBeLessThanOrEqual(options.shade[1] * 1.1);
      }
      brightness.push([scatter.shade[s]!, tints[i * 3 + 1]!]);
    }
    brightness.sort((a, b) => a[0] - b[0]);
    expect(brightness[0]![1]).toBeLessThan(brightness[brightness.length - 1]![1]);
    for (let k = 1; k < brightness.length; k++) expect(brightness[k]![1]).toBeGreaterThanOrEqual(brightness[k - 1]![1] - 1e-6);
  });

  it('wraps each group in a ball that holds every thing in it, from foot to top', () => {
    for (const group of groups) {
      const shape = options.shapes[group.kind]!;
      const within = (point: readonly number[]): number => Math.hypot(point[0]! - group.centre.x, point[1]! - group.centre.y, point[2]! - group.centre.z);
      for (let i = 0; i < group.count; i++) {
        const foot = column(group.matrices, i, 3);
        const up = column(group.matrices, i, 1);
        const top = [foot[0] + up[0] * shape.top, foot[1] + up[1] * shape.top, foot[2] + up[2] * shape.top];
        const size = length(column(group.matrices, i, 0));
        expect(within(foot) + shape.reach * size).toBeLessThanOrEqual(group.radius + 1e-3);
        expect(within(top) + shape.reach * size).toBeLessThanOrEqual(group.radius + 1e-3);
      }
      // The ball is not much bigger than the square it covers.
      expect(group.radius).toBeLessThan(options.cell);
    }
  });

  it('builds the same groups every time', () => {
    expect(groupScatter(scatter, options)).toEqual(groups);
  });
});
