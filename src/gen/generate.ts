import type { GenConfig } from '../config';
import { createHasher } from '../core/hash';
import { solveBanking } from './road/banking';
import { bridgedMask, bridgeKinds, buildBridges, deckPieces, findBridgeSpans, joinBridgeSpans } from './road/bridges';
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
import type { BridgeSpan, Crossing, HeightField, RoadProfile, WorldResult } from './types';
import { GENERATOR_VERSION } from './version';
import { pickClouds } from './world/clouds';
import { buildCover } from './world/cover';
import { carveCrossing, chooseCrossing } from './world/crossing';
import { buildDecor } from './world/decor';
import { buildStillWater, outOfStillWater, withoutGrassUnder } from './world/stillWater';
import { fitRoad } from './world/fit';
import { buildIsland, carveCoast } from './world/island';
import { fitReport } from './world/report';
import { pickSky } from './world/sky';

/** Trees and rocks stand at least this far from a hill river's still water, in metres (M6.1d-3). */
const STILL_WATER_CLEAR = 1;

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
  // The gates a lap is counted by (M5.4d).
  const lapGateSamples = placeLapGates(line, winner.sections, config.road.lapGates);

  // The lap's crossing over water or a ravine (M6.1d), carved into the island. It is taken only if, on the carved
  // ground, the road over it becomes a bridge no longer than the longest; otherwise the next site is tried.
  let carved: { inland: HeightField; natural: HeightField; ground: Float64Array; bridges: BridgeSpan[] } | null = null;
  const crossing: Crossing | null = chooseCrossing(
    track.seed,
    { line, height: profile.height, width, bridges: winner.bridges, lapGates: lapGateSamples, island },
    config,
    (chosen) => {
      const inland = carveCrossing(island.inland, chosen, track.seed, config);
      // The ground under the road, lowered only where the channel lowered it.
      const ground = Float64Array.from(profile.ground, (g, i) => {
        const after = sampleField(inland, line.x[i]!, line.z[i]!, g);
        return after < sampleField(island.inland, line.x[i]!, line.z[i]!, g) ? Math.min(g, after) : g;
      });
      const found = findBridgeSpans({ height: profile.height, ground }, line.spacing, config.road);
      // The lap's own bridges stay as the track found them; the crossing's joins them.
      const bridges = joinBridgeSpans([winner.bridges, found], line.count, line.spacing, config.road);
      const over = bridges.find((s) => (chosen.sample - s.startIndex + line.count) % line.count < s.sampleCount);
      if (!over || bridges.some((s) => (s.sampleCount - 1) * line.spacing > config.road.bridges.maxLength)) return false;
      carved = { inland, natural: carveCrossing(island.natural, chosen, track.seed, config), ground, bridges };
      return true;
    },
  );
  const site = carved as { inland: HeightField; natural: HeightField; ground: Float64Array; bridges: BridgeSpan[] } | null;
  const inland = site?.inland ?? island.inland;
  const natural = site?.natural ?? island.natural;
  const bridges = site?.bridges ?? winner.bridges;
  const under: RoadProfile = { height: profile.height, ground: site?.ground ?? profile.ground };

  // The road is fitted into the inland ground first and the coast is carved
  // afterwards, so an embankment can never spill out into the sea.
  const cross = solveBanking(line, config.road);
  const road = { near: island.near, line, height: profile.height, cross, width };
  const bridged = bridgedMask(bridges, line.count);
  const fitted = fitRoad({ ...road, natural: inland, bridged }, config);
  const ground = { ...fitted.ground, height: carveCoast(fitted.ground.height, island, config) };
  // A hill river's still water (M6.1d-3): nothing grows under it and nothing stands in it.
  const stillWater = crossing ? buildStillWater(crossing, ground, config) : null;
  const plainCover = buildCover(track.seed, ground, fitted.corridor, island.edge, config, track.character.landform);
  const cover = stillWater && crossing ? withoutGrassUnder(plainCover, ground, stillWater, crossing.path) : plainCover;
  const plainDecor = buildDecor(track.seed, ground, cover, island.edge, config);
  const decor =
    stillWater && crossing
      ? { ...plainDecor, trees: outOfStillWater(plainDecor.trees, stillWater, crossing.path, STILL_WATER_CLEAR), rocks: outOfStillWater(plainDecor.rocks, stillWater, crossing.path, STILL_WATER_CLEAR) }
      : plainDecor;
  let highest = 0;
  for (let c = 0; c < ground.height.length; c++) highest = Math.max(highest, ground.height[c]!);
  const kerbSpans = findKerbs(line, winner.sections, config.road);
  // Looked for on the finished ground, so a wall stands wherever a cutting, an embankment or a cliff ended up beside the road.
  const walls = findWalls({ line, height: profile.height, cross, width, sections: winner.sections, ground, bridges }, config);
  // Each bridge's look by its size (M6.1c): which pieces of the road are on which, and the railings' run past each end.
  const kinds = bridgeKinds(bridges, under.height, under.ground, line.spacing, config.road.bridges.look);
  const decks = deckPieces(bridges, kinds, line.count);
  const railings = deckPieces(bridges, kinds, line.count, railingRunOn(line.spacing, config.road.walls));
  const report = fitReport(
    { ...road, natural, earthworks: fitted.ground, ground, corridor: fitted.corridor, bridged, tunnelled: bridgedMask(winner.tunnels, line.count) },
    config,
  );

  return {
    seed: track.seed,
    generatorVersion: GENERATOR_VERSION,
    track,
    natural,
    ground,
    cover,
    road: {
      cross,
      width,
      mesh: buildRoadRibbon(line, profile.height, cross, width, config, decks),
      kerbs: { spans: kerbSpans, mesh: buildKerbs(line, profile.height, cross, width, kerbSpans, config) },
      walls,
      bridges: {
        spans: bridges,
        kinds,
        mesh: buildBridges(line, profile.height, cross, width, bridges, (x, z) => sampleField(ground, x, z, 0), config, kinds),
      },
      // Where the road runs in tunnels (M6.2a). Until M6.2b the world still digs an open cutting there.
      tunnels: { spans: winner.tunnels },
      barriers: buildBarriers(line, profile.height, cross, width, winner.sections, walls, config, railings),
      gate: buildStartGate(line, profile.height, cross, width, config),
      lapGates: { samples: lapGateSamples, mesh: buildLapGates(line, profile.height, cross, width, lapGateSamples, (x, z) => sampleField(ground, x, z, 0), config) },
    },
    report,
    mountains: island.mountains.map(({ x, z, summit }) => ({ x, z, summit })),
    sky: pickSky(track.seed, config.world.sky),
    decor,
    clouds: pickClouds(track.seed, config.world.clouds, highest),
    crossing,
    stillWater,
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
  // Tunnels (M6.2a): nothing is added for a world without one.
  for (const span of world.road.tunnels.spans) hasher.numbers([span.startIndex, span.sampleCount]);
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
  // Only a world with a crossing hashes one, so the fingerprints of worlds without stay as they were (M6.1d).
  const { crossing } = world;
  if (crossing) {
    hasher.text(crossing.kind).numbers([crossing.sample, crossing.across.x, crossing.across.z, crossing.reach.startIndex, crossing.reach.sampleCount]);
    for (const p of crossing.path) hasher.numbers([p.x, p.z, p.half, p.floor]);
    if (crossing.water) hasher.numbers([crossing.water.level]);
  }
  const { stillWater } = world;
  if (stillWater) {
    hasher.numbers([stillWater.level]).numbers(stillWater.wet);
    hasher.numbers(stillWater.mesh.positions).numbers(stillWater.mesh.indices).numbers(stillWater.mesh.materials);
  }
  return hasher.digest();
}
