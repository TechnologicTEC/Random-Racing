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

/** Reads what a player typed: a plain seed ("48213") or a share code ("v1-48213"). */
export function parseSeedInput(text: string): ParsedSeed | null {
  const match = /^(?:v(\d{1,4})-)?(\d{1,10})$/i.exec(text.trim());
  if (!match) return null;
  const seed = Number(match[2]);
  if (seed > MAX_SEED) return null;
  return { seed, version: match[1] === undefined ? null : Number(match[1]) };
}
