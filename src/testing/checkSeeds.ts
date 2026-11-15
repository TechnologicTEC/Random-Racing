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
 */
export const GORGE_SEEDS: readonly number[] = [28496, 39898];
