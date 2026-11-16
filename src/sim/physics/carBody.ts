import type { PhysicsConfig } from '../../config';
import type { Course } from '../course';
import type { Quat, Vec3 } from '../quat';
import type { Pose } from '../start';
import { addCourseColliders, WHEEL_GROUPS, type WorldColliders } from './colliders';
import type { Rapier } from './rapier';

type PhysicsWorld = InstanceType<Rapier['World']>;
type RigidBody = InstanceType<Rapier['RigidBody']>;

/** How the car's body is moving, as plain numbers read from the physics engine. */
export interface BodyMotion {
  position: Vec3;
  rotation: Quat;
  /** Metres per second. */
  velocity: Vec3;
  /** How fast it is turning about each axis, in radians per second. */
  spin: Vec3;
}

/** What a wheel's cast met. */
export interface WheelHit {
  /** How far the wheel travelled before it touched, in metres. */
  distance: number;
  /** The slope of what it touched there: one long, pointing out of the surface towards the wheel. */
  normal: Vec3;
  /** The handle of the collider it touched (see `WorldColliders`). */
  collider: number;
}

/**
 * The physics world of one race: the course's colliders and the car's body.
 * The rest of the simulation drives it through these few functions and never
 * sees the physics engine itself.
 */
export interface CarPhysics {
  /** The handles of everything the car can hit, by what it is. */
  readonly colliders: WorldColliders;
  /** Moves everything on by one step of the simulation's clock: gravity's pull on the car for the step, then the engine's step. */
  step(): void;
  motion(): BodyMotion;
  /**
   * Casts a wheel: a small ball (`car.wheels.radius`) moved from a point in a
   * direction until it touches something that can be driven on. The ground, the
   * road and the kerbs stop it; walls, the gate, trees, rocks and the car do not.
   *
   * @param from where the middle of the ball starts
   * @param direction the way it moves; one long
   * @param reach the furthest it moves, in metres
   * @returns what it met, or null if it met nothing within reach
   */
  castWheel(from: Vec3, direction: Vec3, reach: number): WheelHit | null;
  /**
   * Pushes the body: an impulse in newton seconds, which changes its speed at
   * once by the impulse over its mass. Through its middle unless a point is
   * given; a push off the middle turns it as well.
   */
  push(impulse: Vec3, at?: Vec3): void;
  /** Twists the body about its middle: a turning impulse, which changes how fast it turns at once and does not move it. */
  twist(impulse: Vec3): void;
  /** Everything needed to come back to this moment: the engine's whole world, as bytes. */
  snapshot(): Uint8Array;
  /** Goes back to a moment saved by `snapshot`, from this world or another built from the same island. */
  restore(saved: Uint8Array): void;
  /** Hands the engine's memory back. */
  free(): void;
}

/**
 * Builds the physics world for a course and stands the car's body in it.
 * The body is one solid box, always awake, with continuous collision
 * detection so that at full speed it cannot pass through a thin wall between
 * two steps.
 *
 * Gravity is given to the car as one push at the start of each step, not left
 * to the engine. The engine spreads gravity through a step in several small
 * moves, so a car held up by pushes given once a step would read as falling at
 * every step's end while standing still. With gravity as one push like the
 * others, the body's speed at a step's end is simply its speed, and it moves
 * by that speed times the step.
 */
export function createCarPhysics(rapier: Rapier, course: Course, cfg: PhysicsConfig, start: Pose): CarPhysics {
  let physics: PhysicsWorld = new rapier.World({ x: 0, y: 0, z: 0 });
  const weight = { x: 0, y: (-cfg.sim.gravity * cfg.car.mass) / cfg.sim.stepsPerSecond, z: 0 };
  physics.timestep = 1 / cfg.sim.stepsPerSecond;
  const colliders = addCourseColliders(rapier, physics, course, cfg);
  // One step with nothing in the world that can move. The engine only learns where colliders are when it steps, and the
  // wheels must be able to feel the ground before the car's first step.
  physics.step();

  const { halfWidth, halfHeight, halfLength, grip, bounce } = cfg.car.body;
  let body: RigidBody = physics.createRigidBody(
    rapier.RigidBodyDesc.dynamic()
      .setTranslation(start.position.x, start.position.y, start.position.z)
      .setRotation(start.rotation)
      .setCcdEnabled(true)
      .setCanSleep(false),
  );
  physics.createCollider(
    rapier.ColliderDesc.cuboid(halfWidth, halfHeight, halfLength).setMass(cfg.car.mass).setFriction(grip).setRestitution(bounce),
    body,
  );
  // A handle is a plain number that names the body in this world and in any world restored from a snapshot of it.
  const bodyHandle = body.handle;
  const wheel = new rapier.Ball(cfg.car.wheels.radius);
  const NO_TURN = { x: 0, y: 0, z: 0, w: 1 };

  return {
    colliders,
    step() {
      body.applyImpulse(weight, true);
      physics.step();
    },
    motion() {
      const at = body.translation();
      const turn = body.rotation();
      const moving = body.linvel();
      const turning = body.angvel();
      return {
        position: { x: at.x, y: at.y, z: at.z },
        rotation: { x: turn.x, y: turn.y, z: turn.z, w: turn.w },
        velocity: { x: moving.x, y: moving.y, z: moving.z },
        spin: { x: turning.x, y: turning.y, z: turning.z },
      };
    },
    castWheel(from, direction, reach) {
      const hit = physics.castShape(from, NO_TURN, direction, wheel, 0, reach, true, undefined, WHEEL_GROUPS, undefined, body);
      if (!hit) return null;
      // Out of the surface, towards the wheel, whichever way the triangle it met was wound.
      const n = hit.normal1;
      const facing = n.x * direction.x + n.y * direction.y + n.z * direction.z > 0 ? -1 : 1;
      return { distance: hit.time_of_impact, normal: { x: n.x * facing, y: n.y * facing, z: n.z * facing }, collider: hit.collider.handle };
    },
    push(impulse, at) {
      if (at) body.applyImpulseAtPoint(impulse, at, true);
      else body.applyImpulse(impulse, true);
    },
    twist: (impulse) => body.applyTorqueImpulse(impulse, true),
    snapshot: () => physics.takeSnapshot(),
    restore(saved) {
      const restored = rapier.World.restoreSnapshot(saved);
      const found = restored.getRigidBody(bodyHandle);
      if (!found) {
        restored.free();
        throw new Error('The snapshot does not hold this car');
      }
      physics.free();
      physics = restored;
      physics.timestep = 1 / cfg.sim.stepsPerSecond;
      body = found;
    },
    free: () => physics.free(),
  };
}
