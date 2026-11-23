import type { InputConfig } from '../config';
import type { RawInput } from '../sim/input';
import { padPresses, padToInput } from './gamepad';
import { keysToInput } from './keyboard';
import { mergeInputs } from './merge';

/** The keys that drive the car (`keysToInput`), by `KeyboardEvent.code`. */
export const DRIVING_KEYS: ReadonlySet<string> = new Set([
  'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyR',
]);

/** The keyboard and any controller, read together. */
export interface Devices {
  /** What the driver asks for now: the keys held and the first controller with the standard layout, merged. */
  read(): Required<RawInput>;
  /** Buttons for the page that went down since the last call: the controller's Y (camera), Start (pause) and Back (reset). */
  presses(): { camera: boolean; pause: boolean; reset: boolean };
  /** Counts every key as let go. */
  release(): void;
  /** Stops listening. */
  dispose(): void;
}

/**
 * Listens to the keyboard and polls controllers. A key counts while it is
 * held, but only one pressed while nothing that takes typing or clicks has
 * the focus (a text box, a slider or a button: `wants`). Keys held when the
 * window loses the focus or the page is hidden count as let go.
 *
 * @param wants whether a key press should drive: the page says no outside the driving view
 */
export function createDevices(target: Window, cfg: InputConfig, wants: (event: KeyboardEvent) => boolean): Devices {
  const held = new Set<string>();
  let padWas = { camera: false, pause: false, reset: false };

  const down = (event: KeyboardEvent): void => {
    if (!DRIVING_KEYS.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
    const focus = target.document.activeElement;
    if (focus instanceof HTMLInputElement || focus instanceof HTMLTextAreaElement || focus instanceof HTMLSelectElement || focus instanceof HTMLButtonElement) return;
    if (!wants(event)) return;
    held.add(event.code);
    // Arrows and Space would otherwise scroll the page or press a button.
    event.preventDefault();
  };
  const up = (event: KeyboardEvent): void => {
    held.delete(event.code);
  };
  const release = (): void => held.clear();
  const hidden = (): void => {
    if (target.document.hidden) release();
  };
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', release);
  target.document.addEventListener('visibilitychange', hidden);

  /** The first controller with the standard layout, as plain numbers. */
  const pad = (): { axes: number[]; buttons: number[] } | null => {
    const pads = typeof target.navigator.getGamepads === 'function' ? target.navigator.getGamepads() : [];
    for (const found of pads) {
      if (found && found.connected && found.mapping === 'standard') {
        return { axes: [...found.axes], buttons: found.buttons.map((button) => button.value) };
      }
    }
    return null;
  };

  return {
    read() {
      const keys = keysToInput(held);
      const reading = pad();
      return reading ? mergeInputs(keys, padToInput(reading.axes, reading.buttons, cfg)) : keys;
    },
    presses() {
      const reading = pad();
      const now = reading ? { ...padPresses(reading.buttons), reset: padToInput(reading.axes, reading.buttons, cfg).reset } : { camera: false, pause: false, reset: false };
      const went = { camera: now.camera && !padWas.camera, pause: now.pause && !padWas.pause, reset: now.reset && !padWas.reset };
      padWas = now;
      return went;
    },
    release,
    dispose() {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', release);
      target.document.removeEventListener('visibilitychange', hidden);
    },
  };
}
