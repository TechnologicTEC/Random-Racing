import { beforeAll, describe, expect, it } from 'vitest';
import { config, type GameConfig } from '../config';
import { loadRapier, type Rapier } from '../sim/physics/rapier';
import { createSimOn } from '../sim/sim';
import { hold } from '../testing/simDriving';
import { flatGround, poseOn } from '../testing/testGrounds';
import { needsRebuild, rebuildSim, setTuned, tunedCopy, tuningFields, tuningText } from './tuning';

const pick = (cfg: GameConfig) => ({
  car: { engine: cfg.car.engine, steer: cfg.car.steer, grip: cfg.car.grip, drift: cfg.car.drift, boost: cfg.car.boost },
  camera: { chase: cfg.camera.chase },
});

/** Every number in a block, nested blocks and lists included, by its path. */
function numbersIn(value: unknown, path: string, into: string[]): string[] {
  if (typeof value === 'number') into.push(path);
  else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) numbersIn(inner, `${path}.${key}`, into);
  return into;
}

describe('tuningFields', () => {
  const fields = tuningFields(config);

  it('gives a slider for every number of the engine, steering, grip, drift, boost and chase camera, and nothing else', () => {
    const want = [
      ...numbersIn(config.car.engine, 'car.engine', []),
      ...numbersIn(config.car.steer, 'car.steer', []),
      ...numbersIn(config.car.grip, 'car.grip', []),
      ...numbersIn(config.car.drift, 'car.drift', []),
      ...numbersIn(config.car.boost, 'car.boost', []),
      ...numbersIn(config.camera.chase, 'camera.chase', []),
    ];
    expect(fields.map((field) => field.path)).toEqual(want);
    expect(want).toContain('car.engine.topSpeed');
    expect(want).toContain('car.drift.tiers.2');
    expect(want).toContain('car.drift.hop.height');
    expect(want).toContain('camera.chase.swing');
    // The body, mass, wheels and springs are not on the panel: a snapshot carries the old body.
    expect(fields.some((field) => /^car\.(body|mass|wheels|suspension)/.test(field.path))).toBe(false);
  });

  it('runs each slider from 0 to three times its starting value, in round steps the starting value lies on', () => {
    for (const field of fields) {
      expect(field.min).toBe(0);
      expect(field.max).toBeCloseTo(3 * field.value, 9);
      expect(field.step).toBeGreaterThan(0);
      // About a hundredth of the value's own size: 0.1 for 30, 0.001 for 0.4.
      expect(field.step).toBeLessThanOrEqual(Math.abs(field.value) / 10 + 1e-12);
      expect(Math.abs(field.value / field.step - Math.round(field.value / field.step))).toBeLessThan(1e-6);
    }
    const top = fields.find((field) => field.path === 'car.engine.topSpeed')!;
    expect(top).toMatchObject({ value: config.car.engine.topSpeed, min: 0, step: 0.1, group: 'car.engine' });
  });
});

describe('setTuned and tunedCopy', () => {
  it('changes the copy, never the shared config', () => {
    const before = config.car.engine.topSpeed;
    const tiersBefore = [...config.car.drift.tiers];
    const [first, , third] = tiersBefore;
    const tuned = tunedCopy(config);
    setTuned(tuned, 'car.engine.topSpeed', 20);
    setTuned(tuned, 'car.drift.tiers.1', 2.5);
    setTuned(tuned, 'camera.chase.swing', 0.2);
    expect(tuned.car.engine.topSpeed).toBe(20);
    expect(tuned.car.drift.tiers).toEqual([first, 2.5, third]);
    expect(tuned.camera.chase.swing).toBe(0.2);
    expect(config.car.engine.topSpeed).toBe(before);
    expect(config.car.drift.tiers).toEqual(tiersBefore);
    expect(config.camera.chase.swing).toBe(0.12);
  });

  it('refuses a path that is not on the panel', () => {
    const tuned = tunedCopy(config);
    expect(() => setTuned(tuned, 'car.mass', 100)).toThrow();
    expect(() => setTuned(tuned, 'car.engine.nothing', 1)).toThrow();
  });

  it('says which changes need a new simulation: the car ones, not the camera ones', () => {
    expect(needsRebuild('car.engine.topSpeed')).toBe(true);
    expect(needsRebuild('car.drift.tiers.0')).toBe(true);
    expect(needsRebuild('camera.chase.back')).toBe(false);
  });
});

describe('tuningText', () => {
  it('gives the blocks as text to paste into config.ts, which reads back as the same values', () => {
    const tuned = tunedCopy(config);
    setTuned(tuned, 'car.engine.topSpeed', 20);
    setTuned(tuned, 'car.drift.angle', 0.1 + 0.2);
    const text = tuningText(tuned);
    expect(text).toContain('topSpeed: 20,');
    // Rounded so float noise does not show.
    expect(text).toContain('angle: 0.3,');
    expect(text).toContain(`tiers: [${config.car.drift.tiers.join(', ')}],`);
    const read = new Function(`return {${text}};`)() as ReturnType<typeof pick>;
    const want = pick(tuned);
    want.car.drift = { ...want.car.drift, angle: 0.3 };
    expect(read).toEqual(JSON.parse(JSON.stringify(want)));
  });
});

describe('rebuildSim: a new simulation with other car settings, carrying on from where the old one was', () => {
  let rapier: Rapier;
  beforeAll(async () => {
    rapier = await loadRapier();
  });

  it('keeps the car where it was and gives it the new settings', () => {
    const ground = flatGround();
    const start = poseOn(ground, 0, 50, { x: 0, z: -1 }, config);
    const old = createSimOn(rapier, ground.course, config, start);
    hold(old, { throttle: 1 }, 6);
    const before = old.state();
    const tuned = tunedCopy(config);
    setTuned(tuned, 'car.engine.topSpeed', 20);
    const next = rebuildSim(old, (cfg) => createSimOn(rapier, ground.course, cfg, start), tuned);
    expect(next.state().position).toEqual(before.position);
    expect(next.state().step).toBe(before.step);
    // Above its new top speed it sheds down to it.
    hold(next, { throttle: 1 }, 4);
    expect(next.state().speed).toBeCloseTo(20, 2);
    next.free();
  });
});
