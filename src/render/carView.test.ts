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
  it('draws a body and four wheels', () => {
    const car = createCarView(config.render.car);
    expect(meshes(car.object)).toHaveLength(5);
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
    for (const mesh of meshes(car.object)) expect(mesh.receiveShadow).toBe(true);
    car.dispose();
  });
});
