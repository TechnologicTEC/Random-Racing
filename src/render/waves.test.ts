import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { resolved, waveField, waveSet } from './waves';

const cfg = config.render.water;
const trains = waveSet(cfg);
const windLength = Math.hypot(cfg.wind[0], cfg.wind[1]);
const wind = { x: cfg.wind[0] / windLength, z: cfg.wind[1] / windLength };

/** Heights of the sea along a straight line, one every `step` metres. */
function heightsAlong(dx: number, dz: number, metres: number, step: number, fromX = 137, fromZ = -412): number[] {
  const out: number[] = [];
  for (let s = 0; s < metres; s += step) out.push(waveField(cfg, fromX + dx * s, fromZ + dz * s, 0).height);
  return out;
}

const mean = (list: readonly number[]): number => list.reduce((sum, v) => sum + v, 0) / list.length;
const spread = (list: readonly number[]): number => {
  const m = mean(list);
  return Math.sqrt(mean(list.map((v) => (v - m) * (v - m))));
};

/** The big crests along a line: local high points standing well above the mean. Each is [index, height above the mean]. */
function bigCrests(heights: readonly number[]): Array<[number, number]> {
  const m = mean(heights);
  const bar = m + 0.5 * spread(heights);
  const crests: Array<[number, number]> = [];
  let inside = false;
  let best = 0;
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i]!;
    if (h > bar) {
      if (!inside || h > heights[best]!) best = i;
      inside = true;
    } else if (inside) {
      crests.push([best, heights[best]! - m]);
      inside = false;
    }
  }
  return crests;
}

/** How alike the line is to itself moved along by `lag` samples: 1 for a perfect repeat, near 0 for none. */
function repeatAt(heights: readonly number[], lag: number): number {
  const m = mean(heights);
  let top = 0;
  let bottom = 0;
  for (let i = 0; i + lag < heights.length; i++) top += (heights[i]! - m) * (heights[i + lag]! - m);
  for (const h of heights) bottom += (h - m) * (h - m);
  return top / bottom;
}

describe('waveSet', () => {
  it('sends every wave roughly down the wind, some to each side of it', () => {
    let left = 0;
    let right = 0;
    for (const train of trains) {
      const along = train.dx * wind.x + train.dz * wind.z;
      expect(along).toBeGreaterThan(Math.cos((55 * Math.PI) / 180));
      if (train.dx * wind.z - train.dz * wind.x > 0) left++;
      else right++;
    }
    expect(left).toBeGreaterThanOrEqual(2);
    expect(right).toBeGreaterThanOrEqual(2);
  });

  it('mixes long swells with small ripples, no two of nearly the same length', () => {
    const lengths = trains.map((train) => train.length).sort((a, b) => b - a);
    expect(lengths.length).toBeGreaterThanOrEqual(6);
    expect(lengths[0]).toBeGreaterThan(45);
    expect(lengths[lengths.length - 1]).toBeLessThan(4);
    for (let i = 1; i < lengths.length; i++) expect(lengths[i - 1]! / lengths[i]!).toBeGreaterThan(1.3);
  });

  it('moves long waves faster than short ones, as the sea does', () => {
    const byLength = [...trains].sort((a, b) => b.length - a.length);
    for (let i = 1; i < byLength.length; i++) expect(byLength[i - 1]!.omega / byLength[i - 1]!.k).toBeGreaterThan(byLength[i]!.omega / byLength[i]!.k);
    // A 60 m wave in deep water travels at about 10 m/s.
    const long = byLength[0]!;
    expect(long.omega / long.k).toBeGreaterThan(5);
    expect(long.omega / long.k).toBeLessThan(15);
  });
});

describe('waveField', () => {
  const downwind = heightsAlong(wind.x, wind.z, 4000, 0.5);
  const crests = bigCrests(downwind);

  it('spaces its big crests unevenly: some come sooner, some later', () => {
    expect(crests.length).toBeGreaterThan(30);
    const gaps = crests.slice(1).map(([index], i) => (index - crests[i]![0]) * 0.5);
    expect(spread(gaps) / mean(gaps)).toBeGreaterThan(0.4);
    // And well apart on average: not one after the other.
    expect(mean(gaps)).toBeGreaterThan(40);
  });

  it('makes some crests much bigger than others', () => {
    const sizes = crests.map(([, height]) => height).sort((a, b) => a - b);
    const low = sizes[Math.floor(sizes.length * 0.1)]!;
    const high = sizes[Math.floor(sizes.length * 0.9)]!;
    expect(high / low).toBeGreaterThan(1.8);
  });

  it('never settles into a repeating pattern, down the wind or across it', () => {
    // Down the wind, a wave or two on, the sea no longer matches itself.
    for (let metres = 100; metres <= 800; metres += 2.5) expect(repeatAt(downwind, metres / 0.5), `${metres} m down`).toBeLessThan(0.35);
    // Across the wind it stays alike for the length of a crest (about 100 m), then no further.
    const across = heightsAlong(-wind.z, wind.x, 4000, 0.5);
    for (let metres = 200; metres <= 800; metres += 2.5) expect(repeatAt(across, metres / 0.5), `${metres} m across`).toBeLessThan(0.3);
  });

  it('has crests longer than the gaps between them, and not endless', () => {
    const across = heightsAlong(-wind.z, wind.x, 4000, 0.5);
    expect(repeatAt(across, 30 / 0.5)).toBeGreaterThan(0.5);
    expect(repeatAt(downwind, 30 / 0.5)).toBeLessThan(0.3);
  });

  it('has peaked crests and broad troughs', () => {
    const m = mean(downwind);
    const s = spread(downwind);
    const skew = mean(downwind.map((h) => ((h - m) / s) ** 3));
    expect(skew).toBeGreaterThan(0.3);
  });

  it('keeps its slopes gentle enough to shade, and never flat', () => {
    const slopes: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const { slopeX, slopeZ } = waveField(cfg, i * 7.3 - 900, i * 3.1 + 250, 2);
      slopes.push(Math.hypot(slopeX, slopeZ));
    }
    expect(Math.max(...slopes)).toBeLessThan(0.7);
    expect(mean(slopes)).toBeGreaterThan(0.04);
    expect(mean(slopes)).toBeLessThan(0.25);
  });

  it('gives slopes that match its heights', () => {
    // The bending of the crests is left out of the slope, so the match is close, not exact.
    let top = 0;
    let a = 0;
    let b = 0;
    for (let i = 0; i < 2000; i++) {
      const x = i * 5.7 - 300;
      const z = i * 2.9 + 80;
      const measured = (waveField(cfg, x + 0.05, z, 0).height - waveField(cfg, x - 0.05, z, 0).height) / 0.1;
      const stated = waveField(cfg, x, z, 0).slopeX;
      top += measured * stated;
      a += measured * measured;
      b += stated * stated;
    }
    expect(top / Math.sqrt(a * b)).toBeGreaterThan(0.9);
  });

  it('moves with time, the longest swell travelling down the wind', () => {
    expect(waveField(cfg, 10, 20, 0).height).not.toBe(waveField(cfg, 10, 20, 1).height);
    const before = heightsAlong(wind.x, wind.z, 1500, 0.5);
    const after: number[] = [];
    for (let s = 0; s < 1500; s += 0.5) after.push(waveField(cfg, 137 + wind.x * s, -412 + wind.z * s, 1).height);
    // After a second the pattern matches itself best a few metres further down the wind, not up it.
    const match = (shift: number): number => {
      let sum = 0;
      for (let i = 100; i < before.length - 100; i++) sum += before[i]! * after[i + shift]!;
      return sum;
    };
    let best = 0;
    for (let shift = -40; shift <= 40; shift++) if (match(shift) > match(best)) best = shift;
    expect(best).toBeGreaterThan(4);
  });
});

describe('resolved', () => {
  it('keeps a wave much longer than a pixel covers, and drops one a pixel cannot show', () => {
    const [from, to] = cfg.resolve;
    expect(resolved(0, 30, cfg.resolve)).toBe(1);
    expect(resolved(30 * from, 30, cfg.resolve)).toBe(1);
    expect(resolved(30 * to, 30, cfg.resolve)).toBe(0);
    expect(resolved(1000, 30, cfg.resolve)).toBe(0);
    // Nothing a pixel covers half a wavelength of may be drawn: it would shimmer into false patterns.
    expect(to).toBeLessThanOrEqual(0.5);
  });

  it('fades smoothly in between', () => {
    let previous = 1;
    for (let foot = 0; foot <= 20; foot += 0.25) {
      const keep = resolved(foot, 30, cfg.resolve);
      expect(keep).toBeLessThanOrEqual(previous);
      expect(previous - keep).toBeLessThan(0.15);
      previous = keep;
    }
  });
});
