import type { GameConfig } from '../config';
import type { Sim } from '../sim/sim';

/**
 * The tuning panel's sums (T while driving; `tuningPanel.ts` is its page
 * side). The panel works on its own copy of the config, so the shared one,
 * and every fingerprint made from it, never change.
 */

/** The blocks on the panel, in order. The body, mass, wheels and springs are not: a snapshot carries the old body. */
const BLOCKS = ['car.engine', 'car.steer', 'car.grip', 'car.drift', 'car.boost', 'camera.chase'] as const;

/** One slider. */
export interface TuningField {
  /** Where the number is in the config, as dotted names: `car.drift.tiers.1` is the second tier. */
  path: string;
  /** The block it belongs to, for the panel's headings. */
  group: string;
  /** Its value in the config the fields were made from. */
  value: number;
  min: number;
  max: number;
  step: number;
}

/** Follows a dotted path from the config's top. */
function at(cfg: GameConfig, path: string): unknown {
  return path.split('.').reduce<unknown>((into, key) => (into && typeof into === 'object' ? (into as Record<string, unknown>)[key] : undefined), cfg);
}

/**
 * A slider for every number in the panel's blocks, nested blocks and lists
 * included, in the config's own order. Each runs from 0 to three times its
 * value, in steps of about a hundredth of the value's size (0.1 for 30, 0.001
 * for 0.4), which the value itself lies on.
 */
export function tuningFields(cfg: GameConfig): TuningField[] {
  const fields: TuningField[] = [];
  const walk = (value: unknown, path: string, group: string): void => {
    if (typeof value === 'number') {
      const size = Math.abs(value);
      const step = size > 0 ? Math.pow(10, Math.floor(Math.log10(size)) - 2) : 0.01;
      fields.push({ path, group, value, min: 0, max: size > 0 ? 3 * size : 1, step });
    } else if (value && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) walk(inner, `${path}.${key}`, group);
    }
  };
  for (const block of BLOCKS) walk(at(cfg, block), block, block);
  return fields;
}

/** A copy of the config for the panel to change. */
export function tunedCopy(cfg: GameConfig): GameConfig {
  return structuredClone(cfg);
}

/** Sets one of the panel's numbers in a copy of the config. Throws for a path that is not on the panel. */
export function setTuned(tuned: GameConfig, path: string, value: number): void {
  if (!tuningFields(tuned).some((field) => field.path === path)) throw new Error(`${path} is not on the tuning panel`);
  const keys = path.split('.');
  const last = keys.pop()!;
  (at(tuned, keys.join('.')) as Record<string, number>)[last] = value;
}

/** Whether a change needs a new simulation (the car's numbers), or is read afresh each frame (the camera's). */
export function needsRebuild(path: string): boolean {
  return path.startsWith('car.');
}

/** A number as written in config.ts: rounded to ten figures, so float noise (0.30000000000000004) does not show. */
const written = (value: number): string => String(Number(value.toPrecision(10)));

function literal(value: unknown): string {
  if (typeof value === 'number') return written(value);
  if (Array.isArray(value)) return `[${value.map(literal).join(', ')}]`;
  if (value && typeof value === 'object') return `{ ${Object.entries(value).map(([key, inner]) => `${key}: ${literal(inner)}`).join(', ')} }`;
  return JSON.stringify(value);
}

/**
 * The panel's blocks as text to paste over the same lines of `config.ts`:
 * `car: { engine, steer, grip, drift, boost }` and `camera: { chase }`.
 */
export function tuningText(tuned: GameConfig): string {
  const lines: string[] = [];
  for (const top of ['car', 'camera'] as const) {
    lines.push(`${top}: {`);
    for (const block of BLOCKS.filter((name) => name.startsWith(`${top}.`))) {
      lines.push(`  ${block.slice(top.length + 1)}: ${literal(at(tuned, block))},`);
    }
    lines.push('},');
  }
  return lines.join('\n');
}

/**
 * A new simulation built with other settings, carrying on from where the old
 * one was: a snapshot of the old, restored into the new. The old is freed.
 *
 * @param build makes a simulation of the same course with the settings given
 */
export function rebuildSim(old: Sim, build: (cfg: GameConfig) => Sim, tuned: GameConfig): Sim {
  const saved = old.snapshot();
  const next = build(tuned);
  next.restore(saved);
  old.free();
  return next;
}
