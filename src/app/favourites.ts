import type { RunRecord } from '../sim/record';
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
