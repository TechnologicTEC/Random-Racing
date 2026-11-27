import type { GenConfig, RoadConfig } from '../../config';
import type { CenterLine, MeshData, RoadProfile, TunnelSpan, Violation } from '../types';
import { closeGaps, runsOf } from './bridges';
import { MeshBuilder, type Point } from './meshBuilder';
import { ROAD_MATERIAL } from './ribbon';
import { cutAndFill, type RoadEdges } from './profile';

/**
 * Where the road runs in tunnels (M6.2a): every stretch whose cut (in its middle, and at its banked edges when
 * `edges` are given) is more than `road.maxCut`, reaching each way until the cut is no more than
 * `road.tunnels.endCut`, made at least `minLength` long about its middle, and joined to the next tunnel when less
 * than `mergeGap` of open road lies between them. A tunnel never runs onto a bridge (`bridged`, 1 for each sample
 * on one): it stops short of it, and two tunnels are never joined across one. In order from sample 0; a span may
 * wrap past the lap's end.
 */
export function findTunnelSpans(profile: RoadProfile, spacing: number, road: RoadConfig, edges?: RoadEdges, bridged?: Uint8Array): TunnelSpan[] {
  const n = profile.height.length;
  const { endCut, minLength, mergeGap } = road.tunnels;
  const cut = new Float64Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    cut[i] = cutAndFill(i, profile, edges).cut;
    if (cut[i]! > road.maxCut && !bridged?.[i]) any = true;
  }
  if (!any) return [];

  // The stretches over the end cut off the bridges that hold some cut over the limit, each padded to the shortest span.
  const over = new Uint8Array(n);
  for (let i = 0; i < n; i++) over[i] = cut[i]! > endCut && !bridged?.[i] ? 1 : 0;
  const shortest = Math.ceil(minLength / spacing) + 1;
  const mask = new Uint8Array(n);
  for (const run of runsOf(over)) {
    let deep = false;
    for (let k = 0; k < run.sampleCount && !deep; k++) deep = cut[(run.startIndex + k) % n]! > road.maxCut;
    if (!deep) continue;
    let { startIndex, sampleCount } = run;
    if (sampleCount < shortest) {
      startIndex = (startIndex - Math.floor((shortest - sampleCount) / 2) + n) % n;
      sampleCount = shortest;
    }
    if (sampleCount >= n) sampleCount = n;
    for (let k = 0; k < sampleCount; k++) {
      const i = (startIndex + k) % n;
      if (!bridged?.[i]) mask[i] = 1;
    }
  }

  return closeGaps(mask, spacing, mergeGap, bridged);
}

/**
 * A layout is rejected if a tunnel comes within `road.tunnels.startClear` of its start line, either way round the
 * loop or over it (M6.2a), so the start gate and the cars waiting at it stand in the open. Marked at the line, with
 * how far the nearest tunnel is from it.
 *
 * @param start the sample the start line will be on
 */
export function checkTunnelStart(line: CenterLine, tunnels: readonly TunnelSpan[], start: number, road: RoadConfig): Violation[] {
  const n = line.count;
  let nearest = Infinity;
  for (const span of tunnels) {
    // Samples from the tunnel's first to the line, and from its last to the line, round the loop.
    const after = (((start - span.startIndex) % n) + n) % n;
    if (after < span.sampleCount) {
      nearest = 0;
      break;
    }
    const toEnd = after - (span.sampleCount - 1);
    const toStart = n - after;
    nearest = Math.min(nearest, Math.min(toEnd, toStart) * line.spacing);
  }
  if (nearest >= road.tunnels.startClear) return [];
  return [{ kind: 'tunnel-at-start', x: line.x[start]!, z: line.z[start]!, value: nearest, limit: road.tunnels.startClear }];
}

/** The ground a tunnel is built in (M6.2b), read at any point. */
export interface TunnelGround {
  /** The hillside the road was cut into. */
  natural: (x: number, z: number) => number;
  /** The finished ground, the cutting in it. */
  ground: (x: number, z: number) => number;
  /** The lap's sample nearest a point. */
  nearest: (x: number, z: number) => number;
}

/** A tunnel's lid: the hillside over it, as triangles sharing their corners. */
export interface TunnelLid {
  positions: Float32Array;
  indices: Uint32Array;
}

/** The tunnels' shape (M6.2b). */
export interface TunnelShape {
  /** Walls, ceilings and portals, in flat colours. */
  mesh: MeshData;
  lid: TunnelLid;
  /** How far the lid reaches left and right of the centre line at each sample, in metres; 0 off the tunnels. */
  left: Float64Array;
  right: Float64Array;
}

/**
 * Where a tunnel's walls stand across the road at a sample (M6.2b), in metres from the centre line: their inner faces
 * against the barriers' outer faces, their outer faces `road.tunnels.wall` further out.
 */
export function tunnelWallOffsets(width: Float64Array, i: number, road: RoadConfig): { inner: number; outer: number } {
  const inner = width[i]! / 2 + road.barrierOffset + road.barrierWidth;
  return { inner, outer: inner + road.tunnels.wall };
}

/** A point of the lid belongs to its own tunnel while the lap's nearest sample to it is within this many metres of road of the sample it was laid from. */
const OWN_ROAD = 60;
/** The lid's reach is felt for in steps this long, in metres. */
const PROBE = 0.5;
/** The lid has met the ground where it stands no more than this above it, in metres. */
const MEET = 0.05;
/** A lid's edge that meets the ground is tucked this far under it, in metres, so the ground's own triangles cover the seam. */
const TUCK = 0.02;
/** A face down from a lid's edge, or beside a portal's opening, reaches this far into the ground, in metres. */
const FOOT = 0.5;
/** The lid may reach this far past the fit's furthest blend, in metres: past a grid cell, so it meets the hill where the blend ends. */
const REACH_SPARE = 4;
/** On the inside of a corner the lid reaches no further than this share of the corner's radius, so it never folds over itself. */
const CURVE_SHARE = 0.8;

type Vec = { x: number; y: number; z: number };

/** Adds a quad (corners as for `MeshBuilder.quad`) turned so that it faces `toward`. */
function face(builder: MeshBuilder, a: Point, b: Point, c: Point, d: Point, toward: Vec, material: number): void {
  if (dot(normalOf(a, b, c), toward) < 0) builder.quad(a, c, b, d, material);
  else builder.quad(a, b, c, d, material);
}

/** The face normal (not of unit length) of the triangle a, b, c as `MeshBuilder` winds it. */
function normalOf(a: Vec, b: Vec, c: Vec): Vec {
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const w = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  return { x: u.y * w.z - u.z * w.y, y: u.z * w.x - u.x * w.z, z: u.x * w.y - u.y * w.x };
}

function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * The tunnels' shape (M6.2b). The ground stays cut to the road, as the wheels and the body need it; each tunnel is
 * built over its cutting:
 * - **walls** up both sides from under the road to the ceiling, their inner faces against the barriers' outer faces;
 * - a **ceiling** `road.tunnels.clearance` above the road from wall to wall, tilted with it;
 * - a **lid** giving the hill back its shape over the cutting: at each sample, points across the road from where the
 *   cutting meets the hill on one side to where it meets it on the other, each at the hill's height, but never under
 *   `cover` above the ceiling over the tunnel; beside it, where the hill is lower than that, the lid falls `lidSlope`
 *   metres a metre until it meets the hill, as a mound. Near each end it stands no higher than `portalHeight` over
 *   that least height at the portal, climbing back to the hill at `lidSlope`, so beside a portal the cutting's own
 *   banks show, as at a tunnel's mouth. It stops short of other road, within the fit's reach, and inside a corner at
 *   `CURVE_SHARE` of its radius; where it ends above the ground, a face runs down from its edge;
 * - a **portal** at each end: a face square to the road from the ground (or, over the opening between the walls, the
 *   ceiling) up to the lid.
 */
export function buildTunnels(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  spans: readonly TunnelSpan[],
  at: TunnelGround,
  cfg: Pick<GenConfig, 'road'>,
): TunnelShape {
  const road = cfg.road;
  const rules = road.tunnels;
  const n = line.count;
  const left = new Float64Array(n);
  const right = new Float64Array(n);
  const flat = new MeshBuilder();
  const lidPositions: number[] = [];
  const lidIndices: number[] = [];
  const window = Math.ceil(OWN_ROAD / line.spacing);

  const owns = (i: number, x: number, z: number): boolean => {
    const d = Math.abs(at.nearest(x, z) - i) % n;
    return Math.min(d, n - d) <= window;
  };
  // Right of the direction of travel is (-tz, tx) on the map.
  const point = (i: number, lateral: number, y: number): Point => ({ x: line.x[i]! - line.tz[i]! * lateral, y, z: line.z[i]! + line.tx[i]! * lateral });
  const rightOf = (i: number): Vec => ({ x: -line.tz[i]!, y: 0, z: line.tx[i]! });
  const surface = (i: number, lateral: number): number => height[i]! + (cross ? cross[i]! * lateral : 0);
  const ceiling = (i: number, lateral: number): number => surface(i, lateral) + rules.clearance;
  /** The least height of the lid: `cover` over the ceiling above the tunnel, falling away beside it. */
  const leastTop = (i: number, lateral: number): number => {
    const { outer } = tunnelWallOffsets(width, i, road);
    const edge = Math.max(-outer, Math.min(outer, lateral));
    return ceiling(i, edge) + rules.cover - rules.lidSlope * Math.max(0, Math.abs(lateral) - outer);
  };
  /** The lid's height at a point `inside` metres in from the nearer portal. */
  const top = (i: number, lateral: number, inside: number): number => {
    const p = point(i, lateral, 0);
    const portal = ceiling(i, 0) + rules.cover + rules.portalHeight + rules.lidSlope * inside;
    return Math.max(Math.min(at.natural(p.x, p.z), portal), leastTop(i, lateral));
  };

  for (const span of spans) {
    const samples = Array.from({ length: span.sampleCount }, (_, k) => (span.startIndex + k) % n);
    const inside = (k: number): number => Math.min(k, span.sampleCount - 1 - k) * line.spacing;

    // How far the lid reaches each side, and whether it meets the ground there.
    const meets = new Map<number, [boolean, boolean]>();
    for (const [k, i] of samples.entries()) {
      const { outer } = tunnelWallOffsets(width, i, road);
      const met: [boolean, boolean] = [false, false];
      for (const side of [-1, 1] as const) {
        let limit = width[i]! / 2 + road.verge + road.blendMax + REACH_SPARE;
        const bend = line.curvature[i]! * side;
        if (bend > 0) limit = Math.min(limit, CURVE_SHARE / bend);
        let reach = outer;
        for (let d = outer; d <= limit + 1e-9; d += PROBE) {
          const p = point(i, side * d, 0);
          if (!owns(i, p.x, p.z)) break;
          reach = d;
          if (top(i, side * d, inside(k)) - at.ground(p.x, p.z) <= MEET) {
            met[side < 0 ? 0 : 1] = true;
            break;
          }
        }
        (side < 0 ? left : right)[i] = reach;
      }
      meets.set(i, met);
    }

    // The same columns across every sample of the tunnel, so its rows join point to point.
    let widest = 0;
    let outside = 1;
    for (const i of samples) {
      const { inner, outer } = tunnelWallOffsets(width, i, road);
      widest = Math.max(widest, inner);
      outside = Math.max(outside, Math.ceil((left[i]! - outer) / rules.lidStep), Math.ceil((right[i]! - outer) / rules.lidStep));
    }
    const acrossRoad = Math.max(1, Math.ceil((2 * widest) / rules.lidStep));
    /** The columns at a sample, left to right, each its distance right of the centre line and whether it is a lid's outer edge. */
    const columns = (i: number): { lateral: number; edge: -1 | 0 | 1 }[] => {
      const { inner, outer } = tunnelWallOffsets(width, i, road);
      const list: { lateral: number; edge: -1 | 0 | 1 }[] = [];
      for (let k = outside; k >= 1; k--) list.push({ lateral: -(outer + ((left[i]! - outer) * k) / outside), edge: k === outside ? -1 : 0 });
      list.push({ lateral: -outer, edge: 0 });
      for (let k = 0; k <= acrossRoad; k++) list.push({ lateral: -inner + (2 * inner * k) / acrossRoad, edge: 0 });
      list.push({ lateral: outer, edge: 0 });
      for (let k = 1; k <= outside; k++) list.push({ lateral: outer + ((right[i]! - outer) * k) / outside, edge: k === outside ? 1 : 0 });
      return list;
    };

    // The lid's points, row by row.
    const rows: Point[][] = samples.map((i, k) => {
      const met = meets.get(i)!;
      return columns(i).map(({ lateral, edge }) => {
        const p = point(i, lateral, 0);
        const onGround = (edge < 0 && met[0]) || (edge > 0 && met[1]);
        return { ...p, y: onGround ? at.ground(p.x, p.z) - TUCK : top(i, lateral, inside(k)) };
      });
    });
    const across = rows[0]!.length;
    const first = lidPositions.length / 3;
    for (const row of rows) for (const p of row) lidPositions.push(p.x, p.y, p.z);
    for (let r = 0; r + 1 < rows.length; r++) {
      for (let c = 0; c + 1 < across; c++) {
        const a = first + r * across + c;
        // b to the right of a and the next row ahead: the triangles face up.
        lidIndices.push(a, a + 1, a + across, a + across, a + 1, a + across + 1);
      }
    }

    // A face down from the lid's edge wherever it ends above the ground.
    for (let r = 0; r + 1 < rows.length; r++) {
      const [i, j] = [samples[r]!, samples[r + 1]!];
      for (const side of [-1, 1] as const) {
        const slot = side < 0 ? 0 : 1;
        if (meets.get(i)![slot] && meets.get(j)![slot]) continue;
        const column = side < 0 ? 0 : across - 1;
        const [upper, upperNext] = [rows[r]![column]!, rows[r + 1]![column]!];
        const lower = { ...upper, y: at.ground(upper.x, upper.z) - FOOT };
        const lowerNext = { ...upperNext, y: at.ground(upperNext.x, upperNext.z) - FOOT };
        const outward = { x: rightOf(i).x * side, y: 0, z: rightOf(i).z * side };
        const corners = dot(normalOf(lower, upper, lowerNext), outward) < 0 ? [lower, lowerNext, upper, upperNext] : [lower, upper, lowerNext, upperNext];
        const base = lidPositions.length / 3;
        for (const p of corners) lidPositions.push(p.x, p.y, p.z);
        lidIndices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
      }
    }

    // The walls and the ceiling, piece by piece.
    for (let r = 0; r + 1 < samples.length; r++) {
      const [i, j] = [samples[r]!, samples[r + 1]!];
      const [wi, wj] = [tunnelWallOffsets(width, i, road).inner, tunnelWallOffsets(width, j, road).inner];
      for (const side of [-1, 1] as const) {
        const [li, lj] = [side * wi, side * wj];
        const inward = { x: -rightOf(i).x * side, y: 0, z: -rightOf(i).z * side };
        face(
          flat,
          point(i, li, surface(i, li) - FOOT),
          point(i, li, ceiling(i, li)),
          point(j, lj, surface(j, lj) - FOOT),
          point(j, lj, ceiling(j, lj)),
          inward,
          ROAD_MATERIAL.tunnelWall,
        );
      }
      face(flat, point(i, -wi, ceiling(i, -wi)), point(i, wi, ceiling(i, wi)), point(j, -wj, ceiling(j, -wj)), point(j, wj, ceiling(j, wj)), { x: 0, y: -1, z: 0 }, ROAD_MATERIAL.tunnelCeiling);
    }

    // The portals: square to the road at each end, facing out, with the opening left clear.
    for (const [r, outward] of [
      [0, -1],
      [samples.length - 1, 1],
    ] as const) {
      const i = samples[r]!;
      const { inner } = tunnelWallOffsets(width, i, road);
      const cols = columns(i);
      const toward = { x: line.tx[i]! * outward, y: 0, z: line.tz[i]! * outward };
      const bottom = (lateral: number, opening: boolean): number => {
        if (opening) return ceiling(i, lateral);
        const p = point(i, lateral, 0);
        return at.ground(p.x, p.z) - FOOT;
      };
      for (let c = 0; c + 1 < cols.length; c++) {
        const [l0, l1] = [cols[c]!.lateral, cols[c + 1]!.lateral];
        const opening = Math.abs(l0) <= inner + 1e-9 && Math.abs(l1) <= inner + 1e-9;
        const [top0, top1] = [rows[r]![c]!.y, rows[r]![c + 1]!.y];
        const [low0, low1] = [bottom(l0, opening), bottom(l1, opening)];
        if (top0 - low0 < 1e-3 && top1 - low1 < 1e-3) continue;
        face(flat, point(i, l0, low0), point(i, l0, top0), point(i, l1, low1), point(i, l1, top1), toward, ROAD_MATERIAL.portal);
      }
    }
  }

  return {
    mesh: flat.build(),
    lid: { positions: Float32Array.from(lidPositions), indices: Uint32Array.from(lidIndices) },
    left,
    right,
  };
}

/**
 * Whether a point lies under a tunnel's lid (M6.2b): measured from the tunnel's sample nearest it, it is no further out
 * each side than the lid reaches there (with `margin` metres more), and not past either portal. The lid stops short
 * of other road, so no point nearer another stretch of the lap is under it.
 */
export function underLid(reach: Pick<TunnelShape, 'left' | 'right'>, line: CenterLine, spans: readonly TunnelSpan[], x: number, z: number, margin = 0): boolean {
  const n = line.count;
  for (const span of spans) {
    let j = -1;
    let k = 0;
    let best = Infinity;
    for (let s = 0; s < span.sampleCount; s++) {
      const i = (span.startIndex + s) % n;
      const d = (line.x[i]! - x) ** 2 + (line.z[i]! - z) ** 2;
      if (d < best) [j, k, best] = [i, s, d];
    }
    const furthest = Math.max(reach.left[j]!, reach.right[j]!) + margin;
    if (best > (furthest + line.spacing) ** 2) continue;
    const dx = x - line.x[j]!;
    const dz = z - line.z[j]!;
    const along = dx * line.tx[j]! + dz * line.tz[j]!;
    const lateral = -dx * line.tz[j]! + dz * line.tx[j]!;
    if (k === 0 && along < 0) continue;
    if (k === span.sampleCount - 1 && along > 0) continue;
    if (lateral >= -reach.left[j]! - margin && lateral <= reach.right[j]! + margin) return true;
  }
  return false;
}
