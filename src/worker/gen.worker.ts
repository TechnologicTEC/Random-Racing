/**
 * The generation worker: runs track and world generation off the main thread
 * so the page never freezes. All the real work is in handler.ts.
 */

import { handleRequest } from './handler';
import type { GenRequest } from './protocol';

self.onmessage = (event: MessageEvent<GenRequest>): void => {
  handleRequest(
    event.data,
    (response, transfer) => self.postMessage(response, transfer),
    () => performance.now(),
  );
};
