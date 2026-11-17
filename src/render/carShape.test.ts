import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../config';
import { wheelMounts } from '../sim/car/suspension';
import { makeInput } from '../sim/input';
import { loadRapier, type Rapier } from '../sim/physics/rapier';
import { rotate } from '../sim/quat';
import { createSimOn, type CarState } from '../sim/sim';
import { hold } from '../testing/simDriving';
import { flatGround } from '../testing/testGrounds';
import { kartBody, kartPose, kartWheel } from './carShape';
import { KART } from './palette';

const car = config.car;
const look = config.render.car;
const EPS = 1e-6;

function triangles(shape: { indices: Uint32Array }): number {
  return shape.indices.length / 3;
}

let rapier: Rapier;
/** The car settled on the flat test ground, as the simulation gives it. */
let resting: CarState;
beforeAll(async () => {
  rapier = await loadRapier();
  const ground = flatGround();
  const sim = createSimOn(rapier, ground.course, config, ground.start);
  // Two seconds with nothing pressed: settled on its springs.
  hold(sim, {}, 2);
  resting = sim.state();
  sim.free();
});

describe('kartBody', () => {
  const body = kartBody();

  it('lies inside the simulated body box', () => {
    const { halfWidth, halfHeight, halfLength } = car.body;
    for (let v = 0; v < body.positions.length; v += 3) {
      expect(Math.abs(body.positions[v]!)).toBeLessThanOrEqual(halfWidth + EPS);
      expect(Math.abs(body.positions[v + 1]!)).toBeLessThanOrEqual(halfHeight + EPS);
      expect(Math.abs(body.positions[v + 2]!)).toBeLessThanOrEqual(halfLength + EPS);
    }
  });

  it('fills most of the box, so the car reads as the size it is', () => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = -Infinity;
    for (let v = 0; v < body.positions.length; v += 3) {
      minX = Math.min(minX, body.positions[v]!);
      maxX = Math.max(maxX, body.positions[v]!);
      maxY = Math.max(maxY, body.positions[v + 1]!);
      minZ = Math.min(minZ, body.positions[v + 2]!);
      maxZ = Math.max(maxZ, body.positions[v + 2]!);
    }
    expect(maxX - minX).toBeGreaterThan(car.body.halfWidth * 2 * 0.85);
    expect(maxZ - minZ).toBeGreaterThan(car.body.halfLength * 2 * 0.9);
    // The helmet is the highest thing, near the top of the box.
    expect(maxY).toBeGreaterThan(car.body.halfHeight * 0.9);
  });

  it('is coloured from the palette', () => {
    const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const allowed = Object.values(KART).map((rgb) => rgb.map(linear));
    for (let v = 0; v < body.colors.length; v += 3) {
      const found = allowed.some((rgb) => rgb.every((c, k) => Math.abs(c - body.colors[v + k]!) < 1e-6));
      expect(found).toBe(true);
    }
  });
});

describe('kartWheel', () => {
  const wheel = kartWheel(look);

  it('is a tyre of the set radius and width, about its own middle, turning about the sideways axis of the car', () => {
    let reach = 0;
    let width = 0;
    for (let v = 0; v < wheel.positions.length; v += 3) {
      reach = Math.max(reach, Math.hypot(wheel.positions[v + 1]!, wheel.positions[v + 2]!));
      width = Math.max(width, Math.abs(wheel.positions[v]!));
    }
    expect(reach).toBeCloseTo(look.wheelRadius, 6);
    expect(width).toBeLessThanOrEqual(look.wheelWidth / 2 + EPS);
    expect(width).toBeGreaterThan(look.wheelWidth / 2 - 0.02);
  });

  it('keeps the whole car under 600 triangles, four wheels and all', () => {
    expect(triangles(kartBody()) + 4 * triangles(wheel)).toBeLessThan(600);
  });
});

describe('kartPose', () => {
  it('draws each wheel where its spring is mounted, seen from above', () => {
    const pose = kartPose(resting, config);
    const mounts = wheelMounts(car);
    pose.wheels.forEach((wheel, i) => {
      expect(wheel.at.x).toBeCloseTo(mounts[i]!.x, 4);
      expect(wheel.at.z).toBeCloseTo(mounts[i]!.z, 4);
    });
  });

  it('stands each tyre on the ground, with no gap and no sinking, at rest on the flat', () => {
    const pose = kartPose(resting, config);
    for (const wheel of pose.wheels) {
      // The bottom of the drawn tyre, turned into the world's own directions.
      const bottom = rotate(pose.rotation, { x: wheel.at.x, y: wheel.at.y - look.wheelRadius, z: wheel.at.z });
      expect(Math.abs(pose.position.y + bottom.y)).toBeLessThan(0.001);
    }
  });

  it('shows the springs: a wheel hanging lower is drawn lower', () => {
    const dropped = { ...resting, wheels: resting.wheels.map((w, i) => (i === 0 ? { ...w, at: { ...w.at, y: w.at.y - 0.03 } } : w)) };
    const level = kartPose(resting, config);
    const hanging = kartPose(dropped, config);
    expect(hanging.wheels[0]!.at.y).toBeCloseTo(level.wheels[0]!.at.y - 0.03, 4);
    expect(hanging.wheels[1]!.at.y).toBeCloseTo(level.wheels[1]!.at.y, 9);
  });

  it('turns the front wheels with the stick, and not the rear', () => {
    const right = kartPose({ ...resting, input: makeInput({ steer: 1 }) }, config);
    const left = kartPose({ ...resting, input: makeInput({ steer: -0.5 }) }, config);
    // A turn to the right is clockwise seen from above: negative about the roof.
    expect(right.wheels[0]!.turn).toBeCloseTo(-look.steerAngle, 9);
    expect(right.wheels[1]!.turn).toBeCloseTo(-look.steerAngle, 9);
    expect(left.wheels[0]!.turn).toBeCloseTo(look.steerAngle * (64 / 127), 9);
    expect(right.wheels[2]!.turn).toBe(0);
    expect(right.wheels[3]!.turn).toBe(0);
    expect(kartPose(resting, config).wheels[0]!.turn).toBe(0);
  });

  it('places the car where the simulation says it is', () => {
    const pose = kartPose(resting, config);
    expect(pose.position).toEqual(resting.position);
    expect(pose.rotation).toEqual(resting.rotation);
  });

  it('lifts the whole kart along its roof during the hop, drawn only', () => {
    const hopping = kartPose({ ...resting, drift: { ...resting.drift, phase: 'hop', hop: 0.5 } }, config);
    const up = rotate(resting.rotation, { x: 0, y: 1, z: 0 });
    const lift = car.drift.hop.height;
    expect(hopping.position.x).toBeCloseTo(resting.position.x + up.x * lift, 9);
    expect(hopping.position.y).toBeCloseTo(resting.position.y + up.y * lift, 9);
    expect(hopping.position.z).toBeCloseTo(resting.position.z + up.z * lift, 9);
    // The wheels go up with it.
    expect(hopping.wheels).toEqual(kartPose(resting, config).wheels);
  });

  it('gives no sparks and no flame with no drift', () => {
    const pose = kartPose(resting, config);
    expect(pose.sparks.positions).toHaveLength(0);
    expect(pose.flame).toBe(0);
  });

  it('throws sparks from where the rear tyres meet the road while sliding from the first tier', () => {
    const pose = kartPose({ ...resting, drift: { ...resting.drift, phase: 'slide', dir: 1, tier: 2, angle: 0.42 } }, config);
    const { positions } = pose.sparks;
    expect(positions.length).toBeGreaterThan(0);
    const rear = [pose.wheels[2]!, pose.wheels[3]!];
    // Every spark near one rear tyre's bottom, within a wheel's size of it.
    for (let i = 0; i < positions.length; i += 3) {
      const near = rear.some((wheel) => Math.hypot(positions[i]! - wheel.at.x, positions[i + 1]! - (wheel.at.y - look.wheelRadius), positions[i + 2]! - wheel.at.z) <= 2 * look.wheelRadius);
      expect(near).toBe(true);
    }
  });

  it('gives the flame its length while a boost runs', () => {
    const pose = kartPose({ ...resting, drift: { ...resting.drift, boostLeft: 0.4, boostTier: 3 } }, config);
    expect(pose.flame).toBeGreaterThan(look.flame.lengths[2] * (1 - look.flame.flicker) - 1e-9);
    expect(pose.flame).toBeLessThan(look.flame.lengths[2] * (1 + look.flame.flicker) + 1e-9);
  });
});
