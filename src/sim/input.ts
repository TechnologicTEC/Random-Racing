/**
 * The input record: what the driver is asking for during one step of the
 * simulation. A keyboard and a controller are both turned into this, so the
 * simulation never knows which is in use. It is also what a ghost saves, one
 * record a step, and what multiplayer would send.
 *
 * Every value is a small whole number. Two devices asking for the same thing
 * then give exactly the same record, and a saved record means the same on
 * every computer.
 */
export interface InputRecord {
  /** How far the accelerator is pressed, from 0 to `PEDAL_STEPS`. */
  throttle: number;
  /** How far the brake is pressed, from 0 to `PEDAL_STEPS`. Held at a standstill, it reverses. */
  brake: number;
  /** Steering, from `-STEER_STEPS` (full left) to `STEER_STEPS` (full right). */
  steer: number;
  /** 1 while the drift button is held. */
  drift: 0 | 1;
  /** 1 while the reset button is held. */
  reset: 0 | 1;
}

/** A pedal has this many steps above zero: one byte. */
export const PEDAL_STEPS = 255;
/** Steering has this many steps each way: one signed byte. */
export const STEER_STEPS = 127;

/** Nothing pressed. */
export const NEUTRAL_INPUT: InputRecord = Object.freeze({ throttle: 0, brake: 0, steer: 0, drift: 0, reset: 0 });

/** What a device reads: pedals from 0 to 1, steering from -1 (left) to 1 (right). Anything left out is not pressed. */
export interface RawInput {
  throttle?: number;
  brake?: number;
  steer?: number;
  drift?: boolean;
  reset?: boolean;
}

/** Makes a record from what a device reads, holding each value to its range and rounding it to the nearest step. */
export function makeInput(raw: RawInput): InputRecord {
  return {
    throttle: steps(raw.throttle, 0, PEDAL_STEPS),
    brake: steps(raw.brake, 0, PEDAL_STEPS),
    steer: steps(raw.steer, -1, STEER_STEPS),
    drift: raw.drift ? 1 : 0,
    reset: raw.reset ? 1 : 0,
  };
}

/** A reading between `least` and 1, as a whole number of steps. A missing or broken reading is 0. */
function steps(value: number | undefined, least: number, count: number): number {
  if (value === undefined || Number.isNaN(value)) return 0;
  const held = Math.min(1, Math.max(least, value));
  // Rounded as a size and then given its sign, so left and right round alike; a stick a hair left of centre gives plain zero.
  const size = Math.round(Math.abs(held) * count);
  return held < 0 && size > 0 ? -size : size;
}

/** A record's pedals as fractions from 0 to 1, and its steering from -1 (left) to 1 (right). */
export function inputFractions(input: InputRecord): { throttle: number; brake: number; steer: number } {
  return { throttle: input.throttle / PEDAL_STEPS, brake: input.brake / PEDAL_STEPS, steer: input.steer / STEER_STEPS };
}

/**
 * A record as one whole number of 26 bits, for saving and for fingerprints:
 * the throttle in the lowest byte, then the brake, then the steering (as a
 * signed byte), then the drift and reset buttons. Nothing pressed is 0.
 */
export function packInput(input: InputRecord): number {
  const steer = input.steer < 0 ? input.steer + 256 : input.steer;
  return input.throttle + input.brake * 0x100 + steer * 0x10000 + input.drift * 0x1000000 + input.reset * 0x2000000;
}

/** The record a packed number stands for. */
export function unpackInput(packed: number): InputRecord {
  const steer = Math.floor(packed / 0x10000) % 256;
  return {
    throttle: packed % 256,
    brake: Math.floor(packed / 0x100) % 256,
    steer: steer > STEER_STEPS ? steer - 256 : steer,
    drift: (Math.floor(packed / 0x1000000) % 2) as 0 | 1,
    reset: (Math.floor(packed / 0x2000000) % 2) as 0 | 1,
  };
}
