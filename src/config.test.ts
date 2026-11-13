import { describe, expect, it } from 'vitest';
import { config, GENERATOR_VERSION } from './config';

describe('config', () => {
  it('uses generator version 0 during development', () => {
    expect(GENERATOR_VERSION).toBe(0);
  });

  it('keeps the lap length range from the brief (1.4 to 2.4 km)', () => {
    expect(config.track.lapLengthMin).toBe(1400);
    expect(config.track.lapLengthMax).toBe(2400);
  });

  it('makes the road 12 m wide, widening to at most 22 m in places', () => {
    expect(config.track.roadWidth).toBe(12);
    expect(config.road.width.max).toBe(22);
    expect(config.road.width.min).toBeGreaterThan(config.track.roadWidth);
    expect(config.road.width.min).toBeLessThan(config.road.width.max);
  });

  it('keeps widened road clear of other sections: further apart than sections that share a bank', () => {
    expect(config.road.width.clearance).toBeGreaterThan(config.road.coupleDistance);
  });

  it('generates a 2700 m tile on a 3 m grid: room for mountains, at about 800,000 heights', () => {
    const { extent, cell } = config.world.tile;
    expect(extent).toBe(2700);
    expect(cell).toBe(3);
    const side = extent / cell + 1;
    expect(side * side).toBeGreaterThan(750_000);
    expect(side * side).toBeLessThan(850_000);
  });

  it('keeps the verge wider than a grid cell, and wide enough for the barrier', () => {
    expect(config.road.verge).toBe(4);
    expect(config.road.verge).toBeGreaterThan(config.world.tile.cell);
    expect(config.road.barrierOffset + config.road.barrierWidth).toBeLessThan(config.road.verge);
    // The coast is carved only beyond the verge and one more grid cell, so ground read between
    // cells under the barrier is never pulled down by a sea cliff.
    expect(config.world.coast.clear).toBeGreaterThanOrEqual(config.road.verge + config.world.tile.cell);
  });

  it('generates about 30 candidates per seed', () => {
    expect(config.track.candidatesPerRound).toBe(30);
  });

  it('gives elevation 12% of the fun score, with the weights adding up to 1', () => {
    const weights = config.track.score.weights;
    expect(weights.elevation).toBe(0.12);
    const total = weights.straights + weights.cornerMix + weights.drift + weights.flow + weights.elevation;
    expect(total).toBeCloseTo(1, 12);
  });

  it('keeps road gradients at the brief limit of about 8%, except on mountain seeds, which may climb at 15%', () => {
    expect(config.road.maxGradient).toEqual({ flat: 0.08, rolling: 0.08, hilly: 0.08, mountain: 0.15 });
  });

  it('aims each kind of relief at its own lap height range', () => {
    const kinds = config.world.relief.kinds;
    expect(kinds.flat.lapRange).toEqual([0, 8]);
    expect(kinds.rolling.lapRange).toEqual([15, 30]);
    expect(kinds.hilly.lapRange).toEqual([30, 60]);
    expect(kinds.mountain.lapRange).toEqual([55, 160]);
    // Mountain seeds aim higher when they climb onto the mountain than when they go round it.
    expect(config.world.relief.massif.routes.climb.lapRange).toEqual([90, 160]);
    expect(config.world.relief.massif.routes.circle.lapRange).toEqual([55, 100]);
  });

  it('lets the 3D view see and frame the whole 2700 m tile', () => {
    const extent = config.world.tile.extent;
    // From the furthest the orbit camera goes, the far side of the tile is still inside the haze.
    expect(config.camera.orbit.furthest).toBeGreaterThanOrEqual(extent * 1.3);
    expect(config.render.fogFar).toBeGreaterThanOrEqual(config.camera.orbit.furthest + extent);
    // The sea reaches past the haze in every direction.
    expect(config.render.seaSize / 2).toBeGreaterThanOrEqual(config.render.fogFar + extent / 2);
  });

  it('draws ground far from the road at a quarter of the detail', () => {
    expect(config.render.farStride).toBe(2);
    expect(config.render.detailDistance).toBeGreaterThan(config.world.scenery.mountains.clearance);
  });
});
