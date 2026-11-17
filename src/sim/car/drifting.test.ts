import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { hold } from '../../testing/simDriving';
import { flatGround, poseOn, stepGround, wallGround } from '../../testing/testGrounds';
import type { RawInput } from '../input';
import { loadRapier, type Rapier } from '../physics/rapier';
import { rotate } from '../quat';
import { createSimOn, type CarState, type Sim } from '../sim';
import { NO_DRIFT, type DriftState } from './drift';

let rapier: Rapier;
beforeAll(async () => {
  rapier = await loadRapier();
});

const car = config.car;
const { topSpeed, shed } = car.engine;
const perSecond = config.sim.stepsPerSecond;
const boostTop = topSpeed * car.boost.speed;
const DEGREE = Math.PI / 180;

const FORWARD = { x: 0, y: 0, z: -1 };
const flatSpeed = (state: CarState): number => Math.hypot(state.velocity.x, state.velocity.z);
/** The compass angle of the way the car travels on the map, and of its nose. Turning right makes both smaller. */
const travelAngle = (state: CarState): number => Math.atan2(-state.velocity.x, -state.velocity.z);
const noseAngle = (state: CarState): number => {
  const nose = rotate(state.rotation, FORWARD);
  return Math.atan2(-nose.x, -nose.z);
};
const wrap = (angle: number): number => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));

/** The flat ground, with the car at rest 50 m behind its middle: room for the run-up and the widest slide (240 m across). */
function newSim(): Sim {
  const ground = flatGround();
  return createSimOn(rapier, ground.course, config, poseOn(ground, 0, 50, { x: 0, z: -1 }, config));
}

/** Up to top speed in a straight line: 9 s of full throttle. */
function atTopSpeed(): Sim {
  const sim = newSim();
  hold(sim, { throttle: 1 }, 9);
  return sim;
}

/** Steps a sim `count` times with the same thing pressed, giving each state. */
function steps(sim: Sim, pressed: RawInput, count: number): CarState[] {
  const states: CarState[] = [];
  hold(sim, pressed, count / perSecond, (state) => states.push(state));
  return states;
}

/**
 * A slide begun at top speed to one side (the stick fully over on the step the button goes down), then held with
 * the stick at `steer`, for `count` steps in all.
 */
function slide(sim: Sim, dir: -1 | 1, steer: number, count: number): CarState[] {
  return [...steps(sim, { throttle: 1, drift: true, steer: dir }, 1), ...steps(sim, { throttle: 1, drift: true, steer }, count - 1)];
}

const mean = (list: number[]): number => list.reduce((a, b) => a + b, 0) / list.length;

describe('a slide on the flat at top speed', () => {
  for (const dir of [1, -1] as const) {
    const side = dir === 1 ? 'right' : 'left';
    for (const { name, steer, radius } of [
      { name: 'stick into the corner', steer: dir, radius: car.drift.radius.tight },
      { name: 'stick in the middle', steer: 0, radius: car.drift.radius.middle },
      { name: 'stick away from the corner', steer: -dir, radius: car.drift.radius.wide },
    ]) {
      it(`goes round a circle of ${radius} m, within 5%, sliding ${side} with the ${name}`, () => {
        const sim = atTopSpeed();
        slide(sim, dir, steer, 3 * perSecond);
        const settled = slide(sim, dir, steer, perSecond).slice(1);
        const measured = mean(settled.map((state) => flatSpeed(state) / Math.abs(state.spin.y)));
        expect(measured).toBeGreaterThan(radius * 0.95);
        expect(measured).toBeLessThan(radius * 1.05);
        // It turns the way of the slide: right is clockwise seen from above.
        for (const state of settled) expect(Math.sign(state.spin.y)).toBe(-dir);
        sim.free();
      });
    }

    it(`points its nose 15 degrees inside its line of travel, within 1 degree, once swung in (${side})`, () => {
      const sim = atTopSpeed();
      slide(sim, dir, 0, perSecond);
      for (const state of slide(sim, dir, 0, perSecond).slice(1)) {
        // Inside a right-hand corner the nose points right of the line of travel: a smaller angle.
        const inside = wrap(travelAngle(state) - noseAngle(state)) * dir;
        expect(Math.abs(inside - car.drift.angle)).toBeLessThan(DEGREE);
      }
      sim.free();
    });

    it(`never turns its path away from the corner by more than 1 degree as the slide starts (${side})`, () => {
      const sim = atTopSpeed();
      const before = travelAngle(sim.state());
      let worst = 0;
      for (const state of slide(sim, dir, -dir, perSecond)) worst = Math.min(worst, wrap(before - travelAngle(state)) * dir);
      expect(worst).toBeGreaterThan(-DEGREE);
      sim.free();
    });
  }

  it('keeps 97% of top speed or more in the tightest slide', () => {
    const sim = atTopSpeed();
    const states = slide(sim, 1, 1, 4 * perSecond);
    for (const state of states) expect(flatSpeed(state)).toBeGreaterThanOrEqual(0.97 * topSpeed);
    sim.free();
  });
});

describe('a slide at a lower speed', () => {
  it('follows the same circles at 20 m/s as at top speed: speed does not tighten it (Tane, 2026-11-17)', () => {
    for (const { steer, radius } of [
      { steer: 1, radius: car.drift.radius.tight },
      { steer: 0, radius: car.drift.radius.middle },
      { steer: -1, radius: car.drift.radius.wide },
    ]) {
      const sim = newSim();
      hold(sim, { throttle: 1 }, 3.5);
      // Throttle 0.67 makes for 20 m/s and holds there.
      slide(sim, 1, steer, 1);
      hold(sim, { throttle: 0.67, drift: true, steer }, 3);
      const settled = steps(sim, { throttle: 0.67, drift: true, steer }, perSecond);
      const speed = mean(settled.map(flatSpeed));
      expect(speed).toBeGreaterThan(18);
      expect(speed).toBeLessThan(22);
      const measured = mean(settled.map((state) => flatSpeed(state) / Math.abs(state.spin.y)));
      expect(measured).toBeGreaterThan(radius * 0.95);
      expect(measured).toBeLessThan(radius * 1.05);
      sim.free();
    }
  });
});

describe('the boost', () => {
  /** Slides for `count` steps with the stick in the middle, lets go and drives on at full throttle for 4 s. */
  function release(count: number): { atRelease: CarState; after: CarState[] } {
    const sim = atTopSpeed();
    const sliding = slide(sim, 1, 0, count);
    const after = steps(sim, { throttle: 1 }, 4 * perSecond);
    sim.free();
    return { atRelease: sliding[sliding.length - 1]!, after };
  }

  it('after a 2.1 s slide: over 30 m/s on the next step, 39 within 0.4 s, held there to its last step, back under 30.1 within 1.2 s more, never over 39', () => {
    const { after } = release(Math.round(2.1 * perSecond));
    const boostSteps = Math.round(car.drift.boosts[1] * perSecond);
    expect(after[0]!.drift.boostLeft).toBeGreaterThan(0);
    expect(flatSpeed(after[0]!)).toBeGreaterThan(topSpeed);
    const reached = after.findIndex((state) => flatSpeed(state) >= boostTop - 1e-6);
    expect(reached).toBeGreaterThanOrEqual(0);
    expect(reached + 1).toBeLessThanOrEqual(0.4 * perSecond);
    for (const state of after.slice(reached, boostSteps)) expect(flatSpeed(state)).toBeGreaterThan(boostTop * 0.99);
    const back = after.findIndex((state, i) => i >= boostSteps && flatSpeed(state) < topSpeed + 0.1);
    expect(back).toBeGreaterThanOrEqual(0);
    expect(back + 1 - boostSteps).toBeLessThanOrEqual(1.2 * perSecond);
    // The physics engine rounds the speed held at 39 by a few millionths of a m/s either way (measured: 38.9999853 to 39.0000027).
    for (const state of after) expect(flatSpeed(state)).toBeLessThanOrEqual(boostTop + 1e-5);
  });

  for (const tier of [1, 2, 3] as const) {
    const boostSteps = Math.round(car.drift.boosts[tier - 1] * perSecond);
    it(`raises the top speed on exactly ${boostSteps} steps for tier ${tier}, and sheds ${shed} m/s2 afterwards`, () => {
      const { after } = release(Math.round(car.drift.tiers[tier - 1] * perSecond));
      const boosted = after.filter((state) => state.drift.boostLeft > 0);
      expect(boosted).toHaveLength(boostSteps);
      expect(after.slice(0, boostSteps).every((state) => state.drift.boostLeft > 0 && state.drift.boostTier === tier)).toBe(true);
      // At boost speed on its last step; one step on it has slowed by the shed, and no more.
      expect(flatSpeed(after[boostSteps - 1]!)).toBeGreaterThan(boostTop * 0.99);
      const lost = flatSpeed(after[boostSteps - 1]!) - flatSpeed(after[boostSteps]!);
      expect(lost).toBeGreaterThan((shed / perSecond) * 0.99);
      expect(lost).toBeLessThan((shed / perSecond) * 1.01);
    });
  }

  it('gives nothing for a slide let go before the first tier', () => {
    const { after } = release(Math.round(car.drift.tiers[0] * perSecond) - 1);
    expect(after[0]!.drift.boostLeft).toBe(0);
    for (const state of after) expect(flatSpeed(state)).toBeLessThanOrEqual(topSpeed + 1e-6);
  });
});

describe('what the car reads out about the drift', () => {
  it('gives the phase, side, tier, slide angle, hop and boost, for drawing', () => {
    const sim = atTopSpeed();
    expect(sim.state().drift).toEqual({ phase: 'none', dir: 0, tier: 0, angle: 0, hop: 0, boostLeft: 0, boostTier: 0 });
    const [first] = slide(sim, 1, 1, 1);
    expect(first!.drift).toMatchObject({ phase: 'slide', dir: 1, tier: 0 });
    expect(first!.drift.hop).toBeGreaterThan(0);
    const later = slide(sim, 1, 1, 130).pop()!;
    expect(later.drift).toMatchObject({ phase: 'slide', dir: 1, tier: 2, hop: 0 });
    expect(later.drift.angle).toBeCloseTo(car.drift.angle, 12);
    const [letGo] = steps(sim, { throttle: 1 }, 1);
    expect(letGo!.drift).toMatchObject({ phase: 'none', tier: 0, boostTier: 2 });
    expect(letGo!.drift.boostLeft).toBeCloseTo(car.drift.boosts[1], 12);
    sim.free();
  });
});

describe('the drift state in snapshots and fingerprints', () => {
  const inputs = (step: number): RawInput => ({ throttle: 1, drift: step < 90, steer: step < 1 ? 1 : 0.4 });

  /** Saves a snapshot after `at` steps of the scripted slide, then checks a fresh sim restored from it carries on exactly. */
  function carriesOn(at: number): void {
    const sim = atTopSpeed();
    for (let step = 0; step < at; step++) steps(sim, inputs(step), 1);
    const saved = sim.snapshot();
    const atSave = sim.hash();
    const driftAtSave = sim.state().drift;
    for (let step = at; step < 200; step++) steps(sim, inputs(step), 1);
    const through = sim.hash();
    const fresh = newSim();
    fresh.restore(saved);
    expect(fresh.hash()).toBe(atSave);
    expect(fresh.state().drift).toEqual(driftAtSave);
    for (let step = at; step < 200; step++) steps(fresh, inputs(step), 1);
    expect(fresh.hash()).toBe(through);
    sim.free();
    fresh.free();
  }

  it('carries on exactly from a snapshot taken mid-slide', () => {
    carriesOn(40);
  });

  it('carries on exactly from a snapshot taken mid-boost', () => {
    carriesOn(110);
  });

  it('gives a different fingerprint for any difference in the drift state alone', () => {
    const sim = atTopSpeed();
    slide(sim, 1, 0, 70);
    const saved = sim.snapshot();
    const base = sim.hash();
    const drift = saved.car.drift;
    const changes: Array<Partial<DriftState>> = [
      { phase: 'hop' },
      { dir: -1 },
      { charge: drift.charge + 1 },
      { hopLeft: drift.hopLeft + 1 },
      { slide: drift.slide / 2 },
      { boostLeft: drift.boostLeft + 1 },
      { boostTier: 3 },
      { held: !drift.held },
    ];
    for (const change of changes) {
      sim.restore({ ...saved, car: { ...saved.car, drift: { ...drift, ...change } } });
      expect(sim.hash(), JSON.stringify(change)).not.toBe(base);
    }
    sim.restore(saved);
    expect(sim.hash()).toBe(base);
    sim.restore({ ...saved, car: { ...saved.car, drift: NO_DRIFT } });
    expect(sim.state().drift.phase).toBe('none');
    sim.free();
  });
});

describe('what ends a slide on the course', () => {
  it('sliding into a wall met at about 20 degrees ends the slide, with no boost and the charge lost', () => {
    const ground = wallGround();
    // 10 m from the wall, facing 3 degrees to the right of straight ahead, towards it. The slide turns the path on
    // into the wall, which it meets at about 20 degrees after charging the first tier.
    const sim = createSimOn(rapier, ground.course, config, poseOn(ground, ground.wallAt - 10, 0, { x: 0.05234, z: -0.99863 }, config));
    hold(sim, { throttle: 1 }, 2.5);
    const states = [...slide(sim, 1, -1, 1), ...steps(sim, { throttle: 1, drift: true, steer: -1 }, 6 * perSecond)];
    const ended = states.findIndex((state) => state.drift.phase !== 'slide');
    expect(ended).toBeGreaterThan(Math.round(car.drift.tiers[0] * perSecond));
    const before = states[ended - 1]!;
    const at = states[ended]!;
    // It had charged at least one tier, was still fast, and is against the wall.
    expect(before.drift.tier).toBeGreaterThanOrEqual(1);
    expect(flatSpeed(at)).toBeGreaterThan(car.drift.endSpeed * topSpeed);
    expect(at.position.x).toBeGreaterThan(ground.wallAt - 2);
    // The way it came at the wall, a fifth of a second before (on the step of the hit the wall has already turned it).
    const coming = states[ended - Math.round(0.2 * perSecond)]!;
    const angle = Math.atan2(Math.abs(coming.velocity.x), Math.abs(coming.velocity.z)) / DEGREE;
    expect(angle).toBeGreaterThan(15);
    expect(angle).toBeLessThan(25);
    // No boost, then or when the button is let go.
    expect(at.drift).toMatchObject({ phase: 'none', tier: 0, boostLeft: 0 });
    const [letGo] = steps(sim, { throttle: 1 }, 1);
    expect(letGo!.drift.boostLeft).toBe(0);
    sim.free();
  });

  it('flying off a 1 m drop mid-slide and landing does not end it', () => {
    const ground = stepGround();
    const sim = createSimOn(rapier, ground.course, config, ground.start);
    // Up to speed, then a slide begun about 20 m before the edge, its stick away from the corner so it stays on the ground's 60 m width.
    let state = sim.state();
    while (-state.position.z < ground.edge - 20) state = steps(sim, { throttle: 1 }, 1)[0]!;
    const states = [...slide(sim, -1, 1, 1), ...steps(sim, { throttle: 1, drift: true, steer: 1 }, 1.5 * perSecond)];
    expect(states.some((s) => s.wheels.every((wheel) => !wheel.touching))).toBe(true);
    const last = states[states.length - 1]!;
    expect(-last.position.z).toBeGreaterThan(ground.edge + 10);
    expect(last.position.y).toBeLessThan(0);
    expect(states.every((s) => s.drift.phase === 'slide')).toBe(true);
    sim.free();
  });
});
