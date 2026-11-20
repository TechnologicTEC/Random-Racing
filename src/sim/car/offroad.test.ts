import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../../gen';
import { sampleField, worldX, worldZ } from '../../gen/world/heightfield';
import { hold } from '../../testing/simDriving';
import { grassGround, poseOn } from '../../testing/testGrounds';
import { loadRapier, type Rapier } from '../physics/rapier';
import { createSimOn, type CarState } from '../sim';

let rapier: Rapier;
beforeAll(async () => {
  rapier = await loadRapier();
});

const car = config.car;
const { topSpeed } = car.engine;
const perSecond = config.sim.stepsPerSecond;
const THROTTLE = { throttle: 1 };
const AHEAD = { x: 0, z: -1 };
const onAll = (state: CarState, surface: string): boolean => state.wheels.every((wheel) => wheel.surface === surface);

describe('off the road, on the grass test ground', () => {
  const ground = grassGround();
  const grassTop = topSpeed * car.surfaces.grass;

  it('has a top speed of 18 m/s on grass, 40% under the road', () => {
    // On the grass from the start, 100 m past where it begins.
    const sim = createSimOn(rapier, ground.course, config, poseOn(ground, 50, -(ground.grassFrom + 100), AHEAD, config));
    let fastest = 0;
    hold(sim, THROTTLE, 10, (state) => {
      fastest = Math.max(fastest, state.speed);
    });
    const state = sim.state();
    sim.free();
    expect(onAll(state, 'grass')).toBe(true);
    expect(state.top).toBeCloseTo(grassTop, 9);
    expect(state.speed).toBeGreaterThan(grassTop * 0.99);
    expect(fastest).toBeLessThanOrEqual(grassTop * 1.01);
  });

  it('comes down from 30 m/s on the road to under 19 m/s within 1.5 s of all four wheels reaching the grass', () => {
    const sim = createSimOn(rapier, ground.course, config, ground.start);
    let reached = -1;
    let steps = 0;
    // The speed when the first wheel reaches the grass: the front wheels start the slowdown a moment before the rear ones get there.
    let atGrass = 0;
    let after = Infinity;
    hold(sim, THROTTLE, 20, (state) => {
      steps++;
      if (atGrass === 0 && state.wheels.some((wheel) => wheel.surface === 'grass')) atGrass = state.speed;
      if (reached < 0 && onAll(state, 'grass')) reached = steps;
      if (reached >= 0 && steps === reached + Math.round(1.5 * perSecond)) after = state.speed;
    });
    sim.free();
    expect(reached).toBeGreaterThan(0);
    expect(atGrass).toBeGreaterThan(topSpeed * 0.99);
    expect(after).toBeLessThan(19);
  });

  it('holds 24 m/s with two wheels on the road and two on the grass', () => {
    const sim = createSimOn(rapier, ground.course, config, poseOn(ground, 0, 0, AHEAD, config));
    hold(sim, THROTTLE, 25);
    const state = sim.state();
    sim.free();
    // Front left, front right, rear left, rear right.
    expect(state.wheels.map((wheel) => wheel.surface)).toEqual(['road', 'grass', 'road', 'grass']);
    const half = topSpeed * (2 + 2 * car.surfaces.grass) / 4;
    expect(state.top).toBeCloseTo(half, 9);
    expect(state.speed).toBeGreaterThan(half * 0.99);
    expect(state.speed).toBeLessThan(half * 1.01);
  });

  it('boosts to the boost share of the grass top speed (20.7 m/s), and no further', () => {
    const sim = createSimOn(rapier, ground.course, config, poseOn(ground, 50, -(ground.grassFrom + 100), AHEAD, config));
    hold(sim, THROTTLE, 10);
    // A tier 3 boost, given straight to the car's memory.
    const saved = sim.snapshot();
    sim.restore({ ...saved, car: { ...saved.car, drift: { ...saved.car.drift, boostLeft: Math.round(car.drift.boosts[2] * perSecond), boostTier: 3 } } });
    const boosted = grassTop * car.boost.speed;
    let fastest = 0;
    hold(sim, THROTTLE, car.drift.boosts[2] - 0.1, (state) => {
      fastest = Math.max(fastest, state.speed);
    });
    const state = sim.state();
    sim.free();
    expect(state.top).toBeCloseTo(boosted, 9);
    expect(state.speed).toBeGreaterThan(boosted * 0.99);
    expect(fastest).toBeLessThanOrEqual(boosted * 1.001);
  });
});

describe('off the road on seed 7', () => {
  it('reads sand on the beach, and holds the car to the same top speed there', () => {
    const world = generateWorld(7, config);
    const { ground, cover } = world;
    // The middle of a patch of ground wholly under sand, 2 cells each way, above the sea.
    let spot: { x: number; z: number } | null = null;
    for (let iz = 3; iz < ground.size - 3 && !spot; iz++) {
      for (let ix = 3; ix < ground.size - 3 && !spot; ix++) {
        let all = ground.height[iz * ground.size + ix]! > 0.5;
        for (let dz = -2; dz <= 2 && all; dz++) {
          for (let dx = -2; dx <= 2 && all; dx++) {
            const j = (iz + dz) * ground.size + ix + dx;
            all = cover.sand[j] === 255 && cover.snow[j] === 0 && ground.height[j]! > 0.5;
          }
        }
        if (all) spot = { x: worldX(ground, ix), z: worldZ(ground, iz) };
      }
    }
    expect(spot, 'no beach on seed 7').not.toBeNull();
    const height = (x: number, z: number): number => sampleField(ground, x, z, 0);
    const sim = createSimOn(rapier, { kind: 'island', world }, config, poseOn({ height }, spot!.x, spot!.z, AHEAD, config));
    hold(sim, {}, 0.5);
    const standing = sim.state();
    expect(onAll(standing, 'sand')).toBe(true);
    expect(standing.top).toBeCloseTo(topSpeed * car.surfaces.sand, 9);
    // Driven off at full throttle: never faster than that while all four wheels are on the sand.
    const onSand: CarState[] = [];
    hold(sim, THROTTLE, 3, (state) => {
      if (onAll(state, 'sand')) onSand.push(state);
    });
    sim.free();
    expect(onSand.length).toBeGreaterThan(perSecond / 2);
    for (const state of onSand) {
      expect(state.top).toBeCloseTo(topSpeed * car.surfaces.sand, 9);
      expect(state.speed).toBeLessThanOrEqual(state.top * 1.001);
    }
  });
});
