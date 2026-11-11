import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateTrack, hashTrack } from '../gen';
import { createGenClient, type WorkerLike } from './client';
import { handleRequest } from './handler';
import type { GenRequest, GenResponse } from './protocol';

/**
 * A stand-in for the real worker. Requests are held until `flush` is called,
 * so a test decides the order the answers come back in.
 */
function fakeWorker(): WorkerLike & { held: GenRequest[]; flush(order?: number[]): void; terminated: boolean } {
  const worker = {
    held: [] as GenRequest[],
    terminated: false,
    onmessage: null as ((event: { data: GenResponse }) => void) | null,
    onerror: null as ((message: string) => void) | null,
    postMessage(request: GenRequest) {
      worker.held.push(request);
    },
    terminate() {
      worker.terminated = true;
    },
    flush(order?: number[]) {
      const requests = order ? order.map((i) => worker.held[i]!) : [...worker.held];
      worker.held = [];
      for (const request of requests) {
        handleRequest(request, (response) => worker.onmessage?.({ data: response }), () => 0);
      }
    },
  };
  return worker;
}

describe('createGenClient', () => {
  it('resolves a track request with the generated track', async () => {
    const worker = fakeWorker();
    const client = createGenClient(() => worker);
    const pending = client.track(48213, config);
    worker.flush();
    const { result } = await pending;
    expect(hashTrack(result)).toBe(hashTrack(generateTrack(48213, config.track)));
  });

  it('matches each answer to its own request, even when answers come back out of order', async () => {
    const worker = fakeWorker();
    const client = createGenClient(() => worker);
    const first = client.track(1, config);
    const second = client.track(2, config);
    worker.flush([1, 0]);
    expect((await first).result.seed).toBe(1);
    expect((await second).result.seed).toBe(2);
  });

  it('starts the worker only when first needed, and only once', () => {
    let started = 0;
    const worker = fakeWorker();
    const client = createGenClient(() => {
      started++;
      return worker;
    });
    expect(started).toBe(0);
    void client.track(1, config);
    void client.track(2, config);
    expect(started).toBe(1);
  });

  it('rejects when the worker reports an error', async () => {
    const worker = fakeWorker();
    const client = createGenClient(() => worker);
    const broken = { ...config, track: undefined } as unknown as typeof config;
    const pending = client.track(1, broken);
    worker.flush();
    await expect(pending).rejects.toThrow(/Generation failed/);
  });

  it('rejects unanswered requests if the worker itself breaks', async () => {
    const worker = fakeWorker();
    const client = createGenClient(() => worker);
    const pending = client.track(1, config);
    worker.onerror?.('script failed to load');
    await expect(pending).rejects.toThrow(/script failed to load/);
  });

  it('stops the worker and rejects unanswered requests when disposed', async () => {
    const worker = fakeWorker();
    const client = createGenClient(() => worker);
    const pending = client.track(1, config);
    client.dispose();
    expect(worker.terminated).toBe(true);
    await expect(pending).rejects.toThrow(/stopped/);
  });
});
