import type { LandformConfig, ReliefConfig } from '../../config';
import { dcos, dsin, TAU } from '../../core/dmath';
import { createNoise } from '../../core/noise';
import { createRng } from '../../core/rng';
import { clamp01 } from '../../core/scalar';
import type { Character, ReliefKind } from '../types';
import { buildLandform, type Landform } from './landforms';

/** Height of the natural ground at a point on the map, in metres above the sea. */
export type Relief = (x: number, z: number) => number;

/**
 * The high ground a hilly or mountain seed has to one side of its track. The
 * track sits on its flank, which slopes up towards it across the whole
 * buildable area.
 */
export interface Highland {
  /** The middle of its flat top. */
  x: number;
  z: number;
  /** Radius of the flat top, in metres. */
  plateau: number;
  /** Height of the top above the lowland, in metres. */
  height: number;
  /** The flank reaches the lowland this far from the middle of the top, in metres. */
  radius: number;
}

/** The parts of a seed's character its relief depends on. */
export type ReliefTraits = Pick<Character, 'relief' | 'landform' | 'route'>;

/**
 * The main mountain of a mountain seed: a cone the road can climb, a flat
 * shoulder near the top, and the steep top itself, in the seed's landform.
 * Heights are above the lowland and its hills, in metres.
 */
export interface Massif {
  /** The summit. */
  x: number;
  z: number;
  /** Height of the summit: the cone's height at the shoulder plus the top's. */
  summit: number;
  /** Height of the cone at its shoulder, where the top stands. */
  cone: number;
  /** Radius of the flat shoulder round the summit. */
  shoulder: number;
  /** The cone reaches the lowland this far from the summit. */
  reach: number;
  /** The top: its main summit is the massif's summit, and its height is above the shoulder. */
  top: Landform;
}

/**
 * The ground a seed's track is laid over: broad hills with smaller rises on
 * top and wide lowlands between them and, for hilly seeds, the long flank of a
 * highland for the lap to climb; for mountain seeds, a massif the lap climbs
 * onto or goes round.
 *
 * It depends only on the seed and its character, never on the track, so
 * every candidate layout can be judged against the same ground.
 *
 * @param reach radius of the buildable area, in metres
 * @param massif the seed's massif, if already placed (see placeMassif)
 */
export function createRelief(
  seed: number,
  cfg: ReliefConfig,
  landforms: LandformConfig,
  traits: ReliefTraits,
  reach: number,
  massif: Massif | null = placeMassif(seed, cfg, landforms, traits),
): Relief {
  const kind = traits.relief;
  const rng = createRng(seed, 'world').fork('relief');
  const broad = createNoise(rng.fork('broad'));
  const fine = createNoise(rng.fork('fine'));
  // Each seed looks at a different part of the pattern, so no two share a centre.
  const offsetX = rng.range(-500, 500);
  const offsetZ = rng.range(-500, 500);
  const { hillHeight, flankSlope } = cfg.kinds[kind];
  const highland = placeHighland(seed, cfg, kind, reach);
  const { ease } = cfg.highland;
  // Length of the flank, from its foot to the edge of the flat top.
  const flank = highland ? highland.radius - highland.plateau : 0;
  const cone = cfg.massif;

  return (x, z) => {
    const mixed =
      broad(x / cfg.scale + offsetX, z / cfg.scale + offsetZ) * (1 - cfg.fineShare) +
      fine(x / cfg.fineScale + offsetX, z / cfg.fineScale + offsetZ) * cfg.fineShare;
    // Squaring keeps the lowlands wide and nearly flat and gathers the height into the hills.
    const t = clamp01(0.5 + 0.5 * mixed);
    let height = cfg.lowland + hillHeight * t * t;
    if (highland) {
      const dx = x - highland.x;
      const dz = z - highland.z;
      // How far up the flank this point is, measured from its foot towards the top.
      const up = highland.radius - Math.sqrt(dx * dx + dz * dz);
      height += flankSlope * climbed(up, flank, ease);
    }
    if (massif) {
      const dx = x - massif.x;
      const dz = z - massif.z;
      const fromSummit = Math.sqrt(dx * dx + dz * dz);
      if (fromSummit < massif.reach) height += cone.slope * risen(massif.reach - Math.max(fromSummit, massif.shoulder), cone.ease);
      height += massif.top.height(x, z);
    }
    return height;
  };
}

/**
 * A mountain seed's massif, or null for other kinds of relief. Its direction
 * from the centre comes from the seed, its distance and shoulder from the
 * seed's route, its top from the seed's landform.
 */
export function placeMassif(seed: number, cfg: ReliefConfig, landforms: LandformConfig, traits: ReliefTraits): Massif | null {
  if (traits.relief !== 'mountain' || !traits.route) return null;
  const rules = cfg.massif;
  const { distance, shoulder, top: tops } = rules.routes[traits.route];
  const rng = createRng(seed, 'world').fork('relief').fork('massif');
  const angle = rng.fork('direction').range(0, TAU);
  const x = dcos(angle) * distance;
  const z = dsin(angle) * distance;
  const reach = distance + rules.beyond;
  const cone = rules.slope * risen(reach - shoulder, rules.ease);
  const [low, high] = tops[traits.landform];
  const topHeight = rng.fork('top-height').range(low, high);
  // A range on top is kept short, so the lap can get round it.
  const shapes: LandformConfig = { ...landforms, range: { ...landforms.range, length: Math.min(landforms.range.length, rules.rangeLength) } };
  const top = buildLandform(rng.fork('top'), traits.landform, { x, z, height: topHeight }, shapes);
  return { x, z, summit: cone + topHeight, cone, shoulder, reach, top };
}

/** Height gained `up` metres up a slope that rises one metre per metre, easing in over its first `ease` metres. */
function risen(up: number, ease: number): number {
  if (up <= 0) return 0;
  if (up < ease) return (up * up) / (2 * ease);
  return up - ease / 2;
}

/**
 * Where a seed's highland is, or null for kinds of relief that have none.
 * Its direction from the centre comes from the seed; its size from the config.
 */
export function placeHighland(seed: number, cfg: ReliefConfig, kind: ReliefKind, reach: number): Highland | null {
  const { flankSlope } = cfg.kinds[kind];
  if (flankSlope <= 0) return null;
  const { foot, margin, plateau, ease } = cfg.highland;
  const angle = createRng(seed, 'world').fork('relief').fork('highland').range(0, TAU);
  // Far enough out that the flat top begins beyond the buildable area.
  const fromCentre = plateau + margin + reach;
  const radius = fromCentre + foot;
  return {
    x: dcos(angle) * fromCentre,
    z: dsin(angle) * fromCentre,
    plateau,
    height: flankSlope * climbed(radius - plateau, radius - plateau, ease),
    radius,
  };
}

/**
 * Height gained `up` metres along a flank `length` metres long that rises one
 * metre per metre, easing in over its first `ease` metres and out over its
 * last. Never steeper than one in one, so the flank is never steeper than its slope.
 */
function climbed(up: number, length: number, ease: number): number {
  if (up <= 0) return 0;
  if (up < ease) return (up * up) / (2 * ease);
  if (up < length - ease) return up - ease / 2;
  if (up < length) return length - ease - ((length - up) * (length - up)) / (2 * ease);
  return length - ease;
}
