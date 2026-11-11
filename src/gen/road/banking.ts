import type { RoadConfig } from '../../config';
import { dcos, dsin, TAU } from '../../core/dmath';
import { lerp, smoothstep } from '../../core/scalar';
import type { CenterLine } from '../types';

/**
 * Works out how the road tilts at every sample: metres of height gained per
 * metre towards the right of the direction of travel. Negative in a
 * right-hand corner (the inside edge is lower), positive in a left-hand one,
 * zero on straights.
 *
 * Fast, wide corners get the full bank; tight ones only part of it; curves so
 * gentle they are nearly straight get none. The tilt is then averaged along
 * the lap so the road rolls into each bank before the corner and out again
 * after it, because the centre line itself goes from straight to curved in a
 * single step.
 */
export function solveBanking(line: CenterLine, cfg: RoadConfig): Float64Array {
  const n = line.count;
  const angle = (cfg.bankMax * TAU) / 360;
  const full = dsin(angle) / dcos(angle);

  const wanted = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const curvature = line.curvature[i]!;
    const bend = Math.abs(curvature);
    if (bend * cfg.bankFade[1] <= 1) continue; // gentler than the widest radius that is banked at all
    const radius = 1 / bend;
    const share =
      lerp(cfg.bankSlowShare, 1, smoothstep(cfg.bankSlowRadius, cfg.bankFastRadius, radius)) *
      (1 - smoothstep(cfg.bankFade[0], cfg.bankFade[1], radius));
    wanted[i] = curvature > 0 ? -full * share : full * share;
  }

  // Averaging over the easing length, twice, turns each step into a smooth ramp.
  let window = Math.max(1, Math.round(cfg.bankEase / line.spacing));
  if (window % 2 === 0) window++;
  return average(average(wanted, window), window);
}

/** Replaces each sample with the average of the `window` samples centred on it, around the loop. */
function average(values: Float64Array, window: number): Float64Array {
  const n = values.length;
  const half = (window - 1) / 2;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -half; k <= half; k++) sum += values[(((i + k) % n) + n) % n]!;
    out[i] = sum / window;
  }
  return out;
}
