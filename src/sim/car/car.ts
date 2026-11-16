import type { PhysicsConfig } from '../../config';
import { inputFractions, type InputRecord } from '../input';
import type { BodyMotion, CarPhysics } from '../physics/carBody';
import { rotate, type Vec3 } from '../quat';
import { add, cross, dot, scale, sub, unit } from '../vec';
import { speedChange } from './drive';
import { sideGrip, turnGrip } from './grip';
import { twistFor, uprightChange } from './stability';
import { turnWanted } from './steer';
import { springOf, springPush, wheelMounts } from './suspension';
import type { Surface } from './surface';

/** One wheel, as it is now. */
export interface WheelState {
  /** Whether it is on the ground. */
  touching: boolean;
  /** How far its spring is squashed from its free length, in metres. 0 off the ground. */
  squash: number;
  /** What it is standing on, or null off the ground. */
  surface: Surface | null;
  /** Where the wheel is: the middle of its ball. Off the ground it hangs at the full length of its spring. */
  at: Vec3;
}

/** What the car's own sums add to the body's motion, for drawing, the camera and the readout. */
export interface CarReading {
  /** Front left, front right, rear left, rear right. */
  wheels: WheelState[];
  /** The car's speed along itself, in metres per second: negative when it rolls backwards. */
  speed: number;
}

/** The handling of one car: the sums that turn what the driver asks for into pushes on its body. */
export interface Car {
  /** The wheels and the speed as they are now. */
  read(): CarReading;
  /** Works out one step's pushes and gives them to the body. Call it once, just before the physics moves on a step. */
  step(input: InputRecord): void;
}

const FORWARD = { x: 0, y: 0, z: -1 };
const UP = { x: 0, y: 1, z: 0 };

/**
 * Joins the car's handling to its body. Every sum here starts from the body's
 * motion and the four wheel casts as they are at that moment, and keeps
 * nothing from one step to the next, so there is nothing of its own to save
 * in a snapshot or to cover in a fingerprint.
 *
 * @param surfaceOf names what a wheel met (`surfaceFinder`)
 */
export function createCar(physics: CarPhysics, cfg: PhysicsConfig, surfaceOf: (collider: number, x: number, z: number) => Surface): Car {
  const car = cfg.car;
  const dt = 1 / cfg.sim.stepsPerSecond;
  const spring = springOf(cfg);
  const mounts = wheelMounts(car);

  /** Feels for the ground under each wheel: a ball cast from the spring's mount, straight down in the car's own directions. */
  function feel(motion: BodyMotion): Array<WheelState & { normal: Vec3 }> {
    const up = rotate(motion.rotation, UP);
    const down = scale(up, -1);
    return mounts.map((mount) => {
      const from = add(motion.position, rotate(motion.rotation, mount));
      const hit = physics.castWheel(from, down, spring.free);
      if (!hit) return { touching: false, squash: 0, surface: null, at: add(from, scale(down, spring.free)), normal: up };
      const at = add(from, scale(down, hit.distance));
      // A wheel that starts inside the ground (the car has dropped onto its underside) is given no slope by the cast: use the car's own up.
      const normal = hit.distance > 0 ? hit.normal : up;
      return { touching: true, squash: spring.free - hit.distance, surface: surfaceOf(hit.collider, at.x, at.z), at, normal };
    });
  }

  const speedOf = (motion: BodyMotion): number => dot(motion.velocity, rotate(motion.rotation, FORWARD));

  return {
    read() {
      const motion = physics.motion();
      return { wheels: feel(motion).map(({ touching, squash, surface, at }) => ({ touching, squash, surface, at })), speed: speedOf(motion) };
    },

    step(input) {
      const pedals = inputFractions(input);
      const motion = physics.motion();
      const wheels = feel(motion);
      const up = rotate(motion.rotation, UP);
      /** Changes the body's spin by `change`, in radians per second. */
      const spinBy = (change: Vec3): void => physics.twist(twistFor(change, motion.rotation, car));

      // The springs: each wheel on the ground pushes the body away from it, where the wheel is.
      let grounded = 0;
      let ground = { x: 0, y: 0, z: 0 };
      for (const wheel of wheels) {
        if (!wheel.touching) continue;
        grounded++;
        ground = add(ground, wheel.normal);
        // How fast the body is moving at the wheel: its own speed, and its turning about its middle.
        const moving = add(motion.velocity, cross(motion.spin, sub(wheel.at, motion.position)));
        const closing = -dot(moving, wheel.normal);
        physics.push(scale(wheel.normal, springPush(spring, wheel.squash, closing, dt)), wheel.at);
      }
      // In the air, the only thing that acts is the turn that brings the roof back up.
      if (grounded === 0) {
        spinBy(uprightChange(up, motion.spin, car, dt));
        return;
      }

      // The tyres. Along and across the ground under the car, they act on the speed the car would have at the end of the
      // step if they did nothing: its speed now and what gravity adds in one step. So a parked car stays exactly where it is.
      const share = grounded / wheels.length;
      const normal = unit(ground);
      const facing = rotate(motion.rotation, FORWARD);
      const along = unit(sub(facing, scale(normal, dot(facing, normal))));
      const across = cross(along, normal);
      const coming = { x: motion.velocity.x, y: motion.velocity.y - cfg.sim.gravity * dt, z: motion.velocity.z };
      // Through the body's middle, so they neither roll it nor pitch it.
      physics.push(scale(across, car.mass * sideGrip(dot(coming, across), share, car, dt)));
      const pull = dot(coming, along) - dot(motion.velocity, along);
      physics.push(scale(along, car.mass * speedChange(dot(motion.velocity, along), pull, pedals, share, car, dt)));
      // And they bring the car's turning to what the stick asks for, as fast as they can.
      const wanted = turnWanted(pedals.steer, dot(motion.velocity, along), car);
      spinBy(scale(up, turnGrip(dot(motion.spin, up), wanted, share, car, dt)));
    },
  };
}
