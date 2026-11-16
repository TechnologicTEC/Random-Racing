import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../../gen';
import { stickToward } from '../../testing/lineDriver';
import { driveWith, hold } from '../../testing/simDriving';
import { crestGround, flatGround, hillsideGround, poseOn, stepGround } from '../../testing/testGrounds';
import { loadRapier, type Rapier } from '../physics/rapier';
import { quatFromAxes, rotate } from '../quat';
import { scriptedInput } from '../script';
import { createSim, createSimOn, type CarState } from '../sim';

let rapier: Rapier;
beforeAll(async () => {
  rapier = await loadRapier();
});

const car = config.car;
const { topSpeed } = car.engine;
const perSecond = config.sim.stepsPerSecond;

const UP = { x: 0, y: 1, z: 0 };
const roofUp = (state: CarState): number => rotate(state.rotation, UP).y;
const down = (state: CarState): number => state.wheels.filter((wheel) => wheel.touching).length;
const degrees = (radians: number): number => (radians * 180) / Math.PI;
/** Level within about 2.6 degrees. */
const LEVEL = 0.999;

/** The longest run of states in a row for which `test` holds, in steps. */
function longestRun(states: CarState[], test: (state: CarState) => boolean): number {
  let longest = 0;
  let run = 0;
  for (const state of states) {
    run = test(state) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

describe('over the tightest crest at top speed', () => {
  it('keeps all four wheels on the ground on every step', () => {
    const crest = crestGround();
    const sim = createSimOn(rapier, crest.course, config, crest.start);
    const over: CarState[] = [];
    hold(sim, { throttle: 1 }, 30, (state) => {
      const along = -state.position.z;
      if (along > crest.crestStart - 20 && along < crest.crestEnd + 40) over.push(state);
    });
    sim.free();
    // It gets there at nearly top speed (the 8% climb before it costs a little).
    expect(over.length).toBeGreaterThan(perSecond);
    expect(over[0]!.speed).toBeGreaterThan(topSpeed * 0.97);
    expect(over.every((state) => down(state) === 4)).toBe(true);
  });
});

describe('onto the 45% hillside and off again', () => {
  it('never tips more than 8 degrees beyond the slope, and never has fewer than three wheels down for over 0.3 s', () => {
    const hill = hillsideGround();
    const slopeAngle = Math.atan(hill.slope);
    const angle = (20 * Math.PI) / 180;
    const forward = { x: Math.sin(angle), z: -Math.cos(angle) };
    // 100 m of road at 20 degrees to the hillside's foot.
    const sim = createSimOn(rapier, hill.course, config, poseOn(hill, hill.foot - 100 * Math.tan(angle), 0, forward, config));
    const throttle = 0.6;
    const states: CarState[] = [];
    let phase: 'onto' | 'along' | 'off' = 'onto';
    let lineX = 0;
    let alongFor = 0;
    let backFor = 0;
    // 20 s keeps it well inside the 700 m of ground.
    driveWith(
      sim,
      20,
      (state) => {
        if (phase === 'onto' && state.position.x > hill.foot + 6) {
          phase = 'along';
          lineX = state.position.x;
        }
        if (phase === 'along' && ++alongFor > 3 * perSecond) phase = 'off';
        if (phase === 'onto') return { throttle };
        const x = phase === 'along' ? lineX : 0;
        return { throttle, steer: stickToward(state, { x, z: state.position.z - 15 }, car) };
      },
      (state) => {
        states.push(state);
        if (phase === 'off' && state.position.x < hill.foot - 4) backFor++;
      },
    );
    sim.free();
    // It went up the slope, along it and back down onto the road.
    expect(Math.max(...states.map((state) => state.position.x))).toBeGreaterThan(hill.foot + 6);
    expect(backFor).toBeGreaterThan(perSecond);
    const mostTilt = Math.max(...states.map((state) => Math.acos(Math.min(1, roofUp(state)))));
    expect(degrees(mostTilt)).toBeLessThan(degrees(slopeAngle) + 8);
    expect(longestRun(states, (state) => down(state) < 3)).toBeLessThanOrEqual(0.3 * perSecond);
  });
});

describe('off a 1 m drop', () => {
  for (const throttle of [1 / 3, 1]) {
    it(`at ${Math.round(topSpeed * throttle)} m/s: lands level, keeps its speed and its line`, () => {
      const step = stepGround();
      const sim = createSimOn(rapier, step.course, config, step.start);
      const states: CarState[] = [];
      hold(sim, { throttle }, 40, (state) => states.push(state));
      sim.free();
      const flying = states.findIndex((state) => down(state) === 0);
      expect(flying).toBeGreaterThan(0);
      const before = states[flying - 1]!;
      expect(before.speed).toBeGreaterThan(topSpeed * throttle * 0.98);
      const landed = flying + states.slice(flying).findIndex((state) => down(state) > 0);
      expect(landed).toBeGreaterThan(flying);
      expect(roofUp(states[landed]!)).toBeGreaterThanOrEqual(0.95);
      const second = states[landed + perSecond]!;
      expect(roofUp(second)).toBeGreaterThan(LEVEL);
      expect(down(second)).toBe(4);
      const lowest = Math.min(...states.slice(landed, landed + perSecond).map((state) => state.speed));
      expect(lowest).toBeGreaterThan(before.speed * 0.9);
      expect(Math.abs(states[landed + 2 * perSecond]!.position.x)).toBeLessThan(0.5);
    });
  }
});

describe('dropped tipped over', () => {
  it('from 3 m up, rolled 60 degrees and pitched 30, lands on its wheels', () => {
    const flat = flatGround();
    const roll = (60 * Math.PI) / 180;
    const pitch = (30 * Math.PI) / 180;
    // Pitched nose up about the right axis, then rolled about the forward axis.
    const ahead = { x: 0, y: Math.sin(pitch), z: -Math.cos(pitch) };
    const level = { x: 1, y: 0, z: 0 };
    const top = { x: 0, y: Math.cos(pitch), z: Math.sin(pitch) };
    const right = { x: level.x * Math.cos(roll) - top.x * Math.sin(roll), y: level.y * Math.cos(roll) - top.y * Math.sin(roll), z: level.z * Math.cos(roll) - top.z * Math.sin(roll) };
    const up = { x: level.x * Math.sin(roll) + top.x * Math.cos(roll), y: level.y * Math.sin(roll) + top.y * Math.cos(roll), z: level.z * Math.sin(roll) + top.z * Math.cos(roll) };
    const start = { position: { x: 0, y: 3, z: 0 }, rotation: quatFromAxes(right, up, { x: -ahead.x, y: -ahead.y, z: -ahead.z }) };
    const sim = createSimOn(rapier, flat.course, config, start);
    expect(roofUp(sim.state())).toBeLessThan(0.5);
    const states: CarState[] = [];
    hold(sim, {}, 4, (state) => states.push(state));
    sim.free();
    const landed = states.findIndex((state) => down(state) > 0);
    expect(landed).toBeGreaterThan(0);
    expect(roofUp(states[landed]!)).toBeGreaterThanOrEqual(0.9);
    const last = states[states.length - 1]!;
    expect(down(last)).toBe(4);
    expect(roofUp(last)).toBeGreaterThan(LEVEL);
  });
});

describe('the scripted run on real seeds', () => {
  it.each([42, 7])('seed %i: stays roof-up all the way', (seed) => {
    const sim = createSim(rapier, generateWorld(seed, config), config);
    let lowest = 1;
    for (let step = 0; step < 600; step++) {
      sim.step(scriptedInput(step));
      lowest = Math.min(lowest, roofUp(sim.state()));
    }
    sim.free();
    expect(lowest).toBeGreaterThanOrEqual(0.7);
  });
});
