import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { daylightAt, type Daylight } from './daylight';

const cfg = config.render.daylight;
const EAST = Math.PI / 2;
const degrees = (radians: number): number => (radians * 180) / Math.PI;
const at = (hour: number, bearing = EAST): Daylight => daylightAt(hour, bearing, cfg);
const warmth = (rgb: readonly number[]): number => rgb[0]! / rgb[2]!;

describe('daylightAt', () => {
  it('puts the sun highest halfway between sunrise and sunset', () => {
    const noon = (cfg.sunrise + cfg.sunset) / 2;
    const top = at(noon).elevation;
    expect(degrees(top)).toBeCloseTo(cfg.highestSun, 6);
    for (let hour = 7; hour <= 19.5; hour += 0.25) expect(at(hour).elevation).toBeLessThanOrEqual(top + 1e-12);
    expect(at(noon - 2).elevation).toBeCloseTo(at(noon + 2).elevation, 12);
  });

  it('keeps the sun at least 5 degrees up from 07:00 to 19:30, and lowest at either end', () => {
    for (let hour = 7; hour <= 19.5; hour += 1 / 60) expect(degrees(at(hour).elevation)).toBeGreaterThanOrEqual(5);
    expect(degrees(at(7).elevation)).toBeLessThan(15);
    expect(degrees(at(19.5).elevation)).toBeLessThan(15);
  });

  it('gives the direction towards the sun as a unit vector that matches the elevation', () => {
    for (const hour of [7, 10, 13.25, 16.5, 19.5]) {
      const { sun, elevation } = at(hour, 1.1);
      expect(Math.hypot(sun.x, sun.y, sun.z)).toBeCloseTo(1, 12);
      expect(sun.y).toBeCloseTo(Math.sin(elevation), 12);
    }
  });

  it('rises at the bearing and passes the opposite side of the sky at midday', () => {
    // Rising in the east (+x), it stands in the south (+z) at midday and sets in the west (-x).
    const early = at(cfg.sunrise + 0.01).sun;
    expect(early.x).toBeGreaterThan(0.99);
    const noon = at((cfg.sunrise + cfg.sunset) / 2).sun;
    expect(noon.z).toBeGreaterThan(0.4);
    expect(Math.abs(noon.x)).toBeLessThan(1e-9);
    expect(at(cfg.sunset - 0.01).sun.x).toBeLessThan(-0.99);
  });

  it('turns the sun’s path with the bearing', () => {
    // Rising in the north (-z) instead, at the same hour it is a quarter turn round.
    const east = at(9, EAST).sun;
    const north = at(9, 0).sun;
    expect(north.x).toBeCloseTo(east.z, 12);
    expect(north.z).toBeCloseTo(-east.x, 12);
    expect(north.y).toBeCloseTo(east.y, 12);
  });

  it('makes evening light warmer and weaker than midday light', () => {
    const midday = at(13);
    const evening = at(19);
    expect(warmth(evening.sunColour)).toBeGreaterThan(warmth(midday.sunColour) * 1.3);
    expect(evening.sunStrength).toBeLessThan(midday.sunStrength * 0.85);
    expect(warmth(evening.haze)).toBeGreaterThan(warmth(midday.haze));
    expect(evening.sunset).toBeGreaterThan(0.5);
    expect(midday.sunset).toBe(0);
  });

  it('matches the light of the 3D page before the sky arrived at 13:00', () => {
    const midday = at(13);
    expect(midday.sunStrength).toBeCloseTo(cfg.sunStrength, 6);
    expect(midday.skyStrength).toBeCloseTo(cfg.skyStrength, 6);
    expect(cfg.sunStrength).toBe(2.4);
    expect(cfg.skyStrength).toBe(1.5);
  });

  it('uses the horizon colour, warmed by the glow, as the haze', () => {
    for (const hour of [7, 12, 18.5]) {
      const light = at(hour);
      for (let c = 0; c < 3; c++) expect(light.haze[c]).toBeCloseTo(light.horizon[c]! + light.glow[c]! * cfg.hazeGlow, 12);
    }
  });

  it('changes smoothly: nothing jumps between one minute and the next from 07:00 to 19:30', () => {
    const colours = (light: Daylight): number[] => [
      ...light.zenith, ...light.horizon, ...light.haze, ...light.sunColour, ...light.sunDisc,
      ...light.skyLight, ...light.groundLight, ...light.waterSky, ...light.waterGlint,
    ];
    let previous = at(7);
    for (let minute = 7 * 60 + 1; minute <= 19.5 * 60; minute++) {
      const light = at(minute / 60);
      const a = colours(previous);
      const b = colours(light);
      // A minute moves the sun by under half a degree; a jump in a blend would show as many times this.
      for (let k = 0; k < a.length; k++) expect(Math.abs(b[k]! - a[k]!)).toBeLessThan(0.02);
      expect(Math.abs(light.sunStrength - previous.sunStrength)).toBeLessThan(0.02);
      expect(Math.abs(light.skyStrength - previous.skyStrength)).toBeLessThan(0.02);
      previous = light;
    }
  });

  it('keeps every colour a screen colour from 0 to 1', () => {
    for (let hour = 7; hour <= 19.5; hour += 0.5) {
      const light = at(hour);
      for (const rgb of [light.zenith, light.horizon, light.glow, light.haze, light.sunColour, light.sunDisc, light.skyLight, light.groundLight, light.waterSky, light.waterGlint]) {
        for (const channel of rgb) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
