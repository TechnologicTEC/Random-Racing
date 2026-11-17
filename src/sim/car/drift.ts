import type { CarConfig } from '../../config';

/**
 * Drifting and the boost, as rules on a small state (step 6; every rule is
 * set out in docs/plan/M3-driving.md, "Step 6"). The car's own sums
 * (`car.ts`) read the state for the slide's angle, how fast its path turns
 * and whether a boost runs; this file only says how the state moves on.
 */

/** Where a drift is: none, the hop at its start (before the stick picks a side), or the slide. */
export type DriftPhase = 'none' | 'hop' | 'slide';

/** What the car's body touched on the last physics step that cancels a drift. The ground, road and kerbs never count. */
export type Hit = 'wall' | 'gate' | 'tree' | 'rock' | null;

/** Everything the drift rules remember from one step to the next. All of it goes into the fingerprint and the snapshot. */
export interface DriftState {
  phase: DriftPhase;
  /** The side of the slide: -1 left, 1 right, 0 none. Kept after a slide ends until `slide` is back to 0, since the nose swings back from that side. */
  dir: -1 | 0 | 1;
  /** Steps spent sliding in this drift. */
  charge: number;
  /** Steps of the hop still to draw (it is drawn only). */
  hopLeft: number;
  /** How far the nose has swung into the corner, from 0 to 1. */
  slide: number;
  /** Steps of boost still to run. */
  boostLeft: number;
  /** The tier of the boost running (1 to 3), 0 with none: for the flame. */
  boostTier: 0 | 1 | 2 | 3;
  /** Whether the drift button was down on the last step. */
  held: boolean;
}

export const NO_DRIFT: DriftState = Object.freeze({ phase: 'none', dir: 0, charge: 0, hopLeft: 0, slide: 0, boostLeft: 0, boostTier: 0, held: false });

/** What the rules are told on one step. */
export interface DriftAsk {
  /** Whether the drift button is down. */
  button: boolean;
  /** The stick, from -1 (left) to 1 (right), as the input record has it. */
  steer: number;
  /** The brake, from 0 to 1. */
  brake: number;
  /** The car's speed along its line of travel, in metres per second; negative backwards. */
  speed: number;
  /** How many wheels are on the ground. */
  wheelsDown: number;
  /** What the body touched on the last physics step. */
  hit: Hit;
}

/** The drift's times in whole steps. */
export interface DriftSteps {
  hop: number;
  swing: number;
  recover: number;
  tiers: readonly [number, number, number];
  boosts: readonly [number, number, number];
}

/** Turns the drift's times into whole steps, once (`Math.round`), so nothing ever adds up fractions of a second. */
export function driftSteps(car: CarConfig, stepsPerSecond: number): DriftSteps {
  const steps = (seconds: number): number => Math.round(seconds * stepsPerSecond);
  const { hop, swing, recover, tiers, boosts } = car.drift;
  return {
    hop: steps(hop.time),
    swing: steps(swing),
    recover: steps(recover),
    tiers: [steps(tiers[0]), steps(tiers[1]), steps(tiers[2])],
    boosts: [steps(boosts[0]), steps(boosts[1]), steps(boosts[2])],
  };
}

/** The tier a charge has reached: 0 below the first, then 1 (blue), 2 (orange) and 3 (purple). */
export function tierOf(charge: number, steps: DriftSteps): 0 | 1 | 2 | 3 {
  if (charge >= steps.tiers[2]) return 3;
  if (charge >= steps.tiers[1]) return 2;
  if (charge >= steps.tiers[0]) return 1;
  return 0;
}

/**
 * How tightly the path of a slide curves towards its corner, as one over the
 * radius of its circle (per metre): `radius.wide` with the stick fully away
 * from the corner, `radius.middle` with it in the middle, `radius.tight` with
 * it fully into it, and evenly between (in curve, not radius). The same
 * whatever the speed, so slowing down does not tighten a slide. Steering sets
 * how tight, not which way (brief).
 */
export function pathCurve(state: DriftState, steer: number, car: CarConfig): number {
  const { tight, middle, wide } = car.drift.radius;
  const into = steer * state.dir;
  return into >= 0 ? 1 / middle + (1 / tight - 1 / middle) * into : 1 / middle + (1 / middle - 1 / wide) * into;
}

/** A share within this of 0 or 1 is taken as exactly that, so a slide takes exactly its number of steps to swing in or out. */
const SNAP = 1e-9;

/**
 * The drift state one step on. In this order: a running boost and the hop
 * each count down a step; the drift starts, picks its side, charges or is let
 * go; anything that cancels it does; then the nose swings in (while sliding)
 * or back out (otherwise).
 */
export function stepDrift(state: DriftState, asked: DriftAsk, car: CarConfig, steps: DriftSteps): DriftState {
  const rules = car.drift;
  const top = car.engine.topSpeed;
  let { phase, dir, charge, hopLeft, slide, boostLeft, boostTier } = state;
  const pressed = asked.button && !state.held;
  const side: -1 | 0 | 1 = asked.steer >= rules.steerToStart ? 1 : asked.steer <= 0 - rules.steerToStart ? -1 : 0;
  // A new slide picks up a nose still swinging back on its own side; to the other side, it waits until the nose is back.
  const canSlideTo = (to: -1 | 1): boolean => slide === 0 || dir === to;

  // Rule 8: a boost counts down every step, on the ground or in the air.
  if (boostLeft > 0) {
    boostLeft--;
    if (boostLeft === 0) boostTier = 0;
  }
  if (hopLeft > 0) hopLeft--;

  if (phase === 'none') {
    // Rule 1: the button going down, forwards fast enough, with two wheels or more on the ground.
    if (pressed && asked.speed >= rules.startSpeed * top && asked.wheelsDown >= 2) {
      phase = 'hop';
      hopLeft = steps.hop;
      charge = 0;
    }
  } else if (phase === 'hop' && hopLeft === 0) {
    // The hop ended with no side picked: nothing more until the button is pressed again.
    phase = 'none';
  }

  if (phase === 'hop') {
    if (!asked.button) phase = 'none';
    else if (side !== 0 && canSlideTo(side)) {
      phase = 'slide';
      dir = side;
    }
  } else if (phase === 'slide' && !asked.button) {
    // Rule 6: let go. A boost for the tier reached; the longer of it and any boost still running is kept.
    const tier = tierOf(charge, steps);
    if (tier > 0 && steps.boosts[tier - 1] > boostLeft) {
      boostLeft = steps.boosts[tier - 1];
      boostTier = tier;
    }
    phase = 'none';
    charge = 0;
  }

  // Rule 7: a hit, the brake half down or more, or too slow along the line of travel cancel it, with no boost.
  if (phase !== 'none' && (asked.hit !== null || asked.brake >= rules.brakeCancel || asked.speed < rules.endSpeed * top)) {
    phase = 'none';
    charge = 0;
  }

  // Rules 3 and 5: while sliding the charge builds and the nose swings in; otherwise the nose swings back out.
  if (phase === 'slide') {
    charge++;
    slide = slide + 1 / steps.swing;
    if (slide > 1 - SNAP) slide = 1;
  } else if (slide > 0) {
    slide = slide - 1 / steps.recover;
    if (slide < SNAP) slide = 0;
  }
  if (phase !== 'slide' && slide === 0) dir = 0;

  return { phase, dir, charge, hopLeft, slide, boostLeft, boostTier, held: asked.button };
}
