import type { RespawnConfig } from '../config';
import type { Vec3 } from './quat';

/** What started a respawn's wait: the sea, the map's edge or a fall through it, landing upside down, or being stuck. */
export type RespawnWhy = 'none' | 'water' | 'lost' | 'flipped' | 'stuck';

/** Each reason as a number for the fingerprint, in a fixed order. */
export const RESPAWN_REASONS: readonly RespawnWhy[] = ['none', 'water', 'lost', 'flipped', 'stuck'];

/** What the simulation remembers about bringing the car back. All in steps; in the fingerprint and the snapshot. */
export interface RespawnState {
  /** Steps of the wait still to go before the car is put back; 0 with no wait. */
  waitLeft: number;
  /** Steps in a row with the car's roof-up under `flipped.roofUp`. */
  flippedFor: number;
  /** Steps in a row with a pedal down and the car slower than `stuck.speed`. */
  stuckFor: number;
  /** What started the wait under way; 'none' with no wait. */
  why: RespawnWhy;
  /** The step on which the car was last put back, or -1. For drawing the fade back from white. */
  placedAt: number;
  /** How many times the car has been put back. */
  respawns: number;
}

export const NO_RESPAWN: RespawnState = Object.freeze({ waitLeft: 0, flippedFor: 0, stuckFor: 0, why: 'none', placedAt: -1, respawns: 0 });

/** The respawn's times in whole steps. */
export interface RespawnSteps {
  delay: number;
  flipped: number;
  stuck: number;
}

export function respawnSteps(rules: RespawnConfig, stepsPerSecond: number): RespawnSteps {
  return {
    delay: Math.round(rules.delay * stepsPerSecond),
    flipped: Math.round(rules.flipped.time * stepsPerSecond),
    stuck: Math.round(rules.stuck.time * stepsPerSecond),
  };
}

/** The car after a step, as the respawn rules see it. */
export interface CarSeen {
  /** Where the body's middle is. */
  position: Vec3;
  /** The up of its roof against straight up: 1 upright, 0 on its side, -1 upside down. */
  roofUp: number;
  /** Its speed, in metres per second, every way. */
  speed: number;
  /** Whether the throttle or the brake is down. */
  pedal: boolean;
}

/**
 * The respawn state after a step with no wait under way: the counts of steps flipped and stuck moved on, and a wait of
 * `delay` started if anything calls for one, its reason kept. The sea and the map's edge count only on an island.
 *
 * @param tile half the width of the island's tile (the map), or null on a plain test ground with no sea
 */
export function watchCar(state: RespawnState, car: CarSeen, tile: number | null, rules: RespawnConfig, steps: RespawnSteps): RespawnState {
  const flippedFor = car.roofUp < rules.flipped.roofUp ? state.flippedFor + 1 : 0;
  const stuckFor = car.pedal && car.speed < rules.stuck.speed ? state.stuckFor + 1 : 0;
  let why: RespawnWhy = 'none';
  if (tile !== null) {
    const out = Math.max(Math.abs(car.position.x), Math.abs(car.position.z));
    if (out >= tile - rules.edge || car.position.y <= -rules.deep) why = 'lost';
    else if (car.position.y <= -rules.waterDepth) why = 'water';
  }
  if (why === 'none' && flippedFor >= steps.flipped) why = 'flipped';
  if (why === 'none' && stuckFor >= steps.stuck) why = 'stuck';
  if (why === 'none') return { ...state, flippedFor, stuckFor };
  return { ...state, waitLeft: steps.delay, flippedFor: 0, stuckFor: 0, why };
}
