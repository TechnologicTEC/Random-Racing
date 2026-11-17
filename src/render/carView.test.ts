import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { createCarView } from './carView';
import { CASTER_LAYER } from './decorView';

/** Every mesh the car view draws. */
function meshes(object: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) found.push(child);
  });
  return found;
}

describe('the car view', () => {
  it('draws a body, four wheels, the sparks and the two cones of the flame', () => {
    const car = createCarView(config.render.car);
    expect(meshes(car.object)).toHaveLength(8);
    car.dispose();
  });

  it('draws the sparks and the flame unlit, so they are bright by their colour alone, and hides them with no drift', () => {
    const car = createCarView(config.render.car);
    const lit = meshes(car.object).filter((mesh) => mesh.material instanceof THREE.MeshStandardMaterial);
    const unlit = meshes(car.object).filter((mesh) => mesh.material instanceof THREE.MeshBasicMaterial);
    expect(lit).toHaveLength(5);
    expect(unlit).toHaveLength(3);
    car.set({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      wheels: [0, 1, 2, 3].map(() => ({ at: { x: 0, y: 0, z: 0 }, turn: 0 })),
      sparks: { positions: new Float32Array(0), colors: new Float32Array(0) },
      flame: 0,
    });
    for (const mesh of unlit) expect(mesh.visible).toBe(false);
    car.dispose();
  });

  it("casts no shadow (Tane, check-in 1), and is left out of the sun's shadow maps", () => {
    const car = createCarView(config.render.car);
    for (const mesh of meshes(car.object)) {
      expect(mesh.castShadow).toBe(false);
      const casters = new THREE.Layers();
      casters.set(CASTER_LAYER);
      expect(mesh.layers.test(casters)).toBe(false);
    }
    car.dispose();
  });

  it("still takes the shadows of trees, walls and the gate, so it sits in the world's light", () => {
    const car = createCarView(config.render.car);
    // The kart itself; the sparks and the flame are drawn unlit, bright whatever falls on them.
    const lit = meshes(car.object).filter((mesh) => mesh.material instanceof THREE.MeshStandardMaterial);
    expect(lit).toHaveLength(5);
    for (const mesh of lit) expect(mesh.receiveShadow).toBe(true);
    car.dispose();
  });
});
