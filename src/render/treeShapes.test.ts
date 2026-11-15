import { describe, expect, it } from 'vitest';
import type { TreeKind } from '../gen/types';
import { TREE_KINDS } from '../gen/world/decor';
import { puffShape, rockShape, treeShape, type Shape } from './treeShapes';

const triangles = (shape: Shape): number => shape.indices.length / 3;
const vertices = (shape: Shape): number => shape.positions.length / 3;

/** Lowest and highest value of one axis (0 x, 1 y, 2 z) over a shape's vertices. */
function extent(shape: Shape, axis: number): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (let v = axis; v < shape.positions.length; v += 3) {
    low = Math.min(low, shape.positions[v]!);
    high = Math.max(high, shape.positions[v]!);
  }
  return [low, high];
}

/** Checks every shape must pass: sound triangles, a colour per vertex, measurements that match. */
function expectSound(shape: Shape): void {
  expect(shape.positions.length % 3).toBe(0);
  expect(shape.indices.length % 3).toBe(0);
  expect(shape.colors).toHaveLength(shape.positions.length);
  const used = new Set<number>();
  for (const index of shape.indices) {
    expect(index).toBeLessThan(vertices(shape));
    used.add(index);
  }
  // No vertex is left over that no triangle uses.
  expect(used.size).toBe(vertices(shape));
  for (const channel of shape.colors) {
    expect(channel).toBeGreaterThanOrEqual(0);
    expect(channel).toBeLessThanOrEqual(1);
  }
  for (const value of shape.positions) expect(Number.isFinite(value)).toBe(true);
  // No triangle is squashed to nothing.
  for (let t = 0; t < shape.indices.length; t += 3) {
    const [a, b, c] = [shape.indices[t]!, shape.indices[t + 1]!, shape.indices[t + 2]!].map((i) => [shape.positions[i * 3]!, shape.positions[i * 3 + 1]!, shape.positions[i * 3 + 2]!]);
    const u = [b![0]! - a![0]!, b![1]! - a![1]!, b![2]! - a![2]!];
    const w = [c![0]! - a![0]!, c![1]! - a![1]!, c![2]! - a![2]!];
    const cross = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    expect(Math.hypot(cross[0]!, cross[1]!, cross[2]!)).toBeGreaterThan(1e-4);
  }
  // The measurements given with the shape are its own.
  expect(shape.top).toBeCloseTo(extent(shape, 1)[1], 4);
  let reach = 0;
  for (let v = 0; v < shape.positions.length; v += 3) reach = Math.max(reach, Math.hypot(shape.positions[v]!, shape.positions[v + 2]!));
  expect(shape.reach).toBeCloseTo(reach, 4);
}

describe('treeShape', () => {
  const kinds: readonly TreeKind[] = TREE_KINDS;

  it('gives every kind of tree a sound shape, near and far', () => {
    for (const kind of kinds) {
      expectSound(treeShape(kind, 'near'));
      expectSound(treeShape(kind, 'far'));
    }
  });

  it('keeps near trees to about 30 to 50 triangles and far ones to 16 at most', () => {
    for (const kind of kinds) {
      expect(triangles(treeShape(kind, 'near'))).toBeGreaterThanOrEqual(24);
      expect(triangles(treeShape(kind, 'near'))).toBeLessThanOrEqual(50);
      expect(triangles(treeShape(kind, 'far'))).toBeGreaterThanOrEqual(6);
      expect(triangles(treeShape(kind, 'far'))).toBeLessThanOrEqual(16);
    }
  });

  it('stands every tree with its foot on the ground, a little below it, so it never floats on a slope', () => {
    for (const kind of kinds) {
      for (const detail of ['near', 'far'] as const) {
        const [low] = extent(treeShape(kind, detail), 1);
        expect(low).toBeLessThanOrEqual(0);
        expect(low).toBeGreaterThanOrEqual(-1.5);
      }
    }
  });

  it('makes trees 5 to 9 m tall before they are sized, the far shape as tall as the near one', () => {
    for (const kind of kinds) {
      const near = treeShape(kind, 'near');
      const far = treeShape(kind, 'far');
      expect(near.top).toBeGreaterThan(5);
      expect(near.top).toBeLessThan(9);
      expect(Math.abs(far.top - near.top)).toBeLessThan(0.6);
      expect(Math.abs(far.reach - near.reach)).toBeLessThan(0.8);
    }
  });

  it('gives each kind its own outline: a pine narrow, a broadleaf wide, a palm widest at the top', () => {
    const pine = treeShape('pine', 'near');
    const broadleaf = treeShape('broadleaf', 'near');
    const palm = treeShape('palm', 'near');
    expect(pine.reach).toBeLessThan(broadleaf.reach);
    // A palm is a bare trunk for most of its height: no vertex in its middle third is far from the trunk.
    let widestMiddle = 0;
    for (let v = 0; v < palm.positions.length; v += 3) {
      const y = palm.positions[v + 1]!;
      if (y > palm.top * 0.2 && y < palm.top * 0.55) widestMiddle = Math.max(widestMiddle, Math.hypot(palm.positions[v]!, palm.positions[v + 2]!));
    }
    expect(widestMiddle).toBeLessThan(1);
    expect(palm.reach).toBeGreaterThan(2);
  });

  it('colours trunks brown and leaves green', () => {
    for (const kind of kinds) {
      const shape = treeShape(kind, 'near');
      let green = 0;
      let brown = 0;
      for (let v = 0; v < shape.colors.length; v += 3) {
        const [r, g, b] = [shape.colors[v]!, shape.colors[v + 1]!, shape.colors[v + 2]!];
        if (g > r && g > b) green++;
        else if (r > g && g > b) brown++;
      }
      expect(green).toBeGreaterThan(0);
      expect(brown).toBeGreaterThan(0);
      expect(green + brown).toBe(vertices(shape));
    }
  });

  it('builds the same shape every time', () => {
    expect(treeShape('palm', 'near')).toEqual(treeShape('palm', 'near'));
  });
});

describe('rockShape', () => {
  it('is a sound, lumpy ball about a metre in radius, cheaper far away', () => {
    const near = rockShape('near');
    const far = rockShape('far');
    expectSound(near);
    expectSound(far);
    expect(triangles(near)).toBeLessThanOrEqual(24);
    expect(triangles(far)).toBeLessThan(triangles(near));
    for (const shape of [near, far]) {
      for (let v = 0; v < shape.positions.length; v += 3) {
        const radius = Math.hypot(shape.positions[v]!, shape.positions[v + 1]!, shape.positions[v + 2]!);
        expect(radius).toBeGreaterThan(0.7);
        expect(radius).toBeLessThan(1.3);
      }
    }
  });

  it('is grey', () => {
    const shape = rockShape('near');
    for (let v = 0; v < shape.colors.length; v += 3) {
      expect(Math.abs(shape.colors[v]! - shape.colors[v + 2]!)).toBeLessThan(0.08);
    }
  });
});

describe('puffShape', () => {
  it('is a round ball of radius 1, of 80 triangles, white', () => {
    const shape = puffShape();
    expectSound(shape);
    expect(triangles(shape)).toBe(80);
    for (let v = 0; v < shape.positions.length; v += 3) {
      expect(Math.hypot(shape.positions[v]!, shape.positions[v + 1]!, shape.positions[v + 2]!)).toBeCloseTo(1, 5);
    }
    for (const channel of shape.colors) expect(channel).toBeGreaterThan(0.9);
  });
});
