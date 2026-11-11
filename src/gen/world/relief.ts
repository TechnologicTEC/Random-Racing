import type { ReliefConfig } from '../../config';
import { createNoise } from '../../core/noise';
import { createRng } from '../../core/rng';
import { clamp01 } from '../../core/scalar';

/** Height of the natural ground at a point on the map, in metres above the sea. */
export type Relief = (x: number, z: number) => number;

/**
 * The rolling ground a seed's track is laid over: broad hills with smaller
 * rises on top, and wide lowlands between them.
 *
 * It depends only on the seed, never on the track, so every candidate layout
 * can be judged against the same hills.
 */
export function createRelief(seed: number, cfg: ReliefConfig): Relief {
  const rng = createRng(seed, 'world').fork('relief');
  const broad = createNoise(rng.fork('broad'));
  const fine = createNoise(rng.fork('fine'));
  // Each seed looks at a different part of the pattern, so no two share a centre.
  const offsetX = rng.range(-500, 500);
  const offsetZ = rng.range(-500, 500);

  return (x, z) => {
    const mixed =
      broad(x / cfg.scale + offsetX, z / cfg.scale + offsetZ) * (1 - cfg.fineShare) +
      fine(x / cfg.fineScale + offsetX, z / cfg.fineScale + offsetZ) * cfg.fineShare;
    // Squaring keeps the lowlands wide and nearly flat and gathers the height into the hills.
    const t = clamp01(0.5 + 0.5 * mixed);
    return cfg.lowland + cfg.hillHeight * t * t;
  };
}
