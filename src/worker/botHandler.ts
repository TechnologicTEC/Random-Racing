import { generateWorld } from '../gen';
import { botRecord } from '../sim/bot/bot';
import type { Rapier } from '../sim/physics/rapier';
import { packRun } from '../sim/record';
import type { BotRequest, BotResponse } from './botProtocol';

/**
 * Does the work for one request to the bot's worker: builds the seed's island, races the bot round it with the
 * handling sent and answers with the race packed. Kept apart from the worker file so it can be tested without a
 * browser. Never throws: a failure is answered as an error.
 *
 * @param post sends an answer; the buffers listed are handed over, not copied
 * @param now a clock in milliseconds, used only to time the work
 * @param rapier gives the physics engine, loaded once
 */
export async function handleBotRequest(
  request: BotRequest,
  post: (response: BotResponse, transfer: ArrayBuffer[]) => void,
  now: () => number,
  rapier: () => Promise<Rapier>,
): Promise<void> {
  try {
    const started = now();
    const engine = await rapier();
    const world = generateWorld(request.seed, request.config);
    const record = botRecord(engine, world, request.config);
    const bytes = record && packRun(record);
    post({ id: request.id, type: 'done', bytes, ms: now() - started }, bytes ? [bytes.buffer as ArrayBuffer] : []);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    post({ id: request.id, type: 'error', message }, []);
  }
}
