import type { GenConfig, TunnelConfig } from '../../config';
import { buildTunnels, type TunnelRoom, type TunnelShape } from '../road/tunnels';
import type { CenterLine, Cover, CoveredMesh, HeightField, LandformKind, LidTop, Scatter, TunnelSpan } from '../types';
import { coverSampler } from './cover';
import { sampleField } from './heightfield';
import type { NearestRoad } from './nearest';

/** 1 for each sample of the lap where no lap gate may stand (M6.2b): in a tunnel, or within `road.tunnels.gateClear` of either end of one. */
export function tunnelGateBlock(spans: readonly TunnelSpan[], line: Pick<CenterLine, 'count' | 'spacing'>, cfg: Pick<GenConfig, 'road'>): Uint8Array {
  const n = line.count;
  const blocked = new Uint8Array(n);
  const clear = Math.ceil(cfg.road.tunnels.gateClear / line.spacing);
  for (const span of spans) for (let k = -clear; k < span.sampleCount + clear; k++) blocked[(((span.startIndex + k) % n) + n) % n] = 1;
  return blocked;
}

/** The lap's sample nearest a point, from the island's map of the nearest road (its grid's cell nearest the point). */
export function nearestOnGrid(near: NearestRoad, field: HeightField): (x: number, z: number) => number {
  const { size, cell, origin } = field;
  return (x, z) => {
    const ix = Math.min(size - 1, Math.max(0, Math.round((x - origin) / cell)));
    const iz = Math.min(size - 1, Math.max(0, Math.round((z - origin) / cell)));
    return near.index[iz * size + ix]!;
  };
}

/**
 * The tunnels in the world (M6.2b): their shape (`buildTunnels`) over the cutting the fit made in the `hillside` it
 * was given, and their lids' cover. Each corner of a lid is covered as the hillside would be at its height and the
 * hillside's slope there (`coverSampler`, grass growing right over the road); a corner on the ground, at a lid's edge
 * or the foot of a face, takes the ground's own cover there, so the lid meets it in the same colours.
 */
export function buildTunnelWorld(
  seed: number,
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  spans: readonly TunnelSpan[],
  hillside: HeightField,
  ground: HeightField,
  cover: Cover,
  near: NearestRoad,
  landform: LandformKind,
  cfg: GenConfig,
): { shape: TunnelShape; lid: CoveredMesh } {
  const shape = buildTunnels(
    line,
    height,
    cross,
    width,
    spans,
    {
      natural: (x, z) => sampleField(hillside, x, z, 0),
      ground: (x, z) => sampleField(ground, x, z, 0),
      nearest: nearestOnGrid(near, ground),
    },
    cfg,
  );
  const { positions, indices } = shape.lid;
  const corners = positions.length / 3;
  const lid: Cover = {
    grass: new Uint8Array(corners),
    sand: new Uint8Array(corners),
    rock: new Uint8Array(corners),
    snow: new Uint8Array(corners),
    variation: new Uint8Array(corners),
  };
  const sample = coverSampler(seed, cfg, landform);
  const { size, cell, origin } = ground;
  for (let v = 0; v < corners; v++) {
    const [x, y, z] = [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!];
    let here;
    if (y <= sampleField(ground, x, z, 0) + 0.01) {
      const ix = Math.min(size - 1, Math.max(0, Math.round((x - origin) / cell)));
      const iz = Math.min(size - 1, Math.max(0, Math.round((z - origin) / cell)));
      const c = iz * size + ix;
      here = { grass: cover.grass[c]!, sand: cover.sand[c]!, rock: cover.rock[c]!, snow: cover.snow[c]!, variation: cover.variation[c]! };
    } else {
      const east = sampleField(hillside, x + cell, z, 0) - sampleField(hillside, x - cell, z, 0);
      const south = sampleField(hillside, x, z + cell, 0) - sampleField(hillside, x, z - cell, 0);
      here = sample(x, z, y, Math.sqrt(east * east + south * south) / (2 * cell));
    }
    lid.grass[v] = here.grass;
    lid.sand[v] = here.sand;
    lid.rock[v] = here.rock;
    lid.snow[v] = here.snow;
    lid.variation[v] = here.variation;
  }
  return { shape, lid: { positions, indices, cover: lid } };
}

/** Points tried along each side of a grid cell when the lid is laid on the grid. */
const SUB = 4;
/** A lid counts as the top of the land where it stands this far over the drawn ground; at its edge it is tucked under it. */
const PRESENT = 0.05;
/** A point this little outside a triangle, in its own coordinates, still counts as in it. */
const INSIDE = 1e-7;
/** How many times the grid's lid heights are lowered where blades would float (each time by what is still too much). */
const LOWERINGS = 4;

/** None at all, for a world with no tunnel: new arrays each time, since the worker hands a world's arrays over to the page. */
const noTop = (): LidTop => ({ cells: new Uint32Array(0), height: new Float32Array(0), grass: new Uint8Array(0), rock: new Uint8Array(0), variation: new Uint8Array(0), rough: new Uint32Array(0) });

/**
 * Where the tunnels' lids are the top of the land (M6.2b-3). The lid's triangles are laid on the ground's grid, at
 * `SUB` points along each side of a cell: at each point what is drawn on top is the higher of the ground (two
 * triangles a cell, as the ground is drawn) and the lid. Every point of the grid the lid stands over takes the lid's
 * height and its cover, blended from the corners of the lid's triangle there.
 *
 * The grass and the trees read heights blended between the grid's points. Where the lid bends (at the foot of a mound,
 * where it falls to the lower hill) that blend cuts across the bend and stands above what is drawn, so the lid's points
 * of such a cell are lowered until it no longer stands more than `rules.float` above it: a blade sunk into the lid is
 * hidden, a floating one is not. Where the blend still lies more than `rules.float` above what is drawn, or more than
 * `rules.sink` below it, anywhere in a cell (at a portal, over the open cutting in front of it, or where a lid's edge
 * stands above the ground), the cell's four corners are rough: no blade stands there, on the lid or on the ground (the
 * ground's own cover, and so its colour, is left as it is).
 */
export function lidTop(ground: HeightField, lid: CoveredMesh, rules: TunnelConfig['top']): LidTop {
  const { size, cell, origin, height } = ground;
  const p = lid.positions;
  if (lid.indices.length === 0) return noTop();

  // The grid's points round the lid, with a cell to spare.
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let v = 0; v < p.length; v += 3) [minX, maxX, minZ, maxZ] = [Math.min(minX, p[v]!), Math.max(maxX, p[v]!), Math.min(minZ, p[v + 2]!), Math.max(maxZ, p[v + 2]!)];
  const [ix0, ix1] = [Math.max(0, Math.floor((minX - origin) / cell) - 1), Math.min(size - 1, Math.ceil((maxX - origin) / cell) + 1)];
  const [iz0, iz1] = [Math.max(0, Math.floor((minZ - origin) / cell) - 1), Math.min(size - 1, Math.ceil((maxZ - origin) / cell) + 1)];
  const [x0, z0] = [origin + ix0 * cell, origin + iz0 * cell];
  const step = cell / SUB;
  const wide = (ix1 - ix0) * SUB + 1;
  const deep = (iz1 - iz0) * SUB + 1;

  // The lid's height at each fine point (the highest triangle over it), and its cover at the grid's own points.
  const fine = new Float64Array(wide * deep).fill(-Infinity);
  const coarseWide = ix1 - ix0 + 1;
  const coarse = (coarseWide) * (iz1 - iz0 + 1);
  const [grass, rock, variation] = [new Float64Array(coarse), new Float64Array(coarse), new Float64Array(coarse)];
  const { cover } = lid;
  for (let t = 0; t < lid.indices.length; t += 3) {
    const [a, b, c] = [lid.indices[t]!, lid.indices[t + 1]!, lid.indices[t + 2]!];
    const [ax, ay, az] = [p[a * 3]!, p[a * 3 + 1]!, p[a * 3 + 2]!];
    const [bx, by, bz] = [p[b * 3]!, p[b * 3 + 1]!, p[b * 3 + 2]!];
    const [cx, cy, cz] = [p[c * 3]!, p[c * 3 + 1]!, p[c * 3 + 2]!];
    const det = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    // An upright face, seen from above, covers nothing.
    if (Math.abs(det) < 1e-9) continue;
    const fx0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / step - 1e-6));
    const fx1 = Math.min(wide - 1, Math.floor((Math.max(ax, bx, cx) - x0) / step + 1e-6));
    const fz0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - z0) / step - 1e-6));
    const fz1 = Math.min(deep - 1, Math.floor((Math.max(az, bz, cz) - z0) / step + 1e-6));
    for (let fz = fz0; fz <= fz1; fz++) {
      const z = z0 + fz * step;
      for (let fx = fx0; fx <= fx1; fx++) {
        const x = x0 + fx * step;
        const u = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / det;
        const v = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / det;
        if (u < -INSIDE || v < -INSIDE || u + v > 1 + INSIDE) continue;
        const y = ay + (by - ay) * u + (cy - ay) * v;
        const k = fz * wide + fx;
        if (y <= fine[k]!) continue;
        fine[k] = y;
        if (fx % SUB !== 0 || fz % SUB !== 0) continue;
        const g = (fz / SUB) * coarseWide + fx / SUB;
        const blend = (values: Uint8Array): number => values[a]! * (1 - u - v) + values[b]! * u + values[c]! * v;
        [grass[g], rock[g], variation[g]] = [blend(cover.grass), blend(cover.rock), blend(cover.variation)];
      }
    }
  }

  /** The ground as drawn at a fine point: two triangles a cell, split from (x+1, z) to (x, z+1). */
  const groundAt = (fx: number, fz: number): number => {
    const jx = Math.min(ix1 - 1, ix0 + Math.floor(fx / SUB));
    const jz = Math.min(iz1 - 1, iz0 + Math.floor(fz / SUB));
    const [tx, tz] = [(fx - (jx - ix0) * SUB) / SUB, (fz - (jz - iz0) * SUB) / SUB];
    const at = (dx: number, dz: number): number => height[(jz + dz) * size + jx + dx]!;
    return tx + tz <= 1 ? at(0, 0) + (at(1, 0) - at(0, 0)) * tx + (at(0, 1) - at(0, 0)) * tz : at(1, 1) + (at(0, 1) - at(1, 1)) * (1 - tx) + (at(1, 0) - at(1, 1)) * (1 - tz);
  };
  /** What is drawn on top at a fine point. */
  const drawnTop = (fx: number, fz: number): number => Math.max(groundAt(fx, fz), fine[fz * wide + fx]!);

  // The grid's own points: the lid's where it stands over the ground.
  const on = new Uint8Array(coarse);
  const blended = new Float64Array(coarse);
  for (let gz = 0; gz <= iz1 - iz0; gz++) {
    for (let gx = 0; gx < coarseWide; gx++) {
      const g = gz * coarseWide + gx;
      const lidY = fine[gz * SUB * wide + gx * SUB]!;
      const groundY = height[(iz0 + gz) * size + ix0 + gx]!;
      on[g] = lidY > groundY + PRESENT ? 1 : 0;
      blended[g] = on[g] ? lidY : groundY;
    }
  }

  // The cells with a lid in them, by their first corner.
  const lidded: number[] = [];
  for (let gz = 0; gz < iz1 - iz0; gz++) {
    for (let gx = 0; gx + 1 < coarseWide; gx++) {
      let found = false;
      for (let b = 0; b <= SUB && !found; b++) {
        for (let a = 0; a <= SUB && !found; a++) {
          const [fx, fz] = [gx * SUB + a, gz * SUB + b];
          if (fine[fz * wide + fx]! > groundAt(fx, fz) + PRESENT) found = true;
        }
      }
      if (found) lidded.push(gz * coarseWide + gx);
    }
  }
  const CORNERS = [0, 1, coarseWide, coarseWide + 1];
  /**
   * How far the blend of a cell's corners lies above (most) and below (least) what is drawn, over its points; and how
   * far its lid corners must come down together so that it lies no more than `rules.float` above it anywhere
   * (Infinity where a point it floats over hardly depends on them).
   */
  const strays = (g: number): { most: number; least: number; need: number } => {
    const [gx, gz] = [g % coarseWide, Math.floor(g / coarseWide)];
    const [c00, c10, c01, c11] = CORNERS.map((k) => blended[g + k]!) as [number, number, number, number];
    const [o00, o10, o01, o11] = CORNERS.map((k) => on[g + k]!) as [number, number, number, number];
    let [most, least, need] = [-Infinity, Infinity, 0];
    for (let b = 0; b <= SUB; b++) {
      for (let a = 0; a <= SUB; a++) {
        const [tx, tz] = [a / SUB, b / SUB];
        // The weights of the corners at this point, on the cell's two triangles.
        const [w00, w10, w01, w11] = tx + tz <= 1 ? [1 - tx - tz, tx, tz, 0] : [0, 1 - tz, 1 - tx, tx + tz - 1];
        const grid = w00 * c00 + w10 * c10 + w01 * c01 + w11 * c11;
        const off = grid - drawnTop(gx * SUB + a, gz * SUB + b);
        [most, least] = [Math.max(most, off), Math.min(least, off)];
        if (off <= rules.float) continue;
        const weight = w00 * o00 + w10 * o10 + w01 * o01 + w11 * o11;
        need = Math.max(need, weight < 0.05 ? Infinity : (off - rules.float) / weight);
      }
    }
    return { most, least, need };
  };

  // Where the blend floats, the lid's corners come down by as much as it takes, but never more than `sink` in all.
  const lowest = Float64Array.from(blended, (y) => y - rules.sink);
  const drop = new Float64Array(coarse);
  for (let pass = 0; pass < LOWERINGS; pass++) {
    drop.fill(0);
    let lowered = false;
    for (const g of lidded) {
      const { need } = strays(g);
      // Nothing to do, or more than lowering may do: the cell is left to be rough.
      if (need <= 0 || need > rules.sink) continue;
      for (const k of CORNERS) {
        if (!on[g + k] || drop[g + k]! >= need || blended[g + k]! <= lowest[g + k]!) continue;
        // A hair more than it takes, so it is not left just over.
        drop[g + k] = need + 1e-4;
        lowered = true;
      }
    }
    if (!lowered) break;
    for (let g = 0; g < coarse; g++) blended[g] = Math.max(lowest[g]!, blended[g]! - drop[g]!);
  }

  // Each cell whose blend still strays from what is drawn: its corners are rough.
  const roughMask = new Uint8Array(coarse);
  for (const g of lidded) {
    const { most, least } = strays(g);
    if (most <= rules.float && least >= -rules.sink) continue;
    for (const k of CORNERS) roughMask[g + k] = 1;
  }

  const cells: number[] = [];
  const heights: number[] = [];
  const grassOut: number[] = [];
  const rockOut: number[] = [];
  const variationOut: number[] = [];
  const rough: number[] = [];
  for (let gz = 0; gz <= iz1 - iz0; gz++) {
    for (let gx = 0; gx < coarseWide; gx++) {
      const g = gz * coarseWide + gx;
      const c = (iz0 + gz) * size + ix0 + gx;
      if (roughMask[g]) rough.push(c);
      if (!on[g]) continue;
      cells.push(c);
      heights.push(blended[g]!);
      grassOut.push(roughMask[g] ? 0 : Math.round(grass[g]!));
      rockOut.push(Math.round(rock[g]!));
      variationOut.push(Math.round(variation[g]!));
    }
  }
  return {
    cells: Uint32Array.from(cells),
    height: Float32Array.from(heights),
    grass: Uint8Array.from(grassOut),
    rock: Uint8Array.from(rockOut),
    variation: Uint8Array.from(variationOut),
    rough: Uint32Array.from(rough),
  };
}

/** The land's top (M6.2b-3): the ground, with a lid's height wherever a lid stands over it. The ground itself if there is none. */
export function surfaceOf(ground: HeightField, top: LidTop): HeightField {
  if (top.cells.length === 0) return ground;
  const height = new Float32Array(ground.height);
  top.cells.forEach((c, i) => (height[c] = top.height[i]!));
  return { ...ground, height };
}

/** How far from the road a point on a lid is taken to be, in metres, for the trees and rocks: the road under it is out of sight. */
const OFF_THE_ROAD = 1000;

/**
 * What the trees and rocks read where a lid is the top of the land (M6.2b-3): its grass, rock and variation in place of
 * the ground's, and the road under it as far away, so they are scattered over it as on the hill.
 *
 * @param edge distance from every cell to the edge of the road, in metres (see edgeDistance)
 */
export function decorOnLids(cover: Cover, edge: Float32Array, top: LidTop): { cover: Cover; edge: Float32Array } {
  if (top.cells.length === 0) return { cover, edge };
  const out = { ...cover, grass: new Uint8Array(cover.grass), rock: new Uint8Array(cover.rock), variation: new Uint8Array(cover.variation) };
  const far = new Float32Array(edge);
  top.cells.forEach((c, i) => {
    out.grass[c] = top.grass[i]!;
    out.rock[c] = top.rock[i]!;
    out.variation[c] = top.variation[i]!;
    far[c] = Math.max(far[c]!, OFF_THE_ROAD);
  });
  return { cover: out, edge: far };
}

/** A drawn rock is a lumpy ball no further across than this many times its size (`rockShape`'s lumps reach 1.14). */
export const ROCK_EXTENT = 1.15;
/** A tree's trunk reaches no further than this round its foot, nor further under it, in metres (as its collider). */
const TRUNK_REACH = 0.5;
const TRUNK_DEPTH = 1;

/**
 * How far round its foot and under it a rock of a size and height reaches (M6.2c), its middle sunk `sink` of its size
 * under its foot (`world.decor.rocks.sink`), however it leans.
 */
export function rockExtent(sink: number): (size: number, tall: number) => { reach: number; depth: number } {
  return (size, tall) => {
    const reach = ROCK_EXTENT * size * Math.max(1, tall);
    return { reach, depth: sink * size + reach };
  };
}

/** How far round its foot and under it a tree's trunk reaches (M6.2c). */
export function treeExtent(): { reach: number; depth: number } {
  return { reach: TRUNK_REACH, depth: TRUNK_DEPTH };
}

/** Points looked at round a tree's or rock's foot, all the way out and half way, for `clearOfCeilings`. */
const ROUND = 32;
/** Taken as over a wall this much further out than its outer face, in metres, for the points between those looked at. */
const BETWEEN = 0.1;

/**
 * A scatter of trees or rocks less those that would reach down through a tunnel's ceiling (M6.2c), in the same order:
 * one whose drawn bottom, `depth` metres under its foot (`extentOf`), lies nearer than `gap` to the ceiling anywhere
 * within `reach` of its foot that is under a lid and no further out than the walls' outer faces (`wall` metres beyond
 * their inner faces). The ceiling is drawn between the walls, and its edge on them: a big rock on a thin lid shows
 * through it from inside.
 */
export function clearOfCeilings(
  scatter: Scatter,
  rooms: (x: number, z: number) => TunnelRoom | null,
  extentOf: (size: number, tall: number) => { reach: number; depth: number },
  wall: number,
  gap: number,
): Scatter {
  const keep: number[] = [];
  for (let k = 0; k < scatter.count; k++) {
    const [x, z] = [scatter.x[k]!, scatter.z[k]!];
    const { reach, depth } = extentOf(scatter.size[k]!, scatter.tall[k]!);
    const bottom = scatter.y[k]! - depth;
    let through = false;
    for (let p = 0; p <= 2 * ROUND && !through; p++) {
      const out = p === 0 ? 0 : p <= ROUND ? reach : reach / 2;
      const angle = (p * 2 * Math.PI) / ROUND;
      const room = rooms(x + out * Math.cos(angle), z + out * Math.sin(angle));
      if (!room?.under || Math.abs(room.lateral) > room.inner + wall + BETWEEN) continue;
      if (bottom < room.ceiling + gap) through = true;
    }
    if (!through) keep.push(k);
  }
  return keepOnly(scatter, keep);
}

/** A scatter of trees or rocks less those standing within `clear` metres of a rough point of the grid (M6.2b-3), in the same order. */
export function clearOfRough(scatter: Scatter, ground: HeightField, rough: Uint32Array, clear: number): Scatter {
  if (rough.length === 0) return scatter;
  const { size, cell, origin } = ground;
  const marked = new Set(rough);
  const keep: number[] = [];
  for (let k = 0; k < scatter.count; k++) {
    const [x, z] = [scatter.x[k]!, scatter.z[k]!];
    let near = false;
    const [fromX, toX] = [Math.max(0, Math.floor((x - clear - origin) / cell)), Math.min(size - 1, Math.ceil((x + clear - origin) / cell))];
    const [fromZ, toZ] = [Math.max(0, Math.floor((z - clear - origin) / cell)), Math.min(size - 1, Math.ceil((z + clear - origin) / cell))];
    for (let iz = fromZ; iz <= toZ && !near; iz++) {
      for (let ix = fromX; ix <= toX && !near; ix++) {
        if (marked.has(iz * size + ix) && Math.hypot(origin + ix * cell - x, origin + iz * cell - z) <= clear) near = true;
      }
    }
    if (!near) keep.push(k);
  }
  return keepOnly(scatter, keep);
}

/** A scatter of only those listed, in order; the same scatter when that is all of them. */
function keepOnly(scatter: Scatter, keep: readonly number[]): Scatter {
  if (keep.length === scatter.count) return scatter;
  const pick = <T extends Float32Array | Uint8Array>(values: T): T => {
    const out = new (values.constructor as new (n: number) => T)(keep.length);
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
