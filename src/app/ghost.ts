import { PLACE_SIZE, type RunRecord } from '../sim/record';
import { blendPlace, type Place } from './drive';
import type { RaceState } from '../sim/race';
import { formatGap, formatRaceTime } from './raceCard';

/**
 * The ghost (M5): where a run on record had its car at a moment of a race,
 * read by the race's own step count and never by the clock, so a ghost and the
 * car it races start together on "go" whatever the frame rate.
 */

/** The kept place `k` of a record. */
function placeOf(record: RunRecord, k: number): Place {
  const p = record.places;
  const at = k * PLACE_SIZE;
  return {
    position: { x: p[at]!, y: p[at + 1]!, z: p[at + 2]! },
    rotation: { x: p[at + 3]!, y: p[at + 4]!, z: p[at + 5]!, w: p[at + 6]! },
  };
}

/**
 * Where the ghost is `moment` steps into its run (a whole number, or between two steps as the car is drawn): blended
 * between the two kept places either side, exact at a multiple of `every`. Null before step 0 and past the last place
 * kept, where the ghost is no longer drawn.
 */
export function ghostPlace(record: RunRecord, moment: number): Place | null {
  const count = record.places.length / PLACE_SIZE;
  if (count === 0 || moment < 0) return null;
  const at = moment / record.every;
  const k = Math.floor(at);
  if (k > count - 1 || (k === count - 1 && at > k)) return null;
  const t = at - k;
  return t === 0 ? placeOf(record, k) : blendPlace(placeOf(record, k), placeOf(record, k + 1), t);
}

/** The ghost drawn in a race: whose run it is, and whether it is from an older version of the handling. */
export interface ChosenGhost {
  record: RunRecord;
  driver: 'player' | 'bot';
  /** Driven with other handling (`hashHandling`): drawn, but not the time to beat. */
  older: boolean;
}

/**
 * Which ghost a race is run against (Tane, M5.0: the bot until the player beats it). The player's own, if it was
 * driven with today's handling and is faster in total than the bot's; otherwise the bot's; otherwise the player's own
 * from an older version, marked so. A bot's race of other handling is never drawn: it is worked out again.
 *
 * @param today the handling's fingerprint now (`hashHandling(config)`)
 */
export function chooseGhost(own: RunRecord | null, bot: RunRecord | null, today: string): ChosenGhost | null {
  const botNow = bot && bot.handling === today ? bot : null;
  const ownNow = own && own.handling === today ? own : null;
  if (ownNow && (!botNow || ownNow.total < botNow.total)) return { record: ownNow, driver: 'player', older: false };
  if (botNow) return { record: botNow, driver: 'bot', older: false };
  if (own) return { record: own, driver: 'player', older: true };
  return null;
}

/**
 * The split against the ghost (M5.4b): this race's time to the end of the last sector it has done against the ghost's
 * time to the end of the same sector, from its saved splits, in steps; less than 0 is ahead. Nothing before the first
 * sector is done, or past the sectors the ghost has.
 */
export function ghostGap(race: RaceState, record: RunRecord): number | null {
  const done = race.splits.length;
  if (done === 0 || record.splits.length < done) return null;
  let gap = 0;
  for (let k = 0; k < done; k++) gap += race.splits[k]! - record.splits[k]!;
  return gap;
}

/** The race card's row for the ghost: whose it is, or that it is hidden, and the split against it. */
export interface GhostRow {
  label: string;
  /** The gap at the last sector done (`formatGap`), or null: none yet, or against an older version's ghost. */
  gap: string | null;
  /** Ahead of the ghost: the gap in the teal accent. */
  ahead: boolean;
}

/**
 * The race card's ghost row: none without a ghost. The gap shows with the ghost hidden too, and never against a ghost
 * from an older version, which is not the time to beat.
 *
 * @param gap the split against the ghost (`ghostGap`), in steps
 */
export function ghostRow(chosen: ChosenGhost | null, shown: boolean, gap: number | null, stepsPerSecond: number): GhostRow | null {
  if (!chosen) return null;
  const label = !shown ? 'Ghost hidden (G)' : chosen.driver === 'bot' ? "Bot's ghost" : chosen.older ? 'Your ghost · older version' : 'Your ghost';
  if (chosen.older || gap === null) return { label, gap: null, ahead: false };
  return { label, gap: formatGap(gap, stepsPerSecond), ahead: gap < 0 };
}

/** What is known at the finish of a race for deciding whether it is saved (M5.4a). */
export interface SaveContext {
  /** Whether the tuning panel changed anything during the race, or it started with tuned handling. */
  tuned: boolean;
  /** Whether the store keeps what is written through a reload (`Store.kept`). */
  kept: boolean;
  /** The player's best kept for this island, and the bot's race of today's handling, if any. */
  own: RunRecord | null;
  bot: RunRecord | null;
  /** The handling's fingerprint now (`hashHandling(config)`). */
  today: string;
}

/**
 * Whether a finished race is saved as the player's best, and the line the results card says about it. Saved when the
 * car was not tuned and it is faster in total than the player's best of today's handling (or there is none, or only an
 * older version's). A best is kept even when the bot is still faster (the bot stays the ghost until it is beaten). In a
 * browser that keeps no data it is still kept for the page, and the line says it is not saved.
 *
 * @param total the race's total, in steps
 */
export function saveVerdict(total: number, ctx: SaveContext, stepsPerSecond: number): { save: boolean; line: string } {
  if (ctx.tuned) return { save: false, line: 'Not saved: the car was tuned' };
  const own = ctx.own && ctx.own.handling === ctx.today ? ctx.own : null;
  if (own && total >= own.total) return { save: false, line: `Not saved: slower than your best ${formatRaceTime(own.total, stepsPerSecond)}` };
  if (!ctx.kept) return { save: true, line: 'Not saved: this browser keeps no data' };
  const bot = ctx.bot && ctx.bot.handling === ctx.today ? ctx.bot : null;
  if (bot && total >= bot.total) return { save: true, line: `New best. The bot's ${formatRaceTime(bot.total, stepsPerSecond)} is still the ghost to beat` };
  // The bot was the ghost until now unless the player's best had already beaten it.
  if (bot && !(own && own.total < bot.total)) return { save: true, line: "New best: your ghost replaces the bot's" };
  return { save: true, line: 'New best, ghost saved' };
}
