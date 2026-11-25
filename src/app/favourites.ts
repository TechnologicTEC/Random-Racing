import { formatSeedCode } from '../core/seedCode';
import type { RunRecord } from '../sim/record';
import { formatRaceTime } from './raceCard';
import type { Favourite, Store } from './store';

/**
 * Favourites (M5.5), pure: what the star on the pause and results cards writes, the order the favourites' card lists
 * them in, and their best times. A favourite is one a seed; the store keeps them in the order they were saved, a new
 * one at the end, so the newest is last there and first on the card.
 */

/** The island shown, as a favourite names it. */
export interface Island {
  seed: number;
  /** The generator version it was made with. */
  generator: number;
  /** The track's name. */
  name: string;
}

/** What a press of the star writes: the seed's favourite taken out, then this one put in at the end, if any. */
export interface StarWrite {
  remove: number;
  put: Favourite | null;
}

/** Whether the island is a favourite: one of its seed saved under its generator version. */
export function isStarred(list: readonly Favourite[], island: Island): boolean {
  return list.some((f) => f.seed === island.seed && f.generator === island.generator);
}

/**
 * The star pressed on an island: a favourite already takes it off; otherwise it is saved, in place of any of the same
 * seed from another version, as the newest.
 *
 * @param best the player's best total on the island, in steps (`ownBest`), or null
 * @param date the day, as `dayOf` writes it
 */
export function starWrite(list: readonly Favourite[], island: Island, best: number | null, date: string): StarWrite {
  if (isStarred(list, island)) return { remove: island.seed, put: null };
  return { remove: island.seed, put: { seed: island.seed, generator: island.generator, name: island.name, best, date } };
}

/** Writes a press of the star to the store: the old favourite out, the new one in at the end. */
export async function writeStar(store: Pick<Store, 'removeFavourite' | 'putFavourite'>, write: StarWrite): Promise<void> {
  await store.removeFavourite(write.remove);
  if (write.put) await store.putFavourite(write.put);
}

/** The favourites as the card lists them, the newest first. */
export function newestFirst(list: readonly Favourite[]): Favourite[] {
  return [...list].reverse();
}

/** The player's best on an island: the total of their stored ghost if it was driven with today's handling, else null. */
export function ownBest(own: RunRecord | null, today: string): number | null {
  return own && own.driver === 'player' && own.handling === today ? own.total : null;
}

/**
 * A new best saved on an island: its favourite with that time as its best, to put back in its place, or null when the
 * island is no favourite (of this version) or the time is already its best.
 *
 * @param total the saved race's total, in steps
 */
export function bestWrite(list: readonly Favourite[], seed: number, generator: number, total: number): Favourite | null {
  const favourite = list.find((f) => f.seed === seed && f.generator === generator);
  if (!favourite || favourite.best === total) return null;
  return { ...favourite, best: total };
}

/** A day as `2026-11-25`, by the local calendar. */
export function dayOf(date: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** A favourite as a row of the Favourites card says it (M5.5b). */
export interface FavouriteRow {
  name: string;
  /** Its share code, as `v0-7`. */
  code: string;
  /** Its best time, or "No time yet". */
  best: string;
  /** The day it was saved, as `25 Nov 2026`. */
  date: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function favouriteRow(favourite: Favourite, stepsPerSecond: number): FavouriteRow {
  const [year, month, day] = favourite.date.split('-').map(Number);
  return {
    name: favourite.name,
    code: formatSeedCode(favourite.seed, favourite.generator),
    best: favourite.best === null ? 'No time yet' : formatRaceTime(favourite.best, stepsPerSecond),
    date: `${day} ${MONTHS[(month ?? 1) - 1] ?? ''} ${year}`,
  };
}

/**
 * The line under the list while any favourite was saved before generator version 1 (Tane, M5.0: such an island may
 * not be rebuilt the same once the generator changes), or null.
 */
export function versionNote(list: readonly Favourite[]): string | null {
  return list.some((f) => f.generator < 1) ? 'Saved before version 1: these islands may change when the game is updated' : null;
}

/**
 * The rows the card shows, at most `size` (8) of `count`: the window keeps where it was (`from`) while the choice is
 * inside it, and moves just enough to hold it when it is not. A choice past the rows (the Back button) moves nothing.
 */
export function rowWindow(count: number, chosen: number, size: number, from = 0): { from: number; to: number } {
  let start = from;
  if (chosen < count) {
    if (chosen < start) start = chosen;
    if (chosen >= start + size) start = chosen - size + 1;
  }
  start = Math.max(0, Math.min(start, count - size));
  return { from: start, to: Math.min(count, start + size) };
}
