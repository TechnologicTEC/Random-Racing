import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld, hashWorld } from '../generate';
import type { CrossingPoint, StillWater, WorldResult } from '../types';
import { sampleField } from './heightfield';
import { inStillWater } from './stillWater';

/** M6.1d-3: a river high in the hills holds still water at one level in its closed gorge. Seeds 1 and 33 have one. */
const HILL = [1, 33];
const worlds = new Map<number, WorldResult>();
beforeAll(() => {
  for (const seed of [...HILL, 19, 6, 7]) worlds.set(seed, generateWorld(seed, config));
}, 300_000);

const waterOf = (seed: number): { water: StillWater; path: CrossingPoint[]; world: WorldResult } => {
  const world = worlds.get(seed)!;
  return { water: world.stillWater!, path: world.crossing!.path, world };
};

/** The grid cells the water's mesh covers, by the corner of each with the least x and z. */
function coveredCells(world: WorldResult): Set<number> {
  const { positions, indices } = world.stillWater!.mesh;
  const { size, cell, origin } = world.ground;
  const cells = new Set<number>();
  for (let t = 0; t < indices.length; t += 3) {
    let x = Infinity;
    let z = Infinity;
    for (let k = 0; k < 3; k++) {
      x = Math.min(x, positions[indices[t + k]! * 3]!);
      z = Math.min(z, positions[indices[t + k]! * 3 + 2]!);
    }
    cells.add(Math.round((z - origin) / cell) * size + Math.round((x - origin) / cell));
  }
  return cells;
}

describe('a hill river’s still water (M6.1d-3)', () => {
  it('stands at the crossing’s level on a hill river, and no other world has any', () => {
    for (const seed of HILL) {
      const world = worlds.get(seed)!;
      expect(world.crossing?.kind, `seed ${seed}`).toBe('hillRiver');
      expect(world.stillWater?.level, `seed ${seed}`).toBe(world.crossing!.water!.level);
      expect(world.stillWater!.wet).toHaveLength(world.crossing!.path.length);
    }
    for (const seed of [19, 6, 7]) expect(worlds.get(seed)!.stillWater, `seed ${seed}`).toBeNull();
  });

  it('is flat at its level and covers the gorge’s floor wherever the ground is under it', () => {
    for (const seed of HILL) {
      const { water, path, world } = waterOf(seed);
      const { positions } = water.mesh;
      expect(positions.length).toBeGreaterThan(0);
      for (let v = 1; v < positions.length; v += 3) expect(positions[v]).toBe(Math.fround(water.level));
      const covered = coveredCells(world);
      const { size, cell, origin } = world.ground;
      let under = 0;
      for (const p of path) {
        // The cells across the floor at each point.
        for (let dz = -p.half; dz <= p.half; dz += cell) {
          for (let dx = -p.half; dx <= p.half; dx += cell) {
            if (dx * dx + dz * dz > p.half * p.half) continue;
            const ix = Math.floor((p.x + dx - origin) / cell);
            const iz = Math.floor((p.z + dz - origin) / cell);
            const corners = [0, 1, size, size + 1].map((k) => world.ground.height[iz * size + ix + k]!);
            if (Math.max(...corners) >= water.level) continue;
            under++;
            expect(covered.has(iz * size + ix), `seed ${seed}: cell (${ix}, ${iz})`).toBe(true);
          }
        }
      }
      expect(under).toBeGreaterThan(50);
    }
  });

  it('is held in all round: where the mesh ends, the ground stands over the level', () => {
    for (const seed of HILL) {
      const { water, world } = waterOf(seed);
      const covered = coveredCells(world);
      const { size, height } = world.ground;
      for (const c of covered) {
        // Each side of the cell with no water beyond it: its two corners on that side.
        const sides: [number, number, number][] = [
          [c - size, c, c + 1],
          [c + size, c + size, c + size + 1],
          [c - 1, c, c + size],
          [c + 1, c + 1, c + size + 1],
        ];
        for (const [beyond, a, b] of sides) {
          if (covered.has(beyond)) continue;
          expect(Math.min(height[a]!, height[b]!), `seed ${seed}: the edge of cell ${c}`).toBeGreaterThanOrEqual(water.level);
        }
      }
    }
  });

  it('is deep enough under the bridge to be water: over a metre', () => {
    for (const seed of HILL) {
      const { water, world } = waterOf(seed);
      const { line } = world.track.candidates[world.track.winnerIndex]!;
      const at = world.crossing!.sample;
      expect(water.level - sampleField(world.ground, line.x[at]!, line.z[at]!, 0), `seed ${seed}`).toBeGreaterThan(1);
    }
  });

  it('tells a point in the water from one beside it, along the road or out at sea', () => {
    for (const seed of HILL) {
      const { water, path, world } = waterOf(seed);
      const { line } = world.track.candidates[world.track.winnerIndex]!;
      const at = world.crossing!.sample;
      expect(inStillWater(water, path, line.x[at]!, line.z[at]!)).toBe(true);
      // Every point of the path where the floor is under the level.
      for (const p of path) if (p.floor < water.level - 0.01) expect(inStillWater(water, path, p.x, p.z)).toBe(true);
      const along = (at + 100) % line.count;
      expect(inStillWater(water, path, line.x[along]!, line.z[along]!)).toBe(false);
      expect(inStillWater(water, path, 1300, 1300)).toBe(false);
      // Just past its widest reach, beside it.
      const k = path.findIndex((p) => Math.hypot(p.x - line.x[at]!, p.z - line.z[at]!) < 1e-6);
      const side = { x: -world.crossing!.across.z, z: world.crossing!.across.x };
      const reach = water.wet[k]!;
      expect(inStillWater(water, path, path[k]!.x + side.x * (reach - 0.5), path[k]!.z + side.z * (reach - 0.5))).toBe(true);
      expect(inStillWater(water, path, path[k]!.x + side.x * (reach + 0.5), path[k]!.z + side.z * (reach + 0.5))).toBe(false);
    }
  });

  it('stands no tree or rock in the water, and grows no grass under it', () => {
    for (const seed of HILL) {
      const { water, path, world } = waterOf(seed);
      for (const scatter of [world.decor.trees, world.decor.rocks]) {
        for (let k = 0; k < scatter.count; k++) expect(inStillWater(water, path, scatter.x[k]!, scatter.z[k]!, 1), `seed ${seed}: (${scatter.x[k]}, ${scatter.z[k]})`).toBe(false);
      }
      const { size, cell, origin } = world.ground;
      for (const c of coveredCells(world)) {
        const x = origin + (c % size) * cell;
        const z = origin + Math.floor(c / size) * cell;
        if (inStillWater(water, path, x, z)) expect(world.cover.grass[c], `seed ${seed}: cell ${c}`).toBe(0);
      }
    }
  });

  it('puts the still water in the world’s fingerprint', () => {
    const world = generateWorld(1, config);
    const before = hashWorld(world);
    world.stillWater!.level += 0.5;
    expect(hashWorld(world)).not.toBe(before);
  });
});

describe('inStillWater on a hand-made gorge', () => {
  // Along the x axis from -50 to 50, the water 10 m either side, its surface 20 m up.
  const path: CrossingPoint[] = Array.from({ length: 51 }, (_, k) => ({ x: -50 + 2 * k, z: 0, half: 6, floor: 18 }));
  const water: StillWater = { level: 20, wet: new Float32Array(51).fill(10), mesh: { positions: new Float32Array(), indices: new Uint32Array(), materials: new Uint8Array() } };

  it('is in the water within its reach of the path, and round its ends', () => {
    expect(inStillWater(water, path, 0, 9.9)).toBe(true);
    expect(inStillWater(water, path, 0, -9.9)).toBe(true);
    expect(inStillWater(water, path, 58, 0)).toBe(true);
    expect(inStillWater(water, path, 0, 10.1)).toBe(false);
    expect(inStillWater(water, path, 61, 0)).toBe(false);
    // A margin widens it.
    expect(inStillWater(water, path, 0, 11, 2)).toBe(true);
  });

  it('follows the reach from point to point, and is dry where it is 0', () => {
    const narrowing = { ...water, wet: Float32Array.from({ length: 51 }, (_, k) => (k < 25 ? 10 : 0)) };
    expect(inStillWater(narrowing, path, -20, 9)).toBe(true);
    expect(inStillWater(narrowing, path, 20, 1)).toBe(false);
  });
});
