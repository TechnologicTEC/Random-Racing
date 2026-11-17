import type { Page } from '@playwright/test';
import { config } from '../src/config';

/**
 * Browser test helper: brings the car on the page into a slide that has
 * charged `tier`, with `drive.run`. Holding one input, a slide long enough
 * for tier 3 (3 s) runs off the road, and on some islands into a wall or a
 * tree, which ends it. So it tries several run-ups and both sides, from the
 * start line each time, until one slide reaches the tier.
 *
 * @returns whether a slide reached the tier
 */
export async function slideTo(page: Page, tier: 1 | 2 | 3): Promise<boolean> {
  const perSecond = config.sim.stepsPerSecond;
  // A few steps past the tier, so it is safely reached.
  const steps = Math.round(config.car.drift.tiers[tier - 1] * perSecond) + 5;
  return page.evaluate(
    ({ steps, tier }) => {
      const drive = window.seedCircuit.drive!;
      // The run-ups and sticks that suit most islands first, so most slides are found at once.
      for (const runUp of [120, 240, 60, 180, 360]) {
        for (const stick of [0, 1, -1]) {
          for (const dir of [-1, 1]) {
            drive.reset();
            drive.run(runUp, { throttle: 1 });
            drive.run(1, { throttle: 1, drift: true, steer: dir });
            // The stick in the middle, away from the corner for the widest slide, or into it for the tightest.
            const state = drive.run(steps - 1, { throttle: 1, drift: true, steer: -dir * stick });
            if (state.drift.phase === 'slide' && state.drift.tier === tier) return true;
          }
        }
      }
      return false;
    },
    { steps, tier },
  );
}

/** Lets go of the drift button for a few steps, with the throttle down: the boost's flame shows. */
export async function letGo(page: Page, steps = 10): Promise<void> {
  await page.evaluate((count) => window.seedCircuit.drive!.run(count, { throttle: 1 }), steps);
}
