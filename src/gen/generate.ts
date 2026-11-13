import type { GenConfig } from '../config';
import { createHasher } from '../core/hash';
import { solveBanking } from './road/banking';
import { buildBarriers } from './road/barriers';
import { buildKerbs, findKerbs } from './road/kerbs';
import { buildRoadRibbon } from './road/ribbon';
import { buildStartGate } from './road/startGate';
import { solveWidth } from './road/width';
import { hashTrack } from './track/hash';
import { generateTrack } from './track/pipeline';
import type { WorldResult } from './types';
import { GENERATOR_VERSION } from './version';
import { buildCover } from './world/cover';
import { fitRoad } from './world/fit';
import { buildIsland, carveCoast } from './world/island';
import { fitReport } from './world/report';
import { pickSky } from './world/sky';

/**
 * Generates everything for a seed: the track, the island around it, the road
 * cut into the island, and what covers the ground. Seed in, plain data out.
 */
export function generateWorld(seed: number, config: GenConfig): WorldResult {
  const track = generateTrack(seed, config);
  const winner = track.candidates[track.winnerIndex]!;
  const { line, profile } = winner;
  // Chosen only now that the winner is known, so the width never changes which layout wins.
  const width = solveWidth(track.seed, line, winner.sections, track.character.width, config);
  const island = buildIsland(track.seed, line, profile, width, config, track.character);

  // The road is fitted into the inland ground first and the coast is carved
  // afterwards, so an embankment can never spill out into the sea.
  const cross = solveBanking(line, config.road);
  const road = { near: island.near, line, height: profile.height, cross, width };
  const fitted = fitRoad({ ...road, natural: island.inland }, config);
  const ground = { ...fitted.ground, height: carveCoast(fitted.ground.height, island, config) };
  const cover = buildCover(track.seed, ground, fitted.corridor, island.edge, config, track.character.landform);
  const kerbSpans = findKerbs(line, winner.sections, config.road);
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
    road: {
      cross,
      width,
      mesh: buildRoadRibbon(line, profile.height, cross, width, config),
      kerbs: { spans: kerbSpans, mesh: buildKerbs(line, profile.height, cross, width, kerbSpans, config) },
      barriers: buildBarriers(line, profile.height, cross, width, winner.sections, config),
      gate: buildStartGate(line, profile.height, cross, width, config),
    },
    report,
    mountains: island.mountains.map(({ x, z, summit }) => ({ x, z, summit })),
    sky: pickSky(track.seed, config.world.sky),
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
  hasher.numbers(world.cover.grass).numbers(world.cover.sand).numbers(world.cover.rock).numbers(world.cover.snow).numbers(world.cover.variation);
  hasher.numbers(world.road.cross).numbers(world.road.width);
  for (const mesh of [world.road.mesh, world.road.kerbs.mesh, world.road.barriers, world.road.gate]) {
    hasher.numbers(mesh.positions).numbers(mesh.indices).numbers(mesh.materials);
  }
  for (const kerb of world.road.kerbs.spans) hasher.numbers([kerb.startIndex, kerb.sampleCount, kerb.side]);
  const { report } = world;
  for (const spot of [report.deepestCut, report.tallestFill, report.steepestBank, report.nearestWater, report.closestSections]) {
    if (spot) hasher.numbers([spot.x, spot.z, spot.value, spot.sample]);
  }
  hasher.numbers([report.groundThroughRoad, report.roadFloating]);
  for (const mountain of world.mountains) hasher.numbers([mountain.x, mountain.z, mountain.summit]);
  hasher.numbers([world.sky.hour, world.sky.bearing]);
  return hasher.digest();
}
