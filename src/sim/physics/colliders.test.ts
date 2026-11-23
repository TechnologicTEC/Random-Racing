import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld, type WorldResult } from '../../gen';
import { worldX, worldZ } from '../../gen/world/heightfield';
import { groundCollider, meshCollider } from './colliders';
import { loadRapier, type Rapier } from './rapier';

/** A mountain seed and a hilly one: neither island is the same turned or mirrored, so a grid laid the wrong way round shows. */
const SEEDS = [1, 7];

let rapier: Rapier;
const worlds = new Map<number, WorldResult>();
beforeAll(async () => {
  rapier = await loadRapier();
  for (const seed of SEEDS) worlds.set(seed, generateWorld(seed, config));
});

/** Height at which a ray dropped from far above (x, z) first meets anything, or null if it meets nothing. */
function dropRay(physics: InstanceType<Rapier['World']>, x: number, z: number): number | null {
  const from = 2000;
  const hit = physics.castRay(new rapier.Ray({ x, y: from, z }, { x: 0, y: -1, z: 0 }), 4000, true);
  return hit ? from - hit.timeOfImpact : null;
}

describe.each(SEEDS)('groundCollider on seed %i', (seed) => {
  const build = (): { physics: InstanceType<Rapier['World']>; world: WorldResult } => {
    const world = worlds.get(seed)!;
    const physics = new rapier.World({ x: 0, y: -9.81, z: 0 });
    physics.createCollider(groundCollider(rapier, world.ground));
    physics.step();
    return { physics, world };
  };

  it('meets a ray at the ground\'s own height at grid points all over the tile', () => {
    const { physics, world } = build();
    const { ground } = world;
    let checked = 0;
    let worst = 0;
    // Every 37th row and 41st column: about 530 points, never lined up with each other.
    for (let iz = 1; iz < ground.size - 1; iz += 37) {
      for (let ix = 1; ix < ground.size - 1; ix += 41) {
        // A millimetre off the grid point: a ray dropped exactly on a point where triangles meet can slip between them.
        const height = dropRay(physics, worldX(ground, ix) + 0.001, worldZ(ground, iz) + 0.001);
        expect(height, `ray at column ${ix}, row ${iz}`).not.toBeNull();
        worst = Math.max(worst, Math.abs(height! - ground.height[iz * ground.size + ix]!));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
    // Rapier keeps heights as 32-bit numbers, as the grid does. The millimetre's step aside costs up to 2 cm on the steepest cliffs.
    expect(worst).toBeLessThan(0.02);
    physics.free();
  });

  it('lies between the four corners of a cell everywhere inside it', () => {
    const { physics, world } = build();
    const { ground } = world;
    for (let iz = 5; iz < ground.size - 2; iz += 53) {
      for (let ix = 7; ix < ground.size - 2; ix += 59) {
        const corners = [0, 1, ground.size, ground.size + 1].map((step) => ground.height[iz * ground.size + ix + step]!);
        const height = dropRay(physics, worldX(ground, ix) + ground.cell * 0.37, worldZ(ground, iz) + ground.cell * 0.71);
        expect(height).not.toBeNull();
        expect(height!).toBeGreaterThanOrEqual(Math.min(...corners) - 0.005);
        expect(height!).toBeLessThanOrEqual(Math.max(...corners) + 0.005);
      }
    }
    physics.free();
  });

  it('covers the whole tile and nothing beyond it', () => {
    const { physics, world } = build();
    const edge = -world.ground.origin;
    for (const [x, z] of [[edge - 1, edge - 1], [1 - edge, edge - 1], [edge - 1, 1 - edge], [1 - edge, 1 - edge]] as const) {
      expect(dropRay(physics, x, z), `inside the corner at ${x}, ${z}`).not.toBeNull();
    }
    for (const [x, z] of [[edge + 1, 0], [-edge - 1, 0], [0, edge + 1], [0, -edge - 1]] as const) {
      expect(dropRay(physics, x, z), `outside the tile at ${x}, ${z}`).toBeNull();
    }
    physics.free();
  });
});

describe('meshCollider', () => {
  it('puts the road surface where its triangles are: a ray on the centre line meets the road, above the sunken ground', () => {
    const world = worlds.get(7)!;
    const physics = new rapier.World({ x: 0, y: -9.81, z: 0 });
    physics.createCollider(groundCollider(rapier, world.ground));
    physics.createCollider(meshCollider(rapier, world.road.mesh));
    physics.step();
    const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
    let worst = 0;
    for (let i = 0; i < line.count; i += 7) {
      const height = dropRay(physics, line.x[i]!, line.z[i]!);
      expect(height).not.toBeNull();
      worst = Math.max(worst, Math.abs(height! - profile.height[i]!));
    }
    // The ground under the road is sunk by `road.sink` (0.25 m), so anything near that would mean the ray fell through the road.
    expect(worst).toBeLessThan(0.02);
    physics.free();
  });
});
