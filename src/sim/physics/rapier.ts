import RAPIER from '@dimforge/rapier3d-deterministic-compat';

/**
 * The physics engine: Rapier's cross-platform deterministic build, which gives
 * the same result for the same inputs on every computer and in every browser
 * (pillar 5). Only src/sim/physics imports it.
 */
export type Rapier = typeof RAPIER;

/** The version pinned in package.json. A test checks the engine that loads is this one. */
export const RAPIER_VERSION = '0.21.0';

let loading: Promise<Rapier> | null = null;

/** Loads the engine. It is loaded once; every later call gets the same one. */
export function loadRapier(): Promise<Rapier> {
  loading ??= RAPIER.init().then(() => RAPIER);
  return loading;
}
