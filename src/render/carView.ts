import * as THREE from 'three';
import type { KartViewConfig } from '../config';
import { kartBody, kartWheel, type KartPose } from './carShape';
import type { Sprite, SpriteKind } from './driftEffects';
import { GHOST } from './palette';
import type { Shape } from './treeShapes';

/** The layer the bloom draws (`worldView.ts`): the glowing effects, and the kart so that it hides what is behind it. */
export const BLOOM_LAYER = 2;

/** The pictures the sprites are drawn with, one a kind (`effectTextures.ts`). */
export type EffectTextures = Record<SpriteKind, THREE.Texture>;

/** The kart in the 3D picture. Its shapes and where they go come as plain numbers (`carShape.ts`); this only wraps them for Three.js. */
export interface CarView {
  /** Everything it draws. */
  object: THREE.Group;
  /** Puts the kart and its wheels where the pose says, with the drift's effects, or hides it for null. */
  set(pose: KartPose | null): void;
  /** The sprites' pictures, once they have loaded; until then each is a soft dot. */
  setTextures(textures: EffectTextures): void;
  /** The light the smoke is seen in (linear, 0 to 1 a channel): the smoke is not lit by the sun's shader, so it is told. */
  setLight(colour: THREE.Color): void;
  /**
   * Readies it for the bloom's own picture, or back for the screen: there the kart is drawn into depth only, so it hides
   * what is behind it, and the glowing effects as bright as they are.
   */
  setForBloom(on: boolean): void;
  /** Whether any glowing effect is shown now: with none, the bloom has nothing to do. */
  glowing(): boolean;
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
const KINDS: SpriteKind[] = ['streak', 'star', 'glow', 'flame', 'smoke'];

const VERTEX = /* glsl */ `
attribute vec3 centre;
attribute vec2 corner;
attribute vec3 axis;
attribute vec2 size;
attribute vec4 tint;
attribute float round;
varying vec2 vUv;
varying vec4 vTint;
void main() {
  vec4 middle = modelViewMatrix * vec4(centre, 1.0);
  // The axis as seen: a sprite stretched along it lies along it on the picture, foreshortened as it points at the
  // camera (a jet seen from straight behind is round); one with no axis stands upright.
  vec2 along = (modelViewMatrix * vec4(axis, 0.0)).xy;
  // Never the root of nothing, nor a division by it: some drivers take a square root as x times one over its root,
  // which is not a number at 0 and spoils the whole sprite. A round sprite (no axis) is turned straight up.
  vec2 a = normalize(along + vec2(0.0, round + 1e-3));
  // To the right of the axis as seen, so a sprite is never drawn mirrored.
  vec2 s = vec2(a.y, -a.x);
  float seen = sqrt(dot(along, along) + 1e-4);
  float stretch = mix(max(size.y * seen, size.x), size.y, round);
  middle.xy += s * corner.x * size.x + a * corner.y * stretch;
  gl_Position = projectionMatrix * middle;
  vUv = corner * 0.5 + 0.5;
  vTint = tint;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec3 light;
uniform float bright;
varying vec2 vUv;
varying vec4 vTint;
void main() {
  float mask = texture2D(map, vUv).a;
  gl_FragColor = vec4(vTint.rgb * light * bright, mask * vTint.a);
  #include <colorspace_fragment>
}
`;

/** A soft round dot, for a sprite whose picture has not loaded yet. */
function softDot(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * Math.max(0, 1 - r) ** 2);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

/** One kind of sprite: four corners a sprite, rewritten each step; the buffers grow if a pose ever brings more. */
interface SpriteMesh {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** Draws the glowing effects as bright as they are, for the bloom's picture, or in their own colour, for the screen. */
  setForBloom(on: boolean): void;
  fill(list: Sprite[]): void;
  dispose(): void;
}

function spriteMesh(kind: SpriteKind, map: THREE.Texture, glow: number): SpriteMesh {
  const glows = kind !== 'smoke';
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    // The glowing effects come brighter than the screen can show (\`sparks.glow\`): drawn as they are for the bloom, and
    // brought back to their own colour on the screen, so a tier reads blue, orange or purple, not white.
    uniforms: { map: { value: map }, light: { value: new THREE.Color(1, 1, 1) }, bright: { value: glows ? 1 / glow : 1 } },
    transparent: true,
    depthWrite: false,
    // Seen from either side: a sprite turned past its axis must not be culled as a back face.
    side: THREE.DoubleSide,
    // Sparks, burst, glows and flame are light added to what is behind them; the smoke is see-through.
    blending: glows ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const geometry = new THREE.BufferGeometry();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // Drawn after the kart and the world, smoke first, so the glowing effects lie over it.
  mesh.renderOrder = glows ? 2 : 1;
  if (glows) mesh.layers.enable(BLOOM_LAYER);
  let room = 0;
  const grow = (count: number): void => {
    room = Math.max(count, room * 2, 16);
    const attribute = (size: number) => new THREE.BufferAttribute(new Float32Array(room * 4 * size), size);
    geometry.setAttribute('centre', attribute(3));
    geometry.setAttribute('axis', attribute(3));
    geometry.setAttribute('size', attribute(2));
    geometry.setAttribute('tint', attribute(4));
    geometry.setAttribute('round', attribute(1));
    const corners = new Float32Array(room * 8);
    const index = new Uint32Array(room * 6);
    for (let k = 0; k < room; k++) {
      corners.set([-1, -1, 1, -1, 1, 1, -1, 1], k * 8);
      index.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
    }
    geometry.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
    // Three.js wants a position to know how many corners there are; the shader places them from `centre` and `corner`.
    geometry.setAttribute('position', attribute(3));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
  };
  return {
    mesh,
    material,
    setForBloom(on) {
      if (glows) material.uniforms['bright']!.value = on ? 1 : 1 / glow;
    },
    fill(list) {
      mesh.visible = list.length > 0;
      if (list.length === 0) return;
      if (list.length > room) grow(list.length);
      const centre = geometry.getAttribute('centre') as THREE.BufferAttribute;
      const axis = geometry.getAttribute('axis') as THREE.BufferAttribute;
      const size = geometry.getAttribute('size') as THREE.BufferAttribute;
      const tint = geometry.getAttribute('tint') as THREE.BufferAttribute;
      const round = geometry.getAttribute('round') as THREE.BufferAttribute;
      list.forEach((sprite, k) => {
        for (let c = 0; c < 4; c++) {
          const v = k * 4 + c;
          centre.setXYZ(v, sprite.at.x, sprite.at.y, sprite.at.z);
          axis.setXYZ(v, sprite.axis.x, sprite.axis.y, sprite.axis.z);
          size.setXY(v, sprite.width, sprite.length);
          tint.setXYZW(v, sprite.colour[0], sprite.colour[1], sprite.colour[2], sprite.alpha);
          round.setX(v, sprite.axis.x === 0 && sprite.axis.y === 0 && sprite.axis.z === 0 ? 1 : 0);
        }
      });
      for (const attribute of [centre, axis, size, tint, round]) attribute.needsUpdate = true;
      geometry.setDrawRange(0, list.length * 6);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Builds the kart: one body and four wheels sharing one shape, lit by the same
 * sun and sky as everything else and taking the shadows of trees, walls, land
 * and clouds (docs/VISUAL_BAR.md). The drift's effects are sprites (Tane, 6h-5):
 * the sparks, burst, glows and flame are light added to the picture, bright
 * enough for the bloom to spread; the smoke is see-through, in the world's
 * light. Nothing here casts a shadow (Tane, check-in 1).
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

  const lit = (geometry: THREE.BufferGeometry): THREE.Mesh => {
    const made = new THREE.Mesh(geometry, material);
    // The car casts no shadow of its own (Tane, check-in 1: it was distracting to drive behind), so it stays off the
    // casters' layer the sun's shadow maps draw. It still takes the shadows of trees, walls and the gate.
    made.castShadow = false;
    made.receiveShadow = true;
    // In the bloom's picture it hides the effects behind it.
    made.layers.enable(BLOOM_LAYER);
    return made;
  };
  const body = lit(bodyGeometry);
  object.add(body);
  const wheels = [0, 1, 2, 3].map(() => {
    const wheel = lit(wheelGeometry);
    object.add(wheel);
    return wheel;
  });

  const dot = softDot();
  const sprites = Object.fromEntries(KINDS.map((kind) => [kind, spriteMesh(kind, dot, look.sparks.glow)])) as Record<SpriteKind, SpriteMesh>;
  for (const kind of KINDS) object.add(sprites[kind].mesh);

  return {
    object,
    set(pose) {
      object.visible = pose !== null;
      if (!pose) return;
      object.position.set(pose.position.x, pose.position.y, pose.position.z);
      object.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
      // The body leans and squashes on its springs; the wheels stay on the road.
      body.rotation.set(0, 0, pose.lean);
      body.scale.set(1, pose.squash, 1);
      pose.wheels.forEach((place, i) => {
        const wheel = wheels[i]!;
        wheel.position.set(place.at.x, place.at.y, place.at.z);
        // The shape's hub faces +x: the left-hand wheels (0 and 2) are turned half round so theirs faces out.
        wheel.quaternion.setFromAxisAngle(UP, place.turn + (i % 2 === 0 ? Math.PI : 0));
      });
      const byKind: Record<SpriteKind, Sprite[]> = { streak: [], star: [], glow: [], flame: [], smoke: [] };
      for (const sprite of pose.sprites) byKind[sprite.kind].push(sprite);
      for (const kind of KINDS) sprites[kind].fill(byKind[kind]);
    },
    setTextures(textures) {
      for (const kind of KINDS) sprites[kind].material.uniforms['map']!.value = textures[kind];
    },
    setLight(colour) {
      (sprites.smoke.material.uniforms['light']!.value as THREE.Color).copy(colour);
    },
    setForBloom(on) {
      material.colorWrite = !on;
      for (const kind of KINDS) sprites[kind].setForBloom(on);
    },
    glowing() {
      return object.visible && KINDS.some((kind) => kind !== 'smoke' && sprites[kind].mesh.visible);
    },
    dispose() {
      bodyGeometry.dispose();
      wheelGeometry.dispose();
      for (const kind of KINDS) sprites[kind].dispose();
      dot.dispose();
      material.dispose();
    },
  };
}

/** A ghost in the 3D picture (M5.3): the kart's own shapes in see-through white, with none of the drift's effects. */
export interface GhostView {
  object: THREE.Group;
  /** Puts the ghost where the pose says (`ghostPose`), drawn `opacity` solid (0 to 1), or hides it for null. */
  set(pose: KartPose | null, opacity: number): void;
  dispose(): void;
}

/**
 * The ghost: the same kart as `createCarView`, in see-through white (`GHOST`; Tane at the check-in after M5.4: it was the
 * kart's own colours, which read as a faded copy of the car). It casts no shadow and takes none
 * (a shadow on a see-through body reads as a dirty patch), is left out of the bloom's picture, and is never hit: it is
 * only drawn. Its depth is written, so its own far side does not show through its near side.
 *
 * @param prepare called with its material, so it is lit by the clouds' shade as the kart is
 */
export function createGhostView(look: KartViewConfig, prepare?: (material: THREE.Material) => void): GhostView {
  // Half lit by itself, so it reads white in any light of day, its facets still shaded by the sun.
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...GHOST),
    emissive: new THREE.Color(...GHOST),
    emissiveIntensity: 0.5,
    flatShading: true,
    roughness: 0.85,
    metalness: 0,
    transparent: true,
    depthWrite: true,
  });
  prepare?.(material);
  const bodyGeometry = toGeometry(kartBody());
  const wheelGeometry = toGeometry(kartWheel(look));
  const object = new THREE.Group();
  object.visible = false;
  const part = (geometry: THREE.BufferGeometry): THREE.Mesh => {
    const made = new THREE.Mesh(geometry, material);
    made.castShadow = false;
    made.receiveShadow = false;
    object.add(made);
    return made;
  };
  part(bodyGeometry);
  const wheels = [0, 1, 2, 3].map(() => part(wheelGeometry));
  return {
    object,
    set(pose, opacity) {
      object.visible = pose !== null && opacity > 0;
      if (!pose) return;
      material.opacity = opacity;
      object.position.set(pose.position.x, pose.position.y, pose.position.z);
      object.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
      pose.wheels.forEach((place, i) => {
        const wheel = wheels[i]!;
        wheel.position.set(place.at.x, place.at.y, place.at.z);
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
