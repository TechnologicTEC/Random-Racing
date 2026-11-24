import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { makeInput } from '../sim/input';
import { padMenu, padPresses, padToInput } from './gamepad';

const cfg = config.input;

/** The buttons of a standard pad, all up, with some pressed by number. */
function buttons(pressed: Record<number, number> = {}): number[] {
  return Array.from({ length: 17 }, (_, i) => pressed[i] ?? 0);
}

describe('padToInput', () => {
  it('gives nothing pressed for a pad at rest', () => {
    expect(padToInput([0, 0, 0, 0], buttons(), cfg)).toEqual({ throttle: 0, brake: 0, steer: 0, drift: false, reset: false });
  });

  it('accelerates with the right trigger and brakes with the left', () => {
    expect(padToInput([0, 0, 0, 0], buttons({ 7: 1 }), cfg).throttle).toBe(1);
    expect(padToInput([0, 0, 0, 0], buttons({ 6: 1 }), cfg).brake).toBe(1);
  });

  it('gives a trigger half way down as 128 of 255', () => {
    expect(makeInput(padToInput([0, 0, 0, 0], buttons({ 7: 0.5 }), cfg)).throttle).toBe(128);
    expect(makeInput(padToInput([0, 0, 0, 0], buttons({ 6: 0.5 }), cfg)).brake).toBe(128);
  });

  it('reads a stick inside the dead zone as centred', () => {
    expect(padToInput([cfg.deadZone, 0, 0, 0], buttons(), cfg).steer).toBe(0);
    expect(padToInput([-cfg.deadZone, 0, 0, 0], buttons(), cfg).steer).toBe(0);
    expect(padToInput([0.1, 0, 0, 0], buttons(), cfg).steer).toBe(0);
  });

  it('stretches the rest of the stick to reach full at the end', () => {
    expect(padToInput([0.575, 0, 0, 0], buttons(), cfg).steer).toBeCloseTo(0.5, 12);
    expect(padToInput([1, 0, 0, 0], buttons(), cfg).steer).toBe(1);
  });

  it('mirrors left and right exactly', () => {
    for (const x of [0.2, 0.4, 0.575, 0.8, 1]) {
      expect(padToInput([-x, 0, 0, 0], buttons(), cfg).steer).toBe(-padToInput([x, 0, 0, 0], buttons(), cfg).steer);
    }
  });

  it('drifts with the right bumper and resets with Back', () => {
    expect(padToInput([0, 0, 0, 0], buttons({ 5: 1 }), cfg).drift).toBe(true);
    expect(padToInput([0, 0, 0, 0], buttons({ 8: 1 }), cfg).reset).toBe(true);
  });

  it('copes with a pad that reports fewer axes or buttons', () => {
    expect(padToInput([], [], cfg)).toEqual({ throttle: 0, brake: 0, steer: 0, drift: false, reset: false });
  });
});

describe('padMenu (M4.4)', () => {
  it('gives nothing for a pad at rest', () => {
    expect(padMenu([0, 0, 0, 0], buttons())).toEqual({ up: false, down: false, confirm: false, back: false });
  });

  it('moves up and down on the D-pad', () => {
    expect(padMenu([0, 0, 0, 0], buttons({ 12: 1 }))).toMatchObject({ up: true, down: false });
    expect(padMenu([0, 0, 0, 0], buttons({ 13: 1 }))).toMatchObject({ up: false, down: true });
  });

  it('moves up and down on the left stick pushed over half way, up being negative', () => {
    expect(padMenu([0, -0.6, 0, 0], buttons())).toMatchObject({ up: true, down: false });
    expect(padMenu([0, 0.6, 0, 0], buttons())).toMatchObject({ up: false, down: true });
    expect(padMenu([0, 0.4, 0, 0], buttons())).toMatchObject({ up: false, down: false });
  });

  it('picks with A and goes back with B', () => {
    expect(padMenu([0, 0, 0, 0], buttons({ 0: 1 }))).toMatchObject({ confirm: true, back: false });
    expect(padMenu([0, 0, 0, 0], buttons({ 1: 1 }))).toMatchObject({ confirm: false, back: true });
  });
});

describe('padPresses', () => {
  it('gives Y for the camera and Start for pause, which are for the page', () => {
    expect(padPresses(buttons({ 3: 1 }))).toEqual({ camera: true, pause: false });
    expect(padPresses(buttons({ 9: 1 }))).toEqual({ camera: false, pause: true });
    expect(padPresses(buttons())).toEqual({ camera: false, pause: false });
  });
});
