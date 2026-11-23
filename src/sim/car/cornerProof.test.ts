import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../../gen';
import type { CornerSection, WorldResult } from '../../gen/types';
import { bestPass, pickCorners, slideCorners, type CornerPass, type CornerPick } from '../../testing/botDriver';
import { FIRST_SEEDS } from '../../testing/checkSeeds';
import { loadRapier, type Rapier } from '../physics/rapier';

/**
 * Step 9b, the corner proof: the evidence for the milestone's "drift-boost
 * works through every corner type". Three real corners each of hairpin,
 * sweeper, chicane and plain corner from seeds 1 to 20, a mountain seed among
 * each kind's three. From 40 m before the corner to 120 m after it, the bot
 * that slides through it is quicker than the best pass without a slide, with
 * every wheel on the road or a kerb and nothing touched. Each is the best of
 * the bot cornering on grip at 0.9, 1.0 or 1.1 of the steering's grip, since
 * the 120 m after a corner can hold another one that neither slides through.
 */
const KINDS: CornerSection['kind'][] = ['hairpin', 'sweeper', 'chicane', 'corner'];

let rapier: Rapier;
const picks: CornerPick[] = [];
const slid: (CornerPass | null)[] = [];
const grip: (CornerPass | null)[] = [];
beforeAll(async () => {
  rapier = await loadRapier();
  const all: CornerPick[] = [];
  for (const seed of FIRST_SEEDS) {
    const world: WorldResult = generateWorld(seed, config);
    const { sections } = world.track.candidates[world.track.winnerIndex]!;
    for (const corner of slideCorners(sections, config)) all.push({ seed, world, corner });
  }
  for (const kind of KINDS) picks.push(...pickCorners(all, kind));
  for (const pick of picks) {
    slid.push(bestPass(rapier, pick.world, pick.corner, config, true));
    grip.push(bestPass(rapier, pick.world, pick.corner, config, false));
  }
}, 600_000);

const name = (i: number): string => `seed ${picks[i]!.seed}, ${picks[i]!.corner.kind} of ${picks[i]!.corner.minRadius.toFixed(0)} m at sample ${picks[i]!.corner.startIndex}`;

describe('the corner proof (step 9b)', () => {
  it('takes three corners of each kind, a mountain seed among each three', () => {
    for (const kind of KINDS) {
      const three = picks.filter((pick) => pick.corner.kind === kind);
      expect(three, kind).toHaveLength(3);
      expect(three.some((pick) => pick.world.track.character.relief === 'mountain'), kind).toBe(true);
    }
  });

  it('slides through each of them with every wheel on the road or a kerb and nothing touched', () => {
    for (const [i, pass] of slid.entries()) {
      expect(pass, `${name(i)}: a clean pass with the slide`).not.toBeNull();
      expect(pass!.slid, name(i)).toBe(true);
    }
  });

  it('is quicker through each of them with the slide than the best pass without', () => {
    for (const [i, pass] of slid.entries()) {
      const best = grip[i];
      expect(best, `${name(i)}: a clean pass without`).not.toBeNull();
      expect(pass!.time, name(i)).toBeLessThan(best!.time);
    }
  });
});
