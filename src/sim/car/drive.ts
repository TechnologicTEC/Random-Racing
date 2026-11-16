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
