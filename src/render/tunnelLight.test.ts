import { describe, expect, it } from 'vitest';
import type { TunnelLightConfig } from '../config';
import type { TunnelRoom } from '../gen/road/tunnels';
import { dimColours, tunnelLightAt } from './tunnelLight';

// Fixed rules, so these tests do not move when the config is tuned.
const rules: TunnelLightConfig = { light: 0.4, fade: 20, spread: 4.5 };

/** A room on a road at height 0 with its ceiling at 6.5 m, the walls' inner faces 12 m out and the lid reaching 30 m. */
const room = (over: Partial<TunnelRoom> = {}): TunnelRoom => ({ under: true, lateral: 0, inner: 12, reach: 30, ceiling: 6.5, depth: 50, ...over });

describe('the light inside a tunnel (M6.2c)', () => {
  it('leaves all the light where there is no tunnel, and in front of a portal', () => {
    expect(tunnelLightAt(null, 0, rules)).toBe(1);
    expect(tunnelLightAt(room({ under: false, depth: -3 }), 0, rules)).toBe(1);
  });

  it('leaves the set share deep inside, on the road, the walls and the ceiling', () => {
    expect(tunnelLightAt(room(), 0, rules)).toBeCloseTo(0.4, 12);
    expect(tunnelLightAt(room({ lateral: -12 }), 3, rules)).toBeCloseTo(0.4, 12);
    expect(tunnelLightAt(room({ lateral: 11 }), 6.5, rules)).toBeCloseTo(0.4, 12);
  });

  it('fades in from all the light at a portal to the set share over the fade, ever darker', () => {
    expect(tunnelLightAt(room({ depth: 0 }), 0, rules)).toBeCloseTo(1, 12);
    let last = 1;
    for (let depth = 1; depth <= 20; depth++) {
      const light = tunnelLightAt(room({ depth }), 0, rules);
      expect(light).toBeLessThan(last);
      last = light;
    }
    expect(tunnelLightAt(room({ depth: 20 }), 0, rules)).toBeCloseTo(0.4, 12);
    expect(tunnelLightAt(room({ depth: 10 }), 0, rules)).toBeCloseTo(0.7, 12);
  });

  it('leaves all the light on the lid, over the ceiling', () => {
    expect(tunnelLightAt(room(), 6.5 + 1.5, rules)).toBe(1);
    expect(tunnelLightAt(room({ lateral: 14 }), 7.2, rules)).toBe(1);
  });

  it('dims the hidden ground just beyond the walls, but not out towards the lid’s edge', () => {
    expect(tunnelLightAt(room({ lateral: 15 }), 2, rules)).toBeCloseTo(0.4, 12);
    expect(tunnelLightAt(room({ lateral: -16.4 }), 2, rules)).toBeCloseTo(0.4, 12);
    expect(tunnelLightAt(room({ lateral: 17 }), 2, rules)).toBe(1);
    // Where the lid reaches only 19 m, no further than 4.5 m short of its edge.
    expect(tunnelLightAt(room({ lateral: 15, reach: 19 }), 2, rules)).toBe(1);
    expect(tunnelLightAt(room({ lateral: 14, reach: 19 }), 2, rules)).toBeCloseTo(0.4, 12);
  });

  it('always dims the walls, however short the lid', () => {
    expect(tunnelLightAt(room({ lateral: 12.6, reach: 13 }), 3, rules)).toBeCloseTo(0.4, 12);
  });

  it('multiplies each corner’s colour by the light at it', () => {
    const positions = Float32Array.from([0, 0, 0, 100, 0, 0, 0, 8, 0]);
    const colours = Float32Array.from([0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.5, 0.6, 0.7]);
    // A tunnel along x up to 50 m, deep inside everywhere on it.
    dimColours(positions, colours, (x, y) => tunnelLightAt(x < 50 ? room() : null, y, rules));
    const wanted = [0.5 * 0.4, 0.6 * 0.4, 0.7 * 0.4, 0.5, 0.6, 0.7, 0.5, 0.6, 0.7];
    wanted.forEach((value, k) => expect(colours[k]).toBeCloseTo(value, 6));
  });
});
