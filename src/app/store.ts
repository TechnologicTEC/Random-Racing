import { formatSeedCode } from '../core/seedCode';
import type { Driver } from '../sim/record';

/**
 * Where the page keeps ghosts and favourites (M5.2): ghosts, about 90 kB each,
 * in IndexedDB; favourites, a short list, as JSON in `localStorage`. Only page
 * code uses it: the simulation never sees storage. A browser may refuse either
 * (a private window, storage turned off, a full disk): then that part is kept
 * in memory for as long as the page is open, nothing throws, and `kept` says so,
 * so the page can say "not saved".
 */
export interface Store {
  /** Whether what is written survives a reload: false once the browser has refused either part. */
  readonly kept: boolean;
  /** A ghost's packed record (`packRun`) by its key (`ghostKey`), or null for none. */
  getGhost(key: string): Promise<Uint8Array | null>;
  putGhost(key: string, bytes: Uint8Array): Promise<void>;
  /** The favourites, in the order they were first saved. */
  listFavourites(): Promise<Favourite[]>;
  /** Saves a favourite, in place of any of the same seed. */
  putFavourite(favourite: Favourite): Promise<void>;
  removeFavourite(seed: number): Promise<void>;
}

/** A seed saved to race again (brief: seed, version, track name, personal best and date). */
export interface Favourite {
  seed: number;
  /** The generator version it was saved under. */
  generator: number;
  /** The track's name. */
  name: string;
  /** The best race's total, in steps, or null before one. */
  best: number | null;
  /** The day it was saved, as `2026-11-24`. */
  date: string;
}

/** One part of a store: the ghosts. */
export interface GhostShelf {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
}

/** The other part: the favourites. */
export interface FavouriteShelf {
  list(): Promise<Favourite[]>;
  put(favourite: Favourite): Promise<void>;
  remove(seed: number): Promise<void>;
}

/** Where the favourites are in `localStorage`. */
export const FAVOURITES_KEY = 'seedCircuit.favourites';
/** The IndexedDB database and its one object store. */
const DATABASE = 'seedCircuit';
const GHOSTS = 'ghosts';
/** How long to wait for the database to open before keeping ghosts in memory: a blocked open can wait for ever. */
const OPEN_WAIT_MS = 3000;

/**
 * A ghost's key: its island's share code (`v0-7`), so a ghost of another generator version is never found; with
 * `bot2:` in front for the bot's race. 2 is the bot that drifts (the check-in after M5.4); the bot on grip's races were
 * kept as `bot:`, and are left unread, so the drifting bot's race is worked out in their place.
 */
export function ghostKey(seed: number, generator: number, driver: Driver): string {
  const code = formatSeedCode(seed, generator);
  return driver === 'bot' ? `bot2:${code}` : code;
}

function memoryGhosts(): GhostShelf {
  const ghosts = new Map<string, Uint8Array>();
  return {
    get: async (key) => {
      const bytes = ghosts.get(key);
      return bytes ? bytes.slice() : null;
    },
    put: async (key, bytes) => void ghosts.set(key, bytes.slice()),
  };
}

function memoryFavourites(): FavouriteShelf {
  let list: Favourite[] = [];
  return {
    list: async () => list.map((f) => ({ ...f })),
    put: async (favourite) => {
      list = withFavourite(list, favourite);
    },
    remove: async (seed) => {
      list = list.filter((f) => f.seed !== seed);
    },
  };
}

/** A list with a favourite in place of any of its seed, or added at the end. */
function withFavourite(list: readonly Favourite[], favourite: Favourite): Favourite[] {
  const copy = { ...favourite };
  return list.some((f) => f.seed === favourite.seed) ? list.map((f) => (f.seed === favourite.seed ? copy : f)) : [...list, copy];
}

/** A store kept in memory only: for unit tests, and what a guarded store falls back to. */
export function memoryStore(): Store {
  return guardedStore(null, null);
}

/** Favourites as JSON in a `localStorage`-like storage. Text that is not a list of favourites reads as none; entries that are not one are dropped. */
export function storageFavourites(storage: Pick<Storage, 'getItem' | 'setItem'>): FavouriteShelf {
  const read = (): Favourite[] => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(storage.getItem(FAVOURITES_KEY) ?? '[]');
    } catch {
      return [];
    }
    return Array.isArray(parsed) ? parsed.filter(isFavourite).map(({ seed, generator, name, best, date }) => ({ seed, generator, name, best, date })) : [];
  };
  const write = (list: Favourite[]): void => storage.setItem(FAVOURITES_KEY, JSON.stringify(list));
  return {
    list: async () => read(),
    put: async (favourite) => write(withFavourite(read(), favourite)),
    remove: async (seed) => write(read().filter((f) => f.seed !== seed)),
  };
}

function isFavourite(value: unknown): value is Favourite {
  if (!value || typeof value !== 'object') return false;
  const f = value as Record<string, unknown>;
  return (
    Number.isInteger(f.seed) &&
    Number.isInteger(f.generator) &&
    typeof f.name === 'string' &&
    (f.best === null || (typeof f.best === 'number' && Number.isFinite(f.best))) &&
    typeof f.date === 'string'
  );
}

/** Ghosts in IndexedDB: opens (or makes) the database, or refuses if the browser will not within `waitMs`. */
export function indexedGhosts(factory: IDBFactory, waitMs = OPEN_WAIT_MS): Promise<GhostShelf> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The ghost database did not open in time')), waitMs);
    const request = factory.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(GHOSTS);
    request.onsuccess = () => {
      clearTimeout(timer);
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error ?? new Error('The ghost database would not open'));
    };
    request.onblocked = () => {
      clearTimeout(timer);
      reject(new Error('The ghost database is blocked'));
    };
  }).then((db) => {
    const ask = <T>(mode: IDBTransactionMode, make: (ghosts: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const request = make(db.transaction(GHOSTS, mode).objectStore(GHOSTS));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('The ghost database refused'));
      });
    return {
      get: async (key) => {
        const found: unknown = await ask('readonly', (ghosts) => ghosts.get(key));
        if (found instanceof Uint8Array) return found;
        if (found instanceof ArrayBuffer) return new Uint8Array(found);
        return null;
      },
      put: async (key, bytes) => {
        await ask('readwrite', (ghosts) => ghosts.put(bytes.slice(), key));
      },
    };
  });
}

/**
 * A store over two shelves, either of which may be missing (the browser would not open it) or may refuse later. A
 * missing or refusing shelf is swapped for one in memory, for good, and the call is made again there: nothing a store
 * is asked ever throws. `onRefused` is called the first time the store stops being kept.
 */
export function guardedStore(ghosts: GhostShelf | null, favourites: FavouriteShelf | null, onRefused: () => void = () => {}): Store {
  let ghostShelf = ghosts ?? memoryGhosts();
  let favouriteShelf = favourites ?? memoryFavourites();
  let ghostsKept = ghosts !== null;
  let favouritesKept = favourites !== null;
  // Called just before a shelf is swapped for memory: the store stops being kept only the first time.
  const refused = (): void => {
    if (ghostsKept && favouritesKept) onRefused();
  };
  const onGhosts = async <T>(call: (shelf: GhostShelf) => Promise<T>): Promise<T> => {
    try {
      return await call(ghostShelf);
    } catch {
      if (!ghostsKept) throw new Error('The ghosts kept in memory refused');
      refused();
      ghostsKept = false;
      ghostShelf = memoryGhosts();
      return call(ghostShelf);
    }
  };
  const onFavourites = async <T>(call: (shelf: FavouriteShelf) => Promise<T>): Promise<T> => {
    try {
      return await call(favouriteShelf);
    } catch {
      if (!favouritesKept) throw new Error('The favourites kept in memory refused');
      refused();
      favouritesKept = false;
      favouriteShelf = memoryFavourites();
      return call(favouriteShelf);
    }
  };
  return {
    get kept() {
      return ghostsKept && favouritesKept;
    },
    getGhost: (key) => onGhosts((shelf) => shelf.get(key)),
    putGhost: (key, bytes) => onGhosts((shelf) => shelf.put(key, bytes)),
    listFavourites: () => onFavourites((shelf) => shelf.list()),
    putFavourite: (favourite) => onFavourites((shelf) => shelf.put(favourite)),
    removeFavourite: (seed) => onFavourites((shelf) => shelf.remove(seed)),
  };
}

/**
 * The page's store: ghosts in IndexedDB and favourites in `localStorage`, each in memory instead if the browser
 * refuses it (a test write is made to `localStorage` first, since some browsers only refuse on writing).
 */
export async function openStore(win: Window, onRefused?: () => void): Promise<Store> {
  let favourites: FavouriteShelf | null = null;
  try {
    const storage = win.localStorage;
    storage.setItem(`${FAVOURITES_KEY}.probe`, '1');
    storage.removeItem(`${FAVOURITES_KEY}.probe`);
    favourites = storageFavourites(storage);
  } catch {
    favourites = null;
  }
  let ghosts: GhostShelf | null = null;
  try {
    ghosts = await indexedGhosts(win.indexedDB);
  } catch {
    ghosts = null;
  }
  return guardedStore(ghosts, favourites, onRefused);
}
