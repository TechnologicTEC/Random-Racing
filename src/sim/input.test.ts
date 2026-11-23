import { describe, expect, it } from 'vitest';
import { inputFractions, makeInput, NEUTRAL_INPUT, packInput, PEDAL_STEPS, STEER_STEPS, unpackInput, type InputRecord } from './input';

describe('makeInput', () => {
  it('turns pedals and steering into small whole numbers', () => {
    expect(makeInput({ throttle: 1, brake: 0, steer: 1, drift: true, reset: false })).toEqual({
      throttle: PEDAL_STEPS,
      brake: 0,
      steer: STEER_STEPS,
      drift: 1,
      reset: 0,
    });
    expect(makeInput({ throttle: 0, brake: 1, steer: -1, drift: false, reset: true })).toEqual({
      throttle: 0,
      brake: PEDAL_STEPS,
      steer: -STEER_STEPS,
      drift: 0,
      reset: 1,
    });
  });

  it('gives nothing pressed as the neutral record', () => {
    expect(makeInput({})).toEqual(NEUTRAL_INPUT);
    expect(NEUTRAL_INPUT).toEqual({ throttle: 0, brake: 0, steer: 0, drift: 0, reset: 0 });
  });

  it('holds values to their range, and treats a broken reading as nothing', () => {
    const record = makeInput({ throttle: 3, brake: -2, steer: -9 });
    expect(record.throttle).toBe(PEDAL_STEPS);
    expect(record.brake).toBe(0);
    expect(record.steer).toBe(-STEER_STEPS);
    expect(makeInput({ throttle: Number.NaN, steer: Number.NaN })).toEqual(NEUTRAL_INPUT);
  });

  it('rounds a half-pressed trigger and a half-turned stick to the nearest step', () => {
    const record = makeInput({ throttle: 0.5, steer: 0.5 });
    expect(record.throttle).toBe(Math.round(PEDAL_STEPS / 2));
    expect(record.steer).toBe(Math.round(STEER_STEPS / 2));
    expect(makeInput({ steer: -0.5 }).steer).toBe(-Math.round(STEER_STEPS / 2));
  });

  it('gives a keyboard at full lock and a stick at full lock exactly the same record', () => {
    const keyboard = makeInput({ throttle: 1, steer: -1 });
    const controller = makeInput({ throttle: 1.0000001, steer: -0.99999 * 1.00002 });
    expect(controller).toEqual(keyboard);
  });

  it('never gives a negative zero for a centred stick', () => {
    expect(Object.is(makeInput({ steer: -0.0001 }).steer, 0)).toBe(true);
  });
});

describe('inputFractions', () => {
  it('gives pedals from 0 to 1 and steering from -1 (left) to 1 (right)', () => {
    expect(inputFractions(makeInput({ throttle: 1, brake: 1, steer: 1 }))).toEqual({ throttle: 1, brake: 1, steer: 1 });
    expect(inputFractions(makeInput({ steer: -1 })).steer).toBe(-1);
    expect(inputFractions(NEUTRAL_INPUT)).toEqual({ throttle: 0, brake: 0, steer: 0 });
  });

  it('comes back within half a step of what was asked for', () => {
    for (const asked of [0.1, 0.25, 0.333, 0.7, 0.99]) {
      const got = inputFractions(makeInput({ throttle: asked, steer: -asked }));
      expect(Math.abs(got.throttle - asked)).toBeLessThanOrEqual(0.5 / PEDAL_STEPS);
      expect(Math.abs(got.steer + asked)).toBeLessThanOrEqual(0.5 / STEER_STEPS);
    }
  });
});

describe('packInput and unpackInput', () => {
  const samples: InputRecord[] = [
    NEUTRAL_INPUT,
    makeInput({ throttle: 1, brake: 1, steer: 1, drift: true, reset: true }),
    makeInput({ throttle: 0.3, steer: -1, drift: true }),
    makeInput({ brake: 0.8, steer: 0.02, reset: true }),
    makeInput({ steer: -0.01 }),
  ];

  it('packs a record into one whole number that fits in 32 bits, and gets the same record back', () => {
    for (const record of samples) {
      const packed = packInput(record);
      expect(Number.isInteger(packed)).toBe(true);
      expect(packed).toBeGreaterThanOrEqual(0);
      expect(packed).toBeLessThan(2 ** 32);
      expect(unpackInput(packed)).toEqual(record);
    }
  });

  it('packs nothing pressed as 0', () => {
    expect(packInput(NEUTRAL_INPUT)).toBe(0);
  });

  it('gives different records different numbers', () => {
    const packed = new Set(samples.map(packInput));
    expect(packed.size).toBe(samples.length);
  });

  it('gets every steering step back, left and right', () => {
    for (let steer = -STEER_STEPS; steer <= STEER_STEPS; steer++) {
      expect(unpackInput(packInput({ ...NEUTRAL_INPUT, steer })).steer).toBe(steer);
    }
  });
});
