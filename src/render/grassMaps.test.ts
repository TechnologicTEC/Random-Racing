import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen/generate';
import { createField, sampleGrid, worldX, worldZ } from '../gen/world/heightfield';
import { stadiumLine, swellingWidth, uniformWidth } from '../testing/trackFixtures';
import { flowerMap, grassAt, grassGrid, roadsideMap } from './grassMaps';

const cfg = config.render.grass;
/** How far from the road edge the roadside map measures: the mown strip and the stretch over which the grass grows back. */
const reach = cfg.mown.width + cfg.mown.ease;

describe('roadsideMap: how far every cell near the road is from the road edge', () => {
  // Two straights 400 m long at z = -100 and z = +100, joined by half circles. The road is 12 m wide.
  const line = stadiumLine(400, 100);
  const field = createField(900, 3);
  const map = roadsideMap(line, uniformWidth(line, 12), field, reach);
  /** Metres from the road edge at a point, as the map has it. */
  const metres = (bytes: Uint8Array, x: number, z: number): number => (sampleGrid(field, bytes, x, z, 255) / 255) * reach;

  it('has one byte for every cell of the ground', () => {
    expect(map).toBeInstanceOf(Uint8Array);
    expect(map.length).toBe(field.size * field.size);
  });

  it('is zero on the road', () => {
    for (const x of [-150, -40, 0, 75, 190]) {
      expect(metres(map, x, -100)).toBeLessThan(0.3);
      expect(metres(map, x, 100)).toBeLessThan(0.3);
    }
  });

  it('measures from the edge of the road, not its middle, on both sides', () => {
    // The edge is 6 m from the centre line.
    for (const beyond of [3, 5, 8, 12]) {
      expect(metres(map, 30, -100 - 6 - beyond)).toBeGreaterThan(beyond - 0.7);
      expect(metres(map, 30, -100 - 6 - beyond)).toBeLessThan(beyond + 0.7);
      expect(metres(map, 30, -100 + 6 + beyond)).toBeGreaterThan(beyond - 0.7);
      expect(metres(map, 30, -100 + 6 + beyond)).toBeLessThan(beyond + 0.7);
    }
  });

  it('is full everywhere beyond its reach', () => {
    expect(metres(map, 0, 0)).toBe(reach);
    expect(metres(map, 0, -100 - 6 - reach - 6)).toBe(reach);
    expect(metres(map, -440, -440)).toBe(reach);
    let full = 0;
    for (const byte of map) if (byte === 255) full++;
    expect(full / map.length).toBeGreaterThan(0.8);
  });

  it('follows the corners too', () => {
    // The right-hand half circle is centred on (200, 0) with a radius of 100 m.
    const along = Math.SQRT1_2;
    const at = (radius: number): number => metres(map, 200 + radius * along, radius * along);
    expect(at(100)).toBeLessThan(0.3);
    expect(at(100 + 6 + 5)).toBeGreaterThan(4.3);
    expect(at(100 + 6 + 5)).toBeLessThan(5.7);
    expect(at(100 - 6 - 5)).toBeGreaterThan(4.3);
    expect(at(100 - 6 - 5)).toBeLessThan(5.7);
  });

  it('measures from the true edge where the road is wider', () => {
    // 12 m wide at the start of the lap (-200, -100), 22 m half way round (200, 100).
    const width = swellingWidth(line, 12, 22);
    const wide = roadsideMap(line, width, field, reach);
    const narrowHere = metres(wide, -190, -100 - 15);
    const wideHere = metres(wide, 190, 100 + 15);
    // 15 m from the centre line is about 9 m beyond a 12 m road and about 4 m beyond a 22 m one.
    expect(narrowHere).toBeGreaterThan(8);
    expect(narrowHere).toBeLessThan(9.8);
    expect(wideHere).toBeGreaterThan(3.2);
    expect(wideHere).toBeLessThan(5);
  });
});

describe('flowerMap: where the patches of wildflowers are', () => {
  const field = createField(config.world.tile.extent, config.world.tile.cell);
  const maps = [1, 2, 7, 42].map((seed) => flowerMap(seed, field, cfg.flowers));
  const inFlower = (byte: number): boolean => byte > 127;

  it('covers the whole tile on a coarser grid of its own', () => {
    for (const map of maps) {
      expect(map.cell).toBe(cfg.flowers.cell);
      expect(map.origin).toBe(field.origin);
      expect(map.data.length).toBe(map.size * map.size);
      expect((map.size - 1) * map.cell).toBeGreaterThanOrEqual(config.world.tile.extent);
    }
  });

  it('is the same every time for a seed, and different for another seed', () => {
    expect(flowerMap(7, field, cfg.flowers).data).toEqual(maps[2]!.data);
    let differing = 0;
    for (let c = 0; c < maps[0]!.data.length; c++) if (inFlower(maps[0]!.data[c]!) !== inFlower(maps[1]!.data[c]!)) differing++;
    expect(differing / maps[0]!.data.length).toBeGreaterThan(0.1);
  });

  it('puts the configured share of every island in flower', () => {
    for (const map of maps) {
      let count = 0;
      for (const byte of map.data) if (inFlower(byte)) count++;
      expect(count / map.data.length).toBeGreaterThan(cfg.flowers.patches - 0.03);
      expect(count / map.data.length).toBeLessThan(cfg.flowers.patches + 0.03);
    }
  });

  it('gathers the flowers in patches, not a speckle', () => {
    for (const map of maps) {
      let pairs = 0;
      let both = 0;
      for (let iz = 0; iz < map.size; iz++) {
        for (let ix = 0; ix < map.size - 1; ix++) {
          if (!inFlower(map.data[iz * map.size + ix]!)) continue;
          pairs++;
          if (inFlower(map.data[iz * map.size + ix + 1]!)) both++;
        }
      }
      // A cell in flower usually has a neighbour in flower beside it. Scattered at random, only the
      // patches' share of them would (a quarter); patches about 40 m across on a 9 m grid give about 0.7.
      expect(both / pairs).toBeGreaterThan(0.6);
      expect(both / pairs).toBeGreaterThan(cfg.flowers.patches * 2);
    }
  });

  it('has several separate patches across an island, of about the configured size', () => {
    // Along a line across the tile, count the runs of cells in flower and their lengths.
    for (const map of maps) {
      let runs = 0;
      let cells = 0;
      for (let iz = 0; iz < map.size; iz += 8) {
        let inside = false;
        for (let ix = 0; ix < map.size; ix++) {
          const here = inFlower(map.data[iz * map.size + ix]!);
          if (here) cells++;
          if (here && !inside) runs++;
          inside = here;
        }
      }
      const mean = (cells / runs) * map.cell;
      expect(mean).toBeGreaterThan(cfg.flowers.scale * 0.3);
      expect(mean).toBeLessThan(cfg.flowers.scale * 2);
    }
  });
});

describe('grassGrid: everything the grass needs to know about the ground, for a real island', () => {
  const world = generateWorld(7, config);
  const { ground, cover } = world;
  const winner = world.track.candidates[world.track.winnerIndex]!;
  const grid = grassGrid(world, cfg);

  it('lies on the same grid as the ground, four bytes to a cell', () => {
    expect(grid.size).toBe(ground.size);
    expect(grid.cell).toBe(ground.cell);
    expect(grid.origin).toBe(ground.origin);
    expect(grid.data).toBeInstanceOf(Uint8Array);
    expect(grid.data.length).toBe(ground.size * ground.size * 4);
    expect(grid.reach).toBe(reach);
  });

  it('carries the cover map s grass and its lush-to-dry variation unchanged', () => {
    let wrong = 0;
    for (let c = 0; c < cover.grass.length; c++) {
      if (grid.data[c * 4] !== cover.grass[c] || grid.data[c * 4 + 1] !== cover.variation[c]) wrong++;
    }
    expect(wrong).toBe(0);
  });

  it('carries the distance from the road edge, from the winner s line and the road s true width', () => {
    const expected = roadsideMap(winner.line, world.road.width, ground, reach);
    let wrong = 0;
    for (let c = 0; c < expected.length; c++) if (grid.data[c * 4 + 2] !== expected[c]) wrong++;
    expect(wrong).toBe(0);
  });

  it('carries the seed s flower patches, spread from their coarser grid', () => {
    const flowers = flowerMap(world.seed, ground, cfg.flowers);
    const coarse = { size: flowers.size, cell: flowers.cell, origin: flowers.origin, height: new Float32Array(0) };
    let worst = 0;
    for (let iz = 0; iz < ground.size; iz += 7) {
      for (let ix = 0; ix < ground.size; ix += 7) {
        const expected = sampleGrid(coarse, flowers.data, worldX(ground, ix), worldZ(ground, iz), 0);
        worst = Math.max(worst, Math.abs(grid.data[(iz * ground.size + ix) * 4 + 3]! - expected));
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('reads no grass and no distance on the road itself', () => {
    for (let i = 0; i < winner.line.count; i += 25) {
      const here = grassAt(grid, winner.line.x[i]!, winner.line.z[i]!);
      expect(here.grass).toBe(0);
      expect(here.roadside).toBeLessThan(0.4);
    }
  });

  it('reads grass somewhere beyond the mown strip, a full distance from the road', () => {
    let found = 0;
    for (let c = 0; c < cover.grass.length; c += 53) {
      if (cover.grass[c] !== 255 || grid.data[c * 4 + 2] !== 255) continue;
      const x = worldX(ground, c % ground.size);
      const z = worldZ(ground, Math.floor(c / ground.size));
      const here = grassAt(grid, x, z);
      expect(here.grass).toBe(1);
      expect(here.roadside).toBe(reach);
      found++;
    }
    expect(found).toBeGreaterThan(100);
  });

  it('blends between cells as the ground does, and gives every value from 0 to 1', () => {
    const blend = (values: Uint8Array, x: number, z: number): number => sampleGrid(ground, values, x, z, 0) / 255;
    let state = 99;
    const next = (): number => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return state / 4294967296;
    };
    for (let k = 0; k < 400; k++) {
      const x = (next() - 0.5) * 1800;
      const z = (next() - 0.5) * 1800;
      const here = grassAt(grid, x, z);
      expect(here.grass).toBeCloseTo(blend(cover.grass, x, z), 6);
      expect(here.variation).toBeCloseTo(blend(cover.variation, x, z), 6);
      for (const value of [here.grass, here.variation, here.flowers]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(here.roadside).toBeGreaterThanOrEqual(0);
      expect(here.roadside).toBeLessThanOrEqual(reach);
    }
  });

  it('reads no grass off the edge of the tile', () => {
    const outside = grassAt(grid, ground.origin - 50, 0);
    expect(outside.grass).toBe(0);
    expect(outside.flowers).toBe(0);
    expect(outside.roadside).toBe(reach);
  });

  it('is quick to build: it is made on the page, not in the worker', () => {
    const times: number[] = [];
    for (let k = 0; k < 3; k++) {
      const start = performance.now();
      grassGrid(world, cfg);
      times.push(performance.now() - start);
    }
    // Aimed at about 30 ms; the limit here is loose so a busy machine does not fail the test.
    expect(Math.min(...times)).toBeLessThan(150);
  });
});
