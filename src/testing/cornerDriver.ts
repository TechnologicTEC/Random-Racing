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
 */
import type { PhysicsConfig } from '../config';
import type { CornerSection, WorldResult } from '../gen/types';
import { makeInput, type RawInput } from '../sim/input';
import type { Rapier } from '../sim/physics/rapier';
import { quatFromAxes } from '../sim/quat';
import { createSimOn, type CarState } from '../sim/sim';
import type { Pose } from '../sim/start';
import { stickToward } from './lineDriver';

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
}

export const CORNER_OPTIONS: CornerOptions = { runUp: 100, entry: 4, exit: 4, lookAhead: 12, keyHold: 0.15 };

/** Drifts through one corner of a world (see the file's comment). */
export function driftThroughCorner(rapier: Rapier, world: WorldResult, corner: CornerSection, cfg: PhysicsConfig, options: CornerOptions = CORNER_OPTIONS): CornerRun {
  const { line } = world.track.candidates[world.track.winnerIndex]!;
  const n = line.count;
  const ds = line.spacing;
  const dir: -1 | 1 = corner.direction === 'right' ? 1 : -1;
  const startAt = corner.startIndex;
  const runUpSamples = Math.round(options.runUp / ds);
  const entryAt = startAt + Math.round(options.entry / ds);
  const exitAt = startAt + corner.sampleCount - Math.round(options.exit / ds);
  const halfCar = cfg.car.body.halfWidth;
  const sim = createSimOn(rapier, { kind: 'island', world }, cfg, lapPose(world, startAt - runUpSamples, cfg));

  /** The sample nearest the car, counted on from the run-up's start without wrapping, searched near the last one. */
  let progress = startAt - runUpSamples;
  const sample = (k: number): number => ((k % n) + n) % n;
  const track = (state: CarState): { offset: number; allowed: number } => {
    let best = progress;
    let bestDistance = Infinity;
    for (let k = progress - 3; k <= progress + 12; k++) {
      const i = sample(k);
      const d = (state.position.x - line.x[i]!) ** 2 + (state.position.z - line.z[i]!) ** 2;
      if (d < bestDistance) [best, bestDistance] = [k, d];
    }
    progress = best;
    const i = sample(best);
    // Right of the road's way is (-tz, tx) on the map.
    const offset = (state.position.x - line.x[i]!) * -line.tz[i]! + (state.position.z - line.z[i]!) * line.tx[i]!;
    return { offset, allowed: world.road.width[i]! / 2 - halfCar };
  };
  const ahead = (metres: number): { x: number; z: number } => {
    const i = sample(progress + Math.round(metres / ds));
    return { x: line.x[i]!, z: line.z[i]! };
  };
  const step = (raw: RawInput): CarState => {
    sim.step(makeInput(raw));
    return sim.state();
  };

  // The run-up, on grip.
  let state = sim.state();
  let guard = 0;
  while (progress < entryAt && guard++ < 3000) {
    state = step({ throttle: 1, steer: stickToward(state, ahead(options.lookAhead), cfg.car) });
    track(state);
  }
  const atEntry = track(state);
  const entrySpeed = Math.hypot(state.velocity.x, state.velocity.z);
  const arrived = Math.abs(atEntry.offset) <= atEntry.allowed && entrySpeed >= cfg.car.drift.startSpeed * cfg.car.engine.topSpeed + 0.5;

  // The slide: the button down with the key into the corner, then whichever key's circle is nearest the one wanted.
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
  const holdSteps = Math.round(options.keyHold * cfg.sim.stepsPerSecond);
  state = step({ throttle: 1, drift: true, steer });
  guard = 0;
  while (progress < exitAt && guard++ < 3000) {
    const where = track(state);
    worstOffset = Math.max(worstOffset, Math.abs(where.offset));
    allowed = Math.min(allowed, where.allowed);
    if (Math.abs(where.offset) > where.allowed) onRoad = false;
    if (state.drift.phase !== 'slide') {
      held = false;
      break;
    }
    slidTo = progress;
    // The circle through the car, along the way it travels, and through the point ahead: how much it curves into the corner.
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    const point = ahead(options.lookAhead);
    const dx = point.x - state.position.x;
    const dz = point.z - state.position.z;
    const fx = state.velocity.x / speed;
    const fz = state.velocity.z / speed;
    const curve = ((2 * (-fz * dx + fx * dz)) / (dx * dx + dz * dz)) * dir;
    const wanted = curve > intoAbove ? dir : curve < awayBelow ? -dir : 0;
    kept++;
    if (wanted !== steer && kept >= holdSteps) [steer, kept] = [wanted, 0];
    state = step({ throttle: 1, drift: true, steer });
  }
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
  };
}
