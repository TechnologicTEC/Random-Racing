import type { ShadowConfig } from '../config';

/**
 * How far from the camera the near shadows (trees, rocks, barriers, the gate)
 * are drawn, in metres. Close to the ground the two shadow maps are spent on
 * the ground nearby, where shadows are seen up close; from high above they
 * stretch to cover what the camera sees, more coarsely.
 *
 * @param height the camera's height over the ground (or sea) under it, in metres
 */
export function shadowReach(height: number, cfg: ShadowConfig['near']): number {
  const grown = cfg.reach[0] + (Math.max(0, height) - cfg.from) * cfg.perMetre;
  return Math.min(cfg.reach[1], Math.max(cfg.reach[0], grown));
}
