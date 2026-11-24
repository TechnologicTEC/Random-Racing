/** Seeds are unsigned 32-bit whole numbers. */
export const MAX_SEED = 4294967295;

export interface ParsedSeed {
  seed: number;
  /** Generator version from a share code, or null when only a number was typed. */
  version: number | null;
}

/** A shareable code such as "v1-48213". */
export function formatSeedCode(seed: number, version: number): string {
  return `v${version}-${seed}`;
}

/**
 * Why what a player typed cannot be shown as an island of generator `version`, in a sentence, or null when it can
 * (M4.5): nothing typed, not a seed, a seed out of range, or a share code from another version of the generator,
 * whose island would not be the one it was shared from. Null exactly when `parseSeedInput` reads it and any version
 * in it is `version`.
 */
export function seedInputProblem(text: string, version: number): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return `Type a seed, such as 48213, or a share code, such as v${version}-48213.`;
  const match = /^(?:v(\d+)-)?(-?\d+)$/i.exec(trimmed);
  if (!match) return `Not a seed: type a whole number, such as 48213, or a share code, such as v${version}-48213.`;
  const seedText = match[2]!;
  if (match[1] !== undefined && Number(match[1]) !== version) {
    return `That code was made by generator v${Number(match[1])}, and this game has v${version}: its island would not be the same. Type ${seedText} alone for this version's island.`;
  }
  if (parseSeedInput(trimmed) === null) return `Seeds go from 0 to ${MAX_SEED}.`;
  return null;
}

/** Reads what a player typed: a plain seed ("48213") or a share code ("v1-48213"). */
export function parseSeedInput(text: string): ParsedSeed | null {
  const match = /^(?:v(\d{1,4})-)?(\d{1,10})$/i.exec(text.trim());
  if (!match) return null;
  const seed = Number(match[2]);
  if (seed > MAX_SEED) return null;
  return { seed, version: match[1] === undefined ? null : Number(match[1]) };
}
