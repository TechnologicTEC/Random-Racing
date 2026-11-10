import type { TrackConfig } from '../../config';
import { dcos, dsin, length2, TAU } from '../../core/dmath';
import type { Rng } from '../../core/rng';
import type { Vec2 } from '../../core/vec2';

/**
 * Places the control points of one candidate layout: a ring of points around
 * the island centre, pushed in and out and slid around the loop at random.
 */
export function generateControlPoints(rng: Rng, cfg: TrackConfig): Vec2[] {
  const layout = cfg.layout;
  const count = rng.int(layout.controlPointsMin, layout.controlPointsMax);
  const baseRadius = rng.range(layout.baseRadiusMin, layout.baseRadiusMax);
  const maxRadius = cfg.buildableRadius * 0.9;

  const points: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = ((i + rng.range(-layout.angleJitter, layout.angleJitter)) * TAU) / count;
    const radius = Math.min(maxRadius, baseRadius * (1 + rng.range(-layout.radialNoise, layout.radialNoise)));
    points.push({ x: dcos(angle) * radius, z: dsin(angle) * radius });
  }

  pushApart(points, layout.minPointGap, maxRadius);
  return points;
}

/**
 * Nudges neighbouring points away from each other until none are closer than
 * minGap, keeping every point within maxRadius of the centre.
 */
export function pushApart(points: Vec2[], minGap: number, maxRadius: number): void {
  const target = minGap * 1.02;
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const gap = length2(dx, dz);
      if (gap >= minGap) continue;
      const push = (target - gap) / 2;
      const ux = gap > 0 ? dx / gap : 1;
      const uz = gap > 0 ? dz / gap : 0;
      a.x -= ux * push;
      a.z -= uz * push;
      b.x += ux * push;
      b.z += uz * push;
      moved = true;
    }
    for (const p of points) {
      const r = length2(p.x, p.z);
      if (r > maxRadius) {
        p.x *= maxRadius / r;
        p.z *= maxRadius / r;
      }
    }
    if (!moved) return;
  }
}
