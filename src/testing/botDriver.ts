/**
 * Test helper (step 9, never shipped): a bot that drives laps of a real island.
 *
 * It follows the centre line with the line driver (`stickToward`), aiming
 * `6 + 0.5 * speed` metres ahead of its place on the lap (`CarState.progress`),
 * and brakes for what is coming within 80 m: a corner allows the square root
 * of 0.9 times the steering's grip times its radius, and braking at 0.7 of
 * the brake's strength takes it there in time (`cornerLimit`).
 *
 * Told to slide (step 9b), it drifts through the generator's own drift corners
 * (45 degrees or more, 90 m or less: `slideCorners`): it presses the button
 * with the stick into the corner 10 m before it (or at its start, if the road
 * is still turning the other way until then, and only once its line turns into
 * the corner), then asks for the
 * slide circle through the car and a point 12 m ahead on the centre line
 * (`stickForCurve`, the inverse of `pathCurve`), and lets go when 15 degrees
 * of the corner are left (`turnLeft`). It does not brake for a corner it will
 * slide through, since a slide holds its circle at any speed.
 *
 * It reads nothing but the car's state and the world, so a lap is a list of
 * inputs that can be packed (`packInput`) and replayed anywhere (step 9c).
 */
import type { CarConfig, GameConfig, PhysicsConfig } from '../config';
import type { CenterLine, CornerSection, Section, WorldResult } from '../gen/types';
import type { Hit } from '../sim/car/drift';
import { makeInput, packInput, type RawInput } from '../sim/input';
import type { Rapier } from '../sim/physics/rapier';
import { createSim, createSimOn, type CarState } from '../sim/sim';
import { checkpointCount } from '../sim/track/progress';
import { lapPose } from './cornerDriver';
import { cornerLimit, CORNER_SHARE, stickToward, type MapPoint } from './lineDriver';

/** The bot's own numbers (test code, so not in the config). */
export const BOT = {
  /** How far ahead it looks for corners to brake for, in metres. */
  reach: 80,
  /** It aims this far ahead on the centre line, in metres, plus `aimPerSpeed` seconds of travel. */
  aimBase: 6,
  aimPerSpeed: 0.5,
  /** Within this many metres per second of its target speed it holds it; further over it brakes, under it presses right down. */
  band: 0.5,
  /** Braking by how far over the target, in metres per second, for each whole press of the brake. */
  brakePer: 2,
  /** A lap that takes longer than this, in seconds, is given up. */
  lapLimit: 300,
  /** It presses the drift button this far before a corner it slides through, in metres, unless the road is still turning the other way there. */
  slideFrom: 10,
  /** Turning the other way means curving more than this, one over metres (a 500 m circle). */
  against: 1 / 500,
  /** In a slide it aims at the point this far ahead on the centre line, in metres (the keyboard corner driver's). */
  slideAim: 12,
  /** It lets go when this much of the corner's turn is left, in degrees. */
  releaseDegrees: 15,
  /** Before the slide starts it steers at least this much more than the drift's `steerToStart` into the corner, so the press picks the side. */
  pickSide: 0.05,
};

/** The corner proof's pass (step 9b): the car is put this far before the corner, and timed from `before` metres before it to `after` metres after it. */
export const PASS = { runUp: 250, before: 40, after: 120, limit: 90, margins: [0.9, 1, 1.1] as readonly number[] };

/** The settings a bot reads: the physics, and the generator's drift corners (`track.score`). */
export type BotConfig = PhysicsConfig & Pick<GameConfig, 'track'>;

/** What the bot presses, from the state the car is in. */
export type Bot = (state: CarState) => RawInput;

export interface BotOptions {
  /** How close to the steering's grip it corners: 0.9 unless told otherwise. */
  margin: number;
  /** Whether it slides through the generator's drift corners (`slideCorners`). */
  slide: boolean;
  /** The corners it slides through, in place of `slideCorners` (the corner proof slides through one). */
  corners?: readonly CornerSection[];
}

/** The corners of a lap a bot told to slide drifts through: those that turn 45 degrees or more with a radius of 90 m or less, the generator's own drift corners (`track.score.driftMinDegrees`, `driftMaxRadius`). */
export function slideCorners(sections: readonly Section[], cfg: BotConfig): CornerSection[] {
  const { driftMinDegrees, driftMaxRadius } = cfg.track.score;
  return sections.filter((s): s is CornerSection => s.type === 'corner' && s.turnDegrees >= driftMinDegrees && s.minRadius <= driftMaxRadius);
}

/** The stick, from -1 to 1, that asks a slide to the side `dir` for a path of this curve towards it (one over the radius): the inverse of `pathCurve`, held to full stick. */
export function stickForCurve(curve: number, dir: -1 | 1, car: CarConfig): number {
  const { tight, middle, wide } = car.drift.radius;
  const into = curve >= 1 / middle ? (curve - 1 / middle) / (1 / tight - 1 / middle) : (curve - 1 / middle) / (1 / middle - 1 / wide);
  return Math.max(-1, Math.min(1, into)) * dir;
}

/** How far the centre line turns from sample `from` to sample `end` (counted on without wrapping, `end` not before `from`), in radians. */
export function turnLeft(line: CenterLine, from: number, end: number): number {
  const n = line.count;
  let turn = 0;
  for (let k = from; k < end; k++) turn += Math.abs(line.curvature[((k % n) + n) % n]!) * line.spacing;
  return turn;
}

/** The speed the bot wants at sample `from` of the line: the top speed, or less for a corner within 80 m (see the file's comment). */
export function targetSpeed(line: CenterLine, from: number, cfg: PhysicsConfig, margin = CORNER_SHARE, skip?: (sample: number) => boolean): number {
  return Math.min(cfg.car.engine.topSpeed, cornerLimit(line, from, BOT.reach, cfg.car, margin, skip));
}

/** How far ahead of its place on the lap the bot aims at this speed, in metres. */
export function aimDistance(speed: number): number {
  return BOT.aimBase + BOT.aimPerSpeed * speed;
}

/** The point on the centre line `along` metres from the start line, between the samples either side, wrapping round the lap. */
export function pointAlong(line: CenterLine, along: number): MapPoint {
  const at = ((along % line.length) + line.length) % line.length;
  const place = at / line.spacing;
  const i = Math.floor(place);
  const share = place - i;
  const a = i % line.count;
  const b = (i + 1) % line.count;
  return { x: line.x[a]! + (line.x[b]! - line.x[a]!) * share, z: line.z[a]! + (line.z[b]! - line.z[a]!) * share };
}

/** The pedals for a speed and a target: right down well under it, braking by how far over well over it, holding it in between (a part throttle chases that share of top speed). */
export function pedalsFor(speed: number, target: number, cfg: PhysicsConfig): { throttle: number } | { brake: number } {
  const over = speed - target;
  if (over > BOT.band) return { brake: Math.min(1, over / BOT.brakePer) };
  if (over < 0 - BOT.band) return { throttle: 1 };
  return { throttle: target / cfg.car.engine.topSpeed };
}

/** A bot for a world (see the file's comment). */
export function createBot(world: WorldResult, cfg: BotConfig, chosen: Partial<BotOptions> = {}): Bot {
  const options: BotOptions = { margin: CORNER_SHARE, slide: false, ...chosen };
  const { line, sections } = world.track.candidates[world.track.winnerIndex]!;
  const n = line.count;
  const ds = line.spacing;
  const lap = line.length;
  const corners = options.corners ?? (options.slide ? slideCorners(sections, cfg) : []);
  // The samples of the corners it slides through, which it does not brake for.
  const skipped = new Uint8Array(n);
  for (const c of corners) for (let k = c.startIndex; k < c.startIndex + c.sampleCount; k++) skipped[((k % n) + n) % n] = 1;
  const skip = corners.length > 0 ? (i: number): boolean => skipped[i] === 1 : undefined;
  const release = (BOT.releaseDegrees * Math.PI) / 180;
  const wrapLap = (metres: number): number => ((metres % lap) + lap) % lap;

  /** The corner it is sliding through now, or about to: from `slideFrom` before it until `releaseDegrees` of it are left. */
  const slidingThrough = (along: number, near: number): CornerSection | null => {
    for (const c of corners) {
      const start = c.startIndex * ds;
      const ahead = wrapLap(start - along);
      const inside = wrapLap(along - start) < c.sampleCount * ds;
      if (!inside && ahead > BOT.slideFrom) continue;
      // Before the corner it presses only once the road has stopped turning the other way: a slide cannot follow that.
      if (!inside) return (c.direction === 'right' ? 1 : -1) * line.curvature[near]! >= 0 - BOT.against ? c : null;
      const end = c.startIndex + c.sampleCount;
      const from = end - ((((end - near) % n) + n) % n);
      if (turnLeft(line, from, end) > release) return c;
    }
    return null;
  };

  // What it remembers, as a player would: the corner it is in, whether its slide there was cancelled (by a hit), and
  // whether it was sliding on the last step.
  let current: CornerSection | null = null;
  let gaveUp = false;
  let wasSliding = false;

  return (state) => {
    const progress = state.progress!;
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    const sliding = state.drift.phase === 'slide';
    const corner = corners.length > 0 ? slidingThrough(progress.along, progress.near) : null;
    if (corner !== current) [current, gaveUp] = [corner, false];
    // A slide that ended while the button was held was cancelled: drive the rest of the corner on grip.
    if (corner !== null && wasSliding && !sliding && state.input.drift === 1) gaveUp = true;
    wasSliding = sliding;
    const dir: -1 | 1 = corner?.direction === 'right' ? 1 : -1;
    // The nose still swinging back from a slide to the other side: a slide this way waits for it (6a), so it does too.
    const waiting = state.drift.angle !== 0 && state.drift.dir !== dir;
    if (corner !== null && !gaveUp && !waiting) {
      const pursuit = stickToward(state, pointAlong(line, progress.along + aimDistance(speed)), cfg.car);
      // Not yet pressed: press only once its line turns into the corner. A slide curves only that way, so a car heading for
      // the corner's inside edge (out of the corner before, say) is steered back on grip first.
      const pressed = state.input.drift === 1 && state.drift.phase !== 'none';
      if (!sliding && !pressed && dir * pursuit < 0) return { throttle: 1, steer: pursuit };
      if (!sliding || speed === 0) {
        // Press again if a press did not start a slide; steer on its line, but far enough into the corner to pick the side.
        const drift = !(state.input.drift === 1 && state.drift.phase === 'none');
        return { throttle: 1, drift, steer: dir * Math.max(cfg.car.drift.steerToStart + BOT.pickSide, dir * pursuit) };
      }
      // The circle through the car, along the way it travels, and through the point ahead: how much it curves into the corner.
      const point = pointAlong(line, progress.along + BOT.slideAim);
      const dx = point.x - state.position.x;
      const dz = point.z - state.position.z;
      const fx = state.velocity.x / speed;
      const fz = state.velocity.z / speed;
      const curve = ((2 * (-fz * dx + fx * dz)) / (dx * dx + dz * dz)) * dir;
      return { throttle: 1, drift: true, steer: stickForCurve(curve, dir, cfg.car) };
    }
    const point = pointAlong(line, progress.along + aimDistance(speed));
    // The car's own top speed for the step: raised while a boost runs, so the bot does not brake a boost away.
    // Having given up a slide, it brakes for every corner again.
    const target = Math.min(state.top, cornerLimit(line, progress.near, BOT.reach, cfg.car, options.margin, gaveUp ? undefined : skip));
    return { ...pedalsFor(speed, target, cfg), steer: stickToward(state, point, cfg.car) };
  };
}

/** How one lap went. */
export interface LapStats {
  /** How long it took, in steps and seconds. */
  steps: number;
  seconds: number;
  /** The lap's length over its time, in metres per second. */
  averageSpeed: number;
  /** The share of its steps with all four wheels on the road or a kerb. */
  roadShare: number;
  /** How long any wheel was on something else (grass, sand, rock or snow), in seconds. */
  offRoadSeconds: number;
}

/** How a run of laps went. */
export interface LapRun {
  /** The laps finished: the first from the start (step 0, 4 m behind the line), then flying laps from line to line. */
  laps: LapStats[];
  /** How many times the car was brought back to a checkpoint. */
  respawns: number;
  /** How many times the body met a wall or the gate, and a tree or a rock. */
  wallHits: number;
  otherHits: number;
  /** Every step's input, packed (`packInput`). */
  inputs: number[];
}

/** Whether a wheel is on the road or a kerb. */
const onRoad = (surface: string | null): boolean => surface === 'road' || surface === 'kerb';

/**
 * Drives laps of a world from its start line with a bot. A lap ends when the car passes the start line again having
 * passed every checkpoint (`progress.passed` reaches `k * n + 1`). Gives up after `BOT.lapLimit` seconds a lap.
 */
export function lapRun(rapier: Rapier, world: WorldResult, cfg: PhysicsConfig, bot: Bot, laps: number): LapRun {
  const { line } = world.track.candidates[world.track.winnerIndex]!;
  const n = checkpointCount(line, cfg.sim.progress);
  const perSecond = cfg.sim.stepsPerSecond;
  const limit = laps * BOT.lapLimit * perSecond;
  const sim = createSim(rapier, world, cfg);
  const done: LapStats[] = [];
  const inputs: number[] = [];
  let wallHits = 0;
  let otherHits = 0;
  let lapStart = 0;
  let roadSteps = 0;
  let offSteps = 0;
  let last: Hit = null;
  let state = sim.state();
  while (done.length < laps && state.step < limit) {
    const input = makeInput(bot(state));
    inputs.push(packInput(input));
    sim.step(input);
    state = sim.state();
    if (state.wheels.every((wheel) => wheel.touching && onRoad(wheel.surface))) roadSteps++;
    if (state.wheels.some((wheel) => wheel.touching && !onRoad(wheel.surface))) offSteps++;
    if (state.touch !== null && state.touch !== last) {
      if (state.touch === 'wall' || state.touch === 'gate') wallHits++;
      else otherHits++;
    }
    last = state.touch;
    if (state.progress!.passed >= (done.length + 1) * n + 1) {
      const steps = state.step - lapStart;
      const seconds = steps / perSecond;
      done.push({ steps, seconds, averageSpeed: line.length / seconds, roadShare: roadSteps / steps, offRoadSeconds: offSteps / perSecond });
      [lapStart, roadSteps, offSteps] = [state.step, 0, 0];
    }
  }
  const respawns = state.respawn.respawns;
  sim.free();
  return { laps: done, respawns, wallHits, otherHits, inputs };
}

/** A corner of one seed's lap, for the corner proof. */
export interface CornerPick {
  seed: number;
  world: WorldResult;
  corner: CornerSection;
}

/**
 * Three corners of a kind for the corner proof: its tightest, its middle and its widest by `minRadius`. If none of the
 * three is on a mountain seed, the middle one is swapped for the mountain seed's corner of that kind nearest it.
 */
export function pickCorners(all: readonly CornerPick[], kind: CornerSection['kind']): CornerPick[] {
  const list = all
    .filter((pick) => pick.corner.kind === kind)
    .sort((a, b) => a.corner.minRadius - b.corner.minRadius || a.seed - b.seed || a.corner.startIndex - b.corner.startIndex);
  if (list.length <= 3) return list;
  const picked = [list[0]!, list[Math.floor((list.length - 1) / 2)]!, list[list.length - 1]!];
  const mountain = (pick: CornerPick): boolean => pick.world.track.character.relief === 'mountain';
  if (!picked.some(mountain)) {
    const middle = picked[1]!.corner.minRadius;
    const near = list.filter(mountain).sort((a, b) => Math.abs(a.corner.minRadius - middle) - Math.abs(b.corner.minRadius - middle))[0];
    if (near) picked[1] = near;
  }
  return picked;
}

/** How one pass of a corner went (step 9b). */
export interface CornerPass {
  /** Whether the car reached `PASS.after` metres after the corner. */
  finished: boolean;
  /** From `PASS.before` metres before the corner to `PASS.after` after it, in seconds (Infinity if not finished). */
  time: number;
  /** The speed at the start and the end of that, in metres per second. */
  entrySpeed: number;
  exitSpeed: number;
  /** Over that stretch: the steps with any wheel on something but the road or a kerb, and what the body touched. */
  offRoadSteps: number;
  wallHits: number;
  otherHits: number;
  /** Whether the car was brought back to a checkpoint at any time. */
  respawned: boolean;
  /** Finished, every wheel on the road or a kerb, nothing touched, no respawn. */
  clean: boolean;
  /** Whether it slid, and the highest tier the slide reached. */
  slid: boolean;
  tier: 0 | 1 | 2 | 3;
}

/**
 * One pass of a corner by the bot (step 9b): the car is put at rest on the middle of the road `PASS.runUp` metres before
 * the corner and driven by the bot, sliding through this corner only (or none), and timed from `PASS.before` metres
 * before it to `PASS.after` after it by its place on the lap, between steps.
 */
export function passCorner(rapier: Rapier, world: WorldResult, corner: CornerSection, cfg: BotConfig, chosen: { slide?: boolean; margin?: number } = {}): CornerPass {
  const { line } = world.track.candidates[world.track.winnerIndex]!;
  const n = line.count;
  const lap = line.length;
  const perSecond = cfg.sim.stepsPerSecond;
  const startSample = corner.startIndex - Math.round(PASS.runUp / line.spacing);
  const origin = (((startSample % n) + n) % n) * line.spacing;
  const sim = createSimOn(rapier, { kind: 'island', world }, cfg, lapPose(world, startSample, cfg));
  const bot = createBot(world, cfg, { margin: chosen.margin ?? CORNER_SHARE, corners: chosen.slide ? [corner] : [] });
  // Metres on from where the car was put, a little below 0 if it starts just behind that sample.
  const travelled = (along: number): number => {
    const metres = ((((along - origin) % lap) + lap) % lap);
    return metres > lap / 2 ? metres - lap : metres;
  };
  const from = PASS.runUp - PASS.before;
  const to = PASS.runUp + corner.sampleCount * line.spacing + PASS.after;
  let state = sim.state();
  let was = travelled(state.progress!.along);
  let started = -1;
  let ended = -1;
  let entrySpeed = 0;
  let exitSpeed = 0;
  let offRoadSteps = 0;
  let wallHits = 0;
  let otherHits = 0;
  let last: Hit = null;
  let slid = false;
  let tier: 0 | 1 | 2 | 3 = 0;
  while (state.step < PASS.limit * perSecond) {
    sim.step(makeInput(bot(state)));
    state = sim.state();
    if (state.respawn.respawns > 0) break;
    const now = travelled(state.progress!.along);
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    if (state.drift.phase === 'slide') slid = true;
    tier = Math.max(tier, state.drift.tier) as 0 | 1 | 2 | 3;
    if (started < 0 && was < from && now >= from) {
      started = state.step - 1 + (from - was) / (now - was);
      entrySpeed = speed;
    }
    if (started >= 0) {
      if (state.wheels.some((wheel) => wheel.touching && !onRoad(wheel.surface))) offRoadSteps++;
      if (state.touch !== null && state.touch !== last) {
        if (state.touch === 'wall' || state.touch === 'gate') wallHits++;
        else otherHits++;
      }
      if (was < to && now >= to) {
        ended = state.step - 1 + (to - was) / (now - was);
        exitSpeed = speed;
        break;
      }
    }
    last = state.touch;
    was = now;
  }
  const respawned = state.respawn.respawns > 0;
  sim.free();
  const finished = started >= 0 && ended >= 0;
  return {
    finished,
    time: finished ? (ended - started) / perSecond : Infinity,
    entrySpeed,
    exitSpeed,
    offRoadSteps,
    wallHits,
    otherHits,
    respawned,
    clean: finished && !respawned && offRoadSteps === 0 && wallHits === 0 && otherHits === 0,
    slid,
    tier,
  };
}

/**
 * The best pass of a corner, with a slide through it or without (step 9b): the bot cornering on grip at each of
 * `PASS.margins` of the steering's grip, the quickest clean pass (null if none is clean). The margin is the same choice
 * for both, since the 120 m after the corner can hold another corner that neither slides through.
 */
export function bestPass(rapier: Rapier, world: WorldResult, corner: CornerSection, cfg: BotConfig, slide: boolean): (CornerPass & { margin: number }) | null {
  let best: (CornerPass & { margin: number }) | null = null;
  for (const margin of PASS.margins) {
    const pass = passCorner(rapier, world, corner, cfg, { slide, margin });
    if (pass.clean && (best === null || pass.time < best.time)) best = { ...pass, margin };
  }
  return best;
}
