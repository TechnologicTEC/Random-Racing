import type { CarConfig } from '../../config';

/**
 * The tyres' hold sideways: how much the car's sideways speed changes in one
 * step. All of it is taken off, up to the most the tyres can hold, so the car
 * goes where it points until it is asked for more than that.
 *
 * @param sideSpeed the sideways speed the car would have at the end of the step if the tyres did nothing, in metres per second
 * @param share how many of its wheels are on the ground, from 0 to 1
 * @param dt the length of a step, in seconds
 * @param most the hardest the tyres push sideways, in metres per second per second: `grip.side`, or `drift.grip` in a slide
 */
export function sideGrip(sideSpeed: number, share: number, car: CarConfig, dt: number, most = car.grip.side): number {
  return within(0 - sideSpeed, most * dt * share);
}

/**
 * The tyres' hold on the car's turning: how much the rate it turns at, about
 * its own upright axis, changes in one step. It is brought to the rate wanted,
 * by no more than the tyres can do in a step. With nothing wanted, a car
 * knocked into a spin is straightened up.
 *
 * @param turning how fast the car is turning now, in radians per second
 * @param wanted how fast the steering asks it to turn
 * @param share how many of its wheels are on the ground, from 0 to 1
 * @param most how quickly the tyres can change the turning, in radians per second per second: `grip.turn`, or `drift.turnGrip` in a slide
 */
export function turnGrip(turning: number, wanted: number, share: number, car: CarConfig, dt: number, most = car.grip.turn): number {
  return within(wanted - turning, most * dt * share);
}

/** A change held to no more than `most` either way. */
export function within(change: number, most: number): number {
  return Math.max(0 - most, Math.min(most, change));
}
