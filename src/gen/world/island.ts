import type { GenConfig } from '../../config';
import { createNoise, fbm, softRidged, type Noise2 } from '../../core/noise';
import { createRng, type Rng } from '../../core/rng';
import { clamp01, lerp, smoothstep } from '../../core/scalar';
import type { CenterLine, HeightField, RoadProfile } from '../types';
import { createField, worldX, worldZ } from './heightfield';
import { insideLoop, nearestRoad, type NearestRoad } from './nearest';
import { createRelief, type Relief } from './relief';

/** The land a track sits on, before the road is cut into it. */
export interface Island {
  /** Natural ground and sea bed, in metres above the sea (negative under water). */
  natural: HeightField;
  /** Nearest point of the track for every cell. */
  near: NearestRoad;
  /** 1 for cells the track encloses, 0 for the rest. */
  inside: Uint8Array;
}

/** The smooth join between the land and the coastal slope is rounded over this height, in metres. */
const JOIN = 3;

/**
 * Builds the island around a track.
 *
 * Everything the loop encloses is land. Outside it the land runs on for a
 * margin beyond the road, then falls to the sea. The margin is short where the
 * road is low, so low sections run beside a beach, and longer where the road is
 * high, so the ground has room to come down. Noise wobbles the coast and pushes
 * out a few headlands, and tall peaks rise only where they are clear of the road.
 *
 * @param relief the rolling ground the road was planned on; made from the seed unless given
 */
export function buildIsland(
  seed: number,
  line: CenterLine,
  profile: RoadProfile,
  cfg: GenConfig,
  relief: Relief = createRelief(seed, cfg.world.relief),
): Island {
  const { tile, coast, scenery } = cfg.world;
  const halfRoad = cfg.track.roadWidth / 2;
  const natural = createField(tile.extent, tile.cell);
  const { size } = natural;
  const near = nearestRoad(line, natural);
  const inside = insideLoop(line, natural);

  const rng = createRng(seed, 'world').fork('island');
  const slopeNoise = shiftedNoise(rng.fork('slope'), coast.slopeScale);
  const headlandNoise = shiftedNoise(rng.fork('headland'), coast.headlandScale);
  const wobbleNoise = shiftedNoise(rng.fork('wobble'), coast.wobbleScale);
  const peakNoise = shiftedNoise(rng.fork('peaks'), scenery.peakScale);
  const regionNoise = shiftedNoise(rng.fork('regions'), scenery.regionScale);
  const bumpNoise = shiftedNoise(rng.fork('bumps'), scenery.bumpScale);

  // The height of the road near each cell, smoothed so it changes gradually
  // where the nearest part of the track switches from one section to another.
  const nearbyRoad = new Float32Array(size * size);
  for (let c = 0; c < nearbyRoad.length; c++) nearbyRoad[c] = profile.height[near.index[c]!]!;
  const roadHeights = blur(nearbyRoad, size, Math.max(1, Math.round(coast.heightSmoothing / tile.cell)));

  // Pass 1: how far inland each cell is ("shore": positive on land, zero at
  // the waterline, negative out to sea) and how steeply its coast rises.
  const shore = new Float32Array(size * size);
  const steepness = new Float32Array(size * size);
  for (let iz = 0; iz < size; iz++) {
    const z = worldZ(natural, iz);
    for (let ix = 0; ix < size; ix++) {
      const x = worldX(natural, ix);
      const c = iz * size + ix;
      const roadHeight = roadHeights[c]!;

      let slope = lerp(coast.slope[0], coast.slope[1], 0.5 + 0.5 * slopeNoise.at(x, z));
      // Untouched ground beside the road, then room for the land to fall from road height, then the beach.
      let margin = coast.minShore + roadHeight / slope + coast.beach;
      if (margin > coast.maxMargin) {
        margin = coast.maxMargin;
        // Less room than the slope wanted: the coast has to be steeper here.
        slope = Math.max(slope, roadHeight / (margin - coast.beach - coast.minShore));
      }
      const wobble = coast.wobble * (0.5 + 0.5 * fbm(wobbleNoise.noise, wobbleNoise.u(x), wobbleNoise.v(z), 3));
      // Inside the loop, distance from the road counts as further inland.
      const outward = inside[c] === 1 ? -near.distance[c]! : near.distance[c]! - halfRoad;
      shore[c] = margin - outward + wobble;
      steepness[c] = slope;
    }
  }

  const coastBlur = Math.max(1, Math.round(coast.smoothing / tile.cell));
  const smoothed = blur(shore, size, coastBlur);
  const smoothedSteepness = blur(steepness, size, coastBlur);

  // Pass 2: heights.
  const half = tile.extent / 2;
  for (let iz = 0; iz < size; iz++) {
    const z = worldZ(natural, iz);
    for (let ix = 0; ix < size; ix++) {
      const x = worldX(natural, ix);
      const c = iz * size + ix;
      const edge = near.distance[c]! - halfRoad;
      // The tile's border is always open sea.
      const toBorder = half - Math.max(Math.abs(x), Math.abs(z));
      const inland = Math.min(smoothed[c]!, toBorder - coast.border);
      // Headlands are extra land of their own, wherever their noise runs high.
      // They fade out with distance from the road so they stay on the tile.
      const reach = smoothstep(coast.maxMargin * 0.5, coast.maxMargin, edge);
      // Further out still they sink away completely, leaving the open sea deep.
      const sink = coast.seaDepth * smoothstep(coast.maxMargin, coast.maxMargin * 1.5, edge);
      const headland = Math.min(
        coast.headlandHeight * (headlandNoise.at(x, z) - coast.headlandLevel - reach) - sink,
        (toBorder - coast.border) * coast.shelfSlope,
      );
      const cap = Math.max(coastHeight(inland, smoothedSteepness[c]!, coast), headland);

      // Right beside the road the ground is the rolling relief, whatever the coast is doing.
      const coastal = smoothstep(0, coast.minShore, edge);
      if (cap <= 0 && coastal >= 1) {
        natural.height[c] = cap;
        continue;
      }

      let ground = relief(x, z);
      const clear = Math.max(0, edge);
      const bumps = smoothstep(0, scenery.bumpFade, clear);
      if (bumps > 0) ground += scenery.bumpHeight * bumps * fbm(bumpNoise.noise, bumpNoise.u(x), bumpNoise.v(z), 2);
      const peaks = smoothstep(scenery.clearance, scenery.clearance + scenery.fade, clear);
      if (peaks > 0) {
        const region = smoothstep(-0.2, 0.4, regionNoise.at(x, z));
        // Only the upper part of the ridge pattern becomes a peak, eased at the foot and at the summit.
        const ridge = smoothstep(0.4, 1, softRidged(peakNoise.noise, peakNoise.u(x), peakNoise.v(z), 2));
        ground += scenery.peakHeight * peaks * region * ridge;
      }
      natural.height[c] = lerp(ground, smoothMin(ground, cap, JOIN), coastal);
    }
  }

  return { natural, near, inside };
}

/** A noise pattern sized in metres and slid to a place of its own. */
interface ShiftedNoise {
  noise: Noise2;
  /** Noise coordinates of a world position. */
  u(x: number): number;
  v(z: number): number;
  /** The plain noise value at a world position. */
  at(x: number, z: number): number;
}

/**
 * Noise with features `scale` metres across, moved a random distance from the
 * origin. Without the move every layer of every pattern would be exactly zero
 * at the centre of the map, and their creases would line up there.
 */
function shiftedNoise(rng: Rng, scale: number): ShiftedNoise {
  const noise = createNoise(rng);
  const offsetU = rng.range(-500, 500);
  const offsetV = rng.range(-500, 500);
  const u = (x: number): number => x / scale + offsetU;
  const v = (z: number): number => z / scale + offsetV;
  return { noise, u, v, at: (x, z) => noise(u(x), v(z)) };
}

/**
 * Height the coast allows at a point `inland` metres from the waterline: a
 * gently shelving sea bed, then a beach, then a slope up into the island.
 */
function coastHeight(inland: number, slope: number, coast: GenConfig['world']['coast']): number {
  if (inland <= 0) return Math.max(-coast.seaDepth, inland * coast.shelfSlope);
  if (inland <= coast.beach) return (coast.beachTop * inland) / coast.beach;
  return coast.beachTop + (inland - coast.beach) * slope;
}

/** The smaller of two heights, with the crease between them rounded off over `radius` metres. */
function smoothMin(a: number, b: number, radius: number): number {
  const t = clamp01(0.5 + (0.5 * (b - a)) / radius);
  return lerp(b, a, t) - radius * t * (1 - t);
}

/** Averages each cell with its neighbours out to `radius` cells, across then down. */
function blur(values: Float32Array, size: number, radius: number): Float32Array {
  const pass = (source: Float32Array, stride: number, lineStride: number): Float32Array => {
    const out = new Float32Array(source.length);
    for (let line = 0; line < size; line++) {
      const start = line * lineStride;
      // A window that slides along the line: add the cell coming in, drop the one going out.
      let sum = 0;
      let count = 0;
      for (let k = 0; k <= Math.min(radius, size - 1); k++) {
        sum += source[start + k * stride]!;
        count++;
      }
      for (let i = 0; i < size; i++) {
        out[start + i * stride] = sum / count;
        const incoming = i + radius + 1;
        const outgoing = i - radius;
        if (incoming < size) {
          sum += source[start + incoming * stride]!;
          count++;
        }
        if (outgoing >= 0) {
          sum -= source[start + outgoing * stride]!;
          count--;
        }
      }
    }
    return out;
  };
  const across = pass(values, 1, size);
  return pass(across, size, 1);
}
