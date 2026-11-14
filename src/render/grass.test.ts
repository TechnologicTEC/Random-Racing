import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen/generate';
import type { HeightField } from '../gen/types';
import { createField, sampleGrid } from '../gen/world/heightfield';
import { edgeDistance, nearestRoad } from '../gen/world/nearest';
import {
  bladeAt,
  bladeLength,
  bladeLives,
  bladeShape,
  edgeFade,
  fieldCentre,
  FLOWER_KINDS,
  grassBlades,
  grassEye,
  grassGlsl,
  groundHeightAt,
  sway,
  wrapAround,
  type Blade,
  type GrassEye,
} from './grass';
import { grassGrid, type GrassGrid } from './grassMaps';
import { buildTerrainChunks } from './terrainChunks';

const cfg = config.render.grass;
const wind = config.render.water.wind;
const reach = cfg.mown.width + cfg.mown.ease;
const blades = grassBlades(cfg);
const TAU = 2 * Math.PI;

/** A small repeatable source of numbers from 0 to 1, for picking test points. */
function numbers(start: number): () => number {
  let state = start;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 4294967296;
  };
}

/** Flat ground covered in grass, far from any road: lush (long grass) unless told otherwise. */
function meadow(options: { variation?: number; flowers?: number; roadside?: number; height?: number } = {}): { ground: HeightField; grid: GrassGrid } {
  const ground = createField(900, 3);
  ground.height.fill(options.height ?? 5);
  const data = new Uint8Array(ground.size * ground.size * 4);
  for (let c = 0; c < ground.size * ground.size; c++) {
    data[c * 4] = 255;
    data[c * 4 + 1] = options.variation ?? 0;
    data[c * 4 + 2] = options.roadside ?? 255;
    data[c * 4 + 3] = options.flowers ?? 0;
  }
  return { ground, grid: { data, size: ground.size, cell: ground.cell, origin: ground.origin, reach } };
}

/** A camera 4 m above the meadow at (x, z), looking level along +x. */
const eyeAt = (x: number, z = 0): GrassEye => grassEye({ x, y: 9, z }, { x: x + 30, y: 9, z });

/** Every blade of the field as it stands for a camera, at a moment. */
function field(eye: GrassEye, land: { ground: HeightField; grid: GrassGrid }, seconds = 0, step = 1): Blade[] {
  const all: Blade[] = [];
  for (let i = 0; i < blades.count; i += step) all.push(bladeAt(blades, i, eye, land.grid, land.ground, seconds, cfg, wind));
  return all;
}

describe('grassBlades: the blades of the field, the same on every island', () => {
  it('is the same list every time', () => {
    const again = grassBlades(cfg);
    expect(again.count).toBe(blades.count);
    expect(again.offset).toEqual(blades.offset);
    expect(again.trait).toEqual(blades.trait);
    expect(again.flower).toEqual(blades.flower);
  });

  it('has the configured number of blades in each field, one field after another', () => {
    expect(blades.tiers).toHaveLength(cfg.tiers.length);
    let start = 0;
    blades.tiers.forEach((tier, k) => {
      expect(tier.start).toBe(start);
      expect(tier.count).toBe(cfg.tiers[k]!.blades);
      expect(tier.half).toBe(cfg.tiers[k]!.half);
      expect(tier.width).toBe(cfg.tiers[k]!.width);
      expect(tier.triangles).toBe(cfg.tiers[k]!.triangles);
      // Each field gives way to the one inside it.
      expect(tier.inner).toBe(k === 0 ? 0 : cfg.tiers[k - 1]!.half);
      start += tier.count;
    });
    expect(blades.count).toBe(start);
    expect(blades.offset.length).toBe(start * 2);
    expect(blades.trait.length).toBe(start * 4);
    expect(blades.flower.length).toBe(start);
  });

  it('places every blade inside its field s square, spread evenly over it', () => {
    for (const tier of blades.tiers) {
      const squares = new Array<number>(16).fill(0);
      for (let i = tier.start; i < tier.start + tier.count; i++) {
        const x = blades.offset[i * 2]!;
        const z = blades.offset[i * 2 + 1]!;
        expect(Math.abs(x)).toBeLessThanOrEqual(tier.half);
        expect(Math.abs(z)).toBeLessThanOrEqual(tier.half);
        const column = Math.min(3, Math.floor(((x + tier.half) / (2 * tier.half)) * 4));
        const row = Math.min(3, Math.floor(((z + tier.half) / (2 * tier.half)) * 4));
        squares[row * 4 + column]!++;
      }
      for (const count of squares) {
        expect(count / tier.count).toBeGreaterThan(0.055);
        expect(count / tier.count).toBeLessThan(0.07);
      }
    }
  });

  it('gives each blade a turn, a share of its length, a place in the flutter and a number from 0 to 1 to live by', () => {
    const tenths = new Array<number>(10).fill(0);
    let spread = 0;
    for (let i = 0; i < blades.count; i++) {
      const [turn, share, phase, rank] = [blades.trait[i * 4]!, blades.trait[i * 4 + 1]!, blades.trait[i * 4 + 2]!, blades.trait[i * 4 + 3]!];
      expect(turn).toBeGreaterThanOrEqual(0);
      expect(turn).toBeLessThan(Math.PI);
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThan(1);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(TAU);
      expect(rank).toBeGreaterThanOrEqual(0);
      expect(rank).toBeLessThan(1);
      tenths[Math.floor(rank * 10)]!++;
      spread += share;
    }
    // The numbers they live by are spread evenly, so half the blades stand where grass cover is a half.
    for (const count of tenths) {
      expect(count / blades.count).toBeGreaterThan(0.09);
      expect(count / blades.count).toBeLessThan(0.11);
    }
    expect(spread / blades.count).toBeGreaterThan(0.47);
    expect(spread / blades.count).toBeLessThan(0.53);
  });

  it('lets the configured share of blades flower, in each of the flower colours', () => {
    const counts = new Array<number>(FLOWER_KINDS + 1).fill(0);
    for (let i = 0; i < blades.count; i++) counts[blades.flower[i]!]!++;
    expect(counts).toHaveLength(FLOWER_KINDS + 1);
    const flowering = blades.count - counts[0]!;
    expect(flowering / blades.count).toBeGreaterThan(cfg.flowers.share * 0.85);
    expect(flowering / blades.count).toBeLessThan(cfg.flowers.share * 1.15);
    for (let kind = 1; kind <= FLOWER_KINDS; kind++) expect(counts[kind]! / flowering).toBeGreaterThan(0.2);
  });
});

describe('bladeShape: one blade, standing a unit tall', () => {
  it('tapers from a foot two units wide to a point, in three triangles', () => {
    const shape = bladeShape(3);
    expect(shape.positions.length).toBe(5 * 3);
    expect(shape.indices.length).toBe(9);
    const ys = [...shape.positions].filter((_, k) => k % 3 === 1);
    const xs = [...shape.positions].filter((_, k) => k % 3 === 0);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(1);
    expect(Math.min(...xs)).toBe(-1);
    expect(Math.max(...xs)).toBe(1);
    // The tip is a single point in the middle; the foot is the widest part.
    for (let v = 0; v < 5; v++) {
      const [x, y] = [shape.positions[v * 3]!, shape.positions[v * 3 + 1]!];
      if (y === 1) expect(x).toBe(0);
      if (y > 0 && y < 1) expect(Math.abs(x)).toBeLessThan(1);
      expect(shape.positions[v * 3 + 2]).toBe(0);
    }
    for (const index of shape.indices) expect(index).toBeLessThan(5);
  });

  it('is a single triangle for the far field', () => {
    const shape = bladeShape(1);
    expect(shape.positions.length).toBe(3 * 3);
    expect([...shape.indices]).toHaveLength(3);
    expect(new Set(shape.indices).size).toBe(3);
    const ys = [...shape.positions].filter((_, k) => k % 3 === 1).sort();
    expect(ys).toEqual([0, 0, 1]);
  });
});

describe('wrapAround: a blade comes round again as its field moves on', () => {
  const next = numbers(7);

  it('is always within half the field s width of its middle, a whole number of widths from where it started', () => {
    for (let k = 0; k < 2000; k++) {
      const half = [20, 40, 80][k % 3]!;
      const offset = (next() * 2 - 1) * half;
      const centre = (next() - 0.5) * 3000;
      const at = wrapAround(offset, centre, half);
      expect(Math.abs(at - centre)).toBeLessThanOrEqual(half + 1e-6);
      const widths = (at - offset) / (2 * half);
      expect(Math.abs(widths - Math.round(widths))).toBeLessThan(1e-6);
    }
  });

  it('stays where it is while the middle moves, until it jumps a whole width at the edge', () => {
    const half = 20;
    for (let k = 0; k < 50; k++) {
      const offset = (next() * 2 - 1) * half;
      let before = wrapAround(offset, -100, half);
      let jumps = 0;
      for (let centre = -100; centre <= 100; centre += 0.25) {
        const at = wrapAround(offset, centre, half);
        if (at !== before) {
          expect(at - before).toBeCloseTo(2 * half, 6);
          // It jumps from the edge behind to the edge ahead.
          expect(Math.abs(before - centre)).toBeGreaterThan(half - 0.26);
          expect(Math.abs(at - centre)).toBeGreaterThan(half - 0.26);
          jumps++;
        }
        before = at;
      }
      expect(jumps).toBe(5);
    }
  });
});

describe('fieldCentre: each field sits ahead of the camera', () => {
  it('is ahead by the configured share of the field s half-width when the camera looks level', () => {
    const centre = fieldCentre(eyeAt(100, -40), 80, cfg.ahead);
    expect(centre.x).toBeCloseTo(100 + 80 * cfg.ahead, 6);
    expect(centre.z).toBeCloseTo(-40, 6);
  });

  it('is under the camera when it looks straight down, and part of the way ahead when it looks down at a slant', () => {
    const down = fieldCentre(grassEye({ x: 5, y: 60, z: 5 }, { x: 5, y: 0, z: 5 }), 80, cfg.ahead);
    expect(down.x).toBeCloseTo(5, 6);
    expect(down.z).toBeCloseTo(5, 6);
    const slant = fieldCentre(grassEye({ x: 0, y: 30, z: 0 }, { x: 0, y: 0, z: -30 }), 80, cfg.ahead);
    expect(slant.x).toBeCloseTo(0, 6);
    expect(slant.z).toBeCloseTo(-80 * cfg.ahead * Math.SQRT1_2, 4);
  });
});

describe('edgeFade: blades shrink to nothing at the edge of their field', () => {
  it('is full over the middle of the field, nothing at its edge and beyond, and never rises on the way out', () => {
    const half = 40;
    expect(edgeFade(0, half, cfg.edgeFade)).toBe(1);
    expect(edgeFade(half * (1 - cfg.edgeFade) - 0.01, half, cfg.edgeFade)).toBe(1);
    expect(edgeFade(half, half, cfg.edgeFade)).toBe(0);
    expect(edgeFade(half * 1.4, half, cfg.edgeFade)).toBe(0);
    let before = 1;
    for (let distance = 0; distance <= half; distance += 0.5) {
      const now = edgeFade(distance, half, cfg.edgeFade);
      expect(now).toBeLessThanOrEqual(before);
      before = now;
    }
    expect(edgeFade(half * (1 - cfg.edgeFade / 2), half, cfg.edgeFade)).toBeCloseTo(0.5, 6);
  });
});

describe('bladeLength: long meadow, short turf, and a mown strip beside the road', () => {
  it('grows long on lush ground and short on dry, more or less by each blade s own share', () => {
    for (const share of [0, 0.5, 0.999]) {
      const lush = bladeLength(0, reach, share, cfg);
      const dry = bladeLength(1, reach, share, cfg);
      expect(lush).toBeGreaterThan(dry * 1.8);
      expect(lush).toBeGreaterThanOrEqual(cfg.meadow[0]);
      expect(lush).toBeLessThanOrEqual(cfg.meadow[1]);
      expect(dry).toBeGreaterThanOrEqual(cfg.turf[0]);
      expect(dry).toBeLessThanOrEqual(cfg.turf[1]);
    }
    expect(bladeLength(0, reach, 0.9, cfg)).toBeGreaterThan(bladeLength(0, reach, 0.1, cfg));
    expect(bladeLength(0, reach, 0, cfg)).toBeCloseTo(cfg.meadow[0], 6);
    expect(bladeLength(1, reach, 0, cfg)).toBeCloseTo(cfg.turf[0], 6);
  });

  it('passes from meadow to turf between the configured values of the variation, never getting longer as the ground dries', () => {
    expect(bladeLength(cfg.meadowBlend[0] - 0.01, reach, 0.5, cfg)).toBeCloseTo(bladeLength(0, reach, 0.5, cfg), 6);
    expect(bladeLength(cfg.meadowBlend[1] + 0.01, reach, 0.5, cfg)).toBeCloseTo(bladeLength(1, reach, 0.5, cfg), 6);
    let before = Infinity;
    for (let variation = 0; variation <= 1; variation += 0.02) {
      const now = bladeLength(variation, reach, 0.5, cfg);
      expect(now).toBeLessThanOrEqual(before);
      before = now;
    }
  });

  it('is never taller than the mown height inside the strip, however lush the ground', () => {
    for (const variation of [0, 0.3, 0.7, 1]) {
      for (let roadside = 0; roadside <= cfg.mown.width; roadside += 0.5) {
        for (const share of [0, 0.5, 0.999]) expect(bladeLength(variation, roadside, share, cfg)).toBeLessThanOrEqual(cfg.mown.height + 1e-9);
      }
    }
  });

  it('grows back to its full length over the stretch beyond the strip, never getting shorter on the way', () => {
    const full = bladeLength(0, reach, 0.5, cfg);
    expect(bladeLength(0, cfg.mown.width + cfg.mown.ease, 0.5, cfg)).toBeCloseTo(full, 6);
    let before = 0;
    for (let roadside = 0; roadside <= reach; roadside += 0.25) {
      const now = bladeLength(0, roadside, 0.5, cfg);
      expect(now).toBeGreaterThanOrEqual(before - 1e-9);
      before = now;
    }
    const halfWay = bladeLength(0, cfg.mown.width + cfg.mown.ease / 2, 0.5, cfg);
    expect(halfWay).toBeGreaterThan(cfg.mown.height * 1.5);
    expect(halfWay).toBeLessThan(full * 0.8);
  });
});

describe('bladeLives: a blade stands where its number is under the grass cover', () => {
  it('never stands where there is no grass, always where the cover is full, and by its number in between', () => {
    for (const rank of [0, 0.2, 0.5, 0.999]) {
      expect(bladeLives(rank, 0)).toBe(false);
      expect(bladeLives(rank, 1)).toBe(true);
    }
    expect(bladeLives(0.3, 0.5)).toBe(true);
    expect(bladeLives(0.7, 0.5)).toBe(false);
  });
});

describe('sway: the wind in the grass', () => {
  const next = numbers(31);
  const windLength = Math.hypot(wind[0], wind[1]);
  const down = { x: wind[0] / windLength, z: wind[1] / windLength };

  it('pushes a tip down the wind by no more than a gust and a flutter, and back by no more than a flutter', () => {
    let lowest = Infinity;
    let highest = -Infinity;
    for (let k = 0; k < 5000; k++) {
      const push = sway((next() - 0.5) * 2000, (next() - 0.5) * 2000, next() * TAU, next() * 600, wind, cfg.sway);
      lowest = Math.min(lowest, push);
      highest = Math.max(highest, push);
    }
    expect(lowest).toBeGreaterThanOrEqual(-cfg.sway.flutter - 1e-9);
    expect(highest).toBeLessThanOrEqual(cfg.sway.gust + cfg.sway.flutter + 1e-9);
    // It really moves: most of that range is used.
    expect(highest - lowest).toBeGreaterThan((cfg.sway.gust + 2 * cfg.sway.flutter) * 0.8);
  });

  it('is the same at the same moment, and moves on with time', () => {
    expect(sway(12, -40, 1.3, 7.5, wind, cfg.sway)).toBe(sway(12, -40, 1.3, 7.5, wind, cfg.sway));
    let moved = 0;
    for (let k = 0; k < 200; k++) {
      const [x, z, phase] = [(next() - 0.5) * 500, (next() - 0.5) * 500, next() * TAU];
      if (Math.abs(sway(x, z, phase, 3, wind, cfg.sway) - sway(x, z, phase, 3.4, wind, cfg.sway)) > 0.01) moved++;
    }
    expect(moved).toBeGreaterThan(180);
  });

  it('flutters neighbouring blades out of step', () => {
    let apart = 0;
    for (let k = 0; k < 200; k++) {
      const seconds = next() * 100;
      if (Math.abs(sway(10, 10, 0.4, seconds, wind, cfg.sway) - sway(10, 10, 0.4 + Math.PI / 2, seconds, wind, cfg.sway)) > 0.02) apart++;
    }
    expect(apart).toBeGreaterThan(150);
  });

  it('sends its gusts down the wind at their speed', () => {
    // With the flutter stilled, what a place feels now, a place downwind feels when the gust has got there.
    const gustsOnly = { ...cfg.sway, flutter: 0 };
    for (let k = 0; k < 100; k++) {
      const [x, z, seconds] = [(next() - 0.5) * 800, (next() - 0.5) * 800, next() * 60];
      const later = 2.5;
      const travelled = cfg.sway.gustSpeed * later;
      expect(sway(x + down.x * travelled, z + down.z * travelled, 0, seconds + later, wind, gustsOnly)).toBeCloseTo(sway(x, z, 0, seconds, wind, gustsOnly), 6);
    }
    // Across the wind a gust arrives everywhere at once.
    expect(sway(down.z * 90, -down.x * 90, 0, 4, wind, gustsOnly)).toBeCloseTo(sway(0, 0, 0, 4, wind, gustsOnly), 6);
    // Gusts come and go: over one gust length the push runs from nothing to the whole gust.
    let lowest = Infinity;
    let highest = -Infinity;
    for (let along = 0; along <= cfg.sway.gustLength; along += 1) {
      const push = sway(down.x * along, down.z * along, 0, 0, wind, gustsOnly);
      lowest = Math.min(lowest, push);
      highest = Math.max(highest, push);
    }
    expect(lowest).toBeLessThan(cfg.sway.gust * 0.01);
    expect(highest).toBeGreaterThan(cfg.sway.gust * 0.99);
  });
});

describe('bladeAt: the whole field for a camera, on an open meadow', () => {
  const land = meadow();
  const eye = eyeAt(0);
  const all = field(eye, land);
  const far = cfg.tiers[cfg.tiers.length - 1]!;
  const fromEye = (blade: Blade): number => Math.hypot(blade.x - eye.x, blade.z - eye.z);
  /** Blades standing in a wedge a quarter turn wide straight ahead of the camera, between two distances from it. */
  const ahead = (from: number, to: number, list: Blade[] = all): Blade[] =>
    list.filter((blade) => {
      const distance = fromEye(blade);
      return blade.height > 0.02 && distance >= from && distance < to && blade.x - eye.x > Math.abs(blade.z - eye.z);
    });
  const wedge = (from: number, to: number): number => (Math.PI / 4) * (to * to - from * from);

  it('stands every blade on the ground, sunk a little, at its place in its field', () => {
    for (let i = 0; i < all.length; i += 37) {
      const blade = all[i]!;
      expect(blade.y).toBeCloseTo(5 - cfg.sink, 5);
      const tier = blades.tiers[blade.tier]!;
      const centre = fieldCentre(eye, tier.half, cfg.ahead);
      expect(Math.abs(blade.x - centre.x)).toBeLessThanOrEqual(tier.half + 1e-4);
      expect(Math.abs(blade.z - centre.z)).toBeLessThanOrEqual(tier.half + 1e-4);
    }
  });

  it('reaches about 120 m ahead and no further', () => {
    const limit = far.half * (1 + cfg.ahead);
    let furthest = 0;
    for (const blade of all) if (blade.height > 0.02) furthest = Math.max(furthest, fromEye(blade));
    expect(furthest).toBeLessThanOrEqual(limit);
    expect(furthest).toBeGreaterThan(limit * 0.85);
    expect(ahead(100, limit).length).toBeGreaterThan(50);
  });

  it('thins with distance: many blades to the square metre close by, few far off', () => {
    const near = ahead(2, 14).length / wedge(2, 14);
    const middle = ahead(28, 44).length / wedge(28, 44);
    const distant = ahead(70, 100).length / wedge(70, 100);
    expect(near).toBeGreaterThan(8);
    expect(middle).toBeLessThan(near / 2);
    expect(middle).toBeGreaterThan(distant * 1.5);
    expect(distant).toBeLessThan(2);
    expect(distant).toBeGreaterThan(0.3);
  });

  it('makes far blades wider, so the ground they cover falls off more slowly than their number', () => {
    const cover = (from: number, to: number): number => ahead(from, to).reduce((sum, blade) => sum + blade.width, 0) / wedge(from, to);
    const count = (from: number, to: number): number => ahead(from, to).length / wedge(from, to);
    expect(cover(2, 14) / cover(70, 100)).toBeLessThan((count(2, 14) / count(70, 100)) * 0.5);
    const widths = (from: number, to: number): number => cover(from, to) / count(from, to);
    expect(widths(70, 100)).toBeGreaterThan(widths(28, 44));
    expect(widths(28, 44)).toBeGreaterThan(widths(2, 14));
  });

  it('leaves no bare band between one field and the next', () => {
    const limit = far.half * (1 + cfg.ahead);
    for (let from = 0; from < limit - 15; from += 5) {
      const band = ahead(from, from + 5).filter((blade) => blade.height > cfg.meadow[0] * 0.3);
      // At least one good blade to every four square metres, right out to the last stretch.
      expect(band.length / wedge(from, from + 5)).toBeGreaterThan(0.25);
    }
  });

  it('keeps the wide far blades away from the camera, where the fine ones stand', () => {
    const close = all.filter((blade) => blade.height > 0.02 && Math.hypot(blade.x - (eye.x + 8), blade.z - eye.z) < 5);
    expect(close.length).toBeGreaterThan(500);
    for (const blade of close) expect(blade.tier).toBe(0);
    for (const blade of close) expect(blade.width).toBeLessThanOrEqual(cfg.tiers[0]!.width + 1e-9);
  });

  it('gives every standing blade a height in the meadow s range and a width near its field s', () => {
    for (const blade of all) {
      if (!blade.lives) continue;
      expect(blade.height).toBeLessThanOrEqual(cfg.meadow[1] + 1e-6);
      expect(blade.width).toBeLessThanOrEqual(blades.tiers[blade.tier]!.width + 1e-9);
      if (blade.height > 0.02) expect(blade.width).toBeGreaterThan(blades.tiers[blade.tier]!.width * 0.5);
      else expect(blade.width).toBe(0);
    }
    const core = ahead(4, 12);
    const mean = core.reduce((sum, blade) => sum + blade.height, 0) / core.length;
    expect(mean).toBeGreaterThan((cfg.meadow[0] + cfg.meadow[1]) / 2 - 0.05);
    expect(mean).toBeLessThan((cfg.meadow[0] + cfg.meadow[1]) / 2 + 0.05);
  });

  it('never pops: a blade has shrunk to nothing when it jumps from the edge behind to the edge ahead', () => {
    const picked: number[] = [];
    for (let i = 0; i < blades.count; i += 211) picked.push(i);
    let before = picked.map((i) => bladeAt(blades, i, eyeAt(-150), land.grid, land.ground, 0, cfg, wind));
    let jumps = 0;
    for (let x = -150 + 0.5; x <= 150; x += 0.5) {
      const now = picked.map((i) => bladeAt(blades, i, eyeAt(x), land.grid, land.ground, 0, cfg, wind));
      now.forEach((blade, k) => {
        const was = before[k]!;
        if (blade.x === was.x && blade.z === was.z) return;
        jumps++;
        expect(Math.abs(blade.x - was.x)).toBeCloseTo(2 * blades.tiers[blade.tier]!.half, 3);
        expect(was.height).toBeLessThan(0.03);
        expect(blade.height).toBeLessThan(0.03);
      });
      before = now;
    }
    expect(jumps).toBeGreaterThan(picked.length);
  });

  it('never pops when the camera turns either: a blade that moves has shrunk to nothing', () => {
    const picked: number[] = [];
    for (let i = 0; i < blades.count; i += 211) picked.push(i);
    const turned = (angle: number): GrassEye => grassEye({ x: 0, y: 9, z: 0 }, { x: Math.cos(angle) * 30, y: 9, z: Math.sin(angle) * 30 });
    let before = picked.map((i) => bladeAt(blades, i, turned(0), land.grid, land.ground, 0, cfg, wind));
    let jumps = 0;
    for (let angle = 0.004; angle <= TAU; angle += 0.004) {
      const now = picked.map((i) => bladeAt(blades, i, turned(angle), land.grid, land.ground, 0, cfg, wind));
      now.forEach((blade, k) => {
        const was = before[k]!;
        if (blade.x === was.x && blade.z === was.z) return;
        jumps++;
        expect(was.height).toBeLessThan(0.03);
        expect(blade.height).toBeLessThan(0.03);
      });
      before = now;
    }
    expect(jumps).toBeGreaterThan(50);
  });

  it('moves only the tips in the wind: feet stay put, tips stay within a gust and a flutter of upright', () => {
    const still = field(eye, land, 0, 53);
    const later = field(eye, land, 1.7, 53);
    const most = cfg.sway.gust + cfg.sway.flutter;
    let moved = 0;
    still.forEach((blade, k) => {
      const then = later[k]!;
      expect(then.x).toBe(blade.x);
      expect(then.y).toBe(blade.y);
      expect(then.z).toBe(blade.z);
      expect(then.height).toBe(blade.height);
      for (const b of [blade, then]) {
        expect(Math.hypot(b.tipX - b.x, b.tipZ - b.z)).toBeLessThanOrEqual(b.height * most + b.width + 1e-6);
        expect(b.tipY).toBeLessThanOrEqual(b.y + b.height * (1 + cfg.sway.flutter) + 1e-6);
        expect(b.tipY).toBeGreaterThanOrEqual(b.y + b.height * 0.7 - 1e-6);
      }
      if (blade.height > 0.2 && Math.hypot(then.tipX - blade.tipX, then.tipZ - blade.tipZ) > 0.005) moved++;
    });
    expect(moved).toBeGreaterThan(still.filter((blade) => blade.height > 0.2).length * 0.8);
  });

  it('stands the same at the same moment', () => {
    const again = field(eye, land, 4.2, 97);
    expect(field(eye, land, 4.2, 97)).toEqual(again);
  });

  it('is short turf on dry ground and mown short beside the road', () => {
    const dry = field(eye, meadow({ variation: 255 }), 0, 11).filter((blade) => blade.height > 0.02 && fromEye(blade) < 12);
    expect(dry.length).toBeGreaterThan(100);
    for (const blade of dry) expect(blade.height).toBeLessThanOrEqual(cfg.turf[1] + 1e-6);
    // Lush ground, but 3 m from the road edge all over.
    const mown = field(eye, meadow({ roadside: Math.round((3 / reach) * 255) }), 0, 11).filter((blade) => blade.lives);
    expect(mown.length).toBeGreaterThan(1000);
    for (const blade of mown) expect(blade.height).toBeLessThanOrEqual(cfg.mown.height + 1e-6);
  });

  it('flowers only blades that can, only long ones, and only inside a flower patch', () => {
    const bare = all.filter((blade) => blade.flower > 0);
    expect(bare).toHaveLength(0);

    const inPatch = field(eye, meadow({ flowers: 255 }));
    let flowering = 0;
    let standing = 0;
    inPatch.forEach((blade, i) => {
      if (blade.height > 0.02) standing++;
      if (blade.flower === 0) return;
      // Counted among the blades that stand, to compare like with like: a blade faded to nothing still carries its flower.
      if (blade.height > 0.02) flowering++;
      expect(blade.flower).toBe(blades.flower[i]);
      expect(blade.lives).toBe(true);
      expect(bladeLength(0, reach, blades.trait[i * 4 + 1]!, cfg)).toBeGreaterThanOrEqual(cfg.flowers.minLength);
    });
    expect(flowering / standing).toBeGreaterThan(cfg.flowers.share * 0.5);
    expect(flowering / standing).toBeLessThan(cfg.flowers.share * 1.2);

    // None on turf or in the mown strip, patch or no patch.
    expect(field(eye, meadow({ flowers: 255, variation: 255 }), 0, 7).filter((blade) => blade.flower > 0)).toHaveLength(0);
    expect(field(eye, meadow({ flowers: 255, roadside: 0 }), 0, 7).filter((blade) => blade.flower > 0)).toHaveLength(0);
  });
});

describe('the grass on a real island (seed 7)', () => {
  const world = generateWorld(7, config);
  const { ground, cover } = world;
  const winner = world.track.candidates[world.track.winnerIndex]!;
  const grid = grassGrid(world, cfg);
  /** Distance from every cell to the road edge, as the island works it out. */
  const edge = edgeDistance(nearestRoad(winner.line, ground), world.road.width);

  it('puts every foot on the drawn ground: the same height as the ground mesh s triangle under it, to a millimetre', () => {
    const chunks = buildTerrainChunks(ground, cover, { chunkCells: config.render.chunkCells, skipBelow: -Infinity });
    const next = numbers(5);
    let checked = 0;
    while (checked < 500) {
      const chunk = chunks[Math.floor(next() * chunks.length)]!;
      const t = Math.floor(next() * (chunk.indices.length / 3)) * 3;
      const corner = (k: number): [number, number, number] => {
        const v = chunk.indices[t + k]! * 3;
        return [chunk.positions[v]!, chunk.positions[v + 1]!, chunk.positions[v + 2]!];
      };
      const [a, b, c] = [corner(0), corner(1), corner(2)];
      // A point inside the triangle.
      let u = next();
      let v = next();
      if (u + v > 1) [u, v] = [1 - u, 1 - v];
      const x = a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v;
      const y = a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v;
      const z = a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v;
      expect(Math.abs(groundHeightAt(ground, x, z) - y)).toBeLessThan(0.001);
      checked++;
    }
  });

  it('grows nothing on the road, in the sea, on bare sand, rock or snow, wherever the camera is', () => {
    let standing = 0;
    let onRoad = 0;
    let wet = 0;
    let barren = 0;
    for (let s = 0; s < winner.line.count; s += 90) {
      const height = winner.profile.height[s]! + config.camera.fly.height;
      const eye = grassEye(
        { x: winner.line.x[s]!, y: height, z: winner.line.z[s]! },
        { x: winner.line.x[s]! + winner.line.tx[s]! * 30, y: height - 3, z: winner.line.z[s]! + winner.line.tz[s]! * 30 },
      );
      for (let i = 0; i < blades.count; i += 5) {
        const blade = bladeAt(blades, i, eye, grid, ground, 0, cfg, wind);
        if (blade.height <= 0) continue;
        standing++;
        if (sampleGrid(ground, edge, blade.x, blade.z, 99) < -0.5) onRoad++;
        // A foot is sunk a little; none stands lower than the shore s limit.
        if (blade.y < cfg.dry - cfg.sink) wet++;
        const covered = (values: Uint8Array): number => sampleGrid(ground, values, blade.x, blade.z, 0) / 255;
        if (covered(cover.grass) <= 0 || covered(cover.sand) >= 0.999 || covered(cover.rock) >= 0.999 || covered(cover.snow) >= 0.999) barren++;
      }
    }
    expect(standing).toBeGreaterThan(20_000);
    expect(onRoad).toBe(0);
    expect(wet).toBe(0);
    expect(barren).toBe(0);
  });

  it('stands thick where the cover is full and thin where it is thin', () => {
    const next = numbers(77);
    const eye = grassEye({ x: 0, y: 500, z: 0 }, { x: 0, y: 0, z: 0 });
    let full = 0;
    let fullLiving = 0;
    let part = 0;
    let partLiving = 0;
    let none = 0;
    for (let k = 0; k < 60_000; k++) {
      const x = (next() - 0.5) * 2000;
      const z = (next() - 0.5) * 2000;
      const covered = sampleGrid(ground, cover.grass, x, z, 0) / 255;
      const lives = bladeLives(blades.trait[(k % blades.count) * 4 + 3]!, covered);
      if (covered >= 0.999) {
        full++;
        if (lives) fullLiving++;
      } else if (covered > 0.3 && covered < 0.7) {
        part++;
        if (lives) partLiving++;
      } else if (covered <= 0 && lives) none++;
    }
    expect(eye.y).toBe(500);
    expect(full).toBeGreaterThan(1000);
    expect(part).toBeGreaterThan(100);
    expect(fullLiving).toBe(full);
    expect(partLiving / part).toBeGreaterThan(0.3);
    expect(partLiving / part).toBeLessThan(0.7);
    expect(none).toBe(0);
  });

  it('is mown short beside the road and long further out, with flowers in some places and not others', () => {
    let nearCount = 0;
    let tallest = 0;
    let longCount = 0;
    let flowers = 0;
    let lushAway = 0;
    for (let s = 0; s < winner.line.count; s += 45) {
      const height = winner.profile.height[s]! + config.camera.fly.height;
      const eye = grassEye(
        { x: winner.line.x[s]!, y: height, z: winner.line.z[s]! },
        { x: winner.line.x[s]! + winner.line.tx[s]! * 30, y: height, z: winner.line.z[s]! + winner.line.tz[s]! * 30 },
      );
      for (let i = 0; i < blades.count; i += 9) {
        const blade = bladeAt(blades, i, eye, grid, ground, 0, cfg, wind);
        if (!blade.lives) continue;
        const beyond = sampleGrid(ground, edge, blade.x, blade.z, 99);
        if (beyond < cfg.mown.width - 2) {
          nearCount++;
          tallest = Math.max(tallest, blade.height);
        } else if (beyond > reach + 4) {
          if (blade.height > cfg.meadow[0]) longCount++;
          if (blade.flower > 0) flowers++;
          lushAway++;
        }
      }
    }
    expect(nearCount).toBeGreaterThan(2000);
    // Two metres inside the strip s edge allows for the map s 3 m cells.
    expect(tallest).toBeLessThanOrEqual(cfg.mown.height + 0.02);
    expect(lushAway).toBeGreaterThan(5000);
    // Meadow is the lusher part of the island s grass, and only its blades in the middle of their field stand at full length.
    expect(longCount).toBeGreaterThan(lushAway * 0.03);
    expect(flowers).toBeGreaterThan(10);
    expect(flowers).toBeLessThan(lushAway * cfg.flowers.share);
  });
});

describe('grassGlsl: the same sums for the shader', () => {
  const text = grassGlsl(cfg, wind);
  /** The shader text without its comments. */
  const code = text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

  it('defines the one function the grass material calls', () => {
    expect(code).toMatch(/vec3\s+grassVertex\s*\(/);
  });

  it('uses no word the shader language keeps for itself (a shader that fails to compile draws nothing)', () => {
    const reserved = [
      'patch', 'sample', 'half', 'input', 'output', 'filter', 'flat', 'common', 'active', 'fixed', 'long', 'short', 'double',
      'packed', 'inline', 'noinline', 'static', 'public', 'class', 'union', 'enum', 'this', 'using', 'cast', 'namespace',
      'extern', 'external', 'interface', 'resource', 'goto', 'template', 'typedef', 'unsigned', 'superp', 'sizeof',
      'volatile', 'partition', 'asm', 'smooth', 'centroid', 'layout', 'precise',
    ];
    for (const word of reserved) expect(code).not.toMatch(new RegExp(`\\b${word}\\b`));
  });

  it('carries the settings it was written from', () => {
    const number = (value: number): string => (Number.isInteger(value) ? `${value}.0` : String(value));
    for (const value of [
      cfg.ahead, cfg.turf[0], cfg.turf[1], cfg.meadow[0], cfg.meadow[1], cfg.meadowBlend[0], cfg.meadowBlend[1],
      cfg.mown.height, cfg.mown.width, cfg.flowers.minLength, cfg.sway.gust, cfg.sway.flutter, cfg.sway.gustSpeed,
      cfg.sway.flutterSpeed, cfg.sink, cfg.dry,
    ]) {
      expect(code).toContain(number(value));
    }
    const other = grassGlsl({ ...cfg, sink: 0.123, mown: { ...cfg.mown, height: 0.077 } }, wind);
    expect(other).toContain('0.123');
    expect(other).toContain('0.077');
    expect(other).not.toBe(text);
  });

  it('blows down the wind it is given', () => {
    const length = Math.hypot(wind[0], wind[1]);
    expect(code).toContain(String(wind[0] / length));
    expect(grassGlsl(cfg, [0, 1])).not.toBe(text);
  });
});
