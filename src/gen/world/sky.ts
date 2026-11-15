import type { SkyConfig } from '../../config';
import { TAU } from '../../core/dmath';
import { createRng } from '../../core/rng';
import type { Sky } from '../types';

/**
 * The seed's time of day and the compass direction of the sun's path. Drawn
 * from a stream of its own (`world/sky`), so it never changes a layout, an
 * island or a character. The player may pick another time; this is the one the
 * seed starts with.
 */
export function pickSky(seed: number, cfg: SkyConfig): Sky {
  const rng = createRng(seed, 'world').fork('sky');
  const [from, to] = cfg.hours;
  // Whole minutes, so the clock on screen shows exactly the seed's time.
  const minutes = rng.fork('hour').int(from * 60, to * 60);
  return { hour: minutes / 60, bearing: rng.fork('bearing').range(0, TAU) };
}
