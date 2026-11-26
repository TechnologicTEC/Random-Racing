import type { GenConfig } from '../../config';
import { length2 } from '../../core/dmath';
import type { Cover, Crossing, CrossingPoint, HeightField, Scatter, StillWater } from '../types';
import { bankSlopeOf } from './crossing';

/**
 * A hill river's still water (M6.1d-3), or null for any other crossing: its surface at the crossing's level, reaching
 * at each point of the path across its floor and up its banks to where they climb out of it, and its mesh, flat at
 * the level over every cell of the grid with a corner within a cell of the water, so it runs on under the banks.
 */
export function buildStillWater(crossing: Crossing, ground: HeightField, cfg: GenConfig): StillWater | null {
  if (!crossing.water) return null;
  const { level } = crossing.water;
  const slope = bankSlopeOf(crossing.kind, cfg.world.crossings);
  const { path } = crossing;
  const wet = Float32Array.from(path, (p) => (p.floor < level ? p.half + (level - p.floor) / slope : 0));
  const water: StillWater = { level, wet, mesh: { positions: new Float32Array(), indices: new Uint32Array(), materials: new Uint8Array() } };

  const { size, cell, origin } = ground;
  let widest = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  path.forEach((p, k) => {
    if (wet[k]! <= 0) return;
    widest = Math.max(widest, wet[k]!);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  });
  if (widest <= 0) return water;
  const reach = widest + 2 * cell;
  const ix0 = Math.max(0, Math.floor((minX - reach - origin) / cell));
  const ix1 = Math.min(size - 2, Math.ceil((maxX + reach - origin) / cell));
  const iz0 = Math.max(0, Math.floor((minZ - reach - origin) / cell));
  const iz1 = Math.min(size - 2, Math.ceil((maxZ + reach - origin) / cell));

  // Which grid corners are within a cell of the water.
  const across = ix1 - ix0 + 2;
  const near = new Uint8Array(across * (iz1 - iz0 + 2));
  for (let iz = iz0; iz <= iz1 + 1; iz++) {
    for (let ix = ix0; ix <= ix1 + 1; ix++) {
      near[(iz - iz0) * across + (ix - ix0)] = inStillWater(water, path, origin + ix * cell, origin + iz * cell, cell) ? 1 : 0;
    }
  }
  const positions: number[] = [];
  const indices: number[] = [];
  const vertex = new Map<number, number>();
  const corner = (ix: number, iz: number): number => {
    const key = iz * size + ix;
    let index = vertex.get(key);
    if (index === undefined) {
      index = positions.length / 3;
      vertex.set(key, index);
      positions.push(origin + ix * cell, level, origin + iz * cell);
    }
    return index;
  };
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const k = (iz - iz0) * across + (ix - ix0);
      if (!(near[k] || near[k + 1] || near[k + across] || near[k + across + 1])) continue;
      // Facing up: (x0, z0), (x0, z1), (x1, z0), then (x1, z0), (x0, z1), (x1, z1).
      const a = corner(ix, iz);
      const b = corner(ix, iz + 1);
      const c = corner(ix + 1, iz);
      const d = corner(ix + 1, iz + 1);
      indices.push(a, b, c, c, b, d);
    }
  }
  water.mesh = { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), materials: new Uint8Array(positions.length / 3) };
  return water;
}

/**
 * Whether a point is in a hill river's still water (M6.1d-3): within the water's reach of the crossing's path
 * (between each point and the next, and round its ends), and `margin` metres more. Plain sums, the same on every
 * computer, for the simulation's respawn too.
 */
export function inStillWater(water: StillWater, path: readonly CrossingPoint[], x: number, z: number, margin = 0): boolean {
  const { wet } = water;
  for (let k = 0; k < path.length; k++) {
    const a = path[k]!;
    const j = Math.min(k + 1, path.length - 1);
    const b = path[j]!;
    if (wet[k]! <= 0 && wet[j]! <= 0) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const along = dx * dx + dz * dz;
    const t = along > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / along)) : 0;
    const reach = wet[k]! + (wet[j]! - wet[k]!) * t;
    if (reach <= 0) continue;
    if (length2(x - (a.x + dx * t), z - (a.z + dz * t)) <= reach + margin) return true;
  }
  return false;
}

/** A scatter of trees or rocks without those standing in a hill river's still water, or within `margin` of it. */
export function outOfStillWater(scatter: Scatter, water: StillWater, path: readonly CrossingPoint[], margin: number): Scatter {
  const keep: number[] = [];
  for (let k = 0; k < scatter.count; k++) if (!inStillWater(water, path, scatter.x[k]!, scatter.z[k]!, margin)) keep.push(k);
  if (keep.length === scatter.count) return scatter;
  const pick = <T extends Float32Array | Uint8Array>(values: T): T => {
    const out = new (values.constructor as new (n: number) => T)(values.length);
    keep.forEach((k, i) => (out[i] = values[k]!));
    return out;
  };
  return {
    count: keep.length,
    x: pick(scatter.x),
    y: pick(scatter.y),
    z: pick(scatter.z),
    size: pick(scatter.size),
    tall: pick(scatter.tall),
    turn: pick(scatter.turn),
    lean: pick(scatter.lean),
    kind: pick(scatter.kind),
    shade: pick(scatter.shade),
  };
}

/** The cover with no grass under a hill river's still water, nor within a cell of it: its floor is bare (M6.1d-3). */
export function withoutGrassUnder(cover: Cover, ground: HeightField, water: StillWater, path: readonly CrossingPoint[]): Cover {
  const grass = new Uint8Array(cover.grass);
  const { size, cell, origin } = ground;
  const { positions } = water.mesh;
  // Every cell the water's mesh reaches is a candidate: its corners are the mesh's vertices.
  for (let v = 0; v < positions.length; v += 3) {
    const ix = Math.round((positions[v]! - origin) / cell);
    const iz = Math.round((positions[v + 2]! - origin) / cell);
    if (inStillWater(water, path, positions[v]!, positions[v + 2]!, cell)) grass[iz * size + ix] = 0;
  }
  return { ...cover, grass };
}
