import type { DaylightConfig } from '../config';
import { SKY_COLOURS, type Rgb } from './palette';

/**
 * The light of one moment of the day, as plain numbers. The 3D view copies
 * these into its lights, sky and water; nothing here knows about Three.js.
 * Colours are ordinary screen colours (sRGB), each channel 0 to 1.
 */
export interface Daylight {
  /** Unit vector from the ground towards the sun: +x east, +y up, +z south. */
  sun: { x: number; y: number; z: number };
  /** Height of the sun above the horizon, in radians. */
  elevation: number;
  /** How far the sky is towards its day colours (1) from its night ones (0). */
  day: number;
  /** How strong the warm glow of a low sun is, 0 to 1. */
  sunset: number;
  zenith: Rgb;
  horizon: Rgb;
  /** The warm glow round a low sun, already scaled by its strength. */
  glow: Rgb;
  /** The haze over distant things, which is also the colour of the sky at the horizon. */
  haze: Rgb;
  sunDisc: Rgb;
  /** The sun's light: its colour and strength. */
  sunColour: Rgb;
  sunStrength: number;
  /** Light from the whole sky above, and bounced up from the ground below, and their strength. */
  skyLight: Rgb;
  groundLight: Rgb;
  skyStrength: number;
  /** The colour the water reflects at low angles, and the colour of the sun's glints on it. */
  waterSky: Rgb;
  waterGlint: Rgb;
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth = ([from, to]: readonly [number, number], value: number): number => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add = (a: Rgb, b: Rgb, share: number): Rgb => [a[0] + b[0] * share, a[1] + b[1] * share, a[2] + b[2] * share];
const scale = (a: Rgb, share: number): Rgb => [a[0] * share, a[1] * share, a[2] * share];
const limit = (a: Rgb): Rgb => [clamp01(a[0]), clamp01(a[1]), clamp01(a[2])];

/**
 * The light at an hour of the day.
 *
 * The sun rises at `cfg.sunrise` at the compass bearing given, climbs to
 * `cfg.highestSun` degrees halfway to sunset, and sweeps half a circle of the
 * compass on the way, so it sets opposite where it rose. The colour blends are
 * the island demo's, measured on the sun's height (the upward part of the
 * vector towards it).
 *
 * @param hour hours since midnight
 * @param bearing compass bearing of sunrise, in radians: 0 north (-z), a quarter turn east (+x)
 */
export function daylightAt(hour: number, bearing: number, cfg: DaylightConfig): Daylight {
  const through = (hour - cfg.sunrise) / (cfg.sunset - cfg.sunrise);
  const elevation = ((cfg.highestSun * Math.PI) / 180) * Math.sin(Math.PI * clamp01(through));
  const compass = bearing + Math.PI * through;
  const level = Math.cos(elevation);
  const sun = { x: level * Math.sin(compass), y: Math.sin(elevation), z: -level * Math.cos(compass) };
  const height = sun.y;

  const day = smooth(cfg.dayBlend, height);
  const sunset = smooth(cfg.sunsetIn, height) * (1 - smooth(cfg.sunsetOut, height));
  const c = SKY_COLOURS;

  const zenith = mix(c.zenithNight, c.zenithDay, day);
  const horizon = mix(c.horizonNight, c.horizonDay, day);
  const glow = scale(c.glow, sunset * cfg.glow);
  const haze = add(horizon, glow, cfg.hazeGlow);

  const sunColour = mix(c.sunLow, c.sunHigh, smooth(cfg.sunColourBlend, height));
  const sunShare = cfg.lowSun + (1 - cfg.lowSun) * smooth(cfg.sunRamp, height);

  return {
    sun,
    elevation,
    day,
    sunset,
    zenith,
    horizon,
    glow,
    haze: limit(haze),
    sunDisc: mix(c.discLow, c.discHigh, smooth(cfg.discBlend, height)),
    sunColour,
    sunStrength: cfg.sunStrength * sunShare,
    skyLight: mix(mix(c.skyNight, c.skyDay, day), c.skySunset, sunset * cfg.skySunset),
    groundLight: mix(c.groundNight, c.groundDay, day),
    skyStrength: cfg.skyStrength * (cfg.lowSky + (1 - cfg.lowSky) * day),
    waterSky: limit(add(mix(horizon, zenith, cfg.waterZenith), glow, cfg.waterGlow)),
    waterGlint: scale(sunColour, sunShare),
  };
}
