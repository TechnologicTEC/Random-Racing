import * as THREE from 'three';
import type { MeshData } from '../gen/types';
import { roadColours } from './roadColours';

/**
 * Wraps a road mesh from generation in something Three.js can draw. The
 * shapes come from generation; only the colours are chosen here.
 */
export function createRoadMesh(data: MeshData, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(roadColours(data.materials), 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();
  return new THREE.Mesh(geometry, material);
}

/** The one material every part of the road shares: flat-shaded, coloured per vertex. */
export function createRoadMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
}
