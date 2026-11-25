/**
 * Messages between the page and the bot's worker (M5.3b): the bot's race of a
 * seed, worked out away from the page and from the generation worker, so
 * neither the picture nor a new island ever waits for it. Plain data only.
 */

import type { GameConfig } from '../config';

/** A request for the bot's race of a seed, with the handling it is to drive with. */
export interface BotRequest {
  /** Chosen by the sender; the answer carries the same number. */
  id: number;
  seed: number;
  config: GameConfig;
}

export type BotResponse =
  /** The race packed (`packRun`), or null if the bot did not finish it; and the time it took, in milliseconds. */
  | { id: number; type: 'done'; bytes: Uint8Array | null; ms: number }
  | { id: number; type: 'error'; message: string };
