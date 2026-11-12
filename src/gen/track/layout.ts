import type { EllipseBaseConfig, LayoutConfig, Range, StyleConfig, TrackConfig } from '../../config';
import { dcos, dsin, length2, TAU } from '../../core/dmath';
import { pickWeighted, type Rng } from '../../core/rng';
import type { Vec2 } from '../../core/vec2';
import type { Corner, LayoutStyle } from '../types';
import { roundCorners } from './fillet';
import { castRay, clearanceOk, perimeter, signedArea } from './skeleton';

/**
 * Layout generation.
 *
 * A layout is built as a skeleton: a closed polygon whose corners become the
 * corners of the track. It starts as a simple base shape, then is folded:
 * inlets are pushed into it and fingers out of it. The sides of a fold become
 * parallel straights and its end becomes a hairpin, which is what lets a track
 * double back on itself instead of circling the island. Finally every corner
 * is rounded with an arc of a chosen radius.
 */

export interface Layout {
  style: LayoutStyle;
  /** The skeleton corners, with the radius each was rounded to. */
  corners: Corner[];
  /** The finished centre line as a fine polyline that ends where it starts. */
  x: number[];
  z: number[];
  /** How many tries the builder needed. Failed tries are thrown away. */
  attempts: number;
  /** True when every attempt failed and a plain loop was used instead. */
  plain: boolean;
}

/** What made a skeleton corner, which decides how it is rounded. */
type VertexKind = 'base' | 'pit' | 'tip' | 'jog' | 'bow';

interface Vertex extends Vec2 {
  kind: VertexKind;
}

const between = (rng: Rng, range: Range): number => rng.range(range[0], range[1]);
const countIn = (rng: Rng, range: Range): number => rng.int(range[0], range[1]);

/** Chooses the style for a seed, following the weights in the config. */
export function pickStyle(rng: Rng, layout: LayoutConfig): LayoutStyle {
  const styles: LayoutStyle[] = ['folded', 'stretched', 'round'];
  const index = pickWeighted(rng, styles.map((style) => layout.styles[style].weight));
  return styles[index < 0 ? 0 : index]!;
}

/** Builds one candidate layout in the given style. */
export function generateLayout(rng: Rng, cfg: TrackConfig, style: LayoutStyle): Layout {
  for (let attempt = 0; attempt < cfg.layout.maxAttempts; attempt++) {
    const layout = tryBuild(rng.fork(`attempt-${attempt}`), cfg, style);
    if (layout) return { ...layout, attempts: attempt + 1 };
  }
  return plainLoop(cfg, style);
}

function tryBuild(rng: Rng, cfg: TrackConfig, style: LayoutStyle): Layout | null {
  const rules = cfg.layout;
  const plan = rules.styles[style];
  // The skeleton may grow until its perimeter reaches this budget.
  const budget = rng.range(cfg.lapLengthMin + 150, cfg.lapLengthMax - 100) / rules.lapPerPerimeter;

  let shape: Vertex[] =
    style === 'stretched' ? stretchedBase(rng, rules) : ellipseBase(rng, cfg, rules.base[style], budget);
  if (!shapeOk(shape, cfg)) return null;

  const add = (count: number, grows: number, operate: () => Vertex[] | null): void => {
    for (let k = 0; k < count; k++) {
      if (shape.length + grows > rules.controlPointsMax) return;
      for (let attempt = 0; attempt < 10; attempt++) {
        const next = operate();
        if (next) {
          shape = next;
          break;
        }
      }
    }
  };
  add(countIn(rng, plan.folds), 4, () => tryFold(rng, shape, plan, budget, cfg));
  add(countIn(rng, plan.jogs), 2, () => tryJog(rng, shape, cfg));
  add(countIn(rng, plan.bows), 1, () => tryBow(rng, shape, cfg));

  // If the lap is still well short of what was asked for, fold some more, then
  // grow the whole skeleton to make up the difference.
  for (let extra = 0; extra < 3 && perimeter(shape) < budget * rules.foldMoreBelow; extra++) {
    add(1, 4, () => tryFold(rng, shape, plan, budget, cfg));
  }
  const grow = Math.min(rules.growMax, budget / perimeter(shape));
  if (grow > 1) {
    const grown = shape.map((vertex) => ({ ...vertex, x: vertex.x * grow, z: vertex.z * grow }));
    if (shapeOk(grown, cfg)) shape = grown;
  }

  // Top up with small features until there are enough corners.
  for (let guard = 0; guard < 16 && shape.length < rules.controlPointsMin; guard++) {
    const next = rng.chance(0.5) ? tryBow(rng, shape, cfg) : tryJog(rng, shape, cfg);
    if (next && next.length <= rules.controlPointsMax) shape = next;
  }
  if (shape.length < rules.controlPointsMin || shape.length > rules.controlPointsMax) return null;

  // Half of all tracks run the other way round.
  if (rng.chance(0.5)) shape = shape.slice().reverse();

  const count = shape.length;
  const wanted: Corner[] = shape.map((vertex, i) => {
    const before = shape[(i - 1 + count) % count]!;
    const after = shape[(i + 1) % count]!;
    const ax = vertex.x - before.x, az = vertex.z - before.z;
    const bx = after.x - vertex.x, bz = after.z - vertex.z;
    const cos = (ax * bx + az * bz) / (length2(ax, az) * length2(bx, bz));
    return { x: vertex.x, z: vertex.z, radius: wantedRadius(rng, vertex.kind, cos, rules) };
  });
  const rounded = roundCorners(wanted, rules.minCornerRadius);
  if (!rounded) return null;

  // Resize if needed to bring the lap inside the limits, then centre on the island.
  let lap = 0;
  for (let i = 1; i < rounded.x.length; i++) {
    lap += length2(rounded.x[i]! - rounded.x[i - 1]!, rounded.z[i]! - rounded.z[i - 1]!);
  }
  const shortest = cfg.lapLengthMin + 30;
  const longest = cfg.lapLengthMax - 30;
  const scale = lap < shortest ? shortest / lap : lap > longest ? longest / lap : 1;
  if (scale < rules.scale[0] || scale > rules.scale[1]) return null;
  for (const radius of rounded.radii) {
    if (radius > 0 && radius * scale < rules.minCornerRadius) return null;
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < rounded.x.length; i++) {
    minX = Math.min(minX, rounded.x[i]!);
    maxX = Math.max(maxX, rounded.x[i]!);
    minZ = Math.min(minZ, rounded.z[i]!);
    maxZ = Math.max(maxZ, rounded.z[i]!);
  }
  const centreX = (minX + maxX) / 2;
  const centreZ = (minZ + maxZ) / 2;
  const x = rounded.x.map((value) => (value - centreX) * scale);
  const z = rounded.z.map((value) => (value - centreZ) * scale);

  let furthest = 0;
  for (let i = 0; i < x.length; i++) furthest = Math.max(furthest, x[i]! * x[i]! + z[i]! * z[i]!);
  if (Math.sqrt(furthest) + cfg.roadWidth / 2 + 3 > cfg.buildableRadius) return null;

  const corners = wanted.map((corner, i) => ({
    x: (corner.x - centreX) * scale,
    z: (corner.z - centreZ) * scale,
    radius: rounded.radii[i]! * scale,
  }));
  return { style, corners, x, z, attempts: 1, plain: false };
}

// ---------- Base shapes ----------

/** Corners spaced unevenly around an ellipse, listed clockwise on the map. */
function ellipseBase(rng: Rng, cfg: TrackConfig, base: EllipseBaseConfig, budget: number): Vertex[] {
  const rules = cfg.layout.base;
  const aspect = between(rng, base.aspect);
  const count = countIn(rng, base.corners);
  const basePerimeter = budget * between(rng, base.perimeterShare);
  // Ramanujan's estimate of an ellipse's perimeter, turned round to give its size.
  const halfWidth = basePerimeter / ((TAU / 2) * (3 * (aspect + 1) - Math.sqrt((3 * aspect + 1) * (aspect + 3))));
  const halfLength = Math.min(aspect * halfWidth, cfg.buildableRadius * 0.8);
  const spin = rng.range(0, TAU);
  const phase = rng.range(0, TAU);
  const cos = dcos(spin), sin = dsin(spin);

  const shape: Vertex[] = [];
  for (let i = 0; i < count; i++) {
    const angle = phase + ((i + rng.range(-rules.angleJitter, rules.angleJitter)) * TAU) / count;
    const reach = 1 + rng.range(-rules.radialJitter, rules.radialJitter);
    const ex = halfLength * dcos(angle) * reach;
    const ez = halfWidth * dsin(angle) * reach;
    shape.push({ x: ex * cos - ez * sin, z: ex * sin + ez * cos, kind: 'base' });
  }
  return shape;
}

/** A long thin four-sided shape. Narrow ends become hairpins; wide ends become two corners. */
function stretchedBase(rng: Rng, rules: LayoutConfig): Vertex[] {
  const halfLength = between(rng, rules.base.stretchedHalfLength);
  const halfWidth = (): number => between(rng, rules.base.stretchedHalfWidth);
  const slide = (): number => rng.range(-0.12, 0.12) * halfLength;
  const flat: Vec2[] = [
    { x: -halfLength + slide(), z: -halfWidth() },
    { x: halfLength + slide(), z: -halfWidth() },
    { x: halfLength + slide(), z: halfWidth() },
    { x: -halfLength + slide(), z: halfWidth() },
  ];
  const spin = rng.range(0, TAU);
  const cos = dcos(spin), sin = dsin(spin);
  return flat.map((p) => ({ x: p.x * cos - p.z * sin, z: p.x * sin + p.z * cos, kind: 'base' }));
}

/** A dull but usable loop, for the rare candidate that cannot be built any other way. */
function plainLoop(cfg: TrackConfig, style: LayoutStyle): Layout {
  const wanted: Corner[] = [];
  for (let i = 0; i < 12; i++) {
    const angle = (i * TAU) / 12;
    wanted.push({ x: dcos(angle) * 290, z: dsin(angle) * 290, radius: 80 });
  }
  const rounded = roundCorners(wanted, cfg.layout.minCornerRadius)!;
  const corners = wanted.map((corner, i) => ({ ...corner, radius: rounded.radii[i]! }));
  return { style, corners, x: rounded.x, z: rounded.z, attempts: cfg.layout.maxAttempts, plain: true };
}

// ---------- Operators ----------

interface Edge {
  a: Vertex;
  b: Vertex;
  length: number;
  /** Unit direction from a to b. */
  ux: number;
  uz: number;
}

function edgeAt(shape: readonly Vertex[], index: number): Edge {
  const a = shape[index]!;
  const b = shape[(index + 1) % shape.length]!;
  const length = length2(b.x - a.x, b.z - a.z);
  return { a, b, length, ux: (b.x - a.x) / length, uz: (b.z - a.z) / length };
}

/** Replaces the edge after `index` with a -> inserted... -> b. */
function splice(shape: readonly Vertex[], index: number, inserted: Vertex[]): Vertex[] {
  return [...shape.slice(0, index + 1), ...inserted, ...shape.slice(index + 1)];
}

/** Basic health checks every skeleton must pass after each change. */
function shapeOk(shape: readonly Vertex[], cfg: TrackConfig): boolean {
  const rules = cfg.layout;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < shape.length; i++) {
    if (edgeAt(shape, i).length < rules.minEdge) return false;
    const p = shape[i]!;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  // It must fit the island once centred.
  if (length2(maxX - minX, maxZ - minZ) / 2 > cfg.buildableRadius - cfg.roadWidth) return false;
  return clearanceOk(shape, rules.clearance, rules.clearanceMinArc);
}

/**
 * Pushes an inlet into the shape or a finger out of it, from somewhere along
 * one edge. Narrow folds end in a hairpin; wide folds end in two corners.
 */
function tryFold(rng: Rng, shape: readonly Vertex[], plan: StyleConfig, budget: number, cfg: TrackConfig): Vertex[] | null {
  const rules = cfg.layout;
  const fold = rules.fold;
  const spare = budget - perimeter(shape);
  if (spare < fold.depthMin * 2) return null;

  const inward = rng.chance(plan.inwardChance);
  const narrow = rng.chance(plan.narrowChance);
  const pointed = narrow && rng.chance(fold.tipChance);
  const width = between(rng, pointed ? fold.tipWidth : narrow ? fold.hairpinWidth : fold.wideWidth);
  // On a clockwise loop the inside is to the right of each edge.
  const side = (signedArea(shape) >= 0 ? 1 : -1) * (inward ? 1 : -1);
  const reachLimit = inward ? Infinity : fold.outwardReach;
  const roomFrom = (index: number, edge: Edge, along: number): number => {
    const ox = edge.a.x + edge.ux * along;
    const oz = edge.a.z + edge.uz * along;
    return Math.min(reachLimit, castRay(shape, index, ox, oz, -edge.uz * side, edge.ux * side) - rules.clearance);
  };

  // Prefer long edges with plenty of room in front of them: that is where long parallel straights come from.
  const weights = shape.map((_, index) => {
    const edge = edgeAt(shape, index);
    if (edge.length < width + fold.shoulder * 2) return 0;
    const room = roomFrom(index, edge, edge.length / 2);
    return room >= fold.depthMin ? edge.length * Math.min(room, 600) : 0;
  });
  const index = pickWeighted(rng, weights);
  if (index < 0) return null;

  const edge = edgeAt(shape, index);
  const centre = rng.range(fold.shoulder + width / 2, edge.length - fold.shoulder - width / 2);
  const room = Math.min(
    roomFrom(index, edge, centre - width / 2),
    roomFrom(index, edge, centre + width / 2),
    spare / 2,
  );
  if (room < fold.depthMin) return null;
  let depth = Math.max(fold.depthMin, room * between(rng, plan.foldDepth));
  if (pointed) depth = Math.max(depth, width * 0.9);
  if (depth > room) return null;
  const lean = rng.range(-fold.skew, fold.skew) * (narrow ? 0.7 : 1);

  const nx = -edge.uz * side;
  const nz = edge.ux * side;
  const mouth = (along: number): Vertex => ({ x: edge.a.x + edge.ux * along, z: edge.a.z + edge.uz * along, kind: 'base' });
  const end = (along: number, kind: VertexKind): Vertex => ({
    x: edge.a.x + edge.ux * (along + lean * depth) + nx * depth,
    z: edge.a.z + edge.uz * (along + lean * depth) + nz * depth,
    kind,
  });

  for (let shrink = 0; shrink < 3; shrink++) {
    const inserted = pointed
      ? [mouth(centre - width / 2), end(centre, 'tip'), mouth(centre + width / 2)]
      : [
          mouth(centre - width / 2),
          end(centre - width / 2, narrow ? 'pit' : 'base'),
          end(centre + width / 2, narrow ? 'pit' : 'base'),
          mouth(centre + width / 2),
        ];
    const next = splice(shape, index, inserted);
    if (shapeOk(next, cfg)) return next;
    depth *= 0.72;
    if (depth < fold.depthMin || (pointed && depth < width * 0.9)) break;
  }
  return null;
}

/** Steps an edge sideways part way along, making a quick left-right or right-left flick. */
function tryJog(rng: Rng, shape: readonly Vertex[], cfg: TrackConfig): Vertex[] | null {
  const jog = cfg.layout.jog;
  const index = pickWeighted(rng, shape.map((_, i) => {
    const length = edgeAt(shape, i).length;
    return length >= jog.minEdge ? length : 0;
  }));
  if (index < 0) return null;

  const edge = edgeAt(shape, index);
  const run = between(rng, jog.length);
  const step = between(rng, jog.offset) * (rng.chance(0.5) ? 1 : -1);
  if (edge.length - jog.margin * 2 - run <= 0) return null;
  const start = rng.range(jog.margin, edge.length - jog.margin - run);
  const next = splice(shape, index, [
    { x: edge.a.x + edge.ux * start, z: edge.a.z + edge.uz * start, kind: 'jog' },
    {
      x: edge.a.x + edge.ux * (start + run) - edge.uz * step,
      z: edge.a.z + edge.uz * (start + run) + edge.ux * step,
      kind: 'jog',
    },
  ]);
  return shapeOk(next, cfg) ? next : null;
}

/** Pushes the middle of a long edge sideways, so a straight becomes a long gentle curve. */
function tryBow(rng: Rng, shape: readonly Vertex[], cfg: TrackConfig): Vertex[] | null {
  const bow = cfg.layout.bow;
  const index = pickWeighted(rng, shape.map((_, i) => {
    const length = edgeAt(shape, i).length;
    return length >= bow.minEdge ? length : 0;
  }));
  if (index < 0) return null;

  const edge = edgeAt(shape, index);
  const along = edge.length * rng.range(0.35, 0.65);
  const outward = rng.chance(bow.outwardChance);
  const side = (signedArea(shape) >= 0 ? 1 : -1) * (outward ? -1 : 1);
  const push = edge.length * between(rng, bow.push) * side;
  const next = splice(shape, index, [
    { x: edge.a.x + edge.ux * along - edge.uz * push, z: edge.a.z + edge.uz * along + edge.ux * push, kind: 'bow' },
  ]);
  return shapeOk(next, cfg) ? next : null;
}

// ---------- Small helpers ----------

/**
 * The radius a corner should be rounded to, from what made it and how sharply
 * the skeleton turns there (given as the cosine of the turn angle).
 */
function wantedRadius(rng: Rng, kind: VertexKind, turnCos: number, rules: LayoutConfig): number {
  const radius = rules.radius;
  switch (kind) {
    case 'pit':
      // As big as fits: the two corners at the end of a narrow fold meet and form one hairpin.
      return 100000;
    case 'tip':
      return between(rng, radius.tip);
    case 'jog':
      return between(rng, radius.jog);
    case 'bow':
      return between(rng, radius.bow);
    case 'base':
      if (turnCos <= -0.5) return between(rng, radius.hairpin); // 120 degrees or more
      if (turnCos <= 0.5) {
        // 60 to 120 degrees
        return rng.chance(radius.mediumSweeperChance) ? between(rng, radius.mediumSweeper) : between(rng, radius.medium);
      }
      if (turnCos <= 0.906) {
        // 25 to 60 degrees
        return rng.chance(radius.shallowSweeperChance) ? between(rng, radius.shallowSweeper) : between(rng, radius.shallow);
      }
      return between(rng, radius.slight);
  }
}
