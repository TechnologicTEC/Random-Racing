import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../../gen';
import type { Cover, HeightField } from '../../gen/types';
import { worldX, worldZ } from '../../gen/world/heightfield';
import { createCarPhysics } from '../physics/carBody';
import { NO_COLLIDER, type WorldColliders } from '../physics/colliders';
import { loadRapier } from '../physics/rapier';
import { startPose } from '../start';
import { surfaceFinder, surfaceShare, type Surface } from './surface';

const colliders: WorldColliders = { ground: 0, road: 1, kerbs: 2, walls: [3, 4], gate: [5, 6, 7], bridges: [], trees: [8], rocks: [9] };

/** A 3 by 3 grid of 10 m cells centred on the origin, with one kind of cover at each of five of its points. */
const field: HeightField = { size: 3, cell: 10, origin: -10, height: new Float32Array(9) };
function coverOf(spots: Partial<Record<'grass' | 'sand' | 'rock' | 'snow', number[]>>): Cover {
  const layer = (at: number[] | undefined): Uint8Array => {
    const values = new Uint8Array(9);
    for (const i of at ?? []) values[i] = 255;
    return values;
  };
  return { grass: layer(spots.grass), sand: layer(spots.sand), rock: layer(spots.rock), snow: layer(spots.snow), variation: new Uint8Array(9) };
}

describe('surfaceFinder on an island', () => {
  // Grass at the corner (-10, -10), sand at (10, -10), rock at (-10, 10), snow over rock at (10, 10), nothing in the middle.
  const cover = coverOf({ grass: [0], sand: [2], rock: [6, 8], snow: [8] });
  const surfaceOf = surfaceFinder(colliders, { field, cover });

  it('names the road and the kerbs by what the wheel met, wherever it is', () => {
    expect(surfaceOf(colliders.road, -10, -10)).toBe('road');
    expect(surfaceOf(colliders.kerbs, 10, 10)).toBe('kerb');
  });

  it('names the ground by what covers it there', () => {
    expect(surfaceOf(colliders.ground, -9, -9)).toBe('grass');
    expect(surfaceOf(colliders.ground, 9, -9)).toBe('sand');
    expect(surfaceOf(colliders.ground, -9, 9)).toBe('rock');
  });

  it('calls it snow where snow lies, whatever is under it', () => {
    expect(surfaceOf(colliders.ground, 9, 9)).toBe('snow');
  });

  it('takes the thickest cover where two meet', () => {
    // Grass at (-10, -10) and sand 10 m along at (0, -10): a quarter of the way there is more grass than sand, three quarters more sand.
    const meeting = surfaceFinder(colliders, { field, cover: coverOf({ grass: [0], sand: [1] }) });
    expect(meeting(colliders.ground, -7.5, -10)).toBe('grass');
    expect(meeting(colliders.ground, -2.5, -10)).toBe('sand');
  });

  it('calls bare ground grass: the verge beside the road, and anywhere off the map', () => {
    expect(surfaceOf(colliders.ground, 0, 0)).toBe('grass');
    expect(surfaceOf(colliders.ground, 500, 500)).toBe('grass');
  });
});

describe('surfaceShare: the share of top speed the wheels allow', () => {
  const car = config.car;
  const wheels = (...surfaces: Array<Surface | null>) => surfaces.map((surface) => ({ surface }));

  it('is 1 with all four wheels on the road or a kerb', () => {
    expect(surfaceShare(wheels('road', 'road', 'road', 'road'), car)).toBe(1);
    expect(surfaceShare(wheels('road', 'kerb', 'road', 'kerb'), car)).toBe(1);
  });

  it('averages the shares of the wheels on the ground', () => {
    const grass = car.surfaces.grass;
    expect(surfaceShare(wheels('grass', 'grass', 'grass', 'grass'), car)).toBeCloseTo(grass, 12);
    expect(surfaceShare(wheels('road', 'grass', 'road', 'grass'), car)).toBeCloseTo((2 + 2 * grass) / 4, 12);
    expect(surfaceShare(wheels('sand', 'rock', 'snow', 'grass'), car)).toBeCloseTo((car.surfaces.sand + car.surfaces.rock + car.surfaces.snow + grass) / 4, 12);
  });

  it('counts only the wheels on the ground', () => {
    expect(surfaceShare(wheels('grass', null, null, null), car)).toBeCloseTo(car.surfaces.grass, 12);
    expect(surfaceShare(wheels('road', 'grass', null, null), car)).toBeCloseTo((1 + car.surfaces.grass) / 2, 12);
  });

  it('is 1 with no wheel on the ground', () => {
    expect(surfaceShare(wheels(null, null, null, null), car)).toBe(1);
  });
});

describe('surfaceFinder on a plain test ground', () => {
  it('calls the road road, the kerbs kerb and the other mesh grass', () => {
    const surfaceOf = surfaceFinder({ ...colliders, walls: [], gate: [], bridges: [], trees: [], rocks: [] }, null);
    expect(surfaceOf(colliders.road, 0, 0)).toBe('road');
    expect(surfaceOf(colliders.kerbs, 0, 0)).toBe('kerb');
    expect(surfaceOf(colliders.ground, 0, 0)).toBe('grass');
  });

  it('never mistakes a missing collider for one that was met', () => {
    const surfaceOf = surfaceFinder({ ground: NO_COLLIDER, road: 0, kerbs: NO_COLLIDER, walls: [], gate: [], bridges: [], trees: [], rocks: [] }, null);
    expect(surfaceOf(0, 0, 0)).toBe('road');
  });
});

describe('surfaces under a cast wheel on seed 7', () => {
  it('names the road, a kerb, grass and sand where they are', async () => {
    const rapier = await loadRapier();
    const world = generateWorld(7, config);
    const physics = createCarPhysics(rapier, { kind: 'island', world }, config, startPose(world, config));
    const surfaceOf = surfaceFinder(physics.colliders, { field: world.ground, cover: world.cover });
    const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
    /** What a wheel dropped from 2 m above a point is standing on. */
    const under = (x: number, y: number, z: number): string => {
      const hit = physics.castWheel({ x, y: y + 2, z }, { x: 0, y: -1, z: 0 }, 6);
      expect(hit, `nothing under ${x}, ${z}`).not.toBeNull();
      return surfaceOf(hit!.collider, x, z);
    };

    expect(under(line.x[150]!, profile.height[150]!, line.z[150]!)).toBe('road');

    // The middle of the first kerb: just outside the road edge on its side (right of the direction of travel is (-tz, tx)).
    const kerb = world.road.kerbs.spans[0]!;
    const k = (kerb.startIndex + Math.floor(kerb.sampleCount / 2)) % line.count;
    const out = kerb.side * (world.road.width[k]! / 2 + config.road.kerbWidth / 2);
    expect(under(line.x[k]! - line.tz[k]! * out, profile.height[k]!, line.z[k]! + line.tx[k]! * out)).toBe('kerb');

    // Ground cells wholly under grass, and wholly under sand above the sea.
    const { ground, cover } = world;
    const cellWhere = (layer: Uint8Array): { x: number; y: number; z: number } => {
      for (let iz = 2; iz < ground.size - 2; iz++) {
        for (let ix = 2; ix < ground.size - 2; ix++) {
          const i = iz * ground.size + ix;
          const around = [i, i - 1, i + 1, i - ground.size, i + ground.size];
          if (around.every((j) => layer[j] === 255 && cover.snow[j] === 0) && ground.height[i]! > 0.5) {
            return { x: worldX(ground, ix) + 0.2, y: ground.height[i]!, z: worldZ(ground, iz) + 0.2 };
          }
        }
      }
      throw new Error('no such ground on this seed');
    };
    const grass = cellWhere(cover.grass);
    expect(under(grass.x, grass.y, grass.z)).toBe('grass');
    const sand = cellWhere(cover.sand);
    expect(under(sand.x, sand.y, sand.z)).toBe('sand');
    physics.free();
  });
});
