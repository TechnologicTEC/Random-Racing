import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { generateWorld } from '../gen';
import { sampleField } from '../gen/world/heightfield';
import { quatFromAxes, type Quat, type Vec3 } from '../sim/quat';
import { chaseNext, chaseStart, type ChaseCar, type ChaseRoomAt, type ChaseView } from './chase';

const cfg = config.camera.chase;
const flat = (): number => 0;

/** The turn of a car whose nose points along (fx, fz) on the map, level. */
function facing(fx: number, fz: number): Quat {
  const size = Math.hypot(fx, fz);
  const [x, z] = [fx / size, fz / size];
  // The car's right, its roof, and its back (its front is its -z side).
  return quatFromAxes({ x: -z, y: 0, z: x }, { x: 0, y: 1, z: 0 }, { x: -x, y: 0, z: -z });
}

function car(position: Vec3, nose: [number, number], velocity: Vec3 = { x: 0, y: 0, z: 0 }): ChaseCar {
  return { position, rotation: facing(nose[0], nose[1]), velocity };
}

/** The compass angle, in radians, of the way the camera looks from its eye to the car, flattened onto the map. */
function lookingAlong(view: ChaseView, at: Vec3): number {
  return Math.atan2(at.x - view.eye.x, at.z - view.eye.z);
}

/** The angle between two compass angles, the short way round, in degrees. */
function apart(a: number, b: number): number {
  const d = Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
  return (d * 180) / Math.PI;
}

describe('the chase camera', () => {
  it('stands 6.5 m behind and 2.4 m above a car standing on the flat, looking ahead of it', () => {
    const view = chaseStart(car({ x: 10, y: 0.56, z: -4 }, [0, -1]), flat, cfg);
    expect(view.eye.x).toBeCloseTo(10, 9);
    expect(view.eye.y).toBeCloseTo(0.56 + cfg.height, 9);
    expect(view.eye.z).toBeCloseTo(-4 + cfg.back, 9);
    expect(view.look.x).toBeCloseTo(10, 9);
    expect(view.look.y).toBeCloseTo(0.56 + cfg.lookHeight, 9);
    expect(view.look.z).toBeCloseTo(-4 - cfg.lookAhead, 9);
  });

  it('is behind the car again within 5 degrees half a second after the car turns a quarter circle', () => {
    let at = { x: 0, y: 0.56, z: 0 };
    let view = chaseStart(car(at, [0, -1], { x: 0, y: 0, z: -10 }), flat, cfg);
    const dt = 1 / 60;
    // The car turns a quarter circle, from heading -z to heading +x, and drives on.
    for (let k = 0; k < 30; k++) {
      at = { x: at.x + 10 * dt, y: at.y, z: at.z };
      view = chaseNext(view, car(at, [1, 0], { x: 10, y: 0, z: 0 }), dt, flat, cfg);
    }
    // Looking from the eye to the car is looking along +x: a compass angle of a quarter turn.
    expect(apart(lookingAlong(view, at), Math.PI / 2)).toBeLessThan(5);
  });

  it('is in the same place within 1 cm after 2 s at 30, 60 and 144 frames a second, on a 60 m circle at 30 m/s', () => {
    const radius = 60;
    const speed = 30;
    /** The car on the circle after t seconds, going round anticlockwise seen from above. */
    const onCircle = (t: number): ChaseCar => {
      const a = (speed / radius) * t;
      const position = { x: radius * Math.cos(a), y: 0.56, z: -radius * Math.sin(a) };
      const ahead: [number, number] = [-Math.sin(a), -Math.cos(a)];
      return car(position, ahead, { x: ahead[0] * speed, y: 0, z: ahead[1] * speed });
    };
    const eyes = [30, 60, 144].map((rate) => {
      let view = chaseStart(onCircle(0), flat, cfg);
      for (let k = 1; k <= rate * 2; k++) view = chaseNext(view, onCircle(k / rate), 1 / rate, flat, cfg);
      return view.eye;
    });
    for (const eye of eyes.slice(1)) {
      expect(Math.hypot(eye.x - eyes[0]!.x, eye.y - eyes[0]!.y, eye.z - eyes[0]!.z)).toBeLessThan(0.01);
    }
  });

  it('swings no further than it should on that circle: it lags the car by the follow time', () => {
    // A steady turn of 0.5 rad/s with a follow time of 0.15 s leaves the camera about 0.075 rad behind the line of travel.
    const at = { x: 0, y: 0.56, z: 0 };
    let view = chaseStart(car(at, [0, -1], { x: 0, y: 0, z: -30 }), flat, cfg);
    let heading = Math.PI; // the compass angle of -z
    for (let k = 1; k <= 120; k++) {
      heading -= 0.5 / 60;
      const along: [number, number] = [Math.sin(heading), Math.cos(heading)];
      view = chaseNext(view, car(at, along, { x: along[0] * 30, y: 0, z: along[1] * 30 }), 1 / 60, flat, cfg);
    }
    const lag = (apart(lookingAlong(view, at), heading) * Math.PI) / 180;
    expect(lag).toBeCloseTo(0.5 * cfg.follow, 3);
  });

  it('follows the way the car travels, not its nose, once it is moving', () => {
    // Nose straight down -z, but sliding forwards and to the right at 10 degrees.
    const slide = (10 * Math.PI) / 180;
    const at = { x: 0, y: 0.56, z: 0 };
    const view = chaseStart(car(at, [0, -1], { x: 20 * Math.sin(slide), y: 0, z: -20 * Math.cos(slide) }), flat, cfg);
    expect(apart(lookingAlong(view, at), Math.PI - slide)).toBeLessThan(0.01);
  });

  it('follows the nose below 2 m/s, so a car crawling sideways does not swing it round', () => {
    const at = { x: 0, y: 0.56, z: 0 };
    const view = chaseStart(car(at, [0, -1], { x: 1.5, y: 0, z: 0 }), flat, cfg);
    expect(apart(lookingAlong(view, at), Math.PI)).toBeLessThan(0.01);
  });

  it('stays behind the nose while the car reverses, at any speed', () => {
    const at = { x: 0, y: 0.56, z: 0 };
    let view = chaseStart(car(at, [0, -1]), flat, cfg);
    for (let k = 0; k < 120; k++) view = chaseNext(view, car(at, [0, -1], { x: 0, y: 0, z: 8 }), 1 / 60, flat, cfg);
    expect(view.eye.z).toBeCloseTo(cfg.back, 6);
    expect(apart(lookingAlong(view, at), Math.PI)).toBeLessThan(0.01);
  });

  it('never spins the long way round when the heading passes a half turn', () => {
    const at = { x: 0, y: 0.56, z: 0 };
    // Heading along -z is a compass angle of a half turn, where the angle jumps from +180 to -180 degrees.
    let view = chaseStart(car(at, [0.05, -1], { x: 1.5, y: 0, z: -30 }), flat, cfg);
    // The car's heading crosses from just east of -z to just west of it.
    for (let k = 0; k < 30; k++) {
      const x = 0.05 - (k / 30) * 0.1;
      const before = lookingAlong(view, at);
      view = chaseNext(view, car(at, [x, -1], { x: x * 30, y: 0, z: -30 }), 1 / 60, flat, cfg);
      expect(apart(lookingAlong(view, at), before)).toBeLessThan(2);
    }
  });

  it('rises to stay clear of ground that comes up behind the car', () => {
    // A bank 5 m high behind the car.
    const bank = (_x: number, z: number): number => (z > 3 ? 5 : 0);
    const view = chaseStart(car({ x: 0, y: 0.56, z: 0 }, [0, -1]), bank, cfg);
    expect(view.eye.y).toBeCloseTo(5 + cfg.clearance, 9);
  });

  it('never comes within 0.8 m of the ground through the gorge of seed 39898, where a range stands over the road', () => {
    const world = generateWorld(39898, config);
    const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
    // The middle of the gorge: the sample nearest the deepest cutting.
    const cut = world.report.deepestCut;
    expect(cut.value).toBeGreaterThan(config.road.maxCut);
    let middle = 0;
    for (let i = 0; i < line.count; i++) {
      if (Math.hypot(line.x[i]! - cut.x, line.z[i]! - cut.z) < Math.hypot(line.x[middle]! - cut.x, line.z[middle]! - cut.z)) middle = i;
    }
    const groundAt = (x: number, z: number): number => sampleField(world.ground, x, z, 0);
    const n = line.count;
    const reach = Math.round(300 / line.spacing);
    const dt = 1 / 60;
    let view: ChaseView | null = null;
    let lowest = Infinity;
    // Driven at 30 m/s along the centre line, from 300 m before the middle of the gorge to 300 m after it.
    for (let d = -300; d <= 300; d += 30 * dt) {
      const along = middle + d / line.spacing;
      const i = ((Math.floor(along) % n) + n) % n;
      const j = (i + 1) % n;
      const t = along - Math.floor(along);
      const at = { x: line.x[i]! + (line.x[j]! - line.x[i]!) * t, y: profile.height[i]! + (profile.height[j]! - profile.height[i]!) * t + 0.56, z: line.z[i]! + (line.z[j]! - line.z[i]!) * t };
      const nose: [number, number] = [line.tx[i]!, line.tz[i]!];
      const now = car(at, nose, { x: nose[0] * 30, y: 0, z: nose[1] * 30 });
      view = view ? chaseNext(view, now, dt, groundAt, cfg) : chaseStart(now, groundAt, cfg);
      lowest = Math.min(lowest, view.eye.y - groundAt(view.eye.x, view.eye.z));
    }
    expect(reach).toBeGreaterThan(10);
    expect(lowest).toBeGreaterThanOrEqual(cfg.clearance - 1e-9);
  });
});

describe('the chase camera in a drift', () => {
  const dt = 1 / 60;
  const SPEED = 30;
  /** A car driving along -z at 30 m/s; sliding to one side, or with a boost running, or neither. */
  const driving = (z: number, drift?: ChaseCar['drift']): ChaseCar => ({ ...car({ x: 0, y: 0.56, z }, [0, -1], { x: 0, y: 0, z: -SPEED }), drift });
  const slide = (dir: -1 | 1): ChaseCar['drift'] => ({ phase: 'slide', dir, boostLeft: 0 });
  const boost: ChaseCar['drift'] = { phase: 'none', dir: 0, boostLeft: 0.5 };
  /** How far round the car the eye stands from straight behind its line of travel, in radians: positive to its right. */
  const round = (view: ChaseView, at: Vec3): number => {
    // The car travels along -z, so its right is +x and behind it is +z.
    return Math.atan2(view.eye.x - at.x, view.eye.z - at.z);
  };
  /** Follows the car for `seconds` at a frame rate, from `view`. */
  function follow(view: ChaseView, seconds: number, frames: number, drift?: ChaseCar['drift']): { view: ChaseView; at: Vec3 } {
    let z = 0;
    const step = 1 / frames;
    for (let k = 0; k < Math.round(seconds * frames); k++) {
      z -= SPEED * step;
      view = chaseNext(view, driving(z, drift), step, flat, cfg);
    }
    return { view, at: driving(z).position };
  }

  it('changes nothing when not drifting: no swing and the usual field of view', () => {
    const view = chaseStart(driving(0), flat, cfg);
    expect(view.swing).toBe(0);
    expect(view.fieldOfView).toBe(cfg.fieldOfView);
    const { view: later, at } = follow(view, 1, 60, { phase: 'none', dir: 0, boostLeft: 0 });
    expect(later.swing).toBe(0);
    expect(later.fieldOfView).toBe(cfg.fieldOfView);
    expect(round(later, at)).toBeCloseTo(0, 9);
  });

  it('swings out to the left while sliding right, and to the right while sliding left, by the set swing', () => {
    for (const dir of [1, -1] as const) {
      const { view, at } = follow(chaseStart(driving(0), flat, cfg), 3, 60, slide(dir));
      // Three seconds is ten easing times: within e^-10 of the swing.
      expect(view.swing).toBeCloseTo(-dir * cfg.swing, 4);
      expect(round(view, at)).toBeCloseTo(view.swing, 9);
    }
  });

  it('eases the swing in over its time: about 63% of the way there after 0.3 s', () => {
    expect(cfg.swingTime).toBe(0.3);
    const { view } = follow(chaseStart(driving(0), flat, cfg), cfg.swingTime, 60, slide(1));
    expect(-view.swing / cfg.swing).toBeCloseTo(1 - Math.exp(-1), 6);
  });

  it('swings back behind the car once the slide ends', () => {
    const swung = follow(chaseStart(driving(0), flat, cfg), 2, 60, slide(1)).view;
    const back = follow(swung, 3, 60, { phase: 'none', dir: 0, boostLeft: 0 }).view;
    expect(Math.abs(back.swing)).toBeLessThan(cfg.swing * 0.001);
  });

  it('widens its view to the boost field of view during a boost, easing in over 0.25 s and out over 0.5 s', () => {
    expect(cfg.boostFieldOfView).toBe(70);
    const start = chaseStart(driving(0), flat, cfg);
    const widening = follow(start, cfg.boostIn, 60, boost).view;
    expect((widening.fieldOfView - cfg.fieldOfView) / (cfg.boostFieldOfView - cfg.fieldOfView)).toBeCloseTo(1 - Math.exp(-1), 6);
    const wide = follow(start, 3, 60, boost).view;
    expect(wide.fieldOfView).toBeCloseTo(cfg.boostFieldOfView, 3);
    const narrowing = follow(wide, cfg.boostOut, 60).view;
    expect((narrowing.fieldOfView - cfg.fieldOfView) / (wide.fieldOfView - cfg.fieldOfView)).toBeCloseTo(Math.exp(-1), 6);
  });

  it('swings and widens the same at 30, 60 and 144 frames a second', () => {
    const at = (frames: number) => follow(chaseStart(driving(0), flat, cfg), 0.5, frames, { phase: 'slide', dir: 1, boostLeft: 0.5 }).view;
    const [a, b, c] = [at(30), at(60), at(144)];
    expect(b.swing).toBeCloseTo(a.swing, 9);
    expect(c.swing).toBeCloseTo(a.swing, 9);
    expect(b.fieldOfView).toBeCloseTo(a.fieldOfView, 9);
    expect(c.fieldOfView).toBeCloseTo(a.fieldOfView, 9);
  });

  it('starts already swung and widened for a car that is sliding with a boost running', () => {
    const view = chaseStart(driving(0, { phase: 'slide', dir: -1, boostLeft: 0.3 }), flat, cfg);
    expect(view.swing).toBeCloseTo(cfg.swing, 12);
    expect(view.fieldOfView).toBe(cfg.boostFieldOfView);
  });

  it('still keeps clear of the ground when swung', () => {
    const bank = (x: number): number => (x < -2 ? 5 : 0);
    let view = chaseStart(driving(0), (x) => bank(x), cfg);
    let z = 0;
    for (let k = 0; k < 120; k++) {
      z -= SPEED * dt;
      view = chaseNext(view, driving(z, slide(1)), dt, (x) => bank(x), cfg);
      expect(view.eye.y).toBeGreaterThanOrEqual(bank(view.eye.x) + cfg.clearance - 1e-9);
    }
  });
});

/**
 * A straight tunnel for the camera (M6.2c): the road at height 0 runs along +x from a portal at x = 0 to one at
 * x = 100, its right towards +z; the walls' inner faces 12 m out, the lid reaching 30 m, an apron of 8 m in front of
 * each portal.
 */
function straightTunnel(ceiling: number): ChaseRoomAt {
  return (x, z) => {
    if (Math.abs(z) > 30 || x < -8 || x > 108) return null;
    const under = x >= 0 && x <= 100;
    return { under, lateral: z, inner: 12, ceiling, depth: under ? Math.min(x, 100 - x) : -(x < 0 ? -x : x - 100) };
  };
}

describe('the chase camera in a tunnel (M6.2c)', () => {
  const margin = cfg.clearance;

  it('stays the clearance under a low ceiling', () => {
    const view = chaseStart(car({ x: 50, y: 0.56, z: 0 }, [1, 0]), flat, cfg, straightTunnel(3));
    expect(view.eye.y).toBeCloseTo(3 - margin, 9);
    expect(view.eye.x).toBeCloseTo(50 - cfg.back, 9);
  });

  it('is where it would be anywhere else under a ceiling high enough, and outside the tunnel', () => {
    for (const at of [
      { x: 50, z: 0 },
      { x: 50, z: 8 },
      { x: 200, z: 0 },
      { x: 4, z: 0 },
    ]) {
      const open = chaseStart(car({ x: at.x, y: 0.56, z: at.z }, [1, 0]), flat, cfg);
      const inside = chaseStart(car({ x: at.x, y: 0.56, z: at.z }, [1, 0]), flat, cfg, straightTunnel(6.5));
      expect(inside.eye).toEqual(open.eye);
    }
  });

  it('comes in towards the car rather than stand in the rock beyond a wall', () => {
    // Facing the left wall: the eye would stand 6.5 m behind the car, 4.5 m past the right wall.
    const at = { x: 50, y: 0.56, z: 10 };
    const view = chaseStart(car(at, [0, -1]), flat, cfg, straightTunnel(6.5));
    expect(view.eye.z).toBeLessThanOrEqual(12 - margin + 1e-9);
    expect(view.eye.z).toBeGreaterThan(12 - margin - 0.3);
    expect(view.eye.x).toBeCloseTo(50, 9);
  });

  it('never stands beside a portal’s opening, in front of its face, with the car inside', () => {
    // Just inside the first portal, by the right wall, heading 30 degrees across towards the left: the eye would stand
    // outside the portal, 13 m right of the centre line, in front of the portal’s face.
    const at = { x: 2, y: 0.56, z: 10.8 };
    const nose: [number, number] = [Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6)];
    const open = chaseStart(car(at, nose), flat, cfg);
    expect(open.eye.x).toBeLessThan(0);
    expect(open.eye.z).toBeGreaterThan(12);
    const view = chaseStart(car(at, nose), flat, cfg, straightTunnel(6.5));
    expect(view.eye.x).toBeGreaterThanOrEqual(0);
    expect(view.eye.z).toBeLessThanOrEqual(12 - margin + 1e-9);
    // Still on the line from the car back to where it would have been.
    const t = (view.eye.x - at.x) / (open.eye.x - at.x);
    expect(view.eye.z).toBeCloseTo(at.z + (open.eye.z - at.z) * t, 6);
  });

  it('never stands inside beside the opening with the car outside in front of the last portal', () => {
    const at = { x: 102, y: 0.56, z: 10.8 };
    const nose: [number, number] = [Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6)];
    const view = chaseStart(car(at, nose), flat, cfg, straightTunnel(6.5));
    expect(view.eye.x).toBeGreaterThan(100);
  });

  it('never stands in a portal’s face beside the opening, with the car on the portal’s plane facing across', () => {
    for (const x of [0, -0.3, 0.3, 100]) {
      const view = chaseStart(car({ x, y: 0.56, z: 10.8 }, [0, -1]), flat, cfg, straightTunnel(6.5));
      expect(view.eye.z, `x ${x}`).toBeLessThanOrEqual(12 - margin + 1e-9);
    }
    // Far enough out in front of the portal, the open cutting beside the road is no part of the tunnel.
    const out = chaseStart(car({ x: -5, y: 0.56, z: 10.8 }, [0, -1]), flat, cfg, straightTunnel(6.5));
    expect(out.eye.z).toBeCloseTo(10.8 + cfg.back, 9);
  });

  it('keeps to the room in chaseNext too, frame after frame', () => {
    let view = chaseStart(car({ x: 50, y: 0.56, z: 0 }, [1, 0]), flat, cfg, straightTunnel(3));
    for (let k = 0; k < 30; k++) {
      view = chaseNext(view, car({ x: 50, y: 0.56, z: 10 }, [0, -1]), 1 / 60, flat, cfg, straightTunnel(3));
      expect(view.eye.y).toBeLessThanOrEqual(3 - margin + 1e-9);
      expect(view.eye.z).toBeLessThanOrEqual(12 - margin + 1e-9);
    }
  });
});
