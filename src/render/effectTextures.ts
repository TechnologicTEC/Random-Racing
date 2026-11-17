import * as THREE from 'three';
import type { EffectTextures } from './carView';
import type { SpriteKind } from './driftEffects';

/** The picture each kind of sprite is drawn with, in `public/effects/` (CC0, Kenney's Particle Pack; see its LICENSE.md). */
export const EFFECT_FILES: Record<SpriteKind, string> = {
  streak: 'trace_01.png',
  star: 'star_06.png',
  glow: 'circle_05.png',
  flame: 'muzzle_04.png',
  smoke: 'smoke_06.png',
};

/**
 * Loads the effect pictures (6h-5, Tane: sprites and bloom). The flame's picture
 * stands upright with its base at the bottom, which is how the sprite shader
 * lays a jet along its axis, base at the exhaust.
 *
 * @param base where the site is served from (`import.meta.env.BASE_URL`)
 */
export async function loadEffectTextures(base: string): Promise<EffectTextures> {
  const loader = new THREE.TextureLoader();
  const kinds = Object.keys(EFFECT_FILES) as SpriteKind[];
  const loaded = await Promise.all(kinds.map((kind) => loader.loadAsync(`${base}effects/${EFFECT_FILES[kind]}`)));
  const textures = {} as EffectTextures;
  kinds.forEach((kind, i) => {
    const texture = loaded[i]!;
    // Only the alpha is read: the shapes are white on transparency.
    texture.colorSpace = THREE.NoColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    textures[kind] = texture;
  });
  return textures;
}
