import type { TrackConfig } from '../../config';
import type { ReliefKind } from '../types';

/** The largest track area any relief has, in metres: enough to frame any seed's track. */
export function widestTrackArea(track: TrackConfig): number {
  return Math.max(track.buildableRadius, ...Object.values(track.byRelief).map((rules) => rules.buildableRadius ?? 0));
}

/** The track rules for a seed of this relief: the usual ones, with the limits its relief changes. */
export function trackRulesFor(track: TrackConfig, kind: ReliefKind): TrackConfig {
  const rules = track.byRelief[kind];
  if (!rules.lapLength && rules.buildableRadius === undefined && !rules.weights) return track;
  return {
    ...track,
    lapLengthMin: rules.lapLength?.[0] ?? track.lapLengthMin,
    lapLengthMax: rules.lapLength?.[1] ?? track.lapLengthMax,
    buildableRadius: rules.buildableRadius ?? track.buildableRadius,
    score: rules.weights ? { ...track.score, weights: rules.weights } : track.score,
  };
}
