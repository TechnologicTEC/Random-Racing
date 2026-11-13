import type { Character, FitReport, LandformKind, ProfileStats, RouteKind, ScorePart, TrackResult, Violation } from '../../gen/types';

/** Trims a number to at most one decimal place, dropping a trailing ".0". */
function short(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** A plain-words reason for a rejected layout. */
export function describeViolation(violation: Violation): string {
  const value = Math.round(violation.value);
  const limit = short(violation.limit);
  switch (violation.kind) {
    case 'self-intersection':
      return 'Crosses itself';
    case 'corner-too-tight':
      return `Corner too tight: ${value} m radius (minimum ${limit} m)`;
    case 'sections-too-close':
      return `Sections too close: ${value} m apart (minimum ${limit} m)`;
    case 'lap-too-short':
      return `Lap too short: ${value} m (minimum ${limit} m)`;
    case 'lap-too-long':
      return `Lap too long: ${value} m (maximum ${limit} m)`;
    case 'out-of-bounds':
      return `Leaves the buildable area: ${value} m from the centre (maximum ${limit} m)`;
    case 'cut-too-deep':
      return `Cutting too deep: ${short(violation.value)} m (maximum ${limit} m)`;
    case 'fill-too-high':
      return `Embankment too high: ${short(violation.value)} m (maximum ${limit} m)`;
    case 'bank-too-steep':
      return `Bank between sections too steep: ${Math.round(violation.value * 100)}% (maximum ${Math.round(violation.limit * 100)}%)`;
  }
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

/** A heading and a one-line explanation for one part of the fun score. */
export function describeScorePart(part: ScorePart): { label: string; detail: string } {
  const f = part.facts;
  switch (part.key) {
    case 'straights':
      return {
        label: 'Long straights',
        detail: `Longest ${Math.round(f.longest ?? 0)} m and ${Math.round(f.second ?? 0)} m; ${f.longCount ?? 0} over 150 m`,
      };
    case 'cornerMix':
      return {
        label: 'Corner mix',
        detail: `${plural(f.hairpins ?? 0, 'hairpin')}, ${plural(f.sweepers ?? 0, 'sweeper')}, ${plural(f.chicanes ?? 0, 'chicane')}`,
      };
    case 'drift':
      return {
        label: 'Drift corners',
        detail: `${f.driftCorners ?? 0} of ${plural(f.corners ?? 0, 'corner')} suit drifting; best is ${f.target ?? 0} or more, and most of them`,
      };
    case 'flow':
      return {
        label: 'Flow',
        detail: `${plural(f.corners ?? 0, 'corner')} (${f.left ?? 0} left, ${f.right ?? 0} right), ${plural(f.kinks ?? 0, 'kink')}, ${plural(f.stutters ?? 0, 'stutter')}`,
      };
    case 'elevation':
      return {
        label: 'Elevation',
        detail: `${Math.round(f.range ?? 0)} m between lowest and highest point, ${Math.round(f.climb ?? 0)} m of climbing; steepest ${Math.round((f.maxGradient ?? 0) * 100)}%`,
      };
  }
}

const COAST_WORDS: Record<Character['coast'], string> = {
  inland: 'Inland: never beside the sea',
  touches: 'Touches the sea in places',
  coastal: 'Coastal: mostly beside the sea',
};

const LANDFORM_WORDS: Record<LandformKind, string> = {
  range: 'Ridged range',
  hills: 'Rolling hill country',
  peak: 'Lone peak',
};

const LANDFORM_SHORT: Record<LandformKind, string> = {
  range: 'ridged range',
  hills: 'hill country',
  peak: 'lone peak',
};

const ROUTE_WORDS: Record<RouteKind, string> = {
  climb: 'Climbs high onto its mountain',
  circle: 'Circles its mountain',
};

const ROUTE_SHORT: Record<RouteKind, string> = { climb: 'climbing', circle: 'circling' };

const capital = (word: string): string => word[0]!.toUpperCase() + word.slice(1);

/** The kind of island a seed makes, as label and value pairs for the lab's track panel. */
export function describeCharacter(character: Character): Array<[label: string, value: string]> {
  const facts: Array<[string, string]> = [['Relief', capital(character.relief)]];
  if (character.route) facts.push(['Route', ROUTE_WORDS[character.route]]);
  facts.push(
    ['Coast', COAST_WORDS[character.coast]],
    ['Mountains', character.mountains === 0 ? 'None' : String(character.mountains)],
    ['Mountain shape', LANDFORM_WORDS[character.landform]],
    ['Road width', capital(character.width)],
  );
  return facts;
}

/**
 * The road's width in plain words: one figure when it never changes, otherwise
 * the narrowest and widest and how much of the lap is wider than the narrowest.
 *
 * @param width road width at each sample of the lap, in metres
 */
export function describeWidth(width: ArrayLike<number>): string {
  let narrowest = Infinity;
  let widest = -Infinity;
  for (let i = 0; i < width.length; i++) {
    narrowest = Math.min(narrowest, width[i]!);
    widest = Math.max(widest, width[i]!);
  }
  if (widest - narrowest < 0.5) return `${Math.round(narrowest)} m all the way round`;
  let wider = 0;
  for (let i = 0; i < width.length; i++) if (width[i]! > narrowest + 0.5) wider++;
  return `${Math.round(narrowest)} to ${Math.round(widest)} m (wider on ${Math.round((100 * wider) / width.length)}% of the lap)`;
}

/** The kind of island in a few words, for a contact sheet caption. */
export function shortCharacter(character: Character): string {
  const words: string[] = [character.route ? `${character.relief}, ${ROUTE_SHORT[character.route]}` : character.relief, character.coast];
  if (character.mountains > 0) words.push(`${plural(character.mountains, 'mountain')}, ${LANDFORM_SHORT[character.landform]}`);
  if (character.width === 'varied') words.push('varied width');
  return words.join(' · ');
}

/** The road height facts as label and value pairs, for the lab's elevation panel. */
export function describeProfile(stats: ProfileStats): Array<[label: string, value: string]> {
  const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;
  const facts: Array<[string, string]> = [
    ['Height range', `${Math.round(stats.range)} m (${Math.round(stats.min)} to ${Math.round(stats.max)} m)`],
    ['Total climb', `${Math.round(stats.climb)} m per lap`],
    ['Steepest gradient', percent(stats.maxGradient)],
    ['Deepest cut', `${short(stats.maxCut)} m`],
    ['Tallest fill', `${short(stats.maxFill)} m`],
  ];
  if (stats.steepestBank > 0) facts.push(['Steepest bank between sections', percent(stats.steepestBank)]);
  return facts;
}

/**
 * The fit report as label and value pairs, and whether the road sits cleanly:
 * no ground showing through it and none of it left hanging.
 *
 * @param shareDistance sections closer than this share the ground between them, in metres
 */
export function describeFit(
  report: FitReport,
  shareDistance = 55,
): { clean: boolean; facts: Array<[label: string, value: string]> } {
  const points = (count: number): string => (count === 0 ? 'none' : plural(count, 'point'));
  return {
    clean: report.groundThroughRoad === 0 && report.roadFloating === 0,
    facts: [
      ['Deepest cutting', `${short(report.deepestCut.value)} m`],
      ['Tallest embankment', `${short(report.tallestFill.value)} m`],
      ['Steepest bank', `${Math.round(report.steepestBank.value * 100)}%`],
      ['Sea nearest the road', `${Math.round(report.nearestWater.value)} m`],
      [
        'Closest sections',
        report.closestSections ? `${Math.round(report.closestSections.value)} m apart` : `none within ${shareDistance} m`,
      ],
      ['Ground through the road', points(report.groundThroughRoad)],
      ['Road left hanging', points(report.roadFloating)],
    ],
  };
}

/** One line describing a batch of generated tracks, for judging variety at a glance. */
export function summariseTracks(results: readonly TrackResult[]): string {
  if (results.length === 0) return 'No tracks yet';
  const winners = results.map((result) => result.candidates[result.winnerIndex]!);
  const laps = winners.map((winner) => Math.round(winner.line.length));
  const scores = winners.map((winner) => Math.round((winner.score?.total ?? 0) * 100));
  const styleCount = (style: TrackResult['style']): number => results.filter((result) => result.style === style).length;
  const hairpins = winners.filter((winner) =>
    winner.sections.some((section) => section.type === 'corner' && section.kind === 'hairpin'),
  ).length;
  const fallbacks = results.filter((result) => result.fallback).length;

  const reliefCount = (relief: Character['relief']): number => results.filter((result) => result.character.relief === relief).length;
  const coastCount = (coast: Character['coast']): number => results.filter((result) => result.character.coast === coast).length;
  const shapeCount = (landform: LandformKind): number => results.filter((result) => result.character.landform === landform).length;
  const routeCount = (route: RouteKind): number => results.filter((result) => result.character.route === route).length;

  const parts = [
    `${styleCount('folded')} folded, ${styleCount('stretched')} stretched, ${styleCount('round')} round`,
    `${reliefCount('flat')} flat, ${reliefCount('rolling')} rolling, ${reliefCount('hilly')} hilly, ${reliefCount('mountain')} mountain (${routeCount('climb')} climbing, ${routeCount('circle')} circling)`,
    `${coastCount('inland')} inland, ${coastCount('touches')} touching the sea, ${coastCount('coastal')} coastal`,
    `${shapeCount('range')} ridged range, ${shapeCount('hills')} hill country, ${shapeCount('peak')} lone peak`,
    `laps ${Math.min(...laps)} to ${Math.max(...laps)} m`,
    `scores ${Math.min(...scores)} to ${Math.max(...scores)}`,
    `${hairpins} of ${results.length} with a hairpin`,
  ];
  if (fallbacks > 0) parts.push(`${fallbacks} fell back to a plain oval`);
  return `${plural(results.length, 'track')}: ${parts.join('; ')}`;
}
