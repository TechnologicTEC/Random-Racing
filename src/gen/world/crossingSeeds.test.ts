import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld, hashWorld } from '../generate';
import { placeLapGates } from '../road/lapGates';
import { solveWidth } from '../road/width';
import type { BridgeSpan, CrossingKind, WorldResult } from '../types';
import { chooseCrossing } from './crossing';
import { sampleField } from './heightfield';
import { buildIsland } from './island';

/**
 * M6.1d-2: the crossing carved into the world. Seeds 19, 9, 6 and 1 have an inlet, a river, a ravine and a hill
 * river (its gorge only, until M6.1d-3 gives it water); seed 7 has none.
 */
const KINDS: Record<CrossingKind, number> = { inlet: 19, river: 9, ravine: 6, hillRiver: 1 };
const worlds = new Map<number, WorldResult>();
beforeAll(() => {
  for (const seed of [...Object.values(KINDS), 7]) worlds.set(seed, generateWorld(seed, config));
}, 300_000);

const winnerOf = (world: WorldResult) => world.track.candidates[world.track.winnerIndex]!;
const covers = (span: BridgeSpan, i: number, n: number): boolean => (i - span.startIndex + n) % n < span.sampleCount;

/** Whether the water at a cell (ground under the sea) is joined to the open sea at the tile's border, cell by cell. */
function joinedToOpenSea(world: WorldResult, x: number, z: number): boolean {
  const { size, cell, origin, height } = world.ground;
  const start = Math.round((z - origin) / cell) * size + Math.round((x - origin) / cell);
  if (!(height[start]! < 0)) return false;
  const seen = new Uint8Array(size * size);
  const queue = [start];
  seen[start] = 1;
  while (queue.length > 0) {
    const c = queue.pop()!;
    const ix = c % size;
    const iz = (c - ix) / size;
    if (ix === 0 || iz === 0 || ix === size - 1 || iz === size - 1) return true;
    for (const next of [c - 1, c + 1, c - size, c + size]) {
      if (!seen[next] && height[next]! < 0) {
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  return false;
}

describe('the crossing in the world (M6.1d-2)', () => {
  it('is the one chooseCrossing picks on the island before it is carved, and seed 7 has none', () => {
    for (const [kind, seed] of Object.entries(KINDS)) {
      const world = worlds.get(seed)!;
      expect(world.crossing?.kind, `seed ${seed}`).toBe(kind);
      const track = world.track;
      const winner = winnerOf(world);
      const width = solveWidth(track.seed, winner.line, winner.sections, track.character.width, config);
      const island = buildIsland(track.seed, winner.line, winner.profile, width, config, track.character);
      const lapGates = placeLapGates(winner.line, winner.sections, config.road.lapGates);
      const first = chooseCrossing(seed, { line: winner.line, height: winner.profile.height, width, bridges: winner.bridges, lapGates, island }, config);
      // The first one chosen: its bridge on the carved ground is no longer than the longest.
      expect(world.crossing, `seed ${seed}`).toEqual(first);
    }
    const seven = worlds.get(7)!;
    expect(seven.crossing).toBeNull();
    expect(seven.road.bridges.spans).toEqual(winnerOf(seven).bridges);
  });

  it('carries the road over it on a bridge no longer than the longest, with railings on both sides', () => {
    for (const seed of Object.values(KINDS)) {
      const world = worlds.get(seed)!;
      const { line } = winnerOf(world);
      const n = line.count;
      const sample = world.crossing!.sample;
      const span = world.road.bridges.spans.find((s) => covers(s, sample, n));
      expect(span, `seed ${seed}: a bridge over sample ${sample}`).toBeDefined();
      expect((span!.sampleCount - 1) * line.spacing).toBeLessThanOrEqual(config.road.bridges.maxLength);
      for (const side of [-1, 1]) {
        const railing = world.road.walls.find((w) => w.side === side && covers({ startIndex: w.startIndex, sampleCount: w.pieceCount }, sample, n));
        expect(railing, `seed ${seed}: a railing on side ${side}`).toBeDefined();
      }
      // The lap's own bridges are all still bridged.
      for (const own of winnerOf(world).bridges) {
        for (let k = 0; k < own.sampleCount; k++) expect(world.road.bridges.spans.some((s) => covers(s, (own.startIndex + k) % n, n))).toBe(true);
      }
      expect(world.road.bridges.kinds).toHaveLength(world.road.bridges.spans.length);
    }
  });

  it('gives the crossing’s bridge its look by its size over the carved ground: seed 9’s river bridge wooden, the others concrete', () => {
    const look = config.road.bridges.look;
    for (const seed of Object.values(KINDS)) {
      const world = worlds.get(seed)!;
      const winner = winnerOf(world);
      const n = winner.line.count;
      const s = world.road.bridges.spans.findIndex((span) => covers(span, world.crossing!.sample, n));
      const span = world.road.bridges.spans[s]!;
      let highest = 0;
      for (let k = 0; k < span.sampleCount; k++) {
        const i = (span.startIndex + k) % n;
        highest = Math.max(highest, winner.profile.height[i]! - sampleField(world.natural, winner.line.x[i]!, winner.line.z[i]!, 0));
      }
      const wood = (span.sampleCount - 1) * winner.line.spacing <= look.woodMaxLength && highest <= look.woodMaxHeight;
      expect(world.road.bridges.kinds[s], `seed ${seed}`).toBe(wood ? 'wood' : 'concrete');
      expect(world.road.bridges.kinds[s], `seed ${seed}`).toBe(seed === KINDS.river ? 'wood' : 'concrete');
    }
  });

  it('opens an inlet and a river to the sea: under the bridge the water is over 1.5 m deep, and joined to the open sea', () => {
    for (const seed of [KINDS.inlet, KINDS.river]) {
      const world = worlds.get(seed)!;
      const { line } = winnerOf(world);
      const at = world.crossing!.sample;
      expect(sampleField(world.ground, line.x[at]!, line.z[at]!, 0), `seed ${seed}`).toBeLessThan(-1.5);
      expect(joinedToOpenSea(world, line.x[at]!, line.z[at]!), `seed ${seed}`).toBe(true);
    }
  });

  it('cuts a ravine and a hill river’s gorge 10 to 30 m under the road at the bridge', () => {
    for (const seed of [KINDS.ravine, KINDS.hillRiver]) {
      const world = worlds.get(seed)!;
      const winner = winnerOf(world);
      const at = world.crossing!.sample;
      const depth = winner.profile.height[at]! - sampleField(world.ground, winner.line.x[at]!, winner.line.z[at]!, 0);
      expect(depth, `seed ${seed}`).toBeGreaterThanOrEqual(config.world.crossings.ravine.depth[0]);
      expect(depth, `seed ${seed}`).toBeLessThanOrEqual(config.world.crossings.ravine.depth[1] + 0.01);
    }
  });

  it('leaves no road hanging in the air, no ground through it, and the surf 10 m from the road off the bridges', () => {
    for (const seed of Object.values(KINDS)) {
      const { report } = worlds.get(seed)!;
      expect(report.roadFloating, `seed ${seed}`).toBe(0);
      expect(report.groundThroughRoad, `seed ${seed}`).toBe(0);
      expect(report.nearestWater.value, `seed ${seed}`).toBeGreaterThan(config.world.coast.minMargin - 1);
    }
  });

  it('stands no tree or rock on the floor of an inlet or a river (shore rocks in the shallows are the coast’s own)', () => {
    for (const seed of [KINDS.inlet, KINDS.river]) {
      const world = worlds.get(seed)!;
      for (const scatter of [world.decor.trees, world.decor.rocks]) {
        for (let k = 0; k < scatter.count; k++) {
          for (const p of world.crossing!.path) {
            expect(Math.hypot(scatter.x[k]! - p.x, scatter.z[k]! - p.z), `seed ${seed}: at (${scatter.x[k]}, ${scatter.z[k]})`).toBeGreaterThan(p.half);
          }
        }
      }
    }
  });

  it('puts the crossing in the world’s fingerprint', () => {
    const world = generateWorld(KINDS.ravine, config);
    const before = hashWorld(world);
    world.crossing!.path[0]!.floor += 1;
    expect(hashWorld(world)).not.toBe(before);
  });
});
