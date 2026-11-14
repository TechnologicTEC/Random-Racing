import type { GrassConfig, SwayConfig } from '../config';
import { createRng } from '../core/rng';
import type { HeightField } from '../gen/types';
import { grassAt, type GrassGrid } from './grassMaps';

/**
 * The grass blades, as plain numbers. Nothing here knows about Three.js.
 *
 * The blades stand in a few square fields, one inside the next, that follow
 * the camera. A blade has a fixed place in its field's square; as the camera
 * moves on, a blade left behind comes round again ahead (the island demo's
 * trick), so nothing is rebuilt from frame to frame. Every field fades its
 * blades to nothing towards its edge, and gives way to the field inside it,
 * so no blade ever pops in or out.
 *
 * Whether a blade stands, and how tall, comes from the ground under it: the
 * world's grass cover, its lush-to-dry variation, the distance to the road
 * edge and the seed's flower patches (`grassMaps.ts`).
 *
 * `bladeAt` does the sums here so they can be tested; `grassGlsl` writes the
 * same sums for the grass shader. Change one and you must change the other.
 */

/** How many colours of flower there are. A blade's `flower` is 0 (it never flowers) or 1 to this. */
export const FLOWER_KINDS = 3;

/** A blade shorter than this is not drawn at all, in metres. */
const SHORTEST = 0.02;

/** One field of blades: which blades are its own, and its settings. */
export interface FieldTier {
  /** The number of its first blade, and how many it has. */
  start: number;
  count: number;
  /** Half the width of its square, in metres. */
  half: number;
  /** Half the width of the field inside it, which it gives way to; 0 for the innermost. */
  inner: number;
  /** Width of a blade at its foot, in metres, and the triangles each is drawn with. */
  width: number;
  triangles: 1 | 3;
}

/** Every blade of every field. The same on every island: the island decides which of them stand. */
export interface GrassBlades {
  count: number;
  tiers: FieldTier[];
  /** Two numbers per blade: its place in its field's square, across and down, each from -half to half. */
  offset: Float32Array;
  /**
   * Four numbers per blade: which way its flat side faces (0 to half a turn, in radians); its share of the
   * range of lengths (0 shortest, 1 tallest); where it is in its flutter (0 to a full turn); and the number
   * it lives by (0 to 1): it stands only where the grass cover is greater.
   */
  trait: Float32Array;
  /** One per blade: 0 if it never flowers, otherwise which colour of flower (1 to `FLOWER_KINDS`). */
  flower: Uint8Array;
}

/**
 * The blades, from a fixed stream of the seeded random numbers. In each field
 * they are spread one to a cell of a grid, anywhere within its cell, so the
 * field is evenly covered without being regular.
 */
export function grassBlades(cfg: GrassConfig): GrassBlades {
  const count = cfg.tiers.reduce((sum, tier) => sum + tier.blades, 0);
  const offset = new Float32Array(count * 2);
  const trait = new Float32Array(count * 4);
  const flower = new Uint8Array(count);
  const tiers: FieldTier[] = [];
  const stream = createRng(0, 'decor').fork('grass').fork('blades');

  let start = 0;
  cfg.tiers.forEach((tier, k) => {
    // A stream to each field, so changing one field's blades leaves the others as they were.
    const rng = stream.fork(`field-${k}`);
    /** Kept just under 1, so no rounding can push a number to the top of its range. */
    const next = (): number => Math.min(rng.next(), 0.99999);
    const columns = Math.ceil(Math.sqrt(tier.blades));
    const rows = Math.ceil(tier.blades / columns);
    for (let n = 0; n < tier.blades; n++) {
      const i = start + n;
      offset[i * 2] = -tier.half + ((n % columns) + next()) * ((2 * tier.half) / columns);
      offset[i * 2 + 1] = -tier.half + (Math.floor(n / columns) + next()) * ((2 * tier.half) / rows);
      trait[i * 4] = next() * Math.PI;
      trait[i * 4 + 1] = next();
      trait[i * 4 + 2] = next() * 2 * Math.PI;
      trait[i * 4 + 3] = next();
      const flowers = next() < cfg.flowers.share;
      const kind = 1 + Math.floor(next() * FLOWER_KINDS);
      flower[i] = flowers ? kind : 0;
    }
    tiers.push({ start, count: tier.blades, half: tier.half, inner: k === 0 ? 0 : cfg.tiers[k - 1]!.half, width: tier.width, triangles: tier.triangles });
    start += tier.blades;
  });
  return { count, tiers, offset, trait, flower };
}

/**
 * One blade standing a unit tall: x runs from -1 to 1 across its foot, y from
 * 0 at the foot to 1 at the tip. Three triangles taper to a point; one is a plain spike.
 */
export function bladeShape(triangles: 1 | 3): { positions: Float32Array; indices: Uint16Array } {
  if (triangles === 1) {
    return { positions: new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint16Array([0, 1, 2]) };
  }
  return {
    positions: new Float32Array([-1, 0, 0, 1, 0, 0, -0.6, 0.5, 0, 0.6, 0.5, 0, 0, 1, 0]),
    indices: new Uint16Array([0, 1, 3, 0, 3, 2, 2, 3, 4]),
  };
}

/** Where the camera is and which way it looks, as the grass needs it. */
export interface GrassEye {
  x: number;
  y: number;
  z: number;
  /** The level part of the direction it looks in (a unit vector in 3D): shorter the more steeply it looks up or down. */
  lookX: number;
  lookZ: number;
}

/** The camera as the grass needs it, from where it is and a point it looks at. */
export function grassEye(eye: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }): GrassEye {
  const dx = look.x - eye.x;
  const dy = look.y - eye.y;
  const dz = look.z - eye.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  return { x: eye.x, y: eye.y, z: eye.z, lookX: dx / length, lookZ: dz / length };
}

/**
 * The middle of a field: ahead of the camera, the way it looks, by a share of
 * the field's half-width, so most of the field is in view and not behind the camera.
 */
export function fieldCentre(eye: GrassEye, half: number, ahead: number): { x: number; z: number } {
  return { x: eye.x + eye.lookX * ahead * half, z: eye.z + eye.lookZ * ahead * half };
}

/**
 * Where a blade stands along one axis: its place in the square, moved a whole
 * number of the square's widths so that it is within `half` of the field's middle.
 * It stays exactly where it is as the middle moves, until it jumps a whole width.
 */
export function wrapAround(offset: number, centre: number, half: number): number {
  const span = 2 * half;
  return offset - span * Math.floor((offset - centre + half) / span);
}

const smooth = (from: number, to: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/**
 * How much of its height a blade keeps at a distance from its field's middle:
 * all of it over the middle of the field, none at the field's half-width and beyond.
 *
 * @param share the last share of the half-width over which it shrinks
 */
export function edgeFade(distance: number, half: number, share: number): number {
  return 1 - smooth(half * (1 - share), half, distance);
}

/**
 * Height of the drawn ground at a point, in metres: the ground mesh splits
 * each cell of the grid into two triangles (`terrainChunks.ts`), and this
 * reads the triangle the point is over. Off the tile it is the height at the tile's edge.
 */
export function groundHeightAt(ground: HeightField, x: number, z: number): number {
  const last = ground.size - 1;
  const gx = Math.min(last, Math.max(0, (x - ground.origin) / ground.cell));
  const gz = Math.min(last, Math.max(0, (z - ground.origin) / ground.cell));
  const ix = Math.min(last - 1, Math.floor(gx));
  const iz = Math.min(last - 1, Math.floor(gz));
  const fx = gx - ix;
  const fz = gz - iz;
  const i = iz * ground.size + ix;
  const a = ground.height[i]!;
  const b = ground.height[i + 1]!;
  const c = ground.height[i + ground.size]!;
  const d = ground.height[i + ground.size + 1]!;
  // The mesh's diagonal runs from b to c.
  return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

/** Whether a blade stands: only where the grass cover (0 to 1) is greater than the number it lives by. */
export function bladeLives(rank: number, grass: number): boolean {
  return rank < grass;
}

/**
 * How tall a blade grows, in metres, before any fading: long meadow grass on
 * lush ground, short turf on dry, and never over the mown height within the
 * mown strip beside the road, growing back to full length beyond it.
 *
 * @param variation the cover's variation there: 0 lush, 1 dry
 * @param roadside metres from the road edge
 * @param share the blade's own share of the range of lengths, 0 to 1
 */
export function bladeLength(variation: number, roadside: number, share: number, cfg: GrassConfig): number {
  const meadow = 1 - smooth(cfg.meadowBlend[0], cfg.meadowBlend[1], variation);
  const turfLength = cfg.turf[0] + (cfg.turf[1] - cfg.turf[0]) * share;
  const meadowLength = cfg.meadow[0] + (cfg.meadow[1] - cfg.meadow[0]) * share;
  const full = turfLength + (meadowLength - turfLength) * meadow;
  const mown = Math.min(full, cfg.mown.height);
  const grown = smooth(cfg.mown.width, cfg.mown.width + cfg.mown.ease, roadside);
  return mown + (full - mown) * grown;
}

/**
 * How far the wind pushes a blade's tip at a moment, as a share of the blade's
 * length: down the wind when positive. A slow gust that travels down the wind,
 * plus a quicker flutter of the blade's own.
 *
 * @param phase where the blade is in its flutter, in radians
 * @param wind the way the wind blows across the map (x, z); need not be a unit vector
 */
export function sway(x: number, z: number, phase: number, seconds: number, wind: readonly [number, number], cfg: SwayConfig): number {
  const length = Math.hypot(wind[0], wind[1]) || 1;
  const along = (x * wind[0] + z * wind[1]) / length;
  const gust = 0.5 + 0.5 * Math.sin(((2 * Math.PI) / cfg.gustLength) * (along - cfg.gustSpeed * seconds));
  const flutter = Math.sin(cfg.flutterSpeed * seconds + phase + 0.21 * x + 0.13 * z);
  return cfg.gust * gust + cfg.flutter * flutter;
}

/** One blade as it stands for a camera at a moment. Everything in metres. */
export interface Blade {
  /** Which field it belongs to. */
  tier: number;
  /** Its foot: where on the map, and the height it is drawn from (the ground, less the little it is sunk). */
  x: number;
  y: number;
  z: number;
  /** Whether grass grows there for this blade at all. */
  lives: boolean;
  /** How tall it stands now, after fading: 0 if it does not live. */
  height: number;
  /** How wide its foot is: 0 if it is too short to draw. */
  width: number;
  /** 0, or the colour of flower it carries (1 to `FLOWER_KINDS`). */
  flower: number;
  /** Where its tip is, pushed by the wind. */
  tipX: number;
  tipY: number;
  tipZ: number;
}

/**
 * Where blade `i` stands for a camera at a moment, and how tall. The same sums as the grass shader.
 *
 * @param ground the island's fitted ground: the ground that is drawn
 * @param seconds time on the wind's clock
 * @param wind the way the wind blows across the map (x, z)
 */
export function bladeAt(
  blades: GrassBlades,
  i: number,
  eye: GrassEye,
  grid: GrassGrid,
  ground: HeightField,
  seconds: number,
  cfg: GrassConfig,
  wind: readonly [number, number],
): Blade {
  let k = 0;
  while (k < blades.tiers.length - 1 && i >= blades.tiers[k]!.start + blades.tiers[k]!.count) k++;
  const tier = blades.tiers[k]!;
  const share = blades.trait[i * 4 + 1]!;
  const phase = blades.trait[i * 4 + 2]!;
  const rank = blades.trait[i * 4 + 3]!;

  const centre = fieldCentre(eye, tier.half, cfg.ahead);
  const x = wrapAround(blades.offset[i * 2]!, centre.x, tier.half);
  const z = wrapAround(blades.offset[i * 2 + 1]!, centre.z, tier.half);
  let fade = edgeFade(Math.hypot(x - centre.x, z - centre.z), tier.half, cfg.edgeFade);
  if (tier.inner > 0) {
    // Where the field inside this one stands at full height, this one stands down.
    const within = fieldCentre(eye, tier.inner, cfg.ahead);
    fade *= 1 - edgeFade(Math.hypot(x - within.x, z - within.z), tier.inner, cfg.edgeFade);
  }

  const here = grassAt(grid, x, z);
  const foot = groundHeightAt(ground, x, z);
  const lives = bladeLives(rank, here.grass) && foot > cfg.dry;
  const length = bladeLength(here.variation, here.roadside, share, cfg);
  const height = lives ? length * fade : 0;
  const width = height >= SHORTEST ? tier.width * (0.6 + 0.4 * share) : 0;
  const flowers = lives && blades.flower[i]! > 0 && length >= cfg.flowers.minLength && here.flowers > 0.5;

  const windLength = Math.hypot(wind[0], wind[1]) || 1;
  const bend = sway(x, z, phase, seconds, wind, cfg.sway) * height;
  const y = foot - cfg.sink;
  return {
    tier: k,
    x,
    y,
    z,
    lives,
    height,
    width,
    flower: flowers ? blades.flower[i]! : 0,
    tipX: x + (wind[0] / windLength) * bend,
    tipY: y + height - bend * 0.25,
    tipZ: z + (wind[1] / windLength) * bend,
  };
}

const float = (value: number): string => (Number.isInteger(value) ? `${value}.0` : String(value));

/**
 * The shader's version of `bladeAt`. It defines
 * `vec3 grassVertex(vec2 corner, vec2 offset, vec4 trait, vec3 tier, float flowerKind, out float along, out float variation, out float flowering)`:
 * where one corner of a blade is in the world. `corner` is a vertex of
 * `bladeShape` (x across, y up the blade); `offset`, `trait` and `flowerKind`
 * are the blade's numbers from `grassBlades`; `tier` is its field's half-width,
 * the half-width of the field inside it, and its blade width. It hands back how
 * far up the blade the corner is, the ground's variation there, and the colour
 * of flower the blade carries now (0 for none).
 *
 * It needs `groundAt` and its uniforms from `DEPTH_GLSL` (`waterDepth.ts`) written before it, and these uniforms set:
 * `uGrass` (the grid from `grassGrid`, as a four-channel texture read with blending), `uGrassReach` (the grid's `reach`),
 * `uGrassEye` and `uGrassLook` (a `GrassEye`'s x and z, and its lookX and lookZ), `uGrassTime` (seconds on the wind's clock).
 *
 * @param wind the way the wind blows across the map (x, z)
 */
export function grassGlsl(cfg: GrassConfig, wind: readonly [number, number]): string {
  const windLength = Math.hypot(wind[0], wind[1]) || 1;
  const wx = wind[0] / windLength;
  const wz = wind[1] / windLength;
  const { sway: s, flowers, mown } = cfg;
  return /* glsl */ `
    uniform sampler2D uGrass;
    uniform float uGrassReach;
    uniform vec2 uGrassEye;
    uniform vec2 uGrassLook;
    uniform float uGrassTime;

    vec2 grassCentre(float halfWidth) {
      return uGrassEye + uGrassLook * (${float(cfg.ahead)} * halfWidth);
    }
    float grassWrap(float offset, float centre, float halfWidth) {
      float span = 2.0 * halfWidth;
      return offset - span * floor((offset - centre + halfWidth) / span);
    }
    float grassEdgeFade(float away, float halfWidth) {
      return 1.0 - smoothstep(halfWidth * ${float(1 - cfg.edgeFade)}, halfWidth, away);
    }
    float grassGround(vec2 world) {
      float last = uGroundSize - 1.0;
      vec2 g = clamp((world - uGroundOrigin) / uGroundCell, 0.0, last);
      vec2 i = min(vec2(last - 1.0), floor(g));
      vec2 f = g - i;
      float a = groundAt(i);
      float b = groundAt(i + vec2(1.0, 0.0));
      float c = groundAt(i + vec2(0.0, 1.0));
      float d = groundAt(i + vec2(1.0, 1.0));
      return f.x + f.y <= 1.0 ? a + (b - a) * f.x + (c - a) * f.y : d + (c - d) * (1.0 - f.x) + (b - d) * (1.0 - f.y);
    }
    float grassLength(float variation, float roadside, float share) {
      float meadow = 1.0 - smoothstep(${float(cfg.meadowBlend[0])}, ${float(cfg.meadowBlend[1])}, variation);
      float turfLength = mix(${float(cfg.turf[0])}, ${float(cfg.turf[1])}, share);
      float meadowLength = mix(${float(cfg.meadow[0])}, ${float(cfg.meadow[1])}, share);
      float whole = mix(turfLength, meadowLength, meadow);
      float cut = min(whole, ${float(mown.height)});
      float grown = smoothstep(${float(mown.width)}, ${float(mown.width + mown.ease)}, roadside);
      return mix(cut, whole, grown);
    }
    float grassSway(vec2 p, float phase) {
      float gust = 0.5 + 0.5 * sin(${float((2 * Math.PI) / s.gustLength)} * (dot(p, vec2(${float(wx)}, ${float(wz)})) - ${float(s.gustSpeed)} * uGrassTime));
      float flutter = sin(${float(s.flutterSpeed)} * uGrassTime + phase + 0.21 * p.x + 0.13 * p.y);
      return ${float(s.gust)} * gust + ${float(s.flutter)} * flutter;
    }
    vec3 grassVertex(vec2 corner, vec2 offset, vec4 trait, vec3 tier, float flowerKind, out float along, out float variation, out float flowering) {
      float halfWidth = tier.x;
      vec2 centre = grassCentre(halfWidth);
      vec2 p = vec2(grassWrap(offset.x, centre.x, halfWidth), grassWrap(offset.y, centre.y, halfWidth));
      float fade = grassEdgeFade(distance(p, centre), halfWidth);
      if (tier.y > 0.0) fade *= 1.0 - grassEdgeFade(distance(p, grassCentre(tier.y)), tier.y);

      vec4 here = texture2D(uGrass, ((p - uGroundOrigin) / uGroundCell + 0.5) / uGroundSize);
      float foot = grassGround(p);
      float lives = (here.r > trait.w && foot > ${float(cfg.dry)}) ? 1.0 : 0.0;
      float len = grassLength(here.g, here.b * uGrassReach, trait.y);
      float tall = len * fade * lives;
      float wide = tall >= ${float(SHORTEST)} ? tier.z * 0.5 * (0.6 + 0.4 * trait.y) : 0.0;
      flowering = (flowerKind > 0.5 && lives > 0.5 && len >= ${float(flowers.minLength)} && here.a > 0.5) ? flowerKind : 0.0;

      float up = corner.y;
      float side = corner.x;
      if (flowering > 0.5 && up > 0.0 && up < 1.0) {
        up = ${float(1 - flowers.tip)};
        side = sign(corner.x) * ${float(flowers.widen)};
      }
      vec2 facing = vec2(cos(trait.x), sin(trait.x));
      float bend = grassSway(p, trait.z) * up * up * tall;
      along = up;
      variation = here.g;
      return vec3(
        p.x + facing.x * side * wide + ${float(wx)} * bend,
        foot - ${float(cfg.sink)} + up * tall - bend * 0.25 * up,
        p.y + facing.y * side * wide + ${float(wz)} * bend
      );
    }
  `;
}
