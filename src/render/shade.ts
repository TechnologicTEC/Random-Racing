import type { ShadowConfig } from '../config';

const float = (value: number): string => (Number.isInteger(value) ? `${value}.0` : String(value));

/**
 * The shadows of the land and the clouds as shader text, shared by every
 * material that the sun lights. `sunShade(world)` is the share of the sun's
 * light (0 to 1) that reaches a point in the world: the same sums as
 * `landLightAt` (`terrainShade.ts`) times `cloudLightAt` (`cloudShade.ts`).
 *
 * The land's map is a one-channel float texture read cell by cell (like the
 * water's depths); the clouds' map is a one-channel byte texture that wraps
 * round and is blended by the graphics card.
 */
export function shadeGlsl(cfg: ShadowConfig): string {
  return /* glsl */ `
    uniform sampler2D uLandTop;
    uniform float uLandSize, uLandOrigin, uLandCell, uLandSoft;
    uniform sampler2D uCloudShade;
    uniform float uCloudSpan, uCloudLayer, uCloudFade, uCloudOn;
    uniform vec2 uCloudShift;
    uniform vec3 uShadeSun;
    uniform float uShadeOn;
    float landTopAt(vec2 cell) {
      return texture2D(uLandTop, (cell + 0.5) / uLandSize).r;
    }
    float landLight(vec3 world) {
      float last = uLandSize - 1.0;
      vec2 g = (world.xz - uLandOrigin) / uLandCell;
      if (g.x < 0.0 || g.y < 0.0 || g.x > last || g.y > last) return 1.0;
      vec2 i = min(vec2(last - 1.0), floor(g));
      vec2 f = g - i;
      float nearRow = mix(landTopAt(i), landTopAt(i + vec2(1.0, 0.0)), f.x);
      float farRow = mix(landTopAt(i + vec2(0.0, 1.0)), landTopAt(i + vec2(1.0, 1.0)), f.x);
      float top = mix(nearRow, farRow, f.y);
      return smoothstep(top - uLandSoft, top, world.y + ${float(cfg.land.bias)});
    }
    float cloudLight(vec3 world) {
      float mid = 0.5 * uCloudSpan;
      // Up the sun's ray to the clouds' layer.
      vec2 at = world.xz + uShadeSun.xz * (max(uCloudLayer - world.y, 0.0) / max(uShadeSun.y, 0.05));
      // A cloud near the edge of its square has shrunk away, and so has its shadow.
      vec2 inSquare = mod(at + mid, uCloudSpan) - mid;
      float grown = smoothstep(0.0, 1.0, clamp((mid - max(abs(inSquare.x), abs(inSquare.y))) / uCloudFade, 0.0, 1.0));
      // uCloudShift is the drift so far, already brought back into the square.
      float cover = texture2D(uCloudShade, (at - uCloudShift + mid) / uCloudSpan).r;
      return 1.0 - ${float(cfg.clouds.strength)} * cover * grown * uCloudOn;
    }
    // The light from the sky left in a shadow: a shadow that keeps the sun off a point keeps this share of the sky off it too.
    float skyShade(float sunLit) {
      return 1.0 - ${float(cfg.skyShare)} * (1.0 - sunLit);
    }
    float sunShade(vec3 world) {
      if (uShadeOn < 0.5) return 1.0;
      return landLight(world) * cloudLight(world);
    }
  `;
}
