import { describe, expect, it } from 'vitest';
import { config, type GameConfig } from '../config';
import { hashHandling, packRun, RECORD_FORMAT, unpackRun, type RunRecord } from './record';

/** A made-up record: small, but with every field filled and values that test the edges of their types. */
function madeUp(chosen: Partial<RunRecord> = {}): RunRecord {
  const inputs = Uint32Array.from([0, 255, 0x3ffffff, 0x1000000 + 0x7f0000 + 200, 0x2000000]);
  const places = Float32Array.from([1.5, -2.25, 3e3, 0, 0.7071, 0, 0.7071, -812.125, 14.5, 999.75, 0.1, 0.2, 0.3, 0.927]);
  return {
    format: RECORD_FORMAT,
    seed: 4294967295,
    generator: 0,
    driver: 'player',
    every: 6,
    handling: hashHandling(config),
    inputs,
    places,
    laps: [3436.375, 3270.0001, 3270.5],
    splits: [1100.25, 1200, 1136.125, 1050, 1100, 1120.0001, 1000, 1135.5, 1135],
    total: 9976.8751,
    hash: 'a1b2c3d4',
    ...chosen,
  };
}

/** Every number in a block of the config, as its dotted path. */
function numberPaths(value: unknown, path: string): string[] {
  if (typeof value === 'number') return [path];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, inner]) => numberPaths(inner, `${path}.${key}`));
  return [];
}

/** A copy of the config with one number changed. */
function changed(path: string): GameConfig {
  const copy = structuredClone(config);
  const keys = path.split('.');
  const last = keys.pop()!;
  const holder = keys.reduce<Record<string, unknown>>((into, key) => into[key] as Record<string, unknown>, copy as unknown as Record<string, unknown>);
  holder[last] = (holder[last] as number) * 1.5 + 1;
  return copy;
}

describe('the handling fingerprint (hashHandling)', () => {
  it('is eight hexadecimal digits and the same for the same config', () => {
    expect(hashHandling(config)).toMatch(/^[0-9a-f]{8}$/);
    expect(hashHandling(structuredClone(config))).toBe(hashHandling(config));
  });

  it('changes when any number of the car or the simulation changes', () => {
    const paths = [...numberPaths(config.car, 'car'), ...numberPaths(config.sim, 'sim')];
    expect(paths.length).toBeGreaterThan(60);
    const today = hashHandling(config);
    const unchanged = paths.filter((path) => hashHandling(changed(path)) === today);
    expect(unchanged).toEqual([]);
  });

  it('does not change when a drawing or camera number changes', () => {
    const today = hashHandling(config);
    for (const path of [...numberPaths(config.render.car, 'render.car'), ...numberPaths(config.camera, 'camera')]) {
      expect(hashHandling(changed(path)), path).toBe(today);
    }
  });

  it('does not depend on the order the keys were written in', () => {
    const reordered = { ...config, car: Object.fromEntries(Object.entries(config.car).reverse()) as unknown as GameConfig['car'] };
    expect(hashHandling(reordered)).toBe(hashHandling(config));
  });
});

describe('packing a run (packRun and unpackRun)', () => {
  it('gives back the same record, and the same bytes packed again', () => {
    const record = madeUp();
    const bytes = packRun(record);
    const back = unpackRun(bytes);
    expect(back).toEqual(record);
    expect(back.inputs).toBeInstanceOf(Uint32Array);
    expect(back.places).toBeInstanceOf(Float32Array);
    expect([...packRun(back)]).toEqual([...bytes]);
  });

  it("keeps the bot's driver and a record with no laps", () => {
    const record = madeUp({ driver: 'bot', laps: [], splits: [], total: 0 });
    expect(unpackRun(packRun(record))).toEqual(record);
  });

  it('is a short header and then the arrays: 4 bytes an input, 28 a place', () => {
    const record = madeUp();
    const arrays = record.inputs.length * 4 + record.places.length * 4 + (record.laps.length + record.splits.length + 1) * 8;
    expect(packRun(record).length - arrays).toBeLessThanOrEqual(48);
  });

  it('refuses bytes that are not a record, saying why', () => {
    const bytes = packRun(madeUp());
    expect(() => unpackRun(new Uint8Array(10))).toThrow(/too short/);
    const wrongMagic = bytes.slice();
    wrongMagic[0] = 0x58;
    expect(() => unpackRun(wrongMagic)).toThrow(/not a run record/);
    const wrongFormat = bytes.slice();
    wrongFormat[4] = RECORD_FORMAT + 1;
    expect(() => unpackRun(wrongFormat)).toThrow(/format/);
    expect(() => unpackRun(bytes.slice(0, bytes.length - 1))).toThrow(/length/);
    const longer = new Uint8Array(bytes.length + 4);
    longer.set(bytes);
    expect(() => unpackRun(longer)).toThrow(/length/);
  });

  it('refuses to pack a record whose places are not seven numbers each', () => {
    expect(() => packRun(madeUp({ places: new Float32Array(8) }))).toThrow(/seven/);
  });
});
