/** What the last frames took, in milliseconds. All zero before the first frame. */
export interface FrameStats {
  /** How many frames these numbers are from. */
  count: number;
  /** The middle frame time: half the frames were no slower. */
  median: number;
  /** The time that 95 frames in 100 were no slower than. */
  p95: number;
  /** The slowest frame. */
  worst: number;
  /** The share of frames (0 to 1) that took longer than the target. */
  slow: number;
}

/** Keeps the times of the last frames, and sums them up when asked. Plain numbers, no browser needed. */
export interface FrameMeter {
  /** Records one frame that took this many milliseconds. */
  add(ms: number): void;
  stats(): FrameStats;
  /** Forgets every frame. */
  reset(): void;
}

/**
 * @param keep how many frames it remembers; older ones are forgotten
 * @param target the frame time to hold, in milliseconds (16.7 for 60 frames per second)
 */
export function createFrameMeter(keep: number, target: number): FrameMeter {
  // A ring: once it is full, each new frame takes the place of the oldest.
  const times = new Float64Array(Math.max(1, Math.floor(keep)));
  let count = 0;
  let next = 0;
  return {
    add(ms) {
      times[next] = ms;
      next = (next + 1) % times.length;
      if (count < times.length) count++;
    },

    stats() {
      if (count === 0) return { count: 0, median: 0, p95: 0, worst: 0, slow: 0 };
      const sorted = times.slice(0, count).sort();
      let slow = 0;
      for (const ms of sorted) if (ms > target) slow++;
      return {
        count,
        median: sorted[Math.floor((count - 1) / 2)]!,
        p95: sorted[Math.ceil(count * 0.95) - 1]!,
        worst: sorted[count - 1]!,
        slow: slow / count,
      };
    },

    reset() {
      count = 0;
      next = 0;
    },
  };
}
