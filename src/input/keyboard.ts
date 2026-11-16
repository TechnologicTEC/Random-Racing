import type { RawInput } from '../sim/input';

/**
 * The keys that drive the car, by `KeyboardEvent.code`: the place of the key
 * on the keyboard, not the letter printed on it, so W, A, S and D sit in the
 * same place on any layout.
 */
const THROTTLE = ['KeyW', 'ArrowUp'];
const BRAKE = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const DRIFT = ['Space', 'ShiftLeft', 'ShiftRight'];
const RESET = ['KeyR'];

/**
 * What the keys held ask of the car (the brief's controls table). A key is
 * all or nothing, and nothing is smoothed (brief: input must feel instant).
 * Left and right held together cancel out.
 *
 * @param held the `code` of every key down now
 */
export function keysToInput(held: ReadonlySet<string>): Required<RawInput> {
  const any = (codes: string[]): boolean => codes.some((code) => held.has(code));
  return {
    throttle: any(THROTTLE) ? 1 : 0,
    brake: any(BRAKE) ? 1 : 0,
    steer: (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0),
    drift: any(DRIFT),
    reset: any(RESET),
  };
}
