import { describe, expect, it } from 'vitest';
import { ghostKey, guardedStore, memoryStore, storageFavourites, type Favourite, type FavouriteShelf, type GhostShelf } from './store';

const SEVEN: Favourite = { seed: 7, generator: 0, name: 'Halmore Speedway', best: 9977.25, date: '2026-11-24' };
const FORTY_TWO: Favourite = { seed: 42, generator: 0, name: 'Brenmoor Ring', best: null, date: '2026-11-23' };

/** A stand-in for `localStorage`: the same two calls, over a map that outlives the shelves made on it, as storage outlives a page. */
function fakeStorage(): Pick<Storage, 'getItem' | 'setItem'> & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return { items, getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) };
}

describe('ghost keys', () => {
  it("are the share code, with bot2: in front for the bot's race (2: the bot that drifts; bot: was the bot on grip)", () => {
    expect(ghostKey(7, 0, 'player')).toBe('v0-7');
    expect(ghostKey(48213, 1, 'bot')).toBe('bot2:v1-48213');
  });
});

describe('the memory store', () => {
  it('keeps a ghost and gives back the same bytes, but not the same array', async () => {
    const store = memoryStore();
    expect(store.kept).toBe(false);
    expect(await store.getGhost('v0-7')).toBeNull();
    const bytes = Uint8Array.from([1, 2, 3, 250]);
    await store.putGhost('v0-7', bytes);
    bytes[0] = 99;
    const back = await store.getGhost('v0-7');
    expect([...back!]).toEqual([1, 2, 3, 250]);
    back![1] = 77;
    expect([...(await store.getGhost('v0-7'))!]).toEqual([1, 2, 3, 250]);
    expect(await store.getGhost('bot:v0-7')).toBeNull();
  });

  it('lists favourites, one a seed, and removes them', async () => {
    const store = memoryStore();
    expect(await store.listFavourites()).toEqual([]);
    await store.putFavourite(SEVEN);
    await store.putFavourite(FORTY_TWO);
    await store.putFavourite({ ...SEVEN, best: 9000 });
    expect(await store.listFavourites()).toEqual([{ ...SEVEN, best: 9000 }, FORTY_TWO]);
    await store.removeFavourite(7);
    expect(await store.listFavourites()).toEqual([FORTY_TWO]);
    await store.removeFavourite(1234);
    expect(await store.listFavourites()).toEqual([FORTY_TWO]);
  });
});

describe('favourites in storage (storageFavourites)', () => {
  it('writes them as JSON that a shelf made later on the same storage reads back, as after a reload', async () => {
    const storage = fakeStorage();
    const shelf = storageFavourites(storage);
    await shelf.put(SEVEN);
    await shelf.put(FORTY_TWO);
    expect([...storage.items.keys()]).toEqual(['seedCircuit.favourites']);
    expect(await storageFavourites(storage).list()).toEqual([SEVEN, FORTY_TWO]);
    await storageFavourites(storage).remove(7);
    expect(await storageFavourites(storage).list()).toEqual([FORTY_TWO]);
  });

  it('reads nothing from text that is not a list of favourites, and drops entries that are not one', async () => {
    const storage = fakeStorage();
    storage.items.set('seedCircuit.favourites', '{not json');
    expect(await storageFavourites(storage).list()).toEqual([]);
    storage.items.set('seedCircuit.favourites', JSON.stringify({ seed: 7 }));
    expect(await storageFavourites(storage).list()).toEqual([]);
    storage.items.set('seedCircuit.favourites', JSON.stringify([SEVEN, { seed: 'x' }, null, { ...FORTY_TWO, best: 'fast' }, FORTY_TWO]));
    expect(await storageFavourites(storage).list()).toEqual([SEVEN, FORTY_TWO]);
  });
});

describe('a guarded store (guardedStore)', () => {
  /** Shelves that refuse everything, one by throwing at once and one by a refused promise. */
  const throwingGhosts: GhostShelf = {
    get: () => {
      throw new Error('blocked');
    },
    put: () => Promise.reject(new Error('quota')),
  };
  const throwingFavourites: FavouriteShelf = {
    list: () => Promise.reject(new Error('blocked')),
    put: () => {
      throw new Error('blocked');
    },
    remove: () => Promise.reject(new Error('blocked')),
  };

  it('is kept while both shelves work', async () => {
    const memory = memoryStore();
    const store = guardedStore(
      { get: (key) => memory.getGhost(key), put: (key, bytes) => memory.putGhost(key, bytes) },
      { list: () => memory.listFavourites(), put: (f) => memory.putFavourite(f), remove: (seed) => memory.removeFavourite(seed) },
    );
    expect(store.kept).toBe(true);
    await store.putGhost('v0-7', Uint8Array.from([5]));
    expect([...(await store.getGhost('v0-7'))!]).toEqual([5]);
    expect(store.kept).toBe(true);
  });

  it('turns a shelf that refuses into memory, never throwing, and says it is no longer kept, once', async () => {
    let refusals = 0;
    const store = guardedStore(throwingGhosts, throwingFavourites, () => refusals++);
    expect(store.kept).toBe(true);
    expect(await store.getGhost('v0-7')).toBeNull();
    expect(store.kept).toBe(false);
    await store.putGhost('v0-7', Uint8Array.from([9, 8]));
    expect([...(await store.getGhost('v0-7'))!]).toEqual([9, 8]);
    await store.putFavourite(SEVEN);
    expect(await store.listFavourites()).toEqual([SEVEN]);
    await store.removeFavourite(7);
    expect(await store.listFavourites()).toEqual([]);
    expect(refusals).toBe(1);
  });

  it('is in memory from the start for a shelf the browser would not open', async () => {
    let refusals = 0;
    const store = guardedStore(null, null, () => refusals++);
    expect(store.kept).toBe(false);
    await store.putFavourite(FORTY_TWO);
    expect(await store.listFavourites()).toEqual([FORTY_TWO]);
    expect(refusals).toBe(0);
  });
});
