import type { GenConfig } from '../../config';
import { buildTunnels, underLid, type TunnelShape } from '../road/tunnels';
import type { CenterLine, Cover, CoveredMesh, HeightField, LandformKind, Scatter, TunnelSpan } from '../types';
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

/** The cover with no grass in any cell under a tunnel's lid, nor within half a cell of one (M6.2b): no blade pokes through it. */
export function withoutGrassUnderLids(cover: Cover, ground: HeightField, shape: TunnelShape, line: CenterLine, spans: readonly TunnelSpan[]): Cover {
  if (spans.length === 0) return cover;
  const grass = new Uint8Array(cover.grass);
  const { size, cell, origin } = ground;
  const p = shape.lid.positions;
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let v = 0; v < p.length; v += 3) [minX, maxX, minZ, maxZ] = [Math.min(minX, p[v]!), Math.max(maxX, p[v]!), Math.min(minZ, p[v + 2]!), Math.max(maxZ, p[v + 2]!)];
  const [fromX, toX] = [Math.max(0, Math.floor((minX - origin) / cell) - 1), Math.min(size - 1, Math.ceil((maxX - origin) / cell) + 1)];
  const [fromZ, toZ] = [Math.max(0, Math.floor((minZ - origin) / cell) - 1), Math.min(size - 1, Math.ceil((maxZ - origin) / cell) + 1)];
  for (let iz = fromZ; iz <= toZ; iz++) {
    for (let ix = fromX; ix <= toX; ix++) {
      if (underLid(shape, line, spans, origin + ix * cell, origin + iz * cell, cell / 2)) grass[iz * size + ix] = 0;
    }
  }
  return { ...cover, grass };
}

/** A scatter of trees or rocks less those standing under a tunnel's lid or within `margin` metres of one (M6.2b). */
export function outOfTunnels(scatter: Scatter, shape: TunnelShape, line: CenterLine, spans: readonly TunnelSpan[], margin: number): Scatter {
  if (spans.length === 0) return scatter;
  const keep: number[] = [];
  for (let k = 0; k < scatter.count; k++) if (!underLid(shape, line, spans, scatter.x[k]!, scatter.z[k]!, margin)) keep.push(k);
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
