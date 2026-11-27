import { describe, expect, it } from 'vitest';
import { config, type GenConfig } from '../../config';
import { stadiumLine } from '../../testing/trackFixtures';
import type { CenterLine, MeshData, TunnelSpan } from '../types';
import { ROAD_MATERIAL } from './ribbon';
import { buildTunnels, tunnelRooms, tunnelWallOffsets, underLid, type TunnelGround } from './tunnels';

// Fixed rules, so these tests do not move when the config is tuned.
const cfg: Pick<GenConfig, 'road'> = {
  road: {
    ...config.road,
    barrierOffset: 1.8,
    barrierWidth: 0.3,
    verge: 4,
    blendMax: 25,
    blendCutMax: 45,
    tunnels: { ...config.road.tunnels, clearance: 6.5, cover: 1.5, wall: 0.6, lidStep: 3, lidSlope: 1 },
  },
};
const ROAD = 10;
const CEILING = ROAD + 6.5;
const LID_LEAST = CEILING + 1.5;

// Two 600 m straights 200 m apart: the first runs along z = -100 towards +x, the road's right towards +z.
const line: CenterLine = stadiumLine(600, 100);
const n = line.count;
const height = new Float64Array(n).fill(ROAD);
const width = new Float64Array(n).fill(20);
// From x = -90 to x = 90 along the first straight.
const SPAN: TunnelSpan = { startIndex: 105, sampleCount: 91 };

/** The lap's nearest sample to a point, the slow way. */
function nearest(x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const d = (line.x[i]! - x) ** 2 + (line.z[i]! - z) ** 2;
    if (d < bestD) [best, bestD] = [i, d];
  }
  return best;
}

/** A ridge across the first straight, 24 m over the road at x = 0, falling 0.2 m a metre each way; level beyond. */
const ridge = (x: number): number => ROAD + Math.max(0, 24 - 0.2 * Math.abs(x));
/** The road cut through `hill`: the ground at the road under 14 m either side of its middle, then a bank of 100% up to the hill. */
function cutInto(hill: (x: number, z: number) => number): (x: number, z: number) => number {
  return (x, z) => Math.min(hill(x, z), ROAD - 0.25 + Math.max(0, Math.abs(z + 100) - 14));
}

/** The point `lateral` metres right of the centre line at sample i. */
const at = (i: number, lateral: number): { x: number; z: number } => ({ x: line.x[i]! - line.tz[i]! * lateral, z: line.z[i]! + line.tx[i]! * lateral });

/** Every triangle of a mesh with the given material, as its three corners and its normal. */
function triangles(mesh: { positions: Float32Array; indices: Uint32Array; materials?: Uint8Array }, material?: number) {
  const out: { corners: [number, number, number][]; normal: [number, number, number] }[] = [];
  const { positions: p, indices } = mesh;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    if (material !== undefined && mesh.materials![a] !== material) continue;
    const corner = (v: number): [number, number, number] => [p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!];
    const [A, B, C] = [corner(a), corner(b), corner(c)];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const normal: [number, number, number] = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    const length = Math.hypot(...normal) || 1;
    out.push({ corners: [A, B, C], normal: [normal[0] / length, normal[1] / length, normal[2] / length] });
  }
  return out;
}

const ridgeGround: TunnelGround = { natural: (x) => ridge(x), ground: cutInto((x) => ridge(x)), nearest };
const shape = buildTunnels(line, height, null, width, [SPAN], ridgeGround, cfg);
const { inner, outer } = tunnelWallOffsets(width, SPAN.startIndex, cfg.road);

describe('a tunnel’s walls and ceiling (M6.2b)', () => {
  it('stands its walls against the barriers’ outer faces, 0.6 m thick', () => {
    expect(inner).toBeCloseTo(10 + 1.8 + 0.3, 9);
    expect(outer).toBeCloseTo(inner + 0.6, 9);
  });

  it('runs a wall up each side of the road, from under it to 6.5 m above it, facing the road, all along the tunnel', () => {
    const walls = triangles(shape.mesh as MeshData, ROAD_MATERIAL.tunnelWall);
    // Two triangles a piece a side.
    expect(walls).toHaveLength((SPAN.sampleCount - 1) * 2 * 2);
    for (const { corners, normal } of walls) {
      const side = Math.sign(corners[0][2] + 100);
      for (const [x, y, z] of corners) {
        expect(Math.abs(z + 100)).toBeCloseTo(inner, 4);
        expect(x).toBeGreaterThanOrEqual(line.x[SPAN.startIndex]! - 1e-3);
        expect(x).toBeLessThanOrEqual(line.x[SPAN.startIndex + SPAN.sampleCount - 1]! + 1e-3);
        expect(y).toBeGreaterThan(ROAD - 1);
        expect(y).toBeLessThanOrEqual(CEILING + 1e-4);
      }
      // A wall on the right (+z) faces back towards the road (-z).
      expect(normal[2] * side).toBeLessThan(-0.99);
    }
  });

  it('closes the tunnel with a ceiling 6.5 m above the road from wall to wall, facing down', () => {
    const ceiling = triangles(shape.mesh as MeshData, ROAD_MATERIAL.tunnelCeiling);
    expect(ceiling).toHaveLength((SPAN.sampleCount - 1) * 2);
    for (const { corners, normal } of ceiling) {
      for (const [, y, z] of corners) {
        expect(y).toBeCloseTo(CEILING, 4);
        expect(Math.abs(z + 100)).toBeLessThanOrEqual(inner + 1e-4);
      }
      expect(normal[1]).toBeLessThan(-0.99);
    }
  });

  it('tilts the walls’ tops and the ceiling with a banked road', () => {
    const cross = new Float64Array(n).fill(0.05);
    const banked = buildTunnels(line, height, cross, width, [SPAN], ridgeGround, cfg);
    for (const { corners } of triangles(banked.mesh as MeshData, ROAD_MATERIAL.tunnelCeiling)) {
      for (const [, y, z] of corners) expect(y).toBeCloseTo(CEILING + 0.05 * (z + 100), 4);
    }
  });
});

describe('a tunnel’s lid (M6.2b)', () => {
  const lid = triangles(shape.lid);

  it('gives the hill back its shape over the cutting, facing up, never below it', () => {
    expect(lid.length).toBeGreaterThan(0);
    for (const { corners, normal } of lid) {
      expect(normal[1]).toBeGreaterThan(0);
      for (const [x, y] of corners) expect(y).toBeGreaterThanOrEqual(ridge(x) - 0.1);
    }
    // In the middle, where the hill stands well over the ceiling, the lid lies on the hill.
    const middle = 150;
    for (const lateral of [-20, -5, 0, 5, 20]) {
      const p = at(middle, lateral);
      expect(lidHeightAt(shape.lid, p.x, p.z)).toBeCloseTo(ridge(p.x), 1);
    }
  });

  it('stands at least 1.5 m over the ceiling above the tunnel, where the hill is low near the portals', () => {
    // At x = -85 the ridge is 7 m over the road, under the ceiling.
    for (const lateral of [-outer, -5, 0, 5, outer]) {
      const p = at(SPAN.startIndex + 2, lateral);
      expect(lidHeightAt(shape.lid, p.x, p.z)).toBeGreaterThanOrEqual(LID_LEAST - 1e-3);
    }
  });

  it('reaches each way to where the cutting meets the hill, and its edge meets the ground there', () => {
    // In the middle the ridge is 24 m over the road: the 100% bank from 14 m out meets it about 38.25 m out.
    for (const reach of [shape.right[150]!, shape.left[150]!]) {
      expect(reach).toBeGreaterThan(37.5);
      expect(reach).toBeLessThan(39);
    }
    // Off the tunnel, nothing.
    expect(shape.right[50]).toBe(0);
    // Each edge vertex lies on the ground.
    for (const i of [110, 150, 190]) {
      for (const side of [-1, 1]) {
        const reach = side > 0 ? shape.right[i]! : shape.left[i]!;
        const p = at(i, side * reach);
        expect(ridgeGround.ground(p.x, p.z) - lidHeightAt(shape.lid, p.x, p.z, 0.3)).toBeLessThan(0.15);
      }
    }
  });

  it('on a mountainside, falls from over the tunnel down to the lower ground as a mound, meeting it', () => {
    // The hill stands 8 m over the road's middle and falls 0.6 m a metre to the left: over the tunnel's left wall it
    // is 7.6 m under the lid's least height, so the lid falls from there at 100% until it meets the hill, about 32 m out.
    const side = (_x: number, z: number): number => ROAD + 8 + 0.6 * (z + 100);
    const slope: TunnelGround = { natural: side, ground: cutInto(side), nearest };
    const mound = buildTunnels(line, height, null, width, [SPAN], slope, cfg);
    const i = 150;
    const left = mound.left[i]!;
    expect(left).toBeGreaterThan(30);
    expect(left).toBeLessThan(33);
    const edge = at(i, -left);
    expect(slope.ground(edge.x, edge.z) - lidHeightAt(mound.lid, edge.x, edge.z, 0.3)).toBeLessThan(0.15);
    const top = at(i, -outer);
    expect(lidHeightAt(mound.lid, top.x, top.z)).toBeGreaterThanOrEqual(LID_LEAST - 1e-3);
    for (const { corners } of triangles(mound.lid)) for (const [x, y, z] of corners) expect(y).toBeGreaterThanOrEqual(slope.ground(x, z) - 0.6);
  });

  it('stops short of another stretch of road, with a face down to the ground there', () => {
    // A hill so wide its cutting never meets it within the fit's reach, and the other straight said to be 30 m off.
    const near = (x: number, z: number): number => (z + 100 > 30 ? n - 1 - nearest(x, -100) : nearest(x, z));
    const wide: TunnelGround = { natural: () => ROAD + 30, ground: cutInto(() => ROAD + 30), nearest: near };
    const stopped = buildTunnels(line, height, null, width, [SPAN], wide, cfg);
    expect(stopped.right[150]).toBeLessThanOrEqual(30);
    expect(stopped.right[150]).toBeGreaterThan(25);
    // The face under the lid's right edge reaches the ground.
    const edge = at(150, stopped.right[150]!);
    const lowest = Math.min(...triangles(stopped.lid).flatMap((t) => t.corners).filter(([x, , z]) => Math.hypot(x - edge.x, z - edge.z) < 1.5).map(([, y]) => y));
    expect(lowest).toBeLessThanOrEqual(wide.ground(edge.x, edge.z) + 0.01);
  });

  it('keeps the lid inside a tight corner on the corner’s own side', () => {
    // A 30 m corner: nothing may reach past its centre.
    const small = stadiumLine(400, 30);
    const k = small.count;
    // In the arc's middle, where the line's own curvature (smoothed where the straight meets the arc) is the arc's.
    const span: TunnelSpan = { startIndex: Math.round(400 / small.spacing) + 8, sampleCount: 30 };
    // Cut flat to the road everywhere, so the cutting never meets the hill and the lid runs out to its furthest.
    const flat: TunnelGround = { natural: () => ROAD + 40, ground: () => ROAD, nearest: () => span.startIndex };
    const curved = buildTunnels(small, new Float64Array(k).fill(ROAD), null, new Float64Array(k).fill(20), [span], flat, cfg);
    for (let s = 0; s < span.sampleCount; s++) expect(curved.right[span.startIndex + s]!).toBeLessThanOrEqual(0.8 * 30 + 1e-6);
  });
});

describe('a tunnel’s portals (M6.2b)', () => {
  const portal = triangles(shape.mesh as MeshData, ROAD_MATERIAL.portal);
  const first = { x: line.x[SPAN.startIndex]!, facing: -1 };
  const last = { x: line.x[SPAN.startIndex + SPAN.sampleCount - 1]!, facing: 1 };

  it('stands a face square to the road at each end, facing out of the tunnel', () => {
    expect(portal.length).toBeGreaterThan(0);
    for (const { corners, normal } of portal) {
      const end = Math.abs(corners[0][0] - first.x) < Math.abs(corners[0][0] - last.x) ? first : last;
      for (const [x] of corners) expect(x).toBeCloseTo(end.x, 4);
      expect(normal[0] * end.facing).toBeGreaterThan(0.99);
    }
  });

  it('leaves the opening clear, from the road to the ceiling between the walls, and covers the rest from the ground to the lid', () => {
    for (const { corners } of portal) {
      const cx = (corners[0][1] + corners[1][1] + corners[2][1]) / 3;
      const cz = (corners[0][2] + corners[1][2] + corners[2][2]) / 3 + 100;
      expect(Math.abs(cz) < inner - 1e-3 && cx < CEILING - 1e-3).toBe(false);
    }
    // Over the opening, the face reaches from the ceiling to the lid; beside it, from the ground.
    const lowest = (from: number, to: number): number =>
      Math.min(...portal.flatMap((t) => t.corners).filter(([x, , z]) => Math.abs(x - first.x) < 1e-3 && z + 100 > from && z + 100 < to).map(([, y]) => y));
    expect(lowest(-inner + 0.5, inner - 0.5)).toBeCloseTo(CEILING, 3);
    expect(lowest(inner + 1, 30)).toBeLessThan(ROAD + 0.1);
  });
});

describe('a portal in a steep hillside (M6.2b)', () => {
  // A hill 30 m over the road all along: without a limit the portal's face would run 22 m up the cutting's banks.
  const high: TunnelGround = { natural: () => ROAD + 30, ground: cutInto(() => ROAD + 30), nearest };
  const steep = buildTunnels(line, height, null, width, [SPAN], high, cfg);

  it('rises no more than 3 m over the lid’s least height, and the lid climbs back from it to the hill at 100%', () => {
    const faces = triangles(steep.mesh as MeshData, ROAD_MATERIAL.portal);
    expect(faces.length).toBeGreaterThan(0);
    for (const { corners } of faces) for (const [, y] of corners) expect(y).toBeLessThanOrEqual(LID_LEAST + 3 + 1e-3);
    // 10 m in from the first portal the lid stands 10 m higher over the road; 20 m in, the hill (30 m over the road) is back.
    const ten = at(SPAN.startIndex + 5, 0);
    expect(lidHeightAt(steep.lid, ten.x, ten.z)).toBeCloseTo(LID_LEAST + 3 + 10 * (line.spacing / 2), 1);
    const forty = at(SPAN.startIndex + 20, 0);
    expect(lidHeightAt(steep.lid, forty.x, forty.z)).toBeCloseTo(ROAD + 30, 1);
  });

  it('leaves the lid under the cutting’s banks beside the portal, where they stand higher than it', () => {
    // At the portal the 21 m lid meets the 100% bank about 25 m out; 60 m in, back on the hill, it reaches its furthest, 43 m.
    const first = SPAN.startIndex;
    expect(steep.right[first]!).toBeLessThan(steep.right[first + 30]!);
  });
});

describe('what lies under a tunnel’s lid (M6.2b)', () => {
  it('is everything inside its reach between the portals, and nothing beyond them or past its edges', () => {
    const inside = at(150, 20);
    expect(underLid(shape, line, [SPAN], inside.x, inside.z)).toBe(true);
    const past = at(150, 40);
    expect(underLid(shape, line, [SPAN], past.x, past.z)).toBe(false);
    // Just before the first portal, in the open cutting, and just past the last: nearest the portals' own samples.
    const before = { x: line.x[SPAN.startIndex]! - 0.9, z: -100 };
    expect(underLid(shape, line, [SPAN], before.x, before.z)).toBe(false);
    const after = { x: line.x[SPAN.startIndex + SPAN.sampleCount - 1]! + 0.9, z: -95 };
    expect(underLid(shape, line, [SPAN], after.x, after.z)).toBe(false);
    const away = at(400, 0);
    expect(underLid(shape, line, [SPAN], away.x, away.z)).toBe(false);
  });
});

describe('a tunnel’s room, for the cameras and the light inside (M6.2c)', () => {
  const rooms = tunnelRooms(line, height, null, width, [SPAN], shape, cfg, 8);

  it('gives a point under the lid its place across the road, the walls’ inner faces, the ceiling over it and how far in it is', () => {
    const p = at(150, 5);
    const room = rooms(p.x, p.z)!;
    expect(room.under).toBe(true);
    expect(room.lateral).toBeCloseTo(5, 6);
    expect(room.inner).toBeCloseTo(inner, 9);
    expect(room.ceiling).toBeCloseTo(CEILING, 6);
    // Sample 150 is 45 samples of about 2 m from the first portal and 45 from the last.
    expect(room.depth).toBeCloseTo(45 * line.spacing, 6);
    expect(room.reach).toBeCloseTo(shape.right[150]!, 9);
    const left = at(150, -5);
    expect(rooms(left.x, left.z)!.reach).toBeCloseTo(shape.left[150]!, 9);
    // Half way between two samples, 10 m in from the first portal.
    const near = rooms(line.x[SPAN.startIndex + 5]! + 1, -100)!;
    expect(near.depth).toBeCloseTo(5 * line.spacing + 1, 6);
  });

  it('gives a point beyond the walls under the lid its place too, with the ceiling as it is at the wall', () => {
    const p = at(150, 16);
    const room = rooms(p.x, p.z)!;
    expect(room.under).toBe(true);
    expect(room.lateral).toBeCloseTo(16, 6);
    expect(Math.abs(room.lateral)).toBeGreaterThan(room.inner);
    expect(room.ceiling).toBeCloseTo(CEILING, 6);
  });

  it('tilts the ceiling with a banked road, and takes it between samples where the road climbs', () => {
    const cross = new Float64Array(n).fill(0.05);
    const banked = tunnelRooms(line, height, cross, width, [SPAN], shape, cfg)(at(150, 5).x, at(150, 5).z)!;
    expect(banked.ceiling).toBeCloseTo(CEILING + 0.05 * 5, 6);
    const beyond = tunnelRooms(line, height, cross, width, [SPAN], shape, cfg)(at(150, -16).x, at(150, -16).z)!;
    expect(beyond.ceiling).toBeCloseTo(CEILING - 0.05 * inner, 6);
    // Climbing 0.1 m a metre through the tunnel.
    const climbing = Float64Array.from(height, (h, i) => h + 0.1 * line.x[i]!);
    const between = tunnelRooms(line, climbing, null, width, [SPAN], shape, cfg)(line.x[150]! + 1, -100)!;
    expect(between.ceiling).toBeCloseTo(CEILING + 0.1 * (line.x[150]! + 1), 6);
  });

  it('marks a point in front of a portal, within the apron, as not under the lid, with how far out it is', () => {
    const before = rooms(line.x[SPAN.startIndex]! - 5, -100 + 3)!;
    expect(before.under).toBe(false);
    expect(before.depth).toBeCloseTo(-5, 6);
    expect(before.lateral).toBeCloseTo(3, 6);
    const after = rooms(line.x[SPAN.startIndex + SPAN.sampleCount - 1]! + 6, -100 - 13)!;
    expect(after.under).toBe(false);
    expect(after.depth).toBeCloseTo(-6, 6);
    expect(after.lateral).toBeCloseTo(-13, 6);
    // Further out than the apron, and with no apron at all.
    expect(rooms(line.x[SPAN.startIndex]! - 9, -100)).toBeNull();
    expect(tunnelRooms(line, height, null, width, [SPAN], shape, cfg)(line.x[SPAN.startIndex]! - 5, -100)).toBeNull();
  });

  it('has no room past the lid’s edges, on other road, or with no tunnel', () => {
    const past = at(150, 40);
    expect(rooms(past.x, past.z)).toBeNull();
    const away = at(400, 0);
    expect(rooms(away.x, away.z)).toBeNull();
    const none = tunnelRooms(line, height, null, width, [], shape, cfg, 8);
    expect(none(at(150, 0).x, at(150, 0).z)).toBeNull();
  });
});

/**
 * The lid's height at a point, read off its triangles; the lowest within `slack` metres sideways when the point is on
 * its edge. NaN when no triangle is over it.
 */
function lidHeightAt(lid: { positions: Float32Array; indices: Uint32Array }, x: number, z: number, slack = 0): number {
  let found = NaN;
  for (const { corners } of triangles(lid)) {
    const [A, B, C] = corners;
    const det = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
    if (Math.abs(det) < 1e-9) continue;
    const u = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / det;
    const v = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / det;
    const w = 1 - u - v;
    const tolerance = slack > 0 ? slack / 10 : 1e-6;
    if (u < -tolerance || v < -tolerance || w < -tolerance) continue;
    const y = u * A[1] + v * B[1] + w * C[1];
    if (Number.isNaN(found) || y < found) found = y;
  }
  return found;
}
