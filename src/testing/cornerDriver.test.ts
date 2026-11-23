import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import type { CornerSection } from '../gen/types';
import { loadRapier, type Rapier } from '../sim/physics/rapier';
import { createSimOn } from '../sim/sim';
import { driftThroughCorner, driveOut, roadLane, straightLane } from './cornerDriver';
import { hold } from './simDriving';
import { poseOn, wallGround } from './testGrounds';

let rapier: Rapier;
beforeAll(async () => {
  rapier = await loadRapier();
});

/** The wall ground with the car at top speed, heading -z along x = 0 (the wall's face is at x = 30). */
function atSpeed() {
  const ground = wallGround();
  const sim = createSimOn(rapier, ground.course, config, poseOn(ground, 0, 50, { x: 0, z: -1 }, config));
  hold(sim, { throttle: 1 }, 6);
  return { sim, ground };
}

describe('driving out of a corner (driveOut)', () => {
  it('is clean along a lane that keeps clear of the wall', () => {
    const { sim } = atSpeed();
    const run = driveOut(sim, straightLane(0, 10), config, 100, 12);
    sim.free();
    expect(run.clean).toBe(true);
    expect(run.hit).toBeNull();
    expect(run.travelled).toBeGreaterThanOrEqual(100);
  });

  it('is not clean along a lane that runs through the wall, and names the wall', () => {
    const { sim, ground } = atSpeed();
    const run = driveOut(sim, straightLane(ground.wallAt + 20, 100), config, 150, 12);
    sim.free();
    expect(run.clean).toBe(false);
    expect(run.hit).toBe('wall');
  });

  it('is not clean when the car strays further from the lane than it may', () => {
    const { sim } = atSpeed();
    const run = driveOut(sim, straightLane(15, 2), config, 100, 12);
    sim.free();
    expect(run.clean).toBe(false);
    expect(run.offRoad).toBe(true);
  });
});

describe('the speed a road lane allows (roadLane.limit)', () => {
  it('is what 90% of the steering grip holds at the lap tightest point, and less a little before it', { timeout: 60_000 }, () => {
    const world = generateWorld(7, config);
    const { curvature, spacing } = world.track.candidates[world.track.winnerIndex]!.line;
    let tightest = 0;
    for (let i = 0; i < curvature.length; i++) if (Math.abs(curvature[i]!) > Math.abs(curvature[tightest]!)) tightest = i;
    const atIt = roadLane(world, tightest, config).limit!(0, config);
    expect(atIt).toBeCloseTo(Math.sqrt((0.9 * config.car.steer.sideForce) / Math.abs(curvature[tightest]!)), 9);
    // 40 m before it, the driver may be faster by what braking at 0.7 of the brake's strength takes off over 40 m, and no more.
    const before = roadLane(world, tightest - Math.round(40 / spacing), config).limit!(80, config);
    expect(before).toBeGreaterThan(atIt);
    expect(before).toBeLessThanOrEqual(Math.sqrt(atIt * atIt + 2 * 0.7 * config.car.brake.strength * 40) + 1e-9);
  });
});

describe('the holder driving style', () => {
  it('keeps the key into the corner from the drift button to letting go, and drives on out of the corner', { timeout: 60_000 }, () => {
    const world = generateWorld(7, config);
    const corner = world.track.candidates[world.track.winnerIndex]!.sections.find(
      (section) => section.type === 'corner' && (section as CornerSection).kind !== 'kink',
    ) as CornerSection;
    const run = driftThroughCorner(rapier, world, corner, config, { style: 'holder' });
    expect(run.keyChanges).toBe(0);
    if (run.held) expect(run.exitTravelled).toBeGreaterThanOrEqual(100);
  });
});
