import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { shadeGlsl } from './shade';

const cfg = config.render.shadows;
const text = shadeGlsl(cfg);
// Comments may use any word; only the code itself has to compile.
const code = text.replace(/\/\/[^\n]*/g, '');

describe('shadeGlsl: the shadows of the land and the clouds, as shader text every material shares', () => {
  it('gives every material one function for the share of the sun reaching a point in the world', () => {
    expect(code).toMatch(/float\s+sunShade\s*\(\s*vec3\s+\w+\s*\)/);
  });

  it('reads the land s shadow and the clouds shadow from their own maps, and can be switched off', () => {
    for (const name of ['uLandTop', 'uLandSize', 'uLandOrigin', 'uLandCell', 'uLandSoft', 'uCloudShade', 'uCloudSpan', 'uCloudLayer', 'uCloudShift', 'uCloudFade', 'uShadeSun', 'uShadeOn']) {
      expect(code).toContain(name);
    }
  });

  it('carries the settings it was written from', () => {
    const number = (value: number): string => (Number.isInteger(value) ? `${value}.0` : String(value));
    expect(code).toContain(number(cfg.land.bias));
    expect(code).toContain(number(cfg.clouds.strength));
    const other = shadeGlsl({ ...cfg, land: { ...cfg.land, bias: 0.123 }, clouds: { ...cfg.clouds, strength: 0.456 } });
    expect(other).toContain('0.123');
    expect(other).toContain('0.456');
  });

  it('uses no word the shader language keeps for itself (a shader that fails to compile draws nothing)', () => {
    const reserved = [
      'patch', 'sample', 'half', 'input', 'output', 'filter', 'flat', 'common', 'active', 'fixed', 'long', 'short', 'double',
      'packed', 'inline', 'noinline', 'static', 'public', 'class', 'union', 'enum', 'this', 'using', 'cast', 'namespace',
      'extern', 'external', 'interface', 'resource', 'goto', 'template', 'typedef', 'unsigned', 'superp', 'sizeof',
      'volatile', 'partition', 'asm', 'smooth', 'centroid', 'layout', 'precise',
    ];
    for (const word of reserved) expect(code).not.toMatch(new RegExp(`\\b${word}\\b`));
  });
});
