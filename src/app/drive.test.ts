import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { NEUTRAL_INPUT } from '../sim/input';
import type { CarState } from '../sim/sim';
import { advance, blendState, driftReadout, mainSurface, placeReadout, respawnFade } from './drive';
import { NO_RESPAWN } from '../sim/respawn';

const cfg = config.sim;
const STEP = 1 / cfg.stepsPerSecond;

describe('advance', () => {
  it('takes 60 steps a second, within one, over 1,000 frames at 144 a second', () => {
    let carried = 0;
    let steps = 0;
    for (let k = 0; k < 1000; k++) {
      const next = advance(carried, 1 / 144, cfg);
      steps += next.steps;
      carried = next.carried;
    }
    expect(Math.abs(steps - (1000 / 144) * 60)).toBeLessThanOrEqual(1);
  });

  it('takes 60 steps a second at 30 and 60 frames a second too', () => {
    for (const rate of [30, 60]) {
      let carried = 0;
      let steps = 0;
      for (let k = 0; k < rate * 10; k++) {
        const next = advance(carried, 1 / rate, cfg);
        steps += next.steps;
        carried = next.carried;
      }
      expect(Math.abs(steps - 600)).toBeLessThanOrEqual(1);
    }
  });

  it('takes at most five steps in one frame of a whole second, and carries nothing over', () => {
    expect(advance(0, 1, cfg)).toEqual({ steps: cfg.maxStepsPerFrame, carried: 0, blend: 0 });
    expect(advance(STEP * 0.9, 0.25, cfg)).toEqual({ steps: cfg.maxStepsPerFrame, carried: 0, blend: 0 });
  });

  it('carries the part of a step left over, and gives it as the blend', () => {
    const next = advance(0, STEP * 2.5, cfg);
    expect(next.steps).toBe(2);
    expect(next.carried).toBeCloseTo(STEP * 0.5, 12);
    expect(next.blend).toBeCloseTo(0.5, 9);
  });

  it('keeps the blend at least 0 and under 1', () => {
    let carried = 0;
    for (let k = 0; k < 5000; k++) {
      // Uneven frames, from a twentieth of a step to two and a half steps.
      const frame = STEP * (0.05 + ((k * 7919) % 100) / 40);
      const next = advance(carried, frame, cfg);
      expect(next.blend).toBeGreaterThanOrEqual(0);
      expect(next.blend).toBeLessThan(1);
      carried = next.carried;
    }
  });

  it('takes no step for a frame of no time, or a broken one', () => {
    expect(advance(0, 0, cfg).steps).toBe(0);
    expect(advance(0, -1, cfg)).toEqual({ steps: 0, carried: 0, blend: 0 });
    expect(advance(0, Number.NaN, cfg)).toEqual({ steps: 0, carried: 0, blend: 0 });
  });
});

/** A made-up car state, with every number set from `k`. */
function stateAt(k: number, rotation = { x: 0, y: 0, z: 0, w: 1 }): CarState {
  const v = (a: number) => ({ x: a * k, y: a * k + 1, z: a * k - 2 });
  return {
    position: v(1),
    rotation,
    velocity: v(3),
    spin: v(0.5),
    wheels: [0, 1, 2, 3].map((i) => ({ touching: k > 0, squash: 0.01 * k, surface: k > 0 ? ('road' as const) : null, at: v(i + 1) })),
    speed: 10 * k,
    drift: { phase: 'none', dir: 0, tier: 0, angle: 0, hop: 0, boostLeft: 0, boostTier: 0 },
    top: 30,
    step: k,
    input: NEUTRAL_INPUT,
    touch: null,
    progress: { near: k, along: 2 * k, off: 0.1 * k, next: k, passed: k },
    respawn: { waitLeft: 0, flippedFor: 0, stuckFor: 0, why: 'none', placedAt: -1, respawns: k },
  };
}

/** A turn of `angle` radians about the upright axis. */
const yaw = (angle: number) => ({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });

describe('blendState', () => {
  it('gives the two states exactly at a blend of 0 and of 1', () => {
    const before = stateAt(1, yaw(0.2));
    const after = stateAt(2, yaw(0.5));
    const atStart = blendState(before, after, 0);
    for (const key of ['position', 'rotation', 'velocity', 'spin', 'speed'] as const) expect(atStart[key]).toEqual(before[key]);
    expect(atStart.wheels.map((wheel) => wheel.at)).toEqual(before.wheels.map((wheel) => wheel.at));
    expect(blendState(before, after, 1)).toEqual(after);
  });

  it('moves places and speeds in a straight line between the two', () => {
    const mid = blendState(stateAt(1), stateAt(3), 0.25);
    expect(mid.position.x).toBeCloseTo(1.5, 12);
    expect(mid.velocity.z).toBeCloseTo(4.5 - 2, 12);
    expect(mid.wheels[2]!.at.x).toBeCloseTo(4.5, 12);
    expect(mid.speed).toBeCloseTo(15, 12);
    // What is not a number to blend comes from the later state.
    expect(mid.step).toBe(3);
  });

  it('turns half way between two turns, and keeps the turn one long', () => {
    const mid = blendState(stateAt(1, yaw(0.2)), stateAt(1, yaw(0.6)), 0.5).rotation;
    const half = yaw(0.4);
    expect(mid.y).toBeCloseTo(half.y, 3);
    expect(mid.w).toBeCloseTo(half.w, 3);
    expect(Math.hypot(mid.x, mid.y, mid.z, mid.w)).toBeCloseTo(1, 12);
  });

  it('turns the short way round when the engine gives the same turn with the opposite sign', () => {
    const a = yaw(0.3);
    const b = yaw(0.3);
    const flipped = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
    const mid = blendState(stateAt(1, a), stateAt(1, flipped), 0.5).rotation;
    // q and -q are the same turn: half way between them is that turn, not a turn through the long way round.
    const sameWay = Math.sign(mid.w) === Math.sign(a.w) ? 1 : -1;
    expect(mid.y * sameWay).toBeCloseTo(a.y, 9);
    expect(mid.w * sameWay).toBeCloseTo(a.w, 9);
  });
});

describe('mainSurface', () => {
  const wheel = (surface: 'road' | 'kerb' | 'grass' | 'sand' | null) => ({ touching: surface !== null, squash: 0, surface, at: { x: 0, y: 0, z: 0 } });

  it('names what most wheels stand on', () => {
    expect(mainSurface([wheel('road'), wheel('road'), wheel('grass'), wheel('road')])).toBe('road');
    expect(mainSurface([wheel('grass'), wheel('sand'), wheel('grass'), wheel('grass')])).toBe('grass');
  });

  it('leaves out wheels in the air', () => {
    expect(mainSurface([wheel(null), wheel(null), wheel('kerb'), wheel(null)])).toBe('kerb');
  });

  it('gives null with every wheel in the air', () => {
    expect(mainSurface([wheel(null), wheel(null), wheel(null), wheel(null)])).toBeNull();
  });

  it('breaks a tie the same way every time: the road first', () => {
    expect(mainSurface([wheel('grass'), wheel('road'), wheel('grass'), wheel('road')])).toBe('road');
    expect(mainSurface([wheel('road'), wheel('grass'), wheel('road'), wheel('grass')])).toBe('road');
  });
});

describe('driftReadout', () => {
  const none = { phase: 'none', dir: 0, tier: 0, angle: 0, hop: 0, boostLeft: 0, boostTier: 0 } as const;

  it('shows no dot and no boost with no drift', () => {
    expect(driftReadout(none)).toEqual({ tier: 0, colour: null, boost: '' });
  });

  it('shows a dot in the colour of the tier reached while sliding', () => {
    expect(driftReadout({ ...none, phase: 'slide', tier: 1 })).toEqual({ tier: 1, colour: 'rgb(64, 166, 255)', boost: '' });
    expect(driftReadout({ ...none, phase: 'slide', tier: 3 }).colour).toBe('rgb(179, 89, 255)');
  });

  it('shows the boost left, to a tenth of a second, in the colour of its tier', () => {
    expect(driftReadout({ ...none, boostLeft: 0.6, boostTier: 2 })).toEqual({ tier: 2, colour: 'rgb(255, 153, 31)', boost: 'boost 0.6 s' });
    expect(driftReadout({ ...none, boostLeft: 1 / 60, boostTier: 1 }).boost).toBe('boost 0.0 s');
  });
});

describe('respawnFade', () => {
  const fade = config.render.respawnFade;
  const perSecond = config.sim.stepsPerSecond;
  const fadeIn = Math.round(fade.in * perSecond);
  const fadeOut = Math.round(fade.out * perSecond);

  it('is clear with no wait and no respawn', () => {
    expect(respawnFade(NO_RESPAWN, 500, fade, perSecond)).toBe(0);
  });

  it('stays clear through the start of a wait, then rises evenly to white over its last 0.3 s', () => {
    const waiting = (waitLeft: number) => respawnFade({ ...NO_RESPAWN, waitLeft, why: 'water' }, 100, fade, perSecond);
    expect(waiting(60)).toBe(0);
    expect(waiting(fadeIn + 1)).toBe(0);
    expect(waiting(fadeIn)).toBeCloseTo(1 / fadeIn, 9);
    expect(waiting(Math.round(fadeIn / 2))).toBeGreaterThan(0.4);
    expect(waiting(1)).toBe(1);
    for (let left = fadeIn; left > 1; left--) expect(waiting(left - 1)).toBeGreaterThan(waiting(left));
  });

  it('is white on the step the car is put back, and clears evenly over 0.4 s', () => {
    const placed = { ...NO_RESPAWN, placedAt: 200, respawns: 1 };
    // The state after the step of the respawn has the step count one on.
    expect(respawnFade(placed, 201, fade, perSecond)).toBe(1);
    expect(respawnFade(placed, 201 + fadeOut / 2, fade, perSecond)).toBeCloseTo(0.5, 9);
    expect(respawnFade(placed, 201 + fadeOut, fade, perSecond)).toBe(0);
    expect(respawnFade(placed, 900, fade, perSecond)).toBe(0);
  });
});

describe('placeReadout', () => {
  const progress = { near: 100, along: 1234.5, off: 0, next: 13, passed: 13 };

  it('gives the place on the lap in kilometres, and the checkpoint to pass next', () => {
    expect(placeReadout(progress, 2610, 26)).toBe('1.23 of 2.61 km · next checkpoint 13 of 25');
  });

  it('calls checkpoint 0 the line', () => {
    expect(placeReadout({ ...progress, along: 2606, next: 0 }, 2610, 26)).toBe('2.61 of 2.61 km · next the line');
  });

  it('gives nothing without a lap', () => {
    expect(placeReadout(null, 2610, 26)).toBe('');
  });
});
