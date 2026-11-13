import * as THREE from 'three';
import type { WaterConfig } from '../config';
import type { Daylight } from './daylight';
import { toLinear, WATER, type Rgb } from './palette';
import { DEPTH_GLSL, type WaterDepthGrid } from './waterDepth';

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

/** One line of GLSL adding a wave's slope, faded with distance (`detail` for small waves, `swell` for large ones). */
function waveLine(wave: WaterConfig['waves'][number]): string {
  const [dx, dz] = wave.direction;
  const length = Math.hypot(dx, dz);
  const k = (2 * Math.PI) / wave.length;
  const term = `wave(p, vec2(${float(dx / length)}, ${float(dz / length)}), ${float(k)}, ${float(wave.height)}, ${float(wave.speed)})`;
  return `g += ${term} * ${wave.small ? 'detail' : 'swell'};`;
}

/**
 * The island demo's water: a flat plane whose shading moves with summed waves,
 * coloured from shallow to deep by the depth of the ground under it, reflecting
 * the sky at low angles and the sun in glints, with moving foam along the shore,
 * see-through in the shallows, and hazed with distance like everything else.
 *
 * @param size width of the plane, in metres
 */
export function createWater(size: number, cfg: WaterConfig): Water {
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
      vec2 wave(vec2 p, vec2 d, float k, float a, float s) {
        return d * k * a * cos(dot(d, p) * k + uTime * s);
      }
      void main() {
        vec2 p = vWorld.xz;
        float away = length(cameraPosition - vWorld);
        float detail = 1.0 - smoothstep(${float(cfg.detailFade[0])}, ${float(cfg.detailFade[1])}, away);
        float swell = 1.0 - smoothstep(${float(cfg.swellFade[0])}, ${float(cfg.swellFade[1])}, away);
        vec2 g = vec2(0.0);
        ${cfg.waves.map(waveLine).join('\n        ')}
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vWorld);

        float depth = depthAt(p);
        vec3 water = mix(uDeep, uShallow, 1.0 - smoothstep(0.0, ${float(cfg.shallowDepth)}, depth));
        vec3 light = uAmbient + uSunLight * (0.35 + 0.65 * max(uSunDir.y, 0.0));
        vec3 col = water * light;

        float fres = pow(1.0 - max(dot(n, V), 0.0), ${float(cfg.fresnel)});
        col = mix(col, uSky, clamp(fres * 0.9, 0.0, ${float(cfg.fresnelMost)}));
        vec3 R = reflect(-uSunDir, n);
        col += uGlint * pow(max(dot(R, V), 0.0), ${float(cfg.glint)}) * ${float(cfg.glintStrength)};

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
