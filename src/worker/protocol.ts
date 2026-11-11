/**
 * Messages between the page and the generation worker. Plain data only, so
 * the same messages could later travel to a server.
 */

import type { GameConfig } from '../config';
import type { TrackResult } from '../gen';

/** A request to generate something for a seed. The config travels with it: generation never reads config itself. */
export interface GenRequest {
  /** Chosen by the sender; the answer carries the same number. */
  id: number;
  scope: 'track';
  seed: number;
  config: GameConfig;
}

export type GenResponse =
  | { id: number; type: 'done'; scope: 'track'; result: TrackResult; /** Time spent generating, in milliseconds. */ ms: number }
  | { id: number; type: 'error'; message: string };
