import { createHasher } from '../../core/hash';
import type { WorldResult } from '../../gen/types';
import { groundCollider, meshCollider } from './colliders';
import type { Rapier } from './rapier';

type PhysicsWorld = InstanceType<Rapier['World']>;
type RigidBody = InstanceType<Rapier['RigidBody']>;

/**
 * The drop proof: a car-sized box thrown, spinning, down a seed's start
 * straight. It lands, tumbles over the road and the ground and comes to rest,
 * so its path depends on contacts, friction and rotation: everything in the
 * physics engine that could differ between computers. Its fingerprint must be
 * the same in Node and in every browser (`e2e/determinism.spec.ts`).
 *
 * From Milestone 3's step 1, before there was a car. Cheap enough to keep as a
 * canary once the car's own laps are fingerprinted.
 */
export interface DropProof {
  /** Advances the physics by this many steps of 1/60 s. */
  step(count: number): void;
  /** A fingerprint of the box as it is now: where it is, how it is turned and how it is moving, bit for bit. */
  fingerprint(): string;
  /** Everything needed to carry on from this moment in another physics world. */
  snapshot(): Uint8Array;
  /** Where the middle of the box is, in metres. */
  box(): { x: number; y: number; z: number };
  /** Hands the physics world's memory back. */
  free(): void;
}

/** Steps a second: the rate the game's simulation will run at. */
const STEPS_PER_SECOND = 60;

/** Half the box's width, height and length, in metres: about the size of the car. */
const HALF = { x: 0.7, y: 0.35, z: 1.1 };

function proofOf(physics: PhysicsWorld, body: RigidBody): DropProof {
  return {
    step(count) {
      for (let i = 0; i < count; i++) physics.step();
    },
    fingerprint() {
      const at = body.translation();
      const turn = body.rotation();
      const moving = body.linvel();
      const spinning = body.angvel();
      return createHasher()
        .numbers([at.x, at.y, at.z, turn.x, turn.y, turn.z, turn.w])
        .numbers([moving.x, moving.y, moving.z, spinning.x, spinning.y, spinning.z])
        .digest();
    },
    snapshot: () => physics.takeSnapshot(),
    box: () => {
      const { x, y, z } = body.translation();
      return { x, y, z };
    },
    free: () => physics.free(),
  };
}

/** Sets the box off above the start line of a seed's track. */
export function startDropProof(rapier: Rapier, world: WorldResult): DropProof {
  const physics = new rapier.World({ x: 0, y: -9.81, z: 0 });
  physics.timestep = 1 / STEPS_PER_SECOND;
  physics.createCollider(groundCollider(rapier, world.ground));
  physics.createCollider(meshCollider(rapier, world.road.mesh));
  physics.createCollider(meshCollider(rapier, world.road.kerbs.mesh));

  const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
  // Thrown along the start straight at 20 m/s from 5 m up, already spinning about all three axes.
  const body = physics.createRigidBody(
    rapier.RigidBodyDesc.dynamic()
      .setTranslation(line.x[0]!, profile.height[0]! + 5, line.z[0]!)
      .setLinvel(line.tx[0]! * 20, 0, line.tz[0]! * 20)
      .setAngvel({ x: 1.5, y: 2.5, z: 0.75 })
      .setCanSleep(false),
  );
  physics.createCollider(rapier.ColliderDesc.cuboid(HALF.x, HALF.y, HALF.z).setDensity(300).setFriction(0.7).setRestitution(0.3), body);
  return proofOf(physics, body);
}

/** Carries a drop proof on from a snapshot of it. */
export function resumeDropProof(rapier: Rapier, saved: Uint8Array): DropProof {
  const physics = rapier.World.restoreSnapshot(saved);
  let box: RigidBody | null = null;
  physics.forEachRigidBody((body) => {
    if (body.isDynamic()) box = body;
  });
  if (!box) throw new Error('The snapshot holds no box');
  return proofOf(physics, box);
}

/**
 * The whole proof as one fingerprint: ten seconds of the box's flight, mixed in
 * twice a second, so two runs agree only if they agreed all the way.
 */
export function dropFingerprint(rapier: Rapier, world: WorldResult): string {
  const proof = startDropProof(rapier, world);
  const hasher = createHasher();
  for (let second = 0; second < 20; second++) {
    proof.step(STEPS_PER_SECOND / 2);
    hasher.text(proof.fingerprint());
  }
  proof.free();
  return hasher.digest();
}
