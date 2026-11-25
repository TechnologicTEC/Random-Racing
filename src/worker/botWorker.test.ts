import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import { loadRapier } from '../sim/physics/rapier';
import { replayRun, unpackRun } from '../sim/record';
import { createBotClient, type BotWorkerLike } from './botClient';
import { handleBotRequest } from './botHandler';
import type { BotRequest, BotResponse } from './botProtocol';

/** Runs one request through the handler and gives everything it posted. */
async function run(request: BotRequest, rapier = loadRapier): Promise<Array<{ response: BotResponse; transfer: ArrayBuffer[] }>> {
  const posted: Array<{ response: BotResponse; transfer: ArrayBuffer[] }> = [];
  let clock = 100;
  await handleBotRequest(request, (response, transfer) => posted.push({ response, transfer }), () => (clock += 9), rapier);
  return posted;
}

describe('the bot worker (handleBotRequest)', () => {
  it("answers with the bot's race of the seed, packed, handing its bytes over, and it replays to its fingerprint", async () => {
    const posted = await run({ id: 3, seed: 7, config });
    expect(posted).toHaveLength(1);
    const { response, transfer } = posted[0]!;
    if (response.type !== 'done' || !response.bytes) throw new Error('expected the bot to finish its race');
    expect(response.id).toBe(3);
    expect(response.ms).toBe(9);
    expect(transfer).toEqual([response.bytes.buffer]);
    const record = unpackRun(response.bytes);
    expect(record.driver).toBe('bot');
    expect(record.seed).toBe(7);
    expect(replayRun(await loadRapier(), generateWorld(7, config), config, record)).toBe(record.hash);
  }, 120_000);

  it('answers with an error when the work fails, never throwing', async () => {
    const posted = await run({ id: 8, seed: 7, config }, () => Promise.reject(new Error('no physics here')));
    expect(posted.map((p) => p.response)).toEqual([{ id: 8, type: 'error', message: 'no physics here' }]);
  });
});

/** A stand-in worker: requests are held, and the test answers them as it likes. */
function fakeWorker(): BotWorkerLike & { held: BotRequest[]; terminated: boolean; answer(response: BotResponse): void } {
  const worker = {
    held: [] as BotRequest[],
    terminated: false,
    onmessage: null as ((event: { data: BotResponse }) => void) | null,
    onerror: null as ((message: string) => void) | null,
    postMessage(request: BotRequest) {
      worker.held.push(request);
    },
    terminate() {
      worker.terminated = true;
    },
    answer(response: BotResponse) {
      worker.onmessage?.({ data: response });
    },
  };
  return worker;
}

describe('the bot client (createBotClient)', () => {
  it("gives each race the answer to its own request: the record's bytes, or null for a bot that did not finish", async () => {
    const worker = fakeWorker();
    const client = createBotClient(() => worker);
    const seven = client.race(7, config);
    const eight = client.race(8, config);
    expect(worker.held.map((r) => r.seed)).toEqual([7, 8]);
    worker.answer({ id: worker.held[1]!.id, type: 'done', bytes: null, ms: 5 });
    worker.answer({ id: worker.held[0]!.id, type: 'done', bytes: Uint8Array.from([1, 2]), ms: 6 });
    expect(await eight).toEqual({ bytes: null, ms: 5 });
    expect(await seven).toEqual({ bytes: Uint8Array.from([1, 2]), ms: 6 });
  });

  it('turns an error answer, or the worker breaking, into a refused promise', async () => {
    const worker = fakeWorker();
    const client = createBotClient(() => worker);
    const first = client.race(7, config);
    worker.answer({ id: worker.held[0]!.id, type: 'error', message: 'stuck' });
    await expect(first).rejects.toThrow(/stuck/);
    const second = client.race(9, config);
    worker.onerror?.('the worker could not start');
    await expect(second).rejects.toThrow(/could not start/);
  });

  it('stops the worker on cancel, refusing what is waiting, and starts a new one for the next race', async () => {
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const client = createBotClient(() => {
      const made = fakeWorker();
      workers.push(made);
      return made;
    });
    const old = client.race(7, config);
    client.cancel();
    await expect(old).rejects.toThrow(/stopped/);
    expect(workers[0]!.terminated).toBe(true);
    const next = client.race(42, config);
    expect(workers).toHaveLength(2);
    workers[1]!.answer({ id: workers[1]!.held[0]!.id, type: 'done', bytes: null, ms: 1 });
    expect(await next).toEqual({ bytes: null, ms: 1 });
  });
});
