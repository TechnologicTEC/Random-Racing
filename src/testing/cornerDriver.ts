/**
 * Test helper: drifts a car through one corner of a real island the way a
 * player on a keyboard can: the drift button and one of three steering
 * choices (the key into the corner, no key, or the other key) each step.
 *
 * The car is put on the middle of the road some way before the corner and
 * driven there at full throttle, steering with the line driver
 * (`stickToward`). Just after the corner starts it presses the drift button
 * with the key into the corner, then each step picks whichever of the three
 * slide circles (`car.drift.radius`) is nearest the circle through a point
 * a little way ahead on the middle of the road, and lets go just before the
 * corner ends. Step 9's bot grows from it.
 *
 * Two styles (6h): "careful" picks the key whose circle is nearest the road's,
 * as above; "holder" keeps the key into the corner from the drift button to
 * letting go, as a player who does not change keys mid-slide. After letting go,
 * either drives on out of the corner for a set distance on the line driver,
 * with whatever boost the slide earned (`driveOut`).
 */
import type { PhysicsConfig } from '../config';
import type { CornerSection, WorldResult } from '../gen/types';
import type { Hit } from '../sim/car/drift';
import { makeInput, type RawInput } from '../sim/input';
import type { Rapier } from '../sim/physics/rapier';
import { quatFromAxes } from '../sim/quat';
import { createSimOn, type CarState, type Sim } from '../sim/sim';
import type { Pose } from '../sim/start';
import { stickToward, type MapPoint } from './lineDriver';

/** Where a car stands on the middle of the road at one sample of the lap, facing along it and tipped with the road, at its ride height. */
export function lapPose(world: WorldResult, index: number, cfg: PhysicsConfig): Pose {
  const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
  const n = line.count;
  const i = ((index % n) + n) % n;
  const next = (i + 1) % n;
  const tx = line.tx[i]!;
  const tz = line.tz[i]!;
  const climb = (profile.height[next]! - profile.height[i]!) / line.spacing;
  const size = Math.sqrt(tx * tx + climb * climb + tz * tz);
  const forward = { x: tx / size, y: climb / size, z: tz / size };
  const tilt = world.road.cross[i]!;
  const across = { x: -tz, y: tilt, z: tx };
  const lean = across.x * forward.x + across.y * forward.y + across.z * forward.z;
  const r = { x: across.x - forward.x * lean, y: across.y - forward.y * lean, z: across.z - forward.z * lean };
  const rs = Math.sqrt(r.x * r.x + r.y * r.y + r.z * r.z);
  const right = { x: r.x / rs, y: r.y / rs, z: r.z / rs };
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  const above = cfg.car.body.halfHeight + cfg.car.suspension.rideHeight;
  return {
    position: { x: line.x[i]! + up.x * above, y: profile.height[i]! + up.y * above, z: line.z[i]! + up.z * above },
    rotation: quatFromAxes(right, up, { x: -forward.x, y: -forward.y, z: -forward.z }),
  };
}

/** A line for a test driver to follow: the middle of a road, or a straight line on a test ground. */
export interface Lane {
  /**
   * Moves the lane's idea of where the car is on to its new state, and says how far the car's middle is to the
   * right of the lane's middle, how far it may be either side, and how far along the lane it is, in metres.
   */
  follow(state: CarState): { offset: number; allowed: number; along: number };
  /** The point on the lane's middle this far ahead of where the car last was. */
  ahead(metres: number): MapPoint;
  /** The speed a driver on grip may have now to take what is coming within `reach` metres, braking in time; none on a straight lane. */
  limit?(reach: number, cfg: PhysicsConfig): number;
}

/** How hard a test driver brakes for what is coming, as a share of the brake's strength, and how close to the grip's limit it corners (step 9a's bot). */
const BRAKE_SHARE = 0.7;
const CORNER_SHARE = 0.9;
/** How far ahead a test driver looks for corners to brake for, in metres. */
const LOOK_FOR_CORNERS = 80;

/**
 * A straight lane along -z (the way every test ground's car starts facing), with its middle at `x`.
 *
 * @param halfWidth how far either side of the middle the car's middle may be, in metres
 */
export function straightLane(x: number, halfWidth: number): Lane {
  let z = 0;
  return {
    follow(state) {
      z = state.position.z;
      return { offset: state.position.x - x, allowed: halfWidth, along: -z };
    },
    ahead: (metres) => ({ x, z: z - metres }),
  };
}

/** The middle of an island's road, from sample `from` of the lap, counted on without wrapping. */
export function roadLane(world: WorldResult, from: number, cfg: PhysicsConfig): Lane & { sample(): number } {
  const { line } = world.track.candidates[world.track.winnerIndex]!;
  const n = line.count;
  const ds = line.spacing;
  const halfCar = cfg.car.body.halfWidth;
  const wrap = (k: number): number => ((k % n) + n) % n;
  let progress = from;
  return {
    sample: () => progress,
    follow(state) {
      let best = progress;
      let bestDistance = Infinity;
      for (let k = progress - 3; k <= progress + 12; k++) {
        const i = wrap(k);
        const d = (state.position.x - line.x[i]!) ** 2 + (state.position.z - line.z[i]!) ** 2;
        if (d < bestDistance) [best, bestDistance] = [k, d];
      }
      progress = best;
      const i = wrap(best);
      // Right of the road's way is (-tz, tx) on the map.
      const offset = (state.position.x - line.x[i]!) * -line.tz[i]! + (state.position.z - line.z[i]!) * line.tx[i]!;
      return { offset, allowed: world.road.width[i]! / 2 - halfCar, along: (best - from) * ds };
    },
    ahead(metres) {
      const i = wrap(progress + Math.round(metres / ds));
      return { x: line.x[i]!, z: line.z[i]! };
    },
    limit(reach, cfg) {
      let speed = Infinity;
      const braking = 2 * BRAKE_SHARE * cfg.car.brake.strength;
      for (let k = 0; k * ds <= reach; k++) {
        const curve = Math.abs(line.curvature[wrap(progress + k)]!);
        if (curve === 0) continue;
        const allowed = Math.sqrt((CORNER_SHARE * cfg.car.steer.sideForce) / curve);
        speed = Math.min(speed, Math.sqrt(allowed * allowed + braking * k * ds));
      }
      return speed;
    },
  };
}

/** How a drive out of a corner went. */
export interface ExitRun {
  /** Nothing touched and the car's middle on the lane all the way. */
  clean: boolean;
  /** The first solid thing the body touched, or null. */
  hit: Hit;
  /** Whether the car's middle went further from the lane's middle than it may. */
  offRoad: boolean;
  /** How far along the lane the drive went, in metres. */
  travelled: number;
}

/**
 * Drives a car on along a lane with the line driver, for `metres` along it, and says whether it touched anything or
 * left the lane. It keeps the throttle down, and brakes for what is coming within 80 m when the lane says how fast
 * that may be taken (as step 9a's bot will). A boost already running carries on by itself.
 */
export function driveOut(sim: Sim, lane: Lane, cfg: PhysicsConfig, metres: number, lookAhead: number): ExitRun {
  let state = sim.state();
  const start = lane.follow(state).along;
  let hit: Hit = null;
  let offRoad = false;
  let travelled = 0;
  // Far more steps than any drive needs, so a car stopped against something still ends.
  const limit = Math.ceil(metres * 2 + 10 * cfg.sim.stepsPerSecond);
  for (let i = 0; i < limit && travelled < metres; i++) {
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    const over = speed - (lane.limit?.(LOOK_FOR_CORNERS, cfg) ?? Infinity);
    const pedals = over > 0.5 ? { brake: Math.min(1, over / 2) } : { throttle: 1 };
    sim.step(makeInput({ ...pedals, steer: stickToward(state, lane.ahead(lookAhead), cfg.car) }));
    state = sim.state();
    const where = lane.follow(state);
    travelled = where.along - start;
    if (Math.abs(where.offset) > where.allowed) offRoad = true;
    if (state.touch !== null && hit === null) hit = state.touch;
  }
  return { clean: hit === null && !offRoad, hit, offRoad, travelled };
}

/** How one corner went. */
export interface CornerRun {
  kind: CornerSection['kind'];
  /** The corner's tightest radius and its length along the middle of the road, in metres. */
  radius: number;
  length: number;
  /** The car's speed as the drift button went down, in metres per second. */
  entrySpeed: number;
  /** Whether the run-up brought the car to the corner on the road and fast enough to drift (12 m/s). */
  arrived: boolean;
  /** Whether the slide lasted from just after the corner's start to just before its end. */
  held: boolean;
  /** How far the car's middle strayed from the middle of the road during the slide, at worst, and how far it may (half the road's width less half the car's). */
  worstOffset: number;
  allowed: number;
  /** Whether the car stayed on the road all through the slide. */
  onRoad: boolean;
  /** How far round the corner the slide lasted, as a share of the corner's length. */
  share: number;
  /** How many times the driver changed key during the slide. */
  keyChanges: number;
  /** The tier the slide had reached when it was let go (0 for none), and how the drive out of the corner went (only when the slide was held). */
  exitTier: 0 | 1 | 2 | 3;
  exitClean: boolean;
  exitHit: Hit;
  exitTravelled: number;
}

export interface CornerOptions {
  /** How far before the corner the car is put, in metres. */
  runUp: number;
  /** The drift button goes down this far into the corner, and comes up this far before its end, in metres. */
  entry: number;
  exit: number;
  /** The point on the middle of the road the driver aims at, this far ahead, in metres. */
  lookAhead: number;
  /** The driver keeps a key (or no key) for at least this long before changing it, in seconds: a person, not a machine. */
  keyHold: number;
  /** "careful" picks the key whose circle is nearest the road's; "holder" keeps the key into the corner all through the slide. */
  style: 'careful' | 'holder';
  /** How far the driver drives on after letting go, in metres. */
  driveOut: number;
}

export const CORNER_OPTIONS: CornerOptions = { runUp: 100, entry: 4, exit: 4, lookAhead: 12, keyHold: 0.15, style: 'careful', driveOut: 100 };

/** Drifts through one corner of a world (see the file's comment). */
export function driftThroughCorner(rapier: Rapier, world: WorldResult, corner: CornerSection, cfg: PhysicsConfig, chosen: Partial<CornerOptions> = {}): CornerRun {
  const options: CornerOptions = { ...CORNER_OPTIONS, ...chosen };
  const ds = world.track.candidates[world.track.winnerIndex]!.line.spacing;
  const dir: -1 | 1 = corner.direction === 'right' ? 1 : -1;
  const startAt = corner.startIndex;
  const runUpSamples = Math.round(options.runUp / ds);
  const entryAt = startAt + Math.round(options.entry / ds);
  const exitAt = startAt + corner.sampleCount - Math.round(options.exit / ds);
  const sim = createSimOn(rapier, { kind: 'island', world }, cfg, lapPose(world, startAt - runUpSamples, cfg));
  const lane = roadLane(world, startAt - runUpSamples, cfg);
  const step = (raw: RawInput): CarState => {
    sim.step(makeInput(raw));
    return sim.state();
  };

  // The run-up, on grip.
  let state = sim.state();
  let guard = 0;
  while (lane.sample() < entryAt && guard++ < 3000) {
    state = step({ throttle: 1, steer: stickToward(state, lane.ahead(options.lookAhead), cfg.car) });
    lane.follow(state);
  }
  const atEntry = lane.follow(state);
  const entrySpeed = Math.hypot(state.velocity.x, state.velocity.z);
  const arrived = Math.abs(atEntry.offset) <= atEntry.allowed && entrySpeed >= cfg.car.drift.startSpeed * cfg.car.engine.topSpeed + 0.5;

  // The slide: the button down with the key into the corner, then (careful) whichever key's circle is nearest the one wanted.
  const { tight, middle, wide } = cfg.car.drift.radius;
  const intoAbove = (1 / tight + 1 / middle) / 2;
  const awayBelow = (1 / middle + 1 / wide) / 2;
  let held = true;
  let onRoad = true;
  let worstOffset = 0;
  let allowed = Infinity;
  let slidTo = entryAt;
  let steer: number = dir;
  let kept = 0;
  let keyChanges = 0;
  let tier: 0 | 1 | 2 | 3 = 0;
  const holdSteps = Math.round(options.keyHold * cfg.sim.stepsPerSecond);
  state = step({ throttle: 1, drift: true, steer });
  guard = 0;
  while (lane.sample() < exitAt && guard++ < 3000) {
    const where = lane.follow(state);
    worstOffset = Math.max(worstOffset, Math.abs(where.offset));
    allowed = Math.min(allowed, where.allowed);
    if (Math.abs(where.offset) > where.allowed) onRoad = false;
    if (state.drift.phase !== 'slide') {
      held = false;
      break;
    }
    slidTo = lane.sample();
    tier = state.drift.tier;
    if (options.style === 'careful') {
      // The circle through the car, along the way it travels, and through the point ahead: how much it curves into the corner.
      const speed = Math.hypot(state.velocity.x, state.velocity.z);
      const point = lane.ahead(options.lookAhead);
      const dx = point.x - state.position.x;
      const dz = point.z - state.position.z;
      const fx = state.velocity.x / speed;
      const fz = state.velocity.z / speed;
      const curve = ((2 * (-fz * dx + fx * dz)) / (dx * dx + dz * dz)) * dir;
      const wanted = curve > intoAbove ? dir : curve < awayBelow ? -dir : 0;
      kept++;
      if (wanted !== steer && kept >= holdSteps) {
        [steer, kept] = [wanted, 0];
        keyChanges++;
      }
    }
    state = step({ throttle: 1, drift: true, steer });
  }

  // Letting go, then driving on out of the corner with whatever boost that gave.
  const exit: ExitRun = held ? driveOut(sim, lane, cfg, options.driveOut, options.lookAhead) : { clean: false, hit: null, offRoad: false, travelled: 0 };
  sim.free();
  const planned = Math.max(1, exitAt - entryAt);
  return {
    kind: corner.kind,
    radius: corner.minRadius,
    length: corner.length,
    entrySpeed,
    arrived,
    held,
    worstOffset,
    allowed,
    onRoad,
    share: Math.min(1, (slidTo - entryAt) / planned),
    keyChanges,
    exitTier: held ? tier : 0,
    exitClean: exit.clean,
    exitHit: exit.hit,
    exitTravelled: exit.travelled,
  };
}
