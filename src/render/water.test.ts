import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { createWater } from './water';

describe('createWater', () => {
  it('draws the sea as a plane at 0 with full waves', () => {
    const sea = createWater(1000, config.render.water);
    expect(sea.mesh.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    const uniforms = (sea.mesh.material as THREE.ShaderMaterial).uniforms;
    expect(uniforms.uLevel!.value).toBe(0);
    expect(uniforms.uWaves!.value).toBe(1);
    sea.dispose();
  });

  it('draws a hill river’s still water in its own shape at its level, its waves calmed (M6.1d-3)', () => {
    const shape = new THREE.BufferGeometry();
    shape.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 30, 0, 0, 30, 3, 3, 30, 0]), 3));
    const lake = createWater(0, config.render.water, undefined, { geometry: shape, level: 30 });
    expect(lake.mesh.geometry).toBe(shape);
    const uniforms = (lake.mesh.material as THREE.ShaderMaterial).uniforms;
    expect(uniforms.uLevel!.value).toBe(30);
    expect(uniforms.uWaves!.value).toBe(config.render.water.stillWaves);
    expect(config.render.water.stillWaves).toBeLessThan(1);
    lake.dispose();
  });

  it('fades the sun s glints seen from high up, not from the road (M6.3e)', () => {
    const { glintHigh } = config.render.water;
    // From the chase camera, a few metres up, nothing changes; from the circling camera the glare is fainter.
    expect(glintHigh.from).toBeGreaterThan(30);
    expect(glintHigh.to).toBeGreaterThan(glintHigh.from);
    expect(glintHigh.strength).toBeLessThan(1);
    const text = (water: ReturnType<typeof createWater>): string => (water.mesh.material as THREE.ShaderMaterial).fragmentShader;
    const sea = createWater(1000, config.render.water);
    expect(text(sea)).toContain(`smoothstep(${glintHigh.from}.0, ${glintHigh.to}.0, cameraPosition.y - uLevel)`);
    const fainter = createWater(1000, { ...config.render.water, glintHigh: { ...glintHigh, strength: 0.123 } });
    expect(text(fainter)).toContain('0.123');
    sea.dispose();
    fainter.dispose();
  });
});
