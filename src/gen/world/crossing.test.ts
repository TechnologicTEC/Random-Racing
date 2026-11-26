import { beforeAll, describe, expect, it } from 'vitest';
import { config, type GenConfig } from '../../config';
import { pathLine } from '../../testing/trackFixtures';
import { placeLapGates } from '../road/lapGates';
import { solveWidth } from '../road/width';
import { generateTrack } from '../track/pipeline';
import type { BridgeSpan, CenterLine, Crossing, CrossingPoint } from '../types';
import { chooseCrossing, type CrossingInput } from './crossing';
import { createField, sampleField, sampleGrid, worldZ } from './heightfield';
import { buildIsland } from './island';
import { insideLoop } from './nearest';

/**
 * M6.1d-1 (Tane, 2026-11-26): about half the seeds get one crossing a lap, a channel carved across the road so the
 * road there becomes a bridge: an inlet of the sea, a river to the sea, a dry ravine, or a river high in the hills.
 */
const rules = config.world.crossings;
const withChance = (chance: number): GenConfig => ({ ...config, world: { ...config.world, crossings: { ...rules, chance } } });
const always = withChance(1);
const never = withChance(0);
const SEEDS = Array.from({ length: 16 }, (_, k) => k + 1);

/**
 * A stadium of two 700 m straights `tall` metres apart, joined by corners of 100 m radius and short straights, the
 * line starting at the top straight's right end. The bottom straight runs along z = -tall / 2 from x = -400 to 300.
 */
function stadium(tall: number): CenterLine {
  const corner = { arc: 100, degrees: 90, turn: 'right' } as const;
  return pathLine({ x: 300, z: tall / 2 }, 180, [{ straight: 700 }, corner, { straight: tall - 200 }, corner, { straight: 700 }, corner, { straight: tall - 200 }, corner]);
}

interface Synth {
  tall?: number;
  /** The road's height all round, and the flat ground's. */
  road?: number;
  /** With the sea 40 m beyond the bottom straight, outside the loop. */
  sea?: boolean;
  bridges?: BridgeSpan[];
  lapGates?: number[];
  /** The bottom straight `road` high at its middle (x = -50) and climbing 8% each way, the rest of the road 8 m up. */
  vee?: boolean;
}

const made = new Map<string, CrossingInput>();
/** A flat island round the stadium, its road and its ground both `road` high. */
function synth(o: Synth = {}): CrossingInput {
  const key = JSON.stringify(o);
  const known = made.get(key);
  if (known) return known;
  const { tall = 500, road = 8, sea = false } = o;
  const line = stadium(tall);
  const bottom = -tall / 2;
  const natural = createField(1500, 3);
  const cap = new Float32Array(natural.height.length);
  for (let iz = 0; iz < natural.size; iz++) {
    for (let ix = 0; ix < natural.size; ix++) {
      const c = iz * natural.size + ix;
      const wet = sea && worldZ(natural, iz) < bottom - 40;
      natural.height[c] = wet ? -10 : road;
      cap[c] = wet ? -10 : 60;
    }
  }
  const seaside = new Uint8Array(line.count);
  if (sea) for (let i = 0; i < line.count; i++) if (Math.abs(line.z[i]! - bottom) < 0.5 && line.x[i]! >= -400 && line.x[i]! <= 300) seaside[i] = 1;
  const height = new Float64Array(line.count).fill(road);
  if (o.vee) for (let i = 0; i < line.count; i++) height[i] = Math.abs(line.z[i]! - bottom) < 0.5 ? road + 0.08 * Math.abs(line.x[i]! + 50) : 8;
  const input: CrossingInput = {
    line,
    height,
    width: new Float64Array(line.count).fill(12),
    bridges: o.bridges ?? [],
    lapGates: o.lapGates ?? [],
    island: { natural, cap, inside: insideLoop(line, natural), seaside },
  };
  made.set(key, input);
  return input;
}

const crossingsOf = (input: CrossingInput, cfg = always, seeds = SEEDS): Crossing[] =>
  seeds.map((seed) => chooseCrossing(seed, input, cfg)).filter((c): c is Crossing => c !== null);

/** Metres round the lap between two samples, the short way. */
const apart = (a: number, b: number, line: CenterLine): number => {
  const d = Math.abs(a - b) % line.count;
  return Math.min(d, line.count - d) * line.spacing;
};

const samplesOf = (span: BridgeSpan, n: number): number[] => Array.from({ length: span.sampleCount }, (_, k) => (span.startIndex + k) % n);

const between = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

/** The index of the path's point under the road's centre at the crossing's sample. */
function siteIndex(crossing: Crossing, line: CenterLine): number {
  const road = { x: line.x[crossing.sample]!, z: line.z[crossing.sample]! };
  let best = 0;
  crossing.path.forEach((p, k) => {
    if (between(p, road) < between(crossing.path[best]!, road)) best = k;
  });
  return best;
}

/** Metres along the path from point `from` to point `to`. */
function along(path: readonly CrossingPoint[], from: number, to: number): number {
  let total = 0;
  for (let k = Math.min(from, to); k < Math.max(from, to); k++) total += between(path[k]!, path[k + 1]!);
  return total;
}

/** The reach and the lap's bridges keep `mergeGap` apart, or join into one no longer than the longest bridge. */
function keepsClearOfBridges(crossing: Crossing, input: CrossingInput): void {
  const n = input.line.count;
  const { mergeGap, maxLength } = config.road.bridges;
  for (const bridge of input.bridges) {
    const mine = new Set(samplesOf(crossing.reach, n));
    const theirs = samplesOf(bridge, n);
    const endMine = (crossing.reach.startIndex + crossing.reach.sampleCount - 1) % n;
    const endTheirs = (bridge.startIndex + bridge.sampleCount - 1) % n;
    const gapAfter = (bridge.startIndex - endMine + n) % n;
    const gapBefore = (crossing.reach.startIndex - endTheirs + n) % n;
    const overlaps = theirs.some((i) => mine.has(i));
    const gap = Math.min(gapAfter, gapBefore);
    if (!overlaps && gap * input.line.spacing >= mergeGap) continue;
    // Joined: the two and the road between them, the short way.
    const joined = new Set([...mine, ...theirs]);
    if (!overlaps) {
      const [from, count] = gapAfter <= gapBefore ? [endMine, gapAfter] : [endTheirs, gapBefore];
      for (let k = 1; k < count; k++) joined.add((from + k) % n);
    }
    expect((joined.size - 1) * input.line.spacing, `joined with the bridge at ${bridge.startIndex}`).toBeLessThanOrEqual(maxLength);
  }
}

/** The site's rules: the reach clear of the line and the gates, on road no tighter than `minRadius`, clear of the bridges. */
function keepsSiteRules(crossing: Crossing, input: CrossingInput, label: string): void {
  const { line } = input;
  for (const i of samplesOf(crossing.reach, line.count)) {
    expect(apart(i, 0, line), `${label}: sample ${i} from the line`).toBeGreaterThanOrEqual(rules.startClear);
    for (const gate of input.lapGates) expect(apart(i, gate, line), `${label}: sample ${i} from the gate at ${gate}`).toBeGreaterThanOrEqual(rules.gateClear);
    expect(Math.abs(line.curvature[i]!), `${label}: the curve at sample ${i}`).toBeLessThanOrEqual(1 / rules.minRadius + 1e-9);
  }
  expect(samplesOf(crossing.reach, line.count)).toContain(crossing.sample);
  keepsClearOfBridges(crossing, input);
}

/** No point of the path comes within `clear` (and its bank up to that road's height) of road well along the lap from the site. */
function keepsClearOfOtherRoad(crossing: Crossing, input: CrossingInput, label: string): void {
  const { line } = input;
  const slope = crossing.kind === 'inlet' || crossing.kind === 'river' ? rules.bankSlope.water : rules.bankSlope.ravine;
  for (const p of crossing.path) {
    for (let j = 0; j < line.count; j++) {
      if (apart(j, crossing.sample, line) <= 250) continue;
      const room = Math.hypot(p.x - line.x[j]!, p.z - line.z[j]!) - input.width[j]! / 2;
      const needed = p.half + rules.clear + Math.max(0, input.height[j]! - p.floor) / slope;
      expect(room, `${label}: (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) near sample ${j}`).toBeGreaterThanOrEqual(needed - 1e-6);
    }
  }
}

/** Each point within `step` of the last. */
function keepsTogether(crossing: Crossing): void {
  for (let k = 1; k < crossing.path.length; k++) {
    const gap = between(crossing.path[k - 1]!, crossing.path[k]!);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThanOrEqual(rules.step + 1e-6);
  }
}

describe('choosing a crossing (chooseCrossing, M6.1d-1)', () => {
  it('rolls world.crossings.chance first: none at 0, and one on every seed at 1 where a site fits', () => {
    const input = synth({ sea: true });
    for (const seed of SEEDS) {
      expect(chooseCrossing(seed, input, never), `seed ${seed}`).toBeNull();
      expect(chooseCrossing(seed, input, always), `seed ${seed}`).not.toBeNull();
    }
  });

  it('crosses a seaside road 6 to 14 m up with an inlet or a river, both kinds turning up', () => {
    const input = synth({ sea: true });
    const crossings = crossingsOf(input);
    expect(crossings).toHaveLength(SEEDS.length);
    for (const c of crossings) {
      expect(['inlet', 'river']).toContain(c.kind);
      expect(input.island.seaside[c.sample]).toBe(1);
    }
    expect(new Set(crossings.map((c) => c.kind))).toEqual(new Set(['inlet', 'river']));
  });

  it('gives a seaside road too low to need a bridge over the water nothing, and one over 14 m up a ravine', () => {
    expect(crossingsOf(synth({ sea: true, road: 3 }))).toHaveLength(0);
    const high = crossingsOf(synth({ sea: true, road: 16 }));
    expect(high).toHaveLength(SEEDS.length);
    for (const c of high) expect(c.kind).toBe('ravine');
  });

  it('crosses a high inland road with a ravine from 12 m up, and a hill river too from 25 m up', () => {
    expect(crossingsOf(synth({ road: 8 }))).toHaveLength(0);
    for (const c of crossingsOf(synth({ road: 18 }))) expect(c.kind).toBe('ravine');
    const high = crossingsOf(synth({ road: 40 }));
    expect(high).toHaveLength(SEEDS.length);
    expect(new Set(high.map((c) => c.kind))).toEqual(new Set(['ravine', 'hillRiver']));
  });

  it(`keeps the road its bridge covers ${rules.startClear} m from the line and ${rules.gateClear} m from every lap gate, on road no tighter than ${rules.minRadius} m`, () => {
    const input = synth({ road: 18, lapGates: [200, 600, 900] });
    const crossings = crossingsOf(input);
    expect(crossings).toHaveLength(SEEDS.length);
    for (const c of crossings) {
      keepsSiteRules(c, input, `seed ${c.kind} at ${c.sample}`);
      // The reach covers at least the floor's width.
      const site = c.path[siteIndex(c, input.line)]!;
      expect((c.reach.sampleCount - 1) * input.line.spacing).toBeGreaterThanOrEqual(2 * site.half);
    }
  });

  it('finds no crossing when every stretch that fits one is near a lap gate', () => {
    // Only the bottom straight (samples 657 to 1007) has the sea beside it; a gate every 80 m along it.
    const lapGates = Array.from({ length: 11 }, (_, k) => 630 + 40 * k);
    expect(crossingsOf(synth({ sea: true, lapGates }))).toHaveLength(0);
  });

  it(`keeps clear of the lap's bridges, unless joined into one no longer than ${config.road.bridges.maxLength} m`, () => {
    for (const bridges of [[{ startIndex: 780, sampleCount: 60 }], [{ startIndex: 700, sampleCount: 110 }, { startIndex: 900, sampleCount: 40 }]]) {
      const input = synth({ sea: true, bridges });
      const crossings = crossingsOf(input);
      expect(crossings.length).toBeGreaterThan(0);
      for (const c of crossings) keepsClearOfBridges(c, input);
    }
  });

  it('runs an inlet from the open sea under the road into a cove 40 to 120 m in, 30 to 80 m wide, its floor 1.5 to 2.5 m under the sea', () => {
    const input = synth({ sea: true });
    const inlets = crossingsOf(input, always, Array.from({ length: 30 }, (_, k) => k + 1)).filter((c) => c.kind === 'inlet');
    expect(inlets.length).toBeGreaterThan(3);
    for (const c of inlets) {
      keepsTogether(c);
      expect(sampleGrid(input.island.natural, input.island.cap, c.path[0]!.x, c.path[0]!.z, 0)).toBeLessThanOrEqual(0);
      const k0 = siteIndex(c, input.line);
      expect(between(c.path[k0]!, { x: input.line.x[c.sample]!, z: input.line.z[c.sample]! })).toBeLessThan(1e-6);
      const inward = along(c.path, k0, c.path.length - 1) - input.width[c.sample]! / 2;
      expect(inward).toBeGreaterThanOrEqual(rules.inlet.length[0] - rules.step);
      expect(inward).toBeLessThanOrEqual(rules.inlet.length[1]);
      for (const p of c.path) {
        expect(p.half).toBe(c.path[0]!.half);
        expect(p.floor).toBe(c.path[0]!.floor);
        // Straight across the road.
        const off = (p.x - c.path[k0]!.x) * c.across.z - (p.z - c.path[k0]!.z) * c.across.x;
        expect(Math.abs(off)).toBeLessThan(1e-6);
      }
      expect(2 * c.path[0]!.half).toBeGreaterThanOrEqual(rules.inlet.width[0]);
      expect(2 * c.path[0]!.half).toBeLessThanOrEqual(rules.inlet.width[1]);
      expect(-c.path[0]!.floor).toBeGreaterThanOrEqual(rules.water.bed[0]);
      expect(-c.path[0]!.floor).toBeLessThanOrEqual(rules.water.bed[1]);
      // Out of the loop towards the sea, in on the far side.
      expect(input.island.inside[cellOf(input, c.path.at(-1)!)]).toBe(1);
      expect(input.island.inside[cellOf(input, c.path[0]!)]).toBe(0);
    }
  });

  it('runs a river from the open sea under the road 150 to 350 m in, winding and narrowing towards its source', () => {
    const input = synth({ sea: true });
    const rivers = crossingsOf(input, always, Array.from({ length: 30 }, (_, k) => k + 1)).filter((c) => c.kind === 'river');
    expect(rivers.length).toBeGreaterThan(3);
    let winds = 0;
    for (const c of rivers) {
      keepsTogether(c);
      expect(sampleGrid(input.island.natural, input.island.cap, c.path[0]!.x, c.path[0]!.z, 0)).toBeLessThanOrEqual(0);
      const k0 = siteIndex(c, input.line);
      const inward = along(c.path, k0, c.path.length - 1) - input.width[c.sample]! / 2;
      expect(inward).toBeGreaterThanOrEqual(rules.river.length[0] - rules.step);
      expect(inward).toBeLessThanOrEqual(rules.river.length[1] + rules.step);
      const site = c.path[k0]!;
      expect(2 * site.half).toBeGreaterThanOrEqual(rules.river.width[0]);
      expect(2 * site.half).toBeLessThanOrEqual(rules.river.width[1]);
      for (let k = k0 + 1; k < c.path.length; k++) expect(c.path[k]!.half).toBeLessThanOrEqual(c.path[k - 1]!.half);
      expect(c.path.at(-1)!.half).toBeLessThan(site.half);
      let off = 0;
      for (const p of c.path.slice(k0)) off = Math.max(off, Math.abs((p.x - site.x) * c.across.z - (p.z - site.z) * c.across.x));
      if (off > 5) winds++;
      expect(input.island.inside[cellOf(input, c.path.at(-1)!)]).toBe(1);
    }
    expect(winds).toBe(rivers.length);
  });

  it('cuts a ravine 10 to 30 m under the road, its floor above the sea, 60 to 200 m each way, rising to the ground at its ends', () => {
    const input = synth({ road: 18 });
    const ravines = crossingsOf(input);
    expect(ravines).toHaveLength(SEEDS.length);
    for (const c of ravines) {
      keepsTogether(c);
      const k0 = siteIndex(c, input.line);
      const floor = c.path[k0]!.floor;
      expect(18 - floor).toBeGreaterThanOrEqual(rules.ravine.depth[0]);
      expect(18 - floor).toBeLessThanOrEqual(rules.ravine.depth[1]);
      expect(floor).toBeGreaterThanOrEqual(rules.ravine.floorAbove);
      for (const arm of [along(c.path, 0, k0), along(c.path, k0, c.path.length - 1)]) {
        expect(arm - 6).toBeGreaterThanOrEqual(rules.ravine.length[0] - rules.step);
        expect(arm - 6).toBeLessThanOrEqual(rules.ravine.length[1] + rules.step);
      }
      for (const p of c.path) expect(p.floor).toBeGreaterThanOrEqual(floor);
      expect(c.path[0]!.floor).toBeCloseTo(18, 6);
      expect(c.path.at(-1)!.floor).toBeCloseTo(18, 6);
      expect(2 * c.path[0]!.half).toBeGreaterThanOrEqual(rules.ravine.width[0]);
      expect(2 * c.path[0]!.half).toBeLessThanOrEqual(rules.ravine.width[1]);
      expect(c.water).toBeUndefined();
    }
  });

  it('holds a hill river’s still water 1.5 to 3 m over its floor and at least 3 m under the ground all round', () => {
    const input = synth({ road: 40 });
    const hill = crossingsOf(input, always, Array.from({ length: 30 }, (_, k) => k + 1)).filter((c) => c.kind === 'hillRiver');
    expect(hill.length).toBeGreaterThan(3);
    for (const c of hill) {
      keepsTogether(c);
      const floor = c.path[siteIndex(c, input.line)]!.floor;
      expect(floor).toBeGreaterThanOrEqual(rules.hillRiver.floorAbove);
      expect(c.water!.level - floor).toBeGreaterThanOrEqual(rules.hillRiver.depth[0]);
      expect(c.water!.level - floor).toBeLessThanOrEqual(rules.hillRiver.depth[1]);
      expect(c.water!.level).toBeLessThanOrEqual(40 - rules.hillRiver.rimClear);
    }
  });

  it(`stops a path ${rules.clear} m short of any other stretch of road, past the top of its bank`, () => {
    // Straights 240 m apart: the far one is within reach of a cove or a river.
    const input = synth({ sea: true, tall: 240 });
    const crossings = crossingsOf(input);
    expect(crossings.length).toBeGreaterThan(SEEDS.length / 2);
    for (const c of crossings) keepsClearOfOtherRoad(c, input, `${c.kind} at ${c.sample}`);
  });

  it('measures a path against other stretches of road, never against the road climbing away from its own bridge', () => {
    const input = synth({ road: 18, vee: true });
    const crossings = crossingsOf(input);
    expect(crossings).toHaveLength(SEEDS.length);
    for (const c of crossings) {
      expect(Math.abs(input.line.z[c.sample]! + 250), `${c.kind} at ${c.sample}`).toBeLessThan(0.5);
      keepsClearOfOtherRoad(c, input, `${c.kind} at ${c.sample}`);
    }
  });

  it('is the same twice', () => {
    for (const seed of [3, 4]) expect(chooseCrossing(seed, synth({ sea: true }), always)).toEqual(chooseCrossing(seed, synth({ sea: true }), always));
  });
});

/** The cell under a point. */
function cellOf(input: CrossingInput, p: { x: number; z: number }): number {
  const field = input.island.natural;
  const ix = Math.round((p.x - field.origin) / field.cell);
  const iz = Math.round((p.z - field.origin) / field.cell);
  return iz * field.size + ix;
}

describe('crossings on real seeds (M6.1d-1)', () => {
  const REAL = Array.from({ length: 24 }, (_, k) => k + 1);
  const inputs = new Map<number, CrossingInput>();
  beforeAll(() => {
    for (const seed of REAL) {
      const track = generateTrack(seed, config);
      const winner = track.candidates[track.winnerIndex]!;
      const width = solveWidth(track.seed, winner.line, winner.sections, track.character.width, config);
      const island = buildIsland(track.seed, winner.line, winner.profile, width, config, track.character);
      const lapGates = placeLapGates(winner.line, winner.sections, config.road.lapGates);
      inputs.set(seed, { line: winner.line, height: winner.profile.height, width, bridges: winner.bridges, lapGates, island });
    }
  }, 600_000);

  it('gives between a quarter and three quarters of seeds 1 to 24 a crossing', () => {
    const count = REAL.filter((seed) => chooseCrossing(seed, inputs.get(seed)!, config) !== null).length;
    expect(count).toBeGreaterThanOrEqual(REAL.length / 4);
    expect(count).toBeLessThanOrEqual((3 * REAL.length) / 4);
  });

  it('keeps every crossing of seeds 1 to 24 (looked for on every seed) to its site’s and its kind’s rules', { timeout: 120_000 }, () => {
    let checked = 0;
    for (const seed of REAL) {
      const input = inputs.get(seed)!;
      const c = chooseCrossing(seed, input, always);
      if (!c) continue;
      checked++;
      const label = `seed ${seed}, ${c.kind} at ${c.sample}`;
      const road = input.height[c.sample]!;
      keepsSiteRules(c, input, label);
      keepsTogether(c);
      keepsClearOfOtherRoad(c, input, label);
      if (c.kind === 'inlet' || c.kind === 'river') {
        expect(input.island.seaside[c.sample], label).toBe(1);
        expect(road, label).toBeLessThanOrEqual(rules.water.maxRoad);
        expect(sampleGrid(input.island.natural, input.island.cap, c.path[0]!.x, c.path[0]!.z, 0), label).toBeLessThanOrEqual(0);
      } else {
        expect(road, label).toBeGreaterThanOrEqual(c.kind === 'ravine' ? rules.ravine.minRoad : rules.hillRiver.minRoad);
      }
      if (c.water) {
        // The ground round the still water, beside it (a hill river runs straight across the road) and at its ends,
        // stands at least rimClear over it.
        const rim = c.water.level + rules.hillRiver.rimClear;
        for (const p of c.path) {
          const edge = p.half + Math.max(0, c.water.level - p.floor) / rules.bankSlope.ravine;
          for (const side of [-1, 1]) {
            const ground = sampleField(input.island.natural, p.x - side * edge * c.across.z, p.z + side * edge * c.across.x, 0);
            expect(ground, `${label}: beside (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).toBeGreaterThanOrEqual(rim - 1e-3);
          }
        }
        for (const end of [c.path[0]!, c.path.at(-1)!]) expect(sampleField(input.island.natural, end.x, end.z, 0), label).toBeGreaterThanOrEqual(rim - 1e-3);
      }
    }
    expect(checked).toBeGreaterThan(REAL.length / 3);
  });

  it('is the same twice on a real seed', () => {
    const seed = REAL.find((s) => chooseCrossing(s, inputs.get(s)!, always) !== null)!;
    expect(chooseCrossing(seed, inputs.get(seed)!, always)).toEqual(chooseCrossing(seed, inputs.get(seed)!, always));
  });
});
