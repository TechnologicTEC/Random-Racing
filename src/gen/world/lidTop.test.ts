import { describe, expect, it } from 'vitest';
import { config, type GenConfig } from '../../config';
import { stadiumLine } from '../../testing/trackFixtures';
import { buildTunnels, type TunnelGround } from '../road/tunnels';
import type { CenterLine, Cover, CoveredMesh, HeightField, Scatter, TunnelSpan } from '../types';
import { sampleField } from './heightfield';
import { clearOfRough, lidTop, surfaceOf } from './tunnelWorld';

// Fixed rules, so these tests do not move when the config is tuned.
const cfg: Pick<GenConfig, 'road'> = {
  road: {
    ...config.road,
    barrierOffset: 1.8,
    barrierWidth: 0.3,
    verge: 4,
    blendMax: 25,
    tunnels: { ...config.road.tunnels, clearance: 6.5, cover: 1.5, wall: 0.6, lidStep: 3, lidSlope: 1, portalHeight: 3 },
  },
};
const RULES = { float: 0.1, sink: 0.4, clear: 5 };
const ROAD = 10;

// Two 600 m straights 200 m apart: the first runs along z = -100 towards +x. The tunnel runs from x = -90 to x = 90.
const line: CenterLine = stadiumLine(600, 100);
const n = line.count;
const height = new Float64Array(n).fill(ROAD);
const width = new Float64Array(n).fill(20);
const SPAN: TunnelSpan = { startIndex: 105, sampleCount: 91 };

function nearest(x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const d = (line.x[i]! - x) ** 2 + (line.z[i]! - z) ** 2;
    if (d < bestD) [best, bestD] = [i, d];
  }
  return best;
}

/** A ridge across the first straight, 24 m over the road at x = 0, falling 0.2 m a metre each way; level beyond. */
const ridge = (x: number): number => ROAD + Math.max(0, 24 - 0.2 * Math.abs(x));
/** The road cut through the ridge: the ground at the road under 14 m either side of its middle, then a bank of 100%. */
const cut = (x: number, z: number): number => Math.min(ridge(x), ROAD - 0.25 + Math.max(0, Math.abs(z + 100) - 14));

// The ground's grid: 3 m cells over x and z from -150 to 150.
const SIZE = 101;
const CELL = 3;
const ORIGIN = -150;
const ground: HeightField = {
  size: SIZE,
  cell: CELL,
  origin: ORIGIN,
  height: Float32Array.from({ length: SIZE * SIZE }, (_, c) => cut(ORIGIN + (c % SIZE) * CELL, ORIGIN + Math.floor(c / SIZE) * CELL)),
};
const tunnelGround: TunnelGround = { natural: (x) => ridge(x), ground: (x, z) => sampleField(ground, x, z, 0), nearest };
const shape = buildTunnels(line, height, null, width, [SPAN], tunnelGround, cfg);

/** The lid's grass at a point: 100 at x = 0, half a unit more a metre east. */
const grassAtX = (x: number): number => Math.round(100 + x / 2);
const corners = shape.lid.positions.length / 3;
const lidCover: Cover = {
  grass: Uint8Array.from({ length: corners }, (_, v) => grassAtX(shape.lid.positions[v * 3]!)),
  sand: new Uint8Array(corners),
  rock: new Uint8Array(corners).fill(10),
  snow: new Uint8Array(corners),
  variation: new Uint8Array(corners).fill(60),
};
const lid: CoveredMesh = { ...shape.lid, cover: lidCover };
const top = lidTop(ground, lid, RULES);
const { rough } = top;

// The lid's upward-facing triangles, bucketed by grid cell, to find the drawn lid's height under any point.
const lidTriangles: [number, number, number][][] = [];
const buckets = new Map<number, number[]>();
for (let t = 0; t < lid.indices.length; t += 3) {
  const tri = [0, 1, 2].map((k) => {
    const v = lid.indices[t + k]!;
    return [lid.positions[v * 3]!, lid.positions[v * 3 + 1]!, lid.positions[v * 3 + 2]!] as [number, number, number];
  });
  const area = (tri[1]![0] - tri[0]![0]) * (tri[2]![2] - tri[0]![2]) - (tri[2]![0] - tri[0]![0]) * (tri[1]![2] - tri[0]![2]);
  if (Math.abs(area) < 1e-6) continue;
  const id = lidTriangles.push(tri) - 1;
  const xs = tri.map((p) => Math.floor((p[0] - ORIGIN) / CELL));
  const zs = tri.map((p) => Math.floor((p[2] - ORIGIN) / CELL));
  for (let bz = Math.min(...zs); bz <= Math.max(...zs); bz++) {
    for (let bx = Math.min(...xs); bx <= Math.max(...xs); bx++) {
      const key = bz * 1000 + bx;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(id);
    }
  }
}

/** The drawn lid's height at a point, or -Infinity where there is none. */
function lidAt(x: number, z: number): number {
  let best = -Infinity;
  for (const id of buckets.get(Math.floor((z - ORIGIN) / CELL) * 1000 + Math.floor((x - ORIGIN) / CELL)) ?? []) {
    const [a, b, c] = lidTriangles[id]!;
    const det = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
    const u = ((x - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (z - a[2])) / det;
    const v = ((b[0] - a[0]) * (z - a[2]) - (x - a[0]) * (b[2] - a[2])) / det;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
    best = Math.max(best, a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v);
  }
  return best;
}

/** A grid's values at a point as the ground is drawn and the grass reads it: two triangles a cell, split from (x+1, z) to (x, z+1). */
function drawn(values: ArrayLike<number>, x: number, z: number): number {
  const gx = (x - ORIGIN) / CELL;
  const gz = (z - ORIGIN) / CELL;
  const ix = Math.min(SIZE - 2, Math.floor(gx));
  const iz = Math.min(SIZE - 2, Math.floor(gz));
  const [fx, fz] = [gx - ix, gz - iz];
  const at = (dx: number, dz: number): number => values[(iz + dz) * SIZE + ix + dx]!;
  return fx + fz <= 1 ? at(0, 0) + (at(1, 0) - at(0, 0)) * fx + (at(0, 1) - at(0, 0)) * fz : at(1, 1) + (at(0, 1) - at(1, 1)) * (1 - fx) + (at(1, 0) - at(1, 1)) * (1 - fz);
}

/** What is drawn on top at a point: the lid where it stands over the ground, the ground elsewhere. */
const drawnTop = (x: number, z: number): number => Math.max(drawn(ground.height, x, z), lidAt(x, z));

/** The grid's points in the lid's bounds, and one cell round them. */
const near: number[] = [];
for (let iz = 0; iz < SIZE; iz++) {
  for (let ix = 0; ix < SIZE; ix++) {
    const [x, z] = [ORIGIN + ix * CELL, ORIGIN + iz * CELL];
    if (x >= -96 && x <= 96 && z >= -147 && z <= -53) near.push(iz * SIZE + ix);
  }
}
const xOf = (c: number): number => ORIGIN + (c % SIZE) * CELL;
const zOf = (c: number): number => ORIGIN + Math.floor(c / SIZE) * CELL;
const slot = new Map(Array.from(top.cells, (c, i) => [c, i]));
const roughSet = new Set(rough);

describe('lidTop: where a tunnel’s lid is the top of the land (M6.2b-3)', () => {
  it('lists every point of the grid the lid stands over, in order, at the drawn lid’s height or lowered at most `sink` under it', () => {
    expect(top.cells.length).toBeGreaterThan(500);
    for (let k = 1; k < top.cells.length; k++) expect(top.cells[k]!).toBeGreaterThan(top.cells[k - 1]!);
    let lowered = 0;
    for (const c of near) {
      const [x, z] = [xOf(c), zOf(c)];
      const over = lidAt(x, z) > ground.height[c]! + 0.05;
      expect(slot.has(c), `x ${x} z ${z}`).toBe(over);
      if (!over) continue;
      const y = top.height[slot.get(c)!]!;
      expect(y, `x ${x} z ${z}`).toBeLessThanOrEqual(lidAt(x, z) + 1e-3);
      expect(y, `x ${x} z ${z}`).toBeGreaterThanOrEqual(lidAt(x, z) - RULES.sink - 1e-3);
      if (y < lidAt(x, z) - 1e-3) lowered++;
    }
    // Only where the lid bends, at the foot of its mounds and by its edges.
    expect(lowered).toBeLessThan(top.cells.length / 4);
  });

  it('lowers the grid’s heights so that blades do not float where the lid bends, rather than leave the ground bare there', () => {
    // The ridge's lid has no face above the ground but at its portals: away from them, no point is rough.
    for (const c of rough) expect(Math.abs(Math.abs(xOf(c)) - 90), `x ${xOf(c)} z ${zOf(c)}`).toBeLessThan(10);
  });

  it('takes the lid’s cover there, blended from its corners', () => {
    let grassy = 0;
    for (const [c, i] of slot) {
      expect(top.rock[i], `cell ${c}`).toBe(10);
      expect(top.variation[i], `cell ${c}`).toBe(60);
      if (top.grass[i] === 0) continue;
      grassy++;
      expect(Math.abs(top.grass[i]! - grassAtX(xOf(c))), `cell ${c}`).toBeLessThanOrEqual(1);
    }
    // The lid over a smooth ridge is mostly grassed.
    expect(grassy / top.cells.length).toBeGreaterThan(0.6);
  });

  it('grows grass only where blades blended between the grid’s points stand on the drawn top', () => {
    const blended = surfaceOf(ground, top).height;
    let checked = 0;
    for (const c of near) {
      const grassy = slot.has(c) ? top.grass[slot.get(c)!]! > 0 : !roughSet.has(c);
      expect(slot.has(c) && roughSet.has(c) && top.grass[slot.get(c)!]! > 0, `cell ${c} rough but grassed`).toBe(false);
      if (!grassy) continue;
      checked++;
      // Every cell this point is a corner of, at 5 by 5 points across it.
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
        for (let a = 0; a <= 4; a++) {
          for (let b = 0; b <= 4; b++) {
            const x = xOf(c) + (dx + a / 4) * CELL;
            const z = zOf(c) + (dz + b / 4) * CELL;
            const strays = drawn(blended, x, z) - drawnTop(x, z);
            expect(strays, `cell ${c} at ${x}, ${z}`).toBeLessThanOrEqual(RULES.float + 1e-4);
            expect(strays, `cell ${c} at ${x}, ${z}`).toBeGreaterThanOrEqual(-RULES.sink - 1e-4);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('gives new arrays for every world with no lid, since the worker hands each world’s arrays over to the page', () => {
    const empty: CoveredMesh = { positions: new Float32Array(0), indices: new Uint32Array(0), cover: lidCover };
    const [first, second] = [lidTop(ground, empty, RULES), lidTop(ground, empty, RULES)];
    expect(first.cells).toHaveLength(0);
    for (const key of ['cells', 'height', 'grass', 'rock', 'variation', 'rough'] as const) expect(first[key].buffer, key).not.toBe(second[key].buffer);
  });

  it('marks the points by each portal rough, where the lid stands over the open cutting, and grows no grass there', () => {
    let found = 0;
    for (const c of near) {
      const [x, z] = [xOf(c), zOf(c)];
      if (Math.abs(Math.abs(x) - 90) > 1.5 || Math.abs(z + 100) > 9) continue;
      found++;
      expect(roughSet.has(c), `x ${x} z ${z}`).toBe(true);
      if (slot.has(c)) expect(top.grass[slot.get(c)!]).toBe(0);
    }
    expect(found).toBeGreaterThan(4);
    for (let k = 1; k < rough.length; k++) expect(rough[k]!).toBeGreaterThan(rough[k - 1]!);
  });

  it('gives the land’s surface the lid’s heights where it is the top, and leaves the ground as it was', () => {
    const before = Float32Array.from(ground.height);
    const land = surfaceOf(ground, top);
    expect(land).not.toBe(ground);
    expect(ground.height).toEqual(before);
    for (let c = 0; c < SIZE * SIZE; c++) expect(land.height[c]).toBe(slot.has(c) ? top.height[slot.get(c)!] : ground.height[c]);
    const none = new Uint8Array(0);
    expect(surfaceOf(ground, { cells: new Uint32Array(0), height: new Float32Array(0), grass: none, rock: none, variation: none, rough: new Uint32Array(0) })).toBe(ground);
  });
});

describe('clearOfRough: no tree or rock by a rough point (M6.2b-3)', () => {
  const scatterOf = (points: [number, number][]): Scatter => {
    const k = points.length;
    const values = (f: (i: number) => number): Float32Array => Float32Array.from({ length: k }, (_, i) => f(i));
    return {
      count: k,
      x: values((i) => points[i]![0]),
      y: values((i) => i),
      z: values((i) => points[i]![1]),
      size: values((i) => 1 + i),
      tall: values(() => 1),
      turn: values(() => 0),
      lean: values(() => 0),
      kind: Uint8Array.from({ length: k }, (_, i) => i % 3),
      shade: Uint8Array.from({ length: k }, (_, i) => i),
    };
  };

  it('drops what stands within the clearance of a rough point and keeps the rest, in order', () => {
    // The grid point at x = 0, z = 0.
    const point = 50 * SIZE + 50;
    const scatter = scatterOf([
      [0, 0],
      [4, 0],
      [0, -4.9],
      [6, 0],
      [-3.5, 3.5],
      [40, 40],
    ]);
    const kept = clearOfRough(scatter, ground, Uint32Array.of(point), 5);
    expect(kept.count).toBe(2);
    expect(Array.from(kept.x)).toEqual([6, 40]);
    expect(Array.from(kept.y)).toEqual([3, 5]);
    expect(Array.from(kept.kind)).toEqual([0, 2]);
    expect(Array.from(kept.shade)).toEqual([3, 5]);
  });

  it('keeps every one with no rough point', () => {
    const scatter = scatterOf([[0, 0]]);
    expect(clearOfRough(scatter, ground, new Uint32Array(0), 5)).toBe(scatter);
  });
});
