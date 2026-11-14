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

  describe('grass', () => {
    const grass = config.render.grass;

    it('has three fields of blades, each twice as wide as the one inside it or more, with fewer blades to the square metre', () => {
      expect(grass.tiers).toHaveLength(3);
      const density = grass.tiers.map((tier) => tier.blades / (4 * tier.half * tier.half));
      for (let k = 1; k < grass.tiers.length; k++) {
        expect(grass.tiers[k]!.half).toBeGreaterThanOrEqual(grass.tiers[k - 1]!.half * 2);
        expect(density[k]!).toBeLessThan(density[k - 1]! / 2);
        // Wider blades make up for there being fewer of them.
        expect(grass.tiers[k]!.width).toBeGreaterThan(grass.tiers[k - 1]!.width);
      }
      // Close by, about ten blades to the square metre or more, counting every field; under one at the far edge.
      expect(density[0]! + density[1]! + density[2]!).toBeGreaterThan(8);
      expect(density[2]!).toBeLessThan(2);
    });

    it('reaches about 120 m ahead of the camera', () => {
      const far = grass.tiers[grass.tiers.length - 1]!;
      const reach = far.half * (1 + grass.ahead);
      expect(reach).toBeGreaterThanOrEqual(100);
      expect(reach).toBeLessThanOrEqual(140);
      // The field stays round the camera however it turns: its middle is never further ahead than its own half-width.
      expect(grass.ahead).toBeGreaterThanOrEqual(0);
      expect(grass.ahead).toBeLessThan(1);
    });

    it('stays inside its budget of 250,000 triangles', () => {
      const triangles = grass.tiers.reduce((sum, tier) => sum + tier.blades * tier.triangles, 0);
      expect(triangles).toBeLessThanOrEqual(250_000);
      expect(triangles).toBeGreaterThan(80_000);
      // The far field's blades are single triangles.
      expect(grass.tiers[grass.tiers.length - 1]!.triangles).toBe(1);
    });

    it('fades every blade out before the edge of its field, where it wraps round', () => {
      expect(grass.edgeFade).toBeGreaterThan(0.1);
      expect(grass.edgeFade).toBeLessThan(0.6);
    });

    it('grows long meadow and short turf, and mows a strip beside the road shorter than either', () => {
      expect(grass.turf[0]).toBeLessThan(grass.turf[1]);
      expect(grass.meadow[0]).toBeLessThan(grass.meadow[1]);
      expect(grass.turf[1]).toBeLessThan(grass.meadow[0]);
      expect(grass.mown.height).toBeLessThanOrEqual(grass.turf[0]);
      // The strip starts at the road edge, so it must be wider than the bare verge to show at all.
      expect(grass.mown.width).toBeGreaterThan(config.road.verge + config.world.cover.roadsideFade);
      expect(grass.mown.ease).toBeGreaterThan(0);
      // Mown grass is well under the barrier's top, so it never hides it.
      expect(grass.mown.height).toBeLessThan(config.road.barrierHeight / 2);
    });

    it('lets a small share of blades flower, in patches a few tens of metres across, and only in long grass', () => {
      expect(grass.flowers.share).toBeGreaterThan(0.01);
      expect(grass.flowers.share).toBeLessThan(0.1);
      expect(grass.flowers.patches).toBeGreaterThan(0.1);
      expect(grass.flowers.patches).toBeLessThan(0.5);
      expect(grass.flowers.scale).toBeGreaterThanOrEqual(25);
      expect(grass.flowers.scale).toBeLessThanOrEqual(80);
      expect(grass.flowers.minLength).toBeGreaterThan(grass.turf[1]);
      expect(grass.flowers.minLength).toBeLessThan(grass.meadow[1]);
    });

    it('is left out when the camera is too high to see a blade, such as the view from above', () => {
      expect(grass.ceiling).toBeGreaterThan(config.camera.spot.distance);
      expect(grass.ceiling).toBeLessThan(config.camera.orbit.start.distance * 0.5);
    });
  });
});
