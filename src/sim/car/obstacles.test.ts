import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { hold } from '../../testing/simDriving';
import { flatGround } from '../../testing/testGrounds';
import type { PlainCourse } from '../course';
import { loadRapier, type Rapier } from '../physics/rapier';
import { rotate, type Quat } from '../quat';
import { createSimOn, type CarState } from '../sim';

let rapier: Rapier;
beforeAll(async () => {
  rapier = await loadRapier();
});

const car = config.car;
const perSecond = config.sim.stepsPerSecond;
const flatSpeed = (state: CarState): number => Math.sqrt(state.velocity.x * state.velocity.x + state.velocity.z * state.velocity.z);
const roofUp = (state: CarState): number => rotate(state.rotation, { x: 0, y: 1, z: 0 }).y;
const spinRate = (state: CarState): number => Math.sqrt(state.spin.x * state.spin.x + state.spin.y * state.spin.y + state.spin.z * state.spin.z);
const inverse = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

/** Whether an upright line at (x, z) passes through the body's box at the height of the body's middle. */
function inside(state: CarState, x: number, z: number): boolean {
  const local = rotate(inverse(state.rotation), { x: x - state.position.x, y: 0, z: z - state.position.z });
  return Math.abs(local.x) < car.body.halfWidth && Math.abs(local.z) < car.body.halfLength && Math.abs(local.y) < car.body.halfHeight;
}

/** A rock on the flat ground, `height` high and `reach` from its middle at the ground, hit as an island's rocks are. */
const rock = (x: number, z: number, height: number, reach: number) => ({ x, y: 0, z, height, reach });

/** The flat ground with things to hit ahead of the start. */
function courseWith(extra: Pick<PlainCourse, 'posts' | 'rocks'>): PlainCourse {
  return { ...flatGround().course, ...extra };
}

/** Drives at `throttle` until the body first touches something, at most 15 s; then on for `after` seconds. */
function runInto(course: PlainCourse, throttle: number, after: number): { before: CarState; hit: CarState; then: CarState[] } {
  const sim = createSimOn(rapier, course, config, flatGround().start);
  let before = sim.state();
  let state = before;
  for (let i = 0; i < 15 * perSecond && state.touch === null; i++) {
    before = state;
    hold(sim, { throttle }, 1 / perSecond);
    state = sim.state();
  }
  expect(state.touch, 'it never touched anything').not.toBeNull();
  const then: CarState[] = [state];
  hold(sim, { throttle }, after, (next) => then.push(next));
  sim.free();
  return { before, hit: state, then };
}

describe('a tree trunk at top speed', () => {
  const post = (x: number) => ({ posts: [{ x, z: -200, radius: config.sim.colliders.trunkRadius.broadleaf, bottom: -1, top: 2.5 }] });

  it('met head on: stops the car within a second, upright, never spinning fast, never inside the trunk', () => {
    const { before, then } = runInto(courseWith(post(0)), 1, 1);
    expect(flatSpeed(before)).toBeGreaterThan(car.engine.topSpeed * 0.97);
    expect(flatSpeed(then.at(-1)!)).toBeLessThan(3);
    expect(Math.min(...then.map(roofUp))).toBeGreaterThanOrEqual(0.95);
    expect(Math.max(...then.map(spinRate))).toBeLessThanOrEqual(6);
    expect(then.some((state) => inside(state, 0, -200))).toBe(false);
  });

  for (const off of [0.5, 0.75]) {
    it(`met ${off} m off centre: upright, never spinning fast, never inside the trunk`, () => {
      const { before, then } = runInto(courseWith(post(off)), 1, 1);
      expect(flatSpeed(before)).toBeGreaterThan(car.engine.topSpeed * 0.97);
      expect(Math.min(...then.map(roofUp))).toBeGreaterThanOrEqual(0.95);
      expect(Math.max(...then.map(spinRate))).toBeLessThanOrEqual(6);
      expect(then.some((state) => inside(state, off, -200))).toBe(false);
    });
  }
});

describe('rocks', () => {
  const clear = config.sim.colliders.rockClear;

  it('a rock lower than the body clears is passed over at 18 and 30 m/s, with nothing touched', () => {
    for (const throttle of [0.6, 1]) {
      const sim = createSimOn(rapier, courseWith({ rocks: [rock(0, -150, clear, 1.5)] }), config, flatGround().start);
      const states: CarState[] = [];
      hold(sim, { throttle }, 12, (state) => states.push(state));
      sim.free();
      expect(states.every((state) => state.touch === null)).toBe(true);
      expect(Math.min(...states.map(roofUp))).toBeGreaterThan(0.999);
      expect(states.at(-1)!.position.z).toBeLessThan(-160);
    }
  });

  // Tane, 7c: a rock the body can reach is an upright post, at least 1 m tall, so it stops the car like a trunk.
  for (const [height, reach] of [
    [0.3, 1.5],
    [0.6, 1.2],
    [1.2, 1],
  ] as const) {
    it(`a rock ${height} m high, met head on at top speed, stops the car like a trunk`, () => {
      const { before, then } = runInto(courseWith({ rocks: [rock(0, -200, height, reach)] }), 1, 1);
      expect(flatSpeed(before)).toBeGreaterThan(car.engine.topSpeed * 0.97);
      expect(then[0]!.touch).toBe('rock');
      expect(flatSpeed(then.at(-1)!)).toBeLessThan(3);
      expect(Math.min(...then.map(roofUp))).toBeGreaterThanOrEqual(0.95);
      expect(Math.max(...then.map(spinRate))).toBeLessThanOrEqual(6);
      expect(then.some((state) => inside(state, 0, -200))).toBe(false);
    });
  }
});
