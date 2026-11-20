import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { pointOnRing, stickToward } from '../../testing/lineDriver';
import { driveWith, hold } from '../../testing/simDriving';
import { bankedBend, flatGround, kerbGround, poseOn } from '../../testing/testGrounds';
import { PEDAL_STEPS, STEER_STEPS } from '../input';
import { loadRapier, type Rapier } from '../physics/rapier';
import { rotate } from '../quat';
import { createSimOn, type CarState } from '../sim';

let rapier: Rapier;
beforeAll(async () => {
  rapier = await loadRapier();
});

const car = config.car;
const { topSpeed } = car.engine;
const perSecond = config.sim.stepsPerSecond;

const UP = { x: 0, y: 1, z: 0 };
const FORWARD = { x: 0, y: 0, z: -1 };
const roofUp = (state: CarState): number => rotate(state.rotation, UP).y;
const allDown = (state: CarState): boolean => state.wheels.every((wheel) => wheel.touching);
const flatSpeed = (state: CarState): number => Math.hypot(state.velocity.x, state.velocity.z);
/** The way the nose points on the map, in radians. */
const heading = (state: CarState): number => {
  const nose = rotate(state.rotation, FORWARD);
  return Math.atan2(nose.x, -nose.z);
};
/** The middle of the circle the car is on: where its turning and its speed say it is. */
const middleOf = (state: CarState): { x: number; z: number } => ({
  x: state.position.x + state.velocity.z / state.spin.y,
  z: state.position.z - state.velocity.x / state.spin.y,
});

/** The speed the throttle makes for on the straight: the pedal is rounded to its 255 steps. */
const pedalSpeed = (throttle: number): number => (topSpeed * Math.round(throttle * PEDAL_STEPS)) / PEDAL_STEPS;

interface Circle {
  radius: number;
  speed: number;
  /** How far the circle's middle wandered during the lap, in metres. */
  wander: number;
  lowestRoof: number;
  everyWheelDown: boolean;
}

/** Drives on the flat with the stick held, lets the car settle onto its circle, then measures one whole lap of it. */
function circle(throttle: number, steer: number): Circle {
  const ground = flatGround();
  // 300 m ahead of the usual start, so the widest circle stays on the sheet.
  const sim = createSimOn(rapier, ground.course, config, poseOn(ground, 0, -300, { x: 0, z: -1 }, config));
  const pressed = { throttle, steer };
  hold(sim, pressed, 10);
  const settled = sim.state();
  // One lap at the rate it turns; a car that is not turning is watched for 20 s.
  const lap = Math.min(20, (2 * Math.PI) / Math.abs(settled.spin.y));
  const first = middleOf(settled);
  let wander = 0;
  let lowestRoof = 1;
  let everyWheelDown = true;
  const radii: number[] = [];
  const speeds: number[] = [];
  hold(sim, pressed, lap, (state) => {
    const middle = middleOf(state);
    wander = Math.max(wander, Math.hypot(middle.x - first.x, middle.z - first.z));
    lowestRoof = Math.min(lowestRoof, roofUp(state));
    everyWheelDown &&= allDown(state);
    radii.push(flatSpeed(state) / Math.abs(state.spin.y));
    speeds.push(flatSpeed(state));
  });
  sim.free();
  const mean = (list: number[]): number => list.reduce((a, b) => a + b, 0) / list.length;
  return { radius: mean(radii), speed: mean(speeds), wander, lowestRoof, everyWheelDown };
}

describe('steady circles on the flat, full stick', () => {
  for (const { throttle, radius } of [
    { throttle: 0.25, radius: car.steer.minRadius },
    { throttle: 0.5, radius: 15 },
    { throttle: 1, radius: 60 },
  ]) {
    it(`at throttle ${throttle}: a circle of ${radius} m, the same either way, at the straight-line speed, level on four wheels`, () => {
      const right = circle(throttle, 1);
      const left = circle(throttle, -1);
      for (const turn of [right, left]) {
        expect(Math.abs(turn.radius - radius)).toBeLessThan(radius * 0.05);
        expect(turn.wander).toBeLessThan(radius * 0.05);
        expect(Math.abs(turn.speed - pedalSpeed(throttle))).toBeLessThan(pedalSpeed(throttle) * 0.02);
        expect(turn.everyWheelDown).toBe(true);
        expect(turn.lowestRoof).toBeGreaterThan(0.999);
      }
      expect(Math.abs(right.radius - left.radius)).toBeLessThan(radius * 0.01);
    });
  }

  it('with half the stick at top speed, a circle of 120 m', () => {
    const turn = circle(1, 0.5);
    const half = Math.round(0.5 * STEER_STEPS) / STEER_STEPS;
    expect(Math.abs(turn.radius - 120)).toBeLessThan(120 * 0.05);
    // Exactly what 64 steps of 127 ask for, give or take the circle's own measurement.
    expect(turn.radius).toBeCloseTo((topSpeed * topSpeed) / (car.steer.sideForce * half), -1);
  });
});

describe('the steering answers at once', () => {
  it('turns at over 0.4 rad/s one step after the stick moves, at 15 m/s', () => {
    const ground = flatGround();
    const sim = createSimOn(rapier, ground.course, config, ground.start);
    hold(sim, { throttle: 0.5 }, 10);
    expect(sim.state().speed).toBeGreaterThan(14.5);
    expect(Math.abs(sim.state().spin.y)).toBeLessThan(1e-4);
    hold(sim, { throttle: 0.5, steer: 1 }, 1 / perSecond);
    // Right is a negative turn.
    expect(sim.state().spin.y).toBeLessThan(-0.4);
    sim.free();
  });
});

describe('reversing', () => {
  it('with the stick right, backs to the right while the nose swings left', () => {
    const ground = flatGround();
    const sim = createSimOn(rapier, ground.course, config, ground.start);
    hold(sim, { brake: 1 }, 3);
    expect(sim.state().speed).toBeLessThan(-car.reverse.topSpeed * 0.9);
    const before = sim.state();
    hold(sim, { brake: 1, steer: 1 }, 1);
    const after = sim.state();
    // Backwards is +z; the car's right is +x.
    expect(after.position.z).toBeGreaterThan(before.position.z);
    expect(after.position.x - before.position.x).toBeGreaterThan(0.5);
    expect(after.spin.y).toBeGreaterThan(0.5);
    expect(heading(after)).toBeLessThan(heading(before) - 0.3);
    sim.free();
  });
});

describe('the banked bend at top speed', () => {
  it('laps the 70 m ring twice within 1 m of its middle line, at 29 m/s or more, on four wheels', () => {
    const ring = bankedBend();
    const sim = createSimOn(rapier, ring.course, config, ring.start);
    // The car starts at (70, 0) facing -z: it laps the ring turning left.
    const choose = (state: CarState) => ({ throttle: 1, steer: stickToward(state, pointOnRing(ring.radius, state.position, 15, -1), car) });
    driveWith(sim, 8, choose);
    let worstOff = 0;
    let slowest = Infinity;
    let everyWheelDown = true;
    const laps = (2 * (2 * Math.PI * ring.radius)) / topSpeed;
    driveWith(sim, laps, choose, (state) => {
      worstOff = Math.max(worstOff, Math.abs(Math.hypot(state.position.x, state.position.z) - ring.radius));
      slowest = Math.min(slowest, state.speed);
      everyWheelDown &&= allDown(state);
    });
    expect(worstOff).toBeLessThan(1);
    expect(slowest).toBeGreaterThanOrEqual(29);
    expect(everyWheelDown).toBe(true);
    sim.free();
  });
});

describe('crossing a kerb at an angle', () => {
  for (const degrees of [5, 15]) {
    for (const throttle of [0.6, 1]) {
      it(`at ${degrees} degrees and ${pedalSpeed(throttle)} m/s: up the ramp and off the upright face, keeping its heading and its speed, wheels down`, () => {
        const kerb = kerbGround();
        const angle = (degrees * Math.PI) / 180;
        const forward = { x: Math.sin(angle), z: -Math.cos(angle) };
        // 250 m of run-up along the way it faces before the kerb's inside edge.
        const start = poseOn(kerb, kerb.kerbInner - 250 * Math.tan(angle), 0, forward, config);
        const sim = createSimOn(rapier, kerb.course, config, start);
        const states: CarState[] = [];
        let firstOn = -1;
        let lastOn = -1;
        for (let step = 0; step < 30 * perSecond; step++) {
          hold(sim, { throttle }, 1 / perSecond);
          const state = sim.state();
          states.push(state);
          if (state.wheels.some((wheel) => wheel.surface === 'kerb')) {
            if (firstOn < 0) firstOn = step;
            lastOn = step;
          }
          if (lastOn >= 0 && step - lastOn >= perSecond) break;
        }
        sim.free();
        expect(firstOn).toBeGreaterThan(0);
        expect(states.length - 1 - lastOn).toBe(perSecond);
        const before = states[firstOn - 1]!;
        const after = states[states.length - 1]!;
        // At its steady speed when it gets there.
        expect(before.speed).toBeGreaterThan(pedalSpeed(throttle) * 0.98);
        expect(Math.abs(heading(after) - heading(before))).toBeLessThan((3 * Math.PI) / 180);
        const lowest = Math.min(...states.slice(firstOn).map((state) => state.speed));
        expect(lowest).toBeGreaterThan(before.speed * 0.97);
        // No wheel off the ground for 0.2 s or more at a time. (They leave the kerb's outer face one after another, so
        // all four are not down together for a little longer: about 0.3 s at 15 degrees and 30 m/s.)
        for (let wheel = 0; wheel < 4; wheel++) {
          let longest = 0;
          let run = 0;
          for (const state of states.slice(firstOn - perSecond)) {
            run = state.wheels[wheel]!.touching ? 0 : run + 1;
            longest = Math.max(longest, run);
          }
          expect(longest).toBeLessThan(0.2 * perSecond);
        }
      });
    }
  }
});

describe('crossing a kerb from the outside, up its upright face (7d)', () => {
  /**
   * Runs up along the kerb, outside it, turns in towards it to `degrees` from its line, and holds that heading until
   * the car's middle is 10 m from the face along the way it travels; then the stick is let go and the car crosses.
   */
  function crossFace(degrees: number, throttle: number): { before: CarState; states: CarState[]; firstOn: number; lastOn: number } {
    const kerb = kerbGround();
    const face = kerb.kerbInner + config.road.kerbWidth;
    const target = (0 - degrees * Math.PI) / 180;
    // Far enough out for the turn in on the top-speed circle (60 m) and 40 m of straight at that heading.
    const out = 60 * (1 - Math.cos(target)) + 40 * Math.sin(0 - target) + 1;
    const sim = createSimOn(rapier, kerb.course, config, poseOn(kerb, face + out, 90, { x: 0, z: -1 }, config));
    const states: CarState[] = [];
    let before: CarState | null = null;
    let firstOn = -1;
    let lastOn = -1;
    for (let step = 0; step < 40 * perSecond; step++) {
      const state = sim.state();
      const away = (state.position.x - face) / Math.sin(0 - target);
      let steer = 0;
      if (before === null) {
        if (away <= 10 && Math.abs(heading(state) - target) < 0.01) before = state;
        // Up to speed along the kerb for 200 m, then in towards it, holding the heading.
        else if (state.position.z < -110) steer = Math.max(-1, Math.min(1, -4 * (heading(state) - target)));
      }
      hold(sim, { throttle, steer }, 1 / perSecond);
      const next = sim.state();
      states.push(next);
      if (before !== null && next.wheels.some((wheel) => wheel.surface === 'kerb')) {
        if (firstOn < 0) firstOn = states.length - 1;
        lastOn = states.length - 1;
      }
      if (lastOn >= 0 && states.length - 1 - lastOn >= perSecond) break;
    }
    sim.free();
    expect(before, 'it never lined up on the kerb').not.toBeNull();
    expect(firstOn).toBeGreaterThan(0);
    return { before: before!, states, firstOn, lastOn };
  }

  for (const degrees of [5, 20, 30, 45]) {
    for (const throttle of [0.6, 1]) {
      it(`at ${degrees} degrees and ${pedalSpeed(throttle)} m/s: keeps its heading within 3 degrees and its speed within 3%`, () => {
        const { before, states, firstOn, lastOn } = crossFace(degrees, throttle);
        expect(before.speed).toBeGreaterThan(pedalSpeed(throttle) * 0.98);
        const after = states.at(-1)!;
        expect(states.length - 1 - lastOn).toBe(perSecond);
        expect(Math.abs(heading(after) - heading(before))).toBeLessThan((3 * Math.PI) / 180);
        const lowest = Math.min(...states.slice(firstOn).map(flatSpeed));
        expect(lowest).toBeGreaterThan(flatSpeed(before) * 0.97);
        expect(Math.min(...states.map(roofUp))).toBeGreaterThan(0.9);
      });
    }
  }

  it('a slide across the kerb carries on, charging all the way', () => {
    const kerb = kerbGround();
    // Inside the kerb, 3.5 m from where it starts to rise, up to top speed along it; then a slide to the right, tightest
    // circle, which crosses the kerb about 14 m on, up its ramp and off its upright face.
    const sim = createSimOn(rapier, kerb.course, config, poseOn(kerb, kerb.kerbInner - 3.5, 90, { x: 0, z: -1 }, config));
    hold(sim, { throttle: 1 }, 6);
    expect(sim.state().position.z).toBeGreaterThan(-kerb.kerbFrom);
    const states: CarState[] = [];
    hold(sim, { throttle: 1, steer: 1, drift: true }, 1.5, (state) => states.push(state));
    const sliding = states.findIndex((state) => state.drift.phase === 'slide');
    const charge = sim.snapshot().car.drift.charge;
    sim.free();
    expect(sliding).toBeGreaterThanOrEqual(0);
    const slide = states.slice(sliding);
    // It crossed the kerb while sliding, and the slide never stopped or lost its charge.
    expect(slide.some((state) => state.wheels.some((wheel) => wheel.surface === 'kerb'))).toBe(true);
    expect(slide.every((state) => state.drift.phase === 'slide' && state.touch === null)).toBe(true);
    expect(charge).toBe(slide.length);
    expect(slide.at(-1)!.drift.tier).toBeGreaterThanOrEqual(1);
  });
});
