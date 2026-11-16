import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { STEER_STEPS } from '../input';
import { driftSteps, NO_DRIFT, pathTurn, stepDrift, tierOf, type DriftAsk, type DriftState } from './drift';

const car = config.car;
const steps = driftSteps(car, config.sim.stepsPerSecond);
const top = car.engine.topSpeed;

/** What is asked on one step: by default the button down, full stick right, no brake, 20 m/s, four wheels down, nothing hit. */
function ask(change: Partial<DriftAsk> = {}): DriftAsk {
  return { button: true, steer: 1, brake: 0, speed: 20, wheelsDown: 4, hit: null, ...change };
}
const UP = ask({ button: false, steer: 0 });

/** Runs the rules over a list of asks, from a state. */
function run(from: DriftState, asks: DriftAsk[]): DriftState {
  return asks.reduce((state, asked) => stepDrift(state, asked, car, steps), from);
}
const times = (count: number, asked: DriftAsk): DriftAsk[] => Array.from({ length: count }, () => asked);

/** A slide to the right that has lasted `count` steps (the button pressed on the first of them). */
const slidFor = (count: number, change: Partial<DriftAsk> = {}): DriftState => run(NO_DRIFT, times(count, ask(change)));

describe('driftSteps: every time in whole steps, worked out once', () => {
  it('turns the starting values into steps at 60 a second', () => {
    expect(steps).toEqual({ hop: 9, swing: 15, recover: 12, tiers: [60, 120, 180], boosts: [30, 60, 96] });
  });
});

describe('stepDrift', () => {
  describe('rule 1: the start', () => {
    it('starts at 40% of top speed (12.0 m/s) and not at 11.9', () => {
      expect(car.drift.startSpeed * top).toBeCloseTo(12, 12);
      expect(stepDrift(NO_DRIFT, ask({ speed: 12 }), car, steps).phase).toBe('slide');
      expect(stepDrift(NO_DRIFT, ask({ speed: 11.9 }), car, steps).phase).toBe('none');
    });

    it('hops without the stick, and the hop lasts 9 steps, drawn', () => {
      const hop = stepDrift(NO_DRIFT, ask({ steer: 0 }), car, steps);
      expect(hop.phase).toBe('hop');
      expect(hop.hopLeft).toBe(9);
      expect(hop.slide).toBe(0);
      expect(hop.dir).toBe(0);
    });

    it('starts the slide at once with the stick 0.3 or more over, to that side', () => {
      const right = stepDrift(NO_DRIFT, ask({ steer: 39 / STEER_STEPS }), car, steps);
      expect(right).toMatchObject({ phase: 'slide', dir: 1, charge: 1, hopLeft: 9 });
      expect(stepDrift(NO_DRIFT, ask({ steer: -1 }), car, steps)).toMatchObject({ phase: 'slide', dir: -1 });
      // A stick of 38 steps is 0.299 of full: not enough.
      expect(stepDrift(NO_DRIFT, ask({ steer: 38 / STEER_STEPS }), car, steps).phase).toBe('hop');
    });

    it('starts the slide on the hop\'s ninth step if the stick arrives then, and not on the tenth', () => {
      const ninth = run(NO_DRIFT, [...times(8, ask({ steer: 0 })), ask()]);
      expect(ninth).toMatchObject({ phase: 'slide', dir: 1, hopLeft: 1 });
      const tenth = run(NO_DRIFT, [...times(9, ask({ steer: 0 })), ask()]);
      expect(tenth.phase).toBe('none');
      expect(tenth.hopLeft).toBe(0);
    });

    it('once the hop has ended, does nothing more until the button is let go and pressed again', () => {
      const ended = run(NO_DRIFT, [...times(9, ask({ steer: 0 })), ...times(30, ask())]);
      expect(ended.phase).toBe('none');
      const again = run(ended, [UP, ask()]);
      expect(again.phase).toBe('slide');
    });

    it('does not start while reversing, or with fewer than two wheels down', () => {
      expect(stepDrift(NO_DRIFT, ask({ speed: -15 }), car, steps).phase).toBe('none');
      expect(stepDrift(NO_DRIFT, ask({ wheelsDown: 1 }), car, steps).phase).toBe('none');
      expect(stepDrift(NO_DRIFT, ask({ wheelsDown: 2 }), car, steps).phase).toBe('slide');
    });

    it('starts only on the step the button goes down: held down from before, nothing starts', () => {
      // The button held while too slow, then the car speeds up with it still down.
      const held = run(NO_DRIFT, [ask({ speed: 5 }), ...times(20, ask())]);
      expect(held.phase).toBe('none');
      expect(held.held).toBe(true);
    });
  });

  describe('rule 2: the direction is locked', () => {
    it('keeps its side whatever the stick does', () => {
      const thrown = run(slidFor(10), times(20, ask({ steer: -1 })));
      expect(thrown.phase).toBe('slide');
      expect(thrown.dir).toBe(1);
    });
  });

  describe('rule 3: the slide swings in evenly over 15 steps', () => {
    it('rises by a fifteenth a step to exactly 1', () => {
      expect(slidFor(1).slide).toBeCloseTo(1 / 15, 12);
      expect(slidFor(14).slide).toBeLessThan(1);
      expect(slidFor(15).slide).toBe(1);
      expect(slidFor(40).slide).toBe(1);
    });
  });

  describe('rule 4: pathTurn, how fast the path turns towards the corner', () => {
    it('gives wide with the stick away, tight with it in, and evenly between', () => {
      const right = slidFor(5);
      expect(pathTurn(right, -1, car)).toBeCloseTo(0.25, 12);
      expect(pathTurn(right, 0, car)).toBeCloseTo(0.875, 12);
      expect(pathTurn(right, 1, car)).toBeCloseTo(1.5, 12);
      const left = slidFor(5, { steer: -1 });
      expect(pathTurn(left, 1, car)).toBeCloseTo(0.25, 12);
      expect(pathTurn(left, -1, car)).toBeCloseTo(1.5, 12);
    });
  });

  describe('rule 5: the charge', () => {
    it('goes up by one each step of the slide: tiers on steps 60, 120 and 180 exactly', () => {
      expect(tierOf(slidFor(59).charge, steps)).toBe(0);
      expect(tierOf(slidFor(60).charge, steps)).toBe(1);
      expect(tierOf(slidFor(119).charge, steps)).toBe(1);
      expect(tierOf(slidFor(120).charge, steps)).toBe(2);
      expect(tierOf(slidFor(179).charge, steps)).toBe(2);
      expect(tierOf(slidFor(180).charge, steps)).toBe(3);
      expect(tierOf(slidFor(400).charge, steps)).toBe(3);
    });
  });

  describe('rule 6: the release', () => {
    it('gives boosts of 30, 60 and 96 steps for the three tiers, and none at 59', () => {
      expect(stepDrift(slidFor(59), UP, car, steps)).toMatchObject({ phase: 'none', charge: 0, boostLeft: 0, boostTier: 0 });
      expect(stepDrift(slidFor(60), UP, car, steps)).toMatchObject({ phase: 'none', charge: 0, boostLeft: 30, boostTier: 1 });
      expect(stepDrift(slidFor(120), UP, car, steps)).toMatchObject({ boostLeft: 60, boostTier: 2 });
      expect(stepDrift(slidFor(180), UP, car, steps)).toMatchObject({ boostLeft: 96, boostTier: 3 });
    });

    it('swings the nose back out evenly over 12 steps, keeping the side until it is back', () => {
      const released = stepDrift(slidFor(30), UP, car, steps);
      expect(released.slide).toBeCloseTo(11 / 12, 12);
      expect(released.dir).toBe(1);
      const almost = run(released, times(10, UP));
      expect(almost.slide).toBeGreaterThan(0);
      expect(almost.dir).toBe(1);
      const back = stepDrift(almost, UP, car, steps);
      expect(back.slide).toBe(0);
      expect(back.dir).toBe(0);
    });

    it('keeps the longer boost, with its tier, when one is still running', () => {
      // A tier 3 boost (96 steps from the release step), ten steps on: 86 left.
      const long = run(slidFor(180), times(11, UP));
      expect(long.boostLeft).toBe(86);
      // 60 steps of a new slide take it to 26, the release step to 25: the new tier 1 boost (30) is longer.
      const short = run(long, [...times(60, ask()), UP]);
      expect(short).toMatchObject({ boostLeft: 30, boostTier: 1 });
      // Released at once into a new slide: 96 less 60 less 1 is 35, over the new 30, so the tier 3 boost is kept.
      const kept = run(slidFor(180), [UP, ...times(60, ask()), UP]);
      expect(kept).toMatchObject({ boostLeft: 35, boostTier: 3 });
    });
  });

  describe('rule 7: what cancels a drift, with no boost and the charge lost', () => {
    const tierTwo = (): DriftState => slidFor(130);
    const cancelled = (state: DriftState): void => {
      expect(state.phase).toBe('none');
      expect(state.charge).toBe(0);
      expect(state.boostLeft).toBe(0);
      expect(state.slide).toBeLessThan(1);
    };

    it('touching a wall, the gate, a tree or a rock', () => {
      for (const hit of ['wall', 'gate', 'tree', 'rock'] as const) cancelled(stepDrift(tierTwo(), ask({ hit }), car, steps));
    });

    it('the brake half down or more, but not at 0.49', () => {
      cancelled(stepDrift(tierTwo(), ask({ brake: 128 / 255 }), car, steps));
      cancelled(stepDrift(tierTwo(), ask({ brake: 1 }), car, steps));
      expect(stepDrift(tierTwo(), ask({ brake: 125 / 255 }), car, steps).phase).toBe('slide');
    });

    it('the speed along the line of travel under 30% of top speed (9 m/s)', () => {
      cancelled(stepDrift(tierTwo(), ask({ speed: 8.9 }), car, steps));
      expect(stepDrift(tierTwo(), ask({ speed: 9 }), car, steps).phase).toBe('slide');
    });

    it('during the hop too', () => {
      const hop = stepDrift(NO_DRIFT, ask({ steer: 0 }), car, steps);
      const stopped = stepDrift(hop, ask({ steer: 0, brake: 1 }), car, steps);
      expect(stopped.phase).toBe('none');
      // The hop is drawn to its end.
      expect(stopped.hopLeft).toBe(8);
    });

    it('not by leaving the ground, or by letting go of the throttle (the rules never see it)', () => {
      const flying = run(tierTwo(), times(30, ask({ wheelsDown: 0 })));
      expect(flying.phase).toBe('slide');
      expect(flying.charge).toBe(160);
    });

    it('and nothing restarts while the button stays down', () => {
      const after = run(tierTwo(), [ask({ brake: 1 }), ...times(30, ask())]);
      expect(after.phase).toBe('none');
      expect(after.charge).toBe(0);
    });
  });

  describe('rule 8: the boost', () => {
    it('falls by one a step, on the ground or in the air, and its tier goes when it ends', () => {
      const boosted = stepDrift(slidFor(60), UP, car, steps);
      expect(run(boosted, times(10, ask({ button: false, wheelsDown: 0 }))).boostLeft).toBe(20);
      const spent = run(boosted, times(30, UP));
      expect(spent).toMatchObject({ boostLeft: 0, boostTier: 0 });
      expect(run(boosted, times(29, UP)).boostLeft).toBe(1);
    });

    it('is not ended by the brake', () => {
      const boosted = stepDrift(slidFor(60), UP, car, steps);
      expect(stepDrift(boosted, ask({ button: false, brake: 1 }), car, steps).boostLeft).toBe(29);
    });
  });

  it('remembers whether the button was down', () => {
    expect(stepDrift(NO_DRIFT, ask({ speed: 0 }), car, steps).held).toBe(true);
    expect(stepDrift(NO_DRIFT, UP, car, steps).held).toBe(false);
  });

  it('leaves a car with nothing pressed exactly as it was', () => {
    expect(stepDrift(NO_DRIFT, UP, car, steps)).toEqual(NO_DRIFT);
  });
});
