import type { CharacterConfig } from '../config';
import { createRng, pickWeighted, type Rng } from '../core/rng';
import type { Character, CoastKind, LandformKind, ReliefKind, RouteKind, WidthKind } from './types';

const RELIEFS: readonly ReliefKind[] = ['flat', 'rolling', 'hilly', 'mountain'];
const COASTS: readonly CoastKind[] = ['inland', 'touches', 'coastal'];
const WIDTHS: readonly WidthKind[] = ['constant', 'varied'];
const LANDFORMS: readonly LandformKind[] = ['range', 'hills', 'peak'];
const ROUTES: readonly RouteKind[] = ['climb', 'circle'];

/**
 * Chooses what kind of island a seed makes: how hilly, how much of the track
 * is by the sea, how many mountains and of what shape, whether the road
 * widens, and on a mountain seed whether the lap climbs its mountain or circles it.
 *
 * Each trait has a random stream of its own, so the traits are independent
 * and changing the weights of one never reshuffles the others.
 */
export function pickCharacter(seed: number, cfg: CharacterConfig): Character {
  const rng = createRng(seed, 'world').fork('character');
  const relief = pickOne(rng.fork('relief'), RELIEFS, cfg.relief);
  const [fewest, most] = cfg.mountains[relief];
  // Drawn for every seed, so whether a seed is a mountain seed never changes what its stream gives.
  const route = pickOne(rng.fork('route'), ROUTES, cfg.route);
  return {
    relief,
    coast: pickOne(rng.fork('coast'), COASTS, cfg.coast),
    mountains: rng.fork('mountains').int(fewest, most),
    width: pickOne(rng.fork('width'), WIDTHS, cfg.width),
    landform: pickOne(rng.fork('landform'), LANDFORMS, cfg.landform),
    route: relief === 'mountain' ? route : null,
  };
}

/** One of the values, chosen by its weight. Falls back to the first when every weight is zero. */
function pickOne<T extends string>(rng: Rng, values: readonly T[], weights: Record<T, number>): T {
  const index = pickWeighted(rng, values.map((value) => weights[value]));
  return values[index < 0 ? 0 : index]!;
}
