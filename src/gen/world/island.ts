import type { CoastConfig, GenConfig } from '../../config';
import { createNoise, fbm, softRidged, type Noise2 } from '../../core/noise';
import { createRng, type Rng } from '../../core/rng';
import { clamp01, lerp, smoothstep } from '../../core/scalar';
import type { Vec2 } from '../../core/vec2';
import type { CenterLine, HeightField, RoadProfile } from '../types';
import { createField, worldX, worldZ } from './heightfield';
import { insideLoop, nearestRoad, type NearestRoad } from './nearest';
import { createRelief, type Relief } from './relief';

/** The one peak of an island. */
export interface Peak {
  /** Where its summit is. */
  x: number;
  z: number;
  /** Its foot is a circle of this radius, in metres. */
  radius: number;
  /** Height of the summit above the sea, in metres. */
  summit: number;
}

/** The land a track sits on, before the road is cut into it. */
export interface Island {
  /**
   * The ground as it would be with no coast at all: rolling relief, bumps and
   * the peak. The road is fitted into this. Out at sea, where it is never
   * needed, it simply holds the sea bed.
   */
  inland: HeightField;
  /** The inland ground with the coast carved out of it: beaches, cliffs and sea bed. */
  natural: HeightField;
  /** The highest the coast allows the ground to be at each cell. */
  cap: Float32Array;
  /** Nearest point of the track for every cell. */
  near: NearestRoad;
  /** 1 for cells the track encloses, 0 for the rest. */
  inside: Uint8Array;
  peak: Peak | null;
  /** Where the coast is pushed out, and where it is pulled in: the points on the road each is centred on. */
  headlands: Vec2[];
  bays: Vec2[];
}

/** How the shore is shaped at one place. */
export interface ShoreShape {
  /** Distance from the waterline to the edge of the strip kept clear beside the road, in metres. */
  room: number;
  /** Width of the beach, in metres. 0 for none. */
  beach: number;
  /** Height the land must reach at the clear strip, in metres above the sea. */
  roadHeight: number;
}

/** The crease where the coast meets the inland ground is rounded over this height, in metres. */
const JOIN = 1.5;

/** The land is brought up this far above the road at the clear strip, in metres, so the coast never undercuts it. */
const HEADROOM = 0.5;

/**
 * Builds the island around a track.
 *
 * Everything the loop encloses is land. Outside it, the sea follows the road
 * at a distance that varies along the coast: usually 15 to 35 m, closer in a
 * bay or two and further at a headland or two. Where the road is low there is
 * room for a beach; where it is high the land drops to the water as a cliff.
 * One peak stands in the infield where it is furthest from the road.
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
  const inland = createField(tile.extent, tile.cell);
  const { size } = inland;
  const near = nearestRoad(line, inland);
  const inside = insideLoop(line, inland);

  const rng = createRng(seed, 'world').fork('island');
  const marginNoise = shiftedNoise(rng.fork('margin'), coast.marginScale);
  const beachNoise = shiftedNoise(rng.fork('beach'), coast.beachScale);
  const cliffNoise = shiftedNoise(rng.fork('cliff'), coast.cliffScale);
  const wobbleNoise = shiftedNoise(rng.fork('wobble'), coast.wobbleScale);
  const bumpNoise = shiftedNoise(rng.fork('bumps'), scenery.bumpScale);
  const peakNoise = shiftedNoise(rng.fork('peak-texture'), 60);

  const features = chooseFeatures(rng.fork('features'), line, profile, inland, near, inside, cfg);
  const peak = placePeak(rng.fork('peak'), inland, near, inside, relief, cfg);

  // The height of the road near each cell, smoothed so it changes gradually
  // where the nearest part of the track switches from one section to another.
  const nearbyRoad = new Float32Array(size * size);
  for (let c = 0; c < nearbyRoad.length; c++) nearbyRoad[c] = profile.height[near.index[c]!]!;
  const roadHeights = blur(nearbyRoad, size, Math.max(1, Math.round(coast.heightSmoothing / tile.cell)));

  // Pass 1: the shape of the shore at every cell, and how far inland the cell
  // is ("shore": positive on land, zero at the waterline, negative out to sea).
  const shore = new Float32Array(size * size);
  const room = new Float32Array(size * size);
  const beach = new Float32Array(size * size);
  const outward = new Float32Array(size * size);
  for (let iz = 0; iz < size; iz++) {
    const z = worldZ(inland, iz);
    for (let ix = 0; ix < size; ix++) {
      const x = worldX(inland, ix);
      const c = iz * size + ix;

      // The usual margin, pushed out near a headland and pulled in near a bay.
      let margin = lerp(coast.margin[0], coast.margin[1], smoothstep(-0.6, 0.6, marginNoise.at(x, z)));
      let shaped = 0;
      for (const headland of features.headlands) {
        const pull = featurePull(headland, x, z, halfRoad);
        if (pull > 0) margin = lerp(margin, Math.max(margin, headland.reach), pull);
        shaped = Math.max(shaped, pull);
      }
      for (const bay of features.bays) {
        const pull = featurePull(bay, x, z, halfRoad);
        if (pull > 0) margin = lerp(margin, coast.minMargin, pull);
        shaped = Math.max(shaped, pull);
      }
      // The wobble is left out of bays and headlands, so they reach exactly as far as they were given.
      margin += coast.wobble * (1 - shaped) * fbm(wobbleNoise.noise, wobbleNoise.u(x), wobbleNoise.v(z), 2);

      // Cliff stretches have no beach; elsewhere its width wanders between narrow and wide.
      const cliff = smoothstep(coast.cliffLevel, coast.cliffLevel + 0.25, cliffNoise.at(x, z));
      const beachWanted = lerp(coast.beach[0], coast.beach[1], smoothstep(-0.6, 0.6, beachNoise.at(x, z))) * (1 - cliff);

      const shape = shoreShape(margin, beachWanted, roadHeights[c]! + HEADROOM, coast);
      // Inside the loop, distance from the road counts as further inland.
      outward[c] = inside[c] === 1 ? -near.distance[c]! : near.distance[c]! - halfRoad;
      shore[c] = shape.margin - outward[c]!;
      room[c] = shape.margin - coast.clear;
      beach[c] = shape.beach;
    }
  }

  const smoothed = blur(shore, size, Math.max(1, Math.round(coast.smoothing / tile.cell)));

  // Pass 2: the coast's limit on every cell, and the inland ground wherever it could matter.
  const cap = new Float32Array(size * size);
  const half = tile.extent / 2;
  const fitReach = halfRoad + cfg.road.verge + cfg.road.blendMax + 2 * tile.cell;
  for (let iz = 0; iz < size; iz++) {
    const z = worldZ(inland, iz);
    for (let ix = 0; ix < size; ix++) {
      const x = worldX(inland, ix);
      const c = iz * size + ix;
      // Smoothing must never bring the water nearer the road than the minimum, and the tile's border is always open sea.
      const toBorder = half - Math.max(Math.abs(x), Math.abs(z));
      const inlandBy = Math.min(Math.max(smoothed[c]!, coast.minMargin - outward[c]!), toBorder - coast.border);
      const limit = coastProfile(inlandBy, { room: room[c]!, beach: beach[c]!, roadHeight: roadHeights[c]! + HEADROOM }, coast);
      cap[c] = limit;

      // Out at sea and out of reach of the road, the inland ground is never looked at.
      if (limit <= 0 && near.distance[c]! > fitReach) {
        inland.height[c] = limit;
        continue;
      }

      let ground = relief(x, z);
      let bell = 0;
      if (peak) {
        const fromSummit = distance(x - peak.x, z - peak.z) / peak.radius;
        if (fromSummit < 1) {
          bell = (1 - fromSummit * fromSummit) * (1 - fromSummit * fromSummit);
          // Ridges roughen its sides; they fade to nothing at the summit and at the foot.
          const texture = 0.6 * bell * (1 - bell) * (softRidged(peakNoise.noise, peakNoise.u(x), peakNoise.v(z), 2) - 0.5);
          ground += (peak.summit - peak.base) * (bell + texture);
        }
      }
      const bumps = smoothstep(0, scenery.bumpFade, Math.max(0, near.distance[c]! - halfRoad)) * (1 - bell);
      if (bumps > 0) ground += scenery.bumpHeight * bumps * fbm(bumpNoise.noise, bumpNoise.u(x), bumpNoise.v(z), 2);
      inland.height[c] = ground;
    }
  }

  const natural: HeightField = { ...inland, height: carveCoast(inland.height, { cap, near }, cfg) };
  return {
    inland,
    natural,
    cap,
    near,
    inside,
    peak: peak && { x: peak.x, z: peak.z, radius: peak.radius, summit: peak.summit },
    headlands: features.headlands.map(({ x, z }) => ({ x, z })),
    bays: features.bays.map(({ x, z }) => ({ x, z })),
  };
}

/**
 * Carves the coast out of a set of ground heights: wherever the coast's limit
 * is lower than the ground, the ground comes down to it. The road and its
 * verges are never touched, so this is safe to run after the road is fitted.
 */
export function carveCoast(heights: Float32Array, island: Pick<Island, 'cap' | 'near'>, cfg: GenConfig): Float32Array {
  const verge = cfg.track.roadWidth / 2 + cfg.road.verge;
  const clear = cfg.track.roadWidth / 2 + cfg.world.coast.clear;
  const out = new Float32Array(heights.length);
  for (let c = 0; c < heights.length; c++) {
    const here = heights[c]!;
    const strength = smoothstep(verge, clear, island.near.distance[c]!);
    out[c] = strength > 0 ? here + (lowerTo(here, island.cap[c]!) - here) * strength : here;
  }
  return out;
}

/**
 * Settles the margin and beach for one place on the coast.
 *
 * The waterline is never closer to the road than the minimum, and beside a
 * high road it moves out until the drop is no steeper than a cliff may be.
 * The beach gets whatever width is left after that drop, or none at all if
 * that is less than the narrowest beach.
 *
 * @param marginWanted distance from the road edge to the waterline, in metres
 * @param beachWanted width of beach, in metres (0 on a cliff stretch)
 * @param roadHeight height the land must reach beside the road, in metres above the sea
 */
export function shoreShape(
  marginWanted: number,
  beachWanted: number,
  roadHeight: number,
  coast: CoastConfig,
): { margin: number; beach: number } {
  const margin = Math.max(marginWanted, coast.minMargin, coast.clear + roadHeight / coast.cliffSlope);
  const room = margin - coast.clear;
  // The widest beach that still leaves the drop behind it no steeper than a cliff.
  const widest = (room - roadHeight / coast.cliffSlope) / (1 - coast.beachRise / coast.cliffSlope);
  const beach = Math.min(beachWanted, widest);
  return { margin, beach: beach >= coast.beach[0] ? beach : 0 };
}

/**
 * The highest the coast allows the ground to be at a point `inland` metres
 * from the waterline: sea bed shelving away below it, then the beach, then the
 * climb to road height at the edge of the clear strip, and rising on from there.
 */
export function coastProfile(inland: number, shape: ShoreShape, coast: CoastConfig): number {
  if (inland <= 0) return Math.max(-coast.seaDepth, inland * coast.shelfSlope);
  if (inland <= shape.beach) return inland * coast.beachRise;
  if (inland <= shape.room) {
    const beachTop = shape.beach * coast.beachRise;
    return beachTop + ((shape.roadHeight - beachTop) * (inland - shape.beach)) / (shape.room - shape.beach);
  }
  return shape.roadHeight + (inland - shape.room);
}

interface Feature extends Vec2 {
  /** The direction straight out to sea from the road at its middle. */
  outX: number;
  outZ: number;
  /** How far along the coast it spreads either side of its middle, in metres. */
  width: number;
  /** For a headland: how far its tip reaches from the road edge, in metres. */
  reach: number;
}

/**
 * Picks where the headlands and bays go. Each is centred on a point of the
 * road that faces the open sea, and they are kept apart from each other.
 */
function chooseFeatures(
  rng: Rng,
  line: CenterLine,
  profile: RoadProfile,
  field: HeightField,
  near: NearestRoad,
  inside: Uint8Array,
  cfg: GenConfig,
): { headlands: Feature[]; bays: Feature[] } {
  const coast = cfg.world.coast;
  const halfRoad = cfg.track.roadWidth / 2;
  const last = field.size - 1;
  const cellAt = (x: number, z: number): number => {
    const ix = Math.round((x - field.origin) / field.cell);
    const iz = Math.round((z - field.origin) / field.cell);
    return ix < 0 || iz < 0 || ix > last || iz > last ? -1 : iz * field.size + ix;
  };

  // A sample faces the open sea if, straight out from one side of it, there is neither infield nor more track.
  const lookOut = 80;
  const seaward: number[] = [];
  const seaSide = new Int8Array(line.count);
  for (let i = 0; i < line.count; i += 4) {
    for (const side of [1, -1]) {
      // Right of the direction of travel is (-tz, tx) on the map.
      const nx = -line.tz[i]! * side;
      const nz = line.tx[i]! * side;
      const close = cellAt(line.x[i]! + nx * (halfRoad + 12), line.z[i]! + nz * (halfRoad + 12));
      const far = cellAt(line.x[i]! + nx * lookOut, line.z[i]! + nz * lookOut);
      if (close < 0 || far < 0 || inside[close] === 1 || inside[far] === 1) continue;
      if (near.distance[far]! < lookOut - 15) continue;
      seaward.push(i);
      seaSide[i] = side;
      break;
    }
  }

  const chosen: Feature[] = [];
  const pick = (candidates: readonly number[], width: number, reach: number): Feature | null => {
    for (let attempt = 0; attempt < 40 && candidates.length > 0; attempt++) {
      const i = candidates[rng.int(0, candidates.length - 1)]!;
      const feature: Feature = {
        x: line.x[i]!,
        z: line.z[i]!,
        outX: -line.tz[i]! * seaSide[i]!,
        outZ: line.tx[i]! * seaSide[i]!,
        width,
        reach,
      };
      if (chosen.every((other) => distance(other.x - feature.x, other.z - feature.z) >= coast.featureSpacing)) {
        chosen.push(feature);
        return feature;
      }
    }
    return null;
  };

  const headlands: Feature[] = [];
  const headlandCount = rng.int(coast.headlands[0], coast.headlands[1]);
  for (let k = 0; k < headlandCount; k++) {
    const width = rng.range(coast.headlandWidth[0], coast.headlandWidth[1]);
    const reach = rng.range(coast.headlandReach[0], coast.headlandReach[1]);
    const feature = pick(seaward, width, reach);
    if (feature) headlands.push(feature);
  }

  // A bay can only come right in beside a low road, so those places are tried first.
  const lowRoad = seaward.filter((i) => profile.height[i]! <= coast.bayRoadHeight);
  const bays: Feature[] = [];
  const bayCount = rng.int(coast.bays[0], coast.bays[1]);
  for (let k = 0; k < bayCount; k++) {
    const width = rng.range(coast.bayWidth[0], coast.bayWidth[1]);
    const feature = pick(lowRoad, width, 0) ?? pick(seaward, width, 0);
    if (feature) bays.push(feature);
  }
  return { headlands, bays };
}

/**
 * Places the island's one peak where the infield is furthest from the road,
 * sized so that no part of it comes within the clearance. Returns null when
 * the infield has no room for one.
 */
function placePeak(
  rng: Rng,
  field: HeightField,
  near: NearestRoad,
  inside: Uint8Array,
  relief: Relief,
  cfg: GenConfig,
): (Peak & { base: number }) | null {
  const scenery = cfg.world.scenery;

  let furthest = -1;
  let best = -1;
  for (let c = 0; c < inside.length; c++) {
    if (inside[c] === 1 && near.distance[c]! > furthest) {
      furthest = near.distance[c]!;
      best = c;
    }
  }
  if (best < 0) return null;

  const radius = Math.min(scenery.peakRadius[1], furthest - cfg.track.roadWidth / 2 - scenery.peakClearance);
  if (radius < scenery.peakRadius[0]) return null;

  const x = worldX(field, best % field.size);
  const z = worldZ(field, Math.floor(best / field.size));
  const base = relief(x, z);
  // The more room there is, the taller the peak: a small infield gets one near the bottom of the range.
  const roomy = clamp01((radius - scenery.peakRadius[0]) / (scenery.peakRadius[1] - scenery.peakRadius[0]));
  const summitWanted = lerp(scenery.peakSummit[0], scenery.peakSummit[1], roomy * rng.range(0.6, 1));
  // A bell of this shape is steepest part way up, at about 1.54 times its height over its radius.
  const tallest = (scenery.peakSlope * radius) / 1.54;
  const rise = Math.min(summitWanted - base, tallest);
  if (rise <= 0) return null;
  return { x, z, radius, summit: base + rise, base };
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

function distance(dx: number, dz: number): number {
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Brings a height down to a limit. Ground already below the limit is left
 * alone; ground well above it comes down to it; in between the change is eased
 * in, which rounds the crease where the coast meets the land. The result is
 * never below both, so the sea bed is never dug deeper than it should be.
 */
function lowerTo(height: number, limit: number): number {
  const over = height - limit;
  if (over <= 0) return height;
  return height - over * smoothstep(0, JOIN, over);
}

/**
 * How strongly a headland or bay acts at a point: fully along the line
 * running straight out to sea from its middle, fading to nothing `width`
 * metres either side of that line, and not at all behind the road.
 */
function featurePull(feature: Feature, x: number, z: number, halfRoad: number): number {
  const dx = x - feature.x;
  const dz = z - feature.z;
  const out = dx * feature.outX + dz * feature.outZ;
  if (out < -halfRoad) return 0;
  const aside = Math.abs(dx * feature.outZ - dz * feature.outX);
  return 1 - smoothstep(feature.width * 0.35, feature.width, aside);
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
