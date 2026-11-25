import type { RoadConfig } from '../../config';
import { bridgedMask, spanLength } from '../road/bridges';
import { cutAndFill, findSteepestBank, type Neighbours, type RoadEdges } from '../road/profile';
import type { BridgeSpan, CenterLine, ProfileStats, RoadProfile, Violation } from '../types';

/**
 * The earthworks rule: a layout is rejected if its road needs a cutting deeper
 * than `maxCut`, an embankment higher than `maxFill` off its bridges, a bridge
 * longer than `bridges.maxLength`, or a grass bank between two close sections
 * steeper than `maxBankSlope` (with the solver's slack). Each break is marked where it is worst.
 *
 * @param stats the road's measurements, from `measureProfile` (given the same `edges`, and the bridges' mask)
 * @param neighbours the line's close sections, if already found
 * @param edges when given, the cut and fill are judged at the road's banked edges too, not only in its middle
 * @param bridges where the road runs on bridges (`findBridgeSpans`), if anywhere (M6.1)
 */
export function checkEarthworks(
  line: CenterLine,
  profile: RoadProfile,
  stats: ProfileStats,
  road: RoadConfig,
  roadWidth: number,
  neighbours?: Neighbours,
  edges?: RoadEdges,
  bridges: readonly BridgeSpan[] = [],
): Violation[] {
  const violations: Violation[] = [];
  const at = (i: number, kind: Violation['kind'], value: number, limit: number): Violation => ({ kind, x: line.x[i]!, z: line.z[i]!, value, limit });
  if (stats.maxCut > road.maxCut || stats.maxFill > road.maxFill) {
    const bridged = bridgedMask(bridges, line.count);
    let deepest = 0;
    let highest = 0;
    let deepestCut = -Infinity;
    let highestFill = -Infinity;
    for (let i = 0; i < line.count; i++) {
      const { cut, fill } = cutAndFill(i, profile, edges);
      if (cut > deepestCut) [deepest, deepestCut] = [i, cut];
      if (!bridged[i] && fill > highestFill) [highest, highestFill] = [i, fill];
    }
    if (stats.maxCut > road.maxCut) violations.push(at(deepest, 'cut-too-deep', stats.maxCut, road.maxCut));
    if (stats.maxFill > road.maxFill) violations.push(at(highest, 'fill-too-high', stats.maxFill, road.maxFill));
  }
  for (const span of bridges) {
    const length = spanLength(span, line.spacing);
    if (length > road.bridges.maxLength) {
      violations.push(at((span.startIndex + Math.floor(span.sampleCount / 2)) % line.count, 'bridge-too-long', length, road.bridges.maxLength));
    }
  }
  const bankLimit = road.maxBankSlope + road.bankSlack;
  if (stats.steepestBank > bankLimit) {
    const bank = findSteepestBank(line, profile.height, road, roadWidth, neighbours);
    violations.push({
      kind: 'bank-too-steep',
      // Half way between the two sections.
      x: (line.x[bank.from]! + line.x[bank.to]!) / 2,
      z: (line.z[bank.from]! + line.z[bank.to]!) / 2,
      value: bank.slope,
      limit: bankLimit,
    });
  }
  return violations;
}
