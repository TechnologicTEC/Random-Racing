import { describe, expect, it } from 'vitest';
import { config, type GenConfig } from '../config';
import { generateWorld, hashWorld } from './generate';
import { hashTrack } from './track/hash';
import { generateTrack } from './track/pipeline';
import { pickWoods } from './world/decor';
import { sampleField } from './world/heightfield';
import { describeCleanFit } from '../testing/fitChecks';

/** A coarse grid keeps these quick; the island tests cover the full grid. */
const coarse: GenConfig = { ...config, world: { ...config.world, tile: { extent: 1400, cell: 8 } } };

describe('generateWorld', () => {
  const world = generateWorld(48213, coarse);

  it('records the seed and generator version', () => {
    expect(world.seed).toBe(48213);
    expect(world.generatorVersion).toBe(0);
  });

  it('contains exactly the track that track generation gives on its own', () => {
    expect(hashTrack(world.track)).toBe(hashTrack(generateTrack(48213, coarse)));
  });

  it('contains the island as a height grid of the configured size', () => {
    expect(world.natural.cell).toBe(8);
    expect(world.natural.size).toBe(176);
    expect(world.natural.height).toHaveLength(176 * 176);
  });

  it('contains the fitted ground, the cover maps and the fit report', () => {
    expect(world.ground.height).toHaveLength(176 * 176);
    expect(world.ground.height).not.toEqual(world.natural.height);
    expect(world.cover.grass).toHaveLength(176 * 176);
    expect(world.report.nearestWater.value).toBeGreaterThan(0);
  });

  it('contains the road: its banking and its surface as triangles', () => {
    const winner = world.track.candidates[world.track.winnerIndex]!;
    expect(world.road.cross).toHaveLength(winner.line.count);
    expect(Math.max(...world.road.cross.map(Math.abs))).toBeGreaterThan(0.03);
    expect(world.road.mesh.indices.length / 3).toBeGreaterThan(winner.line.count * 10);
  });

  it('contains a kerb for every real corner, as spans and as triangles', () => {
    const winner = world.track.candidates[world.track.winnerIndex]!;
    const realCorners = winner.sections.filter((s) => s.type === 'corner' && s.kind !== 'kink').length;
    expect(world.road.kerbs.spans).toHaveLength(realCorners);
    expect(world.road.kerbs.mesh.indices.length).toBeGreaterThan(0);
  });

  it('contains walls, as spans and as triangles, and a gate at the start', () => {
    const winner = world.track.candidates[world.track.winnerIndex]!;
    const { walls } = world.road;
    expect(walls.length).toBeGreaterThan(0);
    const pieces = walls.reduce((sum, wall) => sum + wall.pieceCount, 0);
    const ends = walls.filter((wall) => wall.pieceCount < winner.line.count).length * 2;
    // Two faces and a top for every piece, and a face closing each end of a wall that has ends; two triangles each.
    expect(world.road.barriers.indices.length / 3).toBe(pieces * 6 + ends * 2);
    expect(world.road.gate.indices.length).toBeGreaterThan(0);
  });

  it('lists where each mountain s summit is, as plain numbers the page can be sent', () => {
    // Seed 11 is a circling mountain seed with two lone peaks; its massif is the main one.
    const mountainous = generateWorld(11, coarse);
    expect(mountainous.mountains.length).toBeGreaterThanOrEqual(1);
    expect(structuredClone(mountainous.mountains)).toEqual(mountainous.mountains);
    const main = mountainous.mountains[0]!;
    expect(main.summit).toBeGreaterThan(100);
    // The natural ground at the summit is the summit's height, to the coarse grid.
    expect(Math.abs(sampleField(mountainous.natural, main.x, main.z, 0) - main.summit)).toBeLessThan(10);
    // Seed 9 is flat with no mountains.
    expect(generateWorld(9, coarse).mountains).toEqual([]);
  });

  it('contains the trees and rocks of the seed, as its own woods ask', () => {
    const { decor } = world;
    expect(decor.woods).toBe(pickWoods(48213, coarse.world.decor));
    expect(decor.trees.count).toBeGreaterThan(50);
    expect(decor.rocks.count).toBeGreaterThan(5);
    // Every tree stands on the fitted ground, the ground that is drawn.
    for (let i = 0; i < decor.trees.count; i += 7) {
      expect(Math.abs(decor.trees.y[i]! - sampleField(world.ground, decor.trees.x[i]!, decor.trees.z[i]!, -99))).toBeLessThan(0.01);
    }
    expect(structuredClone(decor)).toEqual(decor);
  });

  it('contains clouds, all above the highest ground of the island', () => {
    // Seed 11 is a circling mountain seed with two lone peaks.
    for (const made of [world, generateWorld(11, coarse)]) {
      let highest = 0;
      for (const height of made.ground.height) highest = Math.max(highest, height);
      expect(made.clouds.puffCount).toBeGreaterThan(0);
      for (let p = 0; p < made.clouds.puffCount; p++) {
        expect(made.clouds.puffY[p]! - made.clouds.puffThick[p]!).toBeGreaterThanOrEqual(highest + coarse.world.clouds.aboveSummit - 0.01);
      }
    }
  });

  it('treats the seed as a whole number from 0 to 4,294,967,295, like track generation', () => {
    expect(generateWorld(-1, coarse).seed).toBe(4294967295);
  });
});

describe('hashWorld', () => {
  it('is the same for the same seed and different for another', () => {
    expect(hashWorld(generateWorld(7, coarse))).toBe(hashWorld(generateWorld(7, coarse)));
    expect(hashWorld(generateWorld(7, coarse))).not.toBe(hashWorld(generateWorld(8, coarse)));
  });

  it('changes if any height changes', () => {
    const world = generateWorld(7, coarse);
    const before = hashWorld(world);
    world.natural.height[1234] = world.natural.height[1234]! + 0.5;
    expect(hashWorld(world)).not.toBe(before);
  });

  it('changes if the fitted ground or the cover changes', () => {
    const world = generateWorld(7, coarse);
    const before = hashWorld(world);
    world.ground.height[4321] = world.ground.height[4321]! + 0.5;
    const afterGround = hashWorld(world);
    expect(afterGround).not.toBe(before);
    world.cover.grass[4321] = world.cover.grass[4321] === 0 ? 1 : 0;
    const afterGrass = hashWorld(world);
    expect(afterGrass).not.toBe(afterGround);
    world.cover.snow[4321] = world.cover.snow[4321] === 0 ? 1 : 0;
    expect(hashWorld(world)).not.toBe(afterGrass);
  });

  it('changes if the time of day changes', () => {
    const world = generateWorld(7, coarse);
    const before = hashWorld(world);
    world.sky.hour += 1 / 60;
    const afterHour = hashWorld(world);
    expect(afterHour).not.toBe(before);
    world.sky.bearing += 0.01;
    expect(hashWorld(world)).not.toBe(afterHour);
  });

  it('changes if a tree, a rock or the woods change', () => {
    const world = generateWorld(7, coarse);
    const before = hashWorld(world);
    world.decor.trees.x[3] = world.decor.trees.x[3]! + 0.5;
    const afterTree = hashWorld(world);
    expect(afterTree).not.toBe(before);
    world.decor.trees.kind[3] = (world.decor.trees.kind[3]! + 1) % 3;
    const afterKind = hashWorld(world);
    expect(afterKind).not.toBe(afterTree);
    world.decor.rocks.size[0] = world.decor.rocks.size[0]! + 0.25;
    const afterRock = hashWorld(world);
    expect(afterRock).not.toBe(afterKind);
    world.decor.woods = world.decor.woods === 'open' ? 'forest' : 'open';
    expect(hashWorld(world)).not.toBe(afterRock);
  });

  it('changes if a cloud or the amount of cloud changes', () => {
    const world = generateWorld(7, coarse);
    const before = hashWorld(world);
    world.clouds.x[0] = world.clouds.x[0]! + 1;
    const afterCloud = hashWorld(world);
    expect(afterCloud).not.toBe(before);
    world.clouds.puffY[2] = world.clouds.puffY[2]! + 1;
    const afterPuff = hashWorld(world);
    expect(afterPuff).not.toBe(afterCloud);
    world.clouds.cover = world.clouds.cover === 'clear' ? 'cloudy' : 'clear';
    expect(hashWorld(world)).not.toBe(afterPuff);
  });

  it('changes if the road changes', () => {
    const world = generateWorld(7, coarse);
    const before = hashWorld(world);
    world.road.mesh.positions[100] = world.road.mesh.positions[100]! + 0.25;
    const afterMesh = hashWorld(world);
    expect(afterMesh).not.toBe(before);
    world.road.cross[10] = world.road.cross[10]! + 0.01;
    const afterCross = hashWorld(world);
    expect(afterCross).not.toBe(afterMesh);
    world.road.kerbs.mesh.positions[7] = world.road.kerbs.mesh.positions[7]! + 0.25;
    const afterKerbs = hashWorld(world);
    expect(afterKerbs).not.toBe(afterCross);
    world.road.barriers.positions[7] = world.road.barriers.positions[7]! + 0.25;
    const afterBarriers = hashWorld(world);
    expect(afterBarriers).not.toBe(afterKerbs);
    world.road.gate.positions[7] = world.road.gate.positions[7]! + 0.25;
    const afterGate = hashWorld(world);
    expect(afterGate).not.toBe(afterBarriers);
    world.road.width[10] = world.road.width[10]! + 0.5;
    const afterWidth = hashWorld(world);
    expect(afterWidth).not.toBe(afterGate);
    world.road.walls[0]!.pieceCount += 1;
    const afterWall = hashWorld(world);
    expect(afterWall).not.toBe(afterWidth);
    world.road.walls[0]!.side = world.road.walls[0]!.side === 1 ? -1 : 1;
    expect(hashWorld(world)).not.toBe(afterWall);
  });
});

// The full grid, as the game uses, on seeds of every kind of relief. Seeds 1 to 20 and 20 fresh seeds have their own files.
describeCleanFit('six seeds of every kind', [1, 7, 42, 99, 2024, 48213]);
