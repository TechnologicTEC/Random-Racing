import type { CloudConfig } from '../../config';
import { createRng, pickWeighted } from '../../core/rng';
import { lerp } from '../../core/scalar';
import type { CloudCover, Clouds } from '../types';

const COVERS: readonly CloudCover[] = ['clear', 'fair', 'cloudy'];

/**
 * The seed's clouds: how much cloud its sky has, and where each cloud and each
 * of its puffs is before they start to drift. Drawn from the decoration stream
 * (`decor/clouds`), so it never changes a layout, an island or a character.
 *
 * Every puff's underside is above the island's highest ground, so no cloud
 * ever passes through a mountain.
 *
 * @param highestGround the height of the island's highest point, in metres above the sea
 */
export function pickClouds(seed: number, cfg: CloudConfig, highestGround: number): Clouds {
  const rng = createRng(seed, 'decor').fork('clouds');
  const cover = COVERS[pickWeighted(rng.fork('cover'), COVERS.map((kind) => cfg.cover[kind]))] ?? 'fair';
  const count = rng.fork('count').int(cfg.count[cover][0], cfg.count[cover][1]);
  const lowest = Math.max(cfg.floor, highestGround + cfg.aboveSummit);
  const half = cfg.span / 2;

  const x = new Float32Array(count);
  const z = new Float32Array(count);
  const most = count * cfg.puffs[1];
  const puffCloud = new Uint16Array(most);
  const puffX = new Float32Array(most);
  const puffY = new Float32Array(most);
  const puffZ = new Float32Array(most);
  const puffSize = new Float32Array(most);
  const puffThick = new Float32Array(most);
  let puffCount = 0;

  for (let c = 0; c < count; c++) {
    // A stream per cloud, so one more or one fewer cloud leaves the others where they were.
    const own = rng.fork(`cloud-${c}`);
    x[c] = own.range(-half, half);
    z[c] = own.range(-half, half);
    const scale = own.range(cfg.scale[0], cfg.scale[1]);
    const base = lowest + own.next() * cfg.layer;
    const puffs = own.int(cfg.puffs[0], cfg.puffs[1]);
    for (let p = 0; p < puffs; p++) {
      const size = lerp(cfg.puffSize[0], cfg.puffSize[1], own.next()) * scale;
      const thick = size * cfg.flatten;
      puffCloud[puffCount] = c;
      puffX[puffCount] = (own.next() * 2 - 1) * cfg.reach.along * scale;
      puffZ[puffCount] = (own.next() * 2 - 1) * cfg.reach.across * scale;
      // Its underside is never below the cloud's base. The little extra allows for storing it as a 32-bit number.
      puffY[puffCount] = base + thick + own.next() * cfg.reach.up * scale + 0.01;
      puffSize[puffCount] = size;
      puffThick[puffCount] = thick;
      puffCount++;
    }
  }

  return {
    cover,
    span: cfg.span,
    count,
    x,
    z,
    puffCount,
    puffCloud: puffCloud.slice(0, puffCount),
    puffX: puffX.slice(0, puffCount),
    puffY: puffY.slice(0, puffCount),
    puffZ: puffZ.slice(0, puffCount),
    puffSize: puffSize.slice(0, puffCount),
    puffThick: puffThick.slice(0, puffCount),
  };
}
