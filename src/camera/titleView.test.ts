import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import { titleOrbit } from './orbitFit';
import { lapRing } from './orbitFit';
import { trackShown, type PictureBox } from '../testing/titleView';

/**
 * The camera behind the title and results cards (Tane, after the check-in after M4.4): close in round the track, not
 * the whole island or the whole lap, since it turns and shows the rest in time. Measured as the share of the lap shown
 * round the card and above the bar of buttons, at eight compass angles on each of seeds 1 to 20.
 */
// The card in the middle and the bar along the bottom of a 1280 by 720 picture, in its -1 to 1.
const CARD: PictureBox = { left: -0.28, right: 0.28, bottom: -0.37, top: 0.37 };
const BAR = -0.8;
const worlds = Array.from({ length: 20 }, (_, i) => generateWorld(i + 1, config));

describe('titleOrbit', () => {
  it('circles the middle of the lap, 1.2 times its radius away, at the opening tilt', () => {
    const world = worlds[6]!;
    const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
    const { centre, radius } = lapRing(line, profile.height);
    const orbit = titleOrbit(line, profile.height, () => 0, config.camera.orbit);
    expect(config.camera.orbit.title).toBe(1.2);
    expect(orbit.targetX).toBeCloseTo(centre.x, 9);
    expect(orbit.targetZ).toBeCloseTo(centre.z, 9);
    expect(orbit.distance).toBeCloseTo(1.2 * radius, 6);
    expect(orbit.tilt).toBe(config.camera.orbit.start.tilt);
  });

  it('never circles a point under the ground', () => {
    const world = worlds[6]!;
    const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
    expect(titleOrbit(line, profile.height, () => 500, config.camera.orbit).targetY).toBe(500);
  });

  it('shows two thirds of the lap round the card on average, and never under two fifths, whichever way it faces', { timeout: 60_000 }, () => {
    const shares: number[] = [];
    for (const world of worlds) {
      const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
      const orbit = titleOrbit(line, profile.height, (x, z) => 0 * x * z, config.camera.orbit);
      for (let k = 0; k < 8; k++) {
        shares.push(trackShown(line, profile.height, { ...orbit, angle: (k * Math.PI) / 4 }, config.render.fieldOfView, 16 / 9, [CARD], BAR));
      }
    }
    const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
    expect(mean).toBeGreaterThan(0.64);
    expect(Math.min(...shares)).toBeGreaterThan(0.4);
  });
});
