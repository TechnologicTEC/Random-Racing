import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { BLOOM_LAYER, createCarView } from './carView';
import { CASTER_LAYER } from './decorView';
import type { KartPose } from './carShape';

/** Every mesh the car view draws. */
function meshes(object: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) found.push(child);
  });
  return found;
}

const lit = (car: { object: THREE.Object3D }) => meshes(car.object).filter((mesh) => mesh.material instanceof THREE.MeshStandardMaterial);
const sprites = (car: { object: THREE.Object3D }) => meshes(car.object).filter((mesh) => mesh.material instanceof THREE.ShaderMaterial);

const STILL: KartPose = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  wheels: [0, 1, 2, 3].map(() => ({ at: { x: 0, y: 0, z: 0 }, turn: 0 })),
  sprites: [],
  lean: 0,
  squash: 1,
};

describe('the car view', () => {
  it('draws a body, four wheels, and one mesh of sprites for each kind of effect', () => {
    const car = createCarView(config.render.car);
    expect(lit(car)).toHaveLength(5);
    expect(sprites(car)).toHaveLength(5);
    car.dispose();
  });

  it('adds the sparks, burst, glows and flame as light, and hides every effect with no drift', () => {
    const car = createCarView(config.render.car);
    const additive = sprites(car).filter((mesh) => (mesh.material as THREE.Material).blending === THREE.AdditiveBlending);
    const blended = sprites(car).filter((mesh) => (mesh.material as THREE.Material).blending === THREE.NormalBlending);
    // The smoke alone is see-through, not light.
    expect(additive).toHaveLength(4);
    expect(blended).toHaveLength(1);
    for (const mesh of sprites(car)) expect((mesh.material as THREE.Material).depthWrite).toBe(false);
    car.set(STILL);
    for (const mesh of sprites(car)) expect(mesh.visible).toBe(false);
    car.dispose();
  });

  it('puts the glowing effects, and only those, on the layer the bloom draws, and the kart there too so it hides what is behind it', () => {
    const car = createCarView(config.render.car);
    const bloom = new THREE.Layers();
    bloom.set(BLOOM_LAYER);
    for (const mesh of sprites(car)) {
      const glows = (mesh.material as THREE.Material).blending === THREE.AdditiveBlending;
      expect(mesh.layers.test(bloom)).toBe(glows);
    }
    for (const mesh of lit(car)) expect(mesh.layers.test(bloom)).toBe(true);
    car.dispose();
  });

  it('shows a kind of sprite when the pose has one, and leans the body without the wheels', () => {
    const car = createCarView(config.render.car);
    car.set({
      ...STILL,
      sprites: [{ kind: 'streak', at: { x: 0.6, y: -0.4, z: 0.9 }, axis: { x: 1, y: 0, z: 0 }, width: 0.02, length: 0.1, colour: [3, 2, 1], alpha: 1 }],
      lean: 0.07,
    });
    expect(sprites(car).filter((mesh) => mesh.visible)).toHaveLength(1);
    const [body, ...wheels] = lit(car);
    expect(body!.rotation.z).toBeCloseTo(0.07, 9);
    // The wheels stay upright, on the road.
    for (const wheel of wheels) expect(new THREE.Vector3(0, 1, 0).applyQuaternion(wheel.quaternion).y).toBeCloseTo(1, 9);
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
    for (const mesh of lit(car)) expect(mesh.receiveShadow).toBe(true);
    car.dispose();
  });
});
