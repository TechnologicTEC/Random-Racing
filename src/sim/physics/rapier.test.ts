import { describe, expect, it } from 'vitest';
import { loadRapier, RAPIER_VERSION } from './rapier';

describe('loadRapier', () => {
  it('loads the physics engine at the pinned version', async () => {
    const rapier = await loadRapier();
    expect(rapier.version()).toBe(RAPIER_VERSION);
    expect(RAPIER_VERSION).toBe('0.21.0');
  });

  it('hands back the same engine every time, loaded once', async () => {
    const [first, second] = await Promise.all([loadRapier(), loadRapier()]);
    expect(second).toBe(first);
    expect(await loadRapier()).toBe(first);
  });

  it('can build a world and step it once loaded', async () => {
    const rapier = await loadRapier();
    const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 60;
    const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(0, 10, 0));
    world.createCollider(rapier.ColliderDesc.ball(0.5), body);
    for (let i = 0; i < 60; i++) world.step();
    // One second of free fall: about 4.9 m.
    expect(body.translation().y).toBeGreaterThan(4.5);
    expect(body.translation().y).toBeLessThan(5.5);
    world.free();
  });
});
