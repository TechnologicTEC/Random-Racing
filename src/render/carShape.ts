import type { GameConfig, KartViewConfig } from '../config';
import { STEER_STEPS } from '../sim/input';
import { rotate, type Quat, type Vec3 } from '../sim/quat';
import type { CarState } from '../sim/sim';
import { driftSprites, hopLift, hopSquash, leanAngle, type Sprite } from './driftEffects';
import { KART, type Rgb } from './palette';
import { createShapeBuilder, type Shape } from './treeShapes';

/**
 * The kart, as plain triangle data ready to be wrapped in a Three.js geometry
 * (`carView.ts`), and where its parts are drawn from the simulation's state.
 * No Three.js here, so it can be tested on its own.
 *
 * The body is measured in the simulated body's own directions, from its
 * middle: the front is -z, the right +x and the roof +y. It lies inside the
 * simulated box (1.4 by 0.6 by 2.2 m), so what is drawn is what is hit. With
 * the car riding at 26 cm, its floor is 26 cm off the road and the top of the
 * helmet 86 cm. Built from flat-coloured facets (docs/VISUAL_BAR.md).
 */

type Point = readonly [x: number, y: number, z: number];

/** The six faces of a block given its eight corners: the bottom four, then the top four above them in the same order. */
const BLOCK_FACES = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
] as const;

type Builder = ReturnType<typeof createShapeBuilder>;

/**
 * A convex solid from its corners and faces (each face a flat loop of
 * corners). Each triangle is wound to face away from the solid's middle,
 * whichever way round its corners were listed, so it is seen from outside.
 */
function solid(b: Builder, corners: readonly Point[], faces: ReadonlyArray<readonly number[]>, colour: Rgb): void {
  const middle = corners.reduce((sum, p) => [sum[0] + p[0] / corners.length, sum[1] + p[1] / corners.length, sum[2] + p[2] / corners.length], [0, 0, 0]);
  const index = corners.map(([x, y, z]) => b.vertex(x, y, z, colour));
  for (const face of faces) {
    for (let k = 1; k + 1 < face.length; k++) {
      const [a, c, d] = [face[0]!, face[k]!, face[k + 1]!];
      const [p, q, r] = [corners[a]!, corners[c]!, corners[d]!];
      const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
      const normal = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const out = (p[0] - middle[0]) * normal[0]! + (p[1] - middle[1]) * normal[1]! + (p[2] - middle[2]) * normal[2]!;
      if (out >= 0) b.triangle(index[a]!, index[c]!, index[d]!);
      else b.triangle(index[a]!, index[d]!, index[c]!);
    }
  }
}

/**
 * A block with a level bottom and a level top, each a rectangle on the map:
 * `[left, right, front, back, height]`. The top can be narrower, shorter or
 * set back from the bottom, which gives the wedges and sloped backs.
 */
function block(b: Builder, bottom: readonly number[], top: readonly number[], colour: Rgb): void {
  const ring = ([x0, x1, z0, z1, y]: readonly number[]): Point[] => [
    [x0!, y!, z0!],
    [x1!, y!, z0!],
    [x1!, y!, z1!],
    [x0!, y!, z1!],
  ];
  solid(b, [...ring(bottom), ...ring(top)], BLOCK_FACES, colour);
}

/** A block and its mirror image across the car's middle line, from the right-hand one's numbers. */
function pair(b: Builder, bottom: readonly number[], top: readonly number[], colour: Rgb): void {
  block(b, bottom, top, colour);
  const mirror = ([x0, x1, ...rest]: readonly number[]) => [-x1!, -x0!, ...rest];
  block(b, mirror(bottom), mirror(top), colour);
}

/**
 * The kart's body, driver and all, without its wheels: a low floor, a wedge
 * nose with a bumper, side pods, an engine block behind, a seat, the driver's
 * body, a steering wheel and a round helmet with its visor.
 */
export function kartBody(): Shape {
  const b = createShapeBuilder();
  // Each rectangle is [left, right, front, back, height]; the front is -z.
  block(b, [-0.46, 0.46, -0.95, 0.95, -0.3], [-0.46, 0.46, -0.95, 0.95, -0.24], KART.chassis); // floor
  block(b, [-0.44, 0.44, -1.1, -1.03, -0.28], [-0.44, 0.44, -1.1, -1.03, -0.21], KART.chassis); // bumper
  block(b, [-0.34, 0.34, -1.03, -0.45, -0.27], [-0.3, 0.3, -1.0, -0.45, -0.15], KART.body); // nose, low at the front
  block(b, [-0.36, 0.36, -0.75, -0.45, -0.15], [-0.32, 0.32, -0.6, -0.45, -0.02], KART.body); // cowl in front of the driver
  pair(b, [0.44, 0.68, -0.3, 0.5, -0.28], [0.44, 0.64, -0.24, 0.44, -0.08], KART.body); // side pods
  block(b, [-0.42, 0.42, 0.72, 1.1, -0.26], [-0.38, 0.38, 0.76, 1.06, -0.06], KART.chassis); // engine and rear bumper
  block(b, [-0.24, 0.24, 0.3, 0.52, -0.24], [-0.22, 0.22, 0.44, 0.6, 0.14], KART.chassis); // seat, leaning back
  block(b, [-0.2, 0.2, 0.0, 0.42, -0.24], [-0.17, 0.17, 0.12, 0.38, 0.06], KART.driver); // the driver's body
  block(b, [-0.13, 0.13, -0.16, -0.1, -0.02], [-0.13, 0.13, -0.13, -0.07, 0.06], KART.chassis); // steering wheel
  b.ball(0, 0.165, 0.22, 0.13, 0.13, 0.13, KART.helmet, { split: true }); // helmet
  block(b, [-0.09, 0.09, 0.07, 0.12, 0.14], [-0.09, 0.09, 0.07, 0.12, 0.2], KART.chassis); // visor
  return b.finish();
}

/** Sides of each tyre. */
const TYRE_SIDES = 12;
/** The pale hub's share of the tyre's radius. */
const HUB = 0.6;

/**
 * One wheel: a fat faceted tyre turning about the x axis, centred on its own
 * middle, with a pale hub on its +x face. The wheels on the car's right are
 * drawn as it is; those on its left are turned half round so their hubs face out.
 */
export function kartWheel(look: KartViewConfig): Shape {
  const b = createShapeBuilder();
  const r = look.wheelRadius;
  const half = look.wheelWidth / 2;
  const round = (radius: number, x: number): Point[] =>
    Array.from({ length: TYRE_SIDES }, (_, k): Point => {
      const angle = ((k + 0.5) / TYRE_SIDES) * Math.PI * 2;
      return [x, Math.cos(angle) * radius, Math.sin(angle) * radius];
    });
  const sides = Array.from({ length: TYRE_SIDES }, (_, k) => [k, (k + 1) % TYRE_SIDES, TYRE_SIDES + ((k + 1) % TYRE_SIDES), TYRE_SIDES + k]);
  const ring = Array.from({ length: TYRE_SIDES }, (_, k) => k);
  // The tread, and the tyre's inner wall.
  solid(b, [...round(r, -half), ...round(r, half)], [...sides, ring], KART.tyre);
  // The outer wall: a ring of tyre round a pale hub, as two flat pieces that do not overlap.
  const outer = round(r, half);
  const inner = round(r * HUB, half);
  const wall = [...outer, ...inner];
  const wallIndex = wall.map(([x, y, z]) => b.vertex(x, y, z, KART.tyre));
  for (let k = 0; k < TYRE_SIDES; k++) {
    const next = (k + 1) % TYRE_SIDES;
    // Wound to face +x, out of the wheel.
    b.triangle(wallIndex[k]!, wallIndex[next]!, wallIndex[TYRE_SIDES + next]!);
    b.triangle(wallIndex[k]!, wallIndex[TYRE_SIDES + next]!, wallIndex[TYRE_SIDES + k]!);
  }
  const hub = inner.map(([x, y, z]) => b.vertex(x, y, z, KART.hub));
  const centre = b.vertex(half, 0, 0, KART.hub);
  for (let k = 0; k < TYRE_SIDES; k++) b.triangle(centre, hub[k]!, hub[(k + 1) % TYRE_SIDES]!);
  return b.finish();
}

/** Where the kart and its wheels are drawn at one moment. */
export interface KartPose {
  /** The body's middle and turn, as the simulation has them. */
  position: Vec3;
  rotation: Quat;
  /**
   * Front left, front right, rear left, rear right: the middle of each drawn wheel in the body's own directions,
   * and how far it is turned about the body's up (radians, positive to the left).
   */
  wheels: Array<{ at: Vec3; turn: number }>;
  /** The drift's effects (sparks, burst, smoke, flame), in the body's own directions (`driftSprites`). */
  sprites: Sprite[];
  /** How far the body is drawn leaned out of a slide, in radians about its front, positive to the left (`leanAngle`); the wheels stay on the road. */
  lean: number;
  /** The share of its height the body is drawn at: 1, less as the hop lands (`hopSquash`). */
  squash: number;
}

/**
 * Where to draw a ghost (M5.3): the kart at a place its run kept, which has
 * only the body's position and turn. Its wheels are drawn as the resting kart's
 * (`resting`, from `kartPose` of a car at rest), unturned, and nothing of a
 * drift is drawn: no lean, no hop, no sparks or smoke.
 */
export function ghostPose(place: { position: Vec3; rotation: Quat }, resting: KartPose): KartPose {
  return {
    position: place.position,
    rotation: place.rotation,
    wheels: resting.wheels.map((wheel) => ({ at: wheel.at, turn: 0 })),
    sprites: [],
    lean: 0,
    squash: 1,
  };
}

/**
 * Where to draw the kart from the simulation's state. Each wheel is drawn
 * where the simulation's wheel is (the middle of the small ball it casts, so
 * the springs show), lifted so the bottom of the drawn tyre is where the
 * ball's bottom is: on the ground, with no gap and no sinking. The front
 * wheels are turned with the stick, and against the slide while the nose is
 * swung in. The drift adds the hop, the body's lean and squash, and the
 * sparks, burst, smoke and boost flame (`driftEffects.ts`).
 */
export function kartPose(state: CarState, cfg: Pick<GameConfig, 'car' | 'render' | 'sim'>): KartPose {
  const { rotation } = state;
  const back = { x: -rotation.x, y: -rotation.y, z: -rotation.z, w: rotation.w };
  const look = cfg.render.car;
  const lift = cfg.render.car.wheelRadius - cfg.car.wheels.radius;
  const steer = state.input.steer / STEER_STEPS;
  // A stick to the right turns the wheels clockwise seen from above: negative about the roof. In a slide they are
  // drawn turned against it, out of the corner, as far as the nose has swung in: positive in a slide to the right.
  const swung = cfg.car.drift.angle > 0 ? state.drift.angle / cfg.car.drift.angle : 0;
  const stickTurn = steer === 0 ? 0 : -steer * look.steerAngle;
  const frontTurn = swung > 0 && state.drift.dir !== 0 ? stickTurn * (1 - swung) + state.drift.dir * look.counterSteer * swung : stickTurn;
  const wheels = state.wheels.map((wheel, i) => {
    const local = rotate(back, { x: wheel.at.x - state.position.x, y: wheel.at.y - state.position.y, z: wheel.at.z - state.position.z });
    return { at: { x: local.x, y: local.y + lift, z: local.z }, turn: i < 2 ? frontTurn : 0 };
  });
  // The hop lifts the whole kart along its roof, drawn only: the simulation keeps it on its springs.
  const hop = hopLift(state.drift.hop, cfg.car.drift.hop.height);
  const up = hop === 0 ? null : rotate(rotation, { x: 0, y: 1, z: 0 });
  const position = up ? { x: state.position.x + up.x * hop, y: state.position.y + up.y * hop, z: state.position.z + up.z * hop } : state.position;
  const ground = (wheel: { at: Vec3 }): Vec3 => ({ x: wheel.at.x, y: wheel.at.y - look.wheelRadius, z: wheel.at.z });
  const motion = rotate(back, state.velocity);
  return {
    position,
    rotation,
    wheels,
    sprites: driftSprites({ drift: state.drift, step: state.step, rear: [ground(wheels[2]!), ground(wheels[3]!)], motion }, look, cfg.car.drift.boosts, cfg.sim.stepsPerSecond),
    lean: leanAngle(state.drift, cfg.car.drift.angle, look),
    squash: hopSquash(state.drift.hop, look.squash),
  };
}
