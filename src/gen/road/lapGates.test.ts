import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateTrack, generateWorld } from '..';
import type { CenterLine, Section, TrackResult, WorldResult } from '../types';
import { sampleField } from '../world/heightfield';
import { placeLapGates } from './lapGates';
import { ROAD_MATERIAL } from './ribbon';
import { gateBoxes } from './startGate';

/**
 * M5.4d (Tane, 2026-11-25): laps are counted by 4 gates the player can see and drives through, at the middle of a
 * straight or the apex of a corner, in place of the hidden checkpoints (which now only say where a respawn puts the car).
 */
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const rules = config.road.lapGates;
let tracks: TrackResult[];
beforeAll(() => {
  tracks = SEEDS.map((seed) => generateTrack(seed, config));
}, 300_000);

/** Metres round a lap of `length` between two places, the short way. */
const apart = (a: number, b: number, length: number): number => {
  const d = Math.abs(a - b) % length;
  return Math.min(d, length - d);
};

describe('placing the lap gates (placeLapGates)', () => {
  it('puts 4 gates round every lap of seeds 1 to 40, each at the middle of a straight or the apex of a corner, in order', () => {
    for (const track of tracks) {
      const { line, sections } = track.candidates[track.winnerIndex]!;
      const gates = placeLapGates(line, sections, rules);
      const middles = new Set(sections.map((s) => (s.type === 'straight' ? (s.startIndex + Math.floor(s.sampleCount / 2)) % line.count : s.apexIndex)));
      expect(gates, `seed ${track.seed}`).toHaveLength(rules.count);
      for (const sample of gates) expect(middles.has(sample), `seed ${track.seed}, sample ${sample}`).toBe(true);
      expect([...gates].sort((a, b) => a - b), `seed ${track.seed}`).toEqual(gates);
    }
  });

  it(`keeps every gate at least ${rules.minGap} m from the line and from each other, and each near its fifth of the lap`, () => {
    for (const track of tracks) {
      const { line, sections } = track.candidates[track.winnerIndex]!;
      const along = placeLapGates(line, sections, rules).map((sample) => sample * line.spacing);
      for (const [k, a] of along.entries()) {
        expect(apart(a, 0, line.length), `seed ${track.seed}, gate ${k + 1} from the line`).toBeGreaterThanOrEqual(rules.minGap);
        for (const b of along.slice(k + 1)) expect(apart(a, b, line.length), `seed ${track.seed}, gates`).toBeGreaterThanOrEqual(rules.minGap);
        const aim = ((k + 1) * line.length) / (rules.count + 1);
        expect(Math.abs(a - aim), `seed ${track.seed}, gate ${k + 1} from its aim`).toBeLessThanOrEqual(line.length / (2 * (rules.count + 1)));
      }
    }
  });

  it('is the same every time', () => {
    const { line, sections } = tracks[6]!.candidates[tracks[6]!.winnerIndex]!;
    expect(placeLapGates(line, sections, rules)).toEqual(placeLapGates(line, sections, rules));
  });

  it("takes a straight's middle before a corner's apex when the straight's is not much further from the aim", () => {
    // A made-up lap of 2,000 m in 1,000 samples: the first gate aims at 400 m (sample 200).
    const line = { count: 1000, spacing: 2, length: 2000 } as CenterLine;
    const corner = (apexIndex: number): Section => ({ type: 'corner', startIndex: apexIndex - 10, sampleCount: 20, length: 40, direction: 'left', turnDegrees: 90, minRadius: 40, meanRadius: 50, apexIndex, kind: 'sweeper' });
    const straight = (middle: number): Section => ({ type: 'straight', startIndex: middle - 20, sampleCount: 40, length: 80 });
    const far = [corner(400), corner(600), corner(800)];
    // The apex 10 m from the aim, the straight's middle 40 m: the straight.
    expect(placeLapGates(line, [corner(205), straight(220), ...far], rules)[0]).toBe(220);
    // The straight's middle 200 m further than the apex: the corner.
    expect(placeLapGates(line, [corner(205), straight(320), ...far], rules)[0]).toBe(205);
  });

  it('stands no gate where it may not: in a tunnel or near one (M6.2b), not even at its aim when nothing else fits', () => {
    const line = { count: 1000, spacing: 2, length: 2000 } as CenterLine;
    const corner = (apexIndex: number): Section => ({ type: 'corner', startIndex: apexIndex - 10, sampleCount: 20, length: 40, direction: 'left', turnDegrees: 90, minRadius: 40, meanRadius: 50, apexIndex, kind: 'sweeper' });
    const straight = (middle: number): Section => ({ type: 'straight', startIndex: middle - 20, sampleCount: 40, length: 80 });
    const far = [corner(400), corner(600), corner(800)];
    // Samples 180 to 239 are in a tunnel: the straight at 220 is passed over for the next nearest, the corner at 400.
    const blocked = new Uint8Array(1000);
    blocked.fill(1, 180, 240);
    expect(placeLapGates(line, [straight(220), ...far], rules)[0]).toBe(220);
    expect(placeLapGates(line, [straight(220), ...far], rules, blocked)[0]).toBe(400);
    // With nothing to choose from the gates stand at their aims, but never on a blocked sample: the first aim, 200, is.
    const aims = placeLapGates(line, [], rules, blocked);
    expect(aims[0]).not.toBe(200);
    expect(blocked[aims[0]!]).toBe(0);
    expect(aims.slice(1)).toEqual([400, 600, 800]);
  });
});

describe("a lap gate's posts and beam (gateBoxes at a gate)", () => {
  let world: WorldResult;
  beforeAll(() => {
    world = generateWorld(7, config);
  }, 120_000);

  it('stands square to the road at its sample, the posts outside the barriers reaching the ground, the beam clear over the road', () => {
    const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
    const groundAt = (x: number, z: number): number => sampleField(world.ground, x, z, 0);
    const road = config.road;
    expect(world.road.lapGates.samples).toHaveLength(rules.count);
    for (const s of world.road.lapGates.samples) {
      const [left, right, beam] = gateBoxes(line, profile.height, world.road.cross, world.road.width, config, s, groundAt);
      const half = world.road.width[s]! / 2;
      for (const box of [left!, right!, beam!]) {
        expect(box.tx).toBe(line.tx[s]);
        expect(box.tz).toBe(line.tz[s]);
      }
      // The beam's middle is over the centre line; the posts stand either side of it, outside the barriers.
      expect(beam!.x).toBeCloseTo(line.x[s]!, 6);
      expect(beam!.z).toBeCloseTo(line.z[s]!, 6);
      for (const post of [left!, right!]) {
        const lateral = Math.hypot(post.x - line.x[s]!, post.z - line.z[s]!);
        expect(lateral - post.halfAcross).toBeGreaterThanOrEqual(half + road.barrierOffset + road.barrierWidth);
        expect(post.y - post.halfUp, `seed 7, gate at sample ${s}`).toBeLessThanOrEqual(groundAt(post.x, post.z) - 0.3);
      }
      expect(beam!.y - beam!.halfUp).toBeGreaterThanOrEqual(profile.height[s]! + road.gateClearance - 1e-9);
    }
  });

  it('is drawn with dark posts and a teal beam, and no paint on the road', () => {
    const mesh = world.road.lapGates.mesh;
    const used = new Set(mesh.materials);
    expect([...used].sort()).toEqual([ROAD_MATERIAL.gate, ROAD_MATERIAL.lapGateBeam].sort());
    // Three closed boxes a gate, two triangles a face, six faces a box.
    expect(mesh.indices.length / 3).toBe(rules.count * 3 * 6 * 2);
  });
});
