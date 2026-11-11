import { describe, expect, it } from 'vitest';
import { fitView, MAX_SCALE, MIN_SCALE, panBy, screenToWorld, worldToScreen, zoomAt, type View } from './view';

const view: View = { centerX: 50, centerZ: -20, scale: 2, width: 800, height: 600 };

describe('view transform', () => {
  it('puts the view centre in the middle of the canvas', () => {
    expect(worldToScreen(view, 50, -20)).toEqual({ sx: 400, sy: 300 });
  });

  it('maps +X to the right and +Z down the screen, scaled', () => {
    expect(worldToScreen(view, 60, -20)).toEqual({ sx: 420, sy: 300 });
    expect(worldToScreen(view, 50, -10)).toEqual({ sx: 400, sy: 320 });
  });

  it('round-trips between world and screen', () => {
    const { sx, sy } = worldToScreen(view, 123.5, -77.25);
    const back = screenToWorld(view, sx, sy);
    expect(back.x).toBeCloseTo(123.5, 9);
    expect(back.z).toBeCloseTo(-77.25, 9);
  });
});

describe('zoomAt', () => {
  it('keeps the world point under the cursor fixed', () => {
    const before = screenToWorld(view, 650, 120);
    const zoomed = zoomAt(view, 650, 120, 1.5);
    const after = screenToWorld(zoomed, 650, 120);
    expect(zoomed.scale).toBeCloseTo(3, 9);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.z).toBeCloseTo(before.z, 9);
  });

  it('clamps the zoom level', () => {
    expect(zoomAt(view, 0, 0, 1e9).scale).toBe(MAX_SCALE);
    expect(zoomAt(view, 0, 0, 1e-9).scale).toBe(MIN_SCALE);
  });
});

describe('panBy', () => {
  it('moves the content with the drag', () => {
    const before = worldToScreen(view, 0, 0);
    const after = worldToScreen(panBy(view, 30, -12), 0, 0);
    expect(after.sx - before.sx).toBeCloseTo(30, 9);
    expect(after.sy - before.sy).toBeCloseTo(-12, 9);
  });
});

describe('fitView', () => {
  it('centres on the origin and fits a circle of the given radius with padding', () => {
    const fitted = fitView(800, 600, 500, 20);
    expect(fitted.centerX).toBe(0);
    expect(fitted.centerZ).toBe(0);
    const top = worldToScreen(fitted, 0, -500);
    const bottom = worldToScreen(fitted, 0, 500);
    expect(top.sy).toBeCloseTo(20, 6);
    expect(bottom.sy).toBeCloseTo(580, 6);
  });
});
