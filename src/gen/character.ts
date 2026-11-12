import type { CharacterConfig } from '../config';
import { createRng, pickWeighted, type Rng } from '../core/rng';
import type { Character, CoastKind, ReliefKind, WidthKind } from './types';

const RELIEFS: readonly ReliefKind[] = ['flat', 'rolling', 'hilly', 'mountain'];
const COASTS: readonly CoastKind[] = ['inland', 'touches', 'coastal'];
const WIDTHS: readonly WidthKind[] = ['constant', 'varied'];

/**
 * Chooses what kind of island a seed makes: how hilly, how much of the track
 * is by the sea, how many mountains, and whether the road widens.
 *
 * Each trait has a random stream of its own, so the traits are independent
 * and changing the weights of one never reshuffles the others.
 */
export function pickCharacter(seed: number, cfg: CharacterConfig): Character {
  const rng = createRng(seed, 'world').fork('character');
  const relief = pickOne(rng.fork('relief'), RELIEFS, cfg.relief);
  const [fewest, most] = cfg.mountains[relief];
  return {
    relief,
    coast: pickOne(rng.fork('coast'), COASTS, cfg.coast),
    mountains: rng.fork('mountains').int(fewest, most),
    width: pickOne(rng.fork('width'), WIDTHS, cfg.width),
  };
}

/** One of the values, chosen by its weight. Falls back to the first when every weight is zero. */
function pickOne<T extends string>(rng: Rng, values: readonly T[], weights: Record<T, number>): T {
  const index = pickWeighted(rng, values.map((value) => weights[value]));
  return values[index < 0 ? 0 : index]!;
}
