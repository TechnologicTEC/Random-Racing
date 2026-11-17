import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { BloomConfig } from '../config';
import { BLOOM_LAYER, type CarView } from './carView';

/** The glow round the drift's effects (Tane, 6h-5), added on top of the finished picture. */
export interface Bloom {
  /** Fits its pictures to the screen's drawing size, in pixels. */
  setSize(width: number, height: number): void;
  setOn(on: boolean): void;
  /** Whether it added anything on the last frame: only while the car shows a glowing effect. */
  drew(): boolean;
  /** Draws the glow onto the screen, after the scene. Does nothing when off or when no glowing effect is shown. */
  render(scene: THREE.Scene, camera: THREE.Camera, car: CarView): void;
  dispose(): void;
}

/**
 * Only the drift's glowing effects are bloomed, never the island: they are
 * drawn on their own into a half-float picture `scale` of the screen's size,
 * with the kart in depth only so it hides what is behind it, and Three.js's
 * `UnrealBloomPass` spreads them. The spread light alone (not the effects
 * again, which the scene has drawn sharp) is added on top of the screen. With
 * no glowing effect shown nothing is drawn at all, so a picture without them
 * is exactly the same with bloom on or off.
 */
export function createBloom(renderer: THREE.WebGLRenderer, cfg: BloomConfig): Bloom {
  let on = cfg.enabled;
  let drewLast = false;
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  // A threshold of 0: everything in this picture is an effect, and every effect glows.
  const pass = new UnrealBloomPass(new THREE.Vector2(1, 1), cfg.strength, cfg.radius, 0);
  const overlay = new THREE.Scene();
  const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const add = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), add);
  quad.frustumCulled = false;
  // Half way between the flat camera's near and far planes (it looks down -z from the origin), never clipped.
  quad.position.z = -0.5;
  overlay.add(quad);
  const clear = new THREE.Color();

  return {
    setSize(width, height) {
      const w = Math.max(1, Math.round(width * cfg.scale));
      const h = Math.max(1, Math.round(height * cfg.scale));
      target.setSize(w, h);
      pass.setSize(w, h);
    },
    setOn(next) {
      on = next;
    },
    drew: () => drewLast,
    render(scene, camera, car) {
      drewLast = on && car.glowing();
      if (!drewLast) return;
      // The effects alone: no sky, no haze, nothing but the bloom's layer, and no new shadow maps.
      const background = scene.background;
      const fog = scene.fog;
      const mask = camera.layers.mask;
      const shadows = renderer.shadowMap.autoUpdate;
      const autoClear = renderer.autoClear;
      const alpha = renderer.getClearAlpha();
      renderer.getClearColor(clear);
      scene.background = null;
      scene.fog = null;
      camera.layers.set(BLOOM_LAYER);
      renderer.shadowMap.autoUpdate = false;
      car.setForBloom(true);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      car.setForBloom(false);
      camera.layers.mask = mask;
      scene.background = background;
      scene.fog = fog;
      renderer.shadowMap.autoUpdate = shadows;

      // Spread it, then add the spread light alone on top of the screen.
      pass.render(renderer, target, target, 0, false);
      add.map = pass.renderTargetsHorizontal[0]!.texture;
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.render(overlay, flat);
      renderer.autoClear = autoClear;
      renderer.setClearColor(clear, alpha);
    },
    dispose() {
      target.dispose();
      pass.dispose();
      quad.geometry.dispose();
      add.dispose();
    },
  };
}
