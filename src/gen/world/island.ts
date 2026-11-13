import type { CoastConfig, GenConfig } from '../../config';
import { createNoise, fbm, softRidged, type Noise2 } from '../../core/noise';
import { createRng, type Rng } from '../../core/rng';
import { clamp01, lerp, smoothstep } from '../../core/scalar';
import type { Vec2 } from '../../core/vec2';
import type { CenterLine, Character, CoastKind, HeightField, RoadProfile } from '../types';
import { createField, sampleGrid, worldX, worldZ } from './heightfield';
import { edgeDistance, insideLoop, nearestRoad, type NearestRoad } from './nearest';
import { createRelief, placeHighland, type Highland, type Relief } from './relief';

/** One of an island's mountains. */
export interface Mountain {
  /** Where its summit is. */
  x: number;
  z: number;
  /** Its foot is a circle of this radius, in metres. */
  radius: number;
  /** Height of the summit above the sea, in metres. */
  summit: number;
}

/** A mountain as it is built: also the height of the ground it stands on, and how far its land runs past its foot. */
interface PlacedMountain extends Mountain {
  base: number;
  skirt: number;
}

/** A bell of the shape mountains have is steepest part way up, at this many times its height over its radius. */
const BELL_STEEPEST = 8 / (3 * Math.sqrt(3));

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
  /** Distance from every cell to the edge of the road, in metres: negative on the road. */
  edge: Float32Array;
  /** 1 for cells the track encloses, 0 for the rest. */
  inside: Uint8Array;
  /** 1 for each sample of the centre line where the sea is beside the road, 0 where the hinterland covers it. */
  seaside: Uint8Array;
  /** The mountains, the main one first. */
  mountains: Mountain[];
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

/** The hinterland's pattern is worked out on every this many cells, and blended between them. */
const PATTERN_STEP = 4;

/** The land is brought up this far above the road at the clear strip, in metres, so the coast never undercuts it. */
const HEADROOM = 0.5;

/**
 * Builds the island around a track.
 *
 * Everything the loop encloses is land. Outside it, a hinterland covers some
 * of the road, as the seed's coast trait asks: there the land runs on 80 to
 * 600 m past it. Elsewhere the sea follows the road at a distance that varies
 * along the coast: usually 15 to 35 m, closer in a bay or two and further at a
 * headland or two. Where the road is low there is room for a beach; where it
 * is high the land drops to the water as a cliff. Mountains stand where there
 * infield where it is furthest from the road.
 *
 * @param width road width at each sample of the line, in metres
 * @param character the kind of island this seed makes
 * @param relief the ground the road was planned on; made from the seed and its relief unless given
 */
export function buildIsland(
  seed: number,
  line: CenterLine,
  profile: RoadProfile,
  width: Float64Array,
  cfg: GenConfig,
  character: Character,
  relief: Relief = createRelief(seed, cfg.world.relief, character.relief, cfg.track.buildableRadius),
): Island {
  const { tile, coast, scenery } = cfg.world;
  const inland = createField(tile.extent, tile.cell);
  const { size } = inland;
  const near = nearestRoad(line, inland);
  const edge = edgeDistance(near, width);
  const inside = insideLoop(line, inland);
  let widest = 0;
  for (let i = 0; i < line.count; i++) widest = Math.max(widest, width[i]!);

  const rng = createRng(seed, 'world').fork('island');
  const marginNoise = shiftedNoise(rng.fork('margin'), coast.marginScale);
  const beachNoise = shiftedNoise(rng.fork('beach'), coast.beachScale);
  const cliffNoise = shiftedNoise(rng.fork('cliff'), coast.cliffScale);
  const wobbleNoise = shiftedNoise(rng.fork('wobble'), coast.wobbleScale);
  const bumpNoise = shiftedNoise(rng.fork('bumps'), scenery.bumpScale);
  const peakNoise = shiftedNoise(rng.fork('peak-texture'), 60);
  const foothillNoise = shiftedNoise(rng.fork('foothills'), scenery.foothills.scale);
  const foothillHeight = shiftedNoise(rng.fork('foothill-height'), scenery.foothills.scale * 4);

  const hinterland = shapeHinterland(rng.fork('hinterland'), line, inland, near, edge, inside, character.coast, cfg);
  const features = chooseFeatures(rng.fork('features'), line, profile, width, hinterland.seaside, inland, near, inside, cfg);
  const highland = placeHighland(seed, cfg.world.relief, character.relief, cfg.track.buildableRadius);
  const mountains = placeMountains(rng.fork('mountains'), inland, edge, inside, hinterland.reach, relief, highland, character, cfg);

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
  const beachWide = new Float32Array(size * size);
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
        const pull = featurePull(headland, x, z);
        if (pull > 0) margin = lerp(margin, Math.max(margin, headland.reach), pull);
        shaped = Math.max(shaped, pull);
      }
      for (const bay of features.bays) {
        const pull = featurePull(bay, x, z);
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
      outward[c] = inside[c] === 1 ? -near.distance[c]! : edge[c]!;
      shore[c] = shape.margin - outward[c]!;
      room[c] = shape.margin - coast.clear;
      beach[c] = shape.beach;
      beachWide[c] = beachWanted;
    }
  }

  const smoothed = blur(shore, size, Math.max(1, Math.round(coast.smoothing / tile.cell)));

  // Pass 2: the coast's limit on every cell.
  const cap = new Float32Array(size * size);
  /** How far the hinterland's coast takes to climb to road height at each cell, kept for filling cut-off pools below. */
  const hinterlandRoom = new Float32Array(size * size);
  /**
   * The height the hinterland's coast, and land filled in where sea was cut off, climb to: the highest
   * the land there can be (its relief, plus the tallest foothill and bump). It is smooth everywhere,
   * unlike the height of the nearest road, which jumps where the nearest part of the track changes.
   */
  const landTop = new Float32Array(size * size);
  const landExtra = scenery.foothills.height[1] + scenery.bumpHeight + HEADROOM;
  const landShaped = hinterland.reach !== null || mountains.length > 0;
  const half = tile.extent / 2;
  const fitReach = widest / 2 + cfg.road.verge + cfg.road.blendMax + 2 * tile.cell;
  for (let iz = 0; iz < size; iz++) {
    const z = worldZ(inland, iz);
    for (let ix = 0; ix < size; ix++) {
      const x = worldX(inland, ix);
      const c = iz * size + ix;
      // Smoothing must never bring the water nearer the road than the minimum, and the tile's border is always open sea.
      const toBorder = half - Math.max(Math.abs(x), Math.abs(z));
      const inlandBy = Math.min(Math.max(smoothed[c]!, coast.minMargin - outward[c]!), toBorder - coast.border);
      let limit = coastProfile(inlandBy, { room: room[c]!, beach: beach[c]!, roadHeight: roadHeights[c]! + HEADROOM }, coast);
      landTop[c] = landShaped ? Math.max(0, relief(x, z)) + landExtra : roadHeights[c]! + HEADROOM;
      hinterlandRoom[c] = Math.max(cfg.world.hinterland.reach[0] - coast.clear, (4 * landTop[c]!) / coast.cliffSlope);
      if (hinterland.reach) {
        // The hinterland's own coast: the same shape as the coast beside the road, but its waterline is
        // `reach` metres out and it climbs to the height of the land over all of that, so it is gentle. It only ever
        // adds land. Where the land is high it takes longer to climb, so it is never steeper than half a sea cliff: its
        // coastline also bends with the pattern, which can make the ground up to twice as steep again.
        // (The beach can take up half the room, so the climb needs twice the room a straight slope would.)
        const reach = hinterland.reach[c]!;
        const gentlest = (4 * landTop[c]!) / coast.cliffSlope;
        if (reach > coast.clear + 1) {
          const roomHere = Math.max(reach - coast.clear, gentlest);
          hinterlandRoom[c] = Math.max(hinterlandRoom[c]!, roomHere);
          const shape: ShoreShape = {
            room: roomHere,
            beach: Math.min(beachWide[c]!, roomHere / 2),
            roadHeight: landTop[c]!,
          };
          const inlandOfHinterland = Math.min(reach - outward[c]!, toBorder - coast.border);
          limit = Math.max(limit, coastProfile(inlandOfHinterland, shape, coast));
        }
      }
      // Each mountain stands on land of its own: its foot is never cut down, and around it the land
      // climbs from the sea to the height of the ground at its foot, as gently as the hinterland's coast.
      for (const mountain of mountains) {
        const fromSummit = distance(x - mountain.x, z - mountain.z);
        if (fromSummit <= mountain.radius) limit = Infinity;
        // Out past its skirt too, so the sea bed shelves away from its shore instead of dropping straight to the open sea's depth.
        else if (fromSummit < mountain.radius + mountain.skirt + coast.seaDepth / coast.shelfSlope) {
          const shape: ShoreShape = {
            room: mountain.skirt,
            beach: Math.min(beachWide[c]!, mountain.skirt / 2),
            roadHeight: relief(x, z) + scenery.foothills.height[1] + HEADROOM,
          };
          limit = Math.max(limit, coastProfile(Math.min(mountain.radius + mountain.skirt - fromSummit, toBorder - coast.border), shape, coast));
        }
      }
      cap[c] = limit;
    }
  }

  // Sea cut off from the open sea would be a pool, or on high ground a pit dug down to sea level.
  // Measured from the open sea instead, such places are inland, and the hinterland's coast is
  // worked out again from there. Like the hinterland, this only ever adds land.
  if (hinterland.reach || mountains.length > 0) fillCutOffSea(cap, inland, hinterlandRoom, beachWide, landTop, coast);

  // Pass 3: the inland ground wherever it could matter.
  for (let iz = 0; iz < size; iz++) {
    const z = worldZ(inland, iz);
    for (let ix = 0; ix < size; ix++) {
      const x = worldX(inland, ix);
      const c = iz * size + ix;
      const limit = cap[c]!;
      // Out at sea and out of reach of the road, the inland ground is never looked at.
      if (limit <= 0 && near.distance[c]! > fitReach) {
        inland.height[c] = limit;
        continue;
      }

      let ground = relief(x, z);
      let bell = 0;
      // Foothills give way to a mountain: gone at its foot, back to full height a third of its radius further out.
      let open = 1;
      for (const mountain of mountains) {
        const fromSummit = distance(x - mountain.x, z - mountain.z) / mountain.radius;
        open = Math.min(open, smoothstep(1, 1.33, fromSummit));
        if (fromSummit >= 1) continue;
        const here = (1 - fromSummit * fromSummit) * (1 - fromSummit * fromSummit);
        // Ridges roughen its sides; they fade to nothing at the summit and at the foot. They are sized to
        // the mountain, so their slope is the same share of its slope however big it is.
        const size = mountain.radius * scenery.mountains.ridgeSize;
        const ridges = softRidged(peakNoise.noise, peakNoise.u(mountain.x) + (x - mountain.x) / size, peakNoise.v(mountain.z) + (z - mountain.z) / size, 2);
        const texture = scenery.mountains.ridgeDepth * here * (1 - here) * (ridges - 0.5);
        ground += (mountain.summit - mountain.base) * (here + texture);
        bell = Math.max(bell, here);
      }
      const bumps = smoothstep(0, scenery.bumpFade, Math.max(0, edge[c]!)) * (1 - bell);
      if (bumps > 0) ground += scenery.bumpHeight * bumps * fbm(bumpNoise.noise, bumpNoise.u(x), bumpNoise.v(z), 2);
      // Foothills: well away from the road, and fading out on a mountain's sides.
      const { foothills } = scenery;
      const hills = smoothstep(foothills.clearance, foothills.clearance + foothills.fade, edge[c]!) * open;
      if (hills > 0) {
        // One smooth layer of noise: rounded hills with flat ground between, no steeper than about 60%.
        const tall = lerp(foothills.height[0], foothills.height[1], smoothstep(-0.5, 0.5, foothillHeight.at(x, z)));
        ground += tall * hills * smoothstep(-0.2, 0.8, foothillNoise.at(x, z));
      }
      inland.height[c] = ground;
    }
  }

  const natural: HeightField = { ...inland, height: carveCoast(inland.height, { cap, edge }, cfg) };
  return {
    inland,
    natural,
    cap,
    near,
    edge,
    inside,
    seaside: hinterland.seaside,
    mountains: mountains.map(({ x, z, radius, summit }) => ({ x, z, radius, summit })),
    headlands: features.headlands.map(({ x, z }) => ({ x, z })),
    bays: features.bays.map(({ x, z }) => ({ x, z })),
  };
}

/**
 * Finds sea that the open sea cannot reach (flooding in from the edge of the
 * tile) and turns it into land: every cell's distance from the open sea is
 * measured, and its limit is raised to what the hinterland's coast allows at
 * that distance. Cells by the open sea are measured as before, so only the
 * pools and the ground around them change.
 */
function fillCutOffSea(
  cap: Float32Array,
  field: HeightField,
  room: Float32Array,
  beachWide: Float32Array,
  landTop: Float32Array,
  coast: CoastConfig,
): void {
  const { size, cell } = field;
  const total = size * size;
  const open = new Uint8Array(total);
  const queue = new Int32Array(total);
  let tail = 0;
  for (let k = 0; k < size; k++) {
    for (const c of [k, (size - 1) * size + k, k * size, k * size + size - 1]) {
      if (cap[c]! <= 0 && open[c] === 0) {
        open[c] = 1;
        queue[tail++] = c;
      }
    }
  }
  for (let head = 0; head < tail; head++) {
    const c = queue[head]!;
    const ix = c % size;
    const neighbours = [ix > 0 ? c - 1 : -1, ix < size - 1 ? c + 1 : -1, c - size, c + size];
    for (const next of neighbours) {
      if (next < 0 || next >= total || open[next] === 1 || cap[next]! > 0) continue;
      open[next] = 1;
      queue[tail++] = next;
    }
  }
  let cutOff = false;
  for (let c = 0; c < total && !cutOff; c++) if (cap[c]! <= 0 && open[c] === 0) cutOff = true;
  if (!cutOff) return;

  // Distance from the open sea, in metres: two sweeps over the grid, each cell taking the best of its neighbours.
  const far = new Float32Array(total).fill(Infinity);
  for (let c = 0; c < total; c++) if (open[c] === 1) far[c] = 0;
  const diagonal = cell * Math.SQRT2;
  const relax = (c: number, from: number, step: number): void => {
    const through = far[from]! + step;
    if (through < far[c]!) far[c] = through;
  };
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const c = iz * size + ix;
      if (ix > 0) relax(c, c - 1, cell);
      if (iz > 0) {
        relax(c, c - size, cell);
        if (ix > 0) relax(c, c - size - 1, diagonal);
        if (ix < size - 1) relax(c, c - size + 1, diagonal);
      }
    }
  }
  for (let iz = size - 1; iz >= 0; iz--) {
    for (let ix = size - 1; ix >= 0; ix--) {
      const c = iz * size + ix;
      if (ix < size - 1) relax(c, c + 1, cell);
      if (iz < size - 1) {
        relax(c, c + size, cell);
        if (ix < size - 1) relax(c, c + size + 1, diagonal);
        if (ix > 0) relax(c, c + size - 1, diagonal);
      }
    }
  }

  for (let c = 0; c < total; c++) {
    if (open[c] === 1) continue;
    const roomHere = Math.max(1, room[c]!);
    const shape: ShoreShape = { room: roomHere, beach: Math.min(beachWide[c]!, roomHere / 2), roadHeight: landTop[c]! };
    const limit = coastProfile(far[c]!, shape, coast);
    if (limit > cap[c]!) cap[c] = limit;
  }
}

/**
 * Carves the coast out of a set of ground heights: wherever the coast's limit
 * is lower than the ground, the ground comes down to it. The road and its
 * verges are never touched, so this is safe to run after the road is fitted.
 */
export function carveCoast(heights: Float32Array, island: Pick<Island, 'cap' | 'edge'>, cfg: GenConfig): Float32Array {
  const { verge } = cfg.road;
  const { clear } = cfg.world.coast;
  const out = new Float32Array(heights.length);
  for (let c = 0; c < heights.length; c++) {
    const here = heights[c]!;
    const strength = smoothstep(verge, clear, island.edge[c]!);
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
  /** Half the width of the road there, in metres. */
  halfRoad: number;
  /** How far along the coast it spreads either side of its middle, in metres. */
  width: number;
  /** For a headland: how far its tip reaches from the road edge, in metres. */
  reach: number;
}

/**
 * Picks where the headlands and bays go. Each is centred on a point of the
 * road that faces the open sea, and they are kept apart from each other. None
 * go where the hinterland covers the road.
 */
function chooseFeatures(
  rng: Rng,
  line: CenterLine,
  profile: RoadProfile,
  width: Float64Array,
  seaside: Uint8Array,
  field: HeightField,
  near: NearestRoad,
  inside: Uint8Array,
  cfg: GenConfig,
): { headlands: Feature[]; bays: Feature[] } {
  const coast = cfg.world.coast;
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
    // Where the hinterland covers the road there is no coast beside it to shape.
    if (seaside[i] === 0) continue;
    for (const side of [1, -1]) {
      // Right of the direction of travel is (-tz, tx) on the map.
      const nx = -line.tz[i]! * side;
      const nz = line.tx[i]! * side;
      const close = cellAt(line.x[i]! + nx * (width[i]! / 2 + 12), line.z[i]! + nz * (width[i]! / 2 + 12));
      const far = cellAt(line.x[i]! + nx * lookOut, line.z[i]! + nz * lookOut);
      if (close < 0 || far < 0 || inside[close] === 1 || inside[far] === 1) continue;
      if (near.distance[far]! < lookOut - 15) continue;
      seaward.push(i);
      seaSide[i] = side;
      break;
    }
  }

  const chosen: Feature[] = [];
  const pick = (candidates: readonly number[], spread: number, reach: number): Feature | null => {
    for (let attempt = 0; attempt < 40 && candidates.length > 0; attempt++) {
      const i = candidates[rng.int(0, candidates.length - 1)]!;
      const feature: Feature = {
        x: line.x[i]!,
        z: line.z[i]!,
        outX: -line.tz[i]! * seaSide[i]!,
        outZ: line.tx[i]! * seaSide[i]!,
        halfRoad: width[i]! / 2,
        width: spread,
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
    const spread = rng.range(coast.headlandWidth[0], coast.headlandWidth[1]);
    const reach = rng.range(coast.headlandReach[0], coast.headlandReach[1]);
    const feature = pick(seaward, spread, reach);
    if (feature) headlands.push(feature);
  }

  // A bay can only come right in beside a low road, so those places are tried first.
  const lowRoad = seaward.filter((i) => profile.height[i]! <= coast.bayRoadHeight);
  const bays: Feature[] = [];
  const bayCount = rng.int(coast.bays[0], coast.bays[1]);
  for (let k = 0; k < bayCount; k++) {
    const spread = rng.range(coast.bayWidth[0], coast.bayWidth[1]);
    const feature = pick(lowRoad, spread, 0) ?? pick(seaward, spread, 0);
    if (feature) bays.push(feature);
  }
  return { headlands, bays };
}

/**
 * Places the island's mountains: as many as its character asks for, where there is room.
 * The main one comes first and is the tallest. Each one's foot is as wide as its
 * height needs for its sides to be no steeper than the limit, and stays clear of
 * the road. On a mountain seed the main one stands on the highland the track
 * climbs towards. The others go where the land already is if they can, and
 * otherwise where the island can grow to hold them; a mountain with nowhere to go
 * is left out.
 */
function placeMountains(
  rng: Rng,
  field: HeightField,
  edge: Float32Array,
  inside: Uint8Array,
  reach: Float32Array | null,
  relief: Relief,
  highland: Highland | null,
  character: Character,
  cfg: GenConfig,
): PlacedMountain[] {
  const rules = cfg.world.scenery.mountains;
  const { coast } = cfg.world;
  if (character.mountains <= 0) return [];

  const summits = [rng.fork('main').range(rules.main[0], rules.main[1])];
  const others: number[] = [];
  for (let k = 1; k < character.mountains; k++) others.push(rng.fork(`other-${k}`).range(rules.others[0], rules.others[1]));
  summits.push(...others.sort((a, b) => b - a));

  const half = cfg.world.tile.extent / 2;
  // The smooth shape is kept gentler than the limit, leaving the rest for the ridges.
  const smoothSlope = rules.slope * (1 - rules.ridgeShare);
  const footRadius = (summit: number, base: number): number => (BELL_STEEPEST * Math.max(0, summit - base)) / smoothSlope;
  const skirtFor = (base: number): number =>
    Math.max(rules.skirt, (4 * (base + cfg.world.scenery.foothills.height[1] + HEADROOM)) / coast.cliffSlope);
  /**
   * True when a mountain there stays well inside the tile, with at least the usual skirt of land
   * around it. A wider skirt near the edge of the tile is cut short there, so the border stays open sea.
   */
  const fitsTile = (x: number, z: number, radius: number): boolean =>
    Math.max(Math.abs(x), Math.abs(z)) + radius + rules.skirt <= half - coast.border - coast.seaDepth / coast.shelfSlope;
  const roomAt = (x: number, z: number): number => sampleGrid(field, edge, x, z, -Infinity) - rules.clearance;

  const placed: PlacedMountain[] = [];
  const apart = (x: number, z: number, radius: number): boolean =>
    placed.every((other) => {
      const gap = distance(x - other.x, z - other.z);
      return gap >= Math.max(0.9 * (radius + other.radius), Math.max(radius, other.radius) + 10);
    });

  summits.forEach((summit, k) => {
    if (k === 0 && highland) {
      // Out along the highland from the middle of its flat top, the first place with room enough.
      const length = Math.sqrt(highland.x * highland.x + highland.z * highland.z);
      const ux = highland.x / length;
      const uz = highland.z / length;
      let fallback: PlacedMountain | null = null;
      for (let t = 0; t <= half; t += 15) {
        const x = highland.x + ux * t;
        const z = highland.z + uz * t;
        const base = relief(x, z);
        const radius = footRadius(summit, base);
        const skirt = skirtFor(base);
        const room = roomAt(x, z);
        if (!fitsTile(x, z, Math.min(radius, room))) break;
        if (room >= radius) {
          placed.push({ x, z, radius, summit, base, skirt });
          return;
        }
        // No room for its full height here: remember the roomiest place, with the summit it would allow.
        const lower = base + (room * smoothSlope) / BELL_STEEPEST;
        if (lower - base >= rules.minRise && (!fallback || room > fallback.radius)) fallback = { x, z, radius: room, summit: lower, base, skirt };
      }
      if (fallback) {
        placed.push(fallback);
        return;
      }
      // No room on the highland at all: the main mountain is placed like any other.
    }

    const pick = rng.fork(`site-${k}`);
    let best: PlacedMountain | null = null;
    let bestScore = -Infinity;
    const step = 8;
    for (let iz = 0; iz < field.size; iz += step) {
      const z = worldZ(field, iz);
      for (let ix = 0; ix < field.size; ix += step) {
        const c = iz * field.size + ix;
        const room = edge[c]! - rules.clearance;
        if (room <= 0) continue;
        const x = worldX(field, ix);
        const base = relief(x, z);
        if (summit - base < rules.minRise) continue;
        const radius = footRadius(summit, base);
        if (radius > room) continue;
        const skirt = skirtFor(base);
        if (!fitsTile(x, z, radius) || !apart(x, z, radius)) continue;
        // Best on land that is already there, then as near the road as it can be, so it is seen from the track.
        const onLand = inside[c] === 1 || (reach !== null && reach[c]! - edge[c]! > radius * 0.3);
        const score = (onLand ? 1000 : 0) - room + pick.next() * 40;
        if (score > bestScore) {
          bestScore = score;
          best = { x, z, radius, summit, base, skirt };
        }
      }
    }
    if (best) placed.push(best);
  });
  return placed;
}

/** The hinterland of an island: how far the land runs past the road, and where the road is by the sea. */
interface Hinterland {
  /** For each cell, how far past the road edge the hinterland reaches there, in metres. Null when there is none. */
  reach: Float32Array | null;
  /** 1 for each sample of the centre line that is by the sea (see Island.seaside). */
  seaside: Uint8Array;
}

/**
 * Shapes the land beyond the track. A smooth pattern of noise is cut at a
 * level: above it the hinterland covers the road and the land runs on 80 to
 * 600 m past it, rising with the pattern; below it there is no hinterland and
 * the coast follows the road. A short ramp joins the two, so the coastline
 * never jumps. The level is chosen for each seed so that the share of the
 * road left by the sea is what the coast trait asks for: none for an inland
 * seed, a stretch or two for one that touches the sea, most of it for a coastal one.
 *
 * The hinterland only ever adds land, so the sea is never brought nearer the
 * road than the coast beside the road allows.
 */
function shapeHinterland(
  rng: Rng,
  line: CenterLine,
  field: HeightField,
  near: NearestRoad,
  edge: Float32Array,
  inside: Uint8Array,
  kind: CoastKind,
  cfg: GenConfig,
): Hinterland {
  const rules = cfg.world.hinterland;
  const n = line.count;
  if (rules.reach[1] <= 0) return { reach: null, seaside: new Uint8Array(n).fill(1) };
  const [least, most] = rules.reach;

  const { size } = field;
  const shape = shiftedNoise(rng.fork('shape'), rules.scale);
  // Cells further out than this can never be land, so the pattern is never needed there.
  const furthest = most + rules.inlandClear;
  // The pattern is hundreds of metres across, so it is worked out on every few cells only and blended between them.
  const step = PATTERN_STEP;
  const coarseSize = Math.ceil((size - 1) / step) + 1;
  const coarse = new Float32Array(coarseSize * coarseSize);
  for (let jz = 0; jz < coarseSize; jz++) {
    const z = worldZ(field, Math.min(size - 1, jz * step));
    for (let jx = 0; jx < coarseSize; jx++) {
      const x = worldX(field, Math.min(size - 1, jx * step));
      coarse[jz * coarseSize + jx] = clamp01(0.5 + 0.6 * fbm(shape.noise, shape.u(x), shape.v(z), 2));
    }
  }
  const level = new Float32Array(size * size).fill(-Infinity);
  for (let iz = 0; iz < size; iz++) {
    const jz = Math.min(coarseSize - 2, Math.floor(iz / step));
    const fz = (iz - jz * step) / step;
    for (let ix = 0; ix < size; ix++) {
      const c = iz * size + ix;
      if (edge[c]! > furthest) continue;
      const jx = Math.min(coarseSize - 2, Math.floor(ix / step));
      const fx = (ix - jx * step) / step;
      const k = jz * coarseSize + jx;
      const top = coarse[k]! + (coarse[k + 1]! - coarse[k]!) * fx;
      const bottom = coarse[k + coarseSize]! + (coarse[k + coarseSize + 1]! - coarse[k + coarseSize]!) * fx;
      level[c] = top + (bottom - top) * fz;
    }
  }

  // For each sample, on the cells outside the loop nearest to it: the highest the pattern
  // goes within `seasideDistance` of the road (it is by the sea only if the hinterland
  // leaves sea all along there), and the lowest within `inlandClear`.
  const highNear = new Float64Array(n).fill(-Infinity);
  const lowFar = new Float64Array(n).fill(Infinity);
  for (let c = 0; c < level.length; c++) {
    if (inside[c] === 1 || edge[c]! > rules.inlandClear) continue;
    const i = near.index[c]!;
    lowFar[i] = Math.min(lowFar[i]!, level[c]!);
    if (edge[c]! <= rules.seasideDistance) highNear[i] = Math.max(highNear[i]!, level[c]!);
  }
  const sorted = (values: Float64Array): number[] => Array.from(values).filter((value) => value < Infinity).sort((a, b) => a - b);

  // Reach as a function of the pattern: nothing below the ramp, `least` at the cut, rising to `most`.
  const ramp = rules.ramp;
  // On the ramp, the pattern level at which the reach falls to the seaside distance.
  const seasideOnRamp = ramp * (1 - rules.seasideDistance / least);
  let cut: number;
  let seasideBelow: number;
  if (kind === 'inland') {
    // Cut just below the lowest the pattern goes near the road, so the whole road is covered.
    const lows = sorted(lowFar);
    cut = lows.length > 0 ? lows[0]! - 1e-6 : 0;
    seasideBelow = -Infinity;
  } else {
    // Cut so that the share of the road asked for has the pattern low enough beside it for the sea to come in.
    const highs = Array.from(highNear).filter((value) => value > -Infinity).sort((a, b) => a - b);
    const [fewest, mostShare] = rules.seaside[kind];
    const count = Math.round(rng.fork('share').range(fewest, mostShare) * highs.length);
    seasideBelow = count <= 0 || highs.length === 0 ? -Infinity : highs[Math.min(highs.length, count) - 1]!;
    cut = (seasideBelow === -Infinity ? (highs[0] ?? 0) - ramp : seasideBelow) + seasideOnRamp + 1e-6;
  }

  const reach = new Float32Array(size * size);
  for (let c = 0; c < level.length; c++) {
    const above = level[c]! - cut;
    if (above >= 0) reach[c] = Math.min(most, least + rules.rise * above);
    else if (above > -ramp) reach[c] = least * (1 + above / ramp);
    else reach[c] = -1;
  }
  const seaside = new Uint8Array(n);
  for (let i = 0; i < n; i++) seaside[i] = highNear[i]! > -Infinity && highNear[i]! <= seasideBelow ? 1 : 0;
  return { reach, seaside };
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
function featurePull(feature: Feature, x: number, z: number): number {
  const dx = x - feature.x;
  const dz = z - feature.z;
  const out = dx * feature.outX + dz * feature.outZ;
  if (out < -feature.halfRoad) return 0;
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
