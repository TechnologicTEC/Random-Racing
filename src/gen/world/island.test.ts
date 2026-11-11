import { describe, expect, it } from 'vitest';
import { config, type GenConfig } from '../../config';
import { circleLine, stadiumLine } from '../../testing/trackFixtures';
import { solveProfile } from '../road/profile';
import { generateTrack } from '../track/pipeline';
import type { CenterLine, RoadProfile } from '../types';
import { sampleField, sampleGrid } from './heightfield';
import { buildIsland, carveCoast, coastProfile, shoreShape, type Island } from './island';

const HALF_ROAD = config.track.roadWidth / 2;
const coast = config.world.coast;
const scenery = config.world.scenery;

/** A coarser grid keeps hand-made cases quick; real seeds below use the full grid. */
const coarse: GenConfig = { ...config, world: { ...config.world, tile: { extent: 1400, cell: 4 } } };

/** An island for a road on dead flat ground of the given height. */
function flatIsland(groundHeight: number, line: CenterLine = circleLine(200)): { island: Island; line: CenterLine; profile: RoadProfile } {
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

/**
 * How far the sea is from the road edge, measured straight out from the road
 * at every few samples. Only samples that face the open sea count: where the
 * way out runs into the infield or towards another part of the track, there
 * is no coast to measure.
 */
function seaDistances(island: Island, line: CenterLine): number[] {
  const field = island.natural;
  const cellOf = (x: number, z: number): number =>
    Math.round((z - field.origin) / field.cell) * field.size + Math.round((x - field.origin) / field.cell);
  const distances: number[] = [];
  for (let i = 0; i < line.count; i += 3) {
    for (const side of [1, -1]) {
      // Right of the direction of travel is (-tz, tx) on the map.
      const nx = -line.tz[i]! * side;
      const nz = line.tx[i]! * side;
      let found = -1;
      for (let out = HALF_ROAD + 1; out <= HALF_ROAD + 90; out += 0.5) {
        const x = line.x[i]! + nx * out;
        const z = line.z[i]! + nz * out;
        const c = cellOf(x, z);
        if (island.inside[c] === 1) break;
        // Another part of the track is nearer than this one: this is not this sample's coast.
        if (island.near.distance[c]! < out - 3) break;
        if (sampleField(field, x, z, -1) <= 0) {
          found = out - HALF_ROAD;
          break;
        }
      }
      if (found >= 0) distances.push(found);
    }
  }
  return distances;
}

describe('shoreShape', () => {
  it('gives a low road the margin and beach that were asked for', () => {
    expect(shoreShape(30, 20, 4, coast)).toEqual({ margin: 30, beach: 20 });
  });

  it('never lets the waterline closer to the road than the minimum', () => {
    expect(shoreShape(6, 0, 3, coast).margin).toBe(coast.minMargin);
  });

  it('pushes the water out from a high road, so the drop is no steeper than a cliff may be', () => {
    const { margin, beach } = shoreShape(10, 0, 25, coast);
    expect(margin).toBeCloseTo(coast.clear + 25 / coast.cliffSlope, 9);
    expect(beach).toBe(0);
  });

  it('narrows the beach when there is not room for both it and the drop', () => {
    // 20 m of margin, 5 of them kept clear: 15 m to share between a 15 m drop of 6 m at most 250% steep, and the beach.
    const { margin, beach } = shoreShape(20, 25, 15, coast);
    expect(margin).toBe(20);
    expect(beach).toBeGreaterThan(5);
    expect(beach).toBeLessThan(15);
    const rise = 15 - beach * coast.beachRise;
    expect(rise / (margin - coast.clear - beach)).toBeLessThanOrEqual(coast.cliffSlope + 1e-9);
  });

  it('keeps beaches inside the 5 to 25 m range when there is room', () => {
    expect(shoreShape(35, 25, 3, coast).beach).toBe(25);
    expect(shoreShape(35, 5, 3, coast).beach).toBe(5);
  });
});

describe('coastProfile', () => {
  const beachy = { room: 25, beach: 20, roadHeight: 4 };
  const cliff = { room: 10, beach: 0, roadHeight: 25 };

  it('is zero at the waterline', () => {
    expect(coastProfile(0, beachy, coast)).toBe(0);
    expect(coastProfile(0, cliff, coast)).toBe(0);
  });

  it('shelves away under the sea at one steady slope, down to the depth of the open sea and no further', () => {
    expect(coastProfile(-10, beachy, coast)).toBeCloseTo(-10 * coast.shelfSlope, 9);
    expect(coastProfile(-10, cliff, coast)).toBeCloseTo(-10 * coast.shelfSlope, 9);
    expect(coastProfile(-5000, beachy, coast)).toBe(-coast.seaDepth);
  });

  it('climbs gently across the beach, then up to road height at the edge of the clear strip', () => {
    expect(coastProfile(20, beachy, coast)).toBeCloseTo(20 * coast.beachRise, 9);
    expect(coastProfile(25, beachy, coast)).toBeCloseTo(4, 9);
  });

  it('rises straight from the water where there is no beach', () => {
    expect(coastProfile(4, cliff, coast)).toBeCloseTo(10, 9);
    expect(coastProfile(10, cliff, coast)).toBeCloseTo(25, 9);
  });

  it('keeps rising inland, so it never limits the ground beside the road', () => {
    expect(coastProfile(30, beachy, coast)).toBeGreaterThan(4);
    expect(coastProfile(60, cliff, coast)).toBeGreaterThan(25);
  });

  it('only ever rises going inland', () => {
    for (const shape of [beachy, cliff]) {
      let previous = -Infinity;
      for (let s = -250; s <= 80; s += 0.5) {
        const here = coastProfile(s, shape, coast);
        expect(here).toBeGreaterThanOrEqual(previous);
        previous = here;
      }
    }
  });
});

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

  it('keeps the surf at least 10 m from the road edge', () => {
    eachCell(island, (height, edge) => {
      if (edge < coast.minMargin - 1) expect(height).toBeGreaterThan(0);
    });
    expect(Math.min(...seaDistances(island, line))).toBeGreaterThanOrEqual(coast.minMargin - 1);
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

  it('has beaches: low flat sand between the water and the rise to the road', () => {
    let sandFlat = 0;
    eachCell(island, (height, edge, inside) => {
      if (!inside && edge > coast.clear && height > 0 && height < coast.beach[1] * coast.beachRise) sandFlat++;
    });
    expect(sandFlat).toBeGreaterThan(300);
  });
});

describe('buildIsland around a high road', () => {
  const { island, line } = flatIsland(30);

  it('still brings the sea close, dropping to it as a cliff', () => {
    const distances = seaDistances(island, line);
    const typical = [...distances].sort((a, b) => a - b)[Math.floor(distances.length / 2)]!;
    expect(typical).toBeLessThan(coast.margin[1] + 5);
    // A 30 m drop inside 35 m or so is steeper than any road bank.
    let steepest = 0;
    const { size, cell, height } = island.natural;
    for (let iz = 0; iz < size - 1; iz++) {
      for (let ix = 0; ix < size - 1; ix++) {
        const c = iz * size + ix;
        if (height[c]! <= 0) continue;
        steepest = Math.max(steepest, Math.abs(height[c + 1]! - height[c]!) / cell, Math.abs(height[c + size]! - height[c]!) / cell);
      }
    }
    expect(steepest).toBeGreaterThan(1);
  });

  it('keeps the water far enough out that no drop is steeper than a cliff may be', () => {
    const nearest = Math.min(...seaDistances(island, line));
    expect(nearest).toBeGreaterThanOrEqual(coast.clear + 30 / coast.cliffSlope - 2);
  });

  it('leaves the strip beside the road at road height', () => {
    eachCell(island, (height, edge) => {
      if (edge < coast.clear - 2) expect(height).toBeGreaterThan(28);
    });
  });
});

describe('the peak', () => {
  it('stands in the middle of a roomy infield, 40 to 70 m high', () => {
    const { island } = flatIsland(10);
    expect(island.peak).not.toBeNull();
    const peak = island.peak!;
    expect(Math.sqrt(peak.x * peak.x + peak.z * peak.z)).toBeLessThan(15);
    expect(peak.summit).toBeGreaterThanOrEqual(scenery.peakSummit[0]);
    expect(peak.summit).toBeLessThanOrEqual(scenery.peakSummit[1]);
    expect(sampleField(island.natural, peak.x, peak.z, 0)).toBeCloseTo(peak.summit, 0);
  });

  it('keeps every part of itself at least 60 m from the road', () => {
    const { island } = flatIsland(10);
    const peak = island.peak!;
    // The road is a 200 m circle about the origin, so the peak's foot must end 60 m short of its inner edge.
    expect(Math.sqrt(peak.x * peak.x + peak.z * peak.z) + peak.radius).toBeLessThanOrEqual(200 - HALF_ROAD - scenery.peakClearance + 0.001);
    // Inside that 60 m the ground is just the flat relief and its small bumps.
    eachCell(island, (height, edge, inside) => {
      if (inside && edge < scenery.peakClearance) expect(height).toBeLessThan(10 + scenery.bumpHeight + 0.01);
    });
  });

  it('is no steeper than its limit', () => {
    const { island } = flatIsland(10);
    const peak = island.peak!;
    const { size, cell, height, origin } = island.natural;
    let steepest = 0;
    for (let iz = 0; iz < size - 1; iz++) {
      for (let ix = 0; ix < size - 1; ix++) {
        const x = origin + ix * cell - peak.x;
        const z = origin + iz * cell - peak.z;
        if (x * x + z * z > peak.radius * peak.radius) continue;
        const c = iz * size + ix;
        steepest = Math.max(steepest, Math.abs(height[c + 1]! - height[c]!) / cell, Math.abs(height[c + size]! - height[c]!) / cell);
      }
    }
    // A little over the limit is allowed for the bumps and the texture on its sides.
    expect(steepest).toBeLessThan(scenery.peakSlope + 0.25);
  });

  it('is left out when the infield has no room 60 m from the road', () => {
    // Two straights 40 m apart: nowhere inside is more than 20 m from the road.
    const { island } = flatIsland(10, stadiumLine(300, 20));
    expect(island.peak).toBeNull();
  });
});

describe('carveCoast', () => {
  const { island } = flatIsland(12);

  it('turns the inland ground into the natural ground', () => {
    expect(carveCoast(island.inland.height, island, coarse)).toEqual(island.natural.height);
  });

  it('never touches the road or its verges', () => {
    const verge = HALF_ROAD + config.road.verge;
    for (let c = 0; c < island.natural.height.length; c++) {
      if (island.near.distance[c]! <= verge) expect(island.natural.height[c]).toBe(island.inland.height[c]);
    }
  });

  it('only ever lowers ground, never raises it', () => {
    const lifted = Float32Array.from(island.inland.height, (h) => h + 3);
    const carved = carveCoast(lifted, island, coarse);
    for (let c = 0; c < carved.length; c++) expect(carved[c]!).toBeLessThanOrEqual(lifted[c]! + 1e-6);
  });
});

describe('buildIsland on generated tracks', () => {
  const seeds = [1, 7, 42, 99, 2024, 48213];
  const worlds = seeds.map((seed) => {
    const track = generateTrack(seed, config);
    const winner = track.candidates[track.winnerIndex]!;
    const island = buildIsland(seed, winner.line, winner.profile, config);
    return { seed, winner, island, sea: seaDistances(island, winner.line) };
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

  it('keeps the surf at least 10 m from the road edge, and the sea all round the tile', () => {
    for (const { island, sea, seed } of worlds) {
      const last = island.natural.size - 1;
      eachCell(island, (height, edge, _inside, ix, iz) => {
        if (edge < coast.minMargin - 1) expect(height).toBeGreaterThan(0);
        if (ix === 0 || iz === 0 || ix === last || iz === last) expect(height).toBeLessThan(0);
      });
      expect(Math.min(...sea), `seed ${seed}`).toBeGreaterThanOrEqual(coast.minMargin - 1);
    }
  });

  it('puts the sea 15 to 35 m from the road along most of the coast', () => {
    for (const { sea, seed } of worlds) {
      // Two metres either way allows for the wobble and for measuring on a 2 m grid.
      const usual = sea.filter((d) => d >= coast.margin[0] - 2 && d <= coast.margin[1] + 2).length;
      expect(usual / sea.length, `seed ${seed}`).toBeGreaterThan(0.6);
    }
  });

  it('has a bay or two where the sea comes in to about 10 m', () => {
    for (const { island, sea, seed } of worlds) {
      expect(island.bays.length, `seed ${seed}`).toBeGreaterThanOrEqual(coast.bays[0]);
      expect(island.bays.length, `seed ${seed}`).toBeLessThanOrEqual(coast.bays[1]);
      // Bays are put beside low road, where the water can come right in to the minimum.
      expect(Math.min(...sea), `seed ${seed}`).toBeLessThan(coast.minMargin + 2);
    }
  });

  it('has a headland or two reaching 40 to 60 m beyond the road', () => {
    for (const { island, sea, seed } of worlds) {
      expect(island.headlands.length, `seed ${seed}`).toBeGreaterThanOrEqual(coast.headlands[0]);
      expect(island.headlands.length, `seed ${seed}`).toBeLessThanOrEqual(coast.headlands[1]);
      const furthest = Math.max(...sea);
      expect(furthest, `seed ${seed}`).toBeGreaterThan(coast.headlandReach[0] - 3);
      expect(furthest, `seed ${seed}`).toBeLessThan(coast.headlandReach[1] + 3);
    }
  });

  it('has both cliffs and beaches on most islands', () => {
    let withCliff = 0;
    let withBeach = 0;
    for (const { island } of worlds) {
      const { size, cell, height } = island.natural;
      let cliff = false;
      let beachCells = 0;
      for (let iz = 0; iz < size - 1; iz++) {
        for (let ix = 0; ix < size - 1; ix++) {
          const c = iz * size + ix;
          const here = height[c]!;
          if (here <= 0 || island.inside[c] === 1) continue;
          if (Math.max(Math.abs(height[c + 1]! - here), Math.abs(height[c + size]! - here)) / cell > 1) cliff = true;
          if (here < 1.2) beachCells++;
        }
      }
      if (cliff) withCliff++;
      if (beachCells > 500) withBeach++;
    }
    expect(withCliff).toBeGreaterThanOrEqual(4);
    expect(withBeach).toBeGreaterThanOrEqual(5);
  });

  it('keeps any peak at least 60 m from the road and within its height range', () => {
    for (const { island, seed } of worlds) {
      const peak = island.peak;
      if (!peak) continue;
      expect(peak.summit, `seed ${seed}`).toBeGreaterThanOrEqual(scenery.peakSummit[0] - 0.001);
      expect(peak.summit, `seed ${seed}`).toBeLessThanOrEqual(scenery.peakSummit[1]);
      // The whole foot of the peak: its centre is this far from the road, less its radius.
      const centre = sampleGrid(island.natural, island.near.distance, peak.x, peak.z, 0) - HALF_ROAD;
      expect(centre - peak.radius, `seed ${seed}`).toBeGreaterThanOrEqual(scenery.peakClearance - 2);
    }
  });

  it('shelves the sea bed steadily away from the shore, with no deep holes close in', () => {
    for (const { island, seed } of worlds) {
      // The water is never nearer than the minimum margin, so the bed can be no deeper than a steady slope from there.
      // One check per island, not per cell: there are half a million cells.
      let deepestHole = 0;
      eachCell(island, (height, edge) => {
        if (height < 0) deepestHole = Math.max(deepestHole, -height - (edge - coast.minMargin + 3) * coast.shelfSlope);
      });
      expect(deepestHole, `seed ${seed}`).toBeLessThanOrEqual(0.01);
    }
  });

  it('leaves the open sea deep', () => {
    for (const { island, seed } of worlds) {
      const far = coast.headlandReach[1] + coast.wobble + coast.seaDepth / coast.shelfSlope + 20;
      let shallowest = -Infinity;
      eachCell(island, (height, edge) => {
        if (edge > far) shallowest = Math.max(shallowest, height);
      });
      expect(shallowest, `seed ${seed}`).toBeLessThan(-coast.seaDepth + 0.01);
    }
  });

  it('builds exactly the same island for the same seed, and a different one for another', () => {
    const { winner, island } = worlds[0]!;
    const again = buildIsland(1, winner.line, winner.profile, config);
    expect(again.natural.height).toEqual(island.natural.height);
    expect(again.peak).toEqual(island.peak);
    expect(worlds[1]!.island.natural.height).not.toEqual(island.natural.height);
  });
});
