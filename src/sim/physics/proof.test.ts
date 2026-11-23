import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld, type WorldResult } from '../../gen';
import { sampleField } from '../../gen/world/heightfield';
import { dropFingerprint, resumeDropProof, startDropProof } from './proof';
import { loadRapier, type Rapier } from './rapier';

let rapier: Rapier;
const worlds = new Map<number, WorldResult>();
beforeAll(async () => {
  rapier = await loadRapier();
  for (const seed of [1, 7]) worlds.set(seed, generateWorld(seed, config));
});

describe('the drop proof: a tumbling box on a seed\'s ground and road', () => {
  it('gives the same fingerprint every time it is run', () => {
    const first = dropFingerprint(rapier, worlds.get(7)!);
    const second = dropFingerprint(rapier, worlds.get(7)!);
    expect(first).toMatch(/^[0-9a-f]{8}$/);
    expect(second).toBe(first);
  });

  it('gives a different fingerprint on a different island', () => {
    expect(dropFingerprint(rapier, worlds.get(1)!)).not.toBe(dropFingerprint(rapier, worlds.get(7)!));
  });

  it('really tumbles: the box lands, travels and comes to lie on the ground', () => {
    const world = worlds.get(7)!;
    const proof = startDropProof(rapier, world);
    const start = proof.box();
    proof.step(30);
    const early = proof.fingerprint();
    proof.step(570);
    const end = proof.box();
    expect(proof.fingerprint()).not.toBe(early);
    const travelled = Math.sqrt((end.x - start.x) ** 2 + (end.z - start.z) ** 2);
    expect(travelled).toBeGreaterThan(10);
    // Lying on the ground or the road: its middle is within its own size of the surface, not under it and not in the air.
    const above = end.y - sampleField(world.ground, end.x, end.z, 0);
    expect(above).toBeGreaterThan(0);
    expect(above).toBeLessThan(2.5);
    proof.free();
  });

  it('carries on exactly from a snapshot', () => {
    const proof = startDropProof(rapier, worlds.get(7)!);
    proof.step(200);
    const saved = proof.snapshot();
    const atSave = proof.fingerprint();
    proof.step(400);
    const straightThrough = proof.fingerprint();
    proof.free();

    const resumed = resumeDropProof(rapier, saved);
    expect(resumed.fingerprint()).toBe(atSave);
    resumed.step(400);
    expect(resumed.fingerprint()).toBe(straightThrough);
    resumed.free();
  });
});
