import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../generate';
import { generateTrack } from '../track/pipeline';
import type { Candidate, TrackResult } from '../types';
import { bridgedMask, spanLength } from './bridges';
import { cutAndFill } from './profile';

const winnerOf = (result: TrackResult): Candidate => result.candidates[result.winnerIndex]!;

describe('bridges on real seeds (M6.1a)', () => {
  const tracks = Array.from({ length: 40 }, (_, k) => generateTrack(k + 1, config));

  it('keeps every winner of seeds 1 to 40 within 6 m of fill off its bridges, and every bridge within the longest span', { timeout: 60_000 }, () => {
    for (const track of tracks) {
      const winner = winnerOf(track);
      const mask = bridgedMask(winner.bridges, winner.line.count);
      for (let i = 0; i < winner.line.count; i++) {
        if (!mask[i]) expect(cutAndFill(i, winner.profile).fill, `seed ${track.seed} sample ${i}`).toBeLessThanOrEqual(config.road.maxFill);
      }
      for (const span of winner.bridges) expect(spanLength(span, winner.line.spacing)).toBeLessThanOrEqual(config.road.bridges.maxLength);
    }
  });

  it('gives some of seeds 1 to 40 a bridge, each standing over more than 6 m of fill somewhere', () => {
    const bridged = tracks.filter((track) => winnerOf(track).bridges.length > 0);
    expect(bridged.length).toBeGreaterThan(0);
    for (const track of bridged) {
      const winner = winnerOf(track);
      for (const span of winner.bridges) {
        let deepest = 0;
        for (let k = 0; k < span.sampleCount; k++) deepest = Math.max(deepest, winner.profile.height[(span.startIndex + k) % winner.line.count]! - winner.profile.ground[(span.startIndex + k) % winner.line.count]!);
        // The middle of the road, or one of its edges, stands over more than 6 m: the middle alone at least over the end fill.
        expect(deepest, `seed ${track.seed}`).toBeGreaterThan(config.road.bridges.endFill);
      }
    }
  });

  it('hands the winner’s bridges to the world’s road, numbered from the start line', { timeout: 30_000 }, () => {
    const track = tracks.find((t) => winnerOf(t).bridges.length > 0)!;
    const world = generateWorld(track.seed, config);
    expect(world.road.bridges).toEqual(winnerOf(world.track).bridges);
    expect(world.road.bridges).toEqual(winnerOf(track).bridges);
  });
});
