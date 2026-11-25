import { describe, expect, it } from 'vitest';
import type { RunRecord } from '../sim/record';
import { bestWrite, dayOf, isStarred, newestFirst, ownBest, starWrite, writeStar, type Island } from './favourites';
import { memoryStore, type Favourite } from './store';

const SEVEN: Island = { seed: 7, generator: 0, name: 'Halmore Speedway' };
const FORTY_TWO: Island = { seed: 42, generator: 0, name: 'Brenmoor Ring' };
const ONE: Island = { seed: 1, generator: 0, name: 'Ashby Loop' };
const TODAY = 'handling-today';

/** A record with only what the favourites read: whose race it is, its handling and its total. */
const ghost = (driver: 'player' | 'bot', handling: string, total: number): RunRecord => ({ driver, handling, total }) as RunRecord;

/** Stars an island in a store the way the page does, and gives the list the card shows. */
async function star(store: ReturnType<typeof memoryStore>, island: Island, best: number | null, date: string): Promise<Favourite[]> {
  await writeStar(store, starWrite(await store.listFavourites(), island, best, date));
  return newestFirst(await store.listFavourites());
}

describe('the star (M5.5)', () => {
  it('saves the seed, its version, the name, the best time and the day', () => {
    expect(starWrite([], SEVEN, 9977.25, '2026-11-25')).toEqual({
      remove: 7,
      put: { seed: 7, generator: 0, name: 'Halmore Speedway', best: 9977.25, date: '2026-11-25' },
    });
    expect(starWrite([], FORTY_TWO, null, '2026-11-25').put?.best).toBeNull();
  });

  it('takes the star off an island that is already a favourite', async () => {
    const store = memoryStore();
    await star(store, SEVEN, null, '2026-11-25');
    expect(isStarred(await store.listFavourites(), SEVEN)).toBe(true);
    expect(starWrite(await store.listFavourites(), SEVEN, null, '2026-11-25')).toEqual({ remove: 7, put: null });
    expect(await star(store, SEVEN, null, '2026-11-25')).toEqual([]);
    expect(isStarred(await store.listFavourites(), SEVEN)).toBe(false);
  });

  it('keeps one favourite a seed: a star on the island of another version replaces the old one', async () => {
    const store = memoryStore();
    await star(store, SEVEN, 9977.25, '2026-11-24');
    const later = { ...SEVEN, generator: 1, name: 'Corran Ring' };
    expect(isStarred(await store.listFavourites(), later)).toBe(false);
    expect(await star(store, later, null, '2026-11-25')).toEqual([{ seed: 7, generator: 1, name: 'Corran Ring', best: null, date: '2026-11-25' }]);
  });

  it('lists the newest first', async () => {
    const store = memoryStore();
    await star(store, SEVEN, null, '2026-11-24');
    await star(store, FORTY_TWO, null, '2026-11-24');
    expect((await star(store, ONE, null, '2026-11-25')).map((f) => f.seed)).toEqual([1, 42, 7]);
    // Starred again under a new version, seed 7 is the newest.
    expect((await star(store, { ...SEVEN, generator: 1 }, null, '2026-11-25')).map((f) => f.seed)).toEqual([7, 1, 42]);
  });

  it('writes the day it was saved as the local date', () => {
    expect(dayOf(new Date(2026, 10, 5, 23, 30))).toBe('2026-11-05');
    expect(dayOf(new Date(2027, 0, 31, 0, 5))).toBe('2027-01-31');
  });
});

describe('the best time of a favourite', () => {
  it('comes from the player’s stored ghost of today’s handling', () => {
    expect(ownBest(ghost('player', TODAY, 9977.25), TODAY)).toBe(9977.25);
    expect(ownBest(null, TODAY)).toBeNull();
    // An older version's ghost is not a best of today's car, and the bot's race is not the player's.
    expect(ownBest(ghost('player', 'handling-before', 9000), TODAY)).toBeNull();
    expect(ownBest(ghost('bot', TODAY, 9000), TODAY)).toBeNull();
  });

  it('rises when a new best is saved, keeping its place in the list', async () => {
    const store = memoryStore();
    await star(store, SEVEN, 9977.25, '2026-11-24');
    await star(store, FORTY_TWO, null, '2026-11-24');
    const list = await store.listFavourites();
    expect(bestWrite(list, 7, 0, 9500)).toEqual({ seed: 7, generator: 0, name: 'Halmore Speedway', best: 9500, date: '2026-11-24' });
    expect(bestWrite(list, 42, 0, 10200)?.best).toBe(10200);
    await store.putFavourite(bestWrite(list, 7, 0, 9500)!);
    expect(newestFirst(await store.listFavourites()).map((f) => [f.seed, f.best])).toEqual([
      [42, null],
      [7, 9500],
    ]);
  });

  it('is left alone for an island that is not a favourite, one of another version, or the same time', async () => {
    const list: Favourite[] = [{ seed: 7, generator: 0, name: 'Halmore Speedway', best: 9500, date: '2026-11-24' }];
    expect(bestWrite(list, 42, 0, 9000)).toBeNull();
    expect(bestWrite(list, 7, 1, 9000)).toBeNull();
    expect(bestWrite(list, 7, 0, 9500)).toBeNull();
  });
});
