import { describe, expect, it } from 'vitest';
import { config } from '../config';
import type { Clouds } from '../gen/types';
import { pickClouds } from '../gen/world/clouds';
import { cloudDrift, cloudGlow, cloudMatrices, type CloudDrift } from './clouds';
import { daylightAt } from './daylight';

/** Two clouds: one in the middle of a 7 km square with two puffs, one 10 m short of its east edge with one. */
const clouds: Clouds = {
  cover: 'clear',
  span: 7000,
  count: 2,
  x: new Float32Array([100, 3490]),
  z: new Float32Array([-200, 50]),
  puffCount: 3,
  puffCloud: new Uint16Array([0, 0, 1]),
  puffX: new Float32Array([-40, 60, 0]),
  puffY: new Float32Array([400, 420, 500]),
  puffZ: new Float32Array([10, -20, 0]),
  puffSize: new Float32Array([50, 30, 40]),
  puffThick: new Float32Array([30, 18, 24]),
};
const drift: CloudDrift = { x: 8, z: 3, fade: 400 };

/** Where puff `p` is, and how big, in a list of matrices. */
function puff(matrices: Float32Array, p: number): { x: number; y: number; z: number; wide: number; thick: number; deep: number } {
  const m = matrices.subarray(p * 16, p * 16 + 16);
  return { x: m[12]!, y: m[13]!, z: m[14]!, wide: m[0]!, thick: m[5]!, deep: m[10]! };
}

describe('cloudDrift', () => {
  it('blows the clouds down the wind at the speed given', () => {
    const blown = cloudDrift([3, 4], 10, 400);
    expect(blown.x).toBeCloseTo(6, 6);
    expect(blown.z).toBeCloseTo(8, 6);
    expect(blown.fade).toBe(400);
  });

  it('follows the wind that drives the waves', () => {
    const blown = cloudDrift(config.render.water.wind, config.render.clouds.speed, config.render.clouds.edgeFade);
    expect(Math.hypot(blown.x, blown.z)).toBeCloseTo(config.render.clouds.speed, 6);
    expect(blown.x * config.render.water.wind[1]).toBeCloseTo(blown.z * config.render.water.wind[0], 6);
  });
});

describe('cloudGlow', () => {
  const daylight = config.render.daylight;
  const midday = daylightAt(13, 0, daylight);
  const evening = daylightAt(19.25, 0, daylight);

  it('lights the shaded sides of the clouds with a share of the light from the sky', () => {
    const glow = cloudGlow(midday, 0.5, daylight.skyStrength);
    for (let c = 0; c < 3; c++) expect(glow[c]).toBeCloseTo(midday.skyLight[c]! * 0.5 * (midday.skyStrength / daylight.skyStrength), 6);
    expect(cloudGlow(midday, 0, daylight.skyStrength)).toEqual([0, 0, 0]);
  });

  it('dims and warms with the evening', () => {
    const day = cloudGlow(midday, config.render.clouds.glow, daylight.skyStrength);
    const late = cloudGlow(evening, config.render.clouds.glow, daylight.skyStrength);
    expect(late[0] + late[1] + late[2]).toBeLessThan(day[0] + day[1] + day[2]);
    expect(late[0] / late[2]).toBeGreaterThan(day[0] / day[2]);
  });
});

describe('cloudMatrices', () => {
  it('gives 16 numbers per puff: a plain matrix with no turn in it', () => {
    const matrices = cloudMatrices(clouds, 0, drift);
    expect(matrices).toHaveLength(3 * 16);
    for (let p = 0; p < 3; p++) {
      const m = matrices.subarray(p * 16, p * 16 + 16);
      for (const off of [1, 2, 3, 4, 6, 7, 8, 9, 11]) expect(m[off]).toBe(0);
      expect(m[15]).toBe(1);
    }
  });

  it('starts every puff where the seed put it: its cloud s middle plus its own offset', () => {
    const matrices = cloudMatrices(clouds, 0, drift);
    expect(puff(matrices, 0)).toMatchObject({ x: 60, y: 400, z: -190 });
    expect(puff(matrices, 1)).toMatchObject({ x: 160, y: 420, z: -220 });
  });

  it('makes each puff as wide as its size and as thick as its thickness', () => {
    const matrices = cloudMatrices(clouds, 0, drift);
    expect(puff(matrices, 0)).toMatchObject({ wide: 50, thick: 30, deep: 50 });
    expect(puff(matrices, 1)).toMatchObject({ wide: 30, thick: 18, deep: 30 });
  });

  it('carries a cloud down the wind, all its puffs together, at a steady height', () => {
    const later = cloudMatrices(clouds, 10, drift);
    expect(puff(later, 0)).toMatchObject({ x: 60 + 80, y: 400, z: -190 + 30 });
    expect(puff(later, 1)).toMatchObject({ x: 160 + 80, y: 420, z: -220 + 30 });
  });

  it('brings a cloud that leaves one edge of the square back in at the other', () => {
    // The second cloud is 10 m short of the east edge: 2.5 s at 8 m/s takes it 10 m past.
    const later = cloudMatrices(clouds, 2.5, drift);
    expect(puff(later, 2).x).toBeCloseTo(-3490, 3);
    for (const seconds of [0, 17, 400, 5000, 123456]) {
      const matrices = cloudMatrices(clouds, seconds, drift);
      for (let p = 0; p < 3; p++) {
        const cloud = clouds.puffCloud[p]!;
        expect(Math.abs(puff(matrices, p).x - clouds.puffX[p]!)).toBeLessThanOrEqual(3500);
        expect(Math.abs(puff(matrices, p).z - clouds.puffZ[p]!)).toBeLessThanOrEqual(3500);
        expect(cloud).toBeLessThan(2);
      }
    }
  });

  it('shrinks a cloud to nothing as it nears the edge, so it never pops in or out', () => {
    const start = cloudMatrices(clouds, 0, drift);
    // 10 m from the edge with a 400 m fade: nearly gone, but the same shape.
    expect(puff(start, 2).wide).toBeGreaterThan(0);
    expect(puff(start, 2).wide).toBeLessThan(40 * 0.01);
    expect(puff(start, 2).thick / puff(start, 2).wide).toBeCloseTo(24 / 40, 4);
    // Half way through the fade it is half grown; clear of it, full size.
    const half = cloudMatrices({ ...clouds, x: new Float32Array([100, 3300]) }, 0, drift);
    expect(puff(half, 2).wide).toBeCloseTo(20, 3);
    const clear = cloudMatrices({ ...clouds, x: new Float32Array([100, 3000]) }, 0, drift);
    expect(puff(clear, 2).wide).toBe(40);
    // Its size changes smoothly across the wrap: tiny just before the edge, tiny just after.
    const after = cloudMatrices(clouds, 2.5, drift);
    expect(puff(after, 2).wide).toBeLessThan(40 * 0.01);
  });

  it('thins a cloud away as the camera comes close, so the camera never sits inside one', () => {
    const thin: [number, number] = [80, 220];
    // The first puff is at (60, 400, -190).
    const far = cloudMatrices(clouds, 0, drift, undefined, { x: 60, y: 0, z: -190, thin });
    expect(puff(far, 0)).toMatchObject({ wide: 50, thick: 30 });
    const inside = cloudMatrices(clouds, 0, drift, undefined, { x: 60, y: 380, z: -190, thin });
    expect(puff(inside, 0).wide).toBe(0);
    // Half way between the two distances it is half grown, and keeps its shape.
    const between = cloudMatrices(clouds, 0, drift, undefined, { x: 60, y: 400 - 150, z: -190, thin });
    expect(puff(between, 0).wide).toBeCloseTo(25, 3);
    expect(puff(between, 0).thick).toBeCloseTo(15, 3);
    // A puff the camera is far from is left alone, and no puff moves.
    expect(puff(inside, 2)).toEqual(puff(cloudMatrices(clouds, 0, drift), 2));
    expect(puff(inside, 0)).toMatchObject({ x: 60, y: 400, z: -190 });
  });

  it('shows the same sky at the same moment', () => {
    expect(cloudMatrices(clouds, 123.4, drift)).toEqual(cloudMatrices(clouds, 123.4, drift));
    expect(cloudMatrices(clouds, 123.4, drift)).not.toEqual(cloudMatrices(clouds, 124.4, drift));
  });

  it('fills a list it is given instead of making a new one', () => {
    const out = new Float32Array(3 * 16);
    expect(cloudMatrices(clouds, 5, drift, out)).toBe(out);
    expect(out).toEqual(cloudMatrices(clouds, 5, drift));
  });

  it('handles a real seed s clouds', () => {
    const real = pickClouds(7, config.world.clouds, 200);
    const matrices = cloudMatrices(real, 60, cloudDrift(config.render.water.wind, config.render.clouds.speed, config.render.clouds.edgeFade));
    expect(matrices).toHaveLength(real.puffCount * 16);
    for (const value of matrices) expect(Number.isFinite(value)).toBe(true);
  });
});
