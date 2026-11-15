import { describe, expect, it } from 'vitest';
import { roundedSquareLine, swellingWidth, uniformWidth } from '../../testing/trackFixtures';
import { wallPath } from './wallPaths';

// A 300 m square with 40 m corners, driven clockwise from (-110, -150) towards +x: the right of travel is +z at the start.
const line = roundedSquareLine(300, 40);
const n = line.count;

describe('wallPath', () => {
  it('gives a point for each end of every piece of the wall', () => {
    const path = wallPath(line, uniformWidth(line, 12), { startIndex: 10, pieceCount: 20, side: 1 }, 2);
    expect(path).toHaveLength(21);
  });

  it('runs beside the road edge, on the side the wall is on, at the distance asked for', () => {
    const right = wallPath(line, uniformWidth(line, 12), { startIndex: 10, pieceCount: 20, side: 1 }, 2);
    const left = wallPath(line, uniformWidth(line, 12), { startIndex: 10, pieceCount: 20, side: -1 }, 2);
    right.forEach((point, k) => {
      expect(point.x).toBeCloseTo(line.x[10 + k]!, 6);
      expect(point.z).toBeCloseTo(-150 + 8, 6);
    });
    left.forEach((point) => expect(point.z).toBeCloseTo(-150 - 8, 6));
  });

  it('follows a road that changes width', () => {
    const width = swellingWidth(line, 12, 22);
    const path = wallPath(line, width, { startIndex: 10, pieceCount: 20, side: 1 }, 2);
    path.forEach((point, k) => expect(point.z).toBeCloseTo(-150 + width[10 + k]! / 2 + 2, 6));
  });

  it('carries on past the end of the lap', () => {
    const path = wallPath(line, uniformWidth(line, 12), { startIndex: n - 5, pieceCount: 10, side: 1 }, 2);
    expect(path).toHaveLength(11);
    // Each point is straight out from its own sample: the last five of the lap, then the first six.
    path.forEach((point, k) => {
      const i = (n - 5 + k) % n;
      expect(Math.hypot(point.x - line.x[i]!, point.z - line.z[i]!)).toBeCloseTo(8, 6);
      expect((point.x - line.x[i]!) * line.tx[i]! + (point.z - line.z[i]!) * line.tz[i]!).toBeCloseTo(0, 6);
    });
  });

  it('comes back to where it began when the wall goes round the whole lap', () => {
    const path = wallPath(line, uniformWidth(line, 12), { startIndex: 0, pieceCount: n, side: -1 }, 2);
    expect(path).toHaveLength(n + 1);
    expect(path[n]).toEqual(path[0]);
  });
});
