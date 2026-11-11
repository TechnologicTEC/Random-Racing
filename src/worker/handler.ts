import { generateTrack } from '../gen';
import type { GenRequest, GenResponse } from './protocol';

/**
 * Does the work for one request. Kept apart from the worker file itself so it
 * can be tested without a browser.
 *
 * @param post sends an answer; the buffers listed are handed over, not copied
 * @param now a clock in milliseconds, used only to time the work
 */
export function handleRequest(
  request: GenRequest,
  post: (response: GenResponse, transfer: ArrayBuffer[]) => void,
  now: () => number,
): void {
  try {
    const started = now();
    const result = generateTrack(request.seed, request.config);
    const ms = now() - started;
    post({ id: request.id, type: 'done', scope: 'track', result, ms }, collectBuffers(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    post({ id: request.id, type: 'error', message }, []);
  }
}

/** Every typed-array buffer inside a value, each listed once. */
export function collectBuffers(value: unknown): ArrayBuffer[] {
  const found = new Set<ArrayBuffer>();
  const visit = (item: unknown): void => {
    if (item === null || typeof item !== 'object') return;
    if (ArrayBuffer.isView(item)) {
      if (item.buffer instanceof ArrayBuffer) found.add(item.buffer);
      return;
    }
    if (Array.isArray(item)) {
      for (const entry of item) visit(entry);
      return;
    }
    for (const entry of Object.values(item)) visit(entry);
  };
  visit(value);
  return [...found];
}
