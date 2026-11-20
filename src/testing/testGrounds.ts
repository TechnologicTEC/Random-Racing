/**
 * Test helper: simple grounds for testing how the car handles, where the ground
 * is exactly known. Each is a few sheets of triangles and a place to start.
 *
 * On all of them the car starts facing -z (its own forward), with +x on its
 * right, so "along" below means metres ahead of the origin: the point `along`
 * metres ahead is at z = -along.
 */
import { config, type PhysicsConfig } from '../config';
import type { MeshData } from '../gen/types';
import type { PlainCourse } from '../sim/course';
import { quatFromAxes, type Vec3 } from '../sim/quat';
import type { Pose } from '../sim/start';
import { cross, dot, scale, sub, unit } from '../sim/vec';

export interface TestGround {
  course: PlainCourse;
  /** Where the car starts: on the ground, the right way up, facing -z unless the ground says otherwise. */
  start: Pose;
  /** Height of the driving surface at a point, in metres. Kerbs lie on top of it (`KerbGround.kerbTop`). */
  height(x: number, z: number): number;
}

/** Collects sheets of triangles into one mesh. */
class Sheets {
  private readonly positions: number[] = [];
  private readonly indices: number[] = [];

  /**
   * Adds a sheet: a grid of points, row by row, joined into two triangles a
   * cell. The triangles are wound so that their faces look up.
   *
   * @param closed joins the last row back to the first, for a ring
   */
  add(rows: Vec3[][], closed = false): this {
    const first = this.positions.length / 3;
    const columns = rows[0]!.length;
    for (const row of rows) for (const p of row) this.positions.push(p.x, p.y, p.z);
    const a = rows[0]![0]!;
    const b = rows[1]![0]!;
    const c = rows[0]![1]!;
    // The y part of (b - a) crossed with (c - a): negative means the sheet's rows and columns run the other way round.
    const flip = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0;
    const count = closed ? rows.length : rows.length - 1;
    for (let r = 0; r < count; r++) {
      const next = (r + 1) % rows.length;
      for (let col = 0; col < columns - 1; col++) {
        const p00 = first + r * columns + col;
        const p10 = first + next * columns + col;
        const p01 = p00 + 1;
        const p11 = p10 + 1;
        if (flip) this.indices.push(p00, p01, p10, p01, p11, p10);
        else this.indices.push(p00, p10, p01, p01, p10, p11);
      }
    }
    return this;
  }

  /** A sheet over a grid of x and z values, both rising, at the height given. */
  grid(xs: number[], zs: number[], height: (x: number, z: number) => number): this {
    return this.add(zs.map((z) => xs.map((x) => ({ x, y: height(x, z), z }))));
  }

  mesh(): MeshData {
    return { positions: new Float32Array(this.positions), indices: new Uint32Array(this.indices), materials: new Uint8Array(this.positions.length / 3) };
  }
}

/** Numbers from `from` to `to`, `step` apart, both ends included. */
function steps(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  const count = Math.round((to - from) / step);
  for (let i = 0; i <= count; i++) out.push(from + i * step);
  return out;
}

/**
 * Stands a car on a test ground at a point, facing a direction on the map and
 * tipped with the ground there, as `startPose` stands it on a road.
 *
 * @param forward the way it faces, on the map; one long
 */
export function poseOn(ground: Pick<TestGround, 'height'>, x: number, z: number, forward: { x: number; z: number }, cfg: PhysicsConfig): Pose {
  const reach = 0.01;
  const slope = (dx: number, dz: number): number => (ground.height(x + dx * reach, z + dz * reach) - ground.height(x - dx * reach, z - dz * reach)) / (2 * reach);
  const ahead = unit({ x: forward.x, y: slope(forward.x, forward.z), z: forward.z });
  // Right of the way it faces is (-z, x) on the map.
  const across = { x: -forward.z, y: slope(-forward.z, forward.x), z: forward.x };
  const right = unit(sub(across, scale(ahead, dot(across, ahead))));
  const up = cross(right, ahead);
  const above = cfg.car.body.halfHeight + cfg.car.suspension.rideHeight;
  return {
    position: { x: x + up.x * above, y: ground.height(x, z) + up.y * above, z: z + up.z * above },
    rotation: quatFromAxes(right, up, scale(ahead, -1)),
  };
}

const AHEAD = { x: 0, z: -1 };

/** A level sheet at height 0: 800 m ahead of the car, 100 m behind it and 300 m to each side. */
export function flatGround(): TestGround {
  const height = (): number => 0;
  const road = new Sheets().grid(steps(-300, 300, 20), steps(-900, 100, 20), height).mesh();
  return { course: { kind: 'plain', road }, start: poseOn({ height }, 0, 0, AHEAD, config), height };
}

export interface GrassGround extends TestGround {
  /** Right of x = 0 (+x), the road ends and the grass begins this far ahead of the start. Left of it, it is road all the way. */
  grassFrom: number;
}

/**
 * A level sheet, road on the left (x 0 or less) for its whole length; on the
 * right, road for the first 300 m ahead of the start and grass after that.
 * Driven at x = 50 the car runs off the road onto the grass; driven along
 * x = 0 its left wheels stay on the road and its right wheels go onto the grass.
 */
export function grassGround(): GrassGround {
  const height = (): number => 0;
  const grassFrom = 300;
  const right = steps(0, 300, 20);
  const road = new Sheets().grid(steps(-300, 0, 20), steps(-1200, 100, 20), height).grid(right, steps(-grassFrom, 100, 20), height).mesh();
  const grass = new Sheets().grid(right, steps(-1200, -grassFrom, 20), height).mesh();
  return { course: { kind: 'plain', road, grass }, start: poseOn({ height }, 50, 0, AHEAD, config), height, grassFrom };
}

export interface WallGround extends TestGround {
  /** The wall's face, towards the car, is this far to the right of the start (+x). */
  wallAt: number;
}

/**
 * The flat ground with a solid wall along its right-hand side, 30 m from the
 * start: 0.8 m high, as the island's walls are, reaching 0.6 m into the
 * ground, and as long as the ground.
 */
export function wallGround(): WallGround {
  const flat = flatGround();
  const wallAt = 30;
  const wall = { centre: { x: wallAt + 0.5, y: 0.1, z: -400 }, half: { x: 0.5, y: 0.7, z: 500 } };
  return { ...flat, course: { ...flat.course, walls: [wall] }, wallAt };
}

/**
 * A road's height along its length, from pieces that are each straight or
 * curved up or down at one radius, as the generator's roads are. Level before
 * the first piece; the last slope carries on after the last one.
 *
 * @param pieces `bend` is how much the slope changes each metre: 1/200 for a dip of 200 m radius, -1/200 for a crest
 */
function profile(pieces: Array<{ length: number; bend: number }>): { height(along: number): number; ends: number[] } {
  const starts: Array<{ from: number; height: number; slope: number; bend: number }> = [];
  const ends: number[] = [];
  let from = 0;
  let height = 0;
  let slope = 0;
  for (const { length, bend } of pieces) {
    starts.push({ from, height, slope, bend });
    height += slope * length + (bend * length * length) / 2;
    slope += bend * length;
    from += length;
    ends.push(from);
  }
  starts.push({ from, height, slope, bend: 0 });
  return {
    ends,
    height(along) {
      if (along <= 0) return 0;
      let piece = starts[0]!;
      for (const next of starts) if (next.from <= along) piece = next;
      const t = along - piece.from;
      return piece.height + piece.slope * t + (piece.bend * t * t) / 2;
    },
  };
}

export interface RampGround extends TestGround {
  /** The steady climb, as a fraction: 0.15. */
  grade: number;
  /** The ground is level up to this far ahead of the start, in metres. */
  rampStart: number;
  /** From this far ahead the climb is steady, for at least 500 m. */
  steadyFrom: number;
}

/** A level run-up of 100 m, then a climb of 15%, the steepest road the generator builds, eased into over a dip of the tightest radius it allows. */
export function rampGround(): RampGround {
  const grade = 0.15;
  const radius = config.road.crestMinRadius;
  const rampStart = 100;
  const ease = grade * radius;
  const shape = profile([
    { length: rampStart, bend: 0 },
    { length: ease, bend: 1 / radius },
    { length: 600, bend: 0 },
  ]);
  const height = (_x: number, z: number): number => shape.height(-z);
  const road = new Sheets().grid(steps(-20, 20, 10), steps(-(rampStart + ease + 600), 20, 2), height).mesh();
  return { course: { kind: 'plain', road }, start: poseOn({ height }, 0, 0, AHEAD, config), height, grade, rampStart, steadyFrom: rampStart + ease };
}

export interface CrestGround extends TestGround {
  /** The radius of the crest, in metres: the tightest the generator allows. */
  radius: number;
  /** The crest begins and ends this far ahead of the start, in metres. Before it the road climbs at 8%, after it it falls at 8%. */
  crestStart: number;
  crestEnd: number;
}

/** A long climb at 8%, a crest of the tightest radius the generator allows, and a fall at 8%. */
export function crestGround(): CrestGround {
  const grade = 0.08;
  const radius = config.road.crestMinRadius;
  const shape = profile([
    { length: 60, bend: 0 },
    { length: grade * radius, bend: 1 / radius },
    { length: 250, bend: 0 },
    { length: 2 * grade * radius, bend: -1 / radius },
    { length: 400, bend: 0 },
  ]);
  const height = (_x: number, z: number): number => shape.height(-z);
  const road = new Sheets().grid(steps(-20, 20, 10), steps(-shape.ends[4]!, 20, 2), height).mesh();
  return { course: { kind: 'plain', road }, start: poseOn({ height }, 0, 0, AHEAD, config), height, radius, crestStart: shape.ends[2]!, crestEnd: shape.ends[3]! };
}

export interface BankedBend extends TestGround {
  /** The radius of the middle of the road, in metres. The ring is centred on the origin. */
  radius: number;
  /** The banking: metres of height gained per metre towards the outside. */
  cross: number;
}

/**
 * A ring of road of 70 m radius, banked 8 degrees with the inside low: the
 * steepest banking the generator gives, at the radius where it gives all of it.
 * The car starts on the middle of the road at (70, 0), facing -z, so it laps
 * the ring turning left.
 */
export function bankedBend(): BankedBend {
  const radius = config.road.bankFastRadius;
  const tilt = Math.tan((config.road.bankMax * Math.PI) / 180);
  const height = (x: number, z: number): number => (Math.sqrt(x * x + z * z) - radius) * tilt;
  // A row every 2 degrees, 2.4 m apart on the middle of the road; 15 m of road either side of the middle.
  const rows: Vec3[][] = [];
  for (let degrees = 0; degrees < 360; degrees += 2) {
    const angle = (degrees * Math.PI) / 180;
    rows.push(steps(radius - 15, radius + 15, 5).map((r) => ({ x: r * Math.cos(angle), y: (r - radius) * tilt, z: r * Math.sin(angle) })));
  }
  const road = new Sheets().add(rows, true).mesh();
  return { course: { kind: 'plain', road }, start: poseOn({ height }, radius, 0, AHEAD, config), height, radius, cross: tilt };
}

export interface KerbGround extends TestGround {
  /** The x of the kerb's inside edge, where it is flush with the ground. Its outside edge is `road.kerbWidth` further right. */
  kerbInner: number;
  /** The kerb runs between these distances ahead of the start, in metres. */
  kerbFrom: number;
  kerbTo: number;
  /** Height of the kerb's top at an x where the kerb is at its full height; 0 beside it. */
  kerbTop(x: number): number;
}

/**
 * Level ground with a kerb like the road's on the car's right: a low ramp
 * rising to the right, 400 m long, with an upright face down its outer side.
 */
export function kerbGround(): KerbGround {
  const { kerbWidth, kerbHeight } = config.road;
  const kerbInner = 6.5;
  const kerbFrom = 50;
  const kerbTo = 450;
  const height = (): number => 0;
  const road = new Sheets().grid(steps(-100, 100, 20), steps(-600, 100, 20), height).mesh();
  const outer = kerbInner + kerbWidth;
  // Like the road's kerbs, it rises from nothing over its first and last rows.
  const rows = steps(-kerbTo, -kerbFrom, 2).map((z) => ({ z, top: z === -kerbTo || z === -kerbFrom ? 0 : kerbHeight }));
  const kerbs = new Sheets()
    .add(rows.map(({ z, top }) => [{ x: kerbInner, y: 0, z }, { x: outer, y: top, z }]))
    .add(rows.map(({ z, top }) => [{ x: outer, y: top, z }, { x: outer, y: 0, z }]))
    .mesh();
  const kerbTop = (x: number): number => (x < kerbInner || x > outer ? 0 : ((x - kerbInner) / kerbWidth) * kerbHeight);
  return { course: { kind: 'plain', road, kerbs }, start: poseOn({ height }, 0, 0, AHEAD, config), height, kerbInner, kerbFrom, kerbTo, kerbTop };
}

export interface HillsideGround extends TestGround {
  /** The x where the slope begins. Left of it the ground is level road. */
  foot: number;
  /** How steeply the grass rises to the right of the foot, as a fraction: the steepest bank the generator leaves beside a road. */
  slope: number;
}

/** A level strip of road with a grass hillside rising at 45% on the car's right, 60 m up the slope and 700 m long. */
export function hillsideGround(): HillsideGround {
  const foot = 10;
  const slope = config.road.maxBankSlope;
  const height = (x: number): number => Math.max(0, (x - foot) * slope);
  const zs = steps(-600, 100, 10);
  const road = new Sheets().grid(steps(-40, foot, 10), zs, height).mesh();
  const grass = new Sheets().grid(steps(foot, foot + 60, 3), zs, height).mesh();
  return { course: { kind: 'plain', road, grass }, start: poseOn({ height }, 0, 0, AHEAD, config), height, foot, slope };
}

export interface StepGround extends TestGround {
  /** The ground drops this far, in metres, at an upright face. */
  drop: number;
  /** The drop is this far ahead of the start. */
  edge: number;
}

/** Level ground that drops a metre, straight down, 150 m ahead of the car. */
export function stepGround(): StepGround {
  const drop = 1;
  const edge = 150;
  const height = (_x: number, z: number): number => (-z <= edge ? 0 : -drop);
  const xs = steps(-30, 30, 10);
  const road = new Sheets()
    .grid(xs, steps(-edge, 20, 10), () => 0)
    .add([xs.map((x) => ({ x, y: -drop, z: -edge })), xs.map((x) => ({ x, y: 0, z: -edge }))])
    .grid(xs, steps(-(edge + 400), -edge, 10), () => -drop)
    .mesh();
  return { course: { kind: 'plain', road }, start: poseOn({ height }, 0, 0, AHEAD, config), height, drop, edge };
}
