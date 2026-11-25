import type { RoadConfig } from '../../config';
import type { BridgeSpan, RoadProfile } from '../types';
import { cutAndFill, type RoadEdges } from './profile';

/**
 * Where the road runs on bridges (M6.1): every stretch whose fill under the road (in its middle, and at its
 * banked edges when `edges` are given) is more than `road.maxFill`, reaching each way until the fill is no more
 * than `road.bridges.endFill`, made at least `minLength` long about its middle, and joined to the next bridge
 * when less than `mergeGap` of road lies between them. In order from sample 0; a span may wrap past the lap's end.
 */
export function findBridgeSpans(profile: RoadProfile, spacing: number, road: RoadConfig, edges?: RoadEdges): BridgeSpan[] {
  const n = profile.height.length;
  const { endFill, minLength, mergeGap } = road.bridges;
  const fill = new Float64Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    fill[i] = cutAndFill(i, profile, edges).fill;
    if (fill[i]! > road.maxFill) any = true;
  }
  if (!any) return [];

  // The stretches over the end fill that hold some fill over the limit, each padded to the shortest span.
  const over = new Uint8Array(n);
  for (let i = 0; i < n; i++) over[i] = fill[i]! > endFill ? 1 : 0;
  const shortest = Math.ceil(minLength / spacing) + 1;
  const mask = new Uint8Array(n);
  for (const run of runsOf(over)) {
    let deep = false;
    for (let k = 0; k < run.sampleCount && !deep; k++) deep = fill[(run.startIndex + k) % n]! > road.maxFill;
    if (!deep) continue;
    let { startIndex, sampleCount } = run;
    if (sampleCount < shortest) {
      startIndex = (startIndex - Math.floor((shortest - sampleCount) / 2) + n) % n;
      sampleCount = shortest;
    }
    if (sampleCount >= n) return [{ startIndex: 0, sampleCount: n }];
    for (let k = 0; k < sampleCount; k++) mask[(startIndex + k) % n] = 1;
  }

  // Close the gaps shorter than `mergeGap` between one bridge's last sample and the next one's first.
  const spans = runsOf(mask);
  for (let s = 0; s < spans.length && spans.length > 1; s++) {
    const here = spans[s]!;
    const next = spans[(s + 1) % spans.length]!;
    const end = here.startIndex + here.sampleCount - 1;
    const gap = (((next.startIndex - end) % n) + n) % n;
    if (gap * spacing < mergeGap) for (let k = 1; k < gap; k++) mask[(end + k) % n] = 1;
  }
  return runsOf(mask);
}

/** A bridge's length in metres, from its first sample to its last. */
export function spanLength(span: BridgeSpan, spacing: number): number {
  return (span.sampleCount - 1) * spacing;
}

/** 1 for each of the lap's `count` samples on a bridge, 0 elsewhere. */
export function bridgedMask(spans: readonly BridgeSpan[], count: number): Uint8Array {
  const mask = new Uint8Array(count);
  for (const span of spans) for (let k = 0; k < span.sampleCount; k++) mask[(span.startIndex + k) % count] = 1;
  return mask;
}

/** The same spans on the lap renumbered so that sample `start` becomes sample 0, in order from it. */
export function rotateSpans(spans: readonly BridgeSpan[], start: number, count: number): BridgeSpan[] {
  return spans
    .map((span) => ({ startIndex: (((span.startIndex - start) % count) + count) % count, sampleCount: span.sampleCount }))
    .sort((a, b) => a.startIndex - b.startIndex);
}

/** The runs of 1s round a loop, in order of their first sample; a run may wrap past the end. */
function runsOf(mask: Uint8Array): BridgeSpan[] {
  const n = mask.length;
  const gap = mask.indexOf(0);
  if (gap < 0) return n > 0 ? [{ startIndex: 0, sampleCount: n }] : [];
  const runs: BridgeSpan[] = [];
  let start = -1;
  // From just after a sample that is off, once round, so no run is cut in two at the lap's end.
  for (let k = 1; k <= n; k++) {
    const i = (gap + k) % n;
    if (mask[i] && start < 0) start = i;
    if (!mask[i] && start >= 0) {
      runs.push({ startIndex: start, sampleCount: (((i - start) % n) + n) % n });
      start = -1;
    }
  }
  return runs.sort((a, b) => a.startIndex - b.startIndex);
}
