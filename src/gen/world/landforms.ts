import type { HillsConfig, LandformConfig, PeakConfig, RangeConfig } from '../../config';
import { dcos, dsin, TAU } from '../../core/dmath';
import { createNoise, ridged, softRidged, type Noise2 } from '../../core/noise';
import type { Rng } from '../../core/rng';
import type { Vec2 } from '../../core/vec2';
import type { LandformKind } from '../types';

/**
 * The shapes an island's mountains can have: a lone peak, a ridged range of
 * sharp peaks joined by cols, or rolling hill country. Each is built around a
 * main summit and gives its height above the ground it stands on at any
 * point. Plain numbers only: exact maths, no rendering.
 *
 * Each shape is sized from its height so that its smooth form keeps within its
 * slope limit, with room left for the rock that noise adds.
 */

/** A summit: where it is and its height above the landform's base, in metres. */
export interface Summit extends Vec2 {
  height: number;
}

export interface Landform {
  kind: LandformKind;
  /** Height above the ground it stands on, in metres. 0 beyond its foot. */
  height(x: number, z: number): number;
  /** About how far a point is outside the foot, in metres; 0 or less on the landform. */
  outside(x: number, z: number): number;
  /** Its summits, the main one first. */
  summits: Summit[];
  /** For a range, the line through its summits from one end to the other; empty for the other shapes. */
  spine: Vec2[];
  /** A box that holds the whole foot. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Where the main summit stands and how high it rises above the ground there, in metres. */
export interface LandformSize extends Vec2 {
  height: number;
}

export function buildLandform(rng: Rng, kind: LandformKind, size: LandformSize, cfg: LandformConfig): Landform {
  switch (kind) {
    case 'peak':
      return buildPeak(rng.fork('peak'), size, cfg.peak);
    case 'range':
      return buildRange(rng.fork('range'), size, cfg.range);
    case 'hills':
      return buildHills(rng.fork('hills'), size, cfg.hills);
  }
}

// ---------- Shared pieces ----------

/** A pattern of noise placed somewhere random, so no two landforms share one. */
interface Placed {
  noise: Noise2;
  u: number;
  v: number;
}

function placeNoise(rng: Rng): Placed {
  const noise = createNoise(rng.fork('noise'));
  const offset = rng.fork('offset');
  return { noise, u: offset.range(-500, 500), v: offset.range(-500, 500) };
}

/**
 * A wavy outline: for each direction (ux, uz), the radius as a share of the usual one, and how fast
 * that share changes with angle. One, two and three swings round, each at its own angle. Multiples of
 * the angle come from repeated rotation, so no inexact maths is needed.
 */
type Outline = (ux: number, uz: number) => { f: number; df: number };

function wavyOutline(rng: Rng, lobes: readonly number[]): { outline: Outline; widest: number; narrowest: number } {
  const waves = lobes.map((most, i) => {
    const phase = rng.fork(`lobe-${i}`).range(0, TAU);
    return { a: most * rng.fork(`lobe-size-${i}`).range(0.6, 1), cos: dcos(phase), sin: dsin(phase) };
  });
  const outline: Outline = (ux, uz) => {
    let c = 1;
    let s = 0;
    let f = 1;
    let df = 0;
    waves.forEach((wave, i) => {
      const k = i + 1;
      const next = c * ux - s * uz;
      s = s * ux + c * uz;
      c = next;
      f += wave.a * (c * wave.cos - s * wave.sin);
      df -= wave.a * k * (s * wave.cos + c * wave.sin);
    });
    return { f, df };
  };
  let widest = 1;
  for (const wave of waves) widest += wave.a;
  return { outline, widest, narrowest: 2 - widest };
}

/**
 * The larger of two heights, with the join between them rounded over up to `blend` metres. Never below
 * the larger, and no steeper than the steeper of the two plus a quarter of the lower one's slope. Where
 * either is 0 it is simply the other, so ground outside both stays at 0.
 */
function smoothMax(a: number, b: number, blend: number): number {
  const k = Math.min(blend, a, b);
  if (k <= 0) return Math.max(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
}

// ---------- One mountain ----------

/** The shape of a mountain's sides, from 1 at the summit (t = 0) to 0 at the foot (t = 1), and its slope. */
interface Profile {
  at(t: number): number;
  slope(t: number): number;
}

/**
 * A lone peak's profile. `concave` from 0 to 1 blends a plain rounded hill (0) with a rounded top,
 * steep upper slopes and a long gentle foot (1).
 */
const peakProfile = (concave: number): Profile => ({
  at: (t) => concave * (1 - t) * (1 - t) * (1 - t) * (1 + 3 * t) + (1 - concave) * (1 - t) * (1 - t) * (1 + 2 * t),
  slope: (t) => concave * -12 * t * (1 - t) * (1 - t) + (1 - concave) * -6 * t * (1 - t),
});

/** A spire: steepest at its sharp top, flattening all the way down. */
const SPIRE: Profile = { at: (t) => (1 - t) * (1 - t), slope: (t) => -2 * (1 - t) };

/** The tip of a spire is rounded over about this many metres, so no point is left for a 3 m grid triangle to straddle. */
const ROUNDING = 4;
/** A distance with its first few metres rounded off: 0 at 0, with no corner there, and never changing faster than the distance itself. */
const rounded = (distance: number): number => Math.sqrt(distance * distance + ROUNDING * ROUNDING) - ROUNDING;

interface MountainShape {
  height: number;
  slope: number;
  /** Share of the slope the smooth shape may use; the rest is left for the rock. */
  share: number;
  lobes: readonly number[];
  profile: Profile;
  rockDepth: number;
  /** Size of the rock pattern as a share of the foot's radius. */
  rockSize: number;
  /** Sharp rock (ridged noise) or rounded rock (soft ridged noise). */
  sharpRock: boolean;
  /** Round off the very top (for spires). */
  roundTop: boolean;
}

interface Mountain {
  x: number;
  z: number;
  height: number;
  /** Height above the base, with and without its rock. */
  at(x: number, z: number): number;
  smooth(x: number, z: number): number;
  outside(x: number, z: number): number;
  /** Furthest its foot reaches from its summit, in metres. */
  reach: number;
}

function buildMountain(rng: Rng, x: number, z: number, shape: MountainShape): Mountain {
  const H = shape.height;
  const { outline, widest } = wavyOutline(rng.fork('outline'), shape.lobes);
  const { profile } = shape;

  // The smallest base radius whose smooth shape is nowhere steeper than its share of the slope,
  // measured over directions and distances for a base radius of 1.
  let worst = 0;
  for (let i = 0; i < 360; i++) {
    const angle = (i * TAU) / 360;
    const { f, df } = outline(dcos(angle), dsin(angle));
    for (let j = 0; j < 50; j++) {
      const radial = profile.slope(j / 50) / f;
      // The foot's radius changing with angle tilts the slope sideways.
      const across = (-radial * df) / f;
      worst = Math.max(worst, Math.sqrt(radial * radial + across * across));
    }
  }
  const base = (H * worst) / (shape.slope * shape.share);

  const rock = placeNoise(rng.fork('rock'));
  const rockSize = base * shape.rockSize;

  const smoothParts = (px: number, pz: number): { g: number; dx: number; dz: number } => {
    const dx = px - x;
    const dz = pz - z;
    const r = Math.sqrt(dx * dx + dz * dz);
    if (r === 0) return { g: 1, dx, dz };
    const t = (shape.roundTop ? rounded(r) : r) / (base * outline(dx / r, dz / r).f);
    return { g: t >= 1 ? 0 : profile.at(t), dx, dz };
  };
  const smooth = (px: number, pz: number): number => H * smoothParts(px, pz).g;
  const at = (px: number, pz: number): number => {
    const { g, dx, dz } = smoothParts(px, pz);
    if (g <= 0) return 0;
    const u = rock.u + dx / rockSize;
    const v = rock.v + dz / rockSize;
    const pattern = shape.sharpRock ? ridged(rock.noise, u, v, 2) : softRidged(rock.noise, u, v, 2);
    // The rock fades out at the summit and at the foot, so neither moves.
    return Math.max(0, H * g * (1 + shape.rockDepth * (1 - g) * (pattern - 0.5)));
  };
  const outside = (px: number, pz: number): number => {
    const dx = px - x;
    const dz = pz - z;
    const r = Math.sqrt(dx * dx + dz * dz);
    if (r === 0) return -base;
    // Measured the same way as the height, so the foot ends exactly where the height reaches 0.
    return (shape.roundTop ? rounded(r) : r) - base * outline(dx / r, dz / r).f;
  };
  return { x, z, height: H, at, smooth, outside, reach: base * widest + ROUNDING };
}

// ---------- Lone peak ----------

function buildPeak(rng: Rng, size: LandformSize, cfg: PeakConfig): Landform {
  const mountain = buildMountain(rng, size.x, size.z, {
    height: size.height,
    slope: cfg.slope,
    // Some peaks are steeper than others, so two of the same height are not the same size.
    share: rng.fork('steepness').range(cfg.smoothShare[0], cfg.smoothShare[1]),
    lobes: cfg.lobes,
    profile: peakProfile(rng.fork('concave').range(cfg.concave[0], cfg.concave[1])),
    rockDepth: cfg.rockDepth,
    rockSize: cfg.rockSize,
    sharpRock: false,
    roundTop: false,
  });
  const { reach } = mountain;
  return {
    kind: 'peak',
    height: mountain.at,
    outside: mountain.outside,
    summits: [{ x: size.x, z: size.z, height: size.height }],
    spine: [],
    bounds: { minX: size.x - reach, maxX: size.x + reach, minZ: size.z - reach, maxZ: size.z + reach },
  };
}

// ---------- Ridged range ----------

/** Lowest point of the smooth ground on the straight line between two mountains' summits. */
function colBetween(a: Mountain, b: Mountain): number {
  let lowest = Infinity;
  for (let k = 1; k < 60; k++) {
    const t = k / 60;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    lowest = Math.min(lowest, Math.max(a.smooth(x, z), b.smooth(x, z)));
  }
  return lowest;
}

function buildRange(rng: Rng, size: LandformSize, cfg: RangeConfig): Landform {
  const H = size.height;
  const count = rng.fork('count').int(cfg.peaks[0], cfg.peaks[1]);
  const main = rng.fork('main').int(0, count - 1);
  const heading = rng.fork('heading').range(0, TAU);
  // The line of peaks bends gently: this much turn per metre.
  const turn = rng.fork('bend').range(-cfg.bend, cfg.bend) / cfg.length;

  const spire = (pick: Rng, x: number, z: number, height: number): Mountain =>
    buildMountain(pick, x, z, {
      height,
      slope: cfg.slope,
      share: pick.fork('steepness').range(cfg.smoothShare[0], cfg.smoothShare[1]),
      lobes: cfg.lobes,
      profile: SPIRE,
      rockDepth: cfg.rockDepth,
      rockSize: cfg.rockSize,
      sharpRock: true,
      roundTop: true,
    });

  // Outward from the main peak along the line, one way and then the other. Each peak is lower than
  // its neighbour nearer the main one, and stands just far enough from it that the col between them
  // comes out at the share of the lower one drawn for it.
  const placed: Array<{ mountain: Mountain; order: number }> = [{ mountain: spire(rng.fork('peak-main'), size.x, size.z, H), order: 0 }];
  for (const side of [1, -1] as const) {
    const wanted = side === 1 ? count - 1 - main : main;
    let previous = placed[0]!.mountain;
    let along = 0;
    for (let k = 1; k <= wanted; k++) {
      const pick = rng.fork(`peak-${side}-${k}`);
      const height = Math.max(cfg.lowest * H, previous.height * pick.range(cfg.neighbour[0], cfg.neighbour[1]));
      const share = pick.range(cfg.saddle[0], cfg.saddle[1]);
      const direction = heading + (side === 1 ? 0 : TAU / 2) + turn * along * side;
      const ux = dcos(direction);
      const uz = dsin(direction);
      const from = previous;
      const make = (gap: number): Mountain => spire(pick.fork('shape'), from.x + ux * gap, from.z + uz * gap, height);
      // Further apart means a lower col: find the gap that gives the col wanted.
      let near = cfg.gapMin;
      let far = from.reach + 400;
      for (let step = 0; step < 24; step++) {
        const gap = (near + far) / 2;
        if (colBetween(from, make(gap)) > share * height) near = gap;
        else far = gap;
      }
      const next = make((near + far) / 2);
      // The range never runs on further than its length allows.
      const span = Math.sqrt((next.x - size.x) ** 2 + (next.z - size.z) ** 2);
      if (span > cfg.length / 2 + cfg.length * 0.2 && placed.length >= 3) break;
      placed.push({ mountain: next, order: side * k });
      previous = next;
      along += (near + far) / 2;
    }
  }
  placed.sort((a, b) => a.order - b.order);
  // Keep the whole range within its length: trim the end peak furthest from the main one while it is too long.
  const spanOf = (list: typeof placed): number => {
    const a = list[0]!.mountain;
    const b = list[list.length - 1]!.mountain;
    return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
  };
  while (placed.length > 3 && spanOf(placed) > cfg.length) {
    if (-placed[0]!.order > placed[placed.length - 1]!.order) placed.shift();
    else placed.pop();
  }
  const mountains = placed.map((p) => p.mountain);

  const height = (x: number, z: number): number => {
    let total = 0;
    for (const mountain of mountains) total = smoothMax(total, mountain.at(x, z), cfg.blend);
    return total;
  };
  const outside = (x: number, z: number): number => {
    let nearest = Infinity;
    for (const mountain of mountains) nearest = Math.min(nearest, mountain.outside(x, z));
    return nearest;
  };

  // The line through the summits, in steps of about 10 m.
  const spine: Vec2[] = [];
  for (let i = 0; i + 1 < mountains.length; i++) {
    const a = mountains[i]!;
    const b = mountains[i + 1]!;
    const steps = Math.max(1, Math.round(Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2) / 10));
    for (let k = 0; k < steps; k++) spine.push({ x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps });
  }
  const lastPeak = mountains[mountains.length - 1]!;
  spine.push({ x: lastPeak.x, z: lastPeak.z });

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const m of mountains) {
    minX = Math.min(minX, m.x - m.reach);
    maxX = Math.max(maxX, m.x + m.reach);
    minZ = Math.min(minZ, m.z - m.reach);
    maxZ = Math.max(maxZ, m.z + m.reach);
  }

  const others = mountains
    .filter((m) => m.x !== size.x || m.z !== size.z)
    .map((m) => ({ x: m.x, z: m.z, height: m.height }))
    .sort((a, b) => b.height - a.height);
  return {
    kind: 'range',
    height,
    outside,
    summits: [{ x: size.x, z: size.z, height: H }, ...others],
    spine,
    bounds: { minX, maxX, minZ, maxZ },
  };
}

// ---------- Rolling hill country ----------

/** A bell is steepest part way down, at this many times its height over its radius. */
const BELL_STEEPEST = 8 / (3 * Math.sqrt(3));

interface Swell extends Vec2 {
  height: number;
  /** Half its length and half its width, in metres, and the direction of its length. */
  long: number;
  short: number;
  cos: number;
  sin: number;
}

const swellAt = (swell: Swell, x: number, z: number): number => {
  const dx = x - swell.x;
  const dz = z - swell.z;
  const a = (dx * swell.cos + dz * swell.sin) / swell.long;
  const b = (-dx * swell.sin + dz * swell.cos) / swell.short;
  const q = a * a + b * b;
  return q >= 1 ? 0 : swell.height * (1 - q) * (1 - q);
};

function buildHills(rng: Rng, size: LandformSize, cfg: HillsConfig): Landform {
  const H = size.height;
  const dome = cfg.dome * H;
  const { outline, widest, narrowest } = wavyOutline(rng.fork('outline'), cfg.lobes);
  // The dome reaches well beyond the main swell, so its slope is a small share of the swells'.
  const swellSlope = (cfg.slope * (1 - cfg.margin)) / (1 + dome / (cfg.domeReach * narrowest * (H - dome)));
  const radiusFor = (height: number): number => (BELL_STEEPEST * height) / swellSlope;

  const shape = (pick: Rng, x: number, z: number, height: number): Swell => {
    const short = radiusFor(height);
    const angle = pick.range(0, TAU);
    return { x, z, height, short, long: short * pick.range(cfg.aspect[0], cfg.aspect[1]), cos: dcos(angle), sin: dsin(angle) };
  };
  const swells: Swell[] = [shape(rng.fork('main'), size.x, size.z, H - dome)];
  const domeRadius = cfg.domeReach * swells[0]!.long;
  /** The swells run into each other: where they meet, the higher one wins, with the join rounded. */
  const combined = (x: number, z: number): number => {
    let total = 0;
    for (const swell of swells) total = smoothMax(total, swellAt(swell, x, z), cfg.blend);
    return total;
  };
  /** How far out on the dome a point is: 0 in the middle, 1 at its wavy edge. */
  const onDome = (x: number, z: number): number => {
    const dx = x - size.x;
    const dz = z - size.z;
    const r = Math.sqrt(dx * dx + dz * dz);
    return r === 0 ? 0 : r / (domeRadius * outline(dx / r, dz / r).f);
  };

  const count = rng.fork('count').int(cfg.swells[0], cfg.swells[1]);
  for (let k = 1; k < count; k++) {
    const pick = rng.fork(`swell-${k}`);
    for (let attempt = 0; attempt < 40; attempt++) {
      const from = swells[pick.int(0, swells.length - 1)]!;
      const height = (H - dome) * pick.range(cfg.others[0], cfg.others[1]);
      const angle = pick.range(0, TAU);
      const candidate = shape(pick, 0, 0, height);
      const distance = (from.long + candidate.long) * pick.range(cfg.spread[0], cfg.spread[1]);
      const x = from.x + dcos(angle) * distance;
      const z = from.z + dsin(angle) * distance;
      // It must stand out as its own swell, never top the main one, and lie on the dome.
      const under = combined(x, z);
      if (under > 0.4 * height || under + height > 0.95 * (H - dome)) continue;
      let fits = true;
      for (let j = 0; j < 16 && fits; j++) {
        const a = (j * TAU) / 16;
        if (onDome(x + dcos(a) * candidate.long, z + dsin(a) * candidate.long) > 0.98) fits = false;
      }
      if (!fits) continue;
      swells.push({ ...candidate, x, z });
      break;
    }
  }

  const height = (x: number, z: number): number => {
    const t = onDome(x, z);
    if (t >= 1) return 0;
    const t2 = t * t;
    return dome * (1 - t2) * (1 - t2) + combined(x, z);
  };
  const outside = (x: number, z: number): number => (onDome(x, z) - 1) * domeRadius;

  const reach = domeRadius * widest;
  return {
    kind: 'hills',
    height,
    outside,
    summits: swells.map((swell, i) => ({ x: swell.x, z: swell.z, height: i === 0 ? H : height(swell.x, swell.z) })),
    spine: [],
    bounds: { minX: size.x - reach, maxX: size.x + reach, minZ: size.z - reach, maxZ: size.z + reach },
  };
}
