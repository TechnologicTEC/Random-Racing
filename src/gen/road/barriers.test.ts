import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { roundedSquareLine, swellingWidth, uniformWidth } from '../../testing/trackFixtures';
import { analyseSections } from '../track/analysis';
import type { CenterLine, MeshData, WallSpan } from '../types';
import { BARRIER_FOOTING, buildBarriers, wallPieces } from './barriers';
import { DECK, ROAD_MATERIAL } from './ribbon';
import { buildStartGate, gateBoxes } from './startGate';

const road = config.road;
const HALF = config.track.roadWidth / 2;
const INNER = HALF + road.barrierOffset;
const OUTER = INNER + road.barrierWidth;

/** A 300 m square with 40 m corners, driven clockwise: the outside of every corner is on the left. */
const line = roundedSquareLine(300, 40);
const sections = analyseSections(line, config.track);
const height = Float64Array.from({ length: line.count }, (_, i) => 10 + Math.sin((i / line.count) * 2 * Math.PI));
const cross = new Float64Array(line.count).fill(-0.05);

/** A wall round the whole lap on both sides, as every lap had before the walls could open. */
const wholeLap = (centre: CenterLine): WallSpan[] => [
  { startIndex: 0, pieceCount: centre.count, side: 1 },
  { startIndex: 0, pieceCount: centre.count, side: -1 },
];

function locate(centre: CenterLine, x: number, z: number): { sample: number; lateral: number; along: number } {
  let sample = 0;
  let best = Infinity;
  for (let i = 0; i < centre.count; i++) {
    const d = (centre.x[i]! - x) ** 2 + (centre.z[i]! - z) ** 2;
    if (d < best) {
      best = d;
      sample = i;
    }
  }
  const dx = x - centre.x[sample]!;
  const dz = z - centre.z[sample]!;
  // Right of the direction of travel is (-tz, tx) on the map.
  return { sample, lateral: dx * -centre.tz[sample]! + dz * centre.tx[sample]!, along: dx * centre.tx[sample]! + dz * centre.tz[sample]! };
}

/** Each triangle with its corners, its middle and the direction it faces. */
function triangles(mesh: MeshData) {
  const p = mesh.positions;
  const out = [];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t]! * 3, mesh.indices[t + 1]! * 3, mesh.indices[t + 2]! * 3];
    const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
    const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    out.push({
      x: (p[a]! + p[b]! + p[c]!) / 3,
      y: (p[a + 1]! + p[b + 1]! + p[c + 1]!) / 3,
      z: (p[a + 2]! + p[b + 2]! + p[c + 2]!) / 3,
      nx: nx / length, ny: ny / length, nz: nz / length,
      material: mesh.materials[mesh.indices[t]!]!,
    });
  }
  return out;
}

describe('buildBarriers with a wall round the whole lap on both sides', () => {
  const mesh = buildBarriers(line, height, cross, uniformWidth(line, config.track.roadWidth), sections, wholeLap(line), config);
  const count = mesh.positions.length / 3;

  it('runs a wall along both edges of the whole lap', () => {
    // An inner face, a top and an outer face, two triangles each, on both sides of every piece of the lap.
    expect(mesh.indices.length / 3).toBe(line.count * 2 * 3 * 2);
    const sides = new Set<number>();
    for (let v = 0; v < count; v++) sides.add(Math.sign(locate(line, mesh.positions[v * 3]!, mesh.positions[v * 3 + 2]!).lateral));
    expect([...sides].sort()).toEqual([-1, 1]);
  });

  it('stands on the verge, just clear of the road and of any kerb', () => {
    expect(road.barrierOffset).toBeGreaterThanOrEqual(road.kerbWidth + 0.5);
    expect(road.barrierOffset + road.barrierWidth).toBeLessThanOrEqual(road.verge);
    for (let v = 0; v < count; v++) {
      const { lateral } = locate(line, mesh.positions[v * 3]!, mesh.positions[v * 3 + 2]!);
      expect(Math.abs(lateral)).toBeGreaterThan(INNER - 0.05);
      expect(Math.abs(lateral)).toBeLessThan(OUTER + 0.05);
    }
  });

  it('rises to its full height above the tilted verge and reaches down below the sunken ground', () => {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let v = 0; v < count; v++) {
      const x = mesh.positions[v * 3]!, y = mesh.positions[v * 3 + 1]!, z = mesh.positions[v * 3 + 2]!;
      const { sample, lateral } = locate(line, x, z);
      const above = y - (height[sample]! + lateral * cross[sample]!);
      highest = Math.max(highest, above);
      lowest = Math.min(lowest, above);
      expect(above).toBeLessThan(road.barrierHeight + 0.05);
    }
    expect(highest).toBeGreaterThan(road.barrierHeight - 0.05);
    // The ground on the verge is one sink below the road's plane; the wall's foot must be well under it.
    expect(lowest).toBeLessThan(-road.sink - 0.4);
    expect(lowest).toBeGreaterThan(-road.sink - 1);
  });

  it('faces its inner side towards the road, its outer side away, and its top up', () => {
    let inner = 0, outer = 0, top = 0;
    for (const face of triangles(mesh)) {
      const { sample, lateral } = locate(line, face.x, face.z);
      if (face.ny > 0.9) {
        top++;
        continue;
      }
      // Which way the face points across the road: positive is to the right of travel.
      const across = face.nx * -line.tz[sample]! + face.nz * line.tx[sample]!;
      const side = Math.sign(lateral);
      if (Math.abs(lateral) < (INNER + OUTER) / 2) {
        expect(across * side).toBeLessThan(-0.9);
        inner++;
      } else {
        expect(across * side).toBeGreaterThan(0.9);
        outer++;
      }
    }
    expect(inner).toBe(line.count * 4);
    expect(outer).toBe(line.count * 4);
    expect(top).toBe(line.count * 4);
  });

  it('is plain along the straights and on the inside of corners', () => {
    for (const face of triangles(mesh)) {
      const { sample, lateral } = locate(line, face.x, face.z);
      const section = sections.find((s) => (sample - s.startIndex + line.count) % line.count < s.sampleCount)!;
      // Clockwise lap: the inside of every corner is on the right.
      if (section.type === 'straight' || lateral > 0) expect(face.material).toBe(ROAD_MATERIAL.barrier);
    }
  });

  it('is red and white on the outside of corners, where a driver needs to see the edge', () => {
    const outsideOfCorners = new Set<number>();
    for (const face of triangles(mesh)) {
      const { sample, lateral } = locate(line, face.x, face.z);
      const section = sections.find((s) => (sample - s.startIndex + line.count) % line.count < s.sampleCount)!;
      const wellInside = (sample - section.startIndex + line.count) % line.count;
      if (section.type === 'corner' && lateral < 0 && wellInside > 3 && wellInside < section.sampleCount - 3) outsideOfCorners.add(face.material);
    }
    expect([...outsideOfCorners].sort()).toEqual([ROAD_MATERIAL.barrierRed, ROAD_MATERIAL.barrierWhite].sort());
  });
});

describe('buildBarriers with walls that open', () => {
  const n = line.count;
  // A 60 m wall on the left along the first straight, and a 50 m one on the right that runs past the end of the lap.
  const leftWall: WallSpan = { startIndex: 20, pieceCount: 30, side: -1 };
  const rightWall: WallSpan = { startIndex: n - 10, pieceCount: 25, side: 1 };
  const mesh = buildBarriers(line, height, cross, uniformWidth(line, config.track.roadWidth), sections, [rightWall, leftWall], config);
  const count = mesh.positions.length / 3;
  /** How many pieces along its wall a sample is, or -1 if it is not on it. */
  const along = (wall: WallSpan, sample: number): number => {
    const k = (sample - wall.startIndex + n) % n;
    return k <= wall.pieceCount ? k : -1;
  };
  /** Each vertex with the wall it belongs to, how far along it is, and its height above the road's tilted plane. */
  const vertices = Array.from({ length: count }, (_, v) => {
    const x = mesh.positions[v * 3]!, y = mesh.positions[v * 3 + 1]!, z = mesh.positions[v * 3 + 2]!;
    const { sample, lateral } = locate(line, x, z);
    const wall = lateral > 0 ? rightWall : leftWall;
    return { wall, k: along(wall, sample), above: y - (height[sample]! + lateral * cross[sample]!) };
  });
  const taper = Math.round(road.walls.taper / line.spacing);

  it('builds a wall only where there is one', () => {
    for (const vertex of vertices) expect(vertex.k).toBeGreaterThanOrEqual(0);
    // Two faces and a top for every piece, two triangles each, and a face closing each of the four ends.
    expect(mesh.indices.length / 3).toBe((leftWall.pieceCount + rightWall.pieceCount) * 6 + 4 * 2);
  });

  it('stands at its full height between its ends', () => {
    for (const wall of [leftWall, rightWall]) {
      const tops = vertices.filter((vertex) => vertex.wall === wall && vertex.above > -road.sink && vertex.k >= taper && vertex.k <= wall.pieceCount - taper);
      expect(tops.length).toBeGreaterThan(40);
      for (const top of tops) expect(top.above).toBeCloseTo(road.barrierHeight, 2);
    }
  });

  it('slopes down to the level of the road at each end, never stepping', () => {
    expect(taper).toBeGreaterThanOrEqual(2);
    for (const wall of [leftWall, rightWall]) {
      /** The height of the wall's top at each sample along it. */
      const topAt = Array.from({ length: wall.pieceCount + 1 }, (_, k) =>
        Math.max(...vertices.filter((vertex) => vertex.wall === wall && vertex.k === k).map((vertex) => vertex.above)),
      );
      expect(topAt[0]).toBeCloseTo(0, 2);
      expect(topAt[wall.pieceCount]).toBeCloseTo(0, 2);
      for (let k = 0; k < taper; k++) {
        expect(topAt[k + 1]!).toBeGreaterThan(topAt[k]!);
        expect(topAt[wall.pieceCount - k - 1]!).toBeGreaterThan(topAt[wall.pieceCount - k]!);
        // No step taller than half the wall from one sample to the next.
        expect(topAt[k + 1]! - topAt[k]!).toBeLessThan(road.barrierHeight / 2 + 0.01);
      }
    }
  });

  it('closes each end with a face that looks along the lap, away from the wall', () => {
    let backwards = 0;
    let forwards = 0;
    for (const face of triangles(mesh)) {
      const { sample, lateral } = locate(line, face.x, face.z);
      const ahead = face.nx * line.tx[sample]! + face.nz * line.tz[sample]!;
      if (Math.abs(ahead) < 0.9) continue;
      const wall = lateral > 0 ? rightWall : leftWall;
      const k = along(wall, sample);
      // A face at the wall's first sample looks back down the lap; one at its last looks on up it.
      if (ahead < 0) {
        expect(k).toBe(0);
        backwards++;
      } else {
        expect(k).toBe(wall.pieceCount);
        forwards++;
      }
    }
    expect(backwards).toBe(4);
    expect(forwards).toBe(4);
  });

  it('builds nothing for a lap with no walls', () => {
    const none = buildBarriers(line, height, cross, uniformWidth(line, config.track.roadWidth), sections, [], config);
    expect(none.indices).toHaveLength(0);
    expect(none.positions).toHaveLength(0);
  });
});

describe('buildStartGate', () => {
  const mesh = buildStartGate(line, height, cross, uniformWidth(line, config.track.roadWidth), config);
  const faces = triangles(mesh);
  const surfaceAt = (sample: number, lateral: number): number => height[sample]! + lateral * cross[sample]!;

  it('paints a chequered line across the road at the start', () => {
    const paint = faces.filter((face) => face.material === ROAD_MATERIAL.line || face.material === ROAD_MATERIAL.startDark);
    expect(paint.length).toBeGreaterThan(20);
    const used = new Set(paint.map((face) => face.material));
    expect(used.size).toBe(2);
    for (const face of paint) {
      const { sample, lateral, along } = locate(line, face.x, face.z);
      expect(Math.abs(lateral)).toBeLessThan(HALF);
      // Just ahead of sample 0, which is the start line.
      expect(sample === 0 || sample === 1 || sample === line.count - 1).toBe(true);
      expect(Math.abs(along)).toBeLessThan(2.5);
      // Lying on the road, a hair above it so it is not hidden.
      const lift = face.y - surfaceAt(sample, lateral);
      expect(lift).toBeGreaterThan(0);
      expect(lift).toBeLessThan(0.3);
      expect(face.ny).toBeGreaterThan(0.9);
    }
  });

  it('stands a gate over the start: a post outside each barrier and a beam between them', () => {
    const gate = faces.filter((face) => face.material === ROAD_MATERIAL.gate || face.material === ROAD_MATERIAL.gateBeam);
    // Three boxes, six faces each, two triangles a face.
    expect(gate.length).toBe(3 * 12);
    let left = false;
    let right = false;
    for (const face of gate) {
      const { lateral } = locate(line, face.x, face.z);
      if (face.material !== ROAD_MATERIAL.gate) continue;
      expect(Math.abs(lateral)).toBeGreaterThan(OUTER);
      if (lateral < 0) left = true;
      else right = true;
    }
    expect(left && right).toBe(true);
  });

  it('leaves the road clear under the beam', () => {
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      const material = mesh.materials[v]!;
      if (material !== ROAD_MATERIAL.gateBeam) continue;
      const { sample, lateral } = locate(line, mesh.positions[v * 3]!, mesh.positions[v * 3 + 2]!);
      const above = mesh.positions[v * 3 + 1]! - surfaceAt(sample, Math.max(-HALF, Math.min(HALF, lateral)));
      expect(above).toBeGreaterThanOrEqual(road.gateClearance - 0.4);
    }
  });

  it('faces every side of its boxes outwards', () => {
    // Each box is a closed shape, so its faces should point away from its middle: summed over a box they cancel out.
    const gate = faces.filter((face) => face.material === ROAD_MATERIAL.gate || face.material === ROAD_MATERIAL.gateBeam);
    let sumX = 0, sumY = 0, sumZ = 0;
    for (const face of gate) {
      sumX += face.nx;
      sumY += face.ny;
      sumZ += face.nz;
    }
    expect(Math.abs(sumX)).toBeLessThan(1e-3);
    expect(Math.abs(sumY)).toBeLessThan(1e-3);
    expect(Math.abs(sumZ)).toBeLessThan(1e-3);
    // And some point up, some down: both must be there for a closed box.
    expect(gate.some((face) => face.ny > 0.9)).toBe(true);
    expect(gate.some((face) => face.ny < -0.9)).toBe(true);
  });
});

describe('barriers and the start gate on a road whose width changes', () => {
  // 22 m at the start line, 12 m half way round.
  const width = swellingWidth(line, 22, 12);

  it('keeps both walls the same distance outside the true edge all the way round', () => {
    const mesh = buildBarriers(line, height, cross, width, sections, wholeLap(line), config);
    let furthest = 0;
    let nearest = Infinity;
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      const { sample, lateral } = locate(line, mesh.positions[v * 3]!, mesh.positions[v * 3 + 2]!);
      const beyond = Math.abs(lateral) - width[sample]! / 2;
      expect(beyond).toBeGreaterThan(road.barrierOffset - 0.05);
      expect(beyond).toBeLessThan(road.barrierOffset + road.barrierWidth + 0.05);
      furthest = Math.max(furthest, Math.abs(lateral));
      nearest = Math.min(nearest, Math.abs(lateral));
    }
    expect(furthest).toBeCloseTo(11 + road.barrierOffset + road.barrierWidth, 1);
    expect(nearest).toBeCloseTo(6 + road.barrierOffset, 1);
  });

  it('paints the chequered line right across the wider road, and stands the gate posts outside its barriers', () => {
    const faces = triangles(buildStartGate(line, height, cross, width, config));
    const paint = faces.filter((face) => face.material === ROAD_MATERIAL.line || face.material === ROAD_MATERIAL.startDark);
    const reach = Math.max(...paint.map((face) => Math.abs(locate(line, face.x, face.z).lateral)));
    expect(reach).toBeGreaterThan(11 - road.startSquare);
    expect(reach).toBeLessThan(11);
    for (const face of faces) {
      if (face.material !== ROAD_MATERIAL.gate) continue;
      expect(Math.abs(locate(line, face.x, face.z).lateral)).toBeGreaterThan(11 + road.barrierOffset + road.barrierWidth);
    }
  });
});

describe('wallPieces: the walls as numbers, for collisions', () => {
  const n = line.count;
  const width = uniformWidth(line, config.track.roadWidth);
  const leftWall: WallSpan = { startIndex: 20, pieceCount: 30, side: -1 };
  const rightWall: WallSpan = { startIndex: n - 10, pieceCount: 25, side: 1 };
  const pieces = wallPieces(line, height, cross, width, [rightWall, leftWall], config);
  const taper = Math.round(road.walls.taper / line.spacing);
  /** A point's height above the road's tilted plane, and how far it is from the centre line. */
  const place = (point: { x: number; y: number; z: number }): { sample: number; lateral: number; above: number } => {
    const { sample, lateral } = locate(line, point.x, point.z);
    return { sample, lateral, above: point.y - (height[sample]! + lateral * cross[sample]!) };
  };

  it('gives one piece for each piece of each wall, in the order the walls are given, each from one sample to the next', () => {
    expect(pieces).toHaveLength(rightWall.pieceCount + leftWall.pieceCount);
    pieces.forEach((piece, index) => {
      const wall = index < rightWall.pieceCount ? rightWall : leftWall;
      const k = index < rightWall.pieceCount ? index : index - rightWall.pieceCount;
      expect(piece.side).toBe(wall.side);
      expect(place(piece.from).sample).toBe((wall.startIndex + k) % n);
      expect(place(piece.to).sample).toBe((wall.startIndex + k + 1) % n);
    });
  });

  it('runs along the middle of the wall as it is drawn', () => {
    for (const piece of pieces) {
      for (const end of [piece.from, piece.to]) {
        expect(place(end).lateral * piece.side).toBeCloseTo(INNER + road.barrierWidth / 2, 3);
      }
    }
  });

  it('is at the full height of the wall between its ends, and slopes down to the road at each end', () => {
    const left = pieces.slice(rightWall.pieceCount);
    expect(place(left[0]!.from).above).toBeCloseTo(0, 3);
    expect(place(left[left.length - 1]!.to).above).toBeCloseTo(0, 3);
    for (let k = taper; k < left.length - taper; k++) {
      expect(place(left[k]!.from).above).toBeCloseTo(road.barrierHeight, 3);
      expect(place(left[k]!.to).above).toBeCloseTo(road.barrierHeight, 3);
    }
    for (let k = 0; k < taper; k++) expect(place(left[k]!.to).above).toBeGreaterThan(place(left[k]!.from).above);
    // Each piece starts where the last one ended.
    for (let k = 1; k < left.length; k++) expect(left[k]!.from).toEqual(left[k - 1]!.to);
  });

  it('has the same tops as the triangles that are drawn', () => {
    const mesh = buildBarriers(line, height, cross, width, sections, [rightWall, leftWall], config);
    const drawn = Array.from({ length: mesh.positions.length / 3 }, (_, v) => ({
      x: mesh.positions[v * 3]!,
      y: mesh.positions[v * 3 + 1]!,
      z: mesh.positions[v * 3 + 2]!,
    }));
    for (const piece of pieces) {
      // The drawn wall has a top corner half its width to each side of this point, at the same height on a level cross-section.
      const nearest = drawn
        .filter((vertex) => Math.abs(vertex.x - piece.from.x) + Math.abs(vertex.z - piece.from.z) < road.barrierWidth)
        .map((vertex) => vertex.y);
      expect(nearest.length).toBeGreaterThan(0);
      expect(Math.max(...nearest)).toBeCloseTo(piece.from.y, 1);
    }
  });

  it('gives a whole-lap wall its full height all the way round', () => {
    const all = wallPieces(line, height, cross, width, wholeLap(line), config);
    expect(all).toHaveLength(2 * n);
    for (const piece of all) expect(place(piece.from).above).toBeCloseTo(road.barrierHeight, 3);
  });

  it('says how far the wall goes into the ground', () => {
    expect(BARRIER_FOOTING).toBeGreaterThan(0.3);
  });
});

describe('gateBoxes: the gate as numbers, for collisions', () => {
  const width = uniformWidth(line, config.track.roadWidth);
  const boxes = gateBoxes(line, height, cross, width, config);

  it('gives the left post, the right post and the beam', () => {
    expect(boxes).toHaveLength(3);
    const [left, right, beam] = boxes;
    expect(locate(line, left!.x, left!.z).lateral).toBeCloseTo(-(OUTER + 0.3 + road.gatePost / 2), 2);
    expect(locate(line, right!.x, right!.z).lateral).toBeCloseTo(OUTER + 0.3 + road.gatePost / 2, 2);
    expect(locate(line, beam!.x, beam!.z).lateral).toBeCloseTo(0, 2);
    for (const post of [left!, right!]) {
      expect(post.halfAcross).toBeCloseTo(road.gatePost / 2, 6);
      expect(post.halfAlong).toBeCloseTo(road.gatePost / 2, 6);
    }
    expect(beam!.halfAcross).toBeCloseTo(OUTER + 0.3, 2);
  });

  it('stands the posts from under the ground to the top of the beam, and lifts the beam clear of the road', () => {
    const [left, right, beam] = boxes;
    for (const post of [left!, right!]) {
      expect(post.y - post.halfUp).toBeLessThan(height[0]! - road.sink);
      expect(post.y + post.halfUp).toBeCloseTo(beam!.y + beam!.halfUp, 6);
    }
    expect(beam!.y - beam!.halfUp).toBeGreaterThanOrEqual(height[0]! + road.gateClearance);
    expect(beam!.halfUp).toBeCloseTo(road.gateBeam / 2, 6);
  });

  it('points along the road at the start line', () => {
    for (const box of boxes) {
      expect(box.tx).toBe(line.tx[0]);
      expect(box.tz).toBe(line.tz[0]);
    }
  });

  it('is the gate that is drawn: every corner of the drawn gate is a corner of a box', () => {
    const mesh = buildStartGate(line, height, cross, width, config);
    let checked = 0;
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      const material = mesh.materials[v]!;
      if (material !== ROAD_MATERIAL.gate && material !== ROAD_MATERIAL.gateBeam) continue;
      const [x, y, z] = [mesh.positions[v * 3]!, mesh.positions[v * 3 + 1]!, mesh.positions[v * 3 + 2]!];
      const onABox = boxes.some((box) => {
        const dx = x - box.x, dz = z - box.z;
        const along = dx * box.tx + dz * box.tz;
        const across = dx * -box.tz + dz * box.tx;
        return (
          Math.abs(Math.abs(along) - box.halfAlong) < 1e-3 &&
          Math.abs(Math.abs(across) - box.halfAcross) < 1e-3 &&
          Math.abs(Math.abs(y - box.y) - box.halfUp) < 1e-3
        );
      });
      expect(onABox).toBe(true);
      checked++;
    }
    expect(checked).toBe(3 * 6 * 4);
  });
});

describe('buildBarriers on a bridge (M6.1c)', () => {
  const width = uniformWidth(line, config.track.roadWidth);
  const railings = new Uint8Array(line.count);
  for (let i = 20; i <= 40; i++) railings[i] = DECK.wood;
  for (let i = 100; i <= 115; i++) railings[i] = DECK.concrete;
  const mesh = buildBarriers(line, height, cross, width, sections, wholeLap(line), config, railings);
  const look = config.road.bridges.look;
  /** Every vertex of a material, placed beside the road and measured above the road's tilted plane. */
  const placed = (material: number) => {
    const out = [];
    for (let v = 0; v < mesh.materials.length; v++) {
      if (mesh.materials[v] !== material) continue;
      const x = mesh.positions[v * 3]!;
      const y = mesh.positions[v * 3 + 1]!;
      const z = mesh.positions[v * 3 + 2]!;
      const { sample, lateral } = locate(line, x, z);
      out.push({ x, z, sample, lateral, above: y - (height[sample]! + cross[sample]! * lateral) });
    }
    return out;
  };

  it('draws a railing over a bridge, timber or steel by its kind, and the wall everywhere else', () => {
    const timber = placed(ROAD_MATERIAL.timber);
    const steel = placed(ROAD_MATERIAL.steel);
    expect(timber.length).toBeGreaterThan(0);
    expect(steel.length).toBeGreaterThan(0);
    for (const vertex of timber) expect(vertex.sample).toBeGreaterThanOrEqual(19), expect(vertex.sample).toBeLessThanOrEqual(42);
    for (const vertex of steel) expect(vertex.sample).toBeGreaterThanOrEqual(99), expect(vertex.sample).toBeLessThanOrEqual(117);
    for (const vertex of placed(ROAD_MATERIAL.barrier)) {
      expect(vertex.sample >= 22 && vertex.sample <= 39, `wall at sample ${vertex.sample}`).toBe(false);
      expect(vertex.sample >= 102 && vertex.sample <= 114, `wall at sample ${vertex.sample}`).toBe(false);
    }
  });

  it('stands a post at every sample of the railing, from the wall’s foot to its top, with rails no higher, all inside the wall the car meets', () => {
    const timber = placed(ROAD_MATERIAL.timber);
    const lowest = Math.min(...timber.map((v) => v.above));
    const highest = Math.max(...timber.map((v) => v.above));
    // Within a centimetre: the posts stand upright, so on banked road their corners sit a little off its tilted plane.
    expect(Math.abs(lowest - (-road.sink - BARRIER_FOOTING))).toBeLessThan(0.01);
    expect(Math.abs(highest - road.barrierHeight)).toBeLessThan(0.01);
    // Only the posts reach down to the foot: four corners each, at 22 samples (20 to 41) on each side of the road.
    const feet = new Set(timber.filter((v) => v.above < lowest + 0.02).map((v) => `${v.x.toFixed(3)},${v.z.toFixed(3)}`));
    expect(feet.size).toBe(2 * 22 * 4);
    for (const vertex of [...timber, ...placed(ROAD_MATERIAL.steel)]) {
      expect(Math.abs(vertex.lateral)).toBeGreaterThanOrEqual(INNER - 1e-6);
      expect(Math.abs(vertex.lateral)).toBeLessThanOrEqual(OUTER + 1e-6);
    }
    const thickness = (vertices: { lateral: number }[]): number => Math.max(...vertices.map((v) => Math.abs(v.lateral))) - Math.min(...vertices.map((v) => Math.abs(v.lateral)));
    expect(thickness(timber)).toBeCloseTo(look.timber.post, 3);
    expect(thickness(placed(ROAD_MATERIAL.steel))).toBeCloseTo(look.steel.post, 3);
  });

  it('closes the wall with an end face where it meets a railing', () => {
    const ends = triangles(mesh).filter((t) => {
      if (t.material !== ROAD_MATERIAL.barrier) return false;
      const { sample } = locate(line, t.x, t.z);
      return (sample === 20 || sample === 41) && Math.abs(t.nx * line.tx[sample]! + t.nz * line.tz[sample]!) > 0.9;
    });
    // Both sides of the road, at both ends of the railing, two triangles a face.
    expect(ends).toHaveLength(8);
  });
});
