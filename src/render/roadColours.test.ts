import { describe, expect, it } from 'vitest';
import { ROAD_MATERIAL } from '../gen/road/ribbon';
import { ROAD, toLinear } from './palette';
import { roadColours } from './roadColours';

describe('roadColours', () => {
  const materials = Uint8Array.from([ROAD_MATERIAL.asphalt, ROAD_MATERIAL.line, ROAD_MATERIAL.shoulder, ROAD_MATERIAL.asphalt]);
  const colours = roadColours(materials);
  const at = (vertex: number): number[] => [...colours.slice(vertex * 3, vertex * 3 + 3)];

  it('gives three colour values per vertex', () => {
    expect(colours).toBeInstanceOf(Float32Array);
    expect(colours).toHaveLength(12);
  });

  it('makes asphalt dark grey and paint nearly white', () => {
    const [ar, ag, ab] = at(0) as [number, number, number];
    expect(Math.max(ar, ag, ab) - Math.min(ar, ag, ab)).toBeLessThan(0.02);
    expect(ar).toBeLessThan(0.12);
    const [lr, lg, lb] = at(1) as [number, number, number];
    expect(Math.min(lr, lg, lb)).toBeGreaterThan(0.7);
  });

  it('uses the palette, converted to linear light', () => {
    expect(at(2)[0]).toBeCloseTo(toLinear(ROAD.shoulder[0]), 6);
    expect(at(3)).toEqual(at(0));
  });

  it('paints an unknown material bright pink, so a mistake is easy to spot', () => {
    const [r, g, b] = [...roadColours(Uint8Array.from([250]))] as [number, number, number];
    expect(r).toBeGreaterThan(0.8);
    expect(g).toBeLessThan(0.2);
    expect(b).toBeGreaterThan(0.5);
  });
});
