import * as THREE from 'three';
import type { ShadowConfig } from '../config';
import type { Clouds, HeightField } from '../gen/types';
import type { CloudDrift } from './clouds';
import { cloudShadeMap } from './cloudShade';
import { shadeGlsl } from './shade';
import { landShade, smoothstep, type LandShade } from './terrainShade';

/** The shadows of the land and the clouds, ready for every material the sun lights. */
export interface ShadeView {
  /** The uniforms `glsl` reads. Shared by reference: a material that takes them follows every change. */
  uniforms: Record<string, THREE.IUniform>;
  /** The shader text: `sunShade(world)`, the share of the sun reaching a point in the world. */
  glsl: string;
  /** Gives the shadows an island's ground. */
  setGround(ground: HeightField): void;
  /** Gives them the island's clouds. */
  setClouds(clouds: Clouds): void;
  /** Moves the sun: the land's shadows are worked out again. */
  setSun(sun: { x: number; y: number; z: number }): void;
  /** Moves the clouds' shadows to this many seconds on the clouds' clock. */
  setTime(seconds: number): void;
  /** Shows or hides every shadow. */
  setOn(on: boolean): void;
  /** Shows or hides the clouds' shadows alone (with the clouds themselves). */
  setCloudsOn(on: boolean): void;
  /** The share of the island's land in the land's own shadow (0 to 1), or 0 with shadows off. */
  shaded(): number;
  /** Makes a standard Three.js material take the shadows: its sun's light is multiplied by `sunShade`. */
  patch(material: THREE.Material): void;
  dispose(): void;
}

/** A line of Three.js's own shader text, and what replaces it. Throws if the line is missing, so a Three.js upgrade fails loudly. */
function swap(text: string, line: string, by: string): string {
  if (!text.includes(line)) throw new Error(`Shadows: Three.js's shader text no longer has "${line}"`);
  return text.replace(line, by);
}

/** The lines of Three.js's lighting where a directional light (and, from step 15f, its sun light) is read. */
const SUN_LINES = ['getDirectionalLightInfo( directionalLight, directLight );', 'getSunLightInfo( sunLight, directLight );'];

/**
 * The land's and the clouds' shadows for Three.js: two maps as textures, and
 * the uniforms the shared shader text reads. Everything they hold is worked
 * out as plain numbers in `terrainShade.ts` and `cloudShade.ts`.
 */
export function createShadeView(cfg: ShadowConfig, drift: CloudDrift): ShadeView {
  const glsl = shadeGlsl(cfg);
  const blankLand = new THREE.DataTexture(new Float32Array([-1e9]), 1, 1, THREE.RedFormat, THREE.FloatType);
  blankLand.needsUpdate = true;
  const blankClouds = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
  blankClouds.needsUpdate = true;
  let landTexture: THREE.DataTexture = blankLand;
  let cloudTexture: THREE.DataTexture = blankClouds;
  let ground: HeightField | null = null;
  let sun: { x: number; y: number; z: number } | null = null;
  let span = 1;
  let on = true;
  let shadedShare = 0;

  const uniforms: Record<string, THREE.IUniform> = {
    uLandTop: { value: blankLand },
    uLandSize: { value: 1 },
    // Far away, so nothing is shaded until an island is given.
    uLandOrigin: { value: 1e9 },
    uLandCell: { value: 1 },
    uLandSoft: { value: 1 },
    uCloudShade: { value: blankClouds },
    uCloudSpan: { value: 1 },
    uCloudLayer: { value: 0 },
    uCloudShift: { value: new THREE.Vector2() },
    uCloudFade: { value: Math.max(1, drift.fade) },
    uCloudOn: { value: 1 },
    uShadeSun: { value: new THREE.Vector3(0, 1, 0) },
    uShadeOn: { value: 1 },
  };

  /** Works the land's shadow out for the ground and sun given, and counts how much of the land is in it. */
  const reshade = (): void => {
    if (!ground || !sun) return;
    const shade: LandShade = landShade(ground, sun, cfg.land);
    if (landTexture === blankLand || landTexture.image.width !== ground.size) {
      if (landTexture !== blankLand) landTexture.dispose();
      landTexture = new THREE.DataTexture(shade.top, ground.size, ground.size, THREE.RedFormat, THREE.FloatType);
      landTexture.magFilter = THREE.NearestFilter;
      landTexture.minFilter = THREE.NearestFilter;
      landTexture.generateMipmaps = false;
    } else {
      landTexture.image.data = shade.top;
    }
    landTexture.needsUpdate = true;
    uniforms.uLandTop!.value = landTexture;
    uniforms.uLandSize!.value = ground.size;
    uniforms.uLandOrigin!.value = ground.origin;
    uniforms.uLandCell!.value = ground.cell;
    uniforms.uLandSoft!.value = shade.soft;
    let land = 0;
    let dark = 0;
    for (let c = 0; c < ground.height.length; c += 3) {
      const h = ground.height[c]!;
      if (h <= 0) continue;
      land++;
      if (smoothstep(shade.top[c]! - shade.soft, shade.top[c]!, h + shade.bias) < 0.5) dark++;
    }
    shadedShare = land > 0 ? dark / land : 0;
  };

  return {
    uniforms,
    glsl,

    setGround(next) {
      ground = next;
      reshade();
    },

    setClouds(clouds) {
      const map = cloudShadeMap(clouds, cfg.clouds);
      if (cloudTexture !== blankClouds) cloudTexture.dispose();
      cloudTexture = new THREE.DataTexture(map.data, map.size, map.size, THREE.RedFormat, THREE.UnsignedByteType);
      cloudTexture.magFilter = THREE.LinearFilter;
      cloudTexture.minFilter = THREE.LinearFilter;
      cloudTexture.wrapS = THREE.RepeatWrapping;
      cloudTexture.wrapT = THREE.RepeatWrapping;
      cloudTexture.generateMipmaps = false;
      cloudTexture.needsUpdate = true;
      span = map.span;
      uniforms.uCloudShade!.value = cloudTexture;
      uniforms.uCloudSpan!.value = map.span;
      uniforms.uCloudLayer!.value = map.layer;
    },

    setSun(next) {
      sun = { x: next.x, y: next.y, z: next.z };
      (uniforms.uShadeSun!.value as THREE.Vector3).set(next.x, next.y, next.z);
      reshade();
    },

    setTime(seconds) {
      // Brought back into the square, so the shader's numbers stay small however long the clock runs.
      const wrap = (value: number): number => ((value % span) + span) % span;
      (uniforms.uCloudShift!.value as THREE.Vector2).set(wrap(drift.x * seconds), wrap(drift.z * seconds));
    },

    setOn(next) {
      on = next;
      uniforms.uShadeOn!.value = next ? 1 : 0;
    },

    setCloudsOn(next) {
      uniforms.uCloudOn!.value = next ? 1 : 0;
    },

    shaded() {
      return on ? shadedShare : 0;
    },

    patch(material) {
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = swap(shader.vertexShader, '#include <common>', '#include <common>\nvarying vec3 vShadeWorld;');
        shader.vertexShader = swap(
          shader.vertexShader,
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 shadeWorld = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            shadeWorld = instanceMatrix * shadeWorld;
          #endif
          vShadeWorld = ( modelMatrix * shadeWorld ).xyz;`,
        );
        shader.fragmentShader = swap(shader.fragmentShader, '#include <common>', `#include <common>\nvarying vec3 vShadeWorld;\n${glsl}`);
        let lights = THREE.ShaderChunk.lights_fragment_begin;
        let found = 0;
        for (const line of SUN_LINES) {
          if (!lights.includes(line)) continue;
          lights = lights.replace(line, `${line}\n\t\tdirectLight.color *= sunShade( vShadeWorld );`);
          found++;
        }
        if (found === 0) throw new Error('Shadows: Three.js no longer reads a directional light where expected');
        shader.fragmentShader = swap(shader.fragmentShader, '#include <lights_fragment_begin>', lights);
      };
      // Every patched material shares this text; Three.js tells programs apart by this key and the material's own settings.
      material.customProgramCacheKey = () => 'sun-shade';
      material.needsUpdate = true;
    },

    dispose() {
      if (landTexture !== blankLand) landTexture.dispose();
      if (cloudTexture !== blankClouds) cloudTexture.dispose();
      blankLand.dispose();
      blankClouds.dispose();
    },
  };
}
