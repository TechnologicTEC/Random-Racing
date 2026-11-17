import type { KartViewConfig } from '../config';
import type { DriftView } from '../sim/car/car';
import type { Vec3 } from '../sim/quat';
import { FLAME, SMOKE, SPARK, SPARK_HOT, toLinear, type Rgb } from './palette';

/**
 * The drift's effects as plain numbers (docs/VISUAL_BAR.md, "The car, sparks
 * and flame"), drawn as sprites by `carView.ts` (Tane, 6h-5: sprites and
 * bloom). Everything is worked out from the simulation's state and its step
 * count, never the frame clock, so a still picture repeats exactly. Positions
 * are in the car's own directions, from its middle: the front is -z, the right
 * +x, the roof +y.
 */

/** Which picture a sprite is drawn with (`public/effects/`): a spark's streak, a bright star, a soft glow, a flame jet, a puff of smoke. */
export type SpriteKind = 'streak' | 'star' | 'glow' | 'flame' | 'smoke';

/** One sprite: a picture facing the camera, `width` across and `length` along `axis` (both halves), or round with no axis. */
export interface Sprite {
  kind: SpriteKind;
  /** Its middle. */
  at: Vec3;
  /** The way it is stretched, one long; all 0 for a round one that is `width` across every way. */
  axis: Vec3;
  width: number;
  length: number;
  /** In linear light, and brighter than 1 for the effects that glow. */
  colour: Rgb;
  /** How opaque, 0 to 1 (for light added, how much of it is added). */
  alpha: number;
}

/** What the effects are worked out from at one step. */
export interface EffectInput {
  drift: DriftView;
  /** The simulation's step count. */
  step: number;
  /** Where the two rear wheels meet the road, left then right. */
  rear: readonly [Vec3, Vec3];
  /** The car's speed in its own directions, in metres per second (forwards is -z). */
  motion: Vec3;
}

/** Where the boost flame leaves the engine block (`kartBody`): its middle, in the car's own directions. */
export const EXHAUST: Vec3 = { x: 0, y: -0.16, z: 1.1 };
const NONE: Vec3 = { x: 0, y: 0, z: 0 };
const BACK: Vec3 = { x: 0, y: 0, z: 1 };

/** A whole number made from a few, spread so that neighbours give unrelated answers. */
function mix(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** A share from 0 up to 1 for a birth step, a number and one of its choices. */
const share = (step: number, id: number, choice: number): number => mix(step, id, choice) / 4294967296;
const linear = (rgb: readonly number[]): Rgb => [toLinear(rgb[0]!), toLinear(rgb[1]!), toLinear(rgb[2]!)];
/** `a` to `b` by `t`, times `bright`. */
const blend = (a: Rgb, b: Rgb, t: number, bright: number): Rgb => [(a[0] + (b[0] - a[0]) * t) * bright, (a[1] + (b[1] - a[1]) * t) * bright, (a[2] + (b[2] - a[2]) * t) * bright];

/**
 * Every sprite of the drift's effects at one step: tyre smoke from the start
 * of a slide, sparks from the first tier, and while a boost runs its flame and,
 * just after letting go, a burst of stars.
 *
 * @param boosts how long the boost of each tier lasts, in seconds (`car.drift.boosts`): the burst is timed from the release
 */
export function driftSprites(input: EffectInput, look: KartViewConfig, boosts: readonly [number, number, number], stepsPerSecond: number): Sprite[] {
  const out: Sprite[] = [];
  const { drift } = input;
  if (drift.phase === 'slide') smoke(input, look, stepsPerSecond, out);
  if (drift.phase === 'slide' && drift.tier !== 0) sparks(input, drift.tier, look, stepsPerSecond, out);
  const tier = drift.boostTier;
  if (drift.boostLeft > 0 && tier !== 0) {
    burst(input, tier, boosts[tier - 1] - drift.boostLeft, look, out);
    flame(drift, input.step, look, out);
  }
  return out;
}

/** Sparks from both rear wheels: oldest first, each a streak along its flight with a bright head. */
function sparks({ step, rear }: EffectInput, tier: 1 | 2 | 3, look: KartViewConfig, stepsPerSecond: number, out: Sprite[]): void {
  const { life, length, width, head, glow } = look.sparks;
  const perStep = look.sparks.perStep[tier - 1];
  const reach = look.sparks.reach[tier - 1];
  const spread = look.sparks.spread[tier - 1];
  const lifeSteps = Math.max(1, Math.round(life * stepsPerSecond));
  const hot = linear(SPARK_HOT);
  const cold = linear(SPARK[tier - 1]!);
  rear.forEach((wheel, w) => {
    const side = w === 0 ? -1 : 1;
    for (let age = lifeSteps; age >= 1; age--) {
      const born = step - age + 1;
      for (let k = 0; k < perStep; k++) {
        const id = w * 8 + k;
        // Back, out to the wheel's own side and up, so the chase camera behind sees them past the wheel.
        const dx = side * (0.35 + spread * share(born, id, 0));
        const dy = 0.25 + 0.6 * share(born, id, 1);
        const dz = 0.3 + 0.6 * share(born, id, 2);
        const size = Math.hypot(dx, dy, dz);
        const axis = { x: dx / size, y: dy / size, z: dz / size };
        const flown = age / lifeSteps;
        const distance = reach * flown * (0.65 + 0.35 * share(born, id, 3));
        const at = { x: wheel.x + axis.x * distance, y: wheel.y + axis.y * distance, z: wheel.z + axis.z * distance };
        // White-hot as it leaves the tyre, in the tier's own colour from a third of the way: the tier reads at a glance.
        const cooled = Math.min(1, flown * 3);
        const colour = blend(hot, cold, cooled, glow);
        const alpha = 1 - 0.5 * flown * flown;
        const streak = length * (0.6 + 0.4 * (1 - flown));
        out.push({ kind: 'streak', at, axis, width: width * (1 - 0.5 * flown), length: streak, colour, alpha });
        // The head leads the streak, a little hotter than its tail; small as it leaves the tyre, where the newest crowd
        // together and would otherwise sum to one white blob.
        const front = { x: at.x + axis.x * streak, y: at.y + axis.y * streak, z: at.z + axis.z * streak };
        const headSize = head * (0.4 + 0.6 * Math.min(1, flown * 2)) * (1 - 0.4 * flown);
        out.push({ kind: 'star', at: front, axis: NONE, width: headSize, length: headSize, colour: blend(hot, cold, cooled * 0.85, glow), alpha });
      }
    }
  });
}

/** A ring of stars spreading out from between the rear wheels just after letting go. */
function burst({ rear }: EffectInput, tier: 1 | 2 | 3, age: number, look: KartViewConfig, out: Sprite[]): void {
  const { life, count, reach, size } = look.burst;
  if (age < 0 || age >= life) return;
  const t = age / life;
  const centre = { x: (rear[0].x + rear[1].x) / 2, y: (rear[0].y + rear[1].y) / 2 + 0.15, z: (rear[0].z + rear[1].z) / 2 };
  const radius = reach * (0.25 + 0.75 * t);
  const colour = blend(linear(SPARK_HOT), linear(SPARK[tier - 1]!), 0.9, look.sparks.glow);
  for (let k = 0; k < count; k++) {
    const angle = (k / count) * Math.PI * 2;
    const at = { x: centre.x + Math.cos(angle) * radius, y: centre.y, z: centre.z + Math.sin(angle) * radius };
    out.push({ kind: 'star', at, axis: NONE, width: size * (1 - 0.4 * t), length: size * (1 - 0.4 * t), colour, alpha: 1 - t });
  }
}

/** Puffs from both rear wheels while sliding, left behind and growing as they fade. */
function smoke({ step, rear, motion }: EffectInput, look: KartViewConfig, stepsPerSecond: number, out: Sprite[]): void {
  const { every, life, size, rise, alpha, drag } = look.smoke;
  const lifeSteps = Math.max(1, Math.round(life * stepsPerSecond));
  const colour = linear(SMOKE);
  rear.forEach((wheel, w) => {
    const side = w === 0 ? -1 : 1;
    for (let age = lifeSteps - 1; age >= 0; age--) {
      const born = step - age;
      if (born % every !== 0) continue;
      const t = age / lifeSteps;
      const seconds = age / stepsPerSecond;
      const half = size[0] + (size[1] - size[0]) * t;
      // Left behind at a share of the car's speed, and drifting a little out to its own side.
      const at = {
        x: wheel.x - motion.x * drag * seconds + side * 0.3 * t * share(born, w, 9),
        y: wheel.y + half * 0.6 + rise * t,
        z: wheel.z - motion.z * drag * seconds,
      };
      out.push({ kind: 'smoke', at, axis: NONE, width: half, length: half, colour, alpha: alpha * (1 - t) });
    }
  });
}

/** Two jets pointing back from the exhaust in the tier's colour, each with a pale core and a flare where it leaves. */
function flame(drift: DriftView, step: number, look: KartViewConfig, out: Sprite[]): void {
  const length = flameLength(drift, step, look);
  const tier = drift.boostTier as 1 | 2 | 3;
  const { width, core, spread, flare } = look.flame;
  const glow = look.sparks.glow;
  const outer = blend(linear(SPARK[tier - 1]!), linear(SPARK[tier - 1]!), 0, glow);
  const pale = blend(linear(FLAME.core), linear(FLAME.core), 0, glow);
  const mid = blend(linear(FLAME.core), linear(SPARK[tier - 1]!), 0.7, glow);
  for (const side of [-1, 1]) {
    const x = EXHAUST.x + side * spread;
    out.push({ kind: 'flame', at: { x, y: EXHAUST.y, z: EXHAUST.z + length / 2 }, axis: BACK, width, length: length / 2, colour: outer, alpha: 1 });
    out.push({ kind: 'flame', at: { x, y: EXHAUST.y, z: EXHAUST.z + length * 0.35 }, axis: BACK, width: width * core, length: length * 0.35, colour: pale, alpha: 1 });
    out.push({ kind: 'glow', at: { x, y: EXHAUST.y, z: EXHAUST.z }, axis: NONE, width: flare, length: flare, colour: mid, alpha: 1 });
  }
}

/**
 * How long the boost flame is drawn at a step, in metres: the tier's length,
 * flickering by `flicker` of it either way from one step to the next. 0 with
 * no boost running.
 */
export function flameLength(drift: DriftView, step: number, look: KartViewConfig): number {
  if (drift.boostLeft <= 0 || drift.boostTier === 0) return 0;
  const length = look.flame.lengths[drift.boostTier - 1]!;
  return length * (1 + look.flame.flicker * (2 * share(step, 7, 5) - 1));
}

/**
 * How high the hop lifts the kart, in metres: an arc `height` high over the
 * hop, from `hop` (1 on its first step, falling to 0 as it ends).
 */
export function hopLift(hop: number, height: number): number {
  if (hop <= 0 || hop >= 1) return 0;
  return 4 * height * hop * (1 - hop);
}

/** The share of its height the body is drawn at as the hop lands: down to `1 - squash` over the hop's last quarter, back to 1 as it ends. */
export function hopSquash(hop: number, squash: number): number {
  if (hop <= 0 || hop >= 0.25) return 1;
  return 1 - squash * Math.sin((Math.PI * hop) / 0.25);
}

/**
 * How far the body leans out of the corner in a slide, in radians about the car's front: positive leans left (the
 * right side up), so a slide to the right leans the body left. In step with how far the nose has swung in.
 *
 * @param fullAngle how far the nose swings in at most (`car.drift.angle`)
 */
export function leanAngle(drift: DriftView, fullAngle: number, look: KartViewConfig): number {
  if (drift.dir === 0 || drift.angle <= 0 || fullAngle <= 0) return 0;
  return drift.dir * look.lean * (drift.angle / fullAngle);
}

/** A speed line on the picture, from `from` to `to`, each as x and y from -1 to 1 (left to right, bottom to top). */
export interface SpeedLine {
  from: [number, number];
  to: [number, number];
  alpha: number;
}

/**
 * Thin streaks running out towards the picture's edges while a boost runs.
 * Each lives `life` seconds, starting at its own step in the cycle, on a line
 * out from the middle chosen by its birth step; it is never drawn nearer the
 * middle than `inner` of the way to the edge.
 */
export function speedLines(drift: DriftView, step: number, look: KartViewConfig, stepsPerSecond = 60): SpeedLine[] {
  if (drift.boostLeft <= 0 || drift.boostTier === 0) return [];
  const { count, life, length, inner, alpha } = look.speedLines;
  const lifeSteps = Math.max(2, Math.round(life * stepsPerSecond));
  const lines: SpeedLine[] = [];
  for (let i = 0; i < count; i++) {
    const offset = Math.floor(share(i, 11, 1) * lifeSteps);
    const phase = (step + offset) % lifeSteps;
    const born = step - phase;
    const angle = share(born, i, 2) * Math.PI * 2;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    // The point on this line `r` of the way out in the picture's own square.
    const box = Math.max(Math.abs(ux), Math.abs(uy));
    const at = (r: number): [number, number] => [(ux * r) / box, (uy * r) / box];
    const t = phase / lifeSteps;
    const start = inner + (1 - inner) * 0.6 * t;
    const end = Math.min(1, start + length[0] + (length[1] - length[0]) * share(born, i, 3));
    lines.push({ from: at(start), to: at(end), alpha: alpha * (1 - t) });
  }
  return lines;
}
