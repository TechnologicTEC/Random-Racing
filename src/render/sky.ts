import * as THREE from 'three';
import type { SkyDomeConfig } from '../config';
import type { Daylight } from './daylight';
import { toLinear, type Rgb } from './palette';

/** The dome of sky round the camera, and how to set its colours for a moment of the day. */
export interface SkyDome {
  mesh: THREE.Mesh;
  /** Sets the sky's colours and the sun's place from the day's light. */
  update(light: Daylight): void;
  dispose(): void;
}

const linear = (target: THREE.Color, rgb: Rgb): THREE.Color => target.setRGB(toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2]));
const float = (value: number): string => (Number.isInteger(value) ? `${value}.0` : String(value));

/**
 * The island demo's sky: horizon to zenith, a warm glow round a low sun, the
 * sun's disc and halo, and haze below the horizon so the sky meets the far sea
 * without a seam. It is drawn before everything else and hides nothing.
 *
 * @param radius metres; the dome follows the camera, so it only has to be inside the camera's far distance
 */
export function createSkyDome(radius: number, cfg: SkyDomeConfig): SkyDome {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uHaze: { value: new THREE.Color() },
      uSunColour: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uZenith, uHorizon, uGlow, uHaze, uSunColour;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float up = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(up, ${float(cfg.horizonCurve)}));
        float toSun = dot(d, uSunDir);
        float nearSun = max(toSun, 0.0);
        col += uGlow * pow(nearSun, ${float(cfg.glowSharpness)}) * (1.0 - smoothstep(0.0, ${float(cfg.glowHeight)}, up));
        col += uGlow * ${float(cfg.lowGlow)} * (1.0 - smoothstep(0.0, ${float(cfg.lowGlowHeight)}, up));
        col = mix(col, uSunColour, smoothstep(${float(cfg.disc[0])}, ${float(cfg.disc[1])}, toSun));
        col += uSunColour * pow(nearSun, ${float(cfg.halo)}) * ${float(cfg.haloStrength)};
        col = mix(uHaze, col, smoothstep(${float(cfg.groundFade[0])}, ${float(cfg.groundFade[1])}, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const geometry = new THREE.SphereGeometry(radius, 48, 24);
  const mesh = new THREE.Mesh(geometry, material);
  // Drawn first, and never left out: it follows the camera.
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;

  const u = material.uniforms;
  return {
    mesh,
    update(light) {
      u.uSunDir!.value.set(light.sun.x, light.sun.y, light.sun.z);
      linear(u.uZenith!.value, light.zenith);
      linear(u.uHorizon!.value, light.horizon);
      linear(u.uGlow!.value, light.glow);
      linear(u.uHaze!.value, light.haze);
      linear(u.uSunColour!.value, light.sunDisc);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
