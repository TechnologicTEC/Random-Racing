import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { shadowReach } from './nearShadows';

const cfg = config.render.shadows.near;

describe('shadowReach: how far from the camera trees, rocks and barriers cast their shadows', () => {
  it('reaches its shortest from a camera on the road, where shadows are seen up close', () => {
    expect(shadowReach(4, cfg)).toBe(cfg.reach[0]);
    expect(shadowReach(0, cfg)).toBe(cfg.reach[0]);
  });

  it('reaches further the higher the camera, never past its longest', () => {
    let last = 0;
    for (const height of [10, 40, 100, 200, 400, 800, 1600, 5000]) {
      const reach = shadowReach(height, cfg);
      expect(reach).toBeGreaterThanOrEqual(last);
      expect(reach).toBeLessThanOrEqual(cfg.reach[1]);
      last = reach;
    }
    expect(shadowReach(100, cfg)).toBeGreaterThan(cfg.reach[0]);
    expect(shadowReach(5000, cfg)).toBe(cfg.reach[1]);
  });

  it('treats a camera below the ground (as a close view can be) as one on it', () => {
    expect(shadowReach(-20, cfg)).toBe(cfg.reach[0]);
  });
});
