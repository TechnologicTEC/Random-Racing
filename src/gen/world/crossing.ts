import type { CrossingsConfig, GenConfig } from '../../config';
import { dcos, dsin, length2, TAU } from '../../core/dmath';
import { createRng, type Rng } from '../../core/rng';
import { clamp01, lerp, smoothstep } from '../../core/scalar';
import type { BridgeSpan, CenterLine, Crossing, CrossingKind, CrossingPoint } from '../types';
import { sampleField, sampleGrid } from './heightfield';
import type { Island } from './island';

/** What choosing a crossing looks at: the winning lap, its road, its bridges and gates, and the island round it. */
export interface CrossingInput {
  line: CenterLine;
  /** The road's height at each sample. */
  height: Float64Array;
  /** The road's width at each sample. */
  width: Float64Array;
  /** The bridges the lap already has (M6.1a). */
  bridges: readonly BridgeSpan[];
  /** The samples the lap gates stand at (M5.4d). */
  lapGates: readonly number[];
  island: Pick<Island, 'natural' | 'cap' | 'inside' | 'seaside'>;
}

/** A point of a path as it is walked: where it is and how far along its arm from the road's centre. */
interface Step {
  x: number;
  z: number;
  d: number;
}

/**
 * Chooses the lap's one crossing (M6.1d-1, Tane 2026-11-26), or none: a channel to carve square across the road so
 * that the road there becomes a bridge. A seed looks for one with `world.crossings.chance`. It then takes the kinds
 * that fit somewhere on the lap in a shuffled order (equal weights), and for each tries the sites where it fits, every
 * `siteStep` metres round the lap in a shuffled order, until a shape keeps to every rule; only when no site takes a
 * kind is the next one tried. A seed where nothing fits has none.
 *
 * - **The site:** the road its bridge is expected to cover (`Crossing.reach`) stays `startClear` from the line and
 *   `gateClear` from every lap gate, curves no tighter than `minRadius`, and keeps `road.bridges.mergeGap` from the
 *   lap's bridges unless the two join into one no longer than `road.bridges.maxLength`.
 * - **The kinds:** an inlet or a river where the sea is beside the road outside the loop and the road is at most
 *   `water.maxRoad` up; a ravine from `ravine.minRoad` up; a hill river from `hillRiver.minRoad` up. The road stands
 *   at least `road.maxFill` + `fillMargin` over the floor, so it is sure to become a bridge.
 * - **The path:** an inlet runs from the open sea in to a cove, a river from the open sea in to its source, winding
 *   and narrowing; a ravine or a hill river runs both ways, its floor rising to the ground at its ends, and a hill
 *   river's water stands `hillRiver.rimClear` under the ground all round. A path stops `clear` short of any other
 *   stretch of road (past where its bank reaches that road's height) and where the ground rises too far above its
 *   floor; a site that leaves a path shorter than its kind's shortest is refused.
 *
 * Its own stream (`world`/`crossing`), so choosing it reshuffles nothing else.
 */
export function chooseCrossing(seed: number, input: CrossingInput, cfg: GenConfig): Crossing | null {
  const rules = cfg.world.crossings;
  const rng = createRng(seed, 'world').fork('crossing');
  if (!rng.chance(rules.chance)) return null;
  const { line } = input;
  const stride = Math.max(1, Math.round(rules.siteStep / line.spacing));
  const sites: number[] = [];
  for (let i = 0; i < line.count; i += stride) sites.push(i);
  shuffle(rng.fork('sites'), sites);
  // The sites clear of the line and the gates, each with its direction out of the loop and the kinds that fit it.
  const clear: { site: number; across: { x: number; z: number }; kinds: CrossingKind[] }[] = [];
  for (const site of sites) {
    const across = siteClear(site, input, rules) ? outward(site, input) : null;
    if (across) clear.push({ site, across, kinds: kindsAt(site, input, cfg) });
  }
  const kinds = KINDS.filter((kind) => clear.some((c) => c.kinds.includes(kind)));
  shuffle(rng.fork('kinds'), kinds);
  const shapes = rng.fork('shapes');
  for (const kind of kinds) {
    for (const { site, across, kinds: fit } of clear) {
      if (!fit.includes(kind)) continue;
      const crossing = shapeCrossing(kind, site, across, shapes, input, cfg);
      if (crossing) return crossing;
    }
  }
  return null;
}

/** Every kind of crossing, in the order they are shuffled from. */
const KINDS: readonly CrossingKind[] = ['inlet', 'river', 'ravine', 'hillRiver'];

/** The kinds of crossing that fit the road at a site, by its height and the sea beside it. */
function kindsAt(site: number, input: CrossingInput, cfg: GenConfig): CrossingKind[] {
  const rules = cfg.world.crossings;
  const height = input.height[site]!;
  const kinds: CrossingKind[] = [];
  const bridged = height + rules.water.bed[1] >= cfg.road.maxFill + rules.fillMargin;
  if (input.island.seaside[site] === 1 && height <= rules.water.maxRoad && bridged) kinds.push('inlet', 'river');
  if (height >= rules.ravine.minRoad) kinds.push('ravine');
  if (height >= rules.hillRiver.minRoad) kinds.push('hillRiver');
  return kinds;
}

/** The quick test of a site before any shape is drawn: the sample itself clear of the line and the gates, and gently curved. */
function siteClear(site: number, input: CrossingInput, rules: CrossingsConfig): boolean {
  const { line } = input;
  if (apart(site, 0, line) < rules.startClear) return false;
  for (const gate of input.lapGates) if (apart(site, gate, line) < rules.gateClear) return false;
  return Math.abs(line.curvature[site]!) <= 1 / rules.minRadius;
}

/** Unit direction square to the road at a site, pointing out of the loop; null where the loop's inside is unclear there. */
function outward(site: number, input: CrossingInput): { x: number; z: number } | null {
  const { line, island } = input;
  const nx = -line.tz[site]!;
  const nz = line.tx[site]!;
  const probe = input.width[site]! / 2 + 10;
  const x = line.x[site]!;
  const z = line.z[site]!;
  const one = insideAt(island, x + nx * probe, z + nz * probe);
  const other = insideAt(island, x - nx * probe, z - nz * probe);
  if (one === 0 && other === 1) return { x: nx, z: nz };
  if (one === 1 && other === 0) return { x: -nx, z: -nz };
  return null;
}

function insideAt(island: CrossingInput['island'], x: number, z: number): number {
  const field = island.natural;
  const ix = Math.round((x - field.origin) / field.cell);
  const iz = Math.round((z - field.origin) / field.cell);
  if (ix < 0 || iz < 0 || ix >= field.size || iz >= field.size) return -1;
  return island.inside[iz * field.size + ix]!;
}

/** Draws one kind's sizes at a site and walks its path; null if it breaks a rule. */
function shapeCrossing(
  kind: CrossingKind,
  site: number,
  across: { x: number; z: number },
  rng: Rng,
  input: CrossingInput,
  cfg: GenConfig,
): Crossing | null {
  const rules = cfg.world.crossings;
  const { line } = input;
  const water = kind === 'inlet' || kind === 'river';
  const slope = water ? rules.bankSlope.water : rules.bankSlope.ravine;
  const road = input.height[site]!;
  const roadHalf = input.width[site]! / 2;

  // The sizes, drawn in the same order every time for a kind.
  let half: number;
  let floor: number;
  const lengths: number[] = [];
  let wind = 0;
  let wavelength = 1;
  let waterDepth = 0;
  if (kind === 'inlet') {
    half = rng.range(...rules.inlet.width) / 2;
    floor = -rng.range(...rules.water.bed);
    lengths.push(rng.range(...rules.inlet.length));
  } else if (kind === 'river') {
    half = rng.range(...rules.river.width) / 2;
    floor = -rng.range(...rules.water.bed);
    lengths.push(rng.range(...rules.river.length));
    wavelength = rng.range(...rules.river.wavelength);
    wind = rng.chance(0.5) ? rules.river.wind : -rules.river.wind;
  } else {
    half = rng.range(...rules.ravine.width) / 2;
    const lowest = kind === 'ravine' ? rules.ravine.floorAbove : rules.hillRiver.floorAbove;
    floor = Math.max(road - rng.range(...rules.ravine.depth), lowest);
    lengths.push(rng.range(...rules.ravine.length), rng.range(...rules.ravine.length));
    if (kind === 'hillRiver') waterDepth = rng.range(...rules.hillRiver.depth);
    if (road - floor < rules.ravine.depth[0]) return null;
  }
  if (road - floor < cfg.road.maxFill + rules.fillMargin) return null;

  // The road its bridge is expected to cover: the floor and its banks up to the end fill under the road.
  const spanHalf = half + Math.max(0, road - cfg.road.bridges.endFill - floor) / slope;
  const k = Math.ceil(spanHalf / line.spacing);
  if (2 * k * line.spacing > cfg.road.bridges.maxLength || 2 * k + 1 >= line.count) return null;
  const reach: BridgeSpan = { startIndex: (site - k + line.count) % line.count, sampleCount: 2 * k + 1 };
  if (!reachClear(reach, input, cfg)) return null;

  const own = ownStretch(site, half + rules.clear + Math.max(0, road - floor) / slope + roadHalf, line);
  const clearOf = (x: number, z: number, h: number, f: number): boolean => {
    for (let j = 0; j < line.count; j++) {
      if (own[j]) continue;
      const room = length2(x - line.x[j]!, z - line.z[j]!) - input.width[j]! / 2;
      if (room < h + rules.clear + Math.max(0, input.height[j]! - f) / slope) return false;
    }
    return true;
  };
  const ground = (x: number, z: number): number => sampleField(input.island.natural, x, z, NaN);
  const cap = (x: number, z: number): number => sampleGrid(input.island.natural, input.island.cap, x, z, NaN);
  const start = { x: line.x[site]!, z: line.z[site]! };
  const inward = { x: -across.x, z: -across.z };
  const point = (s: Step, h: number, f: number): CrossingPoint => ({ x: s.x, z: s.z, half: h, floor: f });

  if (water) {
    // Out to the open sea, then on by the channel's half so its mouth lies in the sea.
    const out: CrossingPoint[] = [];
    let wetAt = -1;
    for (const s of walk(start, across, rules.water.seaSearch, rules.step)) {
      if (!clearOf(s.x, s.z, half, floor) || !(ground(s.x, s.z) - floor <= rules.water.maxBank)) return null;
      out.push(point(s, half, floor));
      if (wetAt < 0 && cap(s.x, s.z) <= 0) wetAt = s.d;
      if (wetAt >= 0 && s.d >= wetAt + half) break;
    }
    if (wetAt < 0 || !(cap(out.at(-1)!.x, out.at(-1)!.z) <= 0)) return null;

    // In past the road: straight to an inlet's cove, or winding and narrowing to a river's source.
    const length = lengths[0]!;
    const turn =
      kind === 'river' ? (d: number) => wind * dsin((TAU * (d - roadHalf)) / wavelength) * smoothstep(roadHalf + 10, roadHalf + 50, d) : undefined;
    const narrow = kind === 'river' ? rules.river.narrow : 1;
    const inner: CrossingPoint[] = [];
    for (const s of walk(start, inward, roadHalf + length, rules.step, turn)) {
      const h = half * lerp(1, narrow, clamp01((s.d - roadHalf) / length));
      if (!clearOf(s.x, s.z, h, floor) || !(ground(s.x, s.z) - floor <= rules.water.maxBank)) break;
      inner.push(point(s, h, floor));
    }
    const shortest = kind === 'inlet' ? rules.inlet.length[0] : rules.river.length[0];
    if (inner.length === 0 || distanceAlong(inner, start) - roadHalf < shortest) return null;
    return { kind, sample: site, across, reach, path: [...out.reverse(), point({ ...start, d: 0 }, half, floor), ...inner] };
  }

  // A ravine (or a hill river's gorge): an arm each way, its floor flat, then rising to the ground at its end.
  const arms: CrossingPoint[][] = [];
  for (const [a, dir] of [across, inward].entries()) {
    const steps: Step[] = [];
    for (const s of walk(start, dir, roadHalf + lengths[a]!, rules.step)) {
      const here = ground(s.x, s.z);
      if (!clearOf(s.x, s.z, half, floor) || !(here - floor <= rules.ravine.maxBank) || !(here > floor) || !(cap(s.x, s.z) > floor)) break;
      steps.push(s);
    }
    if (steps.length === 0) return null;
    const last = steps.at(-1)!;
    if (last.d - roadHalf < rules.ravine.length[0]) return null;
    const end = Math.max(floor, ground(last.x, last.z));
    arms.push(steps.map((s) => point(s, half, floor + (end - floor) * smoothstep((1 - rules.ravine.endRise) * last.d, last.d, s.d))));
  }
  const path = [...arms[0]!.reverse(), point({ ...start, d: 0 }, half, floor), ...arms[1]!];
  if (kind === 'ravine') return { kind, sample: site, across, reach, path };

  // A hill river: still water held in all round, the ground beside it and at its ends standing well over it.
  const level = floor + waterDepth;
  const rim = level + rules.hillRiver.rimClear;
  for (const p of path) {
    const edge = p.half + Math.max(0, level - p.floor) / slope;
    for (const side of [-1, 1]) if (!(ground(p.x - side * edge * across.z, p.z + side * edge * across.x) >= rim)) return null;
  }
  for (const end of [path[0]!, path.at(-1)!]) if (!(ground(end.x, end.z) >= rim)) return null;
  return { kind, sample: site, across, reach, path, water: { level } };
}

/**
 * The site's own stretch of road, which a path never measures itself against: its bridge and the road leading on
 * from it each way, at least `least` metres along the lap, and on for as long as the road keeps heading away from the
 * site within `OWN_TURN` of its direction there. Past that it is another stretch, even when it is the same road come
 * back round.
 */
function ownStretch(site: number, least: number, line: CenterLine): Uint8Array {
  const n = line.count;
  const own = new Uint8Array(n);
  own[site] = 1;
  const x = line.x[site]!;
  const z = line.z[site]!;
  for (const way of [1, -1]) {
    let far = 0;
    for (let k = 1; k < n; k++) {
      const j = (((site + way * k) % n) + n) % n;
      if (own[j]) break;
      const away = length2(line.x[j]! - x, line.z[j]! - z);
      const ahead = line.tx[j]! * line.tx[site]! + line.tz[j]! * line.tz[site]!;
      if (k * line.spacing > least && (away < far || ahead < OWN_TURN)) break;
      far = Math.max(far, away);
      own[j] = 1;
    }
  }
  return own;
}

/** The cosine of the most the road may turn from its direction at the site and still be the site's own stretch (45 degrees). */
const OWN_TURN = Math.SQRT1_2;

/** Whether the road a bridge is expected to cover keeps to the site's rules (see `chooseCrossing`). */
function reachClear(reach: BridgeSpan, input: CrossingInput, cfg: GenConfig): boolean {
  const rules = cfg.world.crossings;
  const { line } = input;
  const n = line.count;
  for (let k = 0; k < reach.sampleCount; k++) {
    const i = (reach.startIndex + k) % n;
    if (apart(i, 0, line) < rules.startClear || Math.abs(line.curvature[i]!) > 1 / rules.minRadius) return false;
    for (const gate of input.lapGates) if (apart(i, gate, line) < rules.gateClear) return false;
  }
  const { mergeGap, maxLength } = cfg.road.bridges;
  for (const bridge of input.bridges) {
    const mask = new Uint8Array(n);
    let overlaps = false;
    for (let k = 0; k < reach.sampleCount; k++) mask[(reach.startIndex + k) % n] = 1;
    for (let k = 0; k < bridge.sampleCount; k++) {
      const i = (bridge.startIndex + k) % n;
      if (mask[i]) overlaps = true;
      mask[i] = 1;
    }
    const endReach = (reach.startIndex + reach.sampleCount - 1) % n;
    const endBridge = (bridge.startIndex + bridge.sampleCount - 1) % n;
    const after = (bridge.startIndex - endReach + n) % n;
    const before = (reach.startIndex - endBridge + n) % n;
    if (!overlaps && Math.min(after, before) * line.spacing >= mergeGap) continue;
    // Joined: the two and the road between them, the short way.
    if (!overlaps) {
      const [from, count] = after <= before ? [endReach, after] : [endBridge, before];
      for (let k = 1; k < count; k++) mask[(from + k) % n] = 1;
    }
    let covered = 0;
    for (let i = 0; i < n; i++) covered += mask[i]!;
    if ((covered - 1) * line.spacing > maxLength) return false;
  }
  return true;
}

/**
 * Points every `step` metres from `start` out to `length` (the last one exactly there), heading `dir` turned by
 * `turn(d)` radians at each distance `d` along; without a turn, exactly along `dir`.
 */
function walk(start: { x: number; z: number }, dir: { x: number; z: number }, length: number, step: number, turn?: (d: number) => number): Step[] {
  const steps: Step[] = [];
  let x = start.x;
  let z = start.z;
  for (let d = 0; d < length - 1e-6; ) {
    const next = Math.min(length, d + step);
    if (turn) {
      const angle = turn((d + next) / 2);
      const c = dcos(angle);
      const s = dsin(angle);
      x += (dir.x * c - dir.z * s) * (next - d);
      z += (dir.x * s + dir.z * c) * (next - d);
    } else {
      x = start.x + dir.x * next;
      z = start.z + dir.z * next;
    }
    d = next;
    steps.push({ x, z, d });
  }
  return steps;
}

/** Metres along an arm's points from the road's centre to its last point. */
function distanceAlong(points: readonly CrossingPoint[], start: { x: number; z: number }): number {
  let total = 0;
  let from = start;
  for (const p of points) {
    total += length2(p.x - from.x, p.z - from.z);
    from = p;
  }
  return total;
}

/** Metres round the lap between two samples, the short way. */
function apart(a: number, b: number, line: CenterLine): number {
  const d = Math.abs(a - b) % line.count;
  return Math.min(d, line.count - d) * line.spacing;
}

/** Shuffles a list in place (Fisher and Yates), from the seeded stream. */
function shuffle<T>(rng: Rng, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}
