import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { circleLine, stadiumLine, swellingWidth, uniformWidth } from '../../testing/trackFixtures';
import type { CenterLine, HeightField } from '../types';
import { fitReach, fitRoad, smoothBends } from './fit';
import { createField, sampleField, worldX, worldZ } from './heightfield';
import { nearestRoad } from './nearest';

const road = config.road;
const HALF = config.track.roadWidth / 2;
/** Half the width of the strip that follows the road: the road itself plus a verge each side. */
const CORRIDOR = HALF + road.verge;

/** Natural ground from a formula, on a grid just big enough for the fixture. */
function ground(extent: number, heightAt: (x: number, z: number) => number): HeightField {
  const field = createField(extent, 2);
  for (let iz = 0; iz < field.size; iz++) {
    for (let ix = 0; ix < field.size; ix++) field.height[iz * field.size + ix] = heightAt(worldX(field, ix), worldZ(field, iz));
  }
  return field;
}

function fit(
  line: CenterLine,
  natural: HeightField,
  heightAt: (i: number) => number,
  cross: Float64Array | null = null,
  width: Float64Array = uniformWidth(line, config.track.roadWidth),
) {
  const height = Float64Array.from({ length: line.count }, (_, i) => heightAt(i));
  return fitRoad({ natural, near: nearestRoad(line, natural), line, height, cross, width }, config);
}

/** Steepest slope between neighbouring cells of a grid, optionally only where `where` allows. */
function steepest(field: HeightField, where: (x: number, z: number) => boolean = () => true): number {
  let worst = 0;
  for (let iz = 0; iz < field.size - 1; iz++) {
    for (let ix = 0; ix < field.size - 1; ix++) {
      if (!where(worldX(field, ix), worldZ(field, iz))) continue;
      const c = iz * field.size + ix;
      worst = Math.max(
        worst,
        Math.abs(field.height[c + 1]! - field.height[c]!) / field.cell,
        Math.abs(field.height[c + field.size]! - field.height[c]!) / field.cell,
      );
    }
  }
  return worst;
}

describe('fitRoad on flat ground', () => {
  const line = circleLine(100);
  const natural = ground(400, () => 10);

  it('sinks the ground just below a road that sits at ground level', () => {
    const { ground: fitted } = fit(line, natural, () => 10);
    expect(sampleField(fitted, 100, 0, 0)).toBeCloseTo(10 - road.sink, 5);
    expect(sampleField(fitted, 100 + HALF, 0, 0)).toBeCloseTo(10 - road.sink, 5);
    expect(sampleField(fitted, 100 - HALF, 0, 0)).toBeCloseTo(10 - road.sink, 5);
  });

  it('leaves ground far from the road exactly as it was', () => {
    const { ground: fitted } = fit(line, natural, () => 14);
    expect(sampleField(fitted, 0, 0, 0)).toBe(10);
    expect(sampleField(fitted, 190, 190, 0)).toBe(10);
    const reach = CORRIDOR + road.blendMax + 2;
    for (let iz = 0; iz < fitted.size; iz += 3) {
      for (let ix = 0; ix < fitted.size; ix += 3) {
        const x = worldX(fitted, ix);
        const z = worldZ(fitted, iz);
        if (Math.abs(Math.sqrt(x * x + z * z) - 100) > reach) expect(fitted.height[iz * fitted.size + ix]).toBe(10);
      }
    }
  });

  it('marks the cells of the road and its verges, and no others', () => {
    const { corridor } = fit(line, natural, () => 10);
    const at = (x: number, z: number): number => corridor[Math.round((z + 200) / 2) * natural.size + Math.round((x + 200) / 2)]!;
    expect(at(100, 0)).toBe(1);
    // Two metres inside the verge's outer edge: a whole grid cell, so the point never rounds onto the edge.
    expect(at(100 + CORRIDOR - 2, 0)).toBe(1);
    expect(at(100 + CORRIDOR + 2, 0)).toBe(0);
    expect(at(0, 0)).toBe(0);
  });
});

describe('fitRoad building an embankment', () => {
  const line = circleLine(100);
  const natural = ground(400, () => 10);
  const { ground: fitted } = fit(line, natural, () => 14);
  /** Fitted height at a distance outside the centre line of the road, along the +X axis. */
  const outside = (distance: number): number => sampleField(fitted, 100 + distance, 0, 0);

  it('holds the whole road and verge at road height, less the sink', () => {
    for (const d of [-CORRIDOR + 1, -HALF, 0, HALF, CORRIDOR - 1]) expect(outside(d)).toBeCloseTo(14 - road.sink, 4);
  });

  it('falls steadily from the verge to the natural ground', () => {
    let previous = outside(CORRIDOR);
    for (let d = CORRIDOR + 2; d <= CORRIDOR + road.blendMax; d += 2) {
      const here = outside(d);
      expect(here).toBeLessThanOrEqual(previous + 1e-4);
      previous = here;
    }
    expect(outside(CORRIDOR + road.blendMax)).toBeCloseTo(10, 3);
  });

  it('takes at least the minimum blend distance, and no slope is steeper than a bank can stand', () => {
    expect(outside(CORRIDOR + road.blendMin - 3)).toBeGreaterThan(10.1);
    expect(steepest(fitted)).toBeLessThan(0.75);
  });

  it('uses a wider blend for a taller embankment', () => {
    const low = fit(line, natural, () => 11).ground;
    const tall = fit(line, natural, () => 18).ground;
    const d = CORRIDOR + road.blendMin + 2;
    // 12 m out, the 1 m bank is finished but the 8 m bank still has a long way to fall.
    expect(sampleField(low, 100 + d, 0, 0)).toBeCloseTo(10, 3);
    expect(sampleField(tall, 100 + d, 0, 0)).toBeGreaterThan(12);
  });
});

describe('fitRoad digging a cutting', () => {
  const line = circleLine(100);
  const natural = ground(400, () => 20);
  const { ground: fitted } = fit(line, natural, () => 15);

  it('lowers the road strip and rises back to the natural ground on both sides', () => {
    expect(sampleField(fitted, 100, 0, 0)).toBeCloseTo(15 - road.sink, 4);
    expect(sampleField(fitted, 100 + CORRIDOR + 6, 0, 0)).toBeGreaterThan(15.2);
    expect(sampleField(fitted, 100 + CORRIDOR + 6, 0, 0)).toBeLessThan(20);
    expect(sampleField(fitted, 100 - CORRIDOR - 6, 0, 0)).toBeGreaterThan(15.2);
    expect(sampleField(fitted, 100 + CORRIDOR + road.blendMax, 0, 0)).toBeCloseTo(20, 3);
    expect(sampleField(fitted, 100 - CORRIDOR - road.blendMax, 0, 0)).toBeCloseTo(20, 3);
  });

  it('lets a deep cutting blend back further than an embankment may, so it lies back (M6.3b)', () => {
    expect(road.blendCutMax).toBeGreaterThan(road.blendMax);
    // A 25 m cut wants a 62 m blend at its usual slope: held to the cutting's own longest.
    const deep = fit(line, ground(400, () => 40), () => 15).ground;
    expect(sampleField(deep, 100 + CORRIDOR + road.blendMax, 0, 0)).toBeLessThan(39);
    expect(sampleField(deep, 100 + CORRIDOR + road.blendCutMax + 2, 0, 0)).toBeCloseTo(40, 3);
    expect(steepest(deep)).toBeLessThan(1);
    // A 25 m embankment is still held to the embankment's longest.
    const tall = fit(line, ground(400, () => 10), () => 35).ground;
    expect(sampleField(tall, 100 + CORRIDOR + road.blendMax + 2, 0, 0)).toBeCloseTo(10, 3);
  });

  it('keeps a cutting wider than an embankment out of the middle of a tight corner', () => {
    // Inside a 60 m circle, where the nearest point of the road jumps round the corner, the wider blend stops at
    // 0.8 of the radius (as a tunnel's lid does), 48 m in; the embankments' 25 m still reaches as far as it did.
    const tight = circleLine(60);
    const deep = fit(tight, ground(400, () => 40), () => 15).ground;
    expect(sampleField(deep, 60 - CORRIDOR - road.blendMax + 2, 0, 0)).toBeLessThan(39.9);
    expect(sampleField(deep, 60 - 50, 0, 0)).toBe(40);
    // Outside the corner it reaches its whole width.
    expect(sampleField(deep, 60 + CORRIDOR + road.blendMax, 0, 0)).toBeLessThan(39);
  });

  it('takes the bend from a curvature smoothed along the lap, so it never jumps where an arc meets a straight', () => {
    const line = stadiumLine(200, 40);
    const { right, left } = smoothBends(line, road.blendCutMax);
    // The stadium turns one way only: the bend on that side reaches a 40 m arc's in the middle of each end.
    const bends = Math.max(...right) > Math.max(...left) ? right : left;
    const other = bends === right ? left : right;
    expect(Math.max(...bends)).toBeCloseTo(1 / 40, 4);
    expect(Math.max(...other)).toBeCloseTo(0, 6);
    for (let i = 0; i < line.count; i++) {
      // From one sample to the next the bend changes by at most a 40 m arc's over the window's length.
      const step = Math.abs(bends[(i + 1) % line.count]! - bends[i]!);
      expect(step).toBeLessThan((1 / 40) * (line.spacing / road.blendCutMax));
    }
  });

  it('reaches as far as its widest blend (fitReach)', () => {
    expect(fitReach(config.track.roadWidth, config)).toBe(HALF + road.verge + Math.max(road.blendMax, road.blendCutMax));
  });
});

describe('fitRoad on a road that climbs', () => {
  const line = circleLine(100);
  const natural = ground(400, () => 10);
  // One smooth rise and fall per lap.
  const surfaceAt = (i: number): number => 12 + 3 * Math.sin((i / line.count) * 2 * Math.PI);
  const { ground: fitted } = fit(line, natural, surfaceAt);

  it('keeps the ground a steady sink below the road surface all along and across the road', () => {
    for (let i = 0; i < line.count; i += 4) {
      for (const offset of [-HALF, -HALF / 2, 0, HALF / 2, HALF]) {
        // Right of the direction of travel is (-tz, tx) on the map.
        const x = line.x[i]! - line.tz[i]! * offset;
        const z = line.z[i]! + line.tx[i]! * offset;
        const below = surfaceAt(i) - sampleField(fitted, x, z, 0);
        expect(below).toBeGreaterThan(road.sink - 0.08);
        expect(below).toBeLessThan(road.sink + 0.08);
      }
    }
  });
});

describe('fitRoad on a banked road', () => {
  const line = circleLine(100);
  const natural = ground(400, () => 10);
  // Tilted so the right-hand edge (the inside of this clockwise circle) is lower: 0.1 m per metre.
  const cross = new Float64Array(line.count).fill(-0.1);
  const { ground: fitted } = fit(line, natural, () => 12, cross);

  it('tilts the ground with the road, verge included', () => {
    // At the +X end of the circle the centre is on the left of the map, so "right of travel" points to -X.
    // The centre line is made of 2 m chords, so positions across a curved road are good to a few millimetres.
    expect(sampleField(fitted, 100, 0, 0)).toBeCloseTo(12 - road.sink, 2);
    expect(sampleField(fitted, 100 - 5, 0, 0)).toBeCloseTo(12 - 0.5 - road.sink, 2);
    expect(sampleField(fitted, 100 + 5, 0, 0)).toBeCloseTo(12 + 0.5 - road.sink, 2);
    // Just past the road edge, still on the verge.
    expect(sampleField(fitted, 100 + HALF + 1, 0, 0)).toBeCloseTo(12 + (HALF + 1) * 0.1 - road.sink, 2);
    // At the very edge of the verge the bank has begun, so the ground may already be a few centimetres down.
    const vergeEdge = sampleField(fitted, 100 + CORRIDOR - 0.5, 0, 0);
    expect(Math.abs(vergeEdge - (12 + (CORRIDOR - 0.5) * 0.1 - road.sink))).toBeLessThan(0.1);
  });
});

describe('fitRoad between two sections side by side', () => {
  // Two 300 m straights 10 m further apart than the closest the rules allow (40 m on a 12 m road):
  // the near one (z = -G) at 10 m, the far one (z = +G) at 16 m.
  const G = (config.track.roadWidth * config.track.sectionGapWidths + 10) / 2;
  const line = stadiumLine(300, G);
  const natural = ground(520, () => 10);
  const heightOf = (i: number): number => 13 + 3 * Math.max(-1, Math.min(1, line.z[i]! / (G - 2)));
  const { ground: fitted } = fit(line, natural, heightOf);
  const across = (z: number): number => sampleField(fitted, 0, z, 0);

  it('holds each section at its own height, untouched by its neighbour', () => {
    for (const d of [-CORRIDOR + 1, -HALF, 0, HALF, CORRIDOR - 1]) {
      expect(across(-G + d)).toBeCloseTo(10 - road.sink, 3);
      expect(across(G + d)).toBeCloseTo(16 - road.sink, 3);
    }
  });

  it('joins them with one bank that only ever rises from the lower to the higher', () => {
    let previous = across(-G + CORRIDOR);
    for (let z = -G + CORRIDOR + 1; z <= G - CORRIDOR; z += 1) {
      const here = across(z);
      expect(here).toBeGreaterThanOrEqual(previous - 1e-4);
      previous = here;
    }
  });

  it('gives every cell a real height, even one exactly at the outer edge of a verge', () => {
    let bad = 0;
    for (const height of fitted.height) if (!Number.isFinite(height)) bad++;
    expect(bad).toBe(0);
  });

  it('keeps that bank gentle enough to stand', () => {
    expect(steepest(fitted, (x, z) => Math.abs(x) < 100 && Math.abs(z) < G - CORRIDOR)).toBeLessThan(0.75);
  });
});

describe('fitRoad under a wider road', () => {
  const line = circleLine(100);
  const natural = ground(400, () => 10);
  // 8 m wider than the usual width (20 m on a 12 m road).
  const WIDE = config.track.roadWidth + 8;
  const { ground: fitted, corridor } = fit(line, natural, () => 14, null, uniformWidth(line, WIDE));
  const outside = (distance: number): number => sampleField(fitted, 100 + distance, 0, 0);
  const marked = (x: number, z: number): number => corridor[Math.round((z + 200) / 2) * natural.size + Math.round((x + 200) / 2)]!;
  const strip = WIDE / 2 + road.verge;

  it('holds the ground at road height right across the wider road and its verges', () => {
    expect(strip).toBeGreaterThan(CORRIDOR + 2);
    for (const d of [-strip + 1, -WIDE / 2, 0, WIDE / 2, strip - 1]) expect(outside(d)).toBeCloseTo(14 - road.sink, 4);
  });

  it('starts the embankment at the wider verge, not where a narrow road would end', () => {
    expect(outside(strip + road.blendMin - 3)).toBeGreaterThan(10.1);
    expect(outside(strip + road.blendMax)).toBeCloseTo(10, 3);
  });

  it('marks the cells of the wider road and its verges', () => {
    expect(marked(100 + strip - 2, 0)).toBe(1);
    expect(marked(100 - strip + 2, 0)).toBe(1);
    expect(marked(100 + strip + 2, 0)).toBe(0);
  });
});

describe('fitRoad under a road whose width changes along the lap', () => {
  const line = circleLine(100);
  const natural = ground(400, () => 10);
  // 12 m wide at the start of the lap, 22 m half way round.
  const width = swellingWidth(line, 12, 22);
  const { ground: fitted } = fit(line, natural, () => 14, null, width);

  it('follows the true edge at every sample: road height out to the verge, a bank beyond it', () => {
    for (let i = 0; i < line.count; i += 5) {
      const strip = width[i]! / 2 + road.verge;
      const at = (lateral: number): number =>
        // Right of the direction of travel is (-tz, tx) on the map.
        sampleField(fitted, line.x[i]! - line.tz[i]! * lateral, line.z[i]! + line.tx[i]! * lateral, 0);
      for (const side of [1, -1]) {
        // Two metres inside the verge's outer edge allows for the 2 m grid.
        expect(at(side * (strip - 2)), `sample ${i}`).toBeCloseTo(14 - road.sink, 2);
        expect(at(side * (strip + 8)), `sample ${i}`).toBeLessThan(14 - road.sink - 0.5);
      }
    }
  });
});

describe('fitRoad under a bridge (M6.1b)', () => {
  const line = circleLine(100);
  const n = line.count;
  const deck = road.bridges.deckDepth + road.bridges.underClearance;
  /** The first half of the lap on a bridge. */
  const half = Uint8Array.from({ length: n }, (_, i) => (i < n / 2 ? 1 : 0));
  const fitBridged = (natural: HeightField, roadHeight: number, bridged: Uint8Array) => {
    const height = new Float64Array(n).fill(roadHeight);
    return fitRoad({ natural, near: nearestRoad(line, natural), line, height, cross: null, width: uniformWidth(line, config.track.roadWidth), bridged }, config);
  };
  const under = (field: HeightField, i: number, lateral = 0): number =>
    sampleField(field, line.x[i]! - line.tz[i]! * lateral, line.z[i]! + line.tx[i]! * lateral, 0);

  it('leaves the natural ground under a bridge, and builds the embankment where the road is off it', () => {
    const natural = ground(400, () => 10);
    const { ground: fitted, corridor } = fitBridged(natural, 20, half);
    const middle = Math.round(n / 4);
    for (const lateral of [-HALF, 0, HALF, CORRIDOR + 5, CORRIDOR + road.blendMax]) expect(under(fitted, middle, lateral)).toBeCloseTo(10, 5);
    expect(under(fitted, Math.round((3 * n) / 4))).toBeCloseTo(20 - road.sink, 5);
    // Not the road's strip: the island's own cover shows under a bridge.
    const c = (x: number, z: number) => Math.round((z + 200) / 2) * natural.size + Math.round((x + 200) / 2);
    expect(corridor[c(line.x[middle]!, line.z[middle]!)]).toBe(0);
  });

  it('keeps natural ground that lies just clear of the deck, and leaves no bank round it', () => {
    const natural = ground(400, () => 20 - deck - 0.1);
    const all = new Uint8Array(n).fill(1);
    const { ground: fitted } = fitBridged(natural, 20, all);
    for (const lateral of [-HALF, 0, HALF, CORRIDOR + 3]) expect(under(fitted, 10, lateral)).toBeCloseTo(20 - deck - 0.1, 5);
  });

  it('cuts ground that would come within the clearance of the deck to the road, as anywhere else, and blends the cutting into the hillside', () => {
    // A bridge takes the place of an embankment, never of a cutting: here the ground stands 5 m over the road.
    const natural = ground(400, () => 25);
    const all = new Uint8Array(n).fill(1);
    const { ground: fitted, corridor } = fitBridged(natural, 20, all);
    for (const lateral of [-HALF, 0, HALF]) expect(under(fitted, 10, lateral)).toBeCloseTo(20 - road.sink, 5);
    const c = (x: number, z: number) => Math.round((z + 200) / 2) * natural.size + Math.round((x + 200) / 2);
    expect(corridor[c(line.x[10]!, line.z[10]!)]).toBe(1);
    // Beyond the verge the cutting's bank rises from the road towards the natural ground, as on any road.
    const bank = under(fitted, 10, CORRIDOR + 3);
    expect(bank).toBeGreaterThan(20);
    expect(bank).toBeLessThan(25 - 0.5);
  });
});
