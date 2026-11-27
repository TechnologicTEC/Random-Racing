import type { GenConfig } from '../../config';
import { Grid } from '../../core/grid';
import { clamp, smoothstep } from '../../core/scalar';
import type { CenterLine, HeightField } from '../types';
import { worldX, worldZ } from './heightfield';
import type { NearestRoad } from './nearest';

export interface FitInput {
  /** The island before the road is cut in. Not changed. */
  natural: HeightField;
  near: NearestRoad;
  line: CenterLine;
  /** Height of the road centre at each sample, in metres. */
  height: Float64Array;
  /**
   * How the road surface tilts at each sample: metres of height gained per
   * metre towards the right of the direction of travel. Null for a level road.
   */
  cross: Float64Array | null;
  /** Width of the road at each sample, in metres. */
  width: Float64Array;
  /**
   * 1 for each sample on a bridge (M6.1b). A bridge takes the place of an embankment, never of a cutting: under it
   * the ground is left as it was where it lies at least `road.bridges.underClearance` below the deck's underside, and
   * cut to the road as anywhere else where it stands higher (inside the deck, out of sight); it pulls no embankment
   * round it, but a cutting beside it is blended into the hillside as anywhere else.
   */
  bridged?: Uint8Array;
}

export interface FitResult {
  /** The island with the road cut and filled into it. */
  ground: HeightField;
  /** 1 for cells under the road or its verges, 0 elsewhere. */
  corridor: Uint8Array;
}

/**
 * The embankment runs this many samples in under each end of a bridge, inside the deck, as its abutment: the ground
 * read between grid cells just before the deck then never dips to the natural ground under it (M6.1b).
 */
const ABUTMENT = 2;

/** True when the piece of the lap from sample i to the next is on a bridge, and not within `ABUTMENT` samples of its ends. */
function onBridge(bridged: Uint8Array, i: number, n: number): boolean {
  for (let k = -ABUTMENT; k <= ABUTMENT + 1; k++) if (!bridged[(((i + k) % n) + n) % n]) return false;
  return true;
}

/**
 * The furthest from the centre line any cutting or embankment can reach, for a road `width` metres wide: half of it,
 * a verge and the longer of the two blends (M6.3b: a cutting's may be longer than an embankment's).
 */
export function fitReach(width: number, cfg: GenConfig): number {
  return width / 2 + cfg.road.verge + Math.max(cfg.road.blendMax, cfg.road.blendCutMax);
}

/**
 * Inside a corner a cutting's wider blend (M6.3b) stops at this share of the corner's radius from the centre line, as
 * a tunnel's lid does: towards a corner's middle the nearest point of the road jumps from one part of it to another,
 * at another height, and a blend reaching there would leave a step in the ground.
 */
const CORNER_SHARE = 0.8;

/**
 * How sharply the lap bends towards each side at each sample, smoothed along it so a cutting's reach inside a corner
 * changes gradually (an arc meets its straights with a jump in curvature): the sharpest bend within `window` metres
 * either way, then averaged over the same stretch. `right` is the bend towards the right of the direction of travel,
 * `left` towards the left, both 0 or more, in 1/metres.
 */
export function smoothBends(line: CenterLine, window: number): { right: Float64Array; left: Float64Array } {
  const n = line.count;
  const w = Math.max(1, Math.round(window / line.spacing));
  const smooth = (sign: number): Float64Array => {
    const sharpest = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let most = 0;
      for (let k = -w; k <= w; k++) most = Math.max(most, sign * line.curvature[(((i + k) % n) + n) % n]!);
      sharpest[i] = most;
    }
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -w; k <= w; k++) sum += sharpest[(((i + k) % n) + n) % n]!;
      out[i] = sum / (2 * w + 1);
    }
    return out;
  };
  return { right: smooth(1), left: smooth(-1) };
}

/** A cell can be within reach of this many separate sections of the lap at once. */
const MAX_SECTIONS = 3;

/**
 * Cuts and fills the island to fit the road.
 *
 * Under the road and its verges the ground follows the road surface, a little
 * below it. Beyond the verge it eases back to the natural ground over 10 to
 * 25 m, wider where the difference is larger, making cuttings and embankments;
 * a deep cutting may take up to `road.blendCutMax` (M6.3b), so it lies back.
 *
 * Where two sections of the lap are close together, the ground between them
 * is worked out from both at once: one surface running from one verge to the
 * other, never two blends laid over each other.
 */
export function fitRoad(input: FitInput, cfg: GenConfig): FitResult {
  const { natural, near, line, height, cross, width, bridged } = input;
  const road = cfg.road;
  /** How far below the road surface the ground under a bridge must stay. */
  const underDeck = road.bridges.deckDepth + road.bridges.underClearance;
  const { size } = natural;
  const n = line.count;
  let widest = 0;
  for (let i = 0; i < n; i++) widest = Math.max(widest, width[i]!);
  // The furthest from the centre line that any cutting or embankment can reach.
  const reach = fitReach(widest, cfg);

  const bends = smoothBends(line, road.blendCutMax);
  const ground: HeightField = { ...natural, height: Float32Array.from(natural.height) };
  const corridor = new Uint8Array(size * size);

  // Samples bucketed by position, so each cell only looks at the road near it.
  const bucket = 12;
  const samples = new Grid(bucket);
  for (let i = 0; i < n; i++) samples.add(samples.cellOf(line.x[i]!), samples.cellOf(line.z[i]!), i);
  const span = Math.ceil((reach + line.spacing) / bucket);
  const sameSection = road.coupleMinArc / line.spacing;

  // The closest point of each nearby section, for the cell being worked on.
  const sectionSample = new Int32Array(MAX_SECTIONS);
  const sectionDistance = new Float64Array(MAX_SECTIONS);
  const sectionHeight = new Float64Array(MAX_SECTIONS);
  /** Half the width of the strip that follows the road there: half the road plus a verge. */
  const sectionCorridor = new Float64Array(MAX_SECTIONS);
  /** 1 where the section's nearest piece is on a bridge. */
  const sectionBridged = new Uint8Array(MAX_SECTIONS);
  /** The longest a cutting's blend may be there: `road.blendCutMax`, less inside a tight corner. */
  const sectionCutMax = new Float64Array(MAX_SECTIONS);

  for (let iz = 0; iz < size; iz++) {
    const z = worldZ(natural, iz);
    for (let ix = 0; ix < size; ix++) {
      const c = iz * size + ix;
      // The quick map of distances is good to about a metre: enough to skip cells nowhere near the road.
      if (near.distance[c]! > reach + 2) continue;
      const x = worldX(natural, ix);

      let sections = 0;
      const bx = samples.cellOf(x);
      const bz = samples.cellOf(z);
      for (let dz = -span; dz <= span; dz++) {
        for (let dx = -span; dx <= span; dx++) {
          for (const i of samples.get(bx + dx, bz + dz) ?? []) {
            // Closest point on the piece of centre line from sample i to the next one.
            const j = (i + 1) % n;
            const ax = line.x[i]!;
            const az = line.z[i]!;
            const abx = line.x[j]! - ax;
            const abz = line.z[j]! - az;
            const lengthSquared = abx * abx + abz * abz;
            const t = clamp(((x - ax) * abx + (z - az) * abz) / lengthSquared, 0, 1);
            const px = x - (ax + abx * t);
            const pz = z - (az + abz * t);
            const distance = Math.sqrt(px * px + pz * pz);
            const corridorHalf = (width[i]! + (width[j]! - width[i]!) * t) / 2 + road.verge;
            if (distance > corridorHalf + Math.max(road.blendMax, road.blendCutMax)) continue;

            // Which section of the lap does this belong to? One we have already met, or a new one.
            let slot = -1;
            for (let s = 0; s < sections; s++) {
              const steps = Math.abs(i - sectionSample[s]!);
              if (steps <= sameSection || n - steps <= sameSection) {
                slot = s;
                break;
              }
            }
            if (slot < 0) {
              if (sections < MAX_SECTIONS) slot = sections++;
              else {
                // No room: replace the furthest section, if this one is nearer.
                slot = 0;
                for (let s = 1; s < MAX_SECTIONS; s++) if (sectionDistance[s]! > sectionDistance[slot]!) slot = s;
                if (distance >= sectionDistance[slot]!) continue;
              }
            } else if (distance >= sectionDistance[slot]!) continue;

            // Height of the road surface here: the centre height, plus the tilt across the road.
            // Out on the bank, the surface is taken as it is at the edge of the verge.
            const length = Math.sqrt(lengthSquared);
            const lateral = clamp((px * -abz + pz * abx) / length, -corridorHalf, corridorHalf);
            const centre = height[i]! + (height[j]! - height[i]!) * t;
            const tilt = cross ? cross[i]! + (cross[j]! - cross[i]!) * t : 0;
            sectionSample[slot] = i;
            sectionDistance[slot] = distance;
            sectionCorridor[slot] = corridorHalf;
            sectionHeight[slot] = centre + lateral * tilt - road.sink;
            sectionBridged[slot] = bridged && onBridge(bridged, i, n) ? 1 : 0;
            // How sharply the road bends towards this side here (lateral is to the right of the direction of travel).
            const side = lateral >= 0 ? bends.right : bends.left;
            const bend = side[i]! + (side[j]! - side[i]!) * t;
            sectionCutMax[slot] = bend > 0 ? Math.max(road.blendMax, Math.min(road.blendCutMax, CORNER_SHARE / bend - corridorHalf)) : road.blendCutMax;
          }
        }
      }
      if (sections === 0) continue;

      // On the road or a verge: the ground is the road surface, sunk a little.
      let onRoad = -1;
      for (let s = 0; s < sections; s++) {
        if (sectionDistance[s]! <= sectionCorridor[s]! && (onRoad < 0 || sectionDistance[s]! < sectionDistance[onRoad]!)) onRoad = s;
      }
      if (onRoad >= 0) {
        if (sectionBridged[onRoad] && natural.height[c]! <= sectionHeight[onRoad]! + road.sink - underDeck) {
          // Under a bridge, clear of the deck: the island as it was. Not the road's strip, so its cover shows.
          ground.height[c] = natural.height[c]!;
          continue;
        }
        ground.height[c] = sectionHeight[onRoad]!;
        corridor[c] = 1;
        continue;
      }

      // On a bank: each nearby section pulls the ground towards its own height,
      // strongly beside its verge and not at all by the end of its blend.
      const wild = natural.height[c]!;
      // A cell a hair beyond a verge gets a pull that rounds to exactly 1, and its weight
      // would be infinite. It is on the verge's edge, so it simply takes that section's height.
      let atEdge = -1;
      for (let s = 0; s < sections; s++) {
        // A bridge pulls no embankment round it; a cutting beside it is blended as anywhere else.
        if (sectionBridged[s] && wild < sectionHeight[s]!) continue;
        const blend = clamp(Math.abs(wild - sectionHeight[s]!) / road.blendSlope, road.blendMin, wild > sectionHeight[s]! ? sectionCutMax[s]! : road.blendMax);
        const pull = 1 - smoothstep(0, blend, sectionDistance[s]! - sectionCorridor[s]!);
        if (pull >= 1 && (atEdge < 0 || sectionDistance[s]! < sectionDistance[atEdge]!)) atEdge = s;
      }
      if (atEdge >= 0) {
        ground.height[c] = sectionHeight[atEdge]!;
        continue;
      }
      let untouched = 1;
      let weighted = 0;
      let weights = 0;
      for (let s = 0; s < sections; s++) {
        if (sectionBridged[s] && wild < sectionHeight[s]!) continue;
        const target = sectionHeight[s]!;
        const blend = clamp(Math.abs(wild - target) / road.blendSlope, road.blendMin, wild > target ? sectionCutMax[s]! : road.blendMax);
        const pull = 1 - smoothstep(0, blend, sectionDistance[s]! - sectionCorridor[s]!);
        if (pull <= 0) continue;
        untouched *= 1 - pull;
        // The weight grows without limit towards the verge, so there the ground meets the road exactly.
        const weight = pull / (1 - pull);
        weighted += weight * target;
        weights += weight;
      }
      if (weights > 0) {
        const shaped = weighted / weights;
        ground.height[c] = wild + (shaped - wild) * (1 - untouched);
      }
    }
  }

  return { ground, corridor };
}
