import type { GenConfig } from '../config';
import { createHasher } from '../core/hash';
import { hashTrack } from './track/hash';
import { generateTrack } from './track/pipeline';
import type { WorldResult } from './types';
import { GENERATOR_VERSION } from './version';
import { buildIsland } from './world/island';

/**
 * Generates everything for a seed: the track, then the island around it.
 * Seed in, plain data out.
 */
export function generateWorld(seed: number, config: GenConfig): WorldResult {
  const track = generateTrack(seed, config);
  const winner = track.candidates[track.winnerIndex]!;
  const island = buildIsland(track.seed, winner.line, winner.profile, config);
  return {
    seed: track.seed,
    generatorVersion: GENERATOR_VERSION,
    track,
    natural: island.natural,
  };
}

/**
 * A fingerprint of a whole world: the track's fingerprint plus every height
 * of the island. Two runs with the same fingerprint produced the same world.
 */
export function hashWorld(world: WorldResult): string {
  const hasher = createHasher();
  hasher.text(hashTrack(world.track));
  hasher.numbers([world.natural.size, world.natural.cell, world.natural.origin]);
  hasher.numbers(world.natural.height);
  return hasher.digest();
}
