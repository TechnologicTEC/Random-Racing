/**
 * The bot's worker (M5.3b): races the bot round an island off the main thread
 * and away from generation. All the real work is in botHandler.ts.
 */

import type { Rapier } from '../sim/physics/rapier';
import { handleBotRequest } from './botHandler';
import type { BotRequest } from './botProtocol';

let engine: Promise<Rapier> | null = null;
/** The physics engine, loaded on the first request and kept. */
const rapier = (): Promise<Rapier> => (engine ??= import('../sim/physics/rapier').then(({ loadRapier }) => loadRapier()));

self.onmessage = (event: MessageEvent<BotRequest>): void => {
  void handleBotRequest(
    event.data,
    (response, transfer) => self.postMessage(response, transfer),
    () => performance.now(),
    rapier,
  );
};
