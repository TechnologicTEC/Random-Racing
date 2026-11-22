import type { SimConfig } from '../config';
import type { Quat, Vec3 } from '../sim/quat';
import type { Surface } from '../sim/car/surface';
import type { DriftView, WheelState } from '../sim/car/car';
import type { DriftEnd } from '../sim/car/drift';
import { SPARK } from '../render/palette';
import type { RespawnState } from '../sim/respawn';
import type { CarState } from '../sim/sim';
import type { ProgressState } from '../sim/track/progress';

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

/** What the readout shows of the drift: the tier's dot (its colour as CSS, null for none) and the boost left. */
export interface DriftReadout {
  tier: 0 | 1 | 2 | 3;
  colour: string | null;
  boost: string;
}

/**
 * The readout's drift line: a dot in the colour of the tier the slide has
 * charged, or of the boost running once it is let go, and the boost's time
 * left to a tenth of a second.
 */
export function driftReadout(drift: DriftView): DriftReadout {
  const boosting = drift.boostLeft > 0 && drift.boostTier > 0;
  const tier = drift.phase === 'slide' && drift.tier > 0 ? drift.tier : boosting ? drift.boostTier : 0;
  const colour = tier === 0 ? null : `rgb(${SPARK[tier - 1]!.map((c) => Math.round(c * 255)).join(', ')})`;
  return { tier, colour, boost: boosting ? `boost ${drift.boostLeft.toFixed(1)} s` : '' };
}

/** What the readout last saw of the slides' ends: how many there had been, and the step it saw the last of them change. */
export interface CancelSeen {
  ends: number;
  from: number;
}

/** The plain words for each cancel; a slide let go says nothing, since its boost already shows. */
const CANCEL_WORDS: Record<Exclude<DriftEnd, 'let go'>, string> = {
  wall: 'hit a wall',
  gate: 'hit the gate',
  tree: 'hit a tree',
  rock: 'hit a rock',
  brake: 'braked',
  slow: 'too slow',
  respawn: 'respawn',
};

/**
 * The readout's line on why the last slide was cancelled (step 10a), shown for `show` steps from the step the page
 * first sees the count of ends go up. An end that was already there when the page first saw the car, or a count that
 * went down (a new simulation), shows nothing. Worked out from step counts, never the clock, so `still=1` repeats.
 *
 * @param seen what the last call gave back, or null for the first state seen
 * @param step the step count of the state shown (`CarState.step`)
 * @param show how many steps to show it for
 */
export function cancelReadout(seen: CancelSeen | null, drift: DriftView, step: number, show: number): { seen: CancelSeen; text: string } {
  let now: CancelSeen = seen ?? { ends: drift.ends, from: Number.NEGATIVE_INFINITY };
  if (drift.ends !== now.ends) now = { ends: drift.ends, from: drift.ends > now.ends ? step : Number.NEGATIVE_INFINITY };
  const cancel = drift.ended !== null && drift.ended !== 'let go' ? drift.ended : null;
  const text = cancel !== null && step - now.from < show ? `drift cancelled: ${CANCEL_WORDS[cancel]}` : '';
  return { seen: now, text };
}

/**
 * How white the picture is over a respawn, from 0 (clear) to 1: rising evenly over the last `fade.in` of the wait to
 * white on its last step, white on the step the car is put back, and clearing evenly over `fade.out` after. Worked out
 * from the simulation's state and step count alone, so a held picture (`still=1`) always shows the same.
 *
 * @param step the step count of the state shown (`CarState.step`)
 */
export function respawnFade(respawn: RespawnState, step: number, fade: { in: number; out: number }, stepsPerSecond: number): number {
  const fadeIn = Math.max(1, Math.round(fade.in * stepsPerSecond));
  const fadeOut = Math.max(1, Math.round(fade.out * stepsPerSecond));
  const coming = respawn.waitLeft > 0 ? Math.max(0, (fadeIn + 1 - respawn.waitLeft) / fadeIn) : 0;
  // The step the car was put back on is `placedAt`; the state after it counts one more.
  const since = step - respawn.placedAt - 1;
  const going = respawn.placedAt >= 0 && since >= 0 ? Math.max(0, 1 - since / fadeOut) : 0;
  return Math.min(1, Math.max(coming, going));
}

/**
 * The readout's place on the lap: how far round it is and the lap's length, in kilometres, and the checkpoint to pass
 * next (checkpoint 0 is the line, the others counted from 1). Nothing off an island.
 */
export function placeReadout(progress: ProgressState | null, lapLength: number, checkpoints: number): string {
  if (!progress) return '';
  const next = progress.next === 0 ? 'next the line' : `next checkpoint ${progress.next} of ${checkpoints - 1}`;
  return `${(progress.along / 1000).toFixed(2)} of ${(lapLength / 1000).toFixed(2)} km · ${next}`;
}
