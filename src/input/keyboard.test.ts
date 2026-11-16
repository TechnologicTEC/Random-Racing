import { describe, expect, it } from 'vitest';
import { keysToInput } from './keyboard';

const press = (...codes: string[]) => keysToInput(new Set(codes));

describe('keysToInput', () => {
  it('gives nothing pressed when no key is held', () => {
    expect(press()).toEqual({ throttle: 0, brake: 0, steer: 0, drift: false, reset: false });
  });

  it('accelerates with W or the up arrow', () => {
    expect(press('KeyW').throttle).toBe(1);
    expect(press('ArrowUp').throttle).toBe(1);
  });

  it('brakes and reverses with S or the down arrow', () => {
    expect(press('KeyS').brake).toBe(1);
    expect(press('ArrowDown').brake).toBe(1);
  });

  it('steers left with A or the left arrow, and right with D or the right arrow', () => {
    expect(press('KeyA').steer).toBe(-1);
    expect(press('ArrowLeft').steer).toBe(-1);
    expect(press('KeyD').steer).toBe(1);
    expect(press('ArrowRight').steer).toBe(1);
  });

  it('steers straight when left and right are held together', () => {
    expect(press('KeyA', 'KeyD').steer).toBe(0);
    expect(press('ArrowLeft', 'KeyD').steer).toBe(0);
  });

  it('drifts with Space or either Shift', () => {
    expect(press('Space').drift).toBe(true);
    expect(press('ShiftLeft').drift).toBe(true);
    expect(press('ShiftRight').drift).toBe(true);
  });

  it('resets with R', () => {
    expect(press('KeyR').reset).toBe(true);
  });

  it('holds throttle, brake, steering and drift at once', () => {
    expect(press('KeyW', 'KeyS', 'KeyD', 'Space')).toEqual({ throttle: 1, brake: 1, steer: 1, drift: true, reset: false });
  });

  it('ignores keys that are for the page, not the car', () => {
    expect(press('KeyC', 'KeyN', 'Escape', 'KeyL')).toEqual(press());
  });
});
