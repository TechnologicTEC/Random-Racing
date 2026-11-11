import { createHasher } from '../../core/hash';
import type { TrackResult } from '../types';

/**
 * A fingerprint of everything generation decided for a seed: every candidate's
 * shape, verdict and score, the winner and the name. Two runs with the same
 * fingerprint produced the same track.
 */
export function hashTrack(result: TrackResult): string {
  const hasher = createHasher();
  hasher.numbers([result.seed, result.generatorVersion, result.winnerIndex, result.fallback ? 1 : 0]);
  hasher.text(result.name).text(result.style);
  for (const candidate of result.candidates) {
    hasher.numbers(candidate.line.x).numbers(candidate.line.z).numbers(candidate.line.curvature);
    for (const violation of candidate.violations) {
      hasher.text(violation.kind).numbers([violation.x, violation.z, violation.value]);
    }
    for (const section of candidate.sections) {
      hasher.text(section.type === 'corner' ? section.kind : 'straight').numbers([section.startIndex, section.sampleCount]);
    }
    if (candidate.score) {
      hasher.numbers([candidate.score.total, ...candidate.score.parts.map((part) => part.score)]);
    }
  }
  return hasher.digest();
}
