import type { TreeKind } from '../gen/types';
import { CLOUDS, ROCKS, toLinear, TREES, type Rgb } from './palette';

/**
 * The shapes that are drawn many times over: trees, rocks and cloud puffs, as
 * plain triangle data ready to be wrapped in a Three.js geometry. No Three.js
 * here, so they can be tested on their own.
 *
 * Trees are measured in metres before they are sized, with the ground at y = 0
 * and the trunk running a little below it, so a tree on a slope never floats.
 * They are drawn from both sides, so cones and tubes are left open underneath.
 */
export interface Shape {
  /** x, y, z for each vertex. */
  positions: Float32Array;
  /** Red, green, blue for each vertex, in linear light. */
  colors: Float32Array;
  /** Three vertex numbers per triangle. */
  indices: Uint32Array;
  /** Its highest point, and the furthest any of it is from its upright axis. */
  top: number;
  reach: number;
}

/** Near shapes are seen from close by; far ones stand in for them at a distance, with a fraction of the triangles. */
export type Detail = 'near' | 'far';

const TAU = Math.PI * 2;

/** Collects the parts of a shape. Each part has vertices of its own, so its colour never smears into the next. */
function createBuilder() {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const vertex = (x: number, y: number, z: number, colour: Rgb): number => {
    positions.push(x, y, z);
    colors.push(toLinear(colour[0]), toLinear(colour[1]), toLinear(colour[2]));
    return positions.length / 3 - 1;
  };

  return {
    vertex,
    triangle(a: number, b: number, c: number): void {
      indices.push(a, b, c);
    },

    /** An open tube through rings of `sides` points: a trunk. Each ring has a middle (x, y, z) and a radius. */
    tube(rings: ReadonlyArray<readonly [x: number, y: number, z: number, radius: number]>, sides: number, colour: Rgb): void {
      const first = positions.length / 3;
      for (const [x, y, z, radius] of rings) {
        for (let s = 0; s < sides; s++) {
          const angle = (s / sides) * TAU;
          vertex(x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius, colour);
        }
      }
      for (let ring = 0; ring + 1 < rings.length; ring++) {
        for (let s = 0; s < sides; s++) {
          const a = first + ring * sides + s;
          const b = first + ring * sides + ((s + 1) % sides);
          indices.push(a, a + sides, b, b, a + sides, b + sides);
        }
      }
    },

    /** A cone standing on a ring of `sides` points at height `base`, open underneath. */
    cone(base: number, apex: number, radius: number, sides: number, colour: Rgb): void {
      const first = positions.length / 3;
      for (let s = 0; s < sides; s++) {
        const angle = (s / sides) * TAU;
        vertex(Math.cos(angle) * radius, base, Math.sin(angle) * radius, colour);
      }
      const tip = vertex(0, apex, 0, colour);
      for (let s = 0; s < sides; s++) indices.push(first + s, tip, first + ((s + 1) % sides));
    },

    /** A ball of 20 triangles (or 80 with `split`), `scale` giving each vertex its own distance from the middle. */
    ball(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, colour: Rgb, options: { split?: boolean; scale?: readonly number[] } = {}): void {
      const points = ICOSAHEDRON.points.map((p) => [...p]);
      let faces = ICOSAHEDRON.faces;
      if (options.split) {
        // Each triangle becomes four, the new points pushed out onto the ball.
        const middles = new Map<number, number>();
        const middle = (a: number, b: number): number => {
          const key = Math.min(a, b) * 1000 + Math.max(a, b);
          let index = middles.get(key);
          if (index === undefined) {
            const m = [0, 1, 2].map((k) => points[a]![k]! + points[b]![k]!);
            const length = Math.hypot(m[0]!, m[1]!, m[2]!);
            index = points.push(m.map((value) => value / length)) - 1;
            middles.set(key, index);
          }
          return index;
        };
        faces = faces.flatMap(([a, b, c]) => {
          const ab = middle(a, b);
          const bc = middle(b, c);
          const ca = middle(c, a);
          return [
            [a, ab, ca],
            [b, bc, ab],
            [c, ca, bc],
            [ab, bc, ca],
          ] as Array<[number, number, number]>;
        });
      }
      const first = positions.length / 3;
      points.forEach(([x, y, z], i) => {
        const scale = options.scale?.[i % options.scale.length] ?? 1;
        vertex(cx + x! * rx * scale, cy + y! * ry * scale, cz + z! * rz * scale, colour);
      });
      for (const [a, b, c] of faces) indices.push(first + a, first + b, first + c);
    },

    /** A ball of 8 triangles: the far stand-in for a ball of 20. */
    diamond(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, colour: Rgb, scale: readonly number[] = [1]): void {
      const first = positions.length / 3;
      OCTAHEDRON.points.forEach(([x, y, z], i) => {
        const s = scale[i % scale.length]!;
        vertex(cx + x * rx * s, cy + y * ry * s, cz + z * rz * s, colour);
      });
      for (const [a, b, c] of OCTAHEDRON.faces) indices.push(first + a, first + b, first + c);
    },

    finish(): Shape {
      let top = -Infinity;
      let reach = 0;
      for (let v = 0; v < positions.length; v += 3) {
        top = Math.max(top, positions[v + 1]!);
        reach = Math.max(reach, Math.hypot(positions[v]!, positions[v + 2]!));
      }
      const shape = { positions: new Float32Array(positions), colors: new Float32Array(colors), indices: new Uint32Array(indices), top: 0, reach: 0 };
      // Measured on the numbers as stored, so the measurements are exactly the shape's own.
      shape.top = Math.fround(top);
      shape.reach = Math.fround(reach);
      return shape;
    },
  };
}

const GOLDEN = (1 + Math.sqrt(5)) / 2;
const ICO_LENGTH = Math.sqrt(1 + GOLDEN * GOLDEN);
/** The twelve points and twenty faces of a ball of radius 1, faces wound to face outwards. */
const ICOSAHEDRON = {
  points: (
    [
      [-1, GOLDEN, 0],
      [1, GOLDEN, 0],
      [-1, -GOLDEN, 0],
      [1, -GOLDEN, 0],
      [0, -1, GOLDEN],
      [0, 1, GOLDEN],
      [0, -1, -GOLDEN],
      [0, 1, -GOLDEN],
      [GOLDEN, 0, -1],
      [GOLDEN, 0, 1],
      [-GOLDEN, 0, -1],
      [-GOLDEN, 0, 1],
    ] as Array<[number, number, number]>
  ).map(([x, y, z]) => [x / ICO_LENGTH, y / ICO_LENGTH, z / ICO_LENGTH]),
  faces: [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ] as Array<[number, number, number]>,
};

/** The six points and eight faces of the simplest ball, faces wound to face outwards. */
const OCTAHEDRON = {
  points: [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ] as Array<[number, number, number]>,
  faces: [
    [2, 4, 0],
    [2, 0, 5],
    [2, 5, 1],
    [2, 1, 4],
    [3, 0, 4],
    [3, 5, 0],
    [3, 1, 5],
    [3, 4, 1],
  ] as Array<[number, number, number]>,
};

/** How far a trunk runs below the ground, in metres. */
const ROOT = 0.4;

function pine(detail: Detail): Shape {
  const b = createBuilder();
  if (detail === 'near') {
    b.tube([[0, -ROOT, 0, 0.32], [0, 1.9, 0, 0.22]], 5, TREES.bark);
    b.cone(1.2, 4.4, 2.0, 6, TREES.pine[0]!);
    b.cone(2.7, 5.5, 1.6, 6, TREES.pine[1]!);
    b.cone(4.1, 6.5, 1.1, 6, TREES.pine[2]!);
  } else {
    b.tube([[0, -ROOT, 0, 0.3], [0, 1.4, 0, 0.24]], 3, TREES.bark);
    b.cone(1.1, 6.5, 1.9, 5, TREES.pine[1]!);
  }
  return b.finish();
}

function broadleaf(detail: Detail): Shape {
  const b = createBuilder();
  if (detail === 'near') {
    b.tube([[0, -ROOT, 0, 0.38], [0, 2.7, 0, 0.24]], 5, TREES.bark);
    b.ball(0, 3.8, 0, 2.2, 2.2, 2.2, TREES.broadleaf[0]!);
    b.diamond(1.1, 3.2, 0.6, 1.6, 1.6, 1.6, TREES.broadleaf[1]!);
    b.diamond(-1.0, 3.3, -0.5, 1.5, 1.5, 1.5, TREES.broadleaf[2]!);
  } else {
    b.tube([[0, -ROOT, 0, 0.36], [0, 2.4, 0, 0.26]], 3, TREES.bark);
    b.diamond(0, 3.7, 0, 2.6, 2.3, 2.5, TREES.broadleaf[0]!);
  }
  return b.finish();
}

/** Where a palm's fronds spring from: the top of its trunk, which bows over to one side. */
const CROWN: readonly [number, number, number] = [1.3, 6.4, 0];

function palm(detail: Detail): Shape {
  const b = createBuilder();
  const [cx, cy, cz] = CROWN;
  if (detail === 'near') {
    b.tube(
      [
        [0, -ROOT, 0, 0.28],
        [0.25, 2.2, 0, 0.22],
        [0.7, 4.4, 0, 0.18],
        [cx, cy, cz, 0.14],
      ],
      4,
      TREES.palmTrunk,
    );
    // Six fronds: each rises a little from the crown, then droops to a point.
    const fronds = 6;
    for (let f = 0; f < fronds; f++) {
      const angle = (f / fronds) * TAU + 0.3;
      const [dx, dz] = [Math.cos(angle), Math.sin(angle)];
      // Across the frond, at right angles to the way it points.
      const [sx, sz] = [-dz, dx];
      const colour = TREES.palm[f % TREES.palm.length]!;
      const rootL = b.vertex(cx + dx * 0.2 + sx * 0.3, cy, cz + dz * 0.2 + sz * 0.3, colour);
      const rootR = b.vertex(cx + dx * 0.2 - sx * 0.3, cy, cz + dz * 0.2 - sz * 0.3, colour);
      const midL = b.vertex(cx + dx * 1.5 + sx * 0.4, cy + 0.6, cz + dz * 1.5 + sz * 0.4, colour);
      const midR = b.vertex(cx + dx * 1.5 - sx * 0.4, cy + 0.6, cz + dz * 1.5 - sz * 0.4, colour);
      const tip = b.vertex(cx + dx * 2.9, cy - 0.9, cz + dz * 2.9, colour);
      b.triangle(rootL, midL, rootR);
      b.triangle(rootR, midL, midR);
      b.triangle(midL, tip, midR);
    }
  } else {
    b.tube([[0, -ROOT, 0, 0.26], [cx, cy, cz, 0.16]], 3, TREES.palmTrunk);
    const fronds = 5;
    for (let f = 0; f < fronds; f++) {
      const angle = (f / fronds) * TAU + 0.3;
      const [dx, dz] = [Math.cos(angle), Math.sin(angle)];
      const [sx, sz] = [-dz, dx];
      const colour = TREES.palm[f % TREES.palm.length]!;
      const rootL = b.vertex(cx + dx * 0.3 + sx * 0.5, cy + 0.6, cz + dz * 0.3 + sz * 0.5, colour);
      const rootR = b.vertex(cx + dx * 0.3 - sx * 0.5, cy + 0.6, cz + dz * 0.3 - sz * 0.5, colour);
      const tip = b.vertex(cx + dx * 2.9, cy - 0.7, cz + dz * 2.9, colour);
      b.triangle(rootL, tip, rootR);
    }
  }
  return b.finish();
}

/** A tree of the kind given, standing at the origin. */
export function treeShape(kind: TreeKind, detail: Detail): Shape {
  if (kind === 'pine') return pine(detail);
  if (kind === 'palm') return palm(detail);
  return broadleaf(detail);
}

/** How far each point of a boulder is from its middle, as a share of its radius: what makes it lumpy. */
const LUMPS = [1.08, 0.86, 0.95, 1.14, 0.9, 1.02, 0.84, 1.1, 0.97, 0.88, 1.12, 0.93];

/** A boulder about a metre in radius, centred on the origin. */
export function rockShape(detail: Detail): Shape {
  const b = createBuilder();
  if (detail === 'near') b.ball(0, 0, 0, 1, 1, 1, ROCKS.boulder, { scale: LUMPS });
  else b.diamond(0, 0, 0, 1, 1, 1, ROCKS.boulder, LUMPS);
  return b.finish();
}

/** One puff of a cloud: a ball of radius 1, centred on the origin. */
export function puffShape(): Shape {
  const b = createBuilder();
  b.ball(0, 0, 0, 1, 1, 1, CLOUDS.puff, { split: true });
  return b.finish();
}
