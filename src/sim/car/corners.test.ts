import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../../gen';
import type { CornerSection, WorldResult } from '../../gen/types';
import { driftThroughCorner, type CornerOptions, type CornerRun } from '../../testing/cornerDriver';
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
/** Every corner of seeds 1 to 20 but the kinks, driven with these options. */
function driveAll(options: Partial<CornerOptions>): CornerRun[] {
  const runs: CornerRun[] = [];
  for (const world of worlds) {
    for (const section of world.track.candidates[world.track.winnerIndex]!.sections) {
      if (section.type !== 'corner' || section.kind === 'kink') continue;
      runs.push(driftThroughCorner(rapier, world, section as CornerSection, config, options));
    }
  }
  return runs;
}

/** The share of the corners the car arrived at (of a kind, or all) whose slide was held on the road. */
function through(runs: CornerRun[], kind?: CornerRun['kind']): number {
  const list = runs.filter((run) => run.arrived && (!kind || run.kind === kind));
  return list.filter((run) => run.held && run.onRoad).length / list.length;
}

const worlds: WorldResult[] = [];
beforeAll(() => {
  for (let seed = 1; seed <= 20; seed++) worlds.push(generateWorld(seed, config));
}, 120_000);

describe('drifting through the corners of real islands, on a keyboard', () => {
  it('holds a slide from 4 m into each corner to 4 m before its end, on the road, through 95 corners in 100, and 9 in 10 of each kind but sweepers, changing key as often as every 0.15 s', { timeout: 300_000 }, () => {
    const runs = driveAll({});
    // The run-up (100 m on grip at full throttle) brings nearly every corner's car to it on the road.
    expect(runs.filter((run) => run.arrived).length).toBeGreaterThan(runs.length * 0.95);
    // Measured in 6h-4 on the final 20 m worlds with circles of 28, 57 and 203 m: 97% in all; hairpins 100%, plain corners
    // 98%, chicanes 96%, sweepers 92% (22, 45 and 160 m gave 94% in all in 6h-1). Tane's first bar, before 6h, was 90% in all.
    expect(through(runs)).toBeGreaterThanOrEqual(0.95);
    expect(through(runs, 'hairpin')).toBeGreaterThanOrEqual(0.9);
    expect(through(runs, 'corner')).toBeGreaterThanOrEqual(0.9);
    expect(through(runs, 'chicane')).toBeGreaterThanOrEqual(0.9);

    // Letting go 4 m before the corner's end with the boost it earned, then 100 m on, braking for what is coming:
    // nothing touched and the car on the road (Tane's second drive: the boost threw the car into walls).
    // Measured: 97% in 6h-4 with the boost of 1.15 at 12 m/s2 and the steering cap; 92% with the old boost in 6h-1.
    const held = runs.filter((run) => run.arrived && run.held && run.onRoad);
    expect(held.filter((run) => run.exitClean).length / held.length).toBeGreaterThanOrEqual(0.95);
  });

  it('holds a slide through 9 in 10 hairpins and plain corners, and 85 in 100 chicanes, for a driver who keeps each key half a second (Tane, 6h-1 and 6h-4)', { timeout: 300_000 }, () => {
    const runs = driveAll({ keyHold: 0.5 });
    // Measured in 6h-4 on the final 20 m worlds: hairpins 100%, plain corners 96%, chicanes 87%, sweepers 4% (the widest
    // are taken on grip). A chicane corner lasts about a second, and this driver holds the key into it for the first half:
    // Tane chose 85% there (6h-4), where a quicker hand pays; the careful driver above still needs 90%. Circles of 30, 61
    // and 218 m gave 84.8% (39 of 46).
    expect(through(runs, 'hairpin')).toBeGreaterThanOrEqual(0.9);
    expect(through(runs, 'corner')).toBeGreaterThanOrEqual(0.9);
    expect(through(runs, 'chicane')).toBeGreaterThanOrEqual(0.85);
  });
});
