import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { parseQuality, pixelRatioFor, qualitySettings } from './quality';

const render = config.render;
const blades = (cfg: typeof render): number => cfg.grass.tiers.reduce((sum, tier) => sum + tier.blades, 0);

describe('qualitySettings: what each quality level draws', () => {
  it('draws High with the config s own settings', () => {
    const high = qualitySettings(render, 'high');
    expect(high.render).toEqual(render);
    expect(high.pixels).toBe(render.quality.high.pixels);
  });

  it('never draws more of anything on Low', () => {
    const low = qualitySettings(render, 'low');
    expect(low.pixels).toBeLessThan(render.quality.high.pixels);
    expect(blades(low.render)).toBeLessThan(blades(render));
    expect(low.render.grass.tiers).toHaveLength(render.grass.tiers.length);
    expect(low.render.water.waves.length).toBeLessThan(render.water.waves.length);
    expect(low.render.shadows.near.mapSize).toBeLessThanOrEqual(render.shadows.near.mapSize);
    expect(low.render.decor.detailDistance).toBeLessThanOrEqual(render.decor.detailDistance);
  });

  it('casts tree shadows no further than its own limit on Low, as from high above they are a pixel or two', () => {
    const low = qualitySettings(render, 'low');
    expect(low.render.shadows.near.reach[1]).toBe(Math.min(render.shadows.near.reach[1], render.quality.low.shadowReach));
    expect(low.render.shadows.near.reach[1]).toBeLessThan(render.shadows.near.reach[1]);
    expect(low.render.shadows.near.reach[0]).toBe(render.shadows.near.reach[0]);
  });

  it('keeps the longest waves on Low, which carry the look of the sea', () => {
    const low = qualitySettings(render, 'low');
    expect(low.render.water.waves).toEqual(render.water.waves.slice(0, low.render.water.waves.length));
  });

  it('keeps tree and barrier shadows on Low (Tane s choice)', () => {
    const low = qualitySettings(render, 'low');
    expect(low.render.shadows.near.mapSize).toBeGreaterThanOrEqual(512);
    expect(low.render.shadows.land).toEqual(render.shadows.land);
    expect(low.render.shadows.clouds).toEqual(render.shadows.clouds);
  });

  it('leaves the config it was given alone', () => {
    const before = JSON.stringify(render);
    qualitySettings(render, 'low');
    expect(JSON.stringify(render)).toBe(before);
  });
});

describe('parseQuality', () => {
  it('reads the two levels and takes anything else as High', () => {
    expect(parseQuality('low')).toBe('low');
    expect(parseQuality('high')).toBe('high');
    expect(parseQuality('LOW')).toBe('low');
    expect(parseQuality('ultra')).toBe('high');
    expect(parseQuality(null)).toBe('high');
  });
});

describe('pixelRatioFor: how sharply to draw within a budget of pixels', () => {
  const high = render.quality.high.pixels;
  const max = render.maxPixelRatio;

  it('draws a 1080p window in full on High', () => {
    expect(pixelRatioFor(1920, 1080, 1, high, max)).toBe(1);
  });

  it('holds the laptop s full screen (1440 by 900 at two pixels each) to the budget, but sharper than one pixel each', () => {
    const ratio = pixelRatioFor(1440, 900, 2, high, max);
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(2);
    expect(1440 * ratio * 900 * ratio).toBeLessThanOrEqual(high * 1.0001);
  });

  it('never draws sharper than the screen or the configured limit', () => {
    expect(pixelRatioFor(800, 600, 1, high, max)).toBe(1);
    expect(pixelRatioFor(400, 300, 3, high, max)).toBe(max);
  });

  it('never draws coarser than one pixel in two each way', () => {
    expect(pixelRatioFor(3840, 2160, 1, 100_000, max)).toBe(0.5);
  });
});
