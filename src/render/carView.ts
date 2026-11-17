import * as THREE from 'three';
import type { KartViewConfig } from '../config';
import { kartBody, kartWheel, type KartPose } from './carShape';
import { FLAME, toLinear, type Rgb } from './palette';
import type { Shape } from './treeShapes';

/** The kart in the 3D picture. Its shapes and where they go come as plain numbers (`carShape.ts`); this only wraps them for Three.js. */
export interface CarView {
  /** Everything it draws. */
  object: THREE.Group;
  /** Puts the kart and its wheels where the pose says, with its sparks and flame, or hides it for null. */
  set(pose: KartPose | null): void;
  dispose(): void;
}

function toGeometry(shape: Pick<Shape, 'positions' | 'colors' | 'indices'>): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(shape.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(shape.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(shape.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

const UP = new THREE.Vector3(0, 1, 0);
/** Sides of each flame cone. */
const FLAME_SIDES = 8;
/** Where the flame starts, in the body's own directions: the back of the engine block (`kartBody`). */
const EXHAUST = new THREE.Vector3(0, -0.16, 1.1);

/** A cone one long pointing back (+z) from a base of radius 1 at its origin, closed at the base, in one colour. */
function unitCone(colour: Rgb): Pick<Shape, 'positions' | 'colors' | 'indices'> {
  const positions: number[] = [0, 0, 1, 0, 0, 0];
  const indices: number[] = [];
  for (let s = 0; s < FLAME_SIDES; s++) {
    const angle = (s / FLAME_SIDES) * Math.PI * 2;
    positions.push(Math.cos(angle), Math.sin(angle), 0);
  }
  for (let s = 0; s < FLAME_SIDES; s++) {
    const a = 2 + s;
    const b = 2 + ((s + 1) % FLAME_SIDES);
    indices.push(0, a, b, 1, b, a);
  }
  const linear = colour.map(toLinear);
  const colors = positions.map((_, i) => linear[i % 3]!);
  return { positions: new Float32Array(positions), colors: new Float32Array(colors), indices: new Uint32Array(indices) };
}

/**
 * Builds the kart: one body and four wheels sharing one shape, lit by the same
 * sun and sky as everything else and taking the shadows of trees, walls, land
 * and clouds (docs/VISUAL_BAR.md). The drift's sparks and the boost flame are
 * drawn unlit, so they are bright by their colour alone. Nothing here casts a
 * shadow (Tane, check-in 1).
 *
 * @param prepare called with its material, so it can take the land's and the clouds' shadows like the road
 */
export function createCarView(look: KartViewConfig, prepare?: (material: THREE.Material) => void): CarView {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
  prepare?.(material);
  const glowing = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const bodyGeometry = toGeometry(kartBody());
  const wheelGeometry = toGeometry(kartWheel(look));
  const object = new THREE.Group();
  object.visible = false;

  const mesh = (geometry: THREE.BufferGeometry, lit = true): THREE.Mesh => {
    const made = new THREE.Mesh(geometry, lit ? material : glowing);
    // The car casts no shadow of its own (Tane, check-in 1: it was distracting to drive behind), so it stays off the
    // casters' layer the sun's shadow maps draw. It still takes the shadows of trees, walls and the gate.
    made.castShadow = false;
    made.receiveShadow = lit;
    return made;
  };
  object.add(mesh(bodyGeometry));
  const wheels = [0, 1, 2, 3].map(() => {
    const wheel = mesh(wheelGeometry);
    object.add(wheel);
    return wheel;
  });

  // The sparks: loose triangles, rewritten each step; the geometry grows if a pose ever brings more.
  const sparkGeometry = new THREE.BufferGeometry();
  let sparkRoom = 0;
  const sparks = mesh(sparkGeometry, false);
  sparks.frustumCulled = false;
  sparks.visible = false;
  object.add(sparks);

  // The flame: the pale core the whole length, the orange cone round it shorter, both pointing back.
  const outerGeometry = toGeometry(unitCone(FLAME.outer));
  const coreGeometry = toGeometry(unitCone(FLAME.core));
  const outer = mesh(outerGeometry, false);
  const core = mesh(coreGeometry, false);
  for (const cone of [outer, core]) {
    cone.position.copy(EXHAUST);
    cone.visible = false;
    object.add(cone);
  }

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
        // The shape's hub faces +x: the left-hand wheels (0 and 2) are turned half round so theirs faces out.
        wheel.quaternion.setFromAxisAngle(UP, place.turn + (i % 2 === 0 ? Math.PI : 0));
      });

      const count = pose.sparks.positions.length / 3;
      sparks.visible = count > 0;
      if (count > 0) {
        if (count > sparkRoom) {
          sparkRoom = count;
          sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
          sparkGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        }
        const positions = sparkGeometry.getAttribute('position') as THREE.BufferAttribute;
        const colors = sparkGeometry.getAttribute('color') as THREE.BufferAttribute;
        (positions.array as Float32Array).set(pose.sparks.positions);
        (colors.array as Float32Array).set(pose.sparks.colors);
        positions.needsUpdate = true;
        colors.needsUpdate = true;
        sparkGeometry.setDrawRange(0, count);
      }

      const length = pose.flame;
      outer.visible = core.visible = length > 0;
      if (length > 0) {
        const { radius, core: coreShare, outer: outerShare } = look.flame;
        outer.scale.set(radius, radius, length * outerShare);
        core.scale.set(radius * coreShare, radius * coreShare, length);
      }
    },
    dispose() {
      bodyGeometry.dispose();
      wheelGeometry.dispose();
      sparkGeometry.dispose();
      outerGeometry.dispose();
      coreGeometry.dispose();
      material.dispose();
      glowing.dispose();
    },
  };
}
