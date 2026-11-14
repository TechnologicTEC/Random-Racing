import type { Scatter } from '../gen/types';

/**
 * Trees or rocks of one kind in one square of the map, ready to be drawn
 * together: a matrix and a tint for each. Plain numbers, no Three.js.
 */
export interface ScatterGroup {
  /** The kind every thing in the group is. */
  kind: number;
  count: number;
  /** Sixteen numbers per thing: where it stands, its size, its turn and its lean, as Three.js lays a matrix out (column by column). */
  matrices: Float32Array;
  /** Red, green and blue per thing: what its shape's colours are multiplied by. */
  tints: Float32Array;
  /** A ball that holds every thing in the group, so the whole group can be skipped when it is out of view. */
  centre: { x: number; y: number; z: number };
  radius: number;
}

export interface GroupOptions {
  /** Width of a square of the map, in metres. */
  cell: number;
  /** Each thing is sunk this many metres into the ground for each unit of its size, so it never floats on a slope. */
  sink: number;
  /** How dark the darkest shade is and how light the lightest, as multiples of the shape's own colours. */
  shade: readonly [number, number];
  /** For each kind, its shape's highest point and furthest reach from its upright axis, before it is sized. */
  shapes: ReadonlyArray<{ top: number; reach: number }>;
}

/**
 * Sorts a scatter into groups, one for each kind in each square of the map,
 * and works out each thing's matrix and tint.
 *
 * A thing is sized, then leant over, then turned about the upright axis, so
 * it leans towards the way it is turned.
 */
export function groupScatter(scatter: Scatter, options: GroupOptions): ScatterGroup[] {
  const members = new Map<string, number[]>();
  for (let i = 0; i < scatter.count; i++) {
    const key = `${Math.floor(scatter.x[i]! / options.cell)},${Math.floor(scatter.z[i]! / options.cell)},${scatter.kind[i]}`;
    let list = members.get(key);
    if (!list) members.set(key, (list = []));
    list.push(i);
  }

  const groups: ScatterGroup[] = [];
  for (const list of members.values()) {
    const kind = scatter.kind[list[0]!]!;
    const shape = options.shapes[kind] ?? { top: 1, reach: 1 };
    const count = list.length;
    const matrices = new Float32Array(count * 16);
    const tints = new Float32Array(count * 3);
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    /** The foot and the top of each thing, for the ball round the group. */
    const ends = new Float64Array(count * 6);

    list.forEach((i, k) => {
      const size = scatter.size[i]!;
      const tall = size * scatter.tall[i]!;
      const sinTurn = Math.sin(scatter.turn[i]!);
      const cosTurn = Math.cos(scatter.turn[i]!);
      const sinLean = Math.sin(scatter.lean[i]!);
      const cosLean = Math.cos(scatter.lean[i]!);
      const x = scatter.x[i]!;
      const y = scatter.y[i]! - options.sink * size;
      const z = scatter.z[i]!;

      const m = k * 16;
      matrices[m] = cosTurn * size;
      matrices[m + 1] = 0;
      matrices[m + 2] = -sinTurn * size;
      matrices[m + 4] = sinTurn * sinLean * tall;
      matrices[m + 5] = cosLean * tall;
      matrices[m + 6] = cosTurn * sinLean * tall;
      matrices[m + 8] = sinTurn * cosLean * size;
      matrices[m + 9] = -sinLean * size;
      matrices[m + 10] = cosTurn * cosLean * size;
      matrices[m + 12] = x;
      matrices[m + 13] = y;
      matrices[m + 14] = z;
      matrices[m + 15] = 1;

      // A lighter or darker green, a touch warmer or cooler from one to the next.
      const shade = scatter.shade[i]!;
      const light = options.shade[0] + ((options.shade[1] - options.shade[0]) * shade) / 255;
      const warmth = ((shade * 37) % 256) / 255;
      tints[k * 3] = light * (0.96 + 0.08 * warmth);
      tints[k * 3 + 1] = light;
      tints[k * 3 + 2] = light * 0.94;

      const foot = [matrices[m + 12]!, matrices[m + 13]!, matrices[m + 14]!];
      const top = [foot[0]! + matrices[m + 4]! * shape.top, foot[1]! + matrices[m + 5]! * shape.top, foot[2]! + matrices[m + 6]! * shape.top];
      for (let axis = 0; axis < 3; axis++) {
        ends[k * 6 + axis] = foot[axis]!;
        ends[k * 6 + 3 + axis] = top[axis]!;
        low[axis] = Math.min(low[axis]!, foot[axis]!, top[axis]!);
        high[axis] = Math.max(high[axis]!, foot[axis]!, top[axis]!);
      }
    });

    const centre = { x: (low[0]! + high[0]!) / 2, y: (low[1]! + high[1]!) / 2, z: (low[2]! + high[2]!) / 2 };
    let radius = 0;
    list.forEach((i, k) => {
      const spread = shape.reach * scatter.size[i]! * Math.max(1, scatter.tall[i]!);
      for (const end of [0, 3]) {
        const distance = Math.hypot(ends[k * 6 + end]! - centre.x, ends[k * 6 + end + 1]! - centre.y, ends[k * 6 + end + 2]! - centre.z);
        radius = Math.max(radius, distance + spread);
      }
    });
    groups.push({ kind, count, matrices, tints, centre, radius });
  }
  return groups;
}
