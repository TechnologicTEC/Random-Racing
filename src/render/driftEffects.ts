import type { KartViewConfig } from '../config';
import type { DriftView } from '../sim/car/car';
import type { Vec3 } from '../sim/quat';
import { SPARK, toLinear } from './palette';

/**
 * The drift's effects as plain numbers (docs/VISUAL_BAR.md, "The car, sparks
 * and flame"), wrapped for Three.js in `carView.ts`. Everything is worked out
 * from the simulation's state and its step count, never the frame clock, so a
 * still picture repeats exactly. Positions are in the car's own directions,
 * from its middle: the front is -z, the right +x, the roof +y.
 */

/** Sparks as loose triangles: three corners each, with a colour at each corner in linear light. */
export interface Sparks {
  positions: Float32Array;
  colors: Float32Array;
}

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

/** A share from 0 up to 1 for a spark's birth step, its number and one of its choices. */
const share = (step: number, spark: number, choice: number): number => mix(step, spark, choice) / 4294967296;

/**
 * The sparks thrown from both rear wheels while sliding from the first tier,
 * in the tier's colour. Each wheel throws `perStep` sparks a step; each flies
 * back and out from where its wheel meets the road for `life` seconds, at most
 * `reach` metres, shrinking as it goes. Which way each flies, how far and how
 * it is turned come from its birth step and number alone.
 *
 * @param step the simulation's step count
 * @param wheels where the two rear wheels meet the road, left then right
 */
export function sparkTriangles(drift: DriftView, step: number, wheels: readonly [Vec3, Vec3], look: KartViewConfig, stepsPerSecond: number): Sparks {
  if (drift.phase !== 'slide' || drift.tier === 0) return { positions: new Float32Array(0), colors: new Float32Array(0) };
  const { perStep, life, reach, size } = look.sparks;
  const lifeSteps = Math.max(1, Math.round(life * stepsPerSecond));
  const count = 2 * lifeSteps * perStep;
  const positions = new Float32Array(count * 9);
  const colors = new Float32Array(count * 9);
  const [r, g, b] = SPARK[drift.tier - 1]!.map(toLinear) as [number, number, number];
  let n = 0;
  wheels.forEach((wheel, w) => {
    const out = w === 0 ? -1 : 1;
    // Oldest first: born `lifeSteps - 1` steps ago, up to this step.
    for (let age = lifeSteps; age >= 1; age--) {
      const born = step - age + 1;
      for (let k = 0; k < perStep; k++) {
        const id = w * perStep + k;
        // Out, up and back: out from beside the tyre and up, so the chase camera behind sees them past the wheel.
        const dx = out * (0.5 + 0.5 * share(born, id, 0));
        const dy = 0.3 + 0.6 * share(born, id, 1);
        const dz = 0.3 + 0.5 * share(born, id, 2);
        const length = Math.hypot(dx, dy, dz);
        const flown = age / lifeSteps;
        const distance = reach * flown * (0.6 + 0.4 * share(born, id, 3));
        const cx = wheel.x + (dx / length) * distance;
        const cy = wheel.y + (dy / length) * distance;
        const cz = wheel.z + (dz / length) * distance;
        // A flat triangle facing back, turned any way about the line it faces, about its own middle.
        const s = (size / 2) * (1 - 0.6 * flown);
        const turn = share(born, id, 4) * Math.PI * 2;
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        for (const [u, v] of [
          [-1, -0.5],
          [1, -0.5],
          [0, 1],
        ] as const) {
          positions[n] = cx + (u * cos - v * sin) * s;
          positions[n + 1] = cy + (u * sin + v * cos) * s;
          positions[n + 2] = cz;
          colors[n] = r;
          colors[n + 1] = g;
          colors[n + 2] = b;
          n += 3;
        }
      }
    }
  });
  return { positions, colors };
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
