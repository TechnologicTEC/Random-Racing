import type { RawInput } from '../sim/input';

/**
 * Two devices' readings as one, so the keyboard and a controller can both be
 * used: the harder press of each pedal, the steering further from the middle,
 * and a button pressed if either presses it.
 */
export function mergeInputs(a: RawInput, b: RawInput): Required<RawInput> {
  const steerA = a.steer ?? 0;
  const steerB = b.steer ?? 0;
  return {
    throttle: Math.max(a.throttle ?? 0, b.throttle ?? 0),
    brake: Math.max(a.brake ?? 0, b.brake ?? 0),
    // Equally far each way: the one to the right, so the answer does not depend on which device is which.
    steer: Math.abs(steerA) > Math.abs(steerB) ? steerA : Math.abs(steerB) > Math.abs(steerA) ? steerB : Math.max(steerA, steerB),
    drift: Boolean(a.drift || b.drift),
    reset: Boolean(a.reset || b.reset),
  };
}
