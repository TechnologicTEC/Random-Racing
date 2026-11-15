import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { pathLine, roundedSquareLine, stadiumLine, uniformWidth } from '../../testing/trackFixtures';
import { generateWorld } from '../generate';
import { analyseSections } from '../track/analysis';
import type { CenterLine, HeightField, WallSpan } from '../types';
import { createField, worldX, worldZ } from '../world/heightfield';
import { findWalls, tidyWalls, walledPieces } from './walls';

const rules = config.road.walls;
const ROAD = config.track.roadWidth;

/** Ground for a fixture: a 1 km tile whose height at each point is given by `at`. */
function groundOf(at: (x: number, z: number) => number): HeightField {
  const field = createField(1000, 2);
  for (let iz = 0; iz < field.size; iz++) {
    for (let ix = 0; ix < field.size; ix++) field.height[iz * field.size + ix] = at(worldX(field, ix), worldZ(field, iz));
  }
  return field;
}

/** Walls for a level road at 10 m on a fixture line, over the ground given. */
function wallsOn(line: CenterLine, ground: HeightField): { spans: WallSpan[]; left: Uint8Array; right: Uint8Array } {
  const spans = findWalls(
    {
      line,
      height: new Float64Array(line.count).fill(10),
      cross: new Float64Array(line.count),
      width: uniformWidth(line, ROAD),
      sections: analyseSections(line, config.track),
      ground,
    },
    config,
  );
  return { spans, left: walledPieces(spans, line.count, -1), right: walledPieces(spans, line.count, 1) };
}

/** Distance along the lap from piece `from` forwards to piece `to`, in metres. */
const ahead = (line: CenterLine, from: number, to: number): number => (((to - from) % line.count) + line.count) % line.count * line.spacing;

const flat = groundOf(() => 10 - config.road.sink);

describe('findWalls on a level square lap, driven clockwise', () => {
  // 300 m square, 40 m corners: the outside of every corner is on the left, and the straights are 220 m long.
  const line = roundedSquareLine(300, 40);
  const sections = analyseSections(line, config.track);
  const corners = sections.filter((section) => section.type === 'corner');
  const { spans, left, right } = wallsOn(line, flat);

  it('walls the outside of every corner, from before it begins to after it ends', () => {
    expect(corners).toHaveLength(4);
    const lead = Math.floor(rules.cornerLead / line.spacing);
    const trail = Math.floor(rules.cornerTrail / line.spacing);
    for (const corner of corners) {
      for (let k = -lead; k < corner.sampleCount + trail; k++) {
        const piece = (((corner.startIndex + k) % line.count) + line.count) % line.count;
        expect(left[piece], `outside of the corner at sample ${corner.startIndex}, ${k} pieces in`).toBe(1);
      }
    }
  });

  it('leaves the outside of each straight open in the middle', () => {
    for (const section of sections) {
      if (section.type !== 'straight') continue;
      const middle = (section.startIndex + Math.floor(section.sampleCount / 2)) % line.count;
      // The start line's straight has the gate's walls on it; its middle is clear of them only if the gate is far away.
      if (ahead(line, 0, middle) < 60 || ahead(line, middle, 0) < 60) continue;
      expect(left[middle], `middle of the straight at sample ${section.startIndex}`).toBe(0);
    }
  });

  it('leaves the inside of the lap open, away from the start gate', () => {
    let open = 0;
    for (let piece = 0; piece < line.count; piece++) {
      const fromGate = Math.min(ahead(line, 0, piece), ahead(line, piece, 0));
      if (fromGate > rules.gate + rules.minWall) {
        expect(right[piece], `inside, piece ${piece}`).toBe(0);
        open++;
      }
    }
    expect(open).toBeGreaterThan(line.count * 0.8);
  });

  it('walls both sides at the start gate, whose posts stand outside the walls', () => {
    const reach = Math.floor(rules.gate / line.spacing);
    for (let k = -reach; k < reach; k++) {
      const piece = ((k % line.count) + line.count) % line.count;
      expect(left[piece]).toBe(1);
      expect(right[piece]).toBe(1);
    }
  });

  it('gives its walls in order along the lap, none overlapping, each on one side', () => {
    expect(spans.length).toBeGreaterThanOrEqual(5);
    for (const side of [1, -1] as const) {
      const mine = spans.filter((span) => span.side === side);
      let covered = 0;
      for (const span of mine) {
        expect(span.startIndex).toBeGreaterThanOrEqual(0);
        expect(span.startIndex).toBeLessThan(line.count);
        expect(span.pieceCount).toBeGreaterThan(0);
        expect(span.pieceCount).toBeLessThanOrEqual(line.count);
        covered += span.pieceCount;
      }
      // If two overlapped, they would cover more pieces between them than are walled.
      expect(covered).toBe(walledPieces(spans, line.count, side).reduce((sum, value) => sum + value, 0));
      expect(mine.map((span) => span.startIndex)).toEqual(mine.map((span) => span.startIndex).sort((a, b) => a - b));
    }
  });

  it('leaves no opening shorter than the shortest allowed, and no wall shorter than the shortest allowed', () => {
    for (const walled of [left, right]) {
      for (const run of runsOf(walled)) {
        const length = run.count * line.spacing;
        if (run.value === 0) expect(length).toBeGreaterThanOrEqual(rules.minGap - line.spacing);
        else expect(length).toBeGreaterThanOrEqual(rules.minWall - line.spacing);
      }
    }
  });
});

describe('findWalls beside steep ground', () => {
  const line = roundedSquareLine(300, 40);
  // The first straight runs along z = -150 towards +x; its outside (left) is towards -z. The start line is at x = -110.
  const edge = -150 - ROAD / 2 - config.road.verge;
  const beside = (x: number, z: number): boolean => x > 0 && x < 80 && z < edge;
  const middle = Math.round((110 + 40) / line.spacing);

  it('walls a bank that rises steeply beside the road, on that side only', () => {
    const { left, right } = wallsOn(line, groundOf((x, z) => 10 - config.road.sink + (beside(x, z) ? (edge - z) * 0.6 : 0)));
    expect(left[middle]).toBe(1);
    expect(right[middle]).toBe(0);
  });

  it('walls a drop beside the road', () => {
    const { left, right } = wallsOn(line, groundOf((x, z) => 10 - config.road.sink - (beside(x, z) ? (edge - z) * 0.6 : 0)));
    expect(left[middle]).toBe(1);
    expect(right[middle]).toBe(0);
  });

  it('walls a cliff that begins a little way from the road, within the reach it looks over', () => {
    const cliff = (x: number, z: number): number => (beside(x, z) && edge - z > rules.probeReach / 2 ? -8 : 0);
    const { left } = wallsOn(line, groundOf((x, z) => 10 - config.road.sink + cliff(x, z)));
    expect(left[middle]).toBe(1);
  });

  it('leaves a gentle slope open, such as a beach running down into the sea', () => {
    // 12% down from the verge: 10 m of fall puts it under the sea 85 m out.
    const { left } = wallsOn(line, groundOf((x, z) => 10 - config.road.sink - (beside(x, z) ? (edge - z) * 0.12 : 0)));
    expect(left[middle]).toBe(0);
  });

  it('ignores small bumps close to the road', () => {
    const { left } = wallsOn(line, groundOf((x, z) => 10 - config.road.sink + (beside(x, z) && Math.floor((edge - z) / 3) % 2 === 0 ? 0.4 : 0)));
    expect(left[middle]).toBe(0);
  });
});

describe('findWalls where two parts of the lap run close together', () => {
  it('walls the sides that face each other, and leaves the far sides open', () => {
    // Two 300 m straights 60 m apart, joined by half circles: driven clockwise, each straight has the other on its right.
    const line = stadiumLine(300, 30);
    expect(rules.closeDistance).toBeGreaterThan(60);
    const { left, right } = wallsOn(line, flat);
    for (const section of analyseSections(line, config.track)) {
      if (section.type !== 'straight') continue;
      for (let k = 0; k < section.sampleCount; k++) {
        const piece = (section.startIndex + k) % line.count;
        expect(right[piece], `facing the other straight, piece ${piece}`).toBe(1);
      }
    }
    // The far side of the back straight, in its middle, well away from the corners and the gate.
    const back = Math.round((300 + Math.PI * 30 + 150) / line.spacing);
    expect(left[back]).toBe(0);
  });

  it('leaves both sides open where the other part of the lap is far away', () => {
    // The same shape with the straights 300 m apart.
    const line = stadiumLine(300, 150);
    const { right } = wallsOn(line, flat);
    const back = Math.round((300 + Math.PI * 150 + 150) / line.spacing);
    expect(right[back]).toBe(0);
  });

  it('does not count the road just ahead or behind as another part of the lap', () => {
    // One long gentle bend: nothing is beside anything.
    const line = pathLine({ x: 0, z: -200 }, 0, [{ arc: 200, degrees: 360, turn: 'right' }]);
    const { right } = wallsOn(line, flat);
    // The inside of a 200 m circle has the far side of the circle 400 m away: open, away from the gate.
    expect(right[Math.round(line.count / 2)]).toBe(0);
  });
});

describe('tidyWalls', () => {
  const tidy = (pattern: string, minGap: number, minWall: number): string => {
    const need = Uint8Array.from(pattern, (c) => (c === '#' ? 1 : 0));
    tidyWalls(need, minGap, minWall);
    return Array.from(need, (value) => (value ? '#' : '.')).join('');
  };

  it('closes an opening that is too short', () => {
    expect(tidy('####..####..........', 3, 1)).toBe('##########..........');
  });

  it('keeps an opening that is long enough', () => {
    expect(tidy('####...####.........', 3, 1)).toBe('####...####.........');
  });

  it('lengthens a wall that is too short, evenly both ways', () => {
    expect(tidy('.......##...........', 1, 6)).toBe('.....######.........');
  });

  it('treats the lap as a loop: an opening or a wall may run past the end', () => {
    expect(tidy('.####..........####.', 3, 1)).toBe('#####..........#####');
    expect(tidy('#..................#', 1, 6)).toBe('###..............###');
  });

  it('closes an opening that lengthening a wall has made too short', () => {
    expect(tidy('#####....#..........', 3, 5)).toBe('############........');
  });

  it('leaves a lap with no wall, or all wall, as it is', () => {
    expect(tidy('....................', 5, 5)).toBe('....................');
    expect(tidy('####################', 5, 5)).toBe('####################');
  });
});

describe('findWalls on real seeds', () => {
  // Seeds 1 and 7 are a mountain seed (rock cuttings, 15% climbs) and a hilly one.
  it.each([1, 7, 5])('seed %i: walls where they are needed, openings elsewhere, the same every time', (seed) => {
    const world = generateWorld(seed, config);
    const { line, sections } = world.track.candidates[world.track.winnerIndex]!;
    const { walls } = world.road;
    const n = line.count;
    const left = walledPieces(walls, n, -1);
    const right = walledPieces(walls, n, 1);

    // The outside of every real corner is walled.
    for (const section of sections) {
      if (section.type !== 'corner' || section.kind === 'kink') continue;
      const outside = section.direction === 'right' ? left : right;
      for (let k = 0; k < section.sampleCount; k++) expect(outside[(section.startIndex + k) % n]).toBe(1);
    }
    // The gate has its walls.
    expect(left[0]).toBe(1);
    expect(right[0]).toBe(1);
    // No stub of a wall and no slot of an opening.
    for (const walled of [left, right]) {
      for (const run of runsOf(walled)) {
        if (run.count === n) continue;
        const length = run.count * line.spacing;
        if (run.value === 0) expect(length).toBeGreaterThanOrEqual(rules.minGap - line.spacing);
        else expect(length).toBeGreaterThanOrEqual(rules.minWall - line.spacing);
      }
    }
    expect(generateWorld(seed, config).road.walls).toEqual(walls);
  });

  it('opens a good part of a flat inland lap, and still walls some of every lap', () => {
    for (const seed of [1, 7, 5]) {
      const world = generateWorld(seed, config);
      const n = world.track.candidates[world.track.winnerIndex]!.line.count;
      const walled = walledPieces(world.road.walls, n, -1).reduce((sum, v) => sum + v, 0) + walledPieces(world.road.walls, n, 1).reduce((sum, v) => sum + v, 0);
      expect(walled).toBeGreaterThan(0);
      expect(walled).toBeLessThan(2 * n);
    }
  });
});

/** The runs of equal values round a loop, each with its value and length. A loop of one value is one run. */
function runsOf(values: Uint8Array): Array<{ value: number; count: number }> {
  const n = values.length;
  let first = -1;
  for (let i = 0; i < n; i++) {
    if (values[i] !== values[(i - 1 + n) % n]) {
      first = i;
      break;
    }
  }
  if (first < 0) return [{ value: values[0]!, count: n }];
  const runs: Array<{ value: number; count: number }> = [];
  for (let k = 0; k < n; k++) {
    const value = values[(first + k) % n]!;
    const last = runs[runs.length - 1];
    if (last && last.value === value) last.count++;
    else runs.push({ value, count: 1 });
  }
  return runs;
}
