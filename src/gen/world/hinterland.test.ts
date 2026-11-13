import { describe, expect, it } from 'vitest';
import { config, type GenConfig } from '../../config';
import { withCharacter } from '../../testing/characters';
import { solveWidth } from '../road/width';
import { generateTrack } from '../track/pipeline';
import type { CenterLine, CoastKind } from '../types';
import { sampleField, sampleGrid } from './heightfield';
import { buildIsland, type Island } from './island';

const coast = config.world.coast;
const hinterland = config.world.hinterland;

/** A 5 m grid keeps 24 islands quick; the land and the sea are no different at this scale. */
const coarse: GenConfig = { ...config, world: { ...config.world, tile: { ...config.world.tile, cell: 5 } } };

/**
 * How close the sea may come beside a road this high: the usual 35 m, or
 * further where a high road needs the room for a cliff no steeper than allowed (Tane's choice at check-in 1).
 */
function seasideLimit(roadHeight: number): number {
  return Math.max(coast.margin[1], coast.clear + roadHeight / coast.cliffSlope) + 2;
}

/**
 * For every few samples, on each side of the road that faces outwards, how far
 * from the road edge the first sea is (Infinity if there is none within
 * `reach`). A side whose way out runs into the infield or another part of the
 * track is left out: it has no coast of its own.
 */
function seaAlongRays(island: Island, line: CenterLine, width: Float64Array, reach: number, samples: number[] = []): number[] {
  const field = island.natural;
  const out: number[] = [];
  for (let i = 0; i < line.count; i += 4) {
    for (const side of [1, -1]) {
      // Right of the direction of travel is (-tz, tx) on the map.
      const nx = -line.tz[i]! * side;
      const nz = line.tx[i]! * side;
      const half = width[i]! / 2;
      let found = Infinity;
      let blocked = false;
      for (let t = 1; t <= reach; t += 1.5) {
        const x = line.x[i]! + nx * (half + t);
        const z = line.z[i]! + nz * (half + t);
        if (sampleGrid(field, island.inside, x, z, 0) > 0.5) {
          blocked = true;
          break;
        }
        // Another part of the track is nearer than this one: this is not this sample's coast.
        if (sampleGrid(field, island.edge, x, z, Infinity) < t - 4) {
          blocked = true;
          break;
        }
        if (sampleField(field, x, z, -1) <= 0) {
          found = t;
          break;
        }
      }
      if (!blocked) {
        out.push(found);
        samples.push(i);
      }
    }
  }
  return out;
}

interface Built {
  seed: number;
  line: CenterLine;
  /** Road height at each sample. */
  height: Float64Array;
  width: Float64Array;
  island: Island;
}

function build(seed: number, kind: CoastKind): Built {
  // No mountains: these tests are about the hinterland alone. A mountain grows the island too; see mountains.test.ts.
  // A mountain seed's massif is part of its ground whatever the mountain count, so mountain seeds are tested as hilly ones.
  let cfg = withCharacter(coarse, { coast: kind, mountains: 0 });
  if (generateTrack(seed, cfg).character.relief === 'mountain') cfg = withCharacter(coarse, { coast: kind, mountains: 0, relief: 'hilly' });
  const track = generateTrack(seed, cfg);
  const winner = track.candidates[track.winnerIndex]!;
  const width = solveWidth(seed, winner.line, winner.sections, track.character.width, cfg);
  const island = buildIsland(seed, winner.line, winner.profile, width, cfg, track.character);
  return { seed, line: winner.line, height: winner.profile.height, width, island };
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const islands: Record<CoastKind, Built[]> = {
  inland: SEEDS.map((seed) => build(seed, 'inland')),
  touches: SEEDS.map((seed) => build(seed, 'touches')),
  coastal: SEEDS.map((seed) => build(seed, 'coastal')),
};

describe.each(['inland', 'touches', 'coastal'] as const)('every %s island', (kind) => {
  it('keeps the sea at least 10 m from the road edge', () => {
    for (const { island, seed } of islands[kind]) {
      let nearest = Infinity;
      for (let c = 0; c < island.natural.height.length; c++) {
        if (island.natural.height[c]! <= 0) nearest = Math.min(nearest, island.edge[c]!);
      }
      expect(nearest, `seed ${seed}`).toBeGreaterThanOrEqual(coast.minMargin - 1);
    }
  });

  it('is open sea all round the edge of the tile', () => {
    for (const { island, seed } of islands[kind]) {
      const { size, height } = island.natural;
      const last = size - 1;
      for (let k = 0; k < size; k++) {
        for (const c of [k, last * size + k, k * size, k * size + last]) expect(height[c]!, `seed ${seed}`).toBeLessThan(0);
      }
    }
  });

  it('has no water cut off from the open sea: no pools or pits in the land', () => {
    for (const { island, seed } of islands[kind]) {
      const { size, height } = island.natural;
      // Flood the open sea in from the edge of the tile.
      const open = new Uint8Array(size * size);
      const queue: number[] = [];
      for (let k = 0; k < size; k++) {
        for (const c of [k, (size - 1) * size + k, k * size, k * size + size - 1]) {
          if (height[c]! <= 0 && open[c] === 0) {
            open[c] = 1;
            queue.push(c);
          }
        }
      }
      while (queue.length > 0) {
        const c = queue.pop()!;
        const ix = c % size;
        const iz = (c - ix) / size;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const x = ix + dx;
          const z = iz + dz;
          if (x < 0 || z < 0 || x >= size || z >= size) continue;
          const next = z * size + x;
          if (open[next] === 0 && height[next]! <= 0) {
            open[next] = 1;
            queue.push(next);
          }
        }
      }
      let trapped = 0;
      for (let c = 0; c < height.length; c++) if (height[c]! <= 0 && open[c] === 0) trapped++;
      expect(trapped, `seed ${seed}`).toBe(0);
    }
  });

  it('leaves the sea deep beyond the furthest the land can reach', () => {
    const far = hinterland.reach[1] + coast.seaDepth / coast.shelfSlope + 40;
    for (const { island, seed } of islands[kind]) {
      let shallowest = -Infinity;
      for (let c = 0; c < island.natural.height.length; c++) {
        if (island.edge[c]! > far) shallowest = Math.max(shallowest, island.natural.height[c]!);
      }
      expect(shallowest, `seed ${seed}`).toBeLessThan(-coast.seaDepth + 0.01);
    }
  });

  it('never lets the land run on more than the hinterland reaches', () => {
    for (const { island, seed } of islands[kind]) {
      let furthest = 0;
      for (let c = 0; c < island.natural.height.length; c++) {
        if (island.natural.height[c]! > 0 && island.inside[c] === 0) furthest = Math.max(furthest, island.edge[c]!);
      }
      expect(furthest, `seed ${seed}`).toBeLessThan(hinterland.reach[1] + 20);
    }
  });

  it('keeps the hinterland coast gentle: no slope much steeper than a sea cliff anywhere', () => {
    for (const { island, seed } of islands[kind]) {
      const { size, cell, height } = island.natural;
      let steepest = 0;
      for (let iz = 0; iz < size - 1; iz++) {
        for (let ix = 0; ix < size - 1; ix++) {
          const c = iz * size + ix;
          // Away from the road: the near coast's cliffs and the road's own banks are tested elsewhere.
          if (island.edge[c]! < 80) continue;
          steepest = Math.max(steepest, Math.abs(height[c + 1]! - height[c]!) / cell, Math.abs(height[c + size]! - height[c]!) / cell);
        }
      }
      expect(steepest, `seed ${seed}`).toBeLessThan(coast.cliffSlope);
    }
  });
});

describe('inland islands', () => {
  it('have no sea within 60 m of the road', () => {
    for (const { island, seed } of islands.inland) {
      for (let c = 0; c < island.natural.height.length; c++) {
        if (island.edge[c]! < 60) expect(island.natural.height[c]!, `seed ${seed}`).toBeGreaterThan(0);
      }
    }
  });

  it('run on well past the road: 80 m or more on most of the outside', () => {
    for (const { island, line, width, seed } of islands.inland) {
      const sea = seaAlongRays(island, line, width, 120);
      expect(sea.length, `seed ${seed}`).toBeGreaterThan(20);
      const far = sea.filter((distance) => distance >= 80).length;
      expect(far / sea.length, `seed ${seed}`).toBeGreaterThan(0.7);
    }
  });

  it('have no bays or headlands, which belong to coasts beside the road', () => {
    for (const { island, seed } of islands.inland) {
      expect(island.bays, `seed ${seed}`).toEqual([]);
      expect(island.headlands, `seed ${seed}`).toEqual([]);
    }
  });
});

describe('coastal islands', () => {
  it('have most of the outside of the road within 35 m of the sea, or as close as a cliff beside a high road allows', () => {
    for (const { island, line, height, width, seed } of islands.coastal) {
      const samples: number[] = [];
      const sea = seaAlongRays(island, line, width, 120, samples);
      const close = sea.filter((distance, k) => distance <= seasideLimit(height[samples[k]!]!)).length;
      // The plan asks for "most": more than half.
      expect(close / sea.length, `seed ${seed}`).toBeGreaterThan(0.5);
    }
  });
});

describe('islands that touch the sea', () => {
  it('have the sea beside the road somewhere, but along less than half its outside', () => {
    for (const { island, line, width, seed } of islands.touches) {
      const sea = seaAlongRays(island, line, width, 120);
      const close = sea.filter((distance) => distance <= coast.margin[1] + 2).length;
      expect(close, `seed ${seed}`).toBeGreaterThan(0);
      expect(close / sea.length, `seed ${seed}`).toBeLessThan(0.5);
    }
  });

  it('have land running on 80 m or more past most of the road the hinterland covers', () => {
    for (const { island, line, width, seed } of islands.touches) {
      const samples: number[] = [];
      const sea = seaAlongRays(island, line, width, 120, samples);
      const covered = sea.filter((_, k) => island.seaside[samples[k]!] === 0);
      expect(covered.length, `seed ${seed}`).toBeGreaterThan(20);
      // The rest is the short stretch where the hinterland gives way to the coast beside the road.
      expect(covered.filter((distance) => distance >= 80).length / covered.length, `seed ${seed}`).toBeGreaterThan(0.5);
    }
  });
});

describe('the coast trait', () => {
  it('gives the three kinds clearly different amounts of sea beside the road', () => {
    const share = (kind: CoastKind): number => {
      let close = 0;
      let all = 0;
      for (const { island, line, width } of islands[kind]) {
        const sea = seaAlongRays(island, line, width, 120);
        close += sea.filter((distance) => distance <= coast.margin[1] + 2).length;
        all += sea.length;
      }
      return close / all;
    };
    const inland = share('inland');
    const touches = share('touches');
    const coastal = share('coastal');
    expect(inland).toBe(0);
    expect(touches).toBeGreaterThan(0.05);
    expect(coastal).toBeGreaterThan(touches + 0.3);
  });

  it('is the same island for the same seed', () => {
    const again = build(3, 'touches');
    expect(again.island.natural.height).toEqual(islands.touches[2]!.island.natural.height);
  });
});
