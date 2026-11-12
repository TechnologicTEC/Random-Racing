import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { circleLine, pathLine, roundedSquareLine, type PathStep } from '../../testing/trackFixtures';
import { analyseSections } from '../track/analysis';
import { generateTrack } from '../track/pipeline';
import type { CenterLine } from '../types';
import { buildKerbs, findKerbs } from './kerbs';
import { ROAD_MATERIAL } from './ribbon';

const road = config.road;
const HALF = config.track.roadWidth / 2;

/** A 300 m square with 40 m corners, driven clockwise: four right-hand corners. */
const square = roundedSquareLine(300, 40);
const squareSections = analyseSections(square, config.track);

/** The same square driven the other way: four left-hand corners. */
function leftSquare(): CenterLine {
  const edge: PathStep[] = [{ straight: 220 }, { arc: 40, degrees: 90, turn: 'left' }];
  return pathLine({ x: -110, z: 150 }, 0, [...edge, ...edge, ...edge, ...edge]);
}

/** How far to the right of the centre line a point is, measured at its nearest sample. */
function lateralOf(line: CenterLine, x: number, z: number): { sample: number; lateral: number } {
  let sample = 0;
  let best = Infinity;
  for (let i = 0; i < line.count; i++) {
    const d = (line.x[i]! - x) ** 2 + (line.z[i]! - z) ** 2;
    if (d < best) {
      best = d;
      sample = i;
    }
  }
  return { sample, lateral: (x - line.x[sample]!) * -line.tz[sample]! + (z - line.z[sample]!) * line.tx[sample]! };
}

describe('findKerbs', () => {
  it('gives every real corner one kerb', () => {
    expect(findKerbs(square, squareSections, road)).toHaveLength(4);
  });

  it('puts the kerb on the inside: the right of a right-hand corner, the left of a left-hand one', () => {
    for (const kerb of findKerbs(square, squareSections, road)) expect(kerb.side).toBe(1);
    const left = leftSquare();
    const kerbs = findKerbs(left, analyseSections(left, config.track), road);
    expect(kerbs).toHaveLength(4);
    for (const kerb of kerbs) expect(kerb.side).toBe(-1);
  });

  it('runs the kerb through the corner, starting a little before it and ending a little after', () => {
    // 30 m corners: short enough that the whole corner fits within the longest kerb.
    const tight = roundedSquareLine(300, 30);
    const sections = analyseSections(tight, config.track);
    const corners = sections.filter((s) => s.type === 'corner');
    const kerbs = findKerbs(tight, sections, road);
    expect(kerbs).toHaveLength(4);
    kerbs.forEach((kerb, k) => {
      const corner = corners[k]!;
      const lead = Math.round(road.kerbLead / tight.spacing);
      expect(kerb.startIndex).toBe((corner.startIndex - lead + tight.count) % tight.count);
      expect(kerb.sampleCount).toBe(corner.sampleCount + 2 * lead);
    });
  });

  it('keeps a kerb on a very long corner to its longest length, centred on the middle of the corner', () => {
    // A 100 m circle is one corner 628 m long.
    const line = circleLine(100);
    const sections = analyseSections(line, config.track);
    const kerbs = findKerbs(line, sections, road);
    expect(kerbs).toHaveLength(1);
    expect(kerbs[0]!.sampleCount * line.spacing).toBeLessThanOrEqual(road.kerbMaxLength + line.spacing);
  });

  it('gives kinks and straights no kerb on generated tracks, and every real corner one', () => {
    for (const seed of [1, 7, 42, 99, 2024, 48213]) {
      const track = generateTrack(seed, config);
      const { line, sections } = track.candidates[track.winnerIndex]!;
      const realCorners = sections.filter((s) => s.type === 'corner' && s.kind !== 'kink').length;
      expect(findKerbs(line, sections, road), `seed ${seed}`).toHaveLength(realCorners);
    }
  });
});

describe('buildKerbs', () => {
  const height = Float64Array.from({ length: square.count }, () => 10);
  const cross = new Float64Array(square.count).fill(-0.08);
  const kerbs = findKerbs(square, squareSections, road);
  const mesh = buildKerbs(square, height, cross, kerbs, config);
  const vertex = (v: number) => ({ x: mesh.positions[v * 3]!, y: mesh.positions[v * 3 + 1]!, z: mesh.positions[v * 3 + 2]!, material: mesh.materials[v]! });
  const count = mesh.positions.length / 3;

  it('builds something for every kerb, in red and white only', () => {
    expect(mesh.indices.length).toBeGreaterThan(0);
    const used = new Set(mesh.materials);
    expect([...used].sort()).toEqual([ROAD_MATERIAL.kerbRed, ROAD_MATERIAL.kerbWhite].sort());
  });

  it('sits just outside the road edge, on the inside of the corner', () => {
    for (let v = 0; v < count; v++) {
      const { lateral } = lateralOf(square, vertex(v).x, vertex(v).z);
      // These corners all turn right, so the kerbs are all to the right of the centre line.
      expect(lateral).toBeGreaterThan(HALF - 0.05);
      expect(lateral).toBeLessThan(HALF + road.kerbWidth + 0.5);
    }
  });

  it('is flush with the banked road at its inner edge and rises to the kerb height at its outer edge', () => {
    let highest = 0;
    for (let v = 0; v < count; v++) {
      const { sample, lateral } = lateralOf(square, vertex(v).x, vertex(v).z);
      const plane = height[sample]! + lateral * cross[sample]!;
      const above = vertex(v).y - plane;
      if (Math.abs(lateral - HALF) < 0.02) expect(Math.abs(above)).toBeLessThan(0.02);
      expect(above).toBeLessThan(road.kerbHeight + 0.02);
      highest = Math.max(highest, above);
    }
    expect(highest).toBeGreaterThan(road.kerbHeight - 0.02);
  });

  it('has a skirt down its outer side, so it never floats above the sunken ground', () => {
    let lowest = Infinity;
    for (let v = 0; v < count; v++) {
      const { sample, lateral } = lateralOf(square, vertex(v).x, vertex(v).z);
      lowest = Math.min(lowest, vertex(v).y - (height[sample]! + lateral * cross[sample]!));
    }
    expect(lowest).toBeLessThan(-road.sink);
  });

  it('alternates red and white blocks along its length', () => {
    // Walk the top faces of the first kerb in order: the material must change from block to block.
    const first = buildKerbs(square, height, cross, kerbs.slice(0, 1), config);
    const sequence: number[] = [];
    for (let t = 0; t < first.indices.length; t += 6) {
      const material = first.materials[first.indices[t]!]!;
      if (sequence[sequence.length - 1] !== material) sequence.push(material);
    }
    expect(sequence.length).toBeGreaterThan(10);
  });

  it('ramps up from nothing at each end, so there is no step to hit', () => {
    const first = buildKerbs(square, height, cross, kerbs.slice(0, 1), config);
    const start = kerbs[0]!.startIndex;
    // The outer edge of the kerb at its very first sample is level with the road.
    let endHeight = Infinity;
    for (let v = 0; v < first.positions.length / 3; v++) {
      const x = first.positions[v * 3]!, y = first.positions[v * 3 + 1]!, z = first.positions[v * 3 + 2]!;
      const { sample, lateral } = lateralOf(square, x, z);
      if (sample === start && Math.abs(lateral - HALF - road.kerbWidth) < 0.02) {
        endHeight = Math.min(endHeight, Math.abs(y - (height[sample]! + lateral * cross[sample]!)));
      }
    }
    expect(endHeight).toBeLessThan(0.02);
  });

  it('faces its top upwards', () => {
    const p = mesh.positions;
    let up = 0;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const a = mesh.indices[t]! * 3, b = mesh.indices[t + 1]! * 3, c = mesh.indices[t + 2]! * 3;
      const normalY = (p[b + 2]! - p[a + 2]!) * (p[c]! - p[a]!) - (p[b]! - p[a]!) * (p[c + 2]! - p[a + 2]!);
      expect(normalY).toBeGreaterThan(0);
      up++;
    }
    expect(up).toBeGreaterThan(0);
  });

  it('builds kerbs on the left for left-hand corners', () => {
    const left = leftSquare();
    const leftKerbs = findKerbs(left, analyseSections(left, config.track), road);
    const leftMesh = buildKerbs(left, new Float64Array(left.count).fill(10), null, leftKerbs, config);
    for (let v = 0; v < leftMesh.positions.length / 3; v++) {
      const { lateral } = lateralOf(left, leftMesh.positions[v * 3]!, leftMesh.positions[v * 3 + 2]!);
      expect(lateral).toBeLessThan(-HALF + 0.05);
    }
  });
});
