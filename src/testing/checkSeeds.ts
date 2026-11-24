import type { WorldResult } from '../gen/types';
import { sampleField } from '../gen/world/heightfield';

/**
 * The seeds Milestone 2 was checked on (step 17). The unit tests and the
 * screenshots use these lists, and docs/STATE.md records them.
 */

/** Seeds 1 to 20, looked at after every step of the milestone. */
export const FIRST_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, i) => i + 1);

/**
 * 20 fresh seeds drawn at random for step 17 (2026-11-15), from 1 to 99,999 as
 * the N key draws them, leaving out every seed used in a test or a check before.
 */
export const FRESH_SEEDS: readonly number[] = [
  42625, 23982, 49123, 71138, 59679, 39898, 52035, 1256, 1905, 37884, 88647, 28496, 32534, 7421, 56198, 67454, 62658, 6322, 66025,
  36062,
];

/**
 * Checked seeds where one of the island's mountain ranges stands over the road, so the road runs through
 * it in a gorge, deeper than the cut limit and with sides as steep as the range. Mountains are meant to
 * stay 60 m from the road, but placing them checks a foot at only 32 points round its outline, and a range
 * a kilometre across can reach the road between them. Tane saw the gorges in step 17 and chose to keep them.
 * Which seeds have one changed with the 20 m road (6h-3): 42 gained one, 28496 lost its gorge at the start; 42 lost its
 * again with the level start area (M4.1).
 */
export const GORGE_SEEDS: readonly number[] = [39898];

/** A place where the roadside is open and gentle ground runs from the road down into the sea. */
export interface SeaOpening {
  /** The centre line's sample it is beside. */
  sample: number;
  /** Which side of the road: 1 for the right of the direction of travel, -1 for the left. */
  side: 1 | -1;
  /** How far from the centre line, square to it, the sea bed is `depth` metres under the sea. */
  reach: number;
}

/**
 * The places on a seed's lap where a car can drive off the road into the sea (step 8b's tests): no wall on that side
 * for 20 m either way, the ground square to the road falling to `depth` metres under the sea within `within` metres of
 * the road's edge (down a bank or a beach), and no tree or rock within 3 m of that path. Nearest the road first.
 */
export function seaOpenings(world: WorldResult, depth = 2, within = 150): SeaOpening[] {
  const { line } = world.track.candidates[world.track.winnerIndex]!;
  const n = line.count;
  const walled = (i: number, side: 1 | -1): boolean =>
    world.road.walls.some((wall) => wall.side === side && (((i - wall.startIndex) % n) + n) % n < wall.pieceCount);
  const clear = Math.ceil(20 / line.spacing);
  const things = [world.decor.trees, world.decor.rocks];
  const found: SeaOpening[] = [];
  for (let i = 0; i < n; i += 5) {
    for (const side of [1, -1] as const) {
      let open = true;
      for (let k = -clear; k <= clear && open; k++) if (walled((((i + k) % n) + n) % n, side)) open = false;
      if (!open) continue;
      const rx = -line.tz[i]! * side;
      const rz = line.tx[i]! * side;
      const edge = world.road.width[i]! / 2;
      let reach = -1;
      for (let r = edge + 1; r <= edge + within; r++) {
        const h = sampleField(world.ground, line.x[i]! + rx * r, line.z[i]! + rz * r, -100);
        if (h < -depth) {
          reach = r;
          break;
        }
      }
      if (reach < 0) continue;
      const blocked = things.some((scatter) => {
        for (let t = 0; t < scatter.count; t++) {
          const dx = scatter.x[t]! - line.x[i]!;
          const dz = scatter.z[t]! - line.z[i]!;
          const out = dx * rx + dz * rz;
          const across = Math.abs(dx * rz - dz * rx);
          if (out > 0 && out < reach + 5 && across < 3) return true;
        }
        return false;
      });
      if (!blocked) found.push({ sample: i, side, reach });
    }
  }
  return found.sort((a, b) => a.reach - b.reach);
}
