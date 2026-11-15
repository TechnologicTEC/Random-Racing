import type { ShadowConfig } from '../config';
import type { HeightField } from '../gen/types';

/** Height of the shadow's top where nothing casts one: far below anything. */
const NONE = -1e9;

/**
 * Where the land keeps the sun off, for one position of the sun, as plain numbers.
 *
 * For every point of the ground's grid, `top` is the height of the shadow over
 * it: anything lower is in the land's shadow, anything higher is in the sun.
 * Storing the shadow's top, not just whether the ground is lit, lets trees,
 * barriers and the sea's surface each be lit by their own height.
 */
export interface LandShade {
  /** The ground's grid: values along each side, metres between them, and the world x (and z) of the first. */
  size: number;
  cell: number;
  origin: number;
  /** The shadow's top over each point, row by row (rows along +z), in metres; far below the sea where there is no shadow. */
  top: Float32Array;
  /** How deep the soft edge of a shadow is, in metres of height: the configured edge on level ground, times the sun's slope. */
  soft: number;
  /** A point is only shaded once it is this far below the shadow's top, in metres. */
  bias: number;
}

/** Smooth step from 0 at `from` to 1 at `to`, as in the shader language. */
export function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/**
 * Works out the land's shadow for the sun in a direction.
 *
 * One sweep over the grid, starting from the side nearest the sun: each point
 * looks one step back towards the sun, takes the higher of the ground there
 * and the shadow passing over it, and lowers it by the sun's slope over the
 * step. The sea is taken as a flat surface at height 0, so cliffs shade the
 * water and not the sea bed under it.
 *
 * @param sun a unit vector from the ground towards the sun
 */
export function landShade(ground: HeightField, sun: { x: number; y: number; z: number }, cfg: ShadowConfig['land']): LandShade {
  const { size, cell, origin, height } = ground;
  const elevation = Math.max(cfg.lowest, Math.asin(Math.min(1, Math.max(-1, sun.y))));
  const slope = Math.tan(elevation);
  const top = new Float32Array(size * size).fill(NONE);
  const result = { size, cell, origin, top, soft: cfg.edge * slope, bias: cfg.bias };
  const across = Math.hypot(sun.x, sun.z);
  // A sun straight overhead casts no shadow beyond what stands under it.
  if (across < 1e-6) return result;

  // Sweep along whichever grid direction is closer to the sun's. `major` steps one cell towards the sun;
  // over that step the sun's direction moves `minor` cells along the other axis.
  const alongX = Math.abs(sun.x) >= Math.abs(sun.z);
  const towards = Math.sign(alongX ? sun.x : sun.z);
  const minor = (alongX ? sun.z : sun.x) / Math.abs(alongX ? sun.x : sun.z);
  const drop = cell * Math.hypot(1, minor) * slope;
  /** The grid index of the point `a` along the sweep and `b` across it. */
  const index = alongX ? (a: number, b: number): number => b * size + a : (a: number, b: number): number => a * size + b;
  /** What a point casts: the higher of its surface (ground, or the sea's) and the shadow over it. */
  const caster = (c: number): number => Math.max(height[c]! < 0 ? 0 : height[c]!, top[c]!);

  // The line nearest the sun has nothing between it and the sun.
  const first = towards > 0 ? size - 1 : 0;
  for (let a = first - towards; a >= 0 && a < size; a -= towards) {
    const back = a + towards;
    for (let b = 0; b < size; b++) {
      const at = b + minor;
      const low = Math.floor(at);
      const t = at - low;
      const near = low >= 0 && low < size ? caster(index(back, low)) : NONE;
      const far = low + 1 >= 0 && low + 1 < size ? caster(index(back, low + 1)) : NONE;
      let cast: number;
      if (near === NONE && far === NONE) cast = NONE;
      else if (far === NONE || t === 0) cast = near === NONE ? far : near;
      else if (near === NONE) cast = far;
      else cast = near + (far - near) * t;
      if (cast !== NONE) top[index(a, b)] = cast - drop;
    }
  }
  return result;
}

/**
 * The share of the sun's light (0 to 1) that the land lets reach a point at
 * height `y`. Between the grid's points the shadow's top is blended from the
 * four around, exactly as the shader does. Off the grid nothing is shaded.
 */
export function landLightAt(shade: LandShade, x: number, y: number, z: number): number {
  const last = shade.size - 1;
  const gx = (x - shade.origin) / shade.cell;
  const gz = (z - shade.origin) / shade.cell;
  if (gx < 0 || gz < 0 || gx > last || gz > last) return 1;
  const ix = Math.min(last - 1, Math.floor(gx));
  const iz = Math.min(last - 1, Math.floor(gz));
  const fx = gx - ix;
  const fz = gz - iz;
  const at = (cx: number, cz: number): number => shade.top[cz * shade.size + cx]!;
  const near = at(ix, iz) + (at(ix + 1, iz) - at(ix, iz)) * fx;
  const far = at(ix, iz + 1) + (at(ix + 1, iz + 1) - at(ix, iz + 1)) * fx;
  const top = near + (far - near) * fz;
  // The soft edge lies wholly below the shadow's top, so level ground (and the sea), which is its own neighbour's caster, is never dimmed.
  return smoothstep(top - shade.soft, top, y + shade.bias);
}
