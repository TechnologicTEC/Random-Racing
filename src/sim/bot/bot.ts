/**
 * The bot (step 9): it drives laps of a real island. Test code until M5.3b,
 * when it moved into the game: its race is the ghost to beat until the player
 * beats it (Tane, M5.0). Its lap statistics and the corner proof stay in
 * `src/testing/botDriver.ts`.
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
import type { CarConfig, GameConfig, PhysicsConfig } from '../../config';
import type { CenterLine, CornerSection, Section, WorldResult } from '../../gen/types';
import { makeInput, packInput, type RawInput } from '../input';
import type { Rapier } from '../physics/rapier';
import { raceSteps, type RaceState } from '../race';
import { hashHandling, recordRun, type RunRecord } from '../record';
import { createSim, type CarState } from '../sim';
import { checkpointCount } from '../track/progress';
import { cornerLimit, CORNER_SHARE, enterWhole, reachFor, stickToward, type MapPoint } from './lineDriver';

/**
 * The bot's own numbers: how it drives, not how the car handles, so they are not in the config. Changing one changes
 * the bot's race on every seed, its ghost and the Milestone 3 proofs that use it.
 */
export const BOT = {
  /** How far ahead it looks for corners to brake for, in metres: further for a faster car (`reachFor`, step 10a). */
  reach: 80,
  /** It aims this far ahead on the centre line, in metres, plus `aimPerSpeed` seconds of travel. */
  aimBase: 6,
  aimPerSpeed: 0.5,
  /** Within this many metres per second of its target speed it holds it; further over it brakes, under it presses right down. */
  band: 0.5,
  /** Braking by how far over the target, in metres per second, for each whole press of the brake. */
  brakePer: 2,
  /** In a slide it brakes at most this share of the brake that cancels a slide (10a-4). */
  slideBrake: 0.9,
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
export function targetSpeed(line: CenterLine, from: number, cfg: PhysicsConfig, margin = CORNER_SHARE, skip?: (sample: number) => boolean, slideGrip?: number): number {
  return Math.min(cfg.car.engine.topSpeed, cornerLimit(line, from, reachFor(cfg.car, BOT.reach), cfg.car, margin, skip, slideGrip));
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

/**
 * Which samples a sliding bot counts at the slide's grip when it brakes for what is coming (10a-4): those of its slide
 * corners it has not yet reached. The corner it is in, having let go before its end, is driven on grip, and is braked
 * for on grip.
 *
 * @param along where the car is on the lap, in metres
 */
export function aheadOnly(corners: readonly Pick<CornerSection, 'startIndex' | 'sampleCount'>[], line: CenterLine, along: number): (sample: number) => boolean {
  const n = line.count;
  const lap = line.length;
  const cornerOf = new Int32Array(n).fill(-1);
  for (const [c, corner] of corners.entries()) for (let k = corner.startIndex; k < corner.startIndex + corner.sampleCount; k++) cornerOf[((k % n) + n) % n] = c;
  const inside = corners.map((corner) => ((((along - corner.startIndex * line.spacing) % lap) + lap) % lap) < corner.sampleCount * line.spacing);
  return (sample) => {
    const c = cornerOf[((sample % n) + n) % n]!;
    return c >= 0 && !inside[c];
  };
}

/** A bot for a world (see the file's comment). */
export function createBot(world: WorldResult, cfg: BotConfig, chosen: Partial<BotOptions> = {}): Bot {
  const options: BotOptions = { margin: CORNER_SHARE, slide: false, ...chosen };
  const { line, sections } = world.track.candidates[world.track.winnerIndex]!;
  const n = line.count;
  const ds = line.spacing;
  const lap = line.length;
  const reach = reachFor(cfg.car, BOT.reach);
  const corners = options.corners ?? (options.slide ? slideCorners(sections, cfg) : []);
  /** The line for braking: its slide corners at their tightest (10a-4). */
  const braking = corners.length > 0 ? enterWhole(line, corners) : line;
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
      // In the slide it holds what the slide holds through the rest of the corner, at its tightest (10a-4: at 53 m/s the
      // throttle alone took the car past it), easing off and braking lightly, never far enough to cancel the slide.
      const slideTarget = Math.min(state.top, cornerLimit(braking, progress.near, reach, cfg.car, options.margin, () => true, cfg.car.drift.grip));
      const pedals = pedalsFor(speed, slideTarget, cfg);
      const held = 'brake' in pedals ? { brake: Math.min(pedals.brake, cfg.car.drift.brakeCancel * BOT.slideBrake) } : pedals;
      return { ...held, drift: true, steer: stickForCurve(curve, dir, cfg.car) };
    }
    const point = pointAlong(line, progress.along + aimDistance(speed));
    // The car's own top speed for the step: raised while a boost runs, so the bot does not brake a boost away.
    // Having given up a slide, it brakes for every corner again.
    // A corner it slides through is braked for to what the slide's grip holds there (10a-4).
    // Only for a corner still ahead: the one it has just let go in is braked for on grip.
    const ahead = skip && !gaveUp ? aheadOnly(corners, line, progress.along) : undefined;
    const target = Math.min(state.top, cornerLimit(ahead ? braking : line, progress.near, reach, cfg.car, options.margin, ahead, cfg.car.drift.grip));
    return { ...pedalsFor(speed, target, cfg), steer: stickToward(state, point, cfg.car) };
  };
}
/** How a race went (M4.2c). */
export interface RaceRun {
  /** The race as it ended: finished, unless the bot ran out of time. */
  race: RaceState;
  /**
   * The steps since "go" on which the car passed the start line with every checkpoint of a lap behind it, as step 8a
   * counts them (`progress.passed` reaching `k * n + 1`): the race places each lap's end inside that step.
   */
  lineSteps: number[];
  /** How many times the car was brought back to a checkpoint. */
  respawns: number;
  /** Every step's input, packed (`packInput`), from the first step of the countdown to the finish. */
  inputs: number[];
  /** The simulation's fingerprint at the finish. */
  hash: string;
}

/**
 * Races a world with a bot (M4.2c): a simulation with a race, the bot asked what to press from the first step of the
 * countdown (it is held until "go") to the step the race is finished. Gives up after `BOT.lapLimit` seconds a lap.
 */
export function raceRun(rapier: Rapier, world: WorldResult, cfg: PhysicsConfig, bot: Bot): RaceRun {
  const { line } = world.track.candidates[world.track.winnerIndex]!;
  const n = checkpointCount(line, cfg.sim.progress);
  const countdown = raceSteps(cfg.sim.race, cfg.sim.stepsPerSecond).countdown;
  const limit = countdown + cfg.sim.race.laps * BOT.lapLimit * cfg.sim.stepsPerSecond;
  const sim = createSim(rapier, world, cfg, { race: true });
  const inputs: number[] = [];
  const lineSteps: number[] = [];
  let state = sim.state();
  while (state.race!.phase !== 'finished' && state.step < limit) {
    const input = makeInput(bot(state));
    inputs.push(packInput(input));
    sim.step(input);
    state = sim.state();
    if (state.progress!.passed >= (lineSteps.length + 1) * n + 1) lineSteps.push(state.step - countdown);
  }
  const run = { race: state.race!, lineSteps, respawns: state.respawn.respawns, inputs, hash: sim.hash() };
  sim.free();
  return run;
}

/**
 * The bot's race of a world as a run on record (M5.3b): its ghost, driven from the first step of the countdown to the
 * finish with the handling given. Null if it does not finish within `lapLimit` seconds a lap.
 */
export function botRecord(rapier: Rapier, world: WorldResult, cfg: BotConfig & Pick<GameConfig, 'ghost'>, lapLimit = BOT.lapLimit): RunRecord | null {
  const countdown = raceSteps(cfg.sim.race, cfg.sim.stepsPerSecond).countdown;
  const limit = countdown + cfg.sim.race.laps * lapLimit * cfg.sim.stepsPerSecond;
  const bot = createBot(world, cfg);
  const sim = recordRun(createSim(rapier, world, cfg, { race: true }), {
    seed: world.seed,
    generator: world.generatorVersion,
    driver: 'bot',
    every: cfg.ghost.every,
    handling: hashHandling(cfg),
  });
  try {
    let state = sim.state();
    while (state.race!.phase !== 'finished' && state.step < limit) {
      sim.step(makeInput(bot(state)));
      state = sim.state();
    }
    return state.race!.phase === 'finished' ? sim.record() : null;
  } finally {
    sim.free();
  }
}
