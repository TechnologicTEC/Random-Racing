import type { RaceConfig } from '../config';

/**
 * The race's rules (M4.2), as a pure state machine like the drift's: the countdown, the start boost, laps that need
 * every checkpoint, sector times and the finish. Every time is counted in steps, with the moment the car crosses a
 * line placed inside its step by exact sums, so a time is the same on every computer and a replay gives it again.
 * The simulation feeds it each step (M4.2b); the page only draws it.
 */

/** Where the race is: counting down (the car held), racing, or finished. */
export type RacePhase = 'countdown' | 'racing' | 'finished';

/** Everything the race remembers from one step to the next. All of it goes into the fingerprint and the snapshot (M4.2b). */
export interface RaceState {
  phase: RacePhase;
  /** Steps of the countdown still to run; 0 from "go". */
  countdownLeft: number;
  /** The countdown step (1 to its length) on which the throttle was first pressed, 0 if it has not been. */
  pressedOn: number;
  /** Whether the start earned a tier 1 boost; decided at "go". */
  startBoost: boolean;
  /** Steps since "go". It stops on the step the race is finished. */
  clock: number;
  /** The lap being driven, from 1; it stays at the last lap once finished. */
  lap: number;
  /** Whether the car has crossed the start line since "go". Lap 1 is timed from "go", so its run-up counts. */
  started: boolean;
  /** The checkpoint to pass next; only that one counts, so a lap is all of them in order. */
  next: number;
  /** When this lap and this sector began, in steps since "go" (with fractions). */
  lapStart: number;
  sectorStart: number;
  /** The finished laps' times, in steps (with fractions). */
  laps: readonly number[];
  /** Every finished sector's time, in steps (with fractions), lap after lap. */
  splits: readonly number[];
  /** The whole race's time, in steps (with fractions); 0 until finished. */
  total: number;
  /** Steps since the race was finished. */
  finishedSteps: number;
}

/** What the race is told on one step. */
export interface RaceAsk {
  /** The throttle, from 0 to 1, as the input record has it. */
  throttle: number;
  /** Metres along the lap before and after the step (step 8a's `along`). */
  before: number;
  after: number;
  /** The checkpoint passed on this step (step 8a), or -1. */
  checkpoint: number;
}

/** What the race needs to know of the lap: its length in metres and how many checkpoints it has (step 8a). */
export interface RaceTrack {
  length: number;
  count: number;
}

/** The race's times in whole steps. */
export interface RaceSteps {
  countdown: number;
  startBoostWindow: number;
  finishedFor: number;
}

/** Turns the race's times into whole steps, once (`Math.round`), so nothing ever adds up fractions of a second. */
export function raceSteps(cfg: RaceConfig, stepsPerSecond: number): RaceSteps {
  const steps = (seconds: number): number => Math.round(seconds * stepsPerSecond);
  return { countdown: steps(cfg.countdown), startBoostWindow: steps(cfg.startBoostWindow), finishedFor: steps(cfg.finishedFor) };
}

/** A race at the start of its countdown. */
export function startRace(steps: RaceSteps): RaceState {
  return {
    phase: 'countdown',
    countdownLeft: steps.countdown,
    pressedOn: 0,
    startBoost: false,
    clock: 0,
    lap: 1,
    started: false,
    next: 0,
    lapStart: 0,
    sectorStart: 0,
    laps: [],
    splits: [],
    total: 0,
    finishedSteps: 0,
  };
}

/**
 * The share of a step, from 0 to 1, at which a car that went from `before` to `after` metres along a lap of `length`
 * crossed the line `at` metres along it: how far it was from the line before the step over how far it went, both
 * measured forwards round the lap.
 */
export function crossingShare(before: number, after: number, at: number, length: number): number {
  const went = forwards(before, after, length);
  return went > 0 ? forwards(before, at, length) / went : 0;
}

/** The race after one more step. */
export function stepRace(state: RaceState, ask: RaceAsk, track: RaceTrack, cfg: RaceConfig, steps: RaceSteps): RaceState {
  if (state.phase === 'countdown') {
    const on = steps.countdown - state.countdownLeft + 1;
    const pressedOn = state.pressedOn === 0 && ask.throttle >= cfg.pressed ? on : state.pressedOn;
    const countdownLeft = state.countdownLeft - 1;
    if (countdownLeft > 0) return { ...state, countdownLeft, pressedOn };
    const startBoost = pressedOn > steps.countdown - steps.startBoostWindow;
    return { ...state, phase: 'racing', countdownLeft, pressedOn, startBoost };
  }
  if (state.phase === 'finished') return { ...state, finishedSteps: state.finishedSteps + 1 };

  const clock = state.clock + 1;
  if (ask.checkpoint < 0 || ask.checkpoint !== state.next) return { ...state, clock };

  // The moment the car crossed the checkpoint, in steps since "go".
  const at = (ask.checkpoint * track.length) / track.count;
  const crossed = state.clock + crossingShare(ask.before, ask.after, at, track.length);
  const next = (ask.checkpoint + 1) % track.count;

  if (ask.checkpoint === 0 && !state.started) return { ...state, clock, next, started: true };

  if (ask.checkpoint !== 0) {
    if (!endsSector(ask.checkpoint, track.count, cfg.sectors)) return { ...state, clock, next };
    return { ...state, clock, next, splits: [...state.splits, crossed - state.sectorStart], sectorStart: crossed };
  }

  // Back at the line with every checkpoint passed in order: the lap is done.
  const splits = [...state.splits, crossed - state.sectorStart];
  const laps = [...state.laps, crossed - state.lapStart];
  if (laps.length >= cfg.laps) {
    return { ...state, phase: 'finished', clock, next, laps, splits, lapStart: crossed, sectorStart: crossed, total: crossed };
  }
  return { ...state, clock, next, laps, splits, lap: state.lap + 1, lapStart: crossed, sectorStart: crossed };
}

/** Whether checkpoint `k` of `count` ends a sector other than the last: checkpoints round(i * count / sectors). */
function endsSector(k: number, count: number, sectors: number): boolean {
  for (let i = 1; i < sectors; i++) if (Math.round((i * count) / sectors) === k) return true;
  return false;
}

/** Metres forwards from `from` to `to` round a lap of `length`: from 0 up to the length. */
function forwards(from: number, to: number, length: number): number {
  const d = (to - from) % length;
  return d < 0 ? d + length : d;
}
