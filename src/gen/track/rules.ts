import type { LayoutConfig, LayoutSettings, TrackConfig, TrackRules } from '../../config';
import type { ReliefKind } from '../types';

/** The largest track area any relief has, in metres: enough to frame any seed's track. */
export function widestTrackArea(track: TrackConfig | TrackRules): number {
  return Math.max(track.buildableRadius, ...Object.values(track.byRelief).map((rules) => rules.buildableRadius ?? 0));
}

/**
 * The track rules for a seed of this relief, in metres: the usual ones, with the
 * limits its relief changes, and the settings given against the road's width
 * (the smallest corners, how close separate parts of the lap come) worked out.
 */
export function trackRulesFor(track: TrackConfig, kind: ReliefKind): TrackRules {
  const rules = track.byRelief[kind];
  const { minInsideRadius, layout, ...rest } = track;
  return {
    ...rest,
    minCornerRadius: minInsideRadius + track.roadWidth / 2,
    layout: layoutInMetres(layout, track.roadWidth),
    lapLengthMin: rules.lapLength?.[0] ?? track.lapLengthMin,
    lapLengthMax: rules.lapLength?.[1] ?? track.lapLengthMax,
    buildableRadius: rules.buildableRadius ?? track.buildableRadius,
    score: rules.weights ? { ...track.score, weights: rules.weights } : track.score,
  };
}

/** The layout builder's settings in metres, on a road `roadWidth` wide. */
function layoutInMetres(settings: LayoutSettings, roadWidth: number): LayoutConfig {
  const half = roadWidth / 2;
  const { minInsideRadius, clearanceWidths, base, fold, jog, radius, ...same } = settings;
  const { stretchedHalfWidth, ...baseRest } = base;
  const { hairpinWidths, ...foldRest } = fold;
  const { offsetWidths, ...jogRest } = jog;
  const { hairpinInside, tipInside, ...radiusRest } = radius;
  return {
    ...same,
    minCornerRadius: minInsideRadius + half,
    clearance: clearanceWidths * roadWidth,
    base: { ...baseRest, stretchedHalfWidth: [stretchedHalfWidth.leastWidths * roadWidth, stretchedHalfWidth.most] },
    fold: { ...foldRest, hairpinWidth: [hairpinWidths[0] * roadWidth, hairpinWidths[1] * roadWidth] },
    jog: { ...jogRest, offset: [offsetWidths[0] * roadWidth, offsetWidths[1] * roadWidth] },
    radius: { ...radiusRest, hairpin: [hairpinInside[0] + half, hairpinInside[1] + half], tip: [tipInside[0] + half, tipInside[1] + half] },
  };
}
