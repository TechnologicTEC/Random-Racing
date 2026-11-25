import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { crossingShare, launching, raceSteps, startRace, stepRace, type RaceAsk, type RaceState, type RaceTrack } from './race';

const steps = raceSteps(config.sim.race, config.sim.stepsPerSecond);
/**
 * A made-up lap (M5.4d): 1000 m, the start line at 0 m and lap gates at 200, 400, 600 and 800 m, each open 12 m either
 * side of the centre line; a step may move the car at most 40 m.
 */
const TRACK: RaceTrack = { length: 1000, lines: [0, 200, 400, 600, 800], openings: [12, 12, 12, 12, 12], stride: 40 };
const NOTHING: RaceAsk = { throttle: 0, before: 996, after: 996, off: 0 };

/** Steps the race `count` times with the same ask. */
function hold(state: RaceState, ask: RaceAsk, count: number): RaceState {
  for (let i = 0; i < count; i++) state = stepRace(state, ask, TRACK, config.sim.race, steps);
  return state;
}

/** The race just after "go": the countdown run through with nothing pressed. */
const atGo = (): RaceState => hold(startRace(steps), NOTHING, steps.countdown);

/**
 * Drives a made-up car round the lap at `speed` metres a step from `from` metres along it, on the centre line, except
 * that on lap `wide.lap` (counted by the lines it has gone over) it crosses the line at `wide.at` metres `wide.off`
 * metres off the centre line.
 */
function drive(state: RaceState, from: number, speed: number, count: number, wide: { lap: number; at: number; off: number } | null = null): RaceState {
  let along = from;
  let lap = 0;
  for (let i = 0; i < count; i++) {
    const before = along;
    let after = along + speed;
    if (after >= TRACK.length) {
      after -= TRACK.length;
      lap++;
    }
    const crosses = (at: number): boolean => (before < at && after >= at) || (at === 0 && after < before);
    const off = wide && lap === wide.lap && crosses(wide.at) ? wide.off : 0;
    state = stepRace(state, { throttle: 1, before, after, off }, TRACK, config.sim.race, steps);
    along = after;
  }
  return state;
}

describe('launching (Tane at the sign-off: the start boost did almost nothing)', () => {
  const boosted = (state: RaceState): RaceState => ({ ...state, startBoost: true });

  it('counts the launch in steps: 1 s is 60', () => {
    expect(steps.launch).toBe(config.sim.race.launch.time * config.sim.stepsPerSecond);
    expect(steps.launch).toBe(60);
  });

  it('pushes for the launch from "go" through its last step, only after a boosted start', () => {
    const go = atGo();
    expect(launching(boosted(go), steps)).toBe(true);
    expect(launching(boosted({ ...go, clock: steps.launch - 1 }), steps)).toBe(true);
    expect(launching(boosted({ ...go, clock: steps.launch }), steps)).toBe(false);
    expect(launching(go, steps)).toBe(false);
  });

  it('never pushes in the countdown or once finished', () => {
    expect(launching(boosted(startRace(steps)), steps)).toBe(false);
    expect(launching(boosted({ ...atGo(), phase: 'finished' }), steps)).toBe(false);
  });
});

describe('raceSteps', () => {
  it('turns the race times into whole steps: a 3 s countdown, the last 0.25 s for the start boost, 2 s finished, a 1 s launch', () => {
    expect(steps).toEqual({ countdown: 180, startBoostWindow: 15, finishedFor: 120, launch: 60 });
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
    expect(state.missed).toBe(false);
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

  it('ignores the line crossed before "go"', () => {
    const state = hold(startRace(steps), { throttle: 1, before: 999, after: 1, off: 0 }, 10);
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

  it('ends a sector at every gate and at the line: 5 a lap, adding up to it', () => {
    expect(config.sim.race.sectors).toBe(TRACK.lines.length);
    const state = drive(atGo(), 996, 2.5, 1300);
    expect(state.splits).toHaveLength(15);
    // Lap 1's first sector is timed from "go" with the run-up; every other is 200 m, 80 steps.
    expect(state.splits[0]).toBeCloseTo(81.6, 9);
    for (const split of state.splits.slice(1)) expect(split).toBeCloseTo(80, 9);
    for (let lap = 0; lap < 3; lap++) {
      const sum = state.splits.slice(5 * lap, 5 * lap + 5).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(state.laps[lap]!, 9);
    }
  });

  it('keeps the clock running whatever the car does, a respawn included', () => {
    let state = atGo();
    state = hold(state, { throttle: 0, before: 996, after: 996, off: 0 }, 30);
    // A respawn puts the car back behind where it was: nothing is passed or missed, the clock goes on.
    state = hold(state, { throttle: 0, before: 996, after: 900, off: 0 }, 1);
    expect(state.clock).toBe(31);
    expect(state.missed).toBe(false);
  });
});

describe('a gate missed (M5.4d)', () => {
  it('counts a gate crossed inside its posts however far from the centre line, up to the posts', () => {
    // Gate 2 (400 m) crossed 11.9 m off the centre line on lap 2: inside its 12 m opening, the race goes on.
    const state = drive(atGo(), 996, 2.5, 1300, { lap: 1, at: 400, off: 11.9 });
    expect(state.phase).toBe('finished');
    expect(state.laps).toHaveLength(3);
  });

  it('misses a gate crossed outside its posts, says so, and counts nothing after it until it is driven through', () => {
    // Gate 2 (400 m) crossed 20 m off on lap 1: missed. After 200 steps the car is at 496 m.
    const after = drive(atGo(), 996, 2.5, 200, { lap: 1, at: 400, off: 20 });
    expect(after.missed).toBe(true);
    expect(after.next).toBe(2);
    expect(after.splits).toHaveLength(1);
    // Gates 3 and 4, the line and gate 1 on the way round count nothing; through gate 2 a lap later, the race goes on.
    const later = drive(after, 496, 2.5, 400);
    expect(later.missed).toBe(false);
    expect(later.next).toBe(3);
    expect(later.laps).toHaveLength(0);
    expect(later.splits).toHaveLength(2);
  });

  it('misses a gate the car jumped past (more than a step can go), as across to another stretch of road', () => {
    // 70 steps from 996 m: at 171 m, short of gate 1.
    let state = drive(atGo(), 996, 2.5, 70);
    expect(state.next).toBe(1);
    state = stepRace(state, { throttle: 1, before: 180, after: 260, off: 0 }, TRACK, config.sim.race, steps);
    expect(state.missed).toBe(true);
    expect(state.next).toBe(1);
  });

  it('misses nothing driving backwards past a gate, and counts it when driven forwards again', () => {
    // 70 steps from 996 m: at 171 m, short of gate 1.
    let state = drive(atGo(), 996, 2.5, 70);
    state = stepRace(state, { throttle: 0, before: 201, after: 199, off: 0 }, TRACK, config.sim.race, steps);
    expect(state.missed).toBe(false);
    expect(state.next).toBe(1);
    state = stepRace(state, { throttle: 1, before: 199, after: 201, off: 0 }, TRACK, config.sim.race, steps);
    expect(state.next).toBe(2);
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
