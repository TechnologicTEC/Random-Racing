import { describe, expect, it } from 'vitest';
import type { Cover, HeightField } from '../gen/types';
import { createField, worldX, worldZ } from '../gen/world/heightfield';
import { terrainColour, toLinear } from './palette';
import { config } from '../config';
import { generateWorld } from '../gen/generate';
import { buildTerrainChunks, chunkStrides, coveredColours, detailOptions } from './terrainChunks';

/** A small world from formulas: heights, and one cover value for every cell. */
function world(extent: number, cell: number, heightAt: (x: number, z: number) => number, cover: Partial<Record<keyof Cover, number>> = {}) {
  const ground: HeightField = createField(extent, cell);
  for (let iz = 0; iz < ground.size; iz++) {
    for (let ix = 0; ix < ground.size; ix++) ground.height[iz * ground.size + ix] = heightAt(worldX(ground, ix), worldZ(ground, iz));
  }
  const cells = ground.size * ground.size;
  const map = (value = 0): Uint8Array => new Uint8Array(cells).fill(value);
  const full: Cover = { grass: map(cover.grass), sand: map(cover.sand), rock: map(cover.rock), snow: map(cover.snow), variation: map(cover.variation ?? 128) };
  return { ground, cover: full };
}

describe('buildTerrainChunks', () => {
  it('cuts the grid into square chunks that cover it once', () => {
    // 9 samples a side is 8 cells: four chunks of 4 by 4 cells.
    const { ground, cover } = world(16, 2, () => 5);
    const chunks = buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100 });
    expect(chunks).toHaveLength(4);
    for (const chunk of chunks) {
      expect(chunk.positions).toHaveLength(5 * 5 * 3);
      expect(chunk.colors).toHaveLength(5 * 5 * 3);
      expect(chunk.indices).toHaveLength(4 * 4 * 2 * 3);
    }
  });

  it('gives a smaller last chunk when the grid does not divide evenly', () => {
    // 11 samples a side is 10 cells: chunks of 4, 4 and 2 cells each way.
    const { ground, cover } = world(20, 2, () => 5);
    const chunks = buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100 });
    expect(chunks).toHaveLength(9);
    const triangles = chunks.reduce((sum, chunk) => sum + chunk.indices.length / 3, 0);
    expect(triangles).toBe(10 * 10 * 2);
  });

  it('puts every vertex at its sample: world position and height', () => {
    const { ground, cover } = world(16, 2, (x, z) => 10 + x * 0.5 - z * 0.25);
    const chunks = buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100 });
    for (const chunk of chunks) {
      for (let v = 0; v < chunk.positions.length; v += 3) {
        const x = chunk.positions[v]!;
        const z = chunk.positions[v + 2]!;
        expect(chunk.positions[v + 1]).toBeCloseTo(10 + x * 0.5 - z * 0.25, 5);
        expect(Math.abs(x)).toBeLessThanOrEqual(8);
        expect(Math.abs(z)).toBeLessThanOrEqual(8);
      }
    }
  });

  it('leaves no gaps: neighbouring chunks share the vertices along their common edge', () => {
    const { ground, cover } = world(16, 2, (x, z) => x * z * 0.1);
    const chunks = buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100 });
    const seen = new Map<string, number>();
    for (const chunk of chunks) {
      for (let v = 0; v < chunk.positions.length; v += 3) {
        const key = `${chunk.positions[v]},${chunk.positions[v + 2]}`;
        const height = chunk.positions[v + 1]!;
        if (seen.has(key)) expect(seen.get(key)).toBe(height);
        seen.set(key, height);
      }
    }
    // 81 samples in all; the shared edges mean some were written by more than one chunk.
    expect(seen.size).toBe(81);
  });

  it('winds every triangle so it faces upwards', () => {
    const { ground, cover } = world(16, 2, (x) => x * 0.3);
    for (const chunk of buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100 })) {
      const p = chunk.positions;
      for (let t = 0; t < chunk.indices.length; t += 3) {
        const a = chunk.indices[t]! * 3, b = chunk.indices[t + 1]! * 3, c = chunk.indices[t + 2]! * 3;
        // The Y part of the cross product of two edges: positive when the triangle faces up.
        const normalY = (p[b + 2]! - p[a + 2]!) * (p[c]! - p[a]!) - (p[b]! - p[a]!) * (p[c + 2]! - p[a + 2]!);
        expect(normalY).toBeGreaterThan(0);
      }
    }
  });

  it('splits a steep square along the diagonal that follows its slope s edge, so a fold is drawn as a line (M6.3d)', () => {
    // A fold running corner to corner: flat to one side, rising at 300% to the other.
    const fold = (x: number, z: number): number => 3 * Math.max(0, x - z);
    const { ground, cover } = world(16, 2, fold);
    /** How far the middle of each triangle is from the fold, most. */
    const worst = (steep?: number): number => {
      let most = 0;
      for (const chunk of buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100, steep })) {
        const p = chunk.positions;
        for (let t = 0; t < chunk.indices.length; t += 3) {
          const [a, b, c] = [chunk.indices[t]! * 3, chunk.indices[t + 1]! * 3, chunk.indices[t + 2]! * 3];
          const x = (p[a]! + p[b]! + p[c]!) / 3;
          const z = (p[a + 2]! + p[b + 2]! + p[c + 2]!) / 3;
          most = Math.max(most, Math.abs((p[a + 1]! + p[b + 1]! + p[c + 1]!) / 3 - fold(x, z)));
        }
      }
      return most;
    };
    expect(worst(config.render.groundSplitSteep)).toBeLessThan(1e-9);
    // Split the usual way, triangles straddle the fold.
    expect(worst()).toBeGreaterThan(1);
  });

  it('keeps the usual split on squares no steeper than the threshold', () => {
    const { ground, cover } = world(16, 2, (x, z) => 0.5 * Math.max(0, x - z));
    const usual = buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100 });
    const steep = buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100, steep: config.render.groundSplitSteep });
    expect(steep.map((chunk) => Array.from(chunk.indices))).toEqual(usual.map((chunk) => Array.from(chunk.indices)));
  });

  it('draws the 3D view s ground with the configured threshold', () => {
    const line = { x: [0], z: [0] };
    expect(detailOptions(config.render, line).steep).toBe(config.render.groundSplitSteep);
  });

  it('leaves out chunks that are entirely deep under the sea', () => {
    // Land on the left half, deep sea on the right.
    const { ground, cover } = world(32, 2, (x) => (x < 0 ? 5 : -20));
    const chunks = buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -8 });
    expect(chunks.length).toBeLessThan(16);
    expect(chunks.length).toBeGreaterThanOrEqual(8);
    for (const chunk of chunks) expect(chunk.maxY).toBeGreaterThan(-8);
  });

  it('records the height range of each chunk', () => {
    const { ground, cover } = world(16, 2, (x) => x);
    for (const chunk of buildTerrainChunks(ground, cover, { chunkCells: 4, skipBelow: -100 })) {
      let low = Infinity, high = -Infinity;
      for (let v = 1; v < chunk.positions.length; v += 3) {
        low = Math.min(low, chunk.positions[v]!);
        high = Math.max(high, chunk.positions[v]!);
      }
      expect(chunk.minY).toBe(low);
      expect(chunk.maxY).toBe(high);
    }
  });

  it('colours vertices from the cover maps', () => {
    const grassy = world(16, 2, () => 8, { grass: 255 });
    const sandy = world(16, 2, () => 0.5, { sand: 255 });
    const first = (w: ReturnType<typeof world>): number[] => [...buildTerrainChunks(w.ground, w.cover, { chunkCells: 4, skipBelow: -100 })[0]!.colors.slice(0, 3)];
    const [gr, gg, gb] = first(grassy) as [number, number, number];
    expect(gg).toBeGreaterThan(gr);
    expect(gg).toBeGreaterThan(gb);
    const [sr, , sb] = first(sandy) as [number, number, number];
    expect(sr).toBeGreaterThan(sb);
    expect(sr).toBeGreaterThan(gr);
  });
});

describe('buildTerrainChunks with far ground at lower detail', () => {
  // 129 samples a side: 128 cells of 2 m, cut into 16 chunks of 32 by 32 cells. A road runs down the left edge.
  const { ground, cover } = world(256, 2, (x, z) => 10 + 6 * Math.sin(x / 9) * Math.cos(z / 7) + x * 0.05);
  const road = { x: Array.from({ length: 65 }, () => -120), z: Array.from({ length: 65 }, (_, i) => -128 + i * 4) };
  const options = { chunkCells: 32, skipBelow: -100, far: { x: road.x, z: road.z, levels: [{ distance: 70, stride: 2 }] } };
  const distance = options.far.levels[0]!.distance;
  const chunks = buildTerrainChunks(ground, cover, options);
  const full = buildTerrainChunks(ground, cover, { chunkCells: 32, skipBelow: -100 });
  /** The x of a chunk's left edge. */
  const left = (chunk: { positions: Float32Array }): number => {
    let low = Infinity;
    for (let v = 0; v < chunk.positions.length; v += 3) low = Math.min(low, chunk.positions[v]!);
    return low;
  };

  it('draws ground near the road in full and ground far from it with a quarter of the triangles', () => {
    expect(chunks).toHaveLength(16);
    let near = 0;
    let far = 0;
    chunks.forEach((chunk, k) => {
      const triangles = chunk.indices.length / 3;
      // A chunk's left edge is 16 m or more from the road at x = -120 once it is past the first two columns.
      if (left(chunk) - -120 > distance) {
        expect(triangles).toBe(full[k]!.indices.length / 3 / 4);
        far++;
      } else {
        expect(triangles).toBe(full[k]!.indices.length / 3);
        near++;
      }
    });
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
  });

  it('puts every coarse vertex exactly at its sample', () => {
    for (const chunk of chunks) {
      for (let v = 0; v < chunk.positions.length; v += 3) {
        const x = chunk.positions[v]!;
        const z = chunk.positions[v + 2]!;
        const c = Math.round((z + 128) / 2) * ground.size + Math.round((x + 128) / 2);
        const sample = ground.height[c]!;
        // Full-detail vertices may be pulled onto a coarse neighbour's edge (tested below); all others are exact.
        if (left(chunk) - -120 > distance) expect(chunk.positions[v + 1]).toBeCloseTo(sample, 5);
      }
    }
  });

  it('leaves no cracks where a full chunk meets a coarse one: shared edges match all the way along', () => {
    // Every position on an edge shared by two chunks must have the same height in both, including between the coarse vertices.
    const heightAlong = new Map<string, number>();
    const coarseEdge = new Map<number, Array<[number, number]>>();
    for (const chunk of chunks) {
      const p = chunk.positions;
      for (let v = 0; v < p.length; v += 3) heightAlong.set(`${p[v]},${p[v + 2]}`, p[v + 1]!);
      if (left(chunk) - -120 > distance) {
        // Remember the coarse chunk's left edge: its z and height at each vertex.
        const x = left(chunk);
        const edge: Array<[number, number]> = [];
        for (let v = 0; v < p.length; v += 3) if (p[v] === x) edge.push([p[v + 2]!, p[v + 1]!]);
        coarseEdge.set(x, edge.sort((a, b) => a[0] - b[0]));
      }
    }
    let checked = 0;
    for (const chunk of chunks) {
      const p = chunk.positions;
      if (left(chunk) - -120 > distance) continue;
      for (let v = 0; v < p.length; v += 3) {
        const edge = coarseEdge.get(p[v]!);
        if (!edge) continue;
        // On a coarse neighbour's edge: the height must lie on the straight line between its two coarse vertices.
        const z = p[v + 2]!;
        const k = edge.findIndex(([ez]) => ez >= z);
        const [z1, h1] = edge[k]!;
        const [z0, h0] = edge[Math.max(0, k - 1)]!;
        const expected = z1 === z0 ? h1 : h0 + ((h1 - h0) * (z - z0)) / (z1 - z0);
        expect(p[v + 1]).toBeCloseTo(expected, 4);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('keeps everything in full when no road is given', () => {
    const triangles = (list: typeof chunks): number => list.reduce((sum, chunk) => sum + chunk.indices.length, 0);
    expect(triangles(full)).toBe(128 * 128 * 2 * 3);
    // Half the chunks (the two columns furthest from the road) are coarse: 8 in full and 8 at a quarter.
    expect(triangles(chunks)).toBe((triangles(full) * (8 + 8 / 4)) / 16);
  });
});

describe('terrainColour', () => {
  const colour = (height: number, cover: { grass?: number; sand?: number; rock?: number; snow?: number; variation?: number }) =>
    terrainColour(height, cover.grass ?? 0, cover.sand ?? 0, cover.rock ?? 0, cover.snow ?? 0, cover.variation ?? 0.5);

  it('is near white under snow, even over rock', () => {
    const [r, g, b] = colour(220, { rock: 1, snow: 1 });
    expect(Math.min(r, g, b)).toBeGreaterThan(0.85);
  });

  it('is green for grass, sandy for sand and grey for rock', () => {
    const [gr, gg, gb] = colour(8, { grass: 1 });
    expect(gg).toBeGreaterThan(gr);
    expect(gg).toBeGreaterThan(gb);
    const [sr, sg, sb] = colour(0.5, { sand: 1 });
    expect(sr).toBeGreaterThan(sb);
    expect(sg).toBeGreaterThan(sb);
    const [rr, rg, rb] = colour(40, { rock: 1 });
    expect(Math.max(rr, rg, rb) - Math.min(rr, rg, rb)).toBeLessThan(0.12);
  });

  it('is bare earth where nothing grows: the road verge and fresh banks', () => {
    const [r, g, b] = colour(8, {});
    expect(r).toBeGreaterThan(b);
    expect(g).toBeLessThan(colour(8, { grass: 1 })[1] + 0.2);
  });

  it('varies grass between lush and dry with the variation map', () => {
    expect(colour(8, { grass: 1, variation: 0 })).not.toEqual(colour(8, { grass: 1, variation: 1 }));
  });

  it('darkens sand that is under water', () => {
    const dry = colour(0.5, { sand: 1 });
    const deep = colour(-10, { sand: 1 });
    expect(deep[0] + deep[1] + deep[2]).toBeLessThan(dry[0] + dry[1] + dry[2]);
  });

  it('always gives colours between 0 and 1', () => {
    for (const height of [-22, -1, 0, 1, 10, 30, 70]) {
      for (const cover of [{}, { grass: 1 }, { sand: 1 }, { rock: 1 }, { grass: 0.5, rock: 0.5, variation: 1 }]) {
        for (const channel of colour(height, cover)) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('buildTerrainChunks with three levels of detail', () => {
  // 257 samples a side: 256 cells of 2 m, cut into 64 chunks of 32 by 32 cells (64 m). A road runs down the left edge at x = -250.
  const { ground, cover } = world(512, 2, (x, z) => 10 + 6 * Math.sin(x / 9) * Math.cos(z / 7) + x * 0.02);
  const road = { x: Array.from({ length: 129 }, () => -250), z: Array.from({ length: 129 }, (_, i) => -256 + i * 4) };
  const levels = [
    { distance: 70, stride: 2 },
    { distance: 200, stride: 4 },
  ];
  const chunks = buildTerrainChunks(ground, cover, { chunkCells: 32, skipBelow: -100, far: { x: road.x, z: road.z, levels } });
  const full = buildTerrainChunks(ground, cover, { chunkCells: 32, skipBelow: -100 });
  /** How far a chunk's nearest point is from the road, which runs along x = -250. */
  const fromRoad = (chunk: { positions: Float32Array }): number => {
    let low = Infinity;
    for (let v = 0; v < chunk.positions.length; v += 3) low = Math.min(low, chunk.positions[v]!);
    return Math.max(0, low - -250);
  };

  it('picks each chunk s detail by how far its nearest point is from the road', () => {
    const seen = new Set<number>();
    chunks.forEach((chunk, k) => {
      const away = fromRoad(chunk);
      const stride = away > 200 ? 4 : away > 70 ? 2 : 1;
      expect(chunk.indices.length).toBe(full[k]!.indices.length / (stride * stride));
      seen.add(stride);
    });
    expect([...seen].sort()).toEqual([1, 2, 4]);
  });

  it('reports the step each chunk takes', () => {
    chunks.forEach((chunk) => {
      const away = fromRoad(chunk);
      expect(chunk.stride).toBe(away > 200 ? 4 : away > 70 ? 2 : 1);
    });
  });

  it('leaves no cracks anywhere: every vertex on a shared edge lies on the line of the coarser chunk s edge', () => {
    // For every chunk, its four edges as lists of (position along the edge, height).
    const edges = new Map<string, Array<Array<[number, number]>>>();
    const add = (name: string, edge: Array<[number, number]>): void => {
      edges.set(name, [...(edges.get(name) ?? []), edge]);
    };
    const key = (axis: 'x' | 'z', at: number, from: number): string => `${axis}${at}@${from}`;
    for (const chunk of chunks) {
      const p = chunk.positions;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let v = 0; v < p.length; v += 3) {
        x0 = Math.min(x0, p[v]!); x1 = Math.max(x1, p[v]!);
        z0 = Math.min(z0, p[v + 2]!); z1 = Math.max(z1, p[v + 2]!);
      }
      const along = (axis: 'x' | 'z', at: number): Array<[number, number]> => {
        const list: Array<[number, number]> = [];
        for (let v = 0; v < p.length; v += 3) {
          if (axis === 'x' && p[v] === at) list.push([p[v + 2]!, p[v + 1]!]);
          if (axis === 'z' && p[v + 2] === at) list.push([p[v]!, p[v + 1]!]);
        }
        return list.sort((a, b) => a[0] - b[0]);
      };
      add(key('x', x0, z0), along('x', x0));
      add(key('x', x1, z0), along('x', x1));
      add(key('z', z0, x0), along('z', z0));
      add(key('z', z1, x0), along('z', z1));
    }
    /** The height on a broken line at a position along it. */
    const on = (edge: Array<[number, number]>, t: number): number => {
      const k = edge.findIndex(([at]) => at >= t);
      const [t1, h1] = edge[k]!;
      const [t0, h0] = edge[Math.max(0, k - 1)]!;
      return t1 === t0 ? h1 : h0 + ((h1 - h0) * (t - t0)) / (t1 - t0);
    };
    let pairs = 0;
    // An edge shared by two chunks appears twice under the same name; the sparser of the two must hold the other's vertices.
    for (const [, both] of edges) {
      if (both.length < 2) continue;
      const [a, b] = both.sort((p, q) => p.length - q.length) as [Array<[number, number]>, Array<[number, number]>];
      for (const [t, h] of b) expect(h).toBeCloseTo(on(a, t), 4);
      pairs++;
    }
    expect(pairs).toBeGreaterThan(50);
  });

  it('draws sea bed deep under the water at the coarsest step, however near the road', () => {
    // The same world sunk deep: every chunk is sea bed under at least 5 m of water.
    const deep = world(512, 2, (x, z) => -20 + 6 * Math.sin(x / 9) * Math.cos(z / 7));
    const sunk = buildTerrainChunks(deep.ground, deep.cover, { chunkCells: 32, skipBelow: -100, far: { x: road.x, z: road.z, levels }, seaBed: { below: -5, stride: 4 } });
    expect(sunk).toHaveLength(64);
    for (const chunk of sunk) expect(chunk.stride).toBe(4);
    // Ground that comes up near the surface keeps its detail.
    const shallow = world(512, 2, () => -4);
    const kept = buildTerrainChunks(shallow.ground, shallow.cover, { chunkCells: 32, skipBelow: -100, seaBed: { below: -5, stride: 4 } });
    for (const chunk of kept) expect(chunk.stride).toBe(1);
  });
});

describe('the ground of real islands, drawn at the configured levels of detail', () => {
  const triangles = (list: ReturnType<typeof buildTerrainChunks>): number => list.reduce((sum, chunk) => sum + chunk.indices.length / 3, 0);
  // Seed 1 is a mountain seed with a big island; seed 12 a mountain seed whose island fills much of the tile.
  for (const seed of [1, 12]) {
    it(`draws seed ${seed} with well under the triangles of a quarter detail alone`, () => {
      const world = generateWorld(seed, config);
      const winner = world.track.candidates[world.track.winnerIndex]!;
      const options = detailOptions(config.render, winner.line);
      const now = triangles(buildTerrainChunks(world.ground, world.cover, options));
      // What R8 drew: full detail near the road, a quarter beyond, nothing coarser.
      const before = triangles(
        buildTerrainChunks(world.ground, world.cover, { ...options, far: { ...options.far!, levels: options.far!.levels.slice(0, 1) }, seaBed: undefined }),
      );
      // Measured in 15c on eight seeds: 74% to 88% of what R8 drew.
      expect(now).toBeLessThan(before * 0.9);
    });
  }

  it('gives the same step for every chunk as the chunks themselves report', () => {
    const world = generateWorld(7, config);
    const winner = world.track.candidates[world.track.winnerIndex]!;
    const options = detailOptions(config.render, winner.line);
    const detail = chunkStrides(world.ground, options);
    const chunks = buildTerrainChunks(world.ground, world.cover, { ...options, skipBelow: -Infinity });
    expect(chunks).toHaveLength(detail.across * detail.across);
    chunks.forEach((chunk, k) => expect(chunk.stride).toBe(detail.strides[k]));
  });
});

describe('coveredColours (M6.2b)', () => {
  it('colours each corner of a covered mesh as the ground is coloured at its height and with its cover', () => {
    const cover: Cover = {
      grass: Uint8Array.from([255, 0]),
      sand: Uint8Array.from([0, 0]),
      rock: Uint8Array.from([0, 200]),
      snow: Uint8Array.from([0, 30]),
      variation: Uint8Array.from([64, 190]),
    };
    const mesh = { positions: Float32Array.from([0, 12, 0, 5, 140, 5]), indices: Uint32Array.from([0, 1, 0]), cover };
    const colours = coveredColours(mesh);
    expect(colours).toHaveLength(6);
    for (const v of [0, 1]) {
      const [r, g, b] = terrainColour(mesh.positions[v * 3 + 1]!, cover.grass[v]! / 255, 0, cover.rock[v]! / 255, cover.snow[v]! / 255, cover.variation[v]! / 255);
      expect(colours[v * 3]).toBeCloseTo(toLinear(r), 6);
      expect(colours[v * 3 + 1]).toBeCloseTo(toLinear(g), 6);
      expect(colours[v * 3 + 2]).toBeCloseTo(toLinear(b), 6);
    }
  });
});
