import type { SimConfig } from '../config';
import type { Quat, Vec3 } from '../sim/quat';
import type { Surface } from '../sim/car/surface';
import type { WheelState } from '../sim/car/car';
import type { CarState } from '../sim/sim';

/** What one frame of the page does with the simulation's clock. */
export interface Advance {
  /** How many steps of the simulation to take this frame. */
  steps: number;
  /** Time left over, in seconds, less than one step: it is added to the next frame. */
  carried: number;
  /** How far the moment shown lies between the last two steps' states, from 0 up to, not including, 1. */
  blend: number;
}

/** Just under 1: the largest blend given. */
const LAST_BLEND = 1 - 1e-12;

/**
 * The fixed-step loop (brief: a fixed 60 steps a second, whatever the frame
 * rate). Each frame adds its time to what was carried over and takes one step
 * for every whole step's worth. A long frame (a hidden tab, a stall) takes at
 * most `maxStepsPerFrame` and drops the rest, so the car never races to catch
 * up with time the player did not see.
 *
 * @param carried the time carried over from the last frame, in seconds
 * @param frameSeconds how long this frame took
 */
export function advance(carried: number, frameSeconds: number, cfg: SimConfig): Advance {
  if (!(frameSeconds > 0)) return { steps: 0, carried: Math.max(0, carried), blend: Math.min(LAST_BLEND, Math.max(0, carried * cfg.stepsPerSecond)) };
  const step = 1 / cfg.stepsPerSecond;
  const total = carried + frameSeconds;
  const steps = Math.floor(total / step);
  if (steps > cfg.maxStepsPerFrame) return { steps: cfg.maxStepsPerFrame, carried: 0, blend: 0 };
  const left = Math.max(0, total - steps * step);
  return { steps, carried: left, blend: Math.min(LAST_BLEND, left * cfg.stepsPerSecond) };
}

/**
 * The car as it is drawn between two steps: `blend` of the way from `before`
 * to `after`. Places, speeds and the wheels move in a straight line, and the
 * turn takes the short way round. Anything else (the step count, the input,
 * which wheels touch) is the later state's. A blend of 0 gives `before`'s
 * motion exactly, and 1 gives `after`.
 */
export function blendState(before: CarState, after: CarState, blend: number): CarState {
  if (blend >= 1) return after;
  const t = Math.max(0, blend);
  return {
    ...after,
    position: mix(before.position, after.position, t),
    rotation: t === 0 ? before.rotation : turnBetween(before.rotation, after.rotation, t),
    velocity: mix(before.velocity, after.velocity, t),
    spin: mix(before.spin, after.spin, t),
    speed: before.speed * (1 - t) + after.speed * t,
    wheels: after.wheels.map((wheel, i) => ({ ...wheel, at: mix(before.wheels[i]?.at ?? wheel.at, wheel.at, t) })),
  };
}

/** Written as a(1 - t) + bt, so 0 gives a and 1 gives b exactly. */
function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  const s = 1 - t;
  return { x: a.x * s + b.x * t, y: a.y * s + b.y * t, z: a.z * s + b.z * t };
}

/**
 * A turn part way between two, made one long again (a normalised blend: for
 * the small turns between two steps it is as good as a true slerp). A turn and
 * its negative are the same turn, so `b` is flipped if it points away from `a`.
 */
function turnBetween(a: Quat, b: Quat, t: number): Quat {
  const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const s = 1 - t;
  const x = a.x * s + b.x * sign * t;
  const y = a.y * s + b.y * sign * t;
  const z = a.z * s + b.z * sign * t;
  const w = a.w * s + b.w * sign * t;
  const size = Math.sqrt(x * x + y * y + z * z + w * w);
  return { x: x / size, y: y / size, z: z / size, w: w / size };
}

/** Surfaces in the order a tie is settled: the road first. */
const SURFACE_ORDER: readonly Surface[] = ['road', 'kerb', 'grass', 'sand', 'rock', 'snow'];

/** What most of the wheels on the ground stand on, for the readout; null with every wheel in the air. */
export function mainSurface(wheels: readonly WheelState[]): Surface | null {
  let best: Surface | null = null;
  let most = 0;
  for (const surface of SURFACE_ORDER) {
    const count = wheels.filter((wheel) => wheel.touching && wheel.surface === surface).length;
    if (count > most) [best, most] = [surface, count];
  }
  return best;
}
