import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { createHasher } from '../../core/hash';
import { hashTrack } from '../track/hash';
import { generateTrack } from '../track/pipeline';
import { pickSky } from './sky';

const cfg = config.world.sky;
const all = Array.from({ length: 2000 }, (_, i) => pickSky(i + 1, cfg));
const TAU = 2 * Math.PI;

describe('pickSky', () => {
  it('gives the same seed the same sky every time', () => {
    for (const seed of [0, 1, 42, 48213, 4294967295]) expect(pickSky(seed, cfg)).toEqual(pickSky(seed, cfg));
  });

  it('is plain data: an hour and a bearing', () => {
    const sky = pickSky(7, cfg);
    expect(structuredClone(sky)).toEqual(sky);
    expect(Object.keys(sky).sort()).toEqual(['bearing', 'hour']);
  });

  it('picks a daylight hour from 07:00 to 19:30, in whole minutes', () => {
    for (const { hour } of all) {
      expect(hour).toBeGreaterThanOrEqual(cfg.hours[0]);
      expect(hour).toBeLessThanOrEqual(cfg.hours[1]);
      const minutes = hour * 60;
      expect(Math.abs(minutes - Math.round(minutes))).toBeLessThan(1e-9);
    }
  });

  it('spreads the hours evenly: each 2½-hour band holds about a fifth of 2000 seeds', () => {
    const [from, to] = cfg.hours;
    const band = (to - from) / 5;
    const counts = [0, 0, 0, 0, 0];
    for (const { hour } of all) counts[Math.min(4, Math.floor((hour - from) / band))]!++;
    for (const count of counts) expect(Math.abs(count / all.length - 0.2)).toBeLessThan(0.03);
  });

  it('spreads the bearing of the sun’s path evenly round the compass', () => {
    const counts = [0, 0, 0, 0];
    for (const { bearing } of all) {
      expect(bearing).toBeGreaterThanOrEqual(0);
      expect(bearing).toBeLessThan(TAU);
      counts[Math.floor((bearing / TAU) * 4)]!++;
    }
    for (const count of counts) expect(Math.abs(count / all.length - 0.25)).toBeLessThan(0.03);
  });

  it('gives different seeds different times', () => {
    expect(new Set(all.map((sky) => sky.hour)).size).toBeGreaterThan(500);
  });

  it('leaves every track exactly as it was: seeds 1 to 40', { timeout: 60_000 }, () => {
    // Fingerprint of the tracks of seeds 1 to 40, taken before the sky was added.
    const hasher = createHasher();
    for (let seed = 1; seed <= 40; seed++) hasher.text(hashTrack(generateTrack(seed, config)));
    expect(hasher.digest()).toBe('a6248f3e');
  });
});
