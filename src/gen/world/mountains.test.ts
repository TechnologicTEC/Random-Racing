import { describe, expect, it } from 'vitest';
import { config, type GenConfig } from '../../config';
import { withCharacter } from '../../testing/characters';
import { solveWidth } from '../road/width';
import { generateTrack } from '../track/pipeline';
import type { Character } from '../types';
import { buildCover } from './cover';
import { worldX, worldZ } from './heightfield';
import { buildIsland, type Island } from './island';
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

/** Distance from a cell to a point, in metres. */
const cellDistance = (island: Island, c: number, x: number, z: number): number => {
  const { size } = island.natural;
  return Math.hypot(worldX(island.natural, c % size) - x, worldZ(island.natural, Math.floor(c / size)) - z);
};

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
// Mountain seeds, every coast; and rolling seeds asked for three mountains, every coast.
const mountainSeeds = SEEDS.map((seed) => build(seed, { relief: 'mountain' }));
const rollingSeeds = SEEDS.map((seed) => build(seed, { relief: 'rolling', mountains: 3 }));
const all = [...mountainSeeds, ...rollingSeeds];
/** A mountain seed's main mountain is its massif, which the road climbs: it has rules of its own. */
const isMassif = (built: Built, k: number): boolean => k === 0 && built.character.relief === 'mountain';

describe('placing mountains', () => {
  it('never gives an island more mountains than its character asks for, and mountain seeds at least one', () => {
    for (const { island, character, seed } of all) {
      expect(island.mountains.length, `seed ${seed}`).toBeLessThanOrEqual(character.mountains);
    }
    for (const { island, seed } of mountainSeeds) expect(island.mountains.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
  });

  it('finds room for nearly all the mountains asked for', () => {
    const asked = all.reduce((sum, { character }) => sum + character.mountains, 0);
    const placed = all.reduce((sum, { island }) => sum + island.mountains.length, 0);
    expect(placed / asked).toBeGreaterThan(0.8);
  });

  it('makes the main mountain 200 to 250 m high and the others 80 to 200 m', () => {
    for (const built of all) {
      const { island, seed } = built;
      island.mountains.forEach((mountain, k) => {
        if (isMassif(built, k)) return;
        const [lowest, highest] = k === 0 ? rules.main : rules.others;
        expect(mountain.summit, `seed ${seed} mountain ${k}`).toBeGreaterThanOrEqual(lowest - 0.001);
        expect(mountain.summit, `seed ${seed} mountain ${k}`).toBeLessThanOrEqual(highest + 0.001);
      });
    }
  });

  it('really builds them that high: the ground at each summit is about the summit height', () => {
    for (const { island, seed } of all) {
      for (const mountain of island.mountains) {
        const { size, cell, origin } = island.natural;
        const c = Math.round((mountain.z - origin) / cell) * size + Math.round((mountain.x - origin) / cell);
        expect(Math.abs(island.natural.height[c]! - mountain.summit), `seed ${seed}`).toBeLessThan(rules.main[0] * 0.05);
      }
    }
  });

  it('keeps every mountain at least 60 m from the road, apart from a massif the road climbs', () => {
    expect(rules.clearance).toBe(60);
    for (const built of all) {
      const { island, seed } = built;
      for (const [k, mountain] of island.mountains.entries()) {
        if (isMassif(built, k)) continue;
        let closest = Infinity;
        for (let c = 0; c < island.edge.length; c++) {
          if (cellDistance(island, c, mountain.x, mountain.z) <= mountain.radius) closest = Math.min(closest, island.edge[c]!);
        }
        expect(closest, `seed ${seed}`).toBeGreaterThanOrEqual(rules.clearance - island.natural.cell);
      }
    }
  });

  it('keeps their sides no steeper than about 110%, or a massif no steeper than its shape on its cone', () => {
    expect(rules.slope).toBeCloseTo(1.1, 9);
    for (const built of all) {
      const { island, seed, character, cfg } = built;
      const { size, cell, height } = island.natural;
      for (const [k, mountain] of island.mountains.entries()) {
        const massif = isMassif(built, k);
        const limit = massif ? cfg.world.scenery.landforms[character.landform].slope + cfg.world.relief.massif.slope : rules.slope;
        let steepest = 0;
        for (let c = 0; c < height.length - size - 1; c++) {
          if (cellDistance(island, c, mountain.x, mountain.z) > mountain.radius) continue;
          // Beside the road the ground is cut and filled to meet it.
          if (massif && island.edge[c]! < 30) continue;
          steepest = Math.max(steepest, Math.abs(height[c + 1]! - height[c]!) / cell, Math.abs(height[c + size]! - height[c]!) / cell);
        }
        // A little over the limit is allowed for the ridges on their sides.
        expect(steepest, `seed ${seed}`).toBeLessThan(limit + 0.35);
      }
    }
  });

  it('stands every mountain on land, growing the island if it has to', () => {
    for (const { island, seed } of all) {
      for (const mountain of island.mountains) {
        for (let c = 0; c < island.natural.height.length; c++) {
          if (cellDistance(island, c, mountain.x, mountain.z) <= mountain.radius) expect(island.natural.height[c]!, `seed ${seed}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps the land around them no steeper than a sea cliff, beyond their feet and away from the road', () => {
    const cliff = config.world.coast.cliffSlope;
    for (const { island, seed } of all) {
      const { size, cell, height } = island.natural;
      let steepest = 0;
      for (let c = 0; c < height.length - size - 1; c++) {
        if (island.edge[c]! < 80) continue;
        if (island.mountains.some((m) => cellDistance(island, c, m.x, m.z) <= m.radius + cell)) continue;
        steepest = Math.max(steepest, Math.abs(height[c + 1]! - height[c]!) / cell, Math.abs(height[c + size]! - height[c]!) / cell);
      }
      expect(steepest, `seed ${seed}`).toBeLessThan(cliff);
    }
  });

  it('keeps mountains apart: no two summits closer than the larger one is wide', () => {
    for (const { island, seed } of all) {
      island.mountains.forEach((a, i) => {
        island.mountains.slice(i + 1).forEach((b) => {
          expect(Math.hypot(a.x - b.x, a.z - b.z), `seed ${seed}`).toBeGreaterThan(Math.max(a.radius, b.radius));
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
      const { size, cell, origin } = island.natural;
      const c = Math.round((main.z - origin) / cell) * size + Math.round((main.x - origin) / cell);
      expect(island.natural.height[c]!, `seed ${seed}`).toBeLessThan(massif.summit + cfg.world.relief.lowland + cfg.world.relief.kinds.mountain.hillHeight + 5);
      expect(island.natural.height[c]!, `seed ${seed}`).toBeGreaterThan(massif.summit * 0.95);
    }
  });

  it('is the same for the same seed', () => {
    expect(build(3, { relief: 'mountain' }).island.mountains).toEqual(mountainSeeds[2]!.island.mountains);
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
  it('caps the high ground and nothing low', () => {
    let snowy = 0;
    for (const { island, seed, cfg } of mountainSeeds) {
      const corridor = new Uint8Array(island.natural.height.length);
      const cover = buildCover(seed, island.natural, corridor, island.edge, cfg);
      const [from, to] = cfg.world.cover.snowHeight;
      for (let c = 0; c < island.natural.height.length; c++) {
        const height = island.natural.height[c]!;
        if (height < from - 10) expect(cover.snow[c], `seed ${seed}`).toBe(0);
        if (height > to + 10 && cover.snow[c]! > 200) snowy++;
      }
    }
    expect(snowy).toBeGreaterThan(100);
  });
});
