import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MeshBuilder } from '../gen/road/meshBuilder';
import { ROAD_MATERIAL } from '../gen/road/ribbon';
import { createRoadMesh } from './road';

describe('createRoadMesh', () => {
  it('leaves out the road under a wooden deck, whose planks are drawn there instead (M6.1c)', () => {
    const builder = new MeshBuilder();
    const corner = (x: number, z: number) => ({ x, y: 0, z });
    builder.quad(corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1), ROAD_MATERIAL.asphalt);
    builder.quad(corner(0, 1), corner(1, 1), corner(0, 2), corner(1, 2), ROAD_MATERIAL.deckUnder);
    builder.quad(corner(0, 2), corner(1, 2), corner(0, 3), corner(1, 3), ROAD_MATERIAL.line);
    const mesh = createRoadMesh(builder.build(), new THREE.MeshBasicMaterial());
    const index = [...mesh.geometry.getIndex()!.array];
    expect(index).toEqual([0, 1, 2, 2, 1, 3, 8, 9, 10, 10, 9, 11]);
  });
});
