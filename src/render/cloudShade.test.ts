import { describe, expect, it } from 'vitest';
import { config } from '../config';
import type { CloudCover, Clouds } from '../gen/types';
import { pickClouds } from '../gen/world/clouds';
import { cloudDrift } from './clouds';
import { cloudLightAt, cloudShadeMap } from './cloudShade';

const cfg = config.render.shadows.clouds;
const strength = cfg.strength;

/** One cloud of one puff, 60 m across, 500 m up, at (x, z) in a square 6 km wide. */
function onePuff(x: number, z: number): Clouds {
  return {
    cover: 'clear',
    span: 6000,
    count: 1,
    x: new Float32Array([x]),
    z: new Float32Array([z]),
    puffCount: 1,
    puffCloud: new Uint16Array([0]),
    puffX: new Float32Array([0]),
    puffY: new Float32Array([500]),
    puffZ: new Float32Array([0]),
    puffSize: new Float32Array([60]),
    puffThick: new Float32Array([30]),
  };
}

const overhead = { x: 0, y: 1, z: 0 };
const still = { x: 0, z: 0, fade: 400 };

describe('cloudShadeMap and cloudLightAt: where the clouds keep the sun off', () => {
  it('darkens the ground under a cloud by the configured strength, and nowhere else', () => {
    const map = cloudShadeMap(onePuff(200, -100), cfg);
    expect(cloudLightAt(map, 200, 0, -100, overhead, still, 0, strength)).toBeCloseTo(1 - strength, 2);
    expect(cloudLightAt(map, 200 + 200, 0, -100, overhead, still, 0, strength)).toBe(1);
    expect(cloudLightAt(map, -500, 0, 700, overhead, still, 0, strength)).toBe(1);
  });

  it('gives a cloud s shadow a soft edge', () => {
    const map = cloudShadeMap(onePuff(0, 0), cfg);
    const middle = cloudLightAt(map, 0, 0, 0, overhead, still, 0, strength);
    const edge = cloudLightAt(map, 45, 0, 0, overhead, still, 0, strength);
    expect(edge).toBeGreaterThan(middle + 0.05);
    expect(edge).toBeLessThan(1);
  });

  it('casts the shadow away from the sun, further the lower the sun', () => {
    // A cloud 500 m up and the sun in the east, climbing 1 m in 2: the shadow falls 1000 m west of the cloud.
    const map = cloudShadeMap(onePuff(500, 0), cfg);
    const sun = { x: 2 / Math.sqrt(5), y: 1 / Math.sqrt(5), z: 0 };
    expect(cloudLightAt(map, -500, 0, 0, sun, still, 0, strength)).toBeCloseTo(1 - strength, 1);
    expect(cloudLightAt(map, 500, 0, 0, sun, still, 0, strength)).toBe(1);
    // Something 100 m up meets the shadow 200 m nearer the cloud.
    expect(cloudLightAt(map, -300, 100, 0, sun, still, 0, strength)).toBeCloseTo(1 - strength, 1);
  });

  it('moves the shadows down the wind with the clouds', () => {
    const map = cloudShadeMap(onePuff(-300, 200), cfg);
    const drift = cloudDrift([1, 0.3], 10, 400);
    for (const seconds of [0, 12, 40]) {
      const x = -300 + drift.x * seconds;
      const z = 200 + drift.z * seconds;
      expect(cloudLightAt(map, x, 0, z, overhead, drift, seconds, strength)).toBeCloseTo(1 - strength, 2);
    }
    expect(cloudLightAt(map, -300, 0, 200, overhead, drift, 40, strength)).toBe(1);
  });

  it('brings a shadow round again once its cloud has drifted all the way round the square', () => {
    const clouds = onePuff(-300, 200);
    const map = cloudShadeMap(clouds, cfg);
    const drift = { x: 10, z: 0, fade: 400 };
    const lap = clouds.span / drift.x;
    for (const [x, z] of [[-300, 200], [-260, 210], [0, 0]] as const) {
      expect(cloudLightAt(map, x, 0, z, overhead, drift, 30 + lap, strength)).toBeCloseTo(cloudLightAt(map, x, 0, z, overhead, drift, 30, strength), 5);
    }
  });

  it('fades a shadow away as its cloud nears the edge of the square, as the cloud itself shrinks', () => {
    // 6 km square: the edge is 3000 m out. A cloud 100 m from the edge is mostly shrunk away.
    const near = cloudShadeMap(onePuff(2900, 0), cfg);
    const far = cloudShadeMap(onePuff(1000, 0), cfg);
    const shadeOf = (light: number): number => 1 - light;
    expect(shadeOf(cloudLightAt(near, 2900, 0, 0, overhead, still, 0, strength))).toBeLessThan(shadeOf(cloudLightAt(far, 1000, 0, 0, overhead, still, 0, strength)) * 0.5);
  });

  it('shades more of the island the cloudier the seed s sky', () => {
    const share: Record<CloudCover, number[]> = { clear: [], fair: [], cloudy: [] };
    for (let seed = 1; seed <= 60; seed++) {
      const clouds = pickClouds(seed, config.world.clouds, 250);
      const map = cloudShadeMap(clouds, cfg);
      let dark = 0;
      let all = 0;
      for (let x = -1300; x <= 1300; x += 50) {
        for (let z = -1300; z <= 1300; z += 50) {
          all++;
          if (cloudLightAt(map, x, 0, z, overhead, still, 0, strength) < 1 - strength / 2) dark++;
        }
      }
      share[clouds.cover].push(dark / all);
    }
    const mean = (list: number[]): number => list.reduce((sum, v) => sum + v, 0) / Math.max(1, list.length);
    for (const cover of ['clear', 'fair', 'cloudy'] as const) expect(share[cover].length).toBeGreaterThan(3);
    expect(mean(share.clear)).toBeLessThan(mean(share.fair));
    expect(mean(share.fair)).toBeLessThan(mean(share.cloudy));
    // A cloudy sky leaves most of the island in sun: clouds are patches, not a lid.
    expect(mean(share.cloudy)).toBeGreaterThan(0.01);
    expect(mean(share.cloudy)).toBeLessThan(0.5);
  });

  it('gives the same map every time for the same clouds', () => {
    const clouds = pickClouds(7, config.world.clouds, 250);
    expect(Array.from(cloudShadeMap(clouds, cfg).data)).toEqual(Array.from(cloudShadeMap(clouds, cfg).data));
  });
});
