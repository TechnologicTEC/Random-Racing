/**
 * Test helper: a config under which every seed gets the chosen traits, so a
 * test can look at many seeds of one kind of island.
 */
import type { CharacterConfig, GenConfig } from '../config';
import type { Character, CoastKind, ReliefKind, WidthKind } from '../gen/types';

/** Weights that always pick `chosen` out of `values`. */
function only<T extends string>(values: readonly T[], chosen: T): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, value === chosen ? 1 : 0])) as Record<T, number>;
}

const RELIEFS: readonly ReliefKind[] = ['flat', 'rolling', 'hilly', 'mountain'];
const COASTS: readonly CoastKind[] = ['inland', 'touches', 'coastal'];
const WIDTHS: readonly WidthKind[] = ['constant', 'varied'];

/** The config with the given traits forced for every seed. Traits left out are still drawn from the seed. */
export function withCharacter<C extends GenConfig>(base: C, traits: Partial<Character>): C {
  const character: CharacterConfig = { ...base.world.character };
  if (traits.relief) character.relief = only(RELIEFS, traits.relief);
  if (traits.coast) character.coast = only(COASTS, traits.coast);
  if (traits.width) character.width = only(WIDTHS, traits.width);
  if (traits.mountains !== undefined) {
    const count = traits.mountains;
    character.mountains = { flat: [count, count], rolling: [count, count], hilly: [count, count], mountain: [count, count] };
  }
  return { ...base, world: { ...base.world, character } };
}
