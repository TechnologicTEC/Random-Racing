import { describe, expect, it } from 'vitest';
import { config, type GenConfig } from '../../config';
import { withCharacter } from '../../testing/characters';
import { solveWidth } from '../road/width';
import { generateTrack } from '../track/pipeline';
import type { Character, LandformKind } from '../types';
import { buildCover } from './cover';
import { worldX, worldZ } from './heightfield';
import { buildIsland, type Island, type Mountain } from './island';
import { placeMassif } from './relief';

const scenery = config.world.scenery;
const rules = scenery.mountains;

/** A 5 m grid keeps these quick; mountains hundreds of metres across look the same at this scale. */
const coarse: GenConfig = { ...config, world: { ...config.world, tile: { ...config.world.tile, cell: 5 } } };

interface Built {
  seed: number;
  character: Character;
  island: Island;
  cfg: GenConfig;
}

function build(seed: number, traits: Partial<Character>, base: GenConfig = coarse): Built {
  const cfg = withCharacter(base, traits);
  const track = generateTrack(seed, cfg);
  const winner = track.candidates[track.winnerIndex]!;
  const width = solveWidth(seed, winner.line, winner.sections, track.character.width, cfg);
  return { seed, character: track.character, island: buildIsland(seed, winner.line, winner.profile, width, cfg, track.character), cfg };
}

const cellX = (island: Island, c: number): number => worldX(island.natural, c % island.natural.size);
const cellZ = (island: Island, c: number): number => worldZ(island.natural, Math.floor(c / island.natural.size));
/** True for a cell the mountain's foot covers. */
const onFoot = (island: Island, mountain: Mountain, c: number): boolean => mountain.landform.outside(cellX(island, c), cellZ(island, c)) <= 0;
const cellOf = (island: Island, x: number, z: number): number => {
  const { size, cell, origin } = island.natural;
  return Math.round((z - origin) / cell) * size + Math.round((x - origin) / cell);
};
/** The plain numbers of a mountain, for comparing two runs. */
const plain = ({ x, z, radius, summit, base }: Mountain) => ({ x, z, radius, summit, base });

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
// Mountain seeds, every coast and shape; rolling seeds asked for three mountains of each shape; hilly seeds as they come.
const mountainSeeds = SEEDS.map((seed) => build(seed, { relief: 'mountain' }));
const SHAPES: readonly LandformKind[] = ['peak', 'range', 'hills'];
const rollingSeeds = SHAPES.flatMap((landform) => SEEDS.slice(0, 5).map((seed) => build(seed, { relief: 'rolling', mountains: 3, landform })));
const hillySeeds = SEEDS.slice(0, 5).map((seed) => build(seed, { relief: 'hilly', mountains: 2 }));
const all = [...mountainSeeds, ...rollingSeeds, ...hillySeeds];
/** A mountain seed's main mountain is its massif, which the road climbs: it has rules of its own. */
const isMassif = (built: Built, k: number): boolean => k === 0 && built.character.relief === 'mountain';
/** Every mountain but a massif, with its rank (0 for the main one). */
const builtMountains = (built: Built): Array<{ mountain: Mountain; k: number }> =>
  built.island.mountains.map((mountain, k) => ({ mountain, k })).filter(({ k }) => !isMassif(built, k));

describe('placing mountains', () => {
  it('never gives an island more mountains than its character asks for, and mountain seeds at least one', () => {
    for (const { island, character, seed } of all) {
      // A mountain seed's massif counts as its main mountain.
      const most = character.relief === 'mountain' ? Math.max(1, character.mountains) : character.mountains;
      expect(island.mountains.length, `seed ${seed}`).toBeLessThanOrEqual(most);
    }
    for (const { island, seed } of mountainSeeds) expect(island.mountains.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
  });

  it('finds room for most of the mountains asked for', () => {
    const asked = all.reduce((sum, { character }) => sum + character.mountains, 0);
    const placed = all.reduce((sum, { island }) => sum + island.mountains.length, 0);
    expect(placed / asked).toBeGreaterThan(0.75);
  });

  it("builds every mountain in the seed's shape", () => {
    for (const built of all) {
      for (const { mountain } of builtMountains(built)) expect(mountain.landform.kind, `seed ${built.seed}`).toBe(built.character.landform);
    }
  });

  it('makes them no higher than their shape allows, at least 40 m above the ground they stand on, and most nearly as high as asked', () => {
    let nearlyFull = 0;
    let count = 0;
    for (const built of all) {
      const heights = rules.heights[built.character.landform];
      for (const { mountain, k } of builtMountains(built)) {
        const [, highest] = k === 0 ? heights.main : heights.others;
        expect(mountain.summit, `seed ${built.seed} mountain ${k}`).toBeLessThanOrEqual(highest + 0.001);
        expect(mountain.summit - mountain.base, `seed ${built.seed} mountain ${k}`).toBeGreaterThanOrEqual(rules.minRise - 0.001);
        count++;
        if (mountain.summit >= 0.7 * (k === 0 ? heights.main : heights.others)[0]) nearlyFull++;
      }
    }
    expect(nearlyFull / count).toBeGreaterThan(0.5);
  });

  it('really builds them that high: the ground at each summit is about the summit height', () => {
    for (const { island, seed } of all) {
      for (const mountain of island.mountains) {
        expect(Math.abs(island.natural.height[cellOf(island, mountain.x, mountain.z)]! - mountain.summit), `seed ${seed}`).toBeLessThan(10);
      }
    }
  });

  it('keeps every part of their feet at least 60 m from the road, apart from a massif the road climbs', () => {
    expect(rules.clearance).toBe(60);
    for (const built of all) {
      const { island, seed } = built;
      for (const { mountain } of builtMountains(built)) {
        let closest = Infinity;
        for (let c = 0; c < island.edge.length; c++) if (onFoot(island, mountain, c)) closest = Math.min(closest, island.edge[c]!);
        expect(closest, `seed ${seed}`).toBeGreaterThanOrEqual(rules.clearance - island.natural.cell);
      }
    }
  });

  it('keeps their sides no steeper than their shape allows, a massif on its cone too', () => {
    for (const built of all) {
      const { island, seed, character, cfg } = built;
      const { size, cell, height } = island.natural;
      for (const [k, mountain] of island.mountains.entries()) {
        const massif = isMassif(built, k);
        const limit = cfg.world.scenery.landforms[character.landform].slope + (massif ? cfg.world.relief.massif.slope : 0);
        let steepest = 0;
        for (let c = 0; c < height.length - size - 1; c++) {
          if (!onFoot(island, mountain, c)) continue;
          // Beside the road the ground is cut and filled to meet it.
          if (massif && island.edge[c]! < 30) continue;
          steepest = Math.max(steepest, Math.abs(height[c + 1]! - height[c]!) / cell, Math.abs(height[c + size]! - height[c]!) / cell);
        }
        // The ground they stand on, its bumps and the coarse grid add a little.
        expect(steepest, `seed ${seed}`).toBeLessThan(limit + 0.35);
      }
    }
  });

  it('stands every mountain on land, never cutting its foot down to the sea', () => {
    for (const { island, seed } of all) {
      for (const mountain of island.mountains) {
        for (let c = 0; c < island.natural.height.length; c++) {
          if (onFoot(island, mountain, c)) expect(island.natural.height[c]!, `seed ${seed}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("never carves a massif's top: the coast leaves it as the relief made it", () => {
    for (const { island, seed } of mountainSeeds) {
      const main = island.mountains[0]!;
      for (let c = 0; c < island.natural.height.length; c++) {
        if (onFoot(island, main, c)) expect(island.natural.height[c], `seed ${seed}`).toBe(island.inland.height[c]);
      }
    }
  });

  it('joins every mountain to the land the road is on: no mountain stands on an island of its own', () => {
    for (const { island, seed } of all) {
      const { size, height } = island.natural;
      // Flood the land outwards from the road.
      const reached = new Uint8Array(height.length);
      const queue: number[] = [];
      for (let c = 0; c < height.length; c++) {
        if (island.edge[c]! <= 0 && height[c]! > 0) {
          reached[c] = 1;
          queue.push(c);
        }
      }
      while (queue.length > 0) {
        const c = queue.pop()!;
        const x = c % size;
        for (const next of [x > 0 ? c - 1 : -1, x < size - 1 ? c + 1 : -1, c - size, c + size]) {
          if (next < 0 || next >= height.length || reached[next] || height[next]! <= 0) continue;
          reached[next] = 1;
          queue.push(next);
        }
      }
      for (const mountain of island.mountains) expect(reached[cellOf(island, mountain.x, mountain.z)], `seed ${seed}`).toBe(1);
    }
  });

  it('keeps the land around them no steeper than a sea cliff, beyond their feet and away from the road', () => {
    const cliff = config.world.coast.cliffSlope;
    for (const { island, seed } of all) {
      const { size, cell, height } = island.natural;
      let steepest = 0;
      for (let c = 0; c < height.length - size - 1; c++) {
        if (island.edge[c]! < 80) continue;
        if (island.mountains.some((m) => m.landform.outside(cellX(island, c), cellZ(island, c)) <= 2 * cell)) continue;
        steepest = Math.max(steepest, Math.abs(height[c + 1]! - height[c]!) / cell, Math.abs(height[c + size]! - height[c]!) / cell);
      }
      expect(steepest, `seed ${seed}`).toBeLessThan(cliff);
    }
  });

  it("keeps mountains apart: no summit stands on another mountain's foot", () => {
    for (const { island, seed } of all) {
      island.mountains.forEach((a, i) => {
        island.mountains.forEach((b, j) => {
          if (i !== j) expect(a.landform.outside(b.x, b.z), `seed ${seed}`).toBeGreaterThan(0);
        });
      });
    }
  });

  it('makes the massif the main mountain of a mountain seed, standing once at its summit', () => {
    for (const { island, seed, cfg, character } of mountainSeeds) {
      const massif = placeMassif(seed, cfg.world.relief, cfg.world.scenery.landforms, character)!;
      const main = island.mountains[0]!;
      expect(main.x).toBe(massif.x);
      expect(main.z).toBe(massif.z);
      // Not built twice: the ground at the summit is the relief's, not the relief's plus another mountain.
      const ground = island.natural.height[cellOf(island, main.x, main.z)]!;
      expect(ground, `seed ${seed}`).toBeLessThan(massif.summit + cfg.world.relief.lowland + cfg.world.relief.kinds.mountain.hillHeight + 5);
      expect(ground, `seed ${seed}`).toBeGreaterThan(massif.summit * 0.95);
    }
  });

  it('leaves coastal mountain seeds with sea beside the road: somewhere on every one, along much of most', () => {
    const shares = [1, 2, 3, 4, 5, 6].map((seed) => {
      const { island } = build(seed, { relief: 'mountain', coast: 'coastal' });
      // The share of road samples that have the sea within 120 m of the road edge, on some side.
      const { height } = island.natural;
      const withSea = new Set<number>();
      for (let c = 0; c < height.length; c++) if (height[c]! <= 0 && island.edge[c]! <= 120) withSea.add(island.near.index[c]!);
      const samples = island.near.index.reduce((most, i) => Math.max(most, i), 0) + 1;
      const share = withSea.size / samples;
      // A climbing lap runs up beside the mountain's top, where the land is the mountain's.
      expect(share, `seed ${seed}`).toBeGreaterThan(0.15);
      return share;
    });
    expect(shares.sort((a, b) => a - b)[3]!).toBeGreaterThan(0.4);
  });

  it('is the same for the same seed', () => {
    expect(build(3, { relief: 'mountain' }).island.mountains.map(plain)).toEqual(mountainSeeds[2]!.island.mountains.map(plain));
  });

  it('gives an island asked for no mountains none', () => {
    for (const seed of [1, 2, 3]) expect(build(seed, { relief: 'rolling', mountains: 0 }).island.mountains).toEqual([]);
  });
});

describe('foothills', () => {
  const noFoothills: GenConfig = {
    ...coarse,
    world: { ...coarse.world, scenery: { ...scenery, foothills: { ...scenery.foothills, height: [0, 0] } } },
  };

  it('raise the land away from the road by 5 to 25 m, and leave the ground near the road alone', () => {
    for (const seed of [2, 9, 21]) {
      const traits: Partial<Character> = { relief: 'flat', coast: 'inland', mountains: 0 };
      const hilly = build(seed, traits).island;
      const plain = build(seed, traits, noFoothills).island;
      let most = 0;
      for (let c = 0; c < hilly.inland.height.length; c++) {
        const rise = hilly.inland.height[c]! - plain.inland.height[c]!;
        if (hilly.edge[c]! < scenery.foothills.clearance) expect(rise, `seed ${seed}`).toBe(0);
        expect(rise, `seed ${seed}`).toBeGreaterThanOrEqual(0);
        expect(rise, `seed ${seed}`).toBeLessThanOrEqual(scenery.foothills.height[1] + 0.001);
        most = Math.max(most, rise);
      }
      expect(most, `seed ${seed}`).toBeGreaterThan(scenery.foothills.height[0]);
    }
  });
});

describe('snow', () => {
  const coverOf = ({ island, seed, cfg, character }: Built) =>
    buildCover(seed, island.natural, new Uint8Array(island.natural.height.length), island.edge, cfg, character.landform);

  it('caps the high ground of ranges and lone peaks, and nothing low', () => {
    let snowy = 0;
    for (const built of [...mountainSeeds, ...rollingSeeds].filter((b) => b.character.landform !== 'hills')) {
      const cover = coverOf(built);
      const [from, to] = built.cfg.world.cover.snowHeight;
      for (let c = 0; c < built.island.natural.height.length; c++) {
        const height = built.island.natural.height[c]!;
        if (height < from - 10) expect(cover.snow[c], `seed ${built.seed}`).toBe(0);
        if (height > to + 10 && cover.snow[c]! > 200) snowy++;
      }
    }
    expect(snowy).toBeGreaterThan(100);
  });

  it('leaves hill country green: no snow and no rock for height alone', () => {
    const hills = [...mountainSeeds, ...rollingSeeds].filter((b) => b.character.landform === 'hills');
    expect(hills.length).toBeGreaterThan(3);
    for (const built of hills) {
      const cover = coverOf(built);
      const { size, cell, height } = built.island.natural;
      for (let c = size; c < height.length - size; c++) {
        expect(cover.snow[c], `seed ${built.seed}`).toBe(0);
        // Where the ground is gentle, high ground is grass, not rock.
        const slope = Math.max(Math.abs(height[c + 1]! - height[c - 1]!), Math.abs(height[c + size]! - height[c - size]!)) / (2 * cell);
        if (height[c]! > 140 && slope < 0.3) expect(cover.rock[c], `seed ${built.seed}`).toBeLessThan(40);
      }
    }
  });
});
