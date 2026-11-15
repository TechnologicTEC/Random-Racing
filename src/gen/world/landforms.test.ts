import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { createRng } from '../../core/rng';
import type { LandformKind } from '../types';
import { buildLandform, type Landform } from './landforms';

const cfg = config.world.scenery.landforms;
const CELL = 3;
/** Where every test landform's main summit stands. */
const AT = { x: 40, z: -30 };
const HEIGHTS: Record<LandformKind, [number, number]> = { peak: [200, 250], range: [200, 250], hills: [120, 170] };

const make = (kind: LandformKind, k: number): Landform => {
  const [low, high] = HEIGHTS[kind];
  return buildLandform(createRng(k, 'world').fork('landform-test'), kind, { ...AT, height: k % 2 === 0 ? high : low }, cfg);
};

/** Heights on the game's 3 m grid over a landform's bounds (and a little beyond), with its steepest slope. */
interface Survey {
  form: Landform;
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  height: Float64Array;
  steepest: number;
  highest: number;
}

function survey(form: Landform): Survey {
  const { minX, maxX, minZ, maxZ } = form.bounds;
  const x0 = Math.floor(minX / CELL) * CELL - 2 * CELL;
  const z0 = Math.floor(minZ / CELL) * CELL - 2 * CELL;
  const nx = Math.ceil((maxX - x0) / CELL) + 3;
  const nz = Math.ceil((maxZ - z0) / CELL) + 3;
  const height = new Float64Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) height[iz * nx + ix] = form.height(x0 + ix * CELL, z0 + iz * CELL);
  let steepest = 0;
  let highest = 0;
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const c = iz * nx + ix;
      const dx = (height[c + 1]! - height[c]!) / CELL;
      const dz = (height[c + nx]! - height[c]!) / CELL;
      steepest = Math.max(steepest, Math.sqrt(dx * dx + dz * dz));
      highest = Math.max(highest, height[c]!);
    }
  }
  return { form, x0, z0, nx, nz, height, steepest, highest };
}

const surveys = new Map<string, Survey>();
const surveyed = (kind: LandformKind, k: number): Survey => {
  const key = `${kind}-${k}`;
  if (!surveys.has(key)) surveys.set(key, survey(make(kind, k)));
  return surveys.get(key)!;
};

const STREAMS = [1, 2, 3, 4, 5, 6, 7, 8];
const DIRECTIONS = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)] as const);

for (const kind of ['peak', 'range', 'hills'] as const) {
  describe(`${kind} landforms`, () => {
    it('are the same for the same stream', () => {
      const a = make(kind, 3);
      const b = make(kind, 3);
      for (let k = 0; k < 200; k++) {
        const x = AT.x - 400 + (k % 20) * 40;
        const z = AT.z - 400 + Math.floor(k / 20) * 80;
        expect(a.height(x, z)).toBe(b.height(x, z));
      }
      expect(a.summits).toEqual(b.summits);
    });

    it('stand the main summit where asked, at the height asked, and nothing higher', () => {
      for (const k of STREAMS) {
        const s = surveyed(kind, k);
        const wanted = make(kind, k).summits[0]!;
        const height = k % 2 === 0 ? HEIGHTS[kind][1] : HEIGHTS[kind][0];
        expect(wanted.x).toBe(AT.x);
        expect(wanted.z).toBe(AT.z);
        expect(wanted.height).toBe(height);
        expect(s.form.height(AT.x, AT.z), `stream ${k}`).toBeGreaterThanOrEqual(height * 0.97);
        expect(s.highest, `stream ${k}`).toBeLessThanOrEqual(height * 1.02);
      }
    });

    it(`are never steeper than ${Math.round(cfg[kind].slope * 100)}% on the 3 m grid`, () => {
      for (const k of STREAMS) expect(surveyed(kind, k).steepest, `stream ${k}`).toBeLessThanOrEqual(cfg[kind].slope * 1.02);
    });

    it('are zero outside their foot and stay inside their bounds', () => {
      for (const k of STREAMS.slice(0, 4)) {
        const s = surveyed(kind, k);
        const { minX, maxX, minZ, maxZ } = s.form.bounds;
        for (let iz = 0; iz < s.nz; iz += 2) {
          for (let ix = 0; ix < s.nx; ix += 2) {
            const x = s.x0 + ix * CELL;
            const z = s.z0 + iz * CELL;
            const h = s.height[iz * s.nx + ix]!;
            expect(h).toBeGreaterThanOrEqual(0);
            if (s.form.outside(x, z) > 0) expect(h, `stream ${k} at ${x}, ${z}`).toBe(0);
            if (h > 0) {
              expect(x).toBeGreaterThanOrEqual(minX);
              expect(x).toBeLessThanOrEqual(maxX);
              expect(z).toBeGreaterThanOrEqual(minZ);
              expect(z).toBeLessThanOrEqual(maxZ);
            }
          }
        }
      }
    });

    it('are not copies of each other: two streams give different shapes', () => {
      for (const k of [1, 3, 5]) {
        const a = make(kind, k);
        const b = make(kind, k + 2); // same height, different stream
        const xs: number[] = [];
        const ys: number[] = [];
        for (let dz = -600; dz <= 600; dz += 20) {
          for (let dx = -600; dx <= 600; dx += 20) {
            xs.push(a.height(AT.x + dx, AT.z + dz));
            ys.push(b.height(AT.x + dx, AT.z + dz));
          }
        }
        expect(correlation(xs, ys), `streams ${k} and ${k + 2}`).toBeLessThan(0.9);
      }
    });
  });
}

describe('lone peaks', () => {
  it('have a foot that is not a circle: its radius varies by at least a quarter with direction', () => {
    for (const k of STREAMS) {
      const radii = footRadii(make('peak', k), 36);
      const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
      expect((Math.max(...radii) - Math.min(...radii)) / mean, `stream ${k}`).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('have their summit off the middle of their foot', () => {
    for (const k of STREAMS) {
      const s = surveyed('peak', k);
      let sx = 0, sz = 0, count = 0;
      for (let iz = 0; iz < s.nz; iz++) {
        for (let ix = 0; ix < s.nx; ix++) {
          if (s.height[iz * s.nx + ix]! <= 0.5) continue;
          sx += s.x0 + ix * CELL;
          sz += s.z0 + iz * CELL;
          count++;
        }
      }
      const radii = footRadii(s.form, 36);
      const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
      expect(Math.hypot(sx / count - AT.x, sz / count - AT.z) / mean, `stream ${k}`).toBeGreaterThanOrEqual(0.05);
    }
  });

  it('have a gentle foot and steep upper slopes', () => {
    for (const k of STREAMS) {
      const s = surveyed('peak', k);
      const top = s.form.summits[0]!.height;
      const low: number[] = [];
      const high: number[] = [];
      for (let iz = 0; iz < s.nz - 1; iz++) {
        for (let ix = 0; ix < s.nx - 1; ix++) {
          const c = iz * s.nx + ix;
          const h = s.height[c]!;
          const slope = Math.hypot(s.height[c + 1]! - h, s.height[c + s.nx]! - h) / CELL;
          if (h > 0.05 * top && h < 0.3 * top) low.push(slope);
          if (h > 0.5 * top && h < 0.9 * top) high.push(slope);
        }
      }
      expect(mean(high), `stream ${k}`).toBeGreaterThan(mean(low) * 1.3);
    }
  });
});

describe('ridged ranges', () => {
  it('have 3 to 6 summits along a ridge, the main one the tallest, each the highest point near it', () => {
    for (const k of STREAMS) {
      const form = make('range', k);
      expect(form.summits.length, `stream ${k}`).toBeGreaterThanOrEqual(3);
      expect(form.summits.length, `stream ${k}`).toBeLessThanOrEqual(6);
      expect(form.spine.length).toBeGreaterThan(10);
      const main = form.summits[0]!;
      for (const summit of form.summits) {
        expect(summit.height).toBeLessThanOrEqual(main.height);
        expect(Math.abs(form.height(summit.x, summit.z) - summit.height), `stream ${k}`).toBeLessThanOrEqual(main.height * 0.03);
        for (const [ux, uz] of DIRECTIONS) {
          for (const r of [10, 25, 40]) {
            expect(form.height(summit.x + ux * r, summit.z + uz * r), `stream ${k}`).toBeLessThan(form.height(summit.x, summit.z));
          }
        }
      }
    }
  });

  it('join neighbouring summits by a ridge whose lowest point is 55% to 90% of the lower summit', () => {
    for (const k of STREAMS) {
      const form = make('range', k);
      // Summits in order along the ridge, each with the index of the ridge point nearest it.
      const ordered = form.summits
        .map((summit) => ({ summit, at: nearestIndex(form.spine, summit.x, summit.z) }))
        .sort((a, b) => a.at - b.at);
      for (let i = 0; i + 1 < ordered.length; i++) {
        const a = ordered[i]!;
        const b = ordered[i + 1]!;
        let lowest = Infinity;
        for (let j = a.at; j <= b.at; j++) lowest = Math.min(lowest, form.height(form.spine[j]!.x, form.spine[j]!.z));
        const lower = Math.min(a.summit.height, b.summit.height);
        expect(lowest / lower, `stream ${k}, summits ${i} and ${i + 1}`).toBeGreaterThanOrEqual(0.55 - 0.01);
        expect(lowest / lower, `stream ${k}, summits ${i} and ${i + 1}`).toBeLessThanOrEqual(0.9 + 0.01);
      }
    }
  });

  it('are 300 to 1200 m from end summit to end summit', () => {
    for (const k of STREAMS) {
      const form = make('range', k);
      let longest = 0;
      for (const a of form.summits) for (const b of form.summits) longest = Math.max(longest, Math.hypot(a.x - b.x, a.z - b.z));
      expect(longest, `stream ${k}`).toBeGreaterThanOrEqual(300);
      expect(longest, `stream ${k}`).toBeLessThanOrEqual(1200);
    }
  });

  it('have sharp tops: 20 m from a summit the ground is well below it', () => {
    for (const k of STREAMS) {
      const form = make('range', k);
      for (const summit of form.summits) {
        const top = form.height(summit.x, summit.z);
        const drops = DIRECTIONS.map(([ux, uz]) => top - form.height(summit.x + ux * 20, summit.z + uz * 20));
        expect(mean(drops), `stream ${k}`).toBeGreaterThanOrEqual(8);
      }
    }
  });
});

describe('rolling hill country', () => {
  it('is at least 5 separate swells', () => {
    for (const k of STREAMS) {
      const s = surveyed('hills', k);
      const top = s.form.summits[0]!.height;
      const reach = Math.round(45 / CELL);
      let swells = 0;
      for (let iz = reach; iz < s.nz - reach; iz++) {
        for (let ix = reach; ix < s.nx - reach; ix++) {
          const c = iz * s.nx + ix;
          const h = s.height[c]!;
          if (h < 0.15 * top) continue;
          // A quick look at the eight neighbours first, then the whole 45 m around.
          if (h <= s.height[c - 1]! || h <= s.height[c + 1]! || h <= s.height[c - s.nx]! || h <= s.height[c + s.nx]!) continue;
          let highest = true;
          for (let dz = -reach; dz <= reach && highest; dz++) {
            for (let dx = -reach; dx <= reach; dx++) {
              if ((dx !== 0 || dz !== 0) && s.height[(iz + dz) * s.nx + ix + dx]! >= h) {
                highest = false;
                break;
              }
            }
          }
          if (highest) swells++;
        }
      }
      expect(swells, `stream ${k}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('stays below the snow line', () => {
    for (const k of STREAMS) expect(surveyed('hills', k).highest).toBeLessThan(config.world.cover.snowHeight[0]);
  });

  it('has soft, rounded tops', () => {
    for (const k of STREAMS) {
      const form = make('hills', k);
      const top = form.height(AT.x, AT.z);
      for (const [ux, uz] of DIRECTIONS) {
        expect(top - form.height(AT.x + ux * 20, AT.z + uz * 20), `stream ${k}`).toBeLessThanOrEqual(3);
      }
    }
  });
});

/** Distance from the main summit to the edge of the foot, in each of `count` directions. */
function footRadii(form: Landform, count: number): number[] {
  const { x, z } = form.summits[0]!;
  const radii: number[] = [];
  for (let i = 0; i < count; i++) {
    const ux = Math.cos((i * 2 * Math.PI) / count);
    const uz = Math.sin((i * 2 * Math.PI) / count);
    let r = 0;
    while (form.height(x + ux * (r + 3), z + uz * (r + 3)) > 0.5) r += 3;
    radii.push(r);
  }
  return radii;
}

function nearestIndex(points: readonly { x: number; z: number }[], x: number, z: number): number {
  let best = 0;
  let bestDistance = Infinity;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best;
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function correlation(a: readonly number[], b: readonly number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += (a[i]! - ma) * (b[i]! - mb);
    aa += (a[i]! - ma) ** 2;
    bb += (b[i]! - mb) ** 2;
  }
  return ab / Math.sqrt(aa * bb);
}
