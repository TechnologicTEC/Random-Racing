import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen/generate';
import type { HeightField } from '../gen/types';
import { createField, sampleField, worldX, worldZ } from '../gen/world/heightfield';
import { daylightAt } from './daylight';
import { landLightAt, landShade } from './terrainShade';

const cfg = config.render.shadows.land;

/** Ground from a formula, on a square of `extent` metres with heights `cell` metres apart. */
function ground(extent: number, cell: number, heightAt: (x: number, z: number) => number): HeightField {
  const field = createField(extent, cell);
  for (let iz = 0; iz < field.size; iz++) {
    for (let ix = 0; ix < field.size; ix++) field.height[iz * field.size + ix] = heightAt(worldX(field, ix), worldZ(field, iz));
  }
  return field;
}

/** The sun at `elevation` radians above the horizon, in the direction (dx, dz) across the map. */
function sunAt(elevation: number, dx: number, dz: number): { x: number; y: number; z: number } {
  const across = Math.hypot(dx, dz);
  return { x: (Math.cos(elevation) * dx) / across, y: Math.sin(elevation), z: (Math.cos(elevation) * dz) / across };
}

/** The share of the sun reaching the ground itself at a point. */
const onGround = (shade: ReturnType<typeof landShade>, field: HeightField, x: number, z: number): number =>
  landLightAt(shade, x, Math.max(0, sampleField(field, x, z, 0)), z);

describe('landShade: where the land itself keeps the sun off', () => {
  it('leaves flat ground in full sun, even with the sun low', () => {
    const field = ground(200, 2, () => 5);
    const shade = landShade(field, sunAt(0.12, 1, 0.3), cfg);
    for (let x = -90; x <= 90; x += 7) for (let z = -90; z <= 90; z += 7) expect(onGround(shade, field, x, z)).toBe(1);
  });

  it('casts a wall s shadow away from the sun, as long as its height over the sun s slope', () => {
    // A wall 20 m tall and 4 m thick along z, at x = 0. The sun is in the east (+x), climbing 1 m in 4.
    const field = ground(400, 2, (x) => (Math.abs(x) <= 2 ? 20 : 0));
    const shade = landShade(field, sunAt(Math.atan(0.25), 1, 0), cfg);
    // The shadow reaches 80 m west of the wall.
    for (const x of [-10, -30, -50, -70]) expect(onGround(shade, field, x, 0)).toBe(0);
    for (const x of [-95, -120]) expect(onGround(shade, field, x, 0)).toBe(1);
    // The sunny side is lit.
    for (const x of [10, 40]) expect(onGround(shade, field, x, 0)).toBe(1);
  });

  it('casts a shadow the right way when the sun is between the grid s directions', () => {
    // A pillar 30 m tall and 10 m across. The sun is in the south-east, climbing 1 m in 2: a shadow 60 m long, to the north-west.
    const field = ground(400, 2, (x, z) => (Math.abs(x) <= 5 && Math.abs(z) <= 5 ? 30 : 0));
    const shade = landShade(field, sunAt(Math.atan(0.5), 1, 1), cfg);
    const along = (d: number): [number, number] => [-d / Math.SQRT2, -d / Math.SQRT2];
    for (const d of [15, 30, 45]) expect(onGround(shade, field, ...along(d))).toBe(0);
    expect(onGround(shade, field, ...along(85))).toBe(1);
    // Beside the shadow, and on the sunny side, it is light.
    expect(onGround(shade, field, 25, -25)).toBe(1);
    expect(onGround(shade, field, 25, 25)).toBe(1);
  });

  it('lights a summit, whatever the sun', () => {
    const field = ground(600, 3, (x, z) => Math.max(0, 120 - Math.hypot(x, z) * 0.8));
    for (const [elevation, dx, dz] of [[0.12, 1, 0], [0.4, -1, 0.5], [1, 0.2, -1]] as const) {
      expect(onGround(landShade(field, sunAt(elevation, dx, dz), cfg), field, 0, 0)).toBe(1);
    }
  });

  it('casts no long shadows from a high sun', () => {
    // A hill 50 m tall whose sides climb 1 m in 3. With the sun climbing about 1.7 m in 1, nothing past its foot is shaded.
    const field = ground(600, 3, (x, z) => Math.max(0, 50 - Math.hypot(x, z) / 3));
    const shade = landShade(field, sunAt(1.05, 1, 0.2), cfg);
    for (let a = 0; a < 6.28; a += 0.4) {
      for (const r of [170, 220]) expect(onGround(shade, field, r * Math.cos(a), r * Math.sin(a))).toBe(1);
    }
  });

  it('lets the sun reach something standing high enough out of a shadow', () => {
    const field = ground(400, 2, (x) => (Math.abs(x) <= 2 ? 20 : 0));
    const shade = landShade(field, sunAt(Math.atan(0.25), 1, 0), cfg);
    // 40 m west of the wall the shadow's top is 10 m up: a tree crown at 15 m is lit, a bush at 3 m is not.
    expect(landLightAt(shade, -40, 15, 0)).toBe(1);
    expect(landLightAt(shade, -40, 3, 0)).toBe(0);
  });

  it('shades the sea surface, not the sea bed, under a cliff', () => {
    // A cliff 30 m tall at x = 0 with sea to the west of it, 10 m deep. The sun is in the east, climbing 1 m in 2.
    const field = ground(400, 2, (x) => (x >= 0 ? 30 : -10));
    const shade = landShade(field, sunAt(Math.atan(0.5), 1, 0), cfg);
    // The shadow on the water ends 60 m out.
    expect(landLightAt(shade, -30, 0, 0)).toBe(0);
    expect(landLightAt(shade, -80, 0, 0)).toBe(1);
  });

  it('fades the edge of a shadow over a few metres, not in a step', () => {
    const field = ground(400, 1, (x) => (Math.abs(x) <= 1 ? 20 : 0));
    const shade = landShade(field, sunAt(Math.atan(0.25), 1, 0), cfg);
    const across: number[] = [];
    for (let x = -100; x <= -60; x += 0.5) across.push(onGround(shade, field, x, 0));
    const between = across.filter((light) => light > 0.05 && light < 0.95).length;
    // Some points part lit, but the edge is no wider than about twice the configured soft edge.
    expect(between).toBeGreaterThan(0);
    expect(between * 0.5).toBeLessThanOrEqual(cfg.edge * 2);
  });

  it('gives the same shade every time', () => {
    const field = ground(300, 3, (x, z) => 20 * Math.sin(x / 40) * Math.cos(z / 30));
    const sun = sunAt(0.2, 0.6, -1);
    expect(Array.from(landShade(field, sun, cfg).top)).toEqual(Array.from(landShade(field, sun, cfg).top));
  });

  describe('on a real island', () => {
    // Seed 1 is a mountain seed.
    const world = generateWorld(1, config);
    const field = world.ground;
    /** The share of the island's land in shadow at an hour of the day. */
    const shadedAt = (hour: number): number => {
      const { sun } = daylightAt(hour, world.sky.bearing, config.render.daylight);
      const shade = landShade(field, sun, cfg);
      let land = 0;
      let dark = 0;
      for (let c = 0; c < field.height.length; c += 7) {
        if (field.height[c]! <= 0) continue;
        land++;
        const x = worldX(field, c % field.size);
        const z = worldZ(field, Math.floor(c / field.size));
        if (landLightAt(shade, x, field.height[c]!, z) < 0.5) dark++;
      }
      return dark / land;
    };

    it('has long shadows in the early morning and few at midday', () => {
      const morning = shadedAt(7);
      const midday = shadedAt(13);
      expect(morning).toBeGreaterThan(0.05);
      expect(midday).toBeLessThan(morning / 3);
    });

    it('is quick to work out, as it is done on the page whenever the time of day moves', () => {
      const { sun } = daylightAt(7, world.sky.bearing, config.render.daylight);
      const times: number[] = [];
      for (let k = 0; k < 3; k++) {
        const start = performance.now();
        landShade(field, sun, cfg);
        times.push(performance.now() - start);
      }
      // A loose limit that only catches a blunder; the real time is recorded in STATE.md.
      expect(Math.min(...times)).toBeLessThan(1000);
    });
  });
});
