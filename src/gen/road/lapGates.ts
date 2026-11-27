import type { LapGatesConfig } from '../../config';
import type { CenterLine, Section } from '../types';

/**
 * Where the lap gates stand (M5.4d; Tane, 2026-11-25): the gates a lap is counted by, which the player can see and
 * drives through, in place of the hidden checkpoints (those now only say where a respawn puts the car).
 *
 * Gate k of `count` aims at k / (count + 1) of the lap. Each is the middle sample of a straight or the apex sample of a
 * corner, whichever is nearest its aim, a corner counted `cornerPenalty` metres further away than it is (a straight is
 * certain to be driven through; a corner's apex can be cut). Every gate stands at least `minGap` metres from the start
 * line and from the gates already placed. Should no middle fit, the gate stands at its aim. The samples are given in
 * order round the lap. No gate stands on a sample marked in `blocked` (M6.2b: in a tunnel, or near one); a gate whose
 * aim is blocked stands at the nearest sample that is not.
 */
export function placeLapGates(
  line: Pick<CenterLine, 'count' | 'spacing' | 'length'>,
  sections: readonly Section[],
  cfg: LapGatesConfig,
  blocked?: Uint8Array,
): number[] {
  const n = line.count;
  const length = line.length;
  const apart = (a: number, b: number): number => {
    const d = Math.abs(a - b) % length;
    return Math.min(d, length - d);
  };
  const candidates = sections.map((s) => ({
    sample: s.type === 'straight' ? (s.startIndex + Math.floor(s.sampleCount / 2)) % n : s.apexIndex,
    penalty: s.type === 'straight' ? 0 : cfg.cornerPenalty,
  }));
  const chosen: number[] = [];
  for (let k = 1; k <= cfg.count; k++) {
    const aim = (k * length) / (cfg.count + 1);
    let best = -1;
    let bestCost = Infinity;
    for (const { sample, penalty } of candidates) {
      if (blocked?.[sample]) continue;
      const at = sample * line.spacing;
      if (apart(at, 0) < cfg.minGap || chosen.some((other) => apart(at, other * line.spacing) < cfg.minGap)) continue;
      const cost = Math.abs(at - aim) + penalty;
      if (cost < bestCost) [best, bestCost] = [sample, cost];
    }
    chosen.push(best >= 0 ? best : openNear(Math.round(aim / line.spacing) % n, n, blocked));
  }
  return chosen.sort((a, b) => a - b);
}

/** The sample nearest `sample` round the lap that is not blocked, the earlier one on a tie; `sample` itself when nothing is blocked. */
function openNear(sample: number, n: number, blocked?: Uint8Array): number {
  if (!blocked) return sample;
  for (let d = 0; d < n; d++) {
    const before = (((sample - d) % n) + n) % n;
    if (!blocked[before]) return before;
    const after = (sample + d) % n;
    if (!blocked[after]) return after;
  }
  return sample;
}
