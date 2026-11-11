import type { GenConfig } from '../config';
import { createHasher } from '../core/hash';
import { solveBanking } from './road/banking';
import { buildRoadRibbon } from './road/ribbon';
import { hashTrack } from './track/hash';
import { generateTrack } from './track/pipeline';
import type { WorldResult } from './types';
import { GENERATOR_VERSION } from './version';
import { buildCover } from './world/cover';
import { fitRoad } from './world/fit';
import { buildIsland, carveCoast } from './world/island';
import { fitReport } from './world/report';

/**
 * Generates everything for a seed: the track, the island around it, the road
 * cut into the island, and what covers the ground. Seed in, plain data out.
 */
export function generateWorld(seed: number, config: GenConfig): WorldResult {
  const track = generateTrack(seed, config);
  const winner = track.candidates[track.winnerIndex]!;
  const { line, profile } = winner;
  const island = buildIsland(track.seed, line, profile, config);

  // The road is fitted into the inland ground first and the coast is carved
  // afterwards, so an embankment can never spill out into the sea.
  const cross = solveBanking(line, config.road);
  const road = { near: island.near, line, height: profile.height, cross };
  const fitted = fitRoad({ ...road, natural: island.inland }, config);
  const ground = { ...fitted.ground, height: carveCoast(fitted.ground.height, island, config) };
  const cover = buildCover(track.seed, ground, fitted.corridor, island.near, config);
  const report = fitReport(
    { ...road, natural: island.natural, earthworks: fitted.ground, ground, corridor: fitted.corridor },
    config,
  );

  return {
    seed: track.seed,
    generatorVersion: GENERATOR_VERSION,
    track,
    natural: island.natural,
    ground,
    cover,
    road: { cross, mesh: buildRoadRibbon(line, profile.height, cross, config) },
    report,
  };
}

/**
 * A fingerprint of a whole world: the track's fingerprint plus every height,
 * every cover value and the fit report. Two runs with the same fingerprint
 * produced the same world.
 */
export function hashWorld(world: WorldResult): string {
  const hasher = createHasher();
  hasher.text(hashTrack(world.track));
  hasher.numbers([world.natural.size, world.natural.cell, world.natural.origin]);
  hasher.numbers(world.natural.height);
  hasher.numbers(world.ground.height);
  hasher.numbers(world.cover.grass).numbers(world.cover.sand).numbers(world.cover.rock).numbers(world.cover.variation);
  hasher.numbers(world.road.cross);
  hasher.numbers(world.road.mesh.positions).numbers(world.road.mesh.indices).numbers(world.road.mesh.materials);
  const { report } = world;
  for (const spot of [report.deepestCut, report.tallestFill, report.steepestBank, report.nearestWater, report.closestSections]) {
    if (spot) hasher.numbers([spot.x, spot.z, spot.value, spot.sample]);
  }
  hasher.numbers([report.groundThroughRoad, report.roadFloating]);
  return hasher.digest();
}
