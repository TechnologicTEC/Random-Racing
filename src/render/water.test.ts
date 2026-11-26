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
});
