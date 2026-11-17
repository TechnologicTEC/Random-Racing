import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../../gen';
import type { CornerSection } from '../../gen/types';
import { driftThroughCorner, type CornerRun } from '../../testing/cornerDriver';
import { loadRapier, type Rapier } from '../physics/rapier';

let rapier: Rapier;
beforeAll(async () => {
  rapier = await loadRapier();
});

/**
 * Tane, 2026-11-17: a player should be able to drift through most of a
 * corner, starting just after the road starts to curve and letting go about
 * when it straightens. Every corner of seeds 1 to 20 (kinks aside), driven as
 * a player on a keyboard can: the key into the corner, no key or the other
 * key, each kept for at least 0.15 s (`src/testing/cornerDriver.ts`).
 */
describe('drifting through the corners of real islands, on a keyboard', () => {
  it('holds a slide from 4 m into each corner to 4 m before its end, on the road, through 9 corners in 10, and every hairpin and plain corner but a few', { timeout: 240_000 }, () => {
    const runs: CornerRun[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const world = generateWorld(seed, config);
      for (const section of world.track.candidates[world.track.winnerIndex]!.sections) {
        if (section.type !== 'corner' || section.kind === 'kink') continue;
        runs.push(driftThroughCorner(rapier, world, section as CornerSection, config));
      }
    }
    const arrived = runs.filter((run) => run.arrived);
    // The run-up (100 m on grip at full throttle) brings nearly every corner's car to it on the road.
    expect(arrived.length).toBeGreaterThan(runs.length * 0.95);
    const through = (kind?: CornerRun['kind']): number => {
      const list = arrived.filter((run) => !kind || run.kind === kind);
      return list.filter((run) => run.held && run.onRoad).length / list.length;
    };
    // Measured 2026-11-17: 95% in all; plain corners 100%, hairpins 100%, chicanes 98%, sweepers 63% (the widest are taken flat out without a slide).
    expect(through()).toBeGreaterThanOrEqual(0.9);
    expect(through('hairpin')).toBeGreaterThanOrEqual(0.9);
    expect(through('corner')).toBeGreaterThanOrEqual(0.9);
    expect(through('chicane')).toBeGreaterThanOrEqual(0.9);
  });
});
