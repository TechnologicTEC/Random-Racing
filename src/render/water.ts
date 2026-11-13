import * as THREE from 'three';
import type { WaterConfig } from '../config';
import type { Daylight } from './daylight';
import { toLinear, WATER, type Rgb } from './palette';
import { DEPTH_GLSL, type WaterDepthGrid } from './waterDepth';
import { wavesGlsl } from './waves';

/** The sea's surface, and how to change its light, its depths and its waves. */
export interface Water {
  mesh: THREE.Mesh;
  /** Sets the depths from an island's ground. */
  setDepths(grid: WaterDepthGrid): void;
  /** Lights the water for a moment of the day. */
  setDaylight(light: Daylight): void;
  /** Moves the waves to this many seconds on their clock. */
  setTime(seconds: number): void;
  dispose(): void;
}

const linear = (target: THREE.Color | THREE.Vector3, rgb: Rgb, strength = 1): void => {
  target.set(toLinear(rgb[0]) * strength, toLinear(rgb[1]) * strength, toLinear(rgb[2]) * strength);
};
const float = (value: number): string => (Number.isInteger(value) ? `${value}.0` : String(value));

/**
 * The island demo's water, with waves of our own (`waves.ts`): a flat plane
 * whose shading moves with the waves, coloured from shallow to deep by the
 * depth of the ground under it, reflecting the sky at low angles and the sun
 * in glints, with moving foam along the shore, see-through in the shallows,
 * and hazed with distance like everything else.
 *
 * @param size width of the plane, in metres
 */
export function createWater(size: number, cfg: WaterConfig): Water {
  /** The height of the sea when every train is at its usual height and all their crests meet. */
  const usualHeight = cfg.waves.reduce((sum, wave) => sum + wave.height, 0);
  const ground = new THREE.DataTexture(new Float32Array(1), 1, 1, THREE.RedFormat, THREE.FloatType);
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uGround: { value: ground },
      uGroundSize: { value: 1 },
      uGroundOrigin: { value: 0 },
      uGroundCell: { value: 1 },
      uOpenSea: { value: -20 },
      uTime: { value: cfg.stillTime },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunLight: { value: new THREE.Vector3(1, 1, 1) },
      uAmbient: { value: new THREE.Vector3(0.4, 0.4, 0.4) },
      uSky: { value: new THREE.Vector3(0.6, 0.75, 0.9) },
      uGlint: { value: new THREE.Vector3(1, 1, 1) },
      uDeep: { value: new THREE.Vector3() },
      uShallow: { value: new THREE.Vector3() },
      uFoam: { value: new THREE.Vector3() },
    },
  ]);
  // `merge` copies values, so the texture is set again on the copy.
  uniforms.uGround.value = ground;
  linear(uniforms.uDeep.value, WATER.deep);
  linear(uniforms.uShallow.value, WATER.shallow);
  linear(uniforms.uFoam.value, WATER.foam);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      ${DEPTH_GLSL}
      uniform float uTime;
      uniform vec3 uSunDir, uSunLight, uAmbient, uSky, uGlint, uDeep, uShallow, uFoam;
      varying vec3 vWorld;
      ${wavesGlsl(cfg)}
      void main() {
        vec2 p = vWorld.xz;
        // Waves a pixel cannot show are left out; "lost" is how rough they would have made the sea.
        float lost;
        float rise;
        vec2 g = seaSlope(p, uTime, dFdx(p), dFdy(p), lost, rise);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vWorld);

        float depth = depthAt(p);
        vec3 water = mix(uDeep, uShallow, 1.0 - smoothstep(0.0, ${float(cfg.shallowDepth)}, depth));
        // The tops of the taller waves are thinner water with the light in them: a little towards the shallow colour.
        float top = smoothstep(${float(cfg.crestLight[0])}, ${float(cfg.crestLight[1])}, rise / ${float(usualHeight)});
        water = mix(water, uShallow, top * ${float(cfg.crestLight[2])});
        // The sun lights the faces of the waves turned towards it and leaves their backs darker.
        vec3 face = normalize(vec3(-g.x * ${float(cfg.shade)}, 1.0, -g.y * ${float(cfg.shade)}));
        vec3 light = uAmbient + uSunLight * (0.35 + 0.65 * max(dot(face, uSunDir), 0.0));
        vec3 col = water * light;

        float fres = pow(1.0 - max(dot(n, V), 0.0), ${float(cfg.fresnel)});
        col = mix(col, uSky, clamp(fres * 0.9, 0.0, ${float(cfg.fresnelMost)}));
        vec3 R = reflect(-uSunDir, n);
        // Where waves were left out, the sun's glints spread and soften, as light off unseen waves does.
        float sharp = ${float(cfg.glint)} / (1.0 + ${float(cfg.glint * cfg.glintSpread)} * lost);
        float glints = pow(sharp / ${float(cfg.glint)}, ${float(cfg.glintDim)});
        col += uGlint * pow(max(dot(R, V), 0.0), sharp) * ${float(cfg.glintStrength)} * glints;

        float band = sin(depth * ${float(cfg.foamBands)} - uTime * ${float(cfg.foamSpeed)} + sin(p.x * 0.15 + p.y * 0.12) * 2.0) * 0.5 + 0.5;
        float foam = (1.0 - smoothstep(0.0, ${float(cfg.foamDepth)}, depth)) * smoothstep(0.55, 0.9, band);
        foam += 1.0 - smoothstep(0.0, ${float(cfg.edgeFoam)}, depth);
        foam = clamp(foam, 0.0, 1.0);
        col = mix(col, uFoam * (uAmbient + uSunLight * 0.8), foam * 0.85);

        float alpha = mix(${float(cfg.opacity[0])}, ${float(cfg.opacity[1])}, smoothstep(0.0, ${float(cfg.clearDepth)}, depth));
        alpha = max(alpha, foam * 0.9);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
        #ifdef USE_FOG
          // Far water fades into the haze completely, not into whatever is under it.
          gl_FragColor.a = mix(gl_FragColor.a, 1.0, fogFactor);
        #endif
      }
    `,
  });

  const geometry = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    setDepths(grid) {
      const texture = new THREE.DataTexture(grid.data, grid.size, grid.size, THREE.RedFormat, THREE.FloatType);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      (uniforms.uGround.value as THREE.Texture).dispose();
      uniforms.uGround.value = texture;
      uniforms.uGroundSize.value = grid.size;
      uniforms.uGroundOrigin.value = grid.origin;
      uniforms.uGroundCell.value = grid.cell;
      uniforms.uOpenSea.value = grid.openSea;
    },
    setDaylight(light) {
      // Three's lights reach a surface divided by pi; the water takes its light the same way as the ground.
      linear(uniforms.uSunLight.value, light.sunColour, light.sunStrength / Math.PI);
      linear(uniforms.uAmbient.value, light.skyLight, light.skyStrength / Math.PI);
      linear(uniforms.uSky.value, light.waterSky);
      linear(uniforms.uGlint.value, light.waterGlint);
      uniforms.uSunDir.value.set(light.sun.x, light.sun.y, light.sun.z);
    },
    setTime(seconds) {
      uniforms.uTime.value = seconds;
    },
    dispose() {
      (uniforms.uGround.value as THREE.Texture).dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
