import type { GameConfig } from '../config';
import type { TrackResult } from '../gen';
import type { GenRequest, GenResponse } from './protocol';

/** The few parts of a Worker the client uses, so tests can supply a stand-in. */
export interface WorkerLike {
  onmessage: ((event: { data: GenResponse }) => void) | null;
  /** Called if the worker itself breaks (for example its script fails to load). */
  onerror?: ((message: string) => void) | null;
  postMessage(request: GenRequest): void;
  terminate(): void;
}

export interface Generated<T> {
  result: T;
  /** Time the worker spent generating, in milliseconds. */
  ms: number;
}

export interface GenClient {
  /** Generates the track for a seed in the worker. */
  track(seed: number, config: GameConfig): Promise<Generated<TrackResult>>;
  /** Stops the worker. Requests still waiting are rejected. */
  dispose(): void;
}

interface Waiting {
  resolve(value: Generated<TrackResult>): void;
  reject(reason: Error): void;
}

/**
 * Talks to the generation worker. Requests are answered in the order the
 * worker finishes them; each promise gets the answer to its own request.
 */
export function createGenClient(startWorker: () => WorkerLike = startGenWorker): GenClient {
  let worker: WorkerLike | null = null;
  let nextId = 1;
  const waiting = new Map<number, Waiting>();

  const failAll = (reason: string): void => {
    for (const entry of waiting.values()) entry.reject(new Error(reason));
    waiting.clear();
  };

  const ensureWorker = (): WorkerLike => {
    if (worker) return worker;
    worker = startWorker();
    worker.onmessage = ({ data }) => {
      const entry = waiting.get(data.id);
      if (!entry) return;
      waiting.delete(data.id);
      if (data.type === 'error') entry.reject(new Error(`Generation failed: ${data.message}`));
      else entry.resolve({ result: data.result, ms: data.ms });
    };
    worker.onerror = (message) => failAll(`Generation failed: ${message}`);
    return worker;
  };

  return {
    track(seed, config) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { resolve, reject });
        ensureWorker().postMessage({ id, scope: 'track', seed, config });
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      failAll('The generation worker was stopped');
    },
  };
}

/** Starts the real worker. Vite bundles the worker file from this URL. */
function startGenWorker(): WorkerLike {
  const worker = new Worker(new URL('./gen.worker.ts', import.meta.url), { type: 'module' });
  const like: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (request) => worker.postMessage(request),
    terminate: () => worker.terminate(),
  };
  worker.onmessage = (event: MessageEvent<GenResponse>) => like.onmessage?.({ data: event.data });
  worker.onerror = (event) => like.onerror?.(event.message || 'the worker could not start');
  return like;
}

let shared: GenClient | null = null;

/** The one client the page shares, started on first use. */
export function genClient(): GenClient {
  shared ??= createGenClient();
  return shared;
}
