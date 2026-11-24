import type { GameConfig } from '../config';
import type { BotRequest, BotResponse } from './botProtocol';

/** The few parts of a Worker the bot client uses, so tests can supply a stand-in. */
export interface BotWorkerLike {
  onmessage: ((event: { data: BotResponse }) => void) | null;
  /** Called if the worker itself breaks (for example its script fails to load). */
  onerror?: ((message: string) => void) | null;
  postMessage(request: BotRequest): void;
  terminate(): void;
}

/** The bot's race of a seed: its packed record (`packRun`), or null if the bot did not finish; and how long it took. */
export interface BotRace {
  bytes: Uint8Array | null;
  ms: number;
}

export interface BotClient {
  /** Races the bot round a seed's island in the bot's worker, with this handling. */
  race(seed: number, config: GameConfig): Promise<BotRace>;
  /** Stops the race under way, if any: the worker is stopped and what is waiting refused. The next race starts a new one. */
  cancel(): void;
}

interface Waiting {
  resolve(value: BotRace): void;
  reject(reason: Error): void;
}

/** Talks to the bot's worker (M5.3b). Each promise gets the answer to its own request. */
export function createBotClient(startWorker: () => BotWorkerLike = startBotWorker): BotClient {
  let worker: BotWorkerLike | null = null;
  let nextId = 1;
  const waiting = new Map<number, Waiting>();

  const failAll = (reason: string): void => {
    for (const entry of waiting.values()) entry.reject(new Error(reason));
    waiting.clear();
  };

  const ensureWorker = (): BotWorkerLike => {
    if (worker) return worker;
    const made = startWorker();
    worker = made;
    made.onmessage = ({ data }) => {
      const entry = waiting.get(data.id);
      if (!entry) return;
      waiting.delete(data.id);
      if (data.type === 'error') entry.reject(new Error(`The bot's race failed: ${data.message}`));
      else entry.resolve({ bytes: data.bytes, ms: data.ms });
    };
    made.onerror = (message) => failAll(`The bot's race failed: ${message}`);
    return made;
  };

  return {
    race: (seed, config) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { resolve, reject });
        ensureWorker().postMessage({ id, seed, config });
      }),
    cancel() {
      worker?.terminate();
      worker = null;
      failAll("The bot's worker was stopped");
    },
  };
}

/** Starts the real worker. Vite bundles the worker file from this URL. */
function startBotWorker(): BotWorkerLike {
  const worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
  const like: BotWorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (request) => worker.postMessage(request),
    terminate: () => worker.terminate(),
  };
  worker.onmessage = (event: MessageEvent<BotResponse>) => like.onmessage?.({ data: event.data });
  worker.onerror = (event) => like.onerror?.(event.message || 'the worker could not start');
  return like;
}

let shared: BotClient | null = null;

/** The one bot client the page shares, started on first use. */
export function botClient(): BotClient {
  shared ??= createBotClient();
  return shared;
}
