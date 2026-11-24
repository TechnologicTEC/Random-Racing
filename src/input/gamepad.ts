import type { InputConfig } from '../config';
import type { RawInput } from '../sim/input';

/** The browser's standard controller layout: which button and axis does what. */
const RIGHT_TRIGGER = 7;
const LEFT_TRIGGER = 6;
const RIGHT_BUMPER = 5;
const BACK = 8;
const Y = 3;
const X = 2;
const START = 9;
const LEFT_STICK_ACROSS = 0;

/**
 * What a controller with the standard layout asks of the car (the brief's
 * controls table): the right trigger accelerates, the left brakes and
 * reverses, the left stick steers, the right bumper drifts and Back resets.
 * Nothing is smoothed (brief: input must feel instant).
 *
 * @param axes the pad's axes, from -1 to 1
 * @param buttons how far each button is pressed, from 0 to 1
 */
export function padToInput(axes: readonly number[], buttons: readonly number[], cfg: InputConfig): Required<RawInput> {
  return {
    throttle: buttons[RIGHT_TRIGGER] ?? 0,
    brake: buttons[LEFT_TRIGGER] ?? 0,
    steer: stick(axes[LEFT_STICK_ACROSS] ?? 0, cfg.deadZone),
    drift: (buttons[RIGHT_BUMPER] ?? 0) > 0.5,
    reset: (buttons[BACK] ?? 0) > 0.5,
  };
}

const A = 0;
const B = 1;
const DPAD_UP = 12;
const DPAD_DOWN = 13;
const LEFT_STICK_UP_DOWN = 1;

/**
 * The controller on a menu card (M4.4): the D-pad, or the left stick pushed over half way, moves the choice up and
 * down (a stick's up is negative); A picks it and B goes back.
 */
export function padMenu(axes: readonly number[], buttons: readonly number[]): { up: boolean; down: boolean; confirm: boolean; back: boolean } {
  const upDown = axes[LEFT_STICK_UP_DOWN] ?? 0;
  return {
    up: (buttons[DPAD_UP] ?? 0) > 0.5 || upDown < -0.5,
    down: (buttons[DPAD_DOWN] ?? 0) > 0.5 || upDown > 0.5,
    confirm: (buttons[A] ?? 0) > 0.5,
    back: (buttons[B] ?? 0) > 0.5,
  };
}

/** The controller's buttons that are for the page, not the car: Y changes the camera, Start pauses, X shows or hides the ghost (M5.3b). */
export function padPresses(buttons: readonly number[]): { camera: boolean; pause: boolean; ghost: boolean } {
  return { camera: (buttons[Y] ?? 0) > 0.5, pause: (buttons[START] ?? 0) > 0.5, ghost: (buttons[X] ?? 0) > 0.5 };
}

/**
 * A stick's reading with its dead zone taken out: inside the dead zone it is 0
 * (a stick at rest rarely reads exactly 0), and the rest of its travel is
 * stretched to reach 1 at the end, the same each way.
 */
function stick(value: number, deadZone: number): number {
  const size = Math.abs(value);
  if (size <= deadZone) return 0;
  const stretched = Math.min(1, (size - deadZone) / (1 - deadZone));
  return value < 0 ? -stretched : stretched;
}
