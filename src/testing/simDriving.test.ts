import { beforeAll, describe, expect, it } from 'vitest';
import { config, type CarConfig } from '../config';
import { loadRapier, type Rapier } from '../sim/physics/rapier';
import { createSimOn } from '../sim/sim';
import { circleAt, distanceIn, hold, runUp } from './simDriving';
import { flatGround } from './testGrounds';

let rapier: Rapier;
beforeAll(async () => {
  rapier = await loadRapier();
});

const car = config.car;
const top = car.engine.topSpeed;
/** The car at 30 m/s, as it was until 10a-4 (4c measured 95% of it in 3.98 s), and at 53 m/s. */
const slower: CarConfig = { ...car, engine: { ...car.engine, topSpeed: 30 } };
const faster: CarConfig = { ...car, engine: { ...car.engine, topSpeed: 53 } };

describe('runUp: the time and distance from rest to a share of top speed, from the engine sum', () => {
  it('gives 95% of top speed in about 4 s at 30 m/s (4c measured 3.98 s), and 7 s at 53 m/s', () => {
    expect(runUp(slower, 0.95).seconds).toBeCloseTo(3.99, 1);
    expect(runUp(faster, 0.95).seconds).toBeCloseTo(7.05, 1);
  });

  it('below where the engine eases off, is the full push alone', () => {
    const share = 0.5;
    expect(runUp(car, share).seconds).toBeCloseTo((share * top) / car.engine.accel, 12);
    expect(runUp(car, share).metres).toBeCloseTo((share * top) ** 2 / (2 * car.engine.accel), 12);
  });

  it('matches the car on the flat, within a step and a metre', () => {
    for (const share of [0.5, 0.9, 0.97]) {
      const { seconds, metres } = runUp(car, share);
      const sim = createSimOn(rapier, flatGround().course, config, flatGround().start);
      let steps = 0;
      let at = -1;
      let z = 0;
      hold(sim, { throttle: 1 }, seconds + 1, (state) => {
        steps++;
        if (at < 0 && state.speed >= share * top) {
          at = steps / config.sim.stepsPerSecond;
          z = state.position.z;
        }
      });
      expect(Math.abs(at - seconds), `${share}: ${at} s`).toBeLessThan(2 / config.sim.stepsPerSecond);
      expect(Math.abs(-z - metres), `${share}: ${-z} m`).toBeLessThan(1);
      sim.free();
    }
  });

  it('with the throttle part way down, makes for that share of top speed', () => {
    expect(runUp(car, 0.45, 0.5).seconds).toBeGreaterThan(runUp(car, 0.45).seconds);
    expect(runUp(car, 0.5, 0.5).seconds).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('distanceIn: how far the car goes from rest at full throttle in a time', () => {
  it('agrees with runUp, and matches the car on the flat within a metre', () => {
    for (const share of [0.5, 0.95]) expect(distanceIn(car, runUp(car, share).seconds)).toBeCloseTo(runUp(car, share).metres, 9);
    const sim = createSimOn(rapier, flatGround().course, config, flatGround().start);
    hold(sim, { throttle: 1 }, 6);
    expect(Math.abs(-sim.state().position.z - distanceIn(car, 6))).toBeLessThan(1);
    sim.free();
  });
});

describe('circleAt: the full-stick circle at a speed', () => {
  it('is the tightest circle at low speed, speed squared over the side force faster, and the top-speed circle above top speed', () => {
    expect(circleAt(car, 5)).toBeCloseTo(car.steer.minRadius, 12);
    expect(circleAt(car, 15)).toBeCloseTo(Math.max(car.steer.minRadius, 225 / car.steer.sideForce), 12);
    expect(circleAt(car, top)).toBeCloseTo(top ** 2 / car.steer.sideForce, 12);
    expect(circleAt(car, top * 1.15)).toBeCloseTo(top ** 2 / car.steer.sideForce, 12);
  });
});
