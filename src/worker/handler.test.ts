import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateTrack, generateWorld, hashTrack, hashWorld } from '../gen';
import { collectBuffers, handleRequest } from './handler';
import type { GenResponse } from './protocol';

/** Runs one request and returns everything the handler posted. */
function run(request: Parameters<typeof handleRequest>[0]): Array<{ response: GenResponse; transfer: ArrayBuffer[] }> {
  const posted: Array<{ response: GenResponse; transfer: ArrayBuffer[] }> = [];
  let clock = 100;
  handleRequest(
    request,
    (response, transfer) => posted.push({ response, transfer }),
    () => (clock += 7),
  );
  return posted;
}

describe('handleRequest', () => {
  it('answers a track request with exactly the track generation gives directly', () => {
    const posted = run({ id: 4, scope: 'track', seed: 48213, config });
    expect(posted).toHaveLength(1);
    const { response } = posted[0]!;
    expect(response.id).toBe(4);
    if (response.type !== 'done' || response.scope !== 'track') throw new Error('expected a finished track');
    expect(hashTrack(response.result)).toBe(hashTrack(generateTrack(48213, config)));
  });

  it('reports how long generation took, using the clock it was given', () => {
    const { response } = run({ id: 1, scope: 'track', seed: 5, config })[0]!;
    if (response.type !== 'done') throw new Error('expected a finished track');
    expect(response.ms).toBe(7);
  });

  it('hands over every number array for transfer, each buffer once', () => {
    const { response, transfer } = run({ id: 1, scope: 'track', seed: 5, config })[0]!;
    if (response.type !== 'done' || response.scope !== 'track') throw new Error('expected a finished track');
    const winner = response.result.candidates[response.result.winnerIndex]!;
    expect(transfer).toContain(winner.line.x.buffer);
    expect(transfer).toContain(winner.line.curvature.buffer);
    expect(new Set(transfer).size).toBe(transfer.length);
    // Five arrays per candidate's centre line at least.
    expect(transfer.length).toBeGreaterThanOrEqual(response.result.candidates.length * 5);
  });

  it('answers with an error message instead of throwing when generation fails', () => {
    const broken = { ...config, track: undefined } as unknown as typeof config;
    const posted = run({ id: 9, scope: 'track', seed: 1, config: broken });
    expect(posted).toHaveLength(1);
    expect(posted[0]!.response.id).toBe(9);
    expect(posted[0]!.response.type).toBe('error');
    expect(posted[0]!.transfer).toEqual([]);
  });
});

describe('handleRequest for a whole world', () => {
  const coarse = { ...config, world: { ...config.world, tile: { extent: 1400, cell: 8 } } };

  it('answers a world request with the track and its island', () => {
    const { response, transfer } = run({ id: 3, scope: 'world', seed: 42, config: coarse })[0]!;
    if (response.type !== 'done' || response.scope !== 'world') throw new Error('expected a finished world');
    expect(response.id).toBe(3);
    expect(hashWorld(response.result)).toBe(hashWorld(generateWorld(42, coarse)));
    expect(transfer).toContain(response.result.natural.height.buffer);
    expect(new Set(transfer).size).toBe(transfer.length);
  });

  it('hands over the trees, rocks and clouds with the world', () => {
    const { response, transfer } = run({ id: 4, scope: 'world', seed: 42, config: coarse })[0]!;
    if (response.type !== 'done' || response.scope !== 'world') throw new Error('expected a finished world');
    const { decor, clouds } = response.result;
    expect(decor.trees.count).toBeGreaterThan(0);
    for (const list of [decor.trees.x, decor.trees.kind, decor.rocks.x, decor.rocks.shade, clouds.x, clouds.puffY, clouds.puffCloud]) {
      expect(transfer).toContain(list.buffer);
    }
  });
});

describe('collectBuffers', () => {
  it('finds typed arrays nested in objects and arrays, without repeats', () => {
    const shared = new Float64Array(4);
    const other = new Float32Array(2);
    const value = { a: shared, list: [{ again: shared }, { other }], text: 'hello', n: 3, nothing: null };
    const buffers = collectBuffers(value);
    expect(buffers).toHaveLength(2);
    expect(buffers).toContain(shared.buffer);
    expect(buffers).toContain(other.buffer);
  });
});
