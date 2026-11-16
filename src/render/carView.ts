import * as THREE from 'three';
import type { KartViewConfig } from '../config';
import { kartBody, kartWheel, type KartPose } from './carShape';
import { CASTER_LAYER } from './decorView';
import type { Shape } from './treeShapes';

/** The kart in the 3D picture. Its shapes and where they go come as plain numbers (`carShape.ts`); this only wraps them for Three.js. */
export interface CarView {
  /** Everything it draws. */
  object: THREE.Group;
  /** Puts the kart and its wheels where the pose says, or hides it for null. */
  set(pose: KartPose | null): void;
  dispose(): void;
}

function toGeometry(shape: Shape): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(shape.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(shape.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(shape.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Builds the kart: one body and four wheels sharing one shape. It is lit by
 * the same sun and sky as everything else, casts a shadow and takes the
 * shadows of trees, walls, land and clouds (docs/VISUAL_BAR.md).
 *
 * @param prepare called with its material, so it can take the land's and the clouds' shadows like the road
 */
export function createCarView(look: KartViewConfig, prepare?: (material: THREE.Material) => void): CarView {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
  prepare?.(material);
  const bodyGeometry = toGeometry(kartBody());
  const wheelGeometry = toGeometry(kartWheel(look));
  const object = new THREE.Group();
  object.visible = false;

  const mesh = (geometry: THREE.BufferGeometry): THREE.Mesh => {
    const made = new THREE.Mesh(geometry, material);
    made.castShadow = true;
    made.receiveShadow = true;
    // On the casters' layer as well, so the sun's shadow maps draw it.
    made.layers.enable(CASTER_LAYER);
    return made;
  };
  object.add(mesh(bodyGeometry));
  const wheels = [0, 1, 2, 3].map(() => {
    const wheel = mesh(wheelGeometry);
    object.add(wheel);
    return wheel;
  });

  return {
    object,
    set(pose) {
      object.visible = pose !== null;
      if (!pose) return;
      object.position.set(pose.position.x, pose.position.y, pose.position.z);
      object.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
      pose.wheels.forEach((place, i) => {
        const wheel = wheels[i]!;
        wheel.position.set(place.at.x, place.at.y, place.at.z);
        // The shape's hub faces +x: the left-hand wheels (0 and 2) are turned half round so theirs faces out too.
        wheel.quaternion.setFromAxisAngle(UP, place.turn + (i % 2 === 0 ? Math.PI : 0));
      });
    },
    dispose() {
      bodyGeometry.dispose();
      wheelGeometry.dispose();
      material.dispose();
    },
  };
}
