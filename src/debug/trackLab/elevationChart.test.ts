import { describe, expect, it } from 'vitest';
import { chartLayout } from './elevationChart';

describe('chartLayout', () => {
  const profile = {
    height: Float64Array.from([10, 12, 20, 14]),
    ground: Float64Array.from([10, 13, 18, 30]),
  };
  const layout = chartLayout(profile, 400, 100);

  it('spreads the lap across the full width, starting at the left edge', () => {
    expect(layout.x(0)).toBe(layout.left);
    // The lap is a loop: the point after the last sample is the start again, at the right edge.
    expect(layout.x(4)).toBe(layout.right);
    expect(layout.x(2)).toBeCloseTo((layout.left + layout.right) / 2, 6);
  });

  it('fits both the road and the ground between top and bottom', () => {
    for (const value of [...profile.height, ...profile.ground]) {
      expect(layout.y(value)).toBeGreaterThanOrEqual(layout.top);
      expect(layout.y(value)).toBeLessThanOrEqual(layout.bottom);
    }
  });

  it('draws higher ground higher up', () => {
    expect(layout.y(30)).toBeLessThan(layout.y(10));
  });

  it('does not stretch a nearly flat road to fill the chart', () => {
    const flat = chartLayout({ height: Float64Array.from([5, 5.2, 5]), ground: Float64Array.from([5, 5, 5]) }, 400, 100);
    // 0.2 m of height must not look like a mountain: it takes up under a tenth of the chart.
    expect(Math.abs(flat.y(5.2) - flat.y(5))).toBeLessThan((flat.bottom - flat.top) / 10);
  });
});
