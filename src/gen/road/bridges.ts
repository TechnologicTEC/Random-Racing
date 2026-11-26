import type { BridgeLookConfig, GenConfig, RoadConfig, TrestleSize } from '../../config';
import type { BridgeKind, BridgeSpan, CenterLine, MeshData, RoadProfile } from '../types';
import { MeshBuilder, type Point } from './meshBuilder';
import { cutAndFill, type RoadEdges } from './profile';
import { DECK, ROAD_MATERIAL } from './ribbon';

export { DECK } from './ribbon';
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

  return closeGaps(mask, spacing, mergeGap);
}

/**
 * Two or more sets of bridges on one lap made into one (M6.1d-2): every sample on a bridge of any of them, with the
 * gaps shorter than `road.bridges.mergeGap` between bridges closed, as `findBridgeSpans` closes them.
 */
export function joinBridgeSpans(sets: readonly (readonly BridgeSpan[])[], count: number, spacing: number, road: RoadConfig): BridgeSpan[] {
  const mask = new Uint8Array(count);
  for (const spans of sets) mask.set(bridgedMask(spans, count).map((on, i) => on | mask[i]!));
  return closeGaps(mask, spacing, road.bridges.mergeGap);
}

/** The runs of a mask of bridged samples, with the gaps shorter than `mergeGap` between one bridge's last sample and the next one's first closed. */
function closeGaps(mask: Uint8Array, spacing: number, mergeGap: number): BridgeSpan[] {
  const n = mask.length;
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

/**
 * Each bridge's look, by its size (M6.1c, Tane 2026-11-26): wooden if it is no longer than `look.woodMaxLength` and its
 * road stands no higher than `look.woodMaxHeight` above the ground anywhere along it; concrete otherwise.
 *
 * @param ground the ground under the centre line at each sample
 */
export function bridgeKinds(
  spans: readonly BridgeSpan[],
  height: Float64Array,
  ground: Float64Array,
  spacing: number,
  look: Pick<BridgeLookConfig, 'woodMaxLength' | 'woodMaxHeight'>,
): BridgeKind[] {
  const n = height.length;
  return spans.map((span) => {
    let highest = -Infinity;
    for (let k = 0; k < span.sampleCount; k++) {
      const i = (span.startIndex + k) % n;
      highest = Math.max(highest, height[i]! - ground[i]!);
    }
    return spanLength(span, spacing) <= look.woodMaxLength && highest <= look.woodMaxHeight ? 'wood' : 'concrete';
  });
}

/**
 * For each piece of the lap (from a sample to the next), what bridge it is on (M6.1c): `DECK.wood`, `DECK.concrete` or
 * `DECK.none`. With `runOn`, that many pieces more past each end are marked too, as a bridge's railings run on.
 */
export function deckPieces(spans: readonly BridgeSpan[], kinds: readonly BridgeKind[], count: number, runOn = 0): Uint8Array {
  const pieces = new Uint8Array(count);
  spans.forEach((span, s) => {
    const deck = kinds[s] === 'wood' ? DECK.wood : DECK.concrete;
    for (let k = -runOn; k < span.sampleCount - 1 + runOn; k++) pieces[(((span.startIndex + k) % count) + count) % count] = deck;
  });
  return pieces;
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
 * pillar stands where the ground comes within half a metre of the deck. On a wooden bridge (M6.1c-2) they are its
 * trestles' posts, `look.trestle.post` wide in the same places.
 *
 * @param groundAt the finished ground's height (under the sea, its bed)
 * @param kinds each bridge's look (`bridgeKinds`); without them, every pillar is concrete
 */
export function bridgePillars(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  spans: readonly BridgeSpan[],
  groundAt: (x: number, z: number) => number,
  cfg: Pick<GenConfig, 'road'>,
  kinds?: readonly BridgeKind[],
): GateBox[] {
  return pillarRows(line, height, cross, width, spans, groundAt, cfg, kinds).flatMap((row) => row.posts.filter((post) => post !== null));
}

/** One row of a bridge's pillars: the sample it stands at, the bridge it holds up, and its left and right pillars (null where the ground is too near the deck). */
interface PillarRow {
  sample: number;
  span: number;
  posts: [GateBox | null, GateBox | null];
}

function pillarRows(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  spans: readonly BridgeSpan[],
  groundAt: (x: number, z: number) => number,
  cfg: Pick<GenConfig, 'road'>,
  kinds?: readonly BridgeKind[],
): PillarRow[] {
  const rules = cfg.road.bridges;
  const n = line.count;
  const out: PillarRow[] = [];
  for (const [s, span] of spans.entries()) {
    const size = kinds?.[s] === 'wood' ? rules.look.trestle.post : rules.pillarWidth;
    const rows = Math.max(0, Math.ceil(spanLength(span, line.spacing) / rules.pillarSpacing) - 1);
    for (let r = 1; r <= rows; r++) {
      const i = (span.startIndex + Math.round((r * (span.sampleCount - 1)) / (rows + 1))) % n;
      const posts = ([-1, 1] as const).map((side): GateBox | null => {
        const lateral = side * (width[i]! / 2 - rules.pillarInset);
        const top = deckPoint(line, height, cross, i, lateral, rules.deckDepth);
        const foot = groundAt(top.x, top.z) - 0.5;
        if (top.y - foot < 1) return null;
        return {
          x: top.x,
          y: (top.y + foot) / 2,
          z: top.z,
          halfAcross: size / 2,
          halfUp: (top.y - foot) / 2,
          halfAlong: size / 2,
          tx: line.tx[i]!,
          tz: line.tz[i]!,
        };
      });
      out.push({ sample: i, span: s, posts: [posts[0]!, posts[1]!] });
    }
  }
  return out;
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
 * (`bridgePillars`), all in the bridge's concrete. On a wooden bridge (M6.1c) the planks across the road too, drawn
 * where the road's own surface is left out of the drawing (`ROAD_MATERIAL.deckUnder`), and the deck in timber on
 * trestles (M6.1c-2): its posts, a cap beam under the deck and two braces crossing between them (`drawTrestle`).
 *
 * @param kinds each bridge's look (`bridgeKinds`); without them, none is wooden
 */
export function buildBridges(
  line: CenterLine,
  height: Float64Array,
  cross: Float64Array | null,
  width: Float64Array,
  spans: readonly BridgeSpan[],
  groundAt: (x: number, z: number) => number,
  cfg: Pick<GenConfig, 'road'>,
  kinds?: readonly BridgeKind[],
): MeshData {
  const rules = cfg.road.bridges;
  const n = line.count;
  const builder = new MeshBuilder();
  const at = (i: number, lateral: number, below: number): Point => deckPoint(line, height, cross, i, lateral, below);
  const top = rules.topGap;
  const bottom = rules.deckDepth;
  for (const [s, span] of spans.entries()) {
    const wood = kinds?.[s] === 'wood';
    const material = wood ? ROAD_MATERIAL.timber : ROAD_MATERIAL.bridge;
    if (wood) layPlanks(builder, at, line, width, span, rules.look);
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
  for (const row of pillarRows(line, height, cross, width, spans, groundAt, cfg, kinds)) {
    const wood = kinds?.[row.span] === 'wood';
    for (const post of row.posts) if (post) drawBox(builder, post, wood ? ROAD_MATERIAL.timber : ROAD_MATERIAL.bridge);
    if (wood && row.posts[0] && row.posts[1]) drawTrestle(builder, row.posts[0], row.posts[1], rules.look.trestle);
  }
  return builder.build();
}

const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const crossOf = (a: Point, b: Point): Point => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/**
 * A trestle's beam and braces (M6.1c-2), drawn only: a cap beam `beam` deep under the deck from the outer face of one
 * post to the other's, tilted with the deck, and two braces, each from a post's top just under the beam to the other
 * post's foot at the ground, one a little ahead of the other so their faces never lie on each other.
 */
function drawTrestle(builder: MeshBuilder, left: GateBox, right: GateBox, size: TrestleSize): void {
  const along = { x: left.tx, y: 0, z: left.tz };
  const topOf = (post: GateBox): Point => ({ x: post.x, y: post.y + post.halfUp, z: post.z });
  // The posts reach half a metre into the ground; the braces end where they leave it.
  const groundOf = (post: GateBox): Point => ({ x: post.x, y: post.y - post.halfUp + 0.5, z: post.z });
  const leftTop = topOf(left);
  const rightTop = topOf(right);
  const span = minus(leftTop, rightTop);
  const length = Math.hypot(span.x, span.y, span.z);
  const across = unit(span);
  const up = crossOf(along, across);
  const beamHalf = size.beam / 2;
  drawOrientedBox(
    builder,
    {
      centre: { x: (leftTop.x + rightTop.x) / 2 - up.x * beamHalf, y: (leftTop.y + rightTop.y) / 2 - up.y * beamHalf, z: (leftTop.z + rightTop.z) / 2 - up.z * beamHalf },
      half: { x: length / 2 + left.halfAcross, y: beamHalf, z: beamHalf },
      across,
      up,
      along,
    },
    ROAD_MATERIAL.timber,
  );
  const offset = size.brace / 2 + 0.01;
  for (const [from, to, ahead] of [
    [left, right, -1],
    [right, left, 1],
  ] as const) {
    const start = topOf(from);
    start.y -= size.beam;
    const end = groundOf(to);
    const run = minus(start, end);
    const reach = Math.hypot(run.x, run.y, run.z);
    const lengthwise = unit(run);
    drawOrientedBox(
      builder,
      {
        centre: { x: (start.x + end.x) / 2 + along.x * offset * ahead, y: (start.y + end.y) / 2, z: (start.z + end.z) / 2 + along.z * offset * ahead },
        half: { x: reach / 2, y: size.brace / 2, z: size.brace / 2 },
        across: lengthwise,
        up: crossOf(along, lengthwise),
        along,
      },
      ROAD_MATERIAL.timber,
    );
  }
}

/**
 * Draws a box with its own axes (`DeckBox`: `along` times `across` points `up`), each face pointing out. A face's
 * quad runs over two axes P and Q (the corners -P-Q, +P-Q, -P+Q, +P+Q), which faces P times Q (`MeshBuilder.quad`).
 */
function drawOrientedBox(builder: MeshBuilder, box: DeckBox, material: number): void {
  // In the order along, across, up, each axis times the next is the one after it.
  const axes: [Point, number][] = [
    [box.along, box.half.z],
    [box.across, box.half.x],
    [box.up, box.half.y],
  ];
  const corner = (terms: [Point, number][]): Point => {
    const p = { ...box.centre };
    for (const [v, k] of terms) {
      p.x += v.x * k;
      p.y += v.y * k;
      p.z += v.z * k;
    }
    return p;
  };
  for (let a = 0; a < 3; a++) {
    // The face facing +N is spanned by the two axes before N in the cycle (P times Q is N); facing -N, by them swapped.
    const [n, hn] = axes[(a + 2) % 3]!;
    for (const sign of [1, -1]) {
      const [p, hp] = sign > 0 ? axes[a]! : axes[(a + 1) % 3]!;
      const [q, hq] = sign > 0 ? axes[(a + 1) % 3]! : axes[a]!;
      const face = (s: number, t: number): Point => corner([[n, sign * hn], [p, s * hp], [q, t * hq]]);
      builder.quad(face(-1, -1), face(1, -1), face(-1, 1), face(1, 1), material);
    }
  }
}

/**
 * A wooden bridge's planks (M6.1c): across the whole road on its tilted surface, as near `look.plank` wide along the
 * road as fits a whole number in each piece, the dark gap of `look.plankGap` after each, in two browns in turn.
 */
function layPlanks(
  builder: MeshBuilder,
  at: (i: number, lateral: number, below: number) => Point,
  line: CenterLine,
  width: Float64Array,
  span: BridgeSpan,
  look: Pick<BridgeLookConfig, 'plank' | 'plankGap'>,
): void {
  const n = line.count;
  const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  let laid = 0;
  for (let k = 0; k < span.sampleCount - 1; k++) {
    const i = (span.startIndex + k) % n;
    const j = (i + 1) % n;
    const leftI = at(i, -width[i]! / 2, 0);
    const rightI = at(i, width[i]! / 2, 0);
    const leftJ = at(j, -width[j]! / 2, 0);
    const rightJ = at(j, width[j]! / 2, 0);
    const length = Math.hypot(line.x[j]! - line.x[i]!, line.z[j]! - line.z[i]!);
    const count = Math.max(1, Math.round(length / look.plank));
    const gap = Math.min(look.plankGap, length / count / 2) / length;
    for (let p = 0; p < count; p++) {
      const from = p / count;
      const to = (p + 1) / count;
      const edge = to - gap;
      const material = laid++ % 2 === 0 ? ROAD_MATERIAL.plankLight : ROAD_MATERIAL.plankDark;
      builder.quad(lerp(leftI, leftJ, from), lerp(rightI, rightJ, from), lerp(leftI, leftJ, edge), lerp(rightI, rightJ, edge), material);
      builder.quad(lerp(leftI, leftJ, edge), lerp(rightI, rightJ, edge), lerp(leftI, leftJ, to), lerp(rightI, rightJ, to), ROAD_MATERIAL.plankGap);
    }
  }
}
