import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen/generate';
import { ROAD_MATERIAL } from '../gen/road/ribbon';
import { trianglesOf, tunnelBoxes, tunnelRooms } from '../gen/road/tunnels';
import { generateTrack } from '../gen/track/pipeline';
import type { DeckBox } from '../gen/road/bridges';
import type { WorldResult } from '../gen/types';
import { sampleField } from '../gen/world/heightfield';
import { quatFromAxes, type Quat } from '../sim/quat';
import { chaseNext, chaseStart, type ChaseCar, type ChaseView } from './chase';

const cfg = config.camera.chase;
/** The car's middle stands this far above the road (as at the start line). */
const RIDE = 0.56;
/** A box or a face is only hit this far inside it, so a sight line grazing its surface does not count. */
const GRAZE = 0.01;

type Point = { x: number; y: number; z: number };

const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y + a.z * b.z;
const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** Whether the segment from a to b passes through the box (shrunk by `GRAZE`), or either end lies in it. */
function segmentHitsBox(a: Point, b: Point, box: DeckBox): boolean {
  const local = (p: Point): [number, number, number] => {
    const d = minus(p, box.centre);
    return [dot(d, box.across), dot(d, box.up), dot(d, box.along)];
  };
  const [p, q] = [local(a), local(b)];
  const half = [box.half.x - GRAZE, box.half.y - GRAZE, box.half.z - GRAZE];
  let [enter, leave] = [0, 1];
  for (let k = 0; k < 3; k++) {
    const d = q[k]! - p[k]!;
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(p[k]!) > half[k]!) return false;
      continue;
    }
    let t0 = (-half[k]! - p[k]!) / d;
    let t1 = (half[k]! - p[k]!) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0);
    leave = Math.min(leave, t1);
    if (enter > leave) return false;
  }
  return true;
}

/** Whether the segment from a to b passes through the triangle, short of either end. */
function segmentHitsTriangle(a: Point, b: Point, A: Point, B: Point, C: Point): boolean {
  const dir = minus(b, a);
  const e1 = minus(B, A);
  const e2 = minus(C, A);
  const h = { x: dir.y * e2.z - dir.z * e2.y, y: dir.z * e2.x - dir.x * e2.z, z: dir.x * e2.y - dir.y * e2.x };
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return false;
  const s = minus(a, A);
  const u = dot(s, h) / det;
  if (u < 0 || u > 1) return false;
  const qv = { x: s.y * e1.z - s.z * e1.y, y: s.z * e1.x - s.x * e1.z, z: s.x * e1.y - s.y * e1.x };
  const v = dot(dir, qv) / det;
  if (v < 0 || u + v > 1) return false;
  const t = dot(e2, qv) / det;
  const length = Math.sqrt(dot(dir, dir));
  return t > GRAZE / length && t < 1 - GRAZE / length;
}

/** The turn of a car whose nose points along (fx, fz) on the map, level. */
function facing(fx: number, fz: number): Quat {
  const size = Math.hypot(fx, fz);
  const [x, z] = [fx / size, fz / size];
  return quatFromAxes({ x: -z, y: 0, z: x }, { x: 0, y: 1, z: 0 }, { x: -x, y: 0, z: -z });
}

/** Everything about one world's tunnels the checks need. */
function tunnelsOf(world: WorldResult) {
  const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
  const { cross, width, tunnels } = world.road;
  const rooms = tunnelRooms(line, profile.height, cross, width, tunnels.spans, tunnels, config, cfg.back + 2);
  const boxes = tunnelBoxes(line, profile.height, cross, width, tunnels.spans, config);
  const portal = trianglesOf(tunnels.mesh, ROAD_MATERIAL.portal);
  const faces: [Point, Point, Point][] = [];
  for (let t = 0; t < portal.indices.length; t += 3) {
    const corner = (v: number): Point => ({ x: portal.positions[v * 3]!, y: portal.positions[v * 3 + 1]!, z: portal.positions[v * 3 + 2]! });
    faces.push([corner(portal.indices[t]!), corner(portal.indices[t + 1]!), corner(portal.indices[t + 2]!)]);
  }
  const groundAt = (x: number, z: number): number => sampleField(world.ground, x, z, 0);
  return { line, height: profile.height, cross, width, spans: tunnels.spans, rooms, boxes, faces, groundAt };
}

type Tunnels = ReturnType<typeof tunnelsOf>;

/** What is wrong with a view of a car in a world's tunnels: the eye in a wall or the ceiling, the car hidden behind one or a portal's face, or the eye above the ceiling's clearance. */
function problemWith(view: ChaseView, carAt: Point, t: Tunnels): string | null {
  const eye = view.eye;
  for (const box of t.boxes) {
    // Most boxes are far from both: skip them at once.
    const reach = Math.hypot(box.half.x, box.half.y, box.half.z);
    const mid = { x: (eye.x + carAt.x) / 2, y: (eye.y + carAt.y) / 2, z: (eye.z + carAt.z) / 2 };
    if (Math.hypot(mid.x - box.centre.x, mid.z - box.centre.z) > reach + cfg.back + 2) continue;
    if (segmentHitsBox(eye, carAt, box)) return 'a wall or the ceiling stands between the eye and the car, or the eye is in one';
  }
  for (const [A, B, C] of t.faces) if (segmentHitsTriangle(eye, carAt, A, B, C)) return 'a portal’s face stands between the eye and the car';
  const room = t.rooms(eye.x, eye.z);
  if (room?.under && eye.y > room.ceiling - cfg.clearance + 1e-6) return `the eye is ${(eye.y - room.ceiling).toFixed(2)} m from the ceiling`;
  return null;
}

/** The point `lateral` metres right of the centre line at sample i, on the road, raised by `up`. */
function onRoad(t: Tunnels, i: number, lateral: number, up: number): Point {
  const { line } = t;
  return { x: line.x[i]! - line.tz[i]! * lateral, y: t.height[i]! + (t.cross ? t.cross[i]! * lateral : 0) + up, z: line.z[i]! + line.tx[i]! * lateral };
}

describe('the chase camera in every tunnel of seeds 1 to 200 (M6.2c)', () => {
  const seeds = Array.from({ length: 200 }, (_, k) => k + 1);
  const tunnelled = seeds.filter((seed) => {
    const track = generateTrack(seed, config);
    return track.candidates[track.winnerIndex]!.tunnels.length > 0;
  });
  const worlds = tunnelled.map((seed) => tunnelsOf(generateWorld(seed, config)));

  it('finds the 13 seeds with a tunnel', () => {
    expect(tunnelled).toEqual([11, 13, 35, 50, 82, 130, 136, 140, 146, 171, 174, 176, 179]);
  });

  it('never stands in a wall, behind one or a portal’s face, or over the ceiling, for a car standing anywhere across the road from 20 m before each tunnel to 20 m after it, facing any way', () => {
    let views = 0;
    for (const [w, t] of worlds.entries()) {
      const n = t.line.count;
      const pad = Math.round(20 / t.line.spacing);
      for (const span of t.spans) {
        for (let k = -pad; k < span.sampleCount + pad; k++) {
          const i = (((span.startIndex + k) % n) + n) % n;
          const half = t.width[i]! / 2;
          for (const lateral of [-(half + 0.9), -half / 2, 0, half / 2, half + 0.9]) {
            const at = onRoad(t, i, lateral, RIDE);
            for (let turn = 0; turn < 12; turn++) {
              const a = (turn * Math.PI) / 6;
              // Along the road turned by a, towards its right.
              const fx = Math.cos(a) * t.line.tx[i]! - Math.sin(a) * t.line.tz[i]!;
              const fz = Math.cos(a) * t.line.tz[i]! + Math.sin(a) * t.line.tx[i]!;
              const car: ChaseCar = { position: at, rotation: facing(fx, fz), velocity: { x: 0, y: 0, z: 0 } };
              const view = chaseStart(car, t.groundAt, cfg, t.rooms);
              views++;
              const problem = problemWith(view, at, t);
              expect(problem, `seed ${tunnelled[w]} sample ${i} lateral ${lateral.toFixed(1)} turned ${turn * 30} degrees`).toBeNull();
            }
          }
        }
      }
    }
    expect(views).toBeGreaterThan(50_000);
  });

  it('never does so for a car driven through each tunnel at 45 m/s, down the middle and weaving from barrier to barrier, sliding', () => {
    const dt = 1 / 60;
    const speed = 45;
    for (const [w, t] of worlds.entries()) {
      const n = t.line.count;
      for (const span of t.spans) {
        for (const weave of [0, 1]) {
          let view: ChaseView | null = null;
          const first = span.startIndex * t.line.spacing - 60;
          const last = (span.startIndex + span.sampleCount) * t.line.spacing + 60;
          for (let d = first, frame = 0; d <= last; d += speed * dt, frame++) {
            const along = d / t.line.spacing;
            const i = ((Math.floor(along) % n) + n) % n;
            const lateral = weave * (t.width[i]! / 2 + 0.9) * Math.sin(d / 25);
            const at = onRoad(t, i, lateral, RIDE);
            // Heading along the road, turned by the weave.
            const turn = weave * Math.atan(((t.width[i]! / 2 + 0.9) / 25) * Math.cos(d / 25));
            const fx = Math.cos(turn) * t.line.tx[i]! - Math.sin(turn) * t.line.tz[i]!;
            const fz = Math.cos(turn) * t.line.tz[i]! + Math.sin(turn) * t.line.tx[i]!;
            // A slide one way, then the other, every two seconds.
            const dir: 1 | -1 = Math.floor(frame / 120) % 2 === 0 ? 1 : -1;
            const car: ChaseCar = {
              position: at,
              rotation: facing(fx, fz),
              velocity: { x: fx * speed, y: 0, z: fz * speed },
              drift: weave ? { phase: 'slide', dir, boostLeft: 0 } : undefined,
            };
            view = view ? chaseNext(view, car, dt, t.groundAt, cfg, t.rooms) : chaseStart(car, t.groundAt, cfg, t.rooms);
            const problem = problemWith(view, at, t);
            expect(problem, `seed ${tunnelled[w]} at ${d.toFixed(1)} m${weave ? ', weaving' : ''}`).toBeNull();
          }
        }
      }
    }
  });
});
