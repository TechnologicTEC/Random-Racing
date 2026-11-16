import { describe, expect, it } from 'vitest';
import { mergeInputs } from './merge';

describe('mergeInputs', () => {
  it('takes the larger of each pedal', () => {
    const merged = mergeInputs({ throttle: 0.3, brake: 1 }, { throttle: 0.8, brake: 0.2 });
    expect(merged.throttle).toBe(0.8);
    expect(merged.brake).toBe(1);
  });

  it('takes the steering further from the middle, whichever way it points', () => {
    expect(mergeInputs({ steer: 0.4 }, { steer: -0.7 }).steer).toBe(-0.7);
    expect(mergeInputs({ steer: -0.2 }, { steer: 0.5 }).steer).toBe(0.5);
    expect(mergeInputs({ steer: 1 }, { steer: 0 }).steer).toBe(1);
  });

  it('presses a button if either device presses it', () => {
    expect(mergeInputs({ drift: true }, { drift: false }).drift).toBe(true);
    expect(mergeInputs({}, { reset: true }).reset).toBe(true);
    expect(mergeInputs({}, {}).drift).toBe(false);
  });

  it('treats anything left out as not pressed', () => {
    expect(mergeInputs({}, {})).toEqual({ throttle: 0, brake: 0, steer: 0, drift: false, reset: false });
  });

  it('gives the same answer either way round', () => {
    const a = { throttle: 0.5, steer: -0.3, drift: true };
    const b = { brake: 0.25, steer: 0.6 };
    expect(mergeInputs(a, b)).toEqual(mergeInputs(b, a));
  });
});
