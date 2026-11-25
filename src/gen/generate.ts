import type { GenConfig } from '../config';
import { createHasher } from '../core/hash';
import { solveBanking } from './road/banking';
import { bridgedMask, bridgeKinds, buildBridges, deckPieces } from './road/bridges';
import { buildBarriers } from './road/barriers';
import { buildKerbs, findKerbs } from './road/kerbs';
import { buildRoadRibbon } from './road/ribbon';
import { placeLapGates } from './road/lapGates';
import { sampleField } from './world/heightfield';
import { buildLapGates, buildStartGate } from './road/startGate';
import { findWalls, railingRunOn } from './road/walls';
import { solveWidth } from './road/width';
import { hashTrack } from './track/hash';
import { generateTrack } from './track/pipeline';
import type { WorldResult } from './types';
import { GENERATOR_VERSION } from './version';
import { pickClouds } from './world/clouds';
import { buildCover } from './world/cover';
import { buildDecor } from './world/decor';
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
  const bridged = bridgedMask(winner.bridges, line.count);
  const fitted = fitRoad({ ...road, natural: island.inland, bridged }, config);
  const ground = { ...fitted.ground, height: carveCoast(fitted.ground.height, island, config) };
  const cover = buildCover(track.seed, ground, fitted.corridor, island.edge, config, track.character.landform);
  const decor = buildDecor(track.seed, ground, cover, island.edge, config);
  let highest = 0;
  for (let c = 0; c < ground.height.length; c++) highest = Math.max(highest, ground.height[c]!);
  const kerbSpans = findKerbs(line, winner.sections, config.road);
  // The gates a lap is counted by (M5.4d).
  const lapGateSamples = placeLapGates(line, winner.sections, config.road.lapGates);
  // Looked for on the finished ground, so a wall stands wherever a cutting, an embankment or a cliff ended up beside the road.
  const walls = findWalls({ line, height: profile.height, cross, width, sections: winner.sections, ground, bridges: winner.bridges }, config);
  // Each bridge's look by its size (M6.1c): which pieces of the road are on which, and the railings' run past each end.
  const kinds = bridgeKinds(winner.bridges, profile.height, profile.ground, line.spacing, config.road.bridges.look);
  const decks = deckPieces(winner.bridges, kinds, line.count);
  const railings = deckPieces(winner.bridges, kinds, line.count, railingRunOn(line.spacing, config.road.walls));
  const report = fitReport(
    { ...road, natural: island.natural, earthworks: fitted.ground, ground, corridor: fitted.corridor, bridged },
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
      mesh: buildRoadRibbon(line, profile.height, cross, width, config, decks),
      kerbs: { spans: kerbSpans, mesh: buildKerbs(line, profile.height, cross, width, kerbSpans, config) },
      walls,
      bridges: {
        spans: winner.bridges,
        kinds,
        mesh: buildBridges(line, profile.height, cross, width, winner.bridges, (x, z) => sampleField(ground, x, z, 0), config, kinds),
      },
      barriers: buildBarriers(line, profile.height, cross, width, winner.sections, walls, config, railings),
      gate: buildStartGate(line, profile.height, cross, width, config),
      lapGates: { samples: lapGateSamples, mesh: buildLapGates(line, profile.height, cross, width, lapGateSamples, (x, z) => sampleField(ground, x, z, 0), config) },
    },
    report,
    mountains: island.mountains.map(({ x, z, summit }) => ({ x, z, summit })),
    sky: pickSky(track.seed, config.world.sky),
    decor,
    clouds: pickClouds(track.seed, config.world.clouds, highest),
  };
}

/**
 * A fingerprint of a whole world: the track's fingerprint plus every height,
 * every cover value, the fit report, the sky, and every tree, rock and cloud. Two runs with the same fingerprint
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
  hasher.numbers(world.road.lapGates.samples);
  for (const mesh of [world.road.mesh, world.road.kerbs.mesh, world.road.barriers, world.road.gate, world.road.lapGates.mesh, world.road.bridges.mesh]) {
    hasher.numbers(mesh.positions).numbers(mesh.indices).numbers(mesh.materials);
  }
  for (const kerb of world.road.kerbs.spans) hasher.numbers([kerb.startIndex, kerb.sampleCount, kerb.side]);
  for (const wall of world.road.walls) hasher.numbers([wall.startIndex, wall.pieceCount, wall.side]);
  for (const span of world.road.bridges.spans) hasher.numbers([span.startIndex, span.sampleCount]);
  hasher.text(world.road.bridges.kinds.join(','));
  const { report } = world;
  for (const spot of [report.deepestCut, report.tallestFill, report.steepestBank, report.nearestWater, report.closestSections]) {
    if (spot) hasher.numbers([spot.x, spot.z, spot.value, spot.sample]);
  }
  hasher.numbers([report.groundThroughRoad, report.roadFloating]);
  for (const mountain of world.mountains) hasher.numbers([mountain.x, mountain.z, mountain.summit]);
  hasher.numbers([world.sky.hour, world.sky.bearing]);
  hasher.text(world.decor.woods);
  for (const scatter of [world.decor.trees, world.decor.rocks]) {
    hasher.numbers([scatter.count]);
    hasher.numbers(scatter.x).numbers(scatter.y).numbers(scatter.z).numbers(scatter.size).numbers(scatter.tall);
    hasher.numbers(scatter.turn).numbers(scatter.lean).numbers(scatter.kind).numbers(scatter.shade);
  }
  const { clouds } = world;
  hasher.text(clouds.cover).numbers([clouds.span, clouds.count, clouds.puffCount]);
  hasher.numbers(clouds.x).numbers(clouds.z).numbers(clouds.puffCloud);
  hasher.numbers(clouds.puffX).numbers(clouds.puffY).numbers(clouds.puffZ).numbers(clouds.puffSize).numbers(clouds.puffThick);
  return hasher.digest();
}
