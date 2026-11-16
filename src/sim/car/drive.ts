import type { CarConfig } from '../../config';
import { within } from './grip';

/**
 * With no pedal pressed: how much the car's speed along itself changes in one
 * step. A rolling car slows gently. A car that is all but still is held by
 * the brake, which takes off whatever speed it has, so it stays put on a slope.
 *
 * @param speed the speed the car would have along itself at the end of the step if left alone (gravity's pull on a slope included), in metres per second; negative backwards
 * @param share how many of its wheels are on the ground, from 0 to 1
 * @param dt the length of a step, in seconds
 */
export function restChange(speed: number, share: number, car: CarConfig, dt: number): number {
  const held = Math.abs(speed) <= car.brake.holdBelow;
  return within(0 - speed, (held ? car.brake.strength : car.engine.coast) * dt * share);
}

/** How far the pedals are pressed, each from 0 to 1. */
export interface Pedals {
  throttle: number;
  brake: number;
}

/**
 * How much the car's speed along its line of travel changes in one step, for
 * what the pedals ask. Worked out from the speed, the pedals and the step's
 * top speed alone, so it keeps nothing from one step to the next.
 *
 * - Above the step's top speed: the car slows by `engine.shed`, or by the brake if that is harder, whatever the pedals, and no further than to top speed (step 6, rule 9).
 * - A boost: the throttle counts as right down, and the engine pushes at `boost.accel` with no easing, never past top speed. The brake still brakes.
 * - No pedal: the car coasts, and is held once it is all but still (`restChange`).
 * - Throttle: the engine makes for top speed, easing off as it nears it. If the car is rolling backwards it is braked first.
 * - Brake: the car is slowed; once it is all but still it reverses. The brake wins over the throttle.
 *
 * While a pedal drives the car below top speed, the engine also makes up a
 * share of what a slope takes or gives (`engine.slopeHelp`), so a climb costs little speed.
 *
 * @param speed the car's speed along its line of travel now, in metres per second; negative backwards
 * @param pull what gravity adds to that speed during the step: negative on a climb
 * @param share how many of its wheels are on the ground, from 0 to 1
 * @param top the top speed for this step: `engine.topSpeed`, raised by a boost
 * @param boosting whether a boost is running
 * @param dt the length of a step, in seconds
 */
export function speedChange(speed: number, pull: number, pedals: Pedals, share: number, top: number, boosting: boolean, car: CarConfig, dt: number): number {
  if (share === 0) return 0;
  const { engine, brake, reverse } = car;
  const coming = speed + pull;
  if (coming > top) return Math.max(top - coming, 0 - Math.max(engine.shed, brake.strength * pedals.brake) * dt * share);
  if (pedals.brake > 0) {
    if (coming > brake.holdBelow) return within(0 - coming, brake.strength * pedals.brake * dt * share);
    // Reversing is driving, seen backwards.
    return (0 - push(0 - speed, reverse.topSpeed * pedals.brake, reverse.topSpeed, reverse.accel, car) * dt - engine.slopeHelp * pull) * share;
  }
  if (boosting) {
    if (coming < 0 - brake.holdBelow) return within(0 - coming, brake.strength * dt * share);
    return Math.min(top - coming, car.boost.accel * dt * share);
  }
  if (pedals.throttle > 0) {
    if (coming < 0 - brake.holdBelow) return within(0 - coming, brake.strength * pedals.throttle * dt * share);
    return (push(speed, top * pedals.throttle, top, engine.accel, car) * dt - engine.slopeHelp * pull) * share;
  }
  return restChange(coming, share, car, dt);
}

/**
 * The engine's push at a speed, making for a target: its full push until the
 * speed is within `engine.taper` of top speed from the target, then evenly
 * less, nothing at the target, and holding back above it, never harder than
 * coasting.
 */
function push(speed: number, target: number, topSpeed: number, accel: number, car: CarConfig): number {
  const share = (target - speed) / (topSpeed * car.engine.taper);
  return Math.max(0 - car.engine.coast, accel * Math.min(1, share));
}
