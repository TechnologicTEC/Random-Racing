import { length2 } from '../../core/dmath';
import type { Corner } from '../types';

export type { Corner };

export interface RoundedLoop {
  /** The rounded loop as a fine polyline that ends exactly where it starts. */
  x: number[];
  z: number[];
  /** The radius each corner ended up with (0 where the path goes straight through). */
  radii: number[];
}

/** Arcs are drawn with chords no longer than this, in metres. */
const ARC_CHORD = 0.5;

/** Corners turning less than about 2 degrees are treated as part of a straight. */
const NO_TURN = 0.02;

/**
 * Turns a polygon of corners into a drivable loop: each corner is replaced by a
 * circular arc that meets the two edges, and what is left of each edge stays a
 * straight line. Radii are exact and straights are exactly straight.
 *
 * When two neighbouring corners want more of the edge between them than there
 * is, they share it (see below). That is how the end of a narrow strip becomes
 * a single clean hairpin.
 *
 * Returns null if the edges are too short for every corner to reach minRadius.
 */
export function roundCorners(corners: readonly Corner[], minRadius: number): RoundedLoop | null {
  const n = corners.length;
  if (n < 3) return null;

  // Edge i runs from corner i to corner i + 1.
  const dirX: number[] = [];
  const dirZ: number[] = [];
  const edgeLength: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % n]!;
    const length = length2(b.x - a.x, b.z - a.z);
    if (length < 1e-6) return null;
    dirX.push((b.x - a.x) / length);
    dirZ.push((b.z - a.z) / length);
    edgeLength.push(length);
  }

  // For each corner: how sharply it turns, and how much of each edge its arc wants.
  // An arc of radius r uses r * tan(turn / 2) of both edges.
  const tanHalf: number[] = [];
  const turnSign: number[] = [];
  const want: number[] = [];
  for (let i = 0; i < n; i++) {
    const before = (i - 1 + n) % n;
    const cos = dirX[before]! * dirX[i]! + dirZ[before]! * dirZ[i]!;
    const cross = dirX[before]! * dirZ[i]! - dirZ[before]! * dirX[i]!;
    if (1 + cos < 1e-6) return null; // doubles straight back on itself
    const tan = Math.abs(cross) / (1 + cos);
    tanHalf.push(tan);
    turnSign.push(cross >= 0 ? 1 : -1);
    want.push(tan < NO_TURN ? 0 : corners[i]!.radius * tan);
  }

  // Share each edge between the corners at its two ends. Every corner is first
  // promised enough of the edge to reach minRadius; what is left over is split
  // in proportion to how much more each side wants. Two corners that both want
  // "as much as possible" therefore end up with the same radius.
  const fromIn: number[] = new Array<number>(n).fill(0);
  const fromOut: number[] = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const needA = want[i] === 0 ? 0 : minRadius * tanHalf[i]!;
    const needB = want[next] === 0 ? 0 : minRadius * tanHalf[next]!;
    const wantA = Math.max(want[i]!, needA);
    const wantB = Math.max(want[next]!, needB);
    if (wantA + wantB <= edgeLength[i]!) {
      fromOut[i] = wantA;
      fromIn[next] = wantB;
      continue;
    }
    const spare = edgeLength[i]! - needA - needB;
    if (spare < 0) return null;
    const extraA = wantA - needA;
    const extraB = wantB - needB;
    fromOut[i] = needA + (spare * extraA) / (extraA + extraB);
    fromIn[next] = needB + (spare * extraB) / (extraA + extraB);
  }

  const tangent: number[] = [];
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    if (want[i] === 0) {
      tangent.push(0);
      radii.push(0);
      continue;
    }
    const t = Math.min(fromIn[i]!, fromOut[i]!);
    tangent.push(t);
    radii.push(t / tanHalf[i]!);
  }

  const x: number[] = [];
  const z: number[] = [];
  const push = (px: number, pz: number): void => {
    const last = x.length - 1;
    if (last >= 0 && length2(px - x[last]!, pz - z[last]!) < 1e-6) return;
    x.push(px);
    z.push(pz);
  };

  for (let i = 0; i < n; i++) {
    const before = (i - 1 + n) % n;
    const corner = corners[i]!;
    if (radii[i] === 0) {
      push(corner.x, corner.z);
      continue;
    }
    const t = tangent[i]!;
    const radius = radii[i]!;
    const startX = corner.x - dirX[before]! * t;
    const startZ = corner.z - dirZ[before]! * t;
    const endX = corner.x + dirX[i]! * t;
    const endZ = corner.z + dirZ[i]! * t;
    // The arc's centre sits on the inside of the turn, one radius from the incoming edge.
    const centreX = startX - dirZ[before]! * radius * turnSign[i]!;
    const centreZ = startZ + dirX[before]! * radius * turnSign[i]!;
    // The corner itself lies on the line from the centre through the middle of the arc.
    const toCorner = length2(corner.x - centreX, corner.z - centreZ);
    const midX = centreX + ((corner.x - centreX) / toCorner) * radius;
    const midZ = centreZ + ((corner.z - centreZ) / toCorner) * radius;

    push(startX, startZ);
    addArc(push, centreX, centreZ, radius, startX, startZ, midX, midZ);
    push(midX, midZ);
    addArc(push, centreX, centreZ, radius, midX, midZ, endX, endZ);
    push(endX, endZ);
    // The straight to the next corner needs no points of its own.
  }

  // Close the loop on exactly the point it started from.
  const last = x.length - 1;
  if (length2(x[0]! - x[last]!, z[0]! - z[last]!) < 1e-6) {
    x[last] = x[0]!;
    z[last] = z[0]!;
  } else {
    x.push(x[0]!);
    z.push(z[0]!);
  }
  return { x, z, radii };
}

/**
 * Adds the points strictly between A and B on a circle, by repeatedly taking
 * the middle of the arc. Needs no trigonometry, so it is exact everywhere.
 */
function addArc(
  push: (x: number, z: number) => void,
  centreX: number, centreZ: number, radius: number,
  ax: number, az: number, bx: number, bz: number,
): void {
  if (length2(bx - ax, bz - az) <= ARC_CHORD) return;
  const sumX = ax - centreX + (bx - centreX);
  const sumZ = az - centreZ + (bz - centreZ);
  const sum = length2(sumX, sumZ);
  if (sum < 1e-9) return;
  const midX = centreX + (sumX / sum) * radius;
  const midZ = centreZ + (sumZ / sum) * radius;
  addArc(push, centreX, centreZ, radius, ax, az, midX, midZ);
  push(midX, midZ);
  addArc(push, centreX, centreZ, radius, midX, midZ, bx, bz);
}
