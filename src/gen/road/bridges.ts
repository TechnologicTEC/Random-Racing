import type { GenConfig, RoadConfig } from '../../config';
import type { BridgeSpan, CenterLine, MeshData, RoadProfile } from '../types';
import { MeshBuilder, type Point } from './meshBuilder';
import { cutAndFill, type RoadEdges } from './profile';
import { ROAD_MATERIAL } from './ribbon';
import { drawBox, type GateBox } from './startGate';

/**
 * Where the road runs on bridges (M6.1): every stretch whose fill under the road (in its middle, and at its
 * banked edges when `edges` are given) is more than `road.maxFill`, reaching each way until the fill is no more
 * than `road.bridges.endFill`, made at least `minLength` long about its middle, and joined to the next bridge
 * when less than `mergeGap` of road lies between them. In order from sample 0; a span may wrap past the lap's end.
 */
export function findBridgeSpans(profile: RoadProfile, spacing: number, road: RoadConfig, edges?: RoadEdges): BridgeSpan[] {
  const n = profile.height.length;
  const { endFill, minLength, mergeGap } = road.bridges;
  const fill = new Float64Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    fill[i] = cutAndFill(i, profile, edges).fill;
    if (fill[i]! > road.maxFill) any = true;
  }
  if (!any) return [];

  // The stretches over the end fill that hold some fill over the limit, each padded to the shortest span.
  const over = new Uint8Array(n);
  for (let i = 0; i < n; i++) over[i] = fill[i]! > endFill ? 1 : 0;
  const shortest = Math.ceil(minLength / spacing) + 1;
  const mask = new Uint8Array(n);
  for (const run of runsOf(over)) {
    let deep = false;
    for (let k = 0; k < run.sampleCount && !deep; k++) deep = fill[(run.startIndex + k) % n]! > road.maxFill;
    if (!deep) continue;
    let { startIndex, sampleCount } = run;
    if (sampleCount < shortest) {
      startIndex = (startIndex - Math.floor((shortest - sampleCount) / 2) + n) % n;
      sampleCount = shortest;
    }
    if (sampleCount >= n) return [{ startIndex: 0, sampleCount: n }];
    for (let k = 0; k < sampleCount; k++) mask[(startIndex + k) % n] = 1;
  }

  // Close the gaps shorter than `mergeGap` between one bridge's last sample and the next one's first.
  const spans = runsOf(mask);
  for (let s = 0; s < spans.length && spans.length > 1; s++) {
    const here = spans[s]!;
    const next = spans[(s + 1) % spans.length]!;
    const end = here.startIndex + here.sampleCount - 1;
    const gap = (((next.startIndex - end) % n) + n) % n;
    if (gap * spacing < mergeGap) for (let k = 1; k < gap; k++) mask[(end + k) % n] = 1;
  }
  return runsOf(mask);
}

/** A bridge's length in metres, from its first sample to its last. */
export function spanLength(span: BridgeSpan, spacing: number): number {
  return (span.sampleCount - 1) * spacing;
}

/** 1 for each of the lap's `count` samples on a bridge, 0 elsewhere. */
export function bridgedMask(spans: readonly BridgeSpan[], count: number): Uint8Array {
  const mask = new Uint8Array(count);
  for (const span of spans) for (let k = 0; k < span.sampleCount; k++) mask[(span.startIndex + k) % count] = 1;
  return mask;
}

/** The same spans on the lap renumbered so that sample `start` becomes sample 0, in order from it. */
export function rotateSpans(spans: readonly BridgeSpan[], start: number, count: number): BridgeSpan[] {
  return spans
    .map((span) => ({ startIndex: (((span.startIndex - start) % count) + count) % count, sampleCount: span.sampleCount }))
    .sort((a, b) => a.startIndex - b.startIndex);
}

/** The runs of 1s round a loop, in order of their first sample; a run may wrap past the end. */
function runsOf(mask: Uint8Array): BridgeSpan[] {
  const n = mask.length;
  const gap = mask.indexOf(0);
  if (gap < 0) return n > 0 ? [{ startIndex: 0, sampleCount: n }] : [];
  const runs: BridgeSpan[] = [];
  let start = -1;
  // From just after a sample that is off, once round, so no run is cut in two at the lap's end.
  for (let k = 1; k <= n; k++) {
    const i = (gap + k) % n;
    if (mask[i] && start < 0) start = i;
    if (!mask[i] && start >= 0) {
      runs.push({ startIndex: start, sampleCount: (((i - start) % n) + n) % n });
      start = -1;
    }
  }
  return runs.sort((a, b) => a.startIndex - b.startIndex);
}

/** How far the deck reaches either side of the centre line at a sample (M6.1b): past the railings' outer face by `deckLip`. */
export function deckHalf(width: Float64Array, i: number, cfg: Pick<GenConfig, 'road'>): number {
  const road = cfg.road;
  return width[i]! / 2 + road.barrierOffset + road.barrierWidth + road.bridges.deckLip;
}

/** A point `lateral` metres right of the centre line at a sample and `below` metres under the road's tilted surface there. */
function deckPoint(line: CenterLine, height: Float64Array, cross: Float64Array | null, i: number, lateral: number, below: number): Point {
  return {
    // Right of the direction of travel is (-tz, tx) on the map.
    x: line.x[i]! - line.tz[i]! * lateral,
    y: height[i]! + (cross ? cross[i]! * lateral : 0) - below,
    z: line.z[i]! + line.tx[i]! * lateral,
  };
}

/**
 * The pillars of the bridges (M6.1b), as upright boxes square to the road: rows evenly along each bridge, as few as
 * keep them no more than `pillarSpacing` apart or from either end, each row at the sample nearest its place, with a
 * pillar `pillarInset` inside each edge of the road, from the deck's underside to half a metre into the ground. No
 * pillar stands where the ground comes within half a metre of the deck.
 *
 * @param groundAt the finished ground's height (under the sea, its bed)
 */
export function bridgePillars(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  spans: readonly BridgeSpan[],
  groundAt: (x: number, z: number) => number,
  cfg: Pick<GenConfig, 'road'>,
): GateBox[] {
  const rules = cfg.road.bridges;
  const n = line.count;
  const pillars: GateBox[] = [];
  for (const span of spans) {
    const rows = Math.max(0, Math.ceil(spanLength(span, line.spacing) / rules.pillarSpacing) - 1);
    for (let r = 1; r <= rows; r++) {
      const i = (span.startIndex + Math.round((r * (span.sampleCount - 1)) / (rows + 1))) % n;
      for (const side of [-1, 1]) {
        const lateral = side * (width[i]! / 2 - rules.pillarInset);
        const top = deckPoint(line, height, cross, i, lateral, rules.deckDepth);
        const foot = groundAt(top.x, top.z) - 0.5;
        if (top.y - foot < 1) continue;
        pillars.push({
          x: top.x,
          y: (top.y + foot) / 2,
          z: top.z,
          halfAcross: rules.pillarWidth / 2,
          halfUp: (top.y - foot) / 2,
          halfAlong: rules.pillarWidth / 2,
          tx: line.tx[i]!,
          tz: line.tz[i]!,
        });
      }
    }
  }
  return pillars;
}

/** A solid box of a bridge's deck: its middle, half its size along its own axes, and those axes (one long each). */
export interface DeckBox {
  centre: Point;
  /** Half its size across the road (x), up out of the deck (y) and along the road (z). */
  half: Point;
  across: Point;
  up: Point;
  along: Point;
}

/** Each box runs this far past both ends of its piece, in metres, so no slit opens between boxes where the deck bends. */
const DECK_OVERLAP = 0.03;

const unit = (v: Point): Point => {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};

/**
 * The bridges' decks as solid boxes (M6.1b), one for each piece of each bridge: from `topGap` under the road's
 * tilted surface down to the deck's underside, out to the deck's edges, tilted with the banking. The car drives on
 * the road above it and never touches its top; from below and beside, it is what is hit.
 */
export function deckBoxes(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  spans: readonly BridgeSpan[],
  cfg: Pick<GenConfig, 'road'>,
): DeckBox[] {
  const rules = cfg.road.bridges;
  const n = line.count;
  const boxes: DeckBox[] = [];
  /** Half the top's width at a sample, as a vector pointing left (so that `along` times `across` points up). */
  const leftward = (s: number): Point => {
    const h = deckHalf(width, s, cfg);
    const l = deckPoint(line, height, cross, s, -h, rules.topGap);
    const r = deckPoint(line, height, cross, s, h, rules.topGap);
    return { x: (l.x - r.x) / 2, y: (l.y - r.y) / 2, z: (l.z - r.z) / 2 };
  };
  for (const span of spans) {
    for (let k = 0; k < span.sampleCount - 1; k++) {
      const i = (span.startIndex + k) % n;
      const j = (i + 1) % n;
      const a = deckPoint(line, height, cross, i, 0, rules.topGap);
      const b = deckPoint(line, height, cross, j, 0, rules.topGap);
      const along = unit({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
      const li = leftward(i);
      const lj = leftward(j);
      const raw = { x: (li.x + lj.x) / 2, y: (li.y + lj.y) / 2, z: (li.z + lj.z) / 2 };
      const dot = raw.x * along.x + raw.y * along.y + raw.z * along.z;
      const square = { x: raw.x - along.x * dot, y: raw.y - along.y * dot, z: raw.z - along.z * dot };
      const across = unit(square);
      const up = {
        x: along.y * across.z - along.z * across.y,
        y: along.z * across.x - along.x * across.z,
        z: along.x * across.y - along.y * across.x,
      };
      const halfUp = (rules.deckDepth - rules.topGap) / 2;
      const length = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
      boxes.push({
        centre: { x: (a.x + b.x) / 2 - up.x * halfUp, y: (a.y + b.y) / 2 - up.y * halfUp, z: (a.z + b.z) / 2 - up.z * halfUp },
        half: { x: Math.sqrt(square.x * square.x + square.y * square.y + square.z * square.z), y: halfUp, z: length / 2 + DECK_OVERLAP },
        across,
        up,
        along,
      });
    }
  }
  return boxes;
}

/**
 * Builds the bridges as triangles (M6.1b): under the road along each bridge a deck `deckDepth` deep, its top
 * showing beside the road out to past the railings, its sides, underside and two ends, and its pillars
 * (`bridgePillars`), all in the bridge's concrete. The road and the railings are drawn as everywhere else.
 */
export function buildBridges(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  spans: readonly BridgeSpan[],
  groundAt: (x: number, z: number) => number,
  cfg: Pick<GenConfig, 'road'>,
): MeshData {
  const rules = cfg.road.bridges;
  const n = line.count;
  const material = ROAD_MATERIAL.bridge;
  const builder = new MeshBuilder();
  const at = (i: number, lateral: number, below: number): Point => deckPoint(line, height, cross, i, lateral, below);
  const top = rules.topGap;
  const bottom = rules.deckDepth;
  for (const span of spans) {
    for (let k = 0; k < span.sampleCount - 1; k++) {
      const i = (span.startIndex + k) % n;
      const j = (i + 1) % n;
      const hi = deckHalf(width, i, cfg);
      const hj = deckHalf(width, j, cfg);
      const ri = width[i]! / 2;
      const rj = width[j]! / 2;
      // The top beside the road on each side, facing up.
      builder.quad(at(i, -hi, top), at(i, -ri, top), at(j, -hj, top), at(j, -rj, top), material);
      builder.quad(at(i, ri, top), at(i, hi, top), at(j, rj, top), at(j, hj, top), material);
      // The sides, facing out, and the underside, facing down.
      builder.quad(at(i, hi, top), at(i, hi, bottom), at(j, hj, top), at(j, hj, bottom), material);
      builder.quad(at(i, -hi, bottom), at(i, -hi, top), at(j, -hj, bottom), at(j, -hj, top), material);
      builder.quad(at(i, hi, bottom), at(i, -hi, bottom), at(j, hj, bottom), at(j, -hj, bottom), material);
    }
    // The two ends, the first looking back down the lap and the last on up it.
    const first = span.startIndex % n;
    const last = (span.startIndex + span.sampleCount - 1) % n;
    const hf = deckHalf(width, first, cfg);
    const hl = deckHalf(width, last, cfg);
    builder.quad(at(first, -hf, bottom), at(first, hf, bottom), at(first, -hf, top), at(first, hf, top), material);
    builder.quad(at(last, hl, bottom), at(last, -hl, bottom), at(last, hl, top), at(last, -hl, top), material);
  }
  for (const pillar of bridgePillars(line, height, cross, width, spans, groundAt, cfg)) drawBox(builder, pillar, material);
  return builder.build();
}
