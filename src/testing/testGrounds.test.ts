import { describe, expect, it } from 'vitest';
import { config } from '../config';
import type { MeshData } from '../gen/types';
import { rotate } from '../sim/quat';
import { bankedBend, crestGround, flatGround, hillsideGround, kerbGround, poseOn, rampGround, stepGround, type TestGround } from './testGrounds';

/** Every vertex of a mesh, as points. */
function vertices(mesh: MeshData): Array<{ x: number; y: number; z: number }> {
  const out = [];
  for (let i = 0; i < mesh.positions.length; i += 3) out.push({ x: mesh.positions[i]!, y: mesh.positions[i + 1]!, z: mesh.positions[i + 2]! });
  return out;
}

/** The meshes of a ground, whichever it has. */
function meshes(ground: TestGround): MeshData[] {
  const { course } = ground;
  return [course.road, course.kerbs, course.grass].filter((mesh): mesh is MeshData => mesh !== undefined);
}

const ALL: Array<[string, () => TestGround]> = [
  ['flat', flatGround],
  ['ramp', rampGround],
  ['banked bend', bankedBend],
  ['crest', crestGround],
  ['kerb', kerbGround],
  ['hillside', hillsideGround],
  ['step', stepGround],
];

describe.each(ALL)('the %s test ground', (_name, build) => {
  it('is made of whole triangles that face up, with every vertex at the height it says', () => {
    const ground = build();
    for (const mesh of meshes(ground)) {
      expect(mesh.indices.length % 3).toBe(0);
      expect(mesh.indices.length).toBeGreaterThan(0);
      expect(mesh.materials).toHaveLength(mesh.positions.length / 3);
      const points = vertices(mesh);
      for (let t = 0; t < mesh.indices.length; t += 3) {
        const a = points[mesh.indices[t]!]!;
        const b = points[mesh.indices[t + 1]!]!;
        const c = points[mesh.indices[t + 2]!]!;
        // The y part of (b - a) crossed with (c - a): positive for a triangle whose face looks up. Upright faces (the kerb's and the step's) give zero.
        const up = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
        expect(up).toBeGreaterThanOrEqual(0);
      }
    }
    // The driving surface is where `height` says, at every vertex of the road mesh (stored as 32-bit numbers).
    // Looked up a millimetre either side, so that the top and the foot of an upright step both count.
    for (const p of vertices(ground.course.road)) {
      const off = Math.min(Math.abs(p.y - ground.height(p.x, p.z - 0.001)), Math.abs(p.y - ground.height(p.x, p.z + 0.001)));
      expect(off).toBeLessThan(0.002);
    }
  });

  it('starts the car at its ride height above the ground, the right way up', () => {
    const ground = build();
    const { position, rotation } = ground.start;
    const under = ground.height(position.x, position.z);
    const up = rotate(rotation, { x: 0, y: 1, z: 0 });
    expect(up.y).toBeGreaterThan(0.95);
    // The middle of the body is half its height and the ride height above the ground, measured square to the ground.
    expect((position.y - under) * up.y).toBeCloseTo(config.car.body.halfHeight + config.car.suspension.rideHeight, 1);
  });
});

describe('flatGround', () => {
  it('is level and wide enough for a long run and a wide circle', () => {
    const ground = flatGround();
    const points = vertices(ground.course.road);
    expect(Math.max(...points.map((p) => p.y))).toBe(0);
    expect(Math.min(...points.map((p) => p.y))).toBe(0);
    // The car starts at the origin facing -z: 800 m ahead of it and 150 m to each side.
    expect(Math.min(...points.map((p) => p.z))).toBeLessThanOrEqual(-800);
    expect(Math.min(...points.map((p) => p.x))).toBeLessThanOrEqual(-150);
    expect(Math.max(...points.map((p) => p.x))).toBeGreaterThanOrEqual(150);
    const forward = rotate(ground.start.rotation, { x: 0, y: 0, z: -1 });
    expect(forward).toEqual({ x: 0, y: 0, z: -1 });
  });
});

describe('rampGround', () => {
  it('runs level, eases up over a curve no tighter than the road allows, then climbs steadily at 15%', () => {
    const ground = rampGround();
    expect(ground.grade).toBe(0.15);
    // Level where the car starts and for a good run-up.
    expect(ground.height(0, 0)).toBe(0);
    expect(ground.height(0, -ground.rampStart + 1)).toBe(0);
    // Steady 15% once the ease is over, for at least 500 m.
    const from = ground.steadyFrom;
    for (const along of [from, from + 100, from + 499]) {
      const rise = ground.height(0, -(along + 1)) - ground.height(0, -along);
      expect(rise).toBeCloseTo(0.15, 6);
    }
    // In the ease the slope changes by no more than 1/200 a metre: a dip of 200 m radius, as tight as the generator makes them.
    for (let along = ground.rampStart; along < from - 1; along += 1) {
      const before = ground.height(0, -(along + 1)) - ground.height(0, -along);
      const after = ground.height(0, -(along + 2)) - ground.height(0, -(along + 1));
      expect(after - before).toBeLessThan(1 / config.road.crestMinRadius + 1e-6);
      expect(after - before).toBeGreaterThan(-1e-9);
    }
    // The same height all the way across.
    expect(ground.height(15, -(from + 50))).toBe(ground.height(-15, -(from + 50)));
  });
});

describe('crestGround', () => {
  it('climbs at 8%, goes over a crest of 200 m radius and falls at 8%', () => {
    const ground = crestGround();
    expect(ground.radius).toBe(config.road.crestMinRadius);
    const slopeAt = (along: number): number => ground.height(0, -(along + 0.5)) - ground.height(0, -(along - 0.5));
    expect(slopeAt(ground.crestStart - 20)).toBeCloseTo(0.08, 6);
    expect(slopeAt(ground.crestEnd + 20)).toBeCloseTo(-0.08, 6);
    // Over the crest the slope falls by 1/200 for every metre.
    for (let along = ground.crestStart + 1; along < ground.crestEnd - 2; along += 1) {
      expect(slopeAt(along + 1) - slopeAt(along)).toBeCloseTo(-1 / 200, 6);
    }
    // The top is in the middle of it.
    const top = (ground.crestStart + ground.crestEnd) / 2;
    expect(ground.height(0, -top)).toBeGreaterThan(ground.height(0, -(top - 5)));
    expect(ground.height(0, -top)).toBeGreaterThan(ground.height(0, -(top + 5)));
  });
});

describe('bankedBend', () => {
  it('is a ring of 70 m radius, banked 8 degrees with the inside low, and the car starts on it facing round it', () => {
    const ground = bankedBend();
    expect(ground.radius).toBe(70);
    // tan 8 degrees.
    expect(ground.cross).toBeCloseTo(0.14054, 4);
    // The centre line is at height 0 all the way round; the surface rises towards the outside.
    for (const [x, z] of [[70, 0], [0, 70], [-70, 0], [0, -70], [49.497, 49.497]] as const) {
      expect(ground.height(x, z)).toBeCloseTo(0, 2);
      const out = { x: x / 70, z: z / 70 };
      expect(ground.height(x + out.x * 5, z + out.z * 5) - ground.height(x - out.x * 5, z - out.z * 5)).toBeCloseTo(10 * ground.cross, 2);
    }
    // The start: on the centre line at (70, 0), facing -z, so the middle of the ring is on its left; tipped with the bank.
    const { position, rotation } = ground.start;
    expect(position.x).toBeCloseTo(70, 0);
    expect(position.z).toBeCloseTo(0, 6);
    const forward = rotate(rotation, { x: 0, y: 0, z: -1 });
    expect(forward.z).toBeCloseTo(-1, 6);
    const right = rotate(rotation, { x: 1, y: 0, z: 0 });
    expect(right.y / right.x).toBeCloseTo(ground.cross, 4);
    // The mesh's rows are no longer than the real road's.
    const points = vertices(ground.course.road);
    const radii = points.map((p) => Math.sqrt(p.x * p.x + p.z * p.z));
    expect(Math.min(...radii)).toBeLessThanOrEqual(58);
    expect(Math.max(...radii)).toBeGreaterThanOrEqual(82);
  });
});

describe('kerbGround', () => {
  it('has a kerb like the road\'s along one side: flush on the inside, 9 cm up on the outside, a metre wide', () => {
    const ground = kerbGround();
    const { kerbWidth, kerbHeight } = config.road;
    expect(ground.kerbInner).toBeGreaterThan(3);
    expect(ground.course.kerbs).toBeDefined();
    const points = vertices(ground.course.kerbs!);
    const inner = points.filter((p) => Math.abs(p.x - ground.kerbInner) < 1e-6);
    const outer = points.filter((p) => Math.abs(p.x - (ground.kerbInner + kerbWidth)) < 1e-6);
    expect(inner.length).toBeGreaterThan(10);
    expect(inner.every((p) => p.y === 0)).toBe(true);
    expect(Math.max(...outer.map((p) => p.y))).toBeCloseTo(kerbHeight, 6);
    // The top of the kerb as `kerbTop` gives it: a ramp from the inside edge to the outside edge, nothing elsewhere.
    expect(ground.kerbTop(ground.kerbInner + kerbWidth / 2)).toBeCloseTo(kerbHeight / 2, 6);
    expect(ground.kerbTop(ground.kerbInner - 0.1)).toBe(0);
    expect(ground.kerbTop(ground.kerbInner + kerbWidth + 0.1)).toBe(0);
    // The flat ground carries on under and beyond it.
    expect(ground.height(ground.kerbInner + 5, -50)).toBe(0);
  });
});

describe('hillsideGround', () => {
  it('has a flat strip with a 45% grass slope rising on its right', () => {
    const ground = hillsideGround();
    expect(ground.slope).toBe(config.road.maxBankSlope);
    expect(ground.height(0, -50)).toBe(0);
    expect(ground.height(ground.foot, -50)).toBe(0);
    expect(ground.height(ground.foot + 10, -50)).toBeCloseTo(4.5, 6);
    expect(ground.height(ground.foot + 40, -200)).toBeCloseTo(18, 6);
    // The slope is grass, the strip is road.
    expect(ground.course.grass).toBeDefined();
    expect(Math.max(...vertices(ground.course.road).map((p) => p.y))).toBe(0);
    expect(Math.min(...vertices(ground.course.grass!).map((p) => p.x))).toBeCloseTo(ground.foot, 6);
  });
});

describe('stepGround', () => {
  it('drops a metre across the car\'s path', () => {
    const ground = stepGround();
    expect(ground.drop).toBe(1);
    expect(ground.height(0, -(ground.edge - 1))).toBe(0);
    expect(ground.height(0, -(ground.edge + 1))).toBe(-1);
    expect(ground.height(0, -(ground.edge + 200))).toBe(-1);
  });
});

describe('poseOn', () => {
  it('stands a car on a slope, tipped with it, facing the way asked', () => {
    const ground = hillsideGround();
    // Facing along the hillside (-z), 10 m up the slope: its right side is the high side.
    const along = poseOn(ground, ground.foot + 10, -100, { x: 0, z: -1 }, config);
    const right = rotate(along.rotation, { x: 1, y: 0, z: 0 });
    expect(right.y / right.x).toBeCloseTo(0.45, 3);
    expect(rotate(along.rotation, { x: 0, y: 0, z: -1 }).y).toBeCloseTo(0, 6);
    // Facing straight up it (+x): its nose is the high end.
    const up = poseOn(ground, ground.foot + 10, -100, { x: 1, z: 0 }, config);
    const forward = rotate(up.rotation, { x: 0, y: 0, z: -1 });
    expect(forward.y / forward.x).toBeCloseTo(0.45, 3);
    // Its middle is half its height and the ride height off the slope, square to it.
    const roof = rotate(up.rotation, { x: 0, y: 1, z: 0 });
    expect((up.position.y - 4.5) / roof.y).toBeCloseTo(config.car.body.halfHeight + config.car.suspension.rideHeight, 2);
  });
});
