import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../generate';
import type { Scatter, WoodsKind, WorldResult } from '../types';
import { buildDecor, pickWoods, placeRocks, placeTrees, ROCK_KINDS, TREE_KINDS } from './decor';
import { sampleField, sampleGrid } from './heightfield';
import { edgeDistance, nearestRoad } from './nearest';

const rules = config.world.decor;
const trees = rules.trees;
const WOODS: readonly WoodsKind[] = ['open', 'wooded', 'forest'];
const TAU = 2 * Math.PI;

interface Built {
  seed: number;
  world: WorldResult;
  /** Distance from every cell to the road edge, as the island works it out. */
  edge: Float32Array;
  byWoods: Record<WoodsKind, Scatter>;
  rocks: Scatter;
}

function build(seed: number): Built {
  const world = generateWorld(seed, config);
  const winner = world.track.candidates[world.track.winnerIndex]!;
  const edge = edgeDistance(nearestRoad(winner.line, world.ground), world.road.width);
  const place = (woods: WoodsKind): Scatter => placeTrees(seed, world.ground, world.cover, edge, config, woods);
  const rocks = placeRocks(seed, world.ground, world.cover, edge, config);
  return { seed, world, edge, byWoods: { open: place('open'), wooded: place('wooded'), forest: place('forest') }, rocks };
}

// Flat, rolling, hilly and mountain seeds; inland and coastal; every mountain shape.
const SEEDS = [1, 2, 3, 5, 7, 9, 12, 13];
const built = SEEDS.map(build);
/** Every set of trees: each world with each amount of woodland. */
const sets = built.flatMap((b) => WOODS.map((woods) => ({ ...b, woods, scatter: b.byWoods[woods] })));

const kindOf = (scatter: Scatter, i: number): string => TREE_KINDS[scatter.kind[i]!]!;
/** Steepness of the ground at a point, measured over one cell each way. */
function slopeAt(world: WorldResult, x: number, z: number): number {
  const { ground } = world;
  const dx = sampleField(ground, x + ground.cell, z, 0) - sampleField(ground, x - ground.cell, z, 0);
  const dz = sampleField(ground, x, z + ground.cell, 0) - sampleField(ground, x, z - ground.cell, 0);
  return Math.sqrt(dx * dx + dz * dz) / (2 * ground.cell);
}
/** True if any height sample within `reach` metres of the point is under the sea. */
function seaWithin(world: WorldResult, x: number, z: number, reach: number): boolean {
  const { size, cell, origin, height } = world.ground;
  const span = Math.ceil(reach / cell) + 1;
  const cx = Math.round((x - origin) / cell);
  const cz = Math.round((z - origin) / cell);
  for (let iz = Math.max(0, cz - span); iz <= Math.min(size - 1, cz + span); iz++) {
    for (let ix = Math.max(0, cx - span); ix <= Math.min(size - 1, cx + span); ix++) {
      const dx = origin + ix * cell - x;
      const dz = origin + iz * cell - z;
      if (dx * dx + dz * dz <= (reach + cell) * (reach + cell) && height[iz * size + ix]! < 0) return true;
    }
  }
  return false;
}

describe('pickWoods', () => {
  const all = Array.from({ length: 2000 }, (_, i) => pickWoods(i + 1, rules));

  it('gives the same seed the same woods every time', () => {
    for (const seed of [0, 1, 42, 48213, 4294967295]) expect(pickWoods(seed, rules)).toBe(pickWoods(seed, rules));
  });

  it('picks each amount of woodland about as often as its weight, over 2000 seeds', () => {
    const total = WOODS.reduce((sum, woods) => sum + rules.woods[woods], 0);
    for (const woods of WOODS) {
      const share = all.filter((picked) => picked === woods).length / all.length;
      expect(Math.abs(share - rules.woods[woods] / total)).toBeLessThan(0.04);
    }
  });
});

describe('placeTrees', () => {
  it('gives the same seed the same trees every time', () => {
    const { seed, world, edge, byWoods } = built[0]!;
    const again = placeTrees(seed, world.ground, world.cover, edge, config, 'wooded');
    expect(again).toEqual(byWoods.wooded);
  });

  it('is plain data: a count and arrays of that length', () => {
    for (const { scatter } of sets) {
      for (const list of [scatter.x, scatter.y, scatter.z, scatter.size, scatter.tall, scatter.turn, scatter.lean, scatter.kind, scatter.shade]) {
        expect(list).toHaveLength(scatter.count);
      }
      expect(scatter.x).toBeInstanceOf(Float32Array);
      expect(scatter.kind).toBeInstanceOf(Uint8Array);
    }
  });

  it('stands every tree on the ground, on dry land inside the tile', () => {
    for (const { world, scatter } of sets) {
      const half = config.world.tile.extent / 2;
      let worst = 0;
      let lowest = Infinity;
      let furthest = 0;
      for (let i = 0; i < scatter.count; i++) {
        const x = scatter.x[i]!;
        const z = scatter.z[i]!;
        furthest = Math.max(furthest, Math.abs(x), Math.abs(z));
        worst = Math.max(worst, Math.abs(scatter.y[i]! - sampleField(world.ground, x, z, -99)));
        lowest = Math.min(lowest, scatter.y[i]!);
      }
      expect(furthest).toBeLessThan(half);
      expect(worst).toBeLessThan(0.01);
      expect(lowest).toBeGreaterThan(0.5);
    }
  });

  it('keeps every tree at least 8 m from the road edge', () => {
    expect(trees.roadClearance).toBe(8);
    for (const { world, edge, scatter } of sets) {
      let nearest = Infinity;
      for (let i = 0; i < scatter.count; i++) nearest = Math.min(nearest, sampleGrid(world.ground, edge, scatter.x[i]!, scatter.z[i]!, 0));
      expect(nearest).toBeGreaterThanOrEqual(trees.roadClearance - 0.01);
    }
  });

  it('grows nothing on rock, on snow, on steep ground or above the tree line', () => {
    for (const { world, scatter } of sets) {
      let rock = 0;
      let snow = 0;
      let steepest = 0;
      let highest = 0;
      for (let i = 0; i < scatter.count; i++) {
        const x = scatter.x[i]!;
        const z = scatter.z[i]!;
        rock = Math.max(rock, sampleGrid(world.ground, world.cover.rock, x, z, 0));
        snow = Math.max(snow, sampleGrid(world.ground, world.cover.snow, x, z, 0));
        steepest = Math.max(steepest, slopeAt(world, x, z));
        highest = Math.max(highest, scatter.y[i]!);
      }
      expect(rock).toBeLessThanOrEqual(128);
      expect(snow).toBeLessThanOrEqual(128);
      expect(steepest).toBeLessThanOrEqual(trees.maxSlope + 1e-6);
      expect(highest).toBeLessThanOrEqual(trees.treeLine[1]);
    }
  });

  it('keeps trees apart: no two closer than the grid allows', () => {
    const gap = trees.spacing * (1 - 2 * trees.jitter);
    expect(gap).toBeGreaterThan(3);
    for (const { scatter } of sets) {
      const cells = new Map<number, number[]>();
      const key = (x: number, z: number): number => Math.floor(x / trees.spacing) * 100_000 + Math.floor(z / trees.spacing);
      for (let i = 0; i < scatter.count; i++) {
        const k = key(scatter.x[i]!, scatter.z[i]!);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k)!.push(i);
      }
      let closest = Infinity;
      for (let i = 0; i < scatter.count; i++) {
        for (const ox of [-1, 0, 1]) {
          for (const oz of [-1, 0, 1]) {
            for (const j of cells.get(key(scatter.x[i]! + ox * trees.spacing, scatter.z[i]! + oz * trees.spacing)) ?? []) {
              if (j <= i) continue;
              const dx = scatter.x[i]! - scatter.x[j]!;
              const dz = scatter.z[i]! - scatter.z[j]!;
              closest = Math.min(closest, Math.sqrt(dx * dx + dz * dz));
            }
          }
        }
      }
      expect(closest).toBeGreaterThanOrEqual(gap - 0.01);
    }
  });

  it('knows three kinds of tree, each sized within its range and turned some way round', () => {
    expect(TREE_KINDS).toEqual(['broadleaf', 'pine', 'palm']);
    for (const { scatter } of sets) {
      let bad = 0;
      for (let i = 0; i < scatter.count; i++) {
        if (scatter.kind[i]! >= TREE_KINDS.length) {
          bad++;
          continue;
        }
        const [smallest, largest] = trees.size[TREE_KINDS[scatter.kind[i]!]!];
        // Trees near the tree line are stunted.
        if (scatter.size[i]! < smallest * (1 - trees.stunt) - 1e-5 || scatter.size[i]! > largest + 1e-5) bad++;
        if (scatter.tall[i]! < trees.tall[0] - 1e-5 || scatter.tall[i]! > trees.tall[1] + 1e-5) bad++;
        if (scatter.turn[i]! < 0 || scatter.turn[i]! >= TAU) bad++;
        if (scatter.lean[i]! < 0 || scatter.lean[i]! > trees.lean.palm + 1e-5) bad++;
      }
      expect(bad).toBe(0);
    }
  });

  it('grows palms only low down beside the sea, and other trees only where grass grows', () => {
    for (const { world, scatter } of sets) {
      let strayPalms = 0;
      let thinnestGrass = 255;
      for (let i = 0; i < scatter.count; i++) {
        const x = scatter.x[i]!;
        const z = scatter.z[i]!;
        if (kindOf(scatter, i) === 'palm') {
          const y = scatter.y[i]!;
          if (y < trees.palm.height[0] - 0.01 || y > trees.palm.height[1] + 0.01 || !seaWithin(world, x, z, trees.palm.shore)) strayPalms++;
        } else {
          thinnestGrass = Math.min(thinnestGrass, sampleGrid(world.ground, world.cover.grass, x, z, 0));
        }
      }
      expect(strayPalms).toBe(0);
      expect(thinnestGrass).toBeGreaterThanOrEqual(trees.minGrass * 255 - 0.01);
    }
  });

  it('lines the shores of islands with palms, the same ones however wooded the island is', () => {
    let withPalms = 0;
    for (const { byWoods } of built) {
      const palms = (scatter: Scatter): number => scatter.kind.filter((kind) => TREE_KINDS[kind] === 'palm').length;
      expect(palms(byWoods.open)).toBe(palms(byWoods.forest));
      if (palms(byWoods.open) >= 20) withPalms++;
    }
    expect(withPalms).toBeGreaterThanOrEqual(built.length - 1);
  });

  it('grows pines higher up than broadleaf trees', () => {
    let compared = 0;
    for (const { byWoods } of built) {
      const scatter = byWoods.forest;
      const heights: Record<string, number[]> = { broadleaf: [], pine: [], palm: [] };
      for (let i = 0; i < scatter.count; i++) heights[kindOf(scatter, i)]!.push(scatter.y[i]!);
      if (heights.pine!.length < 30 || heights.broadleaf!.length < 30) continue;
      const mean = (list: number[]): number => list.reduce((sum, value) => sum + value, 0) / list.length;
      expect(mean(heights.pine!)).toBeGreaterThan(mean(heights.broadleaf!) + 5);
      compared++;
    }
    // Flat islands have no ground high enough for pines.
    expect(compared).toBeGreaterThanOrEqual(4);
  });

  it('makes a forest island several times as wooded as an open one, and a wooded one in between', () => {
    const inland = (scatter: Scatter): number => scatter.kind.filter((kind) => TREE_KINDS[kind] !== 'palm').length;
    for (const { world, byWoods } of built) {
      // Trees per square kilometre of grassy ground: islands differ a great deal in size.
      const { cell } = world.ground;
      const grassy = (world.cover.grass.filter((grass) => grass > 140).length * cell * cell) / 1e6;
      expect(inland(byWoods.forest) / grassy).toBeGreaterThan(4500);
      expect(inland(byWoods.open) / grassy).toBeGreaterThan(400);
      expect(inland(byWoods.open) / grassy).toBeLessThan(1800);
      expect(inland(byWoods.forest)).toBeGreaterThan(3 * inland(byWoods.open));
      expect(inland(byWoods.wooded)).toBeGreaterThan(1.4 * inland(byWoods.open));
      expect(inland(byWoods.forest)).toBeGreaterThan(1.4 * inland(byWoods.wooded));
    }
  });

  it('never plants more trees than the cap, thinning evenly when there would be more', () => {
    for (const { scatter } of sets) expect(scatter.count).toBeLessThanOrEqual(trees.max);
    const { seed, world, edge, byWoods } = built[0]!;
    const few = { ...config, world: { ...config.world, decor: { ...rules, trees: { ...trees, max: 500 } } } };
    const thinned = placeTrees(seed, world.ground, world.cover, edge, few, 'forest');
    expect(thinned.count).toBe(500);
    // The thinned trees are spread over the whole island, not just where the count ran out.
    const spread = (scatter: Scatter): number => Math.max(...scatter.z) - Math.min(...scatter.z);
    expect(spread(thinned)).toBeGreaterThan(0.9 * spread(byWoods.forest));
  });

  it('grows woods in patches: some stretches of road run through trees and others are open', () => {
    let wooded = 0;
    let open = 0;
    for (const { world, byWoods } of built) {
      const { line } = world.track.candidates[world.track.winnerIndex]!;
      const scatter = byWoods.wooded;
      // Count trees within 30 m of each 50th sample of the centre line.
      for (let s = 0; s < line.count; s += 50) {
        let near = 0;
        for (let i = 0; i < scatter.count; i++) {
          const dx = scatter.x[i]! - line.x[s]!;
          const dz = scatter.z[i]! - line.z[s]!;
          if (dx * dx + dz * dz < 900) near++;
        }
        if (near >= 6) wooded++;
        if (near === 0) open++;
      }
    }
    expect(wooded).toBeGreaterThan(20);
    expect(open).toBeGreaterThan(20);
  });
});

describe('placeRocks', () => {
  const rocks = rules.rocks;
  const rockKind = (scatter: Scatter, i: number): string => ROCK_KINDS[scatter.kind[i]!]!;

  it('gives the same seed the same rocks every time', () => {
    const { seed, world, edge } = built[0]!;
    expect(placeRocks(seed, world.ground, world.cover, edge, config)).toEqual(built[0]!.rocks);
  });

  it('is plain data: a count and arrays of that length', () => {
    for (const { rocks: scatter } of built) {
      for (const list of [scatter.x, scatter.y, scatter.z, scatter.size, scatter.tall, scatter.turn, scatter.lean, scatter.kind, scatter.shade]) {
        expect(list).toHaveLength(scatter.count);
      }
      expect(scatter.count).toBeLessThanOrEqual(rocks.max);
    }
  });

  it('rests every rock on the ground inside the tile, clear of the road', () => {
    const half = config.world.tile.extent / 2;
    for (const { world, edge, rocks: scatter } of built) {
      let worst = 0;
      let nearest = Infinity;
      let furthest = 0;
      for (let i = 0; i < scatter.count; i++) {
        const x = scatter.x[i]!;
        const z = scatter.z[i]!;
        furthest = Math.max(furthest, Math.abs(x), Math.abs(z));
        worst = Math.max(worst, Math.abs(scatter.y[i]! - sampleField(world.ground, x, z, -99)));
        nearest = Math.min(nearest, sampleGrid(world.ground, edge, x, z, 0));
      }
      expect(furthest).toBeLessThan(half);
      expect(worst).toBeLessThan(0.01);
      expect(nearest).toBeGreaterThanOrEqual(rocks.roadClearance - 0.01);
    }
  });

  it('knows three kinds: boulders on rocky ground, rocks along the shore, and a few out in the fields', () => {
    expect(ROCK_KINDS).toEqual(['boulder', 'shore', 'field']);
    for (const { world, rocks: scatter } of built) {
      let stray = 0;
      for (let i = 0; i < scatter.count; i++) {
        const x = scatter.x[i]!;
        const z = scatter.z[i]!;
        const y = scatter.y[i]!;
        const kind = rockKind(scatter, i);
        if (kind === 'boulder') {
          if (sampleGrid(world.ground, world.cover.rock, x, z, 0) < rocks.minRock * 255 - 0.01) stray++;
          if (slopeAt(world, x, z) > rocks.maxSlope + 1e-6 || y <= 0) stray++;
        } else if (kind === 'shore') {
          if (y < rocks.shore.height[0] - 0.01 || y > rocks.shore.height[1] + 0.01) stray++;
        } else if (kind === 'field') {
          if (sampleGrid(world.ground, world.cover.grass, x, z, 0) < 128 || y <= 0) stray++;
        } else {
          stray++;
        }
      }
      expect(stray).toBe(0);
    }
  });

  it('sizes rocks within their ranges: shore rocks small, boulders up to several metres', () => {
    for (const { rocks: scatter } of built) {
      let bad = 0;
      for (let i = 0; i < scatter.count; i++) {
        const [smallest, largest] = rockKind(scatter, i) === 'shore' ? rocks.shore.size : rocks.size;
        if (scatter.size[i]! < smallest - 1e-5 || scatter.size[i]! > largest + 1e-5) bad++;
        if (scatter.tall[i]! < rocks.tall[0] - 1e-5 || scatter.tall[i]! > rocks.tall[1] + 1e-5) bad++;
        if (scatter.turn[i]! < 0 || scatter.turn[i]! >= TAU) bad++;
        if (scatter.lean[i]! < 0 || scatter.lean[i]! > rocks.lean + 1e-5) bad++;
      }
      expect(bad).toBe(0);
    }
  });

  it('strews boulders over mountains and rocks along every shore', () => {
    for (const { world, rocks: scatter } of built) {
      const count = (kind: string): number => scatter.kind.filter((k) => ROCK_KINDS[k] === kind).length;
      expect(count('shore')).toBeGreaterThanOrEqual(10);
      if (world.track.character.relief === 'mountain') expect(count('boulder')).toBeGreaterThan(100);
    }
  });
});

describe('buildDecor', () => {
  it('gives the seed its own woods, the trees for them, and the rocks', () => {
    const { seed, world, edge, byWoods, rocks } = built[0]!;
    const decor = buildDecor(seed, world.ground, world.cover, edge, config);
    expect(decor.woods).toBe(pickWoods(seed, rules));
    expect(decor.trees).toEqual(byWoods[decor.woods]);
    expect(decor.rocks).toEqual(rocks);
  });

  it('builds the decoration of a whole island quickly', () => {
    // Fastest of three, so a busy machine does not fail the test.
    const { seed, world, edge } = built.find((b) => b.seed === 12)!;
    let fastest = Infinity;
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      buildDecor(seed, world.ground, world.cover, edge, config);
      fastest = Math.min(fastest, performance.now() - started);
    }
    expect(fastest).toBeLessThan(80);
  });
});
