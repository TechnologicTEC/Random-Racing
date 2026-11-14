/**
 * The colours of the world. Everything here is in ordinary screen colour
 * (sRGB), each channel from 0 to 1; `toLinear` converts for Three.js, which
 * does its lighting sums in linear light.
 */

export type Rgb = [number, number, number];

export const TERRAIN = {
  /** Grass runs between these two with the variation map: lush to dry. */
  grassLush: [0.21, 0.42, 0.14] as Rgb,
  grassDry: [0.4, 0.48, 0.2] as Rgb,
  /** Bare ground where nothing grows: road verges and fresh banks. */
  earth: [0.46, 0.38, 0.27] as Rgb,
  sand: [0.87, 0.8, 0.6] as Rgb,
  /** Sand just under the water, and the sea bed further down. */
  sandWet: [0.66, 0.6, 0.45] as Rgb,
  seaBed: [0.36, 0.42, 0.4] as Rgb,
  /** Rock runs between these two with the variation map. */
  rockLight: [0.52, 0.49, 0.46] as Rgb,
  rockDark: [0.38, 0.36, 0.35] as Rgb,
  snow: [0.95, 0.96, 0.98] as Rgb,
};

/** The road and its paint. */
export const ROAD = {
  asphalt: [0.26, 0.265, 0.275] as Rgb,
  line: [0.93, 0.93, 0.9] as Rgb,
  /** The apron folded down from each edge: packed earth. */
  shoulder: [0.4, 0.34, 0.26] as Rgb,
  kerbRed: [0.8, 0.13, 0.11] as Rgb,
  kerbWhite: [0.94, 0.94, 0.92] as Rgb,
  /** The barrier wall: plain concrete, and its red and white blocks on the outside of corners. */
  barrier: [0.74, 0.74, 0.71] as Rgb,
  barrierRed: [0.78, 0.15, 0.13] as Rgb,
  barrierWhite: [0.93, 0.93, 0.91] as Rgb,
  /** The dark squares of the start line. */
  startDark: [0.07, 0.07, 0.08] as Rgb,
  /** The start gate: dark posts and a pale beam. */
  gate: [0.16, 0.17, 0.2] as Rgb,
  gateBeam: [0.9, 0.9, 0.88] as Rgb,
};

/** The sea: deep and shallow water, and foam. From the island demo. */
export const WATER = {
  deep: [0.03, 0.19, 0.3] as Rgb,
  shallow: [0.13, 0.62, 0.6] as Rgb,
  foam: [0.92, 0.96, 0.97] as Rgb,
};

/** Trees, from the island demo; the palm is our own. Each list is the shades of one tree's leaves. */
export const TREES = {
  bark: [0.34, 0.24, 0.16] as Rgb,
  pine: [
    [0.15, 0.32, 0.19],
    [0.17, 0.36, 0.21],
    [0.19, 0.4, 0.23],
  ] as Rgb[],
  broadleaf: [
    [0.29, 0.49, 0.19],
    [0.33, 0.53, 0.21],
    [0.27, 0.46, 0.18],
  ] as Rgb[],
  palmTrunk: [0.47, 0.37, 0.25] as Rgb,
  palm: [
    [0.25, 0.5, 0.2],
    [0.32, 0.56, 0.22],
  ] as Rgb[],
};

/** Wildflowers among the long grass: white, yellow and red, in the order of a blade's flower number. */
export const FLOWERS: Rgb[] = [
  [0.97, 0.96, 0.9],
  [0.96, 0.8, 0.18],
  [0.86, 0.2, 0.2],
];

/** Boulders and shore rocks. */
export const ROCKS = {
  boulder: [0.525, 0.5, 0.48] as Rgb,
};

/** Clouds: white. Their shaded sides are lit by the sky (see `cloudGlow`). */
export const CLOUDS = {
  puff: [1, 1, 1] as Rgb,
};

/**
 * The colours of the sky and its light, from the island demo. Each comes as a
 * day colour and the colour it turns towards as the sun nears the horizon (the
 * "night" end is only ever partly reached: the sun never sets in the game).
 * The day colours of the lights are the 3D page's plain daylight from before the sky.
 */
export const SKY_COLOURS = {
  zenithDay: [0.22, 0.47, 0.84] as Rgb,
  zenithNight: [0.01, 0.018, 0.05] as Rgb,
  horizonDay: [0.66, 0.81, 0.93] as Rgb,
  horizonNight: [0.04, 0.06, 0.12] as Rgb,
  /** The warm glow round a low sun. */
  glow: [1.0, 0.45, 0.18] as Rgb,
  /** The sun's light, low and high. */
  sunLow: [1.0, 0.55, 0.3] as Rgb,
  sunHigh: [1.0, 0.957, 0.878] as Rgb,
  /** The sun's disc in the sky, low and high. */
  discLow: [1.0, 0.6, 0.32] as Rgb,
  discHigh: [1.0, 0.97, 0.9] as Rgb,
  /** Light from the sky above, and bounced up from the ground. */
  skyDay: [0.812, 0.89, 0.961] as Rgb,
  skyNight: [0.17, 0.21, 0.36] as Rgb,
  skySunset: [0.85, 0.58, 0.48] as Rgb,
  groundDay: [0.42, 0.373, 0.29] as Rgb,
  groundNight: [0.04, 0.04, 0.06] as Rgb,
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
const ramp = (from: number, to: number, value: number): number => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

/**
 * The colour of a point on the ground, from its height and what covers it.
 *
 * @param height metres above the sea (negative under water)
 * @param grass, sand, rock, snow how much of each covers the point, 0 to 1. Snow lies over the rest
 * @param variation 0 for lush ground, 1 for dry
 */
export function terrainColour(height: number, grass: number, sand: number, rock: number, snow: number, variation: number): Rgb {
  let colour = mix(TERRAIN.earth, mix(TERRAIN.grassLush, TERRAIN.grassDry, variation), clamp01(grass));

  let sandColour = TERRAIN.sand;
  if (height < 0) {
    // Under water the sand darkens with depth.
    sandColour = mix(TERRAIN.sand, TERRAIN.sandWet, ramp(0, 3, -height));
    sandColour = mix(sandColour, TERRAIN.seaBed, ramp(3, 14, -height));
  }
  colour = mix(colour, sandColour, clamp01(sand));
  colour = mix(colour, mix(TERRAIN.rockLight, TERRAIN.rockDark, variation), clamp01(rock));
  colour = mix(colour, TERRAIN.snow, clamp01(snow));
  return colour;
}

/** Converts one channel of a screen colour to linear light. */
export function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}
