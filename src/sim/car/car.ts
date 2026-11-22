import type { PhysicsConfig } from '../../config';
import { dcos, dsin } from '../../core/dmath';
import { inputFractions, type InputRecord } from '../input';
import type { BodyMotion, CarPhysics, Touch } from '../physics/carBody';
import { rotate, type Vec3 } from '../quat';
import { add, cross, dot, scale, sub, unit } from '../vec';
import { bounces, pushDirection, wallPush, wallTurn } from './bump';
import { driftSteps, NO_DRIFT, pathCurve, stepDrift, tierOf, type DriftEnd, type DriftPhase, type DriftState } from './drift';
import { speedChange } from './drive';
import { sideGrip, turnGrip } from './grip';
import { steadyNormals } from './normals';
import { twistFor, uprightChange } from './stability';
import { turnWanted } from './steer';
import { springOf, springPush, wheelMounts } from './suspension';
import { surfaceShare, type Surface } from './surface';

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

/** The drift as it is now, for drawing, the camera and the readout. */
export interface DriftView {
  phase: DriftPhase;
  /** The side of the slide: -1 left, 1 right, 0 none. */
  dir: -1 | 0 | 1;
  /** The tier the charge has reached while sliding (1 blue, 2 orange, 3 purple), 0 otherwise. */
  tier: 0 | 1 | 2 | 3;
  /** How far the nose is turned into the corner from the line of travel, in radians. */
  angle: number;
  /** How much of the hop is still to come, from 1 on its first step down to 0 with no hop. */
  hop: number;
  /** How long the boost has left, in seconds; 0 with none. */
  boostLeft: number;
  /** The tier of the boost running, 0 with none. */
  boostTier: 0 | 1 | 2 | 3;
  /** Why the last slide ended, null before any has (step 10a). */
  ended: DriftEnd | null;
  /** How many slides have ended. */
  ends: number;
}

/** What the car's own sums add to the body's motion, for drawing, the camera and the readout. */
export interface CarReading {
  /** Front left, front right, rear left, rear right. */
  wheels: WheelState[];
  /** The car's speed along itself, in metres per second: negative when it rolls backwards. */
  speed: number;
  drift: DriftView;
  /** The top speed for the wheels as they are now, in metres per second: lower off the road (step 7a), higher while a boost runs. */
  top: number;
}

/** Everything the car remembers from one step to the next, as plain numbers: it goes into the fingerprint and the snapshot. */
export interface CarMemory {
  drift: DriftState;
  /** Steps since the body last touched a wall or the gate, up to `bump.again` in steps: at that, the next touch is a new hit. */
  sinceWall: number;
  /** Which wheels' ground directions were odd on the last step (10a-4, `steadyNormals`): front left, front right, rear left, rear right. */
  odd: boolean[];
  /**
   * Physics steps since the body last touched a wall, the gate, a tree or a rock, up to `bump.hold` in steps and one
   * more (10a-6): while it is at most `bump.hold`, the turning and the rise are held (`settle`).
   */
  sinceHit: number;
}

const NONE_ODD: readonly boolean[] = [false, false, false, false];

/** The handling of one car: the sums that turn what the driver asks for into pushes on its body. */
export interface Car {
  /** The wheels, the speed and the drift as they are now. */
  read(): CarReading;
  /**
   * Works out one step's pushes and gives them to the body. Call it once, just before the physics moves on a step.
   *
   * @param touch what the body touched on the last physics step, and the contact's slope (`CarPhysics.touching`)
   */
  step(input: InputRecord, touch?: Touch | null): void;
  /**
   * Straight after a physics step: if the body touched a wall, the gate, a tree or a rock in it, or did within
   * `bump.hold` before it, holds the body's turning to `bump.spin` (Tane, 7c and 10a-6), so a hit never spins the car
   * faster than that, and its upward speed to `bump.lift`, so a hit never throws it up. The whole turning is held, its
   * roll and pitch with the spin about its up, in proportion.
   */
  settle(touch: Touch | null): void;
  /**
   * A respawn's wait has begun (rule 7): any drift is cancelled with its charge lost, and any boost ends, so letting go
   * of the button during the wait gives none. The nose swings back as after any cancel.
   */
  halt(): void;
  /** The car has been put back (a respawn): nothing remembered, as on the start line. */
  clear(): void;
  /** What the car remembers now. */
  save(): CarMemory;
  /** Goes back to what it remembered at a saved moment. */
  load(memory: CarMemory): void;
}

const FORWARD = { x: 0, y: 0, z: -1 };
const UP = { x: 0, y: 1, z: 0 };

/**
 * Joins the car's handling to its body. Every sum here starts from the body's
 * motion and the four wheel casts as they are at that moment, and from the
 * drift state and the time since it last hit a wall, which are all the car
 * remembers from one step to the next (`save`, `load`).
 *
 * @param surfaceOf names what a wheel met (`surfaceFinder`)
 */
export function createCar(physics: CarPhysics, cfg: PhysicsConfig, surfaceOf: (collider: number, x: number, z: number) => Surface): Car {
  const car = cfg.car;
  const dt = 1 / cfg.sim.stepsPerSecond;
  const spring = springOf(cfg);
  const mounts = wheelMounts(car);
  const steps = driftSteps(car, cfg.sim.stepsPerSecond);
  let drift: DriftState = NO_DRIFT;
  const again = Math.round(car.bump.again * cfg.sim.stepsPerSecond);
  let sinceWall = again;
  let odd: boolean[] = [...NONE_ODD];
  const holdSteps = Math.round(car.bump.hold * cfg.sim.stepsPerSecond);
  /** One more than the hold: nothing held. */
  const NO_HIT = holdSteps + 1;
  let sinceHit = NO_HIT;

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

  /**
   * The car's forward direction along the ground (`along`), its right (`across`) and the line it travels along
   * (`travel`): `along` turned out of the corner by the slide's angle, so the nose points that far into it.
   */
  function lines(facing: Vec3, normal: Vec3, state: DriftState): { along: Vec3; across: Vec3; travel: Vec3 } {
    const along = unit(sub(facing, scale(normal, dot(facing, normal))));
    const across = cross(along, normal);
    if (state.slide === 0) return { along, across, travel: along };
    const b = car.drift.angle * state.slide;
    return { along, across, travel: sub(scale(along, dcos(b)), scale(across, state.dir * dsin(b))) };
  }

  const speedOf = (motion: BodyMotion): number => dot(motion.velocity, rotate(motion.rotation, FORWARD));
  /** The top speed with these wheels down and this drift: off the road it is lower, and a boost raises it. */
  const topFor = (wheels: ReadonlyArray<{ surface: Surface | null }>, state: DriftState): number => {
    const top = car.engine.topSpeed * surfaceShare(wheels, car);
    return state.boostLeft > 0 ? top * car.boost.speed : top;
  };

  const view = (): DriftView => ({
    phase: drift.phase,
    dir: drift.dir,
    tier: drift.phase === 'slide' ? tierOf(drift.charge, steps) : 0,
    angle: car.drift.angle * drift.slide,
    hop: drift.hopLeft / steps.hop,
    boostLeft: drift.boostLeft / cfg.sim.stepsPerSecond,
    boostTier: drift.boostTier,
    ended: drift.ended,
    ends: drift.ends,
  });

  return {
    read() {
      const motion = physics.motion();
      const wheels = feel(motion).map(({ touching, squash, surface, at }) => ({ touching, squash, surface, at }));
      return { wheels, speed: speedOf(motion), drift: view(), top: topFor(wheels, drift) };
    },
    settle(touch) {
      sinceHit = touch !== null ? 0 : Math.min(NO_HIT, sinceHit + 1);
      if (sinceHit > holdSteps) return;
      const motion = physics.motion();
      const turning = Math.sqrt(dot(motion.spin, motion.spin));
      const limit = car.bump.spin;
      if (turning > limit) physics.twist(twistFor(scale(motion.spin, limit / turning - 1), motion.rotation, car));
      if (motion.velocity.y > car.bump.lift) physics.push({ x: 0, y: car.mass * (car.bump.lift - motion.velocity.y), z: 0 });
    },
    halt() {
      // A slide ended by the wait counts as a respawn's end. One let go on this same step is already counted, but it was
      // the wait that took its boost, so that is what the readout says.
      const sliding = drift.phase === 'slide';
      const ended = sliding || drift.boostLeft > 0 ? 'respawn' : drift.ended;
      drift = { ...drift, phase: 'none', charge: 0, hopLeft: 0, boostLeft: 0, boostTier: 0, ended, ends: sliding ? drift.ends + 1 : drift.ends };
    },
    clear() {
      drift = NO_DRIFT;
      sinceWall = again;
      odd = [...NONE_ODD];
      sinceHit = NO_HIT;
    },
    save: () => ({ drift, sinceWall, odd: [...odd], sinceHit }),
    load(memory) {
      drift = { ...memory.drift };
      sinceWall = memory.sinceWall;
      odd = [...memory.odd];
      sinceHit = memory.sinceHit;
    },

    step(input, touch = null) {
      const hit = touch?.thing ?? null;
      // A wall or the gate (7b): it turns the nose along it while touching, and a new hit sends the car off it.
      const wall = touch !== null && bounces(touch.thing) ? touch : null;
      const pedals = inputFractions(input);
      const motion = physics.motion();
      const wheels = feel(motion);
      const up = rotate(motion.rotation, UP);
      const facing = rotate(motion.rotation, FORWARD);
      /** Changes the body's spin by `change`, in radians per second. */
      const spinBy = (change: Vec3): void => physics.twist(twistFor(change, motion.rotation, car));
      const ask = (speed: number, wheelsDown: number) => ({ button: input.drift === 1, steer: pedals.steer, brake: pedals.brake, speed, wheelsDown, hit });

      // The springs: each wheel on the ground pushes the body away from it, where the wheel is, along its ground's
      // direction, an odd one steadied (10a-4: a cast on an edge of the road's mesh can tilt by 10 degrees for a step).
      const steadied = steadyNormals(wheels, car.suspension.oddNormal, odd);
      odd = steadied.odd;
      const normals = steadied.normals;
      let grounded = 0;
      let ground = { x: 0, y: 0, z: 0 };
      for (const [i, wheel] of wheels.entries()) {
        if (!wheel.touching) continue;
        const normal = normals[i]!;
        grounded++;
        ground = add(ground, normal);
        // How fast the body is moving at the wheel: its own speed, and its turning about its middle.
        const moving = add(motion.velocity, cross(motion.spin, sub(wheel.at, motion.position)));
        const closing = -dot(moving, normal);
        physics.push(scale(normal, springPush(spring, wheel.squash, closing, dt)), wheel.at);
      }
      if (wall) {
        if (sinceWall >= again) physics.push(scale(pushDirection(wall.normal), car.mass * wallPush(motion.velocity, wall.normal, car)));
        sinceWall = 0;
      } else {
        sinceWall = Math.min(again, sinceWall + 1);
      }
      // The drift state as the last step left it: the line of travel is worked out from it, not from this step's.
      const old = drift;
      // In the air, the only thing that acts is the turn that brings the roof back up. The drift carries on.
      if (grounded === 0) {
        spinBy(uprightChange(up, motion.spin, car, dt));
        drift = stepDrift(old, ask(dot(motion.velocity, lines(facing, up, old).travel), 0), car, steps);
        return;
      }

      // The tyres. Along and across the line of travel, they act on the speed the car would have at the end of the
      // step if they did nothing: its speed now and what gravity adds in one step. So a parked car stays exactly where it is.
      const share = grounded / wheels.length;
      const normal = unit(ground);
      const { travel } = lines(facing, normal, old);
      const side = cross(travel, normal);
      const coming = { x: motion.velocity.x, y: motion.velocity.y - cfg.sim.gravity * dt, z: motion.velocity.z };
      const speed = dot(motion.velocity, travel);
      drift = stepDrift(old, ask(speed, grounded), car, steps);
      const boosting = drift.boostLeft > 0;
      const top = topFor(wheels, drift);

      // Through the body's middle, so they neither roll it nor pitch it. In a slide the tyres hold harder sideways.
      physics.push(scale(side, car.mass * sideGrip(dot(coming, side), share, car, dt, old.slide > 0 ? car.drift.grip : car.grip.side)));
      const pull = dot(coming, travel) - speed;
      physics.push(scale(travel, car.mass * speedChange(speed, pull, pedals, share, top, boosting, car, dt)));
      // Downforce (10a-3): towards the ground, through the body's middle, growing with the speed squared.
      physics.push(scale(normal, 0 - car.mass * car.downforce * dot(motion.velocity, motion.velocity) * dt));

      // And they bring the car's turning to what is asked, as fast as they can: in a slide, the turn that keeps its path
      // on the slide's circle at the speed it is going, and the nose swinging in or out on top of that.
      const swing = (drift.slide - old.slide) * car.drift.angle * cfg.sim.stepsPerSecond;
      const path = drift.phase === 'slide' ? (0 - drift.dir) * speed * pathCurve(drift, pedals.steer, car) : turnWanted(pedals.steer, speed, car);
      // The side of the slide, on its first and last steps too. Into the corner is -d (positive turning is to the left).
      const d = drift.dir !== 0 ? drift.dir : old.dir;
      const wanted = path - d * swing + (wall ? wallTurn(facing, up, wall.normal, car) : 0);
      const sliding = drift.phase === 'slide' || drift.slide > 0 || old.slide > 0;
      spinBy(scale(up, turnGrip(dot(motion.spin, up), wanted, share, car, dt, sliding ? car.drift.turnGrip : car.grip.turn)));
    },
  };
}
