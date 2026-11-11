import { describe, expect, it } from 'vitest';
import { config, type GenConfig } from '../../config';
import { circleLine } from '../../testing/trackFixtures';
import { solveProfile } from '../road/profile';
import { generateTrack } from '../track/pipeline';
import type { CenterLine, RoadProfile } from '../types';
import { sampleField, worldX, worldZ } from './heightfield';
import { buildIsland, type Island } from './island';

const HALF_ROAD = config.track.roadWidth / 2;
const coast = config.world.coast;
/** The sea never comes nearer the road edge than the untouched strip plus the beach (less a little for smoothing). */
const NEAREST_SEA = coast.minShore + coast.beach - 2;

/** A coarser grid keeps hand-made cases quick; real seeds below use the full grid. */
const coarse: GenConfig = { ...config, world: { ...config.world, tile: { extent: 1400, cell: 4 } } };

/** An island for a 200 m circle of road on dead flat ground of the given height. */
function flatIsland(groundHeight: number): { island: Island; line: CenterLine; profile: RoadProfile } {
  const line = circleLine(200);
  const relief = (): number => groundHeight;
  const profile = solveProfile(line, relief, config.road, config.track.roadWidth);
  return { island: buildIsland(7, line, profile, coarse, relief), line, profile };
}

/** Calls back for every cell with its height and its distance from the road edge (negative on the road). */
function eachCell(island: Island, visit: (height: number, edge: number, inside: boolean, ix: number, iz: number) => void): void {
  const { size } = island.natural;
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const c = iz * size + ix;
      visit(island.natural.height[c]!, island.near.distance[c]! - HALF_ROAD, island.inside[c] === 1, ix, iz);
    }
  }
}

describe('buildIsland around a low road', () => {
  const { island, line } = flatIsland(3.5);

  it('keeps the natural ground under the road at the height the road was planned on', () => {
    for (let i = 0; i < line.count; i += 5) {
      expect(sampleField(island.natural, line.x[i]!, line.z[i]!, -99)).toBeCloseTo(3.5, 1);
    }
  });

  it('makes everything inside the loop land', () => {
    eachCell(island, (height, _edge, inside) => {
      if (inside) expect(height).toBeGreaterThan(0);
    });
  });

  it('never brings the sea closer to the road than the width of the beach', () => {
    eachCell(island, (height, edge) => {
      if (edge < NEAREST_SEA) expect(height).toBeGreaterThan(0);
    });
  });

  it('brings the sea close to a low road: much of the ground 70 to 90 m outside it is water', () => {
    let ring = 0;
    let wet = 0;
    eachCell(island, (height, edge, inside) => {
      if (inside || edge < 70 || edge > 90) return;
      ring++;
      if (height <= 0) wet++;
    });
    // The rest of that ring is headland.
    expect(wet / ring).toBeGreaterThan(0.4);
  });

  it('surrounds the island with sea on every edge of the tile', () => {
    const last = island.natural.size - 1;
    eachCell(island, (height, _edge, _inside, ix, iz) => {
      if (ix === 0 || iz === 0 || ix === last || iz === last) expect(height).toBeLessThan(0);
    });
  });

  it('never dips below the depth of the open sea', () => {
    eachCell(island, (height) => expect(height).toBeGreaterThanOrEqual(-coast.seaDepth - 0.001));
  });
});

describe('buildIsland around a high road', () => {
  const { island } = flatIsland(30);

  it('keeps the sea well away, so the land can fall to it at a natural slope', () => {
    eachCell(island, (height, edge, inside) => {
      if (!inside && edge < 60) expect(height).toBeGreaterThan(0);
    });
  });

  it('still reaches the sea within the largest allowed margin', () => {
    let wet = 0;
    eachCell(island, (height, edge, inside) => {
      if (!inside && edge > coast.maxMargin + coast.wobble + coast.smoothing && height <= 0) wet++;
    });
    expect(wet).toBeGreaterThan(0);
    eachCell(island, (height, edge, inside) => {
      if (!inside && edge > coast.maxMargin + coast.wobble + coast.smoothing + 5) expect(height).toBeLessThanOrEqual(0);
    });
  });
});

describe('buildIsland on generated tracks', () => {
  const seeds = [1, 42, 48213];
  const worlds = seeds.map((seed) => {
    const track = generateTrack(seed, config);
    const winner = track.candidates[track.winnerIndex]!;
    return { seed, winner, island: buildIsland(seed, winner.line, winner.profile, config) };
  });

  it('uses the tile size and cell size from the config', () => {
    expect(worlds[0]!.island.natural.size).toBe(701);
    expect(worlds[0]!.island.natural.cell).toBe(2);
  });

  it('keeps the natural ground under the road close to the ground the road was planned on', () => {
    for (const { winner, island, seed } of worlds) {
      for (let i = 0; i < winner.line.count; i += 3) {
        const natural = sampleField(island.natural, winner.line.x[i]!, winner.line.z[i]!, -99);
        expect(Math.abs(natural - winner.profile.ground[i]!), `seed ${seed} sample ${i}`).toBeLessThan(0.5);
      }
    }
  });

  it('keeps the sea away from the road and around the whole tile', () => {
    for (const { island } of worlds) {
      const last = island.natural.size - 1;
      eachCell(island, (height, edge, _inside, ix, iz) => {
        if (edge < NEAREST_SEA) expect(height).toBeGreaterThan(0);
        if (ix === 0 || iz === 0 || ix === last || iz === last) expect(height).toBeLessThan(0);
      });
    }
  });

  it('leaves the open sea deep: no shallows far from the island', () => {
    for (const { island, seed } of worlds) {
      // Past the widest margin, the sea bed has shelved all the way down by this distance.
      const far = coast.maxMargin + coast.wobble + 2 * coast.smoothing + coast.seaDepth / coast.shelfSlope + 10;
      eachCell(island, (height, edge) => {
        if (edge > far) expect(height, `seed ${seed}`).toBeLessThan(-coast.seaDepth + 0.01);
      });
    }
  });

  it('has both land and sea in sensible shares', () => {
    for (const { island, seed } of worlds) {
      let land = 0;
      eachCell(island, (height) => {
        if (height > 0) land++;
      });
      const share = land / island.natural.height.length;
      expect(share, `seed ${seed}`).toBeGreaterThan(0.12);
      expect(share, `seed ${seed}`).toBeLessThan(0.7);
    }
  });

  it('keeps the ground near the road gentle, and has no sheer walls anywhere', () => {
    for (const { island, seed } of worlds) {
      const { size, cell, height } = island.natural;
      let steepest = 0;
      let steepestNearRoad = 0;
      for (let iz = 0; iz < size - 1; iz++) {
        for (let ix = 0; ix < size - 1; ix++) {
          const c = iz * size + ix;
          const slope = Math.max(Math.abs(height[c + 1]! - height[c]!), Math.abs(height[c + size]! - height[c]!)) / cell;
          steepest = Math.max(steepest, slope);
          if (island.near.distance[c]! - HALF_ROAD < config.world.scenery.clearance) steepestNearRoad = Math.max(steepestNearRoad, slope);
        }
      }
      // Within reach of the road: nothing steeper than a 70% bank. Peaks further off may be steep, but not walls.
      expect(steepestNearRoad, `seed ${seed}`).toBeLessThan(0.7);
      expect(steepest, `seed ${seed}`).toBeLessThan(2.5);
    }
  });

  it('builds exactly the same island for the same seed, and a different one for another', () => {
    const { winner, island } = worlds[0]!;
    const again = buildIsland(1, winner.line, winner.profile, config);
    expect(again.natural.height).toEqual(island.natural.height);
    expect(worlds[1]!.island.natural.height).not.toEqual(island.natural.height);
  });

  it('puts a position at the centre of the tile in the middle of the grid', () => {
    const { natural } = worlds[0]!.island;
    expect(worldX(natural, 350)).toBe(0);
    expect(worldZ(natural, 350)).toBe(0);
  });
});
