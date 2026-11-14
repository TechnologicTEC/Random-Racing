import type { DecorConfig, GenConfig } from '../../config';
import { TAU } from '../../core/dmath';
import { createNoise, fbm } from '../../core/noise';
import { createRng, pickWeighted } from '../../core/rng';
import { clamp01, lerp, smoothstep } from '../../core/scalar';
import type { Cover, HeightField, Scatter, TreeKind, WoodsKind } from '../types';
import { sampleField, sampleGrid } from './heightfield';

/** The kinds of tree, in the order of their `kind` numbers in a scatter of trees. */
export const TREE_KINDS: readonly TreeKind[] = ['broadleaf', 'pine', 'palm'];
const BROADLEAF = 0;
const PINE = 1;
const PALM = 2;

const WOODS: readonly WoodsKind[] = ['open', 'wooded', 'forest'];

/** Ground this low is wet sand or sea: nothing grows there. */
const DRY = 0.5;

/** The largest turn a tree is given: just under a full circle, so it is still under one once stored as a 32-bit number. */
const FULL_TURN = TAU - 1e-5;

/** The eight directions the shore is looked for in. */
const AROUND: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [Math.SQRT1_2, Math.SQRT1_2],
  [0, 1],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0],
  [-Math.SQRT1_2, -Math.SQRT1_2],
  [0, -1],
  [Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * How wooded the seed's island is. Drawn from the decoration stream
 * (`decor/woods`), so it never changes a layout, an island or a character.
 */
export function pickWoods(seed: number, cfg: DecorConfig): WoodsKind {
  const rng = createRng(seed, 'decor').fork('woods');
  return WOODS[pickWeighted(rng, WOODS.map((woods) => cfg.woods[woods]))] ?? 'wooded';
}

/** An empty scatter with room for `room` things. */
function emptyScatter(room: number): Scatter {
  return {
    count: 0,
    x: new Float32Array(room),
    y: new Float32Array(room),
    z: new Float32Array(room),
    size: new Float32Array(room),
    tall: new Float32Array(room),
    turn: new Float32Array(room),
    lean: new Float32Array(room),
    kind: new Uint8Array(room),
    shade: new Uint8Array(room),
  };
}

/**
 * Cuts a scatter down to the things that were placed, and to at most `most` of
 * them: past that, things are dropped at even steps through the list, so the
 * thinning is spread over the whole island.
 */
function finish(scatter: Scatter, most: number): Scatter {
  const placed = scatter.count;
  const keep = Math.min(placed, most);
  const out = emptyScatter(keep);
  out.count = keep;
  let k = 0;
  for (let i = 0; i < placed; i++) {
    if (placed > most && Math.floor(((i + 1) * most) / placed) === Math.floor((i * most) / placed)) continue;
    out.x[k] = scatter.x[i]!;
    out.y[k] = scatter.y[i]!;
    out.z[k] = scatter.z[i]!;
    out.size[k] = scatter.size[i]!;
    out.tall[k] = scatter.tall[i]!;
    out.turn[k] = scatter.turn[i]!;
    out.lean[k] = scatter.lean[i]!;
    out.kind[k] = scatter.kind[i]!;
    out.shade[k] = scatter.shade[i]!;
    k++;
  }
  return out;
}

/** Steepness of the ground at a point, as a fraction, measured over one cell each way. */
function slopeAt(ground: HeightField, x: number, z: number): number {
  const { cell } = ground;
  const dx = sampleField(ground, x + cell, z, 0) - sampleField(ground, x - cell, z, 0);
  const dz = sampleField(ground, x, z + cell, 0) - sampleField(ground, x, z - cell, 0);
  return Math.sqrt(dx * dx + dz * dz) / (2 * cell);
}

/** True if there is sea within about `reach` metres of the point. Beyond the tile it is all sea. */
function seaNear(ground: HeightField, x: number, z: number, reach: number): boolean {
  // Looked for a cell short of the reach, so a sample that finds sea is itself within it.
  const far = Math.max(ground.cell, reach - ground.cell);
  for (const radius of [far / 2, far]) {
    for (const [dx, dz] of AROUND) {
      if (sampleField(ground, x + dx * radius, z + dz * radius, -1) < 0) return true;
    }
  }
  return false;
}

/**
 * Plants the island's trees.
 *
 * The tile is walked square by square, in a fixed order, and each square may
 * hold one tree, a little off its middle. Broadleaf trees and pines grow where
 * there is grass, on ground that is not too steep, inside the woods (a pattern
 * of noise cut at a level set by how wooded the seed is) and here and there
 * outside them; broadleaf low down, pines higher, none above the tree line.
 * Palms line the shore whatever the woods. Nothing stands within
 * `roadClearance` of the road edge.
 *
 * Every square draws the same random numbers whether or not it gets a tree, so
 * changing one rule never reshuffles the trees the other rules decide.
 *
 * @param edge distance from every cell to the edge of the road, in metres (see edgeDistance)
 * @param woods how wooded the island is (see pickWoods)
 */
export function placeTrees(seed: number, ground: HeightField, cover: Cover, edge: Float32Array, cfg: GenConfig, woods: WoodsKind): Scatter {
  const rules = cfg.world.decor.trees;
  const rng = createRng(seed, 'decor').fork('trees');
  const noise = createNoise(rng.fork('pattern'));
  const shift = rng.fork('shift');
  const offsetX = shift.range(-500, 500);
  const offsetZ = shift.range(-500, 500);
  const draw = rng.fork('squares');
  const level = rules.level[woods];

  const extent = (ground.size - 1) * ground.cell;
  const across = Math.floor(extent / rules.spacing);
  const start = (-across * rules.spacing) / 2;
  const trees = emptyScatter(across * across);
  let count = 0;

  for (let iz = 0; iz < across; iz++) {
    for (let ix = 0; ix < across; ix++) {
      const offX = draw.next();
      const offZ = draw.next();
      const raggedRoll = draw.next();
      const loneRoll = draw.next();
      const palmRoll = draw.next();
      const pineRoll = draw.next();
      const sizeRoll = draw.next();
      const tallRoll = draw.next();
      const turnRoll = draw.next();
      const leanRoll = draw.next();
      const shadeRoll = draw.next();
      const lineRoll = draw.next();

      const x = start + (ix + 0.5 + (offX * 2 - 1) * rules.jitter) * rules.spacing;
      const z = start + (iz + 0.5 + (offZ * 2 - 1) * rules.jitter) * rules.spacing;
      const height = sampleField(ground, x, z, -1);
      if (height <= DRY) continue;
      if (sampleGrid(ground, edge, x, z, 0) < rules.roadClearance) continue;
      if (sampleGrid(ground, cover.rock, x, z, 0) > 127) continue;
      if (slopeAt(ground, x, z) > rules.maxSlope) continue;

      let kind: number;
      let size: number;
      const palm = rules.palm;
      if (height >= palm.height[0] && height <= palm.height[1] && palmRoll < palm.chance && seaNear(ground, x, z, palm.shore)) {
        kind = PALM;
        size = lerp(rules.size.palm[0], rules.size.palm[1], sizeRoll);
      } else {
        if (sampleGrid(ground, cover.grass, x, z, 0) < rules.minGrass * 255) continue;
        if (height > rules.treeLine[1]) continue;
        // Towards the tree line fewer trees take, and those that do are stunted.
        const thin = smoothstep(rules.treeLine[0], rules.treeLine[1], height);
        if (lineRoll < thin) continue;
        const pattern = clamp01(0.5 + 0.6 * fbm(noise, x / rules.scale + offsetX, z / rules.scale + offsetZ, 3));
        if (pattern <= level + raggedRoll * rules.ragged && loneRoll >= rules.lone) continue;
        kind = pineRoll < smoothstep(rules.pineBand[0], rules.pineBand[1], height) ? PINE : BROADLEAF;
        const range = rules.size[TREE_KINDS[kind]!];
        size = lerp(range[0], range[1], sizeRoll) * (1 - rules.stunt * thin);
      }

      trees.x[count] = x;
      trees.y[count] = height;
      trees.z[count] = z;
      trees.size[count] = size;
      trees.tall[count] = lerp(rules.tall[0], rules.tall[1], tallRoll);
      trees.turn[count] = turnRoll * FULL_TURN;
      trees.lean[count] = leanRoll * rules.lean[TREE_KINDS[kind]!];
      trees.kind[count] = kind;
      trees.shade[count] = Math.floor(shadeRoll * 256);
      count++;
    }
  }
  trees.count = count;
  return finish(trees, rules.max);
}
