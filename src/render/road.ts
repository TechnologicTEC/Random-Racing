import * as THREE from 'three';
import { ROAD_MATERIAL } from '../gen/road/ribbon';
import type { MeshData } from '../gen/types';
import { roadColours } from './roadColours';

/**
 * Wraps a road mesh from generation in something Three.js can draw. The
 * shapes come from generation; only the colours are chosen here. The road
 * under a wooden deck (`ROAD_MATERIAL.deckUnder`, M6.1c) is left out: its
 * planks are drawn there by the bridge's mesh, and the car still drives on it.
 */
export function createRoadMesh(data: MeshData, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(roadColours(data.materials), 3));
  geometry.setIndex(new THREE.BufferAttribute(drawnIndices(data), 1));
  geometry.computeBoundingSphere();
  return new THREE.Mesh(geometry, material);
}

/** The one material every part of the road shares: flat-shaded, coloured per vertex. */
export function createRoadMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
}

/** The mesh's triangles less those under a wooden deck, which are never drawn. The same array when there are none. */
function drawnIndices(data: MeshData): Uint32Array {
  const { indices, materials } = data;
  let hidden = 0;
  for (let t = 0; t < indices.length; t += 3) if (materials[indices[t]!] === ROAD_MATERIAL.deckUnder) hidden++;
  if (hidden === 0) return indices;
  const kept = new Uint32Array(indices.length - hidden * 3);
  let k = 0;
  for (let t = 0; t < indices.length; t += 3) {
    if (materials[indices[t]!] === ROAD_MATERIAL.deckUnder) continue;
    kept[k++] = indices[t]!;
    kept[k++] = indices[t + 1]!;
    kept[k++] = indices[t + 2]!;
  }
  return kept;
}
