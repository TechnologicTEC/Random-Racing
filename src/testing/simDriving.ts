/**
 * Test helper: drives a simulation for a while, step by step, so a test can
 * watch what the car does.
 */
import { config, type CarConfig } from '../config';
import { makeInput, type RawInput } from '../sim/input';
import type { CarState, Sim } from '../sim/sim';

const perSecond = config.sim.stepsPerSecond;

/** Steps a sim for some seconds with the same thing pressed, calling `each` after every step. */
export function hold(sim: Sim, pressed: RawInput, seconds: number, each?: (state: CarState) => void): void {
  const input = makeInput(pressed);
  for (let i = 0; i < Math.round(seconds * perSecond); i++) {
    sim.step(input);
    each?.(sim.state());
  }
}

/** Steps a sim for some seconds, asking `choose` what to press before every step from the state the car is in, and calling `each` after it. */
export function driveWith(sim: Sim, seconds: number, choose: (state: CarState) => RawInput, each?: (state: CarState) => void): void {
  let state = sim.state();
  for (let i = 0; i < Math.round(seconds * perSecond); i++) {
    sim.step(makeInput(choose(state)));
    state = sim.state();
    each?.(state);
  }
}

/**
 * How long, and how far, the car takes from rest to `share` of top speed on the flat, from the engine's own sum
 * (`speedChange` in `sim/car/drive.ts`): the full push until it is within `engine.taper` of top speed from its target,
 * then easing evenly to nothing at the target. For sizing tests from the config (step 10a): run-ups, hold times and
 * the length of a test ground. Infinite if the throttle's target is not above the share.
 *
 * @param throttle how far the throttle is down: the car makes for that share of top speed
 */
export function runUp(car: CarConfig, share: number, throttle = 1): { seconds: number; metres: number } {
  const { topSpeed: top, accel, taper } = car.engine;
  const target = throttle * top;
  const wanted = share * top;
  if (wanted >= target) return { seconds: Number.POSITIVE_INFINITY, metres: Number.POSITIVE_INFINITY };
  const full = Math.max(0, target - top * taper);
  if (wanted <= full) return { seconds: wanted / accel, metres: (wanted * wanted) / (2 * accel) };
  // Past `full` the speed closes on the target as an exponential with this time.
  const tau = (top * taper) / accel;
  const gapFrom = target - full;
  const gapTo = target - wanted;
  const easing = tau * Math.log(gapFrom / gapTo);
  return { seconds: full / accel + easing, metres: (full * full) / (2 * accel) + target * easing - tau * (gapFrom - gapTo) };
}

/** The circle full stick turns at a speed, in metres (`turnWanted` in `sim/car/steer.ts`): faster than top speed it keeps the top-speed circle. */
export function circleAt(car: CarConfig, speed: number): number {
  const size = Math.min(Math.abs(speed), car.engine.topSpeed);
  return Math.max(car.steer.minRadius, (size * size) / car.steer.sideForce);
}

/** How far the car goes from rest at full throttle on the flat in `seconds`, from the same sum as `runUp`. */
export function distanceIn(car: CarConfig, seconds: number): number {
  const { topSpeed: top, accel, taper } = car.engine;
  const full = top * (1 - taper);
  const pushing = full / accel;
  if (seconds <= pushing) return (accel * seconds * seconds) / 2;
  const tau = (top * taper) / accel;
  const easing = seconds - pushing;
  return (full * full) / (2 * accel) + top * easing - tau * (top - full) * (1 - Math.exp(-easing / tau));
}
