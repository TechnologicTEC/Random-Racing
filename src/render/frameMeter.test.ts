import { describe, expect, it } from 'vitest';
import { createFrameMeter } from './frameMeter';

describe('createFrameMeter', () => {
  it('has nothing to say before any frame', () => {
    const meter = createFrameMeter(100, 16.7);
    expect(meter.stats()).toEqual({ count: 0, median: 0, p95: 0, worst: 0, slow: 0 });
  });

  it('gives the middle frame time, whatever order they came in', () => {
    const meter = createFrameMeter(100, 16.7);
    for (const ms of [30, 10, 20, 50, 40]) meter.add(ms);
    expect(meter.stats().count).toBe(5);
    expect(meter.stats().median).toBe(30);
    expect(meter.stats().worst).toBe(50);
  });

  it('gives the time that 95 frames in 100 are no slower than', () => {
    const meter = createFrameMeter(200, 16.7);
    // 1 ms, 2 ms ... 100 ms, shuffled by a fixed stride.
    for (let k = 0; k < 100; k++) meter.add(((k * 37) % 100) + 1);
    expect(meter.stats().p95).toBe(95);
    expect(meter.stats().median).toBe(50);
  });

  it('says what share of frames took longer than the target', () => {
    const meter = createFrameMeter(100, 16.7);
    for (const ms of [8, 8, 8, 16.7, 16.8, 33, 8, 8]) meter.add(ms);
    // Two of the eight are over 16.7 ms; a frame of exactly 16.7 ms is on time.
    expect(meter.stats().slow).toBe(0.25);
  });

  it('forgets frames older than the number it keeps', () => {
    const meter = createFrameMeter(4, 16.7);
    for (const ms of [100, 100, 100, 5, 6, 7, 8]) meter.add(ms);
    expect(meter.stats()).toEqual({ count: 4, median: 6, p95: 8, worst: 8, slow: 0 });
  });

  it('starts again from nothing when reset', () => {
    const meter = createFrameMeter(100, 16.7);
    meter.add(40);
    meter.reset();
    expect(meter.stats().count).toBe(0);
    meter.add(12);
    expect(meter.stats()).toEqual({ count: 1, median: 12, p95: 12, worst: 12, slow: 0 });
  });
});
