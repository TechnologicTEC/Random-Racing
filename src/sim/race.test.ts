import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { crossingShare, raceSteps, startRace, stepRace, type RaceAsk, type RaceState, type RaceTrack } from './race';

const steps = raceSteps(config.sim.race, config.sim.stepsPerSecond);
/** A made-up lap: 1000 m with 10 checkpoints, one every 100 m. */
const TRACK: RaceTrack = { length: 1000, count: 10 };
const NOTHING: RaceAsk = { throttle: 0, before: 996, after: 996, checkpoint: -1 };

/** Steps the race `count` times with the same ask. */
function hold(state: RaceState, ask: RaceAsk, count: number): RaceState {
  for (let i = 0; i < count; i++) state = stepRace(state, ask, TRACK, config.sim.race, steps);
  return state;
}

/** The race just after "go": the countdown run through with nothing pressed. */
const atGo = (): RaceState => hold(startRace(steps), NOTHING, steps.countdown);

/**
 * Drives a made-up car round the lap at `speed` metres a step from `from` metres along it, telling the race which
 * checkpoint it passes as step 8a's progress would: only the next one, and only when the car goes forwards past it.
 * `missed` checkpoints (by lap) are never reported, as if the car cut past them.
 */
function drive(state: RaceState, from: number, speed: number, count: number, missed: { lap: number; checkpoint: number } | null = null): RaceState {
  let along = from;
  let next = 0;
  let lap = 0;
  for (let i = 0; i < count; i++) {
    const before = along;
    let after = along + speed;
    if (after >= TRACK.length) after -= TRACK.length;
    const at = (next * TRACK.length) / TRACK.count;
    const ahead = (((at - before) % TRACK.length) + TRACK.length) % TRACK.length;
    let checkpoint = -1;
    if (ahead <= speed && !(missed && missed.lap === lap && missed.checkpoint === next)) {
      checkpoint = next;
      if (next === 0) lap++;
      next = (next + 1) % TRACK.count;
    }
    state = stepRace(state, { throttle: 1, before, after, checkpoint }, TRACK, config.sim.race, steps);
    along = after;
  }
  return state;
}

describe('raceSteps', () => {
  it('turns the race times into whole steps: a 3 s countdown, the last 0.25 s for the start boost, 2 s finished', () => {
    expect(steps).toEqual({ countdown: 180, startBoostWindow: 15, finishedFor: 120 });
  });
});

describe('crossingShare', () => {
  it('places a crossing inside its step from how far before and after the line the car was', () => {
    expect(crossingShare(299, 301, 300, 1000)).toBe(0.5);
    expect(crossingShare(299, 303, 300, 1000)).toBe(0.25);
  });

  it('wraps round the start line', () => {
    expect(crossingShare(999, 1, 0, 1000)).toBe(0.5);
    expect(crossingShare(998.5, 1, 0, 1000)).toBe(0.6);
  });
});

describe('the countdown', () => {
  it('starts in the countdown with nothing timed', () => {
    const state = startRace(steps);
    expect(state.phase).toBe('countdown');
    expect(state.countdownLeft).toBe(180);
    expect(state.lap).toBe(1);
    expect(state.clock).toBe(0);
    expect(state.laps).toEqual([]);
  });

  it('lasts exactly 180 steps', () => {
    const almost = hold(startRace(steps), NOTHING, 179);
    expect(almost.phase).toBe('countdown');
    expect(almost.countdownLeft).toBe(1);
    const go = stepRace(almost, NOTHING, TRACK, config.sim.race, steps);
    expect(go.phase).toBe('racing');
    expect(go.countdownLeft).toBe(0);
    expect(go.clock).toBe(0);
  });

  it('ignores checkpoints passed before "go"', () => {
    const state = hold(startRace(steps), { throttle: 1, before: 999, after: 1, checkpoint: 0 }, 10);
    expect(state.next).toBe(0);
    expect(state.started).toBe(false);
  });
});

describe('the start boost', () => {
  /** The race at "go" with the throttle first pressed on countdown step `first` (1 to 180) and held from then on. */
  function pressedFrom(first: number, throttle = 1): RaceState {
    let state = hold(startRace(steps), NOTHING, first - 1);
    state = hold(state, { ...NOTHING, throttle }, steps.countdown - first + 1);
    expect(state.phase).toBe('racing');
    return state;
  }

  it.each([166, 170, 180])('is given for a throttle first pressed on step %i of 180', (first) => {
    const state = pressedFrom(first);
    expect(state.pressedOn).toBe(first);
    expect(state.startBoost).toBe(true);
  });

  it.each([1, 100, 165])('is not given for a throttle first pressed on step %i', (first) => {
    expect(pressedFrom(first).startBoost).toBe(false);
  });

  it('is not given when the throttle was pressed early, let go and pressed again in the last 15 steps', () => {
    let state = hold(startRace(steps), NOTHING, 99);
    state = hold(state, { ...NOTHING, throttle: 1 }, 1);
    state = hold(state, NOTHING, 70);
    state = hold(state, { ...NOTHING, throttle: 1 }, 10);
    expect(state.phase).toBe('racing');
    expect(state.pressedOn).toBe(100);
    expect(state.startBoost).toBe(false);
  });

  it('counts the throttle as pressed at half or more, so a trigger resting slightly down does not jump the start', () => {
    expect(config.sim.race.pressed).toBe(0.5);
    let state = hold(startRace(steps), { ...NOTHING, throttle: 0.49 }, 170);
    expect(state.pressedOn).toBe(0);
    state = hold(state, { ...NOTHING, throttle: 0.5 }, 10);
    expect(state.pressedOn).toBe(171);
    expect(state.startBoost).toBe(true);
  });

  it('is never given with nothing pressed, nor changed by the throttle after "go"', () => {
    const state = atGo();
    expect(state.startBoost).toBe(false);
    expect(hold(state, { ...NOTHING, throttle: 1 }, 5).startBoost).toBe(false);
  });
});

describe('laps and times', () => {
  it('times three laps from "go", lap 1 with the run-up to the line, each crossing placed inside its step', () => {
    // 4 m behind the line at 2.5 m a step: the line is crossed 0.6 of the way through step 2, and a lap is 400 steps.
    const state = drive(atGo(), 996, 2.5, 1300);
    expect(state.phase).toBe('finished');
    expect(state.laps).toHaveLength(3);
    expect(state.laps[0]).toBeCloseTo(401.6, 9);
    expect(state.laps[1]).toBeCloseTo(400, 9);
    expect(state.laps[2]).toBeCloseTo(400, 9);
    expect(state.total).toBeCloseTo(1201.6, 9);
  });

  it('gives lap times that add up to the total', () => {
    const state = drive(atGo(), 996, 2.3, 1400);
    expect(state.phase).toBe('finished');
    expect(state.laps[0]! + state.laps[1]! + state.laps[2]!).toBeCloseTo(state.total, 9);
  });

  it('ends a lap half way through a step with a time ending in a half step', () => {
    // 3 m behind the line at 2 m a step: lap 1 is 1003 m, 501.5 steps.
    const state = drive(atGo(), 997, 2, 600);
    expect(state.laps[0]).toBe(501.5);
  });

  it('counts the laps: 1 of 3 at the start, 2 after the first lap', () => {
    const state = drive(atGo(), 996, 2.5, 450);
    expect(state.lap).toBe(2);
    expect(state.phase).toBe('racing');
    expect(state.lapStart).toBeCloseTo(401.6, 9);
  });

  it('does not count a lap that skipped a checkpoint, nor any lap after it', () => {
    // Checkpoint 5 is missed on lap 2: the line is crossed again, but lap 2 never ends.
    const state = drive(atGo(), 996, 2.5, 1300, { lap: 2, checkpoint: 5 });
    expect(state.laps).toHaveLength(1);
    expect(state.lap).toBe(2);
    expect(state.next).toBe(5);
    expect(state.phase).toBe('racing');
  });

  it('splits each lap into three sectors, ending at checkpoints round(n/3) and round(2n/3) and the line', () => {
    expect(config.sim.race.sectors).toBe(3);
    const state = drive(atGo(), 996, 2.5, 1300);
    // 10 checkpoints: the sectors end at checkpoints 3 (300 m) and 7 (700 m).
    expect(state.splits).toHaveLength(9);
    const [a, b, c, d, e, f] = state.splits;
    expect(a).toBeCloseTo(121.6, 9);
    expect(b).toBeCloseTo(160, 9);
    expect(c).toBeCloseTo(120, 9);
    expect(d).toBeCloseTo(120, 9);
    expect(e).toBeCloseTo(160, 9);
    expect(f).toBeCloseTo(120, 9);
    for (let lap = 0; lap < 3; lap++) {
      const sum = state.splits[3 * lap]! + state.splits[3 * lap + 1]! + state.splits[3 * lap + 2]!;
      expect(sum).toBeCloseTo(state.laps[lap]!, 9);
    }
  });

  it('keeps the clock running whatever the car does, a respawn included', () => {
    let state = atGo();
    state = hold(state, { throttle: 0, before: 996, after: 996, checkpoint: -1 }, 30);
    // A respawn puts the car somewhere else: nothing is passed, the clock goes on.
    state = hold(state, { throttle: 0, before: 996, after: 420, checkpoint: -1 }, 1);
    expect(state.clock).toBe(31);
  });
});

describe('finished', () => {
  it('stops the clock at the last crossing, ignores everything after it and counts the steps since', () => {
    // Lap 3 ends 0.6 of the way through step 1202 after "go".
    const done = drive(atGo(), 996, 2.5, 1202);
    expect(done.phase).toBe('finished');
    expect(done.finishedSteps).toBe(0);
    const later = drive(done, 2, 2.5, 500);
    expect(later.laps).toEqual(done.laps);
    expect(later.splits).toEqual(done.splits);
    expect(later.total).toBe(done.total);
    expect(later.lap).toBe(3);
    expect(later.finishedSteps).toBe(500);
    expect(later.finishedSteps >= steps.finishedFor).toBe(true);
  });
});
