import * as THREE from 'three';
import type { GrassConfig } from '../config';
import type { Daylight } from './daylight';
import { bladeShape, FLOWER_KINDS, grassBlades, grassGlsl, type GrassEye } from './grass';
import type { GrassGrid } from './grassMaps';
import { FLOWERS, TERRAIN, toLinear, type Rgb } from './palette';
import { DEPTH_GLSL, type WaterDepthGrid } from './waterDepth';

/** The grass blades round the camera, and how to give them an island, a light, a wind and a camera. */
export interface GrassView {
  /** Everything it draws. Hide it to hide the grass. */
  object: THREE.Group;
  /**
   * Gives the grass an island to stand on.
   *
   * @param heights the ground's heights as a one-channel texture (the water's), and the grid they lie on
   * @param grid what grows where (`grassGrid`)
   */
  load(heights: THREE.Texture, ground: WaterDepthGrid, grid: GrassGrid): void;
  /** Lights the blades for a moment of the day. */
  setDaylight(light: Daylight): void;
  /** Moves the wind to this many seconds on its clock. */
  setTime(seconds: number): void;
  /** Tells the grass where the camera is and which way it looks: the fields of blades follow it. Call before drawing. */
  lookFrom(eye: GrassEye): void;
  /** How many blades there are. */
  count(): number;
  dispose(): void;
}

const linear = (target: THREE.Vector3, rgb: Rgb, strength = 1): void => {
  target.set(toLinear(rgb[0]) * strength, toLinear(rgb[1]) * strength, toLinear(rgb[2]) * strength);
};
const float = (value: number): string => (Number.isInteger(value) ? `${value}.0` : String(value));

/**
 * Draws the grass. Which blades there are and every sum that places one come
 * as plain numbers and shader text from `grass.ts`; this only wraps them for
 * Three.js: one draw for each shape of blade, every blade a copy of it.
 *
 * The blades are placed by the graphics card, from the ground's heights and
 * the grass grid, so nothing is worked out here from frame to frame.
 *
 * @param wind the way the wind blows across the map (x, z): the sea's wind
 */
export function createGrassView(cfg: GrassConfig, wind: readonly [number, number]): GrassView {
  const object = new THREE.Group();
  const blades = grassBlades(cfg);

  const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  blank.needsUpdate = true;
  const noHeights = new THREE.DataTexture(new Float32Array(1), 1, 1, THREE.RedFormat, THREE.FloatType);
  noHeights.needsUpdate = true;

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uGround: { value: null },
      uGroundSize: { value: 1 },
      uGroundOrigin: { value: 0 },
      uGroundCell: { value: 1 },
      uOpenSea: { value: -20 },
      uGrass: { value: null },
      uGrassReach: { value: 1 },
      uGrassEye: { value: new THREE.Vector2() },
      uGrassLook: { value: new THREE.Vector2() },
      uGrassTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunLight: { value: new THREE.Vector3(1, 1, 1) },
      uAmbient: { value: new THREE.Vector3(0.4, 0.4, 0.4) },
      uLush: { value: new THREE.Vector3() },
      uDry: { value: new THREE.Vector3() },
      uFlowers: { value: FLOWERS.slice(0, FLOWER_KINDS).map(() => new THREE.Vector3()) },
    },
  ]);
  // `merge` copies values, so the textures are set on the copy.
  uniforms.uGround!.value = noHeights;
  uniforms.uGrass!.value = blank;
  linear(uniforms.uLush!.value, TERRAIN.grassLush);
  linear(uniforms.uDry!.value, TERRAIN.grassDry);
  (uniforms.uFlowers!.value as THREE.Vector3[]).forEach((colour, k) => linear(colour, FLOWERS[k]!));

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    fog: true,
    uniforms,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      ${DEPTH_GLSL}
      ${grassGlsl(cfg, wind)}
      attribute vec2 aOffset;
      attribute vec4 aTrait;
      attribute vec3 aTier;
      attribute float aFlower;
      varying float vAlong;
      varying float vVariation;
      varying float vFlower;
      void main() {
        vec3 world = grassVertex(position.xy, aOffset, aTrait, aTier, aFlower, vAlong, vVariation, vFlower);
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform vec3 uSunDir, uSunLight, uAmbient, uLush, uDry;
      uniform vec3 uFlowers[${FLOWER_KINDS}];
      varying float vAlong;
      varying float vVariation;
      varying float vFlower;
      void main() {
        // The ground's own greens, darker at the foot of a blade and lighter at its tip.
        vec3 col = mix(uLush, uDry, vVariation) * mix(${float(cfg.shade[0])}, ${float(cfg.shade[1])}, vAlong);
        if (vFlower > 0.5 && vAlong > ${float(1 - cfg.flowers.tip)}) {
          col = uFlowers[int(vFlower + 0.5) - 1];
        }
        // A blade stands upright, so it catches a low sun better than the ground does, and its tip more than its foot.
        float sunUp = clamp(uSunDir.y * 1.6, 0.0, 1.0);
        vec3 light = uAmbient + uSunLight * (0.3 + 0.6 * vAlong) * (0.45 + 0.55 * sunUp);
        gl_FragColor = vec4(col * light, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });

  // One draw for each shape of blade: the fields whose blades have the same number of triangles share one.
  const geometries: THREE.InstancedBufferGeometry[] = [];
  for (const triangles of [3, 1] as const) {
    const tiers = blades.tiers.filter((tier) => tier.triangles === triangles);
    const count = tiers.reduce((sum, tier) => sum + tier.count, 0);
    if (count === 0) continue;
    const offset = new Float32Array(count * 2);
    const trait = new Float32Array(count * 4);
    const tierOf = new Float32Array(count * 3);
    const flower = new Float32Array(count);
    let at = 0;
    for (const tier of tiers) {
      offset.set(blades.offset.subarray(tier.start * 2, (tier.start + tier.count) * 2), at * 2);
      trait.set(blades.trait.subarray(tier.start * 4, (tier.start + tier.count) * 4), at * 4);
      for (let n = 0; n < tier.count; n++) {
        tierOf[(at + n) * 3] = tier.half;
        tierOf[(at + n) * 3 + 1] = tier.inner;
        tierOf[(at + n) * 3 + 2] = tier.width;
        flower[at + n] = blades.flower[tier.start + n]!;
      }
      at += tier.count;
    }
    const shape = bladeShape(triangles);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(shape.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(shape.indices, 1));
    geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 2));
    geometry.setAttribute('aTrait', new THREE.InstancedBufferAttribute(trait, 4));
    geometry.setAttribute('aTier', new THREE.InstancedBufferAttribute(tierOf, 3));
    geometry.setAttribute('aFlower', new THREE.InstancedBufferAttribute(flower, 1));
    geometry.instanceCount = count;
    const mesh = new THREE.Mesh(geometry, material);
    // The blades are placed in the shader, wherever the camera is: there is nothing here to test against the view.
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    object.add(mesh);
    geometries.push(geometry);
  }

  let grassTexture: THREE.Texture = blank;

  return {
    object,

    load(heights, ground, grid) {
      const texture = new THREE.DataTexture(grid.data, grid.size, grid.size, THREE.RGBAFormat, THREE.UnsignedByteType);
      // Read between cells with blending, as `grassAt` does.
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      if (grassTexture !== blank) grassTexture.dispose();
      grassTexture = texture;
      uniforms.uGrass!.value = texture;
      uniforms.uGrassReach!.value = grid.reach;
      uniforms.uGround!.value = heights;
      uniforms.uGroundSize!.value = ground.size;
      uniforms.uGroundOrigin!.value = ground.origin;
      uniforms.uGroundCell!.value = ground.cell;
      uniforms.uOpenSea!.value = ground.openSea;
    },

    setDaylight(light) {
      // Three's lights reach a surface divided by pi; the grass takes its light the same way as the ground.
      linear(uniforms.uSunLight!.value, light.sunColour, light.sunStrength / Math.PI);
      linear(uniforms.uAmbient!.value, light.skyLight, light.skyStrength / Math.PI);
      uniforms.uSunDir!.value.set(light.sun.x, light.sun.y, light.sun.z);
    },

    setTime(seconds) {
      uniforms.uGrassTime!.value = seconds;
    },

    lookFrom(eye) {
      uniforms.uGrassEye!.value.set(eye.x, eye.z);
      uniforms.uGrassLook!.value.set(eye.lookX, eye.lookZ);
    },

    count() {
      return blades.count;
    },

    dispose() {
      if (grassTexture !== blank) grassTexture.dispose();
      blank.dispose();
      noHeights.dispose();
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
    },
  };
}
