import { describe, expect, it } from 'vitest';
import { config, type GenConfig } from '../config';
import { generateWorld, hashWorld } from './generate';
import { hashTrack } from './track/hash';
import { generateTrack } from './track/pipeline';
import { sampleField } from './world/heightfield';

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

  it('contains barriers along the whole lap and a gate at the start', () => {
    const winner = world.track.candidates[world.track.winnerIndex]!;
    expect(world.road.barriers.indices.length / 3).toBe(winner.line.count * 12);
    expect(world.road.gate.indices.length).toBeGreaterThan(0);
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
    expect(hashWorld(world)).not.toBe(afterGround);
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
    expect(hashWorld(world)).not.toBe(afterGate);
  });
});

describe('the road sits cleanly in the island on real seeds', () => {
  // The full 2 m grid, as the game uses.
  const worlds = [1, 7, 42, 99, 2024, 48213].map((seed) => generateWorld(seed, config));

  it('never lets the ground show through the road', () => {
    for (const world of worlds) expect(world.report.groundThroughRoad, `seed ${world.seed}`).toBe(0);
  });

  it('never leaves the road hanging in the air', () => {
    for (const world of worlds) expect(world.report.roadFloating, `seed ${world.seed}`).toBe(0);
  });

  it('needs no bridge or tunnel: cuttings and embankments stay within the limits', () => {
    for (const world of worlds) {
      expect(world.report.deepestCut.value, `seed ${world.seed}`).toBeLessThanOrEqual(config.road.maxCut);
      expect(world.report.tallestFill.value, `seed ${world.seed}`).toBeLessThanOrEqual(config.road.maxFill);
    }
  });

  it('keeps every bank beside the road gentle enough to stand', () => {
    for (const world of worlds) expect(world.report.steepestBank.value, `seed ${world.seed}`).toBeLessThan(0.9);
  });

  it('keeps the surf at least 10 m from the road, and brings it that close somewhere beside low road', () => {
    for (const world of worlds) {
      // A metre either way allows for measuring on a 2 m grid.
      expect(world.report.nearestWater.value, `seed ${world.seed}`).toBeGreaterThan(config.world.coast.minMargin - 1);
      // Hilly and mountain seeds may have no low road by the sea, and a high road keeps the water further out.
      const { relief } = world.track.character;
      if (relief === 'flat' || relief === 'rolling') {
        expect(world.report.nearestWater.value, `seed ${world.seed}`).toBeLessThan(config.world.coast.minMargin + 3);
      }
    }
  });

  it('carves the coast after the road is built, without disturbing the road', () => {
    for (const world of worlds) {
      const winner = world.track.candidates[world.track.winnerIndex]!;
      for (let i = 0; i < winner.line.count; i += 3) {
        // On the centre line itself, where banking makes no difference to the height.
        const below = winner.profile.height[i]! - sampleField(world.ground, winner.line.x[i]!, winner.line.z[i]!, 0);
        expect(below, `seed ${world.seed} sample ${i}`).toBeGreaterThan(0.2);
        expect(below, `seed ${world.seed} sample ${i}`).toBeLessThan(0.3);
      }
    }
  });

  it('never lets an embankment spill into the sea: the finished ground is never above the coast limit out on the banks', () => {
    for (const world of worlds) {
      // Beyond the strip kept clear beside the road, the natural coast and the finished coast must be the same water.
      let moved = 0;
      for (let c = 0; c < world.ground.height.length; c++) {
        if (world.natural.height[c]! <= -0.5 && world.ground.height[c]! > 0) moved++;
      }
      expect(moved, `seed ${world.seed}`).toBe(0);
    }
  });

  it('tilts the ground with the banking: under a banked corner the outside is higher than the inside', () => {
    for (const world of worlds) {
      const winner = world.track.candidates[world.track.winnerIndex]!;
      const { line } = winner;
      // The most steeply banked point of the lap.
      let i = 0;
      for (let k = 0; k < line.count; k++) if (Math.abs(world.road.cross[k]!) > Math.abs(world.road.cross[i]!)) i = k;
      const tilt = world.road.cross[i]!;
      expect(Math.abs(tilt), `seed ${world.seed}`).toBeGreaterThan(0.05);
      const at = (lateral: number): number => {
        // Right of the direction of travel is (-tz, tx) on the map.
        const x = line.x[i]! - line.tz[i]! * lateral;
        const z = line.z[i]! + line.tx[i]! * lateral;
        return sampleField(world.ground, x, z, 0);
      };
      // 4 m either side of the centre the ground differs by 8 m of tilt, as the road does.
      expect(at(4) - at(-4), `seed ${world.seed}`).toBeCloseTo(8 * tilt, 1);
    }
  });

  it('stands every barrier on ground that follows the road: its foot is buried, its top well clear', () => {
    for (const world of worlds) {
      const { positions } = world.road.barriers;
      let buried = 0;
      let clear = 0;
      for (let v = 0; v < positions.length; v += 3 * 7) {
        const above = positions[v + 1]! - sampleField(world.ground, positions[v]!, positions[v + 2]!, 0);
        // Every vertex is either at the foot (a little under the ground) or at the top (most of a metre over it).
        if (above < 0) {
          // The footing is 0.6 m; at least a third of it must still be in the ground everywhere.
          expect(above, `seed ${world.seed}`).toBeLessThan(-0.2);
          expect(above, `seed ${world.seed}`).toBeGreaterThan(-0.9);
          buried++;
        } else {
          expect(above, `seed ${world.seed}`).toBeGreaterThan(0.7);
          // At the top of a steep bank the ground on the wall's outer side has already begun to fall away.
          expect(above, `seed ${world.seed}`).toBeLessThan(1.7);
          clear++;
        }
      }
      expect(buried).toBeGreaterThan(100);
      expect(clear).toBeGreaterThan(100);
    }
  });

  it('grows no grass on the road', () => {
    for (const world of worlds) {
      const winner = world.track.candidates[world.track.winnerIndex]!;
      const { size, cell, origin } = world.ground;
      for (let i = 0; i < winner.line.count; i += 3) {
        const c = Math.round((winner.line.z[i]! - origin) / cell) * size + Math.round((winner.line.x[i]! - origin) / cell);
        expect(world.cover.grass[c], `seed ${world.seed} sample ${i}`).toBe(0);
      }
    }
  });
});
