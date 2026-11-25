import { describe, expect, it } from 'vitest';
import type { RunRecord } from '../sim/record';
import { bestWrite, cardChoices, dayOf, favouriteRow, isStarred, newestFirst, ownBest, rowWindow, starWrite, versionNote, writeStar, type Island } from './favourites';
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

describe('the favourites card (M5.5b)', () => {
  const SPS = 60;
  it('gives each row the name, share code, best time and day', () => {
    expect(favouriteRow({ seed: 7, generator: 0, name: 'Halmore Speedway', best: 8374.5, date: '2026-11-25' }, SPS)).toEqual({
      name: 'Halmore Speedway',
      code: 'v0-7',
      best: '2:19.575',
      date: '25 Nov 2026',
    });
    expect(favouriteRow({ seed: 42, generator: 0, name: 'Brenmoor Ring', best: null, date: '2027-01-03' }, SPS)).toEqual({
      name: 'Brenmoor Ring',
      code: 'v0-42',
      best: 'No time yet',
      date: '3 Jan 2027',
    });
  });

  it('notes under the list that islands saved before version 1 may change', () => {
    const v0: Favourite = { seed: 7, generator: 0, name: 'Halmore Speedway', best: null, date: '2026-11-25' };
    expect(versionNote([v0])).toBe('Saved before version 1: these islands may change when the game is updated');
    expect(versionNote([{ ...v0, generator: 1 }])).toBeNull();
    expect(versionNote([])).toBeNull();
  });

  it('shows the rows up to 8 at a time, moving with the choice', () => {
    expect(rowWindow(5, 0, 8)).toEqual({ from: 0, to: 5 });
    expect(rowWindow(12, 0, 8)).toEqual({ from: 0, to: 8 });
    expect(rowWindow(12, 7, 8)).toEqual({ from: 0, to: 8 });
    expect(rowWindow(12, 8, 8)).toEqual({ from: 1, to: 9 });
    expect(rowWindow(12, 11, 8)).toEqual({ from: 4, to: 12 });
    // Coming back up, the window keeps where it was until the choice reaches its top.
    expect(rowWindow(12, 6, 8, 4)).toEqual({ from: 4, to: 12 });
    expect(rowWindow(12, 3, 8, 4)).toEqual({ from: 3, to: 11 });
    // A choice off the rows (the Back button) keeps the window too.
    expect(rowWindow(12, 12, 8, 4)).toEqual({ from: 4, to: 12 });
    expect(rowWindow(0, 0, 8)).toEqual({ from: 0, to: 0 });
  });
});

describe('the choices on the favourites card (M5.5c)', () => {
  const seven: Favourite = { seed: 7, generator: 0, name: 'Halmore Speedway', best: null, date: '2026-11-24' };
  const fortyTwo: Favourite = { seed: 42, generator: 0, name: 'Brenmoor Ring', best: null, date: '2026-11-25' };

  it('offers to add the island shown first, then the favourites newest first, then Back', () => {
    expect(cardChoices([seven, fortyTwo], ONE)).toEqual([
      { kind: 'add', island: ONE },
      { kind: 'row', favourite: fortyTwo, row: 0 },
      { kind: 'row', favourite: seven, row: 1 },
      { kind: 'back' },
    ]);
  });

  it('offers no add when the island shown is already a favourite, or none is shown', () => {
    expect(cardChoices([seven], SEVEN)).toEqual([{ kind: 'row', favourite: seven, row: 0 }, { kind: 'back' }]);
    expect(cardChoices([], null)).toEqual([{ kind: 'back' }]);
    expect(cardChoices([], SEVEN)).toEqual([{ kind: 'add', island: SEVEN }, { kind: 'back' }]);
  });
});
