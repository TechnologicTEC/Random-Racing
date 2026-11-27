import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld, type WorldResult } from '../../gen';
import { tunnelWallOffsets } from '../../gen/road/tunnels';
import { startPose } from '../start';
import { createCarPhysics } from './carBody';
import { addWorldColliders, NO_COLLIDER, tunnelColliders } from './colliders';
import { loadRapier, type Rapier } from './rapier';

type PhysicsWorld = InstanceType<Rapier['World']>;
type ColliderDesc = InstanceType<Rapier['ColliderDesc']>;

/** Seed 11 has one tunnel of 124 m, along a mountainside. */
const SEED = 11;
const rules = config.road.tunnels;

let rapier: Rapier;
let world: WorldResult;
beforeAll(async () => {
  rapier = await loadRapier();
  world = generateWorld(SEED, config);
}, 60_000);

const winner = () => world.track.candidates[world.track.winnerIndex]!;

function worldOf(colliders: ColliderDesc[]): PhysicsWorld {
  const physics = new rapier.World({ x: 0, y: -9.81, z: 0 });
  for (const collider of colliders) physics.createCollider(collider);
  physics.step();
  return physics;
}

function cast(physics: PhysicsWorld, from: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, reach: number): number | null {
  const hit = physics.castRay(new rapier.Ray(from, direction), reach, true);
  return hit ? hit.timeOfImpact : null;
}

/** The point `lateral` metres right of the centre line at sample i, `up` metres over the road's tilted surface there. */
function point(i: number, lateral: number, up: number): { x: number; y: number; z: number } {
  const { line, profile } = winner();
  return {
    x: line.x[i]! - line.tz[i]! * lateral,
    y: profile.height[i]! + world.road.cross[i]! * lateral + up,
    z: line.z[i]! + line.tx[i]! * lateral,
  };
}

describe('tunnelColliders (M6.2b)', () => {
  it('gives each piece of each tunnel its two walls and its ceiling as solid boxes, its portals’ faces, and its lid', () => {
    const { boxes, portals, lid } = tunnelColliders(rapier, world, config);
    const pieces = world.road.tunnels.spans.reduce((sum, span) => sum + span.sampleCount - 1, 0);
    expect(boxes).toHaveLength(pieces * 3);
    expect(portals).not.toBeNull();
    expect(lid).not.toBeNull();
  });

  it('meets a ray up from the road in a tunnel at its ceiling, one across it at its wall, and one down from the sky at its lid', () => {
    const { boxes, portals, lid } = tunnelColliders(rapier, world, config);
    const physics = worldOf([...boxes, portals!, lid!]);
    const span = world.road.tunnels.spans[0]!;
    const i = span.startIndex + Math.floor(span.sampleCount / 2);
    const { inner } = tunnelWallOffsets(world.road.width, i, config.road);

    const up = cast(physics, point(i, 0, 1), { x: 0, y: 1, z: 0 }, 50);
    expect(up! + 1).toBeCloseTo(rules.clearance, 1);

    const { line } = winner();
    const right = { x: -line.tz[i]!, y: 0, z: line.tx[i]! };
    const across = cast(physics, point(i, 0, 3), right, 50);
    expect(across).toBeCloseTo(inner, 1);
    const left = cast(physics, point(i, 0, 3), { x: -right.x, y: 0, z: -right.z }, 50);
    expect(left).toBeCloseTo(inner, 1);

    // From high over the lid straight down: the lid's top, at least `cover` over the ceiling.
    const sky = point(i, 0, 200);
    const down = cast(physics, sky, { x: 0, y: -1, z: 0 }, 400);
    expect(down).not.toBeNull();
    expect(sky.y - down!).toBeGreaterThanOrEqual(point(i, 0, rules.clearance + rules.cover).y - 0.05);
    physics.free();
  });

  it('meets a ray along the open cutting beside a portal’s opening at the portal’s face, and lets one through the opening', () => {
    const { portals } = tunnelColliders(rapier, world, config);
    const physics = worldOf([portals!]);
    const { line } = winner();
    const span = world.road.tunnels.spans[0]!;
    const s = span.startIndex;
    const { outer } = tunnelWallOffsets(world.road.width, s, config.road);
    const along = { x: line.tx[s]!, y: 0, z: line.tz[s]! };
    const back = 10;
    // 10 m before the portal, beside the opening and 2 m over the road: the face, 10 m on.
    const beside = point(s, -(outer + 1.5), 2);
    const from = { x: beside.x - along.x * back, y: beside.y, z: beside.z - along.z * back };
    expect(cast(physics, from, along, 30)).toBeCloseTo(back, 0);
    // Down the middle of the road: nothing.
    const middle = point(s, 0, 2);
    expect(cast(physics, { x: middle.x - along.x * back, y: middle.y, z: middle.z - along.z * back }, along, 30)).toBeNull();
    physics.free();
  });

  it('is added after the bridges: the boxes and the portals with the tunnels, the lid on its own; none on a seed without a tunnel', () => {
    const physics = new rapier.World({ x: 0, y: -9.81, z: 0 });
    const added = addWorldColliders(rapier, physics, world, config);
    const { boxes } = tunnelColliders(rapier, world, config);
    expect(added.tunnels).toHaveLength(boxes.length + 1);
    expect(added.lid).not.toBe(NO_COLLIDER);
    expect(Math.min(...added.tunnels)).toBeGreaterThan(Math.max(added.road, ...added.walls, ...added.gate, ...added.bridges));
    expect(added.lid).toBeGreaterThan(Math.max(...added.tunnels));
    expect(Math.min(...added.trees)).toBeGreaterThan(added.lid);
    physics.free();

    const plain = generateWorld(7, config);
    const other = new rapier.World({ x: 0, y: -9.81, z: 0 });
    const none = addWorldColliders(rapier, other, plain, config);
    expect(none.tunnels).toEqual([]);
    expect(none.lid).toBe(NO_COLLIDER);
    other.free();
  }, 60_000);

  it('is hit as a wall: a body pushed into a tunnel’s wall names a wall', () => {
    const span = world.road.tunnels.spans[0]!;
    const i = span.startIndex + Math.floor(span.sampleCount / 2);
    const { inner } = tunnelWallOffsets(world.road.width, i, config.road);
    const rotation = startPose(world, config).rotation;
    // Over the barrier, its side 10 cm into the tunnel's right wall.
    const inWall = createCarPhysics(rapier, { kind: 'island', world }, config, { position: point(i, inner - config.car.body.halfWidth + 0.1, 2.5), rotation });
    inWall.step();
    expect(inWall.touching()?.thing).toBe('wall');
    inWall.free();
  });
});
