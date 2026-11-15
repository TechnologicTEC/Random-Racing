import * as THREE from 'three';
import type { Clouds } from '../gen/types';
import { cloudGlow, cloudMatrices, type CloudDrift } from './clouds';
import type { Daylight } from './daylight';
import { toLinear } from './palette';
import { puffShape } from './treeShapes';

/** The clouds of a world: every puff a copy of one ball, drifting down the wind. */
export interface CloudView {
  /** Everything it draws. Hide it to hide the clouds. */
  object: THREE.Group;
  /** Replaces whatever is shown with these clouds, at the moment the clock stands at. */
  load(clouds: Clouds): void;
  /** Moves the clouds to this many seconds on their clock. */
  setTime(seconds: number): void;
  /** Tells the clouds where the camera is, so those close to it thin away. Call before drawing. */
  lookFrom(camera: THREE.Vector3): void;
  /** Lights their shaded sides for a moment of the day. */
  setDaylight(light: Daylight): void;
  /** How many puffs are loaded. */
  count(): number;
  dispose(): void;
}

/**
 * Draws the clouds. Where each puff is comes as plain numbers (`clouds.ts`);
 * this only wraps them for Three.js.
 *
 * @param glow share of the sky's light the clouds give off themselves, so their shaded sides are not dark
 * @param fullSkyStrength the strength of the sky's light in full day
 * @param thin how near the camera a puff is gone altogether, and from how far it is full size, in metres
 */
export function createCloudView(drift: CloudDrift, glow: number, fullSkyStrength: number, thin: readonly [number, number]): CloudView {
  const object = new THREE.Group();
  const shape = puffShape();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(shape.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(shape.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(shape.indices, 1));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });

  let loaded: Clouds | null = null;
  let mesh: THREE.InstancedMesh | null = null;
  let seconds = 0;
  const eye = { x: 0, y: 0, z: 0, thin };

  const place = (): void => {
    if (!loaded || !mesh) return;
    cloudMatrices(loaded, seconds, drift, mesh.instanceMatrix.array as Float32Array, eye);
    mesh.instanceMatrix.needsUpdate = true;
  };

  const clear = (): void => {
    mesh?.dispose();
    object.clear();
    mesh = null;
    loaded = null;
  };

  return {
    object,

    load(clouds) {
      clear();
      loaded = clouds;
      if (clouds.puffCount === 0) return;
      mesh = new THREE.InstancedMesh(geometry, material, clouds.puffCount);
      // The puffs move every frame; working out what holds them all each time would cost more than drawing them.
      mesh.frustumCulled = false;
      object.add(mesh);
      place();
    },

    setTime(next) {
      seconds = next;
      place();
    },

    lookFrom(camera) {
      if (camera.x === eye.x && camera.y === eye.y && camera.z === eye.z) return;
      eye.x = camera.x;
      eye.y = camera.y;
      eye.z = camera.z;
      place();
    },

    setDaylight(light) {
      const [r, g, b] = cloudGlow(light, glow, fullSkyStrength);
      material.emissive.setRGB(toLinear(r), toLinear(g), toLinear(b));
    },

    count() {
      return loaded?.puffCount ?? 0;
    },

    dispose() {
      clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
