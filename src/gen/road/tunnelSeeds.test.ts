import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../generate';
import { generateTrack } from '../track/pipeline';
import type { Candidate, TrackResult } from '../types';
import { bridgedMask, spanLength } from './bridges';
import { cutAndFill } from './profile';
import { checkTunnelStart } from './tunnels';

const winnerOf = (result: TrackResult): Candidate => result.candidates[result.winnerIndex]!;

describe('tunnels on real seeds (M6.2a)', () => {
  const tracks = Array.from({ length: 40 }, (_, k) => generateTrack(k + 1, config));

  it('keeps every winner of seeds 1 to 40 within 8 m of cut off its tunnels, each tunnel within the longest, off the bridges and clear of the start line', { timeout: 60_000 }, () => {
    for (const track of tracks) {
      const winner = winnerOf(track);
      const n = winner.line.count;
      const tunnelled = bridgedMask(winner.tunnels, n);
      const bridged = bridgedMask(winner.bridges, n);
      for (let i = 0; i < n; i++) {
        if (!tunnelled[i]) expect(cutAndFill(i, winner.profile).cut, `seed ${track.seed} sample ${i}`).toBeLessThanOrEqual(config.road.maxCut);
        else expect(bridged[i], `seed ${track.seed} sample ${i} on a bridge and in a tunnel`).toBe(0);
      }
      for (const span of winner.tunnels) expect(spanLength(span, winner.line.spacing)).toBeLessThanOrEqual(config.road.tunnels.maxLength);
      // The winner's lap starts at sample 0.
      expect(checkTunnelStart(winner.line, winner.tunnels, 0, config.road), `seed ${track.seed}`).toEqual([]);
    }
  });

  it('gives some of seeds 1 to 40 a tunnel, each under more than 8 m of ground somewhere', () => {
    const tunnelled = tracks.filter((track) => winnerOf(track).tunnels.length > 0);
    expect(tunnelled.map((t) => t.seed)).toEqual(expect.arrayContaining([11, 13, 35]));
    for (const track of tunnelled) {
      const winner = winnerOf(track);
      for (const span of winner.tunnels) {
        let deepest = 0;
        for (let k = 0; k < span.sampleCount; k++) deepest = Math.max(deepest, cutAndFill((span.startIndex + k) % winner.line.count, winner.profile).cut);
        expect(deepest, `seed ${track.seed}`).toBeGreaterThan(config.road.maxCut);
      }
    }
  });

  it('hands the winner’s tunnels to the world’s road, numbered from the start line', { timeout: 30_000 }, () => {
    const world = generateWorld(11, config);
    expect(world.road.tunnels.spans.length).toBeGreaterThan(0);
    expect(world.road.tunnels.spans).toEqual(winnerOf(world.track).tunnels);
  });
});
