import * as THREE from 'three';
import type { SpeedLine } from './driftEffects';

/** The speed lines drawn over the finished picture while a boost runs (6h-5). */
export interface SpeedLinesView {
  set(lines: SpeedLine[]): void;
  /** Draws them onto the screen, after the scene and its bloom; nothing with no lines. */
  render(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
}

/** Thin pale lines on the picture itself (x and y from -1 to 1), fading towards their outer end. */
export function createSpeedLinesView(): SpeedLinesView {
  const overlay = new THREE.Scene();
  const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.BufferGeometry();
  // Pale lines over the picture, see-through by their alpha: not light added, so they read on the sky as on the road.
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  overlay.add(lines);
  let count = 0;
  let room = 0;

  return {
    set(list) {
      count = list.length;
      if (count === 0) return;
      if (count > room) {
        room = count;
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(room * 6), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(room * 8), 4));
      }
      const position = geometry.getAttribute('position') as THREE.BufferAttribute;
      const colour = geometry.getAttribute('color') as THREE.BufferAttribute;
      list.forEach((line, k) => {
        // Half way between the flat camera's near and far planes (it looks down -z from the origin), never clipped.
        position.setXYZ(2 * k, line.from[0], line.from[1], -0.5);
        position.setXYZ(2 * k + 1, line.to[0], line.to[1], -0.5);
        colour.setXYZW(2 * k, 1, 1, 1, line.alpha);
        colour.setXYZW(2 * k + 1, 1, 1, 1, 0);
      });
      position.needsUpdate = true;
      colour.needsUpdate = true;
      geometry.setDrawRange(0, count * 2);
    },
    render(renderer) {
      if (count === 0) return;
      const autoClear = renderer.autoClear;
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.render(overlay, flat);
      renderer.autoClear = autoClear;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
