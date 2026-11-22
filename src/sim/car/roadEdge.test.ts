import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { hold } from '../../testing/simDriving';
import { poseOn, roadEdgeGround, runUpTo, type RoadEdgeGround } from '../../testing/testGrounds';
import { loadRapier, type Rapier } from '../physics/rapier';
import { rotate } from '../quat';
import { createSimOn, type CarState } from '../sim';

/**
 * Tane's drive after 10a-4: a hit, or crossing a kerb from the grass even from
 * a standstill, threw the car up and round. 10a-5 found why: on an island the
 * grass beside the road lies `road.sink` (25 cm) under it and the body rides
 * 26 cm up, so from the grass the kerb's outer skirt and the road's own edge
 * are steps at the height of the body, which ran into them. These run on an
 * island's road edge built by the generator's own code (`roadEdgeGround`).
 */
let rapier: Rapier;
let ground: RoadEdgeGround;
beforeAll(async () => {
  rapier = await loadRapier();
  ground = roadEdgeGround();
});

const car = config.car;
const perSecond = config.sim.stepsPerSecond;
const top = car.engine.topSpeed;
const ride = car.body.halfHeight + car.suspension.rideHeight;
const flatSpeed = (state: CarState): number => Math.hypot(state.velocity.x, state.velocity.z);
const roofUp = (state: CarState): number => rotate(state.rotation, { x: 0, y: 1, z: 0 }).y;
const turning = (state: CarState): number => Math.hypot(state.spin.x, state.spin.y, state.spin.z);
/** How far the nose points from straight ahead (-z, along the road and the wall), on the map, in degrees: 0 along it, 180 backwards. */
const heading = (state: CarState): number => {
  const f = rotate(state.rotation, { x: 0, y: 0, z: -1 });
  return (Math.atan2(f.x, -f.z) * 180) / Math.PI;
};
/** How far the body's middle stands above where it rides on the ground under it. */
const rise = (state: CarState): number => state.position.y - ground.height(state.position.x, state.position.z) - ride;
/** The longest time, in seconds, with no wheel on the ground. */
function longestInAir(states: CarState[]): number {
  let longest = 0;
  let run = 0;
  for (const state of states) {
    run = state.wheels.some((wheel) => wheel.touching) ? 0 : run + 1;
    longest = Math.max(longest, run);
  }
  return longest / perSecond;
}
const middle = (stretch: { from: number; to: number }): number => (stretch.from + stretch.to) / 2;

/**
 * From still on the grass, `out` metres beyond the kerb's outer edge (or where it would be), facing the road at
 * `degrees` from its line, full throttle. Gives the states from when the car's middle is 3 m and half its length from
 * the edge's outer side until it is 2 m onto the road and half a second more (at most 8 s: a slow, shallow crossing
 * takes a while).
 */
function grassToRoad(stretch: { from: number; to: number }, degrees: number, out: number): { before: CarState; states: CarState[] } {
  const a = (degrees * Math.PI) / 180;
  const edge = config.road.kerbWidth;
  const x = edge + car.body.halfWidth + out * Math.sin(a);
  const z = 0 - middle(stretch) + out * Math.cos(a);
  const sim = createSimOn(rapier, ground.course, config, poseOn(ground, x, z, { x: 0 - Math.sin(a), z: 0 - Math.cos(a) }, config));
  let before: CarState | null = null;
  const states: CarState[] = [];
  let onRoad = -1;
  for (let step = 0; step < 30 * perSecond && states.length < 8 * perSecond && (onRoad < 0 || states.length - onRoad < 0.5 * perSecond); step++) {
    hold(sim, { throttle: 1 }, 1 / perSecond);
    const state = sim.state();
    if (before === null && state.position.x < edge + 3 + car.body.halfLength) before = state;
    if (before !== null) states.push(state);
    if (onRoad < 0 && state.position.x < -2) onRoad = states.length;
  }
  sim.free();
  expect(before, 'it never reached the road edge').not.toBeNull();
  return { before: before!, states };
}

/** The bars for crossing the road edge from the grass. */
function expectTame(states: CarState[], label: string): void {
  expect(Math.max(...states.map(rise)), `${label}: rise (m)`).toBeLessThan(0.3);
  expect(Math.max(...states.map(turning)), `${label}: turning (rad/s)`).toBeLessThan(4);
  expect(Math.min(...states.map(roofUp)), `${label}: roof-up`).toBeGreaterThan(0.9);
  // The bare edge is the apron, a 25 cm ramp at 40%: from 11 m/s straight up it the front hops for 0.32 s (10a-6). Before
  // 10a-6 the car was in the air 0.48 s there at 26 m/s, and 1.3 s off a kerb.
  expect(longestInAir(states), `${label}: in the air (s)`).toBeLessThan(0.4);
  // Onto the road.
  expect(states.at(-1)!.position.x, `${label}: on the road`).toBeLessThan(0);
}

// Straight on, at 45 and at 20 degrees; from still 2 m out, from 10 m (about 11 m/s), and from far enough out to arrive at the grass's top speed.
const GRASS_TOP = car.engine.topSpeed * car.surfaces.grass;
const FAR = 120;
const CROSSINGS: Array<[number, number]> = [
  [90, 2],
  [90, 10],
  [90, FAR],
  [45, 2],
  [45, FAR],
  [20, 10],
  [20, FAR],
];

describe('from the grass back onto the road, as on an island (10a-6)', () => {
  for (const [degrees, out] of CROSSINGS) {
    it(`over a kerb at ${degrees} degrees from ${out} m out: stays low, level and pointing the way it went`, () => {
      const { before, states } = grassToRoad(ground.stretches.kerb, degrees, out);
      if (out === FAR) expect(flatSpeed(before)).toBeGreaterThan(GRASS_TOP * 0.95);
      expectTame(states, `${degrees} degrees, ${out} m`);
      expect(Math.max(...states.map((state) => Math.abs(heading(state) - heading(before)))), 'turned (degrees)').toBeLessThan(10);
    });
  }

  for (const [degrees, out] of CROSSINGS.filter(([, o]) => o !== 2)) {
    it(`over the bare edge at ${degrees} degrees from ${out} m out: stays low and level`, () => {
      const { states } = grassToRoad(ground.stretches.bare, degrees, out);
      expectTame(states, `bare, ${degrees} degrees, ${out} m`);
    });
  }
});

/**
 * From the road at `degrees` to the edge, full throttle at `throttle` from far enough back to reach 98% of its speed,
 * into the wall in the middle of a stretch. Gives the state on the step before the first touch and every state from
 * the first touch until `seconds` later.
 */
function intoWall(stretch: { from: number; to: number }, degrees: number, throttle: number, seconds: number): { before: CarState; states: CarState[] } {
  const a = (degrees * Math.PI) / 180;
  const run = runUpTo(0.98, 200) + 30;
  const x = -2 - (run - 3) * Math.sin(a);
  const z = 0 - middle(stretch) + run * Math.cos(a);
  const sim = createSimOn(rapier, ground.course, config, poseOn(ground, x, z, { x: Math.sin(a), z: 0 - Math.cos(a) }, config));
  let last = sim.state();
  let before: CarState | null = null;
  const states: CarState[] = [];
  for (let step = 0; step < 40 * perSecond && states.length < seconds * perSecond; step++) {
    hold(sim, { throttle }, 1 / perSecond);
    const state = sim.state();
    if (before === null && state.touch === 'wall') before = last;
    if (before !== null) states.push(state);
    last = state;
  }
  sim.free();
  expect(before, 'it never reached the wall').not.toBeNull();
  return { before: before!, states };
}

/** While touching and for `bump.hold` after the last touch, the turning stays at or under `bump.spin` (the engine's rounding allowed). */
function expectTurningHeld(states: CarState[], label: string): void {
  const holdSteps = Math.round(car.bump.hold * perSecond);
  let since = Infinity;
  let worst = 0;
  for (const state of states) {
    since = state.touch !== null ? 0 : since + 1;
    if (since <= holdSteps) worst = Math.max(worst, turning(state));
  }
  expect(worst, `${label}: turning while held (rad/s)`).toBeLessThanOrEqual(car.bump.spin + 1e-5);
}

// Tane, 10a-6b: 65% of the speed a second after the hit (a 30-degree hit on the bare-edge wall keeps 66 to 69%; the flat
// wall test of step 7b keeps 70% or more, measured 87% at 30 m/s).
describe('hitting a wall beside the road, as on an island (10a-6b)', () => {
  for (const [name, stretch] of [
    ['with a kerb in front of it', 'kerbWall'],
    ['beside a bare edge', 'bareWall'],
  ] as const) {
    for (const degrees of [5, 10, 30]) {
      for (const throttle of [1, 0.6]) {
        it(`${name}, at ${degrees} degrees and ${Math.round(throttle * top)} m/s: low, level, along the wall a second later with 65% of its speed`, () => {
          const { before, states } = intoWall(ground.stretches[stretch], degrees, throttle, 1.5);
          expect(flatSpeed(before)).toBeGreaterThan(throttle * top * 0.95);
          const label = `${name}, ${degrees} degrees`;
          expect(Math.max(...states.map(rise)), `${label}: rise (m)`).toBeLessThan(0.5);
          expect(Math.min(...states.map(roofUp)), `${label}: roof-up`).toBeGreaterThan(0.9);
          expectTurningHeld(states, label);
          const second = states[perSecond]!;
          expect(Math.abs(heading(second)), `${label}: heading a second on (degrees)`).toBeLessThan(10);
          expect(flatSpeed(second), `${label}: speed a second on`).toBeGreaterThanOrEqual(flatSpeed(before) * 0.65);
        });
      }
    }

    it(`${name}, at 60 degrees and top speed: never spun round to face back, low and level`, () => {
      const { states } = intoWall(ground.stretches[stretch], 60, 1, 2);
      expectTurningHeld(states, `${name}, 60 degrees`);
      expect(Math.max(...states.map((state) => Math.abs(heading(state)))), 'heading from the wall line (degrees)').toBeLessThan(100);
      expect(Math.max(...states.map(rise))).toBeLessThan(0.5);
      expect(Math.min(...states.map(roofUp))).toBeGreaterThan(0.9);
    });
  }
});
