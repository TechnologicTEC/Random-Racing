/**
 * Test helper: the bot's lap statistics and the corner proof (step 9). The bot
 * itself, and its race, moved into the game in M5.3b (`src/sim/bot/bot.ts`);
 * they are exported from here too, so tests keep their imports.
 */
import type { PhysicsConfig } from '../config';
import type { CornerSection, WorldResult } from '../gen/types';
import type { Hit } from '../sim/car/drift';
import { makeInput, packInput } from '../sim/input';
import type { Rapier } from '../sim/physics/rapier';
import { createSim, createSimOn } from '../sim/sim';
import { checkpointCount } from '../sim/track/progress';
import { BOT, createBot, type Bot, type BotConfig } from '../sim/bot/bot';
import { lapPose } from './cornerDriver';
import { runUp } from './simDriving';

export * from '../sim/bot/bot';
import { CORNER_SHARE } from '../sim/bot/lineDriver';
export { enterWhole } from '../sim/bot/lineDriver';

/** The corner proof's pass (step 9b): the car is put this far before the corner, and timed from `before` metres before it to `after` metres after it. */
export const PASS = { runUp: 250, before: 40, after: 120, limit: 90, margins: [0.9, 1, 1.1] as readonly number[] };

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
  // `PASS.runUp`, or as far as 99% of top speed takes and a fifth more (step 10a).
  const runUpMetres = Math.max(PASS.runUp, 1.2 * runUp(cfg.car, 0.99).metres);
  const startSample = corner.startIndex - Math.round(runUpMetres / line.spacing);
  const origin = (((startSample % n) + n) % n) * line.spacing;
  const sim = createSimOn(rapier, { kind: 'island', world }, cfg, lapPose(world, startSample, cfg));
  const bot = createBot(world, cfg, { margin: chosen.margin ?? CORNER_SHARE, corners: chosen.slide ? [corner] : [] });
  // Metres on from where the car was put, a little below 0 if it starts just behind that sample.
  const travelled = (along: number): number => {
    const metres = ((((along - origin) % lap) + lap) % lap);
    return metres > lap / 2 ? metres - lap : metres;
  };
  const from = runUpMetres - PASS.before;
  const to = runUpMetres + corner.sampleCount * line.spacing + PASS.after;
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
