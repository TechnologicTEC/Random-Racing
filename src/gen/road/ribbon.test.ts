import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { circleLine } from '../../testing/trackFixtures';
import type { CenterLine, MeshData } from '../types';
import { buildRoadRibbon, ROAD_MATERIAL } from './ribbon';

const road = config.road;
const HALF = config.track.roadWidth / 2;

const line = circleLine(100);
const height = Float64Array.from({ length: line.count }, (_, i) => 12 + 2 * Math.sin((i / line.count) * 2 * Math.PI));
const cross = new Float64Array(line.count).fill(-0.1);
const mesh = buildRoadRibbon(line, height, cross, config);

/** For a vertex: the nearest centre-line sample, and how far to the right of the line the vertex is. */
function locate(centre: CenterLine, x: number, z: number): { sample: number; lateral: number } {
  let sample = 0;
  let best = Infinity;
  for (let i = 0; i < centre.count; i++) {
    const d = (centre.x[i]! - x) ** 2 + (centre.z[i]! - z) ** 2;
    if (d < best) {
      best = d;
      sample = i;
    }
  }
  // Right of the direction of travel is (-tz, tx) on the map.
  const lateral = (x - centre.x[sample]!) * -centre.tz[sample]! + (z - centre.z[sample]!) * centre.tx[sample]!;
  return { sample, lateral };
}

const vertices = (data: MeshData): Array<{ x: number; y: number; z: number; material: number }> =>
  Array.from({ length: data.positions.length / 3 }, (_, v) => ({
    x: data.positions[v * 3]!,
    y: data.positions[v * 3 + 1]!,
    z: data.positions[v * 3 + 2]!,
    material: data.materials[v]!,
  }));

describe('buildRoadRibbon', () => {
  it('makes triangles for every piece of the lap, with a material for every vertex', () => {
    expect(mesh.positions.length % 3).toBe(0);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.materials).toHaveLength(mesh.positions.length / 3);
    // At least the two halves of asphalt, two edge lines, a centre line and two aprons for each piece.
    expect(mesh.indices.length / 3).toBeGreaterThanOrEqual(line.count * 7 * 2);
    for (const index of mesh.indices) expect(index).toBeLessThan(mesh.positions.length / 3);
  });

  it('puts the driving surface exactly on the road: centre height plus the tilt across it', () => {
    for (const vertex of vertices(mesh)) {
      if (vertex.material === ROAD_MATERIAL.shoulder) continue;
      const { sample, lateral } = locate(line, vertex.x, vertex.z);
      expect(vertex.y).toBeCloseTo(height[sample]! + lateral * cross[sample]!, 2);
    }
  });

  it('is as wide as the road, with white lines along both edges', () => {
    let widest = 0;
    let lineLeft = false;
    let lineRight = false;
    for (const vertex of vertices(mesh)) {
      if (vertex.material === ROAD_MATERIAL.shoulder) continue;
      const { lateral } = locate(line, vertex.x, vertex.z);
      widest = Math.max(widest, Math.abs(lateral));
      if (vertex.material === ROAD_MATERIAL.line && lateral < -HALF + road.edgeLine + 0.01) lineLeft = true;
      if (vertex.material === ROAD_MATERIAL.line && lateral > HALF - road.edgeLine - 0.01) lineRight = true;
    }
    expect(widest).toBeCloseTo(HALF, 2);
    expect(lineLeft).toBe(true);
    expect(lineRight).toBe(true);
  });

  it('has a dashed line down the middle', () => {
    let painted = 0;
    let bare = 0;
    for (const vertex of vertices(mesh)) {
      const { lateral } = locate(line, vertex.x, vertex.z);
      if (Math.abs(lateral) > road.centreLine / 2 + 0.01) continue;
      if (vertex.material === ROAD_MATERIAL.line) painted++;
      else bare++;
    }
    expect(painted).toBeGreaterThan(100);
    expect(bare).toBeGreaterThan(100);
  });

  it('folds an apron down from each edge, to hide the gap above the sunken ground', () => {
    let lowest = Infinity;
    let widest = 0;
    for (const vertex of vertices(mesh)) {
      if (vertex.material !== ROAD_MATERIAL.shoulder) continue;
      const { sample, lateral } = locate(line, vertex.x, vertex.z);
      widest = Math.max(widest, Math.abs(lateral));
      const surface = height[sample]! + Math.sign(lateral) * HALF * cross[sample]!;
      lowest = Math.min(lowest, vertex.y - surface);
      expect(vertex.y).toBeLessThanOrEqual(surface + 0.02);
    }
    expect(widest).toBeCloseTo(HALF + road.apronWidth, 2);
    // The outer edge of the apron is below the sunken ground.
    expect(lowest).toBeLessThan(-road.sink);
  });

  it('faces every triangle upwards', () => {
    const p = mesh.positions;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const a = mesh.indices[t]! * 3, b = mesh.indices[t + 1]! * 3, c = mesh.indices[t + 2]! * 3;
      const normalY = (p[b + 2]! - p[a + 2]!) * (p[c]! - p[a]!) - (p[b]! - p[a]!) * (p[c + 2]! - p[a + 2]!);
      expect(normalY).toBeGreaterThan(0);
    }
  });

  it('closes the loop: the end of the last piece meets the start of the first', () => {
    const all = vertices(mesh);
    const key = (v: { x: number; y: number; z: number }): string => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    const counts = new Map<string, number>();
    for (const vertex of all) counts.set(key(vertex), (counts.get(key(vertex)) ?? 0) + 1);
    // Every position is shared by the piece before and the piece after it, all the way round.
    for (const count of counts.values()) expect(count).toBeGreaterThanOrEqual(2);
  });

  it('stays level from side to side when there is no banking', () => {
    const level = buildRoadRibbon(line, height, null, config);
    for (const vertex of vertices(level)) {
      if (vertex.material === ROAD_MATERIAL.shoulder) continue;
      const { sample } = locate(line, vertex.x, vertex.z);
      expect(vertex.y).toBeCloseTo(height[sample]!, 2);
    }
  });
});
