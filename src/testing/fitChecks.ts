/**
 * Test helper: the checks that the road sits cleanly in a full-size island on
 * real seeds. Each seed's world is built once, checked, and let go before the
 * next is built, so many seeds can be checked without holding every island at once.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen/generate';
import { bridgedMask } from '../gen/road/bridges';
import { sampleField } from '../gen/world/heightfield';
import { GORGE_SEEDS } from './checkSeeds';

type World = ReturnType<typeof generateWorld>;

/** A full-size world takes 0.4 to 1.2 s; a slow or busy laptop can take several times that. */
const BUILD_TIMEOUT = 60_000;

export function describeCleanFit(title: string, seeds: readonly number[]): void {
  describe(`the road sits cleanly in the island: ${title}`, () => {
    for (const seed of seeds) describeSeed(seed);
  });
}

function describeSeed(seed: number): void {
  describe(`seed ${seed}`, () => {
    let built: World | undefined;
    const world = (): World => built!;
    beforeAll(() => {
      // The full grid, as the game uses.
      built = generateWorld(seed, config);
    }, BUILD_TIMEOUT);
    afterAll(() => {
      built = undefined;
    });

    it('has a valid winner, found without the fallback', () => {
      const { track } = world();
      expect(track.fallback).toBe(false);
      expect(track.candidates[track.winnerIndex]!.violations).toEqual([]);
    });

    it('never lets the ground show through the road', () => {
      expect(world().report.groundThroughRoad).toBe(0);
    });

    it('never leaves the road hanging in the air', () => {
      expect(world().report.roadFloating).toBe(0);
    });

    it('needs no tunnel and no embankment over the limit off its bridges (M6.1), or the road runs through a gorge', () => {
      const { report, track, natural } = world();
      if (GORGE_SEEDS.includes(seed)) {
        // A range stands over the road here, and the road runs through it in a gorge (Tane's choice, step 17).
        expect(report.deepestCut.value).toBeGreaterThan(config.road.maxCut);
        return;
      }
      if (track.character.relief === 'mountain') {
        // Across a mountainside the road's edges are cut deeper and built up higher than its centre: rock cuttings,
        // allowed in C4. The limits hold on the centre line, as the earthworks rule checks them.
        const winner = track.candidates[track.winnerIndex]!;
        const bridged = bridgedMask(winner.bridges, winner.line.count);
        for (let i = 0; i < winner.line.count; i++) {
          const below = sampleField(natural, winner.line.x[i]!, winner.line.z[i]!, 0) - winner.profile.height[i]!;
          expect(below, `sample ${i}`).toBeLessThanOrEqual(config.road.maxCut);
          if (!bridged[i]) expect(-below, `sample ${i}`).toBeLessThanOrEqual(config.road.maxFill);
        }
        return;
      }
      expect(report.deepestCut.value).toBeLessThanOrEqual(config.road.maxCut);
      expect(report.tallestFill.value).toBeLessThanOrEqual(config.road.maxFill);
    });

    it('keeps every bank beside the road gentle enough to stand, or on a mountain seed no steeper than a rock cutting (none beside a bridge)', () => {
      // The sides of a gorge are as steep as the range they are cut into.
      if (GORGE_SEEDS.includes(seed)) return;
      // A road across a mountainside 50 to 90% steep is cut into it; the blend beside it is at most 25 m wide,
      // so there the cutting can be as steep as about 65 degrees.
      const limit = world().track.character.relief === 'mountain' ? 2.2 : 0.9;
      expect(world().report.steepestBank.value).toBeLessThan(limit);
    });

    it('keeps the surf at least 10 m from the road', () => {
      // A metre allows for measuring on the grid. Since the rework a seed may touch the sea along only a stretch
      // or two, so a bay bringing the water in to 10 m is no longer asked for (step 17).
      expect(world().report.nearestWater.value).toBeGreaterThan(config.world.coast.minMargin - 1);
    });

    it('carves the coast after the road is built, without disturbing the road', () => {
      const { track, ground } = world();
      const winner = track.candidates[track.winnerIndex]!;
      for (let i = 0; i < winner.line.count; i += 3) {
        // On the centre line itself, where banking makes no difference to the height.
        const below = winner.profile.height[i]! - sampleField(ground, winner.line.x[i]!, winner.line.z[i]!, 0);
        expect(below, `sample ${i}`).toBeGreaterThan(0.2);
        expect(below, `sample ${i}`).toBeLessThan(0.3);
      }
    });

    it('never lets an embankment spill into the sea: the finished ground is never above the coast limit out on the banks', () => {
      const { natural, ground } = world();
      // Beyond the strip kept clear beside the road, the natural coast and the finished coast must be the same water.
      let moved = 0;
      for (let c = 0; c < ground.height.length; c++) {
        if (natural.height[c]! <= -0.5 && ground.height[c]! > 0) moved++;
      }
      expect(moved).toBe(0);
    });

    it('tilts the ground with the banking: under a banked corner the outside is higher than the inside', () => {
      const { track, road, ground } = world();
      const { line } = track.candidates[track.winnerIndex]!;
      // The most steeply banked point of the lap.
      let i = 0;
      for (let k = 0; k < line.count; k++) if (Math.abs(road.cross[k]!) > Math.abs(road.cross[i]!)) i = k;
      const tilt = road.cross[i]!;
      expect(Math.abs(tilt)).toBeGreaterThan(0.05);
      const at = (lateral: number): number => {
        // Right of the direction of travel is (-tz, tx) on the map.
        const x = line.x[i]! - line.tz[i]! * lateral;
        const z = line.z[i]! + line.tx[i]! * lateral;
        return sampleField(ground, x, z, 0);
      };
      // 4 m either side of the centre the ground differs by 8 m of tilt, as the road does.
      expect(at(4) - at(-4)).toBeCloseTo(8 * tilt, 1);
    });

    it('stands every barrier on ground that follows the road: its foot is buried, its top well clear', () => {
      const { road, ground } = world();
      const { positions } = road.barriers;
      let buried = 0;
      let clear = 0;
      for (let v = 0; v < positions.length; v += 3 * 7) {
        const above = positions[v + 1]! - sampleField(ground, positions[v]!, positions[v + 2]!, 0);
        // Every vertex is either at the foot (a little under the ground) or at the top (most of a metre over it).
        if (above < 0) {
          // The footing is 0.6 m; at least a third of it must still be in the ground everywhere.
          expect(above).toBeLessThan(-0.2);
          expect(above).toBeGreaterThan(-0.9);
          buried++;
        } else {
          // A wall slopes down to the level of the road at each end, which is still a sink above the ground of the verge.
          expect(above).toBeGreaterThan(0.1);
          // At the top of a steep bank the ground on the wall's outer side has already begun to fall away.
          expect(above).toBeLessThan(1.7);
          if (above > 0.7) clear++;
        }
      }
      expect(buried).toBeGreaterThan(100);
      expect(clear).toBeGreaterThan(100);
    });

    it('grows no grass on the road', () => {
      const { track, ground, cover } = world();
      const winner = track.candidates[track.winnerIndex]!;
      const { size, cell, origin } = ground;
      for (let i = 0; i < winner.line.count; i += 3) {
        const c = Math.round((winner.line.z[i]! - origin) / cell) * size + Math.round((winner.line.x[i]! - origin) / cell);
        expect(cover.grass[c], `sample ${i}`).toBe(0);
      }
    });
  });
}
