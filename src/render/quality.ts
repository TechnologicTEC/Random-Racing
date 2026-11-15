import type { RenderConfig } from '../config';

/** How much the page draws: everything (High) or a lighter picture for weaker machines (Low). */
export type QualityLevel = 'high' | 'low';

/** What a quality level draws: the render settings to build the view from, and the most pixels to draw in a frame. */
export interface QualitySettings {
  level: QualityLevel;
  render: RenderConfig;
  pixels: number;
}

/** Reads a quality level from the address or from storage. Anything that is not "low" is High. */
export function parseQuality(text: string | null | undefined): QualityLevel {
  return text?.trim().toLowerCase() === 'low' ? 'low' : 'high';
}

/**
 * The settings a quality level draws with. High is the config as it is. Low
 * draws fewer pixels, a third of the grass blades, only the longest waves,
 * smaller shadow maps reaching less far from high above, and full tree shapes only close by; it keeps every kind
 * of shadow (Tane's choice). Plain numbers: the config given is not changed.
 */
export function qualitySettings(render: RenderConfig, level: QualityLevel): QualitySettings {
  if (level === 'high') return { level, render, pixels: render.quality.high.pixels };
  const low = render.quality.low;
  return {
    level,
    pixels: low.pixels,
    render: {
      ...render,
      grass: { ...render.grass, tiers: render.grass.tiers.map((tier) => ({ ...tier, blades: Math.round(tier.blades * low.grass) })) },
      // The trains run longest first; the long ones carry the look of the sea from the road.
      water: { ...render.water, waves: render.water.waves.slice(0, low.waves) },
      shadows: {
        ...render.shadows,
        near: {
          ...render.shadows.near,
          mapSize: Math.min(render.shadows.near.mapSize, low.shadowMap),
          reach: [render.shadows.near.reach[0], Math.min(render.shadows.near.reach[1], low.shadowReach)],
        },
      },
      decor: { ...render.decor, detailDistance: Math.min(render.decor.detailDistance, low.treeDetail) },
    },
  };
}

/**
 * How many pixels to draw for each pixel of the page: as sharp as the screen
 * allows, but no more pixels in all than the budget, and never coarser than
 * one in two each way. The picture is stretched to fill the window.
 *
 * @param width the window's width in the page's own pixels (CSS pixels)
 * @param deviceRatio the screen's pixels for each of the page's
 * @param budget the most pixels to draw in a frame
 * @param max never sharper than this many pixels for each of the page's
 */
export function pixelRatioFor(width: number, height: number, deviceRatio: number, budget: number, max: number): number {
  const fit = Math.sqrt(budget / Math.max(1, width * height));
  return Math.max(0.5, Math.min(deviceRatio, max, fit));
}
