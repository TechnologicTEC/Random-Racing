import type { RoadConfig } from '../../config';
import type { CenterLine, RoadProfile, TunnelSpan, Violation } from '../types';
import { closeGaps, runsOf } from './bridges';
import { cutAndFill, type RoadEdges } from './profile';

/**
 * Where the road runs in tunnels (M6.2a): every stretch whose cut (in its middle, and at its banked edges when
 * `edges` are given) is more than `road.maxCut`, reaching each way until the cut is no more than
 * `road.tunnels.endCut`, made at least `minLength` long about its middle, and joined to the next tunnel when less
 * than `mergeGap` of open road lies between them. A tunnel never runs onto a bridge (`bridged`, 1 for each sample
 * on one): it stops short of it, and two tunnels are never joined across one. In order from sample 0; a span may
 * wrap past the lap's end.
 */
export function findTunnelSpans(profile: RoadProfile, spacing: number, road: RoadConfig, edges?: RoadEdges, bridged?: Uint8Array): TunnelSpan[] {
  const n = profile.height.length;
  const { endCut, minLength, mergeGap } = road.tunnels;
  const cut = new Float64Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    cut[i] = cutAndFill(i, profile, edges).cut;
    if (cut[i]! > road.maxCut && !bridged?.[i]) any = true;
  }
  if (!any) return [];

  // The stretches over the end cut off the bridges that hold some cut over the limit, each padded to the shortest span.
  const over = new Uint8Array(n);
  for (let i = 0; i < n; i++) over[i] = cut[i]! > endCut && !bridged?.[i] ? 1 : 0;
  const shortest = Math.ceil(minLength / spacing) + 1;
  const mask = new Uint8Array(n);
  for (const run of runsOf(over)) {
    let deep = false;
    for (let k = 0; k < run.sampleCount && !deep; k++) deep = cut[(run.startIndex + k) % n]! > road.maxCut;
    if (!deep) continue;
    let { startIndex, sampleCount } = run;
    if (sampleCount < shortest) {
      startIndex = (startIndex - Math.floor((shortest - sampleCount) / 2) + n) % n;
      sampleCount = shortest;
    }
    if (sampleCount >= n) sampleCount = n;
    for (let k = 0; k < sampleCount; k++) {
      const i = (startIndex + k) % n;
      if (!bridged?.[i]) mask[i] = 1;
    }
  }

  return closeGaps(mask, spacing, mergeGap, bridged);
}

/**
 * A layout is rejected if a tunnel comes within `road.tunnels.startClear` of its start line, either way round the
 * loop or over it (M6.2a), so the start gate and the cars waiting at it stand in the open. Marked at the line, with
 * how far the nearest tunnel is from it.
 *
 * @param start the sample the start line will be on
 */
export function checkTunnelStart(line: CenterLine, tunnels: readonly TunnelSpan[], start: number, road: RoadConfig): Violation[] {
  const n = line.count;
  let nearest = Infinity;
  for (const span of tunnels) {
    // Samples from the tunnel's first to the line, and from its last to the line, round the loop.
    const after = (((start - span.startIndex) % n) + n) % n;
    if (after < span.sampleCount) {
      nearest = 0;
      break;
    }
    const toEnd = after - (span.sampleCount - 1);
    const toStart = n - after;
    nearest = Math.min(nearest, Math.min(toEnd, toStart) * line.spacing);
  }
  if (nearest >= road.tunnels.startClear) return [];
  return [{ kind: 'tunnel-at-start', x: line.x[start]!, z: line.z[start]!, value: nearest, limit: road.tunnels.startClear }];
}
