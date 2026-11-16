import type { PhysicsConfig } from '../../config';
import type { WorldResult } from '../../gen/types';
import type { Quat, Vec3 } from '../quat';
import type { Pose } from '../start';
import { addWorldColliders, type WorldColliders } from './colliders';
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

/**
 * The physics world of one race: the island's colliders and the car's body.
 * The rest of the simulation drives it through these few functions and never
 * sees the physics engine itself.
 */
export interface CarPhysics {
  /** The handles of everything the car can hit, by what it is. */
  readonly colliders: WorldColliders;
  /** Moves everything on by one step of the simulation's clock. */
  step(): void;
  motion(): BodyMotion;
  /** Everything needed to come back to this moment: the engine's whole world, as bytes. */
  snapshot(): Uint8Array;
  /** Goes back to a moment saved by `snapshot`, from this world or another built from the same island. */
  restore(saved: Uint8Array): void;
  /** Hands the engine's memory back. */
  free(): void;
}

/**
 * Builds the physics world for an island and stands the car's body in it.
 * The body is one solid box, always awake, with continuous collision
 * detection so that at full speed it cannot pass through a thin wall between
 * two steps.
 */
export function createCarPhysics(rapier: Rapier, world: WorldResult, cfg: PhysicsConfig, start: Pose): CarPhysics {
  let physics: PhysicsWorld = new rapier.World({ x: 0, y: -cfg.sim.gravity, z: 0 });
  physics.timestep = 1 / cfg.sim.stepsPerSecond;
  const colliders = addWorldColliders(rapier, physics, world, cfg);

  const { halfWidth, halfHeight, halfLength } = cfg.car.body;
  let body: RigidBody = physics.createRigidBody(
    rapier.RigidBodyDesc.dynamic()
      .setTranslation(start.position.x, start.position.y, start.position.z)
      .setRotation(start.rotation)
      .setCcdEnabled(true)
      .setCanSleep(false),
  );
  physics.createCollider(
    rapier.ColliderDesc.cuboid(halfWidth, halfHeight, halfLength).setMass(cfg.car.mass).setFriction(cfg.car.grip).setRestitution(cfg.car.bounce),
    body,
  );
  // A handle is a plain number that names the body in this world and in any world restored from a snapshot of it.
  const bodyHandle = body.handle;

  return {
    colliders,
    step: () => physics.step(),
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
